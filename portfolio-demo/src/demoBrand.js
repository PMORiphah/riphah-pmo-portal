// Portfolio demo: "Make it yours". The visitor's organisation name, logo, colours, currency and words,
// saved in this browser. They are applied when the page starts (applyBrand, before the portal loads):
//   colours   → the portal's brand palette (theme.js reads window.__DEMO_BRAND__.colors, build rule);
//   logo      → the portal's logo and crest (build rule), a generated wordmark unless one is uploaded;
//   currency  → figures converted by the demo backend at fixed demo rates (demoMoney.js) and the
//               currency code swapped on screen; amounts shown in K / M / B (window.__dmM, build rules);
//   name and words → swapped in the page's text as it renders (installText).
export const KEY = "cpp-demo-brand";
export const DEFAULTS = Object.freeze({ name: "", logo: null, logoStyle: "arch", primary: "#2C7BC4", accent: "#E0A94A", currency: "USD",
  site: "campus", manager: "pm", office: "pmo" });

// Fixed demo rates: how many units of the data's base currency (PKR) make one unit of each currency.
export const CURRENCIES = { USD: { rate: 280, label: "US dollar" }, GBP: { rate: 355, label: "Pound sterling" }, AED: { rate: 76.25, label: "UAE dirham" },
  PKR: { rate: 1, label: "Pakistani rupee" } };
export const SITE_WORDS = { campus: ["Campus", "Campuses"], site: ["Site", "Sites"], region: ["Region", "Regions"], branch: ["Branch", "Branches"], plant: ["Plant", "Plants"] };
export const MANAGER_WORDS = { pm: ["Project Manager", "Project Managers"], lead: ["Project Lead", "Project Leads"], engineer: ["Engineer in Charge", "Engineers in Charge"] };
export const OFFICE_WORDS = { pmo: "PMO", office: "Projects Office", team: "Capital Projects Team" };
export const PRIMARIES = ["#2C7BC4", "#1F8A70", "#6A4FB6", "#C2410C", "#0E7490", "#334155"];
export const ACCENTS = ["#E0A94A", "#2BD4D4", "#F472B6", "#A3E635", "#FB923C"];

const safe = (f, d = null) => { try { return f(); } catch { return d; } };
export const loadBrand = () => ({ ...DEFAULTS, ...(safe(() => JSON.parse(localStorage.getItem(KEY) || "null")) || {}) });
export const saveBrand = (b) => safe(() => { localStorage.setItem(KEY, JSON.stringify(b)); return true; }, false);
export const isDefault = (b) => Object.keys(DEFAULTS).every((k) => b[k] === DEFAULTS[k]);
export const orgName = (b) => (b.name || "").trim() || "Your Organisation";

// ── colours ──
const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0x2c7bc4; return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(...x.map((v, i) => v + (y[i] - v) * t)); };
export function paletteOf(b) {
  return { blue: b.primary, blueBright: mix(b.primary, "#FFFFFF", 0.22), navy: mix(b.primary, "#0A1420", 0.62), navyDeep: mix(b.primary, "#050B14", 0.78),
    gold: b.accent, goldDeep: mix(b.accent, "#000000", 0.18) };
}

// ── logo: a wordmark with the organisation's name (fits any length), or the visitor's upload ──
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EMBLEMS = {
  arch: (c1, c2) => `<path d="M14 54 V30 a18 18 0 0 1 36 0 V54 Z" fill="none" stroke="${c1}" stroke-width="4"/><rect x="21" y="34" width="5" height="16" rx="1" fill="${c2}"/><rect x="29.5" y="30" width="5" height="20" rx="1" fill="${c2}"/><rect x="38" y="34" width="5" height="16" rx="1" fill="${c2}"/><rect x="10" y="54" width="44" height="4" rx="2" fill="${c1}"/>`,
  shield: (c1, c2) => `<path d="M32 8 L54 16 V32 C54 46 44 54 32 58 C20 54 10 46 10 32 V16 Z" fill="none" stroke="${c1}" stroke-width="4"/><path d="M22 34 L30 42 L44 24" fill="none" stroke="${c2}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  tower: (c1, c2) => `<rect x="14" y="22" width="14" height="34" rx="2" fill="none" stroke="${c1}" stroke-width="4"/><rect x="32" y="10" width="18" height="46" rx="2" fill="none" stroke="${c1}" stroke-width="4"/><rect x="37" y="18" width="8" height="5" fill="${c2}"/><rect x="37" y="28" width="8" height="5" fill="${c2}"/><rect x="37" y="38" width="8" height="5" fill="${c2}"/><rect x="18" y="30" width="6" height="5" fill="${c2}"/>`,
  leaf: (c1, c2) => `<path d="M12 52 C12 26 30 10 54 10 C54 36 38 52 12 52 Z" fill="none" stroke="${c1}" stroke-width="4"/><path d="M14 50 L42 22" stroke="${c2}" stroke-width="4" stroke-linecap="round"/>`,
};
export const LOGO_STYLES = Object.keys(EMBLEMS);
const svgUri = (svg) => "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
export function wordmark(b, { dark = false } = {}) {
  const pal = paletteOf(b), c1 = dark ? "#FFFFFF" : pal.navy, c2 = pal.blue;
  const name = orgName(b).toUpperCase(), fit = 270;
  const size = Math.max(14, Math.min(27, Math.floor(fit / (name.length * 0.66))));
  const squeeze = name.length * size * 0.66 > fit ? ` textLength="${fit}" lengthAdjust="spacingAndGlyphs"` : "";
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 112" width="384" height="112">` +
    `<g transform="translate(6 18) scale(1.15)">${(EMBLEMS[b.logoStyle] || EMBLEMS.arch)(c1, c2)}</g>` +
    `<text x="96" y="58" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="700" fill="${c1}" letter-spacing="0.5"${squeeze}>${esc(name)}</text>` +
    `<text x="97" y="84" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14" fill="${c2}" letter-spacing="2.4">CAPITAL PROJECTS PORTAL</text></svg>`);
}
export function crest(b) {
  const pal = paletteOf(b), words = orgName(b).toUpperCase().split(/\s+/);
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [words[0]];
  const t = lines.map((l, i) => `<text x="130" y="${262 + i * 30}" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${i ? 20 : 24}" font-weight="${i ? 500 : 700}" fill="#fff" letter-spacing="2"${l.length * 15 > 230 ? ' textLength="230" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(l)}</text>`).join("");
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 317" width="260" height="317"><rect width="260" height="317" fill="${pal.navy}"/>` +
    `<g transform="translate(34 40) scale(3)">${(EMBLEMS[b.logoStyle] || EMBLEMS.arch)("#ffffff", mix(pal.blue, "#FFFFFF", 0.4))}</g>${t}</svg>`);
}

