// Builds what a funder sees: the figures for one period, the data notes, and
// the report model the page, the PDF and the Excel file all render from.
// Nothing in this file carries a participant's name. The trace panel (staff
// view) rebuilds its rows separately, in lib/trace.ts.

import { PERIODS, periodById, type Dataset, type Period } from './data';
import { goalFigure, measure, type GoalFigure, type ShownStatus } from './engine';
import { applyAnswers, type Answers, type Finding, type State } from './findings';
import { commas, fmtDate, fmtDay, fmtHours, fmtLongDate, fmtPercent, toHundredths } from './format';
import { METRICS, type MetricId, type MetricKind, type MetricValue } from './metrics';
import { DEFAULT_SMALL_BELOW, WITHHELD, bandLabel, combineBands, combinedFootnote, peopleForFunder, shareIsSmall } from './privacy';
import { SUMMARY_LABEL, TEMPLATES, templateById, templateGoals, templateMetrics, type Slot, type Template, type TemplateId } from './templates';

// ---------- figures for one period ----------

export interface GroupRate {
  groupId: string;
  groupName: string;
  num: number;
  den: number;
  value: number | null;
  display: string;
}

export interface DataNote {
  findingId: string;
  kind: string;
  templates: TemplateId[];
  text: string;
}

/** One band of the age breakdown: an age range, or ranges combined (lib/privacy.ts). */
export interface AgeBand {
  /** "13-15", or "16-24" for 16-18 and 19-24 combined. */
  key: string;
  ranges: string[];
  value: number;
  /** What the funder copy shows. */
  display: string;
}

export interface PeriodFigures {
  period: Period;
  /** The privacy cutoff these figures were shown under. */
  smallBelow: number;
  metrics: Record<MetricId, MetricValue>;
  attendanceByGroup: GroupRate[];
  retentionByGroup: GroupRate[];
  ageBreakdown: { total: { value: number; display: string }; cells: AgeBand[]; footnote: string | null };
  goals: GoalFigure[];
  notes: DataNote[];
}

const bandsCache = new WeakMap<Dataset, Map<number, string[][]>>();

/**
 * The age bands funder copy uses, the same in every period a reader can switch
 * to, from participants served in each. Answers don't change who attended, so
 * this depends on the records and the cutoff alone.
 */
export function ageBands(ds: Dataset, smallBelow = DEFAULT_SMALL_BELOW): string[][] {
  let byCutoff = bandsCache.get(ds);
  if (!byCutoff) bandsCache.set(ds, (byCutoff = new Map()));
  let bands = byCutoff.get(smallBelow);
  if (!bands) {
    const st = applyAnswers(ds, [], {});
    const age = new Map(ds.participants.map((p) => [p.id, p.age_range]));
    const counts = PERIODS.map((p) => {
      const served = measure(ds, st, p.start, p.end).served;
      return ds.ageRanges.map((r) => served.filter((pid) => age.get(pid) === r).length);
    });
    bands = combineBands(ds.ageRanges, counts, smallBelow);
    byCutoff.set(smallBelow, bands);
  }
  return bands;
}

