// ─────────────────────────────────────────────────────────────────────────────
//  PMO PORTAL — UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
//  Every button, input, card, badge, modal, skeleton and empty state in the
//  product comes from here. Pages compose these; pages do not restyle them.
//
//  All of them take `T` (the active theme) and read tokens from it, which is
//  why light and dark both come out right without per-component branching.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { TYPE, SP, R, MOTION } from "./theme.js";

// ─── FONTS + GLOBAL MOTION ───────────────────────────────────────────────────
export const injectGlobals = () => {
  if (document.getElementById("pmo-globals")) return;

  const f = document.createElement("link");
  f.rel = "stylesheet";
  f.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
  document.head.appendChild(f);

  const s = document.createElement("style");
  s.id = "pmo-globals";
  s.textContent = `
    @keyframes pmoIn      { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    @keyframes pmoFade    { from { opacity:0; } to { opacity:1; } }
    @keyframes pmoScaleIn { from { opacity:0; transform:scale(.97) translateY(6px); } to { opacity:1; transform:none; } }
    @keyframes pmoShimmer { 0% { background-position:-420px 0; } 100% { background-position:420px 0; } }
    @keyframes pmoPulse   { 0%,100% { box-shadow:0 0 0 0 currentColor; opacity:1; } 70% { box-shadow:0 0 0 6px transparent; opacity:.8; } }
    @keyframes pmoDrift   { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(-1.5%,1%) scale(1.03); } }
    @keyframes pmoSlideR  { from { opacity:0; transform:translateX(14px); } to { opacity:1; transform:none; } }
    @keyframes pmoRise    { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
    /* Icon micro-animations (§6). Each runs once on hover and is deliberately
       tiny — a few pixels, under 400ms. */
    @keyframes pmoNudgeUp { 0%{transform:translateY(0)} 45%{transform:translateY(-2.5px)} 100%{transform:translateY(0)} }
    @keyframes pmoBreathe { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.09);opacity:.85} }
    @keyframes pmoTick    { 0%{transform:scale(1) rotate(0)} 40%{transform:scale(1.14) rotate(-7deg)} 100%{transform:scale(1) rotate(0)} }
    @keyframes pmoShift   { 0%{transform:translate(0,0)} 45%{transform:translate(1.5px,-1.5px)} 100%{transform:translate(0,0)} }
    @keyframes pmoSheen   { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }

    .pmo-in      { animation: pmoIn .34s ${MOTION.ease} backwards; }
    .pmo-fade    { animation: pmoFade .28s ease backwards; }
    .pmo-scale   { animation: pmoScaleIn .2s ${MOTION.ease}; }
    .pmo-slide-r { animation: pmoSlideR .26s ${MOTION.ease} backwards; }
    .pmo-drift   { animation: pmoDrift 20s ease-in-out infinite; }
    .pmo-pulse   { animation: pmoPulse 2.4s ease-in-out infinite; }
    .pmo-lift    { transition: transform ${MOTION.base}, box-shadow ${MOTION.base}, border-color ${MOTION.base}; }
    /* -3px, not more. The movement should read as expensive, not springy (§5). */
    .pmo-lift:hover { transform: translateY(-3px); }
    .pmo-rise    { animation: pmoRise .22s ${MOTION.ease}; }

    /* Icon animations fire from the card's hover state, not the icon's, so the
       whole card is the target rather than a 14px hit area. */
    .pmo-ico-up:hover      .pmo-ico, .pmo-hot .pmo-ico-up      { animation: pmoNudgeUp .42s ease; }
    .pmo-hot .pmo-ico-up   { animation: pmoNudgeUp .42s ease; }
    .pmo-hot .pmo-ico-tick { animation: pmoTick .42s ease; }
    .pmo-hot .pmo-ico-pulse{ animation: pmoBreathe 1.6s ease-in-out infinite; }
    .pmo-hot .pmo-ico-shift{ animation: pmoShift .45s ease; }
    .pmo-hot .pmo-ico-glow { filter: drop-shadow(0 0 5px currentColor); transition: filter .3s ease; }

    /* A single slow sheen crossing a card on hover. One pass, then done. */
    .pmo-sheen { position:absolute; inset:0; pointer-events:none; overflow:hidden; border-radius:inherit; opacity:0; transition:opacity .2s ease; }
    .pmo-hot .pmo-sheen { opacity:1; }
    .pmo-hot .pmo-sheen::after {
      content:""; position:absolute; top:0; bottom:0; width:38%;
      background:linear-gradient(100deg, transparent, rgba(255,255,255,.055), transparent);
      animation: pmoSheen 1.1s cubic-bezier(.3,.7,.4,1) 1;
    }

    /* Baseline interaction for controls not yet migrated to <Button>. Subtle
       by design: it should read as the same product, not compete with the
       primitives. */
    .pmo-btn { transition: filter 140ms ease, transform 90ms ease, opacity 140ms ease; }
    .pmo-btn:hover:not(:disabled)  { filter: brightness(1.14); }
    .pmo-btn:active:not(:disabled) { transform: scale(.975); }
    .pmo-btn:disabled { opacity:.5; cursor:not-allowed; }

    /* Native controls respond to the pointer too */
    .pmo-select:hover:not(:disabled) { border-color: rgba(124,149,175,.55) !important; }

    /* Focus: always visible, never the default browser ring (§34) */
    .pmo-focusable:focus-visible {
      outline: 2px solid ${"#4A9BE0"};
      outline-offset: 2px;
      border-radius: ${R.sm}px;
    }

    /* Native controls restyled once, globally (§37: no default browser controls) */
    .pmo-select {
      -webkit-appearance:none; -moz-appearance:none; appearance:none;
      background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237C95AF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat; background-position:right 10px center; padding-right:26px !important;
    }
    /* Native date fields: the OS widget is the last stock control in the
       product. Tint the picker indicator so it reads as ours. */
    input[type="date"] {
      color-scheme: var(--pmo-scheme, dark);
      font-family: 'Inter', sans-serif;
    }
    input[type="date"]::-webkit-calendar-picker-indicator {
      opacity:.55; cursor:pointer; transition:opacity 140ms ease;
      filter: var(--pmo-date-filter, invert(1));
    }
    input[type="date"]:hover::-webkit-calendar-picker-indicator { opacity:1; }

    .pmo-scroll::-webkit-scrollbar { width:10px; height:10px; }
    .pmo-scroll::-webkit-scrollbar-track { background:transparent; }
    .pmo-scroll::-webkit-scrollbar-thumb { background:rgba(124,149,175,.28); border-radius:99px; border:2px solid transparent; background-clip:content-box; }
    .pmo-scroll::-webkit-scrollbar-thumb:hover { background:rgba(124,149,175,.5); border:2px solid transparent; background-clip:content-box; }

    /* Legacy class aliases — un-migrated pages still reference these. This
       block disappears as each page is moved onto the new names. */
    .pmo-card-in { animation: pmoIn .34s ${MOTION.ease} backwards; }
    .pmo-fade-in { animation: pmoFade .28s ease backwards; }
    .pmo-pulse-dot { animation: pmoPulse 2.4s ease-in-out infinite; }
    .pmo-mesh { animation: pmoDrift 20s ease-in-out infinite; }
    .pmo-skeleton { background-repeat:no-repeat; animation: pmoShimmer 1.5s ease-in-out infinite; }

    @media (prefers-reduced-motion: reduce) {
      .pmo-in,.pmo-fade,.pmo-scale,.pmo-slide-r,.pmo-drift,.pmo-pulse,.pmo-skeleton,.pmo-rise,
      .pmo-btn:active,
      .pmo-sheen,.pmo-hot .pmo-sheen::after,.pmo-hot .pmo-ico-up,.pmo-hot .pmo-ico-tick,
      .pmo-hot .pmo-ico-pulse,.pmo-hot .pmo-ico-shift,
      .pmo-card-in,.pmo-fade-in,.pmo-pulse-dot,.pmo-mesh { animation:none !important; }
      .pmo-lift:hover { transform:none !important; }
      * { transition-duration:.01ms !important; }
    }
  `;
  document.head.appendChild(s);
};

