import { useRef, useEffect, useState, useCallback } from "react";
import { BRAND, DATA, MOTION, TYPE, SP, R } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   ASSISTANT AVATAR — the portal's digital presence

   A navy-glass entity with a gold rim and internal illumination. Built in SVG
   and CSS rather than three.js: a WebGL renderer is ~150KB gzipped plus a live
   render loop for something that sits at 70px, against a portal where charts
   are deliberately kept off the critical path. Depth here comes from lighting
   and response, not polygons — and a specular highlight that tracks the cursor
   reads as curvature more convincingly than a static render does.

   Motion is driven outside React. A pointermove listener writes CSS variables
   and SVG transforms directly, so cursor tracking never triggers a re-render.

   States (§18): idle · hover · listening · thinking · answering · success ·
   error. Each is a class on the root; nothing is random, everything is
   state-driven.
   ═══════════════════════════════════════════════════════════════════════════ */

// One switch, as agreed — flip to a width test after judging it on a real phone.
const PARTICLES = true;
const PARTICLE_COUNT = 7;

let cssIn = false;
function useAvatarStyles() {
  useEffect(() => {
    if (cssIn) return;
    cssIn = true;
    const el = document.createElement("style");
    // `backwards` never `both`: a retained final keyframe leaves a transform in
    // place, which makes the element a containing block for position:fixed
    // descendants and silently drags panels out of position.
    el.textContent = `
@keyframes avFloat  { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-5px) scale(1.02)} }
@keyframes avAura   { 0%,100%{opacity:calc(.38 + var(--near,0)*.34); transform:scale(1)}
                      50%    {opacity:calc(.62 + var(--near,0)*.30); transform:scale(1.10)} }
@keyframes avSpin   { to{transform:rotate(360deg)} }
@keyframes avSweep  { to{transform:rotate(360deg)} }
@keyframes avStream { from{transform:translateX(-26px)} to{transform:translateX(26px)} }
@keyframes avScan   { from{transform:translateY(-15px)} to{transform:translateY(15px)} }
@keyframes avBud    { 0%,100%{opacity:.5} 50%{opacity:1} }
@keyframes avOrbit  { from{transform:rotate(0deg) translateX(var(--orb,34px)) rotate(0deg)}
                      to  {transform:rotate(360deg) translateX(var(--orb,34px)) rotate(-360deg)} }
@keyframes avRipple { from{transform:scale(.55);opacity:.55} to{transform:scale(2.1);opacity:0} }
@keyframes avTipIn  { from{opacity:0;transform:translateX(6px) scale(.96)} to{opacity:1;transform:none} }

.av-float { animation: avFloat 5.2s cubic-bezier(.45,0,.55,1) infinite; transform-origin:50% 60%; }
.av-aura  { animation: avAura 5.2s ease-in-out infinite; }
.av-aura2 { animation: avAura 4.1s ease-in-out infinite reverse; }
.av-ring1 { transform-origin:50% 50%; animation: avSpin 22s linear infinite; }
.av-ring2 { transform-origin:50% 50%; animation: avSpin 30s linear infinite reverse; }
.av-bud   { animation: avBud 3.2s ease-in-out infinite; }
.av-dot   { animation: avOrbit linear infinite; transform-origin:0 0; }
.av-tip   { animation: avTipIn .2s cubic-bezier(.22,.8,.3,1) backwards; }

/* thinking — several cues at once, because a single one is missed at 300ms */
.is-thinking .av-float { animation-duration:1.6s }
.is-thinking .av-ring1 { animation-duration:1.5s }
.is-thinking .av-ring2 { animation-duration:2.1s }
.is-thinking .av-aura,
.is-thinking .av-aura2 { animation-duration:1.3s }
.is-thinking .av-bud   { animation-duration:.5s }
.av-think { opacity:0; transition:opacity .12s ease }
.is-thinking .av-think { opacity:1 }
.av-calm  { opacity:1; transition:opacity .12s ease }
.is-thinking .av-calm  { opacity:0 }
.av-sweep { animation: avSweep 1.05s linear infinite }
.av-scan  { animation: avScan .55s linear infinite }
.av-strm  { animation: avStream 1.1s linear infinite }
.av-strm:nth-of-type(2){ animation-delay:-.37s }
.av-strm:nth-of-type(3){ animation-delay:-.74s }

/* listening — attentive, not busy */
.is-listening .av-float { animation-duration:3.4s }

/* answering — energy settling */
.is-answering .av-float { animation-duration:2.6s }

/* error — muted, paused */
.is-error .av-float, .is-error .av-ring1, .is-error .av-ring2 { animation-play-state:paused }
.is-error .av-aura, .is-error .av-aura2 { animation-play-state:paused; opacity:.22 }

.av-ripple { animation: avRipple .62s cubic-bezier(.2,.7,.3,1) forwards; }

@media (prefers-reduced-motion: reduce){
  .av-float,.av-aura,.av-aura2,.av-ring1,.av-ring2,.av-bud,.av-dot,
  .av-sweep,.av-scan,.av-strm,.av-ripple,.av-tip { animation:none !important }
}`;
    document.head.appendChild(el);
  }, []);
}

