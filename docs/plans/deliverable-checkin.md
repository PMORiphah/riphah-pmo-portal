# Deliverables phase 2: weekly PM check-in ("Has anything arrived?")

Status: **parked 7 Oct 2026, waiting for the PMO.** Nothing built, no migration run.
Resume by asking decision 1 below (one decision at a time).

## History

- Plan 1 (request table + PMO overview page + PM pop-up + new email function): rejected by the PMO,
  "too many separate stuff for follow ups, updates, deliverables etc".
- Plan 2 ("Ask PM for update" button that posts into the project's Updates thread): rejected,
  "come up with a better plan, think smartly".
- Plan 3 (below) came out of a design run: 4 approaches (zero new surfaces, one follow-up page per
  manager, self-scheduling check-ins, one-tap on phone), scored by 2 independent judges; both picked
  the weekly check-in, with grafts from the others. Presented to the PMO 7 Oct 2026.

## Why (facts checked by SQL on 7 Oct 2026; re-query before relying on them)

- 266 live deliverable lines on 39 projects; **0 ticked, 0 dated**.
- 13 PM accounts, all with `notify_email = true`; **0 PM push subscriptions**.
- All 30 PM sessions so far share the PMO account's browser (the PMO checking tours); no PM has
  signed in from their own device yet. **Email is the only channel that reaches PMs.**
- The deadline pop-up's "Email <PM>" button (send-deadline-email v2) and the bulk PDD reminder
  have 0 sends. Updates + past-project chats hold 5 messages in total, 1 written by a PM.
- So: no more buttons or threads. The portal asks; the tick is the answer.

## The plan

**PM (about a minute a week)**
1. Monday 08:50 PKT: one email per person with something due: "PMO check-in: has anything arrived?
   (N projects)", a short table (project, site, "0 of 25 arrived", planned finish; overdue first),
   PDDs to submit under it, one button **Open my check-in** (`?checkin`). No CC.
2. The button opens one list over all their projects (in the existing bell panel, not a new page):
   per project **[Nothing yet] [All arrived] [Some ▸]**; "Some" embeds the existing
   `ProjectDeliverables` tick list. **"Nothing new on any project"** at the top. Undo per card.
   Links never write on load; every answer is a tap in a signed-in browser.
3. Answer = the tick, or "Nothing yet" = `status_date = today` on the open lines ("not arrived, as
   of 12 Oct"). No reply, no request record. Ticking on the Deliverables tab counts too.
4. Not emailed again that week once answered (last answer = max(`status_date`), which the PDD sync
   never touches; do **not** use `updated_by`/`updated_at`, the guard and sync overwrite them).
5. Who is asked = assignees in `project_assignments` (any role, so Waleed is included).

**PMO (nothing to press)**
- The 9 am digest gets one block: answered / not yet (with prefilled WhatsApp links), plus
  exceptions only: nothing arrived for 3 weeks on a project past its finish; all delivered but not
  closed (ask for the PCD); closed or 100% with items unticked (today RIHCA Kiosk, Graphics Cards,
  Procurement of IT Equipment); can't be asked (no PM / charter drafts unconfirmed).
- The sign-in deadline pop-up gets one line per project: "Delivered 3 of 25 · last check-in 12 Oct".
- The PMO can tick for a PM after a phone call (already possible); the Activity Log shows who.

**Merged / removed**
- The PM's PDD pop-up (`PddAlertPM`) and bell panel become this one list; one bell number for PMs;
  at most one thing opens at sign-in (check-in if due, else the tour invite).
- Bulk PDD reminder button retired later (each Monday email lists that PM's PDDs to submit).
- The PM tour's "Your main job: WBS" step becomes the weekly check-in.

## What gets built

- Migration (show it to the PMO first; no new table, no policy/trigger change, no DROP/DELETE):
  generated column `project_deliverables.is_item` (false for contingency / sales tax / GST lines,
  10 today) and view `deliverables_checkin` (`security_invoker = true`, grants per the 30 Oct rule):
  one row per CAPEX project with confirmed live item lines; assignee, open/done items, last answer,
  past finish, `due` = released > 0, not closed, open items > 0, no answer in the last 6 days.
  Consider making `log_activity()` fold or skip "Nothing yet" bursts (up to 52 rows per tap).
- Frontend: check-in list in `NotificationsDrawer`, `?checkin` deep link, Deliverables tab
  (greyed contingency/tax, "Last check-in …", **All arrived**, unticking keeps a date), tour step,
  `track('checkin', …)` in session_events.
- `notify-past` new kind `checkin` (layout in `notify-past/email.ts`; preview + "[Test]" modes;
  logged as `checkin-email`), deployed from a commit.
- Sending: pg_cron job 3 `50 3 * * 1` (Mon 08:50 PKT, anon Bearer + x-cron-secret) **or** a weekly
  "Preview and send this week's check-ins" link in the digest, per decision 1.
- Digest block in `send-deadline-alerts`: pull its deployed source into the repo first, deploy from
  a commit, dry run.

## First Monday (on 7 Oct data)

5 people, 13 projects, 94 items: Tahir 6 / 52, Nouman 3 / 35, Najam 2 / 2, Fazal 1 / 4,
Waleed 1 / 1 (QIE Lifts). Not askable: Media Equipment RU.272001-04 (16 items) and KIOSK Machines
RU.272001-05 (1) have no PM; 8 released projects have only charter drafts (37 items) waiting for
Confirm all; 14 projects (81 items) wait for a release.

## Decisions for the PMO, in order

1. **Automatic Monday email to PMs** (only those with something due, once a week, no CC, logged;
   an exception like the 5 Oct past-chat one) **or** the PMO presses one weekly Preview & Send.
   Recommended: automatic.
2. "Nothing yet" writes today's date on open lines; unticking keeps a date.
3. Fold PDD reminders into the check-in (PM PDD pop-up and bulk reminder button go).
4. Who is asked: released and not closed (not the "approved" rule; includes QIE Lifts at DF Review).
5. Leave contingency / tax lines out of every count (show the 10 lines).
6. Before the first Monday: Confirm all on the 8 draft-only projects; assign PMs to Media Equipment
   and KIOSK Machines.

## Rollout

Preview first (migration shown, then advisors; test email to the PMO only; check as Ali and PMO at
390 px and desktop, light and dark) → production after OK (first real Monday after approval) →
digest block. Rollback = previous commit hashes (cloud sessions can't push tags); stopping the
email = remove cron job 3. Measure after two weeks from the Activity Log and session_events.

## Rejected (don't rebuild)

Plans 1 and 2 above; per-manager "Follow-ups" page replacing Updates (big rebuild, an overview page
by another name, takes guests' read access); per-project schedules with many states and chips;
answers derived from `updated_by`/`updated_at`; email buttons that write when tapped; magic sign-in
links; push as the channel; % complete computed from ticks (separate decision, changes EV/SPI).
