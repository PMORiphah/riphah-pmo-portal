#!/usr/bin/env node
// PMO Simulation: end-to-end check of the synthetic backend (src/sim/backend.js) in the real App.
//
//   node scripts/sim/backend-test.mjs [--work <dir>] [--no-build] [--real-simroot] [--headed]
//                                     [--playwright <path to playwright's index.js>] [--shots <dir>]
//                                     [--unit-only]
//
// First, in a separate Node process (--unit-only runs only this), about 60 contract checks of the
// backend on its own: PostgREST reads, filters, embeds, order, counts, writes and their refusals,
// RPCs, storage, functions, auth, snapshot/restore/reset and the synthetic session.
//
// Then, all outside the repo:
//   1. copies the repo (without node_modules, .git, dist*) to <work>/app and links node_modules;
//   2. unless --real-simroot, writes a stub src/sim/SimRoot.jsx there that mounts the App straight
//      away (the backend is what is tested here, not the director);
//   3. builds the preview (./build.sh --config vite.config.preview.js), which also writes
//      simulation.html (CSP first, sim-boot.js, the self-hosted fonts);
//   4. serves <work>/app/dist-preview at /riphah-pmo-portal/preview/ on 127.0.0.1;
//   5. opens simulation.html in Chromium, presses "Run with sample names" (fictional cast and the
//      sample illustrations, no real names), and visits every PMO page, every tab of three
//      projects, Campus Compare (both modes), the Assign PM preview, a Board report, a past
//      project, an Updates thread, the Gallery lightbox, a PMO Review PDD, the notifications drawer,
//      global search and the assistant;
//   6. passes only with 0 calls the backend did not recognise, 0 requests leaving the page's own
//      origin, 0 console errors and 0 page errors, and every step completed.
// It never contacts Supabase or any other site. Exit code 0 = pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const WORK = path.resolve(opt("--work", process.env.SIM_TEST_DIR || path.join(os.tmpdir(), "pmo-sim-backend-test")));
const APP = path.join(WORK, "app");
const SHOTS = opt("--shots", null);
const BASE = "/riphah-pmo-portal/preview/";
const PW = opt("--playwright", process.env.SIM_PLAYWRIGHT || null);

const log = (...a) => console.log("[backend-test]", ...a);
const die = (msg) => { console.error("[backend-test] " + msg); process.exit(2); };

