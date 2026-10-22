// PMO Simulation (live data): the generated narration (lines.js, build.js, timing.js). PUBLIC, no data.
//
//   node scripts/sim/live/narration.test.mjs                        (invented data only)
//   SIM_FIXTURE=<private dir> node scripts/sim/live/narration.test.mjs   (+ the approved lines of today)
//
// Part 1 builds the narration from the invented snapshot (synthetic.mjs) and reaches every variant by
// changing the plan. Part 2 (skipped without SIM_FIXTURE) checks, on the private fixture, that the
// generator reproduces the approved storyboard lines with today's values word for word (golden file
// b3a-narration-expect.json in the fixture directory), the 290 spoken words and the 140.5 s total.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { selectPlan, candidatesOf } from "../../../src/sim/live/select.js";
import { buildNarration, useCandidate, SLOTS } from "../../../src/sim/live/build.js";
import { LINES, CHAPTERS } from "../../../src/sim/live/lines.js";
import { countWords } from "../../../src/sim/live/say.js";
import * as TM from "../../../src/sim/live/timing.js";
import { projectGoverned } from "../../../src/sim/live/preflight.js";
import { syntheticTables, syntheticCtx, IDS } from "./synthetic.mjs";

const IDS_ORDER = ["o1", "o2", "s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10", "s11", "s12a", "s12b", "s13", "s14",
  "s15", "s16", "s17", "s18", "s19", "c1"];
const near = (a, b, what, eps = 0.0011) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);

// ── Part 1: invented data ────────────────────────────────────────────────────
const tables = syntheticTables();
const basePlan = selectPlan(tables, syntheticCtx());
const build = (mut = () => {}, extra = {}) => {
  const plan = structuredClone(basePlan);
  mut(plan);
  return buildNarration({ tables, plan, overrides: extra.overrides || {} }, extra.opts);
};
const lineOf = (N, id) => N.lines.find((l) => l.id === id);
const cap = (mut, id) => lineOf(build(mut), id).caption;

const N0 = build();
assert.deepEqual(N0.lines.map((l) => l.id), IDS_ORDER, "23 lines in scene order");
assert.deepEqual(N0.scenes.map((s) => s.n), [...Array(21).keys()], "scenes 0..20");
assert.deepEqual(N0.chapters.map((c) => [c.n, c.title, c.scenes]), CHAPTERS.map((c) => [c.n, c.title, c.scenes]));
assert.equal(N0.scenes[20].closing, true);
assert.equal(lineOf(N0, "c1").chapter, 6);

// Structure of every line and candidate.
for (const l of N0.lines) {
  assert.equal(l.use, 0); assert.equal(l.skip, false);
  assert.ok(l.candidates.length >= 1);
  for (const c of l.candidates) {
    assert.ok(c.caption && c.speech && c.name);
    assert.equal(c.words, countWords(c.speech), `${l.id}/${c.name} words`);
    assert.equal(c.short.words, countWords(c.short.speech), `${l.id}/${c.name} short words`);
    assert.ok(!/[{}]/.test(c.caption + c.speech + c.short.caption), `${l.id} has no unfilled slot`);
    assert.ok(!/\d/.test(c.speech), `${l.id}/${c.name} speech has no digits: ${c.speech}`);
    for (const f of c.figures) assert.ok(f.slot && f.where && typeof f.screen === "string" && f.screen.length, `${l.id} figure`);
  }
  assert.equal(new Set(l.candidates.map((c) => c.caption)).size, l.candidates.length, `${l.id} candidates are distinct`);
  const def = LINES.find((x) => x.id === l.id);
  if (def.critical) assert.ok(!l.candidates.some((c) => c.name === "bare"), `${l.id} is critical: no bare line`);
  else if (def.bare != null) assert.equal(l.candidates[l.candidates.length - 1].figures.length, 0, `${l.id} ends with a figure-free line`);
}
assert.equal(N0.totals.words, N0.lines.reduce((s, l) => s + l.words, 0));
assert.equal(lineOf(N0, "o2").kicker, "Portal data as of 10 Mar 2031, 10:30 PKT");
assert.equal(lineOf(N0, "s18").kicker, "February 2031 · draft · figures as at 5 Mar 2031");
assert.equal(N0.scenes[18].kicker, lineOf(N0, "s18").kicker);
assert.deepEqual(N0.compacted, []); assert.deepEqual(N0.notes, []);

