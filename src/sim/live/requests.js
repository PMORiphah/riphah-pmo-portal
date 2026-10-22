// PMO Simulation (live data): the GET requests the toured screens make, recorded at launch and
// replayed verbatim by the backend. PUBLIC, no data: paths and placeholders only.
// Owner: B1. Spec: contract §B.3
//
// Each template: { id, path, table, embeds?, src, plan? }
//   path    exactly as the App passes it to supa() (App.jsx:157 prefixes SUPA_URL). Placeholders:
//           {me} PMO user id · {storyId} plan.story.id · {storyPmId} plan.story.pmId
//           {updatesId} plan.updates.projectId · {pastId} plan.past.id · {reportId} plan.report.id
//           A template whose placeholder is null in the plan is not recorded.
//   table   the table/view whose column policies apply to the top-level rows
//   embeds  { "<alias path>": "<table>" } for embedded resources (dotted for nesting), so masking
//           and validation apply per table inside embeds too
//   src     where the App makes the request (for the replay-miss test)
// The replay key is keyOf(path) = pathname + search of new URL(SUPA_ORIGIN + path) (WHATWG
// normalisation, identical in the browser and in Node).
export const SUPA_ORIGIN = "https://prmxkecomqqngvrmytcj.supabase.co";
export const keyOf = (path) => { const u = new URL(SUPA_ORIGIN + path); return u.pathname + u.search; };

const PROJ_DASH = "/rest/v1/projects?portfolio=eq.capex&select=id,start_date,code,name,bac,su_requested_amount,df_recommended_amount,amount_released,project_type,payments_pending,fiscal_year,workflow_stage,priority,manual_schedule_flag,manual_budget_flag,is_carry_forward,scope_change,segments(name),sectors(name)&order=code.asc";
const PROJ_BREAK = "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,bac,amount_released,payments_made,fiscal_year,start_date,budget_release_date,df_recommended_amount,workflow_stage,priority,segments(name),sectors(name),strategic_priority";
const PROJ_LIST = "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,fiscal_year,strategic_priority,workflow_stage,priority,bac,df_recommended_amount,amount_released,pct_complete,is_carry_forward,payments_pending,pcr,project_type,campus,sectors(name),regions(name),segments(name),cost_centers(name)&order=code.asc";
const PERF = "/rest/v1/project_metrics?select=id,code,name,workflow_stage,priority,is_carry_forward,pct_complete,bac,amount_released,earned_value,planned_value,time_elapsed_fraction,cpi,spi,eac,cost_variance,schedule_variance,schedule_flag,budget_flag,start_date,end_date&workflow_stage=in.(approved,closed)&order=code.asc";
const SITES_PM = "/rest/v1/project_metrics?portfolio=eq.capex&select=id,code,name,bac,df_recommended_amount,amount_released,workflow_stage,priority,pct_complete,is_carry_forward,schedule_flag,budget_flag,cpi,spi&order=code.asc";
const TIMELINE = "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,campus,workflow_stage,start_date,end_date,actual_start_date,actual_end_date,pct_complete,bac,amount_released&order=campus.asc,start_date.asc";
const GALLERY = "/rest/v1/project_attachments?kind=eq.site_visit&select=id,project_id,file_name,file_path,mime_type,uploaded_at,uploaded_by_name,projects(name,code,campus,fiscal_year,strategic_priority,sectors(name),segments(name),cost_centers(name))&order=uploaded_at.desc&limit=200";
const GALLERY_EMBEDS = { projects: "projects", "projects.sectors": "sectors", "projects.segments": "segments", "projects.cost_centers": "cost_centers" };
const LOOKUP_EMBEDS = { sectors: "sectors", regions: "regions", segments: "segments", cost_centers: "cost_centers" };

