-- Shared simulations (PMO -> selected guests). Shown to the PMO before it is run.
-- A share is one frozen simulation snapshot the PMO created in the launcher. The snapshot JSON and
-- the re-encoded photos/videos are files in the private bucket 'sim-shares' under <share id>/;
-- this row records when the data was read, which portal build plays it, until when, and who shared
-- it. No row is ever removed: a share is withdrawn or replaced by a newer one. Recipients are
-- active guests only, checked when added and again on every read. The live portal and the preview
-- site use the same database, so each share belongs to the site it was made on (its base path) and
-- each site has its own: sharing on one never replaces the other's.

create table public.sim_shares (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'uploading'
                     check (status in ('uploading', 'active', 'replaced', 'withdrawn')),
  as_at            timestamptz not null,                 -- snapshot.takenAt
  build            text not null check (build ~ '^[A-Za-z0-9._-]{1,100}$'),
  fingerprint      text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  code             text not null check (code ~ '^[0-9A-Z]{6}$'),
  json_bytes       integer not null check (json_bytes between 1 and 6291456),
  media_count      integer not null default 0 check (media_count between 0 and 200),
  media_bytes      bigint  not null default 0 check (media_bytes between 0 and 157286400),
  voice            text not null default 'on' check (voice in ('on', 'off')),
  expires_at       timestamptz not null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  activated_at     timestamptz,
  ended_at         timestamptz,
  ended_by         uuid,
  replaced_by      uuid,
  files_removed_at timestamptz,
  updated_at       timestamptz not null default now(),
  site             text not null default '/' check (site ~ '^/[A-Za-z0-9._/-]{0,100}$'),   -- the portal's base path
  check (expires_at > as_at and expires_at <= as_at + interval '8 days')
);
-- At most one share plays at a time on each site.
create unique index sim_shares_one_active on public.sim_shares (site) where status = 'active';

create table public.sim_share_recipients (
  share_id     uuid not null references public.sim_shares (id),   -- for the embed in the sign-in poll
  user_id      uuid not null,                                     -- user_profiles.id (no FK: removing a user must not be blocked)
  added_by     uuid default auth.uid(),
  added_at     timestamptz not null default now(),
  removed      boolean not null default false,
  removed_at   timestamptz,
  seen_at      timestamptz,             -- the sign-in pop-up was closed (stamped once)
  opened_at    timestamptz,             -- first start (stamped once; appears in the Activity Log)
  last_used_at timestamptz,             -- latest start (bookkeeping, skipped by log_activity)
  counter      integer not null default 0,   -- number of starts (bookkeeping, skipped by log_activity)
  primary key (share_id, user_id)
);
create index sim_share_recipients_user on public.sim_share_recipients (user_id);

-- Is the signed-in user an active guest who currently receives this share?
create or replace function public.is_sim_recipient(s uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from sim_share_recipients x join user_profiles u on u.id = x.user_id
                  where x.share_id = s and x.user_id = auth.uid() and not x.removed
                    and u.role = 'guest' and u.is_active);
$$;
revoke execute on function public.is_sim_recipient(uuid) from public, anon;
grant execute on function public.is_sim_recipient(uuid) to authenticated, service_role;

-- May the signed-in user read this file of the bucket? (folder = an active, unexpired share they receive)
create or replace function public.can_read_sim_file(object_name text)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from sim_shares s
                  where s.id::text = split_part(object_name, '/', 1)
                    and s.status = 'active' and s.expires_at > now()
                    and is_sim_recipient(s.id));
$$;
revoke execute on function public.can_read_sim_file(text) from public, anon;
grant execute on function public.can_read_sim_file(text) to authenticated, service_role;

-- Signed-in users only: anon has the select grant below but no policy, so it reads 0 rows (rather
-- than failing on is_sim_recipient, which anon may not execute).
alter table public.sim_shares enable row level security;
create policy sim_shares_select on public.sim_shares
  for select to authenticated using (is_pmo() or (status = 'active' and expires_at > now() and is_sim_recipient(id)));
