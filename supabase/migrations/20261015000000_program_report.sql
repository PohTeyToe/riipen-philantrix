-- Program report schema and the roll-up view.
--
-- Table names marked "Seen" appear in Philantrix's public product screenshots
-- (the dashboard's activity feed). Every other table is inferred, and so is
-- every column, including those on seen tables. Read this as a proposal to
-- check against the real schema in week one, not a copy of it.
--
-- tests/sql-view.test.ts runs this file on PGlite and checks the view against
-- the app's metrics engine for every period and both answer states.

-- Inferred. Each customer organization (workspace).
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Seen. Who belongs to which organization, and their role. Columns guessed.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- Inferred. A program; the subject of a program-level report.
create table workstreams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null
);

-- Inferred. The schedule columns are this demo's biggest guess: the gaps check
-- needs a schedule to spot a session nobody logged.
create table groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  workstream_id uuid not null references workstreams (id) on delete cascade,
  name text not null,
  meeting_days smallint[] not null default '{}', -- ISO weekdays, 1 = Monday (inferred)
  session_hours numeric(4, 2),                    -- inferred
  schedule_starts_on date,                        -- inferred
  schedule_ends_on date                           -- inferred
);

-- Inferred. Dates a group doesn't meet (holidays, summer break).
create table schedule_breaks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  check (ends_on >= starts_on)
);

-- Inferred. Age range and confidence at intake are custom fields in the
-- product; they're columns here to keep the demo small.
create table participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  group_id uuid not null references groups (id) on delete restrict,
  display_name text not null,
  age_range text,
  confidence_intake smallint check (confidence_intake between 1 and 5), -- inferred
  join_date date not null,
  exit_date date, -- last enrolled day
  check (exit_date is null or exit_date >= join_date)
);

-- Inferred. One row per participant per activity, the way the Engagement
-- Logger saves one record per ticked participant. An absence has no row.
create table engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  group_id uuid not null references groups (id) on delete restrict,
  participant_id uuid not null references participants (id) on delete cascade,
  activity_type text not null check (activity_type in ('Attendances', 'Assignment Submissions')),
  engaged_on date not null,
  units numeric(6, 2) not null default 1, -- Duration / Units
  created_at timestamptz not null default now()
);
create index engagements_group_day on engagements (group_id, engaged_on);
create index engagements_participant_day on engagements (participant_id, engaged_on);

-- Inferred. The confidence custom field (1 to 5), recorded again at a
-- check-in. The outcome compares each participant's latest check-in with
-- their score at intake.
create table checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  checked_on date not null,
  confidence smallint not null check (confidence between 1 and 5),
  created_at timestamptz not null default now()
);
create index checkins_participant_day on checkins (participant_id, checked_on);

-- Inferred. Tracked Goals.
create table tracked_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  workstream_id uuid not null references workstreams (id) on delete cascade,
  name text not null,
  metric text not null check (metric in ('new_participants', 'participant_hours', 'assignment_submissions', 'attendance_rate')),
  target numeric not null,
  start_date date not null, -- inferred: needed to forecast pace
  due_date date
);

-- Inferred. A session answered "Ran, attendance not recorded" in the gaps
-- check. It counts as delivered and stays out of the attendance rate.
-- ("Left the program" needs no table: it sets participants.exit_date.)
create table sessions_ran_unrecorded (
  group_id uuid not null references groups (id) on delete cascade,
  session_date date not null,
  answered_by uuid references auth.users (id),
  answered_at timestamptz not null default now(),
  primary key (group_id, session_date)
);

-- Seen. Columns guessed. subject_type adds 'workstream' next to the
-- product's per-participant reports.
create table report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  subject_type text not null default 'participant' check (subject_type in ('participant', 'workstream')),
  sections jsonb not null default '[]'
);

-- Seen. Who a template is for (a funder, a board). Columns guessed.
create table template_stakeholders (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references report_templates (id) on delete cascade,
  name text not null
);

-- Seen. A report as it was sent: the period, the answers and the figures,
-- frozen. Columns guessed.
create table completed_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  template_id uuid not null references report_templates (id) on delete restrict,
  period_starts_on date not null,
  period_ends_on date not null,
  figures jsonb not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- Inferred. The periods a workstream reports on.
create table report_periods (
  id uuid primary key default gen_random_uuid(),
  workstream_id uuid not null references workstreams (id) on delete cascade,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on)
);

