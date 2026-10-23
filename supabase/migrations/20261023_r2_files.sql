-- Files served from Cloudflare R2 (PMO, 23 Oct 2026). Shown to the PMO before it is run.
--
-- Why: the Free plan allows 5 GB of Supabase egress a month and file downloads (site-visit videos above all)
-- are nearly all of it. R2 charges nothing for downloads.
-- How (phase A): Supabase Storage stays the original and every upload still goes there exactly as today.
-- Edge function `files` copies each file once into the private R2 bucket (cron below), and when someone opens
-- a file it hands out a time-limited R2 link instead of a Supabase one. Who may open a file is decided by the
-- storage policies that already exist: file_access() asks storage.objects AS THE CALLER, so a PM, a guest, the
-- PMO and a signed-out visitor see exactly the files they see today, and nothing new. A file not yet copied,
-- or any failure, falls back to today's Supabase link.
-- Additive only: nothing is removed. Rollback: unschedule job 3 (20261023_r2_copy_job.sql); the portal falls back to Supabase links.

-- 1. Which files have a copy in R2 (backend only: RLS on, no policies, service role only).
create table public.r2_objects (
  bucket     text not null,
  path       text not null,
  size_bytes bigint,
  etag       text,                         -- storage.objects etag when copied; a changed etag is copied again
  copied_at  timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.r2_objects enable row level security;
revoke all on public.r2_objects from anon, authenticated;
grant all on public.r2_objects to service_role;

-- 2. Which of these paths may the caller open? Security INVOKER on purpose: the select on storage.objects runs
--    under the caller's own JWT, so the existing storage policies decide, unchanged.
create or replace function public.file_access(p_bucket text, p_paths text[])
returns setof text language sql stable security invoker
set search_path to 'public', 'pg_temp'
as $$
  select o.name from storage.objects o
   where o.bucket_id = p_bucket and o.name = any(p_paths)
     and p_bucket in ('project-attachments', 'epdd-files', 'sim-shares');
$$;
revoke execute on function public.file_access(text, text[]) from public, anon;
grant execute on function public.file_access(text, text[]) to authenticated;

-- 3. For the copy job (service role only): files still to copy, and R2 copies whose original is gone.
create or replace function public.r2_pending(p_limit integer default 200)
returns table (bucket text, path text, size_bytes bigint, mime text, etag text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select o.bucket_id, o.name, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype', o.metadata ->> 'eTag'
    from storage.objects o
    left join public.r2_objects r on r.bucket = o.bucket_id and r.path = o.name
   where o.bucket_id in ('project-attachments', 'epdd-files', 'sim-shares')
     and (r.path is null or r.etag is distinct from o.metadata ->> 'eTag')
   order by o.created_at
   limit p_limit;
$$;
create or replace function public.r2_orphans(p_limit integer default 200)
returns table (bucket text, path text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.bucket, r.path from public.r2_objects r
   where not exists (select 1 from storage.objects o where o.bucket_id = r.bucket and o.name = r.path)
   limit p_limit;
$$;
revoke execute on function public.r2_pending(integer) from public, anon, authenticated;
revoke execute on function public.r2_orphans(integer) from public, anon, authenticated;
grant execute on function public.r2_pending(integer) to service_role;
grant execute on function public.r2_orphans(integer) to service_role;

-- After applying: get_advisors (security); in a rolled-back transaction compare file_access() with the storage
-- policies for every object as PMO, Guest, Ali, another PM and anon (they must agree on every row).
