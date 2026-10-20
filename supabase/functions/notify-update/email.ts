// The Ask update emails on FY 2026-27 Updates (PMO, 20 Oct 2026; docs/plans/status-requests.md).
// Pure, so notify-update can preview them and they can be checked without sending anything.
//   requestEmail  to each of the project's managers: what is needed (a status and a comment on
//                 each deliverable, the overall status, % completed and a detailed update), the
//                 deliverable lines to cover and the asker's note; `forPmo` = the PMO's copy when
//                 a past-project viewer asked.
//   updateEmail   the manager's update, to the PMO (`forPmo`) or to someone who asked.
// Both name the project (ID and name), its campus/site and its manager(s), as the Past
// Projects emails do.
export type Row = Record<string, unknown>;
export type Line = { line_no: unknown; title: unknown; qty?: unknown; unit?: unknown; status: string; comment: string };

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A deliverable line that is an item, not a contingency, sales tax or GST line (as deliverable_is_item). */
export const NON_ITEM = /^\s*(\d+(\.\d+)?\s*%\s*)?(contingenc|sales\s*tax|gst\b|withholding|income\s*tax)/i;
export const isItem = (title: unknown) => !NON_ITEM.test(String(title ?? ""));

export const OVERALL: Record<string, string> = { on_track: "On track", at_risk: "At risk", delayed: "Delayed" };
export const LINE: Record<string, string> = { arrived: "Arrived", ordered: "Ordered", not_yet: "Not yet" };
// A deliverable's state on the Deliverables tab today.
const NOW: Record<string, string> = { not_started: "Not started", ordered: "Ordered", delivered: "Delivered",
  installed: "Installed", handed_over: "Handed over" };
const COLOUR: Record<string, string> = { on_track: "#2E9E6A", at_risk: "#B7832A", delayed: "#E4576B",
  arrived: "#2E9E6A", ordered: "#185078", not_yet: "#7A98AE" };
