import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  Wallet, TrendingUp, Layers, Building2, CalendarRange, Search,
  ChevronDown, ChevronRight, Landmark, PiggyBank, BarChart3, PieChart as PieIcon,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TYPE, SP, R, MOTION, BRAND, DATA, seriesColours } from "./theme.js";
import {
  Surface, Section, SectionTitle, RankedBars, ShareStrip, WithInsight, InsightNote,
  Reveal, Badge, EmptyState, SkeletonCard, SkeletonChart, Progress,
  Select, Input, useCountUp, useCursorLight,
} from "./ui.jsx";
import { useNear } from "./presence.jsx";

// charts.jsx pulls in recharts and is deliberately kept off the critical path
// (see App.jsx) — it is loaded only after sign-in, when a chart is actually
// on screen. This page is statically imported into App.jsx, so a plain
// `import { X } from "./charts.jsx"` here would have quietly turned that
// dynamic import back into a static one for the whole app, defeating it.
// Mirroring App.jsx's own lazyChart() wrapper keeps the deferral intact.
const _charts = () => import("./charts.jsx");
const ChartFallback = ({ height = 220 }) => (
  <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center",
    opacity:0.35, fontSize:12 }}>Loading chart…</div>
);
const lazyChart = (name) => {
  const L = lazy(() => _charts().then((m) => ({ default: m[name] })));
  const Wrapped = (props) => (
    <Suspense fallback={<ChartFallback height={props?.height} />}><L {...props} /></Suspense>
  );
  Wrapped.displayName = name;
  return Wrapped;
};
const ChartTooltip       = lazyChart("ChartTooltip");
const PlannedActualChart = lazyChart("PlannedActualChart");
const Donut              = lazyChart("Donut");
const ShareDonut         = lazyChart("ShareDonut");

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECT CASHFLOWS — FY 26-27

   Rebuilt on the same component library the Capex Dashboard uses, rather than
   a parallel set of plainer widgets: Surface/Section for the living-surface
   chrome (proximity lift, cursor light, drift glow), PlannedActualChart and
   ShareDonut/Donut for the two flagship chart treatments, RankedBars for the
   breakdown, WithInsight/InsightNote for hover detail and inline findings.
   A page built from a second, weaker set of primitives always reads as a
   different product; reusing the real ones is what makes this look like the
   same one.

   Reads project_cashflows: one row per project per month, tagged capex, pmdc
   or investment. PMDC counts inside the CAPEX total (676,243,011) and is also
   broken out on its own; investment is reported separately throughout, as it
   is everywhere else in the portal.
   ═══════════════════════════════════════════════════════════════════════════ */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const mLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};
// Same formula the rest of the portal uses (App.jsx's fmtM) — not exported,
// so mirrored here rather than diverging on rounding or the decimal count.
const fmtM = (n) => n == null ? "—"
  : (Number(n) / 1e6).toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
const axisStyle = (T) => ({ fontSize: 10.5, fontFamily: TYPE.body.fontFamily, fill: T.dim });
/* ── Stat tile ───────────────────────────────────────────────────────────────
   The dashboard's KPI card (EditableKCard), minus the editing machinery this
   page has no use for: proximity lift + cursor light on the same node, a
   sheen sweep on hover, an icon micro-animation, a hover insight, and a
   real count-up rather than a number that just appears. */