// The base texts (invented values).
const BASE = {
  s01: ["Total Capex: 162.0 million rupees, 14 projects, 1 closed; health scores cover only 3.",
    "Total Capex: one hundred sixty-two million rupees, fourteen projects, one closed; health scores cover only three.",
    "Capex: 162.0 million; health scores cover only 3."],
  s04: ["Payments Status: released, 68.0 million, 42 percent; payments entered for one project only.",
    "Payments Status: released, sixty-eight million, forty-two percent; payments entered for one project only.", "Payments Status: payments entered for one project only."],
  s09: ["Timeline: red means overdue, or PDD not submitted; XQZ, due 30 June.",
    "Timeline: red means overdue, or P D D not submitted; X Q Z, due thirtieth June.", "Timeline: red means overdue, or PDD not submitted."],
  s12b: ["Head to head, South Campus leads in rupees, East Campus trails on releases; each site lists its managers.",
    "Head to head, South Campus leads in rupees, East Campus trails on releases; each site lists its managers.", "Head to head, with each site's managers."],
  s14: ["User Management: 7 users, one for testing; Alpha Person manages 4 projects.",
    "User Management: seven users, one for testing; Alpha Person manages four projects.", "User Management: roles and assigned projects."],
  s17: ["The Gallery: 6 photos and videos from site visits; here, the Sports Court.",
    "The Gallery: six photos and videos from site visits; here, the Sports Court.", "Site photos and videos."],
  s19: ["Team & About: who we are, how to reach us.", "Team and About: who we are, how to reach us.", "Who we are, how to reach us."],
};
for (const [id, [c, s, sh]] of Object.entries(BASE)) {
  const l = lineOf(N0, id);
  assert.equal(l.caption, c, `${id} caption`); assert.equal(l.speech, s, `${id} speech`); assert.equal(l.short.caption, sh, `${id} short`);
}

