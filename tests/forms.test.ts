// The recorded agent runs (data/agent-runs) and the forms they fill. The page
// replays these runs, so they must be what the agent really produced and
// still pass the checks it was held to. Then the forms must fill from the
// records with nothing a funder shouldn't see.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import formsJson from '../agent/forms/forms.json';
import { PERIODS, sample } from '../lib/data';
import { applyAnswers, detectFindings } from '../lib/findings';
import { fillForm, lanes, RUNS, type FilledForm, type FormRun } from '../lib/forms';
import { METRICS } from '../lib/metrics';
import { computePeriod } from '../lib/report';
import { checkExtraction, checkItem, locateQuote } from '../scripts/form-rules.mjs';

const ROOT = join(__dirname, '..');
const findings = detectFindings(sample);
const firstNames = [...new Set(sample.participants.map((p) => p.display_name.split(' ')[0]))];
const ctx = {
  metrics: Object.values(METRICS).map((m) => ({ id: m.id, kind: m.kind })),
  ageRanges: sample.ageRanges,
  firstNames,
};
const figures = (below = 5, period = PERIODS[0]) => computePeriod(sample, applyAnswers(sample, findings, {}, below), findings, period);

/** Everything a funder would read off a filled form, as text. */
function funderText(f: FilledForm): string {
  const out: string[] = [];
  for (const { item, fields } of f.items) {
    out.push(item.title, item.quote);
    for (const { view } of fields) {
      if (view.state === 'value' || view.state === 'withheld') out.push(view.display);
      if (view.state === 'draft') out.push(view.parts.map((p) => p.text).join(''));
    }
  }
  return out.join('\n');
}

describe.each(RUNS.map((r) => [r.form.id, r] as [string, FormRun]))('%s', (id, run) => {
  const source = readFileSync(join(ROOT, 'agent', 'forms', run.form.text), 'utf8');

  it('read the form that is in the repo, word for word', () => {
    expect(run.form_text).toBe(source);
    expect(createHash('sha256').update(source).digest('hex').slice(0, 12)).toBe(run.form_sha);
    const meta = formsJson.forms.find((f) => f.id === id)!;
    expect(run.form.url).toBe(meta.url);
  });

  it('quotes every question and field from the form', () => {
    expect(checkExtraction({ items: run.items }, source)).toEqual([]);
    for (const item of run.items) expect(locateQuote(item.quote, source), item.id).not.toBeNull();
  });

  it('still passes every check the agent was held to', () => {
    for (const item of run.items) {
      const answers = item.fields.map((f) => ({ field_id: f.id, ...f }));
      expect(checkItem(item, answers, ctx), item.id).toEqual([]);
    }
  });

  it('logs a run that adds up: every event inside the run, tools inside their model call', () => {
    for (const e of run.events) {
      expect(e.end, e.id).toBeGreaterThanOrEqual(e.start);
      expect(e.end, e.id).toBeLessThanOrEqual(run.duration_ms);
      if (e.kind === 'tool') {
        const parent = run.events.find((p) => p.id === e.detail.parent)!;
        expect(parent.kind).toBe('llm');
        expect(e.start).toBeGreaterThanOrEqual(parent.start);
        expect(e.end).toBeLessThanOrEqual(parent.end);
      }
    }
    expect(run.events.filter((e) => e.kind === 'llm').length).toBe(run.totals.model_calls);
    expect(run.events.filter((e) => e.kind === 'tool').length).toBe(run.totals.tool_calls);
    expect(lanes(run)[0].id).toBe('Read form');
  });

  it('never saw a name: no participant name anywhere in the run, tool output included', () => {
    // The check can fail: the same pattern finds a name in the staff-side records.
    expect(JSON.stringify(sample.participants)).toMatch(new RegExp(`\\b${firstNames[0]}\\b`));
    const all = JSON.stringify(run);
    for (const n of firstNames) expect(all, n).not.toMatch(new RegExp(`\\b${n}\\b`));
  });

  it('never shows a name, at any cutoff or period', () => {
    for (const below of [2, 5, 10]) {
      for (const period of PERIODS) {
        const text = funderText(fillForm(run, figures(below, period)));
        for (const n of firstNames) expect(text, `${below} ${period.id}`).not.toMatch(new RegExp(`\\b${n}\\b`));
      }
    }
  });

  it('never shows a count of people from 1 to the cutoff less one', () => {
    for (const below of [5, 10]) {
      for (const period of PERIODS) {
        const filled = fillForm(run, figures(below, period));
        for (const { fields } of filled.items) {
          for (const { field, view } of fields) {
            if (view.state !== 'value' || view.kind !== 'people') continue;
            if (view.value !== null && view.value >= 1 && view.value < below) expect(view.display, field.id).toBe(`<${below}`);
          }
        }
      }
    }
  });
});

