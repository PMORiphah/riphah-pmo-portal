// Drawing Office. Every capital project begins as a drawing set: daylight drafting paper, navy ink,
// a cyanotype sidebar with a drafting grid and a scale rule, a plotter carriage that crosses it slowly,
// and a title block at the foot of the dashboard header that a plotter pen draws once per session.
import { svg, font, chrome, live } from "./kit.js";

export default function drawing() {
  const K = "drawing", H = `html[data-theme="${K}"]`;
  const INK = "#123C5C", INK2 = "#0E2A40", PAPER = "#F7F9F7", GOLD = "#E0A94A";
  const gridPaper = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M40 0H0V40' fill='none' stroke='#123C5C' stroke-opacity='.07'/><path d='M20 0V40M0 20H40' fill='none' stroke='#123C5C' stroke-opacity='.03'/></svg>`);
  // white drafting grid for the cyanotype sidebar: 16 px cells, a stronger line every 80 px
  const gridCyan = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><g fill='none' stroke='#fff'><path d='M16 0V80M32 0V80M48 0V80M64 0V80M0 16H80M0 32H80M0 48H80M0 64H80' stroke-opacity='.045'/><path d='M80 0H0V80' stroke-opacity='.09'/></g></svg>`);
  // a scale rule down the sidebar's right edge
  const ruler = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='12' height='40'><g stroke='#fff' stroke-opacity='.32'><path d='M12 .5H3M12 8.5H8M12 16.5H8M12 24.5H8M12 32.5H8M12 20.5H6'/></g></svg>`);
  // a generic three-bay elevation with axis bubbles and a dimension string (never a real building)
  const elevation = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='244' height='210' viewBox='0 0 244 210'><g opacity='.5'><g fill='none' stroke='#fff' stroke-width='1'>
