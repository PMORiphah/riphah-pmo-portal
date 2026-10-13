# WhatsApp update requests (Track 1)

Status: **planned 13 Oct 2026, waiting for the PMO's decisions.** Nothing built. Research: 4 repo/database
readers, 4 external researchers (Meta platform, Flows, providers, demo tooling), 2 designers and an
adversarial fact-check; every external claim below cites the page read on 13 Oct 2026. Companion plan:
`docs/plans/management-demo.md`.

## Goal

The PMO picks a project and requests an update from its PM; the PM gets a WhatsApp message, answers inside
WhatsApp in under a minute; the answer is recorded against the right request and project, the PMO is told,
the PM gets a receipt. Official figures change only when the PMO accepts them.

## What exists today (verified in code and the live database)

- `user_profiles.phone`, `whatsapp_opt_in`, `whatsapp_opt_in_at` (added 20 Jul 2026, migration
  `notification_foundation`). 12 of 13 PMs have a +92 mobile; **0 users opted in**; nothing in the code ever
  writes `whatsapp_opt_in`. The self-update guard `enforce_self_update_tutorial_only` blocks non-PMO changes
  to phone and opt-in (but not `whatsapp_opt_in_at`).
- Manual `wa.me` links only: Person Responsible card (App.jsx:7858, shown to every viewer, no text) and the
  PMO-only "Nudge on WhatsApp" on Updates with prefilled text (App.jsx:9661-9679). Not logged, not two-way.
- Every signed-in user can read every phone number (`profiles_select` = authenticated).
- Progress: `projects.pct_complete` is PMO-written only (RLS `projects_update = is_pmo()`), feeds
  `project_metrics` (EV = bac × pct/100 → SPI → Delayed). 7 of 109 CAPEX projects have a value; all 23
  "Delayed" projects are at 0%. WBS roll-up exists (`project_task_rollup`) but `project_tasks` is empty.
- Updates (`comments`) is the natural home for a PM's answer (per project, PM may post on assigned projects,
  read tracking, audited), but it is almost unused (2 comments) and **the Projects Excel import deletes every
  project, and comments cascade** — a comment cannot be the only record.
- A PMO post on Updates already **emails and pushes the PM automatically** (deployed `notify-comment` v11,
  called by the browser). The rule "PMs are never emailed automatically" is therefore not fully true today.
- No webhooks exist (all 19 edge functions `verify_jwt = true`); no realtime (pages poll every 30-120 s);
  pg_cron + pg_net + Vault are in place; push (`send-push`) and email (`mail()` in `epdd-sync/notify.ts`)
  are reusable.
- The 7 Oct deliverables plan (`deliverable-checkin.md`) **rejected** a request table + overview page and an
  "Ask PM for update" button, and preferred one list over all of a PM's projects. This plan reintroduces a
  request button by explicit request; it adds no new page and can absorb the weekly check-in later.

## Recommendation

Two separate choices:

1. **Messaging service: Meta WhatsApp Cloud API, direct**, from our own Supabase edge functions, on a **new
   dedicated SIM** in a Riphah-owned Meta business portfolio. No monthly platform fee, no third party holding
   PM data, signed webhooks, full Flow support. **Fallback: Twilio** (same design, +USD 0.005 per message
   each way). 360dialog only if the PMO insists on keeping an existing WhatsApp number (coexistence).
   n8n / Make add a second place for secrets and a bill without adding capability. Unofficial WhatsApp Web
   automation is rejected (Terms of Service forbid automated / bulk use; bans; needs an always-on server).
2. **Response experience, all bound to one request id:**
   - **Now (proof and pilot): guided chat inside WhatsApp.** Template with 3 quick replies
     (Send update / No change / Call me), then reply buttons for status, one typed %, optional finish date
     and note, Submit. Works **without** business verification and on WhatsApp Desktop.
   - **Target: a static WhatsApp Flow** (one pre-filled form, no endpoint) once Riphah's business is
     verified. Flows **require a verified business** and **do not open on WhatsApp Web/Desktop**, so chat
     stays as the fallback.
   - **Last resort:** a link to the project in the portal (normal sign-in; magic links were rejected).

Start Meta business verification on day 1: it is the longest external wait and gates the Flow.

## Architecture

```
PMO browser (PMO JWT)                          Supabase (prmxkecomqqngvrmytcj)
[Request update] -> preview -> Send ---------> wa-send (verify_jwt=true; is_pmo; opt-in; one open request)
      ^                                          | rpc create_update_request  -> update_requests row
      | polling 30-60 s (no realtime)            | Graph API template (token from Vault getter)
      |                                          v
update_requests, comments (Updates),     Meta Cloud API ---> PM's phone (taps / Flow)
activity_log, notifications_log, wa_events      |  webhooks (statuses, replies), X-Hub-Signature-256
      ^                                          v
      +---- rpc record_update_response <--- wa-webhook (verify_jwt=FALSE; HMAC check; dedupe; bind;
            (service role, one transaction)               validate) -> push PMO, receipt to PM
```

