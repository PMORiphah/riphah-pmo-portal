import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Sector, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Sparkles, TrendingUp, GraduationCap, Wallet, Coins, Percent, Pencil, Plus, Hourglass, ChevronDown, ChevronRight,
  Building2, PieChart as PieIcon, BarChart3, CalendarRange, RotateCcw, Trash2, FileText,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Input, Select, Modal, Section, SectionTitle, EmptyState, useViewport } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   BENEFITS REALIZATION (PMO, 5 Nov 2026; asked for by the Chancellor and senior management)

   The PMO's own list of FY 25-26 and FY 26-27 projects, each tagged Revenue or Student Experience
   (table benefit_realization, read through the view benefit_realization_list, which adds `status`).
   Only the list: nothing is added automatically. An entry is shown once its project is finished:
     FY 26-27: stage Closed;   FY 25-26: not open on Past Projects.
   The database decides that (benefit_status); guests only ever receive shown entries (RLS).
   The PMO edits everything (budget, revenue with an as-of date for Revenue entries, description,
   name, ID, campus, FY, category), adds entries, removes (soft) and restores them, and sees the
   "Waiting to close" panel with the reason for each entry not shown yet.
   ═══════════════════════════════════════════════════════════════════════════ */

const CAT = {
  revenue:            { label: "Revenue",            short: "Revenue",  color: BRAND.gold,  icon: Coins },
  student_experience: { label: "Student Experience", short: "Student exp.", color: DATA.violet, icon: GraduationCap },
};
const FYS = ["FY 25-26", "FY 26-27"];
const STAGE = { pdd_not_submitted: "PDD not submitted", identified: "PDD submitted", mt_review: "MT Review", ed_review: "ED Review",
  df_review: "DF Review", approved: "Approved", closed: "Closed" };
const reason = (s) => s === "open_past" ? "Still open on Past Projects"
  : s === "not_in_portal" ? "Not found among FY 26-27 projects"
  : String(s || "").startsWith("stage:") ? `FY 26-27 stage: ${STAGE[s.slice(6)] || s.slice(6)} (shown once Closed)` : "Waiting";

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (n) => Number(n || 0).toLocaleString("en", { maximumFractionDigits: 0 });
const fmtM = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : fmt(v); };
const pkrM = (n) => `PKR ${fmtM(n)}`;
const fmtDay = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const axis = (T) => ({ fontSize: 10.5, fontFamily: TYPE.body.fontFamily, fill: T.dim });
// Shorten a long name but keep its last bracket, so "(PRH)", "(RIH)" and "(MHH)" stay apart.
const short = (s, n) => {
  if (!s || s.length <= n) return s || "—";
  const tail = (/\s*\([^()]*\)\s*$/.exec(s) || [""])[0].trim();
  return tail && tail.length < n - 8 ? s.slice(0, n - tail.length - 2).trimEnd() + "… " + tail : s.slice(0, n - 1) + "…";
};
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Count up once when a figure first appears or changes.
function useCount(target, ms = 1100) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); return; }
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// The animated figure re-renders on its own, never the whole page (a page re-render every frame restarted the charts' animation).
function CountUp({ value, format, ms }) { return format(useCount(value, ms)); }

function Tip({ T, active, payload, label, fmtV = pkrM, foot }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${T.borderStrong}`,
      borderRadius: R.md, padding: `${SP.sm}px ${SP.md}px`, boxShadow: T.shadowLg, minWidth: 170, maxWidth: 300 }}>
      <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6, overflowWrap: "anywhere" }}>{label}</div>
      {payload.filter(p => p.value !== null && p.value !== undefined).map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: SP.lg, marginTop: i ? 4 : 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.caption, color: T.textSoft }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.payload?.fill && !String(p.payload.fill).startsWith("url") ? p.payload.fill : p.color }} />{p.name}
          </span>
          <span style={{ ...TYPE.caption, color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtV(p.value)}</span>
        </div>
      ))}
      {foot && <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${T.border}`, ...TYPE.caption, color: T.muted }}>{foot}</div>}
    </div>
  );
}

