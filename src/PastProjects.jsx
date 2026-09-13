import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { History, Search, X, Send, Mail, Pencil, ChevronDown, ChevronRight,
         Clock, AlertTriangle, CheckCircle2, MessageSquare, Plus } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, Input, Button, CAN_HOVER } from "./ui.jsx";

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

  const isPMO = session?.role === "pmo";

  const load = useCallback(async () => {
    try {
      const r = await supa("/rest/v1/past_project_summary?select=*&order=fiscal_year.desc",
                           {}, session.access_token);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setRows([]); }
  }, [supa, session]);
  useEffect(() => { load(); }, [load]);

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
            <span style={{ marginLeft:"auto", ...TYPE.caption, color:T.muted }}>
              {list.length} shown
            </span>
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

      {open && (
        <ThreadModal T={T} session={session} supa={supa} row={open} isPMO={isPMO}
          isCompact={isCompact} onClose={() => setOpen(null)}
          onChanged={() => { load(); setOpen(o => o && rows.find(x => x.id === o.id) || o); }} />
      )}
    </div>
  );
}
