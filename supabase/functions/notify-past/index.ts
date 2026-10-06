// notify-past — email (and push) for Past Projects follow-ups (PMO, 5 Oct 2026).
//
// Called by the portal right after a message is posted, with
//   { kind: "project", id: <past_project_updates.id> }  — a project's thread, or
//   { kind: "pm",      id: <past_pm_messages.id> }       — the chat with one manager.
// The PMO writes → the project manager is emailed (team copied, MAIL_CC).
// The manager writes → the PMO is emailed (active PMO users with email on, team copied).
// One of the two past-projects viewers writes → the manager and the PMO (6 Oct 2026);
// a viewer who has written in a conversation is also emailed on later posts there.
// Only the message's own author can trigger it, once per message; {preview: true}
// returns the email without sending. The email names the manager's campus/site
// and lists their past projects (project ID + name), see email.ts.
import { composeEmail, type Row } from "./email.ts";
import { mail, push, log, pmoRecipients, toAscii, PORTAL_URL, type Ctx, type Recipient }
  from "../epdd-sync/notify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; preview?: boolean };
  const kind = body.kind === "pm" ? "pm" : body.kind === "project" ? "project" : null;
  const id = String(body.id ?? "");
  if (!kind || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "kind and id required" }, 400);

  const table = kind === "pm" ? "past_pm_messages" : "past_project_updates";
  const msg = ((await (await rest(`${table}?id=eq.${id}&select=*`)).json()) as Row[])?.[0];
  if (!msg) return json({ error: "Message not found" }, 404);
  if (msg.author_id !== u.id) return json({ error: "Only the author can send this notification" }, 403);

  // Once per message ({preview: true} only returns the email and sends nothing).
  const channel = `past-${kind}-email`;
  const done = body.preview ? [] : await (await rest(`notifications_log?channel=eq.${channel}&detail=like.${encodeURIComponent(`msg ${id}%`)}&select=id&limit=1`)).json();
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

  // The manager's past projects: their campus/site and the list the email names,
  // so they know exactly which projects the PMO is asking about.
  const theirs = pmId
    ? ((await (await rest(`past_projects?pm_user_id=eq.${pmId}&select=id,code,name,fiscal_year,campus,status&order=campus,code,name`)).json()) as Row[]) ?? []
    : [];
  const listed = kind === "pm" ? theirs : (project ? [project] : []);
  const sites = [...new Set((listed.length ? listed : theirs).map(r => String(r.campus ?? "").trim()).filter(Boolean))];
  const site = sites.join(", ") || "—";

  // Who writes decides who hears (PMO 5 Oct 2026; viewers 6 Oct 2026):
  //   PMO     → the manager;
  //   manager → the PMO;
  //   viewer  → the manager and the PMO (a viewer is one of the two guest
  //             accounts in settings.past_viewers that may ask follow-ups).
  // A viewer who has written in this conversation also hears every later post.
  const viewerIds: string[] = (((await (await rest("settings?key=eq.past_viewers&select=value")).json()) as Row[])?.[0]
    ?.value as { user_ids?: string[] } | undefined)?.user_ids ?? [];
  const fromPmo = msg.author_role === "pmo";
  const fromViewer = !fromPmo && viewerIds.includes(String(msg.author_id)) && String(msg.author_id) !== pmId;
  const thread = kind === "pm" ? `pm_user_id=eq.${pmId}` : `past_project_id=eq.${projectId}`;
  const askedHere = viewerIds.length
    ? ((await (await rest(`${table}?${thread}&author_id=in.(${viewerIds.join(",")})&select=author_id`)).json()) as Row[]) ?? []
    : [];
  const followerIds = [...new Set(askedHere.map(r => String(r.author_id)))].filter(v => v !== msg.author_id);
  const followers: Recipient[] = followerIds.length
    ? (((await (await rest(`user_profiles?id=in.(${followerIds.join(",")})&is_active=eq.true&select=id,email,full_name,username`)).json()) as Row[]) ?? [])
        .filter(r => String(r.email ?? "").trim())
        .map(r => ({ id: String(r.id), email: String(r.email).trim(), name: String(r.full_name || r.username) }))
    : [];
  const pmRecipient: Recipient[] = pm?.is_active && String(pm.email ?? "").trim() && pmId !== msg.author_id
    ? [{ id: String(pm.id), email: String(pm.email).trim(), name: String(pm.full_name || pm.username || "there") }] : [];

  const author = String(msg.author_name || (fromPmo ? "PMO" : "Project manager"));
  const pmName = String(pm?.full_name || pm?.username || "the project manager");
  const link = kind === "pm" ? `${PORTAL_URL}?pastpm=${pmId}` : `${PORTAL_URL}?past=${projectId}`;
  const base = { kind: kind as "pm" | "project", author, pmName, site, body: String(msg.body ?? ""), project, listed, projectId, link };

  // One email per group, each worded for its readers.
  const taken = new Set<string>([String(msg.author_id)]);
  const pick = (rs: Recipient[]) => rs.filter(r => !taken.has(r.id) && (taken.add(r.id), true));
  const groups: { to: Recipient[]; mail: ReturnType<typeof composeEmail>; title: string }[] = [];
  const add = (to: Recipient[], mailArgs: Parameters<typeof composeEmail>[0], title: string) => {
    const t = pick(to); if (t.length) groups.push({ to: t, mail: composeEmail({ ...mailArgs, toName: t[0].name }), title });
  };
  if (fromPmo) {
    add(pmRecipient, { ...base, fromPmo: true, toName: "" }, "PMO follow-up");
  } else if (fromViewer) {
    add(pmRecipient, { ...base, fromPmo: true, asker: author, toName: "" }, `Follow-up from ${author}`);
    add(await pmoRecipients(ctx), { ...base, fromPmo: false, asked: true, toName: "" }, `Follow-up from ${author}`);
  } else {
    add(await pmoRecipients(ctx), { ...base, fromPmo: false, toName: "" }, `Reply from ${author}`);
  }
  for (const f of followers) add([f], { ...base, fromPmo: false, greet: f.name, toName: "" }, `Reply from ${author}`);

  if (!groups.length) {
    await log(ctx, [{ channel, status: "skipped", detail: `msg ${id}: no recipient with an email address` }]);
    return json({ ok: true, sent: 0, skipped: "no recipient with an email address" });
  }
  if (body.preview) return json({ ok: true, preview: true,
    emails: groups.map(g => ({ to: g.to.map(r => r.email), subject: g.mail.subject, text: g.mail.text, html: g.mail.html })),
    // Older callers read these from the first email.
    to: groups[0].to.map(r => r.email), subject: groups[0].mail.subject, text: groups[0].mail.text, html: groups[0].mail.html });

  const sent: Awaited<ReturnType<typeof mail>> = [];
  const pushRes: unknown[] = [];
  // The team (MAIL_CC) is copied once per post, on the first email only.
  for (const [gi, g] of groups.entries()) {
    sent.push(...await mail(g.to, g.mail.subject, g.mail.text, g.mail.html, gi === 0));
    pushRes.push(await push(ctx, g.to.map(r => r.id), {
      title: g.title,
      body: `${project ? project.name : "Update requested"}: ${toAscii(String(msg.body ?? "")).slice(0, 120)}`,
      tag: kind === "pm" ? `pastpm-${pmId}` : `past-${projectId}`, url: link.replace(PORTAL_URL, "./"),
    }));
  }
  await log(ctx, sent.map(s => ({
    channel, status: s.ok ? "sent" : "failed", recipient_id: s.r.id, recipient_address: s.r.email,
    project_code: (project?.code as string) ?? null,
    detail: `msg ${id}${s.ok ? "" : `: ${s.error}`}`,
  })));
  return json({ ok: true, sent: sent.filter(s => s.ok).length, failed: sent.filter(s => !s.ok).length, push: pushRes });
});
