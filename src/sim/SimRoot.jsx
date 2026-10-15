// PMO Simulation: the root of the simulation tab (src/sim/index.js renders it once the cast, the
// synthetic backend and the synthetic PMO session are in place).
//
// It mounts the real App exactly as src/main.jsx does (no providers), behind the Begin screen, and
// adds the director layer on top: the spotlight, the docked caption with the assistant, the pointer
// shield, the controls, the closing card and the badge. The App is never changed: the director reads
// its data-* hooks and clicks, types and hovers like a person (src/sim/director/engine.js).
//
// Props: { backend, narration (resolved lines), meta (resolved SEED.meta), cast, mode, onExit }.
// Real names exist only in `cast`, `narration` and `meta`, in memory; they are rendered as text.
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { RunClock, sleepRun, tick } from "./director/clock.js";
import { Director, LIMIT } from "./director/engine.js";
import { Spotlight } from "./director/spotlight.js";
import { Narrator, loadVoices, eligibleVoices } from "./director/speech.js";
import { settled, isNavActive, hasText, appRoot } from "./director/dom.js";
import { BeginScreen } from "./director/BeginScreen.jsx";
import { ClosingCard } from "./director/ClosingCard.jsx";
import { Dock, ConfirmExit } from "./director/Dock.jsx";
import { Badge, SpotLayer, CaptionDock, Shield } from "./director/Overlay.jsx";
import { useDirectorStyles } from "./director/look.js";
import { buildScenes } from "./scenes.js";
import { castCode } from "./data/cast.js";

const App = lazy(() => import("../App.jsx"));

// The lazy parts of the App the run visits (the rest is in the main bundle already).
const preloadChunks = () => Promise.all([import("../CampusCompare.jsx"), import("../BoardReport.jsx"), import("../charts.jsx")]);

// Spoken by Test voice: no names, about the length of a line in the run.
const TEST_LINE = "This is the simulation's voice. Each line is timed to finish inside two minutes.";

// Storage the App writes during a run that must not survive a Restart (the first screen is identical).
const UI_KEYS = { session: ["pmo-campus-view"], local: ["pmo_recent_projects"] };

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

/** Resolves once the dashboard is drawn, its figures have finished counting, and the App is quiet
 *  (300 ms without a change). Tries for up to 40 s; a dialog over the dashboard is closed with Escape. */
