# PMO Simulation: the two-minute presentation

Status: **proposed 14 Oct 2026, for discussion with the PMO.** Nothing is built in the app yet. This replaces
the 5-minute main presentation in `pmo-simulation.md`; that document's isolation design (§6) still applies,
with the additions below. Its deep-dive chapters are out of scope for now.

**Requirement (PMO, 14 Oct 2026):**
- The assistant presents the portal automatically, from the opening to the closing.
- It runs in **2 minutes at most**. This is a firm acceptance test.
- It uses excellent, consistent fictional data and is fully isolated from production.
- It waits for each screen to be ready before it speaks.
- It has controls for pause, resume, restart, chapter selection and exit.
- It covers 18 items: the 16 sidebar pages and tabs listed in §3, plus Documents and WBS inside one project.

**Evidence behind this plan (13–14 Oct 2026):**
- **Timing:** each scene's screen timed in Chromium on the fictional data (method in §4).
- **Code read:** every target, hover, z-index and refresh path the scenes rely on.
- **Data:** the extended fictional dataset, checked inside the real App.
  - The generator is in `docs/plans/pmo-simulation/prototype/gen.mjs`.
  - 81 of 81 reconciliation checks pass.
  - Two runs gave identical output.
- **Review:** an adversarial review of the first 2-minute draft. That draft failed the limit: 133 s worst case with a slower voice. Its corrections are built into the storyboard below.

## 1. How it runs

1. **Launch.** The PMO presses **Simulation** in the sidebar footer (PMO only, desktop only). This is the
   slot where Guests and PMs have Take the tour.
2. **Begin screen.** A new tab opens `simulation.html`, showing:
   - the assistant and "PMO Portal · Simulation · fictional data";
   - the 6 chapters with their start times;
   - a voice switch and **Test voice**, which plays one line and reports the voice's speed;
   - **Start**.

   While this screen is showing, the simulation gets ready:
   - it loads every lazy chunk and decodes all images;
   - it builds the dashboard behind the screen, so the first scene needs no loading;
   - it runs the isolation self-tests.

   Start stays disabled until all of this has passed.
3. **Run.** Pressing Start starts the 2-minute clock. The press also counts as the browser's required
   gesture before speech.
   - The assistant speaks each line, with a caption docked in the sidebar column.
   - It moves between the real pages, spotlights what it is talking about, and performs the demonstration
     actions: typing, filtering, sorting, ticking, opening and previewing.
   - A transparent shield stops stray clicks from changing the run. The control dock stays usable.
4. **Close.** A thank-you card ends the run, with these choices:
   - **Chapters**, to replay any part;
   - **Restart**;
   - **Exit**, which closes the tab.

   The PMO's real portal tab is never touched.

**Controls.** The dock sits bottom-right. It fades out while running and appears on mouse movement. Keys
and a presentation clicker work too.

| Control | Key / clicker | Behaviour |
|---|---|---|
| Pause / Resume | Space, `.` (clicker "blank") | Pause stops the speech and the run clock, and keeps the screen as it is. Resume re-speaks the current line from its start and continues with actions not yet done. Nothing is done twice. |
| Next / previous scene | → / ← (PageDown / PageUp) | Restores that scene's starting state, then plays it. |
| Chapters | C | A menu of the 6 chapters (below). Restores the chapter's starting state and plays to the end. |
| Restart | Home | Returns to the Begin screen with the data reset. The first screen is identical every time. |
| Exit | Esc (confirm) | Clears the simulation's storage and closes the tab. |

The dock also shows a run clock ("1:12 / 2:00") and the current chapter.

## 2. Storyboard (6 chapters, 20 scenes, 1:54.8 at 135 words per minute)

Times are at 135 wpm with a 0.3 s start delay per spoken line, the conservative case. At 150 wpm the run
takes 1:51.0.

- **Captions** show the line exactly as written below.
- **Speech** uses a separate text: "Capex" (not C-A-P-E-X), and numbers as words.
- **Sample** lists what is on screen when the line refers to it. Every figure is from the fictional
  dataset and was checked against the screen in the real App.
- **Ready** is what must be on screen before that part of the line is spoken (§4).

### Chapter 1 · Portfolio (0:00–0:29.6)

**1 · 0:00.0–0:09.1 · Opening and Capex Dashboard › CAPEX Overview** (item 1)
- Sample: hero "Attention Required"; TOTAL CAPEX PORTFOLIO PKR 447.5M, 48 projects · FY 2026-27; DF
  Recommended card 447.5M "48 DF Rec Projects".
- Says: *"The real portal, on fictional data. The Capex dashboard: 447.5 million rupees."*
- Does:
  - The Begin screen fades out (0.6 s) onto the dashboard, which is already settled.
  - The hero is spotlit.
  - From 3.5 s to 7.5 s the pointer rests on the DF Recommended card, and its tooltip shows "Portfolio
    value recommended after Director Finance review."
- Ready: confirmed before Start.

