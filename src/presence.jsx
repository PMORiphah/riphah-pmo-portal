import { useState, useEffect, useRef, useCallback, useContext, createContext, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PRESENCE — the awareness layer
   ═══════════════════════════════════════════════════════════════════════════

   Measured problem this solves: with the pointer moving over the dashboard,
   exactly ONE element out of 380 was in a reacting state. The interface
   responded but had no idea where you were — every element an island, aware
   only of its own hover.

   This publishes the pointer's position, velocity, idle state and dwell target
   ONCE, globally, as CSS custom properties on <html>. Anything that wants to
   respond reads them in CSS and never triggers a React render. That is what
   makes it affordable to have the whole page aware of you rather than one card.

   Everything is coalesced to one write per animation frame.
   ═══════════════════════════════════════════════════════════════════════════ */

const IDLE_AFTER = 12000;   // ms of no movement before the interface quietens
const DWELL_AFTER = 460;    // ms resting near something before it deepens

export function usePresence({ enabled = true } = {}) {
  const raf = useRef(null);
  const last = useRef({ x: 0, y: 0, t: 0 });
  const idleTimer = useRef(null);
  const dwellTimer = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);

    // Start centred so the first frame is not a jump from the corner.
    set("--px", "50%"); set("--py", "40%");
    set("--pvx", "0"); set("--pvy", "0"); set("--pspeed", "0");
    set("--idle", "0"); set("--dwell", "0");

    const onMove = (e) => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        const now = performance.now();
        const dt = Math.max(1, now - last.current.t);
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        const speed = Math.min(1, Math.hypot(dx, dy) / dt * 30);

        set("--px", `${(e.clientX / window.innerWidth) * 100}%`);
        set("--py", `${(e.clientY / window.innerHeight) * 100}%`);
        // Velocity is used to look AHEAD of the pointer (§7 anticipation):
        // surfaces begin responding to where you are going, not where you are.
        set("--pvx", (dx / dt * 12).toFixed(2));
        set("--pvy", (dy / dt * 12).toFixed(2));
        set("--pspeed", speed.toFixed(3));

        last.current = { x: e.clientX, y: e.clientY, t: now };
        root.dataset.idle = "0";
        set("--idle", "0");
        set("--dwell", "0");

        clearTimeout(idleTimer.current);
        clearTimeout(dwellTimer.current);
        // Coming to a stop near something is a signal of interest, distinct
        // from passing over it (§8).
        dwellTimer.current = setTimeout(() => set("--dwell", "1"), DWELL_AFTER);
        idleTimer.current = setTimeout(() => {
          root.dataset.idle = "1";
          set("--idle", "1");
          set("--pspeed", "0");
        }, IDLE_AFTER);
      });
    };

    const onLeave = () => { set("--dwell", "0"); set("--pspeed", "0"); };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    idleTimer.current = setTimeout(() => { root.dataset.idle = "1"; set("--idle", "1"); }, IDLE_AFTER);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      clearTimeout(idleTimer.current);
      clearTimeout(dwellTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [enabled]);
}

/* ───────────────────────────────────────────────────────────────────────────
   PROXIMITY (§1) + ANTICIPATION (§7) + DWELL (§8)

   Elements register themselves and receive a --near value from 0 to 1 based on
   how close the pointer is — so a card begins waking BEFORE the cursor reaches
   it, and wakes earlier still on the side you are travelling toward.

   Distance is computed only for registered elements (roughly twenty on the
   dashboard, not 380), rects are cached and only re-measured on scroll or
   resize, and the whole pass is one rAF. Writing a custom property does not
   invalidate layout, so this stays cheap.
   ─────────────────────────────────────────────────────────────────────────── */

const REG = new Set();
let proxRaf = null;
let rectCache = new WeakMap();
let cacheStamp = 0;

function measure(el) {
  const hit = rectCache.get(el);
  if (hit && hit.stamp === cacheStamp) return hit.r;
  const r = el.getBoundingClientRect();
  rectCache.set(el, { r, stamp: cacheStamp });
  return r;
}

