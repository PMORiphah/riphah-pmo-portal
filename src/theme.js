// ─────────────────────────────────────────────────────────────────────────────
//  PMO PORTAL — DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
//  Single source of truth for colour, type, space, radius, elevation and motion.
//
//  Rule: components read tokens. Components do not invent hex values, rgba
//  literals, radii or font sizes. Before adding a raw value to a component, add
//  it here instead — that is what keeps 14 pages looking like one product.
//
//  The audit that motivated this file found 67 distinct hex colours, 107 rgba
//  literals, 18 radii and 31 font sizes scattered across a single 6,100-line
//  component file.
// ─────────────────────────────────────────────────────────────────────────────

// ─── BRAND ───────────────────────────────────────────────────────────────────
// Riphah's institutional identity. Blue carries the product; gold is reserved
// for genuine brand moments (logo, active nav marker, primary emphasis) rather
// than being sprayed across every metric — see the brief's §2.
export const BRAND = {
  navy:      "#123C5C",   // Riphah institutional navy
  navyDeep:  "#0B2740",
  blue:      "#2C7BC4",   // primary interactive blue
  blueBright:"#4A9BE0",
  gold:      "#E0A94A",   // accent ONLY
  goldDeep:  "#B8842E",
};

// ─── SEMANTIC DATA COLOURS ───────────────────────────────────────────────────
// One meaning per colour, used identically on every page and every chart.
export const DATA = {
  positive:  "#22C4A8",   // teal — released, approved, on track
  info:      "#4A9BE0",   // blue — informational, planned
  warning:   "#E8A63C",   // amber — watch, pending
  danger:    "#F0637D",   // coral — at risk, over budget, overdue
  neutral:   "#8AA0B8",   // grey-blue — inactive, not started
  violet:    "#8B7FD9",   // categorical distinction only
  cyan:      "#2BD4D4",
};

// Ordered ramp for categorical series (segments, organisations) so charts pick
// colours deterministically instead of each chart choosing its own palette.
export const CATEGORICAL = [
  DATA.info, DATA.positive, DATA.violet, DATA.warning, DATA.cyan, DATA.danger,
];

// ─── TYPE SCALE ──────────────────────────────────────────────────────────────
// Three faces, three jobs:
//   display — Space Grotesk. Metrics and page titles. Slightly technical
//             grotesk that reads as analytical rather than decorative, and
//             already used by the Cashflows dashboard, so the two halves of the
//             product agree.
//   body    — Inter. All UI text.
//   mono    — IBM Plex Mono. Project IDs and any figure meant to be compared
//             column-to-column.
export const FONT = {
  display: "'Space Grotesk', 'Inter', sans-serif",
  body:    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:    "'IBM Plex Mono', ui-monospace, monospace",
};

// Every size/weight/spacing combination the product is allowed to use.
export const TYPE = {
  display:   { fontFamily:FONT.display, fontSize:34, fontWeight:700, lineHeight:1.1,  letterSpacing:"-0.02em" },
  metricXL:  { fontFamily:FONT.display, fontSize:30, fontWeight:700, lineHeight:1.05, letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums" },
  metric:    { fontFamily:FONT.display, fontSize:24, fontWeight:700, lineHeight:1.05, letterSpacing:"-0.015em", fontVariantNumeric:"tabular-nums" },
  metricSm:  { fontFamily:FONT.display, fontSize:18, fontWeight:700, lineHeight:1.1,  letterSpacing:"-0.01em",  fontVariantNumeric:"tabular-nums" },
  h1:        { fontFamily:FONT.display, fontSize:21, fontWeight:600, lineHeight:1.25, letterSpacing:"-0.01em" },
  h2:        { fontFamily:FONT.display, fontSize:16, fontWeight:600, lineHeight:1.3 },
  h3:        { fontFamily:FONT.body,    fontSize:14, fontWeight:600, lineHeight:1.35 },
  body:      { fontFamily:FONT.body,    fontSize:13, fontWeight:400, lineHeight:1.55 },
  bodySm:    { fontFamily:FONT.body,    fontSize:12, fontWeight:400, lineHeight:1.5 },
  caption:   { fontFamily:FONT.body,    fontSize:11, fontWeight:400, lineHeight:1.45 },
  // Small-caps section labels. The one place letterspacing earns its keep.
  label:     { fontFamily:FONT.body,    fontSize:10, fontWeight:600, lineHeight:1.4, letterSpacing:"0.09em", textTransform:"uppercase" },
  mono:      { fontFamily:FONT.mono,    fontSize:11.5, fontWeight:500, letterSpacing:"-0.01em" },
};

// ─── SPACE / RADIUS / MOTION ─────────────────────────────────────────────────
// 4px base grid. Replaces 117 ad-hoc padding strings.
export const SP = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:28, xxxl:40 };

