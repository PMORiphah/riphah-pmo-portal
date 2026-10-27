// Stored files for the backend functions (files phase B, 27 Oct 2026).
// fetchStored: Supabase Storage first (files stored before phase B); Cloudflare R2 for files stored straight in R2,
// which are not in Supabase at all. putStored: a new file straight into R2, recorded in r2_objects (origin 'r2') so
// the `files` function hands out links for it. Uses the service role and the R2 edge secrets.
import { AwsClient } from "npm:aws4fetch@1.0.20";

const SUPA = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const enc = (p: string) => String(p).split("/").map(encodeURIComponent).join("/");
const r2 = () => new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
const r2Url = (bucket: string, path: string) =>
  `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${encodeURIComponent(env("R2_BUCKET"))}/${encodeURIComponent(bucket)}/${enc(path)}`;

export async function fetchStored(bucket: string, path: string): Promise<Response | null> {
  const sb = await fetch(`${SUPA}/storage/v1/object/${encodeURIComponent(bucket)}/${enc(path)}`,
                         { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (sb.ok) return sb;
  await sb.body?.cancel();
  if (!env("R2_ACCOUNT_ID") || !env("R2_BUCKET")) return null;
  const res = await r2().fetch(r2Url(bucket, path));
  if (res.ok) return res;
  await res.body?.cancel();
  return null;
}

/** Writes a file to R2 (an existing file at that path is replaced) and records it. Throws on failure. */
export async function putStored(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const put = await r2().fetch(r2Url(bucket, path), { method: "PUT", body: bytes as unknown as BodyInit,
    headers: { "content-type": contentType, "cache-control": "private, max-age=86400" } });
  if (!put.ok) throw new Error(`R2 ${put.status}: ${(await put.text()).slice(0, 200)}`);
  const row = await fetch(`${SUPA}/rest/v1/r2_objects?on_conflict=bucket,path`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "content-type": "application/json",
               Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ bucket, path, size_bytes: bytes.length, etag: put.headers.get("etag"), origin: "r2",
                           copied_at: new Date().toISOString() }),
  });
  if (!row.ok) throw new Error(`r2_objects ${row.status}: ${(await row.text()).slice(0, 200)}`);
}