// Every variant, reached by changing the plan.
const V = [
  ["s01", (p) => { p.dashboard.progClause = "none"; }, "Total Capex: 162.0 million rupees, 14 projects, 1 closed."],
  ["s01", (p) => { p.dashboard.progClause = "await"; p.dashboard.progN = 0; }, "Total Capex: 162.0 million rupees, 14 projects, 1 closed; health scores await progress reports."],
  ["s01", (p) => { p.dashboard.closedN = 3; }, "Total Capex: 162.0 million rupees, 14 projects, 3 closed; health scores cover only 3."],
  ["s01", (p) => { p.dashboard.closedN = 0; }, "Total Capex: 162.0 million rupees, 14 projects; health scores cover only 3."],
  ["s01", (p) => { p.dashboard.closedN = 3; p.dashboard.closedLive = false; }, "Total Capex: 162.0 million rupees, 14 projects; health scores cover only 3."],
  ["s01", (p) => { p.dashboard.closedN = 0; p.dashboard.progClause = "none"; }, "Total Capex: 162.0 million rupees, 14 projects."],
  ["s02", (p) => { p.investments.invFull = false; p.investments.invN = 2; }, "Investments sit apart: 2 projects, outside Capex."],
  ["s02", (p) => { p.investments.invN = 0; }, "Investments sit apart; none are recorded yet."],
  ["s02", () => {}, "Investments sit apart: 1 project, released in full."],
  ["s03", () => {}, "PDD Status: 4 await submission; 2 are with the Executive Director."],
  ["s03", (p) => { Object.assign(p.pdd, { reviewer: "in_df", reviewerN: 1 }); }, "PDD Status: 4 await submission; 1 is with Director Finance."],
  ["s03", (p) => { Object.assign(p.pdd, { reviewer: "in_mt", reviewerN: 3 }); }, "PDD Status: 4 await submission; 3 are with the Managing Trustee."],
  ["s03", (p) => { Object.assign(p.pdd, { reviewer: null, reviewerN: 0 }); }, "PDD Status: 4 await submission; none are with reviewers."],
  ["s03", (p) => { p.pdd.notSubmitted = 0; }, "PDD Status: every project has submitted; 2 are with the Executive Director."],
  ["s03", (p) => { Object.assign(p.pdd, { notSubmitted: 0, reviewer: null, reviewerN: 0 }); }, "PDD Status: every project has submitted; none are with reviewers."],
  ["s04", (p) => { p.payments.relPctText = "41.7%"; }, "Payments Status: released, 68.0 million, 41.7 percent; payments entered for one project only."],
  ["s04", (p) => { p.payments.relPctText = null; }, "Payments Status: released, 68.0 million; payments entered for one project only."],
  ["s04", (p) => { Object.assign(p.payments, { paidProjects: 0, variant: "none" }); }, "Payments Status: released, 68.0 million, 42 percent; no payments are entered yet."],
  ["s04", (p) => { Object.assign(p.payments, { paidProjects: 2, variant: "few" }); }, "Payments Status: released, 68.0 million, 42 percent; payments entered for 2 projects only."],
  ["s04", (p) => { Object.assign(p.payments, { paidProjects: 5, paidTotal: 3.2e6, variant: "paid" }); }, "Payments Status: released, 68.0 million, 42 percent; 3.2 million paid so far."],
  ["s04", (p) => { Object.assign(p.payments, { released: 0, variant: "nothing" }); }, "Payments Status: nothing released yet; no payments are entered."],
  ["s05", () => {}, "Cashflows: the monthly plan peaks in April, 15.0 million."],
  ["s05", (p) => { p.cashflow.peaked = true; }, "Cashflows: the monthly plan peaked in April, 15.0 million."],
  ["s05", (p) => { p.cashflow.hasRows = false; }, "Cashflows: no monthly plan is loaded yet."],
  ["s06", () => {}, "Projects: let's follow one that reports progress, the XQZ renovation."],
  ["s06", (p) => { p.story.kind = "closed"; }, "Projects: let's follow a finished one, the XQZ renovation."],
  ["s06", (p) => { p.story = null; }, "Projects: every capital project, searchable by name or ID."],
  ["s07", () => {}, "Documents holds its PDD. Approved, fully released, 60 percent done."],
  ["s07", (p) => { p.story.releasedState = "partly"; }, "Documents holds its PDD. Approved, partly released, 60 percent done."],
  ["s07", (p) => { p.story.releasedState = "none"; p.story.pct = 12.5; }, "Documents holds its PDD. Approved, not yet released, 12.5 percent done."],
  ["s07", (p) => { p.story.hasPddDoc = false; }, "Documents holds its 2 files. Approved, fully released, 60 percent done."],
  ["s07", (p) => { p.story.hasPddDoc = false; p.story.docCount = 1; p.story.stage = "closed"; }, "Documents holds its 1 file. Closed, fully released, 60 percent done."],
  ["s07", (p) => { p.story.docCount = 0; }, "Its Documents tab is empty so far."],
  ["s08", () => {}, "Its work breakdown: not yet started, as almost everywhere."],
  ["s08", (p) => { p.story.wbsWide = true; }, "Its work breakdown has no tasks yet."],
  ["s08", (p) => { p.story.tasks = 4; }, "Its work breakdown: 4 tasks so far."],
  ["s08", (p) => { p.story.tasks = 1; }, "Its work breakdown: 1 task so far."],
  ["s09", (p) => { p.timeline.anyPdd = false; }, "Timeline: red means overdue; XQZ, due 30 June."],
  ["s09", (p) => { p.timeline.anyLate = false; }, "Timeline: red means PDD not submitted; XQZ, due 30 June."],
  ["s09", (p) => { p.timeline.anyLate = false; p.timeline.anyPdd = false; }, "Timeline: every project on one calendar; XQZ, due 30 June."],
  ["s09", (p) => { p.story.endPassed = true; }, "Timeline: red means overdue, or PDD not submitted; XQZ, was due 30 June."],
  ["s09", (p) => { p.story.endDate = "2032-01-15"; }, "Timeline: red means overdue, or PDD not submitted; XQZ, due 15 January 2032."],
  ["s09", (p) => { p.story = null; }, "Timeline: red means overdue, or PDD not submitted."],
  ["s09", (p) => { p.story = null; p.timeline.anyLate = false; p.timeline.anyPdd = false; }, "Timeline: every project on one calendar."],
  ["s09", (p) => { p.story = null; p.timeline.anyPdd = false; }, "Timeline: red means overdue."],
  ["s09", (p) => { p.story = null; p.timeline.anyLate = false; }, "Timeline: red means PDD not submitted."],
  ["s10", () => {}, "Performance: XQZ is on schedule; all 'Delayed' lack progress entries."],
  ["s10", (p) => { p.performance.variant = "most"; }, "Performance: XQZ is on schedule; most 'Delayed' lack progress entries."],
  ["s10", (p) => { p.performance.variant = "count"; }, "Performance: XQZ is on schedule; 3 of 7 report progress."],
  ["s10", (p) => { p.performance.variant = "none"; }, "Performance: XQZ is on schedule."],
  ["s10", (p) => { p.performance.storyShown = false; }, "Performance: all 'Delayed' lack progress entries."],
  ["s10", (p) => { p.performance.storyOnTime = false; p.performance.variant = "most"; }, "Performance: most 'Delayed' lack progress entries."],
  ["s10", (p) => { p.story = null; p.performance.variant = "count"; }, "Performance: 3 of 7 report progress."],
  ["s10", (p) => { p.story = null; p.performance.variant = "none"; }, "Performance: schedule and budget, project by project."],
  ["s11", () => {}, "Risk Register: 4 open, none rated critical; 3 medium probability, high impact."],
  ["s11", (p) => { Object.assign(p.risks, { critical: 1, cell: "high-high", cellN: 1, cellShown: 1, prob: "high" }); }, "Risk Register: 4 open, 1 rated critical; 1 high probability, high impact."],
  ["s11", (p) => { Object.assign(p.risks, { total: 0, open: 0, cell: null }); }, "Risk Register: no risks are logged yet."],
  ["s11", (p) => { Object.assign(p.risks, { open: 0, cell: null }); }, "Risk Register: every risk, by probability and impact."],
  ["s12a", () => {}, "Campus Compare puts all 4 campuses side by side; we pick 3."],
  ["s12b", (p) => { p.compare.leaderVariant = "AR_S"; }, "Head to head, South Campus leads in rupees, North Campus in released share; each site lists its managers."],
  ["s12b", (p) => { p.compare.leaderVariant = "ARS"; }, "Head to head, South Campus leads in rupees and share; each site lists its managers."],
  ["s12b", (p) => { p.compare.leaderVariant = "A_R"; p.compare.leaders.R = "North Campus"; }, "Head to head, South Campus leads approved, North Campus released; each site lists its managers."],
  ["s12b", (p) => { p.compare.leaderVariant = "tie"; }, "Head to head: approvals and releases side by side; each site lists its managers."],
  ["s13", () => {}, "On East Campus, Assign PM previews first: 2 to assign, 1 left alone."],
  ["s13", (p) => { p.assign.leftAlone = 0; }, "On East Campus, Assign PM previews first: 2 to assign."],
  ["s13", (p) => { Object.assign(p.assign, { variant: "none", toAssign: 0 }); }, "On East Campus, Assign PM previews first: nothing to assign today."],
  ["s14", (p) => { p.users.testClause = "some"; }, "User Management: 7 users, some for testing; Alpha Person manages 4 projects."],
  ["s14", (p) => { p.users.testClause = "none"; p.users.row.assigned = 1; }, "User Management: 7 users; Alpha Person manages 1 project."],
  ["s14", (p) => { p.users.row = null; }, "User Management: 7 users, one for testing; each has a role."],
  ["s15", () => {}, "Updates: one thread per project; here, a manager's status note."],
  ["s15", (p) => { p.updates.variant = "newest"; }, "Updates: one thread per project; the newest are listed first."],
  ["s15", (p) => { p.updates.variant = "none"; }, "Updates: one thread per project; none has messages yet."],
  ["s16", () => {}, "Past Projects, from earlier years: 2 open, 1 without progress; here, the manager replies."],
  ["s16", (p) => { p.past.noProgress = 0; }, "Past Projects, from earlier years: 2 open; here, the manager replies."],
  ["s16", (p) => { p.past.variant = "nothread"; }, "Past Projects, from earlier years: 2 open, 1 without progress."],
  ["s16", (p) => { p.past.variant = "nothread"; p.past.noProgress = 0; }, "Past Projects, from earlier years: 2 open."],
  ["s17", (p) => { p.gallery.variant = "campus"; }, "The Gallery: 6 photos and videos from site visits; here, South Campus."],
  ["s17", (p) => { p.gallery.variant = "all"; }, "The Gallery: 6 photos and videos from site visits."],
  ["s17", (p) => { Object.assign(p.gallery, { variant: "all", total: 5, photos: 5, videos: 0 }); }, "The Gallery: 5 photos from site visits."],
  ["s17", (p) => { Object.assign(p.gallery, { variant: "all", total: 1, photos: 0, videos: 1 }); }, "The Gallery: 1 video from site visits."],
  ["s17", (p) => { p.gallery.variant = "empty"; }, "The Gallery holds site-visit media; none is uploaded yet."],
  ["s17", (p) => { p.gallery.variant = "leftout"; }, "The Gallery: site-visit photos and videos, none shown in this presentation."],
  ["s18", () => {}, "Monthly Report: none published yet; February's draft flags what needs attention."],
  ["s18", (p) => { Object.assign(p.report, { variant: "published", kind: "published" }); }, "Monthly Report: February's board report, published; it flags what needs attention."],
  ["s18", (p) => { p.report.variant = "nothing"; }, "Monthly Report: none published yet; February's draft shows nothing outstanding."],
  ["s18", (p) => { p.report.variant = "baselines"; }, "Monthly Report: none drafted yet; baselines only."],
  ["s18", (p) => { p.report.variant = "none"; }, "Monthly Report: none drafted yet."],
  ["c1", () => {}, "From proposal to handover, one shared record. Thank you."],
  ["c1", (p) => { p.report.variant = "published"; }, "From proposal to board report, one shared record. Thank you."],
];
const reached = new Map(LINES.map((L) => [L.id, new Set()]));
for (const [id, mut, want] of V) {
  const N = build(mut);
  const l = lineOf(N, id);
  assert.equal(l.caption, want, `${id} variant`);
  reached.get(id).add(l.variant);
  for (const x of N.lines) for (const c of x.candidates) assert.equal(c.words, countWords(c.speech));
}
for (const L of LINES) {
  const names = new Set(L.main.map((e) => e.name));
  for (const nm of names) {
    if (["o1", "o2", "s12a", "s19"].includes(L.id)) continue;   // one text only
    if (L.id === "s01" && nm === "caveat") continue;
    if (L.id === "s02" && nm === "full") continue;
    reached.get(L.id).add(N0.lines.find((x) => x.id === L.id).variant);
    assert.ok(reached.get(L.id).has(nm), `${L.id} variant "${nm}" is tested`);
  }
}

