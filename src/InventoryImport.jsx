import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { TYPE, SP, R, BRAND, DATA } from "./theme.js";
import { Button, Modal } from "./ui.jsx";
import { readMe2j, planImport, COMPARE } from "./inventoryImport.js";

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORT SAP SHEET (PMO, 29 Oct 2026)

   The PMO picks an ME2J export; it is read in the browser (nothing is sent until Import), compared with the
   portal and shown as a preview. Import adds new lines, updates changed ones (key PO number + item), marks
   lines SAP has deleted, and marks lines of the sheet's fiscal years that the sheet no longer has as
   "Not in latest SAP sheet": they are kept, out of the totals (PMO decision), and come back if a later sheet
   has them. One summary line goes to the Activity Log. RLS: inventory_items is PMO only.
   ═══════════════════════════════════════════════════════════════════════════ */

const BATCH = 200;
const SHARE_WARN = 0.2;     // a sheet that would mark ≥ 20% of a year's lines as missing asks for a tick first
const LIST = 40;            // lines listed per section before "and N more"
const EXISTING_COLS = "id,po_number,po_item,sap_deleted,not_in_sheet_since," + Object.keys(COMPARE).join(",");
const fmt = (n) => Number(n || 0).toLocaleString("en", { maximumFractionDigits: 0 });
const fmtV = (f, v) => v === null || v === undefined || v === "" ? "—"
  : f === "is_service" ? (v ? "Service" : "Goods") : typeof v === "number" ? Number(v).toLocaleString("en", { maximumFractionDigits: 3 }) : String(v);

