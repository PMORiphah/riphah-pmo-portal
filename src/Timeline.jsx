import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CalendarRange, ChevronRight, ChevronDown, AlertTriangle, Search, X } from "lucide-react";
import { TYPE, SP, R, MOTION, STAGE_META, BRAND, DATA } from "./theme.js";
import { Select, Input, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PORTFOLIO TIMELINE

   One bar per project against a month axis, grouped by campus. Built on the
   planned dates the portfolio already holds, so it needs nothing from the
   project managers and no new tables.

   A third of the portfolio cannot be drawn — 28 projects have a planned start
   and no end, 11 have no dates at all. Those are listed under the chart rather
   than dropped, because a timeline that quietly shows 75 of 114 projects is
   worse than no timeline: it reads as complete.
   ═══════════════════════════════════════════════════════════════════════════ */

const DAY = 86400000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const d0 = (s) => { const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; };
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const fmtD = (d) => d ? d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—";
const fmtM = (n) => (n == null || n === "") ? "—"
  : (parseFloat(n)/1e6).toLocaleString("en", { minimumFractionDigits:1, maximumFractionDigits:1 }) + "M";

export function PortfolioTimeline({ T, session, supa, onSelectProject, isCompact }) {
  const [rows, setRows]   = useState(null);
  const [err, setErr]     = useState(null);
  const [q, setQ]         = useState("");
  const [campus, setCampus] = useState("");
  const [stage, setStage]   = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [hover, setHover] = useState(null);
  const scroller = useRef(null);
  const didCentre = useRef(false);

  useEffect(() => {
    let alive = true;
    supa("/rest/v1/projects?portfolio=eq.capex&select=id,code,name,campus,workflow_stage,"
       + "start_date,end_date,actual_start_date,actual_end_date,pct_complete,bac,amount_released"
       + "&order=campus.asc,start_date.asc", {}, session.access_token)
      .then(r => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(e => { if (alive) { setErr(e.message); setRows([]); } });
    return () => { alive = false; };
  }, [session.access_token]);

  const campuses = useMemo(
    () => [...new Set((rows||[]).map(r => r.campus).filter(Boolean))].sort(), [rows]);

  const { scheduled, unscheduled } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = (r) => (!campus || r.campus === campus)
      && (!stage || r.workflow_stage === stage)
      && (!needle || `${r.code||""} ${r.name||""}`.toLowerCase().includes(needle));
    const s = [], u = [];
    (rows||[]).filter(keep).forEach(r => {
      const a = d0(r.start_date), b = d0(r.end_date);
      (a && b && b >= a) ? s.push({ ...r, _s:a, _e:b }) : u.push(r);
    });
    return { scheduled:s, unscheduled:u };
  }, [rows, q, campus, stage]);

  // The axis spans whatever the data actually covers, snapped to whole months,
  // with a month of air either side so bars never touch the frame.
  const axis = useMemo(() => {
    if (!scheduled.length) return null;
    let lo = scheduled[0]._s, hi = scheduled[0]._e;
    scheduled.forEach(r => { if (r._s < lo) lo = r._s; if (r._e > hi) hi = r._e; });
    const today = new Date();
    if (today < lo) lo = today;
    if (today > hi) hi = today;
    const from = addMonths(monthStart(lo), -1);
    const to   = addMonths(monthStart(hi), 2);
    const months = [];
    for (let d = new Date(from); d < to; d = addMonths(d, 1)) months.push(new Date(d));
    return { from, to, months, span: (to - from) / DAY };
  }, [scheduled]);

  const COLW = isCompact ? 44 : 58;              // px per month
  const chartW = axis ? axis.months.length * COLW : 0;
  const xOf = useCallback((date) => axis ? ((date - axis.from)/DAY) / axis.span * chartW : 0,
    [axis, chartW]);

  // Open on today rather than on January, which is usually empty.
  useEffect(() => {
    if (!axis || didCentre.current || !scroller.current) return;
    didCentre.current = true;
    scroller.current.scrollLeft = Math.max(0, xOf(new Date()) - scroller.current.clientWidth*0.35);
  }, [axis, xOf]);

  const groups = useMemo(() => {
    const m = {};
    scheduled.forEach(r => { (m[r.campus || "— No campus —"] ||= []).push(r); });
    return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0]));
  }, [scheduled]);

  const NAMEW = isCompact ? 132 : 250;
  const ROWH  = isCompact ? 30 : 34;
  const todayX = axis ? xOf(new Date()) : 0;

  if (rows === null) return <div style={{ padding:SP.xxl, color:T.muted, fontSize:13 }}>Loading timeline…</div>;

  return (
    <div style={{ padding: isCompact ? SP.md : SP.lg, minWidth:0 }}>
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center", marginBottom:SP.md }}>
        <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)}
          onClear={() => setQ("")} placeholder="Search projects…"
          style={{ flex:"0 1 260px", minWidth:150 }} />
        <Select T={T} value={campus} onChange={e => setCampus(e.target.value)}>
          <option value="">All campuses</option>
          {campuses.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select T={T} value={stage} onChange={e => setStage(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGE_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <div style={{ marginLeft:"auto", ...TYPE.caption, color:T.muted }}>
          {scheduled.length} scheduled
          {unscheduled.length > 0 && <> · <span style={{ color:T.textOf(DATA.warning) }}>{unscheduled.length} without dates</span></>}
        </div>
      </div>

      {err && <div style={{ fontSize:12.5, color:T.textOf(T.danger), marginBottom:SP.md }}>{err}</div>}

      {!axis ? (
        <div style={{ padding:SP.xxl, textAlign:"center", color:T.muted, fontSize:13,
          background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg }}>
          No projects with both a planned start and end date match these filters.
        </div>
      ) : (
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg,
          overflow:"hidden", boxShadow:T.shadow }}>
          <div ref={scroller} className="pmo-scroll" style={{ overflowX:"auto", overflowY:"visible" }}>
            <div style={{ minWidth: NAMEW + chartW }}>

              {/* ── Month axis ────────────────────────────────────────────── */}
              <div style={{ display:"flex", position:"sticky", top:0, zIndex:3,
                background:T.surfaceRaised, borderBottom:`1px solid ${T.borderStrong}` }}>
                <div style={{ width:NAMEW, flexShrink:0, position:"sticky", left:0, zIndex:4,
                  background:T.surfaceRaised, borderRight:`1px solid ${T.borderStrong}`,
                  padding:"8px 12px", ...TYPE.label, color:T.muted }}>Project</div>
                <div style={{ position:"relative", width:chartW, height:38 }}>
                  {axis.months.map((m, i) => {
                    const jan = m.getMonth() === 0;
                    return (
                      <div key={i} style={{ position:"absolute", left:i*COLW, top:0, width:COLW, height:"100%",
                        borderLeft:`1px solid ${jan ? T.borderStrong : T.border}`,
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:10.5, color:T.text, fontWeight: jan ? 700 : 500 }}>{MONTHS[m.getMonth()]}</span>
                        {(jan || i === 0) && <span style={{ fontSize:9, color:T.dim }}>{m.getFullYear()}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Rows ──────────────────────────────────────────────────── */}
              <div style={{ position:"relative" }}>
                {/* today marker, drawn once behind every row */}
                {todayX > 0 && todayX < chartW && (
                  <div aria-hidden="true" style={{ position:"absolute", top:0, bottom:0,
                    left: NAMEW + todayX, width:2, background:`${DATA.danger}CC`, zIndex:2,
                    pointerEvents:"none" }} />
                )}

                {groups.map(([name, list]) => {
                  const shut = collapsed[name];
                  return (
                    <div key={name}>
                      {/* The band spans the full chart width, but only the label
                          is pinned — making the whole row sticky leaves the text
                          anchored to the scrolled content and it slides away. */}
                      <div onClick={() => setCollapsed(c => ({ ...c, [name]: !c[name] }))}
                        style={{ display:"flex", alignItems:"center", background:T.card2,
                          borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`,
                          cursor:"pointer", height:30 }}>
                        <div style={{ position:"sticky", left:0, zIndex:3, display:"flex",
                          alignItems:"center", gap:6, padding:"0 12px", height:"100%",
                          width:NAMEW, boxSizing:"border-box", background:T.card2,
                          borderRight:`1px solid ${T.border}` }}>
                          {shut ? <ChevronRight size={13} color={T.muted} /> : <ChevronDown size={13} color={T.muted} />}
                          <span style={{ ...TYPE.label, color:T.text, overflow:"hidden",
                            textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
                          <span style={{ ...TYPE.caption, color:T.dim, marginLeft:"auto" }}>{list.length}</span>
                        </div>
                      </div>

                      {!shut && list.map(r => {
                        const meta = STAGE_META[r.workflow_stage] || {};
                        const x = xOf(r._s), w = Math.max(4, xOf(r._e) - xOf(r._s));
                        const late = r._e < new Date() && r.workflow_stage !== "closed";
                        const clr = late ? DATA.danger : (meta.color || BRAND.blue);
                        const pct = Math.max(0, Math.min(100, parseFloat(r.pct_complete) || 0));
                        const on = CAN_HOVER ? {
                          onMouseEnter:() => setHover(r.id), onMouseLeave:() => setHover(null) } : {};
                        return (
                          <div key={r.id} {...on} onClick={() => onSelectProject?.(r.id)}
                            style={{ display:"flex", cursor:"pointer", position:"relative",
                              background: hover === r.id ? T.surfaceRaised : "transparent",
                              transition:`background ${MOTION.fast}` }}>
                            <div style={{ width:NAMEW, flexShrink:0, position:"sticky", left:0, zIndex:1,
                              background: hover === r.id ? T.surfaceRaised : T.surface,
                              borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`,
                              padding:"4px 12px", height:ROWH, boxSizing:"border-box", overflow:"hidden" }}>
                              <div style={{ fontSize:9.5, color:T.dim, fontFamily:"monospace", lineHeight:1.1 }}>
                                {r.code && r.code !== "-" ? r.code : "\u00A0"}
                              </div>
                              <div style={{ fontSize:11.5, color:T.text, lineHeight:1.25,
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</div>
                            </div>

                            <div style={{ position:"relative", width:chartW, height:ROWH,
                              borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                              {axis.months.map((m, i) => (
                                <div key={i} style={{ position:"absolute", left:i*COLW, top:0, bottom:0, width:1,
                                  background: m.getMonth() === 0 ? T.borderStrong : T.border, opacity:.55 }} />
                              ))}
                              <div style={{ position:"absolute", left:x, top:(ROWH-15)/2, width:w, height:15,
                                borderRadius:4, background:`${clr}2E`, border:`1px solid ${clr}99`,
                                overflow:"hidden" }}>
                                {pct > 0 && (
                                  <div style={{ position:"absolute", left:0, top:0, bottom:0,
                                    width:`${pct}%`, background:`${clr}D9` }} />
                                )}
                              </div>
                              {hover === r.id && (
                                <div className="pmo-scale" style={{ position:"absolute", zIndex:6,
                                  left: Math.min(x, chartW-260), top:ROWH-2, width:250,
                                  background:T.surfaceFloat, border:`1px solid ${T.borderStrong}`,
                                  borderRadius:R.md, boxShadow:T.shadowLg, padding:"9px 11px",
                                  pointerEvents:"none" }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:5 }}>{r.name}</div>
                                  {[["Planned", `${fmtD(r._s)} → ${fmtD(r._e)}`],
                                    ["Stage", meta.label || r.workflow_stage],
                                    ["Progress", `${pct.toFixed(0)}%`],
                                    ["Approved", fmtM(r.bac)],
                                    ["Released", fmtM(r.amount_released)]].map(([k,v]) => (
                                    <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:10,
                                      fontSize:11, marginTop:2 }}>
                                      <span style={{ color:T.muted }}>{k}</span>
                                      <span style={{ color:T.text, textAlign:"right" }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Everything the chart cannot show ───────────────────────────────── */}
      {unscheduled.length > 0 && (
        <div style={{ marginTop:SP.lg, background:T.surface, border:`1px solid ${DATA.warning}3D`,
          borderRadius:R.lg, padding:SP.lg }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:SP.sm }}>
            <AlertTriangle size={15} color={T.textOf(DATA.warning)} />
            <span style={{ ...TYPE.label, color:T.textOf(DATA.warning) }}>
              Not on the timeline — {unscheduled.length} project{unscheduled.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:SP.md, lineHeight:1.6 }}>
            A bar needs both a planned start and a planned end. These are listed so the
            chart is not mistaken for the whole portfolio.
          </div>
          <div style={{ display:"grid", gap:6,
            gridTemplateColumns: isCompact ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {unscheduled.map(r => (
              <button key={r.id} className="pmo-focusable pmo-btn" onClick={() => onSelectProject?.(r.id)}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                  background:T.card2, border:`1px solid ${T.border}`, borderRadius:R.sm,
                  cursor:"pointer", textAlign:"left", width:"100%" }}>
                <span style={{ fontSize:9.5, color:T.dim, fontFamily:"monospace", flexShrink:0 }}>
                  {r.code && r.code !== "-" ? r.code : "—"}
                </span>
                <span style={{ fontSize:11.5, color:T.text, overflow:"hidden",
                  textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{r.name}</span>
                <span style={{ ...TYPE.caption, color:T.textOf(DATA.warning), flexShrink:0 }}>
                  {r.start_date ? "no end date" : "no dates"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