function Seg({ T, value, set, items }) {
  return (
    <div role="tablist" style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: R.pill, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
      {items.map(([v, l, c]) => {
        const on = value === v;
        return (
          <button key={v || "all"} role="tab" aria-selected={on} onClick={() => set(v)} className="pmo-focusable pmo-btn"
            style={{ border: "none", cursor: "pointer", padding: "5px 12px", borderRadius: R.pill, ...TYPE.caption, fontWeight: 700,
              background: on ? (c ? `${c}40` : "rgba(255,255,255,0.18)") : "transparent", color: on ? "#fff" : "rgba(255,255,255,0.7)",
              boxShadow: on ? `inset 0 0 0 1px ${c ? `${c}aa` : "rgba(255,255,255,0.35)"}` : "none", transition: `all ${MOTION.fast}` }}>{l}</button>
        );
      })}
    </div>
  );
}
function Kpi({ T, compact, icon: Icon, label, value, sub, color, i }) {
  return (
    <div className="pmo-lift br-rise" style={{ animationDelay: `${i * 90}ms`, flex: "1 1 180px", minWidth: 0, padding: compact ? "12px 14px" : "16px 18px", borderRadius: R.lg,
      background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, ...TYPE.label, fontSize: 9.5, color: "rgba(255,255,255,0.72)" }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: `${color}33` }}><Icon size={12} color={color} /></span>{label}
      </div>
      <div style={{ ...TYPE.display, fontSize: compact ? 21 : 27, color: "#fff", marginTop: 6, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.66)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Pill({ T, c, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: R.pill, whiteSpace: "nowrap",
      background: `${c}1f`, border: `1px solid ${c}55`, color: T.textOf(c), ...TYPE.caption, fontSize: 10.5, fontWeight: 700 }}>{children}</span>
  );
}
function L({ T, label, children, hint, wide }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: wide ? "1 / -1" : "auto", minWidth: 0 }}>
      <span style={{ ...TYPE.label, fontSize: 9.5, color: T.dim }}>{label}</span>
      {children}
      {hint && <span style={{ ...TYPE.caption, color: T.dim }}>{hint}</span>}
    </label>
  );
}

