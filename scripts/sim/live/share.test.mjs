// PMO Simulation: a copy the PMO shared with guests, on the simulation tab's side. PUBLIC: no data.
//   - the shared freshness rule (src/sim/live/validate.js sharedFreshness, freshnessFor, dayTimePKT):
//     valid until the share's expiry, never beyond 8 days or 2 minutes in the future, no amber;
//   - the print label and read-time rule of public/sim-boot.js (its marked as-of block, run here on its
//     own): live data within a day, a shared copy within 8 days, never both in one page;
//   - what the failure screen says for a shared copy (src/sim/handoff.js describeFailure).
//
//   node scripts/sim/live/share.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../../../src/", import.meta.url);
const V = await import(new URL("sim/live/validate.js", SRC));
const HO = await import(new URL("sim/handoff.js", SRC));
const { sharedFreshness, freshnessFor, freshness, dayTimePKT, SHARE } = V;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok -", name); };
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 19, 9, 5);          // Mon 19 Oct 2026, 14:05 PKT
const EXP = T0 + 7 * DAY;

test("dayTimePKT: weekday, day, month and 24-hour time in Pakistan", () => {
  assert.equal(dayTimePKT(T0), "Mon 19 Oct, 14:05");
  assert.equal(dayTimePKT(Date.UTC(2026, 9, 19, 19, 0)), "Tue 20 Oct, 00:00", "midnight is 00, not 24");
  assert.equal(dayTimePKT(EXP), "Mon 26 Oct, 14:05");
});

test("sharedFreshness: ok from the read until the expiry (0 min, 1 day, 6 d 23 h), no amber", () => {
  const f0 = sharedFreshness(T0, EXP, T0);
  assert.deepEqual(f0, { state: "ok", ageMin: 0, readAt: "Mon 19 Oct, 14:05", reason: null, text: "" });
  assert.equal(sharedFreshness(T0, EXP, T0 + DAY).ageMin, 1440);
  assert.equal(sharedFreshness(T0, EXP, T0 + DAY).state, "ok");
  assert.equal(sharedFreshness(T0, EXP, T0 + 6 * DAY + 23 * HOUR).state, "ok");
  for (let t = T0; t < EXP; t += HOUR) assert.equal(sharedFreshness(T0, EXP, t).state, "ok", `ok at ${(t - T0) / HOUR} h`);
  // Across the PKT and UTC day change, which the live rule refuses.
  assert.equal(freshness(T0, T0 + 12 * HOUR).state, "refused");
  assert.equal(sharedFreshness(T0, EXP, T0 + 12 * HOUR).state, "ok");
});

test("sharedFreshness: refused at and after the expiry, with the PMO's withdrawal wording and the end time", () => {
  for (const now of [EXP, EXP + 1, EXP + DAY]) {
    const f = sharedFreshness(T0, EXP, now);
    assert.equal(f.state, "refused"); assert.equal(f.reason, "expired");
    assert.equal(f.text, "The PMO has stopped sharing this simulation: it was shared until Mon 26 Oct, 14:05 PKT.");
  }
});

