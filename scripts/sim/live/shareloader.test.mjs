// PMO Simulation shared with guests: the portal-tab side (src/simShare.js) against a fake storage
// and REST server (fetch stub) and a simulation tab on a real BroadcastChannel (Node has one): a
// fake tab that records every message, and the real receiver (src/sim/handoff.js).
// PUBLIC: no data here. The fixture parts read a private fixture; point SIM_FIXTURE at it:
//   SIM_FIXTURE=<dir> node scripts/sim/live/shareloader.test.mjs
// No network: every request is answered by the stub, and anything unexpected fails the test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── the browser globals the modules touch (set before they are imported) ──
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.sessionStorage = memStore();
globalThis.localStorage = memStore();
const BUILD = "index-TESTBUILD.js";
const opened = [];
let onOpen = null;                                   // (nonce) → starts the simulation tab of the test
globalThis.window = { open: (url, name, features) => { opened.push({ url, name, features }); onOpen?.(/#k=([0-9a-f-]+)$/.exec(url)?.[1]); return null; } };
globalThis.document = { querySelector: (sel) => (String(sel).includes("/assets/index-") ? { src: "https://portal.example/app/assets/" + BUILD + "?v=1" } : null) };
const network = [];
let server = async (u) => { throw new Error("no network in this test: " + u); };
// Requests for Cloudflare R2 links (src/fileLinks.js → edge function `files`) are kept apart: by default the
// function has no link, so the files come from Supabase Storage exactly as before.
const FILES_FN = "https://prmxkecomqqngvrmytcj.supabase.co/functions/v1/files";
const linkRequests = [];
let linkServer = async () => ({ urls: {} });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || "GET").toUpperCase();
  const req = { url: u, method, headers: opts.headers || {}, body: opts.body, cache: opts.cache, credentials: opts.credentials };
  if (u === FILES_FN) {
    linkRequests.push(req);
    return new Response(JSON.stringify(await linkServer(JSON.parse(req.body))), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  network.push(req);
  return server(u, method, req);
};

const SRC = new URL("../../../src/", import.meta.url);
const S = await import(new URL("simShare.js", SRC));
const B = await import(new URL("simBridge.js", SRC));
const { SUPA_ORIGIN } = await import(new URL("sim/live/requests.js", SRC));
const { sha256Hex } = await import(new URL("sim/live/canon.js", SRC));

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_ID = "5a5a5a5a-0000-4000-8000-000000000001";
const GUEST = "6b6b6b6b-0000-4000-8000-000000000002";
const OTHER_GUEST = "6b6b6b6b-0000-4000-8000-000000000003";
const TOKEN = "test-token-not-a-jwt";
const json = (body, status = 200, headers = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const signIn = (user_id, role) => sessionStorage.setItem("pmo_session", JSON.stringify({ user_id, role, username: role, access_token: TOKEN,
  refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600 }));

// A fake simulation tab: says hello (this build), records every message, confirms 'done' like the real one.
function fakeSim(nonce, { build = BUILD, confirm = true } = {}) {
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  const got = [];
  let man = null, settle;
  const ended = new Promise((r) => { settle = r; });
  ch.onmessage = (e) => {
    const m = e.data;
    got.push(m);
    if (m?.type === "manifest") man = m;
    if (m?.type === "done") { if (confirm) ch.postMessage({ type: "ok", v: 2, nonce, fingerprint: man?.fingerprint }); settle(); }
    if (m?.type === "refused") settle();
  };
  ch.postMessage({ type: "hello", v: 2, nonce, build });
  return { ch, got, ended, close: () => ch.close() };
}

// ── data-free checks ─────────────────────────────────────────────────────────
await test("dates in Pakistan time: as of and until", () => {
  const t = Date.UTC(2026, 9, 19, 9, 5);
  assert.equal(S.asOfText(t), "19 Oct, 14:05 PKT");
  assert.equal(S.asOfText(iso(t)), "19 Oct, 14:05 PKT");
  assert.equal(S.dayText(t + 7 * DAY), "Mon 26 Oct");
  assert.equal(S.asOfText("not a date"), "");
});

const rowFor = (over = {}) => ({ id: SHARE_ID, status: "active", as_at: iso(Date.now() - DAY), expires_at: iso(Date.now() + 6 * DAY), build: BUILD,
  code: "ABCDEF", voice: "on", media_count: 0, media_bytes: 0, json_bytes: 10, fingerprint: "0".repeat(64),
  activated_at: iso(Date.now() - DAY + 60000), created_at: iso(Date.now() - DAY + 30000), ...over });

await test("the sign-in poll: own, not-removed row with its share; nothing for no row, an expired share or a bad id", async () => {
  const asked = [];
  const get = (rows) => async (p) => { asked.push(p); return rows; };
  const r = await S.pollShare({ get: get([{ share_id: SHARE_ID, seen_at: null, opened_at: null, sim_shares: rowFor() }]), userId: GUEST });
  assert.equal(r.share.id, SHARE_ID);
  assert.equal(r.share.build, BUILD);
  assert.deepEqual(r.recipient, { seen_at: null, opened_at: null });
  const p = asked[0];
  assert.ok(p.startsWith("/rest/v1/sim_share_recipients?user_id=eq." + GUEST + "&removed=is.false&select=share_id,seen_at,opened_at,sim_shares!inner("), p);
  assert.ok(p.endsWith("&sim_shares.site=eq.%2F&order=added_at.desc&limit=1"), "this site's share only (Node: base path /)");
  assert.ok(S.pollPath(GUEST, "/app/preview/").includes("&sim_shares.site=eq.%2Fapp%2Fpreview%2F&"));
  assert.equal(await S.pollShare({ get: get([{ share_id: SHARE_ID, sim_shares: rowFor({ site: "/app/preview/" }) }]), userId: GUEST }), null,
    "another site's share is never played here");
  assert.equal(await S.pollShare({ get: get([]), userId: GUEST }), null);
  assert.equal(await S.pollShare({ get: get([{ share_id: SHARE_ID, sim_shares: rowFor({ expires_at: iso(Date.now() - 1000) }) }]), userId: GUEST }), null);
  assert.equal(await S.pollShare({ get: get([{ share_id: SHARE_ID, sim_shares: rowFor({ status: "withdrawn" }) }]), userId: GUEST }), null);
  const before = asked.length;
  assert.equal(await S.pollShare({ get: get([]), userId: "not-a-uuid" }), null);
  assert.equal(asked.length, before, "no request without a user id");
});

await test("before the hand-over modules load: 'loading', and a click opens nothing", async () => {
  assert.equal(S.sharedReady(), false);
  assert.equal(S.buildState(rowFor()), "loading");
  await assert.rejects(S.launchShared({ share: rowFor() }), (e) => e.code === "loading");
  assert.equal(opened.length, 0);
});

await S.preloadShared();

await test("build lock: this build plays; an older share says 'being updated', one made after this tab loaded says 'reload'", () => {
  assert.equal(S.buildState(rowFor()), "ok");
  assert.equal(S.buildState(rowFor({ build: "index-OLDER.js", activated_at: iso(performance.timeOrigin - DAY) })), "updating");
  assert.equal(S.buildState(rowFor({ build: "index-NEWER.js", activated_at: iso(Date.now() + 1000) })), "reload");
});

await test("another build or an expired share: rejected inside the click, no tab, no request", async () => {
  const n0 = network.length;
  await assert.rejects(S.launchShared({ share: rowFor({ build: "index-OLDER.js", activated_at: iso(performance.timeOrigin - DAY) }) }),
    (e) => e.code === "build-share" && e.message === S.TEXT.updating);
  await assert.rejects(S.launchShared({ share: rowFor({ build: "index-NEWER.js", activated_at: iso(Date.now() + 1000) }) }),
    (e) => e.code === "build-share" && e.message === S.TEXT.reload);
  await assert.rejects(S.launchShared({ share: rowFor({ expires_at: iso(Date.now() - 1) }) }), (e) => e.code === "expired");
  assert.equal(opened.length, 0, "no tab opened");
  assert.equal(network.length, n0, "nothing requested");
});

await test("no hello: the tab did not open (pop-ups); opened with noopener, never noreferrer", async () => {
  signIn(GUEST, "guest");
  server = async (u) => json({ message: "gone" }, 404);
  await assert.rejects(S.launchShared({ share: rowFor(), timing: { hello: 150, ok: 200 } }), (e) => e.code === "no-tab" || e.code === "withdrawn");
  assert.equal(opened.at(-1).features, "noopener");
  assert.equal(opened.at(-1).name, "pmo-simulation");
  assert.match(opened.at(-1).url, /^\/simulation\.html#k=[0-9a-f-]{36}$/);
  assert.equal(S._heldForTests(), 0);
});

const dir = process.env.SIM_FIXTURE;
if (!dir) { B.stopAll(); console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }

// ── over the private fixture ─────────────────────────────────────────────────
const { fixtureSnapshot } = await import(new URL("./b2-support.mjs", import.meta.url));
const H = await import(new URL("sim/handoff.js", SRC));
const takenAt = Date.now() - 2 * DAY;                        // a copy shared two days ago
const { snapshot, blobs } = await fixtureSnapshot(dir, { now: takenAt, build: BUILD });
const fileText = JSON.stringify(snapshot);
const share = rowFor({ as_at: iso(takenAt), expires_at: iso(takenAt + 7 * DAY), activated_at: iso(takenAt + 60000), created_at: iso(takenAt + 30000),
  code: snapshot.code, fingerprint: snapshot.fingerprint, media_count: snapshot.media.length,
  media_bytes: snapshot.media.reduce((a, m) => a + m.size, 0), json_bytes: new Blob([fileText]).size });
const shareInfo = { id: SHARE_ID, sharedAt: takenAt + 60000, expiresAt: takenAt + 7 * DAY, voice: "on" };

// The stored files of the share, and a server for them (plus the recipient row).
const files = new Map([[`${SHARE_ID}/snapshot.json`, new Blob([fileText], { type: "application/json" })],
  ...snapshot.media.map((m) => [`${SHARE_ID}/${m.key}`, blobs.get(m.attachmentId)])]);
const DOWNLOAD = SUPA_ORIGIN + "/storage/v1/object/authenticated/sim-shares/";
const guestServer = ({ files: f = files, deny = null } = {}) => async (u, method, req) => {
  assert.equal(req.headers.Authorization, "Bearer " + TOKEN);
  assert.ok(req.headers.apikey);
  if (method === "GET" && u.startsWith(DOWNLOAD)) {
    assert.equal(req.cache, "no-store");
    const p = u.slice(DOWNLOAD.length);
    if (deny && deny(p)) return json({ statusCode: "403", error: "Unauthorized" }, 403);
    const b = f.get(p);
    return b ? new Response(b, { status: 200 }) : json({ statusCode: "404", error: "not_found" }, 400);
  }
  if (method === "PATCH" && u.startsWith(SUPA_ORIGIN + "/rest/v1/sim_share_recipients?")) return json(null, 204);
  throw new Error("unexpected request: " + method + " " + u);
};
const blobSha = async (m) => (m.type === "media" ? { ...m, item: { ...m.item, blob: await sha256Hex(m.item.blob) } } : m);

await test("a guest's click: GET the stored files only, checked, then exactly messagesFor(…, shared) and one PATCH of their own row", async () => {
  signIn(GUEST, "guest");
  server = guestServer();
  const n0 = network.length;
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  const progress = [];
  const res = await S.launchShared({ share, getSession: () => null, onProgress: (p) => progress.push(p.phase), timing: { hello: 3000, ok: 4000 } });
  onOpen = null;
  await sim.ended;
  assert.equal(res.confirmed, true);
  assert.equal(res.code, snapshot.code);
  assert.equal(res.sent, snapshot.media.length);
  const nonce = /#k=(.+)$/.exec(opened.at(-1).url)[1];
  const got = sim.got.filter((m) => m.type !== "progress");
  const man = got[0];
  assert.equal(man.type, "manifest");
  assert.equal(man.mode, "shared");
  assert.deepEqual(man.share, shareInfo);
  assert.ok(UUID.test(man.refreshKey));
  // Exactly the messages the PMO's own Start would send for this snapshot, marked shared.
  const held = new Map(snapshot.media.map((m) => [m.attachmentId, { blob: blobs.get(m.attachmentId) }]));
  const want = B.messagesFor(snapshot, { nonce, refreshKey: man.refreshKey, held, mode: "shared", share: shareInfo }).messages;
  assert.deepEqual(await Promise.all(got.map(blobSha)), await Promise.all(want.map(blobSha)));
  assert.ok(sim.got.slice(0, sim.got.indexOf(man)).every((m) => m.type === "progress"), "only progress before the manifest");
  // Requests: storage GETs (snapshot + each file), then one PATCH on the guest's own row.
  const reqs = network.slice(n0);
  const gets = reqs.filter((r) => r.method === "GET");
  assert.equal(gets.length, snapshot.media.length + 1);
  assert.ok(gets.every((r) => r.url.startsWith(DOWNLOAD + SHARE_ID + "/")));
  const patches = reqs.filter((r) => r.method !== "GET");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].method, "PATCH");
  assert.equal(patches[0].url, `${SUPA_ORIGIN}/rest/v1/sim_share_recipients?share_id=eq.${SHARE_ID}&user_id=eq.${GUEST}`);
  assert.deepEqual(Object.keys(JSON.parse(patches[0].body)), ["last_used_at"]);
  assert.equal(reqs.at(-1), patches[0], "the PATCH comes last");
  // Nothing held, no refresh listener, nothing secret sent.
  assert.equal(S._heldForTests(), 0);
  assert.equal(B.listenerCount(), 0);
  const text = JSON.stringify(sim.got.map((m) => (m.type === "media" ? { ...m, item: { ...m.item, blob: null } } : m)));
  assert.ok(!text.includes(TOKEN) && !/\/object\/sign\/|token=/.test(text));
  assert.ok(progress.includes("downloading") && progress.includes("sending") && progress.includes("confirming"));
  assert.equal(globalThis.window.__PMO_SIM_SHARE__.phase, "ready");
  sim.close();
});

await test("with R2 links: the stored files come from R2 (each still checked), Supabase only for the PATCH", async () => {
  signIn(GUEST, "guest");
  const R2 = "https://acct.r2.cloudflarestorage.com/pmo-portal-files/sim-shares/";
  const base = guestServer();
  server = async (u, method, req) => {
    if (u.startsWith(R2)) {
      assert.equal(req.credentials, "omit");
      assert.equal(req.headers.Authorization, undefined, "no token to R2");
      const b = files.get(decodeURIComponent(u.slice(R2.length).split("?")[0]));
      return b ? new Response(b, { status: 200 }) : new Response("", { status: 404 });
    }
    return base(u, method, req);
  };
  linkServer = async (body) => {
    assert.equal(body.action, "sign");
    assert.equal(body.bucket, "sim-shares");
    return { urls: Object.fromEntries(body.paths.map((p) => [p, R2 + encodeURIComponent(p) + "?X-Amz-Signature=x"])) };
  };
  const n0 = network.length, l0 = linkRequests.length;
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  const res = await S.launchShared({ share, getSession: () => null, onProgress: () => {}, timing: { hello: 3000, ok: 4000 } });
  onOpen = null;
  await sim.ended;
  assert.equal(res.confirmed, true);
  assert.equal(res.sent, snapshot.media.length);
  const reqs = network.slice(n0);
  assert.equal(reqs.filter((r) => r.method === "GET" && r.url.startsWith(R2)).length, snapshot.media.length + 1);
  assert.equal(reqs.filter((r) => r.url.startsWith(DOWNLOAD)).length, 0, "nothing from Supabase Storage");
  assert.deepEqual(reqs.filter((r) => r.method !== "GET").map((r) => r.method), ["PATCH"]);
  assert.ok(linkRequests.length > l0);
  linkServer = async () => ({ urls: {} });
  sim.close();
});

await test("the real receiver (src/sim/handoff.js) accepts the shared copy two days after it was read", async () => {
  signIn(GUEST, "guest");
  server = guestServer();
  H._resetForTests();
  let rx = null;
  onOpen = (nonce) => { rx = H.waitForSnapshot({ nonce, build: BUILD }); };
  const res = await S.launchShared({ share, getSession: () => null, timing: { hello: 3000, ok: 8000 } });
  onOpen = null;
  const got = await rx;
  assert.equal(res.confirmed, true);
  assert.equal(got.mode, "shared");
  assert.deepEqual(got.share, shareInfo);
  assert.equal(got.snapshot.fingerprint, snapshot.fingerprint);
  assert.equal(got.items.size, snapshot.media.length);
  H._resetForTests();
});

await test("one changed byte in a stored photo: refused before anything is sent; the tab is told, nothing PATCHed", async () => {
  signIn(GUEST, "guest");
  const bad = new Map(files);
  const k = `${SHARE_ID}/${snapshot.media[0].key}`;
  const bytes = new Uint8Array(await bad.get(k).arrayBuffer());
  bytes[bytes.length - 1] ^= 0x01;
  bad.set(k, new Blob([bytes]));
  server = guestServer({ files: bad });
  const n0 = network.length;
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  await assert.rejects(S.launchShared({ share, getSession: () => null, timing: { hello: 3000, ok: 3000 } }), (e) => e.code === "media");
  onOpen = null;
  await sim.ended;
  assert.ok(sim.got.every((m) => m.type === "progress" || m.type === "refused"), "no manifest, no data");
  assert.equal(sim.got.at(-1).type, "refused");
  assert.equal(network.slice(n0).filter((r) => r.method !== "GET").length, 0);
  assert.equal(S._heldForTests(), 0);
  sim.close();
});

await test("403 on the data file (withdrawn, replaced or no longer a guest): 'withdrawn', and the tab hears it", async () => {
  signIn(GUEST, "guest");
  server = guestServer({ deny: (p) => p.endsWith("/snapshot.json") });
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  await assert.rejects(S.launchShared({ share, getSession: () => null, timing: { hello: 3000, ok: 3000 } }),
    (e) => e.code === "withdrawn" && e.message === S.TEXT.withdrawn);
  onOpen = null;
  await sim.ended;
  const r = sim.got.at(-1);
  assert.equal(r.type, "refused");
  assert.equal(r.code, "withdrawn");
  sim.close();
});

await test("the real receiver words a withdrawn share as the PMO stopping it", async () => {
  signIn(GUEST, "guest");
  server = guestServer({ deny: () => true });
  H._resetForTests();
  let rx = null;
  onOpen = (nonce) => { rx = H.waitForSnapshot({ nonce, build: BUILD }); rx.catch(() => {}); };
  await assert.rejects(S.launchShared({ share, getSession: () => null, timing: { hello: 3000, ok: 3000 } }), (e) => e.code === "withdrawn");
  onOpen = null;
  await assert.rejects(rx, (e) => e.code === "portal-refused" && e.portalCode === "withdrawn" && e.message === "The PMO has stopped sharing this simulation.");
  H._resetForTests();
});

await test("a stored file that does not match the share row (another fingerprint): refused as broken", async () => {
  signIn(GUEST, "guest");
  server = guestServer();
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  await assert.rejects(S.launchShared({ share: { ...share, fingerprint: "f".repeat(64) }, getSession: () => null, timing: { hello: 3000, ok: 3000 } }),
    (e) => e.code === "snapshot");
  onOpen = null;
  await sim.ended;
  assert.equal(sim.got.at(-1).type, "refused");
  sim.close();
});

await test("the PMO's own check of the shared copy: same hand-over, no recipient PATCH", async () => {
  signIn("7c7c7c7c-0000-4000-8000-000000000004", "pmo");
  server = guestServer();
  const n0 = network.length;
  let sim = null;
  onOpen = (nonce) => { sim = fakeSim(nonce); };
  const res = await S.launchShared({ share, getSession: () => null, timing: { hello: 3000, ok: 4000 } });
  onOpen = null;
  assert.equal(res.confirmed, true);
  assert.ok(network.slice(n0).every((r) => r.method === "GET"), "GET only");
  sim.close();
});

// ── the PMO's side: createShare over the fixture ─────────────────────────────
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const FT = read("fixture-tables.json");
const FR = read("fixture-responses.json");
const { keyOf } = await import(new URL("sim/live/requests.js", SRC));
const byKey = new Map(FR.items.map((i) => [i.key, i]));
const ME = { id: FT.meta.me, username: "PMO", full_name: null };
const siteVisit = FT.tables.project_attachments.filter((a) => a.kind === "site_visit");
async function itemFor(row) {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(row.id)])], { type: "image/jpeg" });
  return { blob, mime: "image/jpeg", size: blob.size, sha256: await sha256Hex(blob), sourcePath: row.file_path, sourceSize: Number(row.file_size) || blob.size };
}
const fakePrefetch = () => {
  const ready = new Map();
  return { ready, failed: new Map(), done: Promise.resolve(), cancelled: false,
    stats: () => ({ ready: siteVisit.length, failed: 0, total: siteVisit.length, bytes: 0, done: true }),
    async ensure(row) { if (!ready.has(row.id)) ready.set(row.id, await itemFor(row)); return ready.get(row.id); } };
};

