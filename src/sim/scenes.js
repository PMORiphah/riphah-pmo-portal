// PMO Simulation: the scenes of the 2:30 run on live portal data. Owner: B3b. Spec: contract §H.2,
// from the approved storyboard's ACTIONS (final.md) with the brief's overrides.
//
// buildScenes({ plan, lines, meta }) returns 21 scenes (n 0 opening … 19, 20 closing) as data for
// src/sim/director/engine.js. Every id, search text, campus and expected figure comes from the plan
// (src/sim/live/select.js) and the generated lines (src/sim/live/build.js) at launch; every element
// is found by the portal's data-* hooks. Nothing here names a person, a project, a campus or a figure.
//
// A scene: { n, chapter, page, lines:[ids], kicker?, critical?, closing?, skip?, setup:[steps], beats:[steps], extra? }
//   setup  runs first, without speech, holds or word waits; its steps are "ensure" steps that do
//          nothing in a normal run and bring the screen to the scene's starting point after a jump.
//   beats  the scene itself. Steps (engine.js _step):
//     { say: id }                    start a line (the screen acts in the next frame)
//     { endLine: true }              wait for the line to end and its minimum hold to pass
//     { after: s }                   wait until the line has run s seconds (70 % in a short scene)
//     { word: w, nth?, frac?, ifWord? } / { phrase: text|fn, frac?, ifWord? }
//                                    wait until the line reaches that word (ifWord: skip the step when
//                                    the spoken text does not have it); may carry an action too
//     { presenter: "card"|"dock" }   the opening's presenter card, or the caption dock
//     { figures: true }              check the current line's figures now (else at the line's end)
//     { nav: id, ready?, text? }     the sidebar page (clicked only when it is not the current one)
//     { tab: id, ready? }            a tab of the portal's tab strip (clicked only when not selected)
//     { click: t, unless?, then? }   { type: t, text }   { pick: combo, option }
//     { hover: t, at?, seek? }  { unhover: true }   { scroll: t, block? }   { key: "Escape" }
//     { wait: t, text?, count?, min?, gone? } | { test: fn }   (5 s of run time, then retry/skip;
//                                    soft: a cosmetic condition, only noted when it does not hold)
//     { spot: [t…] | null, ring?, dim? }  { mini: bool }  { hold: s, short?: s }  { store: [k, v] }
//     { do: "revealNav", arg }       a registered helper (guard.js HELPERS_OK)
//     { when: fn(api) } on any step skips it when fn() is false.
//   Targets (t) are selectors, or functions returning elements, evaluated when used (spotlights:
//   every frame). Every click, type, pick, key, storage write and helper goes through guard.js.
import { attr, one, hasText, textOf, widen, visibleRect } from "./director/dom.js";
import { sayText, sayInt, sayPercent, sayCampus } from "./live/say.js";

const q = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));
const NAV = (id) => attr("data-nav", id);

// ── helpers (registered: guard.js HELPERS_OK) ────────────────────────────────────────────────────
/** On a short screen the docked caption covers the lower sidebar items: scroll the sidebar's own list
 *  (never the page) so this item sits above the caption. */
export function revealNav(id) {
  const el = q(NAV(id)), cap = q('[data-sim-ui="caption"]');
  const nav = el?.closest("nav");
  if (!el || !nav) return;
  const r = el.getBoundingClientRect(), n = nav.getBoundingClientRect();
  const c = cap ? cap.getBoundingClientRect() : null;
  const limit = Math.min(c ? c.top - 10 : window.innerHeight - 10, n.bottom);
  if (r.bottom > limit) nav.scrollBy({ top: r.bottom - limit + 6, behavior: "smooth" });
}
export const HELPERS = Object.freeze({ revealNav });

/** A sidebar item, only when it is on screen and not under the caption dock (rings never scroll). */
function navInView(id) {
  const el = q(NAV(id));
  const r = visibleRect(el);
  if (!r) return null;
  const cap = q('[data-sim-ui="caption"]')?.getBoundingClientRect();
  if (cap && r.top + r.height > cap.top - 2 && r.left < cap.left + cap.width) return null;
  return el;
}

// Where a timeline row's bar is: its middle (or 200 px in, for a long bar), so the hover card opens
// beside the bar the audience is looking at.
export function barPoint(row) {
  const chart = row.children[1];
  const bar = chart ? Array.from(chart.children).find((c) => c.offsetHeight >= 10 && c.offsetHeight <= 22 && c.offsetWidth > 3) : null;
  const r = (bar || row).getBoundingClientRect();
  return { x: r.left + Math.min(r.width / 2, 200), y: r.top + r.height / 2 };
}

