// PMO Simulation (live data): the scene-subject rules (src/sim/live/select.js). PUBLIC, no data.
//
//   node scripts/sim/live/select.test.mjs                       (invented data only)
//   SIM_FIXTURE=<private dir> node scripts/sim/live/select.test.mjs   (+ the golden plan of the fixture)
//
// Part 1 runs on scripts/sim/live/synthetic.mjs (invented) and checks every rule and its variants by
// mutation. Part 2 runs on the private fixture (fixture-tables.json + fixture-expect.json) and is
// skipped when SIM_FIXTURE is unset; no value from it is printed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { selectPlan, candidatesOf, aliasOf, detectTestAccounts, testAccountCandidatesOf } from "../../../src/sim/live/select.js";
import { fmtM } from "../../../src/sim/live/format.js";
import { syntheticTables, syntheticCtx, IDS, NOW } from "./synthetic.mjs";

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const T = () => structuredClone(syntheticTables());
const plan = (tables = T(), over = {}) => selectPlan(tables, syntheticCtx(over));
const proj = (t, n) => t.projects.find((p) => p.id === IDS.project(n));
const met = (t, n) => t.project_metrics.find((p) => p.id === IDS.project(n));
let n = 0;
const ok = (name, fn) => { fn(); n++; void name; };

// ── Part 1: invented data ────────────────────────────────────────────────────
ok("baseline", () => {
  const p = plan();
  assert.equal(p.v, 1);
  assert.deepEqual(p.asOf, { takenAt: NOW, pktDate: "2031-03-10", utcDate: "2031-03-10", hhmm: "10:30", dateText: "10 Mar 2031", fyLabel: "FY 2030-31" });
  assert.deepEqual(p.dashboard, { capexTotal: 162e6, capexCount: 14, dfTotal: 162e6, dfLive: true, progN: 3, progClause: "caveat", closedN: 1, closedLive: true });
  assert.deepEqual(p.investments, { invN: 1, invFull: true });
  assert.deepEqual(p.pdd, { notSubmitted: 4, reviewer: "in_ed", reviewerN: 2 });
  assert.deepEqual(p.payments, { released: 68e6, relPctText: "42.0%", relPct: 42, paidProjects: 1, paidTotal: 500000, variant: "one" });
  assert.deepEqual(p.cashflow, { hasRows: true, peakMonth: "2031-04-01", peakLabel: "Apr 31", monthName: "April", peakTotal: 15e6, peaked: false });
  const s = p.story;
  assert.equal(s.id, IDS.project(1)); assert.equal(s.kind, "progress"); assert.equal(s.searchText, "XQZ"); assert.equal(s.searchRows, 1);
  assert.equal(s.alias, "XQZ renovation"); assert.equal(s.tag, "XQZ"); assert.equal(s.aliasScreen, "XQZ");
  assert.equal(s.pmId, IDS.user(2)); assert.equal(s.docCount, 2); assert.equal(s.hasPddDoc, true); assert.equal(s.pddFile, "PDD XQZ Hall.pdf");
  assert.equal(s.releasedState, "full"); assert.equal(s.pct, 60); assert.equal(s.endDate, "2031-06-30"); assert.equal(s.endPassed, false);
  assert.equal(s.tasks, 0); assert.equal(s.wbsWide, false); assert.equal(s.campus, "North Campus");
  assert.deepEqual(p.timeline, { campus: "North Campus", anyLate: true, anyPdd: true, scheduled: 13 });
  assert.deepEqual(p.performance, { rowsShown: 7, delayed: 3, delayedNoPct: 3, withPct: 3, variant: "all", storyShown: true, storyOnTime: true });
  assert.deepEqual(p.risks, { total: 5, open: 4, critical: 0, cell: "medium-high", cellN: 3, cellShown: 3, prob: "medium", impact: "high", rowId: IDS.risk(2) });
  const c = p.compare;
  assert.equal(c.campusCount, 4);
  assert.deepEqual(c.defaults, ["South Campus", "North Campus"]);
  assert.deepEqual(c.trio, ["North Campus", "South Campus", "East Campus"]);
  assert.deepEqual(c.tickOps, [{ op: "tick", campus: "East Campus" }]);
  assert.deepEqual(c.columns, ["South Campus", "North Campus", "East Campus"]);
  assert.deepEqual(c.leaders, { A: "South Campus", R: "South Campus", S: "North Campus", T: "East Campus" });
  assert.equal(c.leaderVariant, "AR_T"); assert.equal(c.tie, false);
  assert.deepEqual(c.trailer, { campus: "East Campus", releasedRate: 0.05, pddNot: 1, projects: 3 });
  assert.deepEqual(p.assign, { campus: "East Campus", variant: "trio", total: 3, skippedClosed: 0, toAssign: 2, leftAlone: 1 });
  assert.deepEqual(p.users, { count: 7, testIds: [IDS.user(5)], testClause: "one", row: { userId: IDS.user(2), username: "pm.alpha", fullName: "Alpha Person", assigned: 4 } });
  assert.deepEqual(p.updates, { projectId: IDS.project(6), code: "SX-01", lastCommentId: IDS.comment(2), count: 2, threads: 2, variant: "pm" });
  assert.deepEqual(p.past, { open: 2, noProgress: 1, id: IDS.past(1), code: "PX-01", messages: 4, lastMessageId: IDS.pastMsg(4), searchText: "Studio", variant: "thread" });
  const g = p.gallery;
  assert.equal(g.total, 6); assert.equal(g.photos, 5); assert.equal(g.videos, 1); assert.equal(g.projectId, IDS.project(6)); assert.equal(g.campus, "South Campus");
  assert.equal(g.filteredCount, 3); assert.equal(g.onlyProject, true); assert.equal(g.variant, "subject"); assert.equal(g.alias, "Sports Court");
  assert.equal(g.firstPhotoId, IDS.att(11));
  assert.deepEqual(p.report, { id: IDS.report(2), kind: "draft", month: "February", year: 2031, asAtText: "5 Mar 2031", attentionNone: false,
    kicker: "February 2031 · draft · figures as at 5 Mar 2031", variant: "draft", monthly: 1, stale: false, staleTiles: [] });
  assert.deepEqual(p.flags.typedTexts.map((x) => `${x.key}.${x.field}`), ["approved_projects.insight", "remaining_capex.sub"]);
  assert.deepEqual(p.flags.overrideRejected, []);
});

