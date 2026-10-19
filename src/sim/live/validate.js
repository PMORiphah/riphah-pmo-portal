// PMO Simulation (live data): the hand-over validator, the snapshot invariants and the freshness
// rule. PUBLIC, pure, no data. Owner: B2. Spec: contract §B.6, §C.4, §G.8.
//
// Runs in both tabs: the portal tab checks its own snapshot before sending it (src/sim/live/
// snapshot.js), and the simulation tab checks what arrived (src/sim/handoff.js). It fails closed:
// the first problem rejects the whole hand-over with a ValidationError { code, reason }. Reasons
// name tables, columns, templates and checks, never a data value, so they can be shown on screen.
//
//   validateSnapshot(snapshot, { build, now, recomputePlan = true })  → a clean deep copy, or throws
//   validateMediaItem(item, snapshot)                                  → the item, blob re-typed, or throws
//   invariants(snapshot)                                               → [{ name, ok, detail }]
//   freshness(takenAt, now)                                            → { state: ok | amber | refused, … }
//
// Codes: protocol, build, schema, type, size, key, secret, mask, response, media, invariant,
// fingerprint, plan, stale.
import { TABLES, MASK, SETTINGS_KEYS, CAPS, columnsOf, keysOf, hasContact, isTextColumn } from "./schema.js";
import { TEMPLATES, keyOf, fill } from "./requests.js";
import { canon, fingerprintOf, sha256Hex } from "./canon.js";
import { selectPlan } from "./select.js";

export const TZ = "Asia/Karachi";
export const MEDIA_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
export const CODES = Object.freeze(["protocol", "build", "schema", "type", "size", "key", "secret", "mask", "response",
  "media", "invariant", "fingerprint", "plan", "stale"]);
/** Freshness (contract §G.8): amber from 15 minutes, refused after 60 or on another day. */
export const FRESH = Object.freeze({ amberMin: 15, maxMin: 60, futureMs: 2 * 60 * 1000 });

export class ValidationError extends Error {
  constructor(code, reason) {
    super(`${code}: ${reason}`);
    this.name = "ValidationError";
    this.code = code;
    this.reason = reason;
  }
}
const bad = (code, reason) => { throw new ValidationError(code, reason); };

// ── shapes ───────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;
const ENUM_RE = /^[a-z][a-z0-9_]{0,63}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const CODE6_RE = /^[0-9A-HJKMNP-TV-Z]{6}$/;
const BUILD_RE = /^[A-Za-z0-9._-]{1,100}$/;
const MEDIA_KEY_RE = /^m\d{3}$/;
const RANGE_RE = /^(?:\d+-\d+|\*)\/(?:\d+|\*)$/;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
/** A plain object of this realm (what JSON and structured clone produce). */
const isPlain = (v) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);          // code-unit order, as snapshot.js sorts
const short = (s) => String(s).slice(0, 48);
const jsonLen = (v) => JSON.stringify(v).length;

const COLS = new Map(Object.keys(TABLES).map((t) => [t, new Map(columnsOf(t).map((c) => [c.name, c]))]));
const TABLE_NAMES = Object.freeze(Object.keys(TABLES));

// Keys that never belong in a hand-over (prototype keys, secrets, unmasked contacts, E-PDD blobs).
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype", "password", "raw", "approvals", "pm_email",
  "secondary_email", "access_token", "refresh_token", "apikey"]);
