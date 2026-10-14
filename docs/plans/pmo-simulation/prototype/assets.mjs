// Generates every same-origin file the simulation serves for Documents and the Gallery:
// PDFs (pure JS writer, SIMULATION watermark on every page), the BOQ workbook (exceljs from the repo's
// node_modules) and JPEGs (SVG drawn here, rendered by the local Playwright Chromium). Nothing is fetched.
// Writes assets/<file_path> and asset-sizes.json { file_path: bytes }. Run after gen.mjs, then rerun gen.mjs.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const ExcelJS = require("exceljs");
const { chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs");

const HERE = new URL(".", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(HERE + "assets-manifest.json"));
const input = JSON.parse(readFileSync(HERE + "assets-input.json"));
const OUT = HERE + "assets/";
const sizes = {};
const save = (fp, buf) => { const f = OUT + fp; mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); sizes[fp] = statSync(f).size; };
const pk = (n) => Math.round(n).toLocaleString("en");
const dmy = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`; };

/* ── Minimal PDF writer (Helvetica, WinAnsi, A4) ───────────────────────── */
const W_DIG = { "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ",": 278, ".": 278, " ": 278, "-": 333, "P": 667, "K": 667, "R": 722 };
const tw = (s, size, bold) => [...String(s)].reduce((w, c) => w + (W_DIG[c] ?? (c === c.toUpperCase() && /[A-Z]/.test(c) ? 680 : 520)) * (bold ? 1.05 : 1), 0) * size / 1000;
const esc = (s) => String(s).replace(/[^\x20-\x7E]/g, "-").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
class Doc {
  constructor() { this.pages = []; this.page(); }
  page() { this.ops = []; this.pages.push(this.ops); this.y = 790; this.watermark(); return this; }
  watermark() { this.ops.push("q /GS1 gs 0.55 0.60 0.68 rg BT /F2 40 Tf 0.766 0.643 -0.643 0.766 62 190 Tm (SIMULATION - FICTIONAL DATA) Tj ET Q"); }
  color(r, g, b) { this.ops.push(`${r} ${g} ${b} rg`); return this; }
  rect(x, y, w, h, fill) { this.ops.push(`q ${fill} rg ${x} ${y} ${w} ${h} re f Q`); return this; }
  line(x1, y1, x2, y2, c = "0.75 0.78 0.82", wd = 0.6) { this.ops.push(`q ${c} RG ${wd} w ${x1} ${y1} m ${x2} ${y2} l S Q`); return this; }
  text(x, y, s, size = 10, bold = false, c = "0.10 0.13 0.20") { this.ops.push(`q ${c} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET Q`); return this; }
  right(x, y, s, size = 10, bold = false, c) { return this.text(x - tw(s, size, bold), y, s, size, bold, c); }
  wrap(x, y, s, width, size = 10, lead = 13, c) { const words = String(s).split(/\s+/); let line = "", yy = y;
    for (const w of words) { if (tw(line + " " + w, size) > width && line) { this.text(x, yy, line, size, false, c); yy -= lead; line = w; } else line = line ? line + " " + w : w; }
    if (line) { this.text(x, yy, line, size, false, c); yy -= lead; } return yy; }
  build() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    const cat = add(null), pagesId = add(null), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
      f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"), gs = add("<< /Type /ExtGState /ca 0.13 /CA 0.13 >>");
    const kids = this.pages.map((ops, i) => { const body = ops.join("\n") + `\nq 0.45 0.50 0.58 rg BT /F1 7.5 Tf 40 24 Td (Simulation document - every name, figure and company on this page is invented.  Page ${i + 1} of ${this.pages.length}) Tj ET Q`;
      const c = add(`<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ExtGState << /GS1 ${gs} 0 R >> >> /Contents ${c} 0 R >>`); });
    objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const xref = [];
    objs.forEach((o, i) => { xref.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const start = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info << /Title (Simulation document) /Producer (PMO Simulation dataset) >> >>\nstartxref\n${start}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }
}
const NAVY = "0.075 0.161 0.294", GOLD = "0.78 0.62 0.29", PALE = "0.95 0.96 0.98";
function letterhead(d, title, sub, org = "THE UNIVERSITY - PROJECT MANAGEMENT OFFICE") {
  d.rect(0, 792, 595, 50, NAVY).text(40, 818, org, 9, true, "1 1 1").text(40, 803, "Simulation copy", 8, false, "0.75 0.80 0.90");
  d.rect(0, 789, 595, 3, GOLD);
  d.text(40, 755, title, 17, true).text(40, 737, sub, 10, false, "0.35 0.40 0.48"); d.y = 712; return d;
}
function table(d, cols, rows, opt = {}) {  // cols: [label, x, align('l'|'r'), width]
  let y = d.y; d.rect(36, y - 5, 523, 18, PALE);
  cols.forEach(([l, x, a]) => a === "r" ? d.right(x, y, l, 8.5, true, "0.30 0.35 0.43") : d.text(x, y, l, 8.5, true, "0.30 0.35 0.43"));
  y -= 18;
  for (const r of rows) { cols.forEach(([, x, a], i) => a === "r" ? d.right(x, y, r[i], 9) : d.text(x, y, r[i], 9)); d.line(36, y - 5, 559, y - 5); y -= 17; }
  if (opt.total) { d.right(cols.at(-2)[1], y - 2, opt.total[0], 9.5, true); d.right(cols.at(-1)[1], y - 2, opt.total[1], 9.5, true); y -= 22; }
  d.y = y; return d;
}
function pddPdf(p, num) {
  const d = new Doc();
  letterhead(d, "Project Definition Document (PDD)", `${num}  |  E-PDD portal copy  |  Status: All Approved`);
  const kv = [["Project", p.name], ["Project ID", p.code], ["Campus / site", p.campus], ["Project manager", p.pm || "-"], ["Planned start", dmy(p.start)], ["Planned finish", dmy(p.end)],
    ["Strategic priority", p.strat], ["DF Recommended (plan)", `PKR ${pk(p.df)}`]];
  kv.forEach(([k, v], i) => { const x = i % 2 ? 310 : 40, y = d.y - Math.floor(i / 2) * 30; d.text(x, y + 9, k.toUpperCase(), 7, true, "0.45 0.50 0.58").text(x, y - 3, v, 10.5, true); });
  d.y -= 130;
  d.text(40, d.y, "Problem", 11, true); d.y = d.wrap(40, d.y - 15, p.problem, 515);
  d.y -= 6; d.text(40, d.y, "Proposed solution", 11, true); d.y = d.wrap(40, d.y - 15, `${p.solution} The items and works are listed in the cost table below; the facility is handed over to the department before the planned finish date.`, 515);
  d.y -= 6; d.text(40, d.y, "Success criteria", 11, true); d.y = d.wrap(40, d.y - 15, `All items delivered, installed and signed off by the department; the facility in daily use within two weeks of handover; no open snags at the PCD.`, 515);
  d.y -= 14; d.text(40, d.y, "Cost table", 11, true); d.y -= 20;
  const total = p.items.reduce((s, i) => s + i.total, 0);
  table(d, [["#", 44, "l"], ["Item", 64, "l"], ["Qty", 330, "r"], ["Unit", 342, "l"], ["Unit cost (PKR)", 470, "r"], ["Total (PKR)", 555, "r"]],
    p.items.map((it, i) => [String(i + 1), it.description, String(it.qty), it.unit, pk(it.unit_cost), pk(it.total)]), { total: ["Grand total", pk(total)] });
  d.page(); letterhead(d, "Approval history", `${num}  |  ${p.name}`);
  table(d, [["Stage", 44, "l"], ["Role", 190, "l"], ["Decision", 360, "l"], ["Date", 555, "r"]], [
    ["Initiated", "Project Manager", "Submitted", "E-PDD record"], ["Campus review", "Campus Director (sample)", "Approved", "E-PDD record"],
    ["PMO review", "PMO Reviewer (sample)", "Recommended", "E-PDD record"], ["PMO decision", "Manager PMO (sample)", "Recommended", "E-PDD record"]]);
  d.y -= 10; d.wrap(40, d.y, "Approving the PDD approves the document only. The project is sanctioned after Director Finance, Executive Director and Managing Trustee review in the portal.", 515, 9.5);
  return d.build();
}
function quotePdf(a, story) {
  const d = new Doc(); const lines = a.lines.map(n => story.items[n - 1]);
  const net = lines.reduce((s, i) => s + i.total, 0); const qn = `Q-${a.vendor.startsWith("MedSim") ? "MS" : "BL"}-2026-0${a.lines[0] + 40}`;
  letterhead(d, "Quotation", `${a.vendor}  |  ${qn}  |  ${dmy(a.uploaded_at)}`, a.vendor.toUpperCase());
  d.text(40, d.y, "To: Project Management Office, Central Office (sample address)", 9.5).text(40, d.y - 14, `Subject: ${story.name}, ${story.campus}`, 9.5, true); d.y -= 40;
  table(d, [["Line", 44, "l"], ["Description", 74, "l"], ["Qty", 330, "r"], ["Unit", 342, "l"], ["Unit price (PKR)", 470, "r"], ["Amount (PKR)", 555, "r"]],
    lines.map((it, i) => [String(a.lines[i]), it.description, String(it.qty), it.unit, pk(it.unit_cost), pk(it.total)]), { total: ["Total", pk(net)] });
  d.y -= 8; d.wrap(40, d.y, "Prices include delivery to site, installation and one year of on-site warranty. Validity: 60 days. Payment: 30% advance against bank guarantee, balance on delivery and acceptance.", 515, 9.5);
  return d.build();
}
function awardPdf(a, story) {
  const d = new Doc(); const lines = story.items.slice(0, 4); const total = lines.reduce((s, i) => s + i.total, 0);
  letterhead(d, "Letter of award", `Ref. PMO/AW/2026/117  |  ${dmy(a.uploaded_at)}`);
  let y = d.wrap(40, d.y, `To: ${a.vendor}`, 515, 10.5);
  y = d.wrap(40, y - 8, `Subject: Award of supply - ${story.name} (${story.code}), ${story.campus}`, 515, 10.5);
  y = d.wrap(40, y - 12, `Further to your quotation and the evaluation by the purchase committee, the University awards you the supply, installation and commissioning of the patient simulators and task trainers listed below, for a total of PKR ${pk(total)}.`, 515);
  d.y = y - 10; table(d, [["Line", 44, "l"], ["Item", 74, "l"], ["Qty", 420, "r"], ["Amount (PKR)", 555, "r"]], lines.map((it, i) => [String(i + 1), it.description, String(it.qty), pk(it.total)]), { total: ["Total", pk(total)] });
  y = d.wrap(40, d.y - 8, "Delivery to the Clinical Skills Lab is required by 10 November 2026. Please confirm acceptance within seven days. Project manager: Nadia Fairweather.", 515);
  d.text(40, y - 40, "Project Management Office", 10, true).text(40, y - 54, "(simulation signature)", 9, false, "0.45 0.50 0.58");
  return d.build();
}

/* ── BOQ workbook ──────────────────────────────────────────────────────── */
async function boqXlsx(story) {
  const wb = new ExcelJS.Workbook(); wb.creator = "PMO Simulation"; wb.created = new Date("2026-09-02T09:15:00Z");
  const ws = wb.addWorksheet("BOQ", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 6 }, { width: 52 }, { width: 8 }, { width: 8 }, { width: 16 }, { width: 18 }];
  ws.addRow(["SIMULATION - fictional data", "", "", "", "", ""]).font = { bold: true, color: { argb: "FFB0412E" } };
  ws.addRow([`Bill of quantities: Medical gas and electrical works - ${story.name}, ${story.campus}`]).font = { bold: true, size: 12 };
  ws.addRow([]);
  const h = ws.addRow(["#", "Description", "Qty", "Unit", "Rate (PKR)", "Amount (PKR)"]); h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13294B" } }; });
  const L = [["Oxygen outlets, wall-mounted, with flowmeters", 14, "No", 68000], ["Vacuum outlets, wall-mounted", 14, "No", 52000], ["Medical air outlets", 8, "No", 49000],
    ["Copper pipework, degreased, incl. fittings", 180, "m", 3500], ["Zone valve boxes with alarms", 2, "No", 240000], ["Distribution board and isolators", 1, "Set", 520000],
    ["Power and data points for simulators and AV", 42, "No", 9500], ["LED ceiling lights", 36, "No", 12000], ["Cable trays and wiring", 1, "Job", 690000], ["Testing, certification and handover", 1, "Job", 377000]];
  L.forEach((r, i) => ws.addRow([i + 1, r[0], r[1], r[2], r[3], { formula: `C${i + 5}*E${i + 5}`, result: r[1] * r[3] }]));
  const total = L.reduce((s, r) => s + r[1] * r[3], 0);
  const t = ws.addRow(["", "Total (PDD line 7: Medical gas and electrical works)", "", "", "", { formula: `SUM(F5:F${L.length + 4})`, result: total }]); t.font = { bold: true };
  ws.getColumn(5).numFmt = "#,##0"; ws.getColumn(6).numFmt = "#,##0";
  if (total !== story.items[6].total) throw new Error(`BOQ total ${total} != PDD line 7 ${story.items[6].total}`);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ── Illustrations (SVG) ───────────────────────────────────────────────── */
const W = 1600, H = 1000;
const room = (wall, floor, ceil = "#EEF1F4") => `<rect width="${W}" height="${H}" fill="${ceil}"/><polygon points="220,170 1380,170 1380,690 220,690" fill="${wall}"/>
  <polygon points="0,0 220,170 220,690 0,1000" fill="${shade(wall, -14)}"/><polygon points="1600,0 1380,170 1380,690 1600,1000" fill="${shade(wall, -8)}"/>
  <polygon points="0,1000 220,690 1380,690 1600,1000" fill="${floor}"/>${[...Array(9)].map((_, i) => `<line x1="${220 + i * 145}" y1="690" x2="${-200 + i * 250}" y2="1000" stroke="${shade(floor, -10)}" stroke-width="2"/>`).join("")}
  <line x1="0" y1="${850}" x2="1600" y2="${850}" stroke="${shade(floor, -8)}" stroke-width="2"/>`;
function shade(hex, pct) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * pct / 100))); return `#${[n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join("")}`; }
const ceilingLights = (n = 4, y = 120) => [...Array(n)].map((_, i) => `<rect x="${300 + i * (1000 / n)}" y="${y}" width="160" height="18" rx="4" fill="#FFFBE8"/><rect x="${300 + i * (1000 / n)}" y="${y + 18}" width="160" height="6" fill="#E6E2CF"/>`).join("");
const windowW = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#BFD8EA" stroke="#FFFFFF" stroke-width="10"/><line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#FFFFFF" stroke-width="8"/><rect x="${x + 10}" y="${y + 10}" width="${w / 2 - 20}" height="${h * 0.35}" fill="#D7E8F4"/>`;
const bed = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})"><rect x="0" y="40" width="300" height="70" rx="10" fill="#FFFFFF" stroke="#9AA9B8" stroke-width="3"/><rect x="0" y="30" width="300" height="22" rx="8" fill="#7FB6D9"/>
  <rect x="210" y="14" width="80" height="30" rx="10" fill="#FFFFFF" stroke="#C9D3DD" stroke-width="3"/><rect x="-12" y="0" width="14" height="150" rx="4" fill="#5E6E80"/><rect x="298" y="10" width="14" height="140" rx="4" fill="#5E6E80"/>
  <circle cx="30" cy="160" r="12" fill="#3B4654"/><circle cx="270" cy="160" r="12" fill="#3B4654"/><rect x="10" y="110" width="280" height="10" fill="#8796A6"/></g>`;
const person = (x, y, s = 1, coat = "#2F6FA8") => `<g transform="translate(${x},${y}) scale(${s})"><circle cx="0" cy="-150" r="26" fill="#C99A78"/><path d="M-26,-160 q26,-36 52,0" fill="#3A2C25"/>
  <rect x="-40" y="-120" width="80" height="120" rx="20" fill="${coat}"/><rect x="-34" y="0" width="28" height="110" rx="10" fill="#3E4A5A"/><rect x="6" y="0" width="28" height="110" rx="10" fill="#3E4A5A"/><rect x="-62" y="-112" width="22" height="90" rx="10" fill="${coat}"/><rect x="40" y="-112" width="22" height="90" rx="10" fill="${coat}"/></g>`;
const stamp = (date) => `<text x="1560" y="960" font-family="DejaVu Sans Mono, monospace" font-size="34" fill="#FFB547" text-anchor="end" stroke="#0D1B2E" stroke-opacity="0.55" stroke-width="6" style="paint-order:stroke">${date}</text>
  <g opacity="0.85"><rect x="24" y="926" width="372" height="50" rx="8" fill="#0D1B2E" fill-opacity="0.55"/><text x="40" y="960" font-family="DejaVu Sans, Arial" font-size="22" fill="#FFFFFF" letter-spacing="2">SIMULATION · illustration</text></g>`;
const sky = (top = "#8EC3E8", bottom = "#DCEFFA") => `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
const SCENES = {
  "skills-lab-beds": () => room("#DCE7EE", "#C7CFC4") + ceilingLights() + windowW(980, 250, 300, 220) + bed(300, 600, 1.15) + bed(760, 560, 0.95) + `<rect x="1180" y="560" width="220" height="200" rx="6" fill="#E9ECEF" stroke="#A5B1BE" stroke-width="4"/>${[0, 1, 2].map(i => `<rect x="1195" y="${575 + i * 62}" width="190" height="50" rx="4" fill="#F6F7F8" stroke="#B9C3CD" stroke-width="3"/><rect x="1275" y="${595 + i * 62}" width="30" height="8" rx="3" fill="#8D99A6"/>`).join("")}` + person(240, 820, 0.9, "#E8EEF5"),
  "skills-lab-gas": () => room("#E3E9EE", "#BFC6BB") + ceilingLights(3) + `<rect x="420" y="300" width="760" height="120" rx="12" fill="#F4F6F8" stroke="#9FAAB6" stroke-width="5"/>${[0, 1, 2, 3, 4, 5].map(i => `<g transform="translate(${470 + i * 120},330)"><circle r="20" cx="20" cy="30" fill="${["#3B8B4A", "#F0F0F0", "#E4C440"][i % 3]}" stroke="#55606C" stroke-width="4"/><rect x="5" y="58" width="30" height="10" fill="#7A8592"/></g>`).join("")}
    <rect x="1220" y="250" width="120" height="420" fill="#A8B3BF"/><rect x="1235" y="270" width="90" height="140" fill="#D5DBE1"/>${[0, 1, 2, 3].map(i => `<line x1="1240" y1="${300 + i * 25}" x2="1320" y2="${300 + i * 25}" stroke="#7C8794" stroke-width="5"/>`).join("")}
    <polygon points="300,700 330,520 360,700" fill="#C1C9D2"/><polygon points="270,700 330,500 390,700" fill="none" stroke="#7F8A96" stroke-width="10"/>` + person(560, 850, 1, "#E07B2E") + `<rect x="520" y="620" width="70" height="40" rx="6" fill="#FFD23F"/>`,
  "hostel-washroom": () => room("#EAF0F3", "#B7C3CC", "#F2F4F6") + [...Array(12)].map((_, i) => `<line x1="${220 + i * 97}" y1="170" x2="${220 + i * 97}" y2="690" stroke="#D2DCE2" stroke-width="3"/>`).join("") + [...Array(6)].map((_, i) => `<line x1="220" y1="${170 + i * 87}" x2="1380" y2="${170 + i * 87}" stroke="#D2DCE2" stroke-width="3"/>`).join("")
    + [0, 1, 2].map(i => `<g transform="translate(${330 + i * 330},300)"><rect width="200" height="150" rx="8" fill="#C9E0EE" stroke="#8FA3B4" stroke-width="5"/><rect x="20" y="230" width="160" height="40" rx="18" fill="#FFFFFF" stroke="#9AA9B6" stroke-width="4"/><rect x="88" y="200" width="24" height="34" rx="6" fill="#B7C1CB"/><rect x="80" y="270" width="40" height="120" fill="#E3E8EC"/></g>`).join("") + ceilingLights(3, 110),
  "solar-panels": () => sky() + `<polygon points="0,640 1600,560 1600,1000 0,1000" fill="#B9B3A6"/><polygon points="0,640 1600,560 1600,580 0,660" fill="#8E877B"/>`
    + [...Array(4)].map((_, r) => [...Array(7)].map((_, c) => `<g transform="translate(${80 + c * 215 + r * 30},${700 + r * 70 - c * 11}) skewX(-18)"><rect width="190" height="60" fill="#1F3C68" stroke="#C5D2E0" stroke-width="4"/>${[1, 2, 3].map(k => `<line x1="${k * 47}" y1="0" x2="${k * 47}" y2="60" stroke="#5C7DAA" stroke-width="2"/>`).join("")}<line x1="0" y1="30" x2="190" y2="30" stroke="#5C7DAA" stroke-width="2"/></g>`).join("")).join("")
    + `<circle cx="1380" cy="160" r="70" fill="#FFF3B0"/><rect x="1200" y="420" width="200" height="150" fill="#D9D3C6"/><rect x="1230" y="450" width="60" height="60" fill="#9BB9CF"/>` + person(220, 640, 0.75, "#2F6FA8"),
  "ot-lights": () => room("#CFE3E3", "#A9BDBA", "#E6EEEE") + `<rect x="760" y="0" width="40" height="190" fill="#9AA6B2"/><line x1="780" y1="190" x2="560" y2="330" stroke="#9AA6B2" stroke-width="26"/><line x1="780" y1="190" x2="1010" y2="320" stroke="#9AA6B2" stroke-width="26"/>
    <ellipse cx="540" cy="360" rx="150" ry="62" fill="#E7EDF2" stroke="#7F8B97" stroke-width="6"/><ellipse cx="540" cy="370" rx="118" ry="40" fill="#FFFBE0"/>${[0, 1, 2, 3, 4].map(i => `<circle cx="${480 + i * 30}" cy="370" r="10" fill="#FFF7B8"/>`).join("")}
    <ellipse cx="1030" cy="350" rx="130" ry="54" fill="#E7EDF2" stroke="#7F8B97" stroke-width="6"/><ellipse cx="1030" cy="360" rx="100" ry="34" fill="#FFFBE0"/>
    <rect x="560" y="640" width="480" height="60" rx="10" fill="#5B7C99"/><rect x="760" y="700" width="80" height="140" fill="#7C8A97"/><rect x="680" y="830" width="240" height="24" rx="8" fill="#56636F"/><polygon points="560,640 1040,640 1080,610 600,610" fill="#86A6C2"/>`,
  "library-pods": () => room("#F1ECE2", "#B79C7E", "#F5F2EA") + ceilingLights(4) + windowW(260, 230, 260, 260) + [0, 1, 2].map(i => `<g transform="translate(${560 + i * 270},430)"><rect width="230" height="280" rx="24" fill="${["#2E7D6B", "#C26A3D", "#3E6CA8"][i]}"/><rect x="20" y="30" width="190" height="150" rx="14" fill="#F6F1E6"/><rect x="40" y="190" width="150" height="40" rx="10" fill="#E8DCC6"/><rect x="60" y="110" width="110" height="60" rx="6" fill="#26313E"/></g>`).join("") + person(500, 860, 0.9, "#7A4E9B"),
  "exam-hall": () => room("#E8E4DA", "#C9BBA2", "#F0EEE8") + ceilingLights(5) + [...Array(4)].map((_, r) => [...Array(6 - r % 2)].map((_, c) => `<g transform="translate(${180 + c * 230 + (r % 2) * 115 - r * 40},${600 + r * 90}) scale(${0.8 + r * 0.1})"><rect width="150" height="20" fill="#9B7650"/><rect x="10" y="20" width="10" height="70" fill="#5E6670"/><rect x="130" y="20" width="10" height="70" fill="#5E6670"/><rect x="40" y="40" width="70" height="14" fill="#2F5E8F"/><rect x="50" y="54" width="8" height="40" fill="#5E6670"/><rect x="92" y="54" width="8" height="40" fill="#5E6670"/></g>`).join("")).join("")
    + [0, 1, 2].map(i => `<rect x="${1150 + i * 40}" y="${480 - i * 30}" width="180" height="120" fill="#C9B18A" stroke="#8E7655" stroke-width="4"/>`).join(""),
  "network-rack": () => room("#D9DEE4", "#9EA8B2", "#E5E9ED") + [0, 1, 2].map(i => `<g transform="translate(${430 + i * 270},210)"><rect width="230" height="560" rx="8" fill="#1F2630"/>${[...Array(14)].map((_, k) => `<rect x="18" y="${20 + k * 38}" width="194" height="28" rx="3" fill="#2F3946"/>${[...Array(8)].map((_, j) => `<circle cx="${40 + j * 20}" cy="${34 + k * 38}" r="4" fill="${(j + k + i) % 5 === 0 ? "#F2B134" : "#3FD18B"}"/>`).join("")}`).join("")}</g>`).join("")
    + `<path d="M430,215 C380,120 300,120 240,170" stroke="#3E86C8" stroke-width="14" fill="none"/><path d="M890,215 C900,120 1100,100 1240,170" stroke="#E27D3B" stroke-width="14" fill="none"/>`,
  "dental-clinic": () => room("#E4EEF0", "#BFC9C9", "#EFF4F5") + ceilingLights(3) + [0, 1].map(i => `<g transform="translate(${360 + i * 540},450)"><path d="M0,200 L80,60 L330,60 L360,140 L200,150 L170,240 Z" fill="#3E9AA6"/><rect x="150" y="240" width="60" height="120" fill="#8B98A5"/><rect x="90" y="350" width="180" height="22" rx="8" fill="#6B7783"/>
    <line x1="330" y1="40" x2="420" y2="-120" stroke="#A9B4BE" stroke-width="12"/><circle cx="420" cy="-130" r="40" fill="#F4F7F9" stroke="#8C97A2" stroke-width="6"/><rect x="-60" y="120" width="70" height="110" rx="6" fill="#EEF2F4" stroke="#A6B1BB" stroke-width="4"/></g>`).join(""),
  "cctv-mast": () => sky("#9CC9E6", "#E8F3FA") + `<rect y="700" width="${W}" height="300" fill="#9FB089"/><rect y="760" width="${W}" height="120" fill="#B9B2A3"/>
    <rect x="200" y="380" width="520" height="320" fill="#D8CBB5"/>${[...Array(4)].map((_, i) => `<rect x="${230 + i * 125}" y="440" width="80" height="90" fill="#9DB8CC"/><rect x="${230 + i * 125}" y="570" width="80" height="90" fill="#9DB8CC"/>`).join("")}
    <rect x="1040" y="240" width="22" height="470" fill="#6F7B87"/><rect x="1062" y="250" width="110" height="16" fill="#6F7B87"/><g transform="translate(1150,268) rotate(18)"><rect width="120" height="48" rx="10" fill="#F2F4F6" stroke="#5F6B77" stroke-width="5"/><circle cx="18" cy="24" r="12" fill="#26313E"/></g>
    <rect x="1000" y="700" width="100" height="16" fill="#58636E"/>` + person(940, 820, 0.85, "#E07B2E"),
  "icu-bay": () => room("#D8E6EC", "#B6C4C8", "#E8EFF2") + ceilingLights(2) + `<rect x="230" y="210" width="1140" height="40" fill="#A7B6C1"/><path d="M260,250 v380 M330,250 v380" stroke="#C8D2DA" stroke-width="8"/>` + bed(560, 540, 1.2)
    + `<rect x="1040" y="300" width="140" height="300" rx="10" fill="#B8C3CC"/><rect x="1060" y="320" width="100" height="70" rx="6" fill="#26313E" stroke="#8FA0AE" stroke-dasharray="10 8" stroke-width="4"/><rect x="1100" y="390" width="20" height="40" fill="#8FA0AE"/>`
    + `<rect x="300" y="300" width="160" height="60" rx="8" fill="#F4F6F8" stroke="#9FAAB6" stroke-width="4"/>${[0, 1, 2].map(i => `<circle cx="${330 + i * 50}" cy="330" r="13" fill="${["#3B8B4A", "#F0F0F0", "#E4C440"][i]}" stroke="#55606C" stroke-width="3"/>`).join("")}`,
  "library-site": () => room("#E6E1D6", "#A99F8D", "#EEEAE2") + windowW(1040, 230, 280, 240) + `<rect x="300" y="640" width="380" height="60" fill="#8C6F4E"/><rect x="330" y="580" width="320" height="60" fill="#A1825E"/>`
    + [0, 1, 2, 3].map(i => `<polygon points="${780 + i * 120},760 ${810 + i * 120},640 ${840 + i * 120},760" fill="#F27B2A"/><rect x="${790 + i * 120}" y="690" width="40" height="14" fill="#FFFFFF"/>`).join("") + `<rect x="760" y="640" width="520" height="12" fill="#F2C230"/>`
    + `<rect x="420" y="250" width="420" height="260" fill="none" stroke="#B9AE9C" stroke-width="10" stroke-dasharray="26 16"/>` + person(1180, 860, 0.9, "#E07B2E"),
};
function floorPlan(story) {
  const R = (x, y, w, h, label, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" stroke="#1B2A3A" stroke-width="6"/><text x="${x + w / 2}" y="${y + h / 2}" font-family="DejaVu Sans, Arial" font-size="30" fill="#1B2A3A" text-anchor="middle" font-weight="bold">${label}</text><text x="${x + w / 2}" y="${y + h / 2 + 38}" font-family="DejaVu Sans, Arial" font-size="22" fill="#5B6B7C" text-anchor="middle">${sub}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100"><rect width="1600" height="1100" fill="#F4F7FA"/>
  ${[...Array(33)].map((_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="1100" stroke="#E2E8EF" stroke-width="1"/>`).join("")}${[...Array(23)].map((_, i) => `<line x1="0" y1="${i * 50}" x2="1600" y2="${i * 50}" stroke="#E2E8EF" stroke-width="1"/>`).join("")}
  <rect x="100" y="100" width="1400" height="760" fill="none" stroke="#1B2A3A" stroke-width="14"/>
  ${R(100, 100, 500, 380, "Simulation room 1", "Adult simulators (2)")}${R(600, 100, 450, 380, "Simulation room 2", "Paediatric simulator")}${R(1050, 100, 450, 380, "Control room", "AV recording")}
  ${R(100, 480, 600, 380, "Task training", "IV and airway trainers")}${R(700, 480, 450, 380, "Debriefing", "AV debriefing system")}${R(1150, 480, 350, 380, "Store", "Beds and furniture")}
  ${[[560, 480], [850, 480], [1250, 480], [380, 480], [960, 860]].map(([x, y]) => `<rect x="${x}" y="${y - 8}" width="90" height="16" fill="#F4F7FA"/><path d="M${x},${y} a90,90 0 0,1 90,-90" fill="none" stroke="#5B6B7C" stroke-width="3"/>`).join("")}
  <line x1="100" y1="900" x2="1500" y2="900" stroke="#5B6B7C" stroke-width="3"/><text x="800" y="935" font-family="DejaVu Sans, Arial" font-size="24" fill="#5B6B7C" text-anchor="middle">28.0 m</text>
  <rect x="100" y="960" width="1400" height="110" fill="#13294B"/><text x="130" y="1005" font-family="DejaVu Sans, Arial" font-size="30" fill="#FFFFFF" font-weight="bold">Layout: ${story.name}, ${story.campus}</text>
  <text x="130" y="1045" font-family="DejaVu Sans, Arial" font-size="22" fill="#C9D6E6">Drawing SL-01 rev B  ·  Scale 1:100  ·  SIMULATION: fictional drawing for demonstration only</text></svg>`;
}

/* ── Build ─────────────────────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (svg, w, h) => { await page.setViewportSize({ width: w, height: h }); await page.setContent(`<html><body style="margin:0">${svg}</body></html>`); return page.screenshot({ type: "jpeg", quality: 84 }); };
for (const a of manifest) {
  if (a.type === "pdd") save(a.file_path, pddPdf(input.pdds[a.pdd], input.pdds[a.pdd].number));
  else if (a.type === "quotation") save(a.file_path, quotePdf(a, input.story));
  else if (a.type === "award") save(a.file_path, awardPdf(a, input.story));
  else if (a.type === "boq") save(a.file_path, await boqXlsx(input.story));
  else if (a.type === "layout") save(a.file_path, await shot(floorPlan(input.story), 1600, 1100));
  else if (a.type === "photo") save(a.file_path, await shot(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${SCENES[a.scene]()}${stamp(dmy(a.uploaded_at))}</svg>`, W, H));
  else throw new Error("unknown asset " + a.type);
}
await browser.close();
writeFileSync(HERE + "asset-sizes.json", JSON.stringify(sizes, null, 1));
console.log(Object.keys(sizes).length, "files,", Object.values(sizes).reduce((s, x) => s + x, 0), "bytes");
for (const a of manifest) console.log(String(sizes[a.file_path]).padStart(8), a.kind.padEnd(10), a.file_name);
