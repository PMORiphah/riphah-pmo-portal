// PMO Simulation: the hand-over from the PMO's signed-in portal tab to the simulation tab
// (protocol v2, live portal data). Owner: B1. Spec: contract §C, §D.2, §D.3.
//
// Loaded only when the PMO opens the Simulation window (src/SimLauncher.jsx); nobody else ever
// downloads this file. Over a one-time BroadcastChannel ('pmo-sim-<nonce>') it sends a snapshot of
// the portal's data, read here under the PMO's own session by src/sim/live/snapshot.js (GET
// /rest/v1 only, explicit columns, contacts masked, nothing written), plus the site-visit photos and
// videos, downloaded here and re-encoded (images are redrawn, which drops EXIF/GPS data).
// Never sent: tokens, storage paths, signed links. The simulation tab has no opener, no token and
// no network access to production.
//
// Messages (src/sim/handoff.js is the receiving side):
//   sim    → { type:'hello', v:2, nonce, build }            repeated until the first portal message
//   portal → { type:'progress', v:2, nonce, phase, media:{done,total,bytes} }   at most every 2 s, at least every 10 s
//   portal → { type:'manifest', … } · 'tables' parts · 'responses' parts · 'rpc' · one 'media' per item · 'done'
//   sim    → { type:'ok', v:2, nonce, fingerprint } | { type:'refused', v:2, nonce, code, reason }
//   sim    → { type:'refresh', v:2, nonce, req, refreshKey }  answered on 'pmo-sim-<nonce>.<req>'
//   sim    → { type:'bye', v:2, nonce, refreshKey }           ends this launch's refresh listener
// The manifest says mode 'live' (share null). A copy the PMO shared with guests is sent by
// src/simShare.js from its stored files with the same messages, mode 'shared', and no listener.
// Nothing is stored in browser storage, here or in the simulation tab.
import { loadSession, isFresh } from "./auth.js";
import { readSnapshot, sameReview } from "./sim/live/snapshot.js";
import { SUPA_ORIGIN } from "./sim/live/requests.js";
import { CAPS } from "./sim/live/schema.js";
import { sha256Hex } from "./sim/live/canon.js";
import { fileLink } from "./fileLinks.js";

// The portal's public (anon) key, as in src/auth.js. Requests also carry the PMO's own token.
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";

const VIDEO_MIMES = ["video/mp4", "video/webm"];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const ITEM_MAX = CAPS.mediaItem;      // 50 MB per file, as the simulation enforces
export const TOTAL_MAX = CAPS.mediaTotal;    // 150 MB in all
export const COUNT_MAX = CAPS.mediaCount;    // 200 items
const HELLO_MS = 20000;            // the simulation tab must say hello within this
const OK_MS = 30000;               // and confirm within this after 'done'
const WORKERS = 4;
const MAX_SIDE = 1920;             // longest side after re-encoding: the lightbox never shows more
const JPEG_Q = 0.86;
const THUMB_SIDE = 240;            // the launcher's tile previews
const PROGRESS_MIN_MS = 2000;      // progress at most every 2 s …
const HEARTBEAT_MS = 4000;         // … and at least every 4 s (the contract's floor is 10 s)
const MESSAGE_MAX = CAPS.messageJson - 4096;   // a 'tables'/'responses' part, JSON, with room for the envelope
const LISTEN_MS = 2 * 3600 * 1000; // a launch's refresh listener lasts 2 h …
const REFRESH_MAX = 20;            // … or 20 refreshes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NO_TAB_MESSAGE = "The simulation tab did not open. Allow pop-ups for this site and press Start again.";
export const BUILD_MESSAGE = "Reload the portal tab, then press Simulation again.";
export const NOT_CONFIRMED_MESSAGE = "The simulation tab did not confirm the hand-over. If it shows a problem, close it and press Start again.";
export const REVIEW_MESSAGE = "Something you approved in the launcher has changed. Press Simulation in the portal again to review it.";
export const CHANGED_AT_START_MESSAGE = "Something you approved here changed in the portal just now. Close the simulation tab that opened, check the item again below, then press Start again.";
const SIGNED_OUT_MESSAGE = "The portal tab is signed out. Sign in again as the PMO, then press Simulation.";

