import { useState, useEffect, useRef, useCallback } from "react";
import { Radio, MessageSquare, FileText, Camera, Users, ArrowUpRight } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE ACTIVITY PULSE

   A quiet, continuously updating strip of real portfolio activity — stage
   progress, comments, PM assignments, document and site-visit uploads.
   Reads from portfolio_pulse, a view built specifically for this rather than
   the raw activity_log, which is ~90% account-management noise (verified
   directly: the last 25 rows the day this was built were entirely test-
   account churn) and generic "Project updated" entries carrying no further
   detail (their `details` column is null — there was nothing more specific
   to surface even if wanted).

   Polls rather than subscribing to Realtime — everything else in this portal
   already works this way, and a 25s interval is indistinguishable from "live"
   for a feed that updates a few times a day, not a few times a second.
   ═══════════════════════════════════════════════════════════════════════════ */

const POLL_MS = 25000;
const KIND_META = {
  stage:      { Icon: ArrowUpRight,   color: "gold" },
  comment:    { Icon: MessageSquare,  color: "blue" },
  assignment: { Icon: Users,          color: "blue" },
  document:   { Icon: FileText,       color: "muted" },
  sitevisit:  { Icon: Camera,         color: "teal" },
};

function relTime(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

// The view supplies raw data; this turns it into one readable line. Document
// and site-visit rows carry a literal filename ("PDD Lab Equipment RCR &
// AHS 9.6 M Raza sab.pdf") — real and correct, but too raw to lead with, so
// those lead with the action and tuck the filename in as a secondary detail.
function lineFor(row) {
  switch (row.kind) {
    case "stage":      return { verb: row.detail, sub: null };
    case "comment":     return { verb: "commented", sub: row.detail };
    case "assignment":  return { verb: row.detail || "assignment changed", sub: null };
    case "document":    return { verb: "uploaded a document", sub: row.detail };
    case "sitevisit":   return { verb: /\.(mp4|mov|webm)$/i.test(row.detail||"") ? "added a video" : "added a photo", sub: row.detail };
    default:            return { verb: "updated", sub: null };
  }
}

export function ActivityPulse({ T, session, supa }) {
  const [rows, setRows] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await supa(
        "/rest/v1/portfolio_pulse?select=kind,actor_name,project_id,project_name,detail,created_at&order=created_at.desc&limit=10",
        {}, session.access_token);
      if (!Array.isArray(data)) return;
      const withIds = data.map((r, i) => ({ ...r, _id: `${r.kind}:${r.project_id}:${r.created_at}:${i}` }));

      if (!firstLoad.current) {
        const fresh = new Set(withIds.filter(r => !seenIds.current.has(r._id)).map(r => r._id));
        if (fresh.size) {
          setFreshIds(fresh);
          setTimeout(() => setFreshIds(new Set()), 2600);
        }
      }
      withIds.forEach(r => seenIds.current.add(r._id));
      firstLoad.current = false;
      setRows(withIds);
    } catch (_) { /* a failed poll just tries again next interval */ }
  }, [supa, session]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div data-pulse-panel="1" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
      boxShadow: T.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8,
        padding: `${SP.sm}px ${SP.lg}px`, borderBottom: `1px solid ${T.border}` }}>
        <span className="pmo-live-dot" style={{ width: 6, height: 6, borderRadius: "50%",
          background: T.positive, flexShrink: 0 }} />
        <Radio size={12} color={T.muted} />
        <span style={{ ...TYPE.label, color: T.muted }}>Live Activity</span>
      </div>

      <div style={{ maxHeight: 280, overflowY: "auto" }} className="pmo-scroll">
        {rows === null ? (
          <div style={{ padding: SP.lg, ...TYPE.caption, color: T.dim }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: SP.lg, ...TYPE.caption, color: T.dim }}>No activity yet.</div>
        ) : rows.map((row) => {
          const meta = KIND_META[row.kind] || KIND_META.document;
          const { verb, sub } = lineFor(row);
          const isFresh = freshIds.has(row._id);
          const iconColor = meta.color === "gold" ? T.gold : meta.color === "teal" ? T.positive
            : meta.color === "blue" ? T.blueBright : T.dim;
          return (
            <div key={row._id} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "9px 16px", borderBottom: `1px solid ${T.border}`,
              background: isFresh ? `${T.blueBright}0F` : "transparent",
              transition: `background ${MOTION.base}`,
            }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${iconColor}1A`, marginTop: 1 }}>
                <meta.Icon size={11} color={iconColor} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPE.bodySm, color: T.text, lineHeight: 1.45 }}>
                  <strong style={{ fontWeight: 600 }}>{row.actor_name || "Someone"}</strong>
                  {" "}{verb}{" "}
                  <span data-peek={row.project_name} style={{ color: T.textSoft, fontWeight: 500,
                    display: "inline-block", maxWidth: 220, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>
                    {row.project_name}
                  </span>
                </div>
                {sub && (
                  <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
                )}
              </div>
              <span style={{ ...TYPE.caption, color: T.dim, flexShrink: 0, whiteSpace: "nowrap" }}>
                {relTime(row.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
