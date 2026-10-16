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
import { WITHHELD, isSmall, peopleForFunder, shareIsSmall, smallRange } from './privacy';
import { renderSlot, WITHHELD_SHARE, type PeriodFigures, type SummaryPart, type TraceRef } from './report';
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

/** Grey Highlands first: its first questions are a one-click choice and a paragraph filled from the records, and a gap answer moves numbers on it. */
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
  /** shows: what funder copy prints for a typed number the guard changed ("<5", "Not shown"). */
  | { state: 'ask'; question: string; staff: string | null; shows: string | null; numeric: boolean; handedOver: 'rules' | 'review' | 'unanswered' | null }
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

const STAFF_NUMBER = ['count', 'hours', 'money', 'percent'];

/** What a person typed, as a number: whole for a count, "1,200.50" or "$1,200" for hours and money, "95%" for a percent. Anything else is not an answer yet. */
export function parseStaffNumber(wants: string, s: string | undefined): number | null {
  const t = s?.replace(/[$,\s]/g, '') ?? '';
  if (wants === 'count') return /^\d+$/.test(t) ? Number(t) : null;
  if (wants === 'percent') return /^\d+(\.\d+)?%?$/.test(t) && parseFloat(t) <= 100 ? parseFloat(t) : null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * A count staff type is a count of people when the form's own label names
 * people ("Youth matched with a mentor", "# Volunteers"). The guard can't see
 * what a typed number counts, so it reads the label. Months, programs and
 * training events are not people.
 */
const PEOPLE_WORDS = /\b(youth|mentors?|mentees?|volunteers?|people|persons?|participants?|staff|members?|students?|children|clients?)\b/i;
export const countsPeople = (fd: FormField): boolean => fd.wants === 'count' && PEOPLE_WORDS.test(fd.label);

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

/** A number on the form, from the records or typed by staff, before it's placed. */
interface Numeric {
  value: number | null;
  kind: MetricKind;
  /** What funder copy shows. */
  display: string;
  ref: TraceRef | null;
  /** A count of people under the cutoff: it shows as "<cutoff", and nothing may be worked out from it. */
  small: boolean;
  /** Set when the guard holds the number back. */
  withheld?: { display: string; why: string; kind: GuardKind };
}

/**
 * The agent wrote its questions for the quarter it was run on ("between July
 * and September 2026"). A month's report asks about its month.
 */
const RUN_QUARTER = 'between July and September 2026';
const forPeriod = (question: string, period: PeriodFigures['period']): string => (period.id === 'q3' ? question : question.replaceAll(RUN_QUARTER, `in ${period.long}`));

const smallWhy = (below: number) => `A count of ${below <= 2 ? '1' : `1 to ${below - 1}`} could identify someone.`;

/**
 * Fills one form for one period. staff holds what a person typed into the
 * fields only a person can answer. Every number on the form goes through the
 * privacy guard together, since two numbers can give away what neither does
 * alone: 40 enrolled beside 38 matched says 2 weren't.
 */
export function fillForm(run: FormRun, f: PeriodFigures, staff: Record<string, string> = {}): FilledForm {
  const guard: GuardAction[] = [];
  const below = f.smallBelow;
  const range = smallRange(below);
  const all = run.items.flatMap((item) => item.fields.map((fd) => ({ item, fd })));
  const byId = new Map(all.map((x) => [x.fd.id, x]));
  const name = (id: string) => {
    const x = byId.get(id)!;
    return fieldName(x.item, x.fd);
  };

  // Every number on the form: the records' counts, and what staff typed.
  const nums = new Map<string, Numeric>();
  for (const { fd } of all) {
    if (fd.answer === 'metric' && fd.metric) {
      const id = fd.metric;
      if (fd.age_range) {
        const band = f.ageBreakdown.cells.find((c) => c.ranges.includes(fd.age_range!));
        if (!band) {
          nums.set(fd.id, { value: null, kind: 'people', display: 'Not in records', ref: null, small: false });
          continue;
        }
        const n: Numeric = { value: band.value, kind: 'people', display: band.display, ref: { kind: 'age', band: band.key }, small: isSmall(band.value, below) };
        if (band.ranges.length > 1) {
          const others = band.ranges.filter((r) => r !== fd.age_range);
          n.withheld = { display: `${band.key}: ${band.display}`, kind: 'combined', why: `${fd.age_range} is reported together with ${others.join(' and ')} as ${band.key}, because one of those ranges has ${range} in some month.` };
        }
        nums.set(fd.id, n);
        continue;
      }
      const mv = f.metrics[id];
      const kind = METRICS[id].kind;
      const n: Numeric = { value: mv.value, kind, display: mv.display, ref: { kind: 'metric', metric: id }, small: kind === 'people' && mv.value !== null && isSmall(mv.value, below) };
      if (mv.display === WITHHELD) n.withheld = { display: WITHHELD, kind: 'derived', why: `The people it counts, or the people it leaves out, are ${range}.` };
      nums.set(fd.id, n);
    }
    if (fd.answer === 'ask' && STAFF_NUMBER.includes(fd.wants)) {
      const typed = parseStaffNumber(fd.wants, staff[fd.id]);
      if (typed === null) continue;
      const people = countsPeople(fd);
      const kind: MetricKind = people ? 'people' : fd.wants === 'percent' ? 'percent' : fd.wants === 'hours' ? 'hours' : 'count';
      nums.set(fd.id, { value: typed, kind, display: people ? peopleForFunder(typed, below) : kind === 'percent' ? `${typed}%` : commas(typed), ref: null, small: people && isSmall(typed, below) });
    }
  }

  // Two people counts give away their gap: 40 enrolled beside 38 matched says
  // 2 weren't. The guard checks the pairs it knows are nested: a metric
  // declared inside another, the top of a share inside its bottom, and any two
  // people counts on the same question, which is how forms group a count with
  // its total. When a gap is 1 to cutoff-1, the smaller number is held back.
  // A shown count equal to a held-back one is the same number told twice
  // ("trained mentors, from 3A"), so it's held back too. Repeats until stable.
  const people = (id: string) => nums.get(id)?.kind === 'people';
  const pairs: [string, string][] = [];
  for (const { item, fd } of all) {
    const within = fd.answer === 'metric' && fd.metric && !fd.age_range ? METRICS[fd.metric].within : undefined;
    if (within) for (const { fd: o } of all) if (o.answer === 'metric' && o.metric === within && !o.age_range) pairs.push([fd.id, o.id]);
    if (fd.answer === 'formula' && fd.formula?.op === 'percent') {
      const [a, b] = fd.formula.of;
      if (people(a) && people(b)) pairs.push([a, b]);
    }
    if (people(fd.id)) for (const o of item.fields) if (o.id > fd.id && people(o.id)) pairs.push([fd.id, o.id]);
  }
  const shown = (n: Numeric | undefined): n is Numeric & { value: number } => !!n && !n.withheld && !n.small && n.value !== null;
  const hold = (id: string, why: string) => {
    nums.get(id)!.withheld = { display: WITHHELD, kind: 'derived', why };
  };
  for (let moved = true; moved; ) {
    moved = false;
    for (const [x, y] of pairs) {
      const a = nums.get(x);
      const b = nums.get(y);
      if (!shown(a) || !shown(b) || !isSmall(Math.abs(a.value - b.value), below)) continue;
      const [lo, hi] = a.value <= b.value ? [x, y] : [y, x];
      hold(lo, `Taken from ${name(hi)}, it would leave ${range}.`);
      moved = true;
    }
    const held = [...nums.entries()].filter(([, n]) => n.kind === 'people' && n.withheld?.kind === 'derived' && n.value !== null);
    for (const [id, n] of nums) {
      const same = shown(n) && n.kind === 'people' ? held.find(([, h]) => h.value === n.value) : undefined;
      if (!same) continue;
      hold(id, `It repeats ${name(same[0])}, which is not shown.`);
      moved = true;
    }
  }

  // A percent staff type is checked like a share against each people count on
  // its question: 95% of 40 mentors says 2 left. Worked out from a count the
  // guard holds back, it's held back too.
  for (const { item, fd } of all) {
    const n = nums.get(fd.id);
    if (!n || n.kind !== 'percent' || fd.answer !== 'ask' || n.value === null) continue;
    const counts = item.fields.map((o) => nums.get(o.id)).filter((o): o is Numeric => !!o && o.kind === 'people');
    const p = n.value / 100;
    if (counts.some((c) => c.withheld || c.small)) n.withheld = { display: WITHHELD, kind: 'derived', why: 'It may be worked out from a count on this question that is not shown.' };
    else if (counts.some((c) => c.value !== null && shareIsSmall(Math.round(p * c.value), c.value, below))) n.withheld = { display: WITHHELD, kind: 'derived', why: `With a count on this question, it would show ${range}.` };
  }

  const log = (item: FormItem, fd: FormField, n: Numeric) => {
    if (n.withheld) guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: n.withheld.kind, shows: n.withheld.display, why: n.withheld.why });
    else if (n.small) guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'small', shows: n.display, why: smallWhy(below) });
  };

  const items = run.items.map((item): FilledItem => {
    const fields = item.fields.map((fd): FilledField => {
      switch (fd.answer) {
        case 'metric': {
          const n = nums.get(fd.id)!;
          log(item, fd, n);
          if (n.withheld) return { field: fd, view: { state: 'withheld', display: n.withheld.display, ref: n.ref, why: n.withheld.why } };
          return { field: fd, view: { state: 'value', display: n.display, value: n.value, ref: n.ref, kind: n.kind, guarded: n.small ? 'small' : null } };
        }
        case 'formula': {
          const ops = (fd.formula?.of ?? []).map((id) => ({ id, n: nums.get(id) }));
          const working = ops.map(({ id, n }) => ({ label: byId.get(id)?.fd.label ?? id, display: n ? (n.withheld?.display ?? n.display) : '?', ref: n ? n.ref : null }));
          const untyped = ops.filter((o) => !o.n && byId.get(o.id)?.fd.answer === 'ask');
          if (untyped.length) return { field: fd, view: { state: 'waiting', needs: untyped.map((o) => byId.get(o.id)!.fd.label) } };
          const withhold = (why: string): FilledField => {
            guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'derived', shows: WITHHELD, why });
            return { field: fd, view: { state: 'withheld', display: WITHHELD, ref: null, why } };
          };
          if (ops.some(({ n }) => !n || n.withheld || n.value === null)) return withhold('One of the figures it is worked out from is not shown.');
          const [a, b] = ops.map(({ n }) => n!);
          if (a.small || b.small) return withhold(`Worked out from a count under ${below}, so it would give that count away.`);
          const op = fd.formula!.op;
          if (op === 'percent') {
            if (a.kind === 'people' && b.kind === 'people' && shareIsSmall(a.value!, b.value!, below)) return withhold(`The people it counts, or the people it leaves out, are ${range}.`);
            const display = b.value === 0 ? 'Nothing to divide by' : fmtPercent(a.value!, b.value!);
            return { field: fd, view: { state: 'value', display, value: b.value ? a.value! / b.value : null, ref: null, kind: 'percent', guarded: null, working } };
          }
          const v = op === 'sum' ? a.value! + b.value! : a.value! - b.value!;
          const people = a.kind === 'people' && b.kind === 'people';
          const small = people && isSmall(v, below);
          if (small) guard.push({ fieldId: fd.id, label: fieldName(item, fd), kind: 'small', shows: peopleForFunder(v, below), why: smallWhy(below) });
          const display = people ? peopleForFunder(v, below) : a.kind === 'hours' ? commas(halfUp(Math.round(v * 100), 100)) : commas(v);
          return { field: fd, view: { state: 'value', display, value: v, ref: null, kind: people ? 'people' : a.kind, guarded: small ? 'small' : null, working } };
        }
        case 'draft': {
          // A draft's number slots are funder copy too: log each one the guard changed, once.
          const seen = new Set<MetricId>();
          for (const m of (fd.text ?? '').matchAll(/\{([a-z0-9_]+)\}/g)) {
            const id = m[1] as MetricId;
            if (!(id in METRICS) || seen.has(id)) continue;
            seen.add(id);
            const mv = f.metrics[id];
            const label = `${fieldName(item, fd)}, ${METRICS[id].label.toLowerCase()}`;
            if (mv.display === WITHHELD) guard.push({ fieldId: `${fd.id}:${id}`, label, kind: 'derived', shows: WITHHELD_SHARE, why: `The people it counts, or the people it leaves out, are ${range}.` });
            else if (METRICS[id].kind === 'people' && mv.value !== null && isSmall(mv.value, below)) guard.push({ fieldId: `${fd.id}:${id}`, label, kind: 'small', shows: `fewer than ${below}`, why: smallWhy(below) });
          }
          return { field: fd, view: { state: 'draft', parts: renderDraft(fd.text ?? '', f), ask: fd.ask, staff: staff[fd.id]?.trim() || null } };
        }
        case 'ask': {
          const numeric = STAFF_NUMBER.includes(fd.wants);
          const n = numeric ? nums.get(fd.id) : undefined;
          if (n) log(item, fd, n);
          // A number is answered only once it reads as one.
          const typed = numeric ? (n ? staff[fd.id].trim() : null) : staff[fd.id]?.trim() || null;
          const shows = n && (n.withheld || n.small) ? (n.withheld?.display ?? n.display) : null;
          return { field: fd, view: { state: 'ask', question: forPeriod(fd.ask ?? fd.quote, f.period), staff: typed, shows, numeric, handedOver: fd.to_staff } };
        }
        default:
          return { field: fd, view: { state: 'missing', what: fd.missing ?? '' } };
      }
    });
    return { item, fields };
  });

  const filled = items.flatMap((i) => i.fields);
  const itemOf = (fd: FormField) => byId.get(fd.id)!.item;
  const needsStaff = filled.filter((x) => x.view.state === 'ask' || (x.view.state === 'draft' && x.view.ask));
  return {
    run,
    items,
    guard,
    counts: {
      fromRecords: filled.filter((x) => fromRecords(x.field, itemOf(x.field))).length,
      forStaff: needsStaff.length,
      staffDone: needsStaff.filter((x) => (x.view.state === 'ask' || x.view.state === 'draft') && x.view.staff).length,
      notTracked: filled.filter((x) => x.view.state === 'missing').length,
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
