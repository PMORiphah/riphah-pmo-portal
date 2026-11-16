// goals-reminders — PMO Goals due-today and overdue emails (PMO, 16 Nov 2026).
//
// Every day at 09:30 PKT (pg_cron job `goals-reminders`, 04:30 UTC) each team member whose open PMO Goals
// task is due today, or exactly 3, 7, 15 or 30 days overdue, gets ONE email listing those tasks, sent to
// them alone (no CC). Tasks without a due date, done or removed tasks and Pending PRs are never included.
// Addresses: PMO-only setting `goals_reminders` {"enabled": true, "emails": {"<list>": "<address>"}}
// (kept out of the code: the repository is public). Names come from settings.team_config.
// Each person is emailed at most once a day (notifications_log channel goals-reminder, detail "<date> <list>").
//
// Auth: pg_cron (x-cron-secret) sends. A signed-in PMO may call:
//   { dry_run: true, date?: "YYYY-MM-DD" }   who would get what, nothing sent
//   { preview: "<list>", date? }             that person's email (subject, html), nothing sent
//   { test: true, date? }                    every email of that day, sent to the PMO only, subject "[Test]"
import { pick, nameFor, reminderEmail, todayPkt, MEMBER_LISTS, type Row } from "./email.ts";
import { mail, log, PORTAL_URL, type Ctx, type Recipient } from "../epdd-sync/notify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPA = Deno.env.get("SUPABASE_URL")!, SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (p: string, i: RequestInit = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers ?? {}) } });
  const get = async (p: string) => { const j = await (await rest(p)).json().catch(() => null); return Array.isArray(j) ? j as Row[] : []; };
  const ctx: Ctx = { SUPA, SVC, rest };
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; preview?: string; test?: boolean; date?: string };

  // Who is calling: the cron, or a signed-in PMO (dry run / preview / test only).
  const CRON = Deno.env.get("CRON_SECRET");
  const cron = !!CRON && req.headers.get("x-cron-secret") === CRON;
  let me: Row | null = null;
  if (!cron) {
    const u = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get("authorization") ?? "" } })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    me = u?.id ? (await get(`user_profiles?id=eq.${u.id}&select=id,role,is_active,email,full_name`))[0] ?? null : null;
    if (!me || me.role !== "pmo" || !me.is_active) return json({ error: "PMO only" }, 403);
    if (!body.dry_run && !body.preview && !body.test) return json({ error: "Use dry_run, preview or test" }, 400);
  }

  const today = !cron && body.date && DATE.test(body.date) ? body.date : todayPkt();
  const conf = ((await get("settings?key=eq.goals_reminders&select=value"))[0]?.value ?? {}) as Row;
  const emails = (conf.emails ?? {}) as Record<string, string>;
  const team = ((await get("settings?key=eq.team_config&select=value"))[0]?.value ?? {}) as Row;
  if (cron && conf.enabled === false) return json({ ok: true, today, skipped: "switched off" });

  const tasks = await get(`pmo_tasks?done=eq.false&removed=eq.false&due_date=not.is.null&list=in.(${MEMBER_LISTS.join(",")})&select=id,list,title,note,priority,due_date,project_id,past_project_id,done,removed`);
  const pIds = [...new Set(tasks.map(t => t.project_id).filter(Boolean))], xIds = [...new Set(tasks.map(t => t.past_project_id).filter(Boolean))];
  const projects = pIds.length ? await get(`projects?id=in.(${pIds.join(",")})&select=id,code,name`) : [];
  const past = xIds.length ? await get(`past_projects?id=in.(${xIds.join(",")})&select=id,code,name`) : [];
  const pn = new Map([...projects, ...past].map(p => [String(p.id), [p.code, p.name].filter(Boolean).join(" · ")]));
  const groups = pick(tasks, today, t => pn.get(String(t.project_id ?? t.past_project_id ?? "")) ?? "");

  const plan = Object.entries(groups).map(([list, items]) => ({ list, name: nameFor(list, team), email: String(emails[list] ?? "").trim(),
    tasks: items.map(i => ({ title: i.title, due: i.due, days: i.days })) }));
  if (body.dry_run) return json({ ok: true, today, plan });
  if (body.preview) {
    const items = groups[body.preview]; if (!items) return json({ ok: true, today, email: null });
    return json({ ok: true, today, email: reminderEmail(nameFor(body.preview, team), items, today, PORTAL_URL) });
  }

  // Already sent today (a re-run of the cron never sends twice).
  const sentToday = new Set((await get(`notifications_log?channel=eq.goals-reminder&status=eq.sent&detail=like.${today}*&select=detail`)).map(r => String(r.detail)));
  const results: Row[] = [], logs: Row[] = [];
  for (const [list, items] of Object.entries(groups)) {
    const name = nameFor(list, team);
    const to = body.test ? String(me?.email ?? "").trim() : String(emails[list] ?? "").trim();
    const key = `${today} ${list}`;
    if (!body.test && sentToday.has(key)) { results.push({ list, skipped: "already sent today" }); continue; }
    if (!to) { results.push({ list, skipped: "no email address" }); logs.push({ channel: "goals-reminder", status: "skipped", detail: `${key}: no email address` }); continue; }
    const m = reminderEmail(name, items, today, PORTAL_URL, !!body.test);
    const r: Recipient = { id: String(me?.id ?? list), email: to, name };
    const [s] = await mail([r], m.subject, m.text, m.html, false);   // to that person alone, no CC
    results.push({ list, to, ok: s.ok, tasks: items.length, error: s.error });
    if (!body.test) logs.push({ channel: "goals-reminder", recipient_address: to, status: s.ok ? "sent" : "failed",
      detail: s.ok ? key : `${key}: ${s.error ?? "failed"}` });
  }
  await log(ctx, logs);
  return json({ ok: true, today, test: !!body.test, results });
});
