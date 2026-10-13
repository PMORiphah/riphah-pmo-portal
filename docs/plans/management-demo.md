# Management demo: a simulation of the portal (Track 2)

Status: **planned 13 Oct 2026, waiting for the PMO's decisions** (meeting date and duration first). Nothing
built. Companion plan: `docs/plans/whatsapp-update-requests.md`. The demo does not depend on any WhatsApp
approval.

## Recommendation

A **simulation build of the real portal** (same React code at a pinned commit) whose every backend call is
answered by an **in-browser synthetic backend**, run from **localhost on the presenting laptop**, driven by
a **presenter mode built on the existing tour engine**, with a **recorded synthetic-data video** and a
**USB copy for a second laptop** as backups. No production deploy, no database, no outbound traffic, $0.

Built in two tiers so a near meeting date is still safe:

- **Tier A, meeting-ready (about 3-4 working days):** isolation shell, synthetic backend for the storyboard
  pages and the main drill-downs, PMO and Guest personas, a reconciled fictional dataset, presenter mode,
  the video and the USB kit.
- **Tier B, full (about 3-4 more days):** every page and project tab for PMO, Guest and PM, free
  exploration everywhere, and the production view SQL replayed in PGlite to prove every figure.

Why not the alternatives: a second Supabase project is blocked on the Free plan (the org already has its
2 active projects; Pro is about USD 45/month), needs a schema dump (only 7 of 119 migrations are in the
repo) and still needs every email/push/AI function stubbed; showing live production would put real names,
the PMO deadline pop-up and real automatic emails (a PMO post on Updates emails the PM) in front of the
room; a guided tour alone on real data is unsafe; a video alone cannot answer questions.

## Where isolation is enforced (not by hiding UI)

1. **Build:** a demo-only Vite config (`vite.config.demo.js`) with its own entry and an isolation plugin that
   rewrites the hard-coded production Supabase URL (6 files, 8 places), anon key, portal link and fonts; a
   tripwire fails the build if `prmxkecomqqngvrmytcj`, `supabase.co`, `pmo.riphah.edu.pk`, `graph.facebook`,
   `generativelanguage`, `groq` or the real key remain anywhere in `dist-demo`. The production build
   (`vite.config.js`, `build.sh`) is untouched; `dist-demo` is never committed.
2. **Browser:** a Content-Security-Policy allowing connections only to the demo's own address; a
   deny-by-default fetch shim (unknown requests refused and counted); push, passkeys and the service worker
   removed; `wa.me`, mail, phone and external links intercepted.
3. **Functions:** every edge function (ask, notify-comment, notify-past, welcome email, board-report notify,
   epdd-sync, deliverables-extract, invite/reset/delete user, push) answered locally; nothing is sent.
4. **Origin:** localhost, so no shared storage or service-worker scope with pmoriphah.github.io; storage
   and tab-sync names prefixed `demo:` anyway.
5. **Data:** generated from scratch; a privacy check rejects any real name, number, email, project code or
   campus name (compared against hashes only).
6. **Labels (not isolation):** a permanent "SIMULATION · invented data · nothing is sent" badge, a print
   footer on board-report PDFs, exported files prefixed `SIMULATION_`, title "PMO Portal (Simulation)".
7. **Frozen clock:** the meeting day at 14:00 PKT, so dates, overdue flags and board-report months are
   stable and inside FY 2026-27.

## Synthetic dataset

A fictional "Example University" (name to confirm), deliberately a different scale from Riphah (about 48
CAPEX + 2 investment projects, DF about PKR 318M), 8 sites, 1 PMO, 7 PMs, 3 senior-management guests,
phones on an invalid prefix and `.example` emails. Stages, money, cash-flow plan, risks (no criticals),
deliverables from synthetic PDDs, past projects, PDD intake (review verdicts produced by the real
`review.ts`), about 300 Activity Log rows from 21 Aug 2026, a published September board report built by
the real `reportCalc.js`, Updates threads, site photos (generated or CC0) and watermarked one-page PDFs.
The main project: "Science Lab Upgrade – Hill Campus" (approved, half released, behind schedule, a High
supplier risk, 3 of 8 items delivered).

