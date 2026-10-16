// Real funders' reporting forms, as the agent mapped them (data/agent-runs),
// filled from the records by the same engine as everything else. The agent
// chose which metric answers which field and drafted the written answers with
// slots. Every number here is counted now, from the current records, answers
// and cutoff. The privacy guard runs last and logs what it changed.

import ojjdp from '../data/agent-runs/ojjdp-mentoring.json';
import geist from '../data/agent-runs/geist-foster-youth.json';
import greyHighlands from '../data/agent-runs/grey-highlands.json';
import { commas, fmtPercent, halfUp } from './format';
import { METRICS, type MetricId, type MetricKind } from './metrics';
import { isSmall, peopleForFunder } from './privacy';
import { renderSlot, type PeriodFigures, type SummaryPart, type TraceRef } from './report';
import type { SlotKind } from './templates';

export type AnswerType = 'metric' | 'formula' | 'draft' | 'ask' | 'missing';

export interface RunEvent {
  id: string;
  lane: string;
  kind: 'step' | 'llm' | 'tool' | 'check' | 'gate';
  label: string;
  /** Milliseconds from the start of the run. */
  start: number;
  end: number;
  status: 'ok' | 'fail' | 'pass' | 'running';
  detail: {
    parent?: string | null;
    input?: Record<string, unknown>;
    output?: string;
    problems?: string[];
    micros?: number;
    tokens_in?: number;
    tokens_out?: number;
    turns?: number;
    model?: string;
    rejected?: string[];
    [k: string]: unknown;
  };
}

export interface HistoryEntry {
  step: 'check' | 'review' | 'remap';
  verdict?: 'pass' | 'fail';
  reason?: string;
  problems?: string[];
  round?: number;
  answer?: string;
  outcome?: string;
}

export interface FormField {
  id: string;
  label: string;
  quote: string;
  quote_match: 'exact' | 'spread' | null;
  wants: string;
  answer: AnswerType;
  metric: MetricId | null;
  age_range: string | null;
  formula: { op: 'percent' | 'difference' | 'sum'; of: string[] } | null;
  text: string | null;
  ask: string | null;
  /** Why the agent handed this field to staff after trying: its drafts kept breaking the rules, or the reviewer rejected it twice. */
  to_staff: 'rules' | 'review' | 'unanswered' | null;
  missing: string | null;
  reason: string;
  history: HistoryEntry[];
}

export interface FormItem {
  id: string;
  number: string | null;
  title: string;
  quote: string;
  quote_match: 'exact' | 'spread' | null;
  fields: FormField[];
}

export interface FormMeta {
  id: string;
  funder: string;
  short: string;
  title: string;
  kind: string;
  url: string;
  retrieved: string;
  pdf_sha256: string;
  pages: number;
  text: string;
}

export interface FormRun {
  form: FormMeta;
  /** The form's text exactly as the agent read it. */
  form_text: string;
  form_sha: string;
  recorded_on: string;
  cli: string;
  model: string;
  effort: string;
  workers: number;
  duration_ms: number;
  totals: {
    model_calls: number;
    tool_calls: number;
    checks: number;
    checks_failed: number;
    tokens_in: number;
    tokens_out: number;
    questions: number;
    fields: number;
    metric: number;
    formula: number;
    draft: number;
    ask: number;
    missing: number;
  };
  events: RunEvent[];
  items: FormItem[];
}

export const RUNS: FormRun[] = [greyHighlands, ojjdp, geist] as unknown as FormRun[];
export type FormId = string;
export const runById = (id: FormId): FormRun => {
  const r = RUNS.find((x) => x.form.id === id);
  if (!r) throw new Error(`no form ${id}`);
  return r;
};

// ---------- filling a form ----------

export type GuardKind = 'small' | 'combined' | 'derived';

export interface GuardAction {
  fieldId: string;
  /** The field or figure, as the report names it. */
  label: string;
  kind: GuardKind;
  /** What the funder copy shows instead. */
  shows: string;
  why: string;
}

export type FieldView =
  | { state: 'value'; display: string; value: number | null; ref: TraceRef | null; kind: MetricKind; guarded: GuardKind | null; working?: { label: string; display: string; ref: TraceRef | null }[] }
  | { state: 'withheld'; display: string; ref: TraceRef | null; why: string }
  /** A formula waiting on numbers staff haven't typed yet. */
  | { state: 'waiting'; needs: string[] }
  | { state: 'draft'; parts: SummaryPart[]; ask: string | null; staff: string | null }
  | { state: 'ask'; question: string; staff: string | null; numeric: boolean; handedOver: 'rules' | 'review' | 'unanswered' | null }
  | { state: 'missing'; what: string };

export interface FilledField {
  field: FormField;
  view: FieldView;
}

