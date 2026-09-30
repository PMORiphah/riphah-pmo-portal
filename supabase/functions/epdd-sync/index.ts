import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { reviewPdd, RULES_VERSION } from "./review.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   E-PDD SYNC — copies PDDs from the E-PDD portal (pmo.riphah.edu.pk) into the
   PMO portal every 5 minutes (pg_cron job `epdd-sync`), with their attachments.

   READ ONLY. The only request that is not a GET is the login form. This function
   never calls approve / reject / the SAP-saved tick box or anything else that
   changes the E-PDD portal. The PMO decides there, by hand.

   Sources (both are the DataTables JSON endpoints behind the pages):
     /manage-pmoform  new PDDs waiting for the PMO   → queue 'manage'
     /Status-Pdd      everything already processed   → queue 'status'
   For a new or changed PDD the view page is also read, for the SU head, the
   project type label and the approval history with names and reasons.

   PRIVACY. The E-PDD rows carry the submitter's full HR profile (CNIC, birth
   date, family names, address). Only name, designation, email and unit are
   kept. Approval tokens are dropped.

   REVIEW (phase 3). After copying, every new or changed PDD gets the code
   checks in review.ts, stored in epdd_reviews. A review is redone when the PDD,
   its files, its linked plan project, the plan's figures or the rules change.
   { "review": <id> } in the body redoes one PDD without touching the E-PDD
   portal (used after the PMO links a plan project on the page).

   Auth: x-cron-secret (pg_cron) or a signed-in PMO (the "Check now" button).
   ───────────────────────────────────────────────────────────────────────────── */

