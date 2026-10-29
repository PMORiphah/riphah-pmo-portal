/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY IMPORT: reading an SAP ME2J sheet (PMO, 29 Oct 2026)

   Pure functions, no React and no network, so they can be checked in Node
   against a real export. The PMO picks the ME2J .xlsx on the Inventory page;
   readMe2j() turns the sheet's rows into inventory_items rows (the same rules
   the FY 25-26 load used on 26 Oct 2026), and planImport() compares them with
   what the portal holds:
     new        in the sheet, not in the portal                → added
     changed    in both, some figure or text differs           → updated
     back       marked earlier, in the sheet again              → updated, mark cleared
     deleted    SAP deletion flag "L" on a line the portal has  → marked "Deleted in SAP"
     missing    the portal has it (same project), the sheet      → marked "Not in latest SAP sheet"
                does not                                          (kept, out of the totals; PMO decision)
     skipped    deleted in SAP and never loaded, or no project code
   Key = PO number + PO item. The fiscal year comes from the SAP project ID
   (IT.261107-04 → 26 → FY 25-26; 27 → FY 26-27).
   ═══════════════════════════════════════════════════════════════════════════ */

const CODE_RE = /^[A-Z]{2,}\.\d{6}-\d+$/;
export const normCode = (c) => String(c ?? "").replace(/\s+/g, "").toUpperCase();
export const fyOfCode = (code) => {
  const m = /^[A-Z]+\.(\d{2})\d{4}-/.exec(normCode(code));
  if (!m) return null;
  const y = Number(m[1]);
  return `FY ${String(y - 1).padStart(2, "0")}-${String(y).padStart(2, "0")}`;
};

