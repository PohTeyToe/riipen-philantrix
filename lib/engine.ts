// Counting. Turns records, the schedule and the gap answers into the numbers
// the metrics registry reads. Keeps the rows it counted, so the trace panel can
// show exactly what is behind each number.

import { ATTENDANCES, SUBMISSIONS, type Checkin, type Dataset, type Engagement, type Goal, type Participant } from './data';
import type { State } from './findings';
import { commas, daysBetween, fmtCount, fmtHours, fmtPercent, fmtShortDate, halfUp, toHundredths } from './format';
import { isSmall, peopleForFunder } from './privacy';

export interface Seat {
  participantId: string;
  groupId: string;
  date: string;
  attended: boolean;
  /** True when someone attended without being enrolled in the group that day. Not in the rate. */
  offRoster?: boolean;
}

export interface CheckinRow {
  participant: Participant;
  /** The participant's latest check-in in the period. */
  checkin: Checkin;
  intake: number;
  improved: boolean;
}

export interface SessionRow {
  groupId: string;
  date: string;
  source: 'logged' | 'answered';
  attendees: number;
}

export interface Measure {
  start: string;
  end: string;
  groupId: string | null;
  /** The privacy cutoff the counts are shown under (lib/privacy.ts). */
  smallBelow: number;
  /** Attendances records in range, one per person per session. Copies that disagree count at the fewest hours. */
  attendance: Engagement[];
  /** The other copies when a person is logged twice at one session. Not counted. */
  duplicates: Engagement[];
  submissions: Engagement[];
  sessions: SessionRow[];
  /** One seat per enrolled group member per session with attendance logged. */
  seats: Seat[];
  /** Seats on the roster that were filled. */
  attended: number;
  offered: number;
  hoursHundredths: number;
  served: string[];
  newParticipants: Participant[];
  enrolledAny: Participant[];
  /** Enrolled on the period's first day. */
  enrolledAtStart: Participant[];
  /** Enrolled during the period with no exit date inside it. */
  retained: Participant[];
  /** Enrolled during the period with an exit date inside it, its last day included. */
  exited: Participant[];
  /** Participants with an intake score and a check-in in the period. */
  checkins: CheckinRow[];
}

export const enrolledOn = (p: Participant, day: string): boolean =>
  p.join_date <= day && (p.exit_date === null || day <= p.exit_date);

