// PMO Simulation privacy scan: fails if a real name appears in a file that ships or is committed.
//
//   node scripts/sim/privacy-scan.mjs <names-file> [<names-file> ...] [--paths a,b,c] [--exclude a,b] [--campuses]
//                                     [--sim-only] [--history]
//
// Names files are PRIVATE (scratch only, never in the repo) and may be either
//   { "names": ["...", ...] }                      real project / person names, matched as whole phrases
//   { "campuses": {...}, "pms": {...}, "team": {...} }   a cast: PM full and short names and team names;
//                                                   campus names too with --campuses (sim paths only)
// Matching is case-insensitive, on whole words/phrases. Text files are read as UTF-8, PDFs as raw
// bytes (the generator writes uncompressed text), .xlsx/.docx by unzipping their XML; images and video
// are skipped. Default paths: src/sim, public/sim, public/sim-boot.js, simulation.source.html,
// scripts/sim, docs, CLAUDE.md, and dist-preview if present. The scan prints file:line and the
// matched name's index (never the name itself), so its output is safe to paste.
//
// Since 15 Oct 2026 (security review): the default paths cover all of src and public, the deployed
// preview/ folder and the simulation's portal-side files (src/SimLauncher.jsx, src/simBridge.js);
// --sim-only limits the scan to the simulation's own paths. Images are read as raw bytes too (their
// metadata can hold a name). Email addresses (other than *.example) and phone numbers are reported
// as hits of their own (printed as their domain, or "phone", never the value). --history also scans
// every commit's patch and message in the git history.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createRequire } from "node:module";
const REPO = new URL("../../", import.meta.url).pathname;
const require = createRequire(REPO + "package.json");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valueOf = (f) => args.includes(f) ? args[args.indexOf(f) + 1] : null;
const pathsArg = valueOf("--paths"), excludeArg = valueOf("--exclude");
const nameFiles = args.filter((a, i) => !a.startsWith("--") && !["--paths", "--exclude"].includes(args[i - 1]));
if (!nameFiles.length) { console.error("usage: privacy-scan.mjs <names-file> [...] [--paths a,b] [--exclude a,b] [--campuses]"); process.exit(2); }

const SIM_PATHS = ["src/sim", "public/sim", "public/sim-boot.js", "simulation.source.html", "simulation.html", "scripts/sim",
  "src/SimLauncher.jsx", "src/simBridge.js", "src/storageUrl.js"];
const DEFAULT_PATHS = flag("--sim-only") ? SIM_PATHS : [...SIM_PATHS, "src", "public", "scripts", "docs", "CLAUDE.md", "dist-preview", "preview"];
const excluded = (excludeArg || "").split(",").map((p) => p.trim()).filter(Boolean);
const roots = (pathsArg ? pathsArg.split(",") : DEFAULT_PATHS).map((p) => p.trim()).filter(Boolean).filter((p) => !excluded.includes(p) && existsSync(join(REPO, p)));

// Build the name lists. Very short or generic tokens (< 3 letters) are skipped to avoid noise.
const names = [], campusNames = [];
for (const f of nameFiles) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (Array.isArray(j.names)) names.push(...j.names);
  if (j.pms) for (const p of Object.values(j.pms)) { names.push(p.name); if (p.short) names.push(p.short); }
  if (j.team) for (const t of Object.values(j.team)) names.push(typeof t === "object" ? t.name : t);
  if (j.campuses && flag("--campuses")) for (const c of Object.values(j.campuses)) { campusNames.push(c.name); if (c.epdd) campusNames.push(c.epdd); }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const list = (arr) => [...new Set(arr.map(norm).filter((s) => s.replace(/[^A-Za-z]/g, "").length >= 3))].sort((a, b) => b.length - a.length);
const N = list(names), C = list(campusNames);
const reOf = (arr) => arr.length ? new RegExp(`(?<![A-Za-z0-9])(${arr.map((s) => esc(s).replace(/ /g, "\\s+")).join("|")})(?![A-Za-z0-9])`, "gi") : null;
const nameRe = reOf(N), campusRe = reOf(C);

// Emails other than the invented *.example ones, and phone numbers (Pakistani forms, and any other
// international number; the invented +00 prefix is allowed).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const EMAIL_OK = /(^|\.)example(\.(com|org|net))?$|^anthropic\.com$|^users\.noreply\.github\.com$/i;
const PHONE_RE = /(?<![\w+])(?:\+92|0092)[\s-]?\d{2,3}[\s-]?\d{3}[\s-]?\d{4}(?!\d)|(?<![\w.,-])03\d{2}[\s-]?\d{7}(?![\d,])|(?<![\w+])\+(?!00)[1-9]\d{0,2}[\s-]\d{2,4}[\s-]\d{3,4}[\s-]?\d{3,4}(?!\d)/g;

