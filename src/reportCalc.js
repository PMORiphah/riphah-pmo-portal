/* ═══════════════════════════════════════════════════════════════════════════
   BOARD REPORT — figures (PMO, 8 Oct 2026)

   Pure arithmetic over rows: no React, no network of its own. `loadReportRows`
   fetches through the `get` it is handed (the portal's REST helper in the
   browser, a plain fetch in a node test), `computeFigures` turns the rows into
   one plain object that is saved with a published report and never changes.

   Rules it keeps (CLAUDE.md):
   - Approved = workflow_stage approved or closed; never portfolio_dashboard's
     approved_count (it leaves closed out).
   - DF Recommended is the base; investment is never CAPEX; PMDC is inside
     CAPEX and shown on its own line (projects with `pmdc` cash-flow rows).
   - "Released" is money disbursed to a project, never "spent".
   - Past projects: never "still to release".
   - Sums unrounded; rounding only when shown.

   Month-end figures: the projects as they stood at the end of the month are
   rebuilt from the Activity Log, walking back from today's rows (an update is
   undone with its `old` values, a creation removes the row, a deletion puts
   the logged row back). This reproduces the 25 Sep 2026 ground truth to the
   rupee. Nothing before 21 Aug 2026 09:39:55 UTC can be rebuilt (every
   project was re-imported then). Risks, PDDs, carry forward and past projects
   have no such history: they are read as they are when the report is built.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CALC_VERSION = "board-1";
export const REPLAY_FLOOR = "2026-08-21T09:39:55Z";
const PKT = 5 * 3600 * 1000;

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-09" → { start, end (exclusive), label } in Pakistan time.
export function periodOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - PKT);
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - PKT);
  return { ym, start: start.toISOString(), end: end.toISOString(), label: `${LONG[m - 1]} ${y}`, short: `${MONTHS[m - 1]} ${y}` };
}
export const prevYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const pktDay = (iso) => new Date(new Date(iso).getTime() + PKT).toISOString().slice(0, 10);
const ymOfDate = (d) => String(d || "").slice(0, 7);

/* ── Fetching ──────────────────────────────────────────────────────────────── */
export async function loadReportRows(get) {
  const all = async (path, page = 1000) => {
    const out = [];
    for (let from = 0; ; from += page) {
      const rows = await get(`${path}${path.includes("?") ? "&" : "?"}limit=${page}&offset=${from}`);
      if (!Array.isArray(rows)) throw new Error(rows?.message || "Could not read " + path.split("?")[0]);
      out.push(...rows);
      if (rows.length < page) return out;
    }
  };
  const [projects, log, assignments, profiles, campuses, segments, sectors, cashflows, risks, pdds, carry, past, settings] = await Promise.all([
    all("projects?select=*&order=id.asc"),
    all(`activity_log?entity_type=eq.projects&created_at=gte.${REPLAY_FLOOR}&select=id,action,entity_id,details,created_at&order=created_at.desc,id.desc`),
    all("project_assignments?select=project_id,user_id"),
    all("user_profiles?select=id,full_name,username,role"),
    get("campuses?select=id,name"),
    get("segments?select=id,name,sort_order"),
    get("sectors?select=id,name,sort_order"),
    all("project_cashflows?select=project_id,month,amount,bucket"),
    all("project_risks_scored?select=id,project_id,title,category,status,owner,mitigation_plan,severity,date_last_reviewed,project_name,project_code,project_campus"),
    all("epdd_pdds?select=id,pdd_number,project_name,campus,epdd_status,queue,source_created_at,is_history,approvals,linked_project_id"),
    all("carry_forward_projects?select=amount,status"),
    all("past_projects?select=id,status,approved_amount,released_amount,reason_open,budget_release_date,fiscal_year,campus"),
    get("settings?key=in.(dashboard_kpis,team_config)&select=key,value"),
  ]);
  return { projects, log, assignments, profiles, campuses, segments, sectors, cashflows, risks, pdds, carry, past, settings };
}

/* ── The projects as they stood at a moment ───────────────────────────────── */
export function projectsAt(projects, log, atIso) {
  const at = new Date(atIso).getTime();
  const state = new Map(projects.map(p => [p.id, { ...p }]));
  // Newest first: undo everything logged after `at`.
  for (const e of log) {
    if (new Date(e.created_at).getTime() <= at) break;
    const d = e.details, id = e.entity_id;
    if (!d || !id) continue;                                   // browser-side notes carry no data
    if (e.action === "updated" || e.action === "stage_changed") {
      if (!d.old || !state.has(id)) continue;
      Object.assign(state.get(id), d.old);
    } else if (e.action === "created") {
      state.delete(id);
    } else if (e.action === "deleted") {
      if (d.id) state.set(id, { ...d });                       // the trigger's row (the browser's {comments_deleted} has no id)
    }
  }
  return [...state.values()];
}

