-- Files phase B: uploads go straight to Cloudflare R2 (PMO, 27 Oct 2026; limit 500 MB per file). Shown to the PMO
-- before it is run.
--
-- Until now every file was uploaded to Supabase Storage and copied to R2, and file_access() decided who may open
-- a file by asking storage.objects as the caller. A file uploaded straight to R2 is not in storage.objects, so:
--
-- 1. file_access_r2(bucket, paths): the same rules as the storage policies, written out from the portal's own
--    records instead of storage.objects. Before it is used, a parity test compares it with file_access() for
--    every existing file and every role; they must agree.
--      project-attachments  PMO and guests: every file with a Documents record; the project's assigned people:
--                           their projects' files; everyone signed in: Site Visit files (as sitevisit_read_all_storage)
--      epdd-files           PMO only
--      sim-shares           PMO, and the guests a share is shared with (can_read_sim_file)
-- 2. r2_objects.origin: 'supabase' (a copy of a Supabase original, as today) or 'r2' (uploaded straight to R2).
-- 3. r2_orphans(): an R2 copy of a Supabase original is removed when the original is gone (as today); a file
--    uploaded straight to R2 is removed only when no Documents record points to it any more and it is over a day
--    old (an upload whose record was never saved). So a file that exists only in R2 is never removed just
--    because it is not in Supabase.
-- 4. can_upload_file(bucket): who may upload straight to R2; project-attachments = PMO, as storage policy
--    pmo_full_storage_access. No other bucket uploads straight to R2 in this phase.
-- Additive only: nothing is removed; file_access() stays for the parity test and as the fallback.

alter table public.r2_objects add column origin text not null default 'supabase' check (origin in ('supabase', 'r2'));

create or replace function public.file_access_r2(p_bucket text, p_paths text[])
returns setof text language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select p from unnest(p_paths) p
   where auth.uid() is not null
     and case p_bucket
       when 'project-attachments' then exists (
         select 1 from project_attachments a
          where a.file_path = p
            and (is_pmo() or is_guest() or a.kind = 'site_visit'
                 or exists (select 1 from project_assignments pa where pa.project_id = a.project_id and pa.user_id = auth.uid())))
       when 'epdd-files' then is_pmo()
       when 'sim-shares' then is_pmo() or can_read_sim_file(p)
       else false end;
$$;
revoke execute on function public.file_access_r2(text, text[]) from public, anon;
grant execute on function public.file_access_r2(text, text[]) to authenticated;

create or replace function public.can_upload_file(p_bucket text)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select auth.uid() is not null and p_bucket = 'project-attachments' and is_pmo(); $$;
revoke execute on function public.can_upload_file(text) from public, anon;
grant execute on function public.can_upload_file(text) to authenticated;

create or replace function public.r2_orphans(p_limit integer default 200)
returns table (bucket text, path text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.bucket, r.path from public.r2_objects r
   where (r.origin = 'supabase'
          and not exists (select 1 from storage.objects o where o.bucket_id = r.bucket and o.name = r.path))
      or (r.origin = 'r2' and r.bucket = 'project-attachments' and r.copied_at < now() - interval '1 day'
          and not exists (select 1 from public.project_attachments a where a.file_path = r.path))
   limit p_limit;
$$;
revoke execute on function public.r2_orphans(integer) from public, anon, authenticated;
grant execute on function public.r2_orphans(integer) to service_role;

-- After applying: get_advisors (security); parity of file_access_r2 with file_access for every object and role.
