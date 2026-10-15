// PMO Simulation director: reading and driving the real App's DOM.
//
// The director never reaches into React state. It finds elements by the data-* hooks the portal
// carries (data-nav, data-tab, data-tour, data-project-id, …), checks what is on screen, and acts the
// way a person would: element.click(), typing through the input's native value setter, and hover
// as mouseover / mouseout (React derives onMouseEnter / onMouseLeave from those two, never from a
// dispatched mouseenter).

const ROOT_ID = "root";

/** CSS-escaped attribute selector: attr("data-campus", name). Names may hold any character. */
export const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, "\\$&"));
export const attr = (name, value) => `[${name}="${esc(value)}"]`;

/** One element for a target: a selector, an element, or a function returning either (or a list). */
export function one(target, root = document) {
  if (!target) return null;
  if (typeof target === "function") { const v = target(); return Array.isArray(v) ? (v.find(Boolean) || null) : (v || null); }
  if (typeof target === "string") return root.querySelector(target);
  return target.nodeType === 1 ? target : null;
}
/** Every element for a target (same forms as one(), plus arrays of them). */
export function all(target, root = document) {
  if (!target) return [];
  if (Array.isArray(target)) return target.flatMap((t) => all(t, root));
  if (typeof target === "function") { const v = target(); return (Array.isArray(v) ? v : [v]).filter((e) => e && e.nodeType === 1); }
  if (typeof target === "string") return Array.from(root.querySelectorAll(target));
  return target.nodeType === 1 ? [target] : [];
}

export const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
/** Visible text, lower-cased and squeezed (innerText applies text-transform, so compare lower case). */
export const textOf = (el) => (el ? norm(el.innerText ?? el.textContent) : "");
export const hasText = (el, text) => !text || textOf(el).includes(norm(text));

/** The part of an element inside the viewport, or null when none of it is. */
export function visibleRect(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const left = Math.max(0, r.left), top = Math.max(0, r.top);
  const right = Math.min(window.innerWidth, r.right), bottom = Math.min(window.innerHeight, r.bottom);
  if (right - left < 2 || bottom - top < 2) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** Whether the sidebar item for a page is the current one (aria-current when the portal sets it). */
export function isNavActive(id) {
  const el = document.querySelector(attr("data-nav", id));
  if (!el) return false;
  const cur = el.getAttribute("aria-current");
  if (cur) return cur === "page" || cur === "true";
  return parseInt(getComputedStyle(el).fontWeight, 10) >= 600;
}
/** Whether a tab of the portal's Tabs strip is the selected one (bold) or aria-selected. */
export function isTabActive(el) {
  if (!el) return false;
  const sel = el.getAttribute("aria-selected");
  if (sel != null) return sel === "true";
  return parseInt(getComputedStyle(el).fontWeight, 10) >= 650;
}

/** Hover as the browser reports it: pointerover + mouseover (+ a move) at a point inside the element. */
export function hover(el, point) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = point?.x ?? r.left + r.width / 2, y = point?.y ?? r.top + r.height / 2;
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, relatedTarget: document.body, view: window };
  try { el.dispatchEvent(new PointerEvent("pointerover", { ...init, pointerType: "mouse" })); } catch { /* old engines */ }
  el.dispatchEvent(new MouseEvent("mouseover", init));
  el.dispatchEvent(new MouseEvent("mousemove", { ...init, relatedTarget: null }));
}
export function unhover(el) {
  if (!el || !el.isConnected) return;
  const init = { bubbles: true, cancelable: true, composed: true, relatedTarget: document.body, view: window };
  try { el.dispatchEvent(new PointerEvent("pointerout", { ...init, pointerType: "mouse" })); } catch { /* old engines */ }
  el.dispatchEvent(new MouseEvent("mouseout", init));
}

/** Sets an input's value the way typing does, so React's onChange runs. */
export function setValue(input, value) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value").set;
  set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** A key press the App sees (dispatched on body so listeners on body, document and window all get it). */
export function pressKey(key) {
  const init = { key, code: key, bubbles: true, cancelable: true, composed: true };
  (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body)
    .dispatchEvent(new KeyboardEvent("keydown", init));
  document.body.dispatchEvent(new KeyboardEvent("keyup", init));
}

/** Scrolls an element to where the audience can see it, if it is not already well inside the view. */
export function needsScroll(el, margin = 64) {
  const r = el.getBoundingClientRect();
  return r.top < margin || r.bottom > window.innerHeight - margin;
}

/** The App's container element (the director observes only this, never its own layer). */
export const appRoot = () => document.querySelector("[data-sim-app]") || document.getElementById(ROOT_ID);

/** Whether the App shows a loading state: skeletons or a "Loading…" line. */
export function isLoading(root = appRoot()) {
  if (!root) return true;
  if (root.querySelector(".pmo-skeleton")) return true;
  const t = root.innerText || "";
  return /(^|\n)\s*Loading\b/.test(t);
}

/**
 * Resolves true once the App has been quiet (no nodes or text changing) for `quiet` ms and shows
 * no loading state, or false after `timeout` ms. Attribute changes are ignored: the portal animates
 * styles continuously (cursor lights, the assistant's face), which says nothing about readiness.
 */
export function settled({ quiet = 300, timeout = 8000, root = appRoot() } = {}) {
  return new Promise((resolve) => {
    if (!root) { resolve(false); return; }
    let last = performance.now();
    const t0 = last;
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    const iv = setInterval(() => {
      const now = performance.now();
      if (now - last >= quiet && !isLoading(root)) { done(true); return; }
      if (now - t0 > timeout) done(false);
    }, 60);
    function done(v) { clearInterval(iv); mo.disconnect(); resolve(v); }
  });
}

/** Climbs from an element to its nearest ancestor at least `minWidth` px wide (a card or panel). */
export function widen(el, minWidth) {
  let n = el;
  while (n && n.parentElement && n.getBoundingClientRect().width < minWidth) n = n.parentElement;
  return n;
}

/** Leaf elements under `root` whose own text matches `re` (for labels the portal does not hook). */
export function leaves(root, re) {
  if (!root) return [];
  const out = [];
  root.querySelectorAll("*").forEach((e) => {
    if (e.children.length === 0 && re.test((e.textContent || "").trim())) out.push(e);
  });
  return out;
}