// ── 0: contract checks in Node (child process: browser-like globals stay out of this one) ──────
async function unitChecks() {
  const results = [];
  const check = (name, cond, info = "") => { results.push({ name, ok: !!cond, info: cond ? "" : String(info).slice(0, 200) }); };
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(), get length() { return m.size; } }; };
  globalThis.window = globalThis;
  globalThis.location = new URL("http://127.0.0.1:9/riphah-pmo-portal/preview/simulation.html");
  globalThis.sessionStorage = mem(); globalThis.localStorage = mem();
  const sameSite = [];
  // The only "real" fetch here: anything the backend passes through must be this page's own address.
  window.fetch = async (u) => { sameSite.push(String(u)); return new Response("same-site", { status: 200 }); };
  const { resolveTokens } = await import(path.join(REPO, "src/sim/data/tokens.js"));
  const seed = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/seed.json"), "utf8"));
  const cast = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/sample-cast.json"), "utf8"));
  const store = resolveTokens(seed, cast);
  const M = store.meta || {};
  const B = await import(path.join(REPO, "src/sim/backend.js"));
  const un = [];
  const be = B.installBackend({ store, mediaUrls: { m01: "blob:http://127.0.0.1:9/media-1" }, onUnhandled: (i) => un.push(i) });
  const sess = B.prepareSession(store);
  const SB = "https://prmxkecomqqngvrmytcj.supabase.co";
  const H = { apikey: "anon", Authorization: "Bearer " + sess.access_token, "Content-Type": "application/json" };
  const call = async (method, p, body, h = {}) => {
    const r = await fetch(SB + p, { method, headers: { ...H, ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let b = t; try { b = t ? JSON.parse(t) : null; } catch { /* text */ }
    return { s: r.status, b, cr: r.headers.get("content-range") };
  };
  const get = (p, h) => call("GET", p, undefined, h);
  const T = store.tables;
  const capex = T.projects.filter((x) => x.portfolio === "capex");

  // session
  const raw = JSON.parse(sessionStorage.getItem("pmo_session") || "null");
  const now = Math.floor(Date.now() / 1000);
  check("session: written to sessionStorage as the PMO", raw && raw.role === "pmo" && raw.user_id === sess.user_id && !raw.remember);
  check("session: expires within 8 h (renewal timer stays far below 2^31 ms)", raw && raw.expires_at > now + 3600 && raw.expires_at <= now + 8 * 3600 + 5);
  check("session: nothing left in localStorage", localStorage.getItem("pmo_session") === null);

  // reads
  let r = await get("/rest/v1/projects?portfolio=eq.capex&select=id");
  check("GET filter eq", r.s === 200 && r.b.length === capex.length, r.b && r.b.length);
  r = await get("/rest/v1/user_profiles?select=username,role&order=role.asc,username.asc");
  const rk = { pmo: 0, project_manager: 1, guest: 2 };
  check("order: role enum order pmo < project_manager < guest", r.s === 200 && r.b.every((u, i) => i === 0 || rk[u.role] >= rk[r.b[i - 1].role]) && r.b[0].role === "pmo");
  r = await get("/rest/v1/projects?portfolio=eq.capex&select=code,df_recommended_amount&order=df_recommended_amount.desc.nullslast,code.asc&limit=5");
  check("order: numeric desc + limit", r.s === 200 && r.b.length === 5 && r.b.every((x, i) => i === 0 || (x.df_recommended_amount ?? -1) <= (r.b[i - 1].df_recommended_amount ?? -1)));
  r = await get("/rest/v1/project_assignments?select=user_id,project_id,projects(code,name)&limit=3");
  check("embed many-to-one (projects)", r.s === 200 && r.b.length === 3 && r.b.every((x) => x.projects && x.projects.code));
  r = await get("/rest/v1/comments?select=id,author_role,user_profiles!comments_author_id_fkey(role)&order=created_at.desc&limit=3");
  check("embed with fkey hint", r.s === 200 && r.b.every((x) => x.user_profiles && x.user_profiles.role));
  r = await get(`/rest/v1/projects?id=eq.${M.storyProjectId}&select=id,project_attachments(count)`);
  const nAtt = T.project_attachments.filter((a) => a.project_id === M.storyProjectId).length;
  check("embed count", r.s === 200 && r.b[0].project_attachments[0].count === nAtt, JSON.stringify(r.b));
  r = await get(`/rest/v1/projects?id=eq.${M.storyProjectId}&select=id,project_tasks(id,name)&project_tasks.order=sort_order.asc&project_tasks.limit=2`);
  check("embed one-to-many with order/limit", r.s === 200 && r.b[0].project_tasks.length === 2);
  r = await get("/rest/v1/project_attachments?select=id,projects!inner(campus)&projects.campus=eq.__nowhere__");
  check("embed !inner filters the parent", r.s === 200 && r.b.length === 0);
  r = await get(`/rest/v1/projects?id=eq.${M.storyProjectId}&select=id,name,cost_centers(name)`, { Accept: "application/vnd.pgrst.object+json" });
  check("single object Accept", r.s === 200 && r.b && !Array.isArray(r.b) && r.b.id === M.storyProjectId);
  r = await get("/rest/v1/projects?select=id", { Accept: "application/vnd.pgrst.object+json" });
  check("single object with many rows → 406 PGRST116", r.s === 406 && r.b.code === "PGRST116");
  r = await get("/rest/v1/projects?select=id", { Prefer: "count=exact", Range: "0-4" });
  check("Range + count=exact → Content-Range", r.s === 200 && r.b.length === 5 && r.cr === `0-4/${T.projects.length}`, r.cr);
  r = await call("HEAD", "/rest/v1/projects?select=id", undefined, { Prefer: "count=exact" });
  check("HEAD with count", r.s === 200 && !r.b && r.cr && r.cr.endsWith("/" + T.projects.length), r.cr);
  r = await get("/rest/v1/projects?select=id,workflow_stage&or=(workflow_stage.eq.mt_review,workflow_stage.eq.ed_review)");
  check("or=(…)", r.s === 200 && r.b.length === T.projects.filter((x) => ["mt_review", "ed_review"].includes(x.workflow_stage)).length && r.b.every((x) => ["mt_review", "ed_review"].includes(x.workflow_stage)));
  r = await get("/rest/v1/projects?select=id&workflow_stage=not.in.(pdd_not_submitted,approved)");
  check("not.in", r.s === 200 && r.b.length === T.projects.filter((x) => !["pdd_not_submitted", "approved"].includes(x.workflow_stage)).length);
  r = await get(`/rest/v1/projects?select=name&name=ilike.*${encodeURIComponent(String(M.storySearch || "").toLowerCase())}*`);
  check("ilike", r.s === 200 && r.b.length >= 1 && r.b.some((x) => x.name === M.storyProjectName), JSON.stringify(r.b).slice(0, 120));
  r = await get("/rest/v1/projects?select=id&actual_end_date=is.null");
  check("is.null", r.s === 200 && r.b.length === T.projects.filter((x) => x.actual_end_date == null).length);
  r = await get("/rest/v1/projects?select=id&amount_released=gt.0");
  check("gt on numbers", r.s === 200 && r.b.length === T.projects.filter((x) => Number(x.amount_released) > 0).length);
  r = await get("/rest/v1/activity_log?select=created_at&created_at=gte.2026-10-01T00:00:00&order=created_at.desc");
  check("gte on timestamps", r.s === 200 && r.b.every((x) => x.created_at >= "2026-10-01"));
  r = await get("/rest/v1/settings?select=key,value&key=in.(dashboard_kpis,team_config)");
  check("in.(…)", r.s === 200 && r.b.length >= 1 && r.b.every((x) => ["dashboard_kpis", "team_config"].includes(x.key)));
  r = await get("/rest/v1/board_reports?select=id,label:figures->>period&order=period.desc&limit=1");
  check("alias + JSON path", r.s === 200 && r.b.length === 1 && "label" in r.b[0]);
  for (const v of ["portfolio_dashboard", "project_metrics", "investment_metrics", "project_risks_scored", "past_project_summary"]) {
    r = await get(`/rest/v1/${v}?select=*`);
    check(`view ${v} served`, r.s === 200 && r.b.length === (T[v] || []).length && r.b.length > 0);
  }
  for (const v of ["at_risk_projects", "pdd_pending_projects"]) {
    r = await get(`/rest/v1/${v}?select=*`);
    check(`view ${v} always empty (no sign-in pop-ups)`, r.s === 200 && Array.isArray(r.b) && r.b.length === 0);
  }
  r = await get("/rest/v1/epdd_state?select=*");
  check("backend-only table reads as empty", r.s === 200 && r.b.length === 0);
  const unBefore = un.length;
  r = await get("/rest/v1/no_such_table?select=*");
  check("unknown table → 501 and reported", r.s === 501 && un.length === unBefore + 1 && r.b.message === B.MSG.NA);

  // RPCs
  r = await call("POST", "/rest/v1/rpc/session_start", {});
  check("rpc session_start → null (nothing logged)", r.s === 200 && r.b === null);
  r = await call("POST", "/rest/v1/rpc/is_past_viewer", {});
  check("rpc is_past_viewer", r.s === 200 && r.b === false);
  r = await call("POST", "/rest/v1/rpc/project_has_deliverables", { p: M.storyProjectId });
  check("rpc project_has_deliverables (story)", r.s === 200 && r.b === true);
  r = await call("POST", "/rest/v1/rpc/resolve_login_email", { p_username: "pmo" });
  check("rpc resolve_login_email → null", r.s === 200 && r.b === null);
  r = await call("POST", "/rest/v1/rpc/get_gemini_keys", {});
  check("unknown rpc → 501", r.s === 501);

  // writes kept in memory
  const snap0 = be.snapshot();
  const reply = M.updatesStoryReplyId || T.comments[0].id;
  const P = { Prefer: "resolution=ignore-duplicates,return=minimal" };
  r = await call("POST", "/rest/v1/comment_reads", [{ user_id: sess.user_id, comment_id: reply }], P);
  const r2 = await call("POST", "/rest/v1/comment_reads", [{ user_id: sess.user_id, comment_id: reply }], P);
  const reads = await get("/rest/v1/comment_reads?select=comment_id");
  check("insert comment_reads; duplicate ignored", r.s === 201 && r2.s === 201 && reads.b.length === 1);
  r = await call("POST", "/rest/v1/comment_reads", [{ user_id: sess.user_id, comment_id: reply }], { Prefer: "return=minimal" });
  check("duplicate without resolution → 409", r.s === 409 && r.b.code === "23505");
  r = await call("PATCH", `/rest/v1/comments?project_id=eq.${M.updatesStoryProjectId}&is_read_by_pmo=eq.false`, { is_read_by_pmo: true }, { Prefer: "return=representation" });
  check("PATCH with representation", r.s === 200 && Array.isArray(r.b) && r.b.every((x) => x.is_read_by_pmo === true));
  r = await call("POST", "/rest/v1/past_chat_reads?on_conflict=user_id,thread", { user_id: sess.user_id, thread: "project:x", read_at: "2026-10-15T05:00:00Z" }, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const r3 = await call("POST", "/rest/v1/past_chat_reads?on_conflict=user_id,thread", { user_id: sess.user_id, thread: "project:x", read_at: "2026-10-15T06:00:00Z" }, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const pr = (await get("/rest/v1/past_chat_reads?thread=eq.project:x&select=read_at")).b;
  check("upsert merge-duplicates on (user_id, thread)", r.s === 201 && r3.s === 201 && pr.length === 1 && pr[0].read_at === "2026-10-15T06:00:00Z");
  r = await call("POST", "/rest/v1/comments?select=id,body,is_read_by_pmo", { project_id: M.storyProjectId, body: "note", author_id: sess.user_id, author_role: "pmo" }, { Prefer: "return=representation" });
  const cid = r.b && r.b[0] && r.b[0].id;
  check("POST with representation: id and defaults", r.s === 201 && cid && r.b[0].is_read_by_pmo === false);
  await call("POST", "/rest/v1/comments", { project_id: M.storyProjectId, body: "reply", parent_id: cid, author_id: sess.user_id, author_role: "pmo" }, { Prefer: "return=minimal" });
  r = await call("DELETE", `/rest/v1/comments?id=eq.${cid}`, undefined, { Prefer: "return=minimal" });
  check("DELETE cascades to replies", r.s === 204 && !T.comments.some((c) => c.id === cid || c.parent_id === cid));
  const past = T.past_projects.find((x) => x.id === M.storyPastId) || T.past_projects[0];
  await call("POST", "/rest/v1/past_project_updates", { past_project_id: past.id, body: "chase", author_id: sess.user_id, author_role: "pmo" }, { Prefer: "return=minimal" });
  const sum = (await get(`/rest/v1/past_project_summary?id=eq.${past.id}&select=update_count,last_update_role`)).b[0];
  check("past follow-up updates past_project_summary", sum && sum.last_update_role === "pmo" && sum.update_count === T.past_project_updates.filter((u) => u.past_project_id === past.id).length, JSON.stringify(sum));
  await call("POST", "/rest/v1/lessons_learned", { project_id: M.storyProjectId, title: "A lesson", category: "process" }, { Prefer: "return=minimal" });
  r = await get(`/rest/v1/lessons_learned_full?project_id=eq.${M.storyProjectId}&select=*`);
  check("lessons_learned_full follows its base table", r.s === 200 && r.b.length === 1 && r.b[0].project_name === M.storyProjectName);

  // refused: nothing from this computer comes in
  const ref0 = be.stats().refusedCount;
  const refusedCalls = [
    ["POST", "/rest/v1/snapshots", { label: "pre_import" }],
    ["DELETE", "/rest/v1/projects?id=not.is.null", undefined],
    ["POST", "/rest/v1/projects", [{ name: "x" }, { name: "y" }]],
    ["POST", "/rest/v1/past_projects", [{ name: "x" }]],
    ["POST", "/rest/v1/project_tasks", { project_id: M.storyProjectId, name: "n" }, { Prefer: "return=representation" }],
    ["DELETE", "/rest/v1/project_tasks?project_id=eq." + M.storyProjectId, undefined],
    ["POST", "/rest/v1/user_profiles", { username: "x" }],
    ["PATCH", "/rest/v1/projects", { name: "everything" }],
    ["POST", "/storage/v1/object/project-attachments/x/y.pdf", undefined],
    ["PATCH", `/rest/v1/user_profiles?id=eq.${T.user_profiles.find((u) => u.role === "project_manager").id}`, { is_active: false }],
    ["PATCH", `/rest/v1/past_projects?id=eq.${M.storyPastId}`, { code: "X", name: "Y", campus: "Z", fiscal_year: "FY 24-25", approved_amount: 1, released_amount: 1, pm_user_id: null, status: "open", reason_open: null }],
  ];
  for (const [m, p, b, h] of refusedCalls) {
    r = await call(m, p, b, h || {});
    check(`refused: ${m} ${p.slice(0, 50)}`, r.s === 403 || r.s === 400, `${r.s} ${JSON.stringify(r.b).slice(0, 100)}`);
  }
  check("refusals are counted", be.stats().refusedCount - ref0 >= refusedCalls.length - 1);
  r = await call("PATCH", `/rest/v1/past_projects?id=eq.${M.storyPastId}`, { reason_open: "Waiting for the vendor", status: "open" }, { Prefer: "return=minimal" });
  r = await call("PATCH", `/rest/v1/user_profiles?id=eq.${sess.user_id}`, { tutorial_last_step: 3 }, { Prefer: "return=minimal" });
  check("the PMO's own profile preferences still change", r.s === 204);
  check("small past-project change still kept in memory", r.s === 204 && T.past_projects.find((x) => x.id === M.storyPastId)?.reason_open === "Waiting for the vendor");

  // storage
  const doc = T.project_attachments.find((a) => !/^sim-media\//.test(a.file_path));
  r = await call("POST", "/storage/v1/object/sign/project-attachments/" + doc.file_path.split("/").map(encodeURIComponent).join("/"), { expiresIn: 60 });
  check("sign a fictional document → same-site path", r.s === 200 && /^\/sim\/files\//.test(r.b.signedURL), JSON.stringify(r.b));
  r = await call("POST", "/storage/v1/object/sign/project-attachments/sim-media/m01", { expiresIn: 60 });
  check("sign handed-over media → blob:", r.s === 200 && r.b.signedURL === "blob:http://127.0.0.1:9/media-1");
  r = await call("POST", "/storage/v1/object/sign/project-attachments", { paths: [doc.file_path, "nope.pdf"], expiresIn: 60 });
  check("batch sign", r.s === 200 && r.b.length === 2 && r.b[0].signedURL && r.b[1].error);
  r = await call("POST", "/storage/v1/object/sign/project-attachments/nope.pdf", { expiresIn: 60 });
  check("sign unknown file → 400 with a plain message", r.s === 400 && r.b.error === B.MSG.NO_FILE);
  r = await call("POST", "/storage/v1/object/sign/avatars/x.png", { expiresIn: 60 });
  check("other bucket refused", r.s === 400);
  const ss0 = sameSite.length;
  r = await get("/storage/v1/object/project-attachments/" + doc.file_path);
  check("GET object → this page's own file", r.s === 200 && sameSite.length === ss0 + 1 && sameSite[ss0].startsWith(location.origin + "/sim/files/"), sameSite[ss0]);

  // functions
  r = await call("POST", "/functions/v1/ask", { question: "Where do we stand overall?" });
  check("ask answers locally", r.s === 200 && typeof r.b.answer === "string" && r.b.answer.length > 0);
  for (const f of ["notify-comment", "notify-past", "board-report-notify", "send-push", "send-deadline-email", "send-welcome-email", "send-pdd-reminders"]) {
    r = await call("POST", "/functions/v1/" + f, {});
    check(`${f} → not sent`, r.s === 403 && r.b.ok === false && r.b.simulated === true && r.b.error === B.MSG.NOT_SENT);
  }
  for (const f of ["invite-user", "reset-user-password", "delete-user", "epdd-sync", "deliverables-extract", "webauthn"]) {
    r = await call("POST", "/functions/v1/" + f + (f === "epdd-sync" ? "?forceFunctionRegion=ap-southeast-1" : ""), {});
    check(`${f} → refused with a message`, r.s === 403 && r.b.simulated === true && typeof r.b.error === "string");
  }
  r = await call("POST", "/functions/v1/zzz", {});
  check("unknown function → 501", r.s === 501);

  // auth
  r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: sess.refresh_token });
  check("auth refresh → synthetic tokens", r.s === 200 && /^sim-access\./.test(r.b.access_token) && r.b.expires_at > now);
  r = await call("POST", "/auth/v1/token?grant_type=password", { email: "a@b", password: "x" });
  check("auth password grant refused", r.s === 400 && /simulation/i.test(r.b.error_description));
  r = await get("/auth/v1/user");
  check("auth user", r.s === 200 && r.b.id === sess.user_id);
  r = await call("PUT", "/auth/v1/user", { password: "x" });
  check("password change refused", r.s === 422);
  r = await call("POST", "/auth/v1/recover", { email: "a@b" });
  check("recover refused", r.s === 400);
  r = await call("POST", "/auth/v1/logout?scope=local");
  check("logout", r.s === 204);

  // other sites
  const out0 = be.stats().outsideCount;
  const ex = await fetch("https://example.com/x");
  check("another site → 501, reported, never fetched", ex.status === 501 && be.stats().outsideCount === out0 + 1 && !sameSite.some((u) => u.includes("example.com")));
  const own = await fetch(location.origin + "/riphah-pmo-portal/preview/sim/files/x.pdf");
  check("this page's own files go through", own.status === 200);
  if (typeof WebSocket === "function") {
    let threw = false; let ws;
    try { ws = new WebSocket("wss://prmxkecomqqngvrmytcj.supabase.co/realtime/v1/websocket"); } catch { threw = true; }
    check("realtime socket: quiet, never connects", !threw && ws && ws.readyState === 0);
    try { ws?.close(); } catch { /* ignore */ }
  }

  // checkpoints
  const before = T.comments.length;
  await call("POST", "/rest/v1/comments", { project_id: M.storyProjectId, body: "x", author_id: sess.user_id, author_role: "pmo" }, { Prefer: "return=minimal" });
  const mid = be.snapshot();
  await call("POST", "/rest/v1/comments", { project_id: M.storyProjectId, body: "y", author_id: sess.user_id, author_role: "pmo" }, { Prefer: "return=minimal" });
  be.restore(mid);
  check("restore(snapshot) returns to that point", store.tables.comments.length === before + 1);
  r = await get("/rest/v1/comments?select=id");
  check("reads after restore see the restored rows", r.b.length === before + 1);
  be.restore(snap0);
  check("restore(first snapshot)", store.tables.comments.length === snap0.tables.comments.length && store.tables.comment_reads.length === 0);
  be.reset();
  const st = be.stats();
  check("reset() → initial data and zeroed stats", st.calls === 0 && st.unhandledCount === 0 && store.tables.comments.length === seed.tables.comments.length);
  check("only same-site addresses were fetched for real", sameSite.every((u) => u.startsWith(location.origin)), sameSite.join(" "));

  const failed = results.filter((x) => !x.ok);
  console.log(JSON.stringify({ total: results.length, failed }));
  return failed.length === 0;
}
if (flag("--unit-child")) { const ok = await unitChecks(); process.exit(ok ? 0 : 1); }
{
  const u = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--unit-child"], { encoding: "utf8" });
  const last = (u.stdout || "").trim().split("\n").pop();
  let res = null; try { res = JSON.parse(last); } catch { /* below */ }
  if (!res) { console.error(u.stdout, u.stderr); die("contract checks crashed"); }
  log(`contract checks ${res.total - res.failed.length}/${res.total} ok`);
  for (const f of res.failed) log("  check failed:", f.name, f.info);
  if (res.failed.length) die("contract checks failed");
  if (flag("--unit-only")) process.exit(0);
}

// ── 1-3: copy and build ────────────────────────────────────────────────────────────────────────
const SKIP = new Set(["node_modules", ".git", "dist", "dist-preview"]);
function copyRepo() {
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  fs.cpSync(REPO, APP, { recursive: true, filter: (src) => {
    const rel = path.relative(REPO, src);
    if (!rel) return true;
    return !SKIP.has(rel.split(path.sep)[0]);
  } });
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(APP, "node_modules"), "dir");
}
const STUB_SIMROOT = `// Written by scripts/sim/backend-test.mjs in its scratch copy only: mounts the App at once.
import React, { Suspense, lazy } from "react";
const App = lazy(() => import("../App.jsx"));
export default function SimRoot() {
  return React.createElement(Suspense, { fallback: null }, React.createElement(App));
}
`;
if (!flag("--no-build")) {
  log("copying the repo to", APP);
  copyRepo();
  if (!flag("--real-simroot") || !fs.existsSync(path.join(APP, "src/sim/SimRoot.jsx"))) {
    fs.writeFileSync(path.join(APP, "src/sim/SimRoot.jsx"), STUB_SIMROOT);
    log("stub SimRoot written (scratch copy only)");
  }
  log("building the preview…");
  const b = spawnSync("bash", ["build.sh", "--config", "vite.config.preview.js"], { cwd: APP, encoding: "utf8" });
  if (b.status !== 0) { console.error(b.stdout.slice(-4000), b.stderr.slice(-4000)); die("build failed"); }
  log("built:", (b.stdout.match(/simulation\.html[^\n]*/) || [""])[0]);
}
const DIST = path.join(APP, "dist-preview");
if (!fs.existsSync(path.join(DIST, "simulation.html"))) die(`${DIST}/simulation.html missing (build first)`);

// ── 4: serve ───────────────────────────────────────────────────────────────────────────────────
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".mp4": "video/mp4", ".webm": "video/webm" };
const served = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); served.push([404, p]); return; }
  let file = path.join(DIST, p.slice(BASE.length));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); served.push([404, p]); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
  served.push([200, p]);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
