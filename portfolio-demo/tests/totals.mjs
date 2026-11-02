// Totals: node tests/totals.mjs <dist/index.html>
// Every headline figure is recomputed here from data/seed.json with plain sums (not the demo's own view
// code) and compared with what the demo's backend serves and what the screens show. Run in PKR, the
// data's own currency, so the figures match to the unit; the conversion to other currencies is checked
// in mine.mjs. The September board report is checked by walking the Activity Log back to 30 September.
import { chromium } from "./pw.mjs"; import http from "node:http"; import fs from "node:fs";
const file = process.argv[2], port = 5216, base = `http://localhost:${port}/`;
const seed = JSON.parse(fs.readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const T = seed.tables;
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(fs.readFileSync(file)); }).listen(port);
const b = await chromium.launch();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const sum = (rows, f) => rows.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const M = (v) => (v / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
const near = (a, b) => Math.abs(a - b) < 0.01;

// ── independent figures ──
const capex = T.projects.filter((p) => p.portfolio === "capex"), inv = T.projects.filter((p) => p.portfolio === "investment");
const fresh = capex.filter((p) => !p.is_carry_forward);
const want = {
  total_projects: capex.length, total_capex: sum(capex, (p) => p.df_recommended_amount), df_recommended_total: sum(fresh, (p) => p.df_recommended_amount),
  su_requested_total: sum(fresh, (p) => p.su_requested_amount), approved_total: sum(fresh, (p) => p.bac), budget_consumed: sum(capex, (p) => p.amount_released),
  payments_made_total: sum(capex, (p) => p.payments_made), approved_count: fresh.filter((p) => p.workflow_stage === "approved").length,
  closed_count: capex.filter((p) => p.workflow_stage === "closed").length,
};
const wantInv = { total_projects: inv.length, df_recommended_total: sum(inv, (p) => p.df_recommended_amount), released_total: sum(inv, (p) => p.amount_released), payments_made_total: sum(inv, (p) => p.payments_made) };
const cfPlan = sum(T.project_cashflows.filter((c) => c.bucket !== "investment"), (c) => c.amount);
const carry = sum(T.carry_forward_projects, (c) => c.amount);
const goods = T.inventory_items.filter((i) => !i.is_service && !i.sap_deleted);
const payGross = sum(T.project_payments.filter((x) => capex.some((p) => p.id === x.project_id)), (x) => x.gross);

const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
await ctx.route("**/*", (rt) => { const u = rt.request().url(); return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? rt.continue() : rt.abort(); });
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
await pg.goto(`${base}?role=pmo`); await pg.waitForTimeout(800);
await pg.evaluate(() => localStorage.setItem("cpp-demo-brand", JSON.stringify({ currency: "PKR" })));
await pg.reload(); await pg.waitForTimeout(3500);
const api = (path) => pg.evaluate(async (path) => { const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  return (await fetch("https://api.demo.invalid" + path, { headers: { apikey: "x", Authorization: "Bearer " + s.access_token } })).json(); }, path);
const text = () => pg.evaluate(() => document.getElementById("root").textContent);

// backend views
const d = (await api("/rest/v1/portfolio_dashboard?select=*"))[0];
for (const [k, v] of Object.entries(want)) ok(near(d[k], v), `dashboard ${k}: ${d[k]} = ${v}`);
const im = (await api("/rest/v1/investment_metrics?select=*"))[0];
for (const [k, v] of Object.entries(wantInv)) ok(near(im[k], v), `investments ${k}: ${im[k]} = ${v}`);
ok(near(sum(await api("/rest/v1/project_cashflows?select=amount,bucket&bucket=neq.investment"), (c) => c.amount), cfPlan), `cash-flow plan (CAPEX + accreditation) ${cfPlan}`);
// screens
let t = await text();
ok(t.includes(M(want.total_capex)), `dashboard shows total CAPEX ${M(want.total_capex)}`);
ok(t.includes(M(want.approved_total)) || t.includes(M(sum(fresh.filter((p) => ["approved", "closed"].includes(p.workflow_stage)), (p) => p.bac))), `dashboard shows approved ${M(want.approved_total)}`);
ok(t.includes(M(carry)), `carry forward card = list total ${M(carry)}`);
await pg.evaluate(() => window.__DEMO__.nav.setPage("cashflow")); await pg.waitForTimeout(1800);
t = await text();
ok(t.includes(M(want.total_capex)) && t.includes(M(want.budget_consumed)), `cash flows: CAPEX ${M(want.total_capex)}, released ${M(want.budget_consumed)}`);
await pg.evaluate(() => window.__DEMO__.nav.setPage("inventory")); await pg.waitForTimeout(2000);
t = await text();
ok(t.includes(M(sum(goods, (i) => i.total))), `inventory total value (goods) ${M(sum(goods, (i) => i.total))}`);
ok(t.includes(String(goods.length)), `inventory goods lines ${goods.length}`);
const capexPay = (await api("/rest/v1/project_payments?select=gross,project_id")).filter((x) => capex.some((p) => p.id === x.project_id));
ok(near(sum(capexPay, (x) => x.gross), payGross) && near(payGross, want.payments_made_total), `itemised CAPEX payments ${payGross} = Payments Made ${want.payments_made_total}`);
// the assistant's figure
const a = await pg.evaluate(async () => { const s = JSON.parse(sessionStorage.getItem("pmo_session"));
  return (await (await fetch("https://api.demo.invalid/functions/v1/ask", { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ question: "How much has been released?" }) })).json()).answer; });
