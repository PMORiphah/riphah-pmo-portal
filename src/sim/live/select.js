// PMO Simulation (live data): who and what each scene shows, chosen by rule from the snapshot.
// PUBLIC, no data. Owner: B3a. Spec: contract §E.
//
// selectPlan(tables, ctx) is pure and deterministic: it reads only the snapshot tables and ctx (never
// the real clock), breaks every tie as stated and finally by id, and returns plain JSON. Both tabs run
// it (the portal tab to build the snapshot, the simulation tab to check it), so the two must agree to
// the byte. It reads no plan-dependent table (project_raci, project_tasks, past_project_tasks): the
// story's task count comes from project_task_rollup, so the plan is the same before and after the
// plan tables are read. Where a screen computes the same thing, the code below is a port of it; the
// source is named in each section.
import { STAGE_META, DATA } from "../../theme.js";
import { fmtM, fmtP, mLabel, MONTH_NAMES, fmtDayReport, fmtStampGB, hhmmPKT, pktDateOf } from "./format.js";
import { TEXT_MASK } from "./schema.js";

export const PLAN_VERSION = 1;

// ── small helpers ────────────────────────────────────────────────────────────
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = (v) => (v == null ? "" : String(v));
/** Code-point order: the same in every browser and in Node (no locale). */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpStr = (a, b) => cmp(str(a), str(b));
const DAY_MS = 86400e3;
const isCapex = (p) => p && p.portfolio === "capex";
const isActive = (u) => u && u.is_active !== false;
const ms = (iso) => { const t = Date.parse(iso); return isFinite(t) ? t : null; };
/** Midnight PKT of a calendar date, as the Timeline's d0() reads it on a laptop in Pakistan. */
const dayMs = (iso) => (iso ? ms(String(iso).slice(0, 10) + "T00:00:00+05:00") : null);
const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows || []) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
const settingOf = (tables, key) => {
  const row = (tables.settings || []).find((s) => s && s.key === key);
  return row ? row.value : null;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const finiteOrNull = (x) => (typeof x === "number" && isFinite(x) ? x : null);

// ── names: search token and spoken alias (contract §E.7) ──────────────────────
const CAPS_TOKEN = /^[A-Z][A-Z0-9]{1,5}$/;
/** Generic English head nouns of project names (never a campus word). */
export const HEAD_NOUNS = Object.freeze(["renovation", "relocation", "restoration", "upgradation", "upgrade",
  "establishment", "construction", "extension", "installation", "refurbishment", "procurement", "purchase", "lab",
  "labs", "lifts", "kiosk", "furniture", "equipment", "office", "hostel", "building"]);
// Leading generic phrases stripped for the fallback alias: the contract's list, and any head noun
// followed by "of" ("Construction of …").
const LEADING = [/^renovation\s*&\s*upgradation\s+of\s+/i, /^procurement\s+of\s+/i, /^estb\.?\s*of\s+/i,
  /^upgrad\.?\s*of\s+/i, /^establishment\s+of\s+/i, new RegExp(`^(${HEAD_NOUNS.join("|")})\\s+of\\s+`, "i")];
const tokensOf = (s) => str(s).split(/[^A-Za-z0-9]+/).filter(Boolean);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A whole-word, case-insensitive match of `w` (group 2), without lookbehind (older Safari). */
const wordRe = (w) => new RegExp(`(^|[^A-Za-z0-9])(${escRe(w)})(?![A-Za-z0-9])`, "i");
const wordsOf = (s) => tokensOf(s).map((w) => w.toLowerCase());
const stripParens = (s) => str(s).replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

/** { alias, token } for a project: "QIE renovation"-like when the name has a distinctive token and a
 *  generic head noun, else the name without a leading generic phrase, first four words. */
export function aliasOf(project, tables) {   // eslint-disable-line no-unused-vars
  const name = stripParens(project?.name);
  const campus = str(project?.campus).trim();
  let token = tokensOf(name).find((t) => CAPS_TOKEN.test(t) && t.toLowerCase() !== campus.toLowerCase()) || null;
  if (!token && campus) {
    const m = wordRe(campus).exec(name);
    if (m) token = m[2];
  }
  const head = name.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "").toLowerCase())
    .find((w) => HEAD_NOUNS.includes(w) && (!token || w !== token.toLowerCase())) || null;
  let alias;
  if (token && head) alias = `${token} ${head}`;
  else {
    let n = name;
    for (const re of LEADING) n = n.replace(re, "");
    alias = n.split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || name;
  }
  return { alias, token };
}

/** The Projects-page search for a project (App.jsx:4635 filter): its shortest all-caps token, then its
 *  code, the first that leaves at most 3 CAPEX rows including it. */
function searchOf(p, capex) {
  const toks = tokensOf(p.name).map((t, i) => ({ t, i })).filter((x) => CAPS_TOKEN.test(x.t))
    .sort((a, b) => a.t.length - b.t.length || a.i - b.i).map((x) => x.t);
  const tries = [...new Set(toks)];
  if (p.code && p.code !== "-") tries.push(p.code);
  for (const t of tries) {
    const q = t.toLowerCase();
    const hits = capex.filter((x) => str(x.name).toLowerCase().includes(q) || (x.code != null && String(x.code).toLowerCase().includes(q)));
    if (hits.length <= 3 && hits.some((x) => x.id === p.id)) return { searchText: t, searchRows: hits.length };
  }
  return null;
}

