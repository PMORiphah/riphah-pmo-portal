// PMO Simulation: receives the live-data snapshot and the site-visit media from the PMO's signed-in
// portal tab (protocol v2, contract §C), and asks that tab for a fresh one (Refresh data).
// Owner: B2. The sending side is src/simBridge.js.
//
// One-time channel 'pmo-sim-<nonce>' (HAND; the nonce comes from the address the portal opened).
// Every message carries v:2 and the nonce; v1 messages are refused.
//   sim    → { type:'hello', v:2, nonce, build }                     backoff 250 ms × 2^n (max 2 s) until the portal answers
//   portal → { type:'progress', v:2, nonce, phase, media }            while the portal prepares (any number)
//   portal → { type:'manifest', … }                                   exactly one
//   portal → { type:'tables', part, of, tables } · { type:'responses', part, of, items } · { type:'rpc', … }
//   portal → { type:'media', item }                                   one per item, key order (items marked reuse are not sent)
//   portal → { type:'done', fingerprint, counts }
//   sim    → { type:'ok', v:2, nonce, fingerprint } | { type:'refused', v:2, nonce, code, reason }
// Refresh: the sim opens 'pmo-sim-<nonce>.<req>' first, then sends { type:'refresh', req, refreshKey } on
// HAND; the portal answers the same sequence (from progress to done) on the .<req> channel, and the sim
// answers ok/refused there. Exit sends { type:'bye', refreshKey } on HAND.
//
// The manifest's mode is "live" (the PMO's own fresh read; share null) or "shared" (a copy the PMO
// shared with guests, sent by a guest's portal tab from the stored files; share = { id, sharedAt,
// expiresAt, voice }). A shared copy is checked against its expiry instead of the live 60-minute rule,
// and is never refreshed. The portal may refuse a shared launch with withdrawn, expired or build-share.
//
// Everything is checked as it arrives and once more as a whole (src/sim/live/validate.js); anything
// unexpected rejects the whole hand-over (fail closed), and the portal is told why (codes and check
// names only, never data). The data lives only in this page's memory.
import { TABLES, CAPS } from "./live/schema.js";
import { validateSnapshot, validateMediaItem, ValidationError, MEDIA_MIMES, sharedFreshness } from "./live/validate.js";

export { sniff } from "./live/validate.js";

export const TIMEOUTS = Object.freeze({
  first: 30000,          // the first portal message after the first hello (media may still be finishing)
  idle: 90000,           // between portal messages
  total: 600000,         // the whole hand-over
  refreshFirst: 6000,    // the first message on the reply channel after 'refresh'
  refreshTotal: 300000,  // the whole refresh
});
export const TEXT = Object.freeze({
  timeout: "The data did not arrive from the PMO portal in time.",
  portalGone: "The portal tab is closed or signed out. Close this tab and press Simulation in the portal again.",
  build: "Reload the portal tab, then press Simulation again.",
  review: "Something you approved in the launcher has changed. Press Simulation in the portal again to review it.",
  busy: "A refresh is already running.",
  // A shared copy (guests).
  withdrawn: "The PMO has stopped sharing this simulation.",
  buildShare: "This simulation was shared before the latest portal update, so it cannot play on this version. The PMO will share it again.",
  sharedAgain: "Close this tab and press Simulation in the portal again. If it keeps failing, tell the PMO.",
  sharedNoRefresh: "A shared simulation keeps the data it was shared with.",
});
/** The portal's refusals of a shared launch, in this page's words. */
export const SHARED_REFUSALS = Object.freeze({ withdrawn: TEXT.withdrawn, expired: TEXT.withdrawn, "build-share": TEXT.buildShare });

