# Ask status (Past Projects) and Ask update (FY 2026-27)

PMO request, 20 Oct 2026. Discussed and decided the same day; nothing built yet. People are named by role only in this file.

## The request

- **Past Projects: "Ask status".** The PMO and the two past-project viewers press it. The project's manager is notified and must fill two mandatory fields: % completed and Justification.
- **FY 2026-27 Updates tab: "Ask update".** The manager must comment on every deliverable, give an overall status and write a detailed update.

## Facts that shaped the design (20 Oct 2026)

- **"Ask status" is already done by hand.**
  - The two viewers have posted 79 messages on past projects; 51 are exactly "Please update progress on the Project".
  - Managers replied 54 times, in free text (about 320 characters each) and never with a %.
  - Each post emails the manager, the PMO and the team copy: 247 past-project emails so far.
- **Email is the only channel that reaches managers.**
  - 1 of 13 has push.
  - 4 have never signed in, and only 1 posted on Updates in the last month.
  - Answers must be given signed in. Sign-in links and email buttons that write were rejected on 7 Oct.
- **Managers can't write the fields an answer would naturally go into.**
  - Past projects have no % field, and managers can't edit `past_projects`.
  - FY `projects.pct_complete` is PMO-only and drives EV, SPI and "Delayed".
- **Deliverables:** confirmed lines exist on 30 of 111 CAPEX projects; 25 of them have a manager.
- **Who is asked:** whoever manages the project, by `past_projects.pm_user_id` or `project_assignments`, never by role. One manager is a guest.
- **Earlier decisions (7 Oct):** the PMO rejected a separate request table, page, pop-up and email function ("too many separate stuff"), and an "Ask PM for update" button that posts into Updates ("think smartly"). This design therefore keeps requests and answers inside the existing conversations.

## Decisions (PMO, 20 Oct 2026)

1. **On-demand "Ask update" replaces the parked weekly deliverables check-in** (`deliverable-checkin.md`). Nothing is sent to managers automatically.
2. **Who can ask on FY 26-27:** the PMO and the two past viewers.
3. **Each deliverable line needs a status** (Arrived / Ordered / Not yet) **and a comment.**
4. **Past Projects:** the manager's % and justification are shown **beside** the PMO's "Why still open". That field, the Progress chip and the No progress card are unchanged.
5. **FY 26-27:** the manager's % is shown as reported ("PM reports 60%, 20 Oct"). It goes into % Complete only when the PMO presses **Use this %**.

## Design

### A. Past Projects: Ask status

- **Who and where:** the PMO or a viewer presses **Ask status** on the project page. They can also use **Ask status on all N open projects** on a manager's card, which sends one email listing every project.
- **Before sending:** a confirm window shows who is emailed. The asker can add an optional note.
- **The request:** posted in the project's Follow-up conversation as a request card.
- **The email:** goes to the manager, via `notify-past` with a new kind. It opens `?past=<id>` on the Follow-up tab.
- **The manager's form:** at the top of the Follow-up tab while a request is open.
  - % completed (0–100) and Justification are both required.
  - The database refuses an answer without them.
- **The answer:**
  - posted as an answer card in the same conversation;
  - shown as a "% completed (by PM, date)" tile, and as a % on the list row;
  - emails whoever asked, and the PMO.
- **Tracking:**
  - an "Awaiting status" card (count; click to filter);
  - "Asked N days ago" on each waiting project;
  - a **Remind** button (pressed, never automatic).

### B. FY 2026-27 Updates: Ask update

- **Who and where:** the PMO or a viewer presses **Ask update** in the project's Updates thread.
- **Before sending:** a preview of the email. The PMO is copied when a viewer asks.
- **The email:** one per request, to the project's manager(s). It opens the Updates thread with the form (new `?upd=<project id>` link).
- **The manager's form** (phone and computer), all required:
  1. Each confirmed deliverable: status (Arrived / Ordered / Not yet) and a comment.
  2. Overall status (On track / At risk / Delayed) and % completed.
  3. Detailed update.
- **The answer:**
  - posted as one card in the Updates thread, so the Inbox, "N new", the bell and the Activity Log work unchanged;
  - each deliverable's tick and note are updated from it.
- **The PM's %:** shown as reported; **Use this %** copies it into % Complete (PMO only).
- **Avoiding double emails:** the generic "new comment" email is skipped for requests and answers, which have their own emails.
- **Tracking:** "Update requested · N days" on the Updates list, and a **Remind** button.

### Both parts

- **Sign-in notice for managers:** "The PMO asked for N updates", listing them. It waits behind the existing sign-in pop-ups.
- **No automatic reminders.** A later option: an "answered / waiting" block in the 9 am digest. Its source isn't in the repo yet.

## Data (two small migrations, shown before running)

- **`past_project_updates`:**
  - New columns: `kind` (message / status_request / status), `pct_complete` (0–100), `justification`.
  - A check: a status answer needs both fields.
  - Insert rules: requests only from the PMO and viewers; answers only from the project's manager. The author's role is checked against `user_profiles`.
- **`comments`:**
  - New columns: `kind` (comment / update_request / update) and `data` jsonb (overall status, %, per-line status and comment).
  - Checks: an update needs every field, plus one entry per confirmed deliverable line.
  - Insert rules: requests only from the PMO and viewers; updates only from an assignee.
  - A trigger applies each line to `project_deliverables` (status, status_date, note).
- **Open request** = the latest request is newer than the latest answer. Worked out on read; no separate request table.
- **Edge functions:**
  - `notify-past` gets new kinds.
  - `notify-comment` (deployed, source not in the repo) is pulled into the repo, then given request/answer kinds and the skip rule. Both are deployed from a commit.
- **Simulation:** new columns in `schema.js`, then all suites and a full run.

## Release

/preview/ first, unless the PMO says otherwise.
