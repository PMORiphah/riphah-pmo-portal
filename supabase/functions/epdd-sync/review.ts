/* ─────────────────────────────────────────────────────────────────────────────
   PDD REVIEW, LAYER 1 — code checks (phase 3, approved by the PMO 30 Sep 2026)

   Exact checks only; nothing here guesses. Each check is pass / fail / warn /
   info. Any fail makes the result "needs_changes", otherwise "ready". The model
   (phase 4) will add judgement checks on top, but it never sets the result.

   Groups: Completeness · Cost table · Schedule · Documents · Budget.
   `comment` is text the PMO can paste back to the submitter, in the style the
   PMO already uses in the E-PDD portal ("Attachments Missing: …"). Budget
   notes are `internal`: they are for the PMO, not the submitter.
   ───────────────────────────────────────────────────────────────────────────── */

export const RULES_VERSION = "rules-3";

type Row = Record<string, unknown>;
export type Status = "pass" | "fail" | "warn" | "info";
export interface Check {
  id: string; group: string; label: string; status: Status; detail: string;
  items?: string[]; comment?: string; internal?: boolean; candidates?: Candidate[]; linked?: Candidate | null;
  link_source?: string | null; verdict?: string;   // verdict: the model's own answer (AI checks)
}
export interface Candidate { id: string; name: string; code: string | null; campus: string | null;
  df: number | null; stage: string | null; score: number; name_sim: number; why: string[] }

const FY_END = "2027-06-30";
const MONEY_TOL = 1;          // rupees
const DURATION_TOL_DAYS = 3;  // the E-PDD's own duration arithmetic is a few days loose

const fmt = (n: number | null | undefined) =>
  n == null || !isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const currencyOf = (p: Row, row: Row) => (norm(p.currency ?? row.currency) || "PKR").toUpperCase();
const lc = (s: unknown) => norm(s).toLowerCase();

// ── Completeness ─────────────────────────────────────────────────────────────
const REQUIRED: Array<[string, string]> = [
  ["project_name", "Project Name"], ["campus", "Campus"], ["project_type", "Project Type"],
  ["cost_center", "Cost Center"], ["problem", "Problem"], ["opportunity", "Opportunity"],
  ["proposed_solution", "Proposed Solution"], ["objectives", "Objectives"],
  ["success_criteria", "Success Criteria"], ["stakeholders", "Stakeholders"],
  ["start_date", "Start Date"], ["finish_date", "Finish Date"],
];
const SUBSTANTIVE: Array<[string, string]> = [
  ["problem", "Problem"], ["proposed_solution", "Proposed Solution"],
  ["objectives", "Objectives"], ["success_criteria", "Success Criteria"],
];

