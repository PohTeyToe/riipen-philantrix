// Runs the Supabase migration on PGlite (Postgres compiled to WebAssembly),
// loads the sample data, and checks the program_rollup view against the app's
// metrics engine: every period, with no answers and with all answers.

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERIODS, sample, type Dataset } from '../lib/data';
import { applyAnswers, detectFindings, type Answers } from '../lib/findings';
import { computePeriod } from '../lib/report';

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261015000000_program_report.sql', import.meta.url), 'utf8');

// Supabase provides the auth schema. PGlite needs a stand-in for it.
const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const uid = (kind: string, id: string) => `md5(${q(`${kind}:${id}`)})::uuid`;
const ORG = uid('org', 'kestrel');
const WS = uid('ws', 'youth-mentorship-2026');

const findings = detectFindings(sample);
const ALL: Answers = Object.fromEntries(findings.filter((f) => f.answers.length).map((f) => [f.id, f.kind === 'session_not_logged' ? 'ran_not_recorded' : 'left_program']));

let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(AUTH_STUB);
  await db.exec(MIGRATION);
  const rows = (items: string[]) => items.join(',\n');
  await db.exec(`
    insert into organizations (id, name) values (${ORG}, ${q(sample.orgName)});
    insert into workstreams (id, organization_id, name) values (${WS}, ${ORG}, ${q(sample.workstream)});
    insert into groups (id, organization_id, workstream_id, name, session_hours) values
      ${rows(sample.groups.map((g) => `(${uid('group', g.id)}, ${ORG}, ${WS}, ${q(g.name)}, ${g.hours})`))};
    insert into participants (id, organization_id, group_id, display_name, age_range, confidence_intake, join_date, exit_date) values
      ${rows(sample.participants.map((p) => `(${uid('p', p.id)}, ${ORG}, ${uid('group', p.group_id)}, ${q(p.display_name)}, ${q(p.age_range)}, ${p.confidence_intake ?? 'null'}, ${q(p.join_date)}, ${p.exit_date ? q(p.exit_date) : 'null'})`))};
    -- created_at follows the record ids, so "the first record logged" means the same thing here and in the app.
    insert into engagements (id, organization_id, group_id, participant_id, activity_type, engaged_on, units, created_at) values
      ${rows([...sample.engagements].sort((a, b) => a.id.localeCompare(b.id)).map((e, i) => `(${uid('e', e.id)}, ${ORG}, ${uid('group', e.group_id)}, ${uid('p', e.participant_id)}, ${q(e.activity_type)}, ${q(e.date)}, ${e.units}, timestamptz '2026-10-01 00:00:00+00' + interval '${i} seconds')`))};
    insert into checkins (id, organization_id, participant_id, checked_on, confidence) values
      ${rows(sample.checkins.map((c) => `(${uid('c', c.id)}, ${ORG}, ${uid('p', c.participant_id)}, ${q(c.date)}, ${c.confidence})`))};
    insert into report_periods (id, workstream_id, label, starts_on, ends_on) values
      ${rows(PERIODS.map((p) => `(${uid('period', p.id)}, ${WS}, ${q(p.id)}, ${q(p.start)}, ${q(p.end)})`))};
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Records the answers the way the app would: a "ran" row, or an exit date. */
async function answerAll() {
  const st = applyAnswers(sample, findings, ALL);
  for (const f of findings) {
    if (f.kind === 'session_not_logged') await db.exec(`insert into sessions_ran_unrecorded (group_id, session_date) values (${uid('group', f.groupId)}, ${q(f.date)})`);
    if (f.kind === 'inactive_participant') {
      const exit = st.people.find((p) => p.id === f.participantId)!.exit_date!;
      await db.exec(`update participants set exit_date = ${q(exit)} where id = ${uid('p', f.participantId)}`);
    }
  }
}

interface RollupRow {
  label: string;
  participants_served: number;
  new_participants: number;
  sessions_delivered: number;
  participant_hours: string;
  attended: number;
  offered: number;
  retained: number;
  enrolled: number;
  assignment_submissions: number;
  participants_checked_in: number;
  attendance_rate: string | null;
  retention_rate: string | null;
  confidence_improved_rate: string | null;
}

async function compare(answers: Answers, ds: Dataset = sample) {
  const { rows } = await db.query<RollupRow>('select * from program_rollup order by starts_on, ends_on');
  const st = applyAnswers(ds, findings, answers);
  const rate = (v: string | null) => (v === null ? null : Number(v));
  const close = (v: number | null) => (v === null ? null : expect.closeTo(v, 12));
  for (const period of PERIODS) {
    const row = rows.find((r) => r.label === period.id)!;
    const f = computePeriod(ds, st, findings, period);
    const m = f.metrics;
    expect({
      served: Number(row.participants_served),
      new: Number(row.new_participants),
      delivered: Number(row.sessions_delivered),
      hours: Number(row.participant_hours),
      attended: Number(row.attended),
      offered: Number(row.offered),
      submissions: Number(row.assignment_submissions),
      checkedIn: Number(row.participants_checked_in),
      attendance: rate(row.attendance_rate),
      retention: rate(row.retention_rate),
      confidence: rate(row.confidence_improved_rate),
    }, period.id).toEqual({
      served: m.participants_served.value,
      new: m.new_participants.value,
      delivered: m.sessions_delivered.value,
      hours: m.participant_hours.value,
      attended: f.attendanceByGroup.reduce((s, g) => s + g.num, 0),
      offered: f.attendanceByGroup.reduce((s, g) => s + g.den, 0),
      submissions: m.assignment_submissions.value,
      checkedIn: m.participants_checked_in.value,
      attendance: close(m.attendance_rate.value),
      retention: close(m.retention_rate.value),
      confidence: close(m.confidence_improved.value),
    });
  }
}

describe('program_rollup view matches the app', () => {
  it('with no findings answered', async () => {
    await compare({});
  });
  it('with every finding answered', async () => {
    await answerAll();
    await compare(ALL);
  });
  it('when a duplicate has different units, and units are not whole half hours', async () => {
    // The later copy of the duplicate says 0.5 hours. Both sides keep the first record logged.
    const units: Record<string, number> = { E0106: 0.5, E0001: 1.25 };
    for (const [id, u] of Object.entries(units)) await db.exec(`update engagements set units = ${u} where id = ${uid('e', id)}`);
    const ds: Dataset = { ...sample, engagements: sample.engagements.map((e) => (e.id in units ? { ...e, units: units[e.id] } : e)) };
    await compare(ALL, ds);
  });
});
