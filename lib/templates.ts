// The two funder templates, as data. Both are examples to correct, not real
// funders' forms. A template picks sections, metrics, a chart and goals; the
// numbers all come from the same engine output.

import type { MetricId } from './metrics';
import narrativesJson from '../data/narratives.json';

export type TemplateId = 'city-youth-grant' | 'foundation-outcomes';

export type Section =
  | { id: string; title: string; type: 'figures'; metrics: MetricId[]; breakdown?: 'age_range'; chart?: 'attendance_rate' | 'retention_rate' }
  | { id: string; title: string; type: 'goals'; goals: string[] }
  | { id: string; title: string; type: 'summary' }
  | { id: string; title: string; type: 'notes' };

/**
 * Summary slot kinds. A "people" slot renders "no" for 0 and "fewer than 5"
 * for 1 to 4. A "status" slot renders a goal status in words, and a "date"
 * slot a due date written out. Goals give their target, due date and status
 * only: progress is in the goals table, and for a goal that starts with the
 * period it would repeat the period's own figure.
 */
export type SlotKind = 'text' | 'people' | 'count' | 'hours' | 'percent' | 'decimal' | 'status' | 'date';
export type SlotSource = { from: 'period' } | { from: 'metric'; metric: MetricId } | { from: 'goal'; goalId: string; part: 'target' | 'due' | 'status' };
export interface Slot { kind: SlotKind; source: SlotSource }

export interface Template {
  id: TemplateId;
  /** Toggle label. */
  short: string;
  name: string;
  /**
   * How the funder wants the page laid out: 'form' is a numbered list of
   * fields, like a government grant form; 'brief' leads with the outcome in
   * large figures. The numbers are the same either way.
   */
  layout: 'form' | 'brief';
  sections: Section[];
  slots: Record<string, Slot>;
  narrative: string;
}

const narrativeFor = (id: TemplateId): string => {
  const n = narrativesJson.narratives.find((x) => x.template_id === id);
  if (!n) throw new Error(`no summary drafted for ${id}`);
  return n.text;
};

export const SUMMARY_LABEL = narrativesJson.label;

export const TEMPLATES: Template[] = [
  {
    id: 'city-youth-grant',
    short: 'City youth grant',
    name: 'City youth grant (example): reach and attendance',
    layout: 'form',
    sections: [
      { id: 'reach', title: 'Reach', type: 'figures', metrics: ['participants_served', 'new_participants'], breakdown: 'age_range' },
      { id: 'delivery', title: 'Delivery', type: 'figures', metrics: ['sessions_delivered', 'participant_hours'] },
      { id: 'attendance', title: 'Attendance', type: 'figures', metrics: ['attendance_rate'], chart: 'attendance_rate' },
      { id: 'goals', title: 'Goals', type: 'goals', goals: ['G1', 'G2'] },
      { id: 'summary', title: 'Summary', type: 'summary' },
      { id: 'notes', title: 'Data notes', type: 'notes' },
    ],
    slots: {
      period: { kind: 'text', source: { from: 'period' } },
      participants_served: { kind: 'people', source: { from: 'metric', metric: 'participants_served' } },
      new_participants: { kind: 'people', source: { from: 'metric', metric: 'new_participants' } },
      sessions_delivered: { kind: 'count', source: { from: 'metric', metric: 'sessions_delivered' } },
      participant_hours: { kind: 'hours', source: { from: 'metric', metric: 'participant_hours' } },
      attendance_rate: { kind: 'percent', source: { from: 'metric', metric: 'attendance_rate' } },
      g1_target: { kind: 'count', source: { from: 'goal', goalId: 'G1', part: 'target' } },
      g1_due: { kind: 'date', source: { from: 'goal', goalId: 'G1', part: 'due' } },
      g1_status: { kind: 'status', source: { from: 'goal', goalId: 'G1', part: 'status' } },
      g2_target: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'target' } },
      g2_due: { kind: 'date', source: { from: 'goal', goalId: 'G2', part: 'due' } },
      g2_status: { kind: 'status', source: { from: 'goal', goalId: 'G2', part: 'status' } },
    },
    narrative: narrativeFor('city-youth-grant'),
  },
  {
    id: 'foundation-outcomes',
    short: 'Foundation',
    name: 'Foundation (example): outcomes and retention',
    layout: 'brief',
    sections: [
      { id: 'outcomes', title: 'Outcomes', type: 'figures', metrics: ['confidence_improved', 'participants_checked_in'] },
      { id: 'retention', title: 'Retention', type: 'figures', metrics: ['retention_rate'], chart: 'retention_rate' },
      { id: 'engagement', title: 'Engagement', type: 'figures', metrics: ['attendance_rate', 'assignment_submissions', 'submissions_per_participant'] },
      { id: 'goals', title: 'Goals', type: 'goals', goals: ['G2', 'G3', 'G4'] },
      { id: 'summary', title: 'Summary', type: 'summary' },
      { id: 'notes', title: 'Data notes', type: 'notes' },
    ],
    slots: {
      period: { kind: 'text', source: { from: 'period' } },
      confidence_improved: { kind: 'percent', source: { from: 'metric', metric: 'confidence_improved' } },
      participants_checked_in: { kind: 'people', source: { from: 'metric', metric: 'participants_checked_in' } },
      retention_rate: { kind: 'percent', source: { from: 'metric', metric: 'retention_rate' } },
      attendance_rate: { kind: 'percent', source: { from: 'metric', metric: 'attendance_rate' } },
      assignment_submissions: { kind: 'count', source: { from: 'metric', metric: 'assignment_submissions' } },
      submissions_per_participant: { kind: 'decimal', source: { from: 'metric', metric: 'submissions_per_participant' } },
      participants_served: { kind: 'people', source: { from: 'metric', metric: 'participants_served' } },
      g2_target: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'target' } },
      g2_due: { kind: 'date', source: { from: 'goal', goalId: 'G2', part: 'due' } },
      g2_status: { kind: 'status', source: { from: 'goal', goalId: 'G2', part: 'status' } },
      g3_target: { kind: 'count', source: { from: 'goal', goalId: 'G3', part: 'target' } },
      g3_due: { kind: 'date', source: { from: 'goal', goalId: 'G3', part: 'due' } },
      g3_status: { kind: 'status', source: { from: 'goal', goalId: 'G3', part: 'status' } },
    },
    narrative: narrativeFor('foundation-outcomes'),
  },
];

export const templateById = (id: TemplateId): Template => {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
};

/** Goals a template puts on the page. */
export const templateGoals = (t: Template): string[] => t.sections.flatMap((s) => (s.type === 'goals' ? s.goals : []));

/** Metrics a template shows as figures. */
export const templateMetrics = (t: Template): MetricId[] => t.sections.flatMap((s) => (s.type === 'figures' ? s.metrics : []));