/* ── Figures ───────────────────────────────────────────────────────────────── */
const isApproved = (p) => p.workflow_stage === "approved" || p.workflow_stage === "closed";
const STAGES = ["pdd_not_submitted", "identified", "df_review", "ed_review", "mt_review", "approved", "closed"];
export const STAGE_NAME = { pdd_not_submitted: "PDD not submitted", identified: "PDD submitted", df_review: "DF review",
  ed_review: "ED review", mt_review: "MT review", approved: "Approved (in execution)", closed: "Closed" };
const SEVERITY = ["critical", "high", "medium", "low"];

// "23 Sep 2026 01:55 PM" (E-PDD history, Pakistan time) → ISO
function epddWhen(s) {
  const m = String(s || "").match(/^(\d{1,2}) (\w{3}) (\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]); if (mon < 0) return null;
  let h = Number(m[4]) % 12; if (m[6] === "PM") h += 12;
  return new Date(Date.UTC(Number(m[3]), mon, Number(m[1]), h, Number(m[5])) - PKT).toISOString();
}

export function computeFigures(rows, { ym, asAt, builtAt }) {
  const per = periodOf(ym);
  const atIso = asAt;                                          // end of the month, or now for the month in progress
  const all = projectsAt(rows.projects, rows.log, atIso);
  const capex = all.filter(p => (p.portfolio || "capex") === "capex");
  const inv = all.filter(p => p.portfolio === "investment");
  const name = (list, id) => (list || []).find(x => x.id === id)?.name || null;
  const pmOf = new Map();
  for (const a of rows.assignments) {
    const u = rows.profiles.find(x => x.id === a.user_id);
    if (!pmOf.has(a.project_id)) pmOf.set(a.project_id, []);
    pmOf.get(a.project_id).push(u?.full_name || u?.username || "—");
  }
  const sum = (list, f) => list.reduce((s, p) => s + num(f(p)), 0);
  const brief = (p) => ({ id: p.id, code: p.code && p.code !== "-" ? String(p.code).trim() : "", name: p.name, campus: p.campus || "",
    stage: p.workflow_stage, df: num(p.df_recommended_amount), bac: num(p.bac), released: num(p.amount_released),
    release_date: p.budget_release_date || null, pm: (pmOf.get(p.id) || []).join(", ") });

  // Headline
  const approved = capex.filter(isApproved);
  const relOnApproved = sum(approved, p => p.amount_released);
  const headline = {
    capex_count: capex.length,
    df_total: sum(capex, p => p.df_recommended_amount),
    approved_count: approved.length,
    approved_in_execution: capex.filter(p => p.workflow_stage === "approved").length,
    approved_closed: capex.filter(p => p.workflow_stage === "closed").length,
    approved_bac: sum(approved, p => p.bac),
    released_total: sum(capex, p => p.amount_released),
    released_projects: capex.filter(p => num(p.amount_released) > 0).length,
    released_on_approved: relOnApproved,
    approved_not_released: sum(approved, p => p.bac) - relOnApproved,
    investment_count: inv.length,
    investment_df: sum(inv, p => p.df_recommended_amount),
    investment_released: sum(inv, p => p.amount_released),
  };
  headline.released_pct_of_df = headline.df_total ? headline.released_total / headline.df_total : 0;

  // PMDC: CAPEX projects that carry pmdc cash-flow rows
  const pmdcIds = new Set(rows.cashflows.filter(c => c.bucket === "pmdc" && c.project_id).map(c => c.project_id));
  const pmdc = capex.filter(p => pmdcIds.has(p.id));
  headline.pmdc_count = pmdc.length;
  headline.pmdc_df = sum(pmdc, p => p.df_recommended_amount);

  // Pipeline
  const stages = STAGES.map(s => {
    const l = capex.filter(p => (p.workflow_stage || "pdd_not_submitted") === s);
    return { stage: s, label: STAGE_NAME[s], count: l.length, df: sum(l, p => p.df_recommended_amount) };
  }).filter(x => x.count > 0 || ["pdd_not_submitted", "df_review", "ed_review", "mt_review", "approved", "closed"].includes(x.stage));

  // Moved to Approved in the portal during the month (net: still approved at its end)
  const endMs = new Date(per.end).getTime(), startMs = new Date(per.start).getTime(), atMs = new Date(atIso).getTime();
  const movedIds = new Set();
  for (const e of rows.log) {
    const t = new Date(e.created_at).getTime();
    if (t > Math.min(endMs, atMs) || t < startMs || !e.details?.new) continue;
    if (e.details.new.workflow_stage === "approved" && e.details.old?.workflow_stage && !isApproved(e.details.old)) movedIds.add(e.entity_id);
  }
  const movedToApproved = capex.filter(p => movedIds.has(p.id) && isApproved(p)).map(brief).sort((a, b) => b.bac - a.bac);

  // Needs attention (computed, fixed wording in the page)
  const attention = {
    approved_nothing_released: approved.filter(p => num(p.amount_released) === 0 && p.workflow_stage === "approved").map(brief).sort((a, b) => b.bac - a.bac),
    released_before_approval: capex.filter(p => !isApproved(p) && num(p.amount_released) > 0).map(brief).sort((a, b) => b.released - a.released),
    without_pm: capex.filter(p => !pmOf.has(p.id)).map(brief).sort((a, b) => b.df - a.df),
  };

  // Releases by month (one release date per project; Cashflows page definition)
  const relByMonth = {};
  for (const p of capex) {
    if (num(p.amount_released) <= 0 || !p.budget_release_date) continue;
    const k = ymOfDate(p.budget_release_date);
    if (k > ym) continue;
    relByMonth[k] = relByMonth[k] || { amount: 0, count: 0 };
    relByMonth[k].amount += num(p.amount_released); relByMonth[k].count++;
  }
  const releasedUndated = capex.filter(p => num(p.amount_released) > 0 && !p.budget_release_date).length;

  // Cash-flow plan (FY Jul–Jun), CAPEX incl. PMDC, by month; and released cumulative
  const planByMonth = {};
  let planOnDeleted = 0;
  const liveIds = new Set(capex.map(p => p.id));
  for (const c of rows.cashflows) {
    if (c.bucket === "investment") continue;
    if (!c.project_id || !liveIds.has(c.project_id)) { planOnDeleted += num(c.amount); continue; }
    const k = ymOfDate(c.month);
    planByMonth[k] = (planByMonth[k] || 0) + num(c.amount);
  }
  const fyMonths = []; { let y = 2026, m = 7; for (let i = 0; i < 12; i++) { fyMonths.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } }
  let cp = 0, cr = 0;
  const funding = fyMonths.map(k => {
    cp += planByMonth[k] || 0;
    const r = relByMonth[k]?.amount || 0; if (k <= ym) cr += r;
    return { ym: k, plan: planByMonth[k] || 0, plan_cum: cp, released: k <= ym ? r : null, released_cum: k <= ym ? cr : null, released_count: relByMonth[k]?.count || 0 };
  });
  // Releases dated before the fiscal year (none expected) still count in the cumulative.
  const preFy = Object.entries(relByMonth).filter(([k]) => k < "2026-07").reduce((s, [, v]) => s + v.amount, 0);
  if (preFy) funding.forEach(f => { if (f.released_cum != null) f.released_cum += preFy; });
  const planTotal = Object.values(planByMonth).reduce((s, v) => s + v, 0);

  // Breakdowns
  const group = (keyOf, labelOf) => {
    const m = new Map();
    for (const p of capex) {
      const k = keyOf(p) ?? "—";
      if (!m.has(k)) m.set(k, { key: k, label: labelOf(k), count: 0, df: 0, approved_count: 0, bac: 0, released: 0 });
      const g = m.get(k);
      g.count++; g.df += num(p.df_recommended_amount); g.released += num(p.amount_released);
      if (isApproved(p)) { g.approved_count++; g.bac += num(p.bac); }
    }
    return [...m.values()].sort((a, b) => b.df - a.df);
  };
  const PRIORITY = { top_priority: "1st Priority", first_priority: "First Priority", second_priority: "2nd Priority", third_priority: "3rd Priority", carry_forward: "Carry Forward" };
  const breakdown = {
    campus: group(p => p.campus || null, k => k === "—" ? "No campus" : k),
    organisation: group(p => p.segment_id || null, k => name(rows.segments, k) || "Not set"),
    segment: group(p => p.sector_id || null, k => name(rows.sectors, k) || "Not set"),
    priority: group(p => p.priority || null, k => PRIORITY[k] || "Not set"),
    type: group(p => p.project_type || null, k => k === "—" ? "Not set" : k),
  };
  const top = [...capex].sort((a, b) => num(b.df_recommended_amount) - num(a.df_recommended_amount)).slice(0, 10).map(brief);

  // Risks (as they are today)
  const openRisks = rows.risks.filter(r => (r.status || "open") !== "closed");
  const sevCount = Object.fromEntries(SEVERITY.map(s => [s, openRisks.filter(r => r.severity === s).length]));
  const dfOf = new Map(all.map(p => [p.id, num(p.df_recommended_amount)]));
  const topRisks = [...openRisks].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || (dfOf.get(b.project_id) || 0) - (dfOf.get(a.project_id) || 0))
    .slice(0, 8).map(r => ({ project: r.project_name, code: r.project_code, campus: r.project_campus, title: r.title, severity: r.severity, owner: r.owner, mitigation: r.mitigation_plan }));
  const lastReviewed = openRisks.map(r => r.date_last_reviewed).filter(Boolean).sort().pop() || null;
  const risks = { open: openRisks.length, by_severity: sevCount, projects: new Set(openRisks.map(r => r.project_id)).size, top: topRisks, last_reviewed: lastReviewed };

  // PDD intake (E-PDD; document stage, not sanction)
  const inMonth = (iso) => iso && iso >= per.start && iso < per.end;
  const pddIn = rows.pdds.filter(p => inMonth(p.source_created_at));
  let pmoApproved = 0, sentBack = 0;
  for (const p of rows.pdds) for (const a of (Array.isArray(p.approvals) ? p.approvals : [])) {
    if (a.kind !== "decision") continue;
    const w = epddWhen(a.when); if (!inMonth(w)) continue;
    if (a.role === "Manager PMO" && a.status === "Recommended") pmoApproved++;
    if (a.role === "PMO Reviewer" && a.status === "Rejected") sentBack++;
  }
  const pdds = { received: pddIn.length, pmo_approved: pmoApproved, sent_back: sentBack,
    waiting_now: rows.pdds.filter(p => p.queue === "manage").length };

  // Earlier years
  const cfBy = {};
  for (const c of rows.carry) { const k = c.status || "Not set"; cfBy[k] = cfBy[k] || { status: k, count: 0, amount: 0 }; cfBy[k].count++; cfBy[k].amount += num(c.amount); }
  const carry = { count: rows.carry.length, amount: sum(rows.carry, c => c.amount), credits: rows.carry.filter(c => num(c.amount) < 0).length,
    by_status: Object.values(cfBy).sort((a, b) => b.amount - a.amount) };
  const openPast = rows.past.filter(p => p.status !== "closed");
  const today = new Date(builtAt).getTime();
  const band = (d) => { if (!d) return "undated"; const mo = (today - new Date(d).getTime()) / (30.44 * 864e5); return mo < 6 ? "under6" : mo <= 12 ? "6to12" : "over12"; };
  const ages = { under6: 0, "6to12": 0, over12: 0, undated: 0 };
  openPast.forEach(p => { ages[band(p.budget_release_date)]++; });
  const pastApproved = sum(openPast, p => p.approved_amount), pastReleased = sum(openPast, p => p.released_amount);
  const past = { open: openPast.length, approved: pastApproved, released: pastReleased, released_pct: pastApproved ? pastReleased / pastApproved : 0,
    no_progress: openPast.filter(p => /no progress/i.test(p.reason_open || "")).length, ages };

  // Project register (appendix)
  const register = [...capex].sort((a, b) => (a.campus || "").localeCompare(b.campus || "") || num(b.df_recommended_amount) - num(a.df_recommended_amount)).map(brief);

  const kpis = rows.settings.find(s => s.key === "dashboard_kpis")?.value || {};
  const suList = Array.isArray(kpis.su_requested?.list) ? kpis.su_requested.list : [];
  const published = { su_requested: suList.length ? { total: suList.reduce((s, x) => s + num(x.amount), 0), proposals: suList.length } : null };

  return {
    calc_version: CALC_VERSION, ym, period: per.label, as_at: atIso, built_at: builtAt,
    month_in_progress: new Date(atIso).getTime() < endMs,
    headline, stages, moved_to_approved: movedToApproved, attention,
    funding: { months: funding, plan_total: planTotal, plan_on_deleted: planOnDeleted, released_undated: releasedUndated, pmdc_df: headline.pmdc_df },
    breakdown, top, risks, pdds, carry, past, register, published,
  };
}

// The "since last report" figures for the summary tiles.
export const DELTA_KEYS = ["capex_count", "df_total", "approved_count", "approved_bac", "released_total", "approved_not_released", "investment_released"];
export function deltas(cur, prev) {
  if (!prev?.headline) return null;
  return Object.fromEntries(DELTA_KEYS.map(k => [k, num(cur.headline[k]) - num(prev.headline[k])]));
}

// "PKR 691.5M" / "691,453,848"
export const fmtM = (n, d = 1) => `${(num(n) / 1e6).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d })}M`;
export const fmtPKR = (n) => Math.round(num(n)).toLocaleString("en");
export const fmtPct = (x, d = 1) => `${(num(x) * 100).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const fmtDay = (iso) => { if (!iso) return "—"; const d = pktDay(iso); const [y, m, dd] = d.split("-"); return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`; };