// Secret-looking text: a JWT, a signed storage link, a private key or a service key.
const SECRETS = Object.freeze([
  ["a token", /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ["a signed link", /token=|\/object\/sign\//],
  ["a key", /-----BEGIN|service_role|AIza[0-9A-Za-z_-]{20}|gsk_[0-9A-Za-z]{20}|sk-[A-Za-z0-9]{20}/],
]);

/** Walks a JSON value: plain objects, arrays, strings, finite numbers, booleans and null only;
 *  no forbidden key, no secret-looking string, strings and depth within the caps. */
function scan(v, where, depth = 0) {
  if (depth > CAPS.jsonDepth) bad("size", `${where}: nested too deeply`);
  if (v === null) return;
  switch (typeof v) {
    case "string":
      if (v.length > CAPS.string) bad("size", `${where}: text too long`);
      for (const [what, re] of SECRETS) if (re.test(v)) bad("secret", `${where}: text that looks like ${what}`);
      return;
    case "number":
      if (!Number.isFinite(v)) bad("type", `${where}: not a finite number`);
      return;
    case "boolean":
      return;
    case "object":
      if (Array.isArray(v)) {
        if (Object.getPrototypeOf(v) !== Array.prototype) bad("type", `${where}: not a plain list`);
        for (let i = 0; i < v.length; i++) scan(v[i], where, depth + 1);
        return;
      }
      if (!isPlain(v)) bad("type", `${where}: not plain data`);
      for (const k of Object.keys(v)) {
        if (BAD_KEYS.has(k)) bad("secret", `${where}: a field named ${k}`);
        for (const [what, re] of SECRETS) if (re.test(k)) bad("secret", `${where}: a field name that looks like ${what}`);
        scan(v[k], where, depth + 1);
      }
      return;
    default:
      bad("type", `${where}: ${typeof v} is not data`);
  }
}

/** One column value against its allow-list type (null handled by the caller). */
function checkType(table, c, v) {
  const where = `${table}.${c.name}`;
  let ok;
  switch (c.type) {
    case "u": ok = isUuid(v); break;
    case "t": ok = typeof v === "string"; break;
    case "e": ok = typeof v === "string" && ENUM_RE.test(v); break;
    case "n": ok = typeof v === "number" && Number.isFinite(v); break;
    case "b": ok = typeof v === "boolean"; break;
    case "d": ok = typeof v === "string" && DATE_RE.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z")); break;
    case "ts": ok = typeof v === "string" && TS_RE.test(v) && Number.isFinite(Date.parse(v.replace(" ", "T"))); break;
    case "j": ok = v !== undefined; break;                       // any JSON value (scan() checked its shape)
    default: ok = false;
  }
  if (!ok) bad("type", where);
}

// ── plan ids and the allowed responses ───────────────────────────────────────
const planIds = (s) => ({
  me: s?.pmo?.id ?? null,
  storyId: s?.plan?.story?.id ?? null,
  storyPmId: s?.plan?.story?.pmId ?? null,
  updatesId: s?.plan?.updates?.projectId ?? null,
  pastId: s?.plan?.past?.id ?? null,
  reportId: s?.plan?.report?.id ?? null,
});
/** key → template, for every template whose placeholders the plan fills (first template wins). */
export function allowedResponses(s) {
  const ids = planIds(s);
  const out = new Map();
  for (const t of TEMPLATES) {
    const p = fill(t.path, ids);
    if (p == null) continue;
    const k = keyOf(p);
    if (!out.has(k)) out.set(k, t);
  }
  return out;
}
const responseOf = (s, templateId) => {
  const t = TEMPLATES.find((x) => x.id === templateId);
  const p = t ? fill(t.path, planIds(s)) : null;
  if (!p) return null;
  const k = keyOf(p);
  return (Array.isArray(s?.responses) ? s.responses : []).find((r) => r && r.key === k) || null;
};

// ── invariants (contract §B.6) ───────────────────────────────────────────────
/** [{ name, ok, detail }] over the snapshot's tables and responses. Details are counts only. */
export function invariants(s) {
  const T = (s && s.tables) || {};
  const rows = (t) => (Array.isArray(T[t]) ? T[t] : []);
  const projects = rows("projects");
  const capex = projects.filter((p) => p && p.portfolio === "capex");
  const pd = rows("portfolio_dashboard")[0] || {};
  const pids = new Set(projects.map((p) => p && p.id));
  const sum = (k) => capex.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const near = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 0.5;
  const out = [];
  const add = (name, ok, detail = "") => out.push({ name, ok: !!ok, detail: ok ? "" : detail });

  const mids = new Set(rows("project_metrics").map((m) => m && m.id));
  const sameIds = mids.size === pids.size && [...mids].every((x) => pids.has(x));
  add("metrics-ids", sameIds, `${mids.size} metric rows, ${pids.size} projects`);
  add("df-total", near(sum("df_recommended_amount"), pd.total_capex), "DF Recommended total differs from the dashboard");
  add("capex-count", capex.length === Number(pd.total_projects), `${capex.length} CAPEX projects, dashboard ${Number(pd.total_projects)}`);
  add("released-total", near(sum("amount_released"), pd.budget_consumed), "released total differs from the dashboard");
  const orphans = [...rows("comments"), ...rows("project_assignments"), ...rows("project_attachments")]
    .filter((r) => !r || !pids.has(r.project_id)).length;
  add("refs", orphans === 0, `${orphans} rows point at no project`);
  const counted = [["dash.projects", capex.length], ["cmp.projects", capex.length], ["tl.projects", capex.length],
    ["users.rows", rows("user_profiles").length]];
  const off = counted.filter(([id, n]) => { const r = responseOf(s, id); return r && !(Array.isArray(r.body) && r.body.length === n); })
    .map(([id]) => id);
  add("counts", off.length === 0, off.join(", "));
  return out;
}

// ── freshness (contract §G.8) ────────────────────────────────────────────────
const HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const pktDay = (ms) => new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** HH:MM in Pakistan time ("10:41"). */
export const hhmmPKT = (ms) => HHMM.format(ms);

/**
 * { state: "ok" | "amber" | "refused", ageMin, readAt: "HH:MM", reason: null | "age" | "day" | "future" | "time", text }
 * Refused after 60 minutes, or when the Pakistan or UTC date of the read is not today's (the
 * database's CURRENT_DATE rolls over at 05:00 PKT), or when the read claims to be in the future.
 * Amber from 15 minutes.
 */
export function freshness(takenAt, now = Date.now()) {
  if (!Number.isFinite(takenAt) || !Number.isFinite(now)) {
    return { state: "refused", ageMin: null, readAt: null, reason: "time", text: "The time of the data read is not known. Press Refresh data." };
  }
  const ageMs = now - takenAt;
  const ageMin = Math.max(0, Math.floor(ageMs / 60000));
  const readAt = hhmmPKT(takenAt);
  let state = "ok", reason = null;
  if (ageMs < -FRESH.futureMs) { state = "refused"; reason = "future"; }
  else if (ageMs / 60000 > FRESH.maxMin) { state = "refused"; reason = "age"; }
  else if (pktDay(takenAt) !== pktDay(now) || utcDay(takenAt) !== utcDay(now)) { state = "refused"; reason = "day"; }
  else if (ageMs / 60000 >= FRESH.amberMin) state = "amber";
  // A refused age is rounded up (60.01 min is "61 min old"), and a read on an earlier day says so.
  const oldMin = Math.ceil(ageMs / 60000);
  const readWhen = pktDay(takenAt) === pktDay(now) ? `read ${readAt} PKT`
    : pktDay(takenAt) === pktDay(now - 86400000) ? `read yesterday at ${readAt} PKT` : `read on ${pktDay(takenAt)} at ${readAt} PKT`;
  const text = state === "ok" ? ""
    : state === "amber" ? `Data read ${ageMin} min ago · Refresh data`
      : reason === "day" ? `Live data was read before the day changed (${readWhen}). Press Refresh data.`
        : reason === "future" ? `The data read is timed after this computer's clock (read ${readAt} PKT). Press Refresh data.`
          : `Live data is ${oldMin < 120 ? `${oldMin} min` : `${Math.floor(oldMin / 60)} hours`} old (${readWhen}). Press Refresh data.`;
  return { state, ageMin, readAt, reason, text };
}

// ── media ────────────────────────────────────────────────────────────────────
/** First bytes of each allowed type, so a mislabelled file (an HTML page called image/png) is refused. */
export async function sniff(blob, mime) {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const at = (i, ...xs) => xs.every((x, j) => b[i + j] === x);
  switch (mime) {
    case "image/jpeg": return at(0, 0xff, 0xd8, 0xff);
    case "image/png": return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp": return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    case "video/mp4": return at(4, 0x66, 0x74, 0x79, 0x70);
    case "video/webm": return at(0, 0x1a, 0x45, 0xdf, 0xa3);
    default: return false;
  }
}

const MEDIA_ITEM_KEYS = ["key", "attachmentId", "mime", "size", "sha256", "blob"];
/**
 * One media item from the hand-over against the (already validated) snapshot: listed in
 * snapshot.media with the same id, type, size and hash; its attachment is a site-visit row whose
 * file_path names this key; the bytes are what the type says (magic bytes) and hash to sha256.
 * Returns { key, attachmentId, mime, size, sha256, blob } with the blob re-typed to the declared type.
 */
export async function validateMediaItem(item, snapshot) {
  if (!isPlain(item)) bad("media", "item is not an object");
  for (const k of Object.keys(item)) if (!MEDIA_ITEM_KEYS.includes(k)) bad("media", `item field ${short(k)}`);
  const { key, attachmentId, mime, size, sha256, blob } = item;
  if (typeof key !== "string" || !MEDIA_KEY_RE.test(key)) bad("media", "item key");
  const e = (snapshot?.media || []).find((m) => m.key === key);
  if (!e) bad("media", `${key}: not listed`);
  if (attachmentId !== e.attachmentId || mime !== e.mime || size !== e.size || sha256 !== e.sha256) bad("media", `${key}: differs from the list`);
  const att = (snapshot?.tables?.project_attachments || []).find((a) => a.id === attachmentId);
  if (!att || att.kind !== "site_visit" || att.file_path !== "sim-media/" + key) bad("media", `${key}: not a site-visit item`);
  if (!MEDIA_MIMES.includes(mime)) bad("media", `${key}: type`);
  if (!Number.isInteger(size) || size < 1 || size > CAPS.mediaItem) bad("media", `${key}: size`);
  if (typeof Blob === "undefined" || !(blob instanceof Blob)) bad("media", `${key}: no file`);
  if (blob.size !== size) bad("media", `${key}: file does not match its size`);
  if (!(await sniff(blob, mime))) bad("media", `${key}: file is not ${mime}`);
  if ((await sha256Hex(blob)) !== sha256) bad("media", `${key}: file does not match its hash`);
  // Re-wrapped with the declared (allow-listed) type: an object URL never serves anything else.
  return { key, attachmentId, mime, size, sha256, blob: new Blob([blob], { type: mime }) };
}

// ── the snapshot ─────────────────────────────────────────────────────────────
const TOP = Object.freeze(["v", "build", "takenAt", "readMs", "tz", "pmo", "mask", "testAccounts", "overrides", "leftOut",
  "failed", "tables", "responses", "rpc", "media", "plan", "invariants", "fingerprint", "code", "bytes"]);
const OVERRIDE_IDS = ["storyId", "updatesProjectId", "pastId", "reportId", "riskRowId", "usersUserId", "galleryProjectId"];
const OVERRIDE_KEYS = new Set([...OVERRIDE_IDS, "storyAlias", "say"]);
const RESPONSE_KEYS = ["key", "status", "contentRange", "body"];
const MEDIA_KEYS = ["attachmentId", "key", "mime", "size", "sha256"];
// '<', control characters, zero-width marks, line/paragraph separators, bidi overrides and
// isolates, and the byte-order mark. (A code-point test: esbuild turns some escapes in a regex
// literal into raw characters, and a raw line separator ends the regex.)
function hasBadChar(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0x3c || c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f)
      || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return true;
  }
  return false;
}
const nameText = (v, max) => typeof v === "string" && v.length >= 1 && v.length <= max && !hasBadChar(v);
const optNameText = (v, max) => v == null || nameText(v, max);
const exactKeys = (o, keys, code, where) => {
  for (const k of Object.keys(o)) if (!keys.includes(k)) bad(code, `${where}: field ${short(k)}`);
  for (const k of keys) if (!own(o, k)) bad(code, `${where}: no ${k}`);
};

