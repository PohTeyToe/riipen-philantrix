// Reference figures. A small implementation of the metric definitions in
// BRIEF.md, written apart from the app so the two can be checked against
// each other. Writes data/figures.json. The app's golden test must match it.
// If they disagree, find which side breaks a definition and fix that side.
// Never edit figures.json by hand.
// Usage: node data/compute-reference.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));
const org = load('org.json');
const participants = load('participants.json');
const engagements = load('engagements.json');
const goals = load('goals.json');
const planted = load('planted.json');

const AS_OF = org.as_of;
const INACTIVE_DAYS = 30;
const ATT = 'Attendances';
const SUB = 'Assignment Submissions';

export const PERIODS = [
  { id: 'q3', label: 'Jul to Sep 2026', long: 'July to September 2026', short: 'Jul to Sep', start: '2026-07-01', end: '2026-09-30' },
  { id: 'jul', label: 'Jul 2026', long: 'July 2026', short: 'Jul', start: '2026-07-01', end: '2026-07-31' },
  { id: 'aug', label: 'Aug 2026', long: 'August 2026', short: 'Aug', start: '2026-08-01', end: '2026-08-31' },
  { id: 'sep', label: 'Sep 2026', long: 'September 2026', short: 'Sep', start: '2026-09-01', end: '2026-09-30' },
];

// Slot kinds: people (a count of people; 1 to 4 renders "fewer than 5"),
// count, hours, percent, decimal, text.
export const TEMPLATES = [
  {
    id: 'city-youth-grant',
    name: 'City youth grant (example): reach and attendance',
    sections: [
      { title: 'Reach', metrics: ['participants_served', 'new_participants'], breakdown: 'participants_by_age_range' },
      { title: 'Delivery', metrics: ['sessions_delivered', 'participant_hours'] },
      { title: 'Attendance', metrics: ['attendance_rate'], chart: 'attendance_rate_by_group' },
      { title: 'Goals', goals: ['G1', 'G2'] },
      { title: 'Summary', narrative: true },
      { title: 'Data notes', notes: true },
    ],
    slots: {
      period: { kind: 'text', meaning: 'The reporting period, written out, for example "July to September 2026".' },
      participants_served: { kind: 'people', meaning: 'Participants who attended at least one session in the period.' },
      new_participants: { kind: 'people', meaning: 'Participants whose join date falls inside the period.' },
      sessions_delivered: { kind: 'count', meaning: 'Group sessions that ran in the period.' },
      participant_hours: { kind: 'hours', meaning: 'Total hours participants spent in sessions they attended (each session counted at its length).' },
      attendance_rate: { kind: 'percent', meaning: 'Share of seats filled at sessions with attendance logged. Each enrolled group member is one seat at each of those sessions. Sessions that ran without attendance logged are left out.' },
      g1_value: { kind: 'people', meaning: 'New participants enrolled since the goal started (goal: "Enroll 8 new participants").' },
      g1_target: { kind: 'count', meaning: 'Target for the new participants goal.' },
      g2_value: { kind: 'hours', meaning: 'Participant hours since the goal started (goal: "Participant hours").' },
      g2_target: { kind: 'hours', meaning: 'Target for the participant hours goal.' },
    },
  },
  {
    id: 'foundation-outcomes',
    name: 'Foundation (example): outcomes and retention',
    sections: [
      { title: 'Retention', metrics: ['retention_rate'], chart: 'retention_by_group' },
      { title: 'Engagement', metrics: ['attendance_rate', 'assignment_submissions', 'submissions_per_participant'] },
      { title: 'Goals', goals: ['G2', 'G3', 'G4'] },
      { title: 'Summary', narrative: true },
      { title: 'Data notes', notes: true },
    ],
    slots: {
      period: { kind: 'text', meaning: 'The reporting period, written out, for example "July to September 2026".' },
      retention_rate: { kind: 'percent', meaning: 'Participants still enrolled on the last day of the period, as a share of everyone enrolled at any point in it.' },
      attendance_rate: { kind: 'percent', meaning: 'Share of seats filled at sessions with attendance logged. Each enrolled group member is one seat at each of those sessions.' },
      assignment_submissions: { kind: 'count', meaning: 'Assignments handed in during the period.' },
      submissions_per_participant: { kind: 'decimal', meaning: 'Assignments handed in per participant served.' },
      participants_served: { kind: 'people', meaning: 'Participants who attended at least one session in the period.' },
      g2_value: { kind: 'hours', meaning: 'Participant hours since the goal started (goal: "Participant hours").' },
      g2_target: { kind: 'hours', meaning: 'Target for the participant hours goal.' },
      g3_value: { kind: 'count', meaning: 'Assignment submissions since the goal started (goal: "Assignment submissions").' },
      g3_target: { kind: 'count', meaning: 'Target for the assignment submissions goal.' },
      g4_value: { kind: 'percent', meaning: 'Attendance rate since the goal started (goal: "Attendance rate of 80%").' },
      g4_target: { kind: 'percent', meaning: 'Target for the attendance rate goal.' },
    },
  },
];