function proximityPass(x, y, vx, vy) {
  // Look ahead along the direction of travel. Capped so a fast flick across the
  // screen does not light up something on the far side.
  const ax = x + Math.max(-160, Math.min(160, vx * 9));
  const ay = y + Math.max(-160, Math.min(160, vy * 9));

  REG.forEach((el) => {
    if (!el.isConnected) { REG.delete(el); return; }
    const r = measure(el);
    if (r.width === 0) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Distance to the element's edge, not its centre, so a wide card is not
    // penalised for being wide.
    const dx = Math.max(0, Math.abs(ax - cx) - r.width / 2);
    const dy = Math.max(0, Math.abs(ay - cy) - r.height / 2);
    const dist = Math.hypot(dx, dy);
    const RANGE = 190;
    const near = dist > RANGE ? 0 : Math.pow(1 - dist / RANGE, 1.7);
    el.style.setProperty("--near", near.toFixed(3));
    // Where the pointer sits relative to this element, for light that leans
    // toward you rather than sitting in the middle.
    el.style.setProperty("--lx", `${((x - r.left) / r.width) * 100}%`);
    el.style.setProperty("--ly", `${((y - r.top) / r.height) * 100}%`);
  });
}

export function useProximityField({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;
    let px = 0, py = 0, vx = 0, vy = 0, prev = { x: 0, y: 0, t: 0 };

    const onMove = (e) => {
      const now = performance.now();
      const dt = Math.max(1, now - prev.t);
      vx = (e.clientX - prev.x) / dt;
      vy = (e.clientY - prev.y) / dt;
      prev = { x: e.clientX, y: e.clientY, t: now };
      px = e.clientX; py = e.clientY;
      if (proxRaf) return;
      proxRaf = requestAnimationFrame(() => {
        proxRaf = null;
        proximityPass(px, py, vx, vy);
      });
    };
    const invalidate = () => { cacheStamp++; };
    const onLeave = () => REG.forEach(el => el.style.setProperty("--near", "0"));

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("resize", invalidate);
    window.addEventListener("pointerleave", onLeave);
    const iv = setInterval(invalidate, 1200);   // catch layout shifts we did not see

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("pointerleave", onLeave);
      clearInterval(iv);
      if (proxRaf) cancelAnimationFrame(proxRaf);
    };
  }, [enabled]);
}

/** Register an element with the proximity field. */
export function useNear() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--near", "0");
    REG.add(el);
    return () => REG.delete(el);
  }, []);
  return ref;
}

/* ───────────────────────────────────────────────────────────────────────────
   RELATIONAL FOCUS (§2)

   Hovering something publishes what it is ABOUT — "stage:df_review",
   "org:Trust", "metric:approved". Anything elsewhere describing the same thing
   responds. This is what reads as intelligence rather than decoration: the
   interface demonstrating it understands its own relationships, instead of
   fifteen widgets each reacting only to their own hover.
   ─────────────────────────────────────────────────────────────────────────── */

const FocusCtx = createContext({ focus: null, setFocus: () => {} });

