// PMO Simulation (live data): the screen forms of the figures the narration quotes. PUBLIC, no data.
// Owner: B3a. Spec: contract §F.3.
//
// Every formatter here is an exact copy of the one the screen uses, so a figure check can look for the
// very text the screen prints. scripts/sim/live/format.test.mjs evaluates the App's own source lines
// and compares them with these on sampled values; change both together or not at all.
import { fmtDay } from "../../reportCalc.js";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** App.jsx:191 (dashboard, Projects, Monthly figures). "691.5M", "1,167.3M", null → "—". */
export const fmtM = (n) => n == null ? "—" : (n / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";

/** App.jsx:195-200 (project page). "19,598,405". */
export const fmtFull = (n) => {
  if (n == null || n === "") return "—";
  const v = parseFloat(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-PK", { maximumFractionDigits: 0 });
};

/** App.jsx:269 (dashboard cards, e.g. "36.0% of total CAPEX"); identical to the project page's and
 *  Performance's local fmtP (App.jsx:6518, 7378). */
export const fmtP = (n) => n == null ? "—" : parseFloat(n).toFixed(1) + "%";
export const fmtP1 = fmtP;

/** App.jsx:6516 / 7376 (Performance and the project strip): no thousands separator. */
export const fmtMfixed = (n) => n == null ? "—" : (parseFloat(n) / 1e6).toFixed(1) + "M";

/** CampusCompare.jsx fmtM (null counts as 0) and pct(). */
export const fmtMcc = (n) => `${(num(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
export const pctRound = (x) => `${Math.round(num(x) * 100)}%`;

/** Cashflows.jsx mLabel: "2026-11-01" → "Nov 26". */
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const mLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : `${MONTHS3[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

const PKT_MS = 5 * 3600e3;
const GB_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
const GB_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false });

/** A calendar date ("2026-12-30") as the Timeline card and the Risk dates print it: "30 Dec 2026"
 *  (en-GB writes "Sept"). Those screens format local midnight; the laptop runs in PKT. */
export const fmtDayGB = (iso) => {
  if (!iso) return "—";
  const ms = Date.parse(String(iso).slice(0, 10) + "T00:00:00+05:00");
  return isFinite(ms) ? GB_DAY.format(ms) : "—";
};

/** A timestamp's PKT day in the same en-GB form: "16 Oct 2026" (the as-of kicker). */
export const fmtStampGB = (t) => (isFinite(t) ? GB_DAY.format(t) : "—");

/** reportCalc.js:314, imported (not copied): "15 Oct 2026" from a timestamp, PKT day. */
export const fmtDayReport = fmtDay;

/** "10:41" in Pakistan time. */
export const hhmmPKT = (ms) => GB_HHMM.format(ms);

/** "YYYY-MM-DD" of a timestamp in Pakistan time (PKT has no daylight saving). */
export const pktDateOf = (ms) => new Date(ms + PKT_MS).toISOString().slice(0, 10);
