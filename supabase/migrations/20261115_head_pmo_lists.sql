-- Head PMO list on PMO Goals and Head PMO credit on PMO Achievements (PMO, 15 Nov 2026).
-- Widens two value checks to include 'head_pmo'. Existing rows all satisfy the new checks.
alter table public.pmo_tasks drop constraint pmo_tasks_list_check;
alter table public.pmo_tasks add constraint pmo_tasks_list_check
  check (list = any (array['pmo_todo','pending_pr','head_pmo','manager_pmo','exec_pmo','po1','po2']));
alter table public.pmo_achievements drop constraint pmo_achievements_credit_check;
alter table public.pmo_achievements add constraint pmo_achievements_credit_check
  check (credit = any (array['team','head_pmo','manager_pmo','exec_pmo','po1','po2']));
