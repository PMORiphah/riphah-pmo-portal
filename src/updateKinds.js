// Ask update on FY 2026-27 Updates (PMO, 20 Oct 2026; plan docs/plans/status-requests.md).
//
// A request and the manager's update are posts in the project's Updates thread (comments.kind):
//   comment         an ordinary post (every older row, and rows read without the column)
//   update_request  "Ask update", by the PMO or a past-project viewer; body "Update requested" + an optional note
//   update          the manager's update; body = the detailed update, data = { overall, pct, lines }
// The database checks every rule again; these helpers only shape the page. Pure (tested in
// scripts/sim/live/askupdate.test.mjs), so the main bundle and the lazy UpdateRequest.jsx share them.
import { BRAND, DATA } from "./theme.js";

/** The manager's overall status and a deliverable line's status, as shown (colours are fills; text uses T.textOf). */
export const OVERALL = {
  on_track: { label: "On track", color: DATA.positive },
  at_risk:  { label: "At risk",  color: DATA.warning },
  delayed:  { label: "Delayed",  color: DATA.danger },
};
export const LINE_STATUS = {
  arrived: { label: "Arrived", color: DATA.positive },
  ordered: { label: "Ordered", color: BRAND.blueBright },
  not_yet: { label: "Not yet", color: DATA.neutral },
};

export const DETAIL_MIN = 20;    // detailed update, characters (comments_update_shape_chk)
export const COMMENT_MIN = 2;    // comment on a deliverable line (check_update_lines)
export const NOTE_MAX = 1000;    // the asker's optional note
const PKT_MS = 5 * 3600e3;       // Pakistan Standard Time, UTC+5 all year
const DAY_MS = 864e5;

/** The post's kind; a row without one is an ordinary comment. */
export const kindOf = (c) => c?.kind || "comment";

/** A deliverable line that is an item, not a contingency, sales tax or GST line (as deliverable_is_item). */
export const NON_ITEM = /^\s*(\d+(\.\d+)?\s*%\s*)?(contingenc|sales\s*tax|gst\b|withholding|income\s*tax)/i;
export const isItem = (title) => !NON_ITEM.test(String(title ?? ""));

/** The request's body: "Update requested", and the note on the next line when there is one. */
export const requestBody = (note) => {
  const n = String(note ?? "").trim().slice(0, NOTE_MAX);
  return n ? `Update requested\n${n}` : "Update requested";
};
/** The asker's note inside a request's body ("" when none). */
export const requestNote = (body) => String(body ?? "").split("\n").slice(1).join("\n").trim();

/**
 * Where a thread stands, from its top-level posts:
 *   waiting     requests made since the latest update (oldest first; empty when nothing waits)
 *   pending     the first of them (what "Update requested N days ago" counts from), or null
 *   lastUpdate  the latest update, or null
 *   answeredBy  { request id: the update that answered it }
 */
