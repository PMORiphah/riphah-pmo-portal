// Portfolio demo: currency. The fictional data is kept in one base currency; the backend converts every
// amount it sends to the page into the visitor's currency (out) and every amount the page saves back
// into the base currency (in), at the fixed demo rate. Counts, percentages and ratios are untouched.
const VIEW_MONEY = ["earned_value", "planned_value", "eac", "cost_variance", "schedule_variance"];
const PROJECT = ["su_requested_amount", "df_recommended_amount", "bac", "amount_released", "payments_made", "actual_cost"];
const DASH = ["carry_forward_amount", "payments_pending_amount", "su_requested_total", "df_recommended_total", "approved_total", "budget_reduction",
  "total_capex", "budget_consumed", "budget_remaining", "payments_made_total", "total_ev", "total_pv", "total_ac"];
export const MONEY = {
  projects: PROJECT, project_metrics: [...PROJECT, ...VIEW_MONEY], portfolio_dashboard: DASH, portfolio_metrics: DASH,
  investment_metrics: ["su_requested_total", "df_recommended_total", "approved_total", "released_total", "payments_made_total"],
  at_risk_projects: ["df_recommended_amount"], project_cashflows: ["amount"], carry_forward_projects: ["amount"],
  past_projects: ["approved_amount", "released_amount"], past_project_summary: ["approved_amount", "released_amount"],
  project_payments: ["gross", "tax", "net"],
  project_deliverables: ["unit_cost", "total", "prev_unit_cost", "prev_total", "revised_unit_cost", "revised_total"],
  inventory_items: ["net_price", "total", "open_value", "to_invoice_value"],
  epdd_pdds: ["grand_total", "estimated_total"], benefits_realized: ["value_pkr"], benefits_realized_full: ["value_pkr"],
  project_pcrs: ["baseline_cost", "additional_cost", "revised_cost"],
};
// Inside the monthly report's frozen figures: the keys that are amounts.
const FIG_KEYS = new Set(["df", "df_total", "bac", "approved_bac", "released", "released_total", "released_on_approved", "approved_not_released",
  "investment_df", "investment_released", "pmdc_df", "plan", "plan_cum", "released_cum", "plan_total", "plan_on_deleted", "released_undated",
  "amount", "change", "total", "approved", "backdated", "corrections"]);

const r2 = (v) => Math.round(v * 100) / 100;
const conv = (v, f) => (v == null || v === "" || !isFinite(Number(v)) ? v : r2(Number(v) * f));
const deep = (o, f, keys) => {
  if (Array.isArray(o)) return o.map((x) => deep(x, f, keys));
  if (!o || typeof o !== "object") return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "number" && keys.has(k) ? r2(v * f) : (v && typeof v === "object" ? deep(v, f, keys) : v);
  return out;
};
// Amounts written in text: "PKR 4,125,000", "PKR 3.5M", or a published figure such as "948.17M".
const fmtNum = (n, decimals) => n.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const convText = (s, f) => typeof s !== "string" ? s : s
  .replace(/\bPKR\s?([\d,]*\d(?:\.\d+)?)(?:\s?(M|million)\b)?/g, (m, n, unit) => {
    const v = parseFloat(n.replace(/,/g, "")) * (unit ? 1e6 : 1) * f;
    return "PKR " + (unit || v >= 1e6 ? window.__dmM?.(v, 1) ?? fmtNum(v / 1e6, 1) + "M" : fmtNum(Math.round(v), 0));
  })
  .replace(/^(\d[\d,]*(?:\.\d+)?)M$/, (m, n) => window.__dmM?.(parseFloat(n.replace(/,/g, "")) * 1e6 * f, 2) ?? m);

const settingOut = (key, v, f) => {
  if (key === "dashboard_kpis" && v && typeof v === "object") {
    const out = {};
    for (const [k, card] of Object.entries(v)) {
      if (!card || typeof card !== "object") { out[k] = card; continue; }
      out[k] = { ...card, value: convText(card.value, f) };
      if (Array.isArray(card.list)) out[k].list = card.list.map((x) => ({ ...x, amount: conv(x.amount, f) }));
    }
    return out;
  }
  if (key === "dashboard_breakdowns") return deep(v, f, new Set(["bac", "df", "released"]));
  return v;
};

/** A row as the page sees it (f = 1 / rate) or as it is stored (f = rate). */
export function convertRow(table, row, f) {
  if (f === 1 || !row || typeof row !== "object") return row;
  const cols = MONEY[table];
  let out = row;
  const set = (k, v) => { if (out === row) out = { ...row }; out[k] = v; };
  if (cols) for (const c of cols) if (c in row) set(c, conv(row[c], f));
  if (table === "epdd_pdds" && row.pdd) set("pdd", deep(row.pdd, f, new Set(["unit_cost", "total", "grand_total", "estimated_total"])));
  if (table === "project_pcrs" && row.deliverables) set("deliverables", deep(row.deliverables, f, new Set(["unit_cost", "total"])));
  if (table === "inventory_items" && row.raw && "Net Price" in row.raw) set("raw", { ...row.raw, "Net Price": conv(row.raw["Net Price"], f) });
  if (table === "board_reports") {
    if (row.figures) set("figures", deep(row.figures, f, FIG_KEYS));
    if (row.note) set("note", convText(row.note, f));
  }
  if (table === "settings" && "value" in row) set("value", settingOut(row.key, row.value, f));
  if (table === "comments" && row.body) set("body", convText(row.body, f));
  if (table === "epdd_reviews") {
    // Text in the checks, and the matched plan project's DF (checks[].linked / candidates[].df).
    if (row.checks) set("checks", JSON.parse(JSON.stringify(row.checks), (k, v) => (typeof v === "string" ? convText(v, f) : k === "df" && typeof v === "number" ? r2(v * f) : v)));
    if (row.summary) set("summary", convText(row.summary, f));
  }
  if (table === "activity_log" && row.details && (row.details.old || row.details.new)) {
    const keys = new Set(MONEY[row.entity_type] || []);
    if (keys.size) set("details", { ...row.details, old: deep(row.details.old, f, keys), new: deep(row.details.new, f, keys) });
  }
  return out;
}
