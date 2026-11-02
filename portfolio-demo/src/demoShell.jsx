// Portfolio demo: what sits around the portal — the start screen (who you are, tour or free
// exploration, privacy line, copyright and terms), the demo bar above the portal (role switch,
// guided tour, reset, contact) and the reset confirmation. Rendered in its own root, outside the App.
import React, { useEffect, useState } from "react";
import { track } from "./demoAnalytics.js";

export const OWNER = "Abdullah Azhar";
export const OWNER_URL = "https://www.upwork.com/freelancers/~015400e3035d103eb3";
export const YEAR = 2026;
export const BAR_H = 40;

export const ROLES = [
  { id: "pmo", title: "PMO admin", who: "PMO Admin",
    text: "Runs the portfolio: every page, every edit, budgets, cash flows, proposals, users and settings." },
  { id: "project_manager", title: "Project manager", who: "Nadia Fairweather",
    text: "Sees only her 7 projects. Records progress in the work plan, ticks deliverables and posts updates." },
  { id: "guest", title: "Senior management", who: "Sana Whitcombe",
    text: "Reads the whole portfolio: dashboard, sites, performance, risks, timeline and past projects." },
];
export const roleTitle = (id) => ROLES.find((r) => r.id === id)?.title || "PMO admin";

const PRIVACY = "Demo: all data is fictional, and what you change stays in this browser. This demo records anonymous usage (pages and steps viewed) to improve it. No personal data is collected.";
export const TERMS = `© ${YEAR} ${OWNER}. All rights reserved. This demo lets prospective clients see the author's work and may be used online for that purpose only. ` +
  "Copying, saving for redistribution, decompiling, reverse-engineering, scraping, reselling or reusing its code, design or content, in whole or in part, " +
  "or building a product from it, needs the author's written permission. All organisations, people, projects and figures are fictional; any resemblance is coincidental. " +
  "Provided as is, without warranty.";

