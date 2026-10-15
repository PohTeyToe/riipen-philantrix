-- Row-level security: a member of org B can't read org A's data, an
-- anonymous request gets nothing, and a viewer can read but not write.
-- Run with: supabase db start && supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Two orgs, three users. Editor and viewer in A, a member of B.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'editor-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'viewer-a@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'member-b@example.test');

insert into organizations (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Org A (test)'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Org B (test)');

insert into memberships (organization_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'editor'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'editor');

insert into workstreams (id, organization_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Program A');
insert into groups (id, organization_id, workstream_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Group A');
insert into participants (id, organization_id, group_id, display_name, join_date) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'Test One', '2026-07-01'),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'Test Two', '2026-07-01');
insert into engagements (organization_id, group_id, participant_id, activity_type, engaged_on, units) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Attendances', '2026-07-02', 1.5);
insert into report_periods (workstream_id, label, starts_on, ends_on) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'Jul to Sep', '2026-07-01', '2026-09-30');

-- ---------- a member of org B ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

select is_empty($$ select id from participants $$, 'a member of org B reads none of org A''s participants');
select is_empty($$ select id from engagements $$, 'a member of org B reads none of org A''s engagements');
select is_empty($$ select period_id from program_rollup $$, 'a member of org B gets no roll-up rows for org A');
select throws_ok(
  $$ insert into participants (organization_id, group_id, display_name, join_date)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'Intruder', '2026-07-01') $$,
  '42501', null, 'a member of org B can''t add a participant to org A');

-- ---------- anonymous ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

select is_empty($$ select id from participants $$, 'an anonymous request reads no participants');
select is_empty($$ select id from engagements $$, 'an anonymous request reads no engagements');
select is_empty($$ select id from organizations $$, 'an anonymous request reads no organizations');

-- ---------- a viewer in org A ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

select results_eq($$ select count(*) from participants $$, $$ values (2::bigint) $$, 'a viewer reads their org''s participants');
select results_eq($$ select attended, offered from program_rollup $$, $$ values (1::bigint, 2::bigint) $$, 'a viewer reads their org''s roll-up');
select throws_ok(
  $$ insert into participants (organization_id, group_id, display_name, join_date)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'New', '2026-07-01') $$,
  '42501', null, 'a viewer can''t add a participant');
update participants set display_name = 'Changed by viewer';

-- ---------- an editor in org A ----------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is_empty($$ select id from participants where display_name = 'Changed by viewer' $$, 'a viewer''s update changes nothing');
select lives_ok(
  $$ insert into participants (organization_id, group_id, display_name, join_date)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'Added by editor', '2026-07-01') $$,
  'an editor can add a participant');
select results_eq($$ select count(*) from participants $$, $$ values (3::bigint) $$, 'the editor''s new participant is there');

select * from finish();
rollback;
