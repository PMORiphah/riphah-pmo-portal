// Portfolio demo: every test, in order.  node portfolio-demo/tests/run.mjs
//   1. builds a copy without analytics (tests/out/plain/) and one with a dummy analytics key for the
//      analytics test (tests/out/keyed/); the privacy scan runs inside each build and fails it on any match;
//   2. runs each suite (the tour from each of the three roles);
//   3. summarises tests/out/requests.log: every address any page asked for.
// Exit code 1 if anything fails. Screenshots and logs go to tests/out/ (not committed).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("./", import.meta.url)), ROOT = fileURLToPath(new URL("../", import.meta.url));
// The suites test a copy without analytics (tests/out/plain/); dist/ (the file that goes online) is not touched.
const OUT = HERE + "out/", DIST = OUT + "plain/index.html", KEYED = OUT + "keyed/index.html";
rmSync(OUT + "requests.log", { force: true }); mkdirSync(OUT + "shots", { recursive: true });
const sh = (args, env = {}) => execFileSync("node", args, { stdio: "inherit", env: { ...process.env, ...env } });

console.log("── build (with the privacy scan) ──");
sh([ROOT + "build.mjs"], { DEMO_OUT: OUT + "plain", DEMO_NO_ANALYTICS: "1" });
sh([ROOT + "build.mjs"], { DEMO_OUT: OUT + "keyed", DEMO_POSTHOG_KEY: "phc_TESTKEYdemo000000000000000000000" });
if (!existsSync(DIST) || !existsSync(KEYED)) { console.error("build failed"); process.exit(1); }

const suites = [
  ["lock", [DIST]], ["roles", [DIST, OUT + "shots"]], ["phone", [DIST, OUT + "shots"]], ["entry", [DIST, OUT + "shots"]],
  ["writes", [DIST]], ["extras", [DIST]], ["totals", [DIST]], ["mine", [DIST, OUT + "shots"]],
  ["tour", [DIST, OUT + "shots", "pmo"]], ["tour", [DIST, OUT + "shots", "project_manager"]], ["tour", [DIST, OUT + "shots", "guest"]],
  ["analytics", [KEYED]],
];
const results = [];
for (const [name, args] of suites) {
  const label = name + (name === "tour" ? ` (from ${args[2]})` : "");
  process.stdout.write(`── ${label} … `);
  const r = spawnSync("node", [HERE + name + ".mjs", ...args], { encoding: "utf8", timeout: 20 * 60 * 1000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = /(\d+) pass, (\d+) fail/.exec(out);
  // roles.mjs prints a line per page instead of a count: any page with errors or outside requests fails it.
  const bad = name === "roles" ? out.split("\n").filter((l) => /errs [1-9]|unhandled [1-9]|CLICK FAIL|outside requests: [1-9]/.test(l)) : [];
  const ok = r.status === 0 && (m ? m[2] === "0" : name === "roles" && bad.length === 0);
  const summary = m ? `${m[1]} pass, ${m[2]} fail` : name === "roles" ? `${out.split("\n").filter((l) => /\| text \d+/.test(l)).length} pages, ${bad.length} with problems` : "no result";
  console.log(ok ? `OK (${summary})` : `FAILED (${summary})`);
  if (!ok) console.log(out.split("\n").filter((l) => /FAIL|Error|errs [1-9]|unhandled [1-9]/.test(l)).slice(0, 12).join("\n"));
  results.push([label, ok, summary]);
}

console.log("── request log (tests/out/requests.log) ──");
const lines = readFileSync(OUT + "requests.log", "utf8").trim().split("\n").map((l) => l.split("\t"));
const byHost = {};
for (const [test, method, url] of lines) {
  let host;
  try { host = url.startsWith("data:") || url.startsWith("blob:") ? url.split(":")[0] + ":" : new URL(url).host; } catch { host = url.slice(0, 40); }
  const k = /^localhost:\d+$/.test(host) ? "localhost (the demo itself)" : host;
  (byHost[k] ||= { n: 0, tests: new Set(), methods: new Set() }).n++; byHost[k].tests.add(test); byHost[k].methods.add(method);
}
for (const [h, v] of Object.entries(byHost).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.n).padStart(6)}  ${h}  [${[...v.methods].join(",")}] from ${[...v.tests].join(", ")}`);
// Allowed: the demo's own address, data:/blob:, PostHog's batch endpoint (analytics test only), the
// Upwork profile opened by a visitor's click (CTA), and the addresses lock.mjs pretends to be (answered
// by the test itself, never fetched).
// (mhjfbmdgcf… and "resources" are Chrome's built-in PDF viewer, loaded when a document opens.)
const allowed = (h, v) => /^localhost|^data:|^blob:/.test(h) || /^mhjfbmdgcfjbbpaeojofohoefgiehjai$|^resources$/.test(h) || (h === "eu.i.posthog.com" && [...v.tests].every((t) => t === "analytics"))
  || h === "www.upwork.com" || ([...v.tests].every((t) => t === "lock"));
const stray = Object.entries(byHost).filter(([h, v]) => !allowed(h, v));
results.push(["request log: nothing but the demo, analytics (in its test) and the visitor's own Upwork click", stray.length === 0, stray.map(([h]) => h).join(", ") || "clean"]);

console.log("\n══ summary ══");
for (const [l, ok, s] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${l}: ${s}`);
const failed = results.filter((r) => !r[1]).length;
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
