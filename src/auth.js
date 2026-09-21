// ─────────────────────────────────────────────────────────────────────────────
//  SESSION — where it is kept, how it is renewed, how it ends
// ─────────────────────────────────────────────────────────────────────────────
//  Two faults this replaces:
//
//   1. With "Remember me" off (the default) the session lived only in memory,
//      so reloading the page signed you out.
//   2. The refresh token was thrown away at sign-in, so every session died
//      after its one-hour access token, reload or not.
//
//  Now:
//   • The session is always kept in sessionStorage — it survives a reload or a
//     hard refresh, and is gone when the browser closes. "Remember me" also
//     keeps it in localStorage, so it survives closing the browser.
//   • The refresh token is kept, and the access token is renewed quietly five
//     minutes before it runs out. Only when renewal genuinely fails (revoked,
//     password changed, user removed) does the session end.
//   • Renewal changes the token IN PLACE on the session object. Every screen
//     reads session.access_token at the moment it calls the database, so they
//     all pick up the new token without re-rendering — whereas replacing the
//     object would re-run ~40 data loads every hour and could wipe a form
//     someone was halfway through.
//
//  Refresh tokens ROTATE: each one works once, and presenting a spent one makes
//  Supabase assume theft and revoke the whole session. With two tabs open,
//  both holding the same token, the second renewal would sign BOTH out. So:
//   • renewals are serialised across tabs with a Web Lock, and
//   • whichever tab renews broadcasts the new tokens; the others adopt them
//     instead of spending the old one.
// ─────────────────────────────────────────────────────────────────────────────

const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";

const KEY = "pmo_session";
const LOCK = "pmo-session-renew";
export const RENEW_EARLY_S = 300;           // renew five minutes before expiry

const nowS = () => Math.floor(Date.now() / 1000);
const TOKEN_FIELDS = ["access_token", "refresh_token", "expires_at"];
const pick = (s) => Object.fromEntries(TOKEN_FIELDS.map((k) => [k, s[k]]));

// ── storage ──────────────────────────────────────────────────────────────────
export function saveSession(s) {
  const raw = JSON.stringify(s);
  try { sessionStorage.setItem(KEY, raw); } catch { /* private mode */ }
  try {
    if (s.remember) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function loadSession() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.access_token && s?.user_id) return s;
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const isFresh = (s, marginS = 60) =>
  !!s?.expires_at && nowS() < s.expires_at - marginS;

// ── cross-tab ────────────────────────────────────────────────────────────────
// The newest tokens any tab has seen, per user. A tab that is about to renew
// checks this first; if another tab already renewed, it adopts those tokens
// instead of spending its own (now spent) refresh token.
const newest = new Map();                   // user_id -> {access_token, refresh_token, expires_at}
const listeners = new Set();
let channel = null;
try {
  channel = new BroadcastChannel("pmo-session");
  channel.onmessage = (e) => {
    const m = e.data;
    if (!m?.user_id || !m.access_token) return;
    const known = newest.get(m.user_id);
    if (known && known.expires_at >= m.expires_at) return;
    newest.set(m.user_id, pick(m));
    listeners.forEach((fn) => fn(m));
  };
} catch { /* very old browsers: tabs renew independently */ }

function adoptIfNewer(s, t) {
  if (!t || !(t.expires_at > (s.expires_at || 0))) return false;
  Object.assign(s, pick(t));
  saveSession(s);
  return true;
}

/** Adopt tokens another tab renewed. Returns an unsubscribe function. */
export function onRenewedElsewhere(s, cb) {
  const fn = (m) => { if (m.user_id === s.user_id && adoptIfNewer(s, m)) cb(); };
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── renewal ──────────────────────────────────────────────────────────────────
// "ok"    — the session object now carries fresh tokens
// "retry" — could not reach Supabase; try again shortly
// "dead"  — the refresh token was refused; the session is over
export async function renewSession(s) {
  if (!s?.refresh_token) return "dead";

  const run = async () => {
    // Another tab may have renewed while we waited for the lock.
    if (adoptIfNewer(s, newest.get(s.user_id)) && isFresh(s, RENEW_EARLY_S)) return "ok";
    try {
      const stored = loadSession();
      if (stored?.user_id === s.user_id && adoptIfNewer(s, stored) && isFresh(s, RENEW_EARLY_S)) return "ok";
    } catch { /* ignore */ }

    let res, body;
    try {
      res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        cache: "no-store",
        headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      body = await res.json().catch(() => ({}));
    } catch {
      return "retry";
    }
    if (!res.ok || !body.access_token) {
      // 400/401/403: refused for good. 429 and 5xx: worth another try.
      return [400, 401, 403].includes(res.status) ? "dead" : "retry";
    }
    Object.assign(s, {
      access_token: body.access_token,
      refresh_token: body.refresh_token || s.refresh_token,
      expires_at: body.expires_at || nowS() + (body.expires_in || 3600),
    });
    saveSession(s);
    newest.set(s.user_id, pick(s));
    try { channel?.postMessage({ user_id: s.user_id, ...pick(s) }); } catch { /* ignore */ }
    return "ok";
  };

  try {
    if (navigator.locks?.request) return await navigator.locks.request(LOCK, run);
  } catch { /* fall through */ }
  return run();
}

// ── sign-out ─────────────────────────────────────────────────────────────────
// Revokes this session's refresh tokens on the server, so a copied token is
// useless from the moment someone signs out. scope=local: only THIS session —
// the default ("global") would also sign the same account out on every other
// device, and the PMO account is used from more than one.
export async function revokeSession(s) {
  if (!s?.access_token) return;
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      cache: "no-store",
      headers: { apikey: SUPA_KEY, Authorization: "Bearer " + s.access_token },
    });
  } catch { /* signing out locally still happens */ }
}
