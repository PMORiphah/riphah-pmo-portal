import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { mailSafe, withFixedCc } from "../_shared/mailText.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PORTAL_URL = "https://pmoriphah.github.io/riphah-pmo-portal/";
const PDD_SUBMIT_URL = "https://pmo.riphah.edu.pk/login";
const DEFAULT_FROM_NAME = 'Project Management Office (Secretariat)';

const DEFAULT_CC = [
  'owais.javed@riphah.edu.pk',
  'abdullah.azhar@riphah.edu.pk',
  'usman.ahmad@riphah.edu.pk',
  'atisham.haq@riphah.edu.pk',
];
const CC_LIST = withFixedCc((Deno.env.get('MAIL_CC') ?? DEFAULT_CC.join(',')).split(','));
const ccFor = (toAddress: string) =>
  CC_LIST.filter(a => a !== String(toAddress || '').trim().toLowerCase());

const esc = (s: string) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

const hasCode = (c: string | null) => !!c && c.trim() !== '' && c.trim() !== '-';
const titleOf = (p: PddProject) => hasCode(p.code) ? `${p.code} - ${p.name}` : p.name;

type PddProject = {
  id: string; code: string | null; name: string; campus: string | null;
  start_date: string; days_until_start: number;
  pm_id: string | null; pm_name: string | null; pm_email: string | null;
};

const daysLabel = (d: number) => d === 0 ? 'starts TODAY' : `starts in ${d} day${d === 1 ? '' : 's'}`;

