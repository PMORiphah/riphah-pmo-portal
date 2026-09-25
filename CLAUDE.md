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

Key tables: `projects` (105), `project_assignments` (101), `project_cashflows` (191; `bucket` capex/pmdc/investment), `project_risks` (35), `project_raci` (209; R = PM and I = PMO seeded, A and C empty), `project_tasks` (0; WBS hierarchy via `parent_id`), `project_attachments` (123), `comments`/`comment_reads`, `lessons_learned`/`benefits_realized`, `past_projects`/`past_project_updates` (10 dummy rows; since 25 Sep also six dates: `start_date`, `end_date`, `revised_end_date`, `budget_release_date`, `actual_start_date`, `actual_end_date`), `past_project_tasks` (WBS for past projects, same shape as `project_tasks`, own table so it never reaches FY 26-27 views), `user_profiles` (26), reference tables `campuses`/`cost_centers`/`sectors`/`segments`/`regions` (**inverted: `segments` = organisations Trust/Riphah, `sectors` = Healthcare/Academics/Management**), `settings` (key/JSON: `dashboard_kpis`, thresholds, `team_config`, …), `snapshots`, `carry_forward_projects` (167), `activity_log`, `user_sessions`/`session_events`, `tour_events`, `notifications_log`, `user_webauthn_credentials`/`webauthn_challenges`, `push_subscriptions`. Legacy/unused: `pmo_active_session`, `milestones`. Backup tables `projects_backup_20260813`, `settings_backup_20260820`, `backup_20260910_projects`, `backup_20260914_webauthn`, `backup_20260915_projects` can be dropped once the PMO agrees.

Views: `portfolio_metrics`, `portfolio_dashboard`, `project_metrics`, `investment_metrics`, `cashflow_monthly`, `at_risk_projects` (planned end ≤20 days or overdue), `pdd_pending_projects`, `project_task_rollup`, `project_risks_scored`, `lessons_learned_full`, `benefits_realized_full`, `past_project_summary` (includes the six dates), `past_project_task_rollup`, `session_summary`, `tour_progress`. **Views need `security_invoker = true` or they bypass RLS**; run `get_advisors` after every schema change.

