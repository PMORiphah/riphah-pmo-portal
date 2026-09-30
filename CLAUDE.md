# CLAUDE.md — Riphah PMO Portal

Project memory for Claude Code. Condensed from the PMO Portal Handover Document (25 Sep 2026).
**This repo is public: never write passwords, tokens, API keys or private keys into this file or any committed file.**
Credentials live only in the private handover document (section 4), kept by the PMO.

## What it is

Production system the PMO at Riphah International University / IIMCT uses daily to run the FY 2026-27 CAPEX portfolio:
103 CAPEX + 2 investment projects, PKR 676.2M on the DF Recommended basis. ~12 users, ~80% on iOS.

- Production: https://pmoriphah.github.io/riphah-pmo-portal/
- Preview: https://pmoriphah.github.io/riphah-pmo-portal/preview/ (same database and users as production)
- Repo: `PMORiphah/riphah-pmo-portal` (personal account). Backend: Supabase project `prmxkecomqqngvrmytcj` ("PMO"), org `xnetntptkaidjfoqvikn`, ap-southeast-1, Postgres 17.
- The Supabase connector may also see unrelated project `zytwdpucfgshljaeyyve` — **never write to it**.
- No Vercel, Canva or Supabase branches are used by the portal.
- Fiscal year: July 2026 – June 2027.

### Roles
- `pmo`: admin, full write. Only PMO sees Cashflows, Past Projects, User Management, Activity Log, Settings.
- `project_manager`: only projects in `project_assignments`; writes WBS tasks and posts updates on those. Never sees Capex Dashboard, Cashflows, Timeline, Past Projects, Benefits Realized, risk register.
- `guest`: portfolio-wide read (senior management), plus tour and assistant. Timeline is PMO + guest.
- **Waleed Jamshed (`WJamshed`) is deliberately a guest** with 4 project assignments. Do not change him to project_manager (it removes his nav pages).
- Test accounts: `PMO` (pmo), `Guest` (guest, display name "Abdullah"), `Ali` (PM, Mr. Ali Naqi, 2 projects at Central Secretariat). Leftover test accounts: `pmaudittest`, `Claude` guest.

## Architecture

- React 18 + Vite SPA, static on GitHub Pages (legacy branch build of `main` at repo root). **No CI: pushing to `main` is the deploy.**
- `src/App.jsx` (~11,700 lines) plus ~30 modules (`AskPanel`, `AssistantAvatar`, `Cashflows`, `Timeline`, `Tasks`, `TourGuide`, `tourSteps`, `RaciCard`, `RiskRegister`, `PastProjects`, `PhotoWall`, `SessionDetail`, `auth.js`, `biometric.js`, `push.js`, `speech.js`, `sessionTrack.js`, `tourTrack.js`, `presence.jsx`, `charts.jsx`, `ui.jsx`, `theme.js`, …).
- recharts; exceljs and xlsx lazy-loaded (first load ~348 KB gz). **Never put `xlsx` in `manualChunks`** (undoes the dynamic import, +200 KB).
- Service worker is network-only by design, no caching and no offline mode (PMO rejected offline because of stale financial data).
- `viewport-fit=cover` must stay, or iOS safe-area insets are 0.
- The browser talks to Supabase directly with the user's JWT. **RLS is the real access control**; frontend role gates are display only.
- Edge functions (Deno) hold the secrets: Groq key, Gmail app password, VAPID private key, admin user creation. pg_cron fires the daily digest.

## Build and deploy