async function portalReady(meta, alive) {
  const df = meta?.expect?.[1]?.dfCard;
  const t0 = performance.now();
  let detail = "the dashboard did not appear";
  while (performance.now() - t0 < 40000) {
    if (!alive()) return { ok: false };
    const card = document.querySelector('[data-kpi="df_recommended"]');
    if (!(isNavActive("cmd") && document.querySelector('[data-tour="hero"]') && card && (!df || hasText(card, df)))) { await tick(150); continue; }
    const dialog = appRoot()?.querySelector('[role="dialog"]');
    if (dialog) {
      detail = "a dialog is open over the dashboard";
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

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Files and prints (PMO decision 15 Oct 2026, plan §5a rule 7): real project-manager names become
// "Project manager (simulation)" in anything printed or saved as PDF (Ctrl+P, the Board report's Save
// as PDF). Campus and PMO-team names stay. The page's text is swapped just before printing and put
// back after; a text node the App redrew meanwhile is left as the App drew it.
export const PRINT_PM = "Project manager (simulation)";
export function pmNamesOf(cast) {
  const clean = (n) => String(n || "").replace(/\s+/g, " ").trim();
  // A short form that is also a word of a campus or PMO-team name (a shared first name) is left out,
  // so a team member or a campus is never half-replaced; the full name still is.
  const words = new Set([...Object.values(cast?.team || {}).map((t) => (t && typeof t === "object" ? t.name : t)),
    ...Object.values(cast?.campuses || {}).map((c) => c?.name)].flatMap((n) => clean(n).toLowerCase().split(" ")));
  const out = new Set();
  for (const p of Object.values(cast?.pms || {})) {
    const full = clean(p?.name), short = clean(p?.short);
    if (full.replace(/[^\p{L}]/gu, "").length >= 2) out.add(full);
    if (short && short.replace(/[^\p{L}]/gu, "").length >= 2 && !(short.indexOf(" ") < 0 && words.has(short.toLowerCase()))) out.add(short);
  }
  return [...out].sort((a, b) => b.length - a.length);
}
export function pmNameRegex(names) {
  if (!names.length) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
}
function usePrintNames(cast, mode) {
  useEffect(() => {
    if (mode !== "cast") return undefined;
    const re = pmNameRegex(pmNamesOf(cast));
    if (!re) return undefined;
    let swapped = [];
    const before = () => {
      if (swapped.length) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = n.nodeValue;
        if (!v || v.length < 2) continue;
        re.lastIndex = 0;
        if (!re.test(v)) continue;
        re.lastIndex = 0;
        const nv = v.replace(re, PRINT_PM);
        swapped.push([n, v, nv]);
        n.nodeValue = nv;
      }
      // Attributes a print can show (an image's alt text, a tooltip title) are left alone: no
      // print stylesheet prints them.
    };
    const after = () => {
      for (const [n, v, nv] of swapped) { if (n.isConnected && n.nodeValue === nv) n.nodeValue = v; }
      swapped = [];
    };
    const mq = window.matchMedia ? window.matchMedia("print") : null;
    const onMq = (e) => { if (e.matches) before(); else after(); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    try { mq?.addEventListener("change", onMq); } catch { /* old engines */ }
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      try { mq?.removeEventListener("change", onMq); } catch { /* ignore */ }
      after();
    };
  }, [cast, mode]);
}

/** Decodes every handed-over picture now, so the Gallery never waits for one. */
async function decodeMedia(backend) {
  let urls = [];
  try { urls = Object.values(backend?.media?.() || {}); } catch { urls = []; }
  let pics = 0;
  await Promise.all(urls.map((u) => new Promise((res) => {
    const img = new Image();
    const done = () => res();
    img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { pics++; done(); }); };
    img.onerror = done;                       // a video: nothing to decode
    setTimeout(done, 12000);
    img.src = u;
  })));
  return { total: urls.length, pics };
}

