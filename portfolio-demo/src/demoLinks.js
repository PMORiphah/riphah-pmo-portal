// Portfolio demo: links that would leave the demo (WhatsApp nudges, e-mail and phone links, other
// sites) say what they would do instead of opening. The author's own page (Upwork) opens normally.
import { OWNER_URL } from "./demoShell.jsx";

const WHAT = [
  [/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i, "In your deployment this opens WhatsApp with a ready-written reminder to the manager."],
  [/^mailto:/i, "In your deployment this opens an e-mail to that person."],
  [/^tel:/i, "In your deployment this calls that number."],
  [/^sms:/i, "In your deployment this opens a text message."],
];
const allowed = (u) => {
  try {
    const x = new URL(u, location.href);
    return x.origin === location.origin || x.protocol === "blob:" || x.protocol === "data:" || x.href.startsWith(OWNER_URL);
  } catch { return false; }
};
const noteFor = (u) => (WHAT.find(([re]) => re.test(u)) || [null, "In your deployment this opens a page outside the portal. The demo stays self-contained."])[1];

export function guardLinks(notify) {
  const realOpen = window.open;
  window.open = function (url, ...rest) {
    if (url == null || url === "" || allowed(String(url))) return realOpen.call(window, url, ...rest);
    notify(noteFor(String(url)));
    return null;
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || allowed(a.href)) return;
    e.preventDefault(); e.stopPropagation();
    notify(noteFor(a.href));
  }, true);
}
