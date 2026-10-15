import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// simulation.html (written by scripts/sim/make-sim-html.mjs) loads this same bundle. There, the
// portal itself never starts: the simulation does, and only when public/sim-boot.js has run and
// passed its isolation checks (window.__PMO_SIM__.ok). Without that, the page stays locked.
const SIM_PAGE = document.documentElement.hasAttribute('data-pmo-sim')
  || /\/simulation(\.html)?$/.test(window.location.pathname);

function simLocked() {
  const root = document.getElementById('root');
  if (!root) return;
  root.textContent = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;'
    + "background:#0A1A2E;color:rgba(255,255,255,.85);font:15px/1.6 Inter,'Segoe UI',Arial,sans-serif;text-align:center";
  box.textContent = 'The simulation is locked. Open it from the PMO portal: sign in as PMO and press Simulation in the sidebar.';
  root.appendChild(box);
}

if (SIM_PAGE) {
  if (window.__PMO_SIM__ && window.__PMO_SIM__.ok) import('./sim/index.js').then((m) => m.start()).catch(simLocked);
  else simLocked();
} else {
  // Register the network-only service worker (see public/sw.js for why it
  // exists and why it caches nothing). BASE_URL differs between production
  // ("/riphah-pmo-portal/") and preview ("/riphah-pmo-portal/preview/"), so
  // each gets its own worker at its own scope and the two never collide.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
        .catch(() => { /* installability is a bonus; never break the app over it */ });
    });
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
}
