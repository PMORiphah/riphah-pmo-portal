import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { mailSafe } from "../_shared/mailText.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PORTAL_URL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const DEFAULT_FROM_NAME = 'Project Management Office (Secretariat)';

const toAscii = (s: string) =>
  String(s ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const esc = (s: string) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const buildText = (name: string, roleLabel: string, roleDesc: string, link: string) =>
`RIPHAH INTERNATIONAL UNIVERSITY
Project Management Office - Capital Projects Portal
FY 2026-27

Hello ${name},

The Project Management Office at Riphah International University has
granted you access to the PMO Capital Projects Portal.

Your role: ${roleLabel}
${roleDesc}

To accept the invitation and set your password, open this address:

${link}

This invitation expires in 24 hours. If it has expired, ask the PMO to
send a new one.

Portal home: ${PORTAL_URL}

--
Project Management Office
Riphah International University
This is an automated message. Please do not reply.`;

const buildEmail = (name: string, role: string, link: string): string => {
  const isPM = role === 'project_manager';
  const roleLabel = isPM ? 'Project Manager' : 'Guest';
  const roleColor = isPM ? '#3B82F6' : '#6B7280';
  const roleBg    = isPM ? '#EFF6FF'  : '#F3F4F6';
  const roleDesc  = isPM
    ? 'You have access to your assigned projects and can post progress updates to the PMO.'
    : 'You have read-only access to the full CAPEX portfolio.';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PMO Portal Invitation</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:32px 40px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:22px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; FY 2026-27</div></td></tr><tr><td style="height:4px;background:#D89840;"></td></tr><tr><td style="padding:40px;"><h1 style="font-size:26px;color:#0D1929;margin:0 0 18px;font-weight:700;">You&rsquo;ve been invited</h1><p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 14px;">Hello <strong>${esc(name)}</strong>,</p><p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 22px;">The Project Management Office at Riphah International University has granted you access to the <strong>PMO Capital Projects Portal</strong>.</p><div style="margin:0 0 18px;"><span style="font-size:12px;font-weight:700;color:${roleColor};background:${roleBg};border:1px solid ${roleColor}44;padding:5px 14px;border-radius:20px;">${roleLabel}</span></div><p style="font-size:14px;color:#5A7A90;line-height:1.7;margin:0 0 30px;">${roleDesc}</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 26px;"><a href="${link}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:700;font-size:15px;">Accept Invitation &amp; Set Password</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="background:#F2F8FC;border:1px solid #DDE8F4;border-radius:6px;padding:13px 16px;"><div style="font-size:10px;color:#7A98AE;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:7px;">If the button does not work, paste this address</div><div style="font-size:11.5px;color:#185078;line-height:1.6;word-break:break-all;font-family:Consolas,Menlo,monospace;">${esc(link)}</div></td></tr></table><div style="border-top:1px solid #E0ECF5;padding-top:22px;"><p style="font-size:13px;color:#8AA0B5;line-height:1.65;margin:0 0 10px;">This invitation link <strong>expires in 24 hours</strong>. If you did not expect this invitation, you can safely ignore this email.</p><p style="font-size:13px;color:#8AA0B5;margin:0;">Login page: <a href="${PORTAL_URL}" style="color:#185078;">${PORTAL_URL}</a></p></div></td></tr><tr><td style="background:#F2F8FC;padding:20px 40px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>This is an automated message. Please do not reply.</p></td></tr></table></td></tr></table></body></html>`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPA_URL  = Deno.env.get('SUPABASE_URL')!;
  const SVC_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!;
  const GMAIL_USER = Deno.env.get('GMAIL_USER');
  const GMAIL_PASS = Deno.env.get('GMAIL_APP_PASSWORD');
  const REPLY_TO   = toAscii(Deno.env.get('MAIL_REPLY_TO') || '');
  const FROM_NAME  = (toAscii(Deno.env.get('MAIL_FROM_NAME') || DEFAULT_FROM_NAME)
                       .replace(/["\\]/g, '').trim()) || DEFAULT_FROM_NAME;
  const authHeader = req.headers.get('Authorization') || '';

  const roleRes = await fetch(`${SUPA_URL}/rest/v1/rpc/is_pmo`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: authHeader, 'Content-Type': 'application/json' },
  });
  const isPMO = await roleRes.json();
  if (!isPMO) return json({ error: 'Forbidden: PMO role required' }, 403);

  let body: { email?: string; username?: string; full_name?: string; role?: string; send_email?: boolean; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const { email, username, full_name, role } = body;
  const sendEmail = body.send_email !== false; // absent/true = current default behaviour
  if (!email || !username || !role) return json({ error: 'email, username, and role are required' }, 400);
  if (!['project_manager', 'guest'].includes(role)) return json({ error: 'Role must be project_manager or guest' }, 400);

  const svc = { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' };
  const writeLog = async (status: string, detail?: string) => {
    await fetch(`${SUPA_URL}/rest/v1/notifications_log`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{ recipient_address: email, channel: 'email_invite', status, detail: detail ?? null }]),
    }).catch(() => {});
  };

  // ── No-email path: PMO sets the password directly, account is usable ──────
  // immediately, nothing is emailed. Same public.handle_new_user() trigger on
  // auth.users creates the matching user_profiles row either way, as long as
  // the metadata keys it reads (username/full_name/role) are present here
  // too — confirmed directly from the trigger's definition before writing this,
  // rather than assumed.
  if (!sendEmail) {
    const pw = body.password;
    if (!pw || pw.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

    const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({
        email, password: pw,
        email_confirm: true, // unconfirmed email silently blocks password login — confirmed and fixed once already this session
        user_metadata: { username, full_name: full_name || '', role },
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      await writeLog('failed', (err.message || err.msg || 'account creation failed').slice(0, 300));
      return json({ error: err.message || err.msg || 'Failed to create the account' }, createRes.status);
    }
    await writeLog('skipped', 'PMO chose not to send an invitation email; password was set directly');
    return json({ success: true, email_sent: false, no_email_mode: true, username });
  }

  // ── Email path: unchanged from before ──────────────────────────────────────
  const linkRes = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'invite',
      email,
      data: { username, full_name: full_name || '', role },
      redirect_to: PORTAL_URL,
    }),
  });

  if (!linkRes.ok) {
    const err = await linkRes.json();
    return json({ error: err.message || err.msg || 'Failed to generate invite link' }, linkRes.status);
  }

  const linkData = await linkRes.json();
  const hashedToken = linkData.hashed_token;
  if (!hashedToken) return json({ error: 'Supabase did not return a hashed_token for this invite' }, 500);
  const inviteLink = `${PORTAL_URL}?invite_token=${encodeURIComponent(hashedToken)}&type=invite`;

  const isPM = role === 'project_manager';
  const roleLabel = isPM ? 'Project Manager' : 'Guest';
  const roleDesc  = isPM
    ? 'You have access to your assigned projects and can post progress updates to the PMO.'
    : 'You have read-only access to the full CAPEX portfolio.';
  const displayName = full_name?.trim() || username;

  let emailSent = false;
  let emailError: string | null = null;

  if (!GMAIL_USER || !GMAIL_PASS) {
    emailError = 'GMAIL_USER / GMAIL_APP_PASSWORD secrets are not configured';
    await writeLog('failed', emailError);
  } else {
    const client = new SMTPClient({
      connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_PASS } },
    });
    try {
      await client.send({
        from: `"${FROM_NAME}" <${GMAIL_USER}>`,
        to: email,
        ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
        subject: toAscii('You have been invited to the Riphah PMO Portal'),
        content: mailSafe(buildText(displayName, roleLabel, roleDesc, inviteLink)),
        html: mailSafe(buildEmail(displayName, role, inviteLink)),
      });
      emailSent = true;
      await writeLog('sent');
    } catch (e) {
      emailError = String((e as Error)?.message || e).slice(0, 500);
      await writeLog('failed', emailError);
    } finally {
      try { await client.close(); } catch (_) { /* ignore */ }
    }
  }

  return json({ success: true, invite_link: inviteLink, email_sent: emailSent, email_error: emailError });
});
