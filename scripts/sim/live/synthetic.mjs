// PMO Simulation (live data) tests: a small, entirely invented snapshot (tables only). PUBLIC.
// No real person, project or campus names and no real figures: every value below is made up so the
// narration rules can be tested without the private fixture. Used by select.test.mjs and
// narration.test.mjs.
//
// What the data is built to give (checked by the tests):
//   4 campuses (North 5 CAPEX, South 4, East 3, West 2), 14 CAPEX projects + 1 investment.
//   Story = NX-01 "Renovation of XQZ Hall" (North): approved, 60 % done, fully released, a PDD file.
//   Compare: defaults by DF = South, North; trio by count = North, South, East.
//   Assign: East has 2 open projects without a PM.
export const NOW = Date.parse("2031-03-10T05:30:00Z");            // 10 Mar 2031, 10:30 PKT

const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const IDS = {
  campus: (n) => id("c", n), project: (n) => id("a", n), user: (n) => id("b", n), att: (n) => id("d", n),
  comment: (n) => id("e", n), past: (n) => id("f", n), pastMsg: (n) => id("f1", n), risk: (n) => id("f2", n),
  report: (n) => id("f3", n), assign: (n) => id("f4", n), cash: (n) => id("f5", n),
};

const CAMPUSES = [["North Campus", 1], ["South Campus", 2], ["East Campus", 3], ["West Campus", 4]];

// [n, code, name, campus, stage, df, bac, released, pct, end, scheduleFlag, budgetFlag, payments]
const P = [
  [1, "NX-01", "Renovation of XQZ Hall", "North Campus", "approved", 20e6, 20e6, 20e6, 60, "2031-06-30", "on_time", "within", 0],
  [2, "NX-02", "Upgrade of Reading Room", "North Campus", "approved", 8e6, 8e6, 4e6, 0, "2031-02-01", "delayed", "not_started", 500000],
  [3, "NX-03", "Purchase of Lab Benches", "North Campus", "pdd_not_submitted", 5e6, 0, 0, 0, "2031-08-31", null, null, 0],
  [4, "NX-04", "Extension of Main Gate", "North Campus", "ed_review", 6e6, 0, 0, 0, "2031-09-30", null, null, 0],
  [5, "NX-05", "Office Furniture North", "North Campus", "closed", 1e6, 1e6, 1e6, 100, "2030-12-31", "on_time", "within", 0],
  [6, "SX-01", "Construction of Sports Court", "South Campus", "approved", 60e6, 50e6, 30e6, 0, "2031-12-31", "delayed", "not_started", 0],
  [7, "SX-02", "Installation of Solar Panels", "South Campus", "df_review", 15e6, 0, 0, 0, "2031-10-31", null, null, 0],
  [8, "SX-03", "Hostel Kitchen Equipment", "South Campus", "pdd_not_submitted", 4e6, 0, 0, 0, "2031-07-31", null, null, 0],
  [9, "SX-04", "Upgrade of Server Room", "South Campus", "ed_review", 9e6, 0, 0, 0, "2031-11-30", null, null, 0],
  [10, "EX-01", "Refurbishment of Clinic", "East Campus", "approved", 10e6, 10e6, 1e6, 0, "2031-05-31", "delayed", "not_started", 0],
  [11, "EX-02", "Procurement of Lab Kits", "East Campus", "pdd_not_submitted", 3e6, 0, 0, 0, "2031-06-30", null, null, 0],
  [12, "EX-03", "Lifts for East Block", "East Campus", "mt_review", 7e6, 0, 0, 0, "2031-09-30", null, null, 0],
  [13, "WX-01", "Restoration of Old Library", "West Campus", "approved", 12e6, 12e6, 12e6, 20, "2031-04-30", "on_time", "within", 0],
  [14, "WX-02", "Kiosk at West Gate", "West Campus", "pdd_not_submitted", 2e6, 0, 0, 0, null, null, null, 0],
];
const INVEST = [15, "IV-01", "Endowment Fund Placement", "North Campus", "approved", 30e6, 30e6, 30e6, 0, "2031-06-30", "on_time", "within", 0];

const USERS = [   // table order = role asc (pmo, project_manager, guest), username asc
  [1, "PMO", "Office Lead", "pmo"],
  [2, "pm.alpha", "Alpha Person", "project_manager"],
  [3, "pm.bravo", "Bravo Person", "project_manager"],
  [4, "pm.charlie", "Charlie Person", "project_manager"],
  [5, "pmtestuser", "Test Person", "project_manager"],
  [6, "pm.delta", "Delta Person", "project_manager"],
  [7, "viewer.one", "Viewer One", "guest"],
];
// project n → user n
const ASSIGN = [[1, 2], [2, 2], [3, 2], [6, 3], [7, 3], [8, 3], [9, 3], [10, 4], [13, 6], [14, 6], [5, 2]];

