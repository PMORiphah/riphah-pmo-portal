-- PMO Achievements: credit several team members (PMO, 15 Nov 2026). Additive.
-- credits = the members credited (empty = the whole PMO team). The single `credit` column is kept for older
-- readers and set by the stamp trigger: 'team' when credits is empty, else the first member credited.
alter table public.pmo_achievements add column if not exists credits text[] not null default '{}';
alter table public.pmo_achievements add constraint pmo_achievements_credits_check
  check (credits <@ array['head_pmo','manager_pmo','exec_pmo','po1','po2']::text[]);
update public.pmo_achievements set credits = array[credit] where credit <> 'team' and credits = '{}';

create or replace function public.trg_pmo_achievements_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  -- members in the PMO's order, no repeats
  new.credits := coalesce(array(select k from unnest(array['head_pmo','manager_pmo','exec_pmo','po1','po2']) with ordinality u(k, n)
                                 where k = any(new.credits) order by n), '{}');
  new.credit := case when cardinality(new.credits) = 0 then 'team' else new.credits[1] end;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by;
  if old.removed then new.removed := true; end if;
  return new;
end;
$$;

create or replace function public.log_pmo_achievement()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_name text; v_role user_role; v_action text; v_what text;
begin
  if tg_op = 'INSERT' then v_action := 'created'; v_what := 'added';
  elsif new.removed and not old.removed then v_action := 'updated'; v_what := 'deleted';
  elsif (new.title, new.achieved_on, new.details, new.category, new.credits, new.project_id, new.past_project_id, new.value_pkr)
        is distinct from (old.title, old.achieved_on, old.details, old.category, old.credits, old.project_id, old.past_project_id, old.value_pkr)
    then v_action := 'updated'; v_what := 'edited';
  else return new;
  end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role, v_action, 'pmo_achievements', new.id::text,
          format('Achievement %s: %s (achieved %s)', v_what, left(new.title, 90), to_char(new.achieved_on, 'DD Mon YYYY')),
          jsonb_build_object('title', new.title, 'achieved_on', new.achieved_on, 'category', new.category, 'credit', new.credit,
                             'credits', to_jsonb(new.credits),
                             'project_id', new.project_id, 'past_project_id', new.past_project_id, 'value_pkr', new.value_pkr,
                             'removed', new.removed, 'label', left(new.title, 90)));
  return new;
end;
$$;
revoke execute on function public.log_pmo_achievement() from public, anon, authenticated;
