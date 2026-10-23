// PMO Simulation shared with senior management (guests): the portal-tab side. Spec: the guest
// sharing plan, sections B, D and E (approved for build, 19 Oct 2026).
//
// What is shared is the PMO's own frozen snapshot, exactly as Start would hand it over (every
// launcher choice is inside it and covered by its fingerprint), plus the re-encoded photos and
// videos, stored as files in the private bucket 'sim-shares':
//   <share id>/snapshot.json   the snapshot (the fields src/sim/live/validate.js accepts, nothing else)
//   <share id>/<media key>     one file per item (m001, m002 …), the bytes exactly as hashed
// with one small row in sim_shares and one row per guest in sim_share_recipients
// (supabase/migrations/20261019_sim_shares.sql). Row-level security decides who may read them:
// the PMO, and active guests who receive an active share that has not expired. The live portal and
// /preview/ share one database, so a share belongs to the site it was made on (sim_shares.site, the
// base path) and every read here is limited to this site's.
//
// Guests (src/App.jsx): pollShare at sign-in, every 2 minutes and on return to the tab. One click
// (launchShared) opens the simulation tab inside the click, downloads the stored files under the
// guest's own token, checks them as the simulation tab will (shape, secrets, masking, fingerprint,
// plan, and each file's type, size and SHA-256), and hands them over with protocol v2
// (src/simBridge.js), marked "shared". Nothing is read live and no refresh listener is started.
// The only write is the guest's own recipient row (last_used_at; the database stamps the time,
// the number of starts and the first opening).
//
// PMO (src/SimLauncher.jsx): createShare reads the snapshot afresh (as Start does), uploads the
// files, then shares it in one step (sim_share_activate); addRecipients, removeRecipient,
// stopSharing and replaceShare manage it; loadShareState shows it. The PMO's choices are kept in
// settings.simulation_share (PMO only) so a share can be made again after a portal update.
//
// The data is held in memory only, during the hand-over. Nothing is kept in browser storage.
// This file is small on purpose: a guest's portal loads it at sign-in, and the hand-over modules
// (simBridge.js, the validator, the snapshot reader) load only once a share exists (preloadShared).
import { loadSession } from "./auth.js";
import { fileLink } from "./fileLinks.js";

export const SHARE_DAYS = 7;                 // a share plays for 7 days after its data was read
const DAY_MS = 86400000;
const JSON_MAX = 6 * 1024 * 1024;            // sim_shares.json_bytes cap
const WORKERS = 4;
const BUCKET = "sim-shares";
const SETTING = "simulation_share";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_COLUMNS = "id,status,as_at,expires_at,build,code,voice,media_count,media_bytes,json_bytes,fingerprint,activated_at,created_at";
const PMO_COLUMNS = SHARE_COLUMNS + ",site,files_removed_at";

export const TEXT = Object.freeze({
  loading: "The simulation is still loading. Try again in a moment.",
  updating: "The portal was updated after the PMO shared this simulation, so this copy no longer plays. The PMO will share it again.",
  reload: "Reload the portal, then press Simulation.",
  expired: "This shared simulation has expired. The PMO can share it again.",
  withdrawn: "The PMO has stopped sharing this simulation.",
  noTab: "The simulation tab did not open. Allow pop-ups for this site and press Simulation again.",
  reloadTab: "Reload the portal tab, then press Simulation again.",
  signedOut: "The portal tab is signed out. Sign in again, then press Simulation.",
  stopped: "Stopped: the portal tab signed out.",
  notConfirmed: "The simulation tab did not confirm the hand-over. If it shows a problem, close it and press Simulation again.",
  refused: "The simulation tab refused the hand-over.",
  broken: "The shared simulation did not pass its checks. Tell the PMO.",
  network: "The shared simulation could not be downloaded. Check the connection and press Simulation again.",
  reviewChanged: "Something you approved here changed in the portal just now. Check the item again below, then press Share again.",
  forbidden: "The database refused it: only the PMO can share a simulation.",
  upload: "A file could not be uploaded. Check the connection and press Share again.",
  noGuests: "Tick at least one guest.",
  tooLarge: "This simulation is larger than a share accepts (6 MB of data).",
  notSetUp: "Sharing is not available yet: the database change it needs has not been applied.",
  staleTab: "The portal was updated after this tab was opened. Reload this tab, then share again.",
  replaced: "The PMO has shared a newer copy of this simulation with you: press Simulation again.",
  alreadyEnded: "This copy was no longer shared (it had been replaced or stopped). The window now shows what is shared.",
  unsure: "The answer to the last step was lost, so it is not certain the simulation was shared. Close this window and open Simulation again to see what is shared.",
});

/** code: loading | build | build-share | expired | withdrawn | replaced | no-tab | signed-out | stopped | refused | snapshot
 *  | media | network | review-changed | forbidden | upload | no-guests | size | not-set-up | stale-tab | unsure | failed. */
