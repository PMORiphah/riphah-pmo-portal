// send-welcome-email — the PMO invites a project manager to the portal (PMO, 8 Oct 2026).
//
// PMO only. Called from User Management → Welcome email after the PMO has seen
// the preview, with
//   { user_id, note?, password?, mode: "preview" | "test" | "send" }
// preview  returns the email for that person and sends nothing;
// test     sends it to the PMO who pressed the button only ("[Test]" subject,
//          no CC, the password shown but not set);
// send     sends it to the person, copied to the CC list kept in the PMO-only
//          setting `welcome_email` ({cc: [...], password}) that the PMO edits
//          in the window. With `password`, that password is set on their
//          account first (same as Reset password); if that fails, nothing is sent.
// Nothing is ever sent automatically (rule: PMs are emailed only when the PMO
// presses Send on a previewed message). Logged in notifications_log as
// channel "welcome-email" (the password is never logged).
import { composeWelcome, type WelcomeProject, type PastProject } from "./email.ts";
import { mail, log, PORTAL_URL, type Ctx } from "../epdd-sync/notify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;
// The screenshots in the email, served from the commit that added them (works
// before and after a site deploy; the same files are in public/email).
const IMG_BASE = "https://raw.githubusercontent.com/PMORiphah/riphah-pmo-portal/cdbd095a8789ef6b98e5ff0d121dd7a5a1254fc3/public/";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (p: string, i: RequestInit = {}) =>
    fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...svc, ...(i.headers ?? {}) } });
  const ctx: Ctx = { SUPA, SVC, rest };
  const auth = req.headers.get("authorization") ?? "";

  // The caller must be a signed-in PMO.
  const me = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!me?.id) return json({ error: "Unauthorized" }, 401);
  const isPmo = await fetch(`${SUPA}/rest/v1/rpc/is_pmo`, { method: "POST",
    headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" } })
    .then(r => r.json()).catch(() => false);
  if (isPmo !== true) return json({ error: "Forbidden: PMO role required" }, 403);

  const body = await req.json().catch(() => ({})) as { user_id?: string; note?: string; password?: string; mode?: string };
  const id = String(body.user_id ?? "");
  const mode = body.mode === "send" ? "send" : body.mode === "test" ? "test" : "preview";
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "user_id required" }, 400);
  const note = String(body.note ?? "").slice(0, 600);
  const password = body.password ? String(body.password) : "";
  if (password && password.length < 8) return json({ error: "The password must be at least 8 characters." }, 400);

  const person = ((await (await rest(`user_profiles?id=eq.${id}&select=id,username,full_name,email,role,is_active`)).json()) as Row[])?.[0];
  if (!person) return json({ error: "User not found" }, 404);
  if (person.role === "pmo") return json({ error: "PMO accounts don't get a welcome email." }, 400);
  if (!person.is_active) return json({ error: "This account is deactivated. Activate it first." }, 400);
  const email = String(person.email ?? "").trim();
  if (!email) return json({ error: "This user has no email address." }, 400);

  const assigned = (await (await rest(`project_assignments?user_id=eq.${id}&select=projects(code,name,campus,workflow_stage,start_date)`)).json()) as Row[];
  const projects = (Array.isArray(assigned) ? assigned : []).map(r => r.projects as WelcomeProject).filter(Boolean);
  const pastRows = (await (await rest(`past_projects?pm_user_id=eq.${id}&select=code,name,fiscal_year,campus`)).json()) as PastProject[];
  const past = Array.isArray(pastRows) ? pastRows : [];
  const setting = ((await (await rest("settings?key=eq.welcome_email&select=value")).json()) as Row[])?.[0]?.value as Row | undefined;
  const cc = [...new Set((Array.isArray(setting?.cc) ? setting!.cc as unknown[] : []).map(x => String(x).trim().toLowerCase())
    .filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];

  const name = String(person.full_name || person.username);
  const e = composeWelcome({ name, username: String(person.username), projects, past, password: password || null,
    note, imgBase: IMG_BASE, portalUrl: PORTAL_URL });

  if (mode === "preview") return json({ ok: true, to: email, cc, ...e });

  if (mode === "test") {
    const pmo = ((await (await rest(`user_profiles?id=eq.${me.id}&select=id,email,full_name,username`)).json()) as Row[])?.[0];
    const to = String(pmo?.email ?? me.email ?? "").trim();
    if (!to) return json({ error: "Your own account has no email address." }, 400);
    const sent = await mail([{ id: String(me.id), email: to, name: String(pmo?.full_name || pmo?.username || "PMO") }],
      `[Test] ${e.subject}`, e.text, e.html, false);
    await log(ctx, [{ recipient_id: me.id, recipient_address: to, channel: "welcome-email",
      status: sent[0]?.ok ? "sent" : "failed", detail: `test for ${person.username}${sent[0]?.error ? `: ${sent[0].error}` : ""}` }]);
    return sent[0]?.ok ? json({ ok: true, sent_to: to, test: true }) : json({ error: sent[0]?.error ?? "Sending failed" }, 502);
  }

  // Send: set the temporary password first, so the email never shows one that doesn't work.
  if (password) {
    const r = await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: "PUT", headers: svc,
      body: JSON.stringify({ password, email_confirm: true }) });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as Row;
      return json({ error: `Could not set the password: ${err.message ?? err.msg ?? r.status}. Nothing was sent.` }, 400);
    }
  }
  const sent = await mail([{ id, email, name }], e.subject, e.text, e.html, cc);
  await log(ctx, [{ recipient_id: id, recipient_address: email, channel: "welcome-email",
    status: sent[0]?.ok ? "sent" : "failed",
    detail: `by ${me.id}; ${projects.length}+${past.length} projects; cc ${sent[0]?.cc ?? 0}; password ${password ? "set and included" : "not included"}${sent[0]?.error ? `; ${sent[0].error}` : ""}` }]);
  return sent[0]?.ok ? json({ ok: true, sent_to: email, cc: sent[0]?.cc ?? 0, password_set: !!password })
    : json({ error: `${sent[0]?.error ?? "Sending failed"}${password ? " (the new password was already set)" : ""}` }, 502);
});