export function computePeriod(ds: Dataset, st: State, findings: Finding[], period: Period): PeriodFigures {
  const m = measure(ds, st, period.start, period.end);
  const metrics = Object.fromEntries(Object.values(METRICS).map((def) => [def.id, def.compute(m)])) as Record<MetricId, MetricValue>;

  const byGroup = ds.groups.map((g) => ({ g, gm: measure(ds, st, period.start, period.end, g.id) }));
  const below = st.smallBelow;
  // Seats aren't people, so attendance shows as it is. Retention is a share of
  // people: hidden when the people it counts or leaves out are a small count.
  const groupRate = (num: number, den: number, empty: string, people: boolean) =>
    den === 0 ? { num, den, value: null, display: empty } : { num, den, value: num / den, display: people && shareIsSmall(num, den, below) ? WITHHELD : fmtPercent(num, den) };
  const attendanceByGroup = byGroup.map(({ g, gm }) => ({ groupId: g.id, groupName: g.name, ...groupRate(gm.attended, gm.offered, `No sessions in ${period.short}`, false) }));
  const retentionByGroup = byGroup.map(({ g, gm }) => ({ groupId: g.id, groupName: g.name, ...groupRate(gm.retained.length, gm.enrolledAny.length, `No participants in ${period.short}`, true) }));

  const byId = new Map(st.people.map((p) => [p.id, p]));
  const bands = ageBands(ds, below);
  const cells = bands.map((ranges) => {
    const value = m.served.filter((pid) => ranges.includes(byId.get(pid)?.age_range ?? '')).length;
    return { key: bandLabel(ranges), ranges, value, display: peopleForFunder(value, below) };
  });
  const goals = ds.goals.map((g) => goalFigure(ds, st, g, period.end));

  return {
    period,
    smallBelow: below,
    metrics,
    attendanceByGroup,
    retentionByGroup,
    ageBreakdown: {
      total: { value: m.served.length, display: peopleForFunder(m.served.length, below) },
      cells,
      footnote: bands.some((b) => b.length > 1) ? combinedFootnote(below) : null,
    },
    goals,
    notes: dataNotes(ds, st, findings, period, goals),
  };
}

export const EXIT_NOTE = 'Where staff confirmed that a participant with no activity for 30 or more days had left, their exit date is their last activity.';

/**
 * Notes a funder needs to read the figures: how an answer on Check changed the
 * counting, goals without a forecast, and a goal whose status isn't shown. A
 * finding nobody answered stays on the staff side, and the report counts only
 * what was logged. A note shows only on the templates it applies to.
 */
export function dataNotes(ds: Dataset, st: State, findings: Finding[], period: Period, goals: GoalFigure[]): DataNote[] {
  const inPeriod = (d: string) => d >= period.start && d <= period.end;
  const groupName = (id: string) => ds.groups.find((g) => g.id === id)?.name ?? id;
  const all = TEMPLATES.map((t) => t.id);
  const showing = (goalId: string) => TEMPLATES.filter((t) => templateGoals(t).includes(goalId)).map((t) => t.id);
  // Only a template that reports sessions delivered is told the session counted there.
  const delivered = TEMPLATES.filter((t) => templateMetrics(t).includes('sessions_delivered')).map((t) => t.id);
  const notDelivered = all.filter((t) => !delivered.includes(t));
  const notes: DataNote[] = [];
  let exitNote = false;
  for (const f of findings) {
    const a = st.answers[f.id];
    if (f.kind === 'session_not_logged' && inPeriod(f.date) && a === 'ran_not_recorded') {
      const head = `${groupName(f.groupId)}, ${fmtDay(f.date)}: ran, but attendance wasn't recorded.`;
      notes.push({ findingId: f.id, kind: 'session_ran_not_recorded', templates: delivered, text: `${head} Counted as delivered and left out of the attendance rate.` });
      notes.push({ findingId: f.id, kind: 'session_ran_not_recorded', templates: notDelivered, text: `${head} Left out of the attendance rate.` });
    }
    // One note for every exit set by an answer, in any period it changes. No
    // group or date, so it can't point to a person.
    if (f.kind === 'inactive_participant' && a === 'left_program' && f.lastActivity <= period.end && !exitNote) {
      exitNote = true;
      notes.push({ findingId: 'exit-by-answer', kind: 'exit_by_answer', templates: all, text: EXIT_NOTE });
    }
    if (f.kind === 'goal_no_due_date') {
      const goal = ds.goals.find((g) => g.id === f.goalId);
      if (goal) notes.push({ findingId: f.id, kind: f.kind, templates: showing(f.goalId), text: `${goal.name} has no due date, so it shows progress without a forecast.` });
    }
  }
  for (const g of goals) {
    if (g.shownStatus === 'Not shown') {
      notes.push({ findingId: `withheld-${g.id}`, kind: 'goal_status_withheld', templates: showing(g.id), text: `${g.name}: fewer than ${st.smallBelow} so far, so its status and forecast aren't shown. Either one would say how many.` });
    }
  }
  return notes.filter((n) => n.templates.length);
}

// ---------- the report model ----------

