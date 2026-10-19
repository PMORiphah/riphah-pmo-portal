// PMO Simulation (live data): the snapshot reader, run in the PMO's signed-in portal tab.
// Owner: B1. Spec: contract §B.2, §D.1. PUBLIC, pure apart from the injected `get` and `media`;
// no data, no names. Also runs in Node (scripts/sim/live/snapshot.test.mjs) over a private fixture.
//
// readSnapshot() reads the allow-listed tables (schema.js) through an injected GET, masks contact
// details (profile columns, and email addresses and phone numbers inside free text), drops every column the allow-list does not name, works out the deliverables RPC answer
// locally, removes the site-visit items the PMO left out (or that could not be prepared), chooses
// the scenes' subjects (select.js), records the toured screens' responses (requests.js), trims
// message bodies and report figures to the plan's own rows, checks the invariants, fingerprints
// the result and validates it exactly as the simulation tab will. Nothing here writes anywhere:
// `get` is GET /rest/v1/... only, and the module never calls an RPC.
import { TABLES, MASK, CAPS, columnsOf, tablePath, scrubContacts, isTextColumn } from "./schema.js";
import { TEMPLATES, keyOf, fill } from "./requests.js";
import { selectPlan, candidatesOf, detectTestAccounts, testAccountCandidatesOf } from "./select.js";
import { invariants as invariantsOf, validateSnapshot } from "./validate.js";
import { canon, fingerprintOf } from "./canon.js";

export const TZ = "Asia/Karachi";
const MEDIA_MIMES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];
const SHA_RE = /^[0-9a-f]{64}$/;
const PLAN_TABLES = Object.keys(TABLES).filter((t) => TABLES[t].plan);
const BASE_TABLES = Object.keys(TABLES).filter((t) => !TABLES[t].plan);

const MESSAGES = {
  read: (d) => `Could not read ${d} from the portal. Check the connection and press Start again.`,
  invariant: (d) => `The portal data changed while it was being read (${d}). Press Start again.`,
  size: (d) => `The portal data is larger than the simulation accepts (${d}).`,
  validate: (d) => `The snapshot failed the simulation's own check (${d}).`,
};

/** code: read | invariant | size | validate; detail: the table, invariant or check concerned. */
export class SnapshotError extends Error {
  constructor(code, detail) {
    super((MESSAGES[code] || ((d) => String(d)))(detail));
    this.name = "SnapshotError";
    this.code = code;
    this.detail = detail;
  }
}

// ── small helpers ────────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);           // code-unit order, the same in every engine
const jsonLen = (v) => JSON.stringify(v).length;
const colMap = new Map(Object.keys(TABLES).map((t) => [t, new Map(columnsOf(t).map((c) => [c.name, c]))]));

/** Runs `fn` over `items`, at most `limit` at a time; results in input order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

// ── test accounts (decision 3; contract §E.13): one definition, in select.js ──
// detectTestAccounts runs here on the UNMASKED profiles (the email domain counts), before masking.
export { detectTestAccounts };
export const testAccountCandidates = testAccountCandidatesOf;

// ── project_has_deliverables, computed locally (supabase/migrations/20261006_project_deliverables.sql:58-67) ──
/** CAPEX project and (a linked PDD at "PMO Approved"/"All Approved", or any attachment, any kind,
 *  named PDD…, EPDD… or …charter…). Sorted ids. No RPC is called. */
export function deliverablesIds(tables) {
  const capex = new Set((tables.projects || []).filter((p) => p.portfolio === "capex").map((p) => p.id));
  const yes = new Set();
  for (const e of tables.epdd_pdds || []) {
    if (e.linked_project_id && (e.epdd_status === "PMO Approved" || e.epdd_status === "All Approved")) yes.add(e.linked_project_id);
  }
  for (const a of tables.project_attachments || []) {
    const n = a.file_name;
    if (typeof n === "string" && (/^pdd/i.test(n) || /^epdd/i.test(n) || /charter/i.test(n))) yes.add(a.project_id);
  }
  return [...yes].filter((id) => capex.has(id)).sort(cmp);
}