/** A shown word of the name that proves the alias is about this project (for the figure check). */
function aliasScreenOf(alias, token, name) {
  if (token) return token;
  const nameWords = new Set(wordsOf(name));
  const shared = tokensOf(alias).filter((w) => w.length >= 3 && nameWords.has(w.toLowerCase()));
  shared.sort((a, b) => b.length - a.length);
  if (!shared.length) return alias;
  const m = wordRe(shared[0]).exec(str(name));
  return m ? m[2] : shared[0];
}
const sharesWord = (a, b) => { const B = new Set(wordsOf(b).filter((w) => w.length >= 3)); return wordsOf(a).some((w) => B.has(w)); };

// ── test accounts (contract §E.13, decision 3) ───────────────────────────────
const TEST_DOMAIN = /(^|\.)(example|test)\.(com|org|net)$/i;
/** Active profiles with no project assignment: the launcher's tick list. */
// Any active account except the PMO's may be ticked as a test account in the launcher (PMO decision 3,
// widened 19 Oct 2026: a test login can hold real assignments). Detection below stays on unassigned ones.
export function testAccountCandidatesOf(profiles, assignments) {
  return (profiles || []).filter((u) => isActive(u) && u.role !== "pmo");
}
/** Detected test accounts (ids, sorted). Run on UNMASKED profiles (the email domain counts). */
export function detectTestAccounts(profiles, assignments) {
  const assigned = new Set((assignments || []).map((a) => a.user_id));
  return testAccountCandidatesOf(profiles, assignments)
    .filter((u) => !assigned.has(u.id))
    .filter((u) => TEST_DOMAIN.test(str(u.email).split("@")[1] || "") || /test/i.test(str(u.username)) || /test/i.test(str(u.full_name)))
    .map((u) => u.id).sort(cmpStr);
}

// ── the sections ─────────────────────────────────────────────────────────────
function asOfOf(tables, now) {
  const fy = settingOf(tables, "fiscal_year");
  return {
    takenAt: now, pktDate: pktDateOf(now), utcDate: new Date(now).toISOString().slice(0, 10), hhmm: hhmmPKT(now),
    dateText: fmtStampGB(now),
    fyLabel: typeof fy === "string" ? fy : null,
  };
}

// App.jsx:3449-3530 (hero), 3302 (kv)
function dashboardOf(pd, kpis) {
  const capexCount = num(pd.total_projects), progN = num(pd.reporting_progress_count);
  return {
    capexTotal: num(pd.total_capex), capexCount, dfTotal: num(pd.df_recommended_total),
    dfLive: !(kpis.df_recommended?.value), progN,
    progClause: progN === 0 ? "await" : progN * 2 >= capexCount ? "none" : "caveat",
  };
}

// InvestmentsTab.jsx:93-103
function investmentsOf(im) {
  const rel = num(im.released_total), appr = num(im.approved_total);
  return { invN: num(im.total_projects), invFull: rel > 0 && rel === appr };
}

const STAGE_KEYS = ["in_df", "in_ed", "in_mt"];   // later stage wins a tie
function pddOf(pd) {
  let reviewer = null, reviewerN = 0;
  for (const k of STAGE_KEYS) { const n = num(pd[k]); if (n > 0 && n >= reviewerN) { reviewer = k; reviewerN = n; } }
  return { notSubmitted: num(pd.pdd_not_submitted_count), reviewer, reviewerN };
}

// App.jsx:3638-3642 (Budget Released / Payments Made cards)
function paymentsOf(pd, kpis, capex) {
  const released = num(pd.budget_consumed);
  const typedSub = kpis.budget_released?.sub;
  let relPctText = null;
  if (!(typedSub != null && typedSub !== "")) {
    const x = (pd.budget_consumed / pd.total_capex) * 100;
    relPctText = isFinite(x) ? fmtP(x) : null;
  }
  const paidProjects = capex.filter((p) => num(p.payments_made) > 0).length;
  const variant = released <= 0 ? "nothing" : paidProjects === 0 ? "none" : paidProjects === 1 ? "one" : paidProjects <= 3 ? "few" : "paid";
  return { released, relPctText, relPct: relPctText == null ? null : finiteOrNull(parseFloat(relPctText)),
    paidProjects, paidTotal: num(pd.payments_made_total), variant };
}

// Cashflows.jsx:203-216, 282 (monthly totals, peak)
function cashflowOf(rows, pktDate) {
  const m = new Map();
  for (const r of rows || []) {
    if (r.bucket !== "capex" && r.bucket !== "pmdc") continue;
    m.set(r.month, (m.get(r.month) || 0) + (Number(r.amount) || 0));
  }
  const months = [...m.keys()].filter((k) => typeof k === "string").sort();
  let peak = null;
  for (const k of months) if (!peak || m.get(k) > peak.total) peak = { month: k, total: m.get(k) };
  if (!peak) return { hasRows: false, peakMonth: null, peakLabel: null, monthName: null, peakTotal: null, peaked: false };
  return {
    hasRows: true, peakMonth: peak.month, peakLabel: mLabel(peak.month),
    monthName: MONTH_NAMES[Number(peak.month.slice(5, 7)) - 1] || null, peakTotal: peak.total,
    peaked: peak.month.slice(0, 7) < pktDate.slice(0, 7),
  };
}

const PDD_DOC = /^(E?PDD)|charter/i;
/** Documents tab order (App.jsx:6821: order=sort_order.asc,uploaded_at.desc; Postgres puts nulls
 *  last ascending and first descending). */
