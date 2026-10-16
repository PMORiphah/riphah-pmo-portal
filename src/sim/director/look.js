// PMO Simulation director: shared look (navy and gold, as the simulation's boot screens) and the
// one stylesheet the director layer needs. Owner: B3b (contract §H.6). Every director element carries data-sim-ui, which the
// boot script's print stylesheet hides, so nothing of the director reaches a print or a PDF.

export const NAVY = "#0A1A2E";
export const NAVY_2 = "#10263F";
export const GOLD = "#D89840";
export const GOLD_SOFT = "#F0C27A";
export const INK = "rgba(255,255,255,.92)";
export const INK_SOFT = "rgba(255,255,255,.66)";
export const INK_DIM = "rgba(255,255,255,.45)";
export const SERIF = "'DM Serif Display', Georgia, serif";
export const SANS = "Inter, 'Segoe UI', Arial, sans-serif";
export const EASE = "cubic-bezier(.16,1,.3,1)";      // the tour's easing

// Stacking: the App's own layers top out at 2000 (a confirm dialog); the tour dim sits at 1800 and
// tooltips the tour lifts at 1850. The director keeps that order and adds its own above it.
export const Z = {
  spot: 1800,            // dim + holes + rings
  shield: 1855,          // swallows stray clicks during the run (above lifted tooltips, below the caption)
  caption: 1860,
  veil: 2147482000,      // Begin screen, closing card
  dock: 2147483000,      // controls
  modal: 2147483100,     // exit confirm, chapter menu
  badge: 2147483600,     // the simulation badge: always on top, never fades
};

export const CSS = `
@keyframes simDirIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes simDirFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes simDirSpin { to { transform: rotate(360deg); } }
@keyframes simDirPulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes simDirBreathe { 0%,100% { box-shadow: 0 0 0 0 rgba(216,152,64,.0), 0 18px 50px rgba(0,0,0,.45); }
  50% { box-shadow: 0 0 0 4px rgba(216,152,64,.10), 0 18px 50px rgba(0,0,0,.45); } }
.sim-dir-btn { transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease, opacity .15s ease; }
.sim-dir-btn:hover:not(:disabled) { background: rgba(216,152,64,.16) !important; border-color: ${GOLD} !important; color: #fff !important; }
.sim-dir-btn:active:not(:disabled) { transform: translateY(1px); }
.sim-dir-btn:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
.sim-dir-btn:disabled { cursor: not-allowed; opacity: .45; }
.sim-dir-caption-text { transition: opacity .25s ease; }
/* The portal's own assistant launcher is never shown in the simulation (the assistant is not
   available in the presentation: its edge function is refused by the simulated backend). */
html[data-pmo-sim] [data-tour="assistant-launcher"] { display: none !important; }
/* The portal's own Simulation button has no use inside the simulation. */
html[data-pmo-sim] [data-tour="sim-launch"] { display: none !important; }
/* A chart tooltip with a backdrop blur is not painted inside a spotlight hole (seen in Chromium); its
   background is opaque, so without the blur it looks the same. */
html[data-pmo-sim] .recharts-tooltip-wrapper * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
@keyframes simDirFold { from { opacity: 1; transform: none; } to { opacity: 0; transform: var(--sim-fold, translate(-30vw, 30vh) scale(.35)); } }
@media (prefers-reduced-motion: reduce) {
  [data-sim-ui] * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;

let injected = false;
export function useDirectorStyles() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.setAttribute("data-sim-ui", "styles");
  el.textContent = CSS;
  document.head.appendChild(el);
}
