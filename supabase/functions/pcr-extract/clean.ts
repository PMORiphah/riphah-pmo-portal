// Pure helpers of pcr-extract: which files are PCRs, and what is kept from a reading (code, not the model, decides).
type Row = Record<string, unknown>;
export const PCR_FILE = /(^|[^a-z])pcr([^a-z]|$)|change[\s_-]*request/i;
export const ROLES = ["Project Manager", "SU Head", "PMO Endorsement", "Senior Manager Procurement",
  "Director Operations", "Director Finance", "VC/ED Recommendation", "MT/Chancellor Approval"];
export const TYPES = ["budget", "scope", "schedule", "deliverable", "other"];
export const STATUSES = ["signed", "named", "pending", "blank"];


const PLACEHOLDER = /click or tap (here )?to enter (a )?(text|date)\.?|click or tap here/gi;
const text = (v: unknown, max = 3000) => {
  const s = String(v ?? "").replace(PLACEHOLDER, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return s ? s.slice(0, max) : null;
};
const number = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]|rs\.?|\/-|pkr/gi, ""));
  return isFinite(n) ? n : null;
};
const isoDate = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(+d) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export function cleanReading(data: Row) {
  const k = data.amount_scale === "millions" ? 1e6 : data.amount_scale === "thousands" ? 1e3 : 1;
  const money = (v: unknown) => { const n = number(v); return n == null ? null : Math.round(n * k * 100) / 100; };
  const checks: string[] = [];
  const baseline = money(data.baseline_cost), additional = money(data.additional_cost);
  let revised = money(data.revised_cost);
  if (revised == null && baseline != null && additional != null) {
    revised = Math.round((baseline + additional) * 100) / 100;
    checks.push("Revised budget worked out as baseline + additional (the form does not state it).");
  } else if (revised != null && baseline != null && additional != null && Math.abs(baseline + additional - revised) > 1) {
    checks.push(`Baseline + additional (${(baseline + additional).toLocaleString("en-US")}) is not the revised budget on the form (${revised.toLocaleString("en-US")}).`);
  }
  const deliverables = (Array.isArray(data.deliverables) ? data.deliverables as Row[] : []).map(d => {
    const qty = number(d.qty), unit_cost = money(d.unit_cost);
    let total = money(d.total);
    if (total == null && qty != null && unit_cost != null) total = Math.round(qty * unit_cost * 100) / 100;
    return { item: text(d.item, 300), qty, unit_cost, total };
  }).filter(d => d.item && !/^(sub ?total|grand total|total)\b/i.test(d.item)).slice(0, 60);
  const lineSum = deliverables.reduce((s, d) => s + (d.total ?? 0), 0);
  if (additional != null && deliverables.length > 1 && deliverables.every(d => d.total != null) && Math.abs(lineSum - additional) > 1)
    checks.push(`The deliverable lines add up to ${lineSum.toLocaleString("en-US")}, not the additional cost (${additional.toLocaleString("en-US")}).`);
  const given = new Map<string, Row>();
  for (const a of (Array.isArray(data.approvals) ? data.approvals as Row[] : []))
    if (ROLES.includes(String(a.role)) && !given.has(String(a.role))) given.set(String(a.role), a);
  const approvals = ROLES.map(role => {
    const a = given.get(role) ?? {};
    const status = STATUSES.includes(String(a.status)) ? String(a.status) : "blank";
    const name = text(a.name, 120);
    return { role, name: name && !/^(for |click)/i.test(name) ? name : null, status };
  });
  const change_types = [...new Set((Array.isArray(data.change_types) ? data.change_types as string[] : []).filter(t => TYPES.includes(t)))];
  const currency = /^[A-Z]{3}$/.test(String(data.currency ?? "")) ? String(data.currency) : "PKR";
  return {
    pcr_date: isoDate(data.pcr_date), form_project_id: text(data.form_project_id, 80), form_project_name: text(data.form_project_name, 300),
    strategic_unit: text(data.strategic_unit, 200), change_name: text(data.change_name, 400), pcr_label: text(data.pcr_label, 300),
    problem: text(data.problem), description: text(data.description), justification: text(data.justification), impact: text(data.impact),
    change_types, currency, baseline_cost: baseline, additional_cost: additional, revised_cost: revised,
    baseline_duration: text(data.baseline_duration, 120), start_date: isoDate(data.start_date), finish_date: isoDate(data.finish_date),
    deliverables, approvals, checks, note: text(data.note, 400),
  };
}