// An image's metadata only (EXIF, XMP, comments, PNG text chunks): its pixel data would match short
// names by chance.
function imageMeta(buf, ext) {
  const out = [];
  if ((ext === ".jpg" || ext === ".jpeg") && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= buf.length && buf[i] === 0xff) {
      const mk = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (mk === 0xda) break;                                   // start of the picture data
      if ((mk >= 0xe0 && mk <= 0xef) || mk === 0xfe) out.push(buf.subarray(i + 4, i + 2 + len).toString("latin1"));
      i += 2 + len;
    }
  } else if (ext === ".png" && buf.readUInt32BE(0) === 0x89504e47) {
    const { inflateSync } = require("node:zlib");
    let i = 8;
    while (i + 12 <= buf.length) {
      const len = buf.readUInt32BE(i), type = buf.subarray(i + 4, i + 8).toString("latin1"), data = buf.subarray(i + 8, i + 8 + len);
      if (type === "tEXt" || type === "iTXt" || type === "eXIf") out.push(data.toString("latin1"));
      if (type === "zTXt") { try { const z = data.indexOf(0); out.push(data.subarray(0, z).toString("latin1") + " " + inflateSync(data.subarray(z + 2)).toString("latin1")); } catch { /* unreadable */ } }
      if (type === "IEND") break;
      i += 12 + len;
    }
  }
  return out.join("\n");
}

const SKIP_EXT = new Set([".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf"]);
const RAW_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".ico", ".pdf"]);
async function textsOf(file) {
  const ext = extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
  if (RAW_EXT.has(ext) && ext !== ".pdf") return [[file, imageMeta(readFileSync(file), ext)]];
  const buf = readFileSync(file);
  if (ext === ".xlsx" || ext === ".docx") {
    const JSZip = require("jszip"); const z = await JSZip.loadAsync(buf); const out = [];
    for (const n of Object.keys(z.files)) if (/\.xml$/.test(n)) out.push([`${file}!${n}`, (await z.files[n].async("string")).replace(/<[^>]+>/g, " ")]);
    return out;
  }
  return [[file, ext === ".pdf" ? buf.toString("latin1") : buf.toString("utf8")]];
}
const walk = (p) => { const full = join(REPO, p); const st = statSync(full); if (st.isFile()) return [full];
  return readdirSync(full).flatMap((n) => n === "node_modules" || n === ".git" || n === "private" ? [] : walk(join(p, n))); };

let hits = 0, files = 0;
const seen = new Set();
const isSimFile = (rel) => SIM_PATHS.some((s) => rel === s || rel.startsWith(s + "/")) || rel.startsWith("dist-preview/sim")
  || /^dist-preview\/(simulation\.html|sim-boot\.js)$/.test(rel) || /^preview\/(sim\/|simulation\.html|sim-boot\.js)/.test(rel)
  // The simulation's own built chunks (campus names are checked there too).
  || /^(dist-preview|preview)\/assets\/(SimRoot|SimLauncher|backend|validate|build|simBridge|handoff|scenes|select|snapshot)-[\w-]+\.js$/.test(rel);
function scanText(where, text, sim, raw) {
  for (const [re, kind, arr] of [[nameRe, "name", N], [sim ? campusRe : null, "campus", C]]) {
    if (!re) continue;
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      const idx = arr.findIndex((s) => new RegExp(`^${esc(s).replace(/ /g, "\\s+")}$`, "i").test(m[1]));
      console.log(`HIT ${where}:${line}  ${kind} #${idx}`);
      hits++;
    }
  }
  if (raw) return;                       // binary bytes: names only (emails/phones would be noise)
  if (/(^|\/)(exceljs|xlsx|jszip)[.-][^/]*$/.test(where)) return;   // third-party libraries: their authors' addresses
  EMAIL_RE.lastIndex = 0; let e;
  while ((e = EMAIL_RE.exec(text))) {
    if (EMAIL_OK.test(e[1]) || /\.(png|jpe?g|svg|webp|js|css)$/i.test(e[1])) continue;
    console.log(`HIT ${where}:${text.slice(0, e.index).split("\n").length}  email (${e[1].toLowerCase()})`);
    hits++;
  }
  PHONE_RE.lastIndex = 0; let ph;
  while ((ph = PHONE_RE.exec(text))) {
    if (/1234567$/.test(ph[0].replace(/\D/g, ""))) continue;     // a format example (+92 300 1234567), not a number
    console.log(`HIT ${where}:${text.slice(0, ph.index).split("\n").length}  phone`);
    hits++;
  }
}
for (const root of roots) {
  for (const f of walk(root)) {
    const rel = relative(REPO, f);
    if (seen.has(rel)) continue;
    seen.add(rel);
    const raw = RAW_EXT.has(extname(f).toLowerCase()) && extname(f).toLowerCase() !== ".pdf";
    for (const [label, text] of await textsOf(f)) {
      files++;
      scanText(relative(REPO, label), text, isSimFile(rel), raw);
    }
  }
}
if (flag("--history")) {
  // Every commit's message and patch (all branches), names and emails only; campus names are
  // checked only in the simulation's own paths, which a patch does not separate, so not here.
  const { spawnSync } = await import("node:child_process");
  const log = spawnSync("git", ["-C", REPO, "log", "--all", "-p", "--no-color", "--format=@@COMMIT %h%n%B"], { maxBuffer: 1 << 30, encoding: "utf8" });
  if (log.status !== 0) { console.error("git log failed"); process.exit(2); }
  const parts = log.stdout.split(/^@@COMMIT /m).filter(Boolean);
  for (const part of parts) { files++; scanText(`commit ${part.slice(0, part.indexOf("\n"))}`, part, false, false); }
}
console.log(`${hits ? "FAIL" : "PASS"}: ${hits} hit(s) in ${files} file(s) under ${roots.join(", ")} (${N.length} names${C.length ? `, ${C.length} campus names in sim paths` : ""})`);
process.exit(hits ? 1 : 0);
