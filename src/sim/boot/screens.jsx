// PMO Simulation: the screens shown before the run (locked, receiving, checking, failed, ended).
// Owner: B2. Spec: contract §G.6. No data and no names: only fixed text and counts. Every failure
// says what went wrong and what to do; no stand-in data is ever shown instead. Navy and gold, as
// the portal's sign-in page.
import React from "react";

const NAVY = "#0A1A2E";
const GOLD = "#D89840";
const SERIF = "'DM Serif Display', Georgia, serif";
const SANS = "Inter, 'Segoe UI', Arial, sans-serif";
const base = () => window.__PMO_SIM__?.base || "./";

const CSS = `
@keyframes simBootSpin { to { transform: rotate(360deg); } }
@keyframes simBootIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes simBootGlow { 0%,100% { opacity: .55; } 50% { opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .sim-boot-card, .sim-boot-spin, .sim-boot-glow { animation: none !important; } }
`;

// The footer line: what this page is and does.
const FOOT = "PMO Portal · Simulation · live portal data · read-only · nothing is changed or sent";

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
            {typeof footer === "string" ? footer : FOOT}
          </div>
        )}
      </div>
    </div>
  );
}

// Opened directly, reloaded, or without a hand-over: nothing to show, and no way on from here.
export function LockedScreen() {
  return (
    <Frame title="Open the simulation from the PMO portal">
      <div role="alert">This page runs only when the PMO presses <b style={{ color: "#fff" }}>Simulation</b> in the signed-in portal.</div>
      <div style={{ marginTop: 10, fontSize: 13.5, color: "rgba(255,255,255,.6)" }}>It holds no data of its own: the portal hands its
        current data to this tab when the simulation starts, and nothing is kept after it ends.</div>
    </Frame>
  );
}

const MB = (n) => `${(n / 1048576).toFixed(n >= 10 * 1048576 ? 0 : 1)} MB`;
// What the portal and this page are doing while the data comes across.
function progressText({ phase, media, parts, items }) {
  switch (phase) {
    case "waiting": return { title: "Connecting to the PMO portal", text: "Waiting for the PMO portal…", pct: null };
    case "portal-media": {
      const t = media && media.total ? ` ${media.done} of ${media.total}${media.bytes ? " · " + MB(media.bytes) : ""}` : "";
      return { title: "Connecting to the PMO portal", text: `The portal is preparing the photos and videos…${t}`,
        pct: media && media.total ? media.done / media.total : null };
    }
    case "portal-reading": return { title: "Connecting to the PMO portal", text: "The portal is reading its current data…", pct: null };
    case "portal-checking": return { title: "Connecting to the PMO portal", text: "The portal is checking its data…", pct: null };
    case "receiving": {
      const p = parts && parts.of ? `${parts.got} of ${parts.of} parts` : "";
      const m = items && items.of ? `${items.got} of ${items.of} photos and videos` : "";
      const done = (parts?.got || 0) + (items?.got || 0), all = (parts?.of || 0) + (items?.of || 0);
      return { title: "Receiving the portal data", text: `Receiving the data… ${[p, m].filter(Boolean).join(" · ")}`, pct: all ? done / all : null };
    }
    case "validating": return { title: "Checking the data", text: "Checking everything that arrived…", pct: 1 };
    default: return { title: "Getting the simulation ready", text: "Preparing the presentation…", pct: null };
  }
}

// Receiving the hand-over, then preparing the presentation.
export function ProgressScreen(props) {
  const { title, text, pct } = progressText(props);
  const preparing = props.phase === "preparing" || props.phase === "validating";
  return (
    <Frame title={title}>
      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="sim-boot-spin" aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
          border: "2px solid rgba(255,255,255,.18)", borderTopColor: GOLD, animation: "simBootSpin .8s linear infinite" }} />
        <span>{text}</span>
      </div>
      {!preparing && (
        <div aria-hidden="true" style={{ marginTop: 16, height: 6, borderRadius: 6, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct === null ? "8%" : `${Math.max(4, Math.min(100, Math.round(pct * 100)))}%`, borderRadius: 6,
            background: `linear-gradient(90deg, ${GOLD}, #F0C27A)`, transition: "width .3s ease" }} />
        </div>
      )}
      <div style={{ marginTop: 14, fontSize: 12.5, color: "rgba(255,255,255,.55)" }}>
        Keep the portal tab open until the simulation starts.
      </div>
    </Frame>
  );
}

// Something stopped the start: what happened, what to do, and which check (by name, never data).
export function FailScreen({ title = "The simulation could not start safely", reason, remedy, check }) {
  return (
    <Frame title={title} tone="rose">
      <div role="alert">{reason || "Nothing was loaded."}</div>
      <div style={{ marginTop: 10 }}>{remedy || "Close this tab, then press Simulation in the signed-in portal again."}</div>
      {check && <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.45)" }}>Check failed: {check}</div>}
    </Frame>
  );
}

// After Exit, when the browser does not let the page close its own tab.
export function EndedScreen() {
  return (
    <Frame title="The simulation has ended">
      <div role="status">Its data and storage have been cleared. You can close this tab.</div>
    </Frame>
  );
}