const BASE = "https://pmo.riphah.edu.pk";
const UA = "Mozilla/5.0 (compatible; RiphahPMOPortal-EPDDSync/1.0)";
const BUCKET = "epdd-files";
const MAX_DETAILS_PER_RUN = 15;
const MAX_FILES_PER_RUN = 40;
const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_FILE_ATTEMPTS = 3;
const TIME_BUDGET_MS = 110_000;     // stop starting new work after this
const LOCK_MS = 4 * 60_000;         // a run younger than this blocks the next

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── helpers: text ────────────────────────────────────────────────────────────
const decode = (s: unknown) => String(s ?? "")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const text = (v: unknown): string => {
  if (v == null) return "";
  let s = decode(v);
  if (/<[a-z/][^>]*>/i.test(s)) {
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
         .replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "");
    s = decode(s);
  }
  return s.replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  try { const x = JSON.parse(decode(v)); return Array.isArray(x) ? x : [x]; }
  catch { return [decode(v)]; }
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const dateOnly = (v: unknown): string | null => {
  const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

// "2026-08-17<br>12:16:02 PM" (Pakistan time) → ISO
const receivedAt = (v: unknown): string | null => {
  const s = String(v ?? "");
  const m = s.match(/(\d{4}-\d{2}-\d{2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return dateOnly(s) ? `${dateOnly(s)}T00:00:00+05:00` : null;
  let h = Number(m[2]) % 12; if (/pm/i.test(m[5])) h += 12;
  return `${m[1]}T${String(h).padStart(2, "0")}:${m[3]}:${m[4] ?? "00"}+05:00`;
};

const UNITS: Record<string, string> = {
  square_feet: "Square Feet", cubic_feet: "Cubic Feet", box: "Box", pack: "Pack", each_no: "Each/No.",
  feet: "Feet", grams: "Grams", kilograms: "Kilograms", liter: "Liter", milliliter: "Milliliter",
  meter: "Meter", others: "Others",
};
const DOC_TYPES: Record<string, string> = {
  "1": "General", "2": "Simple Procurement", "3": "New Construction", "4": "Renovation/Maintenance",
};
const PROJECT_TYPES: Record<string, string> = { "1": "Non-Budgeted Project", "2": "Budgeted Project" };
const FILE_GROUPS = [
  { key: "general", folder: "general", label: "General" },
  { key: "simpleprocurement", folder: "simpleprocurement", label: "Simple Procurement" },
  { key: "construction", folder: "construction", label: "New Construction" },
  { key: "renovation", folder: "renovation", label: "Renovation/Maintenance" },
];

// JSON with keys in a fixed order: jsonb hands stored objects back reordered.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, (x as Record<string, unknown>)[k]])) : x);

async function sha256(data: string | Uint8Array) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── normalise one E-PDD row ──────────────────────────────────────────────────
type Row = Record<string, unknown>;

function sanitise(row: Row): Row {
  const r: Row = { ...row };
  const u = (r.user ?? {}) as Row;
  delete r.user;
  r.user_min = { name: u.name ?? null, designation: u.designation ?? null, email: u.email ?? null,
                 strategic_unit: u.strategic_unit ?? null };
  if (Array.isArray(r.approvals)) r.approvals = (r.approvals as Row[]).map(a => { const c = { ...a }; delete c.approval_token; return c; });
  if (Array.isArray(r.second_approvals)) r.second_approvals = (r.second_approvals as Row[]).map(a => { const c = { ...a }; delete c.approval_token; return c; });
  delete r.action;
  return r;
}

function normalise(row: Row) {
  const descs = arr(row.description_of_items), units = arr(row.unit), qtys = arr(row.qty_in_req),
        ucs = arr(row.unit_cost), tcs = arr(row.total_cost);
  const n = Math.max(descs.length, units.length, qtys.length, ucs.length, tcs.length);
  const items = [];
  for (let i = 0; i < n; i++) {
    const d = text(descs[i]);
    if (!d && num(qtys[i]) == null && num(ucs[i]) == null && num(tcs[i]) == null) continue;
    const u = String(units[i] ?? "");
    items.push({ description: d, unit: UNITS[u] ?? u, qty: num(qtys[i]), unit_cost: num(ucs[i]), total: num(tcs[i]) });
  }

  const docTypes = arr(row.deliverables_documents).map(x => DOC_TYPES[String(x)] ?? String(x));
  const slots: Array<{ category: string; group: string; title: string; file: string | null }> = [];
  for (const g of FILE_GROUPS) {
    const titles = arr(row[`${g.key}_title`]), files = arr(row[`${g.key}_file`]);
    const len = Math.max(titles.length, files.length);
    for (let i = 0; i < len; i++) {
      const f = files[i] == null || files[i] === "" ? null : decode(files[i]);
      slots.push({ category: g.key, group: g.label, title: text(titles[i]) || `File ${i + 1}`, file: f });
    }
  }

  const ex = arr(row.technical_experts), exE = arr(row.technical_expert_emails), exC = arr(row.technical_expert_contacts);
  const experts = [];
  for (let i = 0; i < Math.max(ex.length, exE.length, exC.length); i++) {
    const e = { name: text(ex[i]), email: text(exE[i]), contact: text(exC[i]) };
    if (e.name || e.email || e.contact) experts.push(e);
  }
  const rk = arr(row.risks), rkI = arr(row.project_impect);
  const risks = [];
  for (let i = 0; i < Math.max(rk.length, rkI.length); i++) {
    const r = { risk: text(rk[i]), impact: text(rkI[i]) };
    if (r.risk || r.impact) risks.push(r);
  }
  const pick = (titles: unknown, checks: unknown) => {
    const t = arr(titles), c = arr(checks);
    return t.map((x, i) => (String(c[i]) === "1" ? text(x) : null)).filter(Boolean);
  };

  return {
    date: dateOnly(row.date),
    project_name: text(row.project_name),
    description: text(row.project_description),
    campus: text(row.campus),
    project_type: PROJECT_TYPES[String(row.project_type)] ?? text(row.project_type),
    cost_center: text(row.cost_center),
    // The E-PDD form labels these fields differently from their column names.
    problem: text(row.opportunity),
    opportunity: text(row.project_proposed),
    proposed_solution: text(row.proposed_solution),
    related_target: text(row.related_target),
    objectives: text(row.objectives),
    items,
    grand_total: num(row.grand_total),
    currency: text(row.currency).toUpperCase() || "PKR",
    doc_types: docTypes,
    file_slots: slots,
    stakeholders: text(row.stakeholders),
    experts,
    risks,
    success_criteria: text(row.success_criteria),
    strategic_themes: pick(row.strategictheme_title, row.strategictheme_checkbox),
    strategic_priorities: pick(row.strategicpriorities_title, row.strategicpriorities_checkbox),
    estimated_total: num(row.estimated_totalcost),
    estimated_duration: text(row.estimated_duration),
    start_date: dateOnly(row.start_date),
    finish_date: dateOnly(row.finish_date),
  };
}

// ── view page: SU head, project type label, approval history ─────────────────
function parseView(html: string) {
  const val = (name: string) => {
    const m = html.match(new RegExp(`name="${name}"[^>]*?value="([^"]*)"`, "i"));
    return m ? text(m[1]) : null;
  };
  const out = { su_head: val("su_head_name"), project_type: val("project_type_name"),
                approvals: [] as Row[] };
  const at = html.indexOf("Approval History");
  if (at < 0) return out;
  const doc = new DOMParser().parseFromString(html.slice(at, at + 400_000), "text/html");
  const table = doc?.querySelector("table");
  if (!table) return out;
  const clean = (s: string | undefined | null) => text(s ?? "").replace(/\s+/g, " ").trim();
  for (const tr of table.querySelectorAll("tbody tr")) {
    const td = [...tr.querySelectorAll("td")];
    if (td.length < 6) continue;
    const isUpdate = /Record Updated/i.test(td[1]?.textContent ?? "");
    const name = isUpdate ? null : clean(td[1]?.querySelector(".fw-semibold")?.textContent);
    const role = isUpdate ? null : clean(td[1]?.querySelector("small")?.textContent);
    const dt = clean(td[2]?.textContent);
    const status = clean(td[3]?.textContent);
    const costRaw = clean(td[4]?.textContent);
    const cell = (i: number) => {
      const ta = td[i]?.querySelector("textarea");
      const s = ta ? text(ta.textContent) : clean(td[i]?.textContent);
      return s && s !== "NULL" ? s : null;
    };
    let reason = cell(5), updateReason = td.length > 6 ? cell(6) : null, updatedBy: string | null = null;
    if (isUpdate) { updatedBy = (reason ?? "").replace(/^Updated By:\s*/i, "").trim() || null; reason = null; }
    out.approvals.push({
      kind: isUpdate ? "update" : "decision", name, role, when: dt, status,
      recommendation_cost: costRaw && costRaw !== "NULL" ? num(costRaw) : null,
      reason, update_reason: updateReason, updated_by: updatedBy,
    });
  }
  return out;
}

// ── E-PDD HTTP session (cookie jar) ──────────────────────────────────────────
class Jar {
  m = new Map<string, string>();
  constructor(saved?: string | null) {
    if (saved) try { for (const [k, v] of Object.entries(JSON.parse(saved))) this.m.set(k, String(v)); } catch { /* fresh */ }
  }
  absorb(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const nv = c.split(";")[0]; const i = nv.indexOf("=");
      if (i < 1) continue;
      const k = nv.slice(0, i).trim(), v = nv.slice(i + 1).trim();
      if (/expires=Thu, 01[- ]Jan[- ]1970/i.test(c) || v === "deleted" || v === "") this.m.delete(k); else this.m.set(k, v);
    }
  }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  dump() { return JSON.stringify(Object.fromEntries(this.m)); }
}

// GET only. Anything that is not the login form goes through here.
async function epddGet(jar: Jar, path: string, xhr = false, timeout = 30_000) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    method: "GET", redirect: "manual",
    headers: { Cookie: jar.header(), "User-Agent": UA,
               ...(xhr ? { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } : {}) },
    signal: AbortSignal.timeout(timeout),
  });
  jar.absorb(res);
  return res;
}