/** The month labels under the chart's X axis (Recharts 3, else Recharts 2 markup). */
function monthLabels(chart) {
  const v3 = Array.from(chart.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"));
  if (v3.length) return v3;
  return Array.from(chart.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick")).filter((t) => textOf(t));
}
/** The cashflow chart point for a month: a quarter band left of its axis label (inside the month's
 *  hover range whether the chart counts its bands from their start or their centre), at the middle of
 *  the plot area. */
function monthPoint(label) {
  return (chart) => {
    const ticks = monthLabels(chart);
    const centres = ticks.map((t) => { const r = t.getBoundingClientRect(); return r.left + r.width / 2; });
    const i = ticks.findIndex((t) => textOf(t) === String(label).toLowerCase());
    const grid = chart.querySelector(".recharts-cartesian-grid") || chart.querySelector(".recharts-surface") || chart;
    const g = grid.getBoundingClientRect();
    if (i < 0) return { x: g.left + g.width / 2, y: g.top + g.height / 2 };
    const gaps = centres.slice(1).map((c, k) => c - centres[k]).filter((d) => d > 0).sort((a, b) => a - b);
    const band = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    return { x: centres[i] - band / 4, y: g.top + g.height / 2 };
  };
}
/** After a hover: the point one band left or right when the chart's tooltip shows a neighbouring
 *  month (a chart can count its bands from their start), or null when it shows the wanted month. */
function monthSeek(label) {
  return (chart, pt) => {
    const tip = chartTip()[0];
    if (!tip || !pt) return null;
    const ticks = monthLabels(chart);
    const names = ticks.map((t) => textOf(t));
    const want = names.indexOf(String(label).toLowerCase());
    const shown = names.findIndex((n) => n && hasText(tip, n));
    if (want < 0 || shown < 0 || shown === want) return null;
    const centres = ticks.map((t) => { const r = t.getBoundingClientRect(); return r.left + r.width / 2; });
    const band = centres.length > 1 ? Math.abs(centres[1] - centres[0]) : 0;
    return band ? { x: pt.x - (shown - want) * band, y: pt.y } : null;
  };
}
/** The chart's tooltip, once it shows something. */
function chartTip() {
  return qa('[data-tour="cf-monthly"] .recharts-tooltip-wrapper').filter((e) => e.offsetWidth > 20 && getComputedStyle(e).visibility !== "hidden"
    && (e.textContent || "").trim().length > 0);
}
function chartSurface() {
  return q('[data-tour="cf-monthly"] .recharts-wrapper') || q('[data-tour="cf-monthly"] .recharts-surface');
}

const selected = (el) => !!el && (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true"
  || el.getAttribute("aria-current") === "true" || parseInt(getComputedStyle(el).fontWeight, 10) >= 650);

export function buildScenes({ plan, lines, meta = {} } = {}) {
  const P = plan || {};
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const skipOf = (ids) => ids.every((id) => !byId.get(id) || byId.get(id).skip);
  const campuses = meta.tables?.campuses || [];
  const profiles = meta.tables?.user_profiles || [];
  const sayName = (t) => sayText(String(t ?? ""));
  const sayC = (name) => sayText(sayCampus(name, campuses));

  // ── the plan's subjects ─────────────────────────────────────────────────────────────────────────
  const story = P.story || null;
  const SID = story?.id;
  const storyTr = SID ? `tr${attr("data-project-id", SID)}` : null;
  const storyOpen = () => !!SID && !!q('[data-tab="documents"]') && hasText(q('[data-tour="detail-hero"]'), story.code);
  const projectRows = () => qa('[data-tour="projects-table"] tr[data-project-id]');
  const dfLive = !!P.dashboard?.dfLive;
  const reviewer = P.pdd?.reviewer || null;
  const list = "#dash-project-list";
  const compare = P.compare || { columns: [], tickOps: [], leaders: {} };
  const cols = compare.columns || [];
  const h2hCols = () => qa('[data-tour="compare-h2h-grid"] [data-campus]');
  const h2hCol = (c) => h2hCols().find((e) => e.getAttribute("data-campus") === c) || null;
  const metricOf = (c, m) => () => h2hCol(c)?.querySelector(attr("data-metric", m)) || null;
  const tickBox = (c) => () => one(`[data-tour="compare-table"] tr${attr("data-campus", c)} input[type="checkbox"]`);
  const compareRow = (c) => () => one(`[data-tour="compare-table"] tr${attr("data-campus", c)}`);
  const h2hMatches = () => {
    const shown = h2hCols().map((e) => e.getAttribute("data-campus"));
    return shown.length === cols.length && cols.every((c) => shown.includes(c));
  };
  const assign = P.assign || {};
  const users = P.users || {};
  const testNames = new Set(profiles.filter((p) => (users.testIds || []).includes(p.id)).map((p) => p.username));
  const row = users.row || null;
  const upd = P.updates || {};
  const past = P.past || {};
  const gal = P.gallery || {};
  const rep = P.report || {};
  const risks = P.risks || {};
  const perf = P.performance || {};
  const tl = P.timeline || {};
  const cf = P.cashflow || {};
  const pay = P.payments || {};

  // The list header names the stage it shows ("… — ED Review"). The matrix draws its active cell with a
  // white border (RiskRegister MatrixCell), which is the cell filter's own state.
  const STAGE_LIST = { in_df: "df review", in_ed: "ed review", in_mt: "mt review" };
  const cellOn = () => {
    const b = q(attr("data-cell", risks.cell || ""));
    try { return !!b && getComputedStyle(b).borderTopColor.replace(/\s+/g, "") === "rgb(255,255,255)"; } catch { return false; }
  };

  // Opening a story project from wherever the screen is (setup of scenes 7 and 8 after a jump).
  const openStory = SID ? [
    { nav: "proj", ready: '[data-tour="projects-search"]', when: () => !storyOpen() },
    { type: '[data-tour="projects-search"]', text: story.searchText, when: () => !storyOpen() },
    { click: storyTr, when: () => !storyOpen(), label: "story project row" },
    { wait: '[data-tab="documents"]', label: "story project open" },
  ] : [];

  // Compare › head to head with the plan's columns (scene 12's route, as an ensure for scene 13).
  const compareSetup = [
    { store: ["pmo-campus-view", "compare"] },
    { nav: "camp", ready: '[data-tour="campus-view"]' },
    { click: '[data-view="compare"]', unless: () => selected(q('[data-view="compare"]')), label: "Compare view" },
    { click: '[data-mode="all"]', when: () => !h2hMatches() && !!q('[data-mode="all"]') && !selected(q('[data-mode="all"]')), label: "All campuses" },
    ...(compare.tickOps || []).map((op) => ({
      click: tickBox(op.campus), when: () => !h2hMatches() && !!tickBox(op.campus)() && tickBox(op.campus)().checked !== (op.op === "tick"),
      label: `${op.op} a campus`,
    })),
    { click: '[data-mode="h2h"]', unless: () => selected(q('[data-mode="h2h"]')), label: "Head to head" },
    { wait: '[data-tour="compare-h2h-grid"] [data-campus]', count: cols.length, label: "head to head columns" },
  ];

  // ── the words the beats wait for (from the plan, in their spoken form) ──────────────────────────
  const aliasSay = story ? sayName(story.alias) : null;
  const tagSay = story ? sayName(story.tag) : null;
  const pctWord = pay.relPctText ? sayPercent(pay.relPctText) : null;
  const stageSay = story ? (story.stage === "closed" ? "closed" : "approved") : null;
  const trailerSay = compare.leaders?.T ? sayC(compare.leaders.T) : null;
  const pmSay = row ? sayName((meta.say && meta.say[row.userId]) || row.fullName) : null;
  const noProgSay = past.noProgress > 0 ? `${sayInt(past.noProgress)} without` : null;

  // ── scenes ─────────────────────────────────────────────────────────────────────────────────────
  const scenes = [
    // ── 0 · Opening (critical) ──────────────────────────────────────────────────────────────────
    {
      n: 0, chapter: 1, page: "cmd", lines: ["o1", "o2"], critical: true,
      setup: [
        { nav: "cmd", ready: '[data-tour="hero-total"]' },
        { tab: "budgeting", ready: '[data-tour="hero-total"]' },
        { scroll: '[data-tour="hero"]', block: "start", instant: true },
      ],
      beats: [
        { presenter: "card" },
        // O1: the brand block and the page title; the hero's health block stays outside the light.
        { spot: ['[data-tour="brand"]', '[data-tour="page-title"]'], dim: 0.6 },
        { say: "o1" },
        { endLine: true },
        // O2 starts: the card folds into the caption dock (0.5 s), which then holds the caption.
        { presenter: "dock" },
        { say: "o2" },
        // O2: rings only, each at the start of its word; a ring that would need a scroll is left out.
        { word: "current", ifWord: true, spot: ['[data-sim-ui="badge"]'], ring: true },
        { word: "money", ifWord: true, spot: [NAV("cmd"), NAV("cashflow")], ring: true },
        { word: "projects", ifWord: true, spot: [NAV("proj")], ring: true },
        { word: "sites", ifWord: true, spot: [NAV("camp")], ring: true },
        { word: "people", ifWord: true, when: () => !!navInView("users"), spot: [() => navInView("users")], ring: true },
        { word: "reports", ifWord: true, when: () => !!navInView("reports"), spot: [() => navInView("reports")], ring: true },
        // "Money first": the light settles on the Total CAPEX block, and scene 1 continues there.
        { word: "money", nth: 2, frac: 0.85, spot: ['[data-tour="hero-total"]'] },
      ],
    },

    // ── 1 · Capex dashboard (critical) ──────────────────────────────────────────────────────────
    {
      n: 1, chapter: 1, page: "cmd", lines: ["s01"], critical: true,
      setup: [
        { nav: "cmd", ready: '[data-tour="hero-total"]' },
        { tab: "budgeting", ready: '[data-kpi="df_recommended"]' },
        { scroll: '[data-tour="hero"]', block: "start", instant: true },
      ],
      beats: [
        { say: "s01" },
        { spot: ['[data-tour="hero-total"]'] },
        // The DF Recommended card with its tooltip, only while the card is live (no typed figure).
        { after: 1.4, when: () => dfLive, hover: '[data-kpi="df_recommended"]' },
        { when: () => dfLive, spot: ['[data-tour="hero-total"]', '[data-kpi="df_recommended"]',
          () => qa('[role="tooltip"]').filter((e) => e.offsetWidth > 60)] },
        { after: 4.0, when: () => dfLive, unhover: true },
        { when: () => dfLive, spot: ['[data-tour="hero-total"]'] },
        // "health …": only the two "N of M projects" hint lines; the verdict and the indices stay dim.
        { word: "health", ifWord: true, spot: ['[data-tour="hero-cpi-hint"]', '[data-tour="hero-spi-hint"]'], pad: 4 },
      ],
    },

    // ── 2 · Investments ─────────────────────────────────────────────────────────────────────────
    {
      n: 2, chapter: 1, page: "cmd", lines: ["s02"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero-total"]' }],
      beats: [
        { say: "s02" },
        { tab: "investments", ready: '[data-tour="investments-panel"]' },
        { spot: ['[data-tour="hero-total"]', '[data-tour="inv-banner"]', { union: () => qa("[data-inv]") }, '[data-tour="inv-register"]'] },
      ],
    },

    // ── 3 · PDD Status ──────────────────────────────────────────────────────────────────────────
    {
      n: 3, chapter: 1, page: "cmd", lines: ["s03"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero-total"]' }],
      beats: [
        { say: "s03" },
        { tab: "pipeline", ready: '[data-tour="pipeline-stages"]' },
        { spot: [{ union: () => qa('[data-kpi="pdd_not_submitted"], [data-kpi="pdd_submitted"], [data-kpi="in_df"], [data-kpi="in_ed"], [data-kpi="in_mt"], [data-kpi="approved"]') },
          '[data-tour="pipeline-stages"]'] },
        // At "await": the reviewer stage holding the most projects (never a stage at 0).
        { word: "await", frac: 0.4, when: (a) => !!reviewer && !a.plain("s03"),
          click: reviewer ? attr("data-stage", reviewer) : null,
          unless: () => hasText(q(list), STAGE_LIST[reviewer] || "review"), then: { wait: list, text: STAGE_LIST[reviewer] || "review" }, label: "reviewer stage" },
        { when: (a) => !!reviewer && !a.plain("s03"), spot: [attr("data-kpi", reviewer), attr("data-stage", reviewer)] },
        { when: (a) => !!reviewer && !a.plain("s03"), hold: 0.3, short: 0.3 },
        // The list sits below the stage cards: brought into view, it is what stays lit.
        { when: (a) => !!reviewer && !a.plain("s03"), scroll: list, block: "center" },
        { when: (a) => !!reviewer && !a.plain("s03"), spot: [list] },
      ],
    },

    // ── 4 · Payments Status ─────────────────────────────────────────────────────────────────────
    {
      n: 4, chapter: 1, page: "cmd", lines: ["s04"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero-total"]' }],
      beats: [
        { say: "s04" },
        { tab: "financials", ready: '[data-kpi="budget_released"]' },
        { spot: ['[data-kpi="budget_released"]'] },
        // At the percent (or, in the short line, at "payments" after the title): the money flow.
        { phrase: pctWord, frac: 0.55, ifWord: true, scroll: '[data-tour="money-flow"]', block: "center" },
        { word: "payments", nth: 2, frac: 0.35, when: (a) => !pctWord || a.plain("s04"), scroll: '[data-tour="money-flow"]', block: "center" },
        { spot: ['[data-tour="money-flow"]'] },
      ],
    },

    // ── 5 · Cashflows ───────────────────────────────────────────────────────────────────────────
    {
      n: 5, chapter: 1, page: "cashflow", lines: ["s05"],
      beats: [
        { say: "s05" },                                   // speak first: this page renders slowest
        { nav: "cashflow", ready: '[data-tour="cf-monthly"]' },
        { wait: '[data-tour="cf-peak"]', label: "peak month tile" },
        { test: () => !!chartSurface() && monthLabels(chartSurface()).length > 0, label: "monthly chart", when: () => !!cf.hasRows },
        { spot: ['[data-tour="cf-monthly"]', '[data-tour="cf-peak"]'] },
        { word: cf.monthName || "", ifWord: true, when: (a) => !!cf.hasRows && !a.plain("s05"),
          hover: chartSurface, at: monthPoint(cf.peakLabel), seek: monthSeek(cf.peakLabel) },
        { when: (a) => !!cf.hasRows && !a.plain("s05"),
          spot: ['[data-tour="cf-monthly"]', '[data-tour="cf-peak"]', chartTip] },
        { when: (a) => !!cf.hasRows && !a.plain("s05") && !!cf.peakLabel,
          test: () => chartTip().some((e) => hasText(e, cf.peakLabel)), label: "the peak month's tooltip", timeout: 2, soft: true },
        { endLine: true },
        { unhover: true },
      ],
    },

    // ── 6 · Projects ────────────────────────────────────────────────────────────────────────────
    {
      n: 6, chapter: 2, page: "proj", lines: ["s06"],
      beats: [
        { say: "s06" },
        { nav: "proj", ready: '[data-tour="projects-search"]' },
        { spot: [() => widen(q('[data-tour="projects-search"]'), 260), '[data-tour="projects-hero"]'] },
        ...(SID ? [
          { word: "reports", frac: 0.45, when: (a) => !a.plain("s06"), type: '[data-tour="projects-search"]', text: story.searchText, cps: 15 },
          { after: 0.6, when: (a) => a.plain("s06"), type: '[data-tour="projects-search"]', text: story.searchText, cps: 15 },
          { test: () => projectRows().length === story.searchRows && !!q(storyTr), label: "the search rows" },
          { spot: [storyTr, '[data-tour="projects-hero"]'] },
          { phrase: aliasSay, frac: 0.7, click: storyTr, unless: storyOpen, label: "story project row" },
          { wait: '[data-tab="documents"]', label: "project tabs" },
          // Documents at once: the Overview (with the manager's contact card) is on screen under 0.5 s.
          { tab: "documents", ready: '[data-tour="detail-documents"]' },
          { spot: ['[data-tour="detail-hero"]'] },
          { test: storyOpen, label: "story project header" },
        ] : [
          { spot: [() => widen(q('[data-tour="projects-search"]'), 260), '[data-tour="projects-hero"]', '[data-tour="projects-table"]'] },
        ]),
      ],
    },

    // ── 7 · Documents (inside the story project) ────────────────────────────────────────────────
    {
      n: 7, chapter: 2, page: "proj", lines: ["s07"],
      setup: openStory,
      beats: SID ? [
        { say: "s07" },
        { tab: "documents", ready: '[data-tour="detail-documents"]' },
        { wait: '[data-tour="doc-card"]', min: 1, label: "document cards", when: () => story.docCount > 0 },
        { spot: ['[data-tour="detail-documents"]'] },
        { when: () => !!story.pddFile, hover: `[data-tour="doc-card"]${attr("data-file", story.pddFile || "")}` },
        { phrase: stageSay, frac: 0.5, ifWord: true, when: () => story.docCount > 0,
          spot: ['[data-tour="detail-badges"] > :first-child', '[data-tour="detail-approved"]', '[data-strip="released"]', '[data-strip="progress"]'] },
      ] : [],
    },

    // ── 8 · WBS (inside the story project) ──────────────────────────────────────────────────────
    {
      n: 8, chapter: 2, page: "proj", lines: ["s08"],
      setup: openStory,
      beats: SID ? [
        { say: "s08" },
        { tab: "wbs", ready: '[data-tour="wbs-header"]' },
        ...(story.tasks > 0 ? [
          { wait: "[data-wbs-row]", min: 1, label: "WBS rows" },
          { spot: ['[data-tour="wbs-header"]', { union: () => qa("[data-wbs-row]").slice(0, 8) }] },
        ] : [
          { wait: '[data-tour="wbs-empty"]', label: "the empty breakdown" },
          { spot: ['[data-tour="wbs-header"]', '[data-tour="wbs-empty"]'] },
        ]),
      ] : [],
    },

    // ── 9 · Timeline ────────────────────────────────────────────────────────────────────────────
    {
      n: 9, chapter: 3, page: "schedule", lines: ["s09"],
      beats: [
        { say: "s09" },
        { nav: "schedule", ready: '[data-tour="timeline-caption"]', text: "scheduled" },
        { wait: '[data-tour="timeline"]', label: "timeline" },
        // The default view (red bars as the code colours them) stays lit at least 3.5 s.
        { spot: ['[data-tour="timeline"]'] },
        ...(SID && tl.campus ? [
          { after: 4.3, when: (a) => !a.plain("s09") },
          { phrase: tagSay, frac: 0.62, ifWord: true, when: (a) => !a.plain("s09"),
            pick: '[data-tour="timeline-campus"]', option: `[role="listbox"] [role="option"]${attr("data-value", tl.campus)}`,
            unless: () => hasText(q('[data-tour="timeline-campus"]'), tl.campus), label: "timeline campus" },
          { when: (a) => !a.plain("s09"), wait: `[data-tour="timeline"] ${attr("data-project-id", SID)}`, label: "story timeline row" },
          { when: (a) => !a.plain("s09"), scroll: `[data-tour="timeline"] ${attr("data-project-id", SID)}`, block: "center" },
          { when: (a) => !a.plain("s09"), hover: `[data-tour="timeline"] ${attr("data-project-id", SID)}`, at: barPoint },
          { when: (a) => !a.plain("s09"), wait: '[data-tour="timeline-card"]', label: "timeline hover card" },
          { when: (a) => !a.plain("s09"), spot: [`[data-tour="timeline"] ${attr("data-project-id", SID)}`, '[data-tour="timeline-card"]'] },
          { endLine: true },
          { unhover: true },
        ] : []),
      ],
    },

    // ── 10 · Performance ────────────────────────────────────────────────────────────────────────
    {
      n: 10, chapter: 3, page: "perf", lines: ["s10"],
      beats: [
        { say: "s10" },
        { nav: "perf", ready: '[data-tour="perf-table"]' },
        ...(SID && perf.storyShown ? [
          { wait: `tr${attr("data-project-id", SID)} td[data-col="pct"]`, label: "story row" },
          { scroll: `tr${attr("data-project-id", SID)}`, block: "center" },
          { spot: [`tr${attr("data-project-id", SID)} td[data-col="pct"]`, `tr${attr("data-project-id", SID)} td[data-col="schedule"]`] },
          { figures: true },
        ] : [
          { spot: ['[data-tour="perf-table"]'] },
        ]),
        // "most / all 'Delayed' …": the chip (never clicked), the % Done header and its dashes.
        { word: perf.variant === "all" ? "all" : "most", ifWord: true, when: () => perf.variant === "most" || perf.variant === "all",
          spot: ['[data-filter="delayed"]', { union: () => [q('th[data-col="pct"]'), ...qa('td[data-col="pct"]').filter((td) => textOf(td) === "—")].filter(Boolean) }] },
        { word: "report", frac: 0.6, ifWord: true, when: () => perf.variant === "count",
          spot: [{ union: () => [q('th[data-col="pct"]'), ...qa('td[data-col="pct"]')].filter(Boolean) }] },
      ],
    },

    // ── 11 · Risk Register ──────────────────────────────────────────────────────────────────────
    {
      n: 11, chapter: 3, page: "risks", lines: ["s11"],
      beats: [
        { say: "s11" },
        { nav: "risks", ready: '[data-tour="risk-matrix"]' },
        { wait: '[data-tour="risk-header"]', label: "risk header" },
        { spot: ['[data-tour="risk-header"]', '[data-tour="risk-matrix"]'] },
        ...(risks.cell ? [
          { word: "rated", frac: 0.4, ifWord: true, when: (a) => !a.plain("s11"),
            click: attr("data-cell", risks.cell), unless: cellOn, then: { test: cellOn, label: "risk list filtered" }, label: "risk matrix cell" },
          { word: "critical", frac: 0.8, ifWord: true, when: (a) => a.plain("s11"),
            click: attr("data-cell", risks.cell), unless: cellOn, then: { test: cellOn, label: "risk list filtered" }, label: "risk matrix cell" },
          { spot: [attr("data-cell", risks.cell), '[data-tour="risk-count"]', risks.rowId ? attr("data-risk", risks.rowId) : null].filter(Boolean) },
        ] : []),
      ],
    },

    // ── 12 · Campus Compare ─────────────────────────────────────────────────────────────────────
    {
      n: 12, chapter: 4, page: "camp", lines: ["s12a", "s12b"],
      setup: [{ store: ["pmo-campus-view", "compare"] }],
      beats: [
        { say: "s12a" },
        { nav: "camp", ready: '[data-tour="campus-view"]' },
        { click: '[data-view="compare"]', unless: () => selected(q('[data-view="compare"]')), label: "Compare view" },
        { click: '[data-mode="all"]', unless: () => !q('[data-mode="all"]') || selected(q('[data-mode="all"]')), label: "All campuses" },
        { wait: '[data-tour="compare-table"] tr[data-campus]', min: Math.min(2, compare.campusCount || 2), label: "compare rows" },
        { wait: '[data-tour="compare-summary"]', label: "compare summary" },
        { spot: ['[data-tour="compare-summary"]', '[data-tour="compare-table"]'] },
        // At "we" (short: at "side"): the light follows the tick boxes, 0.3 s apart.
        { word: "we", frac: 0.75, ifWord: true },
        { word: "side", frac: 0.6, ifWord: true, when: (a) => a.plain("s12a") },
        ...(compare.tickOps || []).flatMap((op) => [
          { spot: [compareRow(op.campus)] },
          { click: tickBox(op.campus), unless: () => !!tickBox(op.campus)() && tickBox(op.campus)().checked === (op.op === "tick"), label: `${op.op} a campus` },
          { hold: 0.3, short: 0.3 },
        ]),
        { figures: true },
        { click: '[data-mode="h2h"]', unless: () => selected(q('[data-mode="h2h"]')), label: "Head to head" },
        { wait: '[data-tour="compare-h2h-grid"] [data-campus]', count: cols.length, label: "head to head columns" },
        { say: "s12b" },
        { spot: cols.flatMap((c) => [metricOf(c, "Approved"), metricOf(c, "Released")]), pad: 4 },
        // The trailer: its Released share and its PDD backlog, said and lit together.
        ...(trailerSay ? [
          { phrase: trailerSay, frac: 0.45, ifWord: true, when: (a) => !a.plain("s12b"),
            spot: [...cols.flatMap((c) => [metricOf(c, "Approved"), metricOf(c, "Released")]), metricOf(compare.leaders.T, "PDD not submitted")], pad: 4 },
        ] : []),
        { figures: true },
        { word: "each", frac: 0.7 },
        { scroll: '[data-tour="h2h-pms"]', block: "center" },
        { spot: [() => qa('[data-tour="h2h-pms"]')] },
      ],
    },

    // ── 13 · Assign PM (preview, then Cancel) ───────────────────────────────────────────────────
    {
      n: 13, chapter: 4, page: "camp", lines: ["s13"], extra: 0.4,
      setup: compareSetup,
      beats: [
        { say: "s13" },
        ...(assign.campus && cols.includes(assign.campus) ? [
          { after: 0.3, click: () => h2hCol(assign.campus)?.querySelector('[data-tour="h2h-open"]'), label: "Open on the campus" },
        ] : assign.campus ? [
          { click: '[data-view="sites"]', unless: () => selected(q('[data-view="sites"]')), label: "Sites view" },
          { pick: '[data-tour="sites-campus"]', option: `[role="listbox"] [role="option"]${attr("data-value", assign.campus)}`,
            unless: () => hasText(q('[data-tour="sites-campus"]'), assign.campus), label: "Sites campus" },
        ] : []),
        { test: () => selected(q('[data-view="sites"]')) && hasText(q('[data-tour="sites-campus"]'), assign.campus || "")
            && !!q('[data-tour="assign-pm"]') && !q('[data-tour="assign-pm"]').disabled, label: "sites view" },
        { spot: ['[data-tour="sites-campus"]', () => widen(q('[data-tour="assign-pm"]'), 160, 120)], ring: true },
        { word: "previews", frac: 0.45, click: '[data-tour="assign-pm"]', unless: () => !!q('[data-tour="bulk-preview"]'), label: "Assign PM" },
        { wait: '[data-tour="bulk-preview"]', label: "assign preview" },
        { spot: [{ union: () => { const p = q('[data-tour="bulk-preview"]'); return p ? Array.from(p.children).slice(1, 3) : []; } }], ring: true },
        { endLine: true },
        { spot: null },
        { click: () => { const box = q('[data-tour="bulk-preview"]')?.closest('[role="dialog"]'); return box ? Array.from(box.querySelectorAll("button")).find((b) => /^\s*Cancel\s*$/.test(b.textContent || "")) : null; }, label: "Cancel" },
        { wait: '[data-tour="bulk-preview"]', gone: true, label: "dialog closed" },
      ],
    },

    // ── 14 · User Management ────────────────────────────────────────────────────────────────────
    {
      n: 14, chapter: 4, page: "users", lines: ["s14"],
      beats: [
        { say: "s14" },
        { do: "revealNav", arg: "users" },
        { nav: "users", ready: '[data-tour="users-table"]' },
        { wait: '[data-tour="users-header"]', text: "user", label: "users header" },
        { spot: ['[data-tour="users-header"]'] },
        // The Role and Assigned Projects columns, never the rows of test accounts.
        { after: 2.0, spot: () => columnBlocks(testNames) },
        ...(row ? [
          { phrase: pmSay, frac: 0.6, ifWord: true, scroll: `tr${attr("data-user", row.username)}`, block: "center" },
          { spot: [{ union: () => qa(`tr${attr("data-user", row.username)} td[data-col="username"], tr${attr("data-user", row.username)} td[data-col="fullname"]`) },
            `tr${attr("data-user", row.username)} td[data-col="role"]`, `tr${attr("data-user", row.username)} td[data-col="assigned"]`], pad: 4 },
        ] : []),
      ],
    },

    // ── 15 · Updates ────────────────────────────────────────────────────────────────────────────
    {
      n: 15, chapter: 5, page: "upd", lines: ["s15"],
      beats: [
        { say: "s15" },
        { do: "revealNav", arg: "upd" },
        { nav: "upd", ready: '[data-tour="updates-list"]' },
        { click: '[data-tour="updates-tab-all"]', unless: () => selected(q('[data-tour="updates-tab-all"]')), label: "All Projects" },
        ...(upd.variant === "pm" ? [
          { wait: `[data-tour="updates-list"] ${attr("data-project-id", upd.projectId)}`, label: "the thread in the list" },
          { spot: [`[data-tour="updates-list"] ${attr("data-project-id", upd.projectId)}`] },
          { word: "thread", frac: 0.3, click: `[data-tour="updates-list"] ${attr("data-project-id", upd.projectId)}`,
            unless: () => !!q(attr("data-comment", upd.lastCommentId)), label: "thread row" },
          { wait: attr("data-comment", upd.lastCommentId), label: "the manager's note" },
          { scroll: attr("data-comment", upd.lastCommentId), block: "center" },
          { spot: [attr("data-comment", upd.lastCommentId)] },
        ] : upd.variant === "newest" ? [
          { wait: '[data-tour="updates-list"] [data-project-id]', min: 1, label: "threads" },
          { spot: [{ union: () => qa('[data-tour="updates-list"] [data-project-id]').slice(0, 3) }] },
        ] : [
          { spot: ['[data-tour="updates-list"]'] },
        ]),
      ],
    },

    // ── 16 · Past Projects ──────────────────────────────────────────────────────────────────────
    {
      n: 16, chapter: 5, page: "past", lines: ["s16"],
      beats: [
        { say: "s16" },
        { do: "revealNav", arg: "past" },
        { nav: "past", ready: '[data-tour="past-cards"]' },
        { wait: '[data-card="still-open"]', label: "still open card" },
        { spot: ['[data-tour="past-cards"]'] },
        ...(noProgSay ? [{ phrase: noProgSay, frac: 0.55, ifWord: true, spot: ['[data-tour="past-cards"]', '[data-card="no-progress"]'] }] : []),
        // The cards are read before the list narrows and the project opens.
        { figures: true },
        ...(past.variant === "thread" ? [
          { word: "without", frac: 0.6, when: (a) => !a.plain("s16"), type: '[data-tour="past-search"]', text: past.searchText, cps: 15 },
          { when: (a) => !a.plain("s16"), wait: attr("data-past", past.id), label: "the past project row" },
          { when: (a) => !a.plain("s16"), click: attr("data-past", past.id), unless: () => !!q('[data-tour="past-thread"]'), label: "past project row" },
          { when: (a) => !a.plain("s16"), wait: `[data-tour="past-thread"] ${attr("data-msg", past.lastMessageId)}`, label: "follow-up thread" },
          { when: (a) => !a.plain("s16"), scroll: attr("data-msg", past.lastMessageId), block: "center" },
          { when: (a) => !a.plain("s16"), spot: ['[data-tour="past-thread"]', attr("data-msg", past.lastMessageId)] },
        ] : []),
      ],
    },

    // ── 17 · Gallery ────────────────────────────────────────────────────────────────────────────
    {
      n: 17, chapter: 5, page: "photowall", lines: ["s17"],
      beats: [
        { say: "s17" },
        { do: "revealNav", arg: "photowall" },
        { nav: "photowall", ready: '[data-tour="gallery-count"]' },
        ...((gal.variant === "subject" || gal.variant === "campus") && gal.campus ? [
          { pick: '[data-tour="gallery-campus"]', option: `[role="listbox"] [role="option"]${attr("data-value", gal.campus)}`,
            unless: () => hasText(q('[data-tour="gallery-campus"]'), gal.campus), label: "gallery campus" },
          { test: () => /\d+ of \d+/.test(textOf(q('[data-tour="gallery-count"]'))), label: "filtered count" },
        ] : []),
        ...(gal.total > 0 ? [
          { test: () => galleryLoaded(), label: "gallery pictures", timeout: 8 },
          { spot: ['[data-tour="gallery-count"]', '[data-tour="gallery-grid"]'] },
          ...(gal.firstPhotoId && gal.variant !== "all" ? [
            { word: "here", frac: 0.7, ifWord: true, spot: ['[data-tour="gallery-count"]', '[data-tour="gallery-grid"]', `[data-tour="gallery-grid"] ${attr("data-attachment", gal.firstPhotoId)}`] },
          ] : []),
        ] : [
          { spot: ['[data-tour="gallery-count"]'] },
        ]),
      ],
    },

    // ── 18 · Monthly Report ─────────────────────────────────────────────────────────────────────
    {
      n: 18, chapter: 6, page: "reports", lines: ["s18"], kicker: rep.kicker || undefined,
      beats: [
        { say: "s18" },
        { do: "revealNav", arg: "reports" },
        { nav: "reports", ready: rep.id ? attr("data-report", rep.id) : "[data-report]" },
        { spot: [{ union: () => qa("[data-report]") }] },
        ...(rep.id && ["published", "draft", "nothing"].includes(rep.variant) ? [
          { word: rep.variant === "published" ? "published" : "yet", frac: 0.4, when: (a) => !a.plain("s18"),
            click: attr("data-report", rep.id), unless: () => !!q('[data-tour="report-viewer"]'), label: "the report" },
          { word: "draft", frac: 0.4, ifWord: true, when: (a) => a.plain("s18"),
            click: attr("data-report", rep.id), unless: () => !!q('[data-tour="report-viewer"]'), label: "the report" },
          { wait: '[data-tour="report-viewer"]', label: "the report viewer" },
          { mini: true },
          { spot: ['[data-tour="report-chip"]', '[data-tile="capex"]', '[data-tile="approved"]', '[data-tile="released"]'], pad: 4 },
          { word: rep.variant === "nothing" ? "shows" : "what", frac: 0.75, ifWord: true, when: (a) => !a.plain("s18"),
            scroll: '[data-tour="report-attention-head"]', block: "start", force: true },
          { when: (a) => a.plain("s18"), endLine: true },
          { when: (a) => a.plain("s18"), scroll: '[data-tour="report-attention-head"]', block: "start", force: true },
          { spot: ['[data-tour="report-attention-head"]', '[data-tour="report-attention"]'] },
          { after: 7.0, when: (a) => !a.plain("s18") },
          { hold: 1.0, short: 1.0, when: (a) => a.plain("s18") },
          { spot: null },
          { click: '[data-tour="report-back"]', label: "Back" },
          { wait: '[data-tour="report-viewer"]', gone: true, label: "report closed" },
          { mini: false },
        ] : []),
      ],
    },

    // ── 19 · Team & About ───────────────────────────────────────────────────────────────────────
    {
      n: 19, chapter: 6, page: "team", lines: ["s19"],
      beats: [
        { say: "s19" },
        { do: "revealNav", arg: "team" },
        { nav: "team", ready: '[data-tour="team-about"]' },
        { spot: ['[data-tour="team-about"]'] },
        { after: 0.5, scroll: '[data-tour="team-org"]', block: "center" },
        { spot: ['[data-tour="team-org"]'] },
        { after: 2.9, scroll: '[data-tour="team-contact"]', block: "center" },
        { spot: ['[data-tour="team-contact"]'] },
      ],
    },

    // ── 20 · Closing ────────────────────────────────────────────────────────────────────────────
    { n: 20, chapter: 6, page: null, lines: ["c1"], closing: true, beats: [{ say: "c1" }] },
  ];

  for (const sc of scenes) {
    if (!sc.closing && skipOf(sc.lines)) { sc.skip = true; sc.skipReason = "the data has nothing for it to show"; }
    sc.setup ||= [];
  }
  return scenes;
}

/** The Role and Assigned Projects cells as lit areas ({ union } targets), one per column and per run
 *  of rows that are not test accounts, so a test account's row is never lit. */
function columnBlocks(testNames) {
  const rows = qa('[data-tour="users-table"] tr[data-user]');
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const group = run;
    for (const col of ["role", "assigned"]) {
      out.push({ union: () => group.map((r) => r.querySelector(`td[data-col="${col}"]`)).filter(Boolean) });
    }
    run = [];
  };
  for (const r of rows) {
    if (testNames.has(r.getAttribute("data-user"))) flush();
    else run.push(r);
  }
  flush();
  return out.slice(0, 10);
}

/** The first screenful of the Gallery has drawn: photos decoded, video frames ready. */
function galleryLoaded() {
  const tiles = qa('[data-tour="gallery-grid"] [data-attachment]');
  if (!tiles.length) return false;
  const want = Math.min(12, tiles.length);
  let ok = 0;
  for (const t of tiles.slice(0, want)) {
    const img = t.querySelector("img");
    if ((img && img.complete && img.naturalWidth > 0) || (!img && t.querySelector("video"))) ok++;
  }
  return ok >= want;
}

/** Every selector-like hook the scenes rely on (for the readiness self-check and the inventory test). */
export const HOOKS = Object.freeze([
  "[data-nav]", "[data-tab]", '[data-tour="brand"]', '[data-tour="page-title"]', '[data-tour="hero"]', '[data-tour="hero-total"]',
  '[data-tour="hero-cpi-hint"]', '[data-tour="hero-spi-hint"]', '[data-kpi="df_recommended"]', '[data-kpi="budget_released"]',
  '[data-tour="investments-panel"]', '[data-tour="inv-banner"]', "[data-inv]", '[data-tour="inv-register"]',
  '[data-tour="pipeline-stages"]', "[data-stage]", "#dash-project-list", '[data-tour="money-flow"]',
  '[data-tour="cf-monthly"]', '[data-tour="cf-peak"]', '[data-tour="projects-search"]', '[data-tour="projects-hero"]',
  '[data-tour="projects-table"]', "tr[data-project-id]", '[data-tour="detail-hero"]', '[data-tour="detail-documents"]',
  '[data-tour="doc-card"][data-file]', '[data-tour="detail-badges"]', '[data-tour="detail-approved"]', "[data-strip]",
  '[data-tour="wbs-header"]', '[data-tour="wbs-empty"]', "[data-wbs-row]", '[data-tour="timeline"]', '[data-tour="timeline-caption"]',
  '[data-tour="timeline-campus"]', '[data-tour="timeline-card"]', '[data-tour="perf-table"]', 'td[data-col="pct"]',
  'td[data-col="schedule"]', '[data-filter="delayed"]', '[data-tour="risk-header"]', '[data-tour="risk-matrix"]', "[data-cell]",
  '[data-tour="risk-count"]', "[data-risk]", '[data-tour="campus-view"]', "[data-view]", "[data-mode]",
  '[data-tour="compare-summary"]', '[data-tour="compare-table"] tr[data-campus]', '[data-tour="compare-h2h-grid"] [data-campus]',
  "[data-metric]", '[data-tour="h2h-pms"]', '[data-tour="h2h-open"]', '[data-tour="sites-campus"]', '[data-tour="assign-pm"]',
  '[data-tour="bulk-preview"]', '[data-tour="users-header"]', '[data-tour="users-table"] tr[data-user]', 'td[data-col="role"]',
  'td[data-col="assigned"]', '[data-tour="updates-tab-all"]', '[data-tour="updates-list"]', "[data-comment]",
  '[data-tour="past-cards"]', "[data-card]", '[data-tour="past-search"]', "[data-past]", '[data-tour="past-thread"]', "[data-msg]",
  '[data-tour="gallery-campus"]', '[data-tour="gallery-count"]', '[data-tour="gallery-grid"] [data-attachment]', "[data-report]",
  '[data-tour="report-viewer"]', '[data-tour="report-chip"]', "[data-tile]", '[data-tour="report-attention-head"]',
  '[data-tour="report-attention"]', '[data-tour="report-back"]', '[data-tour="team-about"]', '[data-tour="team-org"]',
  '[data-tour="team-contact"]',
]);
