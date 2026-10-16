// The privacy guard on whole pages, and the answers staff type into them.
// Each case is one a reviewer reproduced on the page: a count typed by staff,
// a share that gives its small complement away, two numbers whose gap is a
// small count, and an answer carried into the wrong period.

import { describe, expect, it } from 'vitest';
import { allChoices } from '../lib/choices';
import { PERIODS, sample } from '../lib/data';
import { measure } from '../lib/engine';
import { applyAnswers, detectFindings } from '../lib/findings';
import { countsPeople, fillForm, parseStaffNumber, runById, type FilledForm } from '../lib/forms';
import { buildReport, computePeriod } from '../lib/report';
import { build, staffKey } from '../components/workspace/model';

const findings = detectFindings(sample);
const [q3, jul, aug, sep] = PERIODS;
const figures = (below = 5, period = q3) => computePeriod(sample, applyAnswers(sample, findings, {}, below), findings, period);
const ojjdp = runById('ojjdp-mentoring');
const view = (f: FilledForm, id: string) => f.items.flatMap((i) => i.fields).find((x) => x.field.id === id)!.view;

describe('numbers staff type', () => {
  it('a count of 1 to 4 people shows as "<5", and the percent worked out from it is not shown', () => {
    const f = fillForm(ojjdp, figures(), { 'q7.A': '1' });
    expect(view(f, 'q7.A')).toMatchObject({ state: 'ask', staff: '1', shows: '<5' });
    expect(view(f, 'q7.C')).toMatchObject({ state: 'withheld', display: 'Not shown' });
    expect(f.guard.map((g) => [g.fieldId, g.shows])).toEqual(expect.arrayContaining([['q7.A', '<5'], ['q7.C', 'Not shown']]));
  });

  it('a share that leaves out 1 to 4 people hides itself and its top: 38 of 40 matched says 2 were not', () => {
    const f = fillForm(ojjdp, figures(), { 'q7.A': '38' });
    expect(view(f, 'q7.A')).toMatchObject({ staff: '38', shows: 'Not shown' });
    expect(view(f, 'q7.C')).toMatchObject({ state: 'withheld' });
    expect(view(fillForm(ojjdp, figures(), { 'q7.A': '30' }), 'q7.C')).toMatchObject({ state: 'value', display: '75%' });
  });

  it('reads the form label to tell people from months, programs and events', () => {
    const field = (id: string) => ojjdp.items.flatMap((i) => i.fields).find((x) => x.id === id)!;
    expect(['q7.A', 'q3.A', 'q11.C', 'q22.B'].map((id) => countsPeople(field(id)))).toEqual([true, true, true, true]);
    expect(['q8.A', 'q9.A', 'q21.A'].map((id) => countsPeople(field(id)))).toEqual([false, false, false]);
    expect(view(fillForm(ojjdp, figures(), { 'q8.A': '3' }), 'q8.A')).toMatchObject({ staff: '3', shows: null });
  });

  it('counts only whole numbers as an answered count', () => {
    expect([parseStaffNumber('count', 'abc'), parseStaffNumber('count', '2.5'), parseStaffNumber('count', '1,200'), parseStaffNumber('money', '$1,200.50')]).toEqual([null, null, 1200, 1200.5]);
    const f = fillForm(ojjdp, figures(), { 'q7.A': 'abc' });
    expect(view(f, 'q7.A')).toMatchObject({ staff: null });
    expect(view(f, 'q7.C')).toMatchObject({ state: 'waiting' });
    expect(f.counts.staffDone).toBe(0);
  });
});

