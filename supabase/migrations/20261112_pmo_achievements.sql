-- PMO Achievements (PMO, 12 Nov 2026): the second view of the Achievements/Goals tab (Goals = pmo_tasks).
-- PMO only. Each achievement: title, achieved_on (date the PMO picks), details (long text), category,
-- optional credit (whole team or one member, settings.team_config key), optional project (FY 26-27 or past)
-- and optional value in PKR. created_at/by stamped by the server; "Delete" = removed (kept for the log).

create table public.pmo_achievements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) between 1 and 300),
  achieved_on      date not null,
  details          text check (details is null or length(details) <= 5000),
  category         text not null default 'delivery'
                   check (category in ('delivery','savings','process','recognition','digital','other')),
  credit           text not null default 'team'
                   check (credit in ('team','manager_pmo','exec_pmo','po1','po2')),
  project_id       uuid references public.projects(id) on delete set null,
  past_project_id  uuid references public.past_projects(id) on delete set null,
  value_pkr        numeric check (value_pkr is null or value_pkr >= 0),
  removed          boolean not null default false,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pmo_achievements_one_project check (project_id is null or past_project_id is null)
);
create index pmo_achievements_when on public.pmo_achievements (achieved_on desc) where not removed;

alter table public.pmo_achievements enable row level security;
create policy pmo_achievements_pmo on public.pmo_achievements
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

create or replace function public.trg_pmo_achievements_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by;
  if old.removed then new.removed := true; end if;
  return new;
end;
$$;
create trigger trg_pmo_achievements_stamp
  before insert or update on public.pmo_achievements
  for each row execute function public.trg_pmo_achievements_stamp();

create or replace function public.log_pmo_achievement()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_name text; v_role user_role; v_action text; v_what text;
begin
  if tg_op = 'INSERT' then v_action := 'created'; v_what := 'added';
  elsif new.removed and not old.removed then v_action := 'updated'; v_what := 'deleted';
  elsif (new.title, new.achieved_on, new.details, new.category, new.credit, new.project_id, new.past_project_id, new.value_pkr)
        is distinct from (old.title, old.achieved_on, old.details, old.category, old.credit, old.project_id, old.past_project_id, old.value_pkr)
    then v_action := 'updated'; v_what := 'edited';
  else return new;
  end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role, v_action, 'pmo_achievements', new.id::text,
          format('Achievement %s: %s (achieved %s)', v_what, left(new.title, 90), to_char(new.achieved_on, 'DD Mon YYYY')),
          jsonb_build_object('title', new.title, 'achieved_on', new.achieved_on, 'category', new.category, 'credit', new.credit,
                             'project_id', new.project_id, 'past_project_id', new.past_project_id, 'value_pkr', new.value_pkr,
                             'removed', new.removed, 'label', left(new.title, 90)));
  return new;
end;
$$;
revoke execute on function public.log_pmo_achievement() from public, anon, authenticated;
create trigger trg_pmo_achievements_activity
  after insert or update on public.pmo_achievements
  for each row execute function public.log_pmo_achievement();

-- Explicit grants (Supabase change from 30 Oct 2026); access is still decided by RLS (PMO only).
grant select on public.pmo_achievements to anon;
grant select, insert, update, delete on public.pmo_achievements to authenticated, service_role;
