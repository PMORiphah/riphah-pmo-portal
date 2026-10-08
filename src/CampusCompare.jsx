import { useState, useEffect, useMemo } from "react";
import { Download, ArrowUpDown, ArrowDown, ArrowUp, X, Plus, ExternalLink } from "lucide-react";
import { TYPE, SP, R, BRAND } from "./theme.js";
import { Button, Surface } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPUS VS CAMPUS (PMO, 8 Oct 2026)

   On Campus / Sites, "Compare": every campus side by side (one row each,
   sortable, coloured so leaders and laggards stand out), and head to head
   (two or three campuses as columns on one scale). CAPEX only; approved =
   stage Approved or Closed; DF Recommended is the base. Campuses differ
   hugely in size (Al-Mizan 30 projects, PRH 3 worth the most), so counts are
   shown with rates ("9 of 30", "38% of DF") and either can be ranked.
   Live data, read under the viewer's own access (PMO and guests).
   ═══════════════════════════════════════════════════════════════════════════ */

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtM = (n) => `${(num(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const pct = (x) => `${Math.round(num(x) * 100)}%`;
const isApproved = (p) => p.workflow_stage === "approved" || p.workflow_stage === "closed";
const todayPKT = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

// Stage groups for the small bar on each row (one colour per meaning).
const STAGE_GROUPS = [
  { key: "pdd", label: "PDD not submitted", color: "#8B9AAE", test: (s) => s === "pdd_not_submitted" || !s },
  { key: "review", label: "Submitted / in review (DF, ED, MT)", color: "#4A9BE0", test: (s) => ["identified", "df_review", "ed_review", "mt_review"].includes(s) },
  { key: "approved", label: "Approved (in execution)", color: "#22C4A8", test: (s) => s === "approved" },
  { key: "closed", label: "Closed", color: "#E0A94A", test: (s) => s === "closed" },
];

function useCompareData(supa, session) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let on = true;
    const t = session.access_token;
    Promise.all([
      supa("/rest/v1/projects?portfolio=eq.capex&select=id,code,name,campus,workflow_stage,df_recommended_amount,bac,amount_released,end_date,actual_end_date", {}, t),
      supa("/rest/v1/project_assignments?select=project_id,user_id", {}, t).catch(() => []),
      supa("/rest/v1/user_profiles?select=id,full_name,username", {}, t).catch(() => []),
      supa("/rest/v1/project_risks?select=project_id,status", {}, t).catch(() => []),
      supa("/rest/v1/project_deliverables?select=project_id,status,confirmed,superseded", {}, t).catch(() => []),
      supa("/rest/v1/past_projects?select=campus,status", {}, t).catch(() => null),
    ]).then(([projects, assigns, users, risks, deliv, past]) => {
      if (on) setData({ projects: projects || [], assigns: assigns || [], users: users || [], risks: risks || [], deliv: deliv || [], past });
    }).catch(e => on && setErr(e.message));
    return () => { on = false; };
  }, [supa, session.access_token]);
  return { data, err };
}

function buildCampuses(d) {
  const today = todayPKT();
  const userName = new Map(d.users.map(u => [u.id, u.full_name || u.username]));
  const pmsOf = new Map();
  for (const a of d.assigns) { if (!pmsOf.has(a.project_id)) pmsOf.set(a.project_id, []); pmsOf.get(a.project_id).push(userName.get(a.user_id) || "—"); }
  const risksOf = new Map();
  for (const r of d.risks) if ((r.status || "open") !== "closed") risksOf.set(r.project_id, (risksOf.get(r.project_id) || 0) + 1);
  const delivOf = new Map();
  for (const x of d.deliv) {
    if (x.superseded || !x.confirmed) continue;
    const e = delivOf.get(x.project_id) || { lines: 0, done: 0 };
    e.lines++; if (x.status && x.status !== "not_started") e.done++;
    delivOf.set(x.project_id, e);
  }
  const pastOpen = new Map();
  if (Array.isArray(d.past)) for (const p of d.past) if (p.status !== "closed" && p.campus) pastOpen.set(p.campus, (pastOpen.get(p.campus) || 0) + 1);

  const by = new Map();
  for (const p of d.projects) {
    const c = p.campus || "No campus";
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(p);
  }
  return [...by.entries()].map(([campus, list]) => {
    const appr = list.filter(isApproved);
    const df = list.reduce((s, p) => s + num(p.df_recommended_amount), 0);
    const released = list.reduce((s, p) => s + num(p.amount_released), 0);
    const pmCount = {};
    list.forEach(p => (pmsOf.get(p.id) || []).forEach(n => { pmCount[n] = (pmCount[n] || 0) + 1; }));
    const dl = list.reduce((a, p) => { const e = delivOf.get(p.id); if (e) { a.lines += e.lines; a.done += e.done; } return a; }, { lines: 0, done: 0 });
    return {
      campus, list,
      projects: list.length,
      df,
      approved: appr.length,
      approvedRate: list.length ? appr.length / list.length : 0,
      bac: appr.reduce((s, p) => s + num(p.bac), 0),
      approvedValueRate: df ? appr.reduce((s, p) => s + num(p.df_recommended_amount), 0) / df : 0,
      released,
      releasedRate: df ? released / df : 0,
      pddNot: list.filter(p => (p.workflow_stage || "pdd_not_submitted") === "pdd_not_submitted").length,
      pastFinish: list.filter(p => p.workflow_stage === "approved" && p.end_date && p.end_date < today && !p.actual_end_date).length,
      risks: list.reduce((s, p) => s + (risksOf.get(p.id) || 0), 0),
      delivLines: dl.lines, delivDone: dl.done,
      noPm: list.filter(p => !pmsOf.has(p.id)).length,
      pastOpen: Array.isArray(d.past) ? (pastOpen.get(campus) || 0) : null,
      stages: STAGE_GROUPS.map(g => ({ ...g, n: list.filter(p => g.test(p.workflow_stage)).length })),
      pms: Object.entries(pmCount).sort((a, b) => b[1] - a[1]),
      top: [...list].sort((a, b) => num(b.df_recommended_amount) - num(a.df_recommended_amount)).slice(0, 5),
    };
  });
}

// Columns of the all-campuses table. `good` = higher is better (green); `bad` = higher needs attention (amber).
const COLS = [
  { key: "projects", label: "Projects", sort: r => r.projects, show: r => r.projects },
  { key: "df", label: "DF Rec.", sort: r => r.df, show: r => fmtM(r.df), tip: "DF Recommended, PKR" },
  { key: "approved", label: "Approved", sort: r => r.approvedRate, good: r => r.approvedRate,
    show: r => <>{r.approved} <span style={{ opacity: .65 }}>of {r.projects}</span></>, sub: r => `${fmtM(r.bac)} approved`,
    tip: "Projects at stage Approved or Closed, of all projects at the campus; sorted by the rate" },
  { key: "released", label: "Released", sort: r => r.releasedRate, good: r => r.releasedRate,
    show: r => fmtM(r.released), sub: r => `${pct(r.releasedRate)} of DF`, tip: "Released (disbursed, not spent), and as a share of DF Recommended; sorted by the share" },
  { key: "pddNot", label: "PDD not submitted", sort: r => r.pddNot, bad: r => r.projects ? r.pddNot / r.projects : 0,
    show: r => r.pddNot, sub: r => r.projects ? `${pct(r.pddNot / r.projects)} of projects` : "" },
  { key: "pastFinish", label: "Planned finish passed", sort: r => r.pastFinish, bad: r => r.pastFinish ? Math.min(1, r.pastFinish / 3) : 0,
    show: r => r.pastFinish, tip: "Approved projects whose planned finish date has passed and no completion is recorded" },
  { key: "risks", label: "Open risks", sort: r => r.risks, bad: r => Math.min(1, r.risks / 8), show: r => r.risks },
  { key: "deliv", label: "Deliverables", sort: r => r.delivLines ? r.delivDone / r.delivLines : -1, good: r => r.delivLines ? r.delivDone / r.delivLines : null,
    show: r => r.delivLines ? <>{r.delivDone} <span style={{ opacity: .65 }}>of {r.delivLines}</span></> : "—", tip: "Deliverable items ticked as delivered, of the confirmed items" },
  { key: "noPm", label: "No PM", sort: r => r.noPm, bad: r => r.noPm ? Math.min(1, r.noPm / 3) : 0, show: r => r.noPm },
];

const heat = (T, v, kind) => {
  if (v == null || !isFinite(v)) return "transparent";
  const a = Math.round(Math.max(0, Math.min(1, v)) * 0.32 * 255).toString(16).padStart(2, "0");
  return kind === "good" ? `#22C4A8${a}` : `#E8A63C${a}`;
};