// ── media keys (contract §B.2.4) ─────────────────────────────────────────────
/** Site-visit rows in key order: uploaded_at desc, then id asc. */
export const byMediaOrder = (a, b) => cmp(String(b.uploaded_at ?? ""), String(a.uploaded_at ?? "")) || cmp(String(a.id), String(b.id));
export const mediaKeyOf = (i) => "m" + String(i + 1).padStart(3, "0");

/** The fields the media callback receives (the original storage path stays in the portal tab). */
const mediaRowOf = (r) => ({ id: r.id, project_id: r.project_id, file_name: r.file_name, file_path: r.file_path,
  mime_type: r.mime_type, file_size: r.file_size, uploaded_at: r.uploaded_at });

// ── column policies (schema.js) ──────────────────────────────────────────────
/** Base policies for a table row read from the server: unlisted columns dropped, contacts masked,
 *  `null` columns emptied. `path`, `body` and `figures` wait for the plan (trimRow). */
function baseRow(table, row) {
  const cols = colMap.get(table);
  const out = {};
  if (!isObj(row)) return out;
  for (const [name, c] of cols) {
    if (!Object.prototype.hasOwnProperty.call(row, name)) continue;
    const v = row[name];
    if (c.policy === "mask") out[name] = v == null || v === "" ? v : MASK[name];
    else if (c.policy === "null") out[name] = null;
    else out[name] = isTextColumn(c) ? scrubContacts(v) : v;
  }
  return out;
}

/** A report's figures without the top risks' mitigation texts (mitigation_plan has the null policy). */
export function figuresWithoutMitigation(v) {
  const top = v && typeof v === "object" ? v.risks?.top : null;
  if (!Array.isArray(top) || !top.some((r) => r && typeof r === "object" && r.mitigation != null)) return v;
  return { ...v, risks: { ...v.risks, top: top.map((r) => (r && typeof r === "object" ? { ...r, mitigation: null } : r)) } };
}

/** The plan-dependent policies. `ctx` = { mediaKey: Map(id → key), threads: { comments: Set, past_project_updates: Set }, reportId }. */
function planValue(table, name, policy, row, v, ctx) {
  if (policy === "path") {
    if (row.id == null) return null;
    const key = ctx.mediaKey.get(row.id);
    return key ? "sim-media/" + key : "sim-unavailable/" + row.id;
  }
  if (policy === "body") return row.id != null && ctx.threads[table]?.has(row.id) ? scrubContacts(v) : null;
  if (policy === "figures") return ctx.reportId != null && row.id === ctx.reportId ? figuresWithoutMitigation(v) : null;
  return v;
}

function trimRow(table, row, ctx) {
  const cols = colMap.get(table);
  const out = {};
  for (const [name, v] of Object.entries(row)) {
    const c = cols.get(name);
    if (!c) continue;
    out[name] = c.policy === "path" || c.policy === "body" || c.policy === "figures" ? planValue(table, name, c.policy, row, v, ctx) : v;
  }
  return out;
}

/** A recorded response row: every policy at every level; embedded rows use their own table's
 *  policies; keys the allow-list does not name are dropped. */
export function sanitizeRow(table, row, ctx, embeds = {}, prefix = "") {
  if (!isObj(row)) return row === undefined ? null : row;
  const cols = colMap.get(table);
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const ep = prefix ? prefix + "." + k : k;
    const sub = embeds[ep];
    if (sub && colMap.has(sub)) {
      out[k] = Array.isArray(v) ? v.map((x) => sanitizeRow(sub, x, ctx, embeds, ep)) : v == null ? null : sanitizeRow(sub, v, ctx, embeds, ep);
      continue;
    }
    const c = cols?.get(k);
    if (!c) continue;
    if (c.policy === "mask") out[k] = v == null || v === "" ? v : MASK[k];
    else if (c.policy === "null") out[k] = null;
    else out[k] = planValue(table, k, c.policy, row, isTextColumn(c) ? scrubContacts(v) : v, ctx);
  }
  return out;
}

