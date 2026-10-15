// PMO Simulation: the 20 scenes of the two-minute run (plan §2, as corrected in §4, §5a and §7).
//
// buildScenes(meta, cast) returns the scenes as data for src/sim/director/engine.js. Every id, search
// text and expected figure comes from the resolved SEED.meta (src/sim/data/seed.json → meta), and
// every element is found by the portal's data-* hooks; nothing here names a person or a project.
//
// A scene: { n, chapter, page, lines:[narration ids], kicker?, setup:[steps], beats:[steps] }.
//   setup  runs first, without speech or holds; its steps are "ensure" steps that do nothing in a
//          normal run and bring the screen to the scene's starting point after a jump or a retry.
//   beats  the scene itself. Steps (engine.js _step):
//     { say: id }                 start a line (the screen acts in the next frame)
//     { endLine: true }           wait for the line to end and its minimum hold to pass
//     { nav: id, ready?, text? }  the sidebar page (clicked only when it is not the current one)
//     { tab: id, ready? }         a tab of the portal's tab strip (clicked only when not selected)
//     { click: t, unless?, then? }   { type: t, text }   { pick: combo, option }
//     { hover: t, at? }  { unhover: true }   { scroll: t, block? }   { key: "Escape" }
//     { wait: t, text?, count?, min?, gone? } | { test: fn }   (4 s of run time, then retry/skip)
//     { spot: [t…] | null, ring? }  { mini: bool }  { hold: s, short?: s }  { store: [k, v] }
//     { when: fn } on any step skips it when fn() is false.
//   Targets (t) are selectors, or functions returning elements, evaluated when used (spotlights:
//   every frame).
import { attr, one, hasText, leaves, widen, textOf } from "./director/dom.js";

const q = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

