-- Past Projects for two guest accounts (PMO, 6 Oct 2026): MOwais (Muhammad Owais
-- Ayub) and Dir FMSD (Brig. Muhammad Tasawar Sattar (R)).
-- They see every past project and every follow-up conversation, and can post on
-- a project's thread or in the chat with any project manager. They cannot edit
-- projects, dates, the WBS, or import. Everyone else is unchanged.
--
-- The list lives in settings (key past_viewers), which only the PMO can change,
-- rather than on user_profiles, where users may update parts of their own row.

insert into public.settings (key, value, updated_at)
values ('past_viewers', jsonb_build_object('user_ids', jsonb_build_array(
          'd58e4451-dc11-450b-9c5d-6fbebfac11e3',    -- MOwais
          'fca16b55-1134-4cef-a8cb-807d0b41cb6a')),  -- Dir FMSD
        now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- True for an active account on that list.
create or replace function public.is_past_viewer()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from settings s join user_profiles u on u.id = auth.uid()
     where s.key = 'past_viewers' and u.is_active
       and coalesce(s.value -> 'user_ids', '[]'::jsonb) ? auth.uid()::text);
$$;
revoke all on function public.is_past_viewer() from public, anon;
grant execute on function public.is_past_viewer() to authenticated;

-- Reading: projects, their WBS (via can_view_past) and both kinds of conversation.
create or replace function public.can_view_past(p_id uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select is_pmo() or is_past_pm(p_id) or is_past_viewer(); $$;

alter policy past_select on public.past_projects
  using (is_pmo() or pm_user_id = auth.uid() or is_past_viewer());

create policy past_updates_viewer_select on public.past_project_updates
  for select using (is_past_viewer());

alter policy past_pm_select on public.past_pm_messages
  using (is_pmo() or pm_user_id = auth.uid() or is_past_viewer());

-- Posting: as themselves, with their real role, on any past project's thread or
-- in the chat with any manager (a tagged project must belong to that manager).
create policy past_updates_viewer_insert on public.past_project_updates
  for insert with check (
    author_id = auth.uid() and is_past_viewer()
    and author_role = (select up.role from user_profiles up where up.id = auth.uid() and up.is_active)
    and exists (select 1 from past_projects p where p.id = past_project_id));

alter policy past_pm_insert on public.past_pm_messages
  with check (
    author_id = auth.uid()
    and author_role = (select up.role from user_profiles up where up.id = auth.uid() and up.is_active)
    and (is_pmo() or pm_user_id = auth.uid() or is_past_viewer())
    and (past_project_id is null or exists (
          select 1 from past_projects p
           where p.id = past_pm_messages.past_project_id and p.pm_user_id = past_pm_messages.pm_user_id)));

-- Unchanged on purpose: past_write (PMO only), past_tasks_write (PMO or the
-- project's own manager), past_updates_all and the message edit/removal policies (PMO).
