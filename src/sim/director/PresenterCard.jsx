// PMO Simulation director: the opening's presenter card. Owner: B3b (contract §H.6, brief "Opening
// visuals").
//
// During the first line the assistant presents from a compact card over the live, lightly dimmed
// dashboard: the Begin screen's own navy-glass assistant, "Riphah PMO Portal" and
// "{FY} capital projects · portal data as of HH:MM PKT", with the caption below. When the second line
// starts the director sets presenter "dock": the card folds into the caption dock in the sidebar
// column (0.5 s) and the dock takes over. No title animation.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { useSidebarBox } from "./Overlay.jsx";
import { GOLD, GOLD_SOFT, INK, INK_SOFT, SERIF, SANS, Z, EASE } from "./look.js";

const FOLD_MS = 500;

/** Where the card sits: centred over the page to the right of the sidebar, a little below the middle. */
function useCardPlace(active) {
  const [place, setPlace] = useState({ left: "50%", top: "56%" });
  useLayoutEffect(() => {
    if (!active) return undefined;
    const measure = () => {
      let sbRight = 0;
      let sb = document.querySelector('[data-nav="cmd"]');
      while (sb && sb.parentElement && sb.getBoundingClientRect().height < window.innerHeight - 4) sb = sb.parentElement;
      if (sb && sb !== document.body) { const r = sb.getBoundingClientRect(); if (r.width <= 400 && r.left < 50) sbRight = r.right; }
      setPlace({ left: sbRight + (window.innerWidth - sbRight) / 2, top: Math.round(window.innerHeight * 0.56) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);
  return place;
}

export function PresenterCard({ state, hhmm, fyLabel }) {
  const on = state.phase === "running" && state.presenter === "card";
  const [folding, setFolding] = useState(false);
  const [caption, setCaption] = useState("");
  const was = useRef(false);
  const card = useRef(null);
  const [fold, setFold] = useState(null);
  const dock = useSidebarBox(on || folding);
  const place = useCardPlace(on || folding);

  useEffect(() => { if (on && state.caption) setCaption(state.caption); }, [on, state.caption]);
  useEffect(() => {
    if (was.current && !on && state.phase === "running") {
      // Fold toward the caption dock: from the card's centre to the dock's, at the dock's width.
      const r = card.current?.getBoundingClientRect();
      if (r) {
        const dx = (dock.left + dock.width / 2) - (r.left + r.width / 2);
        const dy = (window.innerHeight - 12 - 80) - (r.top + r.height / 2);
        const k = Math.max(0.3, Math.min(1, dock.width / r.width));
        setFold(`translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${k.toFixed(3)})`);
      }
      setFolding(true);
      const t = setTimeout(() => { setFolding(false); setFold(null); }, FOLD_MS + 40);
      was.current = on;
      return () => clearTimeout(t);
    }
    if (!on && state.phase !== "running") { setFolding(false); setCaption(""); }
    was.current = on;
    return undefined;
  }, [on, state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on && !folding) return null;
  const avatarState = state.paused ? "idle" : state.speaking ? "speaking" : "answering";
  return (
    <div data-sim-ui="presenter" aria-live="polite" style={{
      position: "fixed", left: place.left, top: place.top, zIndex: Z.caption, pointerEvents: "none",
      transform: "translate(-50%, -50%)",
    }}>
      <div ref={card} style={{
        width: "min(560px, calc(100vw - 48px))", boxSizing: "border-box", padding: "18px 22px 20px", borderRadius: 20,
        background: "linear-gradient(180deg, rgba(16,38,63,.96), rgba(9,22,40,.97))", border: `1px solid ${GOLD}66`,
        boxShadow: "0 30px 80px rgba(0,0,0,.45)", color: INK, fontFamily: SANS,
        backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)",
        transformOrigin: "50% 50%",
        // The entrance waits for the Begin screen's fade (.6 s) to be mostly done, so the two never overlap.
        animation: folding ? `simDirFold ${FOLD_MS}ms ${EASE} both` : `simDirIn .45s ${EASE} .4s both`,
        ...(fold ? { "--sim-fold": fold } : null),
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 92, height: 92, flexShrink: 0 }}>
            <AssistantAvatar size={92} boxScale={1.0} track={false} state={avatarState} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, lineHeight: 1.1 }}>Riphah PMO Portal</div>
            <div style={{ marginTop: 6, fontSize: 13, color: GOLD_SOFT, letterSpacing: ".02em" }}>
              {fyLabel ? `${fyLabel} capital projects` : "Capital projects"} · portal data as of {hhmm} PKT
            </div>
            {state.paused && (
              <div style={{ marginTop: 4, fontSize: 11, color: GOLD_SOFT, fontWeight: 600, animation: "simDirPulse 1.6s ease-in-out infinite" }}>Paused</div>
            )}
          </div>
        </div>
        {caption && (
          <div className="sim-dir-caption-text" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.10)",
            fontSize: 19, lineHeight: 1.42, fontWeight: 500, color: INK }}>
            {caption}
          </div>
        )}
        <div aria-hidden="true" style={{ marginTop: 10, fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: INK_SOFT }}>
          {state.kicker}
        </div>
      </div>
    </div>
  );
}