function StatTile({ T, label, value, sub, colour, Icon, insight, index = 0, iconAnim = "pmo-ico-glow" }) {
  const [hover, setHover] = useState(false);
  const cl = useCursorLight(true);
  const nearRef = useNear();
  const shown = useCountUp(value);
  const c = colour || BRAND.blue;

  const body = (
    <div
      ref={(n) => { cl.ref.current = n; nearRef.current = n; }}
      onMouseMove={cl.onMouseMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); cl.onMouseLeave(); }}
      className={`pmo-in ${hover ? "pmo-hot" : ""}`}
      style={{
        animationDelay: `${index * 55}ms`, position: "relative", overflow: "visible",
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        "--near-light": `${c}22`,
        background: hover
          ? `linear-gradient(158deg, ${T.surfaceHi} 0%, ${T.surfaceRaised} 52%, ${c}${T.washStrong} 100%)`
          : `linear-gradient(158deg, ${T.surfaceRaised} 0%, ${T.surface} 55%, ${c}${T.wash} 100%)`,
        border: `1px solid ${hover ? c + "66" : T.border}`,
        borderRadius: R.lg, padding: `${SP.lg}px ${SP.lg}px ${SP.md}px`,
        boxShadow: hover ? T.glowSoft(c) : T.shadow, cursor: insight ? "help" : "default",
        transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}, background ${MOTION.base}`,
      }}>
      <span className="pmo-sheen" />
      <span className="pmo-cursor-light" style={{
        background: `radial-gradient(340px circle at var(--mx,50%) var(--my,50%), ${T.cursorLight}, transparent 68%)`,
      }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${c}, ${c}44 70%, transparent)`,
        opacity: hover ? 1 : 0.6, transition: `opacity ${MOTION.base}` }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: SP.sm, marginBottom: SP.sm }}>
        <div style={{ width: 26, height: 26, borderRadius: R.sm, flexShrink: 0,
          background: hover ? `${c}${T.washStrong}` : `${c}${T.badge}`,
          border: `1px solid ${c}${hover ? "4D" : "26"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: `background ${MOTION.base}, border-color ${MOTION.base}` }}>
          <Icon className={iconAnim} size={13} color={c} strokeWidth={2} />
        </div>
        <span style={{ ...TYPE.label, color: T.muted }}>{label}</span>
      </div>
      <div style={{ position: "relative", ...TYPE.metricSm, fontSize: 25, color: T.text, lineHeight: 1.05 }}>{shown}</div>
      <div style={{ position: "relative", ...TYPE.caption, color: hover ? T.textSoft : T.dim,
        marginTop: "auto", paddingTop: 4,
        transition: `color ${MOTION.base}` }}>{sub}</div>
    </div>
  );

  // WithInsight renders an inline-flex span, which shrinks to its content — so a
  // wrapped tile never filled its grid column and the row looked like five
  // narrow cards with wide gaps. width and height 100% make the wrapper behave
  // like the card it stands in for.
  return insight ? (
    <WithInsight T={T} side="bottom" align="left" width={252} tone={c}
      title={label} line={insight}
      style={{ width: "100%", height: "100%" }}>{body}</WithInsight>
  ) : body;
}

/* ── The page ────────────────────────────────────────────────────────────── */
export function CashflowsPage({ T, session, supa, isCompact, onSelectProject }) {
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
      m[k].projects.add(r.project_id || r.project_name);
    });
    let run = 0;
    return Object.values(m).sort((a,b) => a.month.localeCompare(b.month)).map(x => {
      const total = x.capex + x.pmdc;
      run += total;
      return { ...x, label:mLabel(x.month), total, cumulative:run, count:x.projects.size };
    });
  }, [shown]);

  // Shaped for PlannedActualChart — the exact component the dashboard's
  // flagship "Cumulative release against plan" panel uses, so this reads as
  // the same chart on a different slice of the portfolio, not a lookalike.
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
      return { label:x.label, planned:x.cumulative, actual:run };
    });
  }, [monthly, rel]);

  const CUT_KEY = { campus:"campus", type:"project_type", priority:"priority",
                    centre:"cost_centre", org:"organization" };
  const byCut = useMemo(() => {
    const key = CUT_KEY[cut] || "campus";
    const m = {};
    cap.forEach(r => {
      const k = r[key] || "Unspecified";
      (m[k] ||= { name:k, value:0, projects:new Set() });
      m[k].value += Number(r.amount) || 0;
      m[k].projects.add(r.project_id || r.project_name);
    });
    // Sort first, then colour: assigning by map order gave the largest bar
    // whatever hue its insertion position happened to land on.
    const sorted = Object.values(m).sort((a,b) => b.value - a.value);
    const cols = seriesColours(sorted.length, T.mode !== "light");
    return sorted.map((x,i) => ({ ...x, count:x.projects.size, key:x.name,
      label:x.name, color:cols[i],
      meta:`${x.projects.size} project${x.projects.size===1?"":"s"}` }));
  }, [cap, cut, T.mode]);

  // Wired to the same filter the cut is drawn from, so clicking a bar filters
  // the page exactly as the label implies. Org and cost centre have no
  // matching filter state, so clicking there is inert rather than misleading.
  const cutFilter = { campus:[campus,setCampus], type:[ptype,setPtype], priority:[prio,setPrio] }[cut];
  const onCutPick = (k) => { if (cutFilter) cutFilter[1](v => v === k ? "" : k); };
  const cutActive = cutFilter ? cutFilter[0] || null : null;

  const pmdcByCampus = useMemo(() => {
    const m = {};
    cap.filter(r => r.bucket === "pmdc").forEach(r => {
      const k = r.campus || "Unspecified";
      (m[k] ||= { name:k, value:0 });
      m[k].value += Number(r.amount) || 0;
    });
    const sorted = Object.values(m).sort((a,b) => b.value - a.value);
    const cols = seriesColours(sorted.length, T.mode !== "light");
    return sorted.map((x,i) => ({ key:x.name, name:x.name, value:x.value, color:cols[i] }));
  }, [cap, T.mode]);

  const pmdcMonthly = useMemo(
    () => monthly.filter(x => x.pmdc > 0).map(x => ({ label:x.label, pmdc:x.pmdc })), [monthly]);
  const invMonthly = useMemo(
    () => monthly.filter(x => x.investment > 0).map(x => ({ label:x.label, investment:x.investment })), [monthly]);

  const totals = useMemo(() => {
    const capex = sum(cap, r => r.bucket === "capex");
    const pmdc  = sum(cap, r => r.bucket === "pmdc");
    const peak  = monthly.reduce((a,b) => (b.total > (a?.total ?? -1) ? b : a), null);
    const drawn = rel.reduce((s,r) => s + (Number(r.amount_released)||0), 0);
    // Count distinct PROJECTS, not distinct names. The MHH block fund is entered
    // as five month-suffixed rows — "(May 2026)", "(June 2026)" and so on — all
    // belonging to one project, so counting names reported 107 against the
    // register's 103. A row with no project yet still counts once, by name, so
    // the figure never silently undercounts.
    const countProjects = (rows) => {
      const ids = new Set(), orphans = new Set();
      rows.forEach(r => r.project_id ? ids.add(r.project_id) : orphans.add(r.project_name));
      return ids.size + orphans.size;
    };
    return { capex, pmdc, capexTotal:capex+pmdc, investment:sum(inv),
             peak, drawn, projects:countProjects(cap),
             invProjects:countProjects(inv) };
  }, [cap, inv, monthly, rel]);

  const pctDrawn = totals.capexTotal ? (totals.drawn/totals.capexTotal*100) : 0;
  const pctPmdc  = totals.capexTotal ? (totals.pmdc/totals.capexTotal*100) : 0;

  const axis = axisStyle(T);
  const pad = isCompact ? SP.lg : `${SP.xl}px ${SP.xxl}px ${SP.xxl}px`;

  if (rows === null) {
    return (
      <div style={{ flex:1, overflow:"auto", background:T.page, padding:pad, display:"flex",
        flexDirection:"column", gap:SP.lg }}>
        <div style={{ display:"grid", gap:SP.md, gridTemplateColumns:"repeat(auto-fit, minmax(min(180px,100%),1fr))" }}>
          {[0,1,2,3,4].map(i => <SkeletonCard key={i} T={T} h={104} />)}
        </div>
        <Surface T={T} pad={SP.lg}><SkeletonChart T={T} h={280} /></Surface>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:T.page }}>
        <EmptyState T={T} icon={Wallet} tone={T.info}
          title="No cashflow data loaded yet"
          message="Import the FY 26-27 cashflow plan to populate this page." />
      </div>
    );
  }

  return (
    <div className="pmo-scroll" style={{ flex:1, overflow:"auto", background:T.page,
      backgroundImage:T.ambient, backgroundAttachment:"local" }}>
      <div style={{ padding:pad, display:"flex", flexDirection:"column", gap:SP.lg }}>

        {/* ── Headline ─────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gap:SP.sm,
          gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(5, minmax(0,1fr))" }}>
          <StatTile T={T} index={0} label="CAPEX total" value={`PKR ${fmtM(totals.capexTotal)}`}
            sub={`${totals.projects} projects · incl. PMDC`} colour={BRAND.blue} Icon={Wallet}
            iconAnim="pmo-ico-up"
            insight={`The full FY 26-27 capex plan, PMDC included. ${totals.projects} projects carry a monthly figure.`} />
          <StatTile T={T} index={1} label="of which PMDC" value={`PKR ${fmtM(totals.pmdc)}`}
            sub={`${pctPmdc.toFixed(1)}% of CAPEX`} colour={DATA.warning} Icon={Layers}
            iconAnim="pmo-ico-shift"
            insight="Counted inside the CAPEX total above, and broken out here because it concentrates in a handful of months rather than running across the year." />
          <StatTile T={T} index={2} label="Released to date" value={`PKR ${fmtM(totals.drawn)}`}
            sub={`${pctDrawn.toFixed(1)}% drawn`} colour={DATA.positive} Icon={TrendingUp}
            iconAnim="pmo-ico-tick"
            insight={`${fmtM(totals.drawn)} released against ${fmtM(totals.capexTotal)} planned — from recorded budget release dates.`} />
          <StatTile T={T} index={3} label="Peak month" value={totals.peak ? totals.peak.label : "—"}
            sub={totals.peak ? `PKR ${fmtM(totals.peak.total)}` : ""} colour={BRAND.gold} Icon={CalendarRange}
            iconAnim="pmo-ico-glow"
            insight={totals.peak ? `The heaviest single month in the plan — ${totals.peak.count} project${totals.peak.count===1?"":"s"} draw against it.` : null} />
          <StatTile T={T} index={4} label="Investment" value={`PKR ${fmtM(totals.investment)}`}
            sub={`${totals.invProjects} projects · outside CAPEX`} colour={DATA.info} Icon={Landmark}
            iconAnim="pmo-ico-pulse"
            insight="Kept separate from every CAPEX figure on this page, matching how the rest of the portal treats investment projects." />
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center" }}>
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
            <span style={{ ...TYPE.caption, color:T.muted, marginLeft:"auto" }}>
              filtered · PKR {fmtM(totals.capexTotal)} across {totals.projects} projects
            </span>
          )}
        </div>

        {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>}

        {/* ── Monthly profile ──────────────────────────────────────────── */}
        <Reveal>
        <Section T={T} tone={BRAND.blue} pad={SP.lg}>
          <SectionTitle T={T} icon={BarChart3} title="Monthly cashflow profile"
            sub="Planned spend by month, with the running cumulative across the fiscal year" />
          <div style={{ height: isCompact ? 250 : 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top:8, right:8, left:isCompact?-6:0, bottom:0 }}>
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
                <CartesianGrid stroke={T.border} vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke:T.border }} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtM} width={54} />
                <YAxis yAxisId="c" orientation="right" tick={axis} tickLine={false} axisLine={false}
                  tickFormatter={fmtM} width={54} />
                <Tooltip cursor={{ fill:`${BRAND.blue}12` }}
                  content={(p) => <ChartTooltip {...p} T={T} fmt={fmtM} />} />
                <Legend verticalAlign="top" align="right" height={26} iconType="plainline" iconSize={14}
                  wrapperStyle={{ ...TYPE.caption, paddingBottom:6 }}
                  formatter={(v, entry) => <span style={{ ...TYPE.caption, color:T.textOf(entry?.color) }}>{v}</span>} />
                <Bar dataKey="capex" name="CAPEX" stackId="a" fill="url(#cfCap)" animationDuration={850} />
                <Bar dataKey="pmdc"  name="PMDC"  stackId="a" fill="url(#cfPmdc)" radius={[4,4,0,0]} animationDuration={850} />
                <Line yAxisId="c" type="monotone" dataKey="cumulative" name="Cumulative"
                  stroke={DATA.positive} strokeWidth={2.25} dot={false} animationDuration={1100} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <InsightNote T={T} insight={totals.peak ? {
            tone: pctPmdc > 25 ? "watch" : "good",
            title: "Where the spend concentrates",
            body: `${totals.peak.label} carries the heaviest load at ${fmtM(totals.peak.total)}. `
                + `PMDC makes up ${pctPmdc.toFixed(1)}% of the CAPEX total and sits almost entirely `
                + `in a handful of months rather than spread across the year.`,
          } : null} />
        </Section>
        </Reveal>

        {/* ── Plan vs actual ───────────────────────────────────────────── */}
        <Reveal delay={60}>
        <Section T={T} tone={T.positive} pad={SP.lg}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between",
            gap:SP.lg, flexWrap:"wrap", marginBottom:SP.md }}>
            <div>
              <div style={{ ...TYPE.h3, color:T.text }}>Cumulative release against plan</div>
              <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>
                Planned from the monthly cashflow profile · actual from recorded budget release dates
              </div>
            </div>
            <div style={{ display:"flex", gap:SP.xl, flexWrap:"wrap" }}>
              <div>
                <div style={{ ...TYPE.label, color:T.muted, marginBottom:3 }}>Planned</div>
                <div style={{ ...TYPE.metricSm, color:T.textOf(T.info) }}>{fmtM(totals.capexTotal)}</div>
              </div>
              <div>
                <div style={{ ...TYPE.label, color:T.muted, marginBottom:3 }}>Released</div>
                <div style={{ ...TYPE.metricSm, color:T.textOf(T.positive) }}>{fmtM(totals.drawn)}</div>
              </div>
              <WithInsight T={T} side="bottom" align="right" width={264}
                tone={pctDrawn < 25 ? T.danger : T.positive}
                title="Portfolio release progress"
                line={`${fmtM(totals.drawn)} released against ${fmtM(totals.capexTotal)} planned.`}
                stat={`${pctDrawn.toFixed(1)}% of the recommended portfolio`}>
                <div style={{ cursor:"help" }}>
                  <div style={{ ...TYPE.label, color:T.muted, marginBottom:3 }}>Of plan</div>
                  <div style={{ ...TYPE.metricSm,
                    color:T.textOf(pctDrawn < 25 ? T.danger : pctDrawn < 60 ? T.warning : T.positive) }}>
                    {pctDrawn.toFixed(1)}%
                  </div>
                </div>
              </WithInsight>
            </div>
          </div>
          <PlannedActualChart T={T} data={released} height={isCompact ? 220 : 280}
            isMobile={isCompact} fmt={fmtM} />
          <InsightNote T={T} style={{ marginTop:SP.md }} insight={{
            tone: pctDrawn < 10 ? "attention" : pctDrawn < 50 ? "watch" : "good",
            title: pctDrawn < 10 ? "Release is well behind plan" : "Portfolio release progress",
            body: `${fmtM(totals.drawn)} released against ${fmtM(totals.capexTotal)} planned — `
                + `${pctDrawn.toFixed(1)}% of the recommended portfolio. Release dates are recorded `
                + `against ${rel.length} project${rel.length===1?"":"s"}, so the actual line reflects only those.`,
          }} />
        </Section>
        </Reveal>

        {/* ── Breakdown ────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gap:SP.lg, alignItems:"stretch",
          gridTemplateColumns: isCompact ? "1fr" : "1.3fr 1fr" }}>
          <Reveal delay={100} style={{ display:"flex" }}>
          <Section T={T} tone={BRAND.gold} pad={SP.lg} style={{ flex:1 }}>
            <SectionTitle T={T} icon={Layers} title="CAPEX by breakdown"
              sub="PMDC included — hover or click a bar to filter"
              right={
                <Select T={T} value={cut} onChange={e => setCut(e.target.value)}>
                  <option value="campus">By campus</option>
                  <option value="type">By project type</option>
                  <option value="priority">By priority</option>
                  <option value="org">By organization</option>
                  <option value="centre">By cost centre</option>
                </Select>
              } />
            <RankedBars T={T} items={byCut} fmt={fmtM} showTarget={false} barH={9}
              onPick={onCutPick} activeKey={cutActive} />
          </Section>
          </Reveal>

          <Reveal delay={140} style={{ display:"flex" }}>
          <Section T={T} tone={T.info} pad={SP.lg} style={{ flex:1 }}>
            <SectionTitle T={T} icon={PieIcon} title="Share of CAPEX" sub="Hover a slice for its detail" />
            <ShareDonut T={T} data={byCut} total={`PKR ${fmtM(totals.capexTotal)}`}
              totalLabel="CAPEX total" fmt={fmtM} height={isCompact ? 230 : 270}
              onPick={onCutPick} activeKey={cutActive} />
          </Section>
          </Reveal>
        </div>

        {/* ── PMDC and Investment ──────────────────────────────────────── */}
        <div style={{ display:"grid", gap:SP.lg, gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr" }}>
          <Reveal delay={180}>
          <Section T={T} tone={DATA.warning} pad={SP.lg}>
            <SectionTitle T={T} icon={Layers} title="PMDC programme"
              sub="Counted inside the CAPEX total, shown here on its own"
              right={<span style={{ ...TYPE.metricSm, fontSize:17, color:T.textOf(DATA.warning) }}>
                PKR {fmtM(totals.pmdc)}
              </span>} />
            <div style={{ height:180, marginBottom:SP.md }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pmdcMonthly} margin={{ top:4, right:8, left:isCompact?-10:0, bottom:0 }}>
                  <CartesianGrid stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke:T.border }} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtM} width={50} />
                  <Tooltip cursor={{ fill:`${DATA.warning}12` }}
                    content={(p) => <ChartTooltip {...p} T={T} fmt={fmtM} />} />
                  <Bar dataKey="pmdc" name="PMDC" fill={DATA.warning} fillOpacity={0.85}
                    radius={[5,5,0,0]} animationDuration={850} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {pmdcByCampus.length > 0 && (
              <ShareStrip T={T} items={pmdcByCampus.map(x => ({ key:x.key, label:x.name, value:x.value, color:x.color }))}
                fmt={fmtM} />
            )}
            <div style={{ marginTop:SP.sm, ...TYPE.caption, color:T.muted, lineHeight:1.6 }}>
              Concentrated in {pmdcMonthly.length} month{pmdcMonthly.length===1?"":"s"} and then complete —
              the inspection work does not run across the year.
            </div>
          </Section>
          </Reveal>

          <Reveal delay={220}>
          <Section T={T} tone={T.info} pad={SP.lg}>
            <SectionTitle T={T} icon={Landmark} title="Investment projects"
              sub="Reported separately — outside the CAPEX total"
              right={<span style={{ ...TYPE.metricSm, fontSize:17, color:T.textOf(T.info) }}>
                PKR {fmtM(totals.investment)}
              </span>} />
            <div style={{ height:180, marginBottom:SP.md }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invMonthly} margin={{ top:4, right:8, left:isCompact?-10:0, bottom:0 }}>
                  <CartesianGrid stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke:T.border }} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtM} width={50} />
                  <Tooltip cursor={{ fill:`${T.info}12` }}
                    content={(p) => <ChartTooltip {...p} T={T} fmt={fmtM} />} />
                  <Bar dataKey="investment" name="Investment" fill={T.info} fillOpacity={0.85}
                    radius={[5,5,0,0]} animationDuration={850} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[...new Set(inv.map(r => r.project_name))].map(n => {
                const v = sum(inv, r => r.project_name === n);
                const pct = totals.investment ? (v/totals.investment*100) : 0;
                return (
                  <div key={n}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10, fontSize:12.5,
                      color:T.textSoft, marginBottom:4 }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
                      <span style={{ color:T.text, fontWeight:700, whiteSpace:"nowrap" }}>{fmtM(v)}</span>
                    </div>
                    <Progress T={T} value={v} max={totals.investment || 1} color={T.info} height={6} />
                  </div>
                );
              })}
            </div>
          </Section>
          </Reveal>
        </div>

        {/* ── Month by month ───────────────────────────────────────────── */}
        <Reveal delay={260}>
        <Section T={T} tone={BRAND.blue} pad={SP.lg}>
          <SectionTitle T={T} icon={CalendarRange} title="Month by month"
            sub="Open a month to see the projects behind it" />
          <div style={{ border:`1px solid ${T.border}`, borderRadius:R.md, overflow:"hidden" }}>
            {monthly.map((mth, i) => {
              const open = openMonth === mth.month;
              const lines = cap.filter(r => r.month === mth.month).sort((a,b) => Number(b.amount)-Number(a.amount));
              return (
                <div key={mth.month}>
                  <div onClick={() => setOpenMonth(open ? null : mth.month)}
                    className="pmo-focusable"
                    style={{ display:"flex", alignItems:"center", gap:SP.md, cursor:"pointer",
                      padding:"11px 14px", borderTop: i ? `1px solid ${T.border}` : "none",
                      background: open ? T.surfaceRaised : (i % 2 ? T.card2 : "transparent"),
                      transition:`background ${MOTION.fast}` }}>
                    {open ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
                    <span style={{ fontSize:13, fontWeight:600, color:T.text, width:72 }}>{mth.label}</span>
                    <div style={{ flex:1 }}>
                      <Progress T={T} value={mth.total} max={totals.peak?.total || 1}
                        color={mth.pmdc > 0 ? DATA.warning : BRAND.blue} height={6} />
                    </div>
                    <span style={{ ...TYPE.caption, color:T.dim, width:80, textAlign:"right" }}>
                      {mth.count} project{mth.count===1?"":"s"}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:T.text, width:86, textAlign:"right" }}>
                      {fmtM(mth.total)}
                    </span>
                  </div>
                  {open && (
                    <div style={{ background:T.card2, padding:`${SP.sm}px 14px ${SP.md}px 42px` }}>
                      {lines.map(l => {
                        // A month opens to show which projects sit behind the
                        // figure, and the obvious next question is "show me that
                        // one" — so each line goes to the project. Rows without a
                        // project_id stay inert rather than looking clickable.
                        const go = l.project_id && onSelectProject
                          ? () => onSelectProject(l.project_id) : null;
                        return (
                        <div key={l.id} onClick={go || undefined}
                          onKeyDown={go ? (e) => { if (e.key === "Enter") go(); } : undefined}
                          tabIndex={go ? 0 : undefined}
                          role={go ? "button" : undefined}
                          title={go ? `Open ${l.project_name}` : undefined}
                          className={go ? "pmo-focusable pmo-row" : ""}
                          style={{ display:"flex", alignItems:"center", gap:10,
                          padding:"5px 8px", margin:"0 -8px", borderRadius:R.sm,
                          cursor: go ? "pointer" : "default",
                          borderBottom:`1px solid ${T.border}`,
                          transition:`background ${MOTION.fast}` }}>
                          <span style={{ width:3, height:15, borderRadius:2, flexShrink:0,
                            background: l.bucket === "pmdc" ? DATA.warning : BRAND.blue }} />
                          <span style={{ flex:1, fontSize:12, color:T.textSoft, overflow:"hidden",
                            textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.project_name}</span>
                          <span style={{ ...TYPE.caption, color:T.dim, flexShrink:0 }}>{l.campus}</span>
                          {l.bucket === "pmdc" && (
                            <Badge T={T} color={DATA.warning} size="sm">PMDC</Badge>
                          )}
                          <span style={{ fontSize:12, fontWeight:600, color:T.text, width:78,
                            textAlign:"right", flexShrink:0 }}>{fmtM(l.amount)}</span>
                          {go && <ChevronRight size={12} color={T.dim} style={{ flexShrink:0 }} />}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
        </Reveal>

      </div>
    </div>
  );
}
