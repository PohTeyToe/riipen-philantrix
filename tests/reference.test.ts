// The reference figures only prove something if the two implementations
// agree on data the sample doesn't happen to cover. This runs both on changed
// copies of the data: a duplicate whose copies differ, hours that aren't
// whole half hours, someone logged while not enrolled, two check-ins on the
// same day, and three people joining early enough that the enrollment goal
// sits at 1 to 4 in July.

import { describe, expect, it } from 'vitest';
import { computeAll, loadData, type RefData, type RefPeriod } from '../data/compute-reference.mjs';
import { ATTENDANCES, PERIODS, sample, type Dataset, type Engagement } from '../lib/data';
import { measure } from '../lib/engine';
import { applyAnswers, detectFindings, type Answers } from '../lib/findings';
import { computePeriod } from '../lib/report';

const extra: Engagement[] = [
  // P23 left on Jul 31, then turns up on Aug 10: a record, but not a seat.
  { id: 'E9001', date: '2026-08-10', group_id: 'mentor-circle', participant_id: 'P23', activity_type: ATTENDANCES, units: 1 },
  // A third copy of P03's Jul 16 record, with the lowest id and the most hours.
  { id: 'E0000', date: '2026-07-16', group_id: 'coding-club', participant_id: 'P03', activity_type: ATTENDANCES, units: 2 },
];
const units: Record<string, number> = { E0106: 0.5, E0001: 1.25 };
const change = <T extends { id: string; units: number }>(rows: T[], add: T[]): T[] => [...rows.map((e) => (e.id in units ? { ...e, units: units[e.id] } : e)), ...add];

// Codex's case: a second check-in for P02 on the day of an existing one, with
// a lower score and an id that sorts after it.
const p02 = sample.checkins.filter((c) => c.participant_id === 'P02').at(-1)!;
const tie = { id: 'C999', date: p02.date, participant_id: 'P02', confidence: Math.max(1, p02.confidence - 1) };
const early = new Set(['P05', 'P06', 'P12']);
const joinJul1 = <T extends { id: string; join_date: string }>(p: T): T => (early.has(p.id) ? { ...p, join_date: '2026-07-01' } : p);

const data = loadData();
const refData: RefData = {
  ...data,
  engagements: change(data.engagements, extra.map((e) => ({ ...e, mock: true }))),
  checkins: [...data.checkins, { ...tie, mock: true }],
  participants: (data.participants as { id: string; join_date: string }[]).map(joinJul1),
};
const ds: Dataset = { ...sample, engagements: change(sample.engagements, extra), checkins: [...sample.checkins, tie], participants: sample.participants.map(joinJul1) };
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
        expect(f.ageBreakdown.cells.map((c) => [c.key, c.display])).toEqual(r.participants_by_age_range.cells.map((c) => [c.age_range, c.display]));
        expect(f.goals.map((g) => [g.display, g.status, g.shownStatus, g.forecastDisplay, g.forecastLine])).toEqual(
          r.goals.map((g) => [g.display, g.status, g.shown_status, g.forecast_display, g.forecast_line]),
        );
        expect(f.notes.map((n) => n.text)).toEqual(r.data_notes.map((n) => n.text));
      });
    }
  }
  it('the changes reach the figures, so the test above is meaningful', () => {
    const q3 = ref.results.q3.none_answered;
    // P03's Jul 16 copies say 1.5, 0.5 and 2 hours: 0.5 counts. E0001 drops from 1.5 to 1.25. P23 adds 1.
    expect(q3.metrics.participant_hours.value).toBe(614.5 - 1.5 + 0.5 - 0.25 + 1);
    expect(computePeriod(ds, applyAnswers(ds, findings, {}), findings, PERIODS[0]).metrics.participant_hours.value).toBe(614.25);
    // P02's same-day pair: the lower score counts, though its id sorts last.
    expect(tie.confidence).toBeLessThan(p02.confidence);
    const month = PERIODS.find((p) => p.id !== 'q3' && p.start <= tie.date && tie.date <= p.end)!;
    const m = measure(ds, applyAnswers(ds, findings, {}), month.start, month.end);
    expect(m.checkins.find((c) => c.participant.id === 'P02')!.checkin.id).toBe('C999');
    // G1 sits at 3 in July, so neither side shows its status.
    expect(ref.results.jul.none_answered.goals[0]).toMatchObject({ display: '<5', shown_status: 'Not shown', forecast_display: null });
  });
});
