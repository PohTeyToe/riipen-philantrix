// The metrics registry. One entry per number a funder template can ask for:
// which records it reads, how it counts them, what it divides by, over which
// dates, and the plain-words definition. The report page and the trace panel
// both read their wording from here, so a definition changes in one place.

import { ATTENDANCES, SUBMISSIONS } from './data';
import type { Measure } from './engine';
import { commas, fmtCount, fmtDecimal1, fmtDecimalPrecise, fmtHours, fmtHoursExact, fmtPercent, fmtPercentPrecise } from './format';
import { peopleForFunder } from './privacy';

export type MetricId =
  | 'participants_served'
  | 'new_participants'
  | 'sessions_delivered'
  | 'participant_hours'
  | 'attendance_rate'
  | 'retention_rate'
  | 'assignment_submissions'
  | 'submissions_per_participant'
  | 'participants_checked_in'
  | 'confidence_improved'
  | 'enrolled_at_start'
  | 'enrolled_in_period'
  | 'participants_exited';

/** How a value is shown, and whether the people-count rule applies. */
export type MetricKind = 'people' | 'count' | 'hours' | 'percent' | 'decimal';

export interface MetricValue {
  /** Unrounded. Null when there is nothing to divide by. */
  value: number | null;
  /** What the funder copy shows. */
  display: string;
  /** What staff see: the true count where the funder copy hides it. */
  staffDisplay: string;
  /** The working, e.g. "420 attended ÷ 553 offered = 75.95%, shown as 76%". */
  arithmetic: string;
}

export interface MetricDef {
  id: MetricId;
  label: string;
  kind: MetricKind;
  /** The records it reads. */
  activityType: string;
  /** How it counts them. */
  aggregation: string;
  /** What it divides by, if anything. */
  denominator: string | null;
  /** Which dates it covers. */
  period: string;
  /** One line under the figure on the report page. */
  definition: string;
  /** The formula in plain words, for the trace panel. */
  formula: string;
  compute: (m: Measure) => MetricValue;
}

const REPORT_PERIOD = 'The report period, start and end dates included';

const rate = (num: number, den: number, numLabel: string, denLabel: string, empty: string): MetricValue => {
  if (den === 0) return { value: null, display: empty, staffDisplay: empty, arithmetic: `${commas(num)} ${numLabel} ÷ 0 ${denLabel}. Nothing to divide by, so it reads "${empty}".` };
  const shown = fmtPercent(num, den);
  return { value: num / den, display: shown, staffDisplay: shown, arithmetic: `${commas(num)} ${numLabel} ÷ ${commas(den)} ${denLabel} = ${fmtPercentPrecise(num, den)}, shown as ${shown}` };
};

const people = (n: number, what: string, below: number): MetricValue => ({
  value: n,
  display: peopleForFunder(n, below),
  staffDisplay: fmtCount(n),
  arithmetic: `${commas(n)} ${what}`,
});

