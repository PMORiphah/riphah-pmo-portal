import { fire, wait } from "./TourGuide.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   TOUR CONTENT

   Two scripts, built on verified role permissions and — after a rigorous
   spotlight-vs-target overlap check exposed real defects — verified anchors.

   Two facts that shaped the roles:
     projects_select: is_pmo() OR is_guest() OR is_assigned(id)
       A Guest's register is the full 110 projects. A PM's is only projects
       they're assigned to.
     project_attachments has no INSERT policy at all.
       Nobody but the PMO uploads. Every ProjectAttachments call site
       hardcodes canManage to session.role === "pmo". Neither tour claims an
       upload capability that doesn't exist.

   One fact that shaped the mechanics:
     ProjectDetailPage's active tab is local state (`const [tab, setTab]`),
     invisible outside that component, and TabsUI/Tabs does not forward
     unknown properties from a tab's config object onto the DOM. A tour step
     cannot switch it via a page/tab pairing the way the dashboard's tabs
     work — the only real way in is a genuine click on the visible tab
     button, which is what `reveal` below does for Timeline/Documents/Site
     Visit. Confirmed by testing this reached the wrong content before the
     fix: the caption claimed "Documents" while Overview stayed on screen.
   ═══════════════════════════════════════════════════════════════════════════ */

const bySel = (sel) => document.querySelector(sel);

// Clicks the real, visible tab button by its data-tab value — the same
// attribute Tabs.jsx already uses for its own sliding indicator — rather
// than any attribute the tour would have to get forwarded through props.
const openDetailTab = (tabId) => async () => {
  fire.click(bySel(`[data-tab="${tabId}"]`));
  await wait(550);
};

export function guestSteps() {
  return [
    // ── Dashboard ──────────────────────────────────────────────────────
    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tour="hero"]',
      title: "The portfolio, at a glance",
      body: "Portfolio health, cost and schedule performance, and the total value of everything tracked here — updated the moment anything changes." },

    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tour="kpi-strip"]',
      title: "Seven figures that explain themselves",
      body: "Requested, recommended, approved, released — each card tells you exactly what it means.",
      demo: async () => {
        const card = bySel('[data-tour="kpi-strip"]')?.firstElementChild;
        fire.hover(card); await wait(1600);
        return () => fire.unhover(card);
      } },

    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tab]',
      title: "Four views of the same portfolio",
      body: "Overview, approval status, delivery health, and payments — switch between them any time.",
      // Deliberately no clean-back to Budgeting here. Step 4 is about the
      // Pipeline tab this demo just switched to — undoing it only to have
      // the very next step switch straight back stacked two tab transitions
      // in a row, and the pipeline-stages spotlight was landing on whatever
      // the first transition's mid-flight geometry happened to be.
      demo: async () => { fire.click(bySel('[data-tab="pipeline"]')); await wait(900); } },

    { section: "Dashboard", page: "cmd", tab: "pipeline",
      selector: '[data-tour="pipeline-stages"]',
      title: "Where every project sits",
      body: "Click any stage and the list below filters to just those projects — watch the connection.",
      demo: async () => {
        fire.click(bySel('[data-tour="pipeline-stages"] button')); await wait(1400);
        const clear = [...document.querySelectorAll("button")]
          .find((b) => /clear all/i.test(b.textContent || ""));
        return () => fire.click(clear);
      } },

    { section: "Dashboard", page: "cmd", tab: "execution",
      selector: '[data-tour="health-cards"]',
      title: "Delivery health",
      body: "Cost and schedule performance for approved projects. If the figures aren't ready yet, this says so honestly rather than guessing." },

    { section: "Dashboard", page: "cmd", tab: "financials",
      selector: '[data-tour="payments-flow"]',
      title: "Where the money is",
      body: "The stage-by-stage path from recommendation through to payment." },

    { section: "Dashboard", page: "cmd", tab: "investments",
      selector: '[data-tour="investments-panel"]',
      title: "A separate portfolio",
      body: "Investment projects are tracked apart from CAPEX — their figures never mix into the totals you just saw." },

    // ── Registers ──────────────────────────────────────────────────────
    { section: "Registers", page: "proj",
      selector: '[data-tour="projects-thead"]',
      title: "Every project, one table",
      body: "Sortable columns, and a filter under each header — click a column title to sort by it." },

    { section: "Registers", page: "proj",
      selector: '[data-tour="projects-filters"]',
      title: "Narrow it down",
      body: "Filter by fiscal year, organisation, stage or priority — they combine." },

    { section: "Registers", page: "camp",
      selector: '[data-tour="campus-filter"]',
      title: "The same portfolio, by location",
      body: "Pick a campus and every figure on this page — the KPI cards included — recalculates for just that site.",
      demo: async () => {
        fire.click(bySel('[data-tour="campus-filter"] [role="combobox"]')); await wait(500);
        fire.click([...document.querySelectorAll('[role="option"]')][1]); await wait(1500);
        return async () => {
          fire.click(bySel('[data-tour="campus-filter"] [role="combobox"]')); await wait(400);
          const all = [...document.querySelectorAll('[role="option"]')]
            .find((o) => /all (sites|campuses)/i.test(o.textContent || ""));
          fire.click(all);
        };
      } },

    { section: "Registers", page: "perf",
      selector: '[data-tour="performance-page"]',
      title: "Earned-value performance",
      body: "Cost and schedule variance across every project with enough data to calculate it." },

    // Project Cashflows & Timelines is PMO-only (pmoOnly: true in the
    // sidebar definition, and the router redirects any non-PMO session that
    // lands on "cashflow" straight back to Projects). A step here previously
    // pointed at a page a Guest can never reach.

    // ── The rest of the portal ─────────────────────────────────────────
    { section: "Portal", page: "upd",
      selector: '[data-tour="updates-page"]',
      title: "Project discussion",
      body: "Comments and progress notes, organised by project." },

    { section: "Portal", page: "team",
      selector: '[data-tour="team-about"]',
      title: "Who the PMO is",
      body: "The team behind this portal, and how to reach them." },

    // ── Inside a project ───────────────────────────────────────────────
    { section: "Inside a project", page: "proj", openProject: true,
      selector: '[data-tour="detail-hero"]',
      title: "One project, in full",
      body: "Identity, stage, priority and value at the top — everything else is a tab away." },

    { section: "Inside a project",
      selector: '[data-tour="detail-timeline"]',
      reveal: openDetailTab("timeline"),
      title: "Timeline",
      body: "The approval journey to date — real milestones only, nothing invented for stages that haven't happened yet." },

    { section: "Inside a project",
      selector: '[data-tour="detail-documents"]',
      reveal: openDetailTab("documents"),
      title: "Documents — view or download",
      body: "Click a file to open it. The download icon saves a copy instead.",
      demo: async () => {
        await wait(300);
        const card = document.querySelector('[data-tour="detail-documents"] [data-peek]')
          ?.closest("div[style*='cursor']");
        fire.hover(card); await wait(1400);
        return () => fire.unhover(card);
      } },

    { section: "Inside a project",
      selector: '[data-tour="detail-sitevisit"]',
      reveal: openDetailTab("sitevisit"),
      title: "Site Visit — the photo gallery",
      body: "Photos and video from site visits, playing as a slideshow. Click any frame for full screen, or use the download icon on an individual file." },

    // ── Done ───────────────────────────────────────────────────────────
    { section: "Done", page: "cmd", tab: "budgeting",
      selector: '[data-tour="search-trigger"]',
      title: "One more thing",
      body: "Ctrl K (or ⌘K) finds any project from anywhere in the portal. That's the whole tour — everything else explains itself as you go." },
  ];
}
