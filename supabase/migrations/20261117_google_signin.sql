-- Sign in with Google for listed Riphah accounts + a super admin who alone changes roles (PMO, 17 Nov 2026).
-- Passwords stay as a fallback. Anyone not on the list is refused.

-- 1. Super admin: one row per super admin (Abdullah Azhar). No write policy: changed only by SQL.
create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  added_at timestamptz not null default now()
);
alter table public.super_admins enable row level security;
create policy super_admins_select on public.super_admins for select to authenticated using (true);
grant select on public.super_admins to anon;
grant select, insert, update, delete on public.super_admins to authenticated, service_role;
insert into public.super_admins (user_id)
  select id from public.user_profiles where lower(email) = 'abdullah.azhar@riphah.edu.pk'
  on conflict do nothing;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (select 1 from super_admins s join user_profiles u on u.id = s.user_id
                  where s.user_id = auth.uid() and u.is_active);
$$;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- 1b. Until now only ONE account could hold the PMO role (unique index one_pmo_only). The PMO team now
--     signs in with their own accounts as PMO, so the limit goes.
drop index if exists public.one_pmo_only;

-- 2. Designation on profiles (from the list).
alter table public.user_profiles add column if not exists designation text;

-- 3. The list of Riphah Google accounts allowed in.
create table if not exists public.google_allowlist (
  email        text primary key check (email = lower(email) and email like '%_@riphah.edu.pk'),
  full_name    text not null check (length(trim(full_name)) > 0),
  designation  text,
  role         user_role not null default 'guest',
  active       boolean not null default true,
  note         text,
  added_by     uuid,
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.google_allowlist enable row level security;
create policy google_allowlist_read on public.google_allowlist for select to authenticated
  using (public.is_pmo() or public.is_head_pmo());
create policy google_allowlist_write on public.google_allowlist for all to authenticated
  using (public.is_pmo()) with check (public.is_pmo());
grant select on public.google_allowlist to anon;
grant select, insert, update, delete on public.google_allowlist to authenticated, service_role;

-- Only the super admin changes roles or adds/removes PMO accounts on the list; any PMO may add PMs and guests.
create or replace function public.guard_google_allowlist()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if tg_op = 'INSERT' and new.role = 'pmo' then
      raise exception 'Only the super admin can add a PMO account';
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'Only the super admin can change roles';
    elsif tg_op = 'UPDATE' and old.role = 'pmo' and (new.active is distinct from old.active or new.email is distinct from old.email) then
      raise exception 'Only the super admin can change a PMO account';
    elsif tg_op = 'DELETE' and old.role = 'pmo' then
      raise exception 'Only the super admin can remove a PMO account';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.email := lower(trim(new.email));
  new.updated_at := now();
  if tg_op = 'INSERT' then new.added_by := auth.uid(); new.added_at := now(); end if;
  return new;
end $$;
create trigger trg_google_allowlist_guard before insert or update or delete on public.google_allowlist
  for each row execute function public.guard_google_allowlist();

-- A list change reaches the person's existing account (name, designation, role; inactive = signed out of the list).
create or replace function public.sync_google_allowlist()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  update public.user_profiles u
     set full_name = new.full_name, designation = new.designation, role = new.role
   where lower(u.email) = new.email
     and (u.full_name, u.designation, u.role) is distinct from (new.full_name, new.designation, new.role)
     and u.id not in (select user_id from public.super_admins);   -- the super admin's own row is never changed by the list
  return new;
end $$;
create trigger trg_google_allowlist_sync after insert or update on public.google_allowlist
  for each row execute function public.sync_google_allowlist();

-- 4. New accounts: Google only for listed @riphah.edu.pk addresses; email sign-ups only when the PMO
--    created or invited them (never as PMO); everything else is refused (no account is made).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_email text := lower(coalesce(new.email, ''));
  a public.google_allowlist;
  v_user text; v_n int := 1; v_role user_role;
begin
  select * into a from public.google_allowlist where email = v_email and active;
  if v_provider <> 'email' then
    if v_email not like '%_@riphah.edu.pk' then
      raise exception 'PMO portal: only riphah.edu.pk Google accounts can sign in';
    end if;
    if a.email is null then
      raise exception 'PMO portal: % is not on the list of people allowed to sign in', v_email;
    end if;
  elsif a.email is null and new.invited_at is null and new.email_confirmed_at is null then
    raise exception 'PMO portal: accounts are created by the PMO';
  end if;

  if a.email is not null then
    v_role := a.role;
  else
    v_role := case when new.raw_user_meta_data ->> 'role' in ('project_manager', 'guest')
                   then (new.raw_user_meta_data ->> 'role')::user_role else 'guest' end;
  end if;
  v_user := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(v_email, '@', 1));
  if exists (select 1 from public.user_profiles where lower(username) = lower(v_user)) then
    v_user := split_part(v_email, '@', 1);
  end if;
  while exists (select 1 from public.user_profiles where lower(username) = lower(v_user)) loop
    v_n := v_n + 1; v_user := split_part(v_email, '@', 1) || v_n;
  end loop;
  -- A listed PMO member starts with notification emails off: the team is already copied on them (17 Nov 2026).
  insert into public.user_profiles (id, username, email, full_name, role, designation, notify_email)
  values (new.id, v_user, new.email,
          coalesce(a.full_name, nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), ''),
          v_role, a.designation, v_role <> 'pmo')
  on conflict (id) do nothing;
  return new;
