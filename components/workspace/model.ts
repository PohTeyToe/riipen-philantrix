// Everything on the page, rebuilt from the records on every change: the
// edited records, the data check, the counts, and the chosen funder's report
// with the privacy guard applied. Each stage is timed with performance.now(),
// and the pipeline shows those times.

import { PERIODS, periodById, sample, type Period } from '@/lib/data';
import { applyEdits, type Edits } from '@/lib/edits';
import { applyAnswers, detectFindings, type Answers } from '@/lib/findings';
import { fillForm, RUNS, type FilledForm, type GuardAction } from '@/lib/forms';
import { buildRegister } from '@/lib/register';
import { computePeriod, refKey, reportFromFigures, type Report } from '@/lib/report';
import { WITHHELD } from '@/lib/privacy';
import { TEMPLATES, type TemplateId } from '@/lib/templates';

const SHARE_WHY = 'The people it counts, or the people it leaves out, are a small count.';

export type FunderId = string;

/** How a formula still waiting on staff reads in the list of what a change moved. */
export const WAITING = 'waiting';

export interface Funder {
  id: FunderId;
  short: string;
  kind: 'form' | 'example';
}

export const FUNDERS: Funder[] = [
  ...RUNS.map((r) => ({ id: r.form.id, short: r.form.short, kind: 'form' as const })),
  ...TEMPLATES.map((t) => ({ id: t.id, short: t.short, kind: 'example' as const })),
];
export const DEFAULT_FUNDER = FUNDERS[0].id;
export const isForm = (id: FunderId) => RUNS.some((r) => r.form.id === id);

/** What a viewer can change about the data. */
export interface Snapshot {
  edits: Edits;
  answers: Answers;
  smallBelow: number;
}

export interface Timings {
  records: number;
  check: number;
  count: number;
  report: number;
}

export type Output = { kind: 'form'; form: FilledForm } | { kind: 'example'; report: Report };

const q3 = PERIODS[0];

/** Staff answers are kept per form, period and field: a July report is a different report, and field ids repeat across forms. */
export const staffKey = (formId: string, periodId: Period['id'], fieldId: string) => `${formId}|${periodId}|${fieldId}`;
export const staffFor = (staff: Record<string, string>, formId: string, periodId: Period['id']) => {
  const head = `${formId}|${periodId}|`;
  return Object.fromEntries(Object.entries(staff).flatMap(([k, v]) => (k.startsWith(head) ? [[k.slice(head.length), v]] : [])));
};

export function build(snap: Snapshot, periodId: Period['id'], funderId: FunderId, staff: Record<string, string>) {
  let t = performance.now();
  const lap = () => {
    const now = performance.now();
    const ms = now - t;
    t = now;
    return ms;
  };
  const ds = applyEdits(sample, snap.edits);
  const records = lap();
  const findings = detectFindings(ds);
  const check = lap();
  const st = applyAnswers(ds, findings, snap.answers, snap.smallBelow);
  const figures = computePeriod(ds, st, findings, periodById(periodId));
  const count = lap();
  const run = RUNS.find((r) => r.form.id === funderId);
  const output: Output = run ? { kind: 'form', form: fillForm(run, figures, staffFor(staff, run.form.id, periodId)) } : { kind: 'example', report: reportFromFigures(ds, figures, funderId as TemplateId) };
  const report = lap();
  const register = buildRegister(ds, st, findings, snap.edits, q3.start, sample.asOf);
  return { ds, findings, st, figures, output, register, timings: { records, check, count, report } satisfies Timings };
}

export type Build = ReturnType<typeof build>;

/** Another funder's report from the same build: same records, answers and cutoff, a different form. */
export function outputFor(b: Build, funderId: FunderId, staff: Record<string, string>): Output {
  const run = RUNS.find((r) => r.form.id === funderId);
  return run ? { kind: 'form', form: fillForm(run, b.figures, staffFor(staff, run.form.id, b.figures.period.id)) } : { kind: 'example', report: reportFromFigures(b.ds, b.figures, funderId as TemplateId) };
}

/** What the privacy guard changed on this report. */
export function guardActions(o: Output): GuardAction[] {
  if (o.kind === 'form') return o.form.guard;
  const out: GuardAction[] = [];
  for (const s of o.report.sections) {
    if (s.type === 'figures') {
      for (const f of s.figures) {
        if (f.display.startsWith('<')) out.push({ fieldId: refKey(f.ref), label: f.label, kind: 'small', shows: f.display, why: 'A small count could identify someone.' });
        if (f.display === WITHHELD) out.push({ fieldId: refKey(f.ref), label: f.label, kind: 'derived', shows: f.display, why: SHARE_WHY });
      }
      if (s.chart) for (const b of s.chart.bars) if (b.display === WITHHELD) out.push({ fieldId: refKey(b.ref), label: `${s.chart.title}, ${b.label}`, kind: 'derived', shows: b.display, why: SHARE_WHY });
      if (s.breakdown) for (const c of s.breakdown.cells) if (c.ranges.length > 1) out.push({ fieldId: refKey(c.ref), label: `Age ${c.ranges.join(' and ')}`, kind: 'combined', shows: `${c.key}: ${c.display}`, why: 'Reported together, because one range is small in some month.' });
    }
    if (s.type === 'goals') for (const g of s.goals) if (g.status === 'Not shown') out.push({ fieldId: `goal:${g.id}`, label: g.name, kind: 'derived', shows: g.display, why: 'No status or forecast: either would give a small count away.' });
  }
  return out;
}

/** Every number on the page, keyed the way the trace buttons key their change marks. */
export function numbersOf(o: Output): Map<string, { label: string; display: string }> {
  const out = new Map<string, { label: string; display: string }>();
  if (o.kind === 'example') {
    for (const s of o.report.sections) {
      if (s.type === 'figures') {
        for (const f of s.figures) out.set(refKey(f.ref), { label: f.label, display: f.display });
        if (s.breakdown) for (const c of [...s.breakdown.cells, s.breakdown.total]) out.set(refKey(c.ref), { label: `Participants served, ${'key' in c ? `age ${c.key}` : 'all ages'}`, display: c.display });
        if (s.chart) for (const b of s.chart.bars) out.set(refKey(b.ref), { label: `${s.chart.title}, ${b.label}`, display: b.display });
      }
      if (s.type === 'goals') for (const g of s.goals) out.set(`goal:${g.id}:value`, { label: g.name, display: `${g.display} · ${g.status}` });
    }
    return out;
  }
  for (const { item, fields } of o.form.items) {
    for (const { field, view } of fields) {
      const label = `${item.number ? `${item.number}${field.id.includes('.') ? field.id.slice(field.id.indexOf('.')) : ''} ` : ''}${field.label}`;
      if (view.state === 'value' || view.state === 'withheld') out.set(`field:${field.id}`, { label, display: view.display });
      // A formula waiting on staff: answering it is a change worth listing.
      if (view.state === 'waiting') out.set(`field:${field.id}`, { label, display: WAITING });
      if (view.state === 'draft') view.parts.forEach((p, i) => p.ref && out.set(`field:${field.id}:${i}`, { label, display: p.text }));
    }
  }
  return out;
}

export interface Change {
  key: string;
  label: string;
  before: string;
  after: string;
}

export function diffNumbers(before: Output, after: Output): Change[] {
  const a = numbersOf(before);
  const out: Change[] = [];
  for (const [key, now] of numbersOf(after)) {
    const was = a.get(key);
    if (was && was.display !== now.display) out.push({ key, label: now.label, before: was.display, after: now.display });
  }
  return out;
}
