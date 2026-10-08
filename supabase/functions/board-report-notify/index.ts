// board-report-notify — tells the recipients of a published board report (PMO, 8 Oct 2026).
//
// PMO only. Body { report_id, action: "push" | "email" | "preview", user_ids? }.
//   push     one push per recipient (opens ?report=<id>); sets pushed_at
//   email    one email per recipient, no CC; sets emailed_at (the PMO pressed
//            Email report, so it fits the rule that people are emailed only
//            when the PMO presses Send)
//   preview  returns the email for the first recipient, sends nothing
// Only recipients the PMO chose (board_report_recipients, not removed) and only
// for a published report. Logged in notifications_log (board-report-push / -email).
import { reportEmail, type Headline } from "./email.ts";
import { mail, push, log, PORTAL_URL, type Ctx } from "../epdd-sync/notify.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5 * 3600e3); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPA = Deno.env.get("SUPABASE_URL")!, SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (p: string, i: RequestInit = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...svc, ...(i.headers ?? {}) } });
  const ctx: Ctx = { SUPA, SVC, rest };
  const auth = req.headers.get("authorization") ?? "";
  const me = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!me?.id) return json({ error: "Unauthorized" }, 401);
  const isPmo = await fetch(`${SUPA}/rest/v1/rpc/is_pmo`, { method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" } }).then(r => r.json()).catch(() => false);
  if (isPmo !== true) return json({ error: "Forbidden: PMO role required" }, 403);

  const body = await req.json().catch(() => ({})) as { report_id?: string; action?: string; user_ids?: string[] };
  const id = String(body.report_id ?? "");
  const action = ["push", "email", "preview"].includes(String(body.action)) ? String(body.action) : "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !action) return json({ error: "report_id and action required" }, 400);

  const rep = ((await (await rest(`board_reports?id=eq.${id}&select=id,title,period,status,as_at,note,headline:figures->headline,period_label:figures->>period`)).json()) as Row[])?.[0];
  if (!rep) return json({ error: "Report not found" }, 404);
  if (rep.status !== "published") return json({ error: "Publish the report first." }, 400);
  const only = Array.isArray(body.user_ids) ? body.user_ids.filter(x => /^[0-9a-f-]{36}$/.test(String(x))) : null;
  const recs = (await (await rest(`board_report_recipients?report_id=eq.${id}&removed=is.false&select=user_id`)).json()) as Row[];
  const ids = (Array.isArray(recs) ? recs : []).map(r => String(r.user_id)).filter(u => !only || only.includes(u));
  if (!ids.length) return json({ error: "No recipients." }, 400);
  const people = ((await (await rest(`user_profiles?id=in.(${ids.join(",")})&is_active=eq.true&select=id,email,full_name,username`)).json()) as Row[]) || [];
  const link = `${PORTAL_URL}?report=${id}`;
  const period = String(rep.period_label ?? rep.title);
  const compose = (p: Row) => reportEmail({ name: String(p.full_name || p.username), title: String(rep.title), period,
    asAt: day(String(rep.as_at)), h: (rep.headline ?? {}) as Headline, note: rep.note as string, link });

  if (action === "preview") return json({ ok: true, to: people.map(p => p.email), ...compose(people[0] ?? { username: "there" }) });

  const now = new Date().toISOString();
  if (action === "push") {
    const r = await push(ctx, people.map(p => String(p.id)), { title: `Board report: ${period}`, body: "The PMO has shared the monthly board report with you.", tag: `report-${id}`, url: `./?report=${id}` });
    await rest(`board_report_recipients?report_id=eq.${id}&user_id=in.(${people.map(p => p.id).join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ pushed_at: now }) });
    await log(ctx, [{ channel: "board-report-push", status: (r as Row)?.sent ? "sent" : "skipped", detail: `report ${id}; ${people.length} recipients; ${JSON.stringify(r).slice(0, 200)}` }]);
    return json({ ok: true, pushed: people.length, result: r });
  }

  const out: Row[] = [];
  for (const p of people.filter(p => String(p.email ?? "").trim())) {
    const e = compose(p);
    const s = await mail([{ id: String(p.id), email: String(p.email).trim(), name: String(p.full_name || p.username) }], e.subject, e.text, e.html, false);
    out.push({ id: p.id, email: p.email, ok: s[0]?.ok, error: s[0]?.error });
    if (s[0]?.ok) await rest(`board_report_recipients?report_id=eq.${id}&user_id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ emailed_at: now }) });
  }
  await log(ctx, out.map(o => ({ recipient_id: o.id, recipient_address: o.email, channel: "board-report-email", status: o.ok ? "sent" : "failed", detail: `report ${id}${o.error ? `; ${o.error}` : ""}` })));
  return json({ ok: true, emailed: out.filter(o => o.ok).length, failed: out.filter(o => !o.ok) });
});
