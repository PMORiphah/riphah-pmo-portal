// PMO Simulation director: the action allow-list (live data). Owner: B3b. Spec: contract §H.4.
//
// The director runs on the real portal over live data, so every action it takes is checked here
// first: check(action, el, ctx) is called before every element.click(), every typed value, each
// pick of a portal Select (the combo and its option), every key press, every storage write and
// every helper step (src/sim/director/engine.js). An action outside the list throws
// ReadOnlyViolation: the scene is left out ("blocked action") and the run report records it.
// Hover, spotlight and scroll never write, so they are not checked.
//
// Every call is recorded on window.__PMO_SIM_ACTIONS__ for the click-target inventory test
// (scripts/sim/live/actions-test.mjs and the integration run). The record lives in this tab's
// memory only.
//
// No data here: the lists are selectors and generic English words.

export const ACTIONS = Object.freeze(["click", "type", "pick", "option", "key", "store", "do"]);

export class ReadOnlyViolation extends Error {
  constructor(action, detail) {
    super(`blocked action: ${action}${detail ? ` (${detail})` : ""}`);
    this.name = "ReadOnlyViolation";
    this.action = action;
    this.detail = detail || "";
  }
}

export const NAV_OK = Object.freeze(["cmd", "proj", "camp", "perf", "risks", "cashflow", "schedule", "past", "reports", "upd",
  "photowall", "team", "users"]);
export const TAB_OK = Object.freeze(["budgeting", "investments", "pipeline", "financials", "documents", "wbs"]);
export const TYPE_OK = Object.freeze(['[data-tour="projects-search"]', '[data-tour="past-search"]']);
export const PICK_OK = Object.freeze(['[data-tour="timeline-campus"]', '[data-tour="gallery-campus"]', '[data-tour="sites-campus"]']);
export const KEY_OK = Object.freeze(["Escape"]);
export const STORE_OK = Object.freeze(["pmo-campus-view"]);
export const HELPERS_OK = Object.freeze(["revealNav"]);
const COMPARE_TICK = '[data-tour="compare-table"] tr[data-campus] input[type="checkbox"]';
const BULK = '[data-tour="bulk-preview"]';

// Click targets: the element itself or its closest ancestor must match one of these.
// `count` rules also need the element to show a count above zero.
export const CLICK_RULES = Object.freeze([
  { name: "nav", sel: "[data-nav]", test: (m) => NAV_OK.includes(m.getAttribute("data-nav")) },
  { name: "tab", sel: "[data-tab]", test: (m) => TAB_OK.includes(m.getAttribute("data-tab")) },
  { name: "stage", sel: "[data-stage]", test: (m) => stageCount(m) > 0 },
  { name: "cell", sel: "[data-cell]", test: (m) => cellHasCount(m) },
  { name: "view", sel: "[data-view]" },
  { name: "mode", sel: "[data-mode]" },
  { name: "compare-tick", sel: COMPARE_TICK, self: true },
  { name: "project-row", sel: "tr[data-project-id]", row: true },
  { name: "h2h-open", sel: '[data-tour="h2h-open"]' },
  { name: "updates-tab", sel: '[data-tour^="updates-tab-"]' },
  { name: "updates-row", sel: '[data-tour="updates-list"] [data-project-id]', row: true },
  { name: "past-row", sel: "[data-past]", row: true },
  { name: "report-row", sel: "[data-report]", row: true },
  { name: "report-back", sel: '[data-tour="report-back"]' },
  { name: "assign-pm", sel: '[data-tour="assign-pm"]' },
  { name: "cancel", sel: "button", test: (m) => isBulkCancel(m), self: true },
]);

// Always refused, whatever matched above.
export const DENY_WORDS = /^(assign to|save|publish|refresh figures|discard|delete|yes|no|remove|unassign|change|replace|mark|dismiss|create|share|chat|check now|reorder|post|reply|send|email|confirm|upload|import|export|download|print|save as pdf|deactivate|reset password|create user|welcome|new report|new project|move|edit|set targets|read the charter|confirm all|add|nudge)\b/i;
export const DENY_INSIDE = Object.freeze(['[data-tour="pm-select"]', 'td[data-col="phone"]', '[data-tab="deliverables"]',
  '[data-filter="delayed"]', '[contenteditable]:not([contenteditable="false"])', 'a[href^="mailto:"]', 'a[href^="tel:"]',
  'a[href*="wa.me"]']);

// What counts as a control (the nearest one decides the accessible name).
const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [role="option"], [role="tab"], [role="combobox"], '
  + '[role="menuitem"], [role="checkbox"], [role="switch"], [role="link"], tr[data-project-id], [data-past], [data-report], '
  + '[data-tour="updates-list"] [data-project-id]';

const LOG_MAX = 2000;
function log() {
  try {
    if (!Array.isArray(window.__PMO_SIM_ACTIONS__)) {
      Object.defineProperty(window, "__PMO_SIM_ACTIONS__", { value: [], configurable: true, enumerable: false, writable: true });
    }
    return window.__PMO_SIM_ACTIONS__;
  } catch { return null; }
}

const squeeze = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** The accessible name of a control, as a person would read it: aria-label, else its text, else its title. */
export function accessibleName(el) {
  if (!el || el.nodeType !== 1) return "";
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return squeeze(aria);
  const text = squeeze(el.innerText ?? el.textContent);
  if (text) return text;
  return squeeze(el.getAttribute("title") || el.getAttribute("value") || "");
}

