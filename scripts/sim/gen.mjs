// PMO Simulation: synthetic dataset generator (2-minute run). Deterministic: same output every run.
//
// PMO decision 2a (14 Oct 2026): campus/site names, project managers, the PMO team and the Gallery
// media are REAL; everything else is invented. The repo is public, so real names never appear in this
// file or in anything it writes. They stand as slot tokens, filled at run time from the cast that the
// PMO's signed-in portal tab hands over (src/sim/data/tokens.js has the grammar):
//   {{C:C01}} campus   {{C:C01:say}} spoken   {{E:C01}} E-PDD spelling
//   {{P:P12}} PM name  {{P:P12:short}} short form  {{P:P12:say}} spoken short form   {{T:head_pmo}} PMO team
// Slot numbers follow the alphabetical order of the real names (localeCompare), so a sort done here on
// tokens gives the same order as the same sort on real names. At run time slots are resolved through
// the PINNED production ids in src/sim/data/pins.json, never re-derived from live counts.
// Real Gallery media are not in the seed: the seed carries a media plan (fictional host projects and
// visit dates) and the simulation attaches the handed-over items to it at launch (buildMediaRows).
//
// Rules for real people (plan §5a): every negative (delay, planned finish passed, over budget, No
// progress, high risk ownership, chases) sits only on the story project, whose PM agreed, or on projects
// without a PM; quoted replies come only from the story PM, every other message from the PMO; no real
// person is shown inactive; no critical risk; no clinical or safety-failure wording.
//
// Run:   node scripts/sim/gen.mjs [--no-assets]
// Writes src/sim/data/{seed,narration,sample-media}.json and public/sim/files/** (documents and
// sample-mode illustrations), then runs the reconciliation checks against the sample cast.
// SIM_PRIVATE=<dir> (scratch only, never in the repo) adds the checks that need the real cast:
//   <dir>/cast.local.json        real cast { campuses, pms (with realFy/realPast), team }
//   <dir>/media.local.json       { items: [{ key, project_id (real), mime, size, order }] }
//   <dir>/real-names.local.json  { names: [real project, past-project and carry-forward names] }
// SIM_SUMMARY=<file> also writes the quotable on-screen figures (public-safe) to that file.
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