function completeness(p: Row, row: Row): Check[] {
  const out: Check[] = [];
  const missing: string[] = [];
  for (const [k, label] of REQUIRED) if (!norm(p[k] ?? row[k])) missing.push(label);
  const items = (p.items as Row[]) || [];
  if (!items.length) missing.push("Description of Items (cost table)");
  const risks = ((p.risks as Row[]) || []).filter(r => norm(r.risk));
  if (!risks.length) missing.push("Risks");
  else if (risks.some(r => !norm(r.impact))) missing.push("Risk Impact (for every risk)");
  const experts = ((p.experts as Row[]) || []).filter(e => norm(e.name));
  if (!experts.length) missing.push("Technical Expert");
  if (!(Number(p.estimated_total) > 0)) missing.push("Estimated Total Cost");
  out.push(missing.length
    ? { id: "required", group: "Completeness", label: "Required fields", status: "fail",
        detail: `${missing.length} required field${missing.length === 1 ? " is" : "s are"} empty.`, items: missing,
        comment: `Missing Information: Please fill in ${missing.join(", ")}.` }
    : { id: "required", group: "Completeness", label: "Required fields", status: "pass",
        detail: "Every required field is filled in." });

  const recommended: string[] = [];
  if (!norm(p.related_target)) recommended.push("Related Target");
  if (!norm(p.description) || lc(p.description) === lc(p.project_name)) recommended.push("Project Description");
  if (recommended.length) out.push({ id: "recommended", group: "Completeness", label: "Supporting fields",
    status: "info", detail: `Empty or only repeats the project name: ${recommended.join(", ")}.`, items: recommended });

  // Very short answers and answers pasted into two fields. These are the things
  // a reader notices at once; judging the content itself is the model's job.
  const thin: string[] = [];
  for (const [k, label] of SUBSTANTIVE) {
    const v = norm(p[k]);
    if (v && v.length < 40) thin.push(`${label} ("${v}")`);
  }
  const copies: string[] = [];
  const keys: Array<[string, string]> = [["problem", "Problem"], ["opportunity", "Opportunity"],
    ["proposed_solution", "Proposed Solution"], ["objectives", "Objectives"],
    ["success_criteria", "Success Criteria"], ["related_target", "Related Target"]];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = lc(p[keys[i][0]]), b = lc(p[keys[j][0]]);
    if (a.length > 30 && a === b) copies.push(`${keys[i][1]} and ${keys[j][1]} are identical`);
  }
  if (thin.length || copies.length) out.push({ id: "thin", group: "Completeness",
    label: "Short or repeated answers", status: "warn",
    detail: [thin.length ? `Very short: ${thin.join("; ")}.` : "", copies.length ? `${copies.join("; ")}.` : ""]
      .filter(Boolean).join(" "),
    items: [...thin, ...copies],
    comment: `Please elaborate: ${[...thin.map(t => t.replace(/ \(".*"\)$/, "")), ...copies].join("; ")}.` });
  else out.push({ id: "thin", group: "Completeness", label: "Short or repeated answers", status: "pass",
    detail: "No field is a one-liner or a copy of another." });

  const noContact = experts.filter(e => !norm(e.email) && !norm(e.contact)).map(e => norm(e.name));
  if (noContact.length) out.push({ id: "expert_contact", group: "Completeness", label: "Technical expert contact",
    status: "warn", detail: `No email or phone for ${noContact.join(", ")}.`,
    comment: `Technical Expert: Please add the email or contact number of ${noContact.join(", ")}.` });
  return out;
}

// ── Cost table ───────────────────────────────────────────────────────────────
function costs(p: Row, row: Row): Check[] {
  const out: Check[] = [];
  const items = (p.items as Row[]) || [];
  if (!items.length) return out;   // already a required-field failure
  const bad: string[] = [], incomplete: string[] = [], nonPositive: string[] = [], free: string[] = [];
  let sum = 0;
  items.forEach((it, i) => {
    const q = it.qty as number | null, u = it.unit_cost as number | null, t = it.total as number | null;
    const n = `Line ${i + 1}${norm(it.description) ? ` (${norm(it.description).slice(0, 48)}${norm(it.description).length > 48 ? "…" : ""})` : ""}`;
    if (q == null || u == null || t == null) { incomplete.push(n); if (t != null) sum += t; return; }
    sum += t;
    // A zero line is how complimentary items are entered; only negatives are wrong.
    if (t < 0 || q < 0 || u < 0) nonPositive.push(n);
    else if (t === 0 || u === 0) free.push(n);
    const expect = q * u;
    if (Math.abs(expect - t) > MONEY_TOL) bad.push(`${n}: ${fmt(q)} × ${fmt(u)} = ${fmt(expect)}, entered ${fmt(t)}`);
  });
  const lineIssues = [...incomplete.map(x => `${x}: quantity, unit cost or total missing`), ...bad,
                      ...nonPositive.map(x => `${x}: negative amount`)];
  out.push(lineIssues.length
    ? { id: "line_math", group: "Cost table", label: "Quantity × unit cost", status: "fail",
        detail: `${lineIssues.length} line${lineIssues.length === 1 ? "" : "s"} do not add up.`, items: lineIssues,
        comment: `Cost Table: Please correct ${lineIssues.length === 1 ? "this line" : "these lines"} (quantity × unit cost must equal the total): ${lineIssues.join("; ")}.` }
    : { id: "line_math", group: "Cost table", label: "Quantity × unit cost", status: "pass",
        detail: `All ${items.length} line${items.length === 1 ? "" : "s"} add up.` });
  if (free.length) out.push({ id: "free_lines", group: "Cost table", label: "Lines at no cost", status: "info",
    detail: `${free.length} line${free.length === 1 ? " is" : "s are"} priced at zero (complimentary?).`, items: free });

  const grand = row.grand_total as number | null ?? (p.grand_total as number | null);
  const est = row.estimated_total as number | null ?? (p.estimated_total as number | null);
  const cur = currencyOf(p, row);
  if (grand == null) out.push({ id: "grand_sum", group: "Cost table", label: "Lines = grand total", status: "fail",
    detail: "No grand total was entered.", comment: "Cost Table: Please enter the grand total." });
  else if (Math.abs(sum - grand) > MONEY_TOL) out.push({ id: "grand_sum", group: "Cost table",
    label: "Lines = grand total", status: "fail",
    detail: `The lines add up to ${fmt(sum)} but the grand total says ${fmt(grand)} (difference ${fmt(grand - sum)}).`,
    comment: `Cost Table: The items add up to ${cur} ${fmt(sum)}, but the grand total is ${cur} ${fmt(grand)}. Please correct it.` });
  else out.push({ id: "grand_sum", group: "Cost table", label: "Lines = grand total", status: "pass",
    detail: `Lines add up to the grand total, ${cur} ${fmt(grand)}.` });

  if (grand != null && est != null) out.push(Math.abs(grand - est) > MONEY_TOL
    ? { id: "grand_est", group: "Cost table", label: "Grand total = estimated total cost", status: "fail",
        detail: `Grand total ${cur} ${fmt(grand)} but Estimated Total Cost ${cur} ${fmt(est)}.`,
        comment: `Cost Table: The grand total (${cur} ${fmt(grand)}) and the Estimated Total Cost (${cur} ${fmt(est)}) do not match.` }
    : { id: "grand_est", group: "Cost table", label: "Grand total = estimated total cost", status: "pass",
        detail: "They match." });
  return out;
}

