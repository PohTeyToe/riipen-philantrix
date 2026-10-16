// The form-mapping agent. Reads a funder's published reporting form, lists
// its questions, maps each field to the program's records with parallel
// workers that call the report engine's tools, checks every answer with code,
// has a second model review each mapping, and sends rejected fields back
// once. Fields only a person can answer are left for staff. Every model call,
// tool call and check is timed and saved, so the page can replay the run.
//
// Needs the claude CLI, logged in. Runs locally only: the site replays the
// saved runs and never calls a model.
//
// Usage: npm run agent:build && node agent/run.mjs [form-id ...]
//        (no ids: every form in agent/forms/forms.json)

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as engine from './.build/engine.js';
import { checkExtraction, checkItem, findQuote } from '../scripts/form-rules.mjs';
import { COMPARISON_WORDS, NUMBER_WORDS, STALE_WORDS } from '../scripts/narrative-rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MODEL = 'claude-opus-5-5';
const EFFORT = 'medium';
const WORKERS = 5;
const BATCH_FIELDS = 12;
const OUT_DIR = join(ROOT, 'data', 'agent-runs');

const read = (f) => readFileSync(join(HERE, f), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const PROMPTS = Object.fromEntries(['system', 'extract', 'map', 'review'].map((n) => [n, read(`prompts/${n}.md`)]));
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
const FIRST_NAMES = [...new Set(JSON.parse(readFileSync(join(ROOT, 'data', 'participants.json'), 'utf8')).map((p) => p.display_name.split(' ')[0]))];
const CTX = { metrics: engine.listMetrics(), ageRanges: engine.AGE_RANGES, firstNames: FIRST_NAMES };

const BANNED = [...NUMBER_WORDS, ...COMPARISON_WORDS, ...STALE_WORDS].join(', ');
const TOOL_NAMES = ['list_metrics', 'describe_records', 'get_metric', 'count_by_age'];
const MCP = JSON.stringify({ mcpServers: { records: { command: process.execPath, args: [join(HERE, 'tools-server.mjs')] } } });

// ---------- schemas ----------

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          number: { type: ['string', 'null'] },
          title: { type: 'string' },
          quote: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                quote: { type: 'string' },
                wants: { type: 'string', enum: ['count', 'percent', 'hours', 'money', 'text', 'choice', 'date'] },
              },
              required: ['id', 'label', 'quote', 'wants'],
            },
          },
        },
        required: ['id', 'number', 'title', 'quote', 'fields'],
      },
    },
  },
  required: ['items'],
};

const MAP_SCHEMA = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field_id: { type: 'string' },
          answer: { type: 'string', enum: ['metric', 'formula', 'draft', 'ask', 'missing'] },
          metric: { type: ['string', 'null'] },
          age_range: { type: ['string', 'null'] },
          formula: {
            type: ['object', 'null'],
            properties: { op: { type: 'string', enum: ['percent', 'difference', 'sum'] }, of: { type: 'array', items: { type: 'string' } } },
            required: ['op', 'of'],
          },
          text: { type: ['string', 'null'] },
          ask: { type: ['string', 'null'] },
          missing: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
        required: ['field_id', 'answer', 'reason'],
      },
    },
  },
  required: ['fields'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field_id: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, reason: { type: 'string' } },
        required: ['field_id', 'verdict', 'reason'],
      },
    },
  },
  required: ['reviews'],
};

// ---------- the run log ----------

