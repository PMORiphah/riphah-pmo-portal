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

// Text-safe variants. The palette above is tuned for dark surfaces; measured on
// white, every one of those hues falls below the 4.5:1 WCAG AA floor for text
// (teal 2.2:1, gold 2.1:1, cyan 1.8:1). So a colour used as a FILL or BORDER
// keeps its full saturation, while the same colour used as TEXT resolves
// through this map in light mode. Values were computed by darkening each hue in
// HLS until it cleared 4.5:1 on #FFFFFF — not eyeballed.
export const DATA_TEXT_LIGHT = {
  positive:"#157A69", info:"#1F70B4", warning:"#986412", danger:"#D81539",
  neutral:"#4F6884", violet:"#6B5CCE", cyan:"#197B7B",
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
  sidebar:       "linear-gradient(180deg, #14395C 0%, #0D2440 52%, #081A2E 100%)",
  sidebarFg:     "rgba(255,255,255,0.66)",
  sidebarFgSoft: "rgba(255,255,255,0.5)",
  sidebarFgOn:   "#FFFFFF",
  sidebarBorder: "rgba(255,255,255,0.08)",
  sidebarHover:  "rgba(255,255,255,0.055)",
  sidebarName:   "#FFFFFF",
  sidebarLogoFilter:"brightness(0) invert(1)",
  header:        "rgba(10,20,37,0.82)",

  // Hairlines — translucent so they sit on any surface
  border:        "rgba(255,255,255,0.07)",
  borderStrong:  "rgba(255,255,255,0.13)",
  borderAccent:  "rgba(74,155,224,0.35)",

  // Text
  text:          "#E8F0FA",
  textSoft:      "#A9BED4",
  muted:         "#7C95AF",
  dim:           "#7089A6",
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

  // On dark surfaces the base palette already clears AA, so text variants are
  // the same values.
  textOf: (c) => c,
  goldText: BRAND.gold,

  // Restrained glow (§19). Diffuse, low-opacity, never neon.
  glowSoft: (c) => `0 0 0 1px ${c}33, 0 6px 22px -6px ${c}4D`,
  glowRingHover: (c) => `0 0 0 1px ${c}4D, 0 10px 30px -8px ${c}59, 0 2px 8px rgba(0,0,0,0.4)`,

  // Ambient background — barely visible, never competes with data (§32)
  ambient:"radial-gradient(ellipse 1100px 620px at 12% -8%, rgba(44,123,196,0.10), transparent 62%), radial-gradient(ellipse 900px 520px at 96% 4%, rgba(34,196,168,0.055), transparent 58%)",

  // ── Executive hero ────────────────────────────────────────────────────
  // Dark mode: a deep navy field with white type. Its foregrounds are tokens
  // rather than literals so light mode can invert the relationship instead of
  // inheriting a dark slab.
  hero:        "linear-gradient(135deg, #14304E 0%, #0E2340 44%, #0A1729 100%)",
  heroBorder:  "rgba(255,255,255,0.08)",
  heroFg:      "#FFFFFF",
  heroFgSoft:  "rgba(255,255,255,0.62)",
  heroFgMuted: "rgba(255,255,255,0.55)",
  heroFgDim:   "rgba(255,255,255,0.40)",
  heroDivider: "rgba(255,255,255,0.16)",
  heroAccent:  BRAND.gold,
  heroMotifA:  "rgba(255,255,255,0.035)",
  heroMotifB:  "rgba(224,169,74,0.075)",
  heroGlowA:   "rgba(74,155,224,0.15)",
  heroGlowB:   "rgba(34,196,168,0.09)",
  glass:  "rgba(19,35,57,0.72)",
};

