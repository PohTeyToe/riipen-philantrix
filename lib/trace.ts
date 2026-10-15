// The staff view behind any number: its definition, the arithmetic, and the
// rows it was counted from. This is the only place names are joined to
// figures, and none of it reaches the funder copy.

import { periodById, type Dataset, type Period } from './data';
import { goalFigure, measure, type Measure } from './engine';
import { applyAnswers, type Answers, type Finding, type State } from './findings';
import { commas, fmtDate, fmtDay, fmtDecimalPrecise, fmtShortDate } from './format';
import { METRICS, type MetricId } from './metrics';
import { isSmall, peopleForFunder, suppressBreakdown } from './privacy';
import type { TraceRef } from './report';

export type RowTone = 'absent' | 'duplicate' | 'answered' | 'left';

export interface TraceRow {
  cells: string[];
  tone?: RowTone;
}

export interface TraceView {
  title: string;
  scope: string;
  /** The true value, as staff see it. */
  value: string;
  /** What the funder copy shows instead, when it hides the true count. */
  funderShows: string | null;
  /** Why the funder copy differs. */
  staffNote: string | null;
  facts: { label: string; value: string }[];
  formula: string;
  arithmetic: string[];
  columns: string[];
  /** Index of numeric columns, right-aligned. */
  numeric: number[];
  rows: TraceRow[];
  rowsCaption: string;
}

const plural = (n: number, one: string, many: string) => `${commas(n)} ${n === 1 ? one : many}`;

function metricRows(metric: MetricId, m: Measure, ds: Dataset, st: State): Pick<TraceView, 'columns' | 'numeric' | 'rows' | 'rowsCaption'> {
  const person = new Map(st.people.map((p) => [p.id, p]));
  const name = (pid: string) => person.get(pid)?.display_name ?? pid;
  const group = (gid: string) => ds.groups.find((g) => g.id === gid)?.name ?? gid;
  const sessionsAttended = (pid: string) => m.attendance.filter((e) => e.participant_id === pid).length;

  switch (metric) {
    case 'participants_served':
      return {
        columns: ['Participant', 'Group', 'Age range', 'Sessions attended'],
        numeric: [3],
        rows: m.served.map((pid) => ({ cells: [name(pid), group(person.get(pid)!.group_id), person.get(pid)!.age_range, String(sessionsAttended(pid))] })),
        rowsCaption: plural(m.served.length, 'participant', 'participants'),
      };
    case 'new_participants':
      return {
        columns: ['Participant', 'Group', 'Joined'],
        numeric: [],
        rows: m.newParticipants.map((p) => ({ cells: [p.display_name, group(p.group_id), fmtShortDate(p.join_date)] })),
        rowsCaption: m.newParticipants.length ? plural(m.newParticipants.length, 'participant', 'participants') : 'Nobody joined in this period.',
      };
    case 'sessions_delivered':
      return {
        columns: ['Date', 'Group', 'Attended', 'Counted because'],
        numeric: [2],
        rows: m.sessions.map((s) => ({
          cells: [fmtDay(s.date), group(s.groupId), s.source === 'logged' ? String(s.attendees) : 'Not recorded', s.source === 'logged' ? 'Attendance logged' : 'Your answer: ran'],
          tone: s.source === 'answered' ? 'answered' : undefined,
        })),
        rowsCaption: m.sessions.length ? plural(m.sessions.length, 'session', 'sessions') : 'No sessions in this period.',
      };
    case 'participant_hours': {
      const rows: TraceRow[] = [
        ...m.attendance.map((e) => ({ e, dup: false })),
        ...m.duplicates.map((e) => ({ e, dup: true })),
      ]
        .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.group_id.localeCompare(b.e.group_id) || a.e.participant_id.localeCompare(b.e.participant_id) || Number(a.dup) - Number(b.dup))
        .map(({ e, dup }) => ({ cells: [fmtDay(e.date), group(e.group_id), name(e.participant_id), dup ? 'Counted once' : String(e.units)], tone: dup ? 'duplicate' : undefined }));
      return {
        columns: ['Date', 'Group', 'Participant', 'Hours'],
        numeric: [3],
        rows,
        rowsCaption: `${plural(m.attendance.length, 'Attendances record', 'Attendances records')}${m.duplicates.length ? `, plus ${plural(m.duplicates.length, 'duplicate', 'duplicates')}` : ''}`,
      };
    }
    case 'attendance_rate': {
      const absent = m.seats.filter((s) => !s.attended).length;
      return {
        columns: ['Date', 'Group', 'Participant', 'Seat'],
        numeric: [],
        rows: m.seats.map((s) => ({
          cells: [fmtDay(s.date), group(s.groupId), name(s.participantId), s.offRoster ? 'Attended, not on roster' : s.attended ? 'Attended' : 'Absent'],
          tone: s.attended ? undefined : 'absent',
        })),
        rowsCaption: m.seats.length
          ? `${plural(m.offered, 'seat', 'seats')} offered: ${commas(m.attended)} attended, ${commas(absent)} absent. Absences have no record, so these rows come from the roster and the sessions held.`
          : 'No sessions with attendance logged in this period.',
      };
    }
    case 'retention_rate':
      return {
        columns: ['Participant', 'Group', 'Joined', 'Exit date', `On ${fmtShortDate(m.end)}`],
        numeric: [],
        rows: m.enrolledAny.map((p) => {
          const retained = m.retained.includes(p);
          const byAnswer = st.exitedByAnswer.has(p.id);
          return {
            cells: [p.display_name, group(p.group_id), fmtShortDate(p.join_date), p.exit_date ? `${fmtShortDate(p.exit_date)}${byAnswer ? ' (your answer)' : ''}` : '', retained ? 'Enrolled' : 'Left'],
            tone: retained ? undefined : 'left',
          };
        }),
        rowsCaption: `${plural(m.enrolledAny.length, 'participant', 'participants')} enrolled during the period, ${commas(m.retained.length)} still enrolled on the last day`,
      };
    case 'assignment_submissions':
      return {
        columns: ['Date', 'Group', 'Participant'],
        numeric: [],
        rows: m.submissions.map((e) => ({ cells: [fmtDay(e.date), group(e.group_id), name(e.participant_id)] })),
        rowsCaption: plural(m.submissions.length, 'Assignment Submissions record', 'Assignment Submissions records'),
      };
    case 'submissions_per_participant':
      return {
        columns: ['Participant', 'Group', 'Submissions'],
        numeric: [2],
        rows: m.served.map((pid) => ({ cells: [name(pid), group(person.get(pid)!.group_id), String(m.submissions.filter((e) => e.participant_id === pid).length)] })),
        rowsCaption: `${plural(m.served.length, 'participant', 'participants')} served, ${plural(m.submissions.length, 'submission', 'submissions')}`,
      };
  }
}