// A PMO server: fixture reads, the share row, uploads (no overwrite), list, removal, the RPC, settings,
// and this site's index.html (the build it serves). Share rows keep a status, as the database would.
// activate: "ok" | "refused" (the RPC fails, nothing changes) | "lost" (it commits, the answer is lost).
function pmoServer({ failUpload = null, dropFirst = null, served = BUILD, activate = "ok", status = new Map() } = {}) {
  const stored = new Map(), calls = [], dropped = new Set();
  const handler = async (u, method, req) => {
    if (u === "/index.html" && method === "GET") {
      assert.equal(req.cache, "no-store");
      return new Response(`<!doctype html><script type="module" crossorigin src="/app/assets/${served}"></script>`, { status: 200 });
    }
    const p = u.slice(SUPA_ORIGIN.length);
    if (method === "GET" && p.startsWith("/rest/v1/sim_shares?id=eq.")) {
      const id = /id=eq\.([0-9a-f-]{36})/.exec(p)[1];
      calls.push({ method, p, body: null, headers: req.headers });
      return json(status.has(id) ? [{ status: status.get(id) }] : []);
    }
    if (p.startsWith("/rest/v1/") && method === "GET" && !p.startsWith("/rest/v1/rpc/")) {
      const i = byKey.get(keyOf(p));
      return i ? json(i.body, i.status, i.contentRange ? { "content-range": i.contentRange } : {}) : json({ message: "not in fixture" }, 404);
    }
    calls.push({ method, p, body: req.body instanceof Blob ? { blob: req.body.size, type: req.headers["Content-Type"] } : req.body ? JSON.parse(req.body) : null, headers: req.headers });
    if (method === "POST" && p === "/rest/v1/sim_shares") { status.set(JSON.parse(req.body).id, "uploading"); return json(null, 201); }
    if (method === "POST" && p.startsWith("/storage/v1/object/sim-shares/")) {
      const key = p.slice("/storage/v1/object/sim-shares/".length);
      assert.equal(req.headers["x-upsert"], "false");
      if (failUpload && failUpload(key)) return json({ message: "boom" }, 500);
      if (stored.has(key)) return json({ statusCode: "409", error: "Duplicate" }, 400);
      stored.set(key, req.body);
      if (dropFirst && dropFirst(key) && !dropped.has(key)) { dropped.add(key); throw new TypeError("network went away"); }
      return json({ Key: "sim-shares/" + key });
    }
    if (method === "POST" && p === "/storage/v1/object/list/sim-shares") {
      const prefix = JSON.parse(req.body).prefix + "/";
      return json([...stored].filter(([k]) => k.startsWith(prefix)).map(([k, b]) => ({ name: k.slice(prefix.length), id: "x" + k, metadata: { size: b.size } })));
    }
    if (method === "DELETE" && p === "/storage/v1/object/sim-shares") {
      const gone = JSON.parse(req.body).prefixes.filter((k) => stored.delete(k));
      return json(gone.map((name) => ({ name })));
    }
    if (method === "POST" && p === "/rest/v1/rpc/sim_share_activate") {
      const id = JSON.parse(req.body).p_share;
      if (activate === "refused") return json({ code: "P0001", message: "This simulation share is not ready to be shared" }, 400);
      if (status.get(id) === "uploading") status.set(id, "active");
      if (activate === "lost") throw new TypeError("the answer went missing");
      return json(null, 204);
    }
    if (method === "POST" && p === "/rest/v1/settings?on_conflict=key") return json(null, 201);
    if (method === "PATCH" && p.startsWith("/rest/v1/sim_shares?")) {
      const id = /id=eq\.([0-9a-f-]{36})/.exec(p)[1], want = /status=eq\.([a-z]+)/.exec(p)?.[1];
      const b = JSON.parse(req.body);
      const now = status.has(id) ? status.get(id) : "active";
      const hit = !want || now === want;
      if (hit && b.status) status.set(id, b.status);
      return /return=representation/.test(req.headers.Prefer || "") ? json(hit ? [{ id, status: status.get(id) ?? now }] : []) : json(null, 204);
    }
    throw new Error("unexpected request: " + method + " " + p);
  };
  return { stored, calls, handler, status };
}

