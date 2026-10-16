// PMO Simulation director: the scene engine (live portal data). Owner: B3b. Spec: contract §H.3.
//
// Plays the scenes of src/sim/scenes.js on the real App, one after another, within the PMO's
// 2:30 limit:
//   - every step is an "ensure": it checks the screen first and acts only when needed, so replaying a
//     scene (Previous, Chapters, a retry) never flips a toggle back;
//   - a line is spoken first and the screen acts in the next frame; a line's minimum hold runs
//     alongside the steps, so waiting for a page costs nothing until the hold is used up;
//   - steps can wait for a word of the line being spoken ({ word } / { phrase }): the voice's word
//     boundary events when it reports them, else the line's own timing estimate;
//   - every action (click, type, pick, key, storage, helper) is checked by guard.js first; a refused
//     action leaves the scene out ("blocked action");
//   - every ready condition has 5 s of run time; on a miss the scene is tried once more, then left out
//     with a note only the presenter sees;
//   - each line's figures (the numbers it says) are checked on screen: in the run they are recorded,
//     in the silent rehearsal (mode "rehearsal") a failing line moves to its next candidate whose
//     figures are on screen, down to its figure-free line;
//   - the deadline governor: at each scene start, run time so far + what the remaining scenes need at
//     the voice's measured speed; over 146 s → this scene uses its short line and shorter holds;
//   - the hard cut: at 149.5 s of run time the run goes to the closing card, whatever is happening.
// The run report v2 is kept on window.__PMO_SIM_REPORT__ (run mode only).
import { RunClock, Aborted, WaitTimeout, checkAbort, sleepRun, sleepUntil, nextFrame, tick } from "./clock.js";
import * as D from "./dom.js";
import * as G from "./guard.js";
import { countWords, START_DELAY } from "./speech.js";

export const LIMIT = 150;
export const GOVERN_AT = 146;
export const CUT_AT = 149.5;
export const WAIT_LIMIT = 5;
export const FIGURE_WAIT = 5;     // a figure check in the rehearsal waits up to 5 s for the text
export const SHORT_HOLD = 0.7;    // a short scene keeps 70 % of its holds
const r2 = (x) => Math.round(x * 100) / 100;
const PLAIN = new Set(["short", "bare"]);

/** A figure the line says is not on screen and no candidate of a critical line could replace it. */
export class FigureFailure extends Error {
  constructor(line, slots) { super(`figures not on screen: ${line} ${slots.join(", ")}`); this.name = "FigureFailure"; this.line = line; this.slots = slots; }
}

// Tokens of a spoken text with their character offsets; a token is compared without the
// punctuation around it and without case.
const normTok = (t) => String(t).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push({ t: normTok(m[0]), at: m.index });
  return out;
}

export class Director {
  /**
   * backend: { snapshot, restore, reset }      lines: narration lines (src/sim/live/build.js)
   * meta: { plan, chapters, scenes, asOf, code } scenes: from scenes.js
   * narrator: speech.Narrator  spotlight: spotlight.Spotlight  mode: "run" | "rehearsal"
   * helpers: { revealNav(arg) … } the registered helper steps ({ do: name, arg })
   */
  constructor({ backend, lines, meta, scenes, narrator, spotlight, clock, mode = "run", guard = G, helpers = {} }) {
    this.backend = backend;
    this.lineList = lines || [];
    this.lines = new Map(this.lineList.map((l) => [l.id, l]));
    this.meta = meta || {};
    this.scenes = scenes || [];
    this.mode = mode === "rehearsal" ? "rehearsal" : "run";
    this.narrator = narrator;
    this.spot = spotlight;
    this.clock = clock || new RunClock();
    this.guard = guard;
    this.helpers = helpers;
    this.listeners = new Set();
    this.snaps = new Map();
    this.epoch = null;
    this.paused = false;
    this.pauseEpoch = 0;
    this.hovered = null;
    this.cutTimer = 0;
    this.report = null;
    this.target = null;            // the scene a jump is heading for, until it starts
    this.state = { phase: "begin", scene: -1, sceneN: 0, chapter: 0, caption: "", kicker: "", speaking: false,
      mini: false, short: false, paused: false, note: "", busy: false, presenter: "dock", lineId: null };
  }

