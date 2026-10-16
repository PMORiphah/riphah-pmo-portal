// PMO Simulation (live data): the speech normaliser. PUBLIC, no data.
// Owner: B3a. Spec: contract §F.4.
//
// Turns a caption into what the on-device voice should read: numbers as words, acronyms spelled out
// ("P M O"), letter-number codes ("G seven"), "&" as "and", "·" and "—" as a comma pause. Campus
// names are spoken through say-campus.json (keyed by campus id only; a campus without an entry is
// spoken as its name). Word counts use the director's rule (whitespace split), so "P M O" is three
// words and "ninety-one" one.
import SAY_CAMPUS from "./say-campus.json" with { type: "json" };

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORD_ONES = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const ORD_TENS = { 20: "twentieth", 30: "thirtieth" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

/** The director's word count (src/sim/director/speech.js countWords): whitespace split. */
export const countWords = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

const say99 = (n) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");

/** 0..999 → "one hundred nine", "ninety-one". */
export function say999(n) {
  n = Math.floor(Math.abs(Number(n) || 0)) % 1000;
  return n < 100 ? say99(n) : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + say99(n % 100) : ""}`;
}

/** A whole number in words: "one thousand one hundred sixty-seven". Thousands, millions and
 *  billions; negative numbers get "minus". */
export function sayInt(n) {
  n = Math.trunc(Number(n) || 0);
  if (n < 0) return "minus " + sayInt(-n);
  if (n < 1000) return say999(n);
  const parts = [];
  for (const [v, w] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]) {
    if (n >= v) { parts.push(`${sayInt(Math.floor(n / v))} ${w}`); n %= v; }
  }
  if (n) parts.push(say999(n));
  return parts.join(" ");
}

/** "36" / "36.4" / "1,167.3" → "thirty-six" / "thirty-six point four" / "one thousand one hundred
 *  sixty-seven point three". A decimal part of zeros is not spoken ("691.0" → "six hundred ninety-one"). */
export function sayNumber(text) {
  const s = String(text).replace(/,/g, "").trim();
  const neg = s.startsWith("-") || s.startsWith("−");
  const [i, d = ""] = s.replace(/^[-−]/, "").split(".");
  const whole = (neg ? "minus " : "") + sayInt(Number(i || 0));
  return /[1-9]/.test(d) ? `${whole} point ${[...d].map((c) => ONES[Number(c)]).join(" ")}` : whole;
}

/** The millions figure of App.jsx fmtM, in words: 691453848 → "six hundred ninety-one point five million". */
export function sayMillions(n) {
  const t = (Number(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${sayNumber(t)} million`;
}

/** "36.0%" → "thirty-six percent"; "36.4%" → "thirty-six point four percent". */
export function sayPercent(text) {
  return `${sayNumber(String(text).replace(/%/g, ""))} percent`;
}

/** 1..31 → "first" … "thirty-first". */
export function sayOrdinal(d) {
  d = Math.floor(Number(d) || 0);
  if (d < 20) return ORD_ONES[d] || String(d);
  if (ORD_TENS[d]) return ORD_TENS[d];
  return `${TENS[Math.floor(d / 10)]}-${ORD_ONES[d % 10]}`;
}

/** 2027 → "twenty twenty-seven"; 2000 → "two thousand"; 2005 → "two thousand five". */
export function sayYear(y) {
  y = Math.floor(Number(y) || 0);
  if (y >= 2000 && y < 2010) return y === 2000 ? "two thousand" : `two thousand ${ONES[y - 2000]}`;
  const hi = Math.floor(y / 100), lo = y % 100;
  return lo === 0 ? `${say99(hi)} hundred` : `${say99(hi)} ${lo < 10 ? "oh " + ONES[lo] : say99(lo)}`;
}

/** "2026-12-30" → "thirtieth December"; the year is added when it differs from `year`. */
export function sayDate(iso, year) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const base = `${sayOrdinal(d)} ${MONTHS[m - 1]}`;
  return year != null && Number(year) !== y ? `${base} ${sayYear(y)}` : base;
}

/** A campus name spoken through say-campus.json (by the id of the campus row with that name). */
export function sayCampus(name, campuses, respell = SAY_CAMPUS.campuses) {
  const row = (campuses || []).find((c) => c && c.name === name);
  const said = row && respell && Object.prototype.hasOwnProperty.call(respell, row.id) ? respell[row.id] : name;
  return sayText(said);
}

const NUM_RE = /^[-−]?\d{1,3}(,\d{3})+(\.\d+)?%?$|^[-−]?\d+(\.\d+)?%?$/;

function sayToken(core) {
  if (!core) return core;
  if (core === "CAPEX") return "Capex";
  if (/^[A-Z]{2,5}$/.test(core)) return [...core].join(" ");
  let m = /^([A-Z])-(\d+)$/.exec(core);
  if (m) return `${m[1]} ${sayNumber(m[2])}`;
  if (NUM_RE.test(core)) return core.endsWith("%") ? sayPercent(core) : sayNumber(core);
  m = /^(\d+)(st|nd|rd|th)$/i.exec(core);
  if (m) return sayOrdinal(m[1]);
  return core;
}

/**
 * The spoken form of a caption. Split on whitespace; leading and trailing punctuation stays outside
 * the token. Acronyms /^[A-Z]{2,5}$/ are spelled out, /^[A-Z]-\d+$/ codes become "G seven", numbers
 * become words, " & " becomes " and ", "·" and "—" become a comma. "Capex" stays one word; quotes stay.
 */
export function sayText(text) {
  const s = String(text ?? "")
    .replace(/\s*[·—]\s*/g, ", ")
    .replace(/(^|\s)&(?=\s|$)/g, "$1and");
  return s.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    const m = /^([^A-Za-z0-9−-]*)(.*?)([^A-Za-z0-9%]*)$/.exec(tok);
    if (!m) return tok;
    let [, lead, core, trail] = m;
    // A number's minus sign belongs to it; any other leading dash is punctuation.
    if (/^[-−]/.test(core) && !/^[-−]\d/.test(core)) { lead += core[0]; core = core.slice(1); }
    return lead + sayToken(core) + trail;
  }).join("").replace(/\s+/g, " ").replace(/ ,/g, ",").replace(/,\s*,/g, ",").trim();
}
