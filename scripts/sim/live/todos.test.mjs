// To-Do List tab: the pure helpers in src/ProjectTodos.jsx (due tone and text, done text, title check, order).
// PUBLIC: no data.
//
//   node scripts/sim/live/todos.test.mjs
//
// The component file is JSX, so it is bundled in memory with esbuild (already installed with Vite) and imported
// from a data URL. Nothing is written to disk and no network is used.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = await build({
  stdin: {
    contents: `export { todayPKT, dueTone, dueText, daysUntil, doneText, cleanTitle, sortOpen, sortDone, TODO_MAX }
               from "./src/ProjectTodos.jsx";`,
    resolveDir: root, loader: "js",
  },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
});
const H = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// Today in Pakistan (UTC+5): 19:00 UTC is already the next day there.
eq(H.todayPKT(Date.parse("2026-10-20T18:59:59Z")), "2026-10-20", "PKT before midnight");
eq(H.todayPKT(Date.parse("2026-10-20T19:00:00Z")), "2026-10-21", "PKT after midnight");
eq(H.todayPKT(Date.parse("2026-12-31T19:30:00Z")), "2027-01-01", "PKT new year");

const today = "2026-10-20";
eq(H.dueTone(null, today), null, "no due date");
eq(H.dueTone("", today), null, "empty due date");
eq(H.dueTone("2026-10-19", today), "overdue", "yesterday is overdue");
eq(H.dueTone("2026-10-20", today), "today", "today");
eq(H.dueTone("2026-10-21", today), "upcoming", "tomorrow");
eq(H.dueTone("2026-10-20T00:00:00Z", today), "today", "timestamp form read as its date");

eq(H.dueText("2026-10-22", today), "Due 22 Oct", "upcoming text");
eq(H.dueText("2026-10-18", today), "Overdue · 18 Oct", "overdue text");
eq(H.dueText("2026-10-20", today), "Due today", "today text");
eq(H.dueText("2027-01-03", today), "Due 3 Jan 2027", "another year shows the year");
eq(H.dueText(null, today), "", "no text without a date");

eq(H.daysUntil("2026-10-22", today), 2, "two days ahead");
eq(H.daysUntil("2026-10-18", today), -2, "two days overdue");
eq(H.daysUntil("2026-11-01", today), 12, "across a month end");

// Done times are read in Pakistan time: 20:00 UTC on the 19th is the 20th there.
eq(H.doneText("2026-10-19T20:00:00Z", today), "done 20 Oct", "done date in PKT");
eq(H.doneText("2026-10-19T18:00:00+00:00", today), "done 19 Oct", "done date before PKT midnight");
eq(H.doneText(null, today), "done", "no done time");
eq(H.doneText("2025-12-30T10:00:00Z", today), "done 30 Dec 2025", "another year");

eq(H.cleanTitle("  Call the vendor  "), "Call the vendor", "trimmed");
eq(H.cleanTitle("   "), null, "blank refused");
eq(H.cleanTitle(""), null, "empty refused");
eq(H.cleanTitle(null), null, "null refused");
eq(H.cleanTitle("x".repeat(H.TODO_MAX)), "x".repeat(500), "500 characters allowed");
eq(H.cleanTitle("x".repeat(501)), null, "501 characters refused");
eq(H.cleanTitle("  " + "y".repeat(500) + "  "), "y".repeat(500), "length counted after trimming");

// Open: by due date with undated last, then oldest first (the server's order: due_date.asc.nullslast, created_at.asc).
const open = [
  { id: "a", due_date: null,         created_at: "2026-10-01T00:00:00Z" },
  { id: "b", due_date: "2026-10-25", created_at: "2026-10-05T00:00:00Z" },
  { id: "c", due_date: "2026-10-18", created_at: "2026-10-09T00:00:00Z" },
  { id: "d", due_date: "2026-10-25", created_at: "2026-10-02T00:00:00Z" },
  { id: "e", due_date: null,         created_at: "2026-09-30T00:00:00Z" },
];
eq(H.sortOpen(open).map(x => x.id), ["c", "d", "b", "e", "a"], "open order");
eq(open.map(x => x.id), ["a", "b", "c", "d", "e"], "input not changed");

const done = [
  { id: "x", done_at: "2026-10-18T09:00:00Z" },
  { id: "y", done_at: "2026-10-20T09:00:00Z" },
  { id: "z", done_at: "2026-10-19T09:00:00Z" },
];
eq(H.sortDone(done).map(x => x.id), ["y", "z", "x"], "done: most recent first");

console.log(`todos.test: ${checks} checks passed`);
