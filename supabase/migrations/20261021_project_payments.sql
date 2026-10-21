-- Itemised payments for investment projects (PMO, 21 Oct 2026). Shown to the PMO before it is run.
--
-- The Investments tab gets a 6th card, "Payments Made", after Released. It shows the total of the payments
-- listed here; clicking it opens every payment in full (date, department, payee, particulars, gross, tax,
-- net, project). First rows: the 4 investment payments highlighted in the FY 2026-27 Finance payment record
-- (QCH1 & 2 RMC Basements 3, DBD-REIT 1), gross as the PMO decided. CAPEX projects are not itemised here:
-- their payments go into projects.payments_made as before (PMO, 21 Oct 2026).
-- Who sees it: whoever can see the project (can_view_project: PMO, guests, the project's own manager).
-- Writes: the PMO only. No foreign keys (as project_pcrs): a removed project must not be blocked by its rows.
-- Additive only: nothing is removed.

create table public.project_payments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,              -- projects.id
  paid_on     date,
  dept        text,                       -- department / cost centre written on the record
  payee       text,                       -- vendor or person; CNIC and NTN numbers are not stored
  particulars text,
  gross       numeric(14,2) not null check (gross >= 0),
  tax         numeric(14,2) check (tax >= 0),
  net         numeric(14,2) check (net >= 0),
  source      text,                       -- e.g. "FY 2026-27 payment record, row 208"
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index project_payments_project on public.project_payments (project_id, paid_on);

alter table public.project_payments enable row level security;
create policy project_payments_select on public.project_payments
  for select to authenticated using (public.can_view_project(project_id));
create policy project_payments_pmo on public.project_payments
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

create or replace function public.trg_project_payments_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end;
$$;
create trigger trg_project_payments_stamp
  before insert or update on public.project_payments
  for each row execute function public.trg_project_payments_stamp();

-- Activity Log in plain words ("Payment added on <project>: PKR 305,000 to <payee>").
create or replace function public.log_project_payment()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role;
  v_proj text := coalesce(activity_project_name(new.project_id), 'a project');
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return new; end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), coalesce(v_name, 'System'), v_role, case when tg_op = 'INSERT' then 'created' else 'updated' end,
          'project_payments', new.id::text,
          format('Payment %s on %s: PKR %s to %s', case when tg_op = 'INSERT' then 'added' else 'edited' end, v_proj,
                 to_char(new.gross, 'FM999,999,999,990.00'), left(coalesce(new.payee, '—'), 80)),
          jsonb_build_object('project_id', new.project_id, 'paid_on', new.paid_on, 'gross', new.gross,
                             'tax', new.tax, 'net', new.net, 'payee', new.payee, 'source', new.source,
                             'old', case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' end));
  return new;
end;
$$;
revoke execute on function public.log_project_payment() from public, anon, authenticated;
create trigger trg_project_payments_activity
  after insert or update on public.project_payments
  for each row execute function public.log_project_payment();

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS.
grant select on public.project_payments to anon;
grant select, insert, update on public.project_payments to authenticated, service_role;

-- After applying: get_advisors (security); check as PMO, Guest, Ali and anon inside a rolled-back transaction.
