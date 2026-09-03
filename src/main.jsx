import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

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