/**
 * @param state  idle | hover | listening | thinking | answering | success | error
 * @param size   rendered px (70 desktop launcher, 56 mobile, 34 in a header)
 * @param track  follow the cursor across the whole page
 */
export function AssistantAvatar({ state = "idle", size = 70, track = true,
                                  interactive = false, ripple = 0, boxScale = 1.55 }) {
  useAvatarStyles();
  const rootRef   = useRef(null);
  const headRef   = useRef(null);
  const eyesRef   = useRef(null);
  const budRef    = useRef(null);
  const specRef   = useRef(null);
  const lidRef    = useRef(null);

  // Everything below runs outside React: a pointermove that re-rendered on each
  // frame would be the single most expensive thing on the page.
  useEffect(() => {
    if (!track) return;
    let raf = 0, last = performance.now();
    let tx = 0, ty = 0, cx = 0, cy = 0, vx = 0, near = 0, tnear = 0, idleMs = 0;
    let nextBlink = performance.now() + 2200, blinkAt = -1;

    const onMove = (e) => {
      const el = rootRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      tx = Math.max(-1, Math.min(1, (e.clientX - ox) / 260));
      ty = Math.max(-1, Math.min(1, (e.clientY - oy) / 260));
      const d = Math.hypot(e.clientX - ox, e.clientY - oy);
      tnear = Math.max(0, Math.min(1, 1 - (d - 60) / 260));
      idleMs = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const frame = (now) => {
      const dt = Math.min(64, now - last); last = now;
      idleMs += dt;
      const ease = 1 - Math.pow(0.0016, dt / 1000);
      const px = cx;
      cx += (tx - cx) * ease; cy += (ty - cy) * ease;
      vx = vx * 0.9 + (cx - px) * 10;
      near += (tnear - near) * ease;

      // settles back toward neutral when the pointer has been still a while
      const settle = idleMs > 2600 ? Math.max(0, 1 - (idleMs - 2600) / 1200) : 0;
      const ax = cx * (1 - settle * 0.75), ay = cy * (1 - settle * 0.75);

      rootRef.current?.style.setProperty("--near", near.toFixed(3));
      headRef.current?.setAttribute("transform",
        `translate(${(ax * 6).toFixed(2)},${(ay * 4).toFixed(2)}) rotate(${(ax * 4.5).toFixed(2)} 120 112)`);
      eyesRef.current?.setAttribute("transform",
        `translate(${(ax * 7).toFixed(2)},${(ay * 5).toFixed(2)})`);
      budRef.current?.setAttribute("transform",
        `rotate(${Math.max(-12, Math.min(12, -vx * 14)).toFixed(2)} 120 52)`);
      if (specRef.current) {
        specRef.current.setAttribute("cx", (98 - ax * 14).toFixed(1));
        specRef.current.setAttribute("cy", (76 - ay * 7).toFixed(1));
      }

      // blink on a jittered timer — regular blinking reads as mechanical
      if (now > nextBlink) { blinkAt = now; nextBlink = now + 1800 + Math.random() * 4500; }
      let k = 1;
      if (blinkAt > 0) {
        const t = (now - blinkAt) / 150;
        if (t >= 1) blinkAt = -1; else k = 0.08 + Math.abs(Math.cos(t * Math.PI)) * 0.92;
      }
      lidRef.current?.setAttribute("transform",
        `translate(0 ${(104 * (1 - k)).toFixed(2)}) scale(1 ${k.toFixed(3)})`);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, [track]);

  const S = size, box = S * boxScale;   // room for aura and orbit
  const gold = BRAND.gold, cyan = "#4FD8E8";

  return (
    <div ref={rootRef} className={`av-root is-${state}`}
      style={{ position: "relative", width: box, height: box, display: "grid",
        placeItems: "center", pointerEvents: interactive ? "auto" : "none" }}>

      {/* aura — own layer, pointer-events none, so its animated transform can
          never become a containing block for anything above it */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0,
        display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <span className="av-aura" style={{ position: "absolute", width: box, height: box,
          borderRadius: "50%", background:
            `radial-gradient(circle, ${BRAND.blue}3D 0%, transparent 66%)` }} />
        <span className="av-aura2" style={{ position: "absolute", width: box * 0.74,
          height: box * 0.74, borderRadius: "50%", background:
            `radial-gradient(circle, ${gold}2E 0%, transparent 62%)` }} />
      </div>

      {/* orbital rings */}
      <svg aria-hidden="true" viewBox="0 0 300 300"
        style={{ position: "absolute", width: box, height: box, pointerEvents: "none" }}>
        <ellipse className="av-ring1" cx="150" cy="150" rx="118" ry="39" fill="none"
          stroke={`${gold}5C`} strokeWidth="1.1" strokeDasharray="1.5 13"
          transform="rotate(-16 150 150)" />
        <ellipse className="av-ring2" cx="150" cy="150" rx="99" ry="30" fill="none"
          stroke={`${cyan}47`} strokeWidth="1" strokeDasharray="2 14"
          transform="rotate(18 150 150)" />
      </svg>

      {/* particles — sparse and slow, per §25 */}
      {PARTICLES && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0,
          display: "grid", placeItems: "center", pointerEvents: "none" }}>
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
            <span key={i} className="av-dot" style={{
              position: "absolute", width: i % 3 === 0 ? 2.6 : 1.8,
              height: i % 3 === 0 ? 2.6 : 1.8, borderRadius: "50%",
              background: i % 2 ? cyan : gold,
              opacity: 0.30 + (i % 3) * 0.16,
              "--orb": `${box * (0.30 + (i % 4) * 0.055)}px`,
              animationDuration: `${13 + i * 3.1}s`,
              animationDelay: `${-i * 2.3}s`,
              animationDirection: i % 2 ? "normal" : "reverse",
            }} />
          ))}
        </div>
      )}

      {ripple > 0 && (
        <span key={ripple} aria-hidden="true" className="av-ripple"
          style={{ position: "absolute", width: S, height: S, borderRadius: "50%",
            border: `1.5px solid ${cyan}`, pointerEvents: "none" }} />
      )}

      <div className="av-float" style={{ position: "relative" }}>
        <svg width={S} height={S} viewBox="0 0 240 240" role="img" aria-label="Portal assistant"
          style={{ display: "block", overflow: "visible",
            filter: `drop-shadow(0 6px 16px rgba(0,0,0,.5))` }}>
          <defs>
            <linearGradient id="avShell" x1="0.25" y1="0" x2="0.75" y2="1">
              <stop offset="0%" stopColor="#3E5F8A" /><stop offset="30%" stopColor="#22405F" />
              <stop offset="70%" stopColor="#14263D" /><stop offset="100%" stopColor="#0A1526" />
            </linearGradient>
            <linearGradient id="avLo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2A4868" /><stop offset="100%" stopColor="#0D1B2E" />
            </linearGradient>
            <radialGradient id="avVisor" cx="40%" cy="26%" r="84%">
              <stop offset="0%" stopColor="#16355A" /><stop offset="46%" stopColor="#0A1A2F" />
              <stop offset="100%" stopColor="#03070E" />
            </radialGradient>
            <linearGradient id="avGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F6D79A" /><stop offset="48%" stopColor={gold} />
              <stop offset="100%" stopColor="#9A6C1E" />
            </linearGradient>
            <linearGradient id="avGloss" x1="0" y1="0" x2="0.2" y2="1">
              <stop offset="0%" stopColor="#BFDCFF" stopOpacity=".55" />
              <stop offset="100%" stopColor="#BFDCFF" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="avCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#BFF6FF" stopOpacity=".95" />
              <stop offset="55%" stopColor={cyan} stopOpacity=".45" />
              <stop offset="100%" stopColor={cyan} stopOpacity="0" />
            </radialGradient>
            <filter id="avSoft" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="3.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="avGlow" x="-90%" y="-90%" width="280%" height="280%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <clipPath id="avVisorClip"><ellipse cx="120" cy="104" rx="50" ry="45" /></clipPath>
            <clipPath id="avHeadClip"><ellipse cx="120" cy="104" rx="63" ry="59" /></clipPath>
          </defs>

          <g ref={budRef}>
            <path d="M120 48 L120 26" stroke="url(#avGold)" strokeWidth="2.6" strokeLinecap="round" />
            <circle className="av-bud" cx="120" cy="21" r="9" fill={gold} opacity=".3" filter="url(#avGlow)" />
            <circle cx="120" cy="21" r="5.6" fill="url(#avGold)" />
          </g>

          <g>
            <circle cx="44" cy="168" r="11" fill="url(#avLo)" stroke={`${gold}73`} strokeWidth="1" />
            <circle cx="41" cy="164.5" r="3.6" fill="#7FD4FF" opacity=".5" />
            <circle cx="196" cy="168" r="11" fill="url(#avLo)" stroke={`${gold}73`} strokeWidth="1" />
            <circle cx="193" cy="164.5" r="3.6" fill="#7FD4FF" opacity=".5" />
          </g>

          <g>
            <path d="M94 152 Q120 145 146 152 L150 185 Q120 196 90 185 Z" fill="url(#avLo)" />
            <path d="M94 152 Q120 145 146 152" fill="none" stroke={`${gold}80`} strokeWidth="1.2" />
            <rect x="106" y="166" width="28" height="12" rx="6" fill="#05101F" opacity=".85" />
            <rect x="111" y="170.5" width="18" height="3" rx="1.5" fill={cyan} opacity=".85" />
          </g>

          <g ref={headRef}>
            <ellipse cx="66" cy="104" rx="15" ry="19" fill="url(#avLo)" />
            <ellipse cx="66" cy="104" rx="15" ry="19" fill="none" stroke={`${gold}80`} strokeWidth="1.2" />
            <ellipse cx="174" cy="104" rx="15" ry="19" fill="url(#avLo)" />
            <ellipse cx="174" cy="104" rx="15" ry="19" fill="none" stroke={`${gold}80`} strokeWidth="1.2" />

            <ellipse cx="120" cy="104" rx="63" ry="59" fill="url(#avShell)" />
            <g clipPath="url(#avHeadClip)">
              <ellipse cx="108" cy="56" rx="44" ry="23" fill="url(#avGloss)" />
              <path d="M57 104 A63 59 0 0 1 120 45" fill="none" stroke="#9FD8FF"
                strokeWidth="1.6" opacity=".35" />
            </g>
            <ellipse cx="120" cy="104" rx="63" ry="59" fill="none"
              stroke="url(#avGold)" strokeWidth="1.8" opacity=".75" />

            <ellipse cx="120" cy="104" rx="50" ry="45" fill="url(#avVisor)" />
            <ellipse cx="120" cy="104" rx="50" ry="45" fill="none"
              stroke={`${gold}59`} strokeWidth="1.4" />

            <g clipPath="url(#avVisorClip)">
              <ellipse cx="120" cy="104" rx="34" ry="30" fill="url(#avCore)" opacity=".38" />
              <g ref={eyesRef}>
                <g ref={lidRef} filter="url(#avSoft)">
                  <path className="av-calm" d="M93 110 Q104 94 115 110" stroke="#9FF4FF"
                    strokeWidth="8" fill="none" strokeLinecap="round" opacity=".95" />
                  <path className="av-calm" d="M125 110 Q136 94 147 110" stroke="#9FF4FF"
                    strokeWidth="8" fill="none" strokeLinecap="round" opacity=".95" />
                  <rect className="av-think" x="93" y="100" width="22" height="7" rx="3.5" fill="#F6D79A" />
                  <rect className="av-think" x="125" y="100" width="22" height="7" rx="3.5" fill="#F6D79A" />
                </g>
              </g>
              <g className="av-think">
                <g className="av-scan"><rect x="70" y="103" width="100" height="2.4" fill="#F6D79A" opacity=".5" /></g>
                <rect className="av-strm" x="80" y="86" width="13" height="2.2" rx="1.1" fill={gold} opacity=".65" />
                <rect className="av-strm" x="112" y="120" width="17" height="2.2" rx="1.1" fill={gold} opacity=".5" />
                <rect className="av-strm" x="96" y="132" width="10" height="2.2" rx="1.1" fill={gold} opacity=".4" />
              </g>
              <ellipse ref={specRef} cx="98" cy="76" rx="30" ry="14" fill="#CFE8FF"
                opacity=".12" transform="rotate(-20 98 76)" />
            </g>

            <g className="av-think">
              <g className="av-sweep" style={{ transformOrigin: "120px 104px" }}>
                <path d="M120 59 A50 45 0 0 1 162 82" fill="none" stroke="#F6D79A"
                  strokeWidth="3" strokeLinecap="round" />
              </g>
            </g>

            <circle cx="66" cy="104" r="3.6" fill={cyan} filter="url(#avGlow)" />
            <circle cx="174" cy="104" r="3.6" fill={cyan} filter="url(#avGlow)" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/** Launcher: the avatar as a button, with proximity tooltip and click ripple. */
