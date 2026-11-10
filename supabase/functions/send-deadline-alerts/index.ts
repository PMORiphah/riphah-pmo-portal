import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   DEADLINE ALERTS — one digest, not one email per project.

   This used to send a separate email for every at-risk project to every PMO
   recipient. At 18 projects that is 18 emails a morning each, which is not a
   notification, it is a wall. Nobody reads the eighteenth.

   Now: a single email listing everything, grouped by urgency, with the project
   manager named against each row so it is obvious who to chase. The push
   notification was already a single summary and is unchanged.

   Project managers are deliberately NOT emailed by this job. They are written
   to only when PMO decides to, from the login alert, having read a preview.
   ───────────────────────────────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PORTAL_URL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const DEFAULT_FROM_NAME = 'Project Management Office (Secretariat)';
const DEFAULT_CC = [
  'owais.javed@riphah.edu.pk','abdullah.azhar@riphah.edu.pk',
  'usman.ahmad@riphah.edu.pk','atisham.haq@riphah.edu.pk',
];
const CC_LIST = (Deno.env.get('MAIL_CC') ?? DEFAULT_CC.join(','))
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const ccFor = (to: string) => CC_LIST.filter(a => a !== String(to || '').trim().toLowerCase());

const esc = (s: string) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const toAscii = (s: string) =>
  String(s ?? '')
    .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019\u201A\u201B]/g,"'")
    .replace(/[\u201C\u201D\u201E]/g,'"').replace(/\u2026/g,'...')
    .replace(/[\u00A0\u2000-\u200B]/g,' ').replace(/[^\x20-\x7E]/g,'')
    .replace(/\s+/g,' ').trim();
const fmtM = (n: number) =>
  (n/1e6).toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1}) + 'M';

const STAGE_LABEL: Record<string,string> = {
  pdd_not_submitted:'PDD Not Submitted', identified:'PDD Submitted', pdds_submitted:'PDD Submitted',
  df_review:'DF Review', ed_review:'ED Review', mt_review:'MT Review', approved:'Approved',
};
const stageLabel = (k: string) => STAGE_LABEL[k] || String(k ?? '').replace(/_/g,' ');
const hasCode = (c: string|null) => !!c && c.trim() !== '' && c.trim() !== '-';

type P = {
  id:string; code:string|null; name:string; campus:string|null; workflow_stage:string;
  df_recommended_amount:number; end_date:string; days_remaining:number;
  pm?:string|null; pm_email?:string|null;
};

const daysLabel = (d:number) =>
  d < 0 ? `${Math.abs(d)} day${Math.abs(d)===1?'':'s'} OVERDUE`
  : d === 0 ? 'Due TODAY'
  : `${d} day${d===1?'':'s'} remaining`;

const LOG_SHAPE = {
  project_id:null as string|null, project_code:null as string|null,
  recipient_id:null as string|null, recipient_address:null as string|null,
  channel:'', status:'', detail:'' as string|null,
};
const logRow = (o: Partial<typeof LOG_SHAPE>) => ({ ...LOG_SHAPE, ...o });

async function sendPushTo(SUPA_URL:string, SVC_KEY:string, userIds:string[], notification:Record<string,unknown>) {
  if (!userIds.length) return { sent:0, skipped:'no recipients' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-push`, {
      method:'POST',
      headers:{ apikey:SVC_KEY, Authorization:`Bearer ${SVC_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ user_ids:userIds, notification }),
    });
    return await res.json().catch(() => ({ error:'bad response' }));
  } catch (e) { return { error:String((e as Error)?.message ?? e) }; }
}

// Three bands, worst first, so the eye lands on what is already late.
const BANDS = [
  { key:'overdue', title:'Overdue',            colour:'#E4576B', test:(d:number)=>d<0 },
  { key:'week',    title:'Due within 7 days',  colour:'#E2A83D', test:(d:number)=>d>=0&&d<=7 },
  { key:'soon',    title:'Due within 20 days', colour:'#185078', test:(d:number)=>d>7 },
];

