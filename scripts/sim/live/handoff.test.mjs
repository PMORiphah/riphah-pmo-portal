// PMO Simulation (live data): the simulation tab's side of protocol v2 (src/sim/handoff.js,
// contract §C) on a real BroadcastChannel (Node has one), against src/simBridge.js's own message
// builder and, with the fixture, against its real launch() and refresh listener. PUBLIC: no data
// here. Owner: B2.
//   node scripts/sim/live/handoff.test.mjs                        invented data only
//   SIM_FIXTURE=<dir> node scripts/sim/live/handoff.test.mjs      also end to end over the private fixture
// No network: fetch is a stub; nothing leaves the process.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as H from "./b2-support.mjs";

H.nodeWindow();
const opened = [];
globalThis.open = (url, name, features) => { opened.push({ url, name, features }); return null; };
globalThis.document = { querySelector: () => null };

const SRC = new URL("../../../src/", import.meta.url);
const HO = await import(new URL("sim/handoff.js", SRC));
const BR = await import(new URL("simBridge.js", SRC));
const { sha256Hex, fingerprintOf } = await import(new URL("sim/live/canon.js", SRC));
const { waitForSnapshot, requestRefresh, sendBye, HandoffError, TEXT, _resetForTests } = HO;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonceOf = () => crypto.randomUUID();
const FAST = { first: 400, idle: 400, total: 5000, refreshFirst: 300, refreshTotal: 5000 };

/** A fake portal on HAND: answers the first hello with `script(ch, hello)`; records what the sim says. */
function fakePortal(nonce, script) {
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  const heard = [];
  let answered = false;
  ch.onmessage = async (e) => {
    heard.push(e.data);
    if (e.data?.type === "hello" && !answered) { answered = true; await script(ch, e.data); }
  };
  return { ch, heard, close: () => ch.close(), saw: (type) => heard.filter((m) => m && m.type === type) };
}
const heldOf = (snapshot, blobs) => new Map(snapshot.media.map((m) => [m.attachmentId, { ...m, blob: blobs.get(m.attachmentId) }]));
const send = (ch, msgs) => { for (const m of msgs) ch.postMessage(m); };
async function expectRefusal(promise, code) {
  let err = null;
  try { await promise; } catch (e) { err = e; }
  assert.ok(err instanceof HandoffError, `refused: ${err}`);
  assert.equal(err.code, code, `${err.code}: ${err.message}`);
  return err;
}

// The invented snapshot, read now (the simulation checks freshness against the real clock).
const syn = await H.syntheticSnapshot({ now: Date.now() });
const S0 = syn.snapshot;
const build = S0.build;

async function handOver(snapshot, blobs, { mutate = (m) => m, before = [], nonce = nonceOf(), timeouts = FAST, mode, share } = {}) {
  _resetForTests();
  const refreshKey = crypto.randomUUID();
  const portal = fakePortal(nonce, async (ch) => {
    ch.postMessage({ type: "progress", v: 2, nonce, phase: "media", media: { done: 1, total: 2, bytes: 10 } });
    send(ch, before);
    const { messages } = BR.messagesFor(snapshot, { nonce, refreshKey, held: heldOf(snapshot, blobs), ...(mode ? { mode, share } : {}) });
    send(ch, mutate(messages, { nonce }));
  });
  const progress = [];
  const p = waitForSnapshot({ nonce, build, timeouts, onProgress: (x) => progress.push(x.phase) });
  return { p, portal, progress, refreshKey, nonce };
}

await test("hand-over: hello v2 → progress → manifest, parts, rpc, media, done → validated snapshot, ok with the fingerprint", async () => {
  const { p, portal, progress, refreshKey } = await handOver(S0, syn.blobs);
  const r = await p;
  assert.equal(JSON.stringify(r.snapshot), JSON.stringify(S0));
  assert.equal(r.refreshKey, refreshKey);
  assert.equal(r.items.size, S0.media.length);
  for (const m of S0.media) {
    const it = r.items.get(m.key);
    assert.equal(it.attachmentId, m.attachmentId);
    assert.equal(it.blob.type, m.mime);
    assert.equal(await sha256Hex(it.blob), m.sha256);
  }
  await sleep(50);
  const hello = portal.saw("hello")[0];
  assert.deepEqual(Object.keys(hello).sort(), ["build", "nonce", "type", "v"]);
  assert.equal(hello.v, 2);
  assert.equal(hello.build, build);
  assert.deepEqual(portal.saw("ok").map((m) => m.fingerprint), [S0.fingerprint]);
  assert.equal(portal.saw("refused").length, 0);
  for (const ph of ["waiting", "portal-media", "receiving", "validating"]) assert.ok(progress.includes(ph), ph);
  assert.equal(r.mode, "live", "a live hand-over says so");
  assert.equal(r.share, null);
  assert.equal(HO._stateForTests().mode, "live");
  portal.close();
});

