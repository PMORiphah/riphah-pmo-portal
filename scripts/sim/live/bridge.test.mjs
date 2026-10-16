// PMO Simulation (live data): the portal side of protocol v2 (src/simBridge.js) against a fake
// simulation tab on a real BroadcastChannel (Node has one). Contract §C, §D.2, §D.3.
// PUBLIC: no data here. The end-to-end part reads a private fixture; point SIM_FIXTURE at it:
//   SIM_FIXTURE=<dir> node scripts/sim/live/bridge.test.mjs
// No network: fetch is replaced by a stub that serves the fixture and fails on anything else.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── the browser globals the bridge touches (set before it is imported) ──
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.sessionStorage = memStore();
globalThis.localStorage = memStore();
const opened = [];
globalThis.window = { open: (url, name, features) => { opened.push({ url, name, features }); return null; } };
globalThis.document = { querySelector: () => null };
const network = [];
globalThis.fetch = async (url, opts = {}) => { network.push({ url: String(url), method: opts.method || "GET" }); throw new Error("no network in this test: " + url); };

const B = await import(new URL("../../../src/simBridge.js", import.meta.url));
const { CAPS } = await import(new URL("../../../src/sim/live/schema.js", import.meta.url));
const { keyOf, SUPA_ORIGIN } = await import(new URL("../../../src/sim/live/requests.js", import.meta.url));
const { fingerprintOf, sha256Hex } = await import(new URL("../../../src/sim/live/canon.js", import.meta.url));

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonceOf = (o) => /#k=([0-9a-f-]+)$/.exec(o.url)[1];

// A fake simulation tab: says hello, records every message, answers when told.
function fakeSim(nonce, { build = "dev", v = 2, onMessage } = {}) {
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  const got = [];
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  ch.onmessage = (e) => { got.push(e.data); onMessage?.(e.data, ch); if (e.data?.type === "done" || (e.data?.type === "manifest" && !e.data.fingerprint)) resolveDone(); };
  ch.postMessage(v === 2 ? { type: "hello", v: 2, nonce, build } : { type: "hello", v: 1, nonce });
  return { ch, got, done, close: () => ch.close() };
}

// ── data-free checks ─────────────────────────────────────────────────────────
await test("prefetch order: the Gallery subject's items first, then photos newest first, then videos smallest first", () => {
  const rows = [
    { id: "p1", mime_type: "image/jpeg", uploaded_at: "2026-01-01", project_id: "x" },
    { id: "v1", mime_type: "video/mp4", file_size: 900, uploaded_at: "2026-01-05", project_id: "x" },
    { id: "p2", mime_type: "image/png", uploaded_at: "2026-01-03", project_id: "y" },
    { id: "v2", mime_type: "video/mp4", file_size: 100, uploaded_at: "2026-01-02", project_id: "x" },
    { id: "p3", mime_type: "image/jpeg", uploaded_at: "2026-01-04", project_id: "z" },
    { id: "d1", mime_type: "application/pdf", uploaded_at: "2026-01-06", project_id: "x" },
  ];
  assert.deepEqual(B.prefetchOrder(rows, ["p1", "v1"]).map((r) => r.id), ["v1", "p1", "p3", "p2", "v2", "d1"]);
  const tables = { projects: [{ id: "x", campus: "A" }, { id: "y", campus: "B" }, { id: "z", campus: "A" }] };
  assert.deepEqual(B.galleryFirstIds(rows, tables, { gallery: { campus: "A" } }), ["p1", "v1", "v2", "p3", "d1"]);
  assert.deepEqual(B.galleryFirstIds(rows, tables, { gallery: { campus: null } }), []);
});

