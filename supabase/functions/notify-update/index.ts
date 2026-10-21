// notify-update — email (and push) for "Ask update" on FY 2026-27 Updates (PMO, 20 Oct 2026;
// docs/plans/status-requests.md).
//
// Called by the portal right after the post is saved, with
//   { kind: "request", id: <comments.id> }  an Ask update (comments.kind update_request) by the PMO or
//                                           a past-project viewer → the project's manager(s): its active
//                                           assignees (project_assignments, any role; one manager is a
//                                           guest), the team copied (MAIL_CC) once; a viewer's request
//                                           also goes to the PMO, worded for them;
//   { kind: "update", id }                  the manager's update (kind update) → the PMO and whoever asked
//                                           since the previous update;
//   { preview: true, project_id, note }     the request email as it would be sent, before anything is
//                                           posted (PMO or a viewer only); { kind, id, preview: true }
//                                           previews a saved post. A preview sends nothing.
// Only the post's own author can trigger it, once per post (notifications_log detail "msg <id>").
// Managers are emailed only because someone pressed Ask update: nothing here runs on a timer, and
// notify-comment is never called for these two kinds. The link opens the project's Updates thread
// (?upd=<project id>).
import { requestEmail, updateEmail, requestNote, isItem, dayPkt, OVERALL, type Row, type Line } from "./email.ts";
import { mail, push, log, pmoRecipients, toAscii, PORTAL_URL, type Ctx, type Recipient, type Sent }
  from "../epdd-sync/notify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/;