await test("bye: carries the refresh key on HAND, once", async () => {
  const listen = new BroadcastChannel(HO._stateForTests().hand);
  const got = [];
  listen.onmessage = (e) => got.push(e.data);
  assert.equal(sendBye(), true);
  assert.equal(sendBye(), false);
  await sleep(50);
  listen.close();
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "bye");
  assert.equal(got[0].refreshKey.length, 36);
});

await test("a page takes one hand-over only", async () => {
  await expectRefusal(waitForSnapshot({ nonce: nonceOf(), build, timeouts: FAST }), "used");
  _resetForTests();
  await expectRefusal(waitForSnapshot({ build, timeouts: FAST }), "no-nonce");
});

await test("refusals: v1 messages, another build, unknown messages, wrong order, counts, reuse, tampering", async () => {
  const cases = [
    ["protocol", { before: [{ type: "cast", v: 1, nonce: "N" }] }, "a v1 message"],
    ["protocol", { before: [{ type: "surprise", v: 2, nonce: "N" }] }, "an unknown type"],
    ["build", { mutate: (ms) => [{ type: "manifest", v: 2, nonce: ms[0].nonce, build: "index-OTHER.js" }] }, "another build (bare manifest)"],
    ["protocol", { mutate: (ms) => [ms[0], ...ms.filter((m) => m.type === "responses"), ...ms.filter((m) => m.type !== "responses").slice(1)] }, "responses before tables"],
    ["protocol", { mutate: (ms) => ms.filter((m) => m.type !== "rpc") }, "no rpc"],
    ["protocol", { mutate: (ms) => [{ ...ms[0], extra: 1 }, ...ms.slice(1)] }, "an extra manifest field"],
    ["protocol", { mutate: (ms) => [ms[0], ms[0], ...ms.slice(1)] }, "two manifests"],
    ["protocol", { mutate: (ms) => ms.map((m) => (m.type === "done" ? { ...m, counts: { ...m.counts, media: m.counts.media + 1 } } : m)) }, "done counts"],
    ["media", { mutate: (ms) => { const i = ms.findIndex((m) => m.type === "media"); const out = ms.filter((_, j) => j !== i); return out.map((m) => (m.type === "done" ? { ...m, counts: { ...m.counts, media: m.counts.media - 1 } } : m)); } }, "a media item that never arrives"],
    ["media-missing", { mutate: (ms) => [{ ...ms[0], media: ms[0].media.map((e, i) => (i === 0 ? { ...e, reuse: true } : e)) }, ...ms.slice(1).filter((m) => !(m.type === "media" && m.item.key === ms[0].media[0].key))] }, "reuse in a first hand-over"],
    ["media", { mutate: (ms) => ms.map((m) => (m.type === "media" && m.item.key === "m001" ? { ...m, item: { ...m.item, blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 9])]) } } : m)) }, "bytes that do not match the hash"],
    ["fingerprint", { mutate: (ms) => ms.map((m) => (m.type === "done" ? { ...m, fingerprint: "0".repeat(64) } : m)) }, "done names another snapshot"],
    ["fingerprint", { mutate: (ms) => ms.map((m) => (m.type === "tables" && m.tables.projects ? { ...m, tables: { ...m.tables, projects: m.tables.projects.map((r, i) => (i === 0 ? { ...r, name: r.name + "." } : r)) } } : m)) }, "one character changed"],
    ["protocol", { mutate: (ms) => ms.map((m) => (m.type === "tables" && m.tables.projects ? { ...m, tables: { ...m.tables, projects: m.tables.projects.slice(1) } } : m)) }, "rows differ from the manifest counts"],
    ["secret", { mutate: (ms) => ms.map((m) => (m.type === "tables" && m.tables.projects ? { ...m, tables: { ...m.tables, projects: m.tables.projects.map((r, i) => (i === 0 ? { ...r, notes: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.x" } : r)) } } : m)) }, "a token in a table"],
  ];
  for (const [code, opt, label] of cases) {
    const nonce = nonceOf();
    if (opt.before) opt.before = opt.before.map((m) => ({ ...m, nonce }));
    const { p, portal } = await handOver(S0, syn.blobs, { ...opt, nonce });
    const err = await expectRefusal(p, code).catch((e) => { throw new Error(label + ": " + e.message); });
    await sleep(30);
    const told = portal.saw("refused");
    assert.equal(told.length, 1, label + ": the portal is told");
    assert.equal(told[0].code, err.code);
    assert.equal(portal.saw("ok").length, 0, label);
    portal.close();
  }
});

await test("timeouts: no portal (hello repeated with backoff), then silence after the manifest", async () => {
  _resetForTests();
  const nonce = nonceOf();
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  const hellos = [];
  ch.onmessage = (e) => { if (e.data?.type === "hello") hellos.push(Date.now()); };
  const err = await expectRefusal(waitForSnapshot({ nonce, build, timeouts: { ...FAST, first: 900 } }), "timeout");
  assert.equal(err.message, TEXT.timeout);
  assert.ok(hellos.length >= 3, `hello sent ${hellos.length} times`);
  assert.ok(hellos[2] - hellos[1] > hellos[1] - hellos[0] - 20, "backoff");
  ch.close();
  const { p, portal } = await handOver(S0, syn.blobs, { mutate: (ms) => [ms[0]] });
  await expectRefusal(p, "timeout");
  portal.close();
});

await test("messages for another hand-over are ignored", async () => {
  const other = nonceOf();
  const { p, portal } = await handOver(S0, syn.blobs, { before: [{ type: "manifest", v: 2, nonce: other, build: "x" }] });
  await p;
  portal.close();
});

// ── refresh ──────────────────────────────────────────────────────────────────
/** A fake portal refresh listener on HAND: `answer(reply, msg)` answers on HAND.<req>. */
function fakeListener(nonce, answer) {
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  const got = [];
  ch.onmessage = async (e) => {
    got.push(e.data);
    if (e.data?.type !== "refresh") return;
    assert.match(e.data.req, /^[0-9a-f-]{36}$/);
    const reply = new BroadcastChannel("pmo-sim-" + nonce + "." + e.data.req);
    const said = [];
    reply.onmessage = (x) => said.push(x.data);
    await answer(reply, e.data, said);
    setTimeout(() => reply.close(), 300);
  };
  return { ch, got, close: () => ch.close() };
}

await test("refresh: the same data comes back with every item reused (no media sent), ok on the reply channel", async () => {
  const { p, nonce, refreshKey, portal } = await handOver(S0, syn.blobs);
  const first = await p;
  portal.close();
  const held = new Map([...first.items.values()].map((it) => [it.attachmentId, it]));
  const S1 = (await H.syntheticSnapshot({ now: Date.now() + 1 })).snapshot;
  let said = null;
  const L = fakeListener(nonce, async (reply, m, s) => {
    assert.equal(m.refreshKey, refreshKey);
    said = s;
    reply.postMessage({ type: "progress", v: 2, nonce, phase: "reading", media: { done: 0, total: 0, bytes: 0 } });
    const { messages, sent } = BR.messagesFor(S1, { nonce, refreshKey, held: new Map(), reuse: new Set(S1.media.map((x) => x.attachmentId)) });
    assert.equal(sent, 0);
    send(reply, messages);
  });
  const r = await requestRefresh({ held, timeouts: FAST });
  assert.equal(r.snapshot.fingerprint, S1.fingerprint);
  assert.equal(r.items.size, S1.media.length);
  for (const it of r.items.values()) assert.equal(it.blob, held.get(it.attachmentId).blob, "the same blob, reused");
  await sleep(50);
  assert.deepEqual(said.filter((x) => x.type === "ok").map((x) => x.fingerprint), [S1.fingerprint]);
  L.close();
});

await test("refresh: refusals and silence keep the old snapshot (portal signed out, review needed, no answer, a reused item not held)", async () => {
  const { p, nonce, refreshKey, portal } = await handOver(S0, syn.blobs);
  const first = await p;
  portal.close();
  const held = new Map([...first.items.values()].map((it) => [it.attachmentId, it]));
  let L = fakeListener(nonce, async (reply) => { reply.postMessage({ type: "refused", v: 2, nonce, code: "signed-out", reason: "x" }); });
  let err = await expectRefusal(requestRefresh({ held, timeouts: FAST }), "portal-refused");
  assert.equal(err.portalCode, "signed-out");
  assert.equal(err.message, TEXT.portalGone);
  L.close();
  L = fakeListener(nonce, async (reply) => { reply.postMessage({ type: "refused", v: 2, nonce, code: "review-needed", reason: "x" }); });
  err = await expectRefusal(requestRefresh({ held, timeouts: FAST }), "portal-refused");
  assert.equal(err.message, TEXT.review);
  L.close();
  err = await expectRefusal(requestRefresh({ held, timeouts: FAST }), "portal-gone");
  assert.equal(err.message, TEXT.portalGone);
  let said = null;
  L = fakeListener(nonce, async (reply, m, s) => {
    said = s;
    const { messages } = BR.messagesFor(S0, { nonce, refreshKey, held: new Map(), reuse: new Set(S0.media.map((x) => x.attachmentId)) });
    send(reply, messages);
  });
  const fewer = new Map([...held].slice(1));
  await expectRefusal(requestRefresh({ held: fewer, timeouts: FAST }), "media-missing");
  await sleep(50);
  assert.equal(said.filter((x) => x.type === "refused").length, 1, "the portal is told");
  L.close();
  // A refresh with the wrong launch key in its manifest is refused too.
  L = fakeListener(nonce, async (reply) => {
    const { messages } = BR.messagesFor(S0, { nonce, refreshKey: crypto.randomUUID(), held: heldOf(S0, syn.blobs) });
    send(reply, messages);
  });
  await expectRefusal(requestRefresh({ held, timeouts: FAST }), "protocol");
  L.close();
});

// ── a copy the PMO shared with guests (mode "shared") ─────────────────────────
const DAY = 86400000;
const shareOf = (takenAt, over = {}) => ({ id: crypto.randomUUID(), sharedAt: takenAt + 60000, expiresAt: takenAt + 7 * DAY, voice: "on", ...over });
const old = await H.syntheticSnapshot({ now: Date.now() - 3 * DAY });
const S3 = old.snapshot;
const manifestOnly = (f) => (ms) => ms.map((m) => (m.type === "manifest" ? f(m) : m));

await test("shared: a 3-day-old copy is accepted with its share; the same copy as live is refused as stale", async () => {
  const share = shareOf(S3.takenAt, { voice: "off" });
  let { p, portal } = await handOver(S3, old.blobs, { mode: "shared", share });
  const r = await p;
  assert.equal(r.snapshot.fingerprint, S3.fingerprint);
  assert.equal(r.mode, "shared");
  assert.deepEqual(r.share, share);
  assert.equal(r.items.size, S3.media.length);
  await sleep(30);
  assert.deepEqual(portal.saw("ok").map((m) => m.fingerprint), [S3.fingerprint]);
  portal.close();
  // A shared copy has no listener behind it: nothing to refresh, and the page says why.
  const err = await expectRefusal(requestRefresh({ held: new Map(), timeouts: FAST }), "no-handover");
  assert.equal(err.message, TEXT.sharedNoRefresh);
  ({ p, portal } = await handOver(S3, old.blobs));
  await expectRefusal(p, "stale");
  portal.close();
});

await test("shared: an expired copy (or one beyond 8 days) is refused as stale, with the withdrawal wording", async () => {
  let { p, portal } = await handOver(S3, old.blobs, { mode: "shared", share: shareOf(S3.takenAt, { expiresAt: Date.now() - 1000 }) });
  let err = await expectRefusal(p, "stale");
  assert.match(err.message, /^The PMO has stopped sharing this simulation: it was shared until /);
  assert.equal(err.mode, "shared");
  assert.equal(HO.describeFailure(err).title, "This shared simulation cannot play");
  portal.close();
  const s9 = await H.syntheticSnapshot({ now: Date.now() - 9 * DAY });
  const S9 = s9.snapshot;
  ({ p, portal } = await handOver(S9, s9.blobs, { mode: "shared", share: shareOf(S9.takenAt, { expiresAt: Date.now() + DAY }) }));
  err = await expectRefusal(p, "stale");
  assert.match(err.message, /^The shared data is too old/);
  portal.close();
});

await test("shared: the manifest's mode and share are checked exactly", async () => {
  const good = shareOf(S0.takenAt);
  const cases = [
    ["a live manifest carrying a share", { mutate: manifestOnly((m) => ({ ...m, share: good })) }],
    ["a shared manifest without its share", { mode: "shared", share: good, mutate: manifestOnly((m) => ({ ...m, share: null })) }],
    ["an unknown mode", { mutate: manifestOnly((m) => ({ ...m, mode: "replay" })) }],
    ["no mode", { mutate: manifestOnly((m) => { const { mode, ...rest } = m; return rest; }) }],          // eslint-disable-line no-unused-vars
    ["an extra share field", { mode: "shared", share: good, mutate: manifestOnly((m) => ({ ...m, share: { ...m.share, recipients: 3 } })) }],
    ["a missing share field", { mode: "shared", share: good, mutate: manifestOnly((m) => { const { voice, ...s } = m.share; return { ...m, share: s }; }) }],  // eslint-disable-line no-unused-vars
    ["a share id that is not a uuid", { mode: "shared", share: { ...good, id: "share-1" } }],
    ["a share voice that is neither on nor off", { mode: "shared", share: { ...good, voice: "loud" } }],
    ["share times as text", { mode: "shared", share: good, mutate: manifestOnly((m) => ({ ...m, share: { ...m.share, expiresAt: String(m.share.expiresAt) } })) }],
    ["an expiry before the share", { mode: "shared", share: { ...good, expiresAt: good.sharedAt - 1 } }],
    ["an expiry before the read", { mode: "shared", share: { ...good, sharedAt: S0.takenAt - 5000, expiresAt: S0.takenAt - 1000 } }],
  ];
  for (const [label, opt] of cases) {
    let r;
    try { r = await handOver(S0, syn.blobs, opt); } catch (e) { throw new Error(`${label}: ${e.message}`); }
    await expectRefusal(r.p, "protocol").catch((e) => { throw new Error(label + ": " + e.message); });
    await sleep(20);
    assert.equal(r.portal.saw("refused").length, 1, `${label}: the portal is told`);
    r.portal.close();
  }
});

await test("shared: the portal's withdrawn, expired and build-share reach the screen in this page's words", async () => {
  for (const [code, title, text] of [["withdrawn", "This simulation is no longer shared", TEXT.withdrawn],
    ["expired", "This simulation is no longer shared", TEXT.withdrawn], ["build-share", "The portal has been updated", TEXT.buildShare]]) {
    _resetForTests();
    const nonce = nonceOf();
    const portal = fakePortal(nonce, async (ch) => {
      ch.postMessage({ type: "progress", v: 2, nonce, phase: "media", media: { done: 0, total: 79, bytes: 0 } });
      ch.postMessage({ type: "refused", v: 2, nonce, code, reason: "<b>not shown</b>" });
    });
    const err = await expectRefusal(waitForSnapshot({ nonce, build, timeouts: FAST }), "portal-refused");
    assert.equal(err.portalCode, code);
    assert.equal(err.message, text, "the page's own text, never the portal's");
    assert.equal(err.mode, "shared");
    const view = HO.describeFailure(err);
    assert.equal(view.title, title); assert.equal(view.reason, text);
    portal.close();
  }
  assert.equal(TEXT.withdrawn, "The PMO has stopped sharing this simulation.");
});

await test("live refresh: a refresh that answers with a shared manifest is refused", async () => {
  const { p, nonce, refreshKey, portal } = await handOver(S0, syn.blobs);
  const first = await p;
  portal.close();
  const held = new Map([...first.items.values()].map((it) => [it.attachmentId, it]));
  const L = fakeListener(nonce, async (reply) => {
    const { messages } = BR.messagesFor(S0, { nonce, refreshKey, held: new Map(), reuse: new Set(S0.media.map((x) => x.attachmentId)),
      mode: "shared", share: shareOf(S0.takenAt) });
    send(reply, messages);
  });
  await expectRefusal(requestRefresh({ held, timeouts: FAST }), "protocol");
  L.close();
});

const dir = process.env.SIM_FIXTURE;
if (!dir) { _resetForTests(); BR.stopAll(); console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }

await test("fixture: a shared copy read 6 days ago plays; the same copy past its expiry or 8 days is refused", async () => {
  const at = (days) => Date.now() - days * DAY;
  const f6 = await H.fixtureSnapshot(dir, { now: at(6) });
  let { p, portal } = await handOver(f6.snapshot, f6.blobs, { mode: "shared", share: shareOf(f6.snapshot.takenAt) });
  const r = await p;
  assert.equal(r.mode, "shared");
  assert.equal(r.snapshot.code, f6.snapshot.code);
  portal.close();
  ({ p, portal } = await handOver(f6.snapshot, f6.blobs, { mode: "shared", share: shareOf(f6.snapshot.takenAt, { expiresAt: Date.now() - 1 }) }));
  await expectRefusal(p, "stale");
  portal.close();
  const f9 = await H.fixtureSnapshot(dir, { now: at(8.01) });
  ({ p, portal } = await handOver(f9.snapshot, f9.blobs, { mode: "shared", share: shareOf(f9.snapshot.takenAt, { expiresAt: Date.now() + DAY }) }));
  await expectRefusal(p, "stale");
  portal.close();
});

// ── end to end over the private fixture: src/simBridge.js launch() → this receiver → refresh ──
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const FT = read("fixture-tables.json");
const FR = read("fixture-responses.json");
const { keyOf, SUPA_ORIGIN } = await import(new URL("sim/live/requests.js", SRC));
const byKey = new Map(FR.items.map((i) => [i.key, i]));
const ME = { id: FT.meta.me, username: "PMO", full_name: null };
sessionStorage.setItem("pmo_session", JSON.stringify({ user_id: ME.id, role: "pmo", username: "PMO", access_token: "test-token",
  refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
let mutate = null;
let storageBytes = null;                // bytes the storage stub serves (the changed-file refresh only)
const network = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || "GET").toUpperCase();
  network.push(method + " " + u.slice(0, 60));
  const sign = SUPA_ORIGIN + "/storage/v1/object/sign/project-attachments/";
  if (storageBytes && u.startsWith(sign) && method === "POST") {
    const p = u.slice(sign.length);
    return { ok: true, status: 200, json: async () => ({ signedURL: "/object/sign/project-attachments/" + p + "?t=1" }) };
  }
  if (storageBytes && u.startsWith(sign) && method === "GET") {
    assert.equal(opts.credentials, "omit");
    return { ok: true, status: 200, blob: async () => new Blob([storageBytes]) };
  }
  assert.equal(method, "GET");
  assert.ok(u.startsWith(SUPA_ORIGIN + "/rest/v1/") && !u.includes("/rpc/"), "table reads only");
  const i = byKey.get(keyOf(u.slice(SUPA_ORIGIN.length)));
  let r = i ? { status: i.status, contentRange: i.contentRange, body: structuredClone(i.body) } : { status: 404, contentRange: null, body: { message: "not in fixture" } };
  if (mutate) r = mutate(u.slice(SUPA_ORIGIN.length), r);
  return { status: r.status, headers: { get: (n) => (n.toLowerCase() === "content-range" ? r.contentRange : null) }, json: async () => r.body };
};
const siteVisit = FT.tables.project_attachments.filter((a) => a.kind === "site_visit");
const prepared = new Map();
async function itemFor(row, salt = "") {
  const { mime, bytes } = H.fakeMediaBytes(row);
  const blob = new Blob([bytes, new TextEncoder().encode(salt)], { type: mime });
  return { blob, mime, size: blob.size, sha256: await sha256Hex(blob), sourcePath: row.file_path, sourceSize: Number(row.file_size) || blob.size };
}
const prefetch = {
  ready: prepared, failed: new Map(), done: Promise.resolve(),
  stats: () => ({ ready: siteVisit.length, failed: 0, total: siteVisit.length, bytes: 0, done: true }),
  async ensure(row) { if (!prepared.has(row.id)) prepared.set(row.id, await itemFor(row)); return prepared.get(row.id); },
};

await test("fixture: launch() in the portal → this receiver → ok; the portal reports the same code", async () => {
  _resetForTests();
  opened.length = 0;
  const launch = BR.launch({ pmo: ME, testAccounts: FT.meta.testAccountsDetected, prefetch, timing: { hello: 3000, ok: 5000 } });
  await sleep(10);
  const nonce = /#k=([0-9a-f-]+)$/.exec(opened[0].url)[1];
  assert.equal(opened[0].features, "noopener");
  const t0 = Date.now();
  const got = await waitForSnapshot({ nonce, build: "dev" });
  const res = await launch;
  assert.equal(res.confirmed, true);
  assert.equal(res.code, got.snapshot.code);
  assert.equal(got.items.size, siteVisit.length);
  assert.equal(BR.listenerCount(), 1);
  console.log(`   ${got.snapshot.responses.length} responses, ${got.items.size} media, code ${got.snapshot.code.length} chars, ${Date.now() - t0} ms`);
  globalThis.__E2E = { nonce, got };
});

await test("fixture: refresh through the portal's listener: unchanged media reused, one changed file re-sent", async () => {
  const { got } = globalThis.__E2E;
  const held = new Map([...got.items.values()].map((it) => [it.attachmentId, it]));
  let r = await requestRefresh({ held });
  assert.equal(r.items.size, got.items.size);
  for (const it of r.items.values()) assert.equal(it.blob, held.get(it.attachmentId).blob);
  // One site-visit video is replaced in the portal (same row, another stored file and size): the
  // portal downloads it again (stub storage) and sends only that one.
  const target = siteVisit.find((a) => /^video\//.test(String(a.mime_type || "")));
  if (!target) { console.log("   (no video in the fixture: changed-file case skipped)"); return; }
  storageBytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...new TextEncoder().encode("changed")]);
  mutate = (p, resp) => {
    if (!p.startsWith("/rest/v1/project_attachments?") || !Array.isArray(resp.body)) return resp;
    return { ...resp, body: resp.body.map((a) => (a.id === target.id ? { ...a, file_path: a.file_path + ".v2", file_size: storageBytes.length } : a)) };
  };
  const held2 = new Map([...r.items.values()].map((it) => [it.attachmentId, it]));
  await sleep(200);                     // the portal finishes the previous refresh (it waits for our ok)
  r = await requestRefresh({ held: held2 });
  mutate = null;
  storageBytes = null;
  assert.equal(r.items.size, got.items.size, "nothing dropped");
  const changed = [...r.items.values()].find((it) => it.attachmentId === target.id);
  assert.notEqual(changed.blob, held2.get(target.id).blob, "re-sent");
  assert.equal(await sha256Hex(changed.blob), changed.sha256);
  const same = [...r.items.values()].filter((it) => it.attachmentId !== target.id);
  assert.ok(same.every((it) => it.blob === held2.get(it.attachmentId).blob), "the rest reused");
});

await test("fixture: refresh when the portal is signed out is refused with the sim's own text; bye ends the listener", async () => {
  await sleep(200);
  const s = sessionStorage.getItem("pmo_session");
  sessionStorage.removeItem("pmo_session");
  const { got } = globalThis.__E2E;
  const held = new Map([...got.items.values()].map((it) => [it.attachmentId, it]));
  const err = await expectRefusal(requestRefresh({ held }), "portal-refused");
  assert.equal(err.portalCode, "signed-out");
  assert.equal(err.message, TEXT.portalGone);
  sessionStorage.setItem("pmo_session", s);
  assert.equal(sendBye(), true);
  await sleep(100);
  assert.equal(BR.listenerCount(), 0);
  await expectRefusal(requestRefresh({ held, timeouts: FAST }), "no-handover");
});

_resetForTests();
BR.stopAll();
console.log(`PASS · ${passed} checks`);
process.exit(0);                        // src/auth.js keeps its 'pmo-session' channel open (portal side)
