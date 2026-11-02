// Portfolio demo entry: fictional data in the in-page backend, the visitor's chosen role, the real
// portal's App. Nothing leaves the page: the backend answers every request to the demo address and
// refuses everything else. Changes are saved in this browser only; "Reset demo" puts the data back.
import React from "react";
import { createRoot } from "react-dom/client";
import seed from "../data/seed.json";
import mediaFiles from "../data/media.json";
import { installBackend, prepareSession } from "./demoBackend.js";
import { policy, setToday } from "./demoPolicy.js";
import { serverFeature } from "./demoServer.js";
import { assistant } from "./demoAssistant.js";
import { notify } from "./demoNotify.js";
import { setDemoDay } from "./demoClock.js";
import { recomputeViews } from "../data/views.mjs";
import { loadFiles, saveFile, clearFiles } from "./demoFiles.js";
import { EntryScreen, DemoBar, BAR_H } from "./demoShell.jsx";
import { guardLinks } from "./demoLinks.js";
import { track } from "./demoAnalytics.js";
import { Tour, readTour, writeTour } from "./demoTour.jsx";
import { totalMinutes } from "./tourChapters.js";

const DAY = seed.NOW.slice(0, 10);
setDemoDay(DAY);
setToday(DAY);

// ── who the visitor is ──
export const PERSONAS = {
  pmo: { username: "pmo.admin", label: "PMO admin" },
  project_manager: { username: "nfairweather", label: "Project manager" },
  guest: { username: "swhitcombe", label: "Senior management" },
};
const ROLE_KEY = "cpp-demo-role";
const ALIAS = { pmo: "pmo", admin: "pmo", pm: "project_manager", project_manager: "project_manager", guest: "guest", management: "guest", senior: "guest" };
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const params = new URLSearchParams(location.search);
const fromUrl = ALIAS[String(params.get("role") || "").toLowerCase()];
if (fromUrl) safe(() => localStorage.setItem(ROLE_KEY, fromUrl));
const ENTERED_KEY = "cpp-demo-entered";      // this tab has been past the start screen
// A link with ?role=… opens that role directly (for sharing); ?start shows the start screen again.
if (fromUrl) safe(() => sessionStorage.setItem(ENTERED_KEY, "explore"));
if (params.has("start")) safe(() => sessionStorage.removeItem(ENTERED_KEY));

// ── the data: the seed, or this browser's saved copy of it ──
const VIEWS = new Set(["portfolio_metrics", "portfolio_dashboard", "project_metrics", "investment_metrics", "cashflow_monthly", "at_risk_projects",
  "pdd_pending_projects", "project_task_rollup", "project_risks_scored", "lessons_learned_full", "benefits_realized_full", "past_project_summary",
  "past_project_task_rollup", "session_summary", "tour_progress", "project_update_status"]);
const NOT_SAVED = new Set(["user_sessions", "session_events", "tour_events", "push_subscriptions", "user_webauthn_credentials"]);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const SEED_V = hash(JSON.stringify(seed.tables)) + "." + Object.keys(seed.tables).length;
const DATA_KEY = "cpp-demo-data";

let tables = structuredClone(seed.tables);
const saved = safe(() => JSON.parse(localStorage.getItem(DATA_KEY) || "null"));
if (saved && saved.v === SEED_V && saved.tables && typeof saved.tables === "object") {
  for (const [k, v] of Object.entries(saved.tables)) if (Array.isArray(v) && !VIEWS.has(k)) tables[k] = v;
  recomputeViews(tables, DAY);
}

let saveTimer = null, warned = false;
function save(t) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = {};
    for (const [k, v] of Object.entries(t)) if (Array.isArray(v) && !VIEWS.has(k) && !NOT_SAVED.has(k)) out[k] = v;
    try { localStorage.setItem(DATA_KEY, JSON.stringify({ v: SEED_V, at: new Date().toISOString(), tables: out })); }
    catch {
      if (!warned) notify("Your browser didn't let the demo save this change; it stays until you close the tab.");
      warned = true;
    }
  }, 250);
}

// ── the generated documents and photos, as blob: links ──
const media = {};
for (const [key, uri] of Object.entries(mediaFiles)) {
  const [head, b64] = uri.split(",");
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  media[key] = URL.createObjectURL(new Blob([bytes], { type: head.slice(5, -7) }));
}

// … and the visitor's own uploads, kept in this browser.
const own = saved && saved.v === SEED_V ? await loadFiles() : {};
for (const [key, blob] of Object.entries(own)) media[key] = URL.createObjectURL(blob);

// ── the start screen, then the portal for the chosen role ──
const shellRoot = document.createElement("div");
shellRoot.id = "demo-shell";
document.body.appendChild(shellRoot);
const shell = createRoot(shellRoot);
const reloadClean = () => location.replace(location.pathname);