/** An error the launcher can show; `code` is one of no-tab | build | refused | review-changed | snapshot | signed-out | failed. */
export class LaunchError extends Error {
  constructor(code, message) { super(message); this.name = "LaunchError"; this.code = code; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Vite replaces the exact token import.meta.env.BASE_URL at build time; under Node (tests) there is no env.
const baseUrl = () => (import.meta.env && import.meta.env.BASE_URL) || "/";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const encodeStoragePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");
const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm" };

// ── harness / status object (portal tab) ─────────────────────────────────────
const LAUNCH = { phase: "idle", takenAt: null, code: null, counts: null, bytes: 0, media: { ready: 0, total: 0, bytes: 0, failed: 0, done: false }, error: null };
const setLaunch = (patch) => {
  Object.assign(LAUNCH, patch);
  if (patch.media) LAUNCH.media = { ...LAUNCH.media, ...patch.media };
  try { if (typeof window !== "undefined") window.__PMO_SIM_LAUNCH__ = LAUNCH; } catch { /* ignore */ }
};
setLaunch({});

// ── session and requests ────────────────────────────────────────────────────
// The session is read at each request: the portal renews the token in place and saves it.
let fallbackSession = null;
/** The launcher registers the App's getSession function (or, without it, the session object) as a
 *  fallback when storage is unavailable. A function is called at each use, so it reads null once the
 *  App has signed out; an object would keep the stale session. */
export function setSessionFallback(s) { fallbackSession = typeof s === "function" ? s : (s || null); }
const currentSession = () => {
  const stored = loadSession();
  if (stored) return stored;
  if (typeof fallbackSession === "function") { try { return fallbackSession() || null; } catch { return null; } }
  return fallbackSession;
};

/** The portal's own entry chunk name ("index-XXXXXXXX.js"), or "dev" under the dev server. */
export function portalBuild() {
  try {
    const src = document.querySelector('script[type="module"][src*="/assets/index-"]')?.src;
    if (src) return src.split("?")[0].split("/").pop();
  } catch { /* ignore */ }
  return "dev";
}

/** GET /rest/v1/<table>… under the PMO's token, with the status and Content-Range kept. Nothing else. */
export function makeGet() {
  return async (path) => {
    if (typeof path !== "string" || !path.startsWith("/rest/v1/") || path.startsWith("/rest/v1/rpc/")) {
      throw new Error("Only table reads are allowed");
    }
    const tok = currentSession()?.access_token;
    if (!tok) throw Object.assign(new LaunchError("signed-out", SIGNED_OUT_MESSAGE), { fatal: true });
    const r = await fetch(SUPA_ORIGIN + path, {
      method: "GET", cache: "no-store", credentials: "omit",
      headers: { apikey: SUPA_KEY, Authorization: "Bearer " + tok },
    });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, contentRange: r.headers.get("content-range"), body };
  };
}

// ── media ───────────────────────────────────────────────────────────────────
/** The type the portal recorded, else the file's extension (used here only, never sent). */
export function mediaMimeOf(row) {
  const m = String(row?.mime_type || "").toLowerCase().split(";")[0].trim();
  if (m) return m === "image/jpg" ? "image/jpeg" : m;
  const ext = String(row?.file_path || row?.file_name || "").split(".").pop().toLowerCase();
  return EXT_MIME[ext] || "";
}
export const isSupportedMedia = (row) => { const m = mediaMimeOf(row); return IMAGE_MIMES.includes(m) || VIDEO_MIMES.includes(m); };
export const isVideo = (row) => mediaMimeOf(row).startsWith("video/");

function hasAlpha(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

// Decode and draw again: the result carries pixels only (no EXIF, GPS or camera data), with the
// orientation applied. Longest side 1920; JPEG at 0.86, or PNG when the source has transparency.
async function reencode(blob, mime) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: mime !== "image/jpeg" });
    ctx.drawImage(bmp, 0, 0, w, h);
    const type = mime !== "image/jpeg" && hasAlpha(ctx, w, h) ? "image/png" : "image/jpeg";
    const out = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("could not re-encode"))), type, type === "image/jpeg" ? JPEG_Q : undefined));
    canvas.width = 0; canvas.height = 0;
    // A small copy for the launcher's tiles (never sent): decoding 1920 px pictures for 84 px tiles is wasteful.
    const t = Math.min(1, THUMB_SIDE / Math.max(bmp.width, bmp.height));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(bmp.width * t)); small.height = Math.max(1, Math.round(bmp.height * t));
    small.getContext("2d").drawImage(bmp, 0, 0, small.width, small.height);
    const thumb = await new Promise((res) => small.toBlob((b) => res(b || null), "image/jpeg", 0.7));
    small.width = 0; small.height = 0;
    return { blob: out, mime: type, thumb };
  } finally {
    try { bmp.close(); } catch { /* ignore */ }
  }
}

