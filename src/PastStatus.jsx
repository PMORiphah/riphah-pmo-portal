import { useState, useEffect } from "react";
import { ClipboardList, Hourglass, CheckCircle2 } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PAST PROJECTS — "Ask status" (PMO, 20 Oct 2026; docs/plans/status-requests.md)

   A request and the manager's answer are posts in the project's Follow-up
   thread (past_project_updates.kind), so unread badges, last_followed_up and
   the Activity Log keep working unchanged:
     status_request  pressed by the PMO or a past-project viewer
     status          the project's manager: % completed and a justification,
                     both required (the database refuses an answer without them)
   Rows from before the change carry no kind and are ordinary messages. The
   PMO's "Why still open" is not touched; the manager's figure sits beside it.
   Who may ask or answer is decided by RLS; the gates here are display only.
   ═══════════════════════════════════════════════════════════════════════════ */

export const kindOf = (m) => m?.kind || "message";
export const REQUEST_BODY = "Status requested";
export const MIN_WHY = 10;
const DAY = 86400000;

// Best-effort: the post is already saved; a mail problem must not look like a
// failed post. A bulk request sends every row id, so the manager gets one email.
export const notifyPast = (supa, session, kind, id) => {
  const ids = Array.isArray(id) ? id.filter(Boolean) : null;
  if (ids ? !ids.length : !id) return;
  supa("/functions/v1/notify-past", { method:"POST", body: JSON.stringify(ids ? { kind, ids } : { kind, id }) },
       session.access_token).catch(() => {});
};

const daysSince = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY)); };
export const askedAgo = (iso) => { const d = daysSince(iso); return d == null ? "" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
// How long the oldest request has waited, for the Awaiting status card ("oldest waiting 3 days").
export const waitedFor = (iso) => { const d = daysSince(iso); return d == null ? "" : d === 0 ? "asked today" : `oldest waiting ${d} day${d === 1 ? "" : "s"}`; };
const askedShort = (iso) => { const d = daysSince(iso); return d == null ? "" : d === 0 ? " today" : ` · ${d} day${d === 1 ? "" : "s"}`; };
export const shortDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year:"numeric" } : {}) });
};
// "Maj. A B" → "A": the button labels use a first name, and a title is not one.
export const firstName = (n) => {
  const parts = String(n || "").trim().split(/\s+/).filter(Boolean);
  const i = parts.findIndex(p => !/^(mr|mrs|ms|miss|dr|engr|prof|maj|col|brig|capt|lt|gen|syed|sardar)\.?$/i.test(p));
  return parts[i >= 0 ? i : 0] || "the manager";
};
const pctColor = (p) => Number(p) >= 100 ? DATA.positive : BRAND.blueBright;
// The asker's optional note is everything after the first line.
export const noteOf = (body) => {
  const lines = String(body || "").split("\n");
  return (lines[0].trim() === REQUEST_BODY ? lines.slice(1) : lines).join("\n").trim();
};

/* Requests answered by which answer, and the requests still waiting (those after
   the latest answer: the same rule as past_project_summary.status_pending_since). */
export function statusThread(msgs) {
  const answerOf = new Map();
  let open = [];
  for (const m of msgs || []) {
    const k = kindOf(m);
    if (k === "status_request") open.push(m);
    else if (k === "status") { open.forEach(r => answerOf.set(r.id, m)); open = []; }
  }
  return { answerOf, pending: open };
}


/* ── Small pieces: ring, chips, header tile ────────────────────────────── */
export function PctRing({ T, pct, size = 38, stroke = 4, color }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const c = color || pctColor(v);
  const r = (size - stroke) / 2, len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} aria-hidden="true" style={{ display:"block", flexShrink:0, transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.borderStrong} strokeWidth={stroke} />
      {v > 0 && (
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - (drawn ? v : 0) / 100)}
          style={{ transition:`stroke-dashoffset 720ms ${MOTION.ease}` }} />
      )}
    </svg>
  );
}

const chip = (T, c) => ({ ...TYPE.caption, fontWeight:700, padding:"1px 8px", borderRadius:R.pill,
  background:`${c}${T.badge}`, color:T.textOf(c), display:"inline-flex", alignItems:"center", gap:4,
  whiteSpace:"nowrap" });

