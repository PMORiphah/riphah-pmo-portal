import { useState, useEffect, useCallback } from "react";
import { Lightbulb, Plus, Pencil, Trash2, X } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { Select } from "./ui.jsx";
import { useNear } from "./presence.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   LESSONS LEARNED

   Fundamentally a knowledge base, not a live status board — its whole value
   is being searchable across the portfolio so a future PM planning a
   similar project can find "has anyone dealt with this before?" Built
   portfolio-wide first, with a lighter per-project panel, matching the
   original plan.

   Same access pattern as Risk Register's original design and everything
   else in the portal: PMO and Guest see the whole portfolio, a PM sees
   their own assigned projects. Add/edit is PMO plus a PM on their own
   projects — the answer agreed for both features together at the outset,
   unaffected by Risk Register's later, separate narrowing to PMO-only.
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORY_META = {
  process:       { label: "Process",            color: "#5B8DEF" },
  technical:     { label: "Technical",           color: "#22C4A8" },
  vendor:        { label: "Vendor / Contractor", color: "#D8B04A" },
  budget:        { label: "Budget",              color: "#E8A63C" },
  schedule:      { label: "Schedule",            color: "#C97BDE" },
  communication: { label: "Communication",       color: "#5BC0EF" },
  stakeholder:   { label: "Stakeholder",         color: "#EF7B9E" },
};
const PHASE_META = {
  planning:  { label: "Planning" },
  execution: { label: "Execution" },
  closeout:  { label: "Closeout" },
};

function relDate(iso) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// A short, honest preview of whichever field actually has content — a
// lesson might only have a recommendation, or only a "what went wrong",
// so this picks the first non-empty one rather than assuming one exists.
function previewOf(l) {
  const text = l.recommendation || l.what_went_wrong || l.what_went_well || l.what_happened || "";
  return text.length > 160 ? text.slice(0, 157) + "…" : text;
}

