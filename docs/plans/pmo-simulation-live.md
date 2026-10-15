# PMO Simulation on live portal data (150 s): plan for discussion

Status: **plan only, 15 Oct 2026. Nothing built and nothing in the database changed.** It replaces the
fictional-data design in `pmo-simulation-2min.md` once the PMO agrees. The fictional build stays on
/preview/ until then.

This repository is public, so this file names people by role only. The private notes in the session
scratchpad have names. All figures below are live values from 15 Oct 2026, read between 10:30 and
19:35 PKT. At launch, every figure is a slot filled from that moment's data.

## The requirement (PMO, 15 Oct 2026)

- When the PMO presses Simulation, the run uses the portal's **current real data**. Fictional data
  is not used anywhere, not even as a fallback.
- The firm limit is **150 s** (2:30). It replaces the 2-minute limit.
- The assistant stays the presenter. Pause, resume, restart, chapters and exit stay.
- A deliberate opening of about **8-12 s**, and a brief closing.
- The run covers 16 portal areas plus Documents and WBS inside one project. Every narrated figure
  matches the screen.
- Nothing real is changed or sent.
- Weak data is explained honestly, never hidden.

## How this was assessed

Two workflows, read-only throughout.
- **First workflow:**
  - a code map of the current simulation;
  - a request and write inventory for every toured screen;
  - four live-data assessments that combined code reading with SQL and PMO-token GETs;
  - a visual pass on production as the PMO at 1920×1080 and 1366×768.
- **Second workflow:**
  - three independent storyboards (management story, efficiency, robustness);
  - an architecture spec;
  - a judge that combined the storyboards;
  - four adversarial checks (timing, accuracy, read-only safety, management quality);
  - a final fixing pass.

The headline facts were then checked again by SQL, and the timing was recomputed by script.

**What reached production during the assessment:**
- The visual pass signed in as the PMO 5 times. That updates the sign-in time and creates refresh
  tokens.
- Every other write was blocked in the browser, including the session-start tracking call. A later
  SQL check found no new `activity_log`, `user_sessions` or `comment_reads` rows.

---

## 1. The current simulation, and what has to change

**How it works today:**
- The PMO's tab hands names and Gallery media to `simulation.html` over a one-time BroadcastChannel.
- That tab has no token. Its CSP allows only itself.
- A synthetic backend (`src/sim/backend.js`) answers every portal request from `seed.json`, which
  holds 53 fictional projects with precomputed view rows.
- The clock is pinned to 15 Oct 2026 10:30 PKT.
- `narration.json` and the readiness checks in `scenes.js` hold fictional figures, such as "473.7M",
  "5 projects" and "Showing 2 projects".
- Names enter through pins and tokens.
- A "Run with sample names" mode runs fully fictional.

**Keep:** the isolation (no token, CSP, guards, fail-closed boot), the director (overlay, captions,
speech, governor, controls, Begin screen, closing card), the BroadcastChannel hand-over, media
re-encoding, and the privacy scan of committed files.

**Replace or remove:**

| Area | Today | Change |
|---|---|---|
| Data | `seed.json` + `gen.mjs`, 81 fictional reconciliation checks | A read-only snapshot taken at launch under the PMO's token. Delete the seed, generator, fictional files, sample cast/media and sample mode |
| Views | Precomputed by the generator | Real view rows as the database returned them at launch; recorded GET responses replayed for exact order |
| Clock | Pinned to 15 Oct 10:30 | Real time. A snapshot older than 60 min, or from another day, is refused |
| Narration | Fixed fictional lines | Templates filled at launch with the screens' own formatters; every scene has prepared variants and a figure-free line |
| Readiness checks | Hard-coded fictional texts | Expected texts generated from the snapshot; a silent rehearsal checks every figure on screen before Start |
| Names | Pins, cast slots, tokens, story-PM rules | Not needed: everything is real. Only the campus respellings for speech stay |
| Writes in the run | Kept in memory and shown (badges count down) | Refused, except read markers held in memory and discarded. An apparent success on real data would mislead |
| Labels | "fictional projects and figures" on the badge, title, prints and launcher | Reworded (decision 6) |
| Engine limits | 120 / 116 / 119.5 s | 150 / 146 / 149.5 s; dock "/ 2:30" |
| Story | A fictional Al-Mizan project and the consenting story PM's fictional delay | A real project chosen by rule. The story PM's consent is no longer needed: nothing fictional is attributed to anyone |

