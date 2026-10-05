-- Activity Log records everything (PMO, 5 Oct 2026).
-- Before this, log_activity() ran on six tables only (projects, comments, user_profiles,
-- project_assignments, project_tasks, past_project_tasks), so the past projects import,
-- cash flows, risks, files, RACI, carry forward, settings/KPI cards, reference lists,
-- E-PDD arrivals and links, past-project chats and passkeys left no trace.
-- 1. log_activity() gets a readable summary for every table it now runs on, skips
--    no-op updates (only bookkeeping columns changed), and stores only the changed
--    fields of an update in details (old / new / changed), plus a "label".
-- 2. Triggers on the missing tables.
-- Not logged on purpose: read markers (comment_reads, past_chat_reads), sessions and
-- tour events (already shown), push subscriptions, webauthn challenges, epdd_files /
-- epdd_reviews / epdd_sync_runs / epdd_state (sync bookkeeping; the PDD itself is
-- logged), notifications_log (shown on the page from its own table), snapshots.

create or replace function public.activity_project_name(p uuid)
returns text language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select coalesce(nullif(btrim(case when code ~ '[[:alnum:]]' then code || ' ' else '' end || name), ''), 'a project')
      from public.projects where id = p $$;

create or replace function public.activity_past_name(p uuid)
returns text language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select name || coalesce(' (' || fiscal_year || ')', '') from public.past_projects where id = p $$;

create or replace function public.activity_user_name(u uuid)
returns text language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select coalesce(nullif(full_name, ''), username) from public.user_profiles where id = u $$;

create or replace function public.log_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor   uuid := auth.uid();
  v_name    text;
  v_role    user_role;
  v_action  text;
  v_id      text;
  v_summary text;
  v_details jsonb;
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row     jsonb;
  v_changed text[];
  v_label   text;
  v_proj    text;
  v_verb    text;
  -- Bookkeeping columns: a change to these alone is not an activity.
  v_ignore  text[] := array['updated_at','tutorial_offered_at','tutorial_last_step',
                            'tutorial_completed_at','tutorial_dismissed_at',
                            'last_used_at','counter','last_followed_up',
                            'last_synced_at','detail_synced_at','detail_needed'];
  -- Never copied into the log.
  v_secret  text[] := array['public_key','credential_id','raw','pdd','approvals'];