export class HandoffError extends Error {
  /** code: no-nonce | used | timeout | protocol | build | media-missing | portal-gone | portal-refused | no-handover | busy
   *  | any validation code (schema, type, size, key, secret, mask, response, media, invariant, fingerprint, plan, stale).
   *  portalCode: the portal's own code when it refused (signed-out, review-needed, busy, limit, failed; for a shared
   *  copy also withdrawn, expired, build-share). mode: "live" | "shared" once the manifest said so, else null. */
  constructor(code, message, portalCode = null) {
    super(message || code);
    this.name = "HandoffError";
    this.code = code;
    this.portalCode = portalCode;
    this.mode = null;
  }
}
const fail = (code, msg) => { throw new HandoffError(code, msg); };

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/;
const MEDIA_KEY_RE = /^m\d{3}$/;
const PARTS_MAX = 64;
const TABLE_NAMES = Object.keys(TABLES);
const nonNegInt = (v, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= 0 && v <= max;
const exactKeys = (m, keys, what) => {
  for (const k of Object.keys(m)) if (!keys.includes(k)) fail("protocol", `${what}: field ${String(k).slice(0, 32)}`);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(m, k)) fail("protocol", `${what}: no ${k}`);
};
// A reason the portal sends with a refusal is shown only if it is short, plain text.
function safeText(s, max = 300) {
  if (typeof s !== "string" || s.length < 1 || s.length > max) return null;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0x3c || c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f)
      || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return null;
  }
  return s;
}

const MANIFEST_KEYS = ["type", "v", "nonce", "build", "takenAt", "readMs", "tz", "pmo", "mask", "testAccounts", "overrides",
  "leftOut", "failed", "counts", "bytes", "media", "plan", "invariants", "fingerprint", "code", "refreshKey", "parts", "mode", "share"];
const MODES = new Set(["live", "shared"]);
const SHARE_KEYS = ["id", "sharedAt", "expiresAt", "voice"];
const msTime = (v) => Number.isSafeInteger(v) && v > 0;
/** The manifest's mode and share: live carries null; shared carries exactly { id, sharedAt, expiresAt, voice }. */
function checkMode(m) {
  if (typeof m.mode !== "string" || !MODES.has(m.mode)) fail("protocol", "manifest: mode");
  if (m.mode === "live") {
    if (m.share !== null) fail("protocol", "manifest: a live hand-over carries no share");
    return null;
  }
  const s = m.share;
  if (!isObj(s)) fail("protocol", "manifest: share");
  exactKeys(s, SHARE_KEYS, "manifest share");
  if (typeof s.id !== "string" || !UUID_RE.test(s.id)) fail("protocol", "manifest share: id");
  if (!msTime(s.sharedAt) || !msTime(s.expiresAt) || s.expiresAt <= s.sharedAt) fail("protocol", "manifest share: times");
  if (!Number.isFinite(m.takenAt) || s.expiresAt <= m.takenAt) fail("protocol", "manifest share: expiry before the read");
  if (s.voice !== "on" && s.voice !== "off") fail("protocol", "manifest share: voice");
  return { id: s.id, sharedAt: s.sharedAt, expiresAt: s.expiresAt, voice: s.voice };
}
const PORTAL_TYPES = new Set(["progress", "manifest", "tables", "responses", "rpc", "media", "done", "refused"]);
const OWN_TYPES = new Set(["hello", "ok", "refresh", "bye"]);   // ours: never handled as portal messages
const PROGRESS_PHASES = new Set(["media", "reading", "checking"]);

/** The build this page runs: the basename of the entry chunk in <meta name="pmo-sim-entry">, else "dev". */
export function simBuild() {
  try {
    const c = typeof document !== "undefined" ? document.querySelector('meta[name="pmo-sim-entry"]')?.getAttribute("content") : null;
    if (c) return c.split("?")[0].split("/").pop();
  } catch { /* ignore */ }
  return "dev";
}

// ── module state (one hand-over per page) ────────────────────────────────────
const S = { nonce: null, hand: null, build: null, refreshKey: null, started: false, done: false, refreshing: false, mode: null };
const channels = new Set();
function openChannel(name) {
  const ch = new BroadcastChannel(name);
  channels.add(ch);
  return ch;
}
function closeChannel(ch, later = 0) {
  if (!ch) return;
  const close = () => { channels.delete(ch); try { ch.onmessage = null; ch.onmessageerror = null; ch.close(); } catch { /* ignore */ } };
  if (later) setTimeout(close, later); else close();
}
const post = (ch, m) => { try { ch.postMessage(m); return true; } catch { return false; } };
/** Posts one message on HAND from a short-lived channel object. */
function postHand(m) {
  if (!S.hand) return false;
  const ch = openChannel(S.hand);
  const ok = post(ch, m);
  closeChannel(ch, 1000);                     // delivery is queued at post time; closed a little later anyway
  return ok;
}