const nameOf = (r: Row | null | undefined) => String(r?.full_name || r?.username || "").trim();
const withEmail = (r: Row) => !!String(r.email ?? "").trim();
const asRecipient = (r: Row): Recipient => ({ id: String(r.id), email: String(r.email).trim(), name: nameOf(r) || "there" });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (p: string, i: RequestInit = {}) =>
    fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...svc, ...(i.headers ?? {}) } });
  const ctx: Ctx = { SUPA, SVC, rest };
  const get = async (p: string) => {
    const j = await (await rest(p)).json().catch(() => null);
    return Array.isArray(j) ? j as Row[] : [];
  };

  // Who is calling.
  const auth = req.headers.get("authorization") ?? "";
  const u = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!u?.id) return json({ error: "Unauthorized" }, 401);
  // Checked with the caller's own token, as the database checks them.
  const rpc = (fn: string) => fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST",
    headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" } }).then(r => r.json()).catch(() => false);

  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; project_id?: string; note?: string; preview?: boolean };
  const kind = body.kind === "request" ? "request" : body.kind === "update" ? "update" : null;
  const id = String(body.id ?? "");
  const draft = !!body.preview && !kind;   // the request window's preview, before anything is posted
  if (draft ? !UUID.test(String(body.project_id ?? "")) : !kind || !UUID.test(id))
    return json({ error: "kind and id required (or preview with project_id)" }, 400);

  // The post (none yet for a draft preview): its author only, and the right kind.
  const msg = draft ? null
    : (await get(`comments?id=eq.${id}&select=id,project_id,parent_id,author_id,author_name,author_role,body,kind,data,created_at`))[0] ?? null;
  if (!draft) {
    if (!msg) return json({ error: "Post not found" }, 404);
    if (msg.author_id !== u.id) return json({ error: "Only the author can send this notification" }, 403);
    if ((msg.kind ?? "comment") !== (kind === "request" ? "update_request" : "update"))
      return json({ error: kind === "request" ? "Not an update request" : "Not an update" }, 400);
    // An update without its overall status and % is not announced as one (the page refuses it; this is
    // the backstop should such a row reach the table).
    const d = (msg.data ?? null) as { overall?: unknown; pct?: unknown } | null;
    if (kind === "update" && (!d || !Object.prototype.hasOwnProperty.call(OVERALL, String(d.overall)) || typeof d.pct !== "number"
        || !Number.isFinite(d.pct) || d.pct < 0 || d.pct > 100))
      return json({ error: "The update has no overall status or % completed" }, 400);
  }
  const isRequest = draft || kind === "request";

  // Asking is for the PMO and the past-project viewers (PMO decision 20 Oct 2026).
  const fromPmo = isRequest && (await rpc("is_pmo")) === true;
  const fromViewer = isRequest && !fromPmo && (await rpc("is_past_viewer")) === true;
  if (isRequest && !fromPmo && !fromViewer)
    return json({ error: "Only the PMO and the past-project viewers can ask for an update" }, 403);

  // Once per post ({preview: true} only returns the email and sends nothing).
  const channel = isRequest ? "update-request-email" : "update-answer-email";
  const done = body.preview ? [] : await get(`notifications_log?channel=eq.${channel}&detail=like.${encodeURIComponent(`msg ${id}%`)}&select=id&limit=1`);
  if (done.length) return json({ ok: true, skipped: "already sent" });

  const projectId = String(draft ? body.project_id : msg!.project_id);
  const project = (await get(`projects?id=eq.${projectId}&select=id,code,name,campus,fiscal_year,pct_complete`))[0];
  if (!project) return json({ error: "Project not found" }, 404);

  // The project's managers: its active assignees, whatever their role.
  const assigned = [...new Set((await get(`project_assignments?project_id=eq.${projectId}&select=user_id`)).map(r => String(r.user_id)))];
  const managers = assigned.length
    ? await get(`user_profiles?id=in.(${assigned.join(",")})&is_active=eq.true&select=id,email,full_name,username&order=full_name`)
    : [];
  const managerNames = managers.map(nameOf).filter(Boolean);
  const site = String(project.campus ?? "").trim() || "—";
  const label = `${project.code ? `${project.code} ` : ""}${project.name}`;
  const link = `${PORTAL_URL}?upd=${projectId}`;
  const author = draft
    ? nameOf((await get(`user_profiles?id=eq.${u.id}&select=full_name,username`))[0]) || (fromPmo ? "PMO" : "Viewer")
    : String(msg!.author_name || (fromPmo ? "PMO" : "Project manager"));

  type Mail = ReturnType<typeof requestEmail>;
  const groups: { to: Recipient[]; mail: Mail; title: string; text: string; pmo: boolean }[] = [];
  const taken = new Set<string>([String(u.id)]);
  const add = (to: Recipient[], m: (toName: string) => Mail, title: string, text: string, pmo = false) => {
    const t = to.filter(r => !taken.has(r.id) && (taken.add(r.id), true));
    if (t.length) groups.push({ to: t, mail: m(t[0].name), title, text, pmo });
  };

  let lineCount = 0;
  if (isRequest) {
    // The confirmed item lines the manager has to cover (contingency and tax lines are not items).
    const lines = (await get(`project_deliverables?project_id=eq.${projectId}&confirmed=eq.true&superseded=eq.false&select=id,line_no,title,qty,unit,status&order=sort_order.asc,line_no.asc`))
      .filter(l => isItem(l.title));
    lineCount = lines.length;
    const note = draft ? String(body.note ?? "").trim().slice(0, 1000) : requestNote(msg!.body);
    const base = { asker: author, askerIsPmo: fromPmo, project, managers: managerNames, site, note, lines, link };
    const need = lines.length ? `a status and a comment on ${lines.length} deliverable${lines.length === 1 ? "" : "s"}, ` : "";
    // Each manager is greeted by name.
    for (const m of managers.filter(withEmail))
      add([asRecipient(m)], toName => requestEmail({ ...base, forPmo: false, toName }),
        fromPmo ? "Update requested" : `Update requested by ${author}`,
        `${label}: ${need}the overall status, % completed and a detailed update, please`);
    if (fromViewer)
      add(await pmoRecipients(ctx), () => requestEmail({ ...base, forPmo: true, toName: "PMO" }),
        `${author} asked for an update`, `${label}: asked ${managerNames.join(", ") || "the project manager"}`, true);
  } else {
    // The requests this answers: those since the previous update on the project.
    const at = encodeURIComponent(String(msg!.created_at));
    const prev = (await get(`comments?project_id=eq.${projectId}&kind=eq.update&created_at=lt.${at}&select=created_at&order=created_at.desc&limit=1`))[0];
    const asked = await get(`comments?project_id=eq.${projectId}&kind=eq.update_request&created_at=lt.${at}${prev ? `&created_at=gt.${encodeURIComponent(String(prev.created_at))}` : ""}&select=author_id,author_name,created_at&order=created_at.asc`);
    const askers = [...new Set(asked.map(r => String(r.author_name ?? "").trim()).filter(Boolean))];
    const askerIds = [...new Set(asked.map(r => String(r.author_id)))].filter(x => UUID.test(x));
    const askerRows = askerIds.length
      ? (await get(`user_profiles?id=in.(${askerIds.join(",")})&is_active=eq.true&select=id,email,full_name,username`)).filter(withEmail)
      : [];

    // Each line of the update with its deliverable's name, in the order the form showed them.
    const data = (msg!.data ?? {}) as { overall?: string; pct?: number; lines?: { id?: string; status?: string; comment?: string }[] };
    const raw = Array.isArray(data.lines) ? data.lines : [];
    const lineIds = raw.map(l => String(l?.id ?? "")).filter(x => UUID.test(x));
    const titles = lineIds.length ? await get(`project_deliverables?id=in.(${lineIds.join(",")})&select=id,line_no,title,qty,unit`) : [];
    const byId = new Map(titles.map(t => [String(t.id), t]));
    const lines: Line[] = raw.map((l, i) => {
      const d = byId.get(String(l?.id ?? ""));
      return { line_no: d?.line_no ?? i + 1, title: d?.title ?? "(line no longer listed)", qty: d?.qty, unit: d?.unit,
               status: String(l?.status ?? ""), comment: String(l?.comment ?? "").trim() };
    });
    lineCount = lines.length;
    const overall = String(data.overall ?? ""), pct = Number(data.pct ?? 0);
    const base = { author, project, managers: managerNames, site, overall, pct, portalPct: project.pct_complete,
                   detail: String(msg!.body ?? "").trim(), lines, askers, askedAt: dayPkt(asked[0]?.created_at), link };
    const pushText = `${label}: ${OVERALL[overall] ?? overall}, ${pct}% completed. ${String(msg!.body ?? "")}`;
    add(await pmoRecipients(ctx), () => updateEmail({ ...base, forPmo: true, toName: "PMO", youAsked: false }),
      `Update from ${author}`, pushText, true);
    for (const r of askerRows)
      add([asRecipient(r)], toName => updateEmail({ ...base, forPmo: false, toName, youAsked: true }), `Update from ${author}`, pushText);
  }

  if (body.preview) {
    // A project nobody can be emailed about still shows the email the manager would get.
    const shown = groups[0]?.mail ?? (isRequest ? requestEmail({ asker: author, askerIsPmo: fromPmo, project, managers: managerNames,
      site, note: draft ? String(body.note ?? "").trim() : requestNote(msg?.body), lines: [], link, forPmo: false,
      toName: managerNames[0] || "project manager" }) : null);
    const mgrs = groups.filter(g => !g.pmo).flatMap(g => g.to.map(r => r.name));
    return json({ ok: true, preview: true, lines: lineCount,
      emails: groups.map(g => ({ to: g.to.map(r => r.name), subject: g.mail.subject, text: g.mail.text, html: g.mail.html })),
      // The request window says who is emailed: `to` = the managers, `also` = the PMO copy (a viewer's request).
      to: isRequest ? mgrs : (groups[0]?.to.map(r => r.name) ?? []),
      also: isRequest ? groups.filter(g => g.pmo).flatMap(g => g.to.map(r => r.name)) : [],
      subject: shown?.subject ?? "", text: shown?.text ?? "", html: shown?.html ?? "" });
  }

  if (!groups.length) {
    await log(ctx, [{ channel, status: "skipped", project_code: (project.code as string) ?? null, detail: `msg ${id}: no recipient with an email address` }]);
    return json({ ok: true, sent: 0, skipped: "no recipient with an email address" });
  }

  // The team (MAIL_CC) is copied once per post, on the very first email.
  const sent: Sent[] = [];
  const pushLog: Row[] = [];
  const pushChannel = isRequest ? "update-request-push" : "update-answer-push";
  let cc = true;
  for (const g of groups) {
    const lead = cc ? g.to.slice(0, 1) : [];
    if (lead.length) sent.push(...await mail(lead, g.mail.subject, g.mail.text, g.mail.html, true));
    if (g.to.length > lead.length) sent.push(...await mail(g.to.slice(lead.length), g.mail.subject, g.mail.text, g.mail.html, false));
    cc = false;
    const r = await push(ctx, g.to.map(x => x.id), { title: g.title, body: toAscii(g.text).slice(0, 160),
      tag: `upd-${projectId}`, url: `./?upd=${projectId}` });
    pushLog.push({ channel: pushChannel, status: (r as Row)?.sent ? "sent" : "skipped", project_code: (project.code as string) ?? null,
      detail: `msg ${id}; ${g.to.length} recipients; ${JSON.stringify(r).slice(0, 200)}` });
  }
  await log(ctx, [...sent.map(s => ({
    channel, status: s.ok ? "sent" : "failed", recipient_id: s.r.id, recipient_address: s.r.email,
    project_code: (project.code as string) ?? null, detail: `msg ${id}${s.ok ? "" : `: ${s.error}`}`,
  })), ...pushLog]);
  return json({ ok: true, sent: sent.filter(s => s.ok).length, failed: sent.filter(s => !s.ok).length, lines: lineCount });
});