// Spoken forms of the variants that change words.
assert.equal(lineOf(build((p) => { p.payments.relPctText = "41.7%"; }), "s04").speech,
  "Payments Status: released, sixty-eight million, forty-one point seven percent; payments entered for one project only.");
assert.equal(lineOf(build((p) => { p.story.endDate = "2032-01-15"; }), "s09").speech,
  "Timeline: red means overdue, or P D D not submitted; X Q Z, due fifteenth January twenty thirty-two.");
assert.equal(lineOf(build((p) => { p.story.hasPddDoc = false; }), "s07").words, 11);

// Skipped scenes without a story; their time is not counted.
const Nn = build((p) => { p.story = null; });
assert.equal(lineOf(Nn, "s07").skip, true); assert.equal(lineOf(Nn, "s08").skip, true);
assert.equal(Nn.scenes[7].skip, true);
assert.ok(Nn.notes.some((x) => /Scenes 7 and 8/.test(x)));
near(Nn.totals.at135, TM.project(Nn.lines, Nn.scenes, 135).total, "skip total");
assert.ok(Nn.totals.at135 < N0.totals.at135 - 9);

// The launcher's "how to say it" changes the voice only.
const Ns = build(() => {}, { overrides: { say: { [IDS.user(2)]: "Alfa Purrson" } } });
assert.equal(lineOf(Ns, "s14").caption, BASE.s14[0]);
assert.equal(lineOf(Ns, "s14").speech, "User Management: seven users, one for testing; Alfa Purrson manages four projects.");