**2 · 0:09.1–0:13.4 · Investments tab** (item 3)
- Sample: "SEPARATE PORTFOLIO"; 3 investment projects; Approved 107.5M. The hero stays at 447.5M.
- Says: *"Investments sit apart, never counted in Capex."*
- Does: clicks Investments, then spotlights the banner and the register.
- Ready: the panel shows "INVESTMENT REGISTER (3)".

**3 · 0:13.4–0:18.5 · PDD Status tab** (item 2)
- Sample: the stage strip (Not submitted 19, Submitted 2, DF 4, ED 2, MT 5, Approved 14, Closed 2). The
  MT Review tile reads "With Managing Trustee".
- Says: *"PDD Status: five wait with the Managing Trustee."*
- Does:
  - Spotlights the strip and clicks the MT Review tile.
  - The list "PDD STATUS — MT REVIEW · 5 projects" opens. It is re-centred so the caption cannot cover it.
- Ready: the list header contains "5 projects".

**4 · 0:18.5–0:24.5 · Payments Status tab** (item 4)
- Sample:
  - Budget Released 92.5M, "20.7% of total CAPEX";
  - the flow DF → Approved → Released → Paid;
  - the list "BUDGET RELEASED · 15 projects".
- Says: *"Payments Status: 92.5 million released, project by project."*
- Does:
  - Clicks the tab, spotlights the Budget Released card, then clicks it. This is a plain click, so no
    tooltip appears.
  - The project list opens and is re-centred.
- Ready: the card reads 92.5M (its count-up has finished) before "92.5 million" is spoken.

**5 · 0:24.5–0:29.6 · Project Cashflows** (item 9)
- Sample:
  - the monthly plan bars, with the peak in Jan 27 at PKR 65.3M;
  - the PMDC tile, PKR 42.4M "9.5% of CAPEX". Its hover reads "Counted inside the CAPEX total above, and
    broken out here…".
- Says: *"Cashflows: the monthly plan, PMDC shown apart."*
- Does: speaks first, then opens the page (the slowest render). It spotlights the monthly chart, then
  hovers the PMDC tile.
- Ready: the chart has stopped animating (1.7 s measured) and the PMDC tile shows 42.4M.

### Chapter 2 · Inside a project (0:29.6–0:44.5)

**6 · 0:29.6–0:35.1 · Projects** (item 5)
- Sample: "ALL PROJECTS 48 of 48". Typing "Clinical" leaves one row: ET.272010-05 Clinical Skills Lab
  Upgrade, 52.4M, Approved.
- Says: *"Projects filters as you type. Let's open the Clinical Skills Lab."*
- Does:
  - Types "Clinical" into the search, one character at a time.
  - Spotlights the single row, then opens it (the row is chosen by its id, so the right project always
    opens).
- Ready:
  - the table shows 1 row;
  - the project page has finished loading: its tabs are drawn, Deliverables included.

**7 · 0:35.1–0:39.4 · Project › Documents** (item 17)
- Sample: "ATTACHMENTS (6)":
  - the E-PDD PDF;
  - two quotations;
  - the BOQ sheet;
  - the floor-plan image;
  - the award letter.

  All are uploaded by "Project Management Office", and every file is watermarked as fictional.
- Says: *"Every document for the project, in one place."*
- Does: clicks Documents and spotlights the cards. The pointer rests on the E-PDD card. It never opens or
  downloads a file.
- Ready: all 6 cards are drawn.

**8 · 0:39.4–0:44.5 · Project › WBS** (item 18)
- Sample: "WORK BREAKDOWN · 15 tasks" in 4 phases, with Procurement 100% Done. The row "Simulators: import
  and customs" ends on 30 Nov with **+20d** against its baseline.
- Says: *"The work breakdown shows the simulators twenty days behind baseline."*
- Does: clicks WBS, collapses Procurement, then spotlights the whole simulators row (not only the small
  +20d mark).
- Ready: the tasks have loaded and the table shows 15 rows.

### Chapter 3 · Delivery (0:44.5–0:58.5)

**9 · 0:44.5–0:49.2 · Performance** (item 6)
- Sample: the filter Delayed (4) gives "Showing 4 projects", with Clinical Skills Lab Upgrade at SPI 0.760.
- Says: *"Performance: four projects delayed, the Skills Lab among them."*
- Does: opens Performance (this also closes the project) and clicks Delayed.
- Ready: the caption reads "Showing 4 projects".
- Note: the line quotes no CPI, SPI or "All" counts, because this page also counts investment projects
  (see Found along the way).

**10 · 0:49.2–0:53.8 · Timeline & Schedule** (item 10)
- Sample: "48 scheduled", in campus bands. The hover card on the Skills Lab bar reads 1 Aug → 29 Dec 2026,
  Progress 38%.
- Says: *"Timeline and Schedule puts every project on one calendar."*
- Does: scrolls the Skills Lab row to the centre and hovers its bar. The spotlight covers both the row and
  the hover card, because the card would otherwise sit under the dimming.
- Ready: the caption reads "48 scheduled", and the hover card is shown.

