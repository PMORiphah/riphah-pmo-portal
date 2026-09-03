// ─────────────────────────────────────────────────────────────────────────────
//  BIOMETRIC SIGN-IN (client side)
// ─────────────────────────────────────────────────────────────────────────────
//  Thin wrapper over the WebAuthn browser API. All the security-relevant work
//  — challenge generation, signature verification, counter checks — happens in
//  the `webauthn` edge function. Nothing here is trusted by the server.
//
//  The private key is created inside the device's secure enclave and never
//  leaves it. The biometric itself never leaves the device either: iOS/Android
//  only tell the browser "the user verified", they never hand over the face or
//  fingerprint data.
// ─────────────────────────────────────────────────────────────────────────────

const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";
const FN = SUPA_URL + "/functions/v1/webauthn";

// Remembers that this device has a credential, so the login screen knows
// whether to offer the button. Only a hint — the server never trusts it.
export const BIOMETRIC_HINT_KEY = "pmo_biometric_enabled";

// The WebAuthn credential ID created on this device. The account may have
// several (PMO is used from a phone, a laptop and a tablet), so "is it on?"
// has to be answered per device rather than per account — otherwise a laptop
// that never enrolled would claim Face ID was active because the phone had it.
export const BIOMETRIC_CRED_KEY = "pmo_biometric_credential_id";

export function localCredentialId() {
  try { return localStorage.getItem(BIOMETRIC_CRED_KEY); } catch { return null; }
}

const b64urlToBuf = (s) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
};

const bufToB64url = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function callFn(action, payload, bearer) {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPA_KEY,
      Authorization: "Bearer " + (bearer || SUPA_KEY),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

// Is there a usable built-in authenticator (Face ID, Touch ID, Windows Hello,
// Android biometrics)? Returns false on desktops with no enclave, and on any
// browser without WebAuthn — the UI hides itself rather than offering
// something that would fail.
export async function biometricAvailable() {
  try {
    if (!window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false;   // WebAuthn requires HTTPS
    return await window.PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Best-effort friendly name so a user can tell their devices apart later.
export function deviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "This device";
}

// ─── Enrolment ───────────────────────────────────────────────────────────────
// Only callable while already signed in with a password: the access token is
// what proves to the server who is enrolling.
export async function enrolBiometric(accessToken) {
  const { options } = await callFn("register-options", {}, accessToken);
  const challenge = options.challenge;               // keep the base64url form

  const publicKey = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c) => ({
      ...c, id: b64urlToBuf(c.id),
    })),
  };

  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error("Setup was cancelled.");

  await callFn("register-verify", {
    challenge,
    deviceLabel: deviceLabel(),
    credential: {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        attestationObject: bufToB64url(cred.response.attestationObject),
        transports: cred.response.getTransports?.() ?? [],
      },
      clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    },
  }, accessToken);

  try {
    localStorage.setItem(BIOMETRIC_HINT_KEY, "1");
    localStorage.setItem(BIOMETRIC_CRED_KEY, cred.id);
  } catch { /* ignore */ }
  return cred.id;
}

// ─── Sign in ─────────────────────────────────────────────────────────────────
// Public: this *is* the login. Returns a session in the same shape the
// password flow produces, so the rest of the app cannot tell the difference.
export async function signInWithBiometric() {
  const { options } = await callFn("auth-options", {});
  const challenge = options.challenge;

  const publicKey = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c) => ({
      ...c, id: b64urlToBuf(c.id),
    })),
  };

  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error("Sign-in was cancelled.");

  const { session } = await callFn("auth-verify", {
    challenge,
    credential: {
      id: assertion.id,
      rawId: bufToB64url(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
        authenticatorData: bufToB64url(assertion.response.authenticatorData),
        signature: bufToB64url(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? bufToB64url(assertion.response.userHandle) : null,
      },
      clientExtensionResults: assertion.getClientExtensionResults?.() ?? {},
    },
  });

  if (!session?.access_token) throw new Error("Sign-in failed.");
  try {
    localStorage.setItem(BIOMETRIC_HINT_KEY, "1");
    localStorage.setItem(BIOMETRIC_CRED_KEY, assertion.id);
  } catch { /* ignore */ }
  return session;
}

// ─── Management ──────────────────────────────────────────────────────────────
export async function listBiometricCredentials(accessToken) {
  const res = await fetch(
    SUPA_URL + "/rest/v1/user_webauthn_credentials?select=id,credential_id,device_label,created_at,last_used_at",
    { headers: { apikey: SUPA_KEY, Authorization: "Bearer " + accessToken } }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function removeBiometricCredential(id, accessToken) {
  const res = await fetch(
    SUPA_URL + "/rest/v1/user_webauthn_credentials?id=eq." + id,
    { method: "DELETE", headers: { apikey: SUPA_KEY, Authorization: "Bearer " + accessToken } }
  );
  if (!res.ok) throw new Error("Could not remove that device.");
}

// Clears only this device's local markers — used after removing its own
// credential, never when revoking a different device.
export function forgetLocalCredential() {
  try {
    localStorage.removeItem(BIOMETRIC_HINT_KEY);
    localStorage.removeItem(BIOMETRIC_CRED_KEY);
  } catch { /* ignore */ }
}
