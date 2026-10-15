// Reference figures. A small implementation of the metric definitions,
// written apart from the app so the two can be checked against each other.
// Writes data/figures.json, and the app's golden test must match it.
// tests/reference.test.ts also runs it on changed copies of the data.
// If they disagree, find which side breaks a definition and fix that side.
// Never edit figures.json by hand.
// Usage: node data/compute-reference.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INACTIVE_DAYS = 30;
const ATT = 'Attendances';
const SUB = 'Assignment Submissions';

export const PERIODS = [
  { id: 'q3', label: 'Jul to Sep 2026', long: 'July to September 2026', short: 'Jul to Sep', start: '2026-07-01', end: '2026-09-30' },
  { id: 'jul', label: 'Jul 2026', long: 'July 2026', short: 'Jul', start: '2026-07-01', end: '2026-07-31' },
  { id: 'aug', label: 'Aug 2026', long: 'August 2026', short: 'Aug', start: '2026-08-01', end: '2026-08-31' },
  { id: 'sep', label: 'Sep 2026', long: 'September 2026', short: 'Sep', start: '2026-09-01', end: '2026-09-30' },
];

const statusMeaning = (goal) =>
  `Status of the ${goal} goal, as words that finish "the goal is": met, on track, behind or past due. The engine fills it in.`;

// Slot kinds: people (a count of people; 1 to 4 renders "fewer than 5"),
// count, hours, percent, decimal, status (a goal status in words), text.
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
      g1_status: { kind: 'status', meaning: statusMeaning('new participants') },
      g2_value: { kind: 'hours', meaning: 'Participant hours since the goal started (goal: "Participant hours").' },
      g2_target: { kind: 'hours', meaning: 'Target for the participant hours goal.' },
      g2_status: { kind: 'status', meaning: statusMeaning('participant hours') },
    },
  },
  {
    id: 'foundation-outcomes',
    name: 'Foundation (example): outcomes and retention',
    sections: [
      { title: 'Outcomes', metrics: ['confidence_improved', 'participants_checked_in'] },
      { title: 'Retention', metrics: ['retention_rate'], chart: 'retention_by_group' },
      { title: 'Engagement', metrics: ['attendance_rate', 'assignment_submissions', 'submissions_per_participant'] },
      { title: 'Goals', goals: ['G2', 'G3', 'G4'] },
      { title: 'Summary', narrative: true },
      { title: 'Data notes', notes: true },
    ],
    slots: {
      period: { kind: 'text', meaning: 'The reporting period, written out, for example "July to September 2026".' },
      confidence_improved: { kind: 'percent', meaning: 'Share of participants with a check-in during the period whose confidence score (1 to 5) went up between intake and their latest check-in.' },
      participants_checked_in: { kind: 'people', meaning: 'Participants who rated their confidence at intake and at a check-in during the period.' },
      retention_rate: { kind: 'percent', meaning: 'Participants still enrolled on the last day of the period, as a share of everyone enrolled at any point in it.' },
      attendance_rate: { kind: 'percent', meaning: 'Share of seats filled at sessions with attendance logged. Each enrolled group member is one seat at each of those sessions.' },
      assignment_submissions: { kind: 'count', meaning: 'Assignments handed in during the period.' },
      submissions_per_participant: { kind: 'decimal', meaning: 'Assignments handed in per participant served.' },
      participants_served: { kind: 'people', meaning: 'Participants who attended at least one session in the period.' },
      g2_value: { kind: 'hours', meaning: 'Participant hours since the goal started (goal: "Participant hours").' },
      g2_target: { kind: 'hours', meaning: 'Target for the participant hours goal.' },
      g2_status: { kind: 'status', meaning: statusMeaning('participant hours') },
      g3_value: { kind: 'count', meaning: 'Assignment submissions since the goal started (goal: "Assignment submissions").' },
      g3_target: { kind: 'count', meaning: 'Target for the assignment submissions goal.' },
      g3_status: { kind: 'status', meaning: statusMeaning('assignment submissions') },
      g4_value: { kind: 'percent', meaning: 'Attendance rate since the goal started (goal: "Attendance rate of 80%").' },
      g4_target: { kind: 'percent', meaning: 'Target for the attendance rate goal.' },
    },
  },
];

