-- Inventory: Import SAP sheet (PMO, 29 Oct 2026). Shown to the PMO before it is run.
--
-- The PMO now loads SAP ME2J exports on the Inventory page. When a later sheet of a fiscal year no longer has a
-- line the portal holds, the line is kept and marked (PMO decision 29 Oct 2026): not_in_sheet_since = when the
-- import found it missing. The page leaves such lines out of the list and totals ("Not in latest SAP sheet"
-- under the SAP status filter); a later sheet that has the line again clears the mark.
-- Additive only: one nullable column, nothing removed, existing rows unchanged (all null). The table keeps its
-- grants and its PMO-only policy.

alter table public.inventory_items add column not_in_sheet_since timestamptz;
comment on column public.inventory_items.not_in_sheet_since is
  'Set by Import SAP sheet when the latest ME2J sheet of this line''s fiscal year does not have it; null = in the latest sheet.';
