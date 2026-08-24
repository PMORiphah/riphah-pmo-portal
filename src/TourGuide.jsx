import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   TOUR ENGINE

   A spotlight overlay driven entirely by data — see tourSteps.js for the
   actual content. This file only knows how to: find a target, dim everything
   else, move the light to it, show a caption, and optionally run a short
   live demonstration before advancing.

   Deliberately not a third-party library. Shepherd and Intro.js each bring
   their own CSS and their own idea of a highlight, and neither would carry
   the portal's easing, glass, or type — this is ~350 lines reusing primitives
   that already exist everywhere else in the product.
   ═══════════════════════════════════════════════════════════════════════════ */

const EASE = "cubic-bezier(.16,1,.3,1)";

// Anything with more scroll height than client height, walking up from the
// target. `window.scrollTo` does nothing for the Team page or Activity Log —
// both scroll an inner div — which is what this exists to handle correctly.
function scrollTargetIntoView(el) {
  let n = el;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) {
      const r = el.getBoundingClientRect();
      const cr = n.getBoundingClientRect();
      if (r.top < cr.top + 60 || r.bottom > cr.bottom - 60) {
        n.scrollTop += (r.top - cr.top) - cr.height / 2 + r.height / 2;
      }
      return;
    }
    n = n.parentElement;
  }
  el.scrollIntoView({ block: "center", behavior: "auto" });
}

function waitForTarget(selector, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const tryFind = () => {
      const el = document.querySelector(selector);
      if (el && el.getBoundingClientRect().width > 0) return el;
      return null;
    };
    const found = tryFind();
    if (found) { resolve(found); return; }
    const started = performance.now();
    const iv = setInterval(() => {
      const el = tryFind();
      if (el || performance.now() - started > timeoutMs) {
        clearInterval(iv);
        resolve(el);
      }
    }, 80);
  });
}

const TourCtx = createContext(null);
export const useTour = () => useContext(TourCtx);

