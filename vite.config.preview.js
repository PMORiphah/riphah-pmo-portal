import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Preview build. Identical to vite.config.js except for the base path:
// the preview is served from a subfolder of the same GitHub Pages site, so
// every asset URL has to be prefixed with /preview/ or the bundle 404s.
// Production keeps using vite.config.js and is untouched by this file.
export default defineConfig({
  plugins: [react()],
  base: '/riphah-pmo-portal/preview/',
  build: { outDir: 'dist-preview' },
})
