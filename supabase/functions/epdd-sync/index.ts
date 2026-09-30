import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { reviewPdd, RULES_VERSION } from "./review.ts";
import { AI_VERSION, callGemini, aiChecks, type AiFile } from "./ai.ts";
import { pmoRecipients, push, mail, log, newPddEmail, healthEmail, toAscii,
         type PddNote, type Ctx } from "./notify.ts";

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

   AI READING (phase 4). After the code checks, up to MAX_AI_PER_RUN PDDs a run
   get one Gemini request each (ai.ts): five judgement questions plus reading the
   quotation files. Stored in epdd_reviews with model "ai-N:<model>", apart from
   the code review ("rules-N"), and never changes the result. Redone only when
   the PDD or its quotation files change. { "ai": <id>, "dry": true } previews
   one PDD without saving; { "ai_run": n } works through up to n now (PMO).
   The scheduled runs do this only while epdd_state 'ai_enabled' is 'on'.

   CHARTER. A PDD waiting in Manage PMO Form carries the E-PDD's own PDF link in
   its row; that PDF is stored as category "charter". Every waiting PDD also gets
   its print page (/pdd-dataprint/{id}, scripts stripped) as "charter_html", so
   the portal can always print it. The 47 PDDs present at launch were printed to
   PDF once, from the same print page.

   NOTIFY (phase 5, notify.ts). A new or resubmitted PDD in Manage PMO Form is
   pushed and emailed to the PMO once its code review is ready (and its AI
   reading, or 15 minutes have passed); epdd_state 'notified' remembers which
   version of each PDD was announced. Three failed runs in a row send one alert
   (epdd_state 'alert'), the next good run one "working again". PMO-only test
   options: { notify_preview: <id> } (no sending), { notify_test: <id> } (push
   and email to the PMO only, no copies, marked [Test]).

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
const MAX_AI_PER_RUN = 3;           // Gemini free tier: 15 requests/min, 500/day, shared with the assistant
const AI_GAP_MS = 4_500;
const AI_RETRY_MS = 30 * 60_000;    // a failed AI reading is retried after this
const CHARTER = new Set(["charter", "charter_html"]);
const NOTIFY_AI_WAIT_MS = 15 * 60_000;  // a new PDD's notice waits this long for its AI reading
const FAILS_BEFORE_ALERT = 3;           // runs in a row (15 minutes)
const pkt = (d: unknown) => new Date(String(d)).toLocaleString("en-GB", { timeZone: "Asia/Karachi",
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

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
    // Charters are the PDD itself, not a submitted attachment: the checks ignore them.
    const files = (await (await rest(`epdd_files?select=pdd_id,category,title,file_name,status,attempts,sha256,error${onlyId ? `&pdd_id=eq.${onlyId}` : ""}`)).json() as Row[])
      .filter(f => !CHARTER.has(String(f.category)));
    const latest = new Map<number, Row>();
    for (const r of await (await rest(`epdd_reviews?select=id,pdd_id,content_hash,verdict,summary,model,checks&model=like.rules-*&order=created_at.desc${onlyId ? `&pdd_id=eq.${onlyId}` : ""}`)).json() as Row[])
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

  // ── AI reading of PDDs (phase 4) ─────────────────────────────────────────
  const QUOTE_RE = /quot|offer|proforma|estimate/i;
  const runAi = async (opts: { onlyId?: number | null; max: number; deadline: number; dry?: boolean; force?: boolean }) => {
    const out: Row[] = [];
    const kr = await rest("rpc/get_gemini_keys", { method: "POST", body: "{}" });
    const keys = ((await kr.json().catch(() => null)) as string[] | null ?? []).filter(Boolean);
    if (!keys.length) return [{ error: "Gemini key missing (get_gemini_keys)" }];
    const pdds = await (await rest(`epdd_pdds?select=id,pdd_number,project_name,project_type,campus,cost_center,grand_total,currency,pdd,content_hash,queue,is_history,first_seen_at&queue=neq.removed${opts.onlyId ? `&id=eq.${opts.onlyId}` : ""}&order=queue.asc,is_history.asc,first_seen_at.desc`)).json() as Row[];
    const files = (await (await rest(`epdd_files?select=pdd_id,category,title,file_name,status,storage_path,mime,sha256,size_bytes${opts.onlyId ? `&pdd_id=eq.${opts.onlyId}` : ""}`)).json() as Row[])
      .filter(f => !CHARTER.has(String(f.category)));
    const latest = new Map<number, Row>();
    for (const r of await (await rest(`epdd_reviews?select=pdd_id,content_hash,status,created_at&model=like.ai-*&order=created_at.desc${opts.onlyId ? `&pdd_id=eq.${opts.onlyId}` : ""}`)).json() as Row[])
      if (!latest.has(Number(r.pdd_id))) latest.set(Number(r.pdd_id), r);
    let calls = 0;
    // Files named in the PDD's own slots are read, quotations first, up to three.
    for (const row of pdds) {
      if (calls >= opts.max || Date.now() > opts.deadline) break;
      const fs = files.filter(f => f.pdd_id === row.id);
      if (fs.some(f => f.status === "pending")) continue;
      const readable = fs.filter(f => f.status === "stored" && /^(application\/pdf|image\/(png|jpe?g|webp))/.test(String(f.mime)));
      const quoteFiles = readable.filter(f => QUOTE_RE.test(String(f.title)) || QUOTE_RE.test(String(f.file_name)))
        .sort((a, b) => Number(QUOTE_RE.test(String(b.title))) - Number(QUOTE_RE.test(String(a.title))));
      const picked: Row[] = []; let bytes = 0;
      for (const f of quoteFiles) {
        if (picked.length >= 3 || picked.some(x => x.sha256 && x.sha256 === f.sha256)) continue;
        if (bytes + Number(f.size_bytes ?? 0) > 14 * 1024 * 1024) continue;
        picked.push(f); bytes += Number(f.size_bytes ?? 0);
      }
      const aiKey = await sha256(JSON.stringify([AI_VERSION, row.content_hash, picked.map(f => f.sha256)]));
      const prev = latest.get(Number(row.id));
      if (!opts.force && prev?.content_hash === aiKey &&
          (prev.status === "done" || Date.now() - Date.parse(String(prev.created_at)) < AI_RETRY_MS)) continue;
      const aiFiles: AiFile[] = [];
      for (const f of picked) {
        const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${f.storage_path}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
        if (r.ok) aiFiles.push({ title: String(f.title), file_name: String(f.file_name).replace(/^\d+_/, ""), mime: String(f.mime),
                                 bytes: new Uint8Array(await r.arrayBuffer()) });
      }
      if (calls > 0) await new Promise(res => setTimeout(res, AI_GAP_MS));
      calls++;
      const res = await callGemini(keys, row, aiFiles);
      let record: Row;
      if (res.ok) {
        const { checks, dropped } = aiChecks(row, res.data, aiFiles);
        if (dropped.length) checks.push({ id: "ai_dropped", group: "AI reading", label: "Readings ignored", status: "info",
          detail: "Some of the model's answers quoted text that is not in the PDD, so they were not used.", items: dropped });
        const warns = checks.filter(c => c.status === "warn").length;
        record = { pdd_id: row.id, content_hash: aiKey, status: "done", verdict: null, model: `${AI_VERSION}:${res.model}`,
          summary: warns ? `The AI reading raises ${warns} point${warns === 1 ? "" : "s"} to look at.` : "The AI reading raises nothing further.",
          checks, requests_used: 1, finished_at: new Date().toISOString() };
      } else {
        record = { pdd_id: row.id, content_hash: aiKey, status: "failed", verdict: null, model: AI_VERSION,
          summary: "The AI reading could not be done this time; it will be retried.", checks: [], requests_used: 1,
          error: res.error, finished_at: new Date().toISOString() };
      }
      out.push({ id: row.id, pdd: row.pdd_number, files: aiFiles.map(f => f.title), ...(opts.dry ? { record, raw: res.ok ? res.data : null } : { status: record.status, summary: record.summary, error: record.error }) });
      if (!opts.dry) {
        const w = await rest("epdd_reviews", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record) });
        if (!w.ok) throw new Error(`save AI reading ${row.id}: ${w.status} ${(await w.text()).slice(0, 200)}`);
      }
    }
    return out;
  };

  // ── Telling the PMO (phase 5) ────────────────────────────────────────────
  const ctx: Ctx = { SUPA, SVC, rest };
  const buildNotes = async (rows: Row[]): Promise<PddNote[]> => {
    if (!rows.length) return [];
    const ids = rows.map(r => r.id).join(",");
    const code = new Map<number, Row>(), ai = new Map<number, Row>();
    for (const r of await (await rest(`epdd_reviews?select=pdd_id,model,verdict,summary,checks,created_at&status=eq.done&pdd_id=in.(${ids})&order=created_at.desc`)).json() as Row[]) {
      const m = /^ai-/.test(String(r.model)) ? ai : code;
      if (!m.has(Number(r.pdd_id))) m.set(Number(r.pdd_id), r);
    }
    return rows.map(p => {
      const c = code.get(Number(p.id)), a = ai.get(Number(p.id));
      const cc = (c?.checks as Row[]) || [], ac = (a?.checks as Row[]) || [];
      return {
        id: Number(p.id), pdd_number: String(p.pdd_number ?? p.id), project_name: String(p.project_name ?? ""),
        campus: String(p.campus ?? "No campus"), project_type: String(p.project_type ?? "Type not given"),
        currency: String(p.currency ?? "PKR"), grand_total: p.grand_total, initiated_by: String(p.initiated_by ?? "-"),
        epdd_url: String(p.epdd_url ?? BASE), resubmitted: !!p.changed_at,
        verdict: (c?.verdict as string) ?? null, summary: String(c?.summary ?? "The checks are still running."),
        toFix: cc.filter(x => x.status === "fail").map(x => String(x.label)),
        toLook: [...cc, ...ac].filter(x => x.status === "warn").map(x => String(x.label)),
        ai: a ? String(a.summary ?? "") : null,
      };
    });
  };
  const PDD_COLS = "id,pdd_number,project_name,campus,project_type,currency,grand_total,initiated_by,epdd_url,content_hash,first_seen_at,changed_at,queue,is_history";

  // test: send to the PMO only (no copies), never touches what was announced.
  const runNotify = async (test?: { id: number; send: boolean }) => {
    const notified = JSON.parse((await getState("notified"))?.value || "{}") as Record<string, string>;
    const rows = await (await rest(test ? `epdd_pdds?select=${PDD_COLS}&id=eq.${test.id}`
      : `epdd_pdds?select=${PDD_COLS}&queue=eq.manage&is_history=eq.false`)).json() as Row[];
    const aiOn = (await getState("ai_enabled"))?.value === "on";
    const due: Row[] = [];
    for (const p of rows) {
      if (!test && notified[String(p.id)] === p.content_hash) continue;
      const fs = await (await rest(`epdd_files?select=status,attempts,category&pdd_id=eq.${p.id}`)).json() as Row[];
      const copying = fs.some(f => !CHARTER.has(String(f.category)) && (f.status === "pending" || (f.status === "failed" && Number(f.attempts) < MAX_FILE_ATTEMPTS)));
      if (!test && copying) continue;                                     // files still coming: the review isn't final
      const arrived = Date.parse(String(p.changed_at ?? p.first_seen_at));
      if (!test && aiOn && Date.now() - arrived < NOTIFY_AI_WAIT_MS) {
        const ai = await (await rest(`epdd_reviews?select=created_at&pdd_id=eq.${p.id}&model=like.ai-*&status=eq.done&order=created_at.desc&limit=1`)).json() as Row[];
        if (!ai[0] || Date.parse(String(ai[0].created_at)) < arrived) continue;   // wait for the AI reading
      }
      const code = await (await rest(`epdd_reviews?select=id&pdd_id=eq.${p.id}&model=like.rules-*&limit=1`)).json() as Row[];
      if (!test && !code.length) continue;
      due.push(p);
    }
    if (!due.length) return { notified: 0 };
    const notes = await buildNotes(due);
    const to = await pmoRecipients(ctx);
    if (test && !test.send) return { preview: newPddEmail(to[0]?.name ?? "PMO", notes), recipients: to.map(r => r.email) };
    const logs: Row[] = [];
    for (const n of notes) {
      const pr = await push(ctx, to.map(r => r.id), {
        title: `${test ? "[Test] " : ""}${n.resubmitted ? "Resubmitted" : "New"} PDD: ${n.pdd_number}`,
        body: `${n.project_name} - ${n.verdict === "needs_changes" ? "needs changes" : n.verdict === "ready" ? "ready for decision" : "checking"}`,
        tag: `epdd-${n.id}`, url: `./?review=${n.id}` });
      logs.push({ channel: "epdd-push", status: (pr as Row)?.sent ? "sent" : "skipped", detail: `${n.pdd_number}${test ? " test" : ""}; ${JSON.stringify(pr).slice(0, 200)}` });
    }
    for (const r of to) {
      const m = newPddEmail(r.name, notes);
      const [res] = await mail([r], `${test ? "[Test] " : ""}${m.subject}`, m.text, m.html, !test);
      logs.push({ recipient_id: r.id, recipient_address: r.email, channel: "epdd-email", status: res.ok ? "sent" : "failed",
        detail: res.ok ? `${notes.map(n => n.pdd_number).join(",")}${test ? " test" : ""}; cc=${res.cc}` : res.error });
    }
    if (!to.length) logs.push({ channel: "epdd-email", status: "skipped", detail: "no active PMO users with email notifications on" });
    await log(ctx, logs);
    if (!test) {
      for (const p of due) notified[String(p.id)] = String(p.content_hash);
      await setState("notified", JSON.stringify(notified));
    }
    return { notified: notes.length, logs: logs.map(l => `${l.channel}:${l.status}`) };
  };

  const runHealth = async (ok: boolean, error: string | null) => {
    const alert = await getState("alert");
    let down: boolean | null = null, since = "", detail = error ?? "";
    if (ok && alert?.value) { down = false; since = pkt(new Date()); }
    if (!ok && !alert?.value) {
      const runs = await (await rest(`epdd_sync_runs?select=ok,error,started_at&finished_at=not.is.null&order=started_at.desc&limit=${FAILS_BEFORE_ALERT}`)).json() as Row[];
      if (runs.length === FAILS_BEFORE_ALERT && runs.every(r => r.ok === false)) {
        down = true; since = pkt(runs[runs.length - 1].started_at); detail = String(runs[0].error ?? detail);
      }
    }
    if (down === null) return;
    const to = await pmoRecipients(ctx);
    const logs: Row[] = [];
    const pr = await push(ctx, to.map(r => r.id), { title: down ? "E-PDD check failing" : "E-PDD check working again",
      body: down ? `New PDDs are not reaching PMO Review since ${since}.` : "PMO Review is up to date again.", tag: "epdd-health", url: "./" });
    logs.push({ channel: "epdd-health-push", status: (pr as Row)?.sent ? "sent" : "skipped", detail: JSON.stringify(pr).slice(0, 200) });
    for (const r of to) {
      const m = healthEmail(r.name, down, toAscii(detail).slice(0, 300), since);
      const [res] = await mail([r], m.subject, m.text, m.html);
      logs.push({ recipient_id: r.id, recipient_address: r.email, channel: "epdd-health-email", status: res.ok ? "sent" : "failed",
        detail: res.ok ? `${down ? "down" : "up"}; cc=${res.cc}` : res.error });
    }
    await log(ctx, logs);
    await setState("alert", down ? new Date().toISOString() : null);
  };

  // Manual one-offs for the PMO: redo one review, preview/run the AI reading.
  const body = await req.json().catch(() => ({})) as { review?: number; ai?: number; dry?: boolean; ai_run?: number;
    notify_preview?: number; notify_test?: number };
  if (trigger === "manual" && (body?.review || body?.ai || body?.ai_run || body?.notify_preview || body?.notify_test)) {
    try {
      if (body.notify_preview) return json({ ok: true, ...(await runNotify({ id: Number(body.notify_preview), send: false })) });
      if (body.notify_test) return json({ ok: true, ...(await runNotify({ id: Number(body.notify_test), send: true })) });
      if (body.review) return json({ ok: true, reviewed: await runReviews(Number(body.review), Date.now() + 60_000) });
      if (body.ai) return json({ ok: true, ai: await runAi({ onlyId: Number(body.ai), max: 1, deadline: Date.now() + 60_000, dry: !!body.dry, force: true }) });
      return json({ ok: true, ai: await runAi({ max: Math.min(8, Number(body.ai_run) || 1), deadline: Date.now() + 75_000 }) });
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
      // The charter: the E-PDD's own PDF (its Print/Download link, only on rows
      // waiting in Manage PMO Form) and, always for those rows, the print page.
      if (queue === "manage") {
        const links = [...String(row.action ?? "").matchAll(/href=\\?"([^"\\]+)/g)].map(m => m[1].trim());
        const pdfLink = links.find(h => /downloadpdfpdd|\.pdf(\?|$)/i.test(h));
        const name = String(base.pdd_number || id);
        if (pdfLink) fileRows.push({ pdd_id: id, category: "charter", title: "PDD charter (PDF)", file_name: `${name}.pdf`,
                                     source_url: pdfLink.startsWith("http") ? pdfLink : BASE + pdfLink });
        fileRows.push({ pdd_id: id, category: "charter_html", title: "PDD print page", file_name: `${name}.html`,
                        source_url: `${BASE}/pdd-dataprint/${id}` });
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
        if (changed) {
          patch.changed_at = now;
          // A resubmission changes the charter: fetch the E-PDD's PDF and print page again,
          // and label a PDF printed from the old version as such.
          await rest(`epdd_files?pdd_id=eq.${id}&or=(category.eq.charter_html,and(category.eq.charter,source_url.like.*downloadpdfpdd*))`,
            { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "pending", attempts: 0 }) });
          await rest(`epdd_files?pdd_id=eq.${id}&category=eq.charter&source_url=like.*pdd-dataprint*`,
            { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ title: "PDD charter (PDF, earlier version)" }) });
        }
        // Back in Manage PMO Form with new content (a resubmission), or returned there from
        // another queue: it is new work for the PMO, so it counts as unread again (badge,
        // push and email), even if it was one of the PDDs present at launch.
        if (queue === "manage" && (changed || ex.queue !== "manage")) {
          patch.seen_at = null; patch.seen_by = null; patch.is_history = false;
          if (!changed) patch.changed_at = now;
        }
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
    const fRes = await rest(`epdd_files?status=neq.stored&attempts=lt.${MAX_FILE_ATTEMPTS}&select=id,pdd_id,category,title,file_name,source_url,attempts&order=id.desc&limit=${MAX_FILES_PER_RUN}`);
    for (const f of (await fRes.json()) as Row[]) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break;
      const patch: Row = { attempts: Number(f.attempts) + 1, fetched_at: new Date().toISOString() };
      try {
        const res = await epddGet(jar, String(f.source_url), false, 60_000);
        const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
        if (res.status !== 200) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
        const isPrint = f.category === "charter_html";
        if (ct === "text/html" && !isPrint) { await res.body?.cancel(); throw new Error("the E-PDD portal returned a web page, not the file"); }
        if (isPrint && ct !== "text/html") { await res.body?.cancel(); throw new Error(`print page came back as ${ct}`); }
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > MAX_FILE_BYTES) { await res.body?.cancel(); throw new Error(`file too large (${Math.round(len / 1048576)} MB)`); }
        // The print page prints itself on load; keep the page, drop its scripts.
        const bytes = isPrint
          ? new TextEncoder().encode((await res.text()).replace(/<script[\s\S]*?<\/script>/gi, ""))
          : new Uint8Array(await res.arrayBuffer());
        if (isPrint && !/PROJECT DESCRIPTION DOCUMENT/i.test(new TextDecoder().decode(bytes))) throw new Error("print page did not contain the PDD (signed out?)");
        const safe = String(f.file_name).replace(/[^A-Za-z0-9._()-]+/g, "_").slice(-150);
        const path = `${f.pdd_id}/${f.category}/${f.id}_${safe}`;
        const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, { method: "POST",
          headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": isPrint ? "text/html; charset=utf-8" : ct, "x-upsert": "true" }, body: bytes });
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
    // Then the AI reading, a few PDDs a run, waiting PDDs first.
    // A run is cut off at 150 s, so no new AI request starts after 70 s (each is capped at 55 s).
    // Switched on and off by epdd_state 'ai_enabled' ('on'), so it can be paused without a deploy.
    const aiOn = (await getState("ai_enabled"))?.value === "on";
    const ai = aiOn ? await runAi({ max: MAX_AI_PER_RUN, deadline: t0 + 70_000 }).catch(e => [{ error: String(e) }]) : [];

    // Then tell the PMO about anything new. A failure here never fails the run.
    const note = await runNotify().catch(e => ({ error: String((e as Error)?.message ?? e).slice(0, 200) }));

    await finish(true, null);
    await runHealth(true, null).catch(() => null);
    return json({ ok: true, trigger, ...stats, reviewed, ai: ai.length, notify: note, ms: Date.now() - t0 });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await finish(false, msg);
    await runHealth(false, msg).catch(() => null);
    return json({ ok: false, error: msg, ...stats }, 500);
  }
});