export function TourProvider({ T, children, nav }) {
  const [steps, setSteps] = useState(null);   // null = not running
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | moving | demo | ready
  const cleanupRef = useRef(null);
  const reduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const start = useCallback((list) => { setSteps(list); setIdx(0); }, []);
  const stop = useCallback(async () => {
    if (cleanupRef.current) { try { await cleanupRef.current(); } catch (_) {} }
    cleanupRef.current = null;
    setSteps(null); setRect(null); setPhase("idle");
  }, []);

  // Drives every step: navigate → wait for the target → scroll it into view →
  // measure it → run the optional demo → show the caption.
  // Drives every step: navigate → optionally reveal the real target (click
  // something that only the tour needs clicked) → wait for it → scroll it
  // into view → measure it → run the optional demo → show the caption.
  useEffect(() => {
    if (!steps) return;
    let cancelled = false;
    let ro = null;
    let scrollHandler = null;
    const settleTimers = [];
    const step = steps[idx];

    const measure = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      let r = el.getBoundingClientRect();
      // Self-correcting: scrollTargetIntoView only decides whether to scroll
      // by checking against whatever content is on screen *at that instant*
      // — if a tab switch is mid-flight, that can be the outgoing tab's
      // shorter layout, and the decision "it's already visible" ends up
      // stale the moment the real content swaps in. Rather than getting that
      // one decision perfectly timed, any measurement that finds the target
      // genuinely off-screen scrolls again and re-reads, here, regardless of
      // why it drifted.
      if (r.bottom < 20 || r.top > window.innerHeight - 20) {
        scrollTargetIntoView(el);
        r = el.getBoundingClientRect();
      }
      const top = Math.max(0, r.top);
      const bottom = Math.min(window.innerHeight, r.top + r.height);
      setRect({ top, left: r.left, width: r.width, height: Math.max(40, bottom - top) });
    };

    (async () => {
      if (cleanupRef.current) { try { await cleanupRef.current(); } catch (_) {} cleanupRef.current = null; }
      setPhase("moving");

      if (step.page) nav.setPage(step.page);
      if (step.tab)  nav.setTab?.(step.page, step.tab);
      if (step.openProject) await nav.openSampleProject?.();
      // Separate from `demo`: runs BEFORE the target is searched for. Exists
      // for steps whose real content doesn't exist until something is
      // clicked first — a project-detail tab, for instance, is local React
      // state with no prop the tour can reach, so the only way in is a real
      // click on the real tab button.
      if (step.reveal) { try { await step.reveal(); } catch (_) {} }

      const el = await waitForTarget(step.selector);
      if (cancelled) return;
      if (!el) { setRect(null); setPhase("ready"); return; }

      scrollTargetIntoView(el);
      await new Promise((r) => setTimeout(r, reduced ? 0 : 260));
      if (cancelled) return;

      measure(step.selector);

      // Two delayed re-measures, beyond the ResizeObserver and scroll
      // listener below. Both are blind to a pure CSS transform transition
      // settling — nothing resizes, nothing scrolls — but this app's tab
      // panels slide in from the direction of travel on a transform, and a
      // measurement taken mid-slide reports the genuinely true (if
      // transient) mid-flight position. Fixed delays rather than watching
      // for "transition end" on an element the tour doesn't own.
      const t1 = setTimeout(() => { if (!cancelled) measure(step.selector); }, 300);
      const t2 = setTimeout(() => { if (!cancelled) measure(step.selector); }, 650);
      settleTimers.push(t1, t2);

      // Keep measuring as the target settles. Re-querying by selector rather
      // than reusing the `el` reference matters here: a page transition can
      // unmount and remount the wrapper between waitForTarget resolving and
      // this running, leaving `el` pointing at a detached node whose rect is
      // all zeros — which is exactly what a near-origin, near-zero spotlight
      // turned out to be during testing. Re-querying is immune to that by
      // construction, whichever component happens to cause the remount.
      if (!reduced && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => { if (!cancelled) measure(step.selector); });
        ro.observe(el);
      }
      scrollHandler = () => { if (!cancelled) measure(step.selector); };
      window.addEventListener("scroll", scrollHandler, true); // capture: inner scroll containers too

      if (step.demo && !reduced) {
        setPhase("demo");
        try {
          const undo = await step.demo(el);
          if (typeof undo === "function") cleanupRef.current = undo;
        } catch (_) { /* a demo failing must never block the tour */ }
        measure(step.selector);
      }
      if (!cancelled) setPhase("ready");
    })();

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (scrollHandler) window.removeEventListener("scroll", scrollHandler, true);
      settleTimers.forEach(clearTimeout);
    };
  }, [steps, idx, nav, reduced]);

  const next = useCallback(async () => {
    if (!steps) return;
    if (idx >= steps.length - 1) { await nav.onFinish?.(); stop(); return; }
    if (cleanupRef.current) { try { await cleanupRef.current(); } catch (_) {} cleanupRef.current = null; }
    setIdx((i) => i + 1);
  }, [steps, idx, nav, stop]);

  const back = useCallback(async () => {
    if (!steps || idx === 0) return;
    if (cleanupRef.current) { try { await cleanupRef.current(); } catch (_) {} cleanupRef.current = null; }
    setIdx((i) => i - 1);
  }, [steps, idx]);

  return (
    <TourCtx.Provider value={{ start, stop, running: !!steps }}>
      {children}
      {steps && (
        <TourOverlay T={T} step={steps[idx]} index={idx} total={steps.length}
          rect={rect} phase={phase} onNext={next} onBack={back} onSkip={stop} />
      )}
    </TourCtx.Provider>
  );
}

function TourOverlay({ T, step, index, total, rect, phase, onNext, onBack, onSkip }) {
  const dim = T.mode === "dark" ? "rgba(3,7,15,0.80)" : "rgba(18,36,60,0.42)";
  const ring = T.blueBright;

  return (
    <>
      {/* The whole page dims through one CSS trick: a huge box-shadow spread
          from a rectangle exactly the size of the target. No mask elements,
          no four-div cutout — one node, four animatable numbers. */}
      <div aria-hidden="true" style={{
        position: "fixed", zIndex: 1800, pointerEvents: rect ? "auto" : "none",
        top: rect ? rect.top - 8 : "46%", left: rect ? rect.left - 8 : "50%",
        width: rect ? rect.width + 16 : 0, height: rect ? rect.height + 16 : 0,
        borderRadius: 12,
        boxShadow: `0 0 0 9999px ${dim}`,
        border: rect ? `1.5px solid ${ring}99` : "none",
        transition: `top .42s ${EASE}, left .42s ${EASE}, width .42s ${EASE}, height .42s ${EASE}, opacity .3s ease`,
        opacity: rect ? 1 : 0,
      }} onClick={(e) => e.stopPropagation()} />

      {!rect && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1799, background: dim,
          transition: "opacity .3s ease" }} />
      )}

      <TourCaption T={T} step={step} index={index} total={total} rect={rect}
        loading={phase === "moving" || phase === "demo"}
        onNext={onNext} onBack={onBack} onSkip={onSkip} />
    </>
  );
}