**11 · 0:53.8–0:58.5 · Risk Register** (item 7)
- Sample: "23 open · 1 critical". The High probability × Medium impact cell holds 4 risks, and the list
  shows "4 of 23", including "Simulator delivery from the overseas vendor may slip".
- Says: *"The Risk Register: this cell holds the simulator risk."*
- Does: spotlights the matrix, clicks the cell, then spotlights the filtered list with the simulator risk
  emphasised.
- Ready: the list reads "4 of 23".

### Chapter 4 · Sites and people (0:58.5–1:25.9)

**12 · 0:58.5–1:12.6 · Campus / Sites › Compare** (item 8, the real Compare demonstration)

Sample:
- **All campuses:** "8 campuses · 48 CAPEX projects · DF PKR 447.5M · 16 approved · released PKR 92.5M".
  Sorted by Released, Hostels lead at 42% of DF, then Central Office 32% and Northbridge 29%.
- **Head to head:** Northbridge, Riverside Hospital and Hillview. Hillview leads Approved with PKR 66.8M;
  Northbridge leads Released with PKR 28.6M (29%).

Three lines, each tied to an action:
1. *"Compare puts all eight campuses side by side."* The page opens straight in Compare, and the whole
   table is spotlit.
2. *"Ranked by share released, Hostels lead at 42 percent."*
   - Clicks the Released column header. It sorts high to low on the first click, which was checked in the
     code.
   - Spotlights the column header and the top three rows.
   - Near the end of the line, spotlights the Hillview row and ticks its Compare box. The two largest
     campuses, Northbridge and Riverside Hospital, are ticked by default.
3. *"Head to head: Hillview leads on approved, Northbridge on released."*
   - Clicks "Head to head (3)".
   - Spotlights the Approved and Released rows across all three columns for at least 4.5 s.

Ready:
- the table has 8 rows;
- after sorting, the first row is Hostels;
- Head to head shows 3 columns.

**13 · 1:12.6–1:21.6 · Site-wise project managers, Sites view and Assign PM** (items 8 and 14)
- Sample:
  - the "PROJECT MANAGERS" block of each campus:
    - Northbridge "Omar Linfield (4) · Imran Ashdown (3) · 2 without a PM";
    - Riverside Hospital "Hira Brookes (6)";
    - Hillview "Nadia Fairweather (7)";
  - then the Sites view for Northbridge (9 projects);
  - then the Assign PM preview for Omar Linfield: "2 projects will be assigned", "7 left alone — already
    has a PM".
- Says:
  - *"Each site lists its managers."*
  - *"Assign PM previews first: two to assign, seven left alone."*
- Does:
  - Scrolls to the three manager blocks and spotlights them together.
  - Clicks **Open** on Northbridge. Its Sites view shows for at least 2.3 s.
  - Clicks **Assign PM** and picks Omar Linfield. Only the first two preview lines are ringed, without
    dimming, because the dialog sits below the dimming layer.
  - Presses **Cancel**. It never presses "Assign to 2 projects".
- Ready: the preview shows "2 projects will be assigned".

**14 · 1:21.6–1:25.9 · User Management** (item 14)
- Sample: "13 users · only the PMO can create accounts", showing roles, status and assigned projects (Nadia
  Fairweather, Project Manager, 7 projects; one inactive PM; 4 guests with "All projects (can comment)").
- Says: *"User Management: accounts, roles and assigned projects."*
- Does: spotlights the table, then Nadia's row. Nothing is clicked here: Deactivate, the inline WhatsApp
  edit and Delete would all write.
- Ready: the table shows 13 rows, ordered PMO first, then managers, then guests.

### Chapter 5 · Follow-up (1:25.9–1:41.7)

**15 · 1:25.9–1:31.5 · Updates** (item 11)
- Sample: the sidebar badge Updates 4. In the Inbox, Clinical Skills Lab Upgrade shows "2 new". Nadia's
  reply reads "…installation is re-planned so handover on 29 December still holds."
- Says: *"In Updates, Nadia replies: handover on 29 December still holds."*
- Does:
  - Opens Updates, then opens the thread.
  - The badge counts down to 2. The read marks are kept in memory only.
  - Spotlights Nadia's reply.
- Ready: the thread shows the reply text.

**16 · 1:31.5–1:37.5 · Past Projects** (item 12)
- Sample:
  - cards: Still open 13, Released PKR 76.2M (95% of approved), No progress 3;
  - "Unread 1" shows one project: Hillview Histology Microscopes, open 21 months;
  - its page shows "FOLLOW-UP · 2 MESSAGES".
- Says: *"Past Projects follows up older projects; Unread finds Nadia's reply."*
- Does: shows the cards for 2.2 s, clicks **Unread** for 1 s, then opens the project for at least 2.5 s.
  "Still to release" is never shown or said, as the PMO ruled on 6 Oct.
- Ready: the project page shows the follow-up thread.

**17 · 1:37.5–1:41.7 · Gallery** (item 13)
- Sample: "12 photos and videos across the portfolio". The two newest are of the Clinical Skills Lab. The
  first one opens full screen with "Clinical Skills Lab Upgrade · Hillview · yesterday".