const EXIT_NOTE = 'Where staff confirmed that a participant with no activity for 30 or more days had left, their exit date is their last activity.';
const STATUS_WORDS = { Met: 'met', 'On track': 'on track', Behind: 'behind', 'Past due': 'past due', 'No due date': 'open, with no due date' };

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
const cents = (units) => Math.round(units * 100); // hours held as hundredths
const fmtCents = (c) => commas(halfUp(c, 100));
const fmtPercent = (num, den) => `${halfUp(100 * num, den)}%`;
const fmtDecimal1 = (num, den) => {
  const tenths = halfUp(10 * num, den);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};

// ---------- suppression of a breakdown whose total is shown ----------
// A reader knows "<5" is 1 to 4 and "hidden" is 5 or more. Keep hiding the
// smallest visible cell above 0 until no hidden cell has only one possible
// value; if none is left, hide everything.
function suppress(values) {
  const cells = values.map((v) => ({ value: v, hidden: v >= 1 && v <= 4 ? 'small' : null }));
  const total = values.reduce((a, b) => a + b, 0);
  const pinned = () => {
    const h = cells.filter((c) => c.hidden);
    const s = h.reduce((a, c) => a + c.value, 0);
    const range = (c) => (c.hidden === 'small' ? [1, 4] : [5, s]);
    return h.some((c, i) => {
      const rest = h.filter((_, j) => j !== i);
      const lo = Math.max(range(c)[0], s - rest.reduce((a, o) => a + range(o)[1], 0));
      const hi = Math.min(range(c)[1], s - rest.reduce((a, o) => a + range(o)[0], 0));
      return lo === hi;
    });
  };
  let all = false;
  if (cells.some((c) => c.hidden) && !(total >= 1 && total <= 4)) {
    while (pinned()) {
      const visible = cells.filter((c) => !c.hidden && c.value > 0);
      if (!visible.length) { all = true; break; }
      const min = Math.min(...visible.map((c) => c.value));
      visible.find((c) => c.value === min).hidden = 'secondary';
    }
  }
  return cells.map((c) => {
    const hidden = all && !c.hidden ? 'secondary' : c.hidden;
    const display = all || hidden === 'secondary' ? 'hidden' : hidden === 'small' ? '<5' : commas(c.value);
    return { value: c.value, hidden, display };
  });
}

