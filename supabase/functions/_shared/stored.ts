// A stored file for the background readers (PCR reader, charter reader), 27 Oct 2026 (files phase B).
// Supabase Storage first (files uploaded before phase B); Cloudflare R2 for files uploaded straight to R2, which
// are not in Supabase at all. Uses the service role and the R2 edge secrets; returns null when neither has it.
import { AwsClient } from "npm:aws4fetch@1.0.20";

const SUPA = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const enc = (p: string) => String(p).split("/").map(encodeURIComponent).join("/");

export async function fetchStored(bucket: string, path: string): Promise<Response | null> {
  const sb = await fetch(`${SUPA}/storage/v1/object/${encodeURIComponent(bucket)}/${enc(path)}`,
                         { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  if (sb.ok) return sb;
  await sb.body?.cancel();
  if (!env("R2_ACCOUNT_ID") || !env("R2_BUCKET")) return null;
  const aws = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
  const r2 = await aws.fetch(`https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${encodeURIComponent(env("R2_BUCKET"))}/${encodeURIComponent(bucket)}/${enc(path)}`);
  return r2.ok ? r2 : null;
}