log("serving", DIST, "at", ORIGIN + BASE);

// ── 5: drive the App ───────────────────────────────────────────────────────────────────────────
// Ids of the story's records, from the public seed (no names in it).
const META = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/seed.json"), "utf8")).meta || {};
// The test runs with "Run with sample names", so campus slots resolve through the sample cast.
const SAMPLE = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/sample-cast.json"), "utf8"));
const campusOf = (tok) => { const m = /^\{\{C:(C\d\d)\}\}$/.exec(String(tok || "")); return m ? SAMPLE.campuses?.[m[1]]?.name || null : tok || null; };
const cssq = (v) => String(v).replace(/["\\]/g, "\\$&");
let pw;
try { pw = PW ? createRequire(import.meta.url)(PW) : createRequire(import.meta.url)("playwright"); }
catch { die("Playwright not found: pass --playwright <path to playwright/index.js> or set SIM_PLAYWRIGHT"); }
const { chromium } = pw;
const browser = await chromium.launch({ headless: !flag("--headed") });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, serviceWorkers: "block" });
const page = await context.newPage();

const outside = [], consoleErrors = [], pageErrors = [], steps = [], popups = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.startsWith(ORIGIN + "/") || u.startsWith("blob:") || u.startsWith("data:")) return;
  outside.push(r.method() + " " + u.slice(0, 160));
});
// Known gap, reported but not failed: the Welcome email preview's simulation screenshots
// (public/sim/files/email/*.jpg) are still to be added by the agent that makes the screenshots.
const KNOWN_GAP = /\/sim\/files\/email\/[^/]+\.(?:jpg|png)$/;
const knownGaps = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const at = (m.location && m.location().url) || "";
  if (/Failed to load resource/.test(m.text()) && KNOWN_GAP.test(at)) { knownGaps.push(at.replace(ORIGIN, "")); return; }
  consoleErrors.push((m.text() + (at ? " @ " + at.replace(ORIGIN, "") : "")).slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));