---

## 2. Live data: recommended approach

**Take one snapshot when Start is pressed, freeze it for the run, and do not refresh during
playback.**

1. **Reading.** The launcher reads a fixed list of tables with explicit columns under the PMO's own
   token. Row-level security therefore decides what is read, exactly as on the PMO's screens. It also
   records the exact GET responses the toured screens make, about 55 templates, so ordering, embeds
   and view values replay exactly as production.
   - Measured on 15 Oct: about 1.8 MB of JSON, read in 2-4 s.
   - Media: the 79 site-visit items (59 MB) are fetched while the launcher is open. Images are
     re-encoded, which strips location data.
2. **Checking before sending.** Consistency checks run in the portal tab: projects equal metrics,
   DF sum equals `total_capex`, released sum equals `budget_consumed`, and counts match. A
   fingerprint is computed, and only then is anything sent.
3. **Isolation.** The simulation tab validates the hand-over against an allow-list of tables,
   columns, types and size caps, and scans it for anything that looks like a token or signed URL.
   It never has a token and cannot reach production.

**Why not refresh during playback:**
- The narration is generated from the snapshot. Live polling could change a figure between the
  sentence and the screen.
- Every screen is served from memory, so there are no loading waits and the 150 s timing holds.
- Polling would need a token in the simulation tab, which removes the main read-only guarantee.

**Changes made during the demonstration:**
- They are not shown, and the badge says so: "portal data as of 10:41 PKT".
- **Refresh data** on the Begin screen and the closing card asks the still-open portal tab for a new
  snapshot. The rehearsal then runs again.
- Restart and Chapters reuse the same snapshot.
- From 15 minutes old the Begin screen shows an amber notice. Over 60 minutes, or on another day,
  Start is refused until Refresh.

**Nothing stale between runs:**
- Data and blobs live only in memory.
- In the simulation tab, browser storage becomes in-memory, and leftover keys from the fictional
  build are deleted.
- The launcher no longer writes local storage.
- Every launch reads afresh (`cache: no-store`).

**Permissions:**
- The button is PMO-only, and the launcher checks the role.
- The snapshot is exactly what the PMO's own session can read.
- Never sent: `settings.welcome_email` (it holds the standard password), any settings key outside 7
  named ones, notification logs, sessions, passkeys, push subscriptions, E-PDD raw data, or the
  activity log beyond its newest timestamp.

**Scope:**
- FY 2026-27 CAPEX on the DF Recommended basis, all campuses, no filters except those a scene applies
  and names.
- Investment projects appear only on the Investments tab.
- Past Projects covers earlier fiscal years.
- The Monthly Report shows its own "as at" date in the caption kicker.

**Consistency rules** for every line:
- Each figure is quoted only on the screen that shows it, in that screen's words.
- "Approved" is quoted only where it means approved or closed (33). The PDD Status card's 30 is never
  spoken.
- Share released is said as 36 percent of the 691.5M Capex total; Cashflows' 36.8% of the phased
  plan is never said.
- The risk count comes from the Risk Register header (34).

**Loading, empty and failure handling:**
- Each figure check waits up to 5 s. The rehearsal swaps in the scene's next variant whose figures
  are on screen, then its figure-free line.
- A scene that cannot be shown truthfully is left out and listed on the Begin screen before Start.
- If the opening or the dashboard fails, Start stays disabled with the reason.
- There is never a fictional run.

---

## 3. Opening and closing

**Opening, 11.8 s at 135 wpm (10.7 s at 150).**

| Line | Caption (spoken form in brackets) | Words | Time |
|---|---|---|---|
| O1 | The Riphah PMO Portal follows capital projects, from proposal to handover. ("P M O") | 13 | 6.08 s |
| O2 | We'll see current portal data: money, projects, sites, people, reports. Money first. | 12 | 5.63 s |

