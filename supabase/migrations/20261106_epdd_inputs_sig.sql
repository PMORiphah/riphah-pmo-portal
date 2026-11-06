-- Egress fix (6 Nov 2026): a 32-character fingerprint of everything the E-PDD code review depends on.
-- epdd-sync compares it with the fingerprint saved after its last clean pass and skips the full review
-- (about 2 MB read per run, 288 runs a day) when nothing changed. Service role only.
create or replace function public.epdd_inputs_sig()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('|',
    (select string_agg(concat_ws(',', p.id, p.code, p.name, p.campus, p.df_recommended_amount, p.workflow_stage,
                                 p.portfolio, p.fiscal_year, cc.name), ';' order by p.id)
       from projects p left join cost_centers cc on cc.id = p.cost_center_id),
    (select string_agg(concat_ws(',', id, content_hash, linked_project_id, link_source, queue, is_history), ';' order by id)
       from epdd_pdds),
    (select string_agg(concat_ws(',', id, pdd_id, category, title, file_name, status, attempts, sha256, storage_path, mime, size_bytes), ';' order by id)
       from epdd_files),
    (select string_agg(concat_ws(',', id, pdd_id, content_hash, status, model), ';' order by id)
       from epdd_reviews)
  ))
$$;
revoke all on function public.epdd_inputs_sig() from public, anon, authenticated;
grant execute on function public.epdd_inputs_sig() to service_role;