const CSS = `
.dm{--bg:#0b1726;--panel:#11233a;--panel2:#162c47;--line:rgba(148,178,214,.18);--text:#eef4fb;--muted:#a3b6cc;--accent:#2a9d8f;--accent2:#7fd1c7;--gold:#e0a94a;--focus:#7fd1c7;
  font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: light){.dm.auto{--bg:#f3f6fa;--panel:#fff;--panel2:#eef3f8;--line:rgba(29,79,122,.16);--text:#10243a;--muted:#4c6178;--accent:#1f7f73;--accent2:#1d4f7a;--focus:#1d4f7a}}
.dm *{box-sizing:border-box}
.dm a{color:inherit}
.dm button{font:inherit;color:inherit;cursor:pointer}
.dm :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.dm-entry{position:fixed;inset:0;z-index:2147482000;overflow:auto;background:radial-gradient(1200px 600px at 85% -10%,rgba(42,157,143,.22),transparent 60%),radial-gradient(900px 500px at -10% 110%,rgba(29,79,122,.35),transparent 60%),var(--bg)}
.dm-wrap{max-width:1080px;margin:0 auto;padding:28px 16px 40px}
.dm-brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.3px}
.dm-brand small{display:block;font-weight:500;color:var(--muted);font-size:12px;letter-spacing:.4px}
.dm-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(42,157,143,.16);color:var(--accent2);font-size:12px;font-weight:600;letter-spacing:.3px}
.dm-pill i{width:7px;height:7px;border-radius:50%;background:var(--accent2);box-shadow:0 0 0 0 rgba(127,209,199,.6);animation:dmPulse 2.2s ease-out infinite}
@keyframes dmPulse{0%{box-shadow:0 0 0 0 rgba(127,209,199,.55)}70%{box-shadow:0 0 0 8px rgba(127,209,199,0)}100%{box-shadow:0 0 0 0 rgba(127,209,199,0)}}
.dm-h1{font-size:clamp(26px,4.2vw,42px);line-height:1.12;margin:22px 0 10px;font-weight:750;letter-spacing:-.4px;max-width:820px}
.dm-lead{color:var(--muted);font-size:clamp(15px,1.7vw,17px);line-height:1.55;max-width:760px;margin:0}
.dm-stats{display:flex;flex-wrap:wrap;gap:8px 18px;margin:16px 0 0;color:var(--muted);font-size:13px}
.dm-stats b{color:var(--text)}
.dm-step{margin:30px 0 10px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
.dm-roles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media (max-width:820px){.dm-roles{grid-template-columns:1fr}}
.dm-role{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 16px 14px;transition:border-color .18s,transform .18s,box-shadow .18s}
.dm-role:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.18)}
.dm-role[aria-checked="true"]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.dm-role h3{margin:0 0 2px;font-size:16px}
.dm-role .who{font-size:12px;color:var(--accent2);font-weight:600}
.dm-role p{margin:8px 0 0;color:var(--muted);font-size:13.5px;line-height:1.5}
.dm-role .tick{position:absolute;top:14px;right:14px;width:18px;height:18px;border-radius:50%;border:2px solid var(--line)}
.dm-role[aria-checked="true"] .tick{border-color:var(--accent);background:radial-gradient(circle,var(--accent) 45%,transparent 50%)}
.dm-go{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px}
.dm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);font-weight:650;font-size:15px;min-height:46px}
.dm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.dm-btn.primary:hover{filter:brightness(1.08)}
.dm-btn:hover{border-color:var(--accent)}
.dm-btn small{font-weight:500;opacity:.8}
@media (max-width:520px){.dm-btn{width:100%}}
.dm-foot{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;line-height:1.6}
.dm-foot p{margin:0 0 8px}
.dm-link{color:var(--accent2);font-weight:600;text-decoration:none}
.dm-link:hover{text-decoration:underline}
.dm-terms{background:none;border:0;padding:0;color:var(--accent2);text-decoration:underline;font-size:12.5px}
.dm-bar{position:fixed;top:0;left:0;right:0;height:${BAR_H}px;z-index:700;display:flex;align-items:center;gap:10px;padding:0 12px;
  background:linear-gradient(90deg,#0d1f33,#123049);color:#eef4fb;border-bottom:1px solid rgba(127,209,199,.22);font-size:13px}
.dm-bar .grow{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#a3b6cc}
.dm-bar .b{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid rgba(148,178,214,.22);background:rgba(255,255,255,.04);font-size:12.5px;font-weight:600;white-space:nowrap}
.dm-bar .b:hover{border-color:#7fd1c7}
.dm-bar .b.accent{background:#2a9d8f;border-color:#2a9d8f;color:#fff}
.dm-bar .b.cta{text-decoration:none;color:#f3d39b;border-color:rgba(224,169,74,.45)}
.dm-bar .b.cta:hover{border-color:#e0a94a}
@media (max-width:1180px){.dm-bar .hide-m{display:none}}
@media (max-width:360px){.dm-bar .hide-xs{display:none}}
.dm-bar .copy{color:#a3b6cc;font-size:12px;white-space:nowrap;text-decoration:none}
.dm-bar .copy:hover{color:#eef4fb}
.dm-menu{position:fixed;top:${BAR_H + 6}px;z-index:2147482500;min-width:280px;max-width:calc(100vw - 24px);background:#11233a;color:#eef4fb;border:1px solid rgba(148,178,214,.22);border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.35);padding:6px}
.dm-menu button,.dm-menu a{display:block;width:100%;text-align:left;background:none;border:0;border-radius:8px;padding:9px 10px;text-decoration:none;font-size:13.5px}
.dm-menu button:hover,.dm-menu a:hover{background:rgba(127,209,199,.10)}
.dm-menu .on{background:rgba(42,157,143,.18)}
.dm-menu small{display:block;color:#a3b6cc;font-size:12px;margin-top:2px;line-height:1.4}
.dm-menu hr{border:0;border-top:1px solid rgba(148,178,214,.18);margin:6px 4px}
.dm-modal{position:fixed;inset:0;z-index:2147482600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,12,22,.55)}
.dm-modal .card{width:min(440px,100%);background:#11233a;color:#eef4fb;border:1px solid rgba(148,178,214,.22);border-radius:14px;padding:20px}
.dm-modal h2{margin:0 0 8px;font-size:18px}
.dm-modal p{margin:0 0 16px;color:#a3b6cc;font-size:14px;line-height:1.55}
.dm-modal .row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.dm-bar .show-s{display:none}
@media (max-width:760px){.dm-bar .hide-s{display:none}.dm-bar .show-s{display:inline-flex}}
@media (max-width:420px){.dm-bar{gap:6px;padding:0 8px}.dm-bar .b{padding:0 8px}}
@media (prefers-reduced-motion: reduce){.dm *{animation:none!important;transition:none!important}}
`;
let cssIn = false;
const useCss = () => useEffect(() => {
  if (cssIn) return; cssIn = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}, []);