/** The snapshot's own context for selectPlan (contract §C.4). */
export const ctxFrom = (s) => ({ now: s.takenAt, me: s.pmo.id, testAccounts: s.testAccounts, overrides: s.overrides,
  leftOut: s.leftOut, failed: s.failed });

function checkShape(s) {
  if (!isPlain(s)) bad("protocol", "the snapshot is not an object");
  exactKeys(s, TOP, "protocol", "snapshot");
}

function checkTop(s, opts) {
  if (s.v !== 2) bad("protocol", "snapshot version");
  if (typeof s.build !== "string" || !BUILD_RE.test(s.build)) bad("protocol", "build name");
  if (opts.build !== undefined && s.build !== opts.build) bad("build", "the portal tab runs another version of the portal");
  if (!Number.isInteger(s.takenAt) || s.takenAt <= 0) bad("protocol", "takenAt");
  if (typeof s.readMs !== "number" || !Number.isFinite(s.readMs) || s.readMs < 0 || s.readMs > 3600000) bad("protocol", "readMs");
  if (s.tz !== TZ) bad("protocol", "time zone");
  if (!isPlain(s.pmo)) bad("protocol", "pmo");
  for (const k of Object.keys(s.pmo)) if (!["id", "username", "full_name"].includes(k)) bad("protocol", `pmo field ${short(k)}`);
  if (!isUuid(s.pmo.id)) bad("protocol", "pmo id");
  if (!optNameText(s.pmo.username, 80) || !optNameText(s.pmo.full_name, 160)) bad("protocol", "pmo name");
  if (!isPlain(s.mask) || Object.keys(s.mask).length !== 1 || s.mask.contacts !== true) bad("mask", "contact details must be hidden");
  if (!Array.isArray(s.testAccounts) || s.testAccounts.length > TABLES.user_profiles.rows) bad("schema", "testAccounts");
  s.testAccounts.forEach((id, i) => {
    if (!isUuid(id)) bad("schema", "testAccounts id");
    if (i && cmp(s.testAccounts[i - 1], id) >= 0) bad("schema", "testAccounts not sorted");
  });
  if (!isPlain(s.overrides)) bad("schema", "overrides");
  for (const [k, v] of Object.entries(s.overrides)) {
    if (!OVERRIDE_KEYS.has(k)) bad("schema", `override ${short(k)}`);
    if (v == null) continue;
    if (OVERRIDE_IDS.includes(k) && !isUuid(v)) bad("schema", `override ${k}`);
    if (k === "storyAlias" && !nameText(v, 80)) bad("schema", "override storyAlias");
    if (k === "say") {
      if (!isPlain(v) || Object.keys(v).length > TABLES.user_profiles.rows) bad("schema", "override say");
      for (const [id, text] of Object.entries(v)) if (!isUuid(id) || !nameText(text, 80)) bad("schema", "override say entry");
    }
  }
  const counts = (v) => Number.isInteger(v) && v >= 0 && v <= TABLES.project_attachments.rows;
  if (!counts(s.leftOut) || !counts(s.failed)) bad("schema", "leftOut / failed");
  if (!isPlain(s.tables)) bad("schema", "tables");
  if (!Array.isArray(s.responses)) bad("response", "responses");
  if (!isPlain(s.rpc)) bad("schema", "rpc");
  if (!Array.isArray(s.media)) bad("media", "media list");
  if (!isPlain(s.plan)) bad("plan", "plan");
  if (!Array.isArray(s.invariants)) bad("invariant", "invariants");
  if (typeof s.fingerprint !== "string" || !HEX64_RE.test(s.fingerprint)) bad("fingerprint", "fingerprint");
  if (typeof s.code !== "string" || !CODE6_RE.test(s.code)) bad("fingerprint", "snapshot code");
  if (!Number.isInteger(s.bytes) || s.bytes < 0) bad("fingerprint", "bytes");
}