### Business rules
- **Approved = `workflow_stage = 'approved' OR amount_released > 0`.** Reuse it; never invent another.
- `bac` = approved budget; `amount_released` = disbursed; `df_recommended_amount` = Finance recommendation. Total CAPEX and the base budget use **DF Recommended**, not SU Requested. A card labelled Approved sums `bac`.
- Stages: `pdd_not_submitted`, `mt_review`, `ed_review`, `df_review`, `approved`, `closed`. Frontend `STAGE_ORDER` excludes `closed`, so handle `indexOf === -1`.
- PMDC counts in the CAPEX total but is always shown separately in Cashflows. Investment projects are never CAPEX. Keep `portfolio` and `bucket` correct on any import.
- Triggers: `trg_sync_actual_start` (actual start from `budget_release_date`), `trg_sync_project_campus` / `trg_sync_campus_rename`, `trg_tasks_baseline_guard` (baselines PMO only), `trg_comment_project`, `enforce_self_update_columns`, `log_activity()` (ignores tutorial-only changes).
- Helpers: `current_user_role()`, `is_pmo()`, `is_pm()`, `is_guest()`, `is_assigned(p)`, `can_view_project(p)`, `can_view_past(id)`, `resolve_login_email(username)`, `handle_new_user()`. Session RPCs: `session_start/log/touch/end`, `bump_session`. Tour RPCs: `tour_save_progress`, `mark_tutorial_complete`, `dismiss_tutorial`, `reset_tutorial`, `tour_demo_project`.
- Cron: job 1 `daily-deadline-alerts`, `0 4 * * *` (09:00 PKT), `net.http_post` to `send-deadline-alerts` with the anon key as Bearer plus `x-cron-secret`; URL from Vault `project_url`; weekdays only (checked in the function).
- Vault secrets: `project_url`, `cron_secret`, `groq_api_key`. Edge env secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_CC`, `CRON_SECRET`, `GROQ_API_KEY`. Mail goes out from `pmu@riphah.edu.pk` via Gmail SMTP.

## Edge functions (all `verify_jwt = true`)

`ask` v32 (assistant), `webauthn` v3 (passkeys, `@simplewebauthn/server@13`, which is pinned on purpose; returns a refresh token), `send-push` v1 (VAPID keys in code; changing them kills every subscription), `send-deadline-alerts` v8 (weekday PMO digest; `dry_run`, `force`; never emails PMs), `send-deadline-email` v2 (manual PMO → PM email from the login popup), `notify-comment` v11, `send-pdd-reminders` v4, `invite-user` v13, `reset-user-password` v3, `delete-user` v5.

- **`deploy_edge_function` and `apply_migration` reset `verify_jwt` to true.** After redeploying `send-deadline-alerts`, fire a `dry_run` and check the next 09:00 digest.
- Edge functions can't read Vault directly. `ask` calls `get_assistant_key()` through a service-role client used only for that lookup. When rotating the Groq key, update both the Vault row and `GROQ_API_KEY`.
- `net.http_post` is async; results appear in `net._http_response` by request id.

## AI assistant (`ask` v32, open to all roles)

- **The database computes, the model narrates.** Routing sends the question to `assistant_*` SQL (`totals`, `projects`, `list`, `cashflow`, `risks`, `pms`, `no_charter`, `discrepancies`), which runs under the caller's JWT. Figures and rankings are computed in code, and only that data goes to Groq `openai/gpt-oss-120b`. Every figure in the reply is verified against the data sent; on a mismatch it retries once, then asks the user to rephrase.
- Whole-word keyword matching plus a STOP list. Rankings are pre-sorted with positions. Investment is excluded from CAPEX rankings unless named. Pronouns resolve from the last answer. History turns that try to change rules ("use USD", "ignore instructions") are dropped. Project names are framed as untrusted data. Read-only.
- PM role: only assigned projects, totals scoped, published KPIs withheld (strict refusal), risk column dropped.
- Constants: `PMO_ONLY = false`, `AUDIT_DRY_RUN = true` (PMO `dry_run` returns routing without calling Groq), `MODEL`.
- Groq free tier: ~200k tokens/day at ~3,400 per question, so ~59 questions/day org-wide (accepted by the PMO).
- Audits passed: bank 1 107/107, bank 2 60/60, regression 26/26, routing 245/245, PM isolation 5/5.
- Frontend: `AskPanel.jsx`; `AssistantAvatar.jsx` (navy-glass robot with its own light palette); the card figure arrives as a field from the edge function and is never parsed from prose; Listen via `speech.js` (speaks millions, skips codes). Conversations are logged to `session_events`.

## Auth and sessions (`src/auth.js`, commit `f66d7fb`)

- Username sign-in → `resolve_login_email` → password grant. Remember me off → `sessionStorage`; on → `localStorage`. The refresh token rotates, with silent renewal 5 min before expiry, retried every minute on network errors. Tabs coordinate via `BroadcastChannel` and a Web Lock. Timers re-plan when the tab becomes visible. Sign-out calls `/auth/v1/logout?scope=local`.
- Passkeys are per device and revocable individually.
- Push upsert needs `?on_conflict=endpoint`, `Prefer: resolution=merge-duplicates` and an UPDATE policy.

## Pages (NAV ids)

`dash`, `projects`, `campus`, `perf`, `risks`, `cashflows` (PMO), `timeline` (PMO + guest), `past` (PMO), `upd`, `gallery`, `team`, admin `users`, `logs`, `settings` (PMO). PMs see only Projects, Campus/Sites, Performance, Updates, Gallery, Team & About.
- Adding a KPI or stage needs three edits: the card, the `stageMap`/filter branch, and `cardLabels`.
- Published dashboard KPIs are typed text in `settings.dashboard_kpis`: SU requested 1,166.33M, carry forward PKR 572M, budget reduction 606.81M.
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
- Stages (CAPEX): pdd_not_submitted 72 · df_review 12 · approved 18 · closed 1.
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