if (!process.execArgv.includes("--experimental-strip-types")) {   // review.ts is imported as TypeScript
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ...process.execArgv, new URL(import.meta.url).pathname, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
const REPO = new URL("../../", import.meta.url).pathname;
const { computeFigures, periodOf } = await import(REPO + "src/reportCalc.js");
const { reviewPdd } = await import(REPO + "supabase/functions/epdd-sync/review.ts");
const { resolveTokens, buildMediaRows, tokensUsed, deriveShort, TOKEN_RE, TEAM_KEYS } = await import(REPO + "src/sim/data/tokens.js");
const DATA = REPO + "src/sim/data/";
const FILES = REPO + "public/sim/files/";
const PRIV = process.env.SIM_PRIVATE ? process.env.SIM_PRIVATE.replace(/\/?$/, "/") : null;
const SKIP_ASSETS = process.argv.includes("--no-assets");
const PINS = JSON.parse(readFileSync(DATA + "pins.json", "utf8"));
const SAMPLE_CAST = JSON.parse(readFileSync(DATA + "sample-cast.json", "utf8"));

const NOW = "2026-10-15T05:30:00Z";          // frozen clock: Thu 15 Oct 2026 10:30 PKT
const TODAY = "2026-10-15";
const SPI_T = 1, CPI_T = 1;
const FY = "FY 26-27";
let seq = 0; const uid = (p) => `${p}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const day = (s) => Math.round(new Date(String(s).slice(0, 10) + "T00:00:00Z").getTime() / 864e5);

/* ── Slot tokens ───────────────────────────────────────────────────────── */
const CT = (s) => `{{C:${s}}}`, ET = (s) => `{{E:${s}}}`, PT = (s) => `{{P:${s}}}`, PS = (s) => `{{P:${s}:short}}`, PY = (s) => `{{P:${s}:say}}`, TT = (r) => `{{T:${r}}}`;
const STORY_PM = PINS.storyPm;                // the PM the PMO chose; he agrees to the script beforehand
const STORY_CAMPUS = "C01";

/* ── Reference tables ───────────────────────────────────────────────────── */
// 12 campus slots (11 carry CAPEX; C12 carries only investment projects, as in production).
const CAMPUS_SLOTS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12"];
const CAMPUSES = CAMPUS_SLOTS.map((s) => ({ id: uid("c0000001"), name: CT(s), sort_order: 0, _slot: s }));  // production: all sort_order 0
const campusId = (s) => CAMPUSES.find(c => c._slot === s).id;
const SEGMENTS = [{ id: uid("5e900001"), name: "University", sort_order: 1 }, { id: uid("5e900001"), name: "Trust", sort_order: 2 }]; // organisations
const SECTORS = ["Academic", "Healthcare", "Management", "Investment"].map((name, i) => ({ id: uid("5ec00001"), name, sort_order: i + 1 }));
const REGIONS = ["North Region", "Central Region", "South Region"].map((name, i) => ({ id: uid("4e900001"), name, sort_order: i + 1 }));
const regionOf = (slot) => slot === "C08" ? "North Region" : slot === "C07" ? "South Region" : "Central Region";
// Cost centres are departments, never campuses or people.
const CC = [
  ["Facilities Management", "9101000"], ["IT Services", "9102000"], ["Library Services", "9103000"],
  ["Pharmacy and Allied Health", "9104000"], ["Faculty of Engineering", "9105000"], ["Faculty of Sciences", "9106000"],
  ["Student Affairs", "9107000"], ["Medical College", "9201000"], ["Dental College", "9202000"],
  ["Teaching Hospitals", "9301000"], ["Central Administration", "9001000"], ["Investments Office", "9002000"],
].map(([n, c], i) => ({ id: uid("cc000001"), code: c, name: `${n} (Code:${c})`, sort_order: i + 1 }));
const cc = (code) => CC.find(x => x.code === code);
const sec = (n) => SECTORS.find(s => s.name === n).id;
const seg = (n) => SEGMENTS.find(s => s.name === n).id;
const reg = (n) => REGIONS.find(s => s.name === n).id;

/* ── People ─────────────────────────────────────────────────────────────── */
// Real people appear only as slot tokens in name columns. Their accounts are invented: username sim.*,
// email on simulation.example, no phone, always active, no sessions, devices, tour or notification rows.
const U = (username, full_name, role, extra = {}) => ({ id: uid("a5e70001"), username, full_name, role, email: `${username}@simulation.example`,
  phone: null, is_active: true, notify_email: true, whatsapp_opt_in: false, created_at: "2026-07-01T04:00:00Z",
  tutorial_offered_at: null, tutorial_last_step: null, tutorial_completed_at: null, tutorial_dismissed_at: null, ...extra });
const PMO = U("pmo.sim", "Project Management Office", "pmo");
// PM slots: each manager's home campus is where he really works. P13 is the guest who manages projects
// (he stays a guest, as in production).
const PM_HOME = { P01: "C04", P02: "C09", P03: "C03", P04: "C11", P05: "C10", P06: "C02", P07: "C12", P08: "C06", P09: "C12", P10: "C03", P11: "C08", P12: "C01", P13: "C07" };
const GUEST_PM = "P13";
const PM = Object.fromEntries(Object.keys(PM_HOME).map((s, i) => [s, U(`sim.pm${String(i + 1).padStart(2, "0")}`, PT(s), s === GUEST_PM ? "guest" : "project_manager", { _slot: s })]));
// The one inactive account is a retired shared login, not a person, with no assignments.
const FORMER = U("sim.retired01", "Training Account (retired)", "project_manager", { is_active: false });
// PMO team members who have a guest account in production appear under their team name. A team member
// who is also a PM slot (same production user) appears once, as that PM.
const pmSlotOfUser = Object.fromEntries(Object.entries(PINS.pms).map(([s, id]) => [id, s]));
const TEAM_USERS = TEAM_KEYS.filter(k => PINS.teamAccounts[k] && !pmSlotOfUser[PINS.teamAccounts[k]])
  .map(k => U(`sim.team${String(TEAM_KEYS.indexOf(k) + 1).padStart(2, "0")}`, TT(k), "guest", { _team: k }));
// Other senior-management guests are neutral placeholders (also the Board report recipients).
const VIEWERS = [1, 2, 3].map(n => U(`sim.viewer${String(n).padStart(2, "0")}`, `Senior management viewer ${n}`, "guest"));
const USERS = [PMO, ...Object.values(PM), FORMER, ...TEAM_USERS, ...VIEWERS];
const isRealSlotUser = (u) => !!(u._slot || u._team);

/* ── Projects ───────────────────────────────────────────────────────────── */
// add(key, name, campus slot, stage, df, pm slot, cc, sector, org, priority, strategic, start, end, plan type, extra)
// No fictional name contains a campus or person name, and none is >= 60% like a real project name.
const P = [];
const add = (key, name, campus, stage, df, pm, ccode, sector, org, priority, strat, start, end, plan, x = {}) =>
  P.push({ key, name, campus, stage, df, pm, ccode, sector, org, priority, strat, start, end, plan, ...x });
const TL = "Teaching & Learning Excellence", HQ = "Healthcare Quality", OE = "Operational Excellence", FS = "Financial Sustainability";
const CW = "Civil Works", EQ = "Equipment Procurement", SW = "Software / Licensing";
// pdd_not_submitted (19)
add("N1", "Pathology Museum Display Cases", "C01", "pdd_not_submitted", 3600000, "P12", "9201000", "Healthcare", "Trust", "second_priority", TL, "2026-11-15", "2027-02-28", EQ);
add("N2", "Biostatistics Computer Room", "C01", "pdd_not_submitted", 6425000, "P12", "9201000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-01", "2027-03-31", EQ);
add("N3", "Hospital Laundry Machines", "C09", "pdd_not_submitted", 9880000, "P02", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-01", "2027-04-30", EQ);
add("N5", "Laundry Room Fit-out", "C05", "pdd_not_submitted", 2150000, null, "9107000", "Management", "University", "second_priority", OE, "2026-12-01", "2027-02-28", EQ);
add("N6", "Reading Hall Furniture", "C01", "pdd_not_submitted", 1860000, "P12", "9103000", "Management", "University", "third_priority", OE, "2027-01-01", "2027-03-31", EQ);
add("N7", "Main Gate and Guard Room Rebuild", "C04", "pdd_not_submitted", 7300000, "P01", "9101000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-03-31", CW);
add("N8", "Kitchen Exhaust and Hood Upgrade", "C04", "pdd_not_submitted", 4475000, "P01", "9107000", "Management", "University", "third_priority", OE, "2027-01-15", "2027-05-31", CW);
add("N9", "Lecture Room Projectors Refresh", "C06", "pdd_not_submitted", 6960000, "P08", "9105000", "Academic", "University", "top_priority", TL, "2026-12-01", "2027-03-31", EQ);
add("N10", "Bicycle and Motorbike Stands", "C06", "pdd_not_submitted", 3280000, "P08", "9101000", "Management", "University", "third_priority", OE, "2027-02-01", "2027-05-31", CW);
add("N11", "Pharmaceutics Lab Tablet Press", "C04", "pdd_not_submitted", 5615000, "P01", "9104000", "Academic", "University", "top_priority", TL, "2026-12-01", "2027-04-30", EQ);
add("N12", "Lab Chemical Store Ventilation", "C01", "pdd_not_submitted", 2940000, "P12", "9201000", "Academic", "University", "second_priority", OE, "2027-01-01", "2027-03-31", CW);
add("N13", "Network UPS Battery Refresh", "C06", "pdd_not_submitted", 12600000, "P08", "9102000", "Management", "University", "top_priority", OE, "2026-12-01", "2027-04-30", EQ);
add("N14", "Campus Wi-Fi Coverage Extension", "C03", "pdd_not_submitted", 4820000, "P10", "9102000", "Management", "University", "second_priority", OE, "2027-01-01", "2027-04-30", EQ);
add("N15", "Convocation Hall Seating", "C03", "pdd_not_submitted", 10450000, "P10", "9101000", "Academic", "University", "second_priority", TL, "2027-01-15", "2027-05-31", CW);
add("N16", "Campus Signage and Wayfinding", "C01", "pdd_not_submitted", 2375000, "P12", "9101000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-01-31", CW);
add("N17", "Records Archive Room", "C02", "pdd_not_submitted", 1940000, "P06", "9001000", "Management", "Trust", "third_priority", OE, "2027-02-01", "2027-04-30", CW);
add("N18", "Fire Alarm System Upgrade", "C06", "pdd_not_submitted", 6180000, null, "9101000", "Management", "University", "top_priority", OE, "2026-12-15", "2027-04-30", EQ);
add("N19", "Air Handling Units for Lecture Halls", "C01", "pdd_not_submitted", 8900000, "P12", "9201000", "Healthcare", "Trust", "second_priority", TL, "2027-01-01", "2027-05-31", EQ);
add("N20", "Student Counselling Centre Fit-out", "C06", "pdd_not_submitted", 3150000, null, "9107000", "Academic", "University", "second_priority", TL, "2027-01-15", "2027-04-30", CW);
// identified = "PDD submitted" (2)
add("S1", "Digital Library Licences", "C06", "identified", 4600000, "P08", "9103000", "Academic", "University", "second_priority", TL, "2026-12-01", "2027-06-30", SW);
add("S2", "Dental Teaching Chairs", "C03", "identified", 7850000, "P10", "9202000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-15", "2027-04-30", EQ);
// df_review (4)
add("D1", "Sports Ground Floodlights", "C06", "df_review", 8750000, "P08", "9107000", "Academic", "University", "second_priority", OE, "2026-12-01", "2027-03-31", EQ);
add("D2", "Hospital Generator Overhaul", "C10", "df_review", 11200000, "P05", "9301000", "Healthcare", "Trust", "top_priority", OE, "2026-11-15", "2027-02-28", EQ);
add("D3", "Faculty Office Partitions", "C01", "df_review", 2690000, "P12", "9101000", "Academic", "University", "third_priority", OE, "2026-12-01", "2027-02-28", CW);
add("D4", "Meeting Rooms Video Conferencing", "C02", "df_review", 1725000, null, "9001000", "Management", "Trust", "third_priority", OE, "2026-12-01", "2027-01-31", EQ);
// ed_review (2); E1 went through ED and MT and was approved on 29 Sep
add("E1", "Rainwater Drainage Upgrade", "C06", "approved", 5960000, "P08", "9101000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-01-31", CW,
  { bac: 5960000, released: 0, release: null, pct: 0, paid: 0 });
add("E2", "ERP Reporting Server", "C03", "ed_review", 9340000, "P10", "9102000", "Management", "University", "second_priority", OE, "2026-12-01", "2027-03-31", EQ);
add("E3", "Student Lockers", "C01", "ed_review", 1580000, "P12", "9201000", "Healthcare", "Trust", "third_priority", OE, "2026-12-01", "2027-01-31", EQ);
// mt_review (5)
add("M1", "Dental Hospital Pharmacy Automation", "C03", "mt_review", 18500000, "P10", "9202000", "Healthcare", "Trust", "top_priority", HQ, "2026-10-06", "2027-04-30", EQ,
  { released: 3500000, release: "2026-10-06", paid: 0 });
add("M2", "Biochemistry Practical Hall Fit-out", "C01", "mt_review", 7240000, "P12", "9201000", "Academic", "University", "second_priority", TL, "2026-11-15", "2027-03-31", CW);
add("M3", "Hot Water Heat Pumps", "C01", "mt_review", 3875000, "P12", "9101000", "Management", "University", "third_priority", FS, "2026-11-15", "2027-02-28", EQ);
add("M4", "Staff Fitness Room Equipment", "C02", "mt_review", 4310000, null, "9001000", "Management", "University", "third_priority", OE, "2026-12-01", "2027-02-28", EQ);
add("M5", "Hospital Admin Block Refurbishment", "C11", "mt_review", 24600000, "P04", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-11-01", "2027-06-30", CW);
// approved (16 incl. E1)
// The story project: re-themed so it resembles no real project at its campus; it carries no real media.
add("A1", "Postgraduate Study Hub Refit", "C01", "approved", 58000000, "P12", "9103000", "Academic", "University", "top_priority", TL, "2026-08-01", "2026-12-29", CW,
  { bac: 58000000, released: 18340000, release: "2026-08-01", pct: 38, paid: 16500000, story: true });
// Media hosts are named "Campus Works Package <letter>", so no host echoes the real project behind its photos.
add("A2", "Campus Works Package C", "C07", "approved", 31750000, "P13", "9101000", "Academic", "University", "top_priority", TL, "2026-07-20", "2027-01-31", CW,
  { bac: 31750000, released: 13500000, release: "2026-07-20", pct: 45, paid: 12800000 });
add("A3", "Campus Network Core Switch Refresh", "C03", "approved", 18900000, "P10", "9102000", "Management", "University", "top_priority", OE, "2026-07-28", "2026-11-30", EQ,
  { bac: 18900000, released: 12800000, release: "2026-07-28", pct: 68, paid: 12800000, scope_change: true });
add("A4", "Dental Imaging Upgrade (PMDC)", "C03", "approved", 28000000, "P10", "9202000", "Healthcare", "Trust", "top_priority", HQ, "2026-08-18", "2027-02-28", EQ,
  { bac: 27300000, released: 8500000, release: "2026-08-18", pct: 32, paid: 5000000, pmdc: true });
add("A5", "Campus Works Package D", "C07", "approved", 22480000, "P13", "9101000", "Management", "University", "second_priority", OE, "2026-09-01", "2027-03-31", CW,
  { bac: 22480000, released: 4500000, release: "2026-09-01", pct: 21, paid: 4500000 });
add("A6", "Campus Works Package E", "C08", "approved", 9860000, "P11", "9101000", "Academic", "University", "top_priority", TL, "2026-07-15", "2026-10-31", CW,
  { bac: 9860000, released: 7888000, release: "2026-07-15", pct: 86, paid: 7500000 });
add("A7", "Examination Hall Furniture", "C06", "approved", 6240000, "P08", "9106000", "Academic", "University", "second_priority", TL, "2026-08-10", "2026-10-31", EQ,
  { bac: 6240000, released: 5400000, release: "2026-08-10", pct: 87, paid: 5400000 });
add("A8", "Histology Teaching Microscopes (PMDC)", "C01", "approved", 14350000, "P12", "9201000", "Healthcare", "Trust", "top_priority", HQ, "2026-08-25", "2027-01-15", EQ,
  { bac: 14350000, released: 4900000, release: "2026-08-25", pct: 36, paid: 4900000, pmdc: true });
add("A9", "Campus Works Package B", "C01", "approved", 4980000, "P12", "9101000", "Management", "University", "second_priority", OE, "2026-09-10", "2026-12-10", CW,
  { bac: 4980000, released: 2000000, release: "2026-09-10", pct: 41, paid: 1800000, type: "Non Budgeted" });
add("A10", "Engineering Workshop Machines", "C06", "approved", 11600000, "P08", "9105000", "Academic", "University", "top_priority", TL, "2026-10-09", "2027-02-28", EQ,
  { bac: 11600000, released: 500000, release: "2026-10-09", pct: 5, paid: 0 });
add("A11", "Perimeter Lighting Upgrade", "C03", "approved", 7420000, "P10", "9101000", "Management", "University", "second_priority", OE, "2026-08-05", "2026-12-31", EQ,
  { bac: 7420000, released: 3300000, release: "2026-08-05", pct: 49, paid: 3300000 });
add("A12", "Lecture Theatre AV Upgrade", "C04", "approved", 12800000, "P01", "9104000", "Academic", "University", "second_priority", TL, "2026-11-01", "2027-04-30", EQ,
  { bac: 12800000, released: 0, release: null, pct: 0, paid: 0 });
add("A13", "Auditorium Stage Lighting Replacement", "C04", "approved", 5240000, "P01", "9104000", "Academic", "University", "top_priority", OE, "2026-07-22", "2026-10-31", EQ,
  { bac: 5100000, released: 3600000, release: "2026-07-22", pct: 88, paid: 3600000 });
add("A14", "Campus Works Package A", "C01", "approved", 8600000, "P12", "9101000", "Management", "University", "second_priority", OE, "2026-08-12", "2027-01-31", CW,
  { bac: 8600000, released: 2000000, release: "2026-08-12", pct: 38, paid: 1800000 });
// The one negative project outside the story: no PM (as production has at this campus), finish passed.
add("X1", "Residence Water Heater Replacement", "C05", "approved", 12000000, null, "9107000", "Management", "University", "second_priority", OE, "2026-07-15", "2026-10-05", EQ,
  { bac: 12000000, released: 8000000, release: "2026-07-15", pct: 68, paid: 7500000 });
// closed (2): final vendor payment awaiting transfer (payments_pending, paid 0, released == bac)
add("C1", "Faculty Lounge Furniture", "C04", "closed", 3150000, "P01", "9104000", "Academic", "University", "third_priority", OE, "2026-07-10", "2026-09-15", EQ,
  { bac: 3150000, released: 3150000, release: "2026-07-10", pct: 100, paid: 0, pending: true, actual_end: "2026-09-18", pcd: "2026-09-25" });
add("C2", "Campus Works Package F", "C03", "closed", 1180000, "P03", "9001000", "Management", "Trust", "third_priority", OE, "2026-07-05", "2026-08-20", EQ,
  { bac: 1180000, released: 1180000, release: "2026-07-05", pct: 100, paid: 0, pending: true, actual_end: "2026-08-24", pcd: "2026-08-28", type: "Non Budgeted" });
// investment (3), all on the investment-only campus — never CAPEX
add("I1", "Campus Works Package G", "C12", "approved", 95000000, "P07", "9002000", "Investment", "Trust", "top_priority", FS, "2026-07-01", "2027-05-31", CW,
  { bac: 95000000, released: 27000000, release: "2026-07-01", pct: 32, paid: 27000000, portfolio: "investment", su: 110000000 });
add("I2", "Endowment Property Units", "C12", "approved", 12500000, "P09", "9002000", "Investment", "Trust", "second_priority", FS, "2026-08-01", "2027-06-30", CW,
  { bac: 12500000, released: 2700000, release: "2026-08-01", pct: 23, paid: 2700000, portfolio: "investment", su: 15000000 });
add("I3", "Faculty Housing Rental Block", "C12", "ed_review", 40000000, null, "9002000", "Investment", "Trust", "second_priority", FS, "2027-01-01", "2027-06-30", CW,
  { portfolio: "investment", su: 48000000 });

const SU_EXTRA = { N1: 4100000, A1: 61800000, A2: 36500000, M5: 31000000, N13: 15800000 };
const months = (a, b) => Math.round((new Date(b) - new Date(a)) / (864e5 * 30.4375));
const prefix = (o) => (o === "Trust" ? "ET" : "EU");
const codeN = {};
const projects = P.map((p) => {
  const c = cc(p.ccode); const n = (codeN[c.code] = (codeN[c.code] || 0) + 1);
  const rel = p.released ?? 0;
  const appr = ["approved", "closed"].includes(p.stage);
  return {
    id: uid("b0000001"), code: `${prefix(p.org)}.27${c.code.slice(1, 5)}-${String(n).padStart(2, "0")}`, name: p.name,
    sector_id: sec(p.sector), region_id: reg(regionOf(p.campus)),
    segment_id: seg(p.org), cost_center_id: c.id, project_type: p.type || "Budgeted", priority: p.priority,
    workflow_stage: p.stage, su_requested_amount: p.su ?? SU_EXTRA[p.key] ?? Math.round(p.df * 1.25 / 5000) * 5000,
    df_recommended_amount: p.df, bac: p.bac ?? 0, amount_released: rel, payments_made: p.paid ?? 0,
    is_carry_forward: false, payments_pending: !!p.pending, start_date: p.start, end_date: p.end,
    duration_months: months(p.start, p.end), pct_complete: p.pct ?? 0, manual_schedule_flag: null, manual_budget_flag: null,
    notes: null, created_at: "2026-07-03T06:00:00Z", updated_at: "2026-10-01T06:00:00Z", fiscal_year: FY,
    strategic_priority: p.strat, actual_start_date: p.release || null, actual_end_date: p.actual_end || null,
    budget_release_date: p.release || null, scope_change: !!p.scope_change, campus: CT(p.campus), campus_id: campusId(p.campus),
    portfolio: p.portfolio || "capex", actual_cost: appr ? rel : 0, pcd_received_date: p.pcd || null,
    _key: p.key, _pm: p.pm, _pmdc: !!p.pmdc, _plan: p.plan, _slot: p.campus,
  };
});
const byKey = (k) => projects.find(p => p._key === k);
const strip = ({ _key, _pm, _pmdc, _plan, _slot, ...q }) => q;
const story = byKey("A1");

/* ── Views (replicas of the SQL definitions read 13–14 Oct 2026) ───────── */
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
function metrics(p, today = TODAY) {           // project_metrics
  const eff = p.actual_start_date || p.start_date;
  let el = null;
  if (eff && p.end_date && day(p.end_date) > day(eff)) {
    el = day(today) <= day(eff) ? 0 : day(today) >= day(p.end_date) ? 1 : (day(today) - day(eff)) / (day(p.end_date) - day(eff));
  }
  const ev = p.bac * p.pct_complete / 100;
  const appr = ["approved", "closed"].includes(p.workflow_stage);
  const schedule_flag = p.manual_schedule_flag ?? (!appr || p.amount_released == 0 || el == null ? "not_started" : ev >= p.bac * el * SPI_T ? "on_time" : "delayed");
  const budget_flag = p.manual_budget_flag ?? (!appr || p.actual_cost == 0 || p.pct_complete == 0 ? "not_started" : ev >= p.actual_cost * CPI_T ? "within" : "over");
  return { ...p, effective_start: eff, earned_value: r(ev, 2), time_elapsed_fraction: r(el ?? 0, 4), planned_value: r(p.bac * (el ?? 0), 2),
    cpi: p.actual_cost > 0 ? r(ev / p.actual_cost, 3) : null, spi: p.bac * (el ?? 0) > 0 ? r(ev / (p.bac * el), 3) : null,
    eac: p.actual_cost > 0 && ev > 0 ? r(p.bac / (ev / p.actual_cost), 2) : null,
    cost_variance: p.actual_cost > 0 ? r(ev - p.actual_cost, 2) : null, schedule_variance: r(ev - p.bac * (el ?? 0), 2),
    schedule_flag, budget_flag };
}
function dashboard(rows, today = TODAY) {      // portfolio_metrics + portfolio_dashboard
  const m = rows.filter(p => p.portfolio === "capex").map(p => metrics(p, today));
  const S = (f, w = () => true) => m.filter(w).reduce((s, p) => s + Number(f(p) || 0), 0);
  const C = (w) => m.filter(w).length;
  const rep = (p) => p.pct_complete > 0, ncf = (p) => !p.is_carry_forward;
  const ev = S(p => p.earned_value), pv = S(p => p.planned_value, rep), ac = S(p => p.actual_cost, rep);
  const cpi = ac > 0 ? r(ev / ac, 3) : null, spi = pv > 0 ? r(ev / pv, 3) : null;
  return {
    total_projects: m.length, pdd_not_submitted_count: C(p => p.workflow_stage === "pdd_not_submitted" && ncf(p)),
    identified_count: C(p => p.workflow_stage === "identified" && ncf(p)), pdds_submitted: C(p => p.workflow_stage === "identified" && ncf(p)),
    in_df: C(p => p.workflow_stage === "df_review" && ncf(p)), in_ed: C(p => p.workflow_stage === "ed_review" && ncf(p)), in_mt: C(p => p.workflow_stage === "mt_review" && ncf(p)),
    approved_count: C(p => p.workflow_stage === "approved" && ncf(p)), closed_count: C(p => p.workflow_stage === "closed"),
    on_time_count: C(p => p.schedule_flag === "on_time" && p.workflow_stage === "approved"), delayed_count: C(p => p.schedule_flag === "delayed" && p.workflow_stage === "approved"),
    over_budget_count: C(p => p.budget_flag === "over" && p.workflow_stage === "approved"), scope_change_count: C(p => p.scope_change),
    carry_forward_count: C(p => p.is_carry_forward), carry_forward_amount: S(p => p.bac, p => p.is_carry_forward),
    payments_pending_count: C(p => p.payments_pending), payments_pending_amount: S(p => p.bac, p => p.payments_pending),
    su_requested_total: S(p => p.su_requested_amount, ncf), df_recommended_total: S(p => p.df_recommended_amount, ncf), approved_total: S(p => p.bac, ncf),
    budget_reduction: S(p => p.su_requested_amount, ncf) - S(p => p.df_recommended_amount, ncf),
    total_capex: S(p => p.df_recommended_amount), budget_consumed: S(p => p.amount_released), budget_remaining: S(p => p.df_recommended_amount) - S(p => p.amount_released),
    payments_made_total: S(p => p.payments_made),
    total_ev: r(ev, 2), total_pv: r(pv, 2), total_ac: ac, portfolio_cpi: cpi, portfolio_spi: spi,
    portfolio_health: cpi == null || spi == null ? "Insufficient Data" : cpi >= CPI_T && spi >= SPI_T ? "Good" : cpi < CPI_T - 0.05 && spi < SPI_T - 0.05 ? "Critical" : "At Risk",
    reporting_progress_count: C(rep),
  };
}
function investmentMetrics(rows) {
  const m = rows.filter(p => p.portfolio === "investment");
  const S = (f) => m.reduce((s, p) => s + Number(p[f] || 0), 0);
  return { total_projects: m.length, su_requested_total: S("su_requested_amount"), df_recommended_total: S("df_recommended_amount"), approved_total: S("bac"),
    released_total: S("amount_released"), payments_made_total: S("payments_made"), approved_count: m.filter(p => p.workflow_stage === "approved").length };
}
const healthOf = (cpi, spi) => { const has = v => v != null && isFinite(v) && v > 0; if (!has(cpi) && !has(spi)) return "Insufficient Data";
  const w = Math.min(has(cpi) ? cpi : 9, has(spi) ? spi : 9); return w >= 0.95 ? "Healthy" : w >= 0.90 ? "Attention Required" : w >= 0.80 ? "At Risk" : "Critical"; };
const perfStatus = (v) => v == null || !isFinite(v) || v <= 0 ? "No data" : v >= 0.95 ? "Healthy" : v >= 0.90 ? "Watch" : "At Risk";

/* ── Assignments (site-wise managers), RACI ─────────────────────────────── */
const project_assignments = projects.filter(p => p._pm).map(p => ({ id: uid("a5510001"), user_id: PM[p._pm].id, project_id: p.id, assigned_by: PMO.id, assigned_at: "2026-07-03T06:30:00Z" }));
const project_raci = projects.filter(p => p._pm).flatMap(p => [
  { id: uid("ac100001"), project_id: p.id, raci_role: "responsible", user_id: PM[p._pm].id, person_name: PM[p._pm].full_name, person_title: "Project Manager", sort_order: 0 },
  { id: uid("ac100001"), project_id: p.id, raci_role: "informed", user_id: PMO.id, person_name: "Project Management Office", person_title: "PMO", sort_order: 0 }]);
// Risk owners (plan §5a rule 1, review 15 Oct 2026): risk ownership sits only on the story project,
// with its PM; every other risk is owned by the PMO, so no other real manager is named against a risk.
const ownerOf = (p) => p.id === story.id ? PM[STORY_PM].full_name : "Project Management Office";
// The projects that host the real Gallery media (MEDIA_HOSTS below). A host carries no delay, risk or
// quote (plan §5a), so a real photo is never shown behind a fictional negative.
const MEDIA_HOST_KEYS = ["A14", "A9", "A2", "A5", "A6", "C2", "I1"];

/* ── Risks: one per project, no critical; high only on the story or on projects without a PM ── */
// Every risk names an outside cause (vendor, shipping, weather, approvals, site limits), never a fault.
// [key, title, category, probability, impact, mitigation, identified, status, tag]; owner = the project's PM,
// or the PMO where the project has none.
const RISKS = [
  ["A1", "Study pod shipment from the overseas vendor may slip", "vendor", "high", "medium", "Weekly call with the vendor; customs agent appointed; installation planned around the new date.", "2026-08-20", "open", "story"],
  ["X1", "Heater supplier has not delivered the last panels", "vendor", "high", "medium", "Supplier's revised date confirmed in writing; a project manager is being assigned.", "2026-09-30", "open"],
  ["M4", "Import licence for the fitness equipment may take longer", "regulatory", "medium", "high", "Licence papers filed early; a local supplier quoted as a fallback.", "2026-09-17", "open"],
  ["D2", "Generator overhaul parts have long lead times", "technical", "medium", "medium", "Parts list shared with two suppliers before approval.", "2026-09-28", "open"],
  ["A7", "Last furniture batch must arrive before the exam week", "vendor", "medium", "low", "Delivery slot booked; delivered furniture already in use.", "2026-09-30", "monitoring"],
  ["A13", "Event schedule leaves few windows to fit the lights", "schedule", "medium", "low", "Night installation agreed with the events office, one lighting bar at a time.", "2026-08-12", "monitoring"],
  ["N13", "Current UPS batteries are near end of life", "technical", "medium", "medium", "Battery health checked monthly until replacement.", "2026-07-24", "monitoring"],
  ["A4", "Imaging software integration needs vendor engineers on site", "technical", "medium", "medium", "Integration test booked before installation.", "2026-08-26", "open"],
  ["M1", "Pharmacy automation needs a dedicated power line", "technical", "low", "high", "Electrical survey requested from facilities.", "2026-10-07", "open"],
  ["A3", "Added access switches may need a further budget request", "financial", "medium", "low", "Scope change costed; savings sought in the installation line first.", "2026-09-16", "open"],
  ["E1", "Rain could delay the drainage works", "schedule", "high", "low", "Start the works after the monsoon; temporary pumps on standby.", "2026-08-04", "monitoring"],
  ["N7", "Road widening plan may affect the gate position", "regulatory", "high", "low", "Survey by the development authority before the PDD is submitted.", "2026-09-09", "open"],
  ["A2", "Finish samples need the department's approval", "resource", "low", "medium", "Samples sent to the faculty committee.", "2026-08-03", "monitoring"],
  ["A5", "Roof slab needs a structural check before the chillers go up", "technical", "low", "medium", "Structural engineer visit scheduled.", "2026-09-05", "open"],
  ["A8", "Old microscopes must be removed without stopping practical classes", "schedule", "medium", "medium", "Replace one bench row at a time.", "2026-08-28", "monitoring"],
  ["A10", "Machine certification by the vendor may take longer", "technical", "medium", "medium", "Vendor's engineer booked for the first week of use.", "2026-10-12", "open"],
  ["A6", "Classes in session limit the hours contractors can work", "schedule", "low", "medium", "Night and weekend shifts agreed with the campus office.", "2026-07-18", "monitoring"],
  ["A11", "Cable route crosses the main access road", "regulatory", "low", "high", "Road-cutting permission requested before trenching.", "2026-08-11", "open"],
  ["N3", "Steam supply may not support the new machines", "technical", "low", "high", "Boiler capacity check requested.", "2026-09-21", "open"],
  ["A12", "AV system may not fit the existing ceiling grid", "technical", "medium", "low", "Site survey with the vendor before order.", "2026-10-09", "open"],
  ["D1", "Light spill may draw complaints from neighbours", "regulatory", "medium", "low", "Shielded fittings specified in the PDD.", "2026-09-24", "open"],
  ["A9", "Works must fit around the exam calendar", "schedule", "low", "medium", "Phased works around the exam calendar.", "2026-09-11", "monitoring"],
  ["S2", "Equipment room ventilation sign-off may take longer than planned", "regulatory", "low", "medium", "Ventilation plan sent early to the inspector.", "2026-10-02", "open"],
  ["M2", "Specimen storage must move during the fit-out", "resource", "low", "low", "Temporary store arranged in the old lab.", "2026-09-26", "open"],
  ["E3", "Locker sizes may not suit lab coats and bags", "resource", "low", "low", "Sample locker trial with students.", "2026-10-05", "monitoring"],
  ["A14", "Works must keep the main entrance open", "schedule", "low", "low", "Works phased by floor; entrance kept clear.", "2026-08-14", "monitoring"],
  ["D4", "Room bookings limit installation days", "schedule", "low", "low", "Installation planned for the term break.", "2026-09-29", "open"],
];
const sevOf = (pr, im) => pr === "high" && im === "high" ? "critical" : (pr === "high" && im === "medium") || (pr === "medium" && im === "high") ? "high" : pr === "low" && im === "low" ? "low" : "medium";
const addDays = (d, n) => new Date(day(d) * 864e5 + n * 864e5).toISOString().slice(0, 10);
// Every row is built (so the ids that follow stay as they were) and the hosts' rows are then left out.
const project_risks = RISKS.map(([k, title, category, probability, impact, mitigation_plan, identified, status, tag]) => {
  const rev = [addDays(identified, 14), "2026-10-13"].sort()[0];
  const p = byKey(k);
  return { id: uid("e1500001"), project_id: p.id, title, description: null, category, probability, impact, status, owner: ownerOf(p), mitigation_plan,
    date_identified: identified, date_last_reviewed: tag === "story" ? "2026-10-08" : rev, created_by: PMO.id, created_by_name: PMO.username,
    created_at: `${identified}T07:00:00Z`, updated_at: `${tag === "story" ? "2026-10-08" : rev}T07:00:00Z`, _story: tag === "story" };
}).filter(x => !MEDIA_HOST_KEYS.some(k => byKey(k).id === x.project_id));
const scored = (risks) => risks.map(x => { const p = projects.find(q => q.id === x.project_id);
  const { _story, ...y } = x; return { ...y, project_name: p.name, project_code: p.code, project_campus: p.campus, severity: sevOf(x.probability, x.impact) }; });
const storyRisk = project_risks.find(x => x._story);

/* ── E-PDD PDDs ─────────────────────────────────────────────────────────── */
// [description, qty, unit, unit cost]. Hosts' lines are generic works, so no host echoes a real theme.
const pddItems = {
  A1: [["Modular study pods (imported)", 6, "No", 2450000], ["Group study tables and chairs", 12, "Set", 285000], ["Book stacks and display shelving", 1, "Lot", 4850000],
       ["Self-service lending stations", 4, "No", 1175000], ["AV presentation and screen system", 1, "Set", 6950000], ["Lighting, power and data works", 1, "Job", 5600000],
       ["Acoustic ceilings and flooring", 1, "Lot", 6880000], ["Lockers and storage", 1, "Lot", 3100000]],
  A2: [["Furniture sets", 6, "Lot", 640000], ["Backup power sets", 2, "No", 2350000], ["Civil and structural works", 1, "Job", 13800000], ["Electrical and data works", 1, "Job", 4900000], ["Doors, windows and finishes", 1, "Lot", 4510000]],
  A3: [["Core switches", 2, "No", 5600000], ["Distribution switches", 10, "No", 640000], ["Installation and cut-over", 1, "Job", 1250000]],
  A4: [["Digital intraoral sensors", 12, "No", 1450000], ["Panoramic imaging unit", 1, "Set", 3850000], ["Imaging network integration", 1, "Job", 2600000], ["Installation and staff training", 1, "Job", 1950000]],
  A5: [["LED lighting panels", 300, "No", 42000], ["Rooftop chiller units", 2, "No", 2850000], ["Roof waterproofing", 1, "Lot", 2330000], ["Electrical rewiring", 1, "Job", 1850000]],
  A6: [["Partitions and ceilings", 1, "Lot", 3150000], ["Floor and wall tiling", 1, "Job", 2480000], ["Plumbing and drainage works", 1, "Job", 2650000], ["Ceiling fans", 12, "No", 130000]],
  A7: [["Examination desks", 240, "No", 17500], ["Examination chairs", 240, "No", 6500], ["Invigilation podiums", 4, "No", 85000], ["Delivery and assembly", 1, "Job", 120000]],
  A8: [["Teaching microscopes with camera", 40, "No", 260000], ["Multi-head demonstration microscope", 1, "Set", 1650000], ["Image capture software", 1, "Job", 780000], ["Lab stools", 16, "No", 18000]],
  A9: [["Fixtures and fittings", 1, "Lot", 2350000], ["Doors and windows", 8, "No", 160000], ["Flooring and lighting", 1, "Job", 1350000]],
  D1: [["LED floodlight fixtures 1000 W", 24, "No", 160000], ["Steel lighting masts", 6, "No", 470000], ["Cabling and control panel", 1, "Job", 1310000], ["Installation", 1, "Job", 780000]],
  N3: [["Industrial washer-extractors", 3, "No", 1650000], ["Tumble dryers", 3, "No", 950000], ["Flatwork ironer", 1, "No", 1520000], ["Installation", 1, "Job", 560000]],
};
const DELIV_KEYS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "D1"];
const items = (k) => pddItems[k].map(([description, qty, unit, unit_cost]) => ({ description, qty, unit, unit_cost, total: qty * unit_cost }));
const sumItems = (k) => items(k).reduce((s, i) => s + i.total, 0);
const HIST = [  // id, number, key, status, received, decided
  [102, "PDD-2027-002", "A6", "All Approved", "2026-07-03T05:30:00Z", "09 Jul 2026 10:40 AM"],
  [103, "PDD-2027-003", "A7", "All Approved", "2026-07-06T06:15:00Z", "13 Jul 2026 12:05 PM"],
  [104, "PDD-2027-004", "A1", "All Approved", "2026-07-08T06:20:00Z", "16 Jul 2026 11:05 AM"],
  [107, "PDD-2027-007", "A2", "All Approved", "2026-07-06T09:10:00Z", "14 Jul 2026 03:40 PM"],
  [109, "PDD-2027-009", "A3", "All Approved", "2026-07-09T05:00:00Z", "17 Jul 2026 10:15 AM"],
  [110, "PDD-2027-010", "A4", "All Approved", "2026-07-21T07:40:00Z", "05 Aug 2026 12:20 PM"],
  [112, "PDD-2027-012", "A8", "All Approved", "2026-08-03T07:30:00Z", "12 Aug 2026 12:30 PM"],
  [115, "PDD-2027-015", "A5", "All Approved", "2026-08-10T04:45:00Z", "21 Aug 2026 02:10 PM"],
  [118, "PDD-2027-018", "A9", "All Approved", "2026-08-20T08:00:00Z", "28 Aug 2026 09:50 AM"],
  [121, "PDD-2027-021", "D1", "PMO Approved", "2026-09-20T06:00:00Z", "09 Oct 2026 11:30 AM"],
  [119, "PDD-2027-019", "N3", "Not Approved", "2026-09-02T05:30:00Z", "11 Sep 2026 04:20 PM"],
];
// No PDD is attributed to a real person: the initiator is "Campus office (sample)" and the approval
// history carries role labels only.
const pddRow = (id, num, p, status, received, decided, extra = {}) => {
  const rejected = status === "Not Approved";
  return {
    id, pdd_number: num, project_name: p.name, campus: ET(p._slot), initiated_by: "Campus office (sample)", initiated_by_designation: "Campus office",
    initiated_by_email: null, su_head: "Head of Unit (sample)", project_type: "Budgeted", cost_center: cc(P.find(x => x.key === p._key).ccode).name,
    grand_total: extra.grand ?? sumItems(p._key), estimated_total: extra.grand ?? sumItems(p._key), currency: "PKR", start_date: p.start_date, finish_date: p.end_date,
    submitted_on: received.slice(0, 10), received_at: received, epdd_status: status, epdd_status_code: null, queue: extra.queue || "status", epdd_url: null,
    source_created_at: received, source_updated_at: received, content_hash: `sim-${id}`, raw: {}, is_history: extra.queue !== "manage",
    detail_needed: false, detail_synced_at: received, linked_project_id: rejected ? null : p.id, link_source: rejected ? null : "auto",
    first_seen_at: received, last_synced_at: NOW, changed_at: received, seen_at: extra.queue === "manage" ? null : received, seen_by: extra.queue === "manage" ? null : PMO.id,
    approvals: decided ? [{ kind: "decision", role: "PMO review", name: "PMO reviewer", status: rejected ? "Rejected" : "Recommended", when: decided,
      reason: rejected ? "Quotations missing; please attach two quotations." : null, recommendation_cost: null, update_reason: null, updated_by: null },
      ...(!rejected ? [{ kind: "decision", role: "PMO decision", name: "PMO", status: "Recommended", when: decided, reason: null, recommendation_cost: null, update_reason: null, updated_by: null }] : [])] : [],
    pdd: extra.pdd || {},
  };
};
const docSlots = (quote) => [
  { category: "general", group: "General", title: "Deliverables (Annexure A)", file: "Deliverables_AnnexA.pdf" },
  { category: "general", group: "General", title: "Business Plan (Annexure B)", file: "Business_Plan_AnnexB.pdf" },
  { category: "simpleprocurement", group: "Simple Procurement", title: "Quotations", file: quote }];
const epdd_pdds = HIST.map(([id, num, k, st, rec, dec]) => {
  const p = byKey(k);
  return pddRow(id, num, p, st, rec, dec, { pdd: pddItems[k] ? { project_name: p.name, items: items(k), grand_total: sumItems(k), estimated_total: sumItems(k), currency: "PKR",
    doc_types: ["General", "Simple Procurement"], file_slots: docSlots("Quotation_Vendor1.pdf") } : {} });
});
// The incoming PDD (PMO Review): Budgeted, linked automatically to N1, PKR 525,000 over DF -> code check fails.
const N1 = byKey("N1");
const newItems = [["Glass display cases, floor standing", 8, "No", 245000], ["Wall-mounted specimen cases", 6, "No", 140000], ["LED case lighting", 14, "No", 22500], ["Specimen labelling and mounting", 1, "Lot", 860000], ["Installation and transport", 1, "Job", 150000]]
  .map(([description, qty, unit, unit_cost]) => ({ description, qty, unit, unit_cost, total: qty * unit_cost }));
const newGrand = newItems.reduce((s, i) => s + i.total, 0);
const newPdd = {
  project_name: N1.name, campus: ET("C01"), project_type: "Budgeted", cost_center: cc("9201000").name, currency: "PKR",
  date: "2026-10-14", start_date: "2026-11-15", finish_date: "2027-02-28", estimated_duration: "3 months 13 days",
  problem: "The pathology museum keeps its specimens in old open shelving, so students cannot study them properly and some specimens are deteriorating.",
  opportunity: "Proper cases would let every second and third year student use the museum for self-study between practical sessions.",
  proposed_solution: "Install sealed glass display cases and wall cases with lighting, then relabel and remount the collection.",
  objectives: "Display the full specimen collection in sealed cases before the spring term and open the museum for self-study four days a week.",
  success_criteria: "All 180 specimens displayed in sealed cases; museum open 4 days a week; student feedback score of at least 4 out of 5.",
  stakeholders: "Pathology department, second and third year students, facilities office.",
  related_target: "Teaching & Learning Excellence: better practical teaching spaces.", description: "Display cases and lighting for the pathology museum.",
  risks: [{ risk: "Specimens may be damaged while being moved", impact: "Loss of teaching material" }, { risk: "Case supplier lead time", impact: "Museum opens late" }],
  experts: [{ name: "Museum curator (sample)", email: "curator@simulation.example" }], strategic_priorities: [TL], strategic_themes: [],
  items: newItems, grand_total: newGrand, estimated_total: newGrand, doc_types: ["General", "Simple Procurement"],
  file_slots: docSlots("Quotation_DisplayCases.pdf"),
};
const incoming = pddRow(124, "PDD-2027-024", N1, "Campus Director Approved", "2026-10-14T11:20:00Z", null, { queue: "manage", grand: newGrand, pdd: newPdd });
epdd_pdds.push(incoming);
const planForReview = projects.filter(p => p.portfolio === "capex").map(p => ({ ...p, cost_centers: { name: CC.find(c => c.id === p.cost_center_id).name } }));
const files = [["general", "Deliverables (Annexure A)", "Deliverables_AnnexA.pdf"], ["general", "Business Plan (Annexure B)", "Business_Plan_AnnexB.pdf"], ["simpleprocurement", "Quotations", "Quotation_DisplayCases.pdf"]]
  .map(([category, title, file_name], i) => ({ id: 900 + i, pdd_id: 124, category, title, file_name, status: "done", sha256: `sim${i}`, mime: "application/pdf", size_bytes: 180000 }));
const rv = reviewPdd({ ...incoming, linked_project_id: null, link_source: null }, files, planForReview);
incoming.linked_project_id = rv.linked?.id ?? null; incoming.link_source = rv.linkSource;

/* ── Deliverables (from approved PDD lines); ticks agree with the WBS ──── */
// Story: 4 of 8 delivered (group study furniture, book stacks, lending stations, lockers).
const DELIVERED = { A1: { 2: "2026-09-28", 3: "2026-10-12", 4: "2026-10-12", 8: "2026-10-05" }, A2: { 1: "2026-09-15", 2: "2026-09-15", 5: "2026-10-02" },
  A3: { 1: "2026-08-30", 2: "2026-08-30" }, A6: { 1: "2026-09-12", 2: "2026-10-02", 4: "2026-10-08" }, A7: { 1: "2026-10-10", 2: "2026-09-25", 3: "2026-09-25" }, A5: { 1: "2026-10-01" }, A8: { 4: "2026-09-20" }, A9: { 2: "2026-10-07" } };
const project_deliverables = DELIV_KEYS.flatMap(k => items(k).map((it, i) => ({
  id: uid("de100001"), project_id: byKey(k).id, source: "pdd", pdd_id: epdd_pdds.find(e => e.linked_project_id === byKey(k).id && e.queue === "status").id,
  line_no: i + 1, title: it.description, qty: it.qty, unit: it.unit, unit_cost: it.unit_cost, total: it.total, currency: "PKR", confirmed: true, superseded: false,
  prev_unit_cost: null, prev_total: null, price_changed_at: null,
  status: DELIVERED[k]?.[i + 1] ? "delivered" : "not_started", status_date: DELIVERED[k]?.[i + 1] || null, note: null, sort_order: i + 1,
  created_at: "2026-10-06T06:00:00Z", updated_at: DELIVERED[k]?.[i + 1] ? `${DELIVERED[k][i + 1]}T09:00:00Z` : "2026-10-06T06:00:00Z" })));

/* ── Cash-flow plan: hump-shaped phasing, exactly DF per project ─────────── */
const FYM = []; { let y = 2026, m = 7; for (let i = 0; i < 12; i++) { FYM.push(`${y}-${String(m).padStart(2, "0")}-01`); if (++m > 12) { m = 1; y++; } } }
const PMDC_MONTHS = { A4: ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"], A8: ["2026-09-01", "2026-10-01", "2026-11-01"] };
const PRIO_LABEL = { top_priority: "1st Priority", second_priority: "2nd Priority", third_priority: "3rd Priority" };
const project_cashflows = [];
for (const p of projects) {
  const s = p.start_date.slice(0, 7) + "-01", e = p.end_date.slice(0, 7) + "-01";
  const ms = PMDC_MONTHS[p._key] || FYM.filter(m => m >= s && m <= e);
  const w = ms.map((_, i) => Math.sin(Math.PI * (i + 0.5) / ms.length) * (1.35 - 0.7 * i / ms.length) + 0.3);
  const W = w.reduce((a, b) => a + b, 0);
  const amt = ms.map((_, i) => Math.floor(p.df_recommended_amount * w[i] / W / 1000) * 1000);
  amt[amt.length - 1] = p.df_recommended_amount - amt.slice(0, -1).reduce((a, b) => a + b, 0);
  ms.forEach((m, i) => project_cashflows.push({ id: uid("cf000001"), project_id: p.id, project_name: p.name, campus: p.campus,
    sector: SECTORS.find(x => x.id === p.sector_id).name, organization: SEGMENTS.find(x => x.id === p.segment_id).name, cost_centre: CC.find(c => c.id === p.cost_center_id).name,
    project_type: p._plan, priority: PRIO_LABEL[p.priority], month: m, amount: amt[i],
    bucket: p.portfolio === "investment" ? "investment" : p._pmdc ? "pmdc" : "capex", planned_start: p.start_date, planned_end: p.end_date,
    created_at: "2026-09-15T06:00:00Z" }));
}

/* ── Activity log: project changes after the replay floor (board reports) ─ */
const L = []; const log = (at, k, action, oldv, newv, actor = PMO) => { const p = byKey(k); const changed = Object.keys(newv).sort();
  L.push({ id: L.length + 1, actor_id: actor.id, actor_name: actor.username, actor_role: actor.role, action, entity_type: "projects", entity_id: p.id,
    summary: action === "stage_changed" ? `Project "${p.name}" moved ${oldv.workflow_stage} -> ${newv.workflow_stage}` : `Project "${p.name}" updated`,
    details: { changed, old: oldv, new: newv, label: p.name }, created_at: at }); };
const REL = (k, d) => [{ amount_released: 0, budget_release_date: null, actual_start_date: null, actual_cost: 0 }, { amount_released: byKey(k).amount_released, budget_release_date: d, actual_start_date: d, actual_cost: byKey(k).actual_cost }];
log("2026-08-25T06:10:00Z", "A8", "updated", ...REL("A8", "2026-08-25"));
log("2026-08-28T09:00:00Z", "C2", "stage_changed", { workflow_stage: "approved", actual_end_date: null, pct_complete: 80, pcd_received_date: null }, { workflow_stage: "closed", actual_end_date: "2026-08-24", pct_complete: 100, pcd_received_date: "2026-08-28" });
log("2026-09-01T05:20:00Z", "A5", "updated", ...REL("A5", "2026-09-01"));
log("2026-09-04T07:45:00Z", "A9", "stage_changed", { workflow_stage: "mt_review", bac: 0 }, { workflow_stage: "approved", bac: 4980000 });
log("2026-09-10T06:30:00Z", "A9", "updated", ...REL("A9", "2026-09-10"));
log("2026-09-12T08:15:00Z", "A1", "updated", { pct_complete: 25 }, { pct_complete: 38 });
log("2026-09-15T09:30:00Z", "E1", "stage_changed", { workflow_stage: "df_review" }, { workflow_stage: "ed_review" });
log("2026-09-18T10:05:00Z", "C1", "stage_changed", { workflow_stage: "approved", actual_end_date: null, pct_complete: 90 }, { workflow_stage: "closed", actual_end_date: "2026-09-18", pct_complete: 100 });
log("2026-09-23T06:50:00Z", "E1", "stage_changed", { workflow_stage: "ed_review" }, { workflow_stage: "mt_review" });
log("2026-09-29T08:30:00Z", "E1", "stage_changed", { workflow_stage: "mt_review", bac: 0 }, { workflow_stage: "approved", bac: 5960000 });
log("2026-09-22T07:10:00Z", "D3", "stage_changed", { workflow_stage: "identified" }, { workflow_stage: "df_review" });
log("2026-09-24T09:40:00Z", "M2", "stage_changed", { workflow_stage: "ed_review" }, { workflow_stage: "mt_review" });
log("2026-09-25T05:00:00Z", "C1", "updated", { pcd_received_date: null }, { pcd_received_date: "2026-09-25" });
log("2026-10-06T06:40:00Z", "M1", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 3500000, budget_release_date: "2026-10-06", actual_start_date: "2026-10-06" });
log("2026-10-08T10:05:00Z", "A12", "stage_changed", { workflow_stage: "mt_review", bac: 0 }, { workflow_stage: "approved", bac: 12800000 });
log("2026-10-09T07:20:00Z", "A10", "updated", ...REL("A10", "2026-10-09"));
log("2026-10-12T05:20:00Z", "D1", "stage_changed", { workflow_stage: "identified" }, { workflow_stage: "df_review" });
const activity_log = [...L].sort((a, b) => b.created_at.localeCompare(a.created_at));

/* ── Carry forward, SU list (no campus or person names) ─────────────────── */
const CF_STATUS = ["Work in Progress", "Project Closed", "PCD Received", "Open With Procurement", "Open With Finance"];
const cfAmts = [12450000, 9875500, 8640000, 7210250, 6300000, 5985000, 4720000, 4310500, 3950000, 3400000, 2865000, 2510000, 2240000, 1980750, 1755000, 1430000, 1215000, 980000, 845500, 620000, 410000, 295000, 168250, -215000];
const cfNames = ["Residence Block B Renovation", "Medical Library Journals 2025", "Seminar Block Air Conditioning", "Passenger Lift Modernisation", "Sports Ground Levelling", "Dental Lab Furnaces",
  "Staff Shuttle Bus", "Server Room Cooling", "Admin Block Repainting", "Botany Greenhouse", "Skills Room Phase 1 Fit-out", "Hall Window Curtains", "Exam Answer-Sheet Scanners",
  "Library RFID Gates", "Committee Room Display Screens", "Cafeteria Chillers", "Staff Room Sofas", "Student Card Printers", "Signage Replacement", "Residence Bed Frames",
  "Fire Extinguisher Refill", "Garden Benches", "Vehicle Barriers", "Vendor credit: returned projectors"];
const carry_forward_projects = cfAmts.map((amount, i) => ({ id: uid("cf500001"), code: `EU.25${String(9100 + i)}-01`, region: REGIONS[i % 3].name, name: cfNames[i], amount,
  status: i === 23 ? "Open With Finance" : CF_STATUS[[0, 0, 1, 0, 2, 1, 3, 0, 1, 0, 2, 1, 0, 4, 1, 0, 2, 1, 3, 1, 1, 2, 0, 4][i]], created_at: "2026-09-29T06:00:00Z" }));
const suUnfunded = [["Swimming Pool Covering", 28500000], ["Anatomy Museum Extension", 9800000], ["Indoor Sports Hall", 145000000], ["New Residence Block", 62000000],
  ["Observatory Dome", 18400000], ["Prayer Hall Extension", 7600000], ["Electric Shuttle Fleet", 24000000], ["Multi-storey Car Park", 11250000],
  ["Residence Gym", 5300000], ["Smart Classroom Pilot (10 rooms)", 15500000], ["Rooftop Garden Study", 3900000], ["Faculty Housing Repairs", 13700000],
  ["Data Analytics Platform", 9100000], ["Artificial Turf Pitch", 21000000], ["Dental Teaching Block Extension", 17800000], ["Botanical Garden Irrigation", 2950000]];
const suList = [...projects.filter(p => p.portfolio === "capex").map(p => [p.name, p.su_requested_amount]), ...suUnfunded].map(([name, amount], i) => ({ sr: i + 1, name, amount }));
const suTotal = suList.reduce((s, x) => s + x.amount, 0);
const cfTotal = cfAmts.reduce((s, x) => s + x, 0);

/* ── Past projects: earlier fiscal years, real managers on their real campuses ─ */
// Every real manager's past projects are neutral (In Progress released within the last year, or closed);
// none shows "No progress", none is chased and none is open over a year (red on the page) except the
// story PM's own (review 15 Oct 2026). The guest-with-assignments slot has only projects under a year
// old. The story PM has the one follow-up thread, with his unread reply.
// code, name, campus slot, fy, approved, released, pm slot, status, reason, release, start, imported last follow-up, notes
const PAST = [
  ["EU.239101-02", "Reading Room Shelving", "C06", "FY 23-24", 2400000, 2400000, "P08", "closed", "Closed/PCD Received", "2023-11-20", "2023-12-01", "2026-08-30", null],
  ["EU.259104-05", "Lecture Room Whiteboards", "C07", "FY 25-26", 3850000, 3850000, "P13", "open", "In Progress", "2026-01-12", "2026-01-26", "2026-09-21", null],
  ["ET.259301-06", "Reception Area Seating", "C07", "FY 25-26", 2900000, 2900000, "P13", "open", "In Progress", "2026-04-20", "2026-05-04", "2026-10-02", null],
  ["EU.249101-03", "Seminar Hall Acoustics", "C06", "FY 24-25", 6850000, 6850000, "P08", "closed", "Closed/PCD Received", "2024-11-12", "2024-12-01", "2026-09-30", null],
  ["ET.249201-02", "Seminar Room Display Screens", "C01", "FY 24-25", 4600000, 4370000, "P12", "open", "In Progress", "2025-01-20", "2025-02-05", "2026-09-01", null],
  ["EU.249102-04", "Wireless Controller Licences", "C04", "FY 24-25", 5250000, 5250000, "P01", "closed", "Closed/PCD Received", "2025-03-03", "2025-03-10", "2026-10-06", null],
  ["ET.249202-01", "Campus Public Address System", "C01", "FY 24-25", 5100000, 5100000, "P12", "closed", "Closed/PCD Received", "2024-10-07", "2024-10-20", "2026-08-15", null],
  ["EU.249106-02", "Dental Lab Compressors", "C03", "FY 24-25", 2650000, 2650000, "P10", "closed", "Closed/PCD Received", "2025-04-14", "2025-04-28", "2026-08-12", null],
  ["EU.259104-01", "Rooftop Water Tank Replacement", "C03", "FY 25-26", 3150000, 3150000, "P10", "open", "In Progress", "2025-11-10", "2025-11-24", "2026-10-05", null],
  ["EU.259105-02", "Language Lab Headsets", "C06", "FY 25-26", 11800000, 11800000, "P08", "open", "In Progress", "2025-12-15", "2026-01-10", "2026-09-18", null],
  ["EU.259106-01", "Microbiology Lab Benches", "C08", "FY 25-26", 4600000, 4600000, "P11", "open", "In Progress", "2025-11-03", "2025-11-17", "2026-09-18", null],
  ["EU.259107-02", "Generator Canopy and Fuel Tank", "C08", "FY 25-26", 2780000, 2780000, "P11", "open", "In Progress", "2026-05-11", "2026-05-20", null, null],
  ["ET.259301-03", "Staff Room Air Conditioning", "C11", "FY 25-26", 7900000, 6320000, "P04", "open", "In Progress", "2026-04-02", "2026-04-20", "2026-09-05", null],
  ["ET.259001-01", "Pharmacy Lab Balances", "C04", "FY 25-26", 3600000, 3600000, "P01", "open", "In Progress", "2026-06-02", "2026-06-15", null, null],
  ["EU.259105-04", "Seminar Room Blinds", "C04", "FY 25-26", 1950000, 1950000, "P01", "closed", "Closed/PCD Received", "2025-10-20", "2025-11-03", "2026-07-30", null],
  ["ET.259202-02", "Dissection Hall Exhaust Fans", "C01", "FY 25-26", 4300000, 2150000, "P12", "open", "In Progress", "2026-06-22", "2026-07-01", "2026-09-28", null],
];
const past_projects = PAST.map(([code, name, campus, fiscal_year, approved_amount, released_amount, pm, status, reason_open, budget_release_date, start_date, last_followed_up, notes]) => ({
  id: uid("9a570001"), code, name, campus: CT(campus), fiscal_year, approved_amount, released_amount, pm_user_id: PM[pm].id, status, reason_open, notes, last_followed_up,
  budget_release_date, start_date, actual_start_date: budget_release_date, end_date: null, revised_end_date: null, actual_end_date: null, created_by: PMO.id,
  created_at: "2026-09-15T06:00:00Z", updated_at: "2026-09-15T06:00:00Z", _pm: pm }));
const pastBy = (code) => past_projects.find(p => p.code === code);
const storyPast = pastBy("ET.249201-02");
// Message bodies never contain a name (no salutations); the author column carries it.
const msg = (table, at, author, body, extra) => ({ id: uid(table === "u" ? "0b0a0001" : "0b0b0001"), author_id: author.id, author_name: author.full_name, author_role: author.role, body, created_at: at, ...extra });
const past_project_updates = [
  msg("u", "2026-10-01T05:40:00Z", PMO, "Two of the seminar room display screens are still not installed. What is holding them, and when will they be in use?", { past_project_id: storyPast.id }),
  msg("u", "2026-10-13T10:25:00Z", PM[STORY_PM], "The vendor replaced the faulty mounting kits on both screens last week. Installation is booked for 20 October, and the department has agreed to sign the handover the same day.", { past_project_id: storyPast.id }),
];
const past_pm_messages = [
  msg("m", "2026-09-28T06:30:00Z", PMO, "Please send the delivery note for the exhaust fans when it arrives.", { pm_user_id: PM[STORY_PM].id, past_project_id: pastBy("ET.259202-02").id }),
];
for (const p of past_projects) {
  const dates = [...past_project_updates.filter(m => m.past_project_id === p.id), ...past_pm_messages.filter(m => m.past_project_id === p.id)].map(m => m.created_at.slice(0, 10)).sort();
  if (dates.length) p.last_followed_up = dates.at(-1);
}
const past_chat_reads = [
  { user_id: PMO.id, thread: `project:${storyPast.id}`, read_at: "2026-10-01T05:41:00Z" },
  { user_id: PMO.id, thread: `pm:${PM[STORY_PM].id}`, read_at: "2026-09-28T06:31:00Z" },
];

/* ── Updates (comments) on current projects ─────────────────────────────── */
// Only the story PM is quoted; every other post is a PMO note.
const comments = [];
const cmt = (k, at, author, body, parent = null, readByPmo = true) => { const c = { id: uid("c0aa0001"), project_id: byKey(k).id, parent_id: parent, author_id: author.id,
  author_name: author.full_name, author_role: author.role, body, is_read_by_pmo: author.role === "pmo" ? true : readByPmo, created_at: at, updated_at: at }; comments.push(c); return c; };
const storyQ = cmt("A1", "2026-10-07T05:15:00Z", PMO, "The schedule shows the study pods past their baseline date. Please confirm the customs date and what is on site now.");
const storyReply = cmt("A1", "2026-10-14T11:40:00Z", PM[STORY_PM], "Group study furniture, lockers, book stacks and lending stations are on site (4 of 8 items). The study pods cleared shipping on 9 October; customs clearance is now expected by 30 November, 20 days after the baseline. Installation is re-planned so handover on 29 December still holds.", storyQ.id, false);
const storyReply2 = cmt("A1", "2026-10-14T11:46:00Z", PM[STORY_PM], "Lighting, power and data works are about 40% done. The contractor adds a second shift from Monday.", storyQ.id, false);
cmt("M1", "2026-10-06T07:00:00Z", PMO, "PKR 3.5M was released at MT review for the vendor's site survey and the power-line design, which the MT asked for before sanction. No equipment is ordered until approval.");
cmt("X1", "2026-10-11T06:10:00Z", PMO, "Planned finish (5 October) has passed. The supplier has confirmed the last panels for 24 October; a project manager is being assigned to close the works.");
cmt("A3", "2026-09-16T08:40:00Z", PMO, "Scope change noted: the cut-over found ten more closets that need access switches. Costing requested to see whether the installation line can absorb it.");
cmt("A5", "2026-10-02T09:00:00Z", PMO, "Site visit: lighting panels delivered on 1 October. The structural check is booked for 8 October, before the chillers go up.");
cmt("A13", "2026-10-03T08:00:00Z", PMO, "Site visit: three of the four lighting bars are fitted. The last one is booked for the night of 18 October.");
cmt("A6", "2026-10-09T05:30:00Z", PMO, "Site visit: tiling is finished on all floors; fixtures go in this week. On track for 31 October.");
cmt("A8", "2026-09-21T07:40:00Z", PMO, "Lab stools delivered. The microscopes arrive in two batches, the first on 26 October.");
const comment_reads = comments.filter(c => c.author_id !== PMO.id && c.is_read_by_pmo).map(c => ({ user_id: PMO.id, comment_id: c.id, read_at: c.created_at }));

/* ── WBS for the story project (weighted progress == its 38%) ─────────── */
// Owners are roles or invented vendors, never a real person's name.
const phase = (name, so, status) => ({ id: uid("7a5c0001"), project_id: story.id, parent_id: null, name, owner: "Project manager", start_date: null, end_date: null,
  baseline_start: null, baseline_end: null, pct_complete: 0, is_milestone: false, status, sort_order: so, notes: null, created_at: "2026-08-02T06:00:00Z", updated_at: "2026-08-02T06:00:00Z" });
const PH = [phase("Procurement", 1, "done"), phase("Site works", 2, "in_progress"), phase("Equipment", 3, "in_progress"), phase("Commissioning and handover", 4, "not_started")];
const SLIP_TASK = "Study pods: import and customs";
const TASKS = [
  [0, "Agree specifications with the department", "2026-08-01", "2026-08-15", 100, null, "2026-08-15", "Project manager"],
  [0, "Tender and vendor award", "2026-08-16", "2026-09-10", 100, null, "2026-09-10", "Purchasing"],
  [1, "Lighting, power and data works", "2026-09-01", "2026-10-31", 40, null, "2026-10-13", "Contractor"],
  [1, "Acoustic ceilings and flooring", "2026-09-20", "2026-11-15", 11, null, "2026-10-13", "Contractor"],
  [2, "Group study furniture and lockers delivered", "2026-09-15", "2026-10-10", 100, null, "2026-10-05", "Project manager"],
  [2, "Book stacks and lending stations delivered", "2026-10-01", "2026-10-12", 100, null, "2026-10-12", "Studyspace"],
  [2, "AV presentation system: supply and fit", "2026-10-05", "2026-11-20", 20, null, "2026-10-13", "Brightline"],
  [2, SLIP_TASK, "2026-09-15", "2026-11-30", 25, "2026-11-10", "2026-10-13", "Studyspace"],
  [3, "Installation and commissioning", "2026-11-20", "2026-12-15", 0, null, "2026-08-02", "Studyspace"],
  [3, "Staff induction", "2026-12-16", "2026-12-28", 0, null, "2026-08-02", "Library head"],
  [3, "Handover of the Study Hub", "2026-12-29", "2026-12-29", 0, null, "2026-08-02", "Project manager"],
];
const project_tasks = [...PH, ...TASKS.map(([ph, name, start_date, end_date, pct, bEnd, upd, owner], i) => ({ id: uid("7a5c0001"), project_id: story.id, parent_id: PH[ph].id, name, owner,
  start_date, end_date, baseline_start: start_date, baseline_end: bEnd || end_date, pct_complete: pct, is_milestone: start_date === end_date,
  status: pct === 100 ? "done" : pct > 0 ? "in_progress" : "not_started", sort_order: i + 1, notes: null, created_at: "2026-08-02T06:00:00Z", updated_at: `${upd}T09:00:00Z` }))];
function taskRollup(rows, fk) {
  const ids = [...new Set(rows.map(t => t[fk]))];
  return ids.map(id => { const lv = rows.filter(t => t[fk] === id && !rows.some(c => c.parent_id === t.id));
    const w = (t) => Math.max(t.end_date && t.start_date ? day(t.end_date) - day(t.start_date) : 0, 1);
    const W = lv.reduce((s, t) => s + w(t), 0);
    return { [fk]: id, task_count: lv.length, milestone_count: lv.filter(t => t.is_milestone).length, tasks_start: lv.map(t => t.start_date).filter(Boolean).sort()[0] || null,
      tasks_end: lv.map(t => t.end_date).filter(Boolean).sort().at(-1) || null, baseline_start: lv.map(t => t.baseline_start).filter(Boolean).sort()[0] || null,
      baseline_end: lv.map(t => t.baseline_end).filter(Boolean).sort().at(-1) || null, last_updated: lv.map(t => t.updated_at).sort().at(-1) || null,
      weighted_pct: W > 0 ? r(lv.reduce((s, t) => s + Number(t.pct_complete) * w(t), 0) / W, 1) : null }; });
}
const project_task_rollup = taskRollup(project_tasks, "project_id");
const roll = project_task_rollup.find(x => x.project_id === story.id);
const slipTask = project_tasks.find(t => t.name === SLIP_TASK);

/* ── Files: fictional documents (same-origin, watermarked, no campus or person names) ── */
// Served by the simulation's backend at BASE_URL + "sim/files/" + file_path.
const ATT = [];
const EXT = { "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "image/jpeg": "jpg" };
const att = (k, kind, file_name, mime_type, uploaded_at, so, asset) => { const p = byKey(k); const id = uid("a77a0001");
  ATT.push({ id, project_id: p.id, kind, file_name, file_path: `${p.id}/${id}.${EXT[mime_type]}`, file_size: 0, mime_type, sort_order: so, uploaded_at,
    uploaded_by: PMO.id, uploaded_by_name: "Project Management Office", _asset: { ...asset, project: p.name, code: p.code, key: k } }); };
const PDF = "application/pdf", XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", JPG = "image/jpeg";
att("A1", "document", `EPDD_${story.name}.pdf`, PDF, "2026-07-16T07:10:00Z", 1, { type: "pdd", pdd: 104 });
att("A1", "document", "Quotation_Studyspace Interiors_Study Pods.pdf", PDF, "2026-08-27T06:30:00Z", 2, { type: "quotation", vendor: "Studyspace Interiors (sample)", vcode: "SI", lines: [1, 2, 3, 4] });
att("A1", "document", "Quotation_Brightline AV_Presentation System.pdf", PDF, "2026-08-27T06:32:00Z", 3, { type: "quotation", vendor: "Brightline AV (sample)", vcode: "BL", lines: [5] });
att("A1", "document", "BOQ_Lighting Power and Data Works.xlsx", XLSX, "2026-09-02T09:15:00Z", 4, { type: "boq", line: 6 });
att("A1", "document", "Layout_Study Hub Floor Plan.jpg", JPG, "2026-09-02T09:20:00Z", 5, { type: "layout" });
att("A1", "document", "Award Letter_Study Pods and Furniture.pdf", PDF, "2026-09-11T05:45:00Z", 6, { type: "award", vendor: "Studyspace Interiors (sample)", lines: [1, 2, 3, 4] });
for (const [k, n] of [["A2", 107], ["A3", 109], ["A4", 110], ["A5", 115], ["A8", 112], ["A9", 118]])
  att(k, "document", `EPDD_${byKey(k).name}.pdf`, PDF, epdd_pdds.find(e => e.id === n).received_at.slice(0, 10) + "T10:00:00Z", 1, { type: "pdd", pdd: n });

/* ── Media plan: where the real Gallery items are shown ─────────────────── */
// Each real project with site-visit media maps (pins.hosts) to a fictional host at the SAME real campus.
// Hosts carry no negative state and no high risk; the story project carries no real media. Dates are
// fictional: each host has visit days; its items fill them newest first (tokens.js buildMediaRows).
const MEDIA_HOSTS = [
  { slot: "H1", key: "A14", visits: [["2026-10-14T04:40:00Z", 4], ["2026-09-29T08:40:00Z", 8], ["2026-09-08T10:15:00Z", 0]] },
  { slot: "H2", key: "A9", visits: [["2026-10-07T07:05:00Z", 4], ["2026-09-16T06:30:00Z", 0]] },
  { slot: "H3", key: "A2", visits: [["2026-10-09T06:30:00Z", 5], ["2026-08-24T07:20:00Z", 0]] },
  { slot: "H4", key: "A5", visits: [["2026-10-03T08:10:00Z", 5], ["2026-09-08T09:30:00Z", 0]] },
  { slot: "H5", key: "A6", visits: [["2026-10-12T05:50:00Z", 4], ["2026-09-26T05:50:00Z", 8], ["2026-08-28T06:00:00Z", 0]] },
  { slot: "H6", key: "C2", visits: [["2026-08-22T06:00:00Z", 0]] },
  { slot: "H7", key: "I1", visits: [["2026-09-19T10:20:00Z", 6], ["2026-08-20T07:45:00Z", 0]] },
].map(h => ({ ...h, project_id: byKey(h.key).id, campus_slot: byKey(h.key)._slot }));
const media_plan = { hosts: MEDIA_HOSTS.map(({ key, ...h }) => h), uploaded_by_name: "Project Management Office" };
// Sample mode: watermarked illustrations stand in for the real media (no real photo is ever generated).
const SAMPLE_SCENES = ["study-room", "site-works", "network-rack", "exam-hall", "solar-panels", "classroom-lights", "rooftop-chillers", "tiled-room", "library-pods", "cctv-mast", "workshop", "signage"];
const SAMPLE_HOSTS = ["H1", "H5", "H3", "H1", "H2", "H5", "H4", "H3", "H1", "H5", "H2", "H4"];
const sampleMedia = SAMPLE_SCENES.map((scene, i) => ({ key: `s${String(i + 1).padStart(2, "0")}`, host: SAMPLE_HOSTS[i], mime: "image/jpeg", size: 0, order: i,
  url: `sim/files/sample-media/s${String(i + 1).padStart(2, "0")}.jpg`, scene }));

/* ── Generated files (public/sim/files) ─────────────────────────────────── */
const PDD_TEXT = {
  A1: ["Postgraduate students have no quiet or group study space on campus; the old study rooms are crowded and have no power or data at the desks.", "Refit the study hub with imported study pods, group study furniture, book stacks, self-service lending stations, an AV presentation system, acoustic ceilings and flooring, and new lighting, power and data."],
  A2: ["The campus needs more teaching and office space before the next intake, and the existing block has no backup power.", "Deliver the works package: civil and structural works, finishes, electrical and data works, furniture and backup power."],
  A3: ["The campus core switches are out of vendor support and have failed twice this year, taking the student portal and Wi-Fi down for hours.", "Replace the two core switches and the distribution switches, and cut over in a planned weekend window."],
  A4: ["The dental college's film-based imaging is slow and cannot share images with teaching rooms.", "Replace film with digital intraoral sensors and a panoramic unit integrated with the college network."],
  A5: ["The block's lighting and cooling are worn out, and the roof leaks in the monsoon.", "Renew the lighting, add rooftop chillers, waterproof the roof and rewire the block."],
  A8: ["Half of the histology microscopes break down weekly and none can show an image to the class, so practicals run in small rotations.", "Replace them with camera microscopes, a multi-head demonstration microscope and image capture software."],
  A9: ["The building's fixtures, doors and lighting are worn out and need replacing.", "Replace fixtures and fittings, doors and windows, and renew the flooring and lighting."],
};
const pddForAssets = Object.fromEntries(HIST.map(([id, num, k]) => [id, { number: num, key: k, name: byKey(k).name, code: byKey(k).code, costCentre: cc(P.find(x => x.key === k).ccode).name.replace(/ \(Code:\d+\)/, ""), start: byKey(k).start_date, end: byKey(k).end_date,
  df: byKey(k).df_recommended_amount, items: pddItems[k] ? items(k) : [], strat: P.find(x => x.key === k).strat, problem: PDD_TEXT[k]?.[0] || "", solution: PDD_TEXT[k]?.[1] || "" }]));
const assetInput = { pdds: pddForAssets, story: { name: story.name, code: story.code, items: items("A1") }, today: TODAY,
  documents: ATT.map(a => ({ file_path: a.file_path, file_name: a.file_name, mime_type: a.mime_type, uploaded_at: a.uploaded_at, ...a._asset })),
  sample: sampleMedia.map(m => ({ file: `sample-media/${m.key}.jpg`, scene: m.scene })) };
let sizes;
if (!SKIP_ASSETS) {
  const { buildAssets } = await import("./assets.mjs");
  rmSync(FILES, { recursive: true, force: true });
  sizes = await buildAssets(assetInput, FILES);
} else {
  sizes = Object.fromEntries([...assetInput.documents.map(d => d.file_path), ...assetInput.sample.map(s => s.file)].map(f => [f, existsSync(FILES + f) ? statSync(FILES + f).size : 0]));
}
for (const a of ATT) a.file_size = sizes[a.file_path] ?? 0;
for (const m of sampleMedia) m.size = sizes[`sample-media/${m.key}.jpg`] ?? 0;
const project_attachments_docs = ATT.map(({ _asset, ...a }) => a);

/* ── Board reports: Aug baseline (reconstructed) + Sep monthly (published) ─ */
const reportRows = (builtAt) => ({
  projects, log: activity_log, assignments: project_assignments, profiles: USERS, campuses: CAMPUSES, segments: SEGMENTS, sectors: SECTORS,
  cashflows: project_cashflows, risks: scored(project_risks).filter(x => x.created_at < builtAt).map(x => ({ ...x, date_last_reviewed: [x.date_last_reviewed, builtAt.slice(0, 10)].sort()[0] })), pdds: epdd_pdds.filter(e => (e.received_at || "") < builtAt),
  carry: carry_forward_projects.filter(c => c.created_at < builtAt), past: past_projects.filter(x => x.created_at < builtAt),
  settings: [{ key: "dashboard_kpis", value: { su_requested: { list: suList } } }] });
const augB = "2026-10-02T05:55:00Z", sepB = "2026-10-02T06:00:00Z";
const aug = computeFigures(reportRows(augB), { ym: "2026-08", asAt: periodOf("2026-08").end, builtAt: augB });
const augId = uid("b4000001"), sepId = uid("b4000001");
const augRep = { id: augId, ym: "2026-08", period: aug.period, kind: "reconstructed", headline: aug.headline, stages: aug.stages };
const sep = computeFigures(reportRows(sepB), { ym: "2026-09", asAt: periodOf("2026-09").end, builtAt: sepB, compare: augRep });
const oct = computeFigures(reportRows(NOW), { ym: "2026-10", asAt: NOW, builtAt: NOW, compare: { id: sepId, ym: "2026-09", period: sep.period, kind: "monthly", headline: sep.headline, stages: sep.stages } });
const fmtMr = (n) => `${(n / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const sepMt = sep.stages.find(x => x.stage === "mt_review");
const sepNote = `In September PKR ${fmtMr(sep.month.released)} was released to ${sep.month.released_count} projects (${sep.month.released_list.map(x => x.name).join(" and ")}), `
  + `and ${sep.moved_to_approved.map(x => x.name).join(" and ")} moved to Approved. ${sepMt.count} projects worth PKR ${fmtMr(sepMt.df)} were with the Managing Trustee at month end.`;
const board_reports = [
  { id: augId, title: "Baseline: August 2026", period: "2026-08-01", kind: "reconstructed", status: "published", as_at: periodOf("2026-08").end, note: null,
    figures: aug, calc_version: aug.calc_version, published_by: PMO.id, published_at: "2026-10-02T05:55:30Z", created_by: PMO.id, created_at: "2026-10-02T05:55:30Z", updated_at: "2026-10-02T05:55:30Z" },
  { id: sepId, title: "Monthly Board Report: September 2026", period: "2026-09-01", kind: "monthly", status: "published", as_at: periodOf("2026-09").end, note: sepNote,
    figures: sep, calc_version: sep.calc_version, published_by: PMO.id, published_at: "2026-10-02T06:10:00Z", created_by: PMO.id, created_at: "2026-10-02T06:00:00Z", updated_at: "2026-10-02T06:10:00Z" },
];
const board_report_recipients = VIEWERS.map((v, i) => ({ report_id: sepId, user_id: v.id, added_by: PMO.id, added_at: "2026-10-02T06:10:00Z", removed: false,
  seen_at: ["2026-10-02T09:12:00Z", "2026-10-03T04:40:00Z", null][i], emailed_at: "2026-10-02T06:12:00Z" }));

/* ── Settings ───────────────────────────────────────────────────────────── */
const capexRows = projects.filter(p => p.portfolio === "capex");
const apprRows = capexRows.filter(p => ["approved", "closed"].includes(p.workflow_stage));
const dfBy = (f) => { const m = {}; capexRows.forEach(p => { const k = f(p); m[k] = (m[k] || 0) + p.df_recommended_amount; }); return m; };
const toTargets = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { bac: Math.round(v / 1e6 * 0.6 * 10) / 10 }]));
const settings = [
  { key: "dashboard_kpis", value: {
    su_requested: { value: (suTotal / 1e6).toFixed(2) + "M", sub: `From ${suList.length} proposals`, list: suList, source: "SU_DF_Project_List (sample).xlsx", imported: "2026-09-29" },
    carry_forward: { value: "", sub: "", insight: "Finance's pending payments on projects from the previous fiscal year." },
    budget_reduction: { value: ((suTotal - capexRows.reduce((s, p) => s + p.df_recommended_amount, 0)) / 1e6).toFixed(2) + "M", sub: "SU to DF variance" },
    approved_projects: { value: "", sub: "", insight: `Approved budget (BAC) on projects at the Approved or Closed stage: ${apprRows.length} of ${capexRows.length} projects.` },
    budgeted_projects: { value: "", sub: "", insight: "Approved budget on approved projects that are part of the original CAPEX plan." },
    non_budgeted_projects: { value: "", sub: "", insight: "Approved budget on approved projects added outside the original CAPEX plan." },
    approved: { value: "", sub: "", insight: "Projects at the Approved stage, in execution. Closed projects are counted separately." },
    remaining_capex: { value: "", sub: "", insight: "DF Recommended value not yet approved: DF Recommended less approved budget." },
    in_df: { value: "", sub: "With Director Finance", insight: "Under review by the Director Finance." },
    in_mt: { value: "", sub: "With Managing Trustee", insight: "With the Managing Trustee for final sanction." },
  } },
  { key: "dashboard_title", value: "PMO CAPEX Dashboard" },
  { key: "fiscal_year", value: "FY 2026-27" },
  { key: "dashboard_breakdowns", value: { __all__: { orgs: toTargets(dfBy(p => SEGMENTS.find(s => s.id === p.segment_id).name)), segments: toTargets(dfBy(p => SECTORS.find(s => s.id === p.sector_id).name)) } } },
  { key: "spi_threshold", value: SPI_T }, { key: "cpi_threshold", value: CPI_T },
  { key: "past_viewers", value: { user_ids: [VIEWERS[0].id, VIEWERS[1].id] } },
  { key: "welcome_email", value: { cc: ["pmo.team@simulation.example"], password: "" } },   // never a real password or address
  { key: "about_us", value: { heading: "About the Project Management Office",
    body: "The Project Management Office (PMO) runs the University's capital programme: every CAPEX project from the first proposal to the handover. "
      + "We review project documents, track approvals through Finance and senior management, follow progress, risks and money released on each site, "
      + "and report the portfolio to the Board every month. Each project has a named project manager on its campus, and the PMO is the single point of contact for the whole portfolio.\n\n"
      + "This is a simulation: every project, figure, document, date and message in it is invented." } },
  // Names come from the cast at run time; the descriptions are neutral role lines (no campuses, no claims about the person).
  { key: "team_config", value: {
    head_pmo: { name: TT("head_pmo"), desc: "Leads the PMO and reports the capital programme to senior management.", photo: "" },
    manager_pmo: { name: TT("manager_pmo"), desc: "Runs the approval pipeline and the monthly portfolio review.", photo: "" },
    deputy_pmo: { name: TT("deputy_pmo"), desc: "Oversees project delivery and site follow-up.", photo: "" },
    exec_pmo: { name: TT("exec_pmo"), desc: "Keeps the portfolio data, cash-flow plan and reports up to date.", photo: "" },
    po1: { name: TT("po1"), desc: "Follows up project progress and site visits.", photo: "" },
    po2: { name: TT("po2"), desc: "Keeps project documents and follow-ups up to date.", photo: "" },
  } },
  { key: "contact_info", value: { email: "pmo@simulation.example", phone: "+00 51 0000 0100", address: "1 University Avenue (sample address)",
    office: "PMO, 2nd floor, Room 214", hours: "Monday to Friday, 9:00 am to 5:00 pm", website: "" } },
];

