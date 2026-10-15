// PMO Simulation privacy scan: fails if a real name appears in a file that ships or is committed.
//
//   node scripts/sim/privacy-scan.mjs <names-file> [<names-file> ...] [--paths a,b,c] [--exclude a,b] [--campuses]
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

const SIM_PATHS = ["src/sim", "public/sim", "public/sim-boot.js", "simulation.source.html", "simulation.html", "scripts/sim"];
const DEFAULT_PATHS = [...SIM_PATHS, "docs", "CLAUDE.md", "dist-preview"];
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

const SKIP_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".ico", ".woff", ".woff2", ".ttf", ".otf"]);
async function textsOf(file) {
  const ext = extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
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
for (const root of roots) {
  const isSim = SIM_PATHS.some((s) => root === s || root.startsWith(s + "/")) || root.startsWith("dist-preview");
  for (const f of walk(root)) {
    for (const [label, text] of await textsOf(f)) {
      files++;
      for (const [re, kind, arr] of [[nameRe, "name", N], [isSim ? campusRe : null, "campus", C]]) {
        if (!re) continue;
        re.lastIndex = 0; let m;
        while ((m = re.exec(text))) {
          const line = text.slice(0, m.index).split("\n").length;
          const idx = arr.findIndex((s) => new RegExp(`^${esc(s).replace(/ /g, "\\s+")}$`, "i").test(m[1]));
          console.log(`HIT ${relative(REPO, label)}:${line}  ${kind} #${idx}`);
          hits++;
        }
      }
    }
  }
}
console.log(`${hits ? "FAIL" : "PASS"}: ${hits} hit(s) in ${files} file(s) under ${roots.join(", ")} (${N.length} names${C.length ? `, ${C.length} campus names in sim paths` : ""})`);
process.exit(hits ? 1 : 0);