/** Per-snapshot lookups for the column policies. */
function policyContext(s) {
  const T = s.tables;
  const updatesId = s.plan?.updates?.projectId ?? null;
  const pastId = s.plan?.past?.id ?? null;
  const attById = new Map((T.project_attachments || []).map((a) => [a.id, a]));
  const keyOfAtt = new Map((s.media || []).map((m) => [m.attachmentId, m.key]));
  return {
    reportId: s.plan?.report?.id ?? null,
    bodyIds: {
      comments: new Set(updatesId == null ? [] : (T.comments || []).filter((c) => c.project_id === updatesId).map((c) => c.id)),
      past_project_updates: new Set(pastId == null ? [] : (T.past_project_updates || []).filter((m) => m.past_project_id === pastId).map((m) => m.id)),
    },
    attById,
    keyOfAtt,
  };
}

/** One row (of a table, or of a recorded response with its embeds): only allowed columns, their
 *  types, and every column policy. Table rows must carry every column. */
function checkRow(table, row, pc, { embeds = null, prefix = "", full = false, where = table } = {}) {
  if (!isPlain(row)) bad("type", `${where}: a row is not an object`);
  const cols = COLS.get(table);
  for (const k of Object.keys(row)) {
    const ep = prefix ? prefix + "." + k : k;
    const sub = embeds && own(embeds, ep) ? embeds[ep] : null;
    if (sub) {
      const v = row[k];
      if (v === null) continue;
      const list = Array.isArray(v) ? v : [v];
      for (const x of list) checkRow(sub, x, pc, { embeds, prefix: ep, where: `${where} › ${ep}` });
      continue;
    }
    const c = cols.get(k);
    if (!c) bad(where === table ? "schema" : "response", `${where}: column ${short(k)} is not allowed`);
    const v = row[k];
    if (v === undefined) bad("type", `${table}.${k}`);
    if (v !== null) checkType(table, c, v);
    // Free text never carries an email address or a phone number (snapshot.js replaces them).
    if (isTextColumn(c) && hasContact(v)) bad("mask", `${table}.${k} holds a contact detail`);
    switch (c.policy) {
      case "mask":
        if (v !== null && v !== "" && v !== MASK[k]) bad("mask", `${table}.${k} is not hidden`);
        break;
      case "null":
        if (v !== null) bad("schema", `${table}.${k} must be empty`);
        break;
      case "body":
        if (v !== null && !(row.id != null && pc.bodyIds[table]?.has(row.id))) bad("schema", `${table}.${k} outside the plan's thread`);
        break;
      case "figures":
        if (v !== null) {
          if (pc.reportId == null || row.id !== pc.reportId) bad("schema", `${table}.${k} outside the plan's report`);
          if (jsonLen(v) > CAPS.figuresJson) bad("size", `${table}.${k}`);
          const top = v && typeof v === "object" ? v.risks?.top : null;
          if (Array.isArray(top) && top.some((r) => r && typeof r === "object" && r.mitigation != null)) bad("schema", `${table}.${k}: risk mitigation must be empty`);
        }
        break;
      case "path": {
        const a = row.id != null ? pc.attById.get(row.id) : null;
        if (!a) bad("schema", `${table}.${k}: row not in the attachments table`);
        const want = a.kind === "site_visit"
          ? (pc.keyOfAtt.has(a.id) ? "sim-media/" + pc.keyOfAtt.get(a.id) : null)
          : "sim-unavailable/" + a.id;
        if (want === null || v !== want) bad("schema", `${table}.${k} is not a simulation path`);
        break;
      }
      default:
    }
  }
  if (full) for (const k of cols.keys()) if (!own(row, k)) bad("schema", `${table}: column ${k} missing`);
}

