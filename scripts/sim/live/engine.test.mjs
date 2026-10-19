// PMO Simulation (live data): the director's engine without a browser (src/sim/director/engine.js,
// contract §H.3). PUBLIC: no data. Owner: B3b.
//
//   node scripts/sim/live/engine.test.mjs
//   SIM_FIXTURE=<private fixture dir> node scripts/sim/live/engine.test.mjs
//
// On the narration of invented data (and of the fixture when SIM_FIXTURE is set): the 2:30 constants,
// the text and holds a line is spoken with (candidate, short, compacted, rehearsal), word and phrase
// anchors, the time a word is reached, the governor, the rehearsal's candidate fallback on missing
// figures (and the critical failure), scenes left out, chapter jumps, and that every scene's spoken
// words exist for its word anchors.
import assert from "node:assert/strict";

globalThis.requestAnimationFrame ||= (f) => setTimeout(f, 16);
const H = await import(new URL("./b2-support.mjs", import.meta.url));
H.nodeWindow();
// An empty page, so the scenes' own predicates (which look at the screen) can be evaluated.
const { makeDom } = await import(new URL("./minidom.mjs", import.meta.url));
const dom = makeDom();
globalThis.document = dom.document;
globalThis.getComputedStyle = dom.getComputedStyle;
globalThis.innerWidth = 1366; globalThis.innerHeight = 768;
const SRC = new URL("../../../src/", import.meta.url);
const E = await import(new URL("sim/director/engine.js", SRC));
const { buildNarration } = await import(new URL("sim/live/build.js", SRC));
const { buildScenes } = await import(new URL("sim/scenes.js", SRC));
const T = await import(new URL("sim/live/timing.js", SRC));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

ok(E.LIMIT === 150 && E.GOVERN_AT === 146 && E.CUT_AT === 149.5 && E.WAIT_LIMIT === 5 && E.SHORT_HOLD === 0.7, "constants 150 / 146 / 149.5 / 5 / 0.7");
ok(E.LIMIT === T.LIMIT && E.GOVERN_AT === T.GOVERN_AT && E.CUT_AT === T.CUT_AT, "engine and timing.js agree");

const fakeNarrator = (wpm = 135) => ({
  voiceOn: false, boundaries: false, rate: 1, log: [], natural: null, voice: null,
  get wpm() { return wpm; },
  estimate(words) { return words * 60 / wpm + 0.3; },
  speak: async () => ({ read: true }), cancel() {},
});
const fakeSpot = () => ({ set() {}, clear() {} });
const backend = { snapshot: () => ({}), restore() {}, reset() {} };

function director({ lines, scenes, plan, mode = "run", wpm = 135, clock }) {
  return new E.Director({ backend, lines, meta: { plan, chapters: [], scenes: [] }, scenes, narrator: fakeNarrator(wpm),
    spotlight: fakeSpot(), clock, mode, guard: { check: () => true } });
}