- **Reused:** `push()` / `send-push`, `notifications_log`, `log_activity`, `comments` + `comment_reads`
  (badge, Inbox), `project_assignments`, `user_profiles.phone` / `whatsapp_opt_in`, the Vault-getter and
  deploy-from-commit patterns.
- **New:** tables `update_requests` and `wa_events`, a few columns, 5 RPCs, a log view, 2 edge functions
  (`wa-send`, `wa-webhook`) with a shared pure module (`supabase/functions/wa/`: graph, verify, message
  renderer shared with the portal preview, parser) and **committed offline tests**; UI on the project's
  Person Responsible card and the Updates compose row (no new nav page); optional cron job 3 (sweep).

### Binding a reply to the right request (never by typed project name or phone alone)

1. Flow: `response_json.flow_token` = the request's random 128-bit token (single use).
2. Button tap: `context.id` = the wamid of the message we sent for that request (or its step messages).
3. Typed text (%, date, note): only while that sender has exactly one active step opened by 1 or 2.
4. Sender's `wa_id` must equal the request's recipient; user still active and opted in.
5. Free text with no active step: reply with a list "Which request is this about?" of their open requests.
6. At most one open request per project (partial unique index); a PM may have several (one per project).
7. No foreign key to `projects` (import replaces ids): keep code/name snapshots; Accept disabled if the
   project id vanished.

### Request states

`requested` → `accepted` (Meta returned a wamid) → `sent` → `delivered` → `read` (each timestamped, never
moving backwards) → `responding` / `needs_fix` → `recorded` (answer validated, stored, receipt sent).
Terminal: `recorded`, `failed` (plain reason, Retry), `expired` (default 3 days; late replies still recorded
and labelled), `cancelled` (PMO, superseded, or STOP). Separately, `review_state` for a reported %:
`pending` → `accepted` / `declined` / `superseded` / `not_applicable`.

### Reliability (handling → test)

| Case | Handling |
|---|---|
| Double click / two tabs | client key per dialog + one open request per project |
| Duplicate webhooks (Meta retries up to 7 days) | unique dedupe key per event, single-use flow token |
| Out-of-order statuses | precedence, timestamps per step, re-apply early events |
| Invalid % | 0-100 whole number; clear message; 3 tries then stop; big jumps flagged, not blocked |
| Incomplete / abandoned | Flow requires fields; chat step expires after 30 min idle, no automatic nudge |
| Expired / late | still recorded, labelled "late"; replies to cancelled requests go to the PMO only |
| Newer portal update | Accept shows "official % changed since request" and needs a second confirm |
| Graph error / Supabase down | "Not sent: try again" (no silent resend); Meta retries webhooks; record before receipt |
| Free text, photo, voice | list of open requests; media acknowledged, not stored in v1 |
| Unknown sender | one generic reply per 24 h, no project data; STOP always honoured |
| Portal closed | pipeline is server-side; visible on next poll/load; push still arrives |
| Redeploy resets `verify_jwt` | deploy checklist + health push if open requests but no webhook for 6 h |

### Security and operations

- Sends: `wa-send` checks the caller is PMO (same pattern as `send-welcome-email`); RLS on new tables
  (`update_requests`: PMO or the PM themself; `wa_events`: PMO only); grants per the 30 Oct rule.
- Webhook: GET verify-token handshake; POST HMAC-SHA256 of the raw body with the app secret, constant-time
  compare, 401 and nothing stored on mismatch; only our phone-number id.
- Secrets: app secret and verify token as edge-function secrets; system-user token in Vault behind a
  service-role-only getter. Nothing in the public repo.
- Consent: send only when opted in; opt-in records method (self / PMO-recorded) and names "Riphah PMO";
  STOP sets opt-out and cancels open requests.
- Privacy: recommend phone numbers readable only by the PMO and the person themself before the pilot.
- Audit: request created (PMO), response recorded (PM), Accept (PMO, old → new %) in the Activity Log.
- Retention: Meta keeps message data up to 30 days; `update_requests` kept; raw `wa_events` 180 days.
- Visibility: a "WhatsApp requests" filter in the Updates Inbox with state, times, errors; PMO push on a
  failed send, a paused/re-categorised template, or a silent webhook.

## The form and portal experience

