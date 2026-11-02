import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], port = 5204, base = `http://localhost:${port}/`;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); const pg = await ctx.newPage();
let errs = []; pg.on("pageerror", e => errs.push(String(e).slice(0, 200)));
await ctx.route("**/*", (rt) => { const u = rt.request().url(); return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? rt.continue() : rt.abort(); });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const api = (method, path, body, prefer) => pg.evaluate(async ([method, path, body, prefer]) => {
  const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  const r = await fetch("https://api.demo.invalid" + path, { method, body: body == null ? undefined : JSON.stringify(body),
    headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) } });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}, [method, path, body, prefer]);
const go = async (q) => { await pg.goto(base + q); await pg.waitForTimeout(3000); };
const STORY = "b0000001-0000-4000-8000-000000000076";

await go("?role=pmo");
let d0 = (await api("GET", "/rest/v1/portfolio_dashboard?select=budget_consumed,total_capex")).body[0];
let p0 = (await api("GET", `/rest/v1/projects?id=eq.${STORY}&select=amount_released,name`)).body[0];
let r = await api("PATCH", `/rest/v1/projects?id=eq.${STORY}`, { amount_released: p0.amount_released + 1000000, budget_release_date: "2026-10-14" }, "return=minimal");
ok(r.status === 204, `PMO PATCH project → ${r.status}`);
let d1 = (await api("GET", "/rest/v1/portfolio_dashboard?select=budget_consumed")).body[0];
ok(d1.budget_consumed === d0.budget_consumed + 1000000, `dashboard released follows the edit (${d0.budget_consumed} → ${d1.budget_consumed})`);
let pm1 = (await api("GET", `/rest/v1/project_metrics?id=eq.${STORY}&select=amount_released,actual_start_date`)).body[0];
ok(pm1.amount_released === p0.amount_released + 1000000 && pm1.actual_start_date === "2026-10-14", `project_metrics follows, actual start from release date (${pm1.actual_start_date})`);
let log = (await api("GET", "/rest/v1/activity_log?select=summary,actor_name,details&order=id.desc&limit=1")).body[0];
ok(/Clinical Skills Lab Upgrade" updated/.test(log.summary) && log.details.changed.includes("amount_released"), `Activity Log: ${log.summary}`);
r = await api("POST", "/rest/v1/comments", { project_id: STORY, author_id: (await pg.evaluate(() => JSON.parse(sessionStorage.getItem("pmo_session")).user_id)), author_name: "PMO Admin", author_role: "pmo", body: "Demo test post from PMO", is_read_by_pmo: true }, "return=representation");
ok(r.status === 201 && r.body[0]?.id && r.body[0]?.created_at, `PMO POST comment → ${r.status}, id ${r.body?.[0]?.id?.slice(0, 8)}`);
const cid = r.body[0].id;
r = await api("POST", "/rest/v1/project_risks", { project_id: STORY, title: "x" }, "return=minimal");
ok(r.status === 201, "PMO can add a risk");
await pg.waitForTimeout(500);
// upload a file and sign it
const up = await pg.evaluate(async () => {
  const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  const H = { apikey: "x", Authorization: "Bearer " + s.access_token };
  const r1 = await fetch("https://api.demo.invalid/storage/v1/object/project-attachments/p1/test.txt", { method: "POST", headers: { ...H, "Content-Type": "text/plain" }, body: new Blob(["hello demo"], { type: "text/plain" }) });
  const r2 = await fetch("https://api.demo.invalid/storage/v1/object/sign/project-attachments/p1/test.txt", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }) });
  const j = await r2.json(); const t = await (await fetch(j.signedURL)).text();
  return [r1.status, r2.status, t];
});
ok(up[0] === 200 && up[2] === "hello demo", `upload kept in the page and opens (${up.join(", ")})`);
// a generated document opens
const doc = await pg.evaluate(async () => {
  const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  const r = await fetch("https://api.demo.invalid/rest/v1/project_attachments?select=file_path&limit=1", { headers: { apikey: "x", Authorization: "Bearer " + s.access_token } });
  const [a] = await r.json();
  const r2 = await fetch("https://api.demo.invalid/storage/v1/object/sign/project-attachments/" + a.file_path.split("/").map(encodeURIComponent).join("/"), { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: "{}" });
  const j = await r2.json(); const blob = await (await fetch(j.signedURL)).blob(); return [r2.status, blob.type, blob.size];
});
ok(doc[0] === 200 && doc[2] > 1000, `generated document opens (${doc.join(", ")})`);
// assistant
r = await api("POST", "/functions/v1/ask", { question: "where do we stand overall?", history: [] });
ok(r.status === 200 && /projects/.test(r.body.answer), `assistant answers: ${String(r.body?.answer).split("\n")[2]?.slice(0, 120)}`);
r = await api("POST", "/functions/v1/notify-comment", { comment_id: cid });
const note = await pg.evaluate(() => document.querySelector("[data-demo-note]")?.textContent || "");
ok(r.status === 200 && /In your deployment/.test(note), `server feature note: ${note.slice(0, 80)}`);