function checkTables(s, pc) {
  for (const t of Object.keys(s.tables)) if (!TABLES[t]) bad("schema", `unknown table ${short(t)}`);
  let total = 0;
  for (const t of TABLE_NAMES) {
    const rows = s.tables[t];
    if (!Array.isArray(rows)) bad("schema", `missing table ${t}`);
    if (rows.length > TABLES[t].rows) bad("size", `${t}: too many rows`);
    const n = jsonLen(rows);
    if (n > CAPS.tableJson) bad("size", t);
    total += n;
    const keys = keysOf(t);
    const seen = new Set();
    for (const r of rows) {
      checkRow(t, r, pc, { full: true });
      if (!keys.length) continue;
      for (const k of keys) if (r[k] == null) bad("key", `${t}.${k} is empty`);
      const id = keys.map((k) => String(r[k])).join("\u0000");
      if (seen.has(id)) bad("key", `${t}: the same key twice`);
      seen.add(id);
    }
  }
  const settingKeys = s.tables.settings.map((r) => r.key);
  for (const k of settingKeys) if (!SETTINGS_KEYS.includes(k)) bad("schema", `settings key ${short(k)}`);
  for (const a of s.tables.project_attachments) {
    if (a.kind === "site_visit" && !/^sim-media\/m\d{3}$/.test(String(a.file_path))) bad("schema", "a site-visit item without its media key");
  }
  return total;
}

