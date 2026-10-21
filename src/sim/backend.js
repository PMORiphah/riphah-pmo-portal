// PMO Simulation: the synthetic Supabase backend, live mode (contract §G). Owner: B2.
//
// installBackend({ store, mediaUrls, responses, rpc, mode: "live", onUnhandled }) wraps window.fetch
// (and XMLHttpRequest, WebSocket and EventSource) so that every request the portal makes to its
// Supabase project is answered here, in the page, from the snapshot the PMO's portal tab handed
// over. Nothing reaches the network: requests to the Supabase host are answered from memory,
// requests to any other site are refused, and only this page's own files (and blob:/data:) go to
// the browser's real fetch.
//
//   GET /rest/v1/<table|view>  1. replay: the response recorded in the portal tab for exactly this
//                                 pathname + search (no Range, no Prefer count, no single-object Accept);
//                              2. otherwise a small PostgREST over the snapshot tables: select (columns,
//                                 aliases, casts, JSON paths, embeds with hints, !inner, count), filters
//                                 (eq neq gt gte lt lte like ilike match imatch in is isdistinct cs cd ov
//                                 fts…, not., or/and trees), order (several keys, nulls first/last, the
//                                 database's enum order, en-US collation), limit/offset, Range, Prefer
//                                 count, single-object Accept, HEAD.
//   writes                     read-only presentation: only the read markers the portal writes when a
//                              thread opens are accepted, and they are discarded (no table changes, so
//                              badges stay as production has them). Everything else is refused, 403
//                              "Read-only presentation: nothing is changed or sent", with a toast.
//   /rest/v1/rpc/<fn>          the functions the portal calls, answered from the snapshot or as no-ops.
//   /storage/v1/…              sign requests for "sim-media/<key>" answer the handed-over blob: link;
//                              every other file is "not part of the simulation"; uploads and deletes refused.
//   /functions/v1/<fn>         every edge function is refused (nothing is sent; the assistant is off).
//   /auth/v1/…                 refresh answers synthetic tokens; sign-in and password changes are refused.
// Anything not recognised is answered 501 and reported through onUnhandled and stats().
//
// The snapshot tables are frozen: nothing here (or in the portal) can change them during the run.
// The repo is public: this file holds no names, keys or tokens. The Supabase address below is the
// portal's own public project address (also in src/App.jsx and src/auth.js); it is only matched,
// never contacted.
import { authUser, issueTokens, isSimToken, prepareSession as writeSession, sessionUser, TTL_S } from "./session.js";
import { TABLES, columnsOf } from "./live/schema.js";

export const SUPA_ORIGIN = "https://prmxkecomqqngvrmytcj.supabase.co";

export const MSG = Object.freeze({
  NA: "Not available in the simulation",
  READ_ONLY: "Read-only presentation: nothing is changed or sent",
  ASK: "The assistant is not available in the presentation",
  NO_SIGNIN: "Sign-in is not available in the simulation.",
  NO_PASSWORD: "Passwords are not changed in the simulation.",
  NO_FILE: "This file is not part of the simulation",
});

// ── tables the real database has (37 tables + views); a known one the snapshot leaves out reads as empty ──
const KNOWN = new Set([
  "projects", "project_assignments", "project_cashflows", "project_risks", "project_raci", "project_tasks",
  "project_attachments", "project_deliverables", "comments", "comment_reads", "lessons_learned", "benefits_realized",
  "past_projects", "past_project_updates", "past_project_tasks", "past_pm_messages", "past_chat_reads", "user_profiles",
  "campuses", "cost_centers", "sectors", "segments", "regions", "settings", "snapshots", "carry_forward_projects",
  "activity_log", "user_sessions", "session_events", "tour_events", "notifications_log", "user_webauthn_credentials",
  "webauthn_challenges", "push_subscriptions", "pmo_active_session", "milestones", "epdd_pdds", "epdd_files",
  "epdd_reviews", "epdd_sync_runs", "epdd_state", "board_reports", "board_report_recipients",
  "project_todos", "project_pcrs",   // 20 Oct 2026: not in the snapshot, so they read as empty
  "project_payments",                // 21 Oct 2026 (Investments → Payments Made): not in the snapshot, so the card is left out of the simulation; reads as empty if asked
  // views
  "portfolio_metrics", "portfolio_dashboard", "project_metrics", "investment_metrics", "cashflow_monthly",
  "at_risk_projects", "pdd_pending_projects", "project_task_rollup", "project_risks_scored", "lessons_learned_full",
  "benefits_realized_full", "past_project_summary", "past_project_task_rollup", "session_summary", "tour_progress",
  "project_update_status",   // 20 Oct 2026 (Ask update): not in the snapshot, so it reads as empty
]);
// Always empty in the simulation: these drive the sign-in pop-ups (deadline alerts, PDD reminders),
// which would block the run. The real pop-up still opens in the PMO's own portal tab.
const ALWAYS_EMPTY = new Set(["at_risk_projects", "pdd_pending_projects"]);
// The database has no policies on these for the browser.
const NO_ACCESS = new Set(["epdd_state", "webauthn_challenges", "pmo_active_session"]);
// Row-level security: these return only the caller's own rows.
const OWN_ROWS = new Set(["comment_reads", "past_chat_reads", "push_subscriptions", "user_webauthn_credentials",
  "tour_events", "user_sessions"]);
// Views whose rows mirror a base table (same id): for relationships.
const VIEW_BASE = { project_metrics: "projects", project_risks_scored: "project_risks",
  past_project_summary: "past_projects", lessons_learned_full: "lessons_learned", benefits_realized_full: "benefits_realized" };

// Foreign keys: table -> { column: referenced table } (all reference the target's id).
const PROJ_FK = { sector_id: "sectors", region_id: "regions", segment_id: "segments", cost_center_id: "cost_centers",
  campus_id: "campuses", created_by: "user_profiles" };
