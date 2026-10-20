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
//
// Ask status (20 Oct 2026; docs/plans/status-requests.md), see statusNotice below:
//   { kind: "status_request", ids: [<past_project_updates.id>, …] }  the PMO or a viewer
//       asked for the status of one or several projects of ONE manager → one email to
//       that manager listing them all; a viewer's request also goes to the PMO;
//   { kind: "status", id }  the manager's answer (% completed + justification) → the PMO
//       and the viewers who asked since the previous answer.
// Same rules: author only, once per post, {preview: true} returns the emails.
import { composeEmail, statusRequestEmail, statusAnswerEmail, statusNote, dayPkt, type Row } from "./email.ts";
import { mail, push, log, pmoRecipients, toAscii, PORTAL_URL, type Ctx, type Recipient, type Sent }
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

  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; ids?: unknown[]; preview?: boolean };
  if (body.kind === "status_request" || body.kind === "status") return await statusNotice(ctx, String(u.id), body.kind, body);
  const kind = body.kind === "pm" ? "pm" : body.kind === "project" ? "project" : null;
  const id = String(body.id ?? "");
  if (!kind || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "kind and id required" }, 400);

  const table = kind === "pm" ? "past_pm_messages" : "past_project_updates";
  const msg = ((await (await rest(`${table}?id=eq.${id}&select=*`)).json()) as Row[])?.[0];
  if (!msg) return json({ error: "Message not found" }, 404);
  if (msg.author_id !== u.id) return json({ error: "Only the author can send this notification" }, 403);
  // A status request or answer has its own email (kinds status_request / status), never this one.
  if (kind === "project" && (msg.kind ?? "message") !== "message")
    return json({ error: `Use kind ${msg.kind} for this post` }, 400);

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

/* ── Ask status (20 Oct 2026) ─────────────────────────────────────────────────
   status_request  one or several request posts by the caller, all on projects of
                   one manager → that manager (one email naming every project); a
                   viewer's request also → the PMO, worded for them.
   status          the caller's answer → the PMO and the viewers who asked since the
                   previous answer on that project.
   The team (MAIL_CC) is copied once per call, on the very first email. Logged
   per recipient as past-status-request-email / past-status-email with detail
   "msg <id> <id> …", which is also what makes it once per post. */