// PostgREST "a-b/total" after rows were removed from a body.
function adjustRange(range, before, after) {
  if (typeof range !== "string" || before === after) return range ?? null;
  const m = /^(\d+)-(\d+)\/(\*|\d+)$/.exec(range) || /^\*\/(\*|\d+)$/.exec(range);
  if (!m) return range;
  const total = m.length === 4 ? m[3] : m[1];
  const removed = before - after;
  const t = total === "*" ? "*" : String(Math.max(0, Number(total) - removed));
  if (after === 0) return "*/" + t;
  const start = m.length === 4 ? Number(m[1]) : 0;
  return `${start}-${start + after - 1}/${t}`;
}

/** Ids the plan's review covers (contract §C.2 step 3): a change asks the PMO again. */
export function reviewIds(plan) {
  return {
    lastCommentId: plan?.updates?.lastCommentId ?? null,
    lastMessageId: plan?.past?.lastMessageId ?? null,
    riskRowId: plan?.risks?.rowId ?? null,
    userRowId: plan?.users?.row?.userId ?? null,
  };
}
export const sameReview = (a, b) => canon(reviewIds(a)) === canon(reviewIds(b));

// ── reading ──────────────────────────────────────────────────────────────────
/** One table's rows as the server sent them (retried once), before any policy. */
async function fetchRows(get, table, ids) {
  const path = tablePath(table, ids);
  if (path == null) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let r = null;
    try { r = await get(path); } catch (e) { if (e?.fatal) throw e; r = null; }   // fatal: e.g. signed out, no retry
    if (r && r.status === 200 && Array.isArray(r.body)) {
      const rows = TABLES[table].synthetic ? r.body.slice(0, 1).map((x) => ({ id: 1, created_at: x?.created_at ?? null })) : r.body;
      if (rows.length > TABLES[table].rows) throw new SnapshotError("size", `${table}: ${rows.length} rows`);
      return rows;
    }
  }
  throw new SnapshotError("read", table);
}

const readTable = async (get, table, ids) => (await fetchRows(get, table, ids)).map((x) => baseRow(table, x));

async function readResponse(get, path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let r = null;
    try { r = await get(path); } catch (e) { if (e?.fatal) throw e; r = null; }   // fatal: e.g. signed out, no retry
    if (r && r.status >= 200 && r.status < 300 && (Array.isArray(r.body) || isObj(r.body))) return r;
  }
  return null;
}

const planIds = (pmo, plan) => ({
  me: pmo.id, storyId: plan?.story?.id ?? null, storyPmId: plan?.story?.pmId ?? null,
  updatesId: plan?.updates?.projectId ?? null, pastId: plan?.past?.id ?? null, reportId: plan?.report?.id ?? null,
});
const planTableIds = (plan) => ({ storyId: plan?.story?.id ?? null, pastId: plan?.past?.id ?? null });

async function readPlanTables(get, plan, cache) {
  const ids = planTableIds(plan);
  const out = {};
  for (const t of PLAN_TABLES) {
    const path = tablePath(t, ids);
    if (path == null) { out[t] = []; continue; }
    if (cache && cache.has(path)) { out[t] = cache.get(path); continue; }
    out[t] = await readTable(get, t, ids);
    if (cache) cache.set(path, out[t]);
  }
  return out;
}

function ctxOf({ takenAt, pmo, testAccounts, overrides, leftOut, failed }) {
  return { now: takenAt, me: pmo.id, testAccounts, overrides, leftOut, failed };
}

const cleanOverrides = (o) => (isObj(o) ? JSON.parse(JSON.stringify(o)) : {});
const cleanPmo = (p) => ({ id: p?.id, username: p?.username ?? null, full_name: p?.full_name ?? null });