export const TEMPLATES = Object.freeze([
  // ── shell (every screen) ──
  { id: "shell.title", path: "/rest/v1/settings?select=key,value&key=in.(dashboard_title,fiscal_year)", table: "settings", src: "App.jsx:12169" },
  { id: "shell.dashboard", path: "/rest/v1/portfolio_dashboard?select=*", table: "portfolio_dashboard", src: "App.jsx:12124, 3256" },
  { id: "shell.freshness", path: "/rest/v1/activity_log?select=created_at&order=created_at.desc&limit=1", table: "activity_log", src: "App.jsx:12106" },
  { id: "shell.unread.comments", path: "/rest/v1/comments?select=id,author_id", table: "comments", src: "App.jsx:11827" },
  { id: "shell.unread.reads", path: "/rest/v1/comment_reads?select=comment_id", table: "comment_reads", src: "App.jsx:11828, 9414, 9455" },
  { id: "shell.past.reads", path: "/rest/v1/past_chat_reads?select=thread,read_at", table: "past_chat_reads", src: "PastProjects.jsx:236" },
  { id: "shell.past.pm", path: "/rest/v1/past_pm_messages?select=pm_user_id,past_project_id,author_id,created_at", table: "past_pm_messages", src: "PastProjects.jsx:237" },
  { id: "shell.past.updates", path: "/rest/v1/past_project_updates?select=past_project_id,author_id,created_at", table: "past_project_updates", src: "PastProjects.jsx:238" },
  { id: "shell.reports.mine", path: "/rest/v1/board_report_recipients?user_id=eq.{me}&removed=is.false&select=report_id,seen_at", table: "board_report_recipients", src: "App.jsx:11779" },
  { id: "shell.review.badge", path: "/rest/v1/epdd_pdds?select=id&is_history=eq.false&seen_at=is.null&queue=neq.removed", table: "epdd_pdds", src: "App.jsx:11806" },
  // ── Capex Dashboard ──
  { id: "dash.carry", path: "/rest/v1/carry_forward_projects?select=amount", table: "carry_forward_projects", src: "App.jsx:3252" },
  { id: "dash.kpis", path: "/rest/v1/settings?key=eq.dashboard_kpis&select=value", table: "settings", src: "App.jsx:3257" },
  { id: "dash.projects", path: PROJ_DASH, table: "projects", embeds: { segments: "segments", sectors: "sectors" }, src: "App.jsx:3258" },
  { id: "dash.metrics", path: "/rest/v1/project_metrics?portfolio=eq.capex&select=id,schedule_flag,budget_flag,cpi,spi", table: "project_metrics", src: "App.jsx:3259" },
  { id: "dash.breakdown.projects", path: PROJ_BREAK, table: "projects", embeds: { segments: "segments", sectors: "sectors" }, src: "App.jsx:2292" },
  { id: "dash.breakdown.targets", path: "/rest/v1/settings?key=eq.dashboard_breakdowns&select=value", table: "settings", src: "App.jsx:2293" },
  { id: "inv.rows", path: "/rest/v1/project_metrics?portfolio=eq.investment&select=*&order=su_requested_amount.desc", table: "project_metrics", src: "InvestmentsTab.jsx:63" },
  { id: "inv.totals", path: "/rest/v1/investment_metrics?select=*", table: "investment_metrics", src: "InvestmentsTab.jsx:65" },
  // Payments Made (Investments card and window; the Payments Status card's View payments window)
  { id: "pay.rows", path: "/rest/v1/project_payments?select=id,project_id,paid_on,dept,payee,particulars,gross,tax,net,source&order=paid_on.asc", table: "project_payments", src: "PaymentsWindow.jsx:26 (PAY_PATH), InvestmentsTab.jsx:76" },
  { id: "pay.capex.projects", path: "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,payments_made", table: "projects", src: "PaymentsWindow.jsx:27" },
  // ── Project Cashflows ──
  { id: "cf.rows", path: "/rest/v1/project_cashflows?select=*&order=month.asc", table: "project_cashflows", src: "Cashflows.jsx:155" },
  { id: "cf.released", path: "/rest/v1/projects?portfolio=eq.capex&select=name,amount_released,budget_release_date&amount_released=gt.0&order=budget_release_date.asc", table: "projects", src: "Cashflows.jsx:156" },
  { id: "cf.poll.total", path: "/rest/v1/portfolio_dashboard?select=total_capex", table: "portfolio_dashboard", src: "Cashflows.jsx:170" },
  { id: "cf.poll.ids", path: "/rest/v1/projects?portfolio=eq.capex&select=id", table: "projects", src: "Cashflows.jsx:171" },
  // ── Projects ──
  { id: "proj.list", path: PROJ_LIST, table: "projects", embeds: LOOKUP_EMBEDS, src: "App.jsx:4612" },
  { id: "lookup.sectors", path: "/rest/v1/sectors?select=id,name&order=name.asc", table: "sectors", src: "App.jsx:4613" },
  { id: "lookup.regions", path: "/rest/v1/regions?select=id,name&order=name.asc", table: "regions", src: "App.jsx:4614" },
  { id: "lookup.segments", path: "/rest/v1/segments?select=id,name&order=name.asc", table: "segments", src: "App.jsx:4615" },
  { id: "lookup.cost_centers", path: "/rest/v1/cost_centers?select=id,name&order=name.asc", table: "cost_centers", src: "App.jsx:4616" },
  { id: "lookup.campuses", path: "/rest/v1/campuses?select=id,name&order=name.asc", table: "campuses", src: "App.jsx:4617, 5747" },
  // ── Project page (the story project) ──
  { id: "story.metrics", path: "/rest/v1/project_metrics?id=eq.{storyId}&select=*", table: "project_metrics", src: "App.jsx:7323" },
  { id: "story.project", path: "/rest/v1/projects?id=eq.{storyId}&select=*,sectors(name),regions(name),segments(name),cost_centers(name,code)", table: "projects", embeds: LOOKUP_EMBEDS, src: "App.jsx:7324" },
  { id: "story.assignment", path: "/rest/v1/project_assignments?project_id=eq.{storyId}&select=user_id&limit=1", table: "project_assignments", src: "App.jsx:7325" },
  { id: "story.comments", path: "/rest/v1/comments?project_id=eq.{storyId}&select=id", table: "comments", src: "App.jsx:7326" },
  { id: "story.pm", path: "/rest/v1/user_profiles?id=eq.{storyPmId}&select=id,username,full_name,role,email,phone,whatsapp_opt_in", table: "user_profiles", src: "App.jsx:7331" },
  { id: "pm.choices", path: "/rest/v1/user_profiles?role=eq.project_manager&is_active=eq.true&select=id,username,full_name&order=full_name.asc", table: "user_profiles", src: "App.jsx:7337, 5489" },
  { id: "story.documents", path: "/rest/v1/project_attachments?project_id=eq.{storyId}&kind=eq.document&select=*&order=sort_order.asc,uploaded_at.desc", table: "project_attachments", src: "App.jsx:6821" },
  { id: "story.raci", path: "/rest/v1/project_raci?project_id=eq.{storyId}&select=*&order=raci_role.asc,sort_order.asc", table: "project_raci", src: "RaciCard.jsx:457" },
  { id: "users.active", path: "/rest/v1/user_profiles?is_active=eq.true&select=id,username,full_name,role&order=full_name.asc", table: "user_profiles", src: "RaciCard.jsx:468, PastProjects.jsx:1468" },
  { id: "story.tasks", path: "/rest/v1/project_tasks?project_id=eq.{storyId}&select=*&order=sort_order.asc,created_at.asc", table: "project_tasks", src: "Tasks.jsx:552" },
  // project_attachments?select=file_size (App.jsx:6832, the storage bar) is NOT recorded: its rows
  // carry no id, so left-out media cannot be removed from it; the engine answers it from the table.
  // ── Performance ──
  { id: "perf.rows", path: PERF, table: "project_metrics", src: "App.jsx:6473" },
  // ── Risk Register ──
  { id: "risks.rows", path: "/rest/v1/project_risks_scored?select=*&order=date_identified.desc", table: "project_risks_scored", src: "RiskRegister.jsx:414" },
  { id: "risks.projects", path: "/rest/v1/projects?portfolio=eq.capex&select=id,name&order=name.asc", table: "projects", src: "RiskRegister.jsx:437" },
  // ── Campus / Sites ──
  { id: "sites.metrics", path: SITES_PM, table: "project_metrics", src: "App.jsx:5745" },
  { id: "sites.projects", path: "/rest/v1/projects?portfolio=eq.capex&select=id,campus,cost_centers(name)", table: "projects", embeds: { cost_centers: "cost_centers" }, src: "App.jsx:5746" },
  { id: "sites.kpis", path: "/rest/v1/settings?select=value&key=eq.dashboard_kpis", table: "settings", src: "App.jsx:5833" },
  { id: "cmp.projects", path: "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,campus,workflow_stage,df_recommended_amount,bac,amount_released,end_date,actual_end_date", table: "projects", src: "CampusCompare.jsx:39" },
  { id: "cmp.assignments", path: "/rest/v1/project_assignments?select=project_id,user_id", table: "project_assignments", src: "CampusCompare.jsx:40" },
  { id: "cmp.users", path: "/rest/v1/user_profiles?select=id,full_name,username", table: "user_profiles", src: "CampusCompare.jsx:41" },
  { id: "cmp.risks", path: "/rest/v1/project_risks?select=project_id,status", table: "project_risks", src: "CampusCompare.jsx:42" },
  { id: "cmp.deliverables", path: "/rest/v1/project_deliverables?select=project_id,status,confirmed,superseded", table: "project_deliverables", src: "CampusCompare.jsx:43" },
  { id: "cmp.past", path: "/rest/v1/past_projects?select=campus,status", table: "past_projects", src: "CampusCompare.jsx:48" },
  // Assign PM: project_assignments?project_id=in.(…) and user_profiles?id=in.(…) (App.jsx:5491, 5499)
  // are built from earlier results and are NOT recorded (engine).
  // ── Timeline & Schedule ──
  { id: "tl.projects", path: TIMELINE, table: "projects", src: "Timeline.jsx:42" },
  { id: "tl.rollup", path: "/rest/v1/project_task_rollup?select=*", table: "project_task_rollup", src: "Timeline.jsx:48" },
  // ── User Management ──
  { id: "users.rows", path: "/rest/v1/user_profiles?select=id,username,full_name,email,phone,whatsapp_opt_in,role,is_active,created_at&order=role.asc,username.asc", table: "user_profiles", src: "App.jsx:8259" },
  { id: "users.assignments", path: "/rest/v1/project_assignments?select=user_id,project_id,projects(code,name)", table: "project_assignments", embeds: { projects: "projects" }, src: "App.jsx:8260" },
  { id: "users.projects", path: "/rest/v1/projects?select=id,code,name,workflow_stage&order=code.asc", table: "projects", src: "App.jsx:8261" },
  // ── Updates ──
  { id: "upd.projects", path: "/rest/v1/projects?select=id,code,name&order=code.asc", table: "projects", src: "App.jsx:9404" },
  { id: "upd.summary", path: "/rest/v1/comments?select=id,project_id,author_id,is_read_by_pmo,created_at,author_role,user_profiles!comments_author_id_fkey(role)&order=created_at.desc", table: "comments", embeds: { user_profiles: "user_profiles" }, src: "App.jsx:9408" },
  { id: "upd.thread", path: "/rest/v1/comments?project_id=eq.{updatesId}&select=id,body,parent_id,author_id,author_name,author_role,is_read_by_pmo,created_at,user_profiles!comments_author_id_fkey(username,full_name,role)&order=created_at.asc", table: "comments", embeds: { user_profiles: "user_profiles" }, src: "App.jsx:9439" },
  { id: "upd.thread.assign", path: "/rest/v1/project_assignments?project_id=eq.{updatesId}&select=user_id", table: "project_assignments", src: "App.jsx:9446" },
  // user_profiles?id=in.(…)&is_active=eq.true&select=id,full_name,username,phone (App.jsx:9449): engine.
  // ── Past Projects ──
  { id: "past.summary", path: "/rest/v1/past_project_summary?select=*&order=fiscal_year.desc", table: "past_project_summary", src: "PastProjects.jsx:1445" },
  { id: "past.rollup", path: "/rest/v1/past_project_task_rollup?select=*", table: "past_project_task_rollup", src: "PastProjects.jsx:1451" },
  { id: "past.pm.last", path: "/rest/v1/past_pm_messages?select=pm_user_id,author_role,body,created_at&order=created_at.desc&limit=500", table: "past_pm_messages", src: "PastProjects.jsx:1425" },
  { id: "past.assignments", path: "/rest/v1/project_assignments?select=user_id", table: "project_assignments", src: "PastProjects.jsx:1470" },
  { id: "past.thread", path: "/rest/v1/past_project_updates?past_project_id=eq.{pastId}&select=*&order=created_at.asc", table: "past_project_updates", src: "PastProjects.jsx:741" },
  { id: "past.tasks", path: "/rest/v1/past_project_tasks?past_project_id=eq.{pastId}&select=*&order=sort_order.asc,created_at.asc", table: "past_project_tasks", src: "Tasks.jsx:552 (kind=past)" },
  // ── Gallery ──
  { id: "gallery.rows", path: GALLERY, table: "project_attachments", embeds: GALLERY_EMBEDS, src: "PhotoWall.jsx:76" },
  // ── Monthly Report ──
  { id: "report.list", path: "/rest/v1/board_reports?select=id,title,period,kind,status,as_at,note,published_at,created_at&order=period.desc,created_at.desc", table: "board_reports", src: "BoardReport.jsx:565" },
  { id: "report.recipients", path: "/rest/v1/board_report_recipients?select=report_id,user_id,removed,seen_at,emailed_at", table: "board_report_recipients", src: "BoardReport.jsx:566" },
  { id: "report.open", path: "/rest/v1/board_reports?id=eq.{reportId}&select=*", table: "board_reports", src: "BoardReport.jsx:581" },
  // ── Team & About ──
  { id: "team.settings", path: "/rest/v1/settings?select=key,value&key=in.(about_us,team_config,contact_info)", table: "settings", src: "App.jsx:10009" },
]);

/** Placeholder names used by a template path. */
export const placeholdersOf = (path) => [...String(path).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** The path with its placeholders filled (encodeURIComponent), or null when one is missing. */
export function fill(path, ids) {
  let miss = false;
  const out = String(path).replace(/\{(\w+)\}/g, (_, k) => { const v = ids?.[k]; if (v == null || v === "") { miss = true; return ""; } return encodeURIComponent(String(v)); });
  return miss ? null : out;
}