- Says: *"The Gallery: site-visit pictures, newest first."*
- Does:
  - Shows the grid for 1.4 s, then opens the first picture for 2.4 s.
  - While it is open there is no dimming, and the assistant shrinks to its avatar in a corner.
  - Escape closes it, leading into the next scene.
- Ready: all 12 tiles have loaded their images.

### Chapter 6 · Reporting and team (1:41.7–1:54.8)

**18 · 1:41.7–1:46.7 · Board Reports** (item 15)
- Sample:
  - "Monthly Board Report: September 2026 — Published · shared with 3, opened by 2";
  - page 1 of the report, with month-end tiles.

  The caption kicker reads "September report · as at 30 Sep 2026", because these month-end figures differ
  on purpose from today's dashboard.
- Says: *"Board Reports: month-end figures, shared as a report."*
- Does: opens the September report, spotlights the summary tiles and the toolbar without clicking them,
  then presses Back.
- Ready: the report's 6 pages are drawn.

**19 · 1:46.7–1:51.8 · Team & About** (item 16)
- Sample:
  - the About card, ending "This is a simulation…";
  - the team chart, with the Head PMO card hovered;
  - the contact block: pmo@university.example, Monday to Friday 9:00–5:00.
- Says: *"Team and About: who we are, how to reach us."*
- Does: spotlights About, then the team chart, then Contact.
- Ready: the names have loaded.

**20 · 1:51.8–1:54.8 · Close**
- Says: *"That's the portal. Thank you."*
- Does: the screen fades to the thank-you card, with the six chapters as buttons, Restart and Exit. The
  avatar shows success.

**About 5 s is left in hand at 135 wpm.** §4 explains how the 2:00 limit holds when the voice or the
machine is slower than that.

## 3. Coverage of the 18 required items

Every item is shown on its real screen. Nothing is described from its name alone: every claim in the
narration was checked against the code and against the screen.

| # | Required item | Scene | What is actually demonstrated |
|---|---|---|---|
| 1 | CAPEX dashboard | 1 | Hero health verdict, Total CAPEX, DF Recommended card with its tooltip |
| 2 | PDD approval status | 3 | Stage strip; clicking a stage lists its projects |
| 3 | Investment projects | 2 | Separate portfolio, register; hero unchanged |
| 4 | Payment status | 4 | Released card, flow to Paid; clicking lists the projects |
| 5 | Projects list | 6 | Search filters live; opening a project |
| 6 | Performance | 9 | Delayed filter |
| 7 | Risks | 11 | Matrix cell filters the register |
| 8 | Campus/Site with Compare | 12, 13 | Compare table, sort by Released, tick a campus, Head to head; Open → Sites view |
| 9 | Cashflows | 5 | Monthly plan; PMDC broken out |
| 10 | Timeline & Schedule | 10 | Every project on one calendar; hover card |
| 11 | Updates | 15 | Inbox, unread thread, badge counts down |
| 12 | Past Projects | 16 | Cards, Unread filter, follow-up thread |
| 13 | Gallery | 17 | Grid, newest first; full-screen view |
| 14 | Users and site-wise PMs | 13, 14 | See note below |
| 15 | Board Reports | 18 | Published report, page 1 |
| 16 | Team & About | 19 | About, team chart, contact |
| 17 | Documents (in one project) | 7 | The project's documents |
| 18 | WBS (in one project) | 8 | Phases, collapse, baseline slip |

**Site-wise PMs (item 14).** The portal has no separate page for this, and the simulation will not invent
one. Site-wise managers appear in three existing places, and the run shows all three:
1. The **Project managers** block on each campus in Compare › Head to head.
2. **Assign PM** in the Sites view, with its preview.
3. **User Management**, which shows each manager's assigned projects.

**Shown but not clicked:** writes such as Edit, Delete, Deactivate, Post and Assign; downloads, exports
and print. During the run, nothing that would send or write is pressed. Outside the run, the simulated
backend answers every such call without sending anything, and the badge says so.

**Not in the 2-minute run:** PMO Review, Activity Log, Settings, the assistant chat, Deliverables,
Lessons/Benefits and the phone layout. These are not on the PMO's list, and they do not fit in 2 minutes.

## 4. Holding the 2-minute limit

The first draft overran: 133 s with a slower voice. Five measures now hold the limit.

1. **Word budget.** The narration is 218 spoken words in 23 lines. This is counted as a voice actually
   speaks them: "PMDC" is 4 words, "PDD" is 3, and "447.5" is said in full.
2. **Speaking speed adjusts itself.** Each line is timed from its start to its end. The next line's speed
   is then nudged within 0.95–1.15 of the voice's normal rate, so a slow voice is brought up to about 135
   wpm.
3. **Deadline governor.** At the start of each scene, the run adds the time already used to the minimum
   time the remaining scenes need.
   - If the total would pass 1:56, the next scenes switch to shorter prepared lines, for example:
     - "Head to head, side by side."
     - "Assign PM previews the change."
     - "Thank you."
   - Their holds shorten too. This recovers about 10 s.
   - **At 1:59.5 the run cuts to the closing card, whatever is happening.** The limit cannot be exceeded.
