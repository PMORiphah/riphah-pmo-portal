import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Check, X as XIcon } from "lucide-react";
import { Modal, Button, Select } from "./ui.jsx";
import { TYPE, SP, R } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   GOOGLE SIGN-IN LIST (PMO, 17 Nov 2026)
   The Riphah Google accounts allowed to sign in (table google_allowlist).
   Any PMO member adds project managers and guests, edits names and
   designations, switches people off. Only the super admin (Abdullah Azhar)
   adds PMO accounts or changes a role; the database refuses everyone else
   (trg_google_allowlist_guard), so the page only mirrors that rule.
   A change reaches the person's portal account straight away
   (trg_google_allowlist_sync). Passwords keep working for everyone.
   ═══════════════════════════════════════════════════════════════════════════ */

const ROLES = [["pmo", "PMO"], ["project_manager", "Project Manager"], ["guest", "Guest"]];
const roleLabel = (r) => (ROLES.find(x => x[0] === r) || [r, r])[1];
const DOMAIN = "@riphah.edu.pk";

export default function GoogleAccessList({ T, session, supa, superAdmin, users = [], isMobile, onClose, onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", designation: "", role: "project_manager" });
  const [editing, setEditing] = useState(null);   // email being edited
  const [draft, setDraft] = useState({});
  const tok = session.access_token;

  const load = useCallback(async () => {
    try { setRows(await supa("/rest/v1/google_allowlist?select=*&order=role.asc,full_name.asc", {}, tok)); }
    catch (e) { setErr(e.message); setRows([]); }
  }, [supa, tok]);
  useEffect(() => { load(); }, [load]);

  const byEmail = useMemo(() => new Map(users.map(u => [String(u.email || "").toLowerCase(), u])), [users]);
  const shown = (rows || []).filter(r => !q.trim() || `${r.full_name} ${r.email} ${r.designation || ""} ${roleLabel(r.role)}`
    .toLowerCase().includes(q.trim().toLowerCase()));

  const say = (e) => setErr(String(e?.message || e).replace(/^.*?(Only the super admin|PMO portal)/, "$1"));
  const patch = async (email, body) => {
    setBusy(email); setErr(null);
    try {
      await supa(`/rest/v1/google_allowlist?email=eq.${encodeURIComponent(email)}`,
        { method: "PATCH", body: JSON.stringify(body), headers: { Prefer: "return=minimal" } }, tok);
      await load(); onChanged?.();
    } catch (e) { say(e); }
    setBusy(null);
  };

  const add = async () => {
    setErr(null);
    const email = form.email.trim().toLowerCase();
    if (!email.endsWith(DOMAIN) || email.length <= DOMAIN.length) return setErr(`Only ${DOMAIN} addresses can sign in with Google.`);
    if (!form.full_name.trim()) return setErr("Enter the person's name.");
    if ((rows || []).some(r => r.email === email)) return setErr("This address is already on the list.");
    setBusy("add");
    try {
      await supa("/rest/v1/google_allowlist", { method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email, full_name: form.full_name.trim(), designation: form.designation.trim() || null, role: form.role }) }, tok);
      setForm({ email: "", full_name: "", designation: "", role: "project_manager" }); setAdding(false);
      await load(); onChanged?.();
    } catch (e) { say(e); }
    setBusy(null);
  };

  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.full_name} from the Google sign-in list?\n\nTheir portal account stays; they can still use a username and password if they have one.`)) return;
    setBusy(r.email); setErr(null);
    try {
      await supa(`/rest/v1/google_allowlist?email=eq.${encodeURIComponent(r.email)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, tok);
      await load(); onChanged?.();
    } catch (e) { say(e); }
    setBusy(null);
  };

  const inp = { background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm, padding: "8px 10px", fontSize: 13,
    color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none", width: "100%", boxSizing: "border-box" };
  const chip = (txt, c) => <span style={{ fontSize: 10.5, fontWeight: 700, color: c, background: `${c}1A`, padding: "2px 8px", borderRadius: R.pill, whiteSpace: "nowrap" }}>{txt}</span>;
  const roleColor = (r) => r === "pmo" ? (T.goldText || "#D89840") : r === "project_manager" ? T.blueBright : T.muted;
  const myEmail = String(users.find(u => u.id === session.user_id)?.email || "").toLowerCase();
  // Your own row is locked (nobody switches themselves off or changes their own role here).
  const canTouch = (r) => r.email !== myEmail && (superAdmin || r.role !== "pmo");

  return (
    <Modal T={T} title="Google sign-in list" isMobile={isMobile} width={900} onClose={onClose}
      sub={`${(rows || []).filter(r => r.active).length} Riphah accounts can sign in with Google · passwords keep working for everyone`}>
      <div data-google-list>
        <div style={{ ...TYPE.caption, color: T.muted, lineHeight: 1.6, marginBottom: SP.md }}>
          Only people on this list can sign in with their Riphah Google account. {superAdmin
            ? "As super admin you can add PMO accounts and change anyone's role."
            : "Any PMO member can add project managers and guests; only the super admin (Abdullah Azhar) adds PMO accounts or changes roles."}
        </div>

        <div style={{ display: "flex", gap: SP.sm, marginBottom: SP.md, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={13} color={T.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, designation…" style={{ ...inp, paddingLeft: 30 }} />
          </div>
          {!adding && <Button T={T} variant="primary" icon={Plus} onClick={() => { setAdding(true); setErr(null); }}>Add person</Button>}
        </div>

        {adding && (
          <div data-google-add style={{ border: `1px solid ${T.border}`, borderRadius: R.md, padding: SP.md, marginBottom: SP.md, background: T.card2,
            display: "grid", gap: SP.sm, gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1.2fr 1.2fr 0.9fr" }}>
            <input data-f="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={`name${DOMAIN}`} style={inp} />
            <input data-f="name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Full name" style={inp} />
            <input data-f="designation" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="Designation" style={inp} />
            <Select T={T} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
              {ROLES.filter(([k]) => superAdmin || k !== "pmo").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: SP.sm, justifyContent: "flex-end" }}>
              <Button T={T} variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>Cancel</Button>
              <Button T={T} variant="primary" icon={Check} onClick={add} loading={busy === "add"} data-google-add-save>Add to list</Button>
            </div>
          </div>
        )}

        {err && <div data-google-err style={{ ...TYPE.bodySm, color: T.textOf(T.danger), marginBottom: SP.sm }}>{err}</div>}

        {rows === null ? <div style={{ ...TYPE.bodySm, color: T.muted }}>Loading…</div> : (
          <div style={{ display: "grid", gap: 6 }}>
            {shown.map(r => {
              const acct = byEmail.get(r.email);
              const isEd = editing === r.email;
              return (
                <div key={r.email} data-google-row={r.email} style={{
                  border: `1px solid ${T.border}`, borderRadius: R.md, padding: "10px 12px", opacity: r.active ? 1 : 0.55,
                  display: "grid", gap: 8, alignItems: "center",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.6fr) minmax(0,1.2fr) auto auto",
                }}>
                  <div style={{ minWidth: 0 }}>
                    {isEd ? (
                      <input value={draft.full_name} onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} style={inp} />
                    ) : (
                      <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.full_name}</div>
                    )}
                    <div style={{ ...TYPE.caption, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.email}{acct ? "" : " · account made at first sign-in"}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {isEd ? (
                      <input value={draft.designation} onChange={e => setDraft(d => ({ ...d, designation: e.target.value }))} placeholder="Designation" style={inp} />
                    ) : <div style={{ ...TYPE.caption, color: T.textSoft }}>{r.designation || "—"}</div>}
                  </div>
                  <div>
                    {superAdmin && r.email !== myEmail ? (
                      <Select T={T} size="sm" value={r.role} disabled={busy === r.email}
                        onChange={e => { const v = e.target.value; if (window.confirm(`Change ${r.full_name} from ${roleLabel(r.role)} to ${roleLabel(v)}?`)) patch(r.email, { role: v }); }}
                        style={{ ...inp, padding: "5px 8px", cursor: "pointer", width: 150 }}>
                        {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Select>
                    ) : chip(roleLabel(r.role), roleColor(r.role))}
                    {!r.active && <span style={{ marginLeft: 6 }}>{chip("Switched off", T.muted)}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: isMobile ? "flex-start" : "flex-end", flexWrap: "wrap" }}>
                    {isEd ? (
                      <>
                        <Button T={T} size="sm" variant="primary" icon={Check} loading={busy === r.email}
                          onClick={async () => { await patch(r.email, { full_name: draft.full_name.trim() || r.full_name, designation: draft.designation.trim() || null }); setEditing(null); }}>Save</Button>
                        <Button T={T} size="sm" variant="ghost" icon={XIcon} onClick={() => setEditing(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button T={T} size="sm" variant="ghost" onClick={() => { setEditing(r.email); setDraft({ full_name: r.full_name, designation: r.designation || "" }); }}>Edit</Button>
                        {canTouch(r) && <Button T={T} size="sm" variant="ghost" disabled={busy === r.email}
                          onClick={() => patch(r.email, { active: !r.active })}>{r.active ? "Switch off" : "Switch on"}</Button>}
                        {canTouch(r) && <Button T={T} size="sm" variant="danger" disabled={busy === r.email} onClick={() => remove(r)}>Remove</Button>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!shown.length && <div style={{ ...TYPE.bodySm, color: T.muted }}>No one matches.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
