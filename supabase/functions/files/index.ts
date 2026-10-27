// Files served from Cloudflare R2 (PMO, 23 Oct 2026; migration 20261023_r2_files.sql).
//
// Supabase Storage stays the original (phase A): every upload still goes there. This function
//   {action:"copy"}                     copies files not yet in R2 (cron job 3 with x-cron-secret, or a signed-in PMO),
//                                       and removes R2 copies whose original was deleted;
//   {action:"sign", bucket, paths, download?}
//                                       answers with an R2 link for each path the CALLER may open and that has a copy,
//                                       null otherwise (the browser then signs with Supabase as before).
// Who may open what is decided by public.file_access_r2() (phase B, 27 Oct 2026; migration
// 20261027_r2_direct_uploads.sql): the storage policies' rules written out from the portal's own records, checked
// equal to the old storage-based file_access() for every user and file before the switch. Secrets: R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, CRON_SECRET (edge env). Nothing secret is ever returned.
//
// Phase B, uploads straight to R2 (project Documents / Site Visit, PMO only, up to 500 MB per file):
//   {action:"upload", bucket, project_id, name, size, type}  → {path, url}: a one-time PUT link (30 min) for a new
//                                       path; the file goes from the browser to R2, never through Supabase
//   {action:"confirm", bucket, path}   → {size}: checks the file arrived and records its size
//   {action:"delete", bucket, path}    → removes the file from R2 (the Documents record is removed by the page)
// A file uploaded this way exists only in R2 (r2_objects.origin = 'r2'); r2_orphans() removes it only when no
// Documents record points to it and it is over a day old (an upload whose record was never saved).
import { AwsClient } from "npm:aws4fetch@1.0.20";

const BUCKETS = ["project-attachments", "epdd-files", "sim-shares"];
const COPY_BYTES = 150 * 1024 * 1024;   // per run: well inside the function's time and memory
const COPY_MS = 100_000;
const UPLOAD_MAX = 500 * 1024 * 1024;   // per file (PMO, 27 Oct 2026); R2 itself takes up to 5 GB in one upload
const UPLOAD_SECONDS = 30 * 60;
const LINK_SECONDS = 2 * 3600;          // links are signed from the start of the hour, so the same file has the same
                                        // link for an hour and the browser can reuse what it already downloaded

const SUPA = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const R2_BUCKET = env("R2_BUCKET");
const R2_BASE = `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${encodeURIComponent(R2_BUCKET)}`;
const aws = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const r2Url = (bucket: string, path: string) => `${R2_BASE}/${encodeURIComponent(bucket)}/${enc(path)}`;
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };

async function rpc(name: string, body: unknown, headers: Record<string, string>) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ─── sign ────────────────────────────────────────────────────────────────────