const byDocOrder = (a, b) => {
  const sa = a.sort_order == null ? Infinity : num(a.sort_order), sb = b.sort_order == null ? Infinity : num(b.sort_order);
  if (sa !== sb) return sa < sb ? -1 : 1;
  const ua = ms(a.uploaded_at), ub = ms(b.uploaded_at);
  if (ua !== ub) { if (ua == null) return -1; if (ub == null) return 1; return ub - ua; }
  return cmpStr(a.id, b.id);
};

function storyPool(tables, ctx, pktDate) {
  const projects = tables.projects || [];
  const capex = projects.filter(isCapex);
  const metrics = new Map((tables.project_metrics || []).map((m) => [m.id, m]));
  const docs = groupBy((tables.project_attachments || []).filter((a) => a.kind === "document"), "project_id");
  const docsOf = (id) => [...(docs.get(id) || [])].sort(byDocOrder);
  const progress = [], closed = [];
  for (const p of capex) {
    const d = docsOf(p.id);
    if (!d.length) continue;
    const s = searchOf(p, capex);
    if (!s) continue;
    const met = metrics.get(p.id);
    const hasPdd = d.some((x) => PDD_DOC.test(str(x.file_name)));
    if (p.workflow_stage === "approved" && num(p.amount_released) > 0 && num(p.pct_complete) > 0
      && p.end_date && str(p.end_date) >= pktDate && met?.schedule_flag === "on_time" && met?.budget_flag !== "over") {
      progress.push({ p, d, s, hasPdd, kind: "progress" });
    } else if (p.workflow_stage === "closed") {
      closed.push({ p, d, s, hasPdd, kind: "closed" });
    }
  }
  progress.sort((a, b) => (b.hasPdd - a.hasPdd) || (num(b.p.pct_complete) - num(a.p.pct_complete))
    || (num(b.p.amount_released) - num(a.p.amount_released)) || cmpStr(a.p.code, b.p.code) || cmpStr(a.p.id, b.p.id));
  closed.sort((a, b) => cmpStr(b.p.actual_end_date, a.p.actual_end_date) || cmpStr(a.p.id, b.p.id));
  return { progress, closed, capex };
}

function storyOf(tables, ctx, pktDate, rejected) {
  const { progress, closed, capex } = storyPool(tables, ctx, pktDate);
  const ov = ctx.overrides || {};
  let pick = null;
  if (ov.storyId != null) {
    pick = [...progress, ...closed].find((c) => c.p.id === ov.storyId) || null;
    if (!pick) rejected.push("storyId");
  }
  if (!pick) pick = progress[0] || closed[0] || null;
  if (!pick) return null;
  const { p, d, s, hasPdd, kind } = pick;
  const met = (tables.project_metrics || []).find((m) => m.id === p.id) || {};
  let { alias, token } = aliasOf(p, tables);
  if (ov.storyAlias != null) {
    const a = str(ov.storyAlias).replace(/\s+/g, " ").trim();
    if (a && sharesWord(a, p.name)) alias = a; else rejected.push("storyAlias");
  }
  const released = num(p.amount_released), bac = num(p.bac);
  const roll = (tables.project_task_rollup || []).find((r) => r.project_id === p.id);
  const withTasks = capex.filter((x) => (tables.project_task_rollup || []).some((r) => r.project_id === x.id && num(r.task_count) >= 1)).length;
  const pmRow = (tables.project_assignments || []).find((a) => a.project_id === p.id);
  const pddDoc = d.find((x) => PDD_DOC.test(str(x.file_name)));
  return {
    id: p.id, code: p.code ?? null, name: str(p.name), campus: p.campus ?? null, campusId: p.campus_id ?? null, kind,
    pmId: pmRow ? pmRow.user_id : null,
    searchText: s.searchText, searchRows: s.searchRows,
    alias, token, tag: token || alias, aliasScreen: aliasScreenOf(alias, token, p.name),
    docCount: d.length, hasPddDoc: hasPdd, pddFile: pddDoc ? pddDoc.file_name : null,
    released, bac,
    releasedState: released <= 0 ? "none" : bac > 0 && released >= bac ? "full" : "partly",
    pct: num(p.pct_complete), stage: p.workflow_stage ?? null,
    endDate: p.end_date ?? null, endPassed: !!p.end_date && str(p.end_date) < pktDate,
    onTime: met.schedule_flag === "on_time",
    tasks: roll ? num(roll.task_count) : 0,
    wbsWide: capex.length > 0 && withTasks / capex.length >= 0.10,
  };
}

// Timeline.jsx:57-112 (scheduled rows), 225-227 (bar colour); theme.js STAGE_META
function timelineOf(tables, story, now) {
  const roll = new Map((tables.project_task_rollup || []).map((r) => [r.project_id, r]));
  let scheduled = 0, anyLate = false, anyPdd = false;
  const pddRed = STAGE_META.pdd_not_submitted?.color === DATA.danger;
  for (const r of (tables.projects || []).filter(isCapex)) {
    const pa = dayMs(r.start_date), pb = dayMs(r.end_date);
    const rr = roll.get(r.id);
    const ta = dayMs(rr?.tasks_start), tb = dayMs(rr?.tasks_end);
    const hasTasks = ta != null && tb != null && tb >= ta;
    const a = hasTasks ? ta : pa, b = hasTasks ? tb : pb;
    if (!(a != null && b != null && b >= a)) continue;
    scheduled++;
    if (b < now && r.workflow_stage !== "closed") anyLate = true;
    if (r.workflow_stage === "pdd_not_submitted" && pddRed) anyPdd = true;
  }
  return { campus: story?.campus ?? null, anyLate, anyPdd, scheduled };
}

