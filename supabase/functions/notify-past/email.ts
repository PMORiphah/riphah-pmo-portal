// The Past Projects follow-up email (PMO, 5 Oct 2026). Pure, so it can be
// rendered and checked without sending anything.
// It names the project manager and their campus/site, quotes the message, and
// lists the manager's past projects (project ID + name, FY, campus/site) so they
// know exactly which projects the PMO is asking about. A message tagged to one
// project highlights it in the list.
export type Row = Record<string, unknown>;

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function composeEmail(a: {
  kind: "pm" | "project"; fromPmo: boolean; toName: string; author: string; pmName: string;
  site: string; body: string; project: Row | null; listed: Row[]; projectId: string | null; link: string;
  // 6 Oct 2026: two guest accounts may ask too. `asker` = their name on a request
  // to the manager; `greet` = whom a reply is addressed to (default the PMO);
  // `asked` = a viewer's question reported to the PMO rather than a reply.
  asker?: string; greet?: string; asked?: boolean;
}) {
  const { kind, fromPmo, toName, author, pmName, site, body, project, listed, projectId, link,
          asker, greet, asked } = a;
  const dear = fromPmo ? `Dear ${toName},` : `Dear ${greet || "PMO"},`;
  const what = (h: (x: string) => string) => fromPmo
    ? `${asker ? h(asker) : "The PMO"} has asked for an update on ${h(about)}:`
    : asked ? `${h(author)} asked ${h(pmName)} for an update on ${h(about)}:`
    : `${h(author)} replied about ${h(about)}:`;
  const pid = (r: Row) => String(r.code ?? "").trim() || "—";
  const statusOf = (r: Row) => r.status ? String(r.status).replace(/_/g, " ") : "";
  const mark = (r: Row) => kind === "pm" && !!projectId && r.id === projectId;

  const about = project
    ? `${project.code ? `${project.code} ` : ""}${project.name} (${project.fiscal_year}${project.campus ? `, ${project.campus}` : ""})`
    : `the ${listed.length === 1 ? "project" : `${listed.length} projects`} listed below`;
  const subject = fromPmo
    ? `${asker ? `Follow-up from ${asker}` : "PMO follow-up"} (${site}): ${project ? project.name : `Update requested on ${listed.length} ${listed.length === 1 ? "project" : "projects"}`}`
    : `${asked ? `Follow-up from ${author}` : `Reply from ${author}`} (${site}): ${project ? project.name : `Update on ${listed.length} ${listed.length === 1 ? "project" : "projects"}`}`;
  const heading = kind === "pm" ? `Projects of ${pmName} (${listed.length})` : "Project";

  const listText = listed.map((r, i) =>
    `${i + 1}. ${pid(r)}  ${r.name} (${r.fiscal_year ?? "—"}${r.campus ? `, ${r.campus}` : ""})`
    + (mark(r) ? "  <- this message is about this project" : ""));
  const text = [
    dear,
    "",
    `Project manager: ${pmName}`,
    `Campus/Site: ${site}`,
    "",
    what(x => x),
    "",
    body,
    "",
    ...(listed.length ? [`${heading}:`, ...listText, ""] : []),
    fromPmo ? `Please reply in the portal: ${link}` : `Open the conversation: ${link}`,
    "",
    "Project Management Office",
  ].join("\n");

  const cell = "padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top";
  const head = `${cell};font-size:12px;color:#374151;background:#f6f8fb`;
  // Columns that repeat one value on every row (one site, one FY) are left out,
  // so the table fits a phone; the site is named at the top anyway.
  const many = (k: string) => new Set(listed.map(r => String(r[k] ?? ""))).size > 1;
  const showFy = many("fiscal_year"), showSite = many("campus");
  const listHtml = listed.length ? `<p style="margin:18px 0 6px"><b>${esc(heading)}</b>${!showFy && listed[0]?.fiscal_year ? ` <span style="color:#6b7280;font-weight:normal">· ${esc(listed[0].fiscal_year)}</span>` : ""}</p>
<table style="border-collapse:collapse;font-size:13px;width:100%;max-width:680px">
<tr><th style="${head}">#</th><th style="${head}">Project ID</th><th style="${head}">Project name</th>${showFy ? `<th style="${head}">FY</th>` : ""}${showSite ? `<th style="${head}">Campus/Site</th>` : ""}</tr>
${listed.map((r, i) => `<tr${mark(r) ? ' style="background:#fdf6e3"' : ""}><td style="${cell};color:#6b7280">${i + 1}</td><td style="${cell};white-space:nowrap;font-family:Consolas,monospace">${esc(pid(r))}</td><td style="${cell}">${esc(r.name)}${mark(r) ? ' <span style="color:#a16207;font-size:11px">(this message)</span>' : ""}${statusOf(r) ? `<div style="color:#6b7280;font-size:11px;text-transform:capitalize">${esc(statusOf(r))}</div>` : ""}</td>${showFy ? `<td style="${cell};white-space:nowrap">${esc(r.fiscal_year ?? "—")}</td>` : ""}${showSite ? `<td style="${cell}">${esc(r.campus ?? "—")}</td>` : ""}</tr>`).join("\n")}
</table>` : "";

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
<p>${esc(dear)}</p>
<table style="font-size:13px;margin:4px 0 12px;border-collapse:collapse"><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Project manager</td><td><b>${esc(pmName)}</b></td></tr><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Campus/Site</td><td><b>${esc(site)}</b></td></tr></table>
<p>${what(x => `<b>${esc(x)}</b>`)}</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #c9a227;background:#f6f8fb;white-space:pre-wrap">${esc(body)}</blockquote>
${listHtml}
<p style="margin-top:18px"><a href="${link}" style="display:inline-block;padding:9px 16px;background:#1f4e8c;color:#fff;text-decoration:none;border-radius:6px">${fromPmo ? "Reply in the portal" : "Open the conversation"}</a></p>
<p style="color:#6b7280;font-size:12px">Project Management Office, Riphah International University</p></div>`;
  return { subject, text, html };
}

// ── Ask status (PMO, 20 Oct 2026; docs/plans/status-requests.md) ─────────────
// statusRequestEmail: one email to the manager listing every project asked about
// (a bulk request names them all), asking plainly for the % completed and a
// justification; `forPmo` = the PMO's copy when a past-project viewer asked.
// statusAnswerEmail: the manager's answer, to the PMO or (`forAsker`) to a viewer
// who asked. Both name the manager and the campus/site, as composeEmail does.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "20 Oct 2026" in Pakistan time ("" without a date). */
export const dayPkt = (iso: unknown) => {
  const t = iso ? new Date(String(iso)).getTime() : NaN;
  if (isNaN(t)) return "";
  const d = new Date(t + 5 * 3600e3);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** The asker's note: everything after "Status requested" on the first line. */
export const statusNote = (body: unknown) => {
  const lines = String(body ?? "").split("\n");
  return (lines[0].trim() === "Status requested" ? lines.slice(1) : lines).join("\n").trim();
};

const CELL = "padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top";
const HEAD = `${CELL};font-size:12px;color:#374151;background:#f6f8fb`;
const BUTTON = "display:inline-block;padding:9px 16px;background:#1f4e8c;color:#fff;text-decoration:none;border-radius:6px";
const codeOf = (r: Row) => String(r.code ?? "").trim() || "—";
const labelOf = (r: Row) => `${r.code ? `${r.code} ` : ""}${r.name} (${r.fiscal_year ?? "—"}${r.campus ? `, ${r.campus}` : ""})`;
const facts = (pmName: string, site: string) => `<table style="font-size:13px;margin:4px 0 12px;border-collapse:collapse"><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Project manager</td><td><b>${esc(pmName)}</b></td></tr><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Campus/Site</td><td><b>${esc(site)}</b></td></tr></table>`;
const quote = (s: string) => `<blockquote style="margin:6px 0 12px;padding:10px 14px;border-left:3px solid #c9a227;background:#f6f8fb;white-space:pre-wrap">${esc(s)}</blockquote>`;
const wrap = (inner: string) => `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
${inner}
<p style="color:#6b7280;font-size:12px">Project Management Office, Riphah International University</p></div>`;

// The projects as a table; FY and site columns only when they differ (phones).
// With `link`, each name opens its project (a bulk request).
function projectTable(ps: Row[], heading: string, link?: (id: string) => string) {
  const many = (k: string) => new Set(ps.map(r => String(r[k] ?? ""))).size > 1;
  const showFy = many("fiscal_year"), showSite = many("campus");
  const statusOf = (r: Row) => r.status ? String(r.status).replace(/_/g, " ") : "";
  return `<p style="margin:18px 0 6px"><b>${esc(heading)}</b>${!showFy && ps[0]?.fiscal_year ? ` <span style="color:#6b7280;font-weight:normal">· ${esc(ps[0].fiscal_year)}</span>` : ""}</p>
<table style="border-collapse:collapse;font-size:13px;width:100%;max-width:680px">
<tr><th style="${HEAD}">#</th><th style="${HEAD}">Project ID</th><th style="${HEAD}">Project name</th>${showFy ? `<th style="${HEAD}">FY</th>` : ""}${showSite ? `<th style="${HEAD}">Campus/Site</th>` : ""}</tr>
${ps.map((r, i) => `<tr><td style="${CELL};color:#6b7280">${i + 1}</td><td style="${CELL};white-space:nowrap;font-family:Consolas,monospace">${esc(codeOf(r))}</td><td style="${CELL}">${link ? `<a href="${link(String(r.id))}" style="color:#1f4e8c">${esc(r.name)}</a>` : esc(r.name)}${statusOf(r) ? `<div style="color:#6b7280;font-size:11px;text-transform:capitalize">${esc(statusOf(r))}</div>` : ""}</td>${showFy ? `<td style="${CELL}">${esc(r.fiscal_year ?? "—")}</td>` : ""}${showSite ? `<td style="${CELL}">${esc(r.campus ?? "—")}</td>` : ""}</tr>`).join("\n")}
</table>`;
}

export function statusRequestEmail(a: {
  forPmo: boolean; toName: string; asker: string; askerIsPmo: boolean; pmName: string; site: string;
  note: string; projects: Row[]; link: (id: string) => string;
}) {
  const { forPmo, toName, asker, askerIsPmo, pmName, site, note, projects, link } = a;
  const n = projects.length, one = n === 1 ? projects[0] : null;
  const about = one ? labelOf(one) : `the ${n} projects listed below`;
  const noteBy = askerIsPmo ? "the PMO" : asker;
  const what = (h: (x: string) => string) => forPmo
    ? `${h(asker)} asked ${h(pmName)} for the status of ${h(about)}: the % completed and a justification${one ? "" : " for each project"}.`
    : `${askerIsPmo ? "The PMO" : h(asker)} has asked for the status of ${h(about)}. Please give ${one ? "its % completed and a justification" : "the % completed and a justification for each of them"}.`;
  const how = forPmo
    ? `The answer will be emailed to you and to ${asker}.`
    : one ? "Sign in to the portal: the status form is at the top of the project's Follow-up tab."
    : "Sign in to the portal and open each project: the status form is at the top of its Follow-up tab.";
  const subject = forPmo
    ? `${asker} asked for a status (${site}): ${one ? one.name : `${n} projects`}`
    : `${askerIsPmo ? "Status requested" : `Status requested by ${asker}`} (${site}): ${one ? one.name : `${n} projects`}`;
  const heading = one ? "Project" : `Projects asked about (${n})`;
  const main = link(String(projects[0]?.id ?? ""));
  const button = forPmo ? "Open in the portal" : one ? "Give the status" : "Open the first project";

  const text = [
    `Dear ${toName},`,
    "",
    `Project manager: ${pmName}`,
    `Campus/Site: ${site}`,
    "",
    what(x => x),
    "",
    ...(note ? [`Note from ${noteBy}:`, note, ""] : []),
    `${heading}:`,
    ...projects.map((r, i) => `${i + 1}. ${codeOf(r)}  ${r.name} (${r.fiscal_year ?? "—"}${r.campus ? `, ${r.campus}` : ""})`
      + (one ? "" : `\n   ${link(String(r.id))}`)),
    "",
    how,
    `${button}: ${main}`,
    "",
    "Project Management Office",
  ].join("\n");

  const html = wrap(`<p>${esc(`Dear ${toName},`)}</p>
${facts(pmName, site)}
<p>${what(x => `<b>${esc(x)}</b>`)}</p>
${note ? `<p style="margin:12px 0 0;color:#6b7280;font-size:12px">Note from ${esc(noteBy)}</p>${quote(note)}` : ""}
${projectTable(projects, heading, one ? undefined : link)}
<p style="margin-top:16px">${esc(how)}</p>
<p style="margin-top:12px"><a href="${main}" style="${BUTTON}">${esc(button)}</a></p>`);
  return { subject, text, html };
}

export function statusAnswerEmail(a: {
  toName: string; forAsker: boolean; author: string; pmName: string; site: string; project: Row;
  pct: number; justification: string; askers: string[]; askedAt: string; reasonOpen?: unknown; link: string;
}) {
  const { toName, forAsker, author, pmName, site, project, justification, askers, askedAt, link } = a;
  const pct = Math.max(0, Math.min(100, Math.round(Number(a.pct) || 0)));
  const what = (h: (x: string) => string) => `${h(author)} has sent the status of ${h(labelOf(project))}${askers.length
    ? `, which ${forAsker ? "you" : askers.map(h).join(" and ")} asked for${askedAt ? ` on ${h(askedAt)}` : ""}` : ""}:`;
  // The PMO's own "Why still open" beside it, as on the page (PMO decision 20 Oct 2026).
  const reason = forAsker ? "" : String(a.reasonOpen ?? "").trim();
  const subject = `Status from ${author} (${site}): ${project.name}, ${pct}% completed`;

  const text = [
    `Dear ${toName},`,
    "",
    `Project manager: ${pmName}`,
    `Campus/Site: ${site}`,
    "",
    what(x => x),
    "",
    `% completed: ${pct}%`,
    "Justification:",
    justification,
    "",
    ...(reason ? [`Why still open (PMO): ${reason}`, ""] : []),
    `Open the project: ${link}`,
    "",
    "Project Management Office",
  ].join("\n");

  const html = wrap(`<p>${esc(`Dear ${toName},`)}</p>
${facts(pmName, site)}
<p>${what(x => `<b>${esc(x)}</b>`)}</p>
<table style="margin:10px 0;border-collapse:collapse;width:100%;max-width:420px"><tr><td style="padding:12px 14px;background:#f6f8fb;border-radius:8px">
<div style="font-size:12px;color:#6b7280">% completed, as reported by ${esc(author)}</div>
<div style="font-size:26px;font-weight:bold;color:#1f4e8c;line-height:1.3">${pct}%</div>
<div style="background:#e5e7eb;border-radius:4px;height:8px;line-height:8px;font-size:0;margin-top:6px"><div style="width:${pct}%;background:${pct >= 100 ? "#2e9e6a" : "#1f4e8c"};height:8px;border-radius:4px;font-size:0;line-height:8px">&nbsp;</div></div>
</td></tr></table>
<p style="margin:14px 0 0;color:#6b7280;font-size:12px">Justification</p>
${quote(justification)}
${reason ? `<p style="font-size:13px;color:#374151"><span style="color:#6b7280">Why still open (PMO):</span> ${esc(reason)}</p>` : ""}
<p style="margin-top:16px"><a href="${link}" style="${BUTTON}">Open the project</a></p>`);
  return { subject, text, html };
}
