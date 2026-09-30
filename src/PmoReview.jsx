import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ClipboardCheck, Search, ArrowLeft, ExternalLink, RefreshCw, FileText, Paperclip,
         History, Download, Inbox, Clock, CheckCircle2, XCircle, PenLine,
         ListTree, Banknote, CalendarRange } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, Input, Button, Surface, Tabs, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PMO REVIEW — PDDs from the E-PDD portal (pmo.riphah.edu.pk)

   The edge function `epdd-sync` copies every PDD, with its attachments, into
   epdd_pdds / epdd_files every 5 minutes. A PDD waiting in the E-PDD portal's
   Manage PMO Form has queue = 'manage'; everything already processed there is
   'status'. This page only reads. The PMO approves or rejects in the E-PDD
   portal itself, which is why every PDD links back to it.

   PMO only, in the nav and in the database (RLS on every epdd_* table and on
   the epdd-files bucket).
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";

const fmtM = (n) => {
  const v = parseFloat(n);
  if (!isFinite(v)) return "—";
  return v >= 1e6 ? (v / 1e6).toLocaleString("en", { minimumFractionDigits:1, maximumFractionDigits:2 }) + "M"
                  : v.toLocaleString("en");
};
const fmtFull = (n) => {
  const v = parseFloat(n);
  return isFinite(v) ? v.toLocaleString("en-PK", { maximumFractionDigits:2 }) : "—";
};
const fmtDate = (d) => d ? new Date(d.length === 10 ? d + "T00:00:00" : d)
  .toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-GB", { day:"numeric", month:"short",
  year:"numeric", hour:"numeric", minute:"2-digit", timeZone:"Asia/Karachi" }) : "—";
const ago = (d) => {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmtDate(d);
};
const fmtBytes = (b) => b == null ? "" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB"
  : Math.max(1, Math.round(b / 1024)) + " KB";
const encodeStoragePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const viewable = (f) => /^(application\/pdf|image\/|text\/plain)/.test(f?.mime || "")
  || /\.(pdf|png|jpe?g|gif|webp)$/i.test(f?.file_name || "");

// E-PDD status → colour. Anything still moving through approvals is blue.
const statusColor = (s, T) => {
  const x = String(s || "").toLowerCase();
  if (x.includes("not approved")) return DATA.danger;
  if (x === "pmo approved" || x === "all approved") return DATA.positive;
  if (x.includes("incomplete")) return T.muted;
  if (x.includes("in progress")) return DATA.warning;
  return DATA.info;
};
const decisionColor = (s) => {
  const x = String(s || "").toLowerCase();
  if (/reject|not approved|declin/.test(x)) return DATA.danger;
  if (/updat/.test(x)) return DATA.warning;
  if (/recommend|approv|forward/.test(x)) return DATA.positive;
  return DATA.info;
};

let stylesIn = false;
function useReviewStyles() {
  useEffect(() => {
    if (stylesIn) return;
    stylesIn = true;
    const el = document.createElement("style");
    el.textContent = `
@keyframes revIn    { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes revGlow  { 0%,100% { opacity:.2; transform:translate3d(-4%,-3%,0) scale(1); }
                      50%      { opacity:.38; transform:translate3d(4%,3%,0) scale(1.08); } }
@keyframes revPulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
@keyframes revSpin  { to { transform:rotate(360deg); } }
.rev-row  { animation: revIn .42s cubic-bezier(.22,.8,.3,1) backwards; }
.rev-glow { animation: revGlow 26s ease-in-out infinite; will-change: opacity, transform; }
.rev-dot  { animation: revPulse 2.4s ease-in-out infinite; }
.rev-spin { animation: revSpin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .rev-row, .rev-glow, .rev-dot, .rev-spin { animation: none !important; }
}`;
    document.head.appendChild(el);
  }, []);
}

const Pill = ({ T, color, children, pulse }) => (
  <span className={pulse ? "rev-dot" : ""} style={{ ...TYPE.caption, fontWeight:700, padding:"2px 9px",
    borderRadius:R.pill, background:`${color}${T.badge}`, color:T.textOf(color), whiteSpace:"nowrap",
    display:"inline-flex", alignItems:"center", gap:4 }}>{children}</span>
);

