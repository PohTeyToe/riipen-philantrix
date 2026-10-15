// Runs the Supabase migration on PGlite (Postgres compiled to WebAssembly),
// loads the sample data, and checks the program_rollup view against the app's
// metrics engine: every period, with no answers and with all answers.

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERIODS, sample } from '../lib/data';
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
    insert into participants (id, organization_id, group_id, display_name, age_range, join_date, exit_date) values
      ${rows(sample.participants.map((p) => `(${uid('p', p.id)}, ${ORG}, ${uid('group', p.group_id)}, ${q(p.display_name)}, ${q(p.age_range)}, ${q(p.join_date)}, ${p.exit_date ? q(p.exit_date) : 'null'})`))};
    insert into engagements (id, organization_id, group_id, participant_id, activity_type, engaged_on, units) values
      ${rows(sample.engagements.map((e) => `(${uid('e', e.id)}, ${ORG}, ${uid('group', e.group_id)}, ${uid('p', e.participant_id)}, ${q(e.activity_type)}, ${q(e.date)}, ${e.units})`))};
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
  attendance_rate: string | null;
  retention_rate: string | null;
}

async function compare(answers: Answers) {
  const { rows } = await db.query<RollupRow>('select * from program_rollup order by starts_on, ends_on');
  const st = applyAnswers(sample, findings, answers);
  for (const period of PERIODS) {
    const row = rows.find((r) => r.label === period.id)!;
    const f = computePeriod(sample, st, findings, period);
    const m = f.metrics;
    expect({
      served: Number(row.participants_served),
      new: Number(row.new_participants),
      delivered: Number(row.sessions_delivered),
      hours: Number(row.participant_hours),
      submissions: Number(row.assignment_submissions),
      attendance: row.attendance_rate === null ? null : Number(row.attendance_rate),
      retention: row.retention_rate === null ? null : Number(row.retention_rate),
    }, period.id).toEqual({
      served: m.participants_served.value,
      new: m.new_participants.value,
      delivered: m.sessions_delivered.value,
      hours: m.participant_hours.value,
      submissions: m.assignment_submissions.value,
      attendance: m.attendance_rate.value === null ? null : expect.closeTo(m.attendance_rate.value, 12),
      retention: m.retention_rate.value === null ? null : expect.closeTo(m.retention_rate.value, 12),
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
});
