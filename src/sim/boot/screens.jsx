// PMO Simulation: the screens shown before the run (locked, receiving, preparing, failed, ended).
// No data and no names: only fixed text. Navy and gold, as the portal's sign-in page.
import React, { useEffect, useRef } from "react";

const NAVY = "#0A1A2E";
const GOLD = "#D89840";
const SERIF = "'DM Serif Display', Georgia, serif";
const SANS = "Inter, 'Segoe UI', Arial, sans-serif";
const base = () => window.__PMO_SIM__?.base || "./";

const CSS = `
@keyframes simBootSpin { to { transform: rotate(360deg); } }
@keyframes simBootIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes simBootGlow { 0%,100% { opacity: .55; } 50% { opacity: .9; } }
.sim-boot-btn { transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease; }
.sim-boot-btn:hover { background: rgba(216,152,64,.14) !important; border-color: ${GOLD} !important; color: #fff !important; }
.sim-boot-btn:active { transform: translateY(1px); }
.sim-boot-btn:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .sim-boot-card, .sim-boot-spin, .sim-boot-glow { animation: none !important; } }
`;

// The footer line says what the page holds at that moment: no names yet (locked, failed, ended),
// the real cast arriving, or the invented sample names.
const FOOT_NONE = "Simulation · fictional projects and figures · nothing is sent";
const FOOT_REAL = "Simulation · real names, fictional projects and figures · nothing is sent";
const FOOT_SAMPLE = "Simulation · sample names · fictional data · nothing is sent";
const footDefault = () => (window.__PMO_SIM__?.mode === "sample" ? FOOT_SAMPLE : FOOT_REAL);

function Frame({ kicker = "PMO Portal · Simulation", title, children, footer = true, tone = "gold" }) {
  return (
    <div data-sim-boot="" style={{ position: "fixed", inset: 0, overflow: "auto", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "32px 16px", fontFamily: SANS, color: "#fff",
      background: `radial-gradient(1100px 620px at 18% -8%, #18406A 0%, rgba(24,64,106,0) 60%),
        radial-gradient(900px 520px at 100% 110%, rgba(216,152,64,.16) 0%, rgba(216,152,64,0) 55%), ${NAVY}` }}>
      <style>{CSS}</style>
      <div className="sim-boot-glow" aria-hidden="true" style={{ position: "absolute", top: "12%", left: "50%", width: 520, height: 520,
        marginLeft: -260, borderRadius: "50%", background: "radial-gradient(circle, rgba(216,152,64,.10), rgba(216,152,64,0) 65%)",
        animation: "simBootGlow 7s ease-in-out infinite", pointerEvents: "none" }} />
      <div className="sim-boot-card" style={{ position: "relative", width: "100%", maxWidth: 540, padding: "34px 34px 28px",
        borderRadius: 18, border: `1px solid ${tone === "rose" ? "rgba(226,108,128,.45)" : "rgba(216,152,64,.32)"}`,
        background: "linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.025))",
        boxShadow: "0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)",
        animation: "simBootIn .45s cubic-bezier(.2,.7,.2,1) both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <img src={base() + "favicon.png"} alt="Riphah" width={34} height={34} style={{ opacity: .92 }} />
          <div style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>{kicker}</div>
        </div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 30, lineHeight: 1.15, letterSpacing: ".01em" }}>{title}</h1>
        <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,.82)" }}>{children}</div>
        {footer && (
          <div style={{ marginTop: 26, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11.5,
            color: "rgba(255,255,255,.5)", letterSpacing: ".02em" }}>
            {typeof footer === "string" ? footer : footDefault()}
          </div>
        )}
      </div>
    </div>
  );
}

const Button = React.forwardRef(function Button({ children, onClick }, ref) {
  return (
    <button ref={ref} type="button" className="sim-boot-btn" onClick={onClick}
      style={{ marginTop: 22, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(216,152,64,.55)",
        background: "transparent", color: "rgba(255,255,255,.9)", font: `500 13px ${SANS}`, cursor: "pointer" }}>
      {children}
    </button>
  );
});

