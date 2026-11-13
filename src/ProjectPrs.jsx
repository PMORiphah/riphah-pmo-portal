import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileCheck2, FileSpreadsheet, MailCheck, Upload, Loader2, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink,
  Trash2, X, ChevronDown, Hourglass, Users, Package, Wallet, Award, Pencil, Check, Image as ImageIcon, ZoomIn,
} from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, Modal, Skeleton } from "./ui.jsx";
import { fileLink, uploadToR2, removeFromR2 } from "./fileLinks.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PRs tab (PMO, 13 Nov 2026; migration 20261113_pmo_pr_documents.sql). PMO only.

   Every Pending PR of a project (pmo_tasks, list pending_pr), oldest = PR 1, shown newest first with a
   timeline: added → made (by Usman / Abdullah / Atisham) → released (the date of the "PR released" email).
   Each PR can carry:
     · its Comparative Statement (CS): PDF, scan, phone photo, Word or Excel, read by edge function
       pr-cs-extract (items, approved vendor, total, other vendors; code checks the arithmetic);
     · a screenshot of the "PR released" email: its date and subject read the same way, date editable.
   A reading says "Read by AI · not yet checked" until the PMO presses Confirm. Files are stored in R2
   (bucket project-attachments, under the project's or past project's id; uploads through `files`).
   Replacing a file sets the old one aside (removed = true; kept for the record).
   PrDocsPanel is also used from PR history in Tasks/Goals (PrDocsModal).
   ═══════════════════════════════════════════════════════════════════════════ */

const CS_CLR = DATA.violet;
const REL_CLR = DATA.positive;
const PEND_CLR = DATA.danger;
const GOLD = BRAND.gold;
const DAY = 86400000;
const MAKERS = { exec_pmo: "Engr. Usman Ahmed Umar", po1: "Mr. Abdullah Azhar", po2: "Mr. Atisham ul Haq" };
const TITLES = { exec_pmo: "Executive PMO", po1: "Executive PMO", po2: "Projects Officer" };
const MAKER_CLR = { exec_pmo: DATA.positive, po1: DATA.violet, po2: DATA.cyan };
const CS_ACCEPT = ".pdf,.docx,.xlsx,.xls,image/*";
const MAIL_ACCEPT = "image/*,.pdf";
const inSim = () => { try { return !!window.__PMO_SIM__; } catch { return false; } };

const fmtFull = (n) => n == null || !isFinite(+n) ? "—" : (+n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtM = (n) => { const v = +n || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)); };
const fmtDay = (d) => { if (!d) return null; const x = new Date(String(d).slice(0, 10) + "T00:00:00Z"); return isNaN(x) ? null : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
const fmtStamp = (ts) => { if (!ts) return null; const x = new Date(ts); return isNaN(x) ? null : x.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Karachi" }); };
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / DAY));
const initials = (n) => String(n || "").replace(/^(Mr|Mrs|Ms|Engr|Dr)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const firstName = (n) => String(n || "").replace(/^(Mr|Mrs|Ms|Engr|Dr)\.?\s+/i, "").split(" ")[0];

// Same cleaning as the Documents upload (App.jsx storageSafeName), kept here so this module stays lazy.
const safeName = (name) => {
  const src = name || "file", dot = src.lastIndexOf(".");
  const hasExt = dot > 0 && /^\.[A-Za-z0-9]{1,8}$/.test(src.slice(dot));
  const stem = hasExt ? src.slice(0, dot) : src, ext = hasExt ? src.slice(dot) : "";
  const s = stem.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._\-()' ]+/g, "_").replace(/_{2,}/g, "_").trim().replace(/^[._\s]+/, "");
  return (s || "file") + ext;
};

// A large phone photo is shrunk before upload (longest side 2400 px, JPEG): enough to read every figure.
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 3 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

/** All PR documents of some PRs (PMO only by RLS): Map(task id → docs, newest first). */
export async function loadPrDocs(supa, token, taskIds) {
  const ids = [...new Set(taskIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const r = await supa(`/rest/v1/pmo_pr_documents?removed=eq.false&task_id=in.(${ids.slice(i, i + 80).join(",")})&select=*&order=created_at.desc`, {}, token).catch(() => []);
    (Array.isArray(r) ? r : []).forEach((d) => { if (!out.has(d.task_id)) out.set(d.task_id, []); out.get(d.task_id).push(d); });
  }
  return out;
}
const latest = (docs, kind) => (docs || []).find((d) => d.kind === kind) || null;

async function openUrl(path, token) {
  const w = window.open("", "_blank");   // iOS blocks window.open after an await
  const url = await fileLink("project-attachments", path, token);
  if (!url) { if (w) w.close(); throw new Error("Could not make a link to the file. Try again in a minute."); }
  if (w) { w.opener = null; w.location.href = url; } else window.open(url, "_blank", "noopener");
}

// ─── small pieces ───────────────────────────────────────────────────────────

function Chip({ T, c, children, solid, title, ...rest }) {
  return (
    <span title={title} {...rest} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: R.pill, whiteSpace: "nowrap",
      background: solid ? c : `${c}1c`, border: `1px solid ${solid ? c : `${c}55`}`, color: solid ? "#fff" : T.textOf(c), ...TYPE.caption, fontSize: 10.5, fontWeight: 700 }}>{children}</span>
  );
}
function Lightbox({ src, alt, onClose }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return createPortal(
    <div role="dialog" aria-label={alt} data-pr-lightbox="" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(4,10,20,0.88)",
      display: "grid", placeItems: "center", padding: 16, animation: "prFade 220ms ease-out both", cursor: "zoom-out" }}>
      <img src={src} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)" }} />
      <button aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 38, height: 38, borderRadius: 99, border: "1px solid rgba(255,255,255,0.3)",
        background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}><X size={18} /></button>
    </div>, document.body);
}

