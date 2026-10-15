// The reference figures only prove something if the two implementations
// agree on data the sample doesn't happen to cover. This runs both on changed
// copies of the data: a duplicate whose copies differ, hours that aren't
// whole half hours, someone logged while not enrolled, and a duplicate whose
// first-logged record comes last in the file.

import { describe, expect, it } from 'vitest';
import { computeAll, loadData, type RefData, type RefPeriod } from '../data/compute-reference.mjs';
import { ATTENDANCES, PERIODS, sample, type Dataset, type Engagement } from '../lib/data';
import { applyAnswers, detectFindings, type Answers } from '../lib/findings';
import { computePeriod } from '../lib/report';

const extra: Engagement[] = [
  // P23 left on Jul 31, then turns up on Aug 10: a record, but not a seat.
  { id: 'E9001', date: '2026-08-10', group_id: 'mentor-circle', participant_id: 'P23', activity_type: ATTENDANCES, units: 1 },
  // A copy of P03's Jul 16 record with a lower id, at the end of the file.
  { id: 'E0000', date: '2026-07-16', group_id: 'coding-club', participant_id: 'P03', activity_type: ATTENDANCES, units: 2 },
];
const units: Record<string, number> = { E0106: 0.5, E0001: 1.25 };
const change = <T extends { id: string; units: number }>(rows: T[], add: T[]): T[] => [...rows.map((e) => (e.id in units ? { ...e, units: units[e.id] } : e)), ...add];

const data = loadData();
const refData: RefData = { ...data, engagements: change(data.engagements, extra.map((e) => ({ ...e, mock: true }))) };
const ds: Dataset = { ...sample, engagements: change(sample.engagements, extra) };
const findings = detectFindings(ds);
const ALL: Answers = Object.fromEntries(findings.filter((f) => f.answers.length).map((f) => [f.id, f.kind === 'session_not_logged' ? 'ran_not_recorded' : 'left_program']));
const states = { none_answered: {}, all_answered: ALL as Record<string, string> };
const ref = computeAll(refData, states);

describe('the reference and the app agree on data the sample does not cover', () => {
  it('finds the same gaps', () => {
    expect(findings.map((f) => f.id).sort()).toEqual(ref.findings.map((f) => f.id).sort());
  });
  for (const period of PERIODS) {
    for (const [stateId, answers] of Object.entries(states)) {
      it(`${period.id}, ${stateId}`, () => {
        const r: RefPeriod = ref.results[period.id][stateId];
        const f = computePeriod(ds, applyAnswers(ds, findings, answers as Answers), findings, period);
        for (const [id, want] of Object.entries(r.metrics)) {
          const got = f.metrics[id as keyof typeof f.metrics];
          expect(got.display, id).toBe(want.display);
          if (want.value === null) expect(got.value, id).toBeNull();
          else expect(got.value, id).toBeCloseTo(want.value, 12);
        }
        expect(f.attendanceByGroup.map((g) => g.display)).toEqual(r.attendance_rate_by_group.map((g) => g.display));
        expect(f.retentionByGroup.map((g) => g.display)).toEqual(r.retention_by_group.map((g) => g.display));
        expect(f.ageBreakdown.cells.map((c) => c.display)).toEqual(r.participants_by_age_range.cells.map((c) => c.display));
        expect(f.goals.map((g) => [g.display, g.status, g.forecastDisplay, g.forecastLine])).toEqual(r.goals.map((g) => [g.display, g.status, g.forecast_display, g.forecast_line]));
        expect(f.notes.map((n) => n.text)).toEqual(r.data_notes.map((n) => n.text));
      });
    }
  }
  it('the changes reach the figures, so the test above is meaningful', () => {
    const q3 = ref.results.q3.none_answered.metrics;
    // E0000 (2 hours) replaces E0105 (1.5) as P03's Jul 16 record, and E0001 drops from 1.5 to 1.25.
    expect(q3.participant_hours.value).toBe(614.5 + 0.5 - 0.25 + 1);
    expect(computePeriod(ds, applyAnswers(ds, findings, {}), findings, PERIODS[0]).metrics.participant_hours.value).toBe(615.75);
  });
});
