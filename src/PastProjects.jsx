import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { History, Search, X, Send, Mail, Pencil, ChevronDown, ChevronRight,
         Clock, AlertTriangle, CheckCircle2, MessageSquare, Plus,
         Upload, Download, ArrowLeft, CalendarRange, ListTree, List } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, Input, Button, Surface, Tabs, CAN_HOVER } from "./ui.jsx";
import { ProjectTasks } from "./Tasks.jsx";

let _xlsx;
const loadXLSX = () => (_xlsx ||= import("xlsx"));

/* ═══════════════════════════════════════════════════════════════════════════
   PAST PROJECTS — follow-up on prior fiscal years

   These live in their own tables, not in `projects`, so nothing here can reach
   an FY 26-27 total, chart, deadline alert or risk matrix. The point of the page
   is chasing: what is still open, why, and when anyone last asked.

   PMO owns the record — status, reason, amounts. A project manager sees only
   their own and can post to the thread but cannot change the reason or close
   anything. Both rules are enforced in the database as well as here.
   ═══════════════════════════════════════════════════════════════════════════ */

const STATUS = {
  open:    { label:"Open",    color:DATA.danger,   note:"still unresolved" },
  closing: { label:"Closing", color:DATA.warning,  note:"nearly done" },
  closed:  { label:"Closed",  color:DATA.positive, note:"settled" },
};
const fmtM = (n) => {
  const v = parseFloat(n) || 0;
  return v >= 1e6 ? (v/1e6).toFixed(1) + "M" : v.toLocaleString("en");
};
const ago = (d) => {
  if (d == null) return "never followed up";
  if (d === 0) return "followed up today";
  if (d === 1) return "1 day since follow-up";
  return `${d} days since follow-up`;
};
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
};

/* Injected once. Keyframes are namespaced so they cannot collide, and every
   entrance animation uses `backwards` rather than `both` — `both` retains the
   final keyframe, and a retained transform or filter turns the element into a
   containing block for any position:fixed child, which silently drags modals
   and dropdowns out of place. */
let stylesIn = false;
function usePastStyles() {
  useEffect(() => {
    if (stylesIn) return;
    stylesIn = true;
    const el = document.createElement("style");
    el.textContent = `
@keyframes pastIn   { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes pastGlow { 0%,100% { opacity:.22; transform:translate3d(-4%,-3%,0) scale(1); }
                      50%      { opacity:.40; transform:translate3d(4%,3%,0) scale(1.08); } }
@keyframes pastPulse{ 0%,100% { opacity:.55; } 50% { opacity:1; } }
.past-row  { animation: pastIn .42s cubic-bezier(.22,.8,.3,1) backwards; }
.past-glow { animation: pastGlow 26s ease-in-out infinite; will-change: opacity, transform; }
.past-dot  { animation: pastPulse 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .past-row, .past-glow, .past-dot { animation: none !important; }
}`;
    document.head.appendChild(el);
  }, []);
}


/* ── Excel round-trip ────────────────────────────────────────────────────────
   The template is written with exceljs because the bundled SheetJS community
   build silently drops fills, fonts, freeze panes and data validation. Reading
   uses SheetJS, which is enough for that direction. Both are lazy imports, so
   neither reaches first load.
   ─────────────────────────────────────────────────────────────────────────── */
// The sheet the PMO keeps (6 Oct 2026): thirteen columns, no end dates.
const XL_COLS = ["Project ID","Project Name","Campus","Fiscal Year","Approved Amount",
                 "Released Amount","Project Manager","Status","Why Still Open",
                 "Budget Release Date","Project Start Date","Last Follow Up","Notes"];
// Older sheets used these names for the same columns.
const XL_ALIASES = { "project start date":["planned start"], "last follow up":["last followed up"] };
const STATUS_IN = { "open":"open", "closing":"closing", "closed":"closed" };
// "Why Still Open" is a short progress note; these two are the ones in use.
export const PROGRESS = ["In Progress", "No progress"];
// Campus names as the plan spells them; the sheet has "G7", "Al mizan ", "IIMC Al-Mizan".
const CAMPUS_FIX = { "g7":"G-7", "g 7":"G-7", "al mizan":"Al-Mizan", "almizan":"Al-Mizan",
                     "iimc al-mizan":"Al-Mizan", "iimc al mizan":"Al-Mizan", "i14":"I-14", "i 14":"I-14" };
export const fixCampus = (v) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t ? (CAMPUS_FIX[t.toLowerCase()] || t) : null;
};

const xlNum = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, "").replace(/^PKR/i, "").trim());
  return isFinite(n) ? n : undefined;                 // undefined = unreadable
};
const xlDate = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  const d = new Date(s);
  return isNaN(d) ? undefined : d.toISOString().slice(0,10);
};

