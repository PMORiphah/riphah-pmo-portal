import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Mail, Send, ExternalLink, X, ChevronRight } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND } from "./theme.js";
import { CountUp } from "./ui.jsx";
import { useNear } from "./presence.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PDD NOT SUBMITTED — start date under 20 days away

   Two variants sharing one row renderer. Both fire once per session, 5s
   after login — same timing and "full-screen modal, settle first" reasoning
   as the existing DeadlineAlertPopups, but a different shape: this is a
   count-then-list-then-act flow for PMO, and a direct list for PM, not a
   one-card-at-a-time carousel.
   ═══════════════════════════════════════════════════════════════════════════ */

const urgencyColor = (days) => days <= 5 ? "#E5484D" : days <= 12 ? "#E8A63C" : "#D8B04A";
const daysLabel = (d) => d === 0 ? "Starts today" : `Starts in ${d} day${d === 1 ? "" : "s"}`;
const titleOf = (p) => (p.code && p.code !== "-") ? `${p.code} — ${p.name}` : p.name;

function useFiveSecondFetch(session, supa, table, enabled, delayMs = 5000) {
  const [rows, setRows] = useState(null);
  const firedFor = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    if (firedFor.current === session?.access_token) return;
    firedFor.current = session?.access_token;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await supa(`/rest/v1/${table}?select=*&order=days_until_start.asc`, {}, session.access_token);
        if (!cancelled) setRows(Array.isArray(r) ? r : []);
      } catch { if (!cancelled) setRows([]); }
    }, delayMs);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session?.access_token, enabled]);
  return rows;
}

