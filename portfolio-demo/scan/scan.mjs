// Portfolio demo privacy scan: node portfolio-demo/scan/scan.mjs <file> [<file> ...]
//
// Fails (exit 1) if a file contains anything from the real deployment:
//   1. PATTERNS below: the organisation's name and domains, the real backend address and key formats,
//      cloud storage, AI keys, and any e-mail address outside example.org / example.com.
//   2. denylist.json: one-way fingerprints (SHA-256, first 16 hex) of real names: people, places,
//      sites, project titles, SAP project codes, suppliers and real portfolio totals. The names
//      themselves are never stored in the repository: make-denylist.mjs builds this file from a private
//      list kept outside it. The scan normalises the text (lower case, letters and digits only),
//      fingerprints every run of up to N words and compares; short unit codes (cs) are compared
//      with their exact case, as whole words.
// The output gives the position and a masked excerpt, never the matched name, so it is safe to paste.
// Embedded fonts and images (base64 data: links) are skipped: they are generated, not text.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const PATTERNS = [
  ["organisation name", /riphah|iimct/i],
  ["real backend", /supabase\.co|prmxkecomqqngvrmytcj/i],
  ["real site", /pmoriphah|github\.io\/riphah|riphah\.edu/i],
  ["backend key (JWT)", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["cloud storage", /r2\.cloudflarestorage|r2\.dev\b/i],
  ["AI key", /AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{24,}/],
  ["real site code", /\bG-7\b|\bI-14\b/],
  ["real proposal-system name", /\bE-?PDD(?![a-z])/],          // also EPDD_ file names; not the lower-case table names
  ["real portal's own image files", /campus-bg(-mobile)?\.jpg|icon-192\.png|\bemail\/(login|after-signin)/],   // photos / screenshots of the real portal
];
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
// Reserved example domains, plus two open-source licence/maintainer addresses inside a bundled library's
// package metadata (not ours; named exactly so nothing else slips through).
const OK_MAIL = /(^|\.)example\.(org|com)$|(^|\.)example$/i;
const OK_ADDR = new Set(["git@github.com", "fedor@indutny.com"]);

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const fp = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function stripBlobs(t) { return t.replace(/data:[a-z0-9.+\/-]+;base64,[A-Za-z0-9+\/=]+/gi, (m) => " ".repeat(m.length)); }
const mask = (t, a, b) => (t.slice(Math.max(0, a - 40), a) + "█".repeat(Math.min(12, b - a)) + t.slice(b, b + 40)).replace(/\s+/g, " ");

export function scanText(text, deny, approvedImages = null) {
  const hits = [];
  // 3. Embedded images must be ones the demo generated itself (fingerprints listed by the build).
  if (approvedImages) for (const m of text.matchAll(/data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+\/=]+)/gi)) {
    const h = fp(m[2]);
    if (!approvedImages.has(h)) hits.push({ rule: `embedded image not approved (${m[1]}, ${Math.round(m[2].length * 0.75 / 1024)} KB)`, at: m.index, excerpt: `image ${h}` });
  }
  const t = stripBlobs(text);
  for (const [name, re] of PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of t.matchAll(g)) hits.push({ rule: name, at: m.index, excerpt: mask(t, m.index, m.index + m[0].length) });
  }
  for (const m of t.matchAll(EMAIL)) if (!OK_MAIL.test(m[1]) && !OK_ADDR.has(m[0].toLowerCase())) hits.push({ rule: `e-mail address (${m[1]})`, at: m.index, excerpt: mask(t, m.index, m.index + m[0].length) });
  // Fingerprinted phrases: tokens with their offsets.
  const phrases = new Set(deny.ci), firsts = new Set(deny.firsts), maxN = deny.maxN;
  const toks = [];
  for (const m of t.matchAll(/[A-Za-z0-9]+/g)) toks.push({ w: m[0].toLowerCase(), a: m.index, b: m.index + m[0].length, raw: m[0] });
  for (let i = 0; i < toks.length; i++) {
    if (!firsts.has(fp(toks[i].w))) continue;
    let s = toks[i].w;
    for (let n = 1; n <= maxN && i + n - 1 < toks.length; n++) {
      if (n > 1) s += " " + toks[i + n - 1].w;
      if (phrases.has(fp(s))) hits.push({ rule: "real name / figure (fingerprint)", at: toks[i].a, excerpt: mask(t, toks[i].a, toks[i + n - 1].b) });
    }
  }
  const exact = new Set(deny.cs);
  for (const k of toks) if (k.raw.length <= 6 && /^[A-Z0-9]+$/.test(k.raw) && exact.has(fp(k.raw))) hits.push({ rule: "real unit code (fingerprint)", at: k.a, excerpt: mask(t, k.a, k.b) });
  return hits.sort((x, y) => x.at - y.at);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const deny = JSON.parse(readFileSync(new URL("./denylist.json", import.meta.url)));
  console.log(`privacy scan: ${PATTERNS.length} patterns, e-mail domains, ${deny.ci.length} name/figure fingerprints, ${deny.cs.length} unit-code fingerprints`);
  let total = 0;
  for (const f of process.argv.slice(2)) {
    const text = readFileSync(f, "utf8");
    const approved = process.env.DEMO_APPROVED_IMAGES ? new Set(JSON.parse(readFileSync(process.env.DEMO_APPROVED_IMAGES))) : null;
    if (!approved) console.log("  (no approved-image list: embedded images are not checked)");
    const hits = scanText(text, deny, approved);
    total += hits.length;
    console.log(`  ${f.split("/").slice(-2).join("/")}: ${(text.length / 1048576).toFixed(2)} MB, ${hits.length} match${hits.length === 1 ? "" : "es"}`);
    const byRule = {};
    for (const h of hits) (byRule[h.rule] ||= []).push(h);
    for (const [rule, list] of Object.entries(byRule)) {
      console.log(`    ${rule}: ${list.length}`);
      for (const h of list.slice(0, 8)) console.log(`      @${h.at}  …${h.excerpt}…`);
    }
  }
  console.log(total ? `FAIL: ${total} match${total === 1 ? "" : "es"}` : "PASS: nothing from the real deployment found");
  process.exit(total ? 1 : 0);
}