- **Request update** (PMO): on the project's Person Responsible card and next to each opted-in PM on
  Updates. Dialog: PM (masked number, opt-in date), project (stage, official %, planned finish), reply-by
  (1/3/7 days, default 3), exact preview of the WhatsApp message, Send. Disabled with the reason when not
  opted in, no number, inactive, a request already open (Remind / Cancel), or the feature is off. After Send
  a status chip: Requested → Sent → Delivered → Read → Replied (or "Not sent: reason").
- **Template draft** `pmo_update_request_v1` (language en, submitted as Utility; Meta decides):
  "Hello {{1}}, the PMO has asked for a progress update on your assigned project {{2}}: {{3}}. Last recorded
  progress is {{4}} and the planned finish is {{5}}. Please reply by {{6}} using the buttons below. It takes
  about a minute." Footer "Reply STOP to stop these messages". Buttons: Send update · No change · Call me.
- **Fields** (mapped to what exists): Status (On track / At risk / Delayed) — required, shown in the post,
  never written to the schedule flag; % complete — required only at stage Approved, stored as *reported*,
  written to `pct_complete` only by the PMO's Accept; Expected finish — optional, shown against the planned
  end, never written (there is no revised-end column); Note / blockers — optional, 600 characters;
  "I need the PMO to call me" — optional.
- **Receipt to the PM:** "Recorded for <code> at 10:42: At risk, 60%, expected finish 30 Nov 2026. The PMO
  has been told."
- **Where it shows:** the PM's post in the project's Updates thread marked "via WhatsApp" (unread badge,
  Inbox); on the project page (PMO only) "PM reports 60% · 12 Oct · via WhatsApp (official 45%)
  [Accept] [Keep]"; dashboard figures change only after Accept; Activity Log shows each step.

## "Real time", honestly

Targets for what we control, to be measured in the proof: PMO click → Meta accepted ≤ 3 s (p95); webhook →
stored and 200 ≤ Meta's median 250 ms standard (to measure: cold starts); PM taps Submit → recorded and
receipt sent ≤ 5 s (p95); visible in the portal within ~30-60 s by polling (dashboard on reload, after
Accept). Outside our control: delivery to the phone, Meta's webhook latency (no SLA found), the PM's reply
time, template review (up to 24 h), business verification (unverified; reportedly up to ~2 weeks).

## Live proof, pilot, production