const OLD = "5a5a5a5a-0000-4000-8000-0000000000aa";
let made = null;
await test("createShare: fresh read, row, media then snapshot (no overwrite; a lost answer's 409 counts as done), check, share, choices, old files", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ dropFirst: (k) => k.endsWith("/m002") });
  // The previous share's files, still in the bucket.
  srv.stored.set(`${OLD}/snapshot.json`, new Blob(["{}"]));
  srv.stored.set(`${OLD}/m001`, new Blob(["x"]));
  server = srv.handler;
  const phases = [];
  const result = await S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(),
    recipients: [GUEST, GUEST, OTHER_GUEST], voice: "off", previous: { id: OLD, media_count: 1, status: "active" },
    onProgress: (p) => phases.push(p.phase) });
  const row = srv.calls.find((c) => c.p === "/rest/v1/sim_shares").body;
  assert.deepEqual(Object.keys(row).sort(), ["as_at", "build", "code", "expires_at", "fingerprint", "id", "json_bytes", "media_bytes", "media_count", "site", "voice"]);
  assert.equal(row.build, BUILD);
  assert.equal(row.site, "/", "the share belongs to this site (Node: base path /)");
  assert.equal(network.filter((r) => r.url === "/index.html").length >= 1, true, "the served build was checked");
  assert.equal(row.voice, "off");
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.as_at), 7 * DAY);
  assert.equal(result.id, row.id);
  const uploads = srv.calls.filter((c) => c.method === "POST" && c.p.startsWith("/storage/v1/object/sim-shares/"));
  const names = [...new Set(uploads.map((c) => c.p.split("/").pop()))];
  assert.equal(names.length, row.media_count + 1);
  assert.equal(uploads.at(-1).p.endsWith("/snapshot.json"), true, "the snapshot goes last");
  assert.equal(uploads.at(-1).body.type, "application/json");
  assert.equal(uploads.filter((c) => c.p.endsWith("/m002")).length, 2, "m002 sent again after the lost answer");
  const stored = JSON.parse(await srv.stored.get(`${row.id}/snapshot.json`).text());
  assert.equal(stored.fingerprint, row.fingerprint);
  assert.equal(srv.stored.get(`${row.id}/snapshot.json`).size, row.json_bytes);
  const order = srv.calls.map((c) => c.p.split("?")[0]);
  const at = (x) => order.indexOf(x), last = (x) => order.lastIndexOf(x);
  assert.ok(at("/rest/v1/sim_shares") < at("/storage/v1/object/list/sim-shares"));
  const rpc = srv.calls.find((c) => c.p === "/rest/v1/rpc/sim_share_activate");
  assert.deepEqual(rpc.body, { p_share: row.id, p_recipients: [GUEST, OTHER_GUEST] });
  assert.ok(at("/storage/v1/object/list/sim-shares") < at("/rest/v1/rpc/sim_share_activate"), "checked before sharing");
  const set = srv.calls.find((c) => c.p === "/rest/v1/settings?on_conflict=key");
  assert.equal(set.body.key, "simulation_share");
  assert.deepEqual(Object.keys(set.body.value).sort(), ["leftOut", "overrides", "savedAt", "shareId", "testAccounts", "voice"]);
  assert.equal(set.body.value.shareId, row.id);
  assert.match(set.headers.Prefer, /merge-duplicates/);
  // The previous share's files are removed and recorded.
  const del = srv.calls.find((c) => c.method === "DELETE");
  assert.deepEqual(del.body.prefixes, [`${OLD}/snapshot.json`, `${OLD}/m001`]);
  assert.ok(last("/storage/v1/object/sim-shares") > at("/rest/v1/rpc/sim_share_activate"), "removed only after the new one is shared");
  assert.ok(srv.calls.some((c) => c.method === "PATCH" && c.p === `/rest/v1/sim_shares?id=eq.${OLD}` && c.body.files_removed_at));
  assert.equal(result.previousRemoved, true);
  assert.ok(phases.includes("reading") && phases.includes("uploading") && phases.includes("sharing"));
  made = { row, srv };
});

