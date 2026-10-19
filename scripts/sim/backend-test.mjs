#!/usr/bin/env node
// PMO Simulation: the synthetic backend in live mode (src/sim/backend.js, contract §G.1–G.5) and the
// synthetic session (src/sim/session.js), in Node. PUBLIC: no data here. Owner: B2.
//
//   node scripts/sim/backend-test.mjs                        invented data only (scripts/sim/live/synthetic.mjs)
//   SIM_FIXTURE=<dir> node scripts/sim/backend-test.mjs      also over the private fixture (contract §K)
//
// What it checks, on a snapshot read through the real snapshot reader (src/sim/live/snapshot.js):
//   replay first (every recorded response comes back byte for byte, with its Content-Range; Range,
//   Prefer count and single-object requests go to the engine), the engine's agreement with the
//   recorded responses, the database's enum order and en-US collation, the read markers accepted and
//   discarded, every other write refused (403 + toast), RPC answers, storage (only sim-media/<key>),
//   edge functions refused, auth, other sites, the tables never changing, checkpoints, stats.
// It never contacts Supabase or any other site: fetch is a stub that records what passes through.
// Exit code 0 = pass. (The old browser walk-through on the fictional seed is gone with the seed;
// the integration run drives the real App on the live snapshot.)
import assert from "node:assert/strict";
import * as H from "./live/b2-support.mjs";