/* ── One lesson card ── */
function LessonCard({ T, lesson, index, showProject, onOpen }) {
  const near = useNear();
  const meta = CATEGORY_META[lesson.category];
  const [hover, setHover] = useState(false);
  return (
    <div ref={near} className="pmo-near pmo-card-in" onClick={() => onOpen(lesson)}
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
        <span style={{ ...TYPE.caption, color: T.dim }}>{PHASE_META[lesson.phase]?.label}</span>
        {showProject && (
          <>
            <span style={{ ...TYPE.caption, color: T.dim }}>·</span>
            <span style={{ ...TYPE.caption, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lesson.project_name}
            </span>
          </>
        )}
        <span style={{ ...TYPE.caption, color: T.dim, marginLeft: "auto" }}>{relDate(lesson.created_at)}</span>
      </div>
      <div style={{ ...TYPE.bodySm, color: T.text, fontWeight: 600, marginBottom: 4 }}>{lesson.title}</div>
      {previewOf(lesson) && (
        <div style={{ ...TYPE.caption, color: T.textSoft, lineHeight: 1.5 }}>{previewOf(lesson)}</div>
      )}
    </div>
  );
}

/* ── Full detail view, with edit/delete when authorized ── */
function LessonDetailModal({ T, lesson, canWrite, onClose, onEdit, onDelete }) {
  const meta = CATEGORY_META[lesson.category];
  const FIELDS = [
    ["What happened", lesson.what_happened],
    ["What went well", lesson.what_went_well],
    ["What went wrong", lesson.what_went_wrong],
    ["Recommendation for future projects", lesson.recommendation],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pmo-scale pmo-scroll" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
        padding: SP.xxl, width: 560, maxHeight: "86vh", overflow: "auto", boxShadow: T.shadowLg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: R.pill,
              background: `${meta.color}1E`, color: meta.color, ...TYPE.caption, fontWeight: 700 }}>{meta.label}</span>
            <span style={{ ...TYPE.caption, color: T.dim }}>{PHASE_META[lesson.phase]?.label}</span>
          </div>
          <button className="pmo-focusable" onClick={onClose}
            style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ ...TYPE.h2, color: T.text, marginBottom: 4 }}>{lesson.title}</div>
        <div style={{ ...TYPE.caption, color: T.dim, marginBottom: 18 }}>
          {lesson.project_name} · {lesson.logged_by_name || "PMO"} · {relDate(lesson.created_at)}
        </div>
        {FIELDS.filter(([, v]) => v).map(([label, value]) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ ...TYPE.label, color: T.muted, marginBottom: 5 }}>{label}</div>
            <div style={{ ...TYPE.bodySm, color: T.textSoft, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{value}</div>
          </div>
        ))}
        {canWrite && (
          <div style={{ display: "flex", gap: SP.sm, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <button className="pmo-focusable pmo-btn" onClick={() => onEdit(lesson)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "none",
                border: `1px solid ${T.border}`, borderRadius: R.md, color: T.muted, cursor: "pointer", fontSize: 13,
                fontFamily: TYPE.body.fontFamily }}><Pencil size={13} /> Edit</button>
            <button className="pmo-focusable pmo-btn" onClick={() => onDelete(lesson)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "none",
                border: "1px solid rgba(248,113,113,0.3)", borderRadius: R.md, color: "#F87171", cursor: "pointer",
                fontSize: 13, fontFamily: TYPE.body.fontFamily }}><Trash2 size={13} /> Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add / edit form ── */
function LessonFormModal({ T, session, supa, lesson, projectId, projects, onClose, onSaved }) {
  const [form, setForm] = useState(() => lesson ? { ...lesson } : {
    project_id: projectId || "", title: "", category: "process", phase: "execution",
    what_happened: "", what_went_well: "", what_went_wrong: "", recommendation: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.md, padding: "9px 12px",
    fontSize: 13.5, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 };
  const ta = { ...inp, resize: "vertical", fontFamily: TYPE.body.fontFamily, minHeight: 60 };

  const save = async () => {
    setErr(null);
    if (!form.project_id) return setErr("Choose a project.");
    if (!form.title.trim()) return setErr("Give the lesson a title.");
    setSaving(true);
    try {
      const payload = { project_id: form.project_id, title: form.title, category: form.category, phase: form.phase,
        what_happened: form.what_happened || null, what_went_well: form.what_went_well || null,
        what_went_wrong: form.what_went_wrong || null, recommendation: form.recommendation || null,
        logged_by_name: session.username || session.full_name };
      if (lesson?.id) {
        await supa(`/rest/v1/lessons_learned?id=eq.${lesson.id}`, { method: "PATCH", body: JSON.stringify(payload) }, session.access_token);
      } else {
        await supa("/rest/v1/lessons_learned", { method: "POST", body: JSON.stringify(payload) }, session.access_token);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Could not save this lesson."); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pmo-scale" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
        padding: SP.xxl, width: 560, maxHeight: "90vh", overflow: "auto", boxShadow: T.shadowLg }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: TYPE.display.fontFamily,
          marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
          {lesson?.id ? "Edit Lesson" : "Add Lesson Learned"}
        </div>

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
          <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Early contractor engagement paid off" style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Category</label>
            <Select T={T} value={form.category} onChange={e => set("category", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <div>
            <label style={lbl}>Phase</label>
            <Select T={T} value={form.phase} onChange={e => set("phase", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(PHASE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>What Happened</label>
          <textarea value={form.what_happened || ""} onChange={e => set("what_happened", e.target.value)} rows={2} style={ta} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: 14 }}>
          <div>
            <label style={lbl}>What Went Well</label>
            <textarea value={form.what_went_well || ""} onChange={e => set("what_went_well", e.target.value)} rows={2} style={ta} />
          </div>
          <div>
            <label style={lbl}>What Went Wrong</label>
            <textarea value={form.what_went_wrong || ""} onChange={e => set("what_went_wrong", e.target.value)} rows={2} style={ta} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Recommendation for Future Projects</label>
          <textarea value={form.recommendation || ""} onChange={e => set("recommendation", e.target.value)} rows={2} style={ta} />
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
            {saving ? "Saving…" : lesson?.id ? "Save Changes" : "Add Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteLesson({ T, lesson, onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: SP.xl,
        width: 380, boxShadow: T.shadowLg }}>
        <div style={{ ...TYPE.bodySm, color: T.text, marginBottom: 14 }}>Delete "<strong>{lesson.title}</strong>"? This can't be undone.</div>
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

/* ── Shared data hook ── */
function useLessons(supa, session, projectId) {
  const [lessons, setLessons] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      const filter = projectId ? `&project_id=eq.${projectId}` : "";
      const rows = await supa(`/rest/v1/lessons_learned_full?select=*&order=created_at.desc${filter}`, {}, session.access_token);
      setLessons(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr(e.message); }
  }, [supa, session, projectId]);
  useEffect(() => { load(); }, [load]);
  return [lessons, load, err];
}

/* ── Per-project panel ── */
export function ProjectLessonsPanel({ T, session, supa, projectId, canWrite }) {
  const [lessons, reload, err] = useLessons(supa, session, projectId);
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const del = async (l) => {
    await supa(`/rest/v1/lessons_learned?id=eq.${l.id}`, { method: "DELETE" }, session.access_token);
    setConfirmDel(null); setDetail(null); reload();
  };

  return (
    <div style={{ padding: SP.lg, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
        <div style={{ ...TYPE.label, color: T.muted }}>{lessons?.length ?? 0} lesson{lessons?.length === 1 ? "" : "s"} logged</div>
        {canWrite && (
          <button className="pmo-focusable pmo-btn" onClick={() => setModal({})}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "#185078",
              border: "none", borderRadius: R.sm, color: "#fff", fontWeight: 700, ...TYPE.caption, cursor: "pointer" }}>
            <Plus size={13} /> Add Lesson
          </button>
        )}
      </div>

      {err && <div style={{ ...TYPE.bodySm, color: T.textOf(T.danger), marginBottom: SP.md }}>{err}</div>}

      {lessons === null ? (
        <div style={{ ...TYPE.caption, color: T.dim }}>Loading…</div>
      ) : lessons.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: SP.xl,
          color: T.muted, background: T.surfaceRaised, borderRadius: R.md, border: `1px solid ${T.border}` }}>
          <Lightbulb size={22} color={T.dim} />
          <div style={{ ...TYPE.bodySm }}>No lessons logged for this project yet.</div>
        </div>
      ) : lessons.map((l, i) => (
        <LessonCard key={l.id} T={T} lesson={l} index={i} showProject={false} onOpen={setDetail} />
      ))}

      {detail && (
        <LessonDetailModal T={T} lesson={detail} canWrite={canWrite}
          onClose={() => setDetail(null)}
          onEdit={(l) => { setDetail(null); setModal(l); }}
          onDelete={(l) => setConfirmDel(l)} />
      )}
      {modal !== null && (
        <LessonFormModal T={T} session={session} supa={supa} lesson={modal.id ? modal : null}
          projectId={projectId} projects={[]} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteLesson T={T} lesson={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />
      )}
    </div>
  );
}
