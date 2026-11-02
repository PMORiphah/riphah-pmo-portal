# Capital Projects Portal — public portfolio demo

Agreed with the PMO portal's builder (Abdullah Azhar) on 2 Nov 2026. Permission to reuse the portal's code
for this demo was confirmed by the builder.

## Rules
- Lives only on the `portfolio-demo` branch; never merged. Production, `preview/`, `main` and the
  real Supabase project are not touched or read.
- No organisation name: it opens as "Your Organisation" and the visitor types their own.
- Fictional data only (`data/gen.mjs`, seeded). Never add real names, projects, figures or files.
- The build fails if the privacy scan finds anything from the real deployment (`scan/scan.mjs`).

## Output
One self-contained file, `dist/index.html`, uploaded by the builder to Vercel as
`capital-projects-portal-demo` (address `capital-projects-portal-demo.vercel.app`).

## Protection (agreed: layers 1, 2, 3, 5, 6)
1. Front end only: no database design, access rules, server functions, AI logic or readers.
2. Domain lock to the Vercel address (local test runs allowed).
3. Minified, no source maps, no comments.
5. Watermark: "© 2026 Abdullah Azhar" with the Upwork link (footer, tour end, CTA, exports, lock message).
6. Copyright notice and terms on the entry screen and in the file.
(4. Obfuscation: not used.)

## Content and behaviour
- ~48 CAPEX + 3 investment projects, 8 sites, 8 PMs, guests; full budget funnel; every data type.
- USD default; switch to PKR / GBP / AED at fixed demo rates.
- Every tab in all three roles (PMO admin / Project manager / Senior management); writes saved in the
  visitor's browser; Reset demo; server features show "In your deployment this would…".
- Assistant: canned question types, figures computed by code.
- Guided tour: 9 chapters (what / who / problem / how to customise), pause/back/skip/contents/exit/resume,
  optional voice (off by default), progress; CTA to Upwork.
- "Make it yours": name, logo, colour, currency, terminology, live.
- Analytics: PostHog Cloud (EU), IP discarded, only our anonymous events; privacy line on entry.

## Stages (one release, ~2 weeks)
1. Foundation — DONE 2 Nov 2026: generator, white-label build rules, one-file build, privacy scan
   (fingerprints + approved-images check), offline render with 0 errors and 0 outside requests.
2. Demo backend — DONE: writable, role rules, persistence, reset, demo notes, assistant, missing tables.
3. Entry screen, role switcher, free exploration — DONE.
4. Guided tour — DONE: 9 chapters, 29 steps.
5. "Make it yours" and currency — DONE (USD default; GBP / AED / PKR at fixed demo rates).
6. Analytics — DONE in code (ANALYTICS.md); waiting for the builder's PostHog project key.
7. Tests, screenshots, Vercel / PostHog / `?src=` guides, CLAUDE.md note — DONE (domain lock, CSP, `tests/run.mjs`, `screenshots/`, GUIDE.md); the builder uploads to Vercel.

## Build and test
    node portfolio-demo/build.mjs            # → portfolio-demo/dist/index.html + vercel.json (scan runs automatically)
    DEMO_POSTHOG_KEY=phc_… node portfolio-demo/build.mjs   # with analytics
    node portfolio-demo/tests/run.mjs        # every test + request log
    node portfolio-demo/tests/screens.mjs    # portfolio screenshots → screenshots/
Denylist fingerprints: `node portfolio-demo/scan/make-denylist.mjs <private list outside the repo>`.