const Emblem = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#1d4f7a" />
    <path d="M14 50 V30 a18 18 0 0 1 36 0 V50 Z" fill="none" stroke="#fff" strokeWidth="4" />
    <rect x="21" y="34" width="5" height="14" rx="1" fill="#7fd1c7" /><rect x="29.5" y="30" width="5" height="18" rx="1" fill="#7fd1c7" />
    <rect x="38" y="34" width="5" height="14" rx="1" fill="#7fd1c7" />
  </svg>
);

/** The start screen. onStart({ role, mode: "tour" | "explore" }). */
export function EntryScreen({ initialRole = "pmo", facts, tourMinutes = 6, onStart }) {
  useCss();
  const [role, setRole] = useState(initialRole);
  const [terms, setTerms] = useState(false);
  const pickKey = (e) => {
    const i = ROLES.findIndex((r) => r.id === role);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setRole(ROLES[(i + 1) % 3].id); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setRole(ROLES[(i + 2) % 3].id); }
  };
  return (
    <div className="dm auto dm-entry" role="dialog" aria-modal="true" aria-labelledby="dm-title">
      <div className="dm-wrap">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="dm-brand"><Emblem /><span>Capital Projects Portal<small>Interactive demo</small></span></div>
          <span className="dm-pill"><i />Live demo · fictional data</span>
        </div>
        <h1 className="dm-h1" id="dm-title">Run a capital projects portfolio from proposal to handover, in one place.</h1>
        <p className="dm-lead">A working copy of a portal built for a university PMO. Budgets from proposal to payment, schedules and work plans,
          risks, site photos, inventory, monthly board reports and an assistant that answers in figures. Click anything: it all works.</p>
        {facts && <div className="dm-stats">{facts.map(([k, v]) => <span key={k}><b>{v}</b> {k}</span>)}</div>}

        <div className="dm-step" id="dm-role-label">1 · Choose who you are</div>
        <div className="dm-roles" role="radiogroup" aria-labelledby="dm-role-label" onKeyDown={pickKey}>
          {ROLES.map((r) => (
            <button key={r.id} type="button" className="dm-role" role="radio" aria-checked={role === r.id} tabIndex={role === r.id ? 0 : -1}
              onClick={() => setRole(r.id)} data-role={r.id}>
              <span className="tick" />
              <h3>{r.title}</h3><div className="who">Signed in as {r.who}</div>
              <p>{r.text}</p>
            </button>
          ))}
        </div>

        <div className="dm-step">2 · Start</div>
        <div className="dm-go">
          <button type="button" className="dm-btn primary" data-start="tour" onClick={() => onStart({ role, mode: "tour" })}>
            Take the guided tour <small>· 9 chapters, about {tourMinutes} minutes</small></button>
          <button type="button" className="dm-btn" data-start="explore" onClick={() => onStart({ role, mode: "explore" })}>Explore freely</button>
        </div>

        <div className="dm-foot">
          <p>{PRIVACY}</p>
          <p>Designed and built by <a className="dm-link" href={OWNER_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("cta_click", { where: "entry" })}>{OWNER} · hire me on Upwork ↗</a>.
            {" "}A portal like this can be set up for your organisation, with your own name, logo, currency and terms.</p>
          <p>© {YEAR} {OWNER}. All rights reserved. <button type="button" className="dm-terms" aria-expanded={terms} onClick={() => setTerms(!terms)}>Terms of use</button></p>
          {terms && <p data-terms>{TERMS}</p>}
        </div>
      </div>
    </div>
  );
}

