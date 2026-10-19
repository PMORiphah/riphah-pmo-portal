# PMO Simulation (live portal data)

The simulation presents the real portal on the portal's **current data**, read-only, in an isolated
tab (`simulation.html`). There is no fictional dataset and no sample mode: when the data cannot
support a scene, the narration says so or the scene is skipped with a note on the Begin screen.
Approved plan: `docs/plans/pmo-simulation-live.md` (PMO, 16 Oct 2026).

**This repo is public.** No real person, project or campus name, figure, email, phone number,
message text, token or key may appear in any file here (code, tests, fixtures, docs). Subjects are
chosen by rules at launch from the snapshot. The one allowed exception is
`src/sim/live/say-campus.json`: campus id → spoken form, for the voice only.

## How a run works

1. **Portal tab** (PMO only, desktop, preview build only: `SIM_ENABLED` in `src/App.jsx`). The
   sidebar's Simulation button opens `src/SimLauncher.jsx`. It reads the data with the PMO's own
   session (GET `/rest/v1/*` only, `src/sim/live/snapshot.js`), shows the plan the rules chose (with
   in-memory overrides), the generated lines, the detected test accounts and the Gallery items
   (all sent by default; a per-launch "leave out" list, held in memory).
2. **Start** opens `simulation.html` (noopener) and hands over one validated, fingerprinted snapshot
   plus re-encoded media over a one-time BroadcastChannel (`src/simBridge.js`, protocol v2). The
   portal tab keeps a refresh listener until sign-out (`stopAll()`), 6 h or 20 refreshes.
3. **Simulation tab** (`public/sim-boot.js` first: storage and channel namespacing, guards, CSP
   `connect-src 'self'`). It has no token and makes no request to the database. It validates the
   hand-over (`src/sim/live/validate.js`, `canon.js`), serves the portal's requests from the
   snapshot (`src/sim/backend.js`, live mode; writes stay in memory), builds the narration
   (`src/sim/live/select.js`, `lines.js`, `build.js`, `say.js`, `format.js`, `timing.js`),
   rehearses silently to check every figure against the screen, then runs the director
   (`src/sim/SimRoot.jsx`, `src/sim/scenes.js`, `src/sim/director/*`).

The director finds portal elements only by `data-*` attributes (`data-tour`, `data-col`, `data-kpi`,
…). They change nothing for normal users. `scripts/sim/live/hooks.test.mjs` checks that each one
the scenes rely on is present.

Badge: "Live portal data as of HH:MM PKT · read-only · nothing is sent". Contact details in user
profiles are masked in the snapshot; downloads and the page's own print are blocked.

## Files

| Path | What it is |
|---|---|
| `src/sim/live/schema.js`, `requests.js` | Allow-list of tables and columns; the recorded requests. |
| `src/sim/live/snapshot.js` | Portal side: reads, masks and trims the snapshot; plan; invariants. |
| `src/sim/live/canon.js`, `validate.js` | Canonical form and fingerprint; validation (both tabs). |
| `src/sim/live/select.js` … `timing.js` | Plan rules and narration (pure; Node and both tabs). |
| `src/sim/live/say-campus.json` | Campus id → spoken form (voice only). |
| `src/sim/handoff.js`, `index.js`, `backend.js`, `session.js`, `boot/*` | Simulation tab: receive, start, serve, guards. |
| `src/sim/SimRoot.jsx`, `scenes.js`, `director/*`, `live/preflight.js` | Director, scenes, rehearsal. |
| `public/sim-boot.js`, `public/sim/fonts/` | Boot script and self-hosted fonts of `simulation.html`. |
| `scripts/sim/make-sim-html.mjs` | Writes `simulation.html` from the built page (`build.sh`). |
| `scripts/sim/privacy-scan.mjs` | Fails if a real name, email or phone appears in the given paths. |
| `scripts/sim/live/*.test.mjs` | Unit tests (below). |

## Tests

Each test runs on its own and exits 0 on success:

```sh
node scripts/sim/live/<name>.test.mjs                    # public checks (invented data only)
SIM_FIXTURE=<private dir> node scripts/sim/live/<name>.test.mjs   # adds the checks on captured data
```

