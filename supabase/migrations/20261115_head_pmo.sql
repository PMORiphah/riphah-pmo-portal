-- Head PMO (PMO, 15 Nov 2026): Mr. Yahya Khan sees every page the PMO sees (view only) and may edit
-- PMO Goals (pmo_tasks, incl. Pending PR documents) and PMO Achievements. His account stays role guest;
-- the Head PMO accounts are listed in settings.head_pmo {"user_ids":[...]} (PMO-only setting, like past_viewers).
-- Additive only: new function, new permissive policies, one setting row.

insert into public.settings (key, value)
values ('head_pmo', jsonb_build_object('user_ids', jsonb_build_array('78a8791a-1669-4b78-af57-b0dbbe2b030d')))
on conflict (key) do update set value = excluded.value;

create or replace function public.is_head_pmo()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from settings s join user_profiles u on u.id = auth.uid()
     where s.key = 'head_pmo' and u.is_active
       and coalesce(s.value -> 'user_ids', '[]'::jsonb) ? auth.uid()::text);
$$;
revoke execute on function public.is_head_pmo() from public, anon;
grant execute on function public.is_head_pmo() to authenticated, service_role;

-- View: everything the PMO reads, except personal security data (passkeys, push endpoints), backend-only
-- tables and backups. Settings: every key except the welcome-email setting (it holds a temporary password).
do $$
declare t text;
begin
  foreach t in array array[
    'activity_log','benefit_realization','benefits_realized','board_report_recipients','board_reports','campuses',
    'carry_forward_projects','comment_reads','comments','cost_centers','epdd_files','epdd_pdds','epdd_reviews',
    'epdd_sync_runs','inventory_items','lessons_learned','milestones','notifications_log','past_chat_reads',
    'past_pm_messages','past_project_tasks','past_project_updates','past_projects','pmo_achievements',
    'pmo_pr_documents','pmo_tasks','project_assignments','project_attachments','project_cashflows',
    'project_deliverables','project_payments','project_pcrs','project_raci','project_risks','project_tasks',
    'project_todos','projects','regions','sectors','segments','session_events','sim_share_recipients','sim_shares',
    'snapshots','tour_events','user_profiles','user_sessions']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_head_pmo())', t || '_head_view', t);
  end loop;
end $$;
create policy settings_head_view on public.settings for select to authenticated
  using (public.is_head_pmo() and key <> 'welcome_email');

-- Edit: PMO Goals (tasks and their PR documents) and PMO Achievements.
create policy pmo_tasks_head_edit on public.pmo_tasks for all to authenticated
  using (public.is_head_pmo()) with check (public.is_head_pmo());
create policy pmo_pr_documents_head_edit on public.pmo_pr_documents for all to authenticated
  using (public.is_head_pmo()) with check (public.is_head_pmo());
create policy pmo_achievements_head_edit on public.pmo_achievements for all to authenticated
  using (public.is_head_pmo()) with check (public.is_head_pmo());

-- Files: open E-PDD copies and PR documents like the PMO; upload PR documents (CS, release email).
create or replace function public.file_access_r2(p_bucket text, p_paths text[])
 returns setof text
 language sql stable security definer
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
       when 'epdd-files' then is_pmo() or is_head_pmo()
       when 'sim-shares' then is_pmo() or can_read_sim_file(p)
       else false end;
$function$;

create or replace function public.can_upload_file(p_bucket text)
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$ select auth.uid() is not null and p_bucket = 'project-attachments' and (is_pmo() or is_head_pmo()); $function$;
