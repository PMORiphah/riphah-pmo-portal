// Portfolio demo: the assistant. In a real deployment a language model turns the question into a plan
// and code computes the answer from the database. Here the plan step is a set of question patterns;
// every figure, count and list is still worked out by code from the demo's current data, as the
// visitor's role sees it (a project manager only counts their own projects).
import { read } from "./demoPolicy.js";

let money = (n) => `${(Number(n || 0) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
/** Stage 5 ("Make it yours"): the currency format the answers use. */
export const setMoneyFormat = (f) => { if (typeof f === "function") money = f; };

const STAGE = { pdd_not_submitted: "Proposal not submitted", identified: "Proposal submitted", df_review: "Finance review", ed_review: "Executive review",
  mt_review: "Management review", approved: "Approved", closed: "Closed" };
const STAGE_WORDS = [[/proposal not submitted|not submitted|no proposal/, "pdd_not_submitted"], [/finance review|df review/, "df_review"],
  [/executive review|ed review/, "ed_review"], [/management review|mt review/, "mt_review"], [/\bclosed\b/, "closed"], [/\bapproved\b/, "approved"]];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const isApproved = (p) => p.workflow_stage === "approved" || p.workflow_stage === "closed";
const sum = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const table = (head, rows) => `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const STOP = new Set("the a an on of in for to at is are what which show me list project projects risks risk any about tell how much many".split(" "));

