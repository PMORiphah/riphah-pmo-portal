-- E-PDD intake (PMO Review), 30 Sep 2026.
-- New PDDs in the E-PDD portal (pmo.riphah.edu.pk, Manage PMO Form) are copied here
-- every 5 minutes by the edge function `epdd-sync`, with their attachments, so the
-- PMO can read them (and, from phase 3, the AI review) in the PMO portal.
-- The PMO still approves or rejects in the E-PDD portal. Nothing here writes back.
-- Everything is PMO only. Only the backend (service role) writes, except the few
-- columns the PMO sets from the page (seen, linked project).
-- The submitter's HR profile (CNIC, birth date, family, address) that the E-PDD
-- portal returns is never stored.

-- ── PDDs ────────────────────────────────────────────────────────────────────
create table public.epdd_pdds (
  id                        bigint primary key,          -- E-PDD record id
  pdd_number                text,
  project_name              text,
  campus                    text,
  initiated_by              text,
  initiated_by_designation  text,
  initiated_by_email        text,
  su_head                   text,
  project_type              text,                        -- Budgeted Project / Non-Budgeted Project
  cost_center               text,
  grand_total               numeric,
  estimated_total           numeric,
  currency                  text,
  start_date                date,
  finish_date               date,
  submitted_on              date,                        -- the PDD's own date
  received_at               timestamptz,                 -- E-PDD "Project Receiving Date & Time"
  epdd_status               text,                        -- e.g. PMO Approved, Not Approved
  epdd_status_code          text,
  queue                     text,                        -- 'manage' = waiting in Manage PMO Form, 'status' = E-PDD Status list
  epdd_url                  text,                        -- view page in the E-PDD portal
  source_created_at         timestamptz,
  source_updated_at         timestamptz,
  content_hash              text,                        -- of the normalised PDD; changes on resubmission
  pdd                       jsonb not null default '{}'::jsonb,  -- normalised form (fields, items, risks, experts, file slots)
  approvals                 jsonb not null default '[]'::jsonb,  -- approval history as shown in the E-PDD portal
  raw                       jsonb not null default '{}'::jsonb,  -- source row, sanitised
  is_history                boolean not null default false,      -- already in the E-PDD portal when intake started
  detail_needed             boolean not null default true,       -- view page (approval history) still to read
  detail_synced_at          timestamptz,
  linked_project_id         uuid references public.projects(id) on delete set null,
  link_source               text,                        -- 'auto' or 'pmo'
  first_seen_at             timestamptz not null default now(),
  last_synced_at            timestamptz,
  changed_at                timestamptz,                 -- content last changed (resubmission)
  seen_at                   timestamptz,
  seen_by                   uuid
);
create index epdd_pdds_queue_idx on public.epdd_pdds (queue, first_seen_at desc);

-- ── Attachments (copied into the private bucket epdd-files) ──────────────────
create table public.epdd_files (
  id            bigserial primary key,
  pdd_id        bigint not null references public.epdd_pdds(id) on delete cascade,
  category      text not null,                           -- general / simpleprocurement / construction / renovation
  title         text,                                    -- slot title, e.g. Quotations
  file_name     text not null,
  source_url    text,
  storage_path  text,
  size_bytes    bigint,
  mime          text,
  sha256        text,
  status        text not null default 'pending',         -- pending / stored / failed
  error         text,
  attempts      int not null default 0,
  fetched_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (pdd_id, category, title, file_name)
);
create index epdd_files_pending_idx on public.epdd_files (status) where status <> 'stored';

-- ── Reviews (filled from phase 3) ───────────────────────────────────────────
create table public.epdd_reviews (
  id                 bigserial primary key,
  pdd_id             bigint not null references public.epdd_pdds(id) on delete cascade,
  content_hash       text,
  status             text not null default 'queued',     -- queued / running / done / failed
  verdict            text,                               -- ready / needs_changes
  summary            text,
  checks             jsonb not null default '[]'::jsonb,
  model              text,
  requests_used      int,
  error              text,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create index epdd_reviews_pdd_idx on public.epdd_reviews (pdd_id, created_at desc);

-- ── Health log of each run ──────────────────────────────────────────────────
create table public.epdd_sync_runs (
  id             bigserial primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  trigger        text,                                   -- cron / manual
  ok             boolean,
  listed         int,
  new_count      int,
  updated_count  int,
  details_read   int,
  files_stored   int,
  files_failed   int,
  error          text
);
create index epdd_sync_runs_started_idx on public.epdd_sync_runs (started_at desc);

-- ── Session cookie for the E-PDD portal (backend only, no policies) ─────────
create table public.epdd_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.epdd_pdds      enable row level security;
alter table public.epdd_files     enable row level security;
alter table public.epdd_reviews   enable row level security;
alter table public.epdd_sync_runs enable row level security;
alter table public.epdd_state     enable row level security;

create policy epdd_pdds_pmo_read      on public.epdd_pdds      for select to authenticated using (public.is_pmo());
create policy epdd_pdds_pmo_update    on public.epdd_pdds      for update to authenticated using (public.is_pmo()) with check (public.is_pmo());
create policy epdd_files_pmo_read     on public.epdd_files     for select to authenticated using (public.is_pmo());
create policy epdd_reviews_pmo_read   on public.epdd_reviews   for select to authenticated using (public.is_pmo());
create policy epdd_sync_runs_pmo_read on public.epdd_sync_runs for select to authenticated using (public.is_pmo());
-- epdd_state: no policies, service role only.

-- Grants (Supabase rule from 30 Oct 2026); RLS still decides access.
grant select on public.epdd_pdds, public.epdd_files, public.epdd_reviews, public.epdd_sync_runs to anon;
grant select, insert, update, delete on public.epdd_pdds, public.epdd_files, public.epdd_reviews, public.epdd_sync_runs to authenticated, service_role;
-- The PMO may only set these columns from the page; everything else comes from the E-PDD portal.
revoke update on public.epdd_pdds from authenticated;
grant update (seen_at, seen_by, linked_project_id, link_source) on public.epdd_pdds to authenticated;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.epdd_state from anon, authenticated;
grant select, insert, update, delete on public.epdd_state to service_role;

-- ── E-PDD login, read from Vault by the backend only ────────────────────────
create or replace function public.get_epdd_credentials()
returns json
language sql stable security definer
set search_path = public, vault
as $$
  select json_build_object(
    'email',    (select decrypted_secret from vault.decrypted_secrets where name = 'epdd_email'    limit 1),
    'password', (select decrypted_secret from vault.decrypted_secrets where name = 'epdd_password' limit 1));
$$;
revoke all on function public.get_epdd_credentials() from public, anon, authenticated;
grant execute on function public.get_epdd_credentials() to service_role;

-- ── Private bucket for the attachments ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('epdd-files', 'epdd-files', false, 52428800)
on conflict (id) do nothing;

create policy epdd_files_pmo_read_storage on storage.objects
  for select to authenticated
  using (bucket_id = 'epdd-files' and public.is_pmo());
