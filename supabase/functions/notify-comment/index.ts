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

const DEFAULT_CC = [
  'owais.javed@riphah.edu.pk',
  'abdullah.azhar@riphah.edu.pk',
  'usman.ahmad@riphah.edu.pk',
  'atisham.haq@riphah.edu.pk',
];
const CC_LIST = (Deno.env.get('MAIL_CC') ?? DEFAULT_CC.join(','))
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const ccFor = (toAddress: string) =>
  CC_LIST.filter(a => a !== String(toAddress || '').trim().toLowerCase());

const esc = (s: string) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Mail HEADERS must be plain ASCII. Non-ASCII triggers RFC-2047 encoded-words,
// and the SMTP library's implementation of those is broken.
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

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '.' : s);

const ROLE_LABEL: Record<string,string> = {
  pmo: 'PMO', project_manager: 'Project Manager', guest: 'Guest',
};

// PostgREST rejects a bulk insert whose objects do not all share the same keys
// (PGRST102 "All object keys must match"), and the WHOLE batch fails, not just
// the odd row. Every log row is therefore built from one shape, with nulls
// where a field does not apply. An earlier version omitted keys on the push
// row and silently lost every log line for the run.
const LOG_SHAPE = {
  comment_id: null as string | null,
  project_id: null as string | null,
  project_code: null as string | null,
  recipient_id: null as string | null,
  recipient_address: null as string | null,
  channel: '',
  status: '',
  detail: '' as string | null,
};
const logRow = (o: Partial<typeof LOG_SHAPE>) => ({ ...LOG_SHAPE, ...o });