function parseSheet(aoa, pmByName) {
  const errors = [], rows = [];
  const head = (aoa[0] || []).map(h => String(h ?? "").trim().toLowerCase());
  const col = (n) => {
    const k = n.toLowerCase(), i = head.indexOf(k);
    return i >= 0 ? i : (XL_ALIASES[k] || []).map(x => head.indexOf(x)).find(x => x >= 0) ?? -1;
  };
  const iName = col("Project Name");
  if (iName < 0) return { errors:["The sheet needs a 'Project Name' column."], rows:[] };
  const iId=col("Project ID"), iCam=col("Campus"), iFy=col("Fiscal Year"),
        iApp=col("Approved Amount"), iRel=col("Released Amount"), iPm=col("Project Manager"),
        iSt=col("Status"), iWhy=col("Why Still Open"), iNo=col("Notes"), iFu=col("Last Follow Up"),
        iBr=col("Budget Release Date"), iSd=col("Project Start Date");
  const cell = (row, i) => i >= 0 ? row[i] : null;
  const seen = new Map();

  aoa.slice(1).forEach((row, n) => {
    const line = n + 2;
    if (!row || row.every(c => c == null || String(c).trim() === "")) return;
    const name = String(cell(row, iName) ?? "").replace(/\s+/g, " ").trim();
    if (!name) { errors.push(`Row ${line}: no project name.`); return; }
    const fy = String(cell(row, iFy) ?? "").trim();
    if (!fy) { errors.push(`Row ${line}: "${name.slice(0,34)}" has no fiscal year.`); return; }
    const code = String(cell(row, iId) ?? "").trim() || null;
    // The same project twice in one sheet is imported once.
    const key = `${(code || "").toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) { errors.push(`Row ${line}: "${name.slice(0,34)}" repeats row ${seen.get(key)}, so it is imported once.`); return; }
    seen.set(key, line);

    const app = xlNum(cell(row, iApp)), rel = xlNum(cell(row, iRel));
    const fu = xlDate(cell(row, iFu)), br = xlDate(cell(row, iBr)), sd = xlDate(cell(row, iSd));
    if (app === undefined) { errors.push(`Row ${line}: approved amount "${cell(row, iApp)}" not understood.`); return; }
    if (rel === undefined) { errors.push(`Row ${line}: released amount "${cell(row, iRel)}" not understood.`); return; }
    for (const [v, i, lab] of [[fu, iFu, "last follow up"], [br, iBr, "budget release date"], [sd, iSd, "project start date"]])
      if (v === undefined) { errors.push(`Row ${line}: ${lab} "${cell(row, i)}" not understood.`); return; }
    if (app != null && rel != null && rel > app)
      errors.push(`Row ${line}: "${name.slice(0,34)}" has more released than approved; imported as given.`);

    const rawPm = String(cell(row, iPm) ?? "").trim();
    let pm_user_id = null;
    if (rawPm) {
      pm_user_id = pmByName[rawPm.toLowerCase()] || null;
      if (!pm_user_id) errors.push(`Row ${line}: no portal account for "${rawPm}" — imported with no manager.`);
    }
    const rawSt = String(cell(row, iSt) ?? "").trim().toLowerCase();
    const status = STATUS_IN[rawSt] || "open";
    if (rawSt && !STATUS_IN[rawSt]) errors.push(`Row ${line}: status "${cell(row, iSt)}" not recognised, using Open.`);
    const why = String(cell(row, iWhy) ?? "").trim();
    const prog = PROGRESS.find(p => p.toLowerCase() === why.toLowerCase());

    rows.push({ line, code, name, campus: fixCampus(cell(row, iCam)), fiscal_year: fy,
      approved_amount: app ?? 0, released_amount: rel ?? 0, pm_user_id, pm_label: rawPm,
      status, reason_open: prog || why || null,
      notes: String(cell(row, iNo) ?? "").trim() || null, last_followed_up: fu,
      // A budget release date is also the actual start (the database sets it too).
      budget_release_date: br, start_date: sd, actual_start_date: br });
  });
  return { errors, rows };
}

/* ── Age, money, progress ────────────────────────────────────────────────
   The sheet has no finish dates, so nothing here can be "overdue". What it does
   have is when the money went out: the time since the budget was released is
   how long the project has been open on the books, and that is what the page
   ranks by. Released is shown against approved.
   ─────────────────────────────────────────────────────────────────────────── */
const DAY = 86400000;
const d0 = (s) => { if (!s) return null; const d = new Date(String(s).slice(0,10) + "T00:00:00"); return isNaN(d) ? null : d; };
const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dayDiff = (a, b) => Math.round((b - a) / DAY);
const fmtDate = (s) => { const d = d0(s); return d ? d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—"; };
const span = (n) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 60) { const m = Math.round(a / 30.44); return m >= 24 ? `${(m/12).toFixed(1)} yrs` : `${m} mo`; }
  return `${a} day${a === 1 ? "" : "s"}`;
};

// How long since the money was released (else since the project started).
export function ageOf(r) {
  const from = d0(r.budget_release_date) || d0(r.start_date) || d0(r.actual_start_date);
  if (!from) return { key:"undated", days:null };
  const days = Math.max(0, dayDiff(from, today0()));
  if (r.status === "closed") return { key:"closed", days, from };
  return { key: days > 365 ? "old" : days > 182 ? "mid" : "new", days, from };
}
const AGE = {
  new:     { label:"Under 6 months", short:"< 6 mo",   color:BRAND.blueBright },
  mid:     { label:"6 to 12 months", short:"6–12 mo",  color:DATA.warning },
  old:     { label:"Over a year",    short:"> 1 year", color:DATA.danger },
  closed:  { label:"Closed",         short:"closed",   color:DATA.positive },
  undated: { label:"No release date",short:"no date",  color:"#8FA3BF" },
};
const relPct = (r) => { const a = parseFloat(r.approved_amount)||0; return a > 0 ? Math.min(100, (parseFloat(r.released_amount)||0) / a * 100) : null; };
const progressOf = (r) => {
  const t = String(r.reason_open || "").trim();
  if (/^no progress$/i.test(t)) return { label:"No progress", color:DATA.danger };
  if (/^in progress$/i.test(t)) return { label:"In Progress", color:BRAND.blueBright };
  return t ? { label:"Note", color:"#8FA3BF", text:t } : { label:"Not stated", color:"#8FA3BF" };
};

const DATE_FIELDS = [
  ["budget_release_date", "Budget release date"],
  ["start_date",          "Project start date"],
];

/* ── Follow-up chats: unread state and notifications ───────────────────────
   Two kinds of conversation, both readable by the PMO and by the project's own
   manager only (RLS): a thread per past project (past_project_updates) and a
   chat per project manager about all their past projects (past_pm_messages).
   A message from the PMO emails the manager; a reply emails the PMO
   (edge function notify-past, PMO decision 5 Oct 2026).
   Read markers live in past_chat_reads, keyed 'pm:<id>' or 'project:<id>'. */
export async function loadPastUnread(supa, session) {
  const me = session?.user_id;
  if (!me) return { total: 0, byThread: {} };
  // A past-projects viewer (two guest accounts, PMO 6 Oct 2026) can read every
  // conversation, so only the ones they opened or wrote in count as unread.
  const viewer = session.role !== "pmo" && await isPastViewer(supa, session);
  const [reads, pmMsgs, projMsgs] = await Promise.all([
    supa("/rest/v1/past_chat_reads?select=thread,read_at", {}, session.access_token).catch(() => []),
    supa("/rest/v1/past_pm_messages?select=pm_user_id,author_id,created_at", {}, session.access_token).catch(() => []),
    supa("/rest/v1/past_project_updates?select=past_project_id,author_id,created_at", {}, session.access_token).catch(() => []),
  ]);
  const seen = Object.fromEntries((Array.isArray(reads) ? reads : []).map(r => [r.thread, r.read_at]));
  const byThread = {};
  const joined = new Set(Object.keys(seen));
  if (viewer) {
    (Array.isArray(pmMsgs) ? pmMsgs : []).forEach(m => { if (m.author_id === me) joined.add(`pm:${m.pm_user_id}`); });
    (Array.isArray(projMsgs) ? projMsgs : []).forEach(m => { if (m.author_id === me) joined.add(`project:${m.past_project_id}`); });
  }
  const add = (thread, m) => {
    if (m.author_id === me) return;
    if (viewer && !joined.has(thread)) return;
    if (seen[thread] && new Date(m.created_at) <= new Date(seen[thread])) return;
    byThread[thread] = (byThread[thread] || 0) + 1;
  };
  (Array.isArray(pmMsgs) ? pmMsgs : []).forEach(m => add(`pm:${m.pm_user_id}`, m));
  (Array.isArray(projMsgs) ? projMsgs : []).forEach(m => add(`project:${m.past_project_id}`, m));
  return { total: Object.values(byThread).reduce((s, n) => s + n, 0), byThread };
}
// The two guest accounts the PMO gave Past Projects to (settings.past_viewers,
// checked by the database). Cached per sign-in.
const viewerCache = new Map();
export async function isPastViewer(supa, session) {
  if (!session?.user_id || session.role === "pmo") return false;
  if (!viewerCache.has(session.user_id)) {
    viewerCache.set(session.user_id, supa("/rest/v1/rpc/is_past_viewer", { method:"POST", body:"{}" }, session.access_token)
      .then(r => r === true).catch(() => { viewerCache.delete(session.user_id); return false; }));
  }
  return viewerCache.get(session.user_id);
}
async function markPastRead(supa, session, thread) {
  try {
    await supa("/rest/v1/past_chat_reads?on_conflict=user_id,thread", {
      method:"POST", headers:{ Prefer:"resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: session.user_id, thread, read_at: new Date().toISOString() }),
    }, session.access_token);
  } catch { /* a missed marker only leaves a badge on */ }
}
// Best-effort: the message is already saved; a mail problem must not look like a failed post.
const notifyPast = (supa, session, kind, id) => {
  if (!id) return;
  supa("/functions/v1/notify-past", { method:"POST", body: JSON.stringify({ kind, id }) },
       session.access_token).catch(() => {});
};
const UnreadDot = ({ T, n }) => n > 0 ? (
  <span className="past-dot" style={{ minWidth:18, height:18, padding:"0 5px", borderRadius:R.pill,
    background:BRAND.gold, color:"#1A1206", fontSize:10, fontWeight:800, display:"inline-flex",
    alignItems:"center", justifyContent:"center", boxSizing:"border-box",
    boxShadow:`0 2px 8px -1px ${BRAND.gold}99` }}>{n > 99 ? "99+" : n}</span>
) : null;


/* ── Edit a past project (PMO) — every field, including the manager ─────── */
const EDIT_FIELDS = [
  ["code", "Project ID", "text"], ["name", "Project name", "text"],
  ["campus", "Campus", "text"], ["fiscal_year", "Fiscal year", "text"],
  ["approved_amount", "Approved amount (PKR)", "number"], ["released_amount", "Released amount (PKR)", "number"],
];
function EditPastModal({ T, session, supa, row, pms, isCompact, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, row[k] ?? ""])),
    ...Object.fromEntries(DATE_FIELDS.map(([k]) => [k, row[k] || ""])),
    pm_user_id: row.pm_user_id || "", status: row.status || "open",
    reason_open: row.reason_open || "", notes: row.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const set = (k, v) => setF(s => k === "budget_release_date" && v
    ? { ...s, budget_release_date:v, actual_start_date:v } : { ...s, [k]:v });
  const save = async () => {
    setErr(null);
    if (!String(f.name).trim()) return setErr("The project name is required.");
    if (!String(f.fiscal_year).trim()) return setErr("The fiscal year is required.");
    for (const k of ["approved_amount","released_amount"])
      if (f[k] !== "" && !isFinite(Number(f[k]))) return setErr("Amounts must be numbers.");
    setBusy(true);
    try {
      await supa(`/rest/v1/past_projects?id=eq.${row.id}`, {
        method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({
          code: String(f.code).trim() || null, name: String(f.name).trim(),
          campus: fixCampus(f.campus), fiscal_year: String(f.fiscal_year).trim(),
          approved_amount: f.approved_amount === "" ? 0 : Number(f.approved_amount),
          released_amount: f.released_amount === "" ? 0 : Number(f.released_amount),
          pm_user_id: f.pm_user_id || null, status: f.status,
          reason_open: String(f.reason_open).trim() || null, notes: String(f.notes).trim() || null,
          ...Object.fromEntries(DATE_FIELDS.map(([k]) => [k, f[k] || null])),
        }),
      }, session.access_token);
      onSaved();
    } catch (e) { setErr(e.message || "Could not save."); }
    setBusy(false);
  };
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"8px 10px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };
  const lab = (t) => <div style={{ fontSize:11.5, color:T.muted, marginBottom:4 }}>{t}</div>;
  const grid = (cols) => ({ display:"grid", gap:SP.sm, marginBottom:SP.md,
    gridTemplateColumns: isCompact ? "1fr" : `repeat(${cols}, minmax(0,1fr))` });
  const pmChanged = (f.pm_user_id || "") !== (row.pm_user_id || "");
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1350, background:"rgba(3,8,16,0.74)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex",
        alignItems: isCompact ? "flex-end" : "center", justifyContent:"center",
        padding: isCompact ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="Edit past project"
        style={{ width:720, maxWidth:"100%", maxHeight:"92vh", overflow:"auto", background:T.surface,
          border:`1px solid ${T.border}`, borderRadius: isCompact ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          boxShadow:T.shadowLg, padding: isCompact ? SP.lg : SP.xxl }}>
        <div style={{ ...TYPE.display, fontSize:17, color:T.text, marginBottom:4 }}>Edit past project</div>
        <div style={{ fontSize:12.5, color:T.muted, marginBottom:SP.lg, lineHeight:1.6 }}>{row.name}</div>

        <div style={grid(2)}>
          {EDIT_FIELDS.map(([k, t, type]) => (
            <label key={k} style={{ display:"block", gridColumn: k === "name" && !isCompact ? "1 / -1" : undefined }}>
              {lab(t)}
              <input type={type} value={f[k]} onChange={e => set(k, e.target.value)} style={inp} />
            </label>
          ))}
        </div>
        <div style={grid(2)}>
          <label style={{ display:"block" }}>
            {lab("Project manager")}
            <select value={f.pm_user_id} onChange={e => set("pm_user_id", e.target.value)} style={inp}>
              <option value="">— No project manager —</option>
              {pms.map(p => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}
            </select>
          </label>
          <label style={{ display:"block" }}>
            {lab("Status")}
            <select value={f.status} onChange={e => set("status", e.target.value)} style={inp}>
              {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>
        {pmChanged && (
          <div style={{ marginTop:-SP.sm, marginBottom:SP.md, fontSize:11.5, color:T.textOf(DATA.warning), lineHeight:1.55 }}>
            The new manager will see this project and its follow-up thread; the previous one will no longer see it.
          </div>
        )}
        <label style={{ display:"block", marginBottom:SP.md }}>
          {lab("Why still open")}
          <input list="past-progress" value={f.reason_open} onChange={e => set("reason_open", e.target.value)}
            placeholder="In Progress, No progress, or a short note" style={inp} />
          <datalist id="past-progress">{PROGRESS.map(x => <option key={x} value={x} />)}</datalist>
        </label>
        <label style={{ display:"block", marginBottom:SP.md }}>
          {lab("Notes")}
          <textarea value={f.notes} onChange={e => set("notes", e.target.value)} rows={2}
            style={{ ...inp, resize:"vertical", lineHeight:1.55 }} />
        </label>
        <div style={grid(2)}>
          {DATE_FIELDS.map(([k, t]) => (
            <label key={k} style={{ display:"block" }}>
              {lab(t)}
              <input type="date" value={f[k]} onChange={e => set(k, e.target.value)} style={inp} />
            </label>
          ))}
        </div>
        <div style={{ fontSize:11.5, color:T.dim, marginBottom:SP.md, lineHeight:1.55 }}>
          The budget release date also becomes the actual start, as on current projects; the time since
          it is how long the project shows as open.
        </div>

        {err && (
          <div style={{ marginBottom:SP.md, padding:"9px 12px", borderRadius:R.sm,
            background:`${DATA.danger}14`, border:`1px solid ${DATA.danger}3D`,
            fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
        )}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:SP.sm }}>
          <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button T={T} variant="primary" onClick={save} loading={busy}>Save changes</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}


/* ── Chat with one project manager about all their past projects ─────────── */
function PmChat({ T, session, supa, pm, projects, isPMO: isPMOrole, viewer = false, isCompact, onOpenProject, onBack, onRead }) {
  // A viewer chats with any manager the way the PMO does; the PMO and the
  // manager are both emailed when they send.
  const isPMO = isPMOrole || viewer;
  const [msgs, setMsgs] = useState(null);
  const [body, setBody] = useState("");
  const [tag, setTag]   = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const endRef = useRef(null);
  const byId = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);

  const load = useCallback(async () => {
    try {
      const r = await supa(`/rest/v1/past_pm_messages?pm_user_id=eq.${pm.id}&select=*&order=created_at.asc`,
                           {}, session.access_token);
      setMsgs(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setMsgs([]); }
    await markPastRead(supa, session, `pm:${pm.id}`); onRead?.();
  }, [pm.id, supa, session]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msgs?.length) endRef.current?.scrollIntoView({ block:"nearest" }); }, [msgs]);
  // New replies show up while the chat is open.
  useEffect(() => { const iv = setInterval(load, 45000); return () => clearInterval(iv); }, [load]);

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await supa("/rest/v1/past_pm_messages", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({ pm_user_id: pm.id, past_project_id: tag || null, body: body.trim(),
          author_id: session.user_id, author_name: session.full_name || session.username,
          author_role: session.role }),
      }, session.access_token);
      notifyPast(supa, session, "pm", Array.isArray(r) ? r[0]?.id : r?.id);
      setBody(""); setTag(""); await load();
    } catch (e) { setErr(e.message || "Could not send that."); }
    setBusy(false);
  };

  const open = projects.filter(p => p.status !== "closed");
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"9px 11px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div className="past-row">
      {onBack && (
        <button className="pmo-focusable pmo-btn" onClick={onBack}
          style={{ display:"inline-flex", alignItems:"center", gap:6, background:"none", border:"none",
            cursor:"pointer", color:T.muted, padding:"2px 0", marginBottom:SP.md, ...TYPE.caption, fontSize:12.5 }}>
          <ArrowLeft size={14} /> {isPMO ? "Project managers" : "Past projects"}
        </button>
      )}
      <Surface T={T} tone={BRAND.blue} pad={isCompact ? SP.md : SP.lg} style={{ marginBottom:SP.md }}>
        <div style={{ ...TYPE.label, color:T.dim }}>{isPMO ? "Follow-up chat with" : "Follow-up chat with the PMO"}</div>
        <div style={{ ...TYPE.display, fontSize: isCompact ? 17 : 20, color:T.text, lineHeight:1.3 }}>
          {isPMO ? (pm.full_name || pm.username) : "Your past projects"}
        </div>
        <div style={{ ...TYPE.caption, color:T.muted, marginTop:4 }}>
          {projects.length} past project{projects.length===1?"":"s"} · {open.length} still open ·
          PKR {fmtM(open.reduce((s,p) => s + (parseFloat(p.approved_amount)||0), 0))} approved on open items
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:SP.md }}>
          {projects.map(p => {
            const st = STATUS[p.status] || STATUS.open;
            return (
              <button key={p.id} className="pmo-focusable pmo-btn" onClick={() => onOpenProject(p.id)}
                title={`${p.name} — ${st.label}`}
                style={{ display:"inline-flex", alignItems:"center", gap:6, maxWidth:"100%", padding:"4px 10px",
                  borderRadius:R.pill, border:`1px solid ${T.border}`, background:T.card2, cursor:"pointer",
                  fontSize:11.5, color:T.text }}>
                <span style={{ width:6, height:6, borderRadius:3, background:st.color, flexShrink:0 }} />
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </Surface>

      <div style={{ maxWidth:860 }}>
        {msgs === null ? (
          <div style={{ fontSize:12.5, color:T.dim }}>Loading…</div>
        ) : msgs.length === 0 ? (
          <div style={{ padding:SP.lg, textAlign:"center", borderRadius:R.md,
            border:`1px dashed ${T.borderStrong}`, color:T.dim, fontSize:12.5, lineHeight:1.6 }}>
            {isPMO ? "Nothing asked yet. Ask for an update on all their projects, or tag one below."
                   : "No questions from the PMO yet. You can also write first."}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
            {msgs.map(m => {
              const mine = m.author_id === session.user_id;
              const pmo  = m.author_role === "pmo";
              const asker = !pmo && m.author_id !== pm.id;   // one of the two viewers
              const p = m.past_project_id ? byId[m.past_project_id] : null;
              return (
                <div key={m.id} style={{ display:"flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: isCompact ? "92%" : "80%", padding:"10px 13px", borderRadius:R.md,
                    background: pmo ? `${BRAND.blue}1A` : asker ? `${BRAND.gold}14` : T.card2,
                    border:`1px solid ${pmo ? `${BRAND.blue}3D` : asker ? `${BRAND.gold}4D` : T.border}` }}>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11.5, fontWeight:700, color: pmo ? T.textOf(BRAND.blue) : asker ? T.textOf(BRAND.gold) : T.text }}>
                        {m.author_name || "Unknown"}
                      </span>
                      <span style={{ ...TYPE.caption, color:T.dim }}>{when(m.created_at)}</span>
                    </div>
                    {p && (
                      <button className="pmo-focusable pmo-btn" onClick={() => onOpenProject(p.id)}
                        style={{ display:"inline-flex", alignItems:"center", gap:5, marginBottom:5, padding:"1px 8px",
                          borderRadius:R.pill, border:`1px solid ${BRAND.gold}55`, background:`${BRAND.gold}14`,
                          color:T.textOf(BRAND.gold), fontSize:10.5, fontWeight:700, cursor:"pointer", maxWidth:"100%" }}>
                        <History size={10} />
                        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                      </button>
                    )}
                    <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.6, whiteSpace:"pre-wrap",
                      overflowWrap:"anywhere" }}>{m.body}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}

        {err && <div style={{ marginTop:SP.sm, fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>}

        <div style={{ marginTop:SP.lg, padding:SP.md, borderRadius:R.md, background:T.surface,
          border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", gap:SP.sm, alignItems:"center", marginBottom:SP.sm, flexWrap:"wrap" }}>
            <span style={{ ...TYPE.caption, color:T.muted }}>About</span>
            <Select T={T} size="sm" value={tag} onChange={e => setTag(e.target.value)} style={{ flex:"1 1 220px", minWidth:0 }}>
              <option value="">All {isPMO ? "their" : "my"} projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div style={{ display:"flex", gap:SP.sm, alignItems:"flex-end" }}>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              placeholder={isPMO ? "Ask where things stand…" : "Reply with the current position…"}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
              style={{ ...inp, resize:"vertical", lineHeight:1.55 }} />
            <Button T={T} variant="primary" icon={Send} onClick={post} loading={busy} disabled={!body.trim()}>
              Send
            </Button>
          </div>
          <div style={{ ...TYPE.caption, color:T.dim, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
            <Mail size={11} /> {viewer ? `${pm.full_name || pm.username} and the PMO are emailed when you send.`
              : isPMO ? `${pm.full_name || pm.username} is emailed when you send.` : "The PMO is emailed when you send."}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Project managers at a glance (PMO) ──────────────────────────────────── */
function PmsView({ T, rows, unread, lastByPm, isCompact, onOpen }) {
  const groups = useMemo(() => {
    const m = {};
    (rows || []).filter(r => r.pm_user_id).forEach(r => {
      (m[r.pm_user_id] ||= { id:r.pm_user_id, name:r.pm_name || "Unknown", list:[] }).list.push(r);
    });
    return Object.values(m).map(g => ({ ...g,
      open: g.list.filter(r => r.status !== "closed"),
      unread: g.list.reduce((s, r) => s + (unread[`project:${r.id}`] || 0), 0) + (unread[`pm:${g.id}`] || 0),
      last: lastByPm[g.id] || null,
    })).sort((a, b) => b.unread - a.unread || b.open.length - a.open.length || a.name.localeCompare(b.name));
  }, [rows, unread, lastByPm]);
  const noPm = (rows || []).filter(r => !r.pm_user_id).length;
  if (!groups.length) return (
    <div style={{ padding:SP.xxl, textAlign:"center", background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:R.lg, color:T.muted, fontSize:13 }}>No past project has a project manager yet.</div>
  );
  return (
    <div>
      <div style={{ display:"grid", gap:SP.md, gridTemplateColumns: isCompact ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {groups.map((g, i) => {
          const value = g.open.reduce((s, r) => s + (parseFloat(r.approved_amount)||0), 0);
          const stale = g.open.filter(r => (r.days_since_followup ?? 9999) > 30).length;
          return (
            <button key={g.id} onClick={() => onOpen(g.id)} className="pmo-focusable pmo-btn past-row"
              style={{ animationDelay:`${Math.min(i,10)*40}ms`, textAlign:"left", cursor:"pointer",
                padding:`${SP.md}px ${SP.lg}px`, background:T.surface, border:`1px solid ${g.unread ? `${BRAND.gold}88` : T.border}`,
                borderRadius:R.lg, boxShadow: g.unread ? T.glowSoft(BRAND.gold) : T.shadow, color:T.text }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <MessageSquare size={14} color={T.textOf(BRAND.blue)} />
                <span style={{ fontSize:14, fontWeight:700, flex:1, minWidth:0, overflow:"hidden",
                  textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</span>
                <UnreadDot T={T} n={g.unread} />
              </div>
              <div style={{ ...TYPE.caption, color:T.muted, marginTop:6 }}>
                {g.list.length} project{g.list.length===1?"":"s"} · {g.open.length} open · PKR {fmtM(value)}
                {stale ? ` · ${stale} not chased in 30 days` : ""}
              </div>
              <div style={{ fontSize:12, color: g.last ? T.textSoft : T.dim, marginTop:8, lineHeight:1.5,
                display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                {g.last ? `${g.last.author_role === "pmo" ? "You" : g.name.split(" ")[0]}: ${g.last.body}` : "No chat yet."}
              </div>
              {g.last && <div style={{ ...TYPE.caption, color:T.dim, marginTop:4 }}>{when(g.last.created_at)}</div>}
            </button>
          );
        })}
      </div>
      {noPm > 0 && (
        <div style={{ ...TYPE.caption, color:T.dim, marginTop:SP.md }}>
          {noPm} past project{noPm===1?"":"s"} without a project manager {noPm===1?"is":"are"} not shown here.
        </div>
      )}
    </div>
  );
}

/* ── Dates tab: when the money went out, and how long it has been open ─── */
function DatesTab({ T, row, roll, isPMO, isCompact }) {
  const [hot, setHot] = useState(false);
  const a = ageOf(row), am = AGE[a.key];
  const pct = relPct(row);
  // One bar on a fixed two-year scale, so every project reads the same way:
  // the 6- and 12-month marks are where the colour changes.
  const SCALE = 730, w = a.days == null ? 0 : Math.min(a.days, SCALE) / SCALE * 100;
  const tiles = [
    ["Budget released", fmtDate(row.budget_release_date)],
    ["Project start",   fmtDate(row.start_date)],
    ["Open for",        a.days == null ? "—" : span(a.days)],
    ["Last follow-up",  row.last_followed_up ? fmtDate(row.last_followed_up) : "never"],
  ];
  const money = [
    ["Approved", `PKR ${fmtM(row.approved_amount)}`, null],
    ["Released", `PKR ${fmtM(row.released_amount)}${pct != null ? ` · ${Math.round(pct)}%` : ""}`, null],
  ];
  return (
    <div>
      <Surface T={T} tone={am.color} pad={isCompact ? SP.md : SP.lg} style={{ marginBottom:SP.lg }}>
        <div style={{ display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap", marginBottom:SP.md }}>
          <CalendarRange size={15} color={T.textOf(am.color)} />
          <span style={{ ...TYPE.label, color:T.text }}>Open since the budget was released</span>
          <span style={{ ...TYPE.caption, fontWeight:700, padding:"2px 9px", borderRadius:R.pill,
            background:`${am.color}${T.badge}`, color:T.textOf(am.color) }}>{am.label}</span>
        </div>
        <div style={{ display:"grid", gap:SP.sm, marginBottom:SP.lg,
          gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))" }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ padding:"9px 11px", borderRadius:R.md, background:T.card2, border:`1px solid ${T.border}` }}>
              <div style={{ ...TYPE.label, color:T.dim, fontSize:8.5 }}>{k}</div>
              <div style={{ fontSize:13, fontWeight:700, marginTop:3, color: v === "—" || v === "never" ? T.dim : T.text }}>{v}</div>
            </div>
          ))}
        </div>
        {a.days != null && (
          <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}>
            <div style={{ position:"relative", height:14, background:T.card2, borderRadius:R.pill, overflow:"visible" }}>
              {[182, 365].map(m => (
                <span key={m} aria-hidden="true" style={{ position:"absolute", top:-4, bottom:-4, left:`${m/SCALE*100}%`,
                  borderLeft:`1px dashed ${T.borderStrong}` }} />
              ))}
              <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${Math.max(w, 1.5)}%`, borderRadius:R.pill,
                background:`linear-gradient(90deg, ${BRAND.blueBright}, ${a.days > 182 ? DATA.warning : BRAND.blueBright}${a.days > 365 ? `, ${DATA.danger}` : ""})`,
                boxShadow: hot ? T.glowSoft(am.color) : "none", transition:`box-shadow ${MOTION.base}` }} />
            </div>
            <div style={{ position:"relative", height:16, marginTop:4, ...TYPE.caption, fontSize:10, color:T.dim }}>
              <span style={{ position:"absolute", left:0 }}>released</span>
              <span style={{ position:"absolute", left:`${182/SCALE*100}%`, transform:"translateX(-50%)" }}>6 mo</span>
              <span style={{ position:"absolute", left:`${365/SCALE*100}%`, transform:"translateX(-50%)" }}>1 yr</span>
              <span style={{ position:"absolute", right:0 }}>2 yrs+</span>
            </div>
          </div>
        )}
      </Surface>

      <Surface T={T} pad={isCompact ? SP.md : SP.lg} style={{ marginBottom:SP.lg }}>
        <div style={{ ...TYPE.label, color:T.muted, marginBottom:SP.md }}>Money</div>
        <div style={{ display:"grid", gap:SP.sm, gridTemplateColumns: isCompact ? "1fr" : "repeat(2, minmax(0,1fr))" }}>
          {money.map(([k, v, c]) => (
            <div key={k}>
              <div style={{ ...TYPE.caption, color:T.dim }}>{k}</div>
              <div style={{ fontSize:14, fontWeight:700, marginTop:2, color: c ? T.textOf(c) : T.text }}>{v}</div>
            </div>
          ))}
        </div>
        {pct != null && (
          <div style={{ height:6, borderRadius:R.pill, background:T.card2, marginTop:SP.md, overflow:"hidden" }}>
            <div style={{ width:`${pct}%`, height:"100%", background: pct >= 100 ? DATA.positive : DATA.warning }} />
          </div>
        )}
      </Surface>

      {roll?.task_count > 0 && (
        <div style={{ ...TYPE.caption, color:T.muted }}>
          Work breakdown: {roll.task_count} task{roll.task_count === 1 ? "" : "s"}, {Math.round(roll.weighted_pct || 0)}% complete.
        </div>
      )}
      {isPMO && (
        <div style={{ ...TYPE.caption, color:T.dim, marginTop:SP.sm }}>
          Dates and amounts are changed with Edit project.
        </div>
      )}
    </div>
  );
}


