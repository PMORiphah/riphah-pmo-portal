// PMO Simulation (live data) tests: shared set-up for the simulation-tab tests (validate, handoff,
// backend). PUBLIC: no data. Owner: B2.
//
//   nodeWindow()                    browser-like globals for src/sim/backend.js and handoff.js in Node
//   syntheticSnapshot()             a complete, valid snapshot from invented data (scripts/sim/live/
//                                   synthetic.mjs), read through the real snapshot reader with the
//                                   synthetic backend's engine as the server; with real (tiny) media blobs
//   fixtureSnapshot(dir, opts)      the same over the private fixture in SIM_FIXTURE (never in the repo)
//   fakeMediaBytes(row)             a few bytes that start like the row's file type
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../../../src/", import.meta.url);
export const SUPA = "https://prmxkecomqqngvrmytcj.supabase.co";
export const SIM_URL = "http://127.0.0.1:9/riphah-pmo-portal/preview/simulation.html";

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

let installedWindow = null;
/** Browser-like globals (idempotent). Anything the backend passes through to the "network" is recorded
 *  in `passthrough`; it must only ever be this page's own address or a blob: link. */
export function nodeWindow() {
  if (installedWindow) return installedWindow;
  const passthrough = [];
  globalThis.window = globalThis;
  globalThis.location = new URL(SIM_URL);
  globalThis.sessionStorage = memStore();
  globalThis.localStorage = memStore();
  const toasts = [];
  // A frozen stand-in for what public/sim-boot.js publishes (only what these modules read).
  globalThis.__PMO_SIM__ = { ok: true, nonce: null, guard: { toast: (m) => toasts.push(m), protect() {}, unprotect() {} } };
  globalThis.fetch = async (u) => { passthrough.push(String(u)); return new Response("same-site", { status: 200 }); };
  // Node has a real WebSocket: replaced before the backend is loaded, so nothing can ever connect.
  globalThis.WebSocket = class WebSocket extends EventTarget {
    constructor(u) { super(); this.url = String(u); this.readyState = 0; }
    send() {}
    close() { this.readyState = 3; }
  };
  Object.assign(globalThis.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  installedWindow = { passthrough, toasts };
  return installedWindow;
}

const MAGIC = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  "video/mp4": [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70],
  "video/webm": [0x1a, 0x45, 0xdf, 0xa3],
};
const mimeOf = (row) => {
  const m = String(row.mime_type || "").toLowerCase();
  if (MAGIC[m]) return m;
  const ext = String(row.file_name || "").split(".").pop().toLowerCase();
  return { png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" }[ext] || "image/jpeg";
};
/** A few bytes that start like the row's file type, then its id (so every item hashes differently). */
export function fakeMediaBytes(row) {
  const mime = mimeOf(row);
  return { mime, bytes: new Uint8Array([...MAGIC[mime], ...new TextEncoder().encode(String(row.id))]) };
}
/** readSnapshot's media callback over fake bytes; `blobs` collects Map(attachmentId → Blob). */
export async function fakeMedia() {
  const { sha256Hex } = await import(new URL("sim/live/canon.js", SRC));
  const blobs = new Map();
  const media = async (rows) => {
    const out = new Map();
    for (const r of rows) {
      const { mime, bytes } = fakeMediaBytes(r);
      const blob = new Blob([bytes], { type: mime });
      blobs.set(r.id, blob);
      out.set(r.id, { mime, size: blob.size, sha256: await sha256Hex(blob) });
    }
    return out;
  };
  return { media, blobs };
}

// The invented ids of synthetic.mjs, made into well-formed UUIDs (the validator accepts nothing else).
const fixId = (s) => (typeof s === "string" ? s.replace(/^([0-9a-f]{1,7})-0000-4000-8000-(\d{12})$/, (m, a, b) => `${a.padEnd(8, "0")}-0000-4000-8000-${b}`) : s);
const deepMap = (v, f) => (Array.isArray(v) ? v.map((x) => deepMap(x, f)) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x, f)])) : f(v));

const synthetic = new Map();
/** { snapshot, blobs, tables (as served), pmo, NOW } from invented data, read at `now` (default: the
 *  synthetic data's own day). Built once per `now` and process. */
export async function syntheticSnapshot({ now = null, build = "test-build" } = {}) {
  const ck = `${now}|${build}`;
  if (synthetic.has(ck)) return synthetic.get(ck);
  nodeWindow();
  const S = await import(new URL("./synthetic.mjs", import.meta.url));
  const tables = deepMap(S.syntheticTables(), fixId);
  const pmo = { id: fixId(S.IDS.user(1)), username: "PMO", full_name: "Office Lead" };
  const testAccounts = [fixId(S.IDS.user(5))];
  // The server: the synthetic backend's own engine over the invented tables (no recorded responses).
  const B = await import(new URL("sim/backend.js", SRC));
  const server = B.installBackend({ store: { tables: structuredClone(tables), meta: { pmo } }, mediaUrls: {}, responses: [], rpc: {} });
  B.prepareSession({ meta: { pmo } });
  const tok = JSON.parse(sessionStorage.getItem("pmo_session")).access_token;
  const get = async (p) => {
    const r = await fetch(SUPA + p, { headers: { Authorization: "Bearer " + tok } });
    return { status: r.status, contentRange: r.headers.get("content-range"), body: await r.json() };
  };
  const { readSnapshot } = await import(new URL("sim/live/snapshot.js", SRC));
  const { media, blobs } = await fakeMedia();
  const t = now ?? S.NOW;
  const snapshot = await readSnapshot({ get, pmo, build, now: () => t, testAccounts, media });
  server.uninstall();
  const out = { snapshot, blobs, tables, pmo, NOW: S.NOW };
  synthetic.set(ck, out);
  return out;
}

/** { snapshot, blobs } over the private fixture directory (contract §K). */
export async function fixtureSnapshot(dir, { now = null, build = "test-build" } = {}) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const FT = read("fixture-tables.json");
  const FR = read("fixture-responses.json");
  const { keyOf } = await import(new URL("sim/live/requests.js", SRC));
  const byKey = new Map(FR.items.map((i) => [i.key, i]));
  const get = async (p) => {
    const i = byKey.get(keyOf(p));
    return i ? { status: i.status, contentRange: i.contentRange, body: structuredClone(i.body) } : { status: 404, contentRange: null, body: { message: "not in fixture" } };
  };
  const { readSnapshot } = await import(new URL("sim/live/snapshot.js", SRC));
  const { media, blobs } = await fakeMedia();
  const pmo = { id: FT.meta.me, username: "PMO", full_name: null };
  const t = now ?? FT.meta.takenAt;
  const snapshot = await readSnapshot({ get, pmo, build, now: () => t, testAccounts: FT.meta.testAccountsDetected, media });
  return { snapshot, blobs, FT, FR, get };
}

/** The items handoff.js would hold for a snapshot: Map(key → { key, attachmentId, mime, size, sha256, blob }). */
export function itemsOf(snapshot, blobs) {
  return new Map(snapshot.media.map((m) => [m.key, { ...m, blob: blobs.get(m.attachmentId) }]));
}
