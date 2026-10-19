// PMO Simulation (live data): readSnapshot over a private fixture (contract §B.2, §D.1, §K.2).
// PUBLIC: no data here. The fixture lives outside the repo; point SIM_FIXTURE at its directory:
//   SIM_FIXTURE=<dir> node scripts/sim/live/snapshot.test.mjs
// Without SIM_FIXTURE only the data-free checks run. Exit code 0 on pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const L = new URL("../../../src/sim/live/", import.meta.url);
const { TABLES, MASK, CAPS, columnsOf } = await import(new URL("schema.js", L));
const { TEMPLATES, keyOf, fill } = await import(new URL("requests.js", L));
const S = await import(new URL("snapshot.js", L));
const { readSnapshot, SnapshotError, deliverablesIds, detectTestAccounts, testAccountCandidates, sanitizeRow, byMediaOrder, mediaKeyOf, reviewIds, previewPlan } = S;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const clone = (v) => structuredClone(v);

// ── data-free checks (synthetic rows only; invented values) ──────────────────
await test("test-account detection: no assignment and a test-looking address or name", () => {
  const profiles = [
    { id: "u1", username: "alpha", full_name: "Alpha One", email: "a@example.com", is_active: true },
    { id: "u2", username: "beta", full_name: "Beta Two", email: "b@portal.example", is_active: true },
    { id: "u3", username: "qa-test", full_name: "Q A", email: "q@portal.example", is_active: true },
    { id: "u4", username: "gamma", full_name: "Gamma Tester", email: "g@x.example.org", is_active: true },
    { id: "u5", username: "delta", full_name: "Delta", email: "d@example.com", is_active: false },
    { id: "u6", username: "eps-test", full_name: "Eps", email: "e@example.com", is_active: true },
  ];
  const assignments = [{ user_id: "u6", project_id: "p1" }];
  assert.deepEqual(detectTestAccounts(profiles, assignments), ["u1", "u3", "u4"]);
  assert.deepEqual(testAccountCandidates(profiles, assignments).map((u) => u.id), ["u1", "u2", "u3", "u4", "u6"], "any active account may be ticked");
});

await test("deliverables rule: CAPEX and (approved PDD link or a PDD/EPDD/charter file)", () => {
  const tables = {
    projects: [{ id: "a", portfolio: "capex" }, { id: "b", portfolio: "capex" }, { id: "c", portfolio: "investment" }, { id: "d", portfolio: "capex" }, { id: "e", portfolio: "capex" }],
    epdd_pdds: [{ linked_project_id: "a", epdd_status: "PMO Approved" }, { linked_project_id: "d", epdd_status: "Sent Back" }],
    project_attachments: [{ project_id: "b", file_name: "pdd_scan.pdf" }, { project_id: "c", file_name: "PDD.pdf" }, { project_id: "e", file_name: "Project Charter v2.docx" },
      { project_id: "d", file_name: "photo.jpg" }],
  };
  assert.deepEqual(deliverablesIds(tables), ["a", "b", "e"]);
});

await test("masking is idempotent and drops unlisted columns at every level", () => {
  const ctx = { mediaKey: new Map(), threads: { comments: new Set(["c1"]), past_project_updates: new Set() }, reportId: null };
  const row = { id: "u1", username: "x", email: "x@example.com", phone: "+00 000", secondary_email: "y@example.com", role: "pmo" };
  const once = sanitizeRow("user_profiles", row, ctx);
  assert.equal(once.email, MASK.email);
  assert.equal(once.phone, MASK.phone);
  assert.equal("secondary_email" in once, false);
  assert.deepEqual(sanitizeRow("user_profiles", once, ctx), once);
  assert.equal(sanitizeRow("user_profiles", { id: "u2", email: "", phone: null }, ctx).email, "");
  const embedded = sanitizeRow("comments", { id: "c2", body: "text", user_profiles: { role: "pmo", email: "z@example.com", password: "p" } }, ctx,
    { user_profiles: "user_profiles" });
  assert.equal(embedded.body, null);
  assert.deepEqual(embedded.user_profiles, { role: "pmo", email: MASK.email });
  assert.equal(sanitizeRow("comments", { id: "c1", body: "kept" }, ctx).body, "kept");
});

