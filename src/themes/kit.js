// Shared pieces for the optional portal themes (24 Nov 2026, /preview/ only).
// Every function here is a plain definition, so a build without themes drops the whole folder.
// Motion rules: transform and opacity only (compositor), slow, nothing moves under reduced motion,
// nothing moves while the tab is hidden (browsers pause CSS animations there), never over text.

export const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

// Fonts are self-hosted OFL files in public/themes/fonts (licences: public/themes/fonts/LICENSES.md).
export const font = (family, file, weight = "100 900", style = "normal") =>
  ({ family, url: `${import.meta.env.BASE_URL}themes/fonts/${file}`, weight, style });

// One passive, rAF-throttled pointer listener (fine pointers only):
//  - html: --px/--py (0..1 of the viewport)
//  - the hero under the pointer: --lx/--ly in px and [data-lit]
//  - the sidebar under the pointer: --sy in px from its top and [data-near]
export function pointer({ calm }) {
  if (calm || !matchMedia("(pointer: fine)").matches) return;
  const html = document.documentElement; let raf = 0, ev = null, lastSide = null, lastHero = null;
  const run = () => {
    raf = 0; const e = ev; if (!e) return;
    html.style.setProperty("--px", (e.clientX / innerWidth).toFixed(3));
    html.style.setProperty("--py", (e.clientY / innerHeight).toFixed(3));
    const t = e.target && e.target.closest ? e.target : null;
    const hero = t && t.closest("[data-tour='hero'],[data-tour='projects-hero'],[data-login]");
    if (hero) { const r = hero.getBoundingClientRect(); hero.style.setProperty("--lx", Math.round(e.clientX - r.left) + "px"); hero.style.setProperty("--ly", Math.round(e.clientY - r.top) + "px"); hero.setAttribute("data-lit", ""); }
    if (lastHero && lastHero !== hero) lastHero.removeAttribute("data-lit");
    lastHero = hero;
    const side = t && t.closest("[data-sidebar],#pmo-bottom-tabs");
    if (side) { const r = side.getBoundingClientRect(); side.style.setProperty("--sy", Math.round(e.clientY - r.top) + "px"); side.style.setProperty("--sx", Math.round(e.clientX - r.left) + "px"); side.setAttribute("data-near", ""); }
    if (lastSide && lastSide !== side) lastSide.removeAttribute("data-near");
    lastSide = side;
  };
  const on = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(run); };
  addEventListener("pointermove", on, { passive: true });
  document.addEventListener("pointerleave", () => { lastSide && lastSide.removeAttribute("data-near"); lastHero && lastHero.removeAttribute("data-lit"); lastSide = lastHero = null; }, { passive: true });
}

