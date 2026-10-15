#!/usr/bin/env node
// PMO Simulation: end-to-end check of the synthetic backend (src/sim/backend.js) in the real App.
//
//   node scripts/sim/backend-test.mjs [--work <dir>] [--no-build] [--real-simroot] [--headed]
//                                     [--playwright <path to playwright's index.js>] [--shots <dir>]
//
// What it does, all outside the repo:
//   1. copies the repo (without node_modules, .git, dist*) to <work>/app and links node_modules;
//   2. unless --real-simroot, writes a stub src/sim/SimRoot.jsx there that mounts the App straight
//      away (the backend is what is tested here, not the director);
//   3. builds the preview (./build.sh --config vite.config.preview.js), which also writes
//      simulation.html (CSP first, sim-boot.js, the self-hosted fonts);
//   4. serves <work>/app/dist-preview at /riphah-pmo-portal/preview/ on 127.0.0.1;
//   5. opens simulation.html in Chromium, presses "Run with sample names" (fictional cast and the
//      sample illustrations, no real names), and visits every PMO page, every tab of three
//      projects, Campus Compare (both modes), the Assign PM preview, a Board report, a past
//      project, an Updates thread, the Gallery lightbox, a PMO Review PDD, the notifications drawer,
//      global search and the assistant;
//   6. passes only with 0 calls the backend did not recognise, 0 requests leaving the page's own
//      origin, 0 console errors and 0 page errors, and every step completed.
// It never contacts Supabase or any other site. Exit code 0 = pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const WORK = path.resolve(opt("--work", process.env.SIM_TEST_DIR || path.join(os.tmpdir(), "pmo-sim-backend-test")));
const APP = path.join(WORK, "app");
const SHOTS = opt("--shots", null);
const BASE = "/riphah-pmo-portal/preview/";
const PW = opt("--playwright", process.env.SIM_PLAYWRIGHT || null);

const log = (...a) => console.log("[backend-test]", ...a);
const die = (msg) => { console.error("[backend-test] " + msg); process.exit(2); };

// ── 1-3: copy and build ────────────────────────────────────────────────────────────────────────
const SKIP = new Set(["node_modules", ".git", "dist", "dist-preview"]);
function copyRepo() {
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  fs.cpSync(REPO, APP, { recursive: true, filter: (src) => {
    const rel = path.relative(REPO, src);
    if (!rel) return true;
    return !SKIP.has(rel.split(path.sep)[0]);
  } });
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(APP, "node_modules"), "dir");
}
const STUB_SIMROOT = `// Written by scripts/sim/backend-test.mjs in its scratch copy only: mounts the App at once.
import React, { Suspense, lazy } from "react";
const App = lazy(() => import("../App.jsx"));
export default function SimRoot() {
  return React.createElement(Suspense, { fallback: null }, React.createElement(App));
}
`;
if (!flag("--no-build")) {
  log("copying the repo to", APP);
  copyRepo();
  if (!flag("--real-simroot") || !fs.existsSync(path.join(APP, "src/sim/SimRoot.jsx"))) {
    fs.writeFileSync(path.join(APP, "src/sim/SimRoot.jsx"), STUB_SIMROOT);
    log("stub SimRoot written (scratch copy only)");
  }
  log("building the preview…");
  const b = spawnSync("bash", ["build.sh", "--config", "vite.config.preview.js"], { cwd: APP, encoding: "utf8" });
  if (b.status !== 0) { console.error(b.stdout.slice(-4000), b.stderr.slice(-4000)); die("build failed"); }
  log("built:", (b.stdout.match(/simulation\.html[^\n]*/) || [""])[0]);
}
const DIST = path.join(APP, "dist-preview");
if (!fs.existsSync(path.join(DIST, "simulation.html"))) die(`${DIST}/simulation.html missing (build first)`);

// ── 4: serve ───────────────────────────────────────────────────────────────────────────────────
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".mp4": "video/mp4", ".webm": "video/webm" };
const served = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); served.push([404, p]); return; }
  let file = path.join(DIST, p.slice(BASE.length));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); served.push([404, p]); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
  served.push([200, p]);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
