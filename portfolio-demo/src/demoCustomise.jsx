// Portfolio demo: the "Make it yours" panel. Organisation name, logo (four marks or an upload), primary
// and accent colours, currency and the words the portal uses. A live preview in the panel; "Apply"
// saves the choices in this browser and redraws the portal on the same page.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, CURRENCIES, SITE_WORDS, MANAGER_WORDS, OFFICE_WORDS, PRIMARIES, ACCENTS, LOGO_STYLES, wordmark, paletteOf, compact, orgName, isDefault } from "./demoBrand.js";
import { track } from "./demoAnalytics.js";

const CSS = `
.mc-back{position:fixed;inset:0;z-index:2147482700;background:rgba(4,10,20,.45)}
.mc{position:fixed;top:0;right:0;bottom:0;z-index:2147482701;width:min(420px,100vw);display:flex;flex-direction:column;background:#0f2136;color:#eef4fb;
  border-left:1px solid rgba(127,209,199,.25);box-shadow:-20px 0 50px rgba(0,0,0,.4);font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:14px;animation:mcIn .28s cubic-bezier(.16,1,.3,1)}
@keyframes mcIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
@media (max-width:600px){.mc{top:auto;left:0;width:100vw;height:88vh;border-left:0;border-top:1px solid rgba(127,209,199,.25);border-radius:16px 16px 0 0;animation-name:mcUp}}
@keyframes mcUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.mc *{box-sizing:border-box}
.mc button,.mc input,.mc select{font:inherit;color:inherit}
.mc :focus-visible{outline:2px solid #7fd1c7;outline-offset:2px}
.mc-h{display:flex;align-items:center;gap:10px;padding:16px 16px 10px;border-bottom:1px solid rgba(148,178,214,.16)}
.mc-h h2{margin:0;font-size:18px}
.mc-h p{margin:2px 0 0;color:#a3b6cc;font-size:12.5px}
.mc-x{margin-left:auto;background:none;border:0;width:34px;height:34px;border-radius:8px;font-size:20px;cursor:pointer;color:#a3b6cc!important}
.mc-x:hover{background:rgba(255,255,255,.06)}
.mc-body{flex:1;overflow:auto;padding:6px 16px 16px}
.mc-sec{margin-top:16px}
.mc-sec>label,.mc-lab{display:block;font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#a3b6cc;margin-bottom:8px}
.mc-in{width:100%;height:40px;border-radius:10px;border:1px solid rgba(148,178,214,.26);background:#0b1a2b;padding:0 12px}
.mc-in:focus{border-color:#7fd1c7}
.mc-logos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mc-logo{height:58px;border-radius:10px;border:1px solid rgba(148,178,214,.22);background:#13283f;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:6px}
.mc-logo img{max-width:100%;max-height:100%}
.mc-logo[aria-pressed="true"]{border-color:#7fd1c7;box-shadow:0 0 0 1px #7fd1c7 inset}
.mc-up{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.mc-btn{height:36px;padding:0 12px;border-radius:9px;border:1px solid rgba(148,178,214,.26);background:rgba(255,255,255,.04);font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.mc-btn:hover{border-color:#7fd1c7}
.mc-btn.pri{background:#2a9d8f;border-color:#2a9d8f;color:#fff}
.mc-sw{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mc-dot{width:30px;height:30px;border-radius:50%;border:2px solid transparent;cursor:pointer;box-shadow:0 0 0 1px rgba(255,255,255,.15) inset}
.mc-dot[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 2px #7fd1c7}
.mc-pick{width:34px;height:30px;border:0;background:none;padding:0;cursor:pointer}
.mc-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mc-seg button{height:38px;border-radius:9px;border:1px solid rgba(148,178,214,.26);background:rgba(255,255,255,.04);font-weight:700;cursor:pointer}
.mc-seg button[aria-pressed="true"]{background:rgba(42,157,143,.22);border-color:#2a9d8f;color:#7fd1c7}
.mc-note{color:#a3b6cc;font-size:12px;margin:6px 0 0;line-height:1.45}
.mc-row{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center;margin-bottom:8px}
.mc-row span{color:#d6e2ef;font-size:13px}
.mc-prev{margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid rgba(148,178,214,.2);display:grid;grid-template-columns:120px 1fr}
.mc-prev .side{padding:10px 8px}
.mc-prev .side img{width:100%}
.mc-prev .side i{display:block;height:7px;border-radius:4px;background:rgba(255,255,255,.18);margin:8px 4px}
.mc-prev .side i.on{background:var(--acc)}
.mc-prev .main{background:#0b1726;padding:10px 12px}
.mc-prev .k{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:#a3b6cc}
.mc-prev .v{font-size:22px;font-weight:800;margin:2px 0 6px;color:var(--acc)}
.mc-prev .chip{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--pri);color:#fff;margin-right:4px}
.mc-f{display:flex;gap:8px;align-items:center;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(148,178,214,.16);flex-wrap:wrap}
.mc-f small{color:#a3b6cc;font-size:11.5px;flex-basis:100%}
.mc-err{color:#f0637d;font-size:12.5px;margin-top:6px}
`;
let cssIn = false;
const BASE_TOTAL = 447.5e6;   // the demo portfolio's total, in the data's base currency (preview only)

