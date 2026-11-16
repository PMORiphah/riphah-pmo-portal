-- PMO Goals reminders (PMO, 16 Nov 2026): daily 09:30 PKT emails (Monday to Friday; Monday covers the weekend) to the owner of each open task that is
-- due today or exactly 3, 7, 15 or 30 days overdue (edge function goals-reminders).
-- 1. PMO-only setting with the team's addresses (values entered in the database, never in the repo):
--    insert into public.settings (key, value) values ('goals_reminders',
--      '{"enabled": true, "emails": {"pmo_todo": "...", "head_pmo": "...", "manager_pmo": "...",
--        "exec_pmo": "...", "po1": "...", "po2": "..."}}') on conflict (key) do update set value = excluded.value;
-- 2. pg_cron job 4, 04:30 UTC = 09:30 PKT, same auth pattern as jobs 1-3 (anon Bearer + x-cron-secret):
select cron.schedule('goals-reminders', '30 4 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/goals-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<anon key, as in jobs 1-3>',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000) as request_id;
$$);