log("serving", DIST, "at", ORIGIN + BASE);

// ── 5: drive the App ───────────────────────────────────────────────────────────────────────────
// Ids of the story's records, from the public seed (no names in it).
const META = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/seed.json"), "utf8")).meta || {};
let pw;
try { pw = PW ? createRequire(import.meta.url)(PW) : createRequire(import.meta.url)("playwright"); }
catch { die("Playwright not found: pass --playwright <path to playwright/index.js> or set SIM_PLAYWRIGHT"); }
const { chromium } = pw;
const browser = await chromium.launch({ headless: !flag("--headed") });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, serviceWorkers: "block" });
const page = await context.newPage();

const outside = [], consoleErrors = [], pageErrors = [], steps = [], popups = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.startsWith(ORIGIN + "/") || u.startsWith("blob:") || u.startsWith("data:")) return;
  outside.push(r.method() + " " + u.slice(0, 160));
});
// Known gap, reported but not failed: the Welcome email preview's simulation screenshots
// (public/sim/files/email/*.jpg) are still to be added by the agent that makes the screenshots.
const KNOWN_GAP = /\/sim\/files\/email\/[^/]+\.(?:jpg|png)$/;
const knownGaps = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const at = (m.location && m.location().url) || "";
  if (/Failed to load resource/.test(m.text()) && KNOWN_GAP.test(at)) { knownGaps.push(at.replace(ORIGIN, "")); return; }
  consoleErrors.push((m.text() + (at ? " @ " + at.replace(ORIGIN, "") : "")).slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));
page.on("dialog", (d) => d.dismiss().catch(() => {}));
context.on("page", (p) => { popups.push(p.url()); p.close().catch(() => {}); });

