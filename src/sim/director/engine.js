// PMO Simulation director: the scene engine.
//
// Plays the scenes of src/sim/scenes.js on the real App, one after another, within the PMO's
// 2-minute limit (plan §4):
//   - every step is an "ensure": it checks the screen first and acts only when needed, so replaying a
//     scene (Previous, Chapters, a retry) never flips a toggle back;
//   - a line is spoken first and the screen acts in the next frame; a line's minimum hold runs
//     alongside the steps, so waiting for a page costs nothing until the hold is used up;
//   - every ready condition has 4 s of run time; on a miss the scene's starting data is restored and
//     the scene tried once more, then skipped with a note only the presenter sees;
//   - the deadline governor: at each scene start, run time so far + what the remaining scenes need
//     at the voice's measured speed; over 116 s → this scene uses its short line and shorter holds;
//   - the hard cut: at 119.5 s of run time the run goes to the closing card, whatever is happening.
// The run report (per scene: start, end, waits, rate, governor) is kept on window.__PMO_SIM_REPORT__.
import { RunClock, Aborted, WaitTimeout, checkAbort, sleepRun, sleepUntil, nextFrame, tick } from "./clock.js";
import * as D from "./dom.js";
import { countWords } from "./speech.js";

export const LIMIT = 120;
export const GOVERN_AT = 116;
export const CUT_AT = 119.5;
export const WAIT_LIMIT = 4;
const SHORT_HOLD = 0.7;          // a short scene keeps 70 % of its holds
const r2 = (x) => Math.round(x * 100) / 100;

export class Director {
  /**
   * backend: { snapshot, restore }   lines: resolved narration lines   meta: resolved SEED.meta
   * scenes: from scenes.js           narrator: speech.Narrator           spotlight: spotlight.Spotlight
   */
  constructor({ backend, lines, meta, scenes, mode, narrator, spotlight, clock }) {
    this.backend = backend;
    this.lines = new Map((lines || []).map((l) => [l.id, l]));
    this.meta = meta || {};
    this.scenes = scenes;
    this.mode = mode;
    this.narrator = narrator;
    this.spot = spotlight;
    this.clock = clock || new RunClock();
    this.chapters = this.meta.chapters || [];
    this.listeners = new Set();
    this.snaps = new Map();
    this.epoch = null;
    this.paused = false;
    this.pauseEpoch = 0;
    this.hovered = null;
    this.cutTimer = 0;
    this.report = null;
    this.state = { phase: "begin", scene: -1, sceneN: 0, chapter: 0, caption: "", kicker: "", speaking: false,
      mini: false, short: false, paused: false, note: "", busy: false };
  }