// ---------- dates ----------
const DAY = 86400000;
const ms = (iso) => Date.parse(iso + 'T00:00:00Z');
const days = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => {
  const d = new Date(ms(iso));
  return `${WD[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const fmtShortDate = (iso) => {
  const d = new Date(ms(iso));
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// ---------- the one formatter ----------
// Exact half-up rounding of num/den for non-negative integers.
const halfUp = (num, den) => Math.floor((2 * num + den) / (2 * den));
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtCount = (n) => commas(n);
const fmtPeople = (n) => (n >= 1 && n <= 4 ? '<5' : commas(n)); // funder output
const fmtHalves = (halves) => commas(halfUp(halves, 2)); // hours held as half-hours
const fmtPercent = (num, den) => `${halfUp(100 * num, den)}%`;
const fmtDecimal1 = (num, den) => {
  const tenths = halfUp(10 * num, den);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};
const halves = (units) => Math.round(units * 2);

// ---------- findings (the data gaps check, as of the as-of date) ----------
const groupName = Object.fromEntries(org.groups.map((g) => [g.id, g.name]));
const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));

function lastActivity(pid) {
  let last = null;
  for (const e of engagements) if (e.participant_id === pid && e.date <= AS_OF && (last === null || e.date > last)) last = e.date;
  return last;
}

function detectFindings() {
  const out = [];
  const logged = new Set(engagements.filter((e) => e.activity_type === ATT).map((e) => `${e.group_id}|${e.date}`));
  for (const g of org.groups) {
    for (const d of g.scheduled_dates) {
      if (d <= AS_OF && !logged.has(`${g.id}|${d}`)) out.push({ id: `gap-${g.id}-${d}`, kind: 'session_not_logged', group_id: g.id, date: d, answerable: true });
    }
  }
  for (const p of participants) {
    if (p.exit_date !== null) continue;
    const last = lastActivity(p.id) ?? p.join_date;
    if (days(last, AS_OF) >= INACTIVE_DAYS) out.push({ id: `inactive-${p.id}`, kind: 'inactive_participant', participant_id: p.id, group_id: p.group_id, last_activity: last, days_inactive: days(last, AS_OF), answerable: true });
  }
  for (const g of goals) if (g.due_date === null) out.push({ id: `goal-no-due-${g.id}`, kind: 'goal_no_due_date', goal_id: g.id, answerable: false });
  const seen = new Map();
  for (const e of engagements) {
    if (e.activity_type !== ATT) continue;
    const k = `${e.participant_id}|${e.group_id}|${e.date}`;
    seen.set(k, [...(seen.get(k) ?? []), e.id]);
  }
  for (const [k, ids] of seen) {
    if (ids.length < 2) continue;
    const [pid, gid, d] = k.split('|');
    out.push({ id: `duplicate-${pid}-${d}`, kind: 'duplicate_record', participant_id: pid, group_id: gid, date: d, record_ids: ids, answerable: false });
  }
  return out;
}

// ---------- state: which findings are answered, and how ----------
function applyState(answers, findings) {
  const ran = new Set();
  const exitOverride = new Map();
  for (const f of findings) {
    const a = answers[f.id];
    if (f.kind === 'session_not_logged' && a === 'ran_not_recorded') ran.add(`${f.group_id}|${f.date}`);
    if (f.kind === 'inactive_participant' && a === 'left_program') exitOverride.set(f.participant_id, f.last_activity);
  }
  const people = participants.map((p) => (exitOverride.has(p.id) ? { ...p, exit_date: exitOverride.get(p.id) } : p));
  return { answers, ran, people };
}

// ---------- metrics over a date range ----------
function measure(start, end, st, groupId = null) {
  const inRange = (d) => d >= start && d <= end;
  const inGroup = (gid) => groupId === null || gid === groupId;
  const people = st.people.filter((p) => inGroup(p.group_id));
  const enrolledOn = (p, d) => p.join_date <= d && (p.exit_date === null || d <= p.exit_date);

  const att = new Map(); // participant|group|date -> units (duplicates count once)
  let rawAtt = 0;
  let submissions = 0;
  for (const e of engagements) {
    if (!inRange(e.date) || !inGroup(e.group_id)) continue;
    if (e.activity_type === ATT) {
      rawAtt++;
      att.set(`${e.participant_id}|${e.group_id}|${e.date}`, e.units);
    } else if (e.activity_type === SUB) {
      submissions++;
    }
  }
  const withRecords = new Set([...att.keys()].map((k) => k.split('|').slice(1).join('|')));
  const ranNoRecords = [...st.ran].filter((s) => {
    const [gid, d] = s.split('|');
    return inRange(d) && inGroup(gid) && !withRecords.has(s);
  });

  let offered = 0;
  for (const s of withRecords) {
    const [gid, d] = s.split('|');
    offered += people.filter((p) => p.group_id === gid && enrolledOn(p, d)).length;
  }
  let hoursHalves = 0;
  for (const u of att.values()) hoursHalves += halves(u);
  const served = new Set([...att.keys()].map((k) => k.split('|')[0]));
  const enrolledAny = people.filter((p) => p.join_date <= end && (p.exit_date === null || p.exit_date >= start));
  const retained = enrolledAny.filter((p) => enrolledOn(p, end));

  return {
    sessions_with_records: withRecords.size,
    sessions_ran_not_recorded: ranNoRecords.length,
    sessions_delivered: withRecords.size + ranNoRecords.length,
    offered,
    attended: att.size,
    attendance_records_raw: rawAtt,
    hours_halves: hoursHalves,
    served,
    new_participants: people.filter((p) => inRange(p.join_date)).length,
    enrolled_any: enrolledAny.length,
    retained: retained.length,
    submissions,
  };
}

function rateFigure(num, den, noSessionsText) {
  if (den === 0) return { numerator: 0, denominator: 0, value: null, display: noSessionsText };
  return { numerator: num, denominator: den, value: num / den, display: fmtPercent(num, den) };
}

// ---------- goals ----------
function goalFigure(goal, asOf, st) {
  const m = measure(goal.start_date, asOf, st);
  let value; let valueDisplay; let met; let forecastCmp = null; let forecastDisplay = null;
  const elapsed = days(goal.start_date, asOf) + 1;
  const window = goal.due_date ? days(goal.start_date, goal.due_date) + 1 : null;
  if (goal.metric === 'attendance_rate') {
    const pct = Math.round(goal.target * 100);
    value = m.offered ? m.attended / m.offered : null;
    valueDisplay = m.offered ? fmtPercent(m.attended, m.offered) : 'No sessions in this period';
    met = m.offered > 0 && m.attended * 100 >= pct * m.offered;
  } else {
    // Count goals, held as integers (hours as half-hours) so comparisons are exact.
    let n; let unitScale;
    if (goal.metric === 'participant_hours') { n = m.hours_halves; unitScale = 2; value = n / 2; valueDisplay = fmtHalves(n); }
    else if (goal.metric === 'new_participants') { n = m.new_participants; unitScale = 1; value = n; valueDisplay = fmtPeople(n); }
    else if (goal.metric === 'assignment_submissions') { n = m.submissions; unitScale = 1; value = n; valueDisplay = fmtCount(n); }
    else throw new Error(`unknown goal metric ${goal.metric}`);
    met = n >= goal.target * unitScale;
    if (window !== null) {
      forecastCmp = n * window >= goal.target * unitScale * elapsed; // forecast >= target
      forecastDisplay = commas(halfUp(n * window, unitScale * elapsed));
    }
  }
  let status;
  if (met) status = 'Met';
  else if (goal.due_date && goal.due_date < asOf) status = 'Past due';
  else if (!goal.due_date) status = 'No due date';
  else if (goal.metric === 'attendance_rate') throw new Error('rate goals with a due date have no forecast rule in the brief');
  else status = forecastCmp ? 'On track' : 'Behind';

  const showForecast = status === 'On track' || status === 'Behind';
  const targetDisplay = goal.metric === 'attendance_rate' ? `${Math.round(goal.target * 100)}%` : commas(goal.target);
  return {
    id: goal.id,
    name: goal.name,
    metric: goal.metric,
    as_of: asOf,
    value,
    display: valueDisplay,
    target: goal.target,
    target_display: targetDisplay,
    due_date: goal.due_date,
    status,
    elapsed_days: elapsed,
    window_days: window,
    forecast: showForecast && window ? (goal.metric === 'participant_hours' ? (m.hours_halves / 2) * window / elapsed : value * window / elapsed) : null,
    forecast_display: showForecast ? forecastDisplay : null,
    forecast_line: showForecast ? `Forecast by ${fmtShortDate(goal.due_date)}: ${forecastDisplay} of ${targetDisplay}` : null,
  };
}

// ---------- suppression of the age breakdown ----------
function ageBreakdown(served, st) {
  const byId = Object.fromEntries(st.people.map((p) => [p.id, p]));
  const cells = org.age_ranges.map((r) => ({ age_range: r, value: [...served].filter((pid) => byId[pid].age_range === r).length, display: null, hidden: null }));
  for (const c of cells) if (c.value >= 1 && c.value <= 4) { c.hidden = 'small'; c.display = '<5'; }
  let footnote = null;
  if (cells.filter((c) => c.hidden).length === 1) {
    // Next smallest visible cell; a tie goes to the first in display order.
    let next = null;
    for (const c of cells) if (!c.hidden && (next === null || c.value < next.value)) next = c;
    if (next) { next.hidden = 'secondary'; next.display = 'hidden'; footnote = "Hidden so a small group can't be worked out from the total."; }
  }
  for (const c of cells) if (!c.hidden) c.display = commas(c.value);
  return { total: { value: served.size, display: fmtPeople(served.size) }, cells, footnote };
}

// ---------- data notes ----------
function dataNotes(period, st, findings) {
  const inP = (d) => d >= period.start && d <= period.end;
  const both = TEMPLATES.map((t) => t.id);
  const notes = [];
  for (const f of findings) {
    const a = st.answers[f.id];
    if (f.kind === 'session_not_logged' && inP(f.date)) {
      if (a === 'ran_not_recorded') notes.push({ finding_id: f.id, kind: 'session_ran_not_recorded', templates: both, text: `${groupName[f.group_id]}, ${fmtDay(f.date)}: ran, but attendance wasn't recorded. Counted as delivered and left out of the attendance rate.` });
      else if (!a) notes.push({ finding_id: f.id, kind: f.kind, templates: both, text: `${groupName[f.group_id]}, ${fmtDay(f.date)}: on the schedule, but no attendance was logged. Not counted as delivered.` });
    }
    if (f.kind === 'inactive_participant' && !a && f.last_activity < period.end) {
      notes.push({ finding_id: f.id, kind: f.kind, templates: both, text: `A ${groupName[f.group_id]} participant has had no activity since ${fmtShortDate(f.last_activity)} and has no exit date. Counted as enrolled.` });
    }
    if (f.kind === 'duplicate_record' && inP(f.date)) {
      notes.push({ finding_id: f.id, kind: f.kind, templates: both, text: `${groupName[f.group_id]}, ${fmtDay(f.date)}: one participant was logged twice. Counted once.` });
    }
    if (f.kind === 'goal_no_due_date') {
      const shownIn = TEMPLATES.filter((t) => t.sections.some((s) => s.goals?.includes(f.goal_id))).map((t) => t.id);
      notes.push({ finding_id: f.id, kind: f.kind, templates: shownIn, text: `${goalById[f.goal_id].name} has no due date, so it shows progress without a forecast.` });
    }
  }
  return notes;
}