Reconciliation checks run on every build (any failure stops it): DF total = DF card; Approved card = stage
approved/closed; released ≤ approved; stage counts add up; cash-flow plan = DF per project, investment
separate; EV = bac × % and the Delayed set is exactly the scripted one before and after the story; at-risk
and pop-up sets as scripted; risks by level; deliverables = PDD totals; PDD verdicts as intended; Activity
Log chain replays to the current rows; the published report equals `computeFigures()`; carry-forward and SU
cards = their lists; persona scopes; unread badges; privacy and tripwire checks. Tier B adds the production
view definitions (read once, read-only) replayed in PGlite at every story state, to the rupee.

## Storyboard (provisional: 4:15 core + optional 30 s closer)

Only implemented features are presented as working. The WhatsApp segment is a separate, labelled insert.

| Time | Screen and action | Visible result | Benefit / talking point |
|---|---|---|---|
| 0:00-0:35 | Dashboard: health verdict, Total CAPEX, DF / Approved / Released cards | One live version of the portfolio (invented figures) | Management and the PMO read the same numbers; "Approved = passed MT approval" |
| 0:35-1:05 | Project Health → Delayed; Campus Compare | The lab project stands out; Hill Campus coloured red | Exceptions surface on their own; "Delayed is only as good as progress reporting" |
| 1:05-1:40 | Project page: header, Risks, Deliverables, PM card | Money, schedule, risk, items, owner on one page | Deliverables come from the approved PDD; nobody retypes |
| 1:40-2:10 | Updates thread: PMO asks for status | Post on record against the project | Requests and answers stay with the project, not in private chats |
| 2:10-2:40 | **Insert, labelled "PROPOSED — SIMULATED":** WhatsApp request preview, PM taps, short form, receipt | Phone panel; nothing sent | What automatic WhatsApp requests would add; the decisions needed (number, Meta account, budget) |
| 2:40-3:05 | PM's reply on Updates; PM ticks delivered items | Badge lights; 3 more items ticked | PMs report only on their own projects; cannot change official figures |
| 3:05-3:40 | PMO updates % complete in Edit project, risk High → Medium; back to Dashboard, Compare, Activity Log | Delayed 3 → 2, colour change, old → new audit rows | Governance: PM reports, PMO verifies, everything audited; switch to Guest to show management's view |
| 3:40-4:15 | Board Reports → New report for the demo month vs September | Movement this month, PDF preview with footer | Board pack from the same records; frozen once published |
| 4:15-4:45 (optional) | Assistant "Where do we stand overall?" (prepared, code-computed answers) and a closing card | "Live today" vs "Proposed / parked: WhatsApp requests, weekly deliverables check-in, campus map" | Plain-language access; honest roadmap |

Likely questions → drill-downs: payments and investments tabs; Performance table; Risk Register matrix;
Cashflows; Timeline; PMO Review (a synthetic PDD with "Needs changes", AI notes labelled guidance only);
Past Projects; phone layout (prepared device window); light/dark.

## Coverage map (82 inventory features: 75 implemented, 2 partial, 2 planned, 3 rejected)

- **Main story:** dashboard hero and cards, Project Health and scatter, card lists, Campus Compare, project
  header / Risks / Deliverables / PM card / Discussion, Updates threads and badge, Edit project, Activity
  Log, Board Reports, assistant, living UI.
- **Drill-down on request:** PDD status, payments, investments, breakdown, KPI pencil (not saved), project
  register and export, RACI, Financials / Timeline / WBS (filled in the demo; empty live, said so),
  Documents, Site Visit, Lessons / Benefits, Sites view, Performance, Risk Register, Cashflows, portfolio
  Timeline, Past Projects and chats (stubbed), PMO Review and its checks, persona switch, notifications
  drawer, search, theme, phone layout, PMO deadline pop-up on demand.
- **Not shown (reason):** sign-in, passwords, passkeys, invites (real devices or mailboxes); Excel import,
  snapshot restore, delete (destructive); User Management, Welcome email, session detail (people data);
  Settings (stale "Phase 2 of 3" text); push and the 09:00 digest (real devices / email); PWA install;
  E-PDD sync (backend; visible through PMO Review); tours as products (their engine runs the demo).
