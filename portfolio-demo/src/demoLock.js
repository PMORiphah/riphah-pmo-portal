// Portfolio demo: where it may run (agreed protection layer 2). The page starts only at its own Vercel
// address (and that project's preview addresses), or locally for testing (localhost, or the file opened
// from disk), and never inside another site's frame. Anywhere else it shows a notice instead.
// Not a secret: someone determined can still read the code; this stops casual re-hosting and framing.
import { OWNER, OWNER_URL, YEAR } from "./demoShell.jsx";

export const HOME = "https://capital-projects-portal-demo.vercel.app/";
const OK_HOST = /^capital-projects-portal-demo(-[a-z0-9-]+)?\.vercel\.app$/;
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", ""]);

export function lockReason() {
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed) return "framed";
  if (location.protocol === "file:" || LOCAL.has(location.hostname) || OK_HOST.test(location.hostname)) return null;
  return "host";
}

export function showLock(reason) {
  document.title = "Capital Projects Portal · Demo";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  document.body.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#0b1726;color:#eef4fb;font:15px/1.6 Inter,'Segoe UI',Arial,sans-serif">
    <div style="max-width:520px">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7fd1c7;font-weight:700">Capital Projects Portal · demo</div>
      <h1 style="font-size:24px;line-height:1.25;margin:8px 0 10px">${reason === "framed" ? "This demo can't be shown inside another page." : "This demo runs only at its own address."}</h1>
      <p style="margin:0 0 16px;color:#c9d6e4">Open it here: <a href="${HOME}" target="_top" rel="noopener" style="color:#7fd1c7;font-weight:600">${esc(HOME.replace(/^https:\/\/|\/$/g, ""))}</a></p>
      <p style="margin:0 0 16px;color:#c9d6e4">Want a portal like this for your organisation? <a href="${OWNER_URL}" target="_blank" rel="noopener noreferrer" style="color:#f3d39b;font-weight:600">Contact ${esc(OWNER)} on Upwork ↗</a></p>
      <p style="margin:0;color:#8aa0b8;font-size:12.5px">© ${YEAR} ${esc(OWNER)}. All rights reserved. Copying, re-hosting or reusing this demo's code, design or content needs the author's written permission. All data in the demo is fictional.</p>
    </div></div>`;
}