function checkResponses(s, pc) {
  if (s.responses.length > CAPS.responses) bad("size", "too many responses");
  const allowed = allowedResponses(s);
  const seen = new Set();
  let total = 0;
  for (const r of s.responses) {
    if (!isPlain(r)) bad("response", "a response is not an object");
    exactKeys(r, RESPONSE_KEYS, "response", "response");
    if (typeof r.key !== "string") bad("response", "key");
    const t = allowed.get(r.key);
    if (!t) bad("response", `${short(r.key.split("?")[0])}: not a request of this plan`);
    if (seen.has(r.key)) bad("response", `${t.id}: twice`);
    seen.add(r.key);
    if (!Number.isInteger(r.status) || r.status < 200 || r.status > 299) bad("response", `${t.id}: status`);
    if (r.contentRange !== null && !(typeof r.contentRange === "string" && RANGE_RE.test(r.contentRange))) bad("response", `${t.id}: content range`);
    const body = r.body;
    if (!(Array.isArray(body) || isPlain(body))) bad("response", `${t.id}: body`);
    const n = jsonLen(r);
    if (n > CAPS.responseJson) bad("size", `${t.id}`);
    total += n;
    for (const row of Array.isArray(body) ? body : [body]) checkRow(t.table, row, pc, { embeds: t.embeds || {}, where: t.id });
  }
  return total;
}

