# Board report generator

Status: **planning paused 8 Oct 2026 at the PMO's request** (moved to the PM welcome email).
Nothing built, no migration run. Resume with the open decision below.

## Decided by the PMO (8 Oct 2026)

1. **Audience: both.** One report: a 1-2 page executive summary for the Board, then appendices for
   senior management (print only the front pages for the Board).
2. **Only the PMO builds and publishes.** The PMO picks the recipients (any users); they get a push
   notification and a pop-up at their next sign-in to view it; an **Email report** button sends it
   to the selected users with one click (PMO-pressed, so it fits the email rule).
3. **Monthly, frozen at publish**, compared with previous months (each published report becomes
   the next report's "last month").

## Open decision (ask first when resuming)

Rebuild the August and September 2026 month-ends from the Activity Log and store them as earlier
reports marked "reconstructed", so the first real report (September) already compares? Recommended
yes. Replay verified: it reproduces the 25 Sep ground truth to the rupee and 111/111 current rows.
Nothing before 21 Aug 2026 09:39:55 UTC can be rebuilt (every project was re-imported then).

## Later decisions, in order

- SU Requested on the report: published 1,167.31M (193 proposals; one 166.9M Ghana line, 11 zero
  lines, #106/#190 duplicate) or 701.79M on the portfolio projects.
- Budget reduction: leave out (typed 606.81M does not reconcile: 1,167.31 − 606.81 = 560.50 ≠ DF
  691.45M) or pick a computed definition.
- Schedule section only after the PMO confirms the shared 1 Oct planned end on 7 PMDC projects
  (104.35M) and fixes 3 projects whose planned end is on or before their release date
  (Malakand→Swat, KIOSK Machines, Media Equipment).
- Approved not yet released: 131,309,590 on approved projects + "released before approval
  3,374,800 (QIE Lifts)" as a separate line (recommended); the assistant's `executeGap` answers the
  net 127,934,790, so align it or footnote.
- Released history: frozen as-reported figures plus a footnote when a restatement differs.
- Optional sections: PDD intake (PMO-only data), carry forward, past projects.
- Risks by severity (1 critical / 25 high / 9 medium, as on the Risk Register page).
- Data clean-up before the first issue (each previewed + backed up): PMs for the 9 unassigned
  CAPEX projects; close 2 open risks on closed projects; move plan rows of 4 carved-out block funds
  to their 6 children and phase the 4 unplanned projects; missing PCD date.
- Presentation: SU / PMDC / PDD expansions for the glossary, "FY 2026-27" spelling, logo, any
  existing board template, "Prepared by" names.

## Sections (draft)

1. Executive summary (Board): Total CAPEX (109 / 691.5M DF), Approved (33 = 30 in execution + 3
   closed, 377.1M bac), Released (249.1M, 36% of DF), Approved not yet released (131.3M),
   Investment outside CAPEX (2 / 190.6M), each with "since last report"; "Needs attention" list
   built by code (approved with nothing released: Ferozpur Ph-3 68.2M, FC Lab A-117 13.6M;
   released before approval: QIE Lifts 3.4M; 9 projects without a PM).
2. Approval pipeline and movement (net counts at period end; "moved to Approved in the portal",
   which is not the MT sanction date).
3. Funding: releases by month (Cashflows page definition, one date per project, footnoted),
   approved vs released, plan vs released at portfolio level only, PMDC (cash-flow `pmdc` bucket
   projects) on its own line, investment separate. Never "spent".
4. Breakdown by campus / organisation (segments) / segment (sectors) / priority / type; top 10.
5. Schedule watch (only after the date fixes; wording "planned finish passed, completion not yet
   recorded").
6. Risks (severity counts, top risks, "register last reviewed 11 Sep 2026").
7. PDD intake and PMO review (document stage, not sanction).
8. Earlier years: carry forward (Finance pending payments, not FY 26-27 CAPEX); past projects
   (count, approved, released, released %, No progress, age bands; never "still to release").
9. Appendix: project register, definitions, "what this report does not cover".

Left out on purpose: spend (no actual data: actual_cost on 3 projects), progress / EVM / delayed
(pct_complete on 4 of 109, WBS empty), CPI/SPI, typed card texts that are stale.

## Build outline

- `src/reportCalc.js`: pure rows → figures (sum unrounded, round in the formatter), testable in
  node against SQL; never read `portfolio_dashboard.approved_count` (excludes closed).
- `src/BoardReport.jsx`, lazy: A4 layout, `@media print`, light theme tokens, hand-drawn SVG
  charts, `window.print()` from a tap after fonts load. No new dependency for v1.
- Table `board_reports` (period, figures jsonb, calc_version, generated/published by/at) plus
  recipients; RLS (PMO all; recipients read their published reports); grants per the 30 Oct rule;
  migration shown first. Push + sign-in pop-up + PMO-pressed email to recipients.
- Activity-log replay for month-ends (use rows with data; ignore browser rows with null details).
- Preview first.