/* ── Views as tables (what the synthetic backend serves) ───────────────── */
const dash = dashboard(projects);
const project_metrics = projects.map(p => strip(metrics(p)));
const pastSummary = past_projects.map(p => { const u = USERS.find(x => x.id === p.pm_user_id); const ups = past_project_updates.filter(m => m.past_project_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { _pm, ...q } = p;
  return { ...q, pm_name: u?.full_name || u?.username || null, pm_email: u?.email || null, update_count: ups.length, last_update_at: ups.at(-1)?.created_at || null,
    last_update_role: ups.at(-1)?.author_role || null, days_since_followup: p.last_followed_up ? day(TODAY) - day(p.last_followed_up) : null }; });
const pddPending = capexRows.filter(p => p.workflow_stage === "pdd_not_submitted" && day(p.start_date) - day(TODAY) >= 0 && day(p.start_date) - day(TODAY) <= 19);
const stripU = ({ _slot, _team, ...u }) => u;
const tables = {
  user_profiles: USERS.map(stripU), campuses: CAMPUSES.map(({ _slot, ...c }) => c), segments: SEGMENTS, sectors: SECTORS, regions: REGIONS, cost_centers: CC,
  projects: projects.map(strip), project_assignments, project_raci, project_risks: project_risks.map(({ _story, ...x }) => x), epdd_pdds, epdd_files: files,
  epdd_reviews: [{ id: 1, pdd_id: 124, content_hash: "sim", status: "done", verdict: rv.verdict, summary: rv.summary, checks: rv.checks, model: "rules-3", created_at: "2026-10-14T11:24:00Z", finished_at: "2026-10-14T11:24:02Z" }],
  project_deliverables, project_tasks, project_cashflows, activity_log, carry_forward_projects, past_projects: past_projects.map(({ _pm, ...x }) => x), past_project_updates, past_pm_messages, past_chat_reads,
  past_project_tasks: [], comments, comment_reads, project_attachments: project_attachments_docs, board_reports, board_report_recipients, settings,
  // kept empty: no invented sessions, devices, tour data or notifications for anyone
  user_sessions: [], session_events: [], tour_events: [], notifications_log: [], push_subscriptions: [], user_webauthn_credentials: [],
  project_metrics, portfolio_dashboard: [dash], portfolio_metrics: [dash], investment_metrics: [investmentMetrics(projects)], at_risk_projects: [],
  pdd_pending_projects: pddPending, project_risks_scored: scored(project_risks), project_task_rollup, past_project_summary: pastSummary,
  past_project_task_rollup: [],
};

/* ══ Quotable figures, formatted as the screens format them ═════════════ */
const fmtM = (n) => n == null ? "—" : `${(n / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const fmtP = (n) => `${Number(n).toFixed(1)}%`;
const full = (n) => Math.round(n).toLocaleString("en");
const pct0 = (x) => `${Math.round(x * 100)}%`;
const sum = (l, f) => l.reduce((s, x) => s + Number(f(x) || 0), 0);
const capex = capexRows, inv = projects.filter(p => p.portfolio === "investment");
const isA = (p) => ["approved", "closed"].includes(p.workflow_stage);
const M = project_metrics;
const out = {};
const budgeted = apprRows.filter(p => p.project_type === "Budgeted"), nonB = apprRows.filter(p => p.project_type !== "Budgeted");
out.s01_overview = { hero: { verdict: healthOf(dash.portfolio_cpi, dash.portfolio_spi), cpi: dash.portfolio_cpi.toFixed(3), cpiLabel: perfStatus(dash.portfolio_cpi), spi: dash.portfolio_spi.toFixed(3), spiLabel: perfStatus(dash.portfolio_spi),
    hint: `Cost performance · ${dash.reporting_progress_count} of ${dash.total_projects} projects`, total: `PKR ${fmtM(dash.total_capex)}`, sub: `${dash.total_projects} projects · FY 2026-27` },
  cards: { "SU Requested": [(suTotal / 1e6).toFixed(2) + "M", `From ${suList.length} proposals`], "DF Recommended": [fmtM(dash.df_recommended_total), `${capex.filter(p => p.df_recommended_amount > 0).length} DF Rec Projects`],
    "Approved Projects": [fmtM(sum(apprRows, p => p.bac)), `${apprRows.length} of ${dash.total_projects} projects`], "Budgeted Projects": [fmtM(sum(budgeted, p => p.bac)), `${budgeted.length} of ${dash.total_projects} projects`],
    "Non-Budgeted Projects": [fmtM(sum(nonB, p => p.bac)), `${nonB.length} of ${dash.total_projects} projects`], "Carry Forward": [fmtM(cfTotal), `${carry_forward_projects.length} projects from prior FY`],
    "PCDs Received": [String(dash.closed_count), `${dash.closed_count} of ${dash.total_projects} projects`] } };
const stageN = (s) => capex.filter(p => p.workflow_stage === s).length;
out.s02_pdd = { cards: { "PDDs Not Submitted": dash.pdd_not_submitted_count, "PDDs Submitted": dash.pdds_submitted, "DF Review": dash.in_df, "ED Review": dash.in_ed, "MT Review": dash.in_mt, "Approved": dash.approved_count, closedSegment: dash.closed_count },
  mtList: capex.filter(p => p.workflow_stage === "mt_review").map(p => [p.code, p.name, p.campus]), mtListHeader: `PDD STATUS — MT REVIEW · ${stageN("mt_review")} projects` };
const im = investmentMetrics(projects);
out.s03_investments = { tiles: { "Investment Projects": im.total_projects, "Total Requested": full(im.su_requested_total), "Recommended": full(im.df_recommended_total), "Approved": `${full(im.approved_total)} · ${im.approved_count} sanctioned`, "Released": full(im.released_total) },
  register: inv.map(p => [p.code, p.name, p.campus, p.workflow_stage, full(p.df_recommended_amount), full(p.bac), full(p.amount_released)]), registerHeader: `INVESTMENT REGISTER (${inv.length})` };
const rel = capex.filter(p => p.amount_released > 0).sort((a, b) => b.amount_released - a.amount_released);
out.s04_payments = { cards: { "Total CAPEX": fmtM(dash.total_capex), "Budget Released": [fmtM(dash.budget_consumed), `${fmtP(dash.budget_consumed / dash.total_capex * 100)} of total CAPEX`],
    "Remaining CAPEX": [fmtM(dash.df_recommended_total - dash.approved_total), `${fmtP((dash.df_recommended_total - dash.approved_total) / dash.df_recommended_total * 100)} awaiting approval`],
    "Payments Made": fmtM(dash.payments_made_total), "Payments Pending": [fmtM(dash.payments_pending_amount), `${dash.payments_pending_count} projects awaiting transfer`] },
  flow: [["DF Recommended", fmtM(dash.df_recommended_total)], ["Approved", fmtM(dash.approved_total), pct0(dash.approved_total / dash.df_recommended_total)], ["Released", fmtM(dash.budget_consumed), pct0(dash.budget_consumed / dash.df_recommended_total)], ["Paid", fmtM(dash.payments_made_total), pct0(dash.payments_made_total / dash.df_recommended_total)]],
  releasedList: `PAYMENTS STATUS — BUDGET RELEASED · ${rel.length} projects`, releasedTop: rel.slice(0, 5).map(p => [p.name, p.workflow_stage, fmtM(p.amount_released)]),
  releasedBeforeApproval: rel.filter(p => !isA(p)).map(p => [p.name, p.workflow_stage, full(p.amount_released)]) };
const SEARCH = "Study Hub";
const searchHits = capex.filter(p => p.name.toLowerCase().includes(SEARCH.toLowerCase()) || p.code.toLowerCase().includes(SEARCH.toLowerCase()));
out.s05_projects = { all: `${capex.length} of ${capex.length}`, df: `PKR ${fmtM(dash.df_recommended_total)}`, approvedN: apprRows.length,
  search: { q: SEARCH, rows: searchHits.map(p => [p.code, p.name, fmtM(p.df_recommended_amount), p.workflow_stage]) } };
const perfRows = M.filter(p => ["approved", "closed"].includes(p.workflow_stage));
const ex = perfRows.filter(p => p.workflow_stage === "approved" && p.pct_complete > 0 && p.amount_released > 0);
const EV = sum(ex, p => p.earned_value), AC = sum(ex, p => p.amount_released), PV = sum(ex, p => p.planned_value);
const cnt = (f) => perfRows.filter(f).length;
out.s06_performance = { strip: { CPI: (EV / AC).toFixed(3), SPI: (EV / PV).toFixed(3), executing: `${ex.length} projects actively executing` },
  pills: { All: perfRows.length, Active: cnt(p => p.workflow_stage === "approved"), "On Schedule": cnt(p => p.schedule_flag === "on_time"), Delayed: cnt(p => p.schedule_flag === "delayed"), "Over Budget": cnt(p => p.budget_flag === "over"), Closed: cnt(p => p.workflow_stage === "closed") },
  delayed: perfRows.filter(p => p.schedule_flag === "delayed").map(p => [p.code, p.name, p.campus, `${Number(p.pct_complete).toFixed(1)}%`, Number(p.spi).toFixed(3), Number(p.cpi).toFixed(3)]),
  over: perfRows.filter(p => p.budget_flag === "over").map(p => [p.name, Number(p.cpi).toFixed(3)]) };
const sc = scored(project_risks);
const open = sc.filter(x => !["closed", "mitigated"].includes(x.status));
const RISK_CELL = `${storyRisk.probability}-${storyRisk.impact}`;
const cells = {}; for (const pr of ["low", "medium", "high"]) for (const im2 of ["high", "medium", "low"]) cells[`${pr}-${im2}`] = sc.filter(x => x.status !== "closed" && x.probability === pr && x.impact === im2).length;
const cellRisks = sc.filter(x => `${x.probability}-${x.impact}` === RISK_CELL);
out.s07_risks = { header: `${open.length} open · ${open.filter(x => x.severity === "critical").length} critical · across the portfolio`, cells, bySeverity: Object.fromEntries(["critical", "high", "medium", "low"].map(s => [s, sc.filter(x => x.severity === s).length])),
  cell: RISK_CELL, cellRisks: cellRisks.map(x => [x.project_name, x.title, x.owner]), listCount: `${cellRisks.length} of ${open.length}` };
const pmOf = new Map(); project_assignments.forEach(a => { const u = USERS.find(x => x.id === a.user_id); (pmOf.get(a.project_id) || pmOf.set(a.project_id, []).get(a.project_id)).push(u.full_name); });
const compareRows = CAMPUSES.filter(c => capex.some(p => p.campus_id === c.id)).map(c => { const l = capex.filter(p => p.campus_id === c.id); const ids = new Set(l.map(p => p.id));
  const dl = project_deliverables.filter(d => ids.has(d.project_id) && d.confirmed && !d.superseded); const ap = l.filter(isA);
  const df = sum(l, p => p.df_recommended_amount), rl = sum(l, p => p.amount_released); const pmCount = {}; l.forEach(p => (pmOf.get(p.id) || []).forEach(n => { pmCount[n] = (pmCount[n] || 0) + 1; }));
  return { campus: c.name, slot: c._slot, projects: l.length, df, dfS: fmtM(df), approved: `${ap.length} of ${l.length}`, approvedRate: ap.length / l.length, approvedSub: `${fmtM(sum(ap, p => p.bac))} approved`, bac: sum(ap, p => p.bac),
    released: rl, releasedS: fmtM(rl), releasedRate: rl / df, releasedSub: `${pct0(rl / df)} of DF`, pddNot: l.filter(p => p.workflow_stage === "pdd_not_submitted").length,
    pastFinish: l.filter(p => p.workflow_stage === "approved" && p.end_date < TODAY && !p.actual_end_date).length, risks: project_risks.filter(x => ids.has(x.project_id) && x.status !== "closed").length,
    highRisks: project_risks.filter(x => ids.has(x.project_id) && ["high", "critical"].includes(sevOf(x.probability, x.impact))).length,
    delayed: perfRows.filter(p => ids.has(p.id) && p.schedule_flag === "delayed").length,
    delivLines: dl.length, delivDone: dl.filter(d => d.status !== "not_started").length, deliv: dl.length ? `${dl.filter(d => d.status !== "not_started").length} of ${dl.length}` : "—", noPm: l.filter(p => !pmOf.has(p.id)).length,
    pastOpen: past_projects.filter(x => x.campus === c.name && x.status !== "closed").length,
    pmsList: Object.entries(pmCount).sort((a, b) => b[1] - a[1]),
    pms: (Object.entries(pmCount).length ? Object.entries(pmCount).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n} (${k})`).join(" · ") : "None assigned") + (l.filter(p => !pmOf.has(p.id)).length ? ` · ${l.filter(p => !pmOf.has(p.id)).length} without a PM` : ""),
    top: [...l].sort((a, b) => b.df_recommended_amount - a.df_recommended_amount).slice(0, 5).map(p => `${p.name} ${fmtM(p.df_recommended_amount)}`) }; });