function Drop({ T, color, icon: Icon, title, hint, accept, onFile, busy, progress, compact, attr = {} }) {
  const [over, setOver] = useState(false);
  const inp = useRef(null);
  return (
    <div {...attr} className="pr-drop" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); }}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: compact ? "14px" : "18px 18px", borderRadius: R.lg, overflow: "hidden",
        border: `1.5px dashed ${over ? color : `${color}66`}`, background: over ? `${color}18` : `${color}0a`, transition: `all ${MOTION.fast}`, "--pc": color }}>
      <div className="pr-float" style={{ width: 46, height: 46, borderRadius: 15, flexShrink: 0, display: "grid", placeItems: "center",
        background: `radial-gradient(circle at 30% 30%, ${color}44, ${color}14)`, border: `1px solid ${color}55` }}>
        {busy ? <Loader2 size={20} color={color} className="pr-spin" /> : <Icon size={20} color={color} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{busy || title}</div>
        <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>{busy ? (progress != null ? `${Math.round(progress * 100)}%` : "This takes a few seconds…") : hint}</div>
        {progress != null && busy && (
          <div style={{ height: 4, borderRadius: 99, background: T.border, marginTop: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: color, transition: "width 200ms" }} /></div>)}
      </div>
      {!busy && <Button T={T} size="sm" icon={Upload} onClick={() => inp.current?.click()}>{compact ? "Add" : "Choose file"}</Button>}
      <input ref={inp} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </div>
  );
}

function ReadState({ T, doc, busy, onConfirm, onUnconfirm, onRead }) {
  if (!doc.reading) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
      {doc.confirmed
        ? <Chip T={T} c={REL_CLR}><CheckCircle2 size={11} /> Checked by PMO{doc.confirmed_at ? ` · ${fmtDay(doc.confirmed_at)}` : ""}</Chip>
        : <Chip T={T} c={DATA.warning} data-pr-unchecked=""><Hourglass size={11} /> Read by AI · not yet checked</Chip>}
      <span style={{ ...TYPE.caption, fontSize: 10.5, color: T.dim }}>{doc.read_at ? `read ${fmtStamp(doc.read_at)}` : ""}</span>
      <span style={{ flex: 1 }} />
      {doc.confirmed
        ? <Button T={T} size="sm" onClick={onUnconfirm} disabled={!!busy}>Unconfirm</Button>
        : <>
            <Button T={T} size="sm" icon={RefreshCw} onClick={onRead} disabled={!!busy} data-pr-reread="">Read again</Button>
            <Button T={T} size="sm" variant="primary" icon={Check} onClick={onConfirm} disabled={!!busy} data-pr-confirm-reading="">Confirm</Button>
          </>}
    </div>
  );
}

// ─── the CS block ──────────────────────────────────────────────────────────