const MAX_LINES = 40;   // the rest are on the form ("and N more")

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "20 Oct 2026" in Pakistan time ("" without a date). */
export const dayPkt = (iso: unknown) => {
  const t = iso ? new Date(String(iso)).getTime() : NaN;
  if (isNaN(t)) return "";
  const d = new Date(t + 5 * 3600e3);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** The asker's note: everything after "Update requested" on the first line. */
export const requestNote = (body: unknown) => {
  const lines = String(body ?? "").split("\n");
  return (lines[0].trim() === "Update requested" ? lines.slice(1) : lines).join("\n").trim();
};
/** What the manager has to give, said plainly. */
export const needOf = (n: number) => n > 0
  ? `a status and a comment on ${n === 1 ? "the 1 deliverable" : `each of the ${n} deliverables`}, the overall status, % completed and a detailed update`
  : "the overall status, % completed and a detailed update";
const pctOf = (v: unknown) => `${Number(v).toLocaleString("en", { maximumFractionDigits: 1 })}%`;
const qtyOf = (l: { qty?: unknown; unit?: unknown }) =>
  [l.qty == null || l.qty === "" ? "" : Number(l.qty).toLocaleString("en", { maximumFractionDigits: 2 }), String(l.unit ?? "").trim()]
    .filter(Boolean).join(" ");
const and = (xs: string[]) => xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const labelOf = (p: Row) => `${p.code ? `${p.code} ` : ""}${p.name}`;

// ── Layout (the portal's email look: navy header, gold rule; one column on phones) ──
const FONT = "Arial,Helvetica,sans-serif", NAVY = "#185078", INK = "#0D1929", BODY = "#3A5068",
  MUTED = "#7A98AE", GOLD = "#D89840", RULE = "#DDE8F4";
const P = (s: string, extra = "") => `<p style="margin:0 0 14px;font-family:${FONT};font-size:14.5px;line-height:1.7;color:${BODY};${extra}">${s}</p>`;
const small = (s: string) => `<div style="font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:18px 0 6px;">${s}</div>`;
const quote = (s: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-left:4px solid ${GOLD};background:#FDF8EE;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};white-space:pre-wrap;word-break:break-word;">${esc(s)}</td></tr></table>`;
const chip = (key: string, label: string) => `<span style="display:inline-block;background:${COLOUR[key] ?? MUTED};color:#ffffff;font-family:${FONT};font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;white-space:nowrap;">${esc(label)}</span>`;
const button = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td style="border-radius:8px;background:${GOLD};"><a href="${href}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14.5px;font-weight:700;color:${INK};text-decoration:none;border-radius:8px;">${esc(label)} &rarr;</a></td></tr></table>`;

function facts(project: Row, site: string, managers: string[]) {
  const rows: [string, string][] = [
    ["Project", String(project.name ?? "")],
    ["Project ID", String(project.code ?? "").trim() || "—"],
    ["Campus/Site", site],
    [managers.length > 1 ? "Project managers" : "Project manager", managers.length ? and(managers) : "—"],
  ];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">${rows.map(([k, v]) =>
    `<tr><td style="font-family:${FONT};font-size:13px;color:${MUTED};padding:3px 16px 3px 0;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="font-family:${FONT};font-size:13.5px;color:${INK};font-weight:700;padding:3px 0;">${esc(v)}</td></tr>`).join("")}</table>`;
}
const factsText = (project: Row, site: string, managers: string[]) => [
  `Project: ${project.name}`,
  `Project ID: ${String(project.code ?? "").trim() || "-"}`,
  `Campus/Site: ${site}`,
  `${managers.length > 1 ? "Project managers" : "Project manager"}: ${managers.length ? and(managers) : "-"}`,
];

function layout(title: string, kicker: string, bar: string, inner: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(title)}</title>
<style>@media (max-width:620px){.inner{padding:22px 16px !important}.hide-sm{display:none !important}}</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:12px 8px;"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border:1px solid #DCE6F0;border-radius:14px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:24px 30px;">
<div style="font-family:${FONT};font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div>
<div style="font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;">Project Management Office</div>
<div style="font-family:${FONT};font-size:10px;color:rgba(255,255,255,0.45);margin-top:6px;letter-spacing:2px;text-transform:uppercase;">FY 2026-27 &middot; ${esc(kicker)}</div>
</td></tr>
<tr><td style="height:4px;background:${bar};line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td class="inner" style="padding:28px 30px;">${inner}</td></tr>
<tr><td style="background:#F2F8FC;padding:16px 30px;border-top:1px solid ${RULE};"><p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};"><b style="color:#506070;">Project Management Office</b> &middot; Riphah International University</p></td></tr>
</table></td></tr></table></body></html>`;
}

const TH = `font-family:${FONT};font-size:11.5px;color:#506070;background:#F2F8FC;padding:7px 9px;text-align:left;border-bottom:1px solid ${RULE};`;
const TD = `font-family:${FONT};font-size:13px;color:${INK};padding:7px 9px;border-bottom:1px solid ${RULE};vertical-align:top;word-break:break-word;`;
const more = (n: number, cols: number) => n > MAX_LINES
  ? `<tr><td colspan="${cols}" style="${TD}color:${MUTED};">and ${n - MAX_LINES} more in the portal</td></tr>` : "";

