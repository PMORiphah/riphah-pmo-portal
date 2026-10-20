// Pure helpers of pcr-extract: which files are PCRs, and what is kept from a reading (code, not the model, decides).
type Row = Record<string, unknown>;
export const PCR_FILE = /(^|[^a-z])pcr([^a-z]|$)|change[\s_-]*request/i;
export const TYPES = ["budget", "scope", "schedule", "deliverable", "other"];
export const STATUSES = ["signed", "named", "pending", "blank"];

const PLACEHOLDER = /click or tap (here )?to enter (a )?(text|date)\.?|click or tap here/gi;
const text = (v: unknown, max = 3000) => {
  const s = String(v ?? "").replace(PLACEHOLDER, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return s ? s.slice(0, max) : null;
};
// Full rupees. The reader is told to write every amount in full; "17 million" or "1.5 crore" that slip
// through as text are converted here.
export const money = (v: unknown) => {
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase().replace(/rs\.?|pkr|\/-|,/g, "").trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(million|mn|m|crore|cr|lakh|lac|thousand|k)?$/);
  if (!m) return null;
  const k = { million: 1e6, mn: 1e6, m: 1e6, crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, thousand: 1e3, k: 1e3 }[m[2] ?? ""] ?? 1;
  const n = Number(m[1]) * k;
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const qtyOf = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return v == null || v === "" || !isFinite(n) ? null : n; };
// A date the form gets plainly wrong (a year like 2206) is left out and named in a check.
const isoDate = (v: unknown, label: string, checks: string[]) => {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(+d) || d.toISOString().slice(0, 10) !== s) return null;
  const y = +s.slice(0, 4);
  if (y < 2015 || y > 2035) { checks.push(`The ${label} on the form reads ${s}; check it against the document.`); return null; }
  return s;
};
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function cleanReading(data: Row) {
  const checks: string[] = [];
  let baseline = money(data.baseline_cost), additional = money(data.additional_cost);
  let revised = money(data.revised_cost);
  // Two of the three figures give the third (the reader sometimes leaves one out).
  if (baseline == null && additional != null && revised != null && Math.abs(revised) >= 1000) {
    baseline = Math.round((revised - additional) * 100) / 100;
    checks.push("Baseline budget worked out as revised − additional (the form's baseline box is empty or was not read).");
  } else if (additional == null && baseline != null && revised != null && Math.abs(baseline) >= 1000 && Math.abs(revised) >= 1000) {
    additional = Math.round((revised - baseline) * 100) / 100;
    checks.push("Additional cost worked out as revised − baseline (the form does not state it).");
  }
  // A budget under PKR 1,000 is a misread (e.g. "17 million" read as 17), so it is not used to work anything out.
  const odd = (n: number | null) => n != null && n !== 0 && Math.abs(n) < 1000;
  if (odd(baseline)) checks.push(`The baseline budget was read as ${fmt(baseline!)}; check it against the document.`);
  if (odd(revised)) checks.push(`The revised budget was read as ${fmt(revised!)}; check it against the document.`);
  if (revised == null && baseline != null && additional != null && !odd(baseline)) {
    revised = Math.round((baseline + additional) * 100) / 100;
    checks.push("Revised budget worked out as baseline + additional (the form does not state it).");
  } else if (revised != null && baseline != null && additional != null && !odd(baseline) && !odd(revised)
             && Math.abs(baseline + additional - revised) > 1) {
    checks.push(`Baseline + additional (${fmt(baseline + additional)}) is not the revised budget on the form (${fmt(revised)}).`);
  }
  const deliverables = (Array.isArray(data.deliverables) ? data.deliverables as Row[] : []).map(d => {
    const qty = qtyOf(d.qty), unit_cost = money(d.unit_cost);
    let total = money(d.total);
    if (total == null && qty != null && unit_cost != null) total = Math.round(qty * unit_cost * 100) / 100;
    const unit = text(d.unit, 30);
    return { item: text(d.item, 300), qty, unit: unit && !/^\d+$/.test(unit) ? unit : null, unit_cost, total };
  }).filter(d => d.item && !/^(sub ?total|grand total|total)\b/i.test(d.item)).slice(0, 60);
  // Approvals keep the row labels printed on the form (versions differ: some have "Regional Director").
  const approvals = (Array.isArray(data.approvals) ? data.approvals as Row[] : []).map(a => {
    const name = text(a.name, 120);
    return { role: text(a.role, 80), name: name && !/^(for |click)/i.test(name) ? name : null,
             status: STATUSES.includes(String(a.status)) ? String(a.status) : "blank", date: text(a.date, 24) };
  }).filter(a => a.role).slice(0, 14);
  if (!approvals.length) checks.push("No approval page was found in this document.");
  for (const n of (Array.isArray(data.form_notes) ? data.form_notes : []).slice(0, 6)) {
    const t = text(n, 300); if (t) checks.push(`On the form: ${t}`);
  }
  const change_types = [...new Set((Array.isArray(data.change_types) ? data.change_types as string[] : []).filter(t => TYPES.includes(t)))];
  const currency = /^[A-Z]{3}$/.test(String(data.currency ?? "")) ? String(data.currency) : "PKR";
  return {
    pcr_date: isoDate(data.pcr_date, "date", checks), form_project_id: text(data.form_project_id, 80),
    form_project_name: text(data.form_project_name, 300), strategic_unit: text(data.strategic_unit, 200),
    change_name: text(data.change_name, 400), pcr_label: text(data.pcr_label, 300),
    problem: text(data.problem), description: text(data.description), justification: text(data.justification), impact: text(data.impact),
    change_types, currency, baseline_cost: odd(baseline) ? null : baseline, additional_cost: additional, revised_cost: odd(revised) ? null : revised,
    baseline_duration: text(data.baseline_duration, 120),
    start_date: isoDate(data.start_date, "start date", checks), finish_date: isoDate(data.finish_date, "finish date", checks),
    deliverables, approvals, checks, note: text(data.note, 400),
  };
}