/** The file from Supabase Storage through a signed link (the way before R2, and its fallback). */
async function signedFromStorage(row, tok, signal) {
  const sr = await fetch(`${SUPA_ORIGIN}/storage/v1/object/sign/project-attachments/${encodeStoragePath(row.file_path)}`, {
    method: "POST", cache: "no-store", credentials: "omit", signal,
    headers: { apikey: SUPA_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 120 }),
  });
  const sj = await sr.json().catch(() => null);
  // Storage answers with a link relative to its API ("/object/sign/<bucket>/<path>?token=…"); the
  // portal tab only ever downloads from real storage (src/storageUrl.js's first case).
  const link = sj?.signedURL;
  if (!sr.ok || typeof link !== "string" || !link.startsWith("/object/sign/project-attachments/")) throw new Error("no link");
  return fetch(SUPA_ORIGIN + "/storage/v1" + link, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal });
}

/** One site-visit row → { blob, mime, size, sha256, sourcePath, sourceSize, thumb }, or throws a reason. */
async function prepareItem(row, signal) {
  const mime = mediaMimeOf(row);
  if (!IMAGE_MIMES.includes(mime) && !VIDEO_MIMES.includes(mime)) throw new Error("type not supported");
  const declared = Number(row.file_size) || 0;
  if (VIDEO_MIMES.includes(mime) && declared > ITEM_MAX) throw new Error("over 50 MB");
  const tok = currentSession()?.access_token;
  if (!tok) throw new Error("signed out");
  // Cloudflare R2 first (no Supabase bandwidth, see fileLinks.js); Supabase as before when it has no link or fails.
  const r2 = await fileLink("project-attachments", row.file_path, tok);
  let r = r2 ? await fetch(r2, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal }).catch((e) => {
    if (signal?.aborted) throw e;
    return null;
  }) : null;
  if (!r || !r.ok) r = await signedFromStorage(row, tok, signal);
  if (!r.ok) throw new Error("download failed (" + r.status + ")");
  const raw = await r.blob();
  if (declared > 0 && raw.size !== declared) throw new Error("size differs from the record");
  let blob = raw, type = mime, thumb = null;
  if (IMAGE_MIMES.includes(mime)) ({ blob, mime: type, thumb } = await reencode(raw, mime));
  else blob = new Blob([raw], { type: mime });
  if (!blob.size) throw new Error("empty file");
  if (blob.size > ITEM_MAX) throw new Error("over 50 MB");
  const sha256 = await sha256Hex(blob);
  return { blob, mime: type, size: blob.size, sha256, sourcePath: row.file_path, sourceSize: declared || raw.size, thumb };
}

const sameSource = (item, row) => !!item && item.sourcePath === row.file_path
  && (!(Number(row.file_size) > 0) || item.sourceSize === Number(row.file_size));

/** Prefetch order (contract §D.2): `first` ids (the plan's Gallery campus, in the given order),
 *  then the other photos newest first, then videos smallest first, unsupported types last. */
export function prefetchOrder(rows, first = []) {
  const head = new Set(first || []);
  const newest = (a, b) => (String(b.uploaded_at ?? "") < String(a.uploaded_at ?? "") ? -1 : String(b.uploaded_at ?? "") > String(a.uploaded_at ?? "") ? 1 : 0);
  const firstRows = (rows || []).filter((r) => head.has(r.id)).sort(newest);
  const rest = (rows || []).filter((r) => !head.has(r.id));
  const photos = rest.filter((r) => isSupportedMedia(r) && !isVideo(r)).sort(newest);
  const videos = rest.filter((r) => isVideo(r) && isSupportedMedia(r)).sort((a, b) => (Number(a.file_size) || 0) - (Number(b.file_size) || 0));
  const other = rest.filter((r) => !isSupportedMedia(r));
  return [...firstRows, ...photos, ...videos, ...other];
}

