-- Past Projects follow-ups (PMO, 5 Oct 2026).
-- 1. Each project manager sees the past projects assigned to them (and nothing else).
--    The PMO still sees and edits everything, including the manager.
-- 2. The per-project follow-up thread: the project's manager can read it and reply.
-- 3. A chat per project manager about all their past projects (past_pm_messages),
--    optionally tagged to one of their projects.
-- 4. Read markers (past_chat_reads) for the unread badges.
-- Emails are sent by the edge function notify-past after each message.

-- 1. Visibility ---------------------------------------------------------------
create or replace function public.can_view_past(p_id uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select is_pmo() or is_past_pm(p_id); $$;

drop policy if exists past_select on public.past_projects;
create policy past_select on public.past_projects for select to authenticated
  using (is_pmo() or pm_user_id = auth.uid());
-- past_write (ALL, is_pmo()) is unchanged: only the PMO edits a past project.

-- 2. Per-project thread ---------------------------------------------------------
drop policy if exists past_updates_all on public.past_project_updates;
create policy past_updates_select on public.past_project_updates for select to authenticated
  using (can_view_past(past_project_id));
create policy past_updates_insert on public.past_project_updates for insert to authenticated
  with check (author_id = auth.uid() and author_role = current_user_role()
              and (is_pmo() or is_past_pm(past_project_id)));
create policy past_updates_update on public.past_project_updates for update to authenticated
  using (is_pmo()) with check (is_pmo());
create policy past_updates_delete on public.past_project_updates for delete to authenticated
  using (is_pmo());

-- 3. Chat per project manager -----------------------------------------------------
create table public.past_pm_messages (
  id              uuid primary key default gen_random_uuid(),
  pm_user_id      uuid not null references public.user_profiles(id) on delete cascade,
  past_project_id uuid references public.past_projects(id) on delete set null,
  author_id       uuid not null references public.user_profiles(id),
  author_name     text,
  author_role     user_role not null,
  body            text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_at      timestamptz not null default now()
);
create index past_pm_messages_pm_idx on public.past_pm_messages (pm_user_id, created_at);
alter table public.past_pm_messages enable row level security;
create policy past_pm_select on public.past_pm_messages for select to authenticated
  using (is_pmo() or pm_user_id = auth.uid());
create policy past_pm_insert on public.past_pm_messages for insert to authenticated
  with check (author_id = auth.uid() and author_role = current_user_role()
              and (is_pmo() or pm_user_id = auth.uid())
              and (past_project_id is null or exists (select 1 from public.past_projects p
                     where p.id = past_project_id and p.pm_user_id = past_pm_messages.pm_user_id)));
create policy past_pm_update on public.past_pm_messages for update to authenticated
  using (is_pmo()) with check (is_pmo());
create policy past_pm_delete on public.past_pm_messages for delete to authenticated
  using (is_pmo());
grant select on public.past_pm_messages to anon;
grant select, insert, update, delete on public.past_pm_messages to authenticated, service_role;

-- A message tagged to a project counts as following it up, like the project thread.
create or replace function public.touch_past_followup_pm()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$ begin
  if new.past_project_id is not null then
    update public.past_projects set last_followed_up = current_date where id = new.past_project_id;
  end if;
  return new;
end $$;
create trigger trg_past_pm_touch after insert on public.past_pm_messages
  for each row execute function public.touch_past_followup_pm();

-- 4. Read markers ('pm:<pm user id>' or 'project:<past project id>') ---------------
create table public.past_chat_reads (
  user_id  uuid not null references public.user_profiles(id) on delete cascade,
  thread   text not null check (thread ~ '^(pm|project):[0-9a-f-]{36}$'),
  read_at  timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table public.past_chat_reads enable row level security;
create policy past_reads_own on public.past_chat_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.past_chat_reads to anon;
grant select, insert, update, delete on public.past_chat_reads to authenticated, service_role;