function checkRpc(s) {
  exactKeys(s.rpc, ["project_has_deliverables"], "schema", "rpc");
  const ids = s.rpc.project_has_deliverables;
  if (!Array.isArray(ids) || ids.length > TABLES.projects.rows) bad("schema", "rpc project_has_deliverables");
  const capex = new Set(s.tables.projects.filter((p) => p.portfolio === "capex").map((p) => p.id));
  ids.forEach((id, i) => {
    if (!isUuid(id)) bad("schema", "rpc id");
    if (i && cmp(ids[i - 1], id) >= 0) bad("schema", "rpc ids not sorted");
    if (!capex.has(id)) bad("schema", "rpc id is not a CAPEX project");
  });
}

const byMediaOrder = (a, b) => cmp(String(b.uploaded_at ?? ""), String(a.uploaded_at ?? "")) || cmp(String(a.id), String(b.id));
function checkMediaList(s) {
  if (s.media.length > CAPS.mediaCount) bad("media", "too many items");
  const served = s.tables.project_attachments.filter((a) => a.kind === "site_visit").sort(byMediaOrder);
  if (served.length !== s.media.length) bad("media", "the list does not match the site-visit items");
  let total = 0;
  s.media.forEach((m, i) => {
    if (!isPlain(m)) bad("media", "list entry");
    exactKeys(m, MEDIA_KEYS, "media", "list entry");
    const key = "m" + String(i + 1).padStart(3, "0");
    if (m.key !== key) bad("media", `${short(m.key)}: out of order`);
    if (m.attachmentId !== served[i].id) bad("media", `${key}: not the site-visit item in that place`);
    if (!MEDIA_MIMES.includes(m.mime)) bad("media", `${key}: type`);
    if (!Number.isInteger(m.size) || m.size < 1 || m.size > CAPS.mediaItem) bad("media", `${key}: size`);
    if (typeof m.sha256 !== "string" || !HEX64_RE.test(m.sha256)) bad("media", `${key}: hash`);
    total += m.size;
  });
  if (total > CAPS.mediaTotal) bad("media", "more than 150 MB");
}

