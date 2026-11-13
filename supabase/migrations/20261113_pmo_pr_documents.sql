-- PR documents (PMO, 13 Nov 2026): a project's PRs tab. Each ticked Pending PR (pmo_tasks, list pending_pr) can
-- carry its Comparative Statement (CS), read by AI (edge function pr-cs-extract: items, approved vendor, total,
-- other vendors), and a screenshot of the "PR released" email (its date and subject read by AI, the PMO may
-- correct the date). PMO only (RLS is_pmo()). Files are stored in R2, bucket project-attachments, under the
-- project's or past project's id (uploaded through the `files` function, PMO only); file_access_r2 lets the PMO
-- open them and r2_orphans keeps them. Removal is soft (removed = true; the file stays for the record).
-- Additive only.

create table if not exists public.pmo_pr_documents (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.pmo_tasks(id) on delete cascade,
  kind             text not null check (kind in ('cs', 'release_email')),
  file_name        text not null check (length(file_name) between 1 and 200),
  file_path        text not null unique check (length(file_path) between 1 and 600),
  mime_type        text,
  size_bytes       bigint,
  -- AI reading (written by pr-cs-extract with the PMO's own token)
  reading          jsonb,
  model            text,
  read_at          timestamptz,
  read_error       text,
  -- CS figures kept as columns for the tab's totals
  item_count       integer check (item_count is null or item_count >= 0),
  approved_vendor  text,
  total_amount     numeric(16,2),
  currency         text,
  -- release email
  released_on      date,
  email_subject    text,
  confirmed        boolean not null default false,
  confirmed_at     timestamptz,
  confirmed_by     uuid,
  removed          boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now()
);
create index if not exists pmo_pr_documents_task_idx on public.pmo_pr_documents (task_id) where not removed;
comment on table public.pmo_pr_documents is 'PR documents for the project PRs tab (PMO only): the Comparative Statement of a PR (kind cs, read by AI) and the PR released email screenshot (kind release_email).';

alter table public.pmo_pr_documents enable row level security;
create policy pmo_pr_documents_pmo on public.pmo_pr_documents for all to authenticated
  using (is_pmo()) with check (is_pmo());
grant select on public.pmo_pr_documents to anon;
grant select, insert, update, delete on public.pmo_pr_documents to authenticated, service_role;

-- Server stamps; the file and its PR never change after upload; a document only on a Pending PR task.
create or replace function public.trg_pmo_pr_documents_stamp()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.removed := false;
    if not exists (select 1 from public.pmo_tasks t where t.id = new.task_id and t.list = 'pending_pr') then
      raise exception 'A PR document belongs to a Pending PR task' using errcode = 'check_violation';
    end if;
  else
    new.task_id := old.task_id; new.kind := old.kind; new.file_path := old.file_path;
    new.created_at := old.created_at; new.created_by := old.created_by;
    if old.removed then new.removed := true; end if;
  end if;
  if new.confirmed and (tg_op = 'INSERT' or not old.confirmed) then
    new.confirmed_at := now(); new.confirmed_by := auth.uid();
  elsif not new.confirmed then
    new.confirmed_at := null; new.confirmed_by := null;
  end if;
  return new;
end;
$$;
create trigger trg_pmo_pr_documents_stamp before insert or update on public.pmo_pr_documents
  for each row execute function public.trg_pmo_pr_documents_stamp();

-- Activity Log: "PR document added / read / confirmed / removed on <project>: CS <file>".
create or replace function public.log_pmo_pr_document()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text; v_role user_role; v_what text; v_proj text; v_kind text; v_extra text := '';
  t public.pmo_tasks;
begin
  if tg_op = 'INSERT' then v_what := 'added';
  elsif new.removed and not old.removed then v_what := 'removed';
  elsif new.confirmed and not old.confirmed then v_what := 'confirmed';
  elsif old.confirmed and not new.confirmed then v_what := 'unconfirmed';
  elsif new.read_at is distinct from old.read_at then v_what := 'read';
  elsif new.released_on is distinct from old.released_on then v_what := 'release date changed';
  else return new;
  end if;
  select * into t from public.pmo_tasks where id = new.task_id;
  v_proj := coalesce(
    case when t.project_id is not null then activity_project_name(t.project_id) end,
    (select coalesce(nullif(btrim(case when code ~ '[[:alnum:]]' then code || ' ' else '' end || name), ''), 'a past project')
       from public.past_projects where id = t.past_project_id),
    'a project');
  v_kind := case new.kind when 'cs' then 'CS' else 'PR released email' end;
  if new.kind = 'cs' and new.total_amount is not null and v_what in ('read', 'confirmed') then
    v_extra := format(' · %s items · %s %s', coalesce(new.item_count, 0), coalesce(new.currency, 'PKR'), to_char(new.total_amount, 'FM999,999,999,990'))
               || coalesce(' · ' || left(new.approved_vendor, 60), '');
  elsif new.kind = 'release_email' and new.released_on is not null and v_what <> 'removed' then
    v_extra := ' · released ' || to_char(new.released_on, 'DD Mon YYYY');
  end if;
  select username, role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, details)
  values (auth.uid(), coalesce(v_name, 'System'), v_role, case when tg_op = 'INSERT' then 'created' else 'updated' end,
          'pmo_pr_documents', new.id::text,
          format('PR document %s on %s: %s %s%s', v_what, v_proj, v_kind, left(new.file_name, 80), v_extra),
          jsonb_build_object('task_id', new.task_id, 'project_id', t.project_id, 'past_project_id', t.past_project_id,
                             'kind', new.kind, 'file_name', new.file_name, 'item_count', new.item_count,
                             'total_amount', new.total_amount, 'approved_vendor', new.approved_vendor,
                             'released_on', new.released_on, 'confirmed', new.confirmed, 'removed', new.removed,
                             'label', left(new.file_name, 90)));
  return new;
end;
$$;
revoke execute on function public.log_pmo_pr_document() from public, anon, authenticated;
create trigger trg_log_pmo_pr_document after insert or update on public.pmo_pr_documents
  for each row execute function public.log_pmo_pr_document();

-- The PMO may open PR documents (R2 links from the `files` function).
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
         or (is_pmo() and exists (select 1 from pmo_pr_documents d where d.file_path = p))
       when 'epdd-files' then is_pmo()
       when 'sim-shares' then is_pmo() or can_read_sim_file(p)
       else false end;
$function$;

-- The nightly tidy-up keeps PR documents (they have no Documents record).
create or replace function public.r2_orphans(p_limit integer default 200)
 returns table(bucket text, path text)
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select r.bucket, r.path from public.r2_objects r
   where (r.origin = 'supabase'
          and not exists (select 1 from storage.objects o where o.bucket_id = r.bucket and o.name = r.path))
      or (r.origin = 'r2' and r.bucket = 'project-attachments' and r.copied_at < now() - interval '1 day'
          and not exists (select 1 from public.project_attachments a where a.file_path = r.path)
          and not exists (select 1 from public.pmo_pr_documents d where d.file_path = r.path))
   limit p_limit;
$function$;
