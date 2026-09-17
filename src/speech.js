import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   SPEECH — reading an answer aloud

   Uses the browser's own speechSynthesis: no API, no key, no cost, no network
   call, and it works offline. Voice quality varies by device, which is why the
   voice was tested on real hardware before this was built rather than after.

   The screen and the speech are deliberately different texts. The screen keeps
   the verbatim figure the edge function verified — PKR 226,099,073 — because
   that is the number someone might act on. Speech says "226.1 million rupees",
   because digit-by-digit is unusable aloud. Neither is derived from the other
   at display time; the conversion runs once, on a copy.
   ═══════════════════════════════════════════════════════════════════════════ */

const MONTHS = ["January","February","March","April","May","June","July",
                "August","September","October","November","December"];

const trim = (x) => String(x).replace(/\.0+$/, "");

/** 226,099,073 -> "226.1 million". Full figure stays on screen. */
export function sayNumber(s) {
  const n = parseFloat(String(s).replace(/,/g, ""));
  if (!isFinite(n)) return String(s);
  const a = Math.abs(n);
  if (a >= 1e9) return trim((n / 1e9).toFixed(2)) + " billion";
  if (a >= 1e6) return trim((n / 1e6).toFixed(1)) + " million";
  if (a >= 1e3) return trim((n / 1e3).toFixed(1)) + " thousand";
  return String(Math.round(n));
}

/** Markdown answer -> something worth hearing. */
export function toSpeech(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let table = [];
  const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  // A table read literally is "pipe I T dot 2 7 1 1 0 7 pipe" — useless. Each
  // row becomes a sentence instead, and project codes are dropped entirely.
  const flush = () => {
    if (table.length < 2) { out.push(...table); table = []; return; }
    const head = cells(table[0]);
    table.slice(1).forEach((row) => {
      if (/^[\s|:\-]+$/.test(row)) return;
      const vals = cells(row);
      const parts = [];
      head.forEach((h, i) => {
        const v = vals[i];
        if (!v || v === "(no code)" || v === "-") return;
        if (/\bcode\b/i.test(h)) return;
        parts.push(/name|project/i.test(h) ? v : `${h} ${v}`);
      });
      if (parts.length) out.push(parts.join(", ") + ".");
    });
    table = [];
  };

  lines.forEach((ln) => {
    if (/^\s*\|.*\|\s*$/.test(ln)) table.push(ln);
    else { flush(); out.push(ln); }
  });
  flush();

  let t = out.join("\n");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
  t = t.replace(/^\s*[-*\u2022]\s+/gm, "");
  t = t.replace(/\bPKR\s*([\d,]+\.?\d*)/g, (_, d) => sayNumber(d) + " rupees");
  t = t.replace(/(^|[^\d.])(\d{1,3}(?:,\d{3})+)(?!\d)/g, (_, p, d) => p + sayNumber(d));
  t = t.replace(/([\d.]+)\s*%/g, "$1 percent");
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,
        (_, y, mo, d) => `${parseInt(d, 10)} ${MONTHS[parseInt(mo, 10) - 1]} ${y}`);
  t = t.replace(/\b[A-Z]{2}\.\d{6}-\d{2}\b/g, "");
  t = t.replace(/df_review/g, "D F review").replace(/pdd_not_submitted/g, "P D D not submitted");
  t = t.replace(/_/g, " ");
  // a colon left hanging before a break reads as a stumble
  t = t.replace(/:\s*\n/g, ". ").replace(/\n{2,}/g, ". ").replace(/\n/g, ". ");
  t = t.replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1");
  return t.trim();
}

/** Rank the device's voices; the best one varies wildly between platforms. */
function score(v) {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (/google/.test(n)) s += 5;
  if (/natural|neural|premium|enhanced/.test(n)) s += 5;
  if (/samantha|daniel|karen|moira|serena|aaron|siri/.test(n)) s += 3;
  if (/^en-gb/i.test(v.lang)) s += 2;
  if (/^en/i.test(v.lang)) s += 2;
  if (v.localService === false) s += 1;
  return s;
}

export function useSpeech() {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const [speakingId, setSpeakingId] = useState(null);
  const [ready, setReady] = useState(false);
  const voice = useRef(null);

  useEffect(() => {
    if (!synth) return;
    // Voices load asynchronously and the first getVoices() is often empty.
    const pick = () => {
      const all = synth.getVoices() || [];
      if (!all.length) return;
      const en = all.filter((v) => /^en/i.test(v.lang));
      const pool = en.length ? en : all;
      voice.current = [...pool].sort((a, b) => score(b) - score(a))[0] || null;
      setReady(true);
    };
    pick();
    synth.addEventListener?.("voiceschanged", pick);
    return () => synth.removeEventListener?.("voiceschanged", pick);
  }, [synth]);

  const stop = useCallback(() => {
    if (!synth) return;
    synth.cancel();
    setSpeakingId(null);
  }, [synth]);

  const speak = useCallback((id, markdown) => {
    if (!synth) return;
    // Tapping the same one again stops it; tapping another switches.
    if (speakingId === id) { stop(); return; }
    synth.cancel();
    const text = toSpeech(markdown);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    // Choosing a voice is a preference; being heard is the point. If the
    // assignment throws for any reason, fall back to the browser default
    // rather than losing the utterance entirely.
    try { if (voice.current) u.voice = voice.current; } catch { /* default voice */ }
    u.rate = 0.95;                 // a touch slower; figures need the room
    u.pitch = 1;
    u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
    u.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    synth.speak(u);
  }, [synth, speakingId, stop]);

  // Leaving the page mid-sentence would otherwise keep talking.
  useEffect(() => () => { try { synth?.cancel(); } catch { /* ignore */ } }, [synth]);

  return { supported: !!synth && ready, speakingId, speak, stop };
}
