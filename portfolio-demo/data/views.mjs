// Portfolio demo: the database views, worked out from the tables (replicas of the portal's SQL views).
// Used by the generator (gen.mjs) to build the seed and by the demo backend in the page to work them
// out again after every change, so a figure edited on one page is the same on every other page.
// Plain JavaScript, no Node or browser APIs.
export const SPI_T = 1, CPI_T = 1;              // settings.spi_threshold / cpi_threshold
export const day = (s) => Math.round(new Date(String(s).slice(0, 10) + "T00:00:00Z").getTime() / 864e5);
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const num = (v) => Number(v) || 0;

export function metrics(p, today) {             // project_metrics
  const eff = p.actual_start_date || p.start_date;
  let el = null;
  if (eff && p.end_date && day(p.end_date) > day(eff)) {
    el = day(today) <= day(eff) ? 0 : day(today) >= day(p.end_date) ? 1 : (day(today) - day(eff)) / (day(p.end_date) - day(eff));
  }
  const bac = num(p.bac), ac = num(p.actual_cost), pct = num(p.pct_complete), rel = num(p.amount_released);
  const ev = bac * pct / 100;
  const appr = ["approved", "closed"].includes(p.workflow_stage);
  const schedule_flag = p.manual_schedule_flag ?? (!appr || rel == 0 || el == null ? "not_started" : ev >= bac * el * SPI_T ? "on_time" : "delayed");
  const budget_flag = p.manual_budget_flag ?? (!appr || ac == 0 || pct == 0 ? "not_started" : ev >= ac * CPI_T ? "within" : "over");
  return { ...p, effective_start: eff, earned_value: r(ev, 2), time_elapsed_fraction: r(el ?? 0, 4), planned_value: r(bac * (el ?? 0), 2),
    cpi: ac > 0 ? r(ev / ac, 3) : null, spi: bac * (el ?? 0) > 0 ? r(ev / (bac * el), 3) : null,
    eac: ac > 0 && ev > 0 ? r(bac / (ev / ac), 2) : null,
    cost_variance: ac > 0 ? r(ev - ac, 2) : null, schedule_variance: r(ev - bac * (el ?? 0), 2),
    schedule_flag, budget_flag };
}

export function dashboard(rows, today) {        // portfolio_metrics + portfolio_dashboard
  const m = rows.filter(p => p.portfolio === "capex").map(p => metrics(p, today));
  const S = (f, w = () => true) => m.filter(w).reduce((s, p) => s + Number(f(p) || 0), 0);
  const C = (w) => m.filter(w).length;
  const rep = (p) => p.pct_complete > 0, ncf = (p) => !p.is_carry_forward;
  const ev = S(p => p.earned_value), pv = S(p => p.planned_value, rep), ac = S(p => p.actual_cost, rep);
  const cpi = ac > 0 ? r(ev / ac, 3) : null, spi = pv > 0 ? r(ev / pv, 3) : null;
  return {
    total_projects: m.length, pdd_not_submitted_count: C(p => p.workflow_stage === "pdd_not_submitted" && ncf(p)),
    identified_count: C(p => p.workflow_stage === "identified" && ncf(p)), pdds_submitted: C(p => p.workflow_stage === "identified" && ncf(p)),
    in_df: C(p => p.workflow_stage === "df_review" && ncf(p)), in_ed: C(p => p.workflow_stage === "ed_review" && ncf(p)), in_mt: C(p => p.workflow_stage === "mt_review" && ncf(p)),
    approved_count: C(p => p.workflow_stage === "approved" && ncf(p)), closed_count: C(p => p.workflow_stage === "closed"),
    on_time_count: C(p => p.schedule_flag === "on_time" && p.workflow_stage === "approved"), delayed_count: C(p => p.schedule_flag === "delayed" && p.workflow_stage === "approved"),
    over_budget_count: C(p => p.budget_flag === "over" && p.workflow_stage === "approved"), scope_change_count: C(p => p.scope_change),
    carry_forward_count: C(p => p.is_carry_forward), carry_forward_amount: S(p => p.bac, p => p.is_carry_forward),
    payments_pending_count: C(p => p.payments_pending), payments_pending_amount: S(p => p.bac, p => p.payments_pending),
    su_requested_total: S(p => p.su_requested_amount, ncf), df_recommended_total: S(p => p.df_recommended_amount, ncf), approved_total: S(p => p.bac, ncf),
    budget_reduction: S(p => p.su_requested_amount, ncf) - S(p => p.df_recommended_amount, ncf),
    total_capex: S(p => p.df_recommended_amount), budget_consumed: S(p => p.amount_released), budget_remaining: S(p => p.df_recommended_amount) - S(p => p.amount_released),
    payments_made_total: S(p => p.payments_made),
    total_ev: r(ev, 2), total_pv: r(pv, 2), total_ac: ac, portfolio_cpi: cpi, portfolio_spi: spi,
    portfolio_health: cpi == null || spi == null ? "Insufficient Data" : cpi >= CPI_T && spi >= SPI_T ? "Good" : cpi < CPI_T - 0.05 && spi < SPI_T - 0.05 ? "Critical" : "At Risk",
    reporting_progress_count: C(rep),
  };
}

