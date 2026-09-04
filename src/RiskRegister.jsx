import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, ShieldAlert, Shield, Plus, Pencil, Trash2, X, ChevronDown } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { Select, CountUp, useViewport } from "./ui.jsx";
import { useNear } from "./presence.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   RISK REGISTER

   Standard PM risk management: every risk scored on a 3x3 probability x
   impact matrix (the industry-standard convention), computed once centrally
   in project_risks_scored rather than duplicated as frontend logic the two
   could drift out of sync on.

   Two entry points share the same components: RiskRegisterPage (portfolio-
   wide, its own sidebar destination) and ProjectRisksPanel (a tab inside
   ProjectDetailPage, project pre-selected and locked). Visibility mirrors
   the rest of the portal exactly — Guest and PMO see everything, a PM sees
   only their own assigned projects' risks — enforced by RLS on the
   underlying table, not by anything client-side.
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORY_META = {
  financial:  { label: "Financial" },
  schedule:   { label: "Schedule" },
  technical:  { label: "Technical" },
  vendor:     { label: "Vendor / Contractor" },
  regulatory: { label: "Regulatory" },
  resource:   { label: "Resource" },
  safety:     { label: "Safety" },
};
const LEVEL_LABEL = { low: "Low", medium: "Medium", high: "High" };
const STATUS_META = {
  open:       { label: "Open" },
  monitoring: { label: "Monitoring" },
  mitigated:  { label: "Mitigated" },
  closed:     { label: "Closed" },
  realized:   { label: "Realized" },
};
const SEVERITY_META = {
  critical: { label: "Critical", color: "#E5484D" },
  high:     { label: "High",     color: "#E8A63C" },
  medium:   { label: "Medium",   color: "#D8B04A" },
  low:      { label: "Low",      color: "#22C4A8" },
};
// Same 3x3 scoring as the DB view (project_risks_scored) — kept here only
// for cells the matrix needs to render even when empty, never used to
// override what the server actually computed for a given risk.
function severityOf(prob, impact) {
  if (prob === "high" && impact === "high") return "critical";
  if ((prob === "high" && impact === "medium") || (prob === "medium" && impact === "high")) return "high";
  if (prob === "low" && impact === "low") return "low";
  return "medium";
}

function relDate(iso) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ── One matrix cell — its own component because useNear() is a hook and
   can't be called from inside the parent's .map(). Critical cells with real
   risks in them pulse, the same "only things that mean urgent breathe"
   language already used for live/pending indicators elsewhere in the
   portal — motion here is signal, not decoration. ── */
function MatrixCell({ T, prob, impact, sev, count, isActive, onClick }) {
  const near = useNear();
  const meta = SEVERITY_META[sev];
  const [hover, setHover] = useState(false);
  const pulse = sev === "critical" && count > 0;
  return (
    <button ref={near} className="pmo-near pmo-focusable"
      onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        "--near-light": `${meta.color}2A`,
        position: "relative", aspectRatio: "1.3/1", borderRadius: R.md, overflow: "hidden",
        border: `1.5px solid ${isActive ? "#fff" : count ? `${meta.color}55` : "transparent"}`,
        background: count
          ? `linear-gradient(135deg, ${meta.color}42, ${meta.color}14)`
          : `${meta.color}0D`,
        cursor: count ? "pointer" : "default", padding: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        transform: hover && count ? "translateY(-2px) scale(1.03)" : "translateY(0) scale(1)",
        boxShadow: hover && count ? `0 8px 22px -6px ${meta.color}66` : "none",
        transition: `transform ${MOTION.base}, box-shadow ${MOTION.base}, border-color ${MOTION.base}`,
      }}>
      {pulse && (
        <span className="pmo-live-dot" style={{
          position: "absolute", inset: 0, borderRadius: "inherit",
          boxShadow: `inset 0 0 0 1.5px ${meta.color}`, pointerEvents: "none",
        }} />
      )}
      {count > 0 && (
        <span style={{ fontSize: 22, fontWeight: 800, color: meta.color, lineHeight: 1,
          textShadow: `0 0 18px ${meta.color}88`, position: "relative" }}>
          <CountUp value={count} />
        </span>
      )}
      <span style={{ ...TYPE.caption, fontSize: 9.5, color: count ? T.textSoft : T.dim, marginTop: 2,
        textTransform: "uppercase", letterSpacing: 0.5, position: "relative" }}>{meta.label}</span>
    </button>
  );
}