// Figures: screen forms and selectors.
const f = (N, id) => Object.fromEntries(lineOf(N, id).figures.map((x) => [x.slot, x]));
assert.deepEqual(Object.values(f(N0, "s01")).map((x) => [x.screen, x.where]), [["162.0M", '[data-tour="hero-total"]'],
  ["14 projects", '[data-tour="hero-total"]'], ["3 of 14 projects", '[data-tour="hero-cpi-hint"]'], ["1 of 14 projects", '[data-kpi="pcds_received"]']]);
// The closed clause: its fallback is the same line without it (a critical line must never lose its run
// to the PCDs card), and nothing is added (or checked) when none has closed or the card is typed.
{
  const c = lineOf(N0, "s01").candidates;
  assert.deepEqual(c.map((x) => x.name), ["caveat", "caveatNoClosed"]);
  assert.equal(c[1].caption, "Total Capex: 162.0 million rupees, 14 projects; health scores cover only 3.");
  assert.ok(!c[1].figures.some((x) => x.slot === "closedN"));
  assert.equal(c[0].words - c[1].words, 2, "the closed clause adds two spoken words");
  for (const mut of [(p) => { p.dashboard.closedN = 0; }, (p) => { p.dashboard.closedLive = false; }]) {
    const l = lineOf(build(mut), "s01");
    assert.deepEqual(l.candidates.map((x) => x.name), ["caveat"]);
    assert.ok(!l.figures.some((x) => x.slot === "closedN"));
  }
  const l3 = lineOf(build((p) => { p.dashboard.closedN = 3; }), "s01");
  assert.equal(l3.speech, "Total Capex: one hundred sixty-two million rupees, fourteen projects, three closed; health scores cover only three.");
  assert.equal(l3.short.caption, "Capex: 162.0 million; health scores cover only 3.", "the short line leaves the clause out");
  assert.equal(l3.figures.find((x) => x.slot === "closedN").screen, "3 of 14 projects");
}
assert.equal(f(N0, "s03")["revAre.list"].screen, "2 projects"); assert.equal(f(N0, "s03").revAre.where, '[data-kpi="in_ed"]');
assert.equal(f(N0, "s04").relPct.screen, "42.0%"); assert.equal(f(N0, "s04")["paidClause.flow"].screen, "Paid");
assert.equal(f(N0, "s05").peakMonth.screen, "Apr 31");
assert.equal(f(N0, "s07").releasedState.screen, "20,000,000"); assert.equal(f(N0, "s07").pct.screen, "60.0%");
assert.equal(f(N0, "s09").endDay.screen, "30 Jun 2031");
assert.equal(f(N0, "s10")["tag.pct"].where, `tr[data-project-id="${IDS.project(1)}"] td[data-col="pct"]`);
assert.equal(f(N0, "s11").cellN.screen, "3 of 5"); assert.equal(f(N0, "s11")["cellN.cell"].where, '[data-cell="medium-high"]');
assert.equal(f(N0, "s12b").A.screen, "PKR 50.0M"); assert.equal(f(N0, "s12b").T.screen, "5% of DF Recommended");
assert.equal(f(N0, "s13").toAssign.screen, "2 projects will be assigned"); assert.equal(f(N0, "s13").leftAlone.screen, "1 left alone");
assert.equal(f(N0, "s14").pmN.where, 'tr[data-user="pm.alpha"] td[data-col="assigned"]');
assert.equal(f(N0, "s17").galleryAlias.where, `[data-tour="gallery-grid"] [data-attachment="${IDS.att(11)}"]`);
assert.equal(f(N0, "s18").Month.screen, "Draft");
assert.equal(f(build((p) => { p.compare.leaders.A = 'Camp "Q"'; p.compare.rows[0].campus = 'Camp "Q"'; }), "s12b").A.where,
  '[data-tour="compare-h2h-grid"] [data-campus="Camp \\"Q\\""] [data-metric="Approved"]', "selector values are escaped");