const FK = {
  projects: PROJ_FK, project_metrics: PROJ_FK,
  project_assignments: { project_id: "projects", user_id: "user_profiles", assigned_by: "user_profiles" },
  comments: { project_id: "projects", author_id: "user_profiles", parent_id: "comments" },
  comment_reads: { comment_id: "comments", user_id: "user_profiles" },
  project_attachments: { project_id: "projects", uploaded_by: "user_profiles" },
  project_cashflows: { project_id: "projects" },
  project_risks: { project_id: "projects", created_by: "user_profiles" },
  project_risks_scored: { project_id: "projects", created_by: "user_profiles" },
  project_raci: { project_id: "projects", user_id: "user_profiles" },
  project_tasks: { project_id: "projects", parent_id: "project_tasks" },
  project_deliverables: { project_id: "projects", pdd_id: "epdd_pdds" },
  project_task_rollup: { project_id: "projects" },
  lessons_learned: { project_id: "projects" }, lessons_learned_full: { project_id: "projects" },
  benefits_realized: { project_id: "projects" }, benefits_realized_full: { project_id: "projects" },
  past_projects: { pm_user_id: "user_profiles", created_by: "user_profiles" },
  past_project_summary: { pm_user_id: "user_profiles" },
  past_project_updates: { past_project_id: "past_projects", author_id: "user_profiles" },
  past_project_tasks: { past_project_id: "past_projects", parent_id: "past_project_tasks" },
  past_project_task_rollup: { past_project_id: "past_projects" },
  past_pm_messages: { pm_user_id: "user_profiles", past_project_id: "past_projects", author_id: "user_profiles" },
  past_chat_reads: { user_id: "user_profiles" },
  board_reports: { published_by: "user_profiles", created_by: "user_profiles" },
  board_report_recipients: { report_id: "board_reports", user_id: "user_profiles", added_by: "user_profiles" },
  epdd_pdds: { linked_project_id: "projects", seen_by: "user_profiles" },
  epdd_files: { pdd_id: "epdd_pdds" }, epdd_reviews: { pdd_id: "epdd_pdds" },
  activity_log: { actor_id: "user_profiles" },
  notifications_log: { recipient_id: "user_profiles" },
  user_sessions: { user_id: "user_profiles" }, session_events: { session_id: "user_sessions" },
  tour_events: { user_id: "user_profiles" },
};
const SINGULAR = { campuses: "campus", user_profiles: "user", past_projects: "past_project", board_reports: "report",
  epdd_pdds: "pdd", cost_centers: "cost_center", user_sessions: "session", comments: "comment" };
const singular = (t) => SINGULAR[t] || t.replace(/s$/, "");

// Enum columns sort in the database's declaration order (pg_enum.enumsortorder, read 16 Oct 2026),
// keyed by table and column (project_cashflows.priority, for one, is plain text).
const ENUMS = Object.freeze({
  user_role: ["pmo", "project_manager", "guest"],
  raci_role: ["responsible", "accountable", "consulted", "informed"],
  workflow_stage: ["pdd_not_submitted", "identified", "df_review", "ed_review", "mt_review", "approved", "closed"],
  risk_level: ["low", "medium", "high"],
  risk_status: ["open", "monitoring", "mitigated", "closed", "realized"],
  risk_category: ["financial", "schedule", "technical", "vendor", "regulatory", "resource", "safety"],
  past_status: ["open", "closing", "closed"],
  project_priority: ["top_priority", "first_priority", "second_priority", "third_priority", "carry_forward"],
  schedule_flag: ["not_started", "on_time", "delayed"],
  budget_flag: ["not_started", "within", "over"],
  cashflow_bucket: ["capex", "pmdc", "investment"],
});
const ENUM_COLS = Object.freeze({
  "user_profiles.role": "user_role", "activity_log.actor_role": "user_role", "comments.author_role": "user_role",
  "past_pm_messages.author_role": "user_role", "past_project_updates.author_role": "user_role",
  "past_project_summary.last_update_role": "user_role",
  "project_raci.raci_role": "raci_role",
  "projects.workflow_stage": "workflow_stage", "project_metrics.workflow_stage": "workflow_stage",
  "project_risks.probability": "risk_level", "project_risks.impact": "risk_level",
  "project_risks_scored.probability": "risk_level", "project_risks_scored.impact": "risk_level",
  "project_risks.status": "risk_status", "project_risks_scored.status": "risk_status",
  "project_risks.category": "risk_category", "project_risks_scored.category": "risk_category",
  "past_projects.status": "past_status", "past_project_summary.status": "past_status",
  "projects.priority": "project_priority", "project_metrics.priority": "project_priority",
  "project_metrics.schedule_flag": "schedule_flag", "projects.manual_schedule_flag": "schedule_flag",
  "project_metrics.manual_schedule_flag": "schedule_flag",
  "project_metrics.budget_flag": "budget_flag", "projects.manual_budget_flag": "budget_flag",
  "project_metrics.manual_budget_flag": "budget_flag",
  "project_cashflows.bucket": "cashflow_bucket",
});
const enumOf = (table, col) => { const e = ENUM_COLS[`${table}.${col}`]; return e ? ENUMS[e] : null; };
// Column types from the allow-list (schema.js): numbers, dates and text sort as Postgres sorts them.
const TYPES = new Map(Object.keys(TABLES).map((t) => [t, new Map(columnsOf(t).map((c) => [c.name, c.type]))]));
const typeOf = (table, col) => TYPES.get(table)?.get(col) || null;

const clone = (v) => {
  if (typeof structuredClone === "function") { try { return structuredClone(v); } catch { /* fall through */ } }
  return JSON.parse(JSON.stringify(v));
};
const deepFreeze = (v) => {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
};
const nowIso = () => new Date().toISOString();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toast = (msg) => { try { window.__PMO_SIM__?.guard?.toast?.(msg); } catch { /* ignore */ } };

class SimError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const unsupported = (what) => new SimError(501, MSG.NA, { code: "SIM501", details: what, unhandled: true });
const refused = (what, message = MSG.READ_ONLY) => new SimError(403, message, { code: "SIM403", details: what, refused: true });
const badRequest = (message, code = "PGRST100") => new SimError(400, message, { code });

// ── parsing helpers ─────────────────────────────────────────────────────────────────────────────
// Splits on top-level commas, keeping (…) groups, {…} arrays and "quoted" values together.
function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0, cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      cur += ch;
      if (ch === "\\" && i + 1 < s.length) { cur += s[++i]; continue; }
      if (ch === '"') q = false;
      continue;
    }
    if (ch === '"') { q = true; cur += ch; continue; }
    if (ch === "(" || ch === "{") depth++;
    if (ch === ")" || ch === "}") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur !== "" || out.length) out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x !== "");
}
const unquote = (v) => {
  const t = String(v).trim();
  return t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t.slice(1, -1).replace(/\\(.)/g, "$1") : t;
};
// "(a,b,\"c,d\")" or "{a,b}" -> ["a","b","c,d"]
const listOf = (v) => {
  const t = String(v).trim();
  const inner = /^[({]([\s\S]*)[)}]$/.exec(t);
  return splitTop(inner ? inner[1] : t).map(unquote);
};

