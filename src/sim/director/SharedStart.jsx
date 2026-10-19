// PMO Simulation director: the start screen of a copy the PMO shared with guests (in place of the
// presenter's Begin screen, which stays as it is for the PMO).
//
// Shows the assistant, "Shared by the PMO · portal data as of <day, time> PKT", the three steps
// (data checked, rehearsing, ready), the voice switch (the share's own choice first) and Start now.
// Once every rule holds and the tab is in view, a 5-second countdown starts the run by itself
// (onStart({ auto: true })); Cancel stops it, and Start now (a click, so the browser lets the voice
// speak) starts at once. The countdown only runs while the tab is visible: a tab in the background
// waits. No presenter notes, rehearsal report, Test voice or Refresh here.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertTriangle, Volume2, VolumeX, Play, X } from "lucide-react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { NAVY, GOLD, GOLD_SOFT, INK, INK_SOFT, INK_DIM, SERIF, SANS, Z, EASE } from "./look.js";
import { fmtClock } from "./clock.js";
import { LIMIT } from "./engine.js";

/** Seconds of countdown before a ready run starts by itself. */
export const COUNTDOWN = 5;

const panel = { padding: "16px 18px", borderRadius: 14, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)" };
const ghost = { display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: INK, font: `500 13px ${SANS}`, cursor: "pointer" };

function Step({ status, label, detail }) {
  const icon = status === "ok" ? <Check size={15} color="#3FD3B1" />
    : status === "fail" ? <AlertTriangle size={15} color="#F2A7B4" />
    : <Loader2 size={15} color={GOLD} style={{ animation: "simDirSpin .9s linear infinite" }} />;
  return (
    <div role="listitem" data-sim-step={status} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 14, color: status === "fail" ? "#FFD9DF" : status === "wait" ? INK_SOFT : INK }}>
        {label}
        {detail && <span style={{ color: INK_DIM }}> · {detail}</span>}
      </span>
    </div>
  );
}