/**
 * Starts downloading and preparing every given site-visit row, 4 at a time, in prefetchOrder.
 * → { ready: Map(id → item), failed: Map(id → reason), done (a Promise for "nothing left to do"),
 *     ensure(row) → Promise<item|null>, add(rows), stats() → { ready, failed, total, bytes, done }, cancel() }
 * Items are held in memory only; cancel() drops them.
 */
export function startPrefetch(rows, { onProgress, first = [] } = {}) {
  const ready = new Map(), failed = new Map(), started = new Map();
  const queue = prefetchOrder(rows, first);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let total = queue.length, bytes = 0, active = 0, cancelled = false, waiters = [];
  const idle = () => active === 0 && queue.length === 0;
  const stats = () => ({ ready: ready.size, failed: failed.size, total, bytes, done: idle() });
  const report = () => {
    const s = stats();
    setLaunch({ media: { ready: s.ready, total: s.total, bytes: s.bytes, failed: s.failed, done: s.done } });
    try { onProgress?.(s); } catch { /* ignore */ }
  };
  const settle = () => { if (idle()) { const w = waiters; waiters = []; w.forEach((r) => r()); } report(); };
  const run = (row) => {
    active += 1;
    const p = (async () => {
      try {
        const item = await prepareItem(row, ctrl?.signal);
        if (cancelled) return null;
        ready.set(row.id, item); failed.delete(row.id); bytes += item.size;
        return item;
      } catch (e) {
        if (!cancelled) failed.set(row.id, e?.message || "failed");
        return null;
      } finally { active -= 1; pump(); settle(); }
    })();
    started.set(row.id, p);
    return p;
  };
  function pump() { while (!cancelled && active < WORKERS && queue.length) run(queue.shift()); }
  pump();
  report();
  return {
    ready, failed, stats,
    /** True once cancel() ran (the launcher window was closed or unmounted). */
    get cancelled() { return cancelled; },
    get done() { return idle() || cancelled ? Promise.resolve() : new Promise((r) => waiters.push(r)); },
    /** Queues rows not seen yet (a re-read in the launcher found new uploads). */
    add(more) {
      for (const r of prefetchOrder(more)) {
        if (cancelled || started.has(r.id) || queue.some((q) => q.id === r.id)) continue;
        queue.push(r); total += 1;
      }
      pump(); report();
    },
    /** The item for this row now or when ready; a row not seen yet, changed since, or failed is prepared now. */
    async ensure(row) {
      if (cancelled) return null;
      let known = ready.get(row.id);
      if (!known && started.has(row.id) && !failed.has(row.id)) known = await started.get(row.id);
      if (known && sameSource(known, row)) return known;
      const i = queue.findIndex((r) => r.id === row.id);
      if (i >= 0) queue.splice(i, 1);
      else if (!started.has(row.id)) total += 1;
      if (known && ready.get(row.id) === known) { bytes -= known.size; ready.delete(row.id); }
      return run(row);
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      try { ctrl?.abort(); } catch { /* ignore */ }
      ready.clear();
      settle();
    },
  };
}

/** Ids to prefetch first: the plan's Gallery campus items (all portfolios, as the Gallery filter). */
export function galleryFirstIds(rows, tables, plan) {
  const campus = plan?.gallery?.campus;
  if (!campus) return [];
  const campusOf = new Map((tables?.projects || []).map((p) => [p.id, p.campus]));
  return (rows || []).filter((r) => campusOf.get(r.project_id) === campus).map((r) => r.id);
}

// ── channels ────────────────────────────────────────────────────────────────
const channels = new Set();
const listeners = new Map();              // nonce → refresh listener context
function openChannel(name) {
  const ch = new BroadcastChannel(name);
  channels.add(ch);
  return ch;
}
function closeChannel(ch) {
  if (!ch) return;
  channels.delete(ch);
  try { ch.onmessage = null; ch.close(); } catch { /* ignore */ }
}
const post = (ch, m) => { try { ch.postMessage(m); return true; } catch { return false; } };

/** Ends every hand-over channel and refresh listener in this tab. */
export function stopAll() {
  for (const ctx of [...listeners.values()]) endListener(ctx);
  for (const ch of [...channels]) closeChannel(ch);
}