// PostgREST rejects a bulk insert whose objects do not all share the same keys
// (PGRST102 "All object keys must match") and fails the WHOLE batch. This
// function previously mixed 7-key sent/failed rows with 5-key "no PM assigned"
// rows, so whenever both occurred every log line for the run was lost.
// One shape now, with nulls where a field does not apply.
const LOG_SHAPE = {
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
// Each PM is notified about their own PDDs only — unlike the deadline alert,
// which is a single portfolio-wide summary to the PMO. Failures are swallowed:
// a push problem must never stop an email going out.
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

const buildText = (recipientName: string, projects: PddProject[]) => {
  const n = projects.length;
  const pdd = n === 1 ? 'PDD' : 'PDDs';
  const lines = projects.map(p =>
    `- ${titleOf(p)} (${p.campus || 'Unspecified'}) - ${p.start_date}, ${daysLabel(p.days_until_start)}`
  ).join('\n');
  return `Riphah International University - Project Management Office
Capital Projects Portal - PDD Submission Reminder

Hello ${recipientName},

You have ${n} project${n === 1 ? '' : 's'} with a planned start date within the next 20 days, and the ${pdd} (Project Definition Document${n === 1 ? '' : 's'}) below ${n === 1 ? 'has' : 'have'} not been submitted yet:

${lines}

Please submit ${n === 1 ? 'it' : 'these'} as soon as possible so the start date isn't put at risk.

Submit here: ${PDD_SUBMIT_URL}

--
Project Management Office
Riphah International University
This is an automated notification, sent at the PMO's request. Please do not reply to this email.`;
};

const buildEmail = (recipientName: string, projects: PddProject[]) => {
  const n = projects.length;
  const pdd = n === 1 ? 'PDD' : 'PDDs';
  const rows = projects.map(p => `<tr><td style="padding:10px 12px;border-bottom:1px solid #E0ECF5;font-size:13.5px;color:#2A3F55;">${esc(titleOf(p))}<div style="font-size:11px;color:#8AA0B5;margin-top:2px;">${esc(p.campus || 'Unspecified')}</div></td><td style="padding:10px 12px;border-bottom:1px solid #E0ECF5;font-size:13px;color:#3A5068;white-space:nowrap;">${esc(p.start_date)}</td><td style="padding:10px 12px;border-bottom:1px solid #E0ECF5;font-size:12px;font-weight:700;color:${p.days_until_start<=5?'#C0392B':'#B8860B'};white-space:nowrap;">${esc(daysLabel(p.days_until_start))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PDD submission reminder</title></head><body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);"><tr><td style="background:#185078;padding:28px 40px;"><div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div><div style="font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div><div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; PDD Submission Reminder</div></td></tr><tr><td style="height:4px;background:#D89840;"></td></tr><tr><td style="padding:36px 40px;"><h1 style="font-size:22px;color:#0D1929;margin:0 0 16px;font-weight:700;">${n === 1 ? 'PDD Pending Submission' : 'PDDs Pending Submission'}</h1><p style="font-size:15px;color:#3A5068;line-height:1.75;margin:0 0 22px;">Hello <strong>${esc(recipientName)}</strong>, you have <strong>${n}</strong> project${n === 1 ? '' : 's'} with a planned start date within the next 20 days, and the ${pdd} below ${n === 1 ? 'has' : 'have'} not been submitted yet.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;border:1px solid #E0ECF5;border-radius:8px;overflow:hidden;"><tr style="background:#F2F8FC;"><td style="padding:9px 12px;font-size:10px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;">Project</td><td style="padding:9px 12px;font-size:10px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;">Start Date</td><td style="padding:9px 12px;font-size:10px;color:#7A98AE;letter-spacing:1px;text-transform:uppercase;">Status</td></tr>${rows}</table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 28px;"><a href="${PDD_SUBMIT_URL}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;padding:14px 38px;border-radius:8px;font-weight:700;font-size:15px;">Submit ${n === 1 ? 'PDD' : 'PDDs'} Now</a></td></tr></table><div style="border-top:1px solid #E0ECF5;padding-top:20px;"><p style="font-size:13px;color:#8AA0B5;margin:0;line-height:1.65;">Please submit as soon as possible so the start date isn't put at risk. Submission link: <a href="${PDD_SUBMIT_URL}" style="color:#185078;">${PDD_SUBMIT_URL}</a></p></div></td></tr><tr><td style="background:#F2F8FC;padding:18px 40px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>This is an automated notification, sent at the PMO's request. Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;
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

  let body: { dry_run?: boolean; test_recipient?: string } = {};
  try { body = await req.json(); } catch { /* body is optional */ }
  const dryRun = body.dry_run === true;
  const testRecipient = typeof body.test_recipient === 'string' && body.test_recipient.trim()
    ? body.test_recipient.trim() : null;

  const svc = { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' };

  const pRes = await fetch(`${SUPA_URL}/rest/v1/pdd_pending_projects?select=*`, { headers: svc });
  const allProjects: PddProject[] = await pRes.json();

  if (!Array.isArray(allProjects) || allProjects.length === 0) {
    return json({ success: true, dry_run: dryRun, pms_emailed: 0, projects_covered: 0, unassigned_projects: 0, sent: 0 });
  }

  const withPM = allProjects.filter(p => p.pm_id && p.pm_email);
  const withoutPM = allProjects.filter(p => !p.pm_id || !p.pm_email);

  const byPM = new Map<string, { name: string; email: string; projects: PddProject[] }>();
  for (const p of withPM) {
    const key = p.pm_id!;
    if (!byPM.has(key)) byPM.set(key, { name: p.pm_name || 'there', email: p.pm_email!, projects: [] });
    byPM.get(key)!.projects.push(p);
  }

  if (dryRun) {
    return json({
      success: true, dry_run: true,
      pms_emailed: byPM.size, projects_covered: withPM.length, unassigned_projects: withoutPM.length,
      breakdown: [...byPM.entries()].map(([id, v]) => ({ pm_id: id, pm_name: v.name, pm_email: v.email, project_count: v.projects.length })),
      unassigned: withoutPM.map(p => ({ id: p.id, name: p.name })),
    });
  }

  const logRows: Array<Record<string, unknown>> = [];
  let logError: string | null = null;
  const writeLog = async () => {
    if (logRows.length === 0) return;
    const res = await fetch(`${SUPA_URL}/rest/v1/notifications_log`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify(logRows),
    });
    if (!res.ok) logError = `${res.status}: ${(await res.text()).slice(0, 200)}`;
  };

  if (withPM.length === 0) {
    return json({ success: true, dry_run: false, pms_emailed: 0, projects_covered: 0,
      unassigned_projects: withoutPM.length, sent: 0 });
  }

  if (!GMAIL_USER || !GMAIL_PASS) {
    return json({ error: 'Email is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD)' }, 503);
  }

  const targets = testRecipient
    ? [...byPM.entries()].sort((a, b) => b[1].projects.length - a[1].projects.length).slice(0, 1)
    : [...byPM.entries()];

  // Push to each PM about their own PDDs. Suppressed entirely in test mode:
  // a wording review must not buzz the real PMs' phones.
  let pushResults: Array<Record<string, unknown>> = [];
  if (!testRecipient) {
    for (const [pmId, { projects: pmProjects }] of targets) {
      const n = pmProjects.length;
      const soonest = pmProjects.reduce((a, b) => a.days_until_start <= b.days_until_start ? a : b);
      const r = await sendPushTo(SUPA_URL, SVC_KEY, [pmId], {
        title: n === 1 ? 'PDD pending submission' : `${n} PDDs pending submission`,
        body: n === 1
          ? `${titleOf(soonest)} ${daysLabel(soonest.days_until_start)}.`
          : `Soonest: ${titleOf(soonest)} ${daysLabel(soonest.days_until_start)}.`,
        tag: 'pdd-reminder',
        url: './',
      });
      pushResults.push({ pm_id: pmId, ...r });
      logRows.push(logRow({
        recipient_id: pmId, channel: 'push_pdd_reminder',
        status: (r as { sent?: number })?.sent ? 'sent' : 'skipped',
        detail: `projects=${n}; ${JSON.stringify(r).slice(0, 250)}`,
      }));
    }
  }

  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_PASS } },
  });

  let sent = 0;
  try {
    for (const [pmId, { name, email, projects: pmProjects }] of targets) {
      const toAddress = testRecipient || email;
      const cc = testRecipient ? [] : ccFor(email);
      const n = pmProjects.length;
      const subject = toAscii(`PDD Reminder - ${n} Project${n === 1 ? '' : 's'} Starting Soon${testRecipient ? ' [TEST]' : ''}`);
      try {
        await client.send({
          from: `"${FROM_NAME}" <${GMAIL_USER}>`,
          to: toAddress,
          ...(cc.length ? { cc } : {}),
          ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
          subject,
          content: mailSafe(buildText(name, pmProjects)),
          html: mailSafe(buildEmail(name, pmProjects)),
        });
        sent++;
        if (!testRecipient) {
          for (const p of pmProjects) {
            logRows.push(logRow({ project_id: p.id, project_code: p.code, recipient_id: pmId, recipient_address: email,
              channel: 'email_pdd_reminder', status: 'sent', detail: `days_until_start=${p.days_until_start}` }));
          }
        }
      } catch (e) {
        if (!testRecipient) {
          for (const p of pmProjects) {
            logRows.push(logRow({ project_id: p.id, project_code: p.code, recipient_id: pmId, recipient_address: email,
              channel: 'email_pdd_reminder', status: 'failed', detail: String((e as Error)?.message || e).slice(0, 500) }));
          }
        }
      }
    }
    if (!testRecipient) {
      for (const p of withoutPM) {
        logRows.push(logRow({ project_id: p.id, project_code: p.code, channel: 'email_pdd_reminder', status: 'skipped',
          detail: 'No project manager assigned' }));
      }
    }
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }

  await writeLog();
  return json({
    success: true, dry_run: false, test_mode: !!testRecipient,
    pms_emailed: sent, projects_covered: testRecipient ? (targets[0]?.[1].projects.length || 0) : withPM.length,
    unassigned_projects: testRecipient ? undefined : withoutPM.length,
    push: pushResults, logError,
  });
});
