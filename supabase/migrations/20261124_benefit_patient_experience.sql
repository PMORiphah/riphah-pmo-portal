-- 24 Nov 2026 (PMO): third benefit category on Benefits Realization, Patient Experience.
-- 1. allow the new category; 2. name it in the Activity Log line; 3. backup + move the 14 healthcare entries.

-- 1. category check
alter table public.benefit_realization drop constraint benefit_realization_category_check;
alter table public.benefit_realization add constraint benefit_realization_category_check
  check (category in ('revenue', 'student_experience', 'patient_experience'));

-- 2. Activity Log label (same body as before, one extra branch)
create or replace function public.log_benefit_realization()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
  v_row jsonb := v_new;
  v_changed text[];
  v_name text; v_role user_role; v_what text; v_details jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select key as k from jsonb_each(v_new)
          except select key from jsonb_each(v_old) o where v_new -> o.key = o.value) s
    where k <> all (array['updated_at','updated_by','updated_by_name']);
    if cardinality(v_changed) = 0 then return new; end if;
    v_details := jsonb_build_object('changed', to_jsonb(v_changed),
      'old', (select jsonb_object_agg(k, v_old -> k) from unnest(v_changed) k),
      'new', (select jsonb_object_agg(k, v_new -> k) from unnest(v_changed) k));
    v_what := case when v_changed = array['removed'] then
                (case when new.removed then 'removed' else 'restored' end)
              else array_to_string(v_changed, ', ') || ' updated' end;
  else
    v_details := v_row;
    v_what := 'added';
  end if;
  select username, role into v_name, v_role from user_profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), v_name, v_role,
          case tg_op when 'INSERT' then 'created' else 'updated' end,
          'benefit_realization', v_row ->> 'id',
          format('Benefits Realization: %s on %s (%s, %s)', v_what, v_row ->> 'project_name', v_row ->> 'fiscal_year',
                 case v_row ->> 'category' when 'revenue' then 'Revenue'
                                           when 'patient_experience' then 'Patient Experience'
                                           else 'Student Experience' end),
          v_details || jsonb_build_object('label', v_row ->> 'project_name'));
  return new;
end $function$;

-- 3. data (run separately, after the backup)
-- create table public.backup_20261124_benefit_realization as select * from public.benefit_realization;
-- update public.benefit_realization set category = 'patient_experience'
--  where category = 'revenue' and project_code in (
--   'IT.261107-04','IT.261108-01','IT.261106-01','IT.261105-01','IT.261215-01',
--   'IT.271106-01','IT.271108-01','IT.271107-01','IT.271105-01','IT.271108-02','IT.271107-03',
--   'IT.271107-02','IT.271101-03','IT.271108-03');   -- 14 rows