function metricFacts(metric: MetricId) {
  const d = METRICS[metric];
  return [
    { label: 'Records', value: d.activityType },
    { label: 'Counted as', value: d.aggregation },
    ...(d.denominator ? [{ label: 'Divided by', value: d.denominator }] : []),
    { label: 'Dates', value: d.period },
  ];
}

export function explain(ds: Dataset, findings: Finding[], answers: Answers, periodId: Period['id'], ref: TraceRef): TraceView {
  const period = periodById(periodId);
  const st = applyAnswers(ds, findings, answers);
  const scope = period.label;

  if (ref.kind === 'metric') {
    const m = measure(ds, st, period.start, period.end, ref.groupId ?? null);
    const def = METRICS[ref.metric];
    const v = def.compute(m);
    const groupName = ref.groupId ? ds.groups.find((g) => g.id === ref.groupId)?.name : null;
    const empty = v.value === null && ref.groupId ? (ref.metric === 'attendance_rate' ? `No sessions in ${period.short}` : `No participants in ${period.short}`) : v.display;
    return {
      title: groupName ? `${def.label}, ${groupName}` : def.label,
      scope: groupName ? `${scope}, ${groupName} only` : scope,
      value: v.value === null ? empty : v.staffDisplay,
      funderShows: v.display !== v.staffDisplay ? v.display : null,
      staffNote: v.display !== v.staffDisplay ? 'Counts of 1 to 4 people could identify someone.' : null,
      facts: metricFacts(ref.metric),
      formula: def.formula,
      arithmetic: [v.arithmetic],
      ...metricRows(ref.metric, m, ds, st),
    };
  }

  if (ref.kind === 'age') {
    const m = measure(ds, st, period.start, period.end);
    const base = metricRows('participants_served', m, ds, st);
    const person = new Map(st.people.map((p) => [p.id, p]));
    const ids = ref.ageRange ? m.served.filter((pid) => person.get(pid)?.age_range === ref.ageRange) : m.served;
    const rows = ref.ageRange ? base.rows.filter((r) => r.cells[2] === ref.ageRange) : base.rows;
    const n = ids.length;
    // What the funder copy shows for this cell, from the same rule the report uses.
    const counts = ds.ageRanges.map((r) => ({ key: r, value: m.served.filter((pid) => person.get(pid)?.age_range === r).length }));
    const cell = ref.ageRange ? suppressBreakdown(counts).cells.find((c) => c.key === ref.ageRange) : null;
    const shown = cell ? cell.display : peopleForFunder(n);
    let staffNote: string | null = null;
    if (cell?.hidden === 'secondary') {
      const small = counts.find((c) => isSmall(c.value));
      staffNote = `The ${small?.key} cell is under 5. With only that cell hidden, it could be worked out from the total, so the next smallest cell is hidden too.`;
    } else if (isSmall(n)) {
      staffNote = 'Counts of 1 to 4 people could identify someone.';
    }
    return {
      title: ref.ageRange ? `Participants served, age ${ref.ageRange}` : 'Participants served, all ages',
      scope,
      value: commas(n),
      funderShows: shown !== commas(n) ? shown : null,
      staffNote,
      facts: [...metricFacts('participants_served'), { label: 'Grouped by', value: 'Age range, a custom field on each participant' }],
      formula: `${METRICS.participants_served.formula} Then split by age range. Counts of 1 to 4 people show as "<5" in funder copy.`,
      arithmetic: [ref.ageRange ? `${plural(n, 'participant', 'participants')} aged ${ref.ageRange} with an Attendances record` : `${plural(n, 'participant', 'participants')} with an Attendances record`],
      columns: base.columns,
      numeric: base.numeric,
      rows,
      rowsCaption: plural(rows.length, 'participant', 'participants'),
    };
  }

  // Goals
  const goal = ds.goals.find((g) => g.id === ref.goalId);
  if (!goal) throw new Error(`no goal ${ref.goalId}`);
  const g = goalFigure(ds, st, goal, period.end);
  const metricId = goal.metric as MetricId;
  const v = METRICS[metricId].compute(g.measure);
  const arithmetic = [`Progress from ${fmtShortDate(goal.start_date)} to ${fmtShortDate(g.asOf)}: ${v.arithmetic}`];
  if (g.windowDays !== null && g.forecast !== null) {
    const valueText = goal.metric === 'participant_hours' ? (g.basis.n / 100).toFixed(1) : commas(g.basis.n);
    arithmetic.push(`Forecast: ${valueText} × ${g.windowDays} days in the goal ÷ ${g.elapsedDays} days so far = ${fmtDecimalPrecise(g.basis.n * g.windowDays, g.basis.scale * g.elapsedDays)}, shown as ${g.forecastDisplay}`);
  }
  arithmetic.push(statusReason(g.status, g.dueDate, g.asOf, g.targetDisplay, g.forecastDisplay));
  const rows = metricRows(metricId, g.measure, ds, st);
  return {
    title: goal.name,
    scope: `Tracked Goal, as of ${fmtDate(g.asOf)}`,
    value: ref.part === 'target' ? g.targetDisplay : ref.part === 'forecast' && g.forecastDisplay ? g.forecastDisplay : g.staffDisplay,
    funderShows: ref.part === 'value' && g.display !== g.staffDisplay ? g.display : null,
    staffNote: ref.part === 'value' && g.display !== g.staffDisplay ? 'Counts of 1 to 4 people could identify someone.' : null,
    facts: [
      { label: 'Measures', value: METRICS[metricId].label },
      { label: 'Target', value: g.targetDisplay },
      { label: 'Starts', value: fmtDate(goal.start_date) },
      { label: 'Due', value: goal.due_date ? fmtDate(goal.due_date) : 'No due date' },
      { label: 'Status', value: g.status },
    ],
    formula:
      'Progress counts the goal\'s metric from its start date to the as-of date. Met if progress reaches the target. Past due if the due date has passed first. With no due date there is no forecast. Otherwise the forecast is progress × days in the goal ÷ days so far: On track if it reaches the target, Behind if not.',
    arithmetic,
    ...rows,
  };
}

function statusReason(status: string, due: string | null, asOf: string, target: string, forecast: string | null): string {
  switch (status) {
    case 'Met': return `Progress has reached the target of ${target}, so the status is Met.`;
    case 'Past due': return `The due date, ${fmtShortDate(due!)}, is before ${fmtShortDate(asOf)} and the target of ${target} isn't met, so the status is Past due.`;
    case 'No due date': return 'There is no due date, so progress shows without a forecast.';
    case 'On track': return `The forecast of ${forecast} reaches the target of ${target}, so the status is On track.`;
    default: return `The forecast of ${forecast} is short of the target of ${target}, so the status is Behind.`;
  }
}