const byDf = [...compareRows].sort((a, b) => b.df - a.df);
const byRel = [...compareRows].sort((a, b) => b.releasedRate - a.releasedRate || b.df - a.df);
const H2H_THIRD = "C06", ASSIGN_CAMPUS = "C06", ASSIGN_PM = "P08";   // the third campus is ticked in the run; its Open leads to Assign PM
const H2H = [byDf[0].slot, byDf[1].slot, H2H_THIRD];
const h2h = H2H.map(s => compareRows.find(x => x.slot === s));
const leadOf = (f, bad = false) => { const v = h2h.map(f); const best = bad ? Math.min(...v) : Math.max(...v); return h2h.filter((x, i) => v[i] === best && v.some(y => y !== best)).map(x => x.campus); };
out.s08_compare = { caption: `${compareRows.length} campuses · ${capex.length} CAPEX projects · DF PKR ${fmtM(dash.total_capex)} · ${apprRows.length} approved · released PKR ${fmtM(dash.budget_consumed)}`,
  byDf: byDf.map(x => `${x.campus} ${x.dfS}`), byReleasedRate: byRel.map(x => `${x.campus} ${pct0(x.releasedRate)}`),
  h2h: { campuses: h2h.map(x => x.campus), leaders: { approved: leadOf(x => x.bac), released: leadOf(x => x.released), pddNot: leadOf(x => x.pddNot, true), pastFinish: leadOf(x => x.pastFinish, true), risks: leadOf(x => x.risks, true),
    deliv: leadOf(x => x.delivLines ? x.delivDone / x.delivLines : 0), noPm: leadOf(x => x.noPm, true) },
    columns: h2h.map(x => ({ campus: x.campus, projects: x.projects, df: `PKR ${x.dfS}`, approved: `PKR ${fmtM(x.bac)}`, approvedSub: `${x.approved} projects (${pct0(x.approvedRate)})`, released: `PKR ${x.releasedS}`, releasedSub: `${pct0(x.releasedRate)} of DF Recommended`,
      pddNot: x.pddNot, pastFinish: x.pastFinish, risks: x.risks, deliv: x.deliv, noPm: x.noPm, pms: x.pms, top: x.top })) },
  rows: compareRows.map(({ pmsList, ...x }) => x) };
