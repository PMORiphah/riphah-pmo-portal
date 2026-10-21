-- FY 2026-27 Updates "Ask update" (PMO, 20 Oct 2026; plan docs/plans/status-requests.md). Shown to the PMO before it is run.
--
-- A request and the manager's update are posts in the project's existing Updates thread (comments), so the
-- Inbox, "N new", the bell, the Activity Log and comment_reads keep working unchanged.
--   kind = 'comment'         an ordinary post (every existing row)
--   kind = 'update_request'  "Ask update", by the PMO or a past-project viewer (PMO decision 20 Oct 2026)
--   kind = 'update'          the manager's update; body = the detailed update (required), data =
--                            {"overall": "on_track"|"at_risk"|"delayed", "pct": 0-100,
--                             "lines": [{"id": <project_deliverables.id>, "status": "arrived"|"ordered"|"not_yet",
--                                        "comment": "..."}]}
-- Every confirmed item line of the project needs a status and a comment (contingency and tax lines are not items).
-- The update writes each line's status, date and note to project_deliverables (the manager may already change
-- exactly those fields). The manager's % is stored as reported; the PMO's "Use this %" copies it into
-- projects.pct_complete from the page (PMO decision 20 Oct 2026). Additive only: nothing is removed.

alter table public.comments
  add column if not exists kind text not null default 'comment',
  add column if not exists data jsonb;

alter table public.comments
  add constraint comments_kind_chk check (kind in ('comment', 'update_request', 'update')),
  add constraint comments_kind_root_chk check (kind = 'comment' or parent_id is null),
  add constraint comments_update_shape_chk check (
    kind <> 'update' or coalesce(
      data ->> 'overall' in ('on_track', 'at_risk', 'delayed')
      and jsonb_typeof(data -> 'pct') = 'number' and (data ->> 'pct')::numeric between 0 and 100
      and jsonb_typeof(coalesce(data -> 'lines', '[]'::jsonb)) = 'array'
      and length(btrim(body)) >= 20, false));

-- A deliverable line that is an item (not a contingency, sales tax or GST line).
create or replace function public.deliverable_is_item(t text)
returns boolean language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(t, '') !~* '^\s*(\d+(\.\d+)?\s*%\s*)?(contingenc|sales\s*tax|gst\M|withholding|income\s*tax)'
$$;

-- Who may post which kind; ANDed with the existing comments_insert policy, which stays as it is.
-- Requests and updates must also carry the author's real role (comments.author_role is otherwise unchecked).
create policy comments_kind_guard on public.comments as restrictive
  for insert to authenticated
  with check (
    kind = 'comment'
    or (author_role = (select up.role from public.user_profiles up where up.id = auth.uid() and up.is_active)
        and ((kind = 'update_request' and (public.is_pmo() or public.is_past_viewer()))
          or (kind = 'update' and public.is_assigned(project_id))))
  );

-- An update must cover every confirmed item line, each with a status and a comment.
create or replace function public.check_update_lines()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare v_missing integer;
begin
  if new.kind <> 'update' then return new; end if;
  select count(*) into v_missing
    from project_deliverables d
   where d.project_id = new.project_id and d.confirmed and not d.superseded and public.deliverable_is_item(d.title)
     and not exists (
       select 1 from jsonb_array_elements(coalesce(new.data -> 'lines', '[]'::jsonb)) l
        where l ->> 'id' = d.id::text and l ->> 'status' in ('arrived', 'ordered', 'not_yet')
          and length(btrim(coalesce(l ->> 'comment', ''))) >= 2);
  if v_missing > 0 then
    raise exception 'Every deliverable needs a status and a comment (% missing)', v_missing using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_comment_update_lines
  before insert on public.comments
  for each row execute function public.check_update_lines();

-- The update's lines go onto the Deliverables tab, as the manager's own edits (invoker rights: row-level security
-- and trg_deliverables_guard apply exactly as when they tick a line by hand). Arrived keeps an earlier
-- delivered/installed/handed-over state and its date; Ordered and Arrived date today when newly set; Not yet clears.
create or replace function public.apply_update_lines()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind <> 'update' then return null; end if;
  update project_deliverables d set
      status = case l ->> 'status'
                 when 'arrived' then case when d.status in ('delivered', 'installed', 'handed_over') then d.status else 'delivered' end
                 when 'ordered' then 'ordered'
                 else 'not_started' end,
      status_date = case l ->> 'status'
                 when 'not_yet' then null
                 when 'arrived' then case when d.status in ('delivered', 'installed', 'handed_over') then coalesce(d.status_date, current_date) else current_date end
                 else case when d.status = 'ordered' then coalesce(d.status_date, current_date) else current_date end end,
      note = left(btrim(l ->> 'comment'), 500)
    from jsonb_array_elements(coalesce(new.data -> 'lines', '[]'::jsonb)) l
   where d.id::text = l ->> 'id' and d.project_id = new.project_id and d.confirmed and not d.superseded;
  return null;
end;
$$;
create trigger trg_comment_apply_update_lines
  after insert on public.comments
  for each row execute function public.apply_update_lines();

-- Requests and updates cannot be rewritten or moved (the PMO may still remove a post, as today);
-- no comment can be moved to another project or change kind.
create or replace function public.guard_comment_kind()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind is distinct from old.kind or new.project_id is distinct from old.project_id
     or (old.kind <> 'comment' and (new.body is distinct from old.body or new.data is distinct from old.data)) then
    raise exception 'A request or update cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_comment_kind_guard
  before update on public.comments
  for each row execute function public.guard_comment_kind();

-- One row per project that has been asked or has answered: the latest request, the first request still waiting
-- (pending_since), and the latest update. Row-level security of comments applies (security_invoker).
create or replace view public.project_update_status with (security_invoker = true) as
select p.id as project_id,
       rq.id as request_id, rq.created_at as requested_at, rq.author_name as requested_by,
       (select min(c.created_at) from comments c
         where c.project_id = p.id and c.kind = 'update_request'
           and (ud.created_at is null or c.created_at > ud.created_at)) as pending_since,
       ud.id as update_id, ud.created_at as updated_at, ud.author_name as updated_by,
       ud.data ->> 'overall' as overall, (ud.data ->> 'pct')::numeric as pct
  from projects p
  left join lateral (select c.id, c.created_at, c.author_name from comments c
                      where c.project_id = p.id and c.kind = 'update_request'
                      order by c.created_at desc limit 1) rq on true
  left join lateral (select c.id, c.created_at, c.author_name, c.data from comments c
                      where c.project_id = p.id and c.kind = 'update'
                      order by c.created_at desc limit 1) ud on true
 where rq.id is not null or ud.id is not null;

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by row-level security.
grant select on public.project_update_status to anon, authenticated, service_role;

-- After applying: get_advisors (security); in a rolled-back transaction check that the PMO and a viewer can ask,
-- another guest and a PM cannot, the assigned manager (a PM, and the guest with assignments) can answer only with
-- every line + overall + % + a detailed update, the lines land on project_deliverables, nobody can change a request
-- or an update, and ordinary comments behave as before.
