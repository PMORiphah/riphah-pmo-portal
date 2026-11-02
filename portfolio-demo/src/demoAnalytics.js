// Portfolio demo: anonymous usage counts. Stage 6 connects this to the analytics service; until then
// events are only kept in memory (window.__DEMO_EVENTS__) for the automated checks.
const log = (window.__DEMO_EVENTS__ ||= []);
export function track(event, props = {}) {
  try { if (log.length < 500) log.push({ event, props, at: Date.now() }); } catch { /* never break the page */ }
}
