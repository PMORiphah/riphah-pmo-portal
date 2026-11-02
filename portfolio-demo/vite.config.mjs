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

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [whiteLabel, react()],
  define: { "import.meta.env.BASE_URL": JSON.stringify("./") },
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