await test("contact details inside free text are replaced; amounts, dates, codes and file names are not", () => {
  const ctx = { mediaKey: new Map(), threads: { comments: new Set(["c1"]), past_project_updates: new Set(["m1"]) }, reportId: "r1" };
  const body = "Call 0300-1234567, +92 51 1234567 or 00923001234567 and write to some.one@site.example.org. PO 4500012345, PKR 2,345,600 on 2026-10-15 (XX.000000-01).";
  const want = "Call (phone hidden), (phone hidden) or (phone hidden) and write to (email hidden). PO 4500012345, PKR 2,345,600 on 2026-10-15 (XX.000000-01).";
  assert.equal(sanitizeRow("comments", { id: "c1", body }, ctx).body, want);
  assert.equal(sanitizeRow("past_project_updates", { id: "m1", body }, ctx).body, want);
  assert.equal(sanitizeRow("projects", { id: "p1", notes: body }, ctx).notes, want);
  assert.equal(sanitizeRow("past_project_summary", { id: "p2", notes: body, reason_open: "Call 051-1234567" }, ctx).reason_open, "Call (phone hidden)");
  assert.equal(sanitizeRow("projects", { id: "p3", name: "Lab 0300-1234567" }, ctx).name, "Lab 0300-1234567", "only free-text columns");
  assert.equal(sanitizeRow("project_attachments", { id: "a1", file_name: "IMG_03001234567.jpg" }, ctx).file_name, "IMG_03001234567.jpg");
  assert.equal(sanitizeRow("comments", { id: "c1", body: want }, ctx).body, want, "idempotent");
});

await test("report figures leave out the top risks' mitigation texts", () => {
  const ctx = { mediaKey: new Map(), threads: { comments: new Set(), past_project_updates: new Set() }, reportId: "r1" };
  const figures = { headline: { df_total: 1 }, risks: { open: 2, top: [{ title: "a", mitigation: "do x" }, { title: "b", mitigation: null }] } };
  const out = sanitizeRow("board_reports", { id: "r1", figures }, ctx).figures;
  assert.deepEqual(out.risks.top.map((r) => r.mitigation), [null, null]);
  assert.deepEqual(out.risks.top.map((r) => r.title), ["a", "b"]);
  assert.equal(out.headline.df_total, 1);
  assert.equal(figures.risks.top[0].mitigation, "do x", "the input is not changed");
  assert.equal(sanitizeRow("board_reports", { id: "r2", figures }, ctx).figures, null);
});

await test("media keys: uploaded_at desc, then id asc; m001, m002 …", () => {
  const rows = [{ id: "b", uploaded_at: "2026-01-02" }, { id: "a", uploaded_at: "2026-01-02" }, { id: "c", uploaded_at: "2026-01-03" }];
  assert.deepEqual(rows.slice().sort(byMediaOrder).map((r) => r.id), ["c", "a", "b"]);
  assert.equal(mediaKeyOf(0), "m001");
  assert.equal(mediaKeyOf(41), "m042");
});

await test("reviewIds names the four approved items", () => {
  assert.deepEqual(reviewIds({ updates: { lastCommentId: "c" }, past: { lastMessageId: "m" }, risks: { rowId: "r" }, users: { row: { userId: "u" } } }),
    { lastCommentId: "c", lastMessageId: "m", riskRowId: "r", userRowId: "u" });
  assert.deepEqual(reviewIds(null), { lastCommentId: null, lastMessageId: null, riskRowId: null, userRowId: null });
});