const stats = () => page.evaluate(() => (window.__PMO_SIM_BACKEND_STATS__ ? window.__PMO_SIM_BACKEND_STATS__() : null));
async function settle(min = 500, quiet = 450, max = 6000) {
  await page.waitForTimeout(min);
  const t0 = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await stats().catch(() => null);
    const n = s ? s.calls : 0;
    if (n !== last) { last = n; since = Date.now(); }
    if (Date.now() - since >= quiet) return;
    await page.waitForTimeout(100);
  }
}
let shotN = 0;
async function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) }).catch(() => {});
}
async function step(name, fn) {
  const before = await stats().catch(() => null);
  const t = Date.now();
  try {
    const note = await fn();
    await settle();
    const after = await stats().catch(() => null);
    steps.push({ name, ok: true, ms: Date.now() - t, calls: after && before ? after.calls - before.calls : null, ...(note ? { note } : {}) });
    await shot(name);
  } catch (e) {
    steps.push({ name, ok: false, ms: Date.now() - t, error: String(e && e.message || e).split("\n")[0].slice(0, 240) });
    await shot("FAIL " + name);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const click = (sel, o = {}) => page.locator(sel).first().click({ timeout: 6000, ...o });
const visible = (sel, timeout = 6000) => page.locator(sel).first().waitFor({ state: "visible", timeout });
async function nav(id) {
  await page.keyboard.press("Escape").catch(() => {});
  await click(`[data-nav="${id}"]`);
  await settle(700);
}
// Every <img> in sel has decoded (the blob: and same-site files really load).
const imagesLoaded = (sel) => page.locator(sel).evaluateAll((els) => {
  const imgs = els.flatMap((e) => (e.tagName === "IMG" ? [e] : [...e.querySelectorAll("img")]));
  return { total: imgs.length, ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    blob: imgs.filter((i) => i.src.startsWith("blob:")).length };
});

await step("open simulation.html (sample names)", async () => {
  await page.goto(ORIGIN + BASE + "simulation.html", { waitUntil: "load" });
  await page.getByRole("button", { name: /Run with sample names/i }).click({ timeout: 10000 });
  await visible('[data-nav="cmd"]', 20000);
});

// Capex Dashboard and its tabs
await step("dashboard", async () => { await nav("cmd"); await visible('[data-tour="hero"]'); });
for (const tab of ["investments", "pipeline", "execution", "financials", "budgeting"]) {
  await step(`dashboard tab ${tab}`, async () => {
    const btn = page.locator(`[data-tour="tab-strip"] [data-tab="${tab}"]`);
    must(await btn.count(), `no [data-tab="${tab}"] in the tab strip`);
    await btn.first().click();
  });
}
await step("dashboard: PDD Status, MT Review list", async () => {
  await click('[data-tour="tab-strip"] [data-tab="pipeline"]');
  await page.waitForTimeout(400);
  // The pipeline strip's tiles carry the card keys (in_mt), not the stage names.
  await click('[data-stage="in_mt"], [data-stage="mt_review"]');
});

// Every PMO page
for (const id of ["proj", "camp", "perf", "risks", "cashflow", "schedule", "past", "review", "reports", "upd", "photowall", "team", "users", "log", "set"]) {
  await step(`page ${id}`, async () => { await nav(id); });
}

// Three projects, every tab: the story project, a Gallery host (real-media slots) and the first other row
await step("projects: search filters the list", async () => {
  await nav("proj");
  const s = page.locator('[data-tour="projects-search"]').first();
  await s.fill(META.storySearch || "Study");
  await page.waitForTimeout(600);
  const n = await page.locator("tr[data-project-id]").count();
  must(n >= 1, "the search left no rows");
  await s.fill("");
  return `${n} row(s) for "${META.storySearch}"`;
});
const listed = await page.locator("tr[data-project-id]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-project-id")))]).catch(() => []);
const pick = [META.storyProjectId, META.galleryFirstProjectId].filter(Boolean);
for (const id of listed) if (pick.length < 3 && !pick.includes(id)) pick.push(id);
for (const [n, pid] of pick.entries()) {
  const label = pid === META.storyProjectId ? "story project" : pid === META.galleryFirstProjectId ? "gallery host" : `project ${n + 1}`;
  await step(`${label}: open`, async () => {
    await nav("proj");
    await page.locator('[data-tour="projects-search"]').first().fill("");
    await page.waitForTimeout(300);
    await click(`tr[data-project-id="${pid}"]`);
    await visible('[data-tab="overview"]', 8000);
  });
  const tabs = await page.locator("[data-tab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab"))).catch(() => []);
  for (const t of tabs.filter((x) => ["overview", "financials", "timeline", "wbs", "deliverables", "documents", "sitevisit", "risks", "lessons"].includes(x))) {
    await step(`${label}: tab ${t}`, async () => {
      await click(`[data-tab="${t}"]`);
      await settle(600);
      if (t === "documents" && pid === META.storyProjectId) {
        const cards = await page.locator('[data-tour="doc-card"]').count();
        must(cards >= 1, "no document cards on the story project");
        // Opening a card signs the file (same-site path) and asks to open it; the boot guard decides.
        await page.locator('[data-tour="doc-card"]').first().click();
        await settle(600);
        return `${cards} document cards`;
      }
      if (t === "wbs" && pid === META.storyProjectId) {
        const rows = await page.locator("[data-wbs-row]").count();
        must(rows >= 1, "no WBS rows on the story project");
        const tg = page.locator('[data-tour="wbs-toggle"]');
        if (await tg.count()) await tg.first().click();
        return `${rows} WBS rows`;
      }
      if (t === "sitevisit" && pid === META.galleryFirstProjectId) {
        await page.waitForTimeout(800);
        const im = await imagesLoaded('[data-tour="detail-sitevisit"]');
        must(im.total === 0 || im.ok === im.total, `site-visit images: ${im.ok} of ${im.total} loaded`);
        return `site-visit images ${im.ok}/${im.total} (${im.blob} blob:)`;
      }
      return null;
    });
  }
}