- **Planned / rejected:** weekly deliverables check-in and campus map only named on the closing card;
  WhatsApp only in the labelled insert; offline mode, live pulse, 3D constellation never.

## Presenter controls

Start, Next/Skip (clicker PageDown), Back (PageUp), Pause/Resume ('.'), Explore (Esc: free use on the
current data), Resume story, Restart (Home), Reset data (R twice), persona switch (PMO / Guest / PM),
autoplay for the recording, Screen Wake Lock, unhandled-route counter and a reduced-motion warning.
Reuses `TourGuide.jsx` (`start`, `stop`, `running`, its Next/Back buttons) through an import alias, so no
production file changes; data events go in `reveal()` (the tour skips `demo()` under reduced motion).

## Readability and branding

1920×1080 at 125% browser zoom (1536 CSS px keeps the desktop layout; never 200%), F11 full screen, captions
≥ 18 px, larger cursor halo, self-hosted fonts. Light mode's muted text is only 4.8:1, so pick light/dark on
the actual screen (default: light on a projector, dark on an LED panel). Keep the portal's own chrome and
living UI; the badge and footer mark it as a simulation.

## Acceptance criteria

1. Build passes the tripwire; CSP present; no manifest or service worker.
2. Offline page test as each persona: 0 outside requests, 0 unhandled routes, 0 console errors, screenshots
   reviewed.
3. All reconciliation checks pass at every story state.
4. The story autoplays in 4:00-5:00 at 1920×1080, 125%, in Chrome and Edge, 5 runs in a row.
5. Restart and Reset give identical first screens.
6. The badge shows on every screen, modal, spotlight and print view.
7. Privacy check passes; the PMO spot-checks 10 records.
8. Runs with Wi-Fi off from localhost and from the USB copy on a second laptop.
9. The MP4 plays in PowerPoint and the WebM in a local player; captions readable from the back row.
10. The PMO signs off the wording, especially "PROPOSED — SIMULATED" and "not built".

## Meeting-day failure points → fallback

Laptop/browser → second laptop (USB) → video → screenshot deck. Venue Wi-Fi → not needed. Low-resolution
projector → rehearsed zoom, else video. Notifications/updates/sleep → Do not disturb, updates paused, clean
browser profile, wake lock. Reduced motion → warning chip, fix in rehearsal. Clicker keys → mapped and
tested. Off-script click → Esc, then Resume story. Reload → state kept, resume or Reset. Running long →
skip keys. Request to see live data → decline in the room, offer a separate session.

Rehearsal: T−7 storyboard walk-through; T−4 full run on the actual room screen and laptop (resolution,
zoom, theme, clicker, timing); T−2 fix-only build, final video, USB kit; T−1 two timed runs (one with
interruptions) and a video-fallback test; T−0 checklist 30 minutes before.

## Milestones

| | Deliverable | Effort | Depends on |
|---|---|---|---|
| D0 | Decisions, approved storyboard wording | 0.5 day with the PMO | — |
| D1 | Isolation shell (config, plugin, tripwire, shim, clock, badge) | 1 day | D0 |
| D2 | Synthetic backend (REST subset, persona rules, views, stubs) | 1-1.5 days (A) / +1.5 (B) | D1 |
| D3 | Dataset + reconciliation checks | 1-1.5 days (A) / +1 (B, PGlite) | D1 |
| D4 | Presenter mode + storyboard + WhatsApp insert | 1 day | D2, D3, D0 |
| D5 | Readability pass, PMO review | 0.5 day | D4 |
| D6 | Video, screenshot deck, USB kit | 0.5 day (+ MP4 conversion on a machine with full ffmpeg) | D5 |
| D7 | Rehearsals and meeting | ~4 h PMO / presenter | D6, room access |

Costs: $0 (open-source tools, localhost). PMO time about 5 hours. Keeping it aligned: the demo always builds
from current source; the offline page test flags any new backend call the simulation does not answer, and
the PGlite check flags view drift; pin the commit a few days before the meeting.