/**
 * The receiving state machine for one sequence (first hand-over or a refresh).
 * held: Map(attachmentId → { key, attachmentId, mime, size, sha256, blob }) of items this page already has
 * (empty for the first hand-over: then any 'reuse' entry is refused).
 */
function receiver({ nonce, build, held, refreshKey, onProgress, expectMode = null }) {
  let manifest = null, rpc = null, finished = false, mode = null, share = null;
  const tables = {};
  const gotTables = new Set(), gotResp = new Set();
  const responses = [];
  const media = new Map();                     // key → validated item (sent in this sequence)
  let mediaBytes = 0;
  let manifestMedia = [];                      // [{ attachmentId, key, mime, size, sha256 }] (reuse flag removed)
  const reuseKeys = new Set();
  const progress = (p) => { try { onProgress?.(p); } catch { /* ignore */ } };
  const partsDone = () => manifest && gotTables.size === manifest.parts.tables && gotResp.size === manifest.parts.responses;
  const sentMedia = () => manifestMedia.filter((m) => !reuseKeys.has(m.key));

  function onManifest(m) {
    if (manifest) fail("protocol", "a second manifest");
    if (typeof m.build !== "string" || m.build !== build) fail("build", TEXT.build);
    exactKeys(m, MANIFEST_KEYS, "manifest");
    const sh = checkMode(m);
    if (expectMode && m.mode !== expectMode) fail("protocol", "manifest: another mode");
    mode = m.mode;
    share = sh;
    if (typeof m.refreshKey !== "string" || !UUID_RE.test(m.refreshKey)) fail("protocol", "manifest: refreshKey");
    if (refreshKey && m.refreshKey !== refreshKey) fail("protocol", "manifest: another launch");
    if (!isObj(m.parts)) fail("protocol", "manifest: parts");
    exactKeys(m.parts, ["tables", "responses"], "manifest parts");
    if (!nonNegInt(m.parts.tables, PARTS_MAX) || m.parts.tables < 1 || !nonNegInt(m.parts.responses, PARTS_MAX)) fail("protocol", "manifest: parts");
    if (!isObj(m.counts)) fail("protocol", "manifest: counts");
    exactKeys(m.counts, TABLE_NAMES, "manifest counts");
    for (const t of TABLE_NAMES) if (!nonNegInt(m.counts[t], TABLES[t].rows)) fail("size", `manifest: ${t} rows`);
    if (!Array.isArray(m.media) || m.media.length > CAPS.mediaCount) fail("media", "manifest: media list");
    let bytes = 0;
    manifestMedia = m.media.map((e, i) => {
      if (!isObj(e)) fail("media", "manifest: media entry");
      const keys = Object.keys(e);
      for (const k of keys) if (!["attachmentId", "key", "mime", "size", "sha256", "reuse"].includes(k)) fail("media", "manifest: media field");
      if (typeof e.key !== "string" || !MEDIA_KEY_RE.test(e.key) || typeof e.attachmentId !== "string" || !UUID_RE.test(e.attachmentId)
        || !MEDIA_MIMES.includes(e.mime) || !Number.isInteger(e.size) || e.size < 1 || e.size > CAPS.mediaItem
        || typeof e.sha256 !== "string" || !HEX64_RE.test(e.sha256)) fail("media", `manifest: media entry ${i + 1}`);
      if (e.reuse !== undefined) {
        if (e.reuse !== true) fail("media", "manifest: reuse");
        const h = held.get(e.attachmentId);
        if (!h || h.sha256 !== e.sha256 || h.mime !== e.mime || h.size !== e.size) {
          fail("media-missing", "A photo or video the portal did not send again is not held here.");
        }
        reuseKeys.add(e.key);
      }
      bytes += e.size;
      return { attachmentId: e.attachmentId, key: e.key, mime: e.mime, size: e.size, sha256: e.sha256 };
    });
    if (bytes > CAPS.mediaTotal) fail("media", "manifest: more than 150 MB");
    manifest = m;
    progress({ phase: "receiving", parts: { got: 0, of: m.parts.tables + m.parts.responses }, items: { got: 0, of: sentMedia().length } });
  }

  function onPart(m, kind) {
    if (!manifest) fail("protocol", `${kind} before the manifest`);
    const of = kind === "tables" ? manifest.parts.tables : manifest.parts.responses;
    const got = kind === "tables" ? gotTables : gotResp;
    exactKeys(m, ["type", "v", "nonce", "part", "of", kind === "tables" ? "tables" : "items"], kind);
    if (m.of !== of || !Number.isInteger(m.part) || m.part < 1 || m.part > of || got.has(m.part)) fail("protocol", `${kind}: part`);
    if (kind === "responses" && gotTables.size !== manifest.parts.tables) fail("protocol", "responses before every table");
    if (rpc) fail("protocol", `${kind} after rpc`);
    got.add(m.part);
    if (kind === "tables") {
      if (!isObj(m.tables)) fail("protocol", "tables: not an object");
      for (const [t, rows] of Object.entries(m.tables)) {
        if (!TABLES[t]) fail("schema", `unknown table ${String(t).slice(0, 40)}`);
        if (Object.prototype.hasOwnProperty.call(tables, t)) fail("protocol", `table ${t} sent twice`);
        if (!Array.isArray(rows) || rows.length !== manifest.counts[t]) fail("protocol", `table ${t}: rows differ from the manifest`);
        tables[t] = rows;
      }
    } else {
      if (!Array.isArray(m.items) || responses.length + m.items.length > CAPS.responses) fail("size", "responses");
      responses.push(...m.items);
    }
    progress({ phase: "receiving", parts: { got: gotTables.size + gotResp.size, of: manifest.parts.tables + manifest.parts.responses },
      items: { got: media.size, of: sentMedia().length } });
  }

  function onRpc(m) {
    if (!manifest || !partsDone()) fail("protocol", "rpc before every part");
    if (rpc) fail("protocol", "a second rpc");
    exactKeys(m, ["type", "v", "nonce", "project_has_deliverables"], "rpc");
    if (!Array.isArray(m.project_has_deliverables)) fail("schema", "rpc");
    rpc = { project_has_deliverables: m.project_has_deliverables };
  }

  async function onMedia(m) {
    if (!rpc) fail("protocol", "media before rpc");
    exactKeys(m, ["type", "v", "nonce", "item"], "media");
    const it = m.item;
    if (!isObj(it) || typeof it.key !== "string") fail("media", "item");
    const e = manifestMedia.find((x) => x.key === it.key);
    if (!e) fail("media", `${it.key.slice(0, 8)}: not listed`);
    if (reuseKeys.has(it.key)) fail("media", `${it.key}: marked as already held`);
    if (media.has(it.key)) fail("media", `${it.key}: sent twice`);
    const partial = { media: manifestMedia, tables: { project_attachments: tables.project_attachments || [] } };
    const ok = await validateMediaItem(it, partial);
    mediaBytes += ok.size;
    if (mediaBytes > CAPS.mediaTotal) fail("media", "more than 150 MB");
    media.set(ok.key, ok);
    progress({ phase: "receiving", parts: { got: gotTables.size + gotResp.size, of: manifest.parts.tables + manifest.parts.responses },
      items: { got: media.size, of: sentMedia().length } });
  }

  async function onDone(m) {
    if (!rpc) fail("protocol", "done before rpc");
    exactKeys(m, ["type", "v", "nonce", "fingerprint", "counts"], "done");
    if (m.fingerprint !== manifest.fingerprint) fail("fingerprint", "the end of the hand-over names another snapshot");
    if (!isObj(m.counts)) fail("protocol", "done: counts");
    exactKeys(m.counts, ["tables", "responses", "media"], "done counts");
    if (m.counts.tables !== Object.keys(tables).length || m.counts.tables !== TABLE_NAMES.length) fail("protocol", "done: tables count");
    if (m.counts.responses !== responses.length) fail("protocol", "done: responses count");
    if (m.counts.media !== media.size) fail("protocol", "done: media count");
    for (const e of sentMedia()) if (!media.has(e.key)) fail("media", `${e.key}: did not arrive`);
    progress({ phase: "validating" });
    const snapshot = {
      v: 2, build: manifest.build, takenAt: manifest.takenAt, readMs: manifest.readMs, tz: manifest.tz, pmo: manifest.pmo,
      mask: manifest.mask, testAccounts: manifest.testAccounts, overrides: manifest.overrides, leftOut: manifest.leftOut,
      failed: manifest.failed, tables, responses, rpc, media: manifestMedia, plan: manifest.plan, invariants: manifest.invariants,
      fingerprint: manifest.fingerprint, code: manifest.code, bytes: manifest.bytes,
    };
    // Live: the 60-minute, same-day rule (inside validateSnapshot). Shared: the share's own expiry.
    const clean = await validateSnapshot(snapshot, { build, now: mode === "live" ? Date.now() : undefined });
    if (mode === "shared") {
      const f = sharedFreshness(clean.takenAt, share.expiresAt, Date.now());
      if (f.state === "refused") fail("stale", f.text);
    }
    // Every item of the snapshot, by its key in this snapshot: the ones just sent and the ones held.
    const items = new Map();
    for (const e of clean.media) {
      if (reuseKeys.has(e.key)) {
        const h = held.get(e.attachmentId);
        items.set(e.key, { key: e.key, attachmentId: e.attachmentId, mime: h.mime, size: h.size, sha256: h.sha256, blob: h.blob });
      } else items.set(e.key, media.get(e.key));
    }
    finished = true;
    return { snapshot: clean, items, refreshKey: manifest.refreshKey, mode, share: share ? { ...share } : null };
  }

  /** Handles one message; resolves the result after 'done', else null. */
  async function handle(m) {
    if (finished) return null;
    if (!isObj(m) || m.nonce !== nonce || typeof m.type !== "string") return null;   // not for this hand-over
    if (OWN_TYPES.has(m.type)) return null;
    if (m.v !== 2) fail("protocol", "an older version of the hand-over (v1) is refused");
    if (!PORTAL_TYPES.has(m.type)) fail("protocol", `unknown message ${m.type.slice(0, 24)}`);
    switch (m.type) {
      case "progress": {
        if (manifest) return null;
        exactKeys(m, ["type", "v", "nonce", "phase", "media"], "progress");
        if (!PROGRESS_PHASES.has(m.phase) || !isObj(m.media)) fail("protocol", "progress");
        const md = m.media;
        if (!nonNegInt(md.done, 100000) || !nonNegInt(md.total, 100000) || !nonNegInt(md.bytes)) fail("protocol", "progress: media");
        progress({ phase: "portal-" + m.phase, media: { done: md.done, total: md.total, bytes: md.bytes } });
        return null;
      }
      case "manifest": onManifest(m); return null;
      case "tables": onPart(m, "tables"); return null;
      case "responses": onPart(m, "responses"); return null;
      case "rpc": onRpc(m); return null;
      case "media": await onMedia(m); return null;
      case "done": return onDone(m);
      case "refused": {
        const code = typeof m.code === "string" ? m.code.slice(0, 32) : "failed";
        // A shared copy the PMO withdrew, that expired, or that predates this build: in this page's words.
        if (Object.prototype.hasOwnProperty.call(SHARED_REFUSALS, code)) {
          mode = "shared";
          throw new HandoffError("portal-refused", SHARED_REFUSALS[code], code);
        }
        throw new HandoffError("portal-refused", safeText(m.reason) || "The portal stopped the hand-over.", code);
      }
      default: return null;
    }
  }
  return { handle, mode: () => mode };
}