const buildText = (name:string, ps:P[]) => {
  const lines = BANDS.map(b => {
    const rows = ps.filter(p => b.test(p.days_remaining));
    if (!rows.length) return '';
    return `\n${b.title.toUpperCase()} (${rows.length})\n` + rows.map(p =>
      `  - ${hasCode(p.code) ? p.code + ' ' : ''}${p.name}\n` +
      `      ${daysLabel(p.days_remaining)}  |  ends ${p.end_date}  |  ${p.campus || 'Unspecified'}` +
      `  |  ${stageLabel(p.workflow_stage)}  |  PM: ${p.pm || 'not assigned'}`).join('\n');
  }).filter(Boolean).join('\n');
  return `Riphah International University - Project Management Office
Capital Projects Portal - Deadline Summary

Hello ${name},

${ps.length} project${ps.length===1?'':'s'} ${ps.length===1?'is':'are'} at or near ${ps.length===1?'its':'their'} planned end date.
${lines}

Open the portal: ${PORTAL_URL}

--
Project Management Office, Riphah International University
One summary each working day at 9:00 AM. No alerts at weekends. Please do not reply.`;
};

const buildEmail = (name:string, ps:P[]) => {
  const overdue = ps.filter(p => p.days_remaining < 0).length;
  const headline = overdue
    ? `${ps.length} project${ps.length===1?'':'s'} need attention, ${overdue} already overdue`
    : `${ps.length} project${ps.length===1?'':'s'} approaching the planned end date`;

  const section = (b: typeof BANDS[number]) => {
    const rows = ps.filter(p => b.test(p.days_remaining));
    if (!rows.length) return '';
    const body = rows.map(p => `
      <tr>
        <td style="padding:11px 12px;border-bottom:1px solid #E6EEF6;vertical-align:top;">
          ${hasCode(p.code) ? `<div style="font-size:10.5px;color:#7A98AE;font-family:'Courier New',monospace;letter-spacing:1px;">${esc(p.code!)}</div>` : ''}
          <div style="font-size:13.5px;color:#0D1929;font-weight:600;line-height:1.4;">${esc(p.name)}</div>
          <div style="font-size:11.5px;color:#7A98AE;margin-top:3px;">${esc(p.campus || 'Unspecified')} &middot; ${esc(stageLabel(p.workflow_stage))} &middot; PKR ${esc(fmtM(p.df_recommended_amount || 0))}</div>
        </td>
        <td style="padding:11px 12px;border-bottom:1px solid #E6EEF6;vertical-align:top;white-space:nowrap;">
          <div style="font-size:12.5px;color:${b.colour};font-weight:700;">${esc(daysLabel(p.days_remaining))}</div>
          <div style="font-size:11.5px;color:#7A98AE;margin-top:3px;">${esc(p.end_date)}</div>
        </td>
        <td style="padding:11px 12px;border-bottom:1px solid #E6EEF6;vertical-align:top;font-size:12.5px;color:#3A5068;white-space:nowrap;">
          ${esc(p.pm || 'Not assigned')}
        </td>
      </tr>`).join('');
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:collapse;">
      <tr><td colspan="3" style="padding:0 0 8px;">
        <span style="display:inline-block;background:${b.colour};color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:4px 12px;border-radius:16px;">${esc(b.title.toUpperCase())} &middot; ${rows.length}</span>
      </td></tr>
      <tr style="background:#F2F8FC;">
        <th align="left" style="padding:7px 12px;font-size:10.5px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #DDE8F4;">Project</th>
        <th align="left" style="padding:7px 12px;font-size:10.5px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #DDE8F4;">Deadline</th>
        <th align="left" style="padding:7px 12px;font-size:10.5px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #DDE8F4;">Project manager</th>
      </tr>${body}
    </table>`;
  };

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Deadline summary</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center"><table width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:28px 40px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; Deadline Summary</div></td></tr><tr><td style="height:4px;background:${overdue ? '#E4576B' : '#E2A83D'};"></td></tr><tr><td style="padding:34px 40px;"><h1 style="font-size:21px;color:#0D1929;margin:0 0 10px;font-weight:700;line-height:1.35;">${esc(headline)}</h1><p style="font-size:14.5px;color:#3A5068;line-height:1.7;margin:0 0 26px;">Hello <strong>${esc(name)}</strong>, here is everything at or near its planned end date this morning. The project manager is named against each row.</p>${BANDS.map(section).join('')}<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 26px;"><a href="${PORTAL_URL}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:14px 38px;border-radius:8px;font-weight:700;font-size:15px;">Open in PMO Portal</a></td></tr></table><div style="border-top:1px solid #E0ECF5;padding-top:18px;"><p style="font-size:12.5px;color:#8AA0B5;margin:0;line-height:1.65;">One summary each working day at 9:00 AM, covering every project within 20 days of its end date or already past it. Nothing is sent at weekends. Project managers are not copied on this email — you can write to them from the alert that appears when you sign in.</p></div></td></tr><tr><td style="background:#F2F8FC;padding:18px 40px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>This is an automated notification. Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
  const SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const GMAIL_USER = Deno.env.get('GMAIL_USER');
  const GMAIL_PASS = Deno.env.get('GMAIL_APP_PASSWORD');
  const REPLY_TO   = toAscii(Deno.env.get('MAIL_REPLY_TO') || '');
  const FROM_NAME  = (toAscii(Deno.env.get('MAIL_FROM_NAME') || DEFAULT_FROM_NAME)
                      .replace(/["\\]/g,'').trim()) || DEFAULT_FROM_NAME;
  const CRON_SECRET = Deno.env.get('CRON_SECRET');

  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error:'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const force  = url.searchParams.get('force') === '1';
  const dryRun = url.searchParams.get('dry_run') === '1';

  const weekday = new Intl.DateTimeFormat('en-GB',{ timeZone:'Asia/Karachi', weekday:'short' }).format(new Date());
  if (!force && !dryRun && (weekday === 'Sat' || weekday === 'Sun')) {
    return json({ success:true, skipped:'weekend', weekday, sent:0 });
  }

  const svc = { apikey:SVC_KEY, Authorization:`Bearer ${SVC_KEY}`, 'Content-Type':'application/json' };

  const projects: P[] = await (await fetch(`${SUPA_URL}/rest/v1/at_risk_projects?select=*&order=days_remaining.asc`, { headers:svc })).json();
  if (!Array.isArray(projects) || projects.length === 0) {
    return json({ success:true, projects:0, sent:0 });
  }

  // at_risk_projects carries no project manager, so attach one. A failure here
  // must not stop the digest — the rows simply read "Not assigned".
  try {
    const ids = projects.map(p => p.id).join(',');
    const asg = await (await fetch(`${SUPA_URL}/rest/v1/project_assignments?project_id=in.(${ids})&select=project_id,user_id`, { headers:svc })).json();
    const uids = [...new Set((asg||[]).map((a:{user_id:string}) => a.user_id))];
    if (uids.length) {
      const profs = await (await fetch(`${SUPA_URL}/rest/v1/user_profiles?id=in.(${uids.join(',')})&select=id,full_name,username,email`, { headers:svc })).json();
      const byUser = Object.fromEntries((profs||[]).map((u:{id:string}) => [u.id, u]));
      const byProject: Record<string, {full_name?:string;username?:string;email?:string}> = {};
      for (const a of (asg||[])) if (byUser[a.user_id]) byProject[a.project_id] = byUser[a.user_id];
      for (const p of projects) {
        const u = byProject[p.id];
        p.pm = u ? (u.full_name?.trim() || u.username || null) : null;
        p.pm_email = u?.email || null;
      }
    }
  } catch (_) { /* names are a nicety, the digest still goes */ }

  const logRows: Array<Record<string,unknown>> = [];
  let logError: string|null = null;
  const writeLog = async () => {
    if (!logRows.length) return;
    const res = await fetch(`${SUPA_URL}/rest/v1/notifications_log`, {
      method:'POST', headers:{ ...svc, Prefer:'return=minimal' }, body:JSON.stringify(logRows) });
    if (!res.ok) logError = `${res.status}: ${(await res.text()).slice(0,200)}`;
  };

  if (!GMAIL_USER || !GMAIL_PASS) {
    logRows.push(logRow({ channel:'email-digest', status:'failed',
      detail:'GMAIL_USER / GMAIL_APP_PASSWORD not configured' }));
    await writeLog();
    return json({ error:'Email is not configured yet', logError }, 503);
  }

  const recipients: Array<{id:string;email:string;full_name?:string;username?:string}> =
    await (await fetch(`${SUPA_URL}/rest/v1/user_profiles?role=eq.pmo&is_active=eq.true&notify_email=eq.true&select=id,email,full_name,username`, { headers:svc })).json();
  const valid = (Array.isArray(recipients)?recipients:[]).filter(r => r.email && r.email.trim() !== '');

  const overdueCount = projects.filter(p => p.days_remaining < 0).length;
  const push = await sendPushTo(SUPA_URL, SVC_KEY, valid.map(r => r.id), {
    title: projects.length === 1 ? 'Deadline alert' : `Deadline alert: ${projects.length} projects`,
    body: projects.length === 1
      ? `${projects[0].name} - ${daysLabel(projects[0].days_remaining)}`
      : overdueCount > 0
        ? `${projects.length} projects need attention, ${overdueCount} already overdue.`
        : `${projects.length} projects are approaching their end date.`,
    tag:'deadline-alert', url:'./',
  });
  logRows.push(logRow({ channel:'push', status:(push as {sent?:number})?.sent ? 'sent':'skipped',
    detail:`projects=${projects.length}; ${JSON.stringify(push).slice(0,250)}` }));

  if (!valid.length) {
    logRows.push(logRow({ channel:'email-digest', status:'skipped',
      detail:'No active PMO users with email notifications enabled' }));
    await writeLog();
    return json({ success:true, projects:projects.length, sent:0, skipped:'No eligible PMO recipients', logError });
  }

  if (dryRun) {
    await writeLog();
    return json({ success:true, dry_run:true, projects:projects.length,
                  recipients:valid.length, emails_that_would_send:valid.length,
                  overdue:overdueCount, push, logError });
  }

  const client = new SMTPClient({
    connection:{ hostname:'smtp.gmail.com', port:465, tls:true, auth:{ username:GMAIL_USER, password:GMAIL_PASS } },
  });

  const subject = toAscii(
    `Deadline Summary: ${projects.length} project${projects.length===1?'':'s'}` +
    (overdueCount ? `, ${overdueCount} overdue` : ''));

  let sent = 0;
  try {
    for (const r of valid) {
      const name = (r.full_name?.trim() || r.username || 'there');
      const cc = ccFor(r.email);
      try {
        await client.send({
          from: `"${FROM_NAME}" <${GMAIL_USER}>`,
          to: r.email,
          ...(cc.length ? { cc } : {}),
          ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
          subject,
          content: buildText(name, projects),
          html: buildEmail(name, projects),
        });
        sent++;
        logRows.push(logRow({ recipient_id:r.id, recipient_address:r.email, channel:'email-digest',
          status:'sent', detail:`projects=${projects.length}; overdue=${overdueCount}; cc=${cc.length}` }));
      } catch (e) {
        logRows.push(logRow({ recipient_id:r.id, recipient_address:r.email, channel:'email-digest',
          status:'failed', detail:String((e as Error)?.message || e).slice(0,500) }));
      }
    }
  } finally { try { await client.close(); } catch (_) { /* ignore */ } }

  await writeLog();
  return json({ success:true, projects:projects.length, recipients:valid.length,
                emails_sent:sent, overdue:overdueCount, weekday, push, logError });
});