// Opened directly, reloaded, or after a hand-over that did not complete.
export function LockedScreen({ reason, onSample }) {
  const btn = useRef(null);
  useEffect(() => { btn.current?.focus({ preventScroll: true }); }, []);
  return (
    <Frame title="Open the simulation from the PMO portal" footer={FOOT_NONE}>
      {reason && (
        <div role="alert" style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: "rgba(226,108,128,.12)",
          border: "1px solid rgba(226,108,128,.35)", color: "#FFD9DF", fontSize: 13.5 }}>{reason}</div>
      )}
      <div>Sign in to the PMO portal as PMO and press <b style={{ color: "#fff" }}>Simulation</b> in the sidebar. The campus,
        manager and team names arrive from there; this page holds none.</div>
      {onSample && (
        <>
          <Button ref={btn} onClick={onSample}>Run with sample names</Button>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,.55)" }}>Every name is invented in this mode.</div>
        </>
      )}
    </Frame>
  );
}

// Receiving the hand-over, then preparing the data.
export function ProgressScreen({ phase, received = 0, expect = null }) {
  const preparing = phase === "preparing" || phase === "done";
  const waiting = phase === "waiting";
  const pct = expect ? Math.min(100, Math.round((received / Math.max(1, expect)) * 100)) : null;
  const text = preparing ? "Preparing the simulation…"
    : waiting ? "Waiting for the PMO portal…"
    : expect ? `Receiving names and photos… ${received} of ${expect}`
    : received ? `Receiving names and photos… ${received}` : "Receiving names and photos…";
  return (
    <Frame title={preparing ? "Getting the simulation ready" : "Connecting to the PMO portal"}>
      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="sim-boot-spin" aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
          border: "2px solid rgba(255,255,255,.18)", borderTopColor: GOLD, animation: "simBootSpin .8s linear infinite" }} />
        <span>{text}</span>
      </div>
      {!preparing && (
        <div aria-hidden="true" style={{ marginTop: 16, height: 6, borderRadius: 6, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct === null ? (waiting ? "8%" : "35%") : `${pct}%`, borderRadius: 6,
            background: `linear-gradient(90deg, ${GOLD}, #F0C27A)`, transition: "width .3s ease" }} />
        </div>
      )}
      <div style={{ marginTop: 14, fontSize: 12.5, color: "rgba(255,255,255,.55)" }}>
        Keep the portal tab open until the simulation starts.
      </div>
    </Frame>
  );
}

// The isolation checks failed: nothing else is loaded, and there is no way on from here.
export function FailScreen({ title = "The simulation could not start safely", reason }) {
  return (
    <Frame title={title} tone="rose" footer={FOOT_NONE}>
      <div role="alert">Nothing was loaded. Close this tab, then sign in to the PMO portal as PMO and press
        Simulation in the sidebar again.</div>
      {reason && <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.45)" }}>Check failed: {reason}</div>}
    </Frame>
  );
}

// After Exit, when the browser does not let the page close its own tab.
export function EndedScreen() {
  return (
    <Frame title="The simulation has ended" footer={FOOT_NONE}>
      <div role="status">Its data and storage have been cleared. You can close this tab.</div>
    </Frame>
  );
}

// Shown for the whole run in sample mode.
export function SampleChip() {
  return (
    <div data-sim-ui="sample-chip" role="note" style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
      zIndex: 2147483000, pointerEvents: "none", padding: "2px 12px 3px", borderRadius: "0 0 9px 9px", background: "rgba(10,26,46,.94)",
      border: `1px solid ${GOLD}`, borderTop: 0, color: "#F6D9A8", font: `600 10.5px/1.35 ${SANS}`, letterSpacing: ".06em",
      boxShadow: "0 4px 12px rgba(0,0,0,.22)" }}>
      Sample names · every name is invented
    </div>
  );
}