export function AssistantLauncher({ T, onOpen, isCompact, state = "idle" }) {
  const [hover, setHover] = useState(false);
  const [ripple, setRipple] = useState(0);
  const [pressed, setPressed] = useState(false);
  // 122 on desktop rather than the 70 the spec suggested: judged in place on a
  // real screen, 70 read as small against the dashboard. Mobile stays at 56,
  // where it was already right.
  const size = isCompact ? 56 : 122;

  const open = useCallback(() => {
    // §7: react, compress, pulse, then hand over — the entity opening a channel
    // rather than a modal appearing. Kept under 650ms so it never feels slow.
    setPressed(true);
    setRipple((n) => n + 1);
    setTimeout(() => setPressed(false), 190);
    setTimeout(() => onOpen?.(), 300);
  }, [onOpen]);

  return (
    <div style={{ position: "fixed", zIndex: 1200,
      right: isCompact ? 10 : 22, bottom: isCompact ? 74 : 20,
      display: "flex", alignItems: "center", gap: 10 }}>

      {hover && !isCompact && (
        <div className="av-tip" style={{
          background: `${T.surfaceFloat}E6`, backdropFilter: "blur(14px)",
          border: `1px solid ${T.borderStrong}`, borderRadius: R.md,
          padding: "8px 13px", boxShadow: T.shadowLg, whiteSpace: "nowrap",
          pointerEvents: "none", marginRight: -4,
        }}>
          <div style={{ ...TYPE.label, color: T.text }}>Portal assistant</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>
            Ask about your portfolio
          </div>
        </div>
      )}

      <button
        onClick={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="pmo-focusable"
        data-tour="assistant-launcher"
        aria-label="Open the portal assistant"
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          lineHeight: 0, borderRadius: "50%",
          transform: pressed ? "scale(.9)" : hover ? "scale(1.06)" : "scale(1)",
          transition: `transform ${pressed ? "120ms" : MOTION.base} cubic-bezier(.22,.8,.3,1)`,
        }}>
        <AssistantAvatar state={hover ? "hover" : state} size={size} ripple={ripple} />
      </button>
    </div>
  );
}
