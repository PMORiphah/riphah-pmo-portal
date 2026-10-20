-- PCR tab: what each Project Change Request document says (PMO request, 20 Oct 2026). Shown to the PMO before it is run.
--
-- One row per PCR document in a project's Documents (a file whose name contains "PCR" or "change request").
-- Edge function pcr-extract (PMO only) reads the PDF with Gemini and saves what the form says: change name,
-- date, problem, description, justification, impact, deliverables, baseline / additional / revised cost,
-- dates and the approval block. A reading is a draft (confirmed = false) until the PMO presses Confirm on
-- the PCR tab; reading the document again replaces a draft but never a confirmed reading.
-- Who sees it: the PMO always; anyone else who can see the project (can_view_project) only once the PMO has
-- confirmed the reading (PMO decision 20 Oct 2026: unchecked AI readings stay with the PMO).
-- Writes: the PMO only (the function writes with the service key after checking the caller is the PMO).
-- No foreign keys (as project_deliverables and project_todos): a removed project or file must not be
-- blocked by its readings; the tab shows only readings whose file is still in Documents.

create table public.project_pcrs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null,                 -- projects.id
  attachment_id     uuid not null unique,          -- project_attachments.id (one reading per document)
  file_name         text,
  pcr_date          date,
  change_name       text,
  pcr_label         text,                          -- "PCR Name" on the approval page, e.g. "2nd PCR – Additional Budget Requirement"
  strategic_unit    text,
  form_project_id   text,                          -- the Project ID written on the form (may differ from the portal code)
  form_project_name text,
  problem           text,
  description       text,
  justification     text,
  impact            text,
  change_types      text[] not null default '{}',  -- budget / scope / schedule / deliverable / other
  currency          text not null default 'PKR',
  baseline_cost     numeric,
  additional_cost   numeric,
  revised_cost      numeric,
  baseline_duration text,
  start_date        date,
  finish_date       date,
  deliverables      jsonb not null default '[]',   -- [{item, qty, unit_cost, total}]
  approvals         jsonb not null default '[]',   -- [{role, name, status: signed | named | pending | blank}]
  checks            jsonb not null default '[]',   -- notes written by code, e.g. "baseline + additional ≠ revised"
  model             text,
  read_at           timestamptz,
  confirmed         boolean not null default false,
  confirmed_by      uuid,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index project_pcrs_project on public.project_pcrs (project_id);

alter table public.project_pcrs enable row level security;
create policy project_pcrs_select on public.project_pcrs
  for select to authenticated using (confirmed and public.can_view_project(project_id));
create policy project_pcrs_pmo on public.project_pcrs
  for all to authenticated using (public.is_pmo()) with check (public.is_pmo());

-- Server time; a confirmed reading keeps who confirmed it and when.
create or replace function public.trg_project_pcrs_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  if new.confirmed and (tg_op = 'INSERT' or not old.confirmed) then
    new.confirmed_at := now(); new.confirmed_by := coalesce(auth.uid(), new.confirmed_by);
  elsif not new.confirmed then
    new.confirmed_at := null; new.confirmed_by := null;
  end if;
  return new;
end;
$$;
create trigger trg_project_pcrs_stamp
  before insert or update on public.project_pcrs
  for each row execute function public.trg_project_pcrs_stamp();

-- Activity Log in plain words ("PCR read on <project>: <change name>", "PCR confirmed on …").
create or replace function public.log_project_pcr()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role; v_what text;
  v_proj text := coalesce(activity_project_name(new.project_id), 'a project');
begin
  if tg_op = 'INSERT' then v_what := 'read';
  elsif new.confirmed and not old.confirmed then v_what := 'confirmed';
  elsif old.confirmed and not new.confirmed then v_what := 'unconfirmed';
  elsif new.read_at is distinct from old.read_at then v_what := 'read again';
  else return new;
  end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), coalesce(v_name, 'System'), v_role, case when tg_op = 'INSERT' then 'created' else 'updated' end,
          'project_pcrs', new.id::text,
          format('PCR %s on %s: %s', v_what, v_proj, left(coalesce(new.change_name, new.file_name, 'PCR'), 90)),
          jsonb_build_object('project_id', new.project_id, 'file_name', new.file_name, 'model', new.model,
                             'additional_cost', new.additional_cost, 'revised_cost', new.revised_cost,
                             'confirmed', new.confirmed, 'label', left(coalesce(new.change_name, new.file_name, 'PCR'), 90)));
  return new;
end;
$$;
revoke execute on function public.log_project_pcr() from public, anon, authenticated;
create trigger trg_project_pcrs_activity
  after insert or update on public.project_pcrs
  for each row execute function public.log_project_pcr();

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS.
grant select on public.project_pcrs to anon;
grant select, insert, update on public.project_pcrs to authenticated, service_role;

-- After applying: get_advisors (security); check as PMO, Guest, Ali and anon inside a rolled-back transaction.
