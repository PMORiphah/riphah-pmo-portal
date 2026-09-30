/* ─────────────────────────────────────────────────────────────────────────────
   PMO REVIEW, PHASE 5 — telling the PMO (approved 30 Sep 2026)

   · A new PDD in Manage PMO Form (or a resubmitted one) → one push to the PMO's
     devices per PDD and one email per run listing them, once the code review is
     ready (and the AI reading, or 15 minutes have passed). The link opens that
     PDD in the portal (?review=<id>).
   · The sync failing 3 runs in a row (15 minutes) → one alert; the first good
     run afterwards → one "working again" note.

   Recipients are the same as the 9 am deadline digest: active PMO users with
   email notifications on, copied to MAIL_CC. Project managers are never
   written to. Everything is logged in notifications_log.
   ───────────────────────────────────────────────────────────────────────────── */

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type Row = Record<string, unknown>;
export const PORTAL_URL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const DEFAULT_FROM_NAME = "Project Management Office (Secretariat)";
const DEFAULT_CC = ["owais.javed@riphah.edu.pk", "abdullah.azhar@riphah.edu.pk",
  "usman.ahmad@riphah.edu.pk", "atisham.haq@riphah.edu.pk"];

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Subjects and push text go through ASCII: Gmail and some phones mangle the rest.
export const toAscii = (s: unknown) => String(s ?? "")
  .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019\u201A\u201B]/g, "'")
  .replace(/[\u201C\u201D\u201E]/g, '"').replace(/\u2026/g, "...").replace(/\u00d7/g, "x")
  .replace(/[\u00A0\u2000-\u200B]/g, " ").replace(/[^\x20-\x7E\n]/g, "").replace(/[ \t]+/g, " ").trim();
const fmt = (n: unknown) => n == null || !isFinite(Number(n)) ? "-"
  : Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 });
export const reviewLink = (id: unknown) => `${PORTAL_URL}?review=${id}`;

export type Recipient = { id: string; email: string; name: string };
export type Ctx = { SUPA: string; SVC: string; rest: (p: string, i?: RequestInit) => Promise<Response> };

export async function pmoRecipients(ctx: Ctx): Promise<Recipient[]> {
  const r = await ctx.rest("user_profiles?role=eq.pmo&is_active=eq.true&notify_email=eq.true&select=id,email,full_name,username");
  const j = await r.json().catch(() => []);
  return (Array.isArray(j) ? j : []).filter((u: Row) => String(u.email ?? "").trim())
    .map((u: Row) => ({ id: String(u.id), email: String(u.email).trim(), name: String(u.full_name || u.username || "there").trim() }));
}