4. **Readiness overlaps speech.** A line starts as the click happens, and is written so that the figure it
   names comes late in the sentence. The page has therefore loaded by the time the figure is spoken.

   Measured on the fictional data:

   | Page type | Ready after |
   |---|---|
   | Plain pages | 0.4 s |
   | Pages with counting figures | 0.9 s |
   | Chart pages | 1.7 s |

   On a machine 4× slower, the whole route takes about 3.5 s longer. Waiting is absorbed by the scene's
   own time; it does not add to the run.

   Each wait has a 4 s limit. If it runs out, the run restores that scene's starting state and tries
   once more. If that also fails, it moves to the next scene with a note only the presenter sees.
5. **Captions-only mode** (voice off) reads at a fixed pace and runs in 1:51.

| Voice's natural speed | Run time with no control | With speed adjustment (max 1.15×) | With the governor as well |
|---|---|---|---|
| 160 wpm | 1:49.0 | 1:49.0 | 1:49.0 |
| 150 wpm | 1:51.0 | 1:51.0 | 1:51.0 |
| 135 wpm | 1:54.8 | 1:54.8 | 1:54.8 |
| 130 wpm, 0.4 s start delay | 1:59.0 | 1:51.9 | 1:51.9 |
| 120 wpm, 0.4 s start delay | 2:06.2 | 1:54.8 | 1:54.8 |
| 110 wpm, 0.5 s start delay | 2:18.2 | 2:03.2 | short lines, under 1:56 |

These figures are computed from the word counts, not measured with real voices; real voices are measured
on the presenting laptop (§9).

**Test voice** on the Begin screen reports the voice's speed and suggests a different voice if it is
below 135 wpm.

## 5. Fictional data

The data is generated from scratch; no production record has been renamed. The generator is
`docs/plans/pmo-simulation/prototype/gen.mjs`, and it gives the same output on every run.

**The dataset:**
- **Projects:** 8 fictional campuses with 48 CAPEX and 3 investment projects. DF Recommended is PKR
  447,470,000, and the stages, money, cash-flow plan, risks, deliverables and past projects all agree with
  each other.
- **People:**
  - 13 users: 1 PMO account, 7 active PMs, 1 inactive PM and 4 senior-management guests.
  - A 6-person PMO team, plus PM and guest names, all invented.
  - Every phone number uses the impossible prefix +00, and every email ends in `.example`.
- **Clock:** fixed at Thu 15 Oct 2026 10:30 PKT, so overdue flags, "yesterday" labels and the September
  report always read the same.

**One story connects the screens:**
- **The project:** Clinical Skills Lab Upgrade at Hillview, managed by Nadia Fairweather. It is Approved,
  with PKR 52.4M approved and 18.3M released, and is 38% complete.
- **The thread:**
  - The WBS shows the simulator import 20 days behind baseline.
  - The Risk Register carries the matching High risk.
  - In Updates, Nadia confirms that handover on 29 December still holds.
  - Her past project carries an unread reply.
  - The two newest Gallery pictures are of this project.

**Calculations** use the portal's own rules: Approved means stage approved or closed, the base is DF
Recommended, released money is disbursed (never "spent"), PMDC sits inside CAPEX, and investment is
never CAPEX. The September report is built by the real `reportCalc.js`, and the PDD reviews by the real
rules.

**81 reconciliation checks pass.** They cover:
- totals against the views;
- Approved against the stage rule;
- released ≤ approved;
- the Delayed set;
- the report against `computeFigures()`;
- the privacy check, which finds no real name or domain.

**Files:**
- 24 same-origin files: watermarked PDFs, a BOQ sheet, a floor plan, and site pictures drawn as
  illustrations marked "SIMULATION · illustration".
- These can be swapped for free-licence photographs if the PMO prefers (about half a day).

**What the narration avoids:** places where the live code counts differently, so a figure could disagree
between two screens (see Found along the way).

## 6. Isolation

As designed and tested in `pmo-simulation.md` §6:
- a static Content-Security-Policy that lets the page talk only to itself;
- a boot script that namespaces storage, tab channels and locks, removes push and passkeys, and blocks the
  service worker;
- a synthetic backend that refuses anything it does not recognise;
- self-tests that fail closed.

The Chromium experiment made 0 production calls across 14 pages.

**Additions for this version.** These come from a code sweep on 14 Oct 2026: 110 surfaces were found and
verified, then reviewed by a completeness critic.

- **Writes kept in memory for the run.** The backend keeps read marks and similar writes for the run only,
  so the badges count down. Restart, Chapters and Previous restore a saved starting state.
- **No deadline pop-up.** `at_risk_projects` returns nothing, so the pop-up never appears.
- **The whole of `fetch` is wrapped, not only the portal's `supa()` helper.** Five calls go straight to the
  production address with a raw `fetch`:
  - invite user, reset password and delete user (`App.jsx` ~8248, 8288, 8304);
  - the deadline email (~931);
  - the PMO Review charter (`PmoReview.jsx` 519).

  The CSP would block these anyway; the wrapper answers them as "Not sent: this is the simulation".
