import { existsSync, readFileSync } from "node:fs";
// Portfolio demo build settings. Run through build.mjs (which also inlines everything and runs the scan).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { rewrite } from "./brand.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

// Applies brand.mjs to every file of the real portal (src/) as it is bundled.
const whiteLabel = {
  name: "demo-white-label",
  enforce: "pre",
  transform(code, id) {
    const file = id.split("?")[0];
    // The portal's own files (src/, and shared code it imports from supabase/functions/), not libraries.
    if (!file.startsWith(REPO) || file.includes("/node_modules/") || file.startsWith(REPO + "portfolio-demo/") || !/\.(jsx?|tsx?|css)$/.test(file)) return null;
    const out = rewrite(code);
    return out === code ? null : { code: out, map: null };
  },
};

const keyFile = new URL("./.posthog-key", import.meta.url);
// DEMO_NO_ANALYTICS=1 builds without a key (the offline test copy) even when .posthog-key exists.
const POSTHOG_KEY = process.env.DEMO_NO_ANALYTICS ? "" : (process.env.DEMO_POSTHOG_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "")).trim();
if (POSTHOG_KEY && !/^phc_[A-Za-z0-9]{20,64}$/.test(POSTHOG_KEY)) throw new Error("DEMO_POSTHOG_KEY must be a PostHog project key (phc_…); personal keys are refused");

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [whiteLabel, react()],
  // The analytics project key (PostHog, public by design) comes from the build, never from the repository:
  // DEMO_POSTHOG_KEY, or the git-ignored file .posthog-key. Without one the demo counts nothing.
  define: { "import.meta.env.BASE_URL": JSON.stringify("./"), __POSTHOG_KEY__: JSON.stringify(POSTHOG_KEY) },
  build: {
    outDir: "dist-raw",
    emptyOutDir: true,
    sourcemap: false,                       // no source maps: the original code can't be rebuilt from the file
    minify: "esbuild",
    target: "es2022",
    assetsInlineLimit: 100_000_000,         // every font and image becomes part of the one file
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  esbuild: { legalComments: "none" },
});
