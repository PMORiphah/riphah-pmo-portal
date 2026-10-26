import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BellRing, Send, PackageCheck, Truck, Hourglass, ClipboardCheck, CheckCircle2, AlertTriangle, Clock,
  ChevronDown, ChevronRight, History, MessageSquare,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Modal, Spinner } from "./ui.jsx";
import { useTour } from "./TourGuide.jsx";
import { launcherClearance } from "./AssistantAvatar.jsx";
import {
  OVERALL, LINE_STATUS, DETAIL_MIN, NOTE_MAX, isItem, requestBody, requestNote, cleanPct, chars, needText, plainError,
  linesDone, missingOf, updateData, tally, tallyText, choiceFromStatus, agoText, agoShort, dayText, daysAgo,
} from "./updateKinds.js";

/* ═══════════════════════════════════════════════════════════════════════════
   ASK UPDATE (PMO, 20 Oct 2026; plan docs/plans/status-requests.md)

   On a FY 2026-27 project's Updates thread the PMO, or a past-project viewer,
   presses Ask update; the project's manager(s) (project_assignments, any role)
   are emailed by notify-update and answer in the same thread with one update:
   every confirmed deliverable line (status and a comment), the overall status,
   % completed and a detailed update. The database checks all of it again and
   copies each line onto the Deliverables tab. The manager's % is shown as
   reported; only the PMO's "Use this %" copies it into % Complete.

   Loaded only when one of these is on screen: the request window, the
   manager's form, the request and update cards in a thread, and the sign-in
   notice that lists what is waiting on a manager.
   ═══════════════════════════════════════════════════════════════════════════ */

const AMBER = DATA.warning;
const ICON = { arrived: PackageCheck, ordered: Truck, not_yet: Hourglass, on_track: CheckCircle2, at_risk: AlertTriangle, delayed: Clock };
const DELIV_NOW = { not_started:"Not started", ordered:"Ordered", delivered:"Delivered", installed:"Installed", handed_over:"Handed over" };
const HINT = {
  arrived: "e.g. received on site and checked",
  ordered: "e.g. PO issued, delivery expected next month",
  not_yet: "e.g. waiting for quotations",
};
const nameOf = (s) => s?.full_name || s?.username || "";

const callFn = (supa, session, body) =>
  supa("/functions/v1/notify-update", { method:"POST", body: JSON.stringify(body) }, session.access_token);
// Best-effort: the post is already saved; a mail problem must not look like a failed post.
const notifyUpdate = (supa, session, body) => { callFn(supa, session, body).catch(() => {}); };

// An unsent update survives a reload (iOS drops background tabs). Per person and project, this browser only.
const readDraft = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const writeDraft = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const clearDraft = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

const inputStyle = (T, big, bad) => ({
  width:"100%", boxSizing:"border-box", background:T.inputBg,
  border:`1px solid ${bad ? `${DATA.danger}AA` : T.inputBorder}`, borderRadius:R.md,
  padding: big ? "10px 12px" : "8px 11px",
  // 16px on phones: iOS zooms into any smaller field when it is focused.
  fontSize: big ? 16 : 13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none",
  transition:`border-color ${MOTION.fast}`,
});

const Chip = ({ T, color, icon:Icon, children, title }) => (
  <span title={title} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"2px 9px", borderRadius:R.pill,
    background:`${color}${T.badge}`, color:T.textOf(color), fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
    {Icon && <Icon size={12} strokeWidth={2.2} />}{children}
  </span>
);

