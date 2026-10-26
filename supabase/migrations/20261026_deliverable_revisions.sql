-- Revised deliverables (PMO, 26 Oct 2026). Shown to the PMO before it is run.
--
-- During procurement a different item can be bought against a PDD line (another model, quantity or price).
-- The PMO records the revision on the line; the original stays exactly as the PDD (or charter) has it, and the
-- Deliverables tab shows a "Revised to" column whenever any line of the project is revised.
-- The revision lives in its own columns: sync_project_deliverables() (which keeps the original in step with the
-- E-PDD) never writes them, so a later PDD change cannot wipe a revision.
-- Only the PMO can revise or undo a revision; a project manager still changes only status, date and note.
-- The Activity Log records it like any other change (log_activity on this table already runs).
-- Additive only: nothing is removed. Undo of the feature = the columns stay empty and unused.

alter table public.project_deliverables
  add column revised_title     text,
  add column revised_qty       numeric,
  add column revised_unit      text,
  add column revised_unit_cost numeric,
  add column revised_total     numeric,
  add column revised_reason    text,
  add column revised_at        timestamptz,
  add column revised_by        uuid,
  add column revised_by_name   text;

-- A line counts as revised when it has a revised item; the other revised figures are optional.
alter table public.project_deliverables
  add constraint deliverables_revision_chk check (
    (revised_title is null and revised_qty is null and revised_unit is null and revised_unit_cost is null
       and revised_total is null and revised_reason is null)
    or length(btrim(revised_title)) > 0);

-- The guard: the revision columns join the ones only the PMO may change.
create or replace function public.trg_deliverables_guard()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- Who revised it and when are stamped by the server, never typed.
  if (new.revised_title, new.revised_qty, new.revised_unit, new.revised_unit_cost, new.revised_total, new.revised_reason)
     is distinct from
     (old.revised_title, old.revised_qty, old.revised_unit, old.revised_unit_cost, old.revised_total, old.revised_reason) then
    if new.revised_title is null then
      new.revised_at := null; new.revised_by := null; new.revised_by_name := null;
    else
      new.revised_at := now(); new.revised_by := auth.uid();
      new.revised_by_name := (select coalesce(full_name, username) from user_profiles where id = auth.uid());
    end if;
  else
    new.revised_at := old.revised_at; new.revised_by := old.revised_by; new.revised_by_name := old.revised_by_name;
  end if;
  if auth.uid() is null or is_pmo() then return new; end if;
  if (new.project_id, new.source, new.pdd_id, new.line_no, new.title, new.qty, new.unit, new.unit_cost,
      new.total, new.currency, new.confirmed, new.superseded, new.prev_unit_cost, new.prev_total,
      new.price_changed_at, new.sort_order,
      new.revised_title, new.revised_qty, new.revised_unit, new.revised_unit_cost, new.revised_total, new.revised_reason)
     is distinct from
     (old.project_id, old.source, old.pdd_id, old.line_no, old.title, old.qty, old.unit, old.unit_cost,
      old.total, old.currency, old.confirmed, old.superseded, old.prev_unit_cost, old.prev_total,
      old.price_changed_at, old.sort_order,
      old.revised_title, old.revised_qty, old.revised_unit, old.revised_unit_cost, old.revised_total, old.revised_reason) then
    raise exception 'Only the PMO can change a deliverable''s item, quantity or price';
  end if;
  return new;
end;
$$;

-- After applying: get_advisors (security); in a rolled-back transaction check that the PMO can revise and undo
-- (stamped by and when), the project's manager and a guest cannot, the manager can still tick and note, and
-- sync_project_deliverables() on a revised line keeps the revision.
