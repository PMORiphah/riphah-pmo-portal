// PMO Simulation director: the voice.
//
// On-device voices only (PMO decision, 14 Oct 2026): a voice is used only when the browser reports
// localService === true, its language is English, and its name is not one of the network voices
// (Chrome's "Google …", Edge's "… Online (Natural)"), which send the spoken text to Google or
// Microsoft. utterance.voice is always set: left null, the browser could pick a network voice itself.
// Preference: en-IN, then en-GB, then en-US, then any other English. No eligible voice → captions only.
//
// Speed control (plan §4): every line is timed from onstart to onend against its spoken words. The
// voice's natural speed is learned from that, and the next line's rate is nudged so a slow voice is
// brought up to about 140 words a minute (and a very fast one down a little), within 0.95–1.15.

const NETWORK = /Google|Online/i;
const LANG_RANK = ["en-IN", "en-GB", "en-US"];
export const RATE_MIN = 0.95;
export const RATE_MAX = 1.15;
export const TARGET_WPM = 140;   // a voice slower than this is sped up
export const FAST_WPM = 185;     // a voice faster than this is slowed toward 175
export const READ_WPM = 150;     // captions-only reading pace
export const START_DELAY = 0.3;  // seconds a line takes to start, in the estimates

export const countWords = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const langOf = (v) => String(v?.lang || "").replace("_", "-");

export function isEligible(v) {
  return !!v && v.localService === true && /^en(-|$)/i.test(langOf(v)) && !NETWORK.test(String(v.name || ""));
}

/** Eligible voices, best first. */
export function eligibleVoices(synth = window.speechSynthesis) {
  let list = [];
  try { list = synth ? synth.getVoices() || [] : []; } catch { list = []; }
  const rank = (v) => {
    const l = langOf(v).toLowerCase();
    const i = LANG_RANK.findIndex((x) => l === x.toLowerCase());
    return i < 0 ? LANG_RANK.length : i;
  };
  return list.filter(isEligible).sort((a, b) => rank(a) - rank(b) || (b.default === true) - (a.default === true)
    || String(a.name).localeCompare(String(b.name)));
}

/** The voices, once the browser has listed them (Chrome lists them a moment after load). */
export function loadVoices(timeoutMs = 2500, synth = window.speechSynthesis) {
  return new Promise((resolve) => {
    if (!synth) { resolve([]); return; }
    const now = eligibleVoices(synth);
    let raw = [];
    try { raw = synth.getVoices() || []; } catch { raw = []; }
    if (raw.length) { resolve(now); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; try { synth.removeEventListener?.("voiceschanged", finish); } catch { /* ignore */ } resolve(eligibleVoices(synth)); };
    try { synth.addEventListener?.("voiceschanged", finish); } catch { /* ignore */ }
    setTimeout(finish, timeoutMs);
  });
}

export const clampRate = (r) => Math.min(RATE_MAX, Math.max(RATE_MIN, r));
export function rateFor(naturalWpm) {
  if (!naturalWpm || !isFinite(naturalWpm)) return 1;
  if (naturalWpm < TARGET_WPM) return clampRate(TARGET_WPM / naturalWpm);
  if (naturalWpm > FAST_WPM) return clampRate(175 / naturalWpm);
  return 1;
}

/**
 * Speaks lines with one voice, learning its speed. speak() resolves when the line has ended:
 * { interrupted, ms, words, rate, stuck }. With no voice (or voice switched off) it waits a
 * reading pace on the run clock instead, so captions-only runs keep the same rhythm.
 */
export class Narrator {
  constructor({ synth = window.speechSynthesis, voice = null, enabled = true, sleep } = {}) {
    this.synth = synth || null;
    this.voice = voice;
    this.enabled = enabled;
    this.sleep = sleep;           // (sec, signal) => Promise, on the run clock
    this.rate = 1;
    this.natural = null;          // learned words a minute at rate 1
    this.log = [];
    this._cancelled = new WeakSet();
    this._current = null;
  }
  get voiceOn() { return !!(this.enabled && this.voice && this.synth); }
  /** Words a minute the next line is expected to take (for the deadline governor). */
  get wpm() { return this.voiceOn ? (this.natural || 135) * this.rate : READ_WPM; }
  /** Seconds a line of `words` words is expected to take, start delay included. */
  estimate(words) { return words * 60 / Math.max(60, this.wpm) + START_DELAY; }

  setVoice(voice) { this.voice = voice; this.natural = null; this.rate = 1; }

  speak(text, { signal } = {}) {
    const words = countWords(text);
    if (!this.voiceOn) {
      const sec = this.estimate(words);
      return (this.sleep ? this.sleep(sec, signal) : new Promise((r) => setTimeout(r, sec * 1000)))
        .then(() => ({ interrupted: false, ms: sec * 1000, words, rate: 1, read: true }));
    }
    return new Promise((resolve) => {
      let u;
      try { u = new SpeechSynthesisUtterance(text); } catch { resolve({ interrupted: false, ms: 0, words, rate: 1, stuck: true }); return; }
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = this.rate;
      u.pitch = 1;
      u.volume = 1;
      let t0 = null, done = false;
      const expectMs = (words * 60 / Math.max(60, (this.natural || 135) * this.rate)) * 1000;
      const finish = (interrupted, stuck = false) => {
        if (done) return;
        done = true;
        clearTimeout(watch);
        if (this._current === u) this._current = null;
        const ms = t0 == null ? 0 : performance.now() - t0;
        const cut = interrupted || this._cancelled.has(u);
        if (!cut && !stuck && t0 != null && ms > 300) this._learn(words, ms, u.rate);
        resolve({ interrupted: cut, ms, words, rate: u.rate, stuck });
      };
      u.onstart = () => { t0 = performance.now(); };
      u.onend = () => finish(false);
      u.onerror = (e) => finish(true, !(e && /interrupted|canceled/i.test(e.error || "")));
      // Chrome now and then never reports the end of a line: carry on after twice its length.
      const watch = setTimeout(() => { try { this.synth.cancel(); } catch { /* ignore */ } finish(false, true); }, expectMs * 2 + 3000);
      const onAbort = () => this.cancel();
      signal?.addEventListener?.("abort", onAbort, { once: true });
      this._current = u;
      const go = () => { if (done) return; try { this.synth.speak(u); } catch { finish(false, true); } };
      try {
        // A paused or wedged queue would hold the line back: start from an empty queue. Chrome can
        // drop a line spoken in the same moment as a cancel, so give the cancel a beat first.
        if (this.synth.speaking || this.synth.pending) { this.synth.cancel(); setTimeout(go, 60); } else go();
      } catch { finish(false, true); }
    });
  }

  cancel() {
    if (this._current) this._cancelled.add(this._current);
    try { this.synth?.cancel(); } catch { /* ignore */ }
  }

  _learn(words, ms, rate) {
    const wpmAt = words / (ms / 60000);
    const nat = wpmAt / (rate || 1);
    if (!isFinite(nat) || nat < 40 || nat > 400) return;
    this.natural = this.natural == null ? nat : 0.5 * this.natural + 0.5 * nat;
    this.rate = rateFor(this.natural);
    this.log.push({ words, ms: Math.round(ms), rate: +(rate || 1).toFixed(3), wpm: Math.round(wpmAt), next: +this.rate.toFixed(3) });
    if (this.log.length > 60) this.log.shift();
  }
}
