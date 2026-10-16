// PMO Simulation (live data): canonical JSON, SHA-256 and the 6-character snapshot code.
// PUBLIC, pure, no data. Runs in the portal tab, the simulation tab and Node (>= 18, global
// crypto.subtle). Owner: B2. Spec: contract §B.5

/** Canonical JSON: object keys sorted (default UTF-16 order) at every depth, arrays in order,
 *  undefined members skipped, -0 written as 0. Non-finite numbers, functions, symbols, bigints and
 *  non-plain objects (Blob, Date, Map …) throw: they never belong in a hand-over. */
export function canon(v) {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean": return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new TypeError("canon: non-finite number");
      return Object.is(v, -0) ? "0" : JSON.stringify(v);
    case "string": return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canon(x))).join(",") + "]";
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new TypeError("canon: not a plain object");
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    }
    default: throw new TypeError("canon: unsupported " + typeof v);
  }
}

/** SHA-256 of a string (UTF-8) or of bytes (ArrayBuffer / typed array / Blob), as 64 hex chars. */
export async function sha256Hex(data) {
  let bytes;
  if (typeof data === "string") bytes = new TextEncoder().encode(data);
  else if (typeof Blob !== "undefined" && data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else throw new TypeError("sha256Hex: string or bytes");
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** The first 30 bits of a hex digest as 6 Crockford base32 characters ("Snapshot 7KQ2MD"). */
export function code6(hex) {
  const n = parseInt(String(hex).slice(0, 8), 16) >>> 2;          // 32 bits -> top 30 bits
  let s = "";
  for (let i = 5; i >= 0; i--) s += CROCKFORD[(n >>> (i * 5)) & 31];
  return s;
}

/** The members of a snapshot the fingerprint covers (contract §B.5), in one object. */
export function fingerprintInput(s) {
  return {
    v: s.v, build: s.build, takenAt: s.takenAt, tz: s.tz, pmo: s.pmo, mask: s.mask,
    testAccounts: s.testAccounts, overrides: s.overrides, leftOut: s.leftOut, failed: s.failed,
    tables: s.tables, responses: s.responses, rpc: s.rpc, plan: s.plan,
    media: (s.media || []).map((m) => ({ attachmentId: m.attachmentId, key: m.key, mime: m.mime, size: m.size, sha256: m.sha256 })),
  };
}

/** { fingerprint: 64 hex, code: 6 chars, bytes: canonical length } */
export async function fingerprintOf(snapshot) {
  const text = canon(fingerprintInput(snapshot));
  const fingerprint = await sha256Hex(text);
  return { fingerprint, code: code6(fingerprint), bytes: text.length };
}