/* ── Follow-up tab: the reason it is still open, and the thread ─────────── */
function FollowUpPanel({ T, session, supa, row, isPMO, viewer = false, onChanged, onRead }) {
  const [msgs, setMsgs]   = useState(null);
  const [body, setBody]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason]   = useState(row.reason_open || "");
  const [status, setStatus]   = useState(row.status);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await supa(
        `/rest/v1/past_project_updates?past_project_id=eq.${row.id}&select=*&order=created_at.asc`,
        {}, session.access_token);
      setMsgs(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setMsgs([]); }
    await markPastRead(supa, session, `project:${row.id}`); onRead?.();
  }, [row.id, supa, session]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msgs?.length) endRef.current?.scrollIntoView({ block:"nearest" }); }, [msgs]);

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    try {
      const created = await supa("/rest/v1/past_project_updates", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({
          past_project_id: row.id, body: body.trim(),
          author_id: session.user_id,
          author_name: session.full_name || session.username,
          author_role: session.role,
        }),
      }, session.access_token);
      notifyPast(supa, session, "project", Array.isArray(created) ? created[0]?.id : created?.id);
      setBody(""); await load(); onChanged?.();
    } catch (e) { setErr(e.message || "Could not post that."); }
    setBusy(false);
  };

  const saveRecord = async () => {
    setBusy(true); setErr(null);
    try {
      await supa(`/rest/v1/past_projects?id=eq.${row.id}`, {
        method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({ reason_open: reason.trim() || null, status }),
      }, session.access_token);
      setEditing(false); onChanged?.();
    } catch (e) { setErr(e.message || "Could not save."); }
    setBusy(false);
  };

  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"9px 11px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ maxWidth:820 }}>
      {/* Why it is still open — PMO's field. A PM reads it and answers below. */}
      <div style={{ marginBottom:SP.lg }}>
        <div style={{ display:"flex", alignItems:"center", gap:SP.sm, marginBottom:6 }}>
          <span style={{ ...TYPE.label, color:T.muted }}>Why still open</span>
          {isPMO && !editing && (
            <button className="pmo-focusable pmo-btn" onClick={() => setEditing(true)}
              aria-label="Edit reason and status"
              style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:2 }}>
              <Pencil size={12} />
            </button>
          )}
        </div>
        {editing ? (
          <div>
            <input list="past-progress-f" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="In Progress, No progress, or a short note"
              style={{ ...inp, marginBottom:SP.sm }} />
            <datalist id="past-progress-f">{PROGRESS.map(x => <option key={x} value={x} />)}</datalist>
            <div style={{ display:"flex", gap:SP.sm, alignItems:"center", flexWrap:"wrap" }}>
              <Select T={T} value={status} onChange={e => setStatus(e.target.value)}>
                {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <div style={{ marginLeft:"auto", display:"flex", gap:SP.sm }}>
                <Button T={T} variant="ghost" onClick={() => {
                  setEditing(false); setReason(row.reason_open || ""); setStatus(row.status); }}>
                  Cancel
                </Button>
                <Button T={T} variant="primary" onClick={saveRecord} loading={busy}>Save</Button>
              </div>
            </div>
          </div>
        ) : (
          (() => { const pg = progressOf(row); return (
            <div style={{ display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap", fontSize:13,
              color: row.reason_open ? T.textSoft : T.dim, lineHeight:1.65, padding:"10px 13px",
              borderRadius:R.md, background:T.card2, borderLeft:`3px solid ${pg.color}` }}>
              <span style={{ ...TYPE.caption, fontWeight:700, padding:"2px 9px", borderRadius:R.pill,
                background:`${pg.color}${T.badge}`, color:T.textOf(pg.color) }}>{pg.label}</span>
              {pg.text && <span>{pg.text}</span>}
              {!row.reason_open && <span>Nothing recorded yet.</span>}
            </div>); })()
        )}
      </div>

      <div style={{ ...TYPE.label, color:T.muted, marginBottom:SP.sm }}>
        Follow-up {msgs?.length ? `· ${msgs.length} message${msgs.length===1?"":"s"}` : ""}
      </div>

      {msgs === null ? (
        <div style={{ fontSize:12.5, color:T.dim }}>Loading…</div>
      ) : msgs.length === 0 ? (
        <div style={{ padding:SP.lg, textAlign:"center", borderRadius:R.md,
          border:`1px dashed ${T.borderStrong}`, color:T.dim, fontSize:12.5 }}>
          Nothing asked yet. Start the conversation below.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
          {msgs.map(m => {
            const mine = m.author_id === session.user_id;
            const pmo  = m.author_role === "pmo";
            const asker = !pmo && m.author_id !== row.pm_user_id;   // one of the two viewers
            return (
              <div key={m.id} style={{ display:"flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth:"82%", padding:"10px 13px", borderRadius:R.md,
                  background: pmo ? `${BRAND.blue}1A` : asker ? `${BRAND.gold}14` : T.card2,
                  border:`1px solid ${pmo ? `${BRAND.blue}3D` : asker ? `${BRAND.gold}4D` : T.border}` }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11.5, fontWeight:700, color: pmo ? T.textOf(BRAND.blue) : asker ? T.textOf(BRAND.gold) : T.text }}>
                      {m.author_name || "Unknown"}
                    </span>
                    <span style={{ ...TYPE.caption, color:T.dim }}>{when(m.created_at)}</span>
                  </div>
                  <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{m.body}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {err && <div style={{ marginTop:SP.sm, fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>}

      <div style={{ display:"flex", gap:SP.sm, marginTop:SP.lg, alignItems:"flex-end" }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
          placeholder={isPMO || viewer ? "Ask the project manager where this stands…" : "Reply with the current position…"}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
          style={{ ...inp, resize:"vertical", lineHeight:1.55 }} />
        <Button T={T} variant="primary" icon={Send} onClick={post}
          loading={busy} disabled={!body.trim()}>Post</Button>
      </div>
      <div style={{ ...TYPE.caption, color:T.dim, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
        <Mail size={11} />
        {viewer ? (row.pm_name ? `${row.pm_name} and the PMO are emailed when you post.` : "The PMO is emailed when you post.")
         : isPMO ? (row.pm_name ? `${row.pm_name} is emailed when you post.` : "This project has no manager, so nobody is emailed.")
               : "The PMO is emailed when you post."}
      </div>
    </div>
  );
}


/* ── One past project, full page ─────────────────────────────────────────── */
function PastProjectDetail({ T, session, supa, row, roll, isPMO, viewer = false, isCompact, onBack, onChanged, pms = [], onRead, onOpenPm }) {
  const [tab, setTab] = useState("followup");
  const [editing, setEditing] = useState(false);
  const st = STATUS[row.status] || STATUS.open;
  const ag = ageOf(row), am = AGE[ag.key], pg = progressOf(row), pct = relPct(row);
  // PMO always; the project's own manager once the page is opened to them.
  // The database decides either way.
  const canWriteTasks = isPMO || (row.pm_user_id && row.pm_user_id === session.user_id);

  return (
    <div className="past-row">
      <button className="pmo-focusable pmo-btn" onClick={onBack}
        style={{ display:"inline-flex", alignItems:"center", gap:6, background:"none", border:"none",
          cursor:"pointer", color:T.muted, padding:"2px 0", marginBottom:SP.md, ...TYPE.caption,
          fontSize:12.5 }}>
        <ArrowLeft size={14} /> Past projects
      </button>

      <Surface T={T} tone={st.color} pad={isCompact ? SP.md : SP.lg} style={{ marginBottom:SP.md }}>
        <div style={{ display:"flex", gap:SP.sm, alignItems:"flex-start", flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 260px", minWidth:0 }}>
            {row.code && <div style={{ ...TYPE.mono, fontSize:10, color:T.dim }}>{row.code}</div>}
            <div style={{ ...TYPE.display, fontSize: isCompact ? 17 : 20, color:T.text, lineHeight:1.3 }}>{row.name}</div>
          </div>
          <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap" }}>
            {row.pm_user_id && onOpenPm && (
              <Button T={T} size="sm" variant="ghost" icon={MessageSquare} onClick={() => onOpenPm(row.pm_user_id)}>
                {isPMO || viewer ? `Chat with ${String(row.pm_name || "PM").split(" ")[0]}` : "Chat with PMO"}
              </Button>
            )}
            {isPMO && (
              <Button T={T} size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Edit project</Button>
            )}
          </div>
        </div>
        <div style={{ ...TYPE.caption, color:T.muted, marginTop:4 }}>
          {row.fiscal_year} · {row.campus || "No campus"} · {row.pm_name || "No project manager"}
        </div>
        <div style={{ display:"flex", gap:SP.sm, marginTop:SP.md, flexWrap:"wrap" }}>
          {[["Approved", `PKR ${fmtM(row.approved_amount)}`, null],
            ["Released", `PKR ${fmtM(row.released_amount)}${pct != null ? ` · ${Math.round(pct)}%` : ""}`, null],
            ["Open for", ag.days == null ? "no date" : span(ag.days), am.color],
            ["Progress", pg.label, pg.color],
            ["Status", st.label, st.color]].map(([k,v,c]) => (
            <div key={k} style={{ padding:"6px 12px", borderRadius:R.sm, background:T.card2,
              border:`1px solid ${T.border}` }}>
              <div style={{ ...TYPE.label, color:T.dim, fontSize:8.5 }}>{k}</div>
              <div style={{ fontSize:12.5, fontWeight:700, color: c ? T.textOf(c) : T.text }}>{v}</div>
            </div>
          ))}
        </div>
      </Surface>

      <div className="pmo-scroll" style={{ overflowX: isCompact ? "auto" : "visible", marginBottom:SP.lg }}>
        <Tabs T={T} active={tab} onChange={setTab} isMobile={isCompact}
          tabs={[
            { id:"followup", label:"Follow-up", Icon:MessageSquare },
            { id:"timeline", label:"Dates & money", Icon:CalendarRange },
            { id:"wbs",      label:"WBS",       Icon:ListTree },
          ]} />
      </div>

      {tab === "followup" && (
        <FollowUpPanel key={row.id + row.updated_at} T={T} session={session} supa={supa}
          row={row} isPMO={isPMO} viewer={viewer} onChanged={onChanged} onRead={onRead} />
      )}
      {tab === "timeline" && (
        <DatesTab T={T} row={row} roll={roll} isPMO={isPMO} isCompact={isCompact} />
      )}
      {tab === "wbs" && (
        <ProjectTasks kind="past" T={T} session={session} supa={supa} projectId={row.id}
          canWrite={canWriteTasks} isPMO={isPMO} isCompact={isCompact} onChanged={onChanged} />
      )}
      {editing && (
        <EditPastModal T={T} session={session} supa={supa} row={row} pms={pms} isCompact={isCompact}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />
      )}
    </div>
  );
}


/* ── Every past project on one time axis: release date → today ──────────── */
function PastAging({ T, groups, isCompact, onOpen }) {
  const [hover, setHover] = useState(null);
  const scroller = useRef(null);
  const centred = useRef(false);
  const t = today0();

  const { drawn, undated, axis } = useMemo(() => {
    const drawn = [], undated = [];
    groups.forEach(([g, rows]) => {
      const rs = rows.map(r => ({ ...r, _age: ageOf(r) })).filter(r => r._age.from ? true : (undated.push(r), false))
        .sort((x, y) => x._age.from - y._age.from);
      if (rs.length) drawn.push([g, rs]);
    });
    let axis = null;
    const all = drawn.flatMap(([, rs]) => rs.map(r => r._age.from));
    if (all.length) {
      const lo = new Date(Math.min(...all));
      const from = new Date(lo.getFullYear(), lo.getMonth(), 1);
      const to   = new Date(t.getFullYear(), t.getMonth() + 2, 1);
      const months = [];
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
      axis = { from, to, months, span:(to - from) / DAY };
    }
    return { drawn, undated, axis };
  }, [groups]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Months share the width there is, so the whole span shows without scrolling;
  // only a narrow screen falls back to a minimum width and scrolls.
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = scroller.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth)); ro.observe(el); setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [axis]);
  const COLW = axis ? Math.max(isCompact ? 22 : 24, boxW ? (boxW - 2) / axis.months.length : 0) : 0;
  const W = axis ? axis.months.length * COLW : 0;
  const x = (d) => axis ? ((d - axis.from) / DAY) / axis.span * W : 0;
  const NAMEW = isCompact ? 128 : 270, ROWH = isCompact ? 32 : 36;

  useEffect(() => {
    if (!axis || centred.current || !scroller.current) return;
    centred.current = true;
    scroller.current.scrollLeft = Math.max(0, W - scroller.current.clientWidth);
  });

  if (!axis) return (
    <div style={{ padding:SP.xxl, textAlign:"center", background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:R.lg, color:T.muted, fontSize:13, lineHeight:1.6 }}>
      None of these past projects has a budget release date yet, so there is nothing to draw.
    </div>
  );

  const legend = ["new","mid","old"].map(k => [AGE[k].label, AGE[k].color]);
  return (
    <div>
      <div style={{ display:"flex", gap:SP.md, flexWrap:"wrap", marginBottom:SP.sm, alignItems:"center" }}>
        <span style={{ ...TYPE.caption, color:T.muted }}>Each bar runs from the budget release to today.</span>
        {legend.map(([k, c]) => (
          <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:6, ...TYPE.caption, color:T.muted }}>
            <span style={{ width:14, height:8, borderRadius:2, background:`${c}BB`, border:`1px solid ${c}` }} />{k}
          </span>
        ))}
      </div>
      <div style={{ display:"flex", background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg,
        overflow:"hidden", boxShadow:T.shadow }}>
        <div style={{ width:NAMEW, flexShrink:0, borderRight:`1px solid ${T.border}` }}>
          <div style={{ height:30, borderBottom:`1px solid ${T.borderStrong}` }} />
          {drawn.map(([g, rows]) => (
            <Fragment key={g}>
              <div style={{ height:26, display:"flex", alignItems:"center", padding:"0 10px",
                background:T.card2, ...TYPE.label, color:T.text, fontSize:10.5 }}>{g} · {rows.length}</div>
              {rows.map(r => (
                <div key={r.id} onClick={() => onOpen(r)}
                  onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
                  style={{ height:ROWH, display:"flex", flexDirection:"column", justifyContent:"center",
                    padding:"0 10px", cursor:"pointer", borderBottom:`1px solid ${T.border}`,
                    background: hover === r.id ? T.surfaceRaised : "transparent" }}>
                  <div style={{ fontSize:12, color:T.text, fontWeight:600, overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</div>
                  <div style={{ ...TYPE.caption, fontSize:10.5, color:T.dim, whiteSpace:"nowrap", overflow:"hidden",
                    textOverflow:"ellipsis" }}>{r.code || r.campus || ""} · {r.pm_name || "No manager"}</div>
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        <div ref={scroller} className="pmo-scroll" style={{ overflowX:"auto", flex:1, position:"relative" }}>
          <div style={{ width:W, position:"relative" }}>
            <div style={{ height:30, display:"flex", borderBottom:`1px solid ${T.borderStrong}` }}>
              {axis.months.map(m => (
                <div key={+m} style={{ width:COLW, flexShrink:0, ...TYPE.caption, fontSize:10,
                  color: m.getMonth() === 0 ? T.text : T.dim, fontWeight: m.getMonth() === 0 ? 700 : 400,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  borderLeft:`1px solid ${m.getMonth() === 0 ? T.borderStrong : T.border}` }}>
                  {m.getMonth() === 0 ? m.getFullYear() : MONTHS[m.getMonth()].slice(0, COLW < 34 ? 1 : 3)}
                </div>
              ))}
            </div>
            {drawn.map(([g, rows]) => (
              <Fragment key={g}>
                <div style={{ height:26, background:T.card2 }} />
                {rows.map(r => {
                  const a = r._age, c = AGE[a.key].color, on = hover === r.id;
                  const x0 = x(a.from), x1 = x(t);
                  return (
                    <div key={r.id} onClick={() => onOpen(r)}
                      onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
                      style={{ height:ROWH, position:"relative", cursor:"pointer", borderBottom:`1px solid ${T.border}`,
                        background: on ? T.surfaceRaised : "transparent" }}>
                      <div style={{ position:"absolute", top:ROWH/2 - 6, height:12, left:x0, width:Math.max(x1 - x0, 4),
                        borderRadius:3, background:`linear-gradient(90deg, ${c}55, ${c}${on ? "EE" : "BB"})`,
                        border:`1px solid ${c}`, boxShadow: on ? T.glowSoft(c) : "none",
                        transition:`background ${MOTION.fast}, box-shadow ${MOTION.base}` }} />
                      {/* The release date sits before the bar, or inside it when there is no room. */}
                      <span style={{ position:"absolute", top:ROWH/2 - 8, ...TYPE.caption, fontSize:10, whiteSpace:"nowrap",
                        ...(x0 > 78 ? { right: W - x0 + 6, color:T.dim } : { left: x0 + 6, color:"#fff", fontWeight:700,
                          textShadow:"0 1px 2px rgba(0,0,0,.6)" }) }}>{fmtDate(r.budget_release_date || r.start_date)}</span>
                      {on && (
                        <div style={{ position:"absolute", bottom:"calc(100% - 4px)", left:Math.max(x0, 4), zIndex:5,
                          padding:"6px 10px", borderRadius:R.sm, background:T.surfaceRaised, border:`1px solid ${T.borderStrong}`,
                          boxShadow:T.shadowLg, fontSize:11.5, color:T.text, whiteSpace:"nowrap", pointerEvents:"none" }}>
                          Open {span(a.days)} · released PKR {fmtM(r.released_amount)} of {fmtM(r.approved_amount)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
            <div aria-hidden="true" style={{ position:"absolute", top:0, bottom:0, left:x(t), width:0,
              borderLeft:`1.5px dashed ${DATA.danger}AA`, pointerEvents:"none" }}>
              <span style={{ position:"absolute", top:36, left:4, ...TYPE.caption, fontSize:9.5,
                fontWeight:700, color:T.textOf(DATA.danger) }}>today</span>
            </div>
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop:SP.lg }}>
          <div style={{ ...TYPE.label, color:T.muted, marginBottom:SP.sm }}>
            Not on the chart · {undated.length} without a budget release date
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {undated.map(r => (
              <button key={r.id} className="pmo-focusable pmo-btn" onClick={() => onOpen(r)}
                style={{ padding:"5px 11px", borderRadius:R.pill, border:`1px solid ${T.border}`,
                  background:T.surface, color:T.textSoft, fontSize:12, cursor:"pointer" }}>{r.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];



/* ── Import ─────────────────────────────────────────────────────────────── */
function ImportModal({ T, session, supa, pms, existing = [], isCompact, onClose, onDone }) {
  const existingCount = existing.length;
  const [parsed, setParsed] = useState(null);
  // update = change the projects already here (matched by Project ID and name) and add new ones;
  // their follow-up threads and WBS stay. The default whenever there is a list already.
  const [mode, setMode]     = useState(existing.length ? "update" : "append");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);
  const [done, setDone]     = useState(null);

  const pmByName = useMemo(() => {
    const m = {};
    (pms || []).forEach(p => {
      if (p.full_name) m[p.full_name.toLowerCase()] = p.id;
      if (p.username)  m[p.username.toLowerCase()]  = p.id;
    });
    return m;
  }, [pms]);

  const pick = async (file) => {
    if (!file) return;
    setErr(null); setParsed(null);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true });
      // Not sheet zero: the template opens on its guide sheet. Prefer the named
      // sheet, then the first one that actually has a Project Name column.
      const read = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n],
        { header:1, raw:false, dateNF:"yyyy-mm-dd" });
      const ok = (aoa) => (aoa[0] || []).some(h =>
        String(h ?? "").trim().toLowerCase() === "project name");
      const named = wb.SheetNames.find(n => n.trim().toLowerCase() === "past projects");
      let aoa = named ? read(named) : null;
      if (!aoa || !ok(aoa)) aoa = wb.SheetNames.map(read).find(ok) || read(wb.SheetNames[0]);
      setParsed({ ...parseSheet(aoa, pmByName), fileName:file.name });
    } catch (e) { setErr(e.message || "That file could not be read."); }
  };

  // Which existing project each sheet row is: Project ID + name, then a Project ID
  // used only once, then a name used only once.
  const matchOf = useMemo(() => {
    const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const byBoth = new Map(), byCode = new Map(), byName = new Map();
    existing.forEach(e => {
      byBoth.set(`${norm(e.code)}|${norm(e.name)}`, e);
      if (e.code) byCode.set(norm(e.code), byCode.has(norm(e.code)) ? null : e);
      byName.set(norm(e.name), byName.has(norm(e.name)) ? null : e);
    });
    return (r) => byBoth.get(`${norm(r.code)}|${norm(r.name)}`) || (r.code && byCode.get(norm(r.code))) || byName.get(norm(r.name)) || null;
  }, [existing]);
  const plan = useMemo(() => {
    if (!parsed) return null;
    const upd = [], add = [];
    parsed.rows.forEach(r => { const m = mode === "update" ? matchOf(r) : null; m ? upd.push([m, r]) : add.push(r); });
    return { upd, add };
  }, [parsed, mode, matchOf]);

  const commit = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true); setErr(null);
    try {
      if (mode === "update") {
        // The sheet decides every column it has; an empty optional cell (notes,
        // dates, last follow-up) leaves what the portal already holds.
        for (const [m, r] of plan.upd) {
          const patch = { code:r.code, name:r.name, campus:r.campus, fiscal_year:r.fiscal_year,
            approved_amount:r.approved_amount, released_amount:r.released_amount, pm_user_id:r.pm_user_id,
            status:r.status, reason_open:r.reason_open };
          for (const k of ["notes","last_followed_up","budget_release_date","start_date","actual_start_date"])
            if (r[k] != null) patch[k] = r[k];
          await supa(`/rest/v1/past_projects?id=eq.${m.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
            body: JSON.stringify(patch) }, session.access_token);
        }
      }
      if (mode === "replace") {
        await supa("/rest/v1/past_projects?id=not.is.null",
          { method:"DELETE", headers:{ Prefer:"return=minimal" } }, session.access_token);
      }
      // One shape for every object: PostgREST rejects a bulk insert whose rows
      // have differing key sets (PGRST102).
      const body = (mode === "update" ? plan.add : parsed.rows).map(r => ({
        code:r.code, name:r.name, campus:r.campus, fiscal_year:r.fiscal_year,
        approved_amount:r.approved_amount, released_amount:r.released_amount,
        pm_user_id:r.pm_user_id, status:r.status, reason_open:r.reason_open,
        notes:r.notes, last_followed_up:r.last_followed_up, created_by:session.user_id,
        start_date:r.start_date, budget_release_date:r.budget_release_date,
        actual_start_date:r.actual_start_date,
      }));
      for (let i = 0; i < body.length; i += 50) {
        await supa("/rest/v1/past_projects",
          { method:"POST", body:JSON.stringify(body.slice(i, i+50)),
            headers:{ Prefer:"return=minimal" } }, session.access_token);
      }
      // One summary line in the Activity Log; each row is also logged by trigger.
      await supa("/rest/v1/activity_log", { method:"POST", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({
          actor_id: session.user_id, actor_name: session.full_name || session.username, actor_role: session.role,
          action: "import", entity_type: "past_projects", entity_id: null,
          summary: mode === "update"
            ? `Updated ${plan.upd.length} and added ${body.length} past projects from ${parsed.fileName || "Excel"}`
            : `Imported ${body.length} past projects from ${parsed.fileName || "Excel"}`
              + (mode === "replace" ? " (replaced the existing list)" : " (added to the list)"),
          details: { imported: body.length, updated: mode === "update" ? plan.upd.length : 0, mode,
                     filename: parsed.fileName || null, without_pm: parsed.rows.filter(r => !r.pm_user_id).length },
        }) }, session.access_token).catch(() => {});
      setDone({ count: body.length + (mode === "update" ? plan.upd.length : 0), updated: mode === "update" ? plan.upd.length : 0 });
      onDone();
    } catch (e) { setErr(e.message || "The import could not be saved."); }
    setBusy(false);
  };

  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"8px 10px", fontSize:13, color:T.text, width:"100%", boxSizing:"border-box" };
  const noPm = parsed?.rows.filter(r => !r.pm_user_id).length || 0;

  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1350, background:"rgba(3,8,16,0.74)",
        backdropFilter:"blur(6px)", display:"flex", alignItems: isCompact ? "flex-end" : "center",
        justifyContent:"center", padding: isCompact ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="Import past projects"
        style={{ width:620, maxWidth:"100%", maxHeight:"90vh", overflow:"auto", background:T.surface,
          border:`1px solid ${T.border}`, borderRadius: isCompact ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          boxShadow:T.shadowLg, padding:SP.xxl }}>

        {done ? (
          <div>
            <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:SP.lg }}>
              <CheckCircle2 size={26} color={T.textOf(DATA.positive)} />
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:T.textOf(DATA.positive) }}>
                  {done.updated ? `${done.updated} updated, ${done.count - done.updated} added`
                    : `${done.count} past project${done.count === 1 ? "" : "s"} imported`}
                </div>
                <div style={{ fontSize:12.5, color:T.muted, marginTop:3 }}>Ready to follow up.</div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <Button T={T} variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ ...TYPE.display, fontSize:17, color:T.text, marginBottom:4 }}>
              Import past projects
            </div>
            <div style={{ fontSize:12.5, color:T.muted, marginBottom:SP.lg, lineHeight:1.6 }}>
              Download the template, fill it in, then bring it back. Nothing is written until you
              have seen what it found.
            </div>

            <div style={{ marginBottom:SP.md }}>
              <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>Spreadsheet</div>
              <input type="file" accept=".xlsx,.xls,.csv"
                onChange={e => pick(e.target.files?.[0])} style={inp} />
            </div>

            {parsed && (
              <>
                <div style={{ padding:SP.md, borderRadius:R.md, background:T.card2,
                  border:`1px solid ${T.border}`, marginBottom:SP.md }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:6 }}>
                    {parsed.rows.length} project{parsed.rows.length === 1 ? "" : "s"} found in {parsed.fileName}
                  </div>
                  {noPm > 0 && (
                    <div style={{ fontSize:11.5, color:T.textOf(DATA.warning), marginBottom:6 }}>
                      {noPm} with no project manager — those cannot be chased.
                    </div>
                  )}
                  <div className="pmo-scroll" style={{ maxHeight:180, overflow:"auto" }}>
                    {parsed.rows.slice(0, 60).map(r => (
                      <div key={r.line} style={{ fontSize:11.5, color:T.textSoft, lineHeight:1.75 }}>
                        <span style={{ color:T.dim }}>{r.fiscal_year}</span> · {r.name}
                        <span style={{ color:T.dim }}>
                          {r.pm_label ? ` · ${r.pm_label}` : " · no manager"} · {STATUS[r.status].label}
                        </span>
                      </div>
                    ))}
                    {parsed.rows.length > 60 && (
                      <div style={{ fontSize:11, color:T.dim, marginTop:4 }}>
                        …and {parsed.rows.length - 60} more
                      </div>
                    )}
                  </div>
                </div>

                {parsed.errors.length > 0 && (
                  <div style={{ padding:SP.md, borderRadius:R.md, marginBottom:SP.md,
                    background:`${DATA.warning}14`, border:`1px solid ${DATA.warning}3D` }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:T.textOf(DATA.warning),
                      marginBottom:5 }}>
                      {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} need attention
                    </div>
                    <div className="pmo-scroll" style={{ maxHeight:110, overflow:"auto" }}>
                      {parsed.errors.map((e,i) => (
                        <div key={i} style={{ fontSize:11.5, color:T.muted, lineHeight:1.65 }}>{e}</div>
                      ))}
                    </div>
                  </div>
                )}

                {existingCount > 0 && (
                  <div style={{ marginBottom:SP.md }}>
                    <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>
                      There are already {existingCount} past project{existingCount === 1 ? "" : "s"}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[["update","Update them and add new ones"],["append","Add all as new"],["replace","Replace them all"]].map(([v,l]) => (
                        <button key={v} className="pmo-focusable pmo-btn" onClick={() => setMode(v)}
                          style={{ padding:"6px 12px", borderRadius:R.pill, fontSize:12, cursor:"pointer",
                            background: mode === v ? `${BRAND.blue}22` : "transparent",
                            border:`1px solid ${mode === v ? `${BRAND.blue}66` : T.border}`,
                            color: mode === v ? T.textOf(BRAND.blue) : T.muted,
                            fontWeight: mode === v ? 700 : 500 }}>{l}</button>
                      ))}
                    </div>
                    {mode === "update" && plan && (
                      <div style={{ fontSize:11.5, color:T.muted, marginTop:6 }}>
                        {plan.upd.length} will be updated (matched by Project ID and name), {plan.add.length} added.
                        Their follow-up threads and work breakdowns stay.
                      </div>
                    )}
                    {mode === "replace" && (
                      <div style={{ fontSize:11.5, color:T.textOf(DATA.danger), marginTop:6 }}>
                        All {existingCount} existing past projects and their follow-up threads will be
                        deleted first.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {err && (
              <div style={{ marginBottom:SP.md, padding:"9px 12px", borderRadius:R.sm,
                background:`${DATA.danger}14`, border:`1px solid ${DATA.danger}3D`,
                fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
            )}

            <div style={{ display:"flex", justifyContent:"flex-end", gap:SP.sm }}>
              <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button T={T} variant="primary" onClick={commit} loading={busy}
                disabled={!parsed?.rows.length}>
                {!parsed?.rows.length ? "Import" : mode === "update" && plan ? `Update ${plan.upd.length} · add ${plan.add.length}` : `Import ${parsed.rows.length}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── The page ────────────────────────────────────────────────────────────── */
export function PastProjectsPage({ T, session, supa, isCompact, initialOpen = null, onInitialOpened, onUnreadChange }) {
  usePastStyles();
  const [rows, setRows]   = useState(null);
  const [err, setErr]     = useState(null);
  const [q, setQ]         = useState("");
  const [fy, setFy]       = useState("");
  const [status, setStatus] = useState("open_all");
  const [pm, setPm]       = useState("");
  const [openId, setOpenId] = useState(null);
  const [view, setView]   = useState("list");      // list | timeline | pms
  const [groupBy, setGroupBy] = useState("campus"); // campus | fy | pm
  const [campus, setCampus] = useState("");
  const [prog, setProg]   = useState("");          // "" | In Progress | No progress | gap
  const [rollup, setRollup] = useState({});       // past_project_id -> task roll-up
  const [collapsed, setCollapsed] = useState({});
  const [hover, setHover] = useState(null);
  const [importing, setImporting] = useState(false);
  const [pmAccounts, setPmAccounts] = useState([]);   // every active account — used to match a name on import
  const [pmSuggest,  setPmSuggest]  = useState([]);   // managers and anyone running a project — the template dropdown
  const [chatPm, setChatPm] = useState(null);           // project manager whose chat is open
  const [unread, setUnread] = useState({});             // 'pm:<id>' / 'project:<id>' -> count
  const [lastByPm, setLastByPm] = useState({});         // latest chat message per manager (PMO)

  const isPMO = session?.role === "pmo";
  // Two guest accounts see everything the PMO sees here and can ask, but not edit.
  const [viewer, setViewer] = useState(false);
  useEffect(() => { let on = true; isPastViewer(supa, session).then(v => { if (on) setViewer(v); }); return () => { on = false; }; }, [supa, session]);
  const seeAll = isPMO || viewer;

  // Unread counts for the badges here and in the menu.
  const refreshUnread = useCallback(async () => {
    const u = await loadPastUnread(supa, session);
    setUnread(u.byThread); onUnreadChange?.(u.total);
    if (seeAll) {
      try {
        const m = await supa("/rest/v1/past_pm_messages?select=pm_user_id,author_role,body,created_at&order=created_at.desc&limit=500",
                             {}, session.access_token);
        const last = {};
        (Array.isArray(m) ? m : []).forEach(x => { if (!last[x.pm_user_id]) last[x.pm_user_id] = x; });
        setLastByPm(last);
      } catch { /* the preview line is optional */ }
    }
  }, [supa, session, seeAll]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // A link from an email: ?past=<project> or ?pastpm=<manager>.
  useEffect(() => {
    if (!initialOpen || rows === null) return;
    if (initialOpen.kind === "project" && rows.some(r => r.id === initialOpen.id)) setOpenId(initialOpen.id);
    if (initialOpen.kind === "pm") { setOpenId(null); setChatPm(seeAll ? initialOpen.id : session.user_id); }
    onInitialOpened?.();
  }, [initialOpen, rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const r = await supa("/rest/v1/past_project_summary?select=*&order=fiscal_year.desc",
                           {}, session.access_token);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setRows([]); }
    // Task progress for the timeline. A failure here must not cost the page.
    try {
      const t = await supa("/rest/v1/past_project_task_rollup?select=*", {}, session.access_token);
      setRollup(Object.fromEntries((Array.isArray(t) ? t : []).map(x => [x.past_project_id, x])));
    } catch { /* roll-up is optional */ }
  }, [supa, session]);
  useEffect(() => { load(); }, [load]);
  const openRow = useMemo(() => (rows || []).find(r => r.id === openId) || null, [rows, openId]);
  const pageRef = useRef(null);
  useEffect(() => { pageRef.current?.scrollTo?.({ top:0 }); }, [openId]);

  // Needed for the template's dropdown and to match a name back to an account
  // on import. PMO only — a project manager never sees these controls.
  useEffect(() => {
    if (!isPMO) return;
    // Every active account, not just role=project_manager. Waleed Jamshed
    // manages four current projects on a guest account, so filtering by role
    // would have silently refused to match a real project manager by name.
    Promise.all([
      supa("/rest/v1/user_profiles?is_active=eq.true&select=id,username,full_name,role"
         + "&order=full_name.asc", {}, session.access_token),
      supa("/rest/v1/project_assignments?select=user_id", {}, session.access_token).catch(() => []),
    ]).then(([users, asg]) => {
      const assigned = new Set((asg || []).map(a => a.user_id));
      const all = Array.isArray(users) ? users : [];
      setPmAccounts(all.filter(u => !/audit test/i.test(u.full_name || "")));
      // The dropdown offers managers and anyone already running a project;
      // matching on import accepts any active account.
      setPmSuggest(all.filter(u =>
        (u.role === "project_manager" || assigned.has(u.id)) &&
        !/audit test/i.test(u.full_name || "")));
    }).catch(() => {});
  }, [isPMO, supa, session]);

  // The edit form's manager list: every active account except the PMO's own,
  // since a guest (Waleed Jamshed) also runs projects.
  const pmChoices = useMemo(() => pmAccounts.filter(u => u.role !== "pmo"), [pmAccounts]);

  const years = useMemo(() => [...new Set((rows||[]).map(r => r.fiscal_year))].sort().reverse(), [rows]);
  const campuses = useMemo(() => [...new Set((rows||[]).map(r => r.campus).filter(Boolean))].sort(), [rows]);
  const pms   = useMemo(() => [...new Set((rows||[]).map(r => r.pm_name).filter(Boolean))].sort(), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows||[]).filter(r =>
      (!fy || r.fiscal_year === fy) &&
      (!pm || r.pm_name === pm) && (!campus || r.campus === campus) &&
      (!prog || progressOf(r).label === prog) &&
      (status === "all" ? true : status === "open_all" ? r.status !== "closed" : r.status === status) &&
      (!needle || `${r.code||""} ${r.name||""} ${r.reason_open||""} ${r.campus||""} ${r.pm_name||""}`.toLowerCase().includes(needle))
    );
  }, [rows, q, fy, pm, campus, prog, status]);

  // Grouped by campus (default), fiscal year or manager; oldest release first
  // inside a group, since the longest-open project is the one to chase.
  const groups = useMemo(() => {
    const keyOf = (r) => groupBy === "fy" ? r.fiscal_year : groupBy === "pm" ? (r.pm_name || "No project manager") : (r.campus || "No campus");
    const m = {};
    list.forEach(r => { (m[keyOf(r)] ||= []).push(r); });
    Object.values(m).forEach(g => g.sort((a,b) => (ageOf(b).days ?? -1) - (ageOf(a).days ?? -1)));
    const val = (rs) => rs.reduce((s,r) => s + (parseFloat(r.approved_amount)||0), 0);
    return Object.entries(m).sort((a,b) => groupBy === "fy" ? b[0].localeCompare(a[0]) : val(b[1]) - val(a[1]));
  }, [list, groupBy]);

  const totals = useMemo(() => {
    const src = (rows||[]).filter(r => r.status !== "closed");
    const sum = (k) => src.reduce((s,r) => s + (parseFloat(r[k])||0), 0);
    return {
      openCount: src.length,
      approved: sum("approved_amount"), released: sum("released_amount"),
      noProgress: src.filter(r => progressOf(r).label === "No progress").length,
      old: src.filter(r => ageOf(r).key === "old").length,
      stale: src.filter(r => (r.days_since_followup ?? 9999) > 30).length,
    };
  }, [rows]);

  // exceljs rather than the bundled SheetJS: the community build writes column
  // widths and then silently drops fills, fonts, freeze panes and validation.
  // Lazily imported, so only someone who clicks Template downloads it.
  const downloadTemplate = async () => {
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new ExcelJS.Workbook();
    wb.creator = "Riphah PMO Portal"; wb.created = new Date();
    const NAVY = "FF13294B", RULE = "FFC7D0DC";
    const head = (c) => {
      c.font = { name:"Arial", size:10, bold:true, color:{ argb:"FFFFFFFF" } };
      c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
      c.alignment = { vertical:"middle", horizontal:"center", wrapText:true };
      c.border = { top:{style:"thin",color:{argb:RULE}}, left:{style:"thin",color:{argb:RULE}},
                   bottom:{style:"thin",color:{argb:RULE}}, right:{style:"thin",color:{argb:RULE}} };
    };

    const g = wb.addWorksheet("How to fill this in", {
      views:[{ showGridLines:false }],
      pageSetup:{ orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0 },
    });
    g.columns = [{ width:3 }, { width:24 }, { width:76 }];
    const title = (r,t,sz=15) => {
      const c=g.getCell(`B${r}`); c.value=t;
      c.font={ name:"Arial", size:sz, bold:true, color:{argb:"FF0D1929"} };
    };
    const para = (r,t) => {
      g.mergeCells(`B${r}:C${r}`);
      const c=g.getCell(`B${r}`); c.value=t;
      c.font={ name:"Arial", size:10.5, color:{argb:"FF3A5068"} };
      c.alignment={ wrapText:true, vertical:"top" };
      g.getRow(r).height = Math.max(15, 13*Math.ceil(t.length/112));
    };
    title(2,"Past Projects — how to fill this in",16);
    para(3,"The 'Past Projects' sheet holds every project now in the portal. Change or add rows and bring "
          + "it back with Import. One row per project; only Project Name and Fiscal Year are required.");
    title(5,"What goes in each column",13);
    const guide=[
      ["Project ID","SAP code, e.g. IT.261104-01. Used to match a row to a project already in the portal."],
      ["Project Name","Required."],
      ["Campus","Al-Mizan, G-7, I-14, GGC, Lahore, Malakand, PRH, RIH, MHH. 'G7' and 'Al mizan' are read as G-7 and Al-Mizan."],
      ["Fiscal Year","Required. Pick from the dropdown, e.g. FY 25-26."],
      ["Approved Amount","Rupees, as a number. No commas or 'PKR'."],
      ["Released Amount","Rupees, as a number."],
      ["Project Manager","Pick from the dropdown. A name with no portal account imports with no "
                       + "manager, and nobody can be chased about it."],
      ["Status","Open, Closing or Closed. Defaults to Open."],
      ["Why Still Open","In Progress or No progress (dropdown), or a short note."],
      ["Budget Release Date","YYYY-MM-DD. When the money was released. It also becomes the actual "
                           + "start, and the time since it is how long the project shows as open."],
      ["Project Start Date","YYYY-MM-DD. When the work started."],
      ["Last Follow Up","YYYY-MM-DD, if known. The portal fills this in itself from the follow-up chats."],
      ["Notes","Anything else worth keeping. Optional."],
    ];
    guide.forEach(([k,v],i) => {
      const r=7+i, a=g.getCell(`B${r}`), b=g.getCell(`C${r}`);
      a.value=k; b.value=v;
      a.font={ name:"Arial", size:10, bold:true, color:{argb:"FF13294B"} };
      b.font={ name:"Arial", size:10, color:{argb:"FF3A5068"} };
      b.alignment={ wrapText:true, vertical:"top" };
      [a,b].forEach(c => c.border={ bottom:{ style:"hair", color:{argb:RULE} } });
      g.getRow(r).height=21;
    });
    const tip = 7 + guide.length + 2;
    title(tip,"Things worth knowing",13);
    [ "These are kept completely separate from FY 26-27. They appear in no current-year total, "
      + "chart, deadline alert or the risk matrix.",
      "Importing again updates the projects already in the portal (matched by Project ID and name) "
      + "and adds the new ones; follow-up chats and work breakdowns are kept.",
      "A project manager sees only their own past projects and can reply in the portal. They "
      + "cannot change the reason or close a project — those stay with PMO.",
      "Leave unused rows blank. Empty rows are ignored.",
    ].forEach((t,i) => para(tip + 2 + i*2, "\u2022  " + t));

    const ws = wb.addWorksheet("Past Projects", {
      views:[{ state:"frozen", xSplit:2, ySplit:1, showGridLines:false }],
      pageSetup:{ orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0,
                  printTitlesRow:"1:1" },
    });
    ws.columns = XL_COLS.map((h,i) => ({ header:h,
      width:[16,46,14,13,18,18,26,12,22,19,19,16,40][i] }));
    ws.getRow(1).height=28; ws.getRow(1).eachCell(head);

    const names = (pmSuggest||[]).map(p => (p.full_name || p.username))
                           .filter(n => n && !/audit test/i.test(n));
    const ROWS = 200;
    for (let i = 2; i <= ROWS + 1; i++) {
      const row = ws.getRow(i); row.height = 17;
      for (let c = 1; c <= XL_COLS.length; c++) {
        const cell = row.getCell(c);
        cell.font={ name:"Arial", size:10, color:{argb:"FF1F2937"} };
        cell.border={ bottom:{style:"hair",color:{argb:RULE}}, right:{style:"hair",color:{argb:RULE}} };
        if (i % 2 === 0) cell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:"FFF6F9FC"} };
        if (c === 5 || c === 6) cell.numFmt = "#,##0";
        if (c >= 10 && c <= 12) { cell.numFmt = "yyyy-mm-dd"; cell.alignment={ horizontal:"center" }; }
        if (c === 3 || c === 4 || c === 8 || c === 9) cell.alignment={ horizontal:"center" };
      }
      row.getCell(4).dataValidation = { type:"list", allowBlank:true,
        formulae:['"FY 21-22,FY 22-23,FY 23-24,FY 24-25,FY 25-26"'] };
      row.getCell(8).dataValidation = { type:"list", allowBlank:true,
        formulae:['"Open,Closing,Closed"'] };
      // A suggestion list; a short note is still accepted.
      row.getCell(9).dataValidation = { type:"list", allowBlank:true, showErrorMessage:false,
        formulae:[`"${PROGRESS.join(",")}"`] };
      if (names.length) row.getCell(7).dataValidation = { type:"list", allowBlank:true,
        formulae:[`"${names.join(",")}"`] };
    }
    ws.autoFilter = { from:"A1", to:"M1" };
    // Today's projects, so the sheet can be edited and brought back.
    (rows || []).forEach((r, i) => {
      const row = ws.getRow(i + 2);
      [r.code, r.name, r.campus, r.fiscal_year, Number(r.approved_amount) || 0, Number(r.released_amount) || 0,
       r.pm_name || "", (STATUS[r.status] || STATUS.open).label, r.reason_open || "",
       r.budget_release_date ? new Date(r.budget_release_date) : null, r.start_date ? new Date(r.start_date) : null,
       r.last_followed_up ? new Date(r.last_followed_up) : null, r.notes || ""]
        .forEach((v, c) => { row.getCell(c + 1).value = v ?? null; });
    });

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf],
      { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = "Past_Projects_Template.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (rows === null) return <div style={{ padding:SP.xxl, color:T.muted, fontSize:13 }}>Loading past projects…</div>;

  return (
    <div ref={pageRef} className="pmo-scroll" style={{ flex:1, overflow:"auto", background:T.page }}>
      <div style={{ padding: isCompact ? SP.lg : `${SP.xl}px ${SP.xxl}px`, position:"relative" }}>

        {/* Ambient wash. Sits in its own absolutely-positioned layer with
            pointer-events off, so the animated transform never becomes a
            containing block for anything interactive above it. */}
        <div aria-hidden="true" style={{ position:"absolute", inset:0, overflow:"hidden",
          pointerEvents:"none", zIndex:0 }}>
          <div className="past-glow" style={{ position:"absolute", top:"-22%", left:"8%",
            width:520, height:520, borderRadius:"50%",
            background:`radial-gradient(circle, ${BRAND.gold}22 0%, transparent 68%)` }} />
          <div className="past-glow" style={{ position:"absolute", bottom:"-28%", right:"4%",
            width:600, height:600, borderRadius:"50%", animationDelay:"-13s",
            background:`radial-gradient(circle, ${BRAND.blue}1F 0%, transparent 70%)` }} />
        </div>

        <div style={{ position:"relative", zIndex:1 }}>
          {openRow ? (
            <PastProjectDetail T={T} session={session} supa={supa} row={openRow}
              roll={rollup[openRow.id]} isPMO={isPMO} viewer={viewer} isCompact={isCompact}
              pms={pmChoices} onRead={refreshUnread}
              onOpenPm={(id) => { setOpenId(null); setChatPm(id); }}
              onBack={() => setOpenId(null)} onChanged={load} />
          ) : chatPm ? (
            <PmChat key={chatPm} T={T} session={session} supa={supa} isPMO={isPMO} viewer={viewer} isCompact={isCompact}
              pm={{ id: chatPm, full_name: (rows.find(r => r.pm_user_id === chatPm) || {}).pm_name
                     || (chatPm === session.user_id ? (session.full_name || session.username) : "Project manager") }}
              projects={rows.filter(r => r.pm_user_id === chatPm)}
              onOpenProject={(id) => { setChatPm(null); setOpenId(id); }}
              onBack={() => { setChatPm(null); if (seeAll) setView("pms"); }}
              onRead={refreshUnread} />
          ) : (<>
          {/* Summary strip — PMO only; a project manager sees just their own projects. */}
          {seeAll && <div style={{ display:"grid", gap:SP.md, marginBottom:SP.lg,
            gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(5, minmax(0,1fr))" }}>
            {[
              { k:"Still open",       v:totals.openCount, sub:`${totals.old} open over a year`, c:DATA.danger, Icon:History },
              { k:"Approved",         v:`PKR ${fmtM(totals.approved)}`, sub:"on open projects", c:BRAND.gold, Icon:CheckCircle2 },
              { k:"Released",         v:`PKR ${fmtM(totals.released)}`,
                sub: totals.approved ? `${Math.round(totals.released / totals.approved * 100)}% of approved` : "—", c:DATA.positive, Icon:Download,
                bar: totals.approved ? totals.released / totals.approved : null },
              { k:"No progress",      v:totals.noProgress, sub:"marked in the sheet", c:DATA.danger, Icon:AlertTriangle,
                onClick: totals.noProgress ? () => setProg(p => p === "No progress" ? "" : "No progress") : null, on: prog === "No progress" },
              { k:"Not chased",       v:totals.stale, sub:"over 30 days", c:T.muted, Icon:Clock },
            ].map(({k,v,sub,c,Icon,bar,onClick,on}, i, all) => (
              <div key={k} className="past-row" onClick={onClick || undefined} role={onClick ? "button" : undefined}
                title={onClick ? (on ? "Show all" : `Show only these`) : undefined}
                style={{ animationDelay:`${i*50}ms`, cursor: onClick ? "pointer" : "default",
                outline: on ? `2px solid ${c}` : "none",
                // Five cards in a two-column phone grid: the last one takes the row.
                gridColumn: isCompact && all.length % 2 && i === all.length - 1 ? "1 / -1" : undefined,
                position:"relative", overflow:"hidden", padding:`${SP.md}px ${SP.lg}px`,
                background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg,
                boxShadow:T.shadow }}>
                <div aria-hidden="true" style={{ position:"absolute", inset:0,
                  background:`linear-gradient(135deg, ${c}${T.wash} 0%, transparent 58%)`,
                  pointerEvents:"none" }} />
                <div style={{ position:"relative", display:"flex", alignItems:"center", gap:8 }}>
                  <Icon size={13} color={c} />
                  <span style={{ ...TYPE.label, color:T.muted }}>{k}</span>
                </div>
                <div style={{ position:"relative", ...TYPE.metricSm, fontSize:24, color:T.text,
                  marginTop:6, lineHeight:1.1 }}>{v}</div>
                <div style={{ position:"relative", ...TYPE.caption, color:T.dim, marginTop:2 }}>{sub}</div>
                {bar != null && (
                  <div style={{ position:"relative", height:4, borderRadius:R.pill, background:T.card2, marginTop:6, overflow:"hidden" }}>
                    <div style={{ width:`${Math.min(bar,1)*100}%`, height:"100%", background:c }} />
                  </div>
                )}
              </div>
            ))}
          </div>}
          {!seeAll && (
            <div style={{ marginBottom:SP.lg, padding:`${SP.md}px ${SP.lg}px`, borderRadius:R.lg, background:T.surface,
              border:`1px solid ${T.border}`, fontSize:13, color:T.textSoft, lineHeight:1.6 }}>
              Projects from earlier fiscal years still being followed up: what was approved and released, and how
              long each has been open since its budget release. Reply to the PMO on a project's Follow-up tab, or use
              <b> Chat with PMO</b> for all of them at once.
            </div>
          )}

          {/* Controls */}
          <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center",
            marginBottom:SP.md }}>
            <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)}
              onClear={() => setQ("")} placeholder="Search name, ID, campus or manager…"
              style={{ flex:"0 1 280px", minWidth:160 }} />
            {view !== "pms" && (
              <Select T={T} value={groupBy} onChange={e => setGroupBy(e.target.value)} aria-label="Group by">
                <option value="campus">Group by campus</option>
                <option value="fy">Group by fiscal year</option>
                {seeAll && <option value="pm">Group by manager</option>}
              </Select>
            )}
            {campuses.length > 1 && (
              <Select T={T} value={campus} onChange={e => setCampus(e.target.value)}>
                <option value="">All campuses</option>
                {campuses.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
            <Select T={T} value={prog} onChange={e => setProg(e.target.value)}>
              <option value="">Any progress</option>
              {PROGRESS.map(x => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select T={T} value={fy} onChange={e => setFy(e.target.value)}>
              <option value="">All fiscal years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Select T={T} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="open_all">Open and closing</option>
              <option value="open">Open only</option>
              <option value="closing">Closing only</option>
              <option value="closed">Closed only</option>
              <option value="all">Everything</option>
            </Select>
            {seeAll && (
              <Select T={T} value={pm} onChange={e => setPm(e.target.value)}>
                <option value="">All project managers</option>
                {pms.map(n => <option key={n} value={n}>{n}</option>)}
              </Select>
            )}
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:SP.sm,
              flexWrap:"wrap" }}>
              <div role="tablist" aria-label="View" data-tour="past-views" style={{ display:"flex", padding:2, borderRadius:R.pill,
                border:`1px solid ${T.border}`, background:T.surface }}>
                {[["list","List",List],["timeline","Timeline",CalendarRange],
                  ["pms", seeAll ? "By PM" : "Chat with PMO", MessageSquare]].map(([v,l,Ic]) => (
                  <button key={v} role="tab" aria-selected={view === v}
                    className="pmo-focusable pmo-btn"
                    onClick={() => { if (v === "pms" && !seeAll) { setChatPm(session.user_id); return; } setView(v); }}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px",
                      borderRadius:R.pill, border:"none", cursor:"pointer", fontSize:12,
                      background: view === v ? `${BRAND.blue}22` : "transparent",
                      color: view === v ? T.textOf(BRAND.blue) : T.muted,
                      fontWeight: view === v ? 700 : 500 }}>
                    <Ic size={12} /> {l}
                    {v === "pms" && (() => { const n = Object.entries(unread).filter(([k]) => k.startsWith("pm:"))
                      .reduce((a, [, x]) => a + x, 0); return n ? <UnreadDot T={T} n={n} /> : null; })()}
                  </button>
                ))}
              </div>
              <span style={{ ...TYPE.caption, color:T.muted }}>{list.length} shown</span>
              {isPMO && (
                <>
                  <Button T={T} variant="ghost" icon={Download} onClick={downloadTemplate}>
                    Download sheet
                  </Button>
                  <Button T={T} variant="primary" icon={Upload} onClick={() => setImporting(true)}>
                    Import
                  </Button>
                </>
              )}
            </div>
          </div>

          {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.md }}>{err}</div>}

          {view === "pms" && seeAll ? (
            <PmsView T={T} rows={rows} unread={unread} lastByPm={lastByPm} isCompact={isCompact}
              onOpen={(id) => setChatPm(id)} />
          ) : view === "timeline" ? (
            <PastAging T={T} groups={groups} isCompact={isCompact} onOpen={(r) => setOpenId(r.id)} />
          ) : groups.length === 0 ? (
            <div style={{ padding:SP.xxl, textAlign:"center", background:T.surface,
              border:`1px solid ${T.border}`, borderRadius:R.lg, color:T.muted, fontSize:13 }}>
              Nothing matches these filters.
            </div>
          ) : groups.map(([year, items], gi) => {
            const shut = collapsed[year];
            const sumOf = (k) => items.reduce((s,r) => s + (parseFloat(r[k])||0), 0);
            const gApp = sumOf("approved_amount"), gRel = sumOf("released_amount");
            return (
              <div key={year} style={{ marginBottom:SP.lg }}>
                <button className="pmo-focusable pmo-btn"
                  onClick={() => setCollapsed(c => ({ ...c, [year]: !c[year] }))}
                  style={{ display:"flex", alignItems:"center", gap:8, width:"100%",
                    background:"none", border:"none", cursor:"pointer", padding:"0 0 8px",
                    textAlign:"left" }}>
                  {shut ? <ChevronRight size={14} color={T.muted} /> : <ChevronDown size={14} color={T.muted} />}
                  <span style={{ ...TYPE.label, color:T.text, fontSize:11 }}>{year}</span>
                  <span style={{ ...TYPE.caption, color:T.dim }}>
                    {items.length} project{items.length===1?"":"s"} · PKR {fmtM(gApp)} approved · {fmtM(gRel)} released
                  </span>
                  {gApp > 0 && (
                    <span aria-hidden="true" style={{ flex:"0 0 80px", height:4, borderRadius:R.pill, background:T.card2, overflow:"hidden" }}>
                      <span style={{ display:"block", width:`${Math.min(gRel/gApp,1)*100}%`, height:"100%",
                        background: gRel >= gApp ? DATA.positive : DATA.warning }} />
                    </span>
                  )}
                </button>

                {!shut && (
                  <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
                    {items.map((r, i) => {
                      const st = STATUS[r.status] || STATUS.open;
                      const ag = ageOf(r), am = AGE[ag.key], pg = progressOf(r);
                      const pct = relPct(r);
                      const stale = (r.days_since_followup ?? 9999) > 30 && r.status !== "closed";
                      const hot = hover === r.id;
                      const on = CAN_HOVER ? { onMouseEnter:() => setHover(r.id),
                                               onMouseLeave:() => setHover(null) } : {};
                      const meta = [groupBy !== "campus" && r.campus, groupBy !== "pm" && (r.pm_name || "No project manager"),
                                    groupBy !== "fy" && r.fiscal_year].filter(Boolean);
                      return (
                        <div key={r.id} {...on} onClick={() => setOpenId(r.id)}
                          className="past-row" style={{ animationDelay:`${Math.min(i,8)*40 + gi*60}ms`,
                            position:"relative", overflow:"hidden", cursor:"pointer",
                            display:"flex", alignItems:"stretch", gap:SP.md,
                            padding:`${SP.md}px ${SP.lg}px`,
                            background: hot ? T.surfaceRaised : T.surface,
                            border:`1px solid ${hot ? T.borderStrong : T.border}`,
                            borderRadius:R.lg,
                            boxShadow: hot ? T.glowSoft(am.color) : T.shadow,
                            transform: hot ? "translateY(-1px)" : "none",
                            transition:`background ${MOTION.fast}, border-color ${MOTION.fast},
                                        box-shadow ${MOTION.base}, transform ${MOTION.base}` }}>
                          <span aria-hidden="true" title={am.label} style={{ width:3, borderRadius:2,
                            background:am.color, flexShrink:0, opacity: hot ? 1 : .75,
                            transition:`opacity ${MOTION.fast}` }} />

                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                              {r.code && <span style={{ ...TYPE.mono, fontSize:9.5, color:T.dim }}>{r.code}</span>}
                              <span style={{ fontSize:13.5, color:T.text, fontWeight:600 }}>{r.name}</span>
                            </div>
                            <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>
                              {meta.join(" · ")}{meta.length ? " · " : ""}
                              {ag.days == null ? "no release date" : `released ${fmtDate(r.budget_release_date || r.start_date)} · open ${span(ag.days)}`}
                            </div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:7, alignItems:"center" }}>
                              <span style={{ ...TYPE.caption, fontWeight:700, padding:"1px 8px", borderRadius:R.pill,
                                background:`${pg.color}${T.badge}`, color:T.textOf(pg.color) }}>{pg.label}</span>
                              {pg.text && <span style={{ fontSize:11.5, color:T.textSoft, overflow:"hidden", textOverflow:"ellipsis",
                                whiteSpace:"nowrap", maxWidth:360 }}>{pg.text}</span>}
                              {r.status !== "open" && (
                                <span style={{ ...TYPE.caption, fontWeight:700, padding:"1px 8px", borderRadius:R.pill,
                                  background:`${st.color}${T.badge}`, color:T.textOf(st.color) }}>{st.label}</span>
                              )}
                              <span style={{ ...TYPE.caption, color: stale ? T.textOf(DATA.warning) : T.dim,
                                display:"inline-flex", alignItems:"center", gap:4 }}>
                                {stale && <Clock size={10} />}{ago(r.days_since_followup)}
                              </span>
                            </div>
                          </div>

                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end",
                            justifyContent:"space-between", flexShrink:0, gap:6, minWidth: isCompact ? 76 : 120 }}>
                            <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                              <UnreadDot T={T} n={unread[`project:${r.id}`] || 0} />
                              <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{fmtM(r.approved_amount)}</span>
                            </span>
                            <div style={{ width:"100%", textAlign:"right" }}>
                              {pct != null && (
                                <div title={`Released PKR ${fmtM(r.released_amount)} of ${fmtM(r.approved_amount)}`}
                                  style={{ height:4, borderRadius:R.pill, background:T.card2, overflow:"hidden", marginBottom:3 }}>
                                  <div style={{ width:`${pct}%`, height:"100%", background: pct >= 100 ? DATA.positive : DATA.warning }} />
                                </div>
                              )}
                              <div style={{ ...TYPE.caption, color:T.dim }}>
                                {pct == null ? "no amount" : `${Math.round(pct)}% released`}
                              </div>
                              <div style={{ ...TYPE.caption, color:T.dim }}>
                                {r.update_count ? `${r.update_count} message${r.update_count===1?"":"s"}` : "not asked"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </>)}
        </div>
      </div>

      {importing && (
        <ImportModal T={T} session={session} supa={supa} pms={pmAccounts}
          existing={rows} isCompact={isCompact}
          onClose={() => setImporting(false)} onDone={load} />
      )}

    </div>
  );
}
