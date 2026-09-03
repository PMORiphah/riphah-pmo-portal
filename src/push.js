// ─────────────────────────────────────────────────────────────────────────────
//  PUSH NOTIFICATIONS (client side)
// ─────────────────────────────────────────────────────────────────────────────
//  Subscribes this device to Web Push and records the subscription so the
//  server can reach it. Two platform facts drive the shape of this:
//
//   * iOS only allows push for a PWA that has been added to the home screen.
//     In a Safari tab the API is either missing or silently useless, so the
//     UI checks for standalone mode and explains rather than failing.
//   * Permission must be requested from a real user gesture, so it is only
//     ever asked for behind a button press — never automatically on load.
// ─────────────────────────────────────────────────────────────────────────────

const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";

// Public by design — this is what identifies our server to Apple/Google's
// push services. The private half never leaves the edge function.
const VAPID_PUBLIC = "BCQkMR8K6Db4gnOs3A4hJlI300qjqnc5ULQgCW4jPvxaC8B6LGVZn9PeB-ZQS-TX1iqRlbdfK5nqV3ghkPvJQPo";

const urlBase64ToUint8Array = (b64) => {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    .replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const bufToB64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function isStandalonePWA() {
  return window.matchMedia?.("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// What this device can do right now, so the UI can explain rather than fail.
export async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // On iOS this is the tell-tale of a Safari tab rather than an installed app.
    return { supported: false, reason: isIOS() && !isStandalonePWA() ? "ios-not-installed" : "unsupported" };
  }
  if (isIOS() && !isStandalonePWA()) {
    return { supported: false, reason: "ios-not-installed" };
  }
  const permission = Notification.permission;   // default | granted | denied
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    subscribed = !!(await reg.pushManager.getSubscription());
  } catch { /* treat as not subscribed */ }
  return { supported: true, permission, subscribed };
}

export async function enablePush(accessToken, userId) {
  const reg = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked for this site in your browser settings."
      : "Notifications weren't enabled.");
  }

  // Reuse an existing subscription if the browser already has one; creating a
  // second would orphan the first.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,          // required; iOS revokes silent-push subs
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const raw = sub.toJSON();
  const ua = navigator.userAgent || "";
  const label = /iPad/i.test(ua) ? "iPad" : /iPhone/i.test(ua) ? "iPhone"
              : /Android/i.test(ua) ? "Android phone"
              : /Macintosh/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows PC" : "This device";

  // on_conflict=endpoint is required for merge-duplicates to target the unique
  // endpoint rather than the primary key — without it, re-enabling on the same
  // device collides instead of updating.
  const res = await fetch(
    SUPA_URL + "/rest/v1/push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      // Sent explicitly as well as defaulted server-side: the column default
      // covers it, but being explicit keeps the intent obvious and works even
      // if the row is ever inserted through another path.
      user_id: userId,
      endpoint: raw.endpoint,
      p256dh: raw.keys?.p256dh ?? bufToB64url(sub.getKey("p256dh")),
      auth:   raw.keys?.auth   ?? bufToB64url(sub.getKey("auth")),
      device_label: label,
    }),
  });

  if (!res.ok) {
    // Surface what actually went wrong rather than a generic message — the
    // first version of this swallowed a NOT NULL violation and just said
    // "couldn't save", which gave nothing to act on.
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message || body?.hint || body?.details || "";
    } catch { /* non-JSON error body */ }
    throw new Error(
      detail ? `Couldn't save this device: ${detail}`
             : `Couldn't save this device for notifications (${res.status}).`
    );
  }
  return true;
}

export async function disablePush(accessToken) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch(
      SUPA_URL + "/rest/v1/push_subscriptions?endpoint=eq." + encodeURIComponent(sub.endpoint),
      { method: "DELETE", headers: { apikey: SUPA_KEY, Authorization: "Bearer " + accessToken } }
    ).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return true;
}

// Round-trips a real push so the user gets proof it works, rather than a
// toggle that claims success and stays silent.
export async function sendTestPush(accessToken) {
  const res = await fetch(SUPA_URL + "/functions/v1/send-push", {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "test" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Test notification failed.");
  return data;
}
