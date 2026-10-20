// Ask update (FY 2026-27 Updates): the pure helpers in src/updateKinds.js (kinds, thread state, the form's
// checks, tallies, day texts). PUBLIC: no data.
//
//   node scripts/sim/live/askupdate.test.mjs
//
// Bundled in memory with esbuild (already installed with Vite) and imported from a data URL. Nothing is
// written to disk and no network is used.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = await build({
  stdin: { contents: `export * from "./src/updateKinds.js";`, resolveDir: root, loader: "js" },
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
});
const H = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// Kinds: a row without one (older rows, the simulation's snapshot) is an ordinary comment.
eq(H.kindOf({}), "comment", "no kind");
eq(H.kindOf(null), "comment", "no row");
eq(H.kindOf({ kind: "update" }), "update", "update");

// Items, as deliverable_is_item in the database.
for (const t of ["Contingency 5%", "5% contingency", "10 % Contingencies", "Sales Tax", "GST", "gst 17%", "Withholding tax", "Income tax"])
  eq(H.isItem(t), false, `not an item: ${t}`);
for (const t of ["Laptop core i7", "GSTN router", "Taxi stand canopy", "", null, "Installation incl. sales tax"])
  eq(H.isItem(t), true, `an item: ${t}`);

// Request body and note.
eq(H.requestBody(""), "Update requested", "no note");
eq(H.requestBody("  Board on Friday  "), "Update requested\nBoard on Friday", "with a note");
eq(H.requestNote("Update requested\nBoard on Friday\nThanks"), "Board on Friday\nThanks", "note read back");
eq(H.requestNote("Update requested"), "", "no note read back");
eq(H.requestBody("x".repeat(2000)).length, "Update requested\n".length + H.NOTE_MAX, "note capped");

// Thread state: open requests are those after the latest update.
const r1 = { id: "r1", kind: "update_request", created_at: "2026-10-10T05:00:00Z" };
const c1 = { id: "c1", created_at: "2026-10-11T05:00:00Z" };
const u1 = { id: "u1", kind: "update", created_at: "2026-10-12T05:00:00Z", data: { pct: 40 } };
const r2 = { id: "r2", kind: "update_request", created_at: "2026-10-15T05:00:00Z" };
const r3 = { id: "r3", kind: "update_request", created_at: "2026-10-18T05:00:00Z" };
const reply = { id: "x", kind: "update", parent_id: "r2", created_at: "2026-10-19T05:00:00Z" };
let st = H.threadState([r3, c1, r2, u1, r1, reply]);
eq(st.waiting.map((r) => r.id), ["r2", "r3"], "waiting after the latest update, oldest first");
eq(st.pending.id, "r2", "pending since the first waiting request");
eq(st.lastUpdate.id, "u1", "latest update (replies ignored)");
eq(Object.keys(st.answeredBy), ["r1"], "r1 answered");
eq(st.answeredBy.r1.id, "u1", "by u1");
st = H.threadState([r1, u1]);
eq(st.pending, null, "nothing waits after an update");
eq(H.threadState([]).lastUpdate, null, "empty thread");
eq(H.threadState(null).waiting, [], "no thread");

// % completed.
eq(H.cleanPct("0"), 0, "0");
eq(H.cleanPct("100"), 100, "100");
eq(H.cleanPct("101"), null, "over 100");
eq(H.cleanPct(""), null, "empty");
eq(H.cleanPct("4.5"), null, "decimals are not typed");
eq(H.cleanPct(" 60 "), 60, "spaces");
eq(H.cleanPct(60), 60, "a number");

// What the form still needs.
const lines = [{ id: "a", line_no: 1 }, { id: "b", line_no: 2 }];
let need = H.missingOf({ lines, answers: {}, overall: null, pct: "", detail: "" });
eq(need.map((m) => m.key), ["s:a", "c:a", "s:b", "c:b", "overall", "pct", "detail"], "everything missing, in page order");
need = H.missingOf({ lines, answers: { a: { status: "arrived", comment: "ok" }, b: { status: "toString", comment: " x " } },
  overall: "constructor", pct: "50", detail: "x".repeat(H.DETAIL_MIN - 1) });
eq(need.map((m) => m.key), ["s:b", "c:b", "overall", "detail"], "prototype names are not statuses; short comment and detail");
need = H.missingOf({ lines: [], answers: {}, overall: "on_track", pct: "0", detail: " " + "y".repeat(H.DETAIL_MIN) + " " });
eq(need, [], "no lines: overall, % and detail only");
eq(H.linesDone(lines, { a: { status: "ordered", comment: "PO" }, b: { status: "not_yet" } }), 1, "lines done");

