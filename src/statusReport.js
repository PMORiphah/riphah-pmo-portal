/* ═══════════════════════════════════════════════════════════════════════════
   STATUS REPORT (PMO, 10 Nov 2026): one Excel workbook with the status and
   progress of every past and current project, so nobody has to open them one
   by one. Same workbook from Past Projects and from Projects.

     Summary          headline counts for both portfolios
     Past Projects    one row per past project: money, how long open, Why Still
                      Open, the manager's latest status (% + justification),
                      a status request still waiting, last follow-up, notes
     Current Projects one row per FY 26-27 project (CAPEX and investment):
                      stage, money, % complete, dates, overdue, PCR, the latest
                      update request / answer and the latest post on Updates
     Status history   every status / update asked and given, oldest first

   No follow-up chats (PMO decision 10 Nov 2026: latest status only; the chats
   stay in the portal). Reads with the caller's token, so RLS decides what is
   in it; the buttons are PMO only. exceljs, lazily imported (fills and frozen
   panes survive, which the bundled SheetJS build drops).
   ═══════════════════════════════════════════════════════════════════════════ */

const STAGE = { pdd_not_submitted: "PDD Not Submitted", identified: "PDD Submitted", df_review: "DF Review", ed_review: "ED Review",
  mt_review: "MT Review", approved: "Approved", closed: "Closed" };
const PAST_STATUS = { open: "Open", closing: "Closing", closed: "Closed" };
const OVERALL = { on_track: "On track", at_risk: "At risk", delayed: "Delayed" };

const list = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
// Date-only values stay on their calendar day; timestamps are shown in PKT.
const day = (s) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + "T00:00:00Z"); return isNaN(d) ? null : d; };
const pkt = (s) => { if (!s) return null; const d = new Date(s); if (isNaN(d)) return null;
  const p = new Date(d.getTime() + 5 * 3600000); return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate())); };
const todayPkt = () => pkt(new Date().toISOString());
const months = (from, to) => (from && to ? Math.max(0, Math.round((to - from) / (30.44 * 86400000))) : null);
const clip = (s, n = 600) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function loadStatusData(supa, token) {
  const get = (p) => supa(p, {}, token).then(list).catch(() => []);
  const [past, pastPosts, projects, assigns, people, posts, upd] = await Promise.all([
    get("/rest/v1/past_project_summary?select=*&order=campus.asc,fiscal_year.asc,name.asc"),
    get("/rest/v1/past_project_updates?kind=in.(status,status_request)&select=past_project_id,author_name,author_role,created_at,kind,pct_complete,justification,body&order=created_at.asc"),
    get("/rest/v1/projects?select=id,code,name,portfolio,fiscal_year,campus,workflow_stage,df_recommended_amount,bac,amount_released,payments_made,pct_complete,start_date,end_date,actual_start_date,actual_end_date,pcr,scope_change&order=portfolio.asc,campus.asc,name.asc"),
    get("/rest/v1/project_assignments?select=project_id,user_id"),
    get("/rest/v1/user_profiles?select=id,full_name,username"),
    get("/rest/v1/comments?select=project_id,parent_id,author_name,author_role,body,created_at,kind,data&order=created_at.asc"),
    get("/rest/v1/project_update_status?select=*"),
  ]);
  return { past, pastPosts, projects, assigns, people, posts, upd };
}

