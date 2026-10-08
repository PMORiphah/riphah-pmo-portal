// The "board report shared with you" email (PMO, 8 Oct 2026). Pure, so the
// function can preview it without sending.
export type Headline = Record<string, number>;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const M = (n: unknown, d = 1) => `PKR ${(Number(n || 0) / 1e6).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d })}M`;
const FONT = "Arial,Helvetica,sans-serif", NAVY = "#185078", INK = "#0D1929", BODY = "#3A5068", MUTED = "#7A98AE", GOLD = "#D89840", LINE = "#DDE8F4";

export function reportEmail(a: { name: string; title: string; period: string; asAt: string; h: Headline; note?: string | null; link: string }) {
  const h = a.h;
  const tiles: [string, string, string][] = [
    ["Total CAPEX", M(h.df_total), `${h.capex_count} projects, DF Recommended`],
    ["Approved", M(h.approved_bac), `${h.approved_count} projects (${h.approved_in_execution} in execution, ${h.approved_closed} closed)`],
    ["Released", M(h.released_total), `${(Number(h.released_pct_of_df || 0) * 100).toFixed(1)}% of DF Recommended`],
    ["Approved, not yet released", M(h.approved_not_released), "on approved projects"],
  ];
  const tile = ([l, v, s]: [string, string, string]) => `<td class="col" width="50%" valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;background:#F7FAFD;"><tr><td style="padding:14px 16px;">
<div style="font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${esc(l)}</div>
<div style="font-family:${FONT};font-size:22px;font-weight:700;color:${INK};margin-top:4px;">${esc(v)}</div>
<div style="font-family:${FONT};font-size:12.5px;color:${BODY};margin-top:2px;">${esc(s)}</div></td></tr></table></td>`;
  const subject = `Board report: ${a.period} (PMO)`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(subject)}</title>
<style>@media (max-width:620px){.col{display:block !important;width:100% !important;box-sizing:border-box}.inner{padding:22px 16px !important}}</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:12px 8px;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;border:1px solid #DCE6F0;border-radius:14px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:26px 32px;">
<div style="font-family:${FONT};font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Riphah International University</div>
<div style="font-family:${FONT};font-size:21px;font-weight:700;color:#ffffff;">Project Management Office</div>
<div style="font-family:${FONT};font-size:10px;color:rgba(255,255,255,0.45);margin-top:6px;letter-spacing:2px;text-transform:uppercase;">Monthly board report</div>
</td></tr>
<tr><td style="height:4px;background:${GOLD};line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td class="inner" style="padding:30px 32px;">
<div style="font-family:${FONT};font-size:24px;font-weight:700;color:${INK};margin-bottom:14px;">${esc(a.title)}</div>
<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">Dear <b>${esc(a.name)}</b>,</p>
<p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.7;color:${BODY};">The Project Management Office has shared the <b>${esc(a.period)}</b> board report with you. Figures are as at ${esc(a.asAt)}. The headline figures are below; the full report, with the approval pipeline, funding, campuses, risks and the project register, is in the portal.</p>
${a.note && a.note.trim() ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-left:4px solid ${GOLD};background:#FDF8EE;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.7;color:${BODY};white-space:pre-wrap;">${esc(a.note.trim())}</td></tr></table>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tile(tiles[0])}${tile(tiles[1])}</tr><tr>${tile(tiles[2])}${tile(tiles[3])}</tr></table>
<p style="margin:10px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${MUTED};">Investment projects are outside CAPEX: ${h.investment_count} projects, ${M(h.investment_df)}. "Released" is money disbursed to projects, not money spent.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td style="border-radius:8px;background:${GOLD};">
<a href="${a.link}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK};text-decoration:none;border-radius:8px;">Open the full report &rarr;</a></td></tr></table>
<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">Sign in with your portal username. You can save the report as a PDF from the report page.</p>
</td></tr>
<tr><td style="background:#F2F8FC;padding:16px 32px;border-top:1px solid ${LINE};"><p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};"><b style="color:#506070;">Project Management Office</b> &middot; Riphah International University</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [`Dear ${a.name},`, "", `The Project Management Office has shared the ${a.period} board report with you (figures as at ${a.asAt}).`, "",
    ...tiles.map(([l, v, s]) => `${l}: ${v} (${s})`), "", ...(a.note && a.note.trim() ? [a.note.trim(), ""] : []),
    `Open the full report: ${a.link}`, "", "Project Management Office", "Riphah International University"].join("\n");
  return { subject, html, text };
}