// Progress messages: at most every 2 s, and a heartbeat so the simulation tab never waits long in silence.
function progressSender(ch, nonce) {
  const state = { phase: "media", media: { done: 0, total: 0, bytes: 0 } };
  let last = 0, beat = 0;
  const send = () => { last = Date.now(); post(ch, { type: "progress", v: 2, nonce, phase: state.phase, media: { ...state.media } }); };
  return {
    start() { send(); beat = setInterval(() => { if (Date.now() - last >= HEARTBEAT_MS) send(); }, 1000); },
    update(patch) {
      if (patch.phase) state.phase = patch.phase;
      if (patch.media) state.media = { ...state.media, ...patch.media };
      if (Date.now() - last >= PROGRESS_MIN_MS) send();
    },
    stop() { clearInterval(beat); beat = 0; },
  };
}
const phaseOf = (p) => (p === "media" ? "media" : p === "tables" || p === "plan" || p === "responses" ? "reading" : "checking");

// Whole tables (never split) or response items, grouped so each part's JSON stays under the limit.
function groupParts(entries, sizeOf) {
  const parts = [];
  let cur = [], len = 0;
  for (const e of entries) {
    const n = sizeOf(e);
    if (cur.length && len + n > MESSAGE_MAX) { parts.push(cur); cur = []; len = 0; }
    cur.push(e); len += n;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** The messages for one snapshot, in protocol order. `held`: Map(attachmentId → item with blob);
 *  `reuse`: Set of attachment ids the simulation already holds (refresh delta). `mode`: "live" (the
 *  PMO's own read; `share` null) or "shared" (a copy the PMO shared with guests, sent from the stored
 *  files by src/simShare.js; `share` = { id, sharedAt, expiresAt, voice }). */
export function messagesFor(snapshot, { nonce, refreshKey, held, reuse = new Set(), mode = "live", share = null }) {
  if (mode !== "live" && mode !== "shared") throw new TypeError("messagesFor: mode must be live or shared");
  if ((mode === "shared") !== isObj(share)) throw new TypeError("messagesFor: a shared hand-over carries its share, a live one none");
  const tableParts = groupParts(Object.entries(snapshot.tables), ([t, rows]) => JSON.stringify(rows).length + t.length + 8)
    .map((g) => Object.fromEntries(g));
  const respParts = groupParts(snapshot.responses, (r) => JSON.stringify(r).length + 2);
  const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([t, rows]) => [t, rows.length]));
  const media = snapshot.media.map((m) => (reuse.has(m.attachmentId) ? { ...m, reuse: true } : { ...m }));
  const out = [{
    type: "manifest", v: 2, nonce, build: snapshot.build, takenAt: snapshot.takenAt, readMs: snapshot.readMs, tz: snapshot.tz,
    pmo: snapshot.pmo, mask: snapshot.mask, testAccounts: snapshot.testAccounts, overrides: snapshot.overrides,
    leftOut: snapshot.leftOut, failed: snapshot.failed, counts, bytes: snapshot.bytes, media, plan: snapshot.plan,
    invariants: snapshot.invariants, fingerprint: snapshot.fingerprint, code: snapshot.code, refreshKey,
    parts: { tables: tableParts.length, responses: respParts.length },
    mode, share: mode === "shared" ? { id: share.id, sharedAt: share.sharedAt, expiresAt: share.expiresAt, voice: share.voice } : null,
  }];
  tableParts.forEach((tables, i) => out.push({ type: "tables", v: 2, nonce, part: i + 1, of: tableParts.length, tables }));
  respParts.forEach((items, i) => out.push({ type: "responses", v: 2, nonce, part: i + 1, of: respParts.length, items }));
  out.push({ type: "rpc", v: 2, nonce, project_has_deliverables: snapshot.rpc.project_has_deliverables.slice() });
  let sent = 0, bytes = 0;
  for (const m of snapshot.media) {
    if (reuse.has(m.attachmentId)) continue;
    const it = held.get(m.attachmentId);
    out.push({ type: "media", v: 2, nonce, item: { key: m.key, attachmentId: m.attachmentId, mime: m.mime, size: m.size, sha256: m.sha256, blob: it.blob } });
    sent += 1; bytes += m.size;
  }
  out.push({ type: "done", v: 2, nonce, fingerprint: snapshot.fingerprint,
    counts: { tables: Object.keys(snapshot.tables).length, responses: snapshot.responses.length, media: sent } });
  return { messages: out, sent, bytes, counts, parts: { tables: tableParts.length, responses: respParts.length } };
}

