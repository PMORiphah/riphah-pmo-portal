// pdd-docs-copy — one-off (PMO, 5 Oct 2026): copy the PDF of each PMO-approved
// E-PDD PDD (epdd_files category "charter", private bucket epdd-files) into its
// linked CAPEX project's Documents (bucket project-attachments + project_attachments
// row), named "EPDD_<E-PDD project name>.pdf" like the PMO's own uploads.
// Body: { pdds: [ids], dry?: true }. Only PDDs that are "PMO Approved" and linked
// are touched; a project that already has a document with that name is skipped.
// Auth: x-cron-secret only (called once from SQL via net.http_post).
// Retired after use (redeployed as a 410 stub).
type Row = Record<string, unknown>;
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const SECRET = Deno.env.get("CRON_SECRET");
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return json({ error: "Unauthorized" }, 401);
  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
  const rest = (p: string, i: RequestInit = {}) =>
    fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { ...H, "Content-Type": "application/json", ...(i.headers ?? {}) } });
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  const body = await req.json().catch(() => ({})) as { pdds?: number[]; dry?: boolean };
  const ids = (body.pdds ?? []).map(Number).filter(Number.isInteger);
  if (!ids.length) return json({ error: "pdds required" }, 400);

  const pmo = ((await (await rest("user_profiles?username=eq.PMO&select=id")).json()) as Row[])[0]?.id ?? null;
  const pdds = await (await rest(`epdd_pdds?id=in.(${ids.join(",")})&select=id,pdd_number,project_name,epdd_status,linked_project_id`)).json() as Row[];
  const out: Row[] = [];
  for (const id of ids) {
    const p = pdds.find(x => x.id === id);
    if (!p) { out.push({ id, skipped: "not found" }); continue; }
    if (!/pmo approved/i.test(String(p.epdd_status ?? ""))) { out.push({ id, skipped: "not PMO Approved" }); continue; }
    if (!p.linked_project_id) { out.push({ id, skipped: "not linked" }); continue; }
    const f = ((await (await rest(`epdd_files?pdd_id=eq.${id}&category=eq.charter&status=eq.stored&select=storage_path,mime,size_bytes&order=created_at.desc&limit=1`)).json()) as Row[])[0];
    if (!f?.storage_path) { out.push({ id, skipped: "no stored PDD PDF" }); continue; }
    // Storage keys reject some characters; keep the name readable.
    const clean = String(p.project_name ?? p.pdd_number).replace(/[\[\]{}#%?\\^`|<>"~&*:]/g, "").replace(/\s+/g, " ").trim();
    const fileName = `EPDD_${clean}.pdf`;
    const pid = String(p.linked_project_id);
    const have = await (await rest(`project_attachments?project_id=eq.${pid}&file_name=eq.${encodeURIComponent(fileName)}&select=id`)).json();
    if (Array.isArray(have) && have.length) { out.push({ id, skipped: "already in Documents", fileName }); continue; }
    if (body.dry) { out.push({ id, would_add: fileName, project_id: pid, bytes: f.size_bytes }); continue; }

    const dl = await fetch(`${SUPA}/storage/v1/object/epdd-files/${enc(String(f.storage_path))}`, { headers: H });
    if (!dl.ok) { out.push({ id, error: `download ${dl.status}` }); continue; }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const path = `${pid}/${crypto.randomUUID()}-${fileName}`;
    const up = await fetch(`${SUPA}/storage/v1/object/project-attachments/${enc(path)}`, {
      method: "POST", headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "false" }, body: bytes });
    if (!up.ok) { out.push({ id, error: `upload ${up.status}: ${(await up.text()).slice(0, 200)}` }); continue; }
    const last = ((await (await rest(`project_attachments?project_id=eq.${pid}&kind=eq.document&select=sort_order&order=sort_order.desc.nullslast&limit=1`)).json()) as Row[])[0];
    const ins = await rest("project_attachments", { method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ project_id: pid, file_name: fileName, file_path: path, file_size: bytes.length,
        mime_type: "application/pdf", kind: "document", uploaded_by: pmo, uploaded_by_name: "Project Management Office",
        sort_order: (Number(last?.sort_order) || 0) + 1 }) });
    if (!ins.ok) {
      await fetch(`${SUPA}/storage/v1/object/project-attachments/${enc(path)}`, { method: "DELETE", headers: H });
      out.push({ id, error: `row ${ins.status}: ${(await ins.text()).slice(0, 200)}` }); continue;
    }
    out.push({ id, added: fileName, project_id: pid, bytes: bytes.length });
  }
  return json({ ok: true, results: out });
});
