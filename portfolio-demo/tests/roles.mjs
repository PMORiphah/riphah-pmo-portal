import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], out = process.argv[3], port = 5203;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const tabs = ["Capex Dashboard","Projects","Campus / Sites","Performance","Risk Register","Project Cashflows","Timeline & Schedule","Past Projects","PMO Review","Inventory","Monthly Report","Updates","Gallery","Team & About","User Management","Activity Log","Settings"];
for (const role of (process.argv[4] || "pmo,pm,guest").split(",")) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage();
  let errs = [], outside = [];
  pg.on("pageerror", e => errs.push(String(e).slice(0, 200))); pg.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 200)));
  await ctx.route("**/*", (rt) => { const u = rt.request().url(); if (u.startsWith(`http://localhost:${port}`) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue(); outside.push(u.slice(0, 100)); return rt.abort(); });
  await pg.goto(`http://localhost:${port}/?role=${role}`); await pg.waitForTimeout(4500);
  for (let i = 0; i < 4; i++) { const x = pg.getByRole("button", { name: /^(Not now|Later|Close|Dismiss|Skip tour|×)$/ }); if (await x.count()) { await x.first().click().catch(()=>{}); await pg.waitForTimeout(400); } }
  const who = await pg.evaluate(() => JSON.parse(sessionStorage.getItem("pmo_session")||"{}"));
  console.log(`\n== ${role}: signed in as ${who.username} (${who.role}); start errors ${errs.length} ${errs[0]||""}`);
  for (const t of tabs) {
    errs = []; const before = await pg.evaluate(() => window.__DEMO__.unhandled.length);
    const link = pg.locator("nav, aside").getByText(t, { exact: true }).first();
    if (!(await link.count())) { console.log(`${t} | not in nav`); continue; }
    try { await link.click({ timeout: 3000 }); } catch { console.log(`${t} | CLICK FAIL`); continue; }
    await pg.waitForTimeout(1600);
    const un = await pg.evaluate((n) => window.__DEMO__.unhandled.slice(n).map(x => `${x.kind}:${x.method} ${String(x.path).slice(0, 70)} ${x.detail||""}`), before);
    const txt = (await pg.locator("body").innerText()).length;
    console.log([t, `text ${txt}`, `errs ${errs.length}`, errs[0] || "", `unhandled ${un.length}`, [...new Set(un)].slice(0, 4).join(" ; ")].filter(Boolean).join(" | "));
    await pg.screenshot({ path: `${out}/${role}-${t.replace(/[^a-z]/gi, "")}.png` });
  }
  console.log(`outside requests: ${outside.length} ${outside.slice(0,3).join(" ")}`);
  await ctx.close();
}
await b.close(); srv.close();