// Amber "Status requested …" — on list rows (short) and the project header (long). The view names the
// asker of the LATEST request (status_requested_by), so the name goes with that request's date.
export function AskedChip({ T, row, short = false }) {
  if (!row?.status_pending_since) return null;
  const again = row.status_requested_at && daysSince(row.status_requested_at) !== daysSince(row.status_pending_since);
  const by = row.status_requested_by ? ` by ${row.status_requested_by}` : "";
  return (
    <span data-chip="status-asked" style={chip(T, DATA.warning)}
      title={(again ? `Status requested ${shortDate(row.status_pending_since)}; asked again ${shortDate(row.status_requested_at)}${by}`
                    : `Status requested ${shortDate(row.status_pending_since)}${by}`) + ". Waiting for the manager's answer."}>
      <Hourglass size={10} />
      {short ? `Status requested${askedShort(row.status_pending_since)}` : `Status requested ${askedAgo(row.status_pending_since)}`}
    </span>
  );
}

// The manager's latest % on a list row.
export function PctChip({ T, row }) {
  if (row?.status_pct == null) return null;
  const c = pctColor(row.status_pct);
  return (
    <span data-chip="status-pct" style={chip(T, c)}
      title={`${row.status_pct}% completed, reported by ${row.status_by || "the manager"} on ${shortDate(row.status_at)}`}>
      <span aria-hidden="true" style={{ width:20, height:4, borderRadius:R.pill, background:`${c}40`, overflow:"hidden" }}>
        <span style={{ display:"block", width:`${Math.min(100, row.status_pct)}%`, height:"100%", background:c }} />
      </span>
      {row.status_pct}% completed
    </span>
  );
}

// "% completed" among the project header's tiles.
export function StatusTile({ T, row, onClick }) {
  if (row?.status_pct == null) return null;
  const c = pctColor(row.status_pct);
  return (
    <button type="button" className="pmo-focusable pmo-btn" onClick={onClick} data-tile="status-pct"
      title={row.status_justification || undefined}
      style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:R.sm, background:T.card2,
        border:`1px solid ${c}55`, cursor: onClick ? "pointer" : "default", textAlign:"left", color:T.text,
        fontFamily:TYPE.body.fontFamily }}>
      <PctRing T={T} pct={row.status_pct} size={26} stroke={3.5} />
      <span>
        <span style={{ ...TYPE.label, color:T.dim, fontSize:8.5, display:"block" }}>% completed</span>
        <span style={{ fontSize:12.5, fontWeight:700, color:T.textOf(c) }}>{row.status_pct}%</span>
        <span style={{ ...TYPE.caption, fontSize:10, color:T.dim, marginLeft:6 }}>
          by {firstName(row.status_by)}, {shortDate(row.status_at)}
        </span>
      </span>
    </button>
  );
}