// ── Schedule ─────────────────────────────────────────────────────────────────
const dayMs = 86_400_000;
const toDate = (s: unknown) => { const m = String(s ?? "").match(/^\d{4}-\d{2}-\d{2}/); return m ? new Date(m[0] + "T00:00:00Z") : null; };
// "2 months 1 day", "1 year", "21 days" → days (months at 30.44, years at 365)
export function durationDays(s: unknown): number | null {
  const t = lc(s);
  if (!t) return null;
  let d = 0, hit = false;
  for (const [re, mul] of [[/(\d+)\s*years?/, 365], [/(\d+)\s*months?/, 30.44], [/(\d+)\s*weeks?/, 7], [/(\d+)\s*days?/, 1]] as Array<[RegExp, number]>) {
    const m = t.match(re); if (m) { d += Number(m[1]) * mul; hit = true; }
  }
  return hit ? d : null;
}

function schedule(p: Row, row: Row): Check[] {
  const out: Check[] = [];
  const s = toDate(p.start_date ?? row.start_date), f = toDate(p.finish_date ?? row.finish_date);
  if (!s || !f) return out;   // required-field failure already
  const days = Math.round((f.getTime() - s.getTime()) / dayMs);
  if (days <= 0) {
    out.push({ id: "order", group: "Schedule", label: "Start before finish", status: "fail",
      detail: `The finish date (${p.finish_date}) is ${days === 0 ? "the same as" : "before"} the start date (${p.start_date}).`,
      comment: "Dates: The finish date must be after the start date. Please correct the schedule." });
    return out;
  }
  out.push({ id: "order", group: "Schedule", label: "Start before finish", status: "pass",
    detail: `${p.start_date} → ${p.finish_date} (${days} days).` });

  const stated = durationDays(p.estimated_duration);
  if (stated == null) out.push({ id: "duration", group: "Schedule", label: "Duration matches the dates",
    status: "warn", detail: "No estimated duration was given.",
    comment: "Dates: Please state the estimated duration." });
  else if (Math.abs(stated - days) > DURATION_TOL_DAYS) out.push({ id: "duration", group: "Schedule",
    label: "Duration matches the dates", status: "warn",
    detail: `"${norm(p.estimated_duration)}" is about ${Math.round(stated)} days, but the dates span ${days} days.`,
    comment: `Dates: The estimated duration ("${norm(p.estimated_duration)}") does not match the start and finish dates (${days} days).` });
  else out.push({ id: "duration", group: "Schedule", label: "Duration matches the dates", status: "pass",
    detail: `"${norm(p.estimated_duration)}" matches the ${days} days between the dates.` });

  // When the PDD was first created in the E-PDD portal. The form's own "Date"
  // field is free to edit and is sometimes months out, so it is not used.
  const submitted = toDate(row.source_created_at) ?? toDate(row.received_at);
  if (submitted && s < submitted) {
    const late = Math.round((submitted.getTime() - s.getTime()) / dayMs);
    out.push({ id: "start_past", group: "Schedule", label: "Start date not already passed", status: "warn",
      detail: `The start date (${p.start_date}) was ${late} day${late === 1 ? "" : "s"} before the PDD was submitted (${submitted.toISOString().slice(0, 10)}).`,
      comment: "Dates: The planned start date had already passed when the PDD was submitted. Please revise the schedule." });
  }
  if (String(p.finish_date) > FY_END) out.push({ id: "fy", group: "Schedule", label: "Within FY 2026-27",
    status: "info", detail: `Finishes ${p.finish_date}, after the fiscal year ends on 30 Jun 2027.` });
  return out;
}

