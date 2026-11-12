-- Who made the PR (PMO, 12 Nov 2026): when a Pending PR task is ticked, the PMO picks who made the PR:
-- exec_pmo (Engr. Usman Ahmed Umar), po1 (Mr. Abdullah Azhar) or po2 (Mr. Atisham ul Haq), the settings.team_config keys.
-- Only on pending_pr tasks; required when one is marked done; cleared when it is reopened. Additive only.

alter table public.pmo_tasks add column if not exists pr_made_by text
  check (pr_made_by is null or pr_made_by in ('exec_pmo','po1','po2'));
alter table public.pmo_tasks add constraint pmo_tasks_pr_made_by_list
  check (pr_made_by is null or list = 'pending_pr') not valid;
alter table public.pmo_tasks validate constraint pmo_tasks_pr_made_by_list;
comment on column public.pmo_tasks.pr_made_by is 'Pending PR tasks: who made the PR (team_config key exec_pmo / po1 / po2), chosen when the task is ticked.';

-- The stamp trigger: a Pending PR cannot be ticked without pr_made_by; reopening clears it.
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
    if new.list = 'pending_pr' and new.done and new.pr_made_by is null then
      raise exception 'Choose who made the PR before marking it done' using errcode = 'check_violation';
    end if;
    if not new.done then new.pr_made_by := null; end if;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by;
  if old.removed then new.removed := true; end if;
  if new.done and not old.done then new.done_at := now(); new.done_by := auth.uid();
  elsif new.done then new.done_at := old.done_at; new.done_by := old.done_by;
  else new.done_at := null; new.done_by := null; new.pr_made_by := null;
  end if;
  -- Only when it is being ticked now (a PR completed before this rule may stay without a name).
  if new.list = 'pending_pr' and new.done and not old.done and new.pr_made_by is null then
    raise exception 'Choose who made the PR before marking it done' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Activity Log: name who made the PR when it is completed.
create or replace function public.log_pmo_task()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role; v_action text; v_what text; v_list text; v_by text;
begin
  if tg_op = 'INSERT' then v_action := 'created'; v_what := 'added';
  elsif new.removed and not old.removed then v_action := 'updated'; v_what := 'deleted';
  elsif new.done and not old.done then v_action := 'updated'; v_what := 'completed';
  elsif old.done and not new.done then v_action := 'updated'; v_what := 'reopened';
  elsif (new.list, new.title, new.note, new.priority, new.due_date, new.project_id, new.past_project_id, new.pr_made_by)
        is distinct from (old.list, old.title, old.note, old.priority, old.due_date, old.project_id, old.past_project_id, old.pr_made_by)
    then v_action := 'updated'; v_what := 'edited';
  else return new;
  end if;
  v_list := case new.list when 'pmo_todo' then 'PMO To-Do' when 'pending_pr' then 'Pending PRs'
    else coalesce((select value->new.list->>'name' from public.settings where key = 'team_config'), new.list) end;
  v_by := case when new.pr_made_by is not null and v_what = 'completed'
    then ' · PR made by ' || coalesce((select value->new.pr_made_by->>'name' from public.settings where key = 'team_config'), new.pr_made_by) end;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role, v_action, 'pmo_tasks', new.id::text,
          format('Task %s (%s): %s%s', v_what, v_list, left(new.title, 90), coalesce(v_by, '')),
          jsonb_build_object('list', new.list, 'title', new.title, 'due_date', new.due_date, 'priority', new.priority,
                             'project_id', new.project_id, 'past_project_id', new.past_project_id, 'pr_made_by', new.pr_made_by,
                             'done', new.done, 'removed', new.removed, 'label', left(new.title, 90)));
  return new;
end;
$$;
revoke execute on function public.log_pmo_task() from public, anon, authenticated;
