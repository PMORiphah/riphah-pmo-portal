// Portfolio demo tests: Playwright with two additions for every test.
//  1. Every request any page makes is logged to tests/out/requests.log (test, method, address), the
//     proof that the demo talks to nothing but itself and the analytics endpoint.
//  2. Any Content-Security-Policy violation becomes a console error, so each test's "no errors" check
//     also fails on a blocked request or script.
// Uses the pre-installed Chromium (PW_CHROMIUM overrides the path).
import { createRequire } from "node:module";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";

// Loaded with require: the environment's Playwright is found through NODE_PATH, which ESM imports ignore.
const real = createRequire(import.meta.url)("playwright").chromium;
const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const test = basename(process.argv[1] || "test", ".mjs");
const log = (line) => appendFileSync(new URL("requests.log", OUT), line + "\n");
const CSP_HOOK = () => document.addEventListener("securitypolicyviolation", (e) => {
  const el = e.target && e.target.outerHTML ? e.target.outerHTML.slice(0, 160) : "";
  const where = document.querySelector("[data-tour-card] h3")?.textContent || document.title;
  console.error(`CSP violation: ${e.violatedDirective} ${String(e.blockedURI).slice(0, 120)} ${el} at ${e.sourceFile || "?"}:${e.lineNumber}:${e.columnNumber} during "${where}" sample: ${String(e.sample || "").slice(0, 80)}`);
});

export const chromium = {
  async launch(opts = {}) {
    const b = await real.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", ...opts });
    const newContext = b.newContext.bind(b);
    b.newContext = async (o) => {
      const ctx = await newContext(o);
      await ctx.addInitScript(CSP_HOOK);
      ctx.on("request", (r) => { const u = r.url(); log(`${test}\t${r.method()}\t${u.startsWith("data:") ? u.slice(0, 30) + "…" : u.slice(0, 160)}`); });
      return ctx;
    };
    return b;
  },
};
