-- Benefits Realization page (PMO, 5 Nov 2026; requested by the Chancellor and senior management).
-- One row per entry of the PMO's list: FY 25-26 and FY 26-27 projects, each tagged Revenue or
-- Student Experience. The list is fixed (nothing is added automatically). A row is shown to guests only
-- once its project is finished:
--   FY 26-27: the CAPEX project's stage is Closed;
--   FY 25-26: the project is not open on Past Projects.
-- The PMO sees every row, with the reason the others are still waiting.

create table public.benefit_realization (
  id            uuid primary key default gen_random_uuid(),
  sr            integer,                                  -- order as on the PMO's list
  fiscal_year   text not null check (fiscal_year in ('FY 25-26', 'FY 26-27')),
  category      text not null check (category in ('revenue', 'student_experience')),
  project_code  text not null,
  project_name  text not null,
  campus        text,
  budget        numeric(16,2) check (budget is null or budget >= 0),
  revenue       numeric(16,2) check (revenue is null or revenue >= 0),
  revenue_as_of date,
  description   text,
  removed       boolean not null default false,          -- "Remove" on the page; rows are never erased
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_by_name text,
  updated_at    timestamptz not null default now(),
  unique (fiscal_year, category, project_code),
  -- Revenue figures belong to Revenue entries only.
  constraint benefit_revenue_only check (category = 'revenue' or (revenue is null and revenue_as_of is null))
);

-- Why a row is (not yet) shown. Security definer so the guest rule can look at Past Projects,
-- which guests cannot read; it returns only a status word, never project data.
create or replace function public.benefit_status(p_fy text, p_code text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_fy = 'FY 26-27' then
      coalesce((select case when p.workflow_stage = 'closed' then 'eligible'
                            else 'stage:' || p.workflow_stage::text end
                from projects p where p.code = p_code limit 1), 'not_in_portal')
    when exists (select 1 from past_projects pp where pp.code = p_code and pp.status = 'open')
      then 'open_past'
    else 'eligible'
  end
$$;
revoke all on function public.benefit_status(text, text) from public, anon;
grant execute on function public.benefit_status(text, text) to authenticated, service_role;

-- Server stamps.
create or replace function public.trg_benefit_realization_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_name := (select coalesce(full_name, username) from user_profiles where id = auth.uid());
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger trg_benefit_realization_stamp before insert or update on public.benefit_realization
  for each row execute function public.trg_benefit_realization_stamp();

-- Activity Log: readable lines ("Benefits Realization: budget updated on <project> (FY 25-26, Revenue)").
create or replace function public.log_benefit_realization()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
                 case v_row ->> 'category' when 'revenue' then 'Revenue' else 'Student Experience' end),
          v_details || jsonb_build_object('label', v_row ->> 'project_name'));
  return new;
end $$;

-- Access: the PMO reads and writes everything; guests read finished entries only; PMs and anon nothing.
alter table public.benefit_realization enable row level security;
create policy benefit_pmo_all on public.benefit_realization for all to authenticated
  using (is_pmo()) with check (is_pmo());
create policy benefit_guest_select on public.benefit_realization for select to authenticated
  using (is_guest() and not removed and benefit_status(fiscal_year, project_code) = 'eligible');

-- Each row with its status (the page reads this). security_invoker, so the table's policies apply.
create view public.benefit_realization_list with (security_invoker = true) as
  select b.*, benefit_status(b.fiscal_year, b.project_code) as status
  from public.benefit_realization b;

-- Explicit grants (Supabase change from 30 Oct 2026); RLS still decides.
grant select on public.benefit_realization, public.benefit_realization_list to anon;
grant all on public.benefit_realization, public.benefit_realization_list to authenticated, service_role;