ok("pure, JSON-only, deterministic, no real clock, no plan tables", () => {
  const t = T();
  const a = plan(t);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, "JSON round trip");
  assert.equal(canon(plan(T())), canon(a), "same input, same plan");
  const realNow = Date.now;
  Date.now = () => { throw new Error("selectPlan read the real clock"); };
  try { plan(T()); } finally { Date.now = realNow; }
  const t2 = T();
  t2.project_tasks = [{ id: "t1", project_id: IDS.project(1), name: "x" }];
  t2.project_raci = [{ id: "r1", project_id: IDS.project(1), raci_role: "R" }];
  t2.past_project_tasks = [{ id: "pt1", past_project_id: IDS.past(1) }];
  assert.equal(canon(plan(t2)), canon(a), "the plan does not read plan-dependent tables");
  assert.throws(() => selectPlan(T(), { overrides: {} }), /ctx.now/);
});

ok("dashboard, investments, PDD, payments variants", () => {
  let t = T(); t.portfolio_dashboard[0].reporting_progress_count = 0; assert.equal(plan(t).dashboard.progClause, "await");
  t = T(); t.portfolio_dashboard[0].reporting_progress_count = 7; assert.equal(plan(t).dashboard.progClause, "none");
  t = T(); t.settings[1].value.df_recommended.value = "170.0M"; assert.equal(plan(t).dashboard.dfLive, false);
  t = T(); t.investment_metrics[0].total_projects = 0; assert.equal(plan(t).investments.invN, 0);
  t = T(); t.investment_metrics[0].released_total = 10e6; assert.equal(plan(t).investments.invFull, false);
  t = T(); Object.assign(t.portfolio_dashboard[0], { in_df: 2, in_ed: 2, in_mt: 1 }); assert.deepEqual(plan(t).pdd, { notSubmitted: 4, reviewer: "in_ed", reviewerN: 2 });
  t = T(); Object.assign(t.portfolio_dashboard[0], { in_df: 2, in_ed: 2, in_mt: 2 }); assert.equal(plan(t).pdd.reviewer, "in_mt", "a tie goes to the later stage");
  t = T(); Object.assign(t.portfolio_dashboard[0], { in_df: 0, in_ed: 0, in_mt: 0 }); assert.deepEqual(plan(t).pdd, { notSubmitted: 4, reviewer: null, reviewerN: 0 });
  t = T(); t.portfolio_dashboard[0].budget_consumed = 0; assert.equal(plan(t).payments.variant, "nothing");
  t = T(); t.projects.forEach((p) => { p.payments_made = 0; }); assert.equal(plan(t).payments.variant, "none");
  t = T(); [6, 10].forEach((k) => { proj(t, k).payments_made = 1000; }); assert.equal(plan(t).payments.variant, "few");
  t = T(); [1, 6, 10, 13].forEach((k) => { proj(t, k).payments_made = 1000; }); assert.equal(plan(t).payments.variant, "paid");
  t = T(); t.settings[1].value.budget_released = { value: "", sub: "typed note" };
  assert.equal(plan(t).payments.relPctText, null); assert.equal(plan(t).payments.relPct, null);
  t = T(); t.portfolio_dashboard[0].total_capex = 0; assert.equal(plan(t).payments.relPctText, null, "no NaN in the plan");
});