/** Steps 1–2: every non-plan table (masked) + detected test accounts (on the unmasked profiles,
 *  which are dropped straight after). */
async function readBase(get, concurrency) {
  let rawProfiles = null;
  const rows = await pool(BASE_TABLES, concurrency, async (t) => {
    const raw = await fetchRows(get, t, {});
    if (t === "user_profiles") rawProfiles = raw;
    return raw.map((x) => baseRow(t, x));
  });
  const tables = {};
  BASE_TABLES.forEach((t, i) => { tables[t] = rows[i]; });
  const detected = detectTestAccounts(rawProfiles, tables.project_assignments);
  const candidates = testAccountCandidates(rawProfiles, tables.project_assignments)
    .map((u) => ({ id: u.id, username: u.username ?? null, full_name: u.full_name ?? null, role: u.role ?? null, detected: detected.includes(u.id) }));
  rawProfiles = null;
  for (const t of PLAN_TABLES) tables[t] = [];
  return { tables, detected, candidates };
}

/** Confirmed test accounts: known profile ids only, sorted, no repeats. */
function confirmedTestAccounts(list, tables) {
  const known = new Set((tables.user_profiles || []).map((u) => u.id));
  return [...new Set((list || []).filter((id) => typeof id === "string" && known.has(id)))].sort(cmp);
}

/** Step 4: the left-out site-visit rows removed. Returns { tables, leftOut: count, removed: Set(ids) }. */
function removeLeftOut(tables, leftOutIds) {
  const want = new Set(leftOutIds || []);
  const removed = new Set();
  const att = (tables.project_attachments || []).filter((a) => {
    if (a.kind === "site_visit" && want.has(a.id)) { removed.add(a.id); return false; }
    return true;
  });
  return { tables: { ...tables, project_attachments: att }, leftOut: removed.size, removed };
}

/**
 * The launcher's plan for a preview read, recomputed when the PMO changes an override, the
 * leave-out list or the test accounts (no new read; the plan tables are read again only when the
 * story or past subject changes, through `get` when given).
 * → { plan, candidates, tables, leftOut, typedTexts }
 */
export async function previewPlan(preview, { overrides = {}, testAccounts = null, leftOut = [], get = null } = {}) {
  const ov = cleanOverrides(overrides);
  const confirmed = confirmedTestAccounts(testAccounts ?? preview.testAccountsDetected, preview.tables);
  const { tables: t0, leftOut: nLeft } = removeLeftOut(preview.tables, leftOut);
  const ctx = ctxOf({ takenAt: preview.takenAt, pmo: preview.pmo, testAccounts: confirmed, overrides: ov, leftOut: nLeft, failed: 0 });
  let tables = t0;
  let plan = selectPlan(tables, ctx);
  if (get) {
    tables = { ...tables, ...(await readPlanTables(get, plan, preview.planCache)) };
    plan = selectPlan(tables, ctx);
  }
  return { plan, candidates: candidatesOf(tables, ctx), tables, leftOut: nLeft, typedTexts: plan?.flags?.typedTexts || [] };
}

/**
 * Reads a snapshot (contract §D.1). Preview mode (`preview: true`, or no `media` callback) does
 * steps 1–6 and the plan tables, and returns what the launcher shows:
 *   { preview: true, takenAt, pmo, tables, plan, candidates, testAccountsDetected,
 *     testAccountCandidates, siteVisitRows, typedTexts, planCache }
 * Otherwise the full, validated, fingerprinted Snapshot (§B.2).
 */