// ---------- one period, one state ----------
function compute(period, st, findings) {
  const m = measure(period.start, period.end, st);
  const metrics = {
    participants_served: { value: m.served.size, display: fmtPeople(m.served.size) },
    new_participants: { value: m.new_participants, display: fmtPeople(m.new_participants) },
    sessions_delivered: { value: m.sessions_delivered, display: fmtCount(m.sessions_delivered), with_records: m.sessions_with_records, ran_not_recorded: m.sessions_ran_not_recorded },
    participant_hours: { value: m.hours_halves / 2, display: fmtHalves(m.hours_halves) },
    attendance_rate: { attended: m.attended, offered: m.offered, ...rateFigure(m.attended, m.offered, 'No sessions in this period') },
    retention_rate: { retained: m.retained, enrolled: m.enrolled_any, ...rateFigure(m.retained, m.enrolled_any, 'No participants in this period') },
    assignment_submissions: { value: m.submissions, display: fmtCount(m.submissions) },
    submissions_per_participant: m.served.size
      ? { submissions: m.submissions, served: m.served.size, value: m.submissions / m.served.size, display: fmtDecimal1(m.submissions, m.served.size) }
      : { submissions: m.submissions, served: 0, value: null, display: 'No participants served' },
  };
  const byGroup = org.groups.map((g) => ({ g, gm: measure(period.start, period.end, st, g.id) }));
  return {
    metrics,
    attendance_rate_by_group: byGroup.map(({ g, gm }) => ({ group_id: g.id, attended: gm.attended, offered: gm.offered, ...rateFigure(gm.attended, gm.offered, `No sessions in ${period.short}`) })),
    retention_by_group: byGroup.map(({ g, gm }) => ({ group_id: g.id, retained: gm.retained, enrolled: gm.enrolled_any, ...rateFigure(gm.retained, gm.enrolled_any, `No participants in ${period.short}`) })),
    participants_by_age_range: ageBreakdown(m.served, st),
    goals: goals.map((g) => goalFigure(g, period.end, st)),
    data_notes: dataNotes(period, st, findings),
    raw: { attendance_records: m.attendance_records_raw, attended_after_dedupe: m.attended },
  };
}

