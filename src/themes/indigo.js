// Indigo Resist. The navy is indigo dye; light is reserved out of it, never painted on, like resist paste.
// Seams are running stitches in gold floss: down the sidebar's edge, under the brand, round the active item.
// The cloth breathes (a paler dye cloud drifts through it); once per session it is lifted from the vat.
import { svg, font, chrome, live } from "./kit.js";

export default function indigo() {
  const K = "indigo", H = `html[data-theme="${K}"]`;
  const FLOSS = "#E0A94A";
  const resist = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='72' height='40'><g fill='none' stroke='#EEF2FA' stroke-opacity='.11' stroke-width='1.6'><path d='M0 20L36 0L72 20L36 40Z'/></g></svg>`);
  // a sidebar cloth: lozenges reserved out of the dye with a small reserved square in each (no stars)
  const resistSide = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='56' height='32'><g fill='none' stroke='#EEF2FA' stroke-width='1.4'><path d='M0 16L28 0L56 16L28 32Z' stroke-opacity='.075'/><path d='M28 12L32 16L28 20L24 16Z' stroke-opacity='.10'/></g></svg>`);
  const stitchH = "repeating-linear-gradient(90deg, rgba(224,169,74,0.62) 0 7px, transparent 7px 12px)";
  const stitchV = "repeating-linear-gradient(180deg, rgba(224,169,74,0.55) 0 7px, transparent 7px 12px)";

  return {
    key: K, name: "Indigo Resist", mode: "dark",
    blurb: "Indigo dye with light reserved out of it; running stitches in gold floss on every seam.",
    swatch: { side: "#1A2A5E", page: "#0F1730", hero: "#22366E", accent: FLOSS, line: FLOSS },
    fonts: [font("Spectral", "spectral-500.woff2", "500"), font("Spectral", "spectral-400i.woff2", "400", "italic")],
    font: { display: "'Spectral', Georgia, serif" },
    type: { display: { fontWeight: 500 }, h1: { fontWeight: 500, fontSize: 23 }, metric: { fontFamily: "'Inter', sans-serif", fontWeight: 650 }, metricXL: { fontFamily: "'Inter', sans-serif", fontWeight: 650 } },
    r: { sm: 3, md: 6, lg: 8, xl: 10 },
    data: { positive: "#9CD7E2", info: "#8EC0F2", warning: "#F7EE9D", danger: "#E9637F", neutral: "#A3ADC2", violet: "#C2B3F5", cyan: "#6CCFD3" },
    tokens: {
      page: "#0F1730", pageAlt: "#0B1126", surface: "#16213F", surfaceRaised: "#1C2A4D", surfaceHi: "#23335B",
      surfaceFloat: "#1C2A4D", surfaceOver: "rgba(22,33,63,0.99)",
      sidebar: "linear-gradient(180deg, #24367A 0%, #1B2A61 46%, #121C45 100%)",
      sidebarFg: "rgba(238,242,250,0.80)", sidebarFgSoft: "rgba(238,242,250,0.62)", sidebarFgOn: "#FFFFFF",
      sidebarBorder: "rgba(224,169,74,0.20)", sidebarHover: "rgba(238,242,250,0.06)", header: "rgba(15,23,48,0.95)",
      border: "rgba(238,242,250,0.09)", borderStrong: "rgba(238,242,250,0.18)", borderAccent: "rgba(224,169,74,0.5)",
      text: "#EEF2FA", textSoft: "#CBD3E6", muted: "#B3BDD5", dim: "#A9B4CE",
      inputBg: "#111A35", inputFocus: FLOSS, rowHover: "rgba(238,242,250,0.05)", rowActive: "rgba(224,169,74,0.10)",
      goldText: "#EFC77E", cursorLight: "rgba(238,242,250,0.05)", cursorLightHero: "rgba(238,242,250,0.09)",
      glowRingHover: (c) => `0 0 0 1px ${c}55, 0 12px 30px -12px rgba(90,120,220,0.35), 0 2px 8px rgba(0,0,0,0.4)`,
      ambient: "radial-gradient(ellipse 1000px 600px at 20% -10%, rgba(70,100,190,0.18), transparent 60%)",
      hero: `linear-gradient(90deg, #1A2B5A 0%, rgba(26,43,90,0.86) 42%, rgba(26,43,90,0) 74%), radial-gradient(ellipse 50% 100% at var(--lx, 85%) 50%, rgba(238,242,250,0.10), transparent 60%), linear-gradient(140deg, #22366E 0%, #1A2B5A 46%, #132049 100%)`,
      heroBorder: "rgba(224,169,74,0.35)", heroAccent: "#EFC77E", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#1E2C52",
      navActive: "rgba(238,242,250,0.08)", navShadow: "none", navOn: "#FFFFFF",
      navExtra: "outline: 1.5px dashed rgba(224,169,74,0.70); outline-offset: -3px;",
      rail: "transparent", railGlow: "none",
      tile: "rgba(238,242,250,0.10)", icon: "#F2CE85", hoverIcon: "#C9D8FF", hoverTile: "rgba(238,242,250,0.06)",
      tabOn: "#F2CE85", tabArt: `background: ${stitchH} 0 3px / 100% 1.5px no-repeat, ${resistSide} 0 0 / 56px 32px;`,
    }) + `
${H} body { background: #0F1730 !important; }
/* sidebar: the cloth, a running stitch down its edge, and a paler dye cloud breathing through it */
${H} [data-sidebar]::before { background: ${stitchV} right 7px top 0 / 1.5px 100% no-repeat, ${resistSide} 0 0 / 56px 32px; }
${H} [data-sidebar]::after { inset: -20% -40%;
  background: radial-gradient(ellipse 40% 26% at 30% 40%, rgba(120,150,235,0.20), transparent 70%), radial-gradient(ellipse 34% 22% at 70% 72%, rgba(100,190,200,0.10), transparent 70%);
  animation: inCloud 34s ease-in-out infinite alternate; }
@keyframes inCloud { from { transform: translate(-8%, -6%) scale(1) } to { transform: translate(10%, 8%) scale(1.12) } }
/* light reserved where your hand is */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; left: -10px; right: -10px; top: 0; height: 90px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse 50% 45% at 50% 50%, rgba(238,242,250,0.13), transparent 70%);
  translate: 0 calc(var(--sy, -200px) - 45px); opacity: 0; transition: opacity .5s ease, translate .2s ease-out; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: 1; }
${H} [data-sidebar] > [data-tour="brand"] { border-bottom: 0 !important; background: ${stitchH} 18px 100% / calc(100% - 36px) 1.5px no-repeat; }
${H} [data-sidebar] > [data-tour="account-tools"] { border-top: 0 !important; background: ${stitchH} 18px 0 / calc(100% - 36px) 1.5px no-repeat; }
${H}[data-arrive] [data-sidebar]::before { animation: inArrive 1.8s ease-out both; }
@keyframes inArrive { from { opacity: 0 } to { opacity: 1 } }
${H} [data-topbar] { border-bottom: 0 !important; background-image: ${stitchH} !important; background-size: 100% 1.5px !important; background-position: 0 100% !important; background-repeat: no-repeat !important; }
/* the hero: resist lozenges on the right drift very slowly; a stitch runs along the foot */
${H} [data-tour="hero"] > .pmo-scan::before { inset: -40px; background: ${resist} 0 0 / 72px 40px; -webkit-mask: linear-gradient(90deg, transparent 38%, #000 72%); mask: linear-gradient(90deg, transparent 38%, #000 72%); animation: inHero 70s linear infinite; }
@keyframes inHero { from { transform: translate(0, 0) } to { transform: translate(-72px, -40px) } }
${H} [data-tour="projects-hero"]::before { background: ${resist} 0 0 / 72px 40px; -webkit-mask: linear-gradient(90deg, transparent 50%, #000); mask: linear-gradient(90deg, transparent 50%, #000); }
/* lifted from the vat: once per session the dye oxidises from green to blue, behind the figures */
${H} [data-tour="hero"] > .pmo-scan::after { background: ${stitchH} 22px calc(100% - 9px) / calc(100% - 44px) 1.5px no-repeat; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { background: linear-gradient(140deg, rgba(60,143,122,0.9), rgba(46,110,106,0.8) 60%, rgba(40,90,99,0.7)); animation: inOxidise 2.8s ease-out both; }
@keyframes inOxidise { 0% { opacity: .85 } 100% { opacity: 0 } }
${H} [data-tour="kpi-strip"] > div > div { background-image: ${stitchH} !important; background-size: calc(100% - 24px) 1.5px !important; background-repeat: no-repeat !important; background-position: 12px 6px !important; }
${H} table thead th { border-bottom: 0 !important; background-image: ${stitchH}; background-size: 100% 1.5px; background-repeat: no-repeat; background-position: 0 100%; color: #EFC77E !important; }
${H} table tbody td { border-bottom: 1px solid rgba(238,242,250,0.06) !important; }
/* sign-in: the photograph dyed in indigo */
${H} [data-login]::after { background: linear-gradient(150deg, #3A55B0 0%, #24367A 55%, #121C45 100%); mix-blend-mode: color; opacity: .85; }
`,
    live(o) { live(o, 2800, 1800); },
  };
}