export function syntheticTables() {
  const campuses = CAMPUSES.map(([name, n]) => ({ id: IDS.campus(n), name, sort_order: n }));
  const campusId = Object.fromEntries(campuses.map((c) => [c.name, c.id]));
  const row = ([n, code, name, campus, stage, df, bac, rel, pct, end, sf, bf, pay], portfolio = "capex") => ({
    id: IDS.project(n), code, name, campus, campus_id: campusId[campus], portfolio, workflow_stage: stage,
    df_recommended_amount: df, su_requested_amount: df, bac, amount_released: rel, payments_made: pay, pct_complete: pct,
    start_date: end ? "2030-07-01" : null, end_date: end, actual_end_date: stage === "closed" ? "2031-01-15" : null,
    fiscal_year: "FY 2030-31",
  });
  const projects = [...P.map((p) => row(p)), row(INVEST, "investment")];
  const metrics = [...P, INVEST].map((p) => ({ ...row(p, p === INVEST ? "investment" : "capex"), schedule_flag: p[10], budget_flag: p[11] }));
  const capex = projects.filter((p) => p.portfolio === "capex");
  const sum = (f) => capex.reduce((s, p) => s + f(p), 0);
  const stageN = (s) => capex.filter((p) => p.workflow_stage === s).length;
  const portfolio_dashboard = [{
    total_projects: capex.length, total_capex: sum((p) => p.df_recommended_amount), df_recommended_total: sum((p) => p.df_recommended_amount),
    budget_consumed: sum((p) => p.amount_released), payments_made_total: sum((p) => p.payments_made),
    pdd_not_submitted_count: stageN("pdd_not_submitted"), in_df: stageN("df_review"), in_ed: stageN("ed_review"), in_mt: stageN("mt_review"),
    approved_count: stageN("approved"), closed_count: stageN("closed"), reporting_progress_count: 3,
  }];
  const investment_metrics = [{ total_projects: 1, su_requested_total: 30e6, df_recommended_total: 30e6, approved_total: 30e6, released_total: 30e6, approved_count: 1 }];
  const settings = [
    { key: "fiscal_year", value: "FY 2030-31" },
    { key: "dashboard_kpis", value: {
      df_recommended: { value: "", sub: "" },
      remaining_capex: { value: "", sub: "41.0% awaiting approval" },
      approved_projects: { value: "", insight: "Sanctioned — 2 of 9 projects." },
      su_requested: { value: "9.9M", sub: "From 12 proposals" },
      total_projects: { value: "", sub: "All projects" },
    } },
  ];
  const user_profiles = USERS.map(([n, username, full_name, role]) => ({ id: IDS.user(n), username, full_name, role, is_active: true,
    email: "hidden for the presentation", phone: null }));
  const project_assignments = ASSIGN.map(([p, u], i) => ({ id: IDS.assign(i + 1), project_id: IDS.project(p), user_id: IDS.user(u) }));
  const att = (n, p, kind, file_name, uploaded_at, mime = "application/pdf", sort_order = 0) => ({
    id: IDS.att(n), project_id: IDS.project(p), kind, file_name, file_path: `x/${n}`, mime_type: mime, uploaded_at, sort_order });
  const project_attachments = [
    att(1, 1, "document", "PDD XQZ Hall.pdf", "2030-09-01T10:00:00Z"),
    att(2, 1, "document", "Quotation.pdf", "2030-09-02T10:00:00Z", "application/pdf", 1),
    att(3, 13, "document", "Old Library plan.pdf", "2030-10-01T10:00:00Z"),
    att(4, 5, "document", "Handover note.pdf", "2031-01-20T10:00:00Z"),
    att(10, 6, "site_visit", "court-1.jpg", "2031-03-01T08:00:00Z", "image/jpeg"),
    att(11, 6, "site_visit", "court-2.jpg", "2031-03-01T09:00:00Z", "image/jpeg"),
    att(12, 6, "site_visit", "court-walk.mp4", "2031-03-02T09:00:00Z", "video/mp4"),
    att(13, 1, "site_visit", "Screenshot hall.png", "2031-03-03T09:00:00Z", "image/png"),
    att(14, 1, "site_visit", "hall-1.jpg", "2031-03-04T09:00:00Z", "image/jpeg"),
    att(15, 15, "site_visit", "fund.jpg", "2031-03-05T09:00:00Z", "image/jpeg"),
  ];
  const comments = [
    { id: IDS.comment(1), project_id: IDS.project(6), author_role: "pmo", created_at: "2031-03-01T10:00:00Z" },
    { id: IDS.comment(2), project_id: IDS.project(6), author_role: "project_manager", created_at: "2031-03-02T10:00:00Z" },
    { id: IDS.comment(3), project_id: IDS.project(10), author_role: "project_manager", created_at: "2031-03-08T10:00:00Z" },
    { id: IDS.comment(4), project_id: IDS.project(10), author_role: "pmo", created_at: "2031-03-09T10:00:00Z" },
  ];
  const past_project_summary = [
    { id: IDS.past(1), code: "PX-01", name: "Establishment of Quartz Studio", campus: "North Campus", status: "open", approved_amount: 5e6, released_amount: 5e6, pm_user_id: IDS.user(2), reason_open: "In Progress", pm_name: "Alpha Person" },
    { id: IDS.past(2), code: "PX-02", name: "Repair of Quartz Fence", campus: "South Campus", status: "open", approved_amount: 2e6, released_amount: 1e6, pm_user_id: IDS.user(3), reason_open: "No progress", pm_name: "Bravo Person" },
    { id: IDS.past(3), code: "PX-03", name: "Paving of Yard", campus: "East Campus", status: "closed", approved_amount: 1e6, released_amount: 1e6, pm_user_id: IDS.user(4), reason_open: "", pm_name: "Charlie Person" },
  ];
  const msg = (n, past, author, at) => ({ id: IDS.pastMsg(n), past_project_id: IDS.past(past), author_id: IDS.user(author), created_at: at });
  const past_project_updates = [msg(1, 1, 1, "2031-02-20T10:00:00Z"), msg(2, 1, 2, "2031-02-21T10:00:00Z"), msg(3, 1, 1, "2031-03-01T10:00:00Z"),
    msg(4, 1, 2, "2031-03-05T10:00:00Z"), msg(5, 2, 1, "2031-03-01T10:00:00Z")];
  const risk = (n, p, prob, impact, status, title, severity) => ({ id: IDS.risk(n), project_id: IDS.project(p), probability: prob, impact, status, title, severity });
  const project_risks_scored = [   // date_identified desc
    risk(1, 5, "medium", "high", "open", "Supplier may be late", "high"),
    risk(2, 6, "medium", "high", "open", "Ground conditions unknown", "high"),
    risk(3, 10, "medium", "high", "open", "Supplier may be late", "high"),
    risk(4, 1, "low", "medium", "mitigated", "Noise complaints", "medium"),
    risk(5, 13, "medium", "medium", "open", "Scope creep", "medium"),
  ];
  const cash = (n, month, amount, bucket = "capex") => ({ id: IDS.cash(n), month, amount, bucket });
  const project_cashflows = [cash(1, "2030-12-01", 10e6), cash(2, "2031-04-01", 12e6), cash(3, "2031-04-01", 3e6, "pmdc"),
    cash(4, "2031-05-01", 15e6), cash(5, "2031-04-01", 50e6, "investment")];
  const board_reports = [
    { id: IDS.report(1), period: "2031-01-01", kind: "reconstructed", status: "published", as_at: "2031-01-31T19:00:00Z", created_at: "2031-02-01T00:00:00Z", published_at: "2031-02-01T00:00:00Z", figures: null, title: "Baseline" },
    { id: IDS.report(2), period: "2031-02-01", kind: "monthly", status: "draft", as_at: "2031-03-05T05:00:00Z", created_at: "2031-03-05T05:00:00Z", published_at: null, title: "Monthly Board Report: February 2031",
      figures: { attention: { approved_nothing_released: [], released_before_approval: [{ id: "x" }], without_pm: [] } } },
  ];
  return {
    portfolio_dashboard, investment_metrics, settings, projects, project_metrics: metrics, campuses,
    sectors: [], regions: [], segments: [], cost_centers: [], project_assignments, user_profiles,
    carry_forward_projects: [], project_cashflows, project_risks_scored, project_risks: [], project_deliverables: [],
    epdd_pdds: [], project_raci: [], project_tasks: [], project_task_rollup: [], project_attachments, comments, comment_reads: [],
    past_project_summary, past_projects: [], past_project_updates, past_pm_messages: [], past_chat_reads: [],
    past_project_task_rollup: [], past_project_tasks: [], board_reports, board_report_recipients: [], activity_log: [],
  };
}

export const syntheticCtx = (over = {}) => ({ now: NOW, me: IDS.user(1), testAccounts: [IDS.user(5)], overrides: {}, leftOut: 0, failed: 0, ...over });
