// The awkward cases from the brief, on the sample data and on small datasets
// built by hand so each rule is tested on its own.

import { describe, expect, it } from 'vitest';
import { ATTENDANCES, PERIODS, sample, type Dataset, type Engagement, type Participant } from '../lib/data';
import { goalFigure, measure } from '../lib/engine';
import { applyAnswers, detectFindings, unansweredCount, type Answers } from '../lib/findings';
import { METRICS } from '../lib/metrics';
import { fmtDecimalPrecise, fmtPercentPrecise, fmtWholePrecise } from '../lib/format';
import { EXIT_NOTE, buildReport, changedFigures, computePeriod, renderSlot } from '../lib/report';
import { explain } from '../lib/trace';

const q3 = PERIODS[0];
const aug = PERIODS[2];
const findings = detectFindings(sample);
const figuresFor = (answers: Answers, period = q3) => computePeriod(sample, applyAnswers(sample, findings, answers), findings, period);

// ---------- a tiny dataset ----------
const person = (id: string, join: string, exit: string | null = null, age = '13-15'): Participant => ({ id, display_name: `Person ${id}`, group_id: 'g', age_range: age, join_date: join, exit_date: exit, confidence_intake: null });
let n = 0;
const att = (pid: string, date: string, units = 1): Engagement => ({ id: `E${++n}`, date, group_id: 'g', participant_id: pid, activity_type: ATTENDANCES, units });
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
    checkins: [],
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
  it('is a finding with no question, and stays off the funder copy', () => {
    const f = findings.find((x) => x.kind === 'duplicate_record')!;
    expect(f.answers).toEqual([]);
    expect(figuresFor({}, PERIODS[1]).notes.some((x) => x.findingId === f.id)).toBe(false);
  });
  it('counts the copy with fewer hours when the copies disagree, whatever their ids or order', () => {
    const longer = { ...att('A', '2026-07-02', 2), id: 'E1' };
    const shorter = { ...att('A', '2026-07-02', 1.5), id: 'E9' };
    for (const engagements of [[longer, shorter], [shorter, longer]]) {
      const m = tinyMeasure(tiny({ engagements }));
      expect(m.attendance.map((e) => e.id)).toEqual(['E9']);
      expect(m.duplicates.map((e) => e.id)).toEqual(['E1']);
      expect(m.hoursHundredths).toBe(150);
    }
  });
  it('shows the lower id as the counted copy when the copies are the same', () => {
    const a = { ...att('A', '2026-07-02', 1), id: 'E9' };
    const b = { ...att('A', '2026-07-02', 1), id: 'E1' };
    expect(tinyMeasure(tiny({ engagements: [a, b] })).attendance.map((e) => e.id)).toEqual(['E1']);
  });
  it('shows in the trace as a row that counts once', () => {
    const t = explain(sample, findings, {}, 'q3', { kind: 'metric', metric: 'participant_hours' });
    expect(t.rows.filter((r) => r.tone === 'duplicate')).toHaveLength(1);
  });
});

describe('someone who attends while not on the roster', () => {
  // B left on Jul 5 but is logged on Jul 9: a real record, but not a seat.
  const ds = tiny({ participants: [person('A', '2026-01-01'), person('B', '2026-01-01', '2026-07-05')], engagements: [att('A', '2026-07-02'), att('B', '2026-07-02'), att('A', '2026-07-09'), att('B', '2026-07-09')] });
  const m = tinyMeasure(ds);
  it('counts toward participants served and hours, not the attendance rate', () => {
    expect([m.offered, m.attended]).toEqual([3, 3]);
    expect(METRICS.attendance_rate.compute(m).display).toBe('100%');
    expect(m.served).toEqual(['A', 'B']);
    expect(m.hoursHundredths).toBe(400);
  });
  it('shows in the trace as its own row, and the caption adds up', () => {
    const t = explain(ds, detectFindings(ds), {}, 'q3', { kind: 'metric', metric: 'attendance_rate' });
    expect(t.rows.filter((r) => r.cells[3] === 'Attended, not on roster')).toHaveLength(1);
    expect(t.rowsCaption).toMatch(/^3 seats offered: 3 attended, 0 absent\. 1 person attended while not enrolled/);
  });
});