ok(a.includes(`PKR ${M(want.budget_consumed)}`.replace(/(\d)M$/, "$1M")), `assistant: released PKR ${M(want.budget_consumed)}`);

// ── the September board report: walk today's projects back to 30 Sep through the Activity Log ──
const rep = T.board_reports.find((r) => r.status === "published");
const asAt = rep.as_at;
const state = new Map(capex.map((p) => [p.id, { ...p }]));
for (const e of [...T.activity_log].filter((e) => e.entity_type === "projects" && e.created_at > asAt + "T23:59:59Z").sort((x, y) => y.created_at.localeCompare(x.created_at))) {
  const p = state.get(e.entity_id); if (!p || !e.details?.old) continue;
  Object.assign(p, e.details.old);
}
const then = [...state.values()].filter((p) => p.created_at <= asAt + "T23:59:59Z");
const H = rep.figures.headline;
const isA = (p) => ["approved", "closed"].includes(p.workflow_stage);
ok(H.capex_count === then.length, `report: ${H.capex_count} CAPEX projects = ${then.length}`);
ok(near(H.df_total, sum(then, (p) => p.df_recommended_amount)), `report: DF total ${H.df_total} = ${sum(then, (p) => p.df_recommended_amount)}`);
ok(near(H.approved_bac, sum(then.filter(isA), (p) => p.bac)), `report: approved ${H.approved_bac} = ${sum(then.filter(isA), (p) => p.bac)}`);
ok(near(H.released_total, sum(then, (p) => p.amount_released)), `report: released ${H.released_total} = ${sum(then, (p) => p.amount_released)}`);
await pg.evaluate(() => window.__DEMO__.nav.setPage("reports")); await pg.waitForTimeout(1500);
await pg.getByText(/Monthly Board Report: September/).first().click(); await pg.waitForTimeout(2000);
const rt = await pg.evaluate(() => document.querySelector('[data-tour="report-viewer"]')?.textContent || "");   // the viewer is drawn over the page, outside #root
ok(rt.includes(M(H.df_total)) && rt.includes(M(H.released_total)), `report on screen shows DF ${M(H.df_total)} and released ${M(H.released_total)}`);
ok(errs.length === 0, `no errors (${errs.length})`);
console.log(`\n${pass} pass, ${fail} fail`);
await b.close(); srv.close();