// Columns the import needs, by their ME2J heading (compared without case or extra spaces).
const NEED = {
  po: "purchasing document", item: "item", text: "short text", wbs: "wbs element",
  total: "total", openQty: "still to be delivered (qty)", openVal: "still to be delivered (value)",
};
const OPTIONAL = {
  type: "purchasing doc. type", group: "purchasing group", date: "document date", supplier: "supplier/supplying plant",
  material: "material", mg: "material group", del: "deletion indicator", cat: "item category", plant: "plant",
  store: "storage location", qty: "order quantity", unit: "order unit", price: "net price", cur: "currency",
  invQty: "still to be invoiced (qty)", invVal: "still to be invoiced (val.)", name: "project name", network: "network",
};
const key = (h) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const str = (v) => blank(v) ? null : String(v).replace(/ /g, " ").trim();
const num = (v) => {
  if (blank(v)) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
// Excel day number, "22.10.2025", "2025-10-22" or a Date → "2025-10-22".
export const isoDay = (v) => {
  if (blank(v)) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/* rows = the sheet as arrays (first row may be anything above the heading row).
   Returns { lines, deletedKeys, skipped, fiscalYears, headerRow } or { error }. */
export function readMe2j(rows, fileName = "SAP sheet") {
  const hi = rows.slice(0, 10).findIndex(r => Array.isArray(r) && r.some(c => key(c) === NEED.po) && r.some(c => key(c) === NEED.text));
  if (hi < 0) return { error: "This does not look like an SAP ME2J export: no heading row with “Purchasing Document” and “Short Text” was found." };
  const head = rows[hi];
  // The ME2J columns end at the first empty heading; anything after a gap (e.g. a separate project list) is ignored.
  let end = head.findIndex((c, i) => i > 0 && blank(c));
  if (end < 0) end = head.length;
  const H = head.slice(0, end).map(c => String(c ?? "").trim());
  const first = (name) => H.findIndex(h => key(h) === name);
  const col = {};
  for (const [k, name] of Object.entries({ ...NEED, ...OPTIONAL })) col[k] = first(name);
  // Two "WBS element" columns in ME2J: use the one that holds project IDs.
  const wbsCols = H.map((h, i) => key(h) === NEED.wbs ? i : -1).filter(i => i >= 0);
  if (wbsCols.length > 1) {
    const hits = (i) => rows.slice(hi + 1).reduce((a, r) => a + (CODE_RE.test(normCode(r?.[i])) ? 1 : 0), 0);
    col.wbs = wbsCols.reduce((b, i) => hits(i) > hits(b) ? i : b, wbsCols[0]);
  }
  const missing = Object.entries(NEED).filter(([k]) => col[k] < 0).map(([, n]) => n);
  if (missing.length) return { error: `This does not look like an SAP ME2J export: missing column${missing.length > 1 ? "s" : ""} ${missing.map(n => `“${n}”`).join(", ")}.` };

  // Headings repeated in ME2J get " (2)" in the stored SAP row, as in the first load.
  const seen = {};
  const rawNames = H.map(h => { seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h} (${seen[h]})` : h; });
  const at = (r, k) => col[k] >= 0 ? r[col[k]] : null;

  const byKey = new Map(), deletedKeys = new Map(), skipped = { noCode: 0, duplicate: 0 };
  const fiscalYears = new Set();
  rows.slice(hi + 1).forEach((r, j) => {
    if (!Array.isArray(r)) return;
    const po = str(at(r, "po"));
    if (!po) return;
    const item = str(at(r, "item")) || "0";
    const code = normCode(at(r, "wbs"));
    const fy = fyOfCode(code);
    if (!fy) { skipped.noCode++; return; }
    fiscalYears.add(fy);
    const k = `${po}/${item}`;
    if (str(at(r, "del")) === "L") { deletedKeys.set(k, { po_number: po, po_item: item, fiscal_year: fy, sap_project_code: code, description: str(at(r, "text")) }); return; }
    if (byKey.has(k)) skipped.duplicate++;
    const sup = str(at(r, "supplier")) || "";
    const sm = /^(\d+)\s+(.*)$/.exec(sup);
    const raw = {};
    rawNames.forEach((n, i) => { const v = r[i]; if (!blank(v)) raw[n] = col.date === i ? (isoDay(v) || v) : v; });
    byKey.set(k, {
      po_number: po, po_item: item, fiscal_year: fy,
      sap_project_code: code, sap_project_name: str(at(r, "name")), sap_network: str(at(r, "network")),
      po_date: isoDay(at(r, "date")), po_type: str(at(r, "type")), purchasing_group: str(at(r, "group")),
      supplier_code: sm ? sm[1] : null, supplier_name: (sm ? sm[2].trim() : sup) || null,
      material: str(at(r, "material")), description: str(at(r, "text")) || "(no text in SAP)", material_group: str(at(r, "mg")),
      is_service: str(at(r, "cat")) === "D", plant: str(at(r, "plant")), profit_center: str(at(r, "store")),
      qty: num(at(r, "qty")), unit: str(at(r, "unit")), net_price: num(at(r, "price")), total: num(at(r, "total")),
      currency: str(at(r, "cur")) || "PKR",
      open_qty: num(at(r, "openQty")), open_value: num(at(r, "openVal")),
      to_invoice_qty: num(at(r, "invQty")), to_invoice_value: num(at(r, "invVal")),
      raw, source: `${fileName} row ${hi + 2 + j}`,
    });
  });
  // A line that is both active and flagged deleted in the same sheet counts as active.
  for (const k of byKey.keys()) deletedKeys.delete(k);
  return { lines: [...byKey.values()], deletedKeys, skipped, fiscalYears: [...fiscalYears].sort(), headerRow: hi + 1 };
}

// Fields compared to decide "changed" (what the page shows or totals).
export const COMPARE = {
  fiscal_year: "Fiscal year", sap_project_code: "Project code", sap_project_name: "Project name", project_id: "Portal project",
  past_project_id: "Past project", po_date: "PO date", po_type: "PO type", supplier_name: "Supplier", supplier_code: "Supplier code",
  material: "Material", description: "Description", material_group: "Material group", is_service: "Goods / service",
  plant: "Plant", profit_center: "Storage location", qty: "Quantity", unit: "Unit", net_price: "Net price", total: "Total",
  currency: "Currency", open_qty: "Still to be delivered (qty)", open_value: "Still to be delivered (value)",
  to_invoice_qty: "Still to be invoiced (qty)", to_invoice_value: "Still to be invoiced (value)",
  sap_network: "Network", purchasing_group: "Purchasing group",
};
const NUMS = new Set(["qty", "net_price", "total", "open_qty", "open_value", "to_invoice_qty", "to_invoice_value"]);
const same = (k, a, b) => NUMS.has(k) ? Math.abs(Number(a || 0) - Number(b || 0)) < 0.005
  : k === "is_service" ? !!a === !!b : (blank(a) ? null : String(a)) === (blank(b) ? null : String(b));

/* existing = inventory_items rows (id, po_number, po_item, sap_deleted, not_in_sheet_since + COMPARE fields).
   projects / past = [{id, code}] to link a line to the portal by its SAP project code (codes used once only). */
export function planImport(read, existing, projects = [], past = []) {
  const idx = (list) => {
    const m = new Map(), dup = new Set();
    list.forEach(p => { const c = normCode(p.code); if (!CODE_RE.test(c)) return; if (m.has(c)) dup.add(c); m.set(c, p.id); });
    dup.forEach(c => m.delete(c));
    return m;
  };
  const fyIdx = idx(projects), pastIdx = idx(past);
  const have = new Map(existing.map(r => [`${r.po_number}/${r.po_item}`, r]));
  const out = { add: [], update: [], unchanged: 0, markDeleted: [], markMissing: [], stillMissing: 0, leftOut: 0 };
  const inSheet = new Set();
  for (const l of read.lines) {
    const k = `${l.po_number}/${l.po_item}`;
    inSheet.add(k);
    const cur = have.get(k);
    // A code the portal cannot match keeps the line's earlier link (so a failed project lookup never unlinks lines).
    const keep = cur && cur.sap_project_code === l.sap_project_code;
    const row = { ...l, project_id: fyIdx.get(l.sap_project_code) || (keep ? cur.project_id : null) || null,
      past_project_id: pastIdx.get(l.sap_project_code) || (keep ? cur.past_project_id : null) || null,
      sap_deleted: false, not_in_sheet_since: null };
    if (!cur) { out.add.push(row); continue; }
    const changes = Object.keys(COMPARE).filter(f => !same(f, cur[f], row[f])).map(f => ({ field: f, from: cur[f], to: row[f] }));
    const back = cur.sap_deleted ? "deleted" : cur.not_in_sheet_since ? "missing" : null;
    if (changes.length || back) out.update.push({ row, cur, changes, back });
    else out.unchanged++;
  }
  for (const [k, d] of read.deletedKeys) {
    inSheet.add(k);
    const cur = have.get(k);
    if (!cur) out.leftOut++;
    else if (!cur.sap_deleted) out.markDeleted.push(cur);
    else out.unchanged++;
  }
  // Only projects the sheet covers (PMO, 29 Oct 2026): an export of some projects never marks the lines of
  // projects it leaves out, so an FY 26-27 export that also carries QIE / Malakand (FY 25-26 codes) does not
  // mark the rest of FY 25-26. A full-year export covers every project, so it still finds every missing line.
  const codes = new Set([...read.lines.map(l => l.sap_project_code), ...[...read.deletedKeys.values()].map(d => d.sap_project_code)]);
  const fys = new Set(read.fiscalYears);
  const covered = (r) => fys.has(r.fiscal_year) && codes.has(r.sap_project_code);
  for (const r of existing) {
    const k = `${r.po_number}/${r.po_item}`;
    if (inSheet.has(k) || !covered(r) || r.sap_deleted) continue;
    if (r.not_in_sheet_since) out.stillMissing++;
    else out.markMissing.push(r);
  }
  // Per fiscal year: how many of the portal's active lines of the sheet's projects it would mark (a cut-short export shows up here).
  out.missingShare = read.fiscalYears.map(fy => {
    const active = existing.filter(r => r.fiscal_year === fy && covered(r) && !r.sap_deleted && !r.not_in_sheet_since).length;
    const n = out.markMissing.filter(r => r.fiscal_year === fy).length;
    return { fy, active, missing: n, share: active ? n / active : 0 };
  });
  return out;
}