async function statusNotice(ctx: Ctx, uid: string, kind: "status_request" | "status",
                            body: { id?: string; ids?: unknown[]; preview?: boolean }) {
  const get = async (p: string) => {
    const j = await (await ctx.rest(p)).json().catch(() => null);
    return Array.isArray(j) ? j as Row[] : [];
  };
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []).map(String))];
  if (!ids.length || ids.length > 100 || ids.some(x => !/^[0-9a-f-]{36}$/.test(x)) || (kind === "status" && ids.length !== 1))
    return json({ error: kind === "status" ? "kind and id required" : "kind and ids required (1 to 100)" }, 400);

  const msgs = await get(`past_project_updates?id=in.(${ids.join(",")})&select=*&order=created_at.asc`);
  if (msgs.length !== ids.length) return json({ error: "Message not found" }, 404);
  if (msgs.some(m => m.author_id !== uid)) return json({ error: "Only the author can send this notification" }, 403);
  if (msgs.some(m => (m.kind ?? "message") !== kind))
    return json({ error: kind === "status" ? "Not a status answer" : "Not a status request" }, 400);
  // An answer without its % is never announced as "0% completed" (the page refuses it; this is the backstop).
  const pct0 = msgs[0].pct_complete;
  if (kind === "status" && (typeof pct0 !== "number" || !Number.isFinite(pct0) || pct0 < 0 || pct0 > 100))
    return json({ error: "The answer has no % completed" }, 400);

  // Once per post: a request already announced (alone or in a bulk email) is not announced again.
  const channel = kind === "status" ? "past-status-email" : "past-status-request-email";
  const done = body.preview ? [] : await get(`notifications_log?channel=eq.${channel}&or=(${ids.map(x => `detail.like.*${x}*`).join(",")})&select=id&limit=1`);
  if (done.length) return json({ ok: true, skipped: "already sent" });

  // The projects and their one manager (past_projects.pm_user_id, whatever their role).
  const pids = [...new Set(msgs.map(m => String(m.past_project_id)))];
  const projects = await get(`past_projects?id=in.(${pids.join(",")})&select=id,code,name,fiscal_year,campus,status,reason_open,pm_user_id&order=campus,code,name`);
  if (projects.length !== pids.length) return json({ error: "Project not found" }, 404);
  const pmIds = [...new Set(projects.map(p => String(p.pm_user_id ?? "")))];
  if (pmIds.length > 1) return json({ error: "One request is for the projects of one manager" }, 400);
  const pmId = pmIds[0];
  const pm = pmId ? (await get(`user_profiles?id=eq.${pmId}&select=id,email,full_name,username,is_active`))[0] ?? null : null;
  const pmName = String(pm?.full_name || pm?.username || "the project manager");
  const site = [...new Set(projects.map(p => String(p.campus ?? "").trim()).filter(Boolean))].join(", ") || "—";
  const viewerIds: string[] = ((await get("settings?key=eq.past_viewers&select=value"))[0]
    ?.value as { user_ids?: string[] } | undefined)?.user_ids ?? [];
  const first = msgs[0];
  const author = String(first.author_name || (first.author_role === "pmo" ? "PMO" : "Project manager"));
  const link = (pid: string) => `${PORTAL_URL}?past=${pid}`;
  const asRecipient = (r: Row): Recipient => ({ id: String(r.id), email: String(r.email).trim(), name: String(r.full_name || r.username || "there") });

  type Mail = ReturnType<typeof statusRequestEmail>;
  const groups: { to: Recipient[]; mail: Mail; title: string; text: string }[] = [];
  const taken = new Set<string>([uid]);
  const add = (to: Recipient[], m: (toName: string) => Mail, title: string, text: string) => {
    const t = to.filter(r => !taken.has(r.id) && (taken.add(r.id), true));
    if (t.length) groups.push({ to: t, mail: m(t[0].name), title, text });
  };

  if (kind === "status_request") {
    const fromPmo = first.author_role === "pmo";
    const fromViewer = !fromPmo && viewerIds.includes(uid);
    if (!fromPmo && !fromViewer) return json({ error: "Only the PMO and the past-project viewers can ask for a status" }, 403);
    const base = { asker: author, askerIsPmo: fromPmo, pmName, site, note: statusNote(first.body), projects, link };
    const what = projects.length === 1 ? String(projects[0].name) : `${projects.length} projects`;
    if (pm?.is_active && String(pm.email ?? "").trim())
      add([asRecipient(pm)], toName => statusRequestEmail({ ...base, forPmo: false, toName }),
        fromPmo ? "Status requested" : `Status requested by ${author}`, `${what}: % completed and a justification, please`);
    if (fromViewer)
      add(await pmoRecipients(ctx), () => statusRequestEmail({ ...base, forPmo: true, toName: "PMO" }),
        `${author} asked for a status`, `${what}: asked ${pmName} for % completed and a justification`);
  } else {
    // The requests this answers: those since the previous answer on the project.
    const project = projects[0], at = encodeURIComponent(String(first.created_at));
    const prev = (await get(`past_project_updates?past_project_id=eq.${project.id}&kind=eq.status&created_at=lt.${at}&select=created_at&order=created_at.desc&limit=1`))[0];
    const asked = await get(`past_project_updates?past_project_id=eq.${project.id}&kind=eq.status_request&created_at=lt.${at}${prev ? `&created_at=gt.${encodeURIComponent(String(prev.created_at))}` : ""}&select=author_id,author_name,created_at&order=created_at.asc`);
    const askers = [...new Set(asked.map(r => String(r.author_name ?? "").trim()).filter(Boolean))];
    const viewerAsk = [...new Set(asked.map(r => String(r.author_id)))].filter(v => viewerIds.includes(v) && v !== uid);
    const viewers = viewerAsk.length
      ? (await get(`user_profiles?id=in.(${viewerAsk.join(",")})&is_active=eq.true&select=id,email,full_name,username`)).filter(r => String(r.email ?? "").trim())
      : [];
    const pct = Math.round(Number(first.pct_complete) || 0);
    const base = { author, pmName, site, project, pct, justification: String(first.justification ?? ""),
                   askers, askedAt: dayPkt(asked[0]?.created_at), link: link(String(project.id)) };
    const pushText = `${project.name}: ${pct}% completed. ${String(first.justification ?? "")}`;
    add(await pmoRecipients(ctx), () => statusAnswerEmail({ ...base, toName: "PMO", forAsker: false, reasonOpen: project.reason_open }),
      `Status from ${author}`, pushText);
    for (const v of viewers)
      add([asRecipient(v)], toName => statusAnswerEmail({ ...base, toName, forAsker: true }), `Status from ${author}`, pushText);
  }

  const codes = projects.map(p => String(p.code ?? "").trim()).filter(Boolean);
  const projectCode = codes.length <= 3 ? codes.join(", ") || null : `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`;
  const detail = `msg ${ids.join(" ")}`;
  if (!groups.length) {
    if (!body.preview) await log(ctx, [{ channel, status: "skipped", project_code: projectCode, detail: `${detail}: no recipient with an email address` }]);
    return json({ ok: true, sent: 0, skipped: "no recipient with an email address" });
  }
  if (body.preview) return json({ ok: true, preview: true,
    emails: groups.map(g => ({ to: g.to.map(r => r.name), subject: g.mail.subject, text: g.mail.text, html: g.mail.html })),
    to: groups[0].to.map(r => r.name), subject: groups[0].mail.subject, text: groups[0].mail.text, html: groups[0].mail.html });

  const sent: Sent[] = [];
  const pushRes: unknown[] = [];
  let cc = true;
  for (const g of groups) {
    const lead = cc ? g.to.slice(0, 1) : [];
    if (lead.length) sent.push(...await mail(lead, g.mail.subject, g.mail.text, g.mail.html, true));
    if (g.to.length > lead.length) sent.push(...await mail(g.to.slice(lead.length), g.mail.subject, g.mail.text, g.mail.html, false));
    cc = false;
    pushRes.push(await push(ctx, g.to.map(r => r.id), {
      title: g.title, body: toAscii(g.text).slice(0, 160),
      tag: projects.length === 1 ? `past-${projects[0].id}` : `past-status-${pmId}`,
      url: `./?past=${projects[0].id}`,
    }));
  }
  await log(ctx, sent.map(s => ({
    channel, status: s.ok ? "sent" : "failed", recipient_id: s.r.id, recipient_address: s.r.email,
    project_code: projectCode, detail: `${detail}${s.ok ? "" : `: ${s.error}`}`,
  })));
  return json({ ok: true, sent: sent.filter(s => s.ok).length, failed: sent.filter(s => !s.ok).length, push: pushRes });
}