// Five radii, down from eighteen.
export const R = { sm:6, md:10, lg:14, xl:18, pill:999 };

// Durations sit inside the brief's 150–300ms window.
export const MOTION = {
  fast:   "140ms cubic-bezier(.2,.8,.3,1)",
  base:   "220ms cubic-bezier(.2,.8,.3,1)",
  slow:   "320ms cubic-bezier(.16,1,.3,1)",
  ease:   "cubic-bezier(.2,.8,.3,1)",
};

// ─── THEMES ──────────────────────────────────────────────────────────────────
// Both themes expose an identical key set, so a component never branches on
// theme — it reads T.<token> and both modes come out correct.
//
// The layering model (brief §3) is: page → surface → surfaceRaised → surfaceHi.
// Each step up is lighter in dark mode and *whiter with more shadow* in light
// mode, which is how each theme expresses elevation in its own idiom rather
// than one being an inversion of the other.

const DARK = {
  mode:"dark",

  // Layered environment
  page:          "#070E1B",
  pageAlt:       "#050A14",
  surface:       "#0E1A2E",
  surfaceRaised: "#132339",
  surfaceHi:     "#1A2C46",
  sidebar:       "#0A1425",
  header:        "rgba(10,20,37,0.82)",

  // Hairlines — translucent so they sit on any surface
  border:        "rgba(255,255,255,0.07)",
  borderStrong:  "rgba(255,255,255,0.13)",
  borderAccent:  "rgba(74,155,224,0.35)",

  // Text
  text:          "#E8F0FA",
  textSoft:      "#A9BED4",
  muted:         "#7C95AF",
  dim:           "#54708C",
  onAccent:      "#FFFFFF",

  // Inputs
  inputBg:       "#0A1526",
  inputBorder:   "rgba(255,255,255,0.10)",
  inputFocus:    BRAND.blueBright,

  // Rows
  rowAlt:        "rgba(255,255,255,0.018)",
  rowHover:      "rgba(74,155,224,0.07)",
  rowActive:     "rgba(74,155,224,0.12)",

  // Elevation
  shadowSm:      "0 1px 2px rgba(0,0,0,0.4)",
  shadow:        "0 2px 6px rgba(0,0,0,0.36), 0 12px 28px -12px rgba(0,0,0,0.6)",
  shadowLg:      "0 8px 20px rgba(0,0,0,0.42), 0 28px 60px -20px rgba(0,0,0,0.72)",

  // Depth washes. Alpha suffixes appended to a hex colour, tuned per theme so
  // one component expression works in both.
  wash:          "16",   // coloured card tint
  washStrong:    "24",
  badge:         "26",   // badge/pill background
  ring:          "40",   // focus / selection ring
  glow:          "55",

  // Ambient background — barely visible, never competes with data (§32)
  ambient:"radial-gradient(ellipse 1100px 620px at 12% -8%, rgba(44,123,196,0.10), transparent 62%), radial-gradient(ellipse 900px 520px at 96% 4%, rgba(34,196,168,0.055), transparent 58%)",
  // Executive hero surface
  hero:   "linear-gradient(135deg, #14304E 0%, #0E2340 44%, #0A1729 100%)",
  glass:  "rgba(19,35,57,0.72)",
};

const LIGHT = {
  mode:"light",

  page:          "#F4F7FB",
  pageAlt:       "#EDF2F8",
  surface:       "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceHi:     "#FFFFFF",
  sidebar:       "#0E2743",
  header:        "rgba(255,255,255,0.86)",

  border:        "#E3EAF3",
  borderStrong:  "#CFDAE8",
  borderAccent:  "rgba(44,123,196,0.42)",

  text:          "#0C1E33",
  textSoft:      "#41576F",
  muted:         "#64798F",
  dim:           "#94A7BC",
  onAccent:      "#FFFFFF",

  inputBg:       "#F7FAFD",
  inputBorder:   "#DCE5F0",
  inputFocus:    BRAND.blue,

  rowAlt:        "rgba(18,60,92,0.016)",
  rowHover:      "rgba(44,123,196,0.055)",
  rowActive:     "rgba(44,123,196,0.10)",

  // Light mode carries elevation through shadow, not brightness — so its
  // shadows are markedly stronger than dark mode's would need to be.
  shadowSm:      "0 1px 2px rgba(16,42,71,0.06)",
  shadow:        "0 1px 3px rgba(16,42,71,0.07), 0 10px 26px -12px rgba(16,42,71,0.16)",
  shadowLg:      "0 8px 18px rgba(16,42,71,0.10), 0 28px 56px -18px rgba(16,42,71,0.22)",

  // Higher alphas: dark-tuned low-alpha washes vanish against white.
  wash:          "14",
  washStrong:    "24",
  badge:         "1F",
  ring:          "4D",
  glow:          "38",

  ambient:"radial-gradient(ellipse 1100px 620px at 12% -8%, rgba(44,123,196,0.07), transparent 62%), radial-gradient(ellipse 900px 520px at 96% 4%, rgba(34,196,168,0.05), transparent 58%)",
  hero:   "linear-gradient(135deg, #14304E 0%, #0E2340 44%, #0A1729 100%)",
  glass:  "rgba(255,255,255,0.78)",
};

