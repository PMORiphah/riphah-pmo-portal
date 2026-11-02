// Domain lock and framing: node tests/lock.mjs <dist/index.html>
// Serves the file under several addresses (through Playwright's routing; nothing is fetched from the
// real sites) and checks where the demo starts and where it shows only the notice.
import { chromium } from "./pw.mjs"; import fs from "node:fs";
const file = process.argv[2];
const html = fs.readFileSync(file, "utf8");
const b = await chromium.launch();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };

async function open(url, { frame = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [], outside = [];
  await ctx.route("**/*", (rt) => {
    const u = rt.request().url();
    if (u.startsWith("data:") || u.startsWith("blob:")) return rt.continue();
    if (u.startsWith("https://host.example/frame")) return rt.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>x</title><iframe src="${url}" style="width:900px;height:600px"></iframe>` });
    if (u.startsWith(new URL(url).origin)) return rt.fulfill({ status: 200, contentType: "text/html", body: html });
    outside.push(u); return rt.abort();
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(frame ? "https://host.example/frame" : url); await pg.waitForTimeout(2500);
  const target = frame ? pg.frames().find((f) => f !== pg.mainFrame()) : pg.mainFrame();
  const r = await target.evaluate(() => ({ entry: !!document.querySelector(".dm-entry"), locked: /runs only at its own address|can't be shown inside another page/.test(document.body.innerText),
    app: !!document.querySelector("#demo-shell"), upwork: !!document.querySelector('a[href*="upwork.com/freelancers/~015400e3035d103eb3"]') }));
  await ctx.close();
  return { ...r, errs, outside };
}
let r = await open("https://capital-projects-portal-demo.vercel.app/");
ok(r.entry && !r.locked, "starts at capital-projects-portal-demo.vercel.app");
r = await open("https://capital-projects-portal-demo-git-main-someone.vercel.app/");
ok(r.entry && !r.locked, "starts at the project's Vercel preview addresses");
r = await open("http://localhost:5299/");
ok(r.entry && !r.locked, "starts on localhost (testing)");
r = await open("https://copy-of-the-demo.example/");
ok(r.locked && !r.entry && !r.app && r.upwork, "anywhere else: only the notice (with the Upwork link), the demo does not start");
r = await open("https://capital-projects-portal-demo.vercel.app.attacker.example/");
ok(r.locked && !r.entry, "a look-alike address is refused");
r = await open("https://capital-projects-portal-demo.vercel.app/", { frame: true });
ok(r.locked && !r.entry, "inside another site's frame: only the notice");
ok(/<meta http-equiv="Content-Security-Policy" content="default-src 'none';/.test(html), "the file carries its Content-Security-Policy");
ok(!/connect-src[^"]*https:\/\/(?!eu\.i\.posthog\.com)/.test(html.match(/content="default-src[^"]*"/)[0]), "the policy allows no outside address except the analytics endpoint");
console.log(`\n${pass} pass, ${fail} fail`);
await b.close();
