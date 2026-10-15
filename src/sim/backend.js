// PMO Simulation: the synthetic Supabase backend.
//
// installBackend({ store, mediaUrls, onUnhandled }) wraps window.fetch (and XMLHttpRequest,
// WebSocket and EventSource) so that every request the portal makes to its Supabase project is
// answered here, in the page, from the in-memory store (the resolved seed). Nothing reaches the
// network: requests to the Supabase host are answered from memory, requests to any other site are
// refused, and only this page's own files (and blob:/data:) go to the browser's real fetch.
//
//   /rest/v1/<table|view>  a small PostgREST: select (columns, aliases, casts, JSON paths, embedded
//                          resources with hints, !inner, count), filters (eq neq gt gte lt lte like
//                          ilike match imatch in is isdistinct cs cd ov fts…, not., or/and trees),
//                          order (several keys, nullsfirst/last, enum order), limit/offset, Range,
//                          Prefer count=…, single-object Accept, HEAD; writes (POST, upsert, PATCH,
//                          DELETE, PUT) kept in memory so read marks and badges count down.
//   /rest/v1/rpc/<fn>      the functions the portal calls, answered plausibly.
//   /storage/v1/…          sign requests answered with this page's own files (fictional documents
//                          under BASE_URL + "sim/files/") or the blob: links of handed-over media;
//                          uploads refused.
//   /functions/v1/<fn>     ask answers locally; everything that would send or act is refused with
//                          "Not sent: this is the simulation. Nothing leaves this page."
//   /auth/v1/…             refresh answers with synthetic tokens; sign-in, recovery and password
//                          changes are refused.
// Anything not recognised is answered 501 {message: "Not available in the simulation"} and reported
// through onUnhandled and stats().
//
// Writes that would bring real data in under fictional labels are refused: storage uploads, the
// projects import (its pre-import snapshot), wipe-all deletes, bulk inserts of projects / past
// projects / WBS tasks and the WBS import's per-task inserts.
//
// The repo is public: this file holds no names, keys or tokens. The Supabase address below is the
// portal's own public project address (also in src/App.jsx and src/auth.js); it is only matched,
// never contacted.
import { authUser, issueTokens, isSimToken, prepareSession as writeSession, sessionUser, TTL_S } from "./session.js";

export const SUPA_ORIGIN = "https://prmxkecomqqngvrmytcj.supabase.co";

export const MSG = Object.freeze({
  NA: "Not available in the simulation",
  NOT_SENT: "Not sent: this is the simulation. Nothing leaves this page.",
  NO_IMPORT: "Not available in the simulation: nothing from this computer is imported or uploaded here.",
  NO_ACCOUNTS: "Not available in the simulation: accounts are not created, changed or removed here.",
  NO_SIGNIN: "Sign-in is not available in the simulation.",
  NO_PASSWORD: "Passwords are not changed in the simulation.",
  ASK: "In the simulation the assistant answers from prepared questions only.",
});

const BASE = (() => {
  try { return import.meta.env.BASE_URL || "/"; } catch { return "/"; }
})();

