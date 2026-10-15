// Drafts the report summary for each template with the Claude CLI, runs
// scripts/check-narrative.mjs on every draft, and redrafts until it passes.
// Writes data/narratives.json. Needs the claude CLI and a logged-in account.
// Usage: node data/draft-narrative.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkNarrative, loadContext } from '../scripts/check-narrative.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const MAX_ATTEMPTS = 4;
const DRAFTED_ON = '2026-10-15';
const PROMPT_FILE = 'data/prompts/narrative.md';
const SYSTEM = 'You write short, plain, factual report text. You follow every formatting rule exactly.';

const ctx = loadContext();
const promptTemplate = readFileSync(join(HERE, 'prompts', 'narrative.md'), 'utf8');

function sectionsText(t) {
  return t.sections.map((s) => s.title).join(', ');
}

function slotsText(t) {
  return Object.entries(t.slots).map(([k, v]) => `- {${k}}: ${v.meaning}`).join('\n');
}

function ask(prompt) {
  const r = spawnSync('claude', ['-p', '--model', MODEL, '--effort', 'high', '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM], {
    input: prompt,
    encoding: 'utf8',
    cwd: tmpdir(), // keep project instructions out of the model's context
    timeout: 300000,
  });
  if (r.status !== 0) throw new Error(`claude CLI failed: ${r.stderr || r.error}`);
  return r.stdout.trim();
}

const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim();
const narratives = [];
for (const t of ctx.figures.templates) {
  const base = promptTemplate
    .replace('{{template_name}}', t.name)
    .replace('{{sections}}', sectionsText(t))
    .replace('{{slots}}', slotsText(t));
  let prompt = base;
  let text = null;
  let attempts = 0;
  const rejected = [];
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const draft = ask(prompt);
    const errs = checkNarrative(t.id, draft, ctx);
    console.log(`\n[${t.id}] attempt ${attempts}:\n${draft}\n${errs.length ? 'FAIL: ' + errs.join('; ') : 'passed'}`);
    if (!errs.length) { text = draft; break; }
    rejected.push({ draft, problems: errs });
    prompt = `${base}\n\nYour previous draft was:\n\n${draft}\n\nIt broke these rules: ${errs.join('; ')}. Write a new paragraph that keeps every rule.`;
  }
  if (text === null) {
    console.error(`[${t.id}] no draft passed after ${MAX_ATTEMPTS} attempts`);
    process.exit(1);
  }
  narratives.push({
    template_id: t.id,
    template_name: t.name,
    text,
    model: MODEL,
    cli: version,
    drafted_on: DRAFTED_ON,
    prompt_file: PROMPT_FILE,
    attempts,
    rejected_drafts: rejected,
    check: 'scripts/check-narrative.mjs passed',
  });
}

const out = {
  mock: true,
  note: 'Summary paragraphs drafted by Claude with numbered slots. The report engine fills every slot; the model typed no numbers.',
  label: 'Summary drafted by AI (Claude) from the figures above. Every number is filled in by the report engine.',
  narratives,
};
writeFileSync(join(HERE, 'narratives.json'), JSON.stringify(out, null, 2) + '\n');
console.log('\nnarratives.json written.');