function CsBlock({ T, compact, doc, busy, act }) {
  const [all, setAll] = useState(false);
  const r = doc.reading || {};
  const items = Array.isArray(r.items) ? r.items : [];
  const vendors = (Array.isArray(r.vendors) ? r.vendors : []).slice().sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
  const vmax = Math.max(1, ...vendors.map((v) => +v.total || 0));
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const shown = all ? items : items.slice(0, 6);
  const cur = doc.currency || r.currency || "PKR";
  return (
    <div data-pr-cs={doc.id}>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(3, minmax(0,1fr))", gap: 8 }}>
        <Stat T={T} c={CS_CLR} label="Total amount" value={doc.total_amount != null ? `${cur} ${fmtFull(doc.total_amount)}` : "—"} big data="total" />
        <Stat T={T} c={DATA.info} label="Items" value={doc.item_count ?? items.length} data="items" />
        <Stat T={T} c={GOLD} label="Approved vendor" value={doc.approved_vendor || "Not named"} wide={compact} data="vendor" />
      </div>
      {items.length > 0 && (
        <div style={{ marginTop: 12, border: `1px solid ${T.border}`, borderRadius: R.md, overflow: "hidden" }}>
          {!compact && (
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 110px 120px", gap: 8, padding: "7px 12px", background: T.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(10,30,60,0.04)",
              ...TYPE.label, fontSize: 9.5, color: T.dim }}>
              <span>#</span><span>Item</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Unit price</span><span style={{ textAlign: "right" }}>Amount</span>
            </div>)}
          {shown.map((x, i) => compact ? (
            <div key={i} data-pr-item="" style={{ padding: "8px 12px", borderTop: i ? `1px solid ${T.border}` : "none" }}>
              <div style={{ ...TYPE.caption, fontWeight: 700, color: T.text, overflowWrap: "anywhere" }}>{i + 1}. {x.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...TYPE.caption, fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                <span>{x.qty != null ? `${fmtFull(x.qty)}${x.unit ? ` ${x.unit}` : ""}` : "—"} × {fmtFull(x.unit_price)}</span>
                <b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtFull(x.amount)}</b>
              </div>
            </div>
          ) : (
            <div key={i} data-pr-item="" className="pr-row" style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 110px 120px", gap: 8, padding: "8px 12px", borderTop: `1px solid ${T.border}`,
              ...TYPE.caption, color: T.textSoft, fontVariantNumeric: "tabular-nums", alignItems: "baseline" }}>
              <span style={{ color: T.dim }}>{i + 1}</span>
              <span style={{ color: T.text, fontWeight: 600, overflowWrap: "anywhere" }}>{x.name}</span>
              <span style={{ textAlign: "right" }}>{x.qty != null ? fmtFull(x.qty) : "—"}{x.unit ? <span style={{ color: T.dim }}> {x.unit}</span> : null}</span>
              <span style={{ textAlign: "right" }}>{fmtFull(x.unit_price)}</span>
              <span style={{ textAlign: "right", color: T.text, fontWeight: 700 }}>{fmtFull(x.amount)}</span>
            </div>
          ))}
          {items.length > 6 && (
            <button onClick={() => setAll((v) => !v)} className="pmo-focusable" style={{ width: "100%", padding: "7px", border: "none", borderTop: `1px solid ${T.border}`, background: "none", cursor: "pointer",
              ...TYPE.caption, fontWeight: 700, color: T.textOf(CS_CLR), fontFamily: TYPE.body.fontFamily, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <ChevronDown size={13} style={{ transform: all ? "rotate(180deg)" : "none", transition: `transform ${MOTION.fast}` }} />{all ? "Show fewer" : `Show all ${items.length} items`}</button>)}
        </div>
      )}
      {vendors.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...TYPE.label, fontSize: 9.5, color: T.dim, marginBottom: 6 }}>Vendors compared · {vendors.length}</div>
          {vendors.map((v, i) => (
            <div key={i} data-pr-vendor={v.approved ? "approved" : ""} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i ? 6 : 0 }}>
              <span style={{ width: compact ? 110 : 170, flexShrink: 0, ...TYPE.caption, fontWeight: v.approved ? 800 : 600, color: v.approved ? T.text : T.textSoft,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>{v.name}</span>
              <div style={{ flex: 1, height: 18, borderRadius: 6, background: T.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(10,30,60,0.05)", position: "relative", overflow: "hidden" }}>
                <div className="pr-grow" style={{ position: "absolute", inset: 0, width: `${((+v.total || 0) / vmax) * 100}%`, borderRadius: 6, animationDelay: `${i * 90}ms`,
                  background: v.approved ? `linear-gradient(90deg, ${GOLD}, ${GOLD}aa)` : `${T.mode === "dark" ? "#8aa0bf" : "#9fb0c8"}66` }} />
                {v.approved && <span style={{ position: "absolute", left: 6, top: 1, ...TYPE.caption, fontSize: 10, fontWeight: 800, color: BRAND.navyDeep, display: "inline-flex", alignItems: "center", gap: 3 }}><Award size={11} /> Approved</span>}
              </div>
              <span style={{ width: compact ? 74 : 110, textAlign: "right", flexShrink: 0, ...TYPE.caption, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{v.total != null ? (compact ? fmtM(v.total) : fmtFull(v.total)) : "—"}</span>
            </div>
          ))}
        </div>
      )}
      {checks.length > 0 && (
        <div data-pr-checks="" style={{ marginTop: 12, padding: "10px 12px", borderRadius: R.md, background: `${DATA.warning}12`, border: `1px solid ${DATA.warning}44` }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 7, ...TYPE.caption, color: T.textSoft, marginTop: i ? 5 : 0 }}>
              <AlertTriangle size={12} color={DATA.warning} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ overflowWrap: "anywhere" }}>{c}</span></div>))}
        </div>
      )}
      <ReadState T={T} doc={doc} busy={busy} onConfirm={() => act.patch(doc, { confirmed: true })} onUnconfirm={() => act.patch(doc, { confirmed: false })} onRead={() => act.read(doc, true)} />
    </div>
  );
}
function Stat({ T, c, label, value, big, wide, data }) {
  return (
    <div data-pr-stat={data} style={{ gridColumn: wide ? "1 / -1" : "auto", minWidth: 0, padding: "9px 11px", borderRadius: R.md, background: `${c}12`, border: `1px solid ${c}33` }}>
      <div style={{ ...TYPE.label, fontSize: 9, color: T.muted }}>{label}</div>
      <div style={{ ...(big ? TYPE.metric : TYPE.bodySm), fontSize: big ? 17 : 13.5, fontWeight: 800, color: T.text, marginTop: 3, overflowWrap: "anywhere", lineHeight: 1.25 }}>{value}</div>
    </div>
  );
}

// ─── the release email block ───────────────────────────────────────────────

