// Initials for a person's avatar (PMO, 15 Nov 2026): titles and ranks are not names, so "Mr. Owais Javed" is OJ,
// not MO, and "Engr. Usman Ahmed Umar" is UU (first and last name). A short acronym ("PMO", "IT") stays whole.
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mst", "engr", "eng", "dr", "prof", "professor", "sir", "madam",
  "brig", "brigadier", "col", "colonel", "lt", "ltcol", "maj", "major", "capt", "captain", "gen", "general", "cdr", "sqn", "ldr", "r", "retd"]);

export function nameWords(name) {
  return String(name || "").replace(/\((?:r|retd|retired)\)/gi, " ").split(/[\s.,]+/).filter(Boolean)
    .filter((w) => !TITLES.has(w.toLowerCase().replace(/[^a-z]/g, "")));
}

export function nameInitials(name, fallback = "?") {
  const raw = String(name || "").trim();
  if (!raw) return fallback;
  if (/^project management office$/i.test(raw)) return "PMO";
  const words = nameWords(raw);
  if (!words.length) return raw[0].toUpperCase();
  if (words.length === 1) {
    const w = words[0];
    return w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
