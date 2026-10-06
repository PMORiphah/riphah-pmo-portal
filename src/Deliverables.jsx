import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { PackageCheck, Sparkles, Plus, Pencil, Undo2, Check, X, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   DELIVERABLES (PMO, 6 Oct 2026)

   Only on CAPEX projects with a PMO-approved E-PDD PDD or a charter in their
   Documents (project_has_deliverables in the database). The lines come from the
   linked PDD's cost table with prices, kept in step by the database: when the
   PDD changes (approved at different prices, for instance) the lines update and
   the old price is shown beside the new one. Without a PDD, the charter is read
   once by the assistant into a draft the PMO confirms. Status, date and note are
   the portal's own; the PMO and the project's manager update them. The next
   phase will ask managers for these updates.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DELIV_STATUS = {
  not_started: { label:"Not started", color:"#8FA3BF" },
  ordered:     { label:"Ordered",     color:BRAND.blueBright },
  delivered:   { label:"Delivered",   color:DATA.warning },
  installed:   { label:"Installed",   color:"#8B7CF6" },
  handed_over: { label:"Handed over", color:DATA.positive },
};
const DONE = new Set(["delivered", "installed", "handed_over"]);
// Done · item · qty · unit cost · total · note · tools
const GRID = "24px minmax(0,1fr) 90px 100px 110px minmax(120px,200px) 44px";
const money = (n, cur = "PKR") => n == null ? "—" : `${cur === "PKR" ? "" : cur + " "}${Number(n).toLocaleString("en", { maximumFractionDigits: 2 })}`;
const qtyText = (r) => r.qty == null ? "—" : `${Number(r.qty).toLocaleString("en")}${r.unit ? ` ${r.unit}` : ""}`;
const fmtDay = (s) => s ? new Date(String(s).slice(0,10) + "T00:00:00").toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "";

/** Whether a project has the tab. Asks the database, which knows the rule. */
export async function hasDeliverables(supa, session, projectId) {
  try {
    const r = await supa("/rest/v1/rpc/project_has_deliverables", { method:"POST", body: JSON.stringify({ p: projectId }) },
                         session.access_token);
    return r === true;
  } catch { return false; }
}

export function ProjectDeliverables({ T, session, supa, projectId, canUpdate, isCompact }) {
  const isPMO = session?.role === "pmo";
  const [rows, setRows]   = useState(null);
  const [pdds, setPdds]   = useState({});
  const [err, setErr]     = useState(null);
  const [busy, setBusy]   = useState(null);      // id being saved, or "read" / "confirm"
  const [msg, setMsg]     = useState(null);
  const [edit, setEdit]   = useState(null);      // row being edited by the PMO ({} = new)
  const [showAside, setShowAside] = useState(false);
  const [hover, setHover] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await supa(`/rest/v1/project_deliverables?project_id=eq.${projectId}&select=*&order=sort_order.asc.nullslast,line_no.asc`,
                           {}, session.access_token);
      const list = Array.isArray(r) ? r : [];
      setRows(list);
      const ids = [...new Set(list.map(x => x.pdd_id).filter(Boolean))];
      if (isPMO && ids.length) {
        const p = await supa(`/rest/v1/epdd_pdds?id=in.(${ids.join(",")})&select=id,pdd_number,epdd_status`, {}, session.access_token)
          .catch(() => []);
        setPdds(Object.fromEntries((Array.isArray(p) ? p : []).map(x => [x.id, x])));
      }
    } catch (e) { setErr(e.message); setRows([]); }
  }, [projectId, supa, session, isPMO]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (rows || []).filter(r => !r.superseded), [rows]);
  const aside  = useMemo(() => (rows || []).filter(r => r.superseded), [rows]);
  const drafts = active.filter(r => !r.confirmed);
  const done   = active.filter(r => DONE.has(r.status)).length;
  const totals = useMemo(() => {
    const m = {};
    active.forEach(r => { if (r.total != null) m[r.currency || "PKR"] = (m[r.currency || "PKR"] || 0) + Number(r.total); });
    return m;
  }, [active]);
  const fromPdd = active.some(r => r.source === "pdd");
  const pddLabel = (() => {
    const id = active.find(r => r.pdd_id)?.pdd_id; const p = id && pdds[id];
    return p ? `${p.pdd_number} · ${p.epdd_status}` : fromPdd ? "the linked PDD" : null;
  })();

  const patch = async (id, body) => {
    setBusy(id); setErr(null);
    try {
      await supa(`/rest/v1/project_deliverables?id=eq.${id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify(body) }, session.access_token);
      await load();
    } catch (e) { setErr(e.message || "Could not save that."); }
    setBusy(null);
  };

  const readCharter = async () => {
    setBusy("read"); setErr(null); setMsg(null);
    try {
      const r = await supa("/functions/v1/deliverables-extract", { method:"POST", body: JSON.stringify({ project_id: projectId }) },
                           session.access_token);
      const res = r?.results?.[0] || {};
      if (res.error) setErr(`The charter could not be read: ${res.error}`);
      else if (res.skipped) setMsg(`Not read: ${res.skipped}.`);
      else setMsg(res.items?.length ? `${res.items.length} items read from ${res.file}. Check them, then confirm.`
                                    : `Nothing found in ${res.file}${res.note ? `: ${res.note}` : "."}`);
      await load();
    } catch (e) { setErr(e.message || "The charter could not be read."); }
    setBusy(null);
  };

  const confirmAll = async () => {
    setBusy("confirm"); setErr(null);
    try {
      await supa(`/rest/v1/project_deliverables?project_id=eq.${projectId}&source=eq.charter&confirmed=eq.false&superseded=eq.false`,
        { method:"PATCH", headers:{ Prefer:"return=minimal" }, body: JSON.stringify({ confirmed: true }) }, session.access_token);
      await load();
    } catch (e) { setErr(e.message || "Could not confirm."); }
    setBusy(null);
  };

  if (rows === null) return <div style={{ padding:SP.lg, color:T.muted, fontSize:13 }}>Loading deliverables…</div>;

  const pct = active.length ? done / active.length * 100 : 0;

  return (
    <div>
      {/* Summary: one line */}
      <div style={{ display:"flex", alignItems:"center", gap:SP.md, flexWrap:"wrap", marginBottom:SP.md }}>
        <PackageCheck size={16} color={T.textOf(BRAND.gold)} />
        <span style={{ fontSize:14, fontWeight:700, color:T.text }}>
          {done} of {active.length} delivered
        </span>
        {Object.keys(totals).length > 0 && (
          <span style={{ ...TYPE.caption, color:T.muted }}>
            {Object.entries(totals).map(([c, v]) => `${c} ${Number(v).toLocaleString("en")}`).join(" · ")}
          </span>
        )}
        <span style={{ ...TYPE.caption, color:T.dim }}>{pddLabel ? `from ${pddLabel}` : active.length ? "from the charter" : ""}</span>
        {active.length > 0 && (
          <span aria-hidden="true" style={{ flex:"1 1 120px", maxWidth:240, height:5, borderRadius:R.pill, background:T.card2, overflow:"hidden" }}>
            <span style={{ display:"block", width:`${pct}%`, height:"100%", background:DATA.positive, transition:`width ${MOTION.base}` }} />
          </span>
        )}
        {isPMO && (
          <div style={{ marginLeft:"auto", display:"flex", gap:SP.sm, flexWrap:"wrap" }}>
            {!fromPdd && (
              <Button T={T} size="sm" variant="ghost" icon={Sparkles} onClick={readCharter} loading={busy === "read"}>
                {active.some(r => r.source === "charter") ? "Read the charter again" : "Read the charter"}
              </Button>
            )}
            <Button T={T} size="sm" variant="ghost" icon={Plus} onClick={() => setEdit({})}>Add item</Button>
          </div>
        )}
      </div>

      {drafts.length > 0 && (
        <div style={{ display:"flex", gap:SP.sm, alignItems:"center", flexWrap:"wrap", marginBottom:SP.md, padding:"10px 13px",
          borderRadius:R.md, background:`${BRAND.gold}14`, border:`1px solid ${BRAND.gold}55` }}>
          <Sparkles size={14} color={T.textOf(BRAND.gold)} />
          <span style={{ fontSize:12.5, color:T.textSoft, flex:1, minWidth:200 }}>
            {drafts.length} item{drafts.length === 1 ? " was" : "s were"} read from the charter by the assistant.
            {isPMO ? " Check them against the charter, edit any that are wrong, then confirm." : " The PMO will confirm them."}
          </span>
          {isPMO && <Button T={T} size="sm" variant="primary" icon={Check} onClick={confirmAll} loading={busy === "confirm"}>Confirm all</Button>}
        </div>
      )}
      {msg && <div style={{ fontSize:12.5, color:T.muted, marginBottom:SP.sm }}>{msg}</div>}
      {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.sm }}>{err}</div>}

      {active.length === 0 ? (
        <div style={{ padding:SP.xl, textAlign:"center", borderRadius:R.md, border:`1px dashed ${T.borderStrong}`,
          color:T.muted, fontSize:13, lineHeight:1.6 }}>
          No deliverables listed yet.
          {isPMO ? " Read the charter to draft the list, or add the items yourself." : " The PMO will add them from the project's charter."}
        </div>
      ) : (
        <div style={{ border:`1px solid ${T.border}`, borderRadius:R.lg, overflow:"hidden", background:T.surface }}>
          {!isCompact && (
            <div style={{ display:"grid", gridTemplateColumns:GRID, gap:SP.sm, padding:"7px 12px",
              background:T.card2, ...TYPE.label, fontSize:9.5, color:T.dim }}>
              <span title="Delivered" style={{ display:"inline-flex", justifyContent:"center" }}><Check size={11} /></span><span>Item</span><span style={{ textAlign:"right" }}>Qty</span>
              <span style={{ textAlign:"right" }}>Unit cost</span><span style={{ textAlign:"right" }}>Total</span><span>Note</span><span />
            </div>
          )}
          {active.map((r, i) => {
            const isDone = DONE.has(r.status);
            const up = r.prev_total != null && r.total != null && Number(r.total) > Number(r.prev_total);
            const hot = hover === r.id;
            const on = CAN_HOVER ? { onMouseEnter:() => setHover(r.id), onMouseLeave:() => setHover(null) } : {};
            const toggle = () => canUpdate && busy !== r.id && patch(r.id, isDone
              ? { status:"not_started", status_date:null }
              : { status:"delivered", status_date:new Date().toISOString().slice(0,10) });
            const box = (
              <button onClick={toggle} disabled={!canUpdate || busy === r.id} aria-pressed={isDone}
                aria-label={isDone ? "Delivered; untick" : "Mark delivered"} title={isDone && r.status_date ? `Delivered ${fmtDay(r.status_date)}` : "Mark delivered"}
                className="pmo-focusable"
                style={{ width:20, height:20, borderRadius:5, flexShrink:0, cursor: canUpdate ? "pointer" : "default",
                  display:"inline-flex", alignItems:"center", justifyContent:"center", padding:0,
                  background: isDone ? DATA.positive : "transparent",
                  border:`1.5px solid ${isDone ? DATA.positive : T.borderStrong}`, transition:`all ${MOTION.fast}` }}>
                {isDone && <Check size={13} color="#fff" strokeWidth={3} />}
              </button>
            );
            const priceTag = r.price_changed_at && (
              <span title={`Price changed ${fmtDay(r.price_changed_at)}: was ${money(r.prev_total, r.currency)}`}
                style={{ display:"inline-flex", alignItems:"center", gap:3, marginLeft:6, ...TYPE.caption, fontWeight:700,
                  color:T.textOf(up ? DATA.danger : DATA.positive) }}>
                {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}was {money(r.prev_total, r.currency)}
              </span>
            );
            const tools = isPMO && (
              <span style={{ display:"inline-flex", gap:2, opacity: hot || isCompact ? 1 : 0, transition:`opacity ${MOTION.fast}` }}>
                <button className="pmo-focusable pmo-btn" onClick={() => setEdit(r)} title="Edit item"
                  style={{ background:"none", border:"none", color:T.dim, cursor:"pointer", padding:3 }}><Pencil size={12} /></button>
                <button className="pmo-focusable pmo-btn" onClick={() => patch(r.id, { superseded: true })} title="Set aside"
                  style={{ background:"none", border:"none", color:T.dim, cursor:"pointer", padding:3 }}><X size={13} /></button>
              </span>
            );
            const title = (
              <span style={{ fontSize:13, color: isDone ? T.muted : T.text, fontWeight:600, lineHeight:1.4,
                textDecoration: isDone ? "line-through" : "none", textDecorationColor:`${T.muted}88`, overflowWrap:"anywhere" }}>
                {r.title}
                {!r.confirmed && <span style={{ ...TYPE.caption, fontWeight:700, color:T.textOf(BRAND.gold), marginLeft:6 }}>draft</span>}
                {priceTag}
              </span>
            );
            const note = canUpdate
              ? <NoteField T={T} value={r.note || ""} onSave={v => patch(r.id, { note: v || null })} />
              : <span style={{ fontSize:12, color:T.muted }}>{r.note || ""}</span>;
            const rowStyle = { borderTop: i ? `1px solid ${T.border}` : "none", background: hot ? T.surfaceRaised : "transparent",
              transition:`background ${MOTION.fast}` };
            if (isCompact) return (
              <div key={r.id} {...on} style={{ ...rowStyle, display:"flex", gap:10, padding:"9px 12px", alignItems:"flex-start" }}>
                <span style={{ paddingTop:1 }}>{box}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  {title}
                  <div style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>
                    {qtyText(r)}{r.total != null ? ` · ${r.currency} ${Number(r.total).toLocaleString("en")}` : ""}
                  </div>
                  <div style={{ marginTop:4 }}>{note}</div>
                </div>
                {tools}
              </div>
            );
            return (
              <div key={r.id} {...on} style={{ ...rowStyle, display:"grid", gridTemplateColumns:GRID, gap:SP.sm,
                padding:"7px 12px", alignItems:"center" }}>
                {box}
                {title}
                <span style={{ fontSize:12.5, color:T.textSoft, textAlign:"right", whiteSpace:"nowrap" }}>{qtyText(r)}</span>
                <span style={{ fontSize:12.5, color:T.textSoft, textAlign:"right", whiteSpace:"nowrap" }}>{money(r.unit_cost, r.currency)}</span>
                <span style={{ fontSize:12.5, color:T.text, fontWeight:700, textAlign:"right", whiteSpace:"nowrap" }}>{money(r.total, r.currency)}</span>
                {note}
                {tools || <span />}
              </div>
            );
          })}
        </div>
      )}

      {isPMO && aside.length > 0 && (
        <div style={{ marginTop:SP.lg }}>
          <button className="pmo-focusable pmo-btn" onClick={() => setShowAside(v => !v)}
            style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, ...TYPE.caption }}>
            {showAside ? "Hide" : "Show"} {aside.length} set aside (no longer in the PDD, replaced, or removed)
          </button>
          {showAside && aside.map(r => (
            <div key={r.id} style={{ display:"flex", gap:SP.sm, alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${T.border}`,
              fontSize:12, color:T.dim }}>
              <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {r.source === "charter" ? "Charter" : r.source === "pdd" ? "PDD" : "PMO"} · {r.title}
              </span>
              <span>{qtyText(r)}</span>
              <Button T={T} size="sm" variant="ghost" icon={Undo2} onClick={() => patch(r.id, { superseded: false })}>Restore</Button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <EditDeliverable T={T} session={session} supa={supa} projectId={projectId} row={edit}
          nextOrder={(rows || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1}
          currency={active[0]?.currency || "PKR"} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      )}
    </div>
  );
}