export function shapeStatus(D, now = todayPkt()) {
  const nameOf = Object.fromEntries(D.people.map((u) => [u.id, (u.full_name || u.username || "").trim()]));
  const pmsOf = {};
  D.assigns.forEach((a) => { (pmsOf[a.project_id] ||= []).push(nameOf[a.user_id] || "—"); });
  const updOf = Object.fromEntries(D.upd.map((u) => [u.project_id, u]));
  const lastPost = {};
  D.posts.forEach((c) => { lastPost[c.project_id] = c; });          // ordered oldest first, so the last one wins
  const pastById = Object.fromEntries(D.past.map((r) => [r.id, r]));
  const projById = Object.fromEntries(D.projects.map((p) => [p.id, p]));

  const past = D.past.map((r) => {
    const approved = num(r.approved_amount), released = num(r.released_amount);
    const from = day(r.budget_release_date) || day(r.start_date) || day(r.actual_start_date);
    const why = String(r.reason_open || "").trim();
    return {
      code: r.code || "", name: r.name || "", campus: r.campus || "", fy: r.fiscal_year || "", pm: r.pm_name || "",
      status: PAST_STATUS[r.status] || r.status || "", approved, released,
      relPct: approved > 0 && released !== null ? released / approved : null,
      releaseDate: day(r.budget_release_date), openMonths: r.status === "closed" ? null : months(from, now),
      why, noProgress: /^no progress$/i.test(why),
      statusPct: num(r.status_pct), statusWhy: r.status_justification || "", statusBy: r.status_by || "", statusAt: pkt(r.status_at),
      waitingSince: pkt(r.status_pending_since), requestedBy: r.status_pending_since ? (r.status_requested_by || "") : "",
      lastFollow: day(r.last_followed_up), daysSince: num(r.days_since_followup), notes: r.notes || "",
    };
  });

  const current = D.projects.map((p) => {
    const u = updOf[p.id], c = lastPost[p.id];
    const end = day(p.end_date);
    return {
      code: p.code || "", name: p.name || "", portfolio: p.portfolio === "investment" ? "Investment" : "CAPEX", fy: p.fiscal_year || "",
      campus: p.campus || "", pm: (pmsOf[p.id] || []).join(", "), stage: STAGE[p.workflow_stage] || p.workflow_stage || "",
      df: num(p.df_recommended_amount), approved: num(p.bac), released: num(p.amount_released), payments: num(p.payments_made),
      pct: num(p.pct_complete), start: day(p.start_date), end, actualStart: day(p.actual_start_date), actualEnd: day(p.actual_end_date),
      overdue: p.workflow_stage === "approved" && end && end < now && !p.actual_end_date,
      closed: p.workflow_stage === "closed", pcr: !!p.pcr,
      waitingSince: u?.pending_since ? pkt(u.pending_since) : null, requestedBy: u?.pending_since ? (u.requested_by || "") : "",
      updAt: pkt(u?.updated_at), updBy: u?.updated_at ? (u.updated_by || "") : "", updOverall: OVERALL[u?.overall] || "", updPct: num(u?.pct),
      postAt: pkt(c?.created_at), postBy: c ? `${c.author_name || ""}${c.author_role === "pmo" ? " (PMO)" : ""}` : "", postText: c ? clip(c.body) : "",
    };
  });

  const KIND = { status: "Status given", status_request: "Status asked", update: "Update given", update_request: "Update asked" };
  const history = [
    ...D.pastPosts.map((m) => { const r = pastById[m.past_project_id] || {};
      return { where: "Past", code: r.code || "", name: r.name || "", at: pkt(m.created_at), type: KIND[m.kind] || m.kind, by: m.author_name || "",
        pct: m.kind === "status" ? num(m.pct_complete) : null, overall: "", text: clip(m.kind === "status" ? (m.justification || m.body) : m.body) }; }),
    ...D.posts.filter((c) => c.kind === "update" || c.kind === "update_request").map((c) => { const p = projById[c.project_id] || {};
      return { where: "Current", code: p.code || "", name: p.name || "", at: pkt(c.created_at), type: KIND[c.kind] || c.kind, by: c.author_name || "",
        pct: c.kind === "update" ? num(c.data?.pct) : null, overall: c.kind === "update" ? (OVERALL[c.data?.overall] || "") : "", text: clip(c.body) }; }),
  ].sort((a, b) => (a.at || 0) - (b.at || 0));

  const openPast = past.filter((r) => r.status !== "Closed");
  const withStatus = past.filter((r) => r.statusPct !== null);
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const capex = current.filter((r) => r.portfolio === "CAPEX");
  const summary = {
    past: {
      total: past.length, open: openPast.length, noProgress: openPast.filter((r) => r.noProgress).length,
      overYear: openPast.filter((r) => (r.openMonths ?? 0) > 12).length,
      withStatus: withStatus.length, avgStatusPct: avg(withStatus.map((r) => r.statusPct)),
      waiting: past.filter((r) => r.waitingSince).length, notChased: openPast.filter((r) => (r.daysSince ?? 9999) > 30).length,
      approved: past.reduce((s, r) => s + (r.approved || 0), 0), released: past.reduce((s, r) => s + (r.released || 0), 0),
    },
    current: {
      total: current.length, capex: capex.length, investment: current.length - capex.length,
      byStage: Object.values(STAGE).map((l) => [l, capex.filter((r) => r.stage === l).length]).filter(([, n]) => n),
      avgPct: avg(capex.filter((r) => r.pct !== null).map((r) => r.pct)), overdue: capex.filter((r) => r.overdue).length,
      pcr: capex.filter((r) => r.pcr).length, waiting: current.filter((r) => r.waitingSince).length,
      updated: current.filter((r) => r.updAt).length, posts: current.filter((r) => r.postAt).length,
      df: capex.reduce((s, r) => s + (r.df || 0), 0), approved: capex.reduce((s, r) => s + (r.approved || 0), 0),
      released: capex.reduce((s, r) => s + (r.released || 0), 0),
    },
  };
  return { past, current, history, summary, at: new Date() };
}