  get rehearsal() { return this.mode === "rehearsal"; }
  get chapters() { return this.meta.chapters || []; }

  // ── state for the React layer ─────────────────────────────────────────────────────────────────
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _set(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) { try { fn(this.state); } catch { /* a listener never stops the run */ } }
  }
  chapterOf(n) { return this.chapters.find((c) => (c.scenes || []).includes(n)) || null; }
  indexOf(n) { return this.scenes.findIndex((s) => s.n === n); }
  /** The scene's planned start (timing.project at the learned pace; 135 wpm before Test voice). */
  plannedStart(n) {
    const s = (this.meta.scenes || []).find((x) => x.n === n);
    return s && Number.isFinite(s.start) ? s.start : 0;
  }
  _defaultKicker(n) {
    const ch = this.chapterOf(n);
    return ch ? `${ch.n}/${this.chapters.length} · ${ch.title}` : "";
  }

  // ── controls ──────────────────────────────────────────────────────────────────────────────────
  /** Start pressed on the Begin screen (the press is also the browser's gesture for speech). */
  start() {
    this._newReport();
    this.snaps.clear();
    this.clock.reset();
    this.clock.start();
    this.paused = false;
    this._set({ phase: "running", paused: false, note: "", caption: "", mini: false, presenter: "dock" });
    this._watchCut();
    this._go(this._playable(0, 1), false);
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

  // Counted from a jump still being set up (Next pressed several times in a row moves that many
  // scenes), else from the scene on screen. Scenes left out are passed over.
  _base() { return this.target != null ? this.target : this.state.scene; }
  /** The first scene from i (in direction dir) that is not left out. */
  _playable(i, dir = 1) {
    let k = Math.max(0, Math.min(this.scenes.length - 1, i));
    while (k >= 0 && k < this.scenes.length && this.scenes[k].skip && !this.scenes[k].closing) k += dir;
    if (k < 0) return this._playable(0, 1);
    return Math.min(k, this.scenes.length - 1);
  }
  next() { if (this.state.phase !== "begin") this.jumpTo(this._playable(this._base() + 1, 1)); }
  prev() { if (this.state.phase !== "begin") this.jumpTo(this._playable(this._base() - 1, -1)); }
  chapter(n) {
    const ch = this.chapters.find((c) => c.n === n);
    if (!ch) return;
    const first = (ch.scenes || []).map((s) => this.indexOf(s)).filter((i) => i >= 0 && !this.scenes[i].skip)[0];
    if (first != null) this.jumpTo(first);
  }

  /** Resets the screen and plays on from scene i (the clock is set to its planned start). */
  jumpTo(i) {
    if (!this.report) this._newReport();
    i = Math.max(0, Math.min(this.scenes.length - 1, i));
    this.target = i;
    this._abort();
    this.narrator.cancel();
    const snap = this.snaps.get(i);
    if (snap) { try { this.backend.restore(snap); } catch { /* the scene's own steps re-establish the screen */ } }
    this.clock.set(this.plannedStart(this.scenes[i].n));
    this.paused = false;
    this.clock.start();
    this.report.jumps.push({ to: this.scenes[i].n, restored: !!snap });
    this.report.total = null;
    this._set({ phase: "running", paused: false, note: "", mini: false, presenter: "dock" });
    this._watchCut();
    this._go(i, true);
  }

  /** Stops everything (Restart and Exit). */
  stop() {
    this._abort();
    this.target = null;
    this.epoch = null;
    this.narrator.cancel();
    clearInterval(this.cutTimer);
    this.clock.pause();
    this.paused = false;
    this.spot.clear();
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    this._set({ phase: "begin", paused: false, speaking: false, caption: "", mini: false, note: "", scene: -1, presenter: "dock" });
  }

  async gate(signal) {
    while (this.paused) { checkAbort(signal); await tick(60); }
    checkAbort(signal);
  }

  // ── the run ───────────────────────────────────────────────────────────────────────────────────
  _newReport() {
    const vp = typeof window !== "undefined" ? [window.innerWidth, window.innerHeight] : [0, 0];
    this.report = {
      v: 2, limit: LIMIT, governAt: GOVERN_AT, cutAt: CUT_AT, mode: this.mode,
      voice: this.narrator.voiceOn ? `${this.narrator.voice.name} (${this.narrator.voice.lang})` : null,
      captionsOnly: !this.narrator.voiceOn, viewport: vp,
      scenes: [], governor: [], jumps: [], pauses: 0, cut: null, total: null, ok: null, errors: [],
      rate: this.narrator.log,
    };
    if (!this.rehearsal) { try { window.__PMO_SIM_REPORT__ = this.report; } catch { /* read-only global in an odd host */ } }
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
      const sc = this.scenes[k];
      if (sc.closing) { await this._close(k, signal, false); return; }
      if (sc.skip) {
        this.report?.scenes.push({ n: sc.n, start: r2(this.clock.now()), end: r2(this.clock.now()), dur: 0, lines: [], use: {},
          short: false, skipped: true, waits: [], notes: [sc.skipReason || "left out"], figureChecks: [] });
        continue;
      }
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

  _newRec(sc) {
    return { n: sc.n, start: r2(this.clock.now()), lines: [], use: {}, short: false, skipped: false, waits: [], notes: [],
      figureChecks: [], failed: [], tries: 0, checkMs: 0 };
  }

  /** Plays one scene (both modes). Returns its record; in run mode it is also pushed on the report. */
  async _scene(i, signal) {
    const sc = this.scenes[i];
    const report = this.report;              // this run's report (a Restart starts a new one)
    const rec = this._newRec(sc);
    try { this.snaps.set(i, this.backend.snapshot()); } catch { rec.notes.push("no snapshot"); }
    const short = this.rehearsal ? false : this._govern(i);
    const ch = this.chapterOf(sc.n);
    rec.short = short;
    rec.rate = +this.narrator.rate.toFixed(3);
    rec.wpm = Math.round(this.narrator.wpm);
    if (this.target === i) this.target = null;
    this._set({ scene: i, sceneN: sc.n, chapter: ch ? ch.n : 0, short, kicker: sc.kicker || this._defaultKicker(sc.n) });
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
          if (!this.rehearsal) report?.scenes.push(rec);
          throw e;
        }
        this.narrator.cancel();
        if (e instanceof G.ReadOnlyViolation) {
          rec.notes.push(`skipped: ${e.message}`);
          rec.skipped = true;
          rec.reason = "blocked action";
          rec.blocked = e.message;
          if (!this.rehearsal) this._set({ note: `Scene ${sc.n} left out (blocked action)` });
          break;
        }
        if (e instanceof FigureFailure) {
          rec.notes.push(e.message);
          rec.skipped = true;
          rec.reason = `figures not on screen (${e.slots.join(", ")})`;
          break;
        }
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
        rec.reason = `not ready: ${what}`;
        if (!this.rehearsal) this._set({ note: `Scene ${sc.n} skipped (${what})` });
      }
    }
    if (this.hovered && sc.keepHover !== true) { D.unhover(this.hovered); this.hovered = null; }
    for (const id of sc.lines || []) { const L = this.lines.get(id); if (L) rec.use[id] = L.candidates?.[L.use]?.name ?? null; }
    rec.end = r2(this.clock.now());
    rec.dur = r2(rec.end - rec.start);
    if (!this.rehearsal) report?.scenes.push(rec);
    return rec;
  }

  async _close(k, signal, cut) {
    clearInterval(this.cutTimer);
    const sc = this.scenes[k];
    const rec = { ...this._newRec(sc), notes: cut ? ["hard cut"] : [], tries: 1 };
    this.spot.clear();
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    if (this.target === k) this.target = null;
    const short = cut ? true : this._govern(k);
    rec.short = short;
    const ch = this.chapterOf(sc.n);
    this._set({ phase: "closing", scene: k, sceneN: sc.n, chapter: ch ? ch.n : 0, mini: false, paused: false, presenter: "dock" });
    // The closing line must also end inside the limit: when it would not (presenter pauses late in
    // the run), its caption shows without being spoken, as after the hard cut.
    const L0 = this.lines.get((sc.lines || [])[0]);
    const need = L0 ? Math.max(this._hold(L0, short), this.narrator.estimate(countWords(this._text(L0, short).speech))) : 0;
    if (!cut && this.clock.now() + need > CUT_AT) { cut = true; rec.notes.push("closing line shown, not spoken (time)"); }
    if (!cut) {
      const ctx = { signal, short, rec, line: null, scene: sc };
      await this._steps(sc.beats || [], ctx, false);
      await this._finishLine(ctx);
    } else if (L0) {
      this._set({ caption: this._text(L0, true).caption, speaking: false });
    }
    if (L0) rec.use[L0.id] = L0.candidates?.[L0.use]?.name ?? null;
    rec.end = r2(this.clock.now());
    rec.dur = r2(rec.end - rec.start);
    this.clock.pause();
    const rep = this.report;
    if (rep) {
      rep.scenes.push(rec);
      rep.total = rec.end;
      rep.ok = rep.total <= LIMIT && rep.errors.length === 0;
    }
    this._set({ speaking: false, phase: "closing" });
  }

  // ── lines and the governor ────────────────────────────────────────────────────────────────────
  _cand(L) { return (L.candidates && L.candidates[L.use ?? 0]) || L; }
  /** The text spoken for a line: its candidate in use, or that candidate's short form. */
  _text(L, short) {
    const c = this._cand(L);
    return (short || L.compact) && c.short ? c.short : c;
  }
  _hold(L, short) {
    if (this.rehearsal) return 0;
    const c = this._cand(L);
    return (+(c.minHold ?? L.minHold) || 0) * (short || L.compact ? SHORT_HOLD : 1);
  }
  /** Seconds scene i needs: per line, the longer of its hold and its speech at the measured speed. */
  estimate(i, short = false) {
    const sc = this.scenes[i];
    if (!sc || sc.skip) return 0;
    let t = 0;
    for (const id of sc.lines || []) {
      const L = this.lines.get(id);
      if (!L || L.skip) continue;
      t += Math.max(this._hold(L, short), this.narrator.estimate(countWords(this._text(L, short).speech)));
    }
    return t + (sc.extra || 0);
  }
  _govern(i) {
    const at = this.clock.now();
    let rest = 0;
    for (let j = i; j < this.scenes.length; j++) rest += this.estimate(j, false);
    const short = at + rest > GOVERN_AT;
    this.report?.governor.push({ n: this.scenes[i].n, at: r2(at), projected: r2(at + rest), short });
    return short;
  }

  async _say(id, ctx) {
    await this._finishLine(ctx);
    const L = this.lines.get(id);
    if (!L) { ctx.rec.notes.push(`no line ${id}`); return; }
    if (L.skip) { ctx.rec.notes.push(`line ${id} left out`); return; }
    const short = ctx.short || !!L.compact;
    const t = this._text(L, short);
    const text = t.speech || "";
    const toks = tokenize(text);
    const line = { id, L, start: this.clock.now(), spokeAt: this.clock.now(), hold: this._hold(L, ctx.short), text, toks,
      words: toks.length, wpm: Math.max(60, this.narrator.wpm), charIndex: -1, result: null, checked: false, short };
    const kicker = L.kicker || ctx.scene.kicker || this._defaultKicker(ctx.scene.n);
    this._set({ caption: t.caption, lineId: id, kicker, speaking: !this.rehearsal && this.narrator.voiceOn });
    if (this.rehearsal) {
      line.result = { read: true, rehearsal: true };
      line.p = Promise.resolve(line.result);
    } else {
      line.p = this._speak(text, ctx, line).then((r) => {
        line.result = r;
        if (this.state.lineId === id) this._set({ speaking: false });
        return r;
      });
      line.p.catch(() => { /* aborted with the scene: whoever awaits it sees the abort */ });
    }
    ctx.line = line;
    ctx.rec.lines.push(id);
    await nextFrame();                       // speak first, act in the next frame
  }
  async _speak(text, ctx, line) {
    for (let n = 0; n < 5; n++) {
      await this.gate(ctx.signal);
      const pe = this.pauseEpoch;
      if (this.narrator.voiceOn) this._set({ speaking: true });
      line.spokeAt = this.clock.now();
      line.charIndex = -1;
      line.wpm = Math.max(60, this.narrator.wpm);
      const r = await this.narrator.speak(text, { signal: ctx.signal, onBoundary: (b) => { if (b.charIndex > line.charIndex) line.charIndex = b.charIndex; } });
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
    if (!line.checked) await this._figures(ctx);
    ctx.line = null;
  }

  // ── figure checks ─────────────────────────────────────────────────────────────────────────────
  _checkList(figs) {
    return (figs || []).map((f) => {
      let ok = false;
      try { ok = D.all(f.where).some((el) => D.hasText(el, f.screen)); } catch { ok = false; }
      return { slot: f.slot, where: f.where, screen: f.screen, ok };
    });
  }
  async _pollFigures(figs, sec, ctx) {
    const t0 = performance.now();
    let res = this._checkList(figs);
    while (res.some((r) => !r.ok) && performance.now() - t0 < sec * 1000) {
      await tick(100);
      checkAbort(ctx.signal);
      res = this._checkList(figs);
    }
    return res;
  }
  /** Checks the current line's figures now: recorded in the run; candidates moved in the rehearsal. */
  async _figures(ctx) {
    const line = ctx.line;
    if (!line || line.checked) return;
    line.checked = true;
    const L = line.L;
    const c = this._cand(L);
    // A short form says only some of the slots: check those (the short text's own figures).
    const figs = line.short ? (c.figures || []).filter((f) => this._said(line.text, f, c)) : (c.figures || []);
    if (!this.rehearsal) {
      const at = r2(this.clock.now());
      for (const r of this._checkList(figs)) ctx.rec.figureChecks.push({ line: L.id, slot: r.slot, ok: r.ok, at });
      return;
    }
    const t0 = performance.now();
    const res = await this._pollFigures(figs, FIGURE_WAIT, ctx);
    const failed = res.filter((r) => !r.ok);
    for (const r of res) ctx.rec.figureChecks.push({ line: L.id, slot: r.slot, ok: r.ok, at: 0 });
    if (!failed.length) { ctx.rec.checkMs += performance.now() - t0; return; }
    for (const f of failed) ctx.rec.failed.push({ line: L.id, slot: f.slot });
    const from = L.use ?? 0;
    for (let i = from + 1; i < (L.candidates || []).length; i++) {
      const r = await this._pollFigures(L.candidates[i].figures || [], 1, ctx);
      if (r.every((x) => x.ok)) {
        L.use = i;
        ctx.rec.notes.push(`${L.id}: ${failed.map((f) => `'${f.screen}'`).join(", ")} not on screen, so the ${L.candidates[i].name} line is used`);
        ctx.rec.checkMs += performance.now() - t0;
        return;
      }
    }
    ctx.rec.checkMs += performance.now() - t0;
    throw new FigureFailure(L.id, failed.map((f) => f.slot));
  }
  /** Whether a figure's slot is said in a short text (its caption form appears in it). */
  _said(text, f, c) {
    const full = c.short && c.short.caption ? c.short.caption : "";
    return !!full && !!f.screen && full.toLowerCase().includes(String(f.screen).toLowerCase().replace(/m$/, ""));
  }

  // ── word anchors ──────────────────────────────────────────────────────────────────────────────
  /** Index of the token a step waits for, or -1 when the spoken text does not have it. */
  _wordIndex(b, line, api) {
    if (!line) return -1;
    if (b.phrase != null) {
      const p = typeof b.phrase === "function" ? b.phrase(api) : b.phrase;
      if (!p) return -1;
      const at = line.text.toLowerCase().indexOf(String(p).toLowerCase());
      if (at < 0) return -1;
      const k = line.toks.findIndex((t) => t.at >= at);
      return k;
    }
    const w = normTok(typeof b.word === "function" ? b.word(api) : b.word);
    if (!w) return -1;
    let n = Math.max(1, b.nth || 1);
    for (let k = 0; k < line.toks.length; k++) {
      if (line.toks[k].t === w && --n === 0) return k;
    }
    return -1;
  }
  /** Waits for the current line to reach a word. Resolves false when the word is not in the line. */
  async _waitWord(b, ctx) {
    const line = ctx.line;
    if (!line) return !b.ifWord;
    const k = this._wordIndex(b, line, this.api(ctx));
    if (k < 0 && b.ifWord) return false;
    if (this.rehearsal) return true;
    const frac = b.frac ?? 0.5;
    const offset = k >= 0 ? line.toks[k].at : null;
    for (;;) {
      await this.gate(ctx.signal);
      if (line.result) return true;                         // the line has ended
      const est = START_DELAY + (k >= 0 ? k : frac * line.words) * 60 / line.wpm;
      const elapsed = this.clock.now() - line.spokeAt;
      const events = this.narrator.voiceOn && this.narrator.boundaries && offset != null;
      if (events ? (line.charIndex >= offset || elapsed >= est * 1.6 + 1) : elapsed >= est) return true;
      await tick(20);
    }
  }
  /** Waits until the current line has run `sec` seconds (70 % in a short scene). */
  async _waitAfter(sec, ctx) {
    if (this.rehearsal || !ctx.line) return;
    const s = ctx.short || ctx.line.short ? sec * SHORT_HOLD : sec;
    await sleepUntil(this.clock, ctx.line.start + s, ctx.signal);
  }

  // ── steps ─────────────────────────────────────────────────────────────────────────────────────
  async _steps(list, ctx, setup) {
    for (const b of list) {
      await this.gate(ctx.signal);
      if (setup && (b.hold != null || b.say || b.word != null || b.phrase != null || b.after != null || b.presenter)) continue;
      if (b.when && !b.when(this.api(ctx))) continue;
      await this._step(b, ctx, setup);
    }
  }

  async _step(b, ctx, setup) {
    const S = ctx.signal;
    if (b.say) return this._say(b.say, ctx);
    if (b.endLine) return this._finishLine(ctx);
    if (b.after != null) await this._waitAfter(b.after, ctx);
    if (b.word != null || b.phrase != null) {
      const ok = await this._waitWord(b, ctx);
      if (!ok) return;                                      // ifWord and the word is not said
    }
    if (b.figures) return this._figures(ctx);
    if (b.presenter) { this._set({ presenter: b.presenter }); return; }
    if (b.nav) return this._nav(b, ctx);
    if (b.tab) return this._tab(b, ctx);
    if (b.click) return this._click(b, ctx);
    if (b.type) return this._type(b, ctx, setup);
    if (b.hover) {
      const el = await this._need(b.hover, ctx, b.label);
      if (this.hovered && this.hovered !== el) D.unhover(this.hovered);
      let pt = b.at ? b.at(el) : undefined;
      D.hover(el, pt);
      this.hovered = el;
      // seek(el, point) → a better point, or null when the hover shows what it should (a chart's tooltip).
      for (let k = 0; b.seek && k < 5; k++) {
        await nextFrame(); await nextFrame();
        checkAbort(S);
        const next = b.seek(el, pt);
        if (!next) break;
        pt = next;
        D.hover(el, pt);
      }
      return;
    }
    if (b.unhover) { const el = b.unhover === true ? this.hovered : D.one(b.unhover); D.unhover(el); if (el === this.hovered) this.hovered = null; return; }
    if (b.wait || b.test) return this._wait(b, ctx);
    if ("spot" in b) {
      const targets = typeof b.spot === "function" ? b.spot(this.api(ctx)) : b.spot;
      if (!targets || (Array.isArray(targets) && !targets.length && !b.ring)) this.spot.clear();
      else this.spot.set(targets, { mode: b.ring ? "ring" : "dim", pad: b.pad ?? 8, radius: b.radius ?? 12, dim: b.dim ?? 1 });
      return;
    }
    if (b.scroll) return this._scroll(b, ctx);
    if (b.hold != null) {
      if (this.rehearsal) return;
      return sleepRun(this.clock, ctx.short ? (b.short ?? b.hold * SHORT_HOLD) : b.hold, S);
    }
    if ("mini" in b) { this._set({ mini: !!b.mini }); return; }
    if (b.key) {
      this.guard.check("key", null, { scene: ctx.scene.n, key: b.key });
      D.pressKey(b.key);
      await nextFrame();
      return;
    }
    if (b.store) {
      this.guard.check("store", null, { scene: ctx.scene.n, key: b.store[0] });
      try { sessionStorage.setItem(b.store[0], b.store[1]); } catch { /* ignore */ }
      return;
    }
    if (b.pick) return this._pick(b, ctx);
    if (b.settle) { await D.settled({ quiet: b.settle, timeout: 2500 }); checkAbort(S); return; }
    if (b.do) {
      const name = String(b.do);
      this.guard.check("do", null, { scene: ctx.scene.n, helper: name });
      const fn = this.helpers[name];
      if (!fn) { ctx.rec.notes.push(`no helper ${name}`); return; }
      await fn(b.arg, this.api(ctx));
      checkAbort(S);
      return;
    }
    if (b.after != null || b.word != null || b.phrase != null) return;   // a pure wait
    ctx.rec.notes.push(`unknown step ${Object.keys(b).join(",")}`);
  }

  /** Helpers handed to scenes' predicates and targets. */
  api(ctx) {
    const self = this;
    return {
      D, meta: this.meta, plan: this.meta.plan, mode: this.mode, rehearsal: this.rehearsal, short: ctx.short,
      signal: ctx.signal, clock: this.clock,
      /** The name of the candidate a line uses ("main", "short", "bare", a variant name). */
      uses(id) { const L = self.lines.get(id); return L ? self._cand(L).name : null; },
      /** Whether a line is said in a reduced form: the governor's short line, a compacted line, or its short or bare candidate. */
      plain(id) { const L = self.lines.get(id); return !!ctx.short || !!(L && (L.compact || PLAIN.has(self._cand(L).name))); },
      need: (t, label) => this._need(t, ctx, label),
      note: (s) => ctx.rec.notes.push(s),
    };
  }

  _check(action, el, ctx, extra) {
    this.guard.check(action, el, { scene: ctx.scene?.n ?? ctx.scene ?? null, ...extra });
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
    if (b.test) return !!b.test(this);
    const els = D.all(b.wait);
    if (b.gone) return els.length === 0;
    if (!els.length) return false;
    if (b.count != null && els.length !== +b.count) return false;
    if (b.min != null && els.length < +b.min) return false;
    if (b.text && !els.some((e) => D.hasText(e, b.text))) return false;
    return true;
  }

  async _wait(b, ctx) {
    if (b.soft) {
      // A cosmetic condition (a tooltip's text): noted when it does not hold, never a reason to retry.
      try { await this._wait({ ...b, soft: false }, ctx); } catch (e) { if (!(e instanceof WaitTimeout)) throw e; ctx.rec.notes.push(`not seen: ${e.what}`); }
      return;
    }
    const limit = b.timeout ?? WAIT_LIMIT;
    const label = b.label || (typeof b.wait === "string" ? b.wait : "condition") + (b.text ? ` "${b.text}"` : "");
    const t0 = this.clock.now();
    const w0 = performance.now();
    for (;;) {
      await this.gate(ctx.signal);
      let ok = false;
      try { ok = this._ready(b); } catch { ok = false; }
      if (ok) {
        const ms = Math.round(this.rehearsal ? performance.now() - w0 : (this.clock.now() - t0) * 1000);
        if (ms >= 50) ctx.rec.waits.push([label, ms]);
        return;
      }
      const waited = this.rehearsal ? (performance.now() - w0) / 1000 : this.clock.now() - t0;
      if (waited > limit) throw new WaitTimeout(label);
      await tick(40);
    }
  }

  async _nav(b, ctx) {
    const id = b.nav;
    if (!D.isNavActive(id)) {
      const el = await this._need(D.attr("data-nav", id), ctx, `nav ${id}`);
      this._check("click", el, ctx);
      el.click();
    }
    await this._wait({ test: () => D.isNavActive(id), label: `page ${id}` }, ctx);
    if (b.ready) await this._wait({ wait: b.ready, text: b.text, count: b.count, min: b.min, label: b.label || `page ${id} ready` }, ctx);
  }

  async _tab(b, ctx) {
    const sel = D.attr("data-tab", b.tab);
    const el = await this._need(sel, ctx, `tab ${b.tab}`);
    if (!D.isTabActive(el)) {
      this._check("click", el, ctx);
      el.click();
    }
    // The tab's own content is the proof it opened (its bold label eases in over a few hundred ms).
    if (b.ready) await this._wait({ wait: b.ready, text: b.text, count: b.count, min: b.min, label: b.label || `tab ${b.tab} ready` }, ctx);
    else await this._wait({ test: () => D.isTabActive(document.querySelector(sel)), label: `tab ${b.tab} selected` }, ctx);
  }

  async _click(b, ctx) {
    const api = this.api(ctx);
    if (b.unless && b.unless(api)) return;
    const el = await this._need(b.click, ctx, b.label);
    this._check("click", el, ctx);
    el.click();
    if (b.then) await this._wait({ ...b.then, label: b.then.label || b.label }, ctx);
  }

  async _type(b, ctx, setup) {
    const el = await this._need(b.type, ctx, b.label || "text box");
    const text = typeof b.text === "function" ? b.text(this.api(ctx)) : String(b.text || "");
    if (el.value === text) return;
    this._check("type", el, ctx);
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (el.value) D.setValue(el, "");
    if (setup || this.rehearsal) { D.setValue(el, text); return; }
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
    const instant = b.instant || this.rehearsal;
    el.scrollIntoView({ block: b.block || "center", inline: "nearest", behavior: instant ? "auto" : "smooth" });
    if (instant) { await nextFrame(); return; }
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
    if (combo.getAttribute("aria-expanded") !== "true") {
      this._check("pick", combo, ctx);
      combo.click();
    }
    const opt = await this._need(b.option, ctx, `${b.label || "picker"} option`);
    if (b.show && !this.rehearsal) await sleepRun(this.clock, ctx.short ? b.show * SHORT_HOLD : b.show, ctx.signal);
    this._check("option", opt, ctx, { combo });
    opt.click();
    await this._wait({ test: () => !document.querySelector('[role="listbox"]'), label: "picker closed", timeout: 2 }, ctx);
  }

  /** Puts the screen back to plain pages before a jump or a retry: no dialogs, no viewer, no hover. */
  async _tidy(signal, scene) {
    const g = (action, el, extra) => { try { this.guard.check(action, el, { scene: "tidy", ...extra }); return true; } catch { return false; } };
    this.spot.clear();
    this._set({ mini: false, presenter: "dock" });
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    for (let n = 0; n < 3; n++) {
      if (document.querySelector('[role="listbox"]') && g("key", null, { key: "Escape" })) D.pressKey("Escape");
      if (document.querySelector('[data-tour="lightbox"]') && g("key", null, { key: "Escape" })) D.pressKey("Escape");
      const back = document.querySelector('[data-tour="report-back"]');
      if (back && g("click", back)) back.click();
      const prev = document.querySelector('[data-tour="bulk-preview"]');
      if (prev) {
        const box = prev.closest('[role="dialog"]') || document;
        const cancel = Array.from(box.querySelectorAll("button")).find((x) => /^\s*cancel\s*$/i.test(x.textContent || ""));
        if (cancel && g("click", cancel)) cancel.click();
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
      if (el && !D.isNavActive(away) && g("click", el)) { el.click(); await tick(80); }
      const go = document.querySelector(D.attr("data-nav", page));
      if (go && g("click", go)) { go.click(); await tick(80); }
    }
    // The sidebar list back at its top (a scene may have scrolled it on a short screen).
    try { document.querySelector('[data-nav="cmd"]')?.closest("nav")?.scrollTo({ top: 0 }); } catch { /* ignore */ }
    checkAbort(signal);
  }

  // ── the silent rehearsal (src/sim/live/preflight.js drives it) ────────────────────────────────
  /** Prepares a rehearsal: a clean report and a running clock (no speech, no holds). */
  beginRehearsal() {
    this._newReport();
    this.clock.reset();
    this.clock.start();
    this._set({ phase: "rehearsing" });
  }
  /** Plays scene i silently, checking its figures; returns its record. */
  async rehearseScene(i, signal) {
    const sc = this.scenes[i];
    const w0 = performance.now();
    const rec = await this._scene(i, signal);
    rec.wallMs = Math.round(performance.now() - w0);
    if (sc.critical && rec.skipped) rec.critical = true;
    return rec;
  }
  endRehearsal() {
    this.spot.clear();
    if (this.hovered) { D.unhover(this.hovered); this.hovered = null; }
    this.clock.pause();
    this._set({ phase: "begin", caption: "", scene: -1 });
  }
}