// ─── RESPONSIVE ──────────────────────────────────────────────────────────────
// Inline styles can't express media queries, so breakpoints come through a hook
// instead. This is what makes §26 possible at all.
export const BP = { mobile:640, tablet:1024, laptop:1366 };

export function useViewport() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  useEffect(() => {
    let raf = null;
    const on = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(window.innerWidth));
    };
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return {
    width: w,
    isMobile: w < BP.mobile,
    isTablet: w >= BP.mobile && w < BP.tablet,
    isLaptop: w >= BP.tablet && w < BP.laptop,
    isDesktop: w >= BP.laptop,
    isCompact: w < BP.tablet,
  };
}

// ─── COUNT-UP ────────────────────────────────────────────────────────────────
// Tweens the leading numeric part of a value. Two rules learned the hard way:
//  1. Never call this inside a component that has a conditional early return
//     before it — the hook count changes between renders and React blanks the
//     whole app. Use <Metric>/<CountUp> instead, which own the hook.
//  2. Animate on mount only (`once`). Re-tweening on every filter keystroke
//     flashes 0→value repeatedly and reads as broken (§19).
export function useCountUp(value, { duration = 850, once = true } = {}) {
  const [display, setDisplay] = useState(value);
  const raf = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    const str = String(value ?? "");
    if (once && done.current) { setDisplay(str); return; }

    const m = str.match(/^(-?[\d,]*\.?\d+)/);
    if (!m) { setDisplay(str); return; }
    const numStr = m[1];
    const suffix = str.slice(numStr.length);
    const target = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(target)) { setDisplay(str); return; }
    const decimals = (numStr.split(".")[1] || "").length;
    const hasComma = numStr.includes(",");

    const start = performance.now();
    if (raf.current) cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = target * eased;
      const fixed = decimals > 0 ? cur.toFixed(decimals) : String(Math.round(cur));
      setDisplay((hasComma ? Number(fixed).toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}) : fixed) + suffix);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else done.current = true;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, once]);

  return display;
}

export const CountUp = ({ value, duration }) => useCountUp(value, { duration });

// ─── LAYOUT ──────────────────────────────────────────────────────────────────
export const Stack = ({ gap = SP.md, children, style }) => (
  <div style={{ display:"flex", flexDirection:"column", gap, ...style }}>{children}</div>
);

export const Inline = ({ gap = SP.sm, align = "center", wrap, children, style }) => (
  <div style={{ display:"flex", alignItems:align, gap, flexWrap: wrap ? "wrap" : "nowrap", ...style }}>{children}</div>
);

