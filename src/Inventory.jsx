import { useState, useEffect, useMemo, useCallback } from "react";
import { Boxes, Search, Download, ChevronDown, ChevronRight, X, ExternalLink, PackageCheck, Truck, Wrench, Building2, Users, FileText } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Input, Select, Modal, CAN_HOVER, useViewport } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY (PMO, 26 Oct 2026)

   Every active purchase-order line of SAP's ME2J report (purchase orders by
   project) for FY 2025-26, and FY 2026-27 when that sheet arrives; table
   inventory_items, PMO only by RLS. Goods are shown by default, services
   (design, civil works) one filter away. Delivery status is worked out by the
   database from SAP's "still to be delivered". Plants are named as the PMO gave
   them; profit centres (ME2J's storage location) and material groups stay as
   numbers. A project name opens it in the portal when the code is an FY 26-27
   project or on Past Projects; finished FY 25-26 projects keep their SAP name.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PLANTS = {
  "1100": "Trust Islamabad/Rawalpindi",
  "1200": "Trust Lahore",
  "1300": "Trust Malakand",
  "2100": "Riphah",
};
const STATUS = {
  delivered:     { label: "Delivered",        color: DATA.positive },
  partly:        { label: "Partly delivered", color: DATA.warning },
  not_delivered: { label: "Not delivered",    color: BRAND.blueBright },
};
const COLS = "id,po_number,po_item,fiscal_year,sap_project_code,sap_project_name,project_id,past_project_id,po_date,po_type," +
  "supplier_code,supplier_name,material,description,material_group,is_service,plant,profit_center,qty,unit,net_price,total,currency," +
  "open_qty,open_value,to_invoice_value,delivery_status";
const PAGE = 1000;
const GROUP_KEY = "pmo-inventory-group";
const GROUPS = { project: "Grouped by project", supplier: "Grouped by supplier", plant: "Grouped by plant" };
const SHOW = 150;          // rows shown at once in a list before "Show more"

const fmt = (n) => Number(n || 0).toLocaleString("en", { maximumFractionDigits: 0 });
const fmtQ = (n) => Number(n || 0).toLocaleString("en", { maximumFractionDigits: 3 });
const fmtM = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : fmt(v); };
const fmtDay = (s) => s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const pkr = (r) => r.currency === "PKR" ? Number(r.total || 0) : 0;
const plantName = (p) => PLANTS[p] || (p ? `Plant ${p}` : "—");
const norm = (s) => String(s || "").toLowerCase();
const todayPKT = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

