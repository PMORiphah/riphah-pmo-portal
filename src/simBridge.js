// PMO Simulation: the hand-over from the PMO's signed-in portal tab to the simulation tab.
//
// Loaded only when the PMO opens the Simulation window (src/SimLauncher.jsx); nobody else ever
// downloads this file. It sends two things over a one-time BroadcastChannel ('pmo-sim-<nonce>'):
//   1. the cast: real campus, project-manager and PMO-team names, keyed by fictional slots
//      (built by the launcher from the pinned ids in src/sim/data/pins.json);
//   2. the site-visit photos and videos the PMO ticked, downloaded here under the PMO's session.
//      Images are re-encoded through a canvas, which drops EXIF (location, camera) data.
// Never sent: ids, file names, storage paths, URLs, tokens. The simulation tab has no opener and
// no network access to production; it only ever sees names as text and media as Blobs.
//
// Protocol (src/sim/handoff.js is the receiving side):
//   sim    → { type:'hello', v:1, nonce }                 (repeated until the cast arrives)
//   portal → { type:'cast',  v:1, nonce, cast }
//   portal → { type:'media', v:1, nonce, items:[...] }    (one item per message as each is ready; 4 prepared at a time)
//   portal → { type:'done',  v:1, nonce, count }
//   sim    → { type:'ok',    v:1, nonce, count }           (receipt)
import { storageUrl } from "./storageUrl.js";

const VIDEO_MIMES = ["video/mp4", "video/webm"];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const ITEM_MAX = 50 * 1024 * 1024;   // per file, as the simulation enforces
export const TOTAL_MAX = 150 * 1024 * 1024; // all files together
export const COUNT_MAX = 200;
const HELLO_MS = 20000;   // the simulation tab must say hello within this
const OK_MS = 30000;      // and confirm receipt within this after 'done'
const BATCH = 4;
const MAX_SIDE = 2560;    // longest side after re-encoding; the Gallery never shows more

export const NO_TAB_MESSAGE = "The simulation tab did not open. Allow pop-ups for this site and press Start again.";

const encodeStoragePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm" };

// The type the portal recorded, else the file's extension (used here only, never sent).
export function mediaMimeOf(row) {
  const m = String(row?.mime_type || "").toLowerCase().split(";")[0].trim();
  if (m) return m === "image/jpg" ? "image/jpeg" : m;
  const ext = String(row?.file_path || "").split(".").pop().toLowerCase();
  return EXT_MIME[ext] || "";
}
export const isSupportedMedia = (row) => {
  const m = mediaMimeOf(row);
  return IMAGE_MIMES.includes(m) || VIDEO_MIMES.includes(m);
};

// True when any pixel is not fully opaque.
function hasAlpha(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

// Decode and draw again: the result carries pixels only (no EXIF, GPS or camera data), with the
// orientation applied. JPEG at 0.9, or PNG when the source has transparency.
async function reencode(blob, mime) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: mime !== "image/jpeg" });
    ctx.drawImage(bmp, 0, 0, w, h);
    const type = mime !== "image/jpeg" && hasAlpha(ctx, w, h) ? "image/png" : "image/jpeg";
    const out = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("could not re-encode"))), type, type === "image/jpeg" ? 0.9 : undefined));
    canvas.width = 0; canvas.height = 0;
    return { blob: out, mime: type };
  } finally {
    try { bmp.close(); } catch { /* ignore */ }
  }
}

// One ticked attachment → one hand-over item (or a reason it was left out).
async function prepare({ row, index, host, session, supa }) {
  const mime = mediaMimeOf(row);
  if (!IMAGE_MIMES.includes(mime) && !VIDEO_MIMES.includes(mime)) throw new Error("type not supported");
  if (Number(row.file_size) > ITEM_MAX && VIDEO_MIMES.includes(mime)) throw new Error("over 50 MB");
  const res = await supa(`/storage/v1/object/sign/project-attachments/${encodeStoragePath(row.file_path)}`,
    { method: "POST", body: JSON.stringify({ expiresIn: 120 }) }, session.access_token);
  if (!res?.signedURL) throw new Error("no link");
  const r = await fetch(storageUrl(res.signedURL), { cache: "no-store", referrerPolicy: "no-referrer", credentials: "omit" });
  if (!r.ok) throw new Error("download failed (" + r.status + ")");
  const raw = await r.blob();
  if (row.file_size != null && Number(row.file_size) > 0 && raw.size !== Number(row.file_size)) throw new Error("size differs from the record");
  let blob = raw, type = mime;
  if (IMAGE_MIMES.includes(mime)) ({ blob, mime: type } = await reencode(raw, mime));
  else blob = new Blob([raw], { type: mime });
  if (!blob.size) throw new Error("empty file");
  if (blob.size > ITEM_MAX) throw new Error("over 50 MB");
  return { key: "m" + String(index + 1).padStart(2, "0"), host, mime: type, size: blob.size, order: index, blob };
}