// ── tables the real database has (37 tables + views); a known one the seed leaves out reads as empty ──
const KNOWN = new Set([
  "projects", "project_assignments", "project_cashflows", "project_risks", "project_raci", "project_tasks",
  "project_attachments", "project_deliverables", "comments", "comment_reads", "lessons_learned", "benefits_realized",
  "past_projects", "past_project_updates", "past_project_tasks", "past_pm_messages", "past_chat_reads", "user_profiles",
  "campuses", "cost_centers", "sectors", "segments", "regions", "settings", "snapshots", "carry_forward_projects",
  "activity_log", "user_sessions", "session_events", "tour_events", "notifications_log", "user_webauthn_credentials",
  "webauthn_challenges", "push_subscriptions", "pmo_active_session", "milestones", "epdd_pdds", "epdd_files",
  "epdd_reviews", "epdd_sync_runs", "epdd_state", "board_reports", "board_report_recipients",
  // views
  "portfolio_metrics", "portfolio_dashboard", "project_metrics", "investment_metrics", "cashflow_monthly",
  "at_risk_projects", "pdd_pending_projects", "project_task_rollup", "project_risks_scored", "lessons_learned_full",
  "benefits_realized_full", "past_project_summary", "past_project_task_rollup", "session_summary", "tour_progress",
]);
const VIEWS = new Set([
  "portfolio_metrics", "portfolio_dashboard", "project_metrics", "investment_metrics", "cashflow_monthly",
  "at_risk_projects", "pdd_pending_projects", "project_task_rollup", "project_risks_scored", "lessons_learned_full",
  "benefits_realized_full", "past_project_summary", "past_project_task_rollup", "session_summary", "tour_progress",
]);
// Always empty in the simulation, whatever the seed holds: these drive the sign-in pop-ups
// (deadline alerts, PDD reminders), which would block the run.
const ALWAYS_EMPTY = new Set(["at_risk_projects", "pdd_pending_projects"]);
// The database has no policies on these for the browser.
const NO_ACCESS = new Set(["epdd_state", "webauthn_challenges", "pmo_active_session"]);
// Row-level security: these return only the caller's own rows.
const OWN_ROWS = new Set(["comment_reads", "past_chat_reads", "push_subscriptions", "user_webauthn_credentials",
  "tour_events", "user_sessions"]);
// Views whose rows mirror a base table (same id): for relationships and to follow writes.
const VIEW_BASE = { project_metrics: "projects", project_risks_scored: "project_risks",
  past_project_summary: "past_projects", lessons_learned_full: "lessons_learned", benefits_realized_full: "benefits_realized" };

const PK = { settings: ["key"], comment_reads: ["user_id", "comment_id"], past_chat_reads: ["user_id", "thread"],
  board_report_recipients: ["report_id", "user_id"], epdd_state: ["key"], push_subscriptions: ["endpoint"] };
const pkOf = (t) => PK[t] || ["id"];

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

// Enum columns sort in declaration order, not alphabetically.
const ENUM_ORDER = {
  role: ["pmo", "project_manager", "guest"],
  actor_role: ["pmo", "project_manager", "guest"],
  author_role: ["pmo", "project_manager", "guest"],
  raci_role: ["R", "A", "C", "I"],
  workflow_stage: ["pdd_not_submitted", "identified", "pdd_submitted", "df_review", "ed_review", "mt_review", "approved", "closed"],
};

// Columns a new row gets when the insert leaves them out (what the database defaults or triggers do).
const DEFAULTS = {
  comments: { is_read_by_pmo: false, parent_id: null },
  board_report_recipients: { removed: false, seen_at: null, emailed_at: null },
  project_deliverables: { confirmed: true, superseded: false, status: "not_started" },
  project_tasks: { is_milestone: false, pct_complete: 0, status: "not_started", parent_id: null },
  past_project_tasks: { is_milestone: false, pct_complete: 0, status: "not_started", parent_id: null },
  user_profiles: { is_active: true, notify_email: true, whatsapp_opt_in: false },
  epdd_pdds: { is_history: false },
  past_projects: { status: "open" },
  board_reports: { status: "draft" },
};
const NOW_COLS = new Set(["created_at", "updated_at", "uploaded_at", "added_at", "assigned_at", "read_at"]);

const clone = (v) => {
  if (typeof structuredClone === "function") { try { return structuredClone(v); } catch { /* fall through */ } }
  return JSON.parse(JSON.stringify(v));
};
const nowIso = () => new Date().toISOString();
const uuid = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};

