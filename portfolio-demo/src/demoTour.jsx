// Portfolio demo: the guided tour. Drives the real portal (through the navigation object the portal's
// own tour uses, exposed as window.__DEMO__.nav by a build rule), spotlights each part and explains it
// in a card hosted by the portal's assistant character. Plays by itself; the visitor can pause, go
// back, skip ahead, jump to a chapter, turn the voice on, or leave and resume later. Its place is kept
// in sessionStorage, so a step that runs as another role (a page reload) carries on where it was.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AssistantAvatar } from "../../src/AssistantAvatar.jsx";
import { CHAPTERS, STEPS, stepSeconds, helpers } from "./tourChapters.js";
import { OWNER, OWNER_URL, BAR_H } from "./demoShell.jsx";
import { track } from "./demoAnalytics.js";

const KEY = "cpp-demo-tour";
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
export const readTour = () => safe(() => JSON.parse(sessionStorage.getItem(KEY) || "null")) || null;
export const writeTour = (s) => safe(() => sessionStorage.setItem(KEY, JSON.stringify(s)));
const reduced = () => safe(() => matchMedia("(prefers-reduced-motion: reduce)").matches, false);
const compact = () => innerWidth < 760;

const CSS = `
.dt-spot{position:fixed;z-index:1400;pointer-events:none;border-radius:12px;box-shadow:0 0 0 2px #7fd1c7,0 0 0 9999px rgba(4,10,20,.55);transition:all .45s cubic-bezier(.16,1,.3,1)}
.dt-shade{position:fixed;inset:${BAR_H}px 0 0 0;z-index:1400;pointer-events:none;background:rgba(4,10,20,.35)}
.dt-card{position:fixed;z-index:2147481000;width:min(430px,calc(100vw - 24px));background:#0f2136;color:#eef4fb;border:1px solid rgba(127,209,199,.28);border-radius:16px;
  box-shadow:0 22px 50px rgba(0,0,0,.45);font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.5;transition:left .45s cubic-bezier(.16,1,.3,1),top .45s cubic-bezier(.16,1,.3,1),opacity .2s}
.dt-card *{box-sizing:border-box}
.dt-card button{font:inherit;color:inherit;cursor:pointer}
.dt-card :focus-visible{outline:2px solid #7fd1c7;outline-offset:2px}
.dt-head{display:flex;align-items:center;gap:10px;padding:12px 14px 6px}
.dt-ch{font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;color:#7fd1c7;font-weight:700}
.dt-ch span{color:#a3b6cc;font-weight:600;text-transform:none;letter-spacing:0}
.dt-x{margin-left:auto;background:none;border:0;width:30px;height:30px;border-radius:8px;color:#a3b6cc!important;font-size:18px}
.dt-x:hover{background:rgba(255,255,255,.06)}
.dt-body{padding:2px 16px 4px}
.dt-body h3{margin:0 0 4px;font-size:17px;line-height:1.3}
.dt-body p{margin:0 0 10px;color:#d6e2ef}
.dt-rows{display:grid;gap:6px;margin:0 0 6px}
.dt-row{display:grid;grid-template-columns:118px 1fr;gap:8px;font-size:13px}
.dt-row b{color:#a3b6cc;font-weight:600}
.dt-row.custom{background:rgba(42,157,143,.12);border-radius:8px;padding:6px 8px;margin:2px -8px 0}
.dt-row.custom b{color:#7fd1c7}
.dt-bar{height:3px;background:rgba(148,178,214,.16);margin:6px 16px 0;border-radius:3px;overflow:hidden}
.dt-bar i{display:block;height:100%;background:#2a9d8f;width:0}
.dt-ctl{display:flex;align-items:center;gap:6px;padding:10px 12px 12px;flex-wrap:wrap}
.dt-b{height:34px;min-width:34px;padding:0 10px;border-radius:9px;border:1px solid rgba(148,178,214,.24);background:rgba(255,255,255,.04);font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.dt-b:hover{border-color:#7fd1c7}
.dt-b.pri{background:#2a9d8f;border-color:#2a9d8f;color:#fff}
.dt-b[aria-pressed="true"]{border-color:#7fd1c7;color:#7fd1c7}
.dt-b:disabled{opacity:.4;cursor:default}
.dt-sp{flex:1}
.dt-toc{position:absolute;bottom:calc(100% + 8px);left:0;right:0;max-height:min(420px,60vh);overflow:auto;background:#0f2136;border:1px solid rgba(127,209,199,.28);border-radius:14px;padding:6px;box-shadow:0 18px 40px rgba(0,0,0,.4)}
.dt-toc button{display:flex;gap:10px;width:100%;text-align:left;background:none;border:0;border-radius:8px;padding:8px 10px;font-size:13.5px}
.dt-toc button:hover{background:rgba(127,209,199,.10)}
.dt-toc .on{background:rgba(42,157,143,.18)}
.dt-toc em{font-style:normal;color:#7fd1c7;font-weight:700;width:18px}
.dt-toc small{margin-left:auto;color:#a3b6cc}
.dt-more{background:none;border:0;color:#7fd1c7!important;font-size:12.5px;font-weight:600;padding:0;margin:0 0 8px}
.dt-cta{padding:4px 16px 14px}
.dt-cta h3{margin:4px 0 6px;font-size:19px}
.dt-cta p{color:#d6e2ef;margin:0 0 12px}
.dt-cta .row{display:flex;gap:8px;flex-wrap:wrap}
.dt-cta a.dt-b{text-decoration:none}
.dt-note{font-size:12px;color:#a3b6cc;margin:0 16px 10px}
@media (max-width:759px){.dt-card{left:12px!important;right:12px;width:auto;top:auto!important;bottom:calc(12px + env(safe-area-inset-bottom,0px))}
  .dt-row{grid-template-columns:1fr;gap:0}.dt-body h3{font-size:16px}}
@media (prefers-reduced-motion: reduce){.dt-spot,.dt-card{transition:none}}
`;
let cssIn = false;

