// Links to stored files from Cloudflare R2 (23 Oct 2026; edge function `files`, migration 20261023_r2_files.sql).
//
// Supabase's free plan allows 5 GB of downloads a month; R2 charges nothing for them. The `files` function
// answers with an R2 link for each file the signed-in user may open (decided by the existing storage policies)
// and that has a copy in R2, and null otherwise. Every caller keeps its old Supabase signing as the fallback,
// so a file not yet copied, an outage or any error behaves exactly as before.
//
// Links are signed from the start of the hour and stay valid for two hours, so the same file gets the same link
// for an hour and the browser can reuse what it already downloaded. Requests made within a few milliseconds of
// each other (a gallery opening) go out as one call per bucket.
// In the PMO Simulation tab nothing is asked: its own backend answers file requests.

const FN = "https://prmxkecomqqngvrmytcj.supabase.co/functions/v1/files";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8";
const R2_HOST = ".r2.cloudflarestorage.com";

const memo = new Map();      // "bucket|path|download" → { url, until }
const queues = new Map();    // "bucket|download|token" → { paths:Set, waiters:[], timer }

const inSim = () => typeof window !== "undefined" && !!window.__PMO_SIM__;
// A link signed at the start of hour H is valid until H+2h; reuse it until H+1h50m.
const reuseUntil = () => { const d = new Date(); d.setUTCMinutes(0, 0, 0); return d.getTime() + 110 * 60 * 1000; };
const isR2 = (u) => { try { const x = new URL(u); return x.protocol === "https:" && x.hostname.endsWith(R2_HOST); } catch { return false; } };

async function ask(bucket, paths, token, download) {
  const r = await fetch(FN, {
    method: "POST", cache: "no-store", credentials: "omit",
    headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign", bucket, paths, download }),
  });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  return j && typeof j.urls === "object" && j.urls ? j.urls : {};
}

/** R2 link for one stored file, or null (then sign with Supabase as before). Never throws.
 *  `download`: a file name to save under (Content-Disposition: attachment), else the file opens. */
export function fileLink(bucket, path, token, { download = null } = {}) {
  if (inSim() || !bucket || !path || !token) return Promise.resolve(null);
  const k = `${bucket}|${path}|${download || ""}`;
  const hit = memo.get(k);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
  const qk = `${bucket}|${download || ""}|${token}`;
  let q = queues.get(qk);
  if (!q) {
    q = { paths: new Set(), waiters: [] };
    queues.set(qk, q);
    q.timer = setTimeout(async () => {
      queues.delete(qk);
      const paths = [...q.paths];
      let urls = {};
      try {
        for (let i = 0; i < paths.length; i += 200) {
          const part = paths.slice(i, i + 200);
          Object.assign(urls, await ask(bucket, part, token, download ? Object.fromEntries(part.map((p) => [p, download])) : null));
        }
      } catch { urls = {}; }
      const until = reuseUntil();
      for (const p of paths) {
        const u = typeof urls[p] === "string" && isR2(urls[p]) ? urls[p] : null;
        if (u) memo.set(`${bucket}|${p}|${download || ""}`, { url: u, until });
      }
      for (const w of q.waiters) w();
    }, 8);
  }
  q.paths.add(path);
  return new Promise((resolve) => q.waiters.push(() => resolve(memo.get(k)?.url || null)));
}

// ─── Uploads straight to R2 (phase B, 27 Oct 2026; /preview/ first) ─────────────────────────────────────────────
// The function hands out a one-time PUT link for a new path (PMO only, up to 500 MB); the file goes from the
// browser to R2 and never through Supabase, so the 50 MB storage limit does not apply.

export const R2_UPLOAD_MAX = 500 * 1024 * 1024;

async function call(body, token) {
  const r = await fetch(FN, {
    method: "POST", cache: "no-store", credentials: "omit",
    headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `files ${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}

/** Upload one file to R2 for a project. Resolves to the stored path. `onProgress(sentBytes, totalBytes)`.
 *  Errors carry `.stage`: "link" (nothing was sent; the caller may fall back to Supabase) or "send"/"confirm". */
export async function uploadToR2(bucket, projectId, file, name, token, onProgress) {
  let link;
  try {
    link = await call({ action: "upload", bucket, project_id: projectId, name, size: file.size,
                        type: file.type || "application/octet-stream" }, token);
    if (!link.path || !isR2(link.url)) throw new Error("no upload link");
  } catch (e) { e.stage = "link"; throw e; }
  await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", link.url);
    for (const [k, v] of Object.entries(link.headers || {})) x.setRequestHeader(k, v);
    x.upload.onprogress = (ev) => { if (ev.lengthComputable && onProgress) onProgress(ev.loaded, ev.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve()
      : reject(Object.assign(new Error(`Upload failed for ${file.name} (${x.status})`), { stage: "send" })));
    x.onerror = () => reject(Object.assign(new Error(`Upload of ${file.name} was interrupted. Check the connection and try again.`), { stage: "send" }));
    x.onabort = x.onerror;
    x.send(file);
  });
  try { await call({ action: "confirm", bucket, path: link.path }, token); }
  catch (e) { e.stage = "confirm"; e.message = `"${file.name}" did not arrive in storage. Please try again.`; throw e; }
  return link.path;
}

/** Remove a file from R2 (PMO). Never throws; a file that was never in R2 is fine. */
export async function removeFromR2(bucket, path, token) {
  try { await call({ action: "delete", bucket, path }, token); } catch { /* the copy job tidies up what is left */ }
  for (const k of [...memo.keys()]) if (k.startsWith(`${bucket}|${path}|`)) memo.delete(k);
}
