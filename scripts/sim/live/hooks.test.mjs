// Portal hooks for the live simulation (contract §I): static check that every data-* hook the
// director relies on is in the portal source, as often as stated and next to the element it marks.
// Also checks the portal-side removals of the fictional-data branches. No data, no network.
//
//   node scripts/sim/live/hooks.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = new URL("../../../", import.meta.url).pathname;
const src = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const cache = new Map();
const lines = (f) => { if (!cache.has(f)) cache.set(f, src(f).split("\n")); return cache.get(f); };

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; } catch (e) { failures.push(`${name}: ${e.message}`); }
};

/**
 * `attr` must occur `count` times in `file` (as an exact substring), and every occurrence must have
 * one of the `near` anchors within `within` lines; every anchor must be next to some occurrence.
 */
function hook(n, file, attr, near, { count = 1, within = 3 } = {}) {
  check(`#${n} ${file} ${attr}`, () => {
    const L = lines(file);
    const at = [];
    L.forEach((l, i) => { let k = -1; while ((k = l.indexOf(attr, k + 1)) !== -1) at.push(i); });
    assert.equal(at.length, count, `found ${at.length} times, expected ${count}`);
    const anchors = Array.isArray(near) ? near : [near];
    const close = (i, a) => L.slice(Math.max(0, i - within), i + within + 1).some((l) => l.includes(a));
    for (const i of at) assert.ok(anchors.some((a) => close(i, a)), `line ${i + 1}: none of the anchors nearby`);
    for (const a of anchors) assert.ok(at.some((i) => close(i, a)), `anchor ${JSON.stringify(a)} has no hook nearby`);
  });
}

// ── §I hooks ─────────────────────────────────────────────────────────────────
const A = "src/App.jsx";
hook(1, A, 'data-tour="brand"', 'padding: mini ? "18px 10px 14px"');
hook(2, A, 'data-tour="page-title"', "<h1 ");
hook(3, A, 'data-tour="money-flow"', "<Section T={T} tone={T.gold} pad={SP.lg}");
hook(4, A, "data-tour={`hero-${label.toLowerCase()}-hint`}", "{hint}</div>", { within: 0 });
hook(5, A, 'data-tour="hero-total"', "Total CAPEX portfolio</div>");
hook(6, A, 'data-tour="projects-hero"', "ref={summaryNear}", { within: 0 });
hook(7, A, 'data-tour="sites-campus"', "value={sel} active={!!sel}", { within: 1 });
hook("8-9", A, 'data-col="pct"', ['label="% Done"', "{/* % complete */}"], { count: 2, within: 1 });
hook(10, A, 'data-col="schedule"', "r.schedule_flag", { within: 0 });
hook(11, A, 'data-tour="detail-badges"', "{evm.name}</h2>", { within: 1 });
hook(12, A, 'data-tour="detail-approved"', "Approved budget</div>", { within: 1 });
hook(13, A, "data-strip={label.toLowerCase()}", "<div key={label}", { within: 0 });
hook(14, A, 'data-tour="users-header"', "{users.length} user", { within: 1 });
hook(15, A, 'data-col="username"', "data-user={u.username}", { within: 1 });
hook(16, A, 'data-col="email"', "{u.email ||", { within: 0 });
hook(17, A, 'data-col="phone"', "editPhoneId === u.id", { within: 1 });
hook(18, A, 'data-col="fullname"', "{u.full_name ||", { within: 0 });
hook("18,20", A, 'data-col="role"', ["{rc.label}", 'label="Role"'], { count: 2, within: 1 });
hook("19,20", A, 'data-col="assigned"', ['u.role === "pmo"', "Assigned Projects</th>"], { count: 2, within: 1 });
hook(21, A, 'data-author-role={role || ""}', "data-comment={comment.id}", { within: 0 });
hook(22, A, "data-tour={`updates-tab-${tab.id}`}", "key={tab.id}", { within: 0 });
hook(23, A, 'title="Present the portal on its live data, read-only"', 'data-tour="sim-launch"', { within: 1 });