export function InventoryImport({ T, session, supa, map, isMobile, onClose, onDone }) {
  const [step, setStep] = useState("pick");     // pick → reading → preview → saving → done
  const [err, setErr] = useState(null);
  const [file, setFile] = useState(null);
  const [read, setRead] = useState(null);
  const [plan, setPlan] = useState(null);
  const [sure, setSure] = useState(false);
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState(null);
  const [openSec, setOpenSec] = useState({});
  const input = useRef(null);
  const tok = session.access_token;

  const pick = async (f) => {
    if (!f) return;
    setErr(null); setFile(f); setStep("reading");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
      const rd = readMe2j(rows, f.name);
      if (rd.error) throw new Error(rd.error);
      if (!rd.lines.length && !rd.deletedKeys.size) throw new Error("The sheet has no purchase-order lines with an SAP project ID.");
      // What the portal holds now, plus the project codes to link lines to the portal.
      const existing = [];
      for (let off = 0; ; off += 1000) {
        const part = await supa(`/rest/v1/inventory_items?select=${EXISTING_COLS}&order=id&limit=1000&offset=${off}`, {}, tok);
        existing.push(...(Array.isArray(part) ? part : []));
        if (!Array.isArray(part) || part.length < 1000) break;
      }
      const [projects, past] = await Promise.all([
        supa("/rest/v1/projects?select=id,code", {}, tok).catch(() => []),
        supa("/rest/v1/past_projects?select=id,code", {}, tok).catch(() => []),
      ]);
      setRead(rd); setPlan(planImport(rd, existing, projects || [], past || [])); setSure(false); setStep("preview");
    } catch (e) { setErr(e.message || "Could not read the sheet."); setStep("pick"); }
  };

  // Profit centres the setting does not know yet (their lines read "Not assigned" until the PMO says where they belong).
  const unknownPcs = (() => {
    if (!read) return [];
    const pcs = map?.profit_centres || {}, stores = map?.stores || {}, m = new Map();
    read.lines.forEach(l => {
      const pc = (/^[A-Z]+\.\d{2}(\d{4})-/.exec(l.sap_project_code) || [])[1];
      if (!pc || pcs[pc] || stores[l.profit_center]) return;
      m.set(pc, (m.get(pc) || 0) + 1);
    });
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  const unlinked = plan ? new Set(plan.add.filter(r => !r.project_id && !r.past_project_id).map(r => r.sap_project_code)).size : 0;
  const risky = plan ? plan.missingShare.filter(s => s.missing && s.share >= SHARE_WARN) : [];
  const nothing = plan && !plan.add.length && !plan.update.length && !plan.markDeleted.length && !plan.markMissing.length;

  const save = async () => {
    setStep("saving"); setPct(2); setErr(null);
    const now = new Date().toISOString();
    const upserts = [...plan.add, ...plan.update.map(u => u.row)];
    const jobs = [];
    for (let i = 0; i < upserts.length; i += BATCH) jobs.push({ kind: "upsert", rows: upserts.slice(i, i + BATCH) });
    for (let i = 0; i < plan.markDeleted.length; i += 100) jobs.push({ kind: "patch", ids: plan.markDeleted.slice(i, i + 100).map(r => r.id), body: { sap_deleted: true, not_in_sheet_since: null } });
    for (let i = 0; i < plan.markMissing.length; i += 100) jobs.push({ kind: "patch", ids: plan.markMissing.slice(i, i + 100).map(r => r.id), body: { not_in_sheet_since: now } });
    let done = 0;
    try {
      for (const j of jobs) {
        if (j.kind === "upsert") {
          await supa("/rest/v1/inventory_items?on_conflict=po_number,po_item", { method: "POST", body: JSON.stringify(j.rows),
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" } }, tok);
        } else {
          await supa(`/rest/v1/inventory_items?id=in.(${j.ids.join(",")})`, { method: "PATCH", body: JSON.stringify(j.body),
            headers: { Prefer: "return=minimal" } }, tok);
        }
        done++; setPct(Math.round(2 + 93 * done / jobs.length));
      }
      const res = { added: plan.add.length, updated: plan.update.length, deleted: plan.markDeleted.length, missing: plan.markMissing.length };
      await supa("/rest/v1/activity_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        actor_id: session.user_id, actor_name: session.full_name || session.username, actor_role: session.role,
        action: "import", entity_type: "inventory_items", entity_id: null,
        summary: `Inventory import from ${file.name} (${read.fiscalYears.join(", ")}): ${res.added} new, ${res.updated} updated, ${res.deleted} deleted in SAP, ${res.missing} not in the sheet`,
        details: { ...res, unchanged: plan.unchanged, left_out: plan.leftOut, fiscal_years: read.fiscalYears, filename: file.name },
      }) }, tok).catch(() => {});
      setPct(100); setResult(res); setStep("done"); onDone?.();
    } catch (e) {
      setErr(`${e.message || "The import stopped."} ${done ? `${done} of ${jobs.length} steps were saved; picking the same sheet again finishes the rest.` : "Nothing was saved."}`);
      setStep("preview"); onDone?.();
    }
  };

  const Tile = ({ label, value, color, sub }) => (
    <div style={{ flex: "1 1 120px", minWidth: 0, padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.card2 }}>
      <div style={{ ...TYPE.label, fontSize: 9.5, color: T.dim }}>{label}</div>
      <div style={{ ...TYPE.display, fontSize: 20, color: value ? T.textOf(color) : T.muted, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</div>
      {sub && <div style={{ ...TYPE.caption, color: T.muted }}>{sub}</div>}
    </div>
  );
  const Section = ({ id, title, color, items, render }) => !items.length ? null : (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md, overflow: "hidden" }}>
      <button className="pmo-focusable pmo-btn" onClick={() => setOpenSec(o => ({ ...o, [id]: !o[id] }))}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 12px", background: T.card2, border: "none", cursor: "pointer",
          color: T.text, fontSize: 12.5, fontWeight: 700, textAlign: "left", fontFamily: TYPE.body.fontFamily }}>
        {openSec[id] ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
        <span style={{ width: 8, height: 8, borderRadius: 9, background: color, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{title}</span><span style={{ color: T.muted, fontWeight: 600 }}>{fmt(items.length)}</span>
      </button>
      {openSec[id] && (
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {items.slice(0, LIST).map((x, i) => (
            <div key={i} style={{ padding: "6px 12px", borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.textSoft, overflowWrap: "anywhere" }}>{render(x)}</div>
          ))}
          {items.length > LIST && <div style={{ padding: "6px 12px", borderTop: `1px solid ${T.border}`, ...TYPE.caption, color: T.muted }}>and {fmt(items.length - LIST)} more</div>}
        </div>
      )}
    </div>
  );
  const lineLabel = (r) => <><b style={{ color: T.text }}>{r.description}</b> <span style={{ color: T.muted }}>· PO {r.po_number}/{r.po_item} · {r.sap_project_code}{r.total != null ? ` · ${r.currency || "PKR"} ${fmt(r.total)}` : ""}</span></>;

  const footer = step === "preview" ? (
    <>
      <Button T={T} variant="ghost" onClick={() => { setStep("pick"); setPlan(null); setRead(null); }}>Choose another sheet</Button>
      <Button T={T} variant="primary" icon={Upload} disabled={nothing || (risky.length > 0 && !sure)} onClick={save}>
        {nothing ? "Nothing to import" : "Import"}
      </Button>
    </>
  ) : step === "done" ? <Button T={T} variant="primary" onClick={onClose}>Done</Button>
    : <Button T={T} variant="ghost" onClick={onClose} disabled={step === "saving"}>Cancel</Button>;

  return (
    <Modal T={T} title="Import SAP sheet" sub="SAP ME2J export (purchase orders by project), .xlsx" icon={FileSpreadsheet}
      onClose={step === "saving" ? () => {} : onClose} isMobile={isMobile} width={720} footer={footer}>
      <div data-inv-import style={{ display: "flex", flexDirection: "column", gap: SP.md, fontFamily: TYPE.body.fontFamily }}>
        {err && (
          <div role="alert" style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: R.md, background: `${DATA.danger}14`, border: `1px solid ${DATA.danger}55`,
            color: T.textOf(DATA.danger), fontSize: 12.5, lineHeight: 1.5 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{err}</span>
          </div>
        )}

        {(step === "pick" || step === "reading") && (
          <>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>
              Export ME2J from SAP as an Excel file and choose it here. The portal reads it on this computer and shows what would change; nothing is saved until you press <b>Import</b>.
              Lines are matched by PO number and item, and the fiscal year comes from each line's SAP project ID (…<b>27</b>… = FY 26-27).
            </div>
            <input ref={input} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: "none" }} onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="SAP sheet" />
            <button className="pmo-focusable pmo-btn" disabled={step === "reading"} onClick={() => input.current?.click()}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "28px 16px", borderRadius: R.lg, cursor: step === "reading" ? "wait" : "pointer",
                border: `1.5px dashed ${T.borderStrong}`, background: T.card2, color: T.text, fontFamily: TYPE.body.fontFamily }}>
              <Upload size={22} color={T.textOf(BRAND.blueBright)} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{step === "reading" ? `Reading ${file?.name || "the sheet"}…` : "Choose the ME2J sheet"}</span>
              <span style={{ ...TYPE.caption, color: T.muted }}>{step === "reading" ? "Comparing it with the portal" : "or drop it here"}</span>
            </button>
          </>
        )}

        {(step === "preview" || step === "saving") && plan && (
          <>
            <div style={{ fontSize: 13, color: T.textSoft }}>
              <b style={{ color: T.text }}>{file?.name}</b> · {read.fiscalYears.join(", ")} · {fmt(read.lines.length)} active lines
              {read.deletedKeys.size ? ` · ${fmt(read.deletedKeys.size)} deleted in SAP` : ""}
            </div>
            <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
              <Tile label="New" value={plan.add.length} color={DATA.positive} sub="will be added" />
              <Tile label="Updated" value={plan.update.length} color={BRAND.blueBright} sub="figures or text changed" />
              <Tile label="Unchanged" value={plan.unchanged} color={T.muted} />
              <Tile label="Deleted in SAP" value={plan.markDeleted.length} color={DATA.danger} sub="will be marked" />
              <Tile label="Not in this sheet" value={plan.markMissing.length} color={DATA.warning} sub="kept, marked" />
            </div>
            {risky.map(s => (
              <div key={s.fy} style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: R.md, background: `${DATA.warning}14`, border: `1px solid ${DATA.warning}66`, fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>
                <AlertTriangle size={15} color={T.textOf(DATA.warning)} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>This sheet does not have {fmt(s.missing)} of the {fmt(s.active)} {s.fy} lines in the portal ({Math.round(s.share * 100)}%). If the export was cut short, choose the complete sheet instead.</span>
              </div>
            ))}
            {risky.length > 0 && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: T.text, cursor: "pointer" }}>
                <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} style={{ marginTop: 2 }} />
                This is the complete ME2J export; mark those lines “Not in latest SAP sheet”.
              </label>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
              <Section id="add" title="New lines" color={DATA.positive} items={plan.add} render={lineLabel} />
              <Section id="upd" title="Updated lines" color={BRAND.blueBright} items={plan.update} render={u => (
                <>{lineLabel(u.row)}<div style={{ color: T.muted, marginTop: 2 }}>
                  {u.back && <span style={{ color: T.textOf(DATA.positive), fontWeight: 700 }}>{u.back === "deleted" ? "Back from deleted in SAP. " : "Back in the SAP sheet. "}</span>}
                  {u.changes.map(c => `${COMPARE[c.field]}: ${fmtV(c.field, c.from)} → ${fmtV(c.field, c.to)}`).join(" · ")}
                </div></>
              )} />
              <Section id="del" title="Deleted in SAP (marked, out of the totals)" color={DATA.danger} items={plan.markDeleted} render={lineLabel} />
              <Section id="miss" title="Not in this sheet (kept, marked “Not in latest SAP sheet”, out of the totals)" color={DATA.warning} items={plan.markMissing} render={lineLabel} />
              <Section id="pc" title="Profit centres the portal does not know yet (their lines show “Not assigned” until you say where they belong)" color={T.muted}
                items={unknownPcs} render={([pc, n]) => <>Profit centre <b style={{ color: T.text }}>{pc}</b> · {fmt(n)} lines</>} />
            </div>
            <div style={{ ...TYPE.caption, color: T.muted, lineHeight: 1.6 }}>
              {[plan.leftOut ? `${fmt(plan.leftOut)} lines deleted in SAP and never loaded are left out` : null,
                plan.stillMissing ? `${fmt(plan.stillMissing)} lines stay marked “Not in latest SAP sheet”` : null,
                read.skipped.noCode ? `${fmt(read.skipped.noCode)} lines without an SAP project ID are skipped` : null,
                read.skipped.duplicate ? `${fmt(read.skipped.duplicate)} repeated lines are imported once` : null,
                unlinked ? `${fmt(unlinked)} new projects have no matching project code in the portal yet (they keep their SAP name)` : null,
                "Lines of other fiscal years are not touched"].filter(Boolean).join(" · ")}.
            </div>
            {step === "saving" && (
              <div>
                <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                  style={{ height: 8, borderRadius: 9, background: T.border, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: BRAND.blueBright, transition: "width .3s ease" }} />
                </div>
                <div style={{ ...TYPE.caption, color: T.muted, marginTop: 4 }}>Saving… {pct}%</div>
              </div>
            )}
          </>
        )}

        {step === "done" && result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 8px", textAlign: "center" }}>
            <CheckCircle2 size={30} color={T.textOf(DATA.positive)} />
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Inventory updated</div>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>
              {fmt(result.added)} new · {fmt(result.updated)} updated · {fmt(result.deleted)} marked deleted in SAP · {fmt(result.missing)} marked not in the sheet.
              <br />The Activity Log has a line for this import.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
