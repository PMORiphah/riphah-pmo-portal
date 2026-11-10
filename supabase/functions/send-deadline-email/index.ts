import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   SEND DEADLINE EMAIL — PMO to one project manager, covering all of that
   manager's at-risk projects in a single message.

   Takes project_ids rather than a single project_id: a manager with six
   projects near their deadline should get one email, not six. Still only ever
   fired by a person clicking Send after reading a preview.

   No recipient domain restriction, as PMO asked. The other controls carry the
   weight: verify_jwt is on and the caller's role is read from the database,
   every project must currently appear in at_risk_projects, CC and BCC are
   capped, subject and body are length-limited and escaped, and every attempt
   is logged.
   ───────────────────────────────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PORTAL_URL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const DEFAULT_FROM_NAME = 'Project Management Office (Secretariat)';
const MAX_CC = 15, MAX_BCC = 15, MAX_SUBJECT = 300, MAX_BODY = 8000, MAX_PROJECTS = 40;

const esc = (s: string) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const toAscii = (s: string) =>
  String(s ?? '')
    .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019\u201A\u201B]/g,"'")
    .replace(/[\u201C\u201D\u201E]/g,'"').replace(/\u2026/g,'...')
    .replace(/[\u00A0\u2000-\u200B]/g,' ').replace(/[^\x20-\x7E]/g,'')
    .replace(/\s+/g,' ').trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanList = (v: unknown, cap: number) =>
  Array.from(new Set((Array.isArray(v) ? v : [])
    .map(x => String(x ?? '').trim().toLowerCase())
    .filter(x => x && EMAIL_RE.test(x)))).slice(0, cap);

const fmtM = (n: number) =>
  (n/1e6).toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1}) + 'M';

const daysLabel = (d: number) =>
  d < 0 ? `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} OVERDUE`
  : d === 0 ? 'Due TODAY'
  : `${d} day${d === 1 ? '' : 's'} remaining`;

const hasCode = (c: string | null) => !!c && c.trim() !== '' && c.trim() !== '-';
const titleOf = (p: { code: string|null; name: string }) =>
  hasCode(p.code) ? `${p.code} - ${p.name}` : p.name;

type P = {
  id:string; code:string|null; name:string; campus:string|null;
  end_date:string; days_remaining:number; df_recommended_amount:number;
};