create policy sim_shares_insert on public.sim_shares
  for insert to authenticated with check (is_pmo());
create policy sim_shares_update on public.sim_shares
  for update to authenticated using (is_pmo()) with check (is_pmo());

alter table public.sim_share_recipients enable row level security;
create policy sim_share_recipients_select on public.sim_share_recipients
  for select to authenticated using (is_pmo() or user_id = auth.uid());
create policy sim_share_recipients_insert on public.sim_share_recipients
  for insert to authenticated with check (is_pmo());
create policy sim_share_recipients_update on public.sim_share_recipients
  for update to authenticated using (is_pmo() or user_id = auth.uid()) with check (is_pmo() or user_id = auth.uid());

-- A share is created 'uploading' by the PMO, becomes 'active' once its files are up, and ends as
-- 'replaced' or 'withdrawn'. Its content never changes once it has left 'uploading'.
create or replace function public.trg_sim_shares_guard()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'uploading'; new.created_by := auth.uid(); new.created_at := now();
    new.activated_at := null; new.ended_at := null; new.ended_by := null; new.replaced_by := null;
    new.files_removed_at := null; new.updated_at := now();
    return new;
  end if;
  new.updated_at := now();
  if old.status <> 'uploading' and
     (new.as_at, new.build, new.fingerprint, new.code, new.json_bytes, new.media_count, new.media_bytes,
      new.voice, new.expires_at, new.created_by, new.created_at, new.site)
     is distinct from
     (old.as_at, old.build, old.fingerprint, old.code, old.json_bytes, old.media_count, old.media_bytes,
      old.voice, old.expires_at, old.created_by, old.created_at, old.site) then
    raise exception 'A shared simulation can no longer change; share a new one instead';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'uploading' and new.status in ('active', 'withdrawn'))
         or (old.status = 'active' and new.status in ('replaced', 'withdrawn'))) then
      raise exception 'A simulation share cannot go from % to %', old.status, new.status;
    end if;
    if new.status = 'active' then
      if new.expires_at <= now() then raise exception 'This simulation share has already expired'; end if;
      new.activated_at := now();
    else
      new.ended_at := now(); new.ended_by := auth.uid();
    end if;
  elsif old.status in ('replaced', 'withdrawn') and
        (new.activated_at, new.ended_at, new.ended_by, new.replaced_by)
        is distinct from (old.activated_at, old.ended_at, old.ended_by, old.replaced_by) then
    raise exception 'This simulation share has ended';
  end if;
  return new;
end;
$$;
create trigger trg_sim_shares_guard
  before insert or update on public.sim_shares
  for each row execute function public.trg_sim_shares_guard();

-- Recipients: active guests only; a recipient may only stamp seen/opened/started (server time).
create or replace function public.trg_sim_recipient_guard()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from user_profiles u where u.id = new.user_id and u.role = 'guest' and u.is_active) then
      raise exception 'A simulation can be shared with active guests only';
    end if;
    if not exists (select 1 from sim_shares s where s.id = new.share_id and s.status in ('uploading', 'active')) then
      raise exception 'This simulation share has ended';
    end if;
    new.added_at := now(); new.seen_at := null; new.opened_at := null; new.last_used_at := null; new.counter := 0;
    return new;
  end if;
  if new.removed and not old.removed then new.removed_at := now(); end if;
  if auth.uid() is not null and not is_pmo() then
    if (new.share_id, new.user_id, new.added_by, new.added_at, new.removed, new.removed_at)
       is distinct from (old.share_id, old.user_id, old.added_by, old.added_at, old.removed, old.removed_at) then
      raise exception 'Only the PMO can change who receives a simulation';
    end if;
    new.seen_at := case when old.seen_at is null and new.seen_at is not null then now() else old.seen_at end;
    if new.last_used_at is distinct from old.last_used_at then
      new.last_used_at := now(); new.counter := old.counter + 1;
      new.opened_at := coalesce(old.opened_at, now());
    else
      new.last_used_at := old.last_used_at; new.counter := old.counter; new.opened_at := old.opened_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_sim_recipient_guard
  before insert or update on public.sim_share_recipients
  for each row execute function public.trg_sim_recipient_guard();

