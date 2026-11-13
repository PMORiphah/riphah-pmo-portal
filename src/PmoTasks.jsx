import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  ListTodo, FileWarning, Plus, Pencil, Trash2, Check, Search, ChevronDown, ChevronRight, CalendarClock, Flag, Target,
  CircleCheckBig, AlarmClock, Percent, Sparkles, Users, BarChart3, PieChart as PieIcon, TrendingUp, X, History, Hourglass, Trophy, Activity, FileSpreadsheet, MailCheck,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Input, Modal, Section, SectionTitle, EmptyState, useViewport } from "./ui.jsx";
import { EnhanceAI } from "./EnhanceAI.jsx";
import { loadPrDocs, PrDocsModal } from "./ProjectPrs.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   TASKS / GOALS (PMO, 12 Nov 2026). PMO only (nav + RLS on pmo_tasks).
   Six lists, in the PMO's order: PMO To-Do, Pending PRs, then one per PMO member
   (Owais, Usman, Abdullah, Atisham; Waleed deliberately not included). Member
   names come from settings.team_config, so Team & About stays the one source.
   Pending PRs: each task names the project the PR is from (FY 26-27 projects
   and open Past Projects); while open, that project carries a red "Pending PR"
   badge elsewhere in the portal (PMO only, loadPendingPrs below).
   Added / completed times are stamped by the server (trg_pmo_tasks_stamp);
   Delete = removed (kept for the Activity Log).
   ═══════════════════════════════════════════════════════════════════════════ */

export const LISTS = [
  { key: "pmo_todo",    kind: "list",   label: "PMO To-Do",   icon: ListTodo,    color: BRAND.blueBright },
  { key: "pending_pr",  kind: "list",   label: "Pending PRs", icon: FileWarning, color: DATA.danger },
  { key: "manager_pmo", kind: "member", fallback: "Mr. Owais Javed",        title: "Manager PMO",      color: BRAND.gold },
  { key: "exec_pmo",    kind: "member", fallback: "Engr. Usman Ahmed Umar", title: "Executive PMO",    color: DATA.positive },
  { key: "po1",         kind: "member", fallback: "Mr. Abdullah Azhar",     title: "Executive PMO",    color: DATA.violet },
  { key: "po2",         kind: "member", fallback: "Mr. Atisham ul Haq",     title: "Projects Officer", color: DATA.cyan },
];
// Who can be recorded as having made a PR (PMO, 12 Nov 2026): the Executive PMOs and the Projects Officer.
const PR_MAKERS = ["exec_pmo", "po1", "po2"];
const PRIORITY = { high: { label: "High", color: DATA.danger }, normal: { label: "Normal", color: DATA.neutral }, low: { label: "Low", color: DATA.info } };