**On screen:**

| Time | What happens |
|---|---|
| 0.0-0.6 s | Start fades the Begin screen. The Begin screen's own card, with the navy-glass assistant and "Riphah PMO Portal", shrinks to a compact presenter card over the live Capex Dashboard, which is already loaded. The card reads "FY 2026-27 capital projects · portal data as of {HH:MM} PKT". There is no title animation. |
| 0.3-6.1 s (O1) | The assistant speaks at presenter size beside the card. The dashboard behind is lightly dimmed. |
| 6.1 s | The card folds into the caption dock in the sidebar column (0.5 s, the existing dock motion). |
| O2 | Light rings touch each area as it is named: the as-of time ("current"), Capex Dashboard and Cashflows ("money"), Projects, Campus / Sites, User Management ("people"; skipped if off-screen at 768 px) and Monthly Report ("reports"). On "Money first" the light settles on the Total CAPEX figure, and scene 1 continues on the same screen. |

The "Healthy" verdict and the CPI/SPI values are never inside the light. "Handover" matches the
portal's own Closed-stage legend, "Completed & handed over".

**Closing, 4.3 s:** "From proposal to handover, one shared record. Thank you."
- It ties back to the opening and names what connects every screen, without retelling the tour.
- It fades to the closing card: the assistant in its success state, "Portal data as of {HH:MM} PKT",
  the six chapter buttons, Restart, Refresh data and Exit.
- If a report was published, the line becomes "From proposal to board report, one shared record.
  Thank you."

---

## 4. Timed storyboard (290 spoken words; 140.5 s at 135 wpm, 134.7 s at 150)

**Timing model:** line = 0.3 s + words × 60 / wpm. A scene takes the longer of its lines or its
minimum on-screen holds (render, readability, comparison holds).

**Running time against the 150 s limit:** 9.5 s is left in hand at 135 wpm. The governor switches to
prepared short lines at 146 s, and the hard cut to the closing card is at 149.5 s. Engine-faithful
runs from 100 to 150 wpm, with Test voice teaching the rate, end between 134 and 145 s; none reaches
the cut.

**Chapter starts** are computed at launch. Today, at 135 wpm: Portfolio 0:00 · Inside a project
0:43 · Delivery 0:59 · Sites and people 1:18 · Follow-up 1:44 · Reporting and team 2:04 · end 2:20.

