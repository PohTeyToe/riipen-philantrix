// The page lets a viewer edit attendance, answer gaps and move the privacy
// cutoff. These tests hold the pieces behind that: edits, the register, the
// sources a number lights up, and the cutoff.

import { describe, expect, it } from 'vitest';
import { ATTENDANCES, PERIODS, sample } from '../lib/data';
import { attendanceBySeat, applyEdits, seatKey, setSeats, toggleSeat, type Edits } from '../lib/edits';
import { measure } from '../lib/engine';
import { applyAnswers, detectFindings, type Answers } from '../lib/findings';
import { METRICS } from '../lib/metrics';
import { combineBands, peopleForFunder } from '../lib/privacy';
import { buildRegister } from '../lib/register';
import { buildReport, computePeriod, reportNumbers } from '../lib/report';
import { sourcesFor } from '../lib/sources';
import { explain } from '../lib/trace';

const q3 = PERIODS[0];
const findings = detectFindings(sample);
const st0 = applyAnswers(sample, findings, {});
const register = (ds = sample, answers: Answers = {}, edits: Edits = {}) => {
  const f = detectFindings(ds);
  return buildRegister(ds, applyAnswers(ds, f, answers), f, edits, q3.start, sample.asOf);
};

describe('edits', () => {
  const p01Jul2 = seatKey('P01', 'coding-club', '2026-07-02');

  it('leave the dataset alone when there are none', () => {
    expect(applyEdits(sample, {})).toBe(sample);
  });

  it('untick removes the seat, and ticking it again drops the edit', () => {
    const once = toggleSeat(sample, {}, p01Jul2);
    expect(once).toEqual({ [p01Jul2]: false });
    expect(attendanceBySeat(applyEdits(sample, once)).has(p01Jul2)).toBe(false);
    expect(toggleSeat(sample, once, p01Jul2)).toEqual({});
  });

  it('untick a logged duplicate removes both copies, and ticking it again brings both back', () => {
    const dup = seatKey('P03', 'coding-club', '2026-07-16');
    expect(attendanceBySeat(sample).get(dup)?.length).toBe(2);
    const off = toggleSeat(sample, {}, dup);
    expect(attendanceBySeat(applyEdits(sample, off)).has(dup)).toBe(false);
    expect(applyEdits(sample, toggleSeat(sample, off, dup))).toBe(sample);
  });

  it('a ticked seat counts at the group session length', () => {
    // P08 has had no activity since Aug 20. Tick them in at Sep 29.
    const k = seatKey('P08', 'coding-club', '2026-09-29');
    const ds = applyEdits(sample, toggleSeat(sample, {}, k));
    const added = ds.engagements.filter((e) => e.participant_id === 'P08' && e.date === '2026-09-29');
    expect(added).toEqual([{ id: 'EDIT-P08-coding-club-2026-09-29', date: '2026-09-29', group_id: 'coding-club', participant_id: 'P08', activity_type: ATTENDANCES, units: 1.5 }]);
    // and the data check no longer asks about them
    expect(detectFindings(ds).some((f) => f.id === 'inactive-P08')).toBe(false);
    const m = measure(ds, applyAnswers(ds, detectFindings(ds), {}), q3.start, q3.end);
    expect(METRICS.participant_hours.compute(m).arithmetic).toContain('616.0 hours');
  });

  it('clearing a whole session makes it a gap the check asks about', () => {
    const date = '2026-09-03';
    const seats = [...attendanceBySeat(sample).keys()].filter((k) => k.endsWith(`|coding-club|${date}`));
    expect(seats.length).toBeGreaterThan(0);
    const ds = applyEdits(sample, setSeats(sample, {}, seats, false));
    expect(detectFindings(ds).map((f) => f.id)).toContain(`gap-coding-club-${date}`);
    expect(buildReport(ds, detectFindings(ds), {}, 'city-youth-grant', 'q3').sections.length).toBeGreaterThan(0);
    expect(reportNumbers(buildReport(ds, detectFindings(ds), {}, 'city-youth-grant', 'q3')).get('metric:sessions_delivered')).toBe('41');
  });

  it('setting seats back the way they were logged leaves no edits', () => {
    const seats = [...attendanceBySeat(sample).keys()].filter((k) => k.endsWith('|mentor-circle|2026-07-06'));
    const off = setSeats(sample, {}, seats, false);
    expect(setSeats(sample, off, seats, true)).toEqual({});
  });
});

