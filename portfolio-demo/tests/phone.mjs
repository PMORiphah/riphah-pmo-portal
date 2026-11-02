// Phones: node tests/phone.mjs <dist/index.html> [out dir]
// At 390 × 844 (touch), every page each role can open, and every tab of one project: no sideways
// scrolling, no errors, nothing fetched from outside.
import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], out = process.argv[3] || new URL("./out/", import.meta.url).pathname, port = 5215, base = `http://localhost:${port}/`;
fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; if (!c || process.env.VERBOSE) console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const PAGES = { pmo: ["cmd", "proj", "camp", "perf", "risks", "cashflow", "schedule", "past", "review", "inventory", "reports", "upd", "photowall", "team", "users", "log", "set"],
  pm: ["proj", "past", "upd", "photowall", "team"], guest: ["cmd", "proj", "camp", "perf", "risks", "schedule", "past", "upd", "photowall", "team"] };
const DETAIL = ["overview", "financials", "timeline", "wbs", "deliverables", "documents", "sitevisit", "risks", "lessons", "todo"];
for (const [role, pages] of Object.entries(PAGES)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = [], outside = [];
  await ctx.route("**/*", (rt) => { const u = rt.request().url(); if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue(); outside.push(u); return rt.abort(); });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160))); pg.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  await pg.goto(`${base}?role=${role}`); await pg.waitForTimeout(3500);
  const wide = async () => pg.evaluate(() => {
    const doc = document.scrollingElement.scrollWidth;
    // Any visible element reaching past the right edge of the screen (inside scrollers is fine).
    let over = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed") {
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { clipped = true; break; } p = p.parentElement; }
        if (!clipped) { over = (el.className && String(el.className).slice(0, 40)) || el.tagName; break; }
      }
    }
    return { doc, over };
  });
  for (const id of pages) {
    errs.length = 0;
    await pg.evaluate((p) => { window.__DEMO__.nav.closeProject?.(); window.__DEMO__.nav.setPage(p); }, id); await pg.waitForTimeout(1300);
    const w = await wide();
    ok(w.doc <= 390 && !w.over, `${role} ${id}: no sideways scroll (${w.doc}${w.over ? ", " + w.over + " sticks out" : ""})`);
    ok(errs.length === 0, `${role} ${id}: no errors ${errs[0] || ""}`);
    await pg.screenshot({ path: `${out}/phone-${role}-${id}.png` });
  }
  // one project, every tab this role sees
  await pg.evaluate(() => { window.__DEMO__.nav.setPage("proj"); }); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.__DEMO__.openProject("b0000001-0000-4000-8000-000000000076")); await pg.waitForTimeout(1500);
  for (const t of DETAIL) {
    const tab = pg.locator(`[data-tab="${t}"]`);
    if (!(await tab.count())) continue;
    errs.length = 0;
    await tab.first().click(); await pg.waitForTimeout(900);
    const w = await wide();
    ok(w.doc <= 390 && !w.over, `${role} project ${t}: no sideways scroll (${w.doc}${w.over ? ", " + w.over + " sticks out" : ""})`);
    ok(errs.length === 0, `${role} project ${t}: no errors ${errs[0] || ""}`);
  }
  ok(outside.length === 0, `${role}: nothing fetched from outside (${outside.length})`);
  await ctx.close();
}
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