/* ── Risk matrix — the standard 3x3 probability x impact heat grid ── */
function RiskMatrix({ T, risks, onCellClick, activeCell }) {
  const IMPACTS = ["high", "medium", "low"];      // top to bottom
  const PROBS   = ["low", "medium", "high"];       // left to right
  const cellRisks = (prob, impact) => risks.filter(r => r.probability === prob && r.impact === impact && r.status !== "closed");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(3, 1fr)", gap: 6 }}>
        <div />
        {PROBS.map(p => (
          <div key={p} style={{ ...TYPE.caption, color: T.dim, textAlign: "center", fontWeight: 600 }}>{LEVEL_LABEL[p]}</div>
        ))}
        {IMPACTS.map(impact => (
          <>
            <div key={impact} style={{ ...TYPE.caption, color: T.dim, fontWeight: 600, display: "flex",
              alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>{LEVEL_LABEL[impact]}</div>
            {PROBS.map(prob => {
              const sev = severityOf(prob, impact);
              const rs = cellRisks(prob, impact);
              const isActive = activeCell && activeCell.prob === prob && activeCell.impact === impact;
              return (
                <MatrixCell key={`${prob}-${impact}`} T={T} prob={prob} impact={impact} sev={sev}
                  count={rs.length} isActive={isActive}
                  onClick={() => onCellClick(rs.length ? { prob, impact } : null)} />
              );
            })}
          </>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "0 2px" }}>
        <span style={{ ...TYPE.caption, color: T.dim }}>← Probability →</span>
        <span style={{ ...TYPE.caption, color: T.dim, writingMode: "vertical-rl" }} />
      </div>
      <div style={{ textAlign: "center", ...TYPE.caption, color: T.dim, marginTop: -2 }}>Impact ↑ (bottom to top)</div>
    </div>
  );
}

/* ── Table row ── */
function RiskRow({ T, risk, onEdit, onDelete, showProject, index = 0 }) {
  const meta = SEVERITY_META[risk.severity];
  const [hover, setHover] = useState(false);
  return (
    <tr className="pmo-card-in" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ borderBottom: `1px solid ${T.border}`, background: hover ? `${meta.color}0A` : "transparent",
        transition: `background ${MOTION.base}`, animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: R.pill,
          background: `${meta.color}1E`, color: meta.color, ...TYPE.caption, fontWeight: 700,
          boxShadow: risk.severity === "critical" ? `0 0 10px ${meta.color}55` : "none" }}>
          <span className={risk.severity === "critical" ? "pmo-live-dot" : ""}
            style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />{meta.label}
        </span>
      </td>
      <td style={{ padding: "10px 12px", ...TYPE.bodySm, color: T.text, fontWeight: 600, maxWidth: 260 }}>
        {risk.title}
        {showProject && <div style={{ ...TYPE.caption, color: T.dim, fontWeight: 400, marginTop: 2 }}>{risk.project_name}</div>}
      </td>
      <td style={{ padding: "10px 12px", ...TYPE.caption, color: T.textSoft }}>{CATEGORY_META[risk.category]?.label}</td>
      <td style={{ padding: "10px 12px", ...TYPE.caption, color: T.textSoft }}>{LEVEL_LABEL[risk.probability]} / {LEVEL_LABEL[risk.impact]}</td>
      <td style={{ padding: "10px 12px", ...TYPE.caption, color: T.textSoft, textTransform: "capitalize" }}>{STATUS_META[risk.status]?.label}</td>
      <td style={{ padding: "10px 12px", ...TYPE.caption, color: T.dim }}>{risk.owner || "—"}</td>
      <td style={{ padding: "10px 12px", ...TYPE.caption, color: T.dim, whiteSpace: "nowrap" }}>{relDate(risk.date_identified)}</td>
      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
        {onEdit && <button className="pmo-focusable" onClick={() => onEdit(risk)} title="Edit"
          style={{ background: "none", border: "none", color: hover ? T.textSoft : T.dim, cursor: "pointer", padding: 4,
            transition: `color ${MOTION.fast}` }}><Pencil size={13} /></button>}
        {onDelete && <button className="pmo-focusable" onClick={() => onDelete(risk)} title="Delete"
          style={{ background: "none", border: "none", color: hover ? T.dim : T.dim, cursor: "pointer", padding: 4}}><Trash2 size={13} /></button>}
      </td>
    </tr>
  );
}