page.on("dialog", (d) => d.dismiss().catch(() => {}));
context.on("page", (p) => { popups.push(p.url()); p.close().catch(() => {}); });

const stats = () => page.evaluate(() => (window.__PMO_SIM_BACKEND_STATS__ ? window.__PMO_SIM_BACKEND_STATS__() : null));
async function settle(min = 500, quiet = 450, max = 6000) {
  await page.waitForTimeout(min);
  const t0 = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await stats().catch(() => null);
    const n = s ? s.calls : 0;
    if (n !== last) { last = n; since = Date.now(); }
    if (Date.now() - since >= quiet) return;
    await page.waitForTimeout(100);
  }
}
let shotN = 0;
async function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) }).catch(() => {});
}
async function step(name, fn) {
  const before = await stats().catch(() => null);
  const t = Date.now();
  try {
    const note = await fn();
    await settle();
    const after = await stats().catch(() => null);
    steps.push({ name, ok: true, ms: Date.now() - t, calls: after && before ? after.calls - before.calls : null, ...(note ? { note } : {}) });
    await shot(name);
  } catch (e) {
    steps.push({ name, ok: false, ms: Date.now() - t, error: String(e && e.message || e).split("\n")[0].slice(0, 240) });
    await shot("FAIL " + name);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
// The figures the seed promises for a scene (META.expect) are on screen: the backend served the
// right rows, filters, counts and order. Waits briefly for count-ups to finish.
const EXP = META.expect || {};
async function shows(text, sel = "body", timeout = 4000) {
  if (!text) return;
  const t0 = Date.now();
  let seenText = "";
  while (Date.now() - t0 < timeout) {
    // Compared without spaces: "PKR" and the figure are separate inline elements on the hero.
    seenText = (await page.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, "");
    if (seenText.toLowerCase().includes(String(text).replace(/\s+/g, "").toLowerCase())) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`"${text}" not on screen`);
}
const click = (sel, o = {}) => page.locator(sel).first().click({ timeout: 6000, ...o });
const visible = (sel, timeout = 6000) => page.locator(sel).first().waitFor({ state: "visible", timeout });
async function nav(id) {
  await page.keyboard.press("Escape").catch(() => {});
  await click(`[data-nav="${id}"]`);
  await settle(700);
}
// Every <img> in sel has decoded (the blob: and same-site files really load).
const imagesLoaded = (sel) => page.locator(sel).evaluateAll((els) => {
  const imgs = els.flatMap((e) => (e.tagName === "IMG" ? [e] : [...e.querySelectorAll("img")]));
  return { total: imgs.length, ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    blob: imgs.filter((i) => i.src.startsWith("blob:")).length };
});

await step("open simulation.html (sample names)", async () => {
  await page.goto(ORIGIN + BASE + "simulation.html", { waitUntil: "load" });
  await page.getByRole("button", { name: /Run with sample names/i }).click({ timeout: 10000 });
  await visible('[data-nav="cmd"]', 20000);
});

// Capex Dashboard and its tabs
await step("dashboard", async () => {
  await nav("cmd");
  await visible('[data-tour="hero"]');
  await shows(EXP["1"]?.total, '[data-tour="hero"]');
  await shows(EXP["1"]?.heroVerdict, '[data-tour="hero"]');
  return `${EXP["1"]?.total} on the hero`;
});
for (const tab of ["investments", "pipeline", "execution", "financials", "budgeting"]) {
  await step(`dashboard tab ${tab}`, async () => {
    const btn = page.locator(`[data-tour="tab-strip"] [data-tab="${tab}"]`);
    must(await btn.count(), `no [data-tab="${tab}"] in the tab strip`);
    await btn.first().click();
  });
}
await step("dashboard: PDD Status, MT Review list", async () => {
  await click('[data-tour="tab-strip"] [data-tab="pipeline"]');
  await page.waitForTimeout(400);
  // The pipeline strip's tiles carry the card keys (in_mt), not the stage names.
  await click('[data-stage="in_mt"], [data-stage="mt_review"]');
  await shows(EXP["3"]?.listHeader);
  return EXP["3"]?.listHeader;
});

// Every PMO page
for (const id of ["proj", "camp", "perf", "risks", "cashflow", "schedule", "past", "review", "reports", "upd", "photowall", "team", "users", "log", "set"]) {
  await step(`page ${id}`, async () => { await nav(id); });
}

// Three projects, every tab: the story project, a Gallery host (real-media slots) and the first other row
await step("projects: search filters the list", async () => {
  await nav("proj");
  const s = page.locator('[data-tour="projects-search"]').first();
  await s.fill(META.storySearch || "Study");
  await page.waitForTimeout(600);
  const n = await page.locator("tr[data-project-id]").count();
  must(n >= 1, "the search left no rows");
  must(!EXP["6"]?.searchRows || n === Number(EXP["6"].searchRows), `the search left ${n} rows, expected ${EXP["6"]?.searchRows}`);
  await s.fill("");
  return `${n} row(s) for "${META.storySearch}"`;
});
const listed = await page.locator("tr[data-project-id]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-project-id")))]).catch(() => []);
const pick = [META.storyProjectId, META.galleryFirstProjectId].filter(Boolean);
for (const id of listed) if (pick.length < 3 && !pick.includes(id)) pick.push(id);
for (const [n, pid] of pick.entries()) {
  const label = pid === META.storyProjectId ? "story project" : pid === META.galleryFirstProjectId ? "gallery host" : `project ${n + 1}`;
  await step(`${label}: open`, async () => {
    await nav("proj");
    await page.locator('[data-tour="projects-search"]').first().fill("");
    await page.waitForTimeout(300);
    await click(`tr[data-project-id="${pid}"]`);
    await visible('[data-tab="overview"]', 8000);
  });
  const tabs = await page.locator("[data-tab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab"))).catch(() => []);
  for (const t of tabs.filter((x) => ["overview", "financials", "timeline", "wbs", "deliverables", "documents", "sitevisit", "risks", "lessons"].includes(x))) {
    await step(`${label}: tab ${t}`, async () => {
      await click(`[data-tab="${t}"]`);
      await settle(600);
      if (t === "documents" && pid === META.storyProjectId) {
        const cards = await page.locator('[data-tour="doc-card"]').count();
        must(cards >= 1, "no document cards on the story project");
        // Opening a card signs the file (same-site path) and asks to open it; the boot guard decides.
        await page.locator('[data-tour="doc-card"]').first().click();
        await settle(600);
        return `${cards} document cards`;
      }
      if (t === "wbs" && pid === META.storyProjectId) {
        const rows = await page.locator("[data-wbs-row]").count();
        must(rows >= 1, "no WBS rows on the story project");
        const tg = page.locator('[data-tour="wbs-toggle"]');
        if (await tg.count()) await tg.first().click();
        return `${rows} WBS rows`;
      }
      if (t === "sitevisit" && pid === META.galleryFirstProjectId) {
        await page.waitForTimeout(800);
        const im = await imagesLoaded('[data-tour="detail-sitevisit"]');
        must(im.total === 0 || im.ok === im.total, `site-visit images: ${im.ok} of ${im.total} loaded`);
        return `site-visit images ${im.ok}/${im.total} (${im.blob} blob:)`;
      }
      return null;
    });
  }
}