-- Share in one step: the previous active share of the same site (if any) becomes 'replaced', the
-- recipients are added (or re-added), and the new share becomes 'active'. Called again on the
-- active share itself, it only adds guests to it ("Add guests" in the launcher). Runs with the
-- caller's rights (RLS).
create or replace function public.sim_share_activate(p_share uuid, p_recipients uuid[])
returns void language plpgsql security invoker
set search_path to 'public', 'pg_temp'
as $$
declare v_old uuid;
begin
  if not is_pmo() then raise exception 'Only the PMO can share a simulation'; end if;
  select o.id into v_old from sim_shares o join sim_shares n on n.id = p_share and n.site = o.site
   where o.status = 'active' and o.id <> p_share for update of o;
  if v_old is not null then
    update sim_shares set status = 'replaced', replaced_by = p_share where id = v_old;
  end if;
  insert into sim_share_recipients (share_id, user_id)
    select p_share, u from unnest(coalesce(p_recipients, '{}'::uuid[])) as u
  on conflict (share_id, user_id) do update set removed = false;
  update sim_shares set status = 'active' where id = p_share and status = 'uploading';
  if not found and not exists (select 1 from sim_shares
                                where id = p_share and status = 'active' and expires_at > now()) then
    raise exception 'This simulation share is not ready to be shared';
  end if;
end;
$$;
revoke execute on function public.sim_share_activate(uuid, uuid[]) from public, anon;
grant execute on function public.sim_share_activate(uuid, uuid[]) to authenticated, service_role;

-- Can a share's files be removed? True once the PMO's removal policy (sim_shares_pmo_remove_storage,
-- below) exists. The launcher shares only then: a download link a guest made while a share played
-- keeps working until that share's files are gone, so Stop sharing, Replace and expiry must be able
-- to remove them.
create or replace function public.sim_share_cleanup_ready()
returns boolean language sql stable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'sim_shares_pmo_remove_storage');
$$;
revoke execute on function public.sim_share_cleanup_ready() from public, anon;
grant execute on function public.sim_share_cleanup_ready() to authenticated, service_role;

-- Private bucket for the shared files (50 MB per file, the simulation's own per-item cap).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sim-shares', 'sim-shares', false, 52428800,
        array['application/json', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy sim_shares_pmo_insert_storage on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sim-shares' and public.is_pmo());
create policy sim_shares_read_storage on storage.objects
  for select to authenticated
  using (bucket_id = 'sim-shares' and (public.is_pmo() or public.can_read_sim_file(name)));
-- The PMO may also remove (and so tidy) the bucket's files. Written as FOR ALL, PMO only: the Supabase
-- SQL tool holds any statement naming the remove command for a confirmation it cannot get.
create policy sim_shares_pmo_remove_storage on storage.objects
  for all to authenticated
  using (bucket_id = 'sim-shares' and public.is_pmo())
  with check (bucket_id = 'sim-shares' and public.is_pmo());

-- Grants (Supabase rule from 30 Oct 2026); access is still decided by RLS. As for board_reports,
-- rows are never removed, so no grant beyond select, insert and update is given here (today's
-- default ACL still adds more; no policy allows it).
grant select on public.sim_shares, public.sim_share_recipients to anon;
grant select, insert, update on public.sim_shares, public.sim_share_recipients to authenticated, service_role;

-- Activity Log: both rows are small (no snapshot inside). updated_at, last_used_at and counter
-- are bookkeeping, so a repeat start is not logged; the first open and the pop-up close are.
create trigger trg_sim_shares_activity
  after insert or update on public.sim_shares
  for each row execute function public.log_activity();
create trigger trg_sim_share_recipients_activity
  after insert or update on public.sim_share_recipients
  for each row execute function public.log_activity();

-- After applying: get_advisors (security), pg_policies and role_table_grants for both tables and
-- storage.objects, and confirm log_activity skips last_used_at and counter.