function dataAttrs(el) {
  const out = {};
  if (!el || !el.attributes) return out;
  for (const a of el.attributes) if (a.name.startsWith("data-")) out[a.name.slice(5)] = String(a.value).slice(0, 120);
  return out;
}

function stageCount(el) {
  const m = /—\s*(\d+)\s+project/.exec(el.getAttribute("title") || "");
  if (m) return +m[1];
  const n = /\d+/.exec(el.textContent || "");
  return n ? +n[0] : 0;
}
function cellHasCount(el) {
  const n = /\d+/.exec(el.textContent || "");
  if (n && +n[0] > 0) return true;
  // The cell counts up from 0 on arrival; a cell with risks is drawn clickable.
  try { return getComputedStyle(el).cursor === "pointer"; } catch { return false; }
}
function isBulkCancel(el) {
  if (!el || el.tagName !== "BUTTON" || squeeze(el.textContent) !== "Cancel") return false;
  const dialog = el.closest('[role="dialog"]');
  return !!(dialog && dialog.querySelector(BULK));
}

function matchRule(el) {
  for (const r of CLICK_RULES) {
    const m = r.self ? (el.matches(r.sel) ? el : null) : el.closest(r.sel);
    if (m && (!r.test || r.test(m))) return { rule: r, match: m };
  }
  return null;
}

function deniedInside(el) {
  for (const s of DENY_INSIDE) { if (el.closest(s)) return s; }
  return null;
}

function editable(el) {
  const t = el.tagName;
  return t === "TEXTAREA" || t === "SELECT" || el.isContentEditable === true;
}

function closestDialogName(el) {
  const d = el.closest('[role="dialog"]');
  if (!d) return null;
  return squeeze(d.getAttribute("aria-label") || d.querySelector("h1,h2,h3")?.textContent || "dialog").slice(0, 80);
}

/** Why an action is refused (a short reason), or null when it is allowed. */
export function reasonFor(action, el, ctx = {}) {
  if (!ACTIONS.includes(action)) return "unknown action";
  if (action === "key") return KEY_OK.includes(ctx.key) ? null : `key ${ctx.key}`;
  if (action === "store") return STORE_OK.includes(ctx.key) ? null : `storage ${ctx.key}`;
  if (action === "do") return HELPERS_OK.includes(ctx.helper) ? null : `helper ${ctx.helper}`;
  if (!el || el.nodeType !== 1 || !el.isConnected) return "no element";
  const inside = deniedInside(el);
  if (inside) return `inside ${inside}`;
  if (action === "type") {
    if (el.tagName !== "INPUT" || !TYPE_OK.some((s) => el.matches(s))) return "not a search box";
    return null;
  }
  if (action === "pick") {
    if (!PICK_OK.some((s) => el.matches(s)) || el.getAttribute("role") !== "combobox") return "not an allowed picker";
    return null;
  }
  if (action === "option") {
    const combo = ctx.combo;
    if (!combo || !PICK_OK.some((s) => combo.matches(s)) || combo.getAttribute("aria-expanded") !== "true") return "picker not open";
    if (el.getAttribute("role") !== "option" || !el.closest('[role="listbox"]')) return "not an option";
    if (document.querySelectorAll('[role="listbox"]').length !== 1) return "more than one list open";
    return null;
  }
  // click
  if (editable(el)) return "an editable field";
  if (el.tagName === "INPUT" && !el.matches(COMPARE_TICK)) return "an input";
  const hit = matchRule(el);
  if (!hit) return "not on the allow-list";
  const control = el.closest(CONTROL) || el;
  // A control nested inside an allowed one (a pencil in a project row) must be allowed itself.
  if (control !== hit.match && hit.match.contains(control)) {
    const own = matchRule(control);
    if (!own || own.match !== control) return "a control inside an allowed one";
  }
  if (control.tagName === "INPUT" && !control.matches(COMPARE_TICK)) return "an input";
  if (editable(control)) return "an editable field";
  const ownRule = control === hit.match ? hit.rule : (matchRule(control) || hit).rule;
  if (!ownRule.row && DENY_WORDS.test(accessibleName(control))) return "a writing word";
  return null;
}

/**
 * Checks one action; throws ReadOnlyViolation when it is not allowed. Records every call.
 * ctx: { scene, key (key/store), helper (do), combo (option) }.
 */
export function check(action, el, ctx = {}) {
  let reason;
  try { reason = reasonFor(action, el, ctx); } catch (e) { reason = `check failed: ${String(e && e.message || e).slice(0, 60)}`; }
  const ok = reason == null;
  const L = log();
  if (L && L.length < LOG_MAX) {
    const node = el && el.nodeType === 1 ? el : null;
    const control = node ? (node.closest(CONTROL) || node) : null;
    L.push({
      action, tag: node ? node.tagName.toLowerCase() : null, data: dataAttrs(node),
      name: control ? accessibleName(control).slice(0, 80) : (ctx.key || ctx.helper || null),
      tour: node ? (node.closest("[data-tour]")?.getAttribute("data-tour") || null) : null,
      dialog: node ? closestDialogName(node) : null,
      scene: ctx.scene ?? null, ok, reason: reason || null,
    });
  }
  if (!ok) throw new ReadOnlyViolation(action, reason);
  return true;
}