| # | Screen | Live data / selection (today) | Caption | Automatic action → visible result | s | Ends |
|---|---|---|---|---|---|---|
| O | Begin card → Capex Dashboard | Snapshot time | Opening above | Presenter card, then the dock; rings on the sidebar | 11.77 | 11.77 |
| 1 | Capex Dashboard › CAPEX Overview | Total CAPEX PKR 691.5M · 109 projects; DF card 691.5M (live); hint lines "7 of 109 projects" | Total Capex: 691.5 million rupees, 109 projects; health scores cover only 7. | Light the hero total → hover DF Recommended (tooltip "recommended after Director Finance review") → at "health", light only the two "7 of 109" hint lines | 8.30 | 20.07 |
| 2 | › Investments tab | 2 projects; requested = recommended = approved = released = 190,571,528 | Investments sit apart: 2 projects, released in full. | Click the tab → banner, tiles and "Investment Register (2)" lit with the unchanged Capex hero | 3.86 | 23.93 |
| 3 | › PDD Status tab | 63 / 0 / DF 6 / ED 7 / MT 0 / Approved 30 / Closed 3 | PDD Status: 63 await submission; 7 are with the Executive Director. | Cards and strip lit → at "await", click ED Review → "PDD Status — ED Review · 7 projects" list | 6.08 | 30.00 |
| 4 | › Payments Status tab | Released 249.1M · 36.0% · 32 projects; Paid 1.0M (1 project); Pending 0 | Payments Status: released, 249.1 million, 36 percent; payments entered for one project only. | Budget Released card lit → "Where the money is" flow, Paid row included. Remaining CAPEX is never lit | 7.86 | 37.86 |
| 5 | Project Cashflows | Peak Nov 26 PKR 106.9M (CAPEX 75.8M + PMDC 31.1M) | Cashflows: the monthly plan peaks in November, 106.9 million. | Open the page → monthly chart and Peak Month tile lit → hover the Nov 26 bar. The cumulative card stays dimmed | 6.08 | 43.94 |
| 6 | Projects | 109 of 109 → type "QIE" → 2 of 109 | Projects: let's follow one that reports progress, the QIE renovation. | Search typed live → QIE row lit → opened → Documents tab selected at once | 5.63 | 49.57 |
| 7 | Project › Documents | QIE renovation (IT.261297-04): Attachments (2), PDD + PCR; Approved, released 19,598,405, 90.0%, On Schedule | Documents holds its PDD. Approved, fully released, 90 percent done. | Cards lit, the PDD card hovered → Approved badge, Released and Progress lit. Files never opened | 5.63 | 55.20 |
| 8 | Project › WBS | 0 tasks ("No tasks yet."); 1 task portal-wide | Its work breakdown: not yet started, as almost everywhere. | Click WBS → header and empty state lit. If a real WBS is entered first: "Its work breakdown: {n} tasks so far." | 4.30 | 59.50 |
| 9 | Timeline & Schedule | 108 scheduled; red = overdue OR PDD Not Submitted (shared colour); Lahore 5 bars; QIE card "Planned 1 Jul 2026 → 30 Dec 2026 · Progress 90%" | Timeline: red means overdue, or PDD not submitted; QIE, due 30 December. | Default view lit at least 3.5 s → campus filter Lahore → hover the QIE bar → card lit | 7.41 | 66.92 |
| 10 | Performance | QIE 90.0% On Schedule; chip Delayed (25), 24 of them without % complete | Performance: QIE is on schedule; most "Delayed" lack progress entries. | QIE row lit → Delayed chip and the "—" % Done cells lit, never clicked. Strip never lit | 5.63 | 72.55 |
| 11 | Risk Register | 34 open · 0 critical; medium probability × high impact 26 | Risk Register: 34 open, none rated critical; 26 medium probability, high impact. | Matrix lit → click that cell → "26 of 35" and one approved top row lit. Never scrolled | 5.63 | 78.18 |
| 12 | Campus / Sites › Compare | 11 campuses · 109 · 691.5M · 33 approved · 249.1M; trio G-7 / Al-Mizan / I-14; G-7 32.6M approved and released; I-14 3.4M, 4%, 17 of 23 awaiting a PDD | (a) Campus Compare puts all 11 campuses side by side; we pick 3. (b) Head to head, G-7 leads in rupees, I-14 trails on releases; each site lists its managers. | (a) Table lit → untick PRH, tick Al-Mizan, tick I-14 → Head to head (3). (b) Approved and Released rows lit (leaders on screen 6.1 s) → I-14's Released and PDD rows ringed → the three Project managers blocks lit | 14.06 | 92.24 |
| 13 | Compare › Open I-14 → Sites → Assign PM | Preview "2 projects will be assigned / 19 left alone — already has a PM / 2 skipped — closed" | On I-14, Assign PM previews first: 2 to assign, 19 left alone. | Open I-14 → Assign PM → preview lines ringed with no PM chosen → Cancel. Nothing written | 6.92 | 99.16 |
| 14 | User Management | 26 users incl. test accounts; one PM row (the GGC PM, 13 projects) | User Management: 26 users, some for testing; {PM} manages 13 projects. | Header lit → Role and Assigned Projects columns lit → one PM row. Contact columns masked (decision 2) | 5.63 | 104.80 |
| 15 | Updates › All Projects → thread | 7 comments on 4 projects; default thread = newest PM status note (today the G-7 exam-office upgrade, IT. 271197-04) | Updates: one thread per project; here, a manager's status note. | All Projects tab → thread opened → PM bubble lit. Read markers stay in memory | 5.40 | 110.20 |
| 16 | Past Projects → one project | Still open 53 · Approved 514.0M · Released 445.4M (87%) · No progress 3; thread on the GGC animal-house project (IT.261126-01), 6 messages | Past Projects, from earlier years: 53 open, 3 without progress; here, the manager replies. | Cards lit → No progress ringed → search "Animal" → project opened → follow-up thread lit | 7.80 | 118.00 |
| 17 | Gallery | 79 photos and videos; Campus = Malakand → 20 of 79 | The Gallery: 79 photos and videos from site visits; here, the Malakand relocation. | Campus filter Malakand → grid lit about 4 s → one photo and its caption ringed. No lightbox | 6.08 | 124.08 |
| 18 | Monthly Report → October draft | 0 published; Oct draft as at 15 Oct; tiles 691.5M / 377.1M (33) / 249.1M 36.0%; Needs attention | Monthly Report: none published yet; October's draft flags what needs attention. | List lit → October row opened (kicker "October 2026 · draft · figures as at …") → tiles 1-3 lit → Needs attention lit about 3 s → Back | 7.40 | 131.48 |
| 19 | Team & About | About, team chart of 6, Contact | Team & About: who we are, how to reach us. | About on arrival → org chart lit 2 s → Contact lit. No names read | 4.74 | 136.22 |
| C | Closing card | | From proposal to handover, one shared record. Thank you. | Fade to the closing card | 4.30 | 140.52 |