// App.jsx:6473 (rows), 6500-6507 (filters)
function performanceOf(tables, story) {
  const rows = (tables.project_metrics || []).filter((r) => r.workflow_stage === "approved" || r.workflow_stage === "closed");
  const delayedRows = rows.filter((r) => r.schedule_flag === "delayed");
  const delayed = delayedRows.length, delayedNoPct = delayedRows.filter((r) => !(num(r.pct_complete) > 0)).length;
  const variant = delayed === 0 ? "none" : delayedNoPct === delayed ? "all" : delayedNoPct * 2 > delayed ? "most" : "count";
  const srow = story ? rows.find((r) => r.id === story.id) : null;
  return { rowsShown: rows.length, delayed, delayedNoPct, withPct: rows.filter((r) => num(r.pct_complete) > 0).length,
    variant, storyShown: !!srow, storyOnTime: !!srow && srow.schedule_flag === "on_time" };
}

// RiskRegister.jsx:441-450 (counts), MatrixCell / RiskMatrix (cells: closed risks are not counted)
const LEVELS = ["high", "medium", "low"];
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const severityOf = (prob, impact) => {
  if (prob === "high" && impact === "high") return "critical";
  if ((prob === "high" && impact === "medium") || (prob === "medium" && impact === "high")) return "high";
  if (prob === "low" && impact === "low") return "low";
  return "medium";
};
function riskCellRows(tables, cell) {
  return (tables.project_risks_scored || []).filter((r) => `${r.probability}-${r.impact}` === cell);
}
function risksOf(tables, ctx, rejected) {
  const rows = tables.project_risks_scored || [];
  const total = rows.length;
  const open = rows.filter((r) => r.status !== "closed" && r.status !== "mitigated").length;
  const critical = rows.filter((r) => r.severity === "critical" && r.status !== "closed").length;
  const cells = [];
  for (const prob of LEVELS) for (const impact of LEVELS) {
    const inCell = rows.filter((r) => r.probability === prob && r.impact === impact);
    const shown = inCell.filter((r) => r.status !== "closed").length;
    if (shown > 0) cells.push({ cell: `${prob}-${impact}`, prob, impact, n: inCell.length, shown, sev: SEV_RANK[severityOf(prob, impact)] });
  }
  const IDX = { high: 3, medium: 2, low: 1 };
  cells.sort((a, b) => (b.n - a.n) || (b.sev - a.sev) || (IDX[b.prob] - IDX[a.prob]) || (IDX[b.impact] - IDX[a.impact]));
  const chosen = critical >= 1 ? (cells.find((c) => c.cell === "high-high") || cells[0]) : cells[0];
  if (!chosen) return { total, open, critical, cell: null, cellN: 0, cellShown: 0, prob: null, impact: null, rowId: null };
  const inCell = riskCellRows(tables, chosen.cell);
  const projects = new Map((tables.projects || []).map((p) => [p.id, p]));
  const titleCount = new Map();
  for (const r of rows) titleCount.set(str(r.title).trim(), (titleCount.get(str(r.title).trim()) || 0) + 1);
  const good = inCell.find((r) => { const p = projects.get(r.project_id);
    return isCapex(p) && p.workflow_stage !== "closed" && r.status !== "closed" && titleCount.get(str(r.title).trim()) === 1; });
  let rowId = (good || inCell[0] || {}).id ?? null;
  const ov = ctx.overrides || {};
  if (ov.riskRowId != null) {
    if (inCell.slice(0, 6).some((r) => r.id === ov.riskRowId)) rowId = ov.riskRowId; else rejected.push("riskRowId");
  }
  return { total, open, critical, cell: chosen.cell, cellN: chosen.n, cellShown: chosen.shown, prob: chosen.prob, impact: chosen.impact, rowId };
}

const NO_CAMPUS = "No campus";            // CampusCompare's label for projects without one
// CampusCompare.jsx:57-110 (buildCampuses), 236-247 (head-to-head metrics), 324-331 (default picks)
function campusRowsOf(tables) {
  const assigned = new Set((tables.project_assignments || []).map((a) => a.project_id));
  const by = new Map();
  for (const p of (tables.projects || []).filter(isCapex)) {
    const c = p.campus || NO_CAMPUS;
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(p);
  }
  return [...by.entries()].map(([campus, list]) => {
    const appr = list.filter((p) => p.workflow_stage === "approved" || p.workflow_stage === "closed");
    const df = list.reduce((s, p) => s + num(p.df_recommended_amount), 0);
    const released = list.reduce((s, p) => s + num(p.amount_released), 0);
    return {
      campus, projects: list.length, df, approved: appr.length, bac: appr.reduce((s, p) => s + num(p.bac), 0),
      released, releasedRate: df ? released / df : 0,
      pddNot: list.filter((p) => (p.workflow_stage || "pdd_not_submitted") === "pdd_not_submitted").length,
      noPm: list.filter((p) => !assigned.has(p.id)).length,
      noPmOpen: list.filter((p) => !assigned.has(p.id) && p.workflow_stage !== "closed").length,
    };
  });
}

