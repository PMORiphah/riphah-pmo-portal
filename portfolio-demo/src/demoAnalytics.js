// Portfolio demo: anonymous usage counts. Stage 6 connects this to the analytics service; until then
// events wait in a queue that survives page reloads (role switches reload the page), kept in
// sessionStorage and mirrored on window.__DEMO_EVENTS__ for the automated checks.
const KEY = "cpp-demo-events";
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { return []; } };
const log = (window.__DEMO_EVENTS__ ||= load());
export function track(event, props = {}) {
  try {
    if (log.length >= 500) return;
    log.push({ event, props, at: Date.now() });
    sessionStorage.setItem(KEY, JSON.stringify(log));
  } catch { /* never break the page */ }
}