export async function readSnapshot({
  get, pmo, build = "dev", now = () => Date.now(), overrides = {}, testAccounts = null, leftOut = [],
  media = null, preview = false, concurrency = 6, onPhase = () => {},
} = {}) {
  if (typeof get !== "function") throw new TypeError("readSnapshot: get is required");
  if (!pmo || typeof pmo.id !== "string") throw new TypeError("readSnapshot: pmo.id is required");
  const isPreview = preview || typeof media !== "function";
  const phase = (p) => { try { onPhase(p); } catch { /* ignore */ } };
  const me = cleanPmo(pmo);
  const ov = cleanOverrides(overrides);

  for (let round = 0; ; round++) {
    const takenAt = now();
    phase("tables");
    const base = await readBase(get, concurrency);
    const confirmed = confirmedTestAccounts(testAccounts ?? base.detected, base.tables);
    const rpc = { project_has_deliverables: deliverablesIds(base.tables) };   // step 3, before any removal

    if (isPreview) {
      phase("plan");
      const pv = { preview: true, takenAt, pmo: me, tables: base.tables, testAccountsDetected: base.detected,
        testAccountCandidates: base.candidates, planCache: new Map(),
        siteVisitRows: base.tables.project_attachments.filter((a) => a.kind === "site_visit").sort(byMediaOrder).map(mediaRowOf) };
      const p = await previewPlan(pv, { overrides: ov, testAccounts: confirmed, leftOut, get });
      return { ...pv, plan: p.plan, candidates: p.candidates, typedTexts: p.typedTexts, rpc };
    }

    // Step 4: left out. Step 5: media; rows without a ready item are removed (`failed`).
    const { tables: t4, leftOut: nLeft, removed: leftOutIds } = removeLeftOut(base.tables, leftOut);
    phase("media");
    const sv = t4.project_attachments.filter((a) => a.kind === "site_visit").sort(byMediaOrder);
    let got = null;
    try { got = await media(sv.map(mediaRowOf)); } catch { got = null; }
    const ready = new Map();
    let total = 0;
    for (const r of sv) {
      const m = got && typeof got.get === "function" ? got.get(r.id) : null;
      const ok = m && MEDIA_MIMES.includes(m.mime) && Number.isInteger(m.size) && m.size >= 1 && m.size <= CAPS.mediaItem
        && typeof m.sha256 === "string" && SHA_RE.test(m.sha256);
      if (!ok || ready.size >= CAPS.mediaCount || total + m.size > CAPS.mediaTotal) continue;
      ready.set(r.id, { mime: m.mime, size: m.size, sha256: m.sha256 });
      total += m.size;
    }
    const failedIds = new Set(sv.filter((r) => !ready.has(r.id)).map((r) => r.id));
    const tables = { ...t4, project_attachments: t4.project_attachments.filter((a) => !failedIds.has(a.id)) };
    const removedIds = new Set([...failedIds, ...leftOutIds]);
    const failed = failedIds.size;

    // Step 6: the plan on the masked tables; step 7: the plan tables, then the plan again over
    // the full set (a story's WBS count needs its tasks). The subjects must not move.
    phase("plan");
    const ctx = ctxOf({ takenAt, pmo: me, testAccounts: confirmed, overrides: ov, leftOut: nLeft, failed });
    const plan0 = selectPlan(tables, ctx);
    Object.assign(tables, await readPlanTables(get, plan0, null));
    const plan = selectPlan(tables, ctx);
    if (canon(planTableIds(plan)) !== canon(planTableIds(plan0))) throw new SnapshotError("validate", "plan subjects moved");

    // Keys for the served site-visit rows.
    const served = tables.project_attachments.filter((a) => a.kind === "site_visit").sort(byMediaOrder);
    const mediaKey = new Map(served.map((a, i) => [a.id, mediaKeyOf(i)]));
    const mediaList = served.map((a, i) => ({ attachmentId: a.id, key: mediaKeyOf(i), ...ready.get(a.id) }));

    // Step 8: recorded responses, in TEMPLATES order, de-duplicated by key.
    phase("responses");
    const ids = planIds(me, plan);
    const wanted = [];
    const seen = new Set();
    for (const t of TEMPLATES) {
      const path = fill(t.path, ids);
      if (path == null) continue;
      const key = keyOf(path);
      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push({ t, path, key });
    }
    const raw = await pool(wanted, concurrency, (w) => readResponse(get, w.path));
    const missing = wanted.filter((w, i) => !raw[i]);
    if (missing.length) throw new SnapshotError("read", missing.map((w) => w.t.id).join(", "));

    // Step 9: trim tables and responses.
    phase("trim");
    const tctx = {
      mediaKey,
      threads: {
        comments: new Set(plan?.updates?.projectId != null ? tables.comments.filter((c) => c.project_id === plan.updates.projectId).map((c) => c.id) : []),
        past_project_updates: new Set(plan?.past?.id != null ? tables.past_project_updates.filter((m) => m.past_project_id === plan.past.id).map((m) => m.id) : []),
      },
      reportId: plan?.report?.id ?? null,
    };
    const outTables = {};
    for (const t of Object.keys(TABLES)) outTables[t] = (tables[t] || []).map((r) => trimRow(t, r, tctx));
    const attIds = new Set(outTables.project_attachments.map((a) => a.id));
    const responses = wanted.map((w, i) => {
      const r = raw[i];
      const embeds = w.t.embeds || {};
      let body = Array.isArray(r.body) ? r.body.map((x) => sanitizeRow(w.t.table, x, tctx, embeds)) : sanitizeRow(w.t.table, r.body, tctx, embeds);
      let contentRange = r.contentRange ?? null;
      if (w.t.table === "project_attachments" && Array.isArray(body)) {
        const before = body.length;
        // Left-out and failed items go, and so does any row the table read did not see (a race).
        body = body.filter((x) => !(x && x.id != null && (removedIds.has(x.id) || !attIds.has(x.id))));
        contentRange = adjustRange(contentRange, before, body.length);
      }
      return { key: w.key, status: r.status, contentRange, body };
    });

    const snapshot = {
      v: 2, build: String(build), takenAt, readMs: 0, tz: TZ, pmo: me, mask: { contacts: true },
      testAccounts: confirmed, overrides: ov, leftOut: nLeft, failed,
      tables: outTables, responses, rpc, media: mediaList, plan,
      invariants: [], fingerprint: "", code: "", bytes: 0,
    };

    // Step 10: invariants; one more full read on a failure.
    phase("invariants");
    const inv = invariantsOf(snapshot) || [];
    snapshot.invariants = inv;
    const bad = inv.find((x) => !x.ok);
    if (bad) {
      if (round === 0) continue;
      throw new SnapshotError("invariant", bad.name);
    }

    // Sizes (the validator refuses above them; say which one here).
    if (responses.length > CAPS.responses) throw new SnapshotError("size", `${responses.length} responses`);
    let sum = 0;
    for (const [t, rows] of Object.entries(outTables)) {
      const n = jsonLen(rows);
      if (n > CAPS.tableJson) throw new SnapshotError("size", t);
      sum += n;
    }
    for (const r of responses) {
      const n = jsonLen(r);
      if (n > CAPS.responseJson) throw new SnapshotError("size", r.key.split("?")[0]);
      sum += n;
    }
    if (sum > CAPS.totalJson) throw new SnapshotError("size", "total");

    // Step 11: fingerprint, then the simulation tab's own validation, here first.
    phase("fingerprint");
    const fp = await fingerprintOf(snapshot);
    snapshot.fingerprint = fp.fingerprint;
    snapshot.code = fp.code;
    snapshot.bytes = fp.bytes;
    snapshot.readMs = Math.max(0, Math.round(now() - takenAt));
    phase("validate");
    try {
      await validateSnapshot(snapshot, { build: snapshot.build, now: now() });
    } catch (e) {
      throw new SnapshotError("validate", [e?.code, e?.reason || e?.message].filter(Boolean).join(": ") || "failed");
    }
    return snapshot;
  }
}