// The operator writes prose; this wraps it, escaped, in the branded shell and
// appends a table of the projects the email covers.
const buildHtml = (o: { body:string; list:P[]; senderName:string }) => {
  const worst = Math.min(...o.list.map(p => p.days_remaining));
  const badge = worst < 0 ? '#E4576B' : worst <= 7 ? '#E2A83D' : '#185078';
  const bodyHtml = esc(o.body).split(/\n{2,}/)
    .map(par => `<p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 16px;">${par.replace(/\n/g,'<br>')}</p>`)
    .join('');
  const rows = o.list.map(p => {
    const c = p.days_remaining < 0 ? '#E4576B' : p.days_remaining <= 7 ? '#E2A83D' : '#185078';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E6EEF6;vertical-align:top;">
        ${hasCode(p.code) ? `<div style="font-size:10.5px;color:#7A98AE;font-family:'Courier New',monospace;letter-spacing:1px;">${esc(p.code!)}</div>` : ''}
        <div style="font-size:13.5px;color:#0D1929;font-weight:600;line-height:1.4;">${esc(p.name)}</div>
        <div style="font-size:11.5px;color:#7A98AE;margin-top:3px;">${esc(p.campus || 'Unspecified')} &middot; PKR ${esc(fmtM(p.df_recommended_amount || 0))}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E6EEF6;vertical-align:top;white-space:nowrap;text-align:right;">
        <div style="font-size:12.5px;color:${c};font-weight:700;">${esc(daysLabel(p.days_remaining))}</div>
        <div style="font-size:11.5px;color:#7A98AE;margin-top:3px;">${esc(p.end_date)}</div>
      </td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Project deadlines</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:28px 40px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal</div></td></tr><tr><td style="height:4px;background:${badge};"></td></tr><tr><td style="padding:34px 40px;">${bodyHtml}<table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 26px;border-collapse:collapse;"><tr style="background:#F2F8FC;"><th align="left" style="padding:7px 12px;font-size:10.5px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #DDE8F4;">Project</th><th align="right" style="padding:7px 12px;font-size:10.5px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #DDE8F4;">Deadline</th></tr>${rows}</table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 26px;"><a href="${PORTAL_URL}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:14px 38px;border-radius:8px;font-weight:700;font-size:15px;">Open in PMO Portal</a></td></tr></table></td></tr><tr><td style="background:#F2F8FC;padding:18px 40px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;">Sent by <strong style="color:#506070;">${esc(o.senderName)}</strong>, Project Management Office &middot; Riphah International University<br>You may reply to this email.</p></td></tr></table></td></tr></table></body></html>`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error:'Method not allowed' }, 405);

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
  const SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const GMAIL_USER = Deno.env.get('GMAIL_USER');
  const GMAIL_PASS = Deno.env.get('GMAIL_APP_PASSWORD');
  const FROM_NAME  = (toAscii(Deno.env.get('MAIL_FROM_NAME') || DEFAULT_FROM_NAME)
                      .replace(/["\\]/g,'').trim()) || DEFAULT_FROM_NAME;
  const svc = { apikey:SVC_KEY, Authorization:`Bearer ${SVC_KEY}`, 'Content-Type':'application/json' };

  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error:'Not signed in' }, 401);

  let callerId: string;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    callerId = payload.sub;
    if (!callerId) throw new Error('no sub');
  } catch { return json({ error:'Could not read the session' }, 401); }

  const [me] = await (await fetch(
    `${SUPA_URL}/rest/v1/user_profiles?id=eq.${callerId}&select=id,role,is_active,full_name,username,email`,
    { headers: svc })).json().catch(() => []);
  if (!me || me.role !== 'pmo' || me.is_active === false) {
    return json({ error:'Only an active PMO user can send this email' }, 403);
  }

  const bodyIn = await req.json().catch(() => ({}));
  // project_ids is the shape now; a lone project_id is still accepted so an
  // older cached bundle in someone's browser does not start failing.
  const rawIds: string[] = Array.isArray(bodyIn.project_ids) ? bodyIn.project_ids
                         : bodyIn.project_id ? [bodyIn.project_id] : [];
  const ids = Array.from(new Set(rawIds.map(x => String(x ?? '').trim()).filter(Boolean))).slice(0, MAX_PROJECTS);
  const to      = String(bodyIn.to ?? '').trim().toLowerCase();
  const subject = toAscii(String(bodyIn.subject ?? '')).slice(0, MAX_SUBJECT);
  const message = String(bodyIn.body ?? '').slice(0, MAX_BODY);
  const cc      = cleanList(bodyIn.cc, MAX_CC).filter(a => a !== to);
  const bcc     = cleanList(bodyIn.bcc, MAX_BCC).filter(a => a !== to && !cc.includes(a));
  const dryRun  = bodyIn.dry_run === true;

  if (!ids.length)        return json({ error:'No projects were given' }, 400);
  if (!EMAIL_RE.test(to)) return json({ error:'The recipient address is not valid' }, 400);
  if (!subject)           return json({ error:'A subject is required' }, 400);
  if (!message.trim())    return json({ error:'A message is required' }, 400);

  // Every project must genuinely be at risk right now. This is what stops the
  // endpoint being a general-purpose mailer.
  const found: P[] = await (await fetch(
    `${SUPA_URL}/rest/v1/at_risk_projects?id=in.(${ids.join(',')})&select=*&order=days_remaining.asc`,
    { headers: svc })).json().catch(() => []);
  if (!Array.isArray(found) || found.length !== ids.length) {
    return json({ error:'One or more of those projects is not currently within its deadline window',
                  requested: ids.length, matched: Array.isArray(found) ? found.length : 0 }, 400);
  }

  const senderName = (me.full_name?.trim() || me.username || 'Project Management Office');

  const log = async (status: string, detail: string) => {
    await fetch(`${SUPA_URL}/rest/v1/notifications_log`, {
      method:'POST', headers:{ ...svc, Prefer:'return=minimal' },
      body: JSON.stringify(found.map(p => ({
        project_id: p.id, project_code: p.code, recipient_id: null,
        recipient_address: to, channel: 'email-manual', status,
        detail: detail.slice(0, 500),
      }))),
    }).catch(() => {});
  };

  if (dryRun) {
    return json({ success:true, dry_run:true, to, cc, bcc, subject,
                  projects: found.length, sender: senderName });
  }

  if (!GMAIL_USER || !GMAIL_PASS) {
    await log('failed', 'GMAIL_USER / GMAIL_APP_PASSWORD not configured');
    return json({ error:'Email is not configured on the server' }, 503);
  }

  const text = `${message}\n\n---\n` +
    found.map(p => `${titleOf(p)}\n  ${p.campus || 'Unspecified'} | planned end ${p.end_date} | ${daysLabel(p.days_remaining)}`).join('\n') +
    `\n\nOpen the portal: ${PORTAL_URL}\n\nSent by ${senderName}, Project Management Office, Riphah International University.`;

  const client = new SMTPClient({
    connection:{ hostname:'smtp.gmail.com', port:465, tls:true,
                 auth:{ username: GMAIL_USER, password: GMAIL_PASS } },
  });

  try {
    await client.send({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(me.email ? { replyTo: me.email } : {}),
      subject,
      content: text,
      html: buildHtml({ body: message, list: found, senderName }),
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await log('failed', `sender=${senderName}; ${msg}`);
    try { await client.close(); } catch (_) { /* ignore */ }
    return json({ error:'The email could not be sent', detail: msg.slice(0, 300) }, 502);
  }
  try { await client.close(); } catch (_) { /* ignore */ }

  await log('sent', `sender=${senderName}; projects=${found.length}; cc=${cc.length}; bcc=${bcc.length}`);
  return json({ success:true, to, cc: cc.length, bcc: bcc.length, projects: found.length });
});
