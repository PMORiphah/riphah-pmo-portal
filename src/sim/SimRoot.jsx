// PMO Simulation: the root of the simulation tab (live portal data). Owner: B3b. Spec: contract §H.6.
//
// src/sim/index.js renders it once the snapshot has been validated, the synthetic backend and the
// PMO's session are in place and the narration has been generated:
//   <SimRoot snapshot narration backend onExit onRefresh/>   (key = snapshot.fingerprint)
// It mounts the real App exactly as src/main.jsx does, behind the Begin screen, and adds the
// director layer on top: the spotlight, the presenter card and the caption dock with the assistant,
// the pointer shield, the controls, the closing card and the badge. The App is never changed: the
// director reads its data-* hooks and clicks, types and hovers like a person (director/engine.js),
// within the action allow-list (director/guard.js).
//
// Before Start: isolation checks, the snapshot's fingerprint, the dashboard drawn with the
// snapshot's own figures, then the silent rehearsal (live/preflight.js), a reset of the App, and the
// photos decoded. The Begin screen shows the read time, the rehearsal and the projected run time;
// Start needs every check, fresh data and (voice on) a Test voice. Refresh data asks the still-open
// portal tab for a new snapshot (Begin screen or closing card only); index.js then remounts this
// component with the new data and the rehearsal runs again.
//
// Data exists here only in memory, from the hand-over; nothing in this file names a person, a
// project, a campus or a figure.
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunClock, sleepRun, tick } from "./director/clock.js";
import { Director, LIMIT } from "./director/engine.js";
import * as guard from "./director/guard.js";
import { Spotlight } from "./director/spotlight.js";
import { Narrator, loadVoices, eligibleVoices } from "./director/speech.js";
import { settled, isNavActive, hasText, appRoot } from "./director/dom.js";
import { BeginScreen } from "./director/BeginScreen.jsx";
import { ClosingCard } from "./director/ClosingCard.jsx";
import { Dock, ConfirmExit } from "./director/Dock.jsx";
import { Badge, SpotLayer, CaptionDock, Shield } from "./director/Overlay.jsx";
import { PresenterCard } from "./director/PresenterCard.jsx";
import { useDirectorStyles } from "./director/look.js";
import { buildScenes, HELPERS } from "./scenes.js";
import { rehearse, projectRun, projectGoverned, CRITICAL_TEXT } from "./live/preflight.js";
import { freshness } from "./live/validate.js";
import { fingerprintOf } from "./live/canon.js";
import { fmtM } from "./live/format.js";

const App = lazy(() => import("../App.jsx"));

// The lazy parts of the App the run visits (the rest is in the main bundle already).
const preloadChunks = () => Promise.all([import("../CampusCompare.jsx"), import("../BoardReport.jsx"), import("../charts.jsx")]);

// Spoken by Test voice: no names, about the length of a line in the run. [new]
const TEST_LINE = "This is the presenter's voice. Each line is timed to finish inside two and a half minutes.";

// Storage the App writes during a run that must not survive a Restart (the first screen is identical).
const UI_KEYS = { session: ["pmo-campus-view"], local: ["pmo_recent_projects"] };
// The presenter's keys (everything else is swallowed while the rehearsal, the run or the closing card is up).
const CONTROL_KEYS = new Set([" ", ".", "b", "B", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "c", "C", "Home", "Escape"]);
// The keys the Begin screen's own controls use (buttons, the voice switch and list, its scrolling).
const BEGIN_KEYS = new Set(["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

// The screens, for the presenter's notes (no data).
const SCREENS = { 0: "Opening", 1: "Capex Dashboard", 2: "Investments", 3: "PDD Status", 4: "Payments Status", 5: "Cashflows",
  6: "Projects", 7: "Documents", 8: "Work breakdown", 9: "Timeline", 10: "Performance", 11: "Risk Register", 12: "Campus Compare",
  13: "Assign PM", 14: "User Management", 15: "Updates", 16: "Past Projects", 17: "Gallery", 18: "Monthly Report", 19: "Team & About",
  20: "Closing" };

const setSimPhase = (phase) => { try { if (window.__PMO_SIM_STATE__) Object.assign(window.__PMO_SIM_STATE__, { phase }); } catch { /* ignore */ } };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

class AppBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("[simulation] the portal could not be drawn:", err); }
  render() {
    if (this.state.err) {
      return (
        <div role="alert" style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0A1A2E", color: "#fff", font: "15px/1.6 Inter, 'Segoe UI', Arial, sans-serif", padding: 24, textAlign: "center" }}>
          The portal could not be drawn in the simulation. Press Restart, or close this tab and press Simulation again.
        </div>
      );
    }
    return this.props.children;
  }
}