- `vite.config.js` → `base: '/riphah-pmo-portal/'` → `dist/`. `vite.config.preview.js` → `base: '/riphah-pmo-portal/preview/'` → `dist-preview/`. Mixing them breaks every asset path.
- **Always build through `./build.sh`**: it restores `index.source.html` to `index.html` before `npx vite build "$@"`. Without it Vite compiles the deployed output and hashes root files like `manifest.webmanifest`.
- Production: `./build.sh && rm -f assets/*.js assets/*.css && cp -r dist/. .`, then commit **source and built assets together**, `git tag pre-<feature>` before the commit, push `main --tags`. Commit identity: `PMORiphah <pmu@riphah.edu.pk>`.
- Preview: `./build.sh --config vite.config.preview.js && rm -f preview/assets/*.js preview/assets/*.css && cp -r dist-preview/. preview/`, then commit and push.
- Verify ~90 s after pushing: `curl -s https://pmoriphah.github.io/riphah-pmo-portal/ | grep -o 'assets/index-[^"]*\.js'` must match `ls dist/assets/index-*.js`. Then sign in on the live site and look at the change.
- **Claude Code cloud sessions cannot push tags** (branch pushes to `main` work). Report the previous commit hash as the rollback point instead of a `pre-<feature>` tag.
- Rollback: `git checkout pre-<tag> -- . && git commit && git push`, or `git revert`. From `pre-template-redesign` onward `package.json` changed, so run `npm install` after checking out an older tag.
- In Claude Code cloud sessions, work on the designated `claude/...` branch. Pushing to or merging into `main` deploys to production and needs PMO approval.
- The old `redesign` branch (tag only) is 1,865 commits behind and lacks major features. **Never build from it.** If `src/App.jsx` in git ever looks older than the live bundle, stop and recover; don't rebuild.

## Database (37 tables, all RLS; 14 views; ~40 functions; 18 triggers)

