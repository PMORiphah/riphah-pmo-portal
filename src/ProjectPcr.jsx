import { useState, useEffect, useCallback, useRef } from "react";
import { FileDiff, ExternalLink, CheckCircle2, UserRound, CircleDashed, Hourglass, RefreshCw, AlertTriangle,
  ChevronDown, ArrowRight, Loader2 } from "lucide-react";
import { TYPE, SP, R, DATA } from "./theme.js";
import { Button, Skeleton } from "./ui.jsx";
import { storageUrl } from "./storageUrl.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PCR (PMO, 20 Oct 2026)

   A project with a Project Change Request: the amber card at the top of the
   Overview's right column (PcrCard) and the PCR tab (PcrTab).

   The tab shows what each PCR document in the project's Documents says (a
   file whose name contains "PCR" or "change request"). Edge function
   pcr-extract reads the document with Gemini and saves the reading in
   project_pcrs. When the PMO opens the tab, documents not read yet are read
   one after another. A reading stays marked "Read by AI" until the PMO
   presses Confirm; a confirmed reading is never read again unless the PMO
   unconfirms it. Others who can see the project see a reading only once the
   PMO has confirmed it (row-level security), and the document link before.
   ═══════════════════════════════════════════════════════════════════════════ */

const PCR_CLR = DATA.warning;
const OK_CLR = DATA.positive;
export const PCR_FILE = /(^|[^a-z])pcr([^a-z]|$)|change[\s_-]*request/i;
const DOCS_SEL = "id,file_name,file_path,mime_type,uploaded_at,uploaded_by_name";
const inSim = () => { try { return !!window.__PMO_SIM__; } catch { return false; } };

const fmtFull = (n) => n == null || !isFinite(+n) ? "—" : Math.round(+n).toLocaleString("en-US");
const fmtSigned = (n) => n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmtFull(Math.abs(n));
const fmtDate = (d) => {
  if (!d) return null;
  const x = new Date(String(d).slice(0, 10) + "T00:00:00Z");
  return isNaN(x) ? null : x.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric", timeZone:"UTC" });
};
const fmtStamp = (ts) => {
  if (!ts) return null;
  const x = new Date(ts);
  return isNaN(x) ? null : x.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric", timeZone:"Asia/Karachi" });
};
const TYPE_LABEL = { budget:"Budget", scope:"Scope", schedule:"Schedule", deliverable:"Deliverables", other:"Other" };
const STATUS = {
  signed:  { label:"Signed",   color:OK_CLR,        Icon:CheckCircle2 },
  named:   { label:"Named",    color:DATA.info,     Icon:UserRound },
  pending: { label:"Pending",  color:PCR_CLR,       Icon:Hourglass },
  blank:   { label:"Not filled", color:DATA.neutral, Icon:CircleDashed },
};

/** Newest first: the form's date, else when the document was uploaded. */
export function orderPcrs(docs, readings) {
  const byAtt = new Map((readings || []).map((r) => [r.attachment_id, r]));
  return (docs || []).map((d) => ({ doc: d, reading: byAtt.get(d.id) || null }))
    .sort((a, b) => String(b.reading?.pcr_date || b.doc.uploaded_at || "").localeCompare(String(a.reading?.pcr_date || a.doc.uploaded_at || "")));
}

function usePcrData(supa, session, projectId) {
  const [docs, setDocs] = useState(null);
  const [readings, setReadings] = useState([]);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        supa(`/rest/v1/project_attachments?project_id=eq.${projectId}&kind=eq.document&select=${DOCS_SEL}&order=uploaded_at.desc`, {}, session.access_token),
        supa(`/rest/v1/project_pcrs?project_id=eq.${projectId}&select=*`, {}, session.access_token).catch(() => []),
      ]);
      setDocs((Array.isArray(d) ? d : []).filter((x) => PCR_FILE.test(x.file_name || "")));
      setReadings(Array.isArray(r) ? r : []);
      setErr(null);
    } catch (e) { setErr(e.message || "Could not load the PCR documents."); setDocs((x) => x || []); }
  }, [supa, session.access_token, projectId]);
  useEffect(() => { setDocs(null); load(); }, [load]);
  return { docs, readings, err, load };
}