describe('goals', () => {
  const st = applyAnswers(sample, findings, {});
  it('G1 is past due at 6 of 8, with no forecast', () => {
    const g = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G1')!, '2026-09-30');
    expect([g.status, g.value, g.forecastLine]).toEqual(['Past due', 6, null]);
  });
  it('a goal not met by the end of its due date is past due on that day, with no forecast', () => {
    const g = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G1')!, '2026-08-31');
    expect([g.status, g.forecastLine]).toEqual(['Past due', null]);
  });
  // Three people join on Jul 1. As of Jul 31, G1 (due Aug 31) forecasts 3 × 62 ÷ 31 = 6 of 8,
  // so "<5" next to "Forecast: 6" or "Behind" would say it's 3.
  const julyJoiners = ['P05', 'P06', 'P12'];
  const early: Dataset = { ...sample, participants: sample.participants.map((p) => (julyJoiners.includes(p.id) ? { ...p, join_date: '2026-07-01' } : p)) };
  it('a people goal at 1 to 4 shows "<5" with no status or forecast, since either would give the count away', () => {
    const g = goalFigure(early, applyAnswers(early, findings, {}), early.goals.find((x) => x.id === 'G1')!, '2026-07-31');
    expect([g.display, g.staffDisplay, g.status, g.shownStatus]).toEqual(['<5', '3', 'Behind', 'Not shown']);
    expect([g.forecastDisplay, g.forecastLine, g.forecastStaffDisplay]).toEqual([null, null, '6']);
    const t = explain(early, findings, {}, 'jul', { kind: 'goal', goalId: 'G1', part: 'value' });
    expect([t.value, t.funderShows]).toEqual(['3', '<5, with no status or forecast']);
  });
  it('says why in a data note on the template that shows the goal, and in the summary', () => {
    const r = buildReport(early, findings, {}, 'city-youth-grant', 'jul');
    const notes = r.sections.find((s) => s.type === 'notes');
    expect(notes?.type === 'notes' && notes.notes).toContain("Enroll 8 new participants: fewer than 5 so far, so its status and forecast aren't shown. Either one would say how many.");
    const goals = r.sections.find((s) => s.type === 'goals');
    expect(goals?.type === 'goals' && goals.goals[0].status).toBe('Not shown');
    expect(renderSlot({ kind: 'status', source: { from: 'goal', goalId: 'G1', part: 'status' } }, computePeriod(early, applyAnswers(early, findings, {}), findings, PERIODS[1])).text).toBe('not rated while it counts fewer than 5 people');
    const foundation = buildReport(early, findings, {}, 'foundation-outcomes', 'jul').sections.find((s) => s.type === 'notes');
    expect(foundation?.type === 'notes' && foundation.notes.some((n) => n.startsWith('Enroll'))).toBe(false);
  });
  it('shows a people goal at 0 or 5 and up as usual', () => {
    const g = goalFigure(sample, st, sample.goals.find((x) => x.id === 'G1')!, '2026-07-31');
    expect([g.display, g.shownStatus, g.forecastLine]).toEqual(['0', 'Behind', 'Forecast by Aug 31: 0 of 8']);
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

describe('people counts in the summary', () => {
  const f = figuresFor({});
  const slot = (value: number) =>
    renderSlot({ kind: 'people', source: { from: 'metric', metric: 'new_participants' } }, { ...f, metrics: { ...f.metrics, new_participants: { ...f.metrics.new_participants, value } } }).text;
  it('reads "no" for 0, "fewer than 5" for 1 to 4, and the number from 5', () => {
    expect([slot(0), slot(1), slot(4), slot(5), slot(1200)]).toEqual(['no', 'fewer than 5', 'fewer than 5', '5', '1,200']);
  });
  it('writes a goal due date out in full', () => {
    expect(renderSlot({ kind: 'date', source: { from: 'goal', goalId: 'G2', part: 'due' } }, f).text).toBe('December 18, 2026');
  });
});

describe('each gap answer moves the right number', () => {
  const base = figuresFor({});
  it('an unanswered finding stays off the funder copy', () => {
    expect(base.notes.map((n) => n.kind)).toEqual(['goal_no_due_date']);
  });
  it('"Ran, attendance not recorded" adds a delivered session and a note, and leaves the attendance rate alone', () => {
    const f = figuresFor({ 'gap-coding-club-2026-07-23': 'ran_not_recorded' });
    expect(f.metrics.sessions_delivered.value).toBe(base.metrics.sessions_delivered.value! + 1);
    expect(f.metrics.attendance_rate.display).toBe(base.metrics.attendance_rate.display);
    expect(f.notes.find((x) => x.findingId === 'gap-coding-club-2026-07-23')?.kind).toBe('session_ran_not_recorded');
  });
  it('"Didn\'t run" changes no figure and adds no note', () => {
    const f = figuresFor({ 'gap-coding-club-2026-07-23': 'didnt_run' });
    expect(f.metrics).toEqual(base.metrics);
    expect(f.notes).toEqual(base.notes);
  });
  it('"Left the program" lowers retention, ends enrolment at the last activity, and says so without naming anyone', () => {
    const answers: Answers = { 'inactive-P08': 'left_program' };
    const f = figuresFor(answers);
    expect(f.metrics.retention_rate.value!).toBeLessThan(base.metrics.retention_rate.value!);
    expect(applyAnswers(sample, findings, answers).people.find((p) => p.id === 'P08')!.exit_date).toBe('2026-08-20');
    expect(f.notes.filter((x) => x.kind === 'exit_by_answer').map((x) => x.text)).toEqual([EXIT_NOTE]);
    // In the periods the exit changes: not July, which ends before Aug 20.
    expect(figuresFor(answers, PERIODS[1]).notes.some((x) => x.kind === 'exit_by_answer')).toBe(false);
    expect(figuresFor(answers, aug).notes.some((x) => x.kind === 'exit_by_answer')).toBe(true);
  });
  it('"Still enrolled" changes no figure and adds no note', () => {
    const f = figuresFor({ 'inactive-P08': 'still_enrolled' });
    expect(f.metrics).toEqual(base.metrics);
    expect(f.notes).toEqual(base.notes);
  });
  it('lists every figure an answer moves, on both templates', () => {
    const changes = changedFigures(sample, findings, {}, { 'inactive-P02': 'left_program' }, 'q3');
    expect(changes.map((c) => [c.label, c.before, c.after, c.templates.join()])).toEqual([
      ['Attendance rate', '76%', '77%', 'city-youth-grant,foundation-outcomes'],
      ['Attendance rate, Coding Club', '75%', '77%', 'city-youth-grant'],
      ['Retention rate', '95%', '93%', 'foundation-outcomes'],
      ['Retention rate, Coding Club', '100%', '94%', 'foundation-outcomes'],
      ['Attendance rate of 80%, progress', '76%', '77%', 'foundation-outcomes'],
    ]);
    expect(changedFigures(sample, findings, {}, { 'gap-coding-club-2026-07-23': 'ran_not_recorded' }, 'q3').map((c) => [c.label, c.before, c.after])).toEqual([
      ['Sessions delivered', '42', '43'],
    ]);
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
  it('follow the page: a notes sheet only when there are notes', async () => {
    const { workbookSheets } = await import('../lib/excel');
    expect(workbookSheets(buildReport(sample, findings, {}, 'foundation-outcomes', 'q3')).map((s) => s.name)).toEqual(['Summary', 'By group', 'Goals', 'Data notes']);
    expect(workbookSheets(buildReport(sample, findings, { 'gap-coding-club-2026-07-23': 'ran_not_recorded' }, 'city-youth-grant', 'q3')).map((s) => s.name)).toEqual(['Summary', 'By group', 'Age range', 'Goals', 'Data notes']);
  });
  it('start with the sample label and keep numbers numeric', async () => {
    const { workbookSheets } = await import('../lib/excel');
    const sheets = workbookSheets(buildReport(sample, findings, {}, 'city-youth-grant', 'q3'));
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'By group', 'Age range', 'Goals']);
    for (const s of sheets) expect(String(s.rows[0][0])).toMatch(/^SAMPLE DATA\./);
    const age = sheets.find((s) => s.name === 'Age range')!.rows;
    expect(age.filter((r) => typeof r[1] === 'object' && r[1] !== null).map((r) => r[0])).toEqual(['10-12', '13-15', '16-24', 'Total']);
    expect(age.find((r) => r[0] === '16-24')![1]).toEqual({ v: 15, z: '#,##0' });
    expect(age.some((r) => r[0] === "Age ranges are combined where one would show 1 to 4 people in this quarter or any month of it.")).toBe(true);
    const summary = sheets[0].rows.find((r) => r[0] === 'Attendance rate')!;
    expect(summary[1]).toMatchObject({ z: '0%' });
  });
});

describe('the confidence outcome', () => {
  const ds = tiny({
    participants: [{ ...person('A', '2026-01-01'), confidence_intake: 2 }, { ...person('B', '2026-01-01'), confidence_intake: 3 }, { ...person('C', '2026-07-08'), confidence_intake: null }],
    checkins: [
      { id: 'C1', date: '2026-07-09', participant_id: 'A', confidence: 2 },
      { id: 'C2', date: '2026-07-16', participant_id: 'A', confidence: 4 },
      { id: 'C3', date: '2026-07-16', participant_id: 'B', confidence: 3 },
      { id: 'C4', date: '2026-07-16', participant_id: 'C', confidence: 5 },
      { id: 'C5', date: '2026-08-04', participant_id: 'B', confidence: 4 },
    ],
  });
  it('counts the lower score when someone has two check-ins on the same day, whatever their ids', () => {
    const twice = { ...ds, checkins: [...ds.checkins, { id: 'C0', date: '2026-07-16', participant_id: 'A', confidence: 2 }] };
    const m = tinyMeasure(twice, '2026-07-01', '2026-07-31');
    expect(m.checkins.find((c) => c.participant.id === 'A')!.checkin.id).toBe('C0');
    expect(METRICS.confidence_improved.compute(m).display).toBe('0%');
  });
  it('compares the latest check-in in the period with intake, and skips anyone without an intake score', () => {
    const m = tinyMeasure(ds, '2026-07-01', '2026-07-31');
    expect(m.checkins.map((c) => [c.participant.id, c.checkin.id, c.improved])).toEqual([['A', 'C2', true], ['B', 'C3', false]]);
    expect(METRICS.confidence_improved.compute(m).display).toBe('50%');
    expect(METRICS.participants_checked_in.compute(m).display).toBe('<5');
  });
  it('says so when nobody checked in', () => {
    const m = tinyMeasure(ds, '2026-09-01', '2026-09-30');
    expect(METRICS.confidence_improved.compute(m)).toMatchObject({ value: null, display: 'No check-ins in this period' });
  });
  it('has check-ins in every period of the sample, and some people served without one', () => {
    for (const p of PERIODS) {
      const m = figuresFor({}, p).metrics;
      expect(m.participants_checked_in.value!).toBeGreaterThanOrEqual(5);
      expect(m.participants_checked_in.value!, p.id).toBeLessThan(m.participants_served.value!);
    }
  });
});

describe('the summary states each goal it mentions', () => {
  it('renders a status slot as words', () => {
    const f = figuresFor({});
    expect(renderSlot({ kind: 'status', source: { from: 'goal', goalId: 'G1', part: 'status' } }, f).text).toBe('past due');
    expect(renderSlot({ kind: 'status', source: { from: 'goal', goalId: 'G3', part: 'status' } }, f).text).toBe('behind');
  });
  const text = (t: 'city-youth-grant' | 'foundation-outcomes', period: 'q3' | 'jul' = 'q3') =>
    buildReport(sample, findings, {}, t, period).sections.flatMap((s) => (s.type === 'summary' ? s.parts.map((p) => p.text) : [])).join('');
  it('says "past due" and "behind" on the sample report', () => {
    expect(text('city-youth-grant')).toMatch(/\bpast due\b/);
    expect(text('foundation-outcomes')).toMatch(/\bbehind\b/);
  });
  it('gives each goal its target and due date, not progress that would repeat the period figure', () => {
    expect(text('city-youth-grant')).toContain('August 31, 2026');
    expect(text('foundation-outcomes')).toContain('December 18, 2026');
    expect(text('foundation-outcomes').match(/\b163\b/g)).toHaveLength(1);
    expect(text('city-youth-grant').match(/\b615\b/g)).toHaveLength(1);
  });
  it('reads "no new participants" in a month nobody joined', () => {
    expect(text('city-youth-grant', 'jul')).toContain('no new participants');
  });
});

describe('dates and the arithmetic', () => {
  it('shows the year on a date outside the report period', () => {
    const t = explain(sample, findings, {}, 'q3', { kind: 'metric', metric: 'retention_rate' });
    const adam = t.rows.find((r) => r.cells[0] === 'Adam J.')!;
    expect(adam.cells[2]).toBe('Sep 9, 2025');
    const left = explain(sample, findings, { 'inactive-P02': 'left_program' }, 'q3', { kind: 'metric', metric: 'retention_rate' });
    expect(left.rows.find((r) => r.cells[0] === 'Aidan W.')!.cells[3]).toBe('Left Aug 25 (your answer)');
  });
  it('rounds the unrounded value half up, and adds places rather than contradict the shown figure', () => {
    expect(fmtPercentPrecise(58, 72)).toBe('80.56%');
    expect(fmtPercentPrecise(420, 553)).toBe('75.95%');
    // 77.496% must not read "77.50%, shown as 77%".
    expect(fmtPercentPrecise(77496, 100000)).toBe('77.496%');
    expect(fmtDecimalPrecise(163, 40)).toBe('4.075');
    expect(fmtWholePrecise(61450 * 171, 100 * 92)).toBe('1,142.168');
  });
  it('writes the forecast arithmetic with thousands separators', () => {
    const t = explain(sample, findings, {}, 'q3', { kind: 'goal', goalId: 'G2', part: 'forecast' });
    expect(t.arithmetic[1]).toBe('Forecast: 614.5 × 171 days in the goal ÷ 92 days so far = 1,142.168, shown as 1,142');
  });
});