// JSON path in a column expression: figures->headline, figures->>period, a->b->>c
function parseColExpr(expr) {
  const parts = expr.split(/(->>?)/);
  const col = parts[0].trim();
  const steps = [];
  for (let i = 1; i < parts.length; i += 2) steps.push({ text: parts[i] === "->>", key: unquote(parts[i + 1] || "") });
  return { col, steps };
}
function readPath(row, expr) {
  const { col, steps } = parseColExpr(expr);
  let v = row == null ? undefined : row[col];
  let asText = false;
  for (const st of steps) {
    if (v != null && typeof v === "string" && /^[[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* keep */ } }
    v = v == null ? null : (Array.isArray(v) && /^-?\d+$/.test(st.key) ? v[Number(st.key) < 0 ? v.length + Number(st.key) : Number(st.key)] : v[st.key]);
    asText = st.text;
  }
  if (v === undefined) v = null;
  if (asText && v != null && typeof v !== "string") v = typeof v === "object" ? JSON.stringify(v) : String(v);
  return v;
}
const defaultAlias = (expr) => {
  const { col, steps } = parseColExpr(expr);
  return steps.length ? steps[steps.length - 1].key : col;
};

// ── typed comparison (Postgres-like) ─────────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;
function dateMs(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return NaN;
  let t = s.replace(" ", "T");
  if (t.length === 10) t += "T00:00:00Z";
  else if (/[+-]\d{2}$/.test(t)) t += ":00";
  else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) t += "Z";
  return Date.parse(t);
}
const NUM_RE = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
// Text order as the database sorts it: Postgres 17 with the ICU provider, locale en-US (checked
// read-only on 16 Oct 2026: pg_database.datlocprovider 'i', datlocale 'en-US'). ICU's default en-US
// collation is what Intl.Collator("en-US") does (spaces and punctuation count; "IT. 2…" sorts
// before "IT.2…"); a deterministic collation breaks ICU ties by the bytes, so code-unit order last.
// A stable sort keeps the server's order for full ties.
const COLL = typeof Intl !== "undefined" && Intl.Collator ? new Intl.Collator("en-US") : null;
const cmpText = (a, b) => (COLL && COLL.compare(a, b)) || (a < b ? -1 : a > b ? 1 : 0);

// row value v against the filter text s: -1 / 0 / 1, or null when they can't be compared
function cmpFilter(v, s) {
  if (v == null) return null;
  if (typeof v === "number") { if (s === "" || !NUM_RE.test(s.trim())) return null; const n = Number(s); return v < n ? -1 : v > n ? 1 : 0; }
  if (typeof v === "boolean") {
    const b = /^(true|t|yes|on|1)$/i.test(s) ? true : /^(false|f|no|off|0)$/i.test(s) ? false : null;
    if (b === null) return null;
    return v === b ? 0 : v ? 1 : -1;
  }
  const str = typeof v === "object" ? JSON.stringify(v) : String(v);
  const a = dateMs(str), b = dateMs(s);
  if (!isNaN(a) && !isNaN(b)) return a < b ? -1 : a > b ? 1 : 0;
  if (NUM_RE.test(str) && NUM_RE.test(s)) { const x = Number(str), y = Number(s); return x < y ? -1 : x > y ? 1 : 0; }
  return str < s ? -1 : str > s ? 1 : 0;
}
// two row values, for ORDER BY: by the column's type in the allow-list when it is known (enum
// order from the database, numbers, dates, booleans, collated text), else by what the values look like.
function cmpSort(a, b, table, col) {
  const en = enumOf(table, col);
  if (en && typeof a === "string" && typeof b === "string") {
    const ia = en.indexOf(a), ib = en.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0 || ib >= 0) return ia >= 0 ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  const type = typeOf(table, col);
  if (type === "t" || type === "u" || type === "e") return cmpText(sa, sb);
  const da = dateMs(sa), db = dateMs(sb);
  if (!isNaN(da) && !isNaN(db)) return da - db;
  if (type !== "d" && type !== "ts" && NUM_RE.test(sa) && NUM_RE.test(sb)) return Number(sa) - Number(sb);
  return cmpText(sa, sb);
}
const likeRe = (pat, flags) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*").replace(/_/g, ".") + "$", flags + "s");
const asArray = (v) => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)));
  if (typeof v === "string" && /^\{.*\}$/s.test(v)) return listOf(v);
  return null;
};

