// Portfolio demo: the rest of the fictional data (added in stage 2), for the pages that were empty:
// itemised payments, inventory (purchase-order lines), to-dos, lessons learned, benefits, the e-mail /
// push log, and the PMO-only inventory setting. Everything is invented and derived from the tables
// gen.mjs already made, with a fixed random seed, so every run gives the same file.
export function extraTables(t, { NOW, uid }) {
  let s = 20261015;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day = (d) => new Date(String(d).slice(0, 10) + "T00:00:00Z").getTime();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const between = (a, b) => iso(day(a) + Math.floor(rnd() * Math.max(1, (day(b) - day(a)) / 864e5)) * 864e5);
  const TODAY = NOW.slice(0, 10);
  const PMO = t.user_profiles.find((u) => u.role === "pmo");
  const byId = (id) => t.projects.find((p) => p.id === id);
  const story = t.projects.find((p) => p.code === "ET.272010-05");
  const pmOf = (pid) => t.user_profiles.find((u) => u.id === t.project_assignments.find((a) => a.project_id === pid)?.user_id);

  for (const p of t.projects) p.pcr = false;
  // The demo has its own guided tour: the portal's tour invite card is not offered at sign-in.
  for (const u of t.user_profiles) { u.tutorial_offered_at ||= "2026-07-05T06:00:00Z"; u.tutorial_dismissed_at ||= "2026-07-05T06:00:10Z"; }

  /* ── Itemised payments: each project's payments_made, split into payments that add up exactly ── */
  const VENDORS = ["Northwind Builders", "Apex Engineering Services", "Bluegate Technologies", "Crescent Medical Supplies", "Harbour Furniture Co.",
    "Summit Electrical Works", "Clearview AV Solutions", "Greenfield Solar Systems", "Meridian Lab Equipment", "Silverline Networks", "Oakridge Interiors", "Pinnacle Safety Systems"];
  const project_payments = [];
  for (const p of t.projects.filter((x) => x.payments_made > 0)) {
    const n = p.payments_made > 10e6 ? 4 : p.payments_made > 4e6 ? 3 : 2;
    const parts = Array.from({ length: n }, () => 0.5 + rnd());
    const tot = parts.reduce((a, b) => a + b, 0);
    let left = p.payments_made;
    const from = p.budget_release_date || p.actual_start_date || "2026-08-01";
    const dates = Array.from({ length: n }, () => between(from, TODAY)).sort();
    const vendor = pick(VENDORS);
    parts.forEach((w, i) => {
      const gross = i === n - 1 ? left : Math.round((p.payments_made * w / tot) / 1000) * 1000;
      left -= gross;
      const tax = Math.round(gross * (p.portfolio === "investment" ? 0.03 : 0.055) * 100) / 100;
      project_payments.push({ id: uid("9a7e0001"), project_id: p.id, paid_on: dates[i], dept: p.campus || "Central Office",
        payee: i === n - 1 && n > 2 ? pick(VENDORS) : vendor, particulars: `${["Advance", "Running bill", "Running bill", "Final bill"][Math.min(i, 3)]} ${i + 1} against PO, ${p.name}`,
        gross, tax, net: Math.round((gross - tax) * 100) / 100, source: `FY 2026-27 payment record, row ${120 + project_payments.length}`,
        created_by: PMO.id, created_at: `${dates[i]}T09:00:00Z`, updated_at: `${dates[i]}T09:00:00Z` });
    });
  }

  /* ── Inventory: purchase-order lines for projects with money released (this year and last) ── */
  const SUPPLIERS = VENDORS.map((name, i) => [`10${String(4100 + i * 37)}`, name]);
  const GOODS = [["Workstation desk, 1400 mm", "NOS", 38000, "Furniture"], ["Ergonomic task chair", "NOS", 21500, "Furniture"], ["LED panel light 60x60", "NOS", 6200, "Electrical"],
    ["Split air conditioner 2 ton", "NOS", 265000, "HVAC"], ["Network switch 48-port", "NOS", 410000, "IT Hardware"], ["Laptop, 16 GB / 512 GB", "NOS", 285000, "IT Hardware"],
    ["Interactive display 75 inch", "NOS", 690000, "AV Equipment"], ["Ceiling speaker set", "SET", 54000, "AV Equipment"], ["Fire extinguisher 6 kg", "NOS", 14500, "Safety"],
    ["CCTV dome camera", "NOS", 32000, "Security"], ["Steel storage rack", "NOS", 46000, "Furniture"], ["UPS 10 kVA", "NOS", 520000, "Electrical"],
    ["Patient monitor, 5-parameter", "NOS", 980000, "Medical Equipment"], ["Examination couch", "NOS", 88000, "Medical Equipment"], ["Solar panel 550 W", "NOS", 41000, "Electrical"]];
  const SERVICES = [["Installation and commissioning", "JOB", 0.06], ["Civil works, first running bill", "JOB", 0.22], ["Electrical wiring and conduits", "JOB", 0.09], ["Painting and finishing", "JOB", 0.05]];
  const pcOf = (code) => (/^[A-Z]+\.\d{2}(\d{4})-/.exec(code) || [])[1];
  const inventory_items = [];
  let po = 4500102000;
  const addPo = (code, name, projectId, pastId, fy, budget, progress, from, delivered) => {
    const lines = 3 + Math.floor(rnd() * 6);
    let spent = 0;
    for (let l = 0; l < lines && spent < budget * 0.85; l += 1) {
      po += 1 + Math.floor(rnd() * 40);
      const date = between(from, fy === "FY 25-26" ? "2026-06-20" : TODAY);
      const sup = pick(SUPPLIERS);
      const items = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < items; k++) {
        const svc = rnd() < 0.18;
        let desc, unit, price, qty, group;
        if (svc) { const [d, u, f] = pick(SERVICES); desc = d; unit = u; qty = 1; price = Math.max(150000, Math.round(budget * f / 1000) * 1000); group = "Services"; }
        else { const [d, u, pr, g] = pick(GOODS); desc = d; unit = u; price = pr; qty = Math.max(1, Math.min(60, Math.round((budget * 0.12) / pr))); group = g; }
        const total = qty * price;
        spent += total;
        const state = delivered ? "d" : rnd() < progress ? "d" : rnd() < 0.35 ? "p" : "n";
        const openQty = state === "d" ? 0 : state === "p" ? Math.max(1, Math.floor(qty / 2)) : qty;
        const plant = pick(["1100", "1200", "2100"]);
        const store = `${plant.slice(0, 2)}0${1 + Math.floor(rnd() * 4)}`;
        inventory_items.push({ id: uid("1a7e0001"), po_number: String(po), po_item: String((k + 1) * 10), fiscal_year: fy, sap_project_code: code, sap_project_name: name,
          sap_network: `50${String(10000 + inventory_items.length * 7).slice(-5)}`, project_id: projectId, past_project_id: pastId, po_date: date,
          po_type: svc ? "ZSRV" : pick(["ZPRJ", "ZLOC"]), purchasing_group: pick(["P01", "P02", "P05"]), supplier_code: sup[0], supplier_name: sup[1],
          material: svc ? null : `MAT-${String(100000 + Math.floor(rnd() * 899999))}`, description: desc, material_group: group, is_service: svc, plant,
          profit_center: store, qty, unit, net_price: price, total, currency: "PKR", open_qty: openQty, open_value: openQty * price,
          to_invoice_qty: state === "d" ? 0 : openQty, to_invoice_value: state === "d" ? 0 : openQty * price,
          delivery_status: openQty <= 0 ? "delivered" : openQty < qty ? "partly" : "not_delivered", sap_deleted: false, not_in_sheet_since: null,
          raw: { "Purchasing Document": String(po), Item: String((k + 1) * 10), "Document Date": date, Supplier: `${sup[0]} ${sup[1]}`, "Short Text": desc,
            "PO Quantity": qty, "Order Unit": unit, "Net Price": price, Plant: plant, "Storage location": store, "WBS Element": code },
          source: `ME2J_demo.xlsx, row ${inventory_items.length + 2}`, imported_at: "2026-10-12T08:00:00Z", updated_at: "2026-10-12T08:00:00Z" });
      }
    }
  };
  for (const p of t.projects.filter((x) => x.portfolio === "capex" && x.amount_released > 0))
    addPo(p.code, p.name, p.id, null, "FY 26-27", p.amount_released, (p.pct_complete || 0) / 100, p.budget_release_date || "2026-08-01", p.workflow_stage === "closed");
  for (const p of t.past_projects.filter((x) => x.fiscal_year === "FY 25-26"))
    addPo(p.code, p.name, null, p.id, "FY 25-26", p.released_amount || p.approved_amount || 3e6, 0.85, p.budget_release_date || "2025-08-01", p.status === "closed");
  const pcs = {}, siteOrder = [...new Set(t.campuses.map((c) => c.name))];
  for (const r of inventory_items) {
    const pc = pcOf(r.sap_project_code);
    if (pc && !pcs[pc]) {
      const proj = byId(r.project_id) || t.past_projects.find((x) => x.id === r.past_project_id);
      const cc = proj?.cost_center_id ? t.cost_centers.find((c) => c.id === proj.cost_center_id)?.name.replace(/ \(Code:\d+\)$/, "") : null;
      pcs[pc] = { name: cc || proj?.campus || "Central Office", site: proj?.campus || "Central Office" };
    }
  }
  t.settings.push({ key: "inventory_profit_centres", value: { sites: siteOrder, profit_centres: pcs, stores: {} } });

  /* ── PMO to-do lists ── */
  const todo = (p, title, due, done, created) => ({ id: uid("70d00001"), project_id: p.id, title, due_date: due, done, done_at: done ? `${due}T10:00:00Z` : null,
    removed: false, created_by: PMO.id, created_at: `${created}T06:00:00Z`, updated_at: `${done ? due : created}T10:00:00Z` });
  const approved = t.projects.filter((p) => p.portfolio === "capex" && p.workflow_stage === "approved");
  const project_todos = [
    todo(story, "Confirm simulator delivery date with the vendor", "2026-10-20", false, "2026-10-08"),
    todo(story, "Collect warranty certificates for the patient simulators", "2026-11-05", false, "2026-10-10"),
    todo(story, "Site visit after medical gas works", "2026-10-09", true, "2026-09-30"),
    todo(story, "Share revised floor plan with Facilities", "2026-09-25", true, "2026-09-18"),
    ...approved.filter((p) => p.id !== story.id).slice(0, 5).flatMap((p, i) => [
      todo(p, pick(["Chase the second running bill", "Ask the manager for an updated WBS", "Check the delivery note against the PO", "Book the handover inspection"]), between("2026-10-10", "2026-11-20"), i % 3 === 0, "2026-10-01")]),
  ];

  /* ── Lessons learned and benefits realised (closed and well-advanced projects) ── */
  const closed = t.projects.filter((p) => p.workflow_stage === "closed");
  const done = [...closed, ...approved.filter((p) => p.pct_complete >= 60)].slice(0, 6);
  const L = (p, title, category, phase, happened, well, wrong, rec, at) => ({ id: uid("1e550001"), project_id: p.id, title, category, phase, what_happened: happened,
    what_went_well: well, what_went_wrong: wrong, recommendation: rec, logged_by_name: PMO.username, created_at: `${at}T07:30:00Z`, updated_at: `${at}T07:30:00Z` });
  const lessons_learned = [
    L(done[0], "Order long-lead items at approval, not at site handover", "schedule", "planning", "Imported equipment took 11 weeks to arrive; civil works finished first and the room sat empty.",
      "Civil works finished on time.", "Equipment was ordered only after the room was ready.", "Raise purchase orders for long-lead items in the week the budget is released.", "2026-09-22"),
    L(done[1] || done[0], "Get three quotations before the proposal, not after", "vendor", "planning", "The proposal used one indicative quote; the final price was 14% higher.",
      "Finance approved the difference quickly.", "The budget had to be revised mid-project.", "Attach at least two comparable quotations to every proposal.", "2026-09-10"),
    L(done[2] || done[0], "Weekly photo updates kept everyone aligned", "communication", "execution", "The manager posted site photos every Friday.",
      "Fewer status meetings; issues were spotted early.", "—", "Ask every manager for weekly photos on active sites.", "2026-10-02"),
    L(done[3] || done[0], "Plan works around the exam calendar", "stakeholder", "execution", "Noise from works overlapped with mid-term exams for one week.",
      "The contractor moved to night shifts at short notice.", "The exam calendar was not checked when planning.", "Check the academic calendar before fixing site dates.", "2026-08-28"),
    L(closed[0] || done[0], "Close the project file within a month of handover", "process", "closing", "The completion documents were collected four months after handover.",
      "All documents were eventually found.", "Vendor contacts had changed by then.", "Collect the completion certificate and warranties at handover.", "2026-09-05"),
  ];
  const B = (p, title, category, status, description, measure, value, on, at) => ({ id: uid("be7e0001"), project_id: p.id, title, category, status, description, measure,
    value_pkr: value, realized_on: on, logged_by_name: PMO.username, created_at: `${at}T08:00:00Z`, updated_at: `${at}T08:00:00Z` });
  const benefits_realized = [
    B(closed[0] || done[0], "Faster student queries at the kiosk", "time_saving", "realized", "Average wait at the help desk fell after the kiosks opened.", "Average wait: 18 min → 6 min", null, "2026-09-01", "2026-09-15"),
    B(t.projects.find((p) => /Solar/.test(p.name)) || done[0], "Lower electricity bills", "cost_saving", "partial", "The first half of the panels is producing.", "Grid units down 21% in September", 640000, "2026-09-30", "2026-10-05"),
    B(story, "More practice hours for students", "capacity", "expected", "Two more simulator bays once the lab opens.", "Practice slots per week: 40 → 72", null, null, "2026-10-08"),
    B(t.projects.find((p) => /Network/.test(p.name)) || done[0], "Fewer network outages", "quality", "realized", "The new core switches removed the main single point of failure.", "Outages per month: 5 → 0", null, "2026-10-01", "2026-10-06"),
  ].filter((x) => x.project_id);

  /* ── E-mail and push log (what the portal sent) ── */
  const notifications_log = [];
  const N = (channel, to, code, detail, at) => notifications_log.push({ id: 7000 + notifications_log.length, channel, status: "sent", recipient_id: to?.id ?? null,
    recipient_address: to ? `${to.username}@university.example` : null, project_code: code, detail, created_at: at });
  for (const d of ["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) N("email-digest", PMO, null, "Weekday deadline digest", `${d}T04:00:00Z`);
  for (const c of t.comments.filter((x) => x.author_role === "pmo").slice(0, 6)) { const p = byId(c.project_id), m = pmOf(c.project_id); if (m) N("email", m, p?.code, `Update on ${p?.name}`, c.created_at); }
  N("epdd-push", PMO, null, "New proposal PDD-2027-024", "2026-10-14T11:26:00Z");
  N("epdd-email", PMO, null, "New proposal PDD-2027-024", "2026-10-14T11:26:30Z");
  notifications_log.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { project_payments, inventory_items, project_todos, lessons_learned, benefits_realized, notifications_log, project_pcrs: [], snapshots: [], epdd_sync_runs: [
    { id: 1, started_at: "2026-10-15T05:25:00Z", finished_at: "2026-10-15T05:25:06Z", trigger: "cron", ok: true, listed: 12, new_count: 0, updated_count: 0, details_read: 0, files_stored: 0, files_failed: 0, error: null }] };
}
