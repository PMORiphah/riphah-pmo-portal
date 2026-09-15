import { useState, useEffect, useMemo, useCallback } from "react";
import { Wallet, TrendingUp, Layers, Building2, CalendarRange, Search,
         ChevronDown, ChevronRight, AlertTriangle, Landmark, Coins } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from "recharts";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, Input, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECT CASHFLOWS — FY 26-27

   Reads project_cashflows: one row per project per month, tagged capex, pmdc
   or investment. PMDC counts inside the CAPEX total (676,243,011) and is also
   broken out on its own, because it concentrates entirely in Aug–Nov and then
   stops. Investment is reported separately throughout, as it is everywhere
   else in the portal.

   This replaces the old tab, which embedded a static HTML dashboard built from
   an August snapshot and could never move with the data.
   ═══════════════════════════════════════════════════════════════════════════ */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const mLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};
const M = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(0) + "K";
  return v.toFixed(0);
};
const full = (n) => (Number(n) || 0).toLocaleString("en");

/* Injected once. Entrance animations use `backwards`, never `both`: `both`
   retains the final keyframe, and a retained transform or filter makes the
   element a containing block for position:fixed children, which silently drags
   modals and dropdowns out of place. */
let cssIn = false;
function useCashflowStyles() {
  useEffect(() => {
    if (cssIn) return;
    cssIn = true;
    const el = document.createElement("style");
    el.textContent = `
@keyframes cfIn   { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
@keyframes cfGlow { 0%,100% { opacity:.20; transform:translate3d(-5%,-3%,0) scale(1); }
                    50%      { opacity:.38; transform:translate3d(5%,3%,0) scale(1.09); } }
.cf-in   { animation: cfIn .45s cubic-bezier(.22,.8,.3,1) backwards; }
.cf-glow { animation: cfGlow 30s ease-in-out infinite; will-change: opacity, transform; }
@media (prefers-reduced-motion: reduce) { .cf-in, .cf-glow { animation: none !important; } }`;
    document.head.appendChild(el);
  }, []);
}

/* ── Building blocks ─────────────────────────────────────────────────────── */
function Panel({ T, title, sub, right, children, accent, delay = 0, style }) {
  return (
    <div className="cf-in" style={{
      animationDelay:`${delay}ms`, position:"relative", overflow:"hidden",
      background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg,
      boxShadow:T.shadow, ...style,
    }}>
      {accent && (
        <div aria-hidden="true" style={{ position:"absolute", inset:0, pointerEvents:"none",
          background:`linear-gradient(135deg, ${accent}${T.wash} 0%, transparent 55%)` }} />
      )}
      <div style={{ position:"relative", padding:`${SP.lg}px ${SP.xl}px` }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:SP.md, marginBottom: children ? SP.md : 0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ ...TYPE.label, color:T.text }}>{title}</div>
            {sub && <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>{sub}</div>}
          </div>
          {right}
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ T, label, value, sub, colour, Icon, delay = 0 }) {
  return (
    <div className="cf-in" style={{
      animationDelay:`${delay}ms`, position:"relative", overflow:"hidden",
      padding:`${SP.md}px ${SP.lg}px`, background:T.surface,
      border:`1px solid ${T.border}`, borderRadius:R.lg, boxShadow:T.shadow,
    }}>
      <div aria-hidden="true" style={{ position:"absolute", inset:0, pointerEvents:"none",
        background:`linear-gradient(135deg, ${colour}${T.wash} 0%, transparent 60%)` }} />
      <div style={{ position:"relative", display:"flex", alignItems:"center", gap:7 }}>
        <Icon size={13} color={colour} />
        <span style={{ ...TYPE.label, color:T.muted }}>{label}</span>
      </div>
      <div style={{ position:"relative", ...TYPE.metricSm, fontSize:26, color:T.text,
        marginTop:6, lineHeight:1.05 }}>{value}</div>
      <div style={{ position:"relative", ...TYPE.caption, color:T.dim, marginTop:3 }}>{sub}</div>
    </div>
  );
}