async function sign(auth: string, bucket: string, paths: string[], download: Record<string, string> | null) {
  if (!BUCKETS.includes(bucket)) return json({ error: "unknown bucket" }, 400);
  paths = [...new Set(paths.filter((p) => typeof p === "string" && p.length > 0 && p.length < 1024))].slice(0, 200);
  const urls: Record<string, string | null> = Object.fromEntries(paths.map((p) => [p, null]));
  if (!paths.length) return json({ urls });
  // 1. What the caller may open: the storage policies' rules, from the portal's records (file_access_r2).
  const allowed: string[] = await rpc("file_access_r2", { p_bucket: bucket, p_paths: paths },
    { apikey: ANON, authorization: auth, "content-type": "application/json" });
  if (!allowed.length) return json({ urls });
  // 2. Which of those have a copy in R2.
  const copied = new Set<string>();
  for (let i = 0; i < allowed.length; i += 40) {
    const list = allowed.slice(i, i + 40).map((p) => `"${p.replace(/["\\]/g, "\\$&")}"`).join(",");
    const q = new URLSearchParams({ select: "path", bucket: `eq.${bucket}`, path: `in.(${list})` });
    const r = await fetch(`${SUPA}/rest/v1/r2_objects?${q}`, { headers: svc });
    if (!r.ok) throw new Error(`r2_objects: ${r.status}`);
    for (const x of await r.json()) copied.add(x.path);
  }
  // 3. One link per file, signed from the start of the current hour.
  const hour = new Date(); hour.setUTCMinutes(0, 0, 0);
  const datetime = hour.toISOString().replace(/[:-]|\.\d{3}/g, "");
  for (const p of allowed) {
    if (!copied.has(p)) continue;
    const u = new URL(r2Url(bucket, p));
    u.searchParams.set("X-Amz-Expires", String(LINK_SECONDS));
    const name = download?.[p];
    if (name) u.searchParams.set("response-content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    const s = await aws.sign(new Request(u.toString()), { aws: { signQuery: true, datetime } });
    urls[p] = s.url;
  }
  return json({ urls });
}

// ─── copy ────────────────────────────────────────────────────────────────────

async function copy() {
  const started = Date.now();
  const done: string[] = [], failed: { path: string; error: string }[] = [], removed: string[] = [];
  let bytes = 0;
  const pending: { bucket: string; path: string; size_bytes: number; mime: string | null; etag: string | null }[] =
    await rpc("r2_pending", { p_limit: 200 }, svc);
  let next = 0;
  const worker = async () => {
    while (next < pending.length && Date.now() - started < COPY_MS && bytes < COPY_BYTES) {
      const f = pending[next++];
      try {
        const src = await fetch(`${SUPA}/storage/v1/object/${encodeURIComponent(f.bucket)}/${enc(f.path)}`, { headers: svc });
        if (!src.ok) throw new Error(`read ${src.status}`);
        const body = new Uint8Array(await src.arrayBuffer());
        const put = await aws.fetch(r2Url(f.bucket, f.path), {
          method: "PUT", body,
          headers: { "content-type": f.mime || src.headers.get("content-type") || "application/octet-stream",
                     "cache-control": "private, max-age=86400" },
        });
        if (!put.ok) throw new Error(`write ${put.status} ${(await put.text()).slice(0, 120)}`);
        const row = await fetch(`${SUPA}/rest/v1/r2_objects?on_conflict=bucket,path`, {
          method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ bucket: f.bucket, path: f.path, size_bytes: body.byteLength, etag: f.etag, copied_at: new Date().toISOString() }),
        });
        if (!row.ok) throw new Error(`record ${row.status}`);
        bytes += body.byteLength;
        done.push(`${f.bucket}/${f.path}`);
      } catch (e) {
        failed.push({ path: `${f.bucket}/${f.path}`, error: String(e).slice(0, 200) });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  // Copies whose original was deleted (a removed document, a withdrawn simulation share).
  const orphans: { bucket: string; path: string }[] = await rpc("r2_orphans", { p_limit: 200 }, svc);
  for (const o of orphans) {
    const del = await aws.fetch(r2Url(o.bucket, o.path), { method: "DELETE" });
    if (!del.ok && del.status !== 404) { failed.push({ path: `${o.bucket}/${o.path}`, error: `remove ${del.status}` }); continue; }
    const q = new URLSearchParams({ bucket: `eq.${o.bucket}`, path: `eq.${o.path}` });
    const row = await fetch(`${SUPA}/rest/v1/r2_objects?${q}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } });
    if (row.ok) removed.push(`${o.bucket}/${o.path}`);
  }
  return json({ copied: done.length, bytes, failed, removed: removed.length, left: Math.max(0, pending.length - done.length - failed.length),
                ms: Date.now() - started });
}

// ─── upload straight to R2 ───────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The page sends the name already cleaned by its storageSafeName(); here only slashes and control characters go.
const safeName = (n: string) => n.replace(/[\/\\\u0000-\u001f\u007f]/g, "_").trim().slice(0, 180) || "file";

async function mayUpload(auth: string, bucket: string) {
  return (await rpc("can_upload_file", { p_bucket: bucket }, { apikey: ANON, authorization: auth, "content-type": "application/json" })) === true;
}

async function upload(auth: string, b: Record<string, unknown>) {
  const bucket = String(b.bucket || ""), projectId = String(b.project_id || ""), size = Number(b.size);
  const type = String(b.type || "application/octet-stream").slice(0, 120);
  if (!(await mayUpload(auth, bucket))) return json({ error: "Only the PMO can upload files." }, 403);
  if (!UUID.test(projectId)) return json({ error: "unknown project" }, 400);
  if (!Number.isFinite(size) || size <= 0) return json({ error: "empty file" }, 400);
  if (size > UPLOAD_MAX) return json({ error: "too_big", limit: UPLOAD_MAX }, 413);
  const path = `${projectId}/${crypto.randomUUID()}-${safeName(String(b.name || "file"))}`;
  // Recorded first, so an upload whose Documents record is never saved is still found and removed after a day.
  const row = await fetch(`${SUPA}/rest/v1/r2_objects`, {
    method: "POST", headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ bucket, path, size_bytes: size, origin: "r2", copied_at: new Date().toISOString() }),
  });
  if (!row.ok) throw new Error(`record ${row.status}`);
  const u = new URL(r2Url(bucket, path));
  u.searchParams.set("X-Amz-Expires", String(UPLOAD_SECONDS));
  const signed = await aws.sign(new Request(u.toString(), { method: "PUT", headers: { "content-type": type } }), { aws: { signQuery: true } });
  return json({ path, url: signed.url, headers: { "content-type": type }, limit: UPLOAD_MAX });
}

async function confirm(auth: string, b: Record<string, unknown>) {
  const bucket = String(b.bucket || ""), path = String(b.path || "");
  if (!(await mayUpload(auth, bucket))) return json({ error: "Only the PMO can upload files." }, 403);
  const head = await aws.fetch(r2Url(bucket, path), { method: "HEAD" });
  if (!head.ok) return json({ error: `the file did not arrive (${head.status})` }, 409);
  const size = Number(head.headers.get("content-length") || 0);
  const q = new URLSearchParams({ bucket: `eq.${bucket}`, path: `eq.${path}`, origin: "eq.r2" });
  const row = await fetch(`${SUPA}/rest/v1/r2_objects?${q}`, {
    method: "PATCH", headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ size_bytes: size, etag: head.headers.get("etag") }),
  });
  if (!row.ok) throw new Error(`record ${row.status}`);
  return json({ size });
}

async function remove(auth: string, b: Record<string, unknown>) {
  const bucket = String(b.bucket || ""), path = String(b.path || "");
  if (!(await mayUpload(auth, bucket))) return json({ error: "Only the PMO can remove files." }, 403);
  if (!/^[0-9a-f-]{36}\//i.test(path)) return json({ error: "unknown file" }, 400);
  const del = await aws.fetch(r2Url(bucket, path), { method: "DELETE" });
  if (!del.ok && del.status !== 404) return json({ error: `remove ${del.status}` }, 502);
  const q = new URLSearchParams({ bucket: `eq.${bucket}`, path: `eq.${path}` });
  await fetch(`${SUPA}/rest/v1/r2_objects?${q}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } });
  return json({ removed: true });
}

// ─── entry ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const auth = req.headers.get("authorization") ?? "";
  try {
    if (body.action === "sign") {
      return await sign(auth, String(body.bucket || ""), Array.isArray(body.paths) ? body.paths : [],
                        body.download && typeof body.download === "object" ? body.download : null);
    }
    if (body.action === "upload") return await upload(auth, body);
    if (body.action === "confirm") return await confirm(auth, body);
    if (body.action === "delete") return await remove(auth, body);
    if (body.action === "copy") {
      const cron = env("CRON_SECRET") && req.headers.get("x-cron-secret") === env("CRON_SECRET");
      if (!cron && (await rpc("is_pmo", {}, { apikey: ANON, authorization: auth, "content-type": "application/json" })) !== true) {
        return json({ error: "PMO only" }, 403);
      }
      return await copy();
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "files: " + String(e).slice(0, 200) }, 500);
  }
});