// ─── PUSH, ALONGSIDE EMAIL ────────────────────────────────────────────────────
// A second channel, not a replacement: desktop users and anyone who has not
// enabled push still receive the email exactly as before. Recipients are the
// same set the email goes to, so one preference governs both. Failures are
// swallowed — a push problem must never stop an email going out.
async function sendPushTo(
  SUPA_URL: string, SVC_KEY: string,
  userIds: string[], notification: Record<string, unknown>,
) {
  if (!userIds.length) return { sent: 0, skipped: 'no recipients' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        apikey: SVC_KEY,
        Authorization: `Bearer ${SVC_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_ids: userIds, notification }),
    });
    return await res.json().catch(() => ({ error: 'bad response' }));
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

const buildText = (o: {
  recipientName: string; authorName: string; authorRole: string;
  projectCode: string; projectName: string; body: string;
}) => {
  const roleLabel = ROLE_LABEL[o.authorRole] || 'User';
  const preview = o.body.length > 600 ? o.body.slice(0,600) + '...' : o.body;
  return `Riphah International University - Project Management Office
Capital Projects Portal

Hello ${o.recipientName},

${o.authorName} (${roleLabel}) posted an update on ${o.projectCode ? `${o.projectCode} - ` : ''}${o.projectName}.

"${preview}"

Reply from inside the portal so the whole team can see it:
${PORTAL_URL}

--
Project Management Office
Riphah International University
This is an automated notification. Please do not reply to this email.`;
};

const buildEmail = (o: {
  recipientName: string; authorName: string; authorRole: string;
  projectCode: string; projectName: string; body: string;
}) => {
  const roleLabel = ROLE_LABEL[o.authorRole] || 'User';
  const preview = o.body.length > 600 ? o.body.slice(0,600) + '\u2026' : o.body;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>New comment</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:28px 40px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; FY 2026-27</div></td></tr><tr><td style="height:4px;background:#D89840;"></td></tr><tr><td style="padding:36px 40px;"><h1 style="font-size:22px;color:#0D1929;margin:0 0 16px;font-weight:700;">New comment on ${esc(o.projectCode || o.projectName)}</h1><p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 20px;">Hello <strong>${esc(o.recipientName)}</strong>,</p><p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 22px;"><strong>${esc(o.authorName)}</strong> (${esc(roleLabel)}) posted an update on <strong>${esc(o.projectName)}</strong>.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="background:#F2F8FC;border-left:4px solid #185078;border-radius:6px;padding:16px 18px;">${o.projectCode ? `<div style="font-size:10px;color:#7A98AE;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">${esc(o.projectCode)}</div>` : ''}<div style="font-size:14.5px;color:#2A3F55;line-height:1.7;white-space:pre-wrap;">${esc(preview)}</div></td></tr></table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 28px;"><a href="${PORTAL_URL}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:14px 38px;border-radius:8px;font-weight:700;font-size:15px;">Open in PMO Portal</a></td></tr></table><div style="border-top:1px solid #E0ECF5;padding-top:20px;"><p style="font-size:13px;color:#8AA0B5;margin:0;line-height:1.65;">Reply from inside the portal so the whole team can see it: <a href="${PORTAL_URL}" style="color:#185078;">${PORTAL_URL}</a></p></div></td></tr><tr><td style="background:#F2F8FC;padding:18px 40px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>This is an automated notification. Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
  const SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const GMAIL_USER = Deno.env.get('GMAIL_USER');
  const GMAIL_PASS = Deno.env.get('GMAIL_APP_PASSWORD');
  const REPLY_TO   = toAscii(Deno.env.get('MAIL_REPLY_TO') || '');
  const FROM_NAME = (toAscii(Deno.env.get('MAIL_FROM_NAME') || DEFAULT_FROM_NAME)
                      .replace(/["\\]/g, '').trim()) || DEFAULT_FROM_NAME;

  const authHeader = req.headers.get('Authorization') || '';

  const meRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authHeader },
  });
  if (!meRes.ok) return json({ error: 'Unauthorized' }, 401);
  const me = await meRes.json();
  const callerId = me?.id;
  if (!callerId) return json({ error: 'Unauthorized' }, 401);

  let body: { comment_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const commentId = body.comment_id;
  if (!commentId) return json({ error: 'comment_id is required' }, 400);

  const svc = { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' };

  const cRes = await fetch(
    `${SUPA_URL}/rest/v1/comments?id=eq.${commentId}&select=id,body,project_id,author_id,author_name,author_role`,
    { headers: svc });
  const cRows = await cRes.json();
  const comment = Array.isArray(cRows) ? cRows[0] : null;
  if (!comment) return json({ error: 'Comment not found' }, 404);

  if (comment.author_id !== callerId) return json({ error: 'Forbidden' }, 403);

  const pRes = await fetch(
    `${SUPA_URL}/rest/v1/projects?id=eq.${comment.project_id}&select=id,code,name`,
    { headers: svc });
  const pRows = await pRes.json();
  const project = Array.isArray(pRows) ? pRows[0] : null;
  // No SAP code yet (PDD not submitted): name the project instead of a lone "-" (PMO, 10 Nov 2026).
  const projectCode = String(project?.code ?? '').trim();
  const projectName = project?.name || 'Project';

  let recipients: Array<{ id: string; email: string; full_name?: string; username?: string }> = [];
  let skipReason = '';

  if (comment.author_role === 'pmo') {
    const aRes = await fetch(
      `${SUPA_URL}/rest/v1/project_assignments?project_id=eq.${comment.project_id}&select=user_id`,
      { headers: svc });
    const assigns = await aRes.json();
    const ids = (Array.isArray(assigns) ? assigns : []).map((a: {user_id:string}) => a.user_id);
    if (ids.length === 0) {
      skipReason = 'No project manager assigned to this project yet';
    } else {
      const uRes = await fetch(
        `${SUPA_URL}/rest/v1/user_profiles?id=in.(${ids.join(',')})&is_active=eq.true&notify_email=eq.true&select=id,email,full_name,username`,
        { headers: svc });
      recipients = await uRes.json();
    }
  } else {
    const uRes = await fetch(
      `${SUPA_URL}/rest/v1/user_profiles?role=eq.pmo&is_active=eq.true&notify_email=eq.true&select=id,email,full_name,username`,
      { headers: svc });
    recipients = await uRes.json();
  }

  recipients = (Array.isArray(recipients) ? recipients : [])
    .filter(r => r.id !== comment.author_id && r.email && r.email.trim() !== '');

  const logRows: Array<Record<string, unknown>> = [];
  let logError: string | null = null;
  const writeLog = async () => {
    if (logRows.length === 0) return;
    const res = await fetch(`${SUPA_URL}/rest/v1/notifications_log`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify(logRows),
    });
    // Previously ignored, so a rejected batch lost every log line silently.
    if (!res.ok) logError = `${res.status}: ${(await res.text()).slice(0, 200)}`;
  };

  if (recipients.length === 0) {
    logRows.push(logRow({
      comment_id: comment.id, project_id: comment.project_id, project_code: projectCode || null,
      channel: 'email', status: 'skipped',
      detail: skipReason || 'No eligible recipients with email enabled',
    }));
    await writeLog();
    return json({ success: true, sent: 0, skipped: skipReason || 'No eligible recipients', logError });
  }

  // Push first: it is fast and independent of SMTP, so a slow mail server
  // never delays the alert reaching someone's lock screen.
  const pushResult = await sendPushTo(
    SUPA_URL, SVC_KEY,
    recipients.map(r => r.id),
    {
      title: `New comment on ${projectCode || clip(projectName, 45)}`,
      body: `${comment.author_name || 'A team member'}: ${clip(String(comment.body || ''), 120)}`,
      tag: `comment-${comment.project_id}`,
      url: './',
    },
  );
  logRows.push(logRow({
    comment_id: comment.id, project_id: comment.project_id, project_code: projectCode || null,
    channel: 'push',
    status: (pushResult as { sent?: number })?.sent ? 'sent' : 'skipped',
    detail: JSON.stringify(pushResult).slice(0, 300),
  }));

  if (!GMAIL_USER || !GMAIL_PASS) {
    for (const r of recipients) {
      logRows.push(logRow({
        comment_id: comment.id, project_id: comment.project_id, project_code: projectCode || null,
        recipient_id: r.id, recipient_address: r.email, channel: 'email', status: 'failed',
        detail: 'GMAIL_USER / GMAIL_APP_PASSWORD secrets are not configured',
      }));
    }
    await writeLog();
    return json({ error: 'Email is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD)', logError }, 503);
  }

  const subject = toAscii(projectCode ? `New comment on ${projectCode} - ${clip(projectName, 45)}` : `New comment on ${clip(projectName, 60)}`);

  let sent = 0;
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_PASS },
    },
  });

  try {
    for (const r of recipients) {
      const recipientName = (r.full_name?.trim() || r.username || 'there');
      const cc = ccFor(r.email);
      const payload = {
        recipientName,
        authorName: comment.author_name || 'A team member',
        authorRole: comment.author_role || '',
        projectCode, projectName,
        body: comment.body || '',
      };
      try {
        await client.send({
          from: `"${FROM_NAME}" <${GMAIL_USER}>`,
          to: r.email,
          ...(cc.length ? { cc } : {}),
          ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
          subject,
          content: mailSafe(buildText(payload)),
          html: mailSafe(buildEmail(payload)),
        });
        sent++;
        logRows.push(logRow({
          comment_id: comment.id, project_id: comment.project_id, project_code: projectCode || null,
          recipient_id: r.id, recipient_address: r.email, channel: 'email', status: 'sent',
          detail: `cc=${cc.length}`,
        }));
      } catch (e) {
        logRows.push(logRow({
          comment_id: comment.id, project_id: comment.project_id, project_code: projectCode || null,
          recipient_id: r.id, recipient_address: r.email, channel: 'email', status: 'failed',
          detail: String((e as Error)?.message || e).slice(0, 500),
        }));
      }
    }
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }

  await writeLog();
  return json({ success: true, sent, total: recipients.length, cc: CC_LIST, push: pushResult, logError });
});
