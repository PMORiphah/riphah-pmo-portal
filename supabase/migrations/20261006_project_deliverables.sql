-- Deliverables tab (PMO, 6 Oct 2026).
--
-- Which CAPEX projects have one: a project linked to an E-PDD PDD that the PMO
-- has approved ("PMO Approved" / "All Approved"), or a project with a charter in
-- its Documents (a file named PDD…, EPDD… or containing "charter", the rule the
-- assistant already uses). Every other project has no Deliverables tab until one
-- of the two becomes true.
--
-- Where the lines come from:
--   source 'pdd'     - the cost table of the project's linked PDD (approved first,
--                      else the latest linked one), with prices. Kept in step with
--                      the PDD: when the PDD changes (e.g. approved at different
--                      prices) the lines are updated and the old price is kept in
--                      prev_unit_cost / prev_total with price_changed_at.
--   source 'charter' - read from the charter file by Gemini (edge function
--                      deliverables-extract) as a draft (confirmed = false) that
--                      the PMO confirms or edits. Set aside (superseded) once PDD
--                      lines arrive.
--   source 'pmo'     - added by hand by the PMO.
-- Status, date and note belong to the portal and survive every sync.

create or replace function public.try_num(v text)
returns numeric language sql immutable as $$
  select case when regexp_replace(coalesce(v, ''), '[^0-9.\-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then regexp_replace(v, '[^0-9.\-]', '', 'g')::numeric end;
$$;

create table public.project_deliverables (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null,                    -- projects.id (no FK: the plan re-import recreates projects)
  source           text not null default 'pmo' check (source in ('pdd', 'charter', 'pmo')),
  pdd_id           bigint,                           -- epdd_pdds.id the line came from
  line_no          integer,
  title            text not null,
  qty              numeric,
  unit             text,
  unit_cost        numeric,
  total            numeric,
  currency         text not null default 'PKR',
  confirmed        boolean not null default true,   -- false = charter draft awaiting the PMO
  superseded       boolean not null default false,  -- no longer in the PDD, replaced by PDD lines, or set aside by the PMO
  prev_unit_cost   numeric,
  prev_total       numeric,
  price_changed_at timestamptz,
  status           text not null default 'not_started'
                     check (status in ('not_started', 'ordered', 'delivered', 'installed', 'handed_over')),
  status_date      date,
  note             text,
  sort_order       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);
create unique index project_deliverables_line on public.project_deliverables (project_id, source, line_no);
create index project_deliverables_project on public.project_deliverables (project_id);

-- Which projects have the tab.
create or replace function public.project_has_deliverables(p uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from projects pr where pr.id = p and pr.portfolio = 'capex')
     and (exists (select 1 from epdd_pdds e
                   where e.linked_project_id = p and e.epdd_status in ('PMO Approved', 'All Approved'))
       or exists (select 1 from project_attachments a
                   where a.project_id = p
                     and (a.file_name ilike 'PDD%' or a.file_name ilike 'EPDD%' or a.file_name ilike '%charter%')));
$$;
grant execute on function public.project_has_deliverables(uuid) to authenticated;

-- Bring a project's PDD lines up to date. Returns the number of PDD lines.
create or replace function public.sync_project_deliverables(p uuid)
returns integer language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  e   record;
  it  jsonb;
  n   integer := 0;
  q numeric; uc numeric; tot numeric;
begin
  if p is null or not project_has_deliverables(p) then return 0; end if;
  select * into e from epdd_pdds
   where linked_project_id = p
   order by (epdd_status in ('PMO Approved', 'All Approved')) desc,
            coalesce(changed_at, source_updated_at, first_seen_at) desc nulls last
   limit 1;
  if e.id is null then return 0; end if;

  for it in select value from jsonb_array_elements(coalesce(e.pdd -> 'items', '[]'::jsonb)) loop
    n := n + 1;
    q := try_num(it ->> 'qty'); uc := try_num(it ->> 'unit_cost'); tot := try_num(it ->> 'total');
    insert into project_deliverables
      (project_id, source, pdd_id, line_no, title, qty, unit, unit_cost, total, currency, sort_order, updated_by)
    values (p, 'pdd', e.id, n, coalesce(nullif(trim(it ->> 'description'), ''), 'Line ' || n), q, it ->> 'unit',
            uc, tot, coalesce(nullif(e.pdd ->> 'currency', ''), nullif(e.currency, ''), 'PKR'), n, null)
    on conflict (project_id, source, line_no) do update set
      pdd_id    = excluded.pdd_id,
      title     = excluded.title,
      unit      = excluded.unit,
      currency  = excluded.currency,
      superseded = false,
      prev_unit_cost = case when project_deliverables.unit_cost is distinct from excluded.unit_cost
                              or project_deliverables.total is distinct from excluded.total
                              or project_deliverables.qty is distinct from excluded.qty
                            then project_deliverables.unit_cost else project_deliverables.prev_unit_cost end,
      prev_total     = case when project_deliverables.unit_cost is distinct from excluded.unit_cost
                              or project_deliverables.total is distinct from excluded.total
                              or project_deliverables.qty is distinct from excluded.qty
                            then project_deliverables.total else project_deliverables.prev_total end,
      price_changed_at = case when project_deliverables.unit_cost is distinct from excluded.unit_cost
                                or project_deliverables.total is distinct from excluded.total
                                or project_deliverables.qty is distinct from excluded.qty
                              then now() else project_deliverables.price_changed_at end,
      qty       = excluded.qty,
      unit_cost = excluded.unit_cost,
      total     = excluded.total,
      updated_at = case when project_deliverables.title is distinct from excluded.title
                          or project_deliverables.qty is distinct from excluded.qty
                          or project_deliverables.unit_cost is distinct from excluded.unit_cost
                          or project_deliverables.total is distinct from excluded.total
                        then now() else project_deliverables.updated_at end;
  end loop;

  -- Lines the PDD no longer has, and charter drafts once PDD lines exist.
  update project_deliverables set superseded = true, updated_at = now()
   where project_id = p and not superseded
     and ((source = 'pdd' and line_no > n) or (source = 'charter' and n > 0));
  return n;
end;
$$;
grant execute on function public.sync_project_deliverables(uuid) to authenticated;

-- Keep the lines in step with the PDD and with new charters.
create or replace function public.trg_deliverables_from_pdd()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.linked_project_id is not null then perform sync_project_deliverables(new.linked_project_id); end if;
  return new;
end;
$$;
create trigger trg_epdd_deliverables
  after insert or update of pdd, epdd_status, linked_project_id on public.epdd_pdds
  for each row execute function public.trg_deliverables_from_pdd();

create or replace function public.trg_deliverables_from_charter()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform sync_project_deliverables(new.project_id);
  return new;
end;
$$;
create trigger trg_attachment_deliverables
  after insert on public.project_attachments
  for each row execute function public.trg_deliverables_from_charter();

-- A project manager may only change status, date and note on their own projects.
create or replace function public.trg_deliverables_guard()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if auth.uid() is null or is_pmo() then return new; end if;
  if (new.project_id, new.source, new.pdd_id, new.line_no, new.title, new.qty, new.unit, new.unit_cost,
      new.total, new.currency, new.confirmed, new.superseded, new.prev_unit_cost, new.prev_total,
      new.price_changed_at, new.sort_order)
     is distinct from
     (old.project_id, old.source, old.pdd_id, old.line_no, old.title, old.qty, old.unit, old.unit_cost,
      old.total, old.currency, old.confirmed, old.superseded, old.prev_unit_cost, old.prev_total,
      old.price_changed_at, old.sort_order) then
    raise exception 'Only the PMO can change a deliverable''s item, quantity or price';
  end if;
  return new;
end;
$$;
create trigger trg_project_deliverables_guard
  before update on public.project_deliverables
  for each row execute function public.trg_deliverables_guard();

alter table public.project_deliverables enable row level security;
create policy deliverables_select on public.project_deliverables
  for select using (can_view_project(project_id));
create policy deliverables_insert on public.project_deliverables
  for insert with check (is_pmo());
create policy deliverables_update on public.project_deliverables
  for update using (is_pmo() or is_assigned(project_id)) with check (is_pmo() or is_assigned(project_id));
-- No removal policy: the PMO sets a line aside (superseded = true) instead, which can be undone.

grant select on public.project_deliverables to anon;
grant select, insert, update on public.project_deliverables to authenticated, service_role;

create trigger trg_project_deliverables_activity
  after insert or update on public.project_deliverables
  for each row execute function public.log_activity();

-- First fill: PDD lines for every project that has the tab now.
select sync_project_deliverables(p.id) from projects p where project_has_deliverables(p.id);

-- Applied as project_deliverables_grants: nobody signed out can call these, and
-- only the database (triggers) and the service role run the sync.
revoke execute on function public.project_has_deliverables(uuid) from public, anon;
grant execute on function public.project_has_deliverables(uuid) to authenticated, service_role;
revoke execute on function public.sync_project_deliverables(uuid) from public, anon, authenticated;
grant execute on function public.sync_project_deliverables(uuid) to service_role;
revoke execute on function public.trg_deliverables_from_pdd() from public, anon, authenticated;
revoke execute on function public.trg_deliverables_from_charter() from public, anon, authenticated;
alter function public.try_num(text) set search_path to 'public', 'pg_temp';