function MailBlock({ T, compact, doc, busy, act, token }) {
  const [src, setSrc] = useState(null);
  const [big, setBig] = useState(false);
  const [dim, setDim] = useState(null);           // the screenshot's natural size, for the preview's shape
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(doc.released_on || "");
  useEffect(() => { setDate(doc.released_on || ""); }, [doc.released_on]);
  const isImg = /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(doc.file_name || "") || /^image\//.test(doc.mime_type || "");
  useEffect(() => { let on = true; if (isImg && !inSim()) fileLink("project-attachments", doc.file_path, token).then((u) => on && setSrc(u)); return () => { on = false; }; }, [doc.file_path, token, isImg]);
  const r = doc.reading || {};
  const checks = Array.isArray(r.checks) ? r.checks : [];
  return (
    <div data-pr-mail={doc.id} style={{ display: "flex", gap: 14, flexDirection: "column" }}>
      {/* Full-width preview in the screenshot's own shape, from its top-left corner (sender, date and time first);
          wide email screenshots were cropped to empty white in a small square box. Tall ones are capped and fade out. */}
      <button onClick={() => (src ? setBig(true) : act.open(doc))} className="pmo-focusable pr-thumb" aria-label="Open the email screenshot" data-pr-thumb=""
        style={{ width: "100%", padding: 0, borderRadius: R.md, overflow: "hidden", cursor: "zoom-in", position: "relative", display: "block",
          aspectRatio: src && dim ? `${dim.w} / ${dim.h}` : undefined, height: src && dim ? undefined : 110, maxHeight: compact ? 190 : 230, minHeight: 72,
          border: `1px solid ${T.border}`, background: src ? "#fff" : T.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(10,30,60,0.04)",
          boxShadow: src ? "0 10px 26px -14px rgba(0,0,0,0.55)" : "none" }}>
        {src ? (<>
          <img src={src} alt="PR released email" onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth || 4, h: e.currentTarget.naturalHeight || 1 })}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top", display: "block" }} />
          {dim && dim.h / dim.w > (compact ? 190 : 230) / 600 && <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: "linear-gradient(180deg, rgba(255,255,255,0), #fff)" }} />}
          <span className="pr-thumb-hint" style={{ position: "absolute", right: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99,
            background: "rgba(10,22,40,0.78)", color: "#fff", ...TYPE.caption, fontSize: 10.5, fontWeight: 700 }}><ZoomIn size={12} /> View full size</span>
        </>) : <span style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, ...TYPE.caption, color: T.muted }}>{isImg ? <ImageIcon size={22} /> : <FileCheck2 size={22} />}{isImg ? "Loading…" : "Open file"}</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.label, fontSize: 9.5, color: T.muted }}>PR released on</div>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-pr-date-input=""
              style={{ padding: "6px 8px", borderRadius: R.sm, border: `1px solid ${T.borderStrong}`, background: T.surface, color: T.text, fontFamily: TYPE.body.fontFamily, colorScheme: T.mode }} />
            <Button T={T} size="sm" variant="primary" icon={Check} disabled={!date || !!busy} data-pr-date-save=""
              onClick={async () => { await act.patch(doc, { released_on: date }); setEditing(false); }}>Save</Button>
            <Button T={T} size="sm" onClick={() => { setEditing(false); setDate(doc.released_on || ""); }}>Cancel</Button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span data-pr-released="" style={{ ...TYPE.metric, fontSize: 20, color: doc.released_on ? T.textOf(REL_CLR) : T.muted }}>{fmtDay(doc.released_on) || (doc.reading ? "Date not read" : "—")}</span>
            <button onClick={() => setEditing(true)} aria-label="Change the release date" title="Change the date" data-pr-date-edit="" className="pmo-focusable"
              style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: R.sm, padding: 4, cursor: "pointer", color: T.muted, display: "grid", placeItems: "center" }}><Pencil size={12} /></button>
          </div>
        )}
        {(r.subject || doc.email_subject) && <div style={{ ...TYPE.caption, color: T.text, fontWeight: 600, marginTop: 6, overflowWrap: "anywhere" }}>“{r.subject || doc.email_subject}”</div>}
        <div style={{ ...TYPE.caption, fontSize: 10.5, color: T.muted, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {r.from && <span>From {r.from}</span>}{r.sent_time && <span>{r.sent_time}</span>}{r.pr_number && <span>PR {r.pr_number}</span>}{r.amount != null && <span>PKR {fmtFull(r.amount)}</span>}
        </div>
        {r.summary && <div style={{ ...TYPE.caption, color: T.textSoft, marginTop: 6, overflowWrap: "anywhere" }}>{r.summary}</div>}
        {checks.map((c, i) => <div key={i} style={{ display: "flex", gap: 6, ...TYPE.caption, color: T.textSoft, marginTop: 6 }}><AlertTriangle size={12} color={DATA.warning} style={{ flexShrink: 0, marginTop: 2 }} />{c}</div>)}
        <ReadState T={T} doc={doc} busy={busy} onConfirm={() => act.patch(doc, { confirmed: true })} onUnconfirm={() => act.patch(doc, { confirmed: false })} onRead={() => act.read(doc, true)} />
      </div>
      {big && src && <Lightbox src={src} alt="PR released email" onClose={() => setBig(false)} />}
    </div>
  );
}

// ─── one PR's documents (tab card and PR history window) ───────────────────

