// goals-reminders — pure parts (which tasks, the email), shared by the function and its test.
export type Row = Record<string, unknown>;
export const STEPS = [3, 7, 15, 30];            // days overdue that get a reminder (PMO, 16 Nov 2026)
export const MEMBER_LISTS = ["pmo_todo", "head_pmo", "manager_pmo", "exec_pmo", "po1", "po2"];
const DEFAULT_NAMES: Record<string, string> = {
  pmo_todo: "PMO", head_pmo: "Mr. Yahya Khan", manager_pmo: "Mr. Owais Javed",
  exec_pmo: "Engr. Usman Ahmed Umar", po1: "Mr. Abdullah Azhar", po2: "Mr. Atisham ul Haq",
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Today's date in Pakistan (UTC+5, no daylight saving) as YYYY-MM-DD. */
export const todayPkt = (now = new Date()) => new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const dayNo = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / 86400_000);
export const nice = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MON[m - 1]} ${y}`; };

export type Due = { id: string; list: string; title: string; note: string; due: string; days: number; priority: string; project: string };

/** Weekday of a YYYY-MM-DD date: 0 Sunday ... 6 Saturday. */
export const weekday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
/** Emails go out Monday to Friday only (PMO, 16 Nov 2026); Monday also covers what fell on Saturday and Sunday. */
export const catchUpDays = (today: string) => weekday(today) === 1 ? 2 : 0;

/** Open tasks with a due date that are due today or exactly 3/7/15/30 days overdue (on a Monday also those
 *  that reached one of these on Saturday or Sunday), grouped by list. */
export function pick(tasks: Row[], today: string, projectName: (t: Row) => string = () => "", catchUp = 0) {
  const by: Record<string, Due[]> = {};
  for (const t of tasks) {
    if (t.done || t.removed || !t.due_date) continue;
    const list = String(t.list); if (!MEMBER_LISTS.includes(list)) continue;
    const due = String(t.due_date).slice(0, 10);
    const days = dayNo(today) - dayNo(due);
    let hit = false;
    for (let k = 0; k <= catchUp; k++) if (days - k === 0 || STEPS.includes(days - k)) hit = true;
    if (!hit) continue;
    (by[list] ??= []).push({ id: String(t.id), list, title: String(t.title ?? "").trim() || "(untitled task)", note: String(t.note ?? "").trim(),
      due, days, priority: String(t.priority ?? "normal"), project: projectName(t) });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => b.days - a.days || a.title.localeCompare(b.title));
  return by;
}

export const nameFor = (list: string, team: Row | null | undefined) =>
  list === "pmo_todo" ? "PMO" : String((team?.[list] as Row | undefined)?.name ?? "").trim() || DEFAULT_NAMES[list] || list;

const status = (d: Due) => d.days === 0 ? "Due today" : `${d.days} day${d.days === 1 ? "" : "s"} overdue`;

export function reminderEmail(name: string, items: Due[], today: string, portalUrl: string, test = false) {
  const dueN = items.filter(i => i.days === 0).length, overN = items.length - dueN;
  const parts = [dueN ? `${dueN} task${dueN > 1 ? "s" : ""} due today` : "", overN ? `${overN} overdue` : ""].filter(Boolean).join(", ");
  const subject = `${test ? "[Test] " : ""}PMO Goals: ${parts}`;
  const greet = name === "PMO" ? "Dear PMO team," : `Dear ${name},`;
  const lead = items.length === 1
    ? (items[0].days === 0 ? "The following task on PMO Goals is due today:" : `The following task on PMO Goals is ${status(items[0]).toLowerCase()}:`)
    : "The following tasks on PMO Goals need your attention:";
  const text = [greet, "", lead, "",
    ...items.map(i => `- ${i.title}${i.project ? ` (${i.project})` : ""}: ${status(i)} (due ${nice(i.due)})${i.note ? `\n  Note: ${i.note}` : ""}`),
    "", `Please complete ${items.length > 1 ? "them" : "it"}, or update the due date on PMO Goals if it has changed:`, portalUrl, "",
    "Project Management Office", "Riphah International University", "", "This is an automated reminder sent only to you."].join("\n");
  const row = (i: Due) => {
    const late = i.days > 0, c = late ? (i.days >= 15 ? "#B42318" : "#C2410C") : "#0E7C6B", bg = late ? (i.days >= 15 ? "#FEE4E2" : "#FFEDD5") : "#D9F2EC";
    return `<tr><td style="padding:14px 16px;border-bottom:1px solid #E4ECF3;vertical-align:top;">
<div style="font-size:15px;font-weight:700;color:#15233A;line-height:1.4;">${esc(i.title)}${i.priority === "high" ? ` <span style="font-size:11px;font-weight:700;color:#7A5BA6;">&#9873; High</span>` : ""}</div>
${i.project ? `<div style="font-size:12px;color:#5A7184;margin-top:3px;">${esc(i.project)}</div>` : ""}
${i.note ? `<div style="font-size:13px;color:#3B4F60;margin-top:6px;line-height:1.5;">${esc(i.note)}</div>` : ""}</td>
<td style="padding:14px 16px;border-bottom:1px solid #E4ECF3;vertical-align:top;white-space:nowrap;text-align:right;">
<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${c};font-size:12px;font-weight:700;">${status(i)}</span>
<div style="font-size:12px;color:#5A7184;margin-top:6px;">Due ${nice(i.due)}</div></td></tr>`;
  };
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PMO Goals</title></head>
<body style="margin:0;padding:0;background:#E8F0F8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 10px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
<tr><td style="background:#185078;padding:24px 32px;"><div style="font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div>
<div style="font-size:20px;font-weight:700;color:#ffffff;">PMO Goals reminder</div><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:5px;">${esc(nice(today))}</div></td></tr>
<tr><td style="height:4px;background:${overN ? "#E4573D" : "#F2A93B"};"></td></tr>
<tr><td style="padding:26px 32px 8px;"><p style="font-size:15px;color:#15233A;margin:0 0 10px;">${esc(greet)}</p><p style="font-size:14px;color:#3B4F60;margin:0 0 16px;line-height:1.6;">${esc(lead)}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E4ECF3;border-radius:10px;border-collapse:separate;overflow:hidden;">${items.map(row).join("")}</table>
<p style="font-size:13px;color:#3B4F60;margin:18px 0 6px;line-height:1.6;">Please complete ${items.length > 1 ? "them" : "it"}, or update the due date on PMO Goals if it has changed.</p>
<p style="margin:16px 0 22px;"><a href="${portalUrl}" style="display:inline-block;background:#185078;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;">Open PMO Goals</a></p></td></tr>
<tr><td style="background:#F2F8FC;padding:14px 32px;border-top:1px solid #DDE8F4;"><p style="font-size:12px;color:#7A98AE;margin:0;line-height:1.6;"><strong style="color:#506070;">Project Management Office</strong> &middot; Riphah International University<br>An automated reminder sent only to you, Monday to Friday: on the due date, then 3, 7, 15 and 30 days after it while the task is open (weekend dates are covered on Monday).</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
