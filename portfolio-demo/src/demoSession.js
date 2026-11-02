// Portfolio demo: the signed-in person, for whichever role the visitor picked (PMO admin, project
// manager, senior management). The portal reads its session where src/auth.js looks first
// (sessionStorage); tokens are random strings that only the in-page backend understands.
export const SESSION_KEY = "pmo_session";
export const TTL_S = 8 * 3600;

const rand = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};
const nowS = () => Math.floor(Date.now() / 1000);
let current = null;

/** The person the demo runs as: store.meta.me = { id, username, full_name, role }. */
export function sessionUser(store) {
  const u = store?.meta?.me;
  if (!u || !u.id) throw new Error("Demo: no signed-in person");
  return { id: u.id, username: u.username, full_name: u.full_name, email: null, role: u.role };
}

export function issueTokens() {
  current = { access_token: "demo-access." + rand(), refresh_token: "demo-refresh." + rand(), expires_at: nowS() + TTL_S };
  return { ...current };
}
export const isSimToken = (t) => typeof t === "string" && /^demo-access\.[0-9a-f]+$/.test(t);

export function authUser(store) {
  const u = sessionUser(store);
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: u.username, full_name: u.full_name },
    created_at: "2026-07-01T04:00:00Z", updated_at: "2026-07-01T04:00:00Z",
  };
}

/** Writes the session the portal expects (see App.jsx › Login). */
export function prepareSession(store) {
  const u = sessionUser(store);
  const t = issueTokens();
  const s = { access_token: t.access_token, user_id: u.id, username: u.username, full_name: u.full_name, role: u.role,
    expires_at: t.expires_at, refresh_token: t.refresh_token, remember: false };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  return s;
}
