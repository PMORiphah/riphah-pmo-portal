// PMO Simulation (live data): the narration templates. PUBLIC, no data.
// Owner: B3a. Spec: contract §F.2 (the approved texts of the final storyboard, with the brief's
// overrides). Every figure is a {slot} that build.js fills from the plan at launch; nothing here holds
// a data value. Texts marked [new] or [adapted] are not in the approved storyboard (contract §L.10).
//
// Line   { id, scene, minHold, extra?, critical?, skipWhen?(plan), skipNote?, kicker?, main:[Entry], short,
//          fallbacks:["short" | Entry], bare: "short" | caption | null, bareIfSlots? }
// Entry  { name, when?(plan), caption, short?, figures?:["slot[.form]@selector"], checks?:[…], minHold? }
//   main: the first entry whose `when` holds (or has none) is the data-selected candidate.
//   short: the line used when time is tight (an entry's own short wins over the line's).
//   fallbacks: "short" = the entry's short as a full candidate, keeping the figures of the slots it says.
//   bare: the figure-free last resort ("short" = the short text, when it has no slot; else bareIfSlots).
//   figures: spoken slots checked on screen; checks: silent checks (kept on the short candidate too).
//   Selectors may use {storyId} {reviewer} {cell} {rowId} {A} {R} {S} {T} {assignCampus} {username}
//   {reportId} {galleryCampus} {firstPhotoId}, filled from the plan by build.js.

export const CHAPTERS = Object.freeze([
  { n: 1, title: "Portfolio", scenes: [0, 1, 2, 3, 4, 5] },
  { n: 2, title: "Inside a project", scenes: [6, 7, 8] },
  { n: 3, title: "Delivery", scenes: [9, 10, 11] },
  { n: 4, title: "Sites and people", scenes: [12, 13, 14] },
  { n: 5, title: "Follow-up", scenes: [15, 16, 17] },
  { n: 6, title: "Reporting and team", scenes: [18, 19] },
]);   // scene 20 = closing (counted in chapter 6's time)

export const CLOSING_SCENE = 20;

const HERO = '[data-tour="hero-total"]';
const PCD = '[data-kpi="pcds_received"]';
const H2H = (c, metric) => `[data-tour="compare-h2h-grid"] [data-campus="{${c}}"] [data-metric="${metric}"]`;
const RED = {
  both: "Timeline: red means overdue, or PDD not submitted",
  late: "Timeline: red means overdue",
  pdd: "Timeline: red means PDD not submitted",
  neither: "Timeline: every project on one calendar",
};
const redOf = (p) => (p.timeline.anyLate && p.timeline.anyPdd ? "both" : p.timeline.anyLate ? "late" : p.timeline.anyPdd ? "pdd" : "neither");
const storyTail = "; {tag}, {due} {endDay}.";
const NO_STORY = "Scenes 7 and 8 are left out: no project qualifies as the story project.";
const FEW_CAMPUSES = "Scenes 12 and 13 are left out: fewer than two campuses to compare.";
const onSchedule = (p) => !!p.story && p.performance.storyShown && p.performance.storyOnTime;