/** The bar above the portal. */
export function DemoBar({ role, onRole, onTour, onReset, changedAt }) {
  useCss();
  const [menu, setMenu] = useState(null);           // "role" | "more" | null
  const [confirm, setConfirm] = useState(false);
  const [left, setLeft] = useState(12);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!e.target.closest?.(".dm-menu,.dm-bar")) setMenu(null); };
    const esc = (e) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const open = (which, e) => { const r = e.currentTarget.getBoundingClientRect(); setLeft(Math.max(12, Math.min(r.left, window.innerWidth - 300))); setMenu(menu === which ? null : which); };
  return (
    <div className="dm">
      <div className="dm-bar" role="region" aria-label="Demo controls">
        <span className="dm-pill" data-demo="banner"><i /><span>Demo<span className="hide-xs">: all data is fictional</span></span></span>
        <span className="grow"><span className="hide-s">Your changes stay in this browser{changedAt ? " and are saved" : ""}</span></span>
        <button type="button" className="b" aria-haspopup="menu" aria-expanded={menu === "role"} data-demo="role" onClick={(e) => open("role", e)}>
          <span className="hide-s">Viewing as</span> {roleTitle(role)} ▾</button>
        <button type="button" className="b accent hide-s" data-demo="tour" onClick={onTour}>Guided tour</button>
        <button type="button" className="b hide-s" data-demo="reset" onClick={() => setConfirm(true)}>Reset demo</button>
        <a className="b cta hide-s" href={OWNER_URL} target="_blank" rel="noopener noreferrer" data-demo="cta" onClick={() => track("cta_click", { where: "bar" })}>Want this for your organisation? ↗</a>
        <a className="copy hide-m" href={OWNER_URL} target="_blank" rel="noopener noreferrer" title="Hire the author on Upwork">© {YEAR} {OWNER}</a>
        <button type="button" className="b show-s" aria-label="More demo options" aria-haspopup="menu" aria-expanded={menu === "more"} data-demo="more" onClick={(e) => open("more", e)}>⋯</button>
      </div>
      {menu === "role" && (
        <div className="dm-menu" role="menu" style={{ left }}>
          {ROLES.map((r) => (
            <button key={r.id} type="button" role="menuitemradio" aria-checked={r.id === role} className={r.id === role ? "on" : ""} data-role={r.id}
              onClick={() => { setMenu(null); if (r.id !== role) onRole(r.id); }}>
              {r.title} {r.id === role ? "✓" : ""}<small>{r.who} · {r.text}</small>
            </button>
          ))}
        </div>
      )}
      {menu === "more" && (
        <div className="dm-menu" role="menu" style={{ left }}>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); onTour(); }}>Guided tour</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); setConfirm(true); }}>Reset demo<small>Put every figure, update and file back as it was.</small></button>
          <hr />
          <a role="menuitem" href={OWNER_URL} target="_blank" rel="noopener noreferrer" data-demo="cta" onClick={() => track("cta_click", { where: "bar_menu" })}>Want this for your organisation? Contact me on Upwork ↗<small>© {YEAR} {OWNER}. All data is fictional.</small></a>
        </div>
      )}
      {confirm && (
        <div className="dm-modal" role="dialog" aria-modal="true" aria-labelledby="dm-reset-t" onKeyDown={(e) => e.key === "Escape" && setConfirm(false)}>
          <div className="card">
            <h2 id="dm-reset-t">Reset the demo?</h2>
            <p>Every figure, update, task and uploaded file goes back to how the demo started. Your role stays the same.</p>
            <div className="row">
              <button type="button" className="dm-btn" autoFocus onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="dm-btn primary" data-demo="reset-confirm" onClick={onReset}>Reset demo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
