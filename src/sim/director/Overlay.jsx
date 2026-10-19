// PMO Simulation director: what the audience sees on top of the real App while the run plays.
// Owner: B3b (contract §H.6).
//   - the spotlight (an SVG drawn by spotlight.js: dim with holes, gold rings);
//   - the caption, docked in the sidebar column with the assistant, or shrunk to the assistant alone
//     in the bottom-left corner while a full-screen view (Board report, Gallery picture) is open;
//   - a transparent shield that stops stray clicks from changing the run (the controls stay usable);
//   - the simulation badge, top centre, above everything, in every state (Badge, exported):
//     "Live portal data as of HH:MM PKT · read-only · nothing is sent".
// Nothing here is new to the App: it is its own layer and only reads the App's layout.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { SPOT_MAX } from "./spotlight.js";
import { GOLD, GOLD_SOFT, INK, SANS, Z, EASE } from "./look.js";

/** The badge: "Live portal data as of HH:MM PKT · read-only · nothing is sent". */
export function Badge({ text }) {
  return (
    <div data-sim-ui="badge" role="note" style={{
      position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: Z.badge,
      // Compact (about 18 px tall) so it clears the page title and the header buttons at 1366 px.
      pointerEvents: "none", padding: "2px 12px 3px", borderRadius: "0 0 10px 10px",
      background: "rgba(10,26,46,.95)", border: `1px solid ${GOLD}`, borderTop: 0,
      color: "#F6D9A8", font: `600 10.5px/1.3 ${SANS}`, letterSpacing: ".02em", whiteSpace: "nowrap",
      boxShadow: "0 2px 8px rgba(0,0,0,.25)", maxWidth: "calc(100vw - 32px)", overflow: "hidden", textOverflow: "ellipsis",
    }}>{text}</div>
  );
}

/** The spotlight layer; hands its SVG parts to the Spotlight controller. */
export function SpotLayer({ spotlight }) {
  const dim = useRef(null);
  const holes = useRef([]);
  const rings = useRef([]);
  useLayoutEffect(() => {
    spotlight.attach({ dim: dim.current, holes: holes.current, rings: rings.current });
    return () => spotlight.attach(null);
  }, [spotlight]);
  const idx = Array.from({ length: SPOT_MAX }, (_, i) => i);
  return (
    <svg data-sim-ui="spotlight" aria-hidden="true" width="100%" height="100%"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: Z.spot, pointerEvents: "none" }}>
      <defs>
        <mask id="sim-spot-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {idx.map((i) => <rect key={i} ref={(n) => { holes.current[i] = n; }} width="0" height="0" fill="black" />)}
        </mask>
        <filter id="sim-ring-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect ref={dim} x="0" y="0" width="100%" height="100%" mask="url(#sim-spot-mask)" style={{ opacity: 0 }} />
      <g filter="url(#sim-ring-glow)">
        {idx.map((i) => (
          <rect key={i} ref={(n) => { rings.current[i] = n; }} width="0" height="0" fill="none"
            stroke={GOLD} strokeOpacity=".9" strokeWidth="2" style={{ opacity: 0 }} />
        ))}
      </g>
    </svg>
  );
}

/** Where the caption docks: inside the sidebar column, at its foot. */
export function useSidebarBox(active) {
  const [box, setBox] = useState({ left: 10, width: 224 });
  useEffect(() => {
    if (!active) return undefined;
    const measure = () => {
      const nav = document.querySelector('[data-nav="cmd"]');
      let sb = nav;
      while (sb && sb.parentElement && sb.getBoundingClientRect().height < window.innerHeight - 4) sb = sb.parentElement;
      const r = sb && sb !== document.body ? sb.getBoundingClientRect() : null;
      const w = r && r.width >= 180 && r.width <= 400 ? r.width : 244;
      const left = r && r.width <= 400 ? r.left : 0;
      setBox({ left: Math.max(8, left + 10), width: Math.max(212, Math.min(280, w - 20)) });
    };
    measure();
    window.addEventListener("resize", measure);
    const iv = setInterval(measure, 1500);
    return () => { window.removeEventListener("resize", measure); clearInterval(iv); };
  }, [active]);
  return box;
}

/** The narrator: avatar + caption, in the sidebar column (or the avatar alone, top-left). Not shown
 *  while the opening's presenter card holds the caption. */