async function epddLogin(jar: Jar, email: string, password: string) {
  jar.m.clear();
  const r1 = await epddGet(jar, "/");
  const html = await r1.text();
  const tok = html.match(/name="_token"\s+value="([^"]+)"/)?.[1];
  if (!tok) throw new Error("E-PDD login page changed: no _token field");
  const r2 = await fetch(BASE + "/user-login", {
    method: "POST", redirect: "manual",
    headers: { Cookie: jar.header(), "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ _token: tok, email, password }),
    signal: AbortSignal.timeout(30_000),
  });
  jar.absorb(r2); await r2.body?.cancel();
  const loc = r2.headers.get("location") ?? "";
  if (r2.status !== 302 || !/dashboard/i.test(loc)) throw new Error(`E-PDD login failed (HTTP ${r2.status}${loc ? " → " + loc : ""})`);
}

async function epddList(jar: Jar, path: string): Promise<Row[] | null> {
  const res = await epddGet(jar, `${path}?draw=1&start=0&length=1000`, true);
  const ct = res.headers.get("content-type") ?? "";
  if (res.status !== 200 || !ct.includes("json")) { await res.body?.cancel(); return null; }
  const j = await res.json().catch(() => null);
  if (!j || !Array.isArray(j.data)) return null;
  if (typeof j.recordsFiltered === "number" && j.recordsFiltered > j.data.length)
    throw new Error(`${path}: ${j.recordsFiltered} records but only ${j.data.length} returned`);
  return j.data as Row[];
}

