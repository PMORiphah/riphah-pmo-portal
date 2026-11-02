// Portfolio demo: anonymous usage counts, sent to PostHog Cloud (EU) as custom events.
//
// What is sent: the event name and its properties (below), a random visitor id kept in this browser
// (localStorage) and a random visit id (sessionStorage). No names, e-mails, typed text or uploaded
// files; no cookies; no PostHog library (so no autocapture, recordings or surveys); no person
// profiles; GeoIP lookup off. The project must also have "Discard client IP data" switched on.
// The referrer is reduced to its host name and the page address to its path.
//
// Events wait in a queue (sessionStorage, so a role-switch reload loses nothing), are sent in small
// batches, and the rest goes with navigator.sendBeacon when the page is hidden or closed. Without a
// project key (local test builds) nothing is sent; window.__DEMO_EVENTS__ keeps a copy for the checks.
/* global __POSTHOG_KEY__ */
export const ANALYTICS_HOST = "https://eu.i.posthog.com";
const KEY = typeof __POSTHOG_KEY__ === "string" ? __POSTHOG_KEY__ : "";
const Q = "cpp-demo-events", SENT = "cpp-demo-sent", VID = "cpp-demo-vid", SID = "cpp-demo-sid", SRC = "cpp-demo-src";
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

const visitor = safe(() => localStorage.getItem(VID)) || rid();
safe(() => localStorage.setItem(VID, visitor));
let session = safe(() => sessionStorage.getItem(SID));
const newVisit = !session;
if (!session) { session = rid(); safe(() => sessionStorage.setItem(SID, session)); }
const srcParam = safe(() => new URLSearchParams(location.search).get("src"));
if (srcParam) safe(() => sessionStorage.setItem(SRC, String(srcParam).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32)));
const src = safe(() => sessionStorage.getItem(SRC)) || "direct";

const log = (window.__DEMO_EVENTS__ ||= safe(() => JSON.parse(sessionStorage.getItem(SENT) || "[]"), []));
let queue = safe(() => JSON.parse(sessionStorage.getItem(Q) || "[]"), []);
const keep = () => { safe(() => sessionStorage.setItem(Q, JSON.stringify(queue.slice(-300)))); safe(() => sessionStorage.setItem(SENT, JSON.stringify(log.slice(-500)))); };
let context = { role: null };
/** Adds properties sent with every event (the current role). */
export const setContext = (c) => { context = { ...context, ...c }; };

const device = () => {
  const w = innerWidth, coarse = safe(() => matchMedia("(pointer: coarse)").matches, false);
  return w < 760 ? "phone" : coarse && w < 1100 ? "tablet" : "desktop";
};

export function track(event, props = {}) {
  try {
    const e = { event, timestamp: new Date(Date.now()).toISOString(), properties: { ...props, role: props.role ?? context.role } };
    // The demo's calendar is fixed (demoClock); the real time is what the reports need.
    if (window.__REAL_NOW__) e.timestamp = new Date(window.__REAL_NOW__()).toISOString();
    if (log.length < 500) log.push({ event, props: e.properties, at: e.timestamp });
    queue.push(e);
    keep();
    if (queue.length >= 15) flush();
  } catch { /* never break the page */ }
}

function payload(events) {
  return JSON.stringify({ api_key: KEY, batch: events.map((e) => ({
    event: e.event, timestamp: e.timestamp,
    properties: { ...e.properties, distinct_id: visitor, $session_id: session, $process_person_profile: false, $geoip_disable: true,
      $lib: "capital-projects-demo", $current_url: location.origin + location.pathname, src, device: device() },
  })) });
}
let sending = false;
export async function flush() {
  if (!KEY || !queue.length || sending) return;
  const batch = queue.slice(0, 50);
  sending = true;
  try {
    // text/plain keeps it a simple request (no preflight); PostHog reads the JSON body.
    const r = await fetch(`${ANALYTICS_HOST}/batch/`, { method: "POST", body: payload(batch), headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "omit" });
    if (r.ok) { queue = queue.slice(batch.length); keep(); }
  } catch { /* offline: the events wait for the next try */ }
  sending = false;
}
function beacon() {
  if (!KEY || !queue.length) return;
  const batch = queue.slice(0, 50);
  const ok = safe(() => navigator.sendBeacon(`${ANALYTICS_HOST}/batch/`, new Blob([payload(batch)], { type: "text/plain" })), false);
  if (ok) { queue = queue.slice(batch.length); keep(); }
}

/** Starts the visit: visit_start (once per tab), heartbeat every 30 s while visible, sending. */
export function startAnalytics() {
  if (newVisit) {
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { ref = ""; }
    track("visit_start", { visitor_new: !safe(() => localStorage.getItem(VID + "-seen")), referrer: ref || "none", src, device: device(),
      screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`, language: navigator.language || "" });
    safe(() => localStorage.setItem(VID + "-seen", "1"));
  }
  setInterval(() => { if (document.visibilityState === "visible") track("heartbeat", { seconds: 30 }); }, 30000);
  setInterval(flush, 10000);
  setTimeout(flush, 2500);
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") beacon(); });
  addEventListener("pagehide", beacon);
}
/** Sends what is waiting now (before a reset clears the page's storage). */
export const flushNow = () => beacon();
/** Before one of the demo's own reloads (role switch, Apply, reset): send the queue, then go on
 *  (after 1.5 s at most, so a slow network never holds the visitor up). */
export async function flushThen(next) {
  try {
    await Promise.race([(async () => { for (let i = 0; i < 4 && queue.length; i++) { const n = queue.length; await flush(); if (queue.length === n) break; } })(),
      new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* go on regardless */ }
  next();
}
export const analyticsOn = () => !!KEY;