export default function SimRoot({ backend, narration, meta = {}, cast = null, mode = "cast", onExit }) {
  useDirectorStyles();
  usePrintNames(cast, mode);
  // While this page holds the names and photos, a reload (F5, a clicker's slideshow key, a reload
  // started by code) is refused: it would lose them (public/sim-boot.js).
  useEffect(() => {
    const g = window.__PMO_SIM__?.guard;
    try { g?.holdReload?.(true); } catch { /* ignore */ }
    return () => { try { g?.holdReload?.(false); } catch { /* ignore */ } };
  }, []);
  const lines = Array.isArray(narration) ? narration : (narration?.lines || []);
  const chapters = meta.chapters || narration?.meta?.chapters || [];

  // One director for the life of the tab.
  const core = useRef(null);
  if (!core.current) {
    const clock = new RunClock();
    const narrator = new Narrator({ enabled: true, sleep: (s, signal) => sleepRun(clock, s, signal) });
    const spotlight = new Spotlight();
    const scenes = buildScenes(meta, cast);
    const director = new Director({ backend, lines, meta, scenes, mode, narrator, spotlight, clock });
    // The assistant's starter questions: the simulation's own (the global accepts them once).
    try {
      const s = meta.starters || narration?.meta?.starters;
      if (Array.isArray(s) && window.__PMO_SIM__ && !window.__PMO_SIM__.starters) window.__PMO_SIM__.starters = s;
    } catch { /* the portal keeps its default starters */ }
    let code = null;
    try { code = mode === "cast" && cast ? castCode(cast) : null; } catch { code = null; }
    core.current = { clock, narrator, spotlight, director, scenes, code };
    try { window.__PMO_SIM_DIRECTOR__ = director; } catch { /* tests only */ }
  }
  const { narrator, spotlight, director, code } = core.current;

  const [st, setSt] = useState(director.state);
  useEffect(() => director.subscribe(setSt), [director]);
  const [clockSec, setClockSec] = useState(0);
  useInterval(() => setClockSec(director.clock.now()), 200, st.phase === "running");
  const [appKey, setAppKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // ── voice ─────────────────────────────────────────────────────────────────────────────────────
  const [voices, setVoices] = useState({ loading: true, list: [] });
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceName, setVoiceName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  useEffect(() => {
    let alive = true;
    const take = (list) => {
      if (!alive) return;
      setVoices({ loading: false, list });
      if (list.length && !narrator.voice) { narrator.setVoice(list[0]); setVoiceName(list[0].name); }
    };
    loadVoices(3000).then(take);
    // Some browsers list their voices late.
    const synth = window.speechSynthesis;
    const again = () => take(eligibleVoices());
    try { synth?.addEventListener?.("voiceschanged", again); } catch { /* ignore */ }
    return () => { alive = false; try { synth?.removeEventListener?.("voiceschanged", again); } catch { /* ignore */ } };
  }, [narrator]);
  narrator.enabled = voiceOn && voices.list.length > 0;
  const chooseVoice = (name) => {
    const v = voices.list.find((x) => x.name === name);
    if (v) { narrator.setVoice(v); setVoiceName(v.name); setTestResult(null); }
  };
  const testVoice = async () => {
    if (!narrator.voiceOn || testing) return;
    setTesting(true);
    setTestResult(null);
    narrator.natural = null;
    narrator.rate = 1;
    const r = await narrator.speak(TEST_LINE);
    const wpm = r.ms > 300 ? Math.round(r.words / (r.ms / 60000)) : null;
    setTestResult({ name: `${narrator.voice.name} (${narrator.voice.lang})`, wpm: wpm ?? 0 });
    setTesting(false);
  };

  // ── readiness (again after every Restart, which redraws the App) ──────────────────────────────
  const [checks, setChecks] = useState({});
  const setCheck = useCallback((key, v) => setChecks((c) => ({ ...c, [key]: v })), []);
  const chunksOnce = useRef(null);
  const mediaOnce = useRef(null);
  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    setChecks({});
    const sim = window.__PMO_SIM__;
    const iso = !!(sim && sim.ok) && (sim.checks || []).every((c) => c.ok);
    setCheck("isolation", { status: iso ? "ok" : "fail", detail: iso ? `${(sim.checks || []).length} checks passed` : "a check failed" });
    chunksOnce.current ||= preloadChunks().then(() => true, () => false);
    chunksOnce.current.then((ok) => alive && setCheck("pages", { status: ok ? "ok" : "fail", detail: ok ? null : "a page could not be loaded" }));
    mediaOnce.current ||= decodeMedia(backend);
    mediaOnce.current.then((m) => alive && setCheck("media", { status: "ok",
      detail: m.total ? `${plural(m.pics, "picture")}${m.total > m.pics ? `, ${plural(m.total - m.pics, "video")}` : ""}` : "none handed over" }));
    portalReady(meta, isAlive).then((r) => alive && setCheck("portal", { status: r.ok ? "ok" : "fail", detail: r.detail }));
    return () => { alive = false; };
  }, [appKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceCheck = voices.loading ? { status: "wait" }
    : voices.list.length ? { status: "ok", detail: voiceOn ? (narrator.voice?.name || "") : "off · captions only" }
    : { status: "ok", detail: "captions only (no on-device voice)" };
  const checkList = [
    { key: "isolation", label: "Isolation self-tests", ...(checks.isolation || { status: "wait" }) },
    { key: "portal", label: "Capex Dashboard drawn and settled", ...(checks.portal || { status: "wait" }) },
    { key: "pages", label: "Pages loaded", ...(checks.pages || { status: "wait" }) },
    { key: "media", label: "Gallery pictures decoded", ...(checks.media || { status: "wait" }) },
    { key: "voice", label: "Voice", ...voiceCheck },
  ];
  const ready = ["isolation", "portal", "pages", "media"].every((k) => checks[k]?.status === "ok") && !voices.loading;

  // ── run ───────────────────────────────────────────────────────────────────────────────────────
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
    if (st.phase === "running") el.removeAttribute("inert"); else el.setAttribute("inert", "");
  }, [st.phase, appKey]);

  const startRun = () => {
    if (!ready || st.phase !== "begin") return;
    // The press is the browser's gesture for speech: a silent line with the chosen on-device voice.
    if (narrator.voiceOn) {
      try { const u = new SpeechSynthesisUtterance(" "); u.voice = narrator.voice; u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
    }
    setLeaving(true);
    director.start();
    setTimeout(() => setLeaving(false), 650);
  };

  const restart = useCallback(() => {
    director.stop();
    setMenu(false);
    setConfirm(false);
    pausedForConfirm.current = false;
    setLeaving(false);
    try { backend?.reset?.(); } catch { /* ignore */ }
    try { window.__PMO_SIM__?.clock?.reset?.(); } catch { /* ignore */ }
    try { UI_KEYS.session.forEach((k) => sessionStorage.removeItem(k)); UI_KEYS.local.forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    setClockSec(0);
    setAppKey((k) => k + 1);
  }, [director, backend]);

  const exit = useCallback(() => {
    director.stop();
    setConfirm(false);
    document.body.classList.remove("pmo-touring", "pmo-sim-run");
    if (onExit) onExit(); else { try { window.close(); } catch { /* ignore */ } }
  }, [director, onExit]);

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

  // Keys: trusted presses only (the director's own key presses are dispatched, never trusted).
  useEffect(() => {
    const onKey = (e) => {
      if (!e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
      const phase = director.state.phase;
      if (phase === "begin") return;
      const k = e.key;
      if (confirm) {
        if (k === "Escape") { e.preventDefault(); e.stopPropagation(); cancelExit(); }
        return;
      }
      // The Gallery's full-screen view listens for Escape and the arrows on window: leave them to it.
      const lightbox = !!document.querySelector('[data-tour="lightbox"]');
      let handled = true;
      if (phase === "running") {
        if (k === " " || k === "." || k === "b" || k === "B") director.togglePause();
        else if (k === "PageDown" || (k === "ArrowRight" && !lightbox)) director.next();
        else if (k === "PageUp" || (k === "ArrowLeft" && !lightbox)) director.prev();
        else if (k === "c" || k === "C") setMenu((m) => !m);
        else if (k === "Home") restart();
        else if (k === "Escape" && !lightbox) { if (menu) setMenu(false); else askExit(); }
        else handled = false;
      } else if (phase === "closing") {
        if (k === "Home") restart();
        else if (k === "Escape") askExit();
        else handled = false;
      } else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [director, confirm, menu, restart, askExit, cancelExit]);

  const badge = (mode === "sample" ? meta.sampleBadge : meta.badge)
    || (mode === "sample" ? "Simulation · sample names · fictional data · nothing is sent"
      : "Simulation · real names, fictional projects and figures · nothing is sent");
  const voice = {
    available: voices.list.length > 0, loading: voices.loading, list: voices.list, on: voiceOn, setOn: setVoiceOn,
    name: voiceName, choose: chooseVoice, test: testVoice, testing, result: testResult,
  };

  return (
    <>
      <div ref={appWrap} data-sim-app="" style={{ display: "contents" }}>
        <AppBoundary key={appKey}>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </AppBoundary>
      </div>

      <SpotLayer spotlight={spotlight} />
      <Shield on={running} />
      <CaptionDock state={st} voiceOn={narrator.voiceOn} progress={clockSec / LIMIT} />
      <Dock state={st} clock={clockSec} chapters={chapters} menu={menu} setMenu={setMenu} note={st.note}
        onPrev={() => director.prev()} onPause={() => director.togglePause()} onNext={() => director.next()}
        onChapter={(n) => director.chapter(n)} onRestart={restart} onExit={askExit} />

      {(st.phase === "begin" || leaving) && (
        <BeginScreen leaving={leaving} mode={mode} castCode={code} chapters={chapters} checks={checkList}
          ready={ready} voice={voice} onStart={startRun} />
      )}
      {st.phase === "closing" && (
        <ClosingCard caption={st.caption} chapters={chapters} report={director.report}
          onChapter={(n) => director.chapter(n)} onRestart={restart} onExit={askExit} />
      )}
      {confirm && <ConfirmExit onCancel={cancelExit} onExit={exit} />}
      <Badge text={badge} />
    </>
  );
}