// Waits for 'ok' (matching fingerprint) or 'refused' on a channel; null on timeout.
function receipt(ch, nonce, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { ch.removeEventListener("message", on); resolve(null); }, ms);
    function on(e) {
      const m = e.data;
      if (!isObj(m) || m.v !== 2 || m.nonce !== nonce || (m.type !== "ok" && m.type !== "refused")) return;
      clearTimeout(t); ch.removeEventListener("message", on); resolve(m);
    }
    ch.addEventListener("message", on);
  });
}

// The media callback for readSnapshot: prepared items from the prefetch (or now), held for sending.
function mediaCallback({ prefetch, held, index = null, reuse = null }) {
  return async (rows) => {
    const out = new Map();
    let next = 0;
    const worker = async () => {
      while (next < rows.length) {
        const row = rows[next++];
        const prev = index?.get(row.id);
        if (prev && reuse && prev.sourcePath === row.file_path && (!(Number(row.file_size) > 0) || prev.sourceSize === Number(row.file_size))) {
          reuse.add(row.id);
          held.set(row.id, { ...prev, blob: null });
          out.set(row.id, { mime: prev.mime, size: prev.size, sha256: prev.sha256 });
          continue;
        }
        let item = null;
        if (prefetch && !prefetch.cancelled) { try { item = await prefetch.ensure(row); } catch { item = null; } }   // failed earlier: tried again
        // No prefetch, or it was cancelled under a running Start (the launcher window unmounted, e.g. the
        // portal window was made narrow): prepared here, so the photos are not silently left out.
        if (!item && (!prefetch || prefetch.cancelled)) {
          for (let attempt = 0; attempt < 2 && !item; attempt++) { try { item = await prepareItem(row); } catch { item = null; } }
        }
        if (item) { held.set(row.id, item); out.set(row.id, { mime: item.mime, size: item.size, sha256: item.sha256 }); }
        else out.set(row.id, null);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, rows.length) || 1 }, worker));
    return out;
  };
}

/** For src/simShare.js (a shared copy: stored files instead of a fresh read, no refresh listener):
 *  the same channels (stopAll() closes them too), progress, receipt and media preparation. */
export const shareKit = Object.freeze({
  origin: SUPA_ORIGIN, anonKey: SUPA_KEY, helloMs: HELLO_MS, okMs: OK_MS,
  openChannel, closeChannel, post, progressSender, receipt, mediaCallback,
});

const indexOf = (snapshot, held) => new Map(snapshot.media.map((m) => {
  const it = held.get(m.attachmentId);
  return [m.attachmentId, { sha256: m.sha256, mime: m.mime, size: m.size, sourcePath: it?.sourcePath ?? null, sourceSize: it?.sourceSize ?? null }];
}));

/**
 * Starts the hand-over. MUST be called synchronously from the click handler: the simulation tab
 * is opened before anything is awaited, or the browser treats it as an unrequested pop-up.
 *
 * pmo:          { id, username, full_name } (the signed-in PMO)
 * overrides:    the launcher's accepted choices (contract §E.19)
 * testAccounts: confirmed test-account ids; leftOut: attachment ids the PMO left out
 * prefetch:     the object startPrefetch returned (Start waits for it, then reads afresh)
 * approved:     the plan the PMO reviewed in the launcher; if its threads, risk row or user row
 *               changed by Start, nothing is sent (LaunchError 'review-changed')
 * onProgress({ phase, media:{ready,total,bytes,failed}, sent, bytes })
 * timing:       { hello, ok } in ms (tests only; defaults 20 s and 30 s)
 * Resolves { code, fingerprint, sent, bytes, confirmed } or rejects with a LaunchError.
 */
export function launch({ pmo, build = portalBuild(), overrides = {}, testAccounts = null, leftOut = [], prefetch = null, approved = null, onProgress, timing = {} } = {}) {
  const nonce = crypto.randomUUID();
  const ch = openChannel("pmo-sim-" + nonce);
  window.open(baseUrl() + "simulation.html#k=" + nonce, "pmo-simulation", "noopener");
  setLaunch({ phase: "opening", takenAt: null, code: null, counts: null, bytes: 0, error: null });
  return handOver({ ch, nonce, pmo, build, overrides, testAccounts, leftOut, prefetch, approved, onProgress,
    helloMs: timing.hello ?? HELLO_MS, okMs: timing.ok ?? OK_MS })
    .catch((e) => {
      closeChannel(ch);
      const err = e instanceof LaunchError ? e
        : new LaunchError(e?.name === "SnapshotError" ? "snapshot" : "failed", e?.message || "The hand-over failed");
      setLaunch({ phase: "error", error: err.message });
      throw err;
    });
}