function compareOf(rows) {
  const named = rows.filter((r) => r.campus !== NO_CAMPUS);
  const defaults = [...rows].sort((a, b) => b.df - a.df).slice(0, 2).map((r) => r.campus);
  const trio = [...named].sort((a, b) => (b.projects - a.projects) || (b.df - a.df) || cmpStr(a.campus, b.campus))
    .slice(0, 3).map((r) => r.campus);
  const tickOps = [], columns = [];
  for (const c of defaults) { if (trio.includes(c)) columns.push(c); else tickOps.push({ op: "untick", campus: c }); }
  for (const c of trio) if (!defaults.includes(c)) { tickOps.push({ op: "tick", campus: c }); columns.push(c); }
  const sel = columns.map((c) => rows.find((r) => r.campus === c)).filter(Boolean);
  const top = (f) => sel.reduce((best, r) => (best == null || f(r) > f(best) ? r : best), null);
  const A = top((r) => r.bac), R = top((r) => r.released), S = top((r) => r.releasedRate);
  const low = sel.reduce((best, r) => (best == null || r.releasedRate < best.releasedRate ? r : best), null);
  const med = median(sel.map((r) => r.releasedRate));
  const T = low && sel.length >= 2 && low.releasedRate < 0.5 * med && low !== A ? low : null;
  const sameTop = (f) => { const v = sel.map(f).sort((a, b) => b - a); return v.length >= 2 && fmtM(v[0]) === fmtM(v[1]); };
  const tie = sel.length < 2 || sameTop((r) => r.bac) || sameTop((r) => r.released);
  const leaderVariant = tie ? "tie" : A === R && T ? "AR_T" : A === R && !T && S !== A ? "AR_S" : A === R && S === A ? "ARS" : "A_R";
  return {
    campusCount: rows.length, defaults, trio, tickOps, columns,
    leaders: { A: A?.campus ?? null, R: R?.campus ?? null, S: S?.campus ?? null, T: T?.campus ?? null },
    tie, leaderVariant,
    trailer: T ? { campus: T.campus, releasedRate: T.releasedRate, pddNot: T.pddNot, projects: T.projects } : null,
    rows: sel.map((r) => ({ campus: r.campus, projects: r.projects, df: r.df, approved: r.approved, bac: r.bac,
      released: r.released, releasedRate: r.releasedRate, pddNot: r.pddNot, noPm: r.noPm, noPmOpen: r.noPmOpen })),
  };
}

// App.jsx:5512-5535 (bulk-assign preview: scope all, leave assigned alone, skip closed, no PM chosen)
function assignOf(tables, rows, compare) {
  const byCampus = new Map(rows.map((r) => [r.campus, r]));
  let campus = null, variant = "none";
  let best = null;
  for (const c of compare.columns) {
    const r = byCampus.get(c);
    if (r && c !== NO_CAMPUS && r.noPmOpen > 0 && (!best || r.noPmOpen > best.noPmOpen)) best = r;
  }
  if (best) { campus = best.campus; variant = "trio"; }
  else {
    const any = rows.filter((r) => r.campus !== NO_CAMPUS && r.noPmOpen > 0)
      .sort((a, b) => (b.noPmOpen - a.noPmOpen) || (b.projects - a.projects) || cmpStr(a.campus, b.campus))[0];
    if (any) { campus = any.campus; variant = "other"; } else campus = compare.columns.find((c) => c !== NO_CAMPUS) ?? null;
  }
  const assigned = new Set((tables.project_assignments || []).map((a) => a.project_id));
  const list = (tables.projects || []).filter((p) => isCapex(p) && campus != null && p.campus === campus);
  const open = list.filter((p) => p.workflow_stage !== "closed");
  return { campus, variant, total: list.length, skippedClosed: list.length - open.length,
    toAssign: open.filter((p) => !assigned.has(p.id)).length, leftAlone: open.filter((p) => assigned.has(p.id)).length };
}

// App.jsx:8259 (table order = display order), 8400 (header), 8476-8483 (Assigned Projects)
function usersOf(tables, ctx, compare, rejected) {
  const profiles = tables.user_profiles || [];
  const assigns = tables.project_assignments || [];
  const assignedUsers = new Set(assigns.map((a) => a.user_id));
  const confirmed = new Set(Array.isArray(ctx.testAccounts) ? ctx.testAccounts
    : detectTestAccounts(profiles, assigns));
  const testIds = profiles.filter((u) => confirmed.has(u.id) && isActive(u) && u.role !== "pmo").map((u) => u.id).sort(cmpStr);
  const testSet = new Set(testIds);
  const projects = new Map((tables.projects || []).map((p) => [p.id, p]));
  const trailer = compare.trailer?.campus ?? null;
  const countOf = new Map();
  for (const a of assigns) countOf.set(a.user_id, (countOf.get(a.user_id) || 0) + 1);
  const eligible = profiles.map((u, i) => ({ u, i })).filter(({ u, i }) => {
    if (u.role !== "project_manager" || !isActive(u) || testSet.has(u.id) || !(countOf.get(u.id) > 0) || !str(u.full_name).trim()) return false;
    if (trailer != null && assigns.some((a) => a.user_id === u.id && projects.get(a.project_id)?.campus === trailer)) return false;
    const prev = profiles[i - 1], next = profiles[i + 1];
    if ((prev && testSet.has(prev.id)) || (next && testSet.has(next.id))) return false;
    return true;
  }).map(({ u }) => u)
    .sort((a, b) => (countOf.get(b.id) - countOf.get(a.id)) || cmpStr(a.username, b.username) || cmpStr(a.id, b.id));
  let row = eligible[0] || null;
  const ov = ctx.overrides || {};
  if (ov.usersUserId != null) {
    const o = eligible.find((u) => u.id === ov.usersUserId);
    if (o) row = o; else rejected.push("usersUserId");
  }
  return {
    count: profiles.length, testIds, testClause: testIds.length >= 2 ? "some" : testIds.length === 1 ? "one" : "none",
    row: row ? { userId: row.id, username: row.username ?? null, fullName: str(row.full_name).trim(), assigned: countOf.get(row.id) || 0 } : null,
    _eligible: eligible,
  };
}