export function computeReference({ org, participants, engagements, checkins, goals }) {
  const AS_OF = org.as_of;
  const groupName = Object.fromEntries(org.groups.map((g) => [g.id, g.name]));
  const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));

  // ---------- findings (the data gaps check, as of the as-of date) ----------
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

    // participant|group|date -> the record that counts: the first logged, by record id.
    const att = new Map();
    let rawAtt = 0;
    let submissions = 0;
    for (const e of engagements) {
      if (!inRange(e.date) || !inGroup(e.group_id)) continue;
      if (e.activity_type === ATT) {
        rawAtt++;
        const k = `${e.participant_id}|${e.group_id}|${e.date}`;
        if (!att.has(k) || e.id < att.get(k).id) att.set(k, e);
      } else if (e.activity_type === SUB) {
        submissions++;
      }
    }
    const withRecords = new Set([...att.keys()].map((k) => k.split('|').slice(1).join('|')));
    const ranNoRecords = [...st.ran].filter((s) => {
      const [gid, d] = s.split('|');
      return inRange(d) && inGroup(gid) && !withRecords.has(s);
    });

    // Seats: the roster on the day of each session with records. Attended
    // counts only filled seats, so the rate can't pass 100%.
    let offered = 0;
    let attended = 0;
    for (const s of withRecords) {
      const [gid, d] = s.split('|');
      for (const p of people.filter((q) => q.group_id === gid && enrolledOn(q, d))) {
        offered++;
        if (att.has(`${p.id}|${gid}|${d}`)) attended++;
      }
    }
    let hoursCents = 0;
    for (const e of att.values()) hoursCents += cents(e.units);
    const served = new Set([...att.keys()].map((k) => k.split('|')[0]));
    const enrolledAny = people.filter((p) => p.join_date <= end && (p.exit_date === null || p.exit_date >= start));
    const retained = enrolledAny.filter((p) => enrolledOn(p, end));

    // Confidence: each participant's latest check-in in range against their intake score.
    const ids = new Set(people.filter((p) => p.confidence_intake !== null).map((p) => p.id));
    const latest = new Map();
    for (const c of checkins) {
      if (!inRange(c.date) || !ids.has(c.participant_id)) continue;
      const prev = latest.get(c.participant_id);
      if (!prev || c.date > prev.date || (c.date === prev.date && c.id > prev.id)) latest.set(c.participant_id, c);
    }
    const intake = Object.fromEntries(people.map((p) => [p.id, p.confidence_intake]));
    const improved = [...latest.values()].filter((c) => c.confidence > intake[c.participant_id]).length;

    return {
      sessions_with_records: withRecords.size,
      sessions_ran_not_recorded: ranNoRecords.length,
      sessions_delivered: withRecords.size + ranNoRecords.length,
      offered,
      attended,
      attendance_records_raw: rawAtt,
      attendance_records_kept: att.size,
      hours_cents: hoursCents,
      served,
      new_participants: people.filter((p) => inRange(p.join_date)).length,
      enrolled_any: enrolledAny.length,
      retained: retained.length,
      submissions,
      checked_in: latest.size,
      improved,
    };
  }

  function rateFigure(num, den, emptyText) {
    if (den === 0) return { numerator: 0, denominator: 0, value: null, display: emptyText };
    return { numerator: num, denominator: den, value: num / den, display: fmtPercent(num, den) };
  }

  // ---------- goals ----------
  function goalFigure(goal, asOf, st) {
    const m = measure(goal.start_date, asOf, st);
    let value; let valueDisplay; let met; let forecastCmp = null; let forecastDisplay = null;
    const elapsed = days(goal.start_date, asOf) + 1;
    const window = goal.due_date ? days(goal.start_date, goal.due_date) + 1 : null;
    let n = 0; let unitScale = 1;
    if (goal.metric === 'attendance_rate') {
      const pct = Math.round(goal.target * 100);
      value = m.offered ? m.attended / m.offered : null;
      valueDisplay = m.offered ? fmtPercent(m.attended, m.offered) : 'No sessions in this period';
      met = m.offered > 0 && m.attended * 100 >= pct * m.offered;
    } else {
      // Count goals, held as integers (hours as hundredths) so comparisons are exact.
      if (goal.metric === 'participant_hours') { n = m.hours_cents; unitScale = 100; value = n / 100; valueDisplay = fmtCents(n); }
      else if (goal.metric === 'new_participants') { n = m.new_participants; value = n; valueDisplay = fmtPeople(n); }
      else if (goal.metric === 'assignment_submissions') { n = m.submissions; value = n; valueDisplay = fmtCount(n); }
      else throw new Error(`unknown goal metric ${goal.metric}`);
      met = n >= goal.target * unitScale;
      if (window !== null) {
        forecastCmp = n * window >= goal.target * unitScale * elapsed; // forecast >= target
        const whole = halfUp(n * window, unitScale * elapsed);
        forecastDisplay = goal.metric === 'new_participants' ? fmtPeople(whole) : commas(whole);
      }
    }
    let status;
    if (met) status = 'Met';
    else if (goal.due_date && goal.due_date <= asOf) status = 'Past due'; // the as-of date is the period's last day
    else if (!goal.due_date) status = 'No due date';
    else if (goal.metric === 'attendance_rate') throw new Error('rate goals with a due date have no forecast rule');
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
      forecast: showForecast && window ? (n * window) / (unitScale * elapsed) : null,
      forecast_display: showForecast ? forecastDisplay : null,
      forecast_line: showForecast ? `Forecast by ${fmtShortDate(goal.due_date)}: ${forecastDisplay} of ${targetDisplay}` : null,
    };
  }

  // ---------- age breakdown of participants served ----------
  function ageBreakdown(served, st) {
    const byId = Object.fromEntries(st.people.map((p) => [p.id, p]));
    const values = org.age_ranges.map((r) => [...served].filter((pid) => byId[pid].age_range === r).length);
    const cells = suppress(values).map((c, i) => ({ age_range: org.age_ranges[i], ...c }));
    const footnote = cells.some((c) => c.hidden === 'secondary') ? "Hidden so a small group can't be worked out from the total." : null;
    return { total: { value: served.size, display: fmtPeople(served.size) }, cells, footnote };
  }

  // ---------- data notes: only what a funder needs to read the figures ----------
  function dataNotes(period, st, findings) {
    const inP = (d) => d >= period.start && d <= period.end;
    const both = TEMPLATES.map((t) => t.id);
    const notes = [];
    for (const f of findings) {
      const a = st.answers[f.id];
      if (f.kind === 'session_not_logged' && inP(f.date) && a === 'ran_not_recorded') {
        notes.push({ finding_id: f.id, kind: 'session_ran_not_recorded', templates: both, text: `${groupName[f.group_id]}, ${fmtDay(f.date)}: ran, but attendance wasn't recorded. Counted as delivered and left out of the attendance rate.` });
      }
      if (f.kind === 'inactive_participant' && a === 'left_program' && f.last_activity <= period.end && !notes.some((n) => n.kind === 'exit_by_answer')) {
        notes.push({ finding_id: 'exit-by-answer', kind: 'exit_by_answer', templates: both, text: EXIT_NOTE });
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
      participant_hours: { value: m.hours_cents / 100, display: fmtCents(m.hours_cents) },
      attendance_rate: { attended: m.attended, offered: m.offered, ...rateFigure(m.attended, m.offered, 'No sessions in this period') },
      retention_rate: { retained: m.retained, enrolled: m.enrolled_any, ...rateFigure(m.retained, m.enrolled_any, 'No participants in this period') },
      assignment_submissions: { value: m.submissions, display: fmtCount(m.submissions) },
      submissions_per_participant: m.served.size
        ? { submissions: m.submissions, served: m.served.size, value: m.submissions / m.served.size, display: fmtDecimal1(m.submissions, m.served.size) }
        : { submissions: m.submissions, served: 0, value: null, display: 'No participants served' },
      participants_checked_in: { value: m.checked_in, display: fmtPeople(m.checked_in) },
      confidence_improved: { improved: m.improved, checked_in: m.checked_in, ...rateFigure(m.improved, m.checked_in, 'No check-ins in this period') },
    };
    const byGroup = org.groups.map((g) => ({ g, gm: measure(period.start, period.end, st, g.id) }));
    return {
      metrics,
      attendance_rate_by_group: byGroup.map(({ g, gm }) => ({ group_id: g.id, attended: gm.attended, offered: gm.offered, ...rateFigure(gm.attended, gm.offered, `No sessions in ${period.short}`) })),
      retention_by_group: byGroup.map(({ g, gm }) => ({ group_id: g.id, retained: gm.retained, enrolled: gm.enrolled_any, ...rateFigure(gm.retained, gm.enrolled_any, `No participants in ${period.short}`) })),
      participants_by_age_range: ageBreakdown(m.served, st),
      goals: goals.map((g) => goalFigure(g, period.end, st)),
      data_notes: dataNotes(period, st, findings),
      raw: { attendance_records: m.attendance_records_raw, attendance_records_kept: m.attendance_records_kept },
    };
  }

  // ---------- narrative slots ----------
  function renderSlot(slot, kind, r, period) {
    if (kind === 'text') return period.long;
    const g = slot.match(/^g(\d)_(value|target|status)$/);
    const goal = g && r.goals.find((x) => x.id === `G${g[1]}`);
    if (kind === 'status') return STATUS_WORDS[goal.status];
    const fig = g ? (g[2] === 'value' ? { value: goal.value, display: goal.display } : { value: goal.target, display: goal.target_display }) : r.metrics[slot];
    if (fig.value === null) return fig.display;
    switch (kind) {
      case 'people': return fig.value >= 1 && fig.value <= 4 ? 'fewer than 5' : commas(fig.value);
      case 'count': return commas(fig.value);
      case 'hours': return fmtCents(cents(fig.value));
      case 'percent': return fig.display;
      case 'decimal': return fig.display;
      default: throw new Error(`unknown slot kind ${kind}`);
    }
  }

  return { detectFindings, applyState, compute, renderSlot };
}

