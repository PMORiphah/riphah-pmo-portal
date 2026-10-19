// PMO Simulation: start-up, refresh and exit (live portal data). Owner: B2. Spec: contract §G.6.
// Loaded only on simulation.html, and only after public/sim-boot.js has passed its checks (see
// src/main.jsx).
//
//   start():   self-test → (no hand-over: locked screen, nothing else) → receive and validate the
//              snapshot and media from the PMO's portal tab (./handoff.js) → media as protected
//              blob: links → synthetic backend → synthetic PMO session → narration → <SimRoot/>.
//   refresh(): asks the portal tab for a fresh snapshot (Begin screen or closing card); on success
//              the backend is reinstalled and SimRoot remounts with the new data; on failure the old
//              snapshot stays and the reason is returned. Live only: a copy the PMO shared with guests
//              (mode "shared") keeps its data, plays from its own start screen and has no Refresh.
//   exit():    unmount, revoke the media links, reset the backend, clear the in-memory storage, tell
//              the portal tab, close the tab.
// Every failure shows an honest error (what happened, what to do, which check); nothing else is
// ever shown instead of the live data.
//
// No names or data here: the data exists only in memory, from the hand-over.
import React from "react";
import { createRoot } from "react-dom/client";
import { waitForSnapshot, requestRefresh, sendBye, closeAll, HandoffError, TEXT, AGAIN, describeFailure } from "./handoff.js";
import { freshnessFor } from "./live/validate.js";
import { buildNarration } from "./live/build.js";
import { selfTest, clearSimStorage } from "./boot/guards.js";
import { LockedScreen, ProgressScreen, FailScreen, EndedScreen } from "./boot/screens.jsx";

export { describeFailure };

const h = React.createElement;
let root = null;
let backendRef = null;
let state = "idle";              // idle | starting | running | ended
let current = null;              // { snapshot, items: Map(key → item), urls: Map(attachmentId|sha256 → blob: url), mode, share }
let refreshing = false;
const unhandled = [];

// For the harness and the director: where the simulation is (SimRoot sets rehearsing, begin, running, closing).
const STATE = { phase: "handoff", reason: null, asOf: null, code: null, mode: null };
try { Object.defineProperty(window, "__PMO_SIM_STATE__", { configurable: true, enumerable: false, value: STATE }); } catch { /* ignore */ }
/** Updates window.__PMO_SIM_STATE__ (SimRoot uses it for its own phases). */
export function setSimState(patch) { Object.assign(STATE, patch); }

function show(el) {
  if (!root) root = createRoot(document.getElementById("root"));
  root.render(el);
}

// ── honest errors (describeFailure lives in handoff.js) ──────────────────────

function failed(e, phase = "refused") {
  const view = describeFailure(e);
  setSimState({ phase, reason: e?.code || "protocol", ...(e?.mode ? { mode: e.mode } : null) });
  if (view) show(h(FailScreen, view));
  else show(h(LockedScreen));
  state = "ended";
}

// ── media links ──────────────────────────────────────────────────────────────
const linkKey = (it) => it.attachmentId + "|" + it.sha256;
/** blob: links for a snapshot's items, reusing the ones `old` already made for the same file. */
function makeLinks(items, old) {
  const sim = window.__PMO_SIM__;
  const urls = new Map(), mediaUrls = {}, created = [];
  for (const it of items.values()) {
    const k = linkKey(it);
    let url = urls.get(k) || old?.urls?.get(k);
    if (!url) {
      url = URL.createObjectURL(it.blob);
      created.push(url);
      try { sim.guard.protect(url); } catch { /* checked by the self-test */ }   // never opened, dragged or saved
    }
    urls.set(k, url);
    mediaUrls[it.key] = url;
  }
  return { urls, mediaUrls, created };
}
function revoke(list) {
  const sim = window.__PMO_SIM__;
  for (const u of list) {
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    try { sim?.guard?.unprotect(u); } catch { /* ignore */ }
  }
}

// ── install: backend, session, narration, SimRoot ────────────────────────────
async function install(snapshot, items, old, { mode = "live", share = null } = {}) {
  const links = makeLinks(items, old);
  try {
    const narration = buildNarration(snapshot, { shared: !!share });
    const store = {
      tables: snapshot.tables,
      meta: { pmo: { id: snapshot.pmo.id, username: snapshot.pmo.username, full_name: snapshot.pmo.full_name, email: null },
        takenAt: snapshot.takenAt, plan: snapshot.plan },
    };
    const B = await import("./backend.js");
    const { default: SimRoot } = await import("./SimRoot.jsx");
    const backend = B.installBackend({
      store, mediaUrls: links.mediaUrls, responses: snapshot.responses, rpc: snapshot.rpc, mode: "live",
      onUnhandled: (info) => {
        unhandled.push(info);
        if (unhandled.length <= 20) console.warn("[simulation] not handled by the simulated backend:", info);
      },
    });
    B.prepareSession(store);
    try { window.__PMO_SIM__.setAsOf(snapshot.takenAt, !!share); } catch { /* ignore */ }
    backendRef = backend;
    const next = { snapshot, items, urls: links.urls, mode, share };
    // The links the previous snapshot used and this one does not.
    const keep = new Set(links.urls.values());
    const stale = old ? [...old.urls.values()].filter((u) => !keep.has(u)) : [];
    current = next;
    setSimState({ asOf: snapshot.takenAt, code: snapshot.code, reason: null, mode });
    // A shared copy plays from its own start screen and is never refreshed.
    show(h(SimRoot, { key: snapshot.fingerprint, snapshot, narration, backend, share, onExit: exit,
      onRefresh: mode === "live" ? refresh : null }));
    // Revoked once the new SimRoot has replaced the old one (no broken picture in between).
    if (stale.length) setTimeout(() => revoke(stale), 3000);
    return next;
  } catch (e) {
    revoke(links.created);
    throw e;
  }
}