const newestFirst = (a, b) => cmpStr(b.created_at, a.created_at) || cmpStr(b.id, a.id);

function updatesPool(tables) {
  const threads = [];
  for (const [projectId, list] of groupBy(tables.comments || [], "project_id")) {
    if (projectId == null) continue;
    const latest = [...list].sort(newestFirst)[0];
    threads.push({ projectId, latest, count: list.length });
  }
  threads.sort((a, b) => newestFirst(a.latest, b.latest) || cmpStr(a.projectId, b.projectId));
  return { all: threads, pm: threads.filter((t) => t.latest.author_role === "project_manager") };
}
function updatesOf(tables, ctx, rejected) {
  const { all, pm } = updatesPool(tables);
  const ov = ctx.overrides || {};
  let t = null;
  if (ov.updatesProjectId != null) { t = pm.find((x) => x.projectId === ov.updatesProjectId) || null; if (!t) rejected.push("updatesProjectId"); }
  if (!t) t = pm[0] || null;
  const variant = t ? "pm" : all.length ? "newest" : "none";
  const proj = t ? (tables.projects || []).find((p) => p.id === t.projectId) : null;
  return { projectId: t ? t.projectId : null, code: proj?.code ?? null, lastCommentId: t ? t.latest.id : null,
    count: t ? t.count : 0, threads: all.length, variant };
}

// PastProjects.jsx:210 (progressOf), 1494-1528 (list filter, cards)
const progressLabel = (r) => {
  const t = str(r.reason_open).trim();
  if (/^no progress$/i.test(t)) return "No progress";
  if (/^in progress$/i.test(t)) return "In Progress";
  return t ? "Note" : "Not stated";
};
// A thread the scene may centre and light (storyboard M1: no third party, no informal letter on
// the projector): its newest message is the manager's own short note, not a forwarded email or a
// letter, and no message in it carried an email address or a phone number (snapshot.js has
// replaced those with TEXT_MASK). A message whose text is not in the data (the simulation tab keeps
// only the plan's thread) does not qualify, so both tabs choose the same thread.
export const PAST_NOTE_MAX = 400;
const LETTER_RE = /\bdear\b|\bregards\b|^\s*(from|sent|to|subject):/im;
function threadFit(list) {
  const b = list[0]?.body;
  if (typeof b !== "string" || !b.trim() || b.length > PAST_NOTE_MAX || LETTER_RE.test(b)) return false;
  return !list.some((m) => typeof m.body === "string" && (m.body.includes(TEXT_MASK.email) || m.body.includes(TEXT_MASK.phone)));
}
function pastPool(tables, now) {
  const rows = tables.past_project_summary || [];
  const msgs = groupBy(tables.past_project_updates || [], "past_project_id");
  const out = [];
  for (const r of rows) {
    if (r.status === "closed") continue;
    const approved = num(r.approved_amount), released = num(r.released_amount);
    if (!(approved > 0) || released !== approved) continue;
    const list = [...(msgs.get(r.id) || [])].sort(newestFirst);
    if (list.length < 3) continue;
    const newest = list[0], t = ms(newest.created_at);
    if (!r.pm_user_id || newest.author_id !== r.pm_user_id || t == null || now - t > 30 * DAY_MS) continue;
    if (!threadFit(list)) continue;
    out.push({ r, list, newest });
  }
  out.sort((a, b) => (b.list.length - a.list.length) || newestFirst(a.newest, b.newest) || cmpStr(a.r.code, b.r.code) || cmpStr(a.r.id, b.r.id));
  return out;
}
/** The Past Projects search for a project (PastProjects.jsx list filter): the shortest of its name's
 *  all-caps tokens (3-6 characters) and words of 4 or more letters that finds this row alone (ties:
 *  first in the name), else its code. Short text is typed in a fraction of a second. */
function pastSearchOf(r, rows) {
  const hay = rows.map((x) => `${x.code || ""} ${x.name || ""} ${x.reason_open || ""} ${x.campus || ""} ${x.pm_name || ""}`.toLowerCase());
  const caps = tokensOf(r.name).filter((t) => /^[A-Z][A-Z0-9]{2,5}$/.test(t));
  const words = str(r.name).split(/\s+/).map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")).filter((w) => /^[A-Za-z]{4,}$/.test(w));
  const tries = [...new Set([...caps, ...words])].map((t, i) => ({ t, i, at: str(r.name).indexOf(t) }))
    .sort((a, b) => a.t.length - b.t.length || a.at - b.at || a.i - b.i).map((x) => x.t);
  for (const w of tries) {
    const q = w.toLowerCase();
    if (hay.filter((h) => h.includes(q)).length === 1) return w;
  }
  return r.code || null;
}
function pastOf(tables, ctx, now, rejected) {
  const rows = tables.past_project_summary || [];
  const open = rows.filter((r) => r.status !== "closed");
  const noProgress = open.filter((r) => progressLabel(r) === "No progress").length;
  const pool = pastPool(tables, now);
  const ov = ctx.overrides || {};
  let c = null;
  if (ov.pastId != null) { c = pool.find((x) => x.r.id === ov.pastId) || null; if (!c) rejected.push("pastId"); }
  if (!c) c = pool[0] || null;
  return {
    open: open.length, noProgress,
    id: c ? c.r.id : null, code: c ? c.r.code ?? null : null, messages: c ? c.list.length : 0,
    lastMessageId: c ? c.newest.id : null, searchText: c ? pastSearchOf(c.r, rows) : null,
    variant: c ? "thread" : "nothread",
  };
}