function useInterval(fn, ms, on) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, on]);
}

/** Resolves once the dashboard is drawn with the snapshot's own figures (Total CAPEX, project count,
 *  DF Recommended while that card is live), no dialog is open and the App is quiet (300 ms without a
 *  change). Tries for up to 40 s; a dialog over the dashboard is closed with Escape. */
export async function portalReady(plan, alive) {
  const dash = plan?.dashboard || {};
  const capexM = fmtM(dash.capexTotal), capexN = `${dash.capexCount} projects`, dfM = fmtM(dash.dfTotal);
  const t0 = performance.now();
  let detail = "the dashboard did not appear";
  while (performance.now() - t0 < 40000) {
    if (!alive()) return { ok: false, detail: "stopped" };
    const hero = document.querySelector('[data-tour="hero-total"]');
    const card = document.querySelector('[data-kpi="df_recommended"]');
    const figures = !!hero && hasText(hero, capexM) && hasText(hero, capexN) && (!dash.dfLive || (!!card && hasText(card, dfM)));
    if (!(isNavActive("cmd") && figures)) {
      if (hero) detail = "the dashboard does not show the snapshot's Total CAPEX figures";
      await tick(150);
      continue;
    }
    const dialog = appRoot()?.querySelector('[role="dialog"]');
    if (dialog) {
      detail = "a dialog is open over the dashboard";
      try { guard.check("key", null, { scene: "ready", key: "Escape" }); } catch { /* recorded */ }
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await tick(400);
      continue;
    }
    if (await settled({ quiet: 300, timeout: 6000, root: appRoot() })) {
      return { ok: true, detail: `settled in ${((performance.now() - t0) / 1000).toFixed(1)} s` };
    }
    detail = "the dashboard kept changing";
  }
  return { ok: false, detail };
}

/** Decodes every handed-over picture now, 4 at a time, so the Gallery never waits for one, and
 *  checks that each video shows a first frame on this computer (a browser without the video's
 *  codec shows a dark tile). → { total, pics, videos, frames } */
async function decodeMedia(backend, items) {
  let byKey = {};
  try { byKey = backend?.media?.() || {}; } catch { byKey = {}; }
  const mimeOf = new Map((items || []).map((m) => [m.key, String(m.mime || "")]));
  const keys = Object.keys(byKey);
  const isVid = (k) => /^video\//.test(mimeOf.get(k) || "");
  const picKeys = keys.filter((k) => !isVid(k)), vidKeys = keys.filter(isVid);
  let pics = 0, frames = 0, next = 0, nextV = 0;
  const one = (u) => new Promise((res) => {
    const img = new Image();
    let done = false;
    const end = (ok) => { if (done) return; done = true; if (ok) pics++; res(); };
    img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => end(true)); };
    img.onerror = () => end(false);
    setTimeout(() => end(false), 12000);
    img.src = u;
  });
  const frame = (u) => new Promise((res) => {
    const v = document.createElement("video");
    let done = false;
    const end = (ok) => {
      if (done) return; done = true; if (ok) frames++;
      try { v.removeAttribute("src"); v.load(); } catch { /* ignore */ }
      res();
    };
    v.muted = true; v.preload = "auto"; v.playsInline = true;
    v.onloadeddata = () => end(v.readyState >= 2 && v.videoWidth > 0);
    v.onerror = () => end(false);
    setTimeout(() => end(false), 8000);
    v.src = u;
  });
  await Promise.all([
    ...Array.from({ length: 4 }, async () => { while (next < picKeys.length) await one(byKey[picKeys[next++]]); }),
    (async () => { while (nextV < vidKeys.length) await frame(byKey[vidKeys[nextV++]]); })(),
  ]);
  return { total: keys.length, pics, videos: vidKeys.length, frames };
}

