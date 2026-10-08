import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileBarChart, Plus, ArrowLeft, Printer, Send, Mail, Users, RefreshCw, Trash2, CheckCircle2, AlertCircle, History, Eye } from "lucide-react";
import { TYPE, SP, R, BRAND } from "./theme.js";
import { Button, Modal } from "./ui.jsx";
import { loadReportRows, computeFigures, periodOf, prevYm, deltas, fmtM, fmtPKR, fmtPct, fmtDay, STAGE_NAME, CALC_VERSION } from "./reportCalc.js";

/* ═══════════════════════════════════════════════════════════════════════════
   BOARD REPORTS (PMO, 8 Oct 2026)

   The PMO builds a month's report from live data (figures in reportCalc.js,
   all computed by code), checks it, then publishes it to the people they
   choose. Publishing freezes the figures; the next month compares with them.
   Recipients get a push and a pop-up at their next sign-in; Email report sends
   it to them when the PMO presses it. Earlier month-ends (Aug, Sep 2026) can be
   rebuilt from the Activity Log as baselines, marked "reconstructed".
   The report itself is an A4 document, always in the light palette, so it
   prints (Save as PDF) exactly as it looks.
   ═══════════════════════════════════════════════════════════════════════════ */

const FIRST_YM = "2026-08";              // nothing before 21 Aug 2026 can be rebuilt
const ymNow = () => { const d = new Date(Date.now() + 5 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const monthsUpToNow = () => { const out = []; let ym = ymNow(); while (ym >= FIRST_YM) { out.push(ym); ym = prevYm(ym); } return out; };
const ymOf = (r) => String(r.period).slice(0, 7);

// Print: only the report shows, on A4.
function usePrintStyles() {
  useEffect(() => {
    if (document.getElementById("br-print-css")) return;
    const s = document.createElement("style");
    s.id = "br-print-css";
    s.textContent = `
@page { size: A4; margin: 11mm 10mm; }
@media print {
  html.br-printing body > *:not(.br-print-root) { display: none !important; }
  html.br-printing .br-print-root { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; }
  html.br-printing .br-toolbar { display: none !important; }
  html.br-printing .br-scroll { overflow: visible !important; padding: 0 !important; background: #fff !important; height: auto !important; }
  html.br-printing .br-page { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; border: 0 !important; padding: 0 !important; break-after: page; }
  html.br-printing .br-page:last-child { break-after: auto; }
  html.br-printing .br-avoid { break-inside: avoid; }
  html.br-printing * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
    document.head.appendChild(s);
  }, []);
}
const printReport = async () => {
  try { await document.fonts?.ready; } catch { /* print anyway */ }
  document.documentElement.classList.add("br-printing");
  const done = () => { document.documentElement.classList.remove("br-printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1500);
};

/* ── The document (light palette, A4) ───────────────────────────────────────── */
const C = { ink:"#0D1929", body:"#33475B", muted:"#6B8299", line:"#DCE5EE", soft:"#F4F7FB", navy:"#185078", gold:"#D89840",
  teal:"#14907A", rose:"#C2364F", amber:"#B9771C", blue:"#2C6FB0" };
const F = "Inter, 'Segoe UI', Arial, sans-serif";

const Page = ({ children, n, total, title, period }) => (
  <section className="br-page" style={{ width:794, minHeight:1123, boxSizing:"border-box", background:"#fff", margin:"0 auto 24px",
    padding:"36px 44px 30px", boxShadow:"0 8px 30px rgba(0,0,0,.28)", display:"flex", flexDirection:"column", fontFamily:F, color:C.body }}>
    <div style={{ flex:1 }}>{children}</div>
    <div style={{ marginTop:18, paddingTop:8, borderTop:`1px solid ${C.line}`, display:"flex", fontSize:9.5, color:C.muted }}>
      <span>Riphah International University · Project Management Office · {title}</span>
      <span style={{ marginLeft:"auto" }}>{period} · page {n} of {total}</span>
    </div>
  </section>
);
const H = ({ children, sub }) => (
  <div style={{ margin:"4px 0 12px", borderLeft:`4px solid ${C.gold}`, paddingLeft:12 }}>
    <div style={{ fontSize:17, fontWeight:700, color:C.ink }}>{children}</div>
    {sub && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{sub}</div>}
  </div>
);
const Note = ({ children }) => <div style={{ fontSize:9.5, color:C.muted, lineHeight:1.5, marginTop:6 }}>{children}</div>;
const th = { textAlign:"left", fontSize:9.5, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:.6, padding:"6px 8px", borderBottom:`2px solid ${C.line}` };
const td = { fontSize:11, padding:"6px 8px", borderBottom:`1px solid ${C.line}`, verticalAlign:"top", color:C.ink };
const num = { textAlign:"right", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" };
const Table = ({ head, rows, widths }) => (
  <table style={{ width:"100%", borderCollapse:"collapse", tableLayout: widths ? "fixed" : "auto" }}>
    {widths && <colgroup>{widths.map((w, i) => <col key={i} style={{ width:w }} />)}</colgroup>}
    <thead><tr>{head.map((h, i) => <th key={i} style={{ ...th, ...(h.num ? { textAlign:"right" } : {}) }}>{h.label ?? h}</th>)}</tr></thead>
    <tbody>{rows}</tbody>
  </table>
);
const Delta = ({ v, money, since }) => {
  if (v == null) return <span style={{ color:C.muted }}>no earlier report</span>;
  if (!v) return <span style={{ color:C.muted }}>no change since {since}</span>;
  const up = v > 0;
  return <span style={{ color: up ? C.teal : C.rose, fontWeight:600 }}>{up ? "+" : "−"}{money ? fmtM(Math.abs(v)) : Math.abs(v)} <span style={{ color:C.muted, fontWeight:400 }}>since {since}</span></span>;
};
const Tile = ({ label, value, sub, delta }) => (
  <div className="br-avoid" style={{ border:`1px solid ${C.line}`, borderRadius:10, padding:"12px 14px", background:C.soft }}>
    <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:.8, textTransform:"uppercase", color:C.muted }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:700, color:C.ink, marginTop:4, fontVariantNumeric:"tabular-nums" }}>{value}</div>
    <div style={{ fontSize:10.5, color:C.body, marginTop:2 }}>{sub}</div>
    {delta && <div style={{ fontSize:10, marginTop:6 }}>{delta}</div>}
  </div>
);
const name = (p) => <>{p.code ? <span style={{ fontFamily:F, fontVariantNumeric:"tabular-nums", letterSpacing:.2, fontSize:9.5, color:C.muted }}>{p.code} </span> : null}{p.name}</>;

function CumulativeChart({ months, upTo }) {
  const W = 700, Hh = 190, L = 54, B = 26, T0 = 10;
  const max = Math.max(1, ...months.map(m => Math.max(m.plan_cum, m.released_cum || 0)));
  const x = (i) => L + i * ((W - L - 10) / (months.length - 1));
  const y = (v) => T0 + (Hh - T0 - B) * (1 - v / max);
  const line = (key) => months.map((m, i) => m[key] == null ? null : `${x(i)},${y(m[key])}`).filter(Boolean).join(" ");
  const ticks = [0, .25, .5, .75, 1].map(t => t * max);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${Hh}`} style={{ display:"block" }} role="img" aria-label="Planned against released, cumulative">
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - 10} y1={y(t)} y2={y(t)} stroke={C.line} /><text x={L - 6} y={y(t) + 3} fontSize="9" textAnchor="end" fill={C.muted}>{(t / 1e6).toFixed(0)}M</text></g>)}
      {months.map((m, i) => <text key={m.ym} x={x(i)} y={Hh - 8} fontSize="9" textAnchor="middle" fill={m.ym === upTo ? C.ink : C.muted} fontWeight={m.ym === upTo ? 700 : 400}>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m.ym.slice(5)) - 1]}</text>)}
      <polyline points={line("plan_cum")} fill="none" stroke={C.navy} strokeWidth="2" strokeDasharray="5 4" />
      <polyline points={line("released_cum")} fill="none" stroke={C.gold} strokeWidth="3" />
      {months.map((m, i) => m.released_cum == null ? null : <circle key={i} cx={x(i)} cy={y(m.released_cum)} r="3" fill={C.gold} />)}
    </svg>
  );
}