// Campus / Sites: Compare (both modes), Sites view, Assign PM preview (cancelled)
await step("campus: compare (all campuses)", async () => {
  await nav("camp");
  await click('[data-tour="campus-view"] [data-view="compare"]');
  await visible('[data-tour="compare-table"]', 8000);
  return `${await page.locator('[data-tour="compare-table"] [data-campus]').count()} campus rows`;
});
await step("campus: sort by Released", async () => {
  const h = page.locator('[data-tour="compare-table"] [data-col="released"]');
  must(await h.count(), "no Released column header");
  await h.first().click();
});
await step("campus: head to head", async () => {
  await click('[data-tour="compare-mode"] [data-mode="h2h"], [data-mode="h2h"]');
  await visible('[data-tour="compare-h2h-grid"]', 8000);
  await shot("campus head to head (open)");
  return `${await page.locator('[data-tour="h2h-pms"]').count()} manager blocks`;
});
await step("campus: open a site from head to head", async () => {
  await click('[data-tour="h2h-open"]');
  await visible('[data-tour="assign-pm"]', 8000);
});
await step("campus: Assign PM preview, then cancel", async () => {
  const btn = page.locator('[data-tour="assign-pm"]').first();
  await btn.click({ timeout: 6000 });
  // The picker is the portal's own combobox (ui.jsx Select): a button and a listbox of [role=option][data-value].
  const sel = page.locator('[data-tour="pm-select"]').first();
  await sel.waitFor({ state: "visible", timeout: 6000 });
  await sel.click();
  const opts = page.locator('[role="listbox"] [role="option"]');
  await opts.first().waitFor({ state: "visible", timeout: 6000 });
  const values = (await opts.evaluateAll((os) => os.map((o) => o.getAttribute("data-value")))).filter(Boolean);
  must(values.length, "no project managers to pick");
  const want = values.includes(META.assignPmUserId) ? META.assignPmUserId : values[0];
  await page.locator(`[role="listbox"] [role="option"][data-value="${want}"]`).first().click();
  await visible('[data-tour="bulk-preview"]', 6000);
  const text = (await page.locator('[data-tour="bulk-preview"]').first().innerText()).replace(/\s+/g, " ").slice(0, 120);
  await shot("assign pm preview (open)");
  await page.getByRole("button", { name: /^Cancel$/ }).first().click({ timeout: 6000 });
  return text;
});

// Board report viewer
await step("board report: open and back", async () => {
  await nav("reports");
  await click(META.reportId ? `[data-report="${META.reportId}"]` : "[data-report]");
  await visible('[data-tour="report-viewer"]', 8000);
  await visible('[data-tour="report-summary"]', 8000);
  await page.waitForTimeout(600);
  await shot("board report (open)");
  await click('[data-tour="report-back"]');
});

// Past Projects as in scene 16: the Unread filter first (the story's past project has an unread
// reply), then open it from the filtered list; opening it writes the read mark in memory.
await step("past: unread filter", async () => {
  await nav("past");
  // The sidebar item does not leave an open past project; its own back link does.
  const back = page.getByRole("button", { name: /^Past projects$/ });
  if (await back.count()) { await back.first().click(); await settle(500); }
  const u = page.locator('[data-tour="past-unread"]');
  must(await u.count(), "no Unread filter");
  must(await u.first().isEnabled(), "the Unread filter is disabled (nothing unread)");
  await u.first().click();
  await page.waitForTimeout(300);
  return `${await page.locator("[data-past]").count()} row(s) unread`;
});
await step("past: open the story's past project (marks it read)", async () => {
  const a = await stats();
  await click(META.storyPastId ? `[data-past="${META.storyPastId}"]` : "[data-past]");
  await visible('[data-tour="past-thread"]', 8000);
  await settle(600);
  const b = await stats();
  must(b.writes > a.writes, "opening the past project wrote no read mark");
  await shot("past project (open)");
  return `writes +${b.writes - a.writes}`;
});

// Updates thread (marks read in memory; the badge counts down)
await step("updates: open the story thread", async () => {
  await nav("upd");
  await click(META.updatesStoryProjectId ? `[data-tour="updates-list"] [data-project-id="${META.updatesStoryProjectId}"]` : '[data-tour="updates-list"] [data-project-id]');
  await visible('[data-tour="updates-thread"]', 8000);
  await settle(800);
  const s = await stats();
  must(s.writes >= 1, "reading the thread wrote no read marks");
  return `writes so far ${s.writes}`;
});