export async function push(ctx: Ctx, userIds: string[], n: { title: string; body: string; tag: string; url: string }) {
  if (!userIds.length) return { sent: 0, skipped: "no recipients" };
  try {
    const r = await fetch(`${ctx.SUPA}/functions/v1/send-push`, { method: "POST",
      headers: { apikey: ctx.SVC, Authorization: `Bearer ${ctx.SVC}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: userIds, notification: { ...n, title: toAscii(n.title), body: toAscii(n.body) } }) });
    return await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  } catch (e) { return { error: String((e as Error)?.message ?? e).slice(0, 200) }; }
}

// One message to each recipient (the team copied), as the deadline digest does.
// `cc: false` sends to the recipients alone (used for the PMO's test message).
export type Sent = { r: Recipient; ok: boolean; error?: string; cc?: number };
export async function mail(to: Recipient[], subject: string, text: string, html: string, cc = true): Promise<Sent[]> {
  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return to.map(r => ({ r, ok: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD not configured" }));
  const fromName = (toAscii(Deno.env.get("MAIL_FROM_NAME") || DEFAULT_FROM_NAME).replace(/["\\]/g, "")) || DEFAULT_FROM_NAME;
  const replyTo = toAscii(Deno.env.get("MAIL_REPLY_TO") || "");
  const ccList = (Deno.env.get("MAIL_CC") ?? DEFAULT_CC.join(",")).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
  const out: Sent[] = [];
  try {
    for (const r of to) {
      const c = cc ? ccList.filter(a => a !== r.email.toLowerCase()) : [];
      try {
        await client.send({ from: `"${fromName}" <${user}>`, to: r.email, ...(c.length ? { cc: c } : {}),
          ...(replyTo ? { replyTo } : {}), subject: toAscii(subject), content: text, html });
        out.push({ r, ok: true, cc: c.length });
      } catch (e) { out.push({ r, ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) }); }
    }
  } finally { try { await client.close(); } catch { /* ignore */ } }
  return out;
}

export async function log(ctx: Ctx, rows: Row[]) {
  if (!rows.length) return;
  const shape = { project_id: null, project_code: null, recipient_id: null, recipient_address: null, channel: "", status: "", detail: "" };
  await ctx.rest("notifications_log", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows.map(r => ({ ...shape, ...r }))) }).catch(() => null);
}

// ── The email for new PDDs ──────────────────────────────────────────────────
export type PddNote = {
  id: number; pdd_number: string; project_name: string; campus: string; project_type: string;
  currency: string; grand_total: unknown; initiated_by: string; epdd_url: string; resubmitted: boolean;
  verdict: string | null; summary: string; toFix: string[]; toLook: string[]; ai: string | null;
};

const shell = (bar: string, kicker: string, inner: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(kicker)}</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center"><table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:26px 36px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; ${esc(kicker)}</div></td></tr><tr><td style="height:4px;background:${bar};"></td></tr><tr><td style="padding:30px 36px;">${inner}</td></tr><tr><td style="background:#F2F8FC;padding:16px 36px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>This is an automated notification. Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

export function newPddEmail(name: string, ps: PddNote[]) {
  const n = ps.length;
  const needs = ps.filter(p => p.verdict === "needs_changes").length;
  const subject = n === 1
    ? `${ps[0].resubmitted ? "Resubmitted" : "New"} PDD for review: ${ps[0].pdd_number} ${ps[0].project_name}`
    : `${n} PDDs waiting for review${needs ? `, ${needs} need changes` : ""}`;
  const verdictWord = (v: string | null) => v === "needs_changes" ? "Needs changes" : v === "ready" ? "Ready for decision" : "Checking";
  // The code review's summary already opens with "Needs changes:"; the badge says that.
  const said = (p: PddNote) => { const t = p.summary.replace(/^Needs changes:\s*/i, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
  const verdictColour = (v: string | null) => v === "needs_changes" ? "#E4576B" : v === "ready" ? "#2E9E6A" : "#185078";
  const card = (p: PddNote) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #E0ECF5;border-radius:10px;border-collapse:separate;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:10.5px;color:#7A98AE;font-family:'Courier New',monospace;letter-spacing:1px;">${esc(p.pdd_number)}${p.resubmitted ? " &middot; RESUBMITTED" : ""}</div>
        <div style="font-size:15.5px;color:#0D1929;font-weight:700;line-height:1.4;margin-top:2px;">${esc(p.project_name)}</div>
        <div style="font-size:12px;color:#7A98AE;margin-top:4px;">${esc(p.campus)} &middot; ${esc(p.project_type)} &middot; ${esc(p.currency)} ${esc(fmt(p.grand_total))} &middot; from ${esc(p.initiated_by)}</div>
        <div style="margin-top:12px;"><span style="display:inline-block;background:${verdictColour(p.verdict)};color:#fff;font-size:11px;font-weight:700;letter-spacing:.4px;padding:4px 11px;border-radius:14px;">${esc(verdictWord(p.verdict).toUpperCase())}</span></div>
        <div style="font-size:13px;color:#3A5068;line-height:1.6;margin-top:8px;">${esc(said(p))}</div>
        ${p.toFix.length ? `<div style="font-size:12.5px;color:#0D1929;margin-top:8px;"><strong style="color:#E4576B;">To fix:</strong> ${p.toFix.map(esc).join(" &middot; ")}</div>` : ""}
        ${p.toLook.length ? `<div style="font-size:12.5px;color:#0D1929;margin-top:4px;"><strong style="color:#B7832A;">To look at:</strong> ${p.toLook.map(esc).join(" &middot; ")}</div>` : ""}
        ${p.ai ? `<div style="font-size:12px;color:#7A98AE;margin-top:6px;">AI reading: ${esc(p.ai)}</div>` : ""}
        <div style="margin-top:14px;"><a href="${reviewLink(p.id)}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:7px;font-weight:700;font-size:13px;">Open the review</a>
        &nbsp; <a href="${esc(p.epdd_url)}" style="font-size:12.5px;color:#185078;">Open in the E-PDD portal</a></div>
      </td></tr>
    </table>`;
  const html = shell(needs ? "#E4576B" : "#E2A83D", "PMO Review",
    `<h1 style="font-size:20px;color:#0D1929;margin:0 0 10px;font-weight:700;line-height:1.35;">${esc(n === 1 ? `A ${ps[0].resubmitted ? "resubmitted" : "new"} PDD is waiting in Manage PMO Form` : `${n} PDDs are waiting in Manage PMO Form`)}</h1>
     <p style="font-size:14px;color:#3A5068;line-height:1.7;margin:0 0 22px;">Hello <strong>${esc(name)}</strong>, the portal has copied ${n === 1 ? "it" : "them"} with all files and run the checks. Approve or reject in the E-PDD portal as usual; the review page has a suggested reply you can paste.</p>
     ${ps.map(card).join("")}
     <p style="font-size:12px;color:#8AA0B5;margin:6px 0 0;line-height:1.6;">The result is set by the code checks. The AI reading is guidance only. Checked every 5 minutes; one email per check that finds something new.</p>`);
  const text = `Riphah International University - Project Management Office
PMO Review

Hello ${name},

${n === 1 ? "A PDD is" : `${n} PDDs are`} waiting in Manage PMO Form.
${ps.map(p => `
${p.pdd_number}${p.resubmitted ? " (resubmitted)" : ""} - ${p.project_name}
  ${p.campus} | ${p.project_type} | ${p.currency} ${fmt(p.grand_total)} | from ${p.initiated_by}
  ${verdictWord(p.verdict)}: ${said(p)}${p.toFix.length ? `\n  To fix: ${p.toFix.join("; ")}` : ""}${p.toLook.length ? `\n  To look at: ${p.toLook.join("; ")}` : ""}${p.ai ? `\n  AI reading: ${p.ai}` : ""}
  Review: ${reviewLink(p.id)}
  E-PDD: ${p.epdd_url}`).join("\n")}

--
Project Management Office, Riphah International University. Please do not reply.`;
  return { subject, text: toAscii(text), html };
}

export function healthEmail(name: string, down: boolean, detail: string, since: string) {
  const subject = down ? "PMO Review: the E-PDD check is failing" : "PMO Review: the E-PDD check is working again";
  const body = down
    ? `The portal has not been able to read the E-PDD portal since ${since} (3 checks in a row). New PDDs will not appear in PMO Review until this is fixed. Last error: ${detail}`
    : `The portal is reading the E-PDD portal again (since ${since}). Anything that arrived in the meantime has now been copied and checked.`;
  const html = shell(down ? "#E4576B" : "#2E9E6A", "PMO Review",
    `<h1 style="font-size:20px;color:#0D1929;margin:0 0 10px;font-weight:700;">${esc(down ? "The E-PDD check is failing" : "The E-PDD check is working again")}</h1>
     <p style="font-size:14px;color:#3A5068;line-height:1.7;margin:0 0 18px;">Hello <strong>${esc(name)}</strong>, ${esc(body)}</p>
     ${down ? `<p style="font-size:13px;color:#3A5068;line-height:1.7;margin:0 0 18px;">Common causes: the E-PDD password was changed (update the Vault secret <code>epdd_password</code>), or the E-PDD portal is down. Until then, check Manage PMO Form in the E-PDD portal directly.</p>` : ""}
     <a href="${PORTAL_URL}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:700;font-size:14px;">Open the PMO Portal</a>`);
  return { subject, text: toAscii(`${subject}\n\nHello ${name},\n\n${body}\n\n${PORTAL_URL}`), html };
}
