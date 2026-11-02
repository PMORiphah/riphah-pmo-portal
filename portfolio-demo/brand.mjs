// Portfolio demo: what the build changes in the real portal's code while bundling it.
//
// The portal's own files in src/ are never edited for the demo. Instead, vite.config.mjs runs every
// file from src/ through rewrite() below, so the bundle gets a neutral, white-label portal:
// no organisation name, no database address or key, no real addresses or e-mail domains.
// The privacy scan (scan/scan.mjs) then checks the finished file and fails the build on any match.
//
// Every rule is literal text or an anchored pattern; a rule that stops matching is reported, so a
// change to the portal that moves a string cannot slip through silently (see unusedRules()).

export const DEMO_ORIGIN = "https://api.demo.invalid";      // never resolves; the demo backend answers it in the page
export const DEMO_SITE = "https://capital-projects-portal-demo.vercel.app/";
export const OWNER = "Abdullah Azhar";
export const OWNER_URL = "https://www.upwork.com/freelancers/~015400e3035d103eb3";
export const ORG_DEFAULT = "Your Organisation";

// Neutral, original marks that replace the organisation's logo and crest (both embedded as images in
// src/App.jsx). A simple emblem: an arch over three columns. "Make it yours" swaps them at run time.
const EMBLEM = (c1, c2) => `<path d="M14 54 V30 a18 18 0 0 1 36 0 V54 Z" fill="none" stroke="${c1}" stroke-width="4"/>` +
  `<rect x="21" y="34" width="5" height="16" rx="1" fill="${c2}"/><rect x="29.5" y="30" width="5" height="20" rx="1" fill="${c2}"/>` +
  `<rect x="38" y="34" width="5" height="16" rx="1" fill="${c2}"/><rect x="10" y="54" width="44" height="4" rx="2" fill="${c1}"/>`;
const svgUri = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
export const DEMO_LOGO = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 112" width="384" height="112">` +
  `<g transform="translate(6 18) scale(1.15)">${EMBLEM("#1d4f7a", "#2a9d8f")}</g>` +
  `<text x="96" y="58" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="27" font-weight="700" fill="#1d4f7a" letter-spacing="0.5">YOUR ORGANISATION</text>` +
  `<text x="97" y="84" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14" fill="#2a9d8f" letter-spacing="2.4">CAPITAL PROJECTS PORTAL</text></svg>`);
export const DEMO_CREST = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 317" width="260" height="317">` +
  `<rect width="260" height="317" fill="#1d4f7a"/><g transform="translate(34 40) scale(3)">${EMBLEM("#ffffff", "#7fd1c7")}</g>` +
  `<text x="130" y="262" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="24" font-weight="700" fill="#ffffff" letter-spacing="2">YOUR</text>` +
  `<text x="130" y="292" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="20" fill="#ffffff" letter-spacing="2">ORGANISATION</text></svg>`);