hook(24, "src/CampusCompare.jsx", "data-metric={m.label}", "key={m.label}", { within: 0 });
hook(25, "src/CampusCompare.jsx", 'data-tour="compare-summary"', "totals.projects} CAPEX projects", { within: 1 });
hook(26, "src/Timeline.jsx", 'data-tour="timeline-campus"', "value={campus}", { within: 0 });
hook(27, "src/Timeline.jsx", 'data-tour="timeline-caption"', "{scheduled.length} scheduled", { within: 1 });
hook("28a", "src/PhotoWall.jsx", "data-tour={hook}", "function FilterSelect({ T, value, onChange, label, options, hook })");
hook("28b", "src/PhotoWall.jsx", 'hook="gallery-campus"', 'label="All Campuses"', { within: 0 });
hook(29, "src/PhotoWall.jsx", 'data-tour="gallery-count"', "activeFilterCount > 0", { within: 1 });
hook(30, "src/PhotoWall.jsx", 'data-kind={isVideo(item) ? "video" : "photo"}', "data-attachment={item.id}", { within: 0 });
hook(31, "src/PastProjects.jsx", 'data-card={k.toLowerCase().replace(/\\s+/g, "-")}', 'key={k} className="past-row"', { within: 0 });
hook(32, "src/PastProjects.jsx", 'data-tour="past-search"', "Search name, ID, campus or manager", { within: 1 });
hook(34, "src/PastProjects.jsx", 'data-tour="past-thread-head"', "Follow-up {msgs", { within: 1 });
hook(35, "src/PastProjects.jsx", "data-msg={m.id} data-author-role={m.author_role}", "m.author_id !== row.pm_user_id", { within: 2 });
hook(36, "src/RiskRegister.jsx", 'data-tour="risk-header"', 'risks === null ? "Loading…"', { within: 1 });
hook(37, "src/RiskRegister.jsx", 'data-tour="risk-count"', "filtered.length} of", { within: 1 });
hook("38a", "src/BoardReport.jsx", "data-tile={hook}", "const Tile = ({ label, value, sub, delta, hook })", { within: 1 });
hook("38b", "src/BoardReport.jsx", 'hook="capex"', 'label="Total CAPEX portfolio"', { within: 0 });
hook("38c", "src/BoardReport.jsx", 'hook="approved"', 'label="Approved" value=', { within: 0 });
hook("38d", "src/BoardReport.jsx", 'hook="released"', 'label="Released" value=', { within: 0 });
hook("39a", "src/BoardReport.jsx", 'data-tour="report-attention-head"', ">Needs attention</H>", { within: 0 });
hook("39b", "src/BoardReport.jsx", 'data-tour="report-attention"', "approved_nothing_released", { within: 1 });
hook(40, "src/BoardReport.jsx", 'data-tour="report-chip"', "{chip[0]}</span>", { within: 0 });
hook("40b", "src/BoardReport.jsx", 'data-tour="report-head"', "background:C.navy, color:\"#fff\", margin:\"-36px -44px 0\"", { within: 0 });
hook("41a", "src/Cashflows.jsx", 'hook="cf-peak"', 'label="Peak month"', { within: 0 });
hook("41b", "src/Cashflows.jsx", "data-tour={hook}", "function StatTile(", { within: 8 });
hook(42, "src/InvestmentsTab.jsx", 'data-tour="inv-banner"', 'alignItems:"flex-start", gap:SP.md', { within: 1 });
hook(43, "src/InvestmentsTab.jsx", "data-inv={k.label}", "key={k.label}", { within: 0 });
hook(44, "src/InvestmentsTab.jsx", 'data-tour="inv-register"', "Investment Register", { within: 1 });
hook(45, "src/Tasks.jsx", 'data-tour="wbs-header"', "Work Breakdown</div>", { within: 1 });
hook(46, "src/Tasks.jsx", 'data-tour="wbs-empty"', "No tasks yet.", { within: 2 });

check("#33 ui.jsx SortHeader forwards data-* only", () => {
  const s = src("src/ui.jsx");
  assert.match(s, /export function SortHeader\(\{[^}]*\.\.\.rest \}\)/);
  const body = s.slice(s.indexOf("export function SortHeader("), s.indexOf("export function SortHeader(") + 400);
  assert.ok(body.includes("<th {...dataProps(rest)}"), "<th {...dataProps(rest)} missing");
  assert.match(s, /export const dataProps = \(o\) => Object\.fromEntries\(Object\.entries\(o \|\| \{\}\)\.filter\(\(\[k\]\) => k\.startsWith\("data-"\)\)\)/);
});
check("#3 Section forwards data-* (needed by money-flow)", () => {
  const s = src("src/ui.jsx");
  const at = s.indexOf("export function Section(");
  assert.ok(at > 0 && s.slice(at, at + 300).includes("<div {...dataProps(rest)}"));
});
check("#7/#26 Select and #32 Input spread ...rest on their control", () => {
  const s = src("src/ui.jsx");
  const sel = s.indexOf("export function Select("), inp = s.indexOf("export function Input(");
  assert.ok(/<button\s+\{\.\.\.rest\}/.test(s.slice(sel, sel + 6000)), "Select: <button {...rest}");
  assert.ok(/<input\s+\{\.\.\.rest\}/.test(s.slice(inp, inp + 1500)), "Input: <input {...rest}");
});

// ── existing hooks the scenes use (contract §I, "unchanged") ─────────────────
const PORTAL_FILES = ["src/App.jsx", "src/ui.jsx", "src/CampusCompare.jsx", "src/Timeline.jsx", "src/PhotoWall.jsx",
  "src/PastProjects.jsx", "src/RiskRegister.jsx", "src/BoardReport.jsx", "src/Cashflows.jsx", "src/InvestmentsTab.jsx", "src/Tasks.jsx"];
