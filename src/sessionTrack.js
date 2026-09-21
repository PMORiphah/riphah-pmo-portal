/* ═══════════════════════════════════════════════════════════════════════════
   SESSION TRACKING

   Records a sign-in and what happened inside it, for the Activity Log.

   Everything here is best-effort and silent. Tracking must never break the
   thing it is watching, so every call is fire-and-forget: a failed write is
   swallowed, and nothing the user does waits on it.

   Duration comes from a heartbeat rather than a close event. beforeunload is
   unreliable — it does not fire on a killed tab, a lost connection, or iOS
   swiping the app away — so a session that stops reporting is simply one whose
   last_seen_at stops advancing, and the summary view treats anything quiet for
   three minutes as finished.
   ═══════════════════════════════════════════════════════════════════════════ */

const HEARTBEAT_MS = 60_000;
const FLUSH_MS     = 4_000;      // batch bursts of navigation into one request

let sessionId = null;
let queue = [];
let flushTimer = null;
let beat = null;
let supaRef = null;
let tokenRef = null;

/** Coarse device facts. Deliberately not a fingerprint. */
function readDevice() {
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPod/i.test(ua);
  const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const browser =
    /Edg\//.test(ua)      ? "Edge" :
    /OPR\//.test(ua)      ? "Opera" :
    /Chrome\//.test(ua)   ? "Chrome" :
    /Firefox\//.test(ua)  ? "Firefox" :
    /Safari\//.test(ua)   ? "Safari" : "Other";
  const os =
    /Windows NT/.test(ua)        ? "Windows" :
    /Android/.test(ua)           ? "Android" :
    /iPhone|iPad|iPod/.test(ua)  ? "iOS" :
    /Mac OS X/.test(ua)          ? "macOS" :
    /Linux/.test(ua)             ? "Linux" : "Other";
  return {
    device: tablet ? "tablet" : mobile ? "mobile" : "desktop",
    browser, os,
    user_agent: ua.slice(0, 400),
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
  };
}

const post = (path, body, prefer = "return=minimal") =>
  supaRef?.(path, {
    method: "POST", body: JSON.stringify(body), headers: { Prefer: prefer },
  }, tokenRef).catch(() => {});

// Writing goes through security-definer RPCs, not straight at the tables. A
// direct insert with return=representation needs the SELECT policy to pass too,
// and reading sessions is PMO-only — so every non-PMO sign-in failed with 42501
// until this moved behind a function.
const rpc = (fn, args) =>
  supaRef?.(`/rest/v1/rpc/${fn}`, {
    method: "POST", body: JSON.stringify(args),
  }, tokenRef).catch(() => null);

async function flush() {
  flushTimer = null;
  if (!sessionId || !queue.length) return;
  const batch = queue.splice(0, queue.length);
  await rpc("session_log", { p_session: sessionId, p_events: batch });
}

const scheduleFlush = () => {
  if (flushTimer || !queue.length) return;
  flushTimer = setTimeout(flush, FLUSH_MS);
};

/** Record one thing the user did. Safe to call before the session exists. */
export function track(kind, label, meta) {
  if (!supaRef) return;
  queue.push({ kind, label: label ? String(label).slice(0, 300) : null,
               meta: meta ?? null, at: new Date().toISOString() });
  if (queue.length >= 25) flush(); else scheduleFlush();
}

/** Called when the access token is renewed, so tracking keeps working. */
export function setTrackToken(t) { if (t) tokenRef = t; }

/** Called once after sign-in. */
export async function startSession(supa, session) {
  if (sessionId || !session?.user_id) return null;
  supaRef = supa; tokenRef = session.access_token;
  const d = readDevice();
  try {
    const id = await rpc("session_start", {
      p_username: session.username,
      p_full_name: session.full_name || session.username,
      p_role: session.role,
      p_device: d.device, p_browser: d.browser, p_os: d.os,
      p_user_agent: d.user_agent, p_screen: d.screen,
    });
    sessionId = typeof id === "string" ? id : id?.[0] ?? null;
  } catch { return null; }
  if (!sessionId) return null;

  // The login itself goes in activity_log so it appears in the existing list
  // beside every other event, carrying the session id for the detail view.
  post("/rest/v1/activity_log", {
    actor_id: session.user_id,
    actor_name: session.full_name || session.username,
    actor_role: session.role,
    action: "login",
    entity_type: "session",
    entity_id: sessionId,
    summary: `${session.full_name || session.username} signed in on ${d.device}`,
    details: { session_id: sessionId, device: d.device, browser: d.browser, os: d.os },
  });

  beat = setInterval(() => {
    // Only while the tab is actually in front, so a forgotten background tab
    // does not inflate somebody's time on the portal.
    if (document.visibilityState !== "visible") return;
    rpc("session_touch", { p_session: sessionId });
  }, HEARTBEAT_MS);

  // Best-effort close. Often does not fire; the heartbeat is what actually
  // decides when a session ended.
  // Flush queued events on the way out. No attempt to mark the session ended
  // here: sendBeacon cannot send a PATCH, and pagehide is unreliable anyway.
  // The heartbeat going quiet is what actually ends a session.
  const bye = () => { if (queue.length) flush(); };
  window.addEventListener("pagehide", bye);
  window.addEventListener("beforeunload", bye);
  return sessionId;
}

/** Called on explicit sign-out, where we genuinely know the session ended. */
export async function endSession() {
  if (!sessionId) return;
  await flush();
  const id = sessionId;
  sessionId = null;
  if (beat) { clearInterval(beat); beat = null; }
  await rpc("session_end", { p_session: id });
}

export const getSessionId = () => sessionId;
