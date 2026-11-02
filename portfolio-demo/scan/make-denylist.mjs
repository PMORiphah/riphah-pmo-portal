// Builds scan/denylist.json from a PRIVATE list of real names (never commit that list):
//   node portfolio-demo/scan/make-denylist.mjs /path/outside/the/repo/denylist-private.json
// The private file is { "ci": ["name or phrase", ...], "cs": ["PRH", ...] }:
//   ci = names, phrases, project titles, codes and figures, compared without case or punctuation;
//   cs = short unit codes, compared as exact upper-case whole words.
// Only fingerprints are written. Phrases with fewer than 4 letters/digits are skipped (too generic).
import { readFileSync, writeFileSync } from "node:fs";
import { norm, fp } from "./scan.mjs";

const src = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ci = new Set(), firsts = new Set(); let maxN = 1, skipped = 0;
for (const raw of src.ci || []) {
  const s = norm(raw);
  if (s.replace(/ /g, "").length < 4) { skipped++; continue; }
  const words = s.split(" ");
  ci.add(fp(s)); firsts.add(fp(words[0])); maxN = Math.max(maxN, words.length);
}
const cs = [...new Set((src.cs || []).map(s => fp(String(s).toUpperCase())))];
writeFileSync(new URL("./denylist.json", import.meta.url), JSON.stringify({
  note: "Fingerprints only (SHA-256, first 16 hex). Built by make-denylist.mjs from a private list outside the repo.",
  built: new Date().toISOString().slice(0, 10), maxN: Math.min(maxN, 12), ci: [...ci].sort(), firsts: [...firsts].sort(), cs: cs.sort(),
}));
console.log(`denylist.json: ${ci.size} phrases, ${cs.length} unit codes, longest ${Math.min(maxN, 12)} words, ${skipped} too short skipped`);
