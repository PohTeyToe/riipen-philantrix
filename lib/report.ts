// Builds what a funder sees: the figures for one period, the data notes, and
// the report model the page, the PDF and the Excel file all render from.
// Nothing in this file carries a participant's name. The trace panel (staff
// view) rebuilds its rows separately, in lib/trace.ts.

import { periodById, type Dataset, type Period } from './data';
import { goalFigure, measure, type GoalFigure } from './engine';
import { applyAnswers, type Answers, type Finding, type State } from './findings';
import { commas, fmtDate, fmtDay, fmtHours, fmtPercent, fmtShortDate, toHundredths } from './format';
import { METRICS, type MetricId, type MetricKind, type MetricValue } from './metrics';
import { peopleForFunder, suppressBreakdown, type BreakdownCell } from './privacy';
import { SUMMARY_LABEL, TEMPLATES, templateById, templateGoals, type Slot, type Template, type TemplateId } from './templates';

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

export interface PeriodFigures {
  period: Period;
  metrics: Record<MetricId, MetricValue>;
  attendanceByGroup: GroupRate[];
  retentionByGroup: GroupRate[];
  ageBreakdown: { total: { value: number; display: string }; cells: BreakdownCell[]; footnote: string | null };
  goals: GoalFigure[];
  notes: DataNote[];
}

export function computePeriod(ds: Dataset, st: State, findings: Finding[], period: Period): PeriodFigures {
  const m = measure(ds, st, period.start, period.end);
  const metrics = Object.fromEntries(Object.values(METRICS).map((def) => [def.id, def.compute(m)])) as Record<MetricId, MetricValue>;

  const byGroup = ds.groups.map((g) => ({ g, gm: measure(ds, st, period.start, period.end, g.id) }));
  const groupRate = (num: number, den: number, empty: string) =>
    den === 0 ? { num, den, value: null, display: empty } : { num, den, value: num / den, display: fmtPercent(num, den) };
  const attendanceByGroup = byGroup.map(({ g, gm }) => ({ groupId: g.id, groupName: g.name, ...groupRate(gm.attended, gm.offered, `No sessions in ${period.short}`) }));
  const retentionByGroup = byGroup.map(({ g, gm }) => ({ groupId: g.id, groupName: g.name, ...groupRate(gm.retained.length, gm.enrolledAny.length, `No participants in ${period.short}`) }));

  const byId = new Map(st.people.map((p) => [p.id, p]));
  const ageCounts = ds.ageRanges.map((r) => ({ key: r, value: m.served.filter((pid) => byId.get(pid)?.age_range === r).length }));
  const suppressed = suppressBreakdown(ageCounts);

  return {
    period,
    metrics,
    attendanceByGroup,
    retentionByGroup,
    ageBreakdown: { total: { value: m.served.length, display: peopleForFunder(m.served.length) }, cells: suppressed.cells, footnote: suppressed.footnote },
    goals: ds.goals.map((g) => goalFigure(ds, st, g, period.end)),
    notes: dataNotes(ds, st, findings, period),
  };
}

/** Unanswered findings never block a report. They print here instead. */
export function dataNotes(ds: Dataset, st: State, findings: Finding[], period: Period): DataNote[] {
  const inPeriod = (d: string) => d >= period.start && d <= period.end;
  const groupName = (id: string) => ds.groups.find((g) => g.id === id)?.name ?? id;
  const all = TEMPLATES.map((t) => t.id);
  const notes: DataNote[] = [];
  for (const f of findings) {
    const a = st.answers[f.id];
    if (f.kind === 'session_not_logged' && inPeriod(f.date)) {
      if (a === 'ran_not_recorded') {
        notes.push({ findingId: f.id, kind: 'session_ran_not_recorded', templates: all, text: `${groupName(f.groupId)}, ${fmtDay(f.date)}: ran, but attendance wasn't recorded. Counted as delivered and left out of the attendance rate.` });
      } else if (!a) {
        notes.push({ findingId: f.id, kind: f.kind, templates: all, text: `${groupName(f.groupId)}, ${fmtDay(f.date)}: on the schedule, but no attendance was logged. Not counted as delivered.` });
      }
    }
    if (f.kind === 'inactive_participant' && !a && f.lastActivity < period.end) {
      notes.push({ findingId: f.id, kind: f.kind, templates: all, text: `A ${groupName(f.groupId)} participant has had no activity since ${fmtShortDate(f.lastActivity)} and has no exit date. Counted as enrolled.` });
    }
    if (f.kind === 'duplicate_record' && inPeriod(f.date)) {
      notes.push({ findingId: f.id, kind: f.kind, templates: all, text: `${groupName(f.groupId)}, ${fmtDay(f.date)}: one participant was logged twice. Counted once.` });
    }
    if (f.kind === 'goal_no_due_date') {
      const goal = ds.goals.find((g) => g.id === f.goalId);
      const shownIn = TEMPLATES.filter((t) => templateGoals(t).includes(f.goalId)).map((t) => t.id);
      if (goal) notes.push({ findingId: f.id, kind: f.kind, templates: shownIn, text: `${goal.name} has no due date, so it shows progress without a forecast.` });
    }
  }
  return notes;
}

