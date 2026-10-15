# PMO Simulation data

The simulation runs the real portal on a generated, fictional dataset. Only four things are real
(PMO decision 2a, 14 Oct 2026): campus and site names, project managers' names, the PMO team's names,
and the Gallery photos and videos the PMO approves. Everything else is invented.

**This repo is public.** No real person's name, real project name, email, phone number, token or key
may appear in any file here. Real names exist only at run time: the PMO's signed-in portal tab reads
them and hands them to the simulation tab (see `docs/plans/pmo-simulation-2min.md` §5a).

## Files

| File | What it is |
|---|---|
| `scripts/sim/gen.mjs` | Generates the dataset, the narration and the files; runs the checks. Deterministic. |
| `scripts/sim/assets.mjs` | Writes the documents (PDF, BOQ workbook, floor plan) and the sample-mode illustrations. |
| `scripts/sim/privacy-scan.mjs` | Fails if a real name from a private names file appears in the given paths. |
| `src/sim/data/seed.json` | Generated. Tables and views the synthetic backend serves, plus `meta` for the director. |
| `src/sim/data/narration.json` | Generated. 23 lines in 20 scenes and 6 chapters, with short (governor) lines. |
| `src/sim/data/sample-media.json` | Generated. The illustrations used by "Run with sample names". |
| `src/sim/data/pins.json` | Hand-kept. Production row ids for each slot (no names). |
| `src/sim/data/sample-cast.json` | Hand-kept. Invented names for every slot (tests and sample mode). |
| `src/sim/data/speech.json` | Hand-kept. Public respellings of campus names for the voice. |
| `src/sim/data/tokens.js` | `resolveTokens`, `buildMediaRows`, short-name rules. Pure, browser and Node. |
| `src/sim/data/cast.js` | `buildCast` (portal side: live rows + pins -> cast), `castCode`. No seed import. |
| `src/sim/data/index.js` | What the simulation imports: `SEED`, `NARRATION`, `NARRATION_META`, `PINS`, `SAMPLE_CAST`, `SAMPLE_MEDIA` and the helpers. |
| `public/sim/files/` | Generated. `<project_id>/<attachment_id>.<ext>` documents and `sample-media/sNN.jpg`. Served at `BASE_URL + "sim/files/" + file_path`. |

## Slot tokens

Names stand as tokens in the public data and are replaced at run time by `resolveTokens(obj, cast)`,
which throws on a missing slot or a leftover token:

- `{{C:C01}}` campus name, `{{C:C01:say}}` its spoken form, `{{E:C01}}` its E-PDD spelling
- `{{P:P12}}` project manager's name, `{{P:P12:short}}` short form, `{{P:P12:say}}` spoken short form
- `{{T:head_pmo}}` PMO team member (`head_pmo manager_pmo deputy_pmo exec_pmo po1 po2`)

Slots are numbered by the alphabetical order of the real names on the pinning date, so a sort on tokens
gives the same order as a sort on real names. At run time each slot is resolved through the production
id pinned in `pins.json`, never re-derived from live counts. A pin that no longer resolves locks the run.

Cast shape: `{ v:1, campuses:{ C01:{ name, say, epdd } }, pms:{ P01:{ name, short, say, role } }, team:{ head_pmo:{ name } } }`.

## Rules for real people (checked by gen.mjs)

- Delays, a planned finish passed, over-budget, "No progress", high risks and chases sit only on the
  story project (its project manager agreed beforehand) or on projects without a PM, which exist only
  where production has them. Only the story risk names a person as its owner; every other risk is owned
  by the PMO. No other manager has an open past project over a year old.
- The Gallery host projects carry no risk.
- Only the story PM is quoted (two replies in Updates, one in Past Projects); every other message is
  from "Project Management Office".
- No real person is shown inactive; the one inactive account is "Training Account (retired)".
- No critical risk; no clinical or safety-failure wording.
- Real-named accounts have invented usernames (`sim.*`), `@simulation.example` emails, no phone and no
  sessions, devices or notifications. Other senior-management guests are "Senior management viewer N".
- The story project carries no real media and resembles no real project at its campus. Real media are
  shown on generic hosts ("Campus Works Package A" ...) at the same real campus, with fictional dates.
- Fictional project names are checked against every real project, past-project and carry-forward name
  (no pair at 60% or more).

## Running

```sh
node scripts/sim/gen.mjs                 # all public checks; rewrites the data and files
node scripts/sim/gen.mjs --no-assets     # data only (only if no id changed)
SIM_PRIVATE=<scratch dir> node scripts/sim/gen.mjs   # adds the checks that need the real cast
node scripts/sim/privacy-scan.mjs <private names file> [--paths ...] [--exclude ...] [--campuses]
```

`SIM_PRIVATE` points at a scratch folder outside the repo holding `cast.local.json` (the real cast with
each PM's real project counts), `media.local.json` (`{items:[{key, project_id, mime, size, order}]}`)
and `real-names.local.json` (`{names:[...]}`, read-only SELECT of real project names). These files
never enter the repo; `.gitignore` excludes `private/`, `*.local.json`, `*resolved*.json` and
`real-names*`. Playwright is needed for the images: `SIM_PLAYWRIGHT=<path to playwright's index.js>`.

Run the generator twice before committing; the outputs must be byte-identical. Run the privacy scan
with the real names before every simulation commit.