end $$;

-- 5. Roles change only by the super admin; the super admin's own account can't be changed or deleted by others.
--    (Service-role and SQL calls have no auth.uid() and pass; edge functions check their callers.)
create or replace function public.guard_profile_admin()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_super boolean := public.is_super_admin();
begin
  if auth.uid() is null or v_super then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.id in (select user_id from public.super_admins) then raise exception 'The super admin account cannot be removed'; end if;
    return old;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only the super admin can change roles';
  end if;
  if old.id in (select user_id from public.super_admins) and old.id <> auth.uid()
     and (new.is_active, new.email, new.username) is distinct from (old.is_active, old.email, old.username) then
    raise exception 'Only the super admin can change the super admin account';
  end if;
  return new;
end $$;
create trigger trg_profile_admin_guard before update or delete on public.user_profiles
  for each row execute function public.guard_profile_admin();

-- 5b. The owner-only trigger refused every profile change made without a signed-in user (SQL, edge functions
--     with the service key, the list sync), so roles could not be set from the list. Those callers already
--     bypass RLS; signed-in non-PMO users stay limited to their tutorial columns as before.
create or replace function public.enforce_self_update_tutorial_only()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or is_pmo() then
    return new;
  end if;
  if new.username        is distinct from old.username
     or new.full_name     is distinct from old.full_name
     or new.email         is distinct from old.email
     or new.role          is distinct from old.role
     or new.secondary_email is distinct from old.secondary_email
     or new.is_active     is distinct from old.is_active
     or new.phone         is distinct from old.phone
     or new.whatsapp_opt_in is distinct from old.whatsapp_opt_in
     or new.notify_email  is distinct from old.notify_email
     or new.designation   is distinct from old.designation
  then
    raise exception 'Only tutorial_offered_at and tutorial_completed_at may be updated by the account owner';
  end if;
  return new;
end;
$function$;

-- 6. The super admin's login can't be deleted (delete-user runs as the service role).
create or replace function public.guard_super_admin_delete()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if old.id in (select user_id from public.super_admins) then
    raise exception 'The super admin account cannot be deleted';
  end if;
  return old;
end $$;
create trigger trg_super_admin_delete before delete on auth.users
  for each row execute function public.guard_super_admin_delete();

-- 7. After a Google sign-in the page asks whether the signed-in address is on the list (existing accounts
--    linked to Google are not re-checked by handle_new_user).
create or replace function public.google_access()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'listed', exists (select 1 from google_allowlist g join user_profiles u on lower(u.email) = g.email
                       where u.id = auth.uid() and g.active),
    'active', coalesce((select is_active from user_profiles where id = auth.uid()), false),
    'super_admin', public.is_super_admin());
$$;
revoke execute on function public.google_access() from public, anon;
grant execute on function public.google_access() to authenticated, service_role;
revoke execute on function public.guard_google_allowlist(), public.sync_google_allowlist(),
  public.guard_profile_admin(), public.guard_super_admin_delete() from public, anon, authenticated;
