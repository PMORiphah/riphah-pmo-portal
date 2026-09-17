import { fire, wait } from "./TourGuide.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   TOUR CONTENT

   Written in the assistant's own voice, because the assistant hosts it — the
   character sits beside every caption and can read it aloud. Captions are
   addressed to the guest rather than describing a screen.

   Two facts that shaped the roles:
     projects_select: is_pmo() OR is_guest() OR is_assigned(id)
       A Guest's register is the full portfolio. A PM's is only their own.
     project_attachments has no INSERT policy at all.
       Nobody but the PMO uploads, so no step claims an upload capability
       that does not exist.

   One fact that shaped the mechanics:
     ProjectDetailPage's active tab is local state, invisible from outside, so
     a step cannot switch it via config — the only real way in is a genuine
     click on the visible tab button, which is what `reveal` does. Confirmed
     by testing this reached the wrong content before the fix: the caption
     claimed "Documents" while Overview stayed on screen.

   Project Cashflows is deliberately absent. It is PMO-only, and the router
   bounces any non-PMO session that lands there — an earlier version of this
   tour pointed at a page a Guest can never reach.
   ═══════════════════════════════════════════════════════════════════════════ */

const bySel = (sel) => document.querySelector(sel);

const openDetailTab = (tabId) => async () => {
  fire.click(bySel(`[data-tab="${tabId}"]`));
  await wait(550);
};

export function guestSteps() {
  return [
    // ── Dashboard ──────────────────────────────────────────────────────
    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tour="hero"]',
      title: "Start here",
      body: "This is the whole portfolio in one line — what it's worth, and whether it's running to plan. I keep it current, so it changes the moment anything does." },

    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tour="kpi-strip"]',
      title: "The seven figures I watch",
      body: "Requested, recommended, approved, released. Hover any of them and I'll tell you what it means and where it came from.",
      demo: async () => {
        const card = bySel('[data-tour="kpi-strip"]')?.firstElementChild;
        fire.hover(card); await wait(1600);
        return () => fire.unhover(card);
      } },

    { section: "Dashboard", page: "cmd", tab: "budgeting",
      selector: '[data-tab]',
      title: "Four ways to look at it",
      body: "The same portfolio, cut four ways — overview, approval status, delivery health, and payments. Let me show you.",
      // Deliberately no clean-back to Budgeting. The next step is about the
      // Pipeline tab this just switched to; undoing it only to switch straight
      // back stacked two transitions, and the spotlight landed on whatever the
      // first one's mid-flight geometry happened to be.
      demo: async () => { fire.click(bySel('[data-tab="pipeline"]')); await wait(900); } },

    { section: "Dashboard", page: "cmd", tab: "pipeline",
      selector: '[data-tour="pipeline-stages"]',
      title: "Where everything sits",
      body: "Every project is somewhere in this pipeline. Click a stage and the list below narrows to just those — watch.",
      demo: async () => {
        fire.click(bySel('[data-tour="pipeline-stages"] button')); await wait(1400);
        const clear = [...document.querySelectorAll("button")]
          .find((b) => /clear all/i.test(b.textContent || ""));
        return () => fire.click(clear);
      } },

    { section: "Dashboard", page: "cmd", tab: "execution",
      selector: '[data-tour="health-cards"]',
      title: "Whether it's on track",
      body: "Cost and schedule performance for approved projects. Where I don't have enough to calculate it yet, I'll say so rather than guess." },

    { section: "Dashboard", page: "cmd", tab: "financials",
      selector: '[data-tour="payments-flow"]',
      title: "Following the money",
      body: "The path from recommendation to payment, stage by stage. If money has moved, it shows up here." },

    { section: "Dashboard", page: "cmd", tab: "investments",
      selector: '[data-tour="investments-panel"]',
      title: "Kept separate",
      body: "Investment projects are tracked apart from CAPEX. I never let their figures mix into the totals you just saw." },

    // ── Registers ──────────────────────────────────────────────────────
    { section: "Registers", page: "proj",
      selector: '[data-tour="projects-thead"]',
      title: "Every project, one table",
      body: "Click any column heading to sort by it. There's a filter under each one too." },

    { section: "Registers", page: "proj",
      selector: '[data-tour="projects-filters"]',
      title: "Narrowing it down",
      body: "Fiscal year, organisation, stage, priority — stack as many as you like and they combine." },

    { section: "Registers", page: "camp",
      selector: '[data-tour="campus-filter"]',
      title: "By location",
      body: "Pick a campus and everything on this page recalculates for just that site — the cards at the top included. Here, I'll do it.",
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
      title: "Earned value",
      body: "Cost and schedule variance for every project with enough data behind it to calculate properly." },

    { section: "Registers", page: "risks",
      selector: '[data-tour="risk-register"]',
      title: "What could go wrong",
      body: "Every risk on record, with how likely it is and what it would cost. Most came straight out of the project charters — ask me about any of them." },

    { section: "Registers", page: "schedule",
      selector: '[data-tour="schedule-page"]',
      title: "When things happen",
      body: "Every project against the calendar, so you can see what overlaps, what's coming, and what has already slipped." },

    // ── The rest of the portal ─────────────────────────────────────────
    { section: "Portal", page: "upd",
      selector: '[data-tour="updates-page"]',
      title: "The conversation",
      body: "Comments and progress notes, kept against the project they belong to." },

    { section: "Portal", page: "team",
      selector: '[data-tour="team-about"]',
      title: "The people behind it",
      body: "Who the PMO is, and how to reach them when you need a person rather than a number." },

    // ── Inside a project ───────────────────────────────────────────────
    { section: "Inside a project", page: "proj", openProject: true,
      selector: '[data-tour="detail-hero"]',
      title: "One project, in full",
      body: "Identity, stage, priority and value across the top. Everything else is one tab away — let me walk you through them." },

    { section: "Inside a project",
      selector: '[data-tour="detail-timeline"]',
      reveal: openDetailTab("timeline"),
      title: "How it got here",
      body: "The approval journey so far. Real milestones only — I don't invent dates for stages that haven't happened." },

    { section: "Inside a project",
      selector: '[data-tour="detail-documents"]',
      reveal: openDetailTab("documents"),
      title: "The paperwork",
      body: "Click a file to read it. The download icon saves you a copy instead.",
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
      title: "What it looks like on site",
      body: "Photos and video from site visits, running as a slideshow. Click a frame for full screen, or download any one on its own." },

    // ── Make it yours ──────────────────────────────────────────────────
    // interactive: the spotlight lets clicks through so the guest can press
    // this as often as they like. Nothing is required — Done moves on regardless.
    { section: "Make it yours", page: "cmd", tab: "budgeting",
      selector: '[data-tour="theme-toggle"]',
      interactive: true,
      title: "Light or dark, your choice",
      body: "Go on, press it. Switch as many times as you like — I'll wait. When you've settled on one, press Done." },

    // ── Done ───────────────────────────────────────────────────────────
    { section: "Done", page: "cmd", tab: "budgeting",
      selector: '[data-tour="assistant-launcher"]',
      title: "And this is me",
      body: "That's the tour. Anything you want to know about the portfolio — a figure, a project, a risk, why two numbers disagree — I'm right here. Just ask." },
  ];
}