ok("cashflow", () => {
  assert.equal(plan(T(), { now: Date.parse("2031-05-20T05:00:00Z") }).cashflow.peaked, true);
  let t = T(); t.project_cashflows = t.project_cashflows.filter((r) => r.bucket === "investment");
  assert.deepEqual(plan(t).cashflow, { hasRows: false, peakMonth: null, peakLabel: null, monthName: null, peakTotal: null, peaked: false });
  t = T(); t.project_cashflows.push({ id: "x", month: "2031-05-01", amount: 1, bucket: "pmdc" });
  assert.equal(plan(t).cashflow.peakMonth, "2031-05-01", "the larger month wins");
});

ok("story candidates, fallbacks and overrides", () => {
  let t = T(); t.project_attachments = t.project_attachments.filter((a) => !(a.project_id === IDS.project(1) && a.kind === "document"));
  let s = plan(t).story;
  assert.equal(s.id, IDS.project(13)); assert.equal(s.hasPddDoc, false); assert.equal(s.alias, "Old Library"); assert.equal(s.token, null);
  assert.equal(s.tag, "Old Library"); assert.equal(s.aliasScreen, "Library");
  t = T(); proj(t, 1).pct_complete = 0; proj(t, 13).pct_complete = 0;
  s = plan(t).story; assert.equal(s.id, IDS.project(5)); assert.equal(s.kind, "closed"); assert.equal(s.stage, "closed");
  assert.equal(s.searchText, "NX-05", "no all-caps token: the code is typed");
  t = T(); proj(t, 1).pct_complete = 0; proj(t, 13).pct_complete = 0;
  t.project_attachments = t.project_attachments.filter((a) => a.kind !== "document");
  const p0 = plan(t);
  assert.equal(p0.story, null); assert.equal(p0.timeline.campus, null); assert.equal(p0.performance.storyShown, false);
  t = T(); met(t, 1).schedule_flag = "delayed"; assert.equal(plan(t).story.id, IDS.project(13), "on schedule only");
  t = T(); met(t, 1).budget_flag = "over"; assert.equal(plan(t).story.id, IDS.project(13), "not over budget");
  t = T(); proj(t, 1).end_date = "2031-03-09"; assert.equal(plan(t).story.id, IDS.project(13), "planned end not passed");
  t = T(); proj(t, 1).end_date = "2031-03-10"; assert.equal(plan(t).story.id, IDS.project(1), "ends today: still a candidate");
  t = T(); for (let k = 0; k < 3; k++) t.projects.push({ ...proj(t, 3), id: `xx${k}`, code: `ZZ-0${k}`, name: `XQZ annex ${k}` });
  s = plan(t).story; assert.equal(s.searchText, "NX-01"); assert.equal(s.searchRows, 1);
  t = T(); proj(t, 1).bac = 30e6; assert.equal(plan(t).story.releasedState, "partly");
  t = T(); t.project_task_rollup = [{ project_id: IDS.project(1), task_count: 3 }, { project_id: IDS.project(2), task_count: 1 }];
  s = plan(t).story; assert.equal(s.tasks, 3); assert.equal(s.wbsWide, true, "2 of 14 CAPEX projects have tasks");
  t = T(); t.project_task_rollup = [{ project_id: IDS.project(2), task_count: 1 }]; assert.equal(plan(t).story.wbsWide, false);
  let p = plan(T(), { overrides: { storyId: IDS.project(13) } }); assert.equal(p.story.id, IDS.project(13)); assert.deepEqual(p.flags.overrideRejected, []);
  p = plan(T(), { overrides: { storyId: IDS.project(5) } }); assert.equal(p.story.kind, "closed", "a closed candidate may be chosen");
  p = plan(T(), { overrides: { storyId: IDS.project(2) } }); assert.equal(p.story.id, IDS.project(1)); assert.deepEqual(p.flags.overrideRejected, ["storyId"]);
  p = plan(T(), { overrides: { storyAlias: "the hall works" } }); assert.equal(p.story.alias, "the hall works"); assert.equal(p.story.tag, "XQZ");
  p = plan(T(), { overrides: { storyAlias: "something else" } }); assert.equal(p.story.alias, "XQZ renovation"); assert.deepEqual(p.flags.overrideRejected, ["storyAlias"]);
});

ok("aliasOf", () => {
  assert.deepEqual(aliasOf({ name: "Renovation & Upgradation of XQZ Block", campus: "Far Campus" }), { alias: "XQZ renovation", token: "XQZ" });
  assert.deepEqual(aliasOf({ name: "Campus Relocation Farfield To Nearby", campus: "Farfield" }), { alias: "Farfield relocation", token: "Farfield" });
  assert.deepEqual(aliasOf({ name: "Establishment of Zeta House (QRS)", campus: "QRS" }), { alias: "Zeta House", token: null });
  assert.deepEqual(aliasOf({ name: "Procurement of Lab Kits for Year One", campus: "Q" }), { alias: "Lab Kits for Year", token: null });
  assert.deepEqual(aliasOf({ name: "KIOSK Cabin Q-9", campus: "Q-9" }), { alias: "KIOSK Cabin Q-9", token: "KIOSK" });
  assert.deepEqual(aliasOf({ name: "Main Gate QRS works", campus: "QRS" }), { alias: "Main Gate QRS works", token: "QRS" }, "the campus itself is a last resort token");
});