The per-scene timing working, ready conditions, short lines and data variants are kept in the
session scratchpad (private). They become `src/sim/live/lines.js` and `scenes.js` in the build.

**Variants worth knowing:**
- **Scene 3** names whichever reviewer stage is largest. If none is, it says "none are with
  reviewers".
- **Scene 4:** the payments clause follows how many projects have payments entered.
- **Scene 9** drops "or PDD not submitted" if that colour changes.
- **Scenes 6-10 (story project):** another project that passes the same tests replaces QIE if QIE
  stops qualifying: CAPEX, approved, released, reporting progress, on schedule, with documents.
- **Scene 12** recomputes the leaders and never names a leader on a tie.
- **Scene 18** opens the newest published report if one exists.

---

## 5. Coverage

| # | Required | Scene | Shown |
|---|---|---|---|
| 1 | CAPEX dashboard | O, 1 | Live dashboard from second 0; Total CAPEX and DF Recommended with tooltip |
| 2 | PDD approval status | 3 | Stage cards and strip; ED Review list |
| 3 | Investment projects | 2 | Separate portfolio banner and register |
| 4 | Payment status | 4 | Budget Released and the DF → Approved → Released → Paid flow |
| 5 | Projects list | 6 | Live search, open a project |
| 6 | Performance | 10 | Story row; "Delayed" explained |
| 7 | Risks | 11 | Header, matrix cell → filtered register |
| 8 | Campus / Site with Compare | 12, 13 | All campuses → ticks → Head to head; Open → Sites view |
| 9 | Cashflows | 5 | Monthly profile, peak month hover |
| 10 | Timeline & Schedule | 9 | Default view with the colour rule; filter; hover card |
| 11 | Updates | 15 | All Projects → one thread |
| 12 | Past Projects | 16 | Cards, No progress, one follow-up thread |
| 13 | Gallery | 17 | Campus filter, grid |
| 14 | Users, site-wise PMs, functionality | 12, 13, 14 | Per-site manager blocks; Assign PM preview and Cancel; User Management roles and assignments |
| 15 | Board Reports (the **Monthly Report** tab) | 18 | List, October report, Needs attention |
| 16 | Team & About | 19 | About, team chart, contact |
| 17 | Documents (one project) | 7 | Story project's documents |
| 18 | WBS (one project) | 8 | Story project's work breakdown |

**Not toured:** PMO Review, Activity Log, Settings, the assistant chat, Deliverables,
Lessons/Benefits, and the phone layout.

---

## 6. Where the live data is weak

**Kind:** data gap, sparse, stale, inconsistent, filter, loading, or real (an unfavourable result).