// ---------- narrative slots ----------
function renderSlot(kind, fig, period) {
  if (kind === 'text') return period.long;
  if (fig.value === null) return fig.display;
  switch (kind) {
    case 'people': return fig.value >= 1 && fig.value <= 4 ? 'fewer than 5' : commas(fig.value);
    case 'count': return commas(fig.value);
    case 'hours': return commas(halfUp(halves(fig.value), 2));
    case 'percent': return fig.display;
    case 'decimal': return fig.display;
    default: throw new Error(`unknown slot kind ${kind}`);
  }
}

function slotFigure(slot, r) {
  const g = slot.match(/^g(\d)_(value|target)$/);
  if (g) {
    const goal = r.goals.find((x) => x.id === `G${g[1]}`);
    if (g[2] === 'value') return { value: goal.value, display: goal.display };
    return { value: goal.target, display: goal.target_display };
  }
  return r.metrics[slot];
}

// ---------- spec checks on the planted cases ----------
function checkSpec(findings, results) {
  const errs = [];
  const want = new Set(planted.findings.map((f) => f.id));
  const got = new Set(findings.map((f) => f.id));
  if ([...want].sort().join() !== [...got].sort().join()) errs.push(`findings differ from planted.json: got ${[...got].join(', ')}`);
  if (findings.filter((f) => f.answerable).length !== 5) errs.push('expected 5 findings to answer');
  const q0 = results.q3.none_answered; const q1 = results.q3.all_answered;
  const rate = q0.metrics.attendance_rate.value;
  if (!(rate >= 0.75 && rate <= 0.85)) errs.push(`Jul to Sep attendance rate ${rate}`);
  if (q1.metrics.sessions_delivered.value - q0.metrics.sessions_delivered.value !== 3) errs.push('answering 3 sessions should add 3 delivered sessions');
  if (!(q1.metrics.retention_rate.value < q0.metrics.retention_rate.value)) errs.push('answering Left the program should lower retention');
  if (q0.metrics.new_participants.value !== 6) errs.push('expected 6 new participants');
  if (q0.raw.attendance_records - q0.raw.attended_after_dedupe !== 1) errs.push('expected exactly 1 duplicate attendance record');
  for (const [st, r] of [['none', q0], ['all', q1]]) {
    const s = Object.fromEntries(r.goals.map((g) => [g.id, g]));
    if (s.G1.status !== 'Past due' || s.G1.value !== 6) errs.push(`${st}: G1 ${s.G1.status} ${s.G1.value}`);
    if (s.G2.status !== 'On track' || !(s.G2.forecast / s.G2.target >= 1.05 && s.G2.forecast / s.G2.target <= 1.1)) errs.push(`${st}: G2 ${s.G2.status} ${s.G2.forecast}`);
    if (s.G3.status !== 'Behind' || !(s.G3.forecast / s.G3.target >= 0.83 && s.G3.forecast / s.G3.target <= 0.87)) errs.push(`${st}: G3 ${s.G3.status} ${s.G3.forecast}`);
    if (s.G4.status !== 'No due date') errs.push(`${st}: G4 ${s.G4.status}`);
    const small = r.participants_by_age_range.cells.filter((c) => c.hidden === 'small');
    if (small.length !== 1 || small[0].age_range !== '19-24') errs.push(`${st}: age suppression should fire once, on 19-24`);
    if (!r.participants_by_age_range.cells.some((c) => c.hidden === 'secondary')) errs.push(`${st}: secondary suppression should fire`);
  }
  const wlAug = results.aug.none_answered.attendance_rate_by_group.find((g) => g.group_id === 'weekend-leaders');
  if (wlAug.value !== null || wlAug.display !== 'No sessions in Aug') errs.push('Weekend Leaders should show No sessions in Aug');
  const names = participants.map((p) => p.display_name);
  const funderText = JSON.stringify(results);
  for (const n of names) if (funderText.includes(n)) errs.push(`participant name in figures: ${n}`);
  return errs;
}