export class ShareError extends Error {
  constructor(code, message) { super(message || code); this.name = "ShareError"; this.code = code; }
}
// What the simulation tab is told when this tab stops a shared launch (it words withdrawn,
// expired and build-share itself).
const PORTAL_CODE = { withdrawn: "withdrawn", expired: "expired", replaced: "replaced", "build-share": "build-share", "signed-out": "signed-out", stopped: "signed-out" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const iso = (ms) => new Date(ms).toISOString();
// Vite replaces the exact token import.meta.env.BASE_URL at build time; under Node (tests) there is no env.
const baseUrl = () => (import.meta.env && import.meta.env.BASE_URL) || "/";
/** This portal site (its base path): the live portal and /preview/ each have their own share. */
export const siteOf = () => baseUrl();

/** The portal build this site serves now (the entry file its index.html names), or null when it
 *  cannot be told (offline, a development server). A tab opened before a deploy still runs the old
 *  build: what it shares would play nowhere, and its own check of a share would mislead. */
export async function servedBuild() {
  try {
    const r = await fetch(baseUrl() + "index.html", { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return null;
    const m = /<script\b[^>]*\btype="module"[^>]*\bsrc="[^"]*\/assets\/(index-[A-Za-z0-9_-]+\.js)[?"]/.exec(await r.text());
    return m ? m[1] : null;
  } catch { return null; }
}

// ── dates (Pakistan time, built from parts so every engine prints the same) ──
const PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short",
  year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const partsOf = (ms) => Object.fromEntries(PARTS.formatToParts(ms).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
const hourOf = (p) => (p.hour === "24" ? "00" : p.hour);
/** "19 Oct, 14:05 PKT" */
export function asOfText(at) {
  const ms = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  const p = partsOf(ms);
  return `${p.day} ${p.month}, ${hourOf(p)}:${p.minute} PKT`;
}
/** "Mon 26 Oct" */
export function dayText(at) {
  const ms = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  const p = partsOf(ms);
  return `${p.weekday} ${p.day} ${p.month}`;
}

// ── the share row, as both sides see it ──────────────────────────────────────
function shareOf(s) {
  if (!isObj(s) || !isUuid(s.id)) return null;
  return {
    id: s.id, status: s.status || "active", as_at: s.as_at, expires_at: s.expires_at, build: String(s.build || ""),
    code: String(s.code || ""), voice: s.voice === "off" ? "off" : "on", fingerprint: String(s.fingerprint || ""),
    media_count: Number(s.media_count) || 0, media_bytes: Number(s.media_bytes) || 0, json_bytes: Number(s.json_bytes) || 0,
    activated_at: s.activated_at ?? null, created_at: s.created_at ?? null,
    site: typeof s.site === "string" ? s.site : null, files_removed_at: s.files_removed_at ?? null,
  };
}
const expiresMs = (share) => Date.parse(share?.expires_at);
export const isExpired = (share, now = Date.now()) => !(expiresMs(share) > now);

// ── guests: the sign-in poll (no other module needed) ────────────────────────
/** The poll's request: the signed-in guest's own, not-removed recipient row with its share. RLS on
 *  sim_shares keeps only an active, unexpired share they receive, and !inner drops the rest (and
 *  another site's share). */
export function pollPath(userId, site = siteOf()) {
  return `/rest/v1/sim_share_recipients?user_id=eq.${encodeURIComponent(userId)}&removed=is.false`
    + `&select=share_id,seen_at,opened_at,sim_shares!inner(${SHARE_COLUMNS})`
    + `&sim_shares.site=eq.${encodeURIComponent(site)}&order=added_at.desc&limit=1`;
}
/** get(path) → the parsed JSON (the App's supa with the user's token). → null | { share, recipient: { seen_at, opened_at } } */
export async function pollShare({ get, userId, site = siteOf() }) {
  if (typeof get !== "function" || !isUuid(userId)) return null;
  const rows = await get(pollPath(userId, site));
  const r = Array.isArray(rows) ? rows[0] : null;
  const share = shareOf(r?.sim_shares);
  if (!share || share.status !== "active" || isExpired(share) || (share.site != null && share.site !== site)) return null;
  return { share, recipient: { seen_at: r.seen_at ?? null, opened_at: r.opened_at ?? null } };
}

// ── the hand-over modules, loaded once a share exists ────────────────────────
let engine = null, enginePromise = null;
/** Loads simBridge.js, the validator and the snapshot reader (once). */
export function preloadShared() {
  if (engine) return Promise.resolve(engine);
  if (!enginePromise) {
    enginePromise = Promise.all([import("./simBridge.js"), import("./sim/live/validate.js"), import("./sim/live/snapshot.js")])
      .then(([bridge, validate, snapshot]) => (engine = { bridge, validate, snapshot }))
      .catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}
export const sharedReady = () => !!engine;

/** Whether this portal tab can play the share: "ok"; "updating" (the portal was updated after it
 *  was shared: the PMO must share it again); "reload" (it was shared after this tab loaded: reload);
 *  "loading" before preloadShared() has finished. */
export function buildState(share) {
  if (!engine) return "loading";
  if (!share) return null;
  if (share.build === engine.bridge.portalBuild()) return "ok";
  const made = Date.parse(share.activated_at || share.created_at);
  let loadedAt = 0;
  try { loadedAt = performance.timeOrigin || 0; } catch { /* ignore */ }
  return Number.isFinite(made) && made > loadedAt ? "reload" : "updating";
}

// ── requests (the signed-in user's own token) ────────────────────────────────
// The stored session first (renewed in place), else the App's current one; null once signed out.
function sessionNow(getSession) {
  const stored = loadSession();
  if (stored) return stored;
  try { return typeof getSession === "function" ? getSession() || null : null; } catch { return null; }
}
async function call(getSession, method, path, { body, headers = {}, signal } = {}) {
  const K = engine.bridge.shareKit;
  const tok = sessionNow(getSession)?.access_token;
  if (!tok) throw new ShareError("signed-out", TEXT.signedOut);
  const blob = typeof Blob !== "undefined" && body instanceof Blob;
  return fetch(K.origin + path, {
    method, cache: "no-store", credentials: "omit", signal,
    headers: { apikey: K.anonKey, Authorization: "Bearer " + tok, ...(body != null && !blob ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body == null ? undefined : blob ? body : JSON.stringify(body),
  });
}
function restError(status, data) {
  if (status === 401) return new ShareError("signed-out", TEXT.signedOut);
  // Before the migration: no such table (PGRST205, 42P01) or function (PGRST202, 42883).
  if (status === 404 && /^(PGRST20[25]|42P01|42883)$/.test(String(data?.code || ""))) return new ShareError("not-set-up", TEXT.notSetUp);
  if (status === 403 || data?.code === "42501") return new ShareError("forbidden", TEXT.forbidden);
  const msg = typeof data?.message === "string" && data.message.length < 300 ? data.message : `The database answered ${status}.`;
  return new ShareError("failed", msg);
}
async function rest(getSession, method, path, body, prefer = "return=minimal") {
  const r = await call(getSession, method, path, { body, headers: prefer ? { Prefer: prefer } : {} });
  const data = await r.json().catch(() => null);           // 204: no body
  if (!r.ok) throw restError(r.status, data);
  return data;
}
const storagePath = (shareId, name) => `${shareId}/${name}`;

/** One stored file of a share. 400/403/404 = not readable any more (withdrawn, replaced or expired). */
async function fetchStored(getSession, path, signal) {
  // Cloudflare R2 first (no Supabase bandwidth, see fileLinks.js); Supabase as before when it has no link or fails.
  // Every item is still checked against its SHA-256 by the caller.
  const tok = sessionNow(getSession)?.access_token;
  const r2 = tok ? await fileLink(BUCKET, path, tok) : null;
  if (r2) {
    try {
      const r = await fetch(r2, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal });
      if (r.ok) return r;
    } catch { if (signal?.aborted) throw new ShareError("stopped", TEXT.stopped); }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try { r = await call(getSession, "GET", `/storage/v1/object/authenticated/${BUCKET}/${path}`, { signal }); }
    catch (e) {
      if (e instanceof ShareError) throw e;
      if (signal?.aborted) throw new ShareError("stopped", TEXT.stopped);
      continue;                                              // a network error: once more
    }
    if (r.ok) return r;
    if (r.status === 400 || r.status === 403 || r.status === 404) throw new ShareError("withdrawn", TEXT.withdrawn);
    if (r.status === 401) throw new ShareError("signed-out", TEXT.signedOut);
  }
  throw new ShareError("network", TEXT.network);
}

/** Runs `fn` over `items`, at most `limit` at a time; stops at the first error. */
async function pool(items, limit, fn) {
  let next = 0, failed = null;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try { await fn(items[i], i); } catch (e) { failed = failed || e; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failed) throw failed;
}

// ── guests: the click ────────────────────────────────────────────────────────
const runs = new Set();                      // launches in progress: { ctrl, held }
const STATUS = { phase: "idle", media: { done: 0, total: 0, bytes: 0 }, code: null, error: null, confirmed: null };
const setStatus = (patch) => {
  Object.assign(STATUS, patch);
  try { if (typeof window !== "undefined") window.__PMO_SIM_SHARE__ = STATUS; } catch { /* ignore */ }
};

/** Ends every shared launch in this tab (sign-out): downloads stop and nothing stays in memory. */
export function stopShared() {
  for (const run of runs) { try { run.ctrl.abort(); } catch { /* ignore */ } run.held.clear(); }
}

/**
 * Plays a share. MUST be called synchronously from the click handler, after preloadShared() has
 * finished: the simulation tab is opened before anything is awaited. Nothing opens when this portal
 * tab cannot play the share (another build) or it has expired.
 * share:      the share from pollShare (or loadShareState for the PMO's own check)
 * getSession: the App's current session
 * onProgress({ phase: opening | downloading | checking | sending | confirming, media: { done, total, bytes } })
 * recheck:    async () → the share this user has now (or null); asked once when the files are refused,
 *             so a click on a copy the PMO has since replaced says so rather than "stopped sharing"
 * timing:     { hello, ok } in ms (tests only)
 * Resolves { confirmed, code, sent, bytes } or rejects with a ShareError.
 */
export function launchShared({ share, getSession, onProgress, recheck = null, timing = {} } = {}) {
  if (!engine) return Promise.reject(new ShareError("loading", TEXT.loading));
  if (!share || !isUuid(share.id)) return Promise.reject(new ShareError("withdrawn", TEXT.withdrawn));
  const state = buildState(share);
  if (state !== "ok") return Promise.reject(new ShareError("build-share", state === "reload" ? TEXT.reload : TEXT.updating));
  if (isExpired(share)) return Promise.reject(new ShareError("expired", TEXT.expired));
  const K = engine.bridge.shareKit;
  const nonce = crypto.randomUUID();
  const ch = K.openChannel("pmo-sim-" + nonce);
  // noopener, never noreferrer: the referrer is what lets the browser carry this click over to the
  // new tab, so the voice may start there without a second click.
  window.open(baseUrl() + "simulation.html#k=" + nonce, "pmo-simulation", "noopener");
  const run = { ctrl: typeof AbortController !== "undefined" ? new AbortController() : null, held: new Map() };
  runs.add(run);
  setStatus({ phase: "opening", media: { done: 0, total: share.media_count, bytes: 0 }, code: null, error: null, confirmed: null });
  return sharedHandOver({ ch, nonce, share, getSession, onProgress, run, recheck,
    helloMs: timing.hello ?? K.helloMs, okMs: timing.ok ?? K.okMs })
    .then((res) => { K.closeChannel(ch); setStatus({ phase: res.confirmed ? "ready" : "unconfirmed", confirmed: res.confirmed }); return res; },
      (e) => {
        const err = e instanceof ShareError ? e : new ShareError("failed", e?.message || TEXT.broken);
        setTimeout(() => K.closeChannel(ch), 1000);      // a refusal just posted is still delivered
        setStatus({ phase: "error", code: err.code, error: err.message });
        throw err;
      })
    .finally(() => { run.held.clear(); runs.delete(run); });
}

/** The stored snapshot and media, checked here exactly as the simulation tab will check them. */
async function download({ share, getSession, build, run, media, onItem }) {
  const { validate } = engine;
  const signal = run.ctrl?.signal;
  const r = await fetchStored(getSession, storagePath(share.id, "snapshot.json"), signal);
  const blob = await r.blob();
  if (share.json_bytes && blob.size !== share.json_bytes) throw new ShareError("snapshot", TEXT.broken + " (the data file)");
  let raw;
  try { raw = JSON.parse(await blob.text()); } catch { throw new ShareError("snapshot", TEXT.broken + " (the data file)"); }
  let clean;
  try { clean = await validate.validateSnapshot(raw, { build }); }
  catch (e) {
    if (e?.code === "build") throw new ShareError("build-share", TEXT.updating);
    throw new ShareError("snapshot", `${TEXT.broken} (${[e?.code, e?.reason].filter(Boolean).join(": ") || "check"})`);
  }
  raw = null;
  if (clean.fingerprint !== share.fingerprint || clean.takenAt !== Date.parse(share.as_at) || clean.media.length !== share.media_count) {
    throw new ShareError("snapshot", TEXT.broken + " (the files do not match the share)");
  }
  const f = validate.sharedFreshness(clean.takenAt, expiresMs(share), Date.now());
  if (f.state === "refused") throw new ShareError(f.reason === "expired" || f.reason === "age" ? "expired" : "snapshot", f.text || TEXT.expired);
  media.total = clean.media.length;
  onItem();
  await pool(clean.media, WORKERS, async (m) => {
    if (signal?.aborted) throw new ShareError("stopped", TEXT.stopped);
    const res = await fetchStored(getSession, storagePath(share.id, m.key), signal);
    const file = await res.blob();
    let ok;
    try { ok = await validate.validateMediaItem({ key: m.key, attachmentId: m.attachmentId, mime: m.mime, size: m.size, sha256: m.sha256, blob: file }, clean); }
    catch (e) { throw new ShareError("media", `${TEXT.broken} (${e?.reason || "a photo or video"})`); }
    run.held.set(m.attachmentId, { blob: ok.blob });
    media.done += 1;
    media.bytes += m.size;
    onItem();
  });
  return clean;
}

async function sharedHandOver({ ch, nonce, share, getSession, onProgress, run, recheck, helloMs, okMs }) {
  const { bridge } = engine;
  const K = bridge.shareKit;
  const build = bridge.portalBuild();
  const media = { done: 0, total: share.media_count, bytes: 0 };
  let phase = "opening";
  const report = (p) => {
    if (p) phase = p;
    setStatus({ phase, media: { ...media } });
    try { onProgress?.({ phase, media: { ...media } }); } catch { /* ignore */ }
  };
  let refused = null, gotHello;
  const hello = new Promise((r) => { gotHello = r; });
  ch.onmessage = (e) => {
    const m = e.data;
    if (!isObj(m) || m.nonce !== nonce) return;
    if (m.type === "hello") gotHello(m);
    else if (m.type === "refused" && m.v === 2) refused = m;
  };
  const helloOrNone = Promise.race([hello, sleep(helloMs).then(() => null)]);
  // Once the tab has said hello (and runs this build), it hears how the download is going, at least
  // every 4 s, so it never waits long in silence (its limits: 30 s to the first message, 90 s idle).
  let prog = null;
  helloOrNone.then((h) => {
    if (!h || h.v !== 2 || h.build !== build || prog) return;
    prog = K.progressSender(ch, nonce);
    prog.start();
    prog.update({ phase: phase === "checking" ? "checking" : "media", media: { ...media } });
  });

  report("downloading");
  let clean = null, failure = null;
  try {
    clean = await download({ share, getSession, build, run, media,
      onItem: () => { prog?.update({ phase: "media", media: { ...media } }); report(); } });
    report("checking");
  } catch (e) { failure = e; }
  // Storage refused the files: withdrawn, or replaced by a newer copy this user also receives (a
  // button from before the last poll). Asked once, so the tab and the portal say which.
  if (failure instanceof ShareError && failure.code === "withdrawn" && typeof recheck === "function") {
    const now = await Promise.race([Promise.resolve().then(recheck).catch(() => null), sleep(5000).then(() => null)]);
    if (now && isUuid(now.id) && now.id !== share.id && !isExpired(now)) failure = new ShareError("replaced", TEXT.replaced);
  }
  try {
    if (!prog) report("opening");                           // the files are here (or not): waiting for the tab
    const h = await helloOrNone;
    if (!h) throw new ShareError("no-tab", TEXT.noTab);
    if (h.v !== 2) throw new ShareError("build", TEXT.reloadTab);
    if (h.build !== build) {
      // Templates are build-specific: the simulation tab refuses this manifest and says why.
      K.post(ch, { type: "manifest", v: 2, nonce, build });
      throw new ShareError("build", TEXT.reloadTab);
    }
    prog?.stop();
    if (failure) {
      const err = failure instanceof ShareError ? failure : new ShareError("failed", failure?.message || TEXT.broken);
      K.post(ch, { type: "refused", v: 2, nonce, code: PORTAL_CODE[err.code] || "failed", reason: err.message.slice(0, 300) });
      throw err;
    }
    if (refused) throw new ShareError("refused", refused.reason || TEXT.refused);

    // The same messages as the PMO's Start, marked as a shared copy.
    const sharedAt = Date.parse(share.activated_at || share.created_at || share.as_at);
    const info = { id: share.id, sharedAt, expiresAt: expiresMs(share), voice: share.voice === "off" ? "off" : "on" };
    const { messages, sent, bytes } = bridge.messagesFor(clean, { nonce, refreshKey: crypto.randomUUID(), held: run.held, mode: "shared", share: info });
    report("sending");
    const wait = K.receipt(ch, nonce, okMs + 5000 + messages.length * 50);
    for (const m of messages) {
      if (refused) break;
      if (!K.post(ch, m)) throw new ShareError("failed", "A part of the hand-over could not be sent.");
    }
    run.held.clear();
    if (refused) throw new ShareError("refused", refused.reason || TEXT.refused);
    report("confirming");
    const r = await Promise.race([wait, sleep(okMs).then(() => null)]);
    if (r?.type === "refused") throw new ShareError("refused", r.reason || TEXT.refused);
    const confirmed = !!r && r.fingerprint === clean.fingerprint;
    // A start, on the guest's own row (the PMO's check of the shared copy has no row).
    const s = sessionNow(getSession);
    if (confirmed && s?.role === "guest" && isUuid(s.user_id)) {
      await rest(getSession, "PATCH", `/rest/v1/sim_share_recipients?share_id=eq.${share.id}&user_id=eq.${s.user_id}`,
        { last_used_at: new Date().toISOString() }).catch(() => { /* bookkeeping only */ });
    }
    return { confirmed, code: clean.code, sent, bytes, error: confirmed ? null : TEXT.notConfirmed };
  } finally {
    prog?.stop();
    run.held.clear();
  }
}

// ── PMO: the share ───────────────────────────────────────────────────────────
const mediaNames = (count) => Array.from({ length: count }, (_, i) => engine.snapshot.mediaKeyOf(i));

/** Map(name → size or null) of the files in a share's folder. */
async function listFolder(getSession, shareId) {
  const rows = await rest(getSession, "POST", `/storage/v1/object/list/${BUCKET}`,
    { prefix: shareId, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }, null);
  const out = new Map();
  for (const x of Array.isArray(rows) ? rows : []) if (x && typeof x.name === "string" && x.id) out.set(x.name, Number(x.metadata?.size) || null);
  return out;
}

/** Removes a share's files (the PMO's removal policy is needed) and records it. → true when the folder is empty. */
async function removeFiles(getSession, share) {
  const names = ["snapshot.json", ...mediaNames(share.media_count)];
  try {
    await rest(getSession, "DELETE", `/storage/v1/object/${BUCKET}`, { prefixes: names.map((n) => storagePath(share.id, n)) }, null);
  } catch { /* checked below */ }
  const left = await listFolder(getSession, share.id).catch(() => null);
  if (!left || left.size) return false;
  await rest(getSession, "PATCH", `/rest/v1/sim_shares?id=eq.${share.id}`, { files_removed_at: new Date().toISOString() }).catch(() => {});
  return true;
}

async function uploadOne(getSession, path, blob, mime) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r = null;
    try {
      r = await call(getSession, "POST", `/storage/v1/object/${BUCKET}/${path}`,
        { body: blob, headers: { "Content-Type": mime, "x-upsert": "false", "cache-control": "no-store" } });
    } catch (e) { if (e instanceof ShareError) throw e; r = null; }
    if (r?.ok) return;
    if (r) {
      const data = await r.json().catch(() => null);
      const code = String(data?.statusCode ?? r.status);
      if (code === "409") return;                           // an earlier attempt landed (uploads never overwrite)
      if (r.status === 401) throw new ShareError("signed-out", TEXT.signedOut);
      if (code === "403" || r.status === 403) throw new ShareError("forbidden", TEXT.forbidden);
    }
  }
  throw new ShareError("upload", TEXT.upload);
}

function cleanSaved(v) {
  if (!isObj(v)) return null;
  const ids = (a) => (Array.isArray(a) ? a.filter(isUuid) : []);
  return { shareId: isUuid(v.shareId) ? v.shareId : null, overrides: isObj(v.overrides) ? v.overrides : {},
    testAccounts: ids(v.testAccounts), leftOut: ids(v.leftOut), voice: v.voice === "off" ? "off" : "on", savedAt: v.savedAt ?? null };
}

/** This site's current share (the active one, expired or not), its recipients, the saved choices,
 *  and whether shared files can be removed (the PMO's removal policy; sharing waits for it).
 *  → { share | null, recipients: [{ user_id, name, username, role, is_active, added_at, seen_at, opened_at, last_used_at, counter }],
 *      saved | null, cleanupReady: boolean } */
export async function loadShareState({ getSession } = {}) {
  await preloadShared();
  const rows = await rest(getSession, "GET", `/rest/v1/sim_shares?status=eq.active&site=eq.${encodeURIComponent(siteOf())}`
    + `&select=${PMO_COLUMNS}&order=created_at.desc&limit=1`, undefined, null);
  const share = shareOf(Array.isArray(rows) ? rows[0] : null);
  let recipients = [];
  if (share) {
    const rs = await rest(getSession, "GET", `/rest/v1/sim_share_recipients?share_id=eq.${share.id}&removed=is.false`
      + "&select=user_id,added_at,seen_at,opened_at,last_used_at,counter&order=added_at.asc", undefined, null);
    const list = Array.isArray(rs) ? rs : [];
    const ids = list.map((r) => r.user_id).filter(isUuid);
    const people = ids.length
      ? await rest(getSession, "GET", `/rest/v1/user_profiles?id=in.(${ids.join(",")})&select=id,full_name,username,role,is_active`, undefined, null)
      : [];
    const byId = new Map((Array.isArray(people) ? people : []).map((p) => [p.id, p]));
    recipients = list.map((r) => {
      const p = byId.get(r.user_id) || {};
      return { user_id: r.user_id, name: p.full_name || p.username || "—", username: p.username || null, role: p.role || null,
        is_active: p.is_active !== false, added_at: r.added_at, seen_at: r.seen_at, opened_at: r.opened_at,
        last_used_at: r.last_used_at, counter: Number(r.counter) || 0 };
    });
  }
  const st = await rest(getSession, "GET", `/rest/v1/settings?key=eq.${SETTING}&select=value`, undefined, null).catch(() => null);
  const cleanupReady = await rest(getSession, "POST", "/rest/v1/rpc/sim_share_cleanup_ready", {}, null).then((v) => v === true, () => false);
  return { share, recipients, saved: cleanSaved(Array.isArray(st) ? st[0]?.value : null), cleanupReady };
}

/** An expired share stays this site's current one (Replace keeps its guests), but its files are
 *  removed: a download link a guest made while it played stops working. → true when removed. */
export async function tidyExpired({ share, getSession } = {}) {
  await preloadShared();
  const s = shareOf(share);
  if (!s || !isExpired(s) || s.files_removed_at) return false;
  return removeFiles(getSession, s).catch(() => false);
}

/** Removes the files of this site's ended shares (replaced or withdrawn) that still have them: a
 *  removal that failed when the share ended is retried each time the launcher opens. → the number tidied. */
export async function tidyEnded({ getSession, limit = 5 } = {}) {
  await preloadShared();
  const rows = await rest(getSession, "GET", `/rest/v1/sim_shares?site=eq.${encodeURIComponent(siteOf())}&status=in.(replaced,withdrawn)`
    + `&files_removed_at=is.null&select=id,media_count,status&order=created_at.desc&limit=${limit}`, undefined, null);
  let n = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (isUuid(r?.id) && (r.status === "replaced" || r.status === "withdrawn") && await removeFiles(getSession, shareOf(r)).catch(() => false)) n++;
  }
  return n;
}

/** The status of one share row (PMO), or null when it cannot be read. */
async function statusOf(getSession, id) {
  const rows = await rest(getSession, "GET", `/rest/v1/sim_shares?id=eq.${id}&select=status`, undefined, null);
  return Array.isArray(rows) && rows[0] ? rows[0].status : null;
}

/**
 * Shares the simulation the launcher shows (PMO). Reads the data afresh exactly as Start does,
 * checks the approved plan still holds, stores the files, then shares it in one step; the previous
 * share (if any) is replaced and its files are removed.
 * pmo, overrides, testAccounts, leftOut, prefetch, approved: as for simBridge.launch
 * recipients:  active guests' ids; voice: "on" | "off" (the guests' default); previous: the active share or null
 * onProgress({ phase: waiting-media | reading | uploading | sharing | tidying, done, total, bytes, totalBytes })
 * Resolves { id, code, takenAt, expiresAt, recipients, media, bytes, previousRemoved } or rejects with a ShareError.
 * Refused ('stale-tab') when this tab runs an older build than the site now serves: the copy would
 * play nowhere.
 */
export async function createShare({ pmo, getSession, overrides = {}, testAccounts = [], leftOut = [], prefetch = null, approved = null,
  recipients = [], voice = "on", previous = null, onProgress } = {}) {
  await preloadShared();
  const { bridge, snapshot: S } = engine;
  const K = bridge.shareKit;
  const report = (p) => { try { onProgress?.(p); } catch { /* ignore */ } };
  const guests = [...new Set(recipients || [])].filter(isUuid);
  if (!guests.length) throw new ShareError("no-guests", TEXT.noGuests);
  const held = new Map();
  let row = null, result = null, saved = null, snapshot = null, totalBytes = 0, activating = false;
  // The answer for a share that went through (also when its answer was lost on the way back).
  const finish = () => {
    result = { id: row.id, code: snapshot.code, takenAt: snapshot.takenAt, expiresAt: snapshot.takenAt + SHARE_DAYS * DAY_MS,
      recipients: guests.length, media: snapshot.media.length, bytes: totalBytes, previousRemoved: null };
    saved = { shareId: row.id, overrides: snapshot.overrides, testAccounts: snapshot.testAccounts,
      leftOut: [...new Set(leftOut || [])].filter(isUuid), voice: row.voice, savedAt: iso(Date.now()) };
  };
  try {
    // 0. This tab must run the build the site serves now (a tab kept open across a deploy does not).
    const build = bridge.portalBuild();
    const served = await servedBuild();
    if (served && build !== "dev" && served !== build) throw new ShareError("stale-tab", TEXT.staleTab);
    // 1. Photos and videos first, then the fresh read (it covers their hashes), as Start does.
    report({ phase: "waiting-media" });
    if (prefetch?.done) await prefetch.done;
    report({ phase: "reading" });
    snapshot = await S.readSnapshot({ get: bridge.makeGet(), pmo, build, overrides,
      testAccounts, leftOut, media: K.mediaCallback({ prefetch, held }) });
    if (approved && !S.sameReview(snapshot.plan, approved)) {
      throw Object.assign(new ShareError("review-changed", TEXT.reviewChanged), { plan: snapshot.plan });
    }
    const json = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
    if (json.size > JSON_MAX) throw new ShareError("size", TEXT.tooLarge);
    totalBytes = snapshot.media.reduce((a, m) => a + m.size, 0) + json.size;

    // 2. The row (uploading: nobody but the PMO can see it), for this site.
    row = { id: crypto.randomUUID(), as_at: iso(snapshot.takenAt), build: snapshot.build, fingerprint: snapshot.fingerprint,
      code: snapshot.code, json_bytes: json.size, media_count: snapshot.media.length,
      media_bytes: snapshot.media.reduce((a, m) => a + m.size, 0), voice: voice === "off" ? "off" : "on",
      expires_at: iso(snapshot.takenAt + SHARE_DAYS * DAY_MS), site: siteOf() };
    await rest(getSession, "POST", "/rest/v1/sim_shares", row);

    // 3. The files: media 4 at a time, the snapshot last.
    const up = { done: 0, total: snapshot.media.length + 1, bytes: 0, totalBytes };
    report({ phase: "uploading", ...up });
    await pool(snapshot.media, WORKERS, async (m) => {
      const it = held.get(m.attachmentId);
      if (!it?.blob) throw new ShareError("upload", TEXT.upload);
      await uploadOne(getSession, storagePath(row.id, m.key), it.blob, m.mime);
      up.done += 1; up.bytes += m.size;
      report({ phase: "uploading", ...up });
    });
    await uploadOne(getSession, storagePath(row.id, "snapshot.json"), json, "application/json");
    up.done += 1; up.bytes += json.size;
    report({ phase: "uploading", ...up });

    // 4. Every file is there, at its size.
    const listed = await listFolder(getSession, row.id);
    const want = new Map([["snapshot.json", json.size], ...snapshot.media.map((m) => [m.key, m.size])]);
    if (listed.size !== want.size || [...want].some(([n, size]) => !listed.has(n) || (listed.get(n) != null && listed.get(n) !== size))) {
      throw new ShareError("upload", TEXT.upload);
    }

    // 5. Shared: the previous share of this site is replaced, the guests are added, this one is active.
    report({ phase: "sharing" });
    activating = true;
    await rest(getSession, "POST", "/rest/v1/rpc/sim_share_activate", { p_share: row.id, p_recipients: guests });
    activating = false;
    finish();
  } catch (e) {
    const err = e instanceof ShareError ? e : new ShareError(e?.name === "SnapshotError" ? "snapshot" : "failed", e?.message || "The share failed.");
    if (!row) throw err;
    if (!activating) {
      // Never shared: the row is withdrawn and whatever was uploaded is removed.
      await rest(getSession, "PATCH", `/rest/v1/sim_shares?id=eq.${row.id}&status=eq.uploading`, { status: "withdrawn" }).catch(() => {});
      await removeFiles(getSession, row).catch(() => {});
      throw err;
    }
    // The last step failed, or only its answer was lost after the database had shared it. Files are
    // removed only from a share this call certainly withdrew (it was still 'uploading').
    const ended = await rest(getSession, "PATCH", `/rest/v1/sim_shares?id=eq.${row.id}&status=eq.uploading`, { status: "withdrawn" },
      "return=representation").catch(() => null);
    if (Array.isArray(ended) && ended.length === 1) {
      await removeFiles(getSession, row).catch(() => {});
      throw err;
    }
    const now = await statusOf(getSession, row.id).catch(() => null);
    if (now !== "active") throw now ? err : new ShareError("unsure", TEXT.unsure);   // nothing removed; the launcher re-reads
    finish();                                                                        // it went through
  } finally {
    held.clear();
  }

  // 6. The choices, for sharing again after a portal update; the previous share's files.
  report({ phase: "tidying" });
  await rest(getSession, "POST", "/rest/v1/settings?on_conflict=key", { key: SETTING, value: saved },
    "resolution=merge-duplicates,return=minimal").catch(() => { /* the share itself is done */ });
  if (previous?.id && previous.id !== result.id) {
    result.previousRemoved = previous.files_removed_at ? true : await removeFiles(getSession, shareOf(previous) || previous).catch(() => false);
  }
  return result;
}

/** Replace the current share with today's data: createShare with that share as `previous`, and its
 *  guests kept unless `recipients` is given. */
export async function replaceShare({ current, currentRecipients = [], recipients = null, ...opts } = {}) {
  const keep = recipients || currentRecipients.map((r) => r.user_id || r);
  return createShare({ ...opts, recipients: keep, previous: current });
}

/** Adds guests to the active share (same data). */
export async function addRecipients({ shareId, userIds, getSession } = {}) {
  await preloadShared();
  const ids = [...new Set(userIds || [])].filter(isUuid);
  if (!isUuid(shareId) || !ids.length) throw new ShareError("no-guests", TEXT.noGuests);
  await rest(getSession, "POST", "/rest/v1/rpc/sim_share_activate", { p_share: shareId, p_recipients: ids });
  return ids.length;
}

/** Stops sharing with one guest (their button goes within 2 minutes; new downloads are refused at once). */
export async function removeRecipient({ shareId, userId, getSession } = {}) {
  await preloadShared();
  if (!isUuid(shareId) || !isUuid(userId)) throw new ShareError("failed", "Unknown guest.");
  await rest(getSession, "PATCH", `/rest/v1/sim_share_recipients?share_id=eq.${shareId}&user_id=eq.${userId}`, { removed: true });
}

/** Stops sharing with everyone: the share is withdrawn and its files are removed. → { filesRemoved } */
export async function stopSharing({ share, getSession } = {}) {
  await preloadShared();
  const s = shareOf(share);
  if (!s) throw new ShareError("failed", "Nothing is shared.");
  const ended = await rest(getSession, "PATCH", `/rest/v1/sim_shares?id=eq.${s.id}&status=eq.active`, { status: "withdrawn" }, "return=representation");
  // No row changed: this copy had already been replaced or stopped (the launcher showed an old state).
  if (Array.isArray(ended) && !ended.length) throw new ShareError("failed", TEXT.alreadyEnded);
  return { filesRemoved: await removeFiles(getSession, s).catch(() => false) };
}

/** For tests: photos and videos held by launches in progress (0 once each has ended). */
export const _heldForTests = () => [...runs].reduce((a, r) => a + r.held.size, 0);