const { passthrough, toasts } = H.nodeWindow();
const SRC = new URL("../../src/", import.meta.url);
const B = await import(new URL("sim/backend.js", SRC));
const SESS = await import(new URL("sim/session.js", SRC));
const { canon } = await import(new URL("sim/live/canon.js", SRC));
const { TEMPLATES, fill, keyOf } = await import(new URL("sim/live/requests.js", SRC));
const SB = H.SUPA;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function install(snapshot, { responses = snapshot.responses, mediaUrls = null } = {}) {
  const urls = mediaUrls || Object.fromEntries(snapshot.media.map((m) => [m.key, `blob:${location.origin}/${m.attachmentId}`]));
  const store = { tables: structuredClone(snapshot.tables), meta: { pmo: { ...snapshot.pmo, email: null }, takenAt: snapshot.takenAt, plan: snapshot.plan } };
  const un = [];
  const be = B.installBackend({ store, mediaUrls: urls, responses: structuredClone(responses), rpc: snapshot.rpc, mode: "live", onUnhandled: (i) => un.push(i) });
  const sess = B.prepareSession(store);
  const H0 = { apikey: "anon", Authorization: "Bearer " + sess.access_token };
  const call = async (method, p, body, h = {}) => {
    const init = { method, headers: { ...H0, ...h } };
    if (body !== undefined) { init.body = typeof body === "string" ? body : JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
    const r = await fetch(SB + p, init);
    const t = await r.text();
    let b = t; try { b = t ? JSON.parse(t) : null; } catch { /* text */ }
    return { s: r.status, b, cr: r.headers.get("content-range") };
  };
  return { be, store, sess, un, urls, call, get: (p, h) => call("GET", p, undefined, h) };
}

async function battery(name, snapshot) {
  const T = snapshot.tables;
  const me = snapshot.pmo.id;
  const capex = T.projects.filter((p) => p.portfolio === "capex");

  await test(`${name}: replay first — every recorded response byte for byte, with its Content-Range; nothing missed`, async () => {
    const X = install(snapshot);
    for (const r of snapshot.responses) {
      const g = await X.get(r.key);
      assert.equal(g.s, r.status, r.key);
      assert.equal(JSON.stringify(g.b), JSON.stringify(r.body), r.key);
      assert.equal(g.cr, r.contentRange, r.key);
    }
    const st = X.be.stats();
    assert.equal(st.replay.hits, snapshot.responses.length);
    assert.deepEqual(st.replay.misses, []);
    assert.deepEqual(st.replay.unused, []);
    assert.equal(st.refusedCount + st.blockedCount + st.outsideCount + st.unhandledCount, 0);
    // HEAD: the status and range, no body.
    const head = await fetch(SB + snapshot.responses[0].key, { method: "HEAD", headers: { Authorization: "Bearer " + X.sess.access_token } });
    assert.equal(head.status, snapshot.responses[0].status);
    assert.equal(await head.text(), "");
  });

  await test(`${name}: Range, Prefer count and single-object requests go to the engine (and are counted as misses)`, async () => {
    const X = install(snapshot);
    const usersKey = snapshot.responses.find((r) => r.key.startsWith("/rest/v1/user_profiles?select=id,username,full_name,email"))?.key;
    if (!usersKey) return;
    let g = await X.get(usersKey, { Range: "0-1" });
    assert.equal(g.s, 200);
    assert.equal(g.b.length, Math.min(2, T.user_profiles.length));
    g = await X.get(usersKey, { Prefer: "count=exact" });
    assert.equal(g.cr, `0-${T.user_profiles.length - 1}/${T.user_profiles.length}`);
    g = await X.get(`/rest/v1/projects?id=eq.${capex[0].id}&select=id,name`, { Accept: "application/vnd.pgrst.object+json" });
    assert.equal(g.s, 200);
    assert.equal(g.b.id, capex[0].id);
    const st = X.be.stats();
    assert.equal(st.replay.hits, 0);
    assert.ok(st.replay.misses.find((m) => m.key === usersKey && m.n === 2));
  });

  await test(`${name}: the engine alone agrees with the recorded responses (row counts always; content where noted)`, async () => {
    const X = install(snapshot, { responses: [] });
    const ids = { me, storyId: snapshot.plan.story?.id, storyPmId: snapshot.plan.story?.pmId, updatesId: snapshot.plan.updates?.projectId,
      pastId: snapshot.plan.past?.id, reportId: snapshot.plan.report?.id };
    const tplOf = new Map(TEMPLATES.map((t) => [fill(t.path, ids) && keyOf(fill(t.path, ids)), t]));
    const differ = [], orderOnly = [], count = [];
    // The snapshot's board_reports leave out discarded reports (schema.js filter); the Monthly Report
    // list itself asks for every report, so only its recorded response has them.
    const SUBSET = new Set(["report.list"]);
    for (const r of snapshot.responses) {
      const g = await X.get(r.key);
      assert.equal(g.s, 200, r.key);
      const id = tplOf.get(r.key)?.id || r.key;
      const a = Array.isArray(r.body) ? r.body : [r.body], b = Array.isArray(g.b) ? g.b : [g.b];
      if (b.length !== a.length) { assert.ok(SUBSET.has(id), `${id}: rows ${b.length} vs ${a.length}`); count.push(id); continue; }
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      const sorted = (x) => x.map((o) => canon(o)).sort().join("\n");
      // Recorded rows were trimmed by policy (bodies, figures, paths), the engine's come from the trimmed tables too.
      if (sorted(a) === sorted(b)) orderOnly.push(id); else differ.push(id);
    }
    console.log(`   engine vs recorded: ${snapshot.responses.length - differ.length - orderOnly.length - count.length} identical, ${orderOnly.length} order only${orderOnly.length ? " (" + orderOnly.join(", ") + ")" : ""}, ${differ.length} content${differ.length ? " (" + differ.join(", ") + ")" : ""}, ${count.length} rows (${count.join(", ")})`);
    globalThis.__engineDiff = { differ, orderOnly };
  });

  await test(`${name}: read markers are accepted and discarded; the tables and the replay stay as they were`, async () => {
    const X = install(snapshot);
    const before = canon(X.store.tables);
    const c = T.comments[0];
    const readsBefore = (await X.get("/rest/v1/comment_reads?select=comment_id")).b;
    let r = await X.call("POST", "/rest/v1/comment_reads", [{ user_id: me, comment_id: c ? c.id : "00000000-0000-4000-8000-000000000000" }],
      { Prefer: "resolution=ignore-duplicates,return=minimal" });
    assert.equal(r.s, 201);
    const pid = c ? c.project_id : capex[0].id;
    r = await X.call("PATCH", `/rest/v1/comments?project_id=eq.${pid}&is_read_by_pmo=eq.false`, { is_read_by_pmo: true }, { Prefer: "return=minimal" });
    assert.equal(r.s, 204);
    r = await X.call("POST", "/rest/v1/past_chat_reads?on_conflict=user_id,thread", { user_id: me, thread: "project:x", read_at: new Date().toISOString() },
      { Prefer: "resolution=merge-duplicates,return=minimal" });
    assert.equal(r.s, 201);
    assert.equal(canon(X.store.tables), before, "tables unchanged");
    assert.equal(JSON.stringify((await X.get("/rest/v1/comment_reads?select=comment_id")).b), JSON.stringify(readsBefore), "badges stay as production");
    const st = X.be.stats();
    assert.deepEqual(st.accepted, { comment_reads: 1, comments_read_flag: 1, past_chat_reads: 1 });
    assert.equal(st.refusedCount, 0);
  });

  await test(`${name}: every other write is refused, 403 "Read-only presentation: nothing is changed or sent", with a toast`, async () => {
    const X = install(snapshot);
    const before = canon(X.store.tables);
    const t0 = toasts.length;
    const other = T.user_profiles.find((u) => u.id !== me)?.id || "00000000-0000-4000-8000-000000000001";
    const cases = [
      ["POST", "/rest/v1/comment_reads", [{ user_id: other, comment_id: "00000000-0000-4000-8000-000000000002" }], { Prefer: "resolution=ignore-duplicates" }],
      ["POST", "/rest/v1/comment_reads", [{ user_id: me, comment_id: "00000000-0000-4000-8000-000000000002" }], {}],
      ["PATCH", `/rest/v1/comments?project_id=eq.${capex[0].id}&is_read_by_pmo=eq.false`, { is_read_by_pmo: true, body: "x" }, {}],
      ["PATCH", `/rest/v1/comments?project_id=eq.${capex[0].id}`, { is_read_by_pmo: true }, {}],
      ["POST", "/rest/v1/past_chat_reads?on_conflict=user_id,thread", { user_id: other, thread: "project:x" }, { Prefer: "resolution=merge-duplicates" }],
      ["POST", "/rest/v1/comments", { project_id: capex[0].id, body: "hello" }, {}],
      ["POST", "/rest/v1/projects", { name: "x" }, {}],
      ["PATCH", `/rest/v1/projects?id=eq.${capex[0].id}`, { pct_complete: 50 }, {}],
      ["DELETE", `/rest/v1/project_assignments?project_id=eq.${capex[0].id}`, undefined, {}],
      ["POST", "/rest/v1/project_assignments", [{ project_id: capex[0].id, user_id: other }], {}],
      ["PATCH", `/rest/v1/user_profiles?id=eq.${me}`, { tutorial_dismissed_at: "now" }, {}],
      ["PATCH", `/rest/v1/user_profiles?id=eq.${other}`, { phone: "1" }, {}],
      ["POST", "/rest/v1/settings?on_conflict=key", { key: "dashboard_kpis", value: {} }, { Prefer: "resolution=merge-duplicates" }],
      ["POST", "/rest/v1/activity_log", { action: "login" }, {}],
      ["PATCH", "/rest/v1/board_reports?id=eq.x", { status: "published" }, {}],
      ["PATCH", "/rest/v1/project_deliverables?id=eq.x", { status: "delivered" }, {}],
      ["PUT", "/rest/v1/projects?id=eq.x", { id: "x" }, {}],
      ["POST", "/rest/v1/project_metrics", { id: "x" }, {}],
      ["POST", "/rest/v1/comment_reads", "{not json", { Prefer: "resolution=ignore-duplicates" }],
    ];
    for (const [m, p, body, h] of cases) {
      const r = await X.call(m, p, body, h);
      assert.equal(r.s, 403, `${m} ${p}`);
      assert.equal(r.b.code, "SIM403");
      assert.equal(r.b.message, B.MSG.READ_ONLY);
    }
    const st = X.be.stats();
    assert.equal(st.refusedCount, cases.length);
    assert.equal(st.writes, 0);
    assert.ok(toasts.slice(t0).every((t) => t === B.MSG.READ_ONLY) && toasts.length - t0 === cases.length);
    assert.equal(canon(X.store.tables), before);
  });

  await test(`${name}: RPC answers (deliverables from the snapshot's set; no-ops; unknown → 501, reported)`, async () => {
    const X = install(snapshot);
    const yes = snapshot.rpc.project_has_deliverables[0];
    const no = T.projects.find((p) => !snapshot.rpc.project_has_deliverables.includes(p.id))?.id;
    if (yes) assert.equal((await X.call("POST", "/rest/v1/rpc/project_has_deliverables", { p: yes })).b, true);
    if (no) assert.equal((await X.call("POST", "/rest/v1/rpc/project_has_deliverables", { p: no })).b, false);
    const want = { is_pmo: true, current_user_role: "pmo", can_view_project: true, can_view_past: true, is_past_viewer: false, is_past_pm: false,
      is_pm: false, is_guest: false, is_assigned: false, tour_demo_project: null, resolve_login_email: null, session_start: null, session_log: null,
      session_touch: null, session_end: null, bump_session: null, tour_save_progress: null, mark_tutorial_complete: null, dismiss_tutorial: null, reset_tutorial: null };
    for (const [fn, v] of Object.entries(want)) {
      const r = await X.call("POST", "/rest/v1/rpc/" + fn, {});
      assert.equal(r.s, 200, fn);
      assert.deepEqual(r.b, v, fn);
    }
    const u = await X.call("POST", "/rest/v1/rpc/delete_everything", {});
    assert.equal(u.s, 501);
    const st = X.be.stats();
    assert.deepEqual(st.rpcUnknown, ["delete_everything"]);
    assert.equal(st.unhandledCount, 1);
  });

  await test(`${name}: storage — only sim-media/<key> signs (to its blob: link); documents are not part of the simulation; uploads and deletes refused`, async () => {
    const X = install(snapshot);
    const doc = T.project_attachments.find((a) => a.kind !== "site_visit");
    if (snapshot.media.length) {
      const k = snapshot.media[0].key;
      let r = await X.call("POST", `/storage/v1/object/sign/project-attachments/sim-media/${k}`, { expiresIn: 3600 });
      assert.equal(r.s, 200);
      assert.equal(r.b.signedURL, X.urls[k]);
      r = await X.call("POST", "/storage/v1/object/sign/project-attachments", { expiresIn: 3600, paths: [`sim-media/${k}`, doc ? doc.file_path : "x"] });
      assert.equal(r.b[0].signedURL, X.urls[k]);
      assert.equal(r.b[1].signedURL, null);
      const n = passthrough.length;
      await fetch(SB + `/storage/v1/object/sign/project-attachments/sim-media/${k}?token=x`);
      assert.equal(passthrough[n], X.urls[k], "served from the blob: link, never the network");
    }
    if (doc) {
      const r = await X.call("POST", `/storage/v1/object/sign/project-attachments/${doc.file_path}`, { expiresIn: 3600 });
      assert.equal(r.s, 400);
      assert.equal(r.b.message, B.MSG.NO_FILE);
    }
    assert.equal((await X.call("POST", "/storage/v1/object/sign/epdd-files/1/charter/x.pdf", { expiresIn: 60 })).s, 400);
    assert.equal((await X.call("POST", "/storage/v1/object/project-attachments/new.pdf", "x")).s, 403);
    assert.equal((await X.call("DELETE", "/storage/v1/object/project-attachments/sim-media/m001")).s, 403);
    assert.ok(passthrough.every((u) => u.startsWith("blob:") || u.startsWith(location.origin)), "nothing else passed through");
  });

  await test(`${name}: edge functions are refused (the assistant too), auth answers synthetic tokens, other sites 501`, async () => {
    const X = install(snapshot);
    let r = await X.call("POST", "/functions/v1/ask", { question: "where do we stand?" });
    assert.equal(r.s, 403);
    assert.equal(r.b.message, B.MSG.ASK);
    for (const f of ["notify-comment", "send-welcome-email", "board-report-notify", "send-deadline-email", "epdd-sync", "invite-user", "anything-new"]) {
      r = await X.call("POST", "/functions/v1/" + f, {});
      assert.equal(r.s, 403, f);
      assert.equal(r.b.code, "SIM403");
    }
    assert.equal(X.be.stats().blockedCount, 8);
    r = await X.call("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: X.sess.refresh_token });
    assert.equal(r.s, 200);
    assert.ok(SESS.isSimToken(r.b.access_token));
    assert.equal(r.b.user.id, me);
    assert.equal(r.b.user.email, null);
    assert.equal((await X.call("POST", "/auth/v1/token?grant_type=password", { email: "x", password: "y" })).s, 400);
    assert.equal((await X.get("/auth/v1/user")).b.id, me);
    assert.equal((await X.call("POST", "/auth/v1/logout?scope=local")).s, 204);
    r = await fetch("https://example.org/x");
    assert.equal(r.status, 501);
    const ws = new WebSocket("wss://prmxkecomqqngvrmytcj.supabase.co/realtime/v1/websocket");
    ws.close();
    const st = X.be.stats();
    assert.equal(st.outsideCount, 1);
    assert.equal(st.sockets, 1);
  });

  await test(`${name}: pop-up views are empty, known tables outside the snapshot read as empty (counted), unknown ones 501`, async () => {
    const X = install(snapshot);
    assert.deepEqual((await X.get("/rest/v1/at_risk_projects?select=*")).b, []);
    assert.deepEqual((await X.get("/rest/v1/pdd_pending_projects?select=*&order=days_until_start.asc")).b, []);
    assert.deepEqual((await X.get("/rest/v1/notifications_log?select=*")).b, []);
    assert.deepEqual((await X.get("/rest/v1/user_sessions?select=*")).b, []);
    assert.equal((await X.get("/rest/v1/not_a_table?select=*")).s, 501);
    const st = X.be.stats();
    assert.deepEqual(Object.keys(st.emptyTables).sort(), ["notifications_log", "user_sessions"]);
  });

  await test(`${name}: the tables are frozen and never change; checkpoints are no-ops; reset clears the counters`, async () => {
    const X = install(snapshot);
    assert.throws(() => { "use strict"; X.store.tables.projects[0].name = "x"; }, TypeError);
    assert.throws(() => { X.store.tables.projects.push({}); }, TypeError);
    const cp = X.be.snapshot();
    assert.deepEqual(Object.keys(cp).sort(), ["seq", "v"]);
    assert.equal(cp.v, 2);
    X.be.restore(cp);
    assert.throws(() => X.be.restore({ tables: {} }));
    await X.get(snapshot.responses[0].key);
    assert.equal(X.be.stats().replay.hits, 1);
    X.be.reset();
    const st = X.be.stats();
    assert.equal(st.replay.hits, 0);
    assert.equal(st.calls, 0);
    assert.equal(st.replay.unused.length, snapshot.responses.length);
    assert.equal(window.__PMO_SIM_BACKEND_STATS__().replay.hits, 0);
  });

  await test(`${name}: the session runs as the real PMO id, with no email; sessionStorage only`, async () => {
    const X = install(snapshot);
    const raw = JSON.parse(sessionStorage.getItem("pmo_session"));
    assert.equal(raw.user_id, me);
    assert.equal(raw.role, "pmo");
    assert.equal(raw.remember, false);
    assert.ok(SESS.isSimToken(raw.access_token));
    assert.equal(localStorage.getItem("pmo_session"), null);
    assert.equal(SESS.sessionUser(X.store).email, null);
    assert.equal(SESS.authUser(X.store).email, null);
    assert.throws(() => SESS.sessionUser({ pmo: { id: me } }), /no PMO account/);
    // A real user token in a request is reported (it never exists in this page).
    await fetch(SB + "/rest/v1/projects?select=id", { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x" } });
    assert.ok(X.be.stats().unhandled.some((u) => u.kind === "token"));
  });
}

// ── semantics on a tiny invented store: enum order, collation, typed sorting ──
await test("engine: text sorts exactly as the database's ICU en-US collation did on a probe list (read-only SQL, 16 Oct 2026)", async () => {
  // SELECT … ORDER BY x over literal probe strings (no portal data), as the database answered.
  const PROBE = ["-", "10", "9", "a b", "A Zed", "ab", "Ab", "Ab. Cd", "Abc Def", "C Y", "Col. X", "Cz", "IT 25", "IT-26", "IT. 271197-04",
    "IT.250000-01", "IT.261297-03", "x & y", "x and y", "X y", "x_y", "x(y)"];
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const shuffled = [...PROBE].reverse().map((name, i) => ({ id: id(i + 1), name }));
  const be = B.installBackend({ store: { tables: { campuses: shuffled }, meta: { pmo: { id: id(99) } } }, mode: "live" });
  const s = B.prepareSession({ meta: { pmo: { id: id(99) } } });
  const rows = await (await fetch(SB + "/rest/v1/campuses?select=name&order=name.asc", { headers: { Authorization: "Bearer " + s.access_token } })).json();
  assert.deepEqual(rows.map((r) => r.name), PROBE);
  be.uninstall();
});

await test("engine: database enum order by table and column; en-US collation; text, numbers and dates by their column type", async () => {
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const tables = {
    projects: [
      { id: id(1), code: "IT.261297-03", name: "10", workflow_stage: "closed", priority: "third_priority", start_date: "2026-08-01", bac: 9 },
      { id: id(2), code: "IT. 271197-04", name: "9", workflow_stage: "pdd_not_submitted", priority: "top_priority", start_date: "2026-07-15", bac: 10 },
      { id: id(3), code: "IT.250000-01", name: "b", workflow_stage: "mt_review", priority: "second_priority", start_date: null, bac: 100 },
      { id: id(4), code: "-", name: "B", workflow_stage: "df_review", priority: null, start_date: "2026-07-15", bac: null },
      { id: id(5), code: "-", name: "a", workflow_stage: "approved", priority: "top_priority", start_date: "2026-07-01", bac: 1 },
    ],
    project_raci: [
      { id: id(11), raci_role: "informed", sort_order: 0 }, { id: id(12), raci_role: "responsible", sort_order: 1 },
      { id: id(13), raci_role: "accountable", sort_order: 0 }, { id: id(14), raci_role: "responsible", sort_order: 0 },
    ],
    project_cashflows: [{ id: id(21), priority: "Top" }, { id: id(22), priority: "First" }],
    user_profiles: [{ id: id(31), username: "b", role: "guest" }, { id: id(32), username: "a", role: "project_manager" }, { id: id(33), username: "c", role: "pmo" }],
  };
  const be = B.installBackend({ store: { tables, meta: { pmo: { id: id(33), username: "c" } } }, mode: "live" });
  const s = B.prepareSession({ meta: { pmo: { id: id(33) } } });
  const get = async (p) => (await (await fetch(SB + p, { headers: { Authorization: "Bearer " + s.access_token } })).json());
  const col = (rows, k) => rows.map((r) => r[k]);
  assert.deepEqual(col(await get("/rest/v1/projects?select=code&order=code.asc"), "code").slice(2), ["IT. 271197-04", "IT.250000-01", "IT.261297-03"],
    "spaces and punctuation count (Postgres ICU en-US)");
  assert.deepEqual(col(await get("/rest/v1/projects?select=code&order=code.asc"), "code").slice(0, 2), ["-", "-"]);
  assert.deepEqual(col(await get("/rest/v1/projects?select=name&order=name.asc"), "name"), ["10", "9", "a", "b", "B"], "text, not numbers; ties by case");
  assert.deepEqual(col(await get("/rest/v1/projects?select=workflow_stage&order=workflow_stage.asc"), "workflow_stage"),
    ["pdd_not_submitted", "df_review", "mt_review", "approved", "closed"]);
  assert.deepEqual(col(await get("/rest/v1/projects?select=priority&order=priority.asc.nullslast"), "priority"),
    ["top_priority", "top_priority", "second_priority", "third_priority", null]);
  assert.deepEqual(col(await get("/rest/v1/projects?select=id&order=start_date.asc,code.asc"), "id"), [id(5), id(4), id(2), id(1), id(3)],
    "dates, then a stable tie on equal codes");
  assert.deepEqual(col(await get("/rest/v1/projects?select=bac&order=bac.desc"), "bac"), [null, 100, 10, 9, 1], "desc puts nulls first, as Postgres");
  assert.deepEqual(col(await get("/rest/v1/project_raci?select=id&order=raci_role.asc,sort_order.asc"), "id"), [id(14), id(12), id(13), id(11)]);
  assert.deepEqual(col(await get("/rest/v1/project_cashflows?select=priority&order=priority.asc"), "priority"), ["First", "Top"], "cash-flow priority is plain text");
  assert.deepEqual(col(await get("/rest/v1/user_profiles?select=role&order=role.asc,username.asc"), "role"), ["pmo", "project_manager", "guest"]);
  assert.throws(() => B.installBackend({ store: { tables, meta: { pmo: { id: id(33) } } }, mode: "fictional" }), /only the live mode/);
  be.uninstall();
});

const syn = await H.syntheticSnapshot();
await battery("invented data", syn.snapshot);

const dir = process.env.SIM_FIXTURE;
if (!dir) { console.log(`SKIP fixture checks (SIM_FIXTURE unset) · ${passed} data-free checks passed`); process.exit(0); }
const fx = await H.fixtureSnapshot(dir);
await battery("fixture", fx.snapshot);
await sleep(0);
console.log(`PASS · ${passed} checks`);
process.exit(0);
