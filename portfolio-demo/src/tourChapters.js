// Portfolio demo: the guided tour's content. Nine chapters; every step says what the part is, who
// uses it, the problem it solves and how it is fitted to a client's organisation.
// A step: { page, tab?, project?, detail?, reveal?, sel, role?, title, what, who, problem, custom }
//   page    the portal page (sidebar id), tab: the dashboard tab, project: open the sample project,
//   detail  the project tab to open, reveal(): anything else to click first, sel: what to spotlight
//   ("content" = the page's main area), role: who the step runs as (default PMO admin).
const q = (sel) => document.querySelector(sel);
const click = (el) => { if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const byText = (root, sel, re) => [...(root || document).querySelectorAll(sel)].find((el) => re.test((el.textContent || "").trim()));

export const CHAPTERS = [
  "The portfolio at a glance", "Every project in one register", "Inside one project", "Sites, performance and risks",
  "Money, time and stock", "Proposals, reports and history", "Working with project managers", "Roles, users and the audit trail", "Make it yours",
];

const S = (chapter, step) => ({ chapter, ...step });
export const STEPS = [
  // 1 · The portfolio at a glance
  S(0, { page: "cmd", tab: "budgeting", sel: '[data-tour="hero"]', title: "Portfolio health in one look",
    what: "One verdict for the whole capital portfolio, worked out live from cost and schedule performance (CPI and SPI).",
    who: "PMO, finance and senior management.", problem: "No more building a status deck from spreadsheets every month.",
    custom: "Your thresholds, health wording and which measures count." }),
  S(0, { page: "cmd", tab: "budgeting", sel: '[data-tour="kpi-strip"]', title: "The money, from request to payment",
    what: "Requested, recommended, approved, released and paid: each card opens the list behind its figure.",
    who: "Finance and the PMO.", problem: "Everyone quotes the same number, and can see where it comes from.",
    custom: "Card names, live or published figures, your currency and fiscal year." }),
  S(0, { page: "cmd", tab: "pipeline", sel: '[data-tour="pipeline-stages"]', title: "Where every proposal sits",
    what: "Every project's place in the approval chain, from proposal not submitted to approved and closed.",
    who: "PMO and approvers.", problem: "Projects waiting for a signature are visible, not lost in e-mail.",
    custom: "Your own stages and approval chain, e.g. Finance → Executive → Board." }),
  S(0, { page: "cmd", tab: "execution", sel: '[data-tour="health-cards"]', title: "Which approved projects need help",
    what: "On time, delayed and over budget, from each project's progress against its plan.",
    who: "PMO and senior management.", problem: "Trouble shows up weeks earlier than in a quarterly review.",
    custom: "Your tolerance rules, or flags the PMO sets by hand." }),
  // 2 · Every project in one register
  S(1, { page: "proj", sel: '[data-tour="projects-table"]', title: "The project register",
    what: "Every capital project with its stage, budget, priority and site. Sort, filter, group, choose columns.",
    who: "Everyone; each role sees only what it should.", problem: "One list replaces the spreadsheets kept by each office.",
    custom: "Your fields and labels: “campus” can be “site”, “region” or “plant”." }),
  S(1, { page: "proj", sel: '[data-tour="projects-filters"]', title: "Find, export, import",
    what: "Search by name or code, filter any column, export to Excel, or import a whole sheet at once.",
    who: "PMO.", problem: "Year-start loading and finance reconciliations take minutes, not days.",
    custom: "Import mapped to your own Excel or SAP export, column by column." }),
  // 3 · Inside one project
  S(2, { page: "proj", project: true, sel: '[data-tour="detail-hero"]', title: "One page per project",
    what: "Stage, budget, money released, manager and markers such as change requests, on one header.",
    who: "PMO, the project manager, management.", problem: "No hunting through folders for a project's real status.",
    custom: "Which facts lead, and the markers your process uses." }),
  S(2, { page: "proj", project: true, detail: "wbs", sel: '[data-tour="detail-wbs"]', title: "The work plan (WBS)",
    what: "Phases, tasks and milestones with planned and actual dates; progress rolls up by duration.",
    who: "Project managers update it; the PMO sets the baseline.", problem: "Progress comes from the plan, not from a guess.",
    custom: "Templates per project type, baseline rules, who may edit what." }),
  S(2, { page: "proj", project: true, detail: "deliverables", sel: "content", title: "Deliverables, line by line",
    what: "The proposal's cost lines become a checklist; managers tick what has arrived.",
    who: "Project managers and the PMO.", problem: "You know what was bought, what arrived and what is missing.",
    custom: "Read from your proposal form; your statuses and units." }),
  S(2, { page: "proj", project: true, detail: "documents", sel: '[data-tour="detail-documents"]', title: "Documents and site visits",
    what: "Proposals, quotations, layouts and site photos stay with the project, in order.",
    who: "PMO, managers, auditors.", problem: "The file is complete at handover, not rebuilt afterwards.",
    custom: "Your document types, storage location and size limits." }),
  // 4 · Sites, performance and risks
  S(3, { page: "camp", sel: '[data-tour="campus-filter"]', title: "Every site, side by side",
    what: "Projects and money by site, and a Compare view that ranks sites head to head.",
    who: "Senior management and site heads.", problem: "Shows which sites deliver and which stall.",
    custom: "Your sites, regions or plants, and the measures you compare." }),
  S(3, { page: "perf", sel: '[data-tour="performance-page"]', title: "Earned value, per project",
    what: "Planned value, earned value, CPI and SPI for each approved project.",
    who: "PMO and finance.", problem: "Spend is judged against progress, not just against budget.",
    custom: "Your formulas and the thresholds that turn a project amber or red." }),
  S(3, { page: "risks", sel: '[data-tour="risk-register"]', title: "The risk register",
    what: "Every risk with likelihood, impact, owner and mitigation, on a heat map.",
    who: "PMO and senior management.", problem: "Risks are owned and reviewed, not forgotten in minutes.",
    custom: "Your risk categories, scoring scale and review cycle." }),
  // 5 · Money, time and stock
  S(4, { page: "cashflow", sel: '[data-tour="cf-monthly"]', title: "Cash-flow plan, month by month",
    what: "When the money will be needed, by project, site and type, across the fiscal year.",
    who: "Finance and the PMO.", problem: "Finance sees next quarter's demand before it lands.",
    custom: "Your months, buckets (e.g. capital, accreditation) and fiscal year." }),
  S(4, { page: "schedule", sel: '[data-tour="schedule-page"]', title: "Timeline of the whole portfolio",
    what: "Every project on one Gantt chart, grouped by site, with today's line.",
    who: "Senior management and the PMO.", problem: "Clashes and bunching are obvious at a glance.",
    custom: "Grouping, colours and which dates count as the plan." }),
  S(4, { page: "inventory", sel: "content", title: "What was bought, and what arrived",
    what: "Purchase-order lines imported from the ERP: items, suppliers, delivery status, by site and project.",
    who: "PMO, procurement and finance.", problem: "Shows money spent on items that never arrived.",
    custom: "Imports your ERP report (SAP ME2J here) with your plants and profit centres." }),
  // 6 · Proposals, reports and history
  S(5, { page: "review", sel: "content", title: "New proposals, checked for you",
    what: "Proposals arrive from the proposal system; the portal checks totals, dates, documents and budget fit.",
    who: "PMO.", problem: "Arithmetic and missing quotations are caught before anyone signs.",
    custom: "Connected to your proposal form; your checks and approval rules." }),
  S(5, { page: "reports", sel: "content", title: "The monthly board report",
    what: "Built from the portal's figures, compared with last month, checked, then shared and saved as PDF.",
    who: "PMO, for the board and senior management.", problem: "The board pack takes an hour, not a week.",
    custom: "Your sections, wording, recipients and branding." }),
  S(5, { page: "past", sel: '[data-tour="past-cards"]', title: "Last year's projects, still followed up",
    what: "Open projects from earlier years, with money still to spend and a chat with each manager.",
    who: "PMO and senior management.", problem: "Old projects don't silently stay open for years.",
    custom: "Your fiscal years, follow-up rules and who may ask for status." }),
  // 7 · Working with project managers
  S(6, { page: "upd", sel: '[data-tour="updates-page"]', title: "Updates instead of e-mail chains",
    what: "Each project has its own conversation; the PMO can ask for a structured update in one click.",
    who: "PMO and project managers.", problem: "Status lives with the project, not in twenty inboxes.",
    custom: "E-mail, push or WhatsApp notifications, in your wording." }),
  S(6, { page: "photowall", sel: '[data-tour="gallery-grid"]', title: "Site photos from every project",
    what: "Every site-visit photo and video, newest first, linked to its project.",
    who: "Everyone.", problem: "Management sees progress on site without travelling.",
    custom: "Who may upload, and how long files are kept." }),
  S(6, { page: "cmd", tab: "budgeting", sel: '[data-tour="assistant-launcher"]', title: "Ask the assistant",
    what: "Ask in plain words, e.g. “Which projects are overdue?”. The answer is computed from the data, never guessed.",
    who: "Everyone, within what their role may see.", problem: "Quick answers without building a report.",
    custom: "Your terms, your languages, and the questions your board asks." }),
  // 8 · Roles, users and the audit trail
  S(7, { page: "users", sel: '[data-tour="users-table"]', title: "Users and what they may see",
    what: "Add people, give them a role and assign their projects. The database enforces it, not just the screen.",
    who: "PMO.", problem: "The right people see the right projects, and nothing else.",
    custom: "Your roles and permissions, single sign-on with your accounts." }),
  S(7, { role: "project_manager", page: "proj", sel: '[data-tour="projects-table"]', title: "As a project manager",
    what: "Nadia sees only her 7 projects: no portfolio totals, cash flows or risks.",
    who: "Project managers.", problem: "Managers focus on their own work and can't see others' budgets.",
    custom: "What each role sees is decided per page and per record." }),
  S(7, { role: "project_manager", page: "proj", project: true, detail: "wbs", sel: '[data-tour="detail-wbs"]', title: "Managers keep their plan current",
    what: "They update tasks and progress, tick deliverables and post updates; budgets stay with the PMO.",
    who: "Project managers.", problem: "Progress is reported where the work is planned.",
    custom: "Which fields managers may edit." }),
  S(7, { role: "guest", page: "cmd", tab: "budgeting", sel: '[data-tour="hero"]', title: "As senior management",
    what: "Sana reads the whole portfolio, its timeline and risks, and changes nothing.",
    who: "Directors, the board, auditors.", problem: "Leaders get the live picture without asking the PMO.",
    custom: "Read-only roles for boards, auditors or donors." }),
  S(7, { page: "log", sel: "content", title: "Every change on record",
    what: "Who changed what and when, with the old and new value, plus every e-mail and push sent.",
    who: "PMO and auditors.", problem: "Questions about a figure are answered in seconds.",
    custom: "What is recorded and how long it is kept." }),
  // 9 · Make it yours
  S(8, { page: "set", sel: "content", title: "Settings the PMO controls",
    what: "Thresholds, dashboard cards, team page and contacts are set here, without a developer.",
    who: "PMO.", problem: "Day-to-day changes don't need a programmer.",
    custom: "Anything your PMO wants to change itself." }),
  S(8, { page: "cmd", tab: "budgeting", sel: ".dm-bar", title: "Yours, with your name on it",
    what: "Name, logo, colours, currency, terms, stages, roles, reports and imports: fitted to how your organisation works.",
    who: "Your PMO, finance and leadership.", problem: "A portal that matches your process, not the other way round.",
    custom: "Set up for you, then run on your own accounts and hosting." }),
];

/** Reading time of a step, in seconds (about 190 words a minute, 7 s at least). */
export const stepSeconds = (s) => Math.max(7, Math.round([s.title, s.what, s.who, s.problem, s.custom].join(" ").split(/\s+/).length / 3.2));
export const totalMinutes = () => Math.round(STEPS.reduce((n, s) => n + stepSeconds(s) + 1.2, 0) / 60);

export const helpers = { q, click, wait, byText };