export default function SimRoot({ snapshot, narration, backend, onExit, onRefresh }) {
  useDirectorStyles();
  const plan = snapshot.plan;
  const hhmm = plan.asOf?.hhmm || "";
  // While this page holds the data, a reload (F5, a clicker's slideshow key, a reload started by
  // code) is refused: it would lose it (public/sim-boot.js).
  useEffect(() => {
    const g = window.__PMO_SIM__?.guard;
    try { g?.holdReload?.(true); } catch { /* ignore */ }
    return () => { try { g?.holdReload?.(false); } catch { /* ignore */ } };
  }, []);

  // One director for the run and one for the silent rehearsal, for the life of this snapshot.
  const core = useRef(null);
  if (!core.current) {
    const lines = narration.lines;
    const meta = {
      plan, asOf: plan.asOf, code: snapshot.code,
      chapters: narration.chapters.map((c) => ({ ...c, scenes: [...c.scenes] })),
      scenes: narration.scenes.map((s) => ({ n: s.n, start: s.start })),
      tables: { campuses: snapshot.tables?.campuses || [], user_profiles: snapshot.tables?.user_profiles || [] },
      say: snapshot.overrides?.say || {},
    };
    const scenes = buildScenes({ plan, lines, meta });
    const clock = new RunClock();
    const narrator = new Narrator({ enabled: true, sleep: (s, signal) => sleepRun(clock, s, signal) });
    const spotlight = new Spotlight();
    const director = new Director({ backend, lines, meta, scenes, narrator, spotlight, clock, mode: "run", guard, helpers: HELPERS });
    const rClock = new RunClock();
    const silent = new Narrator({ enabled: false, synth: null, sleep: (s, signal) => sleepRun(rClock, s, signal) });
    const rehearsal = new Director({ backend, lines, meta, scenes, narrator: silent, spotlight: new Spotlight(), clock: rClock,
      mode: "rehearsal", guard, helpers: HELPERS });
    core.current = { clock, narrator, spotlight, director, rehearsal, scenes, lines, meta };
    try { window.__PMO_SIM_DIRECTOR__ = director; } catch { /* tests only */ }
  }
  const { narrator, spotlight, director, rehearsal, scenes, lines, meta } = core.current;

  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    try { director.stop(); } catch { /* ignore */ }
    try { narrator.cancel(); } catch { /* ignore */ }
  }, [director, narrator]);

  const [st, setSt] = useState(director.state);
  useEffect(() => director.subscribe(setSt), [director]);
  const [clockSec, setClockSec] = useState(0);
  useInterval(() => setClockSec(director.clock.now()), 200, st.phase === "running");
  const [appKey, setAppKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 15000, true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [closingNotice, setClosingNotice] = useState(null);

  // ── preparation: isolation, fingerprint, dashboard, rehearsal, reset, photos ──────────────────
  const [prep, setPrep] = useState({ stage: "portal", progress: null, report: null, decoded: null });
  const [appReady, setAppReady] = useState(null);       // the dashboard after the latest (re)mount
  const [fp, setFp] = useState(null);                    // { ok, detail }
  const isolation = useMemo(() => {
    const sim = window.__PMO_SIM__;
    const ok = !!(sim && sim.ok) && (sim.checks || []).every((c) => c.ok);
    return { ok, detail: ok ? `${(sim.checks || []).length} checks passed` : "a check failed" };
  }, []);
  const phase = prep.stage !== "done" ? "rehearsing" : st.phase;
  useEffect(() => { setSimPhase(phase); }, [phase]);

  const remount = useCallback(async (alive) => {
    const old = document.querySelector('[data-tour="hero-total"]');
    try { backend?.reset?.(); } catch { /* ignore */ }
    try { UI_KEYS.session.forEach((k) => sessionStorage.removeItem(k)); UI_KEYS.local.forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    setAppKey((k) => k + 1);
    const t0 = performance.now();
    while (alive() && old && old.isConnected && performance.now() - t0 < 5000) await tick(40);
    return portalReady(plan, alive);
  }, [backend, plan]);

  useEffect(() => {
    let alive = true;
    const isAlive = () => alive && mounted.current;
    const ac = new AbortController();
    fingerprintOf(snapshot).then(
      (f) => isAlive() && setFp(f.fingerprint === snapshot.fingerprint ? { ok: true } : { ok: false, detail: "the data changed after it was checked" }),
      () => isAlive() && setFp({ ok: false, detail: "it could not be computed" }));
    (async () => {
      try { await preloadChunks(); } catch { /* a page that fails to load fails its scene in the rehearsal */ }
      if (!isAlive()) return;
      setPrep((p) => ({ ...p, stage: "rehearsal" }));
      const report = await rehearse({
        director: rehearsal, scenes, lines, signal: ac.signal,
        waitApp: () => portalReady(plan, isAlive),
        resetApp: async () => { const r = await remount(isAlive); if (isAlive()) setAppReady(r); return r; },
        decode: () => decodeMedia(backend, snapshot.media),
        onProgress: (p) => isAlive() && setPrep((x) => ({ ...x, progress: p, stage: p.phase === "scene" ? "rehearsal" : p.phase })),
      });
      if (!isAlive()) return;
      // Chapter starts and planned scene starts from the rehearsal's projection (135 wpm).
      const p = projectRun(lines, scenes, 135, report.waits);
      meta.scenes = p.scenes.map((s) => ({ n: s.n, start: s.start }));
      for (const c of meta.chapters) c.start = (p.chapters.find((x) => x.n === c.n) || {}).start ?? c.start;
      setPrep({ stage: "done", progress: null, report, decoded: report.decoded });
    })().catch((e) => {
      console.error("[simulation] the rehearsal stopped:", e);
      if (isAlive()) setPrep({ stage: "done", progress: null, report: { ok: false, critical: { ok: false, reason: CRITICAL_TEXT, detail: String(e?.message || e) }, scenes: [], waits: {} }, decoded: null });
    });
    return () => { alive = false; ac.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── voice ─────────────────────────────────────────────────────────────────────────────────────
  const [voices, setVoices] = useState({ loading: true, list: [] });
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceName, setVoiceName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [voiceProj, setVoiceProj] = useState(null);
  useEffect(() => {
    let alive = true;
    const take = (list) => {
      if (!alive) return;
      setVoices({ loading: false, list });
      if (list.length && !narrator.voice) { narrator.setVoice(list[0]); setVoiceName(list[0].name); }
    };
    loadVoices(3000).then(take);
    const synth = window.speechSynthesis;
    const again = () => take(eligibleVoices());
    try { synth?.addEventListener?.("voiceschanged", again); } catch { /* ignore */ }
    return () => { alive = false; try { synth?.removeEventListener?.("voiceschanged", again); } catch { /* ignore */ } };
  }, [narrator]);
  narrator.enabled = voiceOn && voices.list.length > 0;
  const chooseVoice = (name) => {
    const v = voices.list.find((x) => x.name === name);
    if (v) { narrator.setVoice(v); setVoiceName(v.name); setTestResult(null); setVoiceProj(null); }
  };
  const reproject = useCallback((wpm) => {
    const waits = prep.report?.waits || {};
    const p = projectRun(lines, scenes, wpm, waits);
    meta.scenes = p.scenes.map((s) => ({ n: s.n, start: s.start }));
    for (const c of meta.chapters) c.start = (p.chapters.find((x) => x.n === c.n) || {}).start ?? c.start;
    return p;
  }, [prep.report, lines, scenes, meta]);
  const testVoice = async () => {
    if (!narrator.voiceOn || testing) return;
    setTesting(true);
    setTestResult(null);
    narrator.natural = null;
    narrator.rate = 1;
    const r = await narrator.speak(TEST_LINE);
    if (!mounted.current) return;
    const wpm = r.ms > 300 ? Math.round(r.words / (r.ms / 60000)) : null;
    setTestResult({ name: `${narrator.voice.name} (${narrator.voice.lang})`, wpm: wpm ?? 0 });
    const run = Math.round(narrator.wpm);
    if (run >= 60) {
      reproject(run);
      // As the run will play: the deadline governor's short lines included.
      const g = projectGoverned(lines, scenes, run, prep.report?.waits || {});
      setVoiceProj({ wpm: run, total: g.total, short: g.short.length });
    }
    setTesting(false);
  };
  useEffect(() => { if (!voiceOn) { reproject(135); setVoiceProj(null); } }, [voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the App behind the layers: inert outside the rehearsal and the run ────────────────────────
  const running = st.phase === "running";
  useEffect(() => {
    document.body.classList.toggle("pmo-touring", running);
    document.body.classList.toggle("pmo-sim-run", running || st.phase === "closing");
    return () => { document.body.classList.remove("pmo-touring", "pmo-sim-run"); };
  }, [running, st.phase]);
  const appWrap = useRef(null);
  useEffect(() => {
    const el = appWrap.current;
    if (!el) return;
    if (phase === "running" || phase === "rehearsing") el.removeAttribute("inert"); else el.setAttribute("inert", "");
  }, [phase, appKey]);

  // ── freshness and Start ───────────────────────────────────────────────────────────────────────
  const fresh = freshness(snapshot.takenAt, now);
  const report = prep.report;
  const voiceNeedsTest = narrator.voiceOn && !testResult;
  const rules = [
    [!isolation.ok, "The simulation's isolation checks failed; close this tab and press Simulation again."],
    [fp && !fp.ok, "The snapshot check failed; press Refresh data."],
    [prep.stage !== "done", "Rehearsing the run silently…"],
    [!!report && !report.critical.ok, report?.critical?.reason || CRITICAL_TEXT],
    [!fp, "Checking the snapshot…"],
    [!appReady || !appReady.ok, appReady && !appReady.ok ? `The dashboard is not ready (${appReady.detail}).` : "Getting the dashboard ready…"],
    [fresh.state === "refused", fresh.text],
    [voices.loading, "Looking for an on-device voice…"],
    [voiceNeedsTest, "Press Test voice first: it measures the voice's speed."],
    [refreshing, "Reading the portal again…"],
  ];
  const blocked = rules.find(([bad]) => bad);
  const startable = !blocked && st.phase === "begin";

  const startRun = () => {
    if (!startable) return;
    if (freshness(snapshot.takenAt, Date.now()).state === "refused") { setNow(Date.now()); return; }
    // The press is the browser's gesture for speech: a silent line with the chosen on-device voice.
    if (narrator.voiceOn) {
      try { const u = new SpeechSynthesisUtterance(" "); u.voice = narrator.voice; u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
    }
    setClosingNotice(null);
    setLeaving(true);
    director.start();
    setTimeout(() => { if (mounted.current) setLeaving(false); }, 650);
  };

  const restart = useCallback(() => {
    director.stop();
    setMenu(false);
    setConfirm(false);
    pausedForConfirm.current = false;
    setLeaving(false);
    setClosingNotice(null);
    setClockSec(0);
    setAppReady(null);
    setNow(Date.now());
    let alive = true;
    remount(() => alive && mounted.current).then((r) => { if (mounted.current) setAppReady(r); });
    return () => { alive = false; };
  }, [director, remount]);

  const doRefresh = useCallback(async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    setRefreshError(null);
    let r;
    try { r = await onRefresh(); } catch (e) { r = { ok: false, error: String(e?.message || e) }; }
    // On success index.js has rendered a new SimRoot with the new snapshot: this one is gone.
    if (!mounted.current) return;
    setRefreshing(false);
    if (!r || !r.ok) {
      const msg = (r && r.error) || "The portal tab is closed or signed out. Close this tab and press Simulation in the portal again.";
      setRefreshError(msg);
      if (st.phase === "closing") setClosingNotice(msg);
    }
  }, [refreshing, onRefresh, st.phase]);

  const exit = useCallback(() => {
    director.stop();
    setConfirm(false);
    document.body.classList.remove("pmo-touring", "pmo-sim-run");
    if (onExit) onExit(); else { try { window.close(); } catch { /* ignore */ } }
  }, [director, onExit]);

  const pickChapter = useCallback((n) => {
    if (st.phase === "closing") {
      const f = freshness(snapshot.takenAt, Date.now());
      if (f.state === "refused") { setClosingNotice(f.text); setNow(Date.now()); return; }
    }
    setClosingNotice(null);
    director.chapter(n);
  }, [director, st.phase, snapshot.takenAt]);

  // Asking to exit holds the run (voice and clock) until the presenter answers; "Keep presenting"
  // resumes it only if the confirm was what paused it.
  const pausedForConfirm = useRef(false);
  const askExit = useCallback(() => {
    setMenu(false);
    if (director.state.phase === "running" && !director.paused) { director.pause(); pausedForConfirm.current = true; }
    setConfirm(true);
  }, [director]);
  const cancelExit = useCallback(() => {
    setConfirm(false);
    if (pausedForConfirm.current) { pausedForConfirm.current = false; director.resume(); }
  }, [director]);

  // ── keys: the presenter's controls; everything else never reaches the App ─────────────────────
  useEffect(() => {
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };
    const onKey = (e) => {
      if (!e.isTrusted) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (k === "p" || k === "P" || k === "k" || k === "K")) { swallow(e); return; }
      // In the director's own controls (Begin screen, dock, closing card, exit confirm), Tab and Enter work as usual.
      const inUi = !!(document.activeElement && document.activeElement.closest?.("[data-sim-ui]"));
      // The Begin screen's own controls work as usual (Tab, Enter, Space, arrows in the voice list);
      // any other key, or a key pressed outside them, is swallowed. The screen also stops its keys
      // before they reach the App's document listeners (BeginScreen.jsx).
      if (phase === "begin") {
        if (!(k === "Tab" || (inUi && !mod && !e.altKey && BEGIN_KEYS.has(k)))) swallow(e);
        return;
      }
      if (phase === "rehearsing") { swallow(e); return; }
      if (!CONTROL_KEYS.has(k) || mod || e.altKey) {
        if (inUi && (k === "Tab" || k === "Enter") && !mod && !e.altKey) return;
        swallow(e);
        return;
      }
      if (confirm) {
        // Esc again, or Space (a clicker's usual key), keeps presenting; Exit needs Tab and Enter, or a click.
        if (k === "Escape" || k === " ") { swallow(e); cancelExit(); }
        else if (!inUi) swallow(e);
        return;
      }
      let handled = true;
      if (phase === "running") {
        if (k === " " || k === "." || k === "b" || k === "B") director.togglePause();
        else if (k === "PageDown" || k === "ArrowRight") director.next();
        else if (k === "PageUp" || k === "ArrowLeft") director.prev();
        else if (k === "c" || k === "C") setMenu((m) => !m);
        else if (k === "Home") restart();
        else if (k === "Escape") { if (menu) setMenu(false); else askExit(); }
        else handled = false;
      } else if (phase === "closing") {
        if (k === "Home") restart();
        else if (k === "Escape") askExit();
        else handled = true;                            // Space never presses a card button (Enter does, after Tab)
      } else handled = false;
      if (handled) swallow(e);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [director, phase, confirm, menu, restart, askExit, cancelExit]);

  // ── what the Begin screen shows ───────────────────────────────────────────────────────────────
  const begin = useMemo(() => {
    const rep = prep.report;
    const sceneList = scenes.filter((s) => !s.closing);
    const ready = rep ? rep.scenes.filter((s) => s.n !== 20 && s.ok).length : 0;
    const progress = prep.progress;
    const checks = [
      { key: "isolation", label: "Isolation self-tests", status: isolation.ok ? "ok" : "fail", detail: isolation.detail },
      { key: "snapshot", label: "Snapshot fingerprint", status: !fp ? "wait" : fp.ok ? "ok" : "fail", detail: fp && !fp.ok ? fp.detail : snapshot.code },
      { key: "rehearsal", label: "Silent rehearsal",
        status: prep.stage !== "done" ? "wait" : rep && !rep.critical.ok ? "fail" : rep && ready < sceneList.length ? "warn" : "ok",
        detail: prep.stage === "done" ? `${ready} of ${sceneList.length} scenes ready`
          : progress?.phase === "reset" ? "resetting the portal" : progress?.phase === "decode" ? "decoding the photos"
            : progress ? `scene ${progress.done + 1} of ${progress.total}` : "starting" },
      { key: "portal", label: "Capex Dashboard drawn with the snapshot's figures",
        status: !appReady ? "wait" : appReady.ok ? "ok" : "fail", detail: appReady?.detail || null },
      { key: "media", label: "Gallery pictures decoded", status: prep.stage !== "done" ? "wait" : "ok",
        detail: prep.decoded ? (prep.decoded.total - (prep.decoded.videos || 0) > 0 ? plural(prep.decoded.pics, "picture")
          : prep.decoded.total ? "no pictures" : "none handed over") : null },
      ...(prep.decoded && prep.decoded.videos > 0 ? [{ key: "videos", label: "Gallery videos show a first frame on this computer",
        status: prep.decoded.frames === prep.decoded.videos ? "ok" : "warn",
        detail: `${prep.decoded.frames} of ${prep.decoded.videos}${prep.decoded.frames < prep.decoded.videos ? " (the others show as dark tiles)" : ""}` }] : []),
      { key: "voice", label: "Voice",
        status: voices.loading ? "wait" : voiceNeedsTest ? "warn" : "ok",
        detail: !voices.list.length ? "captions only (no on-device voice)" : !voiceOn ? "off · captions only" : testResult ? `${testResult.wpm} words a minute` : "press Test voice" },
    ];
    const notes = [];
    if (rep && !rep.critical.ok) notes.push({ tone: "bad", text: `${rep.critical.reason}${rep.critical.detail ? ` (${rep.critical.detail})` : ""}` });
    for (const s of rep?.scenes || []) {
      if (s.skipped) notes.push({ tone: "warn", text: `Scene ${s.n} ${SCREENS[s.n] || ""} is left out: ${s.reason || "not ready"}.` });
      for (const t of s.notes || []) if (/ line is used$/.test(t)) notes.push({ tone: "info", text: `Scene ${s.n} ${SCREENS[s.n] || ""}: ${t}.` });
    }
    const notices = [];
    if (snapshot.leftOut > 0) notices.push({ tone: "info", text: `${plural(snapshot.leftOut, "item")} left out at the PMO's choice.` });
    if (snapshot.failed > 0) notices.push({ tone: "warn", text: `${plural(snapshot.failed, "item")} could not be loaded.` });
    for (const t of plan.flags?.typedTexts || []) {
      notices.push({ tone: "warn", text: `A typed card text may be out of date (fix it with the card pencil): “${t.text}”` });
    }
    if (plan.report?.stale) {
      const tiles = (plan.report.staleTiles || []).map((d) => `${d.tile.toLowerCase()} ${d.report} vs ${d.live}`).join("; ");
      const draft = plan.report.kind !== "published";
      notices.push({ tone: "warn", text: `The ${plan.report.month || ""} ${draft ? "draft" : "report"}'s figures are as at ${plan.report.asAtText} and differ from today's (${tiles}), `
        + (draft ? "so its tiles stay unlit. To light them, press Refresh figures on the draft in the portal, then Refresh data here."
          : "so its tiles stay unlit (a published report keeps its figures).") });
    }
    for (const t of narration.notes || []) notices.push({ tone: "info", text: t });
    const captions = [];
    for (const sc of scenes) {
      for (const id of sc.lines || []) {
        const L = lines.find((x) => x.id === id);
        if (!L) continue;
        const c = L.candidates[L.use ?? 0];
        const text = L.compact && c.short ? c.short.caption : c.caption;
        captions.push({ id, caption: text, left: !!L.skip || !!sc.skip, note: L.compact ? "short line" : c.name === "bare" ? "line without figures" : null });
      }
    }
    return {
      hhmm, ageMin: fresh.ageMin, code: snapshot.code, fresh,
      chapters: meta.chapters,
      projected: rep?.projected ? { ...rep.projected, voice: voiceProj } : null,
      checks, rehearsal: { notes }, notices, captions,
      startable, startReason: blocked ? blocked[1] : "", startReasonTone: blocked && /failed|could not|not ready|old|refused|day changed|after this/.test(blocked[1]) ? "bad" : "dim",
      refreshing, refreshError, canRefresh: !!onRefresh && phase !== "running",
    };
  }, [prep, fp, isolation, appReady, voices, voiceOn, testResult, voiceProj, fresh.state, fresh.ageMin, fresh.text, startable, blocked, refreshing, refreshError, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const badge = `Live portal data as of ${hhmm} PKT · read-only · nothing is sent`;
  const voice = {
    available: voices.list.length > 0, loading: voices.loading, list: voices.list, on: voiceOn, setOn: setVoiceOn,
    name: voiceName, choose: chooseVoice, test: testVoice, testing, result: testResult,
  };

  return (
    <>
      {phase !== "rehearsing" && <SpotLayer spotlight={spotlight} />}
      <Shield on={running} />
      <PresenterCard state={st} hhmm={hhmm} fyLabel={plan.asOf?.fyLabel} />
      <CaptionDock state={st} voiceOn={narrator.voiceOn} progress={clockSec / LIMIT} />
      <Dock state={st} clock={clockSec} chapters={meta.chapters} menu={menu} setMenu={setMenu} note={st.note}
        onPrev={() => director.prev()} onPause={() => director.togglePause()} onNext={() => director.next()}
        onChapter={(n) => director.chapter(n)} onRestart={restart} onExit={askExit} />

      {(phase === "rehearsing" || st.phase === "begin" || leaving) && (
        <BeginScreen leaving={leaving} data={begin} voice={voice} onStart={startRun} onRefresh={doRefresh} />
      )}
      {st.phase === "closing" && (
        <ClosingCard caption={st.caption} hhmm={hhmm} chapters={meta.chapters} report={director.report} notice={closingNotice}
          refreshing={refreshing} onChapter={pickChapter} onRestart={restart} onRefresh={doRefresh} onExit={askExit} />
      )}
      {confirm && <ConfirmExit onCancel={cancelExit} onExit={exit} />}
      <Badge text={badge} />

      {/* The App comes after the director's layers in the document (they stack above it by z-index):
          the assistant's SVG gradients are found by id in document order, so the visible avatars here
          must come before the portal's own launcher, which is hidden in the simulation (look.js). */}
      <div ref={appWrap} data-sim-app="" style={{ display: "contents" }}>
        <AppBoundary key={appKey}>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </AppBoundary>
      </div>
    </>
  );
}