assert.equal(f(build((p) => { p.risks.cellShown = 2; }), "s11")["cellN.cell"], undefined, "the cell is checked only when it shows the number said");
assert.equal(f(build((p) => { p.gallery.firstPhotoId = null; }), "s17").galleryAlias, undefined, "no photo: no tile check");
assert.ok(Object.keys(SLOTS).length > 40);

// Falling back: the rehearsal moves `use`; every field follows it.
const Nf = build();
const s04 = lineOf(Nf, "s04");
assert.deepEqual(s04.candidates.map((c) => c.name), ["pct", "short", "bare"]);
useCandidate(s04, 2);
assert.equal(s04.caption, "Payments Status: what is released, and what is paid."); assert.equal(s04.variant, "bare"); assert.deepEqual(s04.figures, []);
assert.equal(s04.words, 9);
useCandidate(s04, 1);
assert.equal(s04.caption, "Payments Status: payments entered for one project only.");
assert.deepEqual(s04.figures.map((x) => x.slot), ["paidClause", "paidClause.flow"], "the short candidate keeps the figures it says");
near(TM.project(Nf.lines, Nf.scenes, 135).total, N0.totals.at135 - (TM.lineDuration(lineOf(N0, "s04"), 135) - TM.lineDuration(s04, 135)), "projection follows use");
assert.equal(lineOf(build((p) => { Object.assign(p.report, { variant: "published", kind: "published" }); }), "s18").candidates.at(-1).caption,
  "Monthly Report: each month's board report.", "a bare line never carries a slot");
assert.equal(lineOf(build((p) => { p.story.endPassed = true; }), "s09").candidates.find((c) => c.name === "short").caption, "Timeline: red means overdue, or PDD not submitted.");

// Timing model.
near(TM.lineSeconds(13, 135), 0.3 + 13 * 60 / 135, "line");
near(TM.sceneSeconds([{ words: 12, minHold: 5.7 }, { words: 18, minHold: 7.7 }], 135), 5.7 + 0.06 + 8.3, "two-line scene");
near(TM.sceneSeconds([{ words: 14, minHold: 6.5, extra: 0.4 }], 135), 0.3 + 14 * 60 / 135 + 0.4, "extra time");
near(TM.sceneSeconds([{ words: 10, minHold: 7.8, short: { words: 5 } }], 135, { short: true }), 7.8 * 0.7, "short keeps 70 % of the hold");
near(TM.sceneSeconds([{ words: 10, minHold: 1, skip: true }], 135), 0, "skipped");
near(TM.sceneSeconds([{ words: 10, minHold: 1 }], 135, { waits: 1.5 }), 0.3 + 10 * 60 / 135 + 1.5, "waits");
assert.equal(TM.fmtClock(139.9), "2:19"); assert.equal(TM.fmtClock(43.94), "0:43"); assert.equal(TM.fmtClock(0), "0:00");
assert.deepEqual([TM.LIMIT, TM.GOVERN_AT, TM.CUT_AT, TM.COMPACT_AT, TM.START_DELAY, TM.GAP], [150, 146, 149.5, 142, 0.3, 0.06]);
const pr = TM.project(N0.lines, N0.scenes, 135);
near(pr.total, N0.totals.at135, "total"); near(pr.chapters[1].start, pr.scenes.find((s) => s.n === 6).start, "chapter 2 starts at scene 6");
for (const s of N0.scenes) near(s.start, pr.scenes.find((x) => x.n === s.n).start, `scene ${s.n} start`);
const N150 = build(() => {}, { opts: { wpm: 150 } });
near(N150.totals.atWpm, N150.totals.at150, "atWpm"); assert.ok(N150.scenes[19].start < N0.scenes[19].start);

// Compaction: over 142 s at 135 wpm, the lines switch to short in the fixed order until it fits.
const ids = TM.compact(N0.lines, N0.scenes, { wpm: 135, waits: { 1: 5 } });
assert.deepEqual(ids, ["s05", "s09"]);
const shortened = N0.lines.map((l) => ({ ...l, candidates: l.candidates, use: l.use, compact: ids.includes(l.id) }));
assert.ok(TM.project(shortened, N0.scenes, 135, { waits: { 1: 5 } }).total <= TM.COMPACT_AT);
assert.deepEqual(TM.compact(N0.lines, N0.scenes, { wpm: 135, waits: { 1: 60 } }), ["s05", "s09", "s16", "s10"], "never more than the four");
assert.deepEqual(N0.lines.filter((l) => l.compact), [], "compact() does not change the lines");

