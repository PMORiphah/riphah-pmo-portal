# PMO Simulation: an assistant-led presentation of the portal

Status: **proposed 13 Oct 2026; the main presentation is superseded 14 Oct 2026 by the two-minute version in `pmo-simulation-2min.md`** (the PMO set a firm 2-minute limit). The isolation design (§6) still applies; the 5-minute storyboard and deep dives below are kept for reference. Nothing built in the app. This replaces
the "localhost build" recommendation in `management-demo.md` with an option inside the portal, as the PMO
asked. Evidence behind it (13 Oct 2026): a code read of every scene target, an isolation experiment in
Chromium (static CSP, storage/channel/lock namespacing, the real App built as a second entry and walked across
14 pages with a logging shim: 0 production calls, 0 CSP violations), a working synthetic-data generator
(37 reconciliation checks pass; prototype in `docs/plans/pmo-simulation/prototype/`), a full storyboard and
an adversarial review of every figure, claim and timing.

## 1. The experience

- **Where:** a **Simulation** button in the PMO's sidebar footer, desktop only, in the spot where Guests and
  PMs have **Take the tour** (the PMO has no tour, so the slot is free and the parallel is natural). The PMO
  can also type "start the simulation" to the assistant. Not a NAV page: it holds no live data.
- **Launch:** it opens `simulation.html` in a new tab (the real portal stays untouched in its own tab). A
  **Begin** screen shows the assistant, "Portal Simulation · fictional data", the chapter list, the runtime,
  a voice on/off switch and **Start**. The Start press is the user gesture browsers need before speech; the
  screen also loads voices, preloads every lazy chunk and runs the isolation self-tests.
- **Run:** the assistant presents automatically across the real portal screens: speaks (optional voice) with
  large captions, navigates, spotlights, demonstrates actions, shows the downstream change, links to the
  next scene, and ends with a recap. The PMO can pause at any moment, jump chapters, explore, restart or exit.
- **Exit:** closes the simulation tab (or returns to the portal); nothing it did exists anywhere else.

## 2. What we reuse