const codeOf = (e) => (e instanceof HandoffError || e instanceof ValidationError ? e.code : "protocol");
const reasonOf = (e) => (e instanceof ValidationError ? e.reason : e?.message || "the hand-over failed");
/** Turns any error into a HandoffError (validation codes are kept). */
function asHandoffError(e) {
  if (e instanceof HandoffError) return e;
  if (e instanceof ValidationError) return Object.assign(new HandoffError(e.code, e.reason), { check: e.reason });
  return new HandoffError("protocol", String(e?.message || e || "the hand-over failed").slice(0, 200));
}

/**
 * Waits for the portal's hand-over. Resolves { snapshot (validated), items: Map(key → item with blob),
 * refreshKey, mode: "live" | "shared", share: null | { id, sharedAt, expiresAt, voice } } or rejects
 * with a HandoffError (err.mode once known; the portal has been sent 'refused' with the code first).
 * onProgress({ phase: waiting | portal-media | portal-reading | portal-checking | receiving | validating, media?, parts?, items? })
 * Options nonce / build / timeouts exist for tests; the page uses window.__PMO_SIM__.nonce and simBuild().
 */
export function waitForSnapshot({ onProgress, timeouts = {}, nonce: nonceOpt, build: buildOpt } = {}) {
  const sim = typeof window !== "undefined" ? window.__PMO_SIM__ : null;
  const nonce = nonceOpt || (sim && sim.ok ? sim.nonce : null);
  if (!nonce) return Promise.reject(new HandoffError("no-nonce", "No hand-over in the address"));
  if (S.started) return Promise.reject(new HandoffError("used", "This page has already received its data once."));
  S.started = true;
  S.nonce = nonce;
  S.hand = "pmo-sim-" + nonce;
  S.build = buildOpt || simBuild();
  const T = { ...TIMEOUTS, ...timeouts };

  return new Promise((resolve, reject) => {
    const ch = openChannel(S.hand);
    const timers = { first: 0, idle: 0, total: 0, hello: 0 };
    let finished = false, heard = false, queue = Promise.resolve();
    const rx = receiver({ nonce, build: S.build, held: new Map(), refreshKey: null, onProgress });
    const end = (err, value) => {
      if (finished) return;
      finished = true;
      Object.values(timers).forEach(clearTimeout);
      if (err) {
        post(ch, { type: "refused", v: 2, nonce, code: err.code, reason: String(err.message || err.code).slice(0, 300) });
        closeChannel(ch, 1000);
        reject(err);
      } else {
        S.refreshKey = value.refreshKey;
        S.done = true;
        post(ch, { type: "ok", v: 2, nonce, fingerprint: value.snapshot.fingerprint });
        closeChannel(ch, 1000);
        resolve(value);
      }
    };
    const timeout = () => end(new HandoffError("timeout", TEXT.timeout));
    const armIdle = () => { clearTimeout(timers.idle); timers.idle = setTimeout(timeout, T.idle); };
    timers.total = setTimeout(timeout, T.total);
    let helloN = 0;
    const hello = () => {
      if (heard || finished) return;
      post(ch, { type: "hello", v: 2, nonce, build: S.build });
      if (helloN === 0) timers.first = setTimeout(() => { if (!heard) timeout(); }, T.first);
      helloN += 1;
      timers.hello = setTimeout(hello, Math.min(2000, 250 * 2 ** (helloN - 1)));   // 250, 500, 1000, 2000 ms …
    };
    ch.onmessage = (e) => {
      const m = e.data;
      if (finished) return;
      if (isObj(m) && m.nonce === nonce && PORTAL_TYPES.has(m.type)) {
        if (!heard) { heard = true; clearTimeout(timers.first); clearTimeout(timers.hello); }
        armIdle();
      }
      queue = queue.then(() => rx.handle(m)).then((r) => { if (r) end(null, r); }, (err) => end(asHandoffError(err)));
    };
    ch.onmessageerror = () => end(new HandoffError("protocol", "a message could not be read"));
    try { onProgress?.({ phase: "waiting" }); } catch { /* ignore */ }
    hello();
  });
}