await test("message plan: manifest, whole tables in parts under 2 MB, responses, rpc, media in key order, done", () => {
  const big = Array.from({ length: 1400 }, (_, i) => ({ id: "r" + i, text: "x".repeat(1000) }));     // ~1.4 MB
  const snapshot = {
    v: 2, build: "dev", takenAt: 1, readMs: 2, tz: "Asia/Karachi", pmo: { id: "me", username: "u", full_name: null }, mask: { contacts: true },
    testAccounts: [], overrides: {}, leftOut: 0, failed: 0, plan: { v: 1 }, invariants: [], fingerprint: "f".repeat(64), code: "ABCDEF", bytes: 10,
    tables: { a: big, b: big, c: [{ id: 1 }], d: [] },
    responses: Array.from({ length: 5 }, (_, i) => ({ key: "/rest/v1/t" + i, status: 200, contentRange: null, body: big.slice(0, 500) })),
    rpc: { project_has_deliverables: ["p"] },
    media: [{ attachmentId: "a1", key: "m001", mime: "image/jpeg", size: 3, sha256: "0".repeat(64) },
      { attachmentId: "a2", key: "m002", mime: "image/jpeg", size: 4, sha256: "1".repeat(64) }],
  };
  const held = new Map([["a1", { blob: new Blob(["abc"]) }], ["a2", { blob: new Blob(["abcd"]) }]]);
  const { messages, sent } = B.messagesFor(snapshot, { nonce: "n", refreshKey: "k", held, reuse: new Set(["a1"]) });
  const types = messages.map((m) => m.type);
  const man = messages[0];
  assert.equal(man.type, "manifest");
  assert.deepEqual(man.media.map((m) => [m.key, !!m.reuse]), [["m001", true], ["m002", false]]);
  const tparts = messages.filter((m) => m.type === "tables");
  assert.equal(man.parts.tables, tparts.length);
  assert.ok(tparts.length >= 2);
  assert.deepEqual(tparts.map((p) => [p.part, p.of]), tparts.map((_, i) => [i + 1, tparts.length]));
  for (const p of tparts) assert.ok(JSON.stringify(p).length <= CAPS.messageJson, "part under 2 MB");
  assert.deepEqual(tparts.flatMap((p) => Object.keys(p.tables)).sort(), ["a", "b", "c", "d"]);
  const rparts = messages.filter((m) => m.type === "responses");
  assert.equal(man.parts.responses, rparts.length);
  for (const p of rparts) assert.ok(JSON.stringify(p).length <= CAPS.messageJson);
  assert.equal(rparts.flatMap((p) => p.items).length, 5);
  const first = (t) => types.indexOf(t), last = (t) => types.lastIndexOf(t);
  assert.ok(first("manifest") < first("tables") && last("tables") < first("responses") && last("responses") < first("rpc") && first("rpc") < first("media") && last("media") < first("done"));
  assert.equal(sent, 1);
  assert.deepEqual(messages.filter((m) => m.type === "media").map((m) => m.item.key), ["m002"]);
  assert.deepEqual(messages.at(-1).counts, { tables: 4, responses: 5, media: 1 });
  assert.equal(man.counts.a, 1400);
  assert.equal(man.refreshKey, "k");
});

await test("portal build name is 'dev' without an entry script", () => { assert.equal(B.portalBuild(), "dev"); });

const pmo = { id: "11111111-1111-4111-8111-111111111111", username: "pmo", full_name: null };

