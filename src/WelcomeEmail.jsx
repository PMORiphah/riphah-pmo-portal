import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Mail, Send, Monitor, Smartphone, KeyRound, CheckCircle2, AlertCircle, X, Plus } from "lucide-react";
import { TYPE, SP, R } from "./theme.js";
import { Button, Modal, Select } from "./ui.jsx";
import { composeWelcome } from "../supabase/functions/send-welcome-email/email.ts";

/* ═══════════════════════════════════════════════════════════════════════════
   WELCOME EMAIL (PMO, 8 Oct 2026)

   The PMO picks a project manager and sees the exact email that invites them
   to the portal: the login page with numbered pointers, the 2-minute tour,
   changing the password, what a PM does in the portal and their projects.
   Nothing goes out until the PMO presses Send (and confirms); "Send test to
   me" sends it to the PMO only. The email itself is built by the same module
   the edge function uses (supabase/functions/send-welcome-email/email.ts).
   ═══════════════════════════════════════════════════════════════════════════ */

// The CC list and the standard first password live in the PMO-only setting
// `welcome_email` ({cc: [...], password}), never in this public code.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PORTAL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const when = (s) => new Date(s).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Karachi" });

export function WelcomeEmailModal({ T, session, supa, users, assignCount, initialUserId, onClose, isMobile }) {
  // Project managers, and guests who manage projects (Waleed), largest first.
  const people = useMemo(() => users
    .filter(u => u.is_active && (u.role === "project_manager" || (u.role === "guest" && (assignCount[u.id] || 0) > 0)))
    .sort((a, b) => (assignCount[b.id] || 0) - (assignCount[a.id] || 0) || (a.full_name || a.username).localeCompare(b.full_name || b.username)),
  [users, assignCount]);
  const [uid, setUid] = useState(initialUserId && people.some(p => p.id === initialUserId) ? initialUserId : people[0]?.id || "");
  const person = people.find(p => p.id === uid) || null;

  const [data, setData] = useState({ projects: [], past: [], sent: [] });
  const [loading, setLoading] = useState(false);
  const [withPw, setWithPw] = useState(true);
  const [pw, setPw] = useState("");
  const [cfg, setCfg] = useState({ cc: [], password: "" });
  const [ccDraft, setCcDraft] = useState("");

  // The saved CC list and standard password.
  useEffect(() => {
    supa("/rest/v1/settings?key=eq.welcome_email&select=value", {}, session.access_token)
      .then(r => { const v = r?.[0]?.value || {}; const c = { cc: Array.isArray(v.cc) ? v.cc : [], password: v.password || "" }; setCfg(c); setPw(p => p || c.password); })
      .catch(() => {});
  }, [supa, session.access_token]);
  const saveCfg = async (next) => {
    setCfg(next);
    try {
      await supa("/rest/v1/settings?on_conflict=key", { method:"POST", body: JSON.stringify({ key:"welcome_email", value: next }),
        headers:{ Prefer:"resolution=merge-duplicates,return=minimal" } }, session.access_token);
    } catch (e) { setStatus({ ok:false, msg:`Could not save: ${e.message}` }); }
  };
  const addCc = () => {
    const list = ccDraft.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const bad = list.filter(x => !EMAIL_RE.test(x));
    if (bad.length) { setStatus({ ok:false, msg:`Not an email address: ${bad.join(", ")}` }); return; }
    const next = [...new Set([...cfg.cc, ...list])];
    setCcDraft(""); setStatus(null); saveCfg({ ...cfg, cc: next });
  };
  const [note, setNote] = useState("");
  const [view, setView] = useState(isMobile ? "phone" : "computer");
  const [busy, setBusy] = useState(null);       // "test" | "send"
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState(null);   // { ok, msg }

  useEffect(() => {
    if (!uid) return;
    let live = true;
    setLoading(true); setConfirm(false); setStatus(null);
    Promise.all([
      supa(`/rest/v1/project_assignments?user_id=eq.${uid}&select=projects(code,name,campus,workflow_stage,start_date)`, {}, session.access_token).catch(() => []),
      supa(`/rest/v1/past_projects?pm_user_id=eq.${uid}&select=code,name,fiscal_year,campus`, {}, session.access_token).catch(() => []),
      supa(`/rest/v1/notifications_log?channel=eq.welcome-email&recipient_id=eq.${uid}&status=eq.sent&select=created_at&order=created_at.desc&limit=3`, {}, session.access_token).catch(() => []),
    ]).then(([a, p, s]) => {
      if (!live) return;
      setData({ projects: (a || []).map(r => r.projects).filter(Boolean), past: p || [], sent: s || [] });
      setLoading(false);
    });
    return () => { live = false; };
  }, [uid, supa, session.access_token]);

  const imgBase = useMemo(() => new URL(import.meta.env.BASE_URL || "/", window.location.origin).href, []);
  const email = useMemo(() => person ? composeWelcome({
    name: person.full_name || person.username, username: person.username, projects: data.projects,
    past: data.past, password: withPw ? pw : null, note, imgBase, portalUrl: PORTAL,
  }) : null, [person, data, withPw, pw, note, imgBase]);

  // "M Fazal" → Fazal, "Maj. Shuaib Arshad Butt" → Shuaib, "Syed Ishfaq Ahmed" → Ishfaq.
  const TITLES = /^(mr|ms|mrs|dr|engr|col|maj|brig|capt|lt|gen|syed|sayed|muhammad|mohammad|m)\.?$/i;
  const first = (person?.full_name || "").split(/\s+/).find(w => w.length > 1 && !TITLES.test(w)) || person?.username || "";
  const pwOk = !withPw || pw.trim().length >= 8;

  const call = async (mode) => {
    if (!person || !pwOk) return;
    if (mode === "send" && !confirm) { setConfirm(true); return; }
    setBusy(mode); setStatus(null);
    try {
      const r = await supa("/functions/v1/send-welcome-email", { method:"POST",
        body: JSON.stringify({ user_id: person.id, note, mode, ...(withPw ? { password: pw.trim() } : {}) }) }, session.access_token);
      setStatus({ ok:true, msg: mode === "test"
        ? `Test sent to ${r.sent_to} only (no CC). Nobody's password was changed.`
        : `Sent to ${r.sent_to}${r.cc ? `, copied to ${r.cc}` : ""}.${r.password_set ? ` ${first}'s password is now the one in the email.` : ""}` });
      if (mode === "send") setData(d => ({ ...d, sent: [{ created_at: new Date().toISOString() }, ...d.sent] }));
    } catch (e) { setStatus({ ok:false, msg: e.message }); }
    setBusy(null); setConfirm(false);
  };

  const label = { ...TYPE.label, color:T.muted, display:"block", marginBottom:6 };
  const inp = { width:"100%", boxSizing:"border-box", background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:R.md,
    padding:"9px 12px", fontSize:13.5, color:T.text, fontFamily:TYPE.body.fontFamily, outline:"none" };
  const seg = (on) => ({ flex:1, padding:"8px 10px", borderRadius:R.sm, cursor:"pointer", fontSize:12.5, fontWeight:600,
    fontFamily:TYPE.body.fontFamily, border:`1px solid ${on ? T.blue : T.border}`, background: on ? `${T.blue}1F` : "transparent",
    color: on ? T.text : T.muted, display:"flex", alignItems:"center", justifyContent:"center", gap:6 });

  const controls = (
    <div style={{ display:"flex", flexDirection:"column", gap:SP.lg }}>
      <div>
        <span style={label}>Project manager</span>
        <Select T={T} full value={uid} onChange={e => setUid(e.target.value)}>
          {people.map(p => <option key={p.id} value={p.id}>{`${p.full_name || p.username} (${p.username}) · ${assignCount[p.id] || 0} project${(assignCount[p.id] || 0) === 1 ? "" : "s"}`}</option>)}
        </Select>
        {person && (
          <div style={{ ...TYPE.caption, color: person.email ? T.muted : T.textOf(T.danger), marginTop:6 }}>
            {person.email ? <>To <b style={{ color:T.text }}>{person.email}</b>{cfg.cc.length ? <>, CC {cfg.cc.length} {cfg.cc.length === 1 ? "person" : "people"}</> : null}</> : "This user has no email address."}
            {person.role === "guest" && <div style={{ marginTop:3 }}>Guest account that manages projects.</div>}
            {data.sent.length > 0 && <div style={{ marginTop:3, color:T.textOf(T.warning || "#D89840") }}>Already sent {data.sent.map(s => when(s.created_at)).join(", ")}</div>}
          </div>
        )}
      </div>

      <div>
        <span style={label}>Password in the email</span>
        <div style={{ display:"flex", gap:6 }}>
          <button type="button" className="pmo-focusable" style={seg(!withPw)} onClick={() => setWithPw(false)}>Not included</button>
          <button type="button" className="pmo-focusable" style={seg(withPw)} onClick={() => setWithPw(true)}><KeyRound size={13} />Included</button>
        </div>
        {withPw ? (
          <>
            <div style={{ display:"flex", gap:6, marginTop:8 }}>
              <input value={pw} onChange={e => setPw(e.target.value)} spellCheck={false} autoComplete="off"
                onBlur={() => { if (pw.trim().length >= 8 && pw.trim() !== cfg.password) saveCfg({ ...cfg, password: pw.trim() }); }}
                title="Saved as the standard password for every welcome email"
                style={{ ...inp, fontFamily:"Consolas,Menlo,monospace", fontWeight:700, letterSpacing:0.3 }} />
            </div>
            <div style={{ ...TYPE.caption, color: pwOk ? T.textOf(T.warning || "#D89840") : T.textOf(T.danger), marginTop:6, lineHeight:1.5 }}>
              {pwOk ? <>Pressing Send <b>replaces {first}&rsquo;s current password</b> with this one. The email asks them to change it after signing in.</>
                : "At least 8 characters."}
            </div>
          </>
        ) : (
          <div style={{ ...TYPE.caption, color:T.muted, marginTop:6, lineHeight:1.5 }}>The email says the PMO will share the password separately. Their current password is not changed.</div>
        )}
      </div>

      <div>
        <span style={label}>CC on every welcome email</span>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
          {cfg.cc.length === 0 && <span style={{ ...TYPE.caption, color:T.muted }}>Nobody yet.</span>}
          {cfg.cc.map(a => (
            <span key={a} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 4px 3px 9px", borderRadius:R.pill,
              background:T.card2 || T.inputBg, border:`1px solid ${T.border}`, fontSize:12, color:T.text, maxWidth:"100%" }}>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a}</span>
              <button type="button" className="pmo-focusable" title={`Remove ${a}`} onClick={() => saveCfg({ ...cfg, cc: cfg.cc.filter(x => x !== a) })}
                style={{ border:0, background:"transparent", color:T.muted, cursor:"pointer", padding:2, display:"flex" }}><X size={12} /></button>
            </span>
          ))}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <input value={ccDraft} onChange={e => setCcDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCc(); } }}
            placeholder="name@riphah.edu.pk" style={inp} />
          <Button T={T} variant="ghost" icon={Plus} onClick={addCc} disabled={!ccDraft.trim()}>Add</Button>
        </div>
        <div style={{ ...TYPE.caption, color:T.muted, marginTop:6 }}>Saved for every welcome email. Tests go to you only.</div>
      </div>

      <div>
        <span style={label}>A line from the PMO (optional)</span>
        <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} rows={3}
          placeholder={`e.g. We look forward to working with you on your projects this year.`}
          style={{ ...inp, resize:"vertical", lineHeight:1.5 }} />
      </div>

      {confirm && !status && (
        <div style={{ padding:"10px 12px", borderRadius:R.md, fontSize:12.5, lineHeight:1.5, background:`${T.blue}18`, color:T.text }}>
          Press <b>Confirm</b> to send this email to <b>{person?.email}</b>{cfg.cc.length ? <> (CC {cfg.cc.length})</> : null}{withPw ? <> and set this password on {first}&rsquo;s account</> : null}.
        </div>
      )}
      {status && (
        <div style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"10px 12px", borderRadius:R.md, fontSize:12.5, lineHeight:1.5,
          background: status.ok ? `${T.positive}18` : `${T.danger}18`, color: status.ok ? T.textOf(T.positive) : T.textOf(T.danger) }}>
          {status.ok ? <CheckCircle2 size={15} style={{ flexShrink:0, marginTop:1 }} /> : <AlertCircle size={15} style={{ flexShrink:0, marginTop:1 }} />}
          <span>{status.msg}</span>
        </div>
      )}
    </div>
  );

  const preview = (
    <div style={{ display:"flex", flexDirection:"column", minHeight:0, flex:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:SP.sm, marginBottom:SP.sm, flexWrap:"wrap" }}>
        <div style={{ ...TYPE.bodySm, color:T.muted, flex:1, minWidth:0 }}>
          <span style={{ color:T.dim }}>Subject </span><b style={{ color:T.text }}>{email?.subject || ""}</b>
        </div>
        {!isMobile && (
          <div style={{ display:"flex", gap:4 }}>
            <button type="button" className="pmo-focusable" style={{ ...seg(view === "computer"), flex:"none", padding:"5px 10px" }} onClick={() => setView("computer")}><Monitor size={13} />Computer</button>
            <button type="button" className="pmo-focusable" style={{ ...seg(view === "phone"), flex:"none", padding:"5px 10px" }} onClick={() => setView("phone")}><Smartphone size={13} />Phone</button>
          </div>
        )}
      </div>
      <div style={{ flex:1, minHeight: isMobile ? 520 : 0, background: T.mode === "dark" ? "#0B1424" : "#DDE6F0", borderRadius:R.lg,
        border:`1px solid ${T.border}`, display:"flex", justifyContent:"center", overflow:"hidden", position:"relative" }}>
        {loading && <div style={{ position:"absolute", top:10, right:12, ...TYPE.caption, color:T.muted }}>Loading their projects…</div>}
        {email && (
          <iframe title="Email preview" srcDoc={email.html} sandbox=""
            style={{ border:0, width: view === "phone" && !isMobile ? 390 : "100%", maxWidth:"100%", height:"100%", minHeight: isMobile ? 520 : 0,
              background:"#E8F0F8", boxShadow: view === "phone" ? "0 0 0 1px rgba(0,0,0,.08), 0 8px 30px rgba(0,0,0,.25)" : "none" }} />
        )}
      </div>
    </div>
  );

  // Above the assistant launcher (z 1200), which otherwise sits on the Send
  // button; the world behind softens as it does for other overlays.
  useEffect(() => {
    const el = document.documentElement, prev = el.dataset.overlay;
    el.dataset.overlay = "1";
    return () => { el.dataset.overlay = prev || "0"; };
  }, []);

  return createPortal(<div style={{ position:"relative", zIndex:1300 }}>
    <Modal T={T} icon={Mail} isMobile={isMobile} width={1180} onClose={onClose}
      title="Welcome email"
      sub="Invites a project manager to the portal. Nothing is sent until you press Send."
      footer={<>
        <Button T={T} variant="ghost" icon={Mail} loading={busy === "test"} disabled={!person || !!busy || !pwOk} onClick={() => call("test")}
          title="Sends this email to you only; nobody's password changes">Send test to me</Button>
        <Button T={T} variant="primary" icon={Send} loading={busy === "send"} disabled={!person?.email || !!busy || !pwOk} onClick={() => call("send")}>
          {confirm ? `Confirm: send to ${first || "them"}` : `Send to ${first || "them"}`}
        </Button>
      </>}>
      {people.length === 0 ? (
        <div style={{ color:T.muted, fontSize:13 }}>No active project managers.</div>
      ) : isMobile ? (
        <div style={{ display:"flex", flexDirection:"column", gap:SP.xl }}>{controls}{preview}</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"320px minmax(0,1fr)", gap:SP.xl, height:"68vh" }}>
          <div className="pmo-scroll" style={{ overflowY:"auto", paddingRight:4 }}>{controls}</div>
          {preview}
        </div>
      )}
    </Modal>
  </div>, document.body);
}
