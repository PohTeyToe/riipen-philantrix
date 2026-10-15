// Generates the sample org's quarter of records. Every row is made up and
// carries mock: true. Fixed seed, so a rerun writes the same bytes.
// Usage: node data/generate.mjs
// The planted cases are listed in data/SOURCES.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const SEED = 20261020;
const HERE = dirname(fileURLToPath(import.meta.url));

const AS_OF = '2026-09-30';
const PERIOD = { start: '2026-07-01', end: '2026-09-30' };
const WORKSTREAM = { id: 'youth-mentorship-2026', name: 'Youth Mentorship 2026', mock: true };

// Name chosen after the CRA and web check in name-check.json.
const ORG_NAME = 'Kestrel Lane Youth Mentorship';

const GROUPS = [
  {
    id: 'coding-club', name: 'Coding Club', weekdays: ['Tue', 'Thu'], hours: 1.5,
    label: 'Tue and Thu, 1.5 hours', breaks: [],
    attend: 0.8, submit: 0.7, submitDays: ['Thu'], // weekly assignment, handed in on Thursdays
  },
  {
    id: 'mentor-circle', name: 'Mentor Circle', weekdays: ['Mon'], hours: 1,
    label: 'Mon, 1 hour',
    breaks: [
      { from: '2026-08-03', to: '2026-08-03', reason: 'Civic Holiday' },
      { from: '2026-09-07', to: '2026-09-07', reason: 'Labour Day' },
    ],
    attend: 0.72, submit: 0.45, submitDays: ['Mon'],
  },
  {
    id: 'weekend-leaders', name: 'Weekend Leaders', weekdays: ['Sat'], hours: 2,
    label: 'Sat, 2 hours, July and September',
    breaks: [{ from: '2026-08-01', to: '2026-08-31', reason: 'Summer break' }],
    attend: 0.76, submit: 0.5, submitDays: ['Sat'],
  },
];

// Planted sessions with no records at all (data/SOURCES.md, planted cases).
const GAP_SESSIONS = [
  { group_id: 'coding-club', date: '2026-07-23' },
  { group_id: 'mentor-circle', date: '2026-09-14' },
  { group_id: 'weekend-leaders', date: '2026-09-19' },
];
const DUPLICATE = { group_id: 'coding-club', date: '2026-07-16' };

// Roster: [group, age range, role]. Roles are the planted cases.
const ROSTER = [
  ...rep('coding-club', '13-15', 'regular', 5),
  ['coding-club', '13-15', 'inactive_2026-08-20'],
  ['coding-club', '13-15', 'joins_aug'],
  ['coding-club', '13-15', 'joins_aug'],
  ['coding-club', '13-15', 'duplicate'],
  ...rep('coding-club', '16-18', 'regular', 4),
  ['coding-club', '16-18', 'inactive_2026-08-25'],
  ['coding-club', '10-12', 'regular'],
  ['coding-club', '10-12', 'joins_aug'],
  ...rep('mentor-circle', '10-12', 'regular', 7),
  ...rep('mentor-circle', '10-12', 'joins_aug', 2),
  ...rep('mentor-circle', '13-15', 'regular', 3),
  ['mentor-circle', '13-15', 'exit_2026-07-31'],
  ...rep('weekend-leaders', '16-18', 'regular', 5),
  ['weekend-leaders', '16-18', 'joins_aug'],
  ['weekend-leaders', '16-18', 'exit_2026-09-12'],
  ...rep('weekend-leaders', '19-24', 'regular', 3),
  ['weekend-leaders', '13-15', 'regular'],
];

function rep(group, age, role, n) {
  return Array.from({ length: n }, () => [group, age, role]);
}

// ---------- dates ----------
const DAY = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMs = (iso) => Date.parse(iso + 'T00:00:00Z');
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => toIso(toMs(iso) + n * DAY);
const weekday = (iso) => WEEKDAYS[new Date(toMs(iso)).getUTCDay()];
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);

function scheduledDates(group) {
  const out = [];
  for (let d = PERIOD.start; d <= PERIOD.end; d = addDays(d, 1)) {
    if (!group.weekdays.includes(weekday(d))) continue;
    if (group.breaks.some((b) => d >= b.from && d <= b.to)) continue;
    out.push(d);
  }
  return out;
}