async function handOver({ ch, nonce, pmo, build, overrides, testAccounts, leftOut, prefetch, approved, onProgress, helloMs, okMs }) {
  const report = (p) => { try { onProgress?.(p); } catch { /* ignore */ } };
  const mediaStats = () => prefetch?.stats?.() || { ready: 0, failed: 0, total: 0, bytes: 0, done: true };
  let refused = null;
  let gotHello;
  const hello = new Promise((r) => { gotHello = r; });
  ch.onmessage = (e) => {
    const m = e.data;
    if (!isObj(m) || m.nonce !== nonce) return;
    if (m.type === "hello") gotHello(m);
    else if (m.type === "refused" && m.v === 2) refused = m;
  };

  report({ phase: "opening", media: mediaStats() });
  const h = await Promise.race([hello, sleep(helloMs).then(() => null)]);
  if (!h) throw new LaunchError("no-tab", NO_TAB_MESSAGE);
  if (h.v !== 2) throw new LaunchError("build", BUILD_MESSAGE);
  if (h.build !== build) {
    // Templates are build-specific: the simulation tab refuses this manifest and says why.
    post(ch, { type: "manifest", v: 2, nonce, build });
    throw new LaunchError("build", BUILD_MESSAGE);
  }

  const prog = progressSender(ch, nonce);
  const mediaProgress = () => { const s = mediaStats(); return { done: s.ready + s.failed, total: s.total, bytes: s.bytes }; };
  prog.start();
  const tick = setInterval(() => { prog.update({ media: mediaProgress() }); report({ phase: LAUNCH.phase, media: mediaStats() }); }, 1000);
  try {
    // 1. Photos and videos first: the fresh read starts when they are ready, so it covers their hashes.
    setLaunch({ phase: "waiting-media" });
    prog.update({ phase: "media", media: mediaProgress() });
    if (prefetch?.done) await prefetch.done;

    // 2. The fresh read.
    const held = new Map();
    setLaunch({ phase: "reading" });
    const snapshot = await readSnapshot({
      get: makeGet(), pmo, build, overrides, testAccounts, leftOut,
      media: mediaCallback({ prefetch, held }),
      onPhase: (p) => { const ph = phaseOf(p); setLaunch({ phase: ph === "checking" ? "checking" : "reading" }); prog.update({ phase: ph, media: mediaProgress() }); report({ phase: ph, media: mediaStats() }); },
    });
    setLaunch({ takenAt: snapshot.takenAt });
    if (approved && !sameReview(snapshot.plan, approved)) {
      throw Object.assign(new LaunchError("review-changed", CHANGED_AT_START_MESSAGE), { plan: snapshot.plan });
    }
    if (refused) throw new LaunchError("refused", refused.reason || "The simulation tab refused the hand-over.");

    // 3. Send, in protocol order.
    const refreshKey = crypto.randomUUID();
    const { messages, sent, bytes, counts } = messagesFor(snapshot, { nonce, refreshKey, held });
    setLaunch({ phase: "sending", code: snapshot.code, counts, bytes });
    report({ phase: "sending", media: mediaStats(), sent: 0, bytes: 0 });
    const wait = receipt(ch, nonce, okMs + 5000 + messages.length * 50);
    for (const m of messages) {
      if (refused) break;
      if (!post(ch, m)) throw new LaunchError("failed", "A part of the hand-over could not be sent.");
    }
    prog.stop();
    if (refused) throw new LaunchError("refused", refused.reason || "The simulation tab refused the hand-over.");

    // 4. Receipt.
    setLaunch({ phase: "confirming" });
    report({ phase: "confirming", media: mediaStats(), sent, bytes });
    const r = await Promise.race([wait, sleep(okMs).then(() => null)]);
    if (r?.type === "refused") throw new LaunchError("refused", r.reason || "The simulation tab refused the hand-over.");
    const confirmed = !!r && r.fingerprint === snapshot.fingerprint;
    // After the hand-over only the index stays here (no blobs), for a later refresh's delta.
    const index = indexOf(snapshot, held);
    held.clear();
    if (confirmed) {
      startListener({ ch, nonce, refreshKey, pmo, build, overrides: snapshot.overrides, testAccounts: snapshot.testAccounts,
        leftOut: [...(leftOut || [])], index, plan: snapshot.plan });
    } else closeChannel(ch);
    setLaunch({ phase: confirmed ? "ready" : "unconfirmed", error: confirmed ? null : NOT_CONFIRMED_MESSAGE });
    return { code: snapshot.code, fingerprint: snapshot.fingerprint, sent, bytes, confirmed, takenAt: snapshot.takenAt,
      leftOut: snapshot.leftOut, failed: snapshot.failed, media: snapshot.media.length };
  } finally {
    clearInterval(tick);
    prog.stop();
  }
}

