// PMO Simulation: the files the simulation serves itself (public/sim/files). Deterministic.
// - Project documents: PDFs (a small pure-JS writer, "SIMULATION - FICTIONAL DATA" across every page),
//   the BOQ workbook (exceljs from the repo) and the floor plan (SVG rendered by Chromium).
// - Sample-mode illustrations (sample-media/sNN.jpg), drawn here and stamped "SIMULATION · illustration".
// No campus or person name is ever printed; vendors are invented and marked "(sample)". Nothing is fetched.
// Called by gen.mjs: buildAssets(input, outDir) -> { "<relative path>": bytes }.
// Chromium: Playwright from $SIM_PLAYWRIGHT (path to playwright's index.js), else the repo's or a global
// install; the browser from Playwright's default location, or $SIM_CHROMIUM.
import { writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const pk = (n) => Math.round(n).toLocaleString("en");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)} ${MON[m - 1]} ${y}`; };

/* ── Minimal PDF writer (Helvetica, WinAnsi, A4) ───────────────────────── */
const W_DIG = { "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ",": 278, ".": 278, " ": 278, "-": 333, "P": 667, "K": 667, "R": 722 };
const tw = (s, size, bold) => [...String(s)].reduce((w, c) => w + (W_DIG[c] ?? (c === c.toUpperCase() && /[A-Z]/.test(c) ? 680 : 520)) * (bold ? 1.05 : 1), 0) * size / 1000;
const esc = (s) => String(s).replace(/[^\x20-\x7E]/g, "-").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
class Doc {
  constructor() { this.pages = []; this.page(); }
  page() { this.ops = []; this.pages.push(this.ops); this.y = 790; this.watermark(); return this; }
  watermark() { this.ops.push("q /GS1 gs 0.55 0.60 0.68 rg BT /F2 40 Tf 0.766 0.643 -0.643 0.766 62 190 Tm (SIMULATION - FICTIONAL DATA) Tj ET Q"); }
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
function table(d, cols, rows, opt = {}) {  // cols: [label, x, align('l'|'r')]
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
  const kv = [["Project", p.name], ["Project ID", p.code], ["Cost centre", p.costCentre], ["Project type", "Budgeted"], ["Planned start", dmy(p.start)], ["Planned finish", dmy(p.end)],
    ["Strategic priority", p.strat], ["DF Recommended (plan)", `PKR ${pk(p.df)}`]];
  kv.forEach(([k, v], i) => { const x = i % 2 ? 310 : 40, y = d.y - Math.floor(i / 2) * 30; d.text(x, y + 9, k.toUpperCase(), 7, true, "0.45 0.50 0.58").text(x, y - 3, v, 10.5, true); });
  d.y -= 130;
  d.text(40, d.y, "Problem", 11, true); d.y = d.wrap(40, d.y - 15, p.problem, 515);
  d.y -= 6; d.text(40, d.y, "Proposed solution", 11, true); d.y = d.wrap(40, d.y - 15, `${p.solution} The items and works are listed in the cost table below; the facility is handed over to the department before the planned finish date.`, 515);
  d.y -= 6; d.text(40, d.y, "Success criteria", 11, true); d.y = d.wrap(40, d.y - 15, "All items delivered, installed and signed off by the department; the facility in daily use within two weeks of handover; no open snags at the PCD.", 515);
  d.y -= 14; d.text(40, d.y, "Cost table", 11, true); d.y -= 20;
  const total = p.items.reduce((s, i) => s + i.total, 0);
  table(d, [["#", 44, "l"], ["Item", 64, "l"], ["Qty", 330, "r"], ["Unit", 342, "l"], ["Unit cost (PKR)", 470, "r"], ["Total (PKR)", 555, "r"]],
    p.items.map((it, i) => [String(i + 1), it.description, String(it.qty), it.unit, pk(it.unit_cost), pk(it.total)]), { total: ["Grand total", pk(total)] });
  d.page(); letterhead(d, "Approval history", `${num}  |  ${p.name}`);
  table(d, [["Stage", 44, "l"], ["Role", 190, "l"], ["Decision", 360, "l"], ["Date", 555, "r"]], [
    ["Initiated", "Campus office (sample)", "Submitted", "E-PDD record"], ["Campus review", "Campus Director (sample)", "Approved", "E-PDD record"],
    ["PMO review", "PMO reviewer (sample)", "Recommended", "E-PDD record"], ["PMO decision", "PMO (sample)", "Recommended", "E-PDD record"]]);
  d.y -= 10; d.wrap(40, d.y, "Approving the PDD approves the document only. The project is sanctioned after Director Finance, Executive Director and Managing Trustee review in the portal.", 515, 9.5);
  return d.build();
}
function quotePdf(a, story) {
  const d = new Doc(); const lines = a.lines.map(n => story.items[n - 1]);
  const net = lines.reduce((s, i) => s + i.total, 0); const qn = `Q-${a.vcode}-2026-0${a.lines[0] + 40}`;
  letterhead(d, "Quotation", `${a.vendor}  |  ${qn}  |  ${dmy(a.uploaded_at)}`, a.vendor.toUpperCase());
  d.text(40, d.y, "To: Project Management Office (sample address)", 9.5).text(40, d.y - 14, `Subject: ${story.name} (${story.code})`, 9.5, true); d.y -= 40;
  table(d, [["Line", 44, "l"], ["Description", 74, "l"], ["Qty", 330, "r"], ["Unit", 342, "l"], ["Unit price (PKR)", 470, "r"], ["Amount (PKR)", 555, "r"]],
    lines.map((it, i) => [String(a.lines[i]), it.description, String(it.qty), it.unit, pk(it.unit_cost), pk(it.total)]), { total: ["Total", pk(net)] });
  d.y -= 8; d.wrap(40, d.y, "Prices include delivery to site, installation and one year of on-site warranty. Validity: 60 days. Payment: 30% advance against bank guarantee, balance on delivery and acceptance.", 515, 9.5);
  return d.build();
}
function awardPdf(a, story) {
  const d = new Doc(); const lines = a.lines.map(n => story.items[n - 1]); const total = lines.reduce((s, i) => s + i.total, 0);
  letterhead(d, "Letter of award", `Ref. PMO/AW/2026/117  |  ${dmy(a.uploaded_at)}`);
  let y = d.wrap(40, d.y, `To: ${a.vendor}`, 515, 10.5);
  y = d.wrap(40, y - 8, `Subject: Award of supply - ${story.name} (${story.code})`, 515, 10.5);
  y = d.wrap(40, y - 12, `Further to your quotation and the evaluation by the purchase committee, the University awards you the supply and installation of the study pods, group study furniture, book stacks and self-service lending stations listed below, for a total of PKR ${pk(total)}.`, 515);
  d.y = y - 10; table(d, [["Line", 44, "l"], ["Item", 74, "l"], ["Qty", 420, "r"], ["Amount (PKR)", 555, "r"]], lines.map((it, i) => [String(a.lines[i]), it.description, String(it.qty), pk(it.total)]), { total: ["Total", pk(total)] });
  y = d.wrap(40, d.y - 8, "Delivery to site is required by 10 November 2026. Please confirm acceptance within seven days. Contact: Project Management Office.", 515);
  d.text(40, y - 40, "Project Management Office", 10, true).text(40, y - 54, "(simulation signature)", 9, false, "0.45 0.50 0.58");
  return d.build();
}

/* ── BOQ workbook (zip entries dated to the upload day, so the bytes never change) ── */
async function boqXlsx(a, story) {
  const when = new Date(a.uploaded_at);
  const wb = new ExcelJS.Workbook(); wb.creator = "PMO Simulation"; wb.lastModifiedBy = "PMO Simulation"; wb.created = when; wb.modified = when;
  const ws = wb.addWorksheet("BOQ", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 6 }, { width: 52 }, { width: 8 }, { width: 8 }, { width: 16 }, { width: 18 }];
  ws.addRow(["SIMULATION - fictional data", "", "", "", "", ""]).font = { bold: true, color: { argb: "FFB0412E" } };
  const line = story.items[a.line - 1];
  ws.addRow([`Bill of quantities: ${line.description} - ${story.name} (${story.code})`]).font = { bold: true, size: 12 };
  ws.addRow([]);
  const h = ws.addRow(["#", "Description", "Qty", "Unit", "Rate (PKR)", "Amount (PKR)"]); h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF13294B" } }; });
  const L = [["Power and data floor boxes for study areas", 48, "No", 18500], ["Data points and cabling to the study pods", 60, "No", 9500], ["LED ceiling lights with daylight control", 96, "No", 14500],
    ["Exit signs and night lighting", 18, "No", 16000], ["Distribution board and isolators", 1, "Set", 520000], ["Cable trays and wiring", 1, "Job", 690000],
    ["Wi-Fi access points and mounts", 12, "No", 62000], ["Testing, certification and handover", 1, "Job", 508000]];
  L.forEach((r, i) => ws.addRow([i + 1, r[0], r[1], r[2], r[3], { formula: `C${i + 5}*E${i + 5}`, result: r[1] * r[3] }]));
  const total = L.reduce((s, r) => s + r[1] * r[3], 0);
  const t = ws.addRow(["", `Total (PDD line ${a.line}: ${line.description})`, "", "", "", { formula: `SUM(F5:F${L.length + 4})`, result: total }]); t.font = { bold: true };
  ws.getColumn(5).numFmt = "#,##0"; ws.getColumn(6).numFmt = "#,##0";
  if (total !== line.total) throw new Error(`BOQ total ${total} != PDD line ${a.line} ${line.total}`);
  const raw = await wb.xlsx.writeBuffer();
  const zin = await JSZip.loadAsync(raw); const zout = new JSZip();
  for (const name of Object.keys(zin.files).sort()) { const f = zin.files[name]; if (f.dir) continue; zout.file(name, await f.async("uint8array"), { date: when, createFolders: false }); }
  return Buffer.from(await zout.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" }));
}

/* ── Drawings (SVG) ────────────────────────────────────────────────────── */
const W = 1600, H = 1000;
function shade(hex, pct) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * pct / 100))); return `#${[n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join("")}`; }
const room = (wall, floor, ceil = "#EEF1F4") => `<rect width="${W}" height="${H}" fill="${ceil}"/><polygon points="220,170 1380,170 1380,690 220,690" fill="${wall}"/>
  <polygon points="0,0 220,170 220,690 0,1000" fill="${shade(wall, -14)}"/><polygon points="1600,0 1380,170 1380,690 1600,1000" fill="${shade(wall, -8)}"/>
  <polygon points="0,1000 220,690 1380,690 1600,1000" fill="${floor}"/>${[...Array(9)].map((_, i) => `<line x1="${220 + i * 145}" y1="690" x2="${-200 + i * 250}" y2="1000" stroke="${shade(floor, -10)}" stroke-width="2"/>`).join("")}
  <line x1="0" y1="850" x2="1600" y2="850" stroke="${shade(floor, -8)}" stroke-width="2"/>`;
