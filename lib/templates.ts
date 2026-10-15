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

/** Summary slot kinds. A "people" slot of 1 to 4 renders "fewer than 5". */
export type SlotKind = 'text' | 'people' | 'count' | 'hours' | 'percent' | 'decimal';
export type SlotSource = { from: 'period' } | { from: 'metric'; metric: MetricId } | { from: 'goal'; goalId: string; part: 'value' | 'target' };
export interface Slot { kind: SlotKind; source: SlotSource }

export interface Template {
  id: TemplateId;
  /** Toggle label. */
  short: string;
  name: string;
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
      g1_value: { kind: 'people', source: { from: 'goal', goalId: 'G1', part: 'value' } },
      g1_target: { kind: 'count', source: { from: 'goal', goalId: 'G1', part: 'target' } },
      g2_value: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'value' } },
      g2_target: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'target' } },
    },
    narrative: narrativeFor('city-youth-grant'),
  },
  {
    id: 'foundation-outcomes',
    short: 'Foundation',
    name: 'Foundation (example): outcomes and retention',
    sections: [
      { id: 'retention', title: 'Retention', type: 'figures', metrics: ['retention_rate'], chart: 'retention_rate' },
      { id: 'engagement', title: 'Engagement', type: 'figures', metrics: ['attendance_rate', 'assignment_submissions', 'submissions_per_participant'] },
      { id: 'goals', title: 'Goals', type: 'goals', goals: ['G2', 'G3', 'G4'] },
      { id: 'summary', title: 'Summary', type: 'summary' },
      { id: 'notes', title: 'Data notes', type: 'notes' },
    ],
    slots: {
      period: { kind: 'text', source: { from: 'period' } },
      retention_rate: { kind: 'percent', source: { from: 'metric', metric: 'retention_rate' } },
      attendance_rate: { kind: 'percent', source: { from: 'metric', metric: 'attendance_rate' } },
      assignment_submissions: { kind: 'count', source: { from: 'metric', metric: 'assignment_submissions' } },
      submissions_per_participant: { kind: 'decimal', source: { from: 'metric', metric: 'submissions_per_participant' } },
      participants_served: { kind: 'people', source: { from: 'metric', metric: 'participants_served' } },
      g2_value: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'value' } },
      g2_target: { kind: 'hours', source: { from: 'goal', goalId: 'G2', part: 'target' } },
      g3_value: { kind: 'count', source: { from: 'goal', goalId: 'G3', part: 'value' } },
      g3_target: { kind: 'count', source: { from: 'goal', goalId: 'G3', part: 'target' } },
      g4_value: { kind: 'percent', source: { from: 'goal', goalId: 'G4', part: 'value' } },
      g4_target: { kind: 'percent', source: { from: 'goal', goalId: 'G4', part: 'target' } },
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