<path d='M14 186H230' stroke-opacity='.55' stroke-width='1.4'/><path d='M8 192H236' stroke-opacity='.25' stroke-dasharray='6 3'/>
<path d='M40 186V70M98 186V70M156 186V70M214 186V70' stroke-opacity='.42'/><path d='M34 70H220M34 108H220M34 146H220' stroke-opacity='.42'/>
<path d='M30 70L122 34L224 70' stroke-opacity='.5'/><rect x='56' y='120' width='26' height='20' stroke-opacity='.3'/><rect x='114' y='120' width='26' height='20' stroke-opacity='.3'/><rect x='172' y='120' width='26' height='20' stroke-opacity='.3'/>
<rect x='56' y='82' width='26' height='20' stroke-opacity='.3'/><rect x='114' y='82' width='26' height='20' stroke-opacity='.3'/><rect x='172' y='82' width='26' height='20' stroke-opacity='.3'/><rect x='116' y='156' width='22' height='30' stroke-opacity='.38'/>
<path d='M40 202H214M40 198V206M98 198V206M156 198V206M214 198V206' stroke-opacity='.35'/><path d='M37 205l6-6M95 205l6-6M153 205l6-6M211 205l6-6' stroke-opacity='.5'/>
<path d='M40 64V14M98 64V14M156 64V14M214 64V14' stroke-opacity='.18' stroke-dasharray='8 3 2 3'/>
<circle cx='40' cy='10' r='7' stroke-opacity='.45'/><circle cx='98' cy='10' r='7' stroke-opacity='.45'/><circle cx='156' cy='10' r='7' stroke-opacity='.45'/><circle cx='214' cy='10' r='7' stroke-opacity='.45'/></g>
<g fill='#fff' fill-opacity='.5' font-family='monospace' font-size='8' text-anchor='middle'><text x='40' y='13'>A</text><text x='98' y='13'>B</text><text x='156' y='13'>C</text><text x='214' y='13'>D</text></g></g></svg>`);
  // title block band at the foot of the hero: a dimension string with axis bubbles
  const band = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='30' viewBox='0 0 1200 30'><g fill='none' stroke='#123C5C' stroke-opacity='.55' stroke-width='1'>
<path d='M0 15H1200'/><path d='M60 9V21M300 9V21M540 9V21M780 9V21M1020 9V21' stroke-width='1.2'/>
<path d='M56 19L64 11M296 19L304 11M536 19L544 11M776 19L784 11M1016 19L1024 11' stroke-width='1.4'/></g>
<g fill='#F7F9F7' stroke='#123C5C' stroke-opacity='.6'><circle cx='180' cy='15' r='9'/><circle cx='420' cy='15' r='9'/><circle cx='660' cy='15' r='9'/><circle cx='900' cy='15' r='9'/><circle cx='1140' cy='15' r='9'/></g>
<g fill='#123C5C' fill-opacity='.7' font-family='monospace' font-size='9' text-anchor='middle'><text x='180' y='18'>A</text><text x='420' y='18'>B</text><text x='660' y='18'>C</text><text x='900' y='18'>D</text><text x='1140' y='18'>E</text></g></svg>`);
  const carriageHead = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='14' height='30'><path d='M7 4L12 13H2Z' fill='#B8842E'/><path d='M7 13V26' stroke='#B8842E' stroke-width='1.2'/></svg>`);
  const titleBlock = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='244' height='14'><g fill='none' stroke='#fff' stroke-opacity='.22'><path d='M0 .5H244M0 13.5H244M60.5 0V14M128.5 0V14M196.5 0V14'/><path d='M8 7H50M70 7H118M138 7H186M204 7H236' stroke-opacity='.12'/></g></svg>`);

  return {
    key: K, name: "Drawing Office", mode: "light",
    blurb: "Drafting paper and navy ink; a cyanotype sidebar with a scale rule and a plotter carriage.",
    swatch: { side: "#123F62", page: "#EDF1F0", hero: "#F7F9F7", accent: GOLD, line: INK },
    fonts: [font("Archivo", "archivo.woff2", "100 900"), font("Plex Mono", "plex-mono-500.woff2", "500")],
    font: { display: "'Archivo', 'Inter', sans-serif", mono: "'Plex Mono', ui-monospace, monospace" },
    type: { display: { fontStretch: "88%", letterSpacing: "-0.01em" }, h1: { fontStretch: "92%" }, label: { fontFamily: "'Archivo', sans-serif", fontStretch: "84%", letterSpacing: "0.12em", fontWeight: 650 } },
    r: { sm: 2, md: 4, lg: 6, xl: 8 },
    data: { positive: "#3092A6", info: "#2C7BC4", warning: "#CE6911", danger: "#84153A", neutral: "#6B7C8C", violet: "#5B4FB5", cyan: "#1D8A9A" },
    dataText: { positive: "#1E6E7E", info: "#1A5F99", warning: "#8F4A0A", danger: "#84153A", neutral: "#46576A", violet: "#463C9A", cyan: "#156A76" },
    tokens: {
      page: "#EDF1F0", pageAlt: "#E4EAE9", surface: "#FBFCFA", surfaceRaised: "#FFFFFF", surfaceHi: "#F4F7F6",
      surfaceFloat: "#FBFCFA", surfaceOver: "rgba(251,252,250,0.99)",
      sidebar: "linear-gradient(180deg, #17507B 0%, #123F62 45%, #0C2C47 100%)",
      sidebarFg: "rgba(255,255,255,0.80)", sidebarFgSoft: "rgba(255,255,255,0.70)", sidebarFgOn: "#FFFFFF",
      sidebarBorder: "rgba(255,255,255,0.16)", sidebarHover: "rgba(255,255,255,0.07)", sidebarName: "#FFFFFF", sidebarLogoFilter: "brightness(0) invert(1)",
      header: "rgba(237,241,240,0.95)",
      border: "rgba(18,60,92,0.17)", borderStrong: "rgba(18,60,92,0.34)", borderAccent: "rgba(18,60,92,0.55)",
      text: INK2, textSoft: "#2F4C66", muted: "#475E74", dim: "#4C6278", onAccent: "#FFFFFF",
      inputBg: "#FFFFFF", inputBorder: "rgba(18,60,92,0.28)", inputFocus: INK,
      rowAlt: "rgba(18,60,92,0)", rowHover: "rgba(44,123,196,0.07)", rowActive: "rgba(44,123,196,0.12)",
      shadowSm: "none", shadow: "0 1px 0 rgba(18,60,92,0.10)", shadowLg: "0 2px 0 rgba(18,60,92,0.12), 0 18px 40px -24px rgba(18,60,92,0.35)",
      wash: "12", washStrong: "1E", badge: "1A", ring: "55", glow: "30",
      goldText: "#7A5414", cursorLight: "rgba(44,123,196,0.05)", cursorLightHero: "rgba(44,123,196,0.06)",
      glowSoft: (c) => `0 0 0 1px ${c}40`, glowRingHover: (c) => `0 0 0 1px ${c}80, 0 0 0 4px ${c}14`,
      ambient: gridPaper,
      hero: `${gridPaper} 0 0 / 40px 40px, ${PAPER}`,
      heroBorder: "rgba(18,60,92,0.55)", heroFg: INK2, heroFgSoft: "#2F4C66", heroFgMuted: "#3E566E", heroFgDim: "#4C6278",
      heroDivider: "rgba(18,60,92,0.22)", heroAccent: "#7A5414", heroMotifA: "transparent", heroMotifB: "transparent",
      heroGlowA: "transparent", heroGlowB: "transparent", glass: "#FBFCFA",
    },
    css: chrome(K, {
      tip: "#FFFFFF",
      navActive: "linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))",
      navShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)", navOn: "#FFFFFF",
      rail: GOLD, railGlow: "none", railExtra: "border-radius: 0 !important; width: 3px !important; top: 0 !important; bottom: 0 !important;",
      tile: "rgba(255,255,255,0.08)", tileExtra: "outline: 1px solid rgba(255,255,255,0.28); outline-offset: -1px;",
      icon: "#F4CF86", hoverIcon: "#D4E8FF", hoverTile: "rgba(255,255,255,0.05)",
      tabOn: "#F4CF86", tabArt: `background: ${gridCyan} 0 0 / 80px 80px;`,
    }) + `
${H} body { background: ${gridPaper}, #EDF1F0 !important; }
${H} [data-sidebar] [data-nav] { border-radius: 2px !important; }
/* sidebar: drafting grid, scale rule on the right edge, an elevation at the foot */
${H} [data-sidebar]::before {
  background: ${ruler} right 0 top 0 / 12px 40px repeat-y, ${elevation} center bottom 70px / 244px 210px no-repeat, ${gridCyan} 0 0 / 80px 80px; }
/* the plotter carriage: a fine line with a gold head crosses the sheet top to bottom, slowly; it rests while you use the sidebar */
${H} [data-sidebar]::after { top: 0; height: 100%;
  background: ${carriageHead} 10px 0 / 14px 30px no-repeat,
    linear-gradient(180deg, transparent 0 12px, rgba(255,255,255,0.36) 12px 13px, transparent 13px),
    linear-gradient(180deg, transparent 0, rgba(140,200,255,0.10) 0, transparent 12px);
  transform: translateY(-40px); animation: dwCarriage 42s cubic-bezier(.45,.05,.55,.95) infinite; opacity: .9; }
@keyframes dwCarriage { 0% { transform: translateY(-40px); opacity: 0 } 6% { opacity: .9 } 50% { transform: translateY(calc(100% - 140px)); opacity: .9 } 56% { opacity: 0 } 100% { transform: translateY(calc(100% - 140px)); opacity: 0 } }
${H} [data-sidebar][data-near]::after { animation-play-state: paused; opacity: .35; transition: opacity .4s ease; }
/* your hand on the sidebar: a gold construction line with dimension ticks follows it */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 9px; z-index: -1; pointer-events: none;
  background: linear-gradient(180deg, transparent 4px, rgba(224,169,74,0.75) 4px 5px, transparent 5px), linear-gradient(90deg, rgba(224,169,74,0.9) 1px, transparent 1px) 0 0 / 24px 9px;
  -webkit-mask: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent); mask: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  translate: 0 calc(var(--sy, -20px) - 4px); opacity: 0; transition: opacity .35s ease, translate .12s linear; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: .8; }
${H} [data-sidebar] > [data-tour="brand"] { box-shadow: 0 3px 0 -2px rgba(255,255,255,0.14); }
/* a title block above the account card */
${H} [data-sidebar] > [data-tour="account-tools"]::before { content: ""; position: absolute; left: 0; right: 0; top: -15px; height: 14px; pointer-events: none; background: ${titleBlock} center / 244px 14px no-repeat; }
/* arriving: the sheet is laid out and the drawing comes up */
${H}[data-arrive] [data-sidebar]::before { animation: dwArrive 1.8s cubic-bezier(.2,.7,.2,1) both; }
@keyframes dwArrive { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
/* top bar: a double drafting rule */
${H} [data-topbar] { border-bottom: 1.5px solid ${INK} !important; box-shadow: 0 3px 0 -1.5px rgba(18,60,92,0.30) !important; }
/* the hero: a sheet with an inner border, a reserved title-block band and construction lines that follow the hand */
${H} [data-tour="hero"] { box-shadow: inset 0 0 0 4px ${PAPER}, inset 0 0 0 5px rgba(18,60,92,0.45) !important; padding-bottom: 50px !important;
  background-image: ${band}, ${gridPaper} !important; background-repeat: no-repeat, repeat !important; background-position: left 14px bottom 10px, 0 0 !important; background-size: calc(100% - 28px) 30px, 40px 40px !important; }
${H} [data-tour="hero"] > .pmo-scan::before { background:
  linear-gradient(to right, transparent calc(var(--lx, -10px) - 0.5px), rgba(184,132,46,0.55) calc(var(--lx, -10px) - 0.5px), rgba(184,132,46,0.55) calc(var(--lx, -10px) + 0.5px), transparent calc(var(--lx, -10px) + 0.5px)),
  linear-gradient(to bottom, transparent calc(var(--ly, -10px) - 0.5px), rgba(44,123,196,0.32) calc(var(--ly, -10px) - 0.5px), rgba(44,123,196,0.32) calc(var(--ly, -10px) + 0.5px), transparent calc(var(--ly, -10px) + 0.5px));
  opacity: 0; transition: opacity .4s ease; will-change: auto; }
${H} [data-tour="hero"][data-lit] > .pmo-scan::before { opacity: 1; }
/* idle: the plotter head waits on the title block and drifts along it */
${H} [data-tour="hero"] > .pmo-scan::after { inset: auto 14px 10px 14px; height: 30px; border-radius: 0;
  background: ${carriageHead} 0 0 / 14px 30px no-repeat; animation: dwHead 48s ease-in-out infinite alternate; }
@keyframes dwHead { from { transform: translateX(150px) } to { transform: translateX(calc(100% - 180px)) } }
/* the moment: once per session the pen draws the title block left to right; figures are never covered */
@property --pen { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { transform: none; background: linear-gradient(90deg, transparent 0 calc(var(--pen) - 1px), ${INK} calc(var(--pen) - 1px) var(--pen), ${PAPER} var(--pen) 100%); animation: dwPlot 2.2s cubic-bezier(.55,.1,.35,1) both; }
@keyframes dwPlot { 0% { opacity: 1; --pen: 0% } 94% { opacity: 1; --pen: 100% } 100% { opacity: 0; --pen: 100% } }
@media (max-width: 719px) {
  ${H} [data-tour="hero"] { padding-bottom: 16px !important; background-image: ${gridPaper} !important; background-size: 40px 40px !important; }
  ${H} [data-tour="hero"] > .pmo-scan::after, ${H} [data-tour="hero"] > .pmo-scan::before { display: none; } }
/* drafting convention: lines break around lettering */
${H} [data-tour="hero"] * { text-shadow: 0 0 2px ${PAPER}, 0 0 4px ${PAPER}; }
${H} [data-tour="projects-hero"] { border-bottom: 1.5px solid ${INK} !important; }
${H} [data-tour="projects-hero"]::before { background: ${band} left 14px bottom 2px / 1200px 30px no-repeat; opacity: .45; }
/* cards are sheets: a fine inner rule */
${H} [data-tour="kpi-strip"] > div > div, ${H} [data-tour="health-cards"] > div { outline: 1px solid rgba(18,60,92,0.10); outline-offset: -5px; }
/* status tags stamped like drawing labels */
${H} main span[style*="border-radius: 999px"], ${H} table span[style*="border-radius: 999px"] { border-radius: 2px !important; font-family: 'Archivo', sans-serif !important; font-stretch: 86%; letter-spacing: .05em; text-transform: uppercase; box-shadow: inset 0 0 0 1px currentColor; }
/* tables are drawing schedules */
${H} table thead th { font-family: 'Archivo', sans-serif !important; font-stretch: 84%; letter-spacing: .1em; border-bottom: 1.5px solid ${INK} !important; }
${H} table tbody td { border-bottom: 1px solid rgba(18,60,92,0.10) !important; }
${H} .recharts-bar-rectangle path { stroke: ${INK}; stroke-width: 1px; stroke-opacity: .55; }
${H} .recharts-cartesian-grid line { stroke-dasharray: 2 4; }
/* sign-in: the photograph becomes a cyanotype */
${H} [data-login]::after { background: linear-gradient(160deg, #2A6FA8 0%, #164E7C 55%, #0C2C47 100%); mix-blend-mode: color; opacity: .9; }
`,
    live(o) { live(o, 2400, 2000); },
  };
}