function TourCaption({ T, step, index, total, rect, loading, onNext, onBack, onSkip }) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const w = box.offsetWidth || 320, h = box.offsetHeight || 160;
    const pad = 16;
    let left, top;
    if (!rect) {
      left = window.innerWidth / 2 - w / 2;
      top = window.innerHeight / 2 - h / 2;
    } else {
      const below = rect.top + rect.height + 18;
      const above = rect.top - h - 18;
      top = below + h < window.innerHeight - pad ? below
          : above > pad ? above
          : Math.max(pad, window.innerHeight - h - pad);
      left = rect.left + rect.width / 2 - w / 2;
      left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);
    }
    setPos({ top, left });
  }, [rect, step]);

  const pct = ((index + (loading ? 0.4 : 1)) / total) * 100;
  const isLast = index === total - 1;

  return (
    <div ref={boxRef} role="dialog" aria-label="Portal tour" style={{
      position: "fixed", zIndex: 1801, width: 340, maxWidth: "88vw",
      top: pos ? pos.top : -9999, left: pos ? pos.left : -9999,
      background: T.surfaceOver, border: `1px solid ${T.borderStrong}`,
      borderRadius: R.lg, padding: `${SP.md}px ${SP.lg}px ${SP.lg}px`,
      boxShadow: T.shadowLg,
      backdropFilter: "blur(16px) saturate(150%)", WebkitBackdropFilter: "blur(16px) saturate(150%)",
      transition: `top .32s ${EASE}, left .32s ${EASE}`,
      opacity: pos ? 1 : 0,
    }}>
      {/* Progress */}
      <div style={{ height: 3, borderRadius: 2, background: T.border, marginBottom: SP.md, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2,
          background: `linear-gradient(90deg, ${T.blue}, ${T.gold})`,
          transition: "width .3s ease" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ ...TYPE.label, color: T.muted }}>
          {step.section} · {index + 1} of {total}
        </span>
        <button className="pmo-focusable" onClick={onSkip} title="Skip tour" aria-label="Skip tour"
          style={{ background: "none", border: "none", color: T.dim, cursor: "pointer",
            display: "flex", padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ ...TYPE.h3, color: T.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        {loading && <Sparkles size={13} color={T.gold} className="pmo-awaiting" />}
        {step.title}
      </div>
      <div style={{ ...TYPE.bodySm, color: T.textSoft, lineHeight: 1.6, marginBottom: SP.md }}>
        {step.body}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="pmo-focusable pmo-btn" onClick={onBack} disabled={index === 0}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent",
            border: "none", color: index === 0 ? T.dim : T.textSoft, cursor: index === 0 ? "default" : "pointer",
            padding: "6px 4px", ...TYPE.bodySm, opacity: index === 0 ? 0.4 : 1 }}>
          <ChevronLeft size={13} /> Back
        </button>
        <button className="pmo-focusable pmo-btn" onClick={onNext} aria-label={isLast ? "Finish tour" : "Next tour step"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px",
            background: `linear-gradient(135deg, ${T.gold}, #C47818)`, border: "none",
            borderRadius: R.sm, color: "#1A1206", fontWeight: 700, ...TYPE.bodySm, cursor: "pointer" }}>
          {isLast ? "Finish" : "Next"} {!isLast && <ChevronRight size={13} />}
        </button>
      </div>
    </div>
  );
}

/* Synthetic-event helpers for demos. Real DOM events fired at real nodes, so
   the existing onMouseEnter/onClick handlers run exactly as if a person
   triggered them — no parallel demo-mode plumbing to keep in sync. */
export const fire = {
  hover: (el) => el?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })),
  unhover: (el) => el?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })),
  click: (el) => el?.click(),
};
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
