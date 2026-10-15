// The sample dataset and its types. Every record is generated (see data/SOURCES.md).
// Engine functions take a Dataset so tests can build small ones by hand.

import orgJson from '../data/org.json';
import participantsJson from '../data/participants.json';
import engagementsJson from '../data/engagements.json';
import goalsJson from '../data/goals.json';
import checkinsJson from '../data/checkins.json';

export const ATTENDANCES = 'Attendances';
export const SUBMISSIONS = 'Assignment Submissions';
export type ActivityType = typeof ATTENDANCES | typeof SUBMISSIONS;

export interface Group {
  id: string;
  name: string;
  schedule_label: string;
  /** Hours per session, from the group's schedule. */
  hours: number;
  /** Dates the group is scheduled to meet, inside the data's range. */
  scheduled_dates: string[];
}

export interface Participant {
  id: string;
  display_name: string;
  group_id: string;
  age_range: string;
  join_date: string;
  /** Last enrolled day, or null while enrolled. */
  exit_date: string | null;
  /** Custom field: confidence at intake, 1 to 5. */
  confidence_intake: number | null;
}

/** A check-in: the confidence custom field (1 to 5), recorded again later. */
export interface Checkin {
  id: string;
  date: string;
  participant_id: string;
  confidence: number;
}

export interface Engagement {
  id: string;
  date: string;
  group_id: string;
  participant_id: string;
  activity_type: ActivityType;
  /** Duration / Units: session hours for Attendances, 1 for a submission. */
  units: number;
}

export type GoalMetric = 'new_participants' | 'participant_hours' | 'assignment_submissions' | 'attendance_rate';

export interface Goal {
  id: string;
  name: string;
  metric: GoalMetric;
  /** A count, hours, or a rate between 0 and 1. */
  target: number;
  start_date: string;
  due_date: string | null;
}

export interface Dataset {
  orgName: string;
  workstream: string;
  sampleLabel: string;
  asOf: string;
  ageRanges: string[];
  groups: Group[];
  participants: Participant[];
  engagements: Engagement[];
  checkins: Checkin[];
  goals: Goal[];
}

export const sample: Dataset = {
  orgName: orgJson.display_name,
  workstream: orgJson.workstreams[0].name,
  sampleLabel: orgJson.sample_label,
  asOf: orgJson.as_of,
  ageRanges: orgJson.age_ranges,
  groups: orgJson.groups.map((g) => ({
    id: g.id,
    name: g.name,
    schedule_label: g.schedule_label,
    hours: g.schedule.hours,
    scheduled_dates: g.scheduled_dates,
  })),
  participants: participantsJson.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    group_id: p.group_id,
    age_range: p.age_range,
    join_date: p.join_date,
    exit_date: p.exit_date,
    confidence_intake: p.confidence_intake,
  })),
  engagements: engagementsJson.map((e) => ({
    id: e.id,
    date: e.date,
    group_id: e.group_id,
    participant_id: e.participant_id,
    activity_type: e.activity_type as ActivityType,
    units: e.units,
  })),
  checkins: checkinsJson.map((c) => ({ id: c.id, date: c.date, participant_id: c.participant_id, confidence: c.confidence })),
  goals: goalsJson.map((g) => ({
    id: g.id,
    name: g.name,
    metric: g.metric as GoalMetric,
    target: g.target,
    start_date: g.start_date,
    due_date: g.due_date,
  })),
};

export interface Period {
  id: 'q3' | 'jul' | 'aug' | 'sep';
  /** Control label. */
  short: string;
  /** Running header label. */
  label: string;
  /** Written out, for the summary. */
  long: string;
  /** For the report's period line. */
  range: string;
  start: string;
  end: string;
}

export const PERIODS: Period[] = [
  { id: 'q3', short: 'Jul to Sep', label: 'Jul to Sep 2026', long: 'July to September 2026', range: 'July 1 to September 30, 2026', start: '2026-07-01', end: '2026-09-30' },
  { id: 'jul', short: 'Jul', label: 'Jul 2026', long: 'July 2026', range: 'July 1 to 31, 2026', start: '2026-07-01', end: '2026-07-31' },
  { id: 'aug', short: 'Aug', label: 'Aug 2026', long: 'August 2026', range: 'August 1 to 31, 2026', start: '2026-08-01', end: '2026-08-31' },
  { id: 'sep', short: 'Sep', label: 'Sep 2026', long: 'September 2026', range: 'September 1 to 30, 2026', start: '2026-09-01', end: '2026-09-30' },
];

export const periodById = (id: Period['id']): Period => {
  const p = PERIODS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown period ${id}`);
  return p;
};