function StageBar({ stages, total, height = 8 }) {
  return (
    <div style={{ display: "flex", height, borderRadius: height / 2, overflow: "hidden", background: "rgba(127,127,127,.15)", minWidth: 80 }}>
      {stages.map(s => s.n ? <div key={s.key} title={`${s.label}: ${s.n}`} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} /> : null)}
    </div>
  );
}

function AllCampuses({ T, rows, sortKey, setSortKey, dir, setDir, picked, togglePick, onOpenCampus, isCompact, showPast }) {
  const sorted = useMemo(() => {
    const col = COLS.find(c => c.key === sortKey) || COLS[1];
    return [...rows].sort((a, b) => (dir === "desc" ? -1 : 1) * (col.sort(a) - col.sort(b)) || b.df - a.df);
  }, [rows, sortKey, dir]);
  const th = { ...TYPE.label, color: T.muted, padding: "10px 8px 8px", textAlign: "right", whiteSpace: "normal", lineHeight: 1.25, maxWidth: 96, verticalAlign: "bottom", background: T.surfaceRaised,
    boxShadow: `inset 0 -1px 0 ${T.border}`, position: "sticky", top: 0, zIndex: 1, cursor: "pointer", userSelect: "none" };
  const td = { ...TYPE.bodySm, color: T.text, padding: "9px 8px", borderBottom: `1px solid ${T.border}`, textAlign: "right", verticalAlign: "middle", whiteSpace: "nowrap" };
  const cols = showPast ? [...COLS, { key: "pastOpen", label: "Past projects open", sort: r => r.pastOpen || 0, show: r => r.pastOpen ?? "—", tip: "Projects from earlier fiscal years still open at the campus" }] : COLS;
  const head = (c) => (
    <th key={c.key} style={th} title={c.tip} onClick={() => { if (sortKey === c.key) setDir(d => d === "desc" ? "asc" : "desc"); else { setSortKey(c.key); setDir("desc"); } }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{c.label}
        {sortKey === c.key ? (dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={11} style={{ opacity: .4 }} />}</span>
    </th>
  );
  // Phones: one card per campus (a 12-column table does not fit a phone).
  if (isCompact) return (
    <div style={{ display: "grid", gap: SP.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.label, color: T.muted }}>Rank by</span>
        <select value={sortKey} onChange={e => { setSortKey(e.target.value); setDir("desc"); }}
          style={{ background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm, padding: "6px 9px", fontSize: 13, color: T.text }}>
          {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" className="pmo-focusable" onClick={() => setDir(d => d === "desc" ? "asc" : "desc")}
          style={{ border: `1px solid ${T.border}`, background: "transparent", color: T.muted, borderRadius: R.sm, padding: "5px 8px", display: "flex" }}>
          {dir === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}</button>
      </div>
      {sorted.map(r => (
        <div key={r.campus} style={{ border: `1px solid ${picked.includes(r.campus) ? `${BRAND.blue}88` : T.border}`, borderRadius: R.lg, background: T.surface, padding: SP.md }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input type="checkbox" aria-label={`Compare ${r.campus}`} checked={picked.includes(r.campus)}
              disabled={!picked.includes(r.campus) && picked.length >= 3} onChange={() => togglePick(r.campus)} />
            <button type="button" className="pmo-focusable" onClick={() => onOpenCampus(r.campus)}
              style={{ border: 0, background: "none", padding: 0, color: T.text, fontWeight: 700, fontSize: 14.5, cursor: "pointer", flex: 1, textAlign: "left" }}>{r.campus}</button>
            <span style={{ fontSize: 12, color: T.muted }}>{r.projects} projects · {fmtM(r.df)}</span>
          </div>
          <StageBar stages={r.stages} total={r.projects} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
            {cols.filter(c => c.key !== "projects" && c.key !== "df").map(c => {
              const g = c.good?.(r), b = c.bad?.(r);
              return (
                <div key={c.key} style={{ borderRadius: R.sm, padding: "6px 8px", background: g != null ? heat(T, g, "good") : b != null ? heat(T, b, "bad") : T.inputBg }}>
                  <div style={{ fontSize: 9.5, color: T.muted, textTransform: "uppercase", letterSpacing: .5, lineHeight: 1.2 }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 2 }}>{c.show(r)}</div>
                  {c.sub && <div style={{ fontSize: 10, color: T.muted }}>{c.sub(r)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="pmo-scroll" style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.surface }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isCompact ? 980 : 0 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: "left", cursor: "default", width: 34 }} title="Tick up to three to compare head to head" />
          <th style={{ ...th, textAlign: "left", cursor: "default" }}>Campus / site</th>
          <th style={{ ...th, textAlign: "left", cursor: "default" }}>Stages</th>
          {cols.map(head)}
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.campus} style={{ background: picked.includes(r.campus) ? `${BRAND.blue}14` : i % 2 ? T.tableRow : "transparent" }}>
              <td style={{ ...td, textAlign: "left" }}>
                <input type="checkbox" aria-label={`Compare ${r.campus}`} checked={picked.includes(r.campus)}
                  disabled={!picked.includes(r.campus) && picked.length >= 3} onChange={() => togglePick(r.campus)} />
              </td>
              <td style={{ ...td, textAlign: "left" }}>
                <button type="button" className="pmo-focusable" onClick={() => onOpenCampus(r.campus)} title={`Open ${r.campus}`}
                  style={{ border: 0, background: "none", padding: 0, color: T.text, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {r.campus}<ExternalLink size={11} color={T.muted} /></button>
              </td>
              <td style={{ ...td, textAlign: "left", width: 100 }}><StageBar stages={r.stages} total={r.projects} /></td>
              {cols.map(c => {
                const g = c.good?.(r), b = c.bad?.(r);
                return (
                  <td key={c.key} style={{ ...td, background: g != null ? heat(T, g, "good") : b != null ? heat(T, b, "bad") : "transparent" }}>
                    <div style={{ fontWeight: 600 }}>{c.show(r)}</div>
                    {c.sub && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>{c.sub(r)}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadToHead({ T, rows, picked, togglePick, onOpenCampus, onSelectProject, isCompact }) {
  const sel = picked.map(c => rows.find(r => r.campus === c)).filter(Boolean);
  const metrics = [
    { label: "Projects", v: r => r.projects, show: r => r.projects, neutral: true },
    { label: "DF Recommended", v: r => r.df, show: r => `PKR ${fmtM(r.df)}`, neutral: true },
    { label: "Approved", v: r => r.bac, show: r => `PKR ${fmtM(r.bac)}`, sub: r => `${r.approved} of ${r.projects} projects (${pct(r.approvedRate)})` },
    { label: "Released", v: r => r.released, show: r => `PKR ${fmtM(r.released)}`, sub: r => `${pct(r.releasedRate)} of DF Recommended` },
    { label: "PDD not submitted", v: r => r.pddNot, show: r => r.pddNot, sub: r => r.projects ? `${pct(r.pddNot / r.projects)} of projects` : "", bad: true },
    { label: "Planned finish passed", v: r => r.pastFinish, show: r => r.pastFinish, sub: () => "approved, completion not recorded", bad: true },
    { label: "Open risks", v: r => r.risks, show: r => r.risks, bad: true },
    { label: "Deliverables delivered", v: r => r.delivLines ? r.delivDone / r.delivLines : 0, show: r => r.delivLines ? `${r.delivDone} of ${r.delivLines}` : "—", pctScale: true },
    { label: "Projects without a PM", v: r => r.noPm, show: r => r.noPm, bad: true },
  ];
  const others = rows.filter(r => !picked.includes(r.campus)).sort((a, b) => b.df - a.df);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: SP.md }}>
        <span style={{ ...TYPE.label, color: T.muted, marginRight: 4 }}>Comparing</span>
        {sel.map(r => (
          <span key={r.campus} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 6px 4px 11px", borderRadius: R.pill, background: `${BRAND.blue}22`, border: `1px solid ${BRAND.blue}66`, fontSize: 12.5, color: T.text, fontWeight: 600 }}>
            {r.campus}<button type="button" className="pmo-focusable" title={`Remove ${r.campus}`} onClick={() => togglePick(r.campus)} style={{ border: 0, background: "none", color: T.muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={12} /></button>
          </span>
        ))}
        {picked.length < 3 && others.map(r => (
          <button key={r.campus} type="button" className="pmo-focusable" onClick={() => togglePick(r.campus)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: R.pill, background: "transparent", border: `1px dashed ${T.border}`, fontSize: 12, color: T.muted, cursor: "pointer" }}>
            <Plus size={11} />{r.campus}</button>
        ))}
      </div>
      {sel.length < 2 ? (
        <div style={{ border: `1px dashed ${T.border}`, borderRadius: R.lg, padding: SP.xxl, textAlign: "center", color: T.muted, fontSize: 13.5 }}>Pick two or three campuses above.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isCompact ? `repeat(${sel.length}, minmax(240px, 1fr))` : `repeat(${sel.length}, minmax(0, 1fr))`, gap: SP.md, overflowX: isCompact ? "auto" : "visible" }}>
          {sel.map(r => (
            <Surface key={r.campus} T={T} pad={SP.lg} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <div style={{ ...TYPE.h2, color: T.text, flex: 1 }}>{r.campus}</div>
                <button type="button" className="pmo-focusable" onClick={() => onOpenCampus(r.campus)} style={{ border: 0, background: "none", color: T.textOf(BRAND.blue), fontSize: 12, cursor: "pointer" }}>Open</button>
              </div>
              <StageBar stages={r.stages} total={r.projects} height={10} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 6 }}>
                {r.stages.filter(s => s.n).map(s => <span key={s.key} style={{ fontSize: 10.5, color: T.muted }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: s.color, marginRight: 4 }} />{s.label.split(" (")[0]} {s.n}</span>)}
              </div>
              <div style={{ marginTop: SP.md }}>
                {metrics.map(m => {
                  const max = Math.max(...sel.map(x => num(m.v(x))), m.pctScale ? 1 : 0);
                  const v = num(m.v(r)), best = m.bad ? Math.min(...sel.map(x => num(m.v(x)))) : Math.max(...sel.map(x => num(m.v(x))));
                  const lead = !m.neutral && sel.length > 1 && v === best && sel.some(x => num(m.v(x)) !== v);
                  return (
                    <div key={m.label} style={{ padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 11.5, color: T.muted, flex: 1 }}>{m.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: lead ? T.textOf(m.bad ? T.positive : T.positive) : T.text }}>{m.show(r)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(127,127,127,.15)", marginTop: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${max ? (v / max) * 100 : 0}%`, background: m.bad ? "#E8A63C" : BRAND.blue, borderRadius: 3 }} />
                      </div>
                      {m.sub && m.sub(r) && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 3 }}>{m.sub(r)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ ...TYPE.label, color: T.muted, marginTop: SP.md, marginBottom: 4 }}>Largest projects</div>
              {r.top.map(p => (
                <button key={p.id} type="button" className="pmo-focusable" onClick={() => onSelectProject?.(p.id)}
                  style={{ display: "flex", width: "100%", gap: 8, border: 0, background: "none", padding: "4px 0", cursor: "pointer", textAlign: "left", color: T.text }}>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>{fmtM(p.df_recommended_amount)}</span>
                </button>
              ))}
              <div style={{ ...TYPE.label, color: T.muted, marginTop: SP.md, marginBottom: 4 }}>Project managers</div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>
                {r.pms.length ? r.pms.map(([n, c]) => `${n} (${c})`).join(" · ") : <span style={{ color: T.muted }}>None assigned</span>}
                {r.noPm > 0 && <span style={{ color: T.textOf(T.warning || "#E8A63C") }}> · {r.noPm} without a PM</span>}
              </div>
              {r.pastOpen != null && <div style={{ fontSize: 12, color: T.muted, marginTop: SP.sm }}>Projects from earlier fiscal years still open: <b style={{ color: T.text }}>{r.pastOpen}</b></div>}
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}

export function CampusCompare({ T, session, supa, isCompact, onOpenCampus, onSelectProject }) {
  const { data, err } = useCompareData(supa, session);
  const rows = useMemo(() => data ? buildCampuses(data) : [], [data]);
  const [mode, setMode] = useState("all");                 // all | h2h
  const [sortKey, setSortKey] = useState("df");
  const [dir, setDir] = useState("desc");
  const [picked, setPicked] = useState([]);
  useEffect(() => { if (rows.length && !picked.length) setPicked([...rows].sort((a, b) => b.df - a.df).slice(0, 2).map(r => r.campus)); }, [rows]);  // eslint-disable-line react-hooks/exhaustive-deps
  const togglePick = (c) => setPicked(p => p.includes(c) ? p.filter(x => x !== c) : p.length >= 3 ? p : [...p, c]);
  const showPast = Array.isArray(data?.past) && data.past.length > 0;

  const totals = useMemo(() => rows.reduce((t, r) => ({ projects: t.projects + r.projects, df: t.df + r.df, released: t.released + r.released, approved: t.approved + r.approved }), { projects: 0, df: 0, released: 0, approved: 0 }), [rows]);

  const download = async () => {
    const XLSX = await import("xlsx");
    const head = ["Campus / site", "Projects", "DF Recommended (PKR)", "Approved projects", "Approved budget (PKR)", "Approved %", "Released (PKR)", "Released % of DF",
      "PDD not submitted", "Planned finish passed", "Open risks", "Deliverables delivered", "Deliverable items", "Projects without a PM", ...(showPast ? ["Past projects open"] : [])];
    const body = [...rows].sort((a, b) => b.df - a.df).map(r => [r.campus, r.projects, Math.round(r.df), r.approved, Math.round(r.bac), Math.round(r.approvedRate * 1000) / 10,
      Math.round(r.released), Math.round(r.releasedRate * 1000) / 10, r.pddNot, r.pastFinish, r.risks, r.delivDone, r.delivLines, r.noPm, ...(showPast ? [r.pastOpen ?? ""] : [])]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = head.map((h, i) => ({ wch: i ? 14 : 22 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Campus comparison");
    XLSX.writeFile(wb, `Campus_comparison_${todayPKT()}.xlsx`);
  };

  if (err) return <div style={{ color: T.textOf(T.danger), fontSize: 13, padding: SP.lg }}>{err}</div>;
  if (!data) return <div style={{ color: T.muted, fontSize: 13, padding: SP.lg }}>Loading the comparison…</div>;

  const seg = (on) => ({ padding: "6px 13px", borderRadius: R.pill, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: on ? 700 : 500,
    background: on ? `${BRAND.blue}22` : "transparent", color: on ? T.textOf(BRAND.blue) : T.muted, fontFamily: TYPE.body.fontFamily });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SP.md, flexWrap: "wrap", marginBottom: SP.md }}>
        <div role="tablist" style={{ display: "flex", padding: 2, borderRadius: R.pill, border: `1px solid ${T.border}`, background: T.surface }}>
          <button role="tab" aria-selected={mode === "all"} className="pmo-focusable" style={seg(mode === "all")} onClick={() => setMode("all")}>All campuses</button>
          <button role="tab" aria-selected={mode === "h2h"} className="pmo-focusable" style={seg(mode === "h2h")} onClick={() => setMode("h2h")}>Head to head{picked.length ? ` (${picked.length})` : ""}</button>
        </div>
        <span style={{ ...TYPE.caption, color: T.muted, flex: 1, minWidth: 200 }}>
          {rows.length} campuses · {totals.projects} CAPEX projects · DF PKR {fmtM(totals.df)} · {totals.approved} approved · released PKR {fmtM(totals.released)}
        </span>
        <Button T={T} variant="ghost" icon={Download} onClick={download} title="Download this comparison as an Excel sheet">Download as Excel</Button>
      </div>
      {mode === "all" ? (
        <>
          <AllCampuses T={T} rows={rows} sortKey={sortKey} setSortKey={setSortKey} dir={dir} setDir={setDir} picked={picked} togglePick={togglePick}
            onOpenCampus={onOpenCampus} isCompact={isCompact} showPast={showPast} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: SP.sm, alignItems: "center" }}>
            {STAGE_GROUPS.map(s => <span key={s.key} style={{ fontSize: 11, color: T.muted }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 5 }} />{s.label}</span>)}
            <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>
              Green = ahead, amber = needs attention. Click a column to rank by it; tick up to three campuses, then <button type="button" className="pmo-focusable" onClick={() => setMode("h2h")} style={{ border: 0, background: "none", padding: 0, color: T.textOf(BRAND.blue), cursor: "pointer", fontSize: 11 }}>compare them head to head</button>.
            </span>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
            CAPEX only. Approved = stage Approved or Closed. Released = disbursed to projects, not spent. "Planned finish passed" = approved projects whose planned finish date has passed with no completion recorded.
          </div>
        </>
      ) : (
        <HeadToHead T={T} rows={rows} picked={picked} togglePick={togglePick} onOpenCampus={onOpenCampus} onSelectProject={onSelectProject} isCompact={isCompact} />
      )}
    </div>
  );
}