export function CaptionDock({ state, voiceOn, progress }) {
  const show = state.phase === "running" && !!state.caption && state.presenter !== "card";
  const box = useSidebarBox(state.phase === "running");
  const mini = state.mini;
  const avatarState = state.paused ? "idle" : state.speaking ? "speaking" : "answering";
  // Fade the text out and in when the line changes.
  const [shown, setShown] = useState(state.caption);
  const [fade, setFade] = useState(1);
  useEffect(() => {
    if (state.caption === shown) return undefined;
    setFade(0);
    const t = setTimeout(() => { setShown(state.caption); setFade(1); }, 160);
    return () => clearTimeout(t);
  }, [state.caption]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;
  if (mini) {
    return (
      // Bottom-left: the report viewer's left gutter is empty there (at the top it covered a label).
      <div data-sim-ui="caption-mini" aria-live="polite" style={{
        position: "fixed", bottom: 16, left: 16, zIndex: Z.caption, pointerEvents: "none",
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
        animation: "simDirFade .3s ease both",
      }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(circle at 50% 40%, rgba(24,64,106,.85), rgba(10,26,46,.92))",
          border: `1px solid ${GOLD}66`, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
          <AssistantAvatar size={52} boxScale={1.12} track={false} state={avatarState} />
        </div>
        {/* Captions are always shown (PMO decision 14 Oct 2026), also while the assistant is small. */}
        <div style={{ maxWidth: 210, padding: "8px 11px", borderRadius: 10, background: "rgba(10,26,46,.92)",
          border: `1px solid ${GOLD}55`, color: INK, fontFamily: SANS }}>
          {(state.kicker || state.paused) && (
            <div style={{ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: GOLD, fontWeight: 700, lineHeight: 1.45, marginBottom: 4 }}>
              {state.kicker}
              {state.paused && (
                <span style={{ marginLeft: state.kicker ? 6 : 0, color: GOLD_SOFT, letterSpacing: ".04em", textTransform: "none", fontSize: 11,
                  animation: "simDirPulse 1.6s ease-in-out infinite" }}>Paused</span>
              )}
            </div>
          )}
          <div className="sim-dir-caption-text" style={{ font: `500 14px/1.4 ${SANS}`, opacity: fade, transition: "opacity .16s ease" }}>{shown}</div>
        </div>
      </div>
    );
  }
  return (
    <div data-sim-ui="caption" aria-live="polite" style={{
      position: "fixed", left: box.left, bottom: 12, width: box.width, zIndex: Z.caption, pointerEvents: "none",
      padding: "12px 14px 15px", borderRadius: 16, boxSizing: "border-box",
      background: `linear-gradient(180deg, rgba(16,38,63,.97), rgba(9,22,40,.98))`,
      border: `1px solid ${GOLD}59`, color: INK, fontFamily: SANS,
      backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)",
      animation: "simDirIn .45s " + EASE + " both, simDirBreathe 5.5s ease-in-out infinite",
      transition: `left .3s ${EASE}, width .3s ${EASE}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{ width: 72, height: 72, flexShrink: 0, marginLeft: -6, marginTop: -4 }}>
          <AssistantAvatar size={72} boxScale={1.0} track={false} state={avatarState} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: GOLD, fontWeight: 700, lineHeight: 1.45 }}>
            {state.kicker}
          </div>
          {state.paused && (
            <div style={{ marginTop: 4, fontSize: 11, color: GOLD_SOFT, fontWeight: 600, animation: "simDirPulse 1.6s ease-in-out infinite" }}>
              Paused
            </div>
          )}
        </div>
      </div>
      <div className="sim-dir-caption-text" style={{ fontSize: 18, lineHeight: 1.42, fontWeight: 500, letterSpacing: "-.005em", opacity: fade }}>
        {shown}
      </div>
      <div aria-hidden="true" style={{ position: "absolute", left: 14, right: 14, bottom: 6, height: 2, borderRadius: 2,
        background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, progress * 100)).toFixed(1)}%`,
          background: `linear-gradient(90deg, ${GOLD}, ${GOLD_SOFT})`, transition: "width .25s linear" }} />
      </div>
    </div>
  );
}

/** Swallows stray clicks on the App while the run plays (the controls sit above it). */
export function Shield({ on }) {
  if (!on) return null;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div data-sim-ui="shield" aria-hidden="true" onMouseDown={stop} onClick={stop} onContextMenu={stop}
      onDoubleClick={stop} style={{ position: "fixed", inset: 0, zIndex: Z.shield, background: "transparent", cursor: "default" }} />
  );
}