export function measure(ds: Dataset, st: State, start: string, end: string, groupId: string | null = null): Measure {
  const inRange = (d: string) => d >= start && d <= end;
  const inGroup = (gid: string) => groupId === null || gid === groupId;
  const people = st.people.filter((p) => inGroup(p.group_id));

  const kept = new Map<string, Engagement>();
  const duplicates: Engagement[] = [];
  const submissions: Engagement[] = [];
  const attendeesBySession = new Map<string, Set<string>>();
  for (const e of ds.engagements) {
    if (!inRange(e.date) || !inGroup(e.group_id)) continue;
    if (e.activity_type === ATTENDANCES) {
      // The same person twice at one session counts once. If the copies
      // disagree, the one with fewer hours counts, so a mistake can't add
      // hours. Nothing here depends on record ids or when a record was saved,
      // so SQL picks the same copy. (Equal copies: the lower id, for display.)
      const pair = `${e.participant_id}|${e.group_id}|${e.date}`;
      const prev = kept.get(pair);
      if (prev) {
        if (e.units < prev.units || (e.units === prev.units && e.id < prev.id)) { duplicates.push(prev); kept.set(pair, e); } else duplicates.push(e);
        continue;
      }
      kept.set(pair, e);
      const s = `${e.group_id}|${e.date}`;
      if (!attendeesBySession.has(s)) attendeesBySession.set(s, new Set());
      attendeesBySession.get(s)!.add(e.participant_id);
    } else if (e.activity_type === SUBMISSIONS) {
      submissions.push(e);
    }
  }

  const sessions: SessionRow[] = [];
  const seats: Seat[] = [];
  for (const [s, attendees] of attendeesBySession) {
    const [gid, date] = s.split('|');
    sessions.push({ groupId: gid, date, source: 'logged', attendees: attendees.size });
    const roster = people.filter((p) => p.group_id === gid && enrolledOn(p, date));
    for (const p of roster) seats.push({ participantId: p.id, groupId: gid, date, attended: attendees.has(p.id) });
    const rosterIds = new Set(roster.map((p) => p.id));
    for (const pid of attendees) if (!rosterIds.has(pid)) seats.push({ participantId: pid, groupId: gid, date, attended: true, offRoster: true });
  }
  for (const s of st.ranNotRecorded) {
    const [gid, date] = s.split('|');
    if (inRange(date) && inGroup(gid) && !attendeesBySession.has(s)) sessions.push({ groupId: gid, date, source: 'answered', attendees: 0 });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.groupId.localeCompare(b.groupId));
  seats.sort((a, b) => a.date.localeCompare(b.date) || a.groupId.localeCompare(b.groupId) || a.participantId.localeCompare(b.participantId));

  const enrolledAny = people.filter((p) => p.join_date <= end && (p.exit_date === null || p.exit_date >= start));

  // The latest check-in in range. Two on the same day: the lower score
  // counts, so a double entry can't make an outcome look better.
  const latest = new Map<string, Checkin>();
  for (const c of ds.checkins) {
    if (!inRange(c.date)) continue;
    const prev = latest.get(c.participant_id);
    if (!prev || c.date > prev.date || (c.date === prev.date && c.confidence < prev.confidence)) latest.set(c.participant_id, c);
  }
  const checkins: CheckinRow[] = people
    .filter((p) => p.confidence_intake !== null && latest.has(p.id))
    .map((p) => {
      const checkin = latest.get(p.id)!;
      return { participant: p, checkin, intake: p.confidence_intake!, improved: checkin.confidence > p.confidence_intake! };
    });

  const attendance = [...kept.values()];
  return {
    start,
    end,
    groupId,
    smallBelow: st.smallBelow,
    attendance,
    duplicates,
    submissions,
    sessions,
    seats,
    attended: seats.filter((s) => s.attended && !s.offRoster).length,
    offered: seats.filter((s) => !s.offRoster).length,
    hoursHundredths: attendance.reduce((sum, e) => sum + toHundredths(e.units), 0),
    served: [...new Set(attendance.map((e) => e.participant_id))].sort(),
    newParticipants: people.filter((p) => inRange(p.join_date)),
    enrolledAny,
    enrolledAtStart: enrolledAny.filter((p) => enrolledOn(p, start)),
    // An exit date is the last enrolled day. One inside the period, its last
    // day included, is an exit in this period, so the months add up to the quarter.
    retained: enrolledAny.filter((p) => p.exit_date === null || p.exit_date > end),
    exited: enrolledAny.filter((p) => p.exit_date !== null && p.exit_date <= end),
    checkins,
  };
}

// ---------- goals ----------

export type GoalStatus = 'Met' | 'On track' | 'Behind' | 'Past due' | 'No due date';
/** What funder copy shows for a status: the status, or "Not shown" when it would give a small count of people away. */
export type ShownStatus = GoalStatus | 'Not shown';

export interface GoalFigure {
  id: string;
  name: string;
  metric: Goal['metric'];
  asOf: string;
  /** Unrounded progress: a count, hours, or a rate between 0 and 1. */
  value: number | null;
  /** Funder display (people counts follow the small-count rule). */
  display: string;
  staffDisplay: string;
  target: number;
  targetDisplay: string;
  dueDate: string | null;
  /** The true status, as staff see it. */
  status: GoalStatus;
  /** Funder copy. A people goal under the cutoff shows "<5" (at the default) and neither status nor forecast, since both are worked out from the count and could give it away. */
  shownStatus: ShownStatus;
  elapsedDays: number;
  windowDays: number | null;
  /** Unrounded forecast for count goals that are On track or Behind. */
  forecast: number | null;
  /** Funder display. Null when there is no forecast, or when it's withheld with the status. */
  forecastDisplay: string | null;
  forecastStaffDisplay: string | null;
  forecastLine: string | null;
  /** The integers behind the value and forecast, for the trace panel. */
  basis: { n: number; scale: number; attended?: number; offered?: number };
  measure: Measure;
}

