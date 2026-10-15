// The awkward cases from the brief, on the sample data and on small datasets
// built by hand so each rule is tested on its own.

import { describe, expect, it } from 'vitest';
import { ATTENDANCES, PERIODS, SUBMISSIONS, sample, type Dataset, type Engagement, type Participant } from '../lib/data';
import { goalFigure, measure } from '../lib/engine';
import { applyAnswers, detectFindings, unansweredCount, type Answers } from '../lib/findings';
import { METRICS } from '../lib/metrics';
import { suppressBreakdown } from '../lib/privacy';
import { buildReport, computePeriod, renderSlot } from '../lib/report';
import { explain } from '../lib/trace';

const q3 = PERIODS[0];
const aug = PERIODS[2];
const findings = detectFindings(sample);
const figuresFor = (answers: Answers, period = q3) => computePeriod(sample, applyAnswers(sample, findings, answers), findings, period);

// ---------- a tiny dataset ----------
const person = (id: string, join: string, exit: string | null = null, age = '13-15'): Participant => ({ id, display_name: `Person ${id}`, group_id: 'g', age_range: age, join_date: join, exit_date: exit });
let n = 0;
const att = (pid: string, date: string, units = 1): Engagement => ({ id: `E${++n}`, date, group_id: 'g', participant_id: pid, activity_type: ATTENDANCES, units });
const sub = (pid: string, date: string): Engagement => ({ id: `E${++n}`, date, group_id: 'g', participant_id: pid, activity_type: SUBMISSIONS, units: 1 });
function tiny(over: Partial<Dataset> = {}): Dataset {
  return {
    orgName: 'Test org (sample)',
    workstream: 'Test',
    sampleLabel: 'Sample data.',
    asOf: '2026-09-30',
    ageRanges: ['10-12', '13-15', '16-18', '19-24'],
    groups: [{ id: 'g', name: 'Group', schedule_label: 'Thu', hours: 1, scheduled_dates: ['2026-07-02', '2026-07-09', '2026-07-16'] }],
    participants: [person('A', '2026-01-01'), person('B', '2026-01-01'), person('C', '2026-07-08')],
    engagements: [att('A', '2026-07-02'), att('B', '2026-07-02'), att('A', '2026-07-09'), att('C', '2026-07-09'), att('A', '2026-07-16'), att('B', '2026-07-16'), att('C', '2026-07-16')],
    goals: [],
    ...over,
  };
}
const tinyMeasure = (ds: Dataset, start = q3.start, end = q3.end, answers: Answers = {}) => measure(ds, applyAnswers(ds, detectFindings(ds), answers), start, end);

describe('someone who joins mid-quarter', () => {
  const ds = tiny();
  const m = tinyMeasure(ds);
  it('is not offered a seat before they joined', () => {
    // Jul 2: A and B. Jul 9: A, B, C. Jul 16: A, B, C.
    expect(m.offered).toBe(8);
    expect(m.attended).toBe(7);
    expect(METRICS.attendance_rate.compute(m).display).toBe('88%');
  });
  it('counts as new in the period they joined, and not in the next', () => {
    expect(m.newParticipants.map((p) => p.id)).toEqual(['C']);
    expect(tinyMeasure(ds, '2026-08-01', '2026-08-31').newParticipants).toEqual([]);
  });
  it('counts toward retention from the day they joined', () => {
    expect(m.enrolledAny.length).toBe(3);
    expect(m.retained.length).toBe(3);
  });
});

describe('a group with no sessions', () => {
  it('shows "No sessions in Aug" for Weekend Leaders, never 0% or a blank', () => {
    const wl = figuresFor({}, aug).attendanceByGroup.find((g) => g.groupId === 'weekend-leaders')!;
    expect(wl.value).toBeNull();
    expect(wl.display).toBe('No sessions in Aug');
  });
  it('shows "No sessions in this period" when nothing ran at all', () => {
    const m = tinyMeasure(tiny({ engagements: [] }));
    expect(METRICS.attendance_rate.compute(m)).toMatchObject({ value: null, display: 'No sessions in this period' });
    expect(METRICS.submissions_per_participant.compute(m).display).toBe('No participants served');
  });
});