| Scene | Verified condition (kind) | Evidence | Effect | Recommended action | When |
|---|---|---|---|---|---|
| Dashboard health | "Healthy", CPI 10.208, SPI 3.689 (formula artefact on sparse data) | The view divides earned value counted on 3 projects with no actual cost (Ferozpur, Malakand, QIE; 116.9M EV in all) by the actual cost of 4 projects (11.4M). Only 7 of 109 projects report % complete | The first screen claims health a finance audience will doubt | Never quote it. Light the "7 of 109" hints. Finance/PMO enter actual cost and check Ferozpur 97% (nothing released) and Malakand (actual start after planned end). Fix the view formula later (schema change) | Before (data); the caveat works as is |
| Dashboard cards | Two stale typed texts (stale) | Approved hover "4 of 106" under "33 of 109"; Remaining CAPEX sub "95.8% awaiting approval" (live 45.5%) | Visible contradiction | PMO fixes both with the card pencil; the run never lights them; the Begin screen lists them until fixed | Before |
| PDD Status | 63 of 109 not submitted; PDD Submitted and MT Review 0; 5 of the 63 already have E-PDD PDDs (real + data check) | `portfolio_dashboard`; E-PDD links | A true backlog; empty stages if clicked | Say 63 first; click the largest reviewer stage; PMO checks the 5 stages | Present honestly |
| Investments | 2 projects, every figure 190,571,528, full rupees (sparse) | `investment_metrics` | Little to compare | One line, no amount | As is |
| Payment status | Paid 1.0M on 1 project; Pending 0; "Nothing recorded yet" panel (data gap) | `payments_made` > 0 on 1 of 109 | Reads as non-payment | Line: "payments entered for one project only". Finance figures can be entered (bulk change: preview, backup, per-item confirmation) | Either |
| Cashflows | Plan from the 15 Sep import: 676.2M phased of 691.5M; 10 newer projects unphased; 5 PMDC rows tagged to the wrong campus; two "cumulative release" charts (36.0% vs 36.8%) (stale, inconsistent) | `project_cashflows` created 15 Sep 06:37 UTC | Fine if only the peak month is quoted | Quote the peak only; keep the cumulative card dimmed; optional re-import | As is |
| Projects | 109 complete rows; 75 without an ID (pre-approval); 4 codes with a stray space (data) | SQL | Shows only if scrolled | No scroll | As is |
| Story project (QIE) | Strong: approved, fully released, 90%, on schedule. Budget "Not Started" (no actual cost); 12 unconfirmed charter drafts of 79.6M against 19.6M (data gaps) | SQL | Weak fields sit on the same page | Light only the good fields; never open Deliverables | As is |
| Documents | 94 documents on 46 projects; at most 3 per CAPEX project; QIE has 2 (sparse) | SQL | Modest visual | Say "its PDD"; never expand "PCR" | As is |
| **WBS** | **1 task in the whole portal (added today by a PM); past-project WBS 0** (data gap) | `project_tasks` = 1 | Empty panel in a required item | Honest line, or the project manager enters QIE's real breakdown (decision 1) | **Decision** |
| Timeline | 108 of 109 scheduled; about 3 in 4 bars red, because red means overdue **or** stage PDD Not Submitted (one shared colour) (real + design) | `Timeline.jsx:226`, `theme.js:412`; 75-78 bars red today depending on the hour (bars ending today turn red at midnight) | Red-heavy default; two meanings in one colour | The line states the rule over the default view for at least 3.5 s, then Lahore + QIE. Give PDD Not Submitted its own colour after the meeting | As is |
| Performance | 35 rows include 2 investment; 27 rows show "—" for % done; Delayed (25), 24 of them with no progress entered; strip CPI 0.454 (data gap + inconsistent) | `project_metrics` | Alarming numbers that measure missing entries | Explain "most Delayed lack progress entries"; never click Delayed; PMs enter % complete | Either |
| Risks | 35 risks, 34 open, 0 critical, 26 in one cell, none added since 15 Sep; 5 generic 27 Aug rows look like samples; 2 open risks on closed projects (stale) | SQL | Good scene; the sample-like rows sit below the fold | PMO confirms or closes the 7 | Before (or as is) |
| Compare | 11 campuses, complete; 1-3-project sites top any share ranking; "Released" sorts by share but prints rupees (filter/design) | Replicated from the PMO's reads | A ranking click misleads | Trio G-7 / Al-Mizan / I-14 (74 of 109 projects, 296.9M); no ranking click | As is |
| Site PMs / Assign PM | Real PM blocks; 9 CAPEX projects without a PM (CS 4, Hostels 3, I-14 2); the Assign PM dropdown lists a test account (data) | SQL | Fine with care | I-14 preview, no dropdown, Cancel | As is |
| Users | 26 users, test accounts active (pmaudittest, Claude, Guest); every email and 13 phone numbers on screen (data + privacy) | `user_profiles` | Embarrassing and private on a projector | Mask contacts (decision 2); delete test accounts (decision 3) | Before |
| Updates | 7 comments on 4 projects, 0 replies, 5 posted today, informal; the PMO Inbox empties when read (sparse + filter) | `comments` | Thin channel | All Projects tab; PM status note approved in the launcher; no volume claim | As is |
| Past Projects | 53 open, 124 follow-ups on 50 projects (45 in 7 days); 3 No progress, the same 3 never chased (real) | SQL | Strong | Open a thread where the PM replies; never "still to release" | As is |
| Gallery | 79 items on 8 projects at 5 sites, many are screenshot crops; default order opens on investment media; live thumbnails took about 16 s (loading, not data) | SQL + visual pass | Fine from local blobs with a campus filter | Malakand filter | As is |
| Monthly Report | No published monthly report, 0 recipients; October draft as at 15 Oct; the September draft has a 90.6M corrections line (stale) | `board_reports` | Presents an unfinished state | Publish, or press Refresh figures on the October draft, on the meeting morning; otherwise the line says "none published yet" | Before (recommended) |
| Team & About | Complete; no photos (initials); two office mobiles shown (fine) | Settings | Plain but accurate | Photos optional | As is |
| Small screens | At 1366×768: KPI titles cut, the sidebar needs scrolling, Compare's last column is cut (layout) | Visual pass | Weaker on a laptop panel | Present at 1920×1080 | Laptop set-up |

