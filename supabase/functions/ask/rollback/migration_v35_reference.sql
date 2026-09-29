-- Migration: assistant_v35_and_view_security  (29 Sep 2026)

-- 1. SECURITY FIX. These five views run with their owner's rights, so they
--    ignore row-level security: a project manager reads all 104 projects'
--    metrics, and anyone holding the public anon key (no sign-in) can read
--    at_risk_projects (names, codes, DF amounts) and investment_metrics.
--    security_invoker makes each view apply the reader's own RLS, like the
--    other 10 views already do. PMO and guests see exactly what they see
--    today; project managers see only their own projects; signed-out
--    visitors see nothing. The 9 am digest reads these with the service key,
--    which is not affected.
alter view public.project_metrics     set (security_invoker = true);
alter view public.portfolio_metrics   set (security_invoker = true);
alter view public.portfolio_dashboard set (security_invoker = true);
alter view public.investment_metrics  set (security_invoker = true);
alter view public.at_risk_projects    set (security_invoker = true);

-- 2. One row per project for the assistant, all portfolios, RLS applied
--    (security invoker: the caller only gets the projects they can see).
create or replace function public.assistant_rows()
returns table (code text, name text, portfolio text, campus text, stage text,
               cost_center text, priority text, df_recommended numeric,
               approved numeric, released numeric, start_date date, end_date date,
               actual_end_date date, pct_complete numeric, pm text, risks integer,
               has_charter boolean)
language sql stable security invoker set search_path = public
as $$
  select coalesce(nullif(p.code, '-'), ''), p.name, coalesce(p.portfolio::text, 'capex'),
         p.campus, p.workflow_stage::text, cc.name, p.priority::text,
         coalesce(p.df_recommended_amount, 0), coalesce(p.bac, 0), coalesce(p.amount_released, 0),
         p.start_date, p.end_date, p.actual_end_date, p.pct_complete,
         (select string_agg(coalesce(up.full_name, up.username), ', '
                            order by coalesce(up.full_name, up.username))
            from project_assignments a join user_profiles up on up.id = a.user_id
           where a.project_id = p.id),
         (select count(*)::int from project_risks r where r.project_id = p.id),
         exists (select 1 from project_attachments att
                  where att.project_id = p.id
                    and (att.file_name ilike 'PDD%' or att.file_name ilike 'EPDD%'))
  from projects p
  left join cost_centers cc on cc.id = p.cost_center_id
  order by p.name;
$$;
revoke execute on function public.assistant_rows() from public, anon;
grant execute on function public.assistant_rows() to authenticated, service_role;

-- 3. The Gemini key (stored in Vault as gemini_api_key) for the ask function,
--    readable by the server only, exactly like get_assistant_key() for Groq.
create or replace function public.get_gemini_key()
returns text
language sql stable security definer set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key' limit 1; $$;
revoke execute on function public.get_gemini_key() from public, anon, authenticated;
grant execute on function public.get_gemini_key() to service_role;
