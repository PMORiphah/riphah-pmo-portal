-- PCR flag and the PMO's To-Do List per project (PMO request, 20 Oct 2026). Shown to the PMO before it is run.
--
-- 1. projects.pcr: the project has a Project Change Request. Ticked by the PMO in Edit Project; the Projects tab
--    marks these projects. Separate from the existing scope_change ("Change in Scope") flag, at the PMO's choice.
-- 2. project_todos: a to-do list on each project, for the PMO only (row-level security: is_pmo()). Items are
--    never removed from the table: "Remove" sets removed = true, so every step stays in the Activity Log.
--    No foreign key to projects (as project_deliverables): a project removed by a full re-import must not be
--    blocked by its to-dos.

alter table public.projects add column if not exists pcr boolean not null default false;
comment on column public.projects.pcr is 'Project has a Project Change Request (PCR); ticked by the PMO in Edit Project.';

create table public.project_todos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,                         -- projects.id
  title       text not null check (length(btrim(title)) between 1 and 500),
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  removed     boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index project_todos_project on public.project_todos (project_id) where not removed;

alter table public.project_todos enable row level security;
create policy project_todos_pmo on public.project_todos
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

-- Server time for created/updated/done; created_by is the signed-in user; a removed item stays removed.
create or replace function public.trg_project_todos_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    new.done_at := case when new.done then now() else null end;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by; new.project_id := old.project_id;
  if old.removed then new.removed := true; end if;
  if new.done and not old.done then new.done_at := now();
  elsif new.done then new.done_at := old.done_at;
  else new.done_at := null;
  end if;
  return new;
end;
$$;
create trigger trg_project_todos_stamp
  before insert or update on public.project_todos
  for each row execute function public.trg_project_todos_stamp();

-- Activity Log lines in plain words ("To-do added on <project>: <text>"), like the other tables.
create or replace function public.log_project_todo()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role; v_action text; v_what text;
  v_proj text := coalesce(activity_project_name(new.project_id), 'a project');
begin
  if tg_op = 'INSERT' then v_action := 'created'; v_what := 'added';
  elsif new.removed and not old.removed then v_action := 'updated'; v_what := 'removed';
  elsif new.done and not old.done then v_action := 'updated'; v_what := 'done';
  elsif old.done and not new.done then v_action := 'updated'; v_what := 'reopened';
  elsif new.title is distinct from old.title or new.due_date is distinct from old.due_date then v_action := 'updated'; v_what := 'edited';
  else return new;
  end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role, v_action, 'project_todos', new.id::text,
          format('To-do %s on %s: %s', v_what, v_proj, left(new.title, 90)),
          jsonb_build_object('project_id', new.project_id, 'title', new.title, 'due_date', new.due_date,
                             'done', new.done, 'removed', new.removed, 'label', left(new.title, 90)));
  return new;
end;
$$;
revoke execute on function public.log_project_todo() from public, anon, authenticated;
create trigger trg_project_todos_activity
  after insert or update on public.project_todos
  for each row execute function public.log_project_todo();

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS (PMO only).
grant select on public.project_todos to anon;
grant select, insert, update on public.project_todos to authenticated, service_role;

-- After applying: get_advisors (security); check the policy, the grants, and that log_activity on projects
-- logs a PCR tick as "Project … updated" with details.changed = ['pcr'].
