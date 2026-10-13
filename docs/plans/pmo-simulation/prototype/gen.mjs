// Synthetic dataset generator for the PMO Simulation (planning prototype, scratch only).
// Everything is invented. Run: node gen.mjs  -> writes seed.json and prints the reconciliation summary.
import { writeFileSync } from "node:fs";
import { computeFigures, periodOf } from "./reportCalc.mjs";
import { reviewPdd } from "./review.mjs";

const NOW = "2026-10-15T05:30:00Z";          // frozen clock: Thu 15 Oct 2026 10:30 PKT
const TODAY = "2026-10-15";                   // CURRENT_DATE (UTC) == PKT date at 10:30
const SPI_T = 1, CPI_T = 1;                   // settings.spi_threshold / cpi_threshold (as production)
const FY = "FY 26-27";
let seq = 0; const uid = (p) => `${p}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const day = (s) => Math.round(new Date(s + "T00:00:00Z").getTime() / 864e5);

/* ── Reference tables ───────────────────────────────────────────────────── */
const CAMPUSES = ["Northbridge", "Lakeside", "Hillview", "Riverside Hospital", "Eastgate", "Westfield", "Central Office", "Hostels"]
  .map((name, i) => ({ id: uid("c0000001"), name, sort_order: i + 1 }));
const campusId = (n) => CAMPUSES.find(c => c.name === n).id;
const SEGMENTS = [{ id: uid("5e900001"), name: "University", sort_order: 1 }, { id: uid("5e900001"), name: "Trust", sort_order: 2 }]; // organisations
const SECTORS = ["Academic", "Healthcare", "Management", "Investment"].map((name, i) => ({ id: uid("5ec00001"), name, sort_order: i + 1 }));
const REGIONS = ["North Region", "Central Region", "South Region"].map((name, i) => ({ id: uid("4e900001"), name, sort_order: i + 1 }));
const CC = [
  ["Facilities Northbridge", "9101000"], ["IT Services", "9102000"], ["University Library", "9103000"],
  ["Lakeside Campus Administration", "9104000"], ["Eastgate Campus Administration", "9105000"],
  ["Westfield School of Sciences", "9106000"], ["Student Affairs", "9107000"], ["Hillview Medical College", "9201000"],
  ["Hillview Dental College", "9202000"], ["Riverside Teaching Hospital", "9301000"], ["Central Office Administration", "9001000"],
  ["Investments Office", "9002000"],
].map(([n, c], i) => ({ id: uid("cc000001"), code: c, name: `${n} (Code:${c})`, sort_order: i + 1 }));
const cc = (code) => CC.find(x => x.code === code);
const sec = (n) => SECTORS.find(s => s.name === n).id;
const seg = (n) => SEGMENTS.find(s => s.name === n).id;
const reg = (n) => REGIONS.find(s => s.name === n).id;

/* ── People (all fictional) ─────────────────────────────────────────────── */
const U = (username, full_name, role, extra = {}) => ({ id: uid("a5e70001"), username, full_name, role, email: `${username}@university.example`,
  phone: null, is_active: true, notify_email: true, whatsapp_opt_in: false, created_at: "2026-07-01T04:00:00Z", ...extra });
const PMO = U("pmo.demo", "PMO (Simulation)", "pmo");
const PM = {
  nadia: U("nfairweather", "Nadia Fairweather", "project_manager", { phone: "+00 300 0000 101" }),
  omar: U("olinfield", "Omar Linfield", "project_manager", { phone: "+00 300 0000 102" }),
  hira: U("hbrookes", "Hira Brookes", "project_manager", { phone: "+00 300 0000 103" }),
  faisal: U("fstonebridge", "Faisal Stonebridge", "project_manager", { phone: "+00 300 0000 104" }),
  zara: U("zkingsley", "Zara Kingsley", "project_manager", { phone: "+00 300 0000 105" }),
  imran: U("iashdown", "Imran Ashdown", "project_manager", { phone: "+00 300 0000 106" }),
  maryam: U("mholloway", "Maryam Holloway", "project_manager", { phone: "+00 300 0000 107" }),
};
const GUESTS = {
  vc: U("amarlowe", "Prof. Adeel Marlowe", "guest"),
  df: U("rthornton", "Rabia Thornton", "guest"),
  ed: U("kellery", "Kamran Ellery", "guest"),
  fac: U("swhitcombe", "Sana Whitcombe", "guest"),     // past-projects viewer
};
const USERS = [PMO, ...Object.values(PM), ...Object.values(GUESTS)];

/* ── Projects ───────────────────────────────────────────────────────────── */
// [key, name, campus, stage, df, pm, cc, sector, org, priority, strategic, start, end, extra]
const P = [];
const add = (key, name, campus, stage, df, pm, ccode, sector, org, priority, strat, start, end, x = {}) =>
  P.push({ key, name, campus, stage, df, pm, ccode, sector, org, priority, strat, start, end, ...x });
const TL = "Teaching & Learning Excellence", HQ = "Healthcare Quality", OE = "Operational Excellence", FS = "Financial Sustainability";
// pdd_not_submitted (20)
add("N1", "Anatomy Museum Display Cabinets", "Hillview", "pdd_not_submitted", 3600000, "nadia", "9201000", "Healthcare", "Trust", "second_priority", TL, "2026-11-15", "2027-02-28");
add("N2", "Pathology Lab Microscopes", "Hillview", "pdd_not_submitted", 6425000, "nadia", "9201000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-01", "2027-03-31", { pmdc: true });
add("N3", "Hospital Laundry Machines", "Riverside Hospital", "pdd_not_submitted", 9880000, "hira", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-01", "2027-04-30");
add("N4", "Hospital Kitchen Cold Storage", "Riverside Hospital", "pdd_not_submitted", 5240000, "hira", "9301000", "Healthcare", "Trust", "second_priority", HQ, "2027-01-01", "2027-04-30");
add("N5", "Nursing Hostel Water Filtration", "Hostels", "pdd_not_submitted", 2150000, "faisal", "9107000", "Management", "University", "second_priority", OE, "2026-12-01", "2027-02-28");
add("N6", "Hostel Block A Common Room Furniture", "Hostels", "pdd_not_submitted", 1860000, "faisal", "9107000", "Management", "University", "third_priority", OE, "2027-01-01", "2027-03-31");
add("N7", "Lakeside Boundary Wall Repair", "Lakeside", "pdd_not_submitted", 7300000, "faisal", "9104000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-03-31");
add("N8", "Lakeside Cafeteria Kitchen Upgrade", "Lakeside", "pdd_not_submitted", 4475000, "faisal", "9104000", "Management", "University", "third_priority", OE, "2027-01-15", "2027-05-31");
add("N9", "Eastgate Classroom Smart Boards", "Eastgate", "pdd_not_submitted", 6960000, "zara", "9105000", "Academic", "University", "top_priority", TL, "2026-12-01", "2027-03-31");
add("N10", "Eastgate Parking Shade Structures", "Eastgate", "pdd_not_submitted", 3280000, "zara", "9105000", "Management", "University", "third_priority", OE, "2027-02-01", "2027-05-31");
add("N11", "Westfield Physics Lab Equipment", "Westfield", "pdd_not_submitted", 5615000, "maryam", "9106000", "Academic", "University", "top_priority", TL, "2026-12-01", "2027-04-30");
add("N12", "Westfield Chemistry Store Ventilation", "Westfield", "pdd_not_submitted", 2940000, "maryam", "9106000", "Academic", "University", "second_priority", OE, "2027-01-01", "2027-03-31");
add("N13", "Data Centre UPS Replacement", "Northbridge", "pdd_not_submitted", 12600000, "imran", "9102000", "Management", "University", "top_priority", OE, "2026-12-01", "2027-04-30");
add("N14", "Wi-Fi Coverage for Hostels", "Hostels", "pdd_not_submitted", 4820000, "imran", "9102000", "Management", "University", "second_priority", OE, "2027-01-01", "2027-04-30");
add("N15", "Northbridge Auditorium Seating", "Northbridge", "pdd_not_submitted", 10450000, "omar", "9101000", "Academic", "University", "second_priority", TL, "2027-01-15", "2027-05-31");
add("N16", "Northbridge Disabled Access Ramps", "Northbridge", "pdd_not_submitted", 2375000, "omar", "9101000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-01-31");
add("N17", "Central Office Records Archive", "Central Office", "pdd_not_submitted", 1940000, "imran", "9001000", "Management", "Trust", "third_priority", OE, "2027-02-01", "2027-04-30");
add("N18", "Fire Alarm System Upgrade, Lakeside", "Lakeside", "pdd_not_submitted", 6180000, null, "9104000", "Management", "University", "top_priority", OE, "2026-12-15", "2027-04-30");
add("N19", "Hillview Lecture Hall Air Conditioning", "Hillview", "pdd_not_submitted", 8900000, "nadia", "9201000", "Healthcare", "Trust", "second_priority", TL, "2027-01-01", "2027-05-31");
add("N20", "Student Counselling Centre Fit-out", "Northbridge", "pdd_not_submitted", 3150000, null, "9107000", "Academic", "University", "second_priority", TL, "2027-01-15", "2027-04-30");
// identified = "PDD submitted" (2)
add("S1", "Library E-Book Platform Licences", "Northbridge", "identified", 4600000, "omar", "9103000", "Academic", "University", "second_priority", TL, "2026-12-01", "2027-06-30");
add("S2", "Dental Radiography Unit", "Hillview", "identified", 7850000, "nadia", "9202000", "Healthcare", "Trust", "top_priority", HQ, "2026-12-15", "2027-04-30");
// df_review (4)
add("D1", "Westfield Sports Complex Floodlights", "Westfield", "df_review", 8750000, "maryam", "9106000", "Academic", "University", "second_priority", OE, "2026-12-01", "2027-03-31");
add("D2", "Hospital Generator Overhaul", "Riverside Hospital", "df_review", 11200000, "hira", "9301000", "Healthcare", "Trust", "top_priority", OE, "2026-11-15", "2027-02-28");
add("D3", "Eastgate Library Shelving", "Eastgate", "df_review", 2690000, "zara", "9105000", "Academic", "University", "third_priority", TL, "2026-12-01", "2027-02-28");
add("D4", "Visitor Management Kiosks", "Central Office", "df_review", 1725000, "imran", "9001000", "Management", "Trust", "third_priority", OE, "2026-12-01", "2027-01-31");
// ed_review (3)
add("E1", "Lakeside Science Block Roof Waterproofing", "Lakeside", "ed_review", 5960000, "faisal", "9104000", "Management", "University", "top_priority", OE, "2026-11-15", "2027-01-31");
add("E2", "ERP Reporting Server", "Northbridge", "ed_review", 9340000, "imran", "9102000", "Management", "University", "second_priority", OE, "2026-12-01", "2027-03-31");
add("E3", "Hillview Student Lockers", "Hillview", "ed_review", 1580000, "nadia", "9201000", "Healthcare", "Trust", "third_priority", OE, "2026-12-01", "2027-01-31");
// mt_review (5)
add("M1", "Hospital Pharmacy Automation", "Riverside Hospital", "mt_review", 18500000, "hira", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-10-06", "2027-04-30",
  { released: 3500000, release: "2026-10-06", paid: 0 });
add("M2", "Westfield Biology Lab Renovation", "Westfield", "mt_review", 7240000, "maryam", "9106000", "Academic", "University", "second_priority", TL, "2026-11-15", "2027-03-31");
add("M3", "Eastgate Solar Water Heaters", "Eastgate", "mt_review", 3875000, "zara", "9105000", "Management", "University", "third_priority", FS, "2026-11-15", "2027-02-28");
add("M4", "Northbridge Gym Equipment", "Northbridge", "mt_review", 4310000, null, "9107000", "Management", "University", "third_priority", OE, "2026-12-01", "2027-02-28");
add("M5", "Accreditation Upgrade: Riverside Wards", "Riverside Hospital", "mt_review", 24600000, "hira", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-11-01", "2027-06-30", { pmdc: true });
// approved (12)  bac, released, release date, pct, actual_cost, payments_made
add("A1", "Clinical Skills Lab Upgrade", "Hillview", "approved", 52400000, "nadia", "9201000", "Healthcare", "Trust", "top_priority", HQ, "2026-08-01", "2026-12-29",
  { bac: 52400000, released: 26200000, release: "2026-08-01", pct: 38, ac: 19650000, paid: 21000000, story: true });
add("A2", "Main Library Digital Commons", "Northbridge", "approved", 31750000, "omar", "9103000", "Academic", "University", "top_priority", TL, "2026-07-20", "2027-01-31",
  { bac: 31750000, released: 31750000, release: "2026-07-20", pct: 50, ac: 15500000, paid: 28000000 });
add("A3", "Campus Network Core Switch Refresh", "Northbridge", "approved", 18900000, "imran", "9102000", "Management", "University", "top_priority", OE, "2026-07-28", "2026-11-30",
  { bac: 18900000, released: 18900000, release: "2026-07-28", pct: 70, ac: 12800000, paid: 18900000, scope_change: true });
add("A4", "Accreditation Upgrade: ICU Monitors", "Riverside Hospital", "approved", 28000000, "hira", "9301000", "Healthcare", "Trust", "top_priority", HQ, "2026-08-18", "2027-02-28",
  { bac: 27300000, released: 20000000, release: "2026-08-18", pct: 24, ac: 6400000, paid: 16000000, pmdc: true });
add("A5", "Solar Rooftop Phase 2", "Lakeside", "approved", 22480000, "faisal", "9104000", "Management", "University", "second_priority", FS, "2026-09-01", "2027-03-31",
  { bac: 22480000, released: 11240000, release: "2026-09-01", pct: 24, ac: 5100000, paid: 11240000 });
add("A6", "Hostel Block C Washroom Renovation", "Hostels", "approved", 9860000, "faisal", "9107000", "Management", "University", "top_priority", OE, "2026-07-15", "2026-10-31",
  { bac: 9860000, released: 9860000, release: "2026-07-15", pct: 70, ac: 6700000, paid: 9860000 });
add("A7", "Examination Hall Furniture", "Eastgate", "approved", 6240000, "zara", "9105000", "Academic", "University", "second_priority", TL, "2026-08-10", "2026-10-10",
  { bac: 6240000, released: 6240000, release: "2026-08-10", pct: 90, ac: 5500000, paid: 6240000 });
add("A8", "Dental Unit Chairs Replacement", "Hillview", "approved", 14350000, "nadia", "9202000", "Healthcare", "Trust", "top_priority", HQ, "2026-08-25", "2027-01-15",
  { bac: 14350000, released: 14350000, release: "2026-08-25", pct: 38, ac: 5300000, paid: 11600000 });
add("A9", "Admissions Office Refurbishment", "Central Office", "approved", 4980000, "imran", "9001000", "Management", "Trust", "second_priority", OE, "2026-09-10", "2026-12-10",
  { bac: 4980000, released: 4980000, release: "2026-09-10", pct: 45, ac: 2150000, paid: 2500000, type: "Non Budgeted", pending: true });
add("A10", "Science Labs Fume Hoods", "Westfield", "approved", 11600000, "maryam", "9106000", "Academic", "University", "top_priority", OE, "2026-10-09", "2027-02-28",
  { bac: 11600000, released: 5800000, release: "2026-10-09", pct: 6, ac: 640000, paid: 0, pending: true });
add("A11", "CCTV Coverage Extension", "Lakeside", "approved", 7420000, "faisal", "9104000", "Management", "University", "second_priority", OE, "2026-08-05", "2026-12-31",
  { bac: 7420000, released: 7420000, release: "2026-08-05", pct: 49, ac: 4150000, paid: 7420000 });
add("A12", "Lecture Theatre AV Upgrade", "Eastgate", "approved", 12800000, "zara", "9105000", "Academic", "University", "second_priority", TL, "2026-11-01", "2027-04-30",
  { bac: 12800000, released: 0, release: null, pct: 0, ac: 0, paid: 0 });
// closed (2)
add("C1", "Faculty Lounge Furniture", "Westfield", "closed", 3150000, "maryam", "9106000", "Academic", "University", "third_priority", OE, "2026-07-10", "2026-09-15",
  { bac: 3150000, released: 3150000, release: "2026-07-10", pct: 100, ac: 3042500, paid: 3150000, actual_end: "2026-09-18", pcd: "2026-09-25" });
add("C2", "Reception Kiosk Installation", "Central Office", "closed", 1180000, "imran", "9001000", "Management", "Trust", "third_priority", OE, "2026-07-05", "2026-08-20",
  { bac: 1180000, released: 1180000, release: "2026-07-05", pct: 100, ac: 1180000, paid: 1180000, actual_end: "2026-08-24", pcd: "2026-08-28", type: "Non Budgeted" });
// investment (2) — never CAPEX
add("I1", "Medical Plaza Basement Fit-out", "Riverside Hospital", "approved", 95000000, null, "9002000", "Investment", "Trust", "top_priority", FS, "2026-07-01", "2027-06-30",
  { bac: 95000000, released: 95000000, release: "2026-07-01", pct: 0, ac: 0, paid: 95000000, portfolio: "investment" });
add("I2", "Endowment Property Units", "Central Office", "approved", 12500000, null, "9002000", "Investment", "Trust", "second_priority", FS, "2026-08-01", "2027-06-30",
  { bac: 12500000, released: 12500000, release: "2026-08-01", pct: 0, ac: 0, paid: 12500000, portfolio: "investment" });

const SU_EXTRA = { N1: 4100000, A1: 61800000, A2: 36500000, M5: 31000000, N13: 15800000, I1: 95000000, I2: 12500000 };
const months = (a, b) => Math.round((new Date(b) - new Date(a)) / (864e5 * 30.4375));
const prefix = (o) => (o === "Trust" ? "ET" : "EU");
let codeN = {};
const projects = P.map((p) => {
  const c = cc(p.ccode); const n = (codeN[c.code] = (codeN[c.code] || 0) + 1);
  const rel = p.released ?? 0;
  return {
    id: uid("b0000001"), code: `${prefix(p.org)}.27${c.code.slice(1, 5)}-${String(n).padStart(2, "0")}`, name: p.name,
    sector_id: sec(p.sector), region_id: reg(["Northbridge", "Central Office", "Hostels"].includes(p.campus) ? "North Region" : ["Lakeside", "Eastgate"].includes(p.campus) ? "Central Region" : "South Region"),
    segment_id: seg(p.org), cost_center_id: c.id, project_type: p.type || "Budgeted", priority: p.priority,
    workflow_stage: p.stage, su_requested_amount: SU_EXTRA[p.key] ?? Math.round(p.df * 1.25 / 5000) * 5000,
    df_recommended_amount: p.df, bac: p.bac ?? 0, amount_released: rel, payments_made: p.paid ?? 0,
    is_carry_forward: false, payments_pending: !!p.pending, start_date: p.start, end_date: p.end,
    duration_months: months(p.start, p.end), pct_complete: p.pct ?? 0, manual_schedule_flag: null, manual_budget_flag: null,
    notes: null, created_at: "2026-07-03T06:00:00Z", updated_at: "2026-10-01T06:00:00Z", fiscal_year: FY,
    strategic_priority: p.strat, actual_start_date: p.release || null, actual_end_date: p.actual_end || null,
    budget_release_date: p.release || null, scope_change: !!p.scope_change, campus: p.campus, campus_id: campusId(p.campus),
    portfolio: p.portfolio || "capex", actual_cost: p.ac ?? 0, pcd_received_date: p.pcd || null,
    _key: p.key, _pm: p.pm, _pmdc: !!p.pmdc,
  };
});
const byKey = (k) => projects.find(p => p._key === k);

/* ── Views (replicas of the SQL definitions read 13 Oct 2026) ───────────── */
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
function metrics(p, today = TODAY) {
  const eff = p.actual_start_date || p.start_date;
  let el = null;
  if (eff && p.end_date && day(p.end_date) > day(eff)) {
    el = day(today) <= day(eff) ? 0 : day(today) >= day(p.end_date) ? 1 : (day(today) - day(eff)) / (day(p.end_date) - day(eff));
  }
  const ev = p.bac * p.pct_complete / 100;
  const pv = p.bac * (el ?? 0);
  const appr = ["approved", "closed"].includes(p.workflow_stage);
  const schedule_flag = p.manual_schedule_flag ?? (!appr || p.amount_released == 0 || el == null ? "not_started" : ev >= p.bac * el * SPI_T ? "on_time" : "delayed");
  const budget_flag = p.manual_budget_flag ?? (!appr || p.actual_cost == 0 || p.pct_complete == 0 ? "not_started" : ev >= p.actual_cost * CPI_T ? "within" : "over");
  return { ...p, earned_value: r(ev, 2), time_elapsed_fraction: r(el ?? 0, 4), planned_value: r(pv, 2),
    cpi: p.actual_cost > 0 ? r(ev / p.actual_cost, 3) : null, spi: pv > 0 ? r(ev / pv, 3) : null,
    eac: p.actual_cost > 0 && ev > 0 ? r(p.bac / (ev / p.actual_cost), 2) : null, schedule_flag, budget_flag };
}
function dashboard(rows, today = TODAY) {
  const m = rows.filter(p => p.portfolio === "capex").map(p => metrics(p, today));
  const S = (f, w = () => true) => m.filter(w).reduce((s, p) => s + Number(f(p) || 0), 0);
  const C = (w) => m.filter(w).length;
  const rep = (p) => p.pct_complete > 0;
  const ev = S(p => p.earned_value), pv = S(p => p.planned_value, rep), ac = S(p => p.actual_cost, rep);
  const cpi = ac > 0 ? r(ev / ac, 3) : null, spi = pv > 0 ? r(ev / pv, 3) : null;
  return {
    total_projects: m.length, pdd_not_submitted_count: C(p => p.workflow_stage === "pdd_not_submitted"), pdds_submitted: C(p => p.workflow_stage === "identified"),
    in_df: C(p => p.workflow_stage === "df_review"), in_ed: C(p => p.workflow_stage === "ed_review"), in_mt: C(p => p.workflow_stage === "mt_review"),
    approved_count: C(p => p.workflow_stage === "approved"), closed_count: C(p => p.workflow_stage === "closed"),
    on_time_count: C(p => p.schedule_flag === "on_time" && p.workflow_stage === "approved"), delayed_count: C(p => p.schedule_flag === "delayed" && p.workflow_stage === "approved"),
    over_budget_count: C(p => p.budget_flag === "over" && p.workflow_stage === "approved"), scope_change_count: C(p => p.scope_change),
    payments_pending_count: C(p => p.payments_pending), payments_pending_amount: S(p => p.bac, p => p.payments_pending),
    su_requested_total: S(p => p.su_requested_amount), df_recommended_total: S(p => p.df_recommended_amount), approved_total: S(p => p.bac),
    total_capex: S(p => p.df_recommended_amount), budget_consumed: S(p => p.amount_released), payments_made_total: S(p => p.payments_made),
    total_ev: r(ev, 2), total_pv: r(pv, 2), total_ac: ac, portfolio_cpi: cpi, portfolio_spi: spi, reporting_progress_count: C(rep),
    portfolio_health: cpi == null || spi == null ? "Insufficient Data" : cpi >= CPI_T && spi >= SPI_T ? "Good" : cpi < CPI_T - 0.05 && spi < SPI_T - 0.05 ? "Critical" : "At Risk",
  };
}
const healthOf = (cpi, spi) => { const has = v => v != null && isFinite(v) && v > 0; if (!has(cpi) && !has(spi)) return "Insufficient Data";
  const w = Math.min(has(cpi) ? cpi : 9, has(spi) ? spi : 9); return w >= 0.95 ? "Healthy" : w >= 0.90 ? "Attention Required" : w >= 0.80 ? "At Risk" : "Critical"; };
const atRisk = (rows, today = TODAY) => rows.filter(p => p.end_date && p.workflow_stage !== "closed" && day(p.end_date) - day(today) <= 20)
  .map(p => ({ name: p.name, campus: p.campus, stage: p.workflow_stage, days_remaining: day(p.end_date) - day(today) }));

/* ── Assignments, RACI ──────────────────────────────────────────────────── */
const project_assignments = projects.filter(p => p._pm).map(p => ({ id: uid("a5510001"), user_id: PM[p._pm].id, project_id: p.id, assigned_by: PMO.id, assigned_at: "2026-07-03T06:30:00Z" }));
const project_raci = projects.filter(p => p._pm).flatMap(p => [
  { id: uid("ac100001"), project_id: p.id, raci_role: "responsible", user_id: PM[p._pm].id, person_name: PM[p._pm].full_name, person_title: "Project Manager", sort_order: 0 },
  { id: uid("ac100001"), project_id: p.id, raci_role: "informed", user_id: PMO.id, person_name: "Project Management Office", person_title: "PMO", sort_order: 0 }]);

/* ── Risks (one per project; 0 critical by design) ─────────────────────── */
const RISKS = [
  ["A1", "Simulator delivery from the overseas vendor may slip", "vendor", "high", "medium", "Nadia Fairweather", "Weekly call with the vendor; customs agent appointed; trainers and AV ordered first.", "story"],
  ["A4", "Monitor integration with the hospital network needs vendor engineers", "technical", "medium", "high", "Hira Brookes", "Integration test booked before installation in each bay."],
  ["A6", "Hostel occupancy limits the hours contractors can work", "schedule", "high", "medium", "Faisal Stonebridge", "Night and weekend shifts agreed with the warden."],
  ["A7", "Furniture supplier is behind on the last batch", "vendor", "high", "medium", "Zara Kingsley", "Penalty clause invoked; partial delivery accepted for the exam week."],
  ["M1", "Pharmacy robot needs a dedicated power line", "technical", "medium", "high", "Hira Brookes", "Electrical survey requested from facilities."],
  ["M5", "Accreditation inspection date may move earlier", "regulatory", "high", "medium", "Hira Brookes", "Ward works sequenced so inspected areas finish first."],
  ["D2", "Generator spare parts have long lead times", "vendor", "medium", "high", "Hira Brookes", "Parts list shared with two suppliers."],
  ["A2", "Digital commons furniture colours not yet approved", "resource", "medium", "medium", "Omar Linfield", "Samples sent to the library committee."],
  ["A3", "Network cut-over needs a weekend shutdown", "schedule", "medium", "medium", "Imran Ashdown", "Cut-over planned for a public holiday weekend."],
  ["A5", "Roof load assessment may require reinforcement", "technical", "medium", "medium", "Faisal Stonebridge", "Structural engineer visit scheduled."],
  ["A8", "Old dental chairs must be removed without stopping clinics", "schedule", "medium", "medium", "Nadia Fairweather", "Replace two chairs at a time."],
  ["A10", "Fume hood ducting route crosses a lecture hall", "safety", "medium", "medium", "Maryam Holloway", "Work outside teaching hours with a safety officer."],
  ["A11", "Camera positions need hostel privacy review", "regulatory", "low", "medium", "Faisal Stonebridge", "Positions reviewed with student affairs."],
  ["A12", "AV system may not fit the existing ceiling grid", "technical", "medium", "low", "Zara Kingsley", "Site survey with the vendor before order."],
  ["A9", "Office must stay open during admissions week", "schedule", "low", "medium", "Imran Ashdown", "Phased works around the admissions calendar."],
  ["N13", "Current UPS batteries are near end of life", "technical", "high", "medium", "Imran Ashdown", "Battery health checked monthly until replacement."],
  ["E1", "Rain season could delay roof works", "schedule", "low", "low", "Faisal Stonebridge", "Start works after the monsoon."],
  ["M2", "Specimen storage must move during renovation", "resource", "low", "low", "Maryam Holloway", "Temporary store arranged in the old lab."],
];
const sevOf = (pr, im) => pr === "high" && im === "high" ? "critical" : (pr === "high" && im === "medium") || (pr === "medium" && im === "high") ? "high" : pr === "low" && im === "low" ? "low" : "medium";
const project_risks = RISKS.map(([k, title, category, probability, impact, owner, mitigation_plan, tag]) => ({
  id: uid("e1500001"), project_id: byKey(k).id, title, description: null, category, probability, impact, status: "open", owner, mitigation_plan,
  date_identified: "2026-08-20", date_last_reviewed: tag === "story" ? "2026-09-12" : "2026-10-01", created_by: PMO.id, created_by_name: PMO.username,
  created_at: "2026-08-20T07:00:00Z", updated_at: "2026-10-01T07:00:00Z", _story: tag === "story" }));
const scored = (risks) => risks.map(x => { const p = projects.find(q => q.id === x.project_id);
  return { ...x, project_name: p.name, project_code: p.code, project_campus: p.campus, severity: sevOf(x.probability, x.impact) }; });

/* ── E-PDD PDDs ─────────────────────────────────────────────────────────── */
const pddItems = {
  A1: [["High-fidelity adult patient simulator", 2, "No", 9850000], ["Paediatric patient simulator", 1, "No", 7400000], ["IV and injection task trainers", 12, "No", 185000],
       ["Airway management trainers", 6, "No", 310000], ["AV debriefing and recording system", 1, "Set", 6950000], ["Hospital beds with mattresses", 10, "No", 420000],
       ["Medical gas and electrical works", 1, "Job", 5600000], ["Skills lab furniture and storage", 1, "Lot", 4220000]],
  A2: [["Study pods (4-seat)", 12, "No", 1150000], ["Collaboration screens", 6, "No", 640000], ["Self-service book kiosks", 2, "No", 2350000], ["Electrical and data works", 1, "Job", 4900000], ["Furniture and acoustic panels", 1, "Lot", 4510000]],
  A3: [["Core switches", 2, "No", 5600000], ["Distribution switches", 10, "No", 640000], ["Installation and cut-over", 1, "Job", 1250000]],
  A5: [["Solar panels 550 W", 300, "No", 42000], ["Inverters 50 kW", 2, "No", 2850000], ["Mounting structure", 1, "Lot", 2330000], ["Installation and net metering", 1, "Job", 1850000]],
  A8: [["Dental chair units", 8, "No", 1450000], ["Compressor and suction plant", 1, "Set", 1650000], ["Installation and plumbing", 1, "Job", 780000], ["Operator stools", 16, "No", 18000]],
  A9: [["Counter and workstations", 1, "Lot", 2350000], ["Waiting area seating", 40, "No", 32000], ["Flooring and lighting", 1, "Job", 1350000]],
  D1: [["LED floodlight fixtures 1000 W", 24, "No", 160000], ["Steel lighting masts", 6, "No", 470000], ["Cabling and control panel", 1, "Job", 1310000], ["Installation", 1, "Job", 780000]],
  N3: [["Industrial washer-extractors", 3, "No", 1650000], ["Tumble dryers", 3, "No", 950000], ["Flatwork ironer", 1, "No", 1520000], ["Installation", 1, "Job", 560000]],
};
const DELIV_KEYS = ["A1", "A2", "A3", "A5", "A8", "A9", "D1"];
const items = (k) => pddItems[k].map(([description, qty, unit, unit_cost]) => ({ description, qty, unit, unit_cost, total: qty * unit_cost }));
const sumItems = (k) => items(k).reduce((s, i) => s + i.total, 0);
const HIST = [  // id, number, key, status, received, decided
  [104, "PDD-2027-004", "A1", "All Approved", "2026-07-08T06:20:00Z", "16 Jul 2026 11:05 AM"],
  [107, "PDD-2027-007", "A2", "All Approved", "2026-07-06T09:10:00Z", "14 Jul 2026 03:40 PM"],
  [109, "PDD-2027-009", "A3", "All Approved", "2026-07-09T05:00:00Z", "17 Jul 2026 10:15 AM"],
  [112, "PDD-2027-012", "A8", "All Approved", "2026-08-03T07:30:00Z", "12 Aug 2026 12:30 PM"],
  [115, "PDD-2027-015", "A5", "All Approved", "2026-08-10T04:45:00Z", "21 Aug 2026 02:10 PM"],
  [118, "PDD-2027-018", "A9", "All Approved", "2026-08-20T08:00:00Z", "28 Aug 2026 09:50 AM"],
  [121, "PDD-2027-021", "D1", "PMO Approved", "2026-09-20T06:00:00Z", "09 Oct 2026 11:30 AM"],
  [119, "PDD-2027-019", "N3", "Not Approved", "2026-09-02T05:30:00Z", "11 Sep 2026 04:20 PM"],
];
const pddRow = (id, num, p, status, received, decided, extra = {}) => ({
  id, pdd_number: num, project_name: p.name, campus: p.campus, initiated_by: PM[p._pm]?.full_name || "Campus Office", initiated_by_designation: "Project Manager",
  initiated_by_email: PM[p._pm]?.email || null, su_head: "Head of Unit (sample)", project_type: "Budgeted", cost_center: cc(P.find(x => x.key === p._key).ccode).name,
  grand_total: extra.grand ?? sumItems(p._key), estimated_total: extra.grand ?? sumItems(p._key), currency: "PKR", start_date: p.start_date, finish_date: p.end_date,
  submitted_on: received.slice(0, 10), received_at: received, epdd_status: status, epdd_status_code: null, queue: extra.queue || "status", epdd_url: null,
  source_created_at: received, source_updated_at: received, content_hash: `sim-${id}`, raw: {}, is_history: extra.queue !== "manage",
  detail_needed: false, detail_synced_at: received, linked_project_id: status === "Not Approved" ? null : p.id, link_source: status === "Not Approved" ? null : "auto",
  first_seen_at: received, last_synced_at: NOW, changed_at: received, seen_at: extra.queue === "manage" ? null : received, seen_by: extra.queue === "manage" ? null : PMO.id,
  approvals: decided ? [{ kind: "decision", role: "PMO Reviewer", name: "PMO Reviewer (sample)", status: status === "Not Approved" ? "Rejected" : "Recommended", when: decided,
    reason: status === "Not Approved" ? "Quotations missing; please attach two quotations." : null, recommendation_cost: null, update_reason: null, updated_by: null },
    ...(status !== "Not Approved" ? [{ kind: "decision", role: "Manager PMO", name: "Manager PMO (sample)", status: "Recommended", when: decided, reason: null, recommendation_cost: null, update_reason: null, updated_by: null }] : [])] : [],
  pdd: extra.pdd || {},
});
const docSlots = (quote) => [
  { category: "general", group: "General", title: "Deliverables (Annexure A)", file: "Deliverables_AnnexA.pdf" },
  { category: "general", group: "General", title: "Business Plan (Annexure B)", file: "Business_Plan_AnnexB.pdf" },
  { category: "simpleprocurement", group: "Simple Procurement", title: "Quotations", file: quote }];
const epdd_pdds = HIST.map(([id, num, k, st, rec, dec]) => {
  const p = byKey(k);
  return pddRow(id, num, p, st, rec, dec, { pdd: pddItems[k] ? { project_name: p.name, items: items(k), grand_total: sumItems(k), estimated_total: sumItems(k), currency: "PKR",
    doc_types: ["General", "Simple Procurement"], file_slots: docSlots("Quotation_Vendor1.pdf") } : {} });
});
// The incoming PDD (story, chapter 5): Budgeted, linked automatically to N1, PKR 525,000 over DF -> code check fails.
const N1 = byKey("N1");
const newItems = [["Glass display cabinets, floor standing", 8, "No", 245000], ["Wall-mounted specimen cases", 6, "No", 140000], ["LED cabinet lighting", 14, "No", 22500], ["Specimen labelling and mounting", 1, "Lot", 860000], ["Installation and transport", 1, "Job", 150000]]
  .map(([description, qty, unit, unit_cost]) => ({ description, qty, unit, unit_cost, total: qty * unit_cost }));
const newGrand = newItems.reduce((s, i) => s + i.total, 0);
const newPdd = {
  project_name: N1.name, campus: "Hillview Medical College", project_type: "Budgeted", cost_center: cc("9201000").name, currency: "PKR",
  date: "2026-10-14", start_date: "2026-11-15", finish_date: "2027-02-28", estimated_duration: "3 months 13 days",
  problem: "The anatomy museum keeps its specimens in old open shelving, so students cannot study them safely and some specimens are deteriorating.",
  opportunity: "Proper cases would let every first and second year student use the museum for self-study between practical sessions.",
  proposed_solution: "Install sealed glass display cabinets and wall cases with lighting, then relabel and remount the collection.",
  objectives: "Display the full specimen collection in sealed cases before the spring term and open the museum for self-study four days a week.",
  success_criteria: "All 180 specimens displayed in sealed cases; museum open 4 days a week; student feedback score of at least 4 out of 5.",
  stakeholders: "Anatomy department, first and second year students, facilities office.",
  related_target: "Teaching & Learning Excellence: better practical teaching spaces.", description: "Display cabinets and lighting for the anatomy museum at Hillview.",
  risks: [{ risk: "Specimens may be damaged while being moved", impact: "Loss of teaching material" }, { risk: "Cabinet supplier lead time", impact: "Museum opens late" }],
  experts: [{ name: "Anatomy curator (sample)", email: "curator@university.example" }], strategic_priorities: [TL], strategic_themes: [],
  items: newItems, grand_total: newGrand, estimated_total: newGrand, doc_types: ["General", "Simple Procurement"],
  file_slots: docSlots("Quotation_DisplayCases.pdf"),
};
const incoming = pddRow(124, "PDD-2027-024", N1, "Campus Director Approved", "2026-10-14T11:20:00Z", null,
  { queue: "manage", grand: newGrand, pdd: newPdd });
incoming.campus = "Hillview Medical College"; incoming.initiated_by = "Nadia Fairweather";
epdd_pdds.push(incoming);
// Run the production code checks (review.ts rules-3) against the synthetic plan.
const planForReview = projects.filter(p => p.portfolio === "capex").map(p => ({ ...p, cost_centers: { name: CC.find(c => c.id === p.cost_center_id).name } }));
const files = [ ["general", "Deliverables (Annexure A)", "Deliverables_AnnexA.pdf"], ["general", "Business Plan (Annexure B)", "Business_Plan_AnnexB.pdf"], ["simpleprocurement", "Quotations", "Quotation_DisplayCases.pdf"] ]
  .map(([category, title, file_name], i) => ({ id: 900 + i, pdd_id: 124, category, title, file_name, status: "done", sha256: `sim${i}`, mime: "application/pdf", size_bytes: 180000 }));
const rv = reviewPdd({ ...incoming, linked_project_id: null, link_source: null }, files, planForReview);
incoming.linked_project_id = rv.linked?.id ?? null; incoming.link_source = rv.linkSource;

/* ── Deliverables (from approved PDD lines) ─────────────────────────────── */
const DELIVERED = { A1: { 6: "2026-09-28", 8: "2026-10-05" }, A2: { 1: "2026-09-15", 2: "2026-09-15", 5: "2026-10-02" }, A3: { 1: "2026-08-30", 2: "2026-08-30" }, A5: { 1: "2026-10-01" }, A8: { 4: "2026-09-20" }, A9: { 2: "2026-10-07" } };
const project_deliverables = DELIV_KEYS.flatMap(k => items(k).map((it, i) => ({
  id: uid("de100001"), project_id: byKey(k).id, source: "pdd", pdd_id: epdd_pdds.find(e => e.linked_project_id === byKey(k).id && e.queue === "status").id,
  line_no: i + 1, title: it.description, qty: it.qty, unit: it.unit, unit_cost: it.unit_cost, total: it.total, currency: "PKR", confirmed: true, superseded: false,
  status: DELIVERED[k]?.[i + 1] ? "delivered" : "not_started", status_date: DELIVERED[k]?.[i + 1] || null, note: null, sort_order: i + 1 })));
const STORY_TICKS = [3, 4, 5];  // PM ticks these A1 lines in chapter 3

/* ── Cash-flow plan: every CAPEX/investment project phased exactly to its DF ─ */
const FYM = []; { let y = 2026, m = 7; for (let i = 0; i < 12; i++) { FYM.push(`${y}-${String(m).padStart(2, "0")}-01`); if (++m > 12) { m = 1; y++; } } }
const project_cashflows = [];
for (const p of projects) {
  const s = p.start_date.slice(0, 7) + "-01", e = p.end_date.slice(0, 7) + "-01";
  const ms = FYM.filter(m => m >= s && m <= e);
  const per = Math.floor(p.df_recommended_amount / ms.length / 1000) * 1000;
  ms.forEach((m, i) => project_cashflows.push({ id: uid("cf000001"), project_id: p.id, project_name: p.name, campus: p.campus,
    sector: SECTORS.find(x => x.id === p.sector_id).name, organization: SEGMENTS.find(x => x.id === p.segment_id).name, cost_centre: CC.find(c => c.id === p.cost_center_id).name,
    project_type: p.project_type, priority: p.priority, month: m, amount: i === ms.length - 1 ? p.df_recommended_amount - per * (ms.length - 1) : per,
    bucket: p.portfolio === "investment" ? "investment" : p._pmdc ? "pmdc" : "capex", planned_start: p.start_date, planned_end: p.end_date }));
}

/* ── Activity log: project changes after the replay floor (used by board reports) ─ */
const L = []; const log = (at, k, action, oldv, newv, actor = PMO) => { const p = byKey(k); const changed = Object.keys(newv).sort();
  L.push({ id: L.length + 1, actor_id: actor.id, actor_name: actor.username, actor_role: actor.role, action, entity_type: "projects", entity_id: p.id,
    summary: action === "stage_changed" ? `Project "${p.name}" moved ${oldv.workflow_stage} -> ${newv.workflow_stage}` : `Project "${p.name}" updated`,
    details: { changed, old: oldv, new: newv, label: p.name }, created_at: at }); };
// August (after 21 Aug floor)
log("2026-08-25T06:10:00Z", "A8", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 14350000, budget_release_date: "2026-08-25", actual_start_date: "2026-08-25" });
log("2026-08-28T09:00:00Z", "C2", "stage_changed", { workflow_stage: "approved", actual_end_date: null, pct_complete: 80, pcd_received_date: null }, { workflow_stage: "closed", actual_end_date: "2026-08-24", pct_complete: 100, pcd_received_date: "2026-08-28" });
// September
log("2026-09-01T05:20:00Z", "A5", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 11240000, budget_release_date: "2026-09-01", actual_start_date: "2026-09-01" });
log("2026-09-04T07:45:00Z", "A9", "stage_changed", { workflow_stage: "mt_review", bac: 0 }, { workflow_stage: "approved", bac: 4980000 });
log("2026-09-10T06:30:00Z", "A9", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 4980000, budget_release_date: "2026-09-10", actual_start_date: "2026-09-10" });
log("2026-09-12T08:15:00Z", "A1", "updated", { pct_complete: 25 }, { pct_complete: 38 });
log("2026-09-18T10:05:00Z", "C1", "stage_changed", { workflow_stage: "approved", actual_end_date: null, pct_complete: 90 }, { workflow_stage: "closed", actual_end_date: "2026-09-18", pct_complete: 100 });
log("2026-09-24T09:40:00Z", "M2", "stage_changed", { workflow_stage: "ed_review" }, { workflow_stage: "mt_review" });
log("2026-09-25T05:00:00Z", "C1", "updated", { pcd_received_date: null }, { pcd_received_date: "2026-09-25" });
// October (month in progress)
log("2026-10-06T06:40:00Z", "M1", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 3500000, budget_release_date: "2026-10-06", actual_start_date: "2026-10-06" });
log("2026-10-08T10:05:00Z", "A12", "stage_changed", { workflow_stage: "mt_review", bac: 0 }, { workflow_stage: "approved", bac: 12800000 });
log("2026-10-09T07:20:00Z", "A10", "updated", { amount_released: 0, budget_release_date: null, actual_start_date: null }, { amount_released: 5800000, budget_release_date: "2026-10-09", actual_start_date: "2026-10-09" });
log("2026-10-12T05:20:00Z", "D1", "stage_changed", { workflow_stage: "pdd_not_submitted" }, { workflow_stage: "df_review" });
const activity_log = [...L].sort((a, b) => b.created_at.localeCompare(a.created_at));

/* ── Carry forward, past projects, SU list ──────────────────────────────── */
const CF_STATUS = ["Work in Progress", "Project Closed", "PCD Received", "Open With Procurement", "Open With Finance"];
const cfAmts = [12450000, 9875500, 8640000, 7210250, 6300000, 5985000, 4720000, 4310500, 3950000, 3400000, 2865000, 2510000, 2240000, 1980750, 1755000, 1430000, 1215000, 980000, 845500, 620000, 410000, 295000, 168250, -215000];
const cfNames = ["Hostel Block B Renovation", "Medical Library Journals 2025", "Hospital OT Lights", "Northbridge Lift Modernisation", "Lakeside Sports Ground Levelling", "Dental Lab Furnaces",
  "Campus Shuttle Bus", "Server Room Cooling", "Eastgate Admin Block Paint", "Westfield Greenhouse", "Hillview Skills Lab Phase 1", "Riverside Ward Curtains", "Exam Scanners",
  "Library RFID Gates", "Central Office Meeting Room AV", "Cafeteria Chillers", "Physiotherapy Equipment", "Student Card Printers", "Signage Replacement", "Hostel Mattresses",
  "Fire Extinguisher Refill", "Garden Benches", "Security Barriers", "Vendor credit: returned projectors"];
const carry_forward_projects = cfAmts.map((amount, i) => ({ id: uid("cf500001"), code: `EU.25${String(9100 + i)}-01`, region: REGIONS[i % 3].name, name: cfNames[i], amount,
  status: i === 23 ? "Open With Finance" : CF_STATUS[[0, 0, 1, 0, 2, 1, 3, 0, 1, 0, 2, 1, 0, 4, 1, 0, 2, 1, 3, 1, 1, 2, 0, 4][i]], created_at: "2026-09-29T06:00:00Z" }));
const PAST = [ // code, name, campus, fy, approved, released, pm, status, reason, release, start, last follow-up
  ["EU.249101-03", "Northbridge Seminar Hall Acoustics", "Northbridge", "FY 2024-25", 6850000, 6850000, "omar", "open", "In Progress", "2024-11-12", "2024-12-01", "2026-09-30"],
  ["ET.249201-02", "Hillview Histology Microscopes", "Hillview", "FY 2024-25", 9200000, 8740000, "nadia", "open", "In Progress", "2025-01-20", "2025-02-05", "2026-10-01"],
  ["ET.249301-05", "Riverside OPD Waiting Area", "Riverside Hospital", "FY 2023-24", 14500000, 14500000, "hira", "open", "No progress", "2024-03-18", "2024-04-01", "2026-09-22"],
  ["EU.259104-01", "Lakeside Playground Fencing", "Lakeside", "FY 2025-26", 3150000, 3150000, "faisal", "open", "In Progress", "2025-11-10", "2025-11-24", "2026-10-05"],
  ["EU.259105-02", "Eastgate Computer Lab 2", "Eastgate", "FY 2025-26", 11800000, 11800000, "zara", "open", "In Progress", "2025-12-15", "2026-01-10", "2026-10-02"],
  ["EU.259106-01", "Westfield Lab Benches", "Westfield", "FY 2025-26", 4600000, 4600000, "maryam", "open", "No progress", "2025-09-01", "2025-09-15", "2026-09-18"],
  ["EU.249102-04", "Campus Firewall Licences", "Northbridge", "FY 2024-25", 5250000, 5250000, "imran", "open", "In Progress", "2025-03-03", "2025-03-10", "2026-10-06"],
  ["EU.259107-02", "Hostel Kitchen Exhaust", "Hostels", "FY 2025-26", 2780000, 2780000, "faisal", "open", "In Progress", "2026-05-11", "2026-05-20", null],
  ["ET.259301-03", "Hospital Nurse Call System", "Riverside Hospital", "FY 2025-26", 7900000, 6320000, "hira", "open", "No progress", "2026-04-02", "2026-04-20", "2026-09-25"],
  ["ET.259001-01", "Central Office Solar Backup", "Central Office", "FY 2025-26", 3600000, 3600000, "imran", "open", "In Progress", "2026-06-02", "2026-06-15", null],
  ["EU.239101-02", "Northbridge Library Shelving", "Northbridge", "FY 2023-24", 2400000, 2400000, "omar", "closed", null, "2023-11-20", "2023-12-01", "2026-08-30"],
  ["ET.249202-01", "Dental Sterilisation Room", "Hillview", "FY 2024-25", 5100000, 5100000, "nadia", "closed", null, "2024-10-07", "2024-10-20", "2026-08-15"],
];
const past_projects = PAST.map(([code, name, campus, fiscal_year, approved_amount, released_amount, pm, status, reason_open, budget_release_date, start_date, last_followed_up]) => ({
  id: uid("9a570001"), code, name, campus, fiscal_year, approved_amount, released_amount, pm_user_id: PM[pm].id, status, reason_open, notes: null, last_followed_up,
  budget_release_date, start_date, actual_start_date: budget_release_date, end_date: null, revised_end_date: null, actual_end_date: null, created_by: PMO.id,
  created_at: "2026-10-06T06:00:00Z", updated_at: "2026-10-06T06:00:00Z" }));
const suUnfunded = [["Northbridge Swimming Pool Covering", 28500000], ["Hillview Cadaver Cold Room", 9800000], ["Riverside MRI Suite", 145000000], ["Eastgate Hostel Block", 62000000],
  ["Westfield Observatory Dome", 18400000], ["Lakeside Mosque Extension", 7600000], ["Campus Electric Shuttle Fleet", 24000000], ["Central Office Car Park", 11250000],
  ["Hostel Gym", 5300000], ["Smart Classroom Pilot (10 rooms)", 15500000], ["Hospital Rooftop Helipad Study", 3900000], ["Faculty Housing Repairs", 13700000],
  ["Data Analytics Platform", 9100000], ["Sports Turf Pitch", 21000000], ["Dental Implant Centre", 17800000], ["Botanical Garden Irrigation", 2950000]];
const suList = [...projects.filter(p => p.portfolio === "capex").map(p => [p.name, p.su_requested_amount]), ...suUnfunded].map(([name, amount], i) => ({ sr: i + 1, name, amount }));
const suTotal = suList.reduce((s, x) => s + x.amount, 0);
const cfTotal = cfAmts.reduce((s, x) => s + x, 0);

/* ── Board reports: Aug baseline (reconstructed) + Sep monthly (published) ─ */
const reportRows = (builtAt) => ({
  projects, log: activity_log, assignments: project_assignments, profiles: USERS, campuses: CAMPUSES, segments: SEGMENTS, sectors: SECTORS,
  cashflows: project_cashflows, risks: scored(project_risks), pdds: epdd_pdds.filter(e => (e.received_at || "") < builtAt), carry: carry_forward_projects, past: past_projects,
  settings: [{ key: "dashboard_kpis", value: { su_requested: { list: suList } } }] });
const augB = "2026-10-02T05:55:00Z", sepB = "2026-10-02T06:00:00Z";
const aug = computeFigures(reportRows(augB), { ym: "2026-08", asAt: periodOf("2026-08").end, builtAt: augB });
const augRep = { id: uid("b4000001"), ym: "2026-08", period: aug.period, kind: "reconstructed", headline: aug.headline, stages: aug.stages };
const sep = computeFigures(reportRows(sepB), { ym: "2026-09", asAt: periodOf("2026-09").end, builtAt: sepB, compare: augRep });
const oct = computeFigures(reportRows(NOW), { ym: "2026-10", asAt: NOW, builtAt: NOW, compare: { id: uid("b4000001"), ym: "2026-09", period: sep.period, kind: "monthly", headline: sep.headline, stages: sep.stages } });

/* ── Campus Compare rows (replica of CampusCompare.buildCampuses) ───────── */
function compare(rows, deliv, risks) {
  const capex = rows.filter(p => p.portfolio === "capex");
  const pmOf = new Set(project_assignments.map(a => a.project_id));
  return CAMPUSES.map(c => { const l = capex.filter(p => p.campus === c.name); const ids = new Set(l.map(p => p.id));
    const dl = deliv.filter(d => ids.has(d.project_id) && d.confirmed && !d.superseded);
    const appr = l.filter(p => ["approved", "closed"].includes(p.workflow_stage));
    const df = l.reduce((s, p) => s + p.df_recommended_amount, 0), rel = l.reduce((s, p) => s + p.amount_released, 0);
    return { campus: c.name, projects: l.length, df, approved: appr.length, bac: appr.reduce((s, p) => s + p.bac, 0), released: rel, releasedPct: Math.round(rel / df * 100),
      pddNot: l.filter(p => p.workflow_stage === "pdd_not_submitted").length,
      pastFinish: l.filter(p => p.workflow_stage === "approved" && p.end_date < TODAY && !p.actual_end_date).length,
      risks: risks.filter(r => ids.has(r.project_id) && r.status !== "closed").length,
      deliv: `${dl.filter(d => d.status !== "not_started").length} of ${dl.length}`, delivRate: dl.length ? dl.filter(d => d.status !== "not_started").length / dl.length : null,
      noPm: l.filter(p => !pmOf.has(p.id)).length, pastOpen: past_projects.filter(x => x.campus === c.name && x.status !== "closed").length };
  });
}

/* ── Story before / after ───────────────────────────────────────────────── */
const before = { dash: dashboard(projects), story: metrics(byKey("A1")), risks: scored(project_risks), compare: compare(projects, project_deliverables, project_risks) };
const after1 = projects.map(p => p._key === "A1" ? { ...p, pct_complete: 52 } : p);
const risksAfter = project_risks.map(x => x._story ? { ...x, probability: "medium", date_last_reviewed: TODAY } : x);
const delivAfter = project_deliverables.map(d => d.project_id === byKey("A1").id && STORY_TICKS.includes(d.line_no) ? { ...d, status: "delivered", status_date: TODAY } : d);
const after = { dash: dashboard(after1), story: metrics(after1.find(p => p._key === "A1")), risks: scored(risksAfter), compare: compare(after1, delivAfter, risksAfter) };

/* ── Output ─────────────────────────────────────────────────────────────── */
const fmtM = (n) => `${(n / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const pk = (n) => Math.round(n).toLocaleString("en");
const capex = projects.filter(p => p.portfolio === "capex"), inv = projects.filter(p => p.portfolio === "investment");
const sum = (l, f) => l.reduce((s, x) => s + Number(f(x) || 0), 0);
const out = {};
out.dash_before = before.dash; out.dash_after = after.dash;
out.hero = { before: { cpi: before.dash.portfolio_cpi, spi: before.dash.portfolio_spi, verdict: healthOf(before.dash.portfolio_cpi, before.dash.portfolio_spi) },
  after: { cpi: after.dash.portfolio_cpi, spi: after.dash.portfolio_spi, verdict: healthOf(after.dash.portfolio_cpi, after.dash.portfolio_spi) } };
out.story = ["before", "after"].map(w => { const s = (w === "before" ? before : after).story; return { w, pct: s.pct_complete, ev: s.earned_value, pv: s.planned_value, el: s.time_elapsed_fraction, spi: s.spi, cpi: s.cpi, eac: s.eac, flag: s.schedule_flag, budget: s.budget_flag }; });
out.approvedMetrics = capex.filter(p => ["approved", "closed"].includes(p.workflow_stage)).map(p => { const m = metrics(p); return [p._key, p.name, p.campus, p.bac, p.amount_released, p.pct_complete, m.time_elapsed_fraction, m.spi, m.cpi, m.schedule_flag, m.budget_flag, m.planned_value, m.earned_value]; });
out.atRisk = atRisk(projects);
out.stages = ["pdd_not_submitted", "identified", "df_review", "ed_review", "mt_review", "approved", "closed"].map(s => [s, capex.filter(p => p.workflow_stage === s).length, sum(capex.filter(p => p.workflow_stage === s), p => p.df_recommended_amount)]);
out.headline = { capex: capex.length, df: sum(capex, p => p.df_recommended_amount), approvedN: capex.filter(p => ["approved", "closed"].includes(p.workflow_stage)).length,
  approvedBac: sum(capex.filter(p => ["approved", "closed"].includes(p.workflow_stage)), p => p.bac), released: sum(capex, p => p.amount_released),
  releasedProjects: capex.filter(p => p.amount_released > 0).length, paid: sum(capex, p => p.payments_made), su_projects: sum(capex, p => p.su_requested_amount),
  pmdcN: capex.filter(p => p._pmdc).length, pmdcDf: sum(capex.filter(p => p._pmdc), p => p.df_recommended_amount),
  budgeted: [capex.filter(p => p.project_type === "Budgeted" && ["approved", "closed"].includes(p.workflow_stage)).length, sum(capex.filter(p => p.project_type === "Budgeted" && ["approved", "closed"].includes(p.workflow_stage)), p => p.bac)],
  nonBudgeted: [capex.filter(p => p.project_type !== "Budgeted" && ["approved", "closed"].includes(p.workflow_stage)).length, sum(capex.filter(p => p.project_type !== "Budgeted" && ["approved", "closed"].includes(p.workflow_stage)), p => p.bac)],
  invN: inv.length, invDf: sum(inv, p => p.df_recommended_amount), invReleased: sum(inv, p => p.amount_released),
  releasedBeforeApproval: capex.filter(p => !["approved", "closed"].includes(p.workflow_stage) && p.amount_released > 0).map(p => [p.name, p.workflow_stage, p.amount_released]),
  noPm: capex.filter(p => !p._pm).map(p => p.name), suTotal, suCount: suList.length, budgetReduction: suTotal - sum(capex, p => p.df_recommended_amount), cfTotal, cfCount: cfAmts.length };
out.campus = before.compare; out.campusAfter = after.compare;
out.pmLoads = Object.entries(PM).map(([k, u]) => [u.full_name, capex.filter(p => p._pm === k).length, sum(capex.filter(p => p._pm === k), p => p.df_recommended_amount)]);
out.riskSev = ["critical", "high", "medium", "low"].map(s => [s, before.risks.filter(x => x.severity === s).length, after.risks.filter(x => x.severity === s).length]);
out.deliv = { lines: project_deliverables.length, delivered: project_deliverables.filter(d => d.status === "delivered").length, projects: new Set(project_deliverables.map(d => d.project_id)).size,
  a1: items("A1").map((x, i) => [i + 1, x.description, x.qty, x.unit_cost, x.total]), a1Total: sumItems("A1"), sums: Object.fromEntries(DELIV_KEYS.map(k => [k, sumItems(k)])) };
out.pdd = { grand: newGrand, items: newItems.map(i => [i.description, i.qty, i.unit_cost, i.total]), verdict: rv.verdict, summary: rv.summary, linked: rv.linked && [rv.linked.name, rv.linked.score, rv.linked.df], linkSource: rv.linkSource,
  checks: rv.checks.map(c => [c.group, c.id, c.status, c.label, c.detail, c.comment || ""]), candidates: rv.candidates.map(c => [c.name, c.score]) };
const capexPlan = project_cashflows.filter(c => c.bucket !== "investment");
out.cash = { capex: sum(project_cashflows.filter(c => c.bucket === "capex"), c => c.amount), pmdc: sum(project_cashflows.filter(c => c.bucket === "pmdc"), c => c.amount),
  inv: sum(project_cashflows.filter(c => c.bucket === "investment"), c => c.amount), rows: project_cashflows.length,
  monthly: FYM.map(m => [m.slice(0, 7), sum(capexPlan.filter(c => c.month === m), c => c.amount), sum(project_cashflows.filter(c => c.month === m && c.bucket === "pmdc"), c => c.amount)]) };
out.board = Object.fromEntries([["aug", aug], ["sep", sep], ["oct", oct]].map(([k, f]) => [k, { headline: f.headline, stages: f.stages.map(s => [s.stage, s.count, s.df]), month: { released: f.month.released, n: f.month.released_count, list: f.month.released_list.map(x => [x.name, x.change, x.backdated]) },
  moved: f.moved_to_approved.map(x => x.name), attention: { nothing: f.attention.approved_nothing_released.map(x => x.name), early: f.attention.released_before_approval.map(x => x.name), nopm: f.attention.without_pm.length },
  risks: f.risks.by_severity, pdds: f.pdds, carry: { count: f.carry.count, amount: f.carry.amount }, past: f.past, plan_total: f.funding.plan_total }]));
out.past = { open: past_projects.filter(p => p.status !== "closed").length, approved: sum(past_projects.filter(p => p.status !== "closed"), p => p.approved_amount), released: sum(past_projects.filter(p => p.status !== "closed"), p => p.released_amount), noProgress: past_projects.filter(p => p.reason_open === "No progress").length, ages: oct.past.ages };
/* ── WBS for the story project (PM-maintained; baselines set by PMO) ───── */
const A1 = byKey("A1"); const phase = (name, so) => ({ id: uid("7a5c0001"), project_id: A1.id, parent_id: null, name, owner: "Nadia Fairweather", pct_complete: 0, is_milestone: false, status: "in_progress", sort_order: so });
const PH = [phase("Procurement", 1), phase("Site works", 2), phase("Equipment", 3), phase("Commissioning and handover", 4)];
const TASKS = [[0, "Agree specifications with the department", "2026-08-01", "2026-08-15", 100], [0, "Tender and vendor award", "2026-08-16", "2026-09-10", 100],
  [1, "Medical gas and electrical works", "2026-09-01", "2026-10-31", 57], [2, "Beds and lab furniture delivered", "2026-09-15", "2026-10-10", 100],
  [2, "Task trainers and AV system delivered", "2026-10-01", "2026-10-20", 100], [2, "Simulators: import and customs", "2026-09-15", "2026-11-30", 25],
  [3, "Installation and commissioning", "2026-11-15", "2026-12-15", 0], [3, "Staff training", "2026-12-16", "2026-12-28", 0], [3, "Handover to Clinical Skills Lab", "2026-12-29", "2026-12-29", 0]];
const project_tasks = [...PH, ...TASKS.map(([ph, name, start_date, end_date, pct], i) => ({ id: uid("7a5c0001"), project_id: A1.id, parent_id: PH[ph].id, name, owner: "Nadia Fairweather",
  start_date, end_date, baseline_start: start_date, baseline_end: name.startsWith("Simulators") ? "2026-11-10" : end_date, pct_complete: pct, is_milestone: start_date === end_date,
  status: pct === 100 ? "done" : pct > 0 ? "in_progress" : "not_started", sort_order: i + 1 }))];
const leaves = project_tasks.filter(t => !project_tasks.some(c => c.parent_id === t.id));
const wDays = (t) => Math.max(day(t.end_date) - day(t.start_date), 1);
const wbsPct = r(leaves.reduce((s2, t) => s2 + t.pct_complete * wDays(t), 0) / leaves.reduce((s2, t) => s2 + wDays(t), 0), 1);
out.wbs = { leaves: leaves.length, weighted_pct: wbsPct };

/* ── Reconciliation checks (to automate) ────────────────────────────────── */
const ok = []; const chk = (name, cond) => ok.push([cond ? "PASS" : "FAIL", name]);
const appr = (p) => ["approved", "closed"].includes(p.workflow_stage);
chk("48 CAPEX + 2 investment", capex.length === 48 && inv.length === 2);
chk("Total CAPEX == DF sum == portfolio_dashboard.total_capex", before.dash.total_capex === sum(capex, p => p.df_recommended_amount));
chk("bac > 0 only on approved/closed", capex.every(p => appr(p) ? p.bac > 0 : p.bac === 0));
chk("bac <= DF on every project", projects.every(p => p.bac <= p.df_recommended_amount));
chk("released <= bac on approved; released only where release date set", projects.every(p => (!appr(p) || p.amount_released <= p.bac) && ((p.amount_released > 0) === !!p.budget_release_date)));
chk("actual_start_date == budget_release_date (trg_sync_actual_start)", projects.every(p => !p.budget_release_date || p.actual_start_date === p.budget_release_date));
chk("payments_made <= released", projects.every(p => p.payments_made <= p.amount_released));
chk("actual_cost <= released", projects.every(p => p.actual_cost <= p.amount_released));
chk("pct > 0 only on approved/closed with release", capex.every(p => p.pct_complete === 0 || (appr(p) && p.amount_released > 0)));
chk("closed: pct 100, actual_end set, pcd set", capex.filter(p => p.workflow_stage === "closed").every(p => p.pct_complete === 100 && p.actual_end_date && p.pcd_received_date));
chk("duration_months == calcDurationMonths(start,end)", projects.every(p => p.duration_months === months(p.start_date, p.end_date)));
chk("no project SPI in [0.95,1.00) and no CPI in [0.95,1.00) (threshold-proof)", [...projects, ...after1].filter(p => p.portfolio === "capex").map(p => metrics(p)).every(m => !(m.spi >= 0.95 && m.spi < 1) && !(m.cpi >= 0.95 && m.cpi < 1)));
chk("story: delayed -> on_time, budget flag unchanged", before.story.schedule_flag === "delayed" && after.story.schedule_flag === "on_time" && before.story.budget_flag === after.story.budget_flag);
chk("Delayed count drops by exactly 1; On schedule +1; Over budget unchanged", after.dash.delayed_count === before.dash.delayed_count - 1 && after.dash.on_time_count === before.dash.on_time_count + 1 && after.dash.over_budget_count === before.dash.over_budget_count);
chk("only delayed/on_time/ev/cpi/spi/health change on the dashboard", Object.keys(after.dash).filter(k => JSON.stringify(after.dash[k]) !== JSON.stringify(before.dash[k])).every(k => ["on_time_count", "delayed_count", "total_ev", "portfolio_cpi", "portfolio_spi", "portfolio_health"].includes(k)));
chk("High risks -1, Medium +1, Critical 0", out.riskSev[1][2] === out.riskSev[1][1] - 1 && out.riskSev[2][2] === out.riskSev[2][1] + 1 && out.riskSev[0][1] === 0);
chk("at_risk_projects unchanged by the story (date-only view)", JSON.stringify(atRisk(projects)) === JSON.stringify(atRisk(after1)));
chk("Compare: only Hillview row changes, only Deliverables cell", after.compare.filter((c, i) => JSON.stringify(c) !== JSON.stringify(before.compare[i])).map(c => c.campus).join() === "Hillview");
chk("cash plan capex+pmdc == Total CAPEX DF; investment plan == investment DF", out.cash.capex + out.cash.pmdc === before.dash.total_capex && out.cash.inv === out.headline.invDf);
chk("cash rows per project sum to its DF", projects.every(p => sum(project_cashflows.filter(c => c.project_id === p.id), c => c.amount) === p.df_recommended_amount));
chk("PMDC rows only on CAPEX projects; investment rows only on investment", project_cashflows.every(c => (c.bucket === "investment") === (projects.find(p => p.id === c.project_id).portfolio === "investment")));
chk("monthly plan sums to total", out.cash.monthly.reduce((s, m) => s + m[1], 0) === before.dash.total_capex);
chk("deliverable lines per project == linked PDD grand total and <= DF", DELIV_KEYS.every(k => sum(project_deliverables.filter(d => d.project_id === byKey(k).id), d => d.total) === sumItems(k) && sumItems(k) <= byKey(k).df_recommended_amount));
chk("deliverables only where project_has_deliverables (approved PDD linked)", new Set(project_deliverables.map(d => d.project_id)).size === epdd_pdds.filter(e => ["PMO Approved", "All Approved"].includes(e.epdd_status) && e.linked_project_id).length);
chk("incoming PDD: rules-3 verdict needs_changes with exactly one fail (budget)", rv.verdict === "needs_changes" && rv.checks.filter(c => c.status === "fail").map(c => c.id).join() === "budget" && rv.linkSource === "auto");
chk("PMO Review badge == 1 (is_history=false, seen_at null)", epdd_pdds.filter(e => !e.is_history && !e.seen_at && e.queue !== "removed").length === 1);
chk("SU list total == card; budget_reduction == SU list - DF", suTotal - before.dash.total_capex === out.headline.budgetReduction);
chk("carry forward card == list total", cfTotal === sum(carry_forward_projects, c => c.amount));
chk("board replay: Sep headline recomputes identically", JSON.stringify(computeFigures(reportRows(sepB), { ym: "2026-09", asAt: periodOf("2026-09").end, builtAt: sepB, compare: augRep }).headline) === JSON.stringify(sep.headline));
chk("board replay at NOW reproduces live rows (no log entry after NOW)", activity_log.every(e => e.created_at < NOW));
chk("board Oct headline == dashboard (count, DF, released)", oct.headline.capex_count === 48 && oct.headline.df_total === before.dash.total_capex && oct.headline.released_total === before.dash.budget_consumed);
chk("every CAPEX project has fiscal_year FY 26-27", capex.every(p => p.fiscal_year === FY));
chk("each project has at most one PM; PMs are project_manager role", project_assignments.every(a => USERS.find(u => u.id === a.user_id).role === "project_manager") && new Set(project_assignments.map(a => a.project_id)).size === project_assignments.length);
chk("story risk: created_by_name == PMO username (form round-trip changes only probability + date_last_reviewed)", project_risks.find(x => x._story).created_by_name === PMO.username);
{ const pageAge = (p) => { const d2 = day(TODAY) - day(p.budget_release_date); return d2 > 365 ? "over12" : d2 > 182 ? "6to12" : "under6"; };
  const pa = { under6: 0, "6to12": 0, over12: 0, undated: 0 }; past_projects.filter(p => p.status !== "closed").forEach(p => pa[pageAge(p)]++);
  chk("past-project age bands agree between the page (182/365 days) and the board report (30.44-day months)", JSON.stringify(pa) === JSON.stringify(oct.past.ages)); }
chk("no PDD-not-submitted pop-up rows (pdd_pending_projects empty: no start within 0..19 days)", capex.filter(p => p.workflow_stage === "pdd_not_submitted" && day(p.start_date) - day(TODAY) >= 0 && day(p.start_date) - day(TODAY) <= 19).length === 0);
chk("story WBS weighted progress (project_task_rollup) == 52.0, the figure the PMO enters", wbsPct === 52);
for (const [s2, n] of ok) console.log(s2, n);
console.log(JSON.stringify({ hero: out.hero, story: out.story, delayed: [before.dash.delayed_count, after.dash.delayed_count], ontime: [before.dash.on_time_count, after.dash.on_time_count], over: [before.dash.over_budget_count, after.dash.over_budget_count] }));
writeFileSync(new URL("./summary.json", import.meta.url), JSON.stringify(out, null, 1));
writeFileSync(new URL("./seed.json", import.meta.url), JSON.stringify({ NOW, users: USERS, campuses: CAMPUSES, segments: SEGMENTS, sectors: SECTORS, regions: REGIONS, cost_centers: CC,
  projects: projects.map(({ _key, _pm, _pmdc, ...p }) => p), project_assignments, project_raci, project_risks: project_risks.map(({ _story, ...x }) => x), epdd_pdds, epdd_files: files,
  epdd_reviews: [{ id: 1, pdd_id: 124, content_hash: "sim", status: "done", verdict: rv.verdict, summary: rv.summary, checks: rv.checks, model: "rules-3", created_at: "2026-10-14T11:24:00Z", finished_at: "2026-10-14T11:24:02Z" }],
  project_deliverables, project_tasks, project_cashflows, activity_log, carry_forward_projects, past_projects,
  board_reports: [{ period: "2026-08-01", kind: "reconstructed", status: "published", figures: aug }, { period: "2026-09-01", kind: "monthly", status: "published", figures: sep }],
  settings: { spi_threshold: SPI_T, cpi_threshold: CPI_T, su_list_total: suTotal } }, null, 1));
