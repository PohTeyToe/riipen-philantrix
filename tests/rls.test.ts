// Runs the pgTAP suite in supabase/tests/database/rls.test.sql on PGlite
// (Postgres in WebAssembly), so the row-level security tests run in every
// `npm test`, with no Docker. PGlite has no pgTAP, so the handful of pgTAP
// functions the suite uses are defined below with the same meaning. CI also
// runs the file for real with `supabase test db`.

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MIGRATIONS = [read('../supabase/migrations/20261015000000_program_report.sql'), read('../supabase/migrations/20261015000100_row_level_security.sql')];
const SUITE = read('../supabase/tests/database/rls.test.sql');

// What Supabase gives every project: the auth schema, auth.uid(), the anon
// and authenticated roles, and their default grants on public tables.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;
const GRANTS = `grant select, insert, update, delete on all tables in schema public to anon, authenticated;`;

// The pgTAP functions the suite calls. Each returns a TAP line.
const PGTAP_SHIM = `
  create function plan(n int) returns text language sql as $$ select '1..' || n $$;
  create function tap(ok boolean, msg text) returns text language sql as $$ select case when ok then 'ok - ' else 'not ok - ' end || msg $$;
  create function is_empty(q text, msg text) returns text language plpgsql as $$
    declare found boolean;
    begin execute format('select exists (%s)', q) into found; return tap(not found, msg); end $$;
  create function results_eq(q text, want text, msg text) returns text language plpgsql as $$
    declare extra bigint; missing bigint;
    begin
      execute format('select count(*) from ((%s) except all (%s)) x', q, want) into extra;
      execute format('select count(*) from ((%s) except all (%s)) x', want, q) into missing;
      return tap(extra = 0 and missing = 0, msg);
    end $$;
  create function throws_ok(q text, code text, errmsg text, msg text) returns text language plpgsql as $$
    begin
      begin execute q; exception when others then return tap(sqlstate = code, msg || ' (got ' || sqlstate || ')'); end;
      return tap(false, msg || ' (no error)');
    end $$;
  create function lives_ok(q text, msg text) returns text language plpgsql as $$
    begin
      begin execute q; exception when others then return tap(false, msg || ' (' || sqlerrm || ')'); end;
      return tap(true, msg);
    end $$;
  create function finish() returns setof text language sql as $$ select null::text where false $$;
  grant execute on all functions in schema public to anon, authenticated;
`;

let db: PGlite;
const lines: string[] = [];

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const m of MIGRATIONS) await db.exec(m);
  await db.exec(GRANTS);
  await db.exec(PGTAP_SHIM);
  // The only line PGlite can't run: there is no pgTAP extension to create.
  const suite = SUITE.replace(/^create extension if not exists pgtap with schema extensions;$/m, '');
  expect(suite).not.toBe(SUITE);
  for (const r of await db.exec(suite)) for (const row of r.rows) for (const v of Object.values(row)) if (typeof v === 'string' && /^(not )?ok - |^1\.\.\d+$/.test(v)) lines.push(v);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('row-level security (the pgTAP suite, on PGlite)', () => {
  it('runs every planned test', () => {
    const plan = Number(lines.find((l) => l.startsWith('1..'))?.slice(3));
    expect(plan).toBe(13);
    expect(lines.filter((l) => / - /.test(l))).toHaveLength(plan);
  });
  it('passes every test', () => {
    expect(lines.filter((l) => l.startsWith('not ok'))).toEqual([]);
  });
  it('leaves nothing behind: the suite rolls back', async () => {
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from participants');
    expect(rows[0].n).toBe(0);
  });
});