// One filter expression ("eq.5", "not.in.(a,b)", "is.null", "fts(english).word") against value v.
function testOp(v, expr) {
  let neg = false;
  let e = expr;
  while (e.startsWith("not.")) { neg = !neg; e = e.slice(4); }
  const m = /^([a-z]+)(?:\(([^)]*)\))?\.([\s\S]*)$/.exec(e);
  if (!m) throw unsupported("filter " + expr.slice(0, 60));
  const [, op, mod, val] = m;
  let r;
  const many = (fn) => {           // like(any).{a,b} / eq(all).{…}
    const vals = listOf(val);
    return mod === "all" ? vals.every(fn) : vals.some(fn);
  };
  switch (op) {
    case "eq": r = mod ? many((x) => cmpFilter(v, x) === 0) : cmpFilter(v, val) === 0; break;
    case "neq": r = v != null && cmpFilter(v, val) !== 0 && cmpFilter(v, val) !== null; break;
    case "gt": r = mod ? many((x) => cmpFilter(v, x) > 0) : cmpFilter(v, val) > 0 && cmpFilter(v, val) !== null; break;
    case "gte": r = mod ? many((x) => cmpFilter(v, x) >= 0) : cmpFilter(v, val) !== null && cmpFilter(v, val) >= 0; break;
    case "lt": r = mod ? many((x) => cmpFilter(v, x) < 0) : cmpFilter(v, val) !== null && cmpFilter(v, val) < 0; break;
    case "lte": r = mod ? many((x) => cmpFilter(v, x) <= 0) : cmpFilter(v, val) !== null && cmpFilter(v, val) <= 0; break;
    case "like": case "ilike": {
      if (v == null) { r = false; break; }
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      const flags = op === "ilike" ? "i" : "";
      r = mod ? many((x) => likeRe(x, flags).test(s)) : likeRe(val, flags).test(s);
      break;
    }
    case "match": case "imatch": {
      if (v == null) { r = false; break; }
      try { r = new RegExp(val, op === "imatch" ? "i" : "").test(String(v)); } catch { throw badRequest("invalid regular expression"); }
      break;
    }
    case "in": r = v != null && listOf(val).some((x) => cmpFilter(v, x) === 0); break;
    case "is": {
      const w = val.toLowerCase();
      if (w === "null") r = v == null;
      else if (w === "not_null") r = v != null;
      else if (w === "true") r = v === true;
      else if (w === "false") r = v === false;
      else if (w === "unknown") r = v == null;
      else throw badRequest("is. accepts null, not_null, true, false or unknown");
      break;
    }
    case "isdistinct": r = v == null ? val !== "null" : cmpFilter(v, val) !== 0; break;
    case "cs": case "cd": case "ov": {
      const have = asArray(v);
      if (!have) { r = false; break; }
      const want = listOf(val);
      if (op === "cs") r = want.every((x) => have.includes(x));
      else if (op === "cd") r = have.every((x) => want.includes(x));
      else r = want.some((x) => have.includes(x));
      break;
    }
    case "fts": case "plfts": case "phfts": case "wfts": {
      if (v == null) { r = false; break; }
      const hay = String(v).toLowerCase();
      const words = val.replace(/[&|!()':*<>]/g, " ").toLowerCase().split(/\s+/).filter(Boolean);
      r = words.every((w) => hay.includes(w));
      break;
    }
    default: throw unsupported("filter operator " + op);
  }
  return neg ? !r : r;
}

// or=(a.eq.1,and(b.gt.2,c.is.null),d.not.like.*x*)  ->  predicate(row)
function parseLogic(kind, body, negate) {
  const inner = /^\(([\s\S]*)\)$/.exec(body.trim());
  if (!inner) throw badRequest("logic tree needs (…)");
  const parts = splitTop(inner[1]).map((el) => {
    const nest = /^(not\.)?(and|or)(\([\s\S]*\))$/.exec(el);
    if (nest) return parseLogic(nest[2], nest[3], !!nest[1]);
    const i = el.indexOf(".");
    if (i < 1) throw badRequest("bad logic element " + el.slice(0, 40));
    const col = el.slice(0, i), op = el.slice(i + 1);
    return (row) => testOp(readPath(row, col), op);
  });
  return (row) => {
    const r = kind === "or" ? parts.some((p) => p(row)) : parts.every((p) => p(row));
    return negate ? !r : r;
  };
}

// select=… -> items
function parseSelect(s) {
  if (s == null || s.trim() === "") return [{ kind: "star" }];
  return splitTop(s).map((raw) => {
    let t = raw.trim();
    if (t === "*") return { kind: "star" };
    let spread = false;
    if (t.startsWith("...")) { spread = true; t = t.slice(3); }
    let alias = null;
    const am = /^([A-Za-z_][\w]*):(?!:)([\s\S]+)$/.exec(t);
    if (am) { alias = am[1]; t = am[2].trim(); }
    const em = /^([A-Za-z_][\w]*)((?:![A-Za-z_][\w]*)*)\(([\s\S]*)\)$/.exec(t);
    if (em) {
      const hints = em[2].split("!").filter(Boolean);
      return { kind: "embed", rel: em[1], alias: alias || em[1], spread,
        inner: hints.includes("inner"), hint: hints.find((h) => h !== "inner" && h !== "left") || null,
        children: em[3].trim() === "" ? [] : parseSelect(em[3]) };
    }
    if (/\(/.test(t)) throw unsupported("select " + raw.slice(0, 60));
    let cast = null;
    const cm = /^([\s\S]*?)::([A-Za-z_][\w ]*)$/.exec(t);
    if (cm) { t = cm[1].trim(); cast = cm[2].trim().toLowerCase(); }
    return { kind: "col", expr: t, alias: alias || defaultAlias(t), cast };
  });
}
const castValue = (v, cast) => {
  if (v == null || !cast) return v;
  if (cast === "text" || cast.startsWith("varchar") || cast === "character varying") return typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^(int|integer|bigint|smallint|int4|int8|numeric|float|real|double precision|decimal)/.test(cast)) { const n = Number(v); return isNaN(n) ? v : (/^(int|integer|bigint|smallint|int4|int8)/.test(cast) ? Math.trunc(n) : n); }
  if (cast === "date") return String(v).slice(0, 10);
  if (cast === "boolean" || cast === "bool") return v === true || v === "true" || v === "t";
  return v;
};

// ── the backend ─────────────────────────────────────────────────────────────────────────────────
let installed = null;
let nativeFetch = null;            // the browser's own fetch, captured once (a re-install never wraps a wrapper)

/**
 * Installs the synthetic backend (live mode). Returns { snapshot, restore, stats, reset, uninstall, media }.
 * store:     { tables, meta: { pmo: { id, username, full_name, email: null }, takenAt, plan } }; the tables
 *            are frozen and never change.
 * mediaUrls: { m001: "blob:…", … } for the handed-over site-visit media.
 * responses: the snapshot's recorded responses [{ key, status, contentRange, body }] (replayed first).
 * rpc:       { project_has_deliverables: [projectId, …] }.
 * onUnhandled(info): called for every request the backend does not recognise (and every request
 *   to another site), with { kind, method, path, detail }.
 */
export function installBackend({ store, mediaUrls = {}, responses = [], rpc = {}, mode = "live", onUnhandled } = {}) {
  if (mode !== "live") throw new Error("Simulation backend: only the live mode exists");
  if (!store || typeof store !== "object" || !store.tables || typeof store.tables !== "object") {
    throw new Error("Simulation backend: store.tables missing");
  }
  if (installed) installed.uninstall();
  const tables = deepFreeze(store.tables);
  const me = sessionUser(store);
  const media = { ...mediaUrls };
  const deliverables = new Set(Array.isArray(rpc?.project_has_deliverables) ? rpc.project_has_deliverables.map(String) : []);
  // The replay map: exact pathname + search → { status, contentRange, body }.
  const replay = new Map();
  for (const r of Array.isArray(responses) ? responses : []) {
    if (r && typeof r.key === "string" && !replay.has(r.key)) replay.set(r.key, { status: r.status, contentRange: r.contentRange ?? null, body: deepFreeze(r.body) });
  }

  const freshStats = () => ({
    calls: 0, rest: 0, rpc: 0, storage: 0, functions: 0, auth: 0, local: 0,
    reads: 0, writes: 0, emptyTables: {}, refused: [], blocked: [], unhandled: [], outside: [],
    sockets: 0, endpoints: {},
    accepted: { comment_reads: 0, comments_read_flag: 0, past_chat_reads: 0 },
    rpcUnknown: [],
  });
  let st = freshStats();
  let hits = 0;
  let misses = new Map();          // key → n
  let served = new Set();          // replay keys served at least once
  let seq = 0;
  const cap = (arr, x) => { if (arr.length < 500) arr.push(x); };
  const report = (info) => {
    cap(st.unhandled, info);
    try { onUnhandled?.(info); } catch { /* the reporter must never break the page */ }
  };
  const seen = (key) => { st.endpoints[key] = (st.endpoints[key] || 0) + 1; };

  // ── row access ──
  const rowsOf = (t) => {
    if (ALWAYS_EMPTY.has(t) || NO_ACCESS.has(t)) return [];
    const r = tables[t];
    if (Array.isArray(r)) return OWN_ROWS.has(t) ? r.filter((x) => x.user_id === me.id) : r;
    if (KNOWN.has(t)) { st.emptyTables[t] = (st.emptyTables[t] || 0) + 1; return []; }
    return null;
  };
  const byId = new Map();          // table -> Map(id -> row), built once (the tables never change)
  const index = (t) => {
    let m = byId.get(t);
    if (!m) {
      m = new Map();
      for (const r of (Array.isArray(tables[t]) ? tables[t] : [])) if (r && r.id != null) m.set(String(r.id), r);
      byId.set(t, m);
    }
    return m;
  };

  // ── relationships ──
  function relationship(parent, rel, hint, sample) {
    const parentBase = VIEW_BASE[parent] || parent;
    if (hint) {
      // <parent>_<col>_fkey: parent holds col (many-to-one); <rel>_<col>_fkey: rel holds col (one-to-many)
      const fk = /^([a-z_]+?)_([a-z0-9_]+)_fkey$/.exec(hint);
      if (fk) {
        for (const owner of [parent, parentBase]) {
          if (hint.startsWith(owner + "_")) return { one: true, col: hint.slice(owner.length + 1, -5) };
        }
        if (hint.startsWith(rel + "_")) return { one: false, col: hint.slice(rel.length + 1, -5) };
      }
      if (sample && hint in sample) return { one: true, col: hint };
      if ((FK[parent] || {})[hint]) return { one: true, col: hint };
      if ((FK[rel] || {})[hint]) return { one: false, col: hint };
    }
    const mine = FK[parent] || FK[parentBase] || {};
    const relBase = VIEW_BASE[rel] || rel;
    const toOne = Object.keys(mine).filter((c) => mine[c] === rel || mine[c] === relBase);
    if (toOne.length) return { one: true, col: toOne[0] };
    const theirs = FK[rel] || FK[relBase] || {};
    const toMany = Object.keys(theirs).filter((c) => theirs[c] === parent || theirs[c] === parentBase);
    if (toMany.length) return { one: false, col: toMany[0] };
    const guessOne = singular(rel) + "_id";
    if (sample && guessOne in sample) return { one: true, col: guessOne };
    const guessMany = singular(parentBase) + "_id";
    const relRows = tables[rel];
    if (Array.isArray(relRows) && relRows.length && guessMany in relRows[0]) return { one: false, col: guessMany };
    if (Array.isArray(relRows) || KNOWN.has(rel)) return { one: false, col: guessMany };
    return null;
  }

  // Embedded filters/modifiers: "rel.col=op.val", "rel.order=…", "rel.limit=…"
  function embedParams(params, alias) {
    const out = [];
    for (const [k, v] of params) if (k.startsWith(alias + ".")) out.push([k.slice(alias.length + 1), v]);
    return out;
  }

  // Applies filters (entries [[key, value]]) to rows; returns the kept rows.
  function applyFilters(rows, entries) {
    const preds = [];
    for (const [k, v] of entries) {
      if (k === "select" || k === "order" || k === "limit" || k === "offset" || k === "on_conflict" || k === "columns") continue;
      if (k === "or" || k === "and" || k === "not.or" || k === "not.and") {
        const neg = k.startsWith("not.");
        preds.push(parseLogic(neg ? k.slice(4) : k, v, neg));
        continue;
      }
      if (k.includes(".")) continue;        // an embedded resource's filter, applied while embedding
      preds.push((row) => testOp(readPath(row, k), v));
    }
    if (!preds.length) return rows;
    return rows.filter((r) => preds.every((p) => p(r)));
  }
  function applyOrder(rows, order, table) {
    if (!order) return rows;
    const keys = splitTop(order).map((term) => {
      const parts = term.split(".");
      let col = parts[0], dir = 1, nulls = null;
      // a JSON path may contain dots only inside quotes; plain columns never do
      for (const p of parts.slice(1)) {
        if (p === "desc") dir = -1; else if (p === "asc") dir = 1;
        else if (p === "nullsfirst") nulls = "first"; else if (p === "nullslast") nulls = "last";
        else col += "." + p;
      }
      if (/\(/.test(col)) throw unsupported("order by an embedded resource");
      return { col, dir, nulls: nulls || (dir === 1 ? "last" : "first") };
    });
    const decorated = rows.map((r, i) => ({ r, i }));
    decorated.sort((x, y) => {
      for (const k of keys) {
        const a = readPath(x.r, k.col), b = readPath(y.r, k.col);
        if (a == null && b == null) continue;
        if (a == null) return k.nulls === "first" ? -1 : 1;
        if (b == null) return k.nulls === "first" ? 1 : -1;
        const c = cmpSort(a, b, table, parseColExpr(k.col).col);
        if (c) return c * k.dir;
      }
      return x.i - y.i;
    });
    return decorated.map((d) => d.r);
  }
  const intParam = (v, name) => {
    if (v == null || v === "") return null;
    if (!/^\d+$/.test(String(v))) throw badRequest(`${name} must be a whole number`);
    return Number(v);
  };

  // Builds the output object for one row; returns null when an !inner embed is empty.
  function project(row, table, items, params) {
    const out = {};
    for (const it of items) {
      if (it.kind === "star") { for (const k of Object.keys(row)) out[k] = row[k]; continue; }
      if (it.kind === "col") { out[it.alias] = castValue(readPath(row, it.expr), it.cast); continue; }
      const relInfo = relationship(table, it.rel, it.hint, row);
      if (!relInfo) throw unsupported(`embed ${table} -> ${it.rel}`);
      const sub = embedParams(params, it.alias);
      const target = rowsOf(it.rel);
      if (target === null) throw unsupported(`embed of unknown table ${it.rel}`);
      let kids;
      if (relInfo.one) {
        const key = row[relInfo.col];
        const t = key == null ? null : (Array.isArray(tables[it.rel]) ? index(it.rel).get(String(key)) : null);
        kids = t && (!OWN_ROWS.has(it.rel) || t.user_id === me.id) ? [t] : [];
      } else {
        const id = row.id;
        kids = id == null ? [] : target.filter((k) => k[relInfo.col] != null && String(k[relInfo.col]) === String(id));
      }
      kids = applyFilters(kids, sub.filter(([k]) => !k.includes(".")));
      const isCount = it.children.length === 1 && it.children[0].kind === "col" && it.children[0].expr === "count" && !("count" in (kids[0] || {}));
      if (isCount) {
        if (it.inner && !kids.length) return null;
        out[it.alias] = [{ count: kids.length }];
        continue;
      }
      const subOrder = (sub.find(([k]) => k === "order") || [])[1];
      kids = applyOrder(kids, subOrder, it.rel);
      const so = intParam((sub.find(([k]) => k === "offset") || [])[1], "offset") || 0;
      const sl = intParam((sub.find(([k]) => k === "limit") || [])[1], "limit");
      if (so || sl != null) kids = kids.slice(so, sl != null ? so + sl : undefined);
      const shaped = [];
      for (const k of kids) {
        const o = project(k, it.rel, it.children.length ? it.children : [{ kind: "star" }], sub);
        if (o) shaped.push(o);
      }
      if (it.inner && !shaped.length) return null;
      const val = relInfo.one ? (shaped[0] || null) : shaped;
      if (it.spread && relInfo.one) Object.assign(out, val || {});
      else out[it.alias] = val;
    }
    return out;
  }

  // ── PostgREST GET / HEAD: replay first, then the engine ──
  const wantsObject = (headers) => /application\/vnd\.pgrst\.object\+json/.test(String(headers.get("accept") || ""));
  function replayed(key, headers, method) {
    const r = replay.get(key);
    if (!r) return null;
    if (headers.get("range") || /count=/.test(String(headers.get("prefer") || "")) || wantsObject(headers)) return null;
    hits++;
    served.add(key);
    return { status: r.status, body: method === "HEAD" ? null : r.body, headers: r.contentRange ? { "Content-Range": r.contentRange } : {} };
  }
  function restRead(table, params, headers, method, key) {
    const r = replayed(key, headers, method);
    if (r) return r;
    if (misses.size < 200 || misses.has(key)) misses.set(key, (misses.get(key) || 0) + 1);
    const src = rowsOf(table);
    if (src === null) throw unsupported(`table ${table}`);
    st.reads++;
    let rows = applyFilters(src, [...params]);
    rows = applyOrder(rows, params.get("order"), table);
    let offset = intParam(params.get("offset"), "offset") || 0;
    let limit = intParam(params.get("limit"), "limit");
    const range = /^(\d+)-(\d*)$/.exec(String(headers.get("range") || "").trim());
    if (range) {
      offset = Number(range[1]);
      if (range[2] !== "") limit = Math.max(0, Number(range[2]) - offset + 1);
    }
    const total = rows.length;
    const page = rows.slice(offset, limit != null ? offset + limit : undefined);
    const items = parseSelect(params.get("select"));
    const out = [];
    for (const row of page) {
      const o = project(row, table, items, params);
      if (o) out.push(o);
    }
    const prefer = String(headers.get("prefer") || "");
    const counted = /count=(exact|planned|estimated)/.test(prefer);
    const cr = out.length ? `${offset}-${offset + out.length - 1}/${counted ? total : "*"}` : `*/${counted ? total : "*"}`;
    const extra = { "Content-Range": cr };
    if (wantsObject(headers)) {
      if (out.length !== 1) {
        throw new SimError(406, "JSON object requested, multiple (or no) rows returned",
          { code: "PGRST116", details: `The result contains ${out.length} rows` });
      }
      return { status: 200, body: method === "HEAD" ? null : out[0], headers: extra };
    }
    return { status: 200, body: method === "HEAD" ? null : out, headers: extra };
  }

  // ── writes: the read markers only, accepted and discarded (contract §G.3) ──
  const onlyKeys = (o, keys) => isObj(o) && Object.keys(o).every((k) => keys.includes(k));
  function liveWrite(method, table, params, headers, body) {
    const prefer = String(headers.get("prefer") || "");
    const entries = [...params];
    const answer = (status) => { st.writes++; return { status, body: null }; };
    if (method === "POST" && table === "comment_reads" && /resolution=ignore-duplicates/.test(prefer)
      && entries.every(([k]) => k === "columns" || k === "on_conflict")) {
      const rows = Array.isArray(body) ? body : [body];
      if (rows.length >= 1 && rows.length <= 5000 && rows.every((r) => onlyKeys(r, ["user_id", "comment_id", "read_at"])
        && r.user_id === me.id && typeof r.comment_id === "string" && UUID_RE.test(r.comment_id))) {
        st.accepted.comment_reads++;
        seen("POST comment_reads (read marker, discarded)");
        return answer(201);
      }
    }
    if (method === "PATCH" && table === "comments" && entries.length === 2
      && /^eq\.[0-9a-f-]{36}$/i.test(params.get("project_id") || "") && params.get("is_read_by_pmo") === "eq.false"
      && isObj(body) && Object.keys(body).length === 1 && body.is_read_by_pmo === true) {
      st.accepted.comments_read_flag++;
      seen("PATCH comments is_read_by_pmo (discarded)");
      return answer(204);
    }
    if (method === "POST" && table === "past_chat_reads" && /resolution=merge-duplicates/.test(prefer)
      && entries.length === 1 && params.get("on_conflict") === "user_id,thread") {
      const rows = Array.isArray(body) ? body : [body];
      if (rows.length >= 1 && rows.length <= 500 && rows.every((r) => onlyKeys(r, ["user_id", "thread", "read_at"])
        && r.user_id === me.id && typeof r.thread === "string" && r.thread.length <= 200)) {
        st.accepted.past_chat_reads++;
        seen("POST past_chat_reads (read marker, discarded)");
        return answer(201);
      }
    }
    toast(MSG.READ_ONLY);
    throw refused(`${method} ${table}`);
  }

  // ── RPC ──
  const RPC = {
    session_start: () => null,      // no session record: nothing about this run is logged
    session_log: () => null, session_touch: () => null, session_end: () => null, bump_session: () => null,
    tour_save_progress: () => null, mark_tutorial_complete: () => null, dismiss_tutorial: () => null, reset_tutorial: () => null,
    is_pmo: () => true, current_user_role: () => "pmo",
    can_view_project: () => true, can_view_past: () => true,
    is_past_viewer: () => false, is_past_pm: () => false, is_pm: () => false, is_guest: () => false, is_assigned: () => false,
    tour_demo_project: () => null,
    resolve_login_email: () => null,
    project_has_deliverables: (a) => deliverables.has(String(a?.p ?? a?.project_id ?? a?.pid ?? "")),
  };

  // ── storage ──
  const decPath = (p) => p.split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).join("/");
  function signedFor(bucket, path) {
    if (bucket !== "project-attachments") return null;
    const m = /^sim-media\/(m\d{3})$/.exec(String(path || "").replace(/^\/+/, ""));
    return m && media[m[1]] ? { signedURL: media[m[1]] } : null;
  }
  const noFile = () => new SimError(400, MSG.NO_FILE, { code: "404", error: MSG.NO_FILE });
  async function storage(method, path, body) {
    st.storage++;
    const sign = /^\/storage\/v1\/object\/sign\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (sign && method === "POST") {
      const bucket = decodeURIComponent(sign[1]);
      if (sign[2]) {
        const r = signedFor(bucket, decPath(sign[2]));
        if (!r) throw noFile();
        seen("POST storage sign");
        return { status: 200, body: r };
      }
      const paths = Array.isArray(body?.paths) ? body.paths : [];
      seen("POST storage sign (batch)");
      return { status: 200, body: paths.map((p) => {
        const r = signedFor(bucket, String(p));
        return r ? { error: null, path: p, signedURL: r.signedURL } : { error: MSG.NO_FILE, path: p, signedURL: null };
      }) };
    }
    const obj = /^\/storage\/v1\/object\/(?:sign\/|public\/|authenticated\/)?([^/]+)\/(.+)$/.exec(path);
    if (obj && (method === "GET" || method === "HEAD")) {
      const r = signedFor(decodeURIComponent(obj[1]), decPath(obj[2]));
      if (!r) throw noFile();
      seen("GET storage object");
      return { passthrough: r.signedURL };
    }
    if (/^\/storage\/v1\/object\//.test(path) && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      toast(MSG.READ_ONLY);
      throw refused(`${method} storage`);
    }
    throw unsupported(`storage ${method} ${path.slice(0, 80)}`);
  }

  // ── edge functions: none runs in the presentation ──
  function fn(name) {
    st.functions++;
    const msg = name === "ask" ? MSG.ASK : MSG.READ_ONLY;
    cap(st.blocked, { fn: name.slice(0, 60), at: nowIso() });
    seen("POST functions/" + name.slice(0, 60) + " (blocked)");
    toast(msg);
    return { status: 403, body: { code: "SIM403", message: msg, error: msg, ok: false } };
  }

  // ── auth ──
  function auth(method, path, params) {
    st.auth++;
    const sub = path.slice("/auth/v1/".length);
    const deny = (status, msg, code) => { throw new SimError(status, msg, { code, error: code || "simulation", error_description: msg, msg }); };
    if (sub === "token" && method === "POST") {
      const grant = params.get("grant_type");
      if (grant === "refresh_token") {
        const t = issueTokens();
        seen("POST auth/token refresh");
        return { status: 200, body: { access_token: t.access_token, token_type: "bearer", expires_in: TTL_S,
          expires_at: t.expires_at, refresh_token: t.refresh_token, user: authUser(store) } };
      }
      deny(400, MSG.NO_SIGNIN, "invalid_grant");
    }
    if (sub === "user" && method === "GET") { seen("GET auth/user"); return { status: 200, body: authUser(store) }; }
    if (sub === "user" && (method === "PUT" || method === "PATCH")) deny(422, MSG.NO_PASSWORD, "simulation");
    if (sub === "logout" && method === "POST") { seen("POST auth/logout"); return { status: 204, body: null }; }
    if (["recover", "verify", "otp", "signup", "magiclink", "resend", "invite", "authorize", "callback"].includes(sub.split("/")[0])) deny(400, MSG.NO_SIGNIN, "simulation");
    throw unsupported(`auth ${method} ${sub.slice(0, 40)}`);
  }

  // ── one request to the Supabase host ──
  async function handle(method, url, headers, bodyText) {
    const path = url.pathname;
    let body = null;
    if (bodyText != null && bodyText !== "") {
      try { body = JSON.parse(bodyText); } catch { body = undefined; }
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      st.rpc++;
      const name = decodeURIComponent(path.slice("/rest/v1/rpc/".length));
      if (!Object.prototype.hasOwnProperty.call(RPC, name)) {
        if (st.rpcUnknown.length < 100 && !st.rpcUnknown.includes(name.slice(0, 60))) st.rpcUnknown.push(name.slice(0, 60));
        throw unsupported("rpc " + name.slice(0, 60));
      }
      const args = method === "GET" ? Object.fromEntries(url.searchParams) : (body && typeof body === "object" ? body : {});
      seen(`POST rpc/${name}`);
      const r = RPC[name](args);
      return { status: 200, body: r === undefined ? null : r };
    }
    if (path.startsWith("/rest/v1/")) {
      st.rest++;
      const table = decodeURIComponent(path.slice("/rest/v1/".length)).replace(/\/+$/, "");
      if (!table || table.includes("/")) throw unsupported("rest " + path.slice(0, 60));
      if (method === "GET" || method === "HEAD") {
        seen(`GET ${table}`);
        return restRead(table, url.searchParams, headers, method, url.pathname + url.search);
      }
      if (["POST", "PATCH", "DELETE", "PUT"].includes(method)) {
        seen(`${method} ${table}`);
        return liveWrite(method, table, url.searchParams, headers, body);
      }
      throw unsupported(`${method} ${table}`);
    }
    if (path.startsWith("/storage/v1/")) return storage(method, path, body);
    if (path.startsWith("/functions/v1/")) {
      const name = decodeURIComponent(path.slice("/functions/v1/".length).split("/")[0]);
      return fn(name);
    }
    if (path.startsWith("/auth/v1/")) return auth(method, path, url.searchParams);
    if (path.startsWith("/realtime/v1")) throw unsupported("realtime over http");
    throw unsupported(`${method} ${path.slice(0, 60)}`);
  }

  const jsonResponse = (status, body, extra = {}) => {
    const nobody = status === 204 || status === 205 || status === 304 || body === null;
    return new Response(nobody ? null : JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
    });
  };
  const errorResponse = (e, method, path) => {
    const x = e.extra || {};
    if (x.unhandled) report({ kind: "supabase", method, path: path.slice(0, 200), detail: x.details || "" });
    if (x.refused) cap(st.refused, { method, path: path.slice(0, 200), reason: e.message });
    const body = { code: x.code || "SIM" + e.status, message: e.message, details: x.details || null, hint: null };
    if (x.error || x.refused) body.error = x.refused ? e.message : x.error;
    if (x.error_description) { body.error_description = x.error_description; body.msg = x.msg; }
    return jsonResponse(e.status || 500, body);
  };

  // ── the fetch wrapper ──
  if (!nativeFetch) nativeFetch = window.fetch;
  const realFetch = nativeFetch;
  async function simFetch(input, init) {
    const isReq = typeof Request !== "undefined" && input instanceof Request;
    const rawUrl = isReq ? input.url : String(input instanceof URL ? input.href : input);
    let url;
    try { url = new URL(rawUrl, location.href); } catch { return realFetch.call(window, input, init); }
    const signal = (init && init.signal) || (isReq ? input.signal : null);
    if (signal && signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if (url.protocol === "blob:" || url.protocol === "data:") return realFetch.call(window, input, init);
    if (url.origin === location.origin) return realFetch.call(window, input, init);
    st.calls++;
    const method = String((init && init.method) || (isReq ? input.method : "GET")).toUpperCase();
    const headers = new Headers(isReq ? input.headers : undefined);
    if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    const where = url.pathname + url.search;
    if (url.origin !== SUPA_ORIGIN) {
      cap(st.outside, { method, url: url.origin + url.pathname.slice(0, 120) });
      report({ kind: "outside", method, path: url.origin + url.pathname.slice(0, 120), detail: "another site" });
      return jsonResponse(501, { code: "SIM501", message: MSG.NA, details: "This page talks only to itself.", hint: null });
    }
    let bodyText = null;
    const rawBody = init && "body" in init ? init.body : null;
    const isUpload = /^\/storage\/v1\/object\/(?!sign\/)/.test(url.pathname) && (method === "POST" || method === "PUT");
    if (!isUpload) {
      try {
        if (rawBody != null) bodyText = typeof rawBody === "string" ? rawBody
          : rawBody instanceof URLSearchParams ? rawBody.toString()
            : (typeof Blob !== "undefined" && rawBody instanceof Blob) ? await rawBody.text()
              : rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody) ? new TextDecoder().decode(rawBody) : null;
        else if (isReq && method !== "GET" && method !== "HEAD") bodyText = await input.clone().text();
      } catch { bodyText = null; }
    }
    const authz = String(headers.get("authorization") || "");
    if (/^Bearer eyJ/i.test(authz) && !url.pathname.startsWith("/auth/v1/")) {
      // A real (JWT) user token never exists in this page; the anon key goes in apikey, not here.
      report({ kind: "token", method, path: url.pathname.slice(0, 120), detail: "a JWT bearer token" });
    } else if (authz && !isSimToken(authz.replace(/^Bearer\s+/i, "")) && !url.pathname.startsWith("/auth/v1/")) {
      report({ kind: "token", method, path: url.pathname.slice(0, 120), detail: "an unknown bearer token" });
    }
    try {
      const r = await handle(method, url, headers, bodyText);
      if (r.passthrough) return realFetch.call(window, r.passthrough, { method: method === "HEAD" ? "HEAD" : "GET", signal: signal || undefined });
      return jsonResponse(r.status, r.body, r.headers || {});
    } catch (e) {
      if (e instanceof SimError) return errorResponse(e, method, where);
      report({ kind: "error", method, path: where.slice(0, 200), detail: String(e && e.message || e).slice(0, 200) });
      return jsonResponse(500, { code: "SIM500", message: MSG.NA, details: String(e && e.message || e).slice(0, 200), hint: null });
    }
  }
  Object.defineProperty(simFetch, "name", { value: "fetch" });
  window.fetch = simFetch;

  // ── XMLHttpRequest: only this page's own address goes through ──
  const XHR = window.XMLHttpRequest;
  const xhrOpen = XHR && XHR.prototype.open, xhrSend = XHR && XHR.prototype.send;
  if (XHR) {
    XHR.prototype.open = function (method, u, ...rest) {
      let ok = false;
      try { const x = new URL(String(u), location.href); ok = x.origin === location.origin || x.protocol === "blob:" || x.protocol === "data:"; } catch { ok = false; }
      this.__simBlocked = ok ? null : String(u).slice(0, 160);
      return xhrOpen.call(this, method, ok ? u : location.href, ...rest);   // never sent: see send()
    };
    XHR.prototype.send = function (b) {
      if (!this.__simBlocked) return xhrSend.call(this, b);
      st.calls++;
      report({ kind: "xhr", method: "XHR", path: this.__simBlocked, detail: "XMLHttpRequest to another address" });
      const x = this;
      setTimeout(() => {
        try {
          Object.defineProperty(x, "readyState", { configurable: true, value: 4 });
          Object.defineProperty(x, "status", { configurable: true, value: 0 });
          x.dispatchEvent(new Event("readystatechange"));
          x.dispatchEvent(new ProgressEvent("error"));
          x.dispatchEvent(new ProgressEvent("loadend"));
        } catch { /* ignore */ }
      }, 0);
    };
  }

  // ── WebSocket / EventSource: a socket that never connects (no error, no console noise) ──
  const RealWS = window.WebSocket, RealES = window.EventSource;
  class QuietSocket extends EventTarget {
    constructor(u) {
      super();
      this.url = String(u); this.readyState = 0; this.protocol = ""; this.extensions = "";
      this.bufferedAmount = 0; this.binaryType = "blob"; this.withCredentials = false;
      this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    }
    send() { /* never sent */ }
    close() { this.readyState = 3; }
  }
  for (const [k, v] of Object.entries({ CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })) QuietSocket[k] = v;
  const guardSocket = (Real, kind) => {
    if (!Real) return Real;
    const G = function (u, p) {
      let same = false;
      try { const x = new URL(String(u), location.href); same = x.host === location.host; } catch { same = false; }
      if (same) return p === undefined ? new Real(u) : new Real(u, p);
      st.sockets++;
      report({ kind, method: kind, path: String(u).slice(0, 160), detail: "never connected" });
      return new QuietSocket(u);
    };
    G.prototype = Real.prototype;
    for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) if (k in Real) G[k] = Real[k];
    return G;
  };
  if (RealWS) window.WebSocket = guardSocket(RealWS, "websocket");
  if (RealES) window.EventSource = guardSocket(RealES, "eventsource");

  // ── checkpoints: nothing to keep (the tables never change in live mode) ──
  const snapshot = () => ({ v: 2, seq: ++seq });
  const restore = (snap) => {
    if (!snap || typeof snap !== "object" || snap.v !== 2) throw new Error("Simulation backend: not a checkpoint");
  };
  const stats = () => {
    const s = clone(st);
    s.unhandledCount = st.unhandled.length;
    s.refusedCount = st.refused.length;
    s.blockedCount = st.blocked.length;
    s.outsideCount = st.outside.length;
    s.replay = {
      hits,
      misses: [...misses].map(([key, n]) => ({ key, n })).slice(0, 200),
      unused: [...replay.keys()].filter((k) => !served.has(k)),
    };
    return s;
  };
  const reset = () => { st = freshStats(); hits = 0; misses = new Map(); served = new Set(); };
  const uninstall = () => {
    // Supabase stays answered from memory (never the real fetch), so nothing still mounted can
    // reach production after this; only the other wrappers are put back.
    if (XHR) { XHR.prototype.open = xhrOpen; XHR.prototype.send = xhrSend; }
    if (RealWS) window.WebSocket = RealWS;
    if (RealES) window.EventSource = RealES;
    if (installed === api) installed = null;
  };
  const api = { snapshot, restore, stats, reset, uninstall, media: () => ({ ...media }) };
  installed = api;
  try {
    // For the run report and the automated checks: counts and paths only, never rows.
    Object.defineProperty(window, "__PMO_SIM_BACKEND_STATS__", { configurable: true, enumerable: false, value: stats });
  } catch { /* ignore */ }
  return api;
}

/** Writes the synthetic PMO session (see ./session.js). Call after installBackend, before the App mounts. */
export function prepareSession(store) {
  return writeSession(store);
}
