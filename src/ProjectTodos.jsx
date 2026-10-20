import { useState, useEffect, useRef, useCallback } from "react";
import { ListTodo, Lock, Plus, Check, X, ChevronDown, CalendarClock } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Skeleton, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   TO-DO LIST (PMO, 20 Oct 2026)

   The PMO's own list of things to chase on one project. PMO only: the tab is
   shown to the PMO alone and row-level security (is_pmo()) refuses everyone
   else. Items are never deleted: Remove sets removed = true, and the database
   stamps the times and writes each step to the Activity Log.

   Every change is shown at once and undone if the save fails. Changes to one
   item go out one after another, so a quick edit-then-tick reaches the
   database in the order it was made.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TODO_MAX = 500;
const SEL = "id,title,due_date,done,done_at,created_at";
const PKT_MS = 5 * 3600e3;   // Pakistan Standard Time, UTC+5 all year

// ─── Pure helpers (tested in scripts/sim/live/todos.test.mjs) ───────────────

/** Today's date in Pakistan as YYYY-MM-DD. */
export const todayPKT = (now = Date.now()) => new Date(now + PKT_MS).toISOString().slice(0, 10);

/** "overdue" (before today), "today", "upcoming", or null without a due date. */
export function dueTone(due, today) {
  if (!due) return null;
  const d = String(due).slice(0, 10);
  return d < today ? "overdue" : d === today ? "today" : "upcoming";
}

const dayMonth = (ymd, today) => {
  const d = new Date(String(ymd).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d)) return "";
  const sameYear = String(ymd).slice(0, 4) === String(today).slice(0, 4);
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short", ...(sameYear ? {} : { year:"numeric" }), timeZone:"UTC" });
};

/** The chip text: "Overdue · 18 Oct", "Due today", "Due 22 Oct" (year added when not this year). */
export function dueText(due, today) {
  const tone = dueTone(due, today);
  if (!tone) return "";
  if (tone === "today") return "Due today";
  return `${tone === "overdue" ? "Overdue · " : "Due "}${dayMonth(due, today)}`;
}

/** Whole days from today to the due date (negative when overdue). */
export const daysUntil = (due, today) =>
  Math.round((Date.parse(String(due).slice(0, 10)) - Date.parse(String(today).slice(0, 10))) / 864e5);

/** "done 20 Oct", read in Pakistan time. */
export function doneText(doneAt, today) {
  if (!doneAt) return "done";
  const t = Date.parse(doneAt);
  if (isNaN(t)) return "done";
  return `done ${dayMonth(todayPKT(t), today)}`;
}

/** The text as it will be saved, or null when it is empty or too long. */
export function cleanTitle(s) {
  const t = String(s ?? "").trim();
  return t.length >= 1 && t.length <= TODO_MAX ? t : null;
}