export function ReportDocument({ rep, prev }) {
  const f = rep.figures, h = f.headline;
  const d = deltas(f, prev?.figures);
  const since = prev?.figures?.period ? prev.figures.period.split(" ")[0] : "";
  const title = rep.kind === "reconstructed" ? "Baseline (reconstructed)" : "Monthly Board Report";
  const asAtText = f.month_in_progress ? `as at ${fmtDay(f.as_at)} (month in progress)` : `as at the end of ${f.period} (${fmtDay(new Date(new Date(f.as_at).getTime() - 1).toISOString())})`;
  const thisMonth = f.funding.months.find(m => m.ym === f.ym);
  const total = 6;
  const pg = (n, kids) => <Page n={n} total={total} title={title} period={f.period}>{kids}</Page>;
  const maxStageDf = Math.max(1, ...f.stages.map(s => s.df));
  const att = f.attention;

  return (
    <div>
      {pg(1, <>
        <div style={{ background:C.navy, color:"#fff", margin:"-36px -44px 0", padding:"26px 44px 22px" }}>
          <div style={{ fontSize:9.5, letterSpacing:3, opacity:.6, textTransform:"uppercase" }}>Riphah International University · Project Management Office</div>
          <div style={{ fontSize:26, fontWeight:700, marginTop:8 }}>{title}</div>
          <div style={{ fontSize:15, marginTop:2, color:"#F3C877", fontWeight:600 }}>{f.period}</div>
          <div style={{ fontSize:10.5, opacity:.75, marginTop:8 }}>FY 2026-27 capital projects (CAPEX) · DF Recommended basis · figures {asAtText}</div>
        </div>
        <div style={{ height:4, background:C.gold, margin:"0 -44px 22px" }} />
        <H sub="The five figures the Board follows each month">Executive summary</H>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
          <Tile label="Total CAPEX portfolio" value={`PKR ${fmtM(h.df_total)}`} sub={`${h.capex_count} projects · DF Recommended`} delta={<Delta v={d?.df_total} money since={since} />} />
          <Tile label="Approved" value={`PKR ${fmtM(h.approved_bac)}`} sub={`${h.approved_count} projects · ${h.approved_in_execution} in execution, ${h.approved_closed} closed`} delta={<Delta v={d?.approved_bac} money since={since} />} />
          <Tile label="Released" value={`PKR ${fmtM(h.released_total)}`} sub={`${fmtPct(h.released_pct_of_df)} of DF Recommended · ${h.released_projects} projects`} delta={<Delta v={d?.released_total} money since={since} />} />
          <Tile label="Approved, not yet released" value={`PKR ${fmtM(h.approved_not_released)}`} sub="approved budget less released, on approved projects" delta={<Delta v={d?.approved_not_released} money since={since} />} />
          <Tile label="Of which PMDC" value={`PKR ${fmtM(h.pmdc_df)}`} sub={`${h.pmdc_count} projects · inside CAPEX, shown separately`} />
          <Tile label="Investment (outside CAPEX)" value={`PKR ${fmtM(h.investment_df)}`} sub={`${h.investment_count} projects · PKR ${fmtM(h.investment_released)} released`} />
        </div>
        {rep.note && rep.note.trim() && (
          <div className="br-avoid" style={{ marginTop:16, borderLeft:`4px solid ${C.gold}`, background:"#FDF8EE", padding:"10px 14px", fontSize:11.5, lineHeight:1.6, whiteSpace:"pre-wrap", color:C.ink }}>
            {rep.note.trim()}<div style={{ fontSize:9.5, color:C.muted, marginTop:4 }}>— Project Management Office</div>
          </div>
        )}
        <div style={{ marginTop:18 }}><H sub="Worked out from the figures; nothing here is typed by hand">This month</H></div>
        <ul style={{ margin:"0 0 0 18px", padding:0, fontSize:11.5, lineHeight:1.75, color:C.ink }}>
          <li><b>{f.moved_to_approved.length}</b> project{f.moved_to_approved.length === 1 ? "" : "s"} moved to Approved in the portal{f.moved_to_approved.length ? <>, approved budget PKR {fmtM(f.moved_to_approved.reduce((s, p) => s + p.bac, 0))}</> : null}.</li>
          <li>PKR <b>{fmtM(thisMonth?.released || 0)}</b> released on {thisMonth?.released_count || 0} project{thisMonth?.released_count === 1 ? "" : "s"} (by budget release date).</li>
          <li>{f.pdds.received} PDD{f.pdds.received === 1 ? "" : "s"} received on E-PDD; {f.pdds.pmo_approved} approved by the PMO and {f.pdds.sent_back} sent back for changes (document stage; a project is sanctioned only after DF → ED → MT).</li>
        </ul>
        <div style={{ marginTop:18 }}><H sub="Listed so they can be followed up">Needs attention</H></div>
        <ul style={{ margin:"0 0 0 18px", padding:0, fontSize:11.5, lineHeight:1.75, color:C.ink }}>
          {att.approved_nothing_released.length > 0 && <li>Approved, nothing released yet: {att.approved_nothing_released.map((p, i) => <span key={p.id}>{i ? "; " : ""}<b>{p.name}</b> (PKR {fmtPKR(p.bac)})</span>)}.</li>}
          {att.released_before_approval.length > 0 && <li>Released before approval: {att.released_before_approval.map((p, i) => <span key={p.id}>{i ? "; " : ""}<b>{p.name}</b>, {STAGE_NAME[p.stage]}, PKR {fmtPKR(p.released)}</span>)}.</li>}
          {att.without_pm.length > 0 && <li>{att.without_pm.length} project{att.without_pm.length === 1 ? "" : "s"} without a project manager{att.without_pm.some(p => p.stage === "approved") ? `, ${att.without_pm.filter(p => p.stage === "approved").length} of them approved` : ""}.</li>}
          {!att.approved_nothing_released.length && !att.released_before_approval.length && !att.without_pm.length && <li>Nothing outstanding.</li>}
        </ul>
      </>)}

      {pg(2, <>
        <H sub="CAPEX projects at each stage at the end of the period; DF Recommended in PKR">Approval pipeline</H>
        <div className="br-avoid">
          {f.stages.map(s => (
            <div key={s.stage} style={{ display:"grid", gridTemplateColumns:"170px 1fr 120px", alignItems:"center", gap:10, padding:"5px 0", fontSize:11.5 }}>
              <div style={{ color:C.ink, fontWeight:600 }}>{s.label}</div>
              <div style={{ height:14, background:C.soft, borderRadius:7, overflow:"hidden" }}>
                <div style={{ width:`${(s.df / maxStageDf) * 100}%`, height:"100%", background: s.stage === "approved" || s.stage === "closed" ? C.teal : s.stage === "pdd_not_submitted" ? "#9AAABB" : C.blue }} />
              </div>
              <div style={{ ...num }}><b>{s.count}</b> · {fmtM(s.df)}</div>
            </div>
          ))}
        </div>
        {prev?.figures?.stages && (
          <Note>Since {since}: {f.stages.map(s => { const p = prev.figures.stages.find(x => x.stage === s.stage)?.count || 0; return s.count - p ? `${s.label} ${s.count - p > 0 ? "+" : "−"}${Math.abs(s.count - p)}` : null; }).filter(Boolean).join(" · ") || "no change"}.</Note>
        )}
        <div style={{ marginTop:20 }}><H sub="The date the portal stage changed, which is not the MT sanction date">Moved to Approved this month ({f.moved_to_approved.length})</H></div>
        {f.moved_to_approved.length ? (
          <Table head={["Project", "Campus", { label:"Approved (PKR)", num:true }, { label:"Released (PKR)", num:true }]} widths={["52%", "16%", "16%", "16%"]}
            rows={f.moved_to_approved.map(p => <tr key={p.id}><td style={td}>{name(p)}</td><td style={td}>{p.campus}</td><td style={{ ...td, ...num }}>{fmtPKR(p.bac)}</td><td style={{ ...td, ...num }}>{fmtPKR(p.released)}</td></tr>)} />
        ) : <div style={{ fontSize:11.5 }}>None.</div>}
      </>)}

      {pg(3, <>
        <H sub="Cumulative; released by each project's budget release date">Funding: planned against released</H>
        <CumulativeChart months={f.funding.months} upTo={f.ym} />
        <div style={{ display:"flex", gap:16, fontSize:10, color:C.muted, margin:"2px 0 10px 54px" }}>
          <span><span style={{ display:"inline-block", width:18, borderTop:`2px dashed ${C.navy}`, verticalAlign:"middle" }} /> Planned (cash-flow plan)</span>
          <span><span style={{ display:"inline-block", width:18, borderTop:`3px solid ${C.gold}`, verticalAlign:"middle" }} /> Released</span>
        </div>
        <Table head={["Month", { label:"Planned", num:true }, { label:"Released", num:true }, { label:"Projects", num:true }, { label:"Planned to date", num:true }, { label:"Released to date", num:true }]}
          rows={f.funding.months.map(m => <tr key={m.ym} style={m.ym === f.ym ? { background:"#FDF8EE" } : null}>
            <td style={td}>{periodOf(m.ym).short}</td><td style={{ ...td, ...num }}>{fmtM(m.plan)}</td>
            <td style={{ ...td, ...num }}>{m.released == null ? "—" : fmtM(m.released)}</td><td style={{ ...td, ...num }}>{m.released == null ? "" : m.released_count}</td>
            <td style={{ ...td, ...num }}>{fmtM(m.plan_cum)}</td><td style={{ ...td, ...num }}>{m.released_cum == null ? "—" : fmtM(m.released_cum)}</td></tr>)} />
        <Note>
          The cash-flow plan (PKR {fmtM(f.funding.plan_total)} on current projects, CAPEX including PMDC) has not been revised since it was loaded; DF Recommended is PKR {fmtM(h.df_total - f.funding.plan_total)} above it.
          {f.funding.plan_on_deleted ? ` A further PKR ${fmtM(f.funding.plan_on_deleted)} is planned on a project that no longer exists.` : ""}
          {" "}Each project has one budget release date, so a later top-up counts in the month of the first release.
          {f.funding.released_undated ? ` ${f.funding.released_undated} released project(s) have no release date and are not in the monthly figures.` : ""}
          {" "}Released means disbursed to the project, not spent.
        </Note>
      </>)}

      {pg(4, <>
        <H sub="CAPEX; approved = stage Approved or Closed">Where the portfolio sits</H>
        <Table head={["Campus / site", { label:"Projects", num:true }, { label:"DF Rec.", num:true }, { label:"Approved", num:true }, { label:"Released", num:true }, { label:"Released %", num:true }]}
          rows={f.breakdown.campus.map(g => <tr key={g.key}><td style={td}>{g.label}</td><td style={{ ...td, ...num }}>{g.count}</td><td style={{ ...td, ...num }}>{fmtM(g.df)}</td>
            <td style={{ ...td, ...num }}>{fmtM(g.bac)}</td><td style={{ ...td, ...num }}>{fmtM(g.released)}</td><td style={{ ...td, ...num }}>{g.df ? fmtPct(g.released / g.df, 0) : "—"}</td></tr>)} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:14 }}>
          {[["Organisation", f.breakdown.organisation], ["Segment", f.breakdown.segment]].map(([l, list]) => (
            <Table key={l} head={[l, { label:"Projects", num:true }, { label:"DF Rec.", num:true }, { label:"Released", num:true }]}
              rows={list.map(g => <tr key={g.key}><td style={td}>{g.label}</td><td style={{ ...td, ...num }}>{g.count}</td><td style={{ ...td, ...num }}>{fmtM(g.df)}</td><td style={{ ...td, ...num }}>{fmtM(g.released)}</td></tr>)} />
          ))}
        </div>
        <div style={{ marginTop:16 }}><H>Ten largest CAPEX projects</H></div>
        <Table head={["Project", "Campus", "Stage", { label:"DF Rec.", num:true }, { label:"Approved", num:true }, { label:"Released", num:true }]} widths={["40%", "13%", "17%", "10%", "10%", "10%"]}
          rows={f.top.map(p => <tr key={p.id}><td style={td}>{name(p)}</td><td style={td}>{p.campus}</td><td style={td}>{STAGE_NAME[p.stage] || p.stage}</td>
            <td style={{ ...td, ...num }}>{fmtM(p.df)}</td><td style={{ ...td, ...num }}>{fmtM(p.bac)}</td><td style={{ ...td, ...num }}>{fmtM(p.released)}</td></tr>)} />
      </>)}

      {pg(5, <>
        <H sub={`Open risks from the Risk Register, as at ${fmtDay(f.built_at)}; register last reviewed ${f.risks.last_reviewed ? fmtDay(f.risks.last_reviewed) : "—"}`}>Risks</H>
        <div style={{ display:"flex", gap:10, marginBottom:10 }}>
          {[["Critical", "critical", C.rose], ["High", "high", C.amber], ["Medium", "medium", C.blue], ["Low", "low", C.teal]].map(([l, k, c]) => (
            <div key={k} style={{ flex:1, border:`1px solid ${C.line}`, borderTop:`3px solid ${c}`, borderRadius:8, padding:"8px 12px" }}>
              <div style={{ fontSize:9.5, color:C.muted, textTransform:"uppercase", letterSpacing:.6, fontWeight:700 }}>{l}</div>
              <div style={{ fontSize:20, fontWeight:700, color:C.ink }}>{f.risks.by_severity[k] || 0}</div>
            </div>
          ))}
        </div>
        <Table head={["Project", "Risk", "Severity", "Owner"]} widths={["30%", "44%", "12%", "14%"]}
          rows={f.risks.top.map((r, i) => <tr key={i}><td style={td}>{r.code ? <span style={{ fontFamily:F, fontVariantNumeric:"tabular-nums", letterSpacing:.2, fontSize:9.5, color:C.muted }}>{r.code} </span> : null}{r.project}</td>
            <td style={td}>{r.title}{r.mitigation ? <div style={{ fontSize:9.5, color:C.muted, marginTop:2 }}>Mitigation: {r.mitigation}</div> : null}</td>
            <td style={{ ...td, textTransform:"capitalize" }}>{r.severity}</td><td style={td}>{r.owner || "—"}</td></tr>)} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:18 }}>
          <div className="br-avoid">
            <H sub="Finance's pending payments from FY 2025-26; not part of FY 2026-27 CAPEX">Carry forward</H>
            <div style={{ fontSize:20, fontWeight:700, color:C.ink }}>PKR {fmtM(f.carry.amount)} <span style={{ fontSize:11, fontWeight:400, color:C.muted }}>on {f.carry.count} lines</span></div>
            <Table head={["Status", { label:"Lines", num:true }, { label:"PKR", num:true }]}
              rows={f.carry.by_status.map(s => <tr key={s.status}><td style={td}>{s.status}</td><td style={{ ...td, ...num }}>{s.count}</td><td style={{ ...td, ...num }}>{fmtM(s.amount)}</td></tr>)} />
            {f.carry.credits > 0 && <Note>Includes {f.carry.credits} credit line{f.carry.credits === 1 ? "" : "s"} (negative amounts) as given by Finance.</Note>}
          </div>
          <div className="br-avoid">
            <H sub="Projects from earlier fiscal years still open">Past projects</H>
            <div style={{ fontSize:20, fontWeight:700, color:C.ink }}>{f.past.open} <span style={{ fontSize:11, fontWeight:400, color:C.muted }}>projects still open</span></div>
            <Table head={["", { label:"PKR", num:true }]} rows={<>
              <tr><td style={td}>Approved</td><td style={{ ...td, ...num }}>{fmtM(f.past.approved)}</td></tr>
              <tr><td style={td}>Released</td><td style={{ ...td, ...num }}>{fmtM(f.past.released)} ({fmtPct(f.past.released_pct, 0)})</td></tr>
              <tr><td style={td}>Marked "No progress"</td><td style={{ ...td, ...num }}>{f.past.no_progress} projects</td></tr>
              <tr><td style={td}>Open since release: under 6 months / 6–12 / over a year</td><td style={{ ...td, ...num }}>{f.past.ages.under6} / {f.past.ages["6to12"]} / {f.past.ages.over12}</td></tr>
            </>} />
          </div>
        </div>
      </>)}

      {pg(6, <>
        <H sub="Every CAPEX project at the end of the period, by campus">Appendix: project register</H>
        <Table head={["Project", "Campus", "Stage", "PM", { label:"DF Rec.", num:true }, { label:"Approved", num:true }, { label:"Released", num:true }]} widths={["34%", "11%", "14%", "14%", "9%", "9%", "9%"]}
          rows={f.register.map(p => <tr key={p.id}><td style={{ ...td, fontSize:9.5, padding:"4px 6px" }}>{name(p)}</td><td style={{ ...td, fontSize:9.5, padding:"4px 6px" }}>{p.campus}</td>
            <td style={{ ...td, fontSize:9.5, padding:"4px 6px" }}>{STAGE_NAME[p.stage] || p.stage}</td><td style={{ ...td, fontSize:9.5, padding:"4px 6px" }}>{p.pm || "Not assigned"}</td>
            <td style={{ ...td, ...num, fontSize:9.5, padding:"4px 6px" }}>{fmtM(p.df, 2)}</td><td style={{ ...td, ...num, fontSize:9.5, padding:"4px 6px" }}>{p.bac ? fmtM(p.bac, 2) : "—"}</td>
            <td style={{ ...td, ...num, fontSize:9.5, padding:"4px 6px" }}>{p.released ? fmtM(p.released, 2) : "—"}</td></tr>)} />
        <div className="br-avoid" style={{ marginTop:18 }}>
          <H>Definitions and what this report does not cover</H>
          <ul style={{ margin:"0 0 0 16px", padding:0, fontSize:10, lineHeight:1.65, color:C.body }}>
            <li><b>Approved</b> = stage Approved or Closed in the portal (after DF → ED → MT). A PDD approved on E-PDD is not an approved project.</li>
            <li><b>DF Recommended</b> is the base for the CAPEX total. <b>PMDC</b> projects are inside CAPEX and shown separately. <b>Investment</b> projects and <b>carry forward</b> are outside CAPEX.</li>
            <li><b>Released</b> is money disbursed to a project, not money spent. The portal does not yet hold spending or physical progress, so neither is reported.</li>
            <li>Portfolio figures are as at {fmtDay(f.as_at)}{rep.kind === "reconstructed" ? ", rebuilt from the Activity Log" : ""}; risks, PDDs, carry forward and past projects are as at {fmtDay(f.built_at)}. Calculation {f.calc_version}.</li>
            <li>Projects without a PM are listed from today's assignments.</li>
          </ul>
        </div>
      </>)}
    </div>
  );
}