async function suite(snapshot, label) {
  const narration = buildNarration(snapshot);
  const lines = narration.lines;
  const meta = { tables: { campuses: snapshot.tables.campuses, user_profiles: snapshot.tables.user_profiles }, say: {} };
  const scenes = buildScenes({ plan: snapshot.plan, lines, meta });
  const d = director({ lines, scenes, plan: snapshot.plan });

  // Text and holds.
  const s01 = lines.find((l) => l.id === "s01");
  ok(d._text(s01, false).caption === s01.caption && d._text(s01, true).caption === s01.short.caption, `${label}: main and short text`);
  ok(d._hold(s01, false) === s01.minHold && Math.abs(d._hold(s01, true) - s01.minHold * 0.7) < 1e-9, `${label}: holds, short 70 %`);
  const r = director({ lines, scenes, plan: snapshot.plan, mode: "rehearsal" });
  ok(r._hold(s01, false) === 0, `${label}: the rehearsal holds nothing`);
  const s05 = lines.find((l) => l.id === "s05");
  s05.compact = true;
  ok(d._text(s05, false).caption === s05.short.caption && Math.abs(d._hold(s05, false) - s05.minHold * 0.7) < 1e-9, `${label}: a compacted line is said short`);
  s05.compact = false;

  // Word anchors in every scene exist in the line they wait on (when the line is said in full).
  const missing = [];
  for (const sc of scenes) {
    let cur = null;
    for (const b of [...(sc.beats || [])]) {
      if (b.say) cur = lines.find((l) => l.id === b.say);
      if ((b.word == null && b.phrase == null) || !cur || cur.skip) continue;
      const toks = cur.speech.split(/\s+/).map((t, i) => ({ t: t.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), at: i }));
      const line = { text: cur.speech, toks: [] };
      let at = 0;
      for (const m of cur.speech.matchAll(/\S+/g)) line.toks.push({ t: toks[at++].t, at: m.index });
      const api = d.api({ short: false, rec: { notes: [] }, scene: sc });
      if (b.when && !b.when(api)) continue;
      const k = d._wordIndex(b, line, api);
      // A step that may be skipped (ifWord) or falls back to a fraction (frac) is allowed to miss; the
      // main anchors of the approved lines must all be found.
      if (!b.ifWord && b.frac == null) ok(k >= 0, `${label} scene ${sc.n}: anchor ${b.word || b.phrase} found in ${cur.id}`);
      if (k >= 0) n++;
      else missing.push(`${sc.n}:${cur.id}:${typeof b.word === "function" || typeof b.phrase === "function" ? "fn" : (b.word || b.phrase)}`);
    }
  }

  // With every line in its main form, an anchor may be missing only where the scene says so: the
  // short-line anchors ("side", "critical" in s11, "draft", "payments" #2 with a percent said).
  const optional = /^(12:s12a:side|11:s11:critical|18:s18:draft|4:s04:payments|3:s03:await)$/;
  ok(missing.every((m) => optional.test(m)), `${label}: every main anchor is said (${missing.join(", ")})`);
  // Phrase and nth.
  const L = { text: "We'll see current portal data: money, projects, sites, people, reports. Money first.", toks: [] };
  for (const m of L.text.matchAll(/\S+/g)) L.toks.push({ t: m[0].toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), at: m.index });
  ok(d._wordIndex({ word: "money" }, L, {}) === 5 && d._wordIndex({ word: "Money", nth: 2 }, L, {}) === 10, `${label}: word and nth`);
  ok(d._wordIndex({ phrase: "sites, people" }, L, {}) === 7 && d._wordIndex({ word: "absent" }, L, {}) === -1, `${label}: phrase and missing word`);

  // The governor: at 100 wpm the run would pass 146 s → the first scene is short; at 150 it is not.
  const slow = director({ lines, scenes, plan: snapshot.plan, wpm: 100 });
  slow._newReport();
  ok(slow._govern(0) === true, `${label}: governor shortens at 100 wpm`);
  const fast = director({ lines, scenes, plan: snapshot.plan, wpm: 150 });
  fast._newReport();
  ok(fast._govern(0) === false, `${label}: no governor at 150 wpm`);

  // Rehearsal fallback: a line whose figures are not on screen moves to the next candidate that passes.
  const s04 = lines.find((l) => l.id === "s04");
  const use0 = s04.use;
  r._pollFigures = async (figs) => figs.map((f) => ({ slot: f.slot, where: f.where, screen: f.screen, ok: !/^releasedM|^relPct/.test(f.slot) }));
  const rec = { notes: [], failed: [], figureChecks: [], checkMs: 0 };
  await r._figures({ line: { L: s04, short: false, checked: false, text: s04.speech }, rec, signal: null });
  const used = s04.candidates[s04.use].name;
  ok(s04.use > use0 && s04.candidates[s04.use].figures.every((f) => !/^releasedM|^relPct/.test(f.slot)), `${label}: s04 falls back to ${used}`);
  ok(rec.failed.length >= 1 && rec.notes.some((t) => / line is used$/.test(t)), `${label}: the fallback is noted`);
  s04.use = use0;
  // A critical line with no candidate left fails the rehearsal.
  r._pollFigures = async (figs) => figs.map((f) => ({ slot: f.slot, where: f.where, screen: f.screen, ok: false }));
  const u1 = s01.use;
  await assert.rejects(r._figures({ line: { L: s01, short: false, checked: false, text: s01.speech }, rec: { notes: [], failed: [], figureChecks: [], checkMs: 0 }, signal: null }),
    (e) => e instanceof E.FigureFailure && e.line === "s01");
  s01.use = u1;
  n++;

  // Scenes left out are passed over by Next and Chapters.
  const sc2 = scenes.map((s) => ({ ...s }));
  sc2[7].skip = true; sc2[8].skip = true;
  const j = director({ lines, scenes: sc2, plan: snapshot.plan });
  ok(j._playable(7, 1) === 9 && j._playable(8, -1) === 6, `${label}: left-out scenes are skipped`);

  // The run waits for a word at its estimated time when the voice reports no boundaries.
  const t0 = performance.now();
  const clock = { now: () => (performance.now() - t0) / 1000 * 40 };      // 40× speed
  const w = director({ lines, scenes, plan: snapshot.plan, clock });
  const line = { text: "one two three four five six", toks: [], words: 6, wpm: 120, spokeAt: 0, charIndex: -1, result: null };
  for (const m of line.text.matchAll(/\S+/g)) line.toks.push({ t: m[0], at: m.index });
  const ctx = { line, short: false, rec: { notes: [] }, signal: null, scene: { n: 0 } };
  await w._waitWord({ word: "five" }, ctx);
  const reached = clock.now();
  ok(reached >= 0.3 + 4 * 0.5 - 0.05 && reached < 0.3 + 4 * 0.5 + 1.2, `${label}: word 5 reached at its estimate (${reached.toFixed(2)} s)`);
  ok(await w._waitWord({ word: "seven", ifWord: true }, ctx) === false, `${label}: ifWord skips a word the line does not have`);
}

const { snapshot: syn } = await H.syntheticSnapshot({ now: null });
await suite(syn, "synthetic");
const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log(`engine.test: ${n} checks passed on invented data; SKIP fixture (SIM_FIXTURE unset)`); process.exit(0); }
const { snapshot: fx } = await H.fixtureSnapshot(dir);
await suite(fx, "fixture");
console.log(`engine.test: PASS ${n} checks (invented data and fixture)`);