`SIM_FIXTURE` points at a private folder **outside the repo** that holds a read-only capture of the
portal's data (`fixture-tables.json`, `fixture-responses.json`, `fixture-rpc.json`,
`fixture-expect.json`). Without it, tests that need it print `SKIP` and exit 0. Never copy those
files into the repo; `.gitignore` also excludes `private/`, `*.local.json`, `*resolved*.json` and
`real-names*`.

| Test | What it checks | With `SIM_FIXTURE` |
|---|---|---|
| `scripts/sim/live/snapshot.test.mjs` | Portal-side snapshot read: masking, allowed columns, recorded requests, invariants, left-out and failed media, retries | adds the run over the captured data (required for most checks) |
| `scripts/sim/live/bridge.test.mjs` | Portal side of the hand-over (protocol v2, `src/simBridge.js`) against a fake simulation tab on a real BroadcastChannel; refresh listener; `bye` | adds the full launch and refresh over the captured data |
| `scripts/sim/live/canon.test.mjs` | Canonical JSON, SHA-256 and the snapshot code | not used |
| `scripts/sim/live/validate.test.mjs` | Hand-over validator, fuzzed (unknown tables/columns, secrets, masks, sizes, fingerprint, freshness) | adds validation of the captured snapshot |
| `scripts/sim/live/handoff.test.mjs` | Simulation side of the hand-over (`src/sim/handoff.js`): order, refusals, timeouts, refresh | adds a real `launch()` → receive → refresh round trip |
| `scripts/sim/backend-test.mjs` | Synthetic backend in live mode (`src/sim/backend.js`) and session: replay, engine order, refused writes, storage, functions, auth | adds byte-for-byte replay of every recorded response |
| `scripts/sim/live/select.test.mjs` | Scene-subject rules (`select.js`) and launcher overrides | adds the plan of the capture against its expected plan |
| `scripts/sim/live/narration.test.mjs` | Generated lines, variants, timing and compaction (`lines.js`, `build.js`, `timing.js`) | adds the approved lines of the capture, word for word |
| `scripts/sim/live/say.test.mjs` | Speech normaliser (`say.js`) | not used |
| `scripts/sim/live/format.test.mjs` | `format.js` prints exactly what the App's own formatters print | not used |
| `scripts/sim/live/engine.test.mjs` | Director engine without a browser: holds, anchors, governor, fallbacks, skips | adds the scenes built from the capture |
| `scripts/sim/live/guard.test.mjs` | Director action allow-list (`director/guard.js`) | not used |
| `scripts/sim/live/actions-test.mjs` | Every acting step of every scene is covered by `allowed-actions.json`; guard lists equal the file | adds the scenes of the capture |
| `scripts/sim/live/hooks.test.mjs` | Every `data-*` hook the director relies on is in the portal source; removed fictional-data branches stay removed | not used |

`scripts/sim/live/synthetic.mjs`, `b2-support.mjs` and `minidom.mjs` are shared helpers (invented
data, a test snapshot builder and a small DOM), not tests. Run them all:

```sh
for t in scripts/sim/live/*.test.mjs scripts/sim/live/actions-test.mjs scripts/sim/backend-test.mjs; do
  SIM_FIXTURE=<private dir> node "$t" || echo "FAILED: $t"
done
```

Any headless run against production data must abort every database request except reads
(GET `/rest/v1/*`), sign-in/refresh, `resolve_login_email`, `project_has_deliverables` and storage
sign requests, and log each aborted request.

## Before every simulation commit

```sh
node scripts/sim/privacy-scan.mjs <private real-names file> <private cast file>
node scripts/sim/privacy-scan.mjs <private real-names file> <private cast file> --campuses --sim-only
```

Both must pass. The names files are private (scratch only). The scan prints file:line and an index,
never the name itself, so its output is safe to paste.

Build the preview with `./build.sh --config vite.config.preview.js`, then `git checkout -- index.html`
(`build.sh` overwrites the root `index.html`). The production build has no Simulation button.