// Campus / Sites: Compare (both modes), Sites view, Assign PM preview (cancelled)
await step("campus: compare (all campuses)", async () => {
  await nav("camp");
  await click('[data-tour="campus-view"] [data-view="compare"]');
  await visible('[data-tour="compare-table"]', 8000);
  const n = await page.locator('[data-tour="compare-table"] tr[data-campus]').count();
  must(!EXP["12"]?.rows || n === Number(EXP["12"].rows), `${n} campus rows, expected ${EXP["12"]?.rows}`);
  return `${n} campus rows`;
});
await step("campus: sort by Released", async () => {
  const h = page.locator('[data-tour="compare-table"] [data-col="released"]');
  must(await h.count(), "no Released column header");
  await h.first().click();
  await page.waitForTimeout(300);
  const first = await page.locator('[data-tour="compare-table"] tr[data-campus]').first().getAttribute("data-campus");
  const want = campusOf(EXP["12"]?.firstAfterSort);
  must(!want || first === want, `first row after sorting: ${first}, expected ${want}`);
  return `first: ${first}`;
});
const third = campusOf(META.h2hThirdCampus);
const assignCampus = campusOf(META.assignCampus);
await step("campus: tick the third campus", async () => {
  must(third, "no h2hThirdCampus in the seed meta");
  const box = page.locator(`[data-tour="compare-table"] tr[data-campus="${cssq(third)}"] input[type="checkbox"]`).first();
  must(await box.count(), `no Compare row for ${third}`);
  if (!(await box.isChecked())) await box.check();
  return third;
});
await step("campus: head to head", async () => {
  await click('[data-tour="compare-mode"] [data-mode="h2h"], [data-mode="h2h"]');
  await visible('[data-tour="compare-h2h-grid"]', 8000);
  const cols = await page.locator('[data-tour="compare-h2h-grid"] [data-tour="h2h-open"]').count();
  must(cols === (META.h2hCampuses || []).length || !META.h2hCampuses, `head to head shows ${cols} columns`);
  await shot("campus head to head (open)");
  return `${cols} columns, ${await page.locator('[data-tour="h2h-pms"]').count()} manager blocks`;
});
await step("campus: open the Assign PM campus from head to head", async () => {
  const col = page.locator(`[data-tour="compare-h2h-grid"] [data-campus="${cssq(assignCampus)}"] [data-tour="h2h-open"]`);
  if (assignCampus && await col.count()) await col.first().click();
  else {
    // Surface may not pass data-campus through: pick the column by its place in META.h2hCampuses.
    const i = (META.h2hCampuses || []).map(campusOf).indexOf(assignCampus);
    await page.locator('[data-tour="h2h-open"]').nth(Math.max(0, i)).click({ timeout: 6000 });
  }
  await visible('[data-tour="assign-pm"]', 8000);
  return assignCampus;
});
await step("campus: Assign PM preview, then cancel", async () => {
  const btn = page.locator('[data-tour="assign-pm"]').first();
  await btn.click({ timeout: 6000 });
  // The picker is the portal's own combobox (ui.jsx Select): a button and a listbox of [role=option][data-value].
  const sel = page.locator('[data-tour="pm-select"]').first();
  await sel.waitFor({ state: "visible", timeout: 6000 });
  await sel.click();
  const opts = page.locator('[role="listbox"] [role="option"]');
  await opts.first().waitFor({ state: "visible", timeout: 6000 });
  const values = (await opts.evaluateAll((os) => os.map((o) => o.getAttribute("data-value")))).filter(Boolean);
  must(values.length, "no project managers to pick");
  must(!META.assignPmUserId || values.includes(META.assignPmUserId), "the Assign PM picker lacks the story's manager");
  const want = values.includes(META.assignPmUserId) ? META.assignPmUserId : values[0];
  await page.locator(`[role="listbox"] [role="option"][data-value="${want}"]`).first().click();
  await visible('[data-tour="bulk-preview"]', 6000);
  await page.waitForTimeout(400);
  const text = (await page.locator('[data-tour="bulk-preview"]').first().innerText()).replace(/\s+/g, " ");
  for (const line of (META.assignPreview && META.assignPreview.lines) || []) must(text.includes(line), `preview lacks "${line}": ${text.slice(0, 160)}`);
  await shot("assign pm preview (open)");
  await page.getByRole("button", { name: /^Cancel$/ }).first().click({ timeout: 6000 });
  return text.slice(0, 120);
});

