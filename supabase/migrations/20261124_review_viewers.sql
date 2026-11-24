-- 24 Nov 2026 (PMO): "give Minhaj ul Hussain Head PMO type access, but he should also have working access for PMO Review".
-- 1. settings.review_viewers ({"user_ids":[…]}, PMO-only setting, like past_viewers) = PMO Review workers:
--    read the E-PDD tables and files, and update a PDD's link (the column grants already limit authenticated
--    updates to linked_project_id, link_source, seen_at, seen_by). epdd-sync lets them run Check now / {review:id}.
-- 2. Minhaj added to settings.head_pmo (every PMO page read-only, PMO Goals and Achievements editable).

create or replace function public.is_review_viewer()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from settings s join user_profiles u on u.id = auth.uid()
     where s.key = 'review_viewers' and u.is_active
       and coalesce(s.value -> 'user_ids', '[]'::jsonb) ? auth.uid()::text);
$function$;
revoke execute on function public.is_review_viewer() from anon;
grant execute on function public.is_review_viewer() to authenticated, service_role;

create policy epdd_pdds_viewer_read      on public.epdd_pdds      for select to authenticated using (is_review_viewer());
create policy epdd_files_viewer_read     on public.epdd_files     for select to authenticated using (is_review_viewer());
create policy epdd_reviews_viewer_read   on public.epdd_reviews   for select to authenticated using (is_review_viewer());
create policy epdd_sync_runs_viewer_read on public.epdd_sync_runs for select to authenticated using (is_review_viewer());
create policy epdd_pdds_viewer_update     on public.epdd_pdds      for update to authenticated
  using (is_review_viewer()) with check (is_review_viewer());
-- the old Supabase copies of E-PDD files (signed links fall back to these)
create policy epdd_files_viewer_read_storage on storage.objects for select to authenticated
  using (bucket_id = 'epdd-files' and is_review_viewer());

-- R2 file links: same rule as before plus viewers
create or replace function public.file_access_r2(p_bucket text, p_paths text[])
 returns setof text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p from unnest(p_paths) p
   where auth.uid() is not null
     and case p_bucket
       when 'project-attachments' then exists (
         select 1 from project_attachments a
          where a.file_path = p
            and (is_pmo() or is_guest() or a.kind = 'site_visit'
                 or exists (select 1 from project_assignments pa where pa.project_id = a.project_id and pa.user_id = auth.uid())))
         or ((is_pmo() or is_head_pmo()) and exists (select 1 from pmo_pr_documents d where d.file_path = p))
       when 'epdd-files' then is_pmo() or is_head_pmo() or is_review_viewer()
       when 'sim-shares' then is_pmo() or can_read_sim_file(p)
       else false end;
$function$;

-- the list: Minhaj ul Hussain (minhaj.hussain, guest, MTO PMO)
insert into public.settings (key, value)
values ('review_viewers', '{"user_ids":["8c971da4-bb49-4a8e-ae78-d64ca0bfc0a9"]}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Head PMO list: add Minhaj (keeps Mr. Yahya Khan)
update public.settings
   set value = jsonb_set(value, '{user_ids}', coalesce(value -> 'user_ids', '[]'::jsonb) || '["8c971da4-bb49-4a8e-ae78-d64ca0bfc0a9"]'::jsonb)
 where key = 'head_pmo' and not coalesce(value -> 'user_ids', '[]'::jsonb) ? '8c971da4-bb49-4a8e-ae78-d64ca0bfc0a9';
