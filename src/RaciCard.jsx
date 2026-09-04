import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, X, Pencil, ArrowRight, Trash2, GripVertical } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   RACI — Project Responsibility

   A four-column summary of who is Responsible, Accountable, Consulted and
   Informed. Deliberately not a matrix: one project, four columns, a handful
   of names. Everything past that lives in the details modal.

   Entries carry a free-text name with an optional link to a portal user,
   because Consulted and Informed are routinely a department rather than
   someone with a login. Read follows project visibility; writes are PMO only,
   enforced in RLS as well as here.
   ═══════════════════════════════════════════════════════════════════════════ */

const ROLES = [
  { key:"responsible", letter:"R", label:"Responsible", color:"#4A9BE0",
    blurb:"Executes and manages the assigned project activities." },
  { key:"accountable", letter:"A", label:"Accountable", color:BRAND.gold,
    blurb:"Ultimately owns the project's outcome and decisions." },
  { key:"consulted",   letter:"C", label:"Consulted",   color:DATA.violet,
    blurb:"Provides expertise and input before key decisions." },
  { key:"informed",    letter:"I", label:"Informed",    color:"#22C4A8",
    blurb:"Receives relevant project updates and decisions." },
];

// Two initials for a person, but a short acronym is better shown whole:
// "PMO" reduced to a bare "P" reads as a name nobody recognises, and PMO now
// appears on every project.
const initialsOf = (name) => {
  const words = (name || "?").split(/[\s.]+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) {
    const w = words[0];
    if (w.length <= 3 && w === w.toUpperCase()) return w;   // PMO, IT, HR
    return w[0].toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
};

/* One-off keyframes. Scoped names so they can't collide with the portal's
   own pmo* animations. Injected once, not per instance. */
let stylesInjected = false;
function useRaciStyles() {
  useEffect(() => {
    if (stylesInjected) return;
    stylesInjected = true;
    const el = document.createElement("style");
    el.setAttribute("data-raci", "");
    el.textContent = `
@keyframes raciIn { from { opacity:0; transform:translateY(8px); filter:blur(4px); }
                    to   { opacity:1; transform:none;            filter:blur(0); } }
@keyframes raciTipIn { from { opacity:0; transform:translateY(4px) scale(.98); }
                       to   { opacity:1; transform:none; } }
@keyframes raciAmbient {
  0%   { transform:translate3d(-6%, -4%, 0) scale(1); }
  50%  { transform:translate3d( 6%,  3%, 0) scale(1.06); }
  100% { transform:translate3d(-6%, -4%, 0) scale(1); } }
.raci-card { animation: raciIn .45s cubic-bezier(.22,.8,.3,1) both; }
.raci-tip  { animation: raciTipIn .18s ease-out both; }
.raci-amb  { animation: raciAmbient 34s ease-in-out infinite; will-change: transform; }
@media (prefers-reduced-motion: reduce) {
  .raci-card, .raci-tip { animation: none !important; }
  .raci-amb { animation: none !important; }
}`;
    document.head.appendChild(el);
  }, []);
}

/* ── Small floating tooltip / person card ── */
function Floating({ T, children, align = "center" }) {
  return (
    <div className="raci-tip" role="tooltip" style={{
      position:"absolute", bottom:"calc(100% + 9px)", zIndex:40,
      left: align === "center" ? "50%" : 0,
      transform: align === "center" ? "translateX(-50%)" : "none",
      minWidth:172, maxWidth:236, padding:"9px 11px",
      background:T.surfaceFloat, border:`1px solid ${T.borderStrong}`,
      borderRadius:R.md, boxShadow:T.shadowLg,
      backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
      pointerEvents:"none", textAlign:"left",
    }}>{children}</div>
  );
}

/* ── A person chip ── */
function PersonChip({ T, entry, role, onHoverChange }) {
  const [hot, setHot] = useState(false);
  const flag = (v) => { setHot(v); onHoverChange?.(v); };
  const on = CAN_HOVER ? { onMouseEnter:() => flag(true), onMouseLeave:() => flag(false) } : {};
  return (
    <div {...on} style={{ position:"relative", display:"flex", alignItems:"center", gap:8,
      padding:"5px 6px", margin:"0 -6px", borderRadius:R.sm,
      background: hot ? `${role.color}12` : "transparent",
      transition:`background ${MOTION.fast}` }}>
      <div style={{
        width:26, height:26, borderRadius:"50%", flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:9.5, fontWeight:800, letterSpacing:.2,
        color: role.color,
        background:`${role.color}1A`,
        border:`1px solid ${role.color}${hot ? "7A" : "3D"}`,
        boxShadow: hot ? `0 0 0 3px ${role.color}14, 0 4px 10px -4px ${role.color}66` : "none",
        transform: hot ? "scale(1.05)" : "scale(1)",
        transition:`transform ${MOTION.fast}, box-shadow ${MOTION.fast}, border-color ${MOTION.fast}`,
      }}>{initialsOf(entry.person_name)}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:12.5, fontWeight:600, color:T.text, lineHeight:1.3,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {entry.person_name}
        </div>
        {entry.person_title && (
          <div style={{ fontSize:10.5, color:T.dim, lineHeight:1.35,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {entry.person_title}
          </div>
        )}
      </div>
      {hot && (
        <Floating T={T} align="left">
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:9, fontWeight:800, color:role.color,
              background:`${role.color}1A`, border:`1px solid ${role.color}4D` }}>
              {initialsOf(entry.person_name)}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:T.text, lineHeight:1.3 }}>{entry.person_name}</div>
              {entry.person_title && <div style={{ fontSize:10.5, color:T.muted }}>{entry.person_title}</div>}
            </div>
          </div>
          <div style={{ height:1, background:T.border, margin:"7px 0" }} />
          <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:1, textTransform:"uppercase",
            color:T.muted, marginBottom:2 }}>Responsibility</div>
          <div style={{ fontSize:11.5, fontWeight:600, color:role.color }}>{role.label}</div>
        </Floating>
      )}
    </div>
  );
}

