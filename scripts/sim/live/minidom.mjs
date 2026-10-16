// PMO Simulation (live data) tests: a very small DOM for the director's guard and engine tests in
// Node (no dependency). PUBLIC: no data. Owner: B3b.
//
// Supports what src/sim/director/guard.js and the engine's pure parts use: elements with tag,
// attributes, parent/children, text, matches()/closest()/querySelector(All)() for selector lists of
// descendant-combined compounds (tag, [attr], [attr="v"], [attr^="v"], [attr*="v"], :not([…])), and a
// document with querySelector(All), activeElement and body. getComputedStyle reads el.style.
export function makeDom() {
  class El {
    constructor(tag, attrs = {}, text = "") {
      this.tagName = String(tag).toUpperCase();
      this.nodeType = 1;
      this._attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
      this.children = [];
      this.parentElement = null;
      this._text = text;
      this.style = {};
      this.disabled = false;
      this.checked = false;
      this.value = "";
    }
    get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n === doc.documentElement; }
    get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
    getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
    hasAttribute(n) { return this._attrs.has(n); }
    setAttribute(n, v) { this._attrs.set(n, String(v)); }
    removeAttribute(n) { this._attrs.delete(n); }
    get isContentEditable() { let n = this; while (n) { const v = n.getAttribute("contenteditable"); if (v != null) return v !== "false"; n = n.parentElement; } return false; }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
    append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } return this; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(" "); }
    get innerText() { return this.textContent; }
    matches(sel) { return parseList(sel).some((cx) => matchComplex(this, cx)); }
    closest(sel) { const list = parseList(sel); let n = this; while (n) { if (list.some((cx) => matchComplex(n, cx))) return n; n = n.parentElement; } return null; }
    querySelectorAll(sel) { const list = parseList(sel); const out = []; const walk = (n) => { for (const c of n.children) { if (list.some((cx) => matchComplex(c, cx))) out.push(c); walk(c); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; }
  }
  const doc = {
    documentElement: new El("html"),
    get body() { return this._body; },
    activeElement: null,
    querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); },
    querySelector(sel) { return this.documentElement.querySelector(sel); },
  };
  doc._body = new El("body");
  doc.documentElement.append(doc._body);
  const h = (tag, attrs, ...kids) => {
    const text = kids.filter((k) => typeof k === "string").join(" ");
    const el = new El(tag, attrs || {}, text);
    el.append(...kids.filter((k) => k && typeof k === "object"));
    return el;
  };
  const getComputedStyle = (el) => ({ cursor: el.style.cursor || "auto", fontWeight: el.style.fontWeight || "400",
    borderTopColor: el.style.borderTopColor || "rgb(0, 0, 0)", visibility: el.style.visibility || "visible" });
  return { document: doc, h, El, getComputedStyle };
}

// ── selectors ──────────────────────────────────────────────────────────────────────────────────
const cache = new Map();
function parseList(sel) {
  if (cache.has(sel)) return cache.get(sel);
  const list = splitTop(sel, ",").map((s) => parseComplex(s.trim()));
  cache.set(sel, list);
  return list;
}
function splitTop(s, ch) {
  const out = []; let depth = 0, quote = null, cur = "";
  for (const c of s) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (c === ch && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
function parseComplex(s) {
  // descendant combinator only: split on whitespace outside brackets/quotes
  const parts = []; let depth = 0, quote = null, cur = "";
  for (const c of s) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (/\s/.test(c) && depth === 0) { if (cur) parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur) parts.push(cur);
  return parts.map(parseCompound);
}
function parseCompound(s) {
  const out = { tag: null, attrs: [], nots: [] };
  const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s);
  let rest = s;
  if (m) { out.tag = m[0].toUpperCase(); rest = s.slice(m[0].length); }
  const re = /:not\((\[[^\]]+\])\)|\[([^\]=^*$~|]+)(?:([\^*]?=)"([^"]*)")?\]/g;
  let x;
  while ((x = re.exec(rest))) {
    if (x[1]) out.nots.push(parseCompound(x[1]));
    else out.attrs.push({ name: x[2], op: x[3] || null, value: x[4] ?? null });
  }
  return out;
}
function matchCompound(el, c) {
  if (c.tag && el.tagName !== c.tag) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v == null) return false;
    if (a.op === "=" && v !== a.value) return false;
    if (a.op === "^=" && !v.startsWith(a.value)) return false;
    if (a.op === "*=" && !v.includes(a.value)) return false;
  }
  for (const n of c.nots) if (matchCompound(el, n)) return false;
  return true;
}
function matchComplex(el, parts) {
  let i = parts.length - 1;
  if (!matchCompound(el, parts[i])) return false;
  let n = el.parentElement;
  for (i--; i >= 0; i--) {
    while (n && !matchCompound(n, parts[i])) n = n.parentElement;
    if (!n) return false;
    n = n.parentElement;
  }
  return true;
}