// The governed projection ("with this voice" on the Begin screen): as the engine's governor plays it.
const g135 = projectGoverned(N0.lines, N0.scenes, 135);
near(g135.total, N0.totals.at135, "no governor at 135 wpm"); assert.deepEqual(g135.short, []);
const g100 = projectGoverned(N0.lines, N0.scenes, 100);
assert.ok(g100.short.length > 0 && g100.short[0] === 0, "at 100 wpm the governor shortens from the first scene");
assert.ok(g100.total < TM.project(N0.lines, N0.scenes, 100).total, "the governed run is shorter than the plain one");
assert.ok(g100.total <= TM.CUT_AT && !g100.cut, `the governed run ends by the cut (${g100.total} s)`);
assert.equal(projectGoverned(N0.lines, N0.scenes, 40).total, TM.CUT_AT, "a very slow voice is cut at 149.5 s");

// A copy the PMO shared with guests: the same plan, the data's date where the live texts say
// "current" or "today"; every other line is word for word the live one.
const shared = (N, NS, label) => {
  const o2 = lineOf(NS, "o2"), live = lineOf(N, "o2");
  assert.ok(!/current/i.test(o2.caption + o2.speech + o2.short.caption + o2.short.speech), `${label}: o2 says no "current"`);
  assert.equal(o2.kicker, live.kicker, `${label}: o2 kicker unchanged`);
  const s13 = lineOf(NS, "s13");
  for (const c of s13.candidates) assert.ok(!/today/i.test(c.caption + c.speech), `${label}: s13 says no "today"`);
  for (const l of NS.lines) {
    if (l.id === "o2" || l.id === "s13") continue;
    const b = lineOf(N, l.id);
    assert.deepEqual(l.candidates.map((c) => [c.caption, c.speech]), b.candidates.map((c) => [c.caption, c.speech]), `${label}: ${l.id} as live`);
  }
  for (const l of NS.lines) for (const c of l.candidates) assert.ok(!/\d/.test(c.speech) && !/[{}]/.test(c.caption), `${label}: ${l.id} filled, spoken in words`);
  return o2;
};
{
  const NS = build(() => {}, { opts: { shared: true } });
  const o2 = shared(N0, NS, "synthetic");
  assert.equal(o2.caption, "Data as of 10 Mar 2031: money, projects, sites, people, reports. Money first.");
  assert.equal(o2.speech, "Data as of tenth March: money, projects, sites, people, reports. Money first.");
  assert.equal(o2.short.caption, "Portal data as of 10 Mar 2031. Money first.");
  assert.equal(o2.short.speech, "Portal data as of tenth March. Money first.");
  const s13 = (mut) => lineOf(build(mut, { opts: { shared: true } }), "s13").caption;
  assert.equal(s13((p) => { Object.assign(p.assign, { variant: "none", toAssign: 0 }); }), "On East Campus, Assign PM previews first: nothing to assign.");
  assert.equal(s13(() => {}), "On East Campus, Assign PM previews first: 2 to assign, 1 left alone.", "the other s13 variants as live");
  // Words: o2 keeps the live line's 12 (the spoken date is always two), so the run is timed as live.
  const dateWords = countWords(SLOTS.dateText(basePlan).say);
  assert.equal(dateWords, 2);
  assert.equal(lineOf(NS, "o2").words, lineOf(N0, "o2").words, "o2: as many spoken words as live");
  assert.equal(NS.totals.words, N0.totals.words, `words ${NS.totals.words} vs ${N0.totals.words}`);
  assert.deepEqual(NS.compacted, N0.compacted, "the same lines in their short form as live");
  assert.ok(NS.totals.at135 <= TM.GOVERN_AT, `shared run ${NS.totals.at135} s at 135 wpm`);
  assert.equal(SLOTS.dateText(basePlan).cap, "10 Mar 2031");
}

console.log(`narration.test: part 1 ok (${V.length} variants, invented data; ${N0.totals.words} words, ${N0.totals.at135} s at 135 wpm)`);

