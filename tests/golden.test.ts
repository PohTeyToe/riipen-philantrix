// The app's engine against data/figures.json, which data/compute-reference.mjs
// writes from the same definitions with separate code. Both templates, all
// four periods, both answer states. If these disagree, one side breaks a
// definition in the brief: fix that side, never the figures by hand.

import { describe, expect, it } from 'vitest';
import figures from '../data/figures.json';
import { PERIODS, sample } from '../lib/data';
import { applyAnswers, detectFindings, type Answers } from '../lib/findings';
import { computePeriod, renderSummary } from '../lib/report';
import { TEMPLATES } from '../lib/templates';

type RefPeriod = (typeof figures.results)['q3']['none_answered'];
const findings = detectFindings(sample);
const states = figures.states as Record<string, Answers>;

describe('findings match the reference', () => {
  it('finds the same gaps', () => {
    expect(findings.map((f) => f.id).sort()).toEqual(figures.findings.map((f) => f.id).sort());
  });
});

describe('templates match the reference', () => {
  it('uses the same summary slots and kinds', () => {
    for (const t of TEMPLATES) {
      const ref = figures.templates.find((x) => x.id === t.id)!;
      expect(ref.name).toBe(t.name);
      const kinds = Object.fromEntries(Object.entries(t.slots).map(([k, v]) => [k, v.kind]));
      const refKinds = Object.fromEntries(Object.entries(ref.slots).map(([k, v]) => [k, (v as { kind: string }).kind]));
      expect(kinds).toEqual(refKinds);
    }
  });
});

for (const period of PERIODS) {
  for (const [stateId, answers] of Object.entries(states)) {
    describe(`${period.id}, ${stateId}`, () => {
      const ref = (figures.results as unknown as Record<string, Record<string, RefPeriod>>)[period.id][stateId];
      const st = applyAnswers(sample, findings, answers);
      const f = computePeriod(sample, st, findings, period);

      it('headline metrics', () => {
        for (const [id, r] of Object.entries(ref.metrics)) {
          const mine = f.metrics[id as keyof typeof f.metrics];
          expect(mine.display, id).toBe(r.display);
          if (r.value === null) expect(mine.value, id).toBeNull();
          else expect(mine.value, id).toBeCloseTo(r.value as number, 12);
        }
      });

      it('by-group rates', () => {
        expect(f.attendanceByGroup.map((g) => [g.groupId, g.num, g.den, g.display])).toEqual(
          ref.attendance_rate_by_group.map((g) => [g.group_id, g.attended, g.offered, g.display]),
        );
        expect(f.retentionByGroup.map((g) => [g.groupId, g.num, g.den, g.display])).toEqual(
          ref.retention_by_group.map((g) => [g.group_id, g.retained, g.enrolled, g.display]),
        );
      });

      it('age breakdown, with small ranges combined', () => {
        const r = ref.participants_by_age_range;
        expect(f.ageBreakdown.total).toEqual(r.total);
        expect(f.ageBreakdown.cells.map((c) => [c.key, c.ranges, c.value, c.display])).toEqual(r.cells.map((c) => [c.age_range, c.ranges, c.value, c.display]));
        expect(f.ageBreakdown.footnote).toBe(r.footnote);
      });

      it('goals', () => {
        expect(
          f.goals.map((g) => ({ id: g.id, display: g.display, target: g.targetDisplay, status: g.status, shown: g.shownStatus, forecast: g.forecastDisplay, line: g.forecastLine })),
        ).toEqual(ref.goals.map((g) => ({ id: g.id, display: g.display, target: g.target_display, status: g.status, shown: g.shown_status, forecast: g.forecast_display, line: g.forecast_line })));
        for (const [i, g] of f.goals.entries()) {
          const r = ref.goals[i];
          if (r.forecast === null) expect(g.forecast).toBeNull();
          else expect(g.forecast).toBeCloseTo(r.forecast, 9);
        }
      });

      it('data notes', () => {
        expect(f.notes.map((n) => [n.findingId, n.kind, n.templates, n.text])).toEqual(ref.data_notes.map((n) => [n.finding_id, n.kind, n.templates, n.text]));
      });

      it('summary slots', () => {
        for (const t of TEMPLATES) {
          const want = (figures.narrative_slots as unknown as Record<string, Record<string, Record<string, Record<string, string>>>>)[t.id][period.id][stateId];
          const parts = renderSummary({ ...t, narrative: Object.keys(t.slots).map((s) => `{${s}}`).join('|') }, f);
          const got = Object.fromEntries(Object.keys(t.slots).map((s, i) => [s, parts[i * 2].text]));
          expect(got).toEqual(want);
        }
      });
    });
  }
}