/** CS + release email of one PR. `ownerId` = the project's or past project's id (the storage folder). */
export function PrDocsPanel({ T, session, supa, task, docs, compact, onChanged }) {
  const token = session.access_token;
  const [busy, setBusy] = useState({});          // kind → label
  const [prog, setProg] = useState({});
  const [msg, setMsg] = useState(null);
  const ownerId = task.project_id || task.past_project_id;
  const cs = latest(docs, "cs"), mail = latest(docs, "release_email");

  const read = useCallback(async (doc, force) => {
    setBusy((b) => ({ ...b, [doc.kind]: doc.kind === "cs" ? "The assistant is reading the CS…" : "The assistant is reading the email…" }));
    try {
      const r = await supa("/functions/v1/pr-cs-extract", { method: "POST", body: JSON.stringify({ document_id: doc.id, ...(force ? { force: true } : {}) }) }, token);
      if (r?.error) setMsg({ tone: "bad", text: `${doc.file_name} could not be read: ${r.error}` });
      else if (r?.skipped && r.skipped !== "already read") setMsg({ tone: "info", text: `${doc.file_name}: ${r.skipped}.` });
    } catch (e) { setMsg({ tone: "bad", text: `${doc.file_name} could not be read: ${e.message || "error"}` }); }
    setBusy((b) => ({ ...b, [doc.kind]: null }));
    await onChanged?.();
  }, [supa, token, onChanged]);

  const add = async (kind, raw) => {
    setMsg(null);
    if (raw.size > 50 * 1024 * 1024) { setMsg({ tone: "bad", text: `${raw.name} is ${(raw.size / 1048576).toFixed(1)} MB; a CS or screenshot should be under 50 MB.` }); return; }
    setBusy((b) => ({ ...b, [kind]: `Uploading ${raw.name}` })); setProg((p) => ({ ...p, [kind]: 0 }));
    let path = null;
    try {
      const file = await shrink(raw);
      path = await uploadToR2("project-attachments", ownerId, file, safeName(file.name), token, (a, b) => setProg((p) => ({ ...p, [kind]: b ? a / b : null })));
      setProg((p) => ({ ...p, [kind]: null }));
      const rows = await supa("/rest/v1/pmo_pr_documents?select=*", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ task_id: task.id, kind, file_name: file.name.slice(0, 200), file_path: path, mime_type: file.type || null, size_bytes: file.size }) }, token);
      const doc = Array.isArray(rows) ? rows[0] : null;
      if (!doc) throw new Error("The file was uploaded but could not be recorded.");
      const old = (docs || []).filter((d) => d.kind === kind);
      for (const o of old) await supa(`/rest/v1/pmo_pr_documents?id=eq.${o.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ removed: true }) }, token).catch(() => {});
      setBusy((b) => ({ ...b, [kind]: null }));
      await onChanged?.();
      await read(doc, false);
    } catch (e) {
      if (path) removeFromR2("project-attachments", path, token);
      setMsg({ tone: "bad", text: e.message || "Upload failed." });
      setBusy((b) => ({ ...b, [kind]: null })); setProg((p) => ({ ...p, [kind]: null }));
    }
  };
  const patch = async (doc, body) => {
    try { await supa(`/rest/v1/pmo_pr_documents?id=eq.${doc.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) }, token); await onChanged?.(); }
    catch (e) { setMsg({ tone: "bad", text: e.message || "Could not save that." }); }
  };
  const open = async (doc) => { try { await openUrl(doc.file_path, token); } catch (e) { setMsg({ tone: "bad", text: e.message }); } };
  const act = { read, patch, open };

  const head = (Icon, c, title, doc, kind, accept) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: `${c}22`, border: `1px solid ${c}55` }}><Icon size={14} color={c} /></span>
      <span style={{ ...TYPE.h3, fontSize: 13.5, color: T.text }}>{title}</span>
      {doc && <button onClick={() => open(doc)} className="pmo-focusable pr-link" title={doc.file_name} data-pr-open={kind}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: compact ? 150 : 260, padding: 0, border: "none", background: "none", cursor: "pointer",
          ...TYPE.caption, color: T.textOf(BRAND.blueBright), fontFamily: TYPE.body.fontFamily }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</span><ExternalLink size={11} style={{ flexShrink: 0 }} /></button>}
      <span style={{ flex: 1 }} />
      {doc && !busy[kind] && <Replace T={T} accept={accept} onFile={(f) => add(kind, f)} kind={kind} />}
      {doc && !busy[kind] && <button onClick={() => { if (window.confirm(`Remove ${doc.file_name} from this PR? It is kept in the record.`)) patch(doc, { removed: true }); }}
        aria-label={`Remove ${doc.file_name}`} title="Remove" className="pmo-focusable" data-pr-remove={kind}
        style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: R.sm, padding: 5, cursor: "pointer", color: T.textOf(DATA.danger), display: "grid", placeItems: "center" }}><Trash2 size={12} /></button>}
    </div>
  );
  const box = (c, children, attr) => (
    <div {...attr} style={{ minWidth: 0, padding: compact ? 12 : 16, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.surface, boxShadow: `inset 0 3px 0 ${c}` }}>{children}</div>
  );
  const csBusy = busy.cs, mailBusy = busy.release_email;
  return (
    <div data-pr-docs={task.id}>
      {msg && <div role="status" style={{ marginBottom: 10, padding: "8px 12px", borderRadius: R.md, ...TYPE.caption,
        background: msg.tone === "bad" ? `${DATA.danger}14` : `${DATA.info}14`, border: `1px solid ${msg.tone === "bad" ? DATA.danger : DATA.info}44`, color: T.text }}>{msg.text}</div>}
      <div style={{ display: "grid", gap: compact ? 10 : 14, alignItems: "start", gridTemplateColumns: compact ? "1fr" : "minmax(0,1.5fr) minmax(0,1fr)" }}>
        {box(CS_CLR, <>
          {head(FileSpreadsheet, CS_CLR, "Comparative Statement (CS)", cs, "cs", CS_ACCEPT)}
          {(!cs || csBusy) ? (csBusy && cs && !/^Uploading/.test(csBusy)
              ? <ReadingSkeleton T={T} text={csBusy} c={CS_CLR} />
              : <Drop T={T} compact={compact} color={CS_CLR} icon={FileSpreadsheet} title="Add PR document (CS)" accept={CS_ACCEPT} busy={csBusy} progress={prog.cs}
                  hint="PDF, scan, phone photo, Word or Excel. The assistant lists the items, vendors and total." onFile={(f) => add("cs", f)} attr={{ "data-pr-add": "cs" }} />)
            : !cs.reading ? <Unread T={T} doc={cs} onRead={() => read(cs, false)} />
            : <CsBlock T={T} compact={compact} doc={cs} busy={csBusy} act={act} />}
        </>, { "data-pr-box": "cs" })}
        {box(REL_CLR, <>
          {head(MailCheck, REL_CLR, "PR released email", mail, "release_email", MAIL_ACCEPT)}
          {(!mail || mailBusy) ? (mailBusy && mail && !/^Uploading/.test(mailBusy)
              ? <ReadingSkeleton T={T} text={mailBusy} c={REL_CLR} />
              : <Drop T={T} compact={compact} color={REL_CLR} icon={MailCheck} title="Add PR released email" accept={MAIL_ACCEPT} busy={mailBusy} progress={prog.release_email}
                  hint="A screenshot of the email. The assistant reads its date and subject." onFile={(f) => add("release_email", f)} attr={{ "data-pr-add": "release_email" }} />)
            : <MailBlock T={T} compact={compact} doc={mail} busy={mailBusy} act={act} token={token} />}
        </>, { "data-pr-box": "release_email" })}
      </div>
    </div>
  );
}
function Replace({ T, accept, onFile, kind }) {
  const inp = useRef(null);
  return (<>
    <Button T={T} size="sm" icon={Upload} onClick={() => inp.current?.click()} data-pr-replace={kind}>Replace</Button>
    <input ref={inp} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
  </>);
}
function ReadingSkeleton({ T, text, c }) {
  return (
    <div data-pr-reading="" style={{ padding: 14, borderRadius: R.md, border: `1px solid ${c}44`, background: `${c}0c` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.caption, fontWeight: 700, color: T.textOf(c) }}><Loader2 size={14} className="pr-spin" /> {text}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}><Skeleton T={T} h={12} w="70%" /><Skeleton T={T} h={12} w="90%" /><Skeleton T={T} h={12} w="55%" /></div>
    </div>
  );
}
function Unread({ T, doc, onRead }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: R.md, border: `1px solid ${DATA.warning}44`, background: `${DATA.warning}10`, flexWrap: "wrap" }}>
      <AlertTriangle size={15} color={DATA.warning} />
      <span style={{ flex: 1, minWidth: 180, ...TYPE.caption, color: T.textSoft }}>{doc.read_error ? `Not read yet: ${doc.read_error}` : "Not read yet."}</span>
      <Button T={T} size="sm" icon={RefreshCw} onClick={onRead} data-pr-read-now="">Read now</Button>
    </div>
  );
}