export function computeAll(data, states) {
  const ref = computeReference(data);
  const findings = ref.detectFindings();
  const results = {};
  for (const p of PERIODS) {
    results[p.id] = {};
    for (const [sid, answers] of Object.entries(states)) results[p.id][sid] = ref.compute(p, ref.applyState(answers, findings), findings);
  }
  const narrativeSlots = {};
  for (const t of TEMPLATES) {
    narrativeSlots[t.id] = {};
    for (const p of PERIODS) {
      narrativeSlots[t.id][p.id] = {};
      for (const sid of Object.keys(states)) {
        narrativeSlots[t.id][p.id][sid] = Object.fromEntries(Object.entries(t.slots).map(([slot, def]) => [slot, ref.renderSlot(slot, def.kind, results[p.id][sid], p)]));
      }
    }
  }
  return { findings, results, narrativeSlots };
}

// ---------- spec checks on the planted cases ----------
function checkSpec(data, planted, findings, results) {
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
  if (q0.raw.attendance_records - q0.raw.attendance_records_kept !== 1) errs.push('expected exactly 1 duplicate attendance record');
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
  for (const p of PERIODS) {
    const c = results[p.id].none_answered.metrics.participants_checked_in.value;
    if (c < 5) errs.push(`${p.id}: only ${c} participants with a check-in`);
  }
  const wlAug = results.aug.none_answered.attendance_rate_by_group.find((g) => g.group_id === 'weekend-leaders');
  if (wlAug.value !== null || wlAug.display !== 'No sessions in Aug') errs.push('Weekend Leaders should show No sessions in Aug');
  const funderText = JSON.stringify(results);
  for (const n of data.participants.map((p) => p.display_name)) if (funderText.includes(n)) errs.push(`participant name in figures: ${n}`);
  return errs;
}

export function loadData(dir = HERE) {
  const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return { org: load('org.json'), participants: load('participants.json'), engagements: load('engagements.json'), checkins: load('checkins.json'), goals: load('goals.json') };
}

// ---------- main ----------
function main() {
  const data = loadData();
  const planted = JSON.parse(readFileSync(join(HERE, 'planted.json'), 'utf8'));
  const STATES = { none_answered: {}, all_answered: planted.answers_for_all_answered_state };
  const { findings, results, narrativeSlots } = computeAll(data, STATES);

  const errs = checkSpec(data, planted, findings, results);
  if (errs.length) {
    console.error('Spec checks failed:\n- ' + errs.join('\n- '));
    process.exit(1);
  }

  const out = {
    note: 'Reference figures for the sample data, generated by data/compute-reference.mjs from the metric definitions. Do not edit by hand.',
    mock: true,
    org: data.org.display_name,
    as_of: data.org.as_of,
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
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
