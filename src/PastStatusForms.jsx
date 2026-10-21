import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Hourglass, CheckCircle2, Send, Mail, BellRing } from "lucide-react";
import { TYPE, SP, R, BRAND, DATA } from "./theme.js";
import { Button, Modal } from "./ui.jsx";
import { notifyPast, askedAgo, shortDate, firstName, noteOf, REQUEST_BODY, MIN_WHY, justSent,
         AskedChip, PctChip, PctRing } from "./PastStatus.jsx";
import { chars, plainError } from "./updateKinds.js";

/* Past Projects "Ask status" (PMO, 20 Oct 2026): the window that asks and the
   manager's answer form. A lazy chunk (PastProjects.jsx loads it when one of
   them opens); the chips, cards and thread rules stay in PastStatus.jsx. */


/* ── Ask status (PMO or a past viewer): one project, a reminder, or all of a
   manager's open projects in one go. One POST with every row (identical keys,
   PGRST102), then one notify-past call with all the ids, so the manager gets a
   single email listing them. ──────────────────────────────────────────── */
export function AskStatusModal({ T, session, supa, pmName, projects, remind = false, viewer = false, isCompact, onClose, onSent }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const [done, setDone] = useState(false);
  const n = projects.length, bulk = n > 1, one = projects[0];
  const pm = pmName || "The project manager";
  // A bulk request also goes to projects already waiting: for those it is a reminder, said before Send.
  const already = bulk ? projects.filter(p => p.status_pending_since).length : 0;

  const send = async () => {
    setBusy(true); setErr(null);
    const body = note.trim() ? `${REQUEST_BODY}\n${note.trim()}` : REQUEST_BODY;
    try {
      const created = await supa("/rest/v1/past_project_updates", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify(projects.map(p => ({
          past_project_id: p.id, author_id: session.user_id,
          author_name: session.full_name || session.username, author_role: session.role,
          body, kind:"status_request",
        }))),
      }, session.access_token);
      notifyPast(supa, session, "status_request", (Array.isArray(created) ? created : [created]).map(r => r?.id));
      setDone(true); onSent?.();
    } catch (e) {
      setErr(plainError(e, { rls:"Only the PMO and the past-project viewers can ask for a status.",
        fallback:"The request could not be sent. Please try again." }));
    }
    setBusy(false);
  };

  const who = viewer ? `${pm} and the PMO are emailed.` : `${pm} is emailed.`;
  const title = done ? "Request sent" : remind ? `Remind ${firstName(pmName)}` : bulk ? `Ask status on ${n} open projects` : "Ask status";
  // 16px on phones: iOS zooms the page into any smaller field.
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm, padding:"9px 11px",
    fontSize: isCompact ? 16 : 13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none", width:"100%", boxSizing:"border-box",
    resize:"vertical", lineHeight:1.55 };

  return createPortal(
    <Modal T={T} isMobile={isCompact} width={520} icon={done ? CheckCircle2 : remind ? BellRing : ClipboardList}
      onClose={busy ? undefined : onClose} title={title}
      sub={bulk ? pm : one?.name}
      footer={done ? (
        <Button T={T} variant="primary" onClick={onClose}>Done</Button>
      ) : (<>
        <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button T={T} variant="primary" icon={remind ? BellRing : Send} onClick={send} loading={busy}>
          {remind ? "Send reminder" : bulk ? `Send to ${firstName(pmName)}` : "Send request"}
        </Button>
      </>)}>
      {done ? (
        <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.65 }}>
          {bulk ? `The request is on each of the ${n} projects' Follow-up threads. ${pm} gets one email listing them all.`
                : `The request is on the project's Follow-up thread. ${who}`}
          {" "}It shows as <b>Status requested</b> until {firstName(pmName)} answers.
        </div>
      ) : (<>
        <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.65 }}>
          {remind ? <>Remind <b>{pm}</b> that the status of <b>{one?.name}</b> is still awaited (asked {askedAgo(one?.status_pending_since)}):
                      % completed and a justification.</>
            : bulk ? <>Ask <b>{pm}</b> for the status of these {n} open projects: % completed and a justification on each.</>
            : <>Ask <b>{pm}</b> for the status of <b>{one?.name}</b>: % completed and a justification.</>}
          {already > 0 && (
            <span data-already> {already === n ? `All ${n} were already asked; they get a reminder.`
              : `${already} of these ${already === 1 ? "was" : "were"} already asked; ${already === 1 ? "it gets" : "they get"} a reminder.`}</span>
          )}
        </div>

        {bulk && (
          <div className="pmo-scroll" style={{ marginTop:SP.md, maxHeight:232, overflow:"auto", borderRadius:R.md,
            border:`1px solid ${T.border}`, background:T.card2 }}>
            {projects.map((p, i) => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:SP.sm, padding:"7px 11px",
                borderTop: i ? `1px solid ${T.border}` : "none", flexWrap: isCompact ? "wrap" : "nowrap" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {p.code && <div style={{ ...TYPE.mono, fontSize:9.5, color:T.dim }}>{p.code}</div>}
                  <div style={{ fontSize:12.5, color:T.text, overflowWrap:"anywhere" }}>{p.name}</div>
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  <AskedChip T={T} row={p} short />
                  <PctChip T={T} row={p} />
                </div>
              </div>
            ))}
          </div>
        )}

        <label style={{ display:"block", marginTop:SP.lg }}>
          <div style={{ fontSize:11.5, color:T.muted, marginBottom:4 }}>Note for {firstName(pmName)} (optional)</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} disabled={busy}
            placeholder="Anything in particular you need to know…" style={inp} />
        </label>
        <div style={{ ...TYPE.caption, color:T.dim, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
          <Mail size={11} /> {bulk ? `One email to ${pm} listing all ${n}${viewer ? ", copied to the PMO" : ""}.` : who}
        </div>
        {err && (
          <div role="alert" style={{ marginTop:SP.md, padding:"9px 12px", borderRadius:R.sm, background:`${DATA.danger}14`,
            border:`1px solid ${DATA.danger}3D`, fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
        )}
      </>)}
    </Modal>,
    document.body
  );
}


