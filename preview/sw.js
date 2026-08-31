// ─────────────────────────────────────────────────────────────────────────────
//  PMO PORTAL — SERVICE WORKER (deliberately network-only)
// ─────────────────────────────────────────────────────────────────────────────
//  This worker caches NOTHING. It exists for one reason: Chrome and Edge will
//  only offer the "Install app" prompt for a site that registers a service
//  worker with a fetch handler. Without this file there is no install button
//  on Android at all.
//
//  Everything else about caching was left out on purpose. The portal reads
//  live figures from Supabase and the PMO explicitly did not want offline
//  access — stale project data on someone's phone is worse than an honest
//  connection error. Two useful consequences follow from caching nothing:
//
//   1. There is no way for a phone to get stuck serving an old bundle. The
//      usual PWA failure — you deploy a fix and users never receive it — is
//      structurally impossible here.
//   2. The deploy loop is unchanged. Push, wait for propagation, done. No
//      cache versioning, no skipWaiting dance, no update prompts.
//
//  skipWaiting + clients.claim mean a newly deployed worker takes over
//  immediately rather than waiting for every tab to close.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clear anything a previous version of this worker might have left behind,
  // so an earlier caching experiment can never keep serving stale assets.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only navigations are intercepted, and only to pass them straight to the
  // network. Leaving every other request untouched means the worker cannot
  // interfere with Supabase calls, range requests or anything else — it just
  // needs to exist for installability.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});