describe('the register', () => {
  const r = register();
  const sessions = r.groups.flatMap((g) => g.sessions);

  it('has every scheduled session, 45 in all, and one row per participant', () => {
    expect(r.days).toBe(92);
    expect(sessions.length).toBe(45);
    expect(r.groups.map((g) => [g.id, g.sessions.length, g.rows.length])).toEqual([
      ['coding-club', 26, 16],
      ['mentor-circle', 11, 13],
      ['weekend-leaders', 8, 11],
    ]);
  });

  it('marks the 3 sessions with nothing logged as gaps, and an answer changes them', () => {
    const gaps = sessions.filter((s) => s.status === 'gap').map((s) => `${s.groupId} ${s.date}`);
    expect(gaps).toEqual(['coding-club 2026-07-23', 'mentor-circle 2026-09-14', 'weekend-leaders 2026-09-19']);
    const answered = register(sample, { 'gap-coding-club-2026-07-23': 'ran_not_recorded', 'gap-mentor-circle-2026-09-14': 'didnt_run' });
    const s = answered.groups.flatMap((g) => g.sessions);
    expect(s.find((x) => x.date === '2026-07-23')?.status).toBe('ran');
    expect(s.find((x) => x.date === '2026-09-14')?.status).toBe('didnt_run');
    // A session that didn't run has no seats.
    const mc = answered.groups.find((g) => g.id === 'mentor-circle')!;
    expect(mc.rows.some((row) => row.cells.some((c) => c.date === '2026-09-14'))).toBe(false);
  });

  it('agrees with the engine on seats: 420 attended of 553 offered', () => {
    const cells = r.groups.flatMap((g) => g.rows.flatMap((row) => row.cells));
    expect(cells.filter((c) => c.state === 'attended' && !c.offRoster).length).toBe(420);
    expect(cells.filter((c) => (c.state === 'attended' || c.state === 'absent') && !c.offRoster).length).toBe(553);
  });

  it('marks the duplicate and the two idle participants until someone answers', () => {
    const cc = r.groups.find((g) => g.id === 'coding-club')!;
    const dup = cc.rows.find((row) => row.participantId === 'P03')!.cells.find((c) => c.date === '2026-07-16')!;
    expect(dup.duplicate).toBe(true);
    const p08 = cc.rows.find((row) => row.participantId === 'P08')!;
    expect(p08.cells.filter((c) => c.idle).every((c) => c.date > '2026-08-20')).toBe(true);
    expect(p08.cells.some((c) => c.idle)).toBe(true);
    const left = register(sample, { 'inactive-P08': 'left_program' }).groups[0].rows.find((row) => row.participantId === 'P08')!;
    expect(left.cells.every((c) => c.date <= '2026-08-20')).toBe(true);
  });

  it('flags edited seats', () => {
    const k = seatKey('P01', 'coding-club', '2026-07-02');
    const edits = toggleSeat(sample, {}, k);
    const cell = register(applyEdits(sample, edits), {}, edits).groups[0].rows.find((row) => row.participantId === 'P01')!.cells[0];
    expect([cell.date, cell.state, cell.edited]).toEqual(['2026-07-02', 'absent', true]);
  });
});

const BY_SESSION = new Set(['sessions_delivered']);
const BY_SEAT = new Set(['participant_hours', 'attendance_rate', 'assignment_submissions']);

describe('sources a number lights up', () => {
  it('attendance rate: the 420 attended seats count, the 133 absences only divide', () => {
    const s = sourcesFor(sample, st0, 'q3', { kind: 'metric', metric: 'attendance_rate' });
    const tones = [...s.seats.values()];
    expect([tones.filter((t) => t === 'counted').length, tones.filter((t) => t === 'against').length]).toEqual([420, 133]);
  });

  it('sessions delivered: the 42 logged sessions, then 43 once one is answered "ran"', () => {
    expect(sourcesFor(sample, st0, 'q3', { kind: 'metric', metric: 'sessions_delivered' }).sessions.size).toBe(42);
    const st = applyAnswers(sample, findings, { 'gap-coding-club-2026-07-23': 'ran_not_recorded' });
    expect(sourcesFor(sample, st, 'q3', { kind: 'metric', metric: 'sessions_delivered' }).sessions.has('coding-club|2026-07-23')).toBe(true);
  });

  it('match the rows the staff view lists, for every number on both templates', () => {
    for (const t of ['city-youth-grant', 'foundation-outcomes'] as const) {
      const keys = [...reportNumbers(buildReport(sample, findings, {}, t, 'q3')).keys()].filter((k) => k.startsWith('metric:') && !k.includes(':', 7));
      for (const key of keys) {
        const metric = key.slice(7) as keyof typeof METRICS;
        const s = sourcesFor(sample, st0, 'q3', { kind: 'metric', metric });
        const rows = explain(sample, findings, {}, 'q3', { kind: 'metric', metric }).rows.length;
        // Each number lists one row per seat, per person or per session; hours also list the duplicate.
        const marks = BY_SESSION.has(metric) ? s.sessions.size : BY_SEAT.has(metric) ? s.seats.size + (metric === 'participant_hours' ? 1 : 0) : s.people.size;
        expect([key, marks]).toEqual([key, rows]);
      }
    }
  });

  it('an age band lights only the people in it', () => {
    const s = sourcesFor(sample, st0, 'q3', { kind: 'age', band: '16-24' });
    expect(s.people.size).toBe(15);
    const age = new Map(sample.participants.map((p) => [p.id, p.age_range]));
    expect([...s.people.keys()].every((pid) => ['16-18', '19-24'].includes(age.get(pid)!))).toBe(true);
  });

  it('a goal counts from its own start, so G2 in August lights July too', () => {
    const s = sourcesFor(sample, st0, 'aug', { kind: 'goal', goalId: 'G2', part: 'value' });
    expect([...s.seats.keys()].some((k) => k.endsWith('2026-07-02'))).toBe(true);
  });
});