// Board report viewer
await step("board report: open and back", async () => {
  await nav("reports");
  await click(META.reportId ? `[data-report="${META.reportId}"]` : "[data-report]");
  await visible('[data-tour="report-viewer"]', 8000);
  await visible('[data-tour="report-summary"]', 8000);
  await page.waitForTimeout(600);
  await shot("board report (open)");
  await click('[data-tour="report-back"]');
});

// Past Projects as in scene 16: the Unread filter first (the story's past project has an unread
// reply), then open it from the filtered list; opening it writes the read mark in memory.
await step("past: unread filter", async () => {
  await nav("past");
  // The sidebar item does not leave an open past project; its own back link does.
  const back = page.getByRole("button", { name: /^Past projects$/ });
  if (await back.count()) { await back.first().click(); await settle(500); }
  const u = page.locator('[data-tour="past-unread"]');
  must(await u.count(), "no Unread filter");
  must(await u.first().isEnabled(), "the Unread filter is disabled (nothing unread)");
  await u.first().click();
  await page.waitForTimeout(300);
  return `${await page.locator("[data-past]").count()} row(s) unread`;
});
await step("past: open the story's past project (marks it read)", async () => {
  const a = await stats();
  await click(META.storyPastId ? `[data-past="${META.storyPastId}"]` : "[data-past]");
  await visible('[data-tour="past-thread"]', 8000);
  await settle(600);
  const b = await stats();
  must(b.writes > a.writes, "opening the past project wrote no read mark");
  await shot("past project (open)");
  return `writes +${b.writes - a.writes}`;
});