/* ── Recipients ────────────────────────────────────────────────────────────── */
function RecipientsModal({ T, session, supa, rep, current, publishing, onClose, onDone, isMobile }) {
  const [people, setPeople] = useState([]);
  const [sel, setSel] = useState(() => new Set(current));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supa("/rest/v1/user_profiles?is_active=eq.true&select=id,full_name,username,role,email&order=full_name.asc", {}, session.access_token)
      .then(r => setPeople((r || []).filter(u => u.id !== session.user_id))).catch(e => setErr(e.message));
  }, [supa, session]);
  const ROLE = { guest: "Senior management (guests)", pmo: "PMO", project_manager: "Project managers" };
  const groups = ["guest", "pmo", "project_manager"].map(r => ({ r, list: people.filter(p => p.role === r && `${p.full_name} ${p.username}`.toLowerCase().includes(q.toLowerCase())) }));
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const was = new Set(current), now = [...sel];
      const added = now.filter(id => !was.has(id)), gone = [...was].filter(id => !sel.has(id));
      if (now.length) await supa("/rest/v1/board_report_recipients?on_conflict=report_id,user_id", { method:"POST",
        headers:{ Prefer:"resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(now.map(user_id => ({ report_id: rep.id, user_id, removed: false }))) }, session.access_token);
      if (gone.length) await supa(`/rest/v1/board_report_recipients?report_id=eq.${rep.id}&user_id=in.(${gone.join(",")})`, { method:"PATCH",
        headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ removed: true }) }, session.access_token);
      if (publishing) await supa(`/rest/v1/board_reports?id=eq.${rep.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({ status: "published", published_by: session.user_id, published_at: new Date().toISOString() }) }, session.access_token);
      let pushed = 0;
      const toTell = publishing ? now : added;
      if (toTell.length) {
        const r = await supa("/functions/v1/board-report-notify", { method:"POST", body: JSON.stringify({ report_id: rep.id, action:"push", user_ids: toTell }) }, session.access_token).catch(() => null);
        pushed = r?.pushed || 0;
      }
      supa("/rest/v1/activity_log", { method:"POST", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({
        actor_id: session.user_id, actor_name: session.full_name || session.username, actor_role: session.role,
        action: publishing ? "published" : "updated", entity_type: "board_reports", entity_id: rep.id,
        summary: publishing ? `Published "${rep.title}" to ${now.length} people` : `Shared "${rep.title}": ${added.length} added, ${gone.length} removed`,
        details: { recipients: now.length, added: added.length, removed: gone.length } }) }, session.access_token).catch(() => {});
      onDone({ count: now.length, added: added.length, pushed });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal T={T} icon={Users} isMobile={isMobile} width={560} onClose={onClose}
      title={publishing ? "Publish and share" : "Who receives this report"}
      sub={publishing ? "The figures are frozen when you publish. Each person gets a push and sees the report at their next sign-in." : "People you add get a push and a pop-up at their next sign-in."}
      footer={<><Button T={T} variant="ghost" onClick={onClose}>Cancel</Button>
        <Button T={T} variant="primary" icon={Send} loading={busy} disabled={busy || (publishing && !sel.size)} onClick={save}>
          {publishing ? `Publish to ${sel.size} ${sel.size === 1 ? "person" : "people"}` : "Save"}</Button></>}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…" style={{ width:"100%", boxSizing:"border-box", background:T.inputBg,
        border:`1px solid ${T.inputBorder}`, borderRadius:R.md, padding:"9px 12px", fontSize:13.5, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none", marginBottom:SP.md }} />
      {groups.map(g => g.list.length ? (
        <div key={g.r} style={{ marginBottom:SP.lg }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
            <span style={{ ...TYPE.label, color:T.muted }}>{ROLE[g.r]}</span>
            <button type="button" className="pmo-focusable" onClick={() => setSel(s => { const n = new Set(s); const all = g.list.every(p => n.has(p.id)); g.list.forEach(p => all ? n.delete(p.id) : n.add(p.id)); return n; })}
              style={{ marginLeft:"auto", border:0, background:"none", color:T.textOf(BRAND.blue), fontSize:12, cursor:"pointer" }}>
              {g.list.every(p => sel.has(p.id)) ? "Clear all" : "Select all"}</button>
          </div>
          {g.list.map(p => (
            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 8px", borderRadius:R.sm, cursor:"pointer",
              background: sel.has(p.id) ? `${BRAND.blue}14` : "transparent" }}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span style={{ fontSize:13, color:T.text }}>{p.full_name || p.username}</span>
              <span style={{ fontSize:11.5, color:T.muted }}>{p.email || p.username}</span>
            </label>
          ))}
        </div>
      ) : null)}
      {err && <div style={{ color:T.textOf(T.danger), fontSize:12.5 }}>{err}</div>}
    </Modal>
  );
}

/* ── The viewer (full screen; the document is what prints) ─────────────────── */
function ReportViewer({ T, session, supa, rep, prev, recipients, onClose, onChanged, isMobile }) {
  usePrintStyles();
  const isPMO = session.role === "pmo";
  const [modal, setModal] = useState(null);       // "publish" | "share" | "email" | "discard"
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [note, setNote] = useState(rep.note || "");
  const draft = rep.status === "draft";
  const live = recipients.filter(r => !r.removed);

  useEffect(() => {
    if (!isPMO && rep.status === "published")
      supa(`/rest/v1/board_report_recipients?report_id=eq.${rep.id}&user_id=eq.${session.user_id}&seen_at=is.null`, { method:"PATCH",
        headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ seen_at: new Date().toISOString() }) }, session.access_token).then(() => onChanged?.()).catch(() => {});
  }, [rep.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setBusy("refresh"); setMsg(null);
    try {
      const rows = await loadReportRows(p => supa(`/rest/v1/${p}`, {}, session.access_token));
      const per = periodOf(ymOf(rep)), now = new Date().toISOString();
      const asAt = per.end < now ? per.end : now;
      const figures = computeFigures(rows, { ym: ymOf(rep), asAt, builtAt: now });
      await supa(`/rest/v1/board_reports?id=eq.${rep.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({ figures, as_at: asAt, calc_version: CALC_VERSION, note }) }, session.access_token);
      setMsg({ ok:true, t:"Figures refreshed from today's data." }); onChanged?.();
    } catch (e) { setMsg({ ok:false, t:e.message }); }
    setBusy(null);
  };
  const saveNote = async () => {
    if ((rep.note || "") === note) return;
    await supa(`/rest/v1/board_reports?id=eq.${rep.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ note }) }, session.access_token).catch(() => {});
    onChanged?.();
  };
  const email = async () => {
    setBusy("email"); setMsg(null);
    try {
      const r = await supa("/functions/v1/board-report-notify", { method:"POST", body: JSON.stringify({ report_id: rep.id, action:"email" }) }, session.access_token);
      setMsg({ ok: !r.failed?.length, t: `Emailed to ${r.emailed} ${r.emailed === 1 ? "person" : "people"}.${r.failed?.length ? ` ${r.failed.length} failed.` : ""}` });
      onChanged?.();
    } catch (e) { setMsg({ ok:false, t:e.message }); }
    setBusy(null); setModal(null);
  };
  const discard = async () => {
    await supa(`/rest/v1/board_reports?id=eq.${rep.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ status:"discarded" }) }, session.access_token).catch(() => {});
    onChanged?.(); onClose();
  };

  const chip = rep.kind === "reconstructed" ? ["Baseline · reconstructed", T.muted] : draft ? ["Draft · only the PMO sees it", "#D89840"] : ["Published", T.positive];
  return createPortal(
    <div className="br-print-root" style={{ position:"fixed", inset:0, zIndex:1300, background:T.page, display:"flex", flexDirection:"column" }}>
      <div className="br-toolbar" style={{ display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap", padding:`${SP.md}px ${SP.lg}px`, borderBottom:`1px solid ${T.border}`, background:T.surface }}>
        <Button T={T} variant="ghost" icon={ArrowLeft} onClick={onClose}>Back</Button>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ ...TYPE.h3, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rep.title}</div>
          <div style={{ ...TYPE.caption, color:T.muted }}><span style={{ color:chip[1], fontWeight:700 }}>{chip[0]}</span>
            {isPMO && rep.status === "published" && rep.kind !== "reconstructed" && <> · shared with {live.length} · opened by {live.filter(r => r.seen_at).length}</>}</div>
        </div>
        {msg && <span style={{ fontSize:12.5, color: msg.ok ? T.textOf(T.positive) : T.textOf(T.danger), display:"flex", alignItems:"center", gap:5 }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{msg.t}</span>}
        {isPMO && draft && <Button T={T} variant="ghost" icon={RefreshCw} loading={busy === "refresh"} onClick={refresh} title="Rebuild the figures from today's data">Refresh figures</Button>}
        {isPMO && draft && <Button T={T} variant="ghost" icon={Trash2} onClick={() => setModal("discard")}>Discard</Button>}
        {isPMO && rep.status === "published" && rep.kind !== "reconstructed" && <Button T={T} variant="ghost" icon={Users} onClick={() => setModal("share")}>Recipients</Button>}
        {isPMO && rep.status === "published" && rep.kind !== "reconstructed" && <Button T={T} variant="ghost" icon={Mail} loading={busy === "email"} disabled={!live.length} onClick={() => setModal("email")}>Email report</Button>}
        <Button T={T} variant="ghost" icon={Printer} onClick={printReport} title="Print, or choose Save as PDF">Save as PDF</Button>
        {isPMO && draft && <Button T={T} variant="primary" icon={Send} onClick={async () => { await saveNote(); setModal("publish"); }}>Publish…</Button>}
      </div>
      {isPMO && draft && (
        <div className="br-toolbar" style={{ padding:`${SP.sm}px ${SP.lg}px`, borderBottom:`1px solid ${T.border}`, background:T.surface, display:"flex", gap:SP.sm, alignItems:"center" }}>
          <span style={{ ...TYPE.label, color:T.muted, whiteSpace:"nowrap" }}>PMO note on page 1</span>
          <input value={note} onChange={e => setNote(e.target.value.slice(0, 800))} onBlur={saveNote} placeholder="Optional: a line for the Board, e.g. what to look at this month"
            style={{ flex:1, background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.md, padding:"7px 11px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none" }} />
        </div>
      )}
      <div className="br-scroll pmo-scroll" style={{ flex:1, overflow:"auto", padding: isMobile ? "12px 0" : "24px 12px", background: T.mode === "dark" ? "#0A1424" : "#DCE4EE" }}>
        <div style={isMobile ? { transform:`scale(${Math.min(1, (window.innerWidth - 8) / 794)})`, transformOrigin:"top left", width:794 } : null}>
          <ReportDocument rep={{ ...rep, note }} prev={prev} />
        </div>
      </div>
      {(modal === "publish" || modal === "share") && (
        <RecipientsModal T={T} session={session} supa={supa} rep={rep} isMobile={isMobile}
          current={live.map(r => r.user_id)} publishing={modal === "publish"} onClose={() => setModal(null)}
          onDone={(r) => { setModal(null); setMsg({ ok:true, t: modal === "publish" ? `Published to ${r.count}. Push sent to ${r.pushed}.` : `Saved. ${r.added ? `${r.added} added and notified.` : ""}` }); onChanged?.(); }} />
      )}
      {modal === "email" && (
        <Modal T={T} icon={Mail} width={460} isMobile={isMobile} onClose={() => setModal(null)} title="Email the report"
          sub={`Sends the headline figures and a link to the full report to the ${live.length} ${live.length === 1 ? "person" : "people"} it is shared with.`}
          footer={<><Button T={T} variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button T={T} variant="primary" icon={Mail} loading={busy === "email"} onClick={email}>Send email</Button></>}>
          <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{live.length ? "Each person gets one email, addressed to them, with no CC." : "Nobody to send to yet."}</div>
        </Modal>
      )}
      {modal === "discard" && (
        <Modal T={T} icon={Trash2} width={420} isMobile={isMobile} onClose={() => setModal(null)} title="Discard this draft?"
          sub="It disappears from the list. Nothing was shared." footer={<><Button T={T} variant="ghost" onClick={() => setModal(null)}>Keep</Button><Button T={T} variant="danger" onClick={discard}>Discard</Button></>}>
          <div />
        </Modal>
      )}
    </div>, document.body);
}

/* ── New report ────────────────────────────────────────────────────────────── */
function NewReportModal({ T, session, supa, reports, onClose, onBuilt, isMobile }) {
  const months = monthsUpToNow();
  const [ym, setYm] = useState(() => { const cur = ymNow(); const last = prevYm(cur); return months.includes(last) ? last : cur; });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const live = reports.filter(r => r.status !== "discarded");
  const has = (m, kind) => live.some(r => ymOf(r) === m && (!kind || r.kind === kind));
  const missingBefore = months.filter(m => m < ym && !has(m)).sort();
  const build = async () => {
    setBusy(true); setErr(null);
    try {
      const rows = await loadReportRows(p => supa(`/rest/v1/${p}`, {}, session.access_token));
      const now = new Date().toISOString();
      const make = async (m, kind) => {
        const per = periodOf(m), asAt = per.end < now ? per.end : now;
        const figures = computeFigures(rows, { ym: m, asAt, builtAt: now });
        const r = await supa("/rest/v1/board_reports", { method:"POST", headers:{ Prefer:"return=representation" }, body: JSON.stringify({
          period: `${m}-01`, title: kind === "reconstructed" ? `Baseline: ${per.label}` : `Monthly Board Report: ${per.label}`,
          kind, status: kind === "reconstructed" ? "published" : "draft", as_at: asAt, figures, calc_version: CALC_VERSION,
          ...(kind === "reconstructed" ? { published_by: session.user_id, published_at: now } : {}) }) }, session.access_token);
        return Array.isArray(r) ? r[0] : r;
      };
      for (const m of missingBefore) await make(m, "reconstructed");     // earlier month-ends first, so this one compares
      const rep = await make(ym, "monthly");
      supa("/rest/v1/activity_log", { method:"POST", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({
        actor_id: session.user_id, actor_name: session.full_name || session.username, actor_role: session.role,
        action: "created", entity_type: "board_reports", entity_id: rep.id,
        summary: `Built the board report for ${periodOf(ym).label}${missingBefore.length ? ` (and rebuilt ${missingBefore.map(m => periodOf(m).short).join(", ")} as baselines)` : ""}`,
        details: { period: ym, baselines: missingBefore } }) }, session.access_token).catch(() => {});
      onBuilt(rep);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal T={T} icon={FileBarChart} isMobile={isMobile} width={520} onClose={onClose} title="New board report"
      sub="Builds the month's figures from the portal's data. It stays a draft, seen only by the PMO, until you publish it."
      footer={<><Button T={T} variant="ghost" onClick={onClose}>Cancel</Button><Button T={T} variant="primary" icon={FileBarChart} loading={busy} disabled={busy} onClick={build}>Build report</Button></>}>
      <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>Month</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {months.map(m => {
          const on = m === ym, cur = m === ymNow();
          return <button key={m} type="button" className="pmo-focusable" onClick={() => setYm(m)} style={{ padding:"8px 12px", borderRadius:R.md, cursor:"pointer", fontSize:13,
            border:`1px solid ${on ? T.blue : T.border}`, background: on ? `${T.blue}1F` : "transparent", color: on ? T.text : T.muted, fontWeight: on ? 700 : 500 }}>
            {periodOf(m).label}{cur ? " (so far)" : ""}{has(m, "monthly") ? " ✓" : ""}</button>;
        })}
      </div>
      <div style={{ ...TYPE.bodySm, color:T.muted, marginTop:SP.md, lineHeight:1.6 }}>
        {ym === ymNow() ? "The month is still running: figures are as at today." : `Figures as at the end of ${periodOf(ym).label}, rebuilt from the Activity Log.`}
        {has(ym, "monthly") && <div style={{ color:T.textOf(T.warning || "#D89840") }}>A report for this month already exists; this builds another draft.</div>}
        {missingBefore.length > 0 && <div style={{ marginTop:6 }}>So that this report can compare with earlier months, {missingBefore.map(m => periodOf(m).label).join(" and ")} will also be rebuilt from the Activity Log as {missingBefore.length === 1 ? "a baseline" : "baselines"} (marked "reconstructed", never shared).</div>}
      </div>
      {err && <div style={{ color:T.textOf(T.danger), fontSize:12.5, marginTop:SP.md }}>{err}</div>}
    </Modal>
  );
}

/* ── The page ──────────────────────────────────────────────────────────────── */
export function BoardReportsPage({ T, session, supa, isCompact, initialReport = null, onInitialOpened }) {
  const isPMO = session.role === "pmo";
  const [reports, setReports] = useState(null);
  const [recips, setRecips] = useState([]);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [building, setBuilding] = useState(false);
  const [full, setFull] = useState(null);           // the open report, with figures

  const load = useCallback(async () => {
    try {
      const [r, x] = await Promise.all([
        supa("/rest/v1/board_reports?select=id,title,period,kind,status,as_at,note,published_at,created_at&order=period.desc,created_at.desc", {}, session.access_token),
        supa(`/rest/v1/board_report_recipients?select=report_id,user_id,removed,seen_at,emailed_at${isPMO ? "" : `&user_id=eq.${session.user_id}`}`, {}, session.access_token),
      ]);
      setReports((r || []).filter(x => x.status !== "discarded")); setRecips(x || []); setErr(null);
    } catch (e) { setErr(e.message); setReports([]); }
  }, [supa, session, isPMO]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (initialReport && reports) { setOpenId(initialReport); onInitialOpened?.(); }
  }, [initialReport, reports]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The open report and the one it compares with (latest earlier published month).
  const [prevFull, setPrevFull] = useState(null);
  useEffect(() => {
    if (!openId) { setFull(null); setPrevFull(null); return; }
    let on = true;
    (async () => {
      const r = await supa(`/rest/v1/board_reports?id=eq.${openId}&select=*`, {}, session.access_token).catch(() => []);
      const rep = r?.[0]; if (!on) return;
      if (!rep) { setOpenId(null); return; }
      setFull(rep);
      const p = await supa(`/rest/v1/board_reports?status=eq.published&period=lt.${rep.period}&select=id,title,kind,figures&order=period.desc,published_at.desc&limit=1`, {}, session.access_token).catch(() => []);
      if (on) setPrevFull(p?.[0] || null);
    })();
    return () => { on = false; };
  }, [openId, reports, supa, session.access_token]);

  const recOf = (id) => recips.filter(x => x.report_id === id);
  const shown = (reports || []).filter(r => isPMO || r.status === "published");

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, overflow:"auto", background:T.page }} className="pmo-scroll">
      <div style={{ padding: isCompact ? SP.lg : `${SP.xl}px ${SP.xxl}px`, maxWidth:1100, width:"100%", boxSizing:"border-box", margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:SP.md, marginBottom:SP.lg, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ ...TYPE.h1, color:T.text }}>Board reports</div>
            <div style={{ ...TYPE.bodySm, color:T.muted, marginTop:2 }}>
              {isPMO ? "Monthly reports for the Board and senior management. Build, check, then publish to the people you choose." : "Reports the PMO has shared with you."}
            </div>
          </div>
          {isPMO && <Button T={T} variant="primary" icon={Plus} onClick={() => setBuilding(true)}>New report</Button>}
        </div>
        {err && <div style={{ color:T.textOf(T.danger), fontSize:13, marginBottom:SP.md }}>{err}</div>}
        {reports === null ? <div style={{ color:T.muted, fontSize:13 }}>Loading…</div> : shown.length === 0 ? (
          <div style={{ border:`1px dashed ${T.border}`, borderRadius:R.lg, padding:SP.xxl, textAlign:"center", color:T.muted, fontSize:13.5 }}>
            {isPMO ? "No reports yet. Press New report to build the first one." : "No reports have been shared with you yet."}
          </div>
        ) : (
          <div style={{ display:"grid", gap:SP.sm }}>
            {shown.map(r => {
              const rc = recOf(r.id).filter(x => !x.removed);
              const mine = !isPMO && rc.find(x => x.user_id === session.user_id);
              const tag = r.kind === "reconstructed" ? ["Baseline · reconstructed", T.muted] : r.status === "draft" ? ["Draft", "#D89840"] : ["Published", T.positive];
              return (
                <button key={r.id} type="button" className="pmo-focusable pmo-btn" onClick={() => setOpenId(r.id)}
                  style={{ display:"flex", alignItems:"center", gap:SP.md, textAlign:"left", padding:`${SP.md}px ${SP.lg}px`, borderRadius:R.lg, cursor:"pointer",
                    background:T.surface, border:`1px solid ${mine && !mine.seen_at ? `${BRAND.gold}AA` : T.border}`, boxShadow:T.shadow, color:T.text }}>
                  <div style={{ width:38, height:38, borderRadius:R.md, background: r.kind === "reconstructed" ? `${T.muted}22` : `${BRAND.blue}22`,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {r.kind === "reconstructed" ? <History size={17} color={T.muted} /> : <FileBarChart size={17} color={T.textOf(BRAND.blue)} />}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{r.title}</div>
                    <div style={{ ...TYPE.caption, color:T.muted, marginTop:2 }}>
                      <span style={{ color:tag[1], fontWeight:700 }}>{tag[0]}</span> · figures as at {fmtDay(r.as_at)}
                      {r.published_at && r.kind !== "reconstructed" ? ` · published ${fmtDay(r.published_at)}` : ""}
                      {isPMO && r.kind !== "reconstructed" && r.status === "published" ? ` · shared with ${rc.length}, opened by ${rc.filter(x => x.seen_at).length}` : ""}
                    </div>
                  </div>
                  {mine && !mine.seen_at && <span style={{ fontSize:11, fontWeight:700, color:"#0D1929", background:BRAND.gold, borderRadius:R.pill, padding:"3px 9px" }}>New</span>}
                  <Eye size={16} color={T.muted} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {building && <NewReportModal T={T} session={session} supa={supa} reports={reports || []} isMobile={isCompact}
        onClose={() => setBuilding(false)} onBuilt={(rep) => { setBuilding(false); load().then(() => setOpenId(rep.id)); }} />}
      {openId && full && (
        <ReportViewer T={T} session={session} supa={supa} rep={full} prev={prevFull} recipients={recOf(full.id)} isMobile={isCompact}
          onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}

/* ── Sign-in pop-up for recipients ─────────────────────────────────────────── */
export async function loadUnseenReports(supa, session) {
  const r = await supa(`/rest/v1/board_report_recipients?user_id=eq.${session.user_id}&removed=is.false&seen_at=is.null&select=report_id`, {}, session.access_token).catch(() => []);
  const ids = (r || []).map(x => x.report_id);
  if (!ids.length) return [];
  const reps = await supa(`/rest/v1/board_reports?id=in.(${ids.join(",")})&status=eq.published&select=id,title,as_at,published_at&order=published_at.desc`, {}, session.access_token).catch(() => []);
  return reps || [];
}
export function BoardReportPopup({ T, reports, onOpen, onLater, isMobile }) {
  if (!reports?.length) return null;
  const r = reports[0];
  return (
    <Modal T={T} icon={FileBarChart} width={460} isMobile={isMobile} onClose={onLater} title="New board report"
      sub="The PMO has shared a report with you."
      footer={<><Button T={T} variant="ghost" onClick={onLater}>Later</Button><Button T={T} variant="primary" icon={Eye} onClick={() => onOpen(r.id)}>Open report</Button></>}>
      <div style={{ fontSize:15, fontWeight:700, color:T.text }}>{r.title}</div>
      <div style={{ ...TYPE.bodySm, color:T.muted, marginTop:4 }}>Figures as at {fmtDay(r.as_at)}{reports.length > 1 ? ` · and ${reports.length - 1} more` : ""}</div>
    </Modal>
  );
}
