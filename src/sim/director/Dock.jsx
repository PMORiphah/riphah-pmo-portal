// PMO Simulation director: the presenter's controls (bottom-right).
//   Previous · Pause/Resume · Next · Chapters · Restart · Exit, the run clock ("1:12 / 2:00") and the
//   current chapter. The dock fades out while the run plays and comes back when the mouse moves; it
//   stays up while paused or while a menu is open. Keys (bound in SimRoot): Space / . pause,
//   → / PageDown next, ← / PageUp previous, C chapters, Home restart, Esc exit.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, ListOrdered, RotateCcw, X } from "lucide-react";
import { NAVY, GOLD, GOLD_SOFT, INK, INK_SOFT, INK_DIM, SANS, SERIF, Z } from "./look.js";
import { fmtClock } from "./clock.js";

const btn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, minWidth: 34,
  padding: "0 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)",
  color: INK, font: `500 12.5px ${SANS}`, cursor: "pointer",
};

function Btn({ label, title, onClick, children, active, disabled }) {
  return (
    <button type="button" className="sim-dir-btn" aria-label={label} title={title || label} disabled={disabled}
      onClick={(e) => { e.currentTarget.blur(); onClick?.(); }}
      style={{ ...btn, ...(active ? { borderColor: GOLD, background: "rgba(216,152,64,.16)" } : null) }}>
      {children}
    </button>
  );
}

/** The chapter list (also used by the closing card and the Begin screen's list). */
export function ChapterList({ chapters, current, onPick, dense }) {
  return (
    <div role="menu" style={{ display: "grid", gap: dense ? 2 : 6 }}>
      {chapters.map((c) => (
        <button key={c.n} type="button" role="menuitem" className="sim-dir-btn" onClick={() => onPick(c.n)}
          style={{ display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
            padding: dense ? "7px 10px" : "10px 12px", borderRadius: 9,
            border: `1px solid ${c.n === current ? GOLD : "rgba(255,255,255,.10)"}`,
            background: c.n === current ? "rgba(216,152,64,.14)" : "rgba(255,255,255,.03)", color: INK, fontFamily: SANS }}>
          <span style={{ width: 18, color: GOLD, fontWeight: 700, fontSize: 12 }}>{c.n}</span>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{c.title}</span>
          <span style={{ fontSize: 11.5, color: INK_DIM, fontVariantNumeric: "tabular-nums" }}>{fmtClock(c.start)}</span>
        </button>
      ))}
    </div>
  );
}

export function ConfirmExit({ onCancel, onExit }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <div data-sim-ui="confirm" role="dialog" aria-modal="true" aria-label="Exit the simulation"
      style={{ position: "fixed", inset: 0, zIndex: Z.modal, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(3,8,16,.55)", animation: "simDirFade .2s ease both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ width: 380, maxWidth: "calc(100vw - 32px)", padding: "22px 22px 18px", borderRadius: 16, background: NAVY,
        border: `1px solid ${GOLD}66`, boxShadow: "0 30px 80px rgba(0,0,0,.5)", color: INK, fontFamily: SANS }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, marginBottom: 8 }}>Exit the simulation?</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: INK_SOFT }}>
          Its data and storage are cleared and this tab closes. The portal tab is not touched.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" className="sim-dir-btn" onClick={onCancel} style={btn}>Keep presenting</button>
          <button ref={ref} type="button" className="sim-dir-btn" onClick={onExit}
            style={{ ...btn, borderColor: GOLD, background: "rgba(216,152,64,.18)", color: "#fff", fontWeight: 600 }}>Exit</button>
        </div>
      </div>
    </div>
  );
}

export function Dock({ state, clock, chapters, menu, setMenu, onPrev, onPause, onNext, onChapter, onRestart, onExit, note }) {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t = setTimeout(() => setAwake(false), 2600);
    // Real pointer movement only: the director's own hover events must not wake the dock.
    const wake = (e) => { if (e && e.isTrusted === false) return; setAwake(true); clearTimeout(t); t = setTimeout(() => setAwake(false), 2600); };
    window.addEventListener("mousemove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); window.removeEventListener("pointerdown", wake); };
  }, []);
  if (state.phase !== "running") return null;
  const visible = awake || state.paused || menu;
  const ch = chapters.find((c) => c.n === state.chapter);
  return (
    <div data-sim-ui="dock" style={{ position: "fixed", right: 18, bottom: 16, zIndex: Z.dock, fontFamily: SANS, color: INK,
      opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(6px)", pointerEvents: visible ? "auto" : "none",
      transition: "opacity .35s ease, transform .35s ease" }}>
      {menu && (
        <div style={{ position: "absolute", right: 0, bottom: 52, width: 290, padding: 10, borderRadius: 14, background: NAVY,
          border: `1px solid ${GOLD}55`, boxShadow: "0 20px 60px rgba(0,0,0,.5)", animation: "simDirIn .25s ease both" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: GOLD, fontWeight: 700, margin: "2px 4px 8px" }}>
            Chapters
          </div>
          <ChapterList chapters={chapters} current={state.chapter} onPick={(n) => { setMenu(false); onChapter(n); }} dense />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 7, borderRadius: 14,
        background: "rgba(10,26,46,.94)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 14px 40px rgba(0,0,0,.45)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <Btn label="Previous scene" title="Previous scene (←)" onClick={onPrev}><SkipBack size={15} /></Btn>
        <Btn label={state.paused ? "Resume" : "Pause"} title={state.paused ? "Resume (Space)" : "Pause (Space)"} onClick={onPause} active={state.paused}>
          {state.paused ? <Play size={15} /> : <Pause size={15} />}
        </Btn>
        <Btn label="Next scene" title="Next scene (→)" onClick={onNext}><SkipForward size={15} /></Btn>
        <span style={{ width: 1, height: 22, background: "rgba(255,255,255,.12)", margin: "0 2px" }} />
        <Btn label="Chapters" title="Chapters (C)" onClick={() => setMenu(!menu)} active={menu}><ListOrdered size={15} /> Chapters</Btn>
        <Btn label="Restart" title="Restart (Home)" onClick={onRestart}><RotateCcw size={15} /></Btn>
        <Btn label="Exit" title="Exit (Esc)" onClick={onExit}><X size={15} /></Btn>
        <div style={{ padding: "0 8px 0 6px", minWidth: 104, lineHeight: 1.2 }}>
          <div data-sim-ui="clock" style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: state.paused ? GOLD_SOFT : INK }}>
            {fmtClock(clock)} <span style={{ color: INK_DIM, fontWeight: 500 }}>/ 2:00</span>
          </div>
          <div style={{ fontSize: 10.5, color: INK_DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
            {ch ? `${ch.n} · ${ch.title}` : ""}
          </div>
        </div>
      </div>
      {note && (
        <div data-sim-ui="presenter-note" style={{ position: "absolute", right: 4, bottom: -14, fontSize: 10.5, color: GOLD_SOFT, whiteSpace: "nowrap" }}>
          {note}
        </div>
      )}
    </div>
  );
}