await test("round trip: the files createShare stored play for a guest through the real receiver", async () => {
  signIn(GUEST, "guest");
  const { row, srv } = made;
  const files2 = new Map([...srv.stored].filter(([k]) => k.startsWith(row.id + "/")));
  server = guestServer({ files: files2 });
  const now = Date.now();
  const sh = { ...row, status: "active", activated_at: iso(now), created_at: iso(now - 1000) };
  H._resetForTests();
  let rx = null;
  onOpen = (nonce) => { rx = H.waitForSnapshot({ nonce, build: BUILD }); };
  const res = await S.launchShared({ share: sh, getSession: () => null, timing: { hello: 3000, ok: 8000 } });
  onOpen = null;
  const got = await rx;
  assert.equal(res.confirmed, true);
  assert.equal(got.share.voice, "off");
  assert.equal(got.snapshot.fingerprint, row.fingerprint);
  H._resetForTests();
});

await test("createShare: an upload that keeps failing withdraws the row and removes what was uploaded; nothing is shared", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ failUpload: (k) => k.endsWith("/m003") });
  server = srv.handler;
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), recipients: [GUEST] }),
    (e) => e.code === "upload");
  const row = srv.calls.find((c) => c.p === "/rest/v1/sim_shares").body;
  assert.ok(srv.calls.some((c) => c.method === "PATCH" && c.p === `/rest/v1/sim_shares?id=eq.${row.id}&status=eq.uploading` && c.body.status === "withdrawn"));
  assert.ok(!srv.calls.some((c) => c.p === "/rest/v1/rpc/sim_share_activate"), "never shared");
  assert.ok(!srv.calls.some((c) => c.p.startsWith("/rest/v1/settings")), "choices not saved");
  assert.equal([...srv.stored.keys()].filter((k) => k.startsWith(row.id + "/")).length, 0, "uploaded files removed");
});