await test("no hello: the tab did not open (pop-ups)", async () => {
  await assert.rejects(B.launch({ pmo, timing: { hello: 150 } }), (e) => e.code === "no-tab" && e.message === B.NO_TAB_MESSAGE);
  assert.equal(opened.at(-1).features, "noopener");
  assert.match(opened.at(-1).url, /^\/simulation\.html#k=[0-9a-f-]{36}$/);
});

await test("a v1 simulation tab is refused as another build", async () => {
  const p = B.launch({ pmo, timing: { hello: 2000 } });
  const sim = fakeSim(nonceOf(opened.at(-1)), { v: 1 });
  await assert.rejects(p, (e) => e.code === "build" && e.message === B.BUILD_MESSAGE);
  sim.close();
});

await test("another build: only a bare manifest is sent, then the build message", async () => {
  const p = B.launch({ pmo, timing: { hello: 2000 } });
  const sim = fakeSim(nonceOf(opened.at(-1)), { build: "index-OTHER.js" });
  await assert.rejects(p, (e) => e.code === "build");
  await sim.done;
  assert.equal(sim.got.length, 1);
  assert.deepEqual(Object.keys(sim.got[0]).sort(), ["build", "nonce", "type", "v"]);
  sim.close();
});

assert.equal(network.length, 0, "no request made by the data-free checks");

const dir = process.env.SIM_FIXTURE;
if (!dir) { B.stopAll(); console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }

// ── end to end over the private fixture ──────────────────────────────────────
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const FT = read("fixture-tables.json");
const FR = read("fixture-responses.json");
const byKey = new Map(FR.items.map((i) => [i.key, i]));
const ME = { id: FT.meta.me, username: "PMO", full_name: null };
const TOKEN = "test-token-not-a-jwt";
const session = () => sessionStorage.setItem("pmo_session", JSON.stringify({ user_id: ME.id, role: "pmo", username: "PMO", access_token: TOKEN,
  refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
session();

let mutate = null;                      // (path, response) → response, for the refresh cases
const sizes = new Map();                // storage path → bytes served by the download stub
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || "GET").toUpperCase();
  network.push({ url: u, method });
  const h = opts.headers || {};
  if (u.startsWith(SUPA_ORIGIN + "/rest/v1/")) {
    assert.equal(method, "GET", "table reads only");
    assert.equal(opts.cache, "no-store");
    assert.equal(h.Authorization, "Bearer " + TOKEN);
    assert.ok(h.apikey);
    const p = u.slice(SUPA_ORIGIN.length);
    assert.ok(!p.startsWith("/rest/v1/rpc/"), "no RPC");
    const i = byKey.get(keyOf(p));
    let r = i ? { status: i.status, contentRange: i.contentRange, body: structuredClone(i.body) } : { status: 404, contentRange: null, body: { message: "not in fixture" } };
    if (mutate) r = mutate(p, r);
    return { status: r.status, headers: { get: (n) => (n.toLowerCase() === "content-range" ? r.contentRange : null) }, json: async () => r.body };
  }
  const sign = SUPA_ORIGIN + "/storage/v1/object/sign/project-attachments/";
  if (u.startsWith(sign) && method === "POST") {
    const p = decodeURIComponent(u.slice(sign.length));
    return { ok: true, status: 200, json: async () => ({ signedURL: "/object/sign/project-attachments/" + encodeURIComponent(p) + "?t=1" }) };
  }
  if (u.startsWith(SUPA_ORIGIN + "/storage/v1/object/sign/project-attachments/") && method === "GET") {
    assert.equal(opts.credentials, "omit");
    const p = decodeURIComponent(u.split("/project-attachments/")[1].split("?")[0]);
    const n = sizes.get(p) || 16;
    const bytes = new Uint8Array(n); bytes.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    return { ok: true, status: 200, blob: async () => new Blob([bytes], { type: "video/mp4" }) };
  }
  throw new Error("unexpected request: " + method + " " + u);
};

// Prepared items without a browser: a few JPEG-looking bytes per row (the real prefetch re-encodes).
const siteVisit = FT.tables.project_attachments.filter((a) => a.kind === "site_visit");
async function itemFor(row) {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(row.id)])], { type: "image/jpeg" });
  return { blob, mime: "image/jpeg", size: blob.size, sha256: await sha256Hex(blob), sourcePath: row.file_path, sourceSize: Number(row.file_size) || blob.size };
}
const fakePrefetch = () => {
  const ready = new Map();
  return {
    ready, failed: new Map(), done: Promise.resolve(),
    stats: () => ({ ready: siteVisit.length, failed: 0, total: siteVisit.length, bytes: 0, done: true }),
    async ensure(row) { if (!ready.has(row.id)) ready.set(row.id, await itemFor(row)); return ready.get(row.id); },
  };
};

