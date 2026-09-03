// ─────────────────────────────────────────────────────────────────────────────
//  ADD TO HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
//  Two genuinely different situations, because the platforms differ:
//
//  Android / desktop Chrome fire `beforeinstallprompt`, which can be captured
//  and replayed from our own button. One tap and it installs.
//
//  iOS Safari has no such event. Apple exposes no API that lets a website
//  trigger Add to Home Screen — there is no permission to request and no
//  workaround. The user genuinely has to tap Share and then "Add to Home
//  Screen". Since most of the PMO is on iPhone, the best we can do is make
//  that manual path obvious and show it once, rather than pretend a button
//  could do it.
//
//  One trap worth knowing: on iOS, Add to Home Screen only exists in Safari.
//  In Chrome or Firefox for iOS the option simply is not in the share sheet,
//  so those users are told to reopen in Safari instead of being handed
//  instructions that would not work.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";

const DISMISS_KEY = "pmo-install-hint-dismissed";

// Standalone = already added to the home screen, so no prompt is needed.
// iOS reports it on navigator.standalone; everyone else via display-mode.
function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points disambiguate it.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge on iOS are all Safari underneath but do NOT offer
  // Add to Home Screen, so they need different advice.
  const iOSSafari = iOS && !/crios|fxios|edgios|opios/i.test(ua);
  return { iOS, iOSSafari };
}

export function InstallPrompt({ T }) {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [platform] = useState(detectPlatform);

  useEffect(() => {
    if (isStandalone()) return;                        // already installed
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;   // already dismissed
    } catch { /* private mode — just show it */ }

    // Android / desktop: capture the event so our own button can replay it.
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari never fires that event, so surface the manual hint instead —
    // after a short delay so it doesn't cover the login form on arrival.
    let timer;
    if (platform.iOS) {
      timer = setTimeout(() => setVisible(true), 2500);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [platform.iOS]);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  const gold = "#E0A94A";
  const sheet = {
    position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 3000,
    background: "rgba(10,20,40,0.94)",
    backdropFilter: "blur(18px) saturate(150%)",
    WebkitBackdropFilter: "blur(18px) saturate(150%)",
    border: "1px solid rgba(224,169,74,0.34)",
    borderRadius: 16, padding: "15px 16px 16px",
    boxShadow: "0 20px 60px -12px rgba(0,0,0,0.75)",
    color: "#fff", fontFamily: "'Inter',sans-serif",
    animation: "pmoRise .34s cubic-bezier(.16,1,.3,1)",
    maxWidth: 460, marginLeft: "auto", marginRight: "auto",
  };

  return (
    <div style={sheet} role="dialog" aria-label="Add PMO Portal to your home screen">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <img
          src={import.meta.env.BASE_URL + "icon-192.png"}
          alt=""
          style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                   border: "1px solid rgba(255,255,255,0.14)" }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2 }}>
            Add PMO Portal to your home screen
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.62)", marginTop: 3, lineHeight: 1.5 }}>
            Opens full screen with its own icon, like an app.
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                   fontSize: 20, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* Android / desktop: the real thing — one tap. */}
      {deferred && (
        <button
          onClick={install}
          style={{ marginTop: 13, width: "100%", padding: "11px 16px", borderRadius: 10,
                   border: "none", cursor: "pointer",
                   background: `linear-gradient(135deg, ${gold}, #C47818)`,
                   color: "#1A1206", fontSize: 14, fontWeight: 700,
                   fontFamily: "'Inter',sans-serif" }}
        >
          Install app
        </button>
      )}

      {/* iOS Safari: the manual steps, spelled out with the real Share glyph. */}
      {!deferred && platform.iOSSafari && (
        <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 9 }}>
          <Step n="1" T={T}>
            Tap <ShareGlyph /> <b style={{ color: "#fff" }}>Share</b> at the bottom of Safari
          </Step>
          <Step n="2" T={T}>
            Scroll down and tap <b style={{ color: "#fff" }}>Add to Home Screen</b>
          </Step>
        </div>
      )}

      {/* iOS but not Safari: Add to Home Screen isn't offered at all there. */}
      {!deferred && platform.iOS && !platform.iOSSafari && (
        <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.6,
                      color: "rgba(255,255,255,0.75)" }}>
          Open this page in <b style={{ color: "#fff" }}>Safari</b> to add it to your
          home screen — the option isn’t available in this browser on iPhone.
        </div>
      )}
    </div>
  );
}

function Step({ n, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10,
                  fontSize: 12.5, color: "rgba(255,255,255,0.72)", lineHeight: 1.45 }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                     background: "rgba(224,169,74,0.16)",
                     border: "1px solid rgba(224,169,74,0.44)",
                     color: "#E0A94A", fontSize: 11, fontWeight: 700,
                     display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

// iOS share glyph, drawn inline so the instruction matches what's actually
// on screen rather than describing it in words.
function ShareGlyph() {
  return (
    <svg width="13" height="16" viewBox="0 0 20 26" fill="none"
         style={{ verticalAlign: "-2px", margin: "0 1px" }} aria-hidden="true">
      <path d="M10 1.5v14" stroke="#4AA8FF" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M5.6 5.6 10 1.3l4.4 4.3" stroke="#4AA8FF" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 10H3a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 3 24h14a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17 10h-1.5"
            stroke="#4AA8FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