function makeRun(form) {
  const t0 = performance.now();
  const events = [];
  let seq = 0;
  const now = () => Math.round(performance.now() - t0);
  return {
    t0,
    events,
    now,
    begin(lane, kind, label, detail = {}) {
      const ev = { id: `e${++seq}`, lane, kind, label, start: now(), end: null, status: 'running', detail };
      events.push(ev);
      return ev;
    },
    end(ev, status, detail = {}) {
      ev.end = now();
      ev.status = status;
      Object.assign(ev.detail, detail);
      return ev;
    },
    /** A check runs in code and takes microseconds: logged with its own timing. */
    check(lane, label, fn, detail = {}) {
      const ev = this.begin(lane, 'check', label, { ...detail });
      const a = performance.now();
      const problems = fn();
      const micros = Math.round((performance.now() - a) * 1000);
      this.end(ev, problems.length ? 'fail' : 'pass', { problems, micros });
      return problems;
    },
    form,
  };
}

// ---------- one model call ----------

const clip = (s, n = 900) => (s.length > n ? `${s.slice(0, n)}…` : s);

function callClaude(run, { lane, label, prompt, schema, tools, parent, items }) {
  const args = [
    '-p',
    '--model', MODEL,
    '--effort', EFFORT,
    '--setting-sources', '',
    '--tools', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
    '--system-prompt', PROMPTS.system,
    '--json-schema', JSON.stringify(schema),
  ];
  if (tools) args.push('--mcp-config', MCP, '--allowedTools', TOOL_NAMES.map((t) => `mcp__records__${t}`).join(','));
  const ev = run.begin(lane, 'llm', label, { model: MODEL, effort: EFFORT, parent: parent ?? null, prompt_chars: prompt.length, ...(items ? { items } : {}) });
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    const open = new Map();
    let result = null;
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    createInterface({ input: child.stdout }).on('line', (line) => {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        return;
      }
      if (o.type === 'assistant') {
        for (const c of o.message?.content ?? []) {
          if (c.type === 'tool_use' && c.name.startsWith('mcp__records__')) {
            const t = run.begin(lane, 'tool', c.name.replace('mcp__records__', ''), { parent: ev.id, input: c.input });
            open.set(c.id, t);
          }
        }
      } else if (o.type === 'user') {
        for (const c of o.message?.content ?? []) {
          const t = c.type === 'tool_result' && open.get(c.tool_use_id);
          if (!t) continue;
          const text = Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join('') : String(c.content ?? '');
          run.end(t, c.is_error ? 'fail' : 'ok', { output: clip(text) });
          open.delete(c.tool_use_id);
        }
      } else if (o.type === 'result') {
        result = o;
      }
    });
    child.on('close', (code) => {
      if (!result || result.is_error || !result.structured_output) {
        run.end(ev, 'fail', { error: clip(stderr || result?.result || `exit ${code}`, 400) });
        reject(new Error(`${label}: ${stderr || result?.result || `exit ${code}`}`));
        return;
      }
      const u = result.usage ?? {};
      run.end(ev, 'ok', {
        tokens_in: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        tokens_out: u.output_tokens ?? 0,
        turns: result.num_turns,
        api_ms: result.duration_api_ms ?? null,
      });
      resolve(result.structured_output);
    });
    child.stdin.end(prompt);
  });
}

async function withRetry(run, opts) {
  try {
    return await callClaude(run, opts);
  } catch (e) {
    console.error(`  retrying ${opts.label}: ${e.message.slice(0, 200)}`);
    return callClaude(run, { ...opts, label: `${opts.label} (retry)` });
  }
}

/** Runs tasks on `size` workers. Each task gets the number of the worker that picked it up, so the log shows real concurrency. */
async function pool(tasks, size) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async (_, slot) => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i](slot + 1);
      }
    }),
  );
  return out;
}

// ---------- the steps ----------

async function extract(run, text) {
  const { form } = run;
  const prompt = fill(PROMPTS.extract, { title: form.title, funder: form.funder, text });
  let out = await withRetry(run, { lane: 'Read form', label: 'List the questions', prompt, schema: EXTRACT_SCHEMA, tools: false });
  let problems = run.check('Read form', 'Quotes are on the form', () => checkExtraction(out, text));
  if (problems.length) {
    const again = `${prompt}\n\nYour last list had these problems:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nList the questions again, fixing them. Quotes must be copied word for word from the form text.`;
    out = await withRetry(run, { lane: 'Read form', label: 'List the questions again', prompt: again, schema: EXTRACT_SCHEMA, tools: false });
    problems = run.check('Read form', 'Quotes are on the form', () => checkExtraction(out, text));
    if (problems.length) throw new Error(`extraction still failing: ${problems.join('; ')}`);
  }
  return out.items;
}

