// Features the other suites don't open: node tests/extras.mjs <dist/index.html>
// The welcome e-mail window, opening a document, an Excel export and the assistant panel, each with no
// errors and no Content-Security-Policy violations (pw.mjs turns those into console errors).
import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], port = 5218, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true });
const outside = [];
await ctx.route("**/*", (rt) => { const u = rt.request().url(); if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue();
  if (/^chrome(-extension)?:/.test(u)) return rt.continue();   // the browser's own PDF viewer, not the network
  outside.push(u); return rt.abort(); });
const pg = await ctx.newPage();
let errs = [];
pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); pg.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await pg.goto(`${base}?role=pmo`); await pg.waitForTimeout(3500);
const go = (p) => pg.evaluate((p) => { window.__DEMO__.nav.closeProject?.(); window.__DEMO__.nav.setPage(p); }, p);

// 1. welcome e-mail window
await go("users"); await pg.waitForTimeout(1500);
errs = [];
await pg.getByRole("button", { name: /Welcome email/i }).first().click(); await pg.waitForTimeout(2500);
const frames = pg.frames().length;
const shown = await pg.evaluate(() => /Welcome/i.test(document.body.innerText));
ok(shown && errs.length === 0, `welcome e-mail window opens with no errors (${errs[0] || "clean"}, ${frames} frames)`);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(600);

// 2. a document opens (generated PDF, in a new tab)
await go("proj"); await pg.waitForTimeout(800);
await pg.evaluate(() => window.__DEMO__.openProject("b0000001-0000-4000-8000-000000000076")); await pg.waitForTimeout(1500);
await pg.locator('[data-tab="documents"]').click(); await pg.waitForTimeout(1500);
errs = [];
const popupP = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
await pg.getByText(/^PDD_Clinical Skills Lab Upgrade\.pdf$/).first().click().catch(() => {});
const popup = await popupP;
await pg.waitForTimeout(1500);
ok(!!popup && /^blob:/.test(popup.url()), `a document opens in a new tab from the page itself (${popup ? popup.url().slice(0, 40) : "no tab"})`);
ok(errs.length === 0, `no errors opening a document (${errs[0] || "clean"})`);
if (popup) await popup.close();

// 3. Excel export of the project register
await go("proj"); await pg.waitForTimeout(1200);
errs = [];
const dl = pg.waitForEvent("download", { timeout: 15000 }).catch(() => null);
await pg.getByRole("button", { name: /Export all/i }).first().click();
const d = await dl;
ok(!!d && /\.xlsx$/.test(d.suggestedFilename()), `Excel export downloads ${d ? d.suggestedFilename() : "nothing"}`);
ok(errs.length === 0, `no errors exporting (${errs[0] || "clean"})`);

// 4. the assistant panel answers
errs = [];
await pg.locator('[data-tour="assistant-launcher"]').first().click(); await pg.waitForTimeout(1200);
const box = pg.locator("textarea, input[type=text]").last();
await box.fill("Where do we stand overall?"); await box.press("Enter"); await pg.waitForTimeout(2500);
const said = await pg.evaluate(() => document.body.innerText.includes("Read as: where the portfolio stands"));
ok(said, "the assistant panel answers a question");
ok(errs.length === 0, `no errors in the assistant (${errs[0] || "clean"})`);
ok(outside.length === 0, `nothing fetched from outside (${outside.length})`);
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