test("sharedFreshness: refused beyond 8 days even with a later expiry, and more than 2 minutes in the future", () => {
  const late = T0 + 10 * DAY;
  assert.equal(sharedFreshness(T0, late, T0 + 8 * DAY).state, "ok");
  const f = sharedFreshness(T0, late, T0 + 8 * DAY + MIN);
  assert.equal(f.reason, "age");
  assert.equal(f.text, "The shared data is too old (portal data as of Mon 19 Oct, 14:05 PKT). Ask the PMO to share it again.");
  assert.equal(sharedFreshness(T0, EXP, T0 - 1.5 * MIN).state, "ok", "a little clock difference is allowed");
  const fu = sharedFreshness(T0, EXP, T0 - 3 * MIN);
  assert.equal(fu.reason, "future"); assert.equal(fu.ageMin, 0);
  assert.match(fu.text, /^The shared data is timed after this computer's clock \(portal data as of Mon 19 Oct, 14:05 PKT\)/);
  for (const bad of [[NaN, EXP, T0], [T0, undefined, T0], [T0, EXP, Infinity]]) {
    const x = sharedFreshness(...bad);
    assert.equal(x.state, "refused"); assert.equal(x.reason, "time"); assert.equal(x.readAt, null);
  }
  assert.equal(SHARE.maxDays, 7); assert.equal(SHARE.hardDays, 8); assert.equal(SHARE.futureMs, 2 * MIN);
});

test("freshnessFor: live without a share, the share's rule with one", () => {
  for (const age of [0, 20 * MIN, 61 * MIN, 3 * DAY]) {
    assert.deepEqual(freshnessFor(T0, T0 + age, null), freshness(T0, T0 + age), `live at ${age / MIN} min`);
    assert.deepEqual(freshnessFor(T0, T0 + age, { expiresAt: EXP }), sharedFreshness(T0, EXP, T0 + age), `shared at ${age / MIN} min`);
  }
  assert.equal(freshnessFor(T0, T0 + 20 * MIN).state, "amber", "the live default is unchanged");
});

// ── public/sim-boot.js: the as-of block, on its own ──────────────────────────
const boot = fs.readFileSync(new URL("../../../public/sim-boot.js", import.meta.url), "utf8");
const at = boot.indexOf("// @sim-asof-begin"), end = boot.indexOf("// @sim-asof-end");
assert.ok(at > 0 && end > at, "sim-boot.js marks its as-of block");
const block = boot.slice(at, end);
const asOfBlock = () => new Function(`${block}\nreturn { printLabel, acceptAsOf, state: () => ({ asOfMs, asOfShared }) };`)();

test("sim-boot: live read times within a day, the live label; a later Refresh only moves forward", () => {
  const b = asOfBlock();
  assert.equal(b.printLabel(), "Live portal data · not an official report");
  assert.equal(b.acceptAsOf(T0 - 25 * HOUR, false, T0), false, "live: more than a day old is refused");
  assert.equal(b.acceptAsOf(T0 + 6 * MIN, false, T0), false, "more than 5 minutes ahead is refused");
  assert.equal(b.acceptAsOf(T0 - 23 * HOUR, false, T0), true);
  assert.equal(b.acceptAsOf(T0 - 23 * HOUR - 1, false, T0), false, "never backwards");
  assert.equal(b.acceptAsOf(T0, false, T0), true);
  assert.equal(b.printLabel(), "Live portal data as of 14:05 PKT · not an official report");
});

test("sim-boot: a shared copy up to 8 days old, its dated label; a page never mixes the two", () => {
  let b = asOfBlock();
  assert.equal(b.acceptAsOf(T0 - 3 * DAY, true, T0), true, "3 days old, shared");
  assert.equal(b.printLabel(), "Portal data as of 16 Oct 2026, 14:05 PKT · shared by the PMO · not an official report");
  assert.equal(b.acceptAsOf(T0, false, T0), false, "no live read time after a shared one");
  b = asOfBlock();
  assert.equal(b.acceptAsOf(T0 - 8 * DAY - MIN, true, T0), false, "more than 8 days old is refused");
  assert.equal(b.acceptAsOf(T0 - 3 * DAY, false, T0), false, "3 days old is refused as live");
  assert.equal(b.acceptAsOf(T0 - HOUR, false, T0), true);
  assert.equal(b.acceptAsOf(T0, true, T0), false, "no shared read time after a live one");
  assert.deepEqual(b.state(), { asOfMs: T0 - HOUR, asOfShared: false });
  // The boot script's own self-test pattern accepts both labels, and setAsOf passes the flag through.
  assert.ok(boot.includes("check('print', /portal data/i.test(printStyle.textContent));"));
  assert.ok(boot.includes("if (!acceptAsOf(ms, shared === true, now())) return false;"));
  for (const s of ["Live portal data · not an official report", "Portal data · shared by the PMO · not an official report"]) assert.match(s, /portal data/i);
  assert.ok(!/as PMO/.test(boot), "the boot failure text does not tell a guest to sign in as PMO");
});

// ── the failure screen of a shared copy ─────────────────────────────────────
const { describeFailure, HandoffError, TEXT, SHARED_REFUSALS } = HO;
const refused = (portalCode, mode = null) => Object.assign(new HandoffError("portal-refused", "x", portalCode), mode ? { mode } : {});

test("describeFailure: withdrawn, expired and build-share in the guest's words", () => {
  assert.equal(TEXT.withdrawn, "The PMO has stopped sharing this simulation.");
  assert.deepEqual(Object.keys(SHARED_REFUSALS).sort(), ["build-share", "expired", "replaced", "withdrawn"]);
  // A stale click after Replace: the portal found a newer copy for this guest, so not "stopped sharing".
  const rp = describeFailure(refused("replaced"));
  assert.equal(rp.title, "A newer copy was shared"); assert.equal(rp.reason, TEXT.replaced); assert.equal(rp.check, "replaced");
  assert.ok(!/stopped sharing/.test(rp.reason));
  for (const pc of ["withdrawn", "expired"]) {
    const v = describeFailure(refused(pc));
    assert.equal(v.title, "This simulation is no longer shared"); assert.equal(v.reason, TEXT.withdrawn); assert.equal(v.check, pc);
  }
  const b = describeFailure(refused("build-share"));
  assert.equal(b.title, "The portal has been updated"); assert.equal(b.reason, TEXT.buildShare);
  const st = describeFailure(Object.assign(new HandoffError("stale", "The PMO has stopped sharing this simulation: it was shared until Mon 26 Oct, 14:05 PKT."), { mode: "shared" }));
  assert.equal(st.title, "This shared simulation cannot play"); assert.match(st.reason, /stopped sharing/); assert.equal(st.remedy, "Close this tab.");
  const p = describeFailure(Object.assign(new HandoffError("protocol", "manifest: mode"), { mode: "shared" }));
  assert.equal(p.remedy, TEXT.sharedAgain);
  assert.equal(TEXT.sharedAgain, "Close this tab and press Simulation in the portal again. If it keeps failing, tell the PMO.");
});

test("describeFailure: the PMO's live texts are unchanged", () => {
  const AGAIN = "Close this tab, then press Simulation in the signed-in portal again.";
  // index.js's self-test failure uses the same remedy (exported, not a second copy): it must be imported there.
  assert.equal(HO.AGAIN, AGAIN);
  const idx = fs.readFileSync(new URL("sim/index.js", SRC), "utf8");
  const imp = /import \{([^}]*)\} from "\.\/handoff\.js";/.exec(idx);
  assert.ok(imp && imp[1].split(",").map((x) => x.trim()).includes("AGAIN"), "index.js imports AGAIN from handoff.js");
  assert.ok(!/const AGAIN\b/.test(idx), "no second copy in index.js");
  assert.deepEqual(describeFailure(new HandoffError("stale", "Live data is 61 min old (read 10:00 PKT). Press Refresh data.")),
    { title: "The portal data is too old", reason: "Live data is 61 min old (read 10:00 PKT).", remedy: AGAIN, check: "stale" });
  assert.deepEqual(describeFailure(new HandoffError("portal-refused", "Sign in again.", "signed-out")),
    { title: "The portal stopped the hand-over", reason: "Sign in again.", remedy: AGAIN, check: "signed-out" });
  assert.deepEqual(describeFailure(new HandoffError("timeout", TEXT.timeout)),
    { title: "The data did not arrive", reason: TEXT.timeout, remedy: "Keep the portal tab open and signed in. " + AGAIN });
  assert.equal(describeFailure(new HandoffError("no-nonce", "x")), null);
  assert.equal(describeFailure(new HandoffError("fingerprint", "x")).remedy, AGAIN);
});

