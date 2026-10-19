// PMO Simulation (live data): the hand-over validator (src/sim/live/validate.js, contract §B.6, §C.4,
// §G.8), fuzzed per arch §8.3 step 3. PUBLIC: no data here. Owner: B2.
//   node scripts/sim/live/validate.test.mjs                       invented data only
//   SIM_FIXTURE=<dir> node scripts/sim/live/validate.test.mjs     also over the private fixture
// Every mutation must be refused with the expected code; the untouched snapshot must pass.
import assert from "node:assert/strict";
import * as H from "./b2-support.mjs";

const V = await import(new URL("../../../src/sim/live/validate.js", import.meta.url));
const { fingerprintOf } = await import(new URL("../../../src/sim/live/canon.js", import.meta.url));
const { MASK } = await import(new URL("../../../src/sim/live/schema.js", import.meta.url));
const { validateSnapshot, validateMediaItem, ValidationError, invariants, freshness, allowedResponses } = V;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const MIN = 60000;

// ── freshness (contract §G.8; arch §8.3 step 4) ──────────────────────────────
await test("freshness: 14 min ok, 15 and 16 min amber, 61 min refused, with the approved texts", () => {
  const t = Date.parse("2026-10-16T05:41:00Z");                    // 10:41 PKT
  assert.equal(freshness(t, t + 14 * MIN).state, "ok");
  assert.equal(freshness(t, t + 14 * MIN).text, "");
  assert.equal(freshness(t, t + 15 * MIN).state, "amber");
  const a = freshness(t, t + 16 * MIN);
  assert.equal(a.state, "amber");
  assert.equal(a.text, "Data read 16 min ago · Refresh data");
  assert.equal(freshness(t, t + 60 * MIN).state, "amber");
  const r = freshness(t, t + 61 * MIN);
  assert.equal(r.state, "refused");
  assert.equal(r.reason, "age");
  assert.equal(r.text, "Live data is 61 min old (read 10:41 PKT). Press Refresh data.");
});
await test("freshness: another PKT day, a UTC-day straddle (04:58 → 05:02 PKT), the future and bad input are refused", () => {
  const late = Date.parse("2026-10-16T18:50:00Z");                 // 23:50 PKT
  assert.deepEqual([freshness(late, late + 20 * MIN).state, freshness(late, late + 20 * MIN).reason], ["refused", "day"]);
  const early = Date.parse("2026-10-15T23:58:00Z");                // 04:58 PKT on the 16th, UTC still the 15th
  const f = freshness(early, early + 4 * MIN);
  assert.equal(f.state, "refused");
  assert.equal(f.reason, "day");
  assert.match(f.text, /read 04:58 PKT/);
  const t = Date.parse("2026-10-16T05:41:00Z");
  assert.equal(freshness(t, t - 10 * MIN).state, "refused");
  assert.equal(freshness(t, t - 10 * MIN).reason, "future");
  assert.equal(freshness(t, t - 30 * 1000).state, "ok");            // a little clock jitter is fine
  assert.equal(freshness(NaN, t).state, "refused");
  assert.equal(freshness(Date.now() - 1000).state, "ok");          // no now: the real clock
});
await test("freshness: a refused age rounds up; a read on an earlier day says so", () => {
  const t = Date.parse("2026-10-16T05:41:00Z");                    // 10:41 PKT
  assert.equal(freshness(t, t + 60 * MIN + 600).text, "Live data is 61 min old (read 10:41 PKT). Press Refresh data.");
  const y = freshness(t, t + 24 * 60 * MIN);
  assert.equal(y.state, "refused");
  assert.equal(y.text, "Live data is 24 hours old (read yesterday at 10:41 PKT). Press Refresh data.");
  const late = Date.parse("2026-10-16T18:55:00Z");                 // 23:55 PKT, then 00:05 PKT
  assert.equal(freshness(late, late + 10 * MIN).text, "Live data was read before the day changed (read yesterday at 23:55 PKT). Press Refresh data.");
});

// ── the snapshot ─────────────────────────────────────────────────────────────
const refp = async (s) => { Object.assign(s, await fingerprintOf(s)); return s; };
async function refused(base, opts, code, mutate, { refingerprint = false, label = "" } = {}) {
  const s = structuredClone(base);
  mutate(s);
  if (refingerprint) await refp(s);
  let err = null;
  try { await validateSnapshot(s, opts); } catch (e) { err = e; }
  assert.ok(err, `${label || code}: accepted`);
  assert.ok(err instanceof ValidationError, `${label}: ${err && err.message}`);
  assert.equal(err.code, code, `${label}: refused as ${err.code} (${err.reason}), expected ${code}`);
  assert.ok(!/@|hidden for the presentation/.test(err.reason), `${label}: the reason carries no data`);
  return err;
}