// ── Documents ────────────────────────────────────────────────────────────────
const ROI_RE = /\broi\b|return on investment|pay\s?-?back|cost recovery|\bsavings?\b|\bsave[sd]?\b\s+(approximately|about|around|rs|pkr|\d)/i;
type Slot = { category: string; group: string; title: string; file: string | null };

function documents(p: Row, files: Row[]): Check[] {
  const out: Check[] = [];
  const types = new Set(((p.doc_types as string[]) || []));
  const slots = ((p.file_slots as Slot[]) || []);
  const has = (cat: string, re: RegExp) => slots.some(s => s.category === cat && re.test(s.title) && s.file);
  const anyQuote = slots.some(s => s.file && (/quot/i.test(s.title) || /quot/i.test(s.file)));
  const missing: string[] = [];
  const comments: string[] = [];

  if (!types.has("General")) {
    missing.push("General documents (Deliverables, Business Plan) — the General type is not selected");
  } else {
    if (!has("general", /deliverable/i)) missing.push("Deliverables (Annexure A)");
    if (!has("general", /business/i)) missing.push("Business Plan (Annexure B)");
  }
  const text = [p.problem, p.opportunity, p.proposed_solution, p.objectives, p.success_criteria, p.related_target]
    .map(norm).join(" ");
  const roi = ROI_RE.test(text);
  if (roi && !has("general", /financial/i)) {
    missing.push("Financial Metrics (Annexure C) — the PDD claims savings or a return on investment");
    comments.push("Financial Metric: As you have mentioned savings / ROI, please attach the Financial Reports in the FINANCIAL METRICS section, including total expenses and total ROI.");
  }
  if (types.has("Simple Procurement") && !has("simpleprocurement", /quot/i)) {
    missing.push("Quotations (Simple Procurement is selected)");
    comments.push("Attachments Missing: Please attach the Quotations in the SIMPLE PROCUREMENT section.");
  }
  if (types.has("New Construction")) {
    if (!has("construction", /layout/i)) missing.push("Layout (New Construction)");
    if (!has("construction", /boq/i)) missing.push("BOQ (New Construction)");
  }
  if (types.has("Renovation/Maintenance")) {
    if (!has("renovation", /layout|draw/i)) missing.push("Layout/Drawings (Renovation/Maintenance)");
    if (!has("renovation", /boq/i)) missing.push("BOQ (Renovation/Maintenance)");
  }
  if ((types.has("New Construction") && (!has("construction", /layout/i) || !has("construction", /boq/i))) ||
      (types.has("Renovation/Maintenance") && (!has("renovation", /layout|draw/i) || !has("renovation", /boq/i))))
    comments.push("BOQs / Layouts: Please attach the BOQ and the layout/drawings of the proposed work in the CONSTRUCTION or RENOVATION section.");
  if (missing.some(m => /Deliverables|Business Plan|General documents/.test(m)))
    comments.unshift("Attachments Missing: Please attach the Deliverables (Annexure A) and Business Plan (Annexure B) in the GENERAL section.");

  out.push(missing.length
    ? { id: "docs_required", group: "Documents", label: "Required attachments", status: "fail",
        detail: `${missing.length} required attachment${missing.length === 1 ? " is" : "s are"} missing.`, items: missing,
        comment: comments.join("\n") }
    : { id: "docs_required", group: "Documents", label: "Required attachments", status: "pass",
        detail: `Everything required for ${[...types].join(", ") || "this PDD"} is attached.` });

  if (!types.has("Simple Procurement") && !anyQuote && ((p.items as Row[]) || []).length)
    out.push({ id: "no_quotes", group: "Documents", label: "Quotations", status: "warn",
      detail: "No quotation is attached anywhere. If this buys goods or services, quotes are needed.",
      comment: "Attachments Missing: If this project procures goods or services, please attach the Quotations by selecting SIMPLE PROCUREMENT in the SUPPORTING DOCUMENTS section." });

  // Same file in several slots, and files whose name says they belong elsewhere.
  const stored = new Map<string, Row>();
  for (const f of files) stored.set(`${f.category}|${f.title}|${f.file_name}`, f);
  const bySig = new Map<string, string[]>();
  const misplaced: string[] = [];
  for (const s of slots) {
    if (!s.file) continue;
    const f = stored.get(`${s.category}|${s.title}|${s.file}`);
    const sig = (f?.sha256 as string) || `name:${lc(s.file)}`;
    (bySig.get(sig) ?? bySig.set(sig, []).get(sig)!).push(s.title);
    const file = s.file, name = lc(file);
    const say = (re: RegExp, what: string, okTitle: RegExp) => {
      if (re.test(name) && !okTitle.test(s.title)) misplaced.push(`${s.title} holds "${file.replace(/^\d+_/, "")}", which looks like ${what}`);
    };
    say(/quot/, "a quotation", /quot/i);
    say(/\bboq\b|bill of quantit/, "a BOQ", /boq/i);
    say(/deliverable|annex(ure)?[\s_-]*a\b/, "the Deliverables", /deliverable/i);
  }
  const dupes = [...bySig.values()].filter(t => t.length > 1).map(t => `The same file is attached as ${t.join(" and ")}`);
  if (dupes.length || misplaced.length) out.push({ id: "docs_mixup", group: "Documents",
    label: "Right file in each slot", status: "warn", detail: `${dupes.length + misplaced.length} possible mix-up${dupes.length + misplaced.length === 1 ? "" : "s"}.`,
    items: [...dupes, ...misplaced],
    comment: `Attachments: Please check the uploaded documents. ${[...dupes, ...misplaced].join("; ")}.` });
  else if (slots.some(s => s.file)) out.push({ id: "docs_mixup", group: "Documents", label: "Right file in each slot",
    status: "pass", detail: "No file is used twice and no file name looks misplaced." });

  const failed = files.filter(f => f.status === "failed");
  if (failed.length) out.push({ id: "docs_broken", group: "Documents", label: "Files open", status: "fail",
    detail: `${failed.length} attachment${failed.length === 1 ? "" : "s"} could not be downloaded from the E-PDD portal.`,
    items: failed.map(f => `${f.title}: ${f.file_name} (${f.error})`),
    comment: `Attachments: ${failed.map(f => f.title).join(", ")} could not be opened. Please upload ${failed.length === 1 ? "it" : "them"} again.` });
  return out;
}

