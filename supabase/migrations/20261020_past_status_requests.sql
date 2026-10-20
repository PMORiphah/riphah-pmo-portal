-- Past Projects "Ask status" (PMO, 20 Oct 2026; plan docs/plans/status-requests.md). Shown to the PMO before it is run.
--
-- A request and its answer are posts in the project's existing Follow-up conversation (past_project_updates),
-- so the thread, unread badges, last_followed_up, the Activity Log and notify-past keep working unchanged.
--   kind = 'message'         an ordinary post (every existing row)
--   kind = 'status_request'  "Ask status", by the PMO or a past-project viewer
--   kind = 'status'          the manager's answer: % completed (0-100) and a justification, both required
-- The PMO's own "Why still open" field (past_projects.reason_open) is not touched (PMO decision 20 Oct 2026).
-- No DROP or DELETE anywhere.

alter table public.past_project_updates
  add column if not exists kind          text not null default 'message',
  add column if not exists pct_complete  integer,
  add column if not exists justification text;

alter table public.past_project_updates
  add constraint past_updates_kind_chk check (kind in ('message', 'status_request', 'status')),
  add constraint past_updates_status_chk check (
    case when kind = 'status'
         then pct_complete between 0 and 100 and length(btrim(coalesce(justification, ''))) >= 10
         else pct_complete is null and justification is null end);

-- Who may post which kind. A restrictive policy is ANDed with the existing insert policies
-- (past_updates_all, past_updates_pm_insert, past_updates_viewer_insert), which stay as they are.
create policy past_updates_kind_guard on public.past_project_updates as restrictive
  for insert to authenticated
  with check (
    kind = 'message'
    or (kind = 'status_request' and (public.is_pmo() or public.is_past_viewer()))
    or (kind = 'status' and public.is_past_pm(past_project_id))
  );

-- A request or an answer cannot be rewritten afterwards (only the PMO can update rows at all; this keeps
-- the kind and the two answer fields fixed even for the PMO, so the record stays what the manager sent).
create or replace function public.guard_past_update_kind()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind is distinct from old.kind or new.pct_complete is distinct from old.pct_complete
     or new.justification is distinct from old.justification or new.past_project_id is distinct from old.past_project_id then
    raise exception 'A status request or answer cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_past_update_kind_guard
  before update on public.past_project_updates
  for each row execute function public.guard_past_update_kind();

-- past_project_summary gets the status columns at the end (the page already reads it with select=*).
--   status_requested_at / _by    the latest request
--   status_pending_since         the first request after the latest answer (null when nothing is waiting)
--   status_at, status_pct, status_justification, status_by   the latest answer
create or replace view public.past_project_summary with (security_invoker = true) as
 select pp.id, pp.code, pp.name, pp.campus, pp.fiscal_year, pp.approved_amount, pp.released_amount, pp.pm_user_id,
    pp.status, pp.reason_open, pp.notes, pp.last_followed_up, pp.created_by, pp.created_at, pp.updated_at,
    coalesce(up.full_name, up.username) as pm_name,
    up.email as pm_email,
    (select count(*) from past_project_updates u where u.past_project_id = pp.id) as update_count,
    (select max(u.created_at) from past_project_updates u where u.past_project_id = pp.id) as last_update_at,
    (select u.author_role from past_project_updates u where u.past_project_id = pp.id order by u.created_at desc limit 1) as last_update_role,
    case when pp.last_followed_up is null then null::integer else current_date - pp.last_followed_up end as days_since_followup,
    pp.start_date, pp.end_date, pp.actual_start_date, pp.actual_end_date, pp.revised_end_date, pp.budget_release_date,
    rq.created_at as status_requested_at,
    rq.author_name as status_requested_by,
    (select min(u.created_at) from past_project_updates u
      where u.past_project_id = pp.id and u.kind = 'status_request'
        and (st.created_at is null or u.created_at > st.created_at)) as status_pending_since,
    st.created_at as status_at,
    st.pct_complete as status_pct,
    st.justification as status_justification,
    st.author_name as status_by
   from past_projects pp
     left join user_profiles up on up.id = pp.pm_user_id
     left join lateral (select u.created_at, u.author_name from past_project_updates u
                         where u.past_project_id = pp.id and u.kind = 'status_request'
                         order by u.created_at desc limit 1) rq on true
     left join lateral (select u.created_at, u.pct_complete, u.justification, u.author_name from past_project_updates u
                         where u.past_project_id = pp.id and u.kind = 'status'
                         order by u.created_at desc limit 1) st on true;

-- After applying: get_advisors (security); in a rolled-back transaction check that a viewer and the PMO can
-- ask, the project's manager (a PM, and the guest who manages past projects) can answer only with both fields,
-- another manager cannot answer, a viewer cannot answer, and nobody can change an answer.