export function buildScenes(meta = {}, cast = null) {
  const X = meta.expect || {};
  const ex = (n, k, d = "") => (X[n] && X[n][k] != null ? String(X[n][k]) : d);
  const SID = meta.storyProjectId;
  const C = (slot) => cast?.campuses?.[slot]?.name || "";
  const thirdCampus = meta.h2hThirdCampus || C(meta.h2hThirdCampusSlot);
  const assignCampus = meta.assignCampus || C(meta.assignCampusSlot);
  const assignPm = cast?.pms?.[meta.assignPmSlot]?.name || "";

  // ── shared targets ─────────────────────────────────────────────────────────────────────────────
  const list = "#dash-project-list";
  // The story project's row inside a container ("" = anywhere); storyTr: its Projects table row.
  const storyRow = (scope = "") => `${scope} ${attr("data-project-id", SID)}`.trim();
  const storyTr = `tr${attr("data-project-id", SID)}`;
  const storyOpen = () => !!q('[data-tab="documents"]') && hasText(q('[data-tour="detail-hero"]'), meta.storyProjectCode);
  const projectRows = () => qa("tr[data-project-id]");
  const compareRows = () => qa('[data-tour="compare-table"] tr[data-campus]');
  const h2hCols = () => qa('[data-tour="compare-h2h-grid"] [data-campus]');
  const h2hCol = (name) => h2hCols().find((e) => e.getAttribute("data-campus") === name) || null;
  const tickBox = (name) => () => one(`[data-tour="compare-table"] tr${attr("data-campus", name)} input[type="checkbox"]`);
  const sel = (s) => q(s)?.getAttribute("aria-selected") === "true";
  // Approved and Released in one head-to-head column: the label's block, when it carries a PKR figure.
  const h2hMoney = (i) => () => {
    const col = h2hCols()[i];
    return col ? leaves(col, /^(Approved|Released)$/i).map((l) => l.parentElement?.parentElement)
      .filter((b) => b && /PKR/.test(b.textContent || "")) : [];
  };
  const releasedDesc = () => !!q('th[data-col="released"] svg.lucide-arrow-down');
  const firstCompareCampus = () => compareRows()[0]?.getAttribute("data-campus") || "";
  const wbsRows = () => qa("[data-wbs-row]");
  const galleryTiles = () => qa('[data-tour="gallery-grid"] [data-attachment]');
  const galleryLoaded = () => {
    const tiles = galleryTiles();
    if (!tiles.length) return false;
    const want = Math.min(+ex(17, "minTiles", "12") || 12, tiles.length);
    let ok = 0;
    for (const t of tiles) {
      const img = t.querySelector("img");
      if (!img || (img.complete && img.naturalWidth > 0)) ok++;
    }
    return ok >= want;
  };
  const cancelButton = () => {
    const box = q('[data-tour="bulk-preview"]')?.closest('[role="dialog"]');
    return box ? Array.from(box.querySelectorAll("button")).find((b) => /^\s*Cancel\s*$/i.test(b.textContent || "")) : null;
  };
  const previewLines = () => {
    const p = q('[data-tour="bulk-preview"]');
    if (!p) return [];
    const kids = Array.from(p.children);
    return [kids[1], kids[2]?.firstElementChild].filter(Boolean);
  };
  const pageText = (re) => leaves(document.querySelector("[data-sim-app]") || document.body, re);
  const showingDelayed = () => pageText(/^Showing\b/i).some((e) => hasText(e, ex(9, "showing", "Showing")));
  const riskCount = () => pageText(/^\d+ of \d+$/).some((e) => textOf(e) === ex(11, "listCount").toLowerCase());
  const openStoryProject = [
    { nav: "proj", ready: '[data-tour="projects-search"]', when: () => !storyOpen() },
    { type: '[data-tour="projects-search"]', text: meta.storySearch, when: () => !storyOpen() },
    { click: storyTr, when: () => !storyOpen(), label: "story project row" },
    { wait: '[data-tab="documents"]', label: "story project open" },
  ];

  return [
    // ── Chapter 1 · Portfolio ───────────────────────────────────────────────────────────────────
    {
      n: 1, chapter: 1, page: "cmd", lines: ["s01"],
      setup: [
        { nav: "cmd", ready: '[data-tour="hero"]' },
        { tab: "budgeting", ready: '[data-kpi="df_recommended"]' },
        { scroll: '[data-tour="hero"]', block: "start", instant: true },
      ],
      beats: [
        { say: "s01" },
        { spot: ['[data-tour="hero"]'] },
        { hold: 3.4, short: 2.2 },
        // The DF Recommended card with its hover text ("Portfolio value recommended after Director
        // Finance review."); while touring the tip is lifted above the dim (InsightTip).
        { spot: ['[data-kpi="df_recommended"]', () => qa('body > [role="tooltip"], [role="tooltip"]').filter((e) => e.offsetWidth > 60)] },
        { hover: '[data-kpi="df_recommended"]' },
        { hold: 4.0, short: 2.6 },
        { unhover: true },
        { spot: ['[data-tour="hero"]', '[data-kpi="df_recommended"]'] },
      ],
    },
    {
      n: 2, chapter: 1, page: "cmd", lines: ["s02"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero"]' }],
      beats: [
        { say: "s02" },
        { tab: "investments", ready: '[data-tour="investments-panel"]', text: "investment register" },
        { spot: ['[data-tour="hero"]', '[data-tour="investments-panel"]'] },
      ],
    },
    {
      n: 3, chapter: 1, page: "cmd", lines: ["s03"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero"]' }],
      beats: [
        { say: "s03" },
        { tab: "pipeline", ready: '[data-stage="in_mt"]' },
        { spot: ['[data-tour="pipeline-stages"]', '[data-stage="in_mt"]'] },
        { hold: 1.3, short: 0.8 },
        { click: '[data-stage="in_mt"]', unless: () => hasText(q(list), "mt review"),
          then: { wait: list, text: ex(3, "listHeader", "projects") } },
        { scroll: list, block: "center" },
        { spot: ['[data-stage="in_mt"]', list] },
      ],
    },
    {
      n: 4, chapter: 1, page: "cmd", lines: ["s04"],
      setup: [{ nav: "cmd", ready: '[data-tour="hero"]' }],
      beats: [
        { say: "s04" },
        { tab: "financials", ready: '[data-kpi="budget_released"]' },
        { spot: ['[data-kpi="budget_released"]'] },
        // The count-up has finished before the figure is spoken (late in the line).
        { wait: '[data-kpi="budget_released"]', text: ex(4, "released"), label: "released figure" },
        { hold: 1.6, short: 1.0 },
        // A plain click (element.click(): no hover, so no tooltip over the list).
        { click: '[data-kpi="budget_released"]', unless: () => hasText(q(list), "budget released"),
          then: { wait: list, text: ex(4, "listHeader", "projects") } },
        { hold: 0.15 },
        { scroll: list, block: "start", force: true },
        { spot: [list] },
      ],
    },
    {
      n: 5, chapter: 1, page: "cashflow", lines: ["s05"],
      beats: [
        { say: "s05" },                                   // speak first: this page renders slowest
        { nav: "cashflow", ready: '[data-tour="cf-monthly"]' },
        { spot: ['[data-tour="cf-monthly"]'] },
        { wait: '[data-tour="cf-pmdc"]', text: ex(5, "pmdc", "PKR"), label: "PMDC tile" },
        { hold: 1.8, short: 1.2 },
        { spot: ['[data-tour="cf-pmdc"]', () => qa('[role="tooltip"]').filter((e) => e.offsetWidth > 60)] },
        { hover: '[data-tour="cf-pmdc"]' },
        { endLine: true },
        { unhover: true },
      ],
    },

    // ── Chapter 2 · Inside a project ────────────────────────────────────────────────────────────
    {
      n: 6, chapter: 2, page: "proj", lines: ["s06"],
      beats: [
        { say: "s06" },
        { nav: "proj", ready: '[data-tour="projects-search"]' },
        { spot: [() => widen(q('[data-tour="projects-search"]'), 260)] },
        { type: '[data-tour="projects-search"]', text: meta.storySearch, cps: 15 },
        { test: () => projectRows().length === +ex(6, "searchRows", "1") && !!q(storyTr), label: "one row left" },
        { spot: [storyTr] },
        { hold: 0.9, short: 0.5 },
        { click: storyTr, unless: storyOpen, label: "story project row" },
        { wait: '[data-tab="documents"]', label: "project tabs" },
        { spot: ['[data-tour="detail-hero"]'] },
      ],
    },
    {
      n: 7, chapter: 2, page: "proj", lines: ["s07"],
      setup: openStoryProject,
      beats: [
        { say: "s07" },
        { tab: "documents", ready: '[data-tour="detail-documents"]' },
        { wait: '[data-tour="doc-card"]', count: (X[7]?.files || []).length || undefined, min: 1, label: "document cards" },
        { spot: ['[data-tour="detail-documents"]'] },
        { hold: 0.8, short: 0.5 },
        { hover: `[data-tour="doc-card"]${attr("data-file", meta.storyDocumentName || "")}` },
      ],
    },
    {
      n: 8, chapter: 2, page: "proj", lines: ["s08"],
      setup: openStoryProject,
      beats: [
        { say: "s08" },
        { tab: "wbs", ready: '[data-tour="wbs-table"]' },
        { wait: "[data-wbs-row]", min: 2, label: "WBS rows" },
        { spot: ['[data-tour="wbs-table"]'] },
        { hold: 1.0, short: 0.6 },
        // Collapse the first phase (only while it is open: the full table has every task).
        { click: `[data-tour="wbs-toggle"]${attr("data-task-id", meta.storyCollapsePhaseId)}`,
          unless: () => wbsRows().length < (+ex(8, "rows", "15") || 15), label: "phase chevron" },
        { test: () => wbsRows().length < (+ex(8, "rows", "15") || 15), label: "phase collapsed" },
        { scroll: attr("data-wbs-row", meta.storySlipTaskId), block: "center" },
        { spot: [attr("data-wbs-row", meta.storySlipTaskId)] },
      ],
    },

    // ── Chapter 3 · Delivery ────────────────────────────────────────────────────────────────────
    {
      n: 9, chapter: 3, page: "perf", lines: ["s09"],
      beats: [
        { say: "s09" },
        { nav: "perf", ready: '[data-tour="perf-filters"]' },
        { spot: ['[data-tour="perf-filters"]'] },
        { hold: 0.6, short: 0.4 },
        { click: '[data-filter="delayed"]' },
        { test: showingDelayed, label: "delayed filter" },
        { spot: ['[data-filter="delayed"]', () => qa(attr("data-project-id", SID)).filter((e) => e.closest("[data-sim-app]"))] },
      ],
    },
    {
      n: 10, chapter: 3, page: "schedule", lines: ["s10"],
      beats: [
        { say: "s10" },
        { nav: "schedule", ready: '[data-tour="timeline"]', text: ex(10, "scheduled", "scheduled") },
        { wait: storyRow('[data-tour="timeline"]'), label: "story timeline row" },
        { scroll: storyRow('[data-tour="timeline"]'), block: "center" },
        { spot: [storyRow('[data-tour="timeline"]')] },
        { hold: 0.5, short: 0.3 },
        // Hover at the bar (the card opens at the pointer), then light the row and its card together:
        // the card (z-index 60) would otherwise sit under the dim.
        { hover: storyRow('[data-tour="timeline"]'), at: barPoint },
        { wait: '[data-tour="timeline-card"]', label: "timeline hover card" },
        { spot: [storyRow('[data-tour="timeline"]'), '[data-tour="timeline-card"]'] },
        { endLine: true },
        { unhover: true },
      ],
    },
    {
      n: 11, chapter: 3, page: "risks", lines: ["s11"],
      beats: [
        { say: "s11" },
        { nav: "risks", ready: '[data-tour="risk-matrix"]' },
        { spot: ['[data-tour="risk-matrix"]'] },
        { hold: 1.2, short: 0.7 },
        { click: attr("data-cell", meta.riskCell), unless: riskCount },
        { test: riskCount, label: "risk list filtered" },
        { spot: [attr("data-cell", meta.riskCell), attr("data-risk", meta.storyRiskId)] },
      ],
    },

    // ── Chapter 4 · Sites and people ────────────────────────────────────────────────────────────
    {
      n: 12, chapter: 4, page: "camp", lines: ["s12a", "s12b", "s12c"],
      setup: [
        { store: ["pmo-campus-view", "compare"] },
      ],
      beats: [
        { say: "s12a" },
        { nav: "camp", ready: '[data-tour="campus-view"]' },
        { click: '[data-view="compare"]', unless: () => sel('[data-view="compare"]') },
        { click: '[data-mode="all"]', unless: () => !q('[data-mode="all"]') || sel('[data-mode="all"]') },
        { wait: '[data-tour="compare-table"] tr[data-campus]', count: +ex(12, "rows", "0") || undefined, min: 1, label: "compare rows" },
        { spot: ['[data-tour="compare-table"]'] },
        { say: "s12b" },
        // Released sorts high to low on its first click; a replay may find it sorted already.
        { click: 'th[data-col="released"]', unless: releasedDesc },
        { click: 'th[data-col="released"]', unless: releasedDesc },
        { test: () => releasedDesc() && (!ex(12, "firstAfterSort") || firstCompareCampus() === ex(12, "firstAfterSort")), label: "sorted by released" },
        { spot: ['th[data-col="released"]', () => compareRows().slice(0, 3)] },
        { hold: 2.0, short: 1.2 },
        { spot: [() => compareRows().find((r) => r.getAttribute("data-campus") === thirdCampus)] },
        { click: tickBox(thirdCampus), unless: () => !!tickBox(thirdCampus)()?.checked, label: "third campus tick" },
        { say: "s12c" },
        { click: '[data-mode="h2h"]', unless: () => sel('[data-mode="h2h"]') },
        { wait: '[data-tour="compare-h2h-grid"] [data-campus]', count: +ex(12, "h2hColumns", "3") || 3, label: "head to head columns" },
        { spot: [0, 1, 2].map((i) => ({ union: h2hMoney(i) })) },
        { hold: 4.5, short: 3.2 },
      ],
    },
    {
      n: 13, chapter: 4, page: "camp", lines: ["s13a", "s13b"],
      setup: [
        { store: ["pmo-campus-view", "compare"] },
        { nav: "camp", ready: '[data-tour="campus-view"]' },
        { click: '[data-view="compare"]', unless: () => sel('[data-view="compare"]') },
        { click: '[data-mode="all"]', when: () => h2hCols().length < 3 && !sel('[data-mode="all"]'), label: "all campuses" },
        { click: tickBox(thirdCampus), when: () => h2hCols().length < 3 && !tickBox(thirdCampus)()?.checked, label: "third campus tick" },
        { click: '[data-mode="h2h"]', unless: () => sel('[data-mode="h2h"]') },
        { wait: '[data-tour="compare-h2h-grid"] [data-campus]', count: 3, label: "head to head columns" },
      ],
      beats: [
        { say: "s13a" },
        { scroll: '[data-tour="h2h-pms"]', block: "center" },
        { spot: ['[data-tour="h2h-pms"]'] },
        { hold: 1.6, short: 1.2 },
        { click: () => h2hCol(assignCampus)?.querySelector('[data-tour="h2h-open"]'), label: "Open on the campus" },
        { test: () => sel('[data-view="sites"]') && !!q('[data-tour="assign-pm"]') && !q('[data-tour="assign-pm"]').disabled, label: "sites view" },
        { scroll: () => widen(q('[data-tour="assign-pm"]'), 900), block: "start", margin: 70 },
        { spot: [() => widen(q('[data-tour="assign-pm"]'), 900)] },
        { hold: 2.3, short: 2.3 },                          // the Sites view stays up at least 2.3 s
        { say: "s13b" },
        { click: '[data-tour="assign-pm"]', unless: () => !!q('[data-tour="bulk-preview"]') },
        { wait: '[data-tour="pm-select"]', label: "Assign PM dialog" },
        { spot: ['[data-tour="pm-select"]'], ring: true },
        { pick: '[data-tour="pm-select"]', option: `[role="listbox"] [role="option"]${attr("data-value", meta.assignPmUserId)}`,
          unless: () => !!assignPm && hasText(q('[data-tour="pm-select"]'), assignPm), show: 0.6, label: "PM picker" },
        { wait: '[data-tour="bulk-preview"]', text: ex(13, "preview", "will be assigned"), label: "assign preview" },
        // Only the first two preview lines are ringed: the dialog sits below the dim layer.
        { spot: [{ union: previewLines }], ring: true },
        { endLine: true },
        { spot: null },
        { click: cancelButton, label: "Cancel" },             // never "Assign to 2 projects"
        { wait: '[data-tour="bulk-preview"]', gone: true, label: "dialog closed" },
      ],
    },
    {
      n: 14, chapter: 4, page: "users", lines: ["s14"],
      beats: [
        { say: "s14" },
        { nav: "users", ready: '[data-tour="users-table"]' },
        { wait: '[data-tour="users-table"] [data-user]', count: +ex(14, "users", "0") || undefined, min: 1, label: "user rows" },
        { spot: ['[data-tour="users-table"]'] },
        { hold: 1.6, short: 1.0 },
        { scroll: attr("data-user", meta.usersStoryUsername), block: "center" },
        { spot: [attr("data-user", meta.usersStoryUsername)] },
      ],
    },

    // ── Chapter 5 · Follow-up ───────────────────────────────────────────────────────────────────
    {
      n: 15, chapter: 5, page: "upd", lines: ["s15"],
      beats: [
        { say: "s15" },
        { nav: "upd", ready: '[data-tour="updates-list"]' },
        { wait: storyRow('[data-tour="updates-list"]'), label: "story thread in the inbox" },
        { spot: [storyRow('[data-tour="updates-list"]')] },
        { hold: 0.9, short: 0.5 },
        { click: storyRow('[data-tour="updates-list"]'), unless: () => !!q(attr("data-comment", meta.updatesStoryReplyId)) },
        { wait: '[data-tour="updates-thread"]', text: ex(15, "reply"), label: "the reply" },
        { scroll: attr("data-comment", meta.updatesStoryReplyId), block: "center" },
        { spot: [attr("data-comment", meta.updatesStoryReplyId)] },
      ],
    },
    {
      n: 16, chapter: 5, page: "past", lines: ["s16"],
      beats: [
        { say: "s16" },
        { nav: "past", ready: '[data-tour="past-cards"]' },
        { spot: ['[data-tour="past-cards"]'] },
        { hold: 2.2, short: 1.4 },
        { click: '[data-tour="past-unread"]', unless: () => q('[data-tour="past-unread"]')?.getAttribute("aria-pressed") === "true" },
        { wait: attr("data-past", meta.storyPastId), label: "unread project" },
        { spot: ['[data-tour="past-unread"]', attr("data-past", meta.storyPastId)] },
        { hold: 1.0, short: 0.6 },
        { click: attr("data-past", meta.storyPastId), unless: () => !!q('[data-tour="past-thread"]') },
        { wait: '[data-tour="past-thread"]', text: ex(16, "thread", "messages"), label: "follow-up thread" },
        { spot: ['[data-tour="past-thread"]'] },
        { hold: 2.5, short: 1.6 },
      ],
    },
    {
      n: 17, chapter: 5, page: "photowall", lines: ["s17"],
      beats: [
        { say: "s17" },
        { nav: "photowall", ready: '[data-tour="gallery-grid"]' },
        { test: galleryLoaded, label: "gallery pictures" },
        { spot: ['[data-tour="gallery-grid"]'] },
        { hold: 1.4, short: 1.0 },
        // Full screen: no dim, and the assistant shrinks to a corner.
        { spot: null },
        { mini: true },
        { click: () => galleryTiles()[0], label: "first picture" },
        { wait: '[data-tour="lightbox"]', label: "full-screen picture" },
        { spot: [() => one('[data-tour="lightbox"] img, [data-tour="lightbox"] video')], ring: true },
        { hold: 2.4, short: 1.6 },
        { spot: null },
        { key: "Escape" },
        { wait: '[data-tour="lightbox"]', gone: true, label: "picture closed" },
        { mini: false },
      ],
    },

    // ── Chapter 6 · Reporting and team ──────────────────────────────────────────────────────────
    {
      n: 18, chapter: 6, page: "reports", lines: ["s18"],
      // These month-end figures differ on purpose from today's dashboard.
      kicker: ex(18, "asAt") ? `September report · ${ex(18, "asAt")}` : "September report",
      beats: [
        { say: "s18" },
        { nav: "reports", ready: attr("data-report", meta.reportId) },
        { spot: [attr("data-report", meta.reportId)] },
        { hold: 0.8, short: 0.5 },
        { click: attr("data-report", meta.reportId), unless: () => !!q('[data-tour="report-viewer"]') },
        { wait: '[data-tour="report-summary"]', label: "report page 1" },
        { mini: true },
        { spot: ['[data-tour="report-summary"]'] },
        { hold: 1.8, short: 1.2 },
        { spot: ['[data-tour="report-toolbar"]'] },
        { hold: 1.2, short: 0.8 },
        { spot: null },
        { click: '[data-tour="report-back"]' },
        { wait: '[data-tour="report-viewer"]', gone: true, label: "report closed" },
        { mini: false },
      ],
    },
    {
      n: 19, chapter: 6, page: "team", lines: ["s19"],
      beats: [
        { say: "s19" },
        { nav: "team", ready: '[data-tour="team-about"]' },
        { wait: '[data-member="head_pmo"]', text: ex(19, "headPmo"), label: "team names" },
        { spot: ['[data-tour="team-about"]'] },
        { hold: 1.3, short: 0.9 },
        { scroll: '[data-member="head_pmo"]', block: "center" },
        { spot: ['[data-tour="team-org"]'] },
        { hover: '[data-member="head_pmo"]' },
        { hold: 1.3, short: 0.9 },
        { unhover: true },
        { scroll: '[data-tour="team-contact"]', block: "center" },
        { spot: ['[data-tour="team-contact"]'] },
      ],
    },
    {
      n: 20, chapter: 6, page: null, lines: ["s20"], closing: true,
      beats: [{ say: "s20" }],
    },
  ];
}

// Where a timeline row's bar is: its middle (or 200 px in, for a long bar), so the hover card opens
// beside the bar the audience is looking at.
function barPoint(row) {
  const chart = row.children[1];
  const bar = chart ? Array.from(chart.children).find((c) => c.offsetHeight === 15 && c.offsetWidth > 3) : null;
  const r = (bar || row).getBoundingClientRect();
  return { x: r.left + Math.min(r.width / 2, 200), y: r.top + r.height / 2 };
}

/** Every selector-like hook the scenes rely on (for the report and the readiness self-check). */
export const HOOKS = [
  '[data-nav]', '[data-tab]', '[data-tour="hero"]', '[data-kpi="df_recommended"]', '[data-kpi="budget_released"]',
  '[data-tour="investments-panel"]', '[data-tour="pipeline-stages"]', '[data-stage="in_mt"]', "#dash-project-list",
  '[data-tour="cf-monthly"]', '[data-tour="cf-pmdc"]', '[data-tour="projects-search"]', "tr[data-project-id]",
  '[data-tour="detail-hero"]', '[data-tour="detail-documents"]', '[data-tour="doc-card"][data-file]',
  '[data-tour="wbs-table"]', "[data-wbs-row]", '[data-tour="wbs-toggle"][data-task-id]', '[data-tour="perf-filters"]',
  '[data-filter="delayed"]', '[data-tour="timeline"]', '[data-tour="timeline-card"]', '[data-tour="risk-matrix"]',
  "[data-cell]", "[data-risk]", '[data-tour="campus-view"] [data-view]', '[data-tour="compare-table"] tr[data-campus]',
  'th[data-col="released"]', '[data-tour="compare-mode"] [data-mode]', '[data-tour="compare-h2h-grid"] [data-campus]',
  '[data-tour="h2h-pms"]', '[data-tour="h2h-open"]', '[data-tour="assign-pm"]', '[data-tour="pm-select"]',
  '[data-tour="bulk-preview"]', '[data-tour="users-table"] [data-user]', '[data-tour="updates-list"]',
  '[data-tour="updates-thread"]', "[data-comment]", '[data-tour="past-cards"]', '[data-tour="past-unread"]', "[data-past]",
  '[data-tour="past-thread"]', '[data-tour="gallery-grid"] [data-attachment]', '[data-tour="lightbox"]', "[data-report]",
  '[data-tour="report-viewer"]', '[data-tour="report-summary"]', '[data-tour="report-toolbar"]', '[data-tour="report-back"]',
  '[data-tour="team-about"]', '[data-tour="team-org"]', "[data-member]", '[data-tour="team-contact"]',
];

/** The meta fields buildScenes reads (the data contract with src/sim/data). */
export const META_FIELDS = [
  "storyProjectId", "storyProjectCode", "storySearch", "storyDocumentName", "storyCollapsePhaseId", "storySlipTaskId",
  "storyRiskId", "riskCell", "h2hThirdCampus|h2hThirdCampusSlot", "assignCampus|assignCampusSlot", "assignPmSlot",
  "assignPmUserId", "usersStoryUsername", "updatesStoryReplyId", "storyPastId", "reportId", "chapters", "scenes",
  "expect", "starters", "badge", "sampleBadge",
];