// ── Part 2: the private fixture ──────────────────────────────────────────────
const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log("narration.test: part 2 SKIP (SIM_FIXTURE unset)"); process.exit(0); }
const FX = JSON.parse(fs.readFileSync(path.join(dir, "fixture-tables.json"), "utf8"));
const EX = JSON.parse(fs.readFileSync(path.join(dir, "fixture-expect.json"), "utf8"));
const goldenPath = path.join(dir, "b3a-narration-expect.json");
const ctx = (over = {}) => ({ now: FX.meta.takenAt, me: FX.meta.me, testAccounts: FX.meta.testAccountsDetected, overrides: {}, leftOut: 0, failed: 0, ...over });
const plan = selectPlan(FX.tables, ctx());
const N = buildNarration({ tables: FX.tables, plan, overrides: {} });
if (fs.existsSync(goldenPath)) {
  const G = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  assert.deepEqual(N.lines.map((l) => l.id), G.lines.map((l) => l.id));
  for (const g of G.lines) {
    const l = lineOf(N, g.id);
    assert.equal(l.caption, g.caption, `${g.id}: caption is the approved text`);
    assert.equal(l.speech, g.speech, `${g.id}: speech is the approved text`);
    assert.equal(l.words, g.words, `${g.id}: words`);
    assert.equal(l.short.caption, g.short, `${g.id}: short is the approved text`);
    assert.equal(l.short.speech, g.shortSpeech, `${g.id}: short speech`);
    assert.equal(l.short.words, g.shortWords, `${g.id}: short words`);
  }
  assert.equal(N.totals.words, G.totals.words);
  near(N.totals.at135, G.totals.at135, "total at 135 wpm", 0.006);
  near(N.totals.at150, G.totals.at150, "total at 150 wpm", 0.006);
  N.chapters.forEach((c, i) => near(c.start, G.chapters135[i], `chapter ${c.n} start`));
} else console.log("narration.test: golden lines SKIP (b3a-narration-expect.json not in SIM_FIXTURE)");
assert.equal(N.totals.words, 291, "291 spoken words today (22 Oct fixture, incl. the closed clause)");
assert.equal(Math.round(N.totals.at135 * 10) / 10, 141.6, "141.6 s at 135 wpm today");
assert.equal(Math.round(N.totals.at150 * 10) / 10, 135.9, "135.9 s at 150 wpm today");
assert.deepEqual(N.chapters.map((c) => TM.fmtClock(c.start)), ["0:00", "0:45", "1:00", "1:18", "1:45", "2:04"]);
assert.deepEqual(N.compacted, []); assert.deepEqual(N.notes, []);
assert.ok(N.lines.every((l) => l.use === 0 && !l.skip));
// The figures carry today's screen forms (fixture-expect.json).
const s01 = Object.fromEntries(lineOf(N, "s01").figures.map((x) => [x.slot, x.screen]));
assert.deepEqual(s01, EX.dashboard.screen);
assert.equal(lineOf(N, "s04").figures.find((x) => x.slot === "releasedM").screen, EX.payments.screen.releasedM);
assert.equal(lineOf(N, "s05").figures.find((x) => x.slot === "peakM").screen, EX.cashflow.screen.peakM);
assert.equal(lineOf(N, "s05").figures.find((x) => x.slot === "peakMonth").screen, EX.cashflow.peakLabel);
// Every launcher choice still gives a complete narration.
const C = candidatesOf(FX.tables, ctx());
let built = 0;
for (const [list, key] of [["story", "storyId"], ["updates", "updatesProjectId"], ["past", "pastId"], ["report", "reportId"],
  ["riskRow", "riskRowId"], ["usersRow", "usersUserId"], ["gallery", "galleryProjectId"]]) {
  for (const c of C[list]) {
    const p = selectPlan(FX.tables, ctx({ overrides: { [key]: c.id } }));
    const M = buildNarration({ tables: FX.tables, plan: p, overrides: {} });
    assert.equal(M.lines.length, 23);
    for (const l of M.lines) for (const k of l.candidates) assert.ok(!/[{}]/.test(k.caption) && !/\d/.test(k.speech), `${key}: ${l.id}`);
    built++;
  }
}
// The shared copy of today's data: o2 and s13 only, within the governor at 135 wpm. o2 keeps the live
// word count, so the shared run is never longer than live and no other line switches to its short form
// (today's live run is only 0.4 s under the 142 s compaction line).
const NS = buildNarration({ tables: FX.tables, plan, overrides: {} }, { shared: true });
shared(N, NS, "fixture");
assert.equal(countWords(SLOTS.dateText(plan).say), 2, "the spoken date is two words");
assert.equal(lineOf(NS, "o2").words, lineOf(N, "o2").words, "o2 words as live");
assert.ok(NS.totals.at135 <= N.totals.at135, `shared run ${NS.totals.at135} s, live ${N.totals.at135} s`);
assert.deepEqual(NS.compacted, N.compacted, "the same lines in their short form as live");
assert.ok(NS.totals.at135 <= TM.GOVERN_AT, `shared run ${NS.totals.at135} s at 135 wpm`);
assert.ok(NS.compacted.every((id) => TM.COMPACT_ORDER.includes(id)));
console.log(`narration.test: part 2 ok (23 approved lines reproduced; ${N.totals.words} words; ${N.totals.at135} s at 135 wpm, ${N.totals.at150} s at 150; ${built} launcher choices built; shared copy ${NS.totals.words} words, ${NS.totals.at135} s, short: ${NS.compacted.join(", ") || "none"})`);