-- The PMO's list (image of 5 Nov 2026). Budgets blank except RIHCA Kiosk (portal budget).
insert into public.benefit_realization (sr, fiscal_year, category, project_code, project_name, campus, budget) values
  ( 1, 'FY 25-26', 'student_experience', 'RU.262197-27', 'Bracket Fan for classrooms and computer labs', 'I-14', null),
  ( 2, 'FY 25-26', 'student_experience', 'RU.262109-02', 'Upgradation of Computer Lab (FC) (I-14)', 'I-14', null),
  ( 3, 'FY 25-26', 'student_experience', 'RU.262197-14', 'Outdoor Gym Establishment (I-14)', 'I-14', null),
  ( 4, 'FY 25-26', 'student_experience', 'RU.262197-10', 'Development of Cricket Pitch at I-14', 'I-14', null),
  ( 5, 'FY 25-26', 'student_experience', 'RU.262197-11', 'Badminton & Basketball Court (I-14)', 'I-14', null),
  ( 6, 'FY 25-26', 'student_experience', 'IT.261197-13', 'RIPS G7 Renovation and Expansion', 'G-7', null),
  ( 7, 'FY 25-26', 'student_experience', 'IT.261197-20', 'Upgrad of IT Labs F&F (Al-Mizan)', 'Al-Mizan', null),
  ( 8, 'FY 25-26', 'student_experience', 'IT.261397-01', 'Campus Shifting (Malakand to Swat)', 'Malakand', null),
  ( 9, 'FY 25-26', 'student_experience', 'RU.262197-03', 'Wireless Internet for Gulberg Cafe (GGC)', 'GGC', null),
  (10, 'FY 25-26', 'student_experience', 'RU.262197-04', 'Provision of Facilities for GGC', 'GGC', null),
  (11, 'FY 25-26', 'student_experience', 'IT.261297-04', 'Renovation & Upgradation of QIE Campus', 'Lahore', null),
  (12, 'FY 25-26', 'student_experience', 'IT.261297-02', 'Ferozpur Campus Seating Benches', 'Lahore', null),
  (13, 'FY 25-26', 'revenue', 'IT.261104-03', 'Launch of MS AI in Pharma Health G7', 'G-7', null),
  (14, 'FY 25-26', 'revenue', 'RU.262112-04', 'AI Lab_Computing Department (RII Female)', 'GGC', null),
  (15, 'FY 25-26', 'revenue', 'RU.262112-03', 'Cyber Sec. Lab_Comp. Dept. (RII Female)', 'GGC', null),
  (16, 'FY 25-26', 'revenue', 'IT.261397-01', 'Campus Shifting (Malakand to Swat)', 'Malakand', null),
  (17, 'FY 25-26', 'revenue', 'IT.261107-04', 'Upgradation of Hospital Facilities (Phase 1) (PRH)', 'PRH', null),
  (18, 'FY 25-26', 'revenue', 'IT.261108-01', 'Upgradation of Hospital Facilities (Phase 1) (RIH)', 'RIH', null),
  (19, 'FY 25-26', 'revenue', 'IT.261106-01', 'Upgradation of Hospital Facilities (Phase 1) (MHH)', 'MHH', null),
  (20, 'FY 25-26', 'revenue', 'IT.261208-01', 'Behavioral Research Equipment (Polygraph) Acquisition Project (RICPP-Gulberg Lhr)', 'Lahore', null),
  (21, 'FY 25-26', 'revenue', 'IT.261202-01', '5th ICRS & 2nd ICAHS (Lhr)', 'Lahore', null),
  (22, 'FY 25-26', 'revenue', 'IT.261215-01', 'Upgrad. Clinical & Rehab Equip RMC (Lhr)', 'Lahore', null),
  (23, 'FY 25-26', 'revenue', 'IT.261105-01', 'Upgradation of Hospital Facilities (Phase 1) (IIDH)', 'G-7', null),
  (24, 'FY 25-26', 'revenue', 'IT.251200-03', 'Establishment of Co-Working Spaces (Lhr)', 'Lahore', null),
  ( 1, 'FY 26-27', 'student_experience', 'IT.261297-03', 'Estb. of Ferozpur Campus LHR (Ph-3)', 'Lahore', null),
  ( 2, 'FY 26-27', 'student_experience', 'IT.261297-04', 'Renovation & Upgradation of QIE Campus', 'Lahore', null),
  ( 3, 'FY 26-27', 'student_experience', 'RU.272197-02', 'Provision of Facilities (GGC)', 'GGC', null),
  ( 4, 'FY 26-27', 'student_experience', 'IT.271197-01', 'Renov. of Boys Common Rooms (PMDC) Al-Mizan', 'Al-Mizan', null),
  ( 5, 'FY 26-27', 'revenue', 'RU.272115-01', 'RIHCA Kiosk for Ministry of Health (F6)', 'G-7', 324500),
  ( 6, 'FY 26-27', 'revenue', 'RU.272115-02', 'Kiosk Display Chiller & Ref. (Al-Mizan)', 'Al-Mizan', null),
  ( 7, 'FY 26-27', 'revenue', 'IT.271106-01', 'Upgrad. of Hosp. Facilities (Ph. 2) (MHH)', 'MHH', null),
  ( 8, 'FY 26-27', 'revenue', 'IT.271108-01', 'Upgrad. of Hosp. Facilities (Ph. 2) (RIH)', 'RIH', null),
  ( 9, 'FY 26-27', 'revenue', 'IT.271108-02', 'Upgrad. Work in RIH for PMDC', 'RIH', null),
  (10, 'FY 26-27', 'revenue', 'IT.271105-01', 'Upgrad. of IIDH Facilities', 'G-7', null),
  (11, 'FY 26-27', 'revenue', 'IT.271107-01', 'Upgrad. of Hosp. Facilities (Ph. 2) (PRH)', 'PRH', null),
  (12, 'FY 26-27', 'revenue', 'IT.271107-03', 'Upgrad. Work in PRH for PMDC', 'PRH', null),
  (13, 'FY 26-27', 'revenue', 'IT.271101-01', 'Basic Sciences Lab Equipment, Al-Mizan (PMDC)', 'Al-Mizan', null),
  (14, 'FY 26-27', 'revenue', 'IT.271107-04', 'Procurement of Skill Lab Equipment (PMDC)', 'Al-Mizan', null),
  (15, 'FY 26-27', 'revenue', 'IT.271107-02', 'Maint. & Up. of Demo Rooms (PMDC) (AM_PRH)', 'PRH', null),
  (16, 'FY 26-27', 'revenue', 'IT.271197-03', 'Upgrad. of Labs & Corridors (PMDC) (AM)', 'Al-Mizan', null),
  (17, 'FY 26-27', 'revenue', 'IT.271101-02', 'Procurement of Multidisciplinary Lab, Al-Mizan (PMDC)', 'Al-Mizan', null),
  (18, 'FY 26-27', 'revenue', 'IT.271101-03', 'Procurement of 3D Anatomy Digital Interactive Tables', 'Al-Mizan', null),
  (19, 'FY 26-27', 'revenue', 'IT.271108-03', 'LCD & Sound Sys in Lec Hall (PMDC_AM_RIH)', 'RIH', null);

-- Activity Log from here on (created after the seed, so loading the list writes no 43 log lines).
create trigger trg_benefit_realization_activity after insert or update on public.benefit_realization
  for each row execute function public.log_benefit_realization();