ok("timeline", () => {
  let t = T(); proj(t, 2).end_date = "2031-12-31"; assert.equal(plan(t).timeline.anyLate, false);
  t = T(); t.projects.forEach((p) => { if (p.workflow_stage === "pdd_not_submitted") p.workflow_stage = "identified"; });
  assert.equal(plan(t).timeline.anyPdd, false);
  t = T(); t.project_task_rollup = [{ project_id: IDS.project(2), tasks_start: "2031-01-01", tasks_end: "2031-09-01", task_count: 2 }];
  assert.equal(plan(t).timeline.anyLate, false, "a breakdown's end wins over the planned end");
  t = T(); proj(t, 14).start_date = "2031-01-01"; proj(t, 14).end_date = "2030-12-01"; assert.equal(plan(t).timeline.scheduled, 13, "end before start is unscheduled");
});

ok("performance variants", () => {
  let t = T(); met(t, 2).pct_complete = 10; assert.equal(plan(t).performance.variant, "most");
  t = T(); met(t, 2).pct_complete = 10; met(t, 6).pct_complete = 10; assert.equal(plan(t).performance.variant, "count");
  t = T(); t.project_metrics.forEach((m) => { if (m.schedule_flag === "delayed") m.schedule_flag = "on_time"; }); assert.equal(plan(t).performance.variant, "none");
  t = T(); met(t, 1).workflow_stage = "mt_review"; assert.equal(plan(t).performance.storyShown, false);
});

ok("risks", () => {
  let t = T(); t.project_risks_scored.push({ id: "zz", project_id: IDS.project(6), probability: "high", impact: "high", status: "open", title: "Big one", severity: "critical" });
  let r = plan(t).risks; assert.equal(r.critical, 1); assert.equal(r.cell, "high-high"); assert.equal(r.cellN, 1); assert.equal(r.rowId, "zz");
  t = T(); t.project_risks_scored[1].status = "closed"; t.project_risks_scored[2].status = "closed";
  r = plan(t).risks; assert.equal(r.cell, "medium-high"); assert.equal(r.cellN, 3); assert.equal(r.cellShown, 1, "closed risks are not counted in the cell");
  assert.equal(r.rowId, IDS.risk(1), "no row qualifies: the cell's first row");
  t = T(); t.project_risks_scored.forEach((x) => { x.status = "closed"; }); r = plan(t).risks; assert.equal(r.cell, null); assert.equal(r.open, 0);
  t = T(); t.project_risks_scored = []; r = plan(t).risks; assert.equal(r.total, 0); assert.equal(r.cell, null);
  let p = plan(T(), { overrides: { riskRowId: IDS.risk(3) } }); assert.equal(p.risks.rowId, IDS.risk(3));
  p = plan(T(), { overrides: { riskRowId: IDS.risk(5) } }); assert.equal(p.risks.rowId, IDS.risk(2)); assert.deepEqual(p.flags.overrideRejected, ["riskRowId"]);
  t = T(); t.project_risks_scored.push({ id: "m1", project_id: IDS.project(13), probability: "medium", impact: "medium", status: "open", title: "a", severity: "medium" },
    { id: "m2", project_id: IDS.project(13), probability: "medium", impact: "medium", status: "open", title: "b", severity: "medium" });
  assert.equal(plan(t).risks.cell, "medium-high", "a tie goes to the higher severity");
});

ok("compare leaders and the equal-figure guard", () => {
  let t = T(); proj(t, 1).bac = 41e6;       // North approved 50.0M = South 50.0M
  let c = plan(t).compare; assert.equal(c.tie, true); assert.equal(c.leaderVariant, "tie");
  t = T(); proj(t, 1).bac = 41.04e6;        // 50.04M prints 50.0M too
  assert.equal(plan(t).compare.leaderVariant, "tie");
  t = T(); proj(t, 10).amount_released = 5e6; c = plan(t).compare;   // East 25 %: not under half the median
  assert.equal(c.leaders.T, null); assert.equal(c.leaderVariant, "AR_S");
  t = T(); proj(t, 10).amount_released = 8e6; proj(t, 6).amount_released = 59e6; c = plan(t).compare;
  assert.equal(c.leaders.S, "South Campus"); assert.equal(c.leaderVariant, "ARS");
  t = T(); proj(t, 10).amount_released = 5e6; proj(t, 1).amount_released = 20e6; proj(t, 2).amount_released = 20e6; c = plan(t).compare;
  assert.equal(c.leaders.R, "North Campus"); assert.equal(c.leaderVariant, "A_R");
  t = T(); proj(t, 13).campus = null; c = plan(t).compare; assert.equal(c.campusCount, 5); assert.ok(!c.trio.includes("No campus"));
  t = T(); proj(t, 13).df_recommended_amount = 100e6; c = plan(t).compare;   // defaults become West (102) and South (88)
  assert.deepEqual(c.defaults, ["West Campus", "South Campus"]);
  assert.deepEqual(c.tickOps, [{ op: "untick", campus: "West Campus" }, { op: "tick", campus: "North Campus" }, { op: "tick", campus: "East Campus" }]);
  assert.deepEqual(c.columns, ["South Campus", "North Campus", "East Campus"]);
});

