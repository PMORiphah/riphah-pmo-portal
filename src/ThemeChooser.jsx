// Theme chooser (24 Nov 2026, /preview/ only). A palette button in the top bar opens a list of the original look
// and the seven optional themes, each with a small drawing of its colours. Choosing one stores it on this device
// and reloads the page (the themes replace the colour tokens, which are read once at start-up).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette, Check, X } from "lucide-react";
import { IconButton } from "./ui.jsx";
import { themeList, activeTheme, chooseTheme } from "./themeBoot.js";

const ORIGINAL = { key: null, name: "Original", mode: "dark / light", blurb: "Today's portal: navy glass, the silk ribbon and the sun and moon switch.",
  swatch: { side: "#0D2440", page: "#070E1B", hero: "#14395C", accent: "#E0A94A", line: "#4A9BE0" } };

function Swatch({ s }) {
  return (
    <svg width="64" height="44" viewBox="0 0 64 44" aria-hidden="true" style={{ flexShrink: 0, borderRadius: 6, display: "block" }}>
      <rect width="64" height="44" rx="6" fill={s.page} />
      <rect width="17" height="44" fill={s.side} />
      <rect x="4" y="7" width="9" height="2" rx="1" fill="#fff" opacity=".55" />
      <rect x="2" y="15" width="13" height="5" rx="1.5" fill={s.accent} opacity=".35" />
      <rect x="2" y="15" width="1.6" height="5" fill={s.accent} />
      <rect x="4" y="24" width="9" height="1.6" rx=".8" fill="#fff" opacity=".35" />
      <rect x="4" y="29" width="7" height="1.6" rx=".8" fill="#fff" opacity=".35" />
      <rect x="21" y="5" width="39" height="15" rx="2.5" fill={s.hero} stroke={s.line} strokeOpacity=".35" strokeWidth=".8" />
      <rect x="24" y="9" width="14" height="2.4" rx="1.2" fill={s.line} opacity=".8" />
      <rect x="24" y="14" width="9" height="2" rx="1" fill={s.accent} />
      <rect x="21" y="24" width="12" height="15" rx="2" fill={s.line} opacity=".12" />
      <rect x="35" y="24" width="12" height="15" rx="2" fill={s.line} opacity=".12" />
      <rect x="49" y="24" width="11" height="15" rx="2" fill={s.accent} opacity=".22" />
      <rect x=".5" y=".5" width="63" height="43" rx="5.5" fill="none" stroke="#000" strokeOpacity=".18" />
    </svg>
  );
}

export default function ThemeChooser({ T, isCompact }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const box = useRef(null);
  const current = activeTheme();
  const items = [ORIGINAL, ...themeList()];

  const place = () => {
    const el = btn.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target) && !(btn.current && btn.current.contains(e.target))) setOpen(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("pointerdown", onDown, true); window.addEventListener("resize", place);
    setTimeout(() => { const first = box.current && box.current.querySelector('[aria-checked="true"]'); first && first.focus(); }, 30);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("resize", place); };
  }, [open]);

  const width = isCompact ? "calc(100vw - 24px)" : 380;
  return (
    <>
      <span ref={btn} style={{ display: "inline-flex" }}>
        <IconButton T={T} data-tour="theme-chooser" icon={Palette} active={open} onClick={() => setOpen(o => !o)}
          title="Themes (preview)" aria-haspopup="dialog" aria-expanded={open} />
      </span>
      {open && pos && createPortal(
        <div ref={box} role="dialog" aria-label="Choose a theme" className="pmo-theme-pop" style={{
          position: "fixed", top: pos.top, right: isCompact ? 12 : pos.right, width, maxHeight: `calc(100vh - ${pos.top + 16}px)`,
          overflowY: "auto", zIndex: 2000, background: T.surfaceOver, color: T.text,
          border: `1px solid ${T.borderStrong}`, borderRadius: 14, boxShadow: T.shadowLg,
          fontFamily: T.TYPE?.body?.fontFamily, padding: 10,
        }}>
          <style>{`.pmo-theme-pop{animation:pmoThemePop .2s cubic-bezier(.2,.8,.2,1) both}
            @keyframes pmoThemePop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
            .pmo-theme-opt{transition:background .18s ease, border-color .18s ease, transform .18s ease}
            .pmo-theme-opt:hover{transform:translateY(-1px)}
            @media (prefers-reduced-motion: reduce){.pmo-theme-pop,.pmo-theme-opt{animation:none;transition:none}.pmo-theme-opt:hover{transform:none}}`}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 10px" }}>
            <Palette size={15} color={T.goldText} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>Themes</div>
              <div style={{ fontSize: 11, color: T.muted }}>Preview only · saved on this device</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="pmo-focusable" style={{
              background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex" }}>
              <X size={15} />
            </button>
          </div>
          <div role="radiogroup" aria-label="Themes" style={{ display: "grid", gap: 6 }}>
            {items.map((it) => {
              const on = (it.key || null) === (current || null);
              return (
                <button key={it.key || "original"} role="radio" aria-checked={on} className="pmo-theme-opt pmo-focusable"
                  onClick={() => { if (on) { setOpen(false); return; } chooseTheme(it.key); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
                    padding: "8px 10px", borderRadius: 10, cursor: "pointer", color: T.text,
                    background: on ? T.rowActive : "transparent",
                    border: `1px solid ${on ? T.borderAccent : "transparent"}`,
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.rowHover; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  <Swatch s={it.swatch} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 650 }}>{it.name}</span>
                      <span style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted,
                        border: `1px solid ${T.border}`, borderRadius: 999, padding: "0 6px", lineHeight: "16px" }}>{it.mode}</span>
                    </span>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                      fontSize: 11.5, lineHeight: 1.4, color: T.textSoft, marginTop: 2 }}>{it.blurb}</span>
                  </span>
                  {on && <Check size={16} color={T.goldText} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: T.muted, padding: "10px 8px 4px", lineHeight: 1.45 }}>
            The page reloads to apply a theme. Figures, pages and access stay exactly the same.
          </div>
        </div>,
        document.body)}
    </>
  );
}
