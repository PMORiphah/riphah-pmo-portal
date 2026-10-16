// PMO Simulation (live data): the director's action allow-list (src/sim/director/guard.js, contract
// §H.4). PUBLIC: no data. Owner: B3b.   node scripts/sim/live/guard.test.mjs
//
// Builds small portal-like trees in a minimal DOM (./minidom.mjs) and checks what the guard allows
// and refuses: allowed controls and their inner text, controls nested inside allowed rows, writing
// words, inputs, editable fields, links, the never-touch areas, pickers and options, keys, storage
// and helpers, and the record on window.__PMO_SIM_ACTIONS__.
import assert from "node:assert/strict";
import { makeDom } from "./minidom.mjs";

const dom = makeDom();
globalThis.window = globalThis;
globalThis.document = dom.document;
globalThis.getComputedStyle = dom.getComputedStyle;
const G = await import(new URL("../../../src/sim/director/guard.js", import.meta.url));
const { h } = dom;
let n = 0;
const allow = (action, el, ctx, msg) => { assert.equal(G.reasonFor(action, el, ctx || {}), null, `allowed: ${msg}`); n++; };
const deny = (action, el, ctx, msg) => { assert.notEqual(G.reasonFor(action, el, ctx || {}), null, `refused: ${msg}`); n++; };

// A portal-like page.
const navCmd = h("button", { "data-nav": "cmd" }, h("span", {}, "Capex Dashboard"));
const navSettings = h("button", { "data-nav": "set" }, "Settings");
const navActivity = h("button", { "data-nav": "log" }, "Activity Log");
const tabDocs = h("button", { "data-tab": "documents" }, "Documents");
const tabDeliv = h("button", { "data-tab": "deliverables" }, "Deliverables");
const stageEd = h("button", { "data-stage": "in_ed", title: "ED Review — 7 projects (6.4%)" }, h("span", {}, "7"));
const stageMt = h("button", { "data-stage": "in_mt", title: "MT Review — 0 projects (0.0%)" }, h("span", {}, "0"));
const cellFull = h("button", { "data-cell": "medium-high" }, h("span", {}, "26"));
const cellEmpty = h("button", { "data-cell": "high-high" }, "Critical");
const pencil = h("button", { "aria-label": "Edit project" }, "");
const bin = h("button", { "aria-label": "Remove" }, "");
const starBtn = h("button", {}, "Pin");
const rowCell = h("td", {}, "Post-graduate hostel refit");     // a project title that starts with a deny word
const projRow = h("tr", { "data-project-id": "p1" }, rowCell, h("td", {}, pencil, bin, starBtn));
const search = h("input", { "data-tour": "projects-search", type: "text" });
const pastSearch = h("input", { "data-tour": "past-search", type: "text" });
const otherInput = h("input", { type: "text", placeholder: "Filter name" });
const note = h("textarea", {});
const tick = h("input", { type: "checkbox" });
const compare = h("div", { "data-tour": "compare-table" }, h("table", {}, h("tr", { "data-campus": "A" }, h("td", {}, tick))));
const sortHead = h("th", { "data-col": "released" }, "Released");
const delayed = h("button", { "data-filter": "delayed" }, "Delayed (25)");
const assignBtn = h("button", { "data-tour": "assign-pm" }, "Assign PM");
const pmSelect = h("button", { "data-tour": "pm-select", role: "combobox", "aria-expanded": "false" }, "Select a project manager");
const cancel = h("button", {}, "Cancel");
const confirmBtn = h("button", {}, "Assign to 2 projects");
const dialog = h("div", { role: "dialog" }, pmSelect, h("div", { "data-tour": "bulk-preview" }, "2 projects will be assigned"), cancel, confirmBtn);
const otherCancel = h("button", {}, "Cancel");
const otherDialog = h("div", { role: "dialog" }, h("div", {}, "Delete this file?"), otherCancel);
const phoneCell = h("td", { "data-col": "phone" }, h("span", {}, "hidden"));
const mail = h("a", { href: "mailto:someone@example.org" }, "Email");
const wa = h("a", { href: "https://wa.me/000" }, "Nudge on WhatsApp");
const editable = h("div", { contenteditable: "true" }, "note");
const updRow = h("div", { "data-project-id": "p2" }, "Some thread");
const updList = h("div", { "data-tour": "updates-list" }, updRow);
const updTab = h("button", { "data-tour": "updates-tab-all" }, "All Projects");
const pastRow = h("div", { "data-past": "x1" }, "Delete old shed works");          // a title with a deny word: rows are exempt
const reportRow = h("button", { "data-report": "r1" }, "Monthly Board Report: October");
const back = h("button", { "data-tour": "report-back" }, "Back");
const publish = h("button", {}, "Publish…");
const h2hOpen = h("button", { "data-tour": "h2h-open" }, "Open");
const viewBtn = h("button", { "data-view": "compare" }, "Compare");
const modeBtn = h("button", { "data-mode": "h2h" }, "Head to head (3)");
const kpiCard = h("div", { "data-kpi": "budget_released" }, "Budget released 12.3M");
const tlCombo = h("button", { "data-tour": "timeline-campus", role: "combobox", "aria-expanded": "true" }, "All campuses");
const galCombo = h("button", { "data-tour": "gallery-campus", role: "combobox", "aria-expanded": "false" }, "All campuses");
const otherCombo = h("button", { role: "combobox", "aria-expanded": "true" }, "All priorities");
const option = h("div", { role: "option", "data-value": "A" }, "A");
const listbox = h("div", { role: "listbox" }, option);
dom.document.body.append(navCmd, navSettings, navActivity, tabDocs, tabDeliv, stageEd, stageMt, cellFull, cellEmpty, h("table", {}, projRow),
  search, pastSearch, otherInput, note, compare, sortHead, delayed, assignBtn, dialog, otherDialog, h("table", {}, h("tr", {}, phoneCell)), mail, wa,
  editable, updList, updTab, pastRow, reportRow, back, publish, h2hOpen, viewBtn, modeBtn, kpiCard, tlCombo, galCombo, otherCombo, listbox);

