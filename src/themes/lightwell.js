// Light Well. Lime-washed brick under a skylight, set like an annual report. The sidebar is a lime wall with a
// shaft of daylight that moves with the hours; a warm pool of light comes up where your hand is; once per
// session the day comes up behind the header.
import { svg, font, chrome, live } from "./kit.js";

export default function lightwell() {
  const K = "lightwell", H = `html[data-theme="${K}"]`;
  const NAVY = "#123C5C";
  const bond = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='32'><g fill='none' stroke='#7A6A55' stroke-opacity='.10'><path d='M0 .5H96M0 16.5H96M.5 0V16M48.5 0V16M24.5 16V32M72.5 16V32'/></g></svg>`);
  const bondSide = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='72' height='24'><g fill='none' stroke='#8A7559' stroke-opacity='.13'><path d='M0 .5H72M0 12.5H72M.5 0V12M36.5 0V12M18.5 12V24M54.5 12V24'/></g></svg>`);

  return {
    key: K, name: "Light Well", mode: "light",
    blurb: "Lime-washed brick under a skylight; a shaft of daylight moves across the sidebar with the hours.",
    swatch: { side: "#F1EDE5", page: "#F3F1EC", hero: "#FBF8F2", accent: "#E0A94A", line: NAVY },
    fonts: [font("Source Serif", "sourceserif.woff2", "200 900")],
    font: { display: "'Source Serif', Georgia, serif" },
    type: { display: { fontWeight: 600, letterSpacing: "-0.015em" }, h1: { fontWeight: 600, fontSize: 24 }, h2: { fontWeight: 600 }, metric: { fontWeight: 600 }, metricXL: { fontWeight: 600 }, label: { letterSpacing: "0.14em" } },
    r: { sm: 3, md: 6, lg: 8, xl: 10 },
    data: { positive: "#3092A6", info: "#2C7BC4", warning: "#CE6911", danger: "#84153A", neutral: "#7E8A94", violet: "#6A5CC4", cyan: "#2A93A0" },
    dataText: { positive: "#1E6E7E", info: "#1A5F99", warning: "#8F4A0A", danger: "#84153A", neutral: "#4F5B66", violet: "#4C3FA4", cyan: "#1C6A74" },
    tokens: {
      page: "#F3F1EC", pageAlt: "#ECE9E2", surface: "#FBFAF7", surfaceRaised: "#FFFFFF", surfaceHi: "#FFFFFF",
      surfaceFloat: "#FFFFFF", surfaceOver: "rgba(255,255,255,0.99)",
      sidebar: "linear-gradient(180deg, #F8F5EE 0%, #F0EBE1 55%, #E8E1D4 100%)",
      sidebarFg: "#46505B", sidebarFgSoft: "#5B636C", sidebarFgOn: NAVY,
      sidebarBorder: "#DDD6C9", sidebarHover: "rgba(18,60,92,0.05)", sidebarName: NAVY, sidebarLogoFilter: "none",
      header: "rgba(243,241,236,0.95)", border: "#E3DED4", borderStrong: "#D3CCBF", borderAccent: "rgba(18,60,92,0.4)",
      text: "#14263A", textSoft: "#3C4A5A", muted: "#555F6B", dim: "#59626E",
      inputBg: "#FFFFFF", inputBorder: "#D9D3C8", inputFocus: NAVY,
      rowAlt: "rgba(122,106,85,0.025)", rowHover: "rgba(224,169,74,0.10)", rowActive: "rgba(224,169,74,0.16)",
      shadowSm: "0 1px 1px rgba(60,45,25,0.06)", shadow: "0 1px 2px rgba(60,45,25,0.06), 0 14px 30px -18px rgba(60,45,25,0.22)",
      goldText: "#7A5414", cursorLight: "rgba(240,190,110,0.14)", cursorLightHero: "rgba(255,215,150,0.32)",
      glowRingHover: (c) => `0 0 0 1px ${c}55, 0 16px 34px -16px rgba(150,110,50,0.35)`,
      ambient: "radial-gradient(ellipse 900px 520px at 72% -12%, rgba(255,226,170,0.45), transparent 62%)",
      hero: `radial-gradient(ellipse 46% 120% at var(--lx, 78%) -10%, rgba(255,222,160,0.55), transparent 64%), ${bond}, linear-gradient(180deg, #FBF8F2 0%, #F2EEE6 100%)`,
      heroBorder: "#E0D9CC", heroFg: NAVY, heroFgSoft: "#3C4A5A", heroFgMuted: "#4E5966", heroFgDim: "#59626E", heroDivider: "#DED7CA",
      heroAccent: "#8A5E12", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#FFFFFF",
      navActive: "#FFFFFF", navShadow: "0 1px 2px rgba(60,45,25,0.08), 0 10px 22px -12px rgba(120,85,35,0.35), inset 0 0 0 1px rgba(224,169,74,0.28)", navOn: NAVY,
      rail: "linear-gradient(180deg, #F2C46E, #C98A2C)", railGlow: "0 0 10px rgba(224,169,74,0.55)",
      tile: "rgba(224,169,74,0.16)", icon: "#9A6514", hoverIcon: NAVY, hoverTile: "rgba(18,60,92,0.06)",
      tabOn: NAVY, tabArt: `background: ${bondSide} 0 0 / 72px 24px;`, tabExtra: "box-shadow: 0 -6px 18px -10px rgba(60,45,25,0.25) !important;",
    }) + `
${H} body { background: #F3F1EC !important; }
/* sidebar: lime-washed brick; a shaft of daylight from the skylight moves slowly across it */
${H} [data-sidebar]::before { background: radial-gradient(ellipse 120% 40% at 50% -6%, rgba(255,232,190,0.9), transparent 70%), ${bondSide} 0 0 / 72px 24px; }
${H} [data-sidebar]::after { inset: -10% -60%;
  background: linear-gradient(104deg, transparent 38%, rgba(255,224,160,0.34) 45%, rgba(255,236,196,0.48) 50%, rgba(255,224,160,0.30) 55%, transparent 62%);
  animation: lwShaft 38s ease-in-out infinite alternate; }
@keyframes lwShaft { from { transform: translateX(-22%) rotate(-2deg) } to { transform: translateX(22%) rotate(2deg) } }
/* a warm pool of light comes up where your hand is */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; left: -20px; right: -20px; top: 0; height: 120px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,214,140,0.55), transparent 70%);
  translate: 0 calc(var(--sy, -200px) - 60px); opacity: 0; transition: opacity .6s ease, translate .2s ease-out; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: 1; }
${H} [data-sidebar] { border-right: 1px solid #DDD6C9 !important; box-shadow: inset -1px 0 0 rgba(255,255,255,0.8); }
${H}[data-arrive] [data-sidebar]::after { animation: lwDawn 2.2s ease-out both, lwShaft 38s 2.2s ease-in-out infinite alternate; }
@keyframes lwDawn { from { opacity: 0; transform: translateX(-30%) rotate(-3deg) } to { opacity: 1; transform: translateX(-22%) rotate(-2deg) } }
${H} [data-topbar] { box-shadow: 0 1px 0 rgba(255,255,255,0.9), 0 8px 20px -16px rgba(60,45,25,0.35) !important; }
/* the hero: the skylight moves across it too, behind the figures */
${H} [data-tour="hero"] { border-top: 3px solid ${NAVY} !important; }
${H} [data-tour="hero"] > .pmo-scan::before { inset: -20% -40%; background: linear-gradient(104deg, transparent 40%, rgba(255,226,170,0.38) 48%, rgba(255,240,205,0.5) 51%, rgba(255,226,170,0.32) 55%, transparent 62%); animation: lwHero 44s ease-in-out infinite alternate; }
@keyframes lwHero { from { transform: translateX(-18%) } to { transform: translateX(26%) } }
${H} [data-tour="projects-hero"]::before { background: radial-gradient(ellipse 40% 140% at 82% -20%, rgba(255,222,160,0.45), transparent 65%); }
/* the day comes up: once per session the shade lifts behind the figures */
${H} [data-tour="hero"] > .pmo-scan::after { background: rgba(70,78,88,0.34); opacity: 0; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { animation: lwDay 2.2s cubic-bezier(.3,.6,.2,1) both; }
@keyframes lwDay { 0% { opacity: 1 } 100% { opacity: 0 } }
${H} [data-tour="page-title"] { font-family: 'Source Serif', Georgia, serif; }
${H} [data-tour="kpi-strip"] > div > div { box-shadow: inset 0 2px 0 rgba(18,60,92,0.85), 0 1px 2px rgba(60,45,25,0.06) !important; }
${H} table thead th { border-bottom: 2px solid ${NAVY} !important; letter-spacing: .12em; }
${H} table tbody tr:nth-child(odd) td { background: rgba(122,106,85,0.025); }
${H} table tbody td { border-bottom: 1px solid #EAE5DB !important; }
${H} table tbody tr { transition: background-color 600ms ease; }
/* sign-in: warm daylight over the campus */
${H} [data-login]::after { background: linear-gradient(180deg, #E8C48C 0%, #C9A06A 60%, #9C7A50 100%); mix-blend-mode: color; opacity: .6; }
`,
    live(o) { live(o, 2200, 2200); },
  };
}