- **Nothing real can come in.** The backend refuses the steps that would put real data under fictional
  labels:
  - uploads to Documents or Site Visit (`POST /storage/v1/object/*`);
  - committing an Excel import of projects, past projects or WBS tasks.

  Parsing and the import preview still work, because they are local.

  Otherwise a real file or sheet from the laptop would be printed later as "Simulation · fictional data".
- **No sign-in inside the simulation:**
  - Sign out acts as Exit, with a confirm.
  - Every `/auth/v1/*` call is refused, including Forgot password (`App.jsx` ~10595) and the password
    grant. A password typed there is never kept or sent.
- **Links are neutralised at the address, not only on click.** A watcher in the boot script rewrites every
  outside address to a no-op and keeps the original in a data attribute. This covers wa.me, mailto:,
  tel:, the E-PDD portal and the production portal link in WhatsApp nudges and the Welcome preview.
  Middle-click, "Open link in new tab", "Copy link address" and dragging a link therefore lead nowhere real.
- **The tab cannot be navigated away.** A navigation guard and `beforeunload` cover the places that set
  `window.location` directly, such as PMO Review › Save (`PmoReview.jsx` 500).
  `window.open("")` gets a window the simulation controls.
- **Fonts are self-hosted.** The four families are under `public/sim/fonts`; all are SIL Open Font
  Licence, so they may be redistributed. The boot script points the portal's runtime Google Fonts link at
  them before it is inserted, so there is no outside request and no CSP violation. The CSP allows inline
  `<style>`, which the portal and the Board report rely on.
- **No install, no home-screen icon.** `simulation.html` has no manifest and no apple-touch tags, so the
  browser offers no "Install" that would open the real portal.
- **Speech:** Chrome's "Google …" voices and Edge's "Online (Natural)" voices are network voices. They send
  the text they speak to Google or Microsoft, outside the page's CSP. `speech.js` currently ranks them
  first. Decision 2 (§11) settles whether the simulation uses on-device voices only.

**No production information appears.** The sweep found two places where real information would have
shown inside the simulation. Both are now in the plan:
1. **The Welcome email preview** loads the real screenshots in `public/email/`. `after-signin.jpg` shows a
   real PM's header ("2 of 2", DF PKR 3.7M). It also links to the production portal.
   - Fix: `WelcomeEmail.jsx` reads its picture folder and portal link through the same helper as
     `storageBase()`.
   - The simulation points them at screenshots of the simulation itself and at `simulation.html`.
2. **The assistant's starter question "What are the risks on Ferozpur?"** names a real project
   (`AskPanel.jsx` 41).
   - Fix: the starter list becomes a list the simulation can replace, for example with "What are the risks
     on the Clinical Skills Lab?".

## 6a. Printables and exports (PMO decision 14 Oct 2026)

The rules:
- **On screen,** the Riphah branding stays: logo, crest, colours, the sign-in look and the tab icon.
- **Anything that leaves the screen as a print or a file** is allowed, and says "Simulation · fictional
  data". The university's name and logo never sit on a printout or a file next to fictional figures.
- **Anything that would leave the machine or reach a person** is blocked with an honest message: email,
  push, WhatsApp, links to the real portal.

| Surface | Treatment in the simulation |
|---|---|
| **Print of any page** (Ctrl+P or the browser menu) | The simulation's own print stylesheet: a "SIMULATION · FICTIONAL DATA" banner on every page, a footer "PMO Portal simulation · every name and figure is invented" with page numbers, Riphah logos hidden in print, and the director's dock, caption and spotlight hidden. The file name is `SIMULATION_<page>_<date>`, set from the page title just before printing. |
| **Board report on screen** (scene 18) | Unchanged: the Riphah band and footers, with the simulation badge above the page. |
| **Board report › Save as PDF** | Allowed. In print, the university's name in the band and the footers is replaced by "Simulation · fictional data". A light diagonal "SIMULATION · FICTIONAL DATA" watermark runs across each of the 6 pages. The file name is `SIMULATION_Board_Report_September_2026.pdf`. |
| **Board report › Email report, Recipients / Publish push** | Blocked: "Not sent: this is the simulation. Nothing leaves this page." |
| **Excel exports:** Projects Export, Campus comparison › Download as Excel | Allowed. A title row 1 reads "Simulation · fictional data — PMO Portal simulation, exported 15 Oct 2026. Every name and figure is invented." Also print header and footer, file properties, and the name prefix `SIMULATION_`. |
| **Excel templates:** Projects Template, Import › Download Template, WBS Template, Past Projects › Download sheet | Allowed. Headers stay in row 1, so re-importing works inside the simulation. The label goes on the sheet tab or the guide title, the print header and footer, the file properties ("PMO Portal Simulation" instead of "Riphah PMO Portal") and the file name. The real sample row ("Riphah", "Islamabad") and the real campus list in the past-projects guide are replaced with fictional ones. |
| **Project documents, Site Visit and Gallery downloads** | Allowed. They are the simulation's own files, already watermarked "SIMULATION – FICTIONAL DATA" or "SIMULATION · illustration", and are saved as `SIMULATION_<file name>`. |
| **Welcome email preview** | On screen, a ribbon reads "Simulation · fictional data · this email is never sent". It shows the simulation's own screenshots (see above). In print the preview is replaced by that ribbon. Send is blocked. |
| **Save page as** (Ctrl+S) | Ctrl+S shows "Not available in the simulation". The menu path saves a page whose title and badge say Simulation. |
| **Copy suggested reply** (PMO Review) | The copied text starts "[Simulation · fictional data]". Ordinary copying is not changed, so a code copied into the search box still works. |
| **Screenshots, screen share, recordings** | These cannot be intercepted. The badge "Simulation · fictional data · nothing is sent" therefore stays visible in every state: running, paused, the chapter menu and the closing card. |
| **Tab title** | "PMO Portal Simulation · fictional data", without the university's name, because it becomes the default name of every saved PDF. |

