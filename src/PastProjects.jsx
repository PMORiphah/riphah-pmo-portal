import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { History, Search, X, Send, Mail, Pencil, ChevronDown, ChevronRight,
         Clock, AlertTriangle, CheckCircle2, MessageSquare, Plus,
         Upload, Download } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, Input, Button, CAN_HOVER } from "./ui.jsx";

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
const XL_COLS = ["Project ID","Project Name","Campus","Fiscal Year","Approved Amount",
                 "Released Amount","Project Manager","Status","Why Still Open","Notes",
                 "Last Followed Up"];
const STATUS_IN = { "open":"open", "closing":"closing", "closed":"closed" };

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
  const col = (n) => head.indexOf(n.toLowerCase());
  const iName = col("Project Name");
  if (iName < 0) return { errors:["The sheet needs a 'Project Name' column."], rows:[] };
  const iId=col("Project ID"), iCam=col("Campus"), iFy=col("Fiscal Year"),
        iApp=col("Approved Amount"), iRel=col("Released Amount"), iPm=col("Project Manager"),
        iSt=col("Status"), iWhy=col("Why Still Open"), iNo=col("Notes"), iFu=col("Last Followed Up");

  aoa.slice(1).forEach((row, n) => {
    const line = n + 2;
    if (!row || row.every(c => c == null || String(c).trim() === "")) return;
    const name = String(row[iName] ?? "").trim();
    if (!name) { errors.push(`Row ${line}: no project name.`); return; }
    const fy = String(row[iFy] ?? "").trim();
    if (!fy) { errors.push(`Row ${line}: "${name.slice(0,34)}" has no fiscal year.`); return; }

    const app = xlNum(row[iApp]), rel = xlNum(row[iRel]), fu = xlDate(row[iFu]);
    if (app === undefined) { errors.push(`Row ${line}: approved amount "${row[iApp]}" not understood.`); return; }
    if (rel === undefined) { errors.push(`Row ${line}: released amount "${row[iRel]}" not understood.`); return; }
    if (fu  === undefined) { errors.push(`Row ${line}: last followed up "${row[iFu]}" not understood.`); return; }

    const rawPm = String(row[iPm] ?? "").trim();
    let pm_user_id = null;
    if (rawPm) {
      pm_user_id = pmByName[rawPm.toLowerCase()] || null;
      if (!pm_user_id) errors.push(`Row ${line}: no portal account for "${rawPm}" — imported with no manager.`);
    }
    const rawSt = String(row[iSt] ?? "").trim().toLowerCase();
    const status = STATUS_IN[rawSt] || "open";
    if (rawSt && !STATUS_IN[rawSt]) errors.push(`Row ${line}: status "${row[iSt]}" not recognised, using Open.`);

    rows.push({ line, code: String(row[iId] ?? "").trim() || null, name,
      campus: String(row[iCam] ?? "").trim() || null, fiscal_year: fy,
      approved_amount: app ?? 0, released_amount: rel ?? 0, pm_user_id, pm_label: rawPm,
      status, reason_open: String(row[iWhy] ?? "").trim() || null,
      notes: String(row[iNo] ?? "").trim() || null, last_followed_up: fu });
  });
  return { errors, rows };
}