| From | Reused as is | Extended (new code, existing behaviour untouched) |
|---|---|---|
| `TourGuide.jsx` | spotlight cut-out (box-shadow at z 1800), easing, `scrollTargetIntoView`, re-measure logic, `body.pmo-touring` tooltip lift, the avatar-beside-caption idea | a new **director** with autoplay, pause/resume, chapters, checkpoints, readiness checks, recovery; a larger stage caption; a stable nav reference (the tour's `tourNav` is rebuilt on every App render and can re-run a step) |
| `tourSteps.js` | step vocabulary (`page`, `tab`, `reveal`, `selector`, `dim`, `leaveProject`) and `openDetailTab` | scene/beat data with bound figures and idempotent actions |
| `AssistantAvatar.jsx` | the character, both palettes, states idle / thinking / speaking / success / error | states driven by the director (thinking while navigating, speaking while a line plays, success after a result lands) |
| `speech.js` | `speechSynthesis`, offline, `sayNumber` | a sim speech text per line (codes skipped, "PKR 447.5M" → "447.5 million"), one sentence per utterance, advance on `onend` |
| `ui.jsx` / App | `useCountUp` / `AnimatedNumber`, `.pmo-breathe`, Tooltip/InsightTip portals, page remount on navigation | "was N" chips and a gold pulse on changed figures |
| Guest/PM tours | their behaviour is preserved exactly | — |

Two flaws in the existing tours, found while checking (production, separate approval): `fire.hover` sends
`mouseenter`, which React 18 does not listen to (so the guest tour's hover demos probably show nothing), and
the step effect re-runs on any App re-render. The director avoids both; fixing the tours is optional.

## 3. Storyboard: main presentation (≈ 5 min 20 s, 8 parts)

Figures come from the synthetic dataset and are **bound** to it: each line's numbers are read from the
simulation's data through the same calculations the screen uses, and a scene starts speaking only when the
screen shows those exact figures. Spoken text may round ("447.5 million"); captions show the screen's text.

| Time | Scene: what the audience sees → what changes | Narration |
|---|---|---|
| 0:00 | **Opening.** Dashboard under a soft veil; the assistant greets. Veil lifts to the hero. | "Welcome. I'm the portal's assistant. In about five minutes I'll show how the PMO runs the capital portfolio, from what we see to how decisions reach you." · "The screens are the real portal; the data is fictional." |
| 0:20 | **1 Visibility · hero.** Spotlight on the hero, then the verdict; the SPI tooltip opens ("Watch · threshold 0.95"). | "The top band: 48 projects, PKR 447.5 million on the DF Recommended basis." · "Health reads Attention Required: schedule performance is just under the 0.95 threshold." |
| 0:36 | **Funnel.** Spotlight steps SU Requested → DF Recommended → Approved (no hover on Approved). | "Below it, the funnel: 948 million requested, 447.5 million recommended by Finance, and 224.4 million approved, on 14 projects that cleared DF, ED and MT approval." |
| 0:52 | **PDD Status.** Tab switches; the pipeline strip draws. | "PDD Status shows where each project waits: 20 still need a PDD, and 12 are with a reviewer." |
| 1:02 | **Payments.** Tab switches; Released and Payments Made light up. | "Payments Status follows the money: 164.6 million released to projects, and 137.1 million paid, as confirmed by Finance." |
| 1:21 | **2 Exceptions · Campus Compare.** Campus page, Compare; two amber cells lit. | "Campus Compare puts the campuses side by side and shades what needs attention: a project past its planned finish at Eastgate, and two projects with no manager at Northbridge." |
| 1:36 | **Project Health.** Delayed card → list of 4 → the story project opens. | "Project Health lists the exceptions: 4 of 12 active projects are delayed. Let's open the Clinical Skills Lab." |
| 1:47 | **3 Accountability · the project page.** PM card, then the Progress and SPI cells. | "Each project has one page, with its manager named: here, Nadia Fairweather." · "Progress is 38 percent and schedule performance 0.76, so it reads Delayed." |
| 2:02 | **Deliverables.** Tab opens: "2 of 8 delivered · from PDD-2027-004". | "Its deliverables come from the approved PDD's cost table: 2 of 8 delivered." |
| 2:10 | **Sample event.** Gold banner "Sample event · Nadia Fairweather, from her own account"; three lines turn green; "5 of 8". | "Now a sample event, as Nadia would do it from her own account: she ticks 3 items that have arrived, and answers our question." · "The tab now reads 5 of 8." |
| 2:28 | **Her reply.** Updates thread opens under the PMO's question of 7 Oct; the unread badge counts down. | "Her answer sits in the project's thread, under our question of 7 October: the simulators clear customs by 30 October, and progress is about 52 percent." |
| 2:43 | **4 Control · % complete.** Projects register → Edit project → % Complete typed 38 → 52 → Save. | "Progress is an official figure. The manager reports it; the PMO checks it against her update and the items delivered, then records it: 38 to 52." |
| 2:59 | **Risk.** Project shows On Schedule, SPI 1.04; Risks tab → Probability High → Medium; preview turns Medium → Save. | "The project now reads On Schedule." · "With a customs date now given, we lower the chance of a slip from high to medium; the risk drops from High to Medium." |
| 3:19 | **Dashboard follows.** Verdict turns Healthy (chip "was: Attention Required"); Delayed 3 (chip "was 4"). | "The dashboard follows the record: Delayed falls from 4 to 3, and portfolio health now reads Healthy." |
| 3:29 | **Activity Log.** Newest rows lit; the project row expands: "% complete 38 → 52". | "Nothing changes silently. The Activity Log keeps who, when, and the old and new value: % complete, 38 to 52." |
| 3:43 | **5 Intake · PMO Review.** Gold badge (1) → PDD-2027-024 "Needs changes". | "New PDDs are read from the E-PDD portal every five minutes. One is waiting, and the portal has already checked it." |
| 3:56 | **Code checks.** Verdict panel, then the budget row "525,000 above". | "Code checks cover completeness, costs, dates, documents and budget. This PDD is 525 thousand over its DF Recommended amount, so the result is Needs changes." |
| 4:12 | **AI reading.** Panel with chip "Prepared example: no model was called". | "An AI reading adds guidance, here a cost line no quotation covers; in this simulation it is a prepared example. It never changes the result." · "And approving a PDD is not approving the project: DF, ED and MT still decide." |
| 4:27 | **6 Board report.** Board Reports → New report → October (so far) → viewer opens. | "For the Board, New report builds October so far from the same data, and compares it with September." |
| 4:40 | **Tiles.** Approved and Released tiles with "since September", then Needs attention. | "Since September, approved is up 12.8 million and released up 9.3 million. Money released before MT approval is listed under Needs attention, not counted as approved." |
| 4:55 | **Recap.** Back to the Healthy dashboard; four pillar tiles light in turn, each a chapter link; the assistant in its success state. | "That's the portal: the portfolio and its exceptions in view, managers answering on the project's record, official figures changed only by the PMO and logged, proposals checked on arrival, and board reports from the same data." · "Pause, pick a chapter, or explore. Thank you." |
| 5:20 | **Hand-over card:** Restart · Chapters · Explore · Exit. | — |

**Length:** the main run is about 5:20 (measured at ~140 words/min with numbers as a browser voice reads
them, plus action time). Covering the portal's 75 features in 5 minutes is not possible without
shallowness, so the rest lives in **9 optional deep-dive chapters (~14½ min in all)**, each jumpable during
questions: Money (2:10) · Delivery (2:50) · Intake in depth (1:10) · Board reports (1:05) · Past projects
follow-ups (1:25) · Updates and alerts (1:40) · People and access (2:30) · Ask the portal (1:00) · Platform
(0:50). A **short version (~3:45)** can be chosen on the Begin screen: it drops PDD Status, Payments and the
Intake chapter (they move to the deep dives). Full deep-dive narration: Appendix B.

## 4. Feature coverage

89 entries (75 implemented features plus planned and rejected items): **15 demonstrated by an action,
10 introduced, 54 in optional chapters, 2 explore-only, 8 not shown** (sign-in forms and password emails —
never rendered so the browser cannot autofill the real password; web push and PWA install — disabled in the
simulation; the three planned features; rejected ideas). Full map: Appendix A. Planned features (WhatsApp
requests, weekly deliverables check-in, campus map) are not shown; an optional, clearly labelled
"Proposals — not built" card after the recap is off by default.

## 5. Controls and visual treatment

- **Control dock** (bottom-right, auto-hides, clicker and keyboard): Pause/Resume (Space, '.'), Next scene
  (→, PageDown), Previous (←, PageUp), Chapters (C: menu of the 8 main parts and 9 deep dives), Restart (Home,
  confirm), Explore (E), Voice on/off (V), Exit (Esc, confirm). A thin chapter rail shows position.
- **Stage caption:** a lower-third panel (text ≥ 20 px, up to 720 px wide) with the avatar at 72 px beside
  it; it moves to the top when the target sits in the lower third, so it never covers the figure being
  discussed. Lines appear as they are spoken.
- **Spotlight:** the existing cut-out, moving between several targets within a scene.
- **Chapter cards:** a 1.2 s full-veil title ("2 · Exceptions surface themselves") between chapters.
- **Change emphasis:** the portal's own count-up on remount, a gold pulse on the changed figure and a small
  "was 4" chip; "Sample event" and "Prepared example" chips label anything simulated.
- **Persistent badge:** "Simulation · fictional data · nothing is sent", top centre, above everything,
  sized not to cover data; the board report viewer's header reads "Simulation (fictional data)" and every
  report page carries a watermark.
- **Opening and close:** a full-veil greeting that lifts onto the live dashboard; a recap where the four
  pillars light one by one and become chapter links.
- **Room readability:** presets for 1920×1080 at 125% and 1366×768; light or dark chosen on the actual
  screen; demonstrated changes still happen under reduced-motion settings (only the animation is reduced).

## 6. Isolation and sequencing architecture

**Isolation (tested in Chromium, 13 Oct 2026):**

1. `simulation.html` is a separate page in the same deploy. Its **first element is a static
   Content-Security-Policy** (`connect-src 'self'`, `img-src 'self' data: blob:`, `worker-src 'none'`,
   `form-action 'none'`, `base-uri 'self'`). The browser itself refuses any request to Supabase, Gemini,
   Meta or any other host: fetch, XHR, beacons, sockets, external images. (A CSP added later by script, or
   placed in `<body>`, is not enough; tested.)
2. A **classic boot script** runs before any app module (a first-imported module is not enough in the
   production build; tested): it namespaces every storage key (`pmo-sim:`), BroadcastChannel and Web Lock
   name, so the real `pmo_session` is never read or written and the simulation never talks to real portal
   tabs; removes push and passkeys; blocks service-worker registration; installs a running clock that starts
   at the scripted date; overrides `window.open` and intercepts link clicks (CSP does not cover navigations:
   wa.me, tel, mailto, signed file URLs, E-PDD links all get "Not available in the simulation"); strips
   query and hash; then **self-tests** (CSP active, storage wrapped) and **fails closed** with an error page
   if anything is missing.
3. The **same production bundle** is loaded; `main.jsx` sees the simulation flag, skips the service worker
   and loads the simulation chunk (synthetic backend + director + data) before rendering the App with a
   synthetic PMO session. The real app's first load is unchanged apart from that check; simulation code
   stays in its own chunk. (`simulation.html` is produced from the built `index.html` with the CSP and boot
   script added. The experiment used a second Vite entry instead, which also works but reshuffles every
   production chunk once; S1 confirms the bundle-reuse variant first.)
4. The **synthetic backend** answers every Supabase REST, RPC, storage, auth and edge-function call from an
   in-memory store (the REST subset the portal uses; the views it reads, recomputed; the database
   automations it shows, such as the Activity Log rows; stubs for email, push, `ask`, Gemini and E-PDD that
   send nothing). Anything it does not recognise is refused and counted, never answered with empty or real
   data.
5. Same-origin hazards closed: `sw.js` notification clicks must skip the simulation tab (otherwise tapping a
   real push could load the real portal there — a one-line production change, tested on a real phone);
   `404.html` must not send a mistyped `/simulation` address to the real portal; the meeting checklist sets
   Do Not Disturb (OS notifications can show real PDD names).
6. Data: generated from scratch for a fictional set of campuses and people (no production row renamed; a
   privacy scan found no real names, codes or numbers), using the portal's own calculations
   (`reportCalc.js`, the PDD rules, the view formulas) so every page agrees.

**Sequencing:** scenes are data (start checkpoint, beats, ready conditions, narration, transition). Beats:
go to a page/tab/project, wait until ready, spotlight, say, act (click, type, choose, tick — each
idempotent, guarded by the data, e.g. "skip if % complete is already 52"), apply a sample event (keyed, once
only), show a chip. **Ready** means the target is visible, the expected figures are on screen, the
synthetic backend has no request in flight and the figures have stopped animating; there are no fixed
delays except short settles. Checkpoints S0 (seed), S3 (after the PM's sample event), S4 (after the PMO's
edits), S6 (after the October draft) let any chapter start from a known state. **Pause** stops at the next
beat boundary and cancels speech; **Resume** restores the chapter checkpoint and replays that chapter's
current scene, so nothing is submitted twice. **Recovery:** if a scene is not ready within 8 s, restore the
checkpoint and retry once; then a presenter-only "Skipping to the next part" and continue from the next
chapter; Exit always works. **Restart** reloads the seed. **Exit** clears the simulation keys and closes.

**Narration:** prewritten and bound to data; no live AI generation in the presentation (it would add delay,
unpredictable wording and a dependency, for no gain in a scripted meeting). The "Ask the portal" deep dive
uses prepared answers computed from the sample data and says so. Voice is optional, off by default,
browser speech (free; on-device voices only are offline — Chrome's "Google …" and Edge's "Online" voices send the spoken text to Google/Microsoft, see `pmo-simulation-2min.md` §6); voices differ by machine, so the Begin screen offers a test line and the
run is timed with the chosen voice.

## 7. Implementation plan

| Stage | Deliverable | Effort |
|---|---|---|
| S1 Foundations | `simulation.html` + boot script, `main.jsx` simulation branch, synthetic backend core, generator and checks moved from the prototype, sw.js and 404 guards, Simulation button | 2-2.5 days |
| S2 Director | scenes/beats engine, readiness, checkpoints, pause/resume/chapters/restart/explore/exit, recovery, stage caption, chips, badge, control dock, speech | 2 days |
| S3 Main presentation | the 8 parts above, data additions the review asked for (Updates thread, KPI card texts, prepared AI reading, sync runs, recipients, WBS fix), timing ≤ 5:30 | 1.5 days |
| S4 Deep dives | the 9 optional chapters | 2 days |
| S5 Polish | room presets, light/dark, 1366×768, voice tuning, reduced motion | 1 day |
| S6 Proof and backup | automated checks below, 1080p recording of the same run (WebM + MP4), offline kit (the same build served locally), rehearsal checklist | 1 day |

About **9.5-10 working days** in all; **meeting-ready after S1-S3, S5 and S6 (≈ 8 days)**, deep dives can
follow. Order: `/preview/` first for the PMO's review, then production. Affected: new `src/sim/*`
(backend, director, scenes, data), `public/sim-boot.js`, `simulation.source.html`, `build.sh` (one copy
line); small, additive edits to `main.jsx`, `App.jsx` (the Simulation button, ~25 `data-tour` hooks, one
refresh event), `BoardReport.jsx` (simulation header), `ui.jsx` (lift dropdown lists during a presentation),
`public/sw.js`, `public/404.html`. No database, edge-function or schema change.

**Acceptance checks (automated where possible):**

1. One Start press runs the main presentation end to end, 5 times in a row, each within 5:00-5:40, in Chrome
   and Edge at 1920×1080 and 1366×768.
2. Every line is spoken only after its target and figures are on screen (checked on every run).
3. Pause, resume, next, previous, every chapter jump, explore-and-resume, restart and exit each tested;
   no action repeats; restart gives an identical first screen.
4. Isolation: 0 requests leave the page across the whole run and every page (CSP violations and network
   log), 0 unrecognised backend calls, 0 console errors; the real session in another tab is untouched before
   and after; self-tests fail closed when the CSP or storage wrap is removed.
5. Coverage map: every feature accounted for; each "demonstrated" scene verified by its ready condition.
6. Data: the 37 reconciliation checks pass; the privacy scan finds nothing real.
7. The backup video plays on the presenting laptop; the offline kit runs with Wi-Fi off.
8. Rehearsed on the meeting room's screen with the chosen browser, voice and clicker; the PMO signs off the
   wording.

## 8. Decisions needed

1. **Meeting date and length:** confirms the 5:20 main run (or the 3:45 short version) and whether the deep
   dives must be ready for the meeting.
2. **Branding around fictional data:** keep the Riphah PMO look (logo, sidebar) with clearly fictional
   campuses and people, the badge and a "Simulation" board report header (recommended), or neutral branding.
3. **Voice:** captions only by default with optional voice (recommended), or voice on by default.
4. **"Proposals — not built" card** after the recap (WhatsApp requests, weekly check-in, campus map): off
   (recommended) or on.
5. **The production issues found** (below): fix now, separately, or leave.

## Found along the way (live portal, each needs its own approval)

1. The Approved Projects card's hover text says "Budget actually released to projects sanctioned for
   execution — N of M" (`theme.js:470`), contradicting the Approved rule; Budgeted / Non-Budgeted are similar.
2. The PDD Status note "N have been approved" counts stage approved only, not closed (`App.jsx` ~2004).
3. Opening an Updates thread marks it read with a PATCH that `log_activity` records as "Update edited … by
   PMO", so the Activity Log shows the PMO editing PMs' posts (`is_read_by_pmo` not in the ignore list).
4. The guest tour's hover demos use `mouseenter`, which React 18 ignores (`TourGuide.jsx:427`).
5. Tour steps can re-run on any App re-render (`tourNav` is rebuilt each render; 2 of 135 step groups in
   `tour_events` repeated).
6. Settings hold SPI/CPI thresholds of 1 while the cards say "SPI < 0.95".
7. The service worker's notification click can take over any portal tab, including `/preview/`.
8. Dropdowns opened during a tour render under the dimming (list z-index below the spotlight).

## Prototype

`docs/plans/pmo-simulation/prototype/gen.mjs` generates the fictional dataset (`summary.json` holds every
quotable figure; `seed.json` is regenerated by running it). `reportCalc.mjs` and `review.mjs` are build-time
copies of `src/reportCalc.js` and `supabase/functions/epdd-sync/review.ts`; the real build will import the
originals. Values (extended 14 Oct 2026, 81 checks): 48 CAPEX + 3 investment projects, DF PKR 447,470,000, 8 campuses, 13 users, clock
Thu 15 Oct 2026 10:30 PKT; story project "Clinical Skills Lab Upgrade" (Hillview, PM Nadia Fairweather).

## Appendix A: feature coverage map

Every implemented feature from the 13 Oct inventory, plus planned/rejected items. 'Where' names the scene (main run: open, 1.1-6.2, close; deep dives: m.* Money, d.* Delivery, i.* Intake, b.* Board, p.* Past projects, u.* Updates and alerts, a.* People and access, q.* Ask the portal, x.* Platform).

| Feature | How | Where | Note |
|---|---|---|---|
| Sign-in: password and remember me | Not shown | none | The sim boots with a synthetic session. The real sign-in form is never rendered, so the browser cannot autofill the PMO's real password. |
| Forgot, invite and set password flows | Not shown | none | These need email links and auth endpoints. The invitation choice is mentioned in a.2 only. |
| Passkeys | Introduced | a.8 (optional) | Highlighted only. PublicKeyCredential is removed in the sim, so no WebAuthn ceremony runs. |
| Change password | Optional chapter | a.8, a.10 | Highlighted; nothing is saved. |
| Role-based navigation (PM: Projects, Updates, Gallery, Team, plus Past Projects and Board Reports when applicable) | Optional chapter | a.4 (guest), a.6 (PM) | Needs a sim remount with a guest or PM synthetic session. |
| Dashboard hero: health verdict, CPI/SPI, Total CAPEX | Demonstrated (action) | 1.1, 4.3 |  |
| SU Requested card and proposals list | Introduced | 1.2 (card); list opened in m.1 |  |
| DF Recommended live card | Introduced | 1.2; m.2 |  |
| Approved / Budgeted / Non-Budgeted cards | Introduced | 1.2 (Approved); m.3 |  |
| Carry Forward card and list | Optional chapter | m.4 |  |
| PCDs Received card | Optional chapter | m.5 |  |
| PMO-editable KPI cards (pencil, Live) | Optional chapter | m.2 | Hover and pencil only; no save. |
| Portfolio breakdown | Optional chapter | m.5 |  |
| PDD Status tab and approvals pipeline | Demonstrated (action) | 1.3 |  |
| Project Health tab with card click lists | Demonstrated (action) | 2.2, 4.3 |  |
| CPI/SPI scatter | Optional chapter | d.9 |  |
| Payments Status tab (incl. 'Where the money is' flow) | Demonstrated (action) | 1.4; m.7 |  |
| Investments tab | Optional chapter | m.6 |  |
| Top-10 charts (DF Recommended, Payments Pending) | Optional chapter | m.5, m.7 |  |
| Projects register filters | Optional chapter | d.1 |  |
| Export to Excel (register) | Optional chapter | d.1 | Button highlighted, not clicked, so no file lands on the presenter's computer. |
| Create / edit / delete project | Demonstrated (action) | 4.1 (edit); d.2 (create highlighted) | Delete is not shown because it is destructive. It stays available in explore mode against the sim store. |
| Excel import replacing the register | Optional chapter | d.2 | Highlighted only, never run. |
| Snapshot restore | Optional chapter | d.2 | Narrated only. It appears on import rows in the Activity Log; seed one import row if it should be visible. |
| Project detail header and performance strip (DF, approved, released, progress, CPI, SPI, EAC) | Demonstrated (action) | 3.1, 4.2 | The story project's CPI and EAC are deliberately not narrated. |
| PM card with tel and wa.me | Introduced | 3.1 | The links are never clicked; the boot click guard blocks them. |
| RACI card | Optional chapter | d.3 |  |
| Financials and Timeline tabs | Optional chapter | d.4 |  |
| WBS with Excel template and import | Optional chapter | d.5 |  |
| Deliverables tab from PDD lines, with ticks | Demonstrated (action) | 3.2, 3.3; d.13 (Compare effect) |  |
| Documents | Optional chapter | d.6 | Files are never opened (signed URLs). |
| Site Visit gallery | Optional chapter | d.6 | Generated images only. |
| Risks tab (project) | Demonstrated (action) | 4.2 |  |
| Lessons/Benefits | Optional chapter | d.7 |  |
| Discussion jump | Demonstrated (action) | 3.4 |  |
| Campus Sites view | Optional chapter | d.12 |  |
| Bulk-assign PM | Optional chapter | d.12 | The dialog opens and is cancelled. |
| Campus Compare (all campuses) | Demonstrated (action) | 2.1; d.13 |  |
| Compare head-to-head and Excel download | Optional chapter | d.13 | The download is highlighted, not clicked. |
| Performance earned-value table | Optional chapter | d.8 |  |
| Risk Register with 3x3 matrix | Optional chapter | d.10 |  |
| Cashflows: monthly plan, PMDC separate, investments, live CAPEX tile | Optional chapter | m.8, m.9 |  |
| Portfolio Timeline | Optional chapter | d.11 |  |
| Past Projects cards and age chips | Optional chapter | p.1, p.2 |  |
| Past project follow-up chats (per project and per manager) with email and push | Optional chapter | p.3, p.4 | The post is shown. Email and push are narrated as live behaviour; nothing is sent. |
| Past Projects edit, import and download sheet | Optional chapter | p.6 | Highlighted only. |
| Past-project viewers | Optional chapter | p.5 | The sample data has one viewer (Sana Whitcombe), so the narration does not say 'two'. |
| PMO Review E-PDD intake list and detail tabs | Demonstrated (action) | 5.1, 5.2; i.1, i.2 |  |
| Automatic code checks (Ready / Needs changes) | Demonstrated (action) | 5.2 |  |
| AI reading, guidance only | Introduced | 5.3 | A hand-written seed row; no model is called. |
| Link or create a CAPEX project from a PDD | Optional chapter | i.3 | The prefilled form opens and is cancelled. The campus shows as unmatched because CAMPUS_MAP only knows real campus names. |
| New-PDD push and email | Optional chapter | i.4 | Shown through seeded notifications_log rows in the Activity Log feed. |
| Board report: new report built from code, as a draft | Demonstrated (action) | 6.1, 6.2; b.1-b.3 |  |
| Board report publish to recipients with push | Introduced | 6.2 (button); b.4 (dialog opened and cancelled) |  |
| Board report email | Optional chapter | b.4 | Highlighted only. |
| Board report PDF | Introduced | 6.2; b.4 | window.print is stubbed in the sim. |
| Board report sign-in pop-up | Optional chapter | a.4 | Guest session with an unseen recipient row. |
| Updates threads | Demonstrated (action) | 3.4 |  |
| Updates: PMO Inbox, read tracking and badge | Optional chapter | u.1, u.2 |  |
| Updates: email and push on post | Optional chapter | u.3 | Narrated as live behaviour; notify-comment is swallowed in the sim. |
| Manual WhatsApp nudge | Optional chapter | u.4 | Highlighted, never clicked. It is a manual wa.me link, not automation. |
| Gallery (Photo Wall) | Optional chapter | x.4 |  |
| Team & About | Optional chapter | x.4 | Fictional team and contact settings only. |
| User Management: users table, create/invite, assign, deactivate, reset password | Optional chapter | a.1, a.2 | Forms are opened and cancelled; no actions are executed. |
| Welcome email generator | Optional chapter | a.3 | Preview only. Send and Send test are never pressed. |
| Activity Log: every change, old to new | Demonstrated (action) | 4.4 |  |
| Activity Log bursts | Explore only | visible in 4.4 (Nadia's three ticks folded into one row) | Visible but not narrated. |
| Activity Log email and push feed | Optional chapter | i.4 |  |
| Session detail and tour progress | Optional chapter | a.9 | Uses the sessions the sim generates in a.4-a.7. |
| Settings | Optional chapter | a.10 |  |
| AI assistant: answers, Read as line, Listen, avatar | Optional chapter | q.1-q.5; the avatar hosts every scene | Answers are prepared by the shim from the sample data, and the narration says so. |
| Guided tours for Guest and PM | Optional chapter | a.5, a.7 |  |
| PMO deadline pop-up with per-PM email | Optional chapter | u.6 | Needs a remount with the alerts flag. The email is previewed, never sent. |
| PDD-not-submitted pop-ups | Optional chapter | u.7 (narrated) | No sample project qualifies, so nothing pops up. Seed a project starting within 20 days if the PMO wants it on screen. |
| 09:00 digest | Optional chapter | u.7 (info card) | An email outside the UI; not sent in the sim. |
| Web push | Not shown | u.7 (narrated only) | PushManager is removed in the sim so the PMO's real subscription is never touched. |
| Notifications drawer | Optional chapter | u.5 |  |
| Global search (Ctrl+K) | Optional chapter | x.1 |  |
| Light/dark theme | Optional chapter | x.2 |  |
| Mobile layout | Explore only | x.5 | The presenter can narrow the window; autoplay is desktop-only. |
| Installable PWA | Not shown | x.5 (narrated) | The sim registers no service worker and offers no install prompt. |
| Living UI (hover lift, insights, breathing, count-up) | Introduced | 1.1 (SPI tooltip), throughout; x.3 |  |
| Deep links (?review, ?report, ?past, ?pastpm) | Optional chapter | x.5 (narrated) | The sim boot strips the query string and hash. |
| E-PDD sync job | Optional chapter | i.5 | Never run against the real E-PDD portal. |
| Database automations (triggers, views, log_activity, deliverables sync, carry-forward sync) | Introduced | 3.2, 4.1-4.4 (their effects) | Emulated by the shim in the sim. |
| Weekly deliverables check-in (planned) | Not shown | none | Planned and parked (docs/plans/deliverable-checkin.md); not built. |
| Campus map (planned) | Not shown | none | Parked 13 Oct 2026; not built. |
| WhatsApp update requests / automation (planned) | Not shown | none | Planned 13 Oct 2026; not built. Only the manual nudge exists. |
| Offline mode, live activity pulse, 3D constellation (rejected) | Not shown | none | Rejected by the PMO. |

## Appendix B: deep-dive chapters (optional, jump from the chapter menu)

### Deep dive: Money (~128 s)

- **m.1** — The SU Requested card is selected. Below it, the list of SU proposals: 64 rows with Sr, name and amount.  
  *Says:* "Every headline card opens what sits behind it. SU Requested lists the 64 proposals behind its 948.18M."
- **m.2** — The DF Recommended card shows '447.5M · 48 DF Rec Projects'. On hover it lifts and its pencil appears (PMO only).  
  *Says:* "DF Recommended is live: it follows the register, 48 DF Rec Projects. With the pencil, the PMO can publish a typed figure instead, and Live hands it back to the register."
- **m.3** — Budgeted Projects shows 218.3M, '12 of 48 projects'. Non-Budgeted Projects shows 6.2M, '2 of 48 projects'; clicking it lists Admissions Office Refurbishment and Reception Kiosk Installation.  
  *Says:* "Approved money splits into Budgeted, 218.3M on 12 of 48 projects, and Non-Budgeted, 6.2M on 2 of 48."
- **m.4** — Carry Forward shows 83.9M, '24 projects from prior FY'. The CarryForwardList has 24 rows with the statuses Work in Progress, Project Closed, PCD Received, Open With Procurement and Open With Finance,  
  *Says:* "Carry Forward lists Finance's pending payments from earlier years: 83.9M across 24 projects, credits included. The card always equals the list."
- **m.5** — PCDs Received shows 2, '2 of 48 projects'. Further down are the breakdown cards (By organisation, By segment, strategic priority) and 'Top 10 Projects · DF Recommended Budget', led by Clinical Skills  
  *Says:* "PCDs Received counts closed projects: 2. Further down, the breakdown splits the portfolio by organisation, segment and strategic priority, and the top ten by DF Recommended is led by Clinical Skills Lab Upgrade."
- **m.6** — The Investments tab shows Investment Projects 2, and Recommended, Approved and Released each at 107,500,000. Below are cards for Medical Plaza Basement Fit-out and Endowment Property Units.  
  *Says:* "Investments stay outside CAPEX: 2 projects, 107,500,000 recommended, approved and released."
- **m.7** — Payments Status. Payments Pending shows 16.6M, '2 projects awaiting transfer', and opens a list (Admissions Office Refurbishment, Science Labs Fume Hoods). Below are 'Top 10 Projects · Payments Pendin  
  *Says:* "Payments Pending shows 16.6M on 2 projects awaiting transfer. Below, the flow shows what remains at each step: recommended, approved, released and paid."
- **m.8** — Project Cashflows shows these tiles:
- CAPEX total: PKR 447.5M, '48 projects · incl. PMDC'.
- of which PMDC: PKR 59.0M, '13.2% of CAPEX'.
- Released to date and Peak month.
- Investment: PKR 107.5M, '  
  *Says:* "Project Cashflows phases the plan month by month. The CAPEX total is the same live figure, PKR 447.5M. PMDC, PKR 59.0M, is always shown separately, and investment, PKR 107.5M, sits outside CAPEX."
- **m.9** — The campus filter is set to Hillview. The first tile relabels to 'CAPEX total (filtered plan)' and the charts narrow. The filter is then cleared.  
  *Says:* "Filter by campus, and the tile switches to that part of the plan: CAPEX total (filtered plan)."

### Deep dive: Delivery (~168 s)

- **d.1** — The Projects register with 48 CAPEX rows. The campus filter is set to Hillview, leaving 7 rows, and the Export button reads 'Export 7'.  
  *Says:* "The register holds every project, with filters for campus, stage, manager and more. Filtered to Hillview, Export offers exactly what's in view: Export 7."
- **d.2** — The buttons New project, Import and Template are lit in turn.  
  *Says:* "Projects are created and edited here, and the whole register can be reloaded from Excel. Each import keeps a snapshot, restorable from the Activity Log."
- **d.3** — The story project's Overview, with its RACI card: R is Nadia Fairweather, I is the Project Management Office, and A and C are empty.  
  *Says:* "Inside a project, the RACI card names who is responsible, accountable, consulted and informed."
- **d.4** — Financials shows 'Financial Summary (PKR)' and 'EVM Analysis' (Earned Value, Planned Value, Actual Cost). Timeline shows the planned dates against today.  
  *Says:* "Financials sets out the money and the earned-value analysis, and Timeline shows the planned dates against today."
- **d.5** — The WBS shows four phases (Procurement, Site works, Equipment, Commissioning and handover) with rolled-up percentages, 9 tasks owned by Nadia, and the Template and Import buttons.  
  *Says:* "The WBS is where the manager plans the work: 4 phases, each rolling up its tasks' progress, with an Excel template and import."
- **d.6** — Documents lists EPDD_Clinical Skills Lab Upgrade.pdf and the quotations. Site Visit shows 6 generated photos.  
  *Says:* "Documents keeps the PDD and quotations, and Site Visit keeps dated photos from the campus."
- **d.7** — Faculty Lounge Furniture (Closed): the Lessons/Benefits tab shows 'Order furniture samples before the tender' and a benefit (the lounge seats 40, up from 18).  
  *Says:* "Closed projects keep what we learned and what we gained. Here: Order furniture samples before the tender."
- **d.8** — Performance: the earned-value table with BAC, % Done, PV, EV, AC, CPI and SPI per approved project.  
  *Says:* "Performance lines up earned value for every approved project: planned, earned and actual cost, with CPI and SPI."
- **d.9** — On the Project Health tab, 'Cost vs schedule performance' shows '13 plotted'.  
  *Says:* "On Project Health, the scatter plots each reporting project by CPI and SPI, 13 plotted. Top right is on track."
- **d.10** — The Risk Register header reads '18 open · 0 critical · across the portfolio', next to the Risk Matrix. Clicking the cell for High probability and Medium impact (4) filters the list to 4 risks, then 'C  
  *Says:* "The Risk Register shows 18 open risks, 0 critical, on a three-by-three matrix. Click a cell, and the list filters to it: 4 risks of high probability and medium impact."
- **d.11** — Timeline & Schedule: every project's dates on one chart.  
  *Says:* "Timeline and Schedule draws every project's dates on one chart."
- **d.12** — Campus / Sites in the Sites view with Northbridge selected: its cards and project list, and the 'Assign PM' dialog opening, then cancelled.  
  *Says:* "On the Sites view, each campus has its own cards and list, and Assign PM gives one manager several projects at once."
- **d.13** — Compare: Hillview's Deliverables read '6 of 12', with a sim chip 'was 3 of 12', and the cell is greener. Hillview and Northbridge are ticked, and 'Head to head (2)' shows bars on a common scale, the f  
  *Says:* "Back in Compare, Nadia's ticks show: Hillview's deliverables now read 6 of 12. Tick up to three campuses for a head-to-head, and Download as Excel takes the table with you."

### Deep dive: Intake in depth (~67 s)

- **i.1** — PDD details shows the problem, objectives, risks and expert contact. The Cost table has 5 lines: 8 × 245,000 cabinets; 6 × 140,000 wall cases; 14 × 22,500 LED lighting; labelling and mounting 860,000;  
  *Says:* "Every PDD can be read here in full: the problem, objectives and risks, and the cost table line by line, 5 lines making PKR 4,125,000."
- **i.2** — Files lists the slots Deliverables, Business Plan and Quotations. Approval history shows 'Campus Director Approved'.  
  *Says:* "Files lists the attachments by slot, and Approval history shows each decision recorded on the E-PDD portal."
- **i.3** — In the view 'All PDDs', PDD-2027-019 Hospital Laundry Machines (Not Approved, unlinked) is opened. 'Create CAPEX project' opens the New project form, prefilled with the name, type, FY 26-27, cost cent  
  *Says:* "When a PDD has no plan project, Create CAPEX project opens the project form already filled from the PDD. We check it before saving; here, we cancel."
- **i.4** — Activity Log feed entries epdd-push and epdd-email for PDD-2027-024, at 14 Oct 16:35.  
  *Says:* "When this PDD arrived, the PMO received a push notification and an email. The Activity Log shows both."
- **i.5** — PMO Review's health dot and its text, the 'Check now' button, and a sim info card reading 'E-PDD read every 5 minutes'.  
  *Says:* "The portal reads the E-PDD portal every five minutes. Check now runs it on demand, and the dot shows how the last run went."

### Deep dive: Board reports (~63 s)

- **b.1** — The list shows: the October 2026 draft, September 2026 published ('shared with 3, opened by 2'), and Baseline: August 2026.  
  *Says:* "Every report is kept: September, published and shared with 3, opened by 2; the August baseline; and today's October draft, which only the PMO sees until it is published."
- **b.2** — The September report, page 1. Approved: PKR 211.6M, '+5.0M since August'. Released: PKR 155.3M, '+16.2M since August'.  
  *Says:* "September's report compares with August: approved PKR 211.6M, +5.0M since August, and released PKR 155.3M, +16.2M since August."
- **b.3** — Pages 2 to 6: the stage pipeline, funding by month, campuses, risks, PDDs, carry forward and past projects.  
  *Says:* "Its pages go on to stages, funding, campuses, risks, PDDs and past projects, each figure computed by code from the portal's data."
- **b.4** — The October draft opens. Publish… opens the recipients list (Prof. Adeel Marlowe, Rabia Thornton, Kamran Ellery, Sana Whitcombe) and is cancelled. Email report and Save as PDF are lit.  
  *Says:* "Publish asks who should receive it and notifies them. Email report sends it on request. Save as PDF gives an A4 copy; in the simulation it stops short of printing."

### Deep dive: Past projects follow-ups (~85 s)

- **p.1** — The summary cards:
- Still open: 10, '5 open over a year'.
- Approved: PKR 69.6M, 'on open projects'.
- Released: PKR 67.6M, '97% of approved'.
- No progress: 3.
- Not chased: 2, 'over 30 days'.  
  *Says:* "Past Projects keeps earlier years' open projects in view: 10 still open, 5 of them for over a year. PKR 67.6M is released of PKR 69.6M approved."
- **p.2** — Clicking No progress filters to 3 projects (Riverside OPD Waiting Area, Westfield Lab Benches, Hospital Nurse Call System), and the filter is then cleared. The list is grouped by campus, with age chip  
  *Says:* "3 are marked No progress, and 2 have not been chased in over thirty days. Each row shows how long it has been open, coloured by age."
- **p.3** — Riverside OPD Waiting Area's Follow-up thread: the PMO on 22 Sep, Hira Brookes on 23 Sep. A new PMO message is typed and posted.  
  *Says:* "Each project has a follow-up thread with its manager. We ask Hira Brookes for a plan. In the live portal, that post emails her and copies the PMO team; here, nothing is sent."
- **p.4** — In the By PM view, Faisal Stonebridge's chat, including the message of 5 Oct tagged 'Lakeside Playground Fencing'.  
  *Says:* "By PM gives one chat per manager across all their past projects; a message can be tagged to one of them."
- **p.5** — Westfield Lab Benches: Sana Whitcombe's question of 18 Sep, shown in gold.  
  *Says:* "Senior viewers chosen by the PMO can read every thread and ask questions; theirs show in gold."
- **p.6** — Edit project, Import and Download sheet are lit.  
  *Says:* "Edit project, Import and Download sheet keep the list in step with the PMO's spreadsheet."

### Deep dive: Updates and alerts (~97 s)

- **u.1** — The Inbox shows 2 unread threads: Examination Hall Furniture (Zara Kingsley, 12 Oct) and Westfield Sports Complex Floodlights (Maryam Holloway, 13 Oct). The sidebar badge reads 2.  
  *Says:* "Updates is where managers report. Our Inbox shows 2 unread threads."
- **u.2** — Zara's thread opens and the badge reads 1.  
  *Says:* "Opening one marks it read, and the badge counts down: 1 left."
- **u.3** — 'Thanks, Zara. Please confirm the handover date for the remaining furniture.' is typed and posted.  
  *Says:* "We reply in the thread. In the live portal, a PMO post emails the project's manager and sends a push notification; here, nothing is sent."
- **u.4** — 'Nudge on WhatsApp:' with the manager's name link.  
  *Says:* "Nudge on WhatsApp opens a ready message to the manager. It is sent by hand, never automatically."
- **u.5** — The bell (title '1 unread update') opens the drawer with three sections: 'Past planned finish' (Examination Hall Furniture), 'Unread updates' and 'Recent portfolio activity'.  
  *Says:* "The bell gathers what needs us: projects past their planned finish, unread updates and recent activity."
- **u.6** — About 5 s after sign-in, the 'Deadline alert' appears: '2 projects at or near the planned end date · 1 overdue'. It is grouped by manager: Zara Kingsley has Examination Hall Furniture, '5 days overdue  
  *Says:* "At sign-in, the PMO sees every project at or near its planned end, grouped by manager: 2 here, 1 overdue. Email drafts a message to that manager; we preview it, and nothing goes until we press Send."
- **u.7** — A sim info card listing: weekday 09:00 PKT digest to the PMO; push notifications on phones; PDD reminder when a project starts within 20 days without a PDD.  
  *Says:* "Beyond this screen, a weekday nine o'clock digest emails the PMO, phones receive push notifications, and a reminder appears when a project is due to start within twenty days without its PDD. The simulation sends nothing, and no sample project is due."

### Deep dive: People and access (~150 s)

- **a.1** — User Management: 12 fictional users with the roles PMO, project_manager and guest.  
  *Says:* "User Management lists everyone with a role: PMO, project manager or guest. Roles decide what each person sees, and the database enforces it."
- **a.2** — Create user opens a form with an invitation choice, then is cancelled. Assign, Suspend ('Suspend this account — reversible') and reset password are lit.  
  *Says:* "Here we create users and choose whether to send the invitation, assign their projects, suspend an account reversibly, or reset a password."
- **a.3** — Welcome email for Nadia Fairweather: password 'Not included', with a live preview switched between computer and phone.  
  *Says:* "Welcome email builds a personal guide for a manager, with their projects and how to sign in. We preview it on computer and phone, and it goes only when we press Send."
- **a.4** — The guest navigation has no Project Cashflows, PMO Review, Past Projects or admin pages. A pop-up offers the board report for September 2026.  
  *Says:* "Senior management signs in as guests: the whole portfolio, read only. A pop-up offers the board report they haven't opened yet."
- **a.5** — The tour invite card is accepted, the first two guest tour steps play, and the tour is ended with 'Skip tour'.  
  *Says:* "A guided tour, hosted by me, walks guests through the portal. They start it from the invitation or the sidebar."
- **a.6** — The PM's navigation: Projects, Past Projects, Updates, Gallery and Team & About. Projects lists her 7 projects, with no Edit project buttons.  
  *Says:* "A project manager sees only their own projects: 7 for Nadia, plus Updates, Gallery, Team and her past project. There is no Edit project button: official figures stay with the PMO."
- **a.7** — 'Take the tour' plays the first two PM tour steps, then 'Skip tour'.  
  *Says:* "Managers have their own tour, built around their projects and what they can do in them."
- **a.8** — The sidebar account tools (password, notifications, passkey), shown disabled with the label 'Off in simulation'.  
  *Says:* "Each person changes their password and turns on notifications or a passkey from the sidebar. The simulation keeps these switched off."
- **a.9** — Activity Log login rows open the session detail (pages visited), and a tour row opens 'how far they got'.  
  *Says:* "Back as the PMO, the Activity Log opens each sign-in's session, and shows how far each person got in their tour."
- **a.10** — Settings: Security (New Password, Confirm New Password) and Portfolio Configuration (CPI Threshold, SPI Threshold).  
  *Says:* "Settings holds the CPI and SPI thresholds, and the PMO's own password."

### Deep dive: Ask the portal (~60 s)

- **q.1** — The launcher opens AskPanel with fictional starter chips. The avatar is listening.  
  *Says:* "You can also ask me, in plain words. In this simulation my answers are prepared from the sample data; in the live portal they are computed from the database."
- **q.2** — 'Which projects are delayed?' gets an answer beginning 'Read as: approved CAPEX projects behind schedule.' and a table of 3: Accreditation Upgrade: ICU Monitors, Hostel Block C Washroom Renovation and  
  *Says:* "Each answer starts with how I read the question, so a misreading shows at once. 3 projects are delayed, and the list comes straight from the data."
- **q.3** — Listen is pressed, the answer is read aloud, and the avatar is speaking.  
  *Says:* "Listen reads the answer aloud."
- **q.4** — 'Where do we stand overall?' gets the headline: 48 projects, PKR 447,470,000 on DF Recommended, 14 approved (PKR 224,410,000), PKR 164,570,000 released. The avatar shows success.  
  *Says:* "Asked where we stand, I give the dashboard's figures: 48 projects, PKR 447,470,000 on DF Recommended, 14 approved."
- **q.5** — The panel stays open.  
  *Says:* "A project manager's answers cover only their own projects, and say so."

### Deep dive: Platform (~51 s)

- **x.1** — Ctrl+K opens the search ('Search projects by name, ID, organisation, segment, stage…'). 'Solar' finds Solar Rooftop Phase 2, which opens.  
  *Says:* "Ctrl+K searches every project by name, ID, organisation or stage, from any page."
- **x.2** — The portal switches to dark mode, then back.  
  *Says:* "Light or dark, with one click."
- **x.3** — A KPI card lifts with a sheen and an insight tooltip, and the hero's cursor light follows the pointer.  
  *Says:* "Cards respond as you move across them, and explain each figure on hover."
- **x.4** — The Gallery shows generated site photos, and Team & About shows the fictional PMO team and contact details.  
  *Says:* "Gallery collects site photos across projects, and Team and About introduces the PMO and how to reach us."
- **x.5** — A sim info card: 'Phone layout below tablet width · installable app · links open the exact page'.  
  *Says:* "Narrow this window and the portal switches to its phone layout. On phones it installs like an app, and links in our emails open the exact page they mention."