ok("assign", () => {
  let t = T(); t.project_assignments.push({ id: "a1", project_id: IDS.project(11), user_id: IDS.user(4) }, { id: "a2", project_id: IDS.project(12), user_id: IDS.user(4) });
  let a = plan(t).assign; assert.equal(a.campus, "North Campus"); assert.equal(a.variant, "trio"); assert.equal(a.toAssign, 1); assert.equal(a.leftAlone, 3); assert.equal(a.skippedClosed, 1);
  t.project_assignments.push({ id: "a3", project_id: IDS.project(4), user_id: IDS.user(2) });
  proj(t, 14).id = "west-unassigned"; t.project_assignments = t.project_assignments.filter((x) => x.project_id !== IDS.project(14));
  a = plan(t).assign; assert.equal(a.campus, "West Campus"); assert.equal(a.variant, "other");
  t.project_assignments.push({ id: "a4", project_id: "west-unassigned", user_id: IDS.user(6) });
  a = plan(t).assign; assert.equal(a.variant, "none"); assert.equal(a.campus, "South Campus"); assert.equal(a.toAssign, 0);
});

ok("users", () => {
  let p = plan(T(), { testAccounts: [] }); assert.equal(p.users.testClause, "none"); assert.deepEqual(p.users.testIds, []);
  assert.equal(p.users.row.username, "pm.alpha");
  p = plan(T(), { testAccounts: [IDS.user(5), IDS.user(7)] }); assert.equal(p.users.testClause, "some");
  p = plan(T(), { testAccounts: [IDS.user(2)] }); assert.deepEqual(p.users.testIds, [IDS.user(2)], "a ticked account with assignments counts as a test account");
  assert.equal(p.users.testClause, "one"); assert.notEqual(p.users.row?.username, "pm.alpha", "a test account is never the named row");
  p = plan(T(), { overrides: { usersUserId: IDS.user(4) } }); assert.equal(p.users.row.username, "pm.alpha"); assert.deepEqual(p.flags.overrideRejected, ["usersUserId"]);
  p = plan(T(), { overrides: { usersUserId: IDS.user(3) } }); assert.equal(p.users.row.username, "pm.bravo");
  let t = T(); t.user_profiles[1].full_name = ""; assert.equal(plan(t).users.row.username, "pm.bravo", "a row without a full name is not named");
  t = T(); t.project_assignments = t.project_assignments.filter((x) => ![IDS.user(2), IDS.user(3)].includes(x.user_id));
  assert.equal(plan(t).users.row, null);
  const pt = T(); pt.user_profiles[4].email = "someone@example.org"; pt.user_profiles[4].username = "pm.echo"; pt.user_profiles[4].full_name = "Echo";
  assert.deepEqual(detectTestAccounts(pt.user_profiles, pt.project_assignments), [IDS.user(5)], "test domain on an unmasked email");
  assert.deepEqual(detectTestAccounts(T().user_profiles, T().project_assignments), [IDS.user(5)], "test in the username");
  assert.deepEqual(testAccountCandidatesOf(T().user_profiles, T().project_assignments).map((u) => u.id),
    [IDS.user(2), IDS.user(3), IDS.user(4), IDS.user(5), IDS.user(6), IDS.user(7)], "every active account except the PMO's");
  p = selectPlan(T(), { ...syntheticCtx(), testAccounts: null }); assert.deepEqual(p.users.testIds, [IDS.user(5)], "no list: detected");
});

ok("updates", () => {
  let t = T(); t.comments[1].author_role = "guest"; let u = plan(t).updates; assert.equal(u.variant, "newest"); assert.equal(u.projectId, null);
  t = T(); t.comments = []; assert.equal(plan(t).updates.variant, "none");
  t = T(); t.comments.push({ id: "c9", project_id: IDS.project(13), author_role: "project_manager", created_at: "2031-03-09T11:00:00Z" });
  u = plan(t).updates; assert.equal(u.projectId, IDS.project(13), "newest PM thread first");
  let p = plan(t, { overrides: { updatesProjectId: IDS.project(6) } }); assert.equal(p.updates.projectId, IDS.project(6));
  p = plan(t, { overrides: { updatesProjectId: IDS.project(10) } }); assert.deepEqual(p.flags.overrideRejected, ["updatesProjectId"]);
});

