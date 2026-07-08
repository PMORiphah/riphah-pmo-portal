# Riphah PMO Portal — Source Code Guide

This repo serves **two purposes** from the `main` branch:
1. **GitHub Pages site** (built files at repo root: `index.html`, `assets/`, `favicon.png`, `campus-bg.jpg`, `404.html`, `.nojekyll`)
2. **Editable source code** (this is what you pull to continue development)

## Source files (real paths)

```
src/App.jsx          ← entire application (~4,600 lines, single file)
src/main.jsx         ← React entry point
index.src.html       ← SOURCE index.html (see note below)
package.json
package-lock.json
vite.config.js       ← base: '/riphah-pmo-portal/'
public/
  ├─ .nojekyll
  ├─ 404.html
  ├─ campus-bg.jpg   ← login page background
  ├─ favicon.png     ← browser tab icon (Riphah crest)
  └─ favicon.svg
```

## ⚠ Why `index.src.html` instead of `index.html`

The root `index.html` **must remain the built version** (it references the hashed
JS bundle in `assets/`) because GitHub Pages serves this repo's root. The source
version (which references `/src/main.jsx`) lives at `index.src.html`.

The ONLY difference between them is one line:
- Source:  `<script type="module" src="/src/main.jsx"></script>` (in body)
- Built:   `<script type="module" crossorigin src="/riphah-pmo-portal/assets/index-XXXX.js">` (in head)

## Local development setup

```bash
# 1. Download source files (via GitHub API or raw URLs)
# 2. Rename index.src.html → index.html
mv index.src.html index.html
# 3. Install and run
npm install
npm run dev          # dev server
npm run build        # outputs to dist/
```

## Deploy procedure (GitHub Contents API)

After `npm run build`, push every file in `dist/` to the repo ROOT
(dist/index.html → index.html, dist/assets/* → assets/*, etc.) using the
Contents API with per-file SHA retrieval. See the deploy script pattern in
the handoff document. **Never push the source index.html to root.**

## Key references
- Live site: https://pmoriphah.github.io/riphah-pmo-portal/
- Supabase project: prmxkecomqqngvrmytcj (Singapore)
- Full architecture/schema/gotchas: see PMO_Portal_Handoff_v2.md (kept with project owner)