-- The roll-up. One row per workstream and report period, counted the same
-- way as lib/metrics.ts:
--   offered        enrolled group members on the day of each session with attendance logged
--   attended       offered seats that have an Attendances record (a duplicate counts once)
--   hours          units on the first record logged for each person and session
--   delivered      sessions with attendance logged, plus sessions answered "ran"
--   retained       enrolled on the period's last day, out of enrolled on any day
--   improved       latest check-in in the period above the intake score, out of everyone with both
-- security_invoker makes the view run with the caller's row-level security.
create view program_rollup with (security_invoker = true) as
with attendance as (
  select distinct on (e.group_id, e.participant_id, e.engaged_on)
    g.workstream_id, e.group_id, e.participant_id, e.engaged_on, e.units
  from engagements e
  join groups g on g.id = e.group_id
  where e.activity_type = 'Attendances'
  order by e.group_id, e.participant_id, e.engaged_on, e.created_at, e.id
),
logged_sessions as (
  select distinct workstream_id, group_id, engaged_on as session_date from attendance
),
answered_sessions as (
  select g.workstream_id, s.group_id, s.session_date
  from sessions_ran_unrecorded s
  join groups g on g.id = s.group_id
  where not exists (select 1 from logged_sessions l where l.group_id = s.group_id and l.session_date = s.session_date)
),
seats as (
  select l.workstream_id, l.group_id, l.session_date, p.id as participant_id
  from logged_sessions l
  join participants p on p.group_id = l.group_id
    and p.join_date <= l.session_date
    and (p.exit_date is null or l.session_date <= p.exit_date)
),
roster as (
  select g.workstream_id, p.*
  from participants p
  join groups g on g.id = p.group_id
),
submissions as (
  select g.workstream_id, e.engaged_on
  from engagements e
  join groups g on g.id = e.group_id
  where e.activity_type = 'Assignment Submissions'
),
latest_checkins as (
  select distinct on (rp.id, c.participant_id)
    rp.id as period_id, c.participant_id, c.confidence, p.confidence_intake
  from report_periods rp
  join groups g on g.workstream_id = rp.workstream_id
  join participants p on p.group_id = g.id and p.confidence_intake is not null
  join checkins c on c.participant_id = p.id and c.checked_on between rp.starts_on and rp.ends_on
  order by rp.id, c.participant_id, c.checked_on desc, c.created_at desc, c.id desc
),
counts as (
  select
    rp.id as period_id,
    rp.workstream_id,
    rp.label,
    rp.starts_on,
    rp.ends_on,
    (select count(distinct a.participant_id) from attendance a
      where a.workstream_id = rp.workstream_id and a.engaged_on between rp.starts_on and rp.ends_on) as participants_served,
    (select count(*) from roster r
      where r.workstream_id = rp.workstream_id and r.join_date between rp.starts_on and rp.ends_on) as new_participants,
    (select count(*) from logged_sessions l
      where l.workstream_id = rp.workstream_id and l.session_date between rp.starts_on and rp.ends_on)
    + (select count(*) from answered_sessions s
      where s.workstream_id = rp.workstream_id and s.session_date between rp.starts_on and rp.ends_on) as sessions_delivered,
    (select coalesce(sum(a.units), 0) from attendance a
      where a.workstream_id = rp.workstream_id and a.engaged_on between rp.starts_on and rp.ends_on) as participant_hours,
    (select count(*) from seats s
      where s.workstream_id = rp.workstream_id and s.session_date between rp.starts_on and rp.ends_on
        and exists (select 1 from attendance a
          where a.group_id = s.group_id and a.participant_id = s.participant_id and a.engaged_on = s.session_date)) as attended,
    (select count(*) from seats s
      where s.workstream_id = rp.workstream_id and s.session_date between rp.starts_on and rp.ends_on) as offered,
    (select count(*) from roster r
      where r.workstream_id = rp.workstream_id and r.join_date <= rp.ends_on
        and (r.exit_date is null or r.exit_date >= rp.ends_on)) as retained,
    (select count(*) from roster r
      where r.workstream_id = rp.workstream_id and r.join_date <= rp.ends_on
        and (r.exit_date is null or r.exit_date >= rp.starts_on)) as enrolled,
    (select count(*) from submissions s
      where s.workstream_id = rp.workstream_id and s.engaged_on between rp.starts_on and rp.ends_on) as assignment_submissions,
    (select count(*) from latest_checkins c where c.period_id = rp.id) as participants_checked_in,
    (select count(*) from latest_checkins c where c.period_id = rp.id and c.confidence > c.confidence_intake) as confidence_improved
  from report_periods rp
)
select
  counts.*,
  attended::numeric / nullif(offered, 0) as attendance_rate,
  retained::numeric / nullif(enrolled, 0) as retention_rate,
  assignment_submissions::numeric / nullif(participants_served, 0) as submissions_per_participant,
  confidence_improved::numeric / nullif(participants_checked_in, 0) as confidence_improved_rate
from counts;
