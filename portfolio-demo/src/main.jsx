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
const fromUrl = ALIAS[String(new URLSearchParams(location.search).get("role") || "").toLowerCase()];
if (fromUrl) safe(() => localStorage.setItem(ROLE_KEY, fromUrl));
const role = fromUrl || ALIAS[safe(() => localStorage.getItem(ROLE_KEY))] || "pmo";

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

const me = tables.user_profiles.find((u) => u.username === PERSONAS[role].username) || tables.user_profiles.find((u) => u.role === "pmo");
const store = { tables, meta: { me: { id: me.id, username: me.username, full_name: me.full_name, role: me.role } } };

window.__DEMO__ = {
  unhandled: [], role, personas: PERSONAS,
  /** Signs in as another role (the page reloads; changes are kept). */
  switchRole(r) { const x = ALIAS[r] || "pmo"; safe(() => localStorage.setItem(ROLE_KEY, x)); location.replace(location.pathname); },
  /** Puts every figure, update and file back as it was (the role is kept). */
  async reset() {
    await clearFiles();
    const keep = safe(() => localStorage.getItem(ROLE_KEY));
    safe(() => localStorage.clear()); safe(() => sessionStorage.clear());
    if (keep) safe(() => localStorage.setItem(ROLE_KEY, keep));
    location.replace(location.pathname);
  },
  changedAt: saved && saved.v === SEED_V ? saved.at : null,
};
installBackend({
  store, media, policy, today: () => DAY, onWrite: save, onUpload: saveFile, ownFiles: Object.keys(own), serverFeature, assistant, notify,
  onUnhandled: (info) => { window.__DEMO__.unhandled.push(info); },
});
prepareSession(store);

const { default: App } = await import("../../src/App.jsx");
createRoot(document.getElementById("root")).render(<App />);