function ChartTip({ T, active, payload, label, note }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:T.surfaceFloat, border:`1px solid ${T.borderStrong}`,
      borderRadius:R.md, padding:"9px 12px", boxShadow:T.shadowLg, minWidth:170 }}>
      <div style={{ fontSize:11.5, fontWeight:700, color:T.text, marginBottom:5 }}>{label}</div>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} style={{ display:"flex", justifyContent:"space-between",
          gap:14, fontSize:11, marginTop:2 }}>
          <span style={{ color:p.color }}>{p.name}</span>
          <span style={{ color:T.text, fontWeight:600 }}>PKR {full(Math.round(p.value))}</span>
        </div>
      ))}
      {note && <div style={{ ...TYPE.caption, color:T.dim, marginTop:6 }}>{note}</div>}
    </div>
  );
}

/* ── The page ────────────────────────────────────────────────────────────── */
export function CashflowsPage({ T, session, supa, isCompact }) {
  useCashflowStyles();
  const [rows, setRows]   = useState(null);
  const [rel, setRel]     = useState([]);
  const [err, setErr]     = useState(null);
  const [q, setQ]         = useState("");
  const [campus, setCampus] = useState("");
  const [ptype, setPtype]   = useState("");
  const [prio, setPrio]     = useState("");
  const [cut, setCut]       = useState("campus");
  const [openMonth, setOpenMonth] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supa("/rest/v1/project_cashflows?select=*&order=month.asc", {}, session.access_token),
      // actual releases, so plan can be shown against what has been drawn
      supa("/rest/v1/projects?portfolio=eq.capex&select=name,amount_released,budget_release_date"
         + "&amount_released=gt.0&order=budget_release_date.asc", {}, session.access_token)
        .catch(() => []),
    ]).then(([c, r]) => {
      if (!alive) return;
      setRows(Array.isArray(c) ? c : []);
      setRel(Array.isArray(r) ? r : []);
    }).catch(e => { if (alive) { setErr(e.message); setRows([]); } });
    return () => { alive = false; };
  }, [supa, session]);

  const opts = useMemo(() => {
    const u = (k) => [...new Set((rows||[]).map(r => r[k]).filter(Boolean))].sort();
    return { campus:u("campus"), ptype:u("project_type"), prio:u("priority") };
  }, [rows]);

  // Filters drive every chart on the page at once.
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows||[]).filter(r =>
      (!campus || r.campus === campus) &&
      (!ptype  || r.project_type === ptype) &&
      (!prio   || r.priority === prio) &&
      (!n || `${r.project_name} ${r.cost_centre||""}`.toLowerCase().includes(n)));
  }, [rows, q, campus, ptype, prio]);

  const cap = useMemo(() => shown.filter(r => r.bucket !== "investment"), [shown]);
  const inv = useMemo(() => shown.filter(r => r.bucket === "investment"), [shown]);

  const sum = (a, f = () => true) => a.filter(f).reduce((s,r) => s + (Number(r.amount)||0), 0);

  const monthly = useMemo(() => {
    const m = {};
    shown.forEach(r => {
      const k = r.month;
      (m[k] ||= { month:k, capex:0, pmdc:0, investment:0, projects:new Set() });
      m[k][r.bucket] += Number(r.amount) || 0;
      m[k].projects.add(r.project_name);
    });
    let run = 0;
    return Object.values(m).sort((a,b) => a.month.localeCompare(b.month)).map(x => {
      const total = x.capex + x.pmdc;
      run += total;
      return { ...x, label:mLabel(x.month), total, cumulative:run, count:x.projects.size };
    });
  }, [shown]);

  // Actual releases bucketed by month, so the plan line has something to sit against.
  const released = useMemo(() => {
    const m = {};
    rel.forEach(r => {
      if (!r.budget_release_date) return;
      const k = r.budget_release_date.slice(0,8) + "01";
      m[k] = (m[k] || 0) + (Number(r.amount_released) || 0);
    });
    let run = 0;
    return monthly.map(x => {
      run += m[x.month] || 0;
      return { label:x.label, planned:x.cumulative, released:run };
    });
  }, [monthly, rel]);

  const byCut = useMemo(() => {
    const key = { campus:"campus", type:"project_type", priority:"priority",
                  centre:"cost_centre", org:"organization" }[cut] || "campus";
    const m = {};
    cap.forEach(r => {
      const k = r[key] || "Unspecified";
      (m[k] ||= { name:k, value:0, projects:new Set() });
      m[k].value += Number(r.amount) || 0;
      m[k].projects.add(r.project_name);
    });
    return Object.values(m).map(x => ({ ...x, count:x.projects.size }))
      .sort((a,b) => b.value - a.value);
  }, [cap, cut]);

  const pmdcMonthly = useMemo(
    () => monthly.filter(x => x.pmdc > 0).map(x => ({ label:x.label, pmdc:x.pmdc })), [monthly]);
  const invMonthly = useMemo(
    () => monthly.filter(x => x.investment > 0).map(x => ({ label:x.label, investment:x.investment })), [monthly]);

  const totals = useMemo(() => {
    const capex = sum(cap, r => r.bucket === "capex");
    const pmdc  = sum(cap, r => r.bucket === "pmdc");
    const peak  = monthly.reduce((a,b) => (b.total > (a?.total ?? -1) ? b : a), null);
    const drawn = rel.reduce((s,r) => s + (Number(r.amount_released)||0), 0);
    return { capex, pmdc, capexTotal:capex+pmdc, investment:sum(inv),
             peak, drawn, projects:new Set(cap.map(r => r.project_name)).size,
             invProjects:new Set(inv.map(r => r.project_name)).size };
  }, [cap, inv, monthly, rel]);

  const PALETTE = [BRAND.blue, BRAND.gold, DATA.positive, DATA.info, DATA.warning,
                   "#8B6DB5", "#4EA8A0", "#C2708A", "#6B8CB5", "#B58A5E", "#7FA35C"];

  if (rows === null) return <div style={{ padding:SP.xxl, color:T.muted, fontSize:13 }}>Loading cashflows…</div>;
  if (!rows.length) return (
    <div style={{ padding:SP.xxl, color:T.muted, fontSize:13 }}>
      No cashflow data loaded yet.
    </div>
  );

  const axis = { stroke:T.dim, fontSize:10.5, tickLine:false, axisLine:false };

  return (
    <div className="pmo-scroll" style={{ flex:1, overflow:"auto", background:T.page }}>
      <div style={{ padding: isCompact ? SP.lg : `${SP.xl}px ${SP.xxl}px`, position:"relative" }}>

        {/* Ambient wash, in its own layer with pointer events off so the animated
            transform can never become a containing block for anything above it. */}
        <div aria-hidden="true" style={{ position:"absolute", inset:0, overflow:"hidden",
          pointerEvents:"none", zIndex:0 }}>
          <div className="cf-glow" style={{ position:"absolute", top:"-20%", left:"4%",
            width:560, height:560, borderRadius:"50%",
            background:`radial-gradient(circle, ${BRAND.blue}26 0%, transparent 68%)` }} />
          <div className="cf-glow" style={{ position:"absolute", bottom:"-26%", right:"2%",
            width:620, height:620, borderRadius:"50%", animationDelay:"-15s",
            background:`radial-gradient(circle, ${BRAND.gold}1F 0%, transparent 70%)` }} />
        </div>

        <div style={{ position:"relative", zIndex:1 }}>

          {/* ── Headline ─────────────────────────────────────────────────── */}
          <div style={{ display:"grid", gap:SP.md, marginBottom:SP.lg,
            gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(5, minmax(0,1fr))" }}>
            <Stat T={T} label="CAPEX total" value={`PKR ${M(totals.capexTotal)}`}
              sub={`${totals.projects} projects · incl. PMDC`} colour={BRAND.blue} Icon={Wallet} delay={0} />
            <Stat T={T} label="of which PMDC" value={`PKR ${M(totals.pmdc)}`}
              sub={`${(totals.pmdc/(totals.capexTotal||1)*100).toFixed(1)}% of CAPEX`}
              colour={DATA.warning} Icon={Layers} delay={60} />
            <Stat T={T} label="Released to date" value={`PKR ${M(totals.drawn)}`}
              sub={`${(totals.drawn/(totals.capexTotal||1)*100).toFixed(1)}% drawn`}
              colour={DATA.positive} Icon={TrendingUp} delay={120} />
            <Stat T={T} label="Peak month" value={totals.peak ? totals.peak.label : "—"}
              sub={totals.peak ? `PKR ${M(totals.peak.total)}` : ""}
              colour={BRAND.gold} Icon={CalendarRange} delay={180} />
            <Stat T={T} label="Investment" value={`PKR ${M(totals.investment)}`}
              sub={`${totals.invProjects} projects · outside CAPEX`}
              colour={DATA.info} Icon={Landmark} delay={240} />
          </div>

          {/* ── Filters ──────────────────────────────────────────────────── */}
          <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center",
            marginBottom:SP.lg }}>
            <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)}
              onClear={() => setQ("")} placeholder="Search project or cost centre…"
              style={{ flex:"0 1 280px", minWidth:150 }} />
            <Select T={T} value={campus} onChange={e => setCampus(e.target.value)}>
              <option value="">All campuses</option>
              {opts.campus.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select T={T} value={ptype} onChange={e => setPtype(e.target.value)}>
              <option value="">All project types</option>
              {opts.ptype.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select T={T} value={prio} onChange={e => setPrio(e.target.value)}>
              <option value="">All priorities</option>
              {opts.prio.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            {(q || campus || ptype || prio) && (
              <span style={{ ...TYPE.caption, color:T.muted }}>
                filtered · PKR {M(totals.capexTotal)} across {totals.projects} projects
              </span>
            )}
          </div>

          {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.md }}>{err}</div>}

          {/* ── Monthly profile ──────────────────────────────────────────── */}
          <Panel T={T} accent={BRAND.blue} delay={60}
            title="Monthly cashflow profile"
            sub="Planned spend by month, with the running cumulative across the fiscal year"
            style={{ marginBottom:SP.lg }}>
            <div style={{ height: isCompact ? 260 : 330 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top:8, right:8, left:0, bottom:0 }}>
                  <defs>
                    <linearGradient id="cfCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={BRAND.blue} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="cfPmdc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={DATA.warning} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={DATA.warning} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} tickFormatter={M} width={52} />
                  <YAxis yAxisId="c" orientation="right" {...axis} tickFormatter={M} width={52} />
                  <Tooltip content={<ChartTip T={T} />} cursor={{ fill:`${BRAND.blue}12` }} />
                  <Legend wrapperStyle={{ fontSize:11, color:T.muted }} />
                  <Bar dataKey="capex" name="CAPEX" stackId="a" fill="url(#cfCap)" radius={[0,0,0,0]} />
                  <Bar dataKey="pmdc"  name="PMDC"  stackId="a" fill="url(#cfPmdc)" radius={[4,4,0,0]} />
                  <Line yAxisId="c" type="monotone" dataKey="cumulative" name="Cumulative"
                    stroke={DATA.positive} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* ── Plan vs actual ───────────────────────────────────────────── */}
          <Panel T={T} accent={DATA.positive} delay={120}
            title="Cumulative plan against actual release"
            sub="Planned from the cashflow profile · actual from recorded budget release dates"
            right={
              <div style={{ textAlign:"right" }}>
                <div style={{ ...TYPE.label, color:T.dim }}>Drawn</div>
                <div style={{ ...TYPE.metricSm, fontSize:19, color:T.textOf(DATA.positive) }}>
                  {(totals.drawn/(totals.capexTotal||1)*100).toFixed(1)}%
                </div>
              </div>
            }
            style={{ marginBottom:SP.lg }}>
            <div style={{ height: isCompact ? 230 : 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={released} margin={{ top:8, right:8, left:0, bottom:0 }}>
                  <defs>
                    <linearGradient id="cfRel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={DATA.positive} stopOpacity={0.38} />
                      <stop offset="100%" stopColor={DATA.positive} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} tickFormatter={M} width={52} />
                  <Tooltip content={<ChartTip T={T} />} />
                  <Legend wrapperStyle={{ fontSize:11, color:T.muted }} />
                  <Area type="monotone" dataKey="released" name="Released"
                    stroke={DATA.positive} strokeWidth={2} fill="url(#cfRel)" />
                  <Line type="monotone" dataKey="planned" name="Planned"
                    stroke={BRAND.blue} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop:SP.md, padding:"9px 12px", borderRadius:R.sm,
              background:T.card2, border:`1px solid ${T.border}`, fontSize:12, color:T.muted,
              lineHeight:1.6 }}>
              Release dates are recorded against {rel.length} projects, so the actual line reflects
              only those. Planned is the full profile.
            </div>
          </Panel>

          {/* ── Breakdown ────────────────────────────────────────────────── */}
          <div style={{ display:"grid", gap:SP.lg, marginBottom:SP.lg,
            gridTemplateColumns: isCompact ? "1fr" : "1.35fr 1fr" }}>
            <Panel T={T} accent={BRAND.gold} delay={180}
              title="CAPEX by breakdown"
              sub={`${byCut.length} groups · PMDC included`}
              right={
                <Select T={T} value={cut} onChange={e => setCut(e.target.value)}>
                  <option value="campus">By campus</option>
                  <option value="type">By project type</option>
                  <option value="priority">By priority</option>
                  <option value="org">By organization</option>
                  <option value="centre">By cost centre</option>
                </Select>
              }>
              <div style={{ height: Math.max(240, Math.min(byCut.length, 14) * 26 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCut.slice(0,14)} layout="vertical"
                    margin={{ top:4, right:16, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="2 6" stroke={T.border} horizontal={false} />
                    <XAxis type="number" {...axis} tickFormatter={M} />
                    <YAxis type="category" dataKey="name" {...axis}
                      width={isCompact ? 90 : 150} interval={0} />
                    <Tooltip content={<ChartTip T={T} />} cursor={{ fill:`${BRAND.gold}12` }} />
                    <Bar dataKey="value" name="Planned" radius={[0,5,5,0]}>
                      {byCut.slice(0,14).map((_,i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.88} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel T={T} accent={DATA.info} delay={240}
              title="Share of CAPEX" sub="Top groups by planned spend">
              <div style={{ height:280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCut.slice(0,7)} dataKey="value" nameKey="name"
                      innerRadius={62} outerRadius={104} paddingAngle={2} stroke="none">
                      {byCut.slice(0,7).map((_,i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.9} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip T={T} />} />
                    <Legend wrapperStyle={{ fontSize:10.5, color:T.muted }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* ── PMDC and Investment, side by side ────────────────────────── */}
          <div style={{ display:"grid", gap:SP.lg, marginBottom:SP.lg,
            gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr" }}>
            <Panel T={T} accent={DATA.warning} delay={300}
              title="PMDC programme"
              sub="Counted inside the CAPEX total, shown here on its own"
              right={
                <div style={{ textAlign:"right" }}>
                  <div style={{ ...TYPE.label, color:T.dim }}>Total</div>
                  <div style={{ ...TYPE.metricSm, fontSize:19, color:T.textOf(DATA.warning) }}>
                    PKR {M(totals.pmdc)}
                  </div>
                </div>
              }>
              <div style={{ height:210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pmdcMonthly} margin={{ top:4, right:8, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="2 6" stroke={T.border} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} tickFormatter={M} width={52} />
                    <Tooltip content={<ChartTip T={T} />} cursor={{ fill:`${DATA.warning}12` }} />
                    <Bar dataKey="pmdc" name="PMDC" fill={DATA.warning} fillOpacity={0.85} radius={[5,5,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop:SP.sm, ...TYPE.caption, color:T.muted, lineHeight:1.6 }}>
                Concentrated in {pmdcMonthly.length} month{pmdcMonthly.length===1?"":"s"} and then
                complete — the inspection work does not run across the year.
              </div>
            </Panel>

            <Panel T={T} accent={DATA.info} delay={360}
              title="Investment projects"
              sub="Reported separately — outside the CAPEX total"
              right={
                <div style={{ textAlign:"right" }}>
                  <div style={{ ...TYPE.label, color:T.dim }}>Total</div>
                  <div style={{ ...TYPE.metricSm, fontSize:19, color:T.textOf(DATA.info) }}>
                    PKR {M(totals.investment)}
                  </div>
                </div>
              }>
              <div style={{ height:210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={invMonthly} margin={{ top:4, right:8, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="2 6" stroke={T.border} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} tickFormatter={M} width={52} />
                    <Tooltip content={<ChartTip T={T} />} cursor={{ fill:`${DATA.info}12` }} />
                    <Bar dataKey="investment" name="Investment" fill={DATA.info}
                      fillOpacity={0.85} radius={[5,5,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop:SP.sm, display:"flex", flexDirection:"column", gap:5 }}>
                {[...new Set(inv.map(r => r.project_name))].map(n => {
                  const v = sum(inv, r => r.project_name === n);
                  return (
                    <div key={n} style={{ display:"flex", justifyContent:"space-between", gap:10,
                      fontSize:12, color:T.textSoft }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
                      <span style={{ color:T.text, fontWeight:600, whiteSpace:"nowrap" }}>PKR {M(v)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* ── Month by month ───────────────────────────────────────────── */}
          <Panel T={T} accent={BRAND.blue} delay={420}
            title="Month by month" sub="Open a month to see the projects behind it">
            <div style={{ border:`1px solid ${T.border}`, borderRadius:R.md, overflow:"hidden" }}>
              {monthly.map((mth, i) => {
                const open = openMonth === mth.month;
                const lines = cap.filter(r => r.month === mth.month)
                                 .sort((a,b) => Number(b.amount) - Number(a.amount));
                const share = totals.capexTotal ? mth.total / totals.capexTotal * 100 : 0;
                return (
                  <div key={mth.month}>
                    <div onClick={() => setOpenMonth(open ? null : mth.month)}
                      style={{ display:"flex", alignItems:"center", gap:SP.md, cursor:"pointer",
                        padding:"11px 14px", borderTop: i ? `1px solid ${T.border}` : "none",
                        background: open ? T.surfaceRaised : (i % 2 ? T.card2 : "transparent"),
                        transition:`background ${MOTION.fast}` }}>
                      {open ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
                      <span style={{ fontSize:13, fontWeight:600, color:T.text, width:72 }}>{mth.label}</span>
                      <div style={{ flex:1, height:6, background:T.border, borderRadius:3, overflow:"hidden" }}>
                        <div style={{ width:`${Math.min(share*3,100)}%`, height:"100%",
                          background:`linear-gradient(90deg, ${BRAND.blue}, ${BRAND.gold})` }} />
                      </div>
                      <span style={{ ...TYPE.caption, color:T.dim, width:80, textAlign:"right" }}>
                        {mth.count} project{mth.count===1?"":"s"}
                      </span>
                      <span style={{ fontSize:13, fontWeight:700, color:T.text, width:86,
                        textAlign:"right" }}>PKR {M(mth.total)}</span>
                    </div>
                    {open && (
                      <div style={{ background:T.card2, padding:`${SP.sm}px 14px ${SP.md}px 42px` }}>
                        {lines.map(l => (
                          <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10,
                            padding:"5px 0", borderBottom:`1px solid ${T.border}` }}>
                            <span style={{ width:3, height:15, borderRadius:2, flexShrink:0,
                              background: l.bucket === "pmdc" ? DATA.warning : BRAND.blue }} />
                            <span style={{ flex:1, fontSize:12, color:T.textSoft, overflow:"hidden",
                              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.project_name}</span>
                            <span style={{ ...TYPE.caption, color:T.dim, flexShrink:0 }}>{l.campus}</span>
                            {l.bucket === "pmdc" && (
                              <span style={{ ...TYPE.caption, color:T.textOf(DATA.warning),
                                flexShrink:0 }}>PMDC</span>
                            )}
                            <span style={{ fontSize:12, fontWeight:600, color:T.text, width:78,
                              textAlign:"right", flexShrink:0 }}>PKR {M(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

        </div>
      </div>
    </div>
  );
}