/* ── The thread ──────────────────────────────────────────────────────────── */
function ThreadModal({ T, session, supa, row, isPMO, isCompact, onClose, onChanged }) {
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
  }, [row.id, supa, session]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block:"nearest" }); }, [msgs]);

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    try {
      await supa("/rest/v1/past_project_updates", {
        method:"POST", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({
          past_project_id: row.id, body: body.trim(),
          author_id: session.user_id,
          author_name: session.full_name || session.username,
          author_role: session.role,
        }),
      }, session.access_token);
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

  const st = STATUS[row.status] || STATUS.open;
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"9px 11px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };

  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1300, background:"rgba(3,8,16,0.74)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex",
        alignItems: isCompact ? "flex-end" : "center", justifyContent:"center",
        padding: isCompact ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="Past project follow-up"
        style={{ width:680, maxWidth:"100%", maxHeight:"90vh", overflow:"auto",
          background:T.surface, border:`1px solid ${T.border}`,
          borderRadius: isCompact ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          boxShadow:T.shadowLg }}>

        <div style={{ position:"sticky", top:0, zIndex:2, padding:`${SP.lg}px ${SP.xl}px`,
          background:`linear-gradient(90deg, ${st.color}${T.washStrong}, transparent)`,
          borderBottom:`1px solid ${T.border}`, backdropFilter:"blur(10px)" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:SP.md }}>
            <div style={{ flex:1, minWidth:0 }}>
              {row.code && <div style={{ ...TYPE.mono, fontSize:9.5, color:T.dim }}>{row.code}</div>}
              <div style={{ ...TYPE.display, fontSize:16, color:T.text, lineHeight:1.35 }}>{row.name}</div>
              <div style={{ ...TYPE.caption, color:T.muted, marginTop:4 }}>
                {row.fiscal_year} · {row.campus || "No campus"} · {row.pm_name || "No project manager"}
              </div>
            </div>
            <button className="pmo-focusable pmo-btn" onClick={onClose} aria-label="Close"
              style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, padding:4 }}>
              <X size={17} />
            </button>
          </div>
          <div style={{ display:"flex", gap:SP.sm, marginTop:SP.md, flexWrap:"wrap" }}>
            {[["Approved", fmtM(row.approved_amount)],
              ["Released", fmtM(row.released_amount)],
              ["Status", st.label]].map(([k,v],i) => (
              <div key={k} style={{ padding:"6px 12px", borderRadius:R.sm, background:T.card2,
                border:`1px solid ${T.border}` }}>
                <div style={{ ...TYPE.label, color:T.dim, fontSize:8.5 }}>{k}</div>
                <div style={{ fontSize:12.5, fontWeight:700,
                  color: i===2 ? T.textOf(st.color) : T.text }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:`${SP.lg}px ${SP.xl}px` }}>
          {/* Why it is still open — PMO's field. A PM reads it and answers below. */}
          <div style={{ marginBottom:SP.lg }}>
            <div style={{ display:"flex", alignItems:"center", gap:SP.sm, marginBottom:6 }}>
              <span style={{ ...TYPE.label, color:T.muted }}>Why it is still open</span>
              {isPMO && !editing && (
                <button className="pmo-focusable pmo-btn" onClick={() => setEditing(true)}
                  style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:2 }}>
                  <Pencil size={12} />
                </button>
              )}
            </div>
            {editing ? (
              <div>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                  style={{ ...inp, resize:"vertical", lineHeight:1.6, marginBottom:SP.sm }} />
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
              <div style={{ fontSize:13, color: row.reason_open ? T.textSoft : T.dim, lineHeight:1.65,
                padding:"11px 13px", borderRadius:R.md, background:T.card2,
                borderLeft:`3px solid ${st.color}` }}>
                {row.reason_open || "No reason recorded yet."}
              </div>
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
                return (
                  <div key={m.id} style={{ display:"flex",
                    justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth:"82%", padding:"10px 13px", borderRadius:R.md,
                      background: pmo ? `${BRAND.blue}1A` : T.card2,
                      border:`1px solid ${pmo ? `${BRAND.blue}3D` : T.border}` }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:11.5, fontWeight:700,
                          color: pmo ? T.textOf(BRAND.blue) : T.text }}>
                          {m.author_name || "Unknown"}
                        </span>
                        <span style={{ ...TYPE.caption, color:T.dim }}>{when(m.created_at)}</span>
                      </div>
                      <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.6,
                        whiteSpace:"pre-wrap" }}>{m.body}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}

          {err && (
            <div style={{ marginTop:SP.sm, fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
          )}

          <div style={{ display:"flex", gap:SP.sm, marginTop:SP.lg, alignItems:"flex-end" }}>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              placeholder={isPMO ? "Ask the project manager where this stands…"
                                 : "Reply with the current position…"}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
              style={{ ...inp, resize:"vertical", lineHeight:1.55 }} />
            <Button T={T} variant="primary" icon={Send} onClick={post}
              loading={busy} disabled={!body.trim()}>Post</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


/* ── Import ─────────────────────────────────────────────────────────────── */
function ImportModal({ T, session, supa, pms, existingCount, isCompact, onClose, onDone }) {
  const [parsed, setParsed] = useState(null);
  const [mode, setMode]     = useState("append");
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

  const commit = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true); setErr(null);
    try {
      if (mode === "replace") {
        await supa("/rest/v1/past_projects?id=not.is.null",
          { method:"DELETE", headers:{ Prefer:"return=minimal" } }, session.access_token);
      }
      // One shape for every object: PostgREST rejects a bulk insert whose rows
      // have differing key sets (PGRST102).
      const body = parsed.rows.map(r => ({
        code:r.code, name:r.name, campus:r.campus, fiscal_year:r.fiscal_year,
        approved_amount:r.approved_amount, released_amount:r.released_amount,
        pm_user_id:r.pm_user_id, status:r.status, reason_open:r.reason_open,
        notes:r.notes, last_followed_up:r.last_followed_up, created_by:session.user_id,
      }));
      for (let i = 0; i < body.length; i += 50) {
        await supa("/rest/v1/past_projects",
          { method:"POST", body:JSON.stringify(body.slice(i, i+50)),
            headers:{ Prefer:"return=minimal" } }, session.access_token);
      }
      setDone({ count: body.length });
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
                  {done.count} past project{done.count === 1 ? "" : "s"} imported
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
                      {[["append","Add to what's there"],["replace","Replace them all"]].map(([v,l]) => (
                        <button key={v} className="pmo-focusable pmo-btn" onClick={() => setMode(v)}
                          style={{ padding:"6px 12px", borderRadius:R.pill, fontSize:12, cursor:"pointer",
                            background: mode === v ? `${BRAND.blue}22` : "transparent",
                            border:`1px solid ${mode === v ? `${BRAND.blue}66` : T.border}`,
                            color: mode === v ? T.textOf(BRAND.blue) : T.muted,
                            fontWeight: mode === v ? 700 : 500 }}>{l}</button>
                      ))}
                    </div>
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
                {parsed?.rows.length ? `Import ${parsed.rows.length}` : "Import"}
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
export function PastProjectsPage({ T, session, supa, isCompact }) {
  usePastStyles();
  const [rows, setRows]   = useState(null);
  const [err, setErr]     = useState(null);
  const [q, setQ]         = useState("");
  const [fy, setFy]       = useState("");
  const [status, setStatus] = useState("open_all");
  const [pm, setPm]       = useState("");
  const [open, setOpen]   = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [hover, setHover] = useState(null);
  const [importing, setImporting] = useState(false);
  const [pmAccounts, setPmAccounts] = useState([]);   // every active account — used to match a name on import
  const [pmSuggest,  setPmSuggest]  = useState([]);   // managers and anyone running a project — the template dropdown

  const isPMO = session?.role === "pmo";

  const load = useCallback(async () => {
    try {
      const r = await supa("/rest/v1/past_project_summary?select=*&order=fiscal_year.desc",
                           {}, session.access_token);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setRows([]); }
  }, [supa, session]);
  useEffect(() => { load(); }, [load]);

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

  const years = useMemo(() => [...new Set((rows||[]).map(r => r.fiscal_year))].sort().reverse(), [rows]);
  const pms   = useMemo(() => [...new Set((rows||[]).map(r => r.pm_name).filter(Boolean))].sort(), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows||[]).filter(r =>
      (!fy || r.fiscal_year === fy) &&
      (!pm || r.pm_name === pm) &&
      (status === "all" ? true : status === "open_all" ? r.status !== "closed" : r.status === status) &&
      (!needle || `${r.code||""} ${r.name||""} ${r.reason_open||""}`.toLowerCase().includes(needle))
    );
  }, [rows, q, fy, pm, status]);

  const groups = useMemo(() => {
    const m = {};
    list.forEach(r => { (m[r.fiscal_year] ||= []).push(r); });
    Object.values(m).forEach(g => g.sort((a,b) =>
      (b.days_since_followup ?? 9999) - (a.days_since_followup ?? 9999)));
    return Object.entries(m).sort((a,b) => b[0].localeCompare(a[0]));
  }, [list]);

  const totals = useMemo(() => {
    const src = (rows||[]).filter(r => r.status !== "closed");
    return {
      openCount: src.length,
      value: src.reduce((s,r) => s + (parseFloat(r.approved_amount)||0), 0),
      stale: src.filter(r => (r.days_since_followup ?? 9999) > 30).length,
      unasked: src.filter(r => !r.update_count).length,
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
    para(3,"Fill in the 'Past Projects' sheet and bring it back to the portal. One row per project. "
          + "Only Project Name and Fiscal Year are required; everything else can be added later.");
    title(5,"What goes in each column",13);
    const guide=[
      ["Project ID","Your reference or SAP code. Optional."],
      ["Project Name","Required."],
      ["Campus","Al-Mizan, G-7, I-14, Lahore, Malakand, PRH, RIH, MHH. Free text."],
      ["Fiscal Year","Required. Pick from the dropdown, or type it as FY 24-25."],
      ["Approved Amount","Rupees, as a number. No commas or 'PKR'."],
      ["Released Amount","Rupees, as a number."],
      ["Project Manager","Pick from the dropdown. A name with no portal account imports with no "
                       + "manager, and nobody can be chased about it."],
      ["Status","Open, Closing or Closed. Defaults to Open."],
      ["Why Still Open","Free text. The reason it has not closed — this is what the page exists "
                      + "to show, so it is worth writing properly."],
      ["Notes","Anything else worth keeping. Optional."],
      ["Last Followed Up","YYYY-MM-DD, if known. Optional."],
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
    title(20,"Things worth knowing",13);
    [ "These are kept completely separate from FY 26-27. They appear in no current-year total, "
      + "chart, deadline alert or the risk matrix.",
      "A project manager sees only their own past projects and can reply in the portal. They "
      + "cannot change the reason or close a project — those stay with PMO.",
      "Leave unused rows blank. Empty rows are ignored.",
    ].forEach((t,i) => para(22 + i*2, "\u2022  " + t));

    const ws = wb.addWorksheet("Past Projects", {
      views:[{ state:"frozen", xSplit:2, ySplit:1, showGridLines:false }],
      pageSetup:{ orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0,
                  printTitlesRow:"1:1" },
    });
    ws.columns = XL_COLS.map((h,i) => ({ header:h,
      width:[16,46,14,13,18,18,26,12,58,32,17][i] }));
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
        if (c === 11) cell.numFmt = "yyyy-mm-dd";
        if (c === 3 || c === 4 || c === 8) cell.alignment={ horizontal:"center" };
      }
      row.getCell(4).dataValidation = { type:"list", allowBlank:true,
        formulae:['"FY 21-22,FY 22-23,FY 23-24,FY 24-25,FY 25-26"'] };
      row.getCell(8).dataValidation = { type:"list", allowBlank:true,
        formulae:['"Open,Closing,Closed"'] };
      if (names.length) row.getCell(7).dataValidation = { type:"list", allowBlank:true,
        formulae:[`"${names.join(",")}"`] };
    }
    ws.autoFilter = { from:"A1", to:"K1" };

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
    <div className="pmo-scroll" style={{ flex:1, overflow:"auto", background:T.page }}>
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
          {/* Summary strip */}
          <div style={{ display:"grid", gap:SP.md, marginBottom:SP.lg,
            gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))" }}>
            {[
              { k:"Still open",      v:totals.openCount, sub:"from prior years", c:DATA.danger,  Icon:History },
              { k:"Value involved",  v:`PKR ${fmtM(totals.value)}`, sub:"approved on open items", c:BRAND.gold, Icon:AlertTriangle },
              { k:"Not chased",      v:totals.stale, sub:"over 30 days", c:DATA.warning, Icon:Clock },
              { k:"Never asked",     v:totals.unasked, sub:"no follow-up at all", c:T.muted, Icon:MessageSquare },
            ].map(({k,v,sub,c,Icon}, i) => (
              <div key={k} className="past-row" style={{ animationDelay:`${i*50}ms`,
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
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center",
            marginBottom:SP.md }}>
            <Input T={T} icon={Search} value={q} onChange={e => setQ(e.target.value)}
              onClear={() => setQ("")} placeholder="Search name, code or reason…"
              style={{ flex:"0 1 300px", minWidth:160 }} />
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
            <Select T={T} value={pm} onChange={e => setPm(e.target.value)}>
              <option value="">All project managers</option>
              {pms.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:SP.sm,
              flexWrap:"wrap" }}>
              <span style={{ ...TYPE.caption, color:T.muted }}>{list.length} shown</span>
              {isPMO && (
                <>
                  <Button T={T} variant="ghost" icon={Download} onClick={downloadTemplate}>
                    Template
                  </Button>
                  <Button T={T} variant="primary" icon={Upload} onClick={() => setImporting(true)}>
                    Import
                  </Button>
                </>
              )}
            </div>
          </div>

          {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.md }}>{err}</div>}

          {groups.length === 0 ? (
            <div style={{ padding:SP.xxl, textAlign:"center", background:T.surface,
              border:`1px solid ${T.border}`, borderRadius:R.lg, color:T.muted, fontSize:13 }}>
              Nothing matches these filters.
            </div>
          ) : groups.map(([year, items], gi) => {
            const shut = collapsed[year];
            const openVal = items.filter(r => r.status !== "closed")
                                 .reduce((s,r) => s + (parseFloat(r.approved_amount)||0), 0);
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
                    {items.length} project{items.length===1?"":"s"} · PKR {fmtM(openVal)} open
                  </span>
                </button>

                {!shut && (
                  <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
                    {items.map((r, i) => {
                      const st = STATUS[r.status] || STATUS.open;
                      const stale = (r.days_since_followup ?? 9999) > 30 && r.status !== "closed";
                      const on = CAN_HOVER ? { onMouseEnter:() => setHover(r.id),
                                               onMouseLeave:() => setHover(null) } : {};
                      return (
                        <div key={r.id} {...on} onClick={() => setOpen(r)}
                          className="past-row" style={{ animationDelay:`${Math.min(i,8)*40 + gi*60}ms`,
                            position:"relative", overflow:"hidden", cursor:"pointer",
                            display:"flex", alignItems:"stretch", gap:SP.md,
                            padding:`${SP.md}px ${SP.lg}px`,
                            background: hover === r.id ? T.surfaceRaised : T.surface,
                            border:`1px solid ${hover === r.id ? T.borderStrong : T.border}`,
                            borderRadius:R.lg,
                            boxShadow: hover === r.id ? T.glowSoft(st.color) : T.shadow,
                            transform: hover === r.id ? "translateY(-1px)" : "none",
                            transition:`background ${MOTION.fast}, border-color ${MOTION.fast},
                                        box-shadow ${MOTION.base}, transform ${MOTION.base}` }}>
                          <span aria-hidden="true" style={{ width:3, borderRadius:2,
                            background:st.color, flexShrink:0,
                            opacity: hover === r.id ? 1 : .75,
                            transition:`opacity ${MOTION.fast}` }} />

                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                              {r.code && <span style={{ ...TYPE.mono, fontSize:9.5, color:T.dim }}>{r.code}</span>}
                              <span style={{ fontSize:13.5, color:T.text, fontWeight:600 }}>{r.name}</span>
                              {stale && (
                                <span className="past-dot" style={{ display:"inline-flex",
                                  alignItems:"center", gap:4, ...TYPE.caption,
                                  color:T.textOf(DATA.warning) }}>
                                  <Clock size={10} /> stale
                                </span>
                              )}
                            </div>
                            <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>
                              {r.campus || "No campus"} · {r.pm_name || "No project manager"} · {ago(r.days_since_followup)}
                            </div>
                            {r.reason_open && (
                              <div style={{ fontSize:12, color:T.textSoft, marginTop:6, lineHeight:1.55,
                                display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                                overflow:"hidden" }}>{r.reason_open}</div>
                            )}
                          </div>

                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end",
                            justifyContent:"space-between", flexShrink:0, gap:6 }}>
                            <span style={{ ...TYPE.caption, fontWeight:700, padding:"2px 9px",
                              borderRadius:R.pill, background:`${st.color}${T.badge}`,
                              color:T.textOf(st.color), whiteSpace:"nowrap" }}>{st.label}</span>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:12.5, fontWeight:700, color:T.text }}>
                                {fmtM(r.approved_amount)}
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
        </div>
      </div>

      {importing && (
        <ImportModal T={T} session={session} supa={supa} pms={pmAccounts}
          existingCount={rows.length} isCompact={isCompact}
          onClose={() => setImporting(false)} onDone={load} />
      )}

      {open && (
        <ThreadModal T={T} session={session} supa={supa} row={open} isPMO={isPMO}
          isCompact={isCompact} onClose={() => setOpen(null)}
          onChanged={() => { load(); setOpen(o => o && rows.find(x => x.id === o.id) || o); }} />
      )}
    </div>
  );
}
