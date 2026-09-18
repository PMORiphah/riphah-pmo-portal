import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Monitor, Smartphone, Tablet, Clock, MousePointerClick,
         FolderOpen, MessageSquare, Filter, Download, Activity } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   SESSION DETAIL

   Opens from a `login` row in the Activity Log and shows what happened inside
   that visit: device, how long, and every page, project and assistant exchange
   in order.

   PMO only, enforced in the database rather than here — user_sessions and
   session_events are readable by is_pmo() alone, so this panel simply gets an
   empty list for anyone else rather than relying on the nav to hide it.
   ═══════════════════════════════════════════════════════════════════════════ */

// Taken from the nav definitions rather than guessed. An earlier version had
// "audit" and "settings"; the real ids are "log" and "set", so those two pages
// rendered as raw keys in the timeline.
const PAGE_NAMES = {
  cmd: "Capex Dashboard", proj: "Projects", camp: "Campus / Sites",
  perf: "Performance", risks: "Risk Register", cashflow: "Project Cashflows",
  schedule: "Timeline & Schedule", past: "Past Projects", upd: "Updates",
  photowall: "Gallery", team: "Team & About", users: "User Management",
  log: "Activity Log", set: "Settings",
};

const KIND = {
  page:    { Icon: MousePointerClick, tone: BRAND.blue,    label: "Opened" },
  project: { Icon: FolderOpen,        tone: BRAND.gold,    label: "Project" },
  chat:    { Icon: MessageSquare,     tone: DATA.positive, label: "Asked the assistant" },
  filter:  { Icon: Filter,            tone: DATA.info,     label: "Filtered" },
  export:  { Icon: Download,          tone: DATA.warning,  label: "Exported" },
  action:  { Icon: Activity,          tone: DATA.neutral,  label: "Did" },
};

const DEVICE = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