ok("report: stale when a lit tile would print another figure than today's dashboard", () => {
  const t = T();
  const pd = t.portfolio_dashboard[0];
  pd.approved_total = 41.25e6;
  const r = t.board_reports.find((x) => x.id === IDS.report(2));
  const headline = { df_total: pd.total_capex, capex_count: pd.total_projects, approved_bac: pd.approved_total, released_total: pd.budget_consumed };
  r.figures = { ...r.figures, headline };
  assert.equal(plan(t).report.stale, false, "same figures: the tiles are lit");
  r.figures = { ...r.figures, headline: { ...headline, approved_bac: headline.approved_bac + 20000 } };
  assert.equal(plan(t).report.stale, false, "a difference that prints the same is not stale");
  r.figures = { ...r.figures, headline: { ...headline, released_total: headline.released_total - 7.9e6 } };
  const p = plan(t).report;
  assert.equal(p.stale, true);
  assert.deepEqual(p.staleTiles.map((x) => x.tile), ["Released"]);
  assert.ok(p.staleTiles[0].report !== p.staleTiles[0].live);
});

ok("past", () => {
  let t = T(); t.past_project_updates.push({ id: "pm9", past_project_id: IDS.past(1), author_id: IDS.user(1), created_at: "2031-03-08T10:00:00Z" });
  assert.equal(plan(t).past.variant, "nothread", "the newest message is not the manager's");
  assert.equal(plan(T(), { now: Date.parse("2031-04-10T05:00:00Z") }).past.variant, "nothread", "older than 30 days");
  t = T(); t.past_project_summary[0].released_amount = 4e6; assert.equal(plan(t).past.variant, "nothread", "fully released only");
  t = T(); t.past_project_summary[0].reason_open = "no progress"; assert.equal(plan(t).past.noProgress, 2);
  t = T(); t.past_project_summary.push({ ...t.past_project_summary[0], id: "p9", code: "PX-09", name: "Studio Establishment works" });
  assert.equal(plan(t).past.searchText, "PX-01", "every word is found twice: the code is typed");
  let q = plan(T(), { overrides: { pastId: IDS.past(2) } }); assert.deepEqual(q.flags.overrideRejected, ["pastId"]);
  // The search: the shortest name word or all-caps token that finds the row alone.
  t = T(); t.past_project_summary[0].name = "Establishment of the QSX Studio"; assert.equal(plan(t).past.searchText, "QSX", "a short all-caps token first");
  // Only a thread whose newest message is the manager's own short note, with no contact detail anywhere (M1).
  const newest = (tt) => tt.past_project_updates.find((m) => m.id === IDS.pastMsg(4));
  t = T(); newest(t).body = "x".repeat(401); assert.equal(plan(t).past.variant, "nothread", "a newest message over 400 characters");
  t = T(); newest(t).body = "x".repeat(400); assert.equal(plan(t).past.variant, "thread", "400 characters is still a note");
  for (const letter of ["Dear Sir, the items are missing.", "Done. Regards", "From: someone\nSubject: delivery"]) {
    t = T(); newest(t).body = letter; assert.equal(plan(t).past.variant, "nothread", `a forwarded email or letter: ${letter.slice(0, 12)}`);
  }
  t = T(); t.past_project_updates[0].body = "Call me on (phone hidden)."; assert.equal(plan(t).past.variant, "nothread", "a masked phone in an older message");
  t = T(); newest(t).body = "Write to (email hidden)."; assert.equal(plan(t).past.variant, "nothread", "a masked email");
  t = T(); newest(t).body = null; assert.equal(plan(t).past.variant, "nothread", "a newest message without its text (the simulation tab's other threads)");
  t = T(); newest(t).body = "   "; assert.equal(plan(t).past.variant, "nothread", "an empty newest message");
  // Both tabs choose the same thread: with only the chosen thread's text kept, the plan is unchanged.
  t = T(); t.past_project_summary.push({ ...t.past_project_summary[0], id: "p8", code: "PX-08", name: "Glazing of Vault" });
  for (let i = 0; i < 5; i++) t.past_project_updates.push({ id: `p8m${i}`, past_project_id: "p8", author_id: IDS.user(2), created_at: `2031-03-0${i + 1}T11:00:00Z`, body: i === 4 ? "Dear Sir, please see the forwarded email." : "Note." });
  const full = plan(t);
  assert.equal(full.past.id, IDS.past(1), "the longer thread is passed over for its letter");
  const trimmed = structuredClone(t);
  for (const m of trimmed.past_project_updates) if (m.past_project_id !== full.past.id) m.body = null;
  assert.deepEqual(plan(trimmed).past, full.past, "the simulation tab's trimmed bodies give the same choice");
});

