import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  ListTodo, FileWarning, Plus, Pencil, Trash2, Check, Search, ChevronDown, ChevronRight, CalendarClock, Flag, Target,
  CircleCheckBig, AlarmClock, Percent, Sparkles, Users, BarChart3, PieChart as PieIcon, TrendingUp, X,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Input, Modal, Section, SectionTitle, EmptyState, useViewport } from "./ui.jsx";

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
const PRIORITY = { high: { label: "High", color: DATA.danger }, normal: { label: "Normal", color: DATA.neutral }, low: { label: "Low", color: DATA.info } };

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
  const wide = vp.width >= 1500;
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
    } catch { setErr("Could not save the change. Check the connection and try again."); }
    finally { setBusyId(null); }
  };
  const toggle = (t) => patch(t, { done: !t.done });

  if (rows === null) return <div style={{ flex: 1, padding: SP.xl, color: T.muted, fontSize: 13 }}>Loading goals…</div>;

  const card = (tone, icon, title, sub, body, attr) => (
    <Section T={T} tone={tone} pad={compact ? SP.md : SP.lg} {...attr} style={{ minWidth: 0 }}>
      <SectionTitle T={T} icon={icon} title={title} sub={sub} />{body}
    </Section>
  );
  const CH = 240;

  // ── one task row ───────────────────────────────────────────────────────────
  const renderTask = (t, color) => {
    const p = projOf(t), ds = dueState(t, today), pr = PRIORITY[t.priority] || PRIORITY.normal;
    const by = people[t.created_by], doneBy = people[t.done_by];
    return (
      <div key={t.id} data-task={t.id} className="pt-row" style={{ display: "flex", gap: 10, padding: "10px 4px", borderTop: `1px solid ${T.border}`, opacity: busyId === t.id ? 0.55 : 1 }}>
        <button onClick={() => toggle(t)} disabled={busyId === t.id} aria-label={t.done ? `Mark not done: ${t.title}` : `Mark done: ${t.title}`} data-tick
          className="pmo-focusable" style={{ width: 22, height: 22, marginTop: 1, borderRadius: 7, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center",
            border: `2px solid ${t.done ? DATA.positive : color}`, background: t.done ? DATA.positive : "transparent", transition: `all ${MOTION.fast}` }}>
          {t.done && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {t.list === "pending_pr" && <Chip T={T} c={t.done ? DATA.positive : DATA.danger} solid={!t.done}>{t.done ? "PR done" : "Pending PR"}</Chip>}
            {!(t.list === "pending_pr" && /^pending pr$/i.test(t.title.trim())) && (
              <span style={{ ...TYPE.bodySm, fontWeight: 600, color: t.done ? T.muted : T.text, textDecoration: t.done ? "line-through" : "none", overflowWrap: "anywhere" }}>{t.title}</span>)}
            {t.priority !== "normal" && !t.done && <Chip T={T} c={pr.color}><Flag size={10} /> {pr.label}</Chip>}
            {t.due_date && !t.done && <Chip T={T} c={ds === "overdue" ? DATA.danger : ds === "soon" ? DATA.warning : DATA.info}>
              <CalendarClock size={10} /> {ds === "overdue" ? "Overdue · " : "Due "}{fmtDay(t.due_date)}</Chip>}
          </div>
          {p && (
            <button onClick={() => t.project_id ? onOpenProject?.(t.project_id) : t.past_project_id ? onOpenPast?.(t.past_project_id) : null}
              className="pmo-focusable" style={{ display: "block", marginTop: 4, padding: 0, border: "none", background: "none", cursor: "pointer",
                ...TYPE.caption, lineHeight: 1.5, color: T.textOf(BRAND.blueBright), textAlign: "left" }}>
              {p.code && <span style={{ fontFamily: "ui-monospace,Consolas,monospace", color: T.muted, marginRight: 6, whiteSpace: "nowrap" }}>{p.code}</span>}
              <span style={{ fontWeight: t.list === "pending_pr" ? 700 : 600, fontSize: t.list === "pending_pr" ? 13 : undefined, overflowWrap: "anywhere" }}>{p.name}</span>
              <span style={{ color: T.dim, marginLeft: 6, whiteSpace: "nowrap" }}>· {t.project_id ? "FY 26-27" : "Past project"}</span>
            </button>
          )}
          {t.note && <div style={{ ...TYPE.caption, color: T.textSoft, marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.note}</div>}
          <div style={{ ...TYPE.caption, fontSize: 10.5, color: T.dim, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span data-added>Added {fmtStamp(t.created_at)}{by ? ` · ${by}` : ""}</span>
            {t.done && <span data-completed style={{ color: T.textOf(DATA.positive) }}>Completed {fmtStamp(t.done_at)}{doneBy ? ` · ${doneBy}` : ""}{t.created_at ? ` · took ${took(t.created_at, t.done_at)}` : ""}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start" }}>
          <button onClick={() => setEdit(t)} title="Edit" aria-label={`Edit ${t.title}`} className="pmo-focusable pmo-btn"
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: R.sm, padding: 5, cursor: "pointer", color: T.muted, display: "grid", placeItems: "center" }}><Pencil size={13} /></button>
          <button onClick={() => setConfirmDel(t)} title="Delete" aria-label={`Delete ${t.title}`} className="pmo-focusable pmo-btn"
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: R.sm, padding: 5, cursor: "pointer", color: T.textOf(DATA.danger), display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>
        </div>
      </div>
    );
  };

  // ── one list card ──────────────────────────────────────────────────────────
  const renderList = (l, i) => {
    const m = listMeta[l.key];
    const ts = view.filter(t => t.list === l.key);
    const open = ts.filter(t => !t.done).sort((a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : (a.due_date || "9999") > (b.due_date || "9999") ? 1 : (b.priority === "high") - (a.priority === "high"));
    const done = ts.filter(t => t.done).sort((a, b) => new Date(b.done_at) - new Date(a.done_at));
    const allIn = all.filter(t => t.list === l.key), totalDone = allIn.filter(t => t.done).length;
    const overdue = open.filter(t => dueState(t, today) === "overdue").length;
    const Icon = m.icon;
    return (
      <div key={l.key} data-list={l.key} className="pt-rise br-card" style={{ animationDelay: `${120 + i * 70}ms`, minWidth: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: R.lg,
        boxShadow: T.shadow, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${m.color}, ${m.color}55)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: compact ? "12px 14px" : "14px 18px" }}>
          {m.kind === "member" ? (
            <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: "#fff",
              background: `linear-gradient(140deg, ${m.color}, ${m.color}99)`, boxShadow: `0 6px 16px -6px ${m.color}` }}>{initials(m.label)}</div>
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", background: `${m.color}22`, border: `1px solid ${m.color}55` }}>
              <Icon size={20} color={m.color} /></div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPE.h3, fontSize: 15, color: T.text, overflowWrap: "anywhere" }}>{m.label}</div>
            <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>
              {m.kind === "member" ? m.title : l.key === "pending_pr" ? "PRs waiting, by project" : "Team-wide tasks"}
              {" · "}{allIn.length - totalDone} open{overdue ? <span style={{ color: T.textOf(DATA.danger), fontWeight: 700 }}> · {overdue} overdue</span> : null}
            </div>
          </div>
          <Ring T={T} done={totalDone} total={allIn.length} color={m.color} />
          <Button T={T} size="sm" icon={Plus} onClick={() => setEdit({ list: l.key })} data-add={l.key} aria-label={`Add to ${m.label}`}>{compact ? "" : "Add"}</Button>
        </div>
        <div style={{ padding: compact ? "0 14px 8px" : "0 18px 10px", flex: 1 }}>
          {open.length === 0 && (
            <div style={{ ...TYPE.caption, color: T.dim, padding: "12px 4px", borderTop: `1px solid ${T.border}` }}>
              {q.trim() ? "Nothing matches the search." : l.key === "pending_pr" ? "No pending PRs. Add one and pick its project." : "Nothing open. Add a task."}</div>
          )}
          {open.map(t => renderTask(t, m.color))}
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone(s => ({ ...s, [l.key]: !s[l.key] }))} className="pmo-focusable" data-show-done={l.key}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "9px 4px", border: "none", borderTop: `1px solid ${T.border}`, background: "none",
                  cursor: "pointer", ...TYPE.caption, fontWeight: 700, color: T.textOf(DATA.positive) }}>
                {showDone[l.key] ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Completed · {done.length}
              </button>
              {showDone[l.key] && done.map(t => renderTask(t, m.color))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pmo-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", background: T.page }}>
    <div data-page="pmo-tasks" style={{ padding: compact ? SP.md : SP.xl, paddingTop: compact ? SP.sm : SP.md, display: "flex", flexDirection: "column", gap: SP.md }}>
      <style>{`
        @keyframes ptRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes ptGlow { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        .pt-rise { animation: ptRise 600ms cubic-bezier(.2,.7,.2,1) both }
        .br-card { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast} }
        .br-card:hover { transform: translateY(-2px); box-shadow: ${T.shadowLg}; }
        .pt-row:hover { background: ${T.rowHover}; }
        @media (prefers-reduced-motion: reduce) { .pt-rise, .pt-glow { animation: none !important } .br-card:hover { transform: none } }
      `}</style>

      {/* Hero */}
      <div data-pt="hero" style={{ position: "relative", overflow: "hidden", borderRadius: R.xl, padding: compact ? SP.lg : SP.xl, color: "#fff", boxShadow: T.shadowLg,
        background: `radial-gradient(900px 320px at 100% 0%, ${BRAND.gold}33, transparent 60%), radial-gradient(700px 300px at 0% 100%, ${DATA.cyan}30, transparent 60%), linear-gradient(135deg, ${BRAND.navyDeep}, ${BRAND.navy})` }}>
        <svg aria-hidden="true" width="420" height="420" viewBox="0 0 420 420" style={{ position: "absolute", right: -120, top: -150, opacity: 0.35 }}>
          {[200, 160, 120].map((r, i) => <circle key={r} className="pt-glow" cx="210" cy="210" r={r} fill="none" stroke={BRAND.gold} strokeOpacity={0.5 - i * 0.12}
            strokeDasharray={i === 1 ? "4 8" : "none"} style={{ animation: `ptGlow ${3 + i}s ease-in-out infinite` }} />)}
        </svg>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: SP.md }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, color: BRAND.gold, letterSpacing: 1.4 }}><Target size={13} /> PMO Goals</div>
            <div style={{ ...TYPE.display, fontSize: compact ? 24 : 32, marginTop: 6, lineHeight: 1.15 }}>
              <CountUp value={k.open} /> open task{k.open === 1 ? "" : "s"} across the team
            </div>
            <div style={{ ...TYPE.bodySm, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
              {k.prs} pending PR{k.prs === 1 ? "" : "s"} · {k.done} completed so far
            </div>
          </div>
          <div style={{ minWidth: compact ? "100%" : 260 }}>
            <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search tasks, notes, projects…" full />
          </div>
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: compact ? SP.sm : SP.md, marginTop: SP.lg }}>
          <Kpi compact={compact} i={0} icon={ListTodo} color={BRAND.blueBright} label="Open" value={<CountUp value={k.open} />} sub={`of ${k.total} task${k.total === 1 ? "" : "s"} in all lists`} meter={k.total ? k.open / k.total : 0} />
          <Kpi compact={compact} i={1} icon={CircleCheckBig} color={DATA.positive} label="Completed this week" value={<CountUp value={k.doneWeek} />} sub={`${k.done} completed in total`} meter={k.done ? k.doneWeek / k.done : 0} />
          <Kpi compact={compact} i={2} icon={AlarmClock} color={DATA.danger} label="Overdue" value={<CountUp value={k.overdue} />} sub={k.overdue ? "past their due date" : "nothing past its due date"} meter={k.open ? k.overdue / k.open : 0} />
          <Kpi compact={compact} i={3} icon={Percent} color={BRAND.gold} label="Completion rate" value={k.rate === null ? "—" : <CountUp value={k.rate * 100} format={(v) => `${Math.round(v)}%`} />} sub="completed ÷ all tasks" meter={k.rate ?? 0} />
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

      {/* Charts */}
      {k.total > 0 ? (
        <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(340px, 1fr))" }}>
          {card(BRAND.blueBright, BarChart3, "Open and completed by list", "Each person and list · hover for the figures",
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
      ) : (
        <Section T={T}><EmptyState T={T} icon={Sparkles} title="No tasks yet" message="Add the first task to any list below. The charts fill in as tasks are added and completed." /></Section>
      )}

      {/* Lists */}
      <div style={{ display: "grid", gap: SP.md, alignItems: "start", gridTemplateColumns: compact ? "1fr" : wide ? "repeat(3, minmax(0,1fr))" : "repeat(2, minmax(0,1fr))" }}>
        {LISTS.map((l, i) => renderList(l, i))}
      </div>

      {edit && <TaskEditor T={T} compact={compact} task={edit} listMeta={listMeta} past={past} supa={supa} tok={tok}
        projects={projects.filter(p => Number(p.amount_released) > 0 || p.id === edit.project_id)}
        onClose={() => setEdit(null)} onSaved={(row, isNew) => { setEdit(null); setRows(rs => isNew ? [...rs, row] : rs.map(x => x.id === row.id ? row : x)); }} />}
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
          <input value={f.title} onChange={e => set("title", e.target.value)} style={box} className="pt-in" placeholder={isPr ? "Pending PR" : "What needs doing"} autoFocus={!isPr} data-field="title" />
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
          <textarea value={f.note} onChange={e => set("note", e.target.value)} rows={3} style={{ ...box, resize: "vertical", lineHeight: 1.5 }} className="pt-in"
            placeholder={isPr ? "e.g. PR with Procurement since 5 Nov, waiting on quotations" : "Anything worth remembering"} data-field="note" />
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