// persistence across reload
await go("");
let p2 = (await api("GET", `/rest/v1/projects?id=eq.${STORY}&select=amount_released`)).body[0];
ok(p2.amount_released === p0.amount_released + 1000000, "edit kept after reload");
ok((await api("GET", `/rest/v1/comments?id=eq.${cid}&select=id`)).body.length === 1, "post kept after reload");
const again = await pg.evaluate(async () => {
  const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  const r = await fetch("https://api.demo.invalid/storage/v1/object/sign/project-attachments/p1/test.txt", { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return "status " + r.status; const j = await r.json(); return await (await fetch(j.signedURL)).text();
});
ok(again === "hello demo", `uploaded file still opens after reload (${again})`); console.log(await pg.evaluate(async () => JSON.stringify(await indexedDB.databases())));

// project manager
await go("?role=pm");
const pmId = await pg.evaluate(() => JSON.parse(sessionStorage.getItem("pmo_session")).user_id);
const mine = (await api("GET", "/rest/v1/projects?select=id")).body;
ok(mine.length === 7, `PM sees ${mine.length} projects`);
ok((await api("GET", "/rest/v1/project_cashflows?select=id")).body.length === 0, "PM sees no cash flows");
ok((await api("GET", "/rest/v1/project_risks?select=id")).body.length === 0, "PM sees no risks");
ok((await api("GET", "/rest/v1/activity_log?select=id")).body.length === 0, "PM sees no Activity Log");
const pmDash = (await api("GET", "/rest/v1/portfolio_dashboard?select=total_projects")).body[0];
ok(pmDash.total_projects === 7, `PM dashboard view counts own projects only (${pmDash.total_projects})`);
const other = "b0000001-0000-4000-8000-000000000064";
r = await api("PATCH", `/rest/v1/projects?id=eq.${STORY}`, { name: "hacked" }, "return=representation");
ok(r.status === 200 && r.body.length === 0, "PM cannot change a project (0 rows, like row security)");
r = await api("POST", "/rest/v1/project_tasks", { project_id: STORY, name: "PM task", start_date: "2026-10-16", end_date: "2026-10-20", pct_complete: 0, sort_order: 99 }, "return=representation");
ok(r.status === 201, `PM adds a WBS task on own project → ${r.status}`);
r = await api("POST", "/rest/v1/project_tasks", { project_id: other, name: "x" }, "return=minimal");
ok(r.status === 403, `PM task on someone else's project refused → ${r.status}`);
const del = (await api("GET", `/rest/v1/project_deliverables?project_id=eq.${STORY}&select=id,title&limit=1`)).body[0];
r = await api("PATCH", `/rest/v1/project_deliverables?id=eq.${del.id}`, { note: "arrived today", status: "delivered" }, "return=representation");
ok(r.body.length === 1, "PM ticks a deliverable and adds a note");
r = await api("PATCH", `/rest/v1/project_deliverables?id=eq.${del.id}`, { title: "renamed" }, "return=representation");
ok(r.body.length === 0, "PM cannot rename a deliverable");
r = await api("POST", "/rest/v1/comments", { project_id: STORY, author_id: pmId, author_name: "Nadia", author_role: "project_manager", body: "PM update" }, "return=minimal");
ok(r.status === 201, "PM posts an update on own project");
r = await api("POST", "/functions/v1/ask", { question: "How much has been released on my projects?", history: [] });
ok(/your assigned projects/.test(r.body.answer), "assistant scopes to the PM's projects");

// senior management
await go("?role=guest");
ok((await api("GET", "/rest/v1/projects?select=id")).body.length === 51, "guest reads the whole portfolio");
r = await api("PATCH", `/rest/v1/projects?id=eq.${STORY}`, { name: "x" }, "return=representation");
ok(r.body.length === 0, "guest cannot change a project");
ok((await api("GET", "/rest/v1/project_todos?select=id")).status === 200, "guest: PMO-only table reads empty, no error");

// reset
await pg.evaluate(() => window.__DEMO__.reset()); await pg.waitForTimeout(3000);
let p3 = (await api("GET", `/rest/v1/projects?id=eq.${STORY}&select=amount_released`)).body[0];
ok(p3.amount_released === p0.amount_released, "Reset demo puts the figures back");
ok((await pg.evaluate(() => window.__DEMO__.role)) === "guest", "Reset keeps the chosen role");
await go("?role=pmo");
const gone = await pg.evaluate(async () => {
  const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  const r = await fetch("https://api.demo.invalid/storage/v1/object/sign/project-attachments/p1/test.txt", { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: "{}" });
  return r.status;
});
ok(gone === 400, `Reset removes uploaded files (${gone})`);
ok(errs.length === 0, `no page errors (${errs.length}) ${errs[0] || ""}`);
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