// [name, pattern (string = literal, all occurrences), replacement]
export const RULES = [
  // The organisation's logo and crest (embedded images) → the neutral marks above.
  // ("Make it yours" can replace both at run time.)
  ["App: logo", /const LOGO = "data:image\/png;base64,[A-Za-z0-9+\/=]+"/, `const LOGO = (window.__DEMO_BRAND__ && window.__DEMO_BRAND__.logo) || "${DEMO_LOGO}"`],
  ["App: crest", /const CREST_LOGO = "data:image\/png;base64,[A-Za-z0-9+\/=]+"/, `const CREST_LOGO = (window.__DEMO_BRAND__ && window.__DEMO_BRAND__.crest) || "${DEMO_CREST}"`],
  // Backend address and the public key: the demo talks only to its in-page backend.
  ["supabase origin", /https:\/\/[a-z]{20}\.supabase\.co/g, DEMO_ORIGIN],
  ["public jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "demo-public-key"],
  // Addresses of the real systems.
  ["portal url", "https://pmoriphah.github.io/riphah-pmo-portal/", DEMO_SITE],
  ["repo name", "PMORiphah/riphah-pmo-portal", "your-organisation/projects-portal"],
  ["preview base", "/riphah-pmo-portal/preview/", "/"],
  ["base path", "/riphah-pmo-portal/", "/"],
  ["proposal portal", /https?:\/\/pmo\.riphah\.edu\.pk\/?[A-Za-z/-]*/g, "https://proposals.example.org/"],
  ["proposal host", "pmo.riphah.edu.pk", "proposals.example.org"],
  ["mail domain", /[A-Za-z0-9._%+-]+@riphah\.edu\.pk/g, "pmo@example.org"],
  // Real site lists and examples that live in the portal's code (each rule names its file).
  ["App: proposal-site map", /\{ "rih sihala":"RIH"[^}]*\}/, '{ "north campus":"Northbridge" }'],
  ["PastProjects: site spellings", /\{ "g7":"G-7",[^}]*\}/, '{ "north bridge":"Northbridge", "lake side":"Lakeside" }'],
  ["PastProjects: import help", "Al-Mizan, G-7, I-14, GGC, Lahore, Malakand, PRH, RIH, MHH. 'G7' and 'Al mizan' are read as G-7 and Al-Mizan.",
    "Northbridge, Lakeside, Hillview, Riverside Hospital, Eastgate, Westfield. 'North bridge' is read as Northbridge."],
  ["PastProjects: code example", "e.g. IT.261104-01", "e.g. ET.271010-01"],
  ["Inventory: plants", /"1100": "Trust Islamabad\/Rawalpindi",[\s\S]*?"2100": "Riphah",/, '"1100": "North Region", "1200": "Central Region", "1300": "South Region", "2100": "Group",'],
  ["App: import example", '"New Academic Block - Islamabad"', '"New Academic Block - Northbridge"'],
  ["App: import region", '"Islamabad",           // Region', '"North Region",        // Region'],
  ["App: tour sample code", '"IT.261297-04"', '"ET.272010-05"'],
  ["App: name placeholder", "e.g. Ahmed Khan", "e.g. Sam Carter"],
  ["App: username placeholder", "e.g. PM_Ahmed", "e.g. PM_Sam"],
  ["Ask: sample question", "What are the risks on Ferozpur?", "What are the risks on the Clinical Skills Lab?"],
  ["project ref", /prmxkecomqqngvrmytcj/g, "demo-project"],
  ["file host", ".r2.cloudflarestorage.com", ".files.demo.invalid"],
  // Offline and demo-only behaviour.
  ["ui: web fonts", /f\.href = "https:\/\/fonts\.googleapis\.com\/[^"]*";/, 'f.href = "data:text/css,";'],
  ["App: PMO simulation button", "const SIM_ENABLED = true;", "const SIM_ENABLED = false;"],
  // The demo's guided tour drives the portal through the same navigation object as the portal's own tour,
  // and the portal's "Take the tour" buttons (sidebar, invite, assistant) open the demo's tour.
  // "Make it yours": the visitor's colours replace the brand palette when the page starts.
  ["theme: demo colours", '  goldDeep:  "#B8842E",\n};\n',
    '  goldDeep:  "#B8842E",\n};\nif (typeof window !== "undefined" && window.__DEMO_BRAND__?.colors) Object.assign(BRAND, window.__DEMO_BRAND__.colors);\n'],
  // Amounts in K / M / B (window.__dmM), so a currency worth more than the base one still reads well.
  ["App: fmtM", 'const fmtM = (n) => n == null ? "—" : (n / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";',
    'const fmtM = (n) => n == null ? "—" : __dmM(n);'],
  ["App: page fmtM", 'const fmtM  = n => n == null ? "—" : (parseFloat(n) / 1e6).toFixed(1) + "M";', 'const fmtM  = n => n == null ? "—" : __dmM(parseFloat(n));'],
  ["App: page fmtMv", 'const m = (Math.abs(parseFloat(n)) / 1e6).toFixed(1);\n    return (parseFloat(n) >= 0 ? "+" : "−") + m + "M";',
    'const m = __dmM(Math.abs(parseFloat(n)));\n    return (parseFloat(n) >= 0 ? "+" : "−") + m;'],
  ["App: detail fmtM", 'const fmtM  = n => n == null ? "—" : (parseFloat(n)/1e6).toFixed(1)+"M";', 'const fmtM  = n => n == null ? "—" : __dmM(parseFloat(n));'],
  ["App: detail fmtMv", 'const m=(Math.abs(parseFloat(n))/1e6).toFixed(1); return(parseFloat(n)>=0?"+":"−")+m+"M";',
    'const m=__dmM(Math.abs(parseFloat(n))); return(parseFloat(n)>=0?"+":"−")+m;'],
  ["App: SU total", '(suTotal / 1e6).toFixed(2) + "M"', '__dmM(suTotal, 2)'],
  ["nav stats", /PKR \$\{\(\(\+v \|\| 0\) \/ 1e6\)\.toFixed\(1\)\}M/g, "PKR ${__dmM(+v || 0)}"],
  ["theme: capex stat", "PKR ${((+d.total_capex||0)/1e6).toFixed(1)}M", "PKR ${__dmM(+d.total_capex||0)}"],
  ["theme: released stat", "PKR ${((+d.budget_consumed||0)/1e6).toFixed(1)}M", "PKR ${__dmM(+d.budget_consumed||0)}"],
  ["CampusCompare: fmtM", 'const fmtM = (n) => `${(num(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;', "const fmtM = (n) => __dmM(num(n));"],
  ["Cashflows: fmtM", ': (Number(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";', ": __dmM(Number(n));"],
  ["Timeline: fmtM", ': (parseFloat(n)/1e6).toLocaleString("en", { minimumFractionDigits:1, maximumFractionDigits:1 }) + "M";', ": __dmM(parseFloat(n));"],
  ["reportCalc: fmtM", 'export const fmtM = (n, d = 1) => `${(num(n) / 1e6).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d })}M`;',
    "export const fmtM = (n, d = 1) => __dmM(num(n), d);"],
  ["BoardReport: axis", "{(t / 1e6).toFixed(0)}M</text>", "{__dmM(t, 0)}</text>"],
  ["App: tour navigation for the demo", "    onAbandon: markTourAbandon,\n  };\n",
    "    onAbandon: markTourAbandon,\n  };\n  if (window.__DEMO__) { window.__DEMO__.nav = tourNav; window.__DEMO__.view = { page, projectId: selectedProjectId }; window.__DEMO__.openProject = openProject; }\n"],
  ["TourGuide: demo tour", "  const startDefault = useCallback(() => {\n    const list = nav?.buildSteps?.();",
    "  const startDefault = useCallback(() => {\n    if (window.__DEMO__?.startTour) { window.__DEMO__.startTour(); return; }\n    const list = nav?.buildSteps?.();"],
  // The demo bar sits above the portal: the portal's outer frame is shortened by its height.
  ["App: shell height", '<div style={{ display:"flex", height:"100vh", fontFamily:TYPE.body.fontFamily,',
    '<div style={{ display:"flex", height:"calc(100vh - var(--demo-bar, 0px))", fontFamily:TYPE.body.fontFamily,'],
  // Real system and council names shown on screen (identifiers in lower case stay: they are table names).
  ["proposal system", /\bE-PDD\b/g, "e-Proposal"],
  ["council", /\bPMDC\b/g, "Accreditation"],
  // Names of the organisation and its product.
  ["org full", "Riphah International University", ORG_DEFAULT],
  ["portal name", "Riphah PMO Portal", "Capital Projects Portal"],
  ["short name", "Riphah PMO", "Projects Office"],
  ["org word", /\bRiphah\b/g, "University"],
  ["org lower", /\briphah\b/g, "university"],
  ["institute", /\bIIMCT\b/g, "Institute"],
];

// Shared across Vite's copy of this module (it bundles the config) and build.mjs's copy.
const used = (globalThis.__demoBrandUsed ||= new Set());
/** Rewrites one source file's text. */
export function rewrite(code) {
  let out = code;
  for (const [name, pat, rep] of RULES) {
    const before = out;
    out = typeof pat === "string" ? out.split(pat).join(rep) : out.replace(pat, rep);
    if (out !== before) used.add(name);
  }
  return out;
}
/** Rules that matched nothing in the whole build (shown by the build, so a moved string is noticed). */
export const unusedRules = () => RULES.map(r => r[0]).filter(n => !used.has(n));
