// PMO Simulation: start-up. Loaded only on simulation.html, and only after public/sim-boot.js has
// passed its checks (see src/main.jsx).
//
//   start(): self-test → (no hand-over: locked screen, or "Run with sample names")
//            → receive the cast and media from the PMO's portal tab → fill the name slots
//            → media as blob: links → synthetic backend → synthetic PMO session → <SimRoot/>.
//   exit():  unmount, revoke the media links, clear the simulation's storage, close the tab.
//
// No names here: real names exist only in memory, from the hand-over.
import React from "react";
import { createRoot } from "react-dom/client";
import { waitForCast } from "./handoff.js";
import { selfTest, clearSimStorage } from "./boot/guards.js";
import { LockedScreen, ProgressScreen, FailScreen, EndedScreen, SampleChip } from "./boot/screens.jsx";

const h = React.createElement;
let root = null;
let chip = null;
let backendRef = null;
let state = "idle";              // idle | starting | running | ended
const objectUrls = [];
const unhandled = [];

function show(el) {
  if (!root) root = createRoot(document.getElementById("root"));
  root.render(el);
}

const REASONS = {
  timeout: "The names did not arrive from the PMO portal in time.",
  "no-nonce": null,
  used: "This page has already received its names once.",
};
function reasonText(e) {
  const code = e && e.code;
  if (code in REASONS) return REASONS[code];
  return "The names and photos from the PMO portal could not be accepted, so none were used.";
}

// Resolves when the presenter presses "Run with sample names".
function lockedUntilSample(reason) {
  return new Promise((resolve) => show(h(LockedScreen, { reason, onSample: () => resolve() })));
}

// Sample mode: the fictional media the data module lists (same-origin files), if it lists any.
async function sampleMedia(data) {
  const sim = window.__PMO_SIM__;
  const list = Array.isArray(data.SAMPLE_MEDIA) ? data.SAMPLE_MEDIA : [];
  const out = [];
  for (const m of list.slice(0, 200)) {
    try {
      const u = new URL(m.url || m.path, location.origin + sim.base);
      if (u.origin !== location.origin || u.pathname.indexOf(sim.base + "sim/") !== 0) continue;
      const res = await fetch(u.href);
      if (!res.ok) continue;
      const blob = await res.blob();
      out.push({ key: m.key, host: m.host, mime: m.mime || blob.type, size: blob.size, order: m.order ?? out.length,
        blob: new Blob([blob], { type: m.mime || blob.type }) });
    } catch { /* a missing sample file only leaves a gap in the Gallery */ }
  }
  return out;
}

function addRows(store, table, rows) {
  if (!rows || !rows.length) return;
  const t = store?.tables?.[table];
  if (!Array.isArray(t)) return;
  const have = new Set(t.map((r) => r.id));
  for (const r of rows) if (!have.has(r.id)) t.push(r);
}

function starterList(narration) {
  if (!narration || typeof narration !== "object" || Array.isArray(narration)) return null;
  const s = narration.meta?.starters ?? narration.starters;
  return Array.isArray(s) ? s : null;
}

function showChip() {
  if (chip) return;
  const el = document.createElement("div");
  el.setAttribute("data-sim-ui", "sample-chip-root");
  document.body.appendChild(el);
  chip = { el, root: createRoot(el) };
  chip.root.render(h(SampleChip));
}

/** Starts the simulation. Called by src/main.jsx when window.__PMO_SIM__.ok. */
export async function start() {
  if (state !== "idle") return;
  state = "starting";
  const sim = window.__PMO_SIM__;
  const test = selfTest();
  if (!test.ok) { show(h(FailScreen, { reason: test.failed.join(", ") })); state = "ended"; return; }

  let mode = "cast", cast = null, items = [];
  if (!sim.nonce) {
    await lockedUntilSample(null);
    mode = "sample";
  } else {
    try {
      const r = await waitForCast({ timeoutMs: 10000, onProgress: (p) => show(h(ProgressScreen, p)) });
      cast = r.cast;
      items = r.items;
    } catch (e) {
      console.warn("[simulation] hand-over refused:", e && e.code, e && e.message);
      await lockedUntilSample(reasonText(e));
      mode = "sample";
      cast = null;
      items = [];
    }
  }
  if (mode === "sample") sim.mode = "sample";
  show(h(ProgressScreen, { phase: "preparing" }));

  try {
    const data = await import("./data/index.js");
    if (mode === "sample") {
      cast = data.SAMPLE_CAST;
      items = await sampleMedia(data);
    }
    // Every slot is filled, or this throws (a half-filled page never renders).
    const store = data.resolveTokens(data.SEED, cast);
    const narration = data.resolveTokens(data.NARRATION, cast);

    const mediaUrls = {};
    for (const it of items) {
      const url = URL.createObjectURL(it.blob);
      objectUrls.push(url);
      if (mode === "cast") sim.guard.protect(url);     // real media: never opened, dragged or saved
      mediaUrls[it.key] = url;
    }
    if (items.length) addRows(store, "project_attachments", data.buildMediaRows(store, items));

    const starters = starterList(narration);
    if (starters) sim.starters = starters;

    const B = await import("./backend.js");
    const backend = B.installBackend({
      store, mediaUrls,
      onUnhandled: (info) => {
        unhandled.push(info);
        if (unhandled.length <= 20) console.warn("[simulation] not handled by the simulated backend:", info);
      },
    });
    backendRef = backend;
    B.prepareSession(store);

    const { default: SimRoot } = await import("./SimRoot.jsx");
    if (mode === "sample") showChip();
    state = "running";
    show(h(SimRoot, { backend, narration, meta: store.meta || {}, cast, mode, onExit: exit }));
  } catch (e) {
    console.error("[simulation] could not be prepared:", e);
    show(h(FailScreen, { title: "The simulation could not be prepared", reason: String(e && e.message || e).slice(0, 160) }));
    state = "ended";
  }
}

/** Ends the run: nothing of it stays in this browser. Safe to call more than once. */
export function exit() {
  if (state === "ended" && !root) return;
  state = "ended";
  const sim = window.__PMO_SIM__;
  try { root?.unmount(); } catch { /* ignore */ }
  root = null;
  if (chip) { try { chip.root.unmount(); chip.el.remove(); } catch { /* ignore */ } chip = null; }
  for (const u of objectUrls.splice(0)) {
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    try { sim?.guard?.unprotect(u); } catch { /* ignore */ }
  }
  try { backendRef?.reset?.(); } catch { /* ignore */ }
  backendRef = null;
  clearSimStorage();
  try { sim?.guard?.allowUnload(); } catch { /* ignore */ }
  try { window.close(); } catch { /* ignore */ }
  setTimeout(() => { if (!window.closed) show(h(EndedScreen)); }, 300);
}

/** For tests and the run report: what the simulated backend did not recognise. */
export const unhandledCalls = () => unhandled.slice();