describe('the same person logged twice in one session', () => {
  const m = measure(sample, applyAnswers(sample, findings, {}), q3.start, q3.end);
  it('counts once in attendance and hours', () => {
    expect(m.duplicates.map((e) => e.id)).toEqual(['E0106']);
    expect(m.attendance.some((e) => e.id === 'E0105')).toBe(true);
    const raw = sample.engagements.filter((e) => e.activity_type === ATTENDANCES && e.date >= q3.start && e.date <= q3.end);
    expect(raw.length - m.attendance.length).toBe(1);
    const rawHours = raw.reduce((s, e) => s + e.units, 0);
    expect(rawHours - m.hoursHundredths / 100).toBe(1.5);
  });
  it('is a finding with no question, and a data note in July only', () => {
    const f = findings.find((x) => x.kind === 'duplicate_record')!;
    expect(f.answers).toEqual([]);
    expect(figuresFor({}, PERIODS[1]).notes.some((x) => x.findingId === f.id)).toBe(true);
    expect(figuresFor({}, aug).notes.some((x) => x.findingId === f.id)).toBe(false);
  });
  it('shows in the trace as a row that counts once', () => {
    const t = explain(sample, findings, {}, 'q3', { kind: 'metric', metric: 'participant_hours' });
    expect(t.rows.filter((r) => r.tone === 'duplicate')).toHaveLength(1);
  });
});

describe('goals', () => {
  const st = applyAnswers(sample, findings, {});
  it('G1 is past due at 6 of 8, with no forecast', () => {
    const g = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G1')!, '2026-09-30');
    expect([g.status, g.value, g.forecastLine]).toEqual(['Past due', 6, null]);
  });
  it('a met goal stays Met after its due date', () => {
    const g = goalFigure(sample, st, { ...sample.goals.find((x) => x.id === 'G1')!, target: 6 }, '2026-09-30');
    expect(g.status).toBe('Met');
  });
  it('G4 has no due date, so no forecast', () => {
    const g = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G4')!, '2026-09-30');
    expect([g.status, g.forecast, g.forecastLine]).toEqual(['No due date', null, null]);
  });
  it('forecasts count goals by pace: G2 on track, G3 behind', () => {
    const g2 = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G2')!, '2026-09-30');
    const g3 = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G3')!, '2026-09-30');
    expect(g2.status).toBe('On track');
    expect(g2.forecastLine).toBe('Forecast by Dec 18: 1,142 of 1,050');
    expect(g3.status).toBe('Behind');
    expect(g3.forecast! / g3.target).toBeCloseTo(0.84, 2);
  });
});

describe('suppression', () => {
  it('hides 1 to 4 as <5 and shows 0 as 0', () => {
    const { cells } = suppressBreakdown([{ key: 'a', value: 0 }, { key: 'b', value: 4 }, { key: 'c', value: 5 }, { key: 'd', value: 1 }]);
    expect(cells.map((c) => c.display)).toEqual(['0', '<5', '5', '<5']);
  });
  it('hides the next smallest cell when only one is small, so it cannot be subtracted out', () => {
    const r = suppressBreakdown([{ key: 'a', value: 11 }, { key: 'b', value: 14 }, { key: 'c', value: 12 }, { key: 'd', value: 3 }]);
    expect(r.cells.map((c) => c.display)).toEqual(['hidden', '14', '12', '<5']);
    expect(r.footnote).toBe("Hidden so a small group can't be worked out from the total.");
  });
  it('breaks a tie for next smallest by display order', () => {
    const r = suppressBreakdown([{ key: 'a', value: 9 }, { key: 'b', value: 9 }, { key: 'c', value: 2 }]);
    expect(r.cells.map((c) => c.display)).toEqual(['hidden', '9', '<5']);
  });
  it('needs no second cell when two are already hidden', () => {
    const r = suppressBreakdown([{ key: 'a', value: 9 }, { key: 'b', value: 2 }, { key: 'c', value: 3 }]);
    expect(r.cells.map((c) => c.display)).toEqual(['9', '<5', '<5']);
    expect(r.footnote).toBeNull();
  });
  it('fires on the sample: 19-24 shows <5 and 10-12 is hidden too', () => {
    const cells = figuresFor({}).ageBreakdown.cells;
    expect(cells.map((c) => [c.key, c.display])).toEqual([['10-12', 'hidden'], ['13-15', '14'], ['16-18', '12'], ['19-24', '<5']]);
  });
  it('turns a small people count into "fewer than 5" in the summary', () => {
    const f = figuresFor({});
    const small = { ...f, metrics: { ...f.metrics, new_participants: { ...f.metrics.new_participants, value: 3, display: '<5' } } };
    expect(renderSlot({ kind: 'people', source: { from: 'metric', metric: 'new_participants' } }, small).text).toBe('fewer than 5');
  });
});

