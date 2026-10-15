#!/usr/bin/env node
// Writes <outDir>/simulation.html from the page Vite just built (<outDir>/index.html).
//
//   node scripts/sim/make-sim-html.mjs dist            (production build)
//   node scripts/sim/make-sim-html.mjs dist-preview    (preview build)
//
// build.sh runs it after every build, so the simulation always loads the same bundle as the portal.
// The page differs from index.html only in what it lets the browser do:
//   - the Content-Security-Policy meta is the FIRST element in <head> (the page talks only to itself);
//     its text is read from sim-boot.js, so the policy and the boot script's self-test never disagree;
//   - no referrer, no indexing, its own title;
//   - sim-boot.js (classic) runs first; the app's module script is not in the page at all: the boot
//     script writes it in only after every isolation check has passed (its URL is in a meta);
//   - no web manifest and no apple-touch / home-screen tags (no "Install" that opens the real portal);
//   - no Google Fonts: the self-hosted copy in sim/fonts/ instead; the favicon stays.
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) { console.error("usage: make-sim-html.mjs <outDir>"); process.exit(2); }
const indexPath = path.join(outDir, "index.html");
const bootPath = path.join(outDir, "sim-boot.js");
const fail = (msg) => { console.error(`make-sim-html: ${msg}`); process.exit(1); };
if (!fs.existsSync(indexPath)) fail(`${indexPath} not found (run the Vite build first)`);
if (!fs.existsSync(bootPath)) fail(`${bootPath} not found (public/sim-boot.js is copied by the build)`);
if (!fs.existsSync(path.join(outDir, "sim", "fonts", "fonts.css"))) fail("sim/fonts/fonts.css not found in the build output");

const boot = fs.readFileSync(bootPath, "utf8");
const cspMatch = /var CSP = "([^"]+)"; \/\/ @sim-csp/.exec(boot);
if (!cspMatch) fail("could not read the CSP from sim-boot.js (the line marked // @sim-csp)");
const CSP = cspMatch[1];
for (const must of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "form-action 'none'"]) {
  if (!CSP.includes(must)) fail(`the CSP lacks ${must}`);
}
if (/https?:|\*|'unsafe-eval'/.test(CSP)) fail("the CSP must not allow other hosts, wildcards or eval");

let html = fs.readFileSync(indexPath, "utf8");

// The app's entry module (exactly one).
const modules = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*><\/script>\s*/g)];
if (modules.length !== 1) fail(`expected one module script in index.html, found ${modules.length}`);
const entry = /\bsrc="([^"]+)"/.exec(modules[0][0])?.[1];
if (!entry || !/^\/[A-Za-z0-9_/.-]+\.js$/.test(entry) || !/\/assets\//.test(entry)) fail(`unexpected entry script: ${entry}`);
if (/<script(?![^>]*\btype="module")/i.test(html.replace(modules[0][0], ""))) fail("index.html has another script; review make-sim-html");

html = html
  .replace(modules[0][0], "")
  .replace(/<!--[\s\S]*?-->\s*/g, "")
  .replace(/<meta\s+charset="[^"]*"\s*\/?>\s*/i, "")
  .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
  .replace(/<link\b[^>]*\brel="manifest"[^>]*>\s*/gi, "")
  .replace(/<link\b[^>]*\brel="apple-touch-icon[^"]*"[^>]*>\s*/gi, "")
  .replace(/<meta\b[^>]*\bname="(?:apple-mobile-web-app-[^"]*|mobile-web-app-capable)"[^>]*>\s*/gi, "")
  .replace(/<link\b[^>]*\brel="(?:preconnect|dns-prefetch)"[^>]*>\s*/gi, "")
  .replace(/<link\b[^>]*\bhref="https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\s*/gi, "");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const top = [
  `<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">`,
  `<meta charset="UTF-8">`,
  `<meta name="referrer" content="no-referrer">`,
  `<meta name="robots" content="noindex, nofollow">`,
  `<meta name="pmo-sim-entry" content="${esc(entry)}">`,
  `<title>PMO Portal Simulation · real names, fictional projects</title>`,
  `<script src="./sim-boot.js"></script>`,
  `<link rel="stylesheet" href="./sim/fonts/fonts.css">`,
].join("\n    ");

if (!/<head>/i.test(html)) fail("index.html has no <head>");
html = html.replace(/<head>\s*/i, `<head>\n    ${top}\n    `);
html = html.replace(/<html\b([^>]*)>/i, (m, attrs) => (/data-pmo-sim/.test(attrs) ? m : `<html${attrs} data-pmo-sim="1">`));
// Shown only if nothing else can run (sim-boot.js missing or blocked); React replaces it.
html = html.replace(/<div id="root"><\/div>/,
  `<div id="root"><div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#0A1A2E;color:rgba(255,255,255,.78);font:15px/1.6 Inter,'Segoe UI',Arial,sans-serif;text-align:center">PMO Portal Simulation. If this stays on screen, close the tab and press Simulation in the PMO portal again.</div></div>`);

// Checks on the result: what the boot script's self-test relies on, and what must never be there.
const headInner = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] || "";
if (!headInner.trimStart().startsWith("<meta http-equiv=\"Content-Security-Policy\"")) fail("the CSP meta is not the first element in <head>");
if (html.indexOf('<meta charset="UTF-8">') > 1000) fail("the charset meta is not within the first 1024 bytes");
if (/fonts\.(googleapis|gstatic)\.com|rel="manifest"|apple-touch|apple-mobile-web-app/i.test(html)) fail("left-over manifest, apple or Google Fonts tags");
if (/<script\b[^>]*type="module"/i.test(html)) fail("the module script must not be in simulation.html");
if ((html.match(/<script\b/gi) || []).length !== 1) fail("simulation.html must contain exactly one script (sim-boot.js)");

fs.writeFileSync(path.join(outDir, "simulation.html"), html);
console.log(`make-sim-html: ${path.join(outDir, "simulation.html")} (entry ${entry})`);
