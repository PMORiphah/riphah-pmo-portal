// PMO Simulation (live data): canonical JSON, SHA-256 and the snapshot code (src/sim/live/canon.js,
// contract §B.5). PUBLIC, data-free. Owner: B2.
//   node scripts/sim/live/canon.test.mjs
import assert from "node:assert/strict";

const C = await import(new URL("../../../src/sim/live/canon.js", import.meta.url));
const { canon, sha256Hex, code6, fingerprintInput, fingerprintOf } = C;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

await test("canon: keys sorted at every depth, arrays kept in order, undefined skipped, -0 is 0", () => {
  assert.equal(canon({ b: 1, a: { d: [3, 1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,1,{"y":2,"z":1}]},"b":1}');
  assert.equal(canon({ a: undefined, b: 2 }), '{"b":2}');
  assert.equal(canon([undefined, 1]), "[null,1]");
  assert.equal(canon(-0), "0");
  assert.equal(canon("é\n\"x\""), JSON.stringify("é\n\"x\""));
  assert.equal(canon(Object.assign(Object.create(null), { b: 1, a: 2 })), '{"a":2,"b":1}');
  assert.equal(canon({ "10": 1, "9": 2, a: 3 }), '{"10":1,"9":2,"a":3}');          // UTF-16 order, not numeric
});

await test("canon: same data in another key order gives the same text", () => {
  const a = { x: [1, 2], y: { p: "q", r: [{ s: 1, t: 2 }] } };
  const b = { y: { r: [{ t: 2, s: 1 }], p: "q" }, x: [1, 2] };
  assert.equal(canon(a), canon(b));
});

await test("canon: refuses what never belongs in a hand-over", () => {
  for (const v of [NaN, Infinity, -Infinity, () => 1, Symbol("s"), 1n, new Date(0), new Map(), new Blob(["x"]), /re/, new Uint8Array(2)]) {
    assert.throws(() => canon({ v }), TypeError, String(v));
  }
});

await test("sha256Hex: known vectors for text and bytes, Blob too", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const bytes = new TextEncoder().encode("abc");
  assert.equal(await sha256Hex(bytes), await sha256Hex("abc"));
  assert.equal(await sha256Hex(bytes.buffer), await sha256Hex("abc"));
  assert.equal(await sha256Hex(new Blob([bytes])), await sha256Hex("abc"));
  await assert.rejects(() => sha256Hex(12), TypeError);
});

await test("code6: first 30 bits as 6 Crockford base32 characters", () => {
  assert.equal(code6("00000000"), "000000");
  assert.equal(code6("ffffffff"), "ZZZZZZ");
  assert.equal(code6("80000000"), "G00000");            // top bit set: 1 << 29 = 16 × 32^5
  for (let i = 0; i < 200; i++) {
    const hex = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const c = code6(hex);
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{6}$/);
    // Decoding the code gives back the first 30 bits.
    const n = [...c].reduce((a, ch) => a * 32 + "0123456789ABCDEFGHJKMNPQRSTVWXYZ".indexOf(ch), 0);
    assert.equal(n, parseInt(hex.slice(0, 8), 16) >>> 2);
  }
});

await test("fingerprint: covers the listed fields only, deterministic, sensitive to one character", async () => {
  const base = { v: 2, build: "b", takenAt: 1, tz: "Asia/Karachi", pmo: { id: "p" }, mask: { contacts: true }, testAccounts: [],
    overrides: {}, leftOut: 0, failed: 0, tables: { t: [{ a: "x" }] }, responses: [], rpc: { project_has_deliverables: [] },
    plan: { v: 1 }, media: [{ attachmentId: "a", key: "m001", mime: "image/jpeg", size: 1, sha256: "0".repeat(64), blob: "ignored" }] };
  const f1 = await fingerprintOf(base);
  const f2 = await fingerprintOf({ ...structuredClone(base), readMs: 99, fingerprint: "x", code: "y", bytes: 7, invariants: [{ name: "n" }] });
  assert.deepEqual(f1, f2, "readMs, fingerprint, code, bytes and invariants are not covered; media blob ignored");
  assert.match(f1.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(f1.code, code6(f1.fingerprint));
  assert.equal(f1.bytes, canon(fingerprintInput(base)).length);
  const changed = structuredClone(base); changed.tables.t[0].a = "y";
  assert.notEqual((await fingerprintOf(changed)).fingerprint, f1.fingerprint);
  const reordered = { ...base, tables: { t: [{ a: "x" }] }, pmo: { id: "p" } };
  assert.equal((await fingerprintOf(reordered)).fingerprint, f1.fingerprint);
});

console.log(`PASS · ${passed} checks`);
