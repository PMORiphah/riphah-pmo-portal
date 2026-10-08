// The welcome email that invites a project manager to the portal (PMO, 8 Oct 2026).
// Pure: no Deno or browser APIs, so the portal renders the same preview the
// edge function sends (User Management → Welcome email imports this file).
//
// It shows the login page with numbered pointers, what to do right after the
// first sign-in (the 2-minute tour, changing the password), what a project
// manager does in the portal (only what RLS lets a PM do: WBS, deliverable
// ticks, Updates, past-project replies; no uploads, no project edits) and the
// person's own projects.

export type WelcomeProject = { code?: string | null; name: string; campus?: string | null; workflow_stage?: string | null; start_date?: string | null };
export type PastProject = { code?: string | null; name: string; fiscal_year?: string | null; campus?: string | null };
export type WelcomeInput = {
  name: string;                 // full name or username
  username: string;
  projects: WelcomeProject[];   // assigned projects (CAPEX and investment)
  past?: PastProject[];         // projects from previous fiscal years they manage (Past Projects)
  password?: string | null;     // a temporary password to include, or null
  note?: string | null;         // an optional line from the PMO
  imgBase: string;              // where email/login.jpg and email/after-signin.jpg are served
  portalUrl: string;
};

export const STAGE_LABEL: Record<string, string> = {
  pdd_not_submitted: "PDD not submitted", identified: "PDD submitted", df_review: "DF review",
  ed_review: "ED review", mt_review: "MT review", approved: "Approved", closed: "Closed",
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NAVY = "#185078", INK = "#0D1929", BODY = "#3A5068", MUTED = "#7A98AE", GOLD = "#D89840", PANEL = "#F2F8FC", LINE = "#DDE8F4";
const FONT = "Arial,Helvetica,sans-serif";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-09-01" → "1 Sep 2026" (no Date, so it reads the same everywhere).
export const fmtDate = (d?: string | null) => {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : "—";
};

// The person's main site: the campus most of their projects sit at.
export function mainSite(projects: WelcomeProject[]): string {
  const n: Record<string, number> = {};
  for (const p of projects) if (p.campus) n[p.campus] = (n[p.campus] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function composeWelcome(a: WelcomeInput) {
  const name = a.name.trim() || a.username;
  const projects = [...a.projects].sort((x, y) =>
    String(x.campus ?? "").localeCompare(String(y.campus ?? "")) || x.name.localeCompare(y.name));
  const n = projects.length;
  const site = mainSite(projects);
  const sites = new Set(projects.map(p => p.campus ?? "")).size;
  const pastList = [...(a.past ?? [])].sort((x, y) =>
    String(x.fiscal_year ?? "").localeCompare(String(y.fiscal_year ?? "")) || x.name.localeCompare(y.name));
  const past = pastList.length;
  const total = n + past;
  const img = (f: string) => `${a.imgBase.replace(/\/?$/, "/")}email/${f}`;
  const subject = "Welcome to the PMO Portal: your account is ready";
  const preheader = `Your PMO Portal account is ready. Sign in as ${a.username}, change your password and take the 2-minute tour.`;
  const projWord = `${n} project${n === 1 ? "" : "s"}`;

  // ── pieces ────────────────────────────────────────────────────────────────
  const p = (html: string, extra = "") =>
    `<p style="margin:0 0 14px;font:15px/1.7 ${FONT};color:${BODY};${extra}">${html}</p>`;
  const stepHead = (num: string, title: string, sub: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:34px 0 14px;"><tr>
<td width="40" valign="top" style="padding-top:1px;"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${NAVY};color:#ffffff;text-align:center;font:700 14px ${FONT};">${num}</div></td>
<td valign="top"><div style="font:700 18px/1.3 ${FONT};color:${INK};">${title}</div><div style="font:13px/1.5 ${FONT};color:${MUTED};margin-top:3px;">${sub}</div></td>
</tr></table>`;
  const picture = (file: string, alt: string, extra = "") =>
    `<img src="${img(file)}" width="576" alt="${esc(alt)}" style="display:block;width:100%;max-width:576px;height:auto;border:0;border-radius:10px;box-shadow:0 6px 22px rgba(13,25,41,0.22);${extra}">`;
  // The whole screen on a computer; on a phone (where the whole screen would be
  // too small to read) close-ups of the same numbered pointers instead. Mail
  // apps that ignore the media query simply show the whole screen.
  const shot = (file: string, alt: string, phone: string[]) =>
    `<div class="dsk">${picture(file, alt)}</div>`
    + `<!--[if !mso]><!--><div class="mob" style="display:none;max-height:0;overflow:hidden;">${phone.map((m, i) => picture(m, alt, i ? "margin-top:10px;" : "")).join("")}</div><!--<![endif]-->`;
  const pill = (t: string) =>
    `<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:${GOLD};color:${INK};text-align:center;font:700 11px ${FONT};vertical-align:1px;">${t}</span>`;
  const mono = (t: string) =>
    `<span style="display:inline-block;font:700 15px Consolas,Menlo,monospace;color:${INK};background:#ffffff;border:1px solid ${LINE};border-radius:6px;padding:4px 10px;letter-spacing:0.3px;white-space:nowrap;">${esc(t)}</span>`;
  const row = (label: string, value: string) => `<tr>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font:12px ${FONT};color:${MUTED};text-transform:uppercase;letter-spacing:1px;width:120px;vertical-align:middle;" class="lbl">${label}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font:15px ${FONT};color:${INK};vertical-align:middle;">${value}</td></tr>`;
  const card = (icon: string, title: string, body: string) => `
<td class="col" width="50%" valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:10px;"><tr><td style="padding:16px 16px 14px;">
<div style="font:20px/1 ${FONT};margin-bottom:8px;">${icon}</div>
<div style="font:700 14.5px/1.35 ${FONT};color:${INK};margin-bottom:5px;">${title}</div>
<div style="font:13.5px/1.6 ${FONT};color:${BODY};">${body}</div>
</td></tr></table></td>`;

  const cards: [string, string, string][] = [
    ["&#128193;", "Follow your projects", "Stage, DF recommended, approved and released budget, planned dates and documents for each of your projects."],
    ["&#9989;", "Tick deliverables", "On projects with an approved PDD or a charter, tick each item when it is delivered and add a short note."],
    ["&#128467;", "Plan the work (WBS)", "Break each project into tasks with dates and keep their progress up to date."],
    ["&#128172;", "Talk to the PMO", "Post progress or a question in <b>Updates</b>. The PMO is told straight away, and you are told when they reply."],
  ];
  if (past > 0) cards.push(["&#128336;", "Previous fiscal years", `Keep the PMO updated on the ${past} project${past === 1 ? "" : "s"} from previous fiscal years under <b>Past Projects</b>, and reply to their follow-ups there.`]);
  cards.push(["&#10024;", "Ask the assistant", "The robot at the bottom right answers questions such as &ldquo;Which of my projects are overdue?&rdquo;"]);
  const cardRows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const [x, y] = [cards[i], cards[i + 1]];
    cardRows.push(`<tr>${card(...x)}${y ? card(...y) : `<td class="col" width="50%" style="padding:6px;"></td>`}</tr>`);
  }

  const MAX = 25;
  const codeOf = (c?: string | null) => String(c ?? "").trim() && c !== "-" ? String(c).trim() : "pending";
  const shown = projects.slice(0, MAX);
  const th = `padding:8px 10px;font:700 11px ${FONT};color:${MUTED};text-transform:uppercase;letter-spacing:0.8px;text-align:left;border-bottom:2px solid ${LINE};`;
  const td = `padding:9px 10px;font:13.5px/1.45 ${FONT};color:${INK};border-bottom:1px solid ${LINE};vertical-align:top;`;
  const showSite = sites > 1;
  const projectTable = n ? `
${stepHead("&#9733;", `Your FY 2026-27 projects (${n})`, site && !showSite ? `All at ${esc(site)}` : "Already waiting for you in the portal")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th style="${th}">Project ID</th><th style="${th}">Project</th>${showSite ? `<th style="${th}">Site</th>` : ""}<th style="${th}">Planned start</th><th style="${th}">Stage</th></tr>
${shown.map(r => `<tr><td style="${td}white-space:nowrap;font-family:Consolas,Menlo,monospace;font-size:12.5px;color:${BODY};">${esc(codeOf(r.code))}</td><td style="${td}">${esc(r.name)}</td>${showSite ? `<td style="${td}color:${BODY};">${esc(r.campus ?? "")}</td>` : ""}<td style="${td}white-space:nowrap;color:${BODY};">${esc(fmtDate(r.start_date))}</td><td style="${td}white-space:nowrap;color:${BODY};">${esc(STAGE_LABEL[String(r.workflow_stage)] ?? "")}</td></tr>`).join("\n")}
</table>${n > MAX ? p(`&hellip; and ${n - MAX} more in the portal.`, "margin-top:10px;font-size:13px;") : ""}` : "";
  const pastShown = pastList.slice(0, MAX);
  const pastTable = past ? `
${stepHead("&#9719;", `Projects from previous fiscal years (${past})`, "Under Past Projects in the portal")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th style="${th}">Project ID</th><th style="${th}">Project</th><th style="${th}">FY</th></tr>
${pastShown.map(r => `<tr><td style="${td}white-space:nowrap;font-family:Consolas,Menlo,monospace;font-size:12.5px;color:${BODY};">${esc(codeOf(r.code))}</td><td style="${td}">${esc(r.name)}</td><td style="${td}white-space:nowrap;color:${BODY};">${esc(r.fiscal_year ?? "—")}</td></tr>`).join("\n")}
</table>${past > MAX ? p(`&hellip; and ${past - MAX} more in the portal.`, "margin-top:10px;font-size:13px;") : ""}` : "";

  const passwordCell = a.password
    ? `${mono(a.password)}<div style="font:12.5px/1.5 ${FONT};color:#A15C07;margin-top:6px;">Temporary. Please change it after you sign in (step 2).</div>`
    : `<span style="font:14px ${FONT};color:${BODY};">The PMO will share it with you separately.</span>`;

  const pastWord = `${past} project${past === 1 ? "" : "s"}`;
  const scope = past
    ? `You are the project manager for <b>${projWord} in FY 2026-27</b> and <b>${pastWord} from previous fiscal years</b>: <b>${total} projects in all</b>${site && !showSite ? `, mostly at <b>${esc(site)}</b>` : ""}. They are already in the portal for you.`
    : `You are the project manager for <b>${projWord} in FY 2026-27</b>${site && !showSite ? ` at <b>${esc(site)}</b>` : ""}, and they are already in the portal for you.`;
  const intro = (n || past)
    ? `The Project Management Office has opened your account on the <b>PMO Capital Projects Portal</b>, where Riphah&rsquo;s capital projects are planned, approved and followed up: the current FY 2026-27 portfolio and projects from previous fiscal years. ${scope}`
    : `The Project Management Office has opened your account on the <b>PMO Capital Projects Portal</b>, where Riphah&rsquo;s FY 2026-27 capital projects are planned, approved and followed up. Your projects will appear as soon as the PMO assigns them to you.`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>${esc(subject)}</title>
<style>
@media (max-width:620px){
  .wrap{padding:16px 8px !important}
  .inner{padding:24px 18px !important}
  .col{display:block !important;width:100% !important;box-sizing:border-box}
  .hero{font-size:24px !important}
  .dsk{display:none !important}
  .mob{display:block !important;max-height:none !important;overflow:visible !important}
  .lbl{width:86px !important}
}
</style></head>
<body style="margin:0;padding:0;background:#E8F0F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="wrap" style="background:#E8F0F8;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
<tr><td style="background:${NAVY};padding:28px 32px;">
<div style="font:10px ${FONT};color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div>
<div style="font:700 21px ${FONT};color:#ffffff;">Project Management Office</div>
<div style="font:10px ${FONT};color:rgba(255,255,255,0.45);margin-top:6px;letter-spacing:2px;text-transform:uppercase;">Capital Projects Portal &middot; FY 2026-27</div>
</td></tr>
<tr><td style="height:4px;background:${GOLD};line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td class="inner" style="padding:34px 32px 30px;">

<div class="hero" style="font:700 27px/1.25 ${FONT};color:${INK};margin:0 0 18px;">Welcome to the PMO Portal</div>
${p(`Dear <b>${esc(name)}</b>,`)}
${p(intro)}
${a.note && a.note.trim() ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;"><tr><td style="border-left:4px solid ${GOLD};background:#FDF8EE;border-radius:6px;padding:14px 16px;font:italic 14.5px/1.7 ${FONT};color:${BODY};white-space:pre-wrap;">${esc(a.note.trim())}<div style="font:normal 12px ${FONT};color:${MUTED};margin-top:6px;">&mdash; Project Management Office</div></td></tr></table>` : ""}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:12px;margin:8px 0 6px;"><tr><td style="padding:18px 22px 20px;">
<div style="font:700 11px ${FONT};color:${NAVY};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">Your account</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row("Username", mono(a.username))}
${row("Password", passwordCell)}
${row("Portal", `<a href="${a.portalUrl}" style="color:${NAVY};font-weight:700;text-decoration:none;word-break:break-all;">${esc(a.portalUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`)}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td style="border-radius:8px;background:${GOLD};">
<a href="${a.portalUrl}" style="display:inline-block;padding:13px 30px;font:700 15px ${FONT};color:${INK};text-decoration:none;border-radius:8px;">Open the PMO Portal &rarr;</a>
</td></tr></table>
</td></tr></table>

${stepHead("1", "Sign in", "Works on a computer, an iPhone or an Android phone")}
${shot("login.jpg", "The PMO Portal login page: 1 username, 2 password, 3 Sign in", ["login-m.jpg"])}
${p(`Type your username ${pill("1")} and password ${pill("2")}, then press <b>Sign in</b> ${pill("3")}. On your own computer or phone, tick <b>Remember me</b> so you stay signed in. If you forget your password, ask the PMO to reset it.`, "margin-top:16px;")}

${stepHead("2", "Right after you sign in", "Two things worth doing first")}
${shot("after-signin.jpg", "The first screen after sign-in: 4 the 2-minute tour, 5 Change password", ["tour-m.jpg", "password-m.jpg"])}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
<tr><td width="34" valign="top" style="padding-top:2px;">${pill("4")}</td><td valign="top" style="padding-bottom:14px;">
<div style="font:700 15px ${FONT};color:${INK};margin-bottom:3px;">Take the 2-minute tour</div>
<div style="font:14px/1.7 ${FONT};color:${BODY};">On a computer, the portal assistant greets you and offers a short guided tour: your projects, a project&rsquo;s page (financials, timeline, WBS, documents), how to post updates and how to reach the PMO. Press <b>Start tour</b>. You can take it again any time from <b>Take the tour</b> at the bottom of the left menu. The tour runs on a computer, not on a phone.</div>
</td></tr>
<tr><td width="34" valign="top" style="padding-top:2px;">${pill("5")}</td><td valign="top">
<div style="font:700 15px ${FONT};color:${INK};margin-bottom:3px;">Change your password <span style="font:700 10.5px ${FONT};color:#A15C07;background:#FDF1DC;border-radius:10px;padding:2px 8px;letter-spacing:0.5px;vertical-align:2px;">RECOMMENDED</span></div>
<div style="font:14px/1.7 ${FONT};color:${BODY};">Your first password was set by the PMO. Press <b>Change password</b> at the bottom of the left menu (on a phone, open the &#9776; menu first) and choose a new one that only you know, at least 8 characters.</div>
</td></tr></table>

${stepHead("3", "What you do in the portal", "As a project manager")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${cardRows.join("\n")}
</table>

${projectTable}
${pastTable}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 4px;background:${INK};border-radius:12px;"><tr><td style="padding:20px 22px;">
<div style="font:700 15px ${FONT};color:#ffffff;margin-bottom:8px;">&#128241; Keep it on your phone</div>
<div style="font:13.5px/1.75 ${FONT};color:rgba(255,255,255,0.78);"><b style="color:#F3C877;">iPhone:</b> open the portal in Safari, tap Share, then <b style="color:#ffffff;">Add to Home Screen</b>, and open it from the new icon. From the &#9776; menu you can then turn on notifications and Face ID sign-in.<br><b style="color:#F3C877;">Android:</b> open it in Chrome, tap &#8942;, then <b style="color:#ffffff;">Add to Home screen</b>.</div>
</td></tr></table>

${p(`Questions? Write to the PMO at <a href="mailto:pmu@riphah.edu.pk" style="color:${NAVY};font-weight:700;text-decoration:none;">pmu@riphah.edu.pk</a>, or open <b>Team &amp; About</b> in the portal for our contacts.`, "margin-top:24px;")}
${p(`Kind regards,<br><b style="color:${INK};">Project Management Office</b><br>Riphah International University`, "margin-bottom:0;")}

</td></tr>
<tr><td style="background:${PANEL};padding:18px 32px;border-top:1px solid ${LINE};">
<p style="margin:0;font:12px/1.6 ${FONT};color:${MUTED};"><b style="color:#506070;">Project Management Office</b> &middot; Riphah International University<br>This email was sent to you by the PMO to set up your portal account.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Dear ${name},`,
    "",
    (n || past) ? `The Project Management Office has opened your account on the PMO Capital Projects Portal, where Riphah's capital projects are planned, approved and followed up. You are the project manager for ${projWord} in FY 2026-27${past ? ` and ${pastWord} from previous fiscal years (${total} projects in all)` : ""}.`
      : "The Project Management Office has opened your account on the PMO Capital Projects Portal. Your projects will appear as soon as the PMO assigns them to you.",
    ...(a.note && a.note.trim() ? ["", a.note.trim(), "- Project Management Office"] : []),
    "",
    "YOUR ACCOUNT",
    `Portal:   ${a.portalUrl}`,
    `Username: ${a.username}`,
    `Password: ${a.password ? `${a.password} (temporary: please change it after you sign in)` : "the PMO will share it with you separately"}`,
    "",
    "1. SIGN IN",
    "Open the portal, type your username and password, then press Sign in. Tick Remember me on your own device.",
    "",
    "2. RIGHT AFTER YOU SIGN IN",
    "- Take the 2-minute tour: on a computer the portal assistant offers it when you sign in (Start tour). You can take it again from 'Take the tour' at the bottom of the left menu.",
    "- Change your password (recommended): 'Change password' at the bottom of the left menu (on a phone, open the menu first).",
    "",
    "3. WHAT YOU DO IN THE PORTAL",
    "- Follow your projects: stage, budget, dates and documents.",
    "- Tick deliverables as they are delivered, with a short note.",
    "- Plan the work (WBS) and keep progress up to date.",
    "- Talk to the PMO in Updates.",
    ...(past > 0 ? [`- Keep the PMO updated on your ${pastWord} from previous fiscal years under Past Projects.`] : []),
    "- Ask the assistant, e.g. 'Which of my projects are overdue?'",
    ...(n ? ["", `YOUR FY 2026-27 PROJECTS (${n})`, ...shown.map((r, i) => `${i + 1}. ${codeOf(r.code)}  ${r.name}${showSite && r.campus ? ` (${r.campus})` : ""}  - planned start ${fmtDate(r.start_date)} - ${STAGE_LABEL[String(r.workflow_stage)] ?? ""}`), ...(n > MAX ? [`... and ${n - MAX} more in the portal.`] : [])] : []),
    ...(past ? ["", `PROJECTS FROM PREVIOUS FISCAL YEARS (${past})`, ...pastShown.map((r, i) => `${i + 1}. ${codeOf(r.code)}  ${r.name} (${r.fiscal_year ?? "-"})`), ...(past > MAX ? [`... and ${past - MAX} more in the portal.`] : [])] : []),
    "",
    "On your phone: iPhone - Safari, Share, Add to Home Screen. Android - Chrome, menu, Add to Home screen.",
    "",
    "Questions? pmu@riphah.edu.pk",
    "",
    "Kind regards,",
    "Project Management Office",
    "Riphah International University",
  ].join("\n");

  return { subject, text, html };
}
