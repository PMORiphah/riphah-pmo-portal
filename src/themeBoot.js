// Optional themes (24 Nov 2026). Imported first by main.jsx so the chosen theme is in place before theme.js builds
// its token sets. Only on /preview/ (or a local build with VITE_THEMES=1); never on the simulation page.
// The choice lives on this device (localStorage "pmo-theme"); changing it reloads the page.
import { THEMES } from "./themes/index.js";

export const THEMES_ON = import.meta.env.BASE_URL === "/riphah-pmo-portal/preview/" || import.meta.env.VITE_THEMES === "1";
const KEY = "pmo-theme";

export function themeList() {
  if (!THEMES_ON) return [];
  return THEMES.map((build) => { const t = build(); return { key: t.key, name: t.name, mode: t.mode, blurb: t.blurb, swatch: t.swatch }; });
}
export function activeTheme() {
  return (THEMES_ON && typeof window !== "undefined" && window.__PMO_THEME__ && window.__PMO_THEME__.key) || null;
}
export function chooseTheme(key) {
  try { key ? localStorage.setItem(KEY, key) : localStorage.removeItem(KEY); } catch {}
  const html = document.documentElement;
  html.style.transition = "opacity .28s ease"; html.style.opacity = "0";
  setTimeout(() => location.reload(), 260);
}

function boot() {
  const html = document.documentElement;
  if (html.hasAttribute("data-pmo-sim") || /\/simulation(\.html)?$/.test(location.pathname)) return;
  let key = null;
  try {
    const q = new URLSearchParams(location.search).get("theme");
    if (q !== null) { q && q !== "original" ? localStorage.setItem(KEY, q) : localStorage.removeItem(KEY); }
    key = localStorage.getItem(KEY);
  } catch {}
  const build = key && THEMES.find((b) => b().key === key);
  if (!build) return;
  const t = build();
  window.__PMO_THEME__ = { key: t.key, mode: t.mode, tokens: t.tokens, data: t.data, dataText: t.dataText, font: t.font, type: t.type, r: t.r };
  html.setAttribute("data-theme", t.key);
  html.style.colorScheme = t.mode;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (calm) html.setAttribute("data-calm", "");
  const faces = (t.fonts || []).map((f) => `@font-face{font-family:'${f.family}';src:url(${f.url}) format('woff2');font-weight:${f.weight};font-style:${f.style};font-display:swap}`).join("\n");
  const st = document.createElement("style"); st.id = "pmo-theme-css"; st.textContent = faces + "\n" + t.css;
  document.head.appendChild(st);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta && t.swatch) meta.setAttribute("content", t.mode === "light" ? t.swatch.page : t.swatch.side);
  const go = () => { try { t.live && t.live({ calm }); } catch (e) { console.warn("theme live layer failed", e); } };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", go) : setTimeout(go, 0);
}

if (THEMES_ON) boot();
