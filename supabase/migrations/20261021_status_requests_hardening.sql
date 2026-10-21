-- Ask status / Ask update: closing four gaps found by the access tests of 21 Oct 2026. Shown to the PMO before it is run.
--
-- 1. The time of a request, an answer or an update is the server's, never the browser's. A manager could otherwise
--    post an update dated next June, and every request until then would look answered.
-- 2. Once posted, a request, an answer or an update keeps its author (id, name, role), its time and, for past
--    projects, its text. Ordinary posts and messages behave exactly as before.
-- 3. An update may list each deliverable once, each with a known status (Arrived / Ordered / Not yet).
-- 4. Dates written onto the Deliverables tab by an update are Pakistan dates (the server clock is UTC, so an update
--    sent before 05:00 PKT was dated the day before).
-- Additive only: nothing is removed.

-- 1. Server time on posting.
create or replace function public.stamp_status_post()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if (tg_table_name = 'comments' and new.kind <> 'comment')
     or (tg_table_name = 'past_project_updates' and new.kind <> 'message') then
    new.created_at := now();
  end if;
  return new;
end;
$$;
create trigger trg_comment_kind_stamp
  before insert on public.comments
  for each row execute function public.stamp_status_post();
create trigger trg_past_update_kind_stamp
  before insert on public.past_project_updates
  for each row execute function public.stamp_status_post();

-- 2. FY 26-27 Updates: a request or an update keeps its author and time as well as its kind, text and data.
create or replace function public.guard_comment_kind()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind is distinct from old.kind or new.project_id is distinct from old.project_id
     or (old.kind <> 'comment' and (new.body is distinct from old.body or new.data is distinct from old.data
         or new.author_id is distinct from old.author_id or new.author_name is distinct from old.author_name
         or new.author_role is distinct from old.author_role or new.created_at is distinct from old.created_at
         or new.parent_id is distinct from old.parent_id)) then
    raise exception 'A request or update cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 2. Past Projects: a request or an answer keeps its text, author and time as well as its kind and figures.
create or replace function public.guard_past_update_kind()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind is distinct from old.kind or new.pct_complete is distinct from old.pct_complete
     or new.justification is distinct from old.justification
     or (old.kind <> 'message' and (new.past_project_id is distinct from old.past_project_id
         or new.body is distinct from old.body or new.author_id is distinct from old.author_id
         or new.author_name is distinct from old.author_name or new.author_role is distinct from old.author_role
         or new.created_at is distinct from old.created_at)) then
    raise exception 'A status request or answer cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 3. Each line of an update: a known status, and each deliverable once.
create or replace function public.check_update_lines()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare v_missing integer; v_bad integer; v_twice integer;
begin
  if new.kind <> 'update' then return new; end if;
  select count(*) filter (where jsonb_typeof(l) <> 'object' or coalesce(l ->> 'status', '') not in ('arrived', 'ordered', 'not_yet')),
         count(*) - count(distinct l ->> 'id')
    into v_bad, v_twice
    from jsonb_array_elements(coalesce(new.data -> 'lines', '[]'::jsonb)) l;
  if v_bad > 0 then
    raise exception 'Every deliverable needs a status: Arrived, Ordered or Not yet (% not valid)', v_bad using errcode = '23514';
  end if;
  if v_twice > 0 then
    raise exception 'A deliverable is listed twice in this update' using errcode = '23514';
  end if;
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

-- 4. Pakistan dates on the Deliverables tab.
create or replace function public.apply_update_lines()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare v_today date := (now() at time zone 'Asia/Karachi')::date;
begin
  if new.kind <> 'update' then return null; end if;
  update project_deliverables d set
      status = case l ->> 'status'
                 when 'arrived' then case when d.status in ('delivered', 'installed', 'handed_over') then d.status else 'delivered' end
                 when 'ordered' then 'ordered'
                 else 'not_started' end,
      status_date = case l ->> 'status'
                 when 'not_yet' then null
                 when 'arrived' then case when d.status in ('delivered', 'installed', 'handed_over') then coalesce(d.status_date, v_today) else v_today end
                 else case when d.status = 'ordered' then coalesce(d.status_date, v_today) else v_today end end,
      note = left(btrim(l ->> 'comment'), 500)
    from jsonb_array_elements(coalesce(new.data -> 'lines', '[]'::jsonb)) l
   where d.id::text = l ->> 'id' and d.project_id = new.project_id and d.confirmed and not d.superseded;
  return null;
end;
$$;

-- After applying: get_advisors (security); in a rolled-back transaction repeat the access tests of 21 Oct and check
-- a future created_at is replaced by now(), an author or time change on a request/answer/update is refused, a
-- duplicate or unknown-status line is refused, and ordinary posts and messages behave as before.
