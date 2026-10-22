// PMO Simulation (live data): the timing model and the compaction rule. PUBLIC, no data.
// Owner: B3a. Spec: contract §F.5.
//
// A line takes START_DELAY + words × 60 / wpm, and never less than its minimum hold (70 % of it when
// the short line is used, as the director does). A scene adds GAP between its lines, its extra time
// (scene 13: Cancel after the line) and any waits the rehearsal measured. Scenes follow one another
// with no gap. If the projection at 135 wpm is over COMPACT_AT, the lines in COMPACT_ORDER switch to
// their short form, one at a time, until it fits.
// COMPACT_AT was 141 until 22 Oct 2026; 143 since the dashboard line says "N PCDs received" (PMO),
// so that clause does not cost scene 5 its peak month on today's data (still 3 s under GOVERN_AT).
import { CHAPTERS } from "./lines.js";

export const START_DELAY = 0.3, GAP = 0.06, LIMIT = 150, GOVERN_AT = 146, CUT_AT = 149.5, COMPACT_AT = 143;
export const SHORT_HOLD = 0.7;
export const COMPACT_ORDER = Object.freeze(["s05", "s09", "s16", "s10"]);

/** Seconds a line of `words` words takes at `wpm`. */
export function lineSeconds(words, wpm) {
  return START_DELAY + (Number(words) || 0) * 60 / wpm;
}

const candOf = (L) => (Array.isArray(L.candidates) ? L.candidates[L.use ?? 0] : L);

/** One line's share of its scene: its spoken time or its hold, whichever is longer. A line with
 *  `compact: true`, or any line when `short`, uses its short text and 70 % of its hold. */
export function lineDuration(L, wpm, { short = false } = {}) {
  const c = candOf(L) || {};
  const useShort = short || !!L.compact;
  const words = useShort ? (c.short?.words ?? c.words) : c.words;
  const hold = (c.minHold ?? L.minHold ?? 0) * (useShort ? SHORT_HOLD : 1);
  return Math.max(lineSeconds(words, wpm), hold);
}

/** Σ max(line seconds, line hold) + GAP × (n − 1) + the lines' extra time + waits. Skipped lines count 0. */
export function sceneSeconds(sceneLines, wpm, { short = false, waits = 0 } = {}) {
  const live = (sceneLines || []).filter((l) => l && !l.skip);
  if (!live.length) return 0;
  return live.reduce((s, l) => s + lineDuration(l, wpm, { short }), 0)
    + GAP * (live.length - 1)
    + live.reduce((s, l) => s + (Number(l.extra) || 0), 0)
    + (Number(waits) || 0);
}

function scenesFrom(lines) {
  const by = new Map();
  for (const l of lines) { if (!by.has(l.scene)) by.set(l.scene, []); by.get(l.scene).push(l.id); }
  return [...by.keys()].sort((a, b) => a - b).map((n) => ({ n, lines: by.get(n) }));
}

/**
 * Planned starts at `wpm`: { total, scenes:[{n,start,dur}], chapters:[{n,start}] }.
 * `waits` = { [scene n]: seconds } measured by the rehearsal.
 */
export function project(lines, scenes, wpm, { waits = {} } = {}) {
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const list = scenes && scenes.length ? scenes : scenesFrom(lines || []);
  let t = 0;
  const out = [];
  for (const sc of [...list].sort((a, b) => a.n - b.n)) {
    const dur = sceneSeconds((sc.lines || []).map((id) => byId.get(id)).filter(Boolean), wpm, { waits: waits[sc.n] || 0 });
    out.push({ n: sc.n, start: t, dur });
    t += dur;
  }
  const startOf = (n) => (out.find((s) => s.n === n) || {}).start;
  const chapters = CHAPTERS.map((c) => {
    const first = c.scenes.map(startOf).find((s) => s != null);
    return { n: c.n, start: first ?? t };
  });
  return { total: t, scenes: out, chapters };
}

/** The line ids (in COMPACT_ORDER) to switch to their short form so the 135 wpm projection is
 *  ≤ COMPACT_AT. Does not change `lines`. */
export function compact(lines, scenes, { wpm = 135, waits = {} } = {}) {
  const work = (lines || []).map((l) => ({ id: l.id, scene: l.scene, skip: !!l.skip, extra: l.extra, minHold: l.minHold,
    candidates: l.candidates, use: l.use, words: l.words, short: l.short, compact: !!l.compact }));
  const ids = [];
  for (const id of COMPACT_ORDER) {
    if (project(work, scenes, wpm, { waits }).total <= COMPACT_AT) break;
    const w = work.find((l) => l.id === id);
    if (!w || w.skip || w.compact) continue;
    w.compact = true;
    ids.push(id);
  }
  return ids;
}

/** "2:19" (truncated, as the dock and the chapter buttons print it). */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