function ProjectRow({ T, p, index, showPM }) {
  const near = useNear();
  const color = urgencyColor(p.days_until_start);
  const critical = p.days_until_start <= 5;
  return (
    <div ref={near} className="pmo-near pmo-card-in" style={{
      "--near-light": `${color}18`,
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      borderRadius: R.md, border: `1px solid ${color}33`,
      background: `linear-gradient(90deg, ${color}12, transparent)`,
      marginBottom: 8, animationDelay: `${Math.min(index, 14) * 45}ms`,
    }}>
      {critical && (
        <span className="pmo-live-dot" style={{ width: 7, height: 7, borderRadius: "50%",
          background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
      )}
      {!critical && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, opacity: 0.7 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.bodySm, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titleOf(p)}
        </div>
        <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{p.campus || "—"}</span>
          <span>·</span>
          <span style={{ color, fontWeight: 700 }}>{daysLabel(p.days_until_start)}</span>
          {showPM && (
            <>
              <span>·</span>
              {p.pm_name
                ? <span>{p.pm_name}</span>
                : <span style={{ color: "#E5484D", fontWeight: 700 }}>Assign Project Manager first</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── PMO variant: count → expand → send email ── */
export function PddAlertPMO({ T, session, supa, blockingAlertActive, setBlockingAlertActive }) {
  const rows = useFiveSecondFetch(session, supa, "pdd_pending_projects", session?.role === "pmo", 7000);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const holdingLock = useRef(false);

  const readyToShow = !!rows && rows.length > 0 && !dismissed;
  useEffect(() => {
    // Only claims the lock once the deadline-alert system (which fires on
    // the same timer and gets first claim) isn't holding it — this data is
    // already fetched and just waits quietly until the floor is free.
    const showing = readyToShow && !blockingAlertActive;
    if (showing && !holdingLock.current) { holdingLock.current = true; setBlockingAlertActive?.(true); }
    else if (!readyToShow && holdingLock.current) { holdingLock.current = false; setBlockingAlertActive?.(false); }
  }, [readyToShow, blockingAlertActive]);

  if (!readyToShow || (blockingAlertActive && !holdingLock.current)) return null;
  const unassigned = rows.filter(p => !p.pm_name).length;

  const sendEmails = async () => {
    setSending(true); setResult(null);
    try {
      const data = await supa("/functions/v1/send-pdd-reminders",
        { method: "POST", body: JSON.stringify({}) }, session.access_token);
      setResult({ ok: true, pms: data.pms_emailed, projects: data.projects_covered, unassigned: data.unassigned_projects });
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    setSending(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1310,
      background: T.mode === "dark" ? "rgba(3,8,16,0.72)" : "rgba(12,30,51,0.42)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl,
      animation: "pmoFade .18s ease",
    }}>
      <div className="pmo-scale" role="dialog" aria-modal="true" style={{
        width: expanded ? 620 : 460, maxWidth: "100%", maxHeight: "86vh",
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
        boxShadow: T.shadowLg, overflow: "hidden", display: "flex", flexDirection: "column",
        transition: `width ${MOTION.base}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.md}px ${SP.xl}px`,
          background: `linear-gradient(90deg, #E5484D22, transparent)`,
          borderBottom: `1px solid #E5484D33`, flexShrink: 0,
        }}>
          <div style={{ width: 30, height: 30, borderRadius: R.sm, flexShrink: 0,
            background: "#E5484D1E", border: "1px solid #E5484D44",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={15} color="#E5484D" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPE.label, color: "#E5484D" }}>{rows.length === 1 ? "PDD" : "PDDs"} Pending Submission</div>
            <div style={{ ...TYPE.caption, color: T.muted, marginTop: 1 }}>Planned start date under 20 days away</div>
          </div>
          {expanded && (
            <button className="pmo-focusable" onClick={() => setDismissed(true)}
              style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", padding: 4 }}>
              <X size={16} />
            </button>
          )}
        </div>

        {!expanded ? (
          <div style={{ padding: `${SP.xxl}px ${SP.xl}px`, textAlign: "center" }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: "#E5484D", lineHeight: 1,
              textShadow: "0 0 28px #E5484D55", marginBottom: 8 }}>
              <CountUp value={rows.length} />
            </div>
            <div style={{ ...TYPE.bodySm, color: T.textSoft, marginBottom: 28 }}>
              project{rows.length === 1 ? "" : "s"} with a planned start date coming up in under 20 days {rows.length === 1 ? "is" : "are"} still missing {rows.length === 1 ? "a PDD" : "PDDs"}.
            </div>
            <div style={{ display: "flex", gap: SP.sm, justifyContent: "center" }}>
              <button className="pmo-focusable pmo-btn" onClick={() => setDismissed(true)}
                style={{ padding: "10px 18px", background: "none", border: `1px solid ${T.border}`, borderRadius: R.md,
                  color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: TYPE.body.fontFamily }}>Dismiss</button>
              <button className="pmo-focusable pmo-btn" onClick={() => setExpanded(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#185078",
                  border: "none", borderRadius: R.md, color: "#fff", fontWeight: 700, fontSize: 13,
                  fontFamily: TYPE.body.fontFamily, cursor: "pointer" }}>
                Show list <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: `${SP.md}px ${SP.xl}px 0`, overflow: "auto", flex: 1 }} className="pmo-scroll">
              {rows.map((p, i) => <ProjectRow key={p.id} T={T} p={p} index={i} showPM />)}
            </div>
            <div style={{ padding: `${SP.md}px ${SP.xl}px`, borderTop: `1px solid ${T.border}`, background: T.pageAlt, flexShrink: 0 }}>
              {result && (
                <div style={{ marginBottom: 10, padding: "9px 13px", borderRadius: R.md, ...TYPE.caption,
                  background: result.ok ? "rgba(45,212,191,0.1)" : "rgba(248,113,113,0.1)",
                  border: `1px solid ${result.ok ? "rgba(45,212,191,0.3)" : "rgba(248,113,113,0.3)"}`,
                  color: result.ok ? T.textOf(T.positive) : "#F87171" }}>
                  {result.ok
                    ? `Emailed ${result.pms} project manager${result.pms === 1 ? "" : "s"}, covering ${result.projects} project${result.projects === 1 ? "" : "s"}.${result.unassigned ? ` ${result.unassigned} project${result.unassigned === 1 ? "" : "s"} skipped — no PM assigned.` : ""}`
                    : result.msg}
                </div>
              )}
              <div style={{ display: "flex", gap: SP.sm, justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...TYPE.caption, color: T.dim }}>
                  {unassigned > 0 ? `${unassigned} of ${rows.length} have no PM assigned` : "All projects have an assigned PM"}
                </span>
                <button className="pmo-focusable pmo-btn" onClick={sendEmails} disabled={sending || unassigned === rows.length}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px",
                    background: sending ? T.muted : "#185078", border: "none", borderRadius: R.md, color: "#fff",
                    fontWeight: 700, fontSize: 13, fontFamily: TYPE.body.fontFamily,
                    cursor: sending ? "default" : "pointer", opacity: unassigned === rows.length ? 0.5 : 1 }}>
                  <Mail size={14} /> {sending ? "Sending…" : "Send email to project managers"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── PM variant: direct list + submit link ── */
export function PddAlertPM({ T, session, supa, blockingAlertActive, setBlockingAlertActive }) {
  const rows = useFiveSecondFetch(session, supa, "pdd_pending_projects", session?.role === "project_manager", 7000);
  const [dismissed, setDismissed] = useState(false);
  const holdingLock = useRef(false);

  const readyToShow = !!rows && rows.length > 0 && !dismissed;
  useEffect(() => {
    const showing = readyToShow && !blockingAlertActive;
    if (showing && !holdingLock.current) { holdingLock.current = true; setBlockingAlertActive?.(true); }
    else if (!readyToShow && holdingLock.current) { holdingLock.current = false; setBlockingAlertActive?.(false); }
  }, [readyToShow, blockingAlertActive]);

  if (!readyToShow || (blockingAlertActive && !holdingLock.current)) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1310,
      background: T.mode === "dark" ? "rgba(3,8,16,0.72)" : "rgba(12,30,51,0.42)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: SP.xl,
      animation: "pmoFade .18s ease",
    }}>
      <div className="pmo-scale" role="dialog" aria-modal="true" style={{
        width: 560, maxWidth: "100%", maxHeight: "86vh",
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
        boxShadow: T.shadowLg, overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.md}px ${SP.xl}px`,
          background: `linear-gradient(90deg, #E5484D22, transparent)`,
          borderBottom: "1px solid #E5484D33", flexShrink: 0,
        }}>
          <div style={{ width: 30, height: 30, borderRadius: R.sm, flexShrink: 0,
            background: "#E5484D1E", border: "1px solid #E5484D44",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={15} color="#E5484D" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPE.label, color: "#E5484D" }}>{rows.length === 1 ? "PDD" : "PDDs"} Submission Needed</div>
            <div style={{ ...TYPE.caption, color: T.muted, marginTop: 1 }}>
              {rows.length} of your project{rows.length === 1 ? "" : "s"} start{rows.length === 1 ? "s" : ""} within 20 days
            </div>
          </div>
        </div>

        <div style={{ padding: `${SP.md}px ${SP.xl}px 0`, ...TYPE.bodySm, color: T.textSoft, lineHeight: 1.55 }}>
          Please submit the {rows.length === 1 ? "PDD" : "PDDs"} for the project{rows.length === 1 ? "" : "s"} below as soon as possible, so the planned start date isn't put at risk.
        </div>

        <div style={{ padding: `${SP.md}px ${SP.xl}px`, overflow: "auto", flex: 1 }} className="pmo-scroll">
          {rows.map((p, i) => <ProjectRow key={p.id} T={T} p={p} index={i} showPM={false} />)}
        </div>

        <div style={{ padding: `${SP.md}px ${SP.xl}px`, borderTop: `1px solid ${T.border}`, background: T.pageAlt,
          display: "flex", gap: SP.sm, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="pmo-focusable pmo-btn" onClick={() => setDismissed(true)}
            style={{ padding: "10px 18px", background: "none", border: `1px solid ${T.border}`, borderRadius: R.md,
              color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: TYPE.body.fontFamily }}>Dismiss</button>
          <a href="https://pmo.riphah.edu.pk/login" target="_blank" rel="noopener noreferrer"
            className="pmo-focusable pmo-btn" style={{ display: "flex", alignItems: "center", gap: 7,
              padding: "10px 20px", background: `linear-gradient(135deg, ${BRAND.gold}, #C47818)`,
              border: "none", borderRadius: R.md, color: "#1A1206", fontWeight: 700, fontSize: 13,
              fontFamily: TYPE.body.fontFamily, cursor: "pointer", textDecoration: "none" }}>
            <Send size={13} /> Submit {rows.length === 1 ? "PDD" : "PDDs"} <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
