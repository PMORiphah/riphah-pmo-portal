// PMO Simulation (live data): src/sim/live/format.js must print exactly what the screens print.
// PUBLIC, no data. Runs without the private fixture.
//
//   node scripts/sim/live/format.test.mjs
//
// The App's own formatter lines are read from the source files and evaluated, then compared with
// format.js on 200+ sampled values each (sample values are invented).
process.env.TZ = "Asia/Karachi";   // the presenting laptop's zone (Timeline formats local midnight)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as FMT from "../../../src/sim/live/format.js";
import { fmtDay } from "../../../src/reportCalc.js";

const SRC = new URL("../../../src/", import.meta.url);
const read = (f) => readFileSync(new URL(f, SRC), "utf8");
const app = read("App.jsx"), cc = read("CampusCompare.jsx"), cf = read("Cashflows.jsx"), tl = read("Timeline.jsx");

/** The source text of `const <name> = …;` (one line, or a block up to the closing "};"). */
function snippet(src, re, label) {
  const m = re.exec(src);
  assert.ok(m, `source line not found: ${label}`);
  return m[0];
}
const evalFns = (code, names) => new Function(`${code}\nreturn { ${names.join(", ")} };`)();

const appFmtM = evalFns(snippet(app, /^const fmtM = .*$/m, "App fmtM"), ["fmtM"]).fmtM;
const appFmtFull = evalFns(snippet(app, /^const fmtFull = \(n\) => \{[\s\S]*?^\};/m, "App fmtFull"), ["fmtFull"]).fmtFull;
const appFmtP = evalFns(snippet(app, /^const fmtP = .*$/m, "App fmtP"), ["fmtP"]).fmtP;
const localFmtP = [...app.matchAll(/^\s*const fmtP\s+= (n => .*);$/gm)].map((m) => new Function(`return ${m[1]}`)());
const localFmtM = [...app.matchAll(/^\s*const fmtM\s+= (n => n == null \? "—" : \(parseFloat\(n\)\s*\/\s*1e6\)\.toFixed\(1\)\s*\+\s*"M");$/gm)]
  .map((m) => new Function(`return ${m[1]}`)());
const ccFns = evalFns([snippet(cc, /^const num = .*$/m, "CC num"), snippet(cc, /^const fmtM = .*$/m, "CC fmtM"), snippet(cc, /^const pct = .*$/m, "CC pct")].join("\n"), ["fmtM", "pct"]);
const cfFns = evalFns([snippet(cf, /^const MONTHS = .*$/m, "CF MONTHS"), snippet(cf, /^const mLabel = \(iso\) => \{[\s\S]*?^\};/m, "CF mLabel"),
  snippet(cf, /^const fmtM = \(n\) => n == null \? "—"\n.*$/m, "CF fmtM")].join("\n"), ["mLabel", "fmtM"]);
const tlFns = evalFns([snippet(tl, /^const d0 = .*$/m, "TL d0"), snippet(tl, /^const fmtD = .*$/m, "TL fmtD")].join("\n"), ["d0", "fmtD"]);

// Invented sample values: magnitudes from 0 to billions, halves at the rounding edge, negatives,
// numeric strings, null and blanks.
let seed = 20261016;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const numbers = [0, 1, 49999, 50000, 950000, 999999, 1e6, 1049999, 1050000, 1250000, 1350000, 123456789, 999949999, 999950000,
  1234567890, -1, -2500000, 0.5, 49999.5];
while (numbers.length < 220) {
  const mag = Math.floor(rnd() * 10);
  numbers.push(Math.round(rnd() * 10 ** mag * (rnd() < 0.1 ? -1 : 1) * 100) / (rnd() < 0.5 ? 1 : 100));
}
const loose = [...numbers, null, undefined, "", "12345678", "0", "abc", "1e7"];
const pcts = [0, 0.04, 0.05, 0.949, 0.95, 1, 36, 36.04, 36.05, 99.95, 100, ...numbers.slice(0, 200).map((x) => (Math.abs(x) % 10000) / 97)];
const rates = [0, 0.004, 0.005, 0.0049, 0.125, 0.5, 0.995, 1, 1.2, ...numbers.slice(0, 200).map((x) => (Math.abs(x) % 1000) / 997)];

let checks = 0;
const same = (a, b, what, v) => { assert.equal(a, b, `${what}(${JSON.stringify(v)})`); checks++; };

for (const v of numbers) same(FMT.fmtM(v), appFmtM(v), "fmtM", v);
same(FMT.fmtM(null), appFmtM(null), "fmtM", null);
for (const v of loose) same(FMT.fmtFull(v), appFmtFull(v), "fmtFull", v);
for (const v of [...pcts, null, "12.34"]) {
  same(FMT.fmtP(v), appFmtP(v), "fmtP", v);
  same(FMT.fmtP1(v), appFmtP(v), "fmtP1", v);
  for (const f of localFmtP) same(FMT.fmtP(v), f(v), "local fmtP", v);
}
assert.ok(localFmtP.length >= 2, "the project page and Performance fmtP were found");
assert.ok(localFmtM.length >= 2, "the project page and Performance fmtM were found");
for (const v of loose) for (const f of localFmtM) same(FMT.fmtMfixed(v), f(v), "fmtMfixed", v);
for (const v of loose) same(FMT.fmtMcc(v), ccFns.fmtM(v), "CampusCompare fmtM", v);
for (const v of rates) same(FMT.pctRound(v), ccFns.pct(v), "CampusCompare pct", v);
for (const v of numbers) same(FMT.fmtM(v), cfFns.fmtM(v), "Cashflows fmtM", v);

const days = [];
for (let t = Date.parse("2029-12-25T00:00:00Z"); days.length < 220; t += 3.3 * 86400e3) days.push(new Date(t).toISOString().slice(0, 10));
days.push("2031-09-15", "2031-02-28", "2032-02-29", "2030-01-01");
for (const iso of days) {
  same(FMT.mLabel(iso.slice(0, 8) + "01"), cfFns.mLabel(iso.slice(0, 8) + "01"), "mLabel", iso);
  same(FMT.fmtDayGB(iso), tlFns.fmtD(tlFns.d0(iso)), "fmtDayGB vs Timeline fmtD", iso);
  const stamp = new Date(Date.parse(iso + "T12:34:56Z")).toISOString();
  same(FMT.fmtDayReport(stamp), fmtDay(stamp), "fmtDayReport", stamp);
}
assert.equal(FMT.fmtDayGB(null), "—");
assert.equal(FMT.fmtDayGB("2031-09-15"), new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(2031, 8, 15)));

// PKT helpers: Pakistan has no daylight saving; 19:00 UTC is already the next PKT day.
assert.equal(FMT.pktDateOf(Date.parse("2031-03-09T19:00:00Z")), "2031-03-10");
assert.equal(FMT.pktDateOf(Date.parse("2031-03-09T18:59:59Z")), "2031-03-09");
assert.equal(FMT.hhmmPKT(Date.parse("2031-03-10T05:07:00Z")), "10:07");
assert.equal(FMT.fmtStampGB(Date.parse("2031-03-09T19:30:00Z")), "10 Mar 2031");
assert.equal(FMT.MONTH_NAMES.length, 12);

console.log(`format.test: ok (${checks} comparisons with the App's own formatters)`);