// One labelled block of PDD text. Empty fields say so, in the PMO's favour:
// a blank field is itself something to send back.
function Field({ T, label, children, empty }) {
  const blank = empty ?? (children == null || children === "" || (Array.isArray(children) && !children.length));
  return (
    <div style={{ padding:`${SP.md}px ${SP.lg}px`, borderTop:`1px solid ${T.border}` }}>
      <div style={{ ...TYPE.label, color:T.dim, marginBottom:5 }}>{label}</div>
      {blank
        ? <div style={{ fontSize:12.5, color:T.textOf(DATA.warning), fontStyle:"italic" }}>Not filled in</div>
        : <div style={{ fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap",
            overflowWrap:"anywhere" }}>{children}</div>}
    </div>
  );
}

/* ── Detail ─────────────────────────────────────────────────────────────── */
function PddDetail({ T, session, supa, row, files, isCompact, onBack }) {
  const [tab, setTab] = useState("details");
  const [fileErr, setFileErr] = useState(null);
  const p = row.pdd || {};
  const items = p.items || [];
  const slots = p.file_slots || [];
  const approvals = Array.isArray(row.approvals) ? row.approvals : [];
  const sc = statusColor(row.epdd_status, T);
  const waiting = row.queue === "manage";

  // Stored copies, matched to the slots the PDD currently lists. A resubmitted
  // PDD can drop a file; only what it lists now is shown.
  const byKey = useMemo(() => {
    const m = {};
    for (const f of files) m[`${f.category}|${f.title}|${f.file_name}`] = f;
    return m;
  }, [files]);
  const selectedGroups = new Set(p.doc_types || []);
  const groups = useMemo(() => {
    const g = {};
    for (const s of slots) (g[s.group] ||= []).push(s);
    return Object.entries(g).filter(([name, list]) =>
      selectedGroups.has(name) || list.some(s => s.file));
  }, [slots]);   // eslint-disable-line react-hooks/exhaustive-deps
  const attached = slots.filter(s => s.file).length;

  // iOS blocks window.open after an await, so the tab is opened first and
  // pointed at the signed link once it arrives.
  const openFile = async (f, download) => {
    setFileErr(null);
    const w = download ? null : window.open("", "_blank");
    try {
      const res = await supa(`/storage/v1/object/sign/epdd-files/${encodeStoragePath(f.storage_path)}`,
        { method:"POST", body: JSON.stringify({ expiresIn: 120 }) }, session.access_token);
      if (!res.signedURL) throw new Error("Could not create a link for this file");
      let url = SUPA_URL + "/storage/v1" + res.signedURL;
      if (download) url += (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(f.file_name);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) { if (w) w.close(); setFileErr(e.message); }
  };

  const lineSum = items.reduce((s, it) => s + (parseFloat(it.total) || 0), 0);

  return (
    <div className="rev-row">
      <button className="pmo-focusable pmo-btn" onClick={onBack}
        style={{ display:"inline-flex", alignItems:"center", gap:6, background:"none", border:"none",
          cursor:"pointer", color:T.muted, padding:"2px 0", marginBottom:SP.md, ...TYPE.caption, fontSize:12.5 }}>
        <ArrowLeft size={14} /> PMO Review
      </button>

      <Surface T={T} tone={waiting ? BRAND.gold : sc} pad={isCompact ? SP.md : SP.lg} style={{ marginBottom:SP.md }}>
        <div style={{ display:"flex", gap:SP.md, alignItems:"flex-start", flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 320px", minWidth:0 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ ...TYPE.mono, fontSize:10.5, color:T.dim }}>{row.pdd_number}</span>
              {waiting && <Pill T={T} color={BRAND.gold} pulse>Waiting on PMO</Pill>}
              <Pill T={T} color={sc}>{row.epdd_status || "—"}</Pill>
              {row.changed_at && <Pill T={T} color={DATA.warning}><PenLine size={10} /> Resubmitted {ago(row.changed_at)}</Pill>}
            </div>
            <div style={{ ...TYPE.display, fontSize: isCompact ? 17 : 21, color:T.text, lineHeight:1.3, marginTop:4 }}>
              {row.project_name}
            </div>
            <div style={{ ...TYPE.caption, color:T.muted, marginTop:4, lineHeight:1.6 }}>
              {row.campus || "No campus"} · {row.project_type || "Type not given"} · {row.cost_center || "No cost centre"}
              <br />Initiated by {row.initiated_by || "—"}{row.initiated_by_designation ? ` (${row.initiated_by_designation})` : ""}
              {row.su_head ? ` · SU head ${row.su_head}` : ""} · received {fmtDateTime(row.received_at)}
            </div>
          </div>
          <a href={row.epdd_url} target="_blank" rel="noopener noreferrer" className="pmo-focusable"
            style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:R.sm,
              background:T.blue, color:"#fff", textDecoration:"none", fontSize:12.5, fontWeight:600,
              boxShadow:`0 2px 10px ${T.blue}44`, flexShrink:0 }}>
            Open in E-PDD portal <ExternalLink size={13} />
          </a>
        </div>
        <div style={{ display:"flex", gap:SP.sm, marginTop:SP.md, flexWrap:"wrap" }}>
          {[["Grand total", `${p.currency || "PKR"} ${fmtFull(row.grand_total)}`],
            ["Estimated total cost", `${p.currency || "PKR"} ${fmtFull(row.estimated_total)}`],
            ["Start → finish", `${fmtDate(row.start_date)} → ${fmtDate(row.finish_date)}`],
            ["Duration", p.estimated_duration || "—"],
            ["Attachments", `${attached}`]].map(([k, v]) => (
            <div key={k} style={{ padding:"6px 12px", borderRadius:R.sm, background:T.card2,
              border:`1px solid ${T.border}`, minWidth:0 }}>
              <div style={{ ...TYPE.label, color:T.dim, fontSize:8.5 }}>{k}</div>
              <div style={{ fontSize:12.5, fontWeight:700, color:T.text }}>{v}</div>
            </div>
          ))}
        </div>
      </Surface>

      <div style={{ ...TYPE.caption, color:T.muted, display:"flex", alignItems:"center", gap:6,
        marginBottom:SP.md, padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.md,
        background:`${BRAND.blue}${T.wash}`, border:`1px solid ${T.border}` }}>
        <ClipboardCheck size={13} color={T.textOf(BRAND.blue)} />
        Read-only copy. Approve or reject in the E-PDD portal. The automatic review arrives in the next phase.
      </div>

      <div className="pmo-scroll" style={{ overflowX: isCompact ? "auto" : "visible", marginBottom:SP.lg }}>
        <Tabs T={T} active={tab} onChange={setTab} isMobile={isCompact}
          tabs={[
            { id:"details", label:"PDD details", Icon:FileText },
            { id:"cost",    label:`Cost table (${items.length})`, Icon:Banknote },
            { id:"files",   label:`Files (${attached})`, Icon:Paperclip },
            { id:"history", label:`Approval history (${approvals.length})`, Icon:History },
          ]} />
      </div>

      {tab === "details" && (
        <Surface T={T} pad={0}>
          <Field T={T} label="Problem">{p.problem}</Field>
          <Field T={T} label="Opportunity">{p.opportunity}</Field>
          <Field T={T} label="Proposed solution">{p.proposed_solution}</Field>
          <Field T={T} label="Related target">{p.related_target}</Field>
          <Field T={T} label="Objectives">{p.objectives}</Field>
          <Field T={T} label="Success criteria">{p.success_criteria}</Field>
          <Field T={T} label="Project description">{p.description}</Field>
          <Field T={T} label="Stakeholders">{p.stakeholders}</Field>
          <Field T={T} label="Risks" empty={!(p.risks || []).length}>
            {(p.risks || []).map((r, i) => (
              <div key={i} style={{ display:"flex", gap:SP.sm, alignItems:"baseline", marginBottom:4 }}>
                <Pill T={T} color={/high|critical/i.test(r.impact) ? DATA.danger : /medium/i.test(r.impact) ? DATA.warning : DATA.info}>
                  {r.impact || "impact not given"}
                </Pill>
                <span>{r.risk || <em style={{ color:T.muted }}>No description</em>}</span>
              </div>
            ))}
          </Field>
          <Field T={T} label="Technical experts" empty={!(p.experts || []).length}>
            {(p.experts || []).map((e, i) => (
              <div key={i}>{e.name || "—"}{e.email ? ` · ${e.email}` : ""}{e.contact ? ` · ${e.contact}` : ""}</div>
            ))}
          </Field>
          <Field T={T} label="Strategic themes">{(p.strategic_themes || []).join(" · ")}</Field>
          <Field T={T} label="Strategic priorities">{(p.strategic_priorities || []).join(" · ")}</Field>
          <Field T={T} label="Supporting document types">{(p.doc_types || []).join(" · ")}</Field>
          <Field T={T} label="PDD date">{fmtDate(p.date)}</Field>
        </Surface>
      )}

      {tab === "cost" && (
        <Surface T={T} pad={0} style={{ overflow:"hidden" }}>
          {items.length === 0 ? (
            <div style={{ padding:SP.xl, color:T.textOf(DATA.warning), fontSize:13 }}>No cost lines were entered.</div>
          ) : isCompact ? (
            <div>
              {items.map((it, i) => (
                <div key={i} style={{ padding:`${SP.md}px ${SP.lg}px`, borderTop: i ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ fontSize:12.5, color:T.text, whiteSpace:"pre-wrap", lineHeight:1.5 }}>{i + 1}. {it.description || "—"}</div>
                  <div style={{ ...TYPE.caption, color:T.muted, marginTop:4 }}>
                    {fmtFull(it.qty)} {it.unit} × {fmtFull(it.unit_cost)}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text, marginTop:2 }}>{fmtFull(it.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pmo-scroll" style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5 }}>
                <thead>
                  <tr style={{ background:T.card2 }}>
                    {["#", "Description of items", "Unit", "Qty", "Unit cost", "Total cost"].map((h, i) => (
                      <th key={h} style={{ ...TYPE.label, color:T.dim, padding:"9px 12px",
                        textAlign: i >= 3 ? "right" : "left", borderBottom:`1px solid ${T.border}`,
                        whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:"9px 12px", color:T.dim, verticalAlign:"top" }}>{i + 1}</td>
                      <td style={{ padding:"9px 12px", color:T.text, whiteSpace:"pre-wrap", lineHeight:1.5,
                        minWidth:260 }}>{it.description || "—"}</td>
                      <td style={{ padding:"9px 12px", color:T.muted, whiteSpace:"nowrap", verticalAlign:"top" }}>{it.unit || "—"}</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", verticalAlign:"top" }}>{fmtFull(it.qty)}</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", verticalAlign:"top", whiteSpace:"nowrap" }}>{fmtFull(it.unit_cost)}</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", verticalAlign:"top", whiteSpace:"nowrap",
                        fontWeight:600, color:T.text }}>{fmtFull(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ padding:"10px 12px", textAlign:"right", ...TYPE.label, color:T.muted }}>
                      Grand total (as entered)
                    </td>
                    <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:800, color:T.text, whiteSpace:"nowrap" }}>
                      {p.currency || "PKR"} {fmtFull(row.grand_total)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} style={{ padding:"0 12px 10px", textAlign:"right", ...TYPE.caption, color:T.dim }}>
                      Sum of the lines
                    </td>
                    <td style={{ padding:"0 12px 10px", textAlign:"right", ...TYPE.caption, color:T.dim, whiteSpace:"nowrap" }}>
                      {fmtFull(lineSum)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Surface>
      )}

      {tab === "files" && (
        <div style={{ display:"flex", flexDirection:"column", gap:SP.md }}>
          {fileErr && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger) }}>{fileErr}</div>}
          {groups.length === 0 && (
            <Surface T={T}><div style={{ color:T.textOf(DATA.warning), fontSize:13 }}>No supporting documents were attached.</div></Surface>
          )}
          {groups.map(([name, list]) => (
            <Surface key={name} T={T} pad={0}>
              <div style={{ padding:`${SP.sm + 2}px ${SP.lg}px`, display:"flex", alignItems:"center", gap:8,
                borderBottom:`1px solid ${T.border}` }}>
                <span style={{ ...TYPE.label, color:T.text }}>{name}</span>
                {!selectedGroups.has(name) && <span style={{ ...TYPE.caption, color:T.dim }}>(not selected as a document type)</span>}
              </div>
              {list.map((s, i) => {
                const f = s.file ? byKey[`${s.category}|${s.title}|${s.file}`] : null;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:SP.md, flexWrap:"wrap",
                    padding:`${SP.sm + 2}px ${SP.lg}px`, borderTop: i ? `1px solid ${T.border}` : "none" }}>
                    <Paperclip size={14} color={s.file ? T.muted : T.textOf(DATA.warning)} style={{ flexShrink:0 }} />
                    <div style={{ flex:"1 1 220px", minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:600, color:T.text }}>{s.title}</div>
                      <div style={{ ...TYPE.caption, color: s.file ? T.muted : T.textOf(DATA.warning),
                        overflowWrap:"anywhere" }}>
                        {s.file ? `${s.file.replace(/^\d+_/, "")}${f?.size_bytes ? ` · ${fmtBytes(f.size_bytes)}` : ""}`
                                : "Not attached"}
                      </div>
                    </div>
                    {s.file && (!f || f.status === "pending") && (
                      <span style={{ ...TYPE.caption, color:T.muted, display:"inline-flex", alignItems:"center", gap:5 }}>
                        <RefreshCw size={11} className="rev-spin" /> Copying from the E-PDD portal
                      </span>
                    )}
                    {f?.status === "failed" && (
                      <span style={{ ...TYPE.caption, color:T.textOf(DATA.danger) }} title={f.error || ""}>
                        Could not copy: {f.error}
                      </span>
                    )}
                    {f?.status === "stored" && (
                      <div style={{ display:"flex", gap:6 }}>
                        {/* Word and Excel files only download in a browser tab, so they get Save alone. */}
                        {viewable(f) && <Button T={T} size="sm" variant="ghost" icon={ExternalLink} onClick={() => openFile(f, false)}>Open</Button>}
                        <Button T={T} size="sm" variant="ghost" icon={Download} onClick={() => openFile(f, true)}>Save</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </Surface>
          ))}
        </div>
      )}

      {tab === "history" && (
        <Surface T={T} pad={isCompact ? SP.md : SP.lg}>
          {row.detail_needed && !approvals.length ? (
            <div style={{ color:T.muted, fontSize:13 }}>Reading the approval history from the E-PDD portal…</div>
          ) : !approvals.length ? (
            <div style={{ color:T.muted, fontSize:13 }}>No approval steps yet.</div>
          ) : (
            <div style={{ position:"relative", paddingLeft:22 }}>
              <span aria-hidden="true" style={{ position:"absolute", left:6, top:6, bottom:6, width:2,
                background:T.border, borderRadius:2 }} />
              {approvals.map((a, i) => {
                const c = decisionColor(a.status);
                const Ic = a.kind === "update" ? PenLine : /reject|not approved/i.test(a.status || "") ? XCircle : CheckCircle2;
                return (
                  <div key={i} className="rev-row" style={{ animationDelay:`${Math.min(i, 10) * 40}ms`,
                    position:"relative", paddingBottom: i === approvals.length - 1 ? 0 : SP.lg }}>
                    <span aria-hidden="true" style={{ position:"absolute", left:-22, top:1, width:14, height:14,
                      borderRadius:"50%", background:T.surface, border:`2px solid ${c}`,
                      display:"flex", alignItems:"center", justifyContent:"center" }} />
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <Pill T={T} color={c}><Ic size={10} /> {a.status || "—"}</Pill>
                      <span style={{ fontSize:13, fontWeight:600, color:T.text }}>
                        {a.kind === "update" ? (a.updated_by ? `Updated by ${a.updated_by}` : "Record updated") : (a.name || "—")}
                      </span>
                      {a.role && <span style={{ ...TYPE.caption, color:T.muted }}>{a.role}</span>}
                      <span style={{ ...TYPE.caption, color:T.dim, marginLeft:"auto" }}>{a.when}</span>
                    </div>
                    {a.recommendation_cost != null && (
                      <div style={{ ...TYPE.caption, color:T.muted, marginTop:4 }}>
                        Recommended cost: PKR {fmtFull(a.recommendation_cost)}
                      </div>
                    )}
                    {(a.reason || a.update_reason) && (
                      <div style={{ fontSize:12.5, color:T.textSoft, marginTop:6, lineHeight:1.6, whiteSpace:"pre-wrap",
                        padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.sm, background:T.card2,
                        border:`1px solid ${T.border}`, overflowWrap:"anywhere" }}>
                        {a.reason || a.update_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
const LIST_COLS = "id,pdd_number,project_name,campus,initiated_by,initiated_by_designation,su_head,project_type,"
  + "cost_center,grand_total,estimated_total,start_date,finish_date,received_at,epdd_status,queue,epdd_url,"
  + "is_history,seen_at,changed_at,first_seen_at,detail_needed,approvals,pdd";

export function PmoReviewPage({ T, session, supa, isCompact, onSeenChange }) {
  useReviewStyles();
  const [rows, setRows]   = useState(null);
  const [files, setFiles] = useState([]);
  const [lastRun, setLastRun] = useState(null);
  const [err, setErr]     = useState(null);
  const [q, setQ]         = useState("");
  const [view, setView]   = useState(null);          // waiting | new | all | decided
  const [campus, setCampus] = useState("");
  const [openId, setOpenId] = useState(null);
  const [hover, setHover] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const pageRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [r, f, runs] = await Promise.all([
        supa(`/rest/v1/epdd_pdds?select=${LIST_COLS}&queue=neq.removed&order=received_at.desc.nullslast`, {}, session.access_token),
        supa("/rest/v1/epdd_files?select=id,pdd_id,category,title,file_name,storage_path,size_bytes,mime,status,error",
             {}, session.access_token),
        supa("/rest/v1/epdd_sync_runs?select=started_at,finished_at,ok,error&order=started_at.desc&limit=1",
             {}, session.access_token),
      ]);
      setRows(Array.isArray(r) ? r : []);
      setFiles(Array.isArray(f) ? f : []);
      setLastRun(Array.isArray(runs) ? runs[0] || null : null);
      setErr(null);
    } catch (e) { setErr(e.message); setRows(x => x || []); }
  }, [supa, session]);

  useEffect(() => { load(); }, [load]);
  // The sync runs every 5 minutes; the page follows it without a reload.
  useEffect(() => { const iv = setInterval(load, 60_000); return () => clearInterval(iv); }, [load]);

  // First visit: open on the PDDs waiting for the PMO if there are any.
  useEffect(() => {
    if (!rows || view) return;
    setView(rows.some(r => r.queue === "manage") ? "waiting" : "all");
  }, [rows, view]);

  const openRow = useMemo(() => (rows || []).find(r => r.id === openId) || null, [rows, openId]);
  useEffect(() => { pageRef.current?.scrollTo?.({ top:0 }); }, [openId]);

  // Opening a PDD marks it seen for the sidebar badge.
  const open = async (r) => {
    setOpenId(r.id);
    if (r.seen_at) return;
    try {
      await supa(`/rest/v1/epdd_pdds?id=eq.${r.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({ seen_at: new Date().toISOString(), seen_by: session.user_id }) }, session.access_token);
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, seen_at: new Date().toISOString() } : x));
      onSeenChange?.();
    } catch { /* the badge simply stays until next time */ }
  };

  const syncNow = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await supa("/functions/v1/epdd-sync", { method:"POST", body:"{}" }, session.access_token);
      setSyncMsg(res.skipped ? "A check is already running — it will finish in a moment."
        : res.ok ? (res.new_count ? `${res.new_count} new PDD${res.new_count === 1 ? "" : "s"} found.` : "Up to date. No new PDDs.")
        : res.error || "The check failed.");
      await load();
      onSeenChange?.();
    } catch (e) { setSyncMsg(e.message); }
    setSyncing(false);
  };

  const campuses = useMemo(() => [...new Set((rows || []).map(r => r.campus).filter(Boolean))].sort(), [rows]);
  const isNew = (r) => !r.is_history && !r.seen_at;

  const counts = useMemo(() => {
    const src = rows || [];
    return {
      waiting: src.filter(r => r.queue === "manage").length,
      unseen: src.filter(isNew).length,
      total: src.length,
      notApproved: src.filter(r => /not approved/i.test(r.epdd_status || "")).length,
      value: src.filter(r => r.queue === "manage").reduce((s, r) => s + (parseFloat(r.grand_total) || 0), 0),
    };
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter(r =>
      (view === "waiting" ? r.queue === "manage"
        : view === "new" ? isNew(r)
        : view === "decided" ? r.queue !== "manage"
        : true) &&
      (!campus || r.campus === campus) &&
      (!needle || `${r.pdd_number || ""} ${r.project_name || ""} ${r.initiated_by || ""} ${r.cost_center || ""}`
        .toLowerCase().includes(needle)));
  }, [rows, q, view, campus]);

  const filesFor = useCallback((id) => files.filter(f => f.pdd_id === id), [files]);

  if (rows === null) return <div style={{ padding:SP.xxl, color:T.muted, fontSize:13 }}>Loading PDDs…</div>;

  const health = lastRun
    ? lastRun.ok === false
      ? { c:DATA.danger, t:`Last check failed ${ago(lastRun.started_at)}`, tip:lastRun.error }
      : { c:DATA.positive, t:`Checked ${ago(lastRun.finished_at || lastRun.started_at)}`, tip:"The E-PDD portal is checked every 5 minutes" }
    : { c:T.muted, t:"Not checked yet", tip:"" };

  return (
    <div ref={pageRef} className="pmo-scroll" style={{ flex:1, overflow:"auto", background:T.page }}>
      <div style={{ padding: isCompact ? SP.lg : `${SP.xl}px ${SP.xxl}px`, position:"relative" }}>
        <div aria-hidden="true" style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
          <div className="rev-glow" style={{ position:"absolute", top:"-22%", right:"6%", width:520, height:520,
            borderRadius:"50%", background:`radial-gradient(circle, ${BRAND.gold}22 0%, transparent 68%)` }} />
          <div className="rev-glow" style={{ position:"absolute", bottom:"-28%", left:"4%", width:600, height:600,
            borderRadius:"50%", animationDelay:"-13s", background:`radial-gradient(circle, ${BRAND.blue}1F 0%, transparent 70%)` }} />
        </div>

        <div style={{ position:"relative", zIndex:1 }}>
          {openRow ? (
            <PddDetail T={T} session={session} supa={supa} row={openRow} files={filesFor(openRow.id)}
              isCompact={isCompact} onBack={() => setOpenId(null)} />
          ) : (<>
            <div style={{ display:"grid", gap:SP.md, marginBottom:SP.lg,
              gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))" }}>
              {[
                { k:"Waiting on PMO", v:counts.waiting, sub:"in Manage PMO Form", c:BRAND.gold, Icon:Inbox, go:"waiting" },
                { k:"Not opened yet", v:counts.unseen, sub:"new since intake began", c:DATA.info, Icon:ClipboardCheck, go:"new" },
                { k:"Value waiting", v:`PKR ${fmtM(counts.value)}`, sub:"grand total of waiting PDDs", c:DATA.positive, Icon:Banknote, go:"waiting" },
                { k:"All PDDs", v:counts.total, sub:`${counts.notApproved} not approved`, c:T.muted, Icon:ListTree, go:"all" },
              ].map(({ k, v, sub, c, Icon, go }, i) => (
                <button key={k} className="rev-row pmo-focusable pmo-btn" onClick={() => setView(go)}
                  style={{ animationDelay:`${i * 50}ms`, position:"relative", overflow:"hidden", textAlign:"left",
                    padding:`${SP.md}px ${SP.lg}px`, background:T.surface, cursor:"pointer",
                    border:`1px solid ${view === go ? T.borderStrong : T.border}`, borderRadius:R.lg,
                    boxShadow:T.shadow, fontFamily:"inherit" }}>
                  <div aria-hidden="true" style={{ position:"absolute", inset:0,
                    background:`linear-gradient(135deg, ${c}${T.wash} 0%, transparent 58%)`, pointerEvents:"none" }} />
                  <div style={{ position:"relative", display:"flex", alignItems:"center", gap:8 }}>
                    <Icon size={13} color={c} />
                    <span style={{ ...TYPE.label, color:T.muted }}>{k}</span>
                  </div>
                  <div style={{ position:"relative", ...TYPE.metricSm, fontSize:24, color:T.text, marginTop:6, lineHeight:1.1 }}>{v}</div>
                  <div style={{ position:"relative", ...TYPE.caption, color:T.dim, marginTop:2 }}>{sub}</div>
                </button>
              ))}
            </div>

            <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center", marginBottom:SP.md }}>
              <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ("")}
                placeholder="Search PDD number, project, initiator…" style={{ flex:"0 1 300px", minWidth:160 }} />
              <Select T={T} value={view || "all"} onChange={e => setView(e.target.value)}>
                <option value="waiting">Waiting on PMO</option>
                <option value="new">Not opened yet</option>
                <option value="decided">Already processed</option>
                <option value="all">All PDDs</option>
              </Select>
              <Select T={T} value={campus} onChange={e => setCampus(e.target.value)}>
                <option value="">All campuses</option>
                {campuses.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap" }}>
                <span title={health.tip || ""} style={{ ...TYPE.caption, color:T.muted, display:"inline-flex",
                  alignItems:"center", gap:6 }}>
                  <span className="rev-dot" style={{ width:7, height:7, borderRadius:"50%", background:health.c }} />
                  {health.t}
                </span>
                <Button T={T} variant="ghost" icon={RefreshCw} onClick={syncNow} loading={syncing} disabled={syncing}>
                  Check now
                </Button>
              </div>
            </div>
            {syncMsg && <div style={{ ...TYPE.caption, color:T.muted, marginBottom:SP.md }}>{syncMsg}</div>}
            {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.md }}>{err}</div>}

            {list.length === 0 ? (
              <div style={{ padding:SP.xxl, textAlign:"center", background:T.surface, border:`1px solid ${T.border}`,
                borderRadius:R.lg, color:T.muted, fontSize:13, lineHeight:1.7 }}>
                {view === "waiting" ? (<>
                  <Inbox size={22} color={T.dim} style={{ marginBottom:6 }} /><br />
                  No PDDs are waiting in Manage PMO Form.<br />
                  <span style={{ ...TYPE.caption, color:T.dim }}>
                    The E-PDD portal is checked every 5 minutes. A new PDD appears here with its details and files.
                  </span>
                </>) : "Nothing matches these filters."}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
                {list.map((r, i) => {
                  const sc = statusColor(r.epdd_status, T);
                  const waiting = r.queue === "manage";
                  const rail = waiting ? BRAND.gold : sc;
                  const nFiles = (r.pdd?.file_slots || []).filter(s => s.file).length;
                  const on = CAN_HOVER ? { onMouseEnter:() => setHover(r.id), onMouseLeave:() => setHover(null) } : {};
                  const hot = hover === r.id;
                  return (
                    <div key={r.id} {...on} onClick={() => open(r)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } }}
                      className="rev-row pmo-focusable" style={{ animationDelay:`${Math.min(i, 8) * 40}ms`,
                        position:"relative", overflow:"hidden", cursor:"pointer", display:"flex", alignItems:"stretch",
                        gap:SP.md, padding:`${SP.md}px ${SP.lg}px`,
                        background: hot ? T.surfaceRaised : T.surface,
                        border:`1px solid ${hot ? T.borderStrong : T.border}`, borderRadius:R.lg,
                        boxShadow: hot ? T.glowSoft(rail) : T.shadow, transform: hot ? "translateY(-1px)" : "none",
                        transition:`background ${MOTION.fast}, border-color ${MOTION.fast}, box-shadow ${MOTION.base}, transform ${MOTION.base}` }}>
                      <span aria-hidden="true" style={{ width:3, borderRadius:2, background:rail, flexShrink:0,
                        opacity: hot ? 1 : .75, transition:`opacity ${MOTION.fast}` }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                          <span style={{ ...TYPE.mono, fontSize:9.5, color:T.dim }}>{r.pdd_number}</span>
                          <span style={{ fontSize:13.5, color:T.text, fontWeight:600 }}>{r.project_name}</span>
                          {isNew(r) && <Pill T={T} color={DATA.info} pulse>New</Pill>}
                          {r.changed_at && <Pill T={T} color={DATA.warning}><PenLine size={10} /> Resubmitted</Pill>}
                        </div>
                        <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>
                          {r.campus || "No campus"} · {r.initiated_by || "—"} · {r.project_type || "—"}
                        </div>
                        <div style={{ ...TYPE.caption, color:T.dim, marginTop:3, display:"flex", gap:10, flexWrap:"wrap" }}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Clock size={10} /> received {fmtDateTime(r.received_at)}</span>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Paperclip size={10} /> {nFiles} file{nFiles === 1 ? "" : "s"}</span>
                          {r.start_date && <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><CalendarRange size={10} /> {fmtDate(r.start_date)} → {fmtDate(r.finish_date)}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", justifyContent:"space-between",
                        flexShrink:0, gap:6 }}>
                        {waiting ? <Pill T={T} color={BRAND.gold}>Waiting on PMO</Pill>
                                 : <Pill T={T} color={sc}>{r.epdd_status || "—"}</Pill>}
                        <div style={{ fontSize:12.5, fontWeight:700, color:T.text, whiteSpace:"nowrap" }}>PKR {fmtM(r.grand_total)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