begin
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select key as k from jsonb_each(v_new)
          except select key from jsonb_each(v_old) o where v_new -> o.key = o.value) s
    where k <> all (v_ignore);
    if cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;

  select username, role into v_name, v_role
  from public.user_profiles where id = v_actor;

  v_id := coalesce(v_row ->> 'id', v_row ->> 'key');
  v_verb := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'deleted' end;

  if tg_op = 'INSERT' then
    v_action := 'created'; v_details := v_new - v_secret;
  elsif tg_op = 'UPDATE' then
    v_action := 'updated';
    v_details := jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'old', (select coalesce(jsonb_object_agg(k, v_old -> k), '{}') from unnest(v_changed) k where k <> all (v_secret)),
      'new', (select coalesce(jsonb_object_agg(k, v_new -> k), '{}') from unnest(v_changed) k where k <> all (v_secret)));
  else
    v_action := 'deleted'; v_details := v_old - v_secret;
  end if;

  if tg_table_name = 'projects' then
    if tg_op = 'UPDATE' and old.workflow_stage is distinct from new.workflow_stage then
      v_action  := 'stage_changed';
      v_summary := format('Project "%s" moved %s -> %s', new.name, old.workflow_stage, new.workflow_stage);
    elsif tg_op = 'INSERT' then v_summary := format('Project "%s" created', new.name);
    elsif tg_op = 'UPDATE' then v_summary := format('Project "%s" updated', new.name);
    else v_summary := format('Project "%s" deleted', old.name);
    end if;
    v_label := v_row ->> 'name';
  elsif tg_table_name = 'comments' then
    v_action  := case tg_op when 'INSERT' then 'commented'
                            when 'UPDATE' then 'comment_edited'
                            else 'comment_deleted' end;
    v_proj := activity_project_name((v_row ->> 'project_id')::uuid);
    v_summary := case when v_proj is null then 'Comment activity on a project'
                      else format('Update %s on %s', case tg_op when 'INSERT' then 'posted'
                                  when 'UPDATE' then 'edited' else 'deleted' end, v_proj) end;
  elsif tg_table_name = 'user_profiles' then
    v_summary := case tg_op when 'INSERT' then format('User "%s" created', new.username)
                            when 'UPDATE' then format('User "%s" updated', new.username)
                            else format('User "%s" removed', old.username) end;
  elsif tg_table_name = 'project_assignments' then
    v_action  := case tg_op when 'INSERT' then 'assigned'
                            when 'DELETE' then 'unassigned'
                            else 'assignment_updated' end;
    v_summary := format('%s %s %s', coalesce(activity_user_name((v_row ->> 'user_id')::uuid), 'Someone'),
                        case tg_op when 'INSERT' then 'assigned to' when 'DELETE' then 'removed from'
                             else 'assignment changed on' end,
                        coalesce(activity_project_name((v_row ->> 'project_id')::uuid), 'a project'));
  elsif tg_table_name in ('project_tasks', 'past_project_tasks') then
    if tg_op = 'INSERT' then
      v_summary := format('Task "%s" added', new.name);
    elsif tg_op = 'DELETE' then
      v_summary := format('Task "%s" deleted', old.name);
    elsif old.start_date is distinct from new.start_date
       or old.end_date   is distinct from new.end_date then
      v_action  := 'task_date_changed';
      v_summary := format('Task "%s" moved %s..%s -> %s..%s', new.name,
                          coalesce(old.start_date::text,'—'), coalesce(old.end_date::text,'—'),
                          coalesce(new.start_date::text,'—'), coalesce(new.end_date::text,'—'));
    elsif old.pct_complete is distinct from new.pct_complete then
      v_action  := 'task_progress';
      v_summary := format('Task "%s" progress %s%% -> %s%%', new.name, old.pct_complete, new.pct_complete);
    else
      v_summary := format('Task "%s" updated', new.name);
    end if;

  -- ── Added 5 Oct 2026 ──────────────────────────────────────────────────────
  elsif tg_table_name = 'past_projects' then
    v_label := v_row ->> 'name';
    if tg_op = 'UPDATE' and 'pm_user_id' = any (v_changed) then
      v_action  := 'assignment_updated';
      v_summary := format('Past project "%s" manager changed: %s -> %s', v_label,
                          coalesce(activity_user_name((v_old ->> 'pm_user_id')::uuid), 'none'),
                          coalesce(activity_user_name((v_new ->> 'pm_user_id')::uuid), 'none'));
    else
      v_summary := format('Past project "%s" (%s) %s', v_label, coalesce(v_row ->> 'fiscal_year', '—'), v_verb);
    end if;
  elsif tg_table_name = 'past_project_updates' then
    v_action  := case tg_op when 'INSERT' then 'commented' when 'UPDATE' then 'comment_edited'
                            else 'comment_deleted' end;
    v_summary := format('Follow-up %s on past project "%s": %s',
                        case tg_op when 'INSERT' then 'posted' when 'UPDATE' then 'edited' else 'deleted' end,
                        coalesce(activity_past_name((v_row ->> 'past_project_id')::uuid), '—'),
                        left(v_row ->> 'body', 90));
  elsif tg_table_name = 'past_pm_messages' then
    v_action  := case tg_op when 'INSERT' then 'commented' when 'UPDATE' then 'comment_edited'
                            else 'comment_deleted' end;
    v_summary := format('%s %s: %s',
                        case when v_row ->> 'author_role' = 'pmo' then 'Follow-up chat message to' else 'Reply to PMO from' end,
                        coalesce(activity_user_name((v_row ->> 'pm_user_id')::uuid), 'a project manager'),
                        left(v_row ->> 'body', 90));
  elsif tg_table_name = 'project_cashflows' then
    v_summary := format('Cash flow %s: %s %s, PKR %s (%s)', v_verb,
                        coalesce(activity_project_name((v_row ->> 'project_id')::uuid), v_row ->> 'project_name', '—'),
                        to_char((v_row ->> 'month')::date, 'Mon YYYY'),
                        to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990'),
                        v_row ->> 'bucket');
  elsif tg_table_name = 'project_risks' then
    v_label := v_row ->> 'title';
    v_summary := format('Risk "%s" %s on %s', v_label, v_verb,
                        coalesce(activity_project_name((v_row ->> 'project_id')::uuid), '—'));
  elsif tg_table_name = 'project_attachments' then
    v_action  := case tg_op when 'INSERT' then 'uploaded' else v_action end;
    v_label := v_row ->> 'file_name';
    v_summary := format('File "%s" %s %s', v_label,
                        case tg_op when 'INSERT' then 'uploaded to' when 'UPDATE' then 'updated on' else 'removed from' end,
                        coalesce(activity_project_name((v_row ->> 'project_id')::uuid), '—'));
  elsif tg_table_name = 'project_raci' then
    v_summary := format('RACI %s: %s %s on %s', v_row ->> 'raci_role',
                        coalesce(v_row ->> 'person_name', activity_user_name((v_row ->> 'user_id')::uuid), '—'),
                        v_verb, coalesce(activity_project_name((v_row ->> 'project_id')::uuid), '—'));
  elsif tg_table_name = 'carry_forward_projects' then
    v_label := v_row ->> 'name';
    v_summary := format('Carry-forward "%s" %s%s', v_label, v_verb,
                        case when tg_op = 'UPDATE' and 'amount' = any (v_changed)
                             then format(' (PKR %s -> %s)', to_char((v_old ->> 'amount')::numeric, 'FM999,999,999,990'),
                                                            to_char((v_new ->> 'amount')::numeric, 'FM999,999,999,990'))
                             else '' end);
  elsif tg_table_name = 'settings' then
    v_label := v_row ->> 'key';
    -- Settings values can be large (the SU proposals list): an update keeps only
    -- the keys inside the value that changed.
    if tg_op = 'UPDATE' and jsonb_typeof(v_old -> 'value') = 'object' and jsonb_typeof(v_new -> 'value') = 'object' then
      select coalesce(array_agg(k order by k), '{}') into v_changed from (
        select key k from jsonb_each(v_new -> 'value')
        except select key from jsonb_each(v_old -> 'value') o where (v_new -> 'value') -> o.key = o.value
        union select key from jsonb_each(v_old -> 'value') where not (v_new -> 'value') ? key) s;
      v_details := jsonb_build_object('changed', to_jsonb(v_changed),
        'old', (select coalesce(jsonb_object_agg(k, (v_old -> 'value') -> k), '{}') from unnest(v_changed) k),
        'new', (select coalesce(jsonb_object_agg(k, (v_new -> 'value') -> k), '{}') from unnest(v_changed) k));
      v_summary := format('Setting "%s" updated: %s', v_label, array_to_string(v_changed, ', '));
    else
      v_summary := format('Setting "%s" %s', v_label, v_verb);
    end if;
  elsif tg_table_name in ('lessons_learned', 'benefits_realized') then
    v_label := v_row ->> 'title';
    v_summary := format('%s "%s" %s on %s',
                        case tg_table_name when 'lessons_learned' then 'Lesson learned' else 'Benefit' end,
                        v_label, v_verb, coalesce(activity_project_name((v_row ->> 'project_id')::uuid), '—'));
  elsif tg_table_name in ('campuses', 'cost_centers', 'sectors', 'segments', 'regions') then
    v_label := v_row ->> 'name';
    v_summary := format('%s "%s" %s%s',
                        case tg_table_name when 'campuses' then 'Campus' when 'cost_centers' then 'Cost centre'
                             when 'sectors' then 'Sector' when 'segments' then 'Organisation' else 'Region' end,
                        v_label, v_verb,
                        case when tg_op = 'UPDATE' and 'name' = any (v_changed)
                             then format(' (renamed from "%s")', v_old ->> 'name') else '' end);
  elsif tg_table_name = 'epdd_pdds' then
    v_label := coalesce(v_row ->> 'pdd_number', 'PDD');
    if tg_op = 'INSERT' then
      v_action  := 'pdd_received';
      v_summary := format('%s "%s" (%s) arrived from E-PDD', v_label, v_row ->> 'project_name',
                          coalesce(v_row ->> 'campus', '—'));
    elsif tg_op = 'DELETE' then
      v_summary := format('%s "%s" removed', v_label, v_row ->> 'project_name');
    elsif v_changed && array['linked_project_id','link_source'] then
      v_action  := 'pdd_linked';
      v_summary := case when v_new ->> 'linked_project_id' is null
                        then format('%s unlinked from CAPEX project %s', v_label,
                                    coalesce(activity_project_name((v_old ->> 'linked_project_id')::uuid), '—'))
                        else format('%s linked to CAPEX project %s (%s)', v_label,
                                    coalesce(activity_project_name((v_new ->> 'linked_project_id')::uuid), '—'),
                                    coalesce(v_new ->> 'link_source', '—')) end;
    elsif v_changed && array['queue','epdd_status'] then
      v_action  := 'pdd_status';
      v_summary := format('%s "%s" on E-PDD: %s -> %s', v_label, v_row ->> 'project_name',
                          coalesce(v_old ->> 'epdd_status', v_old ->> 'queue', '—'),
                          coalesce(v_new ->> 'epdd_status', v_new ->> 'queue', '—'));
    elsif 'seen_at' = any (v_changed) and v_new ->> 'seen_at' is not null then
      v_action  := 'pdd_opened';
      v_summary := format('%s "%s" opened on PMO Review', v_label, v_row ->> 'project_name');
    elsif 'content_hash' = any (v_changed) then
      v_action  := 'pdd_changed';
      v_summary := format('%s "%s" changed on E-PDD', v_label, v_row ->> 'project_name');
    else
      return new;  -- other sync bookkeeping
    end if;
  elsif tg_table_name = 'user_webauthn_credentials' then
    v_summary := format('Passkey %s for %s%s', v_verb,
                        coalesce(activity_user_name((v_row ->> 'user_id')::uuid), 'a user'),
                        coalesce(' (' || nullif(v_row ->> 'device_label', '') || ')', ''));
  else
    v_summary := format('%s %s', tg_table_name, v_verb);
  end if;

  if v_label is not null then
    v_details := v_details || jsonb_build_object('label', v_label);
  end if;

  insert into public.activity_log
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values
    (v_actor, v_name, v_role, v_action, tg_table_name, v_id, v_summary, v_details);

  return coalesce(new, old);