// ---------- the report model ----------

/** Points at the rows behind a number. Resolved by lib/trace.ts. */
export type TraceRef =
  | { kind: 'metric'; metric: MetricId; groupId?: string }
  | { kind: 'age'; ageRange: string | null }
  | { kind: 'goal'; goalId: string; part: 'value' | 'target' | 'forecast' };

export const refKey = (r: TraceRef): string =>
  r.kind === 'metric' ? `metric:${r.metric}${r.groupId ? `:${r.groupId}` : ''}` : r.kind === 'age' ? `age:${r.ageRange ?? 'total'}` : `goal:${r.goalId}:${r.part}`;

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
  status: GoalFigure['status'];
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
      breakdown?: { title: string; cells: (BreakdownCell & { ref: TraceRef })[]; total: { value: number; display: string; ref: TraceRef }; footnote: string | null };
      chart?: { title: string; metric: MetricId; bars: BarView[] };
    }
  | { type: 'goals'; id: string; title: string; asOf: string; goals: GoalView[] }
  | { type: 'summary'; id: string; title: string; parts: SummaryPart[]; label: string }
  | { type: 'notes'; id: string; title: string; notes: string[] };

export interface Report {
  templateId: TemplateId;
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
    ({ value, display } = src.part === 'value' ? g : { value: g.target, display: g.targetDisplay });
    ref = { kind: 'goal', goalId: src.goalId, part: src.part };
  }
  if (value === null) return { text: display, ref };
  switch (slot.kind) {
    case 'people': return { text: value >= 1 && value <= 4 ? 'fewer than 5' : commas(value), ref };
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
  const sections: SectionView[] = t.sections.map((s): SectionView => {
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
          value: f.metrics[id].value,
          display: f.metrics[id].display,
        })),
      };
      if (s.breakdown === 'age_range') {
        view.breakdown = {
          title: 'Participants served by age range',
          cells: f.ageBreakdown.cells.map((c) => ({ ...c, ref: { kind: 'age', ageRange: c.key } })),
          total: { ...f.ageBreakdown.total, ref: { kind: 'age', ageRange: null } },
          footnote: f.ageBreakdown.footnote,
        };
      }
      if (s.chart) {
        const rows = s.chart === 'attendance_rate' ? f.attendanceByGroup : f.retentionByGroup;
        view.chart = {
          title: `${METRICS[s.chart].label} by group`,
          metric: s.chart,
          bars: rows.map((r) => ({ ref: { kind: 'metric', metric: s.chart!, groupId: r.groupId }, label: r.groupName, value: r.value, display: r.display })),
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
            status: g.status,
            forecastDisplay: g.forecastDisplay,
            forecastLine: g.forecastLine,
          };
        }),
      };
    }
    if (s.type === 'summary') return { type: 'summary', id: s.id, title: s.title, parts: renderSummary(t, f), label: SUMMARY_LABEL };
    return { type: 'notes', id: s.id, title: s.title, notes: f.notes.filter((n) => n.templates.includes(t.id)).map((n) => n.text) };
  });
  return {
    templateId: t.id,
    templateName: t.name,
    periodId: f.period.id,
    period: f.period,
    orgName: ds.orgName,
    subject: `Subject: workstream, ${ds.workstream}`,
    asOf: f.period.end,
    sampleLabel: ds.sampleLabel,
    sections,
  };
}

export function buildReport(ds: Dataset, findings: Finding[], answers: Answers, templateId: TemplateId, periodId: Period['id']): Report {
  const st = applyAnswers(ds, findings, answers);
  return reportFromFigures(ds, computePeriod(ds, st, findings, periodById(periodId)), templateId);
}

/** Every traceable number on a report, keyed by refKey, for spotting what changed. */
export function reportNumbers(r: Report): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of r.sections) {
    if (s.type === 'figures') {
      for (const f of s.figures) out.set(refKey(f.ref), f.display);
      if (s.breakdown) {
        for (const c of s.breakdown.cells) out.set(refKey(c.ref), c.display);
        out.set(refKey(s.breakdown.total.ref), s.breakdown.total.display);
      }
      if (s.chart) for (const b of s.chart.bars) out.set(refKey(b.ref), b.display);
    }
    if (s.type === 'goals') {
      for (const g of s.goals) {
        out.set(`goal:${g.id}:value`, g.display);
        out.set(`goal:${g.id}:forecast`, g.forecastDisplay ?? '');
        out.set(`goal:${g.id}:status`, g.status);
      }
    }
  }
  return out;
}