---

## 7. Keeping real records untouched

**The layers:**
1. **No credentials.** The simulation tab never holds a token. Hand-overs are scanned for anything
   token-like. It never joins the portal's `pmo-session` channel.
2. **The network is closed.** CSP `connect-src 'self'`. Production is unreachable even by mistake.
3. **The backend refuses writes.** Every POST, PATCH or DELETE, every upload and every edge function
   (including `ask` and all email/push functions) returns "Read-only presentation: nothing is
   changed or sent".
   - Only read markers are accepted, in memory, discarded at Exit: opening an Updates or Past
     thread, `comment_reads` / `is_read_by_pmo` / `past_chat_reads`.
   - In production those markers would also have written Activity Log rows.
4. **The director has an allow-list.** It may only use navigation, tabs, filters, Compare ticks and
   view switches, the Projects and Past searches, read-only openings, and Cancel.
   - It refuses any element labelled save, post, send, email, assign to, publish, refresh figures,
     delete, upload, import, export, download, print, edit, deactivate, confirm and so on.
   - It refuses text boxes, the PM dropdown, WhatsApp, mailto and tel links, KPI pencils and the
     Deliverables tab.
5. **The audience can't click.** A shield blocks the mouse, and keys outside the control map are
   swallowed (Enter and Tab never reach a portal control).
6. **No prints or downloads.** Print and Ctrl+P are blocked, and downloads are blocked. A browser-menu
   print carries "live portal data as of HH:MM · not an official report".

**Write demonstrations, done read-only:**
- **Assign PM:** show the preview, then Cancel.
- **Monthly Report:** open and read it; never Publish, Email or Refresh figures.
- **Deliverables ticks, posting and KPI edits:** not shown.
- **Pop-ups:** the deadline pop-up and its Email button never appear, because the simulation has no
  sign-in. No data changes.