await test("createShare: a changed approved review stops it before anything is written", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer();
  server = srv.handler;
  const plan = { ...snapshot.plan, risks: { ...(snapshot.plan.risks || {}), rowId: "x" } };
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(),
    approved: plan, recipients: [GUEST] }), (e) => e.code === "review-changed");
  assert.equal(srv.calls.length, 0, "no write");
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, recipients: [] }), (e) => e.code === "no-guests");
});

await test("createShare: a tab that runs an older build than the site now serves refuses before anything is written", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ served: "index-NEWER.js" });
  server = srv.handler;
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), recipients: [GUEST] }),
    (e) => e.code === "stale-tab" && e.message === S.TEXT.staleTab);
  assert.equal(srv.calls.length, 0, "no write");
  assert.equal(await S.servedBuild(), "index-NEWER.js");
  server = async () => { throw new TypeError("offline"); };
  assert.equal(await S.servedBuild(), null, "unknown when the page cannot be read (then the share goes ahead)");
});

await test("createShare: the last step refused (row still uploading): withdrawn as the database confirms, its files removed", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ activate: "refused" });
  server = srv.handler;
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), recipients: [GUEST] }),
    (e) => e.code === "failed" && /not ready/.test(e.message));
  const row = srv.calls.find((c) => c.p === "/rest/v1/sim_shares").body;
  const w = srv.calls.find((c) => c.method === "PATCH" && c.p === `/rest/v1/sim_shares?id=eq.${row.id}&status=eq.uploading`);
  assert.ok(w && w.body.status === "withdrawn" && /return=representation/.test(w.headers.Prefer), "withdrawn, and the database says so");
  assert.equal(srv.status.get(row.id), "withdrawn");
  assert.equal([...srv.stored.keys()].filter((k) => k.startsWith(row.id + "/")).length, 0, "its files removed");
  assert.ok(!srv.calls.some((c) => c.p.startsWith("/rest/v1/settings")), "choices not saved");
});