function duration(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m ${sec % 60}s`;
}

const clock = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export function SessionDetail({ T, session, supa, sessionId, onClose }) {
  const [data, setData]   = useState(null);
  const [events, setEvents] = useState([]);
  const [err, setErr]     = useState(null);
  const [projects, setProjects] = useState({});

  useEffect(() => {
    let alive = true;
    if (!sessionId) return;
    Promise.all([
      supa(`/rest/v1/session_summary?id=eq.${sessionId}&select=*`, {}, session.access_token),
      supa(`/rest/v1/session_events?session_id=eq.${sessionId}&select=*&order=at.asc&limit=1000`,
           {}, session.access_token),
    ]).then(([s, e]) => {
      if (!alive) return;
      setData(Array.isArray(s) ? s[0] : s);
      const evs = Array.isArray(e) ? e : [];
      setEvents(evs);
      // Resolve the project ids the trail recorded into names worth reading.
      const ids = [...new Set(evs.filter((x) => x.kind === "project" && x.label).map((x) => x.label))];
      if (ids.length) {
        supa(`/rest/v1/projects?id=in.(${ids.join(",")})&select=id,code,name`, {}, session.access_token)
          .then((rows) => {
            if (!alive || !Array.isArray(rows)) return;
            setProjects(Object.fromEntries(rows.map((r) => [r.id, r])));
          }).catch(() => {});
      }
    }).catch((x) => { if (alive) setErr(x.message); });
    return () => { alive = false; };
  }, [sessionId, supa, session]);

  const DeviceIcon = DEVICE[data?.device] || Monitor;
  const chats = events.filter((e) => e.kind === "chat");

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1350, background: "rgba(3,8,16,0.74)",
        backdropFilter: "blur(6px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: SP.xl, animation: "pmoFade .18s ease" }}>
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true"
        aria-label="Session detail"
        style={{ width: 720, maxWidth: "100%", maxHeight: "88vh", overflow: "auto",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.xl,
          boxShadow: T.shadowLg }}>

        {/* who and what */}
        <div style={{ position: "sticky", top: 0, zIndex: 2,
          padding: `${SP.lg}px ${SP.xl}px`, borderBottom: `1px solid ${T.border}`,
          background: `linear-gradient(140deg, ${T.surfaceRaised}, ${BRAND.blue}0F)`,
          display: "flex", alignItems: "flex-start", gap: SP.md }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPE.h3, color: T.text }}>
              {data?.full_name || data?.username || "Session"}
            </div>
            <div style={{ ...TYPE.caption, color: T.muted, marginTop: 3 }}>
              {data ? new Date(data.started_at).toLocaleString("en-GB", {
                dateStyle: "medium", timeStyle: "short" }) : ""}
              {data?.is_live && (
                <span style={{ marginLeft: 8, color: T.textOf(DATA.positive) }}>· still active</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="pmo-focusable" aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: SP.xl }}>
          {err && <div style={{ fontSize: 12.5, color: T.textOf(DATA.danger) }}>{err}</div>}

          {/* the facts of the visit */}
          <div style={{ display: "grid", gap: SP.sm, marginBottom: SP.lg,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {[
              { Icon: DeviceIcon, label: "Device",
                value: data ? `${data.device || "—"}` : "—",
                sub: data ? `${data.browser || ""} ${data.os ? "· " + data.os : ""}`.trim() : "" },
              { Icon: Clock, label: "Time in portal",
                value: duration(data?.duration_seconds), sub: data?.screen || "" },
              { Icon: Activity, label: "Actions", value: String(events.length),
                sub: `${chats.length} assistant question${chats.length === 1 ? "" : "s"}` },
            ].map((c, i) => (
              <div key={i} style={{ padding: `${SP.md}px ${SP.md}px`, borderRadius: R.md,
                background: T.card2, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <c.Icon size={12} color={T.muted} />
                  <span style={{ ...TYPE.label, color: T.muted }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text,
                  textTransform: c.label === "Device" ? "capitalize" : "none" }}>{c.value}</div>
                {c.sub && <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ ...TYPE.label, color: T.muted, marginBottom: SP.sm }}>
            What happened, in order
          </div>

          {events.length === 0 && (
            <div style={{ fontSize: 12.5, color: T.dim, padding: `${SP.md}px 0` }}>
              Nothing was recorded for this session. Sessions started before tracking
              was switched on will look like this.
            </div>
          )}

          <div style={{ position: "relative", paddingLeft: 18 }}>
            {events.length > 1 && (
              <div aria-hidden="true" style={{ position: "absolute", left: 5, top: 10, bottom: 10,
                width: 1, background: T.border }} />
            )}
            {events.map((e) => {
              const k = KIND[e.kind] || KIND.action;
              const proj = e.kind === "project" ? projects[e.label] : null;
              const answer = e.kind === "chat" ? e.meta?.answer : null;
              return (
                <div key={e.id} style={{ position: "relative", paddingBottom: SP.md }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: -17, top: 5,
                    width: 9, height: 9, borderRadius: "50%", background: k.tone,
                    boxShadow: `0 0 0 3px ${T.surface}` }} />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...TYPE.caption, color: T.dim, fontVariantNumeric: "tabular-nums" }}>
                      {clock(e.at)}
                    </span>
                    <span style={{ ...TYPE.label, color: T.textOf(k.tone) }}>{k.label}</span>
                    <span style={{ fontSize: 13, color: T.text }}>
                      {e.kind === "page"
                        ? (PAGE_NAMES[e.label] || e.label)
                        : e.kind === "project"
                          ? (proj ? `${proj.code && proj.code !== "-" ? proj.code + " · " : ""}${proj.name}`
                                  : "(project no longer exists)")
                          : e.label}
                    </span>
                  </div>
                  {answer && (
                    <div style={{ marginTop: 5, padding: `${SP.sm}px ${SP.md}px`,
                      borderRadius: R.sm, background: T.card2,
                      borderLeft: `2px solid ${k.tone}`, fontSize: 12.5,
                      color: T.textSoft, lineHeight: 1.55,
                      whiteSpace: "pre-wrap", maxHeight: 150, overflow: "auto" }}>
                      {String(answer).slice(0, 900)}
                      {String(answer).length > 900 ? "…" : ""}
                    </div>
                  )}
                  {e.kind === "chat" && e.meta?.error && (
                    <div style={{ marginTop: 5, ...TYPE.caption, color: T.textOf(DATA.warning) }}>
                      {e.meta.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