/** Points at the rows behind a number. Resolved by lib/trace.ts. */
export type TraceRef =
  | { kind: 'metric'; metric: MetricId; groupId?: string }
  | { kind: 'age'; band: string | null }
  | { kind: 'goal'; goalId: string; part: 'value' | 'target' | 'forecast' };

export const refKey = (r: TraceRef): string =>
  r.kind === 'metric' ? `metric:${r.metric}${r.groupId ? `:${r.groupId}` : ''}` : r.kind === 'age' ? `age:${r.band ?? 'total'}` : `goal:${r.goalId}:${r.part}`;

export interface FigureView {
  ref: TraceRef;
  label: string;
  definition: string;
  kind: MetricKind;
  value: number | null;
  display: string;
}

export interface BarView {
  ref: TraceRef;
  label: string;
  value: number | null;
  display: string;
}

export interface GoalView {
  id: string;
  name: string;
  kind: MetricKind;
  value: number | null;
  display: string;
  target: number;
  targetDisplay: string;
  due: string;
  status: ShownStatus;
  /** Unrounded forecast, or null when there is none or it's withheld. */
  forecast: number | null;
  forecastDisplay: string | null;
  forecastLine: string | null;
}

export type SummaryPart = { text: string; ref?: TraceRef };

export type SectionView =
  | {
      type: 'figures';
      id: string;
      title: string;
      figures: FigureView[];
      breakdown?: { title: string; cells: (AgeBand & { ref: TraceRef })[]; total: { value: number; display: string; ref: TraceRef }; footnote: string | null };
      chart?: { title: string; metric: MetricId; bars: BarView[] };
    }
  | { type: 'goals'; id: string; title: string; asOf: string; goals: GoalView[] }
  | { type: 'summary'; id: string; title: string; parts: SummaryPart[]; label: string }
  | { type: 'notes'; id: string; title: string; notes: string[] };

export interface Report {
  templateId: TemplateId;
  /** The privacy cutoff: people counts under it show as "<cutoff". */
  smallBelow: number;
  templateName: string;
  periodId: Period['id'];
  period: Period;
  orgName: string;
  subject: string;
  asOf: string;
  sampleLabel: string;
  sections: SectionView[];
}

const GOAL_KIND: Record<GoalFigure['metric'], MetricKind> = {
  new_participants: 'people',
  participant_hours: 'hours',
  assignment_submissions: 'count',
  attendance_rate: 'percent',
};

/** A withheld share inside a sentence: "and a withheld share of them saw their score go up". */
export const WITHHELD_SHARE = 'a withheld share';

/** A goal status as words that finish "the goal is ...". */
export const STATUS_PHRASE: Record<ShownStatus, string> = {
  Met: 'met',
  'On track': 'on track',
  Behind: 'behind',
  'Past due': 'past due',
  'No due date': 'open, with no due date',
  'Not shown': 'not rated while it counts fewer than 5 people',
};
const statusPhrase = (s: ShownStatus, below: number) => (s === 'Not shown' ? `not rated while it counts fewer than ${below} people` : STATUS_PHRASE[s]);

export function renderSlot(slot: Slot, f: PeriodFigures): SummaryPart {
  const src = slot.source;
  if (src.from === 'period') return { text: f.period.long };
  let value: number | null;
  let display: string;
  let ref: TraceRef;
  if (src.from === 'metric') {
    ({ value, display } = f.metrics[src.metric]);
    ref = { kind: 'metric', metric: src.metric };
  } else {
    const g = f.goals.find((x) => x.id === src.goalId);
    if (!g) throw new Error(`no goal ${src.goalId}`);
    const goalRef: TraceRef = { kind: 'goal', goalId: src.goalId, part: 'value' };
    if (src.part === 'status') return { text: statusPhrase(g.shownStatus, f.smallBelow), ref: goalRef };
    if (src.part === 'due') return { text: g.dueDate ? fmtLongDate(g.dueDate) : 'no due date', ref: goalRef };
    ({ value, display } = { value: g.target, display: g.targetDisplay });
    ref = { kind: 'goal', goalId: src.goalId, part: 'target' };
  }
  if (value === null) return { text: display, ref };
  if (display === WITHHELD) return { text: WITHHELD_SHARE, ref };
  switch (slot.kind) {
    // A 0 reads "no": "no new participants joined", not "0 new participants joined".
    case 'people': return { text: value === 0 ? 'no' : value < f.smallBelow ? `fewer than ${f.smallBelow}` : commas(value), ref };
    case 'count': return { text: commas(value), ref };
    case 'hours': return { text: fmtHours(toHundredths(value)), ref };
    default: return { text: display, ref };
  }
}