// Gallery lightbox (blob: media)
await step("gallery: grid and the first picture", async () => {
  await nav("photowall");
  await visible("[data-attachment]", 8000);
  await page.waitForTimeout(1200);
  const im = await imagesLoaded('[data-tour="gallery-grid"]');
  must(im.total > 0 && im.ok === im.total, `gallery images: ${im.ok} of ${im.total} loaded`);
  await click("[data-attachment]");
  await visible('[data-tour="lightbox"]', 8000);
  await page.waitForTimeout(500);
  await shot("gallery lightbox (open)");
  await page.keyboard.press("Escape");
  return `gallery images ${im.ok}/${im.total} (${im.blob} blob:)`;
});

// PMO Review detail (every tab it shows)
await step("pmo review: open a PDD", async () => {
  await nav("review");
  await page.locator('[role="button"]').filter({ hasText: /PDD-/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
});
for (const label of ["PDD details", "Cost table", "Files", "Approval history", "Review"]) {
  await step(`pmo review: tab ${label}`, async () => {
    const b = page.getByRole("button", { name: new RegExp("^" + label, "i") }).or(page.getByRole("tab", { name: new RegExp("^" + label, "i") }));
    must(await b.count(), `no ${label} tab`);
    await b.first().click();
  });
}

// Scene targets: timeline hover, risk matrix cell, performance filter
await step("timeline: hover a bar", async () => {
  await nav("schedule");
  const row = page.locator(META.storyProjectId ? `[data-tour="timeline"] [data-project-id="${META.storyProjectId}"]` : '[data-tour="timeline"] [data-project-id]').first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
});
await step("risks: click the story's matrix cell", async () => {
  await nav("risks");
  await click(`[data-tour="risk-matrix"] [data-cell="${META.riskCell || "high-medium"}"]`);
});
await step("performance: delayed filter", async () => {
  await nav("perf");
  await click('[data-tour="perf-filters"] [data-filter="delayed"]');
});

// Header: notifications drawer and global search; the assistant
await step("notifications drawer", async () => {
  await nav("cmd");
  const bell = page.locator('button[title="Updates"], button[title*="unread update"]').first();
  must(await bell.count(), "no notifications button");
  await bell.click();
  await visible('aside[aria-label="Notifications"]', 5000);
  await page.keyboard.press("Escape");
});
await step("global search", async () => {
  await click('[data-tour="search-trigger"]');
  await page.keyboard.type("Hub", { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
});
await step("assistant: ask a starter question", async () => {
  await click('[data-tour="assistant-launcher"]');
  await page.waitForTimeout(700);
  const box = page.locator("textarea").last();
  await box.fill("Where do we stand overall?");
  await box.press("Enter");
  await page.waitForTimeout(1200);
  await shot("assistant answer");
  await page.keyboard.press("Escape");
});

// Refusals: nothing leaves the page and nothing real comes in (each must end quietly)
const delta = async (fn) => { const a = await stats(); await fn(); await settle(700); const b = await stats();
  return { refused: b.refusedCount - a.refusedCount, blocked: b.blockedCount - a.blockedCount, writes: b.writes - a.writes }; };
await step("refused: upload a document", async () => {
  await nav("proj");
  await click(`tr[data-project-id="${META.storyProjectId}"]`);
  await visible('[data-tab="documents"]', 8000);
  await click('[data-tab="documents"]');
  await settle(500);
  const d = await delta(() => page.locator('input[type="file"]').first().setInputFiles({ name: "real.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%real\n") }));
  must(d.refused === 1, `expected 1 refused upload, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: post an Updates comment (kept in memory; no email)", async () => {
  await nav("upd");
  // The thread was read above, so the Inbox is empty now: open it from All Projects.
  await page.getByRole("button", { name: /^All Projects$/ }).first().click({ timeout: 6000 });
  await page.waitForTimeout(300);
  await click(`[data-tour="updates-list"] [data-project-id="${META.updatesStoryProjectId}"]`);
  await visible('[data-tour="updates-thread"]', 8000);
  const box = page.locator('textarea[placeholder^="Write a comment"]').first();
  await box.fill("Test note from the simulation check.");
  const d = await delta(() => box.press("Control+Enter"));
  must(d.writes >= 1 && d.blocked === 1, `expected a write and a blocked notify-comment, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: PMO Review › Check now", async () => {
  await nav("review");
  const d = await delta(() => page.getByRole("button", { name: /Check now/i }).first().click());
  must(d.blocked === 1, `expected 1 blocked epdd-sync, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: Welcome email › Send test to me", async () => {
  await nav("users");
  await page.getByRole("button", { name: /^Welcome email$/ }).first().click({ timeout: 6000 });
  await page.waitForTimeout(800);
  // The simulation's welcome_email setting carries no standard password, so send without one.
  await page.getByRole("button", { name: /^Not included$/ }).first().click({ timeout: 6000 });
  const d = await delta(() => page.getByRole("button", { name: /Send test to me/i }).first().click({ timeout: 6000 }));
  must(d.blocked === 1, `expected 1 blocked send-welcome-email, got ${JSON.stringify(d)}`);
  await shot("welcome email blocked");
  await page.keyboard.press("Escape");
  return JSON.stringify(d);
});
await step("sign out, then sign-in and Forgot password are refused", async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Sign out$/ }).first().click({ timeout: 6000 });
  const user = page.locator('input[placeholder="Enter your username"]').first();
  await user.waitFor({ state: "visible", timeout: 8000 });
  await user.fill("pmo.sim");
  await page.locator('input[type="password"]').first().fill("not-a-password");
  await page.getByRole("button", { name: /^Sign In$/i }).first().click();
  await page.waitForTimeout(800);
  const msg = await page.getByText(/Username not found|not available in the simulation/i).count();
  must(msg >= 1, "no refusal message after Sign In");
  await page.getByText("Forgot password?").first().click();
  await page.locator('input[placeholder="Your username"]').first().fill("pmo.sim");
  await page.locator('input[placeholder="Your username"]').first().press("Enter");
  await page.waitForTimeout(800);
  await shot("forgot password refused");
});

// ── 6: verdict ─────────────────────────────────────────────────────────────────────────────────
await settle(800);
const s = await stats();
await browser.close();
server.close();

const failedSteps = steps.filter((x) => !x.ok);
const ok = s && s.unhandledCount === 0 && s.outsideCount === 0 && outside.length === 0
  && consoleErrors.length === 0 && pageErrors.length === 0 && failedSteps.length === 0;
const report = {
  pass: !!ok,
  steps: { total: steps.length, failed: failedSteps, notes: steps.filter((x) => x.note).map((x) => `${x.name}: ${x.note}`) },
  backend: s ? { calls: s.calls, rest: s.rest, rpc: s.rpc, storage: s.storage, functions: s.functions, auth: s.auth,
    reads: s.reads, writes: s.writes, unhandled: s.unhandled, refused: s.refused, blocked: s.blocked, outside: s.outside,
    emptyTables: s.emptyTables, endpoints: Object.keys(s.endpoints).sort() } : null,
  browser: { requestsLeavingOrigin: outside, consoleErrors, pageErrors, popups,
    sameOrigin404: served.filter(([c]) => c === 404).map(([, p]) => p),
    knownGaps: [...new Set(knownGaps)] },
};
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "backend-test-report.json"), JSON.stringify(report, null, 2));
log(`steps ${steps.length - failedSteps.length}/${steps.length} ok; backend calls ${s?.calls}; unhandled ${s?.unhandledCount}; `
  + `outside ${outside.length}; console errors ${consoleErrors.length}; page errors ${pageErrors.length}`);
for (const f of failedSteps) log("  step failed:", f.name, "-", f.error);
for (const u of (s?.unhandled || [])) log("  unhandled:", u.kind, u.method, u.path, u.detail || "");
for (const o of outside) log("  outside:", o);
for (const c of consoleErrors) log("  console:", c);
for (const p of pageErrors) log("  page error:", p);
for (const g of new Set(knownGaps)) log("  known gap (not failed): missing", g);
log("report:", path.join(WORK, "backend-test-report.json"));
log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