const capPlan = project_cashflows.filter(c => c.bucket !== "investment");
const monthly = FYM.map(m => ({ m, capex: sum(project_cashflows.filter(c => c.month === m && c.bucket === "capex"), c => c.amount), pmdc: sum(project_cashflows.filter(c => c.month === m && c.bucket === "pmdc"), c => c.amount), n: new Set(capPlan.filter(c => c.month === m).map(c => c.project_id)).size }));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; const mLabel = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const peak = monthly.reduce((a, b) => (b.capex + b.pmdc > (a ? a.capex + a.pmdc : -1) ? b : a), null);
const pmdcTot = sum(project_cashflows.filter(c => c.bucket === "pmdc"), c => c.amount), capTot = sum(capPlan, c => c.amount), drawn = sum(capex.filter(p => p.amount_released > 0), p => p.amount_released);
const invPlan = sum(project_cashflows.filter(c => c.bucket === "investment"), c => c.amount);
out.s09_cashflows = { tiles: { "CAPEX total": [`PKR ${fmtM(dash.total_capex)}`, `${capex.length} projects · incl. PMDC`], "of which PMDC": [`PKR ${fmtM(pmdcTot)}`, `${(pmdcTot / capTot * 100).toFixed(1)}% of CAPEX`],
    "Released to date": [`PKR ${fmtM(drawn)}`, `${(drawn / dash.total_capex * 100).toFixed(1)}% drawn`], "Peak month": [mLabel(peak.m), `PKR ${fmtM(peak.capex + peak.pmdc)}`], "Investment": [`PKR ${fmtM(invPlan)}`, `${inv.length} projects · outside CAPEX`] },
  pmdcMonths: monthly.filter(x => x.pmdc > 0).map(x => mLabel(x.m)), monthly: monthly.map(x => [mLabel(x.m), fmtM(x.capex), fmtM(x.pmdc), x.n]),
  priorities: [...new Set(project_cashflows.map(c => c.priority))].sort(), types: [...new Set(project_cashflows.map(c => c.project_type))].sort() };