**How this works without production edits.** Every download is caught inside the simulation's own code:
- SheetJS, which writes 4 of the exports, calls a global `saveAs` first, so the boot script defines one.
- The 2 exceljs downloads use a Blob link, which the boot script's `createObjectURL` and link wrapper sees.

The labeller then opens each file with exceljs (already a lazy chunk), adds the label and saves the file. A
file name it does not recognise gets "Not available in the simulation".

The only production edit this needs is in `BoardReport.jsx`: the university's name moves into its own
`<span data-org>`. The text and appearance in production are unchanged.

## 7. What the director needs (new code, simulation only)

**The overlay** is new and draws its own spotlight. It reuses the tour's easing and measuring, but extends
the single cut-out it has today. It can:
- light several rectangles at once;
- show a ring with no dimming, for dialogs and the full-screen picture;
- use a lighter dim of about 45%;
- keep the caption docked in the sidebar column, or shrink to the avatar.

**Scenes are written as data.** Each action is written as an "ensure" step: for example, "make sure the
Released column is sorted high to low", rather than "click the header". Replaying a scene therefore never
flips something back. A saved starting state at every scene makes Previous, Chapters and Restart exact.

**Speech** speaks the speech text only, never a step title. It is started before the navigation click,
the next line is spoken when the current one ends, and it uses the speed control from §4.

**Lite mode.** If the laptop cannot draw the portal's glass effects smoothly, the simulation turns them
off for the run. The Begin screen measures this.

## 8. Changes to the live portal (additive; preview first, needs PMO approval)

| File | Change | Effect on the live portal |
|---|---|---|
| new `simulation.source.html`, `public/sim-boot.js`, `src/sim/*`, `public/sim/*` (data, files, fonts, screenshots) | page, boot script, backend, director, scenes, labeller | none; loaded only on `simulation.html` |
| `build.sh` | also writes `simulation.html` from the built page | none |
| `src/main.jsx` | if on `simulation.html`, load the simulation chunk | none for the portal; a few hundred bytes |
| `src/App.jsx` | Simulation button (PMO, desktop); about 35 `data-*` attributes for the director | the button only; attributes have no behaviour |
| `src/PhotoWall.jsx`, `src/App.jsx`, `src/PmoReview.jsx`, `src/WelcomeEmail.jsx` | file links, the Welcome email picture folder and its portal link read through one helper (`storageBase()`) | identical URLs in production |
| `src/AskPanel.jsx` | starter questions read from a list the simulation can replace | identical in production |
| `src/BoardReport.jsx` | the university's name in its own `<span data-org>` (2 places) | identical text and look |
| `public/sw.js` | a notification click never takes over a `simulation.html` tab (production or `/preview/`) | closes a same-address hazard |
| `public/404.html` | `/simulation…` and `/preview/simulation…` typos go to the simulation, never the real portal | closes a same-address hazard |

There is no change to the database, RLS, edge functions or schema.

Compared with the first version of this plan:
- The planned "logo via a brand setting" is dropped, because the logo stays on screen and print CSS hides it.
- A new `brand.js` was considered for the Board report and rejected. `BRAND` is already the colour export
  of `theme.js`, which `BoardReport.jsx` imports, so the name would collide.

## 9. Verification before it is called done

**Automated, here in Chromium:**
1. **Timing:**
   - 10 runs in a row at 1920×1080, 1536×864 (125%) and 1366×768.
   - Run in captions-only mode, and with a test speech engine at 160, 150, 135, 130, 120 and 110 wpm with
     0.3–0.5 s start delays.
   - **Every run must end by 2:00.0.**
   - Each run writes a timing log per scene.
2. **Readiness:** every figure named in a line must be present on screen before the line reaches it. This
   is checked against the screen text with timestamps, on every run.
3. **Controls:**
   - Pause and resume in each of the 20 scenes.
   - Every chapter, entered from 3 different points.
   - Previous and next.
   - Restart, which must give an identical first screen (compared as pixels).
   - Exit, which must clear the simulation's storage.
   - No action may run twice; toggles are checked.