// ---------- main ----------
const findings = detectFindings();
const STATES = { none_answered: {}, all_answered: planted.answers_for_all_answered_state };
const results = {};
for (const p of PERIODS) {
  results[p.id] = {};
  for (const [sid, answers] of Object.entries(STATES)) results[p.id][sid] = compute(p, applyState(answers, findings), findings);
}
const narrativeSlots = {};
for (const t of TEMPLATES) {
  narrativeSlots[t.id] = {};
  for (const p of PERIODS) {
    narrativeSlots[t.id][p.id] = {};
    for (const sid of Object.keys(STATES)) {
      const r = results[p.id][sid];
      narrativeSlots[t.id][p.id][sid] = Object.fromEntries(Object.entries(t.slots).map(([slot, def]) => [slot, renderSlot(def.kind, def.kind === 'text' ? null : slotFigure(slot, r), p)]));
    }
  }
}

const errs = checkSpec(findings, results);
if (errs.length) {
  console.error('Spec checks failed:\n- ' + errs.join('\n- '));
  process.exit(1);
}

const out = {
  note: 'Reference figures for the sample data, generated by data/compute-reference.mjs from the metric definitions in the demo brief. Do not edit by hand.',
  mock: true,
  org: org.display_name,
  as_of: AS_OF,
  periods: PERIODS,
  states: STATES,
  findings,
  templates: TEMPLATES,
  results,
  narrative_slots: narrativeSlots,
};
writeFileSync(join(HERE, 'figures.json'), JSON.stringify(out, null, 2) + '\n');

const q = results.q3;
console.log('figures.json written. Jul to Sep, none answered vs all answered:');
for (const k of Object.keys(q.none_answered.metrics)) console.log(`  ${k}: ${q.none_answered.metrics[k].display} | ${q.all_answered.metrics[k].display}`);
console.log('  goals:', q.none_answered.goals.map((g) => `${g.id} ${g.display}/${g.target_display} ${g.status}${g.forecast_line ? ' (' + g.forecast_line + ')' : ''}`).join('; '));
console.log('  age:', q.none_answered.participants_by_age_range.cells.map((c) => `${c.age_range}=${c.value}->${c.display}`).join(', '));
console.log('  attendance by group:', q.none_answered.attendance_rate_by_group.map((g) => `${g.group_id} ${g.display}`).join(', '));
console.log('  retention by group:', q.none_answered.retention_by_group.map((g) => `${g.group_id} ${g.display}`).join(', '));
