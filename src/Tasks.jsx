import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, X,
         IndentIncrease, IndentDecrease, Diamond, AlertTriangle } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Select, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   WORK BREAKDOWN

   A task tree per project. Parent rows never store their own dates — they are
   computed from their children here, so a summary can't drift out of step with
   what sits beneath it.

   Baselines are PMO-only, enforced by a database trigger rather than by hiding
   the input. A project manager moves dates freely and the variance against the
   frozen plan is what leadership reads; that is the whole point of separating
   the two.
   ═══════════════════════════════════════════════════════════════════════════ */

const DAY = 86400000;
const d0 = (s) => { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; };
const iso = (d) => d ? d.toISOString().slice(0, 10) : null;
const fmtD = (s) => { const d = d0(s); return d ? d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }) : "—"; };
const days = (a, b) => (a && b) ? Math.round((d0(b) - d0(a)) / DAY) : null;

const STATUS = {
  not_started:{ label:"Not started", color:"#8FA3BF" },
  in_progress:{ label:"In progress", color:BRAND.blueBright },
  done:       { label:"Done",        color:DATA.positive },
  blocked:    { label:"Blocked",     color:DATA.danger },
  cancelled:  { label:"Cancelled",   color:"#6B7A8C" },
};

/* Build the tree and roll leaf dates and progress up into the parents. */
function buildTree(rows) {
  const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
  const roots = [];
  byId.forEach(n => {
    const p = n.parent_id ? byId.get(n.parent_id) : null;
    (p ? p.children : roots).push(n);
  });
  const sortKids = (list) => {
    list.sort((a, b) =>
      (a.sort_order - b.sort_order)
      || ((a.start_date || "9999") < (b.start_date || "9999") ? -1
        : (a.start_date || "9999") > (b.start_date || "9999") ? 1 : 0)
      || a.name.localeCompare(b.name));
    list.forEach(n => sortKids(n.children));
  };
  sortKids(roots);

  const roll = (n) => {
    if (!n.children.length) {
      n._start = n.start_date; n._end = n.end_date;
      n._pct = parseFloat(n.pct_complete) || 0;
      n._weight = Math.max(days(n.start_date, n.end_date) ?? 1, 1);
      return n;
    }
    n.children.forEach(roll);
    const starts = n.children.map(c => c._start).filter(Boolean).sort();
    const ends   = n.children.map(c => c._end).filter(Boolean).sort();
    n._start = starts[0] || null;
    n._end   = ends[ends.length - 1] || null;
    const w = n.children.reduce((s, c) => s + c._weight, 0) || 1;
    n._pct = Math.round(n.children.reduce((s, c) => s + c._pct * c._weight, 0) / w);
    n._weight = w;
    n._rolled = true;
    return n;
  };
  roots.forEach(roll);
  return roots;
}

const flatten = (nodes, depth = 0, open = {}, out = []) => {
  nodes.forEach(n => {
    out.push({ ...n, _depth: depth });
    if (n.children.length && open[n.id] !== false) flatten(n.children, depth + 1, open, out);
  });
  return out;
};