/** Three (or so) big buttons, one of which is chosen: a radio group (arrow keys move the choice, one tab stop). */
function Choice({ T, options, value, onChange, bad, label, big }) {
  const keys = Object.keys(options);
  const refs = useRef([]);
  const stop = Math.max(0, keys.indexOf(value));
  const move = (e, i) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + keys.length) % keys.length;
    onChange(keys[j]); refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={bad || undefined} style={{ display:"flex", gap:6 }}>
      {Object.entries(options).map(([k, o], i) => {
        const on = value === k, Icon = ICON[k];
        return (
          <button key={k} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on}
            tabIndex={i === stop ? 0 : -1} onKeyDown={(e) => move(e, i)} onClick={() => onChange(k)}
            className="pmo-focusable pmo-btn" style={{
              flex:1, minWidth:0, minHeight: big ? 46 : 40, padding:"6px 6px", borderRadius:R.md, cursor:"pointer",
              border:`1px solid ${on ? o.color : bad ? `${DATA.danger}AA` : T.border}`,
              background: on ? `${o.color}${T.washStrong}` : T.inputBg,
              boxShadow: on ? `inset 0 0 0 1px ${o.color}66` : "none",
              color: on ? T.textOf(o.color) : T.muted, fontWeight: on ? 700 : 500, fontSize:12.5,
              fontFamily:TYPE.body.fontFamily, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              transition:`background ${MOTION.fast}, border-color ${MOTION.fast}, color ${MOTION.fast}`,
            }}>
            {Icon && <Icon size={14} strokeWidth={2} style={{ flexShrink:0 }} />}
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const Label = ({ T, children, sub }) => (
  <div style={{ marginBottom:7 }}>
    <div style={{ ...TYPE.label, color:T.muted }}>{children}</div>
    {sub && <div style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>{sub}</div>}
  </div>
);

// ─── The request window (PMO or a past-project viewer) ──────────────────────
/**
 * project: { id, code, name }; managers: the active assignees ([{ id, full_name, username }]);
 * remind: a request is already waiting. onSent({ to, message }) after the request is posted (message: what
 * actually happened, for the thread's flash line).
 */
export function AskUpdateModal({ T, session, supa, project, managers, remind, isMobile, onClose, onSent }) {
  const [note, setNote] = useState("");
  const [pv, setPv]     = useState({ state:"loading" });   // loading | ok (subject, html, text, to) | error
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const seq = useRef(0);

  // The email exactly as notify-update would send it, refreshed shortly after the note changes.
  useEffect(() => {
    const my = ++seq.current;
    setPv(p => p.state === "ok" ? { ...p, refreshing:true } : p);
    const t = setTimeout(async () => {
      try {
        const r = await callFn(supa, session, { preview:true, project_id:project.id, note:note.trim() });
        if (my === seq.current) setPv({ state:"ok", ...(r || {}) });
      } catch (e) {
        if (e?.message) console.warn("[notify-update preview]", e.message);
        if (my === seq.current) setPv({ state:"error" });
      }
    }, note ? 700 : 0);
    return () => clearTimeout(t);
  }, [note, project.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const names = managers.map(nameOf).filter(Boolean);
  // Who is emailed is what notify-update says (it leaves out a manager without an email address);
  // the assigned names stand in only while the preview loads or when it is not available.
  const known = pv.state === "ok";
  const to = known ? (Array.isArray(pv.to) ? pv.to : []) : names;
  const nobody = known && !to.length;
  // What is asked depends on the project's deliverable lines (notify-update counts them).
  const need = needText(known && typeof pv.lines === "number" ? pv.lines : null);
  // A viewer's request also goes to the PMO (notify-update returns those names as `also`).
  const also = known && Array.isArray(pv.also) ? pv.also : [];
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const created = await supa("/rest/v1/comments", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({ project_id:project.id, author_id:session.user_id, author_name:(session.full_name || session.username),
          author_role:session.role, body:requestBody(note), parent_id:null, kind:"update_request" }),
      }, session.access_token);
      const id = Array.isArray(created) ? created[0]?.id : created?.id;
      // Its own email: notify-comment is never called for a request.
      if (id) notifyUpdate(supa, session, { kind:"request", id });
      onSent?.({ to, message: nobody ? "Request posted in this thread. Nobody was emailed: no assigned manager has an email address."
        : known ? `Request sent to ${to.join(", ")}.` : `Request posted in this thread for ${names.join(", ")}.` });
    } catch (e) {
      setErr(plainError(e, { rls:"Only the PMO and the past-project viewers can ask for an update.",
        fallback:"The request could not be sent. Please try again." }));
      setBusy(false);
    }
  };
  // Links in the preview must not navigate the frame; the sandbox already blocks scripts and forms.
  const doc = pv.state === "ok" && pv.html ? `<style>a{pointer-events:none}</style>${pv.html}` : null;

  return (
    <Modal T={T} icon={BellRing} width={620} isMobile={isMobile} onClose={busy ? undefined : onClose}
      title={remind ? "Remind the manager" : "Ask for an update"}
      sub={`${project.code || "-"} · ${project.name}`}
      footer={<>
        <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button T={T} variant="primary" icon={Send} onClick={send} loading={busy} disabled={!managers.length}>
          {remind ? "Send reminder" : "Send request"}
        </Button>
      </>}>
      <div data-ask-who style={{ ...TYPE.body, color:T.text, lineHeight:1.6 }}>
        {!managers.length ? (
          <span style={{ color:T.textOf(DATA.danger) }}>No active manager is assigned to this project, so nobody could answer.</span>
        ) : nobody ? (<>
          <strong>Nobody is emailed:</strong> no assigned manager has an email address. The request is still posted in this
          thread, where {names.join(", ")} can answer it.
        </>) : (<>
          <strong>{to.join(", ")}</strong> {to.length === 1 ? "is" : "are"} emailed and asked for {need}.
          The request{remind ? " (a reminder)" : ""} and the answer are posted in this thread.
        </>)}
        {also.length > 0 && <span data-also> The PMO ({also.join(", ")}) is copied.</span>}
      </div>
      <div style={{ marginTop:SP.lg }}>
        <Label T={T} sub="Optional. It is added to the email and to the request in this thread.">Note to the manager</Label>
        <textarea value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))} rows={2}
          placeholder={remind ? "e.g. The board meets on Friday; please update today." : "e.g. Needed for the monthly report."}
          style={{ ...inputStyle(T, isMobile), resize:"vertical" }} />
      </div>
      <div style={{ marginTop:SP.lg }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
          <div style={{ ...TYPE.label, color:T.muted }}>Email preview</div>
          {(pv.state === "loading" || pv.refreshing) && <Spinner size={12} color={T.muted} />}
        </div>
        {pv.state === "error" ? (
          <div style={{ ...TYPE.bodySm, color:T.muted, padding:"10px 12px", borderRadius:R.md, border:`1px dashed ${T.borderStrong}` }}>
            The preview is not available right now. Sending still posts the request in this thread.
          </div>
        ) : pv.state === "ok" ? (
          <div>
            {pv.subject && <div style={{ ...TYPE.bodySm, color:T.text, marginBottom:6 }}><span style={{ color:T.dim }}>Subject: </span>{pv.subject}</div>}
            {doc ? (
              <iframe title="Email preview" sandbox="" srcDoc={doc} style={{ width:"100%", height: isMobile ? 300 : 360,
                border:`1px solid ${T.border}`, borderRadius:R.md, background:"#fff", display:"block" }} />
            ) : (
              <div style={{ ...TYPE.bodySm, color:T.text, whiteSpace:"pre-wrap", padding:"10px 12px", borderRadius:R.md,
                border:`1px solid ${T.border}`, background:T.inputBg, maxHeight:300, overflow:"auto" }}>{pv.text || ""}</div>
            )}
          </div>
        ) : (
          <div style={{ height: isMobile ? 120 : 160, borderRadius:R.md, border:`1px solid ${T.border}`, background:T.inputBg }} />
        )}
      </div>
      {err && <div role="alert" style={{ ...TYPE.bodySm, color:T.textOf(DATA.danger), marginTop:SP.md }}>{err}</div>}
    </Modal>
  );
}