// ── money: K / M / B, used by the portal's formatters through build rules ──
export function compact(v, d = 1) {
  const n = Number(v) || 0, a = Math.abs(n), s = n < 0 ? "-" : "";
  const f = (x, dd) => x.toLocaleString("en", { minimumFractionDigits: dd, maximumFractionDigits: dd });
  if (a >= 1e9) return s + f(a / 1e9, d) + "B";
  if (a === 0) return "0";
  if (a >= 1e6) return s + f(a / 1e6, d) + "M";
  if (a >= 1e3) return s + f(a / 1e3, d) + "K";
  return s + Math.round(a).toLocaleString("en");
}

/** Before the portal loads: colours, logo, money helper; returns the active settings. */
export function applyBrand() {
  const b = loadBrand();
  window.__dmM = compact;
  // The portal draws its logo in brand colours and turns it white itself on the dark sidebar.
  window.__DEMO_BRAND__ = { ...b, colors: paletteOf(b), logo: b.logo || wordmark(b), crest: crest(b), rate: CURRENCIES[b.currency]?.rate || 280 };
  return b;
}

// ── the page's text: organisation name, currency code and the visitor's words ──
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function textRules(b) {
  const rules = [];
  const name = orgName(b);
  if (name !== "Your Organisation") rules.push([/Your Organisation/g, name]);
  if (b.currency !== "PKR") rules.push([/\bPKR\b/g, b.currency]);
  const [s1, sN] = SITE_WORDS[b.site] || SITE_WORDS.campus;
  if (b.site !== "campus") {
    rules.push([/Campus \/ Sites/g, sN], [/Campus\/Site/g, s1], [/campus \/ site/g, s1.toLowerCase()], [/Campuses \/ Sites/g, sN], [/campuses \/ sites/g, sN.toLowerCase()],
      [/\bCAMPUSES\b/g, sN.toUpperCase()], [/\bCAMPUS\b/g, s1.toUpperCase()], [/\bCampuses\b/g, sN], [/\bcampuses\b/g, sN.toLowerCase()],
      [/\bCampus\b/g, s1], [/\bcampus\b/g, s1.toLowerCase()]);
  }
  if (b.manager !== "pm") {
    const [m1, mN] = MANAGER_WORDS[b.manager];
    rules.push([/\bPROJECT MANAGERS\b/g, mN.toUpperCase()], [/\bPROJECT MANAGER\b/g, m1.toUpperCase()], [/\bProject Managers\b/g, mN], [/\bProject Manager\b/g, m1],
      [/\bProject managers\b/g, mN[0] + mN.slice(1).toLowerCase()], [/\bProject manager\b/g, m1[0] + m1.slice(1).toLowerCase()],
      [/\bproject managers\b/g, mN.toLowerCase()], [/\bproject manager\b/g, m1.toLowerCase()]);
  }
  if (b.office !== "pmo") rules.push([/\bPMO\b/g, OFFICE_WORDS[b.office]]);
  return rules;
}
const SKIP = "script,style,textarea,input,select,code,[contenteditable],.dm,.dm-entry,.dt-card,.mc,[data-customise],[data-demo-note]";
export function installText(b) {
  const rules = textRules(b);
  if (!rules.length) return () => {};
  const any = new RegExp(rules.map(([re]) => re.source).join("|"));
  const fix = (s) => { let out = s; for (const [re, to] of rules) out = out.replace(re, to); return out; };
  const doText = (n) => {
    const v = n.nodeValue;
    if (!v || !any.test(v) || n.parentElement?.closest(SKIP)) return;
    const w = fix(v);
    if (w !== v) n.nodeValue = w;
  };
  const doAttrs = (el) => {
    for (const a of ["placeholder", "title", "aria-label", "alt"]) {
      const v = el.getAttribute?.(a);
      if (v && any.test(v) && !el.closest(SKIP)) { const w = fix(v); if (w !== v) el.setAttribute(a, w); }
    }
  };
  const walk = (root) => {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
  };
  // Handled inside the observer callback (a microtask, before the browser paints), so the original word
  // never flashes on screen; the second pass after our own change finds nothing to do.
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else for (const n of m.addedNodes) if (n.isConnected) walk(n);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "alt"] });
  walk(document.body);
  // The document title too.
  const t = document.querySelector("title");
  if (t) { const fixTitle = () => { const w = fix(document.title); if (w !== document.title) document.title = w; }; fixTitle(); new MutationObserver(fixTitle).observe(t, { childList: true }); }
  return () => mo.disconnect();
}