describe('each gap answer moves the right number', () => {
  const base = figuresFor({});
  it('"Ran, attendance not recorded" adds a delivered session and leaves the attendance rate alone', () => {
    const f = figuresFor({ 'gap-coding-club-2026-07-23': 'ran_not_recorded' });
    expect(f.metrics.sessions_delivered.value).toBe(base.metrics.sessions_delivered.value! + 1);
    expect(f.metrics.attendance_rate.display).toBe(base.metrics.attendance_rate.display);
    expect(f.notes.find((x) => x.findingId === 'gap-coding-club-2026-07-23')?.kind).toBe('session_ran_not_recorded');
  });
  it('"Didn\'t run" changes no figure and takes the note off', () => {
    const f = figuresFor({ 'gap-coding-club-2026-07-23': 'didnt_run' });
    expect(f.metrics).toEqual(base.metrics);
    expect(f.notes.some((x) => x.findingId === 'gap-coding-club-2026-07-23')).toBe(false);
  });
  it('"Left the program" lowers retention and ends enrolment at the last activity', () => {
    const answers: Answers = { 'inactive-P08': 'left_program' };
    const f = figuresFor(answers);
    expect(f.metrics.retention_rate.value!).toBeLessThan(base.metrics.retention_rate.value!);
    expect(applyAnswers(sample, findings, answers).people.find((p) => p.id === 'P08')!.exit_date).toBe('2026-08-20');
    expect(f.notes.some((x) => x.findingId === 'inactive-P08')).toBe(false);
  });
  it('"Still enrolled" changes no figure and takes the note off', () => {
    const f = figuresFor({ 'inactive-P08': 'still_enrolled' });
    expect(f.metrics).toEqual(base.metrics);
    expect(f.notes.some((x) => x.findingId === 'inactive-P08')).toBe(false);
  });
  it('counts what still needs an answer', () => {
    expect(unansweredCount(findings, {})).toBe(5);
    expect(unansweredCount(findings, { 'inactive-P08': 'still_enrolled' })).toBe(4);
  });
});

describe('no names in funder output', () => {
  const names = sample.participants.map((p) => p.display_name);
  const firstNames = [...new Set(names.map((x) => x.split(' ')[0]))];
  const states: Answers[] = [{}, Object.fromEntries(findings.filter((f) => f.answers.length).map((f) => [f.id, f.answers[1].id]))];
  it('report model and Excel sheets, every template, period and state', async () => {
    const { workbookSheets } = await import('../lib/excel');
    for (const t of ['city-youth-grant', 'foundation-outcomes'] as const) {
      for (const p of PERIODS) {
        for (const a of states) {
          const r = buildReport(sample, findings, a, t, p.id);
          const text = JSON.stringify(r) + JSON.stringify(workbookSheets(r));
          for (const n of firstNames) expect(text, `${t} ${p.id}`).not.toMatch(new RegExp(`\\b${n}\\b`));
          expect(text).not.toMatch(/\bP\d{2}\b/);
        }
      }
    }
  });
  it('the staff trace does show names, so the test above is meaningful', () => {
    const t = explain(sample, findings, {}, 'q3', { kind: 'metric', metric: 'participants_served' });
    expect(names).toContain(t.rows[0].cells[0]);
  });
});

describe('Excel sheets', () => {
  it('start with the sample label and keep numbers numeric, hidden cells as text', async () => {
    const { workbookSheets } = await import('../lib/excel');
    const sheets = workbookSheets(buildReport(sample, findings, {}, 'city-youth-grant', 'q3'));
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'By group', 'Age range', 'Goals', 'Data notes']);
    for (const s of sheets) expect(String(s.rows[0][0])).toMatch(/^SAMPLE DATA\./);
    const age = sheets.find((s) => s.name === 'Age range')!.rows;
    expect(age.find((r) => r[0] === '19-24')![1]).toBe('<5');
    expect(age.find((r) => r[0] === '10-12')![1]).toBe('hidden');
    expect(age.find((r) => r[0] === '13-15')![1]).toEqual({ v: 14, z: '#,##0' });
    const summary = sheets[0].rows.find((r) => r[0] === 'Attendance rate')!;
    expect(summary[1]).toMatchObject({ z: '0%' });
  });
});