const data = H.updateData({ lines, answers: { a: { status: "arrived", comment: " came " }, b: { status: "not_yet", comment: "no" }, z: { status: "arrived", comment: "old" } },
  overall: "at_risk", pct: "35" });
eq(data, { overall: "at_risk", pct: 35, lines: [{ id: "a", status: "arrived", comment: "came" }, { id: "b", status: "not_yet", comment: "no" }] },
  "the update's data: only the current lines, comments trimmed, % a number");

// Tallies.
const t = H.tally([{ status: "arrived" }, { status: "arrived" }, { status: "ordered" }, { status: "not_yet" }, { status: "toString" }, null]);
eq(t, { arrived: 2, ordered: 1, not_yet: 1 }, "tally");
eq(H.tallyText(t), "2 arrived · 1 ordered · 1 not yet", "tally text");
eq(H.tallyText({ arrived: 0, ordered: 3, not_yet: 0 }), "3 ordered", "zeros left out");
eq(H.tallyText(H.tally([])), "", "no lines");

// The starting choice from the Deliverables tab.
eq(["not_started", "ordered", "delivered", "installed", "handed_over", undefined].map(H.choiceFromStatus),
  [null, "ordered", "arrived", "arrived", "arrived", null], "choice from status");

// Days in Pakistan time (UTC+5).
const now = Date.parse("2026-10-20T10:00:00Z");     // 15:00 PKT, 20 Oct
eq(H.daysAgo("2026-10-20T00:00:00Z", now), 0, "same PKT day");
eq(H.daysAgo("2026-10-19T18:59:00Z", now), 1, "23:59 PKT the day before");
eq(H.daysAgo("2026-10-19T19:00:00Z", now), 0, "00:00 PKT today");
eq(H.agoText("2026-10-19T12:00:00Z", now), "yesterday", "yesterday");
eq(H.agoText("2026-10-17T12:00:00Z", now), "3 days ago", "3 days ago");
eq(H.agoText("2026-10-20T09:00:00Z", now), "today", "today");
eq(H.agoShort("2026-10-19T12:00:00Z", now), "1 day", "1 day");
eq(H.agoShort("2026-10-15T12:00:00Z", now), "5 days", "5 days");
eq(H.agoText("not a date", now), "", "bad date");
eq(H.dayText("2026-10-19T20:00:00Z", now), "20 Oct", "PKT date");
eq(H.dayText("2025-12-31T12:00:00Z", now), "31 Dec 2025", "another year");
eq(H.dayText("2026-10-20", now), "20 Oct", "a plain date");

// Characters counted as the database counts them (code points, after trimming): an emoji is one.
eq(H.chars("👍"), 1, "one emoji is one character");
eq(H.chars("  ok  "), 2, "trimmed");
eq(H.chars(null), 0, "nothing");
need = H.missingOf({ lines: [{ id: "a", line_no: 1 }], answers: { a: { status: "arrived", comment: "👍" } },
  overall: "on_track", pct: "10", detail: "😀".repeat(H.DETAIL_MIN - 1) });
eq(need.map((m) => m.key), ["c:a", "detail"], "an emoji comment is too short, as the database says");
eq(H.linesDone([{ id: "a" }], { a: { status: "arrived", comment: "👍👍" } }), 1, "two emojis are enough");

// What a request asks for, as the email says it.
eq(H.needText(0), "the overall status, % completed and a detailed update", "no lines");
eq(H.needText(1), "the status and a comment on the 1 deliverable, the overall status, % completed and a detailed update", "one line");
eq(H.needText(3).startsWith("the status and a comment on each of the 3 deliverables,"), true, "three lines");
eq(/when the project has any/.test(H.needText(null)), true, "not known");

// Errors in plain words (the database's text goes to the console only).
const quiet = console.warn; console.warn = () => {};
const pe = (m) => H.plainError(new Error(m), { rls: "RLS", fallback: "FALLBACK" });
eq(pe('new row violates row-level security policy for table "comments"'), "RLS", "row-level security");
eq(/missing/.test(pe('new row for relation "comments" violates check constraint "comments_update_shape_chk"')), true, "check constraint");
eq(/expired/.test(pe("JWT expired")), true, "expired sign-in");
eq(pe("Could not find the 'kind' column of 'comments' in the schema cache"), "FALLBACK", "anything else");
eq(H.plainError(null, { rls: "RLS", fallback: "FALLBACK" }), "FALLBACK", "no error object");
console.warn = quiet;

console.log(`askupdate: ${checks} checks passed`);
