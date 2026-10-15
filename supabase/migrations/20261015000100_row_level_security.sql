-- Org-scoped row-level security. A signed-in user reads rows of the
-- organizations they belong to; owners, admins and editors can also write
-- them; viewers can't. Anonymous requests get nothing.
-- Tested by supabase/tests/database/rls.test.sql (pgTAP, `supabase test db`).

-- Membership checks run as the function owner so policies on memberships
-- don't call themselves.
create function public.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create function public.can_write(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
  );
$$;

create function public.can_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_member(uuid), public.can_write(uuid), public.can_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.can_write(uuid), public.can_admin(uuid) to authenticated;

-- Organizations: members read; owners and admins edit.
alter table organizations enable row level security;
create policy "members read" on organizations for select to authenticated using (public.is_member(id));
create policy "admins update" on organizations for update to authenticated using (public.can_admin(id)) with check (public.can_admin(id));

-- Memberships: members see who else is in their org; owners and admins manage it.
alter table memberships enable row level security;
create policy "members read" on memberships for select to authenticated using (public.is_member(organization_id));
create policy "admins insert" on memberships for insert to authenticated with check (public.can_admin(organization_id));
create policy "admins update" on memberships for update to authenticated using (public.can_admin(organization_id)) with check (public.can_admin(organization_id));
create policy "admins delete" on memberships for delete to authenticated using (public.can_admin(organization_id));

-- Tables that carry organization_id: members read, writers write.
do $$
declare t text;
begin
  foreach t in array array['workstreams', 'groups', 'participants', 'engagements', 'tracked_goals', 'report_templates', 'completed_reports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "members read" on %I for select to authenticated using (public.is_member(organization_id))', t);
    execute format('create policy "writers insert" on %I for insert to authenticated with check (public.can_write(organization_id))', t);
    execute format('create policy "writers update" on %I for update to authenticated using (public.can_write(organization_id)) with check (public.can_write(organization_id))', t);
    execute format('create policy "writers delete" on %I for delete to authenticated using (public.can_write(organization_id))', t);
  end loop;
end $$;

-- Tables scoped through a parent row.
alter table schedule_breaks enable row level security;
create policy "members read" on schedule_breaks for select to authenticated
  using (exists (select 1 from groups g where g.id = group_id and public.is_member(g.organization_id)));
create policy "writers write" on schedule_breaks for all to authenticated
  using (exists (select 1 from groups g where g.id = group_id and public.can_write(g.organization_id)))
  with check (exists (select 1 from groups g where g.id = group_id and public.can_write(g.organization_id)));

alter table sessions_ran_unrecorded enable row level security;
create policy "members read" on sessions_ran_unrecorded for select to authenticated
  using (exists (select 1 from groups g where g.id = group_id and public.is_member(g.organization_id)));
create policy "writers write" on sessions_ran_unrecorded for all to authenticated
  using (exists (select 1 from groups g where g.id = group_id and public.can_write(g.organization_id)))
  with check (exists (select 1 from groups g where g.id = group_id and public.can_write(g.organization_id)));

alter table template_stakeholders enable row level security;
create policy "members read" on template_stakeholders for select to authenticated
  using (exists (select 1 from report_templates t where t.id = template_id and public.is_member(t.organization_id)));
create policy "writers write" on template_stakeholders for all to authenticated
  using (exists (select 1 from report_templates t where t.id = template_id and public.can_write(t.organization_id)))
  with check (exists (select 1 from report_templates t where t.id = template_id and public.can_write(t.organization_id)));

alter table report_periods enable row level security;
create policy "members read" on report_periods for select to authenticated
  using (exists (select 1 from workstreams w where w.id = workstream_id and public.is_member(w.organization_id)));
create policy "writers write" on report_periods for all to authenticated
  using (exists (select 1 from workstreams w where w.id = workstream_id and public.can_write(w.organization_id)))
  with check (exists (select 1 from workstreams w where w.id = workstream_id and public.can_write(w.organization_id)));

-- program_rollup is security_invoker, so it inherits all of the above.