async function openDoc(supa, session, doc) {
  const enc = String(doc.file_path).split("/").map(encodeURIComponent).join("/");
  const res = await supa(`/storage/v1/object/sign/project-attachments/${enc}`, { method:"POST", body: JSON.stringify({ expiresIn: 60 }) },
                         session.access_token);
  if (!res?.signedURL) throw new Error("Could not make a link to the document.");
  window.open(storageUrl(res.signedURL), "_blank", "noopener");
}

// ─── Overview card ──────────────────────────────────────────────────────────

export function PcrCard({ T, session, supa, projectId, isCompact, approved, df, released, plannedEnd, onOpenTab }) {
  const isPMO = session?.role === "pmo";
  const [latest, setLatest] = useState(undefined);   // undefined = loading, null = none
  const [count, setCount] = useState(0);
  const [marked, setMarked] = useState(undefined);   // undefined = loading, null = not in the Activity Log
  useEffect(() => {
    let live = true;
    supa(`/rest/v1/project_pcrs?project_id=eq.${projectId}&select=change_name,pcr_label,pcr_date,additional_cost,revised_cost,confirmed&order=pcr_date.desc.nullslast,read_at.desc`,
         {}, session.access_token)
      .then((r) => { if (!live) return; const rows = Array.isArray(r) ? r : []; setCount(rows.length); setLatest(rows[0] || null); })
      .catch(() => live && setLatest(null));
    if (isPMO) {
      supa(`/rest/v1/activity_log?entity_type=eq.projects&entity_id=eq.${projectId}&details->changed=cs.${encodeURIComponent('["pcr"]')}&select=created_at,actor_name,details&order=created_at.desc&limit=5`,
           {}, session.access_token)
        .then((r) => { if (!live) return; const hit = (Array.isArray(r) ? r : []).find((x) => x?.details?.new?.pcr === true); setMarked(hit || null); })
        .catch(() => live && setMarked(null));
    }
    return () => { live = false; };
  }, [supa, session.access_token, projectId, isPMO]);

  const a = approved != null ? +approved : null, d = df != null ? +df : null;
  const gap = a != null && d != null && a > 0 ? a - d : null;
  const tiles = [
    { label:"Approved vs DF", value: gap == null ? "—" : gap === 0 ? "Same as DF" : fmtSigned(gap),
      sub: gap == null ? "No approved budget yet" : gap > 0 ? "above DF Recommended" : gap < 0 ? "below DF Recommended" : fmtFull(a),
      tone: gap > 0 ? PCR_CLR : null },
    { label:"Released", value: fmtFull(released), sub: a ? `${Math.round((+released || 0) / a * 100)}% of approved` : null },
    { label:"Planned end", value: fmtDate(plannedEnd) || "—", sub: null },
    ...(isPMO ? [{ label:"Marked PCR on", value: marked === undefined ? "…" : marked ? fmtStamp(marked.created_at) : "—",
                   sub: marked === undefined ? null : marked ? `by ${marked.actor_name || "PMO"}` : "Not in the Activity Log", pmo: true }] : []),
  ];

  return (
    <div data-pcr-card="" style={{
      position:"relative", overflow:"hidden", marginBottom:SP.lg,
      background:`linear-gradient(135deg, ${PCR_CLR}16, ${PCR_CLR}06)`,
      border:`1px solid ${PCR_CLR}40`, borderRadius:R.lg, boxShadow:T.shadow, padding:"20px 22px",
    }}>
      <div aria-hidden="true" style={{
        position:"absolute", top:13, right:-42, width:150, transform:"rotate(45deg)",
        background:PCR_CLR, color:"#2A1A02", pointerEvents:"none", textAlign:"center",
        fontSize:9, fontWeight:800, letterSpacing:1.4, textTransform:"uppercase", padding:"4px 0", lineHeight:1.4,
      }}>PCR</div>
      <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1.5,
        marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${PCR_CLR}26` }}>Project Status</div>
      <div style={{ display:"flex", gap:16, alignItems:"center", marginBottom:16, paddingRight: isCompact ? 0 : 56 }}>
        <div className="pmo-breathe" style={{ width:56, height:56, borderRadius:"50%", flexShrink:0, background:`${PCR_CLR}1F`,
          border:`1px solid ${PCR_CLR}4D`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <FileDiff size={26} strokeWidth={1.8} color={T.textOf(PCR_CLR)} />
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ ...TYPE.display, fontSize:19, color:T.textOf(PCR_CLR), lineHeight:1.25 }}>Project Change Request</div>
          <div style={{ fontSize:12.5, color:T.muted, marginTop:5, lineHeight:1.55 }}>
            A change request is open on this project. Its scope, budget or schedule may change.
          </div>
        </div>
      </div>
      {latest && (
        <div style={{ fontSize:12.5, color:T.text, marginBottom:14, lineHeight:1.5 }}>
          <span style={{ color:T.muted }}>Latest PCR{count > 1 ? ` (of ${count})` : ""}: </span>
          <b style={{ fontWeight:650 }}>{latest.change_name || latest.pcr_label || "Change request"}</b>
          {latest.pcr_date && <span style={{ color:T.muted }}> · {fmtDate(latest.pcr_date)}</span>}
          {latest.additional_cost != null && <span style={{ color:T.textOf(PCR_CLR), fontWeight:650 }}> · {fmtSigned(+latest.additional_cost)}</span>}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns: isCompact || tiles.length === 4 ? "1fr 1fr" : `repeat(${tiles.length}, minmax(0,1fr))`, gap:SP.sm }}>
        {tiles.map((t) => (
          <div key={t.label} data-pcr-tile={t.pmo ? "marked" : t.label} style={{ background:T.surface, border:`1px solid ${T.border}`,
            borderRadius:R.md, padding:"10px 12px", minWidth:0 }}>
            <div style={{ fontSize:10.5, color:T.muted, marginBottom:4 }}>{t.label}</div>
            <div style={{ fontSize:15, fontWeight:700, color: t.tone ? T.textOf(t.tone) : T.text, fontVariantNumeric:"tabular-nums",
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.value}</div>
            {t.sub && <div style={{ fontSize:10.5, color:T.dim, marginTop:2 }}>{t.sub}</div>}
          </div>
        ))}
      </div>
      {onOpenTab && (
        <button type="button" onClick={onOpenTab} className="pmo-focusable" style={{ marginTop:14, display:"inline-flex", alignItems:"center",
          gap:6, background:"none", border:"none", padding:0, cursor:"pointer", color:T.textOf(PCR_CLR), fontWeight:650, fontSize:12.5 }}>
          View PCR details <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

// ─── The PCR tab ────────────────────────────────────────────────────────────

function Clamp({ T, text, lines = 5 }) {
  const [open, setOpen] = useState(false);
  const long = (text || "").length > lines * 90 || (text || "").split("\n").length > lines;
  return (
    <div>
      <div style={{ fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-line",
        ...(long && !open ? { display:"-webkit-box", WebkitLineClamp:lines, WebkitBoxOrient:"vertical", overflow:"hidden" } : {}) }}>{text}</div>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} style={{ marginTop:4, background:"none", border:"none", padding:0,
          cursor:"pointer", color:T.muted, fontSize:12, display:"inline-flex", alignItems:"center", gap:4 }}>
          {open ? "Show less" : "Show more"} <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      )}
    </div>
  );
}

function Section({ T, title, children }) {
  return (
    <div style={{ minWidth:0 }}>
      <div style={{ ...TYPE.label, fontSize:10.5, color:T.muted, marginBottom:6 }}>{title}</div>
      {children}
    </div>
  );
}

function PcrReading({ T, isCompact, isPMO, item, latest, approved, busy, onConfirm, onUnconfirm, onReadAgain, onOpen }) {
  const { doc, reading: r } = item;
  const base = r?.baseline_cost != null ? +r.baseline_cost : null;
  const add = r?.additional_cost != null ? +r.additional_cost : null;
  const rev = r?.revised_cost != null ? +r.revised_cost : null;
  const pct = base && add != null ? add / base * 100 : null;
  const signed = (r?.approvals || []).filter((x) => x.status === "signed").length;
  const total = (r?.approvals || []).length;
  const a = approved != null ? +approved : null;
  const texts = [["Problem / Opportunity", r?.problem], ["Description", r?.description], ["Justification", r?.justification],
                 ["Impact on project", r?.impact]].filter(([, t]) => t);
  const dates = [["Start", fmtDate(r?.start_date)], ["Finish", fmtDate(r?.finish_date)], ["Baseline duration", r?.baseline_duration]]
    .filter(([, v]) => v);

  return (
    <article data-pcr-reading={doc.id} className="pmo-in" style={{ background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:R.lg, boxShadow:`inset 4px 0 0 ${PCR_CLR}, ${T.shadowSm}`, padding: isCompact ? SP.lg : `${SP.lg}px ${SP.xl}px`, minWidth:0 }}>
      {/* Head: what, when, which file, checked or not */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:SP.md, flexWrap:"wrap" }}>
        <div style={{ minWidth:0, flex:"1 1 320px" }}>
          <div style={{ fontSize:11.5, color:T.muted, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontWeight:700, color:T.textOf(PCR_CLR), letterSpacing:"0.04em" }}>PCR</span>
            {r?.pcr_date && <span>· {fmtDate(r.pcr_date)}</span>}
            {r?.pcr_label && <span>· {r.pcr_label}</span>}
            {latest && <span style={{ color:T.textOf(PCR_CLR) }}>· latest</span>}
          </div>
          <h3 style={{ ...TYPE.display, fontSize:17, color:T.text, margin:"4px 0 0", lineHeight:1.35 }}>
            {r?.change_name || doc.file_name}
          </h3>
          {r && (r.change_types || []).length > 0 && (
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
              {r.change_types.map((t) => (
                <span key={t} style={{ fontSize:11, fontWeight:600, padding:"1px 8px", borderRadius:R.pill, color:T.textOf(PCR_CLR),
                  background:PCR_CLR + T.badge, border:`1px solid ${PCR_CLR}44` }}>{TYPE_LABEL[t] || t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:SP.sm, alignItems:"center", flexWrap:"wrap" }}>
          {r && (r.confirmed
            ? <span data-pcr-state="confirmed" title={r.confirmed_at ? `Checked by the PMO on ${fmtStamp(r.confirmed_at)}` : undefined}
                style={{ fontSize:11.5, fontWeight:650, color:T.textOf(OK_CLR), display:"inline-flex", alignItems:"center", gap:5 }}>
                <CheckCircle2 size={13} /> Checked by the PMO</span>
            : <span data-pcr-state="draft" title="Read from the document by AI. The PMO checks it against the document, then confirms."
                style={{ fontSize:11.5, fontWeight:650, color:T.textOf(PCR_CLR), display:"inline-flex", alignItems:"center", gap:5,
                  padding:"2px 8px", borderRadius:R.pill, border:`1px dashed ${PCR_CLR}88` }}>
                Read by AI · not yet checked</span>)}
          <Button T={T} variant="ghost" size="sm" icon={ExternalLink} onClick={() => onOpen(doc)} title={doc.file_name}>Open document</Button>
        </div>
      </div>

      {!r ? null : (<>
        {/* Money: before → change → after */}
        {(base != null || add != null || rev != null) && (
          <div data-pcr-money="" style={{ display:"grid", gridTemplateColumns: isCompact ? "1fr" : "1fr auto 1fr auto 1fr", alignItems:"center",
            gap: isCompact ? SP.sm : SP.md, marginTop:SP.lg, padding:SP.md, borderRadius:R.md, background:PCR_CLR + T.wash,
            border:`1px solid ${PCR_CLR}2E` }}>
            {[["Baseline budget", fmtFull(base), null],
              ["Additional cost", add == null ? "—" : fmtSigned(add), pct != null ? `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% of baseline` : null],
              ["Revised budget", fmtFull(rev), null]].map(([label, value, sub], i) => (
              <div key={label} style={{ display:"contents" }}>
                {i > 0 && !isCompact && <ArrowRight aria-hidden="true" size={16} color={T.dim} />}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:10.5, color:T.muted }}>{label}</div>
                  <div style={{ fontSize: i === 2 ? 19 : 16, fontWeight:750, fontVariantNumeric:"tabular-nums",
                    color: i === 1 ? T.textOf(PCR_CLR) : T.text }}>{value}</div>
                  {sub && <div style={{ fontSize:10.5, color:T.dim }}>{sub}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {latest && rev != null && a != null && a > 0 && (
          <div data-pcr-portal="" style={{ fontSize:12, color:T.muted, marginTop:8 }}>
            In the portal: approved budget {fmtFull(a)}
            {Math.abs(a - rev) <= 1 ? <span style={{ color:T.textOf(OK_CLR) }}> · the same as this PCR's revised budget</span>
              : <span> · {fmtFull(Math.abs(a - rev))} {a < rev ? "less" : "more"} than this PCR's revised budget</span>}
          </div>
        )}

        {texts.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap:`${SP.lg}px ${SP.xl}px`, marginTop:SP.lg }}>
            {texts.map(([title, t]) => <Section key={title} T={T} title={title}><Clamp T={T} text={t} /></Section>)}
          </div>
        )}

        {(r.deliverables || []).length > 0 && (
          <div style={{ marginTop:SP.lg }}>
            <Section T={T} title={`Deliverables (${r.deliverables.length})`}>
              <div style={{ overflowX:"auto", border:`1px solid ${T.border}`, borderRadius:R.md }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5 }}>
                  <thead><tr style={{ background:T.rowAlt }}>
                    {["Item", "Qty", "Unit", "Unit cost", "Total"].map((h, i) => (
                      <th key={h} style={{ textAlign: i ? "right" : "left", padding:"7px 10px", color:T.muted, fontWeight:600, fontSize:11 }}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {r.deliverables.map((x, i) => (
                      <tr key={i} style={{ borderTop:`1px solid ${T.border}` }}>
                        <td style={{ padding:"7px 10px", color:T.text }}>{x.item}</td>
                        <td style={{ padding:"7px 10px", textAlign:"right", fontVariantNumeric:"tabular-nums", color:T.text }}>{x.qty ?? "—"}</td>
                        <td style={{ padding:"7px 10px", textAlign:"right", color:T.muted }}>{x.unit || ""}</td>
                        <td style={{ padding:"7px 10px", textAlign:"right", fontVariantNumeric:"tabular-nums", color:T.text }}>{fmtFull(x.unit_cost)}</td>
                        <td style={{ padding:"7px 10px", textAlign:"right", fontVariantNumeric:"tabular-nums", color:T.text, fontWeight:600 }}>{fmtFull(x.total)}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {dates.length > 0 && (
          <div style={{ display:"flex", gap:SP.xl, flexWrap:"wrap", marginTop:SP.lg }}>
            {dates.map(([k, v]) => (
              <div key={k}><div style={{ fontSize:10.5, color:T.muted }}>{k}</div><div style={{ fontSize:13, color:T.text, fontWeight:600 }}>{v}</div></div>))}
          </div>
        )}

        {/* Approval block: eight steps */}
        <div style={{ marginTop:SP.lg }}>
          <Section T={T} title={total ? `Approvals · ${signed} of ${total} signed` : "Approvals"}>
            {!total && <div style={{ fontSize:12.5, color:T.muted }}>The approval page is not in this document.</div>}
            <div data-pcr-approvals="" style={{ display:"grid", gridTemplateColumns: isCompact ? "1fr" : "repeat(4, minmax(0,1fr))", gap:SP.sm }}>
              {(r.approvals || []).map((x, i) => {
                const s = STATUS[x.status] || STATUS.blank;
                return (
                  <div key={i} data-status={x.status} title={`${x.role}: ${s.label}${x.name ? ` (${x.name})` : ""}${x.date ? `, ${x.date}` : ""}`}
                    style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"8px 10px", borderRadius:R.md,
                      border:`1px solid ${x.status === "blank" ? T.border : s.color + "44"}`,
                      background: x.status === "blank" ? "transparent" : s.color + T.wash, minWidth:0 }}>
                    <s.Icon size={14} color={T.textOf(s.color)} style={{ flexShrink:0, marginTop:1 }} />
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:11.5, color:T.text, fontWeight:600, lineHeight:1.3 }}>{x.role}</div>
                      <div style={{ fontSize:11, color:T.muted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {x.name || s.label}{x.name && x.status !== "named" ? ` · ${s.label.toLowerCase()}` : ""}{x.date ? ` · ${x.date}` : ""}</div>
                    </div>
                  </div>);
              })}
            </div>
          </Section>
        </div>

        {(r.checks || []).length > 0 && (
          <div style={{ marginTop:SP.md, display:"flex", flexDirection:"column", gap:4 }}>
            {r.checks.map((c, i) => (
              <div key={i} style={{ fontSize:12, color:T.muted, display:"flex", gap:6, alignItems:"flex-start" }}>
                <AlertTriangle size={13} color={T.textOf(PCR_CLR)} style={{ flexShrink:0, marginTop:2 }} /> {c}</div>))}
          </div>
        )}

        <div style={{ display:"flex", gap:SP.sm, alignItems:"center", flexWrap:"wrap", marginTop:SP.lg,
          paddingTop:SP.md, borderTop:`1px solid ${T.border}`, fontSize:11.5, color:T.dim }}>
          <span style={{ flex:"1 1 200px" }}>
            {doc.file_name}{r.read_at ? ` · read ${fmtStamp(r.read_at)}` : ""}{r.confirmed && r.confirmed_at ? ` · checked ${fmtStamp(r.confirmed_at)}` : ""}
          </span>
          {isPMO && !r.confirmed && (<>
            <Button T={T} variant="ghost" size="sm" icon={RefreshCw} disabled={!!busy} onClick={() => onReadAgain(doc)}>Read again</Button>
            <Button T={T} variant="primary" size="sm" icon={CheckCircle2} disabled={!!busy} onClick={() => onConfirm(r)}
              title="You have checked this against the document">Confirm</Button>
          </>)}
          {isPMO && r.confirmed && (
            <Button T={T} variant="ghost" size="sm" disabled={!!busy} onClick={() => onUnconfirm(r)}>Unconfirm</Button>
          )}
        </div>
      </>)}
    </article>
  );
}

export function PcrTab({ T, session, supa, projectId, isCompact, ticked, approved }) {
  const isPMO = session?.role === "pmo";
  const { docs, readings, err, load } = usePcrData(supa, session, projectId);
  const [busy, setBusy] = useState(null);        // attachment id being read, or "save"
  const [msg, setMsg] = useState(null);
  const tried = useRef(new Set());               // documents already tried this visit (never loop on a failure)

  const read = useCallback(async (doc, force) => {
    setBusy(doc.id); setMsg(null);
    try {
      const r = await supa("/functions/v1/pcr-extract", { method:"POST", body: JSON.stringify({ attachment_id: doc.id, ...(force ? { force: true } : {}) }) },
                           session.access_token);
      if (r?.error) setMsg({ tone:"bad", text:`${doc.file_name} could not be read: ${r.error}` });
      else if (r?.skipped && r.skipped !== "already read") setMsg({ tone:"info", text:`${doc.file_name}: ${r.skipped}.` });
    } catch (e) { setMsg({ tone:"bad", text:`${doc.file_name} could not be read: ${e.message || "error"}` }); }
    await load();
    setBusy(null);
  }, [supa, session.access_token, load]);

  // The PMO's visit reads documents that have no reading yet, one at a time.
  useEffect(() => {
    if (!isPMO || inSim() || !docs || busy) return;
    const done = new Set(readings.map((r) => r.attachment_id));
    const next = docs.find((d) => !done.has(d.id) && !tried.current.has(d.id) && /\.(pdf|docx|jpe?g|png|webp)$/i.test(d.file_name || ""));
    if (next) { tried.current.add(next.id); read(next, false); }
  }, [isPMO, docs, readings, busy, read]);

  const patch = async (r, body) => {
    setBusy("save"); setMsg(null);
    try {
      await supa(`/rest/v1/project_pcrs?id=eq.${r.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify(body) },
                 session.access_token);
      await load();
    } catch (e) { setMsg({ tone:"bad", text: e.message || "Could not save that." }); }
    setBusy(null);
  };
  const open = async (doc) => { try { await openDoc(supa, session, doc); } catch (e) { setMsg({ tone:"bad", text: e.message }); } };

  if (docs === null) return (
    <div style={{ display:"flex", flexDirection:"column", gap:SP.md }}>
      <Skeleton T={T} h={22} w="40%" /><Skeleton T={T} h={160} /><Skeleton T={T} h={120} />
    </div>
  );

  const items = orderPcrs(docs, readings);
  const sumAdd = items.reduce((s, x) => s + (x.reading?.additional_cost != null ? +x.reading.additional_cost : 0), 0);
  const withAdd = items.filter((x) => x.reading?.additional_cost != null).length;
  const unread = items.filter((x) => !x.reading).length;

  return (
    <div data-pcr-tab="" style={{ display:"flex", flexDirection:"column", gap:SP.lg }}>
      <div style={{ display:"flex", alignItems:"center", gap:SP.md, flexWrap:"wrap" }}>
        <FileDiff size={17} color={T.textOf(PCR_CLR)} />
        <span style={{ fontSize:14, fontWeight:700, color:T.text }}>
          {items.length === 0 ? "No PCR document yet" : items.length === 1 ? "1 change request" : `${items.length} change requests`}
        </span>
        {withAdd > 1 && <span style={{ fontSize:12.5, color:T.muted }}>· together {fmtSigned(sumAdd)} additional</span>}
        {busy && busy !== "save" && (
          <span data-pcr-reading-now="" style={{ fontSize:12, color:T.muted, display:"inline-flex", alignItems:"center", gap:6 }}>
            <style>{"@keyframes pmoSpin{to{transform:rotate(360deg)}}"}</style>
            <Loader2 size={13} style={{ animation:"pmoSpin .8s linear infinite" }} /> Reading the PCR document… about 10 to 30 seconds</span>)}
      </div>

      {!ticked && items.length > 0 && isPMO && (
        <div data-pcr-untick="" style={{ fontSize:12.5, color:T.text, padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.md,
          background:PCR_CLR + T.wash, border:`1px solid ${PCR_CLR}44` }}>
          This project has a PCR document, but the PCR tick is off. Tick PCR in Edit project so the Projects list marks it.
        </div>
      )}
      {items.length === 0 && (
        <div style={{ fontSize:13, color:T.muted, lineHeight:1.6 }}>
          {isPMO ? "Upload the PCR in Documents with “PCR” in its file name; it is read here when you open this tab."
                 : "The PCR document has not been added to Documents yet."}
        </div>
      )}
      {msg && (
        <div role="status" style={{ fontSize:12.5, color: msg.tone === "bad" ? T.textOf(DATA.danger) : T.muted }}>{msg.text}</div>
      )}
      {err && <div role="alert" style={{ fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>}

      {items.map((it, i) => it.reading ? (
        <PcrReading key={it.doc.id} T={T} isCompact={isCompact} isPMO={isPMO} item={it} latest={i === 0 && items.length > 1}
          approved={approved} busy={busy} onOpen={open}
          onConfirm={(r) => patch(r, { confirmed: true })} onUnconfirm={(r) => patch(r, { confirmed: false })}
          onReadAgain={(d) => read(d, true)} />
      ) : (
        <div key={it.doc.id} data-pcr-unread={it.doc.id} style={{ display:"flex", alignItems:"center", gap:SP.md, flexWrap:"wrap",
          padding:SP.lg, borderRadius:R.lg, border:`1px dashed ${PCR_CLR}66`, background:T.surface }}>
          <FileDiff size={16} color={T.textOf(PCR_CLR)} />
          <div style={{ flex:"1 1 240px", minWidth:0 }}>
            <div style={{ fontSize:13, color:T.text, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis" }}>{it.doc.file_name}</div>
            <div style={{ fontSize:12, color:T.muted }}>
              {busy === it.doc.id ? "Reading…" : isPMO ? "Not read yet" : "Not yet checked by the PMO. Open the document to read it."}</div>
          </div>
          <Button T={T} variant="ghost" size="sm" icon={ExternalLink} onClick={() => open(it.doc)}>Open document</Button>
          {isPMO && busy !== it.doc.id && !inSim() && (
            <Button T={T} variant="subtle" size="sm" icon={RefreshCw} disabled={!!busy} onClick={() => read(it.doc, false)}>Read it</Button>)}
        </div>
      ))}

      {unread === 0 && items.length > 0 && items.some((x) => !x.reading.confirmed) && isPMO && (
        <div style={{ fontSize:12, color:T.dim }}>
          Readings are made by AI from the documents. Check each against its document, then press Confirm.
        </div>
      )}
    </div>
  );
}
