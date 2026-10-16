// PMO Simulation: checks and helpers around what public/sim-boot.js set up. Owner: B2.
// selfTest() is what start() runs before anything loads, and what the Begin screen can show.

const isNative = (f) => typeof f === "function" && /\[native code\]/.test(Function.prototype.toString.call(f));

export const sim = () => window.__PMO_SIM__;

export function selfTest() {
  const s = sim();
  const checks = [];
  const add = (name, fn) => {
    let ok = false;
    try { ok = !!fn(); } catch { ok = false; }
    checks.push({ name, ok });
  };
  add("boot", () => s && s.ok === true && Object.isFrozen(s));
  add("csp", () => {
    const m = document.head && document.head.firstElementChild;
    return m && m.tagName === "META" && /^content-security-policy$/i.test(m.getAttribute("http-equiv") || "")
      && m.getAttribute("content") === s.csp && /connect-src 'self'/.test(s.csp) && /script-src 'self'/.test(s.csp)
      && !/https?:|\*/.test(s.csp);
  });
  // Storage lives in memory: what the page writes never reaches the browser's own storage.
  add("storage", () => {
    const st = s.storage;
    if (!st || st.kind !== "memory" || !st.isMemory(window.localStorage) || !st.isMemory(window.sessionStorage)) return false;
    const before = st.nativeCount();
    const k = "__pmo_sim_selftest";
    localStorage.setItem(k, "1");
    sessionStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1" && sessionStorage.getItem(k) === "1" && !st.nativeHas(k);
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
    const after = st.nativeCount();
    return ok && before.local === after.local && before.session === after.session && localStorage.getItem(k) === null;
  });
  add("channels", () => {
    if (!window.BroadcastChannel) return true;
    const c = new BroadcastChannel("selftest");
    const ok = c.name.indexOf("pmo-sim:") === 0;
    c.close();
    return ok;
  });
  // Real time (no pinned clock): Date is the browser's own and agrees with the monotonic clock.
  // (A laptop that slept since this page loaded could drift; the page is opened just before this check.)
  add("clock", () => isNative(Date) && isNative(Date.now) && s.clock && typeof s.clock.now === "function"
    && Math.abs(Date.now() - (performance.timeOrigin + performance.now())) < 2000
    && Math.abs(Date.now() - s.clock.now()) < 1000);
  add("device", () => !("PushManager" in window) && !window.PublicKeyCredential && navigator.credentials === undefined
    && (!window.Notification || window.Notification.permission === "denied"));
  add("open", () => !isNative(window.open));
  add("print", () => !isNative(window.print));
  add("speech", () => !window.SpeechSynthesis || !isNative(SpeechSynthesis.prototype.speak));
  add("exports", () => typeof window.saveAs === "function");
  add("fonts", () => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter";
    document.createDocumentFragment().appendChild(l);
    return l.getAttribute("href") === s.base + "sim/fonts/fonts.css"
      && !document.querySelector('link[href*="fonts.googleapis"],link[href*="fonts.gstatic"]');
  });
  add("top", () => window.top === window);
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  return { ok: failed.length === 0, checks, failed };
}

export const toast = (msg) => sim()?.guard?.toast(msg);

// Clears the simulation's in-memory storage. Only while the memory storage is in place: with the
// browser's own storage, clear() would wipe the real portal's keys.
export function clearSimStorage() {
  const st = sim()?.storage;
  if (!st || !st.isMemory(window.localStorage) || !st.isMemory(window.sessionStorage)) return false;
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  return true;
}