/**
 * Asks the portal tab for a fresh snapshot (contract §C.2). held: Map(attachmentId → item with blob)
 * of the media this page holds now (reused when unchanged). Resolves { snapshot, items } (validated;
 * items keyed by the new snapshot's keys) or rejects with a HandoffError; the current snapshot is
 * never touched here.
 */
export function requestRefresh({ held = new Map(), onProgress, timeouts = {} } = {}) {
  if (!S.done || !S.refreshKey || !S.hand) return Promise.reject(new HandoffError("no-handover", TEXT.portalGone));
  if (S.refreshing) return Promise.reject(new HandoffError("busy", TEXT.busy));
  S.refreshing = true;
  const T = { ...TIMEOUTS, ...timeouts };
  const nonce = S.nonce;
  const req = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    // The reply channel first, so nothing the portal sends on it is missed.
    const reply = openChannel(S.hand + "." + req);
    const timers = { first: 0, idle: 0, total: 0 };
    let finished = false, heard = false, queue = Promise.resolve();
    const rx = receiver({ nonce, build: S.build, held, refreshKey: S.refreshKey, onProgress });
    const end = (err, value) => {
      if (finished) return;
      finished = true;
      S.refreshing = false;
      Object.values(timers).forEach(clearTimeout);
      if (err) {
        if (err.code !== "portal-refused" && err.code !== "portal-gone") {
          post(reply, { type: "refused", v: 2, nonce, code: err.code, reason: String(err.message || err.code).slice(0, 300) });
        }
        closeChannel(reply, 1000);
        reject(err);
      } else {
        post(reply, { type: "ok", v: 2, nonce, fingerprint: value.snapshot.fingerprint });
        closeChannel(reply, 1000);
        resolve({ snapshot: value.snapshot, items: value.items });
      }
    };
    const gone = () => end(new HandoffError("portal-gone", TEXT.portalGone));
    timers.first = setTimeout(() => { if (!heard) gone(); }, T.refreshFirst);
    timers.total = setTimeout(gone, T.refreshTotal);
    reply.onmessage = (e) => {
      const m = e.data;
      if (finished) return;
      if (isObj(m) && m.nonce === nonce && PORTAL_TYPES.has(m.type)) {
        heard = true;
        clearTimeout(timers.first);
        clearTimeout(timers.idle);
        timers.idle = setTimeout(gone, T.idle);
      }
      queue = queue.then(() => rx.handle(m)).then((r) => { if (r) end(null, r); }, (err) => {
        const h = asHandoffError(err);
        if (h.code === "portal-refused") {
          // The portal's own refusals, in this page's words where the cause is known.
          const pc = h.portalCode;
          const msg = pc === "signed-out" ? TEXT.portalGone : pc === "review-needed" ? TEXT.review : pc === "busy" ? TEXT.busy : h.message;
          end(new HandoffError("portal-refused", msg, pc));
        } else end(h);
      });
    };
    reply.onmessageerror = () => end(new HandoffError("protocol", "a message could not be read"));
    try { onProgress?.({ phase: "waiting" }); } catch { /* ignore */ }
    if (!postHand({ type: "refresh", v: 2, nonce, req, refreshKey: S.refreshKey })) gone();
  });
}

/** Tells the portal tab this launch is over (it stops its refresh listener). Safe to call more than once. */
export function sendBye() {
  if (!S.done || !S.refreshKey) return false;
  const ok = postHand({ type: "bye", v: 2, nonce: S.nonce, refreshKey: S.refreshKey });
  S.refreshKey = null;
  return ok;
}

/** Closes every channel this page opened (Exit). */
export function closeAll() {
  for (const ch of [...channels]) closeChannel(ch);
}

/** For tests: the channel names and flags (no data). */
export const _stateForTests = () => ({ nonce: S.nonce, hand: S.hand, build: S.build, started: S.started, done: S.done,
  refreshing: S.refreshing, hasRefreshKey: !!S.refreshKey });

/** For tests: forget the module state (the page itself never calls this). */
export function _resetForTests() {
  closeAll();
  Object.assign(S, { nonce: null, hand: null, build: null, refreshKey: null, started: false, done: false, refreshing: false });
}

export { codeOf, reasonOf };