describe('filling a form', () => {
  const run = RUNS.find((r) => r.items.some((i) => i.fields.some((f) => f.answer === 'formula')));

  it('works a formula out once staff type the numbers it needs', () => {
    if (!run) return;
    const item = run.items.find((i) => i.fields.some((f) => f.answer === 'formula' && f.formula!.of.every((o) => i.fields.find((x) => x.id === o)?.answer === 'ask')));
    if (!item) return;
    const fd = item.fields.find((f) => f.answer === 'formula')!;
    const [a, b] = fd.formula!.of;
    const blank = fillForm(run, figures()).items.find((i) => i.item.id === item.id)!.fields.find((f) => f.field.id === fd.id)!;
    expect(blank.view.state).toBe('waiting');
    const filled = fillForm(run, figures(), { [a]: '30', [b]: '40' }).items.find((i) => i.item.id === item.id)!.fields.find((f) => f.field.id === fd.id)!;
    expect(filled.view).toMatchObject({ state: 'value', display: { percent: '75%', sum: '70', difference: '-10' }[fd.formula!.op] });
  });

  it('withholds a single age range that funder copy reports together with another', () => {
    const fake = {
      ...RUNS[0],
      items: [{ id: 'x', number: '1', title: 'Youth by age', quote: '', quote_match: 'exact', fields: [{ id: 'x.1', label: '16-18', quote: '', quote_match: 'exact', wants: 'count', answer: 'metric', metric: 'participants_served', age_range: '16-18', formula: null, text: null, ask: null, to_staff: null, missing: null, reason: '', history: [] }] }],
    } as unknown as FormRun;
    const filled = fillForm(fake, figures());
    const view = filled.items[0].fields[0].view;
    expect(view).toMatchObject({ state: 'withheld', display: '16-24: 15' });
    expect(filled.guard).toHaveLength(1);
  });

  it('withholds a percent worked out from a count under the cutoff', () => {
    const fake = {
      ...RUNS[0],
      items: [
        {
          id: 'y',
          number: '2',
          title: 'Exits',
          quote: '',
          quote_match: 'exact',
          fields: [
            { id: 'y.A', label: 'left', quote: '', quote_match: 'exact', wants: 'count', answer: 'metric', metric: 'participants_exited', age_range: null, formula: null, text: null, ask: null, to_staff: null, missing: null, reason: '', history: [] },
            { id: 'y.B', label: 'enrolled', quote: '', quote_match: 'exact', wants: 'count', answer: 'metric', metric: 'enrolled_in_period', age_range: null, formula: null, text: null, ask: null, to_staff: null, missing: null, reason: '', history: [] },
            { id: 'y.C', label: 'share', quote: '', quote_match: 'exact', wants: 'percent', answer: 'formula', metric: null, age_range: null, formula: { op: 'percent', of: ['y.A', 'y.B'] }, text: null, ask: null, to_staff: null, missing: null, reason: '', history: [] },
          ],
        },
      ],
    } as unknown as FormRun;
    const [a, b, c] = fillForm(fake, figures()).items[0].fields.map((f) => f.view);
    expect(a).toMatchObject({ state: 'value', display: '<5' });
    expect(b).toMatchObject({ state: 'value', display: '40' });
    expect(c).toMatchObject({ state: 'withheld', display: 'Not shown' });
  });
});
