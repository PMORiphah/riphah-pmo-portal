# Test report

Last full run: `node portfolio-demo/tests/run.mjs`, 2 Nov 2026, on the final build (5.9 MB).

## Privacy scan (runs inside every build; any match deletes the output and fails the build)

```
privacy scan: 9 patterns, e-mail domains, 1186 name/figure fingerprints, 20 unit-code fingerprints
dist/index.html: 5.90 MB, 0 matches
PASS: nothing from the real deployment found
```

What it checks:
- **9 patterns:**
  - the organisation's name;
  - the real backend address and keys (JWT);
  - the real site and e-mail domain;
  - cloud storage;
  - AI keys;
  - real site codes;
  - the real proposal system's name;
  - the real portal's own image files.
- **E-mail addresses:** any address outside the reserved example domains.
- **1,186 fingerprints** (SHA-256, one-way) of real names, places, project titles, codes and figures. They are built from a private list of 1,192 entries kept outside the repository.
- **20 real unit codes**, compared with their exact case.
- **Images:** every embedded image must be one the demo generated.
- **Embedded files:** the text inside every PDF and spreadsheet is scanned too.

## Suites

```
PASS  lock: 8 pass, 0 fail
PASS  roles: 32 pages, 0 with problems
PASS  phone: 119 pass, 0 fail
PASS  entry: 37 pass, 0 fail
PASS  writes: 32 pass, 0 fail
PASS  extras: 8 pass, 0 fail
PASS  totals: 28 pass, 0 fail
PASS  mine: 27 pass, 0 fail
PASS  tour (from pmo): 24 pass, 0 fail
PASS  tour (from project_manager): 24 pass, 0 fail
PASS  tour (from guest): 24 pass, 0 fail
PASS  analytics: 23 pass, 0 fail
PASS  request log: nothing but the demo, analytics (in its test) and the visitor's own Upwork click: clean

ALL PASSED
```

| Suite | What it proves |
|---|---|
| lock | Starts only at its Vercel address (and preview addresses, localhost); elsewhere or framed, only the notice; the file carries its Content-Security-Policy |
| roles | Every page each role can open renders with no console errors and no outside requests |
| phone | 390 px, every page per role and every project tab: no sideways scrolling, no errors |
| entry | Start screen, role choice, demo bar, role switch, reset, sign-out, tour button, link guard; desktop and phone, light and dark |
| writes | Edits, Activity Log, views updating, role rules (PM / senior management), saving across reloads, uploads, reset |
| extras | Welcome e-mail window, opening a document, Excel export, assistant panel |
| totals | Dashboard, investments, cash flows, inventory, payments, assistant and the September board report equal the sums of the fictional data, recomputed independently |
| mine | Make it yours: name, logo, colours, currency (USD / GBP / AED / PKR conversions checked against the data), words, upload, reset, defaults |
| tour (×3) | The full tour, started as each role: 29 steps, 9 chapters, contents, back, pause, exit and resume, free exploration after leaving, the call to action |
| analytics | Events, anonymous ids and payloads, sent only to PostHog's EU endpoint (answered by the test) |

## Request log (every address any test page asked for)

```
      75  localhost (the demo itself)  [GET] from lock, roles, phone, entry, writes, extras, totals, mine, tour, analytics
      15  eu.i.posthog.com  [POST] from analytics
       8  resources  [GET] from extras
       7  mhjfbmdgcfjbbpaeojofohoefgiehjai  [GET] from extras
       4  www.upwork.com  [GET] from analytics
       2  capital-projects-portal-demo.vercel.app  [GET] from lock
       1  capital-projects-portal-demo-git-main-someone.vercel.app  [GET] from lock
       1  copy-of-the-demo.example  [GET] from lock
       1  capital-projects-portal-demo.vercel.app.attacker.example  [GET] from lock
       1  host.example  [GET] from lock
```

What is in that log:
- `localhost`: the demo itself.
- `eu.i.posthog.com`: the analytics test only.
- `www.upwork.com`: the call-to-action clicked in the analytics test.
- `resources` and the long id: Chrome's built-in PDF viewer.
- The `*.example` and `vercel.app` addresses: answered by the lock test itself; nothing was fetched from them.

The full log is written to `tests/out/requests.log` on every run.
