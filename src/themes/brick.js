// Brick Screen. Daylight through a perforated brick wall (a mason's honeycomb screen, not a star lattice).
// The sidebar is the screen itself, fired brick with lit openings; on the lime-washed page, feathered patches of
// sun fall slanted by the hour and move slowly; your hand moves the sun a little. Once per session the sun comes out.
import { svg, font, chrome, live } from "./kit.js";

export default function brick() {
  const K = "brick", H = `html[data-theme="${K}"]`;
  const NAVY = "#123C5C", SUN = "#FFE3A8";
  // the wall: stretcher-bond mortar lines; a screen of openings runs down the sidebar's right-hand edge only,
  // so labels always sit on plain brick (openings 22 x 10 in a 48 px course, never a dense pattern)
  const mortar = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='32'><g fill='none' stroke='#2A120B' stroke-opacity='.30' stroke-width='1.5'><path d='M0 .75H96M0 16.75H96M.75 0V16M48.75 0V16M24.75 16V32M72.75 16V32'/></g><g fill='none' stroke='#FFE3A8' stroke-opacity='.06'><path d='M0 2.5H96M0 18.5H96'/></g></svg>`);
  const strip = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='44' height='48'><g fill='#2A110A' fill-opacity='.62'><rect x='4' y='6' width='22' height='12' rx='1'/><rect x='18' y='30' width='22' height='12' rx='1'/></g></svg>`);
  const stripLit = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='44' height='48'><g fill='#FFE3A8'><rect x='4' y='6' width='22' height='12' rx='1.5'/><rect x='18' y='30' width='22' height='12' rx='1.5'/></g></svg>`);
  const screen = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60'><g fill='none' stroke='#2A120B' stroke-opacity='.45' stroke-width='2'><path d='M0 1H120M0 31H120M60 1V31M0 31V60M120 31V60'/></g><g fill='#2A110A' fill-opacity='.55'><rect x='6' y='6' width='48' height='20' rx='1'/><rect x='66' y='36' width='48' height='20' rx='1'/></g></svg>`);
  const holes = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60'><g fill='#FFE3A8'><rect x='6' y='6' width='48' height='18' rx='2'/><rect x='66' y='36' width='48' height='18' rx='2'/></g></svg>`);

  return {
    key: K, name: "Brick Screen", mode: "light",
    blurb: "A fired-brick screen with lit openings; feathered patches of sun move slowly across a lime wall.",
    swatch: { side: "#6E3526", page: "#F2EEE7", hero: "#EFE5D2", accent: SUN, line: NAVY },
    fonts: [font("Young Serif", "young-serif.woff2", "400")],
    font: { display: "'Young Serif', Georgia, serif" },
    type: { display: { fontWeight: 400, letterSpacing: "-0.01em" }, h1: { fontWeight: 400, fontSize: 23 }, h2: { fontWeight: 400 }, metric: { fontFamily: "'Inter', sans-serif", fontWeight: 650 }, metricXL: { fontFamily: "'Inter', sans-serif", fontWeight: 650 } },
    r: { sm: 3, md: 5, lg: 7, xl: 9 },
    data: { positive: "#3092A6", info: "#2C7BC4", warning: "#CE6911", danger: "#84153A", neutral: "#7F8890", violet: "#6656BF", cyan: "#2A909B" },
    dataText: { positive: "#1E6E7E", info: "#1A5F99", warning: "#8F4A0A", danger: "#84153A", neutral: "#50585F", violet: "#4A3CA3", cyan: "#1D6971" },
    tokens: {
      page: "#F2EEE7", pageAlt: "#EAE5DC", surface: "#FBF9F5", surfaceRaised: "#FFFFFF", surfaceHi: "#FFFFFF",
      surfaceFloat: "#FFFFFF", surfaceOver: "rgba(255,255,255,0.99)",
      sidebar: "linear-gradient(180deg, #84422F 0%, #6E3526 46%, #55281C 100%)",
      sidebarFg: "rgba(255,244,228,0.84)", sidebarFgSoft: "rgba(255,236,210,0.80)", sidebarFgOn: "#FFFFFF", sidebarBorder: "rgba(255,227,168,0.18)",
      sidebarHover: "rgba(255,227,168,0.08)", sidebarName: "#FFFFFF", sidebarLogoFilter: "brightness(0) invert(1)",
      header: "rgba(242,238,231,0.95)", border: "#E4DED3", borderStrong: "#D2CABC", borderAccent: "rgba(18,60,92,0.4)",
      text: "#162636", textSoft: "#3D4955", muted: "#545E68", dim: "#58616B",
      inputBg: "#FFFFFF", inputBorder: "#D8D1C5", inputFocus: NAVY,
      rowHover: "rgba(255,210,130,0.14)", rowActive: "rgba(255,210,130,0.22)",
      shadow: "0 1px 2px rgba(70,50,25,0.06), 0 12px 26px -16px rgba(70,50,25,0.22)",
      goldText: "#7A5414", cursorLight: "rgba(255,210,130,0.14)", cursorLightHero: "rgba(255,230,170,0.26)",
      glowRingHover: (c) => `0 0 0 1px ${c}55, 0 16px 32px -16px rgba(150,80,40,0.35)`,
      ambient: "none",
      hero: `linear-gradient(180deg, #F3EBDB 0%, #ECDFC8 100%)`,
      heroBorder: "#E1D7C5", heroFg: NAVY, heroFgSoft: "#3D4955", heroFgMuted: "#4E5863", heroFgDim: "#58616B", heroDivider: "#DED3C0",
      heroAccent: "#8A5E12", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#FFFFFF",
      navActive: "linear-gradient(90deg, rgba(255,227,168,0.24), rgba(255,227,168,0.08))",
      navShadow: "inset 0 0 0 1px rgba(255,227,168,0.30), 0 0 22px -6px rgba(255,200,120,0.45)", navOn: "#FFFFFF",
      rail: SUN, railGlow: "0 0 12px rgba(255,214,150,0.8)",
      tile: "rgba(42,17,10,0.35)", icon: SUN, hoverIcon: "#FFF1D2", hoverTile: "rgba(42,17,10,0.25)",
      tabOn: SUN, tabArt: `background: ${mortar} 0 0 / 96px 32px;`,
    }) + `
${H} body { background: #F2EEE7 !important; }
/* sidebar: a fired-brick wall; a screen of openings down the right edge glows as the sun moves behind it */
${H} [data-sidebar]::before { background: ${strip} right 0 top 0 / 44px 48px repeat-y, linear-gradient(90deg, transparent calc(100% - 50px), rgba(42,17,10,0.30) calc(100% - 50px) calc(100% - 48px), transparent calc(100% - 48px)), ${mortar} 0 0 / 96px 32px; }
${H} [data-sidebar]::after { inset: -40% 0 -40% auto; width: 44px;
  background: ${stripLit} 0 0 / 44px 48px;
  -webkit-mask: radial-gradient(ellipse 120% 22% at 50% 50%, #000 15%, transparent 70%); mask: radial-gradient(ellipse 120% 22% at 50% 50%, #000 15%, transparent 70%);
  opacity: .85; filter: drop-shadow(0 0 6px rgba(255,200,120,0.8)); animation: bkSunMove 36s ease-in-out infinite alternate; }
@keyframes bkSunMove { from { transform: translateY(-30%) } to { transform: translateY(30%) } }
/* a warm wash where your hand is, as if sun fell through the screen onto the wall */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; left: -20px; right: -20px; top: 0; height: 120px; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse 55% 45% at 55% 50%, rgba(255,214,150,0.20), transparent 72%);
  translate: 0 calc(var(--sy, -300px) - 60px); opacity: 0; transition: opacity .5s ease, translate .2s ease-out; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: 1; }
${H} [data-sidebar] > [data-tour="brand"], ${H} [data-sidebar] > [data-tour="account-tools"] { background: rgba(85,40,28,0.55); }
${H}[data-arrive] [data-sidebar]::after { animation: bkDawn 2.2s ease-out both, bkSunMove 40s 2.2s ease-in-out infinite alternate; }
@keyframes bkDawn { from { opacity: 0; transform: translateY(-30%) } to { opacity: .85; transform: translateY(-30%) } }
${H} [data-topbar] { box-shadow: inset 0 -2px 0 #84422F !important; }
/* the hero: lime plaster; feathered patches of sun fall on its right side only and move slowly */
${H} [data-tour="hero"] > .pmo-scan::before { inset: -30% -10% -30% 46%; transform-origin: 50% 50%;
  background: ${holes} 0 0 / 120px 60px; filter: blur(5px); opacity: .42;
  -webkit-mask: radial-gradient(ellipse 60% 55% at 60% 50%, #000 10%, transparent 72%); mask: radial-gradient(ellipse 60% 55% at 60% 50%, #000 10%, transparent 72%);
  animation: bkPatch 52s ease-in-out infinite alternate; }
@keyframes bkPatch { from { transform: skewX(-24deg) rotate(-4deg) translateX(-18px) } to { transform: skewX(-20deg) rotate(-3deg) translateX(22px) } }
${H} [data-tour="projects-hero"]::before { inset: -40% -10% -40% 60%; background: ${holes} 0 0 / 120px 60px; filter: blur(3px); opacity: .4; transform: skewX(-24deg);
  -webkit-mask: radial-gradient(ellipse 60% 55% at 60% 50%, #000 20%, transparent 75%); mask: radial-gradient(ellipse 60% 55% at 60% 50%, #000 20%, transparent 75%); }
/* the sun comes out: once per session the shade lifts behind the figures */
${H} [data-tour="hero"] > .pmo-scan::after { background: rgba(110,85,55,0.32); opacity: 0; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { animation: bkSun 2.2s ease-out both; }
@keyframes bkSun { 0% { opacity: 1 } 100% { opacity: 0 } }
@media (max-width: 719px) { ${H} [data-tour="hero"] > .pmo-scan::before { inset: -30% -20% -30% 55%; opacity: .3; animation: none; } }
${H} [data-tour="kpi-strip"] > div > div { box-shadow: inset 0 -3px 0 rgba(132,66,47,0.55), 0 1px 2px rgba(70,50,25,0.06) !important; }
${H} table thead th { border-bottom: 2px solid ${NAVY} !important; }
${H} table tbody td { border-bottom: 1px solid #EAE3D6 !important; }
/* sign-in: late sun through the screen, warm over the campus */
${H} [data-login]::after { background: linear-gradient(160deg, #E08A55 0%, #B0553A 45%, #6E3526 100%); mix-blend-mode: color; opacity: .72; }
`,
    live(o) { live(o, 2200, 2200); },
  };
}