describe('the privacy cutoff', () => {
  const figures = (below: number, period = q3) => computePeriod(sample, applyAnswers(sample, findings, {}, below), findings, period);

  it('defaults to 5 and leaves the report as it was', () => {
    expect(figures(5).ageBreakdown.cells.map((c) => `${c.key}:${c.display}`)).toEqual(['10-12:11', '13-15:14', '16-24:15']);
  });

  it('at 10, hides counts under 10 and combines more age ranges', () => {
    const f = figures(10, PERIODS[2]);
    expect(peopleForFunder(6, 10)).toBe('<10');
    expect(f.metrics.new_participants.display).toBe('<10');
    expect(f.ageBreakdown.cells.every((c) => c.value === 0 || c.value >= 10)).toBe(true);
    expect(f.ageBreakdown.footnote).toBe('Age ranges are combined where one would show 1 to 9 people in this quarter or any month of it.');
  });

  it('withholds a people goal\'s status under the cutoff, with a note that names the cutoff', () => {
    const r = buildReport(sample, findings, {}, 'city-youth-grant', 'q3', 10);
    const goals = r.sections.find((s) => s.type === 'goals');
    expect(goals?.type === 'goals' && goals.goals.find((g) => g.id === 'G1')?.status).toBe('Not shown');
    const notes = r.sections.find((s) => s.type === 'notes');
    expect(notes?.type === 'notes' && notes.notes).toContain("Enroll 8 new participants: fewer than 10 so far, so its status and forecast aren't shown. Either one would say how many.");
  });

  it('never shows a band of 1 to cutoff-1 people, at any cutoff from 2 to 10, in any period', () => {
    for (let below = 2; below <= 10; below++) {
      for (const p of PERIODS) {
        const f = figures(below, p);
        expect(f.ageBreakdown.cells.every((c) => c.value === 0 || c.value >= below || c.display === `<${below}`), `${below} ${p.id}`).toBe(true);
      }
    }
  });

  it('combines bands with the same rule at any cutoff', () => {
    expect(combineBands(['a', 'b', 'c'], [[6, 7, 12]], 10)).toEqual([['a', 'b'], ['c']]);
    expect(combineBands(['a', 'b', 'c'], [[6, 7, 12]])).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('what a change moved', () => {
  it('lists the numbers an answer moves on the report on screen, with their old value', async () => {
    const { build, diffNumbers } = await import('../components/workspace/model');
    const snap = (answers: Answers) => ({ edits: {}, answers, smallBelow: 5 });
    const before = build(snap({}), 'q3', 'foundation-outcomes', {});
    const after = build(snap({ 'inactive-P02': 'left_program' }), 'q3', 'foundation-outcomes', {});
    const moved = diffNumbers(before.output, after.output);
    expect(moved.find((c) => c.key === 'metric:attendance_rate')).toMatchObject({ before: '76%', after: '77%' });
    expect(moved.find((c) => c.key === 'metric:retention_rate:coding-club')).toMatchObject({ before: '100%', after: 'Not shown' });
  });

  it('a session answered "ran" moves sessions delivered on the City template, and nothing on the Foundation one', async () => {
    const { build, diffNumbers } = await import('../components/workspace/model');
    const snap = (answers: Answers) => ({ edits: {}, answers, smallBelow: 5 });
    const ran = { 'gap-coding-club-2026-07-23': 'ran_not_recorded' as const };
    const city = diffNumbers(build(snap({}), 'q3', 'city-youth-grant', {}).output, build(snap(ran), 'q3', 'city-youth-grant', {}).output);
    expect(city).toEqual([{ key: 'metric:sessions_delivered', label: 'Sessions delivered', before: '42', after: '43' }]);
    const foundation = diffNumbers(build(snap({}), 'q3', 'foundation-outcomes', {}).output, build(snap(ran), 'q3', 'foundation-outcomes', {}).output);
    expect(foundation).toEqual([]);
  });

  it('times every stage of the rebuild', async () => {
    const { build } = await import('../components/workspace/model');
    const t = build({ edits: {}, answers: {}, smallBelow: 5 }, 'q3', 'city-youth-grant', {}).timings;
    for (const ms of Object.values(t)) expect(ms).toBeGreaterThanOrEqual(0);
  });
});
