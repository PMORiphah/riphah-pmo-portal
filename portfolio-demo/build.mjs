// Portfolio demo build: node portfolio-demo/build.mjs
//   1. regenerates the fictional data (data/gen.mjs) if it is missing,
//   2. packs the generated documents and photos (data/assets) into data/media.json, after scanning
//      the text inside every PDF and spreadsheet,
//   3. bundles the demo with Vite (vite.config.mjs: white-label rewrite, minified, no source maps),
//   4. inlines the script and styles into ONE file, dist/index.html,
//   5. runs the privacy scan on that file; any match deletes the output and fails the build.
import { build } from "vite";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unusedRules, DEMO_LOGO, DEMO_CREST } from "./brand.mjs";
import { createHash } from "node:crypto";
import { scanText } from "./scan/scan.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = HERE + "dist-raw/", OUT = HERE + "dist/";

if (!existsSync(HERE + "data/seed.json")) execFileSync("node", ["gen.mjs"], { cwd: HERE + "data", stdio: "inherit" });

// The generated files the pages open (Documents, Site Visit, Gallery). Their text is scanned here,
// because inside the page they are base64 and the scan of index.html cannot read them.
const sha = (b64) => createHash("sha256").update(b64).digest("hex").slice(0, 16);
const deny = JSON.parse(readFileSync(HERE + "scan/denylist.json", "utf8"));
const manifest = JSON.parse(readFileSync(HERE + "data/assets-manifest.json", "utf8"));
const media = {}, photoHashes = [];
let mediaBad = 0;
for (const a of manifest) {
  const file = HERE + "data/assets/" + a.file_path;
  if (!existsSync(file)) throw new Error(`missing generated file ${a.file_path}: run node data/assets.mjs`);
  const buf = readFileSync(file), b64 = buf.toString("base64");
  let text = a.file_name + "\n";
  if (a.mime_type === "application/pdf") text += execFileSync("pdftotext", ["-q", file, "-"], { encoding: "utf8" });
  else if (/spreadsheet/.test(a.mime_type)) text += execFileSync("unzip", ["-p", file, "xl/sharedStrings.xml", "xl/worksheets/*.xml"], { encoding: "utf8" }).replace(/<[^>]+>/g, " ");
  else if (/^image\//.test(a.mime_type)) photoHashes.push(sha(b64));
  else throw new Error(`unexpected file type ${a.mime_type}`);
  const hits = scanText(text, deny);
  if (hits.length) { mediaBad += hits.length; console.error(`  ${a.file_name}: ${hits.map(h => h.rule).join(", ")}`); }
  media["project-attachments/" + a.file_path] = `data:${a.mime_type};base64,${b64}`;
}
if (mediaBad) { console.error(`PRIVACY SCAN FAILED in the generated files (${mediaBad} matches)`); process.exit(1); }
writeFileSync(HERE + "data/media.json", JSON.stringify(media));
console.log(`media: ${manifest.length} files, ${(Object.values(media).join("").length / 1048576).toFixed(2)} MB as text`);

await build({ configFile: HERE + "vite.config.mjs", logLevel: "warn" });

let html = readFileSync(RAW + "index.html", "utf8");
const files = readdirSync(RAW + "assets");
const js = files.filter(f => f.endsWith(".js")), css = files.filter(f => f.endsWith(".css"));
if (js.length !== 1) throw new Error(`expected one script, got ${js.length}: ${js.join(", ")}`);
const safeScript = (s) => s.replace(/<\/script/gi, "<\\/script");
html = html
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, "")
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, "")
  // Function replacements: a string replacement would treat "$&" or "$`" inside the code as patterns.
  .replace("</head>", () => css.map(f => `<style>${readFileSync(RAW + "assets/" + f, "utf8")}</style>`).join("") + "</head>")
  .replace("</body>", () => `<script type="module">${safeScript(readFileSync(RAW + "assets/" + js[0], "utf8"))}</script></body>`);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error("a file was left outside index.html");
// Fonts (SIL Open Font License, self-hosted copies) go into the page once.
const fontCss = readFileSync(HERE + "src/fonts.css", "utf8").replace(/url\(\.\/fonts\/\.?\/?([a-z0-9-]+\.woff2)\)/g,
  (_, f) => `url(data:font/woff2;base64,${readFileSync(HERE + "src/fonts/" + f).toString("base64")})`);
html = html.replace("<head>", () => `<head><style>${fontCss}</style>`);

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "index.html", html);
rmSync(RAW, { recursive: true, force: true });
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`dist/index.html  ${mb} MB`);
const idle = unusedRules();
if (idle.length) console.log(`brand rules that matched nothing: ${idle.join(", ")}`);

// The only images allowed in the file: the demo's own generated marks and the generated placeholder photos. The scan fails on any other embedded image, such as a real logo or photo.
const approved = [...[DEMO_LOGO, DEMO_CREST].map(u => sha(u.split(",")[1])), ...photoHashes];
writeFileSync(HERE + "scan/.approved-images.json", JSON.stringify(approved));
try {
  execFileSync("node", [HERE + "scan/scan.mjs", OUT + "index.html"], { stdio: "inherit", env: { ...process.env, DEMO_APPROVED_IMAGES: HERE + "scan/.approved-images.json" } });
} catch {
  if (process.env.DEMO_KEEP_FAILED) writeFileSync(process.env.DEMO_KEEP_FAILED, html);   // private inspection copy (outside the repo)
  rmSync(OUT + "index.html", { force: true });
  console.error("PRIVACY SCAN FAILED: dist/index.html was deleted. Fix the matches above and build again.");
  process.exit(1);
}