ok("gallery", () => {
  let t = T(); t.project_attachments = t.project_attachments.filter((a) => a.kind !== "site_visit");
  assert.equal(plan(t).gallery.variant, "empty");
  assert.equal(plan(t, { leftOut: 3 }).gallery.variant, "leftout");
  assert.equal(plan(t, { failed: 1 }).gallery.variant, "leftout");
  t = T(); t.project_attachments.push({ id: "g1", project_id: IDS.project(7), kind: "site_visit", file_name: "panel.jpg", mime_type: "image/jpeg", uploaded_at: "2031-03-09T09:00:00Z" });
  let g = plan(t).gallery; assert.equal(g.variant, "campus"); assert.equal(g.filteredCount, 4); assert.equal(g.firstPhotoId, "g1");
  t = T(); t.project_attachments = t.project_attachments.filter((a) => a.kind !== "site_visit" || a.project_id === IDS.project(15));
  g = plan(t).gallery; assert.equal(g.variant, "all"); assert.equal(g.projectId, null); assert.equal(g.firstPhotoId, IDS.att(15));
  t = T(); t.project_attachments.push({ id: "g2", project_id: IDS.project(1), kind: "site_visit", file_name: "hall-2.jpg", mime_type: "image/jpeg", uploaded_at: "2031-03-01T07:00:00Z" });
  g = plan(t).gallery; assert.equal(g.projectId, IDS.project(6), "a tie on items goes to fewer screenshots");
  g = plan(T(), { overrides: { galleryProjectId: IDS.project(1) } }).gallery; assert.equal(g.projectId, IDS.project(1)); assert.equal(g.alias, "XQZ renovation");
  assert.deepEqual(plan(T(), { overrides: { galleryProjectId: IDS.project(15) } }).flags.overrideRejected, ["galleryProjectId"], "investment media are never the subject");
});

ok("report", () => {
  let t = T(); t.board_reports[1].status = "published"; t.board_reports[1].published_at = "2031-03-06T00:00:00Z";
  let r = plan(t).report; assert.equal(r.variant, "published"); assert.equal(r.kind, "published");
  t = T(); t.board_reports[1].figures.attention.released_before_approval = []; assert.equal(plan(t).report.variant, "nothing");
  t = T(); t.board_reports = [t.board_reports[0]]; r = plan(t).report; assert.equal(r.variant, "baselines"); assert.equal(r.id, null);
  t = T(); t.board_reports = []; assert.equal(plan(t).report.variant, "none");
  t = T(); t.board_reports.push({ ...t.board_reports[1], id: "r3", period: "2031-01-01", status: "published", published_at: "2031-02-02T00:00:00Z" });
  assert.equal(plan(t).report.id, "r3", "a published report wins over a newer draft");
  t = T(); t.board_reports[1].status = "discarded"; assert.equal(plan(t).report.variant, "baselines");
  assert.deepEqual(plan(T(), { overrides: { reportId: IDS.report(1) } }).flags.overrideRejected, ["reportId"], "baselines are never presented");
});

ok("typed card texts", () => {
  const t = T(); t.settings[1].value.remaining_capex.value = "9.0M";
  assert.deepEqual(plan(t).flags.typedTexts.map((x) => x.key), ["approved_projects"]);
});

ok("candidatesOf", () => {
  const c = candidatesOf(T(), syntheticCtx());
  assert.deepEqual(c.story.map((x) => x.id), [IDS.project(1), IDS.project(13), IDS.project(5)]);
  assert.deepEqual(c.updates.map((x) => x.id), [IDS.project(6)]);
  assert.deepEqual(c.past.map((x) => x.id), [IDS.past(1)]);
  assert.deepEqual(c.report.map((x) => x.id), [IDS.report(2)]);
  assert.deepEqual(c.riskRow.map((x) => x.id), [IDS.risk(1), IDS.risk(2), IDS.risk(3)]);
  assert.deepEqual(c.usersRow.map((x) => x.id), [IDS.user(2), IDS.user(3)]);
  assert.deepEqual(c.gallery.map((x) => x.id), [IDS.project(6), IDS.project(1)]);
  for (const list of Object.values(c)) for (const x of list) assert.ok(typeof x.label === "string" && x.label.length);
});

console.log(`select.test: part 1 ok (${n} groups, invented data)`);

