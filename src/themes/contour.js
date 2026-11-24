// Contour. A survey sheet of high ground at dusk: slate and ember, contour lines that are generated (never a real map).
// The sidebar is a survey strip whose second set of contours drifts across the first, like heat over a ridge;
// your hand is the low sun, and once per session first light crosses the header.
import { svg, font, chrome, live } from "./kit.js";

function rings(w, h, peaks, n, colour, step = 22) {
  let d = "";
  for (const [cx, cy, s, ph] of peaks) for (let i = 1; i <= n; i++) {
    const r = i * step * s; let p = "";
    for (let a = 0; a <= 72; a++) {
      const t = a / 72 * Math.PI * 2;
      const wob = 1 + 0.16 * Math.sin(3 * t + i * 0.7 + ph) + 0.09 * Math.sin(5 * t - i + ph) + 0.05 * Math.sin(9 * t + i * 1.3);
      const x = cx + Math.cos(t) * r * 1.5 * wob, y = cy + Math.sin(t) * r * 0.82 * wob;
      p += (a ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    d += `<path d='${p}Z' stroke-width='${i % 5 === 0 ? 1.3 : 0.7}' stroke-opacity='${i % 5 === 0 ? 0.6 : 0.32}'/>`;
  }
  return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><g fill='none' stroke='${colour}'>${d}</g></svg>`);
}

export default function contour() {
  const K = "contour", H = `html[data-theme="${K}"]`;
  const EMBER = "#E9C98E";
  const heroRings = rings(1000, 320, [[520, 150, 1, 0], [800, 50, 0.8, 1.2]], 14, EMBER);
  const sideA = rings(260, 900, [[40, 760, 0.9, 0.4], [230, 260, 0.55, 2.1]], 16, EMBER, 20);
  const sideB = rings(260, 900, [[180, 600, 0.7, 1.7], [20, 120, 0.5, 3.0]], 12, "#9CD7E2", 22);
  const tabRings = rings(800, 80, [[120, 90, 0.7, 0], [600, 0, 0.6, 1]], 8, EMBER, 18);

  return {
    key: K, name: "Contour", mode: "dark",
    blurb: "A dusk survey sheet: slate and ember, contour lines that drift like heat over a ridge.",
    swatch: { side: "#1C2A36", page: "#121A21", hero: "#1F3448", accent: EMBER, line: EMBER },
    fonts: [font("Newsreader", "newsreader.woff2", "200 800"), font("Newsreader", "newsreader-italic.woff2", "200 800", "italic")],
    font: { display: "'Newsreader', Georgia, serif" },
    type: { display: { fontWeight: 500, letterSpacing: "-0.01em" }, h1: { fontWeight: 500, fontSize: 23 }, h2: { fontWeight: 600 }, metric: { fontFamily: "'Inter', sans-serif", fontWeight: 600 }, metricXL: { fontFamily: "'Inter', sans-serif", fontWeight: 600 } },
    r: { sm: 4, md: 8, lg: 10, xl: 12 },
    data: { positive: "#9CD7E2", info: "#7DB6E6", warning: "#F7EE9D", danger: "#E45679", neutral: "#97A3AE", violet: "#B3A6EA", cyan: "#62C9C9" },
    tokens: {
      page: "#121A21", pageAlt: "#0D1318", surface: "#18222B", surfaceRaised: "#1E2A34", surfaceHi: "#24323E",
      surfaceFloat: "#1E2A34", surfaceOver: "rgba(24,34,43,0.99)",
      sidebar: "linear-gradient(180deg, #26384A 0%, #1C2A37 42%, #121B23 100%)",
      sidebarFg: "rgba(241,236,226,0.78)", sidebarFgSoft: "rgba(241,236,226,0.62)", sidebarFgOn: "#FFF6E6",
      sidebarBorder: "rgba(233,201,142,0.16)", sidebarHover: "rgba(233,201,142,0.07)", sidebarName: "#FFF6E6",
      header: "rgba(18,26,33,0.95)", border: "rgba(233,201,142,0.10)", borderStrong: "rgba(233,201,142,0.20)", borderAccent: "rgba(233,201,142,0.45)",
      text: "#F1ECE2", textSoft: "#D3CCBF", muted: "#B9B1A3", dim: "#AEA698",
      inputBg: "#141D25", inputBorder: "rgba(233,201,142,0.18)", inputFocus: EMBER,
      rowAlt: "rgba(255,255,255,0)", rowHover: "rgba(233,201,142,0.06)", rowActive: "rgba(233,201,142,0.10)",
      shadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 28px -16px rgba(0,0,0,0.7)",
      goldText: EMBER, cursorLight: "rgba(233,201,142,0.06)", cursorLightHero: "rgba(255,214,150,0.12)",
      glowRingHover: (c) => `0 0 0 1px ${c}55, 0 14px 30px -12px rgba(233,170,110,0.25), 0 2px 8px rgba(0,0,0,0.4)`,
      ambient: "radial-gradient(ellipse 1200px 500px at 70% -10%, rgba(233,170,110,0.08), transparent 60%)",
      hero: `radial-gradient(ellipse 60% 90% at var(--lx, 72%) var(--ly, 10%), rgba(255,200,130,0.18), transparent 62%), linear-gradient(170deg, #1F3448 0%, #172836 48%, #121C26 100%)`,
      heroBorder: "rgba(233,201,142,0.22)", heroFgSoft: "rgba(255,255,255,0.84)", heroFgMuted: "rgba(255,255,255,0.80)", heroFgDim: "rgba(255,255,255,0.72)",
      heroAccent: "#F0CB8A", heroMotifA: "transparent", heroMotifB: "transparent", heroGlowA: "transparent", heroGlowB: "transparent",
    },
    css: chrome(K, {
      tip: "#22303C",
      navActive: "linear-gradient(90deg, rgba(233,201,142,0.20) 0%, rgba(233,201,142,0.05) 70%, transparent 100%)",
      navShadow: "inset 0 1px 0 rgba(255,220,170,0.10)", navOn: "#FFF6E6",
      rail: "linear-gradient(180deg, #F6D9A0, #D9A75C)", railGlow: "0 0 12px rgba(240,190,120,0.6)",
      tile: "rgba(233,201,142,0.14)", icon: "#F4D29A", hoverIcon: "#F0CB8A", hoverTile: "rgba(233,201,142,0.07)",
      tabOn: "#F4D29A", tabArt: `background: ${tabRings} center / 800px 80px no-repeat; opacity: .5;`,
    }) + `
${H} body { background: #121A21 !important; }
/* sidebar: two survey sheets; the second drifts across the first like heat over a ridge */
${H} [data-sidebar]::before { background: radial-gradient(ellipse 90% 30% at 85% 0%, rgba(255,190,120,0.16), transparent 70%), ${sideA} center / 260px 900px no-repeat; opacity: .5; }
${H} [data-sidebar]::after { inset: -40px; background: ${sideB} center / 260px 900px no-repeat; opacity: .22; animation: ctDrift 46s ease-in-out infinite alternate; }
@keyframes ctDrift { from { transform: translate(-14px, 18px) rotate(-1.2deg) } to { transform: translate(12px, -22px) rotate(1.4deg) } }
/* your hand is the low sun: a warm glow follows it down the sidebar */
${H} [data-sidebar] > [data-tour="brand"]::before { content: ""; position: absolute; right: -60px; top: 0; width: 220px; height: 220px; z-index: -1; pointer-events: none; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,196,120,0.20), rgba(255,170,100,0.06) 45%, transparent 70%);
  translate: 0 calc(var(--sy, -300px) - 110px); opacity: 0; transition: opacity .6s ease, translate .25s ease-out; }
${H} [data-sidebar][data-near] > [data-tour="brand"]::before { opacity: 1; }
${H}[data-arrive] [data-sidebar]::before { animation: ctArrive 2s ease-out both; }
@keyframes ctArrive { from { opacity: 0; transform: scale(1.04) } to { opacity: .5; transform: none } }
${H} [data-topbar] { box-shadow: 0 1px 0 rgba(233,201,142,0.18), 0 10px 24px -18px rgba(233,170,110,0.35) !important; }
/* the hero: contours behind the figures, drifting very slowly; faint on phones */
${H} [data-tour="hero"] > .pmo-scan::before { background: ${heroRings} center / 1000px auto no-repeat; opacity: .8; animation: ctHero 60s ease-in-out infinite alternate; inset: -30px;
  -webkit-mask: linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 35%, #000 70%); mask: linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 35%, #000 70%); }
@keyframes ctHero { from { transform: translate(-16px, 6px) } to { transform: translate(16px, -8px) } }
${H} [data-tour="projects-hero"]::before { background: ${heroRings} right -120px center / 900px auto no-repeat; opacity: .55; }
/* first light: once per session a warm band crosses behind the figures */
${H} [data-tour="hero"] > .pmo-scan::after { background: linear-gradient(100deg, transparent 0 40%, rgba(255,214,150,0.24) 48%, transparent 56% 100%); background-size: 260% 100%; background-position: 120% 0; opacity: 0; }
${H}[data-moment] [data-tour="hero"] > .pmo-scan::after { animation: ctFirstLight 2.6s cubic-bezier(.4,.1,.2,1) both; }
@keyframes ctFirstLight { 0% { opacity: 1; background-position: 120% 0 } 100% { opacity: 0; background-position: -20% 0 } }
@media (max-width: 719px) { ${H} [data-tour="hero"] > .pmo-scan::before { opacity: .32; animation: none; } ${H} [data-tour="projects-hero"]::before { opacity: .25; } }
${H} h1, ${H} [data-tour="page-title"] { font-style: italic; }
${H} [data-tour="kpi-strip"] > div > div { background-image: radial-gradient(ellipse 70% 60% at 100% 0%, rgba(233,201,142,0.07), transparent 70%) !important; }
${H} table thead th { color: ${EMBER} !important; border-bottom: 1px solid rgba(233,201,142,0.35) !important; }
${H} table tbody td { border-bottom: 1px solid rgba(233,201,142,0.07) !important; }
${H} .recharts-cartesian-grid line { stroke: rgba(233,201,142,0.10) !important; }
/* sign-in: dusk over the campus */
${H} [data-login]::after { background: linear-gradient(170deg, #F0A766 0%, #9A6E58 32%, #2A3D50 70%, #16212B 100%); mix-blend-mode: color; opacity: .78; }
`,
    live(o) { live(o, 2600, 2000); },
  };
}
