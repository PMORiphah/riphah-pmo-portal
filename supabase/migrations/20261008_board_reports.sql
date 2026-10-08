-- Board reports (PMO, 8 Oct 2026). Shown to the PMO before it is run.
--
-- A report is one month's figures, frozen when the PMO publishes it, so the
-- next month compares against exactly what was shared. The figures are
-- computed in the browser (src/reportCalc.js) and stored as JSON here.
--   kind 'monthly'        - built and published by the PMO
--   kind 'reconstructed'  - an earlier month-end rebuilt from the Activity Log
--                           (Aug and Sep 2026), kept only as a baseline
--   status draft | published | discarded   (no row is ever removed; a draft
--                           the PMO throws away is marked discarded)
-- Recipients are chosen by the PMO; each gets a push, a pop-up at the next
-- sign-in and, when the PMO presses Email report, an email. A recipient only
-- ever sees the published reports shared with them.

create table public.board_reports (
  id            uuid primary key default gen_random_uuid(),
  period        date not null,                       -- first day of the month reported
  title         text not null,
  kind          text not null default 'monthly' check (kind in ('monthly', 'reconstructed')),
  status        text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  as_at         timestamptz not null,                -- the moment the figures describe
  figures       jsonb not null,
  calc_version  text not null,
  note          text,                                -- the PMO's own line on the summary page
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  published_by  uuid,
  published_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index board_reports_period on public.board_reports (period desc);

create table public.board_report_recipients (
  report_id   uuid not null,                         -- board_reports.id
  user_id     uuid not null,                         -- user_profiles.id
  added_by    uuid default auth.uid(),
  added_at    timestamptz not null default now(),
  removed     boolean not null default false,        -- unshared by the PMO
  seen_at     timestamptz,                           -- opened by the recipient
  pushed_at   timestamptz,
  emailed_at  timestamptz,
  primary key (report_id, user_id)
);
create index board_report_recipients_user on public.board_report_recipients (user_id);

-- Is the signed-in user a current recipient of this published report?
create or replace function public.is_report_recipient(r uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from board_report_recipients x
                  where x.report_id = r and x.user_id = auth.uid() and not x.removed);
$$;
revoke execute on function public.is_report_recipient(uuid) from public, anon;
grant execute on function public.is_report_recipient(uuid) to authenticated, service_role;

alter table public.board_reports enable row level security;
create policy board_reports_select on public.board_reports
  for select using (is_pmo() or (status = 'published' and is_report_recipient(id)));
create policy board_reports_insert on public.board_reports
  for insert with check (is_pmo());
create policy board_reports_update on public.board_reports
  for update using (is_pmo()) with check (is_pmo());

alter table public.board_report_recipients enable row level security;
create policy board_report_recipients_select on public.board_report_recipients
  for select using (is_pmo() or user_id = auth.uid());
create policy board_report_recipients_insert on public.board_report_recipients
  for insert with check (is_pmo());
create policy board_report_recipients_update on public.board_report_recipients
  for update using (is_pmo() or user_id = auth.uid()) with check (is_pmo() or user_id = auth.uid());

-- A recipient may only mark a report as opened.
create or replace function public.trg_board_recipient_guard()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or is_pmo() then return new; end if;
  if (new.report_id, new.user_id, new.added_by, new.added_at, new.removed, new.pushed_at, new.emailed_at)
     is distinct from
     (old.report_id, old.user_id, old.added_by, old.added_at, old.removed, old.pushed_at, old.emailed_at) then
    raise exception 'Only the PMO can change who receives a report';
  end if;
  return new;
end;
$$;
create trigger trg_board_recipient_guard
  before update on public.board_report_recipients
  for each row execute function public.trg_board_recipient_guard();

create or replace function public.trg_board_reports_touch()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger trg_board_reports_touch
  before update on public.board_reports
  for each row execute function public.trg_board_reports_touch();

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS.
grant select on public.board_reports, public.board_report_recipients to anon;
grant select, insert, update on public.board_reports, public.board_report_recipients to authenticated, service_role;

-- Activity Log: sharing is recorded by the trigger; building and publishing a
-- report are written as one line by the page (the figures JSON is not copied).
create trigger trg_board_report_recipients_activity
  after insert or update on public.board_report_recipients
  for each row execute function public.log_activity();