// Reassembles what the fake tab received and answers like the simulation would (fingerprint check).
async function assemble(got) {
  const types = got.map((m) => m.type);
  const man = got.find((m) => m.type === "manifest");
  const tables = Object.assign({}, ...got.filter((m) => m.type === "tables").map((m) => m.tables));
  const responses = got.filter((m) => m.type === "responses").flatMap((m) => m.items);
  const rpc = got.find((m) => m.type === "rpc");
  const s = { ...man, v: 2, tables, responses, rpc: { project_has_deliverables: rpc.project_has_deliverables },
    media: man.media.map(({ attachmentId, key, mime, size, sha256 }) => ({ attachmentId, key, mime, size, sha256 })) };
  return { s, types, man, fp: await fingerprintOf(s) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let launchNonce = null, launchResult = null, launchMan = null;
await test("launch: hello → progress → manifest, parts, rpc, media, done → ok; fingerprint and code agree", async () => {
  const before = network.length;
  const p = B.launch({ pmo: ME, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), timing: { hello: 2000, ok: 4000 } });
  launchNonce = nonceOf(opened.at(-1));
  const sim = fakeSim(launchNonce);
  await sim.done;
  const { s, types, man, fp } = await assemble(sim.got);
  launchMan = man;
  assert.equal(types[0], "progress");
  const iMan = types.indexOf("manifest");
  assert.ok(types.slice(0, iMan).every((t) => t === "progress"));
  const after = types.slice(iMan);
  const order = ["manifest", "tables", "responses", "rpc", "media", "done"];
  const firstIdx = order.map((t) => after.indexOf(t));
  assert.deepEqual(firstIdx.slice().sort((a, b) => a - b), firstIdx, "protocol order");
  assert.ok(after.slice(1).every((t) => t !== "manifest" && t !== "progress"), "no progress after the manifest");
  assert.equal(fp.fingerprint, man.fingerprint);
  assert.equal(fp.code, man.code);
  assert.equal(sim.got.at(-1).fingerprint, man.fingerprint);
  assert.equal(man.parts.tables, types.filter((t) => t === "tables").length);
  assert.equal(man.parts.responses, types.filter((t) => t === "responses").length);
  assert.ok(UUID.test(man.refreshKey));
  const media = sim.got.filter((m) => m.type === "media");
  assert.equal(media.length, man.media.length);
  assert.deepEqual(media.map((m) => m.item.key), man.media.map((m) => m.key));
  for (const m of media) {
    assert.ok(m.item.blob instanceof Blob && m.item.blob.size === m.item.size);
    assert.equal(await sha256Hex(m.item.blob), m.item.sha256);
  }
  assert.deepEqual(sim.got.at(-1).counts, { tables: Object.keys(s.tables).length, responses: s.responses.length, media: media.length });
  for (const m of sim.got) { assert.equal(m.v, 2); assert.equal(m.nonce, launchNonce); }
  // No token, no storage path, no signed link anywhere in what was sent.
  const text = JSON.stringify(sim.got.map((m) => (m.type === "media" ? { ...m, item: { ...m.item, blob: null } } : m)));
  assert.ok(!text.includes(TOKEN) && !/\/object\/sign\/|token=/.test(text));
  sim.ch.postMessage({ type: "ok", v: 2, nonce: launchNonce, fingerprint: man.fingerprint });
  launchResult = await p;
  assert.equal(launchResult.confirmed, true);
  assert.equal(launchResult.code, man.code);
  assert.equal(launchResult.sent, media.length);
  assert.equal(B.listenerCount(), 1);
  assert.equal(globalThis.window.__PMO_SIM_LAUNCH__.phase, "ready");
  assert.ok(network.slice(before).every((r) => r.method === "GET" && r.url.startsWith(SUPA_ORIGIN + "/rest/v1/")), "GET /rest/v1 only");
  sim.close();
});
// Sends a refresh from the fake tab and collects the answer on HAND.req.
async function refresh(refreshKey, { answer = true, wait = 3000 } = {}) {
  const req = crypto.randomUUID();
  const reply = new BroadcastChannel("pmo-sim-" + launchNonce + "." + req);
  const got = [];
  const end = new Promise((r) => {
    reply.onmessage = (e) => { got.push(e.data); if (e.data.type === "refused" || e.data.type === "done") r(); };
    setTimeout(r, wait);
  });
  const hand = new BroadcastChannel("pmo-sim-" + launchNonce);
  hand.postMessage({ type: "refresh", v: 2, nonce: launchNonce, req, refreshKey });
  await end;
  if (answer && got.at(-1)?.type === "done") reply.postMessage({ type: "ok", v: 2, nonce: launchNonce, fingerprint: got.at(-1).fingerprint });
  await sleep(50);
  reply.close(); hand.close();
  return got;
}

await test("refresh: a wrong key gets no answer", async () => {
  const got = await refresh("not-the-key", { wait: 300 });
  assert.equal(got.length, 0);
});

await test("refresh: same data → every item reused, no media sent, same fingerprint inputs except the time", async () => {
  const got = await refresh(launchMan.refreshKey);
  const { man, types } = await assemble(got);
  assert.equal(got.at(-1).type, "done");
  assert.ok(man.media.length > 0 && man.media.every((m) => m.reuse === true));
  assert.equal(types.filter((t) => t === "media").length, 0);
  assert.deepEqual(man.media.map(({ reuse, ...m }) => m), launchMan.media.map(({ reuse, ...m }) => m));
  assert.equal(man.refreshKey, launchMan.refreshKey);
});

await test("refresh: one changed file is prepared again and sent alone", async () => {
  const video = siteVisit.find((a) => String(a.mime_type).startsWith("video/"));
  sizes.set(video.file_path, Number(video.file_size) + 7);
  mutate = (p, r) => {
    if (Array.isArray(r.body) && p.startsWith("/rest/v1/project_attachments?")) for (const a of r.body) if (a.id === video.id && "file_size" in a) a.file_size = Number(a.file_size) + 7;
    return r;
  };
  const got = await refresh(launchMan.refreshKey);
  mutate = null;
  const { man } = await assemble(got);
  const sent = got.filter((m) => m.type === "media");
  assert.deepEqual(sent.map((m) => m.item.attachmentId), [video.id]);
  assert.equal(sent[0].item.size, Number(video.file_size) + 7);
  assert.equal(man.media.filter((m) => !m.reuse).length, 1);
});

await test("refresh: a new message in the approved thread asks the PMO again", async () => {
  const plan = launchMan.plan;
  if (!plan.updates?.projectId) return;
  mutate = (p, r) => {
    if (Array.isArray(r.body) && p.startsWith("/rest/v1/comments?select=id,project_id,parent_id")) {
      r.body.push({ id: "22222222-2222-4222-8222-222222222222", project_id: plan.updates.projectId, parent_id: null, author_id: r.body[0]?.author_id ?? null,
        author_name: "x", author_role: "project_manager", body: "y", is_read_by_pmo: false, created_at: "2099-01-01T00:00:00+00:00", updated_at: null });
    }
    return r;
  };
  const got = await refresh(launchMan.refreshKey);
  mutate = null;
  assert.equal(got.at(-1).type, "refused");
  assert.equal(got.at(-1).code, "review-needed");
  assert.equal(got.at(-1).reason, B.REVIEW_MESSAGE);
});

await test("refresh: signed out → refused, nothing read", async () => {
  sessionStorage.removeItem("pmo_session");
  const before = network.length;
  const got = await refresh(launchMan.refreshKey);
  assert.equal(got.length, 1);
  assert.equal(got[0].code, "signed-out");
  assert.equal(network.length, before);
  session();
});

await test("bye ends the listener; stopAll closes everything", async () => {
  const hand = new BroadcastChannel("pmo-sim-" + launchNonce);
  hand.postMessage({ type: "bye", v: 2, nonce: launchNonce, refreshKey: "wrong" });
  await sleep(50);
  assert.equal(B.listenerCount(), 1);
  hand.postMessage({ type: "bye", v: 2, nonce: launchNonce, refreshKey: launchMan.refreshKey });
  await sleep(50);
  assert.equal(B.listenerCount(), 0);
  hand.close();
  B.stopAll();
});

await test("the simulation tab refusing the hand-over is reported with its reason", async () => {
  const p = B.launch({ pmo: ME, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), timing: { hello: 2000, ok: 3000 } });
  const n = nonceOf(opened.at(-1));
  const sim = fakeSim(n, { onMessage: (m, ch) => { if (m.type === "manifest") ch.postMessage({ type: "refused", v: 2, nonce: n, code: "schema", reason: "Refused for the test" }); } });
  await assert.rejects(p, (e) => e.code === "refused" && e.message === "Refused for the test");
  sim.close();
  assert.equal(B.listenerCount(), 0);
});

await test("changed approved content at Start: nothing is sent after the progress messages", async () => {
  const p = B.launch({ pmo: ME, testAccounts: FT.meta.testAccountsDetected, prefetch: fakePrefetch(), approved: { ...launchMan.plan, risks: { ...launchMan.plan.risks, rowId: "x" } },
    timing: { hello: 2000, ok: 3000 } });
  const sim = fakeSim(nonceOf(opened.at(-1)));
  await assert.rejects(p, (e) => e.code === "review-changed");
  await sleep(50);
  assert.ok(sim.got.every((m) => m.type === "progress"));
  sim.close();
});

await test("signed out at Start: the launch stops with the sign-in message, not a read error", async () => {
  sessionStorage.removeItem("pmo_session");
  const before = network.length;
  const p = B.launch({ pmo: ME, prefetch: fakePrefetch(), timing: { hello: 2000, ok: 3000 } });
  const sim = fakeSim(nonceOf(opened.at(-1)));
  await assert.rejects(p, (e) => e.code === "signed-out");
  assert.equal(network.length, before, "nothing requested without a session");
  sim.close();
  session();
});

B.stopAll();
console.log(`PASS · ${passed} checks`);
process.exit(0);
