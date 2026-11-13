import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Trophy, PiggyBank, Workflow, Medal, Cpu, Sparkles, Plus, Pencil, Trash2, Search, CalendarCheck, Coins, Users,
  BarChart3, PieChart as PieIcon, Milestone, Star, FolderOpen, X,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Input, Modal, Section, SectionTitle, EmptyState, useViewport } from "./ui.jsx";
import { EnhanceAI } from "./EnhanceAI.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PMO ACHIEVEMENTS (PMO, 12 Nov 2026): the first view of the Achievements/Goals
   tab. PMO only (nav + RLS on pmo_achievements). The PMO adds what the office
   achieved: title, Achieved on (a date the PMO picks), details, category,
   credit (whole team or one member), optional project and value in PKR.
   Click a card → "Achieved on <date>" with the full details. Added by/on is
   stamped by the server; Delete = removed (kept for the Activity Log).
   ═══════════════════════════════════════════════════════════════════════════ */

export const CATS = {
  delivery:    { label: "Delivery",    icon: Trophy,    color: BRAND.gold },
  savings:     { label: "Savings",     icon: PiggyBank, color: DATA.positive },
  process:     { label: "Process",     icon: Workflow,  color: BRAND.blueBright },
  recognition: { label: "Recognition", icon: Medal,     color: DATA.violet },
  digital:     { label: "Digital",     icon: Cpu,       color: DATA.cyan },
  other:       { label: "Other",       icon: Sparkles,  color: DATA.neutral },
};
const CREDITS = [
  { key: "team", fallback: "Whole PMO team" },
  { key: "manager_pmo", fallback: "Mr. Owais Javed" },
  { key: "exec_pmo", fallback: "Engr. Usman Ahmed Umar" },
  { key: "po1", fallback: "Mr. Abdullah Azhar" },
  { key: "po2", fallback: "Mr. Atisham ul Haq" },
];
const MONTHS = "Jul Aug Sep Oct Nov Dec Jan Feb Mar Apr May Jun".split(" ");

const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (n) => Number(n || 0).toLocaleString("en", { maximumFractionDigits: 0 });
const fmtM = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : fmt(v); };
const fmtDay = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtLong = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
const fmtStamp = (s) => s ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
// Fiscal year of a date: July to June ("FY 26-27").
const fyOf = (s) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00"); const y = d.getFullYear() % 100, a = d.getMonth() >= 6 ? y : y - 1; return `FY ${String(a).padStart(2, "0")}-${String(a + 1).padStart(2, "0")}`; };
const todayPkt = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const axis = (T) => ({ fontSize: 10.5, fontFamily: TYPE.body.fontFamily, fill: T.dim });

function useCount(target, ms = 1000) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); return; }
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); setV(a + (target - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
function CountUp({ value, format = (v) => Math.round(v) }) { return format(useCount(value)); }

function Kpi({ compact, icon: Icon, label, value, sub, color, i }) {
  return (
    <div className="pmo-lift pa-rise" style={{ animationDelay: `${i * 90}ms`, minWidth: 0, padding: compact ? "12px 14px" : "18px 20px", borderRadius: R.lg,
      background: `linear-gradient(160deg, ${color}2b, rgba(255,255,255,0.05) 55%)`, border: "1px solid rgba(255,255,255,0.14)", boxShadow: `inset 3px 0 0 ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, fontSize: 10, color: "rgba(255,255,255,0.78)" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: `${color}38` }}><Icon size={14} color={color} /></span>{label}
      </div>
      <div style={{ ...TYPE.display, fontSize: compact ? 24 : 34, color: "#fff", marginTop: compact ? 6 : 10, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Seg({ value, set, items }) {
  return (
    <div role="tablist" style={{ display: "inline-flex", flexWrap: "wrap", padding: 3, gap: 2, borderRadius: R.pill, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
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

function Tip({ T, active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value);
  if (!rows.length) return null;
  return (
    <div style={{ background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${T.borderStrong}`,
      borderRadius: R.md, padding: `${SP.sm}px ${SP.md}px`, boxShadow: T.shadowLg, minWidth: 150 }}>
      {label && <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6 }}>{label}</div>}
      {rows.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: SP.lg, marginTop: i ? 4 : 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.caption, color: T.textSoft }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.payload?.color || p.color }} />{p.name}
          </span>
          <span style={{ ...TYPE.caption, color: T.text, fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Chip({ T, c, children, icon: Icon }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: R.pill, whiteSpace: "nowrap",
      background: `${c}1f`, border: `1px solid ${c}55`, color: T.textOf(c), ...TYPE.caption, fontSize: 10.5, fontWeight: 700 }}>
      {Icon && <Icon size={10} />}{children}</span>
  );
}