// ─── LEGACY ALIASES ──────────────────────────────────────────────────────────
// The portal is ~6,100 lines of components written against the previous token
// names. Rather than rewrite all of them in one unreviewable commit, the old
// names are mapped onto the new values here. Effect: every page picks up the
// new palette immediately and coherently, and pages get migrated to the real
// token names as each one is redesigned.
//
// This block shrinks as pages are migrated. It is not permanent.
const legacy = (t) => ({
  sidebarBg:     t.sidebar,
  mainBg:        t.page,
  card:          t.surface,
  card2:         t.surfaceRaised,
  headerBg:      t.surface,
  tableRow:      t.rowAlt,
  tableRowHover: t.rowHover,
  scrollbar:     t.borderStrong,
  shadowHover:   t.shadowLg,
  heroGradient:  t.hero,
  pageTexture:   t.ambient,
  washAlpha:     t.wash,
  badgeAlpha:    t.badge,
  glowRing:      t.ring,
  glowBlur:      t.glow,
});

// Brand + data colours are theme-independent; merge them in so a component
// only ever needs `T`.
export const DK = { ...DARK,  ...BRAND, ...DATA, ...legacy(DARK),  TYPE, SP, R, MOTION, FONT };
export const LT = { ...LIGHT, ...BRAND, ...DATA, ...legacy(LIGHT), TYPE, SP, R, MOTION, FONT };

export const getTheme = (dark) => (dark ? DK : LT);

// ─── STATUS SEMANTICS ────────────────────────────────────────────────────────
// Workflow stage → colour + label. Single definition drives badges, the
// pipeline, donut segments and filters, so a stage can never be teal in one
// place and grey in another.
export const STAGE_META = {
  pdd_not_submitted:{ label:"PDD Not Submitted", color:DATA.neutral,  short:"Not Submitted" },
  identified:       { label:"PDD Submitted",     color:DATA.info,     short:"Submitted" },
  df_review:        { label:"DF Review",         color:BRAND.blue,    short:"DF" },
  ed_review:        { label:"ED Review",         color:DATA.violet,   short:"ED" },
  mt_review:        { label:"MT Review",         color:DATA.warning,  short:"MT" },
  approved:         { label:"Approved",          color:DATA.positive, short:"Approved" },
  closed:           { label:"Closed",            color:DATA.neutral,  short:"Closed" },
};

// Ordered pipeline — approval flow left to right.
export const STAGE_ORDER = [
  "pdd_not_submitted","identified","df_review","ed_review","mt_review","approved",
];

export const PRIORITY_META = {
  top_priority:    { label:"1st Priority",  color:DATA.danger },
  first_priority:  { label:"First Priority",color:DATA.warning },
  second_priority: { label:"2nd Priority",  color:DATA.info },
  third_priority:  { label:"3rd Priority",  color:DATA.neutral },
  carry_forward:   { label:"Carry Forward", color:DATA.violet },
};

// ─── HEALTH THRESHOLDS ───────────────────────────────────────────────────────
// Brief §8/§9: never just print "Insufficient Data" — say what's true and why.
export const healthOf = (cpi, spi) => {
  const has = (v) => v != null && isFinite(v) && v > 0;
  if (!has(cpi) && !has(spi))
    return { key:"nodata", label:"Insufficient Data", color:DATA.neutral,
             note:"No project has both a baseline and actuals recorded yet." };
  const worst = Math.min(has(cpi) ? cpi : 9, has(spi) ? spi : 9);
  if (worst >= 0.95) return { key:"healthy",  label:"Healthy",            color:DATA.positive, note:"Cost and schedule are tracking to plan." };
  if (worst >= 0.90) return { key:"attention",label:"Attention Required", color:DATA.warning,  note:"Some projects are drifting from plan." };
  if (worst >= 0.80) return { key:"risk",     label:"At Risk",            color:DATA.danger,   note:"Material cost or schedule variance." };
  return { key:"critical", label:"Critical", color:DATA.danger, note:"Severe variance across the portfolio." };
};

export const perfStatus = (v) => {
  if (v == null || !isFinite(v) || v <= 0) return { label:"No data", color:DATA.neutral };
  if (v >= 0.95) return { label:"Healthy", color:DATA.positive };
  if (v >= 0.90) return { label:"Watch",   color:DATA.warning };
  return { label:"At Risk", color:DATA.danger };
};