const dmy = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)} ${MON[m - 1]} ${y}`; };
out.s10_timeline = { caption: `${capex.length} scheduled · 0 without dates`, groups: compareRows.map(c => `${c.campus} ${c.projects}`),
  late: capex.filter(p => p.end_date < TODAY && p.workflow_stage !== "closed").map(p => `${p.name} (end ${p.end_date})`),
  story: { hover: `${story.name}: ${dmy(story.start_date).replace(/ 2026$/, "")} → ${dmy(story.end_date)}, Progress ${story.pct_complete}%`, tasks: `${roll.task_count}, ${roll.milestone_count} milestone`, committed: `${roll.baseline_start} → ${roll.baseline_end}`, progress: `${roll.weighted_pct}%` } };
const unreadC = comments.filter(c => c.author_id !== PMO.id && !comment_reads.some(x => x.comment_id === c.id));
out.s11_updates = { badge: unreadC.length, inboxProjects: [...new Set(unreadC.map(c => projects.find(p => p.id === c.project_id).name))], storyNew: `${unreadC.filter(c => c.project_id === story.id).length} new`,
  storyThread: comments.filter(c => c.project_id === story.id).map(c => `${c.author_name} (${c.created_at.slice(0, 10)}): ${c.body}`) };
const pOpen = past_projects.filter(p => p.status !== "closed");
const ageKey = (p) => { const d = day(TODAY) - day(p.budget_release_date); return d > 365 ? "over a year" : d > 182 ? "6 to 12 months" : "under 6 months"; };
const fmtMp = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v.toLocaleString("en");
out.s12_past = { cards: { "Still open": [pOpen.length, `${pOpen.filter(p => ageKey(p) === "over a year").length} open over a year`], Approved: `PKR ${fmtMp(sum(pOpen, p => p.approved_amount))}`,
    Released: `PKR ${fmtMp(sum(pOpen, p => p.released_amount))} (${pct0(sum(pOpen, p => p.released_amount) / sum(pOpen, p => p.approved_amount))} of approved)`, "No progress": pOpen.filter(p => p.reason_open === "No progress").length,
    "Not chased": pastSummary.filter(p => p.status !== "closed" && (p.days_since_followup ?? 9999) > 30).length },
  ages: Object.fromEntries(["under 6 months", "6 to 12 months", "over a year"].map(k => [k, pOpen.filter(p => ageKey(p) === k).length])),
  unread: { project: storyPast.name, campus: storyPast.campus, pm: PM[STORY_PM].full_name, openMonths: Math.floor((day(TODAY) - day(storyPast.budget_release_date)) / 30.44), thread: `FOLLOW-UP · ${past_project_updates.filter(m => m.past_project_id === storyPast.id).length} MESSAGES` },
  byPm: [...new Set(past_projects.map(p => p.pm_user_id))].map(id => `${USERS.find(u => u.id === id).full_name}: ${past_projects.filter(p => p.pm_user_id === id).length}`), total: past_projects.length, closed: past_projects.length - pOpen.length };
const asg = (u) => project_assignments.filter(a => a.user_id === u.id).length;
const usersRows = [...USERS].sort((a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username));
out.s14_users = { header: `${USERS.length} users · only the PMO can create accounts`, rows: usersRows.map(u => [u.username, u.full_name, u.email, u.phone || "—", u.role, u.is_active ? "Active" : "Inactive",
  u.role === "pmo" ? "All projects" : u.role === "guest" ? `All projects (can comment)${asg(u) ? ` · PM on ${asg(u)}` : ""}` : asg(u) ? `${asg(u)} project${asg(u) === 1 ? "" : "s"}` : "None assigned"]) };
const dl2 = (k) => sep.headline[k] - aug.headline[k];
out.s15_board = { list: [`Monthly Board Report: September 2026 — Published · figures as at 1 Oct 2026 · published 2 Oct 2026 · shared with ${board_report_recipients.length}, opened by ${board_report_recipients.filter(x => x.seen_at).length}`, `Baseline: August 2026 — Baseline · reconstructed · figures as at 1 Sep 2026`],
  sepTiles: { "Total CAPEX portfolio": fmtM(sep.headline.df_total), Approved: `${fmtM(sep.headline.approved_bac)} (${sep.headline.approved_count} projects)`, Released: fmtM(sep.headline.released_total),
    "Approved not yet released": fmtM(sep.headline.approved_not_released), "Of which PMDC": fmtM(sep.headline.pmdc_df), "Investment (outside CAPEX)": fmtM(sep.headline.investment_df) },
  sinceAugust: { approved_bac: fmtM(dl2("approved_bac")), released_total: fmtM(dl2("released_total")), approved_count: dl2("approved_count") }, note: sepNote };
out.s16_team = { about: settings.find(s => s.key === "about_us").value, members: Object.entries(settings.find(s => s.key === "team_config").value).map(([k, v]) => `${k}: ${v.name}`), contact: settings.find(s => s.key === "contact_info").value };
const docs = ATT.filter(a => a.project_id === story.id && a.kind === "document").sort((a, b) => a.sort_order - b.sort_order);
out.s17_documents = { header: `Attachments (${docs.length})`, files: docs.map(a => a.file_name) };
out.s18_wbs = { header: `Work Breakdown · ${project_tasks.length} tasks`, weighted: roll.weighted_pct, phases: PH.map(ph => { const kids = project_tasks.filter(t => t.parent_id === ph.id); const w = (t) => Math.max(day(t.end_date) - day(t.start_date), 1);
  return `${ph.name}: ${Math.round(sum(kids, t => t.pct_complete * w(t)) / sum(kids, w))}% (${ph.status})`; }), slip: `${SLIP_TASK} +${day(slipTask.end_date) - day(slipTask.baseline_end)}d (baseline ${dmy(slipTask.baseline_end)}, now ${dmy(slipTask.end_date)})`, milestone: "Handover of the Study Hub, 29 Dec" };
out.dash = dash; out.investment = im;
const assignCampus = compareRows.find(x => x.slot === ASSIGN_CAMPUS);
const assignClosed = capex.filter(p => p._slot === ASSIGN_CAMPUS && p.workflow_stage === "closed").length;
out.s13_assign = { campus: assignCampus.campus, pm: PM[ASSIGN_PM].full_name, preview: [`${assignCampus.noPm} project${assignCampus.noPm === 1 ? "" : "s"} will be assigned`, `${assignCampus.projects - assignCampus.noPm} left alone — already has a PM`], closedSkipped: assignClosed, sites: `${assignCampus.campus}: ${assignCampus.projects} projects` };

// The ledger of negative items per manager (checked below).
const ledgerFor = (slot) => {
  const mine = projects.filter(p => p._pm === slot), pastMine = past_projects.filter(p => p._pm === slot);
  const delayed = mine.filter(p => perfRows.find(q => q.id === p.id)?.schedule_flag === "delayed").map(p => p._key);
  const finish = mine.filter(p => p.workflow_stage === "approved" && p.end_date < TODAY && !p.actual_end_date).map(p => p._key);
  const over = mine.filter(p => perfRows.find(q => q.id === p.id)?.budget_flag === "over").map(p => p._key);
  const noProg = pastMine.filter(p => p.reason_open === "No progress").map(p => p.code);
  const highRisk = project_risks.filter(x => ["high", "critical"].includes(sevOf(x.probability, x.impact)) && mine.some(p => p.id === x.project_id)).map(x => projects.find(p => p.id === x.project_id)._key);
  // a chase = a PMO message that asks the manager for something (a question or a "Please ...")
  const chases = [...past_project_updates, ...past_pm_messages, ...comments].filter(m => m.author_id === PMO.id && /\?|\bplease\b/i.test(m.body) && (mine.some(p => p.id === m.project_id) || pastMine.some(p => p.id === m.past_project_id) || m.pm_user_id === PM[slot].id)).length;
  const negProjects = new Set([...delayed, ...finish, ...over, ...highRisk]);
  return { slot, fy: mine.filter(p => p.portfolio === "capex").length, inv: mine.filter(p => p.portfolio === "investment").length, past: pastMine.length, delayed, finish, over, noProgress: noProg, highRisk, chases, negativeFyProjects: [...negProjects] };
};
out.ledger = Object.keys(PM_HOME).map(ledgerFor);

/* ══ Narration ═══════════════════════════════════════════════════════════ */
// Captions show the line as written; speech is what the voice says ("P M D C", numbers as words).
// Tokens appear only in the lines that name a campus (scene 12) or the story PM (scenes 15, 16).
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const say99 = (n) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
const say999 = (n) => n < 100 ? say99(n) : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + say99(n % 100) : ""}`;
const sayM = (v) => { const [i, d] = (v / 1e6).toFixed(1).split("."); return `${say999(Number(i))}${d !== "0" ? " point " + ONES[Number(d)] : ""}`; };
const tok = (s) => s.replace(/[—–]/g, " ").split(/[\s-]+/).map(w => w.replace(/[^A-Za-z0-9']/g, "")).filter(Boolean).length;   // as a voice speaks it
const leader = byRel[0], h2hA = out.s08_compare.h2h.leaders.approved, h2hR = out.s08_compare.h2h.leaders.released;
const sayC = (t) => t.replace("}}", ":say}}");
const nDelayed = out.s06_performance.pills.Delayed;
const nCampuses = compareRows.length;
const toAssign = assignCampus.noPm, leftAlone = assignCampus.projects - assignCampus.noPm - assignClosed;
const total1 = (dash.total_capex / 1e6).toFixed(1), released1 = (dash.budget_consumed / 1e6).toFixed(1);
// [id, scene, chapter, caption, speech, short {caption, speech} | null, minHold s, sample variant | undefined]
const LINES = [
  ["s01", 1, 1, `The real portal: real names, fictional projects. Capex dashboard: ${total1} million rupees.`, `The real portal: real names, fictional projects. Capex dashboard: ${sayM(dash.total_capex)} million rupees.`, null, 9.1,
    { caption: `The real portal, on fictional data. Capex dashboard: ${total1} million rupees.`, speech: `The real portal, on fictional data. Capex dashboard: ${sayM(dash.total_capex)} million rupees.` }],
  ["s02", 2, 1, "Investments sit apart, never counted in Capex.", null, { caption: "Investments sit apart.", speech: null }, 4.3],
  ["s03", 3, 1, `PDD Status: ${ONES[dash.in_mt]} wait with the Managing Trustee.`, `P D D Status: ${ONES[dash.in_mt]} wait with the Managing Trustee.`, { caption: `${ONES[dash.in_mt][0].toUpperCase() + ONES[dash.in_mt].slice(1)} wait with the Managing Trustee.`, speech: null }, 4.0],
  ["s04", 4, 1, `Payments Status: ${released1} million released, project by project.`, `Payments Status: ${sayM(dash.budget_consumed)} million released, project by project.`, { caption: `${released1} million released.`, speech: `${sayM(dash.budget_consumed)} million released.` }, 6.0],
  ["s05", 5, 1, "Cashflows: the monthly plan, PMDC shown apart.", "Cashflows: the monthly plan, P M D C shown apart.", { caption: "Cashflows: the monthly plan.", speech: null }, 4.0],
  ["s06", 6, 2, "Projects filters as you type. Let's open the Study Hub.", null, { caption: "Let's open the Study Hub.", speech: null }, 4.0],
  ["s07", 7, 2, "Every document for the project, in one place.", null, { caption: "Every document, in one place.", speech: null }, 4.3],
  ["s08", 8, 2, "The work breakdown shows the study pods twenty days behind baseline.", null, { caption: "The study pods: twenty days behind baseline.", speech: null }, 4.3],
  ["s09", 9, 3, `Performance: ${ONES[nDelayed]} projects delayed, the Study Hub among them.`, null, { caption: `Performance: ${ONES[nDelayed]} delayed.`, speech: null }, 4.0],
  ["s10", 10, 3, "Timeline and Schedule puts every project on one calendar.", null, { caption: "Every project on one calendar.", speech: null }, 4.5],
  ["s11", 11, 3, "The Risk Register: this cell holds the study pod risk.", null, { caption: "This cell holds the study pod risk.", speech: null }, 4.3],
  ["s12a", 12, 4, `Compare puts all ${ONES[nCampuses]} campuses side by side.`, null, { caption: `All ${ONES[nCampuses]} campuses, side by side.`, speech: null }, 3.3],
  ["s12b", 12, 4, `Ranked by share released, ${leader.campus} leads at ${Math.round(leader.releasedRate * 100)} percent.`, `Ranked by share released, ${sayC(leader.campus)} leads at ${say99(Math.round(leader.releasedRate * 100))} percent.`, { caption: "Ranked by share released.", speech: null }, 3.2],
  ["s12c", 12, 4, `Head to head: ${h2hA[0]} leads approved, ${h2hR[0]} released.`, `Head to head: ${sayC(h2hA[0])} leads approved, ${sayC(h2hR[0])} released.`, { caption: "Head to head, side by side.", speech: null }, 4.5],
  ["s13a", 13, 4, "Each site lists its managers.", null, null, 4.6],
  ["s13b", 13, 4, `Assign PM previews first: ${ONES[toAssign]} to assign, ${ONES[leftAlone]} left alone.`, `Assign P M previews first: ${ONES[toAssign]} to assign, ${ONES[leftAlone]} left alone.`, { caption: "Assign PM previews the change.", speech: "Assign P M previews the change." }, 4.4],
  ["s14", 14, 4, "User Management: accounts, roles and assigned projects.", null, { caption: "Accounts, roles and projects.", speech: null }, 4.3],
  ["s15", 15, 5, `In Updates, ${PS(STORY_PM)} replies: handover on 29 December still holds.`, `In Updates, ${PY(STORY_PM)} replies: handover on twenty-nine December still holds.`, { caption: `${PS(STORY_PM)} replies: handover still holds.`, speech: `${PY(STORY_PM)} replies: handover still holds.` }, 4.5],
  ["s16", 16, 5, `Past Projects follows up older projects; Unread finds ${PS(STORY_PM)}'s reply.`, `Past Projects follows up older projects; Unread finds ${PY(STORY_PM)}'s reply.`, { caption: `Unread finds ${PS(STORY_PM)}'s reply.`, speech: `Unread finds ${PY(STORY_PM)}'s reply.` }, 6.0],
  ["s17", 17, 5, "The Gallery: site-visit pictures, newest first.", null, { caption: "Site-visit pictures, newest first.", speech: null }, 4.2],
  ["s18", 18, 6, "Board Reports: month-end figures, shared as a report.", null, { caption: "Month-end board reports.", speech: null }, 5.0],
  ["s19", 19, 6, "Team and About: who we are, how to reach us.", null, { caption: "Who we are, how to reach us.", speech: null }, 4.6],
  ["s20", 20, 6, "That's the portal. Thank you.", null, { caption: "Thank you.", speech: null }, 3.0],
];
const narration = LINES.map(([id, scene, chapter, caption, speech, short, minHold, sample]) => ({ id, scene, chapter, caption, speech: speech || caption,
  short: short ? { caption: short.caption, speech: short.speech || short.caption } : null, minHold, ...(sample ? { sample } : {}) }));
const CHAPTERS = [[1, "Portfolio"], [2, "Inside a project"], [3, "Delivery"], [4, "Sites and people"], [5, "Follow-up"], [6, "Reporting and team"]];
// Timing model (plan §4): scene = max(speech + n x latency + (n-1) x 0.25 s + 0.35 s, sum of minHolds).
function timing(lines, wpm = 135, lat = 0.3) {
  let t = 0; const scenes = [];
  for (let s = 1; s <= 20; s++) {
    const u = lines.filter(l => l.scene === s); const speech = u.reduce((a, l) => a + l.tokens * 60 / wpm, 0) + u.length * lat + (u.length - 1) * 0.25 + 0.35;
    const vis = u.reduce((a, l) => a + l.minHold, 0); const dur = Math.max(speech, vis);
    scenes.push({ scene: s, chapter: u[0].chapter, start: +t.toFixed(1), dur: +dur.toFixed(2), bound: speech >= vis ? "speech" : "visual" }); t += dur;
  }
  return { total: +t.toFixed(1), scenes };
}

/* ══ Meta for the director (exact field names are the contract) ═════════ */
const hostOf = Object.fromEntries(MEDIA_HOSTS.map(h => [h.slot, h.project_id]));
const newestHost = [...MEDIA_HOSTS].sort((a, b) => b.visits[0][0].localeCompare(a.visits[0][0]))[0].slot;
const storyUser = PM[STORY_PM];
const meta = {
  v: 1, now: NOW, today: TODAY, timeZone: "Asia/Karachi", filesBase: "sim/files/",
  pmo: { id: PMO.id, username: PMO.username, full_name: PMO.full_name, email: PMO.email, role: "pmo" },
  badge: "Simulation · real names, fictional projects and figures · nothing is sent",
  sampleBadge: "Simulation · sample names · fictional data · nothing is sent",
  storyPmSlot: STORY_PM, storyCampusSlot: STORY_CAMPUS, storyPmUserId: storyUser.id,
  storyProjectId: story.id, storyProjectName: story.name, storyProjectCode: story.code,
  storySearch: SEARCH,
  storyPastId: storyPast.id, storyPastName: storyPast.name,
  storyRiskId: storyRisk.id, riskCell: RISK_CELL,
  storySlipTaskId: slipTask.id, storySlipPhaseId: slipTask.parent_id, storyCollapsePhaseId: PH[0].id,
  storyDocumentId: docs[0].id, storyDocumentName: docs[0].file_name,
  compareSortCol: "released", compareDefaultPicked: [byDf[0].campus, byDf[1].campus],
  h2hThirdCampusSlot: H2H_THIRD, h2hThirdCampus: CT(H2H_THIRD), h2hCampuses: h2h.map(x => x.campus),
  assignCampusSlot: ASSIGN_CAMPUS, assignCampus: CT(ASSIGN_CAMPUS), assignPmSlot: ASSIGN_PM, assignPmUserId: PM[ASSIGN_PM].id, assignPmUsername: PM[ASSIGN_PM].username,
  assignPreview: { toAssign, leftAlone, closedSkipped: assignClosed, lines: out.s13_assign.preview },
  galleryFirstHost: newestHost, galleryHosts: hostOf, galleryFirstProjectId: hostOf[newestHost],
  reportId: sepId, reportBaselineId: augId, reportTitle: board_reports[1].title,
  teamKeys: TEAM_KEYS,
  usersStoryUsername: storyUser.username, usersStoryUserId: storyUser.id,
  updatesStoryProjectId: story.id, updatesStoryCommentIds: [storyQ.id, storyReply.id, storyReply2.id], updatesStoryReplyId: storyReply.id,
  starters: [`What are the risks on the ${story.name}?`, "Where do we stand overall?", "Which projects are at MT review?", "How much has been released this year?"],
  chapters: [], scenes: [],
  expect: {},
};
// What each scene's ready check should see on screen (text fragments; tokens resolved with the cast).
meta.expect = {
  1: { heroVerdict: out.s01_overview.hero.verdict, total: out.s01_overview.hero.total, totalSub: out.s01_overview.hero.sub, dfCard: out.s01_overview.cards["DF Recommended"][0], dfCardSub: out.s01_overview.cards["DF Recommended"][1] },
  2: { register: out.s03_investments.registerHeader, approved: out.s03_investments.tiles.Approved, heroTotal: out.s01_overview.hero.total },
  3: { mtTile: String(dash.in_mt), mtTileSub: "With Managing Trustee", listHeader: `${stageN("mt_review")} projects` },
  4: { released: out.s04_payments.cards["Budget Released"][0], releasedSub: out.s04_payments.cards["Budget Released"][1], listHeader: `${rel.length} projects` },
  5: { pmdc: out.s09_cashflows.tiles["of which PMDC"][0], pmdcSub: out.s09_cashflows.tiles["of which PMDC"][1], peakMonth: out.s09_cashflows.tiles["Peak month"][0], peakValue: out.s09_cashflows.tiles["Peak month"][1] },
  6: { all: out.s05_projects.all, searchRows: String(searchHits.length), storyCode: story.code, storyName: story.name },
  7: { header: out.s17_documents.header, files: out.s17_documents.files },
  8: { header: out.s18_wbs.header, slipTask: SLIP_TASK, slip: `+${day(slipTask.end_date) - day(slipTask.baseline_end)}d`, rows: String(project_tasks.length) },
  9: { filter: "delayed", showing: `Showing ${nDelayed} projects`, storyName: story.name },
  10: { scheduled: `${capex.length} scheduled`, hover: out.s10_timeline.story.hover, progress: `${story.pct_complete}%` },
  11: { header: out.s07_risks.header, cell: RISK_CELL, cellCount: String(cellRisks.length), listCount: out.s07_risks.listCount, storyRiskTitle: storyRisk.title },
  12: { caption: out.s08_compare.caption, rows: String(compareRows.length), firstAfterSort: leader.campus, leaderPct: pct0(leader.releasedRate), h2hColumns: "3", h2hApprovedLeader: h2hA[0], h2hReleasedLeader: h2hR[0] },
  13: { pms: h2h.map(x => x.pms), sitesProjects: String(assignCampus.projects), preview: out.s13_assign.preview[0], previewLeft: out.s13_assign.preview[1] },
  14: { users: String(USERS.length), storyUser: storyUser.username },
  15: { badge: String(out.s11_updates.badge), storyNew: out.s11_updates.storyNew, reply: "handover on 29 December still holds" },
  16: { unread: "1", thread: out.s12_past.unread.thread, project: storyPast.name },
  17: { minTiles: "12", minTilesNote: "or every handed-over item when fewer than 12", firstHost: newestHost },
  18: { title: board_reports[1].title, shared: `shared with ${board_report_recipients.length}, opened by ${board_report_recipients.filter(x => x.seen_at).length}`, asAt: "as at 30 Sep 2026" },
  19: { headPmo: TT("head_pmo"), contactEmail: "pmo@simulation.example" },
  20: {},
};
const seedPublic = { v: 1, NOW, meta, pmo: meta.pmo, storyId: story.id,
  slots: { campuses: CAMPUS_SLOTS, pms: Object.fromEntries(Object.entries(PM_HOME).map(([s, c]) => [s, { home: c, role: PM[s].role, user_id: PM[s].id, username: PM[s].username }])),
    team: TEAM_KEYS, teamUsers: Object.fromEntries(TEAM_USERS.map(u => [u._team, u.id])), story: { project_id: story.id, pm: STORY_PM, campus: STORY_CAMPUS } },
  media_plan, tables };

/* ══ Checks ══════════════════════════════════════════════════════════════ */
const ok = []; const chk = (name, cond) => ok.push([cond ? "PASS" : "FAIL", name]);
const appr = isA;
const narrFor = (cast) => resolveTokens(narration, cast).map(l => ({ ...l, tokens: tok(l.speech), shortTokens: l.short ? tok(l.short.speech) : null }));
const narrSample = narrFor(SAMPLE_CAST);
const timeSample = timing(narrSample);
meta.scenes = timeSample.scenes;
meta.chapters = CHAPTERS.map(([n, title]) => { const s = timeSample.scenes.filter(x => x.chapter === n); return { n, title, start: s[0].start, end: +(s.at(-1).start + s.at(-1).dur).toFixed(1), scenes: s.map(x => x.scene) }; });
const narrationOut = { v: 1, meta: { wpm: 135, startDelay: 0.3, chapters: meta.chapters, starters: meta.starters }, lines: narration };

// 1. Totals, stages and money
chk("CAPEX 50 + investment 3", capex.length === 50 && inv.length === 3);
chk("Total CAPEX == DF sum == portfolio_dashboard.total_capex", dash.total_capex === sum(capex, p => p.df_recommended_amount));
chk("bac > 0 only on approved/closed (all portfolios)", projects.every(p => appr(p) ? p.bac > 0 : p.bac === 0));
chk("bac <= DF on every project", projects.every(p => p.bac <= p.df_recommended_amount));
chk("released <= bac on approved; released only where a release date is set", projects.every(p => (!appr(p) || p.amount_released <= p.bac) && ((p.amount_released > 0) === !!p.budget_release_date)));
chk("actual_start_date == budget_release_date (trg_sync_actual_start)", projects.every(p => !p.budget_release_date || p.actual_start_date === p.budget_release_date));
chk("payments_made <= released", projects.every(p => p.payments_made <= p.amount_released));
chk("actual_cost == amount_released on approved/closed (Performance AC column == CPI basis)", projects.every(p => appr(p) ? p.actual_cost === p.amount_released : p.actual_cost === 0));
chk("pct > 0 only on approved/closed with release", projects.every(p => p.pct_complete === 0 || (appr(p) && p.amount_released > 0)));
chk("closed: pct 100, actual_end set, pcd set", capex.filter(p => p.workflow_stage === "closed").every(p => p.pct_complete === 100 && p.actual_end_date && p.pcd_received_date));
chk("duration_months == calcDurationMonths(start,end)", projects.every(p => p.duration_months === months(p.start_date, p.end_date)));
chk("no SPI or CPI in [0.95,1.00) on any row (cards say 0.95, thresholds are 1)", M.every(m => !(m.spi >= 0.95 && m.spi < 1) && !(m.cpi >= 0.95 && m.cpi < 1)));
chk("payments pending: released == bac and paid 0", projects.filter(p => p.payments_pending).every(p => p.amount_released === p.bac && p.payments_made === 0));
chk("released before approval only at MT review (pharmacy automation)", capex.filter(p => !appr(p) && p.amount_released > 0).map(p => p._key + p.workflow_stage).join() === "M1mt_review");
chk(`hero verdict consistent: '${out.s01_overview.hero.verdict}' (CPI ${dash.portfolio_cpi}, SPI ${dash.portfolio_spi}) is 'Attention Required' with CPI Healthy`, healthOf(dash.portfolio_cpi, dash.portfolio_spi) === "Attention Required" && perfStatus(dash.portfolio_cpi) === "Healthy");
chk(`Performance strip CPI ${out.s06_performance.strip.CPI} / SPI ${out.s06_performance.strip.SPI} in the same colour bands as the hero`, EV / AC >= 0.95 && EV / PV >= 0.90 && EV / PV < 0.95 && perfStatus(EV / PV) === perfStatus(dash.portfolio_spi));
chk("Delayed = 2 (the story project and one project without a PM), Over budget = 0, no investment row flagged", nDelayed === 2 && out.s06_performance.pills["Over Budget"] === 0
  && perfRows.find(p => p.id === story.id).schedule_flag === "delayed" && perfRows.filter(p => p.schedule_flag === "delayed").every(p => p.id === story.id || !pmOf.has(p.id))
  && perfRows.filter(p => p.portfolio === "investment").every(p => p.schedule_flag === "on_time" && p.budget_flag === "within"));
chk("dashboard delayed/on-time counts == Performance pills on approved CAPEX rows", dash.delayed_count === perfRows.filter(p => p.portfolio === "capex" && p.workflow_stage === "approved" && p.schedule_flag === "delayed").length
  && dash.on_time_count === perfRows.filter(p => p.portfolio === "capex" && p.workflow_stage === "approved" && p.schedule_flag === "on_time").length);
chk("scatter: >= 10 CAPEX projects plot with both CPI and SPI, in at least 2 quadrants", (() => { const pl = M.filter(p => p.portfolio === "capex" && p.cpi > 0 && p.spi > 0); const q = new Set(pl.map(p => `${p.cpi >= 1}${p.spi >= 1}`)); return pl.length >= 10 && q.size >= 2; })());
// 2. Cash-flow plan
chk("cash plan capex+pmdc == Total CAPEX DF; investment plan == investment DF", sum(capPlan, c => c.amount) === dash.total_capex && invPlan === sum(inv, p => p.df_recommended_amount));
chk("cash rows per project sum to its DF", projects.every(p => sum(project_cashflows.filter(c => c.project_id === p.id), c => c.amount) === p.df_recommended_amount));
chk("PMDC rows only on CAPEX; investment rows only on investment; a PMDC project has only PMDC rows", project_cashflows.every(c => (c.bucket === "investment") === (projects.find(p => p.id === c.project_id).portfolio === "investment"))
  && projects.filter(p => p._pmdc).every(p => project_cashflows.filter(c => c.project_id === p.id).every(c => c.bucket === "pmdc")));
chk("PMDC concentrated in 3-4 months (Cashflows fixed text)", out.s09_cashflows.pmdcMonths.length >= 3 && out.s09_cashflows.pmdcMonths.length <= 4);
chk("Cashflows PMDC tile == board report 'Of which PMDC'", pmdcTot === oct.headline.pmdc_df);
chk("cash-flow labels use production spellings", out.s09_cashflows.priorities.join() === "1st Priority,2nd Priority,3rd Priority" && out.s09_cashflows.types.every(t => [CW, EQ, SW].includes(t)));
chk("every plan month inside FY 26-27", project_cashflows.every(c => FYM.includes(c.month)));
chk("monthly plan has a visible shape (peak month >= 1.5x the FY average)", (peak.capex + peak.pmdc) >= 1.5 * capTot / 12);
chk("every release date inside FY 26-27", capex.filter(p => p.budget_release_date).every(p => p.budget_release_date >= "2026-07-01" && p.budget_release_date <= TODAY));
// 3. Deliverables, PDDs, KPIs
chk("deliverable lines per project == linked PDD grand total and <= DF", DELIV_KEYS.every(k => sum(project_deliverables.filter(d => d.project_id === byKey(k).id), d => d.total) === sumItems(k) && sumItems(k) <= byKey(k).df_recommended_amount));
chk("deliverables only where project_has_deliverables (approved PDD linked)", new Set(project_deliverables.map(d => d.project_id)).size === epdd_pdds.filter(e => ["PMO Approved", "All Approved"].includes(e.epdd_status) && e.linked_project_id).length);
chk("story deliverables: 4 of 8 delivered", project_deliverables.filter(d => d.project_id === story.id).length === 8 && project_deliverables.filter(d => d.project_id === story.id && d.status === "delivered").length === 4);
chk("incoming PDD: rules-3 verdict needs_changes with exactly one fail (budget), auto-linked", rv.verdict === "needs_changes" && rv.checks.filter(c => c.status === "fail").map(c => c.id).join() === "budget" && rv.linkSource === "auto" && incoming.linked_project_id === N1.id);
chk("PMO Review badge == 1", epdd_pdds.filter(e => !e.is_history && !e.seen_at && e.queue !== "removed").length === 1);
chk("PDDs: every initiator is 'Campus office (sample)'; approval names are role labels", epdd_pdds.every(e => e.initiated_by === "Campus office (sample)" && !e.initiated_by_email && e.approvals.every(a => ["PMO reviewer", "PMO"].includes(a.name))));
chk("SU list total == card; budget_reduction == SU list - DF", settings[0].value.su_requested.value === (suTotal / 1e6).toFixed(2) + "M" && settings[0].value.budget_reduction.value === ((suTotal - dash.total_capex) / 1e6).toFixed(2) + "M");
chk("carry forward card live (value '') == list total", settings[0].value.carry_forward.value === "" && cfTotal === sum(carry_forward_projects, c => c.amount));
chk("Approved Projects hover text == card", settings[0].value.approved_projects.insight.includes(`${apprRows.length} of ${capex.length}`));
// 4. Board reports
chk("board replay: Sep headline recomputes identically", JSON.stringify(computeFigures(reportRows(sepB), { ym: "2026-09", asAt: periodOf("2026-09").end, builtAt: sepB, compare: augRep }).headline) === JSON.stringify(sep.headline));
chk("Sep report: risks snapshot as at its build date", sep.risks.open === project_risks.filter(x => x.created_at < sepB).length && sep.risks.last_reviewed <= sepB.slice(0, 10));
chk("board replay at NOW reproduces live rows (no log entry after NOW)", activity_log.every(e => e.created_at < NOW));
chk("board Oct headline == dashboard (count, DF, released)", oct.headline.capex_count === capex.length && oct.headline.df_total === dash.total_capex && oct.headline.released_total === dash.budget_consumed);
chk("board Aug baseline replays the logged 'old' values", aug.headline.approved_count === apprRows.length - 3 && aug.stages.find(s => s.stage === "closed").count === 1);
chk("Sep report: released this month == sum of Sep release log entries", sep.month.released === sum(activity_log.filter(e => e.created_at.startsWith("2026-09") && e.details.new.amount_released), e => e.details.new.amount_released - e.details.old.amount_released));
chk("Sep report recipients: 3 senior management viewers (placeholders), 2 opened, PMO not a recipient", board_report_recipients.length === 3 && board_report_recipients.filter(x => x.seen_at).length === 2 && board_report_recipients.every(x => { const u = USERS.find(v => v.id === x.user_id); return u.role === "guest" && !isRealSlotUser(u) && /^Senior management viewer \d$/.test(u.full_name); }));
chk("Sep report note quotes the report's own figures", sepNote.includes(fmtMr(sep.month.released)) && sep.moved_to_approved.every(x => sepNote.includes(x.name)) && sepNote.includes(`${sepMt.count} projects worth PKR ${fmtMr(sepMt.df)}`));
// 5. Risks
chk("risks: one per project, 0 critical, 8 of 9 matrix cells used (high x high empty)", new Set(project_risks.map(x => x.project_id)).size === project_risks.length && out.s07_risks.bySeverity.critical === 0
  && Object.entries(cells).filter(([k, n]) => n > 0).length === 8 && cells["high-high"] === 0);
chk("risks: high severity only on the story project or on projects without a PM", project_risks.filter(x => sevOf(x.probability, x.impact) === "high").every(x => x.project_id === story.id || !pmOf.has(x.project_id)));
chk("risks: all open or monitoring", project_risks.every(x => ["open", "monitoring"].includes(x.status)) && open.length === project_risks.length);
chk("risks: date_identified varied, <= last reviewed <= today; owner is the story PM on the story project, else the PMO", new Set(project_risks.map(x => x.date_identified)).size >= 15 && project_risks.every(x => x.date_identified <= x.date_last_reviewed && x.date_last_reviewed <= TODAY)
  && project_risks.every(x => x.owner === ownerOf(projects.find(q => q.id === x.project_id))));
chk(`story risk is High (${RISK_CELL}), vendor/shipping, owned by the story PM, created by the PMO account`, sevOf(storyRisk.probability, storyRisk.impact) === "high" && storyRisk.category === "vendor" && storyRisk.owner === PT(STORY_PM) && storyRisk.created_by_name === PMO.username);
chk("risks: no real manager other than the story PM owns a risk (only the story risk names a person)", project_risks.every(x => x.owner === "Project Management Office" || (x.project_id === story.id && x.owner === PT(STORY_PM))));
chk("risks: no media host project carries a risk", !project_risks.some(x => MEDIA_HOST_KEYS.some(k => byKey(k).id === x.project_id))
  && MEDIA_HOSTS.map(h => h.key).sort().join() === [...MEDIA_HOST_KEYS].sort().join());
// 6. Compare demonstration (real campus list)
const cr = (s) => compareRows.find(x => x.slot === s);
chk("Compare: every campus with CAPEX in production appears (11 rows, investment-only campus absent)", compareRows.length === 11 && !compareRows.some(x => x.slot === "C12"));
chk("Compare: CAPEX campus sizes keep the real order (C01 > C06 > C03 > C04 > C02 > C07 ...)", ["C01", "C06", "C03", "C04", "C02", "C07"].every((s, i, a) => i === 0 || cr(a[i - 1]).projects >= cr(s).projects));
chk("Compare: the two largest by DF (pre-ticked) are C01 and C03; the third ticked is C06", byDf.slice(0, 2).map(x => x.slot).join() === "C01,C03" && H2H.join() === "C01,C03,C06");
chk(`Compare: released-share leader ${leader.slot} at ${pct0(leader.releasedRate)}, spread >= 30 points, distinct among campuses with releases`, (() => { const v = compareRows.filter(x => x.released > 0).map(x => Math.round(x.releasedRate * 100)); return Math.max(...v) - Math.min(...v) >= 30 && new Set(v).size === v.length; })());
chk("Compare: the narrated leaders (released share, head-to-head approved and released) are campuses with no delayed, finish-passed or high-risk project", [leader, ...h2hA.concat(h2hR).map(c => compareRows.find(x => x.campus === c))].every(x => x && (x.slot === STORY_CAMPUS || (x.delayed === 0 && x.pastFinish === 0 && x.highRisks === 0))));
chk(`Head to head: one leader each (approved ${h2hA.join("/")}, released ${h2hR.join("/")})`, h2hA.length === 1 && h2hR.length === 1);
chk("Compare: the third head-to-head campus has no negatives (no delay, finish passed, high risk)", cr(H2H_THIRD).delayed === 0 && cr(H2H_THIRD).pastFinish === 0 && cr(H2H_THIRD).highRisks === 0);
chk("Compare: 'No PM' only where production has it (C02 2, C05 2, C06 2)", compareRows.filter(x => x.noPm).map(x => `${x.slot}:${x.noPm}`).sort().join() === "C02:2,C05:2,C06:2");
chk("Compare: 'Planned finish passed' only on a project without a PM (C05)", compareRows.filter(x => x.pastFinish).map(x => `${x.slot}:${x.pastFinish}`).join() === "C05:1"
  && capex.filter(p => p.workflow_stage === "approved" && p.end_date < TODAY && !p.actual_end_date).every(p => !p._pm));
chk("Compare: deliverables on 5 campuses, ticked rates spread >= 40 points", compareRows.filter(x => x.delivLines).length === 5 && (() => { const v = compareRows.filter(x => x.delivLines).map(x => x.delivDone / x.delivLines); return Math.max(...v) - Math.min(...v) >= 0.4; })());
chk("Compare: approved rate spread >= 25 points", Math.max(...compareRows.map(x => x.approvedRate)) - Math.min(...compareRows.map(x => x.approvedRate)) >= 0.25);
chk(`Assign PM at ${ASSIGN_CAMPUS} with ${ASSIGN_PM}: ${toAssign} to assign, ${leftAlone} left alone, none closed; the PM is that campus's manager`, toAssign === 2 && leftAlone >= 5 && assignClosed === 0 && projects.filter(p => p._slot === ASSIGN_CAMPUS && p._pm).every(p => p._pm === ASSIGN_PM));
chk("every CAPEX project has a campus and fiscal_year FY 26-27", capex.every(p => p.campus && p.fiscal_year === FY));
chk("Projects search for the story finds exactly the story project", searchHits.length === 1 && searchHits[0].id === story.id);
// 7. People
chk("each project has at most one PM; assignees are active project managers, or the one guest who manages projects", project_assignments.every(a => { const u = USERS.find(x => x.id === a.user_id); return u.is_active && (u.role === "project_manager" || u._slot === GUEST_PM); }) && new Set(project_assignments.map(a => a.project_id)).size === project_assignments.length);
chk("site-wise managers: one per campus except C03 (2) and C12 (2, investment); none at C05; each manager only on the home campus", Object.entries(PM_HOME).every(([s, home]) => projects.filter(p => p._pm === s).every(p => p._slot === home))
  && CAMPUS_SLOTS.every(c => new Set(projects.filter(p => p._slot === c && p._pm).map(p => p._pm)).size === (["C03", "C12"].includes(c) ? 2 : c === "C05" ? 0 : 1)));
chk("the guest-with-assignments slot stays a guest", PM[GUEST_PM].role === "guest");
chk("Users: one inactive account, a retired shared login (not a person), with no assignments", USERS.filter(u => !u.is_active).length === 1 && !project_assignments.some(a => a.user_id === FORMER.id) && !isRealSlotUser(FORMER));
chk("Users: PMO account is 'Project Management Office'; team guests only for team members with a production guest account; other guests are 'Senior management viewer N'",
  PMO.full_name === "Project Management Office" && TEAM_USERS.every(u => PINS.teamAccounts[u._team]) && USERS.filter(u => u.role === "guest" && !isRealSlotUser(u)).every(u => /^Senior management viewer \d$/.test(u.full_name)));
chk("Users: every username sim.* (PMO pmo.sim), every email on simulation.example, no phone, no WhatsApp opt-in", USERS.every(u => (u === PMO ? u.username === "pmo.sim" : /^sim\./.test(u.username)) && u.email === `${u.username}@simulation.example` && u.phone == null && !u.whatsapp_opt_in));
chk("no sessions, devices, tour, push or notification rows for anyone", ["user_sessions", "session_events", "tour_events", "notifications_log", "push_subscriptions", "user_webauthn_credentials"].every(t => tables[t].length === 0));
// 8. Updates, past projects
chk("Updates: 2 unread replies, both on the story project, from the story PM", unreadC.length === 2 && unreadC.every(c => c.project_id === story.id && c.author_id === PM[STORY_PM].id));
chk("Updates: every message is from the PMO except the story PM's replies on the story project", comments.every(c => c.author_id === PMO.id || (c.author_id === PM[STORY_PM].id && c.project_id === story.id)));
chk("Updates: every reply's parent is in the same project and earlier", comments.filter(c => c.parent_id).every(c => { const p = comments.find(x => x.id === c.parent_id); return p && p.project_id === c.project_id && p.created_at < c.created_at; }));
chk("Updates: is_read_by_pmo agrees with the PMO's comment_reads", comments.filter(c => c.author_role !== "pmo").every(c => c.is_read_by_pmo === comment_reads.some(x => x.comment_id === c.id)));
chk("Updates: story thread agrees with WBS, deliverables and risk (30 Nov customs, 4 of 8 items, +20d, 29 Dec handover)", slipTask.end_date === "2026-11-30" && day(slipTask.end_date) - day(slipTask.baseline_end) === 20
  && storyReply.body.includes("4 of 8") && storyReply.body.includes("30 November") && storyReply.body.includes("20 days") && storyReply.body.includes("29 December") && story.end_date === "2026-12-29");
chk("past: FY spelled as production ('FY 24-25'), 3 fiscal years", past_projects.every(p => /^FY \d\d-\d\d$/.test(p.fiscal_year)) && new Set(past_projects.map(p => p.fiscal_year)).size === 3);
chk("past: open projects in all three age bands", Object.values(out.s12_past.ages).every(n => n >= 1));
chk("past: an open project over a year old (red on the page) belongs only to the story PM", pOpen.filter(p => ageKey(p) === "over a year").every(p => p._pm === STORY_PM));
chk("past: every other manager's open project is In Progress and had its budget released within the last year", pOpen.filter(p => p._pm !== STORY_PM).every(p => p.reason_open === "In Progress" && day(TODAY) - day(p.budget_release_date) <= 365));
chk("past: no 'No progress' anywhere (no past project lacks a PM)", past_projects.every(p => p.reason_open !== "No progress"));
chk("past: the guest-with-assignments slot has only open projects under a year old, In Progress, with no messages", past_projects.filter(p => p._pm === GUEST_PM).every(p => p.status === "open" && p.reason_open === "In Progress" && day(TODAY) - day(p.budget_release_date) < 365)
  && ![...past_project_updates, ...past_pm_messages].some(m => past_projects.find(p => p.id === m.past_project_id)?._pm === GUEST_PM || m.pm_user_id === PM[GUEST_PM].id));
chk("past: last_followed_up == day of the latest message where messages exist", past_projects.every(p => { const d = [...past_project_updates.filter(m => m.past_project_id === p.id), ...past_pm_messages.filter(m => m.past_project_id === p.id)].map(m => m.created_at.slice(0, 10)).sort().at(-1); return !d || p.last_followed_up === d; }));
chk("past: exactly 1 unread project for the PMO, 1 unread message, from the story PM on his own past project", (() => { const seen = Object.fromEntries(past_chat_reads.map(x => [x.thread, x.read_at])); let total = 0; const projs = new Set(); const auth = new Set();
  const add2 = (t, m) => { if (m.author_id === PMO.id) return; if (seen[t] && m.created_at <= seen[t]) return; total++; projs.add(m.past_project_id); auth.add(m.author_id); };
  past_pm_messages.forEach(m => add2(`pm:${m.pm_user_id}`, m)); past_project_updates.forEach(m => add2(`project:${m.past_project_id}`, m));
  return total === 1 && projs.size === 1 && projs.has(storyPast.id) && auth.has(PM[STORY_PM].id) && storyPast._pm === STORY_PM; })());
chk("past: messages only on the story PM's past projects", [...past_project_updates, ...past_pm_messages].every(m => (m.past_project_id ? past_projects.find(p => p.id === m.past_project_id)._pm === STORY_PM : true) && (!m.pm_user_id || m.pm_user_id === PM[STORY_PM].id)));
chk("past: closed rows read 'Closed/PCD Received'; released <= approved", past_projects.every(p => (p.status === "closed") === (p.reason_open === "Closed/PCD Received") && p.released_amount <= p.approved_amount));
chk("past-project age bands agree between the page and the board report", (() => { const pa = { under6: 0, "6to12": 0, over12: 0, undated: 0 };
  pOpen.forEach(p => { const d2 = day(TODAY) - day(p.budget_release_date); pa[d2 > 365 ? "over12" : d2 > 182 ? "6to12" : "under6"]++; }); return JSON.stringify(pa) === JSON.stringify(oct.past.ages); })());
// 9. WBS, documents
chk("WBS weighted progress == the project's % complete (38)", roll.weighted_pct === story.pct_complete && story.pct_complete === 38);
chk("WBS: 15 rows in 4 phases; phase status reflects its tasks", project_tasks.length === 15 && PH.every(ph => { const k = project_tasks.filter(t => t.parent_id === ph.id); return ph.status === (k.every(t => t.pct_complete === 100) ? "done" : k.every(t => t.pct_complete === 0) ? "not_started" : "in_progress"); }));
chk("WBS: tasks inside the project dates; one milestone on the planned end", project_tasks.filter(t => t.parent_id).every(t => t.start_date >= story.start_date && t.end_date <= story.end_date) && project_tasks.filter(t => t.is_milestone).map(t => t.end_date).join() === story.end_date);
chk("WBS: exactly one baseline slip (+20d, on an imported item), rollup committed end == planned end", project_tasks.filter(t => t.baseline_end && t.baseline_end !== t.end_date).length === 1 && slipTask.name.toLowerCase().includes("import") && roll.baseline_end === story.end_date && roll.tasks_end === story.end_date);
chk("WBS: delivered tasks agree with ticked deliverables", ["Group study furniture and lockers delivered", "Book stacks and lending stations delivered"].every(n => project_tasks.find(t => t.name === n).pct_complete === 100)
  && [2, 3, 4, 8].every(l => project_deliverables.find(d => d.project_id === story.id && d.line_no === l).status === "delivered"));
chk("documents: story project has 6 files of 3 types, uploaded by the PMO before today", docs.length === 6 && new Set(docs.map(a => a.mime_type)).size === 3 && docs.every(a => a.uploaded_by === PMO.id && a.uploaded_by_name === "Project Management Office" && a.uploaded_at < NOW));
chk("documents: file_path '<project_id>/<id>.<ext>', unique, and file_size == the generated file's bytes", new Set(ATT.map(a => a.file_path)).size === ATT.length
  && ATT.every(a => a.file_path === `${a.project_id}/${a.id}.${EXT[a.mime_type]}` && a.file_size > 0 && existsSync(FILES + a.file_path) && statSync(FILES + a.file_path).size === a.file_size));
chk("no PDD-not-submitted pop-up rows; at_risk_projects served empty (no deadline pop-up)", pddPending.length === 0 && tables.at_risk_projects.length === 0);
// 10. Media plan (sample media here; the real media in the private block below)
const sampleSeed = resolveTokens(seedPublic, SAMPLE_CAST);
const sampleRows = buildMediaRows(sampleSeed, sampleMedia);
const projS = (id) => sampleSeed.tables.projects.find(p => p.id === id);
chk("media hosts: generic 'Campus Works Package' names; no negative state; no high risk; not the story project", MEDIA_HOSTS.every(h => { const p = byKey(h.key); const m = perfRows.find(q => q.id === p.id);
  const rk = project_risks.find(x => x.project_id === p.id); return /^Campus Works Package [A-Z]$/.test(p.name) && h.key !== "A1" && (!m || (m.schedule_flag !== "delayed" && m.budget_flag !== "over")) && !(p.end_date < TODAY && p.workflow_stage === "approved") && (!rk || ["low", "medium"].includes(sevOf(rk.probability, rk.impact))); }));
chk("media hosts: every visit is after the host's release and before NOW (and before a closed host's actual end)", MEDIA_HOSTS.every(h => { const p = byKey(h.key); return h.visits.every(([at]) => at > p.budget_release_date && at < NOW && (!p.actual_end_date || at.slice(0, 10) <= p.actual_end_date)); }));
chk("pins: every host in pins.hosts exists in the media plan; the investment-campus media and the screen captures are excluded by default", Object.values(PINS.hosts).every(h => MEDIA_HOSTS.some(m => m.slot === h.host))
  && Object.values(PINS.hosts).filter(h => h.excludeByDefault).map(h => h.host).sort().join() === "H6,H7");
chk("pins: every host maps to a real project at the same campus slot as the host (checked with the private media stand-in when given)", Object.values(PINS.hosts).every(h => MEDIA_HOSTS.find(m => m.slot === h.host).campus_slot === h.campusSlot));
chk("sample media: 12 illustrations on 5 hosts, newest first, first tile from galleryFirstHost, first 12 tiles span >= 3 projects", sampleRows.length === 12 && (() => { const sv = [...sampleRows].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  return projS(sv[0].project_id).id === hostOf[newestHost] && new Set(sv.slice(0, 12).map(a => a.project_id)).size >= 3 && sv.every(a => /^Site visit \d\d\.jpg$/.test(a.file_name) && /^sim-media\/s\d\d$/.test(a.file_path)); })());
chk("sample media files exist with the declared size", sampleMedia.every(m => m.size > 0 && statSync(FILES + `sample-media/${m.key}.jpg`).size === m.size));
chk("no media row ever lands on the story project", !sampleRows.some(a => a.project_id === story.id) && !MEDIA_HOSTS.some(h => h.project_id === story.id));
// 11. Tokens, narration, resolution
const used = tokensUsed(seedPublic);
chk("seed uses only known slots (12 campuses, 13 PMs, 6 team keys)", [...used.C].every(s => CAMPUS_SLOTS.includes(s)) && [...used.P].every(s => s in PM_HOME) && [...used.T].every(k => TEAM_KEYS.includes(k)));
chk("sample cast covers every slot; resolves with no token left over", (() => { try { const s = JSON.stringify(sampleSeed) + JSON.stringify(resolveTokens(narrationOut, SAMPLE_CAST)); return !/\{\{[A-Z]:/.test(s); } catch { return false; } })());
chk("sample cast: slot order == alphabetical order of its names", Object.keys(SAMPLE_CAST.campuses).sort().map(s => SAMPLE_CAST.campuses[s].name).join("|") === Object.values(SAMPLE_CAST.campuses).map(c => c.name).sort((a, b) => a.localeCompare(b)).join("|")
  && Object.keys(SAMPLE_CAST.pms).sort().map(s => SAMPLE_CAST.pms[s].name).join("|") === Object.values(SAMPLE_CAST.pms).map(p => p.name).sort((a, b) => a.localeCompare(b)).join("|"));
chk("resolveTokens throws on a missing slot", (() => { try { resolveTokens({ x: "{{P:P99}}" }, SAMPLE_CAST); return false; } catch { return true; } })());
const tokenLines = narration.filter(l => /\{\{/.test(JSON.stringify(l)));
chk(`narration: tokens only in the lines naming a campus (scene 12) or the story PM (15, 16): ${tokenLines.map(l => l.id).join(", ")}`, tokenLines.length <= 5 && tokenLines.every(l => [12, 15, 16].includes(l.scene))
  && tokenLines.every(l => !/\{\{P:/.test(JSON.stringify(l)) || (JSON.stringify(l).match(/\{\{P:(P\d\d)/g) || []).every(m => m.endsWith(STORY_PM))));
chk("narration: 20 scenes, 23 utterances, 6 chapters; opening line as decided", new Set(narration.map(l => l.scene)).size === 20 && narration.length === 23 && new Set(narration.map(l => l.chapter)).size === 6
  && narration[0].caption.startsWith("The real portal: real names, fictional projects."));
const spokenSample = narrSample.reduce((a, l) => a + l.tokens, 0);
chk(`narration (sample cast): ${spokenSample} spoken tokens <= 220; ${timeSample.total} s at 135 wpm <= 116`, spokenSample <= 220 && timeSample.total <= 116);
chk("narration figures match the screens (total, MT, released, delayed, campuses, assign preview)", narration[0].caption.includes(`${total1} million`) && narration[2].caption.includes(ONES[dash.in_mt]) && narration[3].caption.includes(`${released1} million`)
  && narration[8].caption.includes(ONES[nDelayed]) && narration[11].caption.includes(ONES[nCampuses]) && narration[15].caption.includes(`${ONES[toAssign]} to assign, ${ONES[leftAlone]} left alone`));
// 12. Wording safeguards on every public text
const BANNED = /\b(clinical|clinic|clinics|icu|intensive care|patient|patients|safety|surgery|surgical|operating suite|operation theatre|ward|wards|nurse|nursing|mri|ventilator)\b/i;
const pubTexts = [JSON.stringify(seedPublic), JSON.stringify(narrationOut), JSON.stringify(assetInput)];
chk("no clinical / ICU / patient-safety wording anywhere in the public data or documents", pubTexts.every(t => !BANNED.test(t)));
const BAD = /\b(sorry|apolog|my fault|our fault|forgot|missed|negligen|blame|careless|could not be bothered|ignored|failed to)\b/i;
chk("the story PM's messages are factual and constructive (no apology, blame or fault words) and name no person", [...comments, ...past_project_updates].filter(m => m.author_id === PM[STORY_PM].id).every(m => !BAD.test(m.body) && !/\{\{/.test(m.body)));
chk("no message, risk, task, PDD or document text carries a token (names only in name columns)", ![comments.map(c => c.body), past_project_updates.map(m => m.body), past_pm_messages.map(m => m.body), project_risks.map(x => [x.title, x.mitigation_plan]), project_tasks.map(t => [t.name, t.owner]), assetInput, newPdd.problem + newPdd.objectives].some(x => /\{\{/.test(JSON.stringify(x))));
chk("public outputs contain no 'riphah', real domain, production host or storage URL", pubTexts.every(t => !/riphah|\.edu\.pk|gmail|prmxkecomqqngvrmytcj|supabase\.co|token=/i.test(t)));
chk("settings: welcome_email holds no password and only simulation.example addresses; contact_info present; about text makes no claim about real names", (() => { const w = settings.find(s => s.key === "welcome_email").value; return w.password === "" && w.cc.every(a => a.endsWith("@simulation.example")) && !!settings.find(s => s.key === "contact_info") && !/real/i.test(settings.find(s => s.key === "about_us").value.body); })());
// 13. Negatives ledger (rules for real people)
chk("negatives: the story PM carries only the story project; every other manager carries none (no delay, finish passed, over budget, high risk, No progress, chase)",
  out.ledger.every(l => l.slot === STORY_PM ? l.negativeFyProjects.join() === "A1" && l.noProgress.length === 0 : l.negativeFyProjects.length === 0 && l.noProgress.length === 0 && l.chases === 0));
chk("negatives: every delayed or finish-passed project has an outside-cause risk and a note in Updates", perfRows.filter(p => p.portfolio === "capex" && p.schedule_flag === "delayed").every(p => {
  const k = projects.find(q => q.id === p.id)._key; const rk = RISKS.find(x => x[0] === k); return rk && ["vendor", "technical", "schedule"].includes(rk[2]) && comments.some(c => c.project_id === p.id); }));

/* ── Private checks (the real cast; scratch only) ── */
let castReal = null, mediaReal = null, realNames = [];
if (PRIV && existsSync(PRIV + "cast.local.json")) {
  castReal = JSON.parse(readFileSync(PRIV + "cast.local.json", "utf8"));
  mediaReal = existsSync(PRIV + "media.local.json") ? JSON.parse(readFileSync(PRIV + "media.local.json", "utf8")).items : null;
  realNames = existsSync(PRIV + "real-names.local.json") ? JSON.parse(readFileSync(PRIV + "real-names.local.json", "utf8")).names : [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const personValues = [...new Set([...Object.values(castReal.pms).flatMap(p => [p.name, p.short || deriveShort(p.name)]), ...Object.values(castReal.team).map(t => typeof t === "object" ? t.name : t)])].filter(Boolean);
  const campusValues = [...new Set(Object.values(castReal.campuses).flatMap(c => [c.name, c.epdd].filter(Boolean)))];
  const reOf = (vals) => vals.length ? new RegExp(`(?<![A-Za-z0-9])(${[...vals].sort((a, b) => b.length - a.length).map(esc).join("|")})(?![A-Za-z0-9])`, "i") : null;
  const personRe = reOf(personValues), campusRe = reOf(campusValues);
  const seedR = resolveTokens(seedPublic, castReal);
  const narrR = narrFor(castReal);
  const timeR = timing(narrR);
  const spokenR = narrR.reduce((a, l) => a + l.tokens, 0);
  chk(`narration (real cast): ${spokenR} spoken tokens <= 220; ${timeR.total} s at 135 wpm <= 116`, spokenR <= 220 && timeR.total <= 116);
  chk("real cast: slot order == alphabetical order of the real names", Object.keys(castReal.campuses).sort().map(s => castReal.campuses[s].name).join("|") === Object.values(castReal.campuses).map(c => c.name).sort((a, b) => a.localeCompare(b)).join("|")
    && Object.keys(castReal.pms).sort().map(s => castReal.pms[s].name).join("|") === Object.values(castReal.pms).map(p => p.name).sort((a, b) => a.localeCompare(b)).join("|"));
  chk("board figures: a register sorted by campus gives the same order on tokens and on real names", (() => { const reg = sep.register || []; if (!reg.length) return true; const reg2 = resolveTokens(reg, castReal);
    const re = [...reg2].sort((a, b) => (a.campus || "").localeCompare(b.campus || "") || b.df - a.df); const rt = [...reg].sort((a, b) => (a.campus || "").localeCompare(b.campus || "") || b.df - a.df); return JSON.stringify(rt.map(x => x.id)) === JSON.stringify(re.map(x => x.id)); })());
  chk("real cast: the story PM slot is the PM the PMO chose and works at the story campus", castReal.story?.pm === STORY_PM && castReal.story?.campus === STORY_CAMPUS);
  chk("fictional loads keep the real ranking of managers (more real FY projects -> at least as many here)", (() => { const real = Object.fromEntries(Object.entries(castReal.pms).map(([k, v]) => [k, v.realFy])); const n = (s) => projects.filter(p => p._pm === s).length; const s = Object.keys(real); return s.every(a => s.every(b => real[a] <= real[b] || n(a) >= n(b))); })());
  chk("past-project managers: real past managers only, on their home campus, real ranking kept", past_projects.every(p => CT(PM_HOME[p._pm]) === p.campus) && past_projects.every(p => castReal.pms[p._pm].realPast > 0)
    && (() => { const real = Object.fromEntries(Object.entries(castReal.pms).map(([k, v]) => [k, v.realPast])); const n = (s) => past_projects.filter(p => p._pm === s).length; const s = Object.keys(real); return s.every(a => s.every(b => real[a] <= real[b] || n(a) >= n(b))); })());
  chk("resolved: no token left; real person names only in name columns", (() => { if (/\{\{[A-Z]:/.test(JSON.stringify(seedR))) return false; const bad = [];
    const NAME_COLS = /(\.full_name|\.author_name|\.person_name|\.owner|\.pm_name|\.name|\.pm|\.label|\.key|\.pms|\.campus|\.project_campus)$/;
    const walk = (v, path) => { if (typeof v === "string") { if (personRe.test(v) && !NAME_COLS.test(path)) bad.push(path); } else if (Array.isArray(v)) v.forEach(x => walk(x, path + "[]")); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); };
    walk(seedR.tables, "tables"); return bad.length === 0; })());
  chk("resolved narration names a person only in the story PM's two lines (and their short forms)", narrR.every(l => !personRe.test(l.caption + " " + (l.short?.caption || "")) || ["s15", "s16"].includes(l.id)));
  chk("resolved narration names campuses only in scene 12, and nothing negative is said about a named place or person", narrR.every(l => (!campusRe.test(l.caption) || l.scene === 12) && !(campusRe.test(l.caption) && /\b(lag|last|worst|behind|slow|delayed)\b/i.test(l.caption))));
  const pubAll = [JSON.stringify(seedPublic), JSON.stringify(narrationOut), JSON.stringify(assetInput), JSON.stringify(PINS), JSON.stringify(SAMPLE_CAST), readFileSync(new URL(import.meta.url), "utf8")];
  chk("public outputs and this generator contain no real person name (whole word, case-insensitive)", pubAll.every(t => !personRe.test(t)));
  chk("public outputs contain no real campus name (only tokens; respellings live in the cast)", pubAll.slice(0, 5).every(t => !campusRe.test(t)));
  const toks = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !["the", "and", "for", "with", "phase", "pmdc", "upgradation", "upgrade", "procurement", "replacement", "renovation", "establishment", "development", "installation", "purchase", "provision", "campus", "new", "proc", "estb", "upgrad"].includes(w)));
  const dice = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let c = 0; for (const t of A) if (B.has(t)) c++; return 2 * c / (A.size + B.size); };
  const fictNames = [...projects.map(p => p.name), ...past_projects.map(p => p.name), ...cfNames, ...suUnfunded.map(x => x[0])];
  const close = fictNames.flatMap(f => realNames.map(rn => [f, rn, dice(f, rn)])).filter(x => x[2] >= 0.6);
  chk(`fictional project, past, carry-forward and SU names: none >= 60% like a real name (${realNames.length} real names checked; closest ${Math.max(0, ...fictNames.flatMap(f => realNames.map(rn => dice(f, rn)))).toFixed(2)})`, realNames.length > 0 && close.length === 0);
  const THEME = /(basement|kiosk|koisk|corridor|relocation|shifting|common room|cafeteria|lounge)/i;
  chk("story and host names echo no real media project's theme (basement, kiosk, corridors, relocation, common rooms)", [story, ...MEDIA_HOSTS.map(h => byKey(h.key))].every(p => !THEME.test(p.name)) && !THEME.test(JSON.stringify(pddItems.A1)));
  if (mediaReal) {
    const itemsR = mediaReal.map(it => ({ ...it, host: PINS.hosts[it.project_id]?.host }));
    const rowsR = buildMediaRows(seedR, itemsR);
    const projR = (id) => seedR.tables.projects.find(p => p.id === id);
    const sv = [...rowsR].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    const relTime = (iso) => { const s = Math.max(0, (new Date(NOW) - new Date(iso)) / 1000); if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; const d = Math.floor(s / 86400); return d === 1 ? "yesterday" : `${d}d ago`; };   // PhotoWall's rule
    chk(`gallery (all ${mediaReal.length} real items ticked): every item placed, none on the story project`, rowsR.length === mediaReal.length && !rowsR.some(a => a.project_id === story.id));
    chk("gallery: every real item sits on a host at the same real campus slot as its source project", itemsR.every(it => { const row = rowsR.find(a => a.file_path === `sim-media/${it.key}`); return row && projR(row.project_id).campus_id === seedR.tables.campuses.find(c => c.id === campusId(PINS.hosts[it.project_id].campusSlot)).id; }));
    chk(`gallery: newest tile is an image on ${newestHost} ('${relTime(sv[0].uploaded_at)}'); first 12 tiles span >= 3 projects; first video after tile 12`, sv[0].project_id === hostOf[newestHost] && sv[0].mime_type.startsWith("image/") && relTime(sv[0].uploaded_at) === "yesterday"
      && new Set(sv.slice(0, 12).map(a => a.project_id)).size >= 3 && sv.findIndex(a => a.mime_type.startsWith("video/")) >= 12);
    const def = itemsR.filter(it => !PINS.hosts[it.project_id].excludeByDefault);
    const rowsD = buildMediaRows(seedR, def); const svD = [...rowsD].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    chk(`gallery (default ticks, ${def.length} items): first 12 tiles span >= 3 projects, images only`, new Set(svD.slice(0, 12).map(a => a.project_id)).size >= 3 && svD.slice(0, 12).every(a => a.mime_type.startsWith("image/")));
    chk("gallery: neutral file names, uploaded by the PMO, no real file name, id or URL in a row", rowsR.every(a => /^Site visit \d\d\.(jpg|png|webp|mp4|webm)$/.test(a.file_name) && a.uploaded_by_name === "Project Management Office" && !/http|token|supabase/i.test(JSON.stringify(a))));
  }
}

for (const [s2, n] of ok) console.log(s2, n);
const nPass = ok.filter(x => x[0] === "PASS").length, nFail = ok.length - nPass;
console.log(`${nPass} pass, ${nFail} fail${PRIV ? "" : " (private checks skipped: set SIM_PRIVATE)"}`);

/* ══ Write outputs ═══════════════════════════════════════════════════════ */
mkdirSync(DATA, { recursive: true });
const write = (f, s) => { writeFileSync(f, s); return createHash("sha256").update(s).digest("hex").slice(0, 16); };
const hashes = {
  "seed.json": write(DATA + "seed.json", JSON.stringify(seedPublic)),
  "narration.json": write(DATA + "narration.json", JSON.stringify(narrationOut, null, 1) + "\n"),
  "sample-media.json": write(DATA + "sample-media.json", JSON.stringify(sampleMedia.map(({ scene, ...m }) => m), null, 1) + "\n"),
};
const fileHash = createHash("sha256");
for (const f of Object.keys(sizes).sort()) fileHash.update(f).update(readFileSync(FILES + f));
hashes["public/sim/files"] = fileHash.digest("hex").slice(0, 16);
if (process.env.SIM_SUMMARY) writeFileSync(process.env.SIM_SUMMARY, JSON.stringify({ ...out, meta, checks: ok, timing: timeSample }, null, 1));
console.log("outputs:", JSON.stringify(hashes));
console.log(`seed ${(statSync(DATA + "seed.json").size / 1024).toFixed(0)} KB; ${Object.keys(sizes).length} files ${(Object.values(sizes).reduce((a, b) => a + b, 0) / 1024).toFixed(0)} KB; narration ${spokenSample} tokens (sample cast), ${timeSample.total} s at 135 wpm`);
process.exit(nFail ? 1 : 0);