/** Splits the AI-drafted text on its slots and fills each from the engine. */
export function renderSummary(t: Template, f: PeriodFigures): SummaryPart[] {
  const parts: SummaryPart[] = [];
  let last = 0;
  for (const match of t.narrative.matchAll(/\{([a-z0-9_]+)\}/g)) {
    if (match.index! > last) parts.push({ text: t.narrative.slice(last, match.index) });
    const slot = t.slots[match[1]];
    if (!slot) throw new Error(`${t.id}: summary uses unknown slot {${match[1]}}`);
    parts.push(renderSlot(slot, f));
    last = match.index! + match[0].length;
  }
  if (last < t.narrative.length) parts.push({ text: t.narrative.slice(last) });
  return parts;
}

export function reportFromFigures(ds: Dataset, f: PeriodFigures, templateId: TemplateId): Report {
  const t = templateById(templateId);
  const notes = f.notes.filter((n) => n.templates.includes(t.id)).map((n) => n.text);
  // A notes section with nothing in it is left off the page.
  const sections: SectionView[] = t.sections.filter((s) => s.type !== 'notes' || notes.length).map((s): SectionView => {
    if (s.type === 'figures') {
      const view: SectionView = {
        type: 'figures',
        id: s.id,
        title: s.title,
        figures: s.metrics.map((id) => ({
          ref: { kind: 'metric', metric: id },
          label: METRICS[id].label,
          definition: METRICS[id].definition,
          kind: METRICS[id].kind,
          // A withheld number draws no meter or bar either.
          value: f.metrics[id].display === WITHHELD ? null : f.metrics[id].value,
          display: f.metrics[id].display,
        })),
      };
      if (s.breakdown === 'age_range') {
        view.breakdown = {
          title: 'Participants served by age range',
          cells: f.ageBreakdown.cells.map((c) => ({ ...c, ref: { kind: 'age', band: c.key } })),
          total: { ...f.ageBreakdown.total, ref: { kind: 'age', band: null } },
          footnote: f.ageBreakdown.footnote,
        };
      }
      if (s.chart) {
        const rows = s.chart === 'attendance_rate' ? f.attendanceByGroup : f.retentionByGroup;
        view.chart = {
          title: `${METRICS[s.chart].label} by group`,
          metric: s.chart,
          bars: rows.map((r) => ({ ref: { kind: 'metric', metric: s.chart!, groupId: r.groupId }, label: r.groupName, value: r.display === WITHHELD ? null : r.value, display: r.display })),
        };
      }
      return view;
    }
    if (s.type === 'goals') {
      return {
        type: 'goals',
        id: s.id,
        title: s.title,
        asOf: f.period.end,
        goals: s.goals.map((id) => {
          const g = f.goals.find((x) => x.id === id);
          if (!g) throw new Error(`no goal ${id}`);
          return {
            id: g.id,
            name: g.name,
            kind: GOAL_KIND[g.metric],
            value: g.value,
            display: g.display,
            target: g.target,
            targetDisplay: g.targetDisplay,
            due: g.dueDate ? fmtDate(g.dueDate) : 'Not set',
            status: g.shownStatus,
            forecast: g.forecastDisplay ? g.forecast : null,
            forecastDisplay: g.forecastDisplay,
            forecastLine: g.forecastLine,
          };
        }),
      };
    }
    if (s.type === 'summary') return { type: 'summary', id: s.id, title: s.title, parts: renderSummary(t, f), label: SUMMARY_LABEL };
    return { type: 'notes', id: s.id, title: s.title, notes };
  });
  return {
    templateId: t.id,
    smallBelow: f.smallBelow,
    templateName: t.name,
    periodId: f.period.id,
    period: f.period,
    orgName: ds.orgName,
    subject: `workstream, ${ds.workstream}`,
    asOf: f.period.end,
    sampleLabel: ds.sampleLabel,
    sections,
  };
}

