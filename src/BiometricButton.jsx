// ─────────────────────────────────────────────────────────────────────────────
//  BIOMETRIC SIGN-IN CONTROL (sidebar)
// ─────────────────────────────────────────────────────────────────────────────
//  Sits directly above "Change password". Hides itself entirely on devices
//  with no platform authenticator, rather than offering something that would
//  fail — a desktop with no Touch ID, or a browser without WebAuthn, simply
//  never sees it.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { Fingerprint, Check, X } from "lucide-react";
import { TYPE, R } from "./theme.js";
import {
  biometricAvailable, enrolBiometric, localCredentialId,
  listBiometricCredentials, removeBiometricCredential, forgetLocalCredential,
} from "./biometric.js";

// Apple users know it as Face ID / Touch ID; everyone else expects the
// generic wording. Matching the platform's own language avoids confusion.
function featureName() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|Macintosh/i.test(ua)) return "Face ID / Touch ID";
  if (/Android/i.test(ua)) return "Biometric unlock";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "Biometric sign-in";
}

export function BiometricButton({ T, session, mini }) {
  const [available, setAvailable] = useState(false);
  const [creds, setCreds] = useState(null);      // null = still loading
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);          // { kind, text }

  const refresh = async () => {
    if (!session?.access_token) return;
    try { setCreds(await listBiometricCredentials(session.access_token)); }
    catch { setCreds([]); }
  };

  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => { if (alive) setAvailable(ok); });
    refresh();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  if (!available || mini) return null;

  // Per device, not per account. PMO signs in from several devices, and a
  // laptop that never enrolled must not claim Face ID is active just because
  // the phone did.
  const localId  = localCredentialId();
  const mine     = Array.isArray(creds) ? creds.find((c) => c.credential_id === localId) : null;
  const enrolled = !!mine;
  const others   = Array.isArray(creds) ? creds.filter((c) => c.credential_id !== localId) : [];

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      await enrolBiometric(session.access_token);
      await refresh();
      setMsg({ kind: "ok", text: `${featureName()} is on for this device.` });
    } catch (e) {
      // A cancelled prompt is a normal user action, not an error worth alarming
      // anyone about.
      const text = e?.name + " " + e?.message;
      const cancelled = /NotAllowed|cancel|abort/i.test(text);
      // InvalidStateError means the authenticator already holds a credential
      // for this account — i.e. this device is set up, but the browser lost
      // its local record of which credential is its own.
      const already = /InvalidState/i.test(text);
      setMsg({
        kind: cancelled ? "info" : already ? "info" : "err",
        text: cancelled ? "Setup cancelled."
            : already  ? "This device is already set up. Sign out and use the biometric button to reconnect it."
            : (e.message || "Couldn't set that up."),
      });
    }
    setBusy(false);
  };

  // Turning it off here affects only this device. Wiping every device from
  // one phone would be a surprising amount of collateral damage.
  const disable = async () => {
    setBusy(true); setMsg(null);
    try {
      if (mine) await removeBiometricCredential(mine.id, session.access_token);
      forgetLocalCredential();
      await refresh();
      setMsg({ kind: "info", text: "Turned off for this device. Other devices are unchanged." });
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "Couldn't turn that off." });
    }
    setBusy(false);
  };

  // Revoking a different device — for a lost or replaced phone.
  const revoke = async (c) => {
    setBusy(true); setMsg(null);
    try {
      await removeBiometricCredential(c.id, session.access_token);
      await refresh();
      setMsg({ kind: "info", text: `Removed ${c.device_label || "that device"}.` });
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "Couldn't remove that device." });
    }
    setBusy(false);
  };

  const base = {
    width: "100%", marginTop: 11, padding: "8px 12px", borderRadius: R.sm,
    cursor: busy ? "default" : "pointer", fontSize: 11.5, fontWeight: 600,
    fontFamily: TYPE.body.fontFamily, display: "flex", alignItems: "center",
    justifyContent: "center", gap: 7, opacity: busy ? 0.6 : 1,
  };

  return (
    <div>
      {enrolled ? (
        <button onClick={disable} disabled={busy} className="pmo-focusable" style={{
          ...base,
          background: "rgba(45,212,191,0.10)",
          border: "1px solid rgba(45,212,191,0.42)",
          color: "#5EEAD4",
        }}>
          <Check size={12} /> {featureName()} is on
        </button>
      ) : (
        <button onClick={enable} disabled={busy} className="pmo-focusable" style={{
          ...base,
          background: T.sidebarHover,
          border: `1px solid ${T.sidebarBorder}`,
          color: T.sidebarFg,
        }}>
          <Fingerprint size={12} /> {busy ? "Setting up…" : `Enable ${featureName()}`}
        </button>
      )}

      {msg && (
        <div style={{
          marginTop: 6, fontSize: 10.5, lineHeight: 1.5, padding: "6px 9px",
          borderRadius: R.sm, display: "flex", alignItems: "flex-start", gap: 6,
          color: msg.kind === "err" ? "#FCA5A5"
               : msg.kind === "ok"  ? "#5EEAD4" : T.sidebarFg,
          background: msg.kind === "err" ? "rgba(248,113,113,0.10)"
                    : msg.kind === "ok"  ? "rgba(45,212,191,0.08)"
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

      {others.length > 0 && (
        <div style={{ marginTop: 7 }}>
          <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase",
                        color: T.sidebarFg, opacity: 0.45, marginBottom: 4 }}>
            Also on
          </div>
          {others.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6,
                                     fontSize: 10.5, color: T.sidebarFg, opacity: 0.75,
                                     padding: "2px 0" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.device_label || "Unknown device"}
              </span>
              <button onClick={() => revoke(c)} disabled={busy} title="Remove this device"
                style={{ background: "none", border: "none", cursor: "pointer",
                         color: "inherit", opacity: 0.6, padding: 0, display: "flex" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
