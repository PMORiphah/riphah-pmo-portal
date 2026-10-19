// PMO Simulation (live data): the silent rehearsal before Start. PUBLIC, no data. Owner: B3b.
// Spec: contract §H.5 (arch §5.7).
//
// Behind the Begin screen, after the snapshot is installed, the App is mounted and the dashboard has
// passed its readiness gate, every scene is played once with no voice, no holds and immediate word
// anchors (a Director in mode "rehearsal"), with real waits for the screens. At each line's end (or
// where a scene asks) the figures the line says are looked for on screen; a line whose figures are
// not there moves to its next candidate whose figures are, down to its figure-free line. A scene
// whose actions do not complete twice, or that meets a refused action, is left out and listed on
// the Begin screen. If the opening or the dashboard scene fails, Start stays disabled.
// Then the App is reset (backend reset, remount, readiness again), the photos are decoded, and the
// run is projected with the chosen lines and the measured action times (timing.js).
import { project, sceneSeconds, GOVERN_AT, CUT_AT } from "./timing.js";

const r3 = (x) => Math.round(x * 1000) / 1000;
export const CRITICAL_TEXT = "The dashboard figures could not be shown; nothing will be presented.";

/** The scenes in the shape timing.project reads ({ n, lines }). */
export const timingScenes = (scenes) => (scenes || []).map((s) => ({ n: s.n, lines: s.lines || [] }));

/**
 * Projected run with the lines in use and, per scene, the time the actions needed beyond the
 * scene's own lines and holds (measured in the rehearsal): { total, scenes, chapters }.
 */
export function projectRun(lines, scenes, wpm, waits = {}) {
  return project(lines, timingScenes(scenes), wpm, { waits });
}

/**
 * The run as the engine's deadline governor plays it at `wpm` (engine.js _govern: a scene uses its
 * short lines when the time so far plus the rest at full length passes GOVERN_AT):
 * { total, short: [scene n], cut }. Used for "with this voice" on the Begin screen.
 */
export function projectGoverned(lines, scenes, wpm, waits = {}) {
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const list = timingScenes(scenes).sort((a, b) => a.n - b.n);
  const ls = (sc) => sc.lines.map((id) => byId.get(id)).filter(Boolean);
  const full = list.map((sc) => sceneSeconds(ls(sc), wpm, { waits: waits[sc.n] || 0 }));
  let t = 0;
  const short = [];
  list.forEach((sc, i) => {
    const s = t + full.slice(i).reduce((a, b) => a + b, 0) > GOVERN_AT;
    if (s && full[i] > 0) short.push(sc.n);
    t += s ? sceneSeconds(ls(sc), wpm, { short: true, waits: waits[sc.n] || 0 }) : full[i];
  });
  return { total: r3(Math.min(t, CUT_AT)), short, cut: t > CUT_AT };
}

/**
 * rehearse({ director, scenes, lines, waitApp, resetApp, decode, onProgress, signal }) →
 *   { ok, critical: { ok, reason }, scenes: [{ n, ok, skipped, reason, use, failed, waits, wallMs, notes }],
 *     projected: { at135, at150 }, chapters: [{ n, start }], waits: { [n]: s }, ms }
 * Also kept on window.__PMO_SIM_PREFLIGHT__. Scenes it leaves out get `skip` and `skipReason`, and
 * their lines `skip`, so the run and the projection pass over them.
 */
export async function rehearse({ director, scenes, lines, waitApp, resetApp, decode, onProgress, signal } = {}) {
  const t0 = performance.now();
  const out = { ok: false, critical: { ok: true, reason: null }, scenes: [], projected: null, chapters: [], waits: {}, ms: 0, decoded: null };
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const publish = () => { try { window.__PMO_SIM_PREFLIGHT__ = out; } catch { /* ignore */ } };
  const aborted = () => !!(signal && signal.aborted);
  publish();

  const ready = waitApp ? await waitApp() : { ok: true };
  if (aborted()) return out;
  if (ready && ready.ok === false) {
    out.critical = { ok: false, reason: CRITICAL_TEXT, detail: ready.detail || "the dashboard was not ready" };
    out.ms = Math.round(performance.now() - t0);
    publish();
    return out;
  }

  director.beginRehearsal();
  const total = scenes.filter((s) => !s.closing).length;
  let done = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (aborted()) break;
    const sc = scenes[i];
    if (sc.closing) {
      const use = {};
      for (const id of sc.lines || []) { const L = byId.get(id); if (L) use[id] = L.candidates?.[L.use]?.name ?? null; }
      out.scenes.push({ n: sc.n, ok: true, skipped: false, reason: null, use, failed: [], waits: [], wallMs: 0, notes: [] });
      continue;
    }
    onProgress?.({ phase: "scene", n: sc.n, done, total });
    if (sc.skip) {
      out.scenes.push({ n: sc.n, ok: false, skipped: true, reason: sc.skipReason || "left out", use: {}, failed: [], waits: [], wallMs: 0, notes: [] });
      done++;
      continue;
    }
    let rec;
    try {
      rec = await director.rehearseScene(i, signal);
    } catch (e) {
      if (aborted()) break;
      rec = { n: sc.n, skipped: true, reason: `error: ${String(e && e.message || e).slice(0, 120)}`, use: {}, failed: [], waits: [], notes: [], wallMs: 0 };
    }
    const item = {
      n: sc.n, ok: !rec.skipped, skipped: !!rec.skipped, reason: rec.reason || null, use: rec.use || {},
      failed: rec.failed || [], waits: rec.waits || [], wallMs: rec.wallMs || 0, notes: rec.notes || [],
      figureChecks: rec.figureChecks || [], blocked: rec.blocked || null,
    };
    // The time the actions needed (without the figure checks), beyond the scene's own planned length.
    const floor = Math.max(0, (item.wallMs - (rec.checkMs || 0)) / 1000);
    const planned = sceneSeconds((sc.lines || []).map((id) => byId.get(id)).filter(Boolean), 135);
    if (!item.skipped && floor > planned) out.waits[sc.n] = r3(floor - planned);
    out.scenes.push(item);
    if (item.skipped) {
      if (sc.critical) out.critical = { ok: false, reason: CRITICAL_TEXT, detail: `scene ${sc.n}: ${item.reason}` };
      sc.skip = true;
      sc.skipReason = item.reason;
      for (const id of sc.lines || []) { const L = byId.get(id); if (L) L.skip = true; }
    }
    done++;
    onProgress?.({ phase: "scene", n: sc.n, done, total });
    publish();
  }
  director.endRehearsal();
  if (aborted()) { out.ms = Math.round(performance.now() - t0); publish(); return out; }

  onProgress?.({ phase: "reset", done, total });
  const again = resetApp ? await resetApp() : { ok: true };
  if (again && again.ok === false) {
    out.critical = { ok: false, reason: CRITICAL_TEXT, detail: again.detail || "the dashboard did not come back after the rehearsal" };
  }
  if (decode) {
    onProgress?.({ phase: "decode", done, total });
    try { out.decoded = await decode(); } catch { out.decoded = null; }
  }

  const p135 = projectRun(lines, scenes, 135, out.waits);
  const p150 = projectRun(lines, scenes, 150, out.waits);
  out.projected = { at135: r3(p135.total), at150: r3(p150.total) };
  out.chapters = p135.chapters.map((c) => ({ n: c.n, start: r3(c.start) }));
  out.ok = out.critical.ok && out.scenes.every((s) => s.ok || s.skipped);
  out.ms = Math.round(performance.now() - t0);
  publish();
  return out;
}