Key tables: `projects` (105), `project_assignments` (101), `project_cashflows` (191; `bucket` capex/pmdc/investment), `project_risks` (35), `project_raci` (209; R = PM and I = PMO seeded, A and C empty), `project_tasks` (0; WBS hierarchy via `parent_id`), `project_attachments` (123), `comments`/`comment_reads`, `lessons_learned`/`benefits_realized`, `past_projects`/`past_project_updates` (10 dummy rows; since 25 Sep also six dates: `start_date`, `end_date`, `revised_end_date`, `budget_release_date`, `actual_start_date`, `actual_end_date`), `past_project_tasks` (WBS for past projects, same shape as `project_tasks`, own table so it never reaches FY 26-27 views), `user_profiles` (26), reference tables `campuses`/`cost_centers`/`sectors`/`segments`/`regions` (**inverted: `segments` = organisations Trust/Riphah, `sectors` = Healthcare/Academics/Management**), `settings` (key/JSON: `dashboard_kpis`, thresholds, `team_config`, …), `snapshots`, `carry_forward_projects` (167; `amount` = Finance's **pending payments** and `status` since 29 Sep 2026, total PKR 474,539,128 incl. 7 negative credits kept as given; trigger `trg_sync_carry_forward_kpi` rewrites `settings.dashboard_kpis.carry_forward` to the list total on every change, so the card and the assistant follow the list), `activity_log`, `user_sessions`/`session_events`, `tour_events`, `notifications_log`, `user_webauthn_credentials`/`webauthn_challenges`, `push_subscriptions`. Legacy/unused: `pmo_active_session`, `milestones`. Backup tables `projects_backup_20260813`, `settings_backup_20260820`, `backup_20260910_projects`, `backup_20260914_webauthn`, `backup_20260915_projects`, `backup_20260928_projects`, `backup_20260928_exam_merge`, `backup_20260929_carry_forward_projects`, `backup_20260929_settings_kpis` (old list 964.3M / card "PKR 572M") can be dropped once the PMO agrees.

Views: `portfolio_metrics`, `portfolio_dashboard`, `project_metrics`, `investment_metrics`, `cashflow_monthly`, `at_risk_projects` (planned end ≤20 days or overdue), `pdd_pending_projects`, `project_task_rollup`, `project_risks_scored`, `lessons_learned_full`, `benefits_realized_full`, `past_project_summary` (includes the six dates), `past_project_task_rollup`, `session_summary`, `tour_progress`. **Views need `security_invoker = true` or they bypass RLS**; run `get_advisors` after every schema change. **29 Sep 2026: the last five definer views (`project_metrics`, `portfolio_metrics`, `portfolio_dashboard`, `investment_metrics`, `at_risk_projects`) were switched to `security_invoker`** (migration `assistant_v35_and_view_security`). Before that, signed-out visitors could read `at_risk_projects` (29 rows) with the anon key and PMs read all 104 projects' metrics. Now PMs see only their own projects on Performance/Campus; PMO and guest figures are unchanged; the 9 am digest reads with the service key and is unaffected.

### Business rules
- **Approved = `workflow_stage IN ('approved','closed')`** (PMO decision 29 Sep 2026). Money released while a project is at DF/ED/MT review does not make it approved. The dashboard Approved / Budgeted / Non-Budgeted cards, the portfolio breakdown (`isApproved` in `BreakdownSection`, `isApprovedStage` in `CommandCenter`) and the assistant all use this. Reuse it; never invent another. Before the change the card read 26 of 102 (7 MT Review projects with early releases); after, 19 of 102, PKR 254.8M either way.
- `bac` = approved budget; `amount_released` = disbursed; `df_recommended_amount` = Finance recommendation. Total CAPEX and the base budget use **DF Recommended**, not SU Requested. A card labelled Approved sums `bac`.
- Stages: `pdd_not_submitted`, `mt_review`, `ed_review`, `df_review`, `approved`, `closed`. Frontend `STAGE_ORDER` excludes `closed`, so handle `indexOf === -1`.
- PMDC counts in the CAPEX total but is always shown separately in Cashflows. Investment projects are never CAPEX. Keep `portfolio` and `bucket` correct on any import.
- Triggers: `trg_sync_actual_start` (actual start from `budget_release_date`), `trg_sync_project_campus` / `trg_sync_campus_rename`, `trg_tasks_baseline_guard` (baselines PMO only), `trg_comment_project`, `enforce_self_update_columns`, `log_activity()` (ignores tutorial-only changes).
- Helpers: `current_user_role()`, `is_pmo()`, `is_pm()`, `is_guest()`, `is_assigned(p)`, `can_view_project(p)`, `can_view_past(id)`, `resolve_login_email(username)`, `handle_new_user()`. Session RPCs: `session_start/log/touch/end`, `bump_session`. Tour RPCs: `tour_save_progress`, `mark_tutorial_complete`, `dismiss_tutorial`, `reset_tutorial`, `tour_demo_project`.
- Cron: job 1 `daily-deadline-alerts`, `0 4 * * *` (09:00 PKT), `net.http_post` to `send-deadline-alerts` with the anon key as Bearer plus `x-cron-secret`; URL from Vault `project_url`; weekdays only (checked in the function).
- Vault secrets: `project_url`, `cron_secret`, `groq_api_key`, `gemini_api_key` (29 Sep 2026; Google AI Studio key from a PMO Gmail account, free tier, read via `get_gemini_key()`, service role only). Edge env secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_CC`, `CRON_SECRET`, `GROQ_API_KEY`. Mail goes out from `pmu@riphah.edu.pk` via Gmail SMTP.

## Edge functions (all `verify_jwt = true`)

`ask` v41 (assistant, open to all roles; two files `index.ts` + `planner.ts`, source in `supabase/functions/ask/`), `ask-v35-test` (retired stub returning 410; can be deleted in the dashboard), `webauthn` v3 (passkeys, `@simplewebauthn/server@13`, which is pinned on purpose; returns a refresh token), `send-push` v1 (VAPID keys in code; changing them kills every subscription), `send-deadline-alerts` v8 (weekday PMO digest; `dry_run`, `force`; never emails PMs), `send-deadline-email` v2 (manual PMO → PM email from the login popup), `notify-comment` v11, `send-pdd-reminders` v4, `invite-user` v13, `reset-user-password` v3, `delete-user` v5.

- **`deploy_edge_function` and `apply_migration` reset `verify_jwt` to true.** After redeploying `send-deadline-alerts`, fire a `dry_run` and check the next 09:00 digest.
- Edge functions can't read Vault directly. `ask` calls `get_assistant_key()` through a service-role client used only for that lookup. When rotating the Groq key, update both the Vault row and `GROQ_API_KEY`.
- `net.http_post` is async; results appear in `net._http_response` by request id.

## AI assistant (`ask` v41, open to all roles again since 29 Sep 2026)

- **v41 (29 Sep 2026): open to every role again at the PMO's instruction (`PMO_ONLY = false`, no more "48 hours" message).** RLS still scopes everything (checked by SQL as Ali: 2 rows, 0 cash-flow months, 0 risks; Guest: 104 / 12 / 35). PM answers start "Read as: your assigned projects" and empty or not-found answers add that they only see their assigned projects. Empty "Needs attention" and zero-gap answers now say so instead of showing an empty heading/table.
- **v39/v40 (29 Sep 2026), after the 300-question re-run of v38** (290 correct, 3 correct but unclear, 5 wrong, 1 wrongly refused, 1 can't answer, 0 errors; faults N1–N5 approved by the PMO): "top N projects" planned as `group_by project` is a project ranking (v38 answered with a campus table); a keyword with nothing usable left ("G-8") is reported as not found (v38 matched all 104); "both at X and Y" / "at the same time" with two stages or campuses answers "none" (a project has one of each), or intersects for PMs ("who has projects at both…"); `has_pm` filter; share column on breakdowns; notes on "over budget" (no actual-cost data) and earlier fiscal years (Past Projects page). Checked by replaying all 300 recorded plans offline (8 intended changes, 292 identical) and 32 live questions (all correct). v40 only narrows "which projects are both at…" so it is never answered as a PM breakdown.
- **v38 (29 Sep 2026), after the 300-question master audit of v37** (266 correct, 18 wrong, 4 wrongly refused, 11 unanswerable, 1 error; faults F1–F9 approved by the PMO): every intent except `other` is now answered by code (`executeRisks`, `executeCashflow`, `executeOverview`, `executeKpi`, `executeGap`); more condition fields (pct_complete, risks, start/end dates, compare with another amount via `other`), `having` for group questions, `has_charter`, `has_code`, risk categories/owner, months, KPI lookups from `settings.dashboard_kpis`; unknown words that match a project name, code or cost centre are rescued into `name_keywords`; plural stemming for 4-letter words; cash-flow totals rounded only when shown. **PMO decision: in the assistant "approved projects" = stage `approved` or `closed` only (19 CAPEX), not MT/ED/DF projects with money released.** The dashboard "Approved projects" card still uses the older rule (`workflow_stage = 'approved' OR amount_released > 0`); changing it is a separate PMO decision. Backups of v36/v37 are in the session scratchpad only; rollback to v34 as below.
- **v37 (29 Sep 2026), after the PMO's session the same day:** "which projects are not approved but have budget released?" returned 83 projects (true: 7, all MT Review, PKR 39,484,492 released) because the plan had no way to say "released > 0" and that half was silently dropped; "wrong answer" repeated the same plan; the clarification fell to the narrate path, which produced "NOT AVAILABLE"; "risks on Ferozpur" pasted raw risk rows. Fixes: plan `conditions` (df/approved/released with gt/gte/lt/lte/eq/ne), `cannot_express` (code refuses a partial answer), pushback rules, "not approved" = the five pre-approval stages (never closed), `risk_levels` and risk answers rendered by code (`executeRisks`), narrated answers that are near-empty or paste `| probability … |` rows are rejected. Tests: 18/18 new cases + 22/22 regression offline, 6/6 of the session's questions live.

- **v35/v36 (29 Sep 2026): project questions are planned by the model and answered by code** (`planner.ts`). Gemini `gemini-3.5-flash-lite` turns the question into a JSON plan (intent, op list/count/total/rank/group/detail, filters from enums built from the live data: stages, campuses, PMs, cost centres, priorities, portfolio, name keywords, no PM, overdue, due within N days). Code applies it to **every** row from `assistant_rows()` (one row per project, all portfolios, RLS-scoped) and writes the whole answer, figures and table. Each answer starts with "Read as: …" so a misreading is visible. Filter words that match nothing (e.g. "Karachi") are reported, never dropped. Why: with all 105 rows in front of it, Gemini still miscounted (11 vs 12) and mis-added (off by 100,000); the model must never count or add.
- Other intents (cashflow, risks, overview, gap, charters, other) still use the v34 path below, now narrated by Gemini. Model chain everywhere: `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → Groq `gpt-oss-120b` (only on quota/overload/timeout). Gemini free-tier limits (AI Studio, 29 Sep 2026), per model for both 3.5 and 3.1 Flash Lite: 15 requests/min, 250K tokens/min, 500 requests/day; billing is deliberately off. A project question uses 1 request, other questions 2. The 15 RPM limit was hit once during rapid testing; it clears within the minute and the chain falls through to the next model.
- Tested 29 Sep: 22/22 plans correct offline, 24 end-to-end questions correct against SQL (MT Review 14 / PKR 114,437,819; G-7 PDD not submitted 12; overdue 3; no PM 7; Tahir 27 projects released PKR 29,250,735; November CAPEX 106,927,080; approved − released 28,742,705; 27 high risks). Test harness: planner questions via Gemini directly, e2e via the PMO test account (token kept in memory).
- **Rollback:** redeploy `supabase/functions/ask/rollback/index.v34.ts` as the single file `index.ts` of `ask` (it needs no `planner.ts`, no Gemini key and no `assistant_rows`).

- **The database computes, the model narrates.** Routing sends the question to `assistant_*` SQL (`totals`, `projects`, `list`, `cashflow`, `risks`, `pms`, `no_charter`, `discrepancies`), which runs under the caller's JWT. Figures and rankings are computed in code, and only that data goes to Groq `openai/gpt-oss-120b`. Every figure in the reply is verified against the data sent; on a mismatch it retries once, then asks the user to rephrase.
- Whole-word keyword matching plus a STOP list. Rankings are pre-sorted with positions. Investment is excluded from CAPEX rankings unless named. Pronouns resolve from the last answer. History turns that try to change rules ("use USD", "ignore instructions") are dropped. Project names are framed as untrusted data. Read-only.
- PM role: only assigned projects, totals scoped, published KPIs withheld (strict refusal), risk column dropped.
- **Stage routing is a fixed word list (`STAGE_WORDS` in `ask`).** v33 (28 Sep 2026) added MT Review and ED Review, which were missing because no project sat there before; the assistant then answered "which projects are in MT review?" from the top-25 snapshot (4 of 14). Whenever a stage, campus or other filter value starts being used for the first time, check the assistant routes it (dry run) before the PMO asks.
- **28 Sep 2026: switched back to PMO only (`PMO_ONLY = true`) at the PMO's instruction** after it listed 4 of 14 MT Review projects, then padded a list with invented "(duplicate entry)" rows and described its own data blocks. Guests and PMs still see the launcher and get the "testing phase… try again after 48 hours" message. The PMO's view: the keyword routing + top-N fallback design is the root cause; do not reopen it to others without the PMO asking, and do not claim an audit fixes it.
- Constants: `PMO_ONLY = false` (v41), `AUDIT_DRY_RUN = true` (PMO `dry_run` returns the plan and answer, or the v34 routing, without the narrating call), `MODEL` (Groq), `GEMINI_MODELS`.
- Groq free tier (now fallback only): 8K tokens/minute and ~200k/day; that 8K/min cap is why v34 could only send a top-25 snapshot.
- Audits passed: bank 1 107/107, bank 2 60/60, regression 26/26, routing 245/245, PM isolation 5/5.
- Frontend: `AskPanel.jsx`; `AssistantAvatar.jsx` (navy-glass robot with its own light palette); the card figure arrives as a field from the edge function and is never parsed from prose; Listen via `speech.js` (speaks millions, skips codes). Conversations are logged to `session_events`.

## PMO Review / E-PDD intake (30 Sep 2026; on /preview/ only until the PMO promotes it)

- The E-PDD portal (`https://pmo.riphah.edu.pk`, Laravel, built by the MIS Department) is where new PDDs arrive (Manage PMO Form) and where the PMO approves or rejects. The PMO portal only **reads** it.
- Edge function `epdd-sync` (source `supabase/functions/epdd-sync/`), pg_cron job 2 `epdd-sync`, `*/5 * * * *`, same auth pattern as job 1 (anon Bearer + `x-cron-secret`), or a signed-in PMO ("Check now"). Signs in with Vault secrets `epdd_email` / `epdd_password` (read via `get_epdd_credentials()`, service role only), reuses the session cookie stored in `epdd_state`, reads the DataTables JSON of `/manage-pmoform` (queue `manage` = waiting on PMO) and `/Status-Pdd` (queue `status`), then the view page of each new or changed PDD for SU head, project type and the approval history. **Only GET requests plus the login POST; it must never call approve/reject or the SAP-saved checkbox.**
- The E-PDD JSON carries the submitter's full HR profile (CNIC, birth date, family, address) and approval tokens. `sanitise()` drops them; keep it that way. Attachments under `/public/files/...` on the E-PDD portal are public without login (reported to the PMO for MIS).
- Tables: `epdd_pdds` (normalised form in `pdd` jsonb, `approvals`, `raw` sanitised), `epdd_files` (copies in private bucket `epdd-files`), `epdd_reviews` (code checks, phase 3), `epdd_sync_runs` (health log), `epdd_state` (backend only, no policies). All PMO-only by RLS; the PMO may update only `seen_at`, `seen_by`, `linked_project_id`, `link_source`. The 47 PDDs present at launch are `is_history = true`.
- E-PDD field names differ from its labels: label Problem = column `opportunity`, label Opportunity = `project_proposed`. `project_type` 1 = Non-Budgeted, 2 = Budgeted. `deliverables_documents` 1 General, 2 Simple Procurement, 3 New Construction, 4 Renovation/Maintenance.
- Frontend: `src/PmoReview.jsx`, nav id `review` (PMO only), gold badge = PDDs since launch not yet opened. Detail tabs: Review (default), PDD details, Cost table, Files, Approval history.
- **Phase 3 (30 Sep 2026): code checks** in `supabase/functions/epdd-sync/review.ts` (`RULES_VERSION` rules-3), run by `epdd-sync` after each copy and stored in `epdd_reviews` (one row per change; key = rules version + PDD content hash + link + files + plan figures). Groups: Completeness (required fields, one-liners, identical fields), Cost table (qty × unit = line ±PKR 1, lines = grand total = estimated total; zero lines are complimentary, negatives fail), Schedule (start < finish; duration ±3 days because the E-PDD's own duration arithmetic is loose; start before the PDD was created = warn; after 30 Jun 2027 = note), Documents (General → Deliverables + Business Plan; ROI/savings claimed → Financial Metrics; Simple Procurement → Quotations; Construction/Renovation → Layout + BOQ; same file in two slots or a quotation in the Deliverables slot = warn), Budget (Budgeted PDDs matched to FY 26-27 `projects` by weighted name similarity + SAP cost-centre code from `cost_centers.name` "(Code:1197000)" + campus; auto-link only at score ≥ 0.55 and 0.15 clear of the runner-up; over DF by ≤ 1% = warn, more = fail; non-PKR PDDs (3 in USD) are never compared automatically; Non-Budgeted PDDs whose name is ≥ 60% like a plan project are flagged). Any fail = "Needs changes", else "Ready for decision". The PMO can link a different plan project or mark "Not in the plan" on the page (`link_source = 'pmo'`), which calls `epdd-sync` with `{review: id}` to redo that review only.
- On the 47 history PDDs: 43 ready, 4 needs changes (all four over DF: PDD-30 +89,510, PDD-31 ISMS +106,550, PDD-49 Outdoor Sports +793,300, PDD-51 Scanner & Printer +10,000); 24 auto-linked; four Non-Budgeted PDDs look like plan projects (57 IIMC Labs & Corridors, 58 Media Equipment, 59 KIOSK Machines, 66 Boys Common Room).
- Plan approved by the PMO 30 Sep 2026: phase 3 code checks (required fields, qty × unit = line total, lines = grand total = estimated total, dates and duration, attachments by document type, budget match against `projects` by name/campus/cost centre with DF Recommended), phase 4 Gemini checks (problem clear, objectives/success criteria measurable, risks realistic, quotations read by Gemini and compared by code) plus an agreement test on the 47 history PDDs, phase 5 push + email to the PMO and failure alerts. Result is set by code: Ready for PMO decision / Needs changes (no "recommend reject"). The PMO accepted Gemini free-tier privacy for PDDs.

## Auth and sessions (`src/auth.js`, commit `f66d7fb`)

- Username sign-in → `resolve_login_email` → password grant. Remember me off → `sessionStorage`; on → `localStorage`. The refresh token rotates, with silent renewal 5 min before expiry, retried every minute on network errors. Tabs coordinate via `BroadcastChannel` and a Web Lock. Timers re-plan when the tab becomes visible. Sign-out calls `/auth/v1/logout?scope=local`.
- Passkeys are per device and revocable individually.
- Push upsert needs `?on_conflict=endpoint`, `Prefer: resolution=merge-duplicates` and an UPDATE policy.

## Pages (NAV ids)

`dash`, `projects`, `campus`, `perf`, `risks`, `cashflows` (PMO), `timeline` (PMO + guest), `past` (PMO), `upd`, `gallery`, `team`, admin `users`, `logs`, `settings` (PMO). PMs see only Projects, Campus/Sites, Performance, Updates, Gallery, Team & About.
- Adding a KPI or stage needs three edits: the card, the `stageMap`/filter branch, and `cardLabels`.
- **PCD Receiving Date** is its own column, `projects.pcd_received_date` (since 28 Sep 2026), entered in Edit Project next to Actual End Date. It is no longer the same as `actual_end_date`. Excel import aliases *PCD Receiving/Received Date, PCD Date, PCD* map to it. The "PCDs Received" dashboard card still counts `closed` projects.
- Published dashboard KPIs are typed text in `settings.dashboard_kpis`: SU requested 1,166.33M, carry forward 474.5M (kept in sync with `carry_forward_projects` by trigger since 29 Sep; was a typed 572M), budget reduction 606.81M.
- Updates: "N new" and the sidebar badge count from the reader's own `comment_reads`.
- **Past Projects** (25 Sep 2026): list or Gantt (grouped by fiscal year); clicking a project opens a full page with Follow-up / Timeline / WBS tabs. Dates are PMO-only; overdue = revised finish (else planned finish) passed with no actual finish, shown on the page only (not in the digest or popups). The WBS reuses `ProjectTasks` with `kind="past"`. Import/template carry the six date columns; a budget release date becomes the actual start (trigger `trg_past_sync_actual_start`).
- **Opening Past Projects to others later** (PMO will ask once real data is loaded): guests read-only, PMs their own projects. Change `can_view_past(p)` to `is_pmo() or is_guest() or is_past_pm(p)`, and show the `past` nav item to those roles. The `past_project_tasks` write policy already lets a PM edit their own project's WBS once they can view it. Check the `past_projects` / `past_project_updates` policies too (currently `is_pmo()` only); PMs may post to the thread but must not edit the record.
- **Rejected, do not rebuild:** 3D portfolio constellation, live activity pulse, offline support, horizontal scroll of the Team paragraph. **Not started:** campus map, board report generator, campus-vs-campus comparison.

## Ground truth (SQL-verified 25 Sep 2026, PKR)

| | CAPEX (103) | Investment (2) |
|---|---|---|
| Approved (`bac`) | 273,584,115 | 190,571,528 |
| Released | 226,099,073 | 190,571,528 |
| DF Recommended | 676,243,011 | 190,571,528 |
| Approved − Released | 47,485,042 | 0 |

- Cashflow: CAPEX 556,534,400 + PMDC 119,708,611 = 676,243,011; investment 190,571,528; grand total 866,814,539.
- Monthly capex_total: Jul 23,234,323 · Aug 49,683,808 · Sep 102,999,150 · Oct 80,778,749 · Nov 106,927,080 · Dec 48,821,465 · Jan 52,056,587 · Feb 42,598,392 · Mar 30,372,069 · Apr 57,243,300 · May 52,953,774 · Jun 28,574,315.
- **Changes on 28 Sep 2026 (the ground truth above predates them):**
  - Nine DF-review projects moved to ED review, then MT review (backup `backup_20260928_projects`).
  - The PMO moved Renovation of Marketing Office to MT review and cut its DF from 1,000,000 to 400,000, so the CAPEX DF total is now 675,643,011 and the cash-flow plan is 600,000 above it.
  - Four Examination Cell G-7 projects (Printer and Shredder for Degree Section, Director's Office, Assistant Controller Office) were merged into one project, "Upgradation of Controller Exam Office" (1,030,000, MT review, Nouman). Their 4 cash-flow rows moved to it; originals are in `backup_20260928_exam_merge`.
  - Counts now: 102 projects (100 CAPEX + 2 investment). CAPEX stages: pdd_not_submitted 67 · df_review 3 · mt_review 11 · approved 18 · closed 1. G-7 has 21 projects; Nouman has 20.
- Campuses: Al-Mizan 28 · G-7 24 · I-14 21 · GGC 12 · Lahore 4 · PRH 3 · RIH 3 · Hostels 3 · Central Secretariat 3 · MHH 1 · Malakand 1.
- Risks: 35 (27 high, 5 medium, 3 low, 0 critical by design).
- PM loads: Tahir 28 · Nouman 23 · Najam 21 · Asim 12 · Waleed 4 · Maj. Shuaib 3 · Fazal 3 · Ali Naqi 2 · Altaf, Col Tariq, Daud, Ishfaq, Naqash 1 each. 2 CAPEX projects have no PM.
- Top CAPEX by DF: PRH PMDC upgrade 78.1M · Ferozpur 68.3M (approved 68,227,197, released 0) · Hospital Facilities PRH 61M · FortiGate/NGF 30M · SAN 24.65M.
- Investment: QCH1&2 RMC Basements 180.6M · DBD-REIT 10M. Closed: RIHCA Kiosk (actual end 1 Sep 2026, cost 295,000).

If a page or an answer disagrees with these figures, it is wrong until proven otherwise. Re-query before trusting them after data changes.

## Open items (need PMO decisions or data)

1. Rotate the Groq key and the GitHub PAT (both exposed in chat).
2. Do one real-device passkey sign-in to confirm renewal.
3. Delete the `pmaudittest` and `Claude` test accounts.
4. Five PMDC cashflow rows tagged Al-Mizan belong to PRH/RIH (8.77M); PMO to confirm each.
5. Three cashflow-only projects have no register row: Computer Labs I-14, ISO 27001, DBS Lab.
6. Load the 167 past projects (template `Past_Projects_Import_Template.xlsx`) and remove the 10 dummies.
7. Fill RACI A/C from `RACI_A_and_C_to_complete.xlsx`.
8. WBS is empty on every project.
9. Projects without a planned end never trigger deadline alerts.
10. Drop the backup tables once the PMO is satisfied.
11. Decide on `AUDIT_DRY_RUN`.

## Gotchas

- PostgREST bulk inserts need identical keys on every object (`PGRST102`).
- Deleting a root comment cascades to its replies.
- Storage keys reject `[`, so sanitise filenames.
- Tooltips inside `overflow:hidden` cards get clipped; portal them to `document.body`.
- Keep dialogs mounted through a parent reload.
- Placeholders use a real ellipsis `…`, so Playwright locators typed with `...` fail.
- The PDD alert popup appears a few seconds after sign-in on production and blocks clicks; dismiss it in a loop.
- Headless Chromium denies notifications, so push is testable only on real devices. Passkeys are testable via CDP `WebAuthn.enable`.
- Mobile tests: 360–390 px with `is_mobile` and `has_touch`.
- Guest tour tests start with the four `tutorial_*` columns null and no `tour_events` rows. The tour exit is the X labelled "Skip tour".
- Assistant: never send a complete answer and a partial block together; never let the model do arithmetic or sorting.

## Working rules (from the PMO)

- Fixes go straight to production after local verification. Report the commit, bundle and rollback tag.
- New or major visual features, and anything touching sign-in, go to `/preview/` first. The PMO reviews on phone and desktop before promotion.
- Tag `pre-<feature>` before every deploy and verify on the live site. Screenshot after every change: a clean build and console have hidden visibly broken pages before.
- Build queued features one at a time and ask before starting the next.
- **New tables need explicit grants (Supabase change from 30 Oct 2026).** Every migration that creates a table or view in `public` must also run `grant select on public.<t> to anon; grant select, insert, update, delete on public.<t> to authenticated, service_role;`, or the Data API returns "permission denied". Access is still decided by RLS. Tables created before 30 Oct 2026 keep their grants.
- **Schema changes: show the migration before running it. Bulk data changes: preview the exact rows, take a backup table (`backup_<date>_<table>`), and apply with per-item confirmation.**
- Import date conflicts: ask about each project one by one; never decide silently.
- Always ask whether to send the invitation email before creating a user.
- PMs are never emailed automatically, only when the PMO presses Send on a previewed message.
- Remove test data written to production and confirm the counts are back.
- Risks follow the charters' tone, one per project, simple, few criticals.
- Design matters: "living UI" (hover detail, breathing animation, distinct colours), light and dark mode, and mobile checked on every change. Don't over-engineer.
- Communication: report what was verified, how, and with the numbers; say what couldn't be tested. Ask decision questions one at a time.

## Manual post-deploy checks

Sign in as PMO on desktop and at 390 px. Open one closed and one open project, then Cashflows and the Activity Log. Ask the assistant "where do we stand overall?" and compare with the ground truth. As Guest, check the tour invite or sidebar button. As Ali, confirm 2 projects.