// ── refresh (contract §C.2) ─────────────────────────────────────────────────
function startListener(ctx) {
  ctx.refreshes = 0;
  ctx.busy = false;
  ctx.startedAt = Date.now();
  ctx.timer = setTimeout(() => endListener(ctx), LISTEN_MS);
  listeners.set(ctx.nonce, ctx);
  ctx.ch.onmessage = (e) => { onListenerMessage(ctx, e.data); };
}

function endListener(ctx) {
  clearTimeout(ctx.timer);
  listeners.delete(ctx.nonce);
  closeChannel(ctx.ch);
}

function onListenerMessage(ctx, m) {
  if (!isObj(m) || m.v !== 2 || m.nonce !== ctx.nonce) return;
  if (m.type === "bye") { if (m.refreshKey === ctx.refreshKey) endListener(ctx); return; }
  if (m.type !== "refresh" || m.refreshKey !== ctx.refreshKey || typeof m.req !== "string" || !UUID_RE.test(m.req)) return;
  const reply = openChannel("pmo-sim-" + ctx.nonce + "." + m.req);
  const refuse = (code, reason) => { post(reply, { type: "refused", v: 2, nonce: ctx.nonce, code, reason }); setTimeout(() => closeChannel(reply), 500); };
  if (ctx.busy) return refuse("busy", "A refresh is already running.");
  if (ctx.refreshes >= REFRESH_MAX) { refuse("limit", "Refresh is no longer available for this launch. Press Simulation in the portal again."); endListener(ctx); return; }
  const s = currentSession();
  if (!(s && s.user_id === ctx.pmo.id && s.role === "pmo" && isFresh(s, 60))) return refuse("signed-out", SIGNED_OUT_MESSAGE);
  ctx.busy = true;
  ctx.refreshes += 1;
  refreshOnce(ctx, reply)
    .catch((e) => refuse(e?.code === "review-needed" ? "review-needed" : e?.code === "signed-out" ? "signed-out" : "failed", e?.message || "The refresh failed."))
    .finally(() => { ctx.busy = false; });
}

async function refreshOnce(ctx, reply) {
  const prog = progressSender(reply, ctx.nonce);
  prog.start();
  const held = new Map(), reuse = new Set();
  try {
    prog.update({ phase: "reading" });
    const snapshot = await readSnapshot({
      get: makeGet(), pmo: ctx.pmo, build: ctx.build, overrides: ctx.overrides, testAccounts: ctx.testAccounts, leftOut: ctx.leftOut,
      media: mediaCallback({ prefetch: null, held, index: ctx.index, reuse }),
      onPhase: (p) => prog.update({ phase: phaseOf(p) }),
    });
    if (!sameReview(snapshot.plan, ctx.plan)) throw Object.assign(new Error(REVIEW_MESSAGE), { code: "review-needed" });
    const { messages } = messagesFor(snapshot, { nonce: ctx.nonce, refreshKey: ctx.refreshKey, held, reuse });
    const wait = receipt(reply, ctx.nonce, OK_MS + messages.length * 50);
    prog.stop();
    for (const m of messages) post(reply, m);
    const r = await wait;
    if (r?.type === "ok" && r.fingerprint === snapshot.fingerprint) {
      // The simulation tab now holds exactly this snapshot's media.
      ctx.index = new Map(snapshot.media.map((m) => {
        const it = held.get(m.attachmentId);
        return [m.attachmentId, { sha256: m.sha256, mime: m.mime, size: m.size, sourcePath: it?.sourcePath ?? null, sourceSize: it?.sourceSize ?? null }];
      }));
    }
  } finally {
    prog.stop();
    held.clear();
    setTimeout(() => closeChannel(reply), 500);
  }
}

/** For tests and the harness: the live refresh listeners in this tab. */
export const listenerCount = () => listeners.size;