// clicks
allow("click", navCmd, {}, "a page in the run");
allow("click", navCmd.children[0], {}, "the text inside a nav button");
deny("click", navSettings, {}, "Settings page");
deny("click", navActivity, {}, "Activity Log page");
allow("click", tabDocs, {}, "Documents tab");
deny("click", tabDeliv, {}, "Deliverables tab");
allow("click", stageEd, {}, "a stage holding projects");
deny("click", stageMt, {}, "a stage at 0");
allow("click", cellFull, {}, "a matrix cell with risks");
deny("click", cellEmpty, {}, "an empty matrix cell");
allow("click", projRow, {}, "a project row");
allow("click", rowCell, {}, "a cell of a project row (its title is not read as a word)");
deny("click", pencil, {}, "the pencil inside a project row");
deny("click", bin, {}, "the bin inside a project row");
deny("click", starBtn, {}, "any other control inside a project row");
deny("click", search, {}, "clicking an input");
deny("click", note, {}, "a textarea");
allow("click", tick, {}, "a Compare tick box");
deny("click", sortHead, {}, "a header sort");
deny("click", delayed, {}, "the Delayed chip");
allow("click", assignBtn, {}, "Assign PM (opens a preview)");
allow("click", cancel, {}, "Cancel in the Assign PM dialog");
deny("click", confirmBtn, {}, "Assign to 2 projects");
deny("click", otherCancel, {}, "Cancel in any other dialog");
deny("click", pmSelect, {}, "the PM picker");
deny("click", phoneCell.children[0], {}, "the WhatsApp cell");
deny("click", mail, {}, "a mailto link");
deny("click", wa, {}, "a WhatsApp link");
deny("click", editable, {}, "an editable area");
allow("click", updRow, {}, "an Updates list row");
allow("click", updTab, {}, "the All Projects tab");
allow("click", pastRow, {}, "a past project row (title with a deny word)");
allow("click", reportRow, {}, "a report row");
allow("click", back, {}, "report Back");
deny("click", publish, {}, "Publish");
allow("click", h2hOpen, {}, "Open on a campus");
allow("click", viewBtn, {}, "a view switch");
allow("click", modeBtn, {}, "a Compare mode");
deny("click", kpiCard, {}, "a KPI card");
deny("click", null, {}, "nothing");
// typing
allow("type", search, {}, "the Projects search");
allow("type", pastSearch, {}, "the Past search");
deny("type", otherInput, {}, "any other input");
deny("type", note, {}, "a textarea");
// pickers
allow("pick", tlCombo, {}, "the Timeline campus picker");
allow("pick", galCombo, {}, "the Gallery campus picker");
deny("pick", otherCombo, {}, "any other picker");
deny("pick", pmSelect, {}, "the PM picker");
allow("option", option, { combo: tlCombo }, "an option of an open allowed picker");
deny("option", option, { combo: galCombo }, "an option while that picker is closed");
deny("option", option, { combo: otherCombo }, "an option of another picker");
deny("option", navCmd, { combo: tlCombo }, "something that is not an option");
// keys, storage, helpers
allow("key", null, { key: "Escape" }, "Escape");
deny("key", null, { key: "Enter" }, "Enter");
deny("key", null, { key: "Delete" }, "Delete");
allow("store", null, { key: "pmo-campus-view" }, "the Compare view key");
deny("store", null, { key: "pmo_session" }, "any other storage key");
allow("do", null, { helper: "revealNav" }, "revealNav");
deny("do", null, { helper: "anything" }, "an unknown helper");
deny("navigate", navCmd, {}, "an unknown action");

// check(): throws ReadOnlyViolation and records every call
const before = (window.__PMO_SIM_ACTIONS__ || []).length;
assert.equal(G.check("click", navCmd, { scene: 1 }), true);
assert.throws(() => G.check("click", confirmBtn, { scene: 13 }), (e) => e instanceof G.ReadOnlyViolation && e.action === "click");
const log = window.__PMO_SIM_ACTIONS__;
assert.equal(log.length, before + 2);
assert.deepEqual([log.at(-2).ok, log.at(-1).ok], [true, false]);
assert.equal(log.at(-2).data.nav, "cmd");
assert.equal(log.at(-1).dialog !== null, true);
assert.equal(log.at(-1).scene, 13);
n += 6;
console.log(`guard.test: PASS ${n} checks`);