// ── live mode (optional): production, GET /rest/v1 only, under a PMO token from the environment ──
// SIM_LIVE_TOKEN=<access token> node scripts/sim/live/snapshot.test.mjs
// Prints counts and pass/fail only, never data. The anon key is the portal's public one (src/auth.js).
if (process.env.SIM_LIVE_TOKEN) {
  const { SUPA_ORIGIN } = await import(new URL("requests.js", L));
  const tok = process.env.SIM_LIVE_TOKEN;
  const anon = process.env.SIM_LIVE_KEY || /const SUPA_KEY = "([^"]+)"/.exec(fs.readFileSync(new URL("../../../src/auth.js", import.meta.url), "utf8"))[1];
  const me = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString("utf8")).sub;
  let gets = 0;
  const get = async (p) => {
    assert.ok(p.startsWith("/rest/v1/") && !p.startsWith("/rest/v1/rpc/"), "GET outside /rest/v1 tables");
    gets++;
    const r = await fetch(SUPA_ORIGIN + p, { method: "GET", cache: "no-store", headers: { apikey: anon, Authorization: "Bearer " + tok } });
    let body = null; try { body = await r.json(); } catch { body = null; }
    return { status: r.status, contentRange: r.headers.get("content-range"), body };
  };
  const media = async (rows) => new Map(rows.map((r) => [r.id, { mime: "image/jpeg", size: 1000, sha256: "0".repeat(64) }]));
  await test("live: preview read", async () => {
    const pv = await readSnapshot({ get, pmo: { id: me, username: "PMO", full_name: null }, preview: true });
    assert.ok(pv.plan && pv.siteVisitRows.length >= 0);
    console.log(`   preview: ${pv.siteVisitRows.length} site-visit rows, ${pv.testAccountsDetected.length} test accounts detected, ${pv.testAccountCandidates.length} candidates`);
  });
  await test("live: full read passes the invariants and the simulation's validation", async () => {
    const t0 = Date.now();
    const s = await readSnapshot({ get, pmo: { id: me, username: "PMO", full_name: null }, media });
    assert.ok(s.invariants.every((x) => x.ok), JSON.stringify(s.invariants.filter((x) => !x.ok).map((x) => x.name)));
    const rows = Object.values(s.tables).reduce((a, r) => a + r.length, 0);
    console.log(`   ${Object.keys(s.tables).length} tables, ${rows} rows, ${s.responses.length} responses, ${s.media.length} media, ` +
      `${s.rpc.project_has_deliverables.length} deliverables ids, ${(s.bytes / 1048576).toFixed(2)} MB canonical, read ${Date.now() - t0} ms, ${gets} GETs, code ${s.code.length} chars`);
  });
  console.log(`PASS (live) · ${passed} checks`);
  process.exit(0);
}

const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }

// ── fixture checks ───────────────────────────────────────────────────────────
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const FT = read("fixture-tables.json");
const FR = read("fixture-responses.json");
const RPC = read("fixture-rpc.json");
const EXPECT = fs.existsSync(path.join(dir, "fixture-expect.json")) ? read("fixture-expect.json") : null;
const byKey = new Map(FR.items.map((i) => [i.key, i]));
const pmo = { id: FT.meta.me, username: "PMO", full_name: null };
const now = () => FT.meta.takenAt;

function makeGet({ patch = null, fail = null } = {}) {
  const calls = [];
  const fails = new Map();
  const get = async (p) => {
    calls.push(p);
    assert.ok(p.startsWith("/rest/v1/") && !p.startsWith("/rest/v1/rpc/"), "GET outside /rest/v1 tables: " + p);
    if (fail) { const n = fail(p, fails.get(p) || 0); fails.set(p, (fails.get(p) || 0) + 1); if (n) return n; }
    const i = byKey.get(keyOf(p));
    if (!i) return { status: 404, contentRange: null, body: { message: "not in fixture" } };
    const r = { status: i.status, contentRange: i.contentRange, body: clone(i.body) };
    return patch ? patch(p, r) : r;
  };
  return { get, calls };
}
const fakeMedia = (skip = new Set()) => async (rows) => new Map(rows.map((r) => [r.id, skip.has(r.id) ? null : { mime: "image/jpeg", size: 1000, sha256: "0".repeat(64) }]));
const siteVisit = FT.tables.project_attachments.filter((a) => a.kind === "site_visit");
const testAccounts = FT.meta.testAccountsDetected;

