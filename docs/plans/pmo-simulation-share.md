# Sharing a PMO-created simulation with guests

PMO request, 19 Oct 2026: after creating the simulation, the PMO selects users (guests only). They get a Simulation button when they sign in, receive the simulation with the PMO's choices, and one click starts it automatically.

Status: built on the feature branch and tested headless with every database and storage write fulfilled locally. **Not deployed. The migration `supabase/migrations/20261019_sim_shares.sql` has not been run** and waits for the PMO's approval. People are named by role only in this file.

## What is shared

- **The PMO's frozen copy.** It holds the data and every launcher choice: left-out photos and videos, test accounts, spoken names. It is dated "Portal data as of <day, time> PKT · shared by the PMO".
- Guests do not get a fresh read of their own:
  - Under a guest's own account, row-level security empties several screens the simulation shows (Past Projects, Monthly Report drafts, PMO Review counts, the last Activity time).
  - A server-side re-read would bypass row-level security and could drift from what the PMO approved.

## What guests can see

**Decision for the PMO (decision 1):**
- Selected guests see the PMO's view inside the simulation, including parts that are PMO-only in the portal:
  - every past project, with its notes;
  - the Monthly Report list, including drafts, and the figures of the report the simulation opens;
  - PMO Review counts;
  - other users' read markers.
- While the share is active they can also read the data file behind it with the browser's developer tools.
- Contact details stay masked.
- A copy a guest has already opened cannot be recalled.
- The launcher asks the PMO to tick a box listing this each time they share.

## How it works

**PMO (launcher, "Shared with senior management"):**
- Share this simulation with ticked active guests. Test accounts are listed separately and left unticked.
- Choose the voice: on, or captions only.
- The copy is valid for 7 days.
- Other controls: Add guests, Remove, Stop sharing, Replace with today's data, and Play the shared copy as a self-check.

**Storage:**
- Files go in the private bucket `sim-shares` under `<share id>/`: the snapshot JSON and the re-encoded media, checked by SHA-256 on the way back.
- Rows go in `sim_shares` and `sim_share_recipients`.
- The PMO's choices are saved in the PMO-only setting `simulation_share`.

**Guest on a computer** (mouse, a screen of at least 1280×720, a window of at least 1200×540):
- A Simulation button sits in the sidebar, and a one-time pop-up offers Play now or Later.
- The click shows a progress panel in the portal and opens the simulation in its own tab.
- The tab shows a start screen with a 5-second countdown, and the simulation starts by itself.
- Voice plays where the browser allows it. Otherwise it plays with captions and "Click anywhere for voice".
- There is no Refresh. Exit closes the tab.

**Guest on a phone or a small screen:** a one-time notice that it plays on a computer.

**Each site has its own share.** /preview/ and production use the same database, so each share belongs to the site it was made on.

**The share stops playing on its own:**
- after a portal update: the guest sees "being updated" and the PMO's launcher says "Re-share after the portal update";
- after 7 days;
- when the PMO stops or replaces it.

**Revoking:**
- New downloads are refused at once by row-level security.
- The guest's button goes within 2 minutes.
- Files are removed when the share is stopped, replaced or expires.

**No email or push.**

## Database change (to be shown before it runs)

- **Tables:** `sim_shares` and `sim_share_recipients`. Both have RLS with policies for signed-in users only:
  - the PMO reads and writes;
  - a recipient reads only an active, unexpired share they receive, and their own recipient row.
- **Trigger guards:**
  - a share cannot change after it leaves "uploading";
  - recipients must be active guests;
  - a recipient may only stamp seen, opened and started.
- **Functions:**
  - `sim_share_activate`: replaces the same site's active share and adds the recipients;
  - `is_sim_recipient` and `can_read_sim_file`: security definer, not executable by anon;
  - `sim_share_cleanup_ready`.
- **Storage:** private bucket `sim-shares` (50 MB per file), with three PMO-or-recipient policies on `storage.objects`. The PMO's removal policy is written as FOR ALL, PMO only.
- **Grants:** per the CLAUDE.md rule.
- **Activity Log:** triggers record shares and recipients. Bookkeeping columns are skipped.
- **Safety:** no DROP and no DELETE statement anywhere.

## Verified (headless, writes fulfilled locally, never sent)

- **Share and play:** 78/78 checks at 1366×768 and 75/75 at 1920×1080:
  - upload of 79 media files plus the snapshot, each file's size and SHA-256 checked;
  - the PMO's "Play the shared copy" and a simulated guest's run: 21/21 scenes and all figure checks each, about 139 s, no click inside the tab;
  - phone notice, build mismatch, expiry, stop sharing and a stale click.
- **PMO live path unchanged:** 139.28 s, 21/21 scenes, 23/23 controls.
- 16 unit suites pass, and the privacy scan passes.

**Not verified:**
- the real database (RLS and Storage status codes);
- real voices and whether the click carries over to the new tab on Windows with Chrome or Edge (headless Chromium did not carry it);
- a real Guest account.

## Next steps, after approval

1. Apply the migration, run `get_advisors`, then run read-only SQL access checks as the PMO, a recipient guest, a non-recipient guest, a project manager and anon.
2. Deploy to /preview/ and test with the Guest test account.
3. The PMO reviews on a Windows laptop (Chrome or Edge).
4. Production.