export function InventoryPage({ T, session, supa, onOpenProject, onOpenPast }) {
  const vp = useViewport();
  const compact = vp.isCompact;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ fy: "", project: "", supplier: "", plant: "", pc: "", mg: "", type: "goods", status: "", from: "", to: "" });
  // Not grouped by default (PMO, 26 Oct 2026). A grouping the PMO picks stays, also after leaving the page or
  // reloading, until it is changed or cleared (its chip's ×). Kept in this browser only.
  const [groupBy, setGroupByState] = useState(() => {
    try { const g = localStorage.getItem(GROUP_KEY); return GROUPS[g] ? g : "none"; } catch { return "none"; }
  });
  const setGroupBy = (g) => {
    setGroupByState(g); setOpen({}); setLimit({});
    try { if (g === "none") localStorage.removeItem(GROUP_KEY); else localStorage.setItem(GROUP_KEY, g); } catch { /* ignore */ }
  };
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const [open, setOpen] = useState({});                // group key → expanded
  const [limit, setLimit] = useState({});              // group key → rows shown
  const [detail, setDetail] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const all = [];
      for (let off = 0; ; off += PAGE) {
        const r = await supa(`/rest/v1/inventory_items?select=${COLS}&sap_deleted=eq.false&order=po_date.desc,po_number.asc,po_item.asc&limit=${PAGE}&offset=${off}`,
                             {}, session.access_token);
        const part = Array.isArray(r) ? r : [];
        all.push(...part);
        if (part.length < PAGE) break;
      }
      setRows(all);
    } catch (e) { setErr(e.message || "Could not load the inventory."); setRows([]); }
  }, [supa, session]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); setLimit({}); };
  const opts = useMemo(() => {
    const m = { fy: new Set(), project: new Map(), supplier: new Set(), plant: new Set(), pc: new Set(), mg: new Set() };
    (rows || []).forEach(r => {
      m.fy.add(r.fiscal_year); m.project.set(r.sap_project_code, r.sap_project_name || r.sap_project_code);
      if (r.supplier_name) m.supplier.add(r.supplier_name); if (r.plant) m.plant.add(r.plant);
      if (r.profit_center) m.pc.add(r.profit_center); if (r.material_group) m.mg.add(r.material_group);
    });
    const s = (x) => [...x].sort((a, b) => String(a).localeCompare(String(b), "en", { numeric: true }));
    return { fy: s(m.fy), project: [...m.project].sort((a, b) => a[1].localeCompare(b[1])), supplier: s(m.supplier), plant: s(m.plant), pc: s(m.pc), mg: s(m.mg) };
  }, [rows]);

  const view = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return (rows || []).filter(r => {
      if (f.fy && r.fiscal_year !== f.fy) return false;
      if (f.project && r.sap_project_code !== f.project) return false;
      if (f.supplier && r.supplier_name !== f.supplier) return false;
      if (f.plant && r.plant !== f.plant) return false;
      if (f.pc && r.profit_center !== f.pc) return false;
      if (f.mg && r.material_group !== f.mg) return false;
      if (f.type === "goods" && r.is_service) return false;
      if (f.type === "services" && !r.is_service) return false;
      if (f.status && r.delivery_status !== f.status) return false;
      if (f.from && (!r.po_date || r.po_date < f.from)) return false;
      if (f.to && (!r.po_date || r.po_date > f.to)) return false;
      if (words.length) {
        const hay = norm(`${r.description} ${r.material} ${r.po_number} ${r.supplier_name} ${r.supplier_code} ${r.sap_project_code} ${r.sap_project_name} ${r.material_group} ${r.profit_center} ${plantName(r.plant)}`);
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }, [rows, f, q]);

  const kpi = useMemo(() => ({
    lines: view.length,
    value: view.reduce((a, r) => a + pkr(r), 0),
    openValue: view.reduce((a, r) => a + (r.currency === "PKR" ? Number(r.open_value || 0) : 0), 0),
    openLines: view.filter(r => r.delivery_status !== "delivered").length,
    projects: new Set(view.map(r => r.sap_project_code)).size,
    suppliers: new Set(view.map(r => r.supplier_name)).size,
    other: view.filter(r => r.currency !== "PKR"),
  }), [view]);

  const sorter = useCallback((a, b) => {
    const k = sort.key, d = sort.dir === "asc" ? 1 : -1;
    const va = k === "total" ? pkr(a) : k === "qty" ? Number(a.qty || 0) : k === "po_date" ? (a.po_date || "") : norm(a[k]);
    const vb = k === "total" ? pkr(b) : k === "qty" ? Number(b.qty || 0) : k === "po_date" ? (b.po_date || "") : norm(b[k]);
    return va < vb ? -d : va > vb ? d : 0;
  }, [sort]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: null, rows: [...view].sort(sorter) }];
    const m = new Map();
    view.forEach(r => {
      const key = groupBy === "project" ? r.sap_project_code : groupBy === "supplier" ? (r.supplier_name || "—") : (r.plant || "—");
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    });
    return [...m].map(([key, rs]) => {
      const first = rs[0];
      return {
        key, rows: rs.sort(sorter), value: rs.reduce((a, r) => a + pkr(r), 0),
        open: rs.filter(r => r.delivery_status !== "delivered").length,
        label: groupBy === "project" ? (first.sap_project_name || key) : groupBy === "plant" ? plantName(key) : key,
        sub: groupBy === "project" ? `${key}${first.fiscal_year ? ` · ${first.fiscal_year}` : ""}` : groupBy === "supplier" ? (first.supplier_code || "") : key !== "—" ? `Plant ${key}` : "",
        projectId: groupBy === "project" ? first.project_id : null,
        pastId: groupBy === "project" ? first.past_project_id : null,
      };
    }).sort((a, b) => b.value - a.value);
  }, [view, groupBy, sorter]);

  const searching = q.trim().length > 0;
  const isOpen = (k) => groupBy === "none" || searching || groups.length === 1 || !!open[k];
  const activeFilters = Object.entries(f).filter(([k, v]) => v && !(k === "type" && v === "goods"));
  const clearAll = () => { setF({ fy: "", project: "", supplier: "", plant: "", pc: "", mg: "", type: "goods", status: "", from: "", to: "" }); setQ(""); setLimit({}); };

  const download = async () => {
    const XLSX = await import("xlsx");
    const head = ["Fiscal year", "SAP project code", "Project name", "PO number", "PO item", "PO date", "PO type", "Supplier code", "Supplier",
      "Material", "Description", "Material group", "Goods / service", "Plant", "Plant name", "Profit centre", "Quantity", "Unit", "Net price",
      "Total", "Currency", "Still to be delivered (qty)", "Still to be delivered (value)", "Still to be invoiced (value)", "Delivery status"];
    const body = [...view].sort((a, b) => a.sap_project_code.localeCompare(b.sap_project_code) || String(a.po_number).localeCompare(String(b.po_number)) || Number(a.po_item) - Number(b.po_item))
      .map(r => [r.fiscal_year, r.sap_project_code, r.sap_project_name, r.po_number, r.po_item, r.po_date, r.po_type, r.supplier_code, r.supplier_name,
        r.material, r.description, r.material_group, r.is_service ? "Service" : "Goods", r.plant, plantName(r.plant), r.profit_center,
        Number(r.qty), r.unit, Number(r.net_price), Number(r.total), r.currency, Number(r.open_qty), Number(r.open_value), Number(r.to_invoice_value),
        STATUS[r.delivery_status]?.label || r.delivery_status]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = head.map((h) => ({ wch: /Description|Project name|Supplier$/.test(h) ? 40 : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `Inventory_${todayPKT()}.xlsx`);
  };

  if (rows === null) return <div style={{ flex: 1, padding: SP.xl, color: T.muted, fontSize: 13 }}>Loading the inventory…</div>;

  const Kpi = ({ icon: Icon, label, value, sub, color }) => (
    <div className="pmo-lift" style={{ flex: "1 1 150px", minWidth: compact ? 0 : 150, padding: "12px 14px", borderRadius: R.lg,
      background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.label, fontSize: 9.5, color: T.dim }}>
        <Icon size={12} color={T.textOf(color)} /> {label}
      </div>
      <div style={{ ...TYPE.display, fontSize: compact ? 19 : 22, color: T.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: T.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
  const chip = (s) => {
    const m = STATUS[s] || { label: s, color: T.muted };
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", ...TYPE.caption, fontWeight: 700, color: T.textOf(m.color) }}>
        <span style={{ width: 7, height: 7, borderRadius: 9, background: m.color, flexShrink: 0 }} />{m.label}
      </span>
    );
  };
  const GRID = "minmax(0,1fr) 92px 110px 118px 150px";
  const Head = () => {
    const h = (key, label, right) => (
      <button className="pmo-focusable pmo-btn" onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...TYPE.label, fontSize: 9.5,
          color: sort.key === key ? T.text : T.dim, textAlign: right ? "right" : "left" }}>
        {label}{sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: SP.sm, padding: "7px 14px", background: T.card2 }}>
        {h("description", "Item")}{h("qty", "Qty", true)}{h("total", "Total (PKR)", true)}{h("po_date", "PO date", true)}
        <span style={{ ...TYPE.label, fontSize: 9.5, color: T.dim }}>Delivery</span>
      </div>
    );
  };
  const Row = ({ r, i }) => {
    const meta = [r.supplier_name, `PO ${r.po_number}/${r.po_item}`, groupBy !== "project" ? (r.sap_project_name ? `${r.sap_project_name} (${r.sap_project_code})` : r.sap_project_code) : null, r.is_service ? "Service" : null]
      .filter(Boolean).join(" · ");
    if (compact) return (
      <button key={r.id} onClick={() => setDetail(r)} className="pmo-focusable" data-inv-row
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i ? `1px solid ${T.border}` : "none",
          padding: "10px 12px", cursor: "pointer", fontFamily: TYPE.body.fontFamily }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4, overflowWrap: "anywhere" }}>{r.description}</div>
        <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2, overflowWrap: "anywhere" }}>{meta}</div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.sm, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{r.currency === "PKR" ? `PKR ${fmt(r.total)}` : `${r.currency} ${fmtQ(r.total)}`}</span>
          <span style={{ ...TYPE.caption, color: T.dim }}>{fmtQ(r.qty)} {r.unit} · {fmtDay(r.po_date)}</span>
          <span style={{ marginLeft: "auto" }}>{chip(r.delivery_status)}</span>
        </div>
      </button>
    );
    return (
      <div key={r.id} role="button" tabIndex={0} data-inv-row onClick={() => setDetail(r)} onKeyDown={e => { if (e.key === "Enter") setDetail(r); }}
        className="pmo-focusable inv-row"
        style={{ display: "grid", gridTemplateColumns: GRID, gap: SP.sm, padding: "8px 14px", alignItems: "center", cursor: "pointer",
          borderTop: i ? `1px solid ${T.border}` : "none", transition: `background ${MOTION.fast}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.description}>{r.description}</div>
          <div style={{ ...TYPE.caption, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={meta}>{meta}</div>
        </div>
        <span style={{ fontSize: 12.5, color: T.textSoft, textAlign: "right", whiteSpace: "nowrap" }}>{fmtQ(r.qty)} {r.unit}</span>
        <span style={{ fontSize: 12.5, color: T.text, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
          {r.currency === "PKR" ? fmt(r.total) : <span title={`${r.currency} ${fmtQ(r.total)}`}>{r.currency} {fmtQ(r.total)}</span>}
        </span>
        <span style={{ fontSize: 12, color: T.muted, textAlign: "right", whiteSpace: "nowrap" }}>{fmtDay(r.po_date)}</span>
        {chip(r.delivery_status)}
      </div>
    );
  };

  const filterBar = (
    <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", alignItems: "center" }}>
      {[
        ["fy", "All years", opts.fy.map(v => [v, v])],
        ["project", "All projects", opts.project.map(([c, n]) => [c, `${n} (${c})`])],
        ["supplier", "All suppliers", opts.supplier.map(v => [v, v])],
        ["plant", "All plants", opts.plant.map(v => [v, `${plantName(v)} (${v})`])],
        ["pc", "All profit centres", opts.pc.map(v => [v, `Profit centre ${v}`])],
        ["mg", "All material groups", opts.mg.map(v => [v, `Material group ${v}`])],
        ["status", "Any delivery", Object.entries(STATUS).map(([k, v]) => [k, v.label])],
      ].map(([k, all, list]) => (
        <Select key={k} T={T} size="sm" value={f[k]} active={!!f[k]} onChange={e => set(k, e.target.value)}
          aria-label={all} style={{ flex: compact ? "1 1 100%" : "0 1 auto", maxWidth: compact ? "100%" : 260, minWidth: 0 }}>
          <option value="">{all}</option>
          {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      ))}
      <Select T={T} size="sm" value={f.type} active={f.type !== "goods"} onChange={e => set("type", e.target.value)} aria-label="Goods or services"
        style={{ flex: compact ? "1 1 100%" : "0 1 auto" }}>
        <option value="goods">Goods only</option>
        <option value="services">Services only</option>
        <option value="all">Goods and services</option>
      </Select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, ...TYPE.caption, color: T.muted, flex: compact ? "1 1 100%" : "0 0 auto" }}>
        PO date
        <input type="date" value={f.from} onChange={e => set("from", e.target.value)} aria-label="PO date from"
          style={{ background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm, color: T.text, padding: "4px 6px", fontSize: 12, colorScheme: T.mode === "dark" ? "dark" : "light" }} />
        to
        <input type="date" value={f.to} onChange={e => set("to", e.target.value)} aria-label="PO date to"
          style={{ background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm, color: T.text, padding: "4px 6px", fontSize: 12, colorScheme: T.mode === "dark" ? "dark" : "light" }} />
      </label>
    </div>
  );

  return (
    // The page scrolls inside its own area, like PMO Review: the portal's content column does not scroll by itself.
    <div className="pmo-scroll" data-inv-scroll style={{ flex: 1, minHeight: 0, overflow: "auto", background: T.page }}>
    <div data-page="inventory" style={{ padding: compact ? SP.md : SP.xl, display: "flex", flexDirection: "column", gap: SP.md }}>
      <style>{`.inv-row:hover{background:${T.surfaceRaised}}`}</style>
      {/* Figures for what is shown */}
      <div style={compact ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm } : { display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
        <Kpi icon={Boxes} label="Items" value={fmt(kpi.lines)} sub={f.type === "goods" ? "goods lines" : f.type === "services" ? "service lines" : "PO lines"} color={BRAND.blueBright} />
        <Kpi icon={PackageCheck} label="Total value" value={`PKR ${fmtM(kpi.value)}`}
          sub={kpi.other.length ? `+ ${kpi.other.map(r => `${r.currency} ${fmtQ(r.total)}`).join(", ")}` : "ordered"} color={DATA.positive} />
        <Kpi icon={Truck} label="Still to be delivered" value={`PKR ${fmtM(kpi.openValue)}`} sub={`${fmt(kpi.openLines)} lines not fully delivered`} color={DATA.warning} />
        <Kpi icon={Building2} label="Projects" value={fmt(kpi.projects)} color={BRAND.gold} />
        <Kpi icon={Users} label="Suppliers" value={fmt(kpi.suppliers)} color="#8B7CF6" />
      </div>

      {/* Search, grouping, filters */}
      <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", alignItems: "center" }}>
        <Input T={T} icon={Search} value={q} onChange={e => { setQ(e.target.value); setLimit({}); }} onClear={() => setQ("")}
          placeholder="Search item, material, PO, supplier or project…" aria-label="Search the inventory"
          style={{ flex: "1 1 280px" }} />
        <Select T={T} size="sm" value={groupBy} active={groupBy !== "none"} onChange={e => setGroupBy(e.target.value)} aria-label="Group by">
          <option value="none">Group by…</option>
          <option value="project">Group by project</option>
          <option value="supplier">Group by supplier</option>
          <option value="plant">Group by plant</option>
        </Select>
        {compact && <Button T={T} size="sm" variant="ghost" onClick={() => setShowFilters(v => !v)}>{showFilters ? "Hide filters" : `Filters${activeFilters.length ? ` (${activeFilters.length})` : ""}`}</Button>}
        <Button T={T} size="sm" variant="ghost" icon={Download} onClick={download} disabled={!view.length}>Download as Excel</Button>
      </div>
      {(!compact || showFilters) && filterBar}
      {(activeFilters.length > 0 || searching || groupBy !== "none") && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {groupBy !== "none" && (
            <button data-inv-group-chip onClick={() => setGroupBy("none")} className="pmo-focusable pmo-btn" title="Show the list without grouping"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: R.pill, cursor: "pointer",
                background: `${BRAND.gold}1f`, border: `1px solid ${BRAND.gold}66`, color: T.textOf(BRAND.gold), ...TYPE.caption, fontWeight: 700 }}>
              {GROUPS[groupBy]} <X size={11} />
            </button>
          )}
          {activeFilters.map(([k, v]) => (
            <button key={k} onClick={() => set(k, k === "type" ? "goods" : "")} className="pmo-focusable pmo-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: R.pill, cursor: "pointer",
                background: `${BRAND.blueBright}1a`, border: `1px solid ${BRAND.blueBright}55`, color: T.textOf(BRAND.blueBright), ...TYPE.caption, fontWeight: 700 }}>
              {k === "plant" ? plantName(v) : k === "status" ? STATUS[v]?.label : k === "type" ? (v === "all" ? "Goods and services" : "Services only")
                : k === "pc" ? `Profit centre ${v}` : k === "mg" ? `Material group ${v}` : k === "from" ? `From ${fmtDay(v)}` : k === "to" ? `To ${fmtDay(v)}`
                : k === "project" ? (opts.project.find(p => p[0] === v)?.[1] || v) : v} <X size={11} />
            </button>
          ))}
          {(activeFilters.length > 0 || searching) && (
            <button onClick={clearAll} className="pmo-focusable pmo-btn" title="Clear the search and filters (the grouping stays)"
              style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, ...TYPE.caption }}>Clear filters</button>
          )}
        </div>
      )}
      {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

      {/* The list */}
      {view.length === 0 ? (
        <div style={{ padding: SP.xl, textAlign: "center", borderRadius: R.md, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 13 }}>
          {rows.length ? "Nothing matches the search and filters." : "No inventory loaded yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
          {groups.map(g => {
            const exp = isOpen(g.key);
            const shown = limit[g.key] || SHOW;
            return (
              <div key={g.key} data-inv-group={g.key} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", background: T.surface }}>
                {g.label != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: compact ? "9px 12px" : "10px 14px",
                    background: exp ? T.card2 : "transparent", cursor: "pointer" }}
                    onClick={() => setOpen(o => ({ ...o, [g.key]: !exp }))}>
                    {exp ? <ChevronDown size={15} color={T.muted} /> : <ChevronRight size={15} color={T.muted} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                        {g.label}
                        {(g.projectId || g.pastId) && (
                          <button className="pmo-focusable pmo-btn" title={g.projectId ? "Open the project" : "Open on Past Projects"}
                            onClick={e => { e.stopPropagation(); g.projectId ? onOpenProject?.(g.projectId) : onOpenPast?.(g.pastId); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: T.textOf(BRAND.blueBright), padding: "0 0 0 6px", verticalAlign: "middle" }}>
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                      <div style={{ ...TYPE.caption, color: T.muted }}>{[g.sub, `${fmt(g.rows.length)} lines`, g.open ? `${fmt(g.open)} not fully delivered` : "all delivered"].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>PKR {fmt(g.value)}</div>
                  </div>
                )}
                {exp && (
                  <div>
                    {!compact && Head()}
                    {g.rows.slice(0, shown).map((r, i) => Row({ r, i }))}
                    {g.rows.length > shown && (
                      <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.border}` }}>
                        <Button T={T} size="sm" variant="ghost" onClick={() => setLimit(l => ({ ...l, [g.key]: shown + SHOW * 2 }))}>
                          Show more ({fmt(g.rows.length - shown)} left)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ ...TYPE.caption, color: T.dim }}>
        Source: SAP ME2J (purchase orders by project). Lines deleted in SAP are left out. Delivery status from SAP's "still to be delivered".
      </div>

      {detail && <InventoryDetail T={T} session={session} supa={supa} row={detail} isMobile={compact} onClose={() => setDetail(null)}
        onOpenProject={(id) => { setDetail(null); onOpenProject?.(id); }} onOpenPast={(id) => { setDetail(null); onOpenPast?.(id); }} />}
    </div>
    </div>
  );
}