export const METRICS: Record<MetricId, MetricDef> = {
  participants_served: {
    id: 'participants_served',
    label: 'Participants served',
    kind: 'people',
    activityType: ATTENDANCES,
    aggregation: 'Distinct participants',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Attended at least one session in the period.',
    formula: 'Count each participant once if they have at least one Attendances record in the period.',
    compute: (m) => people(m.served.length, m.served.length === 1 ? 'participant with an Attendances record' : 'participants with an Attendances record', m.smallBelow),
  },
  new_participants: {
    id: 'new_participants',
    label: 'New participants',
    kind: 'people',
    activityType: 'Participant join dates',
    aggregation: 'Count of participants',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Joined the program during the period.',
    formula: 'Count participants whose join date falls inside the period.',
    compute: (m) => people(m.newParticipants.length, m.newParticipants.length === 1 ? 'participant joined in the period' : 'participants joined in the period', m.smallBelow),
  },
  sessions_delivered: {
    id: 'sessions_delivered',
    label: 'Sessions delivered',
    kind: 'count',
    activityType: `${ATTENDANCES}, plus answers about the schedule`,
    aggregation: 'Distinct group and date',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Group sessions with attendance logged, plus sessions confirmed as run.',
    formula:
      'Count each group and date with at least one Attendances record. Add scheduled sessions answered "Ran, attendance not recorded". A scheduled session with no records and no answer is not counted.',
    compute: (m) => {
      const logged = m.sessions.filter((s) => s.source === 'logged').length;
      const answered = m.sessions.length - logged;
      return {
        value: m.sessions.length,
        display: fmtCount(m.sessions.length),
        staffDisplay: fmtCount(m.sessions.length),
        arithmetic: answered
          ? `${commas(logged)} with attendance logged + ${answered} answered "Ran, attendance not recorded" = ${commas(m.sessions.length)}`
          : `${commas(logged)} with attendance logged`,
      };
    },
  },
  participant_hours: {
    id: 'participant_hours',
    label: 'Participant hours',
    kind: 'hours',
    activityType: ATTENDANCES,
    aggregation: 'Sum of Duration / Units',
    denominator: null,
    period: REPORT_PERIOD,
    definition: "Hours in sessions attended, each counted at the session's length.",
    formula: 'Add up the units on every Attendances record in the period. Units are the session\'s hours. A person logged twice for the same session counts once, and if the copies disagree, the one with fewer hours counts.',
    compute: (m) => {
      const shown = fmtHours(m.hoursHundredths);
      const dup = m.duplicates.length ? `, ${m.duplicates.length} duplicate left out` : '';
      return {
        value: m.hoursHundredths / 100,
        display: shown,
        staffDisplay: shown,
        arithmetic: `${commas(m.attendance.length)} records${dup}, total ${fmtHoursExact(m.hoursHundredths)} hours, shown as ${shown}`,
      };
    },
  },
  attendance_rate: {
    id: 'attendance_rate',
    label: 'Attendance rate',
    kind: 'percent',
    activityType: `${ATTENDANCES} and the group roster`,
    aggregation: 'Attended seats',
    denominator: 'Offered seats',
    period: REPORT_PERIOD,
    definition: 'Seats filled at sessions with attendance logged. Each enrolled group member is one seat.',
    formula:
      'Attended ÷ offered. Offered counts everyone enrolled in the group on the day of each session with attendance logged. Attended counts the seats that were filled, each person once per session. Sessions that ran without attendance logged are left out of both.',
    compute: (m) => rate(m.attended, m.offered, 'attended', 'offered', 'No sessions in this period'),
  },
  retention_rate: {
    id: 'retention_rate',
    label: 'Retention rate',
    kind: 'percent',
    activityType: 'Participant join and exit dates',
    aggregation: 'Enrolled on the last day',
    denominator: 'Enrolled on any day of the period',
    period: REPORT_PERIOD,
    definition: 'Still enrolled on the last day, out of everyone enrolled at any point in the period.',
    formula:
      'Participants enrolled on the last day of the period ÷ participants enrolled on any day of it. An exit date is the last enrolled day. Answering "Left the program" sets the exit date to the last activity.',
    compute: (m) => rate(m.retained.length, m.enrolledAny.length, 'still enrolled', 'enrolled during the period', 'No participants in this period'),
  },
  assignment_submissions: {
    id: 'assignment_submissions',
    label: 'Assignment submissions',
    kind: 'count',
    activityType: SUBMISSIONS,
    aggregation: 'Count of records',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Assignments handed in during the period.',
    formula: 'Count Assignment Submissions records in the period.',
    compute: (m) => ({
      value: m.submissions.length,
      display: fmtCount(m.submissions.length),
      staffDisplay: fmtCount(m.submissions.length),
      arithmetic: `${commas(m.submissions.length)} Assignment Submissions records`,
    }),
  },
  submissions_per_participant: {
    id: 'submissions_per_participant',
    label: 'Submissions per participant served',
    kind: 'decimal',
    activityType: `${SUBMISSIONS} and ${ATTENDANCES}`,
    aggregation: 'Count of submissions',
    denominator: 'Participants served',
    period: REPORT_PERIOD,
    definition: 'Assignments handed in, divided by participants served.',
    formula: 'Assignment submissions ÷ participants served. Shown to one decimal.',
    compute: (m) => {
      const s = m.submissions.length;
      const n = m.served.length;
      if (n === 0) return { value: null, display: 'No participants served', staffDisplay: 'No participants served', arithmetic: `${commas(s)} submissions ÷ 0 participants served. Nothing to divide by.` };
      const shown = fmtDecimal1(s, n);
      return { value: s / n, display: shown, staffDisplay: shown, arithmetic: `${commas(s)} submissions ÷ ${commas(n)} participants served = ${fmtDecimalPrecise(s, n)}, shown as ${shown}` };
    },
  },
  participants_checked_in: {
    id: 'participants_checked_in',
    label: 'Participants with a check-in',
    kind: 'people',
    activityType: 'Check-ins, and the intake score on each participant',
    aggregation: 'Distinct participants',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Rated their confidence at a check-in in the period, and at intake.',
    formula: 'Count each participant once if they have an intake score and at least one check-in dated in the period.',
    compute: (m) => people(m.checkins.length, m.checkins.length === 1 ? 'participant with an intake score and a check-in' : 'participants with an intake score and a check-in', m.smallBelow),
  },
  confidence_improved: {
    id: 'confidence_improved',
    label: 'Confidence improved',
    kind: 'percent',
    activityType: 'Custom field "Confidence (1 to 5)", at intake and at check-ins',
    aggregation: 'Participants whose latest check-in score is higher than at intake',
    denominator: 'Participants with an intake score and a check-in in the period',
    period: REPORT_PERIOD,
    definition: 'Rated their confidence higher at their latest check-in than at intake.',
    formula:
      "Take each participant's latest check-in in the period and compare it with their intake score, both on a scale of 1 to 5. Improved ÷ everyone with both. A score that stayed the same or went down is not improved. If someone has two check-ins on the same day, the lower score counts.",
    compute: (m) =>
      rate(
        m.checkins.filter((c) => c.improved).length,
        m.checkins.length,
        'improved',
        m.checkins.length === 1 ? 'participant with a check-in' : 'participants with a check-in',
        'No check-ins in this period',
      ),
  },
  enrolled_at_start: {
    id: 'enrolled_at_start',
    label: 'Enrolled at the start',
    kind: 'people',
    activityType: 'Participant join and exit dates',
    aggregation: 'Count of participants',
    denominator: null,
    period: "The period's first day",
    definition: 'Enrolled on the first day of the period.',
    formula: "Count participants who had joined by the period's first day and whose exit date, if any, is on or after it.",
    compute: (m) => people(m.enrolledAtStart.length, m.enrolledAtStart.length === 1 ? 'participant enrolled on the first day' : 'participants enrolled on the first day', m.smallBelow),
  },
  enrolled_in_period: {
    id: 'enrolled_in_period',
    label: 'Enrolled during the period',
    kind: 'people',
    activityType: 'Participant join and exit dates',
    aggregation: 'Count of participants',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Enrolled on at least one day of the period.',
    formula: "Count participants who joined on or before the period's last day and whose exit date, if any, is on or after its first day. The same count divides the retention rate.",
    compute: (m) => people(m.enrolledAny.length, m.enrolledAny.length === 1 ? 'participant enrolled during the period' : 'participants enrolled during the period', m.smallBelow),
  },
  participants_exited: {
    id: 'participants_exited',
    label: 'Participants who left',
    kind: 'people',
    activityType: 'Participant exit dates',
    aggregation: 'Count of participants',
    denominator: null,
    period: REPORT_PERIOD,
    definition: 'Enrolled during the period and left before its last day.',
    formula: 'Count participants enrolled on any day of the period whose exit date falls before its last day. An exit date is the last enrolled day. Answering "Left the program" sets it to the last activity.',
    compute: (m) => people(m.exited.length, m.exited.length === 1 ? 'participant left during the period' : 'participants left during the period', m.smallBelow),
  },
};

export const metric = (id: MetricId): MetricDef => METRICS[id];