export function investmentMetrics(rows) {
  const m = rows.filter(p => p.portfolio === "investment");
  const S = (f) => m.reduce((s, p) => s + Number(p[f] || 0), 0);
  return { total_projects: m.length, su_requested_total: S("su_requested_amount"), df_recommended_total: S("df_recommended_amount"), approved_total: S("bac"),
    released_total: S("amount_released"), payments_made_total: S("payments_made"), approved_count: m.filter(p => p.workflow_stage === "approved").length };
}

export const atRisk = (rows, today) => rows.filter(p => p.end_date && p.workflow_stage !== "closed" && day(p.end_date) - day(today) <= 20)
  .sort((a, b) => day(a.end_date) - day(b.end_date))
  .map(p => ({ id: p.id, code: p.code, name: p.name, campus: p.campus, workflow_stage: p.workflow_stage, df_recommended_amount: p.df_recommended_amount, end_date: p.end_date, days_remaining: day(p.end_date) - day(today) }));

export const sevOf = (pr, im) => pr === "high" && im === "high" ? "critical" : (pr === "high" && im === "medium") || (pr === "medium" && im === "high") ? "high" : pr === "low" && im === "low" ? "low" : "medium";
export const scored = (risks, projects) => risks.map(x => { const p = projects.find(q => q.id === x.project_id);
  const { _story, ...y } = x; return { ...y, project_name: p?.name ?? null, project_code: p?.code ?? null, project_campus: p?.campus ?? null, severity: sevOf(x.probability, x.impact) }; });

export function taskRollup(rows, fk) {
  const ids = [...new Set(rows.map(t => t[fk]))];
  return ids.map(id => { const lv = rows.filter(t => t[fk] === id && !rows.some(c => c.parent_id === t.id));
    const w = (t) => Math.max(t.end_date && t.start_date ? day(t.end_date) - day(t.start_date) : 0, 1);
    const W = lv.reduce((s, t) => s + w(t), 0);
    return { [fk]: id, task_count: lv.length, milestone_count: lv.filter(t => t.is_milestone).length, tasks_start: lv.map(t => t.start_date).filter(Boolean).sort()[0] || null,
      tasks_end: lv.map(t => t.end_date).filter(Boolean).sort().at(-1) || null, baseline_start: lv.map(t => t.baseline_start).filter(Boolean).sort()[0] || null,
      baseline_end: lv.map(t => t.baseline_end).filter(Boolean).sort().at(-1) || null, last_updated: lv.map(t => t.updated_at).filter(Boolean).sort().at(-1) || null,
      weighted_pct: W > 0 ? r(lv.reduce((s, t) => s + Number(t.pct_complete) * w(t), 0) / W, 1) : null }; });
}

export const pastSummary = (past, updates, users, today) => past.map(p => { const u = users.find(x => x.id === p.pm_user_id);
  const ups = updates.filter(m => m.past_project_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { ...p, pm_name: u?.full_name || u?.username || null, pm_email: u?.email || null, update_count: ups.length, last_update_at: ups.at(-1)?.created_at || null,
    last_update_role: ups.at(-1)?.author_role || null, days_since_followup: p.last_followed_up ? day(today) - day(p.last_followed_up) : null }; });

// Lessons / benefits with the project's name and code (lessons_learned_full, benefits_realized_full).
export const withProject = (rows, projects) => rows.map(x => { const p = projects.find(q => q.id === x.project_id);
  return { ...x, project_name: p?.name ?? null, project_code: p?.code ?? null, project_campus: p?.campus ?? null }; });

/** Every view, worked out from the tables (in place). */
export function recomputeViews(t, today) {
  const projects = t.projects || [];
  const dash = dashboard(projects, today);
  t.project_metrics = projects.map(p => metrics(p, today));
  t.portfolio_dashboard = [dash];
  t.portfolio_metrics = [{ ...dash }];
  t.investment_metrics = [investmentMetrics(projects)];
  t.at_risk_projects = atRisk(projects, today);
  t.project_risks_scored = scored(t.project_risks || [], projects);
  t.project_task_rollup = taskRollup(t.project_tasks || [], "project_id");
  t.past_project_task_rollup = taskRollup(t.past_project_tasks || [], "past_project_id");
  t.past_project_summary = pastSummary(t.past_projects || [], t.past_project_updates || [], t.user_profiles || [], today);
  if (t.lessons_learned) t.lessons_learned_full = withProject(t.lessons_learned, projects);
  if (t.benefits_realized) t.benefits_realized_full = withProject(t.benefits_realized, projects);
  return t;
}