// Updates thread (marks read in memory; the badge counts down)
await step("updates: open the story thread", async () => {
  await nav("upd");
  const row = META.updatesStoryProjectId ? `[data-tour="updates-list"] [data-project-id="${META.updatesStoryProjectId}"]` : '[data-tour="updates-list"] [data-project-id]';
  await shows(EXP["15"]?.storyNew, row);
  await click(row);
  await visible('[data-tour="updates-thread"]', 8000);
  await shows(EXP["15"]?.reply, '[data-tour="updates-thread"]');
  await settle(800);
  const s = await stats();
  must(s.writes >= 1, "reading the thread wrote no read marks");
  return `writes so far ${s.writes}`;
});

// Gallery lightbox (blob: media)
await step("gallery: grid and the first picture", async () => {
  await nav("photowall");
  await visible("[data-attachment]", 8000);
  await page.waitForTimeout(1200);
  const im = await imagesLoaded('[data-tour="gallery-grid"]');
  must(im.total > 0 && im.ok === im.total, `gallery images: ${im.ok} of ${im.total} loaded`);
  await click("[data-attachment]");
  await visible('[data-tour="lightbox"]', 8000);
  await page.waitForTimeout(500);
  await shot("gallery lightbox (open)");
  await page.keyboard.press("Escape");
  return `gallery images ${im.ok}/${im.total} (${im.blob} blob:)`;
});