// PhotoWall.jsx:76-83 (rows: site visits with a project, newest first), 118 (campus filter)
const byGalleryOrder = (a, b) => cmpStr(b.uploaded_at, a.uploaded_at) || cmpStr(a.id, b.id);
function galleryPool(tables) {
  const projects = new Map((tables.projects || []).map((p) => [p.id, p]));
  const rows = (tables.project_attachments || []).filter((a) => a.kind === "site_visit" && projects.has(a.project_id)).sort(byGalleryOrder);
  const by = groupBy(rows, "project_id");
  const subjects = [...by.entries()].filter(([id]) => isCapex(projects.get(id))).map(([id, list]) => ({
    id, n: list.length, real: list.filter((x) => !/^screenshot/i.test(str(x.file_name))).length,
    newest: list.reduce((m, x) => (str(x.uploaded_at) > m ? str(x.uploaded_at) : m), ""),
  })).sort((a, b) => (b.n - a.n) || (b.real - a.real) || cmpStr(b.newest, a.newest) || cmpStr(a.id, b.id));
  return { rows, subjects, projects };
}
const isImage = (a) => /^image\//i.test(str(a.mime_type));
const isVideo = (a) => /^video\//i.test(str(a.mime_type));
function galleryOf(tables, ctx, rejected) {
  const { rows, subjects, projects } = galleryPool(tables);
  const leftOut = num(ctx.leftOut), failed = num(ctx.failed);
  const base = { total: rows.length, photos: rows.filter((a) => !isVideo(a)).length, videos: rows.filter(isVideo).length,
    leftOut, failed, projectId: null, code: null, campus: null, filteredCount: 0, onlyProject: false, alias: null, aliasScreen: null, firstPhotoId: null };
  if (!rows.length) return { ...base, variant: leftOut + failed > 0 ? "leftout" : "empty" };
  const ov = ctx.overrides || {};
  let s = null;
  if (ov.galleryProjectId != null) { s = subjects.find((x) => x.id === ov.galleryProjectId) || null; if (!s) rejected.push("galleryProjectId"); }
  if (!s) s = subjects[0] || null;
  const subject = s ? projects.get(s.id) : null;
  if (!subject || subject.campus == null) {
    return { ...base, variant: "all", firstPhotoId: (rows.find(isImage) || {}).id ?? null };
  }
  const filtered = rows.filter((a) => projects.get(a.project_id)?.campus === subject.campus);
  const onlyProject = filtered.every((a) => a.project_id === subject.id);
  const { alias, token } = aliasOf(subject, tables);
  return { ...base, projectId: subject.id, code: subject.code ?? null, campus: subject.campus, filteredCount: filtered.length,
    onlyProject, alias, aliasScreen: aliasScreenOf(alias, token, subject.name),
    firstPhotoId: (filtered.find(isImage) || {}).id ?? null, variant: onlyProject ? "subject" : "campus" };
}

// BoardReport.jsx:565 (list), 611-627 (rows), 169-176 (Needs attention); reportCalc.js:314 (fmtDay)
function reportPool(tables) {
  const all = (tables.board_reports || []).filter((r) => r.status !== "discarded");
  const monthly = all.filter((r) => r.kind === "monthly");
  const published = monthly.filter((r) => r.status === "published")
    .sort((a, b) => cmpStr(b.period, a.period) || cmpStr(b.published_at, a.published_at) || cmpStr(a.id, b.id));
  const drafts = monthly.filter((r) => r.status === "draft")
    .sort((a, b) => cmpStr(b.period, a.period) || cmpStr(b.created_at, a.created_at) || cmpStr(a.id, b.id));
  return { all, monthly, ordered: [...published, ...drafts] };
}
/** The headline tiles scene 18 would light, against today's dashboard, as printed: [{ tile, report, live }]
 *  for every tile that differs (a draft's figures are frozen at its as-at time). */
function reportDiffOf(r, pd) {
  const h = r?.figures && typeof r.figures === "object" ? r.figures.headline : null;
  if (!h || typeof h !== "object" || !pd || pd.total_capex == null) return [];
  const capexPct = (rel, df) => (num(df) ? (num(rel) / num(df) * 100).toFixed(1) + "%" : "0.0%");
  const pairs = [
    ["Total CAPEX", `${fmtM(h.df_total)} · ${num(h.capex_count)} projects`, `${fmtM(pd.total_capex)} · ${num(pd.total_projects)} projects`],
    ["Approved", fmtM(h.approved_bac), fmtM(pd.approved_total)],
    ["Released", `${fmtM(h.released_total)} · ${capexPct(h.released_total, h.df_total)}`, `${fmtM(pd.budget_consumed)} · ${capexPct(pd.budget_consumed, pd.total_capex)}`],
  ];
  return pairs.filter(([, a, b]) => a !== b).map(([tile, report, live]) => ({ tile, report, live }));
}
function reportOf(tables, ctx, rejected) {
  const { all, monthly, ordered } = reportPool(tables);
  const ov = ctx.overrides || {};
  let r = null;
  if (ov.reportId != null) { r = ordered.find((x) => x.id === ov.reportId) || null; if (!r) rejected.push("reportId"); }
  if (!r) r = ordered[0] || null;
  if (!r) return { id: null, kind: null, month: null, year: null, asAtText: null, attentionNone: false, kicker: null,
    variant: all.some((x) => x.kind === "reconstructed") ? "baselines" : "none", monthly: monthly.length };
  const kind = r.status === "published" ? "published" : "draft";
  const p = str(r.period);
  const month = MONTH_NAMES[Number(p.slice(5, 7)) - 1] || null, year = Number(p.slice(0, 4)) || null;
  const att = r.figures && typeof r.figures === "object" ? r.figures.attention : null;
  const attentionNone = !!att && ["approved_nothing_released", "released_before_approval", "without_pm"]
    .every((k) => Array.isArray(att[k]) && att[k].length === 0);
  const asAtText = fmtDayReport(r.as_at);
  // Stale: a lit tile would print another figure than the screens before it (one figure per run).
  const diff = reportDiffOf(r, (tables.portfolio_dashboard || [])[0]);
  return { id: r.id, kind, month, year, asAtText, attentionNone, kicker: `${month} ${year} · ${kind} · figures as at ${asAtText}`,
    variant: kind === "published" ? "published" : attentionNone ? "nothing" : "draft", monthly: monthly.length,
    stale: diff.length > 0, staleTiles: diff };
}

