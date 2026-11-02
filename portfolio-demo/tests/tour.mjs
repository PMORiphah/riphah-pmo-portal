import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], out = process.argv[3], port = 5208, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); const pg = await ctx.newPage();
const errs = [], outside = [];
pg.on("pageerror", e => errs.push(String(e).slice(0, 200))); pg.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await ctx.route("**/*", (rt) => { const u = rt.request().url(); if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue(); outside.push(u.slice(0, 90)); return rt.abort(); });
await pg.goto(base); await pg.waitForTimeout(1200);
ok(/about \d+ minutes/.test(await pg.locator('[data-start="tour"]').innerText()), `tour button: ${await pg.locator('[data-start="tour"]').innerText()}`);
const START = process.argv[4] || "project_manager";   // the role chosen on the start screen
console.log(`starting as ${START}`);
await pg.locator(`.dm-role[data-role="${START}"]`).click();
await pg.locator('[data-start="tour"]').click();
const card = pg.locator("[data-tour-card]");
await card.waitFor({ timeout: 15000 }); await pg.waitForTimeout(2500);
// pause straight away so the autoplay doesn't race the test
await pg.locator('[data-tour-ctl="play"]').click();
const info = async () => pg.evaluate(() => {
  const c = document.querySelector("[data-tour-card]"), sp = document.querySelector(".dt-spot"), r = c?.getBoundingClientRect();
  return { head: c?.querySelector(".dt-ch")?.textContent, title: c?.querySelector("h3")?.textContent, role: window.__DEMO__.role,
    spot: sp ? sp.getBoundingClientRect().width * sp.getBoundingClientRect().height : 0,
    card: r && { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, iw: innerWidth, ih: innerHeight };
});
const seen = [];
for (let i = 0; i < 40; i++) {
  await pg.waitForTimeout(1600);
  const x = await info();
  if (!x.title) { await pg.waitForTimeout(3000); continue; }
  const inView = x.card && x.card.l >= 0 && x.card.t >= 40 && x.card.r <= x.iw && x.card.b <= x.ih;
  seen.push(x);
  console.log(`  ${String(seen.length).padStart(2)} [${x.role}] ${x.head} — ${x.title} | spotlight ${x.spot > 0 ? "yes" : "NO"} | card ${inView ? "in view" : "OUT " + JSON.stringify(x.card)}`);
  await pg.screenshot({ path: `${out}/step-${String(seen.length).padStart(2, "0")}.png` });
  if (x.head === "Tour complete") break;
  const n = pg.locator('[data-tour-ctl="next"]');
  if (await n.count()) await n.click(); else await pg.waitForTimeout(2500);
  // after a role switch the page reloads and the tour resumes (paused state is kept)
}
const steps = seen.filter(x => x.head !== "Tour complete");
ok(steps.length === 29, `walked ${steps.length} steps`);
ok(steps.every(x => x.spot > 0), `every step spotlights something (${steps.filter(x => !x.spot).map(x => x.title).join("; ") || "all"})`);
ok(steps.every(x => x.card && x.card.l >= 0 && x.card.t >= 40 && x.card.r <= x.iw && x.card.b <= x.ih), "card always fully on screen");
ok(new Set(steps.map(x => x.head.match(/Chapter (\d+) of 9/)?.[1])).size === 9, "all 9 chapters shown as 'Chapter N of 9'");
ok(steps.some(x => x.role === "project_manager") && steps.some(x => x.role === "guest") && steps[0].role === "pmo", "tour runs as PMO and shows the manager and senior-management views");
ok(seen.at(-1)?.head === "Tour complete" && await pg.locator('[data-tour-ctl="cta"]').count() === 1, "ends with the Upwork call to action");
ok((await pg.locator('[data-tour-ctl="cta"]').getAttribute("href")).includes("upwork.com/freelancers/~015400e3035d103eb3"), "CTA links to the Upwork profile");
await pg.locator('[data-tour-ctl="explore"]').click(); await pg.waitForTimeout(4000);
ok((await pg.evaluate(() => window.__DEMO__.role)) === START && !(await card.count()), `Explore freely returns to the role chosen at the start (${START})`);
// contents, back, exit, resume
await pg.locator('[data-demo="tour"]').click(); await card.waitFor(); await pg.waitForTimeout(4500);
ok((await info()).title === "Portfolio health in one look", "after finishing, the tour starts over");
await pg.locator('[data-tour-ctl="play"]').click();
await pg.locator('[data-tour-ctl="contents"]').click(); await pg.screenshot({ path: `${out}/contents.png` });
await pg.locator('[data-chapter="5"]').click(); await pg.waitForTimeout(2500);
ok(/Chapter 5 of 9/.test((await info()).head), `contents jumps to chapter 5 (${(await info()).head})`);
await pg.locator('[data-tour-ctl="back"]').click(); await pg.waitForTimeout(2500);
ok(/Chapter 4 of 9/.test((await info()).head), "back goes to the previous step");
const before = (await info()).title;
await pg.locator('[data-tour-ctl="exit"]').click(); await pg.waitForTimeout(800);
ok(!(await card.count()), "× leaves the tour");
await pg.locator("nav, aside").getByText("Gallery", { exact: true }).first().click(); await pg.waitForTimeout(1200);
ok(await pg.getByText(/Gallery/).count() > 0, "free exploration works after leaving");
await pg.locator('[data-demo="tour"]').click(); await card.waitFor(); await pg.waitForTimeout(3500);
ok((await info()).title === before, `the tour resumes where it was left (${before})`);
// autoplay advances by itself
const t0 = (await info()).title; await pg.waitForTimeout(16000);
ok((await info()).title !== t0, "autoplay moves on by itself");
await pg.locator('[data-tour-ctl="play"]').click(); const t1 = (await info()).title; await pg.waitForTimeout(16000);
ok((await info()).title === t1, "pause stops it");
ok(await pg.locator('[data-tour-ctl="voice"]').getAttribute("aria-pressed") === "false", "voice is off by default");
await pg.keyboard.press("Escape"); await pg.waitForTimeout(500);
ok(!(await card.count()), "Esc leaves the tour");
const ev = await pg.evaluate(() => (window.__DEMO_EVENTS__ || []).map(e => e.event));
ok(["mode_chosen", "tour_open", "tour_step_view", "tour_complete", "tour_exit", "cta_click"].filter(e => e !== "cta_click").every(e => ev.includes(e)), `analytics events recorded: ${[...new Set(ev)].join(", ")}`);
ok(errs.length === 0, `no errors (${errs.length}) ${errs.join(" || ")}`);
ok(outside.length === 0, `no outside requests (${outside.length})`);
await ctx.close();
// phone
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const pp = await ph.newPage();
const perr = []; pp.on("pageerror", e => perr.push(String(e)));
await ph.route("**/*", (rt) => { const u = rt.request().url(); return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? rt.continue() : rt.abort(); });
await pp.goto(base); await pp.waitForTimeout(1200);
await pp.locator('[data-start="tour"]').click(); await pp.locator("[data-tour-card]").waitFor({ timeout: 15000 }); await pp.waitForTimeout(3000);
await pp.locator('[data-tour-ctl="play"]').click();
for (let i = 0; i < 9; i++) {
  const x = await pp.evaluate(() => { const r = document.querySelector("[data-tour-card]").getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, t: r.top, sw: document.scrollingElement.scrollWidth, title: document.querySelector("[data-tour-card] h3")?.textContent }; });
  if (i === 0 || i === 7) await pp.screenshot({ path: `${out}/phone-${i}.png` });
  if (!(x.l >= 0 && x.r <= 390 && x.b <= 844 && x.sw <= 390)) { ok(false, `phone card off screen at "${x.title}" ${JSON.stringify(x)}`); break; }
  if (i === 8) ok(true, "phone: card stays on screen as a bottom sheet, no sideways scroll");
  await pp.locator('[data-tour-ctl="next"]').click(); await pp.waitForTimeout(1800);
}
ok(perr.length === 0, `phone: no errors (${perr.length}) ${perr[0] || ""}`);
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