/** Starts the simulation. Called by src/main.jsx when window.__PMO_SIM__.ok. */
export async function start() {
  if (state !== "idle") return;
  state = "starting";
  const sim = window.__PMO_SIM__;
  setSimState({ phase: "handoff", reason: null });
  const test = selfTest();
  if (!test.ok) {
    setSimState({ phase: "refused", reason: "self-test" });
    show(h(FailScreen, { reason: "Nothing was loaded: this browser tab did not pass the simulation's own safety checks.",
      remedy: AGAIN, check: test.failed.join(", ") }));
    state = "ended";
    return;
  }
  if (!sim.nonce) {
    setSimState({ phase: "refused", reason: "no-handover" });
    show(h(LockedScreen));
    state = "ended";
    return;
  }

  let got;
  try {
    got = await waitForSnapshot({
      onProgress: (p) => {
        if (p.phase === "validating") setSimState({ phase: "validating" });
        show(h(ProgressScreen, p));
      },
    });
  } catch (e) {
    console.warn("[simulation] hand-over refused:", e?.code, e?.message);
    failed(e);
    return;
  }
  const mode = got.mode === "shared" ? "shared" : "live";
  const share = mode === "shared" ? got.share : null;
  setSimState({ phase: "validating", mode });
  // Validated at receipt (freshness included); checked once more just before the data is used.
  const f = freshnessFor(got.snapshot.takenAt, Date.now(), share);
  if (f.state === "refused") { failed(Object.assign(new HandoffError("stale", f.text), { mode })); return; }

  show(h(ProgressScreen, { phase: "preparing" }));
  try {
    state = "running";
    await install(got.snapshot, got.items, null, { mode, share });
  } catch (e) {
    console.error("[simulation] could not be prepared:", e);
    failed(Object.assign(new HandoffError("prepare", String(e?.message || e).slice(0, 160)), { mode }), "refused");
  }
}

/**
 * Reads the portal again (Begin screen or closing card only; never mid-run). Resolves
 * { ok: true, code, asOf } once SimRoot has been re-rendered with the new snapshot (new key, so the
 * calling SimRoot is unmounted), or { ok: false, error, code, check } with the old snapshot still
 * in place.
 */
export async function refresh() {
  if (state !== "running" || !current) return { ok: false, error: "The simulation is not running." };
  if (current.mode !== "live") return { ok: false, error: TEXT.sharedNoRefresh };
  if (refreshing) return { ok: false, error: TEXT.busy };
  refreshing = true;
  try {
    const held = new Map([...current.items.values()].map((it) => [it.attachmentId, it]));
    const got = await requestRefresh({ held });
    const f = freshnessFor(got.snapshot.takenAt, Date.now(), null);
    if (f.state === "refused") return { ok: false, error: f.text };
    await install(got.snapshot, got.items, current, { mode: "live", share: null });
    return { ok: true, code: got.snapshot.code, asOf: got.snapshot.takenAt };
  } catch (e) {
    console.warn("[simulation] refresh failed:", e?.code, e?.message);
    const view = describeFailure(e);
    return { ok: false, error: view?.reason || TEXT.portalGone, code: e?.code || "protocol", check: view?.check || null };
  } finally {
    refreshing = false;
  }
}

/** Ends the run: nothing of it stays in this browser. Safe to call more than once. */
export function exit() {
  if (state === "ended" && !root) return;
  state = "ended";
  setSimState({ phase: "ended" });
  const sim = window.__PMO_SIM__;
  try { root?.unmount(); } catch { /* ignore */ }
  root = null;
  if (current) revoke([...current.urls.values()]);
  current = null;
  try { backendRef?.reset?.(); } catch { /* ignore */ }
  backendRef = null;
  clearSimStorage();
  try { sendBye(); } catch { /* ignore */ }
  setTimeout(() => { try { closeAll(); } catch { /* ignore */ } }, 1200);
  try { sim?.guard?.allowUnload(); } catch { /* ignore */ }
  try { window.close(); } catch { /* ignore */ }
  setTimeout(() => { if (!window.closed) show(h(EndedScreen)); }, 300);
}

/** For tests and the run report: what the simulated backend did not recognise. */
export const unhandledCalls = () => unhandled.slice();