export function threadState(rows) {
  const top = (Array.isArray(rows) ? rows : []).filter((r) => r && !r.parent_id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  let waiting = [], lastUpdate = null;
  const answeredBy = {};
  for (const r of top) {
    const k = kindOf(r);
    if (k === "update_request") waiting.push(r);
    else if (k === "update") { waiting.forEach((q) => { answeredBy[q.id] = r; }); waiting = []; lastUpdate = r; }
  }
  return { waiting, pending: waiting[0] || null, lastUpdate, answeredBy };
}

/** A whole percentage 0-100 from what was typed, or null. */
export function cleanPct(v) {
  const s = String(v ?? "").trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
/** Characters as the database counts them (length(btrim(…)) counts code points: an emoji is 1, not 2). */
export const chars = (s) => [...String(s ?? "").trim()].length;
const lineOk = (a) => !!a && own(LINE_STATUS, a.status) && chars(a.comment) >= COMMENT_MIN;

/** Lines with both a status and a comment. */
export const linesDone = (lines, answers) => (lines || []).filter((l) => lineOk(answers?.[l.id])).length;

/**
 * What the form still needs, in the order it is shown: [{ key, text }]. key is the field's
 * data-need attribute on the page ("s:<line id>", "c:<line id>", "overall", "pct", "detail").
 */
export function missingOf({ lines, answers, overall, pct, detail }) {
  const out = [];
  (lines || []).forEach((l, i) => {
    const a = answers?.[l.id] || {};
    const n = l.line_no ?? i + 1;
    if (!own(LINE_STATUS, a.status)) out.push({ key: `s:${l.id}`, text: `Line ${n}: status` });
    if (chars(a.comment) < COMMENT_MIN) out.push({ key: `c:${l.id}`, text: `Line ${n}: comment` });
  });
  if (!own(OVERALL, overall)) out.push({ key: "overall", text: "Overall status" });
  if (cleanPct(pct) == null) out.push({ key: "pct", text: "% completed (0 to 100)" });
  if (chars(detail) < DETAIL_MIN) out.push({ key: "detail", text: `Detailed update (at least ${DETAIL_MIN} characters)` });
  return out;
}

/** What a request asks of the manager, said as the email says it (n = the project's item lines, null = not known). */
export const needText = (n) => n == null
  ? "the status and a comment on each deliverable (when the project has any), the overall status, % completed and a detailed update"
  : n > 0
    ? `the status and a comment on ${n === 1 ? "the 1 deliverable" : `each of the ${n} deliverables`}, the overall status, % completed and a detailed update`
    : "the overall status, % completed and a detailed update";

/**
 * A failed post in plain words; the database's own text goes to the console only.
 * rls: what to say when row-level security refused it (who may do this).
 */
export function plainError(e, { rls, fallback }) {
  const m = String(e?.message || "");
  if (m) console.warn("[request]", m);
  if (/row-level security/i.test(m)) return rls;
  if (/violates check constraint|every deliverable/i.test(m)) return "Something is missing; please check every field and try again.";
  if (/jwt|expired/i.test(m)) return "Your sign-in has expired. Please sign in again and send it once more.";
  return fallback;
}

/** The update's data as the database expects it. */
export const updateData = ({ lines, answers, overall, pct }) => ({
  overall, pct: cleanPct(pct),
  lines: (lines || []).map((l) => ({ id: l.id, status: answers[l.id].status, comment: String(answers[l.id].comment).trim() })),
});

/** { arrived, ordered, not_yet } counted over an update's lines. */
export function tally(lines) {
  const t = { arrived: 0, ordered: 0, not_yet: 0 };
  (Array.isArray(lines) ? lines : []).forEach((l) => { if (l && own(t, l.status)) t[l.status]++; });
  return t;
}
/** "3 arrived · 2 ordered · 1 not yet" (zeros left out; "" when there are no lines). */
export function tallyText(t) {
  return [[t.arrived, "arrived"], [t.ordered, "ordered"], [t.not_yet, "not yet"]]
    .filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`).join(" · ");
}

/** The status a deliverable already has, as a choice on the form (null: not started, so no default). */
export const choiceFromStatus = (s) =>
  s === "delivered" || s === "installed" || s === "handed_over" ? "arrived" : s === "ordered" ? "ordered" : null;

const pktDay = (t) => Math.floor((t + PKT_MS) / DAY_MS);
/** Calendar days in Pakistan between a time and now (0 = today). */
export function daysAgo(ts, now = Date.now()) {
  const t = Date.parse(ts);
  return isNaN(t) ? null : Math.max(0, pktDay(now) - pktDay(t));
}
/** "today", "yesterday", "3 days ago". */
export function agoText(ts, now = Date.now()) {
  const d = daysAgo(ts, now);
  return d == null ? "" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
/** "today", "1 day", "3 days": for chips. */
export function agoShort(ts, now = Date.now()) {
  const d = daysAgo(ts, now);
  return d == null ? "" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`;
}
/** "20 Oct" in Pakistan time (with the year when it is not this year). */
export function dayText(ts, now = Date.now()) {
  const t = Date.parse(ts);
  if (isNaN(t)) return "";
  const d = new Date(t + PKT_MS), n = new Date(now + PKT_MS);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC",
    ...(d.getUTCFullYear() === n.getUTCFullYear() ? {} : { year: "numeric" }) });
}