/** Whether the page is in view now (the countdown waits while it is not). */
function useVisible() {
  const read = () => typeof document === "undefined" || document.visibilityState === "visible";
  const [visible, setVisible] = useState(read);
  useEffect(() => {
    const on = () => setVisible(read());
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/**
 * data: { asOfText, untilText, steps: [{ key, label, status, detail }], startable, startReason, startReasonTone, probing }
 * voice: { available, loading, on, setOn }
 */
export function SharedStart({ leaving, data, voice, onStart, onExit }) {
  const d = data;
  const ready = !!d.startable;
  const visible = useVisible();
  const [cancelled, setCancelled] = useState(false);
  const [left, setLeft] = useState(null);           // seconds left, or null when not counting
  const startRef = useRef(null);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  useEffect(() => { if (ready) startRef.current?.focus({ preventScroll: true }); }, [ready]);

  // The countdown: only while ready, in view, not cancelled and not already leaving; any change restarts it.
  const counting = ready && visible && !cancelled && !leaving && !d.probing;
  useEffect(() => {
    if (!counting) { setLeft(null); return undefined; }
    const t0 = performance.now();
    setLeft(COUNTDOWN);
    let fired = false;
    const id = setInterval(() => {
      const l = COUNTDOWN - Math.floor((performance.now() - t0) / 1000);
      if (l > 0) { setLeft(l); return; }
      clearInterval(id);
      if (fired || document.visibilityState !== "visible") return;
      fired = true;
      setLeft(0);
      onStartRef.current({ auto: true });
    }, 200);
    return () => clearInterval(id);
  }, [counting]);

  const v = voice;
  const bad = !ready && d.startReasonTone === "bad";
  const status = d.probing ? "Starting…"
    : ready && left != null && left > 0 ? `Starting in ${left} s`
      : ready && cancelled ? "Press Start now when you are ready."
        : ready && !visible ? "Starts when this tab is in view."
          : ready ? "Ready." : d.startReason;
  return (
    <div data-sim-ui="begin" data-sim-shared="" onKeyDown={(e) => e.stopPropagation()} style={{
      position: "fixed", inset: 0, zIndex: Z.veil, overflow: "auto", overflowX: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 16px", fontFamily: SANS, color: INK, boxSizing: "border-box",
      background: `radial-gradient(1100px 620px at 18% -8%, #18406A 0%, rgba(24,64,106,0) 60%),
        radial-gradient(900px 520px at 100% 110%, rgba(216,152,64,.16) 0%, rgba(216,152,64,0) 55%), ${NAVY}`,
      opacity: leaving ? 0 : 1, transition: "opacity .6s ease", pointerEvents: leaving ? "none" : "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 640, animation: `simDirIn .5s ${EASE} both` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ width: 104, height: 104, flexShrink: 0 }}>
            <AssistantAvatar size={104} boxScale={1.0} track state={ready ? "success" : bad ? "idle" : "thinking"} />
          </div>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 36, lineHeight: 1.1 }}>PMO Portal · Simulation</h1>
            <div data-sim-ui="as-of" style={{ marginTop: 8, fontSize: 15, color: INK_SOFT }}>
              Shared by the PMO · portal data as of <b style={{ color: INK }}>{d.asOfText} PKT</b>
            </div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: INK_DIM, lineHeight: 1.55 }}>
              The assistant presents the portal on this data, read-only, in under {fmtClock(LIMIT)}. Nothing is changed or sent.
              {d.untilText && <> Shared until {d.untilText} PKT.</>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={panel}>
            <div role="list" data-sim-ui="steps">
              {d.steps.map((s) => <Step key={s.key} status={s.status} label={s.label} detail={s.detail} />)}
            </div>
          </div>

          <div style={{ ...panel, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {v.available ? (
              <>
                <button type="button" role="switch" aria-checked={v.on} className="sim-dir-btn" data-sim-voice="" onClick={() => v.setOn(!v.on)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", borderRadius: 99,
                    border: `1px solid ${v.on ? GOLD : "rgba(255,255,255,.18)"}`, background: v.on ? "rgba(216,152,64,.16)" : "transparent",
                    color: INK, font: `600 13px ${SANS}`, cursor: "pointer" }}>
                  {v.on ? <Volume2 size={15} /> : <VolumeX size={15} />} {v.on ? "Voice on" : "Voice off · captions only"}
                </button>
                <span style={{ fontSize: 12.5, color: INK_DIM }}>Captions are always shown.</span>
              </>
            ) : (
              <span role="note" style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.55 }}>
                {v.loading ? "Looking for an on-device voice…" : <>No on-device English voice on this computer: the presentation shows <b style={{ color: INK }}>captions only</b>.</>}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="sim-dir-btn" data-sim-close="" onClick={onExit} style={{ ...ghost, marginRight: "auto" }}>
            <X size={15} /> Close
          </button>
          <span role={bad ? "alert" : "status"} aria-live="polite" data-sim-countdown={left == null ? "" : String(left)}
            style={{ flex: "1 1 200px", fontSize: 13, color: bad ? "#FFD9DF" : left != null ? GOLD_SOFT : INK_DIM, textAlign: "right" }}>
            {status}
          </span>
          {left != null && left > 0 && (
            <button type="button" className="sim-dir-btn" data-sim-cancel="" onClick={() => setCancelled(true)} style={ghost}>Cancel</button>
          )}
          <button ref={startRef} type="button" className="sim-dir-btn" data-sim-start="" disabled={!ready || !!d.probing}
            onClick={() => onStart({ auto: false })}
            style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 48, padding: "0 24px", borderRadius: 12,
              border: "none", background: ready ? `linear-gradient(135deg, ${GOLD_SOFT}, ${GOLD})` : "rgba(255,255,255,.08)",
              color: ready ? "#1A1206" : INK_DIM, font: `700 15px ${SANS}`, cursor: ready ? "pointer" : "not-allowed",
              boxShadow: ready ? "0 12px 34px rgba(216,152,64,.35)" : "none" }}>
            <Play size={17} /> Start now
          </button>
        </div>
      </div>
    </div>
  );
}