function InventoryDetail({ T, session, supa, row: r, isMobile, onClose, onOpenProject, onOpenPast }) {
  const [raw, setRaw] = useState(null);
  useEffect(() => {
    let live = true;
    supa(`/rest/v1/inventory_items?id=eq.${r.id}&select=raw,source,imported_at`, {}, session.access_token)
      .then(x => { if (live) setRaw(Array.isArray(x) ? x[0] : null); }).catch(() => {});
    return () => { live = false; };
  }, [r.id, supa, session]);
  const line = (label, value) => (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "180px minmax(0,1fr)", gap: isMobile ? 0 : SP.sm, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ ...TYPE.caption, color: T.muted }}>{label}</span>
      <span style={{ fontSize: 13, color: T.text, overflowWrap: "anywhere" }}>{value ?? "—"}</span>
    </div>
  );
  const st = STATUS[r.delivery_status];
  return (
    <Modal T={T} title={r.description} sub={`PO ${r.po_number} / item ${r.po_item}`} icon={r.is_service ? Wrench : Boxes} onClose={onClose} isMobile={isMobile} width={640}
      footer={<Button T={T} variant="ghost" onClick={onClose}>Close</Button>}>
      <div>
        {line("Project", <span>{r.sap_project_name || "—"} <span style={{ color: T.muted }}>({r.sap_project_code} · {r.fiscal_year})</span>
          {(r.project_id || r.past_project_id) && (
            <button className="pmo-focusable pmo-btn" onClick={() => r.project_id ? onOpenProject(r.project_id) : onOpenPast(r.past_project_id)}
              style={{ background: "none", border: "none", color: T.textOf(BRAND.blueBright), cursor: "pointer", padding: "0 0 0 6px", fontSize: 12.5 }}>
              Open {r.project_id ? "project" : "on Past Projects"} <ExternalLink size={11} style={{ verticalAlign: "-1px" }} />
            </button>
          )}</span>)}
        {line("Supplier", r.supplier_name ? `${r.supplier_name}${r.supplier_code ? ` (${r.supplier_code})` : ""}` : null)}
        {line("PO date", fmtDay(r.po_date))}
        {line("PO type", r.po_type)}
        {line("Material", r.material)}
        {line("Material group", r.material_group)}
        {line("Goods / service", r.is_service ? "Service" : "Goods")}
        {line("Plant", r.plant ? `${plantName(r.plant)} (${r.plant})` : null)}
        {line("Profit centre", r.profit_center)}
        {line("Quantity", `${fmtQ(r.qty)} ${r.unit || ""}`)}
        {line("Net price", `${r.currency} ${fmtQ(r.net_price)}`)}
        {line("Total", <b>{r.currency} {fmtQ(r.total)}</b>)}
        {line("Delivery", <span style={{ color: T.textOf(st?.color || T.muted), fontWeight: 700 }}>{st?.label || r.delivery_status}</span>)}
        {line("Still to be delivered", `${fmtQ(r.open_qty)} ${r.unit || ""} · ${r.currency} ${fmtQ(r.open_value)}`)}
        {line("Still to be invoiced", `${r.currency} ${fmtQ(r.to_invoice_value)}`)}
      </div>
      <div style={{ marginTop: SP.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...TYPE.label, fontSize: 9.5, color: T.dim, marginBottom: 4 }}>
          <FileText size={11} /> SAP row as exported{raw?.source ? ` · ${raw.source}` : ""}
        </div>
        {!raw ? <div style={{ ...TYPE.caption, color: T.muted }}>Loading…</div> : (
          <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: R.md, padding: "4px 10px" }}>
            {Object.entries(raw.raw || {}).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: SP.sm, padding: "3px 0", fontSize: 12, borderBottom: `1px solid ${T.border}` }}>
                <span style={{ flex: "0 0 45%", color: T.muted }}>{k}</span><span style={{ color: T.textSoft, overflowWrap: "anywhere", minWidth: 0 }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