export function FocusProvider({ children }) {
  const [focus, setFocusRaw] = useState(null);
  const timer = useRef(null);
  // Small trailing delay so sweeping the pointer across a row of cards does not
  // strobe the rest of the interface.
  const setFocus = useCallback((k) => {
    clearTimeout(timer.current);
    if (k) setFocusRaw(k);
    else timer.current = setTimeout(() => setFocusRaw(null), 90);
  }, []);
  const value = useMemo(() => ({ focus, setFocus }), [focus, setFocus]);
  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

/** Publish what this element is about while the pointer is on it. */
export function useFocusSource(key) {
  const { setFocus } = useContext(FocusCtx);
  return {
    onMouseEnter: () => key && setFocus(key),
    onMouseLeave: () => setFocus(null),
  };
}

/** Respond when something elsewhere is about the same thing.
 *  Returns "on" | "off" | null (nothing focused anywhere). */
export function useFocusTarget(key) {
  const { focus } = useContext(FocusCtx);
  if (!focus) return null;
  return focus === key ? "on" : "off";
}

export function useFocusKey() {
  return useContext(FocusCtx).focus;
}

/** Imperatively publish focus — for components that manage their own hover. */
export function useSetFocus() {
  return useContext(FocusCtx).setFocus;
}


/* ───────────────────────────────────────────────────────────────────────────
   §12 — SCROLL PARALLAX

   The atmosphere trails the content as you scroll, at roughly a fifth of its
   rate. That difference in speed is what the eye reads as real depth; without
   it the background is a flat sheet behind a moving page.

   Published as a CSS variable, so the transform happens on the compositor and
   scrolling stays smooth.
   ─────────────────────────────────────────────────────────────────────────── */
export function useScrollParallax() {
  useEffect(() => {
    let raf = null;
    // Captured at the window rather than bound to one container. Each page
    // scrolls a different element, and binding by ref meant the listener
    // attached to whichever container happened to be mounted — so it worked
    // nowhere. Capture catches whatever is actually scrolling.
    const onScroll = (e) => {
      const t = e.target;
      const top = t === document ? window.scrollY : (t?.scrollTop ?? 0);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        document.documentElement.style.setProperty("--scrolly", `${top * -0.055}px`);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

/* ───────────────────────────────────────────────────────────────────────────
   §13 — VISIBLE CAUSALITY

   When an action in one place changes something in another — clicking a
   pipeline stage filters the table below it — a pulse travels from the cause to
   the effect. Without it the list simply swaps contents and the connection has
   to be inferred.
   ─────────────────────────────────────────────────────────────────────────── */
export function emitCausality(fromEl, toEl, color = "rgba(74,155,224,0.9)") {
  if (!fromEl || !toEl || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const x1 = a.left + a.width / 2, y1 = a.bottom;
  const x2 = b.left + b.width / 2, y2 = b.top + 24;

  const dot = document.createElement("div");
  dot.setAttribute("aria-hidden", "true");
  Object.assign(dot.style, {
    position: "fixed", left: `${x1}px`, top: `${y1}px`,
    width: "8px", height: "8px", borderRadius: "50%",
    background: color, boxShadow: `0 0 14px 2px ${color}`,
    pointerEvents: "none", zIndex: "1500",
    transform: "translate(-50%,-50%) scale(.6)", opacity: "0",
  });
  document.body.appendChild(dot);
  const anim = dot.animate(
    [
      { transform: "translate(-50%,-50%) scale(.6)", opacity: 0, offset: 0 },
      { transform: "translate(-50%,-50%) scale(1)",  opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${x2 - x1}px), calc(-50% + ${y2 - y1}px)) scale(1)`,
        opacity: 1, offset: 0.78 },
      { transform: `translate(calc(-50% + ${x2 - x1}px), calc(-50% + ${y2 - y1}px)) scale(2.4)`,
        opacity: 0, offset: 1 },
    ],
    { duration: 620, easing: "cubic-bezier(.3,.7,.3,1)" }
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}

/* ───────────────────────────────────────────────────────────────────────────
   §15 — SESSION MEMORY

   The interface remembering you is a strong form of aliveness, and unlike most
   of this file it is information rather than atmosphere: it tells you what has
   moved since you were last here.
   ─────────────────────────────────────────────────────────────────────────── */
const VISIT_KEY = "pmo_last_visit";

export function useSessionMemory() {
  const [lastVisit, setLastVisit] = useState(null);
  useEffect(() => {
    try {
      const prev = localStorage.getItem(VISIT_KEY);
      if (prev) setLastVisit(new Date(prev));
      localStorage.setItem(VISIT_KEY, new Date().toISOString());
    } catch (_) { /* private browsing — the feature simply does not appear */ }
  }, []);

  const changedSince = useCallback((iso) => {
    if (!lastVisit || !iso) return false;
    return new Date(iso) > lastVisit;
  }, [lastVisit]);

  return { lastVisit, changedSince };
}
