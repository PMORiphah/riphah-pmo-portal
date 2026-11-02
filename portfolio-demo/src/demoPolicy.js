// Portfolio demo: who may read and change what, for the three roles the visitor can pick.
// Mirrors the portal's real access rules (row-level security) in plain JavaScript:
//   PMO admin            everything;
//   project manager      only the projects assigned to them (and their own past projects): reads the
//                        project, its updates, WBS, documents, deliverables, payments; writes WBS tasks, posts
//                        updates, ticks deliverables (status / date / note only); never the cash flows,
//                        risk register, PMO-only pages or other projects;
//   senior management    reads the whole portfolio; posts updates; changes nothing else.
// The pages hide what a role can't use; these rules are what actually decides, as in the real database.
import { dashboard, investmentMetrics } from "../data/views.mjs";

const PMO_ONLY_TABLES = new Set(["activity_log", "notifications_log", "epdd_pdds", "epdd_files", "epdd_reviews", "epdd_sync_runs",
  "project_todos", "inventory_items", "snapshots", "session_summary", "tour_progress", "user_sessions", "session_events"]);
const PMO_ONLY_SETTINGS = new Set(["past_viewers", "welcome_email", "simulation_share", "inventory_profit_centres"]);
// Tables whose rows belong to one project (project_id): readable by whoever may see the project.
const BY_PROJECT = new Set(["project_assignments", "project_raci", "project_tasks", "project_attachments", "project_deliverables",
  "comments", "project_payments",
  "project_pcrs", "project_task_rollup", "project_update_status"]);
// Never shown to a project manager (the real rules return no rows to them).
const NOT_FOR_PM = new Set(["project_cashflows", "cashflow_monthly", "project_risks", "project_risks_scored", "carry_forward_projects",
  "lessons_learned", "benefits_realized", "lessons_learned_full", "benefits_realized_full",
  "at_risk_projects", "pdd_pending_projects"]);

const isPmo = (me) => me.role === "pmo";
const assigned = (me, t) => new Set((t.project_assignments || []).filter((a) => a.user_id === me.id).map((a) => a.project_id));

export function isPastViewer(me, t) {
  const s = (t.settings || []).find((x) => x.key === "past_viewers");
  const ids = s?.value?.user_ids;
  return Array.isArray(ids) && ids.includes(me.id);
}
export function canViewProject(pid, me, t) {
  if (me.role !== "project_manager") return true;
  return assigned(me, t).has(pid);
}
export function canViewPast(id, me, t) {
  if (isPmo(me) || isPastViewer(me, t)) return true;
  return (t.past_projects || []).some((p) => p.id === id && p.pm_user_id === me.id);
}

export function read(table, rows, t, me) {
  if (isPmo(me)) return rows;
  if (PMO_ONLY_TABLES.has(table)) return [];
  if (table === "settings") return rows.filter((r) => !PMO_ONLY_SETTINGS.has(r.key));
  if (table === "past_projects" || table === "past_project_summary") return rows.filter((r) => canViewPast(r.id, me, t));
  if (table === "past_project_updates" || table === "past_project_tasks" || table === "past_project_task_rollup") return rows.filter((r) => canViewPast(r.past_project_id, me, t));
  if (table === "past_pm_messages") return rows.filter((r) => r.pm_user_id === me.id || isPastViewer(me, t));
  if (table === "board_reports") {
    const mine = new Set((t.board_report_recipients || []).filter((x) => x.user_id === me.id && !x.removed).map((x) => x.report_id));
    return rows.filter((r) => r.status === "published" && mine.has(r.id));
  }
  if (table === "board_report_recipients") return rows.filter((r) => r.user_id === me.id);
  if (me.role !== "project_manager") return rows;
  // project manager
  if (NOT_FOR_PM.has(table)) return [];
  const mine = assigned(me, t);
  if (table === "projects" || table === "project_metrics") return rows.filter((r) => mine.has(r.id));
  if (table === "project_pcrs") return rows.filter((r) => r.confirmed && mine.has(r.project_id));
  if (BY_PROJECT.has(table)) return rows.filter((r) => mine.has(r.project_id));
  // Views worked out "as the caller": only the manager's own projects count.
  if (table === "portfolio_dashboard" || table === "portfolio_metrics") return [dashboard((t.projects || []).filter((p) => mine.has(p.id)), today())];
  if (table === "investment_metrics") return [investmentMetrics((t.projects || []).filter((p) => mine.has(p.id)))];
  return rows;
}
let TODAY = null;
/** The date the views are worked out for (the backend's clock). */
export const setToday = (d) => { TODAY = d; };
const today = () => TODAY || new Date().toISOString().slice(0, 10);

// Columns a project manager may change on a deliverable line (the real guard trigger).
const PM_DELIVERABLE_COLS = new Set(["status", "status_date", "note", "updated_at"]);
const changedCols = (row, old) => Object.keys(row).filter((k) => JSON.stringify(row[k]) !== JSON.stringify(old?.[k]));
const own = (me, row, col = "author_id") => row && row[col] === me.id;

/** true when the person may make this change (op INSERT / UPDATE / DELETE; row = new values, old = before). */
export function write(table, op, row, old, me, t) {
  if (isPmo(me)) return true;
  const r = row || old;
  // Everyone: their own read markers, their own profile (tour, notification choices), their own log lines.
  if (table === "comment_reads" || table === "past_chat_reads") return r.user_id === me.id;
  if (table === "user_profiles") return op === "UPDATE" && old.id === me.id && row.role === old.role && row.is_active === old.is_active;
  if (table === "activity_log") return op === "INSERT" && (row.actor_id == null || row.actor_id === me.id);
  if (["user_sessions", "session_events", "tour_events", "push_subscriptions", "user_webauthn_credentials"].includes(table)) return true;
  if (table === "board_report_recipients") return op === "UPDATE" && old.user_id === me.id && changedCols(row, old).every((k) => k === "seen_at");
  // Updates: post on a project you can see; edit or remove your own post.
  if (table === "comments") {
    if (!canViewProject(r.project_id, me, t)) return false;
    if (op === "INSERT") return own(me, row) && row.author_role === me.role;
    if (op === "UPDATE" && !own(me, old) && changedCols(row, old).every((k) => k === "is_read_by_pmo" || k === "updated_at")) return true;
    return own(me, old) && (!row || own(me, row));
  }
  // Past projects: the manager answers on their own projects; past viewers ask on any.
  if (table === "past_project_updates") return op === "INSERT" && own(me, row) && row.author_role === me.role && canViewPast(row.past_project_id, me, t);
  if (table === "past_pm_messages") return op === "INSERT" && own(me, row) && row.author_role === me.role && (row.pm_user_id === me.id || isPastViewer(me, t));
  if (me.role !== "project_manager") return false;
  const mine = assigned(me, t);
  if (table === "project_tasks") {
    if (!mine.has(r.project_id) || (row && !mine.has(row.project_id))) return false;
    // Baselines are PMO only (trg_tasks_baseline_guard).
    if (op === "UPDATE" && (row.baseline_start !== old.baseline_start || row.baseline_end !== old.baseline_end)) return false;
    return true;
  }
  if (table === "past_project_tasks") return (t.past_projects || []).some((p) => p.id === r.past_project_id && p.pm_user_id === me.id);
  if (table === "project_deliverables") return op === "UPDATE" && mine.has(old.project_id) && changedCols(row, old).every((k) => PM_DELIVERABLE_COLS.has(k));
  return false;
}

export const policy = { read, write, canViewProject, canViewPast, isPastViewer };