// Once per browser session, when `selector` first appears: html[attr] for `ms` milliseconds.
export function once({ calm }, selector, attr, ms, key) {
  if (calm) return;
  try { if (sessionStorage.getItem(key)) return; } catch {}
  const html = document.documentElement;
  const go = () => {
    if (!document.querySelector(selector)) return false;
    html.setAttribute(attr, ""); try { sessionStorage.setItem(key, "1"); } catch {}
    setTimeout(() => html.removeAttribute(attr), ms); return true;
  };
  if (!go()) { const mo = new MutationObserver(() => { if (go()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); }
}

// The usual living layer: pointer, the sidebar arriving once, the hero moment once.
export function live(o, heroMs = 2400, sideMs = 2200) {
  pointer(o);
  once(o, "[data-sidebar]", "data-arrive", sideMs, "pmo-theme-arrive");
  once(o, "[data-tour='hero'],[data-tour='projects-hero']", "data-moment", heroMs, "pmo-theme-moment");
}

// CSS every theme shares. `k` is the theme key, `o` the theme's sidebar and tab-bar colours.
export function chrome(k, o) {
  const H = `html[data-theme="${k}"]`;
  return `
/* today's decoration makes way for the theme's own */
${H} .pmo-aurora, ${H} .pmo-drift, ${H} .pmo-worldlight, ${H} [data-arch], ${H} [data-ribbon] { display: none !important; }
${H} .pmo-scan:not([data-tour="hero"] > .pmo-scan) { display: none !important; }
${H} [data-tour="hero"] > svg[aria-hidden="true"] { display: none !important; }
/* today's endless loops stop: the theme carries the motion, on the compositor */
${H} .pmo-breathe, ${H} .pmo-awaiting, ${H} .pmo-sheen, ${H} .pmo-mote, ${H} .av-aura, ${H} .av-aura2, ${H} svg .pmo-live-dot { animation: none !important; }
${H} .av-root:not(:hover):not(:focus-within) * { animation-play-state: paused !important; }
/* the verdict still breathes, but as a soft halo behind it that only fades and scales (compositor), instead of a
   filter on the text that forced a full repaint and layout every frame */
${H} .pmo-verdict, ${H} .pmo-hot .pmo-verdict { animation: none !important; will-change: auto !important; position: relative; isolation: isolate; }
${H} .pmo-verdict::before { content: ""; position: absolute; inset: -10px -22px; z-index: -1; pointer-events: none; border-radius: 999px;
  background: radial-gradient(closest-side, var(--vg, rgba(224,169,74,0.5)), transparent); opacity: .25; animation: thVerdict 3.6s ease-in-out infinite; will-change: opacity, transform; }
${H} .pmo-hot .pmo-verdict::before { animation-duration: 1.4s; }
@keyframes thVerdict { 0%, 100% { opacity: .2; transform: scale(.95) } 50% { opacity: .55; transform: scale(1.05) } }
/* tooltips and floating panels are solid in every theme */
${H} [role="tooltip"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-color: ${o.tip} !important; }

/* sidebar: its own material, layered art behind the navigation */
/* (the sidebar and the hero become their own layers so the art can sit behind the content; each is lifted above the
   page that follows it, so hover cards that open from inside them still float over everything, as before) */
${H} [data-sidebar] { isolation: isolate; z-index: 70; }
${H} [data-sidebar]::before, ${H} [data-sidebar]::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: -1; }
${H} [data-sidebar]::after { will-change: transform, opacity; }
/* the active item */
${H} [data-sidebar] [data-nav][aria-current="page"] { background: ${o.navActive} !important; box-shadow: ${o.navShadow || "none"} !important; color: ${o.navOn} !important; ${o.navExtra || ""} }
${H} [data-sidebar] [data-nav][aria-current="page"] > span:first-child { background: ${o.rail} !important; box-shadow: ${o.railGlow || "none"} !important; ${o.railExtra || ""} }
${H} [data-sidebar] [data-nav][aria-current="page"] > div { background: ${o.tile} !important; ${o.tileExtra || ""} }
${H} [data-sidebar] [data-nav][aria-current="page"] > div svg { stroke: ${o.icon} !important; ${o.iconExtra || ""} }
${H} [data-sidebar] [data-nav]:not([aria-current]):hover > div { background: ${o.hoverTile || "transparent"} !important; }
${H} [data-sidebar] [data-nav]:not([aria-current]):hover > div svg { stroke: ${o.hoverIcon} !important; }
${H} [data-sidebar] [data-nav] > div svg { transition: stroke .2s ease, filter .9s ease; }
/* phone tab bar: the same material */
${H} #pmo-bottom-tabs { overflow: hidden; isolation: isolate; ${o.tabExtra || ""} }
${H} #pmo-bottom-tabs::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: -1; ${o.tabArt || ""} }
${H} #pmo-bottom-tabs button.pmo-hot { color: ${o.tabOn} !important; }
${H} #pmo-bottom-tabs button.pmo-hot svg { stroke: ${o.tabOn} !important; }
${H} #pmo-bottom-tabs .pmo-live-dot { background: ${o.tabOn} !important; box-shadow: 0 0 8px ${o.tabOn} !important; animation: none !important; }
/* the hero: art and the moment sit behind the figures, never on them */
/* (the dashboard hero's own first layer, .pmo-scan, carries the art and the moment, so they paint under every figure
   without making the hero a separate layer: hover cards that open from it still float over the sticky tabs) */
${H} [data-tour="hero"] > .pmo-scan::before, ${H} [data-tour="hero"] > .pmo-scan::after { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; height: auto; animation: none; background: none; }
${H} [data-tour="hero"] > .pmo-scan::before { will-change: transform; }
${H} [data-tour="projects-hero"]::before { content: ""; position: absolute; inset: 0; pointer-events: none; }
/* sign-in page: the theme's light over the campus photograph */
${H} [data-login]::after { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; }

/* reduced motion: the still frame, no moments */
${H}[data-calm] *, ${H}[data-calm] *::before, ${H}[data-calm] *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
@media (forced-colors: active) {
  ${H} [data-sidebar]::before, ${H} [data-sidebar]::after, ${H} [data-tour="hero"] > .pmo-scan,
  ${H} [data-tour="projects-hero"]::before, ${H} #pmo-bottom-tabs::before, ${H} [data-login]::after,
  ${H} [data-sidebar] [data-tour="brand"]::before, ${H} [data-sidebar] [data-tour="brand"]::after, ${H} [data-sidebar] [data-tour="account-tools"]::before { display: none !important; }
}
@media print {
  ${H} [data-tour="hero"] > .pmo-scan, ${H} [data-tour="projects-hero"]::before { display: none !important; }
  ${H} body { background: #fff !important; }
}
`;
}