await test("preview read: tables and plan only, GET /rest/v1 only, no responses recorded", async () => {
  const { get, calls } = makeGet();
  const pv = await readSnapshot({ get, pmo, now, preview: true, testAccounts });
  assert.equal(pv.preview, true);
  assert.equal(pv.siteVisitRows.length, siteVisit.length);
  assert.ok(pv.plan && pv.candidates && Array.isArray(pv.typedTexts));
  const tableKeys = new Set(FR.items.filter((i) => String(i.template).startsWith("table:")).map((i) => i.key));
  assert.ok(calls.every((p) => tableKeys.has(keyOf(p))), "preview reads only table paths");
  assert.ok(pv.tables.user_profiles.every((u) => u.email == null || u.email === "" || u.email === MASK.email));
  const again = await previewPlan(pv, { testAccounts, overrides: {}, leftOut: [] });
  assert.equal(JSON.stringify(again.plan), JSON.stringify(pv.plan));
});

let snap;
await test("full read over the fixture: shape, policies, keys, rpc, invariants, fingerprint", async () => {
  const { get, calls } = makeGet();
  const phases = [];
  snap = await readSnapshot({ get, pmo, now, testAccounts, media: fakeMedia(), onPhase: (p) => phases.push(p) });
  assert.equal(snap.v, 2);
  assert.equal(snap.tz, "Asia/Karachi");
  assert.deepEqual(snap.mask, { contacts: true });
  assert.equal(snap.takenAt, FT.meta.takenAt);
  assert.deepEqual(snap.testAccounts, testAccounts.slice().sort());
  assert.deepEqual(Object.keys(snap.tables).sort(), Object.keys(TABLES).sort());
  for (const [t, rows] of Object.entries(snap.tables)) {
    const allowed = new Set(columnsOf(t).map((c) => c.name));
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(allowed.has(k), `${t}.${k} not allowed`);
  }
  for (const t of Object.keys(TABLES)) if (!TABLES[t].plan) assert.equal(snap.tables[t].length, FT.tables[t].length, "rows of " + t);
  for (const u of snap.tables.user_profiles) {
    assert.ok(u.email == null || u.email === "" || u.email === MASK.email);
    assert.ok(u.phone == null || u.phone === "" || u.phone === MASK.phone);
  }
  for (const r of snap.tables.project_risks_scored) { assert.equal(r.description, null); assert.equal(r.mitigation_plan, null); }
  for (const m of snap.tables.past_pm_messages) assert.equal(m.body, null);
  const P = snap.plan;
  for (const c of snap.tables.comments) if (c.project_id !== P.updates?.projectId) assert.equal(c.body, null);
  for (const m of snap.tables.past_project_updates) if (m.past_project_id !== P.past?.id) assert.equal(m.body, null);
  assert.ok(snap.tables.comments.some((c) => c.project_id === P.updates?.projectId ? c.body != null : false) || !P.updates?.projectId);
  for (const b of snap.tables.board_reports) if (b.id !== P.report?.id) assert.equal(b.figures, null);
  // media keys and paths
  assert.equal(snap.media.length, siteVisit.length);
  assert.deepEqual(snap.media.map((m) => m.key), siteVisit.map((_, i) => mediaKeyOf(i)));
  for (const m of snap.media) assert.equal(FT.meta.mediaKeys[m.attachmentId], m.key, "same keys as the capture");
  const keyOfAtt = new Map(snap.media.map((m) => [m.attachmentId, m.key]));
  for (const a of snap.tables.project_attachments) {
    assert.equal(a.file_path, a.kind === "site_visit" ? "sim-media/" + keyOfAtt.get(a.id) : "sim-unavailable/" + a.id);
  }
  // rpc computed locally equals the live function
  assert.deepEqual(snap.rpc.project_has_deliverables, RPC.project_has_deliverables.slice().sort());
  // responses: templates of this plan only, in TEMPLATES order, no table reads
  const ids = { me: pmo.id, storyId: P.story?.id, storyPmId: P.story?.pmId, updatesId: P.updates?.projectId, pastId: P.past?.id, reportId: P.report?.id };
  const expectKeys = [...new Set(TEMPLATES.map((t) => fill(t.path, ids)).filter(Boolean).map(keyOf))];
  assert.deepEqual(snap.responses.map((r) => r.key), expectKeys);
  assert.ok(snap.responses.length <= CAPS.responses);
  for (const r of snap.responses) assert.ok(r.status >= 200 && r.status < 300 && r.body && typeof r.body === "object");
  const tplOf = new Map(TEMPLATES.map((t) => [fill(t.path, ids) && keyOf(fill(t.path, ids)), t]));
  for (const r of snap.responses) {
    const t = tplOf.get(r.key);
    if (t.table === "user_profiles") for (const u of [].concat(r.body)) assert.ok(u.email == null || u.email === "" || u.email === MASK.email);
    if (t.table === "project_attachments") for (const a of [].concat(r.body)) {
      if ("file_path" in a) assert.ok(/^sim-(media\/m\d{3}|unavailable\/.+)$/.test(a.file_path));
    }
    if (t.id === "upd.thread") assert.ok([].concat(r.body).every((c) => c.body !== undefined), "thread bodies kept");
  }
  const text = JSON.stringify([snap.tables, snap.responses]);
  assert.ok(!/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(text), "no JWT-like strings");
  assert.ok(!/token=|\/object\/sign\//.test(text), "no signed links");
  assert.ok(!/"(pm_email|secondary_email|password|access_token|refresh_token)"/.test(text), "no forbidden keys");
  // invariants, fingerprint
  assert.ok(snap.invariants.length >= 6 && snap.invariants.every((x) => x.ok), JSON.stringify(snap.invariants));
  assert.match(snap.fingerprint, /^[0-9a-f]{64}$/);
  assert.match(snap.code, /^[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.ok(snap.bytes > 0 && snap.bytes < CAPS.totalJson);
  assert.ok(calls.every((p) => p.startsWith("/rest/v1/")));
  assert.deepEqual([...new Set(phases)], ["tables", "media", "plan", "responses", "trim", "invariants", "fingerprint", "validate"]);
});

await test("deterministic: the same data gives the same fingerprint", async () => {
  const again = await readSnapshot({ get: makeGet().get, pmo, now, testAccounts, media: fakeMedia() });
  assert.equal(again.fingerprint, snap.fingerprint);
  assert.equal(again.code, snap.code);
});

await test("plan subjects match the golden values (when fixture-expect.json is there)", async () => {
  if (!EXPECT) return;
  const P = snap.plan;
  assert.equal(P.story?.id, EXPECT.story.id);
  assert.equal(P.updates?.projectId, EXPECT.updates.projectId);
  assert.equal(P.past?.id, EXPECT.past.id);
  assert.equal(P.report?.id, EXPECT.report.id);
  assert.equal(P.gallery?.campus, EXPECT.gallery.campus);
});

await test("left-out items leave the tables, the Gallery response and the media list", async () => {
  const ordered = siteVisit.slice().sort(byMediaOrder);
  const out = [ordered[0].id, ordered[5].id];
  const s = await readSnapshot({ get: makeGet().get, pmo, now, testAccounts, leftOut: out, media: fakeMedia() });
  assert.equal(s.leftOut, 2);
  assert.equal(s.failed, 0);
  assert.equal(s.media.length, siteVisit.length - 2);
  assert.ok(!s.tables.project_attachments.some((a) => out.includes(a.id)));
  assert.equal(s.media[0].attachmentId, ordered[1].id);
  assert.equal(s.media[0].key, "m001");
  const ids = { me: pmo.id };
  const g = s.responses.find((r) => r.key === keyOf(fill(TEMPLATES.find((t) => t.id === "gallery.rows").path, ids)));
  assert.ok(g && !g.body.some((a) => out.includes(a.id)));
  assert.equal(g.body.length, siteVisit.length - 2);
  if (g.contentRange) assert.match(g.contentRange, new RegExp(`^0-${siteVisit.length - 3}/`));
  assert.notEqual(s.fingerprint, snap.fingerprint);
});

await test("an item that could not be prepared is removed and counted", async () => {
  const ordered = siteVisit.slice().sort(byMediaOrder);
  const s = await readSnapshot({ get: makeGet().get, pmo, now, testAccounts, media: fakeMedia(new Set([ordered[2].id])) });
  assert.equal(s.failed, 1);
  assert.equal(s.media.length, siteVisit.length - 1);
  assert.ok(!s.tables.project_attachments.some((a) => a.id === ordered[2].id));
});

await test("a read that fails once is retried; twice is a read error naming the table", async () => {
  const flaky = makeGet({ fail: (p, n) => (p.startsWith("/rest/v1/campuses?") && n === 0 ? { status: 503, contentRange: null, body: {} } : null) });
  const s = await readSnapshot({ get: flaky.get, pmo, now, testAccounts, media: fakeMedia() });
  assert.equal(s.fingerprint, snap.fingerprint);
  const broken = makeGet({ fail: (p) => (p.startsWith("/rest/v1/campuses?") ? { status: 503, contentRange: null, body: {} } : null) });
  await assert.rejects(readSnapshot({ get: broken.get, pmo, now, testAccounts, media: fakeMedia() }),
    (e) => e instanceof SnapshotError && e.code === "read" && e.detail === "campuses");
});

await test("an inconsistent read is read again once; twice names the invariant", async () => {
  let round = 0;
  const pdPath = (p) => p.startsWith("/rest/v1/portfolio_dashboard?select=total_projects");
  const once = makeGet({ patch: (p, r) => { if (pdPath(p) && round++ === 0) r.body[0].total_projects += 1; return r; } });
  const s = await readSnapshot({ get: once.get, pmo, now, testAccounts, media: fakeMedia() });
  assert.ok(s.invariants.every((x) => x.ok));
  assert.equal(round, 2);
  const always = makeGet({ patch: (p, r) => { if (pdPath(p)) r.body[0].total_projects += 1; return r; } });
  await assert.rejects(readSnapshot({ get: always.get, pmo, now, testAccounts, media: fakeMedia() }),
    (e) => e instanceof SnapshotError && e.code === "invariant" && e.detail === "capex-count");
});

await test("unmasked contacts from the server are masked before anything else sees them", async () => {
  const g = makeGet({ patch: (p, r) => {
    if (p.startsWith("/rest/v1/user_profiles?")) for (const u of [].concat(r.body)) { if ("email" in u) u.email = "someone@example.com"; if ("phone" in u) u.phone = "+00 0000 0000"; }
    return r;
  } });
  const s = await readSnapshot({ get: g.get, pmo, now, testAccounts, media: fakeMedia() });
  assert.ok(s.tables.user_profiles.every((u) => u.email === MASK.email && u.phone === MASK.phone));
  for (const r of s.responses) if (r.key.startsWith("/rest/v1/user_profiles")) for (const u of [].concat(r.body)) {
    if ("email" in u) assert.equal(u.email, MASK.email);
    if ("phone" in u) assert.equal(u.phone, MASK.phone);
  }
  // detection ran on the unmasked rows: every unassigned active account now has an example.com address
  const pv = await readSnapshot({ get: g.get, pmo, now, preview: true });
  const assigned = new Set((pv.tables.project_assignments || []).map((a) => a.user_id));
  assert.deepEqual(pv.testAccountsDetected, pv.testAccountCandidates.filter((c) => !assigned.has(c.id)).map((c) => c.id).sort());
});

await test("an override outside the rule is not applied", async () => {
  const s = await readSnapshot({ get: makeGet().get, pmo, now, testAccounts, media: fakeMedia(), overrides: { storyId: "00000000-0000-0000-0000-000000000000" } });
  assert.equal(s.plan.story?.id, snap.plan.story?.id);
});

console.log(`PASS · ${passed} checks`);
process.exit(0);