await test("createShare: shared, but the answer was lost on the way back: nothing withdrawn or removed, reported as shared", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ activate: "lost" });
  srv.stored.set(`${OLD}/snapshot.json`, new Blob(["{}"]));
  server = srv.handler;
  const result = await S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(),
    recipients: [GUEST], previous: { id: OLD, media_count: 0, status: "active" } });
  const row = srv.calls.find((c) => c.p === "/rest/v1/sim_shares").body;
  assert.equal(result.id, row.id);
  assert.equal(srv.status.get(row.id), "active", "still active: the withdrawal matched no row");
  assert.equal([...srv.stored.keys()].filter((k) => k.startsWith(row.id + "/")).length, row.media_count + 1, "its files kept");
  assert.ok(!srv.calls.some((c) => c.method === "DELETE" && c.body.prefixes.some((k) => k.startsWith(row.id + "/"))), "none of its files deleted");
  assert.ok(srv.calls.some((c) => c.method === "GET" && c.p === `/rest/v1/sim_shares?id=eq.${row.id}&select=status`), "its status read back");
  assert.ok(srv.calls.some((c) => c.p === "/rest/v1/settings?on_conflict=key"), "choices saved");
  assert.equal(result.previousRemoved, true, "the previous copy tidied as after any share");
  // The status cannot be read either: not claimed as shared, and still nothing removed.
  const srv2 = pmoServer({ activate: "lost" });
  server = async (u, method, req) => (method === "GET" && u.includes("/rest/v1/sim_shares?id=eq.") ? json({ message: "down" }, 503)
    : method === "PATCH" ? Promise.reject(new TypeError("offline")) : srv2.handler(u, method, req));
  await assert.rejects(S.createShare({ pmo: ME, getSession: () => null, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), recipients: [GUEST] }),
    (e) => e.code === "unsure" && e.message === S.TEXT.unsure);
  const row2 = srv2.calls.find((c) => c.p === "/rest/v1/sim_shares").body;
  assert.equal([...srv2.stored.keys()].filter((k) => k.startsWith(row2.id + "/")).length, row2.media_count + 1, "its files kept");
});