// ── main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const t0 = Date.now();
  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  // Auth: pg_cron with the shared secret, or a signed-in PMO.
  let trigger = "cron";
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    const r = await fetch(`${SUPA}/rest/v1/rpc/is_pmo`, {
      method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}",
    }).catch(() => null);
    const ok = r?.ok ? (await r.json().catch(() => false)) === true : false;
    if (!ok) return json({ error: "Unauthorized" }, 401);
    trigger = "manual";
  }

  const svc = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers ?? {}) } });
  const getState = async (key: string) => {
    const r = await rest(`epdd_state?key=eq.${key}&select=value,updated_at`);
    const j = await r.json().catch(() => []);
    return Array.isArray(j) && j[0] ? j[0] as { value: string; updated_at: string } : null;
  };
  const setState = (key: string, value: string | null) =>
    rest("epdd_state?on_conflict=key", { method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) });

  // ── Code review of PDDs (phase 3) ────────────────────────────────────────
  const runReviews = async (onlyId: number | null, deadline: number) => {
    const projects = await (await rest("projects?select=id,code,name,campus,df_recommended_amount,workflow_stage,portfolio,fiscal_year,cost_centers(name)")).json() as Row[];
    const projSig = await sha256(JSON.stringify(projects.map(p => [p.id, p.name, p.df_recommended_amount, p.workflow_stage, p.campus, (p.cost_centers as Row | null)?.name]).sort()));
    const pdds = await (await rest(`epdd_pdds?select=id,project_name,project_type,campus,cost_center,grand_total,estimated_total,received_at,source_created_at,submitted_on,start_date,finish_date,pdd,content_hash,linked_project_id,link_source&queue=neq.removed${onlyId ? `&id=eq.${onlyId}` : ""}`)).json() as Row[];
    const files = await (await rest(`epdd_files?select=pdd_id,category,title,file_name,status,attempts,sha256,error${onlyId ? `&pdd_id=eq.${onlyId}` : ""}`)).json() as Row[];
    const latest = new Map<number, Row>();
    for (const r of await (await rest(`epdd_reviews?select=id,pdd_id,content_hash,verdict,summary,model,checks&order=created_at.desc${onlyId ? `&pdd_id=eq.${onlyId}` : ""}`)).json() as Row[])
      if (!latest.has(Number(r.pdd_id))) latest.set(Number(r.pdd_id), r);
    let done = 0;
    for (const row of pdds) {
      if (Date.now() > deadline) break;
      const fs = files.filter(f => f.pdd_id === row.id);
      // Wait for the attachments: a file still being copied would read as missing.
      if (fs.some(f => f.status === "pending" || (f.status === "failed" && Number(f.attempts) < MAX_FILE_ATTEMPTS))) continue;
      const fileSig = fs.map(f => [f.category, f.title, f.file_name, f.status, f.sha256]).sort();
      const keyFor = (lid: unknown, ls: unknown) =>
        sha256(JSON.stringify([RULES_VERSION, row.content_hash, lid ?? null, ls ?? null, fileSig, projSig]));
      const prev = latest.get(Number(row.id));
      if (prev?.content_hash === await keyFor(row.linked_project_id, row.link_source)) continue;
      const rv = reviewPdd(row, fs, projects);
      // Keep the automatic link on the row (never over the PMO's own choice),
      // and key the review on the link as it now stands.
      let lid = row.linked_project_id ?? null, ls = row.link_source ?? null;
      if (row.link_source !== "pmo") {
        const auto = rv.linkSource === "auto" ? rv.linked?.id ?? null : null;
        if (auto !== lid || (auto ? "auto" : null) !== ls) {
          lid = auto; ls = auto ? "auto" : null;
          await rest(`epdd_pdds?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ linked_project_id: lid, link_source: ls }) });
        }
      }
      const key = await keyFor(lid, ls);
      const same = prev && prev.verdict === rv.verdict && prev.summary === rv.summary &&
        prev.model === RULES_VERSION && canon(prev.checks) === canon(rv.checks);
      if (same) {
        await rest(`epdd_reviews?id=eq.${prev!.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ content_hash: key }) });
      } else {
        const r = await rest("epdd_reviews", { method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ pdd_id: row.id, content_hash: key, status: "done", verdict: rv.verdict,
            summary: rv.summary, checks: rv.checks, model: RULES_VERSION, requests_used: 0,
            finished_at: new Date().toISOString() }) });
        if (!r.ok) throw new Error(`save review ${row.id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        done++;
      }
    }
    return done;
  };

  // Redo one PDD's review only (after the PMO links a plan project).
  const body = await req.json().catch(() => ({})) as { review?: number };
  if (body?.review && trigger === "manual") {
    try {
      const n = await runReviews(Number(body.review), Date.now() + 60_000);
      return json({ ok: true, reviewed: n });
    } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) }, 500); }
  }

  // One run at a time.
  const lock = await getState("lock");
  if (lock?.value && Date.now() - Date.parse(lock.value) < LOCK_MS)
    return json({ skipped: "another run is in progress", since: lock.value });
  await setState("lock", new Date().toISOString());

  const runRes = await rest("epdd_sync_runs", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ trigger }) });
  const runId = (await runRes.json().catch(() => [{}]))?.[0]?.id;
  const stats = { listed: 0, new_count: 0, updated_count: 0, details_read: 0, files_stored: 0, files_failed: 0 };
  let reviewed = 0;
  const finish = async (ok: boolean, error: string | null) => {
    if (runId) await rest(`epdd_sync_runs?id=eq.${runId}`, { method: "PATCH",
      body: JSON.stringify({ ...stats, ok, error, finished_at: new Date().toISOString() }) });
    await setState("lock", null);
  };

  try {
    // Credentials from Vault.
    const cr = await rest("rpc/get_epdd_credentials", { method: "POST", body: "{}" });
    const creds = await cr.json().catch(() => null) as { email?: string; password?: string } | null;
    if (!creds?.email || !creds?.password) throw new Error("E-PDD credentials missing in Vault (epdd_email / epdd_password)");

    // Reuse the saved session; sign in again only when it has expired.
    const jar = new Jar((await getState("session"))?.value);
    let manage = jar.m.size ? await epddList(jar, "/manage-pmoform") : null;
    if (!manage) { await epddLogin(jar, creds.email, creds.password); manage = await epddList(jar, "/manage-pmoform"); }
    if (!manage) throw new Error("Manage PMO Form did not return data after signing in");
    const status = await epddList(jar, "/Status-Pdd");
    if (!status) throw new Error("E-PDD Status did not return data");
    await setState("session", jar.dump());

    // Merge the two lists; a PDD waiting in Manage PMO Form wins.
    const incoming = new Map<number, { row: Row; queue: string }>();
    for (const r of status) incoming.set(Number(r.id), { row: r, queue: "status" });
    for (const r of manage) incoming.set(Number(r.id), { row: r, queue: "manage" });
    stats.listed = incoming.size;

    const exRes = await rest("epdd_pdds?select=id,content_hash,source_updated_at,epdd_status,queue,detail_needed");
    const existing = new Map<number, Row>(((await exRes.json()) as Row[]).map(e => [Number(e.id), e]));
    const firstLoad = existing.size === 0;
    const now = new Date().toISOString();

    const inserts: Row[] = [];
    const fileRows: Row[] = [];
    for (const [id, { row, queue }] of incoming) {
      const clean = sanitise(row);
      const pdd = normalise(row);
      const hash = await sha256(JSON.stringify(pdd));
      const statusLabel = text(row.status);
      const actionHref = String(row.action ?? "").match(/href=\\?"([^"\\]+)/)?.[1]?.trim() ?? null;
      const um = clean.user_min as Row;
      const base: Row = {
        pdd_number: text(row.pdd_number) || null,
        project_name: pdd.project_name || null,
        campus: pdd.campus || null,
        initiated_by: text(row.initiatedby) || (um?.name as string) || null,
        initiated_by_designation: (um?.designation as string) ?? null,
        initiated_by_email: (um?.email as string) ?? null,
        project_type: pdd.project_type || null,
        cost_center: pdd.cost_center || null,
        grand_total: pdd.grand_total,
        estimated_total: pdd.estimated_total,
        currency: pdd.currency,
        start_date: pdd.start_date,
        finish_date: pdd.finish_date,
        submitted_on: pdd.date,
        received_at: receivedAt(row.project_receiving),
        epdd_status: statusLabel || null,
        epdd_status_code: row.pmoform_status == null ? null : String(row.pmoform_status),
        queue,
        epdd_url: actionHref ?? `${BASE}/view-approvedpdd/${id}`,
        source_created_at: row.created_at ?? null,
        source_updated_at: row.updated_at ?? null,
        content_hash: hash,
        pdd,
        raw: clean,
        last_synced_at: now,
      };
      for (const s of pdd.file_slots) if (s.file) {
        const g = FILE_GROUPS.find(x => x.key === s.category)!;
        fileRows.push({ pdd_id: id, category: s.category, title: s.title, file_name: s.file,
                        source_url: `${BASE}/public/files/${g.folder}/${encodeURIComponent(s.file)}` });
      }
      const ex = existing.get(id);
      if (!ex) {
        inserts.push({ id, ...base, is_history: firstLoad, detail_needed: true, first_seen_at: now });
        stats.new_count++;
      } else {
        const changed = ex.content_hash !== hash;
        const sameTime = ex.source_updated_at != null && base.source_updated_at != null &&
          Date.parse(String(ex.source_updated_at)) === Date.parse(String(base.source_updated_at));
        const moved = !sameTime || ex.epdd_status !== base.epdd_status || ex.queue !== queue;
        if (!changed && !moved) continue;          // nothing new: leave the row alone
        const patch: Row = { ...base, detail_needed: true };
        if (changed) patch.changed_at = now;
        stats.updated_count++;
        const r = await rest(`epdd_pdds?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
        if (!r.ok) throw new Error(`update PDD ${id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
    }
    if (inserts.length) {
      const r = await rest("epdd_pdds", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(inserts) });
      if (!r.ok) throw new Error(`insert PDDs: ${r.status} ${(await r.text()).slice(0, 300)}`);
    }
    // PDDs no longer listed anywhere (deleted in the E-PDD portal).
    const gone = [...existing.keys()].filter(id => !incoming.has(id) && existing.get(id)!.queue !== "removed");
    if (gone.length) await rest(`epdd_pdds?id=in.(${gone.join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ queue: "removed", last_synced_at: now }) });

    // New attachment slots (existing ones are left alone).
    if (fileRows.length) {
      const r = await rest("epdd_files?on_conflict=pdd_id,category,title,file_name", { method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(fileRows) });
      if (!r.ok) throw new Error(`insert files: ${r.status} ${(await r.text()).slice(0, 300)}`);
    }

    // Detail pages: new PDDs waiting on the PMO first, then the rest.
    const dRes = await rest(`epdd_pdds?detail_needed=eq.true&select=id,epdd_url,queue&order=is_history.asc,first_seen_at.desc&limit=${MAX_DETAILS_PER_RUN}`);
    for (const d of (await dRes.json()) as Row[]) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break;
      const res = await epddGet(jar, String(d.epdd_url), false, 40_000);
      if (res.status !== 200) { await res.body?.cancel(); continue; }
      const v = parseView(await res.text());
      const patch: Row = { approvals: v.approvals, detail_needed: false, detail_synced_at: new Date().toISOString() };
      if (v.su_head) patch.su_head = v.su_head;
      if (v.project_type) patch.project_type = v.project_type;
      await rest(`epdd_pdds?id=eq.${d.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      stats.details_read++;
    }
    await setState("session", jar.dump());

    // Attachments into the private bucket.
    const fRes = await rest(`epdd_files?status=neq.stored&attempts=lt.${MAX_FILE_ATTEMPTS}&select=id,pdd_id,category,file_name,source_url,attempts&order=id.desc&limit=${MAX_FILES_PER_RUN}`);
    for (const f of (await fRes.json()) as Row[]) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break;
      const patch: Row = { attempts: Number(f.attempts) + 1, fetched_at: new Date().toISOString() };
      try {
        const res = await epddGet(jar, String(f.source_url), false, 60_000);
        const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
        if (res.status !== 200) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
        if (ct === "text/html") { await res.body?.cancel(); throw new Error("the E-PDD portal returned a web page, not the file"); }
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > MAX_FILE_BYTES) { await res.body?.cancel(); throw new Error(`file too large (${Math.round(len / 1048576)} MB)`); }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const safe = String(f.file_name).replace(/[^A-Za-z0-9._()-]+/g, "_").slice(-150);
        const path = `${f.pdd_id}/${f.category}/${f.id}_${safe}`;
        const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, { method: "POST",
          headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": ct, "x-upsert": "true" }, body: bytes });
        if (!up.ok) throw new Error(`storage ${up.status}: ${(await up.text()).slice(0, 200)}`);
        Object.assign(patch, { status: "stored", storage_path: path, size_bytes: bytes.length, mime: ct,
                               sha256: await sha256(bytes), error: null });
        stats.files_stored++;
      } catch (e) {
        Object.assign(patch, { status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300) });
        stats.files_failed++;
      }
      await rest(`epdd_files?id=eq.${f.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    }

    // Reviews last: they need the details and files copied above.
    reviewed = await runReviews(null, t0 + TIME_BUDGET_MS + 20_000);

    await finish(true, null);
    return json({ ok: true, trigger, ...stats, reviewed, ms: Date.now() - t0 });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await finish(false, msg);
    return json({ ok: false, error: msg, ...stats }, 500);
  }
});