// Typed card texts with figures that may be out of date (shown on the Begin screen).
const TYPED_SKIP = new Set(["su_requested", "budget_reduction", "carry_forward"]);
const FIGURE_RE = /\d+(\.\d+)?\s*%|\b\d+\s+of\s+\d+\b/;
function typedTextsOf(kpis) {
  const out = [];
  for (const key of Object.keys(kpis).sort()) {
    const k = kpis[key];
    if (!k || typeof k !== "object" || TYPED_SKIP.has(key)) continue;
    if (k.value != null && k.value !== "") continue;
    for (const field of ["sub", "insight"]) {
      const t = k[field];
      if (typeof t === "string" && FIGURE_RE.test(t)) out.push({ key, field, text: t });
    }
  }
  return out;
}

// ── the plan ─────────────────────────────────────────────────────────────────
/**
 * The scene subjects and figures for this snapshot (contract §E.20).
 * ctx = { now (= takenAt, ms), me (PMO id), testAccounts (confirmed ids), overrides, leftOut, failed }
 */
export function selectPlan(tables, ctx = {}) {
  tables = tables || {};
  const now = Number(ctx.now);
  if (!isFinite(now)) throw new Error("selectPlan: ctx.now is required");
  const rejected = [];
  const asOf = asOfOf(tables, now);
  const pd = (tables.portfolio_dashboard || [])[0] || {};
  const im = (tables.investment_metrics || [])[0] || {};
  const kpisRaw = settingOf(tables, "dashboard_kpis");
  const kpis = kpisRaw && typeof kpisRaw === "object" ? kpisRaw : {};
  const capex = (tables.projects || []).filter(isCapex);

  const story = storyOf(tables, ctx, asOf.pktDate, rejected);
  const campusRows = campusRowsOf(tables);
  const compare = compareOf(campusRows);
  const users = usersOf(tables, ctx, compare, rejected);
  delete users._eligible;

  return {
    v: PLAN_VERSION,
    asOf,
    dashboard: dashboardOf(pd, kpis),
    investments: investmentsOf(im),
    pdd: pddOf(pd),
    payments: paymentsOf(pd, kpis, capex),
    cashflow: cashflowOf(tables.project_cashflows, asOf.pktDate),
    story,
    timeline: timelineOf(tables, story, now),
    performance: performanceOf(tables, story),
    risks: risksOf(tables, ctx, rejected),
    compare,
    assign: assignOf(tables, campusRows, compare),
    users,
    updates: updatesOf(tables, ctx, rejected),
    past: pastOf(tables, ctx, now, rejected),
    gallery: galleryOf(tables, ctx, rejected),
    report: reportOf(tables, ctx, rejected),
    flags: { typedTexts: typedTextsOf(kpis), overrideRejected: [...new Set(rejected)].sort() },
  };
}

/**
 * The launcher's Change lists (contract §E): every subject a rule allows, in rule order.
 * Labels are runtime data for the launcher only.
 */
export function candidatesOf(tables, ctx = {}) {
  tables = tables || {};
  const now = Number(ctx.now);
  const pktDate = pktDateOf(isFinite(now) ? now : 0);
  const { progress, closed } = storyPool(tables, ctx, pktDate);
  const label = (p) => [p.code, p.name].filter((x) => x && x !== "-").join(" · ");
  const projects = new Map((tables.projects || []).map((p) => [p.id, p]));
  const plan = selectPlan(tables, { ...ctx, overrides: {} });
  const rows = plan.risks.cell ? riskCellRows(tables, plan.risks.cell).slice(0, 6) : [];
  const usersPick = usersOf(tables, { ...ctx, overrides: {} }, plan.compare, [])._eligible;
  const { subjects } = galleryPool(tables);
  return {
    story: [...progress, ...closed].map((c) => ({ id: c.p.id, label: label(c.p) + (c.kind === "closed" ? " (closed)" : "") })),
    updates: updatesPool(tables).pm.map((t) => ({ id: t.projectId, label: label(projects.get(t.projectId) || {}) || t.projectId })),
    past: pastPool(tables, isFinite(now) ? now : 0).map((c) => ({ id: c.r.id, label: label(c.r) })),
    report: reportPool(tables).ordered.map((r) => ({ id: r.id, label: `${r.title || r.period} · ${r.status}` })),
    riskRow: rows.map((r) => ({ id: r.id, label: [r.title, r.project_code].filter(Boolean).join(" · ") })),
    usersRow: usersPick.map((u) => ({ id: u.id, label: `${str(u.full_name).trim()} (${u.username})` })),
    gallery: subjects.map((s) => ({ id: s.id, label: `${label(projects.get(s.id) || {})} · ${s.n} items` })),
  };
}