export const LINES = Object.freeze([
  // ── 0 Opening (critical) ─────────────────────────────────────────────────
  { id: "o1", scene: 0, minHold: 0, critical: true,
    main: [{ name: "main", caption: "The Riphah PMO Portal follows capital projects, from proposal to handover." }],
    short: "Riphah PMO Portal: capital projects, one place.", fallbacks: [], bare: null },
  { id: "o2", scene: 0, minHold: 0, critical: true, kicker: "Portal data as of {dateText}, {hhmm} PKT",
    main: [{ name: "main", caption: "We'll see current portal data: money, projects, sites, people, reports. Money first." }],
    short: "Current portal data. Money first.", fallbacks: [], bare: null },

  // ── 1 Capex dashboard (critical) ─────────────────────────────────────────
  // {closedN}: ", 3 closed" (PCDs Received card, PMO 22 Oct 2026) [new]; "" when none
  // has closed or the card shows a typed figure. The short lines leave it out (they save time). The
  // fallbacks are the same lines without it, so a closed count not on screen never stops the run.
  { id: "s01", scene: 1, minHold: 7.5, critical: true,
    main: [
      { name: "caveat", when: (p) => p.dashboard.progClause === "caveat",
        caption: "Total Capex: {capexM} rupees, {capexN} projects{closedN}; health scores cover only {progN}.",
        short: "Capex: {capexM}; health scores cover only {progN}.",
        figures: [`capexM@${HERO}`, `capexN@${HERO}`, 'progN@[data-tour="hero-cpi-hint"]', `closedN@${PCD}`] },
      { name: "await", when: (p) => p.dashboard.progClause === "await",
        caption: "Total Capex: {capexM} rupees, {capexN} projects{closedN}; health scores await progress reports.",
        short: "Capex: {capexM}; health scores await progress reports.",                       // [adapted]
        figures: [`capexM@${HERO}`, `capexN@${HERO}`, `closedN@${PCD}`] },
      { name: "none", caption: "Total Capex: {capexM} rupees, {capexN} projects{closedN}.", short: "Capex: {capexM}.",
        figures: [`capexM@${HERO}`, `capexN@${HERO}`, `closedN@${PCD}`] },
    ],
    short: "Capex: {capexM}.",
    fallbacks: [
      { name: "caveatNoClosed", when: (p) => p.dashboard.progClause === "caveat",
        caption: "Total Capex: {capexM} rupees, {capexN} projects; health scores cover only {progN}.",
        short: "Capex: {capexM}; health scores cover only {progN}.",
        figures: [`capexM@${HERO}`, `capexN@${HERO}`, 'progN@[data-tour="hero-cpi-hint"]'] },
      { name: "awaitNoClosed", when: (p) => p.dashboard.progClause === "await",
        caption: "Total Capex: {capexM} rupees, {capexN} projects; health scores await progress reports.",
        short: "Capex: {capexM}; health scores await progress reports.",
        figures: [`capexM@${HERO}`, `capexN@${HERO}`] },
      { name: "noneNoClosed", when: (p) => p.dashboard.progClause === "none",
        caption: "Total Capex: {capexM} rupees, {capexN} projects.", short: "Capex: {capexM}.",
        figures: [`capexM@${HERO}`, `capexN@${HERO}`] },
    ],
    bare: null },

  // ── 2 Investments ────────────────────────────────────────────────────────
  { id: "s02", scene: 2, minHold: 3.72,
    main: [
      { name: "none", when: (p) => p.investments.invN === 0, caption: "Investments sit apart; none are recorded yet." },
      { name: "full", when: (p) => p.investments.invFull, caption: "Investments sit apart: {invCount}, released in full.",
        figures: ['invCount@[data-inv="Investment Projects"]'] },
      { name: "apart", caption: "Investments sit apart: {invCount}, outside Capex.", figures: ['invCount@[data-inv="Investment Projects"]'] },
    ],
    short: "Investments sit apart.", fallbacks: [], bare: "short" },

  // ── 3 PDD Status ─────────────────────────────────────────────────────────
  { id: "s03", scene: 3, minHold: 6.0,
    main: [
      { name: "allSubmittedNone", when: (p) => p.pdd.notSubmitted === 0 && !p.pdd.reviewer,
        caption: "PDD Status: every project has submitted; none are with reviewers.",
        short: "PDD Status: every project has submitted.",                                      // [adapted]
        checks: ['pddNot@[data-kpi="pdd_not_submitted"]'] },
      { name: "allSubmitted", when: (p) => p.pdd.notSubmitted === 0,
        caption: "PDD Status: every project has submitted; {revAre} with {holder}.",
        short: "PDD Status: every project has submitted.",                                      // [adapted]
        figures: ['revAre@[data-kpi="{reviewer}"]', "revAre.list@#dash-project-list"], checks: ['pddNot@[data-kpi="pdd_not_submitted"]'] },
      { name: "noReviewer", when: (p) => !p.pdd.reviewer,
        caption: "PDD Status: {pddNot} await submission; none are with reviewers.",
        figures: ['pddNot@[data-kpi="pdd_not_submitted"]'] },
      { name: "reviewer", caption: "PDD Status: {pddNot} await submission; {revAre} with {holder}.",
        figures: ['pddNot@[data-kpi="pdd_not_submitted"]', 'revAre@[data-kpi="{reviewer}"]', "revAre.list@#dash-project-list"] },
    ],
    short: "PDD Status: {pddNot} await submission.", fallbacks: ["short"],
    bare: "PDD Status: every project's approval stage." },                                  // [new]

  // ── 4 Payments Status ────────────────────────────────────────────────────
  { id: "s04", scene: 4, minHold: 7.4,
    main: [
      { name: "nothing", when: (p) => p.payments.variant === "nothing",
        caption: "Payments Status: nothing released yet; no payments are entered.",
        short: "Payments Status: nothing released yet.",                                        // [adapted]
        checks: ['releasedM@[data-kpi="budget_released"]'] },
      { name: "noPct", when: (p) => p.payments.relPctText == null,
        caption: "Payments Status: released, {releasedM}; {paidClause}.",
        figures: ['releasedM@[data-kpi="budget_released"]', 'paidClause@[data-kpi="payments_made"]', 'paidClause.flow@[data-tour="money-flow"]'] },
      { name: "pct", caption: "Payments Status: released, {releasedM}, {relPct}; {paidClause}.",
        figures: ['releasedM@[data-kpi="budget_released"]', 'relPct@[data-kpi="budget_released"]',
          'paidClause@[data-kpi="payments_made"]', 'paidClause.flow@[data-tour="money-flow"]'] },
    ],
    short: "Payments Status: {paidClause}.", fallbacks: ["short"],
    bare: "Payments Status: what is released, and what is paid." },                         // [new]

  // ── 5 Cashflows ──────────────────────────────────────────────────────────
  { id: "s05", scene: 5, minHold: 6.0,
    main: [
      { name: "empty", when: (p) => !p.cashflow.hasRows, caption: "Cashflows: no monthly plan is loaded yet." },
      { name: "peak", caption: "Cashflows: the monthly plan {peaks} in {peakMonth}, {peakM}.",
        figures: ['peakMonth@[data-tour="cf-peak"]', 'peakM@[data-tour="cf-peak"]'] },
    ],
    short: "Cashflows: the monthly plan.", fallbacks: [], bare: "short" },

  // ── 6 Projects ───────────────────────────────────────────────────────────
  { id: "s06", scene: 6, minHold: 5.6,
    main: [
      { name: "nostory", when: (p) => !p.story, caption: "Projects: every capital project, searchable by name or ID.",   // [new]
        short: "Projects: every capital project, searchable by name or ID." },
      { name: "closed", when: (p) => p.story.kind === "closed", caption: "Projects: let's follow a finished one, the {alias}.",
        figures: ['alias@[data-tour="detail-hero"]'] },
      { name: "progress", caption: "Projects: let's follow one that reports progress, the {alias}.",
        figures: ['alias@[data-tour="detail-hero"]'] },
    ],
    short: "Let's open the {alias}.", fallbacks: [],
    bare: "Projects: every capital project, searchable by name or ID." },                    // [new]

  // ── 7 Documents (inside the story project) ───────────────────────────────
  { id: "s07", scene: 7, minHold: 5.6, skipWhen: (p) => !p.story, skipNote: NO_STORY,
    main: [
      { name: "empty", when: (p) => p.story.docCount === 0, caption: "Its Documents tab is empty so far.",
        short: "Its Documents tab is empty so far." },
      { name: "files", when: (p) => !p.story.hasPddDoc,
        caption: "Documents holds its {docFiles}. {stageWord}, {releasedState}, {pct} done.",
        figures: ['stageWord@[data-tour="detail-badges"] > :first-child', 'releasedState@[data-strip="released"]',
          'releasedState.approved@[data-tour="detail-approved"]', 'pct@[data-strip="progress"]'] },
      { name: "pdd", caption: "Documents holds its PDD. {stageWord}, {releasedState}, {pct} done.",
        figures: ['stageWord@[data-tour="detail-badges"] > :first-child', 'releasedState@[data-strip="released"]',
          'releasedState.approved@[data-tour="detail-approved"]', 'pct@[data-strip="progress"]'] },
    ],
    short: "Its documents, in one place.", fallbacks: [], bare: "short" },

  // ── 8 WBS (inside the story project) ─────────────────────────────────────
  { id: "s08", scene: 8, minHold: 3.72, skipWhen: (p) => !p.story, skipNote: NO_STORY,
    main: [
      { name: "tasks", when: (p) => p.story.tasks > 0, caption: "Its work breakdown: {nTasks} so far.",
        short: "Work breakdown: {nTasks}.", figures: ['nTasks@[data-tour="wbs-header"]'] },
      { name: "empty", when: (p) => p.story.wbsWide, caption: "Its work breakdown has no tasks yet.",
        checks: ['wbsZero@[data-tour="wbs-header"]', 'wbsEmpty@[data-tour="wbs-empty"]'] },
      { name: "almostEverywhere", caption: "Its work breakdown: not yet started, as almost everywhere.",
        checks: ['wbsZero@[data-tour="wbs-header"]', 'wbsEmpty@[data-tour="wbs-empty"]'] },
    ],
    short: "Work breakdown: not yet started.", fallbacks: [], bare: "Its work breakdown." },   // short [adapted], bare [new]

  // ── 9 Timeline ───────────────────────────────────────────────────────────
  { id: "s09", scene: 9, minHold: 7.0,
    main: [
      ...["both", "late", "pdd", "neither"].map((k) => ({ name: `${k}`, when: (p) => !!p.story?.endDate && redOf(p) === k,
        caption: RED[k] + storyTail, short: RED[k] + ".", figures: ['endDay@[data-tour="timeline-card"]'] })),
      ...["both", "late", "pdd", "neither"].map((k) => ({ name: `${k}NoStory`, when: (p) => redOf(p) === k,
        caption: RED[k] + ".", short: RED[k] + "." })),
    ],
    short: RED.both + ".", fallbacks: ["short"], bare: "Timeline: every project on one calendar." },

  // ── 10 Performance ───────────────────────────────────────────────────────
  { id: "s10", scene: 10, minHold: 5.6,
    main: [
      { name: "most", when: (p) => onSchedule(p) && p.performance.variant === "most",
        caption: "Performance: {tag} is on schedule; most 'Delayed' lack progress entries.", short: "Most 'Delayed' lack progress entries.",
        figures: ['tag.pct@tr[data-project-id="{storyId}"] td[data-col="pct"]'] },
      { name: "all", when: (p) => onSchedule(p) && p.performance.variant === "all",
        caption: "Performance: {tag} is on schedule; all 'Delayed' lack progress entries.", short: "All 'Delayed' lack progress entries.",
        figures: ['tag.pct@tr[data-project-id="{storyId}"] td[data-col="pct"]'] },
      { name: "count", when: (p) => onSchedule(p) && p.performance.variant === "count",
        caption: "Performance: {tag} is on schedule; {withPct} of {rowsShown} report progress.", short: "{withPct} of {rowsShown} report progress.",
        figures: ['tag.pct@tr[data-project-id="{storyId}"] td[data-col="pct"]'] },
      { name: "none", when: (p) => onSchedule(p), caption: "Performance: {tag} is on schedule.",            // [new]
        short: "Performance: {tag} is on schedule.", figures: ['tag.pct@tr[data-project-id="{storyId}"] td[data-col="pct"]'] },
      { name: "mostNoStory", when: (p) => p.performance.variant === "most",
        caption: "Performance: most 'Delayed' lack progress entries.", short: "Most 'Delayed' lack progress entries." },
      { name: "allNoStory", when: (p) => p.performance.variant === "all",
        caption: "Performance: all 'Delayed' lack progress entries.", short: "All 'Delayed' lack progress entries." },
      { name: "countNoStory", when: (p) => p.performance.variant === "count",
        caption: "Performance: {withPct} of {rowsShown} report progress.", short: "{withPct} of {rowsShown} report progress." },
      { name: "plain", caption: "Performance: schedule and budget, project by project.",
        short: "Performance: schedule and budget, project by project." },
    ],
    short: "Most 'Delayed' lack progress entries.", fallbacks: [],
    bare: "Performance: schedule and budget, project by project." },                          // [new]

  // ── 11 Risk Register ─────────────────────────────────────────────────────
  { id: "s11", scene: 11, minHold: 5.6,
    main: [
      { name: "empty", when: (p) => p.risks.total === 0, caption: "Risk Register: no risks are logged yet.",   // [new]
        short: "Risk Register: no risks are logged yet." },
      { name: "allClosed", when: (p) => !p.risks.cell, caption: "Risk Register: every risk, by probability and impact.",   // [new]
        short: "Risk Register: every risk, by probability and impact." },
      { name: "noCritical", when: (p) => p.risks.critical === 0,
        caption: "Risk Register: {openN} open, none rated critical; {cellN} {prob} probability, {impact} impact.",
        short: "Risks: {openN} open, none rated critical.",
        figures: ['openN@[data-tour="risk-header"]', 'cellN@[data-tour="risk-count"]', 'cellN.cell@[data-cell="{cell}"]'],
        checks: ['critN@[data-tour="risk-header"]'] },
      { name: "critical",
        caption: "Risk Register: {openN} open, {critN} rated critical; {cellN} {prob} probability, {impact} impact.",
        short: "Risks: {openN} open, {critN} rated critical.",
        figures: ['openN@[data-tour="risk-header"]', 'critN@[data-tour="risk-header"]', 'cellN@[data-tour="risk-count"]',
          'cellN.cell@[data-cell="{cell}"]'] },
    ],
    short: "Risks: {openN} open, none rated critical.", fallbacks: ["short"],
    bare: "Risk Register: every risk, by probability and impact." },                           // [new]

  // ── 12 Campus Compare ────────────────────────────────────────────────────
  { id: "s12a", scene: 12, minHold: 5.7, skipWhen: (p) => p.compare.columns.length < 2, skipNote: FEW_CAMPUSES,
    main: [{ name: "pick", caption: "Campus Compare puts all {campusN} campuses side by side; we pick {pickN}.",
      figures: ['campusN@[data-tour="compare-summary"]'] }],
    short: "Campus Compare: campuses side by side.", fallbacks: [], bare: "short" },
  { id: "s12b", scene: 12, minHold: 7.7, skipWhen: (p) => p.compare.columns.length < 2, skipNote: FEW_CAMPUSES,
    main: [
      { name: "tie", when: (p) => p.compare.leaderVariant === "tie",
        caption: "Head to head: approvals and releases side by side; each site lists its managers." },
      { name: "AR_T", when: (p) => p.compare.leaderVariant === "AR_T",
        caption: "Head to head, {A} leads in rupees, {T} trails on releases; each site lists its managers.",
        figures: [`A@${H2H("A", "Approved")}`, `A.released@${H2H("A", "Released")}`, `T@${H2H("T", "Released")}`] },
      { name: "AR_S", when: (p) => p.compare.leaderVariant === "AR_S",
        caption: "Head to head, {A} leads in rupees, {S} in released share; each site lists its managers.",
        figures: [`A@${H2H("A", "Approved")}`, `A.released@${H2H("A", "Released")}`, `S@${H2H("S", "Released")}`] },
      { name: "ARS", when: (p) => p.compare.leaderVariant === "ARS",
        caption: "Head to head, {A} leads in rupees and share; each site lists its managers.",
        figures: [`A@${H2H("A", "Approved")}`, `A.released@${H2H("A", "Released")}`, `A.share@${H2H("A", "Released")}`] },
      { name: "A_R", caption: "Head to head, {A} leads approved, {R} released; each site lists its managers.",
        figures: [`A@${H2H("A", "Approved")}`, `R@${H2H("R", "Released")}`] },
    ],
    short: "Head to head, with each site's managers.",
    fallbacks: [{ name: "tie", caption: "Head to head: approvals and releases side by side; each site lists its managers." }],
    bare: "short" },

  // ── 13 Assign PM (preview, then Cancel) ──────────────────────────────────
  { id: "s13", scene: 13, minHold: 6.5, extra: 0.4, skipWhen: (p) => !p.assign.campus || p.compare.columns.length < 2,
    skipNote: (p) => (p.compare.columns.length < 2 ? FEW_CAMPUSES : "Scene 13 is left out: no campus to open in Assign PM."),
    main: [
      { name: "none", when: (p) => p.assign.variant === "none" || p.assign.toAssign === 0,
        caption: "On {assignCampus}, Assign PM previews first: nothing to assign today.",
        figures: ['assignCampus@[data-tour="sites-campus"]'], checks: ['toAssign@[data-tour="bulk-preview"]'] },
      { name: "toAssign", when: (p) => p.assign.leftAlone === 0,
        caption: "On {assignCampus}, Assign PM previews first: {toAssign} to assign.",            // [adapted]
        figures: ['assignCampus@[data-tour="sites-campus"]', 'toAssign@[data-tour="bulk-preview"]'] },
      { name: "both", caption: "On {assignCampus}, Assign PM previews first: {toAssign} to assign, {leftAlone} left alone.",
        figures: ['assignCampus@[data-tour="sites-campus"]', 'toAssign@[data-tour="bulk-preview"]', 'leftAlone@[data-tour="bulk-preview"]'] },
    ],
    short: "Assign PM previews, then we cancel.", fallbacks: [], bare: "short" },

  // ── 14 User Management ───────────────────────────────────────────────────
  { id: "s14", scene: 14, minHold: 5.0,
    main: [
      { name: "noRow", when: (p) => !p.users.row, caption: "User Management: {usersN} users{testClause}; each has a role.",   // [new]
        figures: ['usersN@[data-tour="users-header"]'] },
      { name: "row", caption: "User Management: {usersN} users{testClause}; {pmName} manages {pmN}.",
        figures: ['usersN@[data-tour="users-header"]', 'pmName@tr[data-user="{username}"] td[data-col="fullname"]',
          'pmN@tr[data-user="{username}"] td[data-col="assigned"]'] },
    ],
    short: "User Management: roles and assigned projects.", fallbacks: [], bare: "short" },

  // ── 15 Updates ───────────────────────────────────────────────────────────
  { id: "s15", scene: 15, minHold: 5.4,
    main: [
      { name: "none", when: (p) => p.updates.variant === "none", caption: "Updates: one thread per project; none has messages yet." },
      { name: "newest", when: (p) => p.updates.variant === "newest", caption: "Updates: one thread per project; the newest are listed first." },
      { name: "pm", caption: "Updates: one thread per project; here, a manager's status note." },
    ],
    short: "Updates: one thread per project.", fallbacks: [], bare: "short" },

  // ── 16 Past Projects ─────────────────────────────────────────────────────
  { id: "s16", scene: 16, minHold: 7.8,
    main: [
      { name: "nothreadNone", when: (p) => p.past.variant === "nothread" && p.past.noProgress === 0, minHold: 5.0,
        caption: "Past Projects, from earlier years: {pastOpen} open.", short: "Past Projects: {pastOpen} open.",   // [adapted]
        figures: ['pastOpen@[data-card="still-open"]'] },
      { name: "nothread", when: (p) => p.past.variant === "nothread", minHold: 5.0,
        caption: "Past Projects, from earlier years: {pastOpen} open, {noProg} without progress.",
        figures: ['pastOpen@[data-card="still-open"]', 'noProg@[data-card="no-progress"]'] },
      { name: "threadNone", when: (p) => p.past.noProgress === 0,
        caption: "Past Projects, from earlier years: {pastOpen} open; here, the manager replies.",
        short: "Past Projects: {pastOpen} open.",                                                  // [adapted]
        figures: ['pastOpen@[data-card="still-open"]'] },
      { name: "thread", caption: "Past Projects, from earlier years: {pastOpen} open, {noProg} without progress; here, the manager replies.",
        figures: ['pastOpen@[data-card="still-open"]', 'noProg@[data-card="no-progress"]'] },
    ],
    short: "Past Projects: {pastOpen} open, {noProg} without progress.", fallbacks: ["short"],
    bare: "Past Projects, from earlier years." },                                               // [new]

  // ── 17 Gallery ───────────────────────────────────────────────────────────
  { id: "s17", scene: 17, minHold: 5.0,
    main: [
      { name: "empty", when: (p) => p.gallery.variant === "empty", caption: "The Gallery holds site-visit media; none is uploaded yet." },
      { name: "leftout", when: (p) => p.gallery.variant === "leftout",
        caption: "The Gallery: site-visit photos and videos, none shown in this presentation." },       // [new]
      { name: "all", when: (p) => p.gallery.variant === "all", caption: "The Gallery: {galleryItems} from site visits.",
        figures: ['galleryItems@[data-tour="gallery-count"]'] },
      { name: "campus", when: (p) => p.gallery.variant === "campus",
        caption: "The Gallery: {galleryItems} from site visits; here, {galleryCampus}.",
        figures: ['galleryItems@[data-tour="gallery-count"]', 'galleryCampus@[data-tour="gallery-campus"]'] },
      { name: "subject", caption: "The Gallery: {galleryItems} from site visits; here, the {galleryAlias}.",
        figures: ['galleryItems@[data-tour="gallery-count"]', 'galleryAlias@[data-tour="gallery-grid"] [data-attachment="{firstPhotoId}"]'] },
    ],
    short: "Site photos and videos.", fallbacks: [], bare: "short" },

  // ── 18 Monthly Report ────────────────────────────────────────────────────
  { id: "s18", scene: 18, minHold: 7.4, kicker: "{reportKicker}",
    main: [
      { name: "published", when: (p) => p.report.variant === "published",
        caption: "Monthly Report: {Month}'s board report, published; it flags what needs attention.",
        short: "Monthly Report: {Month}'s report, published.", figures: ['Month@[data-report="{reportId}"]'] },
      { name: "nothing", when: (p) => p.report.variant === "nothing",
        caption: "Monthly Report: none published yet; {Month}'s draft shows nothing outstanding.",
        figures: ['Month@[data-report="{reportId}"]'] },
      { name: "baselines", when: (p) => p.report.variant === "baselines",
        caption: "Monthly Report: none drafted yet; baselines only.", short: "Monthly Report: none drafted yet; baselines only." },   // short [adapted]
      { name: "none", when: (p) => p.report.variant === "none",
        caption: "Monthly Report: none drafted yet.", short: "Monthly Report: none drafted yet." },          // [new]
      { name: "draft", caption: "Monthly Report: none published yet; {Month}'s draft flags what needs attention.",
        figures: ['Month@[data-report="{reportId}"]'] },
    ],
    short: "Monthly Report: a draft, none published yet.", fallbacks: [], bare: "short",
    bareIfSlots: "Monthly Report: each month's board report." },                                    // [new]

  // ── 19 Team & About ──────────────────────────────────────────────────────
  { id: "s19", scene: 19, minHold: 4.7,
    main: [{ name: "main", caption: "Team & About: who we are, how to reach us." }],
    short: "Who we are, how to reach us.", fallbacks: [], bare: "short" },

  // ── 20 Closing ───────────────────────────────────────────────────────────
  { id: "c1", scene: 20, minHold: 0,
    main: [
      { name: "report", when: (p) => p.report.variant === "published", caption: "From proposal to board report, one shared record. Thank you." },
      { name: "main", caption: "From proposal to handover, one shared record. Thank you." },
    ],
    short: "Thank you.", fallbacks: [], bare: null },
]);

/**
 * A copy the PMO shared with guests plays the same plan on data that may be days old: the texts that
 * say "current" or "today" are said with the data's date instead (buildNarration(…, { shared: true })).
 * o2 keeps the live line's 12 spoken words (the date is always two), so the run is timed as the PMO's
 * and no other line switches to its short form.
 * { lineId: { short?, main: { entryName: caption } } } [new]
 */
export const SHARED_TEXTS = Object.freeze({
  o2: { main: { main: "Data as of {dateText}: money, projects, sites, people, reports. Money first." },
    short: "Portal data as of {dateText}. Money first." },
  s13: { main: { none: "On {assignCampus}, Assign PM previews first: nothing to assign." } },
});

/** The chapter of a scene (the closing belongs to the last chapter). */
export function chapterOfScene(n) {
  if (n === CLOSING_SCENE) return CHAPTERS[CHAPTERS.length - 1].n;
  return (CHAPTERS.find((c) => c.scenes.includes(n)) || {}).n ?? null;
}