/* ── Empty slot ── */
function EmptySlot({ T, role, canWrite, onAssign }) {
  const [hot, setHot] = useState(false);
  const on = CAN_HOVER ? { onMouseEnter:() => setHot(true), onMouseLeave:() => setHot(false) } : {};
  const Tag = canWrite ? "button" : "div";
  return (
    <Tag {...on} {...(canWrite ? { onClick:onAssign, className:"pmo-focusable pmo-btn", type:"button" } : {})}
      style={{ position:"relative", display:"flex", alignItems:"center", gap:8, width:"100%",
        padding:"5px 6px", margin:"0 -6px", borderRadius:R.sm, textAlign:"left",
        background:"transparent", border:"none", font:"inherit",
        cursor: canWrite ? "pointer" : "default" }}>
      <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center",
        border:`1px dashed ${hot && canWrite ? `${role.color}7A` : T.borderStrong}`,
        color: hot && canWrite ? role.color : T.dim,
        transition:`color ${MOTION.fast}, border-color ${MOTION.fast}` }}>
        {canWrite ? <Plus size={12} /> : <span style={{ fontSize:11 }}>—</span>}
      </div>
      <div style={{ fontSize:12, color: hot && canWrite ? T.muted : T.dim }}>
        {canWrite ? "Add" : "Not assigned"}
      </div>
      {hot && canWrite && (
        <Floating T={T} align="left">
          <div style={{ fontSize:11.5, color:T.textSoft, lineHeight:1.5 }}>
            Assign a person to this RACI role
          </div>
        </Floating>
      )}
    </Tag>
  );
}

