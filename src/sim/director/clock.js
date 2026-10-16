// PMO Simulation director: the run clock and waits that respect Pause.
//
// The run clock counts seconds since Start with pauses left out. It reads performance.now() (a
// monotonic clock), never Date. Every wait the director makes is measured on this clock, so a pause
// never makes a step time out and the 2:30 budget only counts time the audience actually watched.

export class RunClock {
  constructor() { this.base = 0; this.since = 0; this.running = false; }
  /** Milliseconds of run time. */
  ms() { return this.base + (this.running ? performance.now() - this.since : 0); }
  /** Seconds of run time. */
  now() { return this.ms() / 1000; }
  start() { if (this.running) return; this.since = performance.now(); this.running = true; }
  pause() { if (!this.running) return; this.base += performance.now() - this.since; this.running = false; }
  /** Sets the reading (a chapter jump starts the clock at that chapter's planned time). */
  set(sec) { this.base = Math.max(0, sec) * 1000; this.since = performance.now(); }
  reset() { this.base = 0; this.since = performance.now(); this.running = false; }
}

/** Thrown into every running step when the run is stopped, jumped or cut. */
export class Aborted extends Error {
  constructor() { super("aborted"); this.name = "Aborted"; }
}
/** A step's ready condition did not appear in time (5 s of run time; the Gallery 8 s). */
export class WaitTimeout extends Error {
  constructor(what) { super(`not ready: ${what}`); this.name = "WaitTimeout"; this.what = what; }
}

export const checkAbort = (signal) => { if (signal && signal.aborted) throw new Aborted(); };
export const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
/** The next painted frame (or 100 ms when the tab is hidden and frames stop). */
export const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 100);
});

/** Waits `sec` seconds of run time; a pause stretches the wait, it never shortens it. */
export async function sleepRun(clock, sec, signal) {
  const end = clock.ms() + Math.max(0, sec) * 1000;
  for (;;) {
    checkAbort(signal);
    const left = end - clock.ms();
    if (left <= 0) return;
    await tick(Math.min(50, Math.max(5, left)));
  }
}

/** Waits until the run clock reads `sec`. */
export function sleepUntil(clock, sec, signal) {
  return sleepRun(clock, sec - clock.now(), signal);
}

/** "1:12" */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
