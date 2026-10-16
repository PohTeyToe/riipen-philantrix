// The staff view behind any number: its definition, the arithmetic, and the
// rows it was counted from. This is the only place names are joined to
// figures, and none of it reaches the funder copy.

import { periodById, type Dataset, type Period } from './data';
import { goalFigure, measure, type Measure } from './engine';
import { applyAnswers, type Answers, type Finding, type State } from './findings';
import { commas, fmtDate, fmtDateIn, fmtDay, fmtHoursExact, fmtShortDate, fmtWholePrecise } from './format';
import { METRICS, type MetricId } from './metrics';
import { DEFAULT_SMALL_BELOW, bandLabel, isSmall, peopleForFunder, smallRange } from './privacy';
import { ageBands, type TraceRef } from './report';
import { seatKey } from './edits';

export type RowTone = 'absent' | 'duplicate' | 'answered' | 'left';

export interface TraceRow {
  cells: string[];
  tone?: RowTone;
  /** Where the row sits on the register, so the page can point at it. */
  at?: { participantId?: string; seat?: string; session?: string };
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
const smallNote = (below: number) => `Counts of ${smallRange(below)} could identify someone.`;

function metricRows(metric: MetricId, m: Measure, ds: Dataset, st: State): Pick<TraceView, 'columns' | 'numeric' | 'rows' | 'rowsCaption'> {
  const person = new Map(st.people.map((p) => [p.id, p]));
  const name = (pid: string) => person.get(pid)?.display_name ?? pid;
  const group = (gid: string) => ds.groups.find((g) => g.id === gid)?.name ?? gid;
  const sessionsAttended = (pid: string) => m.attendance.filter((e) => e.participant_id === pid).length;
  // A date outside the report period carries its year, so "Sep 9" can't read as this September.
  const date = (iso: string) => fmtDateIn(iso, m.start, m.end);
  const checkinRows = () =>
    m.checkins.map((c) => ({
      cells: [c.participant.display_name, group(c.participant.group_id), String(c.intake), `${c.checkin.confidence} on ${date(c.checkin.date)}`, c.improved ? 'Improved' : c.checkin.confidence === c.intake ? 'Same' : 'Lower'],
      tone: c.improved ? undefined : ('absent' as const),
      at: { participantId: c.participant.id, seat: seatKey(c.participant.id, c.participant.group_id, c.checkin.date) },
    }));

  switch (metric) {
    case 'participants_served':
      return {
        columns: ['Participant', 'Group', 'Age range', 'Sessions attended'],
        numeric: [3],
        rows: m.served.map((pid) => ({ cells: [name(pid), group(person.get(pid)!.group_id), person.get(pid)!.age_range, String(sessionsAttended(pid))], at: { participantId: pid } })),
        rowsCaption: plural(m.served.length, 'participant', 'participants'),
      };
    case 'new_participants':
      return {
        columns: ['Participant', 'Group', 'Joined'],
        numeric: [],
        rows: m.newParticipants.map((p) => ({ cells: [p.display_name, group(p.group_id), date(p.join_date)], at: { participantId: p.id } })),
        rowsCaption: m.newParticipants.length ? plural(m.newParticipants.length, 'participant', 'participants') : 'Nobody joined in this period.',
      };
    case 'sessions_delivered':
      return {
        columns: ['Date', 'Group', 'Attended', 'Counted because'],
        numeric: [2],
        rows: m.sessions.map((s) => ({
          cells: [fmtDay(s.date), group(s.groupId), s.source === 'logged' ? String(s.attendees) : 'Not recorded', s.source === 'logged' ? 'Attendance logged' : 'Your answer: ran'],
          tone: s.source === 'answered' ? 'answered' : undefined,
          at: { session: `${s.groupId}|${s.date}` },
        })),
        rowsCaption: m.sessions.length ? plural(m.sessions.length, 'session', 'sessions') : 'No sessions in this period.',
      };
    case 'participant_hours': {
      const rows: TraceRow[] = [
        ...m.attendance.map((e) => ({ e, dup: false })),
        ...m.duplicates.map((e) => ({ e, dup: true })),
      ]
        .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.group_id.localeCompare(b.e.group_id) || a.e.participant_id.localeCompare(b.e.participant_id) || Number(a.dup) - Number(b.dup))
        .map(({ e, dup }) => ({ cells: [fmtDay(e.date), group(e.group_id), name(e.participant_id), dup ? 'Counted once' : String(e.units)], tone: dup ? 'duplicate' : undefined, at: { seat: seatKey(e.participant_id, e.group_id, e.date) } }));
      return {
        columns: ['Date', 'Group', 'Participant', 'Hours'],
        numeric: [3],
        rows,
        rowsCaption: `${plural(m.attendance.length, 'Attendances record', 'Attendances records')}${m.duplicates.length ? `, plus ${plural(m.duplicates.length, 'duplicate', 'duplicates')}` : ''}`,
      };
    }
    case 'attendance_rate': {
      const absent = m.seats.filter((s) => !s.attended).length;
      const offRoster = m.seats.filter((s) => s.offRoster).length;
      return {
        columns: ['Date', 'Group', 'Participant', 'Seat'],
        numeric: [],
        rows: m.seats.map((s) => ({
          cells: [fmtDay(s.date), group(s.groupId), name(s.participantId), s.offRoster ? 'Attended, not on roster' : s.attended ? 'Attended' : 'Absent'],
          tone: s.attended && !s.offRoster ? undefined : 'absent',
          at: { seat: seatKey(s.participantId, s.groupId, s.date) },
        })),
        rowsCaption: m.seats.length
          ? `${plural(m.offered, 'seat', 'seats')} offered: ${commas(m.attended)} attended, ${commas(absent)} absent.${
              offRoster ? ` ${plural(offRoster, 'person', 'people')} attended while not enrolled in the group, left out of the rate.` : ''
            } Absences have no record, so these rows come from the roster and the sessions held.`
          : 'No sessions with attendance logged in this period.',
      };
    }
    case 'retention_rate':
      return {
        columns: ['Participant', 'Group', 'Joined', `On ${fmtShortDate(m.end)}`],
        numeric: [],
        rows: m.enrolledAny.map((p) => {
          const retained = m.retained.includes(p);
          const byAnswer = st.exitedByAnswer.has(p.id);
          return {
            cells: [p.display_name, group(p.group_id), date(p.join_date), retained ? 'Enrolled' : `Left ${date(p.exit_date!)}${byAnswer ? ' (your answer)' : ''}`],
            tone: retained ? undefined : 'left',
            at: { participantId: p.id },
          };
        }),
        rowsCaption: `${plural(m.enrolledAny.length, 'participant', 'participants')} enrolled during the period, ${commas(m.retained.length)} still enrolled on the last day`,
      };
    case 'enrolled_at_start':
    case 'enrolled_in_period':
    case 'participants_exited': {
      const list = metric === 'enrolled_at_start' ? m.enrolledAtStart : metric === 'enrolled_in_period' ? m.enrolledAny : m.exited;
      return {
        columns: ['Participant', 'Group', 'Joined', 'Left'],
        numeric: [],
        rows: list.map((p) => ({
          cells: [p.display_name, group(p.group_id), date(p.join_date), p.exit_date ? `${date(p.exit_date)}${st.exitedByAnswer.has(p.id) ? ' (your answer)' : ''}` : 'Enrolled'],
          at: { participantId: p.id },
        })),
        rowsCaption: list.length ? plural(list.length, 'participant', 'participants') : metric === 'participants_exited' ? 'Nobody left during the period.' : 'Nobody was enrolled.',
      };
    }
    case 'assignment_submissions':
      return {
        columns: ['Date', 'Group', 'Participant'],
        numeric: [],
        rows: m.submissions.map((e) => ({ cells: [fmtDay(e.date), group(e.group_id), name(e.participant_id)], at: { seat: seatKey(e.participant_id, e.group_id, e.date) } })),
        rowsCaption: plural(m.submissions.length, 'Assignment Submissions record', 'Assignment Submissions records'),
      };
    case 'submissions_per_participant':
      return {
        columns: ['Participant', 'Group', 'Submissions'],
        numeric: [2],
        rows: m.served.map((pid) => ({ cells: [name(pid), group(person.get(pid)!.group_id), String(m.submissions.filter((e) => e.participant_id === pid).length)], at: { participantId: pid } })),
        rowsCaption: `${plural(m.served.length, 'participant', 'participants')} served, ${plural(m.submissions.length, 'submission', 'submissions')}`,
      };
    case 'participants_checked_in':
    case 'confidence_improved': {
      const improved = m.checkins.filter((c) => c.improved).length;
      return {
        columns: ['Participant', 'Group', 'Intake', 'Latest check-in', 'Result'],
        numeric: [2],
        rows: checkinRows(),
        rowsCaption: m.checkins.length
          ? `${plural(m.checkins.length, 'participant', 'participants')} with a check-in, ${commas(improved)} improved. Scores are 1 to 5, from the custom field "Confidence (1 to 5)".`
          : 'No check-ins in this period.',
      };
    }
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

export function explain(ds: Dataset, findings: Finding[], answers: Answers, periodId: Period['id'], ref: TraceRef, smallBelow = DEFAULT_SMALL_BELOW): TraceView {
  const period = periodById(periodId);
  const st = applyAnswers(ds, findings, answers, smallBelow);
  const SMALL_NOTE = smallNote(smallBelow);
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
      staffNote: v.display !== v.staffDisplay ? SMALL_NOTE : null,
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
    const ranges = ref.band ? ageBands(ds, smallBelow).find((r) => bandLabel(r) === ref.band) ?? [ref.band] : null;
    const inBand = (range: string | undefined) => !ranges || (range !== undefined && ranges.includes(range));
    const rows = base.rows.filter((r) => inBand(r.cells[2]));
    const n = m.served.filter((pid) => inBand(person.get(pid)?.age_range)).length;
    const shown = peopleForFunder(n, smallBelow);
    const each = ranges && ranges.length > 1 ? ranges.map((r) => `${commas(m.served.filter((pid) => person.get(pid)?.age_range === r).length)} aged ${r}`) : null;
    return {
      title: ref.band ? `Participants served, age ${ref.band}` : 'Participants served, all ages',
      scope,
      value: commas(n),
      funderShows: shown !== commas(n) ? shown : null,
      staffNote: isSmall(n, smallBelow) ? SMALL_NOTE : null,
      facts: [...metricFacts('participants_served'), { label: 'Grouped by', value: 'Age range, a custom field on each participant' }],
      formula: `${METRICS.participants_served.formula} Then split by age range. An age range with ${smallRange(smallBelow)} in this quarter or any month of it is combined with the next range, the same way in every period, so a small group never shows on its own.`,
      arithmetic: [
        each
          ? `${each.join(' + ')} = ${plural(n, 'participant', 'participants')} with an Attendances record`
          : ref.band
            ? `${plural(n, 'participant', 'participants')} aged ${ref.band} with an Attendances record`
            : `${plural(n, 'participant', 'participants')} with an Attendances record`,
      ],
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
    const valueText = goal.metric === 'participant_hours' ? fmtHoursExact(g.basis.n) : commas(g.basis.n);
    arithmetic.push(`Forecast: ${valueText} × ${g.windowDays} days in the goal ÷ ${g.elapsedDays} days so far = ${fmtWholePrecise(g.basis.n * g.windowDays, g.basis.scale * g.elapsedDays)}, shown as ${g.forecastStaffDisplay}`);
  }
  arithmetic.push(statusReason(g.status, g.dueDate, g.targetDisplay, g.forecastStaffDisplay));
  const rows = metricRows(metricId, g.measure, ds, st);
  const withheld = g.shownStatus === 'Not shown';
  const hides = ref.part !== 'target' && (withheld || g.display !== g.staffDisplay);
  return {
    title: goal.name,
    scope: `Tracked Goal, as of ${fmtDate(g.asOf)}`,
    value: ref.part === 'target' ? g.targetDisplay : ref.part === 'forecast' && g.forecastStaffDisplay ? g.forecastStaffDisplay : g.staffDisplay,
    funderShows: hides ? `${g.display}${withheld ? ', with no status or forecast' : ''}` : null,
    staffNote: hides ? (withheld ? `${SMALL_NOTE} The status and the forecast are worked out from the count, so either would give it away.` : SMALL_NOTE) : null,
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

function statusReason(status: string, due: string | null, target: string, forecast: string | null): string {
  switch (status) {
    case 'Met': return `Progress has reached the target of ${target}, so the status is Met.`;
    case 'Past due': return `The goal reached its due date, ${fmtShortDate(due!)}, without meeting the target of ${target}, so the status is Past due.`;
    case 'No due date': return 'There is no due date, so progress shows without a forecast.';
    case 'On track': return `The forecast of ${forecast} reaches the target of ${target}, so the status is On track.`;
    default: return `The forecast of ${forecast} is short of the target of ${target}, so the status is Behind.`;
  }
}