// The manager's latest answer, beside the PMO's "Why still open".
export function StatusBeside({ T, row }) {
  if (row?.status_pct == null) return null;
  const c = pctColor(row.status_pct);
  return (
    <div data-status="latest">
      <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>Status from the manager</div>
      <div style={{ display:"flex", gap:SP.md, alignItems:"flex-start", padding:"10px 13px", borderRadius:R.md,
        background:T.card2, borderLeft:`3px solid ${c}` }}>
        <PctRing T={T} pct={row.status_pct} size={40} stroke={4.5} />
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
            <span style={{ ...TYPE.metricSm, color:T.textOf(c) }}>{row.status_pct}%</span>
            <span style={{ ...TYPE.caption, color:T.dim }}>completed · {row.status_by || "Manager"}, {shortDate(row.status_at)}</span>
          </div>
          {row.status_justification && (
            <div style={{ fontSize:12.5, color:T.textSoft, lineHeight:1.55, marginTop:3, whiteSpace:"pre-wrap",
              overflowWrap:"anywhere", display:"-webkit-box", WebkitLineClamp:4, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
              {row.status_justification}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ── Thread cards ────────────────────────────────────────────────────────── */
export function StatusRequestCard({ T, m, at, answer, pmName }) {
  const note = noteOf(m.body);
  const open = !answer;
  const c = open ? DATA.warning : DATA.neutral;
  return (
    <div style={{ maxWidth:"82%", minWidth:0, padding:"10px 13px", borderRadius:R.md,
      background: open ? `${DATA.warning}12` : T.card2,
      border:`1px dashed ${open ? `${DATA.warning}99` : T.borderStrong}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, flexWrap:"wrap" }}>
        <ClipboardList size={13} color={T.textOf(c)} />
        <span style={{ ...TYPE.label, color:T.textOf(c) }}>Status requested</span>
        <span style={{ fontSize:11.5, fontWeight:700, color:T.text }}>{m.author_name || "Unknown"}</span>
        <span style={{ ...TYPE.caption, color:T.dim }}>{at}</span>
      </div>
      <div style={{ ...TYPE.caption, color:T.muted }}>
        {pmName ? `Asked of ${pmName}: ` : "Asked for: "}% completed and a justification
      </div>
      {note && (
        <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.6, whiteSpace:"pre-wrap", overflowWrap:"anywhere", marginTop:5 }}>
          {note}
        </div>
      )}
      <div style={{ marginTop:7 }}>
        {open ? (
          <span style={chip(T, DATA.warning)}>
            <span className="past-dot" style={{ width:6, height:6, borderRadius:3, background:DATA.warning }} /> Waiting
          </span>
        ) : (
          <span style={chip(T, DATA.positive)}>
            <CheckCircle2 size={10} /> Answered {shortDate(answer.created_at)}{answer.pct_complete != null ? ` · ${answer.pct_complete}%` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function StatusAnswerCard({ T, m, at }) {
  const pct = m.pct_complete;
  const c = pctColor(pct);
  return (
    <div style={{ maxWidth:"82%", minWidth:0, padding:"11px 13px", borderRadius:R.md,
      background:`${c}12`, border:`1px solid ${c}44`, borderLeft:`3px solid ${c}` }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6, flexWrap:"wrap" }}>
        <span style={{ ...TYPE.label, color:T.textOf(c) }}>Status</span>
        <span style={{ fontSize:11.5, fontWeight:700, color:T.text }}>{m.author_name || "Unknown"}</span>
        <span style={{ ...TYPE.caption, color:T.dim }}>{at}</span>
      </div>
      {pct != null && (
        <div style={{ display:"flex", alignItems:"center", gap:SP.md }}>
          <PctRing T={T} pct={pct} size={44} stroke={5} />
          <div>
            <div style={{ ...TYPE.metric, fontSize:26, color:T.textOf(c) }}>{pct}%</div>
            <div style={{ ...TYPE.caption, color:T.muted }}>completed</div>
          </div>
        </div>
      )}
      <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.6, whiteSpace:"pre-wrap", overflowWrap:"anywhere",
        marginTop: pct != null ? 8 : 0 }}>
        {m.justification || m.body}
      </div>
    </div>
  );
}


/* ── After the manager sends: a short note at the top of the Follow-up tab ──
   The window (AskStatusModal) and the manager's form (StatusAnswerForm) are in
   PastStatusForms.jsx, loaded only when one of them opens. ──────────────── */
// project id -> when this tab last sent its status (set by StatusAnswerForm).
export const justSent = new Map();

export function StatusSentNote({ T, row }) {
  const at = justSent.get(row.id);
  const [show, setShow] = useState(() => !!at && Date.now() - at < 15000);
  useEffect(() => { if (!show) return; const t = setTimeout(() => setShow(false), 8000); return () => clearTimeout(t); }, [show]);
  if (!show) return null;
  return (
    <div role="status" className="past-row" style={{ marginBottom:SP.lg, padding:"10px 13px", borderRadius:R.md,
      background:`${DATA.positive}14`, border:`1px solid ${DATA.positive}44`, fontSize:12.5,
      color:T.textOf(DATA.positive), display:"flex", alignItems:"center", gap:8 }}>
      <CheckCircle2 size={14} /> Status sent. It is in the thread below, and whoever asked is emailed.
    </div>
  );
}