end $function$;

revoke execute on function public.activity_project_name(uuid) from public, anon, authenticated;
revoke execute on function public.activity_past_name(uuid)    from public, anon, authenticated;
revoke execute on function public.activity_user_name(uuid)    from public, anon, authenticated;

create trigger trg_past_projects_activity after insert or update or delete on public.past_projects
  for each row execute function public.log_activity();
create trigger trg_past_updates_activity after insert or update or delete on public.past_project_updates
  for each row execute function public.log_activity();
create trigger trg_past_pm_messages_activity after insert or update or delete on public.past_pm_messages
  for each row execute function public.log_activity();
create trigger trg_cashflows_activity after insert or update or delete on public.project_cashflows
  for each row execute function public.log_activity();
create trigger trg_risks_activity after insert or update or delete on public.project_risks
  for each row execute function public.log_activity();
create trigger trg_attachments_activity after insert or update or delete on public.project_attachments
  for each row execute function public.log_activity();
create trigger trg_raci_activity after insert or update or delete on public.project_raci
  for each row execute function public.log_activity();
create trigger trg_carry_forward_activity after insert or update or delete on public.carry_forward_projects
  for each row execute function public.log_activity();
create trigger trg_settings_activity after insert or update or delete on public.settings
  for each row execute function public.log_activity();
create trigger trg_lessons_activity after insert or update or delete on public.lessons_learned
  for each row execute function public.log_activity();
create trigger trg_benefits_activity after insert or update or delete on public.benefits_realized
  for each row execute function public.log_activity();
create trigger trg_campuses_activity after insert or update or delete on public.campuses
  for each row execute function public.log_activity();
create trigger trg_cost_centers_activity after insert or update or delete on public.cost_centers
  for each row execute function public.log_activity();
create trigger trg_sectors_activity after insert or update or delete on public.sectors
  for each row execute function public.log_activity();
create trigger trg_segments_activity after insert or update or delete on public.segments
  for each row execute function public.log_activity();
create trigger trg_regions_activity after insert or update or delete on public.regions
  for each row execute function public.log_activity();
create trigger trg_epdd_pdds_activity after insert or update or delete on public.epdd_pdds
  for each row execute function public.log_activity();
create trigger trg_passkeys_activity after insert or update or delete on public.user_webauthn_credentials
  for each row execute function public.log_activity();
