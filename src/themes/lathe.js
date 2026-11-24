// Lathe & Lume. Not the dial but the movement: matte graphite bridges with Geneva stripes, a polished gold bevel
// on each top edge, a balance wheel that swings slowly at the foot of the sidebar, and icons that charge with
// lume under the hand and decay. Once per session the movement is wound: a glint runs across the header.
import { svg, font, chrome, live } from "./kit.js";

export default function lathe() {
  const K = "lathe", H = `html[data-theme="${K}"]`;
  const BEVEL = "rgba(242,207,140,0.45)", LUME = "#C8F5E9";
  const cotes = "repeating-linear-gradient(115deg, rgba(255,255,255,0.022) 0 14px, rgba(255,255,255,0) 14px 28px)";
  const cotesSide = "repeating-linear-gradient(115deg, rgba(255,255,255,0.020) 0 11px, rgba(0,0,0,0.035) 11px 13px, rgba(255,255,255,0) 13px 24px)";
  // a balance wheel: rim, four arms, hub, timing screws (a watch part, not a star)
  const wheel = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='-100 -100 200 200'><g fill='none' stroke='#F2CF8C'>
<circle r='84' stroke-width='5' stroke-opacity='.30'/><circle r='76' stroke-width='1' stroke-opacity='.22'/>
<path d='M0-76V76M-76 0H76' stroke-width='4' stroke-opacity='.26'/><circle r='12' stroke-width='3' stroke-opacity='.32'/><circle r='3' fill='#F2CF8C' fill-opacity='.35' stroke='none'/>
<g fill='#F2CF8C' fill-opacity='.28' stroke='none'><circle cx='0' cy='-90' r='4'/><circle cx='0' cy='90' r='4'/><circle cx='-90' cy='0' r='4'/><circle cx='90' cy='0' r='4'/><circle cx='63.6' cy='-63.6' r='3'/><circle cx='-63.6' cy='63.6' r='3'/><circle cx='63.6' cy='63.6' r='3'/><circle cx='-63.6' cy='-63.6' r='3'/></g></g></svg>`);
  const glint = "linear-gradient(105deg, transparent 42%, rgba(242,207,140,0.10) 47%, rgba(255,240,210,0.22) 50%, rgba(242,207,140,0.10) 53%, transparent 58%)";

  return {
    key: K, name: "Lathe & Lume", mode: "dark",
    blurb: "A watch movement: graphite with Geneva stripes, a gold bevel, a balance wheel and lume under the hand.",
    swatch: { side: "#1A1C1F", page: "#121315", hero: "#0F1113", accent: "#F2CF8C", line: LUME },
    fonts: [font("Geist", "geist.woff2", "100 900"), font("Geist Mono", "geist-mono.woff2", "100 900")],
    font: { display: "'Geist', 'Inter', sans-serif", body: "'Geist', 'Inter', sans-serif", mono: "'Geist Mono', ui-monospace, monospace" },
    type: { display: { fontWeight: 600, letterSpacing: "-0.03em" }, metric: { fontWeight: 560, letterSpacing: "-0.03em" }, metricXL: { fontWeight: 560, letterSpacing: "-0.035em" }, h1: { fontWeight: 600, letterSpacing: "-0.02em" } },
    r: { sm: 4, md: 7, lg: 9, xl: 12 },
    data: { positive: "#9CD7E2", info: "#79B4EC", warning: "#F7EE9D", danger: "#E45679", neutral: "#9AA1AA", violet: "#B1A4EE", cyan: "#5CC7CF" },
    tokens: {
      page: "#121315", pageAlt: "#0D0E10", surface: "#1A1C1F", surfaceRaised: "#212327", surfaceHi: "#282B30",
      surfaceFloat: "#212327", surfaceOver: "rgba(26,28,31,0.99)",
      sidebar: "linear-gradient(180deg, #23262A 0%, #1A1C1F 48%, #111214 100%)",
      sidebarFg: "rgba(242,241,238,0.76)", sidebarFgSoft: "rgba(242,241,238,0.58)", sidebarFgOn: "#FFFFFF",
      sidebarBorder: "rgba(242,207,140,0.16)", sidebarHover: "rgba(255,255,255,0.045)", header: "rgba(18,19,21,0.95)",
      border: "rgba(255,255,255,0.07)", borderStrong: "rgba(255,255,255,0.13)", borderAccent: "rgba(224,169,74,0.5)",
      text: "#F2F1EE", textSoft: "#CFCDC8", muted: "#B4B1AA", dim: "#ABA8A1",
      inputBg: "#16181B", inputFocus: "#E0A94A", rowHover: "rgba(224,169,74,0.05)", rowActive: "rgba(224,169,74,0.10)",
      shadow: "inset 0 1px 0 rgba(242,207,140,0.22), 0 10px 26px -14px rgba(0,0,0,0.8)",
      shadowLg: "inset 0 1px 0 rgba(242,207,140,0.3), 0 26px 50px -20px rgba(0,0,0,0.85)",
      goldText: "#EBC57A", cursorLight: "rgba(242,207,140,0.05)", cursorLightHero: "rgba(242,207,140,0.10)",
      glowRingHover: (c) => `inset 0 1px 0 rgba(242,207,140,0.5), 0 0 0 1px ${c}44, 0 18px 40px -18px rgba(0,0,0,0.9)`,
      ambient: "none",
      hero: `radial-gradient(ellipse 40% 140% at var(--lx, 80%) 0%, rgba(242,207,140,0.10), transparent 60%), linear-gradient(180deg, #16181B 0%, #0E0F11 100%)`,
      heroBorder: "rgba(242,207,140,0.28)", heroAccent: "#F0CB86", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#24272B",
      navActive: "linear-gradient(180deg, #2E3237 0%, #24272B 100%)",
      navShadow: `inset 0 1px 0 ${BEVEL}, inset 0 -1px 0 rgba(0,0,0,0.5), 0 8px 16px -10px rgba(0,0,0,0.9)`, navOn: "#FFFFFF",
      rail: "linear-gradient(180deg, #FFE2A6, #C9973F)", railGlow: "0 0 8px rgba(242,207,140,0.5)",
      tile: "rgba(0,0,0,0.35)", tileExtra: "box-shadow: inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06);",
      icon: LUME, iconExtra: "filter: drop-shadow(0 0 4px rgba(170,250,225,0.75));",
      hoverIcon: LUME, hoverTile: "rgba(0,0,0,0.25)",
      tabOn: "#F2CF8C", tabArt: `background: ${cotesSide};`, tabExtra: `box-shadow: inset 0 1px 0 ${BEVEL}, 0 -8px 24px -8px rgba(0,0,0,0.6) !important;`,
    }) + `
${H} body { background: #121315 !important; }
/* lume: icons charge under the hand and decay slowly afterwards */
${H} [data-sidebar] [data-nav]:hover > div svg { filter: drop-shadow(0 0 5px rgba(170,250,225,0.85)); transition: stroke .15s ease, filter .15s ease; }
/* sidebar: Geneva stripes, a gold bevel down the edge, and a balance wheel swinging at the foot */
${H} [data-sidebar] { box-shadow: inset -1px 0 0 ${BEVEL}; }
${H} [data-sidebar]::before { background: ${cotesSide}; }
${H} [data-sidebar]::after { inset: auto auto 18px -112px; width: 220px; height: 220px; background: ${wheel} center / 200px 200px no-repeat; opacity: .42;
  transform-origin: 50% 50%; animation: lmBalance 5.2s ease-in-out infinite alternate; }
@keyframes lmBalance { from { transform: rotate(-38deg) } to { transform: rotate(38deg) } }
/* a light that glides across the stripes now and then, like a turned part catching the lamp */
${H} [data-sidebar] > nav::before { content: ""; position: absolute; inset: 0 -120%; z-index: -1; pointer-events: none; background: ${glint}; animation: lmGlint 16s ease-in-out infinite; will-change: transform; }
@keyframes lmGlint { 0%, 62% { transform: translateX(-38%); opacity: 0 } 66% { opacity: 1 } 84% { transform: translateX(38%); opacity: 1 } 88%, 100% { transform: translateX(38%); opacity: 0 } }
${H} [data-sidebar] > nav { overflow-x: hidden; }
${H} [data-sidebar] > [data-tour="brand"] { box-shadow: 0 1px 0 ${BEVEL}; border-bottom-color: rgba(0,0,0,0.6) !important; }
${H}[data-arrive] [data-sidebar]::after { animation: lmWindUp 1.6s cubic-bezier(.2,.8,.2,1) both, lmBalance 5.2s 1.6s ease-in-out infinite alternate; }
@keyframes lmWindUp { from { transform: rotate(-260deg); opacity: 0 } to { transform: rotate(-38deg); opacity: .42 } }
${H} [data-topbar] { box-shadow: inset 0 -1px 0 rgba(0,0,0,0.6), 0 1px 0 rgba(242,207,140,0.18) !important; }
/* the hero: stripes only behind the right half, a bevel on the top edge, an occasional glint, figures on plain graphite */
${H} [data-tour="hero"] { box-shadow: inset 0 1px 0 rgba(242,207,140,0.45), 0 30px 60px -30px rgba(0,0,0,0.9) !important; }
${H} [data-tour="hero"] > .pmo-scan::before { background: ${cotes}; -webkit-mask: linear-gradient(90deg, transparent 45%, #000 80%); mask: linear-gradient(90deg, transparent 45%, #000 80%); }
${H} [data-tour="hero"] > .pmo-scan::after { inset: 0 -100%; background: ${glint}; opacity: 0; animation: lmHeroGlint 14s ease-in-out infinite; will-change: transform; border-radius: 0; }
@keyframes lmHeroGlint { 0%, 70% { transform: translateX(-40%); opacity: 0 } 74% { opacity: 1 } 90% { transform: translateX(40%); opacity: 1 } 94%, 100% { transform: translateX(40%); opacity: 0 } }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { animation: lmWind 1.8s cubic-bezier(.5,0,.2,1) both; }
@keyframes lmWind { 0% { opacity: 1; transform: translateX(-40%) } 100% { opacity: 0; transform: translateX(40%) } }
${H} [data-tour="projects-hero"]::before { background: ${cotes}; -webkit-mask: linear-gradient(90deg, transparent 50%, #000); mask: linear-gradient(90deg, transparent 50%, #000); }
${H} [data-tour="kpi-strip"] > div > div { background-image: ${cotes} !important; }
${H} table thead th { border-bottom: 1px solid rgba(242,207,140,0.3) !important; color: #CFCDC8 !important; }
${H} table tbody td { border-bottom: 1px solid rgba(255,255,255,0.05) !important; }
${H} .recharts-bar-rectangle path { stroke: rgba(242,207,140,0.4); stroke-width: 1px; }
/* sign-in: the photograph in graphite */
${H} [data-login]::after { background: #808080; mix-blend-mode: saturation; opacity: .88; }
`,
    live(o) { live(o, 1800, 1600); },
  };
}