/** Runs the whole battery over one valid snapshot. */
async function battery(name, base, blobs, now) {
  const opts = { build: base.build, now };
  const T = base.tables;
  const plan = base.plan;
  const capex = T.projects.filter((p) => p.portfolio === "capex");
  const nonCapex = T.projects.find((p) => p.portfolio !== "capex");

  await test(`${name}: the untouched snapshot passes and comes back as a clean deep copy`, async () => {
    const c = await validateSnapshot(base, opts);
    assert.notEqual(c, base);
    assert.notEqual(c.tables, base.tables);
    assert.equal(JSON.stringify(c), JSON.stringify(base));
    assert.deepEqual(invariants(base).map((x) => [x.name, x.ok]),
      [["metrics-ids", true], ["df-total", true], ["capex-count", true], ["released-total", true], ["refs", true], ["counts", true]]);
    const allowed = allowedResponses(base);
    assert.ok(base.responses.every((r) => allowed.has(r.key)));
    await validateSnapshot(base, { build: base.build });             // no now: no freshness check
    await validateSnapshot(base, { ...opts, recomputePlan: false });
  });

  await test(`${name}: protocol, build and freshness`, async () => {
    await refused(base, opts, "protocol", (s) => { s.v = 1; }, { label: "v1" });
    await refused(base, opts, "protocol", (s) => { s.extra = 1; }, { label: "unknown top-level field" });
    await refused(base, opts, "protocol", (s) => { delete s.readMs; }, { label: "missing field" });
    await refused(base, opts, "protocol", (s) => { s.tz = "UTC"; }, { label: "time zone" });
    await refused(base, opts, "protocol", (s) => { s.pmo.id = "PMO"; }, { label: "pmo id" });
    await refused(base, opts, "protocol", (s) => { s.pmo.email = "x"; }, { label: "pmo email" });
    await refused(base, { ...opts, build: "index-OTHER.js" }, "build", () => {}, { label: "build mismatch" });
    await refused(base, { ...opts, now: base.takenAt + 61 * MIN }, "stale", () => {}, { label: "61 min" });
    await refused(base, { ...opts, now: base.takenAt + 24 * 60 * MIN }, "stale", () => {}, { label: "next day" });
    await validateSnapshot(base, { ...opts, now: base.takenAt + 14 * MIN });
  });

  await test(`${name}: secrets, prototype keys and secret-looking text anywhere`, async () => {
    const someText = (s) => s.tables.projects[0];
    await refused(base, opts, "secret", (s) => { someText(s).notes = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc"; }, { label: "JWT" });
    await refused(base, opts, "secret", (s) => { someText(s).notes = "see /object/sign/project-attachments/x"; }, { label: "signed link" });
    await refused(base, opts, "secret", (s) => { someText(s).notes = "https://x/y?token=abc"; }, { label: "token=" });
    await refused(base, opts, "secret", (s) => { someText(s).notes = "-----BEGIN PRIVATE KEY-----"; }, { label: "private key" });
    await refused(base, opts, "secret", (s) => { someText(s).notes = "AIza" + "A".repeat(30); }, { label: "API key" });
    await refused(base, opts, "secret", (s) => { someText(s).notes = "service_role"; }, { label: "service role" });
    await refused(base, opts, "secret", (s) => { s.plan.extra = JSON.parse('{"__proto__": {"polluted": true}}'); }, { label: "__proto__ in the plan" });
    await refused(base, opts, "secret", (s) => { s.tables.settings[0].value = { password: "x" }; }, { label: "a password field" });
    await refused(base, opts, "secret", (s) => { s.responses[0].body = [{ access_token: "x" }]; }, { label: "a token field in a response" });
    await refused(base, opts, "secret", (s) => { s.tables.user_profiles[0].secondary_email = "x"; }, { label: "secondary_email" });
    await refused(base, opts, "secret", (s) => { s.overrides = JSON.parse('{"constructor": 1}'); }, { label: "constructor key" });
  });

  await test(`${name}: wrong types and shapes`, async () => {
    await refused(base, opts, "type", (s) => { s.tables.projects[0].bac = "100"; }, { label: "number as text" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].is_carry_forward = "true"; }, { label: "boolean as text" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].start_date = "16/10/2026"; }, { label: "date" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].updated_at = "yesterday"; }, { label: "timestamp" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].id = "not-a-uuid"; }, { label: "uuid" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].workflow_stage = "Approved <b>"; }, { label: "enum" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].notes = new Date(0); }, { label: "a Date object" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].notes = undefined; }, { label: "undefined" });
    await refused(base, opts, "type", (s) => { s.tables.projects[0].bac = Infinity; }, { label: "Infinity" });
    await refused(base, opts, "type", (s) => { s.tables.projects[1] = "row"; }, { label: "a row that is not an object" });
  });

  await test(`${name}: sizes and depth`, async () => {
    await refused(base, opts, "size", (s) => { s.tables.projects[0].notes = "x".repeat(20001); }, { label: "long text" });
    await refused(base, opts, "size", (s) => {
      let v = 1; for (let i = 0; i < 14; i++) v = { v };
      s.tables.settings[0].value = v;
    }, { label: "depth" });
    await refused(base, opts, "size", (s) => { while (s.tables.user_profiles.length <= 300) s.tables.user_profiles.push({ ...s.tables.user_profiles[0] }); }, { label: "row cap" });
    await refused(base, opts, "size", (s) => { while (s.responses.length <= 200) s.responses.push(s.responses[0]); }, { label: "response cap" });
  });

  await test(`${name}: tables, columns, keys and settings`, async () => {
    await refused(base, opts, "schema", (s) => { s.tables.notifications_log = []; }, { label: "unknown table" });
    await refused(base, opts, "schema", (s) => { delete s.tables.campuses; }, { label: "missing table" });
    await refused(base, opts, "schema", (s) => { s.tables.projects[0].created_by_email = null; }, { label: "unknown column" });
    await refused(base, opts, "schema", (s) => { delete s.tables.projects[0].notes; }, { label: "missing column" });
    await refused(base, opts, "schema", (s) => { s.tables.settings[0].key = "welcome_email"; }, { label: "settings key" });
    await refused(base, opts, "key", (s) => { s.tables.projects[0].id = null; }, { label: "null key" });
    await refused(base, opts, "key", (s) => { s.tables.campuses.push({ ...s.tables.campuses[0] }); }, { label: "repeated key" });
  });

  await test(`${name}: column policies (mask, null, body, figures, path)`, async () => {
    await refused(base, opts, "mask", (s) => { s.mask = { contacts: false }; }, { label: "mask off" });
    const withEmail = base.tables.user_profiles.findIndex((u) => u.email === MASK.email);
    if (withEmail >= 0) await refused(base, opts, "mask", (s) => { s.tables.user_profiles[withEmail].email = "a@b.example"; }, { label: "an unmasked email" });
    // Contact details inside free text (snapshot.js replaces them).
    await refused(base, opts, "mask", (s) => { s.tables.projects[0].notes = "Call 0300-1234567 for the keys."; }, { label: "a phone number in notes" });
    const inThread = base.tables.past_project_updates.findIndex((m) => m.past_project_id === plan.past?.id);
    if (inThread >= 0) await refused(base, opts, "mask", (s) => { s.tables.past_project_updates[inThread].body = "Write to someone@site.example.org"; }, { label: "an email in a message" });
    const rep = base.tables.board_reports.findIndex((r) => r.id === plan.report?.id && r.figures);
    if (rep >= 0) await refused(base, opts, "schema", (s) => { s.tables.board_reports[rep].figures = { ...s.tables.board_reports[rep].figures, risks: { top: [{ title: "x", mitigation: "y" }] } }; }, { label: "a risk mitigation in the report figures" });
    await refused(base, opts, "mask", (s) => { s.tables.user_profiles[0].phone = "not hidden"; }, { label: "an unmasked phone" });
    if (base.tables.project_risks_scored.length) {
      await refused(base, opts, "schema", (s) => { s.tables.project_risks_scored[0].description = "x"; }, { label: "description is always empty" });
    }
    const off = base.tables.comments.findIndex((c) => c.project_id !== plan.updates?.projectId);
    if (off >= 0) await refused(base, opts, "schema", (s) => { s.tables.comments[off].body = "x"; }, { label: "a message outside the plan's thread" });
    const offPast = base.tables.past_project_updates.findIndex((m) => m.past_project_id !== plan.past?.id);
    if (offPast >= 0) await refused(base, opts, "schema", (s) => { s.tables.past_project_updates[offPast].body = "x"; }, { label: "a past message outside the plan's thread" });
    const offReport = base.tables.board_reports.findIndex((r) => r.id !== plan.report?.id);
    if (offReport >= 0) await refused(base, opts, "schema", (s) => { s.tables.board_reports[offReport].figures = { a: 1 }; }, { label: "figures outside the plan's report" });
    const doc = base.tables.project_attachments.findIndex((a) => a.kind !== "site_visit");
    if (doc >= 0) await refused(base, opts, "schema", (s) => { s.tables.project_attachments[doc].file_path = "abc/real.pdf"; }, { label: "a storage path" });
    if (doc >= 0) await refused(base, opts, "schema", (s) => { s.tables.project_attachments[doc].file_path = "sim-media/m001"; }, { label: "a document as media" });
    const sv = base.tables.project_attachments.findIndex((a) => a.kind === "site_visit");
    if (sv >= 0) await refused(base, opts, "schema", (s) => { s.tables.project_attachments[sv].file_path = "sim-unavailable/" + s.tables.project_attachments[sv].id; }, { label: "a site-visit item without its key" });
  });

  await test(`${name}: recorded responses`, async () => {
    await refused(base, opts, "response", (s) => { s.responses.push({ key: "/rest/v1/projects?select=*", status: 200, contentRange: null, body: [] }); }, { label: "a request no template makes" });
    await refused(base, opts, "response", (s) => { s.responses.push(structuredClone(s.responses[0])); }, { label: "the same response twice" });
    await refused(base, opts, "response", (s) => { s.responses[0].status = 500; }, { label: "status" });
    await refused(base, opts, "response", (s) => { s.responses[0].contentRange = "rows 1-2"; }, { label: "content range" });
    await refused(base, opts, "response", (s) => { s.responses[0].body = "text"; }, { label: "body" });
    await refused(base, opts, "response", (s) => { s.responses[0].extra = 1; }, { label: "an extra field" });
    const users = base.responses.findIndex((r) => r.key.startsWith("/rest/v1/user_profiles?select=id,username,full_name,email"));
    if (users >= 0) {
      await refused(base, opts, "mask", (s) => { s.responses[users].body[0].email = "a@b.example"; }, { label: "an unmasked email in a response" });
      await refused(base, opts, "response", (s) => { s.responses[users].body[0].notify_email = true; }, { label: "a column the template's table does not allow" });
    }
    const gal = base.responses.findIndex((r) => r.key.startsWith("/rest/v1/project_attachments?kind=eq.site_visit"));
    if (gal >= 0 && base.responses[gal].body.length) {
      await refused(base, opts, "schema", (s) => { s.responses[gal].body[0].file_path = "abc/real.jpg"; }, { label: "a storage path in a response" });
      await refused(base, opts, "response", (s) => { s.responses[gal].body[0].projects.secret_col = 1; }, { label: "an unknown column inside an embed" });
    }
  });

  await test(`${name}: rpc answer`, async () => {
    if (nonCapex) await refused(base, opts, "schema", (s) => { s.rpc.project_has_deliverables.push(nonCapex.id); s.rpc.project_has_deliverables.sort(); }, { label: "not a CAPEX project" });
    if (base.rpc.project_has_deliverables.length >= 2) await refused(base, opts, "schema", (s) => { s.rpc.project_has_deliverables.reverse(); }, { label: "not sorted" });
    await refused(base, opts, "schema", (s) => { s.rpc.is_pmo = true; }, { label: "another rpc" });
    assert.ok(capex.length > 0);
  });

  await test(`${name}: media list`, async () => {
    if (base.media.length >= 2) await refused(base, opts, "media", (s) => { [s.media[0], s.media[1]] = [s.media[1], s.media[0]]; }, { label: "order" });
    if (base.media.length) {
      await refused(base, opts, "media", (s) => { s.media[0].sha256 = "x"; }, { label: "hash" });
      await refused(base, opts, "media", (s) => { s.media[0].size = 0; }, { label: "size" });
      await refused(base, opts, "media", (s) => { s.media[0].mime = "text/html"; }, { label: "type" });
      await refused(base, opts, "media", (s) => { s.media.pop(); }, { label: "an item missing from the list" });
      await refused(base, opts, "media", (s) => { s.media[0].blob = "x"; }, { label: "an extra field" });
    }
  });

  await test(`${name}: invariants, fingerprint and plan`, async () => {
    await refused(base, opts, "invariant", (s) => { s.tables.portfolio_dashboard[0].total_capex += 1000; }, { label: "df-total" });
    await refused(base, opts, "invariant", (s) => { s.tables.portfolio_dashboard[0].total_projects += 1; }, { label: "capex-count" });
    await refused(base, opts, "invariant", (s) => { s.tables.project_metrics.pop(); }, { label: "metrics-ids" });
    await refused(base, opts, "invariant", (s) => { s.invariants[0].ok = false; }, { label: "the checks sent differ" });
    await refused(base, opts, "fingerprint", (s) => { s.tables.projects[0].name += "x"; }, { label: "one character changed" });
    await refused(base, opts, "fingerprint", (s) => { s.code = s.code === "000000" ? "111111" : "000000"; }, { label: "code" });
    await refused(base, opts, "plan", (s) => { s.plan.dashboard.capexTotal += 1; }, { refingerprint: true, label: "a different plan" });
    // Without a story the story's recorded screens are no longer requests of the plan: refused there first.
    await refused(base, opts, "response", (s) => { s.plan.story = null; }, { refingerprint: true, label: "no story" });
    await refused(base, opts, "plan", (s) => { s.plan.flags.typedTexts = []; s.plan.users = null; }, { refingerprint: true, label: "a plan without its users row" });
  });

  await test(`${name}: launcher choices travel checked (test accounts, overrides)`, async () => {
    await refused(base, opts, "schema", (s) => { s.testAccounts = ["ffffffff-ffff-4fff-8fff-ffffffffffff", "00000000-0000-4000-8000-000000000000"]; }, { label: "unsorted" });
    await refused(base, opts, "schema", (s) => { s.testAccounts = ["00000000-0000-4000-8000-000000000000"]; }, { refingerprint: true, label: "not a user" });
    await refused(base, opts, "schema", (s) => { s.overrides = { pick: "x" }; }, { label: "unknown override" });
    await refused(base, opts, "schema", (s) => { s.overrides = { storyId: "x" }; }, { label: "override id" });
    await refused(base, opts, "schema", (s) => { s.overrides = { say: { [s.pmo.id]: "<b>x</b>" } }; }, { label: "say text" });
    await refused(base, opts, "schema", (s) => { s.leftOut = -1; }, { label: "leftOut" });
  });

  await test(`${name}: media items (bytes, magic, hash, listing)`, async () => {
    if (!base.media.length) return;
    const m = base.media[0];
    const blob = blobs.get(m.attachmentId);
    const item = { key: m.key, attachmentId: m.attachmentId, mime: m.mime, size: m.size, sha256: m.sha256, blob };
    const ok = await validateMediaItem(item, base);
    assert.equal(ok.blob.type, m.mime);
    assert.equal(ok.blob.size, m.size);
    assert.notEqual(ok.blob, blob, "re-wrapped");
    const bad = async (label, it, snap = base) => {
      let err = null;
      try { await validateMediaItem(it, snap); } catch (e) { err = e; }
      assert.ok(err instanceof ValidationError && err.code === "media", `${label}: ${err && err.message}`);
    };
    await bad("another file", { ...item, blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])]) });
    await bad("size", { ...item, size: item.size + 1 });
    await bad("not listed", { ...item, key: "m999" });
    await bad("other id", { ...item, attachmentId: "00000000-0000-4000-8000-000000000000" });
    await bad("extra field", { ...item, url: "x" });
    await bad("no blob", { ...item, blob: "bytes" });
    // An HTML page labelled as a picture, with a list entry that matches it exactly: the magic bytes refuse it.
    const html = new Blob([new TextEncoder().encode("<html><script>alert(1)</script></html>")]);
    const { sha256Hex } = await import(new URL("../../../src/sim/live/canon.js", import.meta.url));
    const snap = structuredClone(base);
    Object.assign(snap.media[0], { size: html.size, sha256: await sha256Hex(html), mime: "image/jpeg" });
    await bad("magic bytes", { ...item, mime: "image/jpeg", size: html.size, sha256: snap.media[0].sha256, blob: html }, snap);
    const snap2 = structuredClone(base);
    const att = snap2.tables.project_attachments.find((a) => a.id === m.attachmentId);
    att.kind = "document";
    await bad("not a site-visit item", item, snap2);
  });
}

const syn = await H.syntheticSnapshot();
await battery("invented data", syn.snapshot, syn.blobs, syn.NOW);

const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }
const fx = await H.fixtureSnapshot(dir);
await battery("fixture", fx.snapshot, fx.blobs, fx.snapshot.takenAt + 2 * MIN);
await test("fixture: validation is quick enough for the launch (under 1.5 s)", async () => {
  const t0 = Date.now();
  await validateSnapshot(fx.snapshot, { build: fx.snapshot.build, now: fx.snapshot.takenAt });
  const ms = Date.now() - t0;
  console.log(`   validated in ${ms} ms`);
  assert.ok(ms < 1500);
});
console.log(`PASS · ${passed} checks`);
