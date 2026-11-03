// Live analytics check: node tests/live-analytics.mjs <dist/index.html built with the real key>
// Plays one short, tagged visit (?src=claude-test) on the final page and passes every batch the page
// sends to PostHog on, unchanged, to the real endpoint (with curl: this test machine's browser has no
// direct internet access). Then the owner checks the events in PostHog → Activity.
// Sends real events: run it only when a check is wanted, and filter src = claude-test out of reports.
import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
import { execFileSync } from "node:child_process";
const file = process.argv[2], port = 5220, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
const sent = [];
await ctx.route("**/*", async (rt) => {
  const req = rt.request(), u = req.url();
  if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue();
  if (u === "https://eu.i.posthog.com/batch/") {
    const body = req.postData() || "";
    let status = "not sent";
    try {
      status = execFileSync("curl", ["-sS", "-m", "20", "-o", "/dev/null", "-w", "%{http_code}", "-H", "Content-Type: text/plain", "--data-binary", "@-", u], { input: body, encoding: "utf8" });
    } catch (e) { status = "curl failed: " + String(e.message).slice(0, 80); }
    const events = (() => { try { return JSON.parse(body).batch.map((e) => e.event); } catch { return []; } })();
    sent.push({ status, events });
    return rt.fulfill({ status: Number(status) || 502, contentType: "application/json", body: '{"status":"Ok"}' });
  }
  return rt.abort();
});
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
await pg.goto(`${base}?src=claude-test`); await pg.waitForTimeout(1200);
await pg.locator('.dm-role[data-role="guest"]').click(); await pg.locator('[data-start="explore"]').click(); await pg.waitForTimeout(3500);
for (const p of ["proj", "camp", "risks"]) { await pg.evaluate((p) => window.__DEMO__.nav.setPage(p), p); await pg.waitForTimeout(1200); }
await pg.evaluate(() => window.__DEMO__.openProject("b0000001-0000-4000-8000-000000000076")); await pg.waitForTimeout(1500);
await pg.evaluate(async () => { const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  await fetch("https://api.demo.invalid/functions/v1/ask", { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ question: "Where do we stand overall?" }) }); });
await pg.evaluate(() => window.__DEMO__.nav.closeProject()); await pg.waitForTimeout(600);
await pg.locator('[data-demo="tour"]').click(); await pg.locator("[data-tour-card]").waitFor({ timeout: 15000 }); await pg.waitForTimeout(3500);
await pg.locator('[data-tour-ctl="play"]').click(); await pg.locator('[data-tour-ctl="next"]').click(); await pg.waitForTimeout(2000);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(4500);
await pg.waitForTimeout(31000);   // one heartbeat
await pg.close({ runBeforeUnload: true }); await new Promise((r) => setTimeout(r, 2500));
const all = sent.flatMap((s) => s.events);
console.log(`${sent.length} batches sent to PostHog, statuses: ${[...new Set(sent.map((s) => s.status))].join(", ")}`);
const count = {}; for (const e of all) count[e] = (count[e] || 0) + 1;
console.log(`${all.length} events: ${Object.entries(count).map(([k, v]) => `${k} ×${v}`).join(", ")}`);
console.log(errs.length ? `page errors: ${errs.join(" | ")}` : "no page errors");
await b.close(); srv.close();
process.exit(sent.length && sent.every((s) => s.status === "200") && !errs.length ? 0 : 1);