// Section heading. The eyebrow encodes what the section *is*, not decoration.
export const SectionTitle = ({ T, title, sub, right, icon:Icon }) => (
  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:SP.md, marginBottom:SP.md }}>
    <div style={{ minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:SP.sm }}>
        {Icon && (
          <div style={{ width:24, height:24, borderRadius:R.sm, background:T.blue+T.badge,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon size={13} color={T.blueBright} strokeWidth={2} />
          </div>
        )}
        <h2 style={{ ...TYPE.h2, color:T.text, margin:0 }}>{title}</h2>
      </div>
      {sub && <div style={{ ...TYPE.caption, color:T.muted, marginTop:3 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ─── SURFACE ─────────────────────────────────────────────────────────────────
// The one card in the product. `tone` tints it; `raised` lifts it; `interactive`
// makes it respond to the pointer.
export function Surface({
  T, tone, raised, interactive, selected, pad = SP.lg, radius = R.lg,
  children, style, onClick, className = "", title, ...rest
}) {
  const [hover, setHover] = useState(false);
  const accent = tone || null;
  const bg = raised ? T.surfaceRaised : T.surface;

  return (
    <div
      {...rest}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${interactive ? "pmo-lift " : ""}${className}`}
      style={{
        background: accent
          ? `linear-gradient(160deg, ${bg} 0%, ${bg} 62%, ${accent}${T.wash} 100%)`
          : bg,
        border: `1px solid ${selected ? accent || T.borderAccent : hover && interactive ? T.borderStrong : T.border}`,
        borderRadius: radius,
        padding: pad,
        position: "relative",
        overflow: "hidden",
        boxShadow: selected
          ? `0 0 0 1px ${accent || T.blue}${T.ring}, ${T.shadow}`
          : hover && interactive ? T.shadowLg : T.shadow,
        cursor: onClick ? "pointer" : "default",
        transition: `background ${MOTION.base}, border-color ${MOTION.base}, box-shadow ${MOTION.base}, transform ${MOTION.base}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────
// Replaces 96 individually-styled <button> elements.
export function Button({
  T, variant = "ghost", size = "md", icon:Icon, iconRight:IconR, children,
  onClick, disabled, loading, tone, title, full, type = "button", style, ...rest
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const c = tone || T.blue;

  const sizes = {
    sm: { padding:"5px 10px",  fontSize:11.5, gap:5, icon:12, radius:R.sm },
    md: { padding:"8px 14px",  fontSize:12.5, gap:6, icon:14, radius:R.sm },
    lg: { padding:"11px 20px", fontSize:14,   gap:8, icon:16, radius:R.md },
  }[size];

  const variants = {
    primary: { bg: hover ? T.blueBright : T.blue, fg:"#fff", border:"transparent", shadow:`0 2px 10px ${T.blue}44` },
    accent:  { bg: hover ? `${c}2E` : `${c}1F`,   fg:c,      border:`${c}55`,      shadow:"none" },
    ghost:   { bg: hover ? T.rowHover : "transparent", fg: hover ? T.text : T.muted, border:T.border, shadow:"none" },
    subtle:  { bg: hover ? T.rowHover : "transparent", fg: hover ? T.text : T.muted, border:"transparent", shadow:"none" },
    danger:  { bg: hover ? `${T.danger}2E` : `${T.danger}1A`, fg:T.danger, border:`${T.danger}55`, shadow:"none" },
  }[variant];

  return (
    <button
      {...rest}
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      className="pmo-focusable"
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        gap:sizes.gap, padding:sizes.padding, width: full ? "100%" : undefined,
        background:variants.bg, color:variants.fg,
        border:`1px solid ${variants.border}`, borderRadius:sizes.radius,
        fontFamily:TYPE.body.fontFamily, fontSize:sizes.fontSize, fontWeight:600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        boxShadow:variants.shadow,
        transform: press ? "scale(.975)" : "none",   // tactile press feedback (§20)
        transition:`background ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}, transform 90ms ease, box-shadow ${MOTION.fast}`,
        whiteSpace:"nowrap",
        ...style,
      }}
    >
      {loading
        ? <Spinner size={sizes.icon} color={variants.fg} />
        : Icon && <Icon size={sizes.icon} strokeWidth={2} />}
      {children}
      {IconR && <IconR size={sizes.icon} strokeWidth={2} />}
    </button>
  );
}

export const Spinner = ({ size = 14, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation:"pmoSpin .7s linear infinite" }}>
    <style>{"@keyframes pmoSpin{to{transform:rotate(360deg)}}"}</style>
    <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="3" opacity=".25" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// ─── ICON BUTTON ─────────────────────────────────────────────────────────────
// Icon-only controls always carry a title, so they're never unlabelled (§34).
export function IconButton({ T, icon:Icon, onClick, title, tone, size = 15, active, badge, style, ...rest }) {
  const [hover, setHover] = useState(false);
  const c = tone || (active ? T.blueBright : hover ? T.text : T.muted);
  return (
    <button
      {...rest}
      onClick={onClick} title={title} aria-label={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="pmo-focusable"
      style={{
        position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:32, height:32, borderRadius:R.sm,
        background: active ? T.blue+T.badge : hover ? T.rowHover : "transparent",
        border:`1px solid ${active ? T.borderAccent : "transparent"}`,
        color:c, cursor:"pointer",
        transition:`background ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
        ...style,
      }}
    >
      <Icon size={size} strokeWidth={2} />
      {badge > 0 && (
        <span style={{
          position:"absolute", top:2, right:2, minWidth:15, height:15, padding:"0 4px",
          borderRadius:R.pill, background:T.danger, color:"#fff",
          fontSize:9.5, fontWeight:700, fontFamily:TYPE.body.fontFamily,
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:`0 0 0 2px ${T.surface}`,
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
    </button>
  );
}

// ─── INPUTS ──────────────────────────────────────────────────────────────────
export function Input({ T, icon:Icon, value, onChange, placeholder, onClear, size = "md", full, style, ...rest }) {
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const pad = size === "sm" ? "5px 9px" : "8px 12px";
  const fs  = size === "sm" ? 11.5 : 13;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
      display:"flex", alignItems:"center", gap:7, padding:pad,
      background:T.inputBg,
      border:`1px solid ${focus ? T.inputFocus : hover ? T.borderStrong : value ? T.borderStrong : T.inputBorder}`,
      borderRadius:R.sm,
      boxShadow: focus ? `0 0 0 3px ${T.inputFocus}22` : "none",
      transition:`border-color ${MOTION.fast}, box-shadow ${MOTION.fast}`,
      width: full ? "100%" : undefined, minWidth:0, boxSizing:"border-box",
      ...style,
    }}>
      {Icon && <Icon size={13} color={focus ? T.inputFocus : T.muted} style={{ flexShrink:0 }} />}
      <input
        {...rest}
        value={value} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          background:"none", border:"none", outline:"none", flex:1, minWidth:0,
          fontFamily:TYPE.body.fontFamily, fontSize:fs, color:T.text,
        }}
      />
      {onClear && value ? (
        <button onClick={onClear} title="Clear"
          style={{ background:"none", border:"none", cursor:"pointer", color:T.dim, display:"flex", padding:0 }}>
          <XIcon size={12} />
        </button>
      ) : null}
    </div>
  );
}

const XIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export function Select({ T, value, onChange, children, size = "md", full, active, style, ...rest }) {
  const [focus, setFocus] = useState(false);
  const pad = size === "sm" ? "5px 9px" : "8px 12px";
  const fs  = size === "sm" ? 11.5 : 12.5;
  return (
    <select
      {...rest}
      className="pmo-select pmo-focusable"
      value={value} onChange={onChange}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        padding:pad, background:T.inputBg,
        border:`1px solid ${focus ? T.inputFocus : active ? T.borderAccent : T.inputBorder}`,
        borderRadius:R.sm,
        fontFamily:TYPE.body.fontFamily, fontSize:fs,
        color: active ? T.text : T.textSoft,
        fontWeight: active ? 600 : 400,
        cursor:"pointer", outline:"none", width: full ? "100%" : undefined,
        boxShadow: focus ? `0 0 0 3px ${T.inputFocus}22` : "none",
        transition:`border-color ${MOTION.fast}, box-shadow ${MOTION.fast}`,
        ...style,
      }}
    >{children}</select>
  );
}

// ─── BADGES ──────────────────────────────────────────────────────────────────
export function Badge({ T, color, children, size = "md", dot, style, hint, hintTitle }) {
  const [hot, setHot] = useState(false);
  const c = color || T.neutral;
  // Fill and dot keep the full-saturation hue; the label uses the AA-safe
  // variant, which matters on light surfaces where the raw hue reads at ~2:1.
  const fg = T.textOf ? T.textOf(c) : c;
  const s = size === "sm"
    ? { fontSize:10.5, padding:"2px 8px" }
    : { fontSize:11.5, padding:"3px 10px" };
  const pill = (
    <span
      onMouseEnter={hint ? () => setHot(true) : undefined}
      onMouseLeave={hint ? () => setHot(false) : undefined}
      style={{
        display:"inline-flex", alignItems:"center", gap:5,
        padding:s.padding, borderRadius:R.pill,
        background: hot ? `${c}${T.washStrong}` : `${c}${T.badge}`,
        color:fg,
        fontFamily:TYPE.body.fontFamily, fontSize:s.fontSize, fontWeight:600,
        whiteSpace:"nowrap", lineHeight:1.5,
        border:`1px solid ${c}${hot ? "5C" : "22"}`,
        cursor: hint ? "help" : "inherit",
        transition:`background ${MOTION.fast}, border-color ${MOTION.fast}`,
        ...style,
      }}>
      {dot && <span style={{ width:5, height:5, borderRadius:"50%", background:c, flexShrink:0 }} />}
      {children}
    </span>
  );
  if (!hint) return pill;
  return (
    <span style={{ position:"relative", display:"inline-flex" }}>
      {pill}
      <InsightTip T={T} show={hot} tone={c} side="top" align="left"
        width={230} title={hintTitle} line={hint} />
    </span>
  );
}

export const StatusDot = ({ color, size = 8, pulse }) => (
  <span className={pulse ? "pmo-pulse" : ""} style={{
    width:size, height:size, borderRadius:"50%", background:color, color,
    display:"inline-block", flexShrink:0,
  }} />
);

// ─── PROGRESS ────────────────────────────────────────────────────────────────
// Animates from 0 to its value on mount (§19).
export function Progress({ T, value, max = 100, color, height = 6, showTrack = true, delay = 0 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(pct), 60 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  const c = color || T.positive;
  return (
    <div style={{
      height, borderRadius:R.pill, overflow:"hidden",
      background: showTrack ? (T.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(16,42,71,0.07)") : "transparent",
    }}>
      <div style={{
        height:"100%", width:`${w}%`, borderRadius:R.pill,
        background:`linear-gradient(90deg, ${c}CC, ${c})`,
        transition:`width 900ms ${MOTION.ease}`,
      }} />
    </div>
  );
}

// ─── SKELETONS ───────────────────────────────────────────────────────────────
export function Skeleton({ T, w = "100%", h = 14, radius = R.sm, style }) {
  return (
    <div className="pmo-skeleton" style={{
      width:w, height:h, borderRadius:radius,
      background: T.mode === "dark" ? "rgba(255,255,255,0.045)" : "rgba(16,42,71,0.055)",
      backgroundImage:`linear-gradient(90deg, transparent, ${T.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)"}, transparent)`,
      backgroundSize:"420px 100%", backgroundRepeat:"no-repeat",
      animation:"pmoShimmer 1.5s ease-in-out infinite",
      ...style,
    }} />
  );
}

export const SkeletonCard = ({ T, h = 108 }) => (
  <Surface T={T} pad={SP.lg} style={{ flex:1, minWidth:0 }}>
    <Skeleton T={T} w={26} h={26} radius={R.sm} />
    <Skeleton T={T} w="55%" h={9} style={{ marginTop:SP.md }} />
    <Skeleton T={T} w="72%" h={22} style={{ marginTop:SP.sm }} />
    <Skeleton T={T} w="45%" h={9} style={{ marginTop:SP.sm }} />
  </Surface>
);

export const SkeletonChart = ({ T, h = 260 }) => (
  <div style={{ height:h, display:"flex", alignItems:"flex-end", gap:10, padding:SP.lg }}>
    {[42,66,38,80,54,72,48,88,60,76,50,68].map((p,i) => (
      <Skeleton key={i} T={T} w="100%" h={`${p}%`} radius={R.sm} style={{ animationDelay:`${i*60}ms` }} />
    ))}
  </div>
);

export const SkeletonRows = ({ T, rows = 10 }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:SP.sm, padding:SP.lg }}>
    {Array.from({ length:rows }).map((_, i) => (
      <Skeleton key={i} T={T} h={26} style={{ opacity: 1 - i*0.055, animationDelay:`${i*45}ms` }} />
    ))}
  </div>
);

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────
// Never a blank area. Icon, what's true, why, and a way forward (§21).
export function EmptyState({ T, icon:Icon, title, message, action, tone, compact }) {
  const c = tone || T.info;
  return (
    <div className="pmo-fade" style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:SP.sm, padding: compact ? `${SP.xxl}px ${SP.lg}px` : `${SP.xxxl}px ${SP.xl}px`,
      textAlign:"center",
    }}>
      {Icon && (
        <div style={{
          width:44, height:44, borderRadius:R.lg, background:`${c}${T.badge}`,
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:2,
          border:`1px solid ${c}26`,
        }}>
          <Icon size={19} color={c} strokeWidth={1.75} />
        </div>
      )}
      <div style={{ ...TYPE.h3, color:T.text }}>{title}</div>
      {message && <div style={{ ...TYPE.bodySm, color:T.muted, maxWidth:360 }}>{message}</div>}
      {action && <div style={{ marginTop:SP.xs }}>{action}</div>}
    </div>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
// Replaces 11 separately-styled overlays. Handles Escape, scroll lock, backdrop
// click and focus, so no page has to reimplement them.
export function Modal({ T, title, sub, onClose, children, footer, width = 560, icon:Icon, isMobile }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background: T.mode === "dark" ? "rgba(3,8,16,0.72)" : "rgba(12,30,51,0.42)",
        backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
        display:"flex", alignItems: isMobile ? "flex-end" : "center", justifyContent:"center",
        padding: isMobile ? 0 : SP.xl,
        animation:"pmoFade .18s ease",
      }}
    >
      <div className="pmo-scale pmo-scroll" role="dialog" aria-modal="true" style={{
        width: isMobile ? "100%" : width, maxWidth:"100%",
        maxHeight: isMobile ? "92vh" : "88vh",
        background:T.surface,
        border:`1px solid ${T.border}`,
        borderRadius: isMobile ? `${R.xl}px ${R.xl}px 0 0` : R.xl,
        boxShadow:T.shadowLg,
        display:"flex", flexDirection:"column", overflow:"hidden",
      }}>
        <div style={{
          display:"flex", alignItems:"flex-start", gap:SP.md,
          padding:`${SP.lg}px ${SP.xl}px`, borderBottom:`1px solid ${T.border}`, flexShrink:0,
        }}>
          {Icon && (
            <div style={{ width:30, height:30, borderRadius:R.sm, background:T.blue+T.badge,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Icon size={15} color={T.blueBright} />
            </div>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ ...TYPE.h2, color:T.text }}>{title}</div>
            {sub && <div style={{ ...TYPE.caption, color:T.muted, marginTop:2 }}>{sub}</div>}
          </div>
          <IconButton T={T} icon={XIcon} onClick={onClose} title="Close" />
        </div>

        <div className="pmo-scroll" style={{ padding:`${SP.xl}px`, overflowY:"auto", flex:1 }}>
          {children}
        </div>

        {footer && (
          <div style={{
            display:"flex", justifyContent:"flex-end", gap:SP.sm,
            padding:`${SP.md}px ${SP.xl}px`, borderTop:`1px solid ${T.border}`,
            background:T.pageAlt, flexShrink:0,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
export function Tooltip({ T, label, children, side = "top" }) {
  const [show, setShow] = useState(false);
  const pos = {
    top:    { bottom:"calc(100% + 7px)", left:"50%", transform:"translateX(-50%)" },
    bottom: { top:"calc(100% + 7px)",    left:"50%", transform:"translateX(-50%)" },
    right:  { left:"calc(100% + 7px)",   top:"50%",  transform:"translateY(-50%)" },
  }[side];
  return (
    <span style={{ position:"relative", display:"inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="pmo-fade" style={{
          position:"absolute", ...pos, zIndex:900,
          background: T.mode === "dark" ? "#1A2C46" : "#0C1E33",
          color:"#fff", padding:"5px 9px", borderRadius:R.sm,
          fontFamily:TYPE.body.fontFamily, fontSize:11, fontWeight:500,
          whiteSpace:"nowrap", pointerEvents:"none", boxShadow:T.shadowLg,
          border:`1px solid ${T.borderStrong}`,
        }}>{label}</span>
      )}
    </span>
  );
}

// ─── ARCH MOTIF ──────────────────────────────────────────────────────────────
// Riphah's Mughal-arch silhouette, kept as the institutional signature. Used
// sparingly — hero and featured surfaces only.
export const ArchMotif = ({ T, color, size = 76, opacity = 1 }) => {
  const light = T?.mode === "light";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true"
      style={{ position:"absolute", top:0, right:0, pointerEvents:"none", opacity }}>
      <path d="M72 72 L72 40 Q72 18 54 12 Q56 22 48 30 Q58 34 58 46 L58 72 Z" fill={color} opacity={light ? 0.13 : 0.085} />
      <path d="M72 72 L72 50 Q72 34 60 30 Q61 38 55 44 Q62 47 62 56 L62 72 Z" fill={color} opacity={light ? 0.2  : 0.14} />
    </svg>
  );
};

// ─── AMBIENT BACKGROUND ──────────────────────────────────────────────────────
// Barely-there atmospheric depth. Must never compete with data (§32).
export const Ambient = ({ T }) => (
  <div aria-hidden="true" style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
    <div className="pmo-drift" style={{
      position:"absolute", top:"-22%", right:"-8%", width:520, height:520, borderRadius:"50%",
      background:`radial-gradient(circle, ${T.blue}${T.mode === "dark" ? "14" : "10"} 0%, transparent 68%)`,
    }} />
    <div className="pmo-drift" style={{
      position:"absolute", bottom:"-28%", left:"6%", width:440, height:440, borderRadius:"50%",
      background:`radial-gradient(circle, ${T.positive}${T.mode === "dark" ? "0E" : "0C"} 0%, transparent 70%)`,
      animationDelay:"-8s",
    }} />
  </div>
);

// ─── TABS ────────────────────────────────────────────────────────────────────
// Animated underline that slides between tabs rather than cutting (§18).
export function Tabs({ T, tabs, active, onChange, isMobile }) {
  const wrap = useRef(null);
  const [ind, setInd] = useState({ left:0, width:0 });
  const [hover, setHover] = useState(null);

  const measure = useCallback(() => {
    const el = wrap.current?.querySelector(`[data-tab="${active}"]`);
    if (el) setInd({ left:el.offsetLeft, width:el.offsetWidth });
  }, [active]);

  useEffect(() => {
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [measure]);

  return (
    <div ref={wrap} className="pmo-scroll" style={{
      display:"flex", gap:2, position:"relative",
      borderBottom:`1px solid ${T.border}`,
      // visible so tab previews aren't clipped; horizontal scroll is handled by
      // the parent on narrow screens instead.
      overflow:"visible", flexShrink:0,
    }}>
      {tabs.map((t) => {
        const on   = t.id === active;
        const hot  = hover === t.id;
        return (
          <div key={t.id} style={{ position:"relative", display:"flex",
            zIndex: hot ? 20 : undefined }}
            onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
            <button data-tab={t.id} onClick={() => onChange(t.id)}
              onFocus={() => setHover(t.id)} onBlur={() => setHover(null)}
              className={`pmo-focusable ${hot ? "pmo-hot" : ""}`}
              style={{
                display:"flex", alignItems:"center", gap:7,
                padding: isMobile ? "9px 13px" : "10px 17px",
                // A soft surface grows behind the tab on hover, and the active
                // tab keeps a permanent one — so "current" and "about to be
                // current" are distinguishable at a glance (§9).
                background: on
                  ? `linear-gradient(180deg, ${T.blue}${T.wash}, transparent)`
                  : hot ? T.rowHover : "transparent",
                borderRadius: `${R.sm}px ${R.sm}px 0 0`,
                border:"none", cursor:"pointer",
                fontFamily:TYPE.body.fontFamily,
                fontSize: isMobile ? 12 : 12.5,
                fontWeight: on ? 700 : hot ? 600 : 500,
                color: on ? T.text : hot ? T.text : T.muted,
                whiteSpace:"nowrap",
                transition:`color ${MOTION.fast}, background ${MOTION.base}, font-weight ${MOTION.fast}`,
              }}>
              {t.Icon && (
                <t.Icon className={hot ? "pmo-ico-glow" : ""} size={14} strokeWidth={on ? 2.2 : 2}
                  color={on ? T.gold : hot ? T.blueBright : T.dim}
                  style={{ transition:`color ${MOTION.fast}` }} />
              )}
              {t.label}
              {t.count != null && (
                <span style={{
                  ...TYPE.caption, fontWeight:600,
                  padding:"1px 6px", borderRadius:R.pill,
                  background: on ? T.blue+T.badge : hot ? T.blue+T.wash
                    : T.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(16,42,71,0.06)",
                  color: on ? T.blueBright : T.dim,
                  transition:`background ${MOTION.fast}`,
                }}>{t.count}</span>
              )}
            </button>
            {/* Live preview of what the section contains (§8) */}
            {t.insight && (
              <InsightTip T={T} show={hot} side="bottom" align="left" width={252}
                tone={on ? T.gold : T.blueBright}
                title={t.insight.title} line={t.insight.line} stat={t.insight.stat} />
            )}
          </div>
        );
      })}
      <div style={{
        position:"absolute", bottom:-1, height:2, borderRadius:2,
        left:ind.left, width:ind.width,
        background:`linear-gradient(90deg, ${T.blue}, ${T.gold})`,
        boxShadow:`0 0 10px -1px ${T.gold}80`,
        transition:`left ${MOTION.base}, width ${MOTION.base}`,
      }} />
    </div>
  );
}

// ─── METRIC ──────────────────────────────────────────────────────────────────
// Owns the count-up hook so callers with conditional returns can't trip the
// Rules-of-Hooks crash.
export function Metric({ T, value, size = "metric", color, prefix, animate = true }) {
  const shown = useCountUp(animate ? value : String(value ?? ""));
  return (
    <span style={{ ...TYPE[size], color: color || T.text, display:"inline-flex", alignItems:"baseline", gap:5 }}>
      {prefix && <span style={{ ...TYPE.caption, fontWeight:600, color:T.muted, letterSpacing:"0.04em" }}>{prefix}</span>}
      {animate ? shown : value}
    </span>
  );
}


// ─── INSIGHT TIP ─────────────────────────────────────────────────────────────
// The contextual hover layer used by KPI cards, tabs, nav items and badges.
// Deliberately not a browser tooltip and not a generic dark box: it inherits
// the card chrome, animates in, and carries an optional live figure.
//
// §4 asked for "premium, not a boring tooltip"; §3 asked for one or two lines.
// The component enforces the second constraint by simply not having room for
// more — there is no scroll and no expansion.
export function InsightTip({ T, show, title, line, stat, tone, side = "bottom", align = "left", width = 250 }) {
  if (!show) return null;
  const c = tone || T.blueBright;
  const pos = {
    bottom: { top:"calc(100% + 9px)", ...(align === "center" ? { left:"50%", transform:"translateX(-50%)" } : align === "right" ? { right:0 } : { left:0 }) },
    top:    { bottom:"calc(100% + 9px)", ...(align === "center" ? { left:"50%", transform:"translateX(-50%)" } : { left:0 }) },
    right:  { left:"calc(100% + 10px)", top:"50%", transform:"translateY(-50%)" },
  }[side];

  return (
    <div className="pmo-rise" role="tooltip" style={{
      position:"absolute", ...pos, zIndex:200, width, maxWidth:"78vw",
      background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.99)",
      border:`1px solid ${T.borderStrong}`,
      borderRadius:R.md, padding:`${SP.sm}px ${SP.md}px`,
      boxShadow:T.shadowLg, pointerEvents:"none",
      backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
    }}>
      {/* Accent edge ties the tip to whatever it is describing */}
      <div style={{ position:"absolute", left:0, top:8, bottom:8, width:2,
        borderRadius:2, background:c, opacity:.85 }} />
      {title && <div style={{ ...TYPE.label, color:c, marginBottom:3 }}>{title}</div>}
      <div style={{ ...TYPE.caption, color:T.textSoft, lineHeight:1.5 }}>{line}</div>
      {stat && (
        <div style={{ ...TYPE.caption, color:T.text, fontWeight:700, marginTop:5,
          fontVariantNumeric:"tabular-nums" }}>{stat}</div>
      )}
    </div>
  );
}

// Wraps any element so it reveals an InsightTip on hover or keyboard focus.
export function WithInsight({ T, title, line, stat, tone, side, align, width, children, style }) {
  const [on, setOn] = useState(false);
  if (!line) return children;
  return (
    <span
      onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}
      onFocus={() => setOn(true)} onBlur={() => setOn(false)}
      style={{ position:"relative", display:"inline-flex", ...style }}>
      {children}
      <InsightTip T={T} show={on} title={title} line={line} stat={stat}
        tone={tone} side={side} align={align} width={width} />
    </span>
  );
}


// ─── SECTION ─────────────────────────────────────────────────────────────────
// Wraps a major dashboard block (§13). Two jobs:
//   · responds to interaction — lifts fractionally and warms its border, so a
//     section the reader is working in is visibly the active one;
//   · carries its own atmospheric gradient (§17), painted behind the content at
//     very low opacity. Per-section rather than one page-wide wash, which is
//     what gives the dashboard depth instead of a flat tint.
export function Section({ T, tone, children, style, pad = SP.lg, glow = true, className = "" }) {
  const [hot, setHot] = useState(false);
  const c = tone || T.blue;
  return (
    <div
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      className={className}
      style={{
        position:"relative", overflow:"hidden",
        background:T.surface,
        border:`1px solid ${hot ? T.borderStrong : T.border}`,
        borderRadius:R.lg, padding:pad,
        boxShadow: hot ? T.shadowLg : T.shadow,
        transform: hot ? "translateY(-1px)" : "none",
        transition:`border-color ${MOTION.base}, box-shadow ${MOTION.base}, transform ${MOTION.base}`,
        ...style,
      }}>
      {glow && (
        <div aria-hidden="true" className="pmo-drift" style={{
          position:"absolute", top:"-40%", right:"-6%", width:340, height:340,
          borderRadius:"50%", pointerEvents:"none",
          background:`radial-gradient(circle, ${c}${T.mode === "dark" ? "12" : "0C"} 0%, transparent 68%)`,
          opacity: hot ? 1 : 0.65, transition:`opacity ${MOTION.slow}`,
        }} />
      )}
      <div style={{ position:"relative" }}>{children}</div>
    </div>
  );
}


// ─── SHARED PAGE + TABLE TREATMENT ───────────────────────────────────────────
// Ten pages had drifted into ten different treatments: four carried the ambient
// background and six didn't; five tables each defined their own header and row
// styling; cards were a mix of <Surface> and hand-written divs. These helpers
// are the single definition, applied everywhere, so a page can't look like a
// different product just because it was written on a different day.

/** Scroll container for any full page. Carries the ambient wash and the
 *  standard gutters, so every page sits on the same ground. */
export const pageBody = (T, { pad = true, compact = false } = {}) => ({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  background: T.page,
  backgroundImage: T.ambient,
  backgroundAttachment: "local",
  padding: pad ? (compact ? `${SP.lg}px ${SP.lg}px ${SP.xxl}px` : `${SP.xl}px ${SP.xxl}px ${SP.xxl}px`) : 0,
});

/** A toolbar / filter strip pinned above page content. */
export const pageBar = (T, { compact = false } = {}) => ({
  display: "flex", alignItems: "center", gap: SP.sm, flexWrap: "wrap",
  padding: `${SP.sm}px ${compact ? SP.lg : SP.xl}px`,
  background: T.surface,
  borderBottom: `1px solid ${T.border}`,
  flexShrink: 0,
});

/** The card chrome, for places where a plain object is easier to drop in than
 *  swapping the element for <Surface>. Identical output either way. */
export const cardStyle = (T, { raised = false, pad = SP.lg, radius = R.lg } = {}) => ({
  background: raised ? T.surfaceRaised : T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: radius,
  padding: pad,
  boxShadow: T.shadow,
});

/** One table treatment: sticky header band, uppercase labels, hairline rows,
 *  zebra striping and ellipsis. Every table in the product reads from this. */
export const tableStyles = (T) => ({
  // Default is auto layout: it sizes columns to their content, which is right
  // for tables that don't declare column widths. `tableFixed` is for tables
  // that DO (Projects, Campus) — there, fixed layout is what guarantees the
  // last column can't be pushed off-screen. Using fixed without widths gives
  // every column an equal share, which crushes a project-name column to a
  // fourteenth of the table.
  table: { width:"100%", borderCollapse:"separate", borderSpacing:0 },
  tableFixed: { width:"100%", borderCollapse:"separate", borderSpacing:0, tableLayout:"fixed" },
  th: {
    ...TYPE.label, color:T.muted, textAlign:"left",
    padding:"10px 12px 8px", whiteSpace:"nowrap",
    background:T.surfaceRaised, boxShadow:`inset 0 -1px 0 ${T.border}`,
    position:"sticky", top:0, zIndex:2,
  },
  td: {
    ...TYPE.bodySm, color:T.text, padding:"10px 12px",
    borderBottom:`1px solid ${T.border}`, verticalAlign:"middle",
    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
    maxWidth:280,
  },
  row: (i, hovered, accent) => ({
    background: hovered
      ? (accent ? `linear-gradient(90deg, ${accent}14, ${T.rowHover} 22%)` : T.rowHover)
      : i % 2 === 0 ? "transparent" : T.rowAlt,
    transition:`background ${MOTION.fast}`,
  }),
});


// ─── RANKED BARS ─────────────────────────────────────────────────────────────
// Replaces three separate treatments on the CAPEX Overview tab: a 3-slice donut
// with overlapping labels, a vertical stacked bar with two categories and a lot
// of empty air, and a flat gold bar list with no values.
//
// The design problem those shared: nothing was comparable. Each segment card
// carried its own "Released 100.0%" bar — released ÷ approved, which is always
// full — so a segment with 0.2% of its target released looked identical to one
// at 54%. Here every row is drawn on ONE shared scale, so length means the same
// thing everywhere, and the target sits behind the actual as a ghost track so
// the gap is the thing you see.
export function RankedBars({
  T, items, fmt = (v) => v, max, showTarget = true,
  barH = 10, gap = SP.md, onPick, activeKey, emptyLabel = "Nothing to compare yet",
}) {
  const [hot, setHot] = useState(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 80); return () => clearTimeout(t); }, []);

  const rows = (items || []).filter(Boolean);
  if (!rows.length) {
    return <div style={{ ...TYPE.caption, color:T.muted, padding:`${SP.lg}px 0` }}>{emptyLabel}</div>;
  }
  const ceiling = max ?? Math.max(...rows.map(r => Math.max(r.value || 0, showTarget ? (r.target || 0) : 0)), 1);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap }}>
      {rows.map((r, i) => {
        const on      = hot === r.key || activeKey === r.key;
        const dimmed  = (hot && hot !== r.key) || (activeKey && activeKey !== r.key);
        const c       = r.color || T.info;
        // Only applied where a caller still passes opacityStep; lists using the
        // rank ramp carry their ordering in hue instead.
        const step    = r.opacityStep != null ? Math.max(0.55, 0.55 + r.opacityStep * 0.45) : 1;
        const vPct    = ceiling > 0 ? Math.min(100, ((r.value || 0) / ceiling) * 100) : 0;
        const tPct    = ceiling > 0 ? Math.min(100, ((r.target || 0) / ceiling) * 100) : 0;
        const share   = r.target > 0 ? ((r.value || 0) / r.target) * 100 : null;

        return (
          <div key={r.key}
            onMouseEnter={() => setHot(r.key)} onMouseLeave={() => setHot(null)}
            onClick={() => onPick?.(r.key)}
            style={{
              cursor: onPick ? "pointer" : "default",
              opacity: dimmed ? 0.45 : 1,
              transition:`opacity ${MOTION.base}`,
            }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:SP.sm, marginBottom:5 }}>
              <span style={{ width:8, height:8, borderRadius:2, background:c, flexShrink:0,
                boxShadow: on ? `0 0 8px -1px ${c}` : "none", transition:`box-shadow ${MOTION.base}` }} />
              <span title={r.label} style={{
                ...TYPE.bodySm, color: on ? T.text : T.textSoft, fontWeight: on ? 600 : 500,
                textDecoration: on && onPick ? "underline" : "none",
                textUnderlineOffset:3, textDecorationColor:`${c}88`,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0,
                transition:`color ${MOTION.fast}`,
              }}>{r.label}</span>
              {r.meta && <span style={{ ...TYPE.caption, color: on ? T.muted : T.dim, flexShrink:0,
                transition:`color ${MOTION.fast}` }}>{r.meta}</span>}
              <span style={{ ...TYPE.bodySm, fontWeight:700, color:T.textOf ? T.textOf(c) : c,
                fontVariantNumeric:"tabular-nums", flexShrink:0 }}>{fmt(r.value)}</span>
            </div>

            <div style={{ position:"relative", height:barH, borderRadius:R.pill,
              background: T.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(16,42,71,0.055)" }}>
              {/* Target sits behind as a ghost, so the shortfall is visible as
                  distance rather than needing to be read off a number. */}
              {showTarget && r.target > 0 && (
                <div style={{
                  position:"absolute", inset:0, width: drawn ? `${tPct}%` : 0,
                  borderRadius:R.pill, background:`${c}22`,
                  border:`1px dashed ${c}55`, boxSizing:"border-box",
                  transition:`width 900ms ${MOTION.ease}`,
                }} />
              )}
              <div style={{
                position:"absolute", top:0, bottom:0, left:0,
                width: drawn ? `${vPct}%` : 0,
                borderRadius:R.pill,
                background:`linear-gradient(90deg, ${c}CC, ${c})`,
                opacity: on ? 1 : step,
                boxShadow: on ? `0 0 12px -2px ${c}` : "none",
                transition:`width 900ms ${MOTION.ease}, box-shadow ${MOTION.base}`,
              }} />
            </div>

            {showTarget && r.target > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                <span style={{ ...TYPE.caption, color:T.muted }}>
                  {share != null ? `${share.toFixed(1)}% of ${fmt(r.target)} target` : ""}
                </span>
                <span style={{ ...TYPE.caption, color: on ? T.textSoft : T.dim }}>
                  {fmt(Math.max(0, (r.target || 0) - (r.value || 0)))} remaining
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SHARE STRIP ─────────────────────────────────────────────────────────────
// A donut answers "what share?" but a 3-slice donut with labels around the ring
// spends a lot of space to do it. This says the same thing in one line, and the
// segments are directly comparable by length.
export function ShareStrip({ T, items, fmt = (v) => v, height = 14, onPick, activeKey }) {
  const [hot, setHot] = useState(null);
  const rows = (items || []).filter(r => (r.value || 0) > 0);
  const total = rows.reduce((a, b) => a + (b.value || 0), 0);
  if (!total) return null;

  return (
    <div>
      <div style={{ display:"flex", height, borderRadius:R.pill, overflow:"hidden", gap:2 }}>
        {rows.map(r => {
          const pct = (r.value / total) * 100;
          const dimmed = (hot && hot !== r.key) || (activeKey && activeKey !== r.key);
          return (
            <div key={r.key} title={`${r.label} — ${fmt(r.value)} (${pct.toFixed(1)}%)`}
              onMouseEnter={() => setHot(r.key)} onMouseLeave={() => setHot(null)}
              onClick={() => onPick?.(r.key)}
              style={{
                width:`${pct}%`, background:`linear-gradient(180deg, ${r.color}, ${r.color}CC)`,
                opacity: dimmed ? 0.35 : 1, cursor:onPick ? "pointer" : "default",
                transition:`opacity ${MOTION.base}`,
              }} />
          );
        })}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:`4px ${SP.lg}px`, marginTop:SP.sm }}>
        {rows.map(r => {
          const pct = (r.value / total) * 100;
          return (
            <span key={r.key} onMouseEnter={() => setHot(r.key)} onMouseLeave={() => setHot(null)}
              style={{ display:"inline-flex", alignItems:"center", gap:6, ...TYPE.caption,
                color: hot === r.key ? T.text : T.muted, cursor:onPick ? "pointer" : "default" }}>
              <span style={{ width:7, height:7, borderRadius:2, background:r.color }} />
              {r.label}
              <strong style={{ color:T.textSoft, fontVariantNumeric:"tabular-nums" }}>{pct.toFixed(1)}%</strong>
            </span>
          );
        })}
      </div>
    </div>
  );
}