function NoteField({ T, value, onSave }) {
  const [v, setV] = useState(value);
  const [focus, setFocus] = useState(false);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} onChange={e => setV(e.target.value)} placeholder="+ note" maxLength={200}
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); if (v !== value) onSave(v.trim()); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value); e.currentTarget.blur(); } }}
      style={{ width:"100%", boxSizing:"border-box", fontSize:12, fontFamily:TYPE.body.fontFamily, color:T.textSoft,
        padding:"4px 7px", borderRadius:R.sm, outline:"none",
        background: focus ? T.inputBg : "transparent", border:`1px solid ${focus ? T.inputBorder : "transparent"}` }} />
  );
}

function EditDeliverable({ T, session, supa, projectId, row, nextOrder, currency, onClose, onSaved }) {
  const isNew = !row.id;
  const [f, setF] = useState({ title: row.title || "", qty: row.qty ?? "", unit: row.unit || "",
    unit_cost: row.unit_cost ?? "", total: row.total ?? "", currency: row.currency || currency });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const num = (v) => v === "" || v == null ? null : Number(v);
  const save = async () => {
    if (!f.title.trim()) return setErr("Describe the item.");
    for (const k of ["qty", "unit_cost", "total"]) if (f[k] !== "" && !isFinite(Number(f[k]))) return setErr("Quantity and prices must be numbers.");
    setBusy(true); setErr(null);
    const total = f.total !== "" ? num(f.total) : (f.qty !== "" && f.unit_cost !== "" ? num(f.qty) * num(f.unit_cost) : null);
    const body = { title: f.title.trim(), qty: num(f.qty), unit: f.unit.trim() || null, unit_cost: num(f.unit_cost), total,
                   currency: f.currency || "PKR" };
    try {
      if (isNew) await supa("/rest/v1/project_deliverables", { method:"POST", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify({ ...body, project_id: projectId, source: "pmo", sort_order: nextOrder }) }, session.access_token);
      else await supa(`/rest/v1/project_deliverables?id=eq.${row.id}`, { method:"PATCH", headers:{ Prefer:"return=minimal" },
        body: JSON.stringify(body) }, session.access_token);
      onSaved();
    } catch (e) { setErr(e.message || "Could not save."); }
    setBusy(false);
  };
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm, padding:"8px 10px",
    fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none", width:"100%", boxSizing:"border-box" };
  const lab = (t) => <div style={{ fontSize:11.5, color:T.muted, marginBottom:4 }}>{t}</div>;
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1350, background:"rgba(3,8,16,0.74)", backdropFilter:"blur(6px)",
        display:"flex", alignItems:"center", justifyContent:"center", padding:SP.lg }}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add deliverable" : "Edit deliverable"}
        style={{ width:560, maxWidth:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.xl,
          boxShadow:T.shadowLg, padding:SP.xl }}>
        <div style={{ ...TYPE.display, fontSize:17, color:T.text, marginBottom:SP.md, display:"flex", alignItems:"center", gap:8 }}>
          <FileText size={16} /> {isNew ? "Add deliverable" : "Edit deliverable"}
        </div>
        {row.source === "pdd" && (
          <div style={{ fontSize:11.5, color:T.textOf(DATA.warning), marginBottom:SP.sm, lineHeight:1.55 }}>
            This line comes from the PDD; the next change on E-PDD will set it back to the PDD's figures.
          </div>
        )}
        <label style={{ display:"block", marginBottom:SP.sm }}>{lab("Item")}
          <textarea rows={2} value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} style={{ ...inp, resize:"vertical" }} />
        </label>
        <div style={{ display:"grid", gap:SP.sm, gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", marginBottom:SP.md }}>
          {[["qty","Quantity"],["unit","Unit"],["unit_cost","Unit cost"],["total","Total"],["currency","Currency"]].map(([k, t]) => (
            <label key={k} style={{ display:"block" }}>{lab(t)}
              <input value={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.value }))} style={inp}
                inputMode={["qty","unit_cost","total"].includes(k) ? "decimal" : undefined} />
            </label>
          ))}
        </div>
        {err && <div style={{ fontSize:12.5, color:T.textOf(DATA.danger), marginBottom:SP.sm }}>{err}</div>}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:SP.sm }}>
          <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button T={T} variant="primary" onClick={save} loading={busy}>{isNew ? "Add" : "Save"}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