/** PR history (Tasks/Goals): the documents of one PR in a window. */
export function PrDocsModal({ T, session, supa, task, proj, compact, onClose }) {
  const [docs, setDocs] = useState(null);
  const load = useCallback(async () => { const m = await loadPrDocs(supa, session.access_token, [task.id]); setDocs(m.get(task.id) || []); }, [supa, session.access_token, task.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <Modal T={T} isMobile={compact} onClose={onClose} icon={FileCheck2} width={980} title="PR documents"
      sub={proj ? `${proj.code && proj.code !== "-" ? `${proj.code} · ` : ""}${proj.name}` : "Pending PR"}
      footer={<div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}><Button T={T} onClick={onClose}>Close</Button></div>}>
      <style>{CSS(T)}</style>
      <div data-pr-docs-modal="">
        {docs === null ? <Skeleton T={T} h={140} /> : <PrDocsPanel T={T} session={session} supa={supa} task={task} docs={docs} compact={compact} onChanged={load} />}
      </div>
    </Modal>
  );
}

const CSS = (T) => `
  @keyframes prFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes prRise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
  @keyframes prGrow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
  @keyframes prFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  @keyframes prSpin { to { transform: rotate(360deg) } }
  @keyframes prPulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dc) 45%, transparent) } 50% { box-shadow: 0 0 0 6px transparent } }
  .pr-rise { animation: prRise 560ms cubic-bezier(.2,.7,.2,1) both }
  .pr-grow { transform-origin: left; animation: prGrow 1000ms cubic-bezier(.2,.7,.2,1) both }
  .pr-float { animation: prFloat 3.2s ease-in-out infinite }
  .pr-spin { animation: prSpin 900ms linear infinite }
  .pr-dot-live { animation: prPulse 2.2s ease-in-out infinite }
  .pr-card { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast} }
  .pr-card:hover { box-shadow: ${T.shadowLg} }
  .pr-row:hover { background: ${T.rowHover} }
  .pr-thumb { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast} }
  .pr-thumb:hover { transform: translateY(-2px); box-shadow: ${T.shadowLg} !important }
  .pr-thumb .pr-thumb-hint { opacity: 0; transition: opacity ${MOTION.fast} }
  .pr-thumb:hover .pr-thumb-hint, .pr-thumb:focus-visible .pr-thumb-hint { opacity: 1 }
  @media (hover: none) { .pr-thumb .pr-thumb-hint { opacity: 1 } }
  .pr-link:hover span { text-decoration: underline }
  .pr-tile { transition: transform ${MOTION.fast} }
  .pr-tile:hover { transform: translateY(-2px) }
  @media (prefers-reduced-motion: reduce) { .pr-rise, .pr-grow, .pr-float, .pr-dot-live { animation: none !important } .pr-thumb:hover, .pr-tile:hover { transform: none } }
`;

// ─── the tab ───────────────────────────────────────────────────────────────