function batches(items) {
  const out = [];
  let cur = [];
  let n = 0;
  for (const item of items) {
    if (cur.length && n + item.fields.length > BATCH_FIELDS) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(item);
    n += item.fields.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const itemsJson = (items) => JSON.stringify(items.map((i) => ({ id: i.id, number: i.number, title: i.title, quote: i.quote, fields: i.fields.map((f) => ({ field_id: f.id, label: f.label, quote: f.quote, wants: f.wants })) })), null, 1);

function reviewJson(items, answers) {
  const rows = [];
  for (const item of items) {
    for (const f of item.fields) {
      const a = answers.get(f.id);
      if (!a || !['metric', 'formula', 'draft'].includes(a.answer)) continue;
      const m = a.metric ? CTX.metrics.find((x) => x.id === a.metric) : null;
      rows.push({
        field_id: f.id,
        form_question: item.quote,
        form_field: f.quote,
        wants: f.wants,
        answer: a.answer,
        ...(m ? { metric: m.id, metric_definition: `${m.definition} ${m.formula}`, age_range: a.age_range ?? null } : {}),
        ...(a.formula ? { formula: a.formula } : {}),
        ...(a.text ? { draft: a.text } : {}),
        mapper_reason: a.reason,
      });
    }
  }
  return rows;
}

/** One worker: map its questions, check in code, have them reviewed, and send rejects back once. */
async function worker(run, batch, slot) {
  const { form } = run;
  const lane = `Worker ${slot}`;
  const items = batch.map((i) => i.id);
  const answers = new Map();
  const history = new Map();
  const note = (fid, entry) => history.set(fid, [...(history.get(fid) ?? []), entry]);

  // only: when set, the answers this call may change (a remap must not touch fields that already passed review).
  const map = async (label, extra = '', only = null) => {
    const prompt = fill(PROMPTS.map, { title: form.title, funder: form.funder, items: itemsJson(batch), banned: BANNED }) + extra;
    const out = await withRetry(run, { lane, label, prompt, schema: MAP_SCHEMA, tools: true, items });
    for (const a of out.fields) {
      if (!batch.some((i) => i.fields.some((f) => f.id === a.field_id))) continue;
      if (only && !only.has(a.field_id)) continue;
      answers.set(a.field_id, a);
    }
  };
  const codeCheck = (label) =>
    run.check(lane, label, () => batch.flatMap((item) => checkItem(item, item.fields.map((f) => answers.get(f.id)).filter(Boolean), CTX)), { items });

  await map(`Map ${batch.map((i) => i.number ?? i.id).join(', ')}`);
  let problems = codeCheck('Checks: metrics, units, wording');
  if (problems.length) {
    for (const p of problems) note(p.split(':')[0], { step: 'check', problems: [p] });
    await map('Fix what the checks found', `\n\nYour last answers broke these rules:\n${problems.map((p) => `- ${p}`).join('\n')}\nAnswer every field again, fixing these.`);
    problems = codeCheck('Checks again');
    // Whatever still breaks a rule goes to a person rather than into the report.
    for (const p of problems) {
      const fid = p.split(':')[0];
      const a = answers.get(fid);
      if (a) answers.set(fid, { field_id: fid, answer: 'ask', ask: null, to_staff: 'rules', reason: p });
      note(fid, { step: 'check', problems: [p], outcome: 'sent to staff' });
    }
  }

  const toReview = reviewJson(batch, answers);
  if (!toReview.length) return { answers, history };
  const review = await withRetry(run, {
    lane,
    label: `Review ${toReview.length} ${toReview.length === 1 ? 'answer' : 'answers'}`,
    prompt: fill(PROMPTS.review, { title: form.title, funder: form.funder, fields: JSON.stringify(toReview, null, 1) }),
    schema: REVIEW_SCHEMA,
    tools: true,
    items,
  });
  const failed = review.reviews.filter((r) => r.verdict === 'fail' && answers.has(r.field_id));
  for (const r of review.reviews) note(r.field_id, { step: 'review', verdict: r.verdict, reason: r.reason });
  const gate = run.begin(lane, 'gate', failed.length ? `Reviewer rejected ${failed.length}` : 'Reviewer passed all', { rejected: failed.map((r) => r.field_id), items });
  run.end(gate, failed.length ? 'fail' : 'pass');
  if (!failed.length) return { answers, history };

  const before = new Map(failed.map((r) => [r.field_id, answers.get(r.field_id)]));
  await map(
    `Remap ${failed.length} rejected`,
    `\n\nA reviewer rejected these answers. Answer only these fields again, taking the reason into account. If no metric fits exactly, answer ask or missing.\n${failed.map((r) => `- ${r.field_id}: ${r.reason}`).join('\n')}`,
    new Set(before.keys()),
  );
  for (const [fid, prev] of before) if (answers.get(fid) === prev) answers.set(fid, { field_id: fid, answer: 'ask', ask: null, to_staff: 'review', reason: failed.find((r) => r.field_id === fid).reason });
  problems = codeCheck('Checks on the remap');
  for (const p of problems) {
    const fid = p.split(':')[0];
    answers.set(fid, { field_id: fid, answer: 'ask', ask: null, to_staff: 'rules', reason: p });
  }
  const again = reviewJson(batch, answers).filter((r) => before.has(r.field_id));
  if (again.length) {
    const second = await withRetry(run, {
      lane,
      label: `Review ${again.length} remapped`,
      prompt: fill(PROMPTS.review, { title: form.title, funder: form.funder, fields: JSON.stringify(again, null, 1) }),
      schema: REVIEW_SCHEMA,
      tools: true,
      items,
    });
    for (const r of second.reviews) {
      note(r.field_id, { step: 'review', verdict: r.verdict, reason: r.reason, round: 2 });
      if (r.verdict === 'fail' && answers.has(r.field_id)) {
        answers.set(r.field_id, { field_id: r.field_id, answer: 'ask', ask: null, to_staff: 'review', reason: r.reason });
      }
    }
    const g2 = run.begin(lane, 'gate', second.reviews.some((r) => r.verdict === 'fail') ? 'Rejected again: to staff' : 'Reviewer passed the remap', { items });
    run.end(g2, second.reviews.some((r) => r.verdict === 'fail') ? 'fail' : 'pass');
  }
  for (const [fid] of before) note(fid, { step: 'remap', answer: answers.get(fid)?.answer });
  return { answers, history };
}

async function runForm(form) {
  const text = read(`forms/${form.text}`);
  const run = makeRun(form);
  console.log(`\n${form.short}: reading the form (${text.length} characters)`);
  const readEv = run.begin('Read form', 'step', 'Read the form', { chars: text.length, sha: sha(text), url: form.url });
  run.end(readEv, 'ok');

  const items = await extract(run, text);
  const fieldCount = items.reduce((n, i) => n + i.fields.length, 0);
  console.log(`  ${items.length} questions, ${fieldCount} fields`);

  const groups = batches(items);
  const split = run.begin('Read form', 'step', `Split into ${groups.length} batches`, { batches: groups.map((b) => b.map((i) => i.id)) });
  run.end(split, 'ok');
  const results = await pool(groups.map((b) => (slot) => worker(run, b, slot)), WORKERS);

  const answers = new Map();
  const history = new Map();
  for (const r of results) {
    for (const [k, v] of r.answers) answers.set(k, v);
    for (const [k, v] of r.history) history.set(k, v);
  }

  const asm = run.begin('Assemble', 'step', 'Assemble the form');
  const final = items.map((item) => ({
    id: item.id,
    number: item.number,
    title: item.title,
    quote: item.quote,
    quote_match: findQuote(item.quote, text),
    fields: item.fields.map((f) => {
      const a = answers.get(f.id) ?? { answer: 'ask', ask: null, to_staff: 'unanswered', reason: 'No worker answered this field.' };
      return {
        id: f.id,
        label: f.label,
        quote: f.quote,
        quote_match: findQuote(f.quote, text),
        wants: f.wants,
        answer: a.answer,
        metric: a.answer === 'metric' ? a.metric : null,
        age_range: a.answer === 'metric' ? (a.age_range ?? null) : null,
        formula: a.answer === 'formula' ? a.formula : null,
        text: a.answer === 'draft' ? a.text : null,
        ask: a.answer === 'ask' || a.answer === 'draft' ? (a.ask ?? null) : null,
        to_staff: a.to_staff ?? null,
        missing: a.answer === 'missing' ? a.missing : null,
        reason: a.reason,
        history: history.get(f.id) ?? [],
      };
    }),
  }));
  const all = final.flatMap((i) => i.fields);
  const count = (t) => all.filter((f) => f.answer === t).length;
  run.end(asm, 'ok', { metric: count('metric'), formula: count('formula'), draft: count('draft'), ask: count('ask'), missing: count('missing') });
  const toStaff = run.begin('Assemble', 'gate', `${count('ask')} for a person`, { fields: all.filter((f) => f.answer === 'ask').map((f) => f.id) });
  run.end(toStaff, 'ok');

  const llm = run.events.filter((e) => e.kind === 'llm');
  return {
    form,
    recorded_on: new Date().toISOString().slice(0, 10),
    cli: spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim(),
    model: MODEL,
    effort: EFFORT,
    workers: WORKERS,
    prompts: Object.fromEntries(Object.entries(PROMPTS).map(([k, v]) => [k, `agent/prompts/${k}.md@${sha(v)}`])),
    form_sha: sha(text),
    form_text: text,
    duration_ms: run.now(),
    totals: {
      model_calls: llm.length,
      tool_calls: run.events.filter((e) => e.kind === 'tool').length,
      checks: run.events.filter((e) => e.kind === 'check').length,
      checks_failed: run.events.filter((e) => e.kind === 'check' && e.status === 'fail').length,
      tokens_in: llm.reduce((n, e) => n + (e.detail.tokens_in ?? 0), 0),
      tokens_out: llm.reduce((n, e) => n + (e.detail.tokens_out ?? 0), 0),
      questions: final.length,
      fields: all.length,
      metric: count('metric'),
      formula: count('formula'),
      draft: count('draft'),
      ask: count('ask'),
      missing: count('missing'),
    },
    events: run.events,
    items: final,
  };
}

const FORMS = JSON.parse(read('forms/forms.json')).forms;
const ids = process.argv.slice(2);
const chosen = ids.length ? FORMS.filter((f) => ids.includes(f.id)) : FORMS;
if (!chosen.length) {
  console.error(`no form matches ${ids.join(', ')}. Forms: ${FORMS.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
for (const form of chosen) {
  const out = await runForm(form);
  writeFileSync(join(OUT_DIR, `${form.id}.json`), JSON.stringify(out, null, 1) + '\n');
  const t = out.totals;
  console.log(`  done in ${(out.duration_ms / 1000).toFixed(1)} s: ${t.model_calls} model calls, ${t.tool_calls} tool calls, ${t.checks_failed}/${t.checks} checks failed`);
  console.log(`  fields: ${t.metric} metric, ${t.formula} formula, ${t.draft} draft, ${t.ask} ask, ${t.missing} missing`);
}
