-- Tasks/Goals (PMO, 12 Nov 2026): a PMO-only tab under Administration with six task lists:
--   pmo_todo     PMO To-Do (team-wide)
--   pending_pr   Pending PRs: each task names a project, an FY 26-27 project (project_id)
--                or an open past project (past_project_id); while it is open the project shows
--                a red "Pending PR" badge (PMO only)
--   manager_pmo  Mr. Owais Javed          exec_pmo  Engr. Usman Ahmed Umar
--   po1          Mr. Abdullah Azhar       po2       Mr. Atisham ul Haq
-- (the member lists use the settings.team_config keys, so names and titles come from Team & About).
-- Server-stamped: created_at/by on insert, done_at when ticked (cleared when unticked).
-- "Delete" in the page sets removed = true (kept for the Activity Log, like project_todos).

create table public.pmo_tasks (
  id               uuid primary key default gen_random_uuid(),
  list             text not null check (list in ('pmo_todo','pending_pr','manager_pmo','exec_pmo','po1','po2')),
  title            text not null check (length(btrim(title)) between 1 and 500),
  note             text check (note is null or length(note) <= 2000),
  priority         text not null default 'normal' check (priority in ('high','normal','low')),
  due_date         date,
  project_id       uuid references public.projects(id) on delete set null,
  past_project_id  uuid references public.past_projects(id) on delete set null,
  done             boolean not null default false,
  done_at          timestamptz,
  done_by          uuid,
  removed          boolean not null default false,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pmo_tasks_pr_project check (
    (list = 'pending_pr' and (project_id is not null) <> (past_project_id is not null))
    or (list <> 'pending_pr' and project_id is null and past_project_id is null))
);
create index pmo_tasks_list on public.pmo_tasks (list) where not removed;
create index pmo_tasks_open_pr on public.pmo_tasks (project_id, past_project_id)
  where list = 'pending_pr' and not done and not removed;

alter table public.pmo_tasks enable row level security;
create policy pmo_tasks_pmo on public.pmo_tasks
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

create or replace function public.trg_pmo_tasks_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    new.done_at := case when new.done then now() end;
    new.done_by := case when new.done then auth.uid() end;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by;
  if old.removed then new.removed := true; end if;
  if new.done and not old.done then new.done_at := now(); new.done_by := auth.uid();
  elsif new.done then new.done_at := old.done_at; new.done_by := old.done_by;
  else new.done_at := null; new.done_by := null;
  end if;
  return new;
end;
$$;
create trigger trg_pmo_tasks_stamp
  before insert or update on public.pmo_tasks
  for each row execute function public.trg_pmo_tasks_stamp();

create or replace function public.log_pmo_task()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role; v_action text; v_what text; v_list text;
begin
  if tg_op = 'INSERT' then v_action := 'created'; v_what := 'added';
  elsif new.removed and not old.removed then v_action := 'updated'; v_what := 'deleted';
  elsif new.done and not old.done then v_action := 'updated'; v_what := 'completed';
  elsif old.done and not new.done then v_action := 'updated'; v_what := 'reopened';
  elsif (new.list, new.title, new.note, new.priority, new.due_date, new.project_id, new.past_project_id)
        is distinct from (old.list, old.title, old.note, old.priority, old.due_date, old.project_id, old.past_project_id)
    then v_action := 'updated'; v_what := 'edited';
  else return new;
  end if;
  v_list := case new.list when 'pmo_todo' then 'PMO To-Do' when 'pending_pr' then 'Pending PRs'
    else coalesce((select value->new.list->>'name' from public.settings where key = 'team_config'), new.list) end;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role, v_action, 'pmo_tasks', new.id::text,
          format('Task %s (%s): %s', v_what, v_list, left(new.title, 90)),
          jsonb_build_object('list', new.list, 'title', new.title, 'due_date', new.due_date, 'priority', new.priority,
                             'project_id', new.project_id, 'past_project_id', new.past_project_id,
                             'done', new.done, 'removed', new.removed, 'label', left(new.title, 90)));
  return new;
end;
$$;
revoke execute on function public.log_pmo_task() from public, anon, authenticated;
create trigger trg_pmo_tasks_activity
  after insert or update on public.pmo_tasks
  for each row execute function public.log_pmo_task();

-- Explicit grants (Supabase change from 30 Oct 2026); access is still decided by RLS (PMO only).
grant select on public.pmo_tasks to anon;
grant select, insert, update, delete on public.pmo_tasks to authenticated, service_role;