// Lookup from full-saturation hue -> AA-safe text hue, used by LIGHT.textOf.
const LIGHT_TEXT_MAP = {
  [DATA.positive]:DATA_TEXT_LIGHT.positive, [DATA.info]:DATA_TEXT_LIGHT.info,
  [DATA.warning]:DATA_TEXT_LIGHT.warning,   [DATA.danger]:DATA_TEXT_LIGHT.danger,
  [DATA.neutral]:DATA_TEXT_LIGHT.neutral,   [DATA.violet]:DATA_TEXT_LIGHT.violet,
  [DATA.cyan]:DATA_TEXT_LIGHT.cyan,         [BRAND.gold]:"#96681A",
  // Hues that appear only in the categorical palettes (SEG_COLORS, STRAT_PAL).
  "#5B9FE8":"#1F70B4", "#F472B6":"#B31E63", "#FBBF24":"#8A6207",
  "#818CF8":"#4A55CE", "#6EE7B7":"#0F7A55",
  [BRAND.blue]:"#276EAF",
};

const LIGHT = {
  mode:"light",

  page:          "#F4F7FB",
  pageAlt:       "#EDF2F8",
  surface:       "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceHi:     "#FFFFFF",
  // Light mode gets a genuinely light sidebar — a navy rail beside cool-white
  // content reads as an un-themed leftover rather than a decision (§33).
  sidebar:       "linear-gradient(180deg, #FFFFFF 0%, #F7FAFD 100%)",
  sidebarFg:     "#4B6076",
  sidebarFgSoft: "#5C6F85",
  sidebarFgOn:   "#0C1E33",
  sidebarBorder: "#E3EAF3",
  sidebarHover:  "rgba(44,123,196,0.07)",
  sidebarName:   "#0C1E33",
  sidebarLogoFilter:"none",
  header:        "rgba(255,255,255,0.86)",

  border:        "#E3EAF3",
  borderStrong:  "#CFDAE8",
  borderAccent:  "rgba(44,123,196,0.42)",

  text:          "#0C1E33",
  textSoft:      "#41576F",
  muted:         "#5B6E83",
  dim:           "#5C6F85",
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

  glowSoft: (c) => `0 0 0 1px ${c}2E, 0 6px 20px -8px ${c}40`,
  glowRingHover: (c) => `0 0 0 1px ${c}3D, 0 12px 28px -10px ${c}47, 0 2px 8px rgba(16,42,71,0.10)`,

  // Resolve a semantic colour to its AA-safe text equivalent.
  textOf: (c) => LIGHT_TEXT_MAP[c] || c,
  goldText: "#96681A",

  ambient:"radial-gradient(ellipse 1100px 620px at 12% -8%, rgba(44,123,196,0.07), transparent 62%), radial-gradient(ellipse 900px 520px at 96% 4%, rgba(34,196,168,0.05), transparent 58%)",

  // ── Executive hero, light ─────────────────────────────────────────────
  // A dark navy block dropped into a bright, airy page reads as a leftover —
  // the same error the sidebar had. Light mode gets its own hero: a luminous
  // white-to-blue field with Riphah-blue type and a deep-gold headline figure,
  // so it sits ON the page rather than punching a hole in it (§16, §18).
  hero:        "linear-gradient(135deg, #FFFFFF 0%, #F5F9FE 42%, #E7F0FB 100%)",
  heroBorder:  "#DCE7F4",
  heroFg:      "#0C1E33",
  heroFgSoft:  "#4A6076",
  heroFgMuted: "#5B6E83",
  heroFgDim:   "#6E8299",
  heroDivider: "#DCE7F4",
  heroAccent:  "#96681A",
  heroMotifA:  "rgba(18,60,92,0.05)",
  heroMotifB:  "rgba(224,169,74,0.14)",
  heroGlowA:   "rgba(44,123,196,0.10)",
  heroGlowB:   "rgba(34,196,168,0.07)",
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


// ─── CONTEXTUAL INSIGHTS ─────────────────────────────────────────────────────
// One source of truth for the short explanations that surface on hover (§3, §7,
// §10, §15). Two rules:
//   1. Copy explains what a metric MEANS. Numbers are interpolated from live
//      data — never invented, never estimated.
//   2. One or two lines. If it needs a paragraph it belongs on the page, not in
//      a hover.
export const KPI_INSIGHT = {
  su_requested:  (d) => `Total value requested across ${d?.total_projects ?? 0} CAPEX proposals for FY 2026-27.`,
  df_recommended:(d) => "Portfolio value recommended after Director Finance review.",
  approved:      (d) => `Budget sanctioned for execution — ${d?.approved_count ?? 0} of ${d?.total_projects ?? 0} projects.`,
  budgeted:      (d) => "Projects carrying an approved budget allocation.",
  non_budgeted:  (d) => "Approved projects still awaiting a budget allocation.",
  carry_forward: (d) => `Budget carried forward from the previous fiscal year${d?.carry_forward_count ? ` across ${d.carry_forward_count} projects` : ""}.`,
  total_projects:(d) => "Every CAPEX project currently tracked in the portfolio.",
  total_capex:   (d) => "Combined value of the portfolio at its current approval stage.",
  released:      (d) => "Funds transferred to projects and available to spend.",
  remaining:     (d) => "Portfolio value not yet released to projects.",
  payments_made: (d) => "Payments confirmed by Finance against released funds.",
  payments_pending:(d) => "Approved payments awaiting transfer.",

  // ── PDD Status tab ────────────────────────────────────────────────────────
  pdd_not_submitted:(d) => `Projects still needing a PDD before they can enter the approval pipeline${d?.pdd_not_submitted_count ? ` — ${d.pdd_not_submitted_count} of ${d.total_projects}` : ""}.`,
  pdds_submitted:  (d) => "PDDs submitted and awaiting initial PMO review.",
  in_df:           (d) => "Under review by the Director Finance.",
  in_ed:           (d) => "Under review by the Executive Director.",
  in_mt:           (d) => "With the Managing Trustee for final sanction.",

  // ── Project Health tab ────────────────────────────────────────────────────
  active_projects: (d) => "Approved projects currently in execution.",
  on_schedule:     (d) => "Projects tracking at or ahead of plan (SPI 0.95 or better).",
  delayed:         (d) => "Projects running behind their planned schedule (SPI below 0.95).",
  over_budget:     (d) => "Projects spending ahead of plan (CPI below 0.95).",
  scope_change:    (d) => "Projects whose scope has been revised since approval.",
  closed:          (d) => "Projects completed and handed over.",
};

// Used when the PMO has manually overridden a card's value. The count-bearing
// defaults above interpolate live figures, which then contradict the override —
// e.g. a card reading "1166.33M from 272 proposals" paired with an insight
// saying "across 106 proposals". These say what the metric means and nothing
// that could disagree with a hand-entered number.
export const KPI_INSIGHT_PLAIN = {
  su_requested:  () => "Total value requested across CAPEX proposals for FY 2026-27.",
  df_recommended:() => "Portfolio value recommended after Director Finance review.",
  approved:      () => "Budget sanctioned for execution.",
  budgeted:      () => "Projects carrying an approved budget allocation.",
  non_budgeted:  () => "Approved projects still awaiting a budget allocation.",
  carry_forward: () => "Budget carried forward from the previous fiscal year.",
  total_projects:() => "Every CAPEX project currently tracked in the portfolio.",
  total_capex:   () => "Combined value of the portfolio at its current approval stage.",
  released:      () => "Funds transferred to projects and available to spend.",
  remaining:     () => "Portfolio value not yet released to projects.",
  payments_made: () => "Payments confirmed by Finance against released funds.",
  payments_pending:() => "Approved payments awaiting transfer.",
  pdd_not_submitted:() => "Projects still needing a PDD before they can enter the approval pipeline.",
  pdds_submitted:  () => "PDDs submitted and awaiting initial PMO review.",
  in_df:           () => "Under review by the Director Finance.",
  in_ed:           () => "Under review by the Executive Director.",
  in_mt:           () => "With the Managing Trustee for final sanction.",
  active_projects: () => "Approved projects currently in execution.",
  on_schedule:     () => "Projects tracking at or ahead of plan (SPI 0.95 or better).",
  delayed:         () => "Projects running behind their planned schedule (SPI below 0.95).",
  over_budget:     () => "Projects spending ahead of plan (CPI below 0.95).",
  scope_change:    () => "Projects whose scope has been revised since approval.",
  closed:          () => "Projects completed and handed over.",
};

// Tab descriptions plus a live figure, so the preview says something true about
// the portfolio rather than restating the tab name (§8).
export const TAB_INSIGHT = {
  budgeting:  (d) => ({ title:"Portfolio overview",
                        line:"Budget, approvals and planned against actual performance.",
                        stat: d ? `${d.total_projects} projects · PKR ${((+d.total_capex||0)/1e6).toFixed(1)}M` : null }),
  pipeline:   (d) => ({ title:"Approval pipeline",
                        line:"Track projects from PDD submission through to approval.",
                        stat: d ? `${d.pdd_not_submitted_count ?? 0} awaiting submission` : null }),
  execution:  (d) => ({ title:"Delivery health",
                        line:"Schedule and cost performance across active projects.",
                        stat: d ? `${d.approved_count ?? 0} approved · ${d.delayed_count ?? 0} delayed` : null }),
  financials: (d) => ({ title:"Financial activity",
                        line:"Releases, payments and outstanding financial movement.",
                        stat: d ? `PKR ${((+d.budget_consumed||0)/1e6).toFixed(1)}M released` : null }),
};

export const NAV_INSIGHT = {
  cmd:      "Executive portfolio overview",
  proj:     "Explore and manage capital projects",
  camp:     "Projects and approvals by campus",
  perf:     "Monitor schedule and cost performance",
  cashflow: "Track financial and schedule movement",
  upd:      "Project comments and communications",
  team:     "PMO team and portal information",
  users:    "Accounts, roles and project assignments",
  log:      "Every change made in the portal",
  set:      "Portal configuration and preferences",
};

// What each approval stage actually means for the project sitting in it (§15).
export const STAGE_HINT = {
  pdd_not_submitted:"A PDD is required before this project can enter the approval pipeline.",
  identified:       "PDD submitted and with the PMO for initial review.",
  df_review:        "Currently under Director Finance review.",
  ed_review:        "Currently with the Executive Director for review.",
  mt_review:        "Currently with the Managing Trustee for final sanction.",
  approved:         "Sanctioned for execution.",
  closed:           "Completed and handed over.",
};

export const PRIORITY_HINT = {
  top_priority:   "Highest priority for the fiscal year.",
  first_priority: "High priority for the fiscal year.",
  second_priority:"Medium priority — scheduled after higher-priority work.",
  third_priority: "Lower priority — subject to available budget.",
  carry_forward:  "Carried over from the previous fiscal year.",
};


// ─── RANK RAMP ───────────────────────────────────────────────────────────────
// A ranked list drawn in one colour makes ten rows of near-identical length
// hard to separate, and ten gold bars breaks §2's rule that gold is an accent
// rather than the theme. This walks a curated brand ramp across the ranks, so
// position in the list is legible from hue as well as bar length.
//
// The ramp stays inside the Riphah family — deep blue through to teal — which
// is what keeps it reading as institutional rather than as a rainbow chart.
const _hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const _mix = (a, b, t) => {
  const A = _hex(a), B = _hex(b);
  return "#" + [0, 1, 2]
    .map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0"))
    .join("").toUpperCase();
};

export const RANK_RAMP = ["#2C5FA8", "#2C7BC4", "#4A9BE0", "#2BC0D4", "#22C4A8"];

/** Colour for rank `i` of `n`, walked across RANK_RAMP. */
export const rampColor = (i, n, stops = RANK_RAMP) => {
  if (n <= 1) return stops[0];
  const pos = (i / (n - 1)) * (stops.length - 1);
  const lo = Math.floor(pos), hi = Math.min(stops.length - 1, lo + 1);
  return _mix(stops[lo], stops[hi], pos - lo);
};

// Amber ramp for anything flagged as pending or at risk, so those lists stay
// legible as "needs attention" rather than borrowing the neutral blue ramp.
export const ALERT_RAMP = ["#B8842E", "#E0A94A", "#E8A63C", "#E2725B", "#F0637D"];