/* ── Add / edit ─────────────────────────────────────────────────────────── */
function TaskModal({ T, session, supa, projectId, task, parentId, isPMO, nextOrder, onClose, onSaved, isMobile }) {
  const [f, setF] = useState(() => task ? { ...task } : {
    name:"", owner:"", start_date:"", end_date:"", pct_complete:0,
    status:"not_started", is_milestone:false, notes:"",
    baseline_start:"", baseline_end:"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm,
    padding:"8px 10px", fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily,
    outline:"none", width:"100%", boxSizing:"border-box" };
  const lbl = { ...TYPE.label, color:T.muted, marginBottom:5 };

  const save = async () => {
    setErr(null);
    if (!f.name.trim()) return setErr("Give the task a name.");
    if (f.start_date && f.end_date && f.end_date < f.start_date)
      return setErr("The end date can't be before the start date.");
    setSaving(true);
    try {
      const body = {
        project_id: projectId,
        parent_id: task ? task.parent_id : (parentId || null),
        name: f.name.trim(),
        owner: f.owner?.trim() || null,
        start_date: f.start_date || null,
        end_date: f.is_milestone ? (f.start_date || null) : (f.end_date || null),
        pct_complete: Number(f.pct_complete) || 0,
        status: f.status,
        is_milestone: !!f.is_milestone,
        notes: f.notes?.trim() || null,
      };
      // Baselines are PMO-only; the database rejects them from anyone else, so
      // the keys are omitted entirely rather than sent and refused.
      if (isPMO) {
        body.baseline_start = f.baseline_start || null;
        body.baseline_end   = f.baseline_end   || null;
      }
      if (!task?.id) body.sort_order = nextOrder ?? 0;
      if (task?.id) {
        await supa(`/rest/v1/project_tasks?id=eq.${task.id}`,
          { method:"PATCH", body:JSON.stringify(body), headers:{ Prefer:"return=minimal" } },
          session.access_token);
      } else {
        await supa("/rest/v1/project_tasks",
          { method:"POST", body:JSON.stringify(body), headers:{ Prefer:"return=minimal" } },
          session.access_token);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Could not save the task."); }
    setSaving(false);
  };

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(3,8,16,0.72)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex",
        alignItems: isMobile ? "flex-end" : "center", justifyContent:"center",
        padding: isMobile ? 0 : SP.xl, animation:"pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" aria-label="Task"
        style={{ width:540, maxWidth:"100%", maxHeight:"90vh", overflow:"auto",
          background:T.surface, border:`1px solid ${T.border}`,
          borderRadius: isMobile ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
          boxShadow:T.shadowLg, padding:SP.xxl }}>
        <div style={{ ...TYPE.display, fontSize:17, color:T.text, marginBottom:SP.lg,
          paddingBottom:SP.md, borderBottom:`1px solid ${T.border}` }}>
          {task ? "Edit task" : parentId ? "Add sub-task" : "Add task"}
        </div>

        <div style={{ marginBottom:SP.md }}>
          <div style={lbl}>Task name *</div>
          <input autoFocus value={f.name} onChange={e => set("name", e.target.value)} style={inp} />
        </div>

        <div style={{ display:"flex", gap:SP.sm, marginBottom:SP.md, flexWrap:"wrap" }}>
          <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, color:T.text, cursor:"pointer" }}>
            <input type="checkbox" checked={!!f.is_milestone}
              onChange={e => set("is_milestone", e.target.checked)} />
            This is a milestone or gate
          </label>
        </div>

        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:SP.sm, marginBottom:SP.md }}>
          <div>
            <div style={lbl}>{f.is_milestone ? "Date" : "Start date"}</div>
            <input type="date" value={f.start_date || ""} onChange={e => set("start_date", e.target.value)} style={inp} />
          </div>
          {!f.is_milestone && (
            <div>
              <div style={lbl}>End date</div>
              <input type="date" value={f.end_date || ""} onChange={e => set("end_date", e.target.value)} style={inp} />
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:SP.sm, marginBottom:SP.md }}>
          <div>
            <div style={lbl}>Owner</div>
            <input value={f.owner || ""} onChange={e => set("owner", e.target.value)}
              placeholder="Who is doing it" style={inp} />
          </div>
          <div>
            <div style={lbl}>Status</div>
            <Select T={T} value={f.status} onChange={e => set("status", e.target.value)} style={{ ...inp, cursor:"pointer" }}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <div>
            <div style={lbl}>Progress %</div>
            <input type="number" min="0" max="100" value={f.pct_complete}
              onChange={e => set("pct_complete", e.target.value)} style={inp} />
          </div>
        </div>

        {isPMO && (
          <div style={{ marginBottom:SP.md, padding:SP.md, borderRadius:R.md,
            background:T.card2, border:`1px solid ${T.border}` }}>
            <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>Baseline — PMO only</div>
            <div style={{ fontSize:11.5, color:T.dim, marginBottom:SP.sm, lineHeight:1.55 }}>
              The agreed plan. Project managers can move the dates above but not these,
              so slippage stays visible instead of being written over.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:SP.sm }}>
              <input type="date" value={f.baseline_start || ""} onChange={e => set("baseline_start", e.target.value)} style={inp} />
              <input type="date" value={f.baseline_end || ""} onChange={e => set("baseline_end", e.target.value)} style={inp} />
            </div>
          </div>
        )}

        <div style={{ marginBottom:SP.md }}>
          <div style={lbl}>Notes</div>
          <textarea value={f.notes || ""} onChange={e => set("notes", e.target.value)} rows={2}
            style={{ ...inp, resize:"vertical" }} />
        </div>

        {err && (
          <div style={{ marginBottom:SP.md, padding:"9px 12px", borderRadius:R.sm,
            background:`${DATA.danger}14`, border:`1px solid ${DATA.danger}3D`,
            fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", gap:SP.sm }}>
          <button className="pmo-focusable pmo-btn" onClick={onClose} disabled={saving}
            style={{ padding:"9px 16px", borderRadius:R.md, border:`1px solid ${T.border}`,
              background:"none", color:T.muted, fontSize:13, cursor:"pointer",
              fontFamily:TYPE.body.fontFamily }}>Cancel</button>
          <button className="pmo-focusable pmo-btn" onClick={save} disabled={saving}
            style={{ padding:"9px 20px", borderRadius:R.md, border:"none",
              background: saving ? T.muted : "#185078", color:"#fff", fontSize:13,
              fontWeight:700, cursor: saving ? "default" : "pointer",
              fontFamily:TYPE.body.fontFamily }}>
            {saving ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── The panel ──────────────────────────────────────────────────────────── */
export function ProjectTasks({ T, session, supa, projectId, canWrite, isPMO, isCompact }) {
  const [rows, setRows] = useState(null);
  const [err, setErr]   = useState(null);
  const [open, setOpen] = useState({});
  const [modal, setModal] = useState(null);        // { task } | { parentId } | {}
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await supa(
        `/rest/v1/project_tasks?project_id=eq.${projectId}&select=*&order=sort_order.asc,created_at.asc`,
        {}, session.access_token);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) { setErr(e.message); setRows([]); }
  }, [supa, session, projectId]);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => rows ? buildTree(rows) : [], [rows]);
  const list = useMemo(() => flatten(tree, 0, open), [tree, open]);

  // Axis across whatever the tasks actually span.
  const axis = useMemo(() => {
    const ds = [];
    (rows || []).forEach(r => { if (r.start_date) ds.push(d0(r.start_date)); if (r.end_date) ds.push(d0(r.end_date)); });
    if (!ds.length) return null;
    ds.sort((a, b) => a - b);
    const lo = new Date(ds[0]), hi = new Date(ds[ds.length - 1]);
    lo.setDate(lo.getDate() - 4); hi.setDate(hi.getDate() + 4);
    return { lo, hi, span: Math.max((hi - lo) / DAY, 1) };
  }, [rows]);

  const patch = async (id, body) => {
    setBusy(true);
    try {
      await supa(`/rest/v1/project_tasks?id=eq.${id}`,
        { method:"PATCH", body:JSON.stringify(body), headers:{ Prefer:"return=minimal" } },
        session.access_token);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const del = async (t) => {
    setBusy(true);
    try {
      await supa(`/rest/v1/project_tasks?id=eq.${t.id}`, { method:"DELETE" }, session.access_token);
      setConfirmDel(null); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Indent under the row above at the same depth; outdent to the grandparent.
  const indent = (row, i) => {
    for (let k = i - 1; k >= 0; k--) {
      if (list[k]._depth === row._depth) return patch(row.id, { parent_id: list[k].id });
      if (list[k]._depth < row._depth) break;
    }
  };
  const outdent = (row) => {
    const parent = rows.find(r => r.id === row.parent_id);
    if (parent) patch(row.id, { parent_id: parent.parent_id || null });
  };

  const BAR = isCompact ? 0 : 260;
  const th = { ...TYPE.label, color:T.muted, padding:"8px 10px", textAlign:"left",
    borderBottom:`1px solid ${T.borderStrong}`, whiteSpace:"nowrap" };
  const td = { padding:"7px 10px", fontSize:12.5, color:T.text,
    borderBottom:`1px solid ${T.border}`, verticalAlign:"middle" };

  if (rows === null) return <div style={{ color:T.muted, fontSize:13, padding:SP.lg }}>Loading tasks…</div>;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:SP.sm, marginBottom:SP.md, flexWrap:"wrap" }}>
        <div style={{ ...TYPE.label, color:T.text }}>Work Breakdown</div>
        <span style={{ ...TYPE.caption, color:T.dim }}>
          {rows.length} task{rows.length === 1 ? "" : "s"}
        </span>
        {canWrite && (
          <button className="pmo-focusable pmo-btn" onClick={() => setModal({})}
            style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6,
              padding:"7px 13px", background:"#185078", border:"none", borderRadius:R.sm,
              color:"#fff", fontWeight:700, ...TYPE.caption, cursor:"pointer" }}>
            <Plus size={13} /> Add task
          </button>
        )}
      </div>

      {err && <div style={{ fontSize:12, color:T.textOf(DATA.danger), marginBottom:SP.sm }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ padding:SP.xl, textAlign:"center", background:T.surfaceRaised,
          border:`1px dashed ${T.borderStrong}`, borderRadius:R.md }}>
          <div style={{ fontSize:13, color:T.muted, marginBottom:6 }}>No tasks yet.</div>
          <div style={{ fontSize:12, color:T.dim, lineHeight:1.6, maxWidth:460, margin:"0 auto" }}>
            Break the project into the work that has to happen. Add a task, then use the
            indent control to nest sub-tasks beneath it — parents take their dates and
            progress from whatever sits underneath.
          </div>
        </div>
      ) : (
        <div className="pmo-scroll" style={{ overflowX:"auto", border:`1px solid ${T.border}`,
          borderRadius:R.md, background:T.surface }}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth: isCompact ? 520 : 860 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth:230 }}>Task</th>
                <th style={th}>Owner</th>
                <th style={th}>Start</th>
                <th style={th}>End</th>
                <th style={{ ...th, textAlign:"right" }}>Days</th>
                <th style={th}>Progress</th>
                <th style={th}>Status</th>
                {BAR > 0 && <th style={{ ...th, width:BAR }}>Schedule</th>}
                {canWrite && <th style={{ ...th, width:96 }} />}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const kids = r.children.length > 0;
                const shut = open[r.id] === false;
                const st = STATUS[r.status] || STATUS.not_started;
                const slip = r.baseline_end && r._end ? days(r.baseline_end, r._end) : null;
                const x = axis && r._start ? ((d0(r._start) - axis.lo)/DAY)/axis.span*BAR : 0;
                const w = axis && r._start && r._end
                  ? Math.max(3, ((d0(r._end) - d0(r._start))/DAY)/axis.span*BAR) : 0;
                return (
                  <tr key={r.id} style={{ background: kids ? T.card2 : "transparent" }}>
                    <td style={{ ...td, paddingLeft: 10 + r._depth*18 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                        {kids ? (
                          <button className="pmo-focusable pmo-btn"
                            onClick={() => setOpen(o => ({ ...o, [r.id]: shut }))}
                            style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, padding:0, lineHeight:0 }}>
                            {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                        ) : <span style={{ width:13, flexShrink:0 }} />}
                        {r.is_milestone && <Diamond size={11} color={BRAND.gold} style={{ flexShrink:0 }} />}
                        <span style={{ fontWeight: kids ? 700 : 400, overflow:"hidden",
                          textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color:T.muted }}>{r.owner || "—"}</td>
                    <td style={{ ...td, color: r._rolled ? T.dim : T.text }}>{fmtD(r._start)}</td>
                    <td style={{ ...td, color: r._rolled ? T.dim : T.text }}>
                      {fmtD(r._end)}
                      {slip > 0 && (
                        <span title={`${slip} days later than baseline`}
                          style={{ marginLeft:5, fontSize:10.5, color:T.textOf(DATA.danger), fontWeight:700 }}>
                          +{slip}d
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign:"right", color:T.muted }}>
                      {r.is_milestone ? "—" : (days(r._start, r._end) ?? "—")}
                    </td>
                    <td style={td}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:52, height:4, background:T.border, borderRadius:2, flexShrink:0 }}>
                          <div style={{ width:`${Math.min(r._pct,100)}%`, height:"100%", borderRadius:2,
                            background: r._pct >= 100 ? DATA.positive : BRAND.blueBright }} />
                        </div>
                        <span style={{ fontSize:11, color:T.muted }}>{Math.round(r._pct)}%</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:R.pill,
                        background:`${st.color}1E`, color:st.color, whiteSpace:"nowrap" }}>{st.label}</span>
                    </td>
                    {BAR > 0 && (
                      <td style={{ ...td, padding:"7px 10px" }}>
                        <div style={{ position:"relative", height:14, width:BAR-20,
                          background:T.card2, borderRadius:3 }}>
                          {w > 0 && (
                            r.is_milestone ? (
                              <div style={{ position:"absolute", left:x-4, top:3, width:8, height:8,
                                background:BRAND.gold, transform:"rotate(45deg)" }} />
                            ) : (
                              <div style={{ position:"absolute", left:x, top:2, width:w, height:10,
                                borderRadius:3, background:`${st.color}44`, border:`1px solid ${st.color}99`,
                                overflow:"hidden" }}>
                                <div style={{ width:`${Math.min(r._pct,100)}%`, height:"100%", background:`${st.color}CC` }} />
                              </div>
                            )
                          )}
                        </div>
                      </td>
                    )}
                    {canWrite && (
                      <td style={{ ...td, whiteSpace:"nowrap" }}>
                        <div style={{ display:"flex", gap:2 }}>
                          <button className="pmo-focusable pmo-btn" title="Indent under the task above"
                            disabled={busy} onClick={() => indent(r, i)}
                            style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:3 }}>
                            <IndentIncrease size={12} />
                          </button>
                          <button className="pmo-focusable pmo-btn" title="Move out one level"
                            disabled={busy || !r.parent_id} onClick={() => outdent(r)}
                            style={{ background:"none", border:"none",
                              cursor: r.parent_id ? "pointer" : "default",
                              color: r.parent_id ? T.dim : T.border, padding:3 }}>
                            <IndentDecrease size={12} />
                          </button>
                          <button className="pmo-focusable pmo-btn" title="Add a sub-task"
                            disabled={busy} onClick={() => setModal({ parentId:r.id })}
                            style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:3 }}>
                            <Plus size={12} />
                          </button>
                          <button className="pmo-focusable pmo-btn" title="Edit"
                            disabled={busy} onClick={() => setModal({ task:r })}
                            style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:3 }}>
                            <Pencil size={12} />
                          </button>
                          <button className="pmo-focusable pmo-btn" title="Delete"
                            disabled={busy} onClick={() => setConfirmDel(r)}
                            style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, padding:3 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TaskModal T={T} session={session} supa={supa} projectId={projectId}
          task={modal.task} parentId={modal.parentId} isPMO={isPMO} isMobile={isCompact}
          nextOrder={(rows || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}

      {confirmDel && (
        <div style={{ position:"fixed", inset:0, zIndex:1300, background:"rgba(3,8,16,0.72)",
          backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:SP.lg }}>
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.xl,
            padding:SP.xl, width:400, maxWidth:"100%", boxShadow:T.shadowLg }}>
            <div style={{ display:"flex", gap:10, marginBottom:SP.md }}>
              <AlertTriangle size={18} color={T.textOf(DATA.danger)} style={{ flexShrink:0, marginTop:2 }} />
              <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>
                Delete "<strong>{confirmDel.name}</strong>"?
                {confirmDel.children?.length > 0 && (
                  <div style={{ color:T.textOf(DATA.danger), marginTop:6 }}>
                    Its {confirmDel.children.length} sub-task{confirmDel.children.length === 1 ? "" : "s"} will
                    go with it.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display:"flex", gap:SP.sm, justifyContent:"flex-end" }}>
              <button className="pmo-focusable pmo-btn" onClick={() => setConfirmDel(null)}
                style={{ padding:"8px 16px", borderRadius:R.md, border:`1px solid ${T.border}`,
                  background:"none", color:T.muted, fontSize:13, cursor:"pointer" }}>Cancel</button>
              <button className="pmo-focusable pmo-btn" onClick={() => del(confirmDel)} disabled={busy}
                style={{ padding:"8px 18px", borderRadius:R.md, border:"none", background:"#DC2626",
                  color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
