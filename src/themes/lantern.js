// Lantern Skin. A dusk room with a low light budget. The sidebar is a lamp's skin, lit from below: the lamp
// glows softly and unevenly, like a flame behind painted hide; panels light from inside when you come to them;
// once per session the lamps are lit one by one.
import { font, chrome, live } from "./kit.js";

export default function lantern() {
  const K = "lantern", H = `html[data-theme="${K}"]`;
  const AMBER = "#F0B260";
  const skin = "radial-gradient(120% 90% at 50% 110%, rgba(240,178,96,0.10), transparent 60%)";
  // hide grain: a few broad, soft mottles (no dots)
  const hide = "radial-gradient(ellipse 60% 18% at 20% 22%, rgba(255,220,170,0.035), transparent 70%), radial-gradient(ellipse 50% 14% at 80% 48%, rgba(255,220,170,0.03), transparent 70%), radial-gradient(ellipse 70% 20% at 40% 70%, rgba(0,0,0,0.12), transparent 70%)";
  // lamp seams: two faint vertical stitched seams, like the panels of a skin lamp
  const seams = "linear-gradient(90deg, transparent calc(33% - 0.5px), rgba(240,178,96,0.10) calc(33% - 0.5px) calc(33% + 0.5px), transparent calc(33% + 0.5px) calc(67% - 0.5px), rgba(240,178,96,0.10) calc(67% - 0.5px) calc(67% + 0.5px), transparent calc(67% + 0.5px))";

  return {
    key: K, name: "Lantern Skin", mode: "dark",
    blurb: "A dusk room lit by a skin lamp: an uneven warm glow, panels that light up when you come to them.",
    swatch: { side: "#2A211B", page: "#14181F", hero: "#232A36", accent: AMBER, line: AMBER },
    fonts: [font("EB Garamond", "ebgaramond.woff2", "400 800")],
    font: { display: "'EB Garamond', Georgia, serif" },
    type: { display: { fontWeight: 500 }, h1: { fontWeight: 500, fontSize: 25 }, h2: { fontWeight: 600, fontSize: 17 }, metric: { fontFamily: "'Inter', sans-serif", fontWeight: 600 }, metricXL: { fontFamily: "'Inter', sans-serif", fontWeight: 600 } },
    r: { sm: 6, md: 12, lg: 16, xl: 20 },
    data: { positive: "#9CD7E2", info: "#86BBEA", warning: "#F7EE9D", danger: "#E45679", neutral: "#A8A39B", violet: "#BDAEF0", cyan: "#67CACC" },
    tokens: {
      page: "#14181F", pageAlt: "#0F1218", surface: "#1C2028", surfaceRaised: "#232831", surfaceHi: "#2A303A",
      surfaceFloat: "#232831", surfaceOver: "rgba(28,32,40,0.99)",
      sidebar: "linear-gradient(180deg, #241C17 0%, #2B211A 55%, #3A2A1C 100%)",
      sidebarFg: "rgba(243,230,212,0.80)", sidebarFgSoft: "rgba(243,230,212,0.62)", sidebarFgOn: "#FFF3E0",
      sidebarBorder: "rgba(240,178,96,0.16)", sidebarHover: "rgba(240,178,96,0.07)", sidebarName: "#FFF3E0",
      header: "rgba(20,24,31,0.95)", border: "rgba(240,210,170,0.08)", borderStrong: "rgba(240,210,170,0.16)", borderAccent: "rgba(240,178,96,0.5)",
      text: "#F3EEE6", textSoft: "#D6CEC2", muted: "#BDB4A7", dim: "#B3AA9D",
      inputBg: "#181C23", inputFocus: AMBER, rowHover: "rgba(240,178,96,0.07)", rowActive: "rgba(240,178,96,0.12)",
      shadow: "0 10px 26px -14px rgba(0,0,0,0.75)", goldText: "#F0C47E", cursorLight: "rgba(240,178,96,0.09)", cursorLightHero: "rgba(240,178,96,0.16)",
      glowRingHover: (c) => `inset 0 0 0 1px rgba(240,178,96,0.28), inset 0 -30px 60px -30px rgba(240,178,96,0.30), 0 16px 40px -20px rgba(240,140,60,0.35)`,
      ambient: "none",
      hero: `radial-gradient(ellipse 55% 120% at var(--lx, 70%) 100%, rgba(240,178,96,0.24), transparent 65%), linear-gradient(180deg, #232A36 0%, #1B2029 100%)`,
      heroBorder: "rgba(240,178,96,0.25)", heroAccent: "#F3C985", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#262B34",
      navActive: "radial-gradient(130% 160% at 0% 50%, rgba(240,178,96,0.30), rgba(240,178,96,0.07) 62%, transparent 100%)",
      navShadow: "inset 0 0 0 1px rgba(240,178,96,0.22), 0 0 26px -8px rgba(240,150,70,0.45)", navOn: "#FFF3E0",
      rail: "linear-gradient(180deg, #FFD9A0, #E2913A)", railGlow: "0 0 14px rgba(240,160,80,0.85)",
      tile: "rgba(240,178,96,0.16)", icon: "#FFD39A", iconExtra: "filter: drop-shadow(0 0 5px rgba(255,180,90,0.7));",
      hoverIcon: "#F6C987", hoverTile: "rgba(240,178,96,0.08)",
      tabOn: "#FFD39A", tabArt: `background: radial-gradient(60% 140% at 50% 140%, rgba(240,160,80,0.30), transparent 70%);`,
    }) + `
${H} body { background: #14181F !important; }
/* sidebar: the lamp's skin, seams and grain, lit from below by a soft, uneven flame */
${H} [data-sidebar]::before { background: ${seams}, ${hide}; }
${H} [data-sidebar]::after { inset: auto -30% -18% -30%; height: 70%; border-radius: 50%;
  background: radial-gradient(ellipse 50% 50% at 50% 70%, rgba(255,170,80,0.32), rgba(240,140,60,0.12) 45%, transparent 72%);
  transform-origin: 50% 90%; animation: ltFlame 9s ease-in-out infinite; }
@keyframes ltFlame { 0% { opacity: .82; transform: scale(1) } 18% { opacity: 1; transform: scale(1.04, 1.06) } 31% { opacity: .9; transform: scale(.99, 1.02) } 47% { opacity: .97; transform: scale(1.03, 1.05) } 63% { opacity: .84; transform: scale(1, .99) } 80% { opacity: 1; transform: scale(1.05, 1.07) } 100% { opacity: .82; transform: scale(1) } }
/* a lamp you carry: warm light comes with your hand */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; left: -30px; right: -30px; top: 0; height: 130px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse 55% 50% at 40% 50%, rgba(255,180,96,0.22), transparent 72%);
  translate: 0 calc(var(--sy, -300px) - 65px); opacity: 0; transition: opacity .7s ease, translate .25s ease-out; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: 1; }
${H}[data-arrive] [data-sidebar]::after { animation: ltLight 2.4s ease-out both, ltFlame 9s 2.4s ease-in-out infinite; }
@keyframes ltLight { 0% { opacity: 0; transform: scale(.6) } 40% { opacity: .5 } 60% { opacity: .3 } 100% { opacity: .82; transform: scale(1) } }
${H} [data-topbar] { box-shadow: 0 1px 0 rgba(240,178,96,0.14), 0 12px 30px -20px rgba(240,150,70,0.35) !important; }
/* the hero: an uneven lamp glow from below, behind the figures */
${H} [data-tour="hero"] > .pmo-scan::before { inset: auto 0 -40% 10%; height: 120%; background: radial-gradient(ellipse 45% 45% at 60% 80%, rgba(240,170,90,0.20), transparent 70%); transform-origin: 60% 100%; animation: ltFlame 11s ease-in-out infinite; }
${H} [data-tour="projects-hero"]::before { background: radial-gradient(ellipse 40% 120% at 80% 130%, rgba(240,170,90,0.20), transparent 70%); }
/* the lamps are lit: once per session the room comes up from dark, behind the figures */
${H} [data-tour="hero"] > .pmo-scan::after { background: #0B0D12; opacity: 0; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { animation: ltLit 2.4s cubic-bezier(.4,.1,.2,1) both; }
@keyframes ltLit { 0% { opacity: .9 } 30% { opacity: .55 } 42% { opacity: .7 } 100% { opacity: 0 } }
${H} [data-tour="kpi-strip"] > div > div { background-image: ${skin} !important; transition: box-shadow 600ms ease; }
${H}[data-moment] [data-tour="kpi-strip"] > div > div { animation: ltLamp 1.4s ease-out both; }
${H}[data-moment] [data-tour="kpi-strip"] > div:nth-child(2) > div { animation-delay: .15s } ${H}[data-moment] [data-tour="kpi-strip"] > div:nth-child(3) > div { animation-delay: .3s }
${H}[data-moment] [data-tour="kpi-strip"] > div:nth-child(4) > div { animation-delay: .45s } ${H}[data-moment] [data-tour="kpi-strip"] > div:nth-child(5) > div { animation-delay: .6s }
@keyframes ltLamp { 0% { box-shadow: inset 0 0 0 1px rgba(240,178,96,0) } 40% { box-shadow: inset 0 0 0 1px rgba(240,178,96,0.4), inset 0 -40px 60px -30px rgba(240,178,96,0.35) } 100% { box-shadow: inset 0 0 0 1px rgba(240,178,96,0) } }
${H} table thead th { color: #F0C47E !important; border-bottom: 1px solid rgba(240,178,96,0.3) !important; }
${H} table tbody td { border-bottom: 1px solid rgba(240,210,170,0.06) !important; }
/* sign-in: lamplight over the campus at dusk */
${H} [data-login]::after { background: radial-gradient(ellipse 70% 60% at 50% 105%, #F2A24E, transparent 70%), linear-gradient(180deg, #8A5A30 0%, #4A3220 100%); mix-blend-mode: color; opacity: .75; }
`,
    live(o) { live(o, 2400, 2400); },
  };
}