// ── Budget: match to the FY 26-27 plan ───────────────────────────────────────
const CAMPUS_MAP: Record<string, string> = {
  "rih sihala": "RIH", "g7 campus": "G-7", "university i-14": "I-14", "al-mizan campus": "Al-Mizan",
  "gg campus": "GGC", "ferozepur road": "Lahore", "gg head office": "Central Secretariat",
};
const campusKey = (s: unknown) => lc(s).replace(/[^a-z0-9]/g, "");
const ABBR: Record<string, string> = {
  upgrad: "upgradation", upgrade: "upgradation", upgraded: "upgradation", proc: "procurement", procure: "procurement",
  purchase: "procurement", renov: "renovation", equip: "equipment", equi: "equipment", estb: "establishment",
  establish: "establishment", hosp: "hospital", devolopment: "development", dev: "development", labs: "lab",
  laboratory: "lab", rooms: "room", offices: "office", washrooms: "washroom", machines: "machine", cameras: "camera",
  kiosk: "kiosk", koisk: "kiosk", ministery: "ministry", equipments: "equipment", admis: "admission",
  mkt: "marketing", confrnce: "conference", workstations: "workstation", chairs: "chair",
};
const STOP = new Set(["of", "for", "the", "and", "at", "in", "on", "to", "a", "an", "with", "ph", "phase", "campus",
  "project", "projects", "riphah", "university", "pmdc", "x", "no", "new", "only", "other", "dep", "dept", "department"]);