export function BenefitsRealizationPage({ T, session, supa }) {
  const vp = useViewport();
  const compact = vp.isCompact;
  const isPMO = session?.role === "pmo";
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [fy, setFy] = useState("");          // "" = both years
  const [cat, setCat] = useState("");        // "" = both categories
  const [edit, setEdit] = useState(null);    // row being edited, or {} for a new entry
  const [read, setRead] = useState(null);    // card opened to read its description (PMO, 10 Nov 2026: shown on click, not on the card)
  const [showWaiting, setShowWaiting] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [anim, setAnim] = useState(() => !reduced());
  useEffect(() => { const t = setTimeout(() => setAnim(false), 1900); return () => clearTimeout(t); }, []);
  const A = (begin, dur) => ({ isAnimationActive: anim, animationBegin: begin, animationDuration: dur, animationEasing: "ease-out" });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await supa(`/rest/v1/benefit_realization_list?select=*&order=fiscal_year.asc,sr.asc.nullslast,project_name.asc`, {}, session.access_token);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message || "Could not load Benefits Realization."); setRows([]); }
  }, [supa, session]);
  useEffect(() => { load(); }, [load]);

  const all = rows || [];
  const shown = useMemo(() => all.filter(r => r.status === "eligible" && !r.removed), [all]);
  const waiting = useMemo(() => all.filter(r => r.status !== "eligible" && !r.removed), [all]);
  const removed = useMemo(() => all.filter(r => r.removed), [all]);
  const view = useMemo(() => shown.filter(r => (!fy || r.fiscal_year === fy) && (!cat || r.category === cat)), [shown, fy, cat]);
  const rev = view.filter(r => r.category === "revenue");
  const se = view.filter(r => r.category === "student_experience");

  const k = useMemo(() => {
    const budget = view.reduce((s, r) => s + (num(r.budget) || 0), 0);
    const withBudget = view.filter(r => num(r.budget) !== null).length;
    const revenue = rev.reduce((s, r) => s + (num(r.revenue) || 0), 0);
    const withRev = rev.filter(r => num(r.revenue) !== null).length;
    const both = rev.filter(r => num(r.revenue) !== null && num(r.budget) > 0);
    const bB = both.reduce((s, r) => s + num(r.budget), 0), bR = both.reduce((s, r) => s + num(r.revenue), 0);
    return { budget, withBudget, revenue, withRev, roi: bB > 0 ? bR / bB : null, roiN: both.length };
  }, [view, rev]);


  // Charts
  const split = useMemo(() => Object.keys(CAT).map(c => {
    const list = view.filter(r => r.category === c);
    return { key: c, name: CAT[c].label, value: list.length, budget: list.reduce((s, r) => s + (num(r.budget) || 0), 0), color: CAT[c].color };
  }).filter(s => s.value > 0), [view]);
  const byFy = useMemo(() => FYS.map(y => {
    const list = shown.filter(r => r.fiscal_year === y && (!cat || r.category === cat));
    return { name: y, revenue: list.filter(r => r.category === "revenue").length, student_experience: list.filter(r => r.category === "student_experience").length,
      budget: list.reduce((s, r) => s + (num(r.budget) || 0), 0) };
  }), [shown, cat]);
  const byCampus = useMemo(() => {
    const m = new Map();
    view.forEach(r => { const c = r.campus || "—"; const x = m.get(c) || { name: c, revenue: 0, student_experience: 0 }; x[r.category]++; m.set(c, x); });
    return [...m.values()].sort((a, b) => (b.revenue + b.student_experience) - (a.revenue + a.student_experience));
  }, [view]);
  const money = useMemo(() => rev.filter(r => num(r.budget) !== null || num(r.revenue) !== null)
    .map(r => ({ name: short(r.project_name, compact ? 20 : 34), full: r.project_name, budget: num(r.budget), revenue: num(r.revenue),
      roi: num(r.revenue) !== null && num(r.budget) > 0 ? num(r.revenue) / num(r.budget) : null }))
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || (b.budget || 0) - (a.budget || 0)), [rev, compact]);
  const [hoverSlice, setHoverSlice] = useState(null);

  if (rows === null) return <div style={{ flex: 1, padding: SP.xl, color: T.muted, fontSize: 13 }}>Loading Benefits Realization…</div>;

  // ── pieces ─────────────────────────────────────────────────────────────────
  const card = (tone, icon, title, sub, body, attr) => (
    <Section T={T} tone={tone} pad={compact ? SP.md : SP.lg} {...attr} style={{ minWidth: 0 }}>
      <SectionTitle T={T} icon={icon} title={title} sub={sub} />
      {body}
    </Section>
  );
  const blank = (txt) => <span style={{ color: T.dim, fontStyle: "italic", fontWeight: 400 }}>{txt}</span>;
  const editBtn = (r) => isPMO ? (
    <button onClick={(e) => { e.stopPropagation(); setEdit(r); }} title="Edit" aria-label={`Edit ${r.project_name}`} className="pmo-focusable pmo-btn"
      style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: R.sm, padding: 5, cursor: "pointer", color: T.muted, display: "grid", placeItems: "center" }}>
      <Pencil size={13} />
    </button>
  ) : null;

  // A card opens its description in a window; the card itself stays short.
  const cardProps = (r) => ({ role: "button", tabIndex: 0, onClick: () => setRead(r), "aria-label": `${r.project_name}: open description`,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRead(r); } } });
  const readLink = (r, c) => r.description ? (
    <div data-br-read style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: SP.sm, ...TYPE.caption, fontWeight: 700, color: T.textOf(c), position: "relative" }}>
      <FileText size={12} /> Read description <ChevronRight size={12} />
    </div>
  ) : isPMO ? <div style={{ marginTop: SP.sm, ...TYPE.caption, color: T.dim, fontStyle: "italic", position: "relative" }}>No description yet</div> : null;

  const noData = (msg) => (
    <div style={{ height: 200, display: "grid", placeItems: "center", textAlign: "center", padding: SP.lg, ...TYPE.bodySm, color: T.muted,
      border: `1px dashed ${T.border}`, borderRadius: R.md }}>{msg}</div>
  );
  const hs = hoverSlice != null ? split[hoverSlice] : null;
  const yearWord = fy || "FY 25-26 and FY 26-27";

  return (
    <div className="pmo-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", background: T.page }}>
    <div data-page="benefits" style={{ padding: compact ? SP.md : SP.xl, display: "flex", flexDirection: "column", gap: SP.md }}>
      <style>{`
        @keyframes brRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes brGlow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .br-rise { animation: brRise 620ms cubic-bezier(.2,.7,.2,1) both }
        .br-card { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.fast} }
        .br-card:hover { transform: translateY(-2px); box-shadow: ${T.shadowLg}; }
        @media (prefers-reduced-motion: reduce) { .br-rise, .br-glow { animation: none !important } .br-card:hover { transform: none } }
      `}</style>

      {/* Hero */}
      <div data-br="hero" style={{ position: "relative", overflow: "hidden", borderRadius: R.xl, padding: compact ? SP.lg : `${SP.xl}px ${SP.xl}px`,
        background: `radial-gradient(900px 320px at 100% 0%, ${BRAND.gold}38, transparent 60%), radial-gradient(700px 300px at 0% 100%, ${DATA.violet}40, transparent 60%), linear-gradient(135deg, ${BRAND.navyDeep}, ${BRAND.navy})`,
        boxShadow: T.shadowLg, color: "#fff" }}>
        <svg aria-hidden="true" width="420" height="420" viewBox="0 0 420 420" style={{ position: "absolute", right: -120, top: -150, opacity: 0.35 }}>
          {[200, 160, 120].map((r, i) => <circle key={r} className="br-glow" cx="210" cy="210" r={r} fill="none" stroke={BRAND.gold} strokeOpacity={0.5 - i * 0.12}
            strokeDasharray={i === 1 ? "4 8" : "none"} style={{ animation: `brGlow ${3 + i}s ease-in-out infinite` }} />)}
        </svg>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: SP.md }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, color: BRAND.gold, letterSpacing: 1.4 }}>
              <Sparkles size={13} /> Benefits realization · {yearWord}
            </div>
            <div style={{ ...TYPE.display, fontSize: compact ? 24 : 32, marginTop: 6, lineHeight: 1.15 }}>
              <CountUp value={view.length} ms={900} format={(v) => Math.round(v)} /> completed project{view.length === 1 ? "" : "s"} delivering benefits
            </div>
            <div style={{ ...TYPE.bodySm, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
              {rev.length} for revenue · {se.length} for the student experience{isPMO && waiting.length ? ` · ${waiting.length} more on the list once they close` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
            <Seg T={T} value={fy} set={setFy} items={[["", "Both years"], ...FYS.map(y => [y, y])]} />
            <Seg T={T} value={cat} set={setCat} items={[["", "All"], ["revenue", "Revenue", BRAND.gold], ["student_experience", "Student Experience", DATA.violet]]} />
          </div>
        </div>
        <div style={{ position: "relative", display: compact ? "grid" : "flex", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginTop: SP.lg }}>
          <Kpi T={T} compact={compact} i={0} icon={Sparkles} color={BRAND.gold} label="Projects delivered" value={<CountUp value={view.length} ms={900} format={(v) => Math.round(v)} />} sub={`${rev.length} revenue · ${se.length} student exp.`} />
          <Kpi T={T} compact={compact} i={1} icon={Wallet} color={BRAND.blueBright} label="Budget invested" value={k.withBudget ? <CountUp value={k.budget} format={pkrM} /> : "—"}
            sub={k.withBudget === view.length ? "all budgets entered" : `${k.withBudget} of ${view.length} budgets entered`} />
          <Kpi T={T} compact={compact} i={2} icon={Coins} color={DATA.positive} label="Revenue generated" value={k.withRev ? <CountUp value={k.revenue} format={pkrM} /> : "—"}
            sub={rev.length ? `${k.withRev} of ${rev.length} revenue projects reported` : "no revenue projects in view"} />
          <Kpi T={T} compact={compact} i={3} icon={Percent} color={DATA.cyan} label="Return on budget" value={k.roi !== null ? `${k.roi.toFixed(2)}×` : "—"}
            sub={k.roiN ? `revenue ÷ budget · ${k.roiN} project${k.roiN === 1 ? "" : "s"} with both` : "needs budget and revenue"} />
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

      {view.length === 0 ? (
        <Section T={T}><EmptyState T={T} icon={Sparkles} title="Nothing to show yet"
          message={shown.length ? "No completed project matches these choices." : "None of the listed projects has closed yet. They appear here as they close."} /></Section>
      ) : (<>
        {/* Charts */}
        <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "minmax(0,1fr) minmax(0,1.4fr)" }}>
          {card(BRAND.gold, PieIcon, "Benefit mix", "Completed projects by benefit · hover for the budget",
            <div style={{ position: "relative", height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>{split.map((s, i) => (
                    <linearGradient key={i} id={`brSl${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={1} /><stop offset="100%" stopColor={s.color} stopOpacity={0.6} />
                    </linearGradient>))}</defs>
                  <Pie data={split} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="86%" paddingAngle={split.length > 1 ? 3 : 0}
                    cornerRadius={6} stroke="none" startAngle={90} endAngle={-270} {...A(150, 1300)} activeIndex={hoverSlice ?? undefined}
                    activeShape={(p) => <g><Sector {...p} outerRadius={p.outerRadius + 7} /><Sector {...p} innerRadius={p.outerRadius + 11} outerRadius={p.outerRadius + 14} opacity={0.45} /></g>}
                    onMouseEnter={(_, i) => setHoverSlice(i)} onMouseLeave={() => setHoverSlice(null)} onClick={(d) => setCat(c => c === d?.payload?.key ? "" : d?.payload?.key)}>
                    {split.map((s, i) => <Cell key={i} fill={`url(#brSl${i})`} style={{ cursor: "pointer", outline: "none", opacity: hoverSlice != null && hoverSlice !== i ? 0.35 : 1, transition: "opacity 220ms" }} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: "0 24%" }}>
                <div style={{ ...TYPE.metric, fontSize: 26, color: hs ? T.textOf(hs.color) : T.text }}>{hs ? hs.value : view.length}</div>
                <div style={{ ...TYPE.label, color: T.muted, marginTop: 3 }}>{hs ? hs.name : "projects"}</div>
                <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2 }}>{hs ? (hs.budget ? `budget ${pkrM(hs.budget)}` : "budget not entered") : `${Math.round(100 * rev.length / (view.length || 1))}% revenue`}</div>
              </div>
            </div>, { "data-chart": "mix" })}

          {card(BRAND.blueBright, BarChart3, "Revenue against budget", "Each revenue project: budget invested and revenue generated",
            money.length ? (
              <div style={{ height: Math.max(220, money.length * 44 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={money} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={8} barGap={2} maxBarSize={18}>
                    <defs>
                      <linearGradient id="brBud" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={BRAND.blueBright} stopOpacity={0.55} /><stop offset="100%" stopColor={BRAND.blueBright} /></linearGradient>
                      <linearGradient id="brRev" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={DATA.positive} stopOpacity={0.55} /><stop offset="100%" stopColor={DATA.positive} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke={T.border} horizontal={false} />
                    <XAxis type="number" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={fmtM} />
                    <YAxis type="category" dataKey="name" tick={{ ...axis(T), fontSize: 11, fill: T.textSoft }} tickLine={false} axisLine={false} width={compact ? 110 : 200} />
                    <Tooltip cursor={{ fill: T.rowHover }} content={(p) => {
                      const d = p.payload?.[0]?.payload;
                      return <Tip {...p} T={T} label={d?.full || p.label} foot={d ? (d.roi !== null ? `Return ${d.roi.toFixed(2)}× the budget` : "Add budget and revenue for the return") : null} />;
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: TYPE.body.fontFamily }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                    <Bar dataKey="budget" name="Budget" fill="url(#brBud)" radius={[0, 5, 5, 0]} {...A(200, 900)} />
                    <Bar dataKey="revenue" name="Revenue" fill="url(#brRev)" radius={[0, 5, 5, 0]} {...A(600, 900)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : noData(rev.length ? (isPMO ? "Add the budget and revenue of the revenue projects (pencil on each card below) and this chart fills in." : "Budget and revenue figures are being added by the PMO.")
                                  : "No revenue project in this view."), { "data-chart": "money" })}

          {card(DATA.violet, Building2, "Where the benefits are", "Completed projects by campus / site and benefit",
            <div style={{ height: Math.max(200, byCampus.length * 34 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCampus} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={7} maxBarSize={22}>
                  <CartesianGrid stroke={T.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis type="category" dataKey="name" tick={{ ...axis(T), fontSize: 11, fill: T.textSoft }} tickLine={false} axisLine={false} width={compact ? 70 : 96} />
                  <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <Tip {...p} T={T} fmtV={(v) => `${v} project${v === 1 ? "" : "s"}`} />} />
                  <Bar dataKey="revenue" name="Revenue" stackId="c" fill={BRAND.gold} {...A(200, 900)} />
                  <Bar dataKey="student_experience" name="Student Experience" stackId="c" fill={DATA.violet} radius={[0, 5, 5, 0]} {...A(600, 900)} />
                </BarChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "campus" })}

          {card(DATA.cyan, CalendarRange, "FY 25-26 and FY 26-27", "Completed projects per year by benefit · FY 26-27 grows as projects close",
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFy} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barCategoryGap="32%" maxBarSize={90}>
                  <CartesianGrid stroke={T.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ ...axis(T), fontSize: 11.5, fill: T.textSoft }} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: T.rowHover }} content={(p) => {
                    const d = p.payload?.[0]?.payload;
                    return <Tip {...p} T={T} fmtV={(v) => `${v} project${v === 1 ? "" : "s"}`} foot={d ? (d.budget ? `Budget ${pkrM(d.budget)}` : "Budgets not entered") : null} />;
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: TYPE.body.fontFamily }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                  {(!cat || cat === "revenue") && <Bar dataKey="revenue" name="Revenue" stackId="f" fill={BRAND.gold} {...A(200, 900)} radius={cat === "revenue" ? [6, 6, 0, 0] : 0} />}
                  {(!cat || cat === "student_experience") && <Bar dataKey="student_experience" name="Student Experience" stackId="f" fill={DATA.violet} radius={[6, 6, 0, 0]} {...A(600, 900)} />}
                </BarChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "years" })}
        </div>

        {/* Revenue projects */}
        {rev.length > 0 && (
          <Section T={T} tone={BRAND.gold} pad={compact ? SP.md : SP.lg} data-br="revenue">
            <SectionTitle T={T} icon={TrendingUp} title={`Revenue · ${rev.length} project${rev.length === 1 ? "" : "s"}`}
              sub="Projects that bring income: budget invested, revenue generated so far and the return"
              right={isPMO ? <Button T={T} size="sm" icon={Plus} onClick={() => setEdit({ category: "revenue", fiscal_year: fy || "FY 25-26" })}>Add</Button> : null} />
            <div style={{ display: "grid", gap: SP.sm, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))" }}>
              {rev.map((r, i) => {
                const b = num(r.budget), v = num(r.revenue), roi = v !== null && b > 0 ? v / b : null;
                return (
                  <div key={r.id} data-br-card={r.project_code} className="br-card br-rise pmo-focusable" {...cardProps(r)} style={{ animationDelay: `${Math.min(i, 10) * 50}ms`, cursor: "pointer",
                    padding: SP.md, borderRadius: R.lg, background: T.surface, border: `1px solid ${T.border}`, borderTop: `3px solid ${BRAND.gold}`, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: SP.sm, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...TYPE.h3, fontSize: 14, color: T.text, lineHeight: 1.3 }}>{r.project_name}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                          <span style={{ ...TYPE.caption, color: T.dim, fontFamily: "ui-monospace,Consolas,monospace" }}>{r.project_code}</span>
                          <Pill T={T} c={BRAND.blueBright}>{r.fiscal_year}</Pill>{r.campus && <Pill T={T} c={DATA.neutral}>{r.campus}</Pill>}
                        </div>
                      </div>
                      {editBtn(r)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: SP.sm, marginTop: SP.md }}>
                      {[["Budget", b !== null ? pkrM(b) : blank("not entered"), BRAND.blueBright],
                        ["Revenue", v !== null ? pkrM(v) : blank("not reported"), DATA.positive],
                        ["Return", roi !== null ? `${roi.toFixed(2)}×` : blank("—"), DATA.cyan]].map(([l, val, c]) => (
                        <div key={l} style={{ padding: "8px 10px", borderRadius: R.md, background: `${c}12`, border: `1px solid ${c}33`, minWidth: 0 }}>
                          <div style={{ ...TYPE.label, fontSize: 9, color: T.dim }}>{l}</div>
                          <div style={{ ...TYPE.h3, fontSize: 14.5, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {roi !== null && (
                      <div title={`Revenue is ${Math.round(roi * 100)}% of the budget`} style={{ height: 6, borderRadius: 6, background: T.rowHover, marginTop: SP.sm, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, roi * 100)}%`, borderRadius: 6,
                          background: `linear-gradient(90deg, ${DATA.positive}88, ${DATA.positive})`, transition: "width 900ms ease-out" }} />
                      </div>
                    )}
                    {v !== null && r.revenue_as_of && <div style={{ ...TYPE.caption, color: T.dim, marginTop: 6 }}>Revenue as of {fmtDay(r.revenue_as_of)}</div>}
                    {readLink(r, BRAND.gold)}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Student Experience projects */}
        {se.length > 0 && (
          <Section T={T} tone={DATA.violet} pad={compact ? SP.md : SP.lg} data-br="student">
            <SectionTitle T={T} icon={GraduationCap} title={`Student Experience · ${se.length} project${se.length === 1 ? "" : "s"}`}
              sub="Projects that improve campus life and learning"
              right={isPMO ? <Button T={T} size="sm" icon={Plus} onClick={() => setEdit({ category: "student_experience", fiscal_year: fy || "FY 25-26" })}>Add</Button> : null} />
            <div style={{ display: "grid", gap: SP.sm, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {se.map((r, i) => {
                const b = num(r.budget);
                return (
                  <div key={r.id} data-br-card={r.project_code} className="br-card br-rise pmo-focusable" {...cardProps(r)} style={{ animationDelay: `${Math.min(i, 10) * 50}ms`, position: "relative", overflow: "hidden", cursor: "pointer",
                    padding: SP.md, borderRadius: R.lg, minWidth: 0, border: `1px solid ${DATA.violet}40`,
                    background: `linear-gradient(160deg, ${DATA.violet}1c, ${T.surface} 55%)` }}>
                    <GraduationCap aria-hidden="true" size={84} color={DATA.violet} style={{ position: "absolute", right: -14, bottom: -18, opacity: 0.09 }} />
                    <div style={{ display: "flex", gap: SP.sm, alignItems: "flex-start", position: "relative" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...TYPE.h3, fontSize: 14, color: T.text, lineHeight: 1.3 }}>{r.project_name}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                          <span style={{ ...TYPE.caption, color: T.dim, fontFamily: "ui-monospace,Consolas,monospace" }}>{r.project_code}</span>
                          <Pill T={T} c={BRAND.blueBright}>{r.fiscal_year}</Pill>{r.campus && <Pill T={T} c={DATA.neutral}>{r.campus}</Pill>}
                        </div>
                      </div>
                      {editBtn(r)}
                    </div>
                    <div style={{ marginTop: SP.md, ...TYPE.caption, color: T.muted, position: "relative" }}>
                      Budget <b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{b !== null ? `PKR ${fmt(b)}` : blank("not entered")}</b>
                    </div>
                    {readLink(r, DATA.violet)}
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </>)}

      {/* PMO only: waiting and removed */}
      {isPMO && (
        <Section T={T} tone={DATA.warning} pad={compact ? SP.md : SP.lg} data-br="waiting">
          <button onClick={() => setShowWaiting(s => !s)} className="pmo-focusable pmo-btn"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: SP.sm, background: "none", border: "none", cursor: "pointer", padding: 0, color: T.text, textAlign: "left" }}>
            {showWaiting ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Hourglass size={15} color={T.textOf(DATA.warning)} />
            <span style={{ ...TYPE.h3 }}>Waiting to close · {waiting.length}</span>
            <span style={{ ...TYPE.caption, color: T.muted }}>PMO only · listed projects that appear above once they are finished</span>
          </button>
          {showWaiting && (
            <div style={{ marginTop: SP.md, display: "flex", flexDirection: "column", gap: 6 }}>
              {waiting.length === 0 && <div style={{ ...TYPE.bodySm, color: T.muted }}>Every listed project is shown above.</div>}
              {waiting.map(r => (
                <div key={r.id} data-br-wait={r.project_code} style={{ display: "flex", alignItems: "center", gap: SP.sm, flexWrap: compact ? "wrap" : "nowrap",
                  padding: "8px 10px", borderRadius: R.md, background: T.surface, border: `1px solid ${T.border}` }}>
                  <Pill T={T} c={CAT[r.category].color}>{CAT[r.category].short}</Pill>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TYPE.bodySm, color: T.text, fontWeight: 600 }}>{r.project_name}</div>
                    <div style={{ ...TYPE.caption, color: T.dim }}>{r.project_code} · {r.fiscal_year}{r.campus ? ` · ${r.campus}` : ""}</div>
                  </div>
                  <span style={{ ...TYPE.caption, color: T.textOf(DATA.warning), fontWeight: 700 }}>{reason(r.status)}</span>
                  {editBtn(r)}
                </div>
              ))}
              {removed.length > 0 && (
                <div style={{ marginTop: SP.sm }}>
                  <button onClick={() => setShowRemoved(s => !s)} className="pmo-focusable pmo-btn"
                    style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, ...TYPE.caption, padding: 0 }}>
                    {showRemoved ? "Hide" : "Show"} removed entries ({removed.length})
                  </button>
                  {showRemoved && removed.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: "6px 10px", marginTop: 6, borderRadius: R.md, border: `1px dashed ${T.border}` }}>
                      <span style={{ flex: 1, ...TYPE.caption, color: T.muted, textDecoration: "line-through" }}>{r.project_name} · {r.fiscal_year} · {CAT[r.category].label}</span>
                      <Button T={T} size="sm" icon={RotateCcw} onClick={async () => {
                        try { await supa(`/rest/v1/benefit_realization?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ removed: false }) }, session.access_token); load(); }
                        catch { setErr("Could not restore the entry. Check the connection and try again."); }
                      }}>Restore</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {read && <ReadBenefit T={T} compact={compact} row={read} isPMO={isPMO} onClose={() => setRead(null)}
        onEdit={() => { setEdit(read); setRead(null); }} />}
      {edit && <EditBenefit T={T} compact={compact} row={edit} supa={supa} session={session}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
    </div>
  );
}

// ─── Read one entry (everyone who sees the page) ─────────────────────────────
function ReadBenefit({ T, compact, row: r, isPMO, onClose, onEdit }) {
  const isRev = r.category === "revenue";
  const c = isRev ? BRAND.gold : DATA.violet;
  const b = num(r.budget), v = num(r.revenue), roi = v !== null && b > 0 ? v / b : null;
  const tiles = isRev
    ? [["Budget", b !== null ? `PKR ${fmt(b)}` : "Not entered"], ["Revenue", v !== null ? `PKR ${fmt(v)}` : "Not reported"], ["Return", roi !== null ? `${roi.toFixed(2)}×` : "—"]]
    : [["Budget", b !== null ? `PKR ${fmt(b)}` : "Not entered"]];
  return (
    <Modal T={T} isMobile={compact} onClose={onClose} icon={isRev ? Coins : GraduationCap} width={640}
      title={r.project_name} sub={[r.project_code, r.fiscal_year, r.campus, CAT[r.category].label].filter(Boolean).join(" · ")}
      footer={<div style={{ display: "flex", gap: SP.sm, justifyContent: "flex-end", width: "100%" }}>
        {isPMO && <Button T={T} icon={Pencil} onClick={onEdit}>Edit</Button>}
        <Button T={T} variant="primary" onClick={onClose}>Close</Button>
      </div>}>
      <div data-br-reading>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, minmax(0,1fr))`, gap: SP.sm }}>
          {tiles.map(([l, val]) => (
            <div key={l} style={{ padding: "8px 12px", borderRadius: R.md, background: `${c}12`, border: `1px solid ${c}33`, minWidth: 0 }}>
              <div style={{ ...TYPE.label, fontSize: 9, color: T.dim }}>{l}</div>
              <div style={{ ...TYPE.h3, fontSize: 15, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{val}</div>
            </div>
          ))}
        </div>
        {isRev && v !== null && r.revenue_as_of && <div style={{ ...TYPE.caption, color: T.dim, marginTop: 6 }}>Revenue as of {fmtDay(r.revenue_as_of)}</div>}
        <div style={{ ...TYPE.label, fontSize: 9.5, color: T.dim, marginTop: SP.lg }}>{isRev ? "How it generates revenue" : "How students benefit"}</div>
        <div style={{ ...TYPE.body, fontSize: 14, lineHeight: 1.6, color: r.description ? T.text : T.dim, fontStyle: r.description ? "normal" : "italic",
          whiteSpace: "pre-wrap", marginTop: 6 }}>{r.description || "No description yet."}</div>
      </div>
    </Modal>
  );
}

// ─── Edit / add (PMO) ─────────────────────────────────────────────────────────
function EditBenefit({ T, compact, row, supa, session, onClose, onSaved }) {
  const isNew = !row.id;
  const [f, setF] = useState(() => ({
    project_name: row.project_name || "", project_code: row.project_code || "", campus: row.campus || "",
    fiscal_year: row.fiscal_year || "FY 25-26", category: row.category || "revenue",
    budget: row.budget ?? "", revenue: row.revenue ?? "", revenue_as_of: row.revenue_as_of || "", description: row.description || "",
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const money = (s) => { const t = String(s ?? "").replace(/[,\s]/g, ""); return t === "" ? null : Number(t); };
  const isRev = f.category === "revenue";

  const save = async () => {
    const budget = money(f.budget), revenue = isRev ? money(f.revenue) : null;
    if (!f.project_name.trim() || !f.project_code.trim()) return setMsg("Project name and ID are needed.");
    if ((budget !== null && !(budget >= 0)) || (revenue !== null && !(revenue >= 0))) return setMsg("Budget and revenue must be amounts in rupees (numbers only).");
    const body = {
      project_name: f.project_name.trim(), project_code: f.project_code.trim().toUpperCase(), campus: f.campus.trim() || null,
      fiscal_year: f.fiscal_year, category: f.category, budget, revenue,
      revenue_as_of: isRev && revenue !== null ? (f.revenue_as_of || null) : null, description: f.description.trim() || null,
    };
    setBusy(true); setMsg(null);
    try {
      const r = await supa(isNew ? `/rest/v1/benefit_realization?select=id` : `/rest/v1/benefit_realization?id=eq.${row.id}&select=id`,
        { method: isNew ? "POST" : "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }, session.access_token);
      if (!Array.isArray(r) || !r[0]?.id) throw new Error("not saved");
      onSaved();
    } catch (e) {
      setBusy(false);
      setMsg(/duplicate|unique|23505/i.test(String(e?.message)) ? "This project is already on the list for that year and benefit."
        : "Could not save. Check the connection and try again.");
    }
  };
  const remove = async () => {
    setBusy(true);
    try { await supa(`/rest/v1/benefit_realization?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ removed: true }) }, session.access_token); onSaved(); }
    catch { setBusy(false); setMsg("Could not remove. Check the connection and try again."); }
  };

  const box = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.surface,
    color: T.text, fontSize: 13, fontFamily: TYPE.body.fontFamily, outline: "none" };

  return (
    <Modal T={T} isMobile={compact} onClose={busy ? undefined : onClose} icon={isRev ? Coins : GraduationCap} width={600}
      title={isNew ? "Add a benefit entry" : "Edit benefit entry"} sub={isNew ? "Benefits Realization" : row.project_name}
      footer={
        <div style={{ display: "flex", gap: SP.sm, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
          {!isNew && <Button T={T} variant="danger" size="sm" icon={Trash2} onClick={remove} disabled={busy}>Remove</Button>}
          <span style={{ flex: 1, ...TYPE.caption, color: T.textOf(DATA.danger) }}>{msg}</span>
          <Button T={T} onClick={onClose} disabled={busy}>Cancel</Button>
          <Button T={T} variant="primary" onClick={save} loading={busy}>{isNew ? "Add" : "Save"}</Button>
        </div>
      }>
      <div data-br-edit style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: SP.md }}>
        <L T={T} label="Benefit">
          <select value={f.category} onChange={e => set("category", e.target.value)} style={box} aria-label="Benefit">
            <option value="revenue">Revenue</option><option value="student_experience">Student Experience</option>
          </select>
        </L>
        <L T={T} label="Fiscal year">
          <select value={f.fiscal_year} onChange={e => set("fiscal_year", e.target.value)} style={box} aria-label="Fiscal year">
            {FYS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </L>
        <L T={T} label="Project name" wide><input value={f.project_name} onChange={e => set("project_name", e.target.value)} style={box} /></L>
        <L T={T} label="Project ID" hint={isNew ? "Shown once this project is finished (FY 26-27: Closed; FY 25-26: not open on Past Projects)." : null}>
          <input value={f.project_code} onChange={e => set("project_code", e.target.value)} style={{ ...box, fontFamily: "ui-monospace,Consolas,monospace" }} placeholder="IT.271107-01" />
        </L>
        <L T={T} label="Campus / site"><input value={f.campus} onChange={e => set("campus", e.target.value)} style={box} /></L>
        <L T={T} label="Project budget (PKR)" hint={money(f.budget) ? `PKR ${fmt(money(f.budget))}` : null}>
          <input inputMode="numeric" value={f.budget} onChange={e => set("budget", e.target.value)} style={box} placeholder="e.g. 7,086,831" />
        </L>
        {isRev ? <>
          <L T={T} label="Revenue generated (PKR)" hint={money(f.revenue) ? `PKR ${fmt(money(f.revenue))}` : null}>
            <input inputMode="numeric" value={f.revenue} onChange={e => set("revenue", e.target.value)} style={box} placeholder="e.g. 5,000,000" />
          </L>
          <L T={T} label="Revenue as of"><input type="date" value={f.revenue_as_of} onChange={e => set("revenue_as_of", e.target.value)} style={box} /></L>
        </> : <div />}
        <L T={T} label={isRev ? "How it generates revenue" : "How students benefit"} wide>
          <textarea value={f.description} onChange={e => set("description", e.target.value)} rows={5} style={{ ...box, resize: "vertical", lineHeight: 1.45 }}
            placeholder={isRev ? "e.g. New MS programme: 40 students enrolled in the first intake…" : "e.g. 600 students now use the upgraded lab every week…"} />
        </L>
      </div>
    </Modal>
  );
}
