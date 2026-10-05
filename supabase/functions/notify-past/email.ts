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
}) {
  const { kind, fromPmo, toName, author, pmName, site, body, project, listed, projectId, link } = a;
  const pid = (r: Row) => String(r.code ?? "").trim() || "—";
  const statusOf = (r: Row) => r.status ? String(r.status).replace(/_/g, " ") : "";
  const mark = (r: Row) => kind === "pm" && !!projectId && r.id === projectId;

  const about = project
    ? `${project.code ? `${project.code} ` : ""}${project.name} (${project.fiscal_year}${project.campus ? `, ${project.campus}` : ""})`
    : `the ${listed.length === 1 ? "project" : `${listed.length} projects`} listed below`;
  const subject = fromPmo
    ? `PMO follow-up (${site}): ${project ? project.name : `Update requested on ${listed.length} ${listed.length === 1 ? "project" : "projects"}`}`
    : `Reply from ${author} (${site}): ${project ? project.name : `Update on ${listed.length} ${listed.length === 1 ? "project" : "projects"}`}`;
  const heading = kind === "pm" ? `Projects of ${pmName} (${listed.length})` : "Project";

  const listText = listed.map((r, i) =>
    `${i + 1}. ${pid(r)}  ${r.name} (${r.fiscal_year ?? "—"}${r.campus ? `, ${r.campus}` : ""})`
    + (mark(r) ? "  <- this message is about this project" : ""));
  const text = [
    fromPmo ? `Dear ${toName},` : "Dear PMO,",
    "",
    `Project manager: ${pmName}`,
    `Campus/Site: ${site}`,
    "",
    fromPmo ? `The PMO has asked for an update on ${about}:` : `${author} replied about ${about}:`,
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
<p>${fromPmo ? `Dear ${esc(toName)},` : "Dear PMO,"}</p>
<table style="font-size:13px;margin:4px 0 12px;border-collapse:collapse"><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Project manager</td><td><b>${esc(pmName)}</b></td></tr><tr><td style="color:#6b7280;padding:2px 14px 2px 0">Campus/Site</td><td><b>${esc(site)}</b></td></tr></table>
<p>${fromPmo ? `The PMO has asked for an update on <b>${esc(about)}</b>:` : `<b>${esc(author)}</b> replied about <b>${esc(about)}</b>:`}</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #c9a227;background:#f6f8fb;white-space:pre-wrap">${esc(body)}</blockquote>
${listHtml}
<p style="margin-top:18px"><a href="${link}" style="display:inline-block;padding:9px 16px;background:#1f4e8c;color:#fff;text-decoration:none;border-radius:6px">${fromPmo ? "Reply in the portal" : "Open the conversation"}</a></p>
<p style="color:#6b7280;font-size:12px">Project Management Office, Riphah International University</p></div>`;
  return { subject, text, html };
}