**Proof:**
- An automated test inventories every element the director touches and compares it with a committed
  allow-list.
- Before and after a full rehearsal on /preview/, a read-only SQL baseline is taken: counts and
  newest timestamps of all tables, the Updates thread's unread state, and the PMO's read markers.
  The two must be identical.

---

## 8. Build and verification, after agreement

**Build** (/preview/ first; production only after the PMO's review):
1. Snapshot reader, request templates, masking, consistency checks, fingerprint (`src/sim/live/`).
2. Protocol v2, validator, Refresh path; media prefetch in the launcher.
3. Backend live mode: replay, deliverables RPC set, write refusal, enum/collation fixes, smaller
   checkpoints. sim-boot: real clock, in-memory storage, print/key blocks.
4. Selectors, formatters, speech normaliser, line templates, timing; scenes rewritten to this
   storyboard; new `data-*` hooks in the portal (attributes only).
5. Silent rehearsal, Begin screen (as-of time, projected runtime, scene report, Refresh), closing
   card, "/ 2:30".
6. Remove every fictional path and label. Rebuild /preview/ from current `main` so the nav reads
   "Monthly Report".

**Size:** the architect's estimate is about 19 engineer-days on the old scale. The fictional build
was estimated at 12-14 such days and reached /preview/ the same day, so a /preview/ build in 1-2
working days is realistic, then a laptop rehearsal.

**Verification:**
- **Freshness:** the as-of time equals launch; 14/16/61-minute and cross-day snapshots behave as
  specified; Refresh replaces the data and regenerates the lines.
- **Screen = narration:** at each figure's moment, the target element contains the figure's screen
  form, on every run (100% required). Mutated snapshots exercise every variant.
- **Coverage:** 18 of 18 items, each with its visible checks passing.
- **Compare:** the sorted leader, trio order, green leaders, PM blocks and Assign PM preview text equal
  the computed values; Cancel closes; zero assignment writes.
- **Controls:** pause and resume mid-line, previous and next, every chapter, Restart (identical data
  fingerprint), Exit (no storage keys left, blobs revoked), stray clicks and keys swallowed.
- **Read-only:**
  - in the simulation tab: 0 requests to Supabase, 0 CSP violations, the inventory test;
  - in production: the SQL baseline is identical after two full runs and a Refresh.
- **Runtime:**
  - captions-only at 120/135/150/175 wpm, at 1366 and 1920 px, with CPU 1×/4×/6×;
  - every run ends by 149.5 s with no hard cut at ≥135 wpm;
  - the projection is within ±5% of the measured time;
  - then three timed runs with real voices on the presenting laptop.

---

## 9. Decisions for the PMO (recommended choice first)

1. **WBS:** the project manager enters QIE's real breakdown before the meeting. Otherwise the line
   says honestly that it has not started.
2. **Contact details:** hide users' emails and phone numbers in the snapshot. The PMO office contact
   card stays as it is.
3. **Test accounts:** delete pmaudittest and Claude (open item 3); keep Guest. The line then says
   "one for testing".
4. **Gallery media:** include all 79 by default, so the count matches the portal, with a per-launch
   leave-out list. The scene filters to one campus. This reverses the 15 Oct "unticked by default",
   which was made for fictional projects.
5. **Dashboard health:** keep the caveat line for now, have actual costs entered as normal work, and
   fix the view formula later as a separately approved change.
6. **Badge:** "Live portal data as of HH:MM PKT · read-only · nothing is sent". The button stays
   "Simulation".
7. **The PMO's own clean-up before the meeting:**
   - the two stale card texts;
   - the 5 sample-like risks and 2 open risks on closed projects;
   - publish, or refresh, the October report that morning;
   - Ferozpur 97% with nothing released, and the Malakand dates;
   - the stage of the 5 projects that already have E-PDD PDDs.
   The narration follows whatever the data then says.
8. **Meeting date** and a rehearsal slot on the presenting laptop (1920×1080 output).
