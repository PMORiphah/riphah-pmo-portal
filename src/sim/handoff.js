// PMO Simulation: receives the cast (real names) and approved media from the PMO's portal tab.
//
// Protocol (one-time channel 'pmo-sim-<nonce>', nonce from the address the portal opened):
//   sim    → { type:'hello', v:1, nonce }                         repeated until the cast arrives
//   portal → { type:'cast',  v:1, nonce, cast, expect? }           exactly one is accepted
//   portal → { type:'media', v:1, nonce, items:[...] }             zero or more batches
//   portal → { type:'done',  v:1, nonce, count }                   count = media items sent
//   sim    → { type:'ok',    v:1, nonce, count }                   receipt (the portal may stop resending)
// Everything is validated; anything unexpected rejects the whole hand-over (fail closed).
// Names leave here only as plain strings, which the app renders as React text.

export const LIMITS = Object.freeze({
  nameMax: 80,
  campuses: 40,
  pms: 99,
  items: 200,
  itemBytes: 50 * 1024 * 1024,
  totalBytes: 150 * 1024 * 1024,
});
export const TEAM_KEYS = Object.freeze(["head_pmo", "manager_pmo", "deputy_pmo", "exec_pmo", "po1", "po2"]);
export const MEDIA_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
const SLOT_C = /^C\d\d$/;
const SLOT_P = /^P\d\d$/;
const KEY_RE = /^m\d{2,3}$/;
const HOST_RE = /^H\d{1,3}$/;
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

export class HandoffError extends Error {
  constructor(code, message) { super(message || code); this.name = "HandoffError"; this.code = code; }
}
const bad = (code, msg) => { throw new HandoffError(code, msg); };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

export function cleanName(v, what) {
  if (typeof v !== "string") bad("invalid-name", `${what}: not text`);
  const s = v.normalize("NFC").replace(/\s+/g, " ").trim();
  if (s.length < 1 || s.length > LIMITS.nameMax) bad("invalid-name", `${what}: length ${s.length}`);
  if (hasBadChar(s)) bad("invalid-name", `${what}: character not allowed`);
  return s;
}
const optName = (v, what) => (v === undefined || v === null || v === "" ? undefined : cleanName(v, what));

// A fresh, plain cast object holding only the validated fields.
export function validateCast(raw) {
  if (!isObj(raw)) bad("invalid-cast", "cast is not an object");
  if (raw.v !== 1) bad("invalid-cast", "unknown cast version");
  if (!isObj(raw.campuses) || !isObj(raw.pms) || !isObj(raw.team)) bad("invalid-cast", "cast lacks campuses, pms or team");
  const cast = { v: 1, campuses: {}, pms: {}, team: {} };
  const ck = Object.keys(raw.campuses);
  if (ck.length < 1 || ck.length > LIMITS.campuses) bad("invalid-cast", `campus count ${ck.length}`);
  for (const k of ck) {
    if (!SLOT_C.test(k)) bad("invalid-slot", `campus slot ${k.slice(0, 8)}`);
    const c = raw.campuses[k];
    if (!isObj(c)) bad("invalid-cast", `campus ${k}`);
    const o = { name: cleanName(c.name, `campus ${k}`) };
    const say = optName(c.say, `campus ${k} say`); if (say) o.say = say;
    const epdd = optName(c.epdd, `campus ${k} epdd`); if (epdd) o.epdd = epdd;
    cast.campuses[k] = o;
  }
  const pk = Object.keys(raw.pms);
  if (pk.length < 1 || pk.length > LIMITS.pms) bad("invalid-cast", `PM count ${pk.length}`);
  for (const k of pk) {
    if (!SLOT_P.test(k)) bad("invalid-slot", `PM slot ${k.slice(0, 8)}`);
    const p = raw.pms[k];
    if (!isObj(p)) bad("invalid-cast", `PM ${k}`);
    const role = p.role === undefined ? "pm" : p.role;
    if (role !== "pm" && role !== "guest") bad("invalid-cast", `PM ${k} role`);
    const o = { name: cleanName(p.name, `PM ${k}`), role };
    const short = optName(p.short, `PM ${k} short`); if (short) o.short = short;
    const say = optName(p.say, `PM ${k} say`); if (say) o.say = say;
    cast.pms[k] = o;
  }
  for (const k of Object.keys(raw.team)) {
    if (!TEAM_KEYS.includes(k)) bad("invalid-slot", `team key ${k.slice(0, 16)}`);
    const t = raw.team[k];
    const name = isObj(t) ? t.name : t;
    cast.team[k] = { name: cleanName(name, `team ${k}`) };
  }
  if (raw.code !== undefined) {
    if (typeof raw.code !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(raw.code)) bad("invalid-cast", "cast code");
    cast.code = raw.code;
  }
  return cast;
}

