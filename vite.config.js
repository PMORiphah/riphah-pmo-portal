import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/riphah-pmo-portal/',
  build: {
    rollupOptions: {
      output: {
        // Split the big third-party libraries into their own chunks. They
        // change only when a dependency is upgraded, so a normal deploy
        // invalidates just the small app chunk and everything else stays in
        // the browser cache. With one bundle, every deploy re-downloaded the
        // lot — which is what made repeat visits feel slow after each change.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Leave xlsx alone. Assigning it to a manual chunk pulls it back
          // into the eagerly-loaded graph and silently undoes the dynamic
          // import — the bundle looked split but first load was unchanged.
          if (id.includes('xlsx')) return;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory'))
            return 'charts';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
            return 'react';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
})