// ── the migration (shown to the PMO before it is run) ──────────────────────
test("migration: no drop or delete statement, policies for signed-in users only, one active share per site", () => {
  const sql = fs.readFileSync(new URL("../../../supabase/migrations/20261019_sim_shares.sql", import.meta.url), "utf8");
  const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  assert.ok(!/\b(drop|delete)\b/i.test(code), "no DROP or DELETE outside comments (the SQL tool would hold it)");
  const pols = [...code.matchAll(/create policy (\w+) on public\.(sim_shares|sim_share_recipients)\s+for (\w+)( to authenticated)?/g)];
  assert.equal(pols.length, 6);
  assert.ok(pols.every((m) => m[4]), "every table policy is for authenticated (anon reads 0 rows, no error)");
  assert.match(code, /create unique index sim_shares_one_active on public\.sim_shares \(site\) where status = 'active';/);
  assert.match(code, /n\.site = o\.site/, "activating replaces only the same site's share");
  assert.match(code, /new\.created_at, new\.site\)/, "a share's site never changes");
  assert.match(code, /create or replace function public\.sim_share_cleanup_ready\(\)/);
  assert.match(code, /create policy sim_shares_pmo_remove_storage on storage\.objects\s+for all to authenticated\s+using \(bucket_id = 'sim-shares' and public\.is_pmo\(\)\)\s+with check \(bucket_id = 'sim-shares' and public\.is_pmo\(\)\);/,
    "the PMO's removal policy is part of the migration, PMO only, written as FOR ALL");
});

console.log(`PASS share.test.mjs: ${n} checks`);
