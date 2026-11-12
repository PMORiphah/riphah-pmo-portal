-- 12 Nov 2026: the name of who made the PR is asked by the page (pop-up, required there) but optional in the
-- database, so a page that does not send it yet (production before the redesign) can still tick a PR.
-- Applied as pmo_tasks_pr_made_by_optional. Unticking still clears pr_made_by.
create or replace function public.trg_pmo_tasks_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    new.done_at := case when new.done then now() end;
    new.done_by := case when new.done then auth.uid() end;
    if not new.done then new.pr_made_by := null; end if;
    return new;
  end if;
  new.created_at := old.created_at; new.created_by := old.created_by;
  if old.removed then new.removed := true; end if;
  if new.done and not old.done then new.done_at := now(); new.done_by := auth.uid();
  elsif new.done then new.done_at := old.done_at; new.done_by := old.done_by;
  else new.done_at := null; new.done_by := null; new.pr_made_by := null;
  end if;
  return new;
end;
$$;
