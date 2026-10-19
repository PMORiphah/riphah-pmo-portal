// PMO Simulation (live data): the click-target inventory, static part (contract §H.4, arch §6.5).
// PUBLIC: no data. Owner: B3b.
//
//   node scripts/sim/live/actions-test.mjs
//   SIM_FIXTURE=<private fixture dir> node scripts/sim/live/actions-test.mjs
//
// Builds the scenes (src/sim/scenes.js) from a plan and lists every step that acts: nav, tab,
// click, type, pick (combo and option), key, store and do. Each target must be covered by
// scripts/sim/live/allowed-actions.json: selector strings by its patterns, function targets by their
// step label. The guard's own lists (src/sim/director/guard.js) must agree with the file. Runs on
// invented data (scripts/sim/live/synthetic.mjs, through the B2 test set-up), on a set of plan
// mutations that reach every scene variant, and on the private fixture when SIM_FIXTURE is set.
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../../../src/", import.meta.url);
const ALLOWED = JSON.parse(fs.readFileSync(new URL("./allowed-actions.json", import.meta.url), "utf8"));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

const H = await import(new URL("./b2-support.mjs", import.meta.url));
H.nodeWindow();
const { buildScenes, HOOKS } = await import(new URL("sim/scenes.js", SRC));
const { buildNarration } = await import(new URL("sim/live/build.js", SRC));
const G = await import(new URL("sim/director/guard.js", SRC));

// The guard's lists and the file agree.
ok(JSON.stringify([...G.NAV_OK].sort()) === JSON.stringify([...ALLOWED.nav].sort()), "guard NAV_OK = allowed nav");
ok(JSON.stringify([...G.TAB_OK].sort()) === JSON.stringify([...ALLOWED.tab].sort()), "guard TAB_OK = allowed tabs");
ok(JSON.stringify([...G.KEY_OK]) === JSON.stringify(ALLOWED.key), "guard KEY_OK = allowed keys");
ok(JSON.stringify([...G.STORE_OK]) === JSON.stringify(ALLOWED.store), "guard STORE_OK = allowed storage keys");
ok(JSON.stringify([...G.HELPERS_OK]) === JSON.stringify(ALLOWED.do), "guard HELPERS_OK = allowed helpers");
ok(!G.TAB_OK.includes("deliverables"), "the Deliverables tab is never allowed");
for (const t of ["[data-tour=\"pm-select\"]", "td[data-col=\"phone\"]", "[data-tab=\"deliverables\"]", "[data-filter=\"delayed\"]"]) {
  ok(G.DENY_INSIDE.includes(t), `guard denies ${t}`);
}
ok(G.DENY_WORDS.test("Assign to 2 projects") && G.DENY_WORDS.test("Publish…") && G.DENY_WORDS.test("Save") && G.DENY_WORDS.test("Delete")
  && G.DENY_WORDS.test("Email report") && G.DENY_WORDS.test("Download as Excel") && G.DENY_WORDS.test("Post") && !G.DENY_WORDS.test("Cancel")
  && !G.DENY_WORDS.test("Open") && !G.DENY_WORDS.test("All Projects") && !G.DENY_WORDS.test("Head to head (3)"), "deny words");

const reOf = (list) => list.map((s) => new RegExp(s));
const R = { click: reOf(ALLOWED.click), type: reOf(ALLOWED.type), pick: reOf(ALLOWED.pick), option: reOf(ALLOWED.option) };
const never = ALLOWED.never;

/** Every acting step of the scenes: [{ scene, action, target, label }]. */
function inventory(scenes) {
  const out = [];
  for (const sc of scenes) {
    for (const b of [...(sc.setup || []), ...(sc.beats || [])]) {
      const at = { scene: sc.n, label: b.label || null };
      if (b.nav) out.push({ ...at, action: "nav", target: b.nav });
      if (b.tab) out.push({ ...at, action: "tab", target: b.tab });
      if (b.click) out.push({ ...at, action: "click", target: b.click });
      if (b.type) out.push({ ...at, action: "type", target: b.type });
      if (b.pick) { out.push({ ...at, action: "pick", target: b.pick }); out.push({ ...at, action: "option", target: b.option }); }
      if (b.key) out.push({ ...at, action: "key", target: b.key });
      if (b.store) out.push({ ...at, action: "store", target: b.store[0] });
      if (b.do) out.push({ ...at, action: "do", target: b.do });
      if (b.hover != null && typeof b.hover === "string") ok(!/\[data-kpi="(approved|remaining_capex)"\]|cpi|spi/i.test(b.hover), `scene ${sc.n}: no hover on Approved Projects, Remaining CAPEX, CPI or SPI`);
    }
  }
  return out;
}