// ─── Cards in the thread ────────────────────────────────────────────────────
/** A request. answeredBy: the update that answered it, or null; waiting: still open; lines: the project's item lines (null: not known). */
export function RequestCard({ T, comment, answeredBy, waiting, lines = null }) {
  const note = requestNote(comment.body);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <Chip T={T} color={AMBER} icon={BellRing}>Update requested</Chip>
        {answeredBy ? (
          <span style={{ ...TYPE.caption, color:T.textOf(DATA.positive), display:"inline-flex", alignItems:"center", gap:4 }}>
            <CheckCircle2 size={12} /> Answered {dayText(answeredBy.created_at)}{answeredBy.author_name ? ` by ${answeredBy.author_name}` : ""}
          </span>
        ) : waiting ? (
          <span style={{ ...TYPE.caption, color:T.textOf(AMBER), display:"inline-flex", alignItems:"center", gap:6 }}>
            <span className="pmo-pulse-dot" style={{ width:7, height:7, borderRadius:"50%", background:AMBER, color:AMBER, flexShrink:0 }} />
            Waiting · {agoShort(comment.created_at)}
          </span>
        ) : null}
      </div>
      {note && (
        <div style={{ marginTop:8, padding:"7px 11px", borderLeft:`3px solid ${AMBER}88`, background:`${AMBER}${T.wash}`,
          borderRadius:`0 ${R.sm}px ${R.sm}px 0`, fontSize:13.5, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
          {note}
        </div>
      )}
      <div style={{ ...TYPE.caption, color:T.dim, marginTop:7 }}>
        Asked for: {needText(lines)}.
      </div>
    </div>
  );
}

/**
 * The manager's update. titles: { deliverable id: { line_no, title } }. latest: the newest update in the
 * thread. isPMO with projectPct (% Complete now) offers "Use this %"; onUsePct(pct) saves it.
 */
export function UpdateCard({ T, comment, titles, latest, isPMO, projectPct, onUsePct }) {
  const d = comment.data || {};
  const o = OVERALL[d.overall];
  const pct = d.pct == null || d.pct === "" || isNaN(Number(d.pct)) ? null : Number(d.pct);
  const lines = useMemo(() => (Array.isArray(d.lines) ? d.lines : [])
    .map((l, i) => ({ ...l, _t: titles?.[l.id] || null, _i: i }))
    .sort((a, b) => (a._t?.line_no ?? 1e9) - (b._t?.line_no ?? 1e9) || a._i - b._i), [d.lines, titles]);
  const tt = tallyText(tally(lines));
  const [open, setOpen] = useState(false);
  const [ask, setAsk]   = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [err, setErr]   = useState(null);
  const now = projectPct == null || isNaN(Number(projectPct)) ? null : Number(projectPct);
  const canUse = isPMO && latest && pct != null && now != null && now !== pct && !saved;
  const use = async () => {
    setBusy(true); setErr(null);
    try { await onUsePct(pct); setSaved(pct); setAsk(false); }
    catch (e) { setErr(e?.message || "Could not save % Complete."); }
    setBusy(false);
  };
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        {o ? <Chip T={T} color={o.color} icon={ICON[d.overall]}>{o.label}</Chip> : <Chip T={T} color={DATA.neutral}>Update</Chip>}
        {pct != null && (
          <span style={{ ...TYPE.bodySm, color:T.text, fontWeight:600, fontVariantNumeric:"tabular-nums" }}
            title="% completed as reported by the manager">PM reports {pct}% · {dayText(comment.created_at)}</span>
        )}
        {canUse && !ask && (
          <button type="button" className="pmo-focusable pmo-btn" onClick={() => setAsk(true)} style={{ marginLeft:"auto",
            padding:"3px 10px", borderRadius:R.pill, border:`1px solid ${BRAND.blue}66`, background:`${BRAND.blue}${T.badge}`,
            color:T.textOf(BRAND.blueBright), fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:TYPE.body.fontFamily }}>
            Use this %
          </button>
        )}
      </div>
      {pct != null && (
        <div style={{ height:5, borderRadius:R.pill, background:T.border, marginTop:8, overflow:"hidden" }}>
          <div className="pmo-grow" style={{ width:`${Math.max(0, Math.min(100, pct))}%`, height:"100%", borderRadius:R.pill,
            background:o ? o.color : BRAND.blue }} />
        </div>
      )}
      {ask && (
        <div className="pmo-in" style={{ marginTop:8, padding:"8px 11px", borderRadius:R.md, border:`1px solid ${BRAND.blue}55`,
          background:`${BRAND.blue}${T.wash}`, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ ...TYPE.bodySm, color:T.text, flex:1, minWidth:180 }}>Set the project's % Complete from {now}% to {pct}%? It drives earned value and the schedule figures.</span>
          <Button T={T} size="sm" variant="ghost" onClick={() => setAsk(false)} disabled={busy}>Cancel</Button>
          <Button T={T} size="sm" variant="primary" onClick={use} loading={busy}>Set {pct}%</Button>
        </div>
      )}
      {saved != null && (
        <div className="pmo-in" style={{ ...TYPE.caption, color:T.textOf(DATA.positive), marginTop:6, display:"flex", alignItems:"center", gap:4 }}>
          <CheckCircle2 size={12} /> % Complete is now {saved}%.
        </div>
      )}
      {err && <div role="alert" style={{ ...TYPE.caption, color:T.textOf(DATA.danger), marginTop:6 }}>{err}</div>}
      {lines.length > 0 && (
        <div style={{ marginTop:9 }}>
          <button type="button" className="pmo-focusable" onClick={() => setOpen(v => !v)} aria-expanded={open} style={{
            display:"inline-flex", alignItems:"center", gap:5, background:"none", border:"none", padding:"2px 0", cursor:"pointer",
            color:T.muted, fontSize:12, fontWeight:600, fontFamily:TYPE.body.fontFamily }}>
            <ChevronDown size={13} style={{ transition:`transform ${MOTION.fast}`, transform: open ? "none" : "rotate(-90deg)" }} />
            Deliverables: {tt}
          </button>
          {open && (
            <div className="pmo-in" style={{ marginTop:6, display:"flex", flexDirection:"column", gap:6 }}>
              {lines.map((l) => {
                const s = LINE_STATUS[l.status];
                return (
                  <div key={l.id} style={{ padding:"7px 10px", borderRadius:R.sm, background:T.inputBg, border:`1px solid ${T.border}` }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                      {s && <Chip T={T} color={s.color} icon={ICON[l.status]}>{s.label}</Chip>}
                      <span style={{ fontSize:12.5, color:T.text, fontWeight:600, lineHeight:1.4, minWidth:0, wordBreak:"break-word" }}>
                        {l._t ? `${l._t.line_no != null ? `Line ${l._t.line_no} · ` : ""}${l._t.title || ""}` : "Deliverable"}
                      </span>
                    </div>
                    {l.comment && <div style={{ fontSize:12.5, color:T.textSoft, marginTop:4, lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{l.comment}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop:9 }}>
        <div style={{ ...TYPE.label, color:T.dim, marginBottom:3 }}>Detailed update</div>
        <div style={{ fontSize:13.5, color:T.text, lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{comment.body}</div>
      </div>
    </div>
  );
}

// ─── The manager's form ─────────────────────────────────────────────────────
/**
 * Shown to an assignee of the project while a request waits. waiting: the open requests (oldest
 * first); lastPct: the manager's last reported %. onDone(message) after the update is posted.
 */
export function UpdateForm({ T, session, supa, project, waiting, lastPct, isCompact, onDone }) {
  const first = waiting[0], latest = waiting[waiting.length - 1];
  const key = `pmo-upd-draft:${session.user_id}:${project.id}`;
  const draft = useMemo(() => readDraft(key) || {}, [key]);
  const [lines, setLines]     = useState(null);     // null while loading
  const [loadErr, setLoadErr] = useState(null);
  const [answers, setAnswers] = useState(() => (draft.answers && typeof draft.answers === "object" ? draft.answers : {}));
  const [overall, setOverall] = useState(draft.overall || null);
  const [pct, setPct]         = useState(draft.pct ?? "");
  const [detail, setDetail]   = useState(draft.detail || "");
  const [tried, setTried]     = useState(false);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);
  const [wide, setWide]       = useState({});        // line titles shown in full
  const root = useRef(null);

  const loadLines = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await supa(`/rest/v1/project_deliverables?project_id=eq.${project.id}&confirmed=eq.true&superseded=eq.false&select=id,line_no,title,qty,unit,status,status_date,note,revised_title,revised_qty,revised_unit&order=sort_order.asc,line_no.asc`,
                           {}, session.access_token);
      // A revised line is asked about as what is actually being bought; the original is named under it.
      const list = (Array.isArray(r) ? r : []).filter(l => isItem(l.title))
        .map(l => l.revised_title ? { ...l, orig_title: l.title, title: l.revised_title,
                                      qty: l.revised_qty ?? l.qty, unit: l.revised_unit || l.unit } : l);
      setLines(list);
      // What the Deliverables tab already says is the starting choice; a line not started is left to the manager.
      setAnswers(a => {
        const n = { ...a };
        list.forEach(l => { if (!n[l.id]?.status) { const c = choiceFromStatus(l.status); if (c) n[l.id] = { ...(n[l.id] || {}), status:c }; } });
        return n;
      });
      return list;
    } catch (e) {
      if (e?.message) console.warn("[deliverables]", e.message);
      setLoadErr("The deliverables could not be loaded.");
      return null;
    }
  }, [project.id, session.access_token]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadLines(); }, [loadLines]);

  useEffect(() => { writeDraft(key, { answers, overall, pct, detail }); }, [key, answers, overall, pct, detail]);

  const missing = lines ? missingOf({ lines, answers, overall, pct, detail }) : [];
  const need = tried ? new Set(missing.map(m => m.key)) : new Set();
  const done = lines ? linesDone(lines, answers) : 0;
  const setLine = (id, patch) => setAnswers(a => ({ ...a, [id]: { ...(a[id] || {}), ...patch } }));
  const goTo = (k) => {
    const el = root.current?.querySelector(`[data-need="${k}"]`);
    if (!el) return;
    el.scrollIntoView({ block:"center", behavior:"smooth" });
    const f = el.matches("input,textarea") ? el : el.querySelector("button,input,textarea");
    setTimeout(() => f?.focus?.({ preventScroll:true }), 350);
  };

  // Whoever asked is emailed with the PMO (notify-update): the PMO, and a past-project viewer who asked.
  const others = [...new Set(waiting.filter(w => w.author_role !== "pmo").map(w => w.author_name).filter(Boolean))];
  const who = others.length ? `the PMO and ${others.join(" and ")} are emailed` : "the PMO is emailed";

  const submit = async () => {
    if (!lines || busy) return;
    if (missing.length) { setTried(true); goTo(missing[0].key); return; }
    setBusy(true); setErr(null);
    try {
      const created = await supa("/rest/v1/comments", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({ project_id:project.id, author_id:session.user_id, author_name:(session.full_name || session.username),
          author_role:session.role, parent_id:null, kind:"update", body:detail.trim(),
          data: updateData({ lines, answers, overall, pct }) }),
      }, session.access_token);
      const id = Array.isArray(created) ? created[0]?.id : created?.id;
      if (id) notifyUpdate(supa, session, { kind:"update", id });
      clearDraft(key);
      onDone?.(`Update sent: ${who}.`);
    } catch (e) {
      const m = e?.message || "";
      // The form counts as the database does, so this means the PMO changed the deliverables while it was
      // being filled in: show the lines as they are now and point at what they still need.
      if (/every deliverable/i.test(m)) {
        const fresh = await loadLines();
        const left = fresh ? missingOf({ lines: fresh, answers, overall, pct, detail }) : [];
        setTried(true);
        setErr(`The deliverables changed while you were filling this in.${left.length
          ? ` ${left.length} thing${left.length === 1 ? "" : "s"} still missing, marked below.` : " Please check the lines and send again."}`);
        if (left.length) setTimeout(() => goTo(left[0].key), 60);
      } else {
        setErr(plainError(e, { rls:"Only this project's manager can send its update.",
          fallback:"The update could not be sent. Please try again." }));
      }
      setBusy(false);
    }
  };

  const notes = waiting.map(w => ({ id:w.id, by:w.author_name, note:requestNote(w.body) })).filter(n => n.note);
  const pctN = cleanPct(pct);
  return (
    <div ref={root} data-update-form={project.id} className="pmo-in" style={{ margin:"6px 0 12px", borderRadius:R.lg,
      border:`1px solid ${AMBER}66`, background:T.surface, boxShadow:T.shadow }}>
      {/* What was asked */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:SP.md, padding:"12px 14px",
        background:`linear-gradient(90deg, ${AMBER}22, transparent)`, borderBottom:`1px solid ${T.border}`,
        borderRadius:`${R.lg}px ${R.lg}px 0 0` }}>
        <div style={{ width:30, height:30, borderRadius:R.sm, flexShrink:0, background:`${AMBER}${T.badge}`,
          border:`1px solid ${AMBER}55`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <ClipboardCheck size={15} color={T.textOf(AMBER)} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ ...TYPE.h3, color:T.text }}>{first.author_name || "The PMO"} asked for an update on {dayText(first.created_at)}</div>
          <div style={{ ...TYPE.caption, color:T.muted, marginTop:2 }}>
            {waiting.length > 1 ? `Asked ${waiting.length} times, most recently by ${latest.author_name || "the PMO"} ${agoText(latest.created_at)}. ` : ""}
            Every field is required. Your update is posted in this thread, and {who}.
          </div>
          {notes.map(n => (
            <div key={n.id} style={{ marginTop:6, ...TYPE.bodySm, color:T.text, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
              “{n.note}”{n.by ? <span style={{ color:T.dim }}> · {n.by}</span> : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"12px 14px 4px" }}>
        {/* 1. Each deliverable */}
        {lines === null ? (
          loadErr ? (
            <div style={{ ...TYPE.bodySm, color:T.textOf(DATA.danger), display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              {loadErr} <Button T={T} size="sm" onClick={loadLines}>Try again</Button>
            </div>
          ) : (
            <div style={{ ...TYPE.bodySm, color:T.muted, display:"flex", alignItems:"center", gap:8 }}><Spinner size={12} color={T.muted} /> Loading the deliverables…</div>
          )
        ) : lines.length ? (
          <div>
            <Label T={T} sub="For each one: has it arrived, been ordered, or not yet? Add a short comment.">
              Deliverables ({lines.length})
            </Label>
            {lines.map((l, i) => {
              const a = answers[l.id] || {};
              const longTitle = String(l.title || "").length > 90;
              const now = DELIV_NOW[l.status];
              return (
                <div key={l.id} data-line={l.id} style={{ padding:"10px 0", borderTop: i ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                    <span style={{ ...TYPE.mono, fontSize:11, color:T.dim, minWidth:18, paddingTop:2 }}>{l.line_no ?? i + 1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      {longTitle ? (
                        <button type="button" className="pmo-focusable" aria-expanded={!!wide[l.id]}
                          onClick={() => setWide(w => ({ ...w, [l.id]: !w[l.id] }))}
                          style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:0,
                            margin:0, cursor:"pointer", fontFamily:TYPE.body.fontFamily, color:T.text }}>
                          <span style={{ fontSize:13, fontWeight:600, lineHeight:1.4, wordBreak:"break-word",
                            ...(wide[l.id] ? { display:"block" } : { display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }) }}>
                            {l.title}
                          </span>
                          <span style={{ fontSize:11.5, fontWeight:600, color:T.textOf(BRAND.blueBright) }}>{wide[l.id] ? "Show less" : "Show more"}</span>
                        </button>
                      ) : (
                        <div style={{ fontSize:13, fontWeight:600, color:T.text, lineHeight:1.4, wordBreak:"break-word" }}>{l.title || "Item"}</div>
                      )}
                      {l.orig_title && (
                        <div style={{ ...TYPE.caption, color:T.textOf(DATA.warning), marginTop:2, overflowWrap:"anywhere" }}>Revised · PDD item: {l.orig_title}</div>
                      )}
                      <div style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>
                        {l.qty != null ? `${Number(l.qty).toLocaleString("en")}${l.unit ? ` ${l.unit}` : ""} · ` : ""}
                        Now: {now || "Not started"}{l.status_date && l.status !== "not_started" ? ` ${dayText(l.status_date)}` : ""}
                        {l.note ? ` · Last note: ${l.note}` : ""}
                      </div>
                    </div>
                  </div>
                  <div data-need={`s:${l.id}`} style={{ marginTop:8 }}>
                    <Choice T={T} options={LINE_STATUS} value={a.status} big={isCompact} bad={need.has(`s:${l.id}`)}
                      label={`Status of line ${l.line_no ?? i + 1}`} onChange={(v) => setLine(l.id, { status:v })} />
                  </div>
                  <input data-need={`c:${l.id}`} value={a.comment || ""} maxLength={500}
                    aria-invalid={need.has(`c:${l.id}`) || undefined}
                    onChange={e => setLine(l.id, { comment:e.target.value })}
                    placeholder={a.status ? `Comment (required), ${HINT[a.status]}` : "Comment (required)"}
                    aria-label={`Comment on line ${l.line_no ?? i + 1}`}
                    style={{ ...inputStyle(T, isCompact, need.has(`c:${l.id}`)), marginTop:7 }} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...TYPE.bodySm, color:T.muted, marginBottom:4 }}>
            This project has no confirmed deliverables, so only the overall status, % completed and a detailed update are needed.
          </div>
        )}

        {/* 2. Overall status and % completed */}
        <div style={{ marginTop:SP.lg }} data-need="overall">
          <Label T={T}>Overall status</Label>
          <Choice T={T} options={OVERALL} value={overall} onChange={setOverall} big={isCompact} bad={need.has("overall")} label="Overall status" />
        </div>
        <div style={{ marginTop:SP.lg }}>
          <Label T={T} sub={lastPct != null ? `You last reported ${lastPct}%.` : "Your estimate of the work done, 0 to 100."}>% completed</Label>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ position:"relative", width:104, flexShrink:0 }}>
              <input data-need="pct" type="text" inputMode="numeric" pattern="[0-9]*" value={pct} aria-label="% completed"
                aria-invalid={need.has("pct") || (pct !== "" && pctN == null) || undefined}
                onChange={e => setPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="0-100"
                style={{ ...inputStyle(T, isCompact, need.has("pct") || (pct !== "" && pctN == null)), paddingRight:28, fontVariantNumeric:"tabular-nums" }} />
              <span style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", color:T.dim, fontSize:13, pointerEvents:"none" }}>%</span>
            </div>
            <div style={{ flex:1, height:8, borderRadius:R.pill, background:T.border, overflow:"hidden" }}>
              <div style={{ width:`${pctN ?? 0}%`, height:"100%", borderRadius:R.pill, transition:`width ${MOTION.base}`,
                background: overall && OVERALL[overall] ? OVERALL[overall].color : BRAND.blue }} />
            </div>
          </div>
        </div>

        {/* 3. Detailed update */}
        <div style={{ marginTop:SP.lg }}>
          <Label T={T} sub="What was done, what is next, and anything the PMO should know.">Detailed update</Label>
          <textarea data-need="detail" value={detail} onChange={e => setDetail(e.target.value)} rows={4}
            aria-label="Detailed update" aria-invalid={need.has("detail") || undefined}
            placeholder="Write the detailed update…"
            style={{ ...inputStyle(T, isCompact, need.has("detail")), resize:"vertical", lineHeight:1.55 }} />
          <div style={{ ...TYPE.caption, marginTop:3, color: chars(detail) >= DETAIL_MIN ? T.textOf(DATA.positive) : T.dim }}>
            {chars(detail) >= DETAIL_MIN ? "✓ Long enough" : `${chars(detail)} of at least ${DETAIL_MIN} characters`}
          </div>
        </div>

        {tried && missing.length > 0 && (
          <div role="alert" className="pmo-in" style={{ marginTop:SP.md, padding:"9px 11px", borderRadius:R.md,
            border:`1px solid ${DATA.danger}55`, background:`${DATA.danger}${T.wash}` }}>
            <div style={{ ...TYPE.bodySm, fontWeight:700, color:T.textOf(DATA.danger) }}>
              {missing.length} thing{missing.length === 1 ? "" : "s"} still missing
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
              {missing.slice(0, 12).map(m => (
                <button key={m.key} type="button" className="pmo-focusable pmo-btn" onClick={() => goTo(m.key)} style={{
                  padding:"3px 9px", borderRadius:R.pill, border:`1px solid ${DATA.danger}55`, background:T.surface,
                  color:T.textOf(DATA.danger), fontSize:11.5, cursor:"pointer", fontFamily:TYPE.body.fontFamily }}>{m.text}</button>
              ))}
              {missing.length > 12 && <span style={{ ...TYPE.caption, color:T.textOf(DATA.danger), alignSelf:"center" }}>and {missing.length - 12} more</span>}
            </div>
          </div>
        )}
        {err && <div role="alert" style={{ ...TYPE.bodySm, color:T.textOf(DATA.danger), marginTop:SP.md }}>{err}</div>}
      </div>

      {/* Stays in view at the bottom of the thread while the list scrolls (-16: over the thread's bottom padding).
          The assistant's character rests at the bottom right of the window (and can be dragged up that edge), so the
          bar keeps its width clear on every screen: less the thread's 20 px padding, plus a 16 px gap (the robot grows a
          little on hover). One row on phones. */}
      <div style={{ position:"sticky", bottom:-16, zIndex:1, display:"flex", alignItems:"center", gap: isCompact ? SP.sm : SP.md,
        padding:`10px ${launcherClearance(isCompact) - 4}px 10px 14px`, marginTop:SP.md, borderTop:`1px solid ${T.border}`, background:T.surface,
        borderRadius:`0 0 ${R.lg}px ${R.lg}px`, boxShadow:`0 -8px 16px -12px rgba(0,0,0,0.35)` }}>
        <div style={{ flex:1, minWidth:0 }}>
          {lines && lines.length > 0 && (<>
            <div style={{ ...TYPE.caption, color:T.muted, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {isCompact ? "" : "Deliverables "}{done} of {lines.length} done
            </div>
            <div style={{ height:4, borderRadius:R.pill, background:T.border, marginTop:4, overflow:"hidden", maxWidth:220 }}>
              <div style={{ width:`${(done / lines.length) * 100}%`, height:"100%", background:DATA.positive, transition:`width ${MOTION.base}` }} />
            </div>
          </>)}
          {lines && (missing.length === 0
            ? <div style={{ ...TYPE.caption, color:T.textOf(DATA.positive), marginTop:3 }}>Ready to send</div>
            : tried ? (
              // A long list: this takes the manager to the first thing still missing.
              <button type="button" data-missing-jump className="pmo-focusable" onClick={() => goTo(missing[0].key)}
                style={{ ...TYPE.caption, color:T.textOf(DATA.danger), marginTop:3, background:"none", border:"none", padding:0,
                  cursor:"pointer", textDecoration:"underline", textUnderlineOffset:2, fontFamily:TYPE.body.fontFamily, textAlign:"left" }}>
                {missing.length} {isCompact ? "missing" : `thing${missing.length === 1 ? "" : "s"} still missing`}
              </button>
            ) : null)}
        </div>
        <Button T={T} variant="primary" size={isCompact ? "lg" : "md"} icon={Send} onClick={submit} loading={busy} disabled={!lines}>
          Send update
        </Button>
      </div>
    </div>
  );
}

// ─── The sign-in notice for managers ────────────────────────────────────────
/**
 * items: [{ kind: "past" | "fy", id, name, code?, since, by, askedAt }], oldest first: since = the first request
 * still waiting, by/askedAt = the latest request. onOpen(item) opens the past project or the Updates thread;
 * onLater closes. Waits while a tour runs.
 */
export function AsksNotice({ T, items, isMobile, onOpen, onLater }) {
  const tour = useTour();
  if (tour?.running || !items?.length) return null;
  const n = items.length;
  const past = items.some(i => i.kind === "past"), fy = items.some(i => i.kind === "fy");
  const what = past && !fy ? "status request" : fy && !past ? "update request" : "request";
  return (
    <Modal T={T} icon={BellRing} width={500} isMobile={isMobile} onClose={onLater}
      title={`You have ${n} ${what}${n === 1 ? "" : "s"}`} sub="Waiting for your answer"
      footer={<Button T={T} variant="ghost" onClick={onLater}>Later</Button>}>
      <div style={{ ...TYPE.body, color:T.text, lineHeight:1.6 }}>
        Please open each one and answer.
        {past && " A past project needs % completed and a justification."}
        {fy && ` An FY 2026-27 project needs ${needText(null)}.`}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:SP.lg }}>
        {items.map(it => {
          const Icon = it.kind === "past" ? History : MessageSquare;
          return (
            <button key={`${it.kind}:${it.id}`} type="button" data-ask={it.kind} onClick={() => onOpen(it)}
              className="pmo-focusable pmo-btn" style={{ display:"flex", alignItems:"center", gap:SP.md, width:"100%",
                minHeight:54, padding:"9px 12px", borderRadius:R.md, border:`1px solid ${T.border}`, background:T.card2,
                cursor:"pointer", textAlign:"left", fontFamily:TYPE.body.fontFamily }}>
              <span style={{ width:30, height:30, borderRadius:R.sm, flexShrink:0, background:`${AMBER}${T.badge}`,
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Icon size={15} color={T.textOf(AMBER)} />
              </span>
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ display:"block", fontSize:13, fontWeight:600, color:T.text, lineHeight:1.35,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.name || "Project"}</span>
                <span style={{ display:"block", ...TYPE.caption, color:T.dim, marginTop:2 }}>
                  {it.kind === "past" ? "Past project" : `FY 2026-27${it.code && it.code !== "-" ? ` · ${it.code}` : ""}`}
                  {/* The latest request's asker with its own time; the first one's when it has waited longer. */}
                  {it.by ? ` · asked by ${it.by} ${agoText(it.askedAt || it.since)}` : ` · asked ${agoText(it.since)}`}
                  {it.by && it.askedAt && daysAgo(it.askedAt) !== daysAgo(it.since) ? ` (first ${agoText(it.since)})` : ""}
                </span>
              </span>
              <ChevronRight size={15} color={T.dim} style={{ flexShrink:0 }} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