let entered = safe(() => sessionStorage.getItem(ENTERED_KEY));
let role = ALIAS[safe(() => localStorage.getItem(ROLE_KEY))] || "pmo";
let mode = "explore";
if (!entered) {
  const capex = tables.projects.filter((p) => p.portfolio === "capex");
  const facts = [["capital projects", capex.length], ["sites", new Set(capex.map((p) => p.campus)).size],
    ["project managers", tables.user_profiles.filter((u) => u.role === "project_manager" && u.is_active).length],
    ["purchase-order lines", (tables.inventory_items || []).length], ["roles to try", 3]];
  ({ role, mode } = await new Promise((resolve) => shell.render(<EntryScreen initialRole={role} facts={facts} tourMinutes={totalMinutes()} onStart={resolve} />)));
  safe(() => localStorage.setItem(ROLE_KEY, role));
  safe(() => sessionStorage.setItem(ENTERED_KEY, "explore"));   // a reload explores; the tour starts once
  track("mode_chosen", { role, mode });
}

const me = tables.user_profiles.find((u) => u.username === PERSONAS[role]?.username) || tables.user_profiles.find((u) => u.role === "pmo");
const store = { tables, meta: { me: { id: me.id, username: me.username, full_name: me.full_name, role: me.role } } };

const reset = async () => {
  track("demo_reset", { role });
  await clearFiles();
  const keep = safe(() => localStorage.getItem(ROLE_KEY)), was = safe(() => sessionStorage.getItem(ENTERED_KEY));
  safe(() => localStorage.clear()); safe(() => sessionStorage.clear());
  if (keep) safe(() => localStorage.setItem(ROLE_KEY, keep));
  if (was) safe(() => sessionStorage.setItem(ENTERED_KEY, "explore"));
  reloadClean();
};
const switchRole = (r) => {
  const x = ALIAS[r] || "pmo";
  track("demo_role", { from: role, to: x });
  safe(() => localStorage.setItem(ROLE_KEY, x)); safe(() => sessionStorage.setItem(ENTERED_KEY, "explore"));
  reloadClean();
};
// ── the guided tour, in its own root; its place survives a reload (steps that run as another role) ──
const tourEl = Object.assign(document.createElement("div"), { id: "demo-tour" });
document.body.appendChild(tourEl);
const tourRoot = createRoot(tourEl);
let touring = false;
const closeTour = (backTo) => {
  touring = false;
  tourRoot.render(null);
  if (backTo) switchRole(backTo);
};
const openTour = (state) => {
  touring = true;
  tourRoot.render(<Tour key={Date.now()} role={role} switchRole={switchRole} startState={state} onClose={closeTour} />);
};
const startTour = () => {
  if (touring) return;
  const saved = readTour();
  const resume = saved && !saved.done && saved.idx > 0 ? saved.idx : 0;
  track("tour_open", { role, resume: resume + 1 });
  openTour({ idx: resume, voice: !!saved?.voice, playing: true, returnRole: saved?.returnRole || role });
};
window.__DEMO__ = {
  unhandled: [], role, mode, personas: PERSONAS, switchRole, reset, startTour, tour: null,
  changedAt: saved && saved.v === SEED_V ? saved.at : null,
};
installBackend({
  store, media, policy, today: () => DAY, onWrite: save, onUpload: saveFile, ownFiles: Object.keys(own), serverFeature, assistant, notify,
  onUnhandled: (info) => { window.__DEMO__.unhandled.push(info); },
  onSignOut: () => { safe(() => sessionStorage.removeItem(ENTERED_KEY)); reloadClean(); },
});
guardLinks(notify);
prepareSession(store);

document.documentElement.style.setProperty("--demo-bar", BAR_H + "px");
const appRoot = document.getElementById("root");
appRoot.style.marginTop = BAR_H + "px";
// Choosing a role by hand ends a running tour (it would otherwise take the visitor back to its step).
const chooseRole = (r) => { const t = readTour(); if (t?.active) writeTour({ ...t, active: false, returnRole: null }); switchRole(r); };
shell.render(<DemoBar role={role} onRole={chooseRole} onTour={startTour} onReset={reset} changedAt={window.__DEMO__.changedAt} />);
// Drop ?role= / ?start from the address so a reload keeps the visitor's own choices.
if (location.search) history.replaceState(null, "", location.pathname + location.hash);

const { default: App } = await import("../../src/App.jsx");
createRoot(appRoot).render(<App />);
// Wait for the portal to finish its first render (its navigation object), then start or resume the tour.
const whenNav = (f, n = 0) => (window.__DEMO__.nav || n > 60 ? f() : setTimeout(() => whenNav(f, n + 1), 100));
const resuming = readTour();
if (resuming?.active) whenNav(() => openTour({ ...resuming, playing: resuming.playing !== false }));
else if (mode === "tour") whenNav(() => setTimeout(startTour, 600));