export async function buildStatusWorkbook(S) {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Riphah PMO Portal"; wb.created = S.at;
  const NAVY = "FF13294B", RULE = "FFC7D0DC", INK = "FF0D1929", SOFT = "FF3A5068";
  const RED = "FFFDE2E1", AMBER = "FFFFF1D6", GREEN = "FFE3F5EA", GREY = "FFF2F5F9";
  const stamp = S.at.toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const font = (o = {}) => ({ name: "Arial", size: 10, color: { argb: INK }, ...o });
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  // ── Summary ────────────────────────────────────────────────────────────────
  const g = wb.addWorksheet("Summary", { views: [{ showGridLines: false }], pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  g.columns = [{ width: 3 }, { width: 44 }, { width: 22 }, { width: 3 }, { width: 44 }, { width: 22 }];
  g.getCell("B2").value = "Project status report"; g.getCell("B2").font = font({ size: 18, bold: true });
  g.getCell("B3").value = `Riphah PMO Portal · as of ${stamp} PKT`; g.getCell("B3").font = font({ color: { argb: SOFT } });
  const block = (col, r0, title, rows) => {
    const L = String.fromCharCode(64 + col), V = String.fromCharCode(65 + col);
    const h = g.getCell(`${L}${r0}`); h.value = title; h.font = font({ size: 12, bold: true, color: { argb: "FFFFFFFF" } }); h.fill = fill(NAVY);
    g.getCell(`${V}${r0}`).fill = fill(NAVY);
    rows.forEach(([k, v, fmt], i) => {
      const a = g.getCell(`${L}${r0 + 1 + i}`), b = g.getCell(`${V}${r0 + 1 + i}`);
      a.value = k; b.value = v ?? "—"; a.font = font({ color: { argb: SOFT } }); b.font = font({ bold: true });
      if (fmt && v !== null && v !== undefined) b.numFmt = fmt; b.alignment = { horizontal: "right" };
      [a, b].forEach((c) => (c.border = { bottom: { style: "hair", color: { argb: RULE } } }));
    });
  };
  const P = S.summary.past, C = S.summary.current;
  block(2, 5, "Past projects", [
    ["Projects", P.total], ["Still open (open or closing)", P.open], ["Open for over a year", P.overYear],
    ["Why Still Open = No progress", P.noProgress], ["With a status from the manager", P.withStatus],
    ["Average % complete (latest statuses)", P.avgStatusPct !== null ? P.avgStatusPct / 100 : null, "0%"],
    ["Status asked, not yet given", P.waiting], ["Open, not followed up in 30 days", P.notChased],
    ["Approved (PKR)", P.approved, "#,##0"], ["Released (PKR)", P.released, "#,##0"],
  ]);
  block(5, 5, "Current projects (FY 26-27)", [
    ["Projects", C.total], ["CAPEX", C.capex], ["Investment", C.investment],
    ...C.byStage.map(([l, n]) => [`CAPEX at ${l}`, n]),
    ["Average % complete (CAPEX)", C.avgPct !== null ? C.avgPct / 100 : null, "0%"],
    ["Approved, planned finish passed", C.overdue], ["With a PCR", C.pcr],
    ["Update asked, not yet given", C.waiting], ["Updates given", C.updated], ["With a post on Updates", C.posts],
    ["DF Recommended, CAPEX (PKR)", C.df, "#,##0"], ["Approved, CAPEX (PKR)", C.approved, "#,##0"], ["Released, CAPEX (PKR)", C.released, "#,##0"],
  ]);
  const nr = 5 + Math.max(10, 13 + C.byStage.length) + 2;
  g.mergeCells(`B${nr}:F${nr + 2}`);
  const note = g.getCell(`B${nr}`);
  note.value = "Past Projects and Current Projects have one row per project; Status history lists every status or update asked and given. "
    + "Red rows: no progress (past) or planned finish passed (current). Amber: a status or update was asked and not yet given. "
    + "Follow-up chats are not included; they stay in the portal.";
  note.font = font({ size: 9.5, color: { argb: SOFT } }); note.alignment = { wrapText: true, vertical: "top" };

  // ── Table sheets ───────────────────────────────────────────────────────────
  const table = (title, cols, rows, tint) => {
    const ws = wb.addWorksheet(title, { views: [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 14 }));
    const hr = ws.getRow(1); hr.height = 30;
    hr.eachCell((c) => { c.font = font({ bold: true, color: { argb: "FFFFFFFF" } }); c.fill = fill(NAVY);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
    rows.forEach((r) => {
      const row = ws.addRow(cols.map((c) => (r[c.k] === undefined ? null : r[c.k])));
      const t = tint?.(r);
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        const c = cols[i - 1]; if (!c) return;
        cell.font = font(); cell.alignment = { vertical: "top", wrapText: !!c.wrap };
        if (c.f) cell.numFmt = c.f;
        cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
        if (t) cell.fill = fill(t);
      });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };
  const D = "dd-mmm-yyyy", M = "#,##0", PCT = "0%";

  table("Past Projects", [
    { h: "Project ID", k: "code", w: 15 }, { h: "Project Name", k: "name", w: 40, wrap: true }, { h: "Campus / Site", k: "campus", w: 14 },
    { h: "Fiscal Year", k: "fy", w: 10 }, { h: "Project Manager", k: "pm", w: 22 }, { h: "Status", k: "status", w: 10 },
    { h: "Approved (PKR)", k: "approved", w: 15, f: M }, { h: "Released (PKR)", k: "released", w: 15, f: M }, { h: "% Released", k: "relPct", w: 10, f: PCT },
    { h: "Budget Release Date", k: "releaseDate", w: 13, f: D }, { h: "Open for (months)", k: "openMonths", w: 10 },
    { h: "Why Still Open", k: "why", w: 26, wrap: true },
    { h: "Latest status: % complete", k: "statusPct100", w: 12, f: PCT }, { h: "Latest status: justification", k: "statusWhy", w: 48, wrap: true },
    { h: "Status given by", k: "statusBy", w: 18 }, { h: "Status given on", k: "statusAt", w: 13, f: D },
    { h: "Status asked, waiting since", k: "waitingSince", w: 13, f: D }, { h: "Asked by", k: "requestedBy", w: 18 },
    { h: "Last follow-up", k: "lastFollow", w: 13, f: D }, { h: "Days since follow-up", k: "daysSince", w: 10 },
    { h: "Notes", k: "notes", w: 40, wrap: true },
  ], S.past.map((r) => ({ ...r, statusPct100: r.statusPct !== null ? r.statusPct / 100 : null })),
  (r) => (r.status === "Closed" ? GREEN : r.noProgress ? RED : r.waitingSince ? AMBER : null));

  table("Current Projects", [
    { h: "Project ID", k: "code", w: 15 }, { h: "Project Name", k: "name", w: 40, wrap: true }, { h: "Portfolio", k: "portfolio", w: 11 },
    { h: "Fiscal Year", k: "fy", w: 10 }, { h: "Campus / Site", k: "campus", w: 14 }, { h: "Project Manager", k: "pm", w: 22, wrap: true },
    { h: "Stage", k: "stage", w: 15 }, { h: "DF Recommended (PKR)", k: "df", w: 15, f: M }, { h: "Approved (PKR)", k: "approved", w: 15, f: M },
    { h: "Released (PKR)", k: "released", w: 15, f: M }, { h: "Payments Made (PKR)", k: "payments", w: 15, f: M },
    { h: "% Complete", k: "pct100", w: 10, f: PCT }, { h: "Planned Start", k: "start", w: 13, f: D }, { h: "Planned End", k: "end", w: 13, f: D },
    { h: "Actual Start", k: "actualStart", w: 13, f: D }, { h: "Actual End", k: "actualEnd", w: 13, f: D },
    { h: "Planned finish passed", k: "overdueTxt", w: 10 }, { h: "PCR", k: "pcrTxt", w: 7 },
    { h: "Update asked, waiting since", k: "waitingSince", w: 13, f: D }, { h: "Asked by", k: "requestedBy", w: 18 },
    { h: "Latest update on", k: "updAt", w: 13, f: D }, { h: "Update by", k: "updBy", w: 18 }, { h: "Update: overall", k: "updOverall", w: 11 },
    { h: "Update: % complete", k: "updPct100", w: 11, f: PCT },
    { h: "Latest post on Updates", k: "postAt", w: 13, f: D }, { h: "Posted by", k: "postBy", w: 20 }, { h: "Post", k: "postText", w: 60, wrap: true },
  ], S.current.map((r) => ({ ...r, pct100: r.pct !== null ? r.pct / 100 : null, updPct100: r.updPct !== null ? r.updPct / 100 : null,
    overdueTxt: r.overdue ? "Yes" : "", pcrTxt: r.pcr ? "Yes" : "" })),
  (r) => (r.closed ? GREEN : r.overdue ? RED : r.waitingSince ? AMBER : null));

  table("Status history", [
    { h: "Portfolio", k: "where", w: 10 }, { h: "Project ID", k: "code", w: 15 }, { h: "Project Name", k: "name", w: 40, wrap: true },
    { h: "Date", k: "at", w: 13, f: D }, { h: "What", k: "type", w: 14 }, { h: "By", k: "by", w: 20 },
    { h: "% complete", k: "pct100", w: 11, f: PCT }, { h: "Overall", k: "overall", w: 11 }, { h: "Text", k: "text", w: 80, wrap: true },
  ], S.history.map((r) => ({ ...r, pct100: r.pct !== null ? r.pct / 100 : null })),
  (r) => (/given/.test(r.type) ? null : GREY));

  return wb;
}

export async function downloadStatusReport(supa, token) {
  const S = shapeStatus(await loadStatusData(supa, token));
  const wb = await buildStatusWorkbook(S);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Project_Status_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { past: S.past.length, current: S.current.length, history: S.history.length };
}
