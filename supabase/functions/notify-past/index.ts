// notify-past — email (and push) for Past Projects follow-ups (PMO, 5 Oct 2026).
//
// Called by the portal right after a message is posted, with
//   { kind: "project", id: <past_project_updates.id> }  — a project's thread, or
//   { kind: "pm",      id: <past_pm_messages.id> }       — the chat with one manager.
// The PMO writes → the project manager is emailed (team copied, MAIL_CC).
// The manager writes → the PMO is emailed (active PMO users with email on, team copied).
// Only the message's own author can trigger it, once per message.
import { mail, push, log, pmoRecipients, toAscii, PORTAL_URL, type Ctx, type Recipient }
  from "../epdd-sync/notify.ts";

type Row = Record<string, unknown>;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (p: string, i: RequestInit = {}) =>
    fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...svc, ...(i.headers ?? {}) } });
  const ctx: Ctx = { SUPA, SVC, rest };

  // Who is calling.
  const u = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get("authorization") ?? "" } })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!u?.id) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string };
  const kind = body.kind === "pm" ? "pm" : body.kind === "project" ? "project" : null;
  const id = String(body.id ?? "");
  if (!kind || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "kind and id required" }, 400);

  const table = kind === "pm" ? "past_pm_messages" : "past_project_updates";
  const msg = ((await (await rest(`${table}?id=eq.${id}&select=*`)).json()) as Row[])?.[0];
  if (!msg) return json({ error: "Message not found" }, 404);
  if (msg.author_id !== u.id) return json({ error: "Only the author can send this notification" }, 403);

  // Once per message.
  const channel = `past-${kind}-email`;
  const done = await (await rest(`notifications_log?channel=eq.${channel}&detail=like.${encodeURIComponent(`msg ${id}%`)}&select=id&limit=1`)).json();
  if (Array.isArray(done) && done.length) return json({ ok: true, skipped: "already sent" });

  // The project (if any) and its manager.
  const projectId = (kind === "project" ? msg.past_project_id : msg.past_project_id) as string | null;
  const project = projectId
    ? ((await (await rest(`past_projects?id=eq.${projectId}&select=id,code,name,fiscal_year,campus,pm_user_id`)).json()) as Row[])?.[0] ?? null
    : null;
  const pmId = String(kind === "pm" ? msg.pm_user_id : project?.pm_user_id ?? "");
  const pm = pmId
    ? ((await (await rest(`user_profiles?id=eq.${pmId}&select=id,email,full_name,username,is_active`)).json()) as Row[])?.[0] ?? null
    : null;

  const fromPmo = msg.author_role === "pmo";
  let to: Recipient[] = [];
  if (fromPmo) {
    if (pm?.is_active && String(pm.email ?? "").trim())
      to = [{ id: String(pm.id), email: String(pm.email).trim(), name: String(pm.full_name || pm.username || "there") }];
  } else {
    to = await pmoRecipients(ctx);
  }
  if (!to.length) {
    await log(ctx, [{ channel, status: "skipped", detail: `msg ${id}: no recipient with an email address` }]);
    return json({ ok: true, sent: 0, skipped: "no recipient with an email address" });
  }

  const author = String(msg.author_name || (fromPmo ? "PMO" : "Project manager"));
  const pmName = String(pm?.full_name || pm?.username || "the project manager");
  const link = kind === "pm" ? `${PORTAL_URL}?pastpm=${pmId}` : `${PORTAL_URL}?past=${projectId}`;
  const about = project
    ? `${project.code ? `${project.code} ` : ""}${project.name} (${project.fiscal_year}${project.campus ? `, ${project.campus}` : ""})`
    : `all past projects of ${pmName}`;
  const subject = fromPmo
    ? `PMO follow-up: ${project ? project.name : "your past projects"}`
    : `Reply from ${author}: ${project ? project.name : "past projects"}`;
  const text = [
    fromPmo ? `Dear ${to[0].name},` : "Dear PMO,",
    "",
    fromPmo ? `The PMO has asked for an update on ${about}:` : `${author} replied about ${about}:`,
    "",
    String(msg.body ?? ""),
    "",
    fromPmo ? `Please reply in the portal: ${link}` : `Open the conversation: ${link}`,
    "",
    "Project Management Office",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
<p>${fromPmo ? `Dear ${esc(to[0].name)},` : "Dear PMO,"}</p>
<p>${fromPmo ? `The PMO has asked for an update on <b>${esc(about)}</b>:` : `<b>${esc(author)}</b> replied about <b>${esc(about)}</b>:`}</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #c9a227;background:#f6f8fb;white-space:pre-wrap">${esc(msg.body)}</blockquote>
<p><a href="${link}" style="display:inline-block;padding:9px 16px;background:#1f4e8c;color:#fff;text-decoration:none;border-radius:6px">${fromPmo ? "Reply in the portal" : "Open the conversation"}</a></p>
<p style="color:#6b7280;font-size:12px">Project Management Office, Riphah International University</p></div>`;

  const sent = await mail(to, subject, text, html, true);
  const pushRes = await push(ctx, to.map(r => r.id), {
    title: fromPmo ? "PMO follow-up" : `Reply from ${author}`,
    body: `${project ? project.name : "Past projects"}: ${toAscii(String(msg.body ?? "")).slice(0, 120)}`,
    tag: kind === "pm" ? `pastpm-${pmId}` : `past-${projectId}`, url: link.replace(PORTAL_URL, "./"),
  });
  await log(ctx, sent.map(s => ({
    channel, status: s.ok ? "sent" : "failed", recipient_id: s.r.id, recipient_address: s.r.email,
    project_code: (project?.code as string) ?? null,
    detail: `msg ${id}${s.ok ? "" : `: ${s.error}`}`,
  })));
  return json({ ok: true, sent: sent.filter(s => s.ok).length, failed: sent.filter(s => !s.ok).length, push: pushRes });
});