export interface FilledItem {
  item: FormItem;
  fields: FilledField[];
}

export interface FilledForm {
  run: FormRun;
  items: FilledItem[];
  guard: GuardAction[];
  counts: { fromRecords: number; forStaff: number; staffDone: number; notTracked: number };
}

const STAFF_NUMBER = ['count', 'hours', 'money'];
/** "1,200", "$1,200" or "30" as a number; anything else is not one. */
const parseNumber = (s: string | undefined): number | null => {
  const t = s?.replace(/[$,\s]/g, '') ?? '';
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

const SLOT_KIND: Record<MetricKind, SlotKind> = { people: 'people', count: 'count', hours: 'hours', percent: 'percent', decimal: 'decimal' };
const opWord = { percent: '÷', difference: '−', sum: '+' } as const;

/** A draft's slots filled from the engine, each linked to its rows. */
export function renderDraft(text: string, f: PeriodFigures): SummaryPart[] {
  const parts: SummaryPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{([a-z0-9_]+)\}/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    const id = m[1];
    if (id === 'period') parts.push({ text: f.period.long });
    else if (id in METRICS) parts.push(renderSlot({ kind: SLOT_KIND[METRICS[id as MetricId].kind], source: { from: 'metric', metric: id as MetricId } }, f));
    else throw new Error(`draft uses unknown slot {${id}}`);
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

interface Numeric {
  value: number | null;
  /** True when this is a people count under the cutoff: any figure worked out from it would give it away. */
  small: boolean;
  kind: MetricKind;
  display: string;
  ref: TraceRef | null;
}

/**
 * Fills one form for one period. staff holds what a person typed into the
 * fields only a person can answer.
 */
export function fillForm(run: FormRun, f: PeriodFigures, staff: Record<string, string> = {}): FilledForm {
  const guard: GuardAction[] = [];
  const below = f.smallBelow;

  const metricNumeric = (fd: FormField): Numeric | { withheld: string; display: string; ref: TraceRef } => {
    const id = fd.metric!;
    if (fd.age_range) {
      const band = f.ageBreakdown.cells.find((c) => c.ranges.includes(fd.age_range!));
      if (!band) return { value: null, small: false, kind: 'people', display: 'Not in records', ref: null };
      const ref: TraceRef = { kind: 'age', band: band.key };
      if (band.ranges.length > 1) {
        const others = band.ranges.filter((r) => r !== fd.age_range);
        return { withheld: `${fd.age_range} is reported together with ${others.join(' and ')} as ${band.key}, because one of those ranges has ${below <= 2 ? '1 person' : `1 to ${below - 1} people`} in some month.`, display: `${band.key}: ${band.display}`, ref };
      }
      return { value: band.value, small: isSmall(band.value, below), kind: 'people', display: band.display, ref };
    }
    const mv = f.metrics[id];
    return { value: mv.value, small: METRICS[id].kind === 'people' && mv.value !== null && isSmall(mv.value, below), kind: METRICS[id].kind, display: mv.display, ref: { kind: 'metric', metric: id } };
  };

  const items = run.items.map((item): FilledItem => {
    const numbers = new Map<string, Numeric | { withheld: string; display: string; ref: TraceRef }>();
    for (const fd of item.fields) {
      if (fd.answer === 'metric' && fd.metric) numbers.set(fd.id, metricNumeric(fd));
      // A number staff typed feeds any formula that uses it.
      const typed = fd.answer === 'ask' && STAFF_NUMBER.includes(fd.wants) ? parseNumber(staff[fd.id]) : null;
      if (typed !== null) numbers.set(fd.id, { value: typed, small: false, kind: fd.wants === 'hours' ? 'hours' : 'count', display: commas(typed), ref: null });
    }

    const fields = item.fields.map((fd): FilledField => {
      switch (fd.answer) {
        case 'metric': {
          const n = numbers.get(fd.id)!;
          if ('withheld' in n) {
            guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'combined', shows: n.display, why: n.withheld });
            return { field: fd, view: { state: 'withheld', display: n.display, ref: n.ref, why: n.withheld } };
          }
          if (n.small) guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'small', shows: n.display, why: `A count of ${below <= 2 ? '1' : `1 to ${below - 1}`} could identify someone.` });
          return { field: fd, view: { state: 'value', display: n.display, value: n.value, ref: n.ref, kind: n.kind, guarded: n.small ? 'small' : null } };
        }
        case 'formula': {
          const ops = (fd.formula?.of ?? []).map((id) => ({ id, n: numbers.get(id) }));
          const working = ops.map(({ id, n }) => ({ label: item.fields.find((x) => x.id === id)?.label ?? id, display: n ? n.display : '?', ref: n ? n.ref : null }));
          const nums = ops.map((o) => o.n);
          const untyped = ops.filter((o) => !o.n && item.fields.find((x) => x.id === o.id)?.answer === 'ask');
          if (untyped.length) return { field: fd, view: { state: 'waiting', needs: untyped.map((o) => item.fields.find((x) => x.id === o.id)!.label) } };
          if (nums.some((n) => !n || 'withheld' in n || n.value === null)) {
            const why = 'One of the figures it is worked out from is not shown.';
            guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'derived', shows: 'Not shown', why });
            return { field: fd, view: { state: 'withheld', display: 'Not shown', ref: null, why } };
          }
          const [a, b] = nums as Numeric[];
          if (a.small || b.small) {
            const why = `Worked out from a count under ${below}, so it would give that count away.`;
            guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'derived', shows: 'Not shown', why });
            return { field: fd, view: { state: 'withheld', display: 'Not shown', ref: null, why } };
          }
          const op = fd.formula!.op;
          if (op === 'percent') {
            const display = b.value === 0 ? 'Nothing to divide by' : fmtPercent(a.value!, b.value!);
            return { field: fd, view: { state: 'value', display, value: b.value ? a.value! / b.value : null, ref: null, kind: 'percent', guarded: null, working } };
          }
          const v = op === 'sum' ? a.value! + b.value! : a.value! - b.value!;
          const people = a.kind === 'people' && b.kind === 'people';
          const small = people && isSmall(v, below);
          if (small) guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'small', shows: peopleForFunder(v, below), why: `A count of ${below <= 2 ? '1' : `1 to ${below - 1}`} could identify someone.` });
          const display = people ? peopleForFunder(v, below) : a.kind === 'hours' ? commas(halfUp(Math.round(v * 100), 100)) : commas(v);
          return { field: fd, view: { state: 'value', display, value: v, ref: null, kind: people ? 'people' : a.kind, guarded: small ? 'small' : null, working } };
        }
        case 'draft':
          return { field: fd, view: { state: 'draft', parts: renderDraft(fd.text ?? '', f), ask: fd.ask, staff: staff[fd.id]?.trim() || null } };
        case 'ask':
          return { field: fd, view: { state: 'ask', question: fd.ask ?? fd.quote, staff: staff[fd.id]?.trim() || null, numeric: STAFF_NUMBER.includes(fd.wants), handedOver: fd.to_staff } };
        default:
          return { field: fd, view: { state: 'missing', what: fd.missing ?? '' } };
      }
    });
    return { item, fields };
  });

  const all = items.flatMap((i) => i.fields);
  const item = (fd: FormField) => run.items.find((i) => i.fields.includes(fd))!;
  const needsStaff = all.filter((x) => x.view.state === 'ask' || (x.view.state === 'draft' && x.view.ask));
  return {
    run,
    items,
    guard,
    counts: {
      fromRecords: all.filter((x) => fromRecords(x.field, item(x.field))).length,
      forStaff: needsStaff.length,
      staffDone: needsStaff.filter((x) => (x.view.state === 'ask' || x.view.state === 'draft') && x.view.staff).length,
      notTracked: all.filter((x) => x.view.state === 'missing').length,
    },
  };
}