// ---------- seeded random ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function build(seed = SEED) {
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const names = JSON.parse(readFileSync(join(HERE, 'names-common.json'), 'utf8'));

  const groups = GROUPS.map((g) => ({ ...g, dates: scheduledDates(g) }));
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const isGap = (gid, d) => GAP_SESSIONS.some((s) => s.group_id === gid && s.date === d);

  // ----- participants -----
  const used = new Set();
  const people = ROSTER.map(([group_id, age_range, role], i) => {
    let display_name;
    const list = i % 2 === 0 ? 'female' : 'male';
    do {
      const first = pick(names[list]);
      const initial = pick('ABCDEFGHJKLMNPRSTW'.split(''));
      display_name = `${first} ${initial}.`;
    } while (used.has(display_name));
    used.add(display_name);

    let join_date;
    if (role === 'joins_aug') {
      join_date = addDays('2026-08-03', Math.floor(rand() * 22)); // Aug 3 to Aug 24
    } else {
      join_date = addDays('2025-09-08', Math.floor(rand() * 290)); // Sep 2025 to Jun 2026
    }
    let exit_date = null;
    let last_active = null;
    if (role.startsWith('exit_')) exit_date = role.slice(5);
    if (role.startsWith('inactive_')) last_active = role.slice(9);

    const g = groupById[group_id];
    return {
      group_id, age_range, role, display_name, list, join_date, exit_date, last_active,
      attend: Math.min(0.97, Math.max(0.5, g.attend + between(-0.12, 0.12))),
      submit: Math.min(0.95, Math.max(0.2, g.submit + between(-0.15, 0.15))),
    };
  });

  // Stable ids that don't reveal roles: group order, then the name first drawn.
  const groupOrder = (gid) => GROUPS.findIndex((g) => g.id === gid);
  people.sort((a, b) => groupOrder(a.group_id) - groupOrder(b.group_id) || a.display_name.localeCompare(b.display_name));
  people.forEach((p, i) => { p.id = `P${String(i + 1).padStart(2, '0')}`; });

  // One first name per person, so the staff view never lists three Victorias.
  // A repeat takes the most common name nobody has yet, from the same list.
  // It runs after the ids and draws nothing random, so every record stays the same.
  const taken = new Set();
  for (const p of people) {
    const [first, initial] = p.display_name.split(' ');
    if (!taken.has(first)) { taken.add(first); continue; }
    const next = names[p.list].find((n) => !taken.has(n) && !people.some((q) => q.display_name.split(' ')[0] === n));
    taken.add(next);
    p.display_name = `${next} ${initial}`;
  }

  const enrolled = (p, d) => p.join_date <= d && (p.exit_date === null || d <= p.exit_date);

  // ----- attendance -----
  const att = []; // { date, group_id, participant_id }
  for (const g of groups) {
    for (const d of g.dates) {
      if (isGap(g.id, d)) continue;
      for (const p of people.filter((q) => q.group_id === g.id && enrolled(q, d))) {
        if (p.last_active && d > p.last_active) continue;
        const forced =
          d === p.last_active ||
          (p.exit_date && d === lastSessionOnOrBefore(g, p.exit_date)) ||
          (p.role === 'duplicate' && d === DUPLICATE.date);
        if (forced || rand() < p.attend) att.push({ date: d, group_id: g.id, participant_id: p.id });
      }
    }
  }

  // Everyone without an exit date or planted inactivity is active in September.
  for (const p of people) {
    if (p.exit_date || p.last_active) continue;
    const g = groupById[p.group_id];
    const sep = g.dates.filter((d) => d >= '2026-09-01' && !isGap(g.id, d) && enrolled(p, d));
    if (!att.some((r) => r.participant_id === p.id && r.date >= '2026-09-01')) {
      att.push({ date: pick(sep), group_id: g.id, participant_id: p.id });
    }
  }

  // Every session that ran has at least one record.
  for (const g of groups) {
    for (const d of g.dates) {
      if (isGap(g.id, d)) continue;
      if (!att.some((r) => r.group_id === g.id && r.date === d)) {
        const roster = people.filter((q) => q.group_id === g.id && enrolled(q, d) && !(q.last_active && d > q.last_active));
        att.push({ date: d, group_id: g.id, participant_id: pick(roster).id });
      }
    }
  }

  // ----- submissions: only from people who attended, on the group's hand-in days -----
  const subs = [];
  for (const r of att) {
    const g = groupById[r.group_id];
    if (!g.submitDays.includes(weekday(r.date))) continue;
    const p = people.find((q) => q.id === r.participant_id);
    if (rand() < p.submit) subs.push({ ...r });
  }

  // ----- engagement rows -----
  const rows = [
    ...att.map((r) => ({ ...r, activity_type: 'Attendances', units: groupById[r.group_id].hours })),
    ...subs.map((r) => ({ ...r, activity_type: 'Assignment Submissions', units: 1 })),
  ];
  const dupPerson = people.find((p) => p.role === 'duplicate');
  rows.push({ ...DUPLICATE, participant_id: dupPerson.id, activity_type: 'Attendances', units: groupById[DUPLICATE.group_id].hours });
  const typeOrder = (t) => (t === 'Attendances' ? 0 : 1);
  rows.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    groupOrder(a.group_id) - groupOrder(b.group_id) ||
    typeOrder(a.activity_type) - typeOrder(b.activity_type) ||
    a.participant_id.localeCompare(b.participant_id));
  const engagements = rows.map((r, i) => ({
    id: `E${String(i + 1).padStart(4, '0')}`,
    date: r.date,
    group_id: r.group_id,
    participant_id: r.participant_id,
    activity_type: r.activity_type,
    units: r.units,
    mock: true,
  }));

  // ----- goal targets from the generated quarter -----
  const seen = new Set();
  let hours = 0;
  for (const e of engagements) {
    if (e.activity_type !== 'Attendances') continue;
    const k = `${e.participant_id}|${e.group_id}|${e.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    hours += e.units;
  }
  const submissions = engagements.filter((e) => e.activity_type === 'Assignment Submissions').length;
  const window = daysBetween('2026-07-01', '2026-12-18') + 1;
  const elapsed = daysBetween('2026-07-01', AS_OF) + 1;
  const hoursForecast = (hours * window) / elapsed;
  const subsForecast = (submissions * window) / elapsed;
  const g2Target = niceTarget(hoursForecast, 50, 1.05, 1.1, 1.075);
  const g3Target = niceTarget(subsForecast, 10, 0.83, 0.87, 0.85);

  const goals = [
    { id: 'G1', name: 'Enroll 8 new participants', metric: 'new_participants', unit: 'count', target: 8, start_date: '2026-07-01', due_date: '2026-08-31' },
    { id: 'G2', name: 'Participant hours', metric: 'participant_hours', unit: 'hours', target: g2Target, start_date: '2026-07-01', due_date: '2026-12-18' },
    { id: 'G3', name: 'Assignment submissions', metric: 'assignment_submissions', unit: 'count', target: g3Target, start_date: '2026-07-01', due_date: '2026-12-18' },
    { id: 'G4', name: 'Attendance rate of 80%', metric: 'attendance_rate', unit: 'rate', target: 0.8, start_date: '2026-07-01', due_date: null },
  ].map((g) => ({ ...g, workstream_id: WORKSTREAM.id, mock: true }));

  // ----- outputs -----
  const org = {
    mock: true,
    sample_label: 'Sample data. Fictional organization and records.',
    id: 'kestrel-lane',
    name: ORG_NAME,
    display_name: `${ORG_NAME} (sample)`,
    as_of: AS_OF,
    period: PERIOD,
    activity_types: [
      { name: 'Attendances', units: 'Session hours' },
      { name: 'Assignment Submissions', units: '1 per submission' },
    ],
    age_ranges: ['10-12', '13-15', '16-18', '19-24'],
    workstreams: [WORKSTREAM],
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      workstream_id: WORKSTREAM.id,
      schedule: { weekdays: g.weekdays, hours: g.hours, from: PERIOD.start, to: PERIOD.end, breaks: g.breaks },
      schedule_label: g.label,
      scheduled_dates: g.dates,
      mock: true,
    })),
  };

  const participants = people.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    group_id: p.group_id,
    age_range: p.age_range,
    join_date: p.join_date,
    exit_date: p.exit_date,
    mock: true,
  }));

  const dupRows = engagements.filter((e) => e.participant_id === dupPerson.id && e.date === DUPLICATE.date && e.activity_type === 'Attendances');
  const lastActivity = (pid) => engagements.filter((e) => e.participant_id === pid).map((e) => e.date).sort().at(-1);
  const inactive = people.filter((p) => p.last_active);
  const planted = {
    mock: true,
    note: 'Cases planted on purpose so tests and copy can point at them. Listed in data/SOURCES.md.',
    as_of: AS_OF,
    inactive_after_days: 30,
    findings: [
      ...GAP_SESSIONS.map((s) => ({
        id: `gap-${s.group_id}-${s.date}`,
        kind: 'session_not_logged',
        group_id: s.group_id,
        date: s.date,
        question: 'Did this session run?',
        answers: [
          { id: 'didnt_run', label: "Didn't run" },
          { id: 'ran_not_recorded', label: 'Ran, attendance not recorded' },
        ],
      })),
      ...inactive.map((p) => ({
        id: `inactive-${p.id}`,
        kind: 'inactive_participant',
        participant_id: p.id,
        group_id: p.group_id,
        last_activity: lastActivity(p.id),
        days_inactive: daysBetween(lastActivity(p.id), AS_OF),
        question: 'Is this participant still enrolled?',
        answers: [
          { id: 'still_enrolled', label: 'Still enrolled' },
          { id: 'left_program', label: 'Left the program' },
        ],
      })),
      {
        id: 'goal-no-due-G4',
        kind: 'goal_no_due_date',
        goal_id: 'G4',
        question: null,
        answers: [],
        message: 'Progress shows without a forecast.',
      },
      {
        id: `duplicate-${dupPerson.id}-${DUPLICATE.date}`,
        kind: 'duplicate_record',
        participant_id: dupPerson.id,
        group_id: DUPLICATE.group_id,
        date: DUPLICATE.date,
        record_ids: dupRows.map((e) => e.id),
        question: null,
        answers: [],
        message: 'The record counts once.',
      },
    ],
    exits: people.filter((p) => p.exit_date).map((p) => ({ participant_id: p.id, group_id: p.group_id, exit_date: p.exit_date, last_activity: lastActivity(p.id) })),
    august_joiners: people.filter((p) => p.role === 'joins_aug').map((p) => ({ participant_id: p.id, group_id: p.group_id, join_date: p.join_date })),
    no_sessions: [{ group_id: 'weekend-leaders', month: '2026-08', reason: 'Summer break' }],
    age_suppression: { period: '2026-07-01 to 2026-09-30', breakdown: 'participants served by age range', small_cell: '19-24' },
    goals_expected_at_as_of: { G1: 'Past due', G2: 'On track', G3: 'Behind', G4: 'No due date' },
    answers_for_all_answered_state: {
      ...Object.fromEntries(GAP_SESSIONS.map((s) => [`gap-${s.group_id}-${s.date}`, 'ran_not_recorded'])),
      ...Object.fromEntries(inactive.map((p) => [`inactive-${p.id}`, 'left_program'])),
    },
  };

  const { problems, rates } = selfCheck({ people, engagements, groups });
  if (g2Target === null || g3Target === null) problems.push('no round goal target fits the forecast band');

  // ----- confidence: a custom field at intake, then a check-in each month -----
  // A second random stream, so adding this left every record above unchanged.
  // Three people who attended every month never fill in a check-in, chosen
  // with a third stream, so the other check-ins keep their scores.
  const everyMonth = people.filter((p) => ['2026-07', '2026-08', '2026-09'].every((m) => att.some((r) => r.participant_id === p.id && r.date.startsWith(m))));
  const third = mulberry32(seed + 2);
  const noCheckins = new Set();
  while (noCheckins.size < 3) noCheckins.add(everyMonth[Math.floor(third() * everyMonth.length)].id);
  const { intake, checkins } = confidence(mulberry32(seed + 1), people, att, noCheckins);
  planted.no_checkins = [...noCheckins].sort();
  for (const p of participants) p.confidence_intake = intake.get(p.id);
  // Keep mock last on each row.
  for (const p of participants) { delete p.mock; p.mock = true; }

  return { org, participants, engagements, checkins, goals, planted, problems, stats: { hours, submissions, hoursForecast, subsForecast, g2Target, g3Target, rates } };
}

// Intake score on joining. Then, in each month a participant attended, a
// check-in at their last session of the month, a step or two from the last score.
function confidence(rand, people, att, skip) {
  const draw = (pairs) => {
    let r = rand();
    for (const [v, p] of pairs) { if (r < p) return v; r -= p; }
    return pairs.at(-1)[0];
  };
  const intake = new Map();
  const rows = [];
  for (const p of people) {
    const start = draw([[1, 0.15], [2, 0.4], [3, 0.35], [4, 0.1]]);
    intake.set(p.id, start);
    let score = start;
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      const days = [...new Set(att.filter((r) => r.participant_id === p.id && r.date.startsWith(month)).map((r) => r.date))].sort();
      if (!days.length) continue;
      score = Math.min(5, Math.max(1, score + draw([[-1, 0.12], [0, 0.43], [1, 0.38], [2, 0.07]])));
      if (skip.has(p.id)) continue; // their score still moves, so the draws stay in step
      rows.push({ date: days.at(-1), participant_id: p.id, group_id: p.group_id, field: 'Confidence (1 to 5)', confidence: score });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.participant_id.localeCompare(b.participant_id));
  return { intake, checkins: rows.map((r, i) => ({ id: `C${String(i + 1).padStart(3, '0')}`, ...r, mock: true })) };
}

function lastSessionOnOrBefore(group, date) {
  return group.dates.filter((d) => d <= date).at(-1);
}

function niceTarget(forecast, step, lo, hi, ideal) {
  let best = null;
  for (let t = step; t <= forecast * 2; t += step) {
    const ratio = forecast / t;
    if (ratio < lo || ratio > hi) continue;
    if (best === null || Math.abs(ratio - ideal) < Math.abs(forecast / best - ideal)) best = t;
  }
  return best;
}

// The generator's own guard rails. compute-reference.mjs checks the full spec.
function selfCheck({ people, engagements, groups }) {
  const problems = [];
  const rate = (answered) => {
    const exitOf = (p) => (answered && p.last_active ? p.last_active : p.exit_date);
    const att = new Set();
    const sessions = new Set();
    for (const e of engagements) {
      if (e.activity_type !== 'Attendances') continue;
      att.add(`${e.participant_id}|${e.group_id}|${e.date}`);
      sessions.add(`${e.group_id}|${e.date}`);
    }
    let offered = 0;
    for (const s of sessions) {
      const [gid, d] = s.split('|');
      offered += people.filter((p) => p.group_id === gid && p.join_date <= d && (exitOf(p) === null || d <= exitOf(p))).length;
    }
    return att.size / offered;
  };
  const r0 = rate(false);
  const r1 = rate(true);
  if (r0 < 0.75 || r0 > 0.85) problems.push(`overall attendance rate ${r0.toFixed(4)} outside 75% to 85%`);
  if (r0 >= 0.795 || r1 >= 0.795) problems.push(`attendance rate must stay under 80% in both states (G4 shows No due date): ${r0.toFixed(4)}, ${r1.toFixed(4)}`);
  for (const g of groups) {
    const s = new Set(engagements.filter((e) => e.group_id === g.id && e.activity_type === 'Attendances').map((e) => e.date));
    const missing = g.dates.filter((d) => !s.has(d));
    const expected = GAP_SESSIONS.filter((x) => x.group_id === g.id).map((x) => x.date);
    if (missing.join() !== expected.join()) problems.push(`${g.id}: sessions without records ${missing.join()} (expected ${expected.join()})`);
  }
  return { problems, rates: [r0, r1] };
}

function writeRows(path, rows) {
  writeFileSync(path, '[\n' + rows.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const out = build();
  if (out.problems.length) {
    console.error('Generator checks failed:\n- ' + out.problems.join('\n- '));
    process.exit(1);
  }
  writeFileSync(join(HERE, 'org.json'), JSON.stringify(out.org, null, 2) + '\n');
  writeRows(join(HERE, 'participants.json'), out.participants);
  writeRows(join(HERE, 'engagements.json'), out.engagements);
  writeRows(join(HERE, 'checkins.json'), out.checkins);
  writeRows(join(HERE, 'goals.json'), out.goals);
  writeFileSync(join(HERE, 'planted.json'), JSON.stringify(out.planted, null, 2) + '\n');
  console.log(`Wrote ${out.participants.length} participants, ${out.engagements.length} records, ${out.checkins.length} check-ins, ${out.goals.length} goals.`);
}