// PMO Review detail (every tab it shows)
await step("pmo review: open a PDD", async () => {
  await nav("review");
  await page.locator('[role="button"]').filter({ hasText: /PDD-/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
});
for (const label of ["PDD details", "Cost table", "Files", "Approval history", "Review"]) {
  await step(`pmo review: tab ${label}`, async () => {
    const b = page.getByRole("button", { name: new RegExp("^" + label, "i") }).or(page.getByRole("tab", { name: new RegExp("^" + label, "i") }));
    must(await b.count(), `no ${label} tab`);
    await b.first().click();
  });
}

// Scene targets: timeline hover, risk matrix cell, performance filter
await step("timeline: hover a bar", async () => {
  await nav("schedule");
  const row = page.locator(META.storyProjectId ? `[data-tour="timeline"] [data-project-id="${META.storyProjectId}"]` : '[data-tour="timeline"] [data-project-id]').first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
});
await step("risks: click the story's matrix cell", async () => {
  await nav("risks");
  await click(`[data-tour="risk-matrix"] [data-cell="${META.riskCell || "high-medium"}"]`);
  await shows(EXP["11"]?.listCount);
  return EXP["11"]?.listCount;
});
await step("performance: delayed filter", async () => {
  await nav("perf");
  await click('[data-tour="perf-filters"] [data-filter="delayed"]');
  await shows(EXP["9"]?.showing);
  return EXP["9"]?.showing;
});
await step("users: every account, ordered PMO, managers, guests", async () => {
  await nav("users");
  await visible('[data-tour="users-table"] [data-user]', 6000);
  const names = await page.locator('[data-tour="users-table"] [data-user]').evaluateAll((els) => els.map((e) => e.getAttribute("data-user")));
  const uniq = [...new Set(names)];
  must(!EXP["14"]?.users || uniq.length === Number(EXP["14"].users), `${uniq.length} users, expected ${EXP["14"]?.users}`);
  const seed = JSON.parse(fs.readFileSync(path.join(REPO, "src/sim/data/seed.json"), "utf8"));
  const roleOf = Object.fromEntries((seed.tables.user_profiles || []).map((u) => [u.username, u.role]));
  const rank = { pmo: 0, project_manager: 1, guest: 2 };
  const ranks = uniq.map((u) => rank[roleOf[u]] ?? 9);
  must(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), "users are not ordered PMO, managers, guests");
  return `${uniq.length} users in role order`;
});

// Header: notifications drawer and global search; the assistant
await step("notifications drawer", async () => {
  await nav("cmd");
  const bell = page.locator('button[title="Updates"], button[title*="unread update"]').first();
  must(await bell.count(), "no notifications button");
  await bell.click();
  await visible('aside[aria-label="Notifications"]', 5000);
  await page.keyboard.press("Escape");
});
await step("global search", async () => {
  await click('[data-tour="search-trigger"]');
  await page.keyboard.type("Hub", { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
});
await step("assistant: ask a starter question", async () => {
  await click('[data-tour="assistant-launcher"]');
  await page.waitForTimeout(700);
  const box = page.locator("textarea").last();
  await box.fill("Where do we stand overall?");
  await box.press("Enter");
  await page.waitForTimeout(1200);
  await shot("assistant answer");
  await page.keyboard.press("Escape");
});

// Refusals: nothing leaves the page and nothing real comes in (each must end quietly)
const delta = async (fn) => { const a = await stats(); await fn(); await settle(700); const b = await stats();
  return { refused: b.refusedCount - a.refusedCount, blocked: b.blockedCount - a.blockedCount, writes: b.writes - a.writes }; };
await step("refused: upload a document", async () => {
  await nav("proj");
  await click(`tr[data-project-id="${META.storyProjectId}"]`);
  await visible('[data-tab="documents"]', 8000);
  await click('[data-tab="documents"]');
  await settle(500);
  const d = await delta(() => page.locator('input[type="file"]').first().setInputFiles({ name: "real.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%real\n") }));
  must(d.refused === 1, `expected 1 refused upload, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: post an Updates comment (kept in memory; no email)", async () => {
  await nav("upd");
  // The thread was read above, so the Inbox is empty now: open it from All Projects.
  await page.getByRole("button", { name: /^All Projects$/ }).first().click({ timeout: 6000 });
  await page.waitForTimeout(300);
  await click(`[data-tour="updates-list"] [data-project-id="${META.updatesStoryProjectId}"]`);
  await visible('[data-tour="updates-thread"]', 8000);
  const box = page.locator('textarea[placeholder^="Write a comment"]').first();
  await box.fill("Test note from the simulation check.");
  const d = await delta(() => box.press("Control+Enter"));
  must(d.writes >= 1 && d.blocked === 1, `expected a write and a blocked notify-comment, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: PMO Review › Check now", async () => {
  await nav("review");
  const d = await delta(() => page.getByRole("button", { name: /Check now/i }).first().click());
  must(d.blocked === 1, `expected 1 blocked epdd-sync, got ${JSON.stringify(d)}`);
  return JSON.stringify(d);
});
await step("blocked: Welcome email › Send test to me", async () => {
  await nav("users");
  await page.getByRole("button", { name: /^Welcome email$/ }).first().click({ timeout: 6000 });
  await page.waitForTimeout(800);
  // The simulation's welcome_email setting carries no standard password, so send without one.
  await page.getByRole("button", { name: /^Not included$/ }).first().click({ timeout: 6000 });
  const d = await delta(() => page.getByRole("button", { name: /Send test to me/i }).first().click({ timeout: 6000 }));
  must(d.blocked === 1, `expected 1 blocked send-welcome-email, got ${JSON.stringify(d)}`);
  await shot("welcome email blocked");
  await page.keyboard.press("Escape");
  return JSON.stringify(d);
});
await step("sign out, then sign-in and Forgot password are refused", async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Sign out$/ }).first().click({ timeout: 6000 });
  const user = page.locator('input[placeholder="Enter your username"]').first();
  await user.waitFor({ state: "visible", timeout: 8000 });
  await user.fill("pmo.sim");
  await page.locator('input[type="password"]').first().fill("not-a-password");
  await page.getByRole("button", { name: /^Sign In$/i }).first().click();
  await page.waitForTimeout(800);
  const msg = await page.getByText(/Username not found|not available in the simulation/i).count();
  must(msg >= 1, "no refusal message after Sign In");
  await page.getByText("Forgot password?").first().click();
  await page.locator('input[placeholder="Your username"]').first().fill("pmo.sim");
  await page.locator('input[placeholder="Your username"]').first().press("Enter");
  await page.waitForTimeout(800);
  await shot("forgot password refused");
});

// ── 6: verdict ─────────────────────────────────────────────────────────────────────────────────
await settle(800);
const s = await stats();
await browser.close();
server.close();

const failedSteps = steps.filter((x) => !x.ok);
const ok = s && s.unhandledCount === 0 && s.outsideCount === 0 && outside.length === 0
  && consoleErrors.length === 0 && pageErrors.length === 0 && failedSteps.length === 0;
const report = {
  pass: !!ok,
  steps: { total: steps.length, failed: failedSteps, notes: steps.filter((x) => x.note).map((x) => `${x.name}: ${x.note}`) },
  backend: s ? { calls: s.calls, rest: s.rest, rpc: s.rpc, storage: s.storage, functions: s.functions, auth: s.auth,
    reads: s.reads, writes: s.writes, unhandled: s.unhandled, refused: s.refused, blocked: s.blocked, outside: s.outside,
    emptyTables: s.emptyTables, endpoints: Object.keys(s.endpoints).sort() } : null,
  browser: { requestsLeavingOrigin: outside, consoleErrors, pageErrors, popups,
    sameOrigin404: served.filter(([c]) => c === 404).map(([, p]) => p),
    knownGaps: [...new Set(knownGaps)] },
};
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "backend-test-report.json"), JSON.stringify(report, null, 2));
log(`steps ${steps.length - failedSteps.length}/${steps.length} ok; backend calls ${s?.calls}; unhandled ${s?.unhandledCount}; `
  + `outside ${outside.length}; console errors ${consoleErrors.length}; page errors ${pageErrors.length}`);
for (const f of failedSteps) log("  step failed:", f.name, "-", f.error);
for (const u of (s?.unhandled || [])) log("  unhandled:", u.kind, u.method, u.path, u.detail || "");
for (const o of outside) log("  outside:", o);
for (const c of consoleErrors) log("  console:", c);
for (const p of pageErrors) log("  page error:", p);
for (const g of new Set(knownGaps)) log("  known gap (not failed): missing", g);
log("report:", path.join(WORK, "backend-test-report.json"));
log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