describe('numbers that give each other away', () => {
  it('holds back enrolled at the start when enrolled during the period, minus it, is a small count', () => {
    // Jul to Sep: 34 at the start, 40 during. At a cutoff of 10 the 6 who joined show as "<10",
    // so 40 - 34 can't be printed either.
    const f = fillForm(ojjdp, figures(10));
    expect(view(f, 'q6.B')).toMatchObject({ state: 'value', display: '<10' });
    expect(view(f, 'q6.A')).toMatchObject({ state: 'withheld', display: 'Not shown' });
    expect(view(f, 'q7.B')).toMatchObject({ state: 'value', display: '40' });
    expect(view(fillForm(ojjdp, figures(5)), 'q6.A')).toMatchObject({ state: 'value', display: '34' });
  });

  it('withholds retention for a group where 1 to 4 people left', () => {
    const r = buildReport(sample, findings, {}, 'foundation-outcomes', 'q3');
    const fig = r.sections.flatMap((s) => (s.type === 'figures' ? s.figures : [])).find((x) => x.label === 'Retention rate')!;
    const bars = r.sections.flatMap((s) => (s.type === 'figures' && s.chart ? s.chart.bars : []));
    // 38 of 40 overall, 12 of 13 and 10 of 11 by group: each would say how many left.
    expect(fig).toMatchObject({ display: 'Not shown', value: null });
    expect(bars.map((b) => [b.label, b.display, b.value])).toEqual([
      ['Coding Club', '100%', 1],
      ['Mentor Circle', 'Not shown', null],
      ['Weekend Leaders', 'Not shown', null],
    ]);
  });

  it('keeps a share that leaves nobody out, or a big group out', () => {
    const figure = (period: 'q3' | 'aug', label: string) =>
      buildReport(sample, findings, {}, 'foundation-outcomes', period).sections.flatMap((s) => (s.type === 'figures' ? s.figures : [])).find((x) => x.label === label)!.display;
    // August: nobody left. Jul to Sep: 27 of 37 improved, 10 did not.
    expect(figure('aug', 'Retention rate')).toBe('100%');
    expect(figure('q3', 'Confidence improved')).toBe('73%');
  });
});

describe('exits', () => {
  it('count an exit on the last day of a month in that month, so the months add up to the quarter', () => {
    const st = applyAnswers(sample, findings, {});
    const exited = (p: (typeof PERIODS)[number]) => measure(sample, st, p.start, p.end).exited.map((x) => x.id);
    expect(exited(jul)).toContain('P23');
    expect([...exited(jul), ...exited(aug), ...exited(sep)].sort()).toEqual(exited(q3).sort());
    const all = applyAnswers(sample, findings, Object.fromEntries(findings.filter((f) => f.kind === 'inactive_participant').map((f) => [f.id, 'left_program'])));
    const n = (p: (typeof PERIODS)[number]) => measure(sample, all, p.start, p.end).exited.length;
    expect(n(jul) + n(aug) + n(sep)).toBe(n(q3));
  });
});

describe('staff answers belong to a period', () => {
  const snap = { edits: {}, answers: {}, smallBelow: 5 };
  it("doesn't carry the quarter's answer into July", () => {
    const staff = { [staffKey('ojjdp-mentoring', 'q3', 'q7.A')]: '30' };
    const quarter = build(snap, 'q3', 'ojjdp-mentoring', staff).output;
    const july = build(snap, 'jul', 'ojjdp-mentoring', staff).output;
    if (quarter.kind !== 'form' || july.kind !== 'form') throw new Error('not a form');
    expect(view(quarter.form, 'q7.C')).toMatchObject({ state: 'value', display: '75%' });
    expect(view(july.form, 'q7.A')).toMatchObject({ staff: null, question: 'How many enrolled youth were matched with a mentor in July 2026?' });
    expect(view(quarter.form, 'q7.A')).toMatchObject({ question: 'How many enrolled youth were matched with a mentor between July and September 2026?' });
    expect(view(july.form, 'q7.C')).toMatchObject({ state: 'waiting' });
  });
});

describe('choice questions', () => {
  it('offer only options printed on the form, word for word', () => {
    for (const { formId, fieldId, choice } of allChoices()) {
      const run = runById(formId);
      const text = run.form_text.replace(/\s+/g, ' ');
      expect(run.items.flatMap((i) => i.fields).find((f) => f.id === fieldId)?.wants, `${formId} ${fieldId}`).toBe('choice');
      for (const o of choice.options) expect(text, `${formId} ${fieldId}: ${o}`).toContain(o);
    }
  });
});