export function Customise({ brand, onApply, onClose }) {
  const [b, setB] = useState({ ...brand });
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const firstRef = useRef(null);
  useEffect(() => { if (!cssIn) { cssIn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); } firstRef.current?.focus(); }, []);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const set = (k, v) => setB((x) => ({ ...x, [k]: v }));
  const pal = useMemo(() => paletteOf(b), [b]);
  const marks = useMemo(() => Object.fromEntries(LOGO_STYLES.map((st) => [st, wordmark({ ...b, logoStyle: st }, { dark: true })])), [b.name, b.primary, b.accent]);   // eslint-disable-line react-hooks/exhaustive-deps
  const logo = b.logo || marks[b.logoStyle];
  const [s1, sN] = SITE_WORDS[b.site];
  const rate = CURRENCIES[b.currency].rate;
  const upload = (f) => {
    setErr("");
    if (!f) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) { setErr("Use a PNG, JPG, WebP or SVG image."); return; }
    if (f.size > 400 * 1024) { setErr("That image is over 400 KB; a smaller copy works best here."); return; }
    const r = new FileReader();
    r.onload = () => { set("logo", String(r.result)); track("feature_used", { feature: "customise_logo_upload" }); };
    r.readAsDataURL(f);
  };
  const apply = () => {
    track("feature_used", { feature: "customise_apply", currency: b.currency, site: b.site, manager: b.manager, office: b.office, logo: b.logo ? "upload" : b.logoStyle, named: !!b.name.trim() });
    if (b.currency !== brand.currency) track("feature_used", { feature: "currency_switch", from: brand.currency, to: b.currency });
    onApply(b);
  };
  return (
    <>
      <div className="mc-back" onClick={onClose} />
      <div className="mc" role="dialog" aria-modal="true" aria-labelledby="mc-t" data-customise>
        <div className="mc-h">
          <div><h2 id="mc-t">Make it yours</h2><p>See the portal with your organisation's name, logo, colours, currency and words.</p></div>
          <button type="button" className="mc-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="mc-body">
          <div className="mc-sec">
            <label htmlFor="mc-name">Organisation name</label>
            <input id="mc-name" ref={firstRef} className="mc-in" maxLength={48} placeholder="Your Organisation" value={b.name} data-mc="name"
              onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="mc-sec">
            <span className="mc-lab">Logo</span>
            <div className="mc-logos" role="group" aria-label="Logo">
              {LOGO_STYLES.map((st) => (
                <button key={st} type="button" className="mc-logo" aria-pressed={!b.logo && b.logoStyle === st} aria-label={`${st} mark`} data-mc-logo={st}
                  style={{ background: pal.navyDeep }} onClick={() => setB((x) => ({ ...x, logo: null, logoStyle: st }))}><img src={marks[st]} alt="" /></button>
              ))}
            </div>
            <div className="mc-up">
              <button type="button" className="mc-btn" onClick={() => fileRef.current?.click()}>Upload your logo…</button>
              {b.logo && <><span className="mc-logo" style={{ height: 40, width: 120, background: pal.navyDeep }} aria-pressed="true"><img src={b.logo} alt="Your logo" /></span>
                <button type="button" className="mc-btn" onClick={() => set("logo", null)}>Remove</button></>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden data-mc="upload" onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            {err && <div className="mc-err" role="alert">{err}</div>}
            <p className="mc-note">Your logo stays in this browser. On the dark sidebar the portal shows it in white.</p>
          </div>
          <div className="mc-sec">
            <span className="mc-lab">Main colour</span>
            <div className="mc-sw" role="group" aria-label="Main colour">
              {PRIMARIES.map((c) => <button key={c} type="button" className="mc-dot" style={{ background: c }} aria-pressed={b.primary.toUpperCase() === c} aria-label={c} data-mc-primary={c} onClick={() => set("primary", c)} />)}
              <input className="mc-pick" type="color" value={b.primary} aria-label="Pick a main colour" onChange={(e) => set("primary", e.target.value.toUpperCase())} />
            </div>
            <span className="mc-lab" style={{ marginTop: 12 }}>Accent colour</span>
            <div className="mc-sw" role="group" aria-label="Accent colour">
              {ACCENTS.map((c) => <button key={c} type="button" className="mc-dot" style={{ background: c }} aria-pressed={b.accent.toUpperCase() === c} aria-label={c} data-mc-accent={c} onClick={() => set("accent", c)} />)}
              <input className="mc-pick" type="color" value={b.accent} aria-label="Pick an accent colour" onChange={(e) => set("accent", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="mc-sec">
            <span className="mc-lab">Currency</span>
            <div className="mc-seg" role="group" aria-label="Currency">
              {Object.keys(CURRENCIES).map((c) => <button key={c} type="button" aria-pressed={b.currency === c} title={CURRENCIES[c].label} data-mc-currency={c} onClick={() => set("currency", c)}>{c}</button>)}
            </div>
            <p className="mc-note">Every figure is converted at fixed demo rates (1 USD = 280 PKR, 1 GBP = 355 PKR, 1 AED = 76.25 PKR). In your deployment: your currency, or several.</p>
          </div>
          <div className="mc-sec">
            <span className="mc-lab">Your words</span>
            <div className="mc-row"><span>Places are called</span>
              <select className="mc-in" value={b.site} data-mc="site" onChange={(e) => set("site", e.target.value)}>{Object.entries(SITE_WORDS).map(([k, [one, many]]) => <option key={k} value={k}>{one} / {many}</option>)}</select></div>
            <div className="mc-row"><span>Managers are called</span>
              <select className="mc-in" value={b.manager} data-mc="manager" onChange={(e) => set("manager", e.target.value)}>{Object.entries(MANAGER_WORDS).map(([k, [one]]) => <option key={k} value={k}>{one}</option>)}</select></div>
            <div className="mc-row"><span>The office is called</span>
              <select className="mc-in" value={b.office} data-mc="office" onChange={(e) => set("office", e.target.value)}>{Object.entries(OFFICE_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></div>
            <p className="mc-note">In your deployment: any field, stage, role or label, and your approval chain.</p>
          </div>
          <div className="mc-sec">
            <span className="mc-lab">Preview</span>
            <div className="mc-prev" style={{ "--acc": b.accent, "--pri": b.primary }} aria-label="Preview">
              <div className="side" style={{ background: `linear-gradient(180deg, ${pal.navy}, ${pal.navyDeep})` }}><img src={logo} alt="" /><i className="on" /><i /><i /><i /></div>
              <div className="main">
                <div className="k">Total capital budget</div>
                <div className="v" data-mc-preview="total">{b.currency} {compact(BASE_TOTAL / rate)}</div>
                <span className="chip">{sN}</span><span className="chip" style={{ background: "rgba(255,255,255,.12)" }}>{MANAGER_WORDS[b.manager][1]}</span>
                <div className="mc-note" style={{ marginTop: 8 }}>{orgName(b)} · {OFFICE_WORDS[b.office]} · 8 {sN.toLowerCase()}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mc-f">
          <button type="button" className="mc-btn pri" data-mc="apply" onClick={apply}>Apply to the portal</button>
          <button type="button" className="mc-btn" data-mc="defaults" disabled={isDefault(b)} onClick={() => setB({ ...DEFAULTS })}>Back to defaults</button>
          <small>Saved in this browser only. Reset demo keeps your look; “Back to defaults” clears it.</small>
        </div>
      </div>
    </>
  );
}
