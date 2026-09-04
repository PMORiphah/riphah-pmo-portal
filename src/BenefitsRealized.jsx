import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Plus, Pencil, Trash2, X } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { Select } from "./ui.jsx";
import { useNear } from "./presence.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   BENEFITS REALIZED

   The counterpart to Lessons Learned. A lesson records what the project
   taught; a benefit records what it actually delivered — the case for having
   spent the money. Kept in its own table rather than as a flavour of lesson,
   because the fields genuinely differ: a benefit has a value, a date it was
   realized, and evidence, none of which a lesson has.

   Access matches lessons_learned exactly: PMO writes, PMO and Guest read,
   project managers see neither. Enforced in RLS, not just here.
   ═══════════════════════════════════════════════════════════════════════════ */

const BENEFIT_CATEGORY_META = {
  cost_saving: { label: "Cost Saving",  color: "#22C4A8" },
  time_saving: { label: "Time Saving",  color: "#5BC0EF" },
  capacity:    { label: "Capacity",     color: "#5B8DEF" },
  quality:     { label: "Quality",      color: "#C97BDE" },
  compliance:  { label: "Compliance",   color: "#D8B04A" },
  stakeholder: { label: "Stakeholder",  color: "#EF7B9E" },
  other:       { label: "Other",        color: "#8FA3BF" },
};
const BENEFIT_STATUS_META = {
  realized: { label: "Realized",          color: "#22C55E" },
  partial:  { label: "Partially realized", color: "#E8A63C" },
  expected: { label: "Expected",          color: "#8FA3BF" },
};

function relDate(iso) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
const fmtPKR  = (n) => (n == null || n === "") ? null
  : parseFloat(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });

/* ── One benefit card ── */
function BenefitCard({ T, benefit, index, showProject, onOpen }) {
  const near = useNear();
  const meta = BENEFIT_CATEGORY_META[benefit.category] || BENEFIT_CATEGORY_META.other;
  const st   = BENEFIT_STATUS_META[benefit.status] || BENEFIT_STATUS_META.realized;
  const [hover, setHover] = useState(false);
  const preview = (benefit.description || benefit.measure || "");
  return (
    <div ref={near} className="pmo-near pmo-card-in" onClick={() => onOpen(benefit)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        "--near-light": `${meta.color}16`,
        padding: "14px 16px", borderRadius: R.lg, cursor: "pointer",
        border: `1px solid ${hover ? `${meta.color}55` : T.border}`,
        background: T.surface, marginBottom: 10,
        animationDelay: `${Math.min(index, 12) * 45}ms`,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover ? `0 8px 20px -8px ${meta.color}44` : T.shadow,
        transition: `transform ${MOTION.base}, box-shadow ${MOTION.base}, border-color ${MOTION.base}`,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: R.pill,
          background: `${meta.color}1E`, color: meta.color, ...TYPE.caption, fontWeight: 700 }}>
          {meta.label}
        </span>
        <span style={{ ...TYPE.caption, color: st.color }}>{st.label}</span>
        {showProject && (
          <>
            <span style={{ ...TYPE.caption, color: T.dim }}>·</span>
            <span style={{ ...TYPE.caption, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {benefit.project_name}
            </span>
          </>
        )}
        <span style={{ ...TYPE.caption, color: T.dim, marginLeft: "auto" }}>{relDate(benefit.created_at)}</span>
      </div>
      <div style={{ ...TYPE.bodySm, color: T.text, fontWeight: 600, marginBottom: 4 }}>{benefit.title}</div>
      {preview && (
        <div style={{ ...TYPE.caption, color: T.textSoft, lineHeight: 1.5 }}>
          {preview.length > 160 ? preview.slice(0, 157) + "…" : preview}
        </div>
      )}
      {(fmtPKR(benefit.value_pkr) || benefit.realized_on) && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {fmtPKR(benefit.value_pkr) && (
            <span style={{ ...TYPE.caption, color: T.textOf ? T.textOf("#22C55E") : "#22C55E", fontWeight: 700 }}>
              PKR {fmtPKR(benefit.value_pkr)}
            </span>
          )}
          {benefit.realized_on && (
            <span style={{ ...TYPE.caption, color: T.dim }}>Realized {fmtDate(benefit.realized_on)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Full detail view ── */
function BenefitDetailModal({ T, benefit, canWrite, onClose, onEdit, onDelete }) {
  const meta = BENEFIT_CATEGORY_META[benefit.category] || BENEFIT_CATEGORY_META.other;
  const st   = BENEFIT_STATUS_META[benefit.status] || BENEFIT_STATUS_META.realized;
  const FIELDS = [
    ["What the benefit is", benefit.description],
    ["How it was measured", benefit.measure],
    ["Value (PKR)",         fmtPKR(benefit.value_pkr)],
    ["Realized on",         fmtDate(benefit.realized_on)],
  ].filter(([, v]) => v);

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)", zIndex: 310, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16 }}>
      <div className="pmo-scale pmo-scroll" style={{ background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: R.xl, padding: SP.xxl, width: 560, maxWidth: "100%", maxHeight: "90vh",
        overflow: "auto", boxShadow: T.shadowLg }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18,
          paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <span style={{ padding: "2px 9px", borderRadius: R.pill, background: `${meta.color}1E`,
                color: meta.color, ...TYPE.caption, fontWeight: 700 }}>{meta.label}</span>
              <span style={{ ...TYPE.caption, color: st.color }}>{st.label}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text,
              fontFamily: TYPE.display.fontFamily, lineHeight: 1.3 }}>{benefit.title}</div>
          </div>
          <button className="pmo-focusable pmo-btn" onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        {FIELDS.length === 0 ? (
          <div style={{ ...TYPE.caption, color: T.dim, marginBottom: 16 }}>No further detail was recorded.</div>
        ) : FIELDS.map(([label, value]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1,
              textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ ...TYPE.bodySm, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{value}</div>
          </div>
        ))}

        <div style={{ ...TYPE.caption, color: T.dim, marginTop: 16, paddingTop: 12,
          borderTop: `1px solid ${T.border}` }}>
          Logged by {benefit.logged_by_name || "—"} · {relDate(benefit.created_at)}
        </div>

        {canWrite && (
          <div style={{ display: "flex", gap: SP.sm, marginTop: 18 }}>
            <button className="pmo-focusable pmo-btn" onClick={() => onEdit(benefit)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: 9, borderRadius: R.md, border: `1px solid ${T.border}`, background: "none",
                color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: TYPE.body.fontFamily }}>
              <Pencil size={13} /> Edit
            </button>
            <button className="pmo-focusable pmo-btn" onClick={() => onDelete(benefit)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: 9, borderRadius: R.md, border: "1px solid rgba(220,38,38,0.35)", background: "none",
                color: "#DC2626", cursor: "pointer", fontSize: 13, fontFamily: TYPE.body.fontFamily }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add / edit ── */
function BenefitFormModal({ T, session, supa, benefit, projectId, onClose, onSaved }) {
  const [form, setForm] = useState(() => benefit ? { ...benefit } : {
    project_id: projectId || "", title: "", category: "cost_saving", status: "realized",
    description: "", measure: "", value_pkr: "", realized_on: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.md, padding: "9px 12px",
    fontSize: 13.5, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 };
  const ta  = { ...inp, resize: "vertical", fontFamily: TYPE.body.fontFamily, minHeight: 60 };

  const save = async () => {
    setErr(null);
    if (!form.project_id) return setErr("No project on this benefit.");
    if (!form.title.trim()) return setErr("Give the benefit a title.");
    if (form.value_pkr !== "" && form.value_pkr != null && isNaN(parseFloat(form.value_pkr))) {
      return setErr("Value must be a number, or left blank.");
    }
    setSaving(true);
    try {
      const payload = {
        project_id: form.project_id, title: form.title,
        category: form.category, status: form.status,
        description: form.description || null,
        measure: form.measure || null,
        value_pkr: (form.value_pkr === "" || form.value_pkr == null) ? null : parseFloat(form.value_pkr),
        realized_on: form.realized_on || null,
        logged_by_name: session.username || session.full_name,
      };
      if (benefit?.id) {
        await supa(`/rest/v1/benefits_realized?id=eq.${benefit.id}`, { method: "PATCH", body: JSON.stringify(payload) }, session.access_token);
      } else {
        await supa("/rest/v1/benefits_realized", { method: "POST", body: JSON.stringify(payload) }, session.access_token);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Could not save this benefit."); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pmo-scale pmo-scroll" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
        padding: SP.xxl, width: 560, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: T.shadowLg }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: TYPE.display.fontFamily,
          marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
          {benefit?.id ? "Edit Benefit" : "Add Benefit Realized"}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Title *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="e.g. Lab throughput up 40% after refit" style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Category</label>
            <Select T={T} value={form.category} onChange={e => set("category", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(BENEFIT_CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <div>
            <label style={lbl}>Status</label>
            <Select T={T} value={form.status} onChange={e => set("status", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(BENEFIT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>What the benefit is</label>
          <textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={2} style={ta} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>How it was measured</label>
          <textarea value={form.measure || ""} onChange={e => set("measure", e.target.value)} rows={2} style={ta}
            placeholder="Evidence, baseline, or the figure it was compared against" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Value (PKR)</label>
            <input value={form.value_pkr ?? ""} onChange={e => set("value_pkr", e.target.value)}
              inputMode="decimal" placeholder="Optional" style={inp} />
          </div>
          <div>
            <label style={lbl}>Realized on</label>
            <input type="date" value={form.realized_on || ""} onChange={e => set("realized_on", e.target.value)} style={inp} />
          </div>
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
            {saving ? "Saving…" : benefit?.id ? "Save Changes" : "Add Benefit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteBenefit({ T, benefit, onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: SP.xl,
        width: 380, maxWidth: "100%", boxShadow: T.shadowLg }}>
        <div style={{ ...TYPE.bodySm, color: T.text, marginBottom: 14 }}>
          Delete "<strong>{benefit.title}</strong>"? This can't be undone.
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

function useBenefits(supa, session, projectId) {
  const [benefits, setBenefits] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      const filter = projectId ? `&project_id=eq.${projectId}` : "";
      const rows = await supa(`/rest/v1/benefits_realized_full?select=*&order=created_at.desc${filter}`, {}, session.access_token);
      setBenefits(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr(e.message); }
  }, [supa, session, projectId]);
  useEffect(() => { load(); }, [load]);
  return [benefits, load, err];
}

/* ── Per-project panel ── */
export function ProjectBenefitsPanel({ T, session, supa, projectId, canWrite }) {
  const [benefits, reload, err] = useBenefits(supa, session, projectId);
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const del = async (b) => {
    await supa(`/rest/v1/benefits_realized?id=eq.${b.id}`, { method: "DELETE" }, session.access_token);
    setConfirmDel(null); setDetail(null); reload();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: SP.sm, marginBottom: SP.md, flexWrap: "wrap" }}>
        <div style={{ ...TYPE.label, color: T.muted }}>
          {benefits?.length ?? 0} benefit{benefits?.length === 1 ? "" : "s"} recorded
        </div>
        {canWrite && (
          <button className="pmo-focusable pmo-btn" onClick={() => setModal({})}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "#185078",
              border: "none", borderRadius: R.sm, color: "#fff", fontWeight: 700, ...TYPE.caption, cursor: "pointer" }}>
            <Plus size={13} /> Add Benefit
          </button>
        )}
      </div>

      {err && <div style={{ ...TYPE.bodySm, color: T.textOf(T.danger), marginBottom: SP.md }}>{err}</div>}

      {benefits === null ? (
        <div style={{ ...TYPE.caption, color: T.dim }}>Loading…</div>
      ) : benefits.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: SP.xl,
          color: T.muted, background: T.surfaceRaised, borderRadius: R.md, border: `1px solid ${T.border}`,
          textAlign: "center" }}>
          <TrendingUp size={22} color={T.dim} />
          <div style={{ ...TYPE.bodySm }}>No benefits recorded for this project yet.</div>
        </div>
      ) : benefits.map((b, i) => (
        <BenefitCard key={b.id} T={T} benefit={b} index={i} showProject={false} onOpen={setDetail} />
      ))}

      {detail && (
        <BenefitDetailModal T={T} benefit={detail} canWrite={canWrite}
          onClose={() => setDetail(null)}
          onEdit={(b) => { setDetail(null); setModal(b); }}
          onDelete={(b) => setConfirmDel(b)} />
      )}
      {modal !== null && (
        <BenefitFormModal T={T} session={session} supa={supa} benefit={modal.id ? modal : null}
          projectId={projectId} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteBenefit T={T} benefit={confirmDel}
          onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />
      )}
    </div>
  );
}