/** The PRs tab of a FY 26-27 project (projectId) or a past project (pastProjectId). PMO only. */
export function PrsTab({ T, session, supa, projectId, pastProjectId, isCompact }) {
  const token = session.access_token;
  const [tasks, setTasks] = useState(null);
  const [docs, setDocs] = useState(new Map());
  const [cfg, setCfg] = useState({});
  const [people, setPeople] = useState({});
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState({});
  const col = projectId ? "project_id" : "past_project_id", id = projectId || pastProjectId;

  const loadDocs = useCallback(async (ts) => { setDocs(await loadPrDocs(supa, token, (ts || []).map((t) => t.id))); }, [supa, token]);
  const load = useCallback(async () => {
    try {
      const [t, s, u] = await Promise.all([
        supa(`/rest/v1/pmo_tasks?list=eq.pending_pr&removed=eq.false&${col}=eq.${id}&select=*&order=created_at.asc`, {}, token),
        supa("/rest/v1/settings?key=eq.team_config&select=value", {}, token).catch(() => []),
        supa("/rest/v1/user_profiles?select=id,full_name,username", {}, token).catch(() => []),
      ]);
      const ts = Array.isArray(t) ? t : [];
      setTasks(ts); setCfg((Array.isArray(s) && s[0]?.value) || {});
      setPeople(Object.fromEntries((Array.isArray(u) ? u : []).map((x) => [x.id, (x.full_name || x.username || "").trim()])));
      await loadDocs(ts); setErr(null);
    } catch (e) { setErr(e.message || "Could not load the PRs."); setTasks((x) => x || []); }
  }, [supa, token, col, id, loadDocs]);
  useEffect(() => { setTasks(null); load(); }, [load]);

  const numbered = useMemo(() => (tasks || []).map((t, i) => ({ ...t, n: i + 1 })), [tasks]);
  const list = useMemo(() => numbered.slice().reverse(), [numbered]);
  const makerName = (k) => (cfg[k]?.name || MAKERS[k] || "").trim();
  const makerTitle = (k) => (k === "po1" ? "Executive PMO" : cfg[k]?.title || TITLES[k] || "");

  const sums = useMemo(() => {
    const css = list.map((t) => latest(docs.get(t.id), "cs")).filter(Boolean);
    const rel = list.map((t) => latest(docs.get(t.id), "release_email")).filter((d) => d?.released_on);
    const vendors = [...new Set(css.map((d) => d.approved_vendor).filter(Boolean))];
    return { total: css.reduce((s, d) => s + (+d.total_amount || 0), 0), items: css.reduce((s, d) => s + (+d.item_count || 0), 0), withCs: css.length,
      vendors, released: rel.length, made: list.filter((t) => t.done).length, pending: list.filter((t) => !t.done).length };
  }, [list, docs]);

  if (tasks === null) return <div style={{ display: "grid", gap: SP.md }}><Skeleton T={T} h={96} /><Skeleton T={T} h={220} /><Skeleton T={T} h={220} /></div>;

  const tile = (Icon, c, label, value, sub, i, attr) => (
    <div {...attr} className="pr-tile pr-rise" style={{ animationDelay: `${i * 70}ms`, minWidth: 0, padding: isCompact ? "12px 14px" : "16px 18px", borderRadius: R.lg, position: "relative", overflow: "hidden",
      background: `linear-gradient(150deg, ${c}22, ${T.card} 70%)`, border: `1px solid ${c}44`, boxShadow: T.shadow }}>
      <span aria-hidden="true" style={{ position: "absolute", right: -18, top: -18, width: 80, height: 80, borderRadius: 99, background: `radial-gradient(circle, ${c}33, transparent 70%)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.label, fontSize: 9.5, color: T.muted }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: `${c}2a` }}><Icon size={14} color={c} /></span>{label}</div>
      <div style={{ ...TYPE.display, fontSize: isCompact ? 22 : 28, color: T.text, marginTop: 8, lineHeight: 1.05, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: T.muted, marginTop: 4, overflowWrap: "anywhere" }}>{sub}</div>}
    </div>
  );

  return (
    <div data-prs-tab="" style={{ display: "flex", flexDirection: "column", gap: isCompact ? SP.md : SP.lg }}>
      <style>{CSS(T)}</style>
      {err && <div style={{ ...TYPE.caption, color: T.textOf(DATA.danger) }}>{err}</div>}
      <div style={{ display: "grid", gap: isCompact ? SP.sm : SP.md, gridTemplateColumns: isCompact ? "1fr 1fr" : "repeat(4, minmax(0,1fr))" }}>
        {tile(FileCheck2, PEND_CLR, "PRs", list.length, `${sums.made} made · ${sums.pending} pending · ${sums.released} released`, 0, { "data-pr-tile": "count" })}
        {tile(Wallet, CS_CLR, "Total CS value", sums.withCs ? `PKR ${fmtM(sums.total)}` : "—", sums.withCs ? `PKR ${fmtFull(sums.total)} · ${sums.withCs} CS` : "Add a CS to a PR", 1, { "data-pr-tile": "value" })}
        {tile(Package, DATA.info, "Items", sums.items || "—", sums.withCs ? "in the CS documents" : "listed once a CS is read", 2, { "data-pr-tile": "items" })}
        {tile(Users, GOLD, "Approved vendors", sums.vendors.length || "—", sums.vendors.length ? sums.vendors.slice(0, 3).join(" · ") + (sums.vendors.length > 3 ? ` +${sums.vendors.length - 3}` : "") : "named on the CS", 3, { "data-pr-tile": "vendors" })}
      </div>

      {list.map((t, i) => {
        const ds = docs.get(t.id) || [];
        const cs = latest(ds, "cs"), mail = latest(ds, "release_email");
        const maker = t.pr_made_by;
        const mc = MAKER_CLR[maker] || DATA.neutral;
        const status = mail?.released_on ? { label: "Released", c: REL_CLR } : t.done ? { label: "PR made", c: CS_CLR } : { label: "Pending", c: PEND_CLR };
        const isOpen = open[t.id] ?? (i === 0 || !t.done || !cs || !mail);
        const steps = [
          { key: "added", label: "PR added", when: fmtDay(t.created_at), sub: people[t.created_by] || null, done: true, c: DATA.info },
          { key: "made", label: t.done ? "PR made" : "Waiting", when: t.done ? fmtDay(t.done_at) : `${daysBetween(t.created_at, Date.now())} days so far`,
            sub: t.done ? (maker ? `by ${makerName(maker)} · ${makerTitle(maker)}` : "who made it was not recorded") : "not made yet", done: t.done, c: t.done ? mc : PEND_CLR, live: !t.done,
            gap: t.done ? `${daysBetween(t.created_at, t.done_at)} d` : null },
          { key: "released", label: "PR released", when: mail?.released_on ? fmtDay(mail.released_on) : "—",
            sub: mail?.released_on ? (t.done_at ? `${daysBetween(t.done_at, mail.released_on)} days after it was made` : "from the email") : mail ? "date not read yet" : "add the email screenshot", done: !!mail?.released_on, c: REL_CLR },
        ];
        return (
          <section key={t.id} data-pr-card={t.id} className="pr-card pr-rise" style={{ animationDelay: `${120 + i * 80}ms`, borderRadius: R.xl, overflow: "hidden", background: T.card,
            border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${status.c}, ${status.c}44)` }} />
            <button onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))} aria-expanded={isOpen} className="pmo-focusable" data-pr-toggle={t.id}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: isCompact ? "12px 14px" : "16px 20px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: TYPE.body.fontFamily, flexWrap: "wrap" }}>
              <span style={{ width: 46, height: 46, borderRadius: 15, flexShrink: 0, display: "grid", placeItems: "center", background: `linear-gradient(140deg, ${status.c}, ${status.c}99)`,
                color: "#fff", boxShadow: `0 10px 22px -12px ${status.c}`, ...TYPE.metric, fontSize: 15 }}>PR {t.n}</span>
              <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...TYPE.h3, fontSize: 15, color: T.text }}>{/^pending pr$/i.test(t.title.trim()) ? `PR ${t.n}` : t.title}</span>
                  <Chip T={T} c={status.c} solid data-pr-status="">{status.label}</Chip>
                  {cs?.confirmed && <Chip T={T} c={REL_CLR}><CheckCircle2 size={10} /> CS checked</Chip>}
                </span>
                <span style={{ display: "block", ...TYPE.caption, color: T.muted, marginTop: 3 }}>
                  Added {fmtDay(t.created_at)}{t.done ? ` · made ${fmtDay(t.done_at)}` : ""}{mail?.released_on ? ` · released ${fmtDay(mail.released_on)}` : ""}
                </span>
              </span>
              {cs?.total_amount != null && (
                <span style={isCompact ? { order: 3, flex: "1 1 100%", paddingLeft: 58 } : { textAlign: "right" }}>
                  <span style={{ display: "block", ...TYPE.metric, fontSize: isCompact ? 16 : 20, color: T.text }}>PKR {fmtFull(cs.total_amount)}</span>
                  <span style={{ display: "block", ...TYPE.caption, color: T.muted }}>{cs.item_count ?? 0} item{cs.item_count === 1 ? "" : "s"}{cs.approved_vendor ? ` · ${cs.approved_vendor}` : ""}</span>
                </span>)}
              <ChevronDown size={18} color={T.muted} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: `transform ${MOTION.fast}`, flexShrink: 0 }} />
            </button>
            {isOpen && (
              <div style={{ padding: isCompact ? "0 14px 14px" : "0 20px 20px" }}>
                {/* timeline */}
                <div data-pr-timeline="" style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "repeat(3, minmax(0,1fr))", gap: isCompact ? 0 : 0, margin: isCompact ? "0 0 12px" : "4px 0 18px", position: "relative" }}>
                  {steps.map((s, k) => (
                    <div key={s.key} data-pr-step={s.key} style={{ position: "relative", display: "flex", flexDirection: isCompact ? "row" : "column", gap: isCompact ? 12 : 8, alignItems: isCompact ? "flex-start" : "flex-start",
                      paddingBottom: isCompact && k < 2 ? 14 : 0, paddingRight: isCompact ? 0 : 12 }}>
                      {/* connector */}
                      {k < 2 && (isCompact
                        ? <span aria-hidden="true" style={{ position: "absolute", left: 10, top: 24, bottom: 0, width: 2, background: steps[k + 1].done ? `linear-gradient(${s.c}, ${steps[k + 1].c})` : T.border }} />
                        : <span aria-hidden="true" style={{ position: "absolute", left: 24, right: 0, top: 10, height: 2, background: steps[k + 1].done ? `linear-gradient(90deg, ${s.c}, ${steps[k + 1].c})` : `repeating-linear-gradient(90deg, ${T.border} 0 6px, transparent 6px 11px)` }}>
                            {steps[k + 1].gap && <span style={{ position: "absolute", left: "50%", top: -9, transform: "translateX(-50%)", padding: "0 6px", background: T.card, ...TYPE.caption, fontSize: 10, color: T.dim, whiteSpace: "nowrap" }}>{steps[k + 1].gap}</span>}
                          </span>)}
                      <span className={s.live ? "pr-dot-live" : ""} style={{ position: "relative", zIndex: 1, width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center",
                        background: s.done ? s.c : T.card, border: `2px solid ${s.done || s.live ? s.c : T.border}`, "--dc": s.c }}>
                        {s.done ? <Check size={12} color="#fff" strokeWidth={3} /> : s.live ? <Hourglass size={10} color={s.c} /> : null}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", ...TYPE.label, fontSize: 9.5, color: s.done || s.live ? T.textOf(s.c) : T.dim }}>{s.label}</span>
                        <span style={{ display: "block", ...TYPE.bodySm, fontWeight: 700, color: s.done ? T.text : T.muted, marginTop: 1 }}>{s.when}</span>
                        {s.sub && <span style={{ display: "block", ...TYPE.caption, fontSize: 10.5, color: T.muted, marginTop: 1 }}>{s.key === "made" && t.done && maker
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 18, borderRadius: 6, display: "inline-grid", placeItems: "center", fontSize: 8.5, fontWeight: 800, color: "#fff", background: mc }}>{initials(makerName(maker))}</span>{firstName(makerName(maker))} · {makerTitle(maker)}</span>
                          : s.sub}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {t.note && <div style={{ ...TYPE.caption, color: T.textSoft, margin: "-6px 0 12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.note}</div>}
                <PrDocsPanel T={T} session={session} supa={supa} task={t} docs={ds} compact={isCompact} onChanged={() => loadDocs(tasks)} />
              </div>
            )}
          </section>
        );
      })}
      {!list.length && <div style={{ ...TYPE.bodySm, color: T.muted, padding: SP.lg, textAlign: "center" }}>No PRs on this project yet. Add one from Achievements/Goals → Pending PRs.</div>}
    </div>
  );
}