4. **Isolation:**
   - 0 requests outside the page, 0 CSP violations, 0 unrecognised backend calls and 0 console errors, on
     every run.
   - A real signed-in portal tab, open alongside, is untouched before and after.
   - The run must fail closed when the CSP is removed.
5. **Printables and blocks:**
   - Print-preview every page and the Board report.
   - Check that the banner, footer and watermark appear, that the Riphah logo does not, and that Chrome's
     own header and footer do not add "riphah" next to the figures. If the simulation's footer cannot
     replace Chrome's, record exactly what Chrome adds.
   - Download all 6 Excel files and the documents. Open each one and check its label and its
     `SIMULATION_` name; re-import each template inside the simulation.
   - Try an upload, an import commit, Forgot password, Sign out, middle-click on a WhatsApp chip, and
     PMO Review › Save. Each must end with nothing leaving the page.
6. **Slow machine:** with the CPU slowed 4× and no GPU, every run must still end by 2:00.
7. **Data and screens:**
   - all 81 checks pass;
   - the privacy scan finds nothing real;
   - every scene is screenshotted in light and dark themes and reviewed.

**On the presenting laptop, with the PMO (about 30 minutes):** real voices and the real graphics card
cannot be tested here, because headless Chromium has no voices.
- Test voice.
- 3 timed runs in a row on the meeting room's screen with the clicker.
- The run report shows the total and per-scene times, so the numbers can be sent to me.

## 10. Effort and order

| Stage | Work | Days |
|---|---|---|
| S1 | `simulation.html`, boot script (link, navigation and download guards), synthetic backend, data, self-hosted fonts, simulation screenshots, the §8 hooks, sw/404 guards, button | 2.5–3 |
| S2 | director: overlay, scenes, readiness, snapshots, controls, speech speed control, governor | 2 |
| S3 | the 20 scenes and their checks | 1 |
| S4 | print stylesheet and export labeller (§6a), lite mode, 1366 px, light/dark, Test voice | 1–1.5 |
| S5 | the verification above, run report, rehearsal checklist | 1 |

That is about **7.5–8.5 working days** to a `/preview/` build the PMO can try. It then goes to production after
the PMO's review on desktop.

## 11. Decisions

1. **Branding on fictional data: decided 14 Oct 2026 (PMO).** Keep the Riphah branding on screen. Anything
   printable or exportable carries a "Simulation · fictional data" label instead of presenting fictional
   figures under the university's name (§6a lists every surface and its treatment).
2. **Voice.** Two parts:
   - **On by default, or captions only?** Recommended: voice on, with captions always shown.
   - **Which voices?** Recommended: on-device voices only. The narration then never leaves the laptop,
     the badge's "nothing is sent" stays literally true, and timing is steadier, because network voices add
     start delay and do not report word timing reliably.

     The alternative is to also allow the more natural online voices: Chrome's "Google …" and Edge's
     "Online (Natural)". The narration text, which is fictional, would then be sent to Google or Microsoft,
     and the badge would drop "nothing is sent".
3. **Approval of the live-portal changes in §8**, preview first.
4. **Meeting date.** This decides whether 7.5–8.5 working days fits, and when the rehearsal on the presenting
   laptop happens.

## Found along the way (live portal; the narration avoids these; each needs its own approval)

New since the 13 Oct list in `pmo-simulation.md`:
1. **Performance counts investment projects.** Its query has no portfolio filter (`App.jsx` ~6427), so its
   counts differ from the dashboard's.
2. **The Remaining CAPEX card** shows DF − Approved, labelled "awaiting approval" (`App.jsx` ~3598). Its
   hover text says "not yet released" (`theme.js`).
3. **The Sites view's Approved figure leaves out closed projects**, while Compare and the dashboard include
   them.
4. **At 1440 px wide, the dashboard's KPI card titles are cut off** ("DF RECOMM…").
5. **Cashflows says "Planned spend"** for money that is released, not spent.
6. **The Timeline hover card renders under the tour dimming** (z-index 60, no `role="tooltip"`). The
   simulation works around this with its own overlay.
7. **Tapping a push notification opens a broken address (live bug, confirmed 14 Oct 2026).** In
   `public/sw.js` line 77 the link is resolved against `self.location.origin + self.registration.scope`.
   The scope is already a full address, so the origin appears twice.
   - The link `./?review=12`, which `epdd-sync` sends for a new PDD, becomes
     `https://pmoriphah.github.iohttps//pmoriphah.github.io/riphah-pmo-portal/?review=12`.
   - The same happens to Board report and past-project follow-up pushes.
   - This was checked in Node. `send-push` v1 was also read: it passes the link through unchanged.
   - So, with the portal open, a tap sends that tab to an address that does not exist; with it closed, a
     tap opens one.
   - The fix is one line: `new URL(url, self.registration.scope)`. It needs a real-phone test (iOS and
     Android), since push cannot be tested headless. It is separate from the simulation.

