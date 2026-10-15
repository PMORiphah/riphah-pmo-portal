// PMO Simulation: the synthetic PMO session.
//
// src/auth.js keeps the signed-in session under "pmo_session" in sessionStorage (and localStorage
// with Remember me). On simulation.html, public/sim-boot.js namespaces both stores ("pmo-sim:"),
// so writing the normal key here never touches the real portal's session, and the real portal's
// session is never read.
//
// The tokens are opaque strings that only the synthetic backend (./backend.js) accepts; they mean
// nothing to Supabase. They expire after TTL_S so the portal's renewal timer stays far below
// setTimeout's limit (2^31 ms, about 24.8 days); a renewal is answered by the backend with new
// synthetic tokens.
//
// No names here: the PMO account in the seed is "Project Management Office" (store.meta.pmo).

export const SESSION_KEY = "pmo_session";
export const TTL_S = 8 * 3600;               // renewal planned 7 h 55 min ahead: about 28.5 million ms

const rand = () => {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
};
const nowS = () => Math.floor(Date.now() / 1000);

let current = null;                           // { access_token, refresh_token, expires_at }

/** The account the simulation runs as (the PMO row of the seed). */
export function sessionUser(store) {
  const u = store?.meta?.pmo || store?.pmo;
  if (!u || !u.id) throw new Error("Simulation seed has no PMO account");
  return { id: u.id, username: u.username || "pmo", full_name: u.full_name || u.username || "PMO",
    email: u.email || null, role: "pmo" };
}

/** New synthetic tokens (also what the backend answers a refresh with). */
export function issueTokens() {
  current = {
    access_token: "sim-access." + rand(),
    refresh_token: "sim-refresh." + rand(),
    expires_at: nowS() + TTL_S,
  };
  return { ...current };
}

/** The tokens most recently issued (null before prepareSession). */
export const currentTokens = () => (current ? { ...current } : null);

/** Whether a bearer token is one this simulation issued (any generation). */
export const isSimToken = (t) => typeof t === "string" && /^sim-access\.[0-9a-f]+$/.test(t);

/** The /auth/v1 user object for the synthetic PMO. */
export function authUser(store) {
  const u = sessionUser(store);
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: u.username, full_name: u.full_name },
    created_at: "2026-07-01T04:00:00Z", updated_at: "2026-07-01T04:00:00Z",
  };
}

/** The session object src/auth.js and App.jsx expect (see Login › handleLogin). */
export function makeSession(store) {
  const u = sessionUser(store);
  const t = issueTokens();
  return {
    access_token: t.access_token,
    user_id: u.id,
    username: u.username,
    full_name: u.full_name,
    role: "pmo",
    expires_at: t.expires_at,
    refresh_token: t.refresh_token,
    remember: false,
  };
}

/**
 * Writes the synthetic PMO session where src/auth.js looks first (sessionStorage), through the
 * storage the boot script has namespaced. Never Remember me: nothing is left in localStorage.
 * Returns the session object. Safe to call again (Restart): it issues fresh tokens.
 */
export function prepareSession(store) {
  const s = makeSession(store);
  const raw = JSON.stringify(s);
  try { sessionStorage.setItem(SESSION_KEY, raw); } catch { /* private mode: App shows sign-in */ }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  return s;
}