export function goalFigure(ds: Dataset, st: State, goal: Goal, asOf: string): GoalFigure {
  const m = measure(ds, st, goal.start_date, asOf);
  const elapsed = daysBetween(goal.start_date, asOf) + 1;
  const window = goal.due_date ? daysBetween(goal.start_date, goal.due_date) + 1 : null;
  let value: number | null;
  let display: string;
  let staffDisplay: string;
  let met: boolean;
  let n = 0;
  let scale = 1;
  let forecastOk: boolean | null = null;
  let forecastStaffDisplay: string | null = null;

  if (goal.metric === 'attendance_rate') {
    const pct = Math.round(goal.target * 100);
    value = m.offered ? m.attended / m.offered : null;
    display = staffDisplay = m.offered ? fmtPercent(m.attended, m.offered) : 'No sessions in this period';
    met = m.offered > 0 && m.attended * 100 >= pct * m.offered;
  } else {
    if (goal.metric === 'participant_hours') {
      n = m.hoursHundredths; scale = 100; value = n / 100; display = staffDisplay = fmtHours(n);
    } else if (goal.metric === 'new_participants') {
      n = m.newParticipants.length; value = n; display = peopleForFunder(n, st.smallBelow); staffDisplay = fmtCount(n);
    } else {
      n = m.submissions.length; value = n; display = staffDisplay = fmtCount(n);
    }
    // Integers throughout, so "forecast ≥ target" has no float error.
    met = n >= goal.target * scale;
    if (window !== null) {
      forecastOk = n * window >= goal.target * scale * elapsed;
      forecastStaffDisplay = commas(halfUp(n * window, scale * elapsed));
    }
  }

  let status: GoalStatus;
  // The as-of date is the end of the period, so a goal due that day has run its course.
  if (met) status = 'Met';
  else if (goal.due_date && goal.due_date <= asOf) status = 'Past due';
  else if (!goal.due_date) status = 'No due date';
  else if (forecastOk === null) throw new Error(`${goal.id}: rate goals with a due date have no forecast rule`);
  else status = forecastOk ? 'On track' : 'Behind';

  const showForecast = status === 'On track' || status === 'Behind';
  // "<5" with "On track", or with a forecast of 6 halfway through, would say how many.
  const withheld = goal.metric === 'new_participants' && isSmall(n, st.smallBelow);
  const forecastDisplay = showForecast && !withheld ? forecastStaffDisplay : null;
  const targetDisplay = goal.metric === 'attendance_rate' ? `${Math.round(goal.target * 100)}%` : commas(goal.target);
  return {
    id: goal.id,
    name: goal.name,
    metric: goal.metric,
    asOf,
    value,
    display,
    staffDisplay,
    target: goal.target,
    targetDisplay,
    dueDate: goal.due_date,
    status,
    shownStatus: withheld ? 'Not shown' : status,
    elapsedDays: elapsed,
    windowDays: window,
    forecast: showForecast && window ? (n * window) / (scale * elapsed) : null,
    forecastDisplay,
    forecastStaffDisplay: showForecast ? forecastStaffDisplay : null,
    forecastLine: forecastDisplay && goal.due_date ? `Forecast by ${fmtShortDate(goal.due_date)}: ${forecastDisplay} of ${targetDisplay}` : null,
    basis: { n, scale, attended: m.attended, offered: m.offered },
    measure: m,
  };
}