const ceilingLights = (n = 4, y = 120) => [...Array(n)].map((_, i) => `<rect x="${300 + i * (1000 / n)}" y="${y}" width="160" height="18" rx="4" fill="#FFFBE8"/><rect x="${300 + i * (1000 / n)}" y="${y + 18}" width="160" height="6" fill="#E6E2CF"/>`).join("");
const windowW = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#BFD8EA" stroke="#FFFFFF" stroke-width="10"/><line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#FFFFFF" stroke-width="8"/><rect x="${x + 10}" y="${y + 10}" width="${w / 2 - 20}" height="${h * 0.35}" fill="#D7E8F4"/>`;
const person = (x, y, s = 1, coat = "#2F6FA8") => `<g transform="translate(${x},${y}) scale(${s})"><circle cx="0" cy="-150" r="26" fill="#C99A78"/><path d="M-26,-160 q26,-36 52,0" fill="#3A2C25"/>
  <rect x="-40" y="-120" width="80" height="120" rx="20" fill="${coat}"/><rect x="-34" y="0" width="28" height="110" rx="10" fill="#3E4A5A"/><rect x="6" y="0" width="28" height="110" rx="10" fill="#3E4A5A"/><rect x="-62" y="-112" width="22" height="90" rx="10" fill="${coat}"/><rect x="40" y="-112" width="22" height="90" rx="10" fill="${coat}"/></g>`;
