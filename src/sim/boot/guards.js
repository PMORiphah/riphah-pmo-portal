// PMO Simulation: checks and helpers around what public/sim-boot.js set up.
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
  add("storage", () => !isNative(Storage.prototype.getItem) && !isNative(Storage.prototype.setItem)
    && !isNative(Storage.prototype.clear) && !isNative(Storage.prototype.key));
  add("channels", () => {
    if (!window.BroadcastChannel) return true;
    const c = new BroadcastChannel("selftest");
    const ok = c.name.indexOf("pmo-sim:") === 0;
    c.close();
    return ok;
  });
  add("clock", () => Math.abs(Date.now() - s.clock.now()) < 1000 && Date.now() >= s.clockStart - 1000
    && Date.now() < s.clockStart + 12 * 3600 * 1000);
  add("device", () => !("PushManager" in window) && !window.PublicKeyCredential && navigator.credentials === undefined
    && (!window.Notification || window.Notification.permission === "denied"));
  add("open", () => !isNative(window.open));
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

// Clears the simulation's own keys only ("pmo-sim:..."), and only while the namespacing is in
// place: with native storage methods, clear() would wipe the real portal's storage.
export function clearSimStorage() {
  if (isNative(Storage.prototype.clear)) return false;
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  return true;
}
