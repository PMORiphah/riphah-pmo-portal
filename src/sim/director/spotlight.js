// PMO Simulation director: the spotlight.
//
// One full-screen SVG above the App. A dim layer (about 45 %) is cut by a mask holding one rounded
// hole per target, so several things can be lit at once (a row and its hover card, three manager
// blocks). Each lit area also gets a gold ring. In ring mode there is no dim at all, only the rings:
// for the Assign PM dialog and the Gallery picture, which sit below the dim layer's z-index.
//
// Targets are measured every frame (they move as pages scroll and animate) and the holes glide to
// them, so the light follows rather than jumps. A target that is not on screen simply has no hole;
// with no hole at all the dim fades out instead of darkening an empty page.
import { all, visibleRect } from "./dom.js";

const MAX = 10;                  // holes / rings drawn at most
const EASE = 0.24;               // share of the remaining distance covered per 16 ms frame
const DIM = "rgba(5, 13, 26, 0.45)";

export class Spotlight {
  constructor() {
    this.targets = [];
    this.opts = { mode: "off", pad: 8, radius: 12 };
    this.cur = [];                 // [{ x, y, w, h, a }] as drawn
    this.dimA = 0;                 // dim opacity as drawn
    this.nodes = null;
    this.raf = 0;
    this.last = 0;
    this._frame = this._frame.bind(this);
  }

  /** Called by the overlay with its SVG parts: { dim, holes:[rect], rings:[rect] }. */
  attach(nodes) {
    this.nodes = nodes;
    if (nodes && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this._frame); }
    if (!nodes && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  /**
   * Lights the targets. targets: selectors, elements or functions (resolved every frame), or
   * { union: target } to light all of a target's elements as one area.
   * opts.mode: "dim" (dim + holes + rings) | "ring" (rings only) | "off".
   * opts.dim: how dark the dim is, 0–1 of the usual 45 % (the opening dims the dashboard lightly).
   */
  set(targets, opts = {}) {
    this.targets = Array.isArray(targets) ? targets : targets ? [targets] : [];
    this.opts = { mode: "dim", pad: 8, radius: 12, dim: 1, ...opts };
    if (!this.targets.length && this.opts.mode !== "dim-all") this.opts.mode = "off";
  }
  clear() { this.targets = []; this.opts = { ...this.opts, mode: "off" }; }

  /** The rectangles currently aimed at (for tests and the run report). */
  aimed() { return this._measure(); }

  /** The screen edges and the sidebar's right edge (measured at most every 500 ms). */
  _bounds() {
    const now = performance.now();
    if (!this._b || now - this._b.t > 500) {
      let sbRight = 0;
      let sb = document.querySelector('[data-nav="cmd"]');
      while (sb && sb.parentElement && sb.getBoundingClientRect().height < window.innerHeight - 4) sb = sb.parentElement;
      if (sb && sb !== document.body && sb !== document.documentElement) {
        const r = sb.getBoundingClientRect();
        if (r.width > 40 && r.width <= 400 && r.left < 50) sbRight = r.right;
      }
      this._b = { t: now, sbRight, w: window.innerWidth, h: window.innerHeight };
    }
    return this._b;
  }

  _measure() {
    const { pad } = this.opts;
    const out = [];
    // Each lit area stays 4 px inside the screen, and a target in the page (right of the sidebar)
    // never rings into the sidebar: a full-width row or a toolbar at the top edge is drawn whole.
    const M = 4;
    const add = (r) => {
      if (!r || out.length >= MAX) return;
      const B = this._bounds();
      const minX = B.sbRight && r.left >= B.sbRight - 1 ? B.sbRight + M : M;
      const x1 = Math.max(r.left - pad, minX), y1 = Math.max(r.top - pad, M);
      const x2 = Math.min(r.left + r.width + pad, B.w - M), y2 = Math.min(r.top + r.height + pad, B.h - M);
      if (x2 - x1 < 2 || y2 - y1 < 2) return;
      out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    };
    for (const t of this.targets) {
      // { union: target } lights everything it finds as one area (one hole, one ring).
      if (t && typeof t === "object" && !t.nodeType && "union" in t) {
        const rs = all(t.union).map(visibleRect).filter(Boolean);
        if (!rs.length) continue;
        const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
        const right = Math.max(...rs.map((r) => r.left + r.width)), bottom = Math.max(...rs.map((r) => r.top + r.height));
        add({ left, top, width: right - left, height: bottom - top });
        continue;
      }
      for (const el of all(t)) add(visibleRect(el));
    }
    return out;
  }

  _frame(now) {
    this.raf = requestAnimationFrame(this._frame);
    const n = this.nodes;
    if (!n) return;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const k = 1 - Math.pow(1 - EASE, dt / 16.7);
    const mode = this.opts.mode;
    const goal = mode === "off" ? [] : this._measure();

    // Holes glide to their targets; a new hole opens from its target's centre; a dropped one closes.
    const cur = this.cur;
    for (let i = 0; i < Math.max(goal.length, cur.length); i++) {
      const g = goal[i];
      if (!cur[i]) cur[i] = g ? { x: g.x + g.w / 2, y: g.y + g.h / 2, w: 0, h: 0, a: 0 } : null;
      const c = cur[i];
      if (!c) continue;
      if (g) {
        c.x += (g.x - c.x) * k; c.y += (g.y - c.y) * k; c.w += (g.w - c.w) * k; c.h += (g.h - c.h) * k;
        c.a += (1 - c.a) * k;
      } else {
        c.x += (c.w / 2) * k; c.y += (c.h / 2) * k; c.w -= c.w * k; c.h -= c.h * k; c.a -= c.a * k;
      }
    }
    while (cur.length > goal.length && (!cur[cur.length - 1] || cur[cur.length - 1].a < 0.02)) cur.pop();

    const strength = Math.max(0, Math.min(1, Number(this.opts.dim ?? 1)));
    const dimGoal = (mode === "dim" ? (goal.length ? 1 : 0) : mode === "dim-all" ? 1 : 0) * strength;
    this.dimA += (dimGoal - this.dimA) * k;
    n.dim.setAttribute("fill", DIM);
    n.dim.style.opacity = this.dimA.toFixed(3);

    const rr = this.opts.radius;
    for (let i = 0; i < MAX; i++) {
      const c = cur[i];
      const hole = n.holes[i], ring = n.rings[i];
      if (!c || c.w < 1 || c.h < 1) {
        hole.setAttribute("width", "0"); hole.setAttribute("height", "0");
        ring.setAttribute("width", "0"); ring.setAttribute("height", "0");
        continue;
      }
      for (const el of [hole, ring]) {
        el.setAttribute("x", c.x.toFixed(1)); el.setAttribute("y", c.y.toFixed(1));
        el.setAttribute("width", c.w.toFixed(1)); el.setAttribute("height", c.h.toFixed(1));
        el.setAttribute("rx", rr); el.setAttribute("ry", rr);
      }
      ring.style.opacity = (mode === "off" ? 0 : c.a).toFixed(3);
    }
  }
}

export const SPOT_MAX = MAX;