await test("a click on a copy the PMO has since replaced: 'replaced' (not 'stopped sharing'), the tab hears it; asked once", async () => {
  signIn(GUEST, "guest");
  server = guestServer({ deny: () => true });
  const newer = rowFor({ id: "5a5a5a5a-0000-4000-8000-000000000009" });
  let asked = 0;
  H._resetForTests();
  let rx = null;
  onOpen = (nonce) => { rx = H.waitForSnapshot({ nonce, build: BUILD }); rx.catch(() => {}); };
  await assert.rejects(S.launchShared({ share, getSession: () => null, recheck: async () => { asked++; return newer; }, timing: { hello: 3000, ok: 3000 } }),
    (e) => e.code === "replaced" && e.message === S.TEXT.replaced);
  onOpen = null;
  assert.equal(asked, 1);
  await assert.rejects(rx, (e) => e.code === "portal-refused" && e.portalCode === "replaced" && e.message === H.TEXT.replaced);
  H._resetForTests();
  // The same copy, nothing, an expired one or a failed check: still "stopped sharing".
  for (const answer of [async () => share, async () => null, async () => rowFor({ id: newer.id, expires_at: iso(Date.now() - 1) }), async () => { throw new Error("x"); }]) {
    let sim = null;
    onOpen = (nonce) => { sim = fakeSim(nonce); };
    await assert.rejects(S.launchShared({ share, getSession: () => null, recheck: answer, timing: { hello: 3000, ok: 3000 } }), (e) => e.code === "withdrawn");
    onOpen = null;
    await sim.ended;
    assert.equal(sim.got.at(-1).code, "withdrawn");
    sim.close();
  }
  assert.equal(S._heldForTests(), 0);
});