function checkScenes(scenes, label) {
  ok(scenes.length === 21 && scenes[0].n === 0 && scenes[20].n === 20 && scenes[20].closing, `${label}: 21 scenes, 0 … 20 closing`);
  ok(scenes[0].critical && scenes[1].critical, `${label}: scenes 0 and 1 are critical`);
  for (const a of inventory(scenes)) {
    const where = `${label} scene ${a.scene} ${a.action} ${typeof a.target === "string" ? a.target : `(${a.label})`}`;
    if (a.action === "nav") { ok(ALLOWED.nav.includes(a.target), `${where}: nav allowed`); continue; }
    if (a.action === "tab") { ok(ALLOWED.tab.includes(a.target), `${where}: tab allowed`); continue; }
    if (a.action === "key") { ok(ALLOWED.key.includes(a.target), `${where}: key allowed`); continue; }
    if (a.action === "store") { ok(ALLOWED.store.includes(a.target), `${where}: storage key allowed`); continue; }
    if (a.action === "do") { ok(ALLOWED.do.includes(a.target), `${where}: helper allowed`); continue; }
    if (typeof a.target === "string") {
      ok((R[a.action] || []).some((re) => re.test(a.target)), `${where}: target covered by allowed-actions.json`);
      for (const n of never) ok(!a.target.includes(n), `${where}: never ${n}`);
    } else {
      ok(typeof a.target === "function" && a.action === "click" && !!a.label && a.label in ALLOWED.clickLabels,
        `${where}: a function target needs an allowed label`);
    }
  }
  // Every scene that acts on a page names it, and the hooks list covers the selectors in use.
  for (const sc of scenes) if (!sc.closing) ok(typeof sc.page === "string", `${label} scene ${sc.n}: has a page`);
  ok(HOOKS.length > 50, `${label}: HOOKS listed`);
}

// ── invented data, and its variants ─────────────────────────────────────────────────────────────
const { snapshot: syn } = await H.syntheticSnapshot({ now: null });
const N0 = buildNarration(syn);
const meta = (s) => ({ tables: { campuses: s.tables.campuses, user_profiles: s.tables.user_profiles }, say: s.overrides?.say || {} });
checkScenes(buildScenes({ plan: syn.plan, lines: N0.lines, meta: meta(syn) }), "synthetic");

const mutate = (f) => { const s = structuredClone(syn); f(s.plan); return s; };
const variants = {
  "no story": (p) => { p.story = null; p.timeline.campus = null; p.performance.storyShown = false; },
  "no reviewer": (p) => { p.pdd.reviewer = null; p.pdd.reviewerN = 0; },
  "no risks cell": (p) => { p.risks.cell = null; p.risks.rowId = null; },
  "assign outside the compared": (p) => { p.assign.campus = "Elsewhere"; p.assign.variant = "other"; },
  "updates newest": (p) => { p.updates.variant = "newest"; },
  "updates none": (p) => { p.updates.variant = "none"; },
  "past no thread": (p) => { p.past.variant = "nothread"; },
  "gallery campus": (p) => { p.gallery.variant = "campus"; },
  "gallery all": (p) => { p.gallery.variant = "all"; },
  "gallery empty": (p) => { p.gallery.variant = "empty"; p.gallery.total = 0; },
  "report published": (p) => { p.report.variant = "published"; },
  "report baselines": (p) => { p.report.variant = "baselines"; p.report.id = null; },
  "story with tasks": (p) => { if (p.story) p.story.tasks = 3; },
  "fewer campuses": (p) => { p.compare.columns = p.compare.columns.slice(0, 1); },
};
for (const [name, f] of Object.entries(variants)) {
  const s = mutate(f);
  let N;
  try { N = buildNarration(s); } catch { N = N0; }       // the scenes must build even when a line cannot
  checkScenes(buildScenes({ plan: s.plan, lines: N.lines, meta: meta(s) }), name);
}

// The test fails on a step outside the list (a KPI card click, a header sort, an unknown helper).
for (const bad of [{ click: '[data-kpi="budget_released"]' }, { click: 'th[data-col="released"]' }, { do: "openSettings" },
  { click: () => null, label: "anything" }, { key: "Enter" }, { store: ["pmo_session", "x"] }, { tab: "deliverables" }, { nav: "set" }]) {
  const sc = buildScenes({ plan: syn.plan, lines: N0.lines, meta: meta(syn) });
  sc[2].beats = [...sc[2].beats, bad];
  let threw = false;
  const before = checks;
  try { checkScenes(sc, "negative"); } catch { threw = true; }
  checks = before + 1;
  assert.ok(threw, `a step outside the list is caught: ${JSON.stringify(bad)}`);
}

// ── the private fixture ─────────────────────────────────────────────────────────────────────────
const dir = process.env.SIM_FIXTURE;
if (!dir) {
  console.log(`actions-test: ${checks} checks passed on invented data; SKIP fixture (SIM_FIXTURE unset)`);
  process.exit(0);
}
const { snapshot: fx } = await H.fixtureSnapshot(dir);
const NF = buildNarration(fx);
const scenes = buildScenes({ plan: fx.plan, lines: NF.lines, meta: meta(fx) });
checkScenes(scenes, "fixture");
ok(scenes.filter((s) => s.skip).length === 0, "fixture: no scene left out by the narration");
console.log(`actions-test: PASS ${checks} checks (invented data, ${Object.keys(variants).length} variants, fixture)`);