export function assistant(body, me, t) {
  const q = String(body?.question || "").trim();
  const ql = q.toLowerCase();
  const pm = me.role === "project_manager";
  const scope = pm ? "your assigned projects" : "the whole capital portfolio";
  const all = read("projects", t.projects || [], t, me);
  const capex = all.filter((p) => p.portfolio === "capex");
  const out = (headline, answer, figure) => ({ answer: `*Read as: ${headline}, ${scope}.*\n\n${answer}`, headline: figure ?? null,
    used: { demo: true } });
  const plist = (rows, cols = ["Project", "Site", "Stage", "Finance recommended"]) => rows.length
    ? table(cols, rows.map((p) => [p.name, p.campus || "—", STAGE[p.workflow_stage] || p.workflow_stage, money(p.df_recommended_amount)]))
    : (pm ? "_None of your assigned projects._" : "_None._");

  // Risks on a named project
  if (/\brisk/.test(ql)) {
    if (pm) return out("risks", "The risk register is kept by the PMO; project managers don't see it in the portal. Ask the PMO about a project's risks in its Updates.");
    const keys = words(q).filter((w) => !STOP.has(w) && w.length > 2);
    const hit = keys.length ? capex.filter((p) => keys.every((k) => words(p.name).some((w) => w.startsWith(k)))) : [];
    const risks = read("project_risks_scored", t.project_risks_scored || [], t, me).filter((r) => r.status !== "closed");
    if (hit.length === 1) {
      const rs = risks.filter((r) => r.project_id === hit[0].id);
      return out(`open risks on ${hit[0].name}`, rs.length ? table(["Risk", "Severity", "Owner", "Mitigation"], rs.map((r) => [r.title, r.severity, r.owner || "—", r.mitigation_plan || "—"]))
        : `No open risks are recorded on ${hit[0].name}.`, `${rs.length} open`);
    }
    const by = {}; for (const r of risks) by[r.severity] = (by[r.severity] || 0) + 1;
    return out("open risks", `${risks.length} open risks: ${["critical", "high", "medium", "low"].filter((k) => by[k]).map((k) => `${by[k]} ${k}`).join(", ") || "none"}.` +
      (keys.length ? `\n\nNo single project matched "${keys.join(" ")}"; name it as it appears in the register.` : ""), `${risks.length} open`);
  }
  // Released
  if (/releas/.test(ql)) {
    const rel = sum(capex, (p) => p.amount_released), appr = sum(capex.filter(isApproved), (p) => p.bac);
    const top = [...capex].filter((p) => p.amount_released > 0).sort((a, b) => b.amount_released - a.amount_released).slice(0, 5);
    return out("budget released", `**${money(rel)}** released on ${capex.filter((p) => p.amount_released > 0).length} projects, against **${money(appr)}** approved.` +
      (top.length ? `\n\n${table(["Project", "Released"], top.map((p) => [p.name, money(p.amount_released)]))}` : ""), money(rel));
  }
  // No charter / proposal document
  if (/charter|no (pdd|proposal document)/.test(ql)) {
    const files = read("project_attachments", t.project_attachments || [], t, me);
    const has = new Set(files.filter((a) => /^(pdd|epdd)|charter/i.test(a.file_name || "")).map((a) => a.project_id));
    const rows = capex.filter((p) => isApproved(p) && !has.has(p.id));
    return out("approved projects without a charter in Documents", plist(rows), `${rows.length} projects`);
  }
  // No project manager
  if (/no (project )?manager|without (a )?(project )?manager|no pm\b|unassigned/.test(ql)) {
    if (pm) return out("projects without a manager", "Every project you can see is assigned to you.");
    const has = new Set((t.project_assignments || []).map((a) => a.project_id));
    const rows = capex.filter((p) => !has.has(p.id) && p.workflow_stage !== "closed");
    return out("projects with no project manager", plist(rows), `${rows.length} projects`);
  }
  // A month's cash-flow plan
  const mi = MONTHS.findIndex((m) => ql.includes(m) || ql.includes(m.slice(0, 3) + " "));
  if (mi >= 0 && /plan|cash|spend|month|for\b/.test(ql)) {
    if (pm) return out("the cash-flow plan", "The monthly cash-flow plan is kept by the PMO; project managers don't see it in the portal.");
    const y = mi >= 6 ? 2026 : 2027, month = `${y}-${String(mi + 1).padStart(2, "0")}`;
    const rows = (t.project_cashflows || []).filter((c) => String(c.month).startsWith(month) && c.bucket !== "investment");
    const by = {}; for (const c of rows) by[c.project_name] = (by[c.project_name] || 0) + Number(c.amount || 0);
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = sum(rows, (c) => c.amount);
    return out(`cash-flow plan for ${MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1)} ${y}`, `**${money(total)}** planned on ${Object.keys(by).length} projects.` +
      (top.length ? `\n\n${table(["Project", "Planned"], top.map(([n, a]) => [n, money(a)]))}` : ""), money(total));
  }
  // Overdue / due soon
  if (/overdue|late|behind|past (their|the) (end|deadline)|delayed/.test(ql)) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = capex.filter((p) => p.end_date && p.end_date < today && !p.actual_end_date && p.workflow_stage !== "closed")
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
    return out("projects past their planned finish", rows.length ? table(["Project", "Site", "Planned finish", "% complete"], rows.map((p) => [p.name, p.campus || "—", p.end_date, `${p.pct_complete || 0}%`]))
      : "No project is past its planned finish.", `${rows.length} overdue`);
  }
  // Stage: one stage, or the mix
  const st = STAGE_WORDS.find(([re]) => re.test(ql));
  if (st || /stage|pipeline|where .* stand|status/.test(ql)) {
    if (st && !/where .* stand/.test(ql)) {
      const rows = capex.filter((p) => p.workflow_stage === st[1]);
      return out(`projects at ${STAGE[st[1]]}`, `${rows.length} projects, ${money(sum(rows, (p) => p.df_recommended_amount))} finance-recommended.\n\n${plist(rows)}`, `${rows.length} projects`);
    }
    const by = Object.keys(STAGE).map((k) => [STAGE[k], capex.filter((p) => p.workflow_stage === k)]).filter(([, l]) => l.length);
    const df = sum(capex, (p) => p.df_recommended_amount), appr = capex.filter(isApproved), rel = sum(capex, (p) => p.amount_released);
    return out("where the portfolio stands", `**${capex.length} projects**, ${money(df)} finance-recommended; ${appr.length} approved (${money(sum(appr, (p) => p.bac))}), ${money(rel)} released.\n\n` +
      table(["Stage", "Projects", "Finance recommended"], by.map(([n, l]) => [n, String(l.length), money(sum(l, (p) => p.df_recommended_amount))])), `${capex.length} projects`);
  }
  // Largest projects
  const topN = /(?:top|largest|biggest)\s*(\d+)?/.exec(ql);
  if (topN) {
    const n = Math.min(Number(topN[1]) || 5, 15);
    const rows = [...capex].sort((a, b) => b.df_recommended_amount - a.df_recommended_amount).slice(0, n);
    return out(`the ${n} largest projects by finance recommendation`, plist(rows), money(sum(rows, (p) => p.df_recommended_amount)));
  }
  // A site
  const sites = [...new Set(capex.map((p) => p.campus).filter(Boolean))];
  const site = sites.find((s) => ql.includes(s.toLowerCase()));
  if (site) {
    const rows = capex.filter((p) => p.campus === site);
    return out(`projects at ${site}`, `${rows.length} projects, ${money(sum(rows, (p) => p.df_recommended_amount))} finance-recommended, ${money(sum(rows, (p) => p.amount_released))} released.\n\n${plist(rows)}`, `${rows.length} projects`);
  }
  // Total / how many
  if (/total|how many|overall|budget|capex|portfolio/.test(ql)) {
    const df = sum(capex, (p) => p.df_recommended_amount);
    return out("portfolio totals", `**${capex.length} projects**, ${money(df)} finance-recommended, ${money(sum(capex.filter(isApproved), (p) => p.bac))} approved, ${money(sum(capex, (p) => p.amount_released))} released.`, money(df));
  }
  return { answer: "In this demo I answer questions like these (every figure is worked out from the demo's data, for your role):\n\n" +
    "- Where do we stand overall?\n- How much has been released?\n- Which projects are overdue?\n- Which projects are at management review?\n" +
    (pm ? "- What stage are my projects at?\n" : "- What is planned for November?\n- Which projects have no project manager?\n- What are the risks on the Clinical Skills Lab?\n- Top 5 projects\n") +
    "\nIn your deployment the assistant understands free questions in plain English (or another language) and still computes every figure in code, never by the AI.",
    headline: null, used: { demo: true, fallback: true } };
}