// Board filters (open tasks only; "All" also shows completed ones).
const FILTERS = [
  { key: "all", label: "All open", test: () => true },
  { key: "overdue", label: "Overdue", icon: AlarmClock, c: DATA.danger, test: (t, today) => dueState(t, today) === "overdue" },
  { key: "soon", label: "Due in 7 days", icon: CalendarClock, c: DATA.warning, test: (t, today) => dueState(t, today) === "soon" },
  { key: "high", label: "High priority", icon: Flag, c: DATA.violet, test: (t) => t.priority === "high" },
];
const ageDays = (t) => Math.max(0, Math.floor((Date.now() - new Date(t.created_at)) / 86400000));
const ageTone = (d) => d >= 14 ? DATA.danger : d >= 7 ? DATA.warning : DATA.info;
const fmtMonth = (s) => new Date(s).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", month: "long", year: "numeric" });
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const DAY = 86400000;
// "Today" in PKT, as YYYY-MM-DD, for due-date comparisons.
const todayPkt = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const fmtDay = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtStamp = (s) => s ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const took = (a, b) => {
  const ms = new Date(b) - new Date(a); if (!(ms >= 0)) return "";
  const d = Math.floor(ms / DAY), h = Math.round(ms / 3600000);
  return d >= 2 ? `${d} days` : d === 1 ? "1 day" : h >= 1 ? `${h} h` : "under an hour";
};
const initials = (n) => String(n || "").replace(/^(Mr|Mrs|Ms|Engr|Dr|Brig|Col|Maj)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const axis = (T) => ({ fontSize: 10.5, fontFamily: TYPE.body.fontFamily, fill: T.dim });
const dueState = (t, today) => {
  if (t.done || !t.due_date) return null;
  if (t.due_date < today) return "overdue";
  const d = (new Date(t.due_date) - new Date(today)) / DAY;
  return d <= 7 ? "soon" : "later";
};

function useCount(target, ms = 900) {
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

function Kpi({ compact, icon: Icon, label, value, sub, color, i, meter }) {
  return (
    <div className="pmo-lift pt-rise" style={{ animationDelay: `${i * 90}ms`, minWidth: 0, padding: compact ? "12px 14px" : "18px 20px", borderRadius: R.lg,
      display: "flex", flexDirection: "column", background: `linear-gradient(160deg, ${color}26, rgba(255,255,255,0.05) 55%)`,
      border: "1px solid rgba(255,255,255,0.14)", boxShadow: `inset 3px 0 0 ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, fontSize: 10, color: "rgba(255,255,255,0.78)" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: `${color}38` }}><Icon size={14} color={color} /></span>{label}
      </div>
      <div style={{ ...TYPE.display, fontSize: compact ? 24 : 34, color: "#fff", marginTop: compact ? 6 : 10, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{sub}</div>}
      {meter != null && (
        <div style={{ marginTop: "auto", paddingTop: compact ? 10 : 14 }}>
          <div style={{ height: 5, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}>
            <div style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%`, height: "100%", background: color, transition: "width 900ms cubic-bezier(.2,.7,.2,1)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Ring({ T, done, total, color, size = 46 }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${done} of ${total} done`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.border} strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: T.text, fontFamily: TYPE.body.fontFamily }}>
        {total ? Math.round(p * 100) : 0}%
      </text>
    </svg>
  );
}

function Tip({ T, active, payload, label, unit = "task" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${T.borderStrong}`,
      borderRadius: R.md, padding: `${SP.sm}px ${SP.md}px`, boxShadow: T.shadowLg, minWidth: 150 }}>
      {label && <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: SP.lg, marginTop: i ? 4 : 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.caption, color: T.textSoft }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.payload?.color || p.color }} />{p.name}
          </span>
          <span style={{ ...TYPE.caption, color: T.text, fontWeight: 700 }}>{p.value} {unit}{p.value === 1 ? "" : "s"}</span>
        </div>
      ))}
    </div>
  );
}

function Chip({ T, c, children, title, solid }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: R.pill, whiteSpace: "nowrap",
      background: solid ? c : `${c}1f`, border: `1px solid ${solid ? c : `${c}55`}`, color: solid ? "#fff" : T.textOf(c), ...TYPE.caption, fontSize: 10.5, fontWeight: 700 }}>{children}</span>
  );
}

export function PmoTasksPage({ T, session, supa, onOpenProject, onOpenPast }) {
  const vp = useViewport();
  const compact = vp.isCompact;
  const tok = session.access_token;
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState({});
  const [projects, setProjects] = useState([]);
  const [past, setPast] = useState([]);
  const [people, setPeople] = useState({});
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);          // task being edited, or { list } for a new one
  const [confirmDel, setConfirmDel] = useState(null);
  const [prDone, setPrDone] = useState(null);       // Pending PR being ticked: ask who made the PR
  const [history, setHistory] = useState(null);     // PR history window: { maker }
  const [filter, setFilter] = useState("all");
  const [prMore, setPrMore] = useState(false);
  const [toast, setToast] = useState(null);
  const [justDone, setJustDone] = useState(null);
  const toastT = useRef(null), doneT = useRef(null);
  const flash = (text) => { setToast(text); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 5000); };
  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(doneT.current); }, []);
  const [showDone, setShowDone] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [anim, setAnim] = useState(() => !reduced());
  useEffect(() => { const t = setTimeout(() => setAnim(false), 1600); return () => clearTimeout(t); }, []);
  const A = (begin, dur) => ({ isAnimationActive: anim, animationBegin: begin, animationDuration: dur, animationEasing: "ease-out" });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [t, s, p, pp, u] = await Promise.all([
        supa("/rest/v1/pmo_tasks?removed=eq.false&select=*&order=created_at.asc", {}, tok),
        supa("/rest/v1/settings?key=eq.team_config&select=value", {}, tok).catch(() => []),
        supa("/rest/v1/projects?select=id,code,name,fiscal_year,campus,portfolio,amount_released&order=name.asc", {}, tok).catch(() => []),
        supa("/rest/v1/past_projects?status=neq.closed&select=id,code,name,campus,fiscal_year,released_amount&order=name.asc", {}, tok).catch(() => []),
        supa("/rest/v1/user_profiles?select=id,full_name,username", {}, tok).catch(() => []),
      ]);
      setRows(Array.isArray(t) ? t : []);
      setCfg((Array.isArray(s) && s[0]?.value) || {});
      setProjects(Array.isArray(p) ? p : []);
      setPast(Array.isArray(pp) ? pp : []);
      setPeople(Object.fromEntries((Array.isArray(u) ? u : []).map(x => [x.id, (x.full_name || x.username || "").trim()])));
    } catch (e) { setErr(e.message || "Could not load the tasks."); setRows([]); }
  }, [supa, tok]);
  useEffect(() => { load(); }, [load]);

  const listMeta = useMemo(() => Object.fromEntries(LISTS.map(l => [l.key, l.kind === "member"
    ? { ...l, label: (cfg[l.key]?.name || l.fallback).trim(), title: cfg[l.key]?.title || l.title }
    : l])), [cfg]);
  const projById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const pastById = useMemo(() => Object.fromEntries(past.map(p => [p.id, p])), [past]);
  const today = todayPkt();

  const all = rows || [];
  const projOf = (t) => t.project_id ? (projById[t.project_id] || { name: "Project", code: "" }) : t.past_project_id ? (pastById[t.past_project_id] || { name: "Past project (closed)", code: "" }) : null;
  const match = (t) => {
    const s = q.trim().toLowerCase(); if (!s) return true;
    const p = projOf(t);
    return [t.title, t.note, p?.name, p?.code, listMeta[t.list]?.label].some(x => String(x || "").toLowerCase().includes(s));
  };
  const view = all.filter(match);

  // ── figures ────────────────────────────────────────────────────────────────
  const k = useMemo(() => {
    const open = all.filter(t => !t.done), done = all.filter(t => t.done);
    const weekAgo = Date.now() - 7 * DAY;
    return {
      open: open.length, done: done.length, total: all.length,
      doneWeek: done.filter(t => new Date(t.done_at) >= weekAgo).length,
      overdue: open.filter(t => dueState(t, today) === "overdue").length,
      prs: open.filter(t => t.list === "pending_pr").length,
      rate: all.length ? done.length / all.length : null,
    };
  }, [all, today]);
  const byList = useMemo(() => LISTS.map(l => {
    const ts = all.filter(t => t.list === l.key);
    return { key: l.key, name: listMeta[l.key].label.replace(/^(Mr|Engr)\.?\s+/i, ""), open: ts.filter(t => !t.done).length, done: ts.filter(t => t.done).length, color: l.color };
  }), [all, listMeta]);
  const weeks = useMemo(() => {
    const out = [];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));   // this Monday
    for (let i = 9; i >= 0; i--) {
      const a = new Date(start.getTime() - i * 7 * DAY), b = new Date(a.getTime() + 7 * DAY);
      out.push({ name: `${a.getDate()} ${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[a.getMonth()]}`,
        added: all.filter(t => new Date(t.created_at) >= a && new Date(t.created_at) < b).length,
        completed: all.filter(t => t.done_at && new Date(t.done_at) >= a && new Date(t.done_at) < b).length });
    }
    return out;
  }, [all]);
  const dueSplit = useMemo(() => {
    const open = all.filter(t => !t.done);
    return [
      { name: "Overdue", value: open.filter(t => dueState(t, today) === "overdue").length, color: DATA.danger },
      { name: "Due in 7 days", value: open.filter(t => dueState(t, today) === "soon").length, color: DATA.warning },
      { name: "Later", value: open.filter(t => dueState(t, today) === "later").length, color: DATA.positive },
      { name: "No due date", value: open.filter(t => !t.due_date).length, color: DATA.neutral },
    ].filter(s => s.value > 0);
  }, [all, today]);

  // ── writes ─────────────────────────────────────────────────────────────────
  const patch = async (t, body) => {
    setBusyId(t.id);
    try {
      const r = await supa(`/rest/v1/pmo_tasks?id=eq.${t.id}&select=*`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }, tok);
      if (Array.isArray(r) && r[0]) setRows(rs => body.removed ? rs.filter(x => x.id !== t.id) : rs.map(x => x.id === t.id ? r[0] : x));
      else throw new Error("not saved");
      if (body.done === true) { setJustDone(t.id); clearTimeout(doneT.current); doneT.current = setTimeout(() => setJustDone(null), 1000); }
      return true;
    } catch { setErr("Could not save the change. Check the connection and try again."); return false; }
    finally { setBusyId(null); }
  };
  // Ticking a Pending PR asks who made the PR first (PMO, 12 Nov 2026); unticking clears it (trigger).
  const toggle = (t) => (t.list === "pending_pr" && !t.done) ? setPrDone(t) : patch(t, { done: !t.done });

  if (rows === null) return <div style={{ flex: 1, padding: SP.xl, color: T.muted, fontSize: 13 }}>Loading goals…</div>;

  // ── filters ────────────────────────────────────────────────────────────────
  const fDef = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const shown = (t) => match(t) && (filter === "all" || (!t.done && fDef.test(t, today)));
  const fCount = (f) => all.filter(t => !t.done && match(t) && (f.key === "all" || f.test(t, today))).length;
  const byDue = (a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : (a.due_date || "9999") > (b.due_date || "9999") ? 1 : (b.priority === "high") - (a.priority === "high");
  const short = (key) => String(listMeta[key]?.label || "").replace(/^(Mr|Mrs|Ms|Engr|Dr)\.?\s+/i, "").split(" ")[0];

  const card = (tone, icon, title, sub, body, attr) => (
    <Section T={T} tone={tone} pad={compact ? SP.md : SP.lg} {...attr} style={{ minWidth: 0 }}>
      <SectionTitle T={T} icon={icon} title={title} sub={sub} />{body}
    </Section>
  );
  const CH = 240;
  const iconBtn = (Icon, label, onClick, color, attr = {}) => (
    <button onClick={onClick} title={label} aria-label={label} className="pmo-focusable pmo-btn" {...attr}
      style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: 5, cursor: "pointer", color: color || T.muted, display: "grid", placeItems: "center" }}><Icon size={13} /></button>
  );
  const tick = (t, color, size = 22) => (
    <button onClick={() => toggle(t)} disabled={busyId === t.id} aria-label={t.done ? `Mark not done: ${t.title}` : `Mark done: ${t.title}`} data-tick
      className="pmo-focusable pt-tick" style={{ width: size, height: size, borderRadius: 7, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center",
        border: `2px solid ${t.done ? DATA.positive : color}`, background: t.done ? DATA.positive : "transparent", "--tc": color }}>
      {t.done ? <Check size={13} color="#fff" strokeWidth={3} /> : <Check className="pt-tick-hint" size={12} color={color} strokeWidth={3} />}
    </button>
  );
  const projLink = (t, p, big) => p && (
    <button onClick={() => t.project_id ? onOpenProject?.(t.project_id) : t.past_project_id ? onOpenPast?.(t.past_project_id) : null}
      className="pmo-focusable pt-link" style={{ display: "block", marginTop: big ? 0 : 4, padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", minWidth: 0, maxWidth: "100%" }}>
      {p.code && p.code !== "-" && <span style={{ display: big ? "block" : "inline", fontFamily: "ui-monospace,Consolas,monospace", fontSize: 10.5, color: T.muted, marginRight: 6, whiteSpace: "nowrap", letterSpacing: 0.3 }}>{p.code}</span>}
      <span className={big ? "pt-clamp2" : ""} style={{ ...(big ? { ...TYPE.h3, fontSize: 14.5, lineHeight: 1.35 } : { ...TYPE.caption, fontWeight: 600 }), color: T.textOf(BRAND.blueBright), overflowWrap: "anywhere" }}>{p.name}</span>
    </button>
  );

  // ── one task (team board) ──────────────────────────────────────────────────
  const renderTask = (t, color) => {
    const p = projOf(t), ds = dueState(t, today), pr = PRIORITY[t.priority] || PRIORITY.normal;
    const by = people[t.created_by], doneBy = people[t.done_by];
    const edge = t.done ? DATA.positive : ds === "overdue" ? DATA.danger : t.priority === "high" ? pr.color : color;
    return (
      <div key={t.id} data-task={t.id} className={`pt-row${justDone === t.id ? " pt-pop" : ""}`} style={{ display: "flex", gap: 10, padding: "10px 10px 10px 12px", marginTop: 8, borderRadius: R.md,
        background: t.done ? "transparent" : T.surface, border: `1px solid ${T.border}`, boxShadow: `inset 3px 0 0 ${edge}`, opacity: busyId === t.id ? 0.55 : 1 }}>
        <div style={{ paddingTop: 1 }}>{tick(t, color)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {t.list === "pending_pr" && <Chip T={T} c={t.done ? DATA.positive : DATA.danger} solid={!t.done}>{t.done ? "PR done" : "Pending PR"}</Chip>}
            {!(t.list === "pending_pr" && /^pending pr$/i.test(t.title.trim())) && (
              <span style={{ ...TYPE.bodySm, fontWeight: 600, color: t.done ? T.muted : T.text, textDecoration: t.done ? "line-through" : "none", overflowWrap: "anywhere" }}>{t.title}</span>)}
          </div>
          {projLink(t, p)}
          {(t.priority !== "normal" || t.due_date) && !t.done && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
              {t.priority !== "normal" && <Chip T={T} c={pr.color}><Flag size={10} /> {pr.label}</Chip>}
              {t.due_date && <Chip T={T} c={ds === "overdue" ? DATA.danger : ds === "soon" ? DATA.warning : DATA.info}>
                <CalendarClock size={10} /> {ds === "overdue" ? "Overdue · " : "Due "}{fmtDay(t.due_date)}</Chip>}
            </div>)}
          {t.note && <div style={{ ...TYPE.caption, color: T.textSoft, marginTop: 5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.note}</div>}
          <div style={{ ...TYPE.caption, fontSize: 10.5, color: T.dim, marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span data-added>Added {fmtStamp(t.created_at)}{by ? ` · ${by}` : ""}</span>
            {t.done && <span data-completed style={{ color: T.textOf(DATA.positive) }}>Completed {fmtStamp(t.done_at)}{doneBy ? ` · ${doneBy}` : ""}{t.created_at ? ` · took ${took(t.created_at, t.done_at)}` : ""}</span>}
            {t.done && t.pr_made_by && listMeta[t.pr_made_by] && (
              <span data-pr-made-by style={{ color: T.textOf(listMeta[t.pr_made_by].color), fontWeight: 700 }}>PR made by {listMeta[t.pr_made_by].label} · {listMeta[t.pr_made_by].title}</span>)}
          </div>
        </div>
        <div className="pt-act" style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {iconBtn(Pencil, `Edit ${t.title}`, () => setEdit(t))}
          {iconBtn(Trash2, `Delete ${t.title}`, () => setConfirmDel(t), T.textOf(DATA.danger))}
        </div>
      </div>
    );
  };

  // ── Pending PRs: featured section ──────────────────────────────────────────
  const prAll = all.filter(t => t.list === "pending_pr");
  const prCleared = prAll.filter(t => t.done);
  const prOpenAll = prAll.filter(t => !t.done);
  const prOpen = prOpenAll.filter(shown).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const oldest = prOpenAll.reduce((m, t) => Math.max(m, ageDays(t)), 0);
  const madeBy = PR_MAKERS.map(key => ({ key, n: prCleared.filter(t => t.pr_made_by === key).length }));
  const madeMax = Math.max(1, ...madeBy.map(x => x.n));
  const PR_CAP = compact ? 4 : 12;
  const prShown = prMore ? prOpen : prOpen.slice(0, PR_CAP);

  const renderPr = (t, i) => {
    const p = projOf(t), d = ageDays(t), tone = ageTone(d), ds = dueState(t, today), pr = PRIORITY[t.priority] || PRIORITY.normal;
    const by = people[t.created_by];
    const amt = p ? fmtMoneyM(p.amount_released ?? p.released_amount) : "";
    return (
      <div key={t.id} data-task={t.id} className="pt-pr pt-rise" style={{ animationDelay: `${Math.min(i, 8) * 45}ms`, position: "relative", minWidth: 0, display: "flex", flexDirection: "column",
        gap: 10, padding: "14px 14px 12px 18px", borderRadius: R.lg, background: T.card, border: `1px solid ${T.border}`, overflow: "hidden", opacity: busyId === t.id ? 0.55 : 1 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: `linear-gradient(180deg, ${tone}, ${tone}66)` }} />
        <span aria-hidden="true" className="pt-pr-glow" style={{ position: "absolute", right: -40, top: -40, width: 120, height: 120, borderRadius: 99, background: `radial-gradient(circle, ${tone}2e, transparent 70%)` }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          {tick(t, DATA.danger, 24)}
          <span data-age style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: R.pill, background: `${tone}1c`, border: `1px solid ${tone}55`,
            color: T.textOf(tone), ...TYPE.caption, fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>
            <Hourglass size={11} /> {d === 0 ? "Added today" : `Waiting ${d} day${d === 1 ? "" : "s"}`}
          </span>
          <span style={{ flex: 1 }} />
          <span className="pt-act" style={{ display: "flex", gap: 4 }}>
            {iconBtn(Pencil, `Edit ${t.title}`, () => setEdit(t))}
            {iconBtn(Trash2, `Delete ${t.title}`, () => setConfirmDel(t), T.textOf(DATA.danger))}
          </span>
        </div>
        <div style={{ position: "relative", minWidth: 0 }}>
          {p ? projLink(t, p, true) : <span style={{ ...TYPE.h3, fontSize: 14.5, color: T.text }}>{t.title}</span>}
          {p && !/^pending pr$/i.test(t.title.trim()) && <div style={{ ...TYPE.caption, fontWeight: 700, color: T.text, marginTop: 4, overflowWrap: "anywhere" }}>{t.title}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, ...TYPE.caption, fontSize: 10.5, color: T.muted }}>
            {p?.campus && <span>{p.campus}</span>}
            {p && <span>· {t.project_id ? "FY 26-27" : "Past project"}</span>}
            {amt && <span>· released {amt}</span>}
          </div>
        </div>
        {(t.priority !== "normal" || t.due_date) && (
          <div style={{ position: "relative", display: "flex", gap: 5, flexWrap: "wrap" }}>
            {t.priority !== "normal" && <Chip T={T} c={pr.color}><Flag size={10} /> {pr.label}</Chip>}
            {t.due_date && <Chip T={T} c={ds === "overdue" ? DATA.danger : ds === "soon" ? DATA.warning : DATA.info}><CalendarClock size={10} /> {ds === "overdue" ? "Overdue · " : "Due "}{fmtDay(t.due_date)}</Chip>}
          </div>)}
        {t.note && <div className="pt-clamp2" title={t.note} style={{ position: "relative", ...TYPE.caption, color: T.textSoft, overflowWrap: "anywhere" }}>{t.note}</div>}
        <div data-added style={{ position: "relative", marginTop: "auto", paddingTop: 8, borderTop: `1px dashed ${T.border}`, ...TYPE.caption, fontSize: 10.5, color: T.dim }}>
          Added {fmtStamp(t.created_at)}{by ? ` · ${by}` : ""}
        </div>
      </div>
    );
  };

  // ── team board: PMO To-Do + one column per member, plus a team pulse tile ──
  const boardLists = LISTS.filter(l => l.key !== "pending_pr");
  const boardCols = compact ? 1 : vp.width < 1180 ? 2 : 3;
  const COLH = 430;
  const renderCol = (l, i) => {
    const m = listMeta[l.key];
    const allIn = all.filter(t => t.list === l.key), totalDone = allIn.filter(t => t.done).length;
    const open = allIn.filter(t => !t.done && shown(t)).sort(byDue);
    const done = filter === "all" ? allIn.filter(t => t.done && match(t)).sort((a, b) => new Date(b.done_at) - new Date(a.done_at)) : [];
    const overdue = allIn.filter(t => dueState(t, today) === "overdue").length;
    const week = allIn.filter(t => t.done && new Date(t.done_at) >= Date.now() - 7 * DAY).length;
    const Icon = m.icon;
    const stat = (label, v, c) => (
      <div style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: R.md, background: `${c}14`, border: `1px solid ${c}33`, textAlign: "center" }}>
        <div style={{ ...TYPE.metric, fontSize: 17, color: v && c !== DATA.neutral ? T.textOf(c) : T.text, lineHeight: 1.1 }}>{v}</div>
        <div style={{ ...TYPE.label, fontSize: 8.5, color: T.muted, marginTop: 2 }}>{label}</div>
      </div>
    );
    return (
      <div key={l.key} data-list={l.key} className="pt-rise br-card" style={{ animationDelay: `${120 + i * 70}ms`, minWidth: 0, height: compact ? "auto" : COLH, background: T.card,
        border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: T.shadow, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", padding: compact ? "14px 14px 10px" : "16px 16px 12px", background: `linear-gradient(160deg, ${m.color}22, transparent 70%)` }}>
          <div style={{ position: "absolute", inset: "0 0 auto 0", height: 3, background: `linear-gradient(90deg, ${m.color}, ${m.color}33)` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {m.kind === "member" ? (
              <div className="pt-avatar" style={{ width: 46, height: 46, borderRadius: 15, flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: "#fff",
                background: `linear-gradient(140deg, ${m.color}, ${m.color}99)`, boxShadow: `0 8px 18px -8px ${m.color}` }}>{initials(m.label)}</div>
            ) : (
              <div className="pt-avatar" style={{ width: 46, height: 46, borderRadius: 15, flexShrink: 0, display: "grid", placeItems: "center", background: `${m.color}22`, border: `1px solid ${m.color}55` }}>
                <Icon size={21} color={m.color} /></div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TYPE.h3, fontSize: 15, color: T.text, overflowWrap: "anywhere", lineHeight: 1.25 }}>{m.label}</div>
              <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>{m.kind === "member" ? m.title : "Team-wide tasks"}</div>
            </div>
            <Ring T={T} done={totalDone} total={allIn.length} color={m.color} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {stat("Open", allIn.length - totalDone, m.color)}
            {stat("Overdue", overdue, overdue ? DATA.danger : DATA.neutral)}
            {stat("Done · 7 days", week, DATA.positive)}
          </div>
        </div>
        <div className="pmo-scroll pt-colbody" style={{ flex: 1, minHeight: 0, overflow: compact ? "visible" : "auto", padding: "0 12px 10px" }}>
          {open.length === 0 && (
            <div data-empty style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "22px 8px 12px", gap: 8 }}>
              <div className="pt-float" style={{ width: 52, height: 52, borderRadius: 18, display: "grid", placeItems: "center", background: `radial-gradient(circle at 30% 30%, ${m.color}40, ${m.color}12)`, border: `1px solid ${m.color}44` }}>
                {q.trim() || filter !== "all" ? <Search size={20} color={m.color} /> : <Sparkles size={20} color={m.color} />}
              </div>
              <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{q.trim() || filter !== "all" ? "Nothing matches" : "All clear"}</div>
              <div style={{ ...TYPE.caption, color: T.muted, maxWidth: 220 }}>{q.trim() || filter !== "all" ? "No open task here fits the search or filter." : `No open tasks for ${m.kind === "member" ? short(l.key) : "the team"}. Add one when it comes up.`}</div>
            </div>
          )}
          {open.map(t => renderTask(t, m.color))}
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone(s => ({ ...s, [l.key]: !s[l.key] }))} className="pmo-focusable" data-show-done={l.key}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginTop: 10, padding: "8px 4px", border: "none", borderTop: `1px solid ${T.border}`, background: "none",
                  cursor: "pointer", ...TYPE.caption, fontWeight: 700, color: T.textOf(DATA.positive) }}>
                {showDone[l.key] ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Completed · {done.length}
              </button>
              {showDone[l.key] && done.map(t => renderTask(t, m.color))}
            </>
          )}
        </div>
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}` }}>
          <button onClick={() => setEdit({ list: l.key })} data-add={l.key} aria-label={`Add to ${m.label}`} className="pmo-focusable pt-add"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", borderRadius: R.md, cursor: "pointer",
              border: `1.5px dashed ${m.color}77`, background: `${m.color}0d`, color: T.textOf(m.color), ...TYPE.caption, fontWeight: 800, fontFamily: TYPE.body.fontFamily, "--ac": m.color }}>
            <Plus size={14} /> Add task
          </button>
        </div>
      </div>
    );
  };

  const pulse = boardLists.map(l => {
    const ts = all.filter(t => t.list === l.key);
    return { key: l.key, m: listMeta[l.key], open: ts.filter(t => !t.done).length,
      week: ts.filter(t => t.done && new Date(t.done_at) >= Date.now() - 7 * DAY).length, overdue: ts.filter(t => dueState(t, today) === "overdue").length };
  });
  const pulseMax = Math.max(1, ...pulse.map(x => Math.max(x.week, x.open)));
  const prWeek = prCleared.filter(t => new Date(t.done_at) >= Date.now() - 7 * DAY).length;
  const renderPulse = () => (
    <div key="pulse" data-pulse="" className="pt-rise br-card" style={{ animationDelay: "470ms", minWidth: 0, height: compact ? "auto" : COLH, borderRadius: R.lg, overflow: "hidden", position: "relative",
      display: "flex", flexDirection: "column", color: "#fff", boxShadow: T.shadow, border: "1px solid rgba(255,255,255,0.08)",
      background: `radial-gradient(420px 260px at 100% 0%, ${BRAND.gold}30, transparent 60%), radial-gradient(380px 260px at 0% 100%, ${DATA.violet}38, transparent 60%), linear-gradient(150deg, ${BRAND.navyDeep}, ${BRAND.navy})` }}>
      <div style={{ padding: "16px 16px 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", background: `${BRAND.gold}2e`, border: `1px solid ${BRAND.gold}66` }}><Activity size={17} color={BRAND.gold} /></span>
        <div><div style={{ ...TYPE.h3, fontSize: 15 }}>Team pulse</div><div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.65)" }}>Completed in the last 7 days · open now</div></div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "6px 16px" }} className="pmo-scroll">
        {pulse.map((x, i) => (
          <div key={x.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800,
              background: x.m.kind === "member" ? `linear-gradient(140deg, ${x.m.color}, ${x.m.color}99)` : `${x.m.color}33` }}>
              {x.m.kind === "member" ? initials(x.m.label) : <ListTodo size={14} color="#fff" />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...TYPE.caption, fontWeight: 700 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.m.kind === "member" ? short(x.key) : "PMO To-Do"}</span>
                <span style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{x.week} done · {x.open} open{x.overdue ? <b style={{ color: "#ff9b9b" }}> · {x.overdue} late</b> : null}</span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 99, background: "rgba(255,255,255,0.1)", marginTop: 6, overflow: "hidden" }}>
                <div className="pt-grow" style={{ position: "absolute", inset: 0, width: `${(x.open / pulseMax) * 100}%`, background: `${x.m.color}55`, borderRadius: 99 }} />
                <div className="pt-grow" style={{ position: "absolute", inset: 0, width: `${(x.week / pulseMax) * 100}%`, background: x.m.color, borderRadius: 99, animationDelay: "200ms" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ margin: "6px 16px 16px", padding: "12px 14px", borderRadius: R.md, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...TYPE.label, fontSize: 9.5, color: BRAND.gold }}>PRs cleared</span>
          <span style={{ ...TYPE.caption, color: "rgba(255,255,255,0.7)" }}>{prCleared.length} in all · {prWeek} this week</span>
        </div>
        <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", marginTop: 8, background: "rgba(255,255,255,0.1)" }}>
          {madeBy.filter(x => x.n).map(x => <div key={x.key} className="pt-grow" title={`${listMeta[x.key].label}: ${x.n}`} style={{ width: `${(x.n / Math.max(1, prCleared.length)) * 100}%`, background: listMeta[x.key].color }} />)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, ...TYPE.caption, fontSize: 10.5, color: "rgba(255,255,255,0.8)" }}>
          {madeBy.map(x => <span key={x.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: listMeta[x.key].color }} />{short(x.key)} {x.n}</span>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="pmo-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", background: T.page }}>
    <div data-page="pmo-tasks" style={{ padding: compact ? SP.md : SP.xl, paddingTop: compact ? SP.sm : SP.md, display: "flex", flexDirection: "column", gap: compact ? SP.md : SP.lg }}>
      <style>{`
        @keyframes ptRise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        @keyframes ptGlow { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        @keyframes ptPop { 0% { transform: scale(1); background: ${DATA.positive}33 } 40% { transform: scale(1.02) } 100% { transform: scale(1) } }
        @keyframes ptFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes ptGrow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes ptToast { from { opacity: 0; transform: translate(-50%, 16px) } to { opacity: 1; transform: translate(-50%, 0) } }
        @keyframes ptSpin { to { transform: rotate(360deg) } }
        .pt-rise { animation: ptRise 600ms cubic-bezier(.2,.7,.2,1) both }
        .pt-pop { animation: ptPop 900ms ease-out }
        .pt-float { animation: ptFloat 3.2s ease-in-out infinite }
        .pt-grow { transform-origin: left; animation: ptGrow 1100ms cubic-bezier(.2,.7,.2,1) both }
        .br-card { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.fast} }
        .br-card:hover { transform: translateY(-3px); box-shadow: ${T.shadowLg}; }
        .br-card:hover .pt-avatar { transform: rotate(-6deg) scale(1.06) }
        .pt-avatar { transition: transform ${MOTION.fast} }
        .pt-pr { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.fast} }
        .pt-pr:hover { transform: translateY(-3px); box-shadow: ${T.shadowLg}; border-color: ${T.borderStrong} !important }
        .pt-pr .pt-pr-glow { transition: transform 600ms ease; }
        .pt-pr:hover .pt-pr-glow { transform: scale(1.6) }
        .pt-row { transition: background ${MOTION.fast}, transform ${MOTION.fast} }
        .pt-row:hover { background: ${T.rowHover} !important; transform: translateX(2px) }
        .pt-act { opacity: 0; transition: opacity ${MOTION.fast} }
        .pt-row:hover .pt-act, .pt-pr:hover .pt-act, .pt-act:focus-within { opacity: 1 }
        @media (hover: none) { .pt-act { opacity: 1 } }
        .pt-tick { transition: transform ${MOTION.fast}, background ${MOTION.fast}, box-shadow ${MOTION.fast} }
        .pt-tick .pt-tick-hint { opacity: 0; transition: opacity ${MOTION.fast} }
        .pt-tick:hover { transform: scale(1.12); box-shadow: 0 0 0 4px color-mix(in srgb, var(--tc) 22%, transparent) }
        .pt-tick:hover .pt-tick-hint { opacity: .9 }
        .pt-link:hover span:last-child { text-decoration: underline }
        .pt-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
        .pt-add { transition: background ${MOTION.fast}, border-style ${MOTION.fast}, transform ${MOTION.fast} }
        .pt-add:hover { background: color-mix(in srgb, var(--ac) 18%, transparent) !important; border-style: solid !important }
        .pt-chip { transition: all ${MOTION.fast} }
        .pt-chip:hover { transform: translateY(-1px) }
        .pt-maker { transition: transform ${MOTION.fast}, background ${MOTION.fast} }
        .pt-maker:hover { transform: translateY(-2px); background: rgba(255,255,255,0.14) !important }
        @media (prefers-reduced-motion: reduce) { .pt-rise, .pt-glow, .pt-pop, .pt-float, .pt-grow { animation: none !important } .br-card:hover, .pt-pr:hover, .pt-row:hover, .pt-tick:hover { transform: none } }
      `}</style>

      {/* Hero */}
      <div data-pt="hero" style={{ position: "relative", overflow: "hidden", borderRadius: R.xl, padding: compact ? SP.lg : SP.xl, color: "#fff", boxShadow: T.shadowLg,
        background: `radial-gradient(900px 320px at 100% 0%, ${BRAND.gold}33, transparent 60%), radial-gradient(700px 300px at 0% 100%, ${DATA.cyan}30, transparent 60%), linear-gradient(135deg, ${BRAND.navyDeep}, ${BRAND.navy})` }}>
        <svg aria-hidden="true" width="420" height="420" viewBox="0 0 420 420" style={{ position: "absolute", right: -120, top: -150, opacity: 0.35 }}>
          {[200, 160, 120].map((r, i) => <circle key={r} className="pt-glow" cx="210" cy="210" r={r} fill="none" stroke={BRAND.gold} strokeOpacity={0.5 - i * 0.12}
            strokeDasharray={i === 1 ? "4 8" : "none"} style={{ animation: `ptGlow ${3 + i}s ease-in-out infinite` }} />)}
        </svg>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: SP.lg }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, color: BRAND.gold, letterSpacing: 1.4 }}><Target size={13} /> PMO Goals</div>
            <div style={{ ...TYPE.display, fontSize: compact ? 24 : 34, marginTop: 6, lineHeight: 1.12 }}>
              <CountUp value={k.open} /> open task{k.open === 1 ? "" : "s"} across the team
            </div>
            <div style={{ ...TYPE.bodySm, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
              {k.prs} pending PR{k.prs === 1 ? "" : "s"}{k.prs ? ` · oldest waiting ${oldest} day${oldest === 1 ? "" : "s"}` : ""} · {k.done} task{k.done === 1 ? "" : "s"} completed so far
            </div>
          </div>
          {!compact && <HeroRing rate={k.rate} done={k.done} total={k.total} />}
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: compact ? SP.sm : SP.md, marginTop: SP.lg }}>
          <Kpi compact={compact} i={0} icon={ListTodo} color={BRAND.blueBright} label="Open tasks" value={<CountUp value={k.open} />} sub={`of ${k.total} task${k.total === 1 ? "" : "s"} in all lists`} meter={k.total ? k.open / k.total : 0} />
          <Kpi compact={compact} i={1} icon={FileWarning} color={DATA.danger} label="Pending PRs" value={<CountUp value={k.prs} />} sub={`${prCleared.length} cleared so far`} meter={prAll.length ? k.prs / prAll.length : 0} />
          <Kpi compact={compact} i={2} icon={CircleCheckBig} color={DATA.positive} label="Completed this week" value={<CountUp value={k.doneWeek} />} sub={`${k.done} completed in total`} meter={k.done ? k.doneWeek / k.done : 0} />
          <Kpi compact={compact} i={3} icon={AlarmClock} color={BRAND.gold} label="Overdue" value={<CountUp value={k.overdue} />} sub={k.overdue ? "past their due date" : "nothing past its due date"} meter={k.open ? k.overdue / k.open : 0} />
        </div>
      </div>

      {/* Toolbar: filters + search */}
      <div data-pt="toolbar" style={{ position: "sticky", top: 0, zIndex: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.sm, padding: compact ? "8px 0" : "10px 12px",
        margin: compact ? 0 : "0 -12px", borderRadius: R.lg, background: T.mode === "dark" ? "rgba(10,22,40,0.78)" : "rgba(246,248,252,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div role="group" aria-label="Show" style={{ display: "flex", gap: 6, flexWrap: compact ? "nowrap" : "wrap", overflowX: compact ? "auto" : "visible", flex: compact ? "1 1 100%" : "0 1 auto", paddingBottom: compact ? 2 : 0 }}>
          {FILTERS.map(f => {
            const on = filter === f.key, n = fCount(f), c = f.c || BRAND.blueBright;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={on} data-filter={f.key} className="pmo-focusable pt-chip"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: R.pill, cursor: "pointer", whiteSpace: "nowrap", fontFamily: TYPE.body.fontFamily,
                  ...TYPE.caption, fontWeight: 700, border: `1px solid ${on ? c : T.border}`, background: on ? c : T.card, color: on ? "#fff" : T.textSoft, boxShadow: on ? `0 6px 16px -8px ${c}` : "none" }}>
                {f.icon && <f.icon size={13} />}{f.label}
                <span style={{ minWidth: 18, padding: "0 6px", borderRadius: 99, background: on ? "rgba(255,255,255,0.25)" : `${c}1c`, color: on ? "#fff" : T.textOf(c), fontSize: 10.5, textAlign: "center" }}>{n}</span>
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ width: compact ? "100%" : 300 }}>
          <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search tasks, notes, projects…" full />
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

      {/* Pending PRs */}
      <section data-list="pending_pr" className="pt-rise" style={{ animationDelay: "80ms", position: "relative", borderRadius: R.xl, overflow: "hidden", border: `1px solid ${T.border}`, boxShadow: T.shadow,
        background: T.mode === "dark" ? `linear-gradient(180deg, ${DATA.danger}14, ${T.card} 160px)` : `linear-gradient(180deg, ${DATA.danger}0f, ${T.card} 160px)` }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${DATA.danger}, ${BRAND.gold}, ${DATA.danger}55)` }} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SP.md, padding: compact ? "14px 14px 4px" : "18px 20px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ position: "relative", width: 48, height: 48, borderRadius: 16, flexShrink: 0, display: "grid", placeItems: "center", background: `linear-gradient(140deg, ${DATA.danger}, ${DATA.danger}aa)`, boxShadow: `0 10px 22px -10px ${DATA.danger}` }}>
              <FileWarning size={22} color="#fff" />
              {k.prs > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 99, background: BRAND.gold, color: BRAND.navyDeep,
                fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", border: `2px solid ${T.card}` }}>{k.prs}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...TYPE.h2, fontSize: compact ? 17 : 19, color: T.text }}>Pending PRs</div>
              <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>
                {k.prs ? `${k.prs} waiting · oldest ${oldest} day${oldest === 1 ? "" : "s"} · tick one when its PR is made` : "No PRs waiting"}
              </div>
            </div>
          </div>
          {!compact && prCleared.length > 0 && (
            <div data-pr-leaders style={{ display: "flex", gap: 6, padding: 5, borderRadius: R.lg, background: T.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(10,30,60,0.04)", border: `1px solid ${T.border}` }}>
              {madeBy.map(x => { const m = listMeta[x.key]; return (
                <button key={x.key} onClick={() => setHistory({ maker: x.key })} title={`PRs made by ${m.label}`} className="pmo-focusable pt-chip"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 5px", borderRadius: R.md, border: "none", background: "transparent", cursor: "pointer", fontFamily: TYPE.body.fontFamily }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800, color: "#fff", background: `linear-gradient(140deg, ${m.color}, ${m.color}99)` }}>{initials(m.label)}</span>
                  <span style={{ textAlign: "left" }}>
                    <span style={{ display: "block", ...TYPE.caption, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>{short(x.key)} <span style={{ color: T.textOf(m.color) }}>{x.n}</span></span>
                    <span style={{ display: "block", width: 54, height: 4, borderRadius: 99, background: T.border, marginTop: 4, overflow: "hidden" }}>
                      <span className="pt-grow" style={{ display: "block", height: "100%", width: `${(x.n / madeMax) * 100}%`, background: m.color }} /></span>
                  </span>
                </button>); })}
            </div>
          )}
          <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
            <Button T={T} size="sm" icon={History} onClick={() => setHistory({ maker: null })} data-pr-history>PR history · {prCleared.length}</Button>
            <Button T={T} size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ list: "pending_pr" })} data-add="pending_pr" aria-label="Add a pending PR">Add PR</Button>
          </div>
        </div>
        <div style={{ padding: compact ? "10px 14px 14px" : "12px 20px 20px" }}>
          {prOpen.length === 0 ? (
            <div data-empty style={{ display: "flex", alignItems: "center", gap: SP.md, padding: compact ? "14px" : "18px 20px", borderRadius: R.lg, border: `1.5px dashed ${T.border}` }}>
              <div className="pt-float" style={{ width: 52, height: 52, borderRadius: 18, flexShrink: 0, display: "grid", placeItems: "center", background: `radial-gradient(circle at 30% 30%, ${DATA.positive}44, ${DATA.positive}12)` }}>
                {q.trim() || filter !== "all" ? <Search size={20} color={DATA.positive} /> : <Trophy size={22} color={DATA.positive} />}</div>
              <div>
                <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{q.trim() || filter !== "all" ? "No pending PR fits the search or filter" : "No pending PRs. Well done."}</div>
                <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>{q.trim() || filter !== "all" ? "Clear the search or choose All." : "Add one with Add PR and pick its project. Cleared PRs are in PR history."}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: compact ? SP.sm : SP.md, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {prShown.map(renderPr)}
            </div>
          )}
          {prOpen.length > PR_CAP && (
            <button onClick={() => setPrMore(v => !v)} className="pmo-focusable" data-pr-more
              style={{ display: "flex", alignItems: "center", gap: 6, margin: "12px auto 0", padding: "6px 14px", borderRadius: R.pill, border: `1px solid ${T.border}`, background: T.card,
                cursor: "pointer", ...TYPE.caption, fontWeight: 700, color: T.textSoft, fontFamily: TYPE.body.fontFamily }}>
              {prMore ? <><ChevronDown size={13} style={{ transform: "rotate(180deg)" }} /> Show fewer</> : <><ChevronDown size={13} /> Show all {prOpen.length} pending PRs</>}
            </button>
          )}
        </div>
      </section>

      {/* Team board */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 2px 10px" }}>
          <Users size={16} color={T.textOf(BRAND.blueBright)} style={{ alignSelf: "center" }} />
          <span style={{ ...TYPE.h2, fontSize: compact ? 17 : 19, color: T.text }}>Team board</span>
          <span style={{ ...TYPE.caption, color: T.muted }}>PMO To-Do and each member's tasks</span>
        </div>
        <div data-board style={{ display: "grid", gap: compact ? SP.sm : SP.md, gridTemplateColumns: `repeat(${boardCols}, minmax(0,1fr))` }}>
          {boardLists.map((l, i) => renderCol(l, i))}
          {renderPulse()}
        </div>
      </div>

      {/* Insights */}
      {k.total > 0 ? (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 2px 10px" }}>
            <BarChart3 size={16} color={T.textOf(BRAND.gold)} style={{ alignSelf: "center" }} />
            <span style={{ ...TYPE.h2, fontSize: compact ? 17 : 19, color: T.text }}>Insights</span>
            <span style={{ ...TYPE.caption, color: T.muted }}>Hover for the figures</span>
          </div>
        <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(340px, 1fr))" }}>
          {card(BRAND.blueBright, BarChart3, "Open and completed by list", "Each person and list",
            <div style={{ height: CH }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byList} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 0 }} barCategoryGap={8} maxBarSize={18}>
                  <CartesianGrid stroke={T.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} />
                  <YAxis type="category" dataKey="name" width={compact ? 112 : 128} tickLine={false} axisLine={false}
                    tick={({ x, y, payload }) => <text x={x} y={y} dy={4} textAnchor="end" style={{ ...axis(T), fontSize: 11, fill: T.textSoft }}>{(() => { const v = String(payload.value), n = compact ? 16 : 20; return v.length > n ? v.slice(0, n - 1) + "…" : v; })()}</text>} />
                  <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <Tip {...p} T={T} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                  <Bar dataKey="open" name="Open" stackId="s" fill={BRAND.blueBright} {...A(150, 900)}>
                    {byList.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.95} />)}
                  </Bar>
                  <Bar dataKey="done" name="Completed" stackId="s" fill={`${DATA.positive}`} fillOpacity={0.45} radius={[0, 5, 5, 0]} {...A(500, 900)} />
                </BarChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "by-list" })}
          {card(DATA.positive, TrendingUp, "Added and completed per week", "Last 10 weeks, weeks start on Monday",
            <div style={{ height: CH }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeks} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ptDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={DATA.positive} stopOpacity={0.5} /><stop offset="100%" stopColor={DATA.positive} stopOpacity={0} /></linearGradient>
                    <linearGradient id="ptAdd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND.gold} stopOpacity={0.35} /><stop offset="100%" stopColor={BRAND.gold} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke={T.border} vertical={false} />
                  <XAxis dataKey="name" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} interval="preserveStartEnd" minTickGap={14} />
                  <YAxis allowDecimals={false} tick={axis(T)} tickLine={false} axisLine={false} />
                  <Tooltip content={(p) => <Tip {...p} T={T} label={p.label ? `Week of ${p.label}` : ""} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                  <Area type="monotone" dataKey="added" name="Added" stroke={BRAND.gold} strokeWidth={2} fill="url(#ptAdd)" {...A(150, 1100)} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke={DATA.positive} strokeWidth={2.5} fill="url(#ptDone)" {...A(400, 1100)} />
                </AreaChart>
              </ResponsiveContainer>
            </div>, { "data-chart": "weeks" })}
          {card(DATA.warning, PieIcon, "Open tasks by due date", "Overdue · due in the next 7 days · later · no date",
            <div style={{ position: "relative", height: CH }}>
              {dueSplit.length ? (<>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dueSplit} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="84%" paddingAngle={dueSplit.length > 1 ? 3 : 0} cornerRadius={6} stroke="none"
                      startAngle={90} endAngle={-270} {...A(150, 1200)}>
                      {dueSplit.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip content={(p) => <Tip {...p} T={T} />} />
                    <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: T.textSoft }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: "0 0 28px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ ...TYPE.metric, fontSize: 26, color: T.text }}>{k.open}</div>
                  <div style={{ ...TYPE.label, color: T.muted }}>open</div>
                </div>
              </>) : <div style={{ height: "100%", display: "grid", placeItems: "center", ...TYPE.bodySm, color: T.muted }}>Everything is completed.</div>}
            </div>, { "data-chart": "due" })}
        </div>
        </div>
      ) : (
        <Section T={T}><EmptyState T={T} icon={Sparkles} title="No tasks yet" message="Add the first task to any list above. The charts fill in as tasks are added and completed." /></Section>
      )}

      {toast && (
        <div role="status" data-toast style={{ position: "fixed", left: "50%", bottom: compact ? 84 : 28, zIndex: 60, transform: "translateX(-50%)", animation: "ptToast 380ms cubic-bezier(.2,.7,.2,1) both",
          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 14px", borderRadius: R.lg, background: BRAND.navyDeep, color: "#fff", boxShadow: "0 18px 40px -14px rgba(0,0,0,0.55)",
          border: `1px solid ${BRAND.gold}55`, maxWidth: "calc(100vw - 32px)" }}>
          <span style={{ width: 28, height: 28, borderRadius: 99, display: "grid", placeItems: "center", background: DATA.positive, flexShrink: 0 }}><Check size={15} color="#fff" strokeWidth={3} /></span>
          <span style={{ ...TYPE.bodySm, lineHeight: 1.35 }}>{toast}</span>
          <button onClick={() => { setToast(null); setHistory({ maker: null }); }} className="pmo-focusable"
            style={{ marginLeft: 4, padding: "5px 10px", borderRadius: R.md, border: `1px solid ${BRAND.gold}88`, background: "transparent", color: BRAND.gold, cursor: "pointer", ...TYPE.caption, fontWeight: 800, whiteSpace: "nowrap", fontFamily: TYPE.body.fontFamily }}>
            PR history</button>
        </div>
      )}

      {edit && <TaskEditor T={T} compact={compact} task={edit} listMeta={listMeta} past={past} supa={supa} tok={tok}
        projects={projects.filter(p => Number(p.amount_released) > 0 || p.id === edit.project_id)}
        onClose={() => setEdit(null)} onSaved={(row, isNew) => { setEdit(null); setRows(rs => isNew ? [...rs, row] : rs.map(x => x.id === row.id ? row : x)); }} />}
      {prDone && <PrMadeByModal T={T} compact={compact} task={prDone} proj={projOf(prDone)} listMeta={listMeta}
        onClose={() => setPrDone(null)} onConfirm={async (key) => {
          const t = prDone; setPrDone(null);
          const ok = await patch(t, { done: true, pr_made_by: key });
          if (ok) { const p = projOf(t); flash(`PR cleared${p ? ` for ${p.name}` : ""} · made by ${listMeta[key].label}`); }
        }} />}
      {history && <PrHistoryModal T={T} session={session} supa={supa} compact={compact} tasks={prCleared} listMeta={listMeta} projOf={projOf} people={people} initialMaker={history.maker}
        onClose={() => setHistory(null)}
        onOpen={(t) => { setHistory(null); t.project_id ? onOpenProject?.(t.project_id) : t.past_project_id ? onOpenPast?.(t.past_project_id) : null; }}
        onReopen={(t) => patch(t, { done: false })} />}
      {confirmDel && (
        <Modal T={T} isMobile={compact} onClose={() => setConfirmDel(null)} icon={Trash2} width={460} title="Delete this task?" sub={listMeta[confirmDel.list]?.label}
          footer={<div style={{ display: "flex", gap: SP.sm, justifyContent: "flex-end", width: "100%" }}>
            <Button T={T} onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button T={T} variant="danger" icon={Trash2} data-confirm-delete onClick={() => { const t = confirmDel; setConfirmDel(null); patch(t, { removed: true }); }}>Delete</Button>
          </div>}>
          <div style={{ ...TYPE.bodySm, color: T.text, overflowWrap: "anywhere" }}>{confirmDel.title}</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 8 }}>It disappears from the list. The Activity Log keeps a record that it was deleted.</div>
        </Modal>
      )}
    </div>
    </div>
  );
}

// Big completion ring in the hero.
function HeroRing({ rate, done, total }) {
  const size = 132, r = 54, c = 2 * Math.PI * r, p = rate ?? 0;
  const v = useCount(p * 100, 1200);
  return (
    <div data-hero-ring style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px 10px 10px", borderRadius: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${Math.round(p * 100)}% of tasks completed`}>
        <defs><linearGradient id="ptHero" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={BRAND.gold} /><stop offset="100%" stopColor={DATA.positive} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={11} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ptHero)" strokeWidth={11} strokeLinecap="round"
          strokeDasharray={`${c * v / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="46%" dominantBaseline="central" textAnchor="middle" style={{ fontSize: 28, fontWeight: 800, fill: "#fff", fontFamily: TYPE.display.fontFamily }}>{rate === null ? "—" : `${Math.round(v)}%`}</text>
        <text x="50%" y="66%" dominantBaseline="central" textAnchor="middle" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, fill: "rgba(255,255,255,0.65)", fontFamily: TYPE.body.fontFamily }}>COMPLETED</text>
      </svg>
      <div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
        <div style={{ ...TYPE.label, fontSize: 9.5, color: BRAND.gold }}>Completion</div>
        <div><b style={{ color: "#fff" }}>{done}</b> completed</div>
        <div><b style={{ color: "#fff" }}>{total - done}</b> still open</div>
      </div>
    </div>
  );
}

// PR history (PMO, 12 Nov 2026): every cleared PR, who made it and how long it waited.
function PrHistoryModal({ T, session, supa, compact, tasks, listMeta, projOf, people, initialMaker, onClose, onOpen, onReopen }) {
  // PR documents (13 Nov 2026): CS and PR released email per cleared PR; the window opens on top of this one.
  const [docs, setDocs] = useState(new Map());
  const [docsFor, setDocsFor] = useState(null);
  const loadDocs = useCallback(() => { if (session && supa) loadPrDocs(supa, session.access_token, tasks.map(t => t.id)).then(setDocs).catch(() => {}); }, [supa, session, tasks]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  const [maker, setMaker] = useState(initialMaker || null);
  const [q, setQ] = useState("");
  const [confirmReopen, setConfirmReopen] = useState(null);
  const sorted = useMemo(() => [...tasks].sort((a, b) => new Date(b.done_at) - new Date(a.done_at)), [tasks]);
  const waited = (t) => (new Date(t.done_at) - new Date(t.created_at)) / DAY;
  const stats = [...PR_MAKERS, "none"].map(key => {
    const ts = sorted.filter(t => key === "none" ? !t.pr_made_by : t.pr_made_by === key);
    return { key, n: ts.length, avg: ts.length ? ts.reduce((s, t) => s + waited(t), 0) / ts.length : null };
  }).filter(s => s.key !== "none" || s.n);
  const max = Math.max(1, ...stats.map(s => s.n));
  const list = sorted.filter(t => (!maker || (maker === "none" ? !t.pr_made_by : t.pr_made_by === maker)) && (() => {
    const s = q.trim().toLowerCase(); if (!s) return true; const p = projOf(t);
    return [t.title, t.note, p?.name, p?.code, listMeta[t.pr_made_by]?.label].some(x => String(x || "").toLowerCase().includes(s));
  })());
  const groups = [];
  for (const t of list) {
    const key = fmtMonth(t.done_at);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(t);
  }
  const avgAll = sorted.length ? sorted.reduce((s, t) => s + waited(t), 0) / sorted.length : null;
  const days = (v) => v === null ? "—" : v < 1 ? "under a day" : `${v.toFixed(v < 10 ? 1 : 0)} days`;
  const mOf = (key) => key === "none" ? { label: "Not recorded", title: "Before names were asked", color: DATA.neutral, kind: "none" } : listMeta[key];
  return (
    <Modal T={T} isMobile={compact} onClose={onClose} icon={History} width={860} title="PR history"
      sub={`${sorted.length} PR${sorted.length === 1 ? "" : "s"} cleared · average wait ${days(avgAll)}`}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}><Button T={T} onClick={onClose}>Close</Button></div>}>
      <div data-pr-history-modal="">
        <div style={{ display: "grid", gap: SP.sm, gridTemplateColumns: compact ? "1fr 1fr" : `repeat(${stats.length + 1}, minmax(0,1fr))` }}>
          <button onClick={() => setMaker(null)} aria-pressed={!maker} data-hist-maker="all" className="pmo-focusable pt-chip"
            style={{ textAlign: "left", padding: "12px 14px", borderRadius: R.lg, cursor: "pointer", fontFamily: TYPE.body.fontFamily, color: "#fff", border: `1.5px solid ${!maker ? BRAND.gold : "transparent"}`,
              background: `radial-gradient(220px 120px at 100% 0%, ${BRAND.gold}38, transparent 60%), linear-gradient(140deg, ${BRAND.navyDeep}, ${BRAND.navy})` }}>
            <div style={{ ...TYPE.label, fontSize: 9.5, color: BRAND.gold }}>All cleared</div>
            <div style={{ ...TYPE.display, fontSize: 28, marginTop: 4, lineHeight: 1 }}>{sorted.length}</div>
            <div style={{ ...TYPE.caption, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>avg wait {days(avgAll)}</div>
          </button>
          {stats.map(s => { const m = mOf(s.key), on = maker === s.key; return (
            <button key={s.key} onClick={() => setMaker(on ? null : s.key)} aria-pressed={on} data-hist-maker={s.key} className="pmo-focusable pt-chip"
              style={{ textAlign: "left", padding: "12px 14px", borderRadius: R.lg, cursor: "pointer", fontFamily: TYPE.body.fontFamily, minWidth: 0,
                border: `1.5px solid ${on ? m.color : T.border}`, background: on ? `linear-gradient(140deg, ${m.color}2a, ${T.surface} 80%)` : T.surface, boxShadow: on ? `0 10px 24px -14px ${m.color}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800, color: "#fff",
                  background: s.key === "none" ? DATA.neutral : `linear-gradient(140deg, ${m.color}, ${m.color}99)` }}>{s.key === "none" ? "?" : initials(m.label)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", ...TYPE.caption, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.key === "none" ? m.label : String(m.label).replace(/^(Mr|Mrs|Ms|Engr|Dr)\.?\s+/i, "").split(" ")[0]}</span>
                  <span style={{ display: "block", ...TYPE.caption, fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                <span style={{ ...TYPE.metric, fontSize: 24, color: T.textOf(m.color), lineHeight: 1 }}>{s.n}</span>
                <span style={{ ...TYPE.caption, color: T.muted }}>PR{s.n === 1 ? "" : "s"}</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: T.border, marginTop: 8, overflow: "hidden" }}>
                <div className="pt-grow" style={{ height: "100%", width: `${(s.n / max) * 100}%`, background: m.color, borderRadius: 99, transformOrigin: "left", animation: "ptGrow 900ms cubic-bezier(.2,.7,.2,1) both" }} /></div>
              <div style={{ ...TYPE.caption, fontSize: 10, color: T.dim, marginTop: 6 }}>avg wait {days(s.avg)}</div>
            </button>); })}
        </div>
        <div style={{ marginTop: SP.md }}>
          <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search projects, notes…" full />
        </div>
        {list.length === 0 ? (
          <div style={{ padding: "28px 8px", textAlign: "center", ...TYPE.bodySm, color: T.muted }}>
            {sorted.length ? "No cleared PR fits the search or the person chosen." : "No PR has been cleared yet. Tick a pending PR when it is made and it appears here."}</div>
        ) : groups.map(g => (
          <div key={g.key} style={{ marginTop: SP.lg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ ...TYPE.label, fontSize: 10, color: T.textOf(BRAND.gold) }}>{g.key}</span>
              <span style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ ...TYPE.caption, color: T.muted }}>{g.items.length} PR{g.items.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ position: "relative", paddingLeft: 18 }}>
              <span aria-hidden="true" style={{ position: "absolute", left: 6, top: 6, bottom: 6, width: 2, borderRadius: 2, background: `linear-gradient(180deg, ${BRAND.gold}88, ${T.border})` }} />
              {g.items.map(t => {
                const p = projOf(t), m = mOf(t.pr_made_by || "none"), doneBy = people[t.done_by];
                return (
                  <div key={t.id} data-hist-row={t.id} className="pt-row" style={{ position: "relative", display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", marginTop: 6,
                    borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface }}>
                    <span aria-hidden="true" style={{ position: "absolute", left: -17, top: 18, width: 10, height: 10, borderRadius: 99, background: m.color, border: `2px solid ${T.card}` }} />
                    <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 800, color: "#fff",
                      background: m.kind === "none" ? DATA.neutral : `linear-gradient(140deg, ${m.color}, ${m.color}99)` }}>{m.kind === "none" ? "?" : initials(m.label)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {p ? (
                        <button onClick={() => onOpen(t)} className="pmo-focusable pt-link" style={{ padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                          {p.code && p.code !== "-" && <span style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 10.5, color: T.muted, marginRight: 6 }}>{p.code}</span>}
                          <span style={{ ...TYPE.bodySm, fontWeight: 700, color: T.textOf(BRAND.blueBright), overflowWrap: "anywhere" }}>{p.name}</span>
                        </button>
                      ) : <span style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{t.title}</span>}
                      <div data-hist-by style={{ ...TYPE.caption, color: T.textOf(m.color), fontWeight: 700, marginTop: 3 }}>
                        {m.kind === "none" ? "Who made it was not recorded" : `PR made by ${m.label} · ${m.title}`}</div>
                      {t.note && <div style={{ ...TYPE.caption, color: T.textSoft, marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.note}</div>}
                      <div style={{ ...TYPE.caption, fontSize: 10.5, color: T.dim, marginTop: 4 }}>
                        Cleared {fmtStamp(t.done_at)}{doneBy ? ` · ticked by ${doneBy}` : ""} · added {fmtDay(t.created_at)}
                      </div>
                      {session && (() => {
                        const ds = docs.get(t.id) || [], cs = ds.find(d => d.kind === "cs"), mail = ds.find(d => d.kind === "release_email");
                        const b = (key, c, Icon, label, has) => (
                          <button key={key} onClick={() => setDocsFor(t)} data-hist-doc={key} className="pmo-focusable pt-chip"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: R.pill, cursor: "pointer", fontFamily: TYPE.body.fontFamily,
                              ...TYPE.caption, fontSize: 10.5, fontWeight: 700, border: has ? `1px solid ${c}66` : `1px dashed ${c}88`, background: has ? `${c}1c` : "transparent", color: T.textOf(c) }}>
                            {has ? <Check size={11} /> : <Plus size={11} />}<Icon size={11} /> {label}</button>);
                        return (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                            {b("cs", DATA.violet, FileSpreadsheet, cs ? (cs.total_amount != null ? `CS · PKR ${Number(cs.total_amount).toLocaleString("en-US")}` : "CS added") : "Add CS", !!cs)}
                            {b("release_email", DATA.positive, MailCheck, mail ? (mail.released_on ? `Released ${fmtDay(mail.released_on)}` : "Release email added") : "Add release email", !!mail)}
                          </div>);
                      })()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                      <Chip T={T} c={waited(t) >= 14 ? DATA.danger : waited(t) >= 7 ? DATA.warning : DATA.positive}><Hourglass size={10} /> {took(t.created_at, t.done_at)}</Chip>
                      <button onClick={() => setConfirmReopen(t)} className="pmo-focusable pt-act" data-hist-reopen
                        style={{ padding: "3px 8px", borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.card, color: T.muted, cursor: "pointer", ...TYPE.caption, fontSize: 10.5, fontFamily: TYPE.body.fontFamily }}>Reopen</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {docsFor && <PrDocsModal T={T} session={session} supa={supa} task={docsFor} proj={projOf(docsFor)} compact={compact}
          onClose={() => { setDocsFor(null); loadDocs(); }} />}
        {confirmReopen && (
          <div role="alertdialog" aria-label="Reopen this PR?" style={{ position: "sticky", bottom: 0, marginTop: SP.md, padding: "12px 14px", borderRadius: R.lg, display: "flex", flexWrap: "wrap",
            alignItems: "center", gap: SP.sm, background: T.card, border: `1px solid ${DATA.warning}88`, boxShadow: T.shadowLg }}>
            <span style={{ flex: "1 1 240px", ...TYPE.bodySm, color: T.text }}>Put <b>{projOf(confirmReopen)?.name || confirmReopen.title}</b> back on Pending PRs? Who made it is cleared.</span>
            <Button T={T} size="sm" onClick={() => setConfirmReopen(null)}>Cancel</Button>
            <Button T={T} size="sm" variant="primary" data-hist-reopen-confirm onClick={() => { const t = confirmReopen; setConfirmReopen(null); onReopen(t); }}>Reopen PR</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// `group`: a set of buttons, so a plain <div> (a <label> would press its first button on a stray click).
function L({ T, label, children, hint, wide, group }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: wide ? "1 / -1" : "auto", minWidth: 0 }}>
      <span style={{ ...TYPE.label, fontSize: 9.5, color: T.dim }}>{label}</span>
      {children}
      {hint && <span style={{ ...TYPE.caption, color: T.dim }}>{hint}</span>}
    </Tag>
  );
}

// "Who made this PR?" (PMO, 12 Nov 2026): asked when a Pending PR is ticked; one of the three is required.
function PrMadeByModal({ T, compact, task, proj, listMeta, onClose, onConfirm }) {
  const [pick, setPick] = useState(null);
  const G = DATA.positive;
  return (
    <Modal T={T} isMobile={compact} onClose={onClose} icon={CircleCheckBig} width={540} title="Who made this PR?"
      sub={proj ? `${proj.code && proj.code !== "-" ? `${proj.code} · ` : ""}${proj.name}` : "Pending PR"}
      footer={<div style={{ display: "flex", gap: SP.sm, alignItems: "center", width: "100%" }}>
        <span style={{ flex: 1, ...TYPE.caption, color: T.dim }}>{pick ? "" : "Select one to continue"}</span>
        <Button T={T} onClick={onClose}>Cancel</Button>
        <Button T={T} variant="primary" icon={Check} disabled={!pick} onClick={() => onConfirm(pick)} data-pr-confirm>Mark PR as done</Button>
      </div>}>
      <div data-pr-made-modal="">
        <div style={{ ...TYPE.bodySm, color: T.textSoft, lineHeight: 1.6 }}>
          This pending PR{proj ? <> for <b style={{ color: T.text }}>{proj.name}</b></> : null} is being marked as done.
          Please select the PMO team member who made the PR. It is recorded with the task and in the Activity Log.
        </div>
        <div role="radiogroup" aria-label="PR made by" style={{ display: "flex", flexDirection: "column", gap: SP.sm, marginTop: SP.lg }}>
          {PR_MAKERS.map(k => {
            const m = listMeta[k], on = pick === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setPick(k)} data-pr-maker={k} className="pmo-focusable pmo-btn"
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: R.lg, cursor: "pointer", textAlign: "left",
                  border: `1.5px solid ${on ? m.color : T.border}`, background: on ? `linear-gradient(120deg, ${m.color}26, ${T.surface} 75%)` : T.surface,
                  boxShadow: on ? `0 8px 22px -12px ${m.color}` : "none", transition: `all ${MOTION.fast}`, fontFamily: TYPE.body.fontFamily }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: "#fff",
                  background: `linear-gradient(140deg, ${m.color}, ${m.color}99)` }}>{initials(m.label)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{m.label}</span>
                  <span style={{ display: "block", ...TYPE.caption, color: T.muted, marginTop: 1 }}>{m.title}</span>
                </span>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center",
                  border: `2px solid ${on ? m.color : T.border}`, background: on ? m.color : "transparent" }}>{on && <Check size={13} color="#fff" strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// PR project picker and task editor (redesigned 12 Nov 2026, PMO: the browser's list box looked out of place).
const fmtMoneyM = (n) => { const v = Number(n || 0); return v >= 1e6 ? `PKR ${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `PKR ${Math.round(v / 1e3)}K` : v ? `PKR ${v}` : ""; };
const addDays = (n) => new Date(Date.now() + 5 * 3600000 + n * DAY).toISOString().slice(0, 10);

function ProjectPicker({ T, compact, value, onChange, projects, past }) {
  const [tab, setTab] = useState(value.startsWith("x:") ? "past" : "cur");
  const [q, setQ] = useState("");
  const [changing, setChanging] = useState(!value);
  const PR = DATA.danger;
  const cur = projects.map(p => ({ ...p, key: `p:${p.id}`, meta: [p.campus, p.amount_released ? `${fmtMoneyM(p.amount_released)} released` : null].filter(Boolean).join(" · "), where: "FY 26-27" }));
  const old = past.map(p => ({ ...p, key: `x:${p.id}`, meta: [p.campus, p.fiscal_year].filter(Boolean).join(" · "), where: "Past project" }));
  const chosen = [...cur, ...old].find(p => p.key === value);
  const s = q.trim().toLowerCase();
  const rows = (tab === "cur" ? cur : old).filter(p => !s || `${p.code || ""} ${p.name} ${p.campus || ""}`.toLowerCase().includes(s));

  if (chosen && !changing) return (
    <div data-pr-chosen="" style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: R.lg,
      background: `linear-gradient(120deg, ${PR}24, ${T.surface} 70%)`, border: `1px solid ${PR}77`, boxShadow: `0 8px 24px -14px ${PR}` }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: `linear-gradient(140deg, ${PR}, ${PR}aa)` }}>
        <FileWarning size={19} color="#fff" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {chosen.code && chosen.code !== "-" && <span style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 11, color: T.muted }}>{chosen.code}</span>}
          <span style={{ ...TYPE.caption, fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.textOf(PR) }}>{chosen.where}</span>
        </div>
        <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text, overflowWrap: "anywhere", marginTop: 1 }}>{chosen.name}</div>
        {chosen.meta && <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>{chosen.meta}</div>}
      </div>
      <Button T={T} size="sm" onClick={() => setChanging(true)} data-pr-change>Change</Button>
    </div>
  );

  const tabBtn = (k, label, n) => {
    const on = tab === k;
    return (
      <button key={k} role="tab" aria-selected={on} onClick={() => setTab(k)} data-pr-tab={k} className="pmo-focusable pmo-btn"
        style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: R.pill,
          ...TYPE.caption, fontWeight: 700, background: on ? T.card : "transparent", color: on ? T.text : T.muted, boxShadow: on ? T.shadow : "none", transition: `all ${MOTION.fast}` }}>
        {label}<span style={{ padding: "0 7px", borderRadius: R.pill, fontSize: 10.5, background: on ? `${PR}22` : T.border, color: on ? T.textOf(PR) : T.muted }}>{n}</span>
      </button>
    );
  };
  return (
    <div data-pr-picker="" style={{ borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.surface, overflow: "hidden" }}>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${T.border}` }}>
        <div role="tablist" style={{ display: "flex", gap: 4, padding: 3, borderRadius: R.pill, background: T.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(15,40,70,0.05)" }}>
          {tabBtn("cur", compact ? "FY 26-27 · released" : "FY 26-27 · budget released", cur.length)}
          {tabBtn("past", compact ? "Past · open" : "Past projects · still open", old.length)}
        </div>
        <div style={{ position: "relative" }}>
          <Search size={14} color={T.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, ID or campus…" className="pt-in" data-field="project-search" aria-label="Search projects"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 32px 9px 32px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13,
              fontFamily: TYPE.body.fontFamily, outline: "none" }} />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" className="pmo-focusable" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            border: "none", background: "none", cursor: "pointer", color: T.muted, padding: 4, display: "grid", placeItems: "center" }}><X size={13} /></button>}
        </div>
      </div>
      <div role="listbox" aria-label="Projects" data-field="project" style={{ maxHeight: compact ? 300 : 264, overflowY: "auto", padding: 6 }}>
        {rows.length === 0 && <div style={{ ...TYPE.caption, color: T.dim, padding: "18px 10px", textAlign: "center" }}>No project matches “{q}”.</div>}
        {rows.map(p => {
          const on = p.key === value;
          return (
            <button key={p.key} role="option" aria-selected={on} data-pr-option={p.key} onClick={() => { onChange(p.key); setChanging(false); setQ(""); }} className="pmo-focusable pt-opt"
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 2, borderRadius: R.md, cursor: "pointer", textAlign: "left",
                border: `1px solid ${on ? `${PR}88` : "transparent"}`, background: on ? `${PR}1a` : "transparent", color: T.text, fontFamily: TYPE.body.fontFamily }}>
              <span aria-hidden="true" style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: on ? PR : tab === "cur" ? BRAND.blueBright : DATA.violet, opacity: on ? 1 : 0.55 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  {p.code && p.code !== "-" && <span style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 10.5, color: T.muted, whiteSpace: "nowrap" }}>{p.code}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{p.name}</span>
                </span>
                {p.meta && <span style={{ display: "block", ...TYPE.caption, fontSize: 11, color: T.dim, marginTop: 1 }}>{p.meta}</span>}
              </span>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center",
                border: `2px solid ${on ? PR : T.border}`, background: on ? PR : "transparent" }}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskEditor({ T, compact, task, listMeta, projects, past, supa, tok, onClose, onSaved }) {
  const isNew = !task.id;
  const [f, setF] = useState({
    list: task.list || "pmo_todo", title: task.title || (task.list === "pending_pr" ? "Pending PR" : ""), note: task.note || "", priority: task.priority || "normal", due_date: task.due_date || "",
    proj: task.project_id ? `p:${task.project_id}` : task.past_project_id ? `x:${task.past_project_id}` : "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const isPr = f.list === "pending_pr";
  const m = listMeta[f.list] || {};
  const box = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.surface,
    color: T.text, fontSize: 13.5, fontFamily: TYPE.body.fontFamily, outline: "none", transition: `border-color ${MOTION.fast}, box-shadow ${MOTION.fast}` };
  const pickList = (v) => setF(s => ({ ...s, list: v, proj: v === "pending_pr" ? s.proj : "",
    title: v === "pending_pr" && !s.title.trim() ? "Pending PR" : (s.list === "pending_pr" && v !== "pending_pr" && s.title === "Pending PR" ? "" : s.title) }));

  const save = async () => {
    const title = isPr ? (f.title.trim() || "Pending PR") : f.title.trim();
    if (!title) return setMsg("Write the task.");
    if (isPr && !f.proj) return setMsg("Pick the project this PR is from.");
    const body = { list: f.list, title, note: f.note.trim() || null, priority: f.priority, due_date: f.due_date || null,
      project_id: isPr && f.proj.startsWith("p:") ? f.proj.slice(2) : null, past_project_id: isPr && f.proj.startsWith("x:") ? f.proj.slice(2) : null };
    setBusy(true); setMsg(null);
    try {
      const r = await supa(isNew ? "/rest/v1/pmo_tasks?select=*" : `/rest/v1/pmo_tasks?id=eq.${task.id}&select=*`,
        { method: isNew ? "POST" : "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }, tok);
      if (!Array.isArray(r) || !r[0]) throw new Error("not saved");
      onSaved(r[0], isNew);
    } catch { setBusy(false); setMsg("Could not save. Check the connection and try again."); }
  };

  const chip = (on, c, children, onClick, attrs = {}, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on} className="pmo-focusable pmo-btn" {...attrs}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: R.pill, cursor: "pointer", whiteSpace: "nowrap",
        ...TYPE.caption, fontSize: 12, fontWeight: 700, border: `1px solid ${on ? c : T.border}`, background: on ? `${c}26` : T.surface,
        color: on ? T.textOf(c) : T.textSoft, boxShadow: on ? `0 4px 14px -8px ${c}` : "none", transition: `all ${MOTION.fast}` }}>{children}</button>
  );
  const quick = [["Today", 0], ["In 3 days", 3], ["Next week", 7]];

  return (
    <Modal T={T} isMobile={compact} onClose={busy ? undefined : onClose} icon={isPr ? FileWarning : ListTodo} width={640}
      title={isNew ? (isPr ? "Add a pending PR" : "Add a task") : "Edit task"} sub={m.kind === "member" ? `${m.label} · ${m.title}` : m.label}
      footer={<div style={{ display: "flex", gap: SP.sm, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
        <span style={{ flex: 1, ...TYPE.caption, color: T.textOf(DATA.danger) }}>{msg}</span>
        <Button T={T} onClick={onClose} disabled={busy}>Cancel</Button>
        <Button T={T} variant="primary" onClick={save} loading={busy} data-save>{isNew ? (isPr ? "Add PR" : "Add task") : "Save"}</Button>
      </div>}>
      <style>{`.pt-in:focus { border-color: ${BRAND.blueBright} !important; box-shadow: 0 0 0 3px ${BRAND.blueBright}33; } .pt-opt:hover { background: ${T.rowHover} !important; }`}</style>
      <div data-pt-edit style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
        <L T={T} label="List" group>
          <div role="radiogroup" aria-label="List" data-field="list" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LISTS.map(l => {
              const lm = listMeta[l.key], on = f.list === l.key, Icon = lm.icon;
              return chip(on, l.color, <>
                {lm.kind === "member"
                  ? <span style={{ width: 18, height: 18, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800, color: "#fff", background: l.color }}>{initials(lm.label)}</span>
                  : <Icon size={13} />}
                {lm.kind === "member" ? lm.label.replace(/^(Mr|Engr)\.?\s+/i, "") : lm.label}
              </>, () => pickList(l.key), { "data-list-option": l.key, role: "radio", "aria-checked": on }, l.key);
            })}
          </div>
        </L>
        {isPr && (
          <L T={T} label="Project the PR is from" group>
            <ProjectPicker T={T} compact={compact} value={f.proj} onChange={(v) => set("proj", v)} projects={projects} past={past} />
          </L>
        )}
        <L T={T} label={isPr ? "Title" : "Task"} hint={isPr ? 'Leave as "Pending PR", or add a word or two' : null}>
          <EnhanceAI T={T} supa={supa} token={tok} compact={compact} field="title" context={isPr ? "pending_pr" : "task"} value={/^pending pr$/i.test(f.title.trim()) ? "" : f.title} onApply={(t) => set("title", t)}>
            <input value={f.title} onChange={e => set("title", e.target.value)} style={box} className="pt-in" placeholder={isPr ? "Pending PR" : "What needs doing"} autoFocus={!isPr} data-field="title" />
          </EnhanceAI>
        </L>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: SP.lg }}>
          <L T={T} label="Priority" group>
            <div role="radiogroup" aria-label="Priority" data-field="priority" style={{ display: "flex", gap: 6 }}>
              {Object.entries(PRIORITY).map(([k, p]) => chip(f.priority === k, p.color, <><Flag size={12} />{p.label}</>, () => set("priority", k), { "data-priority": k, role: "radio", "aria-checked": f.priority === k }, k))}
            </div>
          </L>
          <L T={T} label="Due date (optional)" group>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} style={{ ...box, width: 160, padding: "8px 10px" }} className="pt-in" data-field="due" />
              {quick.map(([label, n]) => chip(f.due_date === addDays(n), DATA.info, label, () => set("due_date", addDays(n)), { "data-due-quick": n }, label))}
              {f.due_date && <button onClick={() => set("due_date", "")} aria-label="Clear due date" className="pmo-focusable"
                style={{ border: "none", background: "none", cursor: "pointer", color: T.muted, padding: 4, display: "grid", placeItems: "center" }}><X size={14} /></button>}
            </div>
          </L>
        </div>
        <L T={T} label="Note (optional)">
          <EnhanceAI T={T} supa={supa} token={tok} compact={compact} field="note" context={isPr ? "pending_pr" : "task"} value={f.note} onApply={(t) => set("note", t)}>
            <textarea value={f.note} onChange={e => set("note", e.target.value)} rows={3} style={{ ...box, resize: "vertical", lineHeight: 1.5 }} className="pt-in"
              placeholder={isPr ? "e.g. PR with Procurement since 5 Nov, waiting on quotations" : "Anything worth remembering"} data-field="note" />
          </EnhanceAI>
        </L>
        {!isNew && (
          <div style={{ ...TYPE.caption, color: T.dim }}>
            Added {fmtStamp(task.created_at)}{task.done ? ` · completed ${fmtStamp(task.done_at)}` : ""}. These times are set by the portal and cannot be changed.
          </div>
        )}
      </div>
    </Modal>
  );
}