function contentRect() {
  const title = document.querySelector('[data-tour="page-title"]');
  const left = title ? Math.max(0, title.getBoundingClientRect().left - 8) : (compact() ? 0 : 250);
  const top = title ? title.getBoundingClientRect().bottom + 6 : BAR_H + 70;
  return { left, top, width: innerWidth - left - 8, height: Math.max(120, innerHeight - top - 8) };
}

export function Tour({ nav, role, switchRole, startState, onClose }) {
  const [st, setSt] = useState(() => ({ idx: 0, playing: true, voice: false, ...startState }));
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [toc, setToc] = useState(false);
  const [more, setMore] = useState(!compact());
  const [done, setDone] = useState(!!startState?.done);
  const [left, setLeft] = useState(0);
  const runRef = useRef(0);
  const barRef = useRef(null);
  const cardRef = useRef(null);
  const step = STEPS[st.idx];

  useEffect(() => { if (cssIn) return; cssIn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }, []);
  useEffect(() => { writeTour({ active: true, ...st, done }); }, [st, done]);

  // ── run a step: right role, page, tab, project, project tab; then find and spotlight its target ──
  useEffect(() => {
    if (done) { setRect(null); setReady(true); return; }
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setReady(false);
    track("tour_step_view", { chapter: step.chapter + 1, step: st.idx + 1, title: step.title });
    const want = step.role || "pmo";
    if (want !== role) { writeTour({ active: true, ...st, done }); switchRole(want); return; }
    let timer = null, measure = null;
    (async () => {
      const n = window.__DEMO__?.nav || nav;
      if (!n) return;
      if (!step.project) n.closeProject?.();
      n.setPage(step.page);
      if (step.tab) n.setTab?.(step.page, step.tab);
      await helpers.wait(80);
      if (step.project) { await n.openSampleProject?.(); await helpers.wait(700); }
      if (step.detail) { helpers.click(document.querySelector(`[data-tab="${step.detail}"]`)); await helpers.wait(550); }
      if (step.reveal) { try { await step.reveal(); } catch { /* a reveal must never stop the tour */ } }
      let el = null;
      if (step.sel !== "content") {
        for (let i = 0; i < 40 && alive() && !(el = document.querySelector(step.sel)); i++) await helpers.wait(100);
      } else await helpers.wait(500);
      if (!alive()) return;
      if (el && !step.sel.startsWith(".dm-")) {
        const r = el.getBoundingClientRect();
        if (r.top < BAR_H + 60 || r.bottom > innerHeight - 40) el.scrollIntoView({ block: r.height > innerHeight * 0.6 ? "start" : "center", behavior: reduced() ? "auto" : "smooth" });
        await helpers.wait(reduced() ? 0 : 380);
      }
      measure = () => {
        if (!alive()) return;
        if (step.sel === "content") { setRect(contentRect()); return; }
        const e = document.querySelector(step.sel);
        if (!e) { setRect(null); return; }
        const r = e.getBoundingClientRect();
        const top = Math.max(BAR_H + 2, r.top - 6), bottom = Math.min(innerHeight - 4, r.bottom + 6);
        setRect({ left: Math.max(4, r.left - 6), top, width: Math.min(innerWidth - 8, r.width + 12), height: Math.max(36, bottom - top) });
      };
      measure();
      setReady(true);
      timer = setInterval(measure, 400);
    })();
    return () => { clearInterval(timer); };
  }, [st.idx, done, role]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── card position: beside the spotlight, else below or above it, else the corner furthest from it;
  //    a bottom sheet on a phone ──
  const [top, setTop] = useState(BAR_H + 12);
  useEffect(() => {
    if (compact()) return;
    const w = 430, h = cardRef.current?.offsetHeight || 340, m = 14, minTop = BAR_H + 10, maxTop = innerHeight - h - 10;
    const clampT = (t) => Math.max(minTop, Math.min(maxTop, t));
    if (!rect || done) { setLeft(Math.round((innerWidth - w) / 2)); setTop(clampT(innerHeight / 2 - h / 2)); return; }
    const beside = clampT(rect.top);
    if (rect.left + rect.width + m + w < innerWidth - 8) { setLeft(rect.left + rect.width + m); setTop(beside); return; }
    if (rect.left - m - w > 8) { setLeft(rect.left - m - w); setTop(beside); return; }
    const cl = Math.max(12, Math.min(innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
    if (rect.top + rect.height + m + h < innerHeight - 8) { setLeft(cl); setTop(rect.top + rect.height + m); return; }
    if (rect.top - m - h > minTop) { setLeft(cl); setTop(rect.top - m - h); return; }
    setLeft(innerWidth - w - 16); setTop(maxTop);
  }, [rect, done, ready, more]);

  // ── voice ──
  const speak = useCallback((text, onEnd) => {
    const ss = window.speechSynthesis;
    if (!ss || !ss.getVoices().length) return false;   // no voices installed: read silently
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = ss.getVoices().find((x) => /^en(-|_)(GB|US)/i.test(x.lang)) || ss.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1.02; u.onend = onEnd; u.onerror = onEnd;
    ss.speak(u);
    return true;
  }, []);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // ── play: advance after the reading time, or when the voice finishes ──
  const next = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (st.idx >= STEPS.length - 1) { setDone(true); track("tour_complete", { steps: STEPS.length }); return; }
    setSt((s) => ({ ...s, idx: s.idx + 1 }));
  }, [st.idx]);
  const back = () => { window.speechSynthesis?.cancel(); setDone(false); setSt((s) => ({ ...s, idx: Math.max(0, s.idx - 1) })); };
  useEffect(() => {
    if (!ready || done || !st.playing) { if (barRef.current) { barRef.current.style.transition = "none"; barRef.current.style.width = "0"; } return; }
    const secs = stepSeconds(step);
    let t = null, spoken = false;
    if (barRef.current) {
      barRef.current.style.transition = "none"; barRef.current.style.width = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => { if (barRef.current) { barRef.current.style.transition = `width ${secs}s linear`; barRef.current.style.width = "100%"; } }));
    }
    if (st.voice) spoken = speak(`${step.title}. ${step.what} ${step.problem} Make it yours: ${step.custom}`, () => { clearTimeout(t); t = setTimeout(next, 900); });
    // Without the voice: the reading time. With it: when it finishes, or a backstop if the browser never says so.
    t = setTimeout(next, (spoken ? secs * 2.5 : secs) * 1000);
    return () => { clearTimeout(t); window.speechSynthesis?.cancel(); };
  }, [ready, done, st.playing, st.voice, st.idx]);   // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback((how = "exit") => {
    window.speechSynthesis?.cancel();
    if (how === "exit") track("tour_exit", { chapter: step.chapter + 1, step: st.idx + 1 });
    writeTour({ active: false, idx: done ? 0 : st.idx, voice: st.voice, done: false, returnRole: st.returnRole });
    onClose(st.returnRole && st.returnRole !== role ? st.returnRole : null);
  }, [st, done, role, step, onClose]);

  // keyboard
  useEffect(() => {
    const k = (e) => {
      if (e.target.closest?.("input,textarea,select,[contenteditable]")) return;
      if (e.key === "Escape") { if (toc) setToc(false); else leave(); }
      else if (e.key === "ArrowRight" && !done) next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === " " && e.target === document.body) { e.preventDefault(); setSt((s) => ({ ...s, playing: !s.playing })); }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [toc, done, next, leave]);

  const chSteps = STEPS.map((s, i) => [s, i]).filter(([s]) => s.chapter === step.chapter);
  const inCh = chSteps.findIndex(([, i]) => i === st.idx) + 1;
  const jump = (c) => { window.speechSynthesis?.cancel(); setToc(false); setDone(false); setSt((s) => ({ ...s, idx: STEPS.findIndex((x) => x.chapter === c) })); track("tour_jump", { chapter: c + 1 }); };
  const voiceOk = typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <>
      {!done && rect && <div className="dt-spot" style={rect} aria-hidden="true" />}
      {(done || (ready && !rect)) && <div className="dt-shade" aria-hidden="true" />}
      <div ref={cardRef} className="dt-card" role="dialog" aria-modal="false" aria-labelledby="dt-title" data-tour-card
        style={{ left: compact() ? undefined : left, top: compact() ? undefined : top, opacity: ready ? 1 : 0.92 }}>
        <div className="dt-head">
          <div style={{ width: 44, height: 44, flex: "0 0 44px", display: "grid", placeItems: "center", overflow: "visible" }}>
            <AssistantAvatar size={44} track={false} state={st.voice && st.playing && !done ? "answering" : "idle"} />
          </div>
          <div className="dt-ch" aria-live="polite">{done ? "Tour complete" : <>Chapter {step.chapter + 1} of {CHAPTERS.length} <span>· {CHAPTERS[step.chapter]}</span></>}</div>
          <button type="button" className="dt-x" aria-label="Leave the tour" title="Leave the tour (Esc)" data-tour-ctl="exit" onClick={() => leave()}>×</button>
        </div>
        {done ? (
          <div className="dt-cta" data-tour-cta>
            <h3 id="dt-title">Want this for your organisation?</h3>
            <p>I can set this portal up with your name, logo, currency, stages, roles and reports, connected to your own data and systems.</p>
            <div className="row">
              <a className="dt-b pri" href={OWNER_URL} target="_blank" rel="noopener noreferrer" data-tour-ctl="cta" onClick={() => track("cta_click", { where: "tour_end" })}>Contact me on Upwork ↗</a>
              <button type="button" className="dt-b" data-tour-ctl="explore" onClick={() => leave("finish")}>Explore freely</button>
              <button type="button" className="dt-b" data-tour-ctl="restart" onClick={() => { setDone(false); setSt((s) => ({ ...s, idx: 0, playing: true })); }}>Watch again</button>
            </div>
            <p className="dt-note" style={{ margin: "12px 0 0" }}>© 2026 {OWNER}. All data in this demo is fictional.</p>
          </div>
        ) : (
          <>
            <div className="dt-body">
              <h3 id="dt-title">{step.title}</h3>
              <p>{step.what}</p>
              {more ? (
                <div className="dt-rows">
                  <div className="dt-row"><b>Who uses it</b><span>{step.who}</span></div>
                  <div className="dt-row"><b>Problem it solves</b><span>{step.problem}</span></div>
                  <div className="dt-row custom"><b>Make it yours</b><span>{step.custom}</span></div>
                </div>
              ) : <button type="button" className="dt-more" onClick={() => setMore(true)}>Who uses it · problem it solves · make it yours ▾</button>}
            </div>
            <div className="dt-bar" aria-hidden="true"><i ref={barRef} /></div>
            <div className="dt-ctl" style={{ position: "relative" }}>
              {toc && (
                <div className="dt-toc" role="menu" aria-label="Chapters">
                  {CHAPTERS.map((c, i) => (
                    <button key={c} type="button" role="menuitem" className={i === step.chapter ? "on" : ""} data-chapter={i + 1} onClick={() => jump(i)}>
                      <em>{i + 1}</em>{c}<small>{STEPS.filter((s) => s.chapter === i).length} steps</small></button>
                  ))}
                </div>
              )}
              <button type="button" className="dt-b" aria-label="Back" title="Back (←)" data-tour-ctl="back" disabled={st.idx === 0} onClick={back}>‹</button>
              <button type="button" className="dt-b" aria-label={st.playing ? "Pause" : "Play"} title="Pause / play (space)" data-tour-ctl="play"
                onClick={() => setSt((s) => ({ ...s, playing: !s.playing }))}>{st.playing ? "❚❚" : "▶"}</button>
              <button type="button" className="dt-b pri" aria-label="Next" title="Next (→)" data-tour-ctl="next" onClick={next}>Next ›</button>
              <span className="dt-sp" style={{ fontSize: 12, color: "#a3b6cc", whiteSpace: "nowrap" }}>{inCh} / {chSteps.length}</span>
              {voiceOk && <button type="button" className="dt-b" aria-pressed={!!st.voice} aria-label="Voice" title="Read aloud" data-tour-ctl="voice"
                onClick={() => setSt((s) => ({ ...s, voice: !s.voice }))}>{st.voice ? "🔊" : "🔈"}</button>}
              <button type="button" className="dt-b" aria-expanded={toc} aria-haspopup="menu" data-tour-ctl="contents" onClick={() => setToc(!toc)}>Contents</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
