// Portfolio demo: what the portal's server functions would do. Nothing is sent from the demo: each one
// says, in a short message, what a real deployment would do at this point; a few (adding a user,
// removing one) change the demo's own data so the page carries on as it would.
// Returns { status, body, note?, writes? } (writes: [{ table, op, row, old }] already made, to be logged
// and saved), or null for "answered generically".
const ok = (body = { ok: true }) => ({ status: 200, body });
const said = (note, body) => ({ ...ok(body), note });

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const NOTES = {
  "notify-comment": "In your deployment this would e-mail and push a notification to the project's managers about this update.",
  "notify-past": "In your deployment this would e-mail the manager (or the PMO) about this follow-up, with a link to the conversation.",
  "notify-update": "In your deployment this would e-mail the project's managers asking for an update, and the PMO when they answer.",
  "send-push": "In your deployment this would send a push notification to the person's phone and computer.",
  "send-deadline-email": "In your deployment this would e-mail the project manager about the deadline, from your PMO's address.",
  "send-pdd-reminders": "In your deployment this would remind the project managers to submit their proposals.",
  "send-welcome-email": "In your deployment this would send the welcome e-mail with sign-in steps and the person's projects.",
  "board-report-notify": "In your deployment this would notify the people the report is shared with (push and e-mail).",
  "epdd-sync": "In your deployment new proposals are read from your proposal system every few minutes and checked automatically.",
  "pcr-extract": "In your deployment an AI reader would read this change-request document and fill in the figures for you to confirm.",
  "deliverables-extract": "In your deployment an AI reader would read the charter and list its deliverables for you to confirm.",
  "reset-user-password": "In your deployment this would set the new password. Passwords are not real in the demo.",
  "webauthn": "Passkeys (Face ID / fingerprint sign-in) work on your own deployment's address, not in the demo.",
};

export function serverFeature(name, body, me, t) {
  const b = body && typeof body === "object" ? body : {};
  if (name === "files") {
    // Documents are kept in the page; the portal falls back to its standard storage calls.
    if (b.action === "sign") return ok({ urls: {} });
    if (b.action === "list") return ok({ files: [] });
    if (b.action === "upload") return ok({});
    return ok();
  }
  if (me.role !== "pmo" && ["invite-user", "delete-user", "reset-user-password", "send-welcome-email", "epdd-sync", "pcr-extract", "deliverables-extract", "send-pdd-reminders"].includes(name)) {
    return { status: 403, body: { error: "Only the PMO can do this." } };
  }
  if (name === "invite-user") {
    const users = t.user_profiles || (t.user_profiles = []);
    const username = String(b.username || "").trim();
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return { status: 400, body: { error: "That username is already taken." } };
    const row = { id: uuid(), username, full_name: String(b.full_name || "").trim() || null, role: b.role || "project_manager",
      email: "demo-user@example.org", phone: null, is_active: true, notify_email: true, whatsapp_opt_in: false, created_at: nowIso(),
      tutorial_offered_at: null, tutorial_last_step: null, tutorial_completed_at: null, tutorial_dismissed_at: null };
    users.push(row);
    return { ...ok({ ok: true, no_email_mode: !b.send_email, email_sent: !!b.send_email }), writes: [{ table: "user_profiles", op: "INSERT", row }],
      note: b.send_email ? "Added to the demo. In your deployment this would also send the invitation e-mail." : "Added to the demo." };
  }
  if (name === "delete-user") {
    const users = t.user_profiles || [];
    const i = users.findIndex((u) => u.id === b.user_id);
    if (i < 0) return { status: 404, body: { error: "User not found" } };
    if (users[i].id === me.id || users[i].role === "pmo") return { status: 400, body: { error: "The PMO account can't be deleted." } };
    const [old] = users.splice(i, 1);
    t.project_assignments = (t.project_assignments || []).filter((a) => a.user_id !== old.id);
    return { ...ok({ ok: true }), writes: [{ table: "user_profiles", op: "DELETE", old }], note: "Removed from the demo." };
  }
  if (name === "epdd-sync") return said(NOTES[name], { ok: true, demo: true, new: 0, changed: 0 });
  if (name === "pcr-extract" || name === "deliverables-extract") return { status: 200, body: { ok: false, error: NOTES[name] } };
  if (name === "webauthn") return { status: 400, body: { error: NOTES[name] } };
  if (NOTES[name]) return said(NOTES[name], { ok: true, demo: true, sent: 0 });
  return null;
}