export function nameTokens(s: unknown): Set<string> {
  return new Set(lc(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter(t => t && !STOP.has(t) && !/^\d+$/.test(t))
    .map(t => (ABBR[t] ?? t).slice(0, 6)));
}
// Dice similarity weighted by how rare each word is across the plan: "SAN" or
// "anatomy" says far more than "procurement" or "office", which appear in dozens
// of project names. Without the weights "New SAN for Data center" matched
// "Data Center Tier 3" and "Renovation of Admission Office" matched Marketing.
const weightedDice = (a: Set<string>, b: Set<string>, w: (t: string) => number) => {
  if (!a.size || !b.size) return 0;
  let common = 0, sa = 0, sb = 0;
  for (const t of a) { sa += w(t); if (b.has(t)) common += w(t); }
  for (const t of b) sb += w(t);
  return (2 * common) / (sa + sb);
};
const ccCode = (s: unknown) => String(s ?? "").match(/(\d{7})/)?.[1] ?? null;

export function matchProjects(row: Row, projects: Row[]): Candidate[] {
  const p = (row.pdd ?? {}) as Row;
  const name = nameTokens(row.project_name ?? p.project_name);
  const code = ccCode(row.cost_center ?? p.cost_center);
  const campus = CAMPUS_MAP[lc(row.campus ?? p.campus)] ?? null;
  const plan = projects.filter(pr => !pr.fiscal_year || pr.fiscal_year === "FY 26-27");
  const toks = new Map(plan.map(pr => [pr, nameTokens(pr.name)]));
  const df = new Map<string, number>();
  for (const t of toks.values()) for (const x of t) df.set(x, (df.get(x) ?? 0) + 1);
  const w = (t: string) => Math.log(1 + plan.length / (df.get(t) ?? 0.5));
  const out: Candidate[] = [];
  for (const pr of plan) {
    const why: string[] = [];
    const nm = weightedDice(name, toks.get(pr)!, w);
    const prCC = ccCode((pr.cost_centers as Row | null)?.name ?? pr.cost_center);
    // Same SAP cost centre, or one from the same college/department family
    // (1102006 Oral Biology sits under IIDC 1102000).
    const ccHit = !!code && code === prCC;
    const ccFamily = !ccHit && !!code && !!prCC && code.slice(0, 4) === prCC.slice(0, 4);
    const campusHit = !!campus && campusKey(pr.campus) === campusKey(campus);
    if (nm > 0) why.push(`name ${Math.round(nm * 100)}% alike`);
    if (ccHit) why.push(`same cost centre (${code})`);
    if (ccFamily) why.push(`related cost centre (${code} / ${prCC})`);
    if (campusHit) why.push(`same campus (${pr.campus})`);
    const score = 0.6 * nm + 0.25 * (ccHit ? 1 : ccFamily ? 0.6 : 0) + 0.15 * (campusHit ? 1 : 0);
    if (nm >= 0.2 || ((ccHit || ccFamily) && nm > 0)) out.push({ id: String(pr.id), name: String(pr.name), code: (pr.code as string) || null,
      campus: (pr.campus as string) || null, df: pr.df_recommended_amount == null ? null : Number(pr.df_recommended_amount),
      stage: (pr.workflow_stage as string) || null, score: Math.round(score * 100) / 100,
      name_sim: Math.round(nm * 100) / 100, why });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
export const AUTO_LINK = 0.55, AUTO_MARGIN = 0.15, POSSIBLE = 0.35;
export function autoPick(c: Candidate[]): Candidate | null {
  if (!c.length || c[0].score < AUTO_LINK) return null;
  if (c[1] && c[0].score - c[1].score < AUTO_MARGIN) return null;
  return c[0];
}

const STAGE_LABEL: Record<string, string> = { pdd_not_submitted: "PDD Not Submitted", df_review: "DF Review",
  ed_review: "ED Review", mt_review: "MT Review", approved: "Approved", closed: "Closed" };

function budget(row: Row, candidates: Candidate[], linked: Candidate | null, linkSource: string | null,
                pmoNone: boolean): Check[] {
  const budgeted = /^budgeted/i.test(norm(row.project_type)) || /^budgeted/i.test(norm((row.pdd as Row)?.project_type));
  const grand = Number(row.grand_total ?? 0);
  const how = linkSource === "pmo" ? "linked by the PMO" : "matched automatically";
  if (!budgeted) {
    // Only a close name counts here; campus and cost centre alone say nothing
    // about whether a Non-Budgeted request is secretly a plan project.
    const strong = pmoNone ? null : (linked ?? (candidates[0]?.name_sim >= 0.6 ? candidates[0] : null));
    return [strong
      ? { id: "budget", group: "Budget", label: "Budget", status: "warn", internal: true,
          detail: `Marked Non-Budgeted, but it looks like plan project "${strong.name}" (DF Recommended PKR ${fmt(strong.df)}).`,
          items: strong.why }
      : { id: "budget", group: "Budget", label: "Budget", status: "info", internal: true,
          detail: "Non-Budgeted project: not expected in the FY 26-27 plan." }];
  }
  if (!linked && pmoNone) return [{ id: "budget", group: "Budget", label: "In the FY 26-27 plan", status: "fail",
    internal: true, detail: "Marked Budgeted, but the PMO has confirmed it is not in the FY 26-27 plan.",
    comment: "Budget: This project is marked as Budgeted but is not part of the FY 2026-27 budget. Please confirm the budget head or mark it as Non-Budgeted." }];
  if (!linked) {
    const near = candidates.filter(c => c.score >= POSSIBLE);
    return [near.length
      ? { id: "budget", group: "Budget", label: "In the FY 26-27 plan", status: "warn", internal: true,
          detail: "Marked Budgeted. No certain match in the FY 26-27 plan; closest projects below. Link the right one to check the amount.",
          items: near.map(c => `${c.name} (${c.campus ?? "—"}, DF PKR ${fmt(c.df)}; ${c.why.join(", ")})`) }
      : { id: "budget", group: "Budget", label: "In the FY 26-27 plan", status: "fail", internal: true,
          detail: "Marked Budgeted, but nothing like it is in the FY 26-27 plan. Link it if it is there under another name.",
          comment: "Budget: This project is marked as Budgeted but could not be found in the FY 2026-27 budget. Please confirm the budget head or mark it as Non-Budgeted." }];
  }
  const df = linked.df ?? 0;
  const out: Check[] = [];
  const cur = currencyOf((row.pdd ?? {}) as Row, row);
  if (cur !== "PKR") {
    // The plan is in rupees. Converting is Finance's call (rate and date), so
    // the check shows both figures and leaves the comparison to the PMO.
    out.push({ id: "budget", group: "Budget", label: "Within DF Recommended", status: "warn", internal: true,
      detail: `The PDD is priced in ${cur} (${cur} ${fmt(grand)}); the DF Recommended for "${linked.name}" is PKR ${fmt(df)} (${how}). Compare them at the exchange rate Finance uses.` });
  } else {
  const over = grand - df;
  if (over > MONEY_TOL && over <= df * 0.01) out.push({ id: "budget", group: "Budget", label: "Within DF Recommended",
    status: "warn", internal: true,
    detail: `PKR ${fmt(grand)} is slightly above the DF Recommended PKR ${fmt(df)} for "${linked.name}" (${how}): PKR ${fmt(over)}, ${(over / df * 100).toFixed(2)}%.` });
  else if (over > MONEY_TOL) out.push({ id: "budget", group: "Budget", label: "Within DF Recommended", status: "fail",
    internal: true,
    detail: `PKR ${fmt(grand)} is PKR ${fmt(grand - df)} above the DF Recommended PKR ${fmt(df)} for "${linked.name}" (${how}).`,
    comment: `Budget: The requested PKR ${fmt(grand)} exceeds the budgeted amount of PKR ${fmt(df)} by PKR ${fmt(grand - df)}. Please revise the cost or provide the approval for the additional amount.` });
  else out.push({ id: "budget", group: "Budget", label: "Within DF Recommended", status: "pass", internal: true,
    detail: `PKR ${fmt(grand)} is within the DF Recommended PKR ${fmt(df)} for "${linked.name}" (${how}; PKR ${fmt(df - grand)} left).` });
  }
  if (linked.stage === "pdd_not_submitted") out.push({ id: "portal_stage", group: "Budget",
    label: "Portal stage", status: "info", internal: true,
    detail: `The portal still shows "${linked.name}" as PDD Not Submitted.` });
  else if (linked.stage) out.push({ id: "portal_stage", group: "Budget", label: "Portal stage", status: "info",
    internal: true, detail: `The portal shows "${linked.name}" at ${STAGE_LABEL[linked.stage] ?? linked.stage}.` });
  return out;
}

// How a failed check reads in the one-line summary.
function failPhrase(c: Check): string {
  switch (c.id) {
    case "required": return "required fields are empty";
    case "line_math": return "cost lines do not add up";
    case "grand_sum": return "the lines do not match the grand total";
    case "grand_est": return "grand total and estimated total differ";
    case "order": return "the finish date is not after the start date";
    case "docs_required": return "required attachments are missing";
    case "docs_broken": return "some attachments will not open";
    case "budget": return /DF/.test(c.label) ? "the cost is above the DF Recommended amount" : "not found in the FY 26-27 plan";
    default: return c.label.toLowerCase();
  }
}

// ── Whole review ─────────────────────────────────────────────────────────────
export function reviewPdd(row: Row, files: Row[], projects: Row[]) {
  const p = (row.pdd ?? {}) as Row;
  const candidates = matchProjects(row, projects);
  let linked: Candidate | null = null, linkSource: string | null = null;
  // The PMO's choice always wins: a project, or "none" (link_source pmo, no id).
  const pmoNone = row.link_source === "pmo" && !row.linked_project_id;
  if (row.linked_project_id && row.link_source === "pmo") {
    const pr = projects.find(x => x.id === row.linked_project_id);
    if (pr) {
      linked = candidates.find(c => c.id === pr.id) ?? { id: String(pr.id), name: String(pr.name), code: (pr.code as string) || null,
        campus: (pr.campus as string) || null, df: pr.df_recommended_amount == null ? null : Number(pr.df_recommended_amount),
        stage: (pr.workflow_stage as string) || null, score: 1, name_sim: 1, why: ["linked by the PMO"] };
      linkSource = "pmo";
    }
  }
  // Automatic links only for Budgeted PDDs; a Non-Budgeted one is flagged in
  // budget() only when its name is close to a plan project.
  const budgeted = /^budgeted/i.test(norm(row.project_type)) || /^budgeted/i.test(norm(p.project_type));
  if (!linked && !pmoNone && budgeted) { linked = autoPick(candidates); linkSource = linked ? "auto" : null; }

  const checks: Check[] = [
    ...completeness(p, row), ...costs(p, row), ...schedule(p, row), ...documents(p, files),
    ...budget(row, candidates, linked, linkSource, pmoNone),
  ];
  // The page shows the match and lets the PMO change it, so it travels with the check.
  for (const c of checks) if (c.group === "Budget" && c.id === "budget") {
    c.candidates = candidates; c.linked = linked; c.link_source = pmoNone ? "pmo" : linkSource;
  }
  const fails = checks.filter(c => c.status === "fail");
  const warns = checks.filter(c => c.status === "warn");
  const verdict = fails.length ? "needs_changes" : "ready";
  const summary = fails.length
    ? `Needs changes: ${fails.map(failPhrase).join("; ")}.${warns.length ? ` ${warns.length} more to look at.` : ""}`
    : warns.length ? `Ready for PMO decision, with ${warns.length} point${warns.length === 1 ? "" : "s"} to look at.`
                   : "Ready for PMO decision. Every check passed.";
  return { verdict, summary, checks, candidates, linked, linkSource: pmoNone ? "pmo" : linkSource };
}