export function PmoAchievementsView({ T, session, supa, onOpenProject, onOpenPast }) {
  const vp = useViewport();
  const compact = vp.isCompact;
  const tok = session.access_token;
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState({});
  const [projects, setProjects] = useState([]);
  const [past, setPast] = useState([]);
  const [people, setPeople] = useState({});
  const [err, setErr] = useState(null);
  const [fy, setFy] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);       // achievement being read
  const [edit, setEdit] = useState(null);       // achievement being edited, or {} for new
  const [confirmDel, setConfirmDel] = useState(null);
  const [hoverDot, setHoverDot] = useState(null);
  const [anim, setAnim] = useState(() => !reduced());
  useEffect(() => { const t = setTimeout(() => setAnim(false), 1600); return () => clearTimeout(t); }, []);
  const A = (begin, dur) => ({ isAnimationActive: anim, animationBegin: begin, animationDuration: dur, animationEasing: "ease-out" });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, s, p, pp, u] = await Promise.all([
        supa("/rest/v1/pmo_achievements?removed=eq.false&select=*&order=achieved_on.desc,created_at.desc", {}, tok),
        supa("/rest/v1/settings?key=eq.team_config&select=value", {}, tok).catch(() => []),
        supa("/rest/v1/projects?select=id,code,name,campus&order=name.asc", {}, tok).catch(() => []),
        supa("/rest/v1/past_projects?select=id,code,name,fiscal_year&order=name.asc", {}, tok).catch(() => []),
        supa("/rest/v1/user_profiles?select=id,full_name,username", {}, tok).catch(() => []),
      ]);
      setRows(Array.isArray(a) ? a : []);
      setCfg((Array.isArray(s) && s[0]?.value) || {});
      setProjects(Array.isArray(p) ? p : []);
      setPast(Array.isArray(pp) ? pp : []);
      setPeople(Object.fromEntries((Array.isArray(u) ? u : []).map(x => [x.id, (x.full_name || x.username || "").trim()])));
    } catch (e) { setErr(e.message || "Could not load the achievements."); setRows([]); }
  }, [supa, tok]);
  useEffect(() => { load(); }, [load]);

  const creditName = useCallback((k) => k === "team" ? "Whole PMO team" : (cfg[k]?.name || CREDITS.find(c => c.key === k)?.fallback || k).trim(), [cfg]);
  const projById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const pastById = useMemo(() => Object.fromEntries(past.map(p => [p.id, p])), [past]);
  const projOf = (a) => a.project_id ? projById[a.project_id] : a.past_project_id ? pastById[a.past_project_id] : null;

  const all = rows || [];
  const today = todayPkt(), thisFy = fyOf(today);
  const fys = useMemo(() => [...new Set([thisFy, ...all.map(a => fyOf(a.achieved_on))])].sort().reverse(), [all, thisFy]);
  const view = all.filter(a => (!fy || fyOf(a.achieved_on) === fy) && (!cat || a.category === cat) && (() => {
    const s = q.trim().toLowerCase(); if (!s) return true;
    const p = projOf(a);
    return [a.title, a.details, p?.name, p?.code, creditName(a.credit), CATS[a.category]?.label].some(x => String(x || "").toLowerCase().includes(s));
  })());

  const k = useMemo(() => ({
    total: view.length,
    fy: all.filter(a => fyOf(a.achieved_on) === thisFy).length,
    month: all.filter(a => a.achieved_on.slice(0, 7) === today.slice(0, 7)).length,
    value: view.reduce((s, a) => s + (num(a.value_pkr) || 0), 0),
    valued: view.filter(a => num(a.value_pkr)).length,
  }), [view, all, thisFy, today]);

  // Per month of the chosen FY (or the current FY), stacked by category.
  const chartFy = fy || thisFy;
  const byMonth = useMemo(() => {
    const a0 = 2000 + Number(chartFy.slice(3, 5));
    return MONTHS.map((m, i) => {
      const y = i < 6 ? a0 : a0 + 1, mm = String(((i + 6) % 12) + 1).padStart(2, "0");
      const row = { name: m, key: `${y}-${mm}` };
      Object.keys(CATS).forEach(c => { row[c] = view.filter(a => a.achieved_on.slice(0, 7) === `${y}-${mm}` && a.category === c).length; });
      return row;
    });
  }, [view, chartFy]);
  const byCat = useMemo(() => Object.entries(CATS).map(([key, c]) => ({ key, name: c.label, value: view.filter(a => a.category === key).length, color: c.color })).filter(x => x.value), [view]);
  const byCredit = useMemo(() => CREDITS.map(c => ({ name: creditName(c.key).replace(/^(Mr|Engr)\.?\s+/i, ""), value: view.filter(a => a.credit === c.key).length,
    color: c.key === "team" ? BRAND.gold : c.key === "manager_pmo" ? "#F08A5D" : c.key === "exec_pmo" ? DATA.positive : c.key === "po1" ? DATA.violet : DATA.cyan })), [view, creditName]);
  // Timeline: dots across the chosen FY (Jul 1 to Jun 30).
  const tl = useMemo(() => {
    const a0 = 2000 + Number(chartFy.slice(3, 5));
    const start = new Date(`${a0}-07-01T00:00:00`), end = new Date(`${a0 + 1}-06-30T00:00:00`), span = end - start;
    const dots = view.filter(a => fyOf(a.achieved_on) === chartFy).map(a => ({ a, x: Math.max(0, Math.min(1, (new Date(a.achieved_on + "T00:00:00") - start) / span)) }))
      .sort((p, q2) => p.x - q2.x);
    const nowX = Math.max(0, Math.min(1, (new Date(today + "T00:00:00") - start) / span));
    return { dots, nowX, isCurrent: chartFy === thisFy };
  }, [view, chartFy, today, thisFy]);

  const remove = async (a) => {
    try {
      await supa(`/rest/v1/pmo_achievements?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ removed: true }) }, tok);
      setRows(rs => rs.filter(x => x.id !== a.id)); setOpen(null);
    } catch { setErr("Could not delete. Check the connection and try again."); }
  };

  if (rows === null) return <div style={{ flex: 1, padding: SP.xl, color: T.muted, fontSize: 13 }}>Loading achievements…</div>;
  const card = (tone, icon, title, sub, body, attr, extra) => (
    <Section T={T} tone={tone} pad={compact ? SP.md : SP.lg} {...attr} style={{ minWidth: 0, ...extra }}>
      <SectionTitle T={T} icon={icon} title={title} sub={sub} />{body}
    </Section>
  );
  const CH = 240;

  return (
    <div className="pmo-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", background: T.page }}>
    <div data-page="pmo-achievements" style={{ padding: compact ? SP.md : SP.xl, paddingTop: compact ? SP.sm : SP.md, display: "flex", flexDirection: "column", gap: SP.md }}>
      <style>{`
        @keyframes paRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes paGlow { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        @keyframes paShine { 0% { transform: translateX(-120%) } 60%,100% { transform: translateX(220%) } }
        @keyframes paPulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.35); opacity: .35 } }
        .pa-rise { animation: paRise 600ms cubic-bezier(.2,.7,.2,1) both }
        .pa-card { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.fast} }
        .pa-card:hover { transform: translateY(-3px); box-shadow: ${T.shadowLg}; }
        .pa-card:hover .pa-shine { animation: paShine 1.1s ease-out 1 }
        .pa-dot { transition: transform ${MOTION.fast} } .pa-dot:hover { transform: translate(-50%, -50%) scale(1.35) !important }
        @media (prefers-reduced-motion: reduce) { .pa-rise, .pa-glow, .pa-pulse { animation: none !important } .pa-card:hover { transform: none } .pa-card:hover .pa-shine { animation: none } }
      `}</style>

      {/* Hero */}
      <div data-pa="hero" style={{ position: "relative", overflow: "hidden", borderRadius: R.xl, padding: compact ? SP.lg : SP.xl, color: "#fff", boxShadow: T.shadowLg,
        background: `radial-gradient(900px 340px at 100% 0%, ${BRAND.gold}4d, transparent 60%), radial-gradient(700px 300px at 0% 100%, ${DATA.violet}38, transparent 60%), linear-gradient(135deg, ${BRAND.navyDeep}, ${BRAND.navy})` }}>
        <svg aria-hidden="true" width="440" height="440" viewBox="0 0 440 440" style={{ position: "absolute", right: -110, top: -150, opacity: 0.4 }}>
          {[210, 170, 130].map((r, i) => <circle key={r} className="pa-glow" cx="220" cy="220" r={r} fill="none" stroke={BRAND.gold} strokeOpacity={0.5 - i * 0.12}
            strokeDasharray={i === 1 ? "4 8" : "none"} style={{ animation: `paGlow ${3 + i}s ease-in-out infinite` }} />)}
        </svg>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: SP.md }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, color: BRAND.gold, letterSpacing: 1.4 }}><Trophy size={13} /> PMO Achievements · {fy || "all years"}</div>
            <div style={{ ...TYPE.display, fontSize: compact ? 24 : 32, marginTop: 6, lineHeight: 1.15 }}>
              <CountUp value={k.total} /> achievement{k.total === 1 ? "" : "s"} by the PMO
            </div>
            <div style={{ ...TYPE.bodySm, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
              {byCat.length ? byCat.map(c => `${c.value} ${c.name.toLowerCase()}`).join(" · ") : "Add what the office has achieved; the charts fill in as you go."}
            </div>
          </div>
          <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", alignItems: "center" }}>
            <Button T={T} variant="primary" icon={Plus} onClick={() => setEdit({})} data-add-achievement>Add achievement</Button>
          </div>
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: compact ? SP.sm : SP.md, marginTop: SP.lg }}>
          <Kpi compact={compact} i={0} icon={Trophy} color={BRAND.gold} label="Achievements" value={<CountUp value={k.total} />} sub={fy || cat || q ? "in this view" : "all years"} />
          <Kpi compact={compact} i={1} icon={Star} color={DATA.violet} label={`This fiscal year`} value={<CountUp value={k.fy} />} sub={thisFy} />
          <Kpi compact={compact} i={2} icon={CalendarCheck} color={DATA.positive} label="This month" value={<CountUp value={k.month} />}
            sub={new Date(today + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })} />
          <Kpi compact={compact} i={3} icon={Coins} color={DATA.cyan} label="Value delivered" value={k.value ? <CountUp value={k.value} format={(v) => `PKR ${fmtM(v)}`} /> : "—"}
            sub={k.valued ? `from ${k.valued} achievement${k.valued === 1 ? "" : "s"} with a value` : "add a value to an achievement"} />
        </div>
        <div style={{ position: "relative", display: "flex", gap: SP.sm, flexWrap: "wrap", alignItems: "center", marginTop: SP.md }}>
          <Seg value={fy} set={setFy} items={[["", "All years"], ...fys.map(y => [y, y])]} />
          <Seg value={cat} set={setCat} items={[["", "All"], ...Object.entries(CATS).map(([key, c]) => [key, c.label, c.color])]} />
          <div style={{ flex: compact ? "1 1 100%" : "0 1 280px", marginLeft: compact ? 0 : "auto" }}>
            <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search achievements…" full />
          </div>
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

      {all.length === 0 ? (
        <Section T={T}><EmptyState T={T} icon={Trophy} title="No achievements yet"
          message="Add the first thing the PMO has achieved. Each one keeps its date and details, and the charts build up as you add more."
          action={<Button T={T} variant="primary" icon={Plus} onClick={() => setEdit({})}>Add achievement</Button>} /></Section>
      ) : (<>
        {/* Timeline ribbon */}
        {card(BRAND.gold, Milestone, `Milestones · ${chartFy}`, tl.dots.length ? "Each dot is an achievement on its date · hover to read, click to open" : "No achievements in this fiscal year yet",
          <div data-chart="timeline" style={{ position: "relative", height: 92, margin: "4px 8px 0" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 44, height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${BRAND.gold}55, ${DATA.violet}55, ${DATA.cyan}55)` }} />
            {tl.isCurrent && (
              <div style={{ position: "absolute", left: `${tl.nowX * 100}%`, top: 30, bottom: 18, width: 2, background: T.textOf(DATA.danger), opacity: 0.6, transform: "translateX(-1px)" }}>
                <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", ...TYPE.caption, fontSize: 9.5, fontWeight: 700, color: T.textOf(DATA.danger), whiteSpace: "nowrap" }}>Today</span>
              </div>
            )}
            {MONTHS.map((m, i) => (
              <span key={m} style={{ position: "absolute", left: `${(i + 0.5) / 12 * 100}%`, top: 66, transform: "translateX(-50%)", ...TYPE.caption, fontSize: 10, color: T.dim }}>{compact && i % 2 ? "" : m}</span>
            ))}
            {tl.dots.map(({ a, x }, i) => {
              const c = CATS[a.category] || CATS.other, Icon = c.icon, hot = hoverDot === a.id;
              return (
                <button key={a.id} className="pa-dot pmo-focusable" onClick={() => setOpen(a)} onMouseEnter={() => setHoverDot(a.id)} onMouseLeave={() => setHoverDot(null)}
                  onFocus={() => setHoverDot(a.id)} onBlur={() => setHoverDot(null)} aria-label={`${a.title}, achieved ${fmtDay(a.achieved_on)}`}
                  style={{ position: "absolute", left: `${x * 100}%`, top: 46, transform: "translate(-50%, -50%)", width: 26, height: 26, borderRadius: 99, cursor: "pointer",
                    display: "grid", placeItems: "center", border: `2px solid ${T.card}`, background: c.color, boxShadow: `0 0 0 3px ${c.color}44, 0 4px 12px -2px ${c.color}`,
                    zIndex: hot ? 3 : 1, animation: anim ? `paRise 500ms ${200 + i * 60}ms both` : "none" }}>
                  <Icon size={12} color="#fff" />
                  {hot && (
                    <span style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", width: 220, padding: "8px 10px", borderRadius: R.md, textAlign: "left",
                      background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "#fff", border: `1px solid ${T.borderStrong}`, boxShadow: T.shadowLg, pointerEvents: "none" }}>
                      <span style={{ display: "block", ...TYPE.caption, fontWeight: 700, color: T.text, overflowWrap: "anywhere" }}>{a.title}</span>
                      <span style={{ display: "block", ...TYPE.caption, fontSize: 10.5, color: T.muted, marginTop: 2 }}>Achieved on {fmtDay(a.achieved_on)}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>, { "data-pa-timeline": "" })}

        {/* Charts */}
        <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(340px, 1fr))" }}>
          {card(BRAND.gold, BarChart3, `Achievements per month · ${chartFy}`, "Stacked by category",
            <div style={{ height: CH }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid stroke={T.border} vertical={false} />
                  <XAxis dataKey="name" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} interval={compact ? 1 : 0} />
                  <YAxis allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <Tip {...p} T={T} />} />
                  {Object.entries(CATS).map(([key, c], i, arr) => (
                    <Bar key={key} dataKey={key} name={c.label} stackId="m" fill={c.color} radius={i === arr.length - 1 ? [5, 5, 0, 0] : 0} {...A(120 + i * 90, 900)} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "per-month" })}
          {card(DATA.violet, PieIcon, "By category", "Share of the achievements in view",
            <div style={{ position: "relative", height: CH }}>
              {byCat.length ? (<>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCat} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="84%" paddingAngle={byCat.length > 1 ? 3 : 0} cornerRadius={6} stroke="none"
                      startAngle={90} endAngle={-270} {...A(150, 1200)} onClick={(d) => setCat(c => c === d?.payload?.key ? "" : d?.payload?.key)}>
                      {byCat.map((s, i) => <Cell key={i} fill={s.color} style={{ cursor: "pointer", outline: "none" }} />)}
                    </Pie>
                    <Tooltip content={(p) => <Tip {...p} T={T} />} />
                    <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: "0 0 28px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ ...TYPE.metric, fontSize: 26, color: T.text }}>{k.total}</div>
                  <div style={{ ...TYPE.label, color: T.muted }}>achieved</div>
                </div>
              </>) : <div style={{ height: "100%", display: "grid", placeItems: "center", ...TYPE.bodySm, color: T.muted }}>Nothing in this view.</div>}
            </div>, { "data-chart": "by-category" })}
          {card(DATA.positive, Users, "Credited to", "Whole team or one PMO member",
            <div style={{ height: CH }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCredit} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap={9} maxBarSize={20}>
                  <defs>{byCredit.map((d, i) => (
                    <linearGradient key={i} id={`paCr${i}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={d.color} stopOpacity={0.55} /><stop offset="100%" stopColor={d.color} /></linearGradient>))}</defs>
                  <CartesianGrid stroke={T.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis type="category" dataKey="name" width={compact ? 112 : 132} tickLine={false} axisLine={false}
                    tick={({ x, y, payload }) => <text x={x} y={y} dy={4} textAnchor="end" style={{ ...axis(T), fontSize: 11, fill: T.textSoft }}>{String(payload.value).length > 18 ? String(payload.value).slice(0, 17) + "…" : payload.value}</text>} />
                  <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <Tip {...p} T={T} />} />
                  <Bar dataKey="value" name="Achievements" radius={[0, 5, 5, 0]} {...A(200, 900)}>
                    {byCredit.map((d, i) => <Cell key={i} fill={`url(#paCr${i})`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "credit" })}
        </div>

        {/* Cards */}
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.sm, marginTop: SP.xs }}>
          <div style={{ ...TYPE.h3, color: T.text }}>Achievements</div>
          <div style={{ ...TYPE.caption, color: T.muted }}>{view.length} shown · newest first · click one to read it</div>
        </div>
        {view.length === 0 ? (
          <div style={{ ...TYPE.bodySm, color: T.muted, padding: SP.lg, border: `1px dashed ${T.border}`, borderRadius: R.md, textAlign: "center" }}>No achievement matches these choices.</div>
        ) : (
          <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {view.map((a, i) => {
              const c = CATS[a.category] || CATS.other, Icon = c.icon, p = projOf(a);
              return (
                <div key={a.id} data-achievement={a.id} role="button" tabIndex={0} onClick={() => setOpen(a)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(a); } }}
                  className="pa-card pa-rise pmo-focusable" aria-label={`${a.title}: open`}
                  style={{ animationDelay: `${Math.min(i, 10) * 50}ms`, position: "relative", overflow: "hidden", cursor: "pointer", minWidth: 0, borderRadius: R.lg,
                    background: `linear-gradient(165deg, ${c.color}17, ${T.card} 45%)`, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding: compact ? SP.md : SP.lg,
                    display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="pa-shine" aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", transform: "translateX(-120%)",
                    background: `linear-gradient(100deg, transparent, ${c.color}22, transparent)`, pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: c.color }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: `linear-gradient(140deg, ${c.color}, ${c.color}99)`,
                      boxShadow: `0 6px 14px -6px ${c.color}` }}><Icon size={17} color="#fff" /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ ...TYPE.caption, fontWeight: 700, color: T.textOf(c.color), textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10 }}>{c.label}</div>
                      <div style={{ ...TYPE.caption, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}><CalendarCheck size={11} /> Achieved on {fmtDay(a.achieved_on)}</div>
                    </div>
                  </div>
                  <div style={{ ...TYPE.h3, fontSize: 15, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{a.title}</div>
                  {a.details && <div style={{ ...TYPE.bodySm, color: T.textSoft, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.details}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                    <Chip T={T} c={a.credit === "team" ? BRAND.gold : DATA.info} icon={Users}>{creditName(a.credit).replace(/^(Mr|Engr)\.?\s+/i, "")}</Chip>
                    {num(a.value_pkr) ? <Chip T={T} c={DATA.positive} icon={Coins}>PKR {fmtM(a.value_pkr)}</Chip> : null}
                    {p && <Chip T={T} c={DATA.violet} icon={FolderOpen}>{p.code || p.name.slice(0, 24)}</Chip>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {open && (
        <ReadAchievement T={T} compact={compact} a={open} creditName={creditName} proj={projOf(open)} people={people}
          onClose={() => setOpen(null)} onEdit={() => { setEdit(open); setOpen(null); }} onDelete={() => setConfirmDel(open)}
          onOpenProject={(a) => { setOpen(null); a.project_id ? onOpenProject?.(a.project_id) : onOpenPast?.(a.past_project_id); }} />
      )}
      {edit && <EditAchievement T={T} compact={compact} a={edit} creditName={creditName} projects={projects} past={past} supa={supa} tok={tok}
        onClose={() => setEdit(null)} onSaved={(row, isNew) => { setEdit(null); setRows(rs => [...(isNew ? [...rs, row] : rs.map(x => x.id === row.id ? row : x))]
          .sort((x, y) => (y.achieved_on.localeCompare(x.achieved_on)) || (y.created_at || "").localeCompare(x.created_at || ""))); setOpen(row); }} />}
      {confirmDel && (
        <Modal T={T} isMobile={compact} onClose={() => setConfirmDel(null)} icon={Trash2} width={460} title="Delete this achievement?" sub={fmtDay(confirmDel.achieved_on)}
          footer={<div style={{ display: "flex", gap: SP.sm, justifyContent: "flex-end", width: "100%" }}>
            <Button T={T} onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button T={T} variant="danger" icon={Trash2} data-confirm-delete onClick={() => { const a = confirmDel; setConfirmDel(null); remove(a); }}>Delete</Button>
          </div>}>
          <div style={{ ...TYPE.bodySm, color: T.text, overflowWrap: "anywhere" }}>{confirmDel.title}</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 8 }}>It disappears from the page. The Activity Log keeps a record that it was deleted.</div>
        </Modal>
      )}
    </div>
    </div>
  );
}

function ReadAchievement({ T, compact, a, creditName, proj, people, onClose, onEdit, onDelete, onOpenProject }) {
  const c = CATS[a.category] || CATS.other, Icon = c.icon;
  return (
    <Modal T={T} isMobile={compact} onClose={onClose} icon={Icon} width={640} title={a.title} sub={c.label}
      footer={<div style={{ display: "flex", gap: SP.sm, alignItems: "center", width: "100%" }}>
        <Button T={T} variant="danger" size="sm" icon={Trash2} onClick={onDelete}>Delete</Button>
        <span style={{ flex: 1 }} />
        <Button T={T} icon={Pencil} onClick={onEdit} data-edit-achievement>Edit</Button>
        <Button T={T} variant="primary" onClick={onClose}>Close</Button>
      </div>}>
      <div data-pa-reading="">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: R.lg, background: `linear-gradient(120deg, ${c.color}26, transparent)`,
          border: `1px solid ${c.color}55` }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: c.color, flexShrink: 0 }}><CalendarCheck size={20} color="#fff" /></span>
          <div>
            <div style={{ ...TYPE.label, fontSize: 10, color: T.textOf(c.color) }}>Achieved on</div>
            <div data-achieved-on style={{ ...TYPE.h3, fontSize: 17, color: T.text }}>{fmtLong(a.achieved_on)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: SP.md }}>
          <Chip T={T} c={a.credit === "team" ? BRAND.gold : DATA.info} icon={Users}>{creditName(a.credit)}</Chip>
          {num(a.value_pkr) ? <Chip T={T} c={DATA.positive} icon={Coins}>PKR {fmt(a.value_pkr)}</Chip> : null}
          {proj && (
            <button onClick={() => onOpenProject(a)} className="pmo-focusable" style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
              <Chip T={T} c={DATA.violet} icon={FolderOpen}>{proj.code ? `${proj.code} · ` : ""}{proj.name}</Chip>
            </button>
          )}
        </div>
        <div style={{ ...TYPE.label, fontSize: 10, color: T.dim, marginTop: SP.lg }}>Details</div>
        <div style={{ ...TYPE.body, color: a.details ? T.text : T.dim, marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.65, fontStyle: a.details ? "normal" : "italic" }}>
          {a.details || "No details yet. Press Edit to add them."}
        </div>
        <div style={{ ...TYPE.caption, color: T.dim, marginTop: SP.lg }}>Added {fmtStamp(a.created_at)}{people[a.created_by] ? ` by ${people[a.created_by]}` : ""}</div>
      </div>
    </Modal>
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

function EditAchievement({ T, compact, a, creditName, projects, past, supa, tok, onClose, onSaved }) {
  const isNew = !a.id;
  const [f, setF] = useState({
    title: a.title || "", achieved_on: a.achieved_on || todayPkt(), details: a.details || "", category: a.category || "delivery", credit: a.credit || "team",
    proj: a.project_id ? `p:${a.project_id}` : a.past_project_id ? `x:${a.past_project_id}` : "", value: a.value_pkr != null ? fmt(a.value_pkr) : "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const box = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.surface,
    color: T.text, fontSize: 13, fontFamily: TYPE.body.fontFamily, outline: "none" };
  const money = (s) => { const t = String(s ?? "").replace(/[,\s]/g, ""); return t === "" ? null : Number(t); };

  const save = async () => {
    if (!f.title.trim()) return setMsg("Write what was achieved.");
    if (!f.achieved_on) return setMsg("Pick the date it was achieved.");
    const v = money(f.value);
    if (v !== null && !(v >= 0)) return setMsg("Value must be an amount in rupees (numbers only).");
    const body = { title: f.title.trim(), achieved_on: f.achieved_on, details: f.details.trim() || null, category: f.category, credit: f.credit, value_pkr: v,
      project_id: f.proj.startsWith("p:") ? f.proj.slice(2) : null, past_project_id: f.proj.startsWith("x:") ? f.proj.slice(2) : null };
    setBusy(true); setMsg(null);
    try {
      const r = await supa(isNew ? "/rest/v1/pmo_achievements?select=*" : `/rest/v1/pmo_achievements?id=eq.${a.id}&select=*`,
        { method: isNew ? "POST" : "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }, tok);
      if (!Array.isArray(r) || !r[0]) throw new Error("not saved");
      onSaved(r[0], isNew);
    } catch { setBusy(false); setMsg("Could not save. Check the connection and try again."); }
  };

  return (
    <Modal T={T} isMobile={compact} onClose={busy ? undefined : onClose} icon={Trophy} width={640}
      title={isNew ? "Add an achievement" : "Edit achievement"} sub="PMO Achievements"
      footer={<div style={{ display: "flex", gap: SP.sm, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
        <span style={{ flex: 1, ...TYPE.caption, color: T.textOf(DATA.danger) }}>{msg}</span>
        <Button T={T} onClick={onClose} disabled={busy}>Cancel</Button>
        <Button T={T} variant="primary" onClick={save} loading={busy} data-save>{isNew ? "Add" : "Save"}</Button>
      </div>}>
      <div data-pa-edit style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: SP.md }}>
        <L T={T} label="Achievement" wide><EnhanceAI T={T} supa={supa} token={tok} compact={compact} field="title" context="achievement" value={f.title} onApply={(t) => set("title", t)}><input value={f.title} onChange={e => set("title", e.target.value)} style={box} placeholder="e.g. QIE Campus renovation handed over" autoFocus data-field="title" /></EnhanceAI></L>
        <L T={T} label="Achieved on"><input type="date" value={f.achieved_on} onChange={e => set("achieved_on", e.target.value)} style={box} data-field="achieved_on" /></L>
        <L T={T} label="Category">
          <select value={f.category} onChange={e => set("category", e.target.value)} style={box} data-field="category">
            {Object.entries(CATS).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}
          </select>
        </L>
        <L T={T} label="Credited to">
          <select value={f.credit} onChange={e => set("credit", e.target.value)} style={box} data-field="credit">
            {CREDITS.map(c => <option key={c.key} value={c.key}>{creditName(c.key)}</option>)}
          </select>
        </L>
        <L T={T} label="Value in PKR (optional)" hint={money(f.value) ? `PKR ${fmt(money(f.value))}` : "Savings or value delivered"}>
          <input inputMode="numeric" value={f.value} onChange={e => set("value", e.target.value)} style={box} placeholder="e.g. 2,500,000" data-field="value" />
        </L>
        <L T={T} label="Project (optional)" wide>
          <select value={f.proj} onChange={e => set("proj", e.target.value)} style={box} data-field="project">
            <option value="">No project</option>
            <optgroup label="FY 26-27 projects">{projects.map(p => <option key={p.id} value={`p:${p.id}`}>{p.code ? `${p.code} · ` : ""}{p.name}</option>)}</optgroup>
            <optgroup label="Past projects">{past.map(p => <option key={p.id} value={`x:${p.id}`}>{p.code ? `${p.code} · ` : ""}{p.name}{p.fiscal_year ? ` · ${p.fiscal_year}` : ""}</option>)}</optgroup>
          </select>
        </L>
        <L T={T} label="Details" wide hint={`${f.details.length} / 5000`}>
          <EnhanceAI T={T} supa={supa} token={tok} compact={compact} field="details" context="achievement" value={f.details} onApply={(t) => set("details", t.slice(0, 5000))}>
            <textarea value={f.details} onChange={e => set("details", e.target.value.slice(0, 5000))} rows={7} style={{ ...box, resize: "vertical", lineHeight: 1.55 }}
              placeholder="What was achieved, why it matters, who was involved…" data-field="details" />
          </EnhanceAI>
        </L>
      </div>
    </Modal>
  );
}