class SimError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const unsupported = (what) => new SimError(501, MSG.NA, { code: "SIM501", details: what, unhandled: true });
const refused = (message, what) => new SimError(403, message, { code: "SIM403", details: what, refused: true });
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
const COLL = typeof Intl !== "undefined" && Intl.Collator ? new Intl.Collator("en", { sensitivity: "variant" }) : null;

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
// two row values, for ORDER BY
function cmpSort(a, b, col) {
  const en = ENUM_ORDER[col];
  if (en && typeof a === "string" && typeof b === "string") {
    const ia = en.indexOf(a), ib = en.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  const da = dateMs(sa), db = dateMs(sb);
  if (!isNaN(da) && !isNaN(db)) return da - db;
  if (NUM_RE.test(sa) && NUM_RE.test(sb)) return Number(sa) - Number(sb);
  return COLL ? COLL.compare(sa, sb) : (sa < sb ? -1 : sa > sb ? 1 : 0);
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
 * Installs the synthetic backend. Returns { snapshot, restore, stats, reset }.
 * store: the resolved seed ({ tables, meta, … }); its tables are served and written in place.
 * mediaUrls: { <media key>: "blob:…" } for the handed-over (or sample) media.
 * onUnhandled(info): called for every request the backend does not recognise (and every request
 *   to another site), with { kind, method, path, detail }.
 */
export function installBackend({ store, mediaUrls = {}, onUnhandled } = {}) {
  if (!store || typeof store !== "object" || !store.tables || typeof store.tables !== "object") {
    throw new Error("Simulation backend: store.tables missing");
  }
  if (installed) installed.uninstall();
  const tables = store.tables;
  const me = sessionUser(store);
  const media = { ...mediaUrls };

  const freshStats = () => ({
    calls: 0, rest: 0, rpc: 0, storage: 0, functions: 0, auth: 0, local: 0,
    reads: 0, writes: 0, emptyTables: {}, refused: [], blocked: [], unhandled: [], outside: [],
    sockets: 0, endpoints: {},
  });
  let st = freshStats();
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
  const writable = (t) => {
    if (!Array.isArray(tables[t])) tables[t] = [];
    return tables[t];
  };
  const byId = new Map();          // table -> Map(id -> row), rebuilt lazily after writes
  const index = (t) => {
    let m = byId.get(t);
    if (!m) {
      m = new Map();
      for (const r of (Array.isArray(tables[t]) ? tables[t] : [])) if (r && r.id != null) m.set(String(r.id), r);
      byId.set(t, m);
    }
    return m;
  };
  const dirty = (t) => { byId.delete(t); const v = Object.keys(VIEW_BASE).find((k) => VIEW_BASE[k] === t); if (v) byId.delete(v); };

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
  function applyFilters(rows, entries, table) {
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
  function applyOrder(rows, order) {
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
        const c = cmpSort(a, b, parseColExpr(k.col).col);
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
      kids = applyFilters(kids, sub.filter(([k]) => !k.includes(".")), it.rel);
      const isCount = it.children.length === 1 && it.children[0].kind === "col" && it.children[0].expr === "count" && !("count" in (kids[0] || {}));
      if (isCount) {
        if (it.inner && !kids.length) return null;
        out[it.alias] = [{ count: kids.length }];
        continue;
      }
      const subOrder = (sub.find(([k]) => k === "order") || [])[1];
      kids = applyOrder(kids, subOrder);
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

  // ── PostgREST GET / HEAD ──
  function restRead(table, params, headers, method) {
    const src = rowsOf(table);
    if (src === null) throw unsupported(`table ${table}`);
    st.reads++;
    let rows = applyFilters(src, [...params], table);
    rows = applyOrder(rows, params.get("order"));
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
    for (const r of page) {
      const o = project(r, table, items, params);
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
  const wantsObject = (headers) => /application\/vnd\.pgrst\.object\+json/.test(String(headers.get("accept") || ""));

  // ── writes ──
  const filterEntries = (params) => [...params].filter(([k]) => !["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k) && !k.includes(".") || k === "not.or" || k === "not.and");
  function refuseWrite(method, table, params, body, prefer) {
    const entries = filterEntries(params);
    const wipeAll = entries.some(([k, v]) => v === "not.is.null" && pkOf(table).includes(k));
    if (table === "snapshots" && method !== "GET") return MSG.NO_IMPORT;
    if (method === "DELETE" && wipeAll) return MSG.NO_IMPORT;
    if ((method === "DELETE" || method === "PATCH") && entries.length === 0) return MSG.NA + ": every change names its rows";
    const bulkTables = ["projects", "past_projects", "project_tasks", "past_project_tasks"];
    if (method === "POST" && Array.isArray(body) && bulkTables.includes(table)) return MSG.NO_IMPORT;
    if (method === "POST" && /^(past_)?project_tasks$/.test(table) && /return=representation/.test(prefer)) return MSG.NO_IMPORT;
    if (method === "DELETE" && /^(past_)?project_tasks$/.test(table) && !entries.some(([k]) => k === "id")) return MSG.NO_IMPORT;
    if (table === "user_profiles" && method !== "PATCH") return MSG.NO_ACCOUNTS;
    if (["push_subscriptions", "user_webauthn_credentials", "webauthn_challenges", "epdd_state", "pmo_active_session"].includes(table)) return MSG.NA;
    return null;
  }

  function newRowDefaults(table, obj) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    const sample = rows[0] || {};
    const pk = pkOf(table);
    if (pk.length === 1 && pk[0] === "id" && obj.id == null) {
      const numeric = rows.length && rows.every((r) => typeof r.id === "number");
      obj.id = numeric ? rows.reduce((m, r) => Math.max(m, r.id), 0) + 1 : uuid();
    }
    if (OWN_ROWS.has(table) && obj.user_id == null) obj.user_id = me.id;
    const d = DEFAULTS[table] || {};
    for (const k of Object.keys(d)) if (!(k in obj)) obj[k] = d[k];
    for (const k of Object.keys(sample)) {
      if (k in obj) continue;
      if (NOW_COLS.has(k)) obj[k] = nowIso();
      else if (typeof sample[k] === "boolean") obj[k] = false;
      else obj[k] = null;
    }
    for (const k of NOW_COLS) if (!(k in obj) && !rows.length && (k === "created_at")) obj[k] = nowIso();
    return obj;
  }

  function restWrite(method, table, params, headers, body) {
    if (!KNOWN.has(table) && !Array.isArray(tables[table])) throw unsupported(`write to table ${table}`);
    if (VIEWS.has(table)) throw unsupported(`write to view ${table}`);
    const prefer = String(headers.get("prefer") || "");
    const why = refuseWrite(method, table, params, body, prefer);
    if (why) throw refused(why, `${method} ${table}`);
    const rep = /return=representation/.test(prefer);
    const items = parseSelect(params.get("select"));
    const shape = (rows) => rows.map((r) => project(r, table, items, params)).filter(Boolean);
    const list = writable(table);
    let changed = [];
    let status;
    if (method === "POST" || method === "PUT") {
      if (body == null || typeof body !== "object") throw badRequest("Empty or invalid json", "PGRST102");
      const arr = Array.isArray(body) ? body : [body];
      if (arr.length > 1) {
        const k0 = Object.keys(arr[0]).sort().join(",");
        if (arr.some((o) => Object.keys(o).sort().join(",") !== k0)) throw badRequest("All object keys must match", "PGRST102");
      }
      const cols = params.get("columns") ? splitTop(params.get("columns")) : null;
      const conflict = params.get("on_conflict") ? splitTop(params.get("on_conflict")) : pkOf(table);
      const resolution = method === "PUT" ? "merge" : /resolution=merge-duplicates/.test(prefer) ? "merge"
        : /resolution=ignore-duplicates/.test(prefer) ? "ignore" : null;
      for (const raw of arr) {
        const given = cols ? Object.fromEntries(cols.filter((c) => c in raw).map((c) => [c, raw[c]])) : { ...raw };
        const hit = conflict.every((c) => given[c] != null)
          ? list.find((r) => conflict.every((c) => r[c] != null && String(r[c]) === String(given[c]))) : null;
        if (hit) {
          if (resolution === "merge") { Object.assign(hit, given); if ("updated_at" in hit && !("updated_at" in given)) hit.updated_at = nowIso(); changed.push(hit); }
          else if (resolution === "ignore") { /* left as it is */ }
          else throw new SimError(409, `duplicate key value violates unique constraint "${table}_pkey"`, { code: "23505" });
          continue;
        }
        const row = newRowDefaults(table, given);
        list.push(row);
        changed.push(row);
      }
      status = 201;
      afterWrite("insert", table, changed);
    } else if (method === "PATCH") {
      if (body == null || typeof body !== "object" || Array.isArray(body)) throw badRequest("Empty or invalid json", "PGRST102");
      const targets = applyFilters(list.filter((r) => !OWN_ROWS.has(table) || r.user_id === me.id), [...params], table);
      for (const r of targets) {
        Object.assign(r, body);
        if ("updated_at" in r && !("updated_at" in body)) r.updated_at = nowIso();
      }
      changed = targets;
      status = rep ? 200 : 204;
      afterWrite("update", table, changed);
    } else if (method === "DELETE") {
      const targets = applyFilters(list.filter((r) => !OWN_ROWS.has(table) || r.user_id === me.id), [...params], table);
      const gone = new Set(targets);
      // ON DELETE CASCADE for self-references (replies, sub-tasks)
      if (["comments", "project_tasks", "past_project_tasks"].includes(table)) {
        let grew = true;
        while (grew) {
          grew = false;
          for (const r of list) if (!gone.has(r) && r.parent_id != null && [...gone].some((g) => String(g.id) === String(r.parent_id))) { gone.add(r); grew = true; }
        }
      }
      for (let i = list.length - 1; i >= 0; i--) if (gone.has(list[i])) list.splice(i, 1);
      changed = targets;
      status = rep ? 200 : 204;
      afterWrite("delete", table, [...gone]);
    } else throw unsupported(`${method} ${table}`);
    st.writes++;
    if (!rep) return { status: status === 200 ? 204 : status, body: null };
    const shaped = shape(changed);
    if (wantsObject(headers)) {
      if (shaped.length !== 1) throw new SimError(406, "JSON object requested, multiple (or no) rows returned", { code: "PGRST116" });
      return { status, body: shaped[0] };
    }
    return { status, body: shaped };
  }

  // What the database's triggers and views would do after a write.
  const sevOf = (pr, im) => (pr === "high" && im === "high" ? "critical"
    : (pr === "high" && im === "medium") || (pr === "medium" && im === "high") ? "high"
      : pr === "low" && im === "low" ? "low" : "medium");
  function mirror(view, base, ids, extra) {
    if (!Array.isArray(tables[view])) return;
    const v = tables[view];
    const baseRows = Array.isArray(tables[base]) ? tables[base] : [];
    for (const id of ids) {
      const b = baseRows.find((r) => String(r.id) === String(id));
      const i = v.findIndex((r) => String(r.id) === String(id));
      if (!b) { if (i >= 0) v.splice(i, 1); continue; }
      const next = { ...(i >= 0 ? v[i] : {}), ...b, ...(extra ? extra(b) : {}) };
      if (i >= 0) v[i] = next; else v.push(next);
    }
    byId.delete(view);
  }
  function pastSummaryExtra(p) {
    const u = index("user_profiles").get(String(p.pm_user_id));
    const ups = (tables.past_project_updates || []).filter((x) => String(x.past_project_id) === String(p.id))
      .sort((a, b) => cmpSort(a.created_at, b.created_at, "created_at"));
    const last = ups[ups.length - 1];
    const day = (s) => Math.floor(dateMs(String(s).slice(0, 10)) / 864e5);
    const today = new Date(); const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 864e5;
    return { pm_name: u ? (u.full_name || u.username) : null, pm_email: u ? u.email : null, update_count: ups.length,
      last_update_at: last ? last.created_at : null, last_update_role: last ? last.author_role : null,
      days_since_followup: p.last_followed_up ? Math.round(t - day(p.last_followed_up)) : null };
  }
  function afterWrite(kind, table, rows) {
    dirty(table);
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    if (table === "projects") mirror("project_metrics", "projects", ids);
    if (table === "project_risks") mirror("project_risks_scored", "project_risks", ids, (r) => {
      const p = index("projects").get(String(r.project_id));
      return { project_name: p ? p.name : null, project_code: p ? p.code : null, project_campus: p ? p.campus : null,
        severity: sevOf(r.probability, r.impact) };
    });
    if (table === "past_projects") mirror("past_project_summary", "past_projects", ids, pastSummaryExtra);
    if (kind === "insert" && (table === "past_project_updates" || table === "past_pm_messages")) {
      // Following up from the PMO records the date on the past project (as the database trigger does).
      const touched = new Set();
      for (const r of rows) {
        if (!r.past_project_id) continue;
        const p = index("past_projects").get(String(r.past_project_id));
        if (p && r.author_role === "pmo" && "last_followed_up" in p) p.last_followed_up = nowIso().slice(0, 10);
        touched.add(r.past_project_id);
      }
      if (touched.size) mirror("past_project_summary", "past_projects", [...touched], pastSummaryExtra);
    }
    if (table === "user_profiles") { byId.delete("user_profiles"); }
  }

  // ── RPC ──
  const pastViewerIds = () => {
    const s = (tables.settings || []).find((x) => x.key === "past_viewers");
    const v = s && (typeof s.value === "string" ? (() => { try { return JSON.parse(s.value); } catch { return null; } })() : s.value);
    return Array.isArray(v?.user_ids) ? v.user_ids : [];
  };
  const RPC = {
    session_start: () => null,      // no session record: nothing about this run is logged
    session_log: () => null, session_touch: () => null, session_end: () => null, bump_session: () => null,
    is_past_viewer: () => pastViewerIds().includes(me.id),
    is_past_pm: () => false,
    is_pmo: () => true, is_pm: () => false, is_guest: () => false, current_user_role: () => "pmo",
    is_assigned: () => false, can_view_project: () => true, can_view_past: () => true,
    resolve_login_email: () => null,
    tour_save_progress: () => null, mark_tutorial_complete: () => null, dismiss_tutorial: () => null,
    reset_tutorial: () => null,
    tour_demo_project: () => store?.meta?.storyProjectId || null,
    project_has_deliverables: (a) => {
      const p = String(a.p ?? a.project_id ?? a.pid ?? "");
      if (!p) return false;
      if ((tables.project_deliverables || []).some((d) => String(d.project_id) === p && !d.superseded)) return true;
      if ((tables.epdd_pdds || []).some((d) => String(d.linked_project_id) === p && /^(PMO|All) Approved$/i.test(String(d.epdd_status || "")))) return true;
      return (tables.project_attachments || []).some((x) => String(x.project_id) === p && x.kind !== "site_visit"
        && (/^(PDD|EPDD)/i.test(String(x.file_name || "")) || /charter/i.test(String(x.file_name || ""))));
    },
  };

  // ── storage ──
  const encPath = (p) => p.split("/").map((s) => encodeURIComponent(s)).join("/");
  const decPath = (p) => p.split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).join("/");
  function signedFor(bucket, path) {
    const p = String(path || "").replace(/^\/+/, "");
    if (/^sim-media\//.test(p)) {
      const key = p.slice("sim-media/".length);
      return media[key] ? { signedURL: media[key] } : null;
    }
    if (bucket === "project-attachments") {
      const known = (tables.project_attachments || []).some((a) => a.file_path === p);
      if (!known) return null;
      return { signedURL: BASE + "sim/files/" + encPath(p.replace(/^sim\/files\//, "")) };
    }
    if (bucket === "epdd-files") {
      const known = (tables.epdd_files || []).some((f) => f.storage_path === p);
      if (!known) return null;
      return { signedURL: BASE + "sim/files/" + encPath(p.replace(/^sim\/files\//, "")) };
    }
    return null;
  }
  async function storage(method, path, body, headers, realFetch) {
    st.storage++;
    const sign = /^\/storage\/v1\/object\/sign\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (sign && method === "POST") {
      const bucket = decodeURIComponent(sign[1]);
      if (!["project-attachments", "epdd-files"].includes(bucket)) throw new SimError(400, "Bucket not found", { code: "404", error: "Bucket not found" });
      if (sign[2]) {
        const r = signedFor(bucket, decPath(sign[2]));
        if (!r) throw new SimError(400, "Object not found", { code: "404", error: "not_found" });
        seen("POST storage sign");
        return { status: 200, body: r };
      }
      const paths = Array.isArray(body?.paths) ? body.paths : [];
      seen("POST storage sign (batch)");
      return { status: 200, body: paths.map((p) => {
        const r = signedFor(bucket, String(p));
        return r ? { error: null, path: p, signedURL: r.signedURL } : { error: "Either the object does not exist or you do not have access to it", path: p, signedURL: null };
      }) };
    }
    // GET of a signed or public object: this page's own file, or a handed-over blob
    const obj = /^\/storage\/v1\/object\/(?:sign\/|public\/|authenticated\/)?([^/]+)\/(.+)$/.exec(path);
    if (obj && (method === "GET" || method === "HEAD")) {
      const r = signedFor(decodeURIComponent(obj[1]), decPath(obj[2]));
      if (!r) throw new SimError(400, "Object not found", { code: "404", error: "not_found" });
      seen("GET storage object");
      return { passthrough: new URL(r.signedURL, location.href).href };
    }
    // The address the portal used to build before storageUrl(): SUPA + "/storage/v1" + signedURL
    const legacy = path.indexOf("/storage/v1" + BASE + "sim/files/");
    if (legacy === 0 && (method === "GET" || method === "HEAD")) {
      seen("GET storage (same-site file)");
      return { passthrough: location.origin + path.slice("/storage/v1".length) };
    }
    if (obj && (method === "POST" || method === "PUT")) throw refused(MSG.NO_IMPORT, "upload " + decodeURIComponent(obj[1]));
    if ((obj || /^\/storage\/v1\/object\/[^/]+\/?$/.test(path)) && method === "DELETE") {
      seen("DELETE storage object");
      return { status: 200, body: [] };            // the row's own DELETE is what changes the list
    }
    throw unsupported(`storage ${method} ${path.slice(0, 80)}`);
  }

  // ── edge functions ──
  const SENDS = new Set(["notify-comment", "notify-past", "board-report-notify", "send-push", "send-deadline-alerts",
    "send-deadline-email", "send-pdd-reminders", "send-welcome-email"]);
  const ACCOUNTS = new Set(["invite-user", "reset-user-password", "delete-user"]);
  const ACTIONS = new Set(["epdd-sync", "deliverables-extract", "webauthn", "pdd-docs-copy", "ask-test", "epdd-sync-test", "ask-v35-test"]);
  function askAnswer(body) {
    const q = String(body?.question || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
    const prepared = store?.meta?.askAnswers;
    if (prepared && typeof prepared === "object") {
      for (const [k, a] of Object.entries(prepared)) {
        if (String(k).trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "") === q && typeof a === "string") return a;
      }
    }
    return MSG.ASK;
  }
  function fn(name, body) {
    st.functions++;
    if (name === "ask") { seen("POST functions/ask"); return { status: 200, body: { answer: askAnswer(body), headline: null, used: { simulated: true } } }; }
    const blocked = (msg) => {
      cap(st.blocked, { fn: name, at: nowIso() });
      seen("POST functions/" + name + " (blocked)");
      return { status: 403, body: { ok: false, simulated: true, error: msg, message: msg } };
    };
    if (SENDS.has(name)) return blocked(MSG.NOT_SENT);
    if (ACCOUNTS.has(name)) return blocked(MSG.NO_ACCOUNTS);
    if (ACTIONS.has(name)) return blocked(MSG.NA + ": this step runs only in the real portal.");
    throw unsupported("function " + name);
  }

  // ── auth ──
  function auth(method, path, params, body) {
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
  async function handle(method, url, headers, bodyText, realFetch) {
    const path = url.pathname;
    let body = null;
    if (bodyText != null && bodyText !== "") {
      try { body = JSON.parse(bodyText); } catch { body = undefined; }
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      st.rpc++;
      const name = decodeURIComponent(path.slice("/rest/v1/rpc/".length));
      if (!Object.prototype.hasOwnProperty.call(RPC, name)) throw unsupported("rpc " + name);
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
        return restRead(table, url.searchParams, headers, method);
      }
      if (["POST", "PATCH", "DELETE", "PUT"].includes(method)) {
        if (body === undefined) throw badRequest("Empty or invalid json", "PGRST102");
        seen(`${method} ${table}`);
        return restWrite(method, table, url.searchParams, headers, body);
      }
      throw unsupported(`${method} ${table}`);
    }
    if (path.startsWith("/storage/v1/")) return storage(method, path, body, headers, realFetch);
    if (path.startsWith("/functions/v1/")) {
      const name = decodeURIComponent(path.slice("/functions/v1/".length).split("/")[0]);
      return fn(name, body);
    }
    if (path.startsWith("/auth/v1/")) return auth(method, path, url.searchParams, body);
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
    const auth = String(headers.get("authorization") || "");
    if (/^Bearer eyJ/i.test(auth) && !url.pathname.startsWith("/auth/v1/")) {
      // A real (JWT) user token never exists in this page; the anon key goes in apikey, not here.
      report({ kind: "token", method, path: url.pathname.slice(0, 120), detail: "a JWT bearer token" });
    } else if (auth && !isSimToken(auth.replace(/^Bearer\s+/i, "")) && !url.pathname.startsWith("/auth/v1/")) {
      report({ kind: "token", method, path: url.pathname.slice(0, 120), detail: "an unknown bearer token" });
    }
    try {
      const r = await handle(method, url, headers, bodyText, realFetch);
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

  // ── checkpoints ──
  const snapshot = () => ({ v: 1, tables: clone(tables) });
  const restore = (snap) => {
    if (!snap || typeof snap !== "object" || !snap.tables) throw new Error("Simulation backend: not a snapshot");
    const next = clone(snap.tables);
    for (const k of Object.keys(tables)) delete tables[k];
    Object.assign(tables, next);
    byId.clear();
  };
  const initial = snapshot();
  const stats = () => {
    const s = clone(st);
    s.unhandledCount = st.unhandled.length;
    s.refusedCount = st.refused.length;
    s.blockedCount = st.blocked.length;
    s.outsideCount = st.outside.length;
    return s;
  };
  const reset = () => { restore(initial); st = freshStats(); };
  const uninstall = () => {
    // Supabase stays answered from memory (never the real fetch), so nothing still mounted can
    // reach production after this; only the other wrappers are put back.
    if (XHR) { XHR.prototype.open = xhrOpen; XHR.prototype.send = xhrSend; }
    if (RealWS) window.WebSocket = RealWS;
    if (RealES) window.EventSource = RealES;
    installed = null;
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