**Live proof (test number, no frontend deploy to main):** the PMO presses Request update from a local
build signed in as PMO; a staff test phone (temporarily on a test project) completes the chat.
Evidence required (simulated webhooks don't count): screen recording on the real phone; `update_requests`
timestamps each matched to a signature-verified `wa_events` row from Meta; the button event whose
`context.id` equals the request's wamid; the recorded Updates post (source whatsapp, author = test PM);
production Updates screenshot and the PMO's push on a real device; the receipt on the phone; Activity Log
rows; replayed signed payload → 0 new posts; unsigned POST → 401; only `wa-webhook` has
`verify_jwt = false`; `get_advisors` clean; measured latencies. Test rows removed and counts confirmed.
Stage A in an open 24 h window (same day), stage B with the approved template, optional stage C draft Flow.
The Meta app must be in **Live mode** (needs a privacy-policy URL) or some webhooks are not sent.

**Pilot (2-3 weeks, 2-3 opted-in PMs, UI on /preview/):** dedicated number registered (2-step PIN), USD
payment method, approved template; one real-phone test per reliability case above; ≥ 15 real requests,
0 mis-bound, 0 duplicate posts, median tap → recorded < 5 s; PMO sign-off phone/desktop, light/dark.

**Production:** promote via `./build.sh`, enable for opted-in PMs; Flow upgrade after verification.
Rollback, lightest first: `settings.whatsapp.enabled = false` → redeploy previous function stubs → previous
frontend commit → pause the template → unsubscribe the webhook. Tables stay; no DROP needed.

## Options compared

| | Meta direct (rec.) | Twilio (fallback) | 360dialog | n8n / Make | Unofficial |
|---|---|---|---|---|---|
| Setup (engineering) | 3-4 days proof | similar + Twilio onboarding | similar | quick to prototype, slow to secure | n/a |
| Monthly fee | none | none | EUR 49 per number | n8n Cloud from EUR 20 (annual billing); Make unverified | server + ban risk |
| Per message | Meta rates only | +USD 0.005 each way, +0.001 failed | Meta rates (+7% marketing via std endpoint) | Meta rates | — |
| Flow pre-fill | documented | not documented for first screen | passes Meta JSON | via HTTP calls | no |
| Webhook security | X-Hub-Signature-256 | X-Twilio-Signature (HMAC-SHA1) | Basic Auth headers documented | their own | none |
| Fit with our stack | best (edge functions, Vault, RLS) | good | good | poor (secrets and DB access outside Supabase) | rejected |

Response experiences: **Flow** (in WhatsApp, best form, needs verification, mobile only) · **guided chat**
(in WhatsApp, works now and on desktop, a few more taps) · **portal form** (leaves WhatsApp, sign-in
friction: PMs have 0 mobile sessions) · **wa.me link** (manual, one-way; keep as the fallback for PMs who
have not opted in).

## Costs (verified 13 Oct 2026; Meta bills in USD, not PKR)

- Meta, Pakistan, per delivered message, effective 1 Oct 2026: **utility USD 0.015, marketing 0.0473,
  service 0.015**; replies from PMs free; service messages free for the first 1,000 per number per month
  (from 1 Oct 2026); utility templates inside an open window are now charged.
- Examples: one request per PM per week (13 × 4.33 = 56/month) ≈ USD 0.84 as utility, 2.65 as marketing;
  every approved project weekly (~130/month) ≈ USD 1.95 / 6.15. Chat steps (~5-6 per answer) stay inside
  the free 1,000. **Expect under USD 10 a month in every scenario.**
- Twilio would add ~USD 3-9/month at these volumes; 360dialog EUR 49/month; Supabase stays on Free.
- Not researched: SIM cost; business verification has no Meta fee found.

## Dependencies and owners

| Item | Owner | Blocks |
|---|---|---|
| Person with admin rights to a Riphah-owned Meta business portfolio (two admins) | University / PMO | everything |
| Meta app, test number, system user, webhook subscription, Live mode + privacy-policy URL | University Meta admin, guided | live proof |
| Business verification (legal documents) | University; Meta reviews | Flow, higher limits |
| Dedicated SIM not on WhatsApp + 2-step PIN | University IT / PMO | pilot |
| USD payment method on Meta Billing Hub | Finance | pilot |
| Policy OK to message staff phones; PM opt-ins | University / PMO / PMs | pilot |
| Template review (≤ 24 h, category decided by Meta) | Meta | stage B onwards |
| Migration shown and approved; deploys | PMO approval; engineer | proof |

## Milestones and effort (engineering vs waiting)

| | Deliverable | Engineering | Waiting |
|---|---|---|---|
| M0 | decisions, Meta setup, verification started | 0.5 day (guide, opt-in text) | finding the Meta admin; 1-2 h of clicks |
| M1 | live proof on the test number (evidence checklist) | 3-4 days | template review ≤ 24 h (stage B) |
| M2 | pilot with 2-3 PMs on /preview/ | 4-6 days | number, payment method, opt-ins, 2-3 week run |
| M3 | Flow upgrade (optional) | 2-3 days | business verification (unverified duration) |
| M4 | production | 1-2 days | PMO review |

## What would change the recommendation

No USD card → Twilio or a PKR-billing local provider (loses read receipts/Flows); must keep an existing
number → provider coexistence (Pakistan eligibility unverified; 20 msg/s, broadcast lists off, disconnect
after ~14 days of phone inactivity); template forced to Marketing and blocked → rewrite + category review,
or send only in open windows; PMs won't opt in or policy forbids staff phones → email + portal (parked
check-in); verification fast → Flow becomes primary from the pilot.

## Not verified

Test-number recipient cap (third parties say ~5); business verification duration; coexistence for Pakistan;
the template's category; whether an endpoint-less Flow still needs a signed public key on the number; the
government/non-profit service-message exemption for a private university; Make pricing (page returned 403);
360dialog USD price; the pair rate limit figures.

## Sources (read 13 Oct 2026)

- Pricing (updated 30 Sep 2026) and the USD rate card effective 1 Oct 2026:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Template categories: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- Template review (≤ 24 h): https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review
- Template components / desktop viewing: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
- Test resources: https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- Phone numbers: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
- Messaging limits (250 unverified): https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Coexistence: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in ; policy https://whatsappbusiness.com/policy/
- Flows (sending, best practices, client support): https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow ,
  .../flows/guides/bestpractices , .../flows/guides
- Webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview ,
  .../webhooks/create-webhook-endpoint , button context .../webhooks/reference/messages/button
- Throughput: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput
- App review not needed first-party: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review
- WhatsApp Terms: https://www.whatsapp.com/legal/terms-of-service
- Twilio: https://www.twilio.com/docs/whatsapp/sandbox , https://www.twilio.com/en-us/whatsapp/pricing ,
  https://www.twilio.com/docs/content/whatsapp-flows
- 360dialog: https://360dialog.com/pricing ; n8n: https://n8n.io/pricing/ ; Supabase: https://supabase.com/pricing
