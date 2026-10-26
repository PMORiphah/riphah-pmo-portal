-- Inventory (PMO, 26 Oct 2026). Shown to the PMO before it is run.
--
-- One row per active purchase-order line from SAP's ME2J report (purchase orders by project), FY 2025-26 first,
-- FY 2026-27 later. Key = PO number + PO item, so a later export of the same report updates lines instead of
-- duplicating them. Lines SAP has deleted (deletion flag "L") are not loaded.
-- Only the PMO can see or change it (RLS), as on Cashflows and the Activity Log.
-- Plants (PMO, 26 Oct 2026): 1100 Trust Islamabad/Rawalpindi, 1200 Trust Lahore, 1300 Trust Malakand, 2100 Riphah.
-- The ME2J "Storage location" column (1101, 1110, ...) is the profit centre. Material groups stay as their numbers.
-- Services (item category D: design, civil works) are kept and marked; the page shows goods by default.
-- No Activity Log trigger on this table: an import writes one summary line instead of thousands.
-- Additive only: nothing is removed.

create table public.inventory_items (
  id                uuid primary key default gen_random_uuid(),
  po_number         text not null,                 -- Purchasing Document
  po_item           text not null,                 -- Item (10, 20, ...)
  fiscal_year       text not null,                 -- 'FY 25-26', 'FY 26-27'
  sap_project_code  text not null,                 -- WBS element, e.g. IT.261107-04
  sap_project_name  text,
  sap_network       text,
  project_id        uuid,                          -- projects.id when the code is an FY 26-27 project (no FK, as elsewhere)
  past_project_id   uuid,                          -- past_projects.id when the code is on Past Projects
  po_date           date,                          -- Document Date
  po_type           text,                          -- ZPRJ / ZLOC / ZSRV / ZAST
  purchasing_group  text,
  supplier_code     text,
  supplier_name     text,
  material          text,
  description       text not null,                 -- Short Text
  material_group    text,
  is_service        boolean not null default false, -- item category D
  plant             text,
  profit_center     text,                          -- ME2J "Storage location"
  qty               numeric,
  unit              text,
  net_price         numeric,
  total             numeric,
  currency          text not null default 'PKR',
  open_qty          numeric not null default 0,    -- Still to be delivered (qty)
  open_value        numeric not null default 0,    -- Still to be delivered (value)
  to_invoice_qty    numeric not null default 0,
  to_invoice_value  numeric not null default 0,
  delivery_status   text generated always as (
                      case when coalesce(open_qty, 0) <= 0 and coalesce(open_value, 0) <= 0 then 'delivered'
                           when coalesce(qty, 0) > 0 and open_qty > 0 and open_qty < qty then 'partly'
                           else 'not_delivered' end) stored,
  sap_deleted       boolean not null default false, -- set by a later import when SAP has deleted the line (PMO confirms)
  raw               jsonb,                          -- the original ME2J row, every column
  source            text,                           -- file name and row number
  imported_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (po_number, po_item)
);
create index inventory_items_project on public.inventory_items (sap_project_code);
create index inventory_items_fy on public.inventory_items (fiscal_year);

alter table public.inventory_items enable row level security;
create policy inventory_pmo on public.inventory_items
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

create or replace function public.trg_inventory_items_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.imported_at := now(); end if;
  return new;
end;
$$;
create trigger trg_inventory_items_stamp
  before insert or update on public.inventory_items
  for each row execute function public.trg_inventory_items_stamp();

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS (PMO only).
grant select on public.inventory_items to anon;
grant all on public.inventory_items to authenticated, service_role;

-- After applying: get_advisors (security); in a rolled-back transaction check PMO reads/writes and Guest, Ali, anon read 0
-- and cannot write.
