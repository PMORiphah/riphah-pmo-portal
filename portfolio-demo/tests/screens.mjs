// Portfolio screenshots: node portfolio-demo/tests/screens.mjs [dist/index.html]
// Writes portfolio-demo/screenshots/: a 1600 × 1200 cover, six desktop screens (1440 × 900 at 2×) and
// two phone screens (390 × 844 at 3×). Fictional data only, like everything in the demo.
import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const ROOT = new URL("../", import.meta.url);
const file = process.argv[2] || new URL("dist/index.html", ROOT).pathname;
const OUT = new URL("screenshots/", ROOT).pathname;
fs.mkdirSync(OUT, { recursive: true });
const port = 5217, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch();
const errs = [];
const shotOf = async (name, pg, opts = {}) => { await pg.screenshot({ path: `${OUT}${name}.png`, ...opts }); console.log(`  ${name}.png`); };
// The demo bar off for product shots (the tour shot keeps it).
const noBar = (pg) => pg.addStyleTag({ content: ".dm-bar{display:none!important} #root{margin-top:0!important} :root{--demo-bar:0px!important}" });
const quiet = (pg) => pg.mouse.move(2, 2);

async function context(viewport, scale, mobile = false) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, colorScheme: "dark" });
  await ctx.route("**/*", (rt) => { const u = rt.request().url(); return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? rt.continue() : rt.abort(); });
  const pg = await ctx.newPage(); pg.on("pageerror", (e) => errs.push(String(e)));
  return { ctx, pg };
}
const go = (pg, page) => pg.evaluate((p) => { window.__DEMO__.nav.closeProject?.(); window.__DEMO__.nav.setPage(p); }, page);

// ── desktop ──
{
  const { ctx, pg } = await context({ width: 1440, height: 900 }, 2);
  await pg.goto(`${base}?role=pmo`); await pg.waitForTimeout(3500);
  await noBar(pg); await quiet(pg); await pg.waitForTimeout(2500);   // count-ups finish
  await shotOf("desktop-1-dashboard", pg);
  await pg.evaluate(() => window.__DEMO__.openProject("b0000001-0000-4000-8000-000000000076")); await pg.waitForTimeout(1500);
  await pg.locator('[data-tab="deliverables"]').click(); await pg.waitForTimeout(1200); await quiet(pg);
  await shotOf("desktop-2-project-detail", pg);
  await go(pg, "review"); await pg.waitForTimeout(1500);
  await pg.getByText("Anatomy Museum Display Cabinets").first().click(); await pg.waitForTimeout(1800); await quiet(pg);
  await shotOf("desktop-3-proposal-checks", pg);
  await go(pg, "cashflow"); await pg.waitForTimeout(2600); await quiet(pg);
  await shotOf("desktop-4-cash-flow", pg);
  await go(pg, "reports"); await pg.waitForTimeout(1200);
  await pg.getByText(/Monthly Board Report: September/).first().click(); await pg.waitForTimeout(2200); await quiet(pg);
  await shotOf("desktop-5-monthly-report", pg);
  await pg.locator('[data-tour="report-back"]').click().catch(() => {}); await pg.waitForTimeout(600);
  await ctx.close();
}
{
  // The tour in action, with the demo bar (chapter 4: the risk register).
  const { ctx, pg } = await context({ width: 1440, height: 900 }, 2);
  await pg.goto(`${base}?role=pmo`); await pg.waitForTimeout(3500);
  await pg.evaluate(() => sessionStorage.setItem("cpp-demo-tour", JSON.stringify({ active: true, idx: 12, playing: false, voice: false, returnRole: "pmo" })));
  await pg.reload(); await pg.waitForTimeout(5500); await quiet(pg);
  await shotOf("desktop-6-guided-tour", pg);
  await ctx.close();
}
// ── phones ──
{
  const { ctx, pg } = await context({ width: 390, height: 844 }, 3, true);
  await pg.goto(`${base}?role=pmo`); await pg.waitForTimeout(3500); await pg.waitForTimeout(2000);
  await shotOf("phone-1-dashboard", pg);
  await pg.evaluate(() => window.__DEMO__.openProject("b0000001-0000-4000-8000-000000000076")); await pg.waitForTimeout(1500);
  await pg.locator('[data-tab="wbs"]').click(); await pg.waitForTimeout(1200);
  await shotOf("phone-2-project-wbs", pg);
  await ctx.close();
}
// ── cover: 1600 × 1200 ──
{
  const img = (n) => "data:image/png;base64," + fs.readFileSync(`${OUT}${n}.png`).toString("base64");
  const { ctx, pg } = await context({ width: 1600, height: 1200 }, 1);
  await pg.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1600px;height:1200px;overflow:hidden;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#eef4fb;
      background:radial-gradient(900px 600px at 85% 5%,rgba(42,157,143,.35),transparent 60%),radial-gradient(900px 700px at 0% 100%,rgba(44,123,196,.35),transparent 60%),#0b1726}
    .t{position:absolute;left:90px;top:80px;width:1420px}
    .pill{display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(42,157,143,.2);color:#7fd1c7;font-weight:700;font-size:18px;letter-spacing:.5px}
    h1{font-size:68px;line-height:1.05;margin:22px 0 14px;font-weight:800;letter-spacing:-1px}
    p{font-size:26px;color:#b9c9da;margin:0;max-width:1150px;line-height:1.4}
    .win{position:absolute;left:90px;top:400px;width:1140px;border-radius:16px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);background:#0f2136}
    .win .chrome{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#13283f}
    .win .chrome i{width:12px;height:12px;border-radius:50%;background:#3a4d63;display:block}
    .win img{display:block;width:100%}
    .phone{position:absolute;right:80px;top:470px;width:300px;border-radius:40px;padding:12px;background:#05101c;box-shadow:0 40px 90px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.14)}
    .phone img{display:block;width:100%;border-radius:30px}
    .f{position:absolute;left:90px;top:318px;font-size:20px;color:#8aa0b8}
    .f b{color:#f3d39b}
  </style></head><body>
    <div class="t"><span class="pill">● Live demo · fictional data</span>
      <h1>Capital Projects Portal</h1>
      <p>Budgets from proposal to payment, schedules, risks, inventory and board reports for a whole capital portfolio, with a guided tour and three roles to try.</p></div>
    <div class="win"><div class="chrome"><i></i><i></i><i></i></div><img src="${img("desktop-1-dashboard")}"></div>
    <div class="phone"><img src="${img("phone-2-project-wbs")}"></div>
    <div class="f">Designed and built by <b>Abdullah Azhar</b> · React · role-based access · PDF and Excel reports</div>
  </body></html>`);
  await pg.waitForTimeout(500);
  await shotOf("cover-1600x1200", pg, { clip: { x: 0, y: 0, width: 1600, height: 1200 } });
  await ctx.close();
}
console.log(errs.length ? `errors: ${errs.join(" | ")}` : "no errors");
await b.close(); srv.close();
