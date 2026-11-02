import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], out = process.argv[3], port = 5207, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const html = fs.readFileSync(file, "utf8");
ok(/^<!doctype html>\n<!-- © 2026 Abdullah Azhar\. All rights reserved/i.test(html) && html.includes('name="copyright"'), "copyright notice and meta in the file");
for (const [label, opts] of [["desktop", { viewport: { width: 1366, height: 800 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  for (const scheme of ["dark", "light"]) {
    const ctx = await b.newContext({ ...opts, colorScheme: scheme }); const pg = await ctx.newPage();
    const errs = [], outside = [], popups = [];
    pg.on("pageerror", e => errs.push(String(e).slice(0, 200))); pg.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 200)));
    ctx.on("page", p => popups.push(p.url()));
    await ctx.route("**/*", (rt) => { const u = rt.request().url(); if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return rt.continue(); outside.push(u.slice(0, 90)); return rt.abort(); });
    await pg.goto(base); await pg.waitForTimeout(1500);
    const tag = `${label}/${scheme}`;
    ok(await pg.locator(".dm-entry").isVisible(), `${tag}: start screen shows on a first visit`);
    const hs = await pg.evaluate(() => ({ sw: document.querySelector(".dm-entry").scrollWidth, cw: document.querySelector(".dm-entry").clientWidth }));
    ok(hs.sw <= hs.cw, `${tag}: no sideways scroll on the start screen (${hs.sw}/${hs.cw})`);
    await pg.screenshot({ path: `${out}/entry-${label}-${scheme}.png`, fullPage: false });
    if (scheme === "light") { await ctx.close(); continue; }
    await pg.getByText("Terms of use").click(); ok(await pg.locator("[data-terms]").isVisible(), `${tag}: terms open`);
    await pg.locator('.dm-role[data-role="project_manager"]').click();
    await pg.locator('[data-start="explore"]').click(); await pg.waitForTimeout(3500);
    for (let i = 0; i < 3; i++) { const x = pg.getByRole("button", { name: /^(Not now|Later|Close|Dismiss|Skip tour)$/ }); if (await x.count()) { await x.first().click().catch(()=>{}); await pg.waitForTimeout(300); } }
    ok(!(await pg.locator(".dm-entry").count()), `${tag}: start screen closes`);
    const who = await pg.evaluate(() => JSON.parse(sessionStorage.getItem("pmo_session")).role);
    ok(who === "project_manager", `${tag}: signed in as the chosen role (${who})`);
    ok((await pg.locator(".dm-bar").innerText()).includes("Project manager"), `${tag}: bar names the role`);
    const lay = await pg.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth,
      top: document.getElementById("root").getBoundingClientRect().top }));
    ok(lay.sh <= lay.ih + 1 && lay.sw <= lay.iw + 1 && lay.top === 40, `${tag}: portal sits under the bar, page doesn't scroll (${lay.sh}/${lay.ih}, ${lay.sw}/${lay.iw}, top ${lay.top})`);
    await pg.screenshot({ path: `${out}/bar-${label}-pm.png` });
    await pg.reload(); await pg.waitForTimeout(3000);
    ok(!(await pg.locator(".dm-entry").count()) && (await pg.evaluate(() => window.__DEMO__.role)) === "project_manager", `${tag}: reload keeps the role, no start screen`);
    // role switch via the bar
    await pg.locator('[data-demo="role"]').click(); await pg.waitForTimeout(300);
    await pg.screenshot({ path: `${out}/rolemenu-${label}.png` });
    await pg.locator('.dm-menu [data-role="guest"]').click(); await pg.waitForTimeout(3500);
    ok((await pg.evaluate(() => window.__DEMO__.role)) === "guest", `${tag}: role menu switches to senior management`);
    // tour button / more menu
    if (label === "phone") { await pg.locator('[data-demo="more"]').click(); await pg.waitForTimeout(300); await pg.screenshot({ path: `${out}/more-phone.png` }); await pg.getByRole("menuitem", { name: "Guided tour" }).click(); }
    else await pg.locator('[data-demo="tour"]').click();
    await pg.locator("[data-tour-card]").waitFor({ timeout: 15000 }); await pg.waitForTimeout(2500);
    ok(await pg.locator("[data-tour-card]").isVisible(), `${tag}: the bar's tour button opens the guided tour`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(4000);
    ok((await pg.evaluate(() => window.__DEMO__.role)) === "guest" && !(await pg.locator("[data-tour-card]").count()), `${tag}: leaving the tour returns to the chosen role`);
    // link guard
    await pg.evaluate(() => { window.open("https://wa.me/000000"); const a = document.createElement("a"); a.href = "mailto:x@example.org"; a.textContent = "m"; document.body.appendChild(a); a.click(); });
    await pg.waitForTimeout(300);
    ok(popups.length === 0 && /e-mail/.test(await pg.evaluate(() => document.querySelector("[data-demo-note]")?.textContent || "")), `${tag}: WhatsApp / mail links stay inside the demo`);
    // a change, then reset from the bar
    await pg.evaluate(async () => { const s = JSON.parse(sessionStorage.getItem("pmo_session"));
      await fetch("https://api.demo.invalid/rest/v1/comments", { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: "b0000001-0000-4000-8000-000000000076", author_id: s.user_id, author_name: "S", author_role: "guest", body: "reset me please" }) }); });
    await pg.waitForTimeout(500);
    if (label === "phone") { await pg.locator('[data-demo="more"]').click(); await pg.getByRole("menuitem", { name: /Reset demo/ }).click(); }
    else await pg.locator('[data-demo="reset"]').click();
    await pg.waitForTimeout(300); await pg.screenshot({ path: `${out}/reset-${label}.png` });
    await pg.locator('[data-demo="reset-confirm"]').click(); await pg.waitForTimeout(3500);
    const n = await pg.evaluate(async () => { const s = JSON.parse(sessionStorage.getItem("pmo_session"));
      const r = await fetch("https://api.demo.invalid/rest/v1/comments?body=eq.reset%20me%20please&select=id", { headers: { apikey: "x", Authorization: "Bearer " + s.access_token } }); return (await r.json()).length; });
    ok(n === 0 && !(await pg.locator(".dm-entry").count()) && (await pg.evaluate(() => window.__DEMO__.role)) === "guest", `${tag}: reset removes the change, keeps role, no start screen`);
    // sign out → start screen
    if (label === "desktop") {
      await pg.getByRole("button", { name: /Sign out/ }).first().click(); await pg.waitForTimeout(3000);
      ok(await pg.locator(".dm-entry").isVisible(), `${tag}: Sign out returns to the start screen`);
      await pg.locator('[data-start="tour"]').click(); await pg.waitForTimeout(4000);
      ok((await pg.evaluate(() => (window.__DEMO_EVENTS__||[]).map(e => e.event))).includes("tour_open"), `${tag}: "Take the guided tour" opens the tour`);
    }
    ok(errs.length === 0, `${tag}: no errors (${errs.length}) ${errs[0] || ""}`);
    ok(outside.length === 0, `${tag}: no outside requests (${outside.length}) ${outside[0] || ""}`);
    await ctx.close();
  }
}
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