  // ── state for the React layer ─────────────────────────────────────────────────────────────────
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _set(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) { try { fn(this.state); } catch { /* a listener never stops the run */ } }
  }
  chapterOf(n) { return this.chapters.find((c) => (c.scenes || []).includes(n)) || null; }
  indexOf(n) { return this.scenes.findIndex((s) => s.n === n); }
  plannedStart(n) {
    const s = (this.meta.scenes || []).find((x) => x.scene === n);
    return s ? s.start : 0;
  }

  // ── controls ──────────────────────────────────────────────────────────────────────────────────
  /** Start pressed on the Begin screen (the press is also the browser's gesture for speech). */
  start() {
    this._newReport();
    this.snaps.clear();
    this.clock.reset();
    this.clock.start();
    this.paused = false;
    this._set({ phase: "running", paused: false, note: "", caption: "", mini: false });
    this._watchCut();
    this._go(0, false);
  }

  pause() {
    if (this.state.phase !== "running" || this.paused) return;
    this.paused = true;
    this.pauseEpoch++;
    this.clock.pause();
    this.narrator.cancel();
    if (this.report) this.report.pauses++;
    this._set({ paused: true, speaking: false });
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.clock.start();
    this._set({ paused: false });
  }
  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  next() { if (this.state.phase !== "begin") this.jumpTo(Math.min(this.state.scene + 1, this.scenes.length - 1)); }
  prev() { if (this.state.phase !== "begin") this.jumpTo(Math.max(0, this.state.scene - 1)); }
  chapter(n) {
    const ch = this.chapters.find((c) => c.n === n);
    if (!ch) return;
    const i = this.indexOf((ch.scenes || [])[0]);
    if (i >= 0) this.jumpTo(i);
  }

  /** Restores scene i's starting data (when it was played before), resets the screen and plays on. */
  jumpTo(i) {
    if (!this.report) this._newReport();
    i = Math.max(0, Math.min(this.scenes.length - 1, i));
    this._abort();
    this.narrator.cancel();
    const snap = this.snaps.get(i);
    if (snap) { try { this.backend.restore(snap); } catch { /* the scene's own steps re-establish the screen */ } }
    this.clock.set(this.plannedStart(this.scenes[i].n));
    this.paused = false;
    this.clock.start();
    this.report.jumps.push({ to: this.scenes[i].n, restored: !!snap });
    this.report.total = null;
    this._set({ phase: "running", paused: false, note: "", mini: false });
    this._watchCut();
    this._go(i, true);
  }

  /** Stops everything (Restart and Exit). */
  stop() {
    this._abort();
    this.epoch = null;
    this.narrator.cancel();
    clearInterval(this.cutTimer);
    this.clock.pause();
    this.paused = false;
    this.spot.clear();
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    this._set({ phase: "begin", paused: false, speaking: false, caption: "", mini: false, note: "", scene: -1 });
  }

  async gate(signal) {
    while (this.paused) { checkAbort(signal); await tick(60); }
    checkAbort(signal);
  }

  // ── the run ───────────────────────────────────────────────────────────────────────────────────
  _newReport() {
    this.report = {
      v: 1, limit: LIMIT, governAt: GOVERN_AT, cutAt: CUT_AT, mode: this.mode,
      voice: this.narrator.voiceOn ? `${this.narrator.voice.name} (${this.narrator.voice.lang})` : null,
      captionsOnly: !this.narrator.voiceOn, viewport: [window.innerWidth, window.innerHeight],
      scenes: [], governor: [], jumps: [], pauses: 0, cut: null, total: null, ok: null, errors: [],
      rate: this.narrator.log,
    };
    try { window.__PMO_SIM_REPORT__ = this.report; } catch { /* read-only global in an odd host */ }
  }

  /** Stops the scene in progress; it records the run time it stopped at, before the clock moves. */
  _abort() {
    if (!this.epoch) return;
    try { this.epoch.signal.stoppedAt = r2(this.clock.now()); } catch { /* ignore */ }
    this.epoch.abort();
  }

  _go(i, jumped) {
    const ac = new AbortController();
    this.epoch = ac;
    this._loop(i, ac.signal, jumped).catch((e) => {
      if (e instanceof Aborted) return;
      console.error("[simulation] director stopped:", e);
      this.report?.errors.push(String(e && e.message || e).slice(0, 200));
    });
  }

  async _loop(i, signal, jumped) {
    if (jumped) await this._tidy(signal, this.scenes[i]);
    for (let k = i; k < this.scenes.length; k++) {
      checkAbort(signal);
      if (this.scenes[k].closing) { await this._close(k, signal, false); return; }
      await this._scene(k, signal);
    }
  }

  _watchCut() {
    clearInterval(this.cutTimer);
    this.cutTimer = setInterval(() => {
      if (this.state.phase === "running" && !this.paused && this.clock.now() >= CUT_AT) this._cut();
    }, 40);
  }
  _cut() {
    clearInterval(this.cutTimer);
    if (this.report) this.report.cut = r2(this.clock.now());
    this._abort();
    this.narrator.cancel();
    const ac = new AbortController();
    this.epoch = ac;
    const k = this.scenes.findIndex((s) => s.closing);
    this._close(k, ac.signal, true).catch(() => { /* aborted by a later control */ });
  }

  async _scene(i, signal) {
    const sc = this.scenes[i];
    const report = this.report;              // this run's report (a Restart starts a new one)
    const rec = { n: sc.n, start: r2(this.clock.now()), waits: [], notes: [], tries: 0 };
    try { this.snaps.set(i, this.backend.snapshot()); } catch { rec.notes.push("no snapshot"); }
    const short = this._govern(i);
    const ch = this.chapterOf(sc.n);
    rec.short = short;
    rec.rate = +this.narrator.rate.toFixed(3);
    rec.wpm = Math.round(this.narrator.wpm);
    this._set({ scene: i, sceneN: sc.n, chapter: ch ? ch.n : 0, short, note: "",
      kicker: sc.kicker || (ch ? `${ch.n}/${this.chapters.length} · ${ch.title}` : "") });
    for (let attempt = 0; attempt < 2; attempt++) {
      rec.tries = attempt + 1;
      const ctx = { signal, short, rec, line: null, scene: sc };
      try {
        await this._steps(sc.setup || [], ctx, true);
        await this._steps(sc.beats || [], ctx, false);
        await this._finishLine(ctx);
        break;
      } catch (e) {
        if (e instanceof Aborted) {
          // Stopped by a control or the hard cut: still in the report, marked as such.
          rec.end = signal.stoppedAt ?? r2(this.clock.now()); rec.dur = r2(rec.end - rec.start); rec.notes.push("stopped");
          report?.scenes.push(rec);
          throw e;
        }
        this.narrator.cancel();
        const what = e instanceof WaitTimeout ? e.what : `error: ${String(e && e.message || e).slice(0, 120)}`;
        if (!(e instanceof WaitTimeout)) console.warn("[simulation] scene", sc.n, e);
        if (attempt === 0) {
          rec.notes.push(`retried after: ${what}`);
          try { const s = this.snaps.get(i); if (s) this.backend.restore(s); } catch { /* ignore */ }
          await this._tidy(signal, sc);
          continue;
        }
        rec.notes.push(`skipped: ${what}`);
        rec.skipped = true;
        this._set({ note: `Scene ${sc.n} skipped (${what})` });
      }
    }
    if (this.hovered && sc.keepHover !== true) { D.unhover(this.hovered); this.hovered = null; }
    rec.end = r2(this.clock.now());
    rec.dur = r2(rec.end - rec.start);
    report.scenes.push(rec);
  }

  async _close(k, signal, cut) {
    clearInterval(this.cutTimer);
    const sc = this.scenes[k];
    const rec = { n: sc.n, start: r2(this.clock.now()), waits: [], notes: cut ? ["hard cut"] : [], tries: 1 };
    this.spot.clear();
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    const short = cut ? true : this._govern(k);
    rec.short = short;
    const ch = this.chapterOf(sc.n);
    this._set({ phase: "closing", scene: k, sceneN: sc.n, chapter: ch ? ch.n : 0, mini: false, paused: false });
    if (!cut) {
      const ctx = { signal, short, rec, line: null, scene: sc };
      await this._steps(sc.beats || [], ctx, false);
      await this._finishLine(ctx);
    } else {
      const L = this.lines.get((sc.lines || [])[0]);
      if (L) this._set({ caption: this._text(L, true).caption, speaking: false });
    }
    rec.end = r2(this.clock.now());
    rec.dur = r2(rec.end - rec.start);
    this.clock.pause();
    const rep = this.report;
    rep.scenes.push(rec);
    rep.total = rec.end;
    rep.ok = rep.total <= LIMIT;
    this._set({ speaking: false, phase: "closing" });
  }

  // ── governor ──────────────────────────────────────────────────────────────────────────────────
  _text(L, short) {
    let t = { caption: L.caption, speech: L.speech };
    if (this.mode === "sample" && L.sample) t = L.sample;
    if (short && L.short) t = L.short;
    return t;
  }
  _hold(L, short) { return (+L.minHold || 0) * (short ? SHORT_HOLD : 1); }
  /** Seconds scene i needs: per line, the longer of its hold and its speech at the measured speed. */
  estimate(i, short = false) {
    const sc = this.scenes[i];
    let t = 0;
    for (const id of sc.lines || []) {
      const L = this.lines.get(id);
      if (!L) continue;
      t += Math.max(this._hold(L, short), this.narrator.estimate(countWords(this._text(L, short).speech)));
    }
    return t + (short ? (sc.extraShort ?? sc.extra ?? 0) : (sc.extra || 0));
  }
  _govern(i) {
    const at = this.clock.now();
    let rest = 0;
    for (let j = i; j < this.scenes.length; j++) rest += this.estimate(j, false);
    const short = at + rest > GOVERN_AT;
    this.report.governor.push({ n: this.scenes[i].n, at: r2(at), projected: r2(at + rest), short });
    return short;
  }

  // ── lines ─────────────────────────────────────────────────────────────────────────────────────
  async _say(id, ctx) {
    await this._finishLine(ctx);
    const L = this.lines.get(id);
    if (!L) { ctx.rec.notes.push(`no line ${id}`); return; }
    const t = this._text(L, ctx.short);
    const line = { id, start: this.clock.now(), hold: this._hold(L, ctx.short) };
    this._set({ caption: t.caption, lineId: id, speaking: this.narrator.voiceOn });
    line.p = this._speak(t.speech, ctx).then((r) => {
      line.result = r;
      if (this.state.lineId === id) this._set({ speaking: false });
      return r;
    });
    line.p.catch(() => { /* aborted with the scene: whoever awaits it sees the abort */ });
    ctx.line = line;
    (ctx.rec.lines ||= []).push(id);
    await nextFrame();                       // speak first, act in the next frame
  }
  async _speak(text, ctx) {
    for (let n = 0; n < 5; n++) {
      await this.gate(ctx.signal);
      const pe = this.pauseEpoch;
      if (this.narrator.voiceOn) this._set({ speaking: true });
      const r = await this.narrator.speak(text, { signal: ctx.signal });
      checkAbort(ctx.signal);
      if (r.read || this.pauseEpoch === pe) return r;
      // Paused during the line: Resume says it again from its start.
    }
    return { interrupted: true };
  }
  async _finishLine(ctx) {
    const line = ctx.line;
    if (!line) return;
    await line.p;
    await sleepUntil(this.clock, line.start + line.hold, ctx.signal);
    ctx.line = null;
  }

  // ── steps ─────────────────────────────────────────────────────────────────────────────────────
  async _steps(list, ctx, setup) {
    for (const b of list) {
      await this.gate(ctx.signal);
      if (setup && (b.hold != null || b.say)) continue;
      if (b.when && !b.when(this.api(ctx))) continue;
      await this._step(b, ctx, setup);
    }
  }

  async _step(b, ctx, setup) {
    const S = ctx.signal;
    if (b.say) return this._say(b.say, ctx);
    if (b.endLine) return this._finishLine(ctx);
    if (b.nav) return this._nav(b, ctx);
    if (b.tab) return this._tab(b, ctx);
    if (b.click) return this._click(b, ctx);
    if (b.type) return this._type(b, ctx, setup);
    if (b.hover) {
      const el = await this._need(b.hover, ctx, b.label);
      if (this.hovered && this.hovered !== el) D.unhover(this.hovered);
      D.hover(el, b.at ? b.at(el) : undefined);
      this.hovered = el;
      return;
    }
    if (b.unhover) { const el = b.unhover === true ? this.hovered : D.one(b.unhover); D.unhover(el); if (el === this.hovered) this.hovered = null; return; }
    if (b.wait || b.test) return this._wait(b, ctx);
    if ("spot" in b) {
      if (!b.spot) this.spot.clear();
      else this.spot.set(b.spot, { mode: b.ring ? "ring" : "dim", pad: b.pad ?? 8, radius: b.radius ?? 12 });
      return;
    }
    if (b.scroll) return this._scroll(b, ctx);
    if (b.hold != null) return sleepRun(this.clock, ctx.short ? (b.short ?? b.hold * SHORT_HOLD) : b.hold, S);
    if ("mini" in b) { this._set({ mini: !!b.mini }); return; }
    if (b.key) { D.pressKey(b.key); await nextFrame(); return; }
    if (b.store) { try { sessionStorage.setItem(b.store[0], b.store[1]); } catch { /* ignore */ } return; }
    if (b.pick) return this._pick(b, ctx);
    if (b.settle) { await D.settled({ quiet: b.settle, timeout: 2500 }); checkAbort(S); return; }
    if (b.do) { await b.do(this.api(ctx)); checkAbort(S); return; }
    ctx.rec.notes.push(`unknown step ${Object.keys(b).join(",")}`);
  }

  /** Helpers handed to scenes' custom steps. */
  api(ctx) {
    return {
      D, meta: this.meta, mode: this.mode, short: ctx.short, signal: ctx.signal, clock: this.clock,
      need: (t, label) => this._need(t, ctx, label),
      wait: (spec) => this._wait(spec, ctx),
      hold: (s) => sleepRun(this.clock, s, ctx.signal),
      spot: (t, o) => this.spot.set(t, o),
      note: (s) => ctx.rec.notes.push(s),
      step: (b) => this._step(b, ctx, false),
    };
  }

  /** The element for a target, waiting for it as a ready condition. */
  async _need(target, ctx, label) {
    let el = D.one(target);
    if (el) return el;
    await this._wait({ wait: target, label: label || (typeof target === "string" ? target : "element") }, ctx);
    el = D.one(target);
    if (!el) throw new WaitTimeout(label || String(target));
    return el;
  }

  _ready(b) {
    if (b.test) return !!b.test();
    const els = D.all(b.wait);
    if (b.gone) return els.length === 0;
    if (!els.length) return false;
    if (b.count != null && els.length !== +b.count) return false;
    if (b.min != null && els.length < +b.min) return false;
    if (b.text && !els.some((e) => D.hasText(e, b.text))) return false;
    return true;
  }

  async _wait(b, ctx) {
    const limit = b.timeout ?? WAIT_LIMIT;
    const label = b.label || (typeof b.wait === "string" ? b.wait : "condition") + (b.text ? ` "${b.text}"` : "");
    const t0 = this.clock.now();
    for (;;) {
      await this.gate(ctx.signal);
      let ok = false;
      try { ok = this._ready(b); } catch { ok = false; }
      if (ok) {
        const ms = Math.round((this.clock.now() - t0) * 1000);
        if (ms >= 50) ctx.rec.waits.push([label, ms]);
        return;
      }
      if (this.clock.now() - t0 > limit) throw new WaitTimeout(label);
      await tick(40);
    }
  }

  async _nav(b, ctx) {
    const id = b.nav;
    if (!D.isNavActive(id)) {
      const el = await this._need(D.attr("data-nav", id), ctx, `nav ${id}`);
      el.click();
    }
    await this._wait({ test: () => D.isNavActive(id), label: `page ${id}` }, ctx);
    if (b.ready) await this._wait({ wait: b.ready, text: b.text, count: b.count, min: b.min, label: b.label || `page ${id} ready` }, ctx);
  }

  async _tab(b, ctx) {
    const sel = D.attr("data-tab", b.tab);
    const el = await this._need(sel, ctx, `tab ${b.tab}`);
    if (D.isTabActive(el)) return;
    el.click();
    // The tab's own content is the proof it opened (its bold label eases in over a few hundred ms).
    if (b.ready) await this._wait({ wait: b.ready, text: b.text, count: b.count, min: b.min, label: b.label || `tab ${b.tab} ready` }, ctx);
    else await this._wait({ test: () => D.isTabActive(document.querySelector(sel)), label: `tab ${b.tab} selected` }, ctx);
  }

  async _click(b, ctx) {
    const api = this.api(ctx);
    if (b.unless && b.unless(api)) return;
    const el = await this._need(b.click, ctx, b.label);
    el.click();
    if (b.then) await this._wait({ ...b.then, label: b.then.label || b.label }, ctx);
  }

  async _type(b, ctx, setup) {
    const el = await this._need(b.type, ctx, b.label || "text box");
    const text = typeof b.text === "function" ? b.text(this.api(ctx)) : String(b.text || "");
    if (el.value === text) return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (el.value) D.setValue(el, "");
    if (setup) { D.setValue(el, text); return; }
    const gap = 1 / (b.cps || 16);
    for (let i = 1; i <= text.length; i++) {
      await this.gate(ctx.signal);
      D.setValue(el, text.slice(0, i));
      await sleepRun(this.clock, gap, ctx.signal);
    }
  }

  async _scroll(b, ctx) {
    const el = await this._need(b.scroll, ctx, b.label);
    if (!b.force && !D.needsScroll(el, b.margin ?? 64)) return;
    el.scrollIntoView({ block: b.block || "center", inline: "nearest", behavior: b.instant ? "auto" : "smooth" });
    // Until it stops moving (smooth scrolling takes a few hundred ms), at most 0.9 s.
    let last = null, still = 0;
    const t0 = this.clock.now();
    while (this.clock.now() - t0 < 0.9) {
      await tick(50);
      checkAbort(ctx.signal);
      const top = Math.round(el.getBoundingClientRect().top);
      still = top === last ? still + 1 : 0;
      last = top;
      if (still >= 2) break;
    }
  }

  /** The portal's own Select (a button plus a listbox portalled to body): open it, then pick. */
  async _pick(b, ctx) {
    const api = this.api(ctx);
    if (b.unless && b.unless(api)) return;
    const combo = await this._need(b.pick, ctx, b.label || "picker");
    if (combo.getAttribute("aria-expanded") !== "true") combo.click();
    const opt = await this._need(b.option, ctx, `${b.label || "picker"} option`);
    if (b.show) await sleepRun(this.clock, ctx.short ? b.show * SHORT_HOLD : b.show, ctx.signal);
    opt.click();
    await this._wait({ test: () => !document.querySelector('[role="listbox"]'), label: "picker closed", timeout: 2 }, ctx);
  }

  /** Puts the screen back to plain pages before a jump or a retry: no dialogs, no viewer, no hover. */
  async _tidy(signal, scene) {
    this.spot.clear();
    this._set({ mini: false });
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    for (let n = 0; n < 3; n++) {
      if (document.querySelector('[role="listbox"]')) D.pressKey("Escape");
      if (document.querySelector('[data-tour="lightbox"]')) D.pressKey("Escape");
      const back = document.querySelector('[data-tour="report-back"]');
      if (back) back.click();
      const prev = document.querySelector('[data-tour="bulk-preview"]');
      if (prev) {
        const box = prev.closest('[role="dialog"]') || prev.parentElement?.parentElement?.parentElement || document;
        const cancel = Array.from(box.querySelectorAll("button")).find((x) => /^\s*cancel\s*$/i.test(x.textContent || ""));
        cancel?.click();
      }
      await tick(120);
      checkAbort(signal);
      if (!document.querySelector('[role="listbox"],[data-tour="lightbox"],[data-tour="report-back"],[data-tour="bulk-preview"]')) break;
    }
    // A fresh page: leave the scene's page and come back, so its local state (search text, filters,
    // an open project) starts as it did in the run.
    const page = scene?.page;
    if (page) {
      const away = page === "cmd" ? "team" : "cmd";
      const el = document.querySelector(D.attr("data-nav", away));
      if (el && !D.isNavActive(away)) { el.click(); await tick(80); }
      // Back to the scene's page, so its first frame is not the page it left.
      const go = document.querySelector(D.attr("data-nav", page));
      if (go) { go.click(); await tick(80); }
    }
    // Badges (Updates, Past Projects) re-read after restored data.
    try { document.dispatchEvent(new Event("visibilitychange")); } catch { /* ignore */ }
    checkAbort(signal);
  }
}