/* ── The manager's answer, at the top of the Follow-up tab ──────────────────
   The Follow-up panel remounts whenever the project row changes (any post
   touches it), so an unsent answer is kept here, per person and project, for
   as long as the tab is open. ──────────────────────────────────────────── */
const drafts = new Map();

export function StatusAnswerForm({ T, session, supa, row, pending = [], isCompact, onSent }) {
  const key = `${session.user_id}:${row.id}`;
  const [f, setF] = useState(() => drafts.get(key) || { pct:"", why:"" });
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const pctRef = useRef(null), whyRef = useRef(null);
  const set = (k, v) => setF(s => { const n = { ...s, [k]: v }; drafts.set(key, n); return n; });

  const num = f.pct === "" ? null : Number(f.pct);
  const pctErr = num == null ? "Enter % completed, 0 to 100."
    : !Number.isInteger(num) || num < 0 || num > 100 ? "Use a whole number from 0 to 100." : null;
  // Counted as the database counts (characters, so an emoji is one).
  const why = f.why.trim(), whyLen = chars(why);
  const whyErr = whyLen >= MIN_WHY ? null
    : whyLen ? `At least ${MIN_WHY} characters (${whyLen} so far).` : "Write a justification.";
  const showPct = (tried || touched.pct) && pctErr, showWhy = (tried || touched.why) && whyErr;

  // Who asked and when: the requests still waiting, else the summary row.
  const askers = [...new Set(pending.map(m => m.author_name).filter(Boolean))];
  const asker = askers.length ? askers.join(" and ") : row.status_requested_by || "the PMO";
  const askedAt = pending.length ? pending[pending.length - 1].created_at : row.status_requested_at || row.status_pending_since;
  const firstAt = pending.length ? pending[0].created_at : row.status_pending_since;
  const notes = pending.map(m => ({ by: m.author_name, text: noteOf(m.body), id: m.id })).filter(x => x.text);
  // A viewer who asked is emailed with the PMO (notify-past).
  const others = [...new Set(pending.filter(m => m.author_role !== "pmo").map(m => m.author_name).filter(Boolean))];

  const submit = async () => {
    setTried(true);
    if (busy) return;
    // As on the FY form: the button stays on and takes the manager to the first field still wrong.
    if (pctErr || whyErr) { (pctErr ? pctRef : whyRef).current?.focus(); return; }
    setBusy(true); setErr(null);
    try {
      const created = await supa("/rest/v1/past_project_updates", {
        method:"POST", headers:{ Prefer:"return=representation" },
        body: JSON.stringify({
          past_project_id: row.id, author_id: session.user_id,
          author_name: session.full_name || session.username, author_role: session.role,
          kind:"status", pct_complete: num, justification: why,
          body: `Status: ${num}% completed. ${why}`,
        }),
      }, session.access_token);
      notifyPast(supa, session, "status", Array.isArray(created) ? created[0]?.id : created?.id);
      drafts.delete(key); justSent.set(row.id, Date.now());
      setBusy(false);
      onSent?.();
      return;
    } catch (e) {
      const refused = "Only this project's manager can send its status, with both fields filled in.";
      const said = plainError(e, { rls: refused, fallback:"The status could not be sent. Please try again." });
      setErr(/violates check/i.test(e?.message || "") ? refused : said);
    }
    setBusy(false);
  };

  // 16px on phones: iOS zooms the page into any smaller field.
  const inp = { background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.sm, padding:"9px 11px",
    fontSize: isCompact ? 16 : 13, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none", boxSizing:"border-box" };
  const bad = (on) => on ? { border:`1px solid ${DATA.danger}`, boxShadow:`0 0 0 1px ${DATA.danger}55` } : null;
  const errLine = (t) => <div role="alert" style={{ fontSize:11.5, color:T.textOf(DATA.danger), marginTop:4 }}>{t}</div>;
  const lab = (t) => (
    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:6 }}>
      {t} <span style={{ color:T.textOf(DATA.danger), fontWeight:600 }}>*</span>
    </div>
  );

  return (
    <section data-status-form aria-label="Send the status" className="past-row"
      style={{ marginBottom:SP.lg, padding:SP.lg, borderRadius:R.lg, background:`${DATA.warning}10`,
        border:`1px solid ${DATA.warning}66`, boxShadow:T.glowSoft(DATA.warning) }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:SP.sm, marginBottom:SP.md }}>
        <Hourglass size={16} color={T.textOf(DATA.warning)} style={{ flexShrink:0, marginTop:2 }} />
        <div style={{ minWidth:0 }}>
          <div style={{ ...TYPE.h3, color:T.text }}>Status requested by {asker} on {shortDate(askedAt)}</div>
          <div style={{ ...TYPE.caption, color:T.muted, marginTop:2 }}>
            Give % completed and a justification. Both are required.
            {pending.length > 1 ? ` Asked ${pending.length} times since ${shortDate(firstAt)}.` : ""}
          </div>
        </div>
      </div>

      {notes.map(x => (
        <div key={x.id} style={{ marginBottom:SP.md, padding:"8px 11px", borderRadius:R.sm, background:T.card2,
          borderLeft:`3px solid ${DATA.warning}`, fontSize:12.5, color:T.textSoft, lineHeight:1.55,
          whiteSpace:"pre-wrap", overflowWrap:"anywhere" }}>
          <b style={{ color:T.text }}>{x.by}:</b> {x.text}
        </div>
      ))}

      <div style={{ marginBottom:SP.md }}>
        {lab("% completed")}
        <div style={{ display:"flex", alignItems:"center", gap:SP.md }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            <input ref={pctRef} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label="% completed"
              aria-invalid={!!showPct} value={f.pct} disabled={busy}
              onChange={e => set("pct", e.target.value.replace(/\D/g, "").slice(0, 3))}
              onBlur={() => setTouched(t => ({ ...t, pct:true }))}
              style={{ ...inp, width:72, textAlign:"center", fontWeight:700, ...bad(showPct) }} />
            <span style={{ fontSize:14, fontWeight:700, color:T.muted }}>%</span>
          </div>
          {/* Dimmed until a figure exists, so its resting place at the left does not read as 0% chosen. */}
          <input type="range" min={0} max={100} step={5} aria-label="Adjust % completed" disabled={busy}
            value={num != null && num >= 0 && num <= 100 ? num : 0}
            onChange={e => { set("pct", e.target.value); setTouched(t => ({ ...t, pct:true })); }}
            style={{ flex:1, minWidth:0, accentColor:BRAND.blue, height:28, cursor:"pointer",
              opacity: f.pct === "" ? 0.4 : 1, transition:"opacity 160ms ease" }} />
          <PctRing T={T} pct={pctErr ? 0 : num} size={30} stroke={4} />
        </div>
        {showPct && errLine(pctErr)}
        {row.status_pct != null && (
          <div style={{ ...TYPE.caption, color:T.dim, marginTop:4 }}>
            Last reported: {row.status_pct}% on {shortDate(row.status_at)}.
          </div>
        )}
      </div>

      <div style={{ marginBottom:SP.md }}>
        {lab("Justification")}
        <textarea ref={whyRef} value={f.why} rows={3} disabled={busy} aria-label="Justification" aria-invalid={!!showWhy}
          onChange={e => set("why", e.target.value)} onBlur={() => setTouched(t => ({ ...t, why:true }))}
          placeholder="What is done, what is left, and why it is still open…"
          style={{ ...inp, width:"100%", resize:"vertical", lineHeight:1.55, ...bad(showWhy) }} />
        {showWhy ? errLine(whyErr) : whyLen < MIN_WHY && (
          <div style={{ ...TYPE.caption, color:T.dim, marginTop:4 }}>At least {MIN_WHY} characters.</div>
        )}
      </div>

      {err && (
        <div role="alert" style={{ marginBottom:SP.md, padding:"9px 12px", borderRadius:R.sm, background:`${DATA.danger}14`,
          border:`1px solid ${DATA.danger}3D`, fontSize:12.5, color:T.textOf(DATA.danger) }}>{err}</div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:SP.sm, flexWrap:"wrap" }}>
        <span style={{ ...TYPE.caption, color:T.dim, display:"inline-flex", alignItems:"center", gap:5, flex:"1 1 200px" }}>
          <Mail size={11} /> {others.length ? `The PMO and ${others.join(" and ")} are emailed when you send.` : "The PMO is emailed when you send."}
        </span>
        <Button T={T} variant="primary" icon={Send} onClick={submit} loading={busy}>Send status</Button>
      </div>
    </section>
  );
}