await test("loadShareState: this site's share, guests, choices and whether files can be removed; expired and ended copies tidied", async () => {
  signIn(ME.id, "pmo");
  const calls = [], stored = new Map([[`${SHARE_ID}/snapshot.json`, new Blob(["{}"])], [`${OLD}/snapshot.json`, new Blob(["{}"])], [`${OLD}/m001`, new Blob(["x"])]]);
  let ready = true;
  server = async (u, method, req) => {
    const p = u.slice(SUPA_ORIGIN.length);
    calls.push({ method, p, body: req.body ? JSON.parse(req.body) : null });
    if (method === "GET" && p.startsWith("/rest/v1/sim_shares?status=eq.active&site=eq.%2F&select=")) {
      assert.ok(p.includes(",site,files_removed_at&"));
      return json([rowFor({ site: "/", files_removed_at: null, expires_at: iso(Date.now() - 1000), media_count: 0 })]);
    }
    if (method === "GET" && p.startsWith(`/rest/v1/sim_share_recipients?share_id=eq.${SHARE_ID}&removed=is.false`)) return json([{ user_id: GUEST, added_at: iso(Date.now()), counter: 0 }]);
    if (method === "GET" && p.startsWith("/rest/v1/user_profiles?id=in.(")) return json([{ id: GUEST, full_name: null, username: "guest", role: "guest", is_active: true }]);
    if (method === "GET" && p.startsWith("/rest/v1/settings?key=eq.simulation_share")) return json([{ value: { shareId: SHARE_ID, voice: "off", leftOut: [], testAccounts: [], overrides: {} } }]);
    if (method === "POST" && p === "/rest/v1/rpc/sim_share_cleanup_ready") return ready === null ? json({ message: "x" }, 500) : json(ready);
    if (method === "GET" && p.startsWith("/rest/v1/sim_shares?site=eq.%2F&status=in.(replaced,withdrawn)&files_removed_at=is.null")) return json([{ id: OLD, media_count: 1, status: "replaced" }]);
    if (method === "DELETE" && p === "/storage/v1/object/sim-shares") return json(JSON.parse(req.body).prefixes.filter((k) => stored.delete(k)).map((name) => ({ name })));
    if (method === "POST" && p === "/storage/v1/object/list/sim-shares") {
      const prefix = JSON.parse(req.body).prefix + "/";
      return json([...stored].filter(([k]) => k.startsWith(prefix)).map(([k]) => ({ name: k.slice(prefix.length), id: "x" + k, metadata: {} })));
    }
    if (method === "PATCH" && p.startsWith("/rest/v1/sim_shares?id=eq.")) return json(null, 204);
    throw new Error("unexpected request: " + method + " " + p);
  };
  const v = await S.loadShareState({ getSession: () => null });
  assert.equal(v.share.id, SHARE_ID);
  assert.equal(v.share.site, "/");
  assert.equal(v.cleanupReady, true);
  assert.equal(v.recipients.length, 1);
  assert.equal(v.saved.voice, "off");
  assert.equal(await S.tidyExpired({ share: v.share, getSession: () => null }), true, "an expired share's files go");
  assert.ok(!stored.has(`${SHARE_ID}/snapshot.json`));
  assert.ok(calls.some((c) => c.method === "PATCH" && c.p === `/rest/v1/sim_shares?id=eq.${SHARE_ID}` && c.body.files_removed_at && !c.body.status), "recorded; the share stays active (Replace keeps its guests)");
  assert.equal(await S.tidyExpired({ share: rowFor(), getSession: () => null }), false, "a share still playing keeps its files");
  assert.equal(await S.tidyEnded({ getSession: () => null }), 1, "an ended copy whose files were left is tidied");
  assert.ok(!stored.has(`${OLD}/m001`));
  for (const r of [false, null]) { ready = r; assert.equal((await S.loadShareState({ getSession: () => null })).cleanupReady, false); }
});

await test("stop sharing a copy that had already ended (an old view): says so, nothing removed", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer({ status: new Map([[SHARE_ID, "replaced"]]) });
  server = srv.handler;
  await assert.rejects(S.stopSharing({ share, getSession: () => null }), (e) => e.message === S.TEXT.alreadyEnded);
  assert.ok(!srv.calls.some((c) => c.method === "DELETE"));
});

await test("stop sharing, add and remove guests: one request each, on the right rows", async () => {
  signIn(ME.id, "pmo");
  const srv = pmoServer();
  server = srv.handler;
  const r = await S.stopSharing({ share: { ...share, media_count: 2 }, getSession: () => null });
  assert.equal(r.filesRemoved, true);
  assert.deepEqual(srv.calls[0], { ...srv.calls[0], method: "PATCH", p: `/rest/v1/sim_shares?id=eq.${SHARE_ID}&status=eq.active` });
  assert.deepEqual(srv.calls[0].body, { status: "withdrawn" });
  srv.calls.length = 0;
  assert.equal(await S.addRecipients({ shareId: SHARE_ID, userIds: [GUEST], getSession: () => null }), 1);
  assert.deepEqual(srv.calls.map((c) => [c.method, c.p, c.body]), [["POST", "/rest/v1/rpc/sim_share_activate", { p_share: SHARE_ID, p_recipients: [GUEST] }]]);
  srv.calls.length = 0;
  server = async (u, method, req) => { srv.calls.push({ method, p: u.slice(SUPA_ORIGIN.length), body: JSON.parse(req.body) }); return json(null, 204); };
  await S.removeRecipient({ shareId: SHARE_ID, userId: GUEST, getSession: () => null });
  assert.deepEqual(srv.calls, [{ method: "PATCH", p: `/rest/v1/sim_share_recipients?share_id=eq.${SHARE_ID}&user_id=eq.${GUEST}`, body: { removed: true } }]);
});

B.stopAll();
assert.equal(S._heldForTests(), 0);
console.log(`PASS · ${passed} checks`);
process.exit(0);
