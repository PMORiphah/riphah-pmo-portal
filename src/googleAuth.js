// ─────────────────────────────────────────────────────────────────────────────
//  SIGN IN WITH GOOGLE (PMO, 17 Nov 2026) — Riphah accounts on the PMO's list
// ─────────────────────────────────────────────────────────────────────────────
//  OAuth with PKCE against Supabase Auth, no SDK (the portal talks to Supabase
//  over plain fetch, see auth.js):
//   1. startGoogleSignIn(): a random verifier is kept in sessionStorage, its
//      SHA-256 goes to /auth/v1/authorize, Google shows the account picker
//      (hd=riphah.edu.pk only steers the picker; it is not the check).
//   2. Supabase sends the browser back to the portal with ?code=… (or ?error=…).
//   3. finishGoogleSignIn() swaps the code + verifier for a session.
//  Who may get in is decided by the database, not here: handle_new_user refuses
//  a new account that is not a listed @riphah.edu.pk address, and the portal
//  then asks google_access() whether an existing account that signed in with
//  Google is on the list; if not, that session is ended at once. Passwords keep
//  working for everyone.
// ─────────────────────────────────────────────────────────────────────────────

const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";
const KEY = "pmo_google_pkce";
const ERR_KEY = "pmo_google_error";

// Shown on /preview/ only until the PMO has tried it (sign-in changes go to /preview/ first).
export const GOOGLE_SIGNIN = /\/preview\/$/.test(import.meta.env.BASE_URL || "");

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function startGoogleSignIn(remember) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(KEY, JSON.stringify({ verifier, remember: !!remember, at: Date.now() })); } catch { /* private mode */ }
  const back = window.location.origin + (import.meta.env.BASE_URL || "/");
  const q = new URLSearchParams({
    provider: "google", redirect_to: back,
    code_challenge: challenge, code_challenge_method: "s256",
    hd: "riphah.edu.pk", prompt: "select_account",
  });
  window.location.assign(`${SUPA_URL}/auth/v1/authorize?${q}`);
}

/** The portal was opened by Google's return trip (?code=… or an OAuth ?error=…). */
export const isGoogleReturn = (search = window.location.search) => {
  const p = new URLSearchParams(search);
  let pending = false;
  try { pending = !!sessionStorage.getItem(KEY); } catch { /* private mode */ }
  if (p.get("code")) return pending || GOOGLE_SIGNIN;
  return !!p.get("error") && pending;
};

export const takeGoogleError = () => {
  try { const m = sessionStorage.getItem(ERR_KEY); sessionStorage.removeItem(ERR_KEY); return m; } catch { return null; }
};
const failWith = (msg) => { try { sessionStorage.setItem(ERR_KEY, msg); } catch { /* ignore */ } return null; };

const NOT_ALLOWED = "This Google account can't sign in to the PMO portal. Only Riphah (riphah.edu.pk) accounts on the PMO's list can. If you should have access, ask the PMO to add you, or sign in with your username and password.";

/** Exchanges the code for a session. Returns a portal session object, or null (the reason is kept for the sign-in page). */
export async function finishGoogleSignIn() {
  const p = new URLSearchParams(window.location.search);
  const code = p.get("code"), error = p.get("error"), desc = p.get("error_description") || "";
  window.history.replaceState({}, "", window.location.pathname);
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  if (error) {
    if (/access_denied/i.test(error) && !/database|saving/i.test(desc)) return failWith("Google sign-in was cancelled.");
    return failWith(NOT_ALLOWED);
  }
  if (!code || !saved?.verifier) return failWith("Google sign-in could not be completed on this page. Please try again.");

  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST", headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: saved.verifier }),
  }).catch(() => null);
  const auth = res && await res.json().catch(() => null);
  if (!res?.ok || !auth?.access_token) return failWith("Google sign-in could not be completed. Please try again.");

  const H = { apikey: SUPA_KEY, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" };
  const access = await fetch(`${SUPA_URL}/rest/v1/rpc/google_access`, { method: "POST", headers: H, body: "{}" })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (!access?.listed || !access?.active) {
    // An existing account that is not on the list (or switched off): end this Google session straight away.
    await fetch(`${SUPA_URL}/auth/v1/logout?scope=local`, { method: "POST", headers: H }).catch(() => null);
    return failWith(access && !access.active
      ? "Your portal account is switched off. Please contact the PMO."
      : NOT_ALLOWED);
  }
  const prof = await fetch(`${SUPA_URL}/rest/v1/user_profiles?select=username,full_name,role&id=eq.${auth.user.id}`, { headers: H })
    .then(r => r.ok ? r.json() : []).catch(() => []);
  const profile = prof?.[0] || {};
  return {
    access_token: auth.access_token,
    user_id: auth.user.id,
    username: profile.username || auth.user.email,
    full_name: profile.full_name || auth.user.user_metadata?.full_name || auth.user.email,
    role: profile.role || "guest",
    expires_at: auth.expires_at || Math.floor(Date.now() / 1000) + (auth.expires_in || 3600),
    refresh_token: auth.refresh_token,
    remember: !!saved.remember,
    via: "google",
  };
}
