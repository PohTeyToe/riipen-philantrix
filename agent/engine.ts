// What the agent's tools can read: the metric registry, the shape of the
// records, and figures from the same engine the page uses. Built into
// agent/.build/engine.mjs by `npm run agent:build`. Nothing here returns a
// participant's name.

import { PERIODS, periodById, sample, type Period } from '../lib/data';
import { measure } from '../lib/engine';
import { applyAnswers, detectFindings } from '../lib/findings';
import { METRICS, type MetricId } from '../lib/metrics';
import { ageBands } from '../lib/report';
import { bandLabel, peopleForFunder } from '../lib/privacy';

const findings = detectFindings(sample);
const state = applyAnswers(sample, findings, {});

export const PERIOD_IDS = PERIODS.map((p) => p.id);
export const METRIC_IDS = Object.keys(METRICS) as MetricId[];
export const AGE_RANGES = sample.ageRanges;

export function listMetrics() {
  return Object.values(METRICS).map((m) => ({
    id: m.id,
    label: m.label,
    kind: m.kind,
    definition: m.definition,
    formula: m.formula,
    records: m.activityType,
    divided_by: m.denominator,
  }));
}

export function describeRecords() {
  const count = (pred: (e: (typeof sample.engagements)[number]) => boolean) => sample.engagements.filter(pred).length;
  return {
    organization: 'A youth mentorship program (sample data)',
    records_cover: `${PERIODS[0].start} to ${PERIODS[0].end}`,
    periods: PERIODS.map((p) => ({ id: p.id, label: p.label, start: p.start, end: p.end })),
    tables: [
      {
        name: 'Participants',
        rows: sample.participants.length,
        fields: [
          'group (one of the groups below)',
          `age range, a custom field with these values only: ${sample.ageRanges.join(', ')}`,
          'join date',
          'exit date (the last enrolled day; empty while enrolled)',
          'confidence at intake, a custom field scored 1 to 5',
        ],
      },
      {
        name: 'Engagements',
        rows: sample.engagements.length,
        fields: ['date', 'group', 'participant', 'activity type', 'Duration / Units (session hours for Attendances, 1 for a submission)'],
        activity_types: { Attendances: count((e) => e.activity_type === 'Attendances'), 'Assignment Submissions': count((e) => e.activity_type === 'Assignment Submissions') },
      },
      { name: 'Check-ins', rows: sample.checkins.length, fields: ['date', 'participant', 'confidence, scored 1 to 5'] },
      {
        name: 'Groups',
        rows: sample.groups.length,
        fields: ['name', 'schedule', 'hours per session'],
        values: sample.groups.map((g) => ({ name: g.name, schedule: g.schedule_label, hours_per_session: g.hours })),
      },
      { name: 'Tracked Goals', rows: sample.goals.length, fields: ['name', 'metric', 'target', 'start date', 'due date'] },
    ],
  };
}

export function getMetric(metric: MetricId, periodId: Period['id']) {
  const def = METRICS[metric];
  if (!def) throw new Error(`unknown metric ${metric}. Call list_metrics for the ids.`);
  const p = periodById(periodId);
  const v = def.compute(measure(sample, state, p.start, p.end));
  // A count the funder copy hides stays hidden here too.
  const hidden = v.display !== v.staffDisplay;
  return { metric, label: def.label, period: p.label, funder_copy_shows: v.display, working: hidden ? 'Hidden: fewer than 5 people.' : v.arithmetic };
}

export function countByAge(periodId: Period['id']) {
  const p = periodById(periodId);
  const m = measure(sample, state, p.start, p.end);
  const age = new Map(sample.participants.map((x) => [x.id, x.age_range]));
  const byRange = sample.ageRanges.map((r) => ({ age_range: r, participants_served: peopleForFunder(m.served.filter((id) => age.get(id) === r).length) }));
  const bands = ageBands(sample).map((rs) => {
    const n = m.served.filter((id) => rs.includes(age.get(id) ?? '')).length;
    return { band: bandLabel(rs), ranges: rs, funder_copy_shows: peopleForFunder(n) };
  });
  return {
    period: p.label,
    by_age_range: byRange,
    funder_copy_bands: bands,
    rule: 'Funder copy never shows a group of 1 to 4 people. An age range that small in any period is reported together with the next range.',
  };
}