/* ── Live severity preview inside the form — updates the instant probability
   or impact changes, so choosing values feels like watching the risk score
   compute itself rather than filling out a form and finding out later. ── */
function SeverityPreview({ T, probability, impact }) {
  const sev = severityOf(probability, impact);
  const meta = SEVERITY_META[sev];
  return (
    <div key={sev} className="pmo-fade-in" style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
      padding: "10px 14px", borderRadius: R.md,
      background: `linear-gradient(90deg, ${meta.color}22, ${meta.color}08)`,
      border: `1px solid ${meta.color}44`, transition: `all ${MOTION.base}`,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: meta.color, flexShrink: 0,
        boxShadow: `0 0 12px ${meta.color}` }} />
      <span style={{ ...TYPE.bodySm, color: T.text }}>
        This risk will show as <strong style={{ color: meta.color }}>{meta.label}</strong> severity
      </span>
    </div>
  );
}

/* ── Add / edit modal ── */
function RiskFormModal({ T, session, supa, risk, projectId, projects, onClose, onSaved }) {
  const [form, setForm] = useState(() => risk ? { ...risk } : {
    project_id: projectId || "", title: "", description: "", category: "technical",
    probability: "medium", impact: "medium", status: "open", owner: "", mitigation_plan: "",
    date_identified: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.md, padding: "9px 12px",
    fontSize: 13.5, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 };

  const save = async () => {
    setErr(null);
    if (!form.project_id) return setErr("Choose a project.");
    if (!form.title.trim()) return setErr("Give the risk a title.");
    setSaving(true);
    try {
      const payload = { project_id: form.project_id, title: form.title, description: form.description || null,
        category: form.category, probability: form.probability, impact: form.impact, status: form.status,
        owner: form.owner || null, mitigation_plan: form.mitigation_plan || null,
        date_identified: form.date_identified || new Date().toISOString().slice(0, 10),
        date_last_reviewed: new Date().toISOString().slice(0, 10),
        created_by_name: session.username || session.full_name };
      if (risk?.id) {
        await supa(`/rest/v1/project_risks?id=eq.${risk.id}`, { method: "PATCH", body: JSON.stringify(payload) }, session.access_token);
      } else {
        await supa("/rest/v1/project_risks", { method: "POST", body: JSON.stringify(payload) }, session.access_token);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Could not save this risk."); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: SP.xxl,
        width: 520, maxHeight: "90vh", overflow: "auto", boxShadow: T.shadowLg }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: TYPE.display.fontFamily,
          marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>{risk?.id ? "Edit Risk" : "Add Risk"}</div>

        {!projectId && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Project *</label>
            <Select T={T} value={form.project_id} onChange={e => set("project_id", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Title *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Steel price volatility" style={inp} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Description</label>
          <textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={2}
            style={{ ...inp, resize: "vertical", fontFamily: TYPE.body.fontFamily }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Category</label>
            <Select T={T} value={form.category} onChange={e => set("category", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <div>
            <label style={lbl}>Status</label>
            <Select T={T} value={form.status} onChange={e => set("status", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Probability</label>
            <Select T={T} value={form.probability} onChange={e => set("probability", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <label style={lbl}>Impact</label>
            <Select T={T} value={form.impact} onChange={e => set("impact", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </div>
        <SeverityPreview T={T} probability={form.probability} impact={form.impact} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Owner</label>
            <input value={form.owner || ""} onChange={e => set("owner", e.target.value)} placeholder="Who's watching this risk" style={inp} />
          </div>
          <div>
            {/* The field was always saved, and carried through an edit intact,
                but no input was ever rendered — so it could only ever be the
                date the risk was first typed in. Risks are routinely logged
                after the fact, so it has to be settable. */}
            <label style={lbl}>Date Identified</label>
            <input type="date" value={form.date_identified || ""}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => set("date_identified", e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Mitigation Plan</label>
          <textarea value={form.mitigation_plan || ""} onChange={e => set("mitigation_plan", e.target.value)} rows={2}
            style={{ ...inp, resize: "vertical", fontFamily: TYPE.body.fontFamily }} />
        </div>

        {err && (
          <div style={{ marginBottom: 14, padding: "9px 13px", borderRadius: R.md, background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", ...TYPE.caption }}>{err}</div>
        )}

        <div style={{ display: "flex", gap: SP.sm }}>
          <button className="pmo-focusable pmo-btn" onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: 10, borderRadius: R.md, border: `1px solid ${T.border}`, background: "none",
              color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: TYPE.body.fontFamily }}>Cancel</button>
          <button className="pmo-focusable pmo-btn" onClick={save} disabled={saving}
            style={{ flex: 2, padding: 10, borderRadius: R.md, border: "none", background: saving ? T.muted : "#185078",
              color: "#fff", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: TYPE.body.fontFamily }}>
            {saving ? "Saving…" : risk?.id ? "Save Changes" : "Add Risk"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared data hook ── */
function useRisks(supa, session, projectId) {
  const [risks, setRisks] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      const filter = projectId ? `&project_id=eq.${projectId}` : "";
      const rows = await supa(`/rest/v1/project_risks_scored?select=*&order=date_identified.desc${filter}`, {}, session.access_token);
      setRisks(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr(e.message); }
  }, [supa, session, projectId]);
  useEffect(() => { load(); }, [load]);
  return [risks, load, err];
}

/* ── Portfolio-wide page ── */
export function RiskRegisterPage({ T, session, supa }) {
  const vp = useViewport();
  const [risks, reload, err] = useRisks(supa, session, null);
  const [projects, setProjects] = useState([]);
  const [modal, setModal] = useState(null);   // null | {} (new) | risk (edit)
  const [confirmDel, setConfirmDel] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [fCategory, setFCategory] = useState("");
  const [fStatus, setFStatus] = useState("");
  // PMO only — enforced at the database too (risks_write policy), not just
  // hidden here. Viewing stays open to every role; only add/edit/delete narrows.
  const canWrite = session?.role === "pmo";

  useEffect(() => {
    supa("/rest/v1/projects?portfolio=eq.capex&select=id,name&order=name.asc", {}, session.access_token)
      .then(r => setProjects(Array.isArray(r) ? r : [])).catch(() => {});
  }, [supa, session]);

  const filtered = useMemo(() => {
    if (!risks) return risks;
    return risks.filter(r =>
      (!activeCell || (r.probability === activeCell.prob && r.impact === activeCell.impact)) &&
      (!fCategory || r.category === fCategory) &&
      (!fStatus || r.status === fStatus));
  }, [risks, activeCell, fCategory, fStatus]);

  const openCount = risks?.filter(r => r.status !== "closed" && r.status !== "mitigated").length ?? 0;
  const criticalCount = risks?.filter(r => r.severity === "critical" && r.status !== "closed").length ?? 0;

  const del = async (r) => {
    await supa(`/rest/v1/project_risks?id=eq.${r.id}`, { method: "DELETE" }, session.access_token);
    setConfirmDel(null); reload();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }} className="pmo-scroll">
      <div style={{ padding: `${SP.lg}px ${SP.xl}px ${SP.md}px`, display: "flex", alignItems: "flex-end",
        justifyContent: "space-between", flexWrap: "wrap", gap: SP.md }}>
        <div>
          <div style={{ ...TYPE.h2, color: T.text }}>Risk Register</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {risks === null ? "Loading…" : (
              <>
                {openCount} open ·
                {criticalCount > 0 && (
                  <span className="pmo-live-dot" style={{ width: 6, height: 6, borderRadius: "50%",
                    background: SEVERITY_META.critical.color, display: "inline-block",
                    boxShadow: `0 0 8px ${SEVERITY_META.critical.color}` }} />
                )}
                <span style={{ color: criticalCount > 0 ? SEVERITY_META.critical.color : T.muted, fontWeight: criticalCount > 0 ? 700 : 400 }}>
                  {criticalCount} critical
                </span>
                · across the portfolio
              </>
            )}
          </div>
        </div>
        {canWrite && (
          <button className="pmo-focusable pmo-btn" onClick={() => setModal({})}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#185078",
              border: "none", borderRadius: R.md, color: "#fff", fontWeight: 700, ...TYPE.bodySm, cursor: "pointer" }}>
            <Plus size={14} /> Add Risk
          </button>
        )}
      </div>

      {err && <div style={{ padding: `0 ${SP.xl}px`, color: T.textOf(T.danger), ...TYPE.bodySm }}>{err}</div>}

      <div style={{ padding: `0 ${vp.isCompact ? SP.lg : SP.xl}px ${SP.lg}px`, display: "grid",
        gridTemplateColumns: vp.isCompact ? "1fr" : "340px 1fr", gap: vp.isCompact ? SP.lg : SP.xl }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: SP.lg, boxShadow: T.shadow }}>
          <div style={{ ...TYPE.label, color: T.muted, marginBottom: 12 }}>Risk Matrix</div>
          {risks === null ? <div style={{ ...TYPE.caption, color: T.dim }}>Loading…</div> : (
            <RiskMatrix T={T} risks={risks} activeCell={activeCell}
              onCellClick={(c) => setActiveCell(prev => prev && c && prev.prob === c.prob && prev.impact === c.impact ? null : c)} />
          )}
          {activeCell && (
            <button className="pmo-focusable" onClick={() => setActiveCell(null)}
              style={{ marginTop: 10, ...TYPE.caption, color: T.textOf(T.blueBright), background: "none", border: "none", cursor: "pointer" }}>
              Clear matrix filter
            </button>
          )}
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: T.shadow, overflow: "hidden" }}>
          <div style={{ padding: `${SP.sm}px ${SP.lg}px`, borderBottom: `1px solid ${T.border}`, display: "flex",
            alignItems: "center", gap: SP.sm, flexWrap: "wrap" }}>
            <Select T={T} size="sm" value={fCategory} onChange={e => setFCategory(e.target.value)} active={!!fCategory}>
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Select T={T} size="sm" value={fStatus} onChange={e => setFStatus(e.target.value)} active={!!fStatus}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <span style={{ ...TYPE.caption, color: T.dim, marginLeft: "auto" }}>
              {filtered ? `${filtered.length} of ${risks?.length ?? 0}` : ""}
            </span>
          </div>
          <div style={{ overflow: "auto", maxHeight: 520 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: vp.isCompact ? 760 : undefined }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.surface }}>
                  {["Severity", "Risk", "Category", "Prob / Impact", "Status", "Owner", "Identified", ""].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: h === "" ? "right" : "left", ...TYPE.caption,
                      color: T.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered === null ? (
                  <tr><td colSpan={8} style={{ padding: SP.xl, textAlign: "center", ...TYPE.caption, color: T.dim }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: SP.xl, textAlign: "center", ...TYPE.caption, color: T.dim }}>
                    {risks.length === 0 ? "No risks logged yet." : "Nothing matches these filters."}
                  </td></tr>
                ) : filtered.map((r, i) => (
                  <RiskRow key={r.id} T={T} risk={r} showProject index={i}
                    onEdit={canWrite ? () => setModal(r) : null}
                    onDelete={canWrite ? () => setConfirmDel(r) : null} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal !== null && (
        <RiskFormModal T={T} session={session} supa={supa} risk={modal.id ? modal : null}
          projects={projects}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteRisk T={T} risk={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />
      )}
    </div>
  );
}

/* ── Per-project tab ── */
export function ProjectRisksPanel({ T, session, supa, projectId, canWrite }) {
  const vp = useViewport();
  const [risks, reload, err] = useRisks(supa, session, projectId);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const del = async (r) => {
    await supa(`/rest/v1/project_risks?id=eq.${r.id}`, { method: "DELETE" }, session.access_token);
    setConfirmDel(null); reload();
  };

  return (
    <div style={{ padding: SP.lg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
        <div style={{ ...TYPE.label, color: T.muted }}>{risks?.length ?? 0} risk{risks?.length === 1 ? "" : "s"} logged</div>
        {canWrite && (
          <button className="pmo-focusable pmo-btn" onClick={() => setModal({})}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "#185078",
              border: "none", borderRadius: R.sm, color: "#fff", fontWeight: 700, ...TYPE.caption, cursor: "pointer" }}>
            <Plus size={13} /> Add Risk
          </button>
        )}
      </div>

      {err && <div style={{ ...TYPE.bodySm, color: T.textOf(T.danger), marginBottom: SP.md }}>{err}</div>}

      {risks === null ? (
        <div style={{ ...TYPE.caption, color: T.dim }}>Loading…</div>
      ) : risks.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: SP.xl,
          color: T.muted, background: T.surfaceRaised, borderRadius: R.md, border: `1px solid ${T.border}` }}>
          <Shield size={22} color={T.dim} />
          <div style={{ ...TYPE.bodySm }}>No risks logged for this project yet.</div>
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflowX: "auto", overflowY: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: vp.isCompact ? 760 : undefined }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Severity", "Risk", "Category", "Prob / Impact", "Status", "Owner", "Identified", ""].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "" ? "right" : "left", ...TYPE.caption,
                    color: T.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map((r, i) => (
                <RiskRow key={r.id} T={T} risk={r} index={i}
                  onEdit={canWrite ? () => setModal(r) : null}
                  onDelete={canWrite ? () => setConfirmDel(r) : null} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <RiskFormModal T={T} session={session} supa={supa} risk={modal.id ? modal : null}
          projectId={projectId} projects={[]} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteRisk T={T} risk={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />
      )}
    </div>
  );
}

function ConfirmDeleteRisk({ T, risk, onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: SP.xl,
        width: 380, boxShadow: T.shadowLg }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <AlertTriangle size={18} color={T.textOf(T.danger)} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ ...TYPE.bodySm, color: T.text }}>Delete "<strong>{risk.title}</strong>"? This can't be undone.</div>
        </div>
        <div style={{ display: "flex", gap: SP.sm }}>
          <button className="pmo-focusable pmo-btn" onClick={onCancel}
            style={{ flex: 1, padding: 9, borderRadius: R.md, border: `1px solid ${T.border}`, background: "none",
              color: T.muted, cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button className="pmo-focusable pmo-btn" onClick={onConfirm}
            style={{ flex: 1, padding: 9, borderRadius: R.md, border: "none", background: "#DC2626",
              color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