/**
 * Validates a whole snapshot (contract §C.4), fail closed. opts.build: the build this tab runs
 * (a different snapshot.build is refused); opts.now: checks freshness at that time; recomputePlan:
 * selectPlan over the snapshot's tables must give the snapshot's plan, byte for byte.
 * Resolves a clean deep copy holding only the snapshot fields.
 */
export async function validateSnapshot(snapshot, { build, now, recomputePlan = true } = {}) {
  const s = snapshot;
  checkShape(s);
  // Shape and secrets everywhere before anything reads the data.
  for (const k of TOP) if (!["tables", "responses"].includes(k)) scan(s[k], k);
  scan(s.tables, "tables");
  scan(s.responses, "responses");
  checkTop(s, { build });
  if (now !== undefined) {
    const f = freshness(s.takenAt, now);
    if (f.state === "refused") bad("stale", f.text);
  }
  const pc = policyContext(s);
  checkMediaList(s);
  let total = checkTables(s, pc);
  total += checkResponses(s, pc);
  if (total > CAPS.totalJson) bad("size", "more than 6 MB of data");
  checkRpc(s);
  const known = new Set(s.tables.user_profiles.map((u) => u.id));
  if (!s.testAccounts.every((id) => known.has(id))) bad("schema", "a test account that is not a user");

  const inv = invariants(s);
  const failed = inv.find((x) => !x.ok);
  if (failed) bad("invariant", failed.name);
  const sent = s.invariants.map((x) => (isPlain(x) ? `${x.name}:${x.ok === true}` : "?")).join(",");
  if (sent !== inv.map((x) => `${x.name}:true`).join(",")) bad("invariant", "the checks sent differ");

  let fp;
  try { fp = await fingerprintOf(s); } catch { bad("fingerprint", "could not be computed"); }
  if (fp.fingerprint !== s.fingerprint || fp.code !== s.code || fp.bytes !== s.bytes) bad("fingerprint", "the data does not match its fingerprint");

  if (recomputePlan) {
    let again;
    try { again = selectPlan(s.tables, ctxFrom(s)); } catch { bad("plan", "the plan could not be worked out here"); }
    if (canon(again) !== canon(s.plan)) bad("plan", "the plan differs from the one worked out here");
  }
  const clean = {};
  for (const k of TOP) clean[k] = s[k];
  return JSON.parse(JSON.stringify(clean));
}