// ── Part 2: the private fixture ──────────────────────────────────────────────
const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log("select.test: part 2 SKIP (SIM_FIXTURE unset)"); process.exit(0); }
const FX = JSON.parse(fs.readFileSync(path.join(dir, "fixture-tables.json"), "utf8"));
const EX = JSON.parse(fs.readFileSync(path.join(dir, "fixture-expect.json"), "utf8"));
const fctx = (over = {}) => ({ now: FX.meta.takenAt, me: FX.meta.me, testAccounts: FX.meta.testAccountsDetected, overrides: {}, leftOut: 0, failed: 0, ...over });
const P = selectPlan(FX.tables, fctx());
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const same = (got, exp, what) => assert.deepEqual(got, exp, `${what} differs from fixture-expect.json`);
same(P.asOf.takenAt, EX.takenAt, "takenAt"); same(P.asOf.pktDate, EX.pktDay, "pktDay");
same(pick(P.dashboard, Object.keys(EX.dashboard).filter((k) => k !== "screen")), pick(EX.dashboard, Object.keys(EX.dashboard).filter((k) => k !== "screen")), "dashboard");
same(fmtM(P.dashboard.capexTotal), EX.dashboard.screen.capexM, "dashboard screen capexM");
same(`${P.dashboard.capexCount} projects`, EX.dashboard.screen.capexN, "dashboard screen capexN");
same(`${P.dashboard.progN} of ${P.dashboard.capexCount} projects`, EX.dashboard.screen.progN, "dashboard screen progN");
same(P.investments, EX.investments, "investments");
same(P.pdd, EX.pdd, "pdd");
same(pick(P.payments, ["released", "relPctText", "paidProjects"]), pick(EX.payments, ["released", "relPctText", "paidProjects"]), "payments");
same(fmtM(P.payments.released), EX.payments.screen.releasedM, "payments screen");
same(pick(P.cashflow, ["hasRows", "peakMonth", "peakLabel", "monthName", "peaked"]), pick(EX.cashflow, ["hasRows", "peakMonth", "peakLabel", "monthName", "peaked"]), "cashflow");
same(fmtM(P.cashflow.peakTotal), EX.cashflow.screen.peakM, "cashflow screen");
same(pick(P.story, Object.keys(EX.story)), EX.story, "story");
same(P.timeline, EX.timeline, "timeline");
same(pick(P.performance, Object.keys(EX.performance)), EX.performance, "performance");
same(pick(P.risks, Object.keys(EX.risks)), EX.risks, "risks");
same(pick(P.compare, ["campusCount", "defaults", "trio", "tickOps", "columns", "leaders", "leaderVariant"]), EX.compare, "compare");
same(pick(P.assign, Object.keys(EX.assign)), EX.assign, "assign");
same({ count: P.users.count, testIds: P.users.testIds, testClause: P.users.testClause, rowUsername: P.users.row?.username, rowAssigned: P.users.row?.assigned }, EX.users, "users");
same(pick(P.updates, Object.keys(EX.updates)), EX.updates, "updates");
same(pick(P.past, Object.keys(EX.past)), EX.past, "past");
same({ ...pick(P.gallery, ["total", "campus", "onlyProject", "filteredCount", "variant"]), projectCode: P.gallery.code }, EX.gallery, "gallery");
same(pick(P.report, Object.keys(EX.report)), EX.report, "report");
assert.deepEqual(P.flags.overrideRejected, []);
assert.deepEqual(JSON.parse(JSON.stringify(P)), P, "fixture plan is JSON");

// Same plan once the plan tables are read (snapshot.js reads them after the first plan).
const withPlanTables = structuredClone(FX.tables);
for (const r of withPlanTables.project_task_rollup) withPlanTables.project_tasks.push({ id: "t-" + r.project_id, project_id: r.project_id });
assert.equal(canon(selectPlan(withPlanTables, fctx())), canon(P), "plan tables do not change the plan");
// Every launcher choice is accepted and keeps the rest of the rules working.
const C = candidatesOf(FX.tables, fctx());
for (const [list, key, read] of [["story", "storyId", (p) => p.story?.id], ["updates", "updatesProjectId", (p) => p.updates.projectId],
  ["past", "pastId", (p) => p.past.id], ["report", "reportId", (p) => p.report.id], ["riskRow", "riskRowId", (p) => p.risks.rowId],
  ["usersRow", "usersUserId", (p) => p.users.row?.userId], ["gallery", "galleryProjectId", (p) => p.gallery.projectId]]) {
  assert.ok(C[list].length >= 1, `fixture has ${list} candidates`);
  for (const c of C[list]) {
    const q = selectPlan(FX.tables, fctx({ overrides: { [key]: c.id } }));
    assert.equal(read(q), c.id, `${key} override accepted`); assert.deepEqual(q.flags.overrideRejected, []);
  }
}
// Masked contacts: detection needs the unmasked emails (snapshot.js runs it before masking), but the
// username/full-name rule still holds on masked rows.
assert.ok(detectTestAccounts(FX.tables.user_profiles, FX.tables.project_assignments).every((x) => FX.meta.testAccountsDetected.includes(x)));
console.log("select.test: part 2 ok (fixture plan equals fixture-expect.json; every launcher choice accepted)");