// ── The request ──────────────────────────────────────────────────────────────
export function requestEmail(a: {
  forPmo: boolean; toName: string; asker: string; askerIsPmo: boolean; project: Row; managers: string[];
  site: string; note: string; lines: Row[]; link: string;
}) {
  const { forPmo, toName, asker, askerIsPmo, project, managers, site, note, lines, link } = a;
  const n = lines.length, need = needOf(n), label = labelOf(project);
  const mgrs = managers.length ? and(managers) : "the project manager";
  const noteBy = askerIsPmo ? "the PMO" : asker;
  const subject = forPmo
    ? `${asker} asked for an update (${site}): ${label}`
    : `${askerIsPmo ? "Update requested" : `Update requested by ${asker}`} (${site}): ${label}`;
  const lead = (h: (x: string) => string) => forPmo
    ? `${h(asker)} asked ${h(mgrs)} for an update on ${h(label)}: ${need}.`
    : `${askerIsPmo ? "The PMO" : h(asker)} has asked for an update on ${h(label)}. Please give ${need}.`;
  const choices = n
    ? "For each deliverable: Arrived, Ordered or Not yet, with a comment. Overall status: On track, At risk or Delayed."
    : "Overall status: On track, At risk or Delayed.";
  const how = forPmo
    ? `The update will be emailed to you and to ${asker}.`
    : `Use the link below to sign in: it opens the project's Updates thread at the update form, which comes after the latest posts.${n ? " Your answer also updates the project's Deliverables tab." : ""}`;
  const action = forPmo ? "Open the Updates thread" : "Give the update";
  const heading = `Deliverables to cover (${n})`;

  const text = [
    `Dear ${toName},`,
    "",
    ...factsText(project, site, managers),
    "",
    lead(x => x),
    ...(forPmo ? [] : [choices]),
    "",
    ...(note ? [`Note from ${noteBy}:`, note, ""] : []),
    ...(n ? [`${heading}:`,
      ...lines.slice(0, MAX_LINES).map((l, i) => `${l.line_no ?? i + 1}. ${l.title}${qtyOf(l) ? ` (${qtyOf(l)})` : ""}, now: ${NOW[String(l.status)] ?? "Not started"}`),
      ...(n > MAX_LINES ? [`and ${n - MAX_LINES} more in the portal`] : []), ""] : []),
    how,
    `${action}: ${link}`,
    "",
    "Project Management Office",
    "Riphah International University",
  ].join("\n");

  const table = n ? `${small(esc(heading))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${RULE};">
<tr><th style="${TH}width:28px;">#</th><th style="${TH}">Item</th><th class="hide-sm" style="${TH}white-space:nowrap;">Qty</th><th style="${TH}white-space:nowrap;">Now</th></tr>
${lines.slice(0, MAX_LINES).map((l, i) => `<tr><td style="${TD}color:${MUTED};">${esc(l.line_no ?? i + 1)}</td><td style="${TD}">${esc(l.title)}</td><td class="hide-sm" style="${TD}white-space:nowrap;">${esc(qtyOf(l) || "—")}</td><td style="${TD}white-space:nowrap;color:${BODY};">${esc(NOW[String(l.status)] ?? "Not started")}</td></tr>`).join("\n")}
${more(n, 4)}
</table>` : "";

  const html = layout(subject, "Update requested", GOLD, `${P(esc(`Dear ${toName},`))}
${facts(project, site, managers)}
${P(lead(x => `<b>${esc(x)}</b>`))}
${forPmo ? "" : P(esc(choices), `font-size:13px;color:${MUTED};`)}
${note ? `${small(`Note from ${esc(noteBy)}`)}${quote(note)}` : ""}
${table}
${P(esc(how), "margin:18px 0 0;")}
${button(link, action)}`);
  return { subject, text, html };
}