export function buildReport(ds: Dataset, findings: Finding[], answers: Answers, templateId: TemplateId, periodId: Period['id'], smallBelow = DEFAULT_SMALL_BELOW): Report {
  const st = applyAnswers(ds, findings, answers, smallBelow);
  return reportFromFigures(ds, computePeriod(ds, st, findings, periodById(periodId)), templateId);
}

/** Every number on a report, keyed by refKey, with a label, in page order. */
export function reportFigures(r: Report): Map<string, { label: string; display: string }> {
  const out = new Map<string, { label: string; display: string }>();
  for (const s of r.sections) {
    if (s.type === 'figures') {
      for (const f of s.figures) out.set(refKey(f.ref), { label: f.label, display: f.display });
      if (s.breakdown) {
        for (const c of s.breakdown.cells) out.set(refKey(c.ref), { label: `Participants served, age ${c.key}`, display: c.display });
        out.set(refKey(s.breakdown.total.ref), { label: 'Participants served, all ages', display: s.breakdown.total.display });
      }
      if (s.chart) for (const b of s.chart.bars) out.set(refKey(b.ref), { label: `${METRICS[s.chart.metric].label}, ${b.label}`, display: b.display });
    }
    if (s.type === 'goals') {
      for (const g of s.goals) {
        out.set(`goal:${g.id}:value`, { label: `${g.name}, progress`, display: g.display });
        out.set(`goal:${g.id}:forecast`, { label: `${g.name}, forecast`, display: g.forecastDisplay ?? 'none' });
        out.set(`goal:${g.id}:status`, { label: `${g.name}, status`, display: g.status });
      }
    }
  }
  return out;
}

/** Every trace a report can open: each number, the goal targets, and the summary's links. */
export function reportRefs(r: Report): Set<string> {
  const out = new Set<string>();
  for (const s of r.sections) {
    if (s.type === 'figures') {
      for (const f of s.figures) out.add(refKey(f.ref));
      if (s.breakdown) for (const c of [...s.breakdown.cells, s.breakdown.total]) out.add(refKey(c.ref));
      if (s.chart) for (const b of s.chart.bars) out.add(refKey(b.ref));
    }
    if (s.type === 'goals') {
      for (const g of s.goals) {
        out.add(`goal:${g.id}:value`).add(`goal:${g.id}:target`);
        if (g.forecastDisplay) out.add(`goal:${g.id}:forecast`);
      }
    }
    if (s.type === 'summary') for (const p of s.parts) if (p.ref) out.add(refKey(p.ref));
  }
  return out;
}

/** Every traceable number on a report, keyed by refKey, for spotting what changed. */
export function reportNumbers(r: Report): Map<string, string> {
  return new Map([...reportFigures(r)].map(([k, v]) => [k, v.display]));
}

export interface FigureChange {
  key: string;
  label: string;
  before: string;
  after: string;
  /** The templates that show this number. */
  templates: TemplateId[];
}

/** Every number that differs between two sets of answers, on either template. */
export function changedFigures(ds: Dataset, findings: Finding[], before: Answers, after: Answers, periodId: Period['id'], smallBelow = DEFAULT_SMALL_BELOW): FigureChange[] {
  const out = new Map<string, FigureChange>();
  for (const t of TEMPLATES) {
    const was = reportFigures(buildReport(ds, findings, before, t.id, periodId, smallBelow));
    for (const [key, now] of reportFigures(buildReport(ds, findings, after, t.id, periodId, smallBelow))) {
      const old = was.get(key);
      if (!old || old.display === now.display) continue;
      const seen = out.get(key);
      if (seen) seen.templates.push(t.id);
      else out.set(key, { key, label: now.label, before: old.display, after: now.display, templates: [t.id] });
    }
  }
  return [...out.values()];
}