/**
 * Starts the hand-over. MUST be called synchronously from the click handler: the simulation tab
 * is opened before anything is awaited, or the browser treats it as an unrequested pop-up.
 *
 * cast:    { v:1, campuses, pms, team, code? } (names only)
 * ticked:  attachment rows in display order, newest first: { id, project_id, file_path, mime_type, file_size }
 * hosts:   pins.hosts — project_id → { host: 'H1', ... }
 * onProgress({ phase: 'opening'|'names'|'media'|'confirming', done, total, sent, bytes })
 * Resolves { sent, bytes, skipped:[{ id, reason }], confirmed } or rejects with an Error whose
 * message can be shown to the PMO.
 */
export function launch({ session, supa, cast, ticked = [], hosts = {}, onProgress }) {
  const nonce = crypto.randomUUID();
  const ch = new BroadcastChannel("pmo-sim-" + nonce);
  window.open(import.meta.env.BASE_URL + "simulation.html#k=" + nonce, "pmo-simulation", "noopener");
  return handOver({ ch, nonce, session, supa, cast, ticked, hosts, onProgress })
    .finally(() => { try { ch.close(); } catch { /* ignore */ } });
}

async function handOver({ ch, nonce, session, supa, cast, ticked, hosts, onProgress }) {
  const report = (p) => { try { onProgress?.(p); } catch { /* ignore */ } };
  let gotHello, gotOk;
  const hello = new Promise((r) => { gotHello = r; });
  const ok = new Promise((r) => { gotOk = r; });
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || typeof m !== "object" || m.v !== 1 || m.nonce !== nonce) return;
    if (m.type === "hello") gotHello(true);
    else if (m.type === "ok") gotOk(m);
  };

  report({ phase: "opening" });
  if (!(await Promise.race([hello, sleep(HELLO_MS).then(() => false)]))) throw new Error(NO_TAB_MESSAGE);

  ch.postMessage({ type: "cast", v: 1, nonce, cast });
  report({ phase: "names" });

  const list = ticked.slice(0, COUNT_MAX);
  const skipped = ticked.slice(COUNT_MAX).map((r) => ({ id: r.id, reason: "more than 200 items" }));
  let sent = 0, bytes = 0, done = 0, next = 0;
  report({ phase: "media", done, total: list.length, sent, bytes });
  // Up to BATCH files are prepared at a time, and each one is posted as soon as it is ready, so the
  // simulation tab keeps hearing from us (it gives up after a long silence) and no more than BATCH
  // files are held here at once. The order field keeps the Gallery's newest-first order.
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      const row = list[index];
      const host = hosts[row.project_id]?.host;
      let item = null, err = null;
      if (!host) err = "not on a pinned project";
      else {
        try { item = await prepare({ row, index, host, session, supa }); } catch (e) { err = e?.message || "failed"; }
      }
      done += 1;
      if (!err && bytes + item.size > TOTAL_MAX) err = "over the 150 MB total";
      if (err) skipped.push({ id: row.id, reason: err });
      else {
        bytes += item.size;
        ch.postMessage({ type: "media", v: 1, nonce, items: [item] });
        sent += 1;
      }
      item = null;
      report({ phase: "media", done, total: list.length, sent, bytes });
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH, list.length) }, worker));

  ch.postMessage({ type: "done", v: 1, nonce, count: sent });
  report({ phase: "confirming", done, total: list.length, sent, bytes });
  const receipt = await Promise.race([ok, sleep(OK_MS).then(() => null)]);
  return { sent, bytes, skipped, confirmed: !!receipt && receipt.count === sent };
}
