-- PCR deliverables in the project's Deliverables tab (PMO, 17 Nov 2026).
-- After a PMO admin confirms a PCR reading, they can add its deliverable lines to the Deliverables tab
-- (source 'pcr', linked to the reading by pcr_id). The PDD sync never touches these lines.

alter table public.project_deliverables drop constraint project_deliverables_source_check;
alter table public.project_deliverables add constraint project_deliverables_source_check
  check (source = any (array['pdd', 'charter', 'pmo', 'pcr']));
alter table public.project_deliverables add column if not exists pcr_id uuid;
create index if not exists project_deliverables_pcr on public.project_deliverables (pcr_id) where pcr_id is not null;

-- The tab also shows on a project whose only deliverables came from a PCR.
create or replace function public.project_has_deliverables(p uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select exists (select 1 from projects pr where pr.id = p and pr.portfolio = 'capex')
     and (exists (select 1 from epdd_pdds e
                   where e.linked_project_id = p and e.epdd_status in ('PMO Approved', 'All Approved'))
       or exists (select 1 from project_attachments a
                   where a.project_id = p
                     and (a.file_name ilike 'PDD%' or a.file_name ilike 'EPDD%' or a.file_name ilike '%charter%'))
       or exists (select 1 from project_deliverables d
                   where d.project_id = p and d.source = 'pcr' and not d.superseded));
$function$;

-- Add a confirmed PCR reading's lines (PMO admins only). Adding again after a removal brings the same
-- lines back with their ticks and notes. Returns the number of lines now in the tab from this PCR.
create or replace function public.add_pcr_deliverables(p_pcr uuid)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare r project_pcrs; it jsonb; n int := 0; base_line int; base_sort int; t text;
begin
  if not is_pmo() then raise exception 'Only the PMO can add PCR deliverables'; end if;
  select * into r from project_pcrs where id = p_pcr;
  if r.id is null then raise exception 'PCR reading not found'; end if;
  if not r.confirmed then raise exception 'Confirm the PCR reading first'; end if;
  if exists (select 1 from project_deliverables where pcr_id = p_pcr) then
    update project_deliverables set superseded = false where pcr_id = p_pcr and superseded;
    return (select count(*) from project_deliverables where pcr_id = p_pcr and not superseded);
  end if;
  select coalesce(max(line_no), 0) into base_line from project_deliverables where project_id = r.project_id and source = 'pcr';
  select coalesce(max(sort_order), 0) into base_sort from project_deliverables where project_id = r.project_id;
  for it in select value from jsonb_array_elements(coalesce(r.deliverables, '[]'::jsonb)) loop
    t := nullif(trim(coalesce(it ->> 'item', '')), '');
    continue when t is null;
    n := n + 1;
    insert into project_deliverables (project_id, source, pcr_id, line_no, title, qty, unit, unit_cost, total, currency,
                                      confirmed, sort_order, status)
    values (r.project_id, 'pcr', r.id, base_line + n, left(t, 500), try_num(it ->> 'qty'), nullif(trim(it ->> 'unit'), ''),
            try_num(it ->> 'unit_cost'), try_num(it ->> 'total'), coalesce(nullif(r.currency, ''), 'PKR'),
            true, base_sort + n, 'not_started');
  end loop;
  return n;
end $function$;

-- Take them out of the tab again (set aside; ticks and notes are kept).
create or replace function public.remove_pcr_deliverables(p_pcr uuid)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare n int;
begin
  if not is_pmo() then raise exception 'Only the PMO can remove PCR deliverables'; end if;
  update project_deliverables set superseded = true where pcr_id = p_pcr and not superseded;
  get diagnostics n = row_count;
  return n;
end $function$;

revoke execute on function public.add_pcr_deliverables(uuid), public.remove_pcr_deliverables(uuid) from public, anon;
grant execute on function public.add_pcr_deliverables(uuid), public.remove_pcr_deliverables(uuid) to authenticated, service_role;