// ── The manager's update ─────────────────────────────────────────────────────
export function updateEmail(a: {
  forPmo: boolean; toName: string; author: string; project: Row; managers: string[]; site: string;
  overall: string; pct: number; portalPct: unknown; detail: string; lines: Line[];
  askers: string[]; askedAt: string; youAsked: boolean; link: string;
}) {
  const { forPmo, toName, author, project, managers, site, overall, pct, detail, lines, askers, askedAt, youAsked, link } = a;
  const label = labelOf(project), state = OVERALL[overall] ?? overall;
  const lead = (h: (x: string) => string) => `${h(author)} has sent an update on ${h(label)}${askers.length
    ? `, which ${youAsked ? "you" : and(askers.map(h))} asked for${askedAt ? ` on ${h(askedAt)}` : ""}` : ""}:`;
  const subject = `Update from ${author} (${site}): ${label}, ${state}, ${pctOf(pct)}`;
  // The reported % goes into % Complete only when the PMO presses "Use this %" (PMO decision 20 Oct 2026).
  const portal = a.portalPct == null || a.portalPct === "" ? null : Number(a.portalPct);
  const differs = portal == null || Math.abs(portal - Number(pct)) > 0.05;
  const pctNote = forPmo
    ? `% Complete in the portal: ${portal == null ? "not set" : pctOf(portal)}.${differs ? ' Press "Use this %" on the update to copy the reported figure into it.' : ""}`
    : "";
  const t = { arrived: 0, ordered: 0, not_yet: 0 } as Record<string, number>;
  lines.forEach(l => { if (Object.prototype.hasOwnProperty.call(t, l.status)) t[l.status]++; });
  const tally = [["arrived", "arrived"], ["ordered", "ordered"], ["not_yet", "not yet"]]
    .filter(([k]) => t[k] > 0).map(([k, w]) => `${t[k]} ${w}`).join(", ");
  const heading = `Deliverables (${lines.length}${tally ? `: ${tally}` : ""})`;
  const bar = COLOUR[overall] ?? GOLD;
  const w = Math.max(0, Math.min(100, Number(pct) || 0));

  const text = [
    `Dear ${toName},`,
    "",
    ...factsText(project, site, managers),
    "",
    lead(x => x),
    "",
    `Overall status: ${state}`,
    `% completed (reported): ${pctOf(pct)}`,
    ...(pctNote ? [pctNote] : []),
    "",
    ...(lines.length ? [`${heading}:`,
      ...lines.slice(0, MAX_LINES).map((l, i) => `${l.line_no ?? i + 1}. ${l.title}: ${LINE[l.status] ?? l.status}. ${l.comment}`),
      ...(lines.length > MAX_LINES ? [`and ${lines.length - MAX_LINES} more in the portal`] : []), ""] : []),
    "Detailed update:",
    detail,
    "",
    `Open the update: ${link}`,
    "",
    "Project Management Office",
    "Riphah International University",
  ].join("\n");

  const table = lines.length ? `${small(esc(heading))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${RULE};">
<tr><th style="${TH}width:28px;">#</th><th style="${TH}">Item</th><th style="${TH}">Status and comment</th></tr>
${lines.slice(0, MAX_LINES).map((l, i) => `<tr><td style="${TD}color:${MUTED};">${esc(l.line_no ?? i + 1)}</td><td style="${TD}">${esc(l.title)}</td><td style="${TD}">${chip(l.status, LINE[l.status] ?? l.status)}<div style="margin-top:4px;color:${BODY};">${esc(l.comment)}</div></td></tr>`).join("\n")}
${more(lines.length, 3)}
</table>` : "";

  const html = layout(subject, "Manager's update", bar, `${P(esc(`Dear ${toName},`))}
${facts(project, site, managers)}
${P(lead(x => `<b>${esc(x)}</b>`))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${RULE};border-radius:10px;background:#F7FAFD;margin:0 0 6px;"><tr><td style="padding:14px 16px;">
<div style="font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Overall status</div>
<div style="margin:5px 0 12px;">${chip(overall, state)}</div>
<div style="font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">% completed, as reported</div>
<div style="font-family:${FONT};font-size:24px;font-weight:700;color:${INK};margin-top:2px;">${esc(pctOf(pct))}</div>
<div style="background:#E3EBF3;border-radius:4px;height:8px;line-height:8px;font-size:0;margin-top:6px;"><div style="width:${w}%;background:${bar};height:8px;line-height:8px;font-size:0;border-radius:4px;">&nbsp;</div></div>
${pctNote ? `<div style="font-family:${FONT};font-size:12.5px;color:${BODY};margin-top:10px;line-height:1.6;">${esc(pctNote)}</div>` : ""}
</td></tr></table>
${table}
${small("Detailed update")}${quote(detail)}
${button(link, "Open the update")}`);
  return { subject, text, html };
}