/* ── One of the four columns ── */
function RoleColumn({ T, role, entries, canWrite, onAssign, hovered, setHovered }) {
  const [personHot, setPersonHot] = useState(false);
  const active = hovered === role.key;
  const on = CAN_HOVER
    ? { onMouseEnter:() => setHovered(role.key),
        onMouseLeave:() => { setHovered(null); setPersonHot(false); } }
    : {};
  return (
    <div {...on} style={{ position:"relative", minWidth:0, padding:"12px 12px 13px",
      borderRadius:R.md,
      background: active ? `${role.color}0E` : "transparent",
      boxShadow: active ? `inset 0 0 0 1px ${role.color}2E` : "inset 0 0 0 1px transparent",
      transition:`background ${MOTION.base}, box-shadow ${MOTION.base}` }}>

      <div style={{ position:"relative", display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{
          width:28, height:28, borderRadius:9, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontWeight:800, color:role.color,
          background:`linear-gradient(145deg, ${role.color}26, ${role.color}0D)`,
          border:`1px solid ${role.color}${active ? "6B" : "33"}`,
          boxShadow: active ? `0 0 14px -3px ${role.color}77` : "none",
          transition:`box-shadow ${MOTION.base}, border-color ${MOTION.base}`,
        }}>{role.letter}</div>
        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:.8, textTransform:"uppercase",
          color: active ? role.color : T.muted, transition:`color ${MOTION.base}`,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {role.label}
        </div>
        {active && !personHot && (
          <Floating T={T}>
            <div style={{ fontSize:11.5, fontWeight:700, color:role.color, marginBottom:3 }}>{role.label}</div>
            <div style={{ fontSize:11, color:T.textSoft, lineHeight:1.5 }}>{role.blurb}</div>
          </Floating>
        )}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {entries.length === 0
          ? <EmptySlot T={T} role={role} canWrite={canWrite} onAssign={() => onAssign(role.key)} />
          : entries.map(e => (
              <PersonChip key={e.id} T={T} entry={e} role={role} onHoverChange={setPersonHot} />
            ))}
      </div>
    </div>
  );
}

/* ── Details modal ── */
function RaciDetailsModal({ T, byRole, onClose, isMobile }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(3,8,16,0.66)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex",
        alignItems: isMobile ? "flex-end" : "center", justifyContent:"center",
        padding: isMobile ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="RACI details"
        style={{ background:T.surfaceOver, border:`1px solid ${T.borderStrong}`,
          borderRadius: isMobile ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          padding:SP.xxl, width:520, maxWidth:"100%", maxHeight:"88vh", overflow:"auto",
          boxShadow:T.shadowLg }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between",
          gap:12, marginBottom:18, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
          <div>
            <div style={{ ...TYPE.display, fontSize:19, color:T.text, letterSpacing:1 }}>RACI</div>
            <div style={{ fontSize:11.5, color:T.muted, marginTop:2 }}>Project Responsibility</div>
          </div>
          <button className="pmo-focusable pmo-btn" onClick={onClose} aria-label="Close"
            style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, padding:4 }}>
            <X size={17} />
          </button>
        </div>

        {ROLES.map(role => (
          <div key={role.key} style={{ marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
              <div style={{ width:22, height:22, borderRadius:7, display:"flex",
                alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800,
                color:role.color, background:`${role.color}1F`, border:`1px solid ${role.color}3D` }}>
                {role.letter}
              </div>
              <div style={{ fontSize:12.5, fontWeight:700, color:T.text }}>{role.label}</div>
              <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${role.color}3D, transparent)` }} />
            </div>
            <div style={{ fontSize:11, color:T.dim, marginBottom:8, lineHeight:1.5 }}>{role.blurb}</div>
            {(byRole[role.key] || []).length === 0 ? (
              <div style={{ fontSize:12, color:T.dim, paddingLeft:30 }}>Not assigned.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8, paddingLeft:2 }}>
                {byRole[role.key].map(e => (
                  <div key={e.id} style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9.5, fontWeight:800, color:role.color,
                      background:`${role.color}1A`, border:`1px solid ${role.color}3D` }}>
                      {initialsOf(e.person_name)}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{e.person_name}</div>
                      {e.person_title && <div style={{ fontSize:11, color:T.muted }}>{e.person_title}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Editor (PMO only) ── */
function RaciEditModal({ T, session, supa, projectId, entries, users, focusRole, onClose, onSaved, isMobile }) {
  const [rows, setRows] = useState(() => entries.map(e => ({ ...e, _key: e.id })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const nextKey = useRef(0);

  const add = (roleKey) => setRows(r => [...r, {
    _key: `new-${nextKey.current++}`, id: null, raci_role: roleKey,
    person_name: "", person_title: "", user_id: null,
  }]);
  const patch = (key, k, v) => setRows(r => r.map(x => x._key === key ? { ...x, [k]: v } : x));
  const drop  = (key) => setRows(r => r.filter(x => x._key !== key));

  const pickUser = (key, uid) => {
    const u = users.find(x => x.id === uid);
    setRows(r => r.map(x => x._key === key
      ? { ...x, user_id: uid || null,
          person_name: u ? (u.full_name || u.username) : x.person_name,
          person_title: u && !x.person_title ? (u.role === "pmo" ? "PMO" : "Project Manager") : x.person_title }
      : x));
  };

  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"7px 9px", fontSize:12.5, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };

  const save = async () => {
    setErr(null);
    const clean = rows.filter(r => (r.person_name || "").trim());
    setSaving(true);
    try {
      // Replace wholesale: the set is tiny and this avoids diffing three ways.
      await supa(`/rest/v1/project_raci?project_id=eq.${projectId}`,
        { method:"DELETE", headers:{ Prefer:"return=minimal" } }, session.access_token);
      if (clean.length) {
        const payload = clean.map((r, i) => ({
          project_id: projectId, raci_role: r.raci_role,
          user_id: r.user_id || null,
          person_name: r.person_name.trim(),
          person_title: (r.person_title || "").trim() || null,
          sort_order: i,
        }));
        await supa("/rest/v1/project_raci", {
          method:"POST", body:JSON.stringify(payload), headers:{ Prefer:"return=minimal" },
        }, session.access_token);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Could not save the RACI."); }
    setSaving(false);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(3,8,16,0.66)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex",
        alignItems: isMobile ? "flex-end" : "center", justifyContent:"center",
        padding: isMobile ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="Edit RACI"
        style={{ background:T.surfaceOver, border:`1px solid ${T.borderStrong}`,
          borderRadius: isMobile ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          padding:SP.xxl, width:560, maxWidth:"100%", maxHeight:"88vh", overflow:"auto",
          boxShadow:T.shadowLg }}>
        <div style={{ ...TYPE.display, fontSize:18, color:T.text, marginBottom:18,
          paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>Edit RACI</div>

        {ROLES.map(role => {
          const mine = rows.filter(r => r.raci_role === role.key);
          return (
            <div key={role.key} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:20, height:20, borderRadius:6, display:"flex",
                  alignItems:"center", justifyContent:"center", fontSize:10.5, fontWeight:800,
                  color:role.color, background:`${role.color}1F`, border:`1px solid ${role.color}3D` }}>
                  {role.letter}
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{role.label}</div>
                <button className="pmo-focusable pmo-btn" type="button" onClick={() => add(role.key)}
                  style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4,
                    background:"none", border:`1px solid ${T.border}`, borderRadius:R.sm,
                    padding:"3px 9px", color:T.muted, fontSize:11, cursor:"pointer",
                    fontFamily:TYPE.body.fontFamily }}>
                  <Plus size={11} /> Add
                </button>
              </div>
              {mine.length === 0 && (
                <div style={{ fontSize:11.5, color:T.dim, paddingLeft:28, marginBottom:4 }}>Nobody assigned.</div>
              )}
              {mine.map(r => (
                <div key={r._key} style={{ display:"grid",
                  gridTemplateColumns: isMobile ? "1fr auto" : "1.1fr 1fr 1fr auto",
                  gap:6, marginBottom:6, alignItems:"center" }}>
                  {!isMobile && (
                    <Select T={T} value={r.user_id || ""} onChange={e => pickUser(r._key, e.target.value)}
                      style={{ ...inp, cursor:"pointer" }}>
                      <option value="">Not a portal user</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                    </Select>
                  )}
                  <input value={r.person_name} placeholder="Name or team"
                    onChange={e => patch(r._key, "person_name", e.target.value)} style={inp} />
                  {!isMobile && (
                    <input value={r.person_title || ""} placeholder="Title (optional)"
                      onChange={e => patch(r._key, "person_title", e.target.value)} style={inp} />
                  )}
                  <button className="pmo-focusable pmo-btn" type="button" onClick={() => drop(r._key)}
                    aria-label="Remove"
                    style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        {err && (
          <div style={{ marginBottom:14, padding:"9px 13px", borderRadius:R.md,
            background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)",
            color:"#F87171", fontSize:12 }}>{err}</div>
        )}

        <div style={{ display:"flex", gap:SP.sm, marginTop:6 }}>
          <button className="pmo-focusable pmo-btn" onClick={onClose} disabled={saving}
            style={{ flex:1, padding:10, borderRadius:R.md, border:`1px solid ${T.border}`,
              background:"none", color:T.muted, cursor:"pointer", fontSize:13,
              fontFamily:TYPE.body.fontFamily }}>Cancel</button>
          <button className="pmo-focusable pmo-btn" onClick={save} disabled={saving}
            style={{ flex:2, padding:10, borderRadius:R.md, border:"none",
              background: saving ? T.muted : "#185078", color:"#fff",
              cursor: saving ? "default" : "pointer", fontSize:13, fontWeight:700,
              fontFamily:TYPE.body.fontFamily }}>
            {saving ? "Saving…" : "Save RACI"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── The card ── */
export function ProjectRaciCard({ T, session, supa, projectId, canWrite, isCompact }) {
  useRaciStyles();
  const [entries, setEntries] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [cardHot, setCardHot] = useState(false);
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkHot, setLinkHot] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await supa(
        `/rest/v1/project_raci?project_id=eq.${projectId}&select=*&order=raci_role.asc,sort_order.asc`,
        {}, session.access_token);
      setEntries(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr(e.message); setEntries([]); }
  }, [supa, session, projectId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    let alive = true;
    supa("/rest/v1/user_profiles?is_active=eq.true&select=id,username,full_name,role&order=full_name.asc",
      {}, session.access_token)
      .then(u => { if (alive) setUsers(u || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [canWrite, session.access_token]);

  const byRole = useMemo(() => {
    const m = { responsible:[], accountable:[], consulted:[], informed:[] };
    (entries || []).forEach(e => { (m[e.raci_role] ||= []).push(e); });
    return m;
  }, [entries]);

  const total = entries?.length ?? 0;
  const cols = isCompact ? "1fr 1fr" : "repeat(4, 1fr)";

  const openEditor = () => setEditing(true);
  const on = CAN_HOVER
    ? { onMouseEnter:() => setCardHot(true), onMouseLeave:() => { setCardHot(false); setHovered(null); } }
    : {};

  return (
    <div className="raci-card" {...on} style={{
      position:"relative", marginTop:SP.lg,
      borderRadius:R.lg, padding:"18px 20px 16px",
      background: T.mode === "dark"
        ? "linear-gradient(160deg, rgba(24,44,74,0.92) 0%, rgba(14,26,46,0.96) 58%, rgba(11,20,36,0.98) 100%)"
        : "linear-gradient(160deg, rgba(255,255,255,0.96) 0%, rgba(246,249,253,0.96) 60%, rgba(240,245,251,0.98) 100%)",
      border:`1px solid ${cardHot ? T.borderStrong : T.border}`,
      boxShadow: cardHot
        ? `${T.shadowLg}, 0 0 0 1px ${BRAND.gold}14`
        : T.shadow,
      transform: cardHot ? "translateY(-1px)" : "translateY(0)",
      transition:`transform ${MOTION.base}, box-shadow ${MOTION.base}, border-color ${MOTION.base}`,
    }}>
      {/* The glow needs clipping to the card's corners; the card itself must
          not clip, or the hover tooltips get cut off at its edge. So the
          overflow lives on this wrapper rather than on the card. */}
      <div aria-hidden="true" style={{ position:"absolute", inset:0, borderRadius:R.lg,
        overflow:"hidden", pointerEvents:"none" }}>
        {/* Ambient light. Very slow, very low contrast — presence, not motion. */}
        <div className="raci-amb" style={{
          position:"absolute", top:"-55%", right:"-25%", width:420, height:420,
          borderRadius:"50%",
          opacity: T.mode === "dark" ? (cardHot ? 0.5 : 0.34) : (cardHot ? 0.4 : 0.26),
          background:`radial-gradient(circle, ${BRAND.gold}1F 0%, ${"#4A9BE0"}14 42%, transparent 70%)`,
          transition:`opacity ${MOTION.slow}`,
        }} />
      </div>

      <div style={{ position:"relative" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between",
          gap:12, marginBottom:4, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ ...TYPE.display, fontSize:15, letterSpacing:2.4, color:T.text }}>RACI</span>
            {canWrite && total > 0 && (
              <button className="pmo-focusable pmo-btn" onClick={openEditor} aria-label="Edit RACI"
                style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:2 }}>
                <Pencil size={12} />
              </button>
            )}
          </div>
          <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:1.4, textTransform:"uppercase",
            color:T.muted }}>Project Responsibility</span>
        </div>

        {/* Hairline that links the four columns; lights up with the hovered one */}
        <div style={{ position:"relative", height:1, marginBottom:6,
          background: hovered
            ? `linear-gradient(90deg, transparent, ${(ROLES.find(r => r.key === hovered) || {}).color}5C, transparent)`
            : `linear-gradient(90deg, transparent, ${T.borderStrong}, transparent)`,
          transition:`background ${MOTION.base}` }} />

        {err && <div style={{ fontSize:11.5, color:T.textOf(T.danger), marginBottom:8 }}>{err}</div>}

        {entries === null ? (
          <div style={{ fontSize:12, color:T.dim, padding:"18px 0" }}>Loading…</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:cols, gap:2 }}>
            {ROLES.map(role => (
              <RoleColumn key={role.key} T={T} role={role} entries={byRole[role.key] || []}
                canWrite={canWrite} onAssign={openEditor}
                hovered={hovered} setHovered={setHovered} />
            ))}
          </div>
        )}

        {/* Footer action */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
          <button className="pmo-focusable pmo-btn" onClick={() => setDetails(true)}
            onMouseEnter={() => setLinkHot(true)} onMouseLeave={() => setLinkHot(false)}
            style={{ display:"inline-flex", alignItems:"center", gap:6, background:"none",
              border:"none", padding:"4px 2px", cursor:"pointer",
              fontFamily:TYPE.body.fontFamily, fontSize:11.5, fontWeight:600,
              color: linkHot ? T.textOf(BRAND.gold) : T.muted,
              transition:`color ${MOTION.fast}` }}>
            Show RACI details
            <ArrowRight size={12} style={{ transform: linkHot ? "translateX(3px)" : "none",
              transition:`transform ${MOTION.fast}` }} />
          </button>
        </div>
      </div>

      {details && (
        <RaciDetailsModal T={T} byRole={byRole} isMobile={isCompact} onClose={() => setDetails(false)} />
      )}
      {editing && (
        <RaciEditModal T={T} session={session} supa={supa} projectId={projectId}
          entries={entries || []} users={users} isMobile={isCompact}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }} />
      )}
    </div>
  );
}