const ALL = PORTAL_FILES.map(src).join("\n");
const EXISTING_TOUR = ["hero", "kpi-strip", "investments-panel", "pipeline-stages", "payments-flow", "projects-search",
  "projects-table", "detail-hero", "detail-documents", "doc-card", "detail-wbs", "wbs-table", "perf-filters", "perf-table",
  "risk-matrix", "risk-table", "campus-view", "compare-table", "compare-mode", "compare-h2h-grid", "h2h-open", "h2h-pms",
  "assign-pm", "pm-select", "bulk-preview", "users-table", "updates-list", "updates-thread", "past-cards", "past-thread",
  "gallery-grid", "lightbox", "report-viewer", "report-summary", "report-toolbar", "report-back", "team-about", "team-org",
  "team-contact", "timeline", "timeline-card", "cf-monthly", "cf-pmdc", "sim-launch"];
for (const t of EXISTING_TOUR) check(`existing data-tour="${t}"`, () => assert.ok(new RegExp(`(data-tour|hook)="${t}"`).test(ALL)));
const EXISTING_ATTR = ["data-kpi", "data-stage", "data-cell", "data-risk", "data-campus", "data-view", "data-mode", "data-col",
  "data-user", "data-comment", "data-project-id", "data-past", "data-report", "data-attachment", "data-member", "data-file",
  "data-filter", "data-wbs-row", "data-value"];
for (const a of EXISTING_ATTR) check(`existing ${a}`, () => assert.ok(ALL.includes(`${a}=`)));

// ── Simulation button and removals (contract §A, B4) ─────────────────────────
check("Simulation button: live tooltip, getSession passed, no 'fictional'", () => {
  const s = src(A);
  const at = s.indexOf("function SidebarSimButton(");
  const body = s.slice(at, s.indexOf("\nfunction Sidebar(", at));
  assert.ok(at > 0 && body.length > 0);
  assert.ok(!/fictional/i.test(body), "SidebarSimButton mentions 'fictional'");
  assert.ok(body.includes("getSession={getSession}"), "SimLauncher gets getSession");
  assert.ok(!body.includes("supa={supa}"), "SimLauncher no longer gets supa");
  assert.ok(s.includes("const getSession = useCallback(() => sessionRef.current, []);"));
  assert.ok(s.includes("<SidebarSimButton T={T} session={session} getSession={getSession} />"));
});
check("stopAll on sign-out: guarded, lazy, never in production", () => {
  const s = src(A);
  assert.ok(!/^import[^\n]*simBridge/m.test(s), "App.jsx must not import simBridge statically");
  const fn = s.slice(s.indexOf("function stopSimBridge()"), s.indexOf("function stopSimBridge()") + 260);
  assert.ok(fn.includes("if (!SIM_ENABLED || !simBridgeUsed) return;"), "guard");
  assert.ok(fn.includes('import("./simBridge.js").then((m) => m.stopAll?.())'), "lazy import");
  assert.ok(s.includes("useEffect(() => { if (!session) stopSimBridge(); }, [session]);"), "effect on session end");
  assert.ok(/const handleLogout = async \(\) => \{\n\s+stopSimBridge\(\);/.test(s), "handleLogout stops first");
  assert.ok(s.includes("simBridgeUsed = true; setOpen(true);"), "flag set when the launcher opens");
  assert.equal((s.match(/import\("\.\/simBridge\.js"\)/g) || []).length, 1);
});
check("WelcomeEmail.jsx: no simulation branch", () => {
  const s = src("src/WelcomeEmail.jsx");
  for (const bad of ["IN_SIM", "__PMO_SIM__", "sim/files", "simulation.example"]) assert.ok(!s.includes(bad), bad);
  assert.ok(s.includes('const PORTAL = "https://pmoriphah.github.io/riphah-pmo-portal/";'));
  assert.ok(s.includes('new URL(import.meta.env.BASE_URL || "/", window.location.origin).href'));
});
check("AskPanel.jsx: portal starters only", () => {
  const s = src("src/AskPanel.jsx");
  assert.ok(!s.includes("__PMO_SIM__"));
  assert.ok(!s.includes("starters()"));
  assert.ok(s.includes("(isPM ? PM_STARTERS : STARTERS).map("));
});
check("fictional assets removed, fonts kept", () => {
  for (const p of ["src/sim/data", "public/sim/files", "scripts/sim/gen.mjs", "scripts/sim/assets.mjs"])
    assert.ok(!fs.existsSync(path.join(REPO, p)), `${p} still exists`);
  assert.ok(fs.existsSync(path.join(REPO, "public/sim/fonts/fonts.css")), "public/sim/fonts/fonts.css missing");
});

// Not a failure here (other streams own these files), but reported: code still pointing at removed files.
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : /\.(m?js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : []) : [];
const stale = [...walk(path.join(REPO, "src")), ...walk(path.join(REPO, "scripts/sim"))]
  .filter((f) => !f.endsWith("hooks.test.mjs"))
  .filter((f) => /(from\s+|import\()\s*["'`][^"'`]*(\.\/data\/|sim\/data\/)|path\.join\([^)]*src\/sim\/data/.test(fs.readFileSync(f, "utf8")))
  .map((f) => path.relative(REPO, f));

if (stale.length) console.log(`WARN still importing src/sim/data: ${stale.join(", ")}`);
if (failures.length) {
  for (const f of failures) console.log("FAIL", f);
  console.log(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`PASS hooks.test.mjs: ${passed} checks`);
