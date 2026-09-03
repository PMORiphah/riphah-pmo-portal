// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION CONTROL (sidebar)
// ─────────────────────────────────────────────────────────────────────────────
//  Sits alongside the biometric control. The interesting case is iPhone: push
//  only works once the portal has been added to the home screen, so rather
//  than showing a button that would fail, this explains what to do first.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { Bell, BellOff, Check, X } from "lucide-react";
import { TYPE, R } from "./theme.js";
import { pushStatus, enablePush, disablePush, sendTestPush } from "./push.js";

export function NotificationButton({ T, session, mini }) {
  const [status, setStatus] = useState(null);   // null = still checking
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refresh = async () => setStatus(await pushStatus());

  useEffect(() => { refresh(); }, []);

  if (mini || !status) return null;

  const base = {
    width: "100%", marginTop: 9, padding: "8px 12px", borderRadius: R.sm,
    cursor: busy ? "default" : "pointer", fontSize: 11.5, fontWeight: 600,
    fontFamily: TYPE.body.fontFamily, display: "flex", alignItems: "center",
    justifyContent: "center", gap: 7, opacity: busy ? 0.6 : 1,
  };
  const note = {
    marginTop: 6, fontSize: 10, lineHeight: 1.55, padding: "7px 9px",
    borderRadius: R.sm, color: T.sidebarFg, opacity: 0.75,
    background: "rgba(255,255,255,0.05)",
  };

  // iPhone in a Safari tab: push simply isn't available until installed.
  if (!status.supported) {
    if (status.reason === "ios-not-installed") {
      return (
        <div style={note}>
          <b style={{ opacity: 1 }}>Notifications on iPhone</b><br />
          Add the portal to your home screen first (Share → Add to Home Screen),
          then open it from there to switch alerts on.
        </div>
      );
    }
    return null;   // desktop browser with no push support — say nothing
  }

  if (status.permission === "denied") {
    return (
      <div style={note}>
        <b style={{ opacity: 1 }}>Notifications blocked</b><br />
        Allow notifications for this site in your browser or device settings,
        then reopen the portal.
      </div>
    );
  }

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      await enablePush(session.access_token, session.user_id);
      await refresh();
      // Prove it actually works rather than just claiming success.
      try {
        await sendTestPush(session.access_token);
        setMsg({ kind: "ok", text: "On — a test notification is on its way." });
      } catch {
        setMsg({ kind: "ok", text: "Notifications are on for this device." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "Couldn't turn notifications on." });
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true); setMsg(null);
    try {
      await disablePush(session.access_token);
      await refresh();
      setMsg({ kind: "info", text: "Notifications off for this device." });
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "Couldn't turn notifications off." });
    }
    setBusy(false);
  };

  return (
    <div>
      {status.subscribed ? (
        <button onClick={disable} disabled={busy} className="pmo-focusable" style={{
          ...base,
          background: "rgba(45,212,191,0.10)",
          border: "1px solid rgba(45,212,191,0.42)",
          color: "#5EEAD4",
        }}>
          <Check size={12} /> Notifications are on
        </button>
      ) : (
        <button onClick={enable} disabled={busy} className="pmo-focusable" style={{
          ...base,
          background: T.sidebarHover,
          border: `1px solid ${T.sidebarBorder}`,
          color: T.sidebarFg,
        }}>
          <Bell size={12} /> {busy ? "Turning on…" : "Enable notifications"}
        </button>
      )}

      {msg && (
        <div style={{
          marginTop: 6, fontSize: 10.5, lineHeight: 1.5, padding: "6px 9px",
          borderRadius: R.sm, display: "flex", alignItems: "flex-start", gap: 6,
          color: msg.kind === "err" ? "#FCA5A5" : msg.kind === "ok" ? "#5EEAD4" : T.sidebarFg,
          background: msg.kind === "err" ? "rgba(248,113,113,0.10)"
                    : msg.kind === "ok" ? "rgba(45,212,191,0.08)"
                    : "rgba(255,255,255,0.05)",
        }}>
          <span style={{ flex: 1 }}>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss"
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: "inherit", opacity: 0.7, padding: 0, display: "flex" }}>
            <X size={11} />
          </button>
        </div>
      )}

      {status.subscribed && !msg && (
        <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.5, color: T.sidebarFg, opacity: 0.55 }}>
          Deadline and comment alerts arrive on this device.
        </div>
      )}
    </div>
  );
}