/** Open items: by due date (none last), then oldest first, as the server orders them. */
export function sortOpen(list) {
  return [...list].sort((a, b) => {
    const da = a.due_date || "9999-99-99", db = b.due_date || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

/** Done items: the most recently finished first. */
export function sortDone(list) {
  return [...list].sort((a, b) => String(b.done_at || "").localeCompare(String(a.done_at || "")));
}

const TONE = { overdue: DATA.danger, today: DATA.warning };
const isTemp = (id) => String(id).startsWith("tmp-");

// ─── Component ──────────────────────────────────────────────────────────────

export function ProjectTodos({ T, session, projectId, isCompact, supa }) {
  const isPMO = session?.role === "pmo";
  const [items, setItems]       = useState(null);    // null = loading
  const [loadErr, setLoadErr]   = useState(null);
  const [err, setErr]           = useState(null);
  const [draft, setDraft]       = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [editing, setEditing]   = useState(null);    // { id, field: "title" | "due" }
  const [confirmId, setConfirm] = useState(null);    // item asking "Remove?"
  const [showDone, setShowDone] = useState(false);
  const [hot, setHot]           = useState(null);

  const tokenRef = useRef(session?.access_token);
  tokenRef.current = session?.access_token;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const alive  = useRef(true);
  const queues = useRef({});                         // id -> { chain, n }
  const addRef = useRef(null);
  const tmpSeq = useRef(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await supa(`/rest/v1/project_todos?project_id=eq.${projectId}&removed=is.false&select=${SEL}` +
                           `&order=done.asc,due_date.asc.nullslast,created_at.asc`, {}, tokenRef.current);
      if (alive.current) setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      if (alive.current) { setLoadErr(e.message || "The list could not be loaded."); setItems(x => x || []); }
    }
  }, [projectId, supa]);

  useEffect(() => {
    if (!isPMO || !projectId) return;
    setItems(null); setEditing(null); setConfirm(null); queues.current = {};
    load();
  }, [isPMO, projectId, load]);

  // "Remove?" waits five seconds for an answer, then steps back.
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirm(null), 5000);
    return () => clearTimeout(t);
  }, [confirmId]);

  if (!isPMO) return null;

  const today = todayPKT();

  const fail = (what) => setErr(`${what} The change has been undone. Check the connection and try again.`);

  // ── Add ──
  const add = async () => {
    const title = cleanTitle(draft);
    if (!title) return;
    const due = draftDue || null;
    const id = `tmp-${++tmpSeq.current}`;
    const temp = { id, title, due_date: due, done: false, done_at: null, created_at: new Date().toISOString() };
    setErr(null);
    setItems(list => [...(list || []), temp]);
    setDraft(""); setDraftDue("");
    addRef.current?.focus();
    try {
      const r = await supa(`/rest/v1/project_todos?select=${SEL}`, { method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({ project_id: projectId, title, due_date: due }) }, tokenRef.current);
      const row = Array.isArray(r) ? r[0] : null;
      if (!row?.id) throw new Error("not saved");
      if (alive.current) setItems(list => (list || []).map(x => x.id === id ? row : x));
    } catch {
      if (!alive.current) return;
      setItems(list => (list || []).filter(x => x.id !== id));
      // Give the text back so nothing typed is lost.
      setDraft(d => d || title); setDraftDue(d => d || due || "");
      setErr("The to-do could not be added. Check the connection and try again.");
    }
  };

  // ── Change one item (optimistic, in order per item, undone on failure) ──
  const mutate = (id, patch, what) => {
    const before = (itemsRef.current || []).find(x => x.id === id);
    if (!before || isTemp(id)) return;
    const local = { ...patch };
    if ("done" in patch) local.done_at = patch.done ? new Date().toISOString() : null;
    const prev = Object.fromEntries(Object.keys(local).map(k => [k, before[k]]));
    setErr(null);
    setItems(list => (list || []).map(x => x.id === id ? { ...x, ...local } : x));
    const q = queues.current[id] || (queues.current[id] = { chain: Promise.resolve(), n: 0 });
    q.n++;
    q.chain = q.chain.then(async () => {
      try {
        const r = await supa(`/rest/v1/project_todos?id=eq.${id}&select=${SEL}`, { method:"PATCH",
          headers:{ Prefer:"return=representation" }, body: JSON.stringify(patch) }, tokenRef.current);
        const row = Array.isArray(r) ? r[0] : null;
        if (!row?.id) throw new Error("not saved");
        // Take the server's copy (its done time) only when nothing newer is waiting.
        if (alive.current && q.n === 1 && !patch.removed) setItems(list => (list || []).map(x => x.id === id ? { ...x, ...row } : x));
      } catch {
        if (!alive.current) return;
        setItems(list => (list || []).map(x => x.id === id ? { ...x, ...prev } : x));
        fail(what);
      } finally { q.n--; }
    });
  };

  const all    = (items || []).filter(x => !x.removed);
  const open   = sortOpen(all.filter(x => !x.done));
  const done   = sortDone(all.filter(x => x.done));
  const canAdd = !!cleanTitle(draft);
  const touch  = isCompact || !CAN_HOVER;
  const dateScheme = T.mode === "dark" ? "dark" : "light";

  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm, padding:"8px 10px",
    fontSize:13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none", boxSizing:"border-box", minWidth:0 };
  const plainBtn = { background:"none", border:"none", padding:0, margin:0, font:"inherit", color:"inherit", cursor:"pointer" };

  // ── Pieces ──
  const box = (it) => {
    const on = !!it.done, temp = isTemp(it.id);
    return (
      <button type="button" role="checkbox" aria-checked={on} data-todo-toggle disabled={temp}
        aria-label={on ? `Done: ${it.title}. Untick to reopen` : `Mark done: ${it.title}`}
        title={on ? "Untick to reopen" : "Mark done"}
        onClick={() => mutate(it.id, { done: !on }, on ? "The to-do could not be reopened." : "The to-do could not be marked done.")}
        className="pmo-focusable"
        style={{ width:20, height:20, borderRadius:5, flexShrink:0, padding:0, marginTop:1,
          cursor: temp ? "default" : "pointer", display:"inline-flex", alignItems:"center", justifyContent:"center",
          background: on ? DATA.positive : "transparent",
          border:`1.5px solid ${on ? DATA.positive : hot === it.id ? DATA.positive : T.borderStrong}`,
          transition:`background ${MOTION.fast}, border-color ${MOTION.fast}` }}>
        {on && <Check size={13} color="#fff" strokeWidth={3} />}
      </button>
    );
  };

  const chip = (it) => {
    const tone = dueTone(it.due_date, today);
    const c = TONE[tone];
    const n = tone ? daysUntil(it.due_date, today) : 0;
    const hint = tone === "overdue" ? `${-n} day${n === -1 ? "" : "s"} overdue · click to change`
               : tone === "upcoming" ? `In ${n} day${n === 1 ? "" : "s"} · click to change` : "Click to change";
    if (!tone) {
      return (
        <button type="button" data-todo-due data-todo-due-tone="none" disabled={isTemp(it.id)}
          onClick={() => setEditing({ id: it.id, field: "due" })} className="pmo-focusable"
          style={{ ...plainBtn, display:"inline-flex", alignItems:"center", gap:4, ...TYPE.caption, color:T.dim,
            padding:"2px 6px", borderRadius:R.pill, opacity: touch || hot === it.id ? 1 : 0,
            transition:`opacity ${MOTION.fast}` }}>
          <CalendarClock size={11} /> Add due date
        </button>
      );
    }
    return (
      <button type="button" data-todo-due data-todo-due-tone={tone} title={hint} disabled={isTemp(it.id)}
        onClick={() => setEditing({ id: it.id, field: "due" })} className="pmo-focusable"
        style={{ ...plainBtn, display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap",
          ...TYPE.caption, fontWeight: c ? 700 : 500, padding:"2px 8px", borderRadius:R.pill,
          color: c ? T.textOf(c) : T.muted, background: c ? `${c}${T.badge}` : T.card2,
          border:`1px solid ${c ? `${c}44` : T.border}` }}>
        {dueText(it.due_date, today)}
      </button>
    );
  };

  const removeAsk = (it) => (
    <span data-todo-remove-ask style={{ display:"inline-flex", alignItems:"center", gap:SP.xs, flexWrap:"wrap" }}
      onKeyDown={e => { if (e.key === "Escape") setConfirm(null); }}>
      <span style={{ ...TYPE.caption, fontWeight:700, color:T.textOf(DATA.danger) }}>Remove?</span>
      <Button T={T} size="sm" variant="danger" data-todo-remove-confirm autoFocus
        onClick={() => { setConfirm(null); mutate(it.id, { removed: true }, "The to-do could not be removed."); }}>Remove</Button>
      <Button T={T} size="sm" variant="subtle" onClick={() => setConfirm(null)}>Keep</Button>
    </span>
  );

  const meta = (it) => {
    if (confirmId === it.id) return removeAsk(it);
    if (editing?.id === it.id && editing.field === "due") return <DueEditor T={T} value={it.due_date} scheme={dateScheme} inp={inp}
      onDone={(v) => { setEditing(null); if (v !== undefined && (v || null) !== (it.due_date || null))
        mutate(it.id, { due_date: v || null }, "The due date could not be saved."); }} />;
    return chip(it);
  };

  const rowEvents = (id) => ({
    ...(CAN_HOVER ? { onMouseEnter: () => setHot(id), onMouseLeave: () => setHot(h => h === id ? null : h) } : {}),
    onFocus: () => setHot(id),
    onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHot(h => h === id ? null : h); },
  });

  const openRow = (it, i) => {
    const isEditTitle = editing?.id === it.id && editing.field === "title";
    const temp = isTemp(it.id);
    const tone = dueTone(it.due_date, today);
    const title = isEditTitle ? (
      <TitleEditor T={T} value={it.title} inp={inp}
        onDone={(v) => {
          setEditing(null);
          if (v === undefined || v === it.title) return;
          const t = cleanTitle(v);
          if (!t) { setErr("A to-do needs some text. To take it off the list, use Remove."); return; }
          if (t !== it.title) mutate(it.id, { title: t }, "The change to the text could not be saved.");
        }} />
    ) : (
      <button type="button" data-todo-title disabled={temp} title={temp ? "Saving…" : "Click to edit"}
        onClick={() => setEditing({ id: it.id, field: "title" })} className="pmo-focusable"
        style={{ ...plainBtn, cursor: temp ? "default" : "text", textAlign:"left", display:"block", maxWidth:"100%",
          fontSize:13.5, lineHeight:1.45, fontWeight:500, color:T.text, overflowWrap:"anywhere", whiteSpace:"pre-wrap",
          opacity: temp ? 0.6 : 1, borderRadius:R.sm }}>
        {it.title}
      </button>
    );
    const removeBtn = confirmId !== it.id && (
      <button type="button" data-todo-remove disabled={temp} aria-label={`Remove: ${it.title}`} title="Remove"
        onClick={() => setConfirm(it.id)} className="pmo-focusable pmo-btn"
        style={{ ...plainBtn, width:28, height:28, flexShrink:0, borderRadius:R.sm, color:T.dim,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          opacity: touch || hot === it.id ? 1 : 0, transition:`opacity ${MOTION.fast}` }}>
        <X size={14} />
      </button>
    );
    return (
      <div key={it.id} role="listitem" data-todo-item data-todo-id={it.id} data-todo-done="false"
        data-todo-tone={tone || "none"} {...rowEvents(it.id)}
        style={{ display:"flex", alignItems: isCompact ? "flex-start" : "center", gap:SP.md,
          padding: isCompact ? "10px 12px" : "8px 14px", borderTop: i ? `1px solid ${T.border}` : "none",
          background: hot === it.id ? T.rowHover : "transparent", transition:`background ${MOTION.fast}`,
          boxShadow: tone === "overdue" ? `inset 3px 0 0 ${DATA.danger}` : tone === "today" ? `inset 3px 0 0 ${DATA.warning}` : "none" }}>
        {box(it)}
        <div style={{ flex:1, minWidth:0 }}>
          {title}
          {isCompact && <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:SP.sm, alignItems:"center" }}>{meta(it)}</div>}
        </div>
        {!isCompact && <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:SP.sm }}>{meta(it)}</div>}
        {removeBtn}
      </div>
    );
  };

  const doneRow = (it, i) => (
    <div key={it.id} role="listitem" data-todo-item data-todo-id={it.id} data-todo-done="true" {...rowEvents(it.id)}
      style={{ display:"flex", alignItems:"flex-start", gap:SP.md, padding: isCompact ? "9px 12px" : "7px 14px",
        borderTop: i ? `1px solid ${T.border}` : "none",
        background: hot === it.id ? T.rowHover : "transparent", transition:`background ${MOTION.fast}` }}>
      {box(it)}
      <div style={{ flex:1, minWidth:0, display:"flex", flexWrap:"wrap", alignItems:"baseline", columnGap:SP.sm, rowGap:2 }}>
        <span style={{ fontSize:13, lineHeight:1.45, color:T.muted, textDecoration:"line-through",
          textDecorationColor:`${T.muted}99`, overflowWrap:"anywhere", whiteSpace:"pre-wrap", minWidth:0 }}>{it.title}</span>
        <span data-todo-done-at style={{ ...TYPE.caption, color:T.textOf(DATA.positive), whiteSpace:"nowrap" }}>
          {doneText(it.done_at, today)}
        </span>
      </div>
    </div>
  );

  const listBox = { border:`1px solid ${T.border}`, borderRadius:R.lg, overflow:"hidden", background:T.surface };

  return (
    <div data-todo-list style={{ maxWidth:860, minWidth:0 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap", marginBottom:2 }}>
        <ListTodo size={16} color={T.textOf(BRAND.gold)} />
        <h3 style={{ ...TYPE.h2, color:T.text, margin:0 }}>To-Do List</h3>
        {items && (
          <span data-todo-counts style={{ ...TYPE.caption, color:T.muted }}>
            <b style={{ color:T.text, fontWeight:700 }}>{open.length}</b> open · <b style={{ color:T.textOf(DATA.positive), fontWeight:700 }}>{done.length}</b> done
          </span>
        )}
      </div>
      <div style={{ ...TYPE.caption, color:T.dim, display:"flex", alignItems:"center", gap:5, marginBottom:SP.md }}>
        <Lock size={11} /> Only the PMO sees this list.
      </div>

      {/* Add */}
      <form data-todo-add-form onSubmit={e => { e.preventDefault(); add(); }}
        style={{ display:"flex", gap:SP.sm, flexWrap:"wrap", alignItems:"center", marginBottom:SP.md }}>
        <input ref={addRef} data-todo-input value={draft} maxLength={TODO_MAX} placeholder="Add a to-do…"
          aria-label="New to-do" disabled={items === null}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") { setDraft(""); setDraftDue(""); } }}
          style={{ ...inp, flex:"1 1 240px" }} />
        <label style={{ display:"inline-flex", alignItems:"center", gap:6, flex: isCompact ? "1 1 150px" : "0 0 auto", minWidth:0 }}>
          <span style={{ ...TYPE.caption, color:T.muted, whiteSpace:"nowrap" }}>Due</span>
          <input type="date" data-todo-new-due value={draftDue} aria-label="Due date (optional)" disabled={items === null}
            onChange={e => setDraftDue(e.target.value)}
            style={{ ...inp, padding:"7px 8px", colorScheme:dateScheme, flex: isCompact ? 1 : "0 0 auto", width: isCompact ? "auto" : 150 }} />
        </label>
        <Button T={T} type="submit" variant="primary" icon={Plus} disabled={!canAdd || items === null} data-todo-add>Add</Button>
      </form>

      {err && (
        <div data-todo-error role="alert" style={{ display:"flex", alignItems:"flex-start", gap:SP.sm, marginBottom:SP.sm,
          fontSize:12.5, lineHeight:1.5, color:T.textOf(DATA.danger) }}>
          <span style={{ flex:1, minWidth:0 }}>{err}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setErr(null)} className="pmo-focusable"
            style={{ ...plainBtn, color:T.dim, padding:2, display:"inline-flex" }}><X size={13} /></button>
        </div>
      )}

      {items === null ? (
        <div data-todo-loading aria-busy="true" style={{ ...listBox, padding:SP.md, display:"flex", flexDirection:"column", gap:SP.sm }}>
          {[0, 1, 2].map(i => <Skeleton key={i} T={T} h={30} style={{ opacity: 1 - i * 0.2, animationDelay:`${i * 60}ms` }} />)}
        </div>
      ) : loadErr ? (
        <div data-todo-load-error style={{ ...listBox, padding:SP.lg, display:"flex", gap:SP.md, alignItems:"center", flexWrap:"wrap",
          fontSize:12.5, color:T.textOf(DATA.danger) }}>
          <span style={{ flex:1, minWidth:200 }}>The list could not be loaded. Check the connection and try again.</span>
          <Button T={T} size="sm" variant="ghost" onClick={() => { setItems(null); load(); }}>Try again</Button>
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <div data-todo-empty style={{ padding:SP.xl, textAlign:"center", borderRadius:R.md, border:`1px dashed ${T.borderStrong}`,
          color:T.muted, fontSize:13, lineHeight:1.6 }}>
          No to-dos yet. Add the first one above.
        </div>
      ) : (
        <>
          {open.length > 0 ? (
            <div role="list" aria-label="Open to-dos" data-todo-open style={listBox}>{open.map(openRow)}</div>
          ) : (
            <div data-todo-all-done style={{ padding:SP.lg, textAlign:"center", borderRadius:R.md, border:`1px dashed ${T.borderStrong}`,
              color:T.muted, fontSize:13 }}>
              Nothing open. Everything on this list is done.
            </div>
          )}

          {done.length > 0 && (
            <div style={{ marginTop:SP.md }}>
              <button type="button" data-todo-done-toggle aria-expanded={showDone} onClick={() => setShowDone(v => !v)}
                className="pmo-focusable"
                style={{ ...plainBtn, display:"inline-flex", alignItems:"center", gap:6, padding:"4px 2px", borderRadius:R.sm,
                  ...TYPE.label, fontSize:10.5, color:T.muted }}>
                <ChevronDown size={13} style={{ transform: showDone ? "none" : "rotate(-90deg)", transition:`transform ${MOTION.fast}` }} />
                Done ({done.length})
              </button>
              {showDone && (
                <div role="list" aria-label="Done to-dos" data-todo-done-list style={{ ...listBox, marginTop:SP.xs }}>
                  {done.map(doneRow)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Inline text editor: Enter saves, Escape cancels, leaving the box saves.
function TitleEditor({ T, value, inp, onDone }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  const settled = useRef(false);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const finish = (out) => { if (settled.current) return; settled.current = true; onDone(out); };
  return (
    <input ref={ref} data-todo-edit value={v} maxLength={TODO_MAX} aria-label="Edit to-do"
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); finish(v); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(undefined); }
      }}
      onBlur={() => finish(v)}
      style={{ ...inp, width:"100%", padding:"5px 8px", fontSize:13.5, borderColor:T.inputFocus }} />
  );
}

// Inline date editor: picking or typing a date and leaving the box saves; Enter
// saves; Escape cancels; Clear removes the due date.
function DueEditor({ T, value, scheme, inp, onDone }) {
  const [v, setV] = useState(value || "");
  const ref = useRef(null);
  const settled = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* not allowed without a fresh click on some browsers */ }
  }, []);
  const finish = (out) => { if (settled.current) return; settled.current = true; onDone(out); };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:SP.xs, flexWrap:"wrap" }}>
      <input ref={ref} type="date" data-todo-due-edit value={v} aria-label="Due date"
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); finish(v); }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(undefined); }
        }}
        onBlur={() => finish(v)}
        style={{ ...inp, padding:"4px 7px", fontSize:12.5, colorScheme:scheme, borderColor:T.inputFocus }} />
      {value && (
        // mousedown is held back so the date box keeps focus and does not save first.
        <Button T={T} size="sm" variant="subtle" data-todo-due-clear onMouseDown={e => e.preventDefault()}
          onClick={() => finish("")}>Clear</Button>
      )}
    </span>
  );
}