const mark = () => `<g opacity="0.9"><rect x="24" y="926" width="372" height="50" rx="8" fill="#0D1B2E" fill-opacity="0.6"/><text x="40" y="960" font-family="DejaVu Sans, Arial" font-size="22" fill="#FFFFFF" letter-spacing="2">SIMULATION · illustration</text></g>`;
const sky = (top = "#8EC3E8", bottom = "#DCEFFA") => `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
const desk = (x, y, s = 1, top = "#9B7650") => `<g transform="translate(${x},${y}) scale(${s})"><rect width="150" height="20" fill="${top}"/><rect x="10" y="20" width="10" height="70" fill="#5E6670"/><rect x="130" y="20" width="10" height="70" fill="#5E6670"/></g>`;
const SCENES = {
  "study-room": () => room("#EDE7DA", "#B49C82", "#F4F1EA") + ceilingLights(4) + windowW(1020, 230, 300, 240) + [0, 1, 2].map(i => desk(330 + i * 230, 640, 1.3, "#C9A97C")).join("") + person(560, 860, 0.85, "#3E6CA8") + person(980, 880, 0.9, "#2E7D6B"),
  "site-works": () => room("#E6E1D6", "#A99F8D", "#EEEAE2") + windowW(1040, 230, 280, 240) + `<rect x="300" y="640" width="380" height="60" fill="#8C6F4E"/><rect x="330" y="580" width="320" height="60" fill="#A1825E"/>`
    + [0, 1, 2, 3].map(i => `<polygon points="${780 + i * 120},760 ${810 + i * 120},640 ${840 + i * 120},760" fill="#F27B2A"/><rect x="${790 + i * 120}" y="690" width="40" height="14" fill="#FFFFFF"/>`).join("") + `<rect x="760" y="640" width="520" height="12" fill="#F2C230"/>`
    + `<rect x="420" y="250" width="420" height="260" fill="none" stroke="#B9AE9C" stroke-width="10" stroke-dasharray="26 16"/>` + person(1180, 860, 0.9, "#E07B2E"),
  "network-rack": () => room("#D9DEE4", "#9EA8B2", "#E5E9ED") + [0, 1, 2].map(i => `<g transform="translate(${430 + i * 270},210)"><rect width="230" height="560" rx="8" fill="#1F2630"/>${[...Array(14)].map((_, k) => `<rect x="18" y="${20 + k * 38}" width="194" height="28" rx="3" fill="#2F3946"/>${[...Array(8)].map((_, j) => `<circle cx="${40 + j * 20}" cy="${34 + k * 38}" r="4" fill="${(j + k + i) % 5 === 0 ? "#F2B134" : "#3FD18B"}"/>`).join("")}`).join("")}</g>`).join("")
    + `<path d="M430,215 C380,120 300,120 240,170" stroke="#3E86C8" stroke-width="14" fill="none"/><path d="M890,215 C900,120 1100,100 1240,170" stroke="#E27D3B" stroke-width="14" fill="none"/>`,
  "exam-hall": () => room("#E8E4DA", "#C9BBA2", "#F0EEE8") + ceilingLights(5) + [...Array(4)].map((_, rr) => [...Array(6 - rr % 2)].map((_, c) => `<g transform="translate(${180 + c * 230 + (rr % 2) * 115 - rr * 40},${600 + rr * 90}) scale(${0.8 + rr * 0.1})"><rect width="150" height="20" fill="#9B7650"/><rect x="10" y="20" width="10" height="70" fill="#5E6670"/><rect x="130" y="20" width="10" height="70" fill="#5E6670"/><rect x="40" y="40" width="70" height="14" fill="#2F5E8F"/><rect x="50" y="54" width="8" height="40" fill="#5E6670"/><rect x="92" y="54" width="8" height="40" fill="#5E6670"/></g>`).join("")).join(""),
  "solar-panels": () => sky() + `<polygon points="0,640 1600,560 1600,1000 0,1000" fill="#B9B3A6"/><polygon points="0,640 1600,560 1600,580 0,660" fill="#8E877B"/>`
    + [...Array(4)].map((_, rr) => [...Array(7)].map((_, c) => `<g transform="translate(${80 + c * 215 + rr * 30},${700 + rr * 70 - c * 11}) skewX(-18)"><rect width="190" height="60" fill="#1F3C68" stroke="#C5D2E0" stroke-width="4"/>${[1, 2, 3].map(k => `<line x1="${k * 47}" y1="0" x2="${k * 47}" y2="60" stroke="#5C7DAA" stroke-width="2"/>`).join("")}<line x1="0" y1="30" x2="190" y2="30" stroke="#5C7DAA" stroke-width="2"/></g>`).join("")).join("")
    + `<circle cx="1380" cy="160" r="70" fill="#FFF3B0"/><rect x="1200" y="420" width="200" height="150" fill="#D9D3C6"/><rect x="1230" y="450" width="60" height="60" fill="#9BB9CF"/>` + person(220, 640, 0.75, "#2F6FA8"),
  "classroom-lights": () => room("#E3E8EC", "#B9C0C6", "#F2F4F6") + [...Array(3)].map((_, rr) => [...Array(4)].map((_, c) => `<rect x="${330 + c * 250}" y="${40 + rr * 70}" width="190" height="34" rx="6" fill="#FFFDF0" stroke="#D8D4BE" stroke-width="4"/>`).join("")).join("")
    + `<rect x="420" y="260" width="760" height="300" fill="#2F4F3F" stroke="#7A5C3A" stroke-width="14"/>` + [0, 1, 2, 3].map(i => desk(260 + i * 290, 720, 1.1)).join(""),
  "rooftop-chillers": () => sky("#9CC9E6", "#E8F3FA") + `<rect y="640" width="${W}" height="360" fill="#A9A49A"/><rect y="640" width="${W}" height="14" fill="#8C877E"/>`
    + [0, 1].map(i => `<g transform="translate(${300 + i * 560},420)"><rect width="440" height="230" rx="10" fill="#D7DCE1" stroke="#8E99A4" stroke-width="6"/>${[0, 1, 2].map(k => `<circle cx="${80 + k * 140}" cy="70" r="52" fill="#9AA6B2" stroke="#6E7A86" stroke-width="6"/><line x1="${80 + k * 140 - 40}" y1="70" x2="${80 + k * 140 + 40}" y2="70" stroke="#55606C" stroke-width="6"/>`).join("")}<rect x="20" y="150" width="400" height="60" fill="#C5CBD1"/></g>`).join("") + person(1300, 820, 0.8, "#E07B2E"),
  "tiled-room": () => room("#EAF0F3", "#B7C3CC", "#F2F4F6") + [...Array(12)].map((_, i) => `<line x1="${220 + i * 97}" y1="170" x2="${220 + i * 97}" y2="690" stroke="#D2DCE2" stroke-width="3"/>`).join("") + [...Array(6)].map((_, i) => `<line x1="220" y1="${170 + i * 87}" x2="1380" y2="${170 + i * 87}" stroke="#D2DCE2" stroke-width="3"/>`).join("")
    + `<rect x="300" y="560" width="300" height="130" fill="#C9D3DA"/><rect x="980" y="300" width="260" height="200" rx="8" fill="#C9E0EE" stroke="#8FA3B4" stroke-width="5"/>` + ceilingLights(3, 110) + person(760, 880, 0.9, "#2F6FA8"),
  "library-pods": () => room("#F1ECE2", "#B79C7E", "#F5F2EA") + ceilingLights(4) + windowW(260, 230, 260, 260) + [0, 1, 2].map(i => `<g transform="translate(${560 + i * 270},430)"><rect width="230" height="280" rx="24" fill="${["#2E7D6B", "#C26A3D", "#3E6CA8"][i]}"/><rect x="20" y="30" width="190" height="150" rx="14" fill="#F6F1E6"/><rect x="40" y="190" width="150" height="40" rx="10" fill="#E8DCC6"/><rect x="60" y="110" width="110" height="60" rx="6" fill="#26313E"/></g>`).join("") + person(500, 860, 0.9, "#7A4E9B"),
  "cctv-mast": () => sky("#9CC9E6", "#E8F3FA") + `<rect y="700" width="${W}" height="300" fill="#9FB089"/><rect y="760" width="${W}" height="120" fill="#B9B2A3"/>
    <rect x="200" y="380" width="520" height="320" fill="#D8CBB5"/>${[...Array(4)].map((_, i) => `<rect x="${230 + i * 125}" y="440" width="80" height="90" fill="#9DB8CC"/><rect x="${230 + i * 125}" y="570" width="80" height="90" fill="#9DB8CC"/>`).join("")}
    <rect x="1040" y="240" width="22" height="470" fill="#6F7B87"/><rect x="1062" y="250" width="110" height="16" fill="#6F7B87"/><g transform="translate(1150,268) rotate(18)"><rect width="120" height="48" rx="10" fill="#F2F4F6" stroke="#5F6B77" stroke-width="5"/><circle cx="18" cy="24" r="12" fill="#26313E"/></g>
    <rect x="1000" y="700" width="100" height="16" fill="#58636E"/>` + person(940, 820, 0.85, "#E07B2E"),
  "workshop": () => room("#DCE1E6", "#A3ABB3", "#E8EBEE") + ceilingLights(3) + [0, 1, 2].map(i => `<g transform="translate(${300 + i * 360},480)"><rect width="260" height="190" rx="10" fill="#5C7DAA"/><rect x="20" y="20" width="220" height="70" fill="#D9E2EC"/><circle cx="200" cy="140" r="26" fill="#F2B134"/><rect x="30" y="190" width="200" height="70" fill="#3E4A5A"/></g>`).join("") + person(1300, 860, 0.9, "#E07B2E"),
  "signage": () => sky("#A5CFEA", "#EEF6FB") + `<rect y="720" width="${W}" height="280" fill="#B8B1A2"/><rect x="0" y="420" width="${W}" height="300" fill="#D9D0BF"/>${[...Array(6)].map((_, i) => `<rect x="${80 + i * 260}" y="470" width="140" height="160" fill="#9DB8CC"/>`).join("")}
    <rect x="620" y="560" width="22" height="300" fill="#5E6A76"/><rect x="900" y="560" width="22" height="300" fill="#5E6A76"/><rect x="560" y="480" width="420" height="120" rx="10" fill="#13294B"/>${[0, 1].map(k => `<rect x="600" y="${505 + k * 45}" width="${320 - k * 80}" height="22" rx="4" fill="#E9EEF5"/>`).join("")}<polygon points="930,${510} 960,525 930,540" fill="#F2C230"/>` + person(1220, 880, 0.9, "#2F6FA8"),
};
function floorPlan(story) {
  const R = (x, y, w, h, label, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" stroke="#1B2A3A" stroke-width="6"/><text x="${x + w / 2}" y="${y + h / 2}" font-family="DejaVu Sans, Arial" font-size="30" fill="#1B2A3A" text-anchor="middle" font-weight="bold">${label}</text><text x="${x + w / 2}" y="${y + h / 2 + 38}" font-family="DejaVu Sans, Arial" font-size="22" fill="#5B6B7C" text-anchor="middle">${sub}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100"><rect width="1600" height="1100" fill="#F4F7FA"/>
  ${[...Array(33)].map((_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="1100" stroke="#E2E8EF" stroke-width="1"/>`).join("")}${[...Array(23)].map((_, i) => `<line x1="0" y1="${i * 50}" x2="1600" y2="${i * 50}" stroke="#E2E8EF" stroke-width="1"/>`).join("")}
  <rect x="100" y="100" width="1400" height="760" fill="none" stroke="#1B2A3A" stroke-width="14"/>
  ${R(100, 100, 500, 380, "Group study 1", "Tables and chairs (6 sets)")}${R(600, 100, 450, 380, "Group study 2", "Tables and chairs (6 sets)")}${R(1050, 100, 450, 380, "Study pods", "Modular pods (6)")}
  ${R(100, 480, 600, 380, "Book stacks", "Shelving, lending stations (4)")}${R(700, 480, 450, 380, "Presentation room", "AV presentation system")}${R(1150, 480, 350, 380, "Store", "Lockers and storage")}
  ${[[560, 480], [850, 480], [1250, 480], [380, 480], [960, 860]].map(([x, y]) => `<rect x="${x}" y="${y - 8}" width="90" height="16" fill="#F4F7FA"/><path d="M${x},${y} a90,90 0 0,1 90,-90" fill="none" stroke="#5B6B7C" stroke-width="3"/>`).join("")}
  <line x1="100" y1="900" x2="1500" y2="900" stroke="#5B6B7C" stroke-width="3"/><text x="800" y="935" font-family="DejaVu Sans, Arial" font-size="24" fill="#5B6B7C" text-anchor="middle">28.0 m</text>
  <rect x="100" y="960" width="1400" height="110" fill="#13294B"/><text x="130" y="1005" font-family="DejaVu Sans, Arial" font-size="30" fill="#FFFFFF" font-weight="bold">Layout: ${story.name} (${story.code})</text>
  <text x="130" y="1045" font-family="DejaVu Sans, Arial" font-size="22" fill="#C9D6E6">Drawing SH-01 rev B  ·  Scale 1:100  ·  SIMULATION: fictional drawing for demonstration only</text></svg>`;
}

async function loadChromium() {
  const tries = [process.env.SIM_PLAYWRIGHT, "playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"].filter(Boolean);
  for (const t of tries) { try { const m = await import(t); const pw = m.chromium ? m : m.default; if (pw?.chromium) return pw.chromium; } catch { /* next */ } }
  throw new Error("Playwright not found: set SIM_PLAYWRIGHT to playwright's index.js");
}

export async function buildAssets(input, outDir) {
  const sizes = {};
  const save = (fp, buf) => { const f = outDir + fp; mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); sizes[fp] = statSync(f).size; };
  const chromium = await loadChromium();
  const exe = process.env.SIM_CHROMIUM && existsSync(process.env.SIM_CHROMIUM) ? { executablePath: process.env.SIM_CHROMIUM } : {};
  const browser = await chromium.launch(exe);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const shot = async (svg, w, h) => { await page.setViewportSize({ width: w, height: h }); await page.setContent(`<html><body style="margin:0">${svg}</body></html>`); return page.screenshot({ type: "jpeg", quality: 84 }); };
  try {
    for (const a of input.documents) {
      if (a.type === "pdd") save(a.file_path, pddPdf(input.pdds[a.pdd], input.pdds[a.pdd].number));
      else if (a.type === "quotation") save(a.file_path, quotePdf(a, input.story));
      else if (a.type === "award") save(a.file_path, awardPdf(a, input.story));
      else if (a.type === "boq") save(a.file_path, await boqXlsx(a, input.story));
      else if (a.type === "layout") save(a.file_path, await shot(floorPlan(input.story), 1600, 1100));
      else throw new Error("unknown asset " + a.type);
    }
    for (const s of input.sample) {
      const draw = SCENES[s.scene]; if (!draw) throw new Error("unknown illustration " + s.scene);
      save(s.file, await shot(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${draw()}${mark()}</svg>`, W, H));
    }
  } finally { await browser.close(); }
  return sizes;
}