export const OP_WORD = opWord;

/** "6.B New youth added" on a numbered form, the field's label otherwise. */
export function fieldName(item: FormItem, fd: FormField): string {
  const tail = fd.id.slice(fd.id.indexOf('.') + 1);
  return item.number ? `${item.number}${/^[A-Z]$/.test(tail) ? `.${tail}` : ''} ${fd.label}` : fd.label;
}

/** A field the records answer: a metric, a draft, or a formula over metrics. */
function fromRecords(fd: FormField, item: FormItem): boolean {
  if (fd.answer === 'metric' || fd.answer === 'draft') return true;
  if (fd.answer !== 'formula') return false;
  return (fd.formula?.of ?? []).every((id) => {
    const op = item.fields.find((x) => x.id === id);
    return !!op && fromRecords(op, item);
  });
}

// ---------- the recorded run ----------

export interface Lane {
  id: string;
  events: RunEvent[];
}

/** Lanes in the order they first did something: the form reader, then each worker, then assembly. */
export function lanes(run: FormRun): Lane[] {
  const order: string[] = [];
  for (const e of [...run.events].sort((a, b) => a.start - b.start)) if (!order.includes(e.lane)) order.push(e.lane);
  return order.map((id) => ({ id, events: run.events.filter((e) => e.lane === id) }));
}

/** The most model calls running at once. */
export function peakParallel(run: FormRun): number {
  const llm = run.events.filter((e) => e.kind === 'llm');
  let peak = 0;
  for (const e of llm) peak = Math.max(peak, llm.filter((o) => o.start <= e.start && o.end > e.start).length);
  return peak;
}

export const fmtSeconds = (ms: number): string => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