// First bytes of each allowed type, so a mislabelled file (an HTML page called image/png) is refused.
async function sniff(blob, mime) {
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

export async function validateMediaItem(raw) {
  if (!isObj(raw)) bad("invalid-media", "item is not an object");
  const { key, host, mime, size, order, blob } = raw;
  if (typeof key !== "string" || !KEY_RE.test(key)) bad("invalid-media", "item key");
  if (typeof host !== "string" || !HOST_RE.test(host)) bad("invalid-media", `${key}: host`);
  if (!MEDIA_MIMES.includes(mime)) bad("invalid-media", `${key}: type`);
  if (!Number.isInteger(size) || size < 1 || size > LIMITS.itemBytes) bad("invalid-media", `${key}: size`);
  if (!Number.isInteger(order) || order < 0 || order >= LIMITS.items) bad("invalid-media", `${key}: order`);
  if (!(blob instanceof Blob) || blob.size !== size) bad("invalid-media", `${key}: file does not match its size`);
  if (!(await sniff(blob, mime))) bad("invalid-media", `${key}: file is not ${mime}`);
  // Re-wrapped with the declared (allow-listed) type: an object URL never serves anything else.
  return { key, host, mime, size, order, blob: new Blob([blob], { type: mime }) };
}

let started = false;

/**
 * Waits for the portal's hand-over. Resolves { cast, items, expect } or rejects with a HandoffError
 * (codes: no-nonce, used, timeout, invalid-*, protocol, too-many, too-large, count-mismatch).
 * onProgress({ phase: 'waiting' | 'media' | 'done', received, expect }) reports media as it arrives.
 */
// mediaIdleMs / totalMs leave room for the PMO's real videos (up to 50 MB each, four prepared at a
// time by the portal) on slow Wi-Fi: the idle timer restarts on every message.
export function waitForCast({ timeoutMs = 10000, mediaIdleMs = 90000, totalMs = 600000, onProgress } = {}) {
  const sim = window.__PMO_SIM__;
  const nonce = sim && sim.ok ? sim.nonce : null;
  if (!nonce) return Promise.reject(new HandoffError("no-nonce", "No hand-over in the address"));
  if (started) return Promise.reject(new HandoffError("used", "The hand-over has already been used"));
  started = true;

  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel("pmo-sim-" + nonce);
    let cast = null, expect = null, finished = false, queue = Promise.resolve();
    const items = [], keys = new Set();
    let bytes = 0;
    const timers = { cast: 0, idle: 0, total: 0, hello: 0 };
    const progress = (phase) => { try { onProgress?.({ phase, received: items.length, expect }); } catch { /* ignore */ } };
    const end = (err, value) => {
      if (finished) return;
      finished = true;
      Object.values(timers).forEach(clearTimeout);
      try { ch.close(); } catch { /* ignore */ }
      if (err) reject(err); else resolve(value);
    };
    const fail = (code, msg) => end(new HandoffError(code, msg));
    const armIdle = () => { clearTimeout(timers.idle); timers.idle = setTimeout(() => fail("timeout", "The photos stopped arriving"), mediaIdleMs); };

    timers.cast = setTimeout(() => fail("timeout", "The names did not arrive"), timeoutMs);
    timers.total = setTimeout(() => fail("timeout", "The hand-over took too long"), totalMs);
    let helloN = 0;
    const hello = () => {
      if (cast || finished) return;
      try { ch.postMessage({ type: "hello", v: 1, nonce }); } catch { /* ignore */ }
      helloN += 1;
      timers.hello = setTimeout(hello, Math.min(2000, 250 * 2 ** helloN));
    };

    const handle = async (m) => {
      if (finished) return;
      if (!isObj(m) || m.v !== 1 || m.nonce !== nonce || typeof m.type !== "string") return;
      if (m.type === "hello" || m.type === "ok") return;
      if (m.type === "cast") {
        if (cast) return;                     // exactly one cast per document; repeats are ignored
        cast = validateCast(m.cast);
        if (m.expect !== undefined) {
          if (!Number.isInteger(m.expect) || m.expect < 0 || m.expect > LIMITS.items) bad("protocol", "expect");
          expect = m.expect;
        }
        clearTimeout(timers.cast);
        clearTimeout(timers.hello);
        armIdle();
        progress("media");
        return;
      }
      if (!cast) bad("protocol", `${m.type} before the cast`);
      if (m.type === "media") {
        if (!Array.isArray(m.items) || m.items.length > LIMITS.items) bad("protocol", "media batch");
        for (const raw of m.items) {
          const it = await validateMediaItem(raw);
          if (keys.has(it.key)) bad("invalid-media", `${it.key}: sent twice`);
          keys.add(it.key);
          items.push(it);
          bytes += it.size;
          if (items.length > LIMITS.items) bad("too-many", `more than ${LIMITS.items} items`);
          if (bytes > LIMITS.totalBytes) bad("too-large", "more than 150 MB");
        }
        armIdle();
        progress("media");
        return;
      }
      if (m.type === "done") {
        if (!Number.isInteger(m.count) || m.count !== items.length) bad("count-mismatch", `${items.length} received, ${m.count} sent`);
        if (expect !== null && expect !== items.length) bad("count-mismatch", `${items.length} received, ${expect} expected`);
        try { ch.postMessage({ type: "ok", v: 1, nonce, count: items.length }); } catch { /* ignore */ }
        progress("done");
        end(null, { cast, items: items.slice().sort((a, b) => a.order - b.order), expect });
      }
      // Any other type is ignored.
    };

    // Messages are handled one at a time, in order (media checks are asynchronous).
    ch.onmessage = (e) => {
      queue = queue.then(() => handle(e.data)).catch((err) =>
        fail(err instanceof HandoffError ? err.code : "protocol", err?.message || "hand-over failed"));
    };
    ch.onmessageerror = () => fail("protocol", "a message could not be read");
    progress("waiting");
    hello();
  });
}
