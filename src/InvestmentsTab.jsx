import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { TrendingUp, Plus, ArrowRightLeft, Search, X, Check, Pencil, Receipt, ArrowUpRight } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { EmptyState, Skeleton, Button, Input, Select, Badge, Modal, useViewport, CAN_HOVER } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   INVESTMENTS

   A portfolio that sits alongside CAPEX rather than inside it. Projects here
   are excluded from every CAPEX total by a single WHERE clause in
   portfolio_metrics, so the headline figures cannot drift as this grows.

   Two ways in: create one directly, or move an existing project across. The
   transfer is a portfolio change on the same row — the project keeps its id,
   history, attachments and audit trail rather than being copied.

   Payments Made (PMO, 21 Oct 2026): investment projects only. The sixth card
   totals the itemised payments in project_payments (gross) and opens every
   payment in full. CAPEX projects keep their single projects.payments_made
   figure; nothing here touches it. The read is separate from the other two,
   so a failure shows "—" on the card instead of breaking the tab.

   The simulation leaves the card out: its live snapshot does not carry
   project_payments yet, so it could only ever show 0 while the real portal
   shows the recorded payments. Adding the table to the snapshot (schema.js /
   requests.js) is a separate change for the PMO to approve.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAY_PATH = "/rest/v1/project_payments?select=id,project_id,paid_on,dept,payee,particulars,gross,tax,net,source&order=paid_on.asc";
const MIN_CARD = 190;   // px; the strip's narrowest card, as before the sixth card
// simulation.html marks its <html> (scripts/sim/make-sim-html.mjs); see the note above.
const IN_SIM = typeof document !== "undefined" && document.documentElement.hasAttribute("data-pmo-sim");
// Old browsers throw on an unknown pseudo-class; treat that as "not keyboard focus".
const focusVisible = (el) => { try { return el.matches(":focus-visible"); } catch { return false; } };

// Amounts are summed in paisa so 43,003,738.50 + 395,000 never drifts.
const paisa = (v) => { const n = Number(v); return v == null || v === "" || !isFinite(n) ? 0 : Math.round(n * 100); };
// Full rupees with separators; paisa only when the amount is not whole.
const fmtPKR = (v) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  const whole = Math.round(n * 100) % 100 === 0;
  return n.toLocaleString("en-PK", whole
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// "2026-09-16" → "16 Sep 2026", read as a calendar date (no time zone shift).
const fmtDay = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : "—";
};
// Tax and net may be left empty on a payment (gross may not). A missing figure
// is never counted as 0: the totals carry how many were missing, and the window
// says so next to the figure (or shows "—" when none was recorded).
const missing = (v) => v == null || v === "" || !isFinite(Number(v));
const totalsOf = (list) => {
  const t = { gross: 0, tax: 0, net: 0 }, miss = { gross: 0, tax: 0, net: 0 };
  for (const x of list) for (const k of ["gross", "tax", "net"]) {
    if (missing(x[k])) miss[k]++; else t[k] += paisa(x[k]);
  }
  return { gross: t.gross / 100, tax: t.tax / 100, net: t.net / 100, miss, count: list.length };
};
const AMOUNTS = [["Gross", "gross"], ["Tax", "tax"], ["Net", "net"]];
// One amount for display. A payment row shows its own figure ("—" when empty);
// a total adds "1 without tax" when some payments have none, "—" when all lack it.
const amountOf = (v, k) => {
  if (!v.miss) return { text: fmtPKR(v[k]), note: null, title: null };
  const m = v.miss[k], n = v.count;
  if (!m) return { text: fmtPKR(v[k]), note: null, title: null };
  if (m >= n) return { text: "—", note: "not recorded",
    title: `${k === "net" ? "Net" : k === "tax" ? "Tax" : "Gross"} is not recorded on any of these payments.` };
  return { text: fmtPKR(v[k]), note: `${m} without ${k}`,
    title: `${k === "net" ? "Net" : k === "tax" ? "Tax" : "Gross"} is not recorded on ${m} of ${n} payments; this total covers the other ${n - m}.` };
};

export function InvestmentsTab({
  T, session, supa, canManage, onSelectProject, fmtFull, fmtM,
  STAGE_META, PRIORITY_META, sortByActivity, onPortfolioChange, MobileProjectCard,
  ProjectFormModal,
}) {
  const vpI = useViewport();
  const [rows, setRows]       = useState([]);
  const [totals, setTotals]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editProject, setEditProject]   = useState(null);
  const [lookups,     setLookups]       = useState(null);
  const [opening,     setOpening]       = useState(null);
  const [payments,    setPayments]      = useState([]);
  const [payFailed,   setPayFailed]     = useState(false);
  const [payOpen,     setPayOpen]       = useState(false);
  // Highlight from a real pointer hover or keyboard focus only. Focus that
  // returns to the card after a mouse or tap close is not keyboard focus, and
  // a tap's mouseenter never gets its mouseleave on a touch screen.
  const [payHover,    setPayHover]      = useState(false);
  const [payKbd,      setPayKbd]        = useState(false);
  const [stripW,      setStripW]        = useState(0);
  const payCardRef = useRef(null);
  const stripObs   = useRef(null);

  // Six cards in one row when each still gets MIN_CARD, else three, two or one
  // per row, so the strip never leaves a lone card on a second line.
  const stripRef = useCallback((node) => {
    stripObs.current?.disconnect();
    stripObs.current = null;
    if (!node) return;
    setStripW(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setStripW(Math.round(e.contentRect.width)));
    ro.observe(node);
    stripObs.current = ro;
  }, []);
  useEffect(() => () => stripObs.current?.disconnect(), []);

  // Never rejects: a failed read must leave the rest of the tab working.
  // Not read in the simulation, which leaves the card out (see the note above).
  const readPayments = useCallback(() => IN_SIM ? Promise.resolve({ ok: true, rows: [] }) :
    supa(PAY_PATH, {}, session.access_token).then(
      (r) => ({ ok: true, rows: Array.isArray(r) ? r : [] }),
      () => ({ ok: false, rows: [] })),
  [supa, session]);

  // Editing an investment project used to mean moving it to CAPEX, editing it
  // there and moving it back. The form is the same one the register uses; it
  // just needs two things this tab does not already hold.
  //
  // The rows here come from the project_metrics view, which omits the id
  // columns the form binds to (sector, region, segment, cost centre, campus),
  // so the full row is fetched before opening. The lookups are fetched once,
  // on first edit, rather than on every dashboard load.
  const openEdit = async (row) => {
    setOpening(row.id);
    try {
      const [[full], sectors, regions, segments, cost_centers, campuses] = await Promise.all([
        supa(`/rest/v1/projects?id=eq.${row.id}&select=*`, {}, session.access_token),
        lookups ? Promise.resolve(lookups.sectors)      : supa("/rest/v1/sectors?select=id,name&order=name.asc", {}, session.access_token),
        lookups ? Promise.resolve(lookups.regions)      : supa("/rest/v1/regions?select=id,name&order=name.asc", {}, session.access_token),
        lookups ? Promise.resolve(lookups.segments)     : supa("/rest/v1/segments?select=id,name&order=name.asc", {}, session.access_token),
        lookups ? Promise.resolve(lookups.cost_centers) : supa("/rest/v1/cost_centers?select=id,name&order=name.asc", {}, session.access_token),
        lookups ? Promise.resolve(lookups.campuses)     : supa("/rest/v1/campuses?select=id,name&order=name.asc", {}, session.access_token),
      ]);
      setLookups({ sectors, regions, segments, cost_centers, campuses });
      setEditProject(full || null);
      if (!full) setErr("That project could not be loaded for editing.");
    } catch (e) { setErr(e.message); }
    setOpening(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, agg, pay] = await Promise.all([
        supa("/rest/v1/project_metrics?portfolio=eq.investment&select=*&order=su_requested_amount.desc",
             {}, session.access_token),
        supa("/rest/v1/investment_metrics?select=*", {}, session.access_token),
        readPayments(),
      ]);
      setRows(Array.isArray(items) ? items : []);
      setTotals(Array.isArray(agg) ? agg[0] : agg);
      setPayments(pay.rows);
      setPayFailed(!pay.ok);
      setErr(null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [supa, session, readPayments]);

  const retryPayments = useCallback(async () => {
    const pay = await readPayments();
    setPayments(pay.rows);
    setPayFailed(!pay.ok);
  }, [readPayments]);

  // Only payments on the investment projects listed here count; anything else
  // the reader may see (a CAPEX row, a project since moved) is left out.
  const pay = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const list = payments.filter((x) => ids.has(x.project_id));
    return { list, n: list.length, projects: new Set(list.map((x) => x.project_id)).size, ...totalsOf(list) };
  }, [rows, payments]);

  const openPay = () => { setPayHover(false); setPayOpen(true); };
  const closePay = useCallback(() => {
    setPayOpen(false);
    // Back to the card that opened the window, for keyboard and screen readers.
    requestAnimationFrame(() => payCardRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const move = async (projectId, to) => {
    try {
      await supa(`/rest/v1/projects?id=eq.${projectId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ portfolio: to }),
      }, session.access_token);
      await load();
      // Every CAPEX headline figure just changed. Tell the dashboard to
      // re-read so the hero total is right immediately rather than after a
      // reload — the figure and the register must never disagree.
      await onPortfolioChange?.();
      return true;
    } catch (e) { setErr(e.message); return false; }
  };

  const kpis = totals ? [
    { label: "Investment Projects", value: String(totals.total_projects || 0),
      sub: "Outside the CAPEX portfolio", c: T.violet },
    { label: "Total Requested", value: fmtFull(totals.su_requested_total),
      sub: "SU requested across investments", c: T.info },
    { label: "Recommended", value: fmtFull(totals.df_recommended_total),
      sub: "Through finance review", c: T.info },
    { label: "Approved", value: fmtFull(totals.approved_total),
      sub: `${totals.approved_count || 0} sanctioned`, c: T.positive },
    { label: "Released", value: fmtFull(totals.released_total),
      sub: "Budget released to date", c: T.positive },
    ...(IN_SIM ? [] : [{ label: "Payments Made", value: payFailed ? "—" : fmtFull(pay.gross),
      sub: payFailed ? "Payments could not be loaded just now"
         : pay.n ? `${pay.n} payment${pay.n === 1 ? "" : "s"} · gross` : "No payments listed yet",
      c: T.cyan, opens: true }]),
  ] : [];
  const gap = SP.md;
  // Six cards: 6, 3, 2 or 1 per row. Five (the simulation): the strip as it was.
  const cols = stripW && kpis.length === 6
    ? ([6, 3, 2].find((c) => (stripW - (c - 1) * gap) / c >= MIN_CARD) || 1) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:SP.lg }}>

      {/* A statement of what this tab is, because a figure sitting beside the
          CAPEX dashboard needs to say plainly that it is not part of it. */}
      <div data-tour="inv-banner" style={{
        display:"flex", alignItems:"flex-start", gap:SP.md,
        padding:`${SP.md}px ${SP.lg}px`, borderRadius:R.md,
        background:`${T.violet}${T.wash}`, borderLeft:`2px solid ${T.violet}`,
      }}>
        <TrendingUp size={15} color={T.violet} style={{ marginTop:2, flexShrink:0 }} />
        <div>
          <div style={{ ...TYPE.label, color:T.textOf(T.violet) }}>Separate portfolio</div>
          <div style={{ ...TYPE.caption, color:T.textSoft, marginTop:3, lineHeight:1.55 }}>
            Investment projects are tracked apart from CAPEX FY 26-27. Their values and
            counts are excluded from every CAPEX total on this dashboard.
          </div>
        </div>
      </div>

      {/* KPI strip */}
      {loading ? <Skeleton T={T} height={92} /> : (
        <div ref={stripRef} style={{ display:"grid", gap,
          gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))`
                                    : `repeat(auto-fit, minmax(min(${MIN_CARD}px,100%), 1fr))` }}>
          {kpis.map((k, i) => {
            // Payments Made is the one card that opens something: a button for
            // keyboard and screen readers, with the same calm lift as the
            // portal's other clickable cards.
            const hot = k.opens && (payHover || payKbd);
            const act = k.opens ? {
              ref: payCardRef, role: "button", tabIndex: 0, "aria-haspopup": "dialog",
              "aria-label": `${k.label}: ${k.value === "—" ? "not available" : "PKR " + k.value}, ${k.sub}. Show every payment`,
              onClick: openPay,
              onKeyDown: (e) => {
                if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); openPay(); }
              },
              onMouseEnter: CAN_HOVER ? () => setPayHover(true) : undefined,
              onMouseLeave: () => setPayHover(false),
              onFocus: (e) => setPayKbd(focusVisible(e.currentTarget)), onBlur: () => setPayKbd(false),
            } : null;
            return (
            <div key={k.label} data-inv={k.label} {...act} className={k.opens ? "pmo-in pmo-lift pmo-focusable" : "pmo-in"} style={{
              background: hot
                ? `linear-gradient(158deg, ${T.surfaceRaised} 0%, ${T.surface} 58%, ${k.c}${T.wash} 100%)`
                : T.surface,
              border:`1px solid ${hot ? k.c + "66" : T.border}`, borderRadius:R.lg,
              padding:`${SP.md}px ${SP.lg}px`, boxShadow: hot ? T.glowSoft(k.c) : T.shadow,
              animationDelay:`${i * 55}ms`,
              ...(k.opens ? {
                position:"relative", cursor:"pointer", outlineOffset:2,
                transition:`transform ${MOTION.base}, box-shadow ${MOTION.base}, border-color ${MOTION.base}, background ${MOTION.base}`,
              } : null),
            }}>
              {k.opens && (
                <ArrowUpRight size={14} aria-hidden="true" style={{
                  position:"absolute", top:SP.md, right:SP.md, color:T.textOf(k.c),
                  opacity: hot ? 1 : 0.55, transform: hot ? "translate(1px,-1px)" : "none",
                  transition:`opacity ${MOTION.base}, transform ${MOTION.base}`,
                }} />
              )}
              <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>{k.label}</div>
              <div style={{ ...TYPE.metric, color:T.textOf(k.c) }}>{k.value}</div>
              <div style={{ ...TYPE.caption, color:T.dim, marginTop:4 }}>{k.sub}</div>
            </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {canManage && (
        <div style={{ display:"flex", gap:SP.sm, flexWrap:"wrap" }}>
          <Button T={T} variant="primary" size="sm" icon={ArrowRightLeft}
            onClick={() => setTransferOpen(true)}>
            Move a project here from CAPEX
          </Button>
        </div>
      )}

      {err && <div style={{ ...TYPE.caption, color:T.textOf(T.danger) }}>{err}</div>}

      {/* Register */}
      <div style={{ background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:R.lg, boxShadow:T.shadow, overflow:"hidden" }}>
        <div style={{ padding:`${SP.md}px ${SP.lg}px`, borderBottom:`1px solid ${T.border}` }}>
          <div data-tour="inv-register" style={{ ...TYPE.label, color:T.muted }}>
            Investment Register{rows.length ? ` (${rows.length})` : ""}
          </div>
        </div>

        {loading ? (
          <div style={{ padding:SP.lg }}><Skeleton T={T} height={160} /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding:SP.xl }}>
            <EmptyState T={T} icon={TrendingUp} compact tone={T.violet}
              title="No investment projects yet"
              message={canManage
                ? "Move a project across from the CAPEX portfolio, or create one from the Projects page and set its portfolio to Investment."
                : "Investment projects will appear here once the PMO adds them."} />
          </div>
        ) : vpI.isCompact ? (
          <div style={{ display:"flex", flexDirection:"column", gap:SP.sm, padding:SP.md }}>
            {sortByActivity(rows).map((p, i) => (
              <MobileProjectCard key={p.id} T={T} project={p} onSelect={onSelectProject} index={i}
                badges={<>
                  <Badge T={T} color={STAGE_META[p.workflow_stage]?.color} size="sm">
                    {STAGE_META[p.workflow_stage]?.label || p.workflow_stage}
                  </Badge>
                  {p.priority && <Badge T={T} color={PRIORITY_META[p.priority]?.color} size="sm" dot>
                    {PRIORITY_META[p.priority]?.label}
                  </Badge>}
                </>}
                metrics={[
                  { label:"Requested", value:fmtFull(p.su_requested_amount) },
                  { label:"Recommended", value:fmtFull(p.df_recommended_amount) },
                  { label:"Approved", value:fmtFull(p.bac), color:T.textOf(T.positive) },
                ]}
                rightSlot={canManage ? (
                  // Both actions share one slot. A second rightSlot on the same
                  // element is silently discarded — JSX keeps the last prop —
                  // so the first one renders nothing and looks like a no-op.
                  <div style={{ display:"flex", gap:6, marginLeft:"auto", alignItems:"center" }}>
                    <button className="pmo-focusable pmo-btn" aria-label="Edit this project"
                      disabled={opening === p.id}
                      onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                      style={{ background:"transparent", border:`1px solid ${T.border}`,
                        borderRadius:R.sm, color:T.muted, padding:"5px 9px",
                        cursor: opening === p.id ? "default" : "pointer" }}>
                      <Pencil size={13} />
                    </button>
                    <button className="pmo-focusable pmo-btn"
                      title="Move back to the CAPEX portfolio"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(
                          `Move "${p.name}" back to the CAPEX portfolio?\n\n` +
                          `Its value will be included in the CAPEX totals again.`))
                          move(p.id, "capex");
                      }}
                      style={{ background:"transparent", border:`1px solid ${T.border}`,
                        borderRadius:R.sm, color:T.muted, cursor:"pointer",
                        padding:"5px 9px", ...TYPE.caption, whiteSpace:"nowrap" }}>
                      Move to CAPEX
                    </button>
                  </div>
                ) : undefined} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth: vpI.isCompact ? 820 : undefined }}>
              <thead>
                <tr>
                  {["#","Project ID","Project Name","Stage","Priority",
                    "Requested","Recommended","Approved","Released",""].map((h, i) => (
                    <th key={h + i} style={{
                      ...TYPE.label, color:T.muted, textAlign: i >= 5 && i <= 8 ? "right" : "left",
                      padding:"10px 12px", whiteSpace:"nowrap",
                      background:T.surfaceRaised, boxShadow:`inset 0 -1px 0 ${T.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortByActivity(rows).map((p, i) => (
                  <tr key={p.id}
                    onClick={() => onSelectProject?.(p.id)}
                    style={{ cursor:"pointer", background: i % 2 ? T.rowAlt : "transparent" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 ? T.rowAlt : "transparent"}>
                    <td style={cell(T)}>{i + 1}</td>
                    <td style={{ ...cell(T), ...TYPE.mono, fontSize:11.5, color:T.muted }}>
                      {p.code && p.code !== "-" ? p.code : "—"}
                    </td>
                    <td data-peek={p.name} style={{ ...cell(T), maxWidth:280, overflow:"hidden",
                      textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500 }}>{p.name}</td>
                    <td style={cell(T)}>
                      <Badge T={T} color={STAGE_META[p.workflow_stage]?.color} size="sm">
                        {STAGE_META[p.workflow_stage]?.label || p.workflow_stage}
                      </Badge>
                    </td>
                    <td style={cell(T)}>
                      <span style={{ ...TYPE.caption, color:T.muted }}>
                        {PRIORITY_META[p.priority]?.label || "—"}
                      </span>
                    </td>
                    <td style={{ ...cell(T), textAlign:"right" }}>{fmtFull(p.su_requested_amount)}</td>
                    <td style={{ ...cell(T), textAlign:"right" }}>{fmtFull(p.df_recommended_amount)}</td>
                    <td style={{ ...cell(T), textAlign:"right", color:T.textOf(T.positive) }}>{fmtFull(p.bac)}</td>
                    <td style={{ ...cell(T), textAlign:"right" }}>{fmtFull(p.amount_released)}</td>
                    <td style={{ ...cell(T), textAlign:"right", whiteSpace:"nowrap" }}>
                      {canManage && (
                        <button className="pmo-focusable pmo-btn"
                          title="Edit this project"
                          disabled={opening === p.id}
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          style={{ background:"transparent", border:`1px solid ${T.border}`,
                            borderRadius:R.sm, padding:"4px 7px", marginRight:6,
                            color:T.muted, cursor: opening === p.id ? "default" : "pointer",
                            verticalAlign:"middle" }}>
                          <Pencil size={12} />
                        </button>
                      )}
                      {canManage && (
                        <button className="pmo-focusable pmo-btn"
                          title="Move back to the CAPEX portfolio"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(
                              `Move "${p.name}" back to the CAPEX portfolio?\n\n` +
                              `Its value will be included in the CAPEX totals again.`))
                              move(p.id, "capex");
                          }}
                          style={{ background:"transparent", border:`1px solid ${T.border}`,
                            borderRadius:R.sm, color:T.muted, cursor:"pointer",
                            padding:"3px 8px", ...TYPE.caption, whiteSpace:"nowrap" }}>
                          Move to CAPEX
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editProject && ProjectFormModal && (
        <ProjectFormModal T={T} session={session} project={editProject} lookups={lookups}
          onClose={() => setEditProject(null)}
          onSaved={async () => {
            setEditProject(null);
            await load();
            // Budget fields may have changed, and investment totals feed the
            // dashboard's split of the portfolio, so let it re-read too.
            await onPortfolioChange?.();
          }} />
      )}

      {transferOpen && (
        <TransferModal T={T} session={session} supa={supa}
          STAGE_META={STAGE_META} fmtFull={fmtFull}
          onClose={() => setTransferOpen(false)}
          onMove={async (id) => { const ok = await move(id, "investment"); if (ok) setTransferOpen(false); }} />
      )}

      {payOpen && (
        <PaymentsModal T={T} rows={rows} pay={pay} failed={payFailed} canManage={canManage}
          isCompact={vpI.isCompact} onClose={closePay} onRetry={retryPayments}
          onSelectProject={onSelectProject ? (id) => { setPayOpen(false); onSelectProject(id); } : null} />
      )}
    </div>
  );
}

const cell = (T) => ({
  ...TYPE.bodySm, color:T.text, padding:"9px 12px",
  borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap",
});

/* Pick a CAPEX project to move across. Searchable, because choosing from 110
   projects in a dropdown is worse than typing three letters. */
function TransferModal({ T, session, supa, onClose, onMove, STAGE_META, fmtFull }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    supa("/rest/v1/projects?portfolio=eq.capex&select=id,code,name,workflow_stage,su_requested_amount&order=name.asc",
         {}, session.access_token)
      .then(r => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [supa, session]);

  const shown = useMemo(() => {
    if (!rows) return null;
    const term = q.trim().toLowerCase();
    if (!term) return rows.slice(0, 60);
    return rows.filter(r =>
      (r.name || "").toLowerCase().includes(term) ||
      (r.code || "").toLowerCase().includes(term)).slice(0, 60);
  }, [rows, q]);

  return (
    <Modal T={T} title="Move a project to Investments" onClose={onClose} width={640}>
      <div style={{ ...TYPE.caption, color:T.textSoft, marginBottom:SP.md, lineHeight:1.6 }}>
        The project keeps its ID, history, documents and site visit media — only which
        portfolio it belongs to changes. Its value is removed from the CAPEX totals
        immediately.
      </div>

      <Input T={T} icon={Search} value={q} full
        onChange={e => setQ(e.target.value)}
        onClear={() => setQ("")}
        placeholder="Search by project name or ID…" />

      <div className="pmo-scroll" style={{ maxHeight:360, overflowY:"auto", marginTop:SP.md }}>
        {shown === null ? <Skeleton T={T} height={140} />
        : shown.length === 0 ? (
          <div style={{ ...TYPE.bodySm, color:T.muted, padding:SP.lg, textAlign:"center" }}>
            No CAPEX project matches that.
          </div>
        ) : shown.map(p => (
          <div key={p.id} style={{
            display:"flex", alignItems:"center", gap:SP.md,
            padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.sm,
            borderBottom:`1px solid ${T.border}`,
          }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ ...TYPE.bodySm, color:T.text, overflow:"hidden",
                textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
              <div style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>
                {p.code && p.code !== "-" ? p.code + " · " : ""}
                {STAGE_META[p.workflow_stage]?.label || p.workflow_stage}
                {" · "}{fmtFull(p.su_requested_amount)}
              </div>
            </div>
            <Button T={T} size="sm" variant="subtle" icon={ArrowRightLeft}
              loading={busy === p.id}
              onClick={async () => { setBusy(p.id); await onMove(p.id); setBusy(null); }}>
              Move
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* Every payment on the investment projects, grouped by project. Read-only:
   payments are recorded by the PMO in project_payments. Desktop gets a table
   per project; a phone gets stacked cards, so nothing scrolls sideways. */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PaymentsModal({ T, rows, pay, failed, canManage, isCompact, onClose, onRetry, onSelectProject }) {
  const topRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
  const [avatarRoom, setAvatarRoom] = useState(0);

  // The assistant's launcher floats above every window (bottom right; on phones
  // above the bottom bar). When it sits over the lower part of this window,
  // leave that much room under the last payment so it can scroll clear of it.
  useEffect(() => {
    const measure = () => {
      const sc = topRef.current?.parentElement;           // the Modal's scrolling body
      const av = document.querySelector('[data-tour="assistant-launcher"]');
      if (!sc || !av) { setAvatarRoom(0); return; }
      const a = av.getBoundingClientRect(), s = sc.getBoundingClientRect();
      const over = a.width > 0 && a.left < s.right && a.right > s.left && a.top < s.bottom && a.bottom > s.top;
      const up = s.bottom - a.top;                         // how far up from the window's bottom it reaches
      setAvatarRoom(over && up > 0 && up < s.height / 2 ? Math.min(Math.round(up), 220) : 0);
    };
    measure();
    const t = setTimeout(measure, 260);                    // again once the window's entrance has settled
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, []);

  // The shared Modal sets no initial focus and does not keep Tab inside. Start
  // on its Close button, and wrap Tab / Shift+Tab at the window's first and last
  // control so the keyboard never lands on the page behind the backdrop. Focus
  // elsewhere on purpose (e.g. the assistant opened with the mouse) is left alone.
  useEffect(() => {
    const dlg = topRef.current?.closest('[role="dialog"]');
    if (!dlg) return;
    dlg.setAttribute("aria-label", "Payments Made");
    dlg.querySelector("button")?.focus({ preventScroll: true });
    const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const onKey = (e) => {
      if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const a = document.activeElement;
      const inside = !!a && dlg.contains(a);
      if (!inside && a && a !== document.body) return;
      const list = [...dlg.querySelectorAll(TABBABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      const wrap = !inside || (e.shiftKey ? !list.some((el) => follows(el, a)) : !list.some((el) => follows(a, el)));
      if (wrap) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => rows
    .map((p) => {
      const items = pay.list.filter((x) => x.project_id === p.id)
        .sort((a, b) => (a.paid_on || "9999").localeCompare(b.paid_on || "9999"));
      return { p, items, ...totalsOf(items) };
    })
    .filter((g) => g.items.length), [rows, pay]);

  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const num = { fontVariantNumeric:"tabular-nums" };

  const body = failed ? (
    <EmptyState T={T} icon={Receipt} compact tone={T.warning}
      title="Payments could not be loaded"
      message="The rest of the Investments tab is unaffected. Try again in a moment."
      action={<Button T={T} size="sm" variant="subtle" loading={retrying}
        onClick={async () => { setRetrying(true); await onRetry?.(); setRetrying(false); }}>Try again</Button>} />
  ) : pay.n === 0 ? (
    <EmptyState T={T} icon={Receipt} compact tone={T.cyan}
      title="No payments listed yet"
      message="Payments made on investment projects will be listed here, in full, once they are recorded." />
  ) : (
    <div style={{ paddingBottom: avatarRoom }}>
      {/* One line: how many, on how many projects, and the three totals. */}
      <div data-pay="summary" style={{
        display:"flex", flexWrap:"wrap", alignItems:"center", gap:`${SP.sm}px ${SP.lg}px`,
        padding:`${SP.md}px ${SP.lg}px`, borderRadius:R.md, marginBottom:SP.xl,
        background:`${T.cyan}${T.wash}`, borderLeft:`2px solid ${T.cyan}`,
      }}>
        <div style={{ ...TYPE.bodySm, color:T.text, flex:"1 1 220px", minWidth:0 }}>
          <strong>{plural(pay.n, "payment")}</strong> on <strong>{plural(pay.projects, "investment project")}</strong>
        </div>
        {AMOUNTS.map(([l, k]) => {
          const a = amountOf(pay, k);
          return (
            <div key={k} data-pay-total={k} title={a.title || undefined} style={{ whiteSpace:"nowrap" }}>
              <span style={{ ...TYPE.label, color:T.muted, marginRight:6 }}>{l}</span>
              <span style={{ ...TYPE.bodySm, ...num, fontWeight:600,
                color: k === "gross" ? T.textOf(T.cyan) : T.text }}>{a.text === "—" ? "—" : `PKR ${a.text}`}</span>
              {a.note && <span data-pay-partial style={{ ...TYPE.caption, color:T.dim, marginLeft:6 }}>({a.note})</span>}
            </div>
          );
        })}
      </div>

      {groups.map((g, gi) => {
        const name = (g.p.name || "").trim() || "Untitled project";
        const code = g.p.code && g.p.code !== "-" ? g.p.code : null;
        // PMO only: the project's own Payments Made figure, when it does not
        // match the itemised payments, so the two can be reconciled. Information,
        // not an error, so it is muted and says why it is there.
        const differs = canManage && paisa(g.p.payments_made) !== Math.round(g.gross * 100);
        return (
          <section key={g.p.id} data-pay-project={code || g.p.id} style={{ marginTop: gi ? SP.xl : 0 }}>
            <div style={{ display:"flex", alignItems:"baseline", flexWrap:"wrap", gap:`2px ${SP.sm}px`, marginBottom:SP.sm }}>
              {onSelectProject ? (
                <button className="pmo-focusable pmo-btn" title="Open this project"
                  onClick={() => onSelectProject(g.p.id)}
                  style={{ ...TYPE.h3, color:T.text, background:"none", border:"none", padding:0,
                    cursor:"pointer", textAlign:"left", overflowWrap:"anywhere" }}>{name}</button>
              ) : <span style={{ ...TYPE.h3, color:T.text, overflowWrap:"anywhere" }}>{name}</span>}
              {code && <span style={{ ...TYPE.mono, fontSize:11.5, color:T.muted }}>{code}</span>}
              <span style={{ ...TYPE.caption, color:T.dim }}>· {plural(g.items.length, "payment")}</span>
            </div>
            {differs && (
              <div data-pay-note title="Shown to the PMO only, to reconcile the project's Payments Made figure with the payments listed here."
                style={{ ...TYPE.caption, color:T.muted, marginBottom:SP.sm, lineHeight:1.5 }}>
                Payments Made on the project record: PKR {fmtPKR(g.p.payments_made ?? 0)}
                {" · "}differs from the PKR {fmtPKR(g.gross)} listed here
              </div>
            )}

            {isCompact ? (
              <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
                {g.items.map((x) => (
                  <div key={x.id} data-pay-row style={{ minWidth:0, padding:SP.md, borderRadius:R.md,
                    border:`1px solid ${T.border}`, background:T.surfaceRaised }}>
                    <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:SP.sm }}>
                      <span style={{ ...TYPE.caption, color:T.muted, fontWeight:600 }}>{fmtDay(x.paid_on)}</span>
                      {x.dept && <span style={{ ...TYPE.mono, fontSize:11, color:T.muted, overflowWrap:"anywhere" }}>{x.dept}</span>}
                    </div>
                    <div style={{ ...TYPE.bodySm, color:T.text, fontWeight:600, marginTop:6, overflowWrap:"anywhere" }}>
                      {x.payee || "—"}
                    </div>
                    <div style={{ ...TYPE.caption, color:T.textSoft, marginTop:3, lineHeight:1.55, overflowWrap:"anywhere" }}>
                      {x.particulars || "—"}
                    </div>
                    {canManage && x.source && (
                      <div style={{ ...TYPE.caption, color:T.dim, marginTop:3, overflowWrap:"anywhere" }}>Source: {x.source}</div>
                    )}
                    <Amounts T={T} v={x} />
                  </div>
                ))}
                <div data-pay-subtotal style={{ minWidth:0, padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.md,
                  border:`1px dashed ${T.border}` }}>
                  <div style={{ ...TYPE.label, color:T.muted }}>Subtotal</div>
                  <Amounts T={T} v={g} strong />
                </div>
              </div>
            ) : (
              <div style={{ overflowX:"auto", border:`1px solid ${T.border}`, borderRadius:R.md }}>
                {/* Fixed columns, so every project's table lines up with the next.
                    The amount columns fit 9 digits with paisa (128,456,789.75). */}
                <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed", minWidth:880 }}>
                  <colgroup>
                    {[96, 96, 160, null, 136, 120, 136].map((w, i) => <col key={i} style={w ? { width:w } : undefined} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {["Date","Department","Payee","Particulars","Gross","Tax","Net"].map((h, i) => (
                        <th key={h} scope="col" style={{
                          ...TYPE.label, color:T.muted, textAlign: i >= 4 ? "right" : "left",
                          padding:"8px 10px", whiteSpace:"nowrap",
                          background:T.surfaceRaised, boxShadow:`inset 0 -1px 0 ${T.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((x, i) => (
                      <tr key={x.id} data-pay-row style={{ background: i % 2 ? T.rowAlt : "transparent", verticalAlign:"top" }}>
                        <td style={payCell(T)}>{fmtDay(x.paid_on)}</td>
                        <td style={{ ...payCell(T), ...TYPE.mono, fontSize:11.5, color:T.muted, whiteSpace:"normal", overflowWrap:"anywhere" }}>{x.dept || "—"}</td>
                        <td style={{ ...payCell(T), whiteSpace:"normal", overflowWrap:"anywhere" }}>
                          {x.payee || "—"}
                        </td>
                        <td style={{ ...payCell(T), whiteSpace:"normal", overflowWrap:"anywhere", color:T.textSoft, lineHeight:1.55 }}>
                          {x.particulars || "—"}
                          {canManage && x.source && (
                            <div style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>Source: {x.source}</div>
                          )}
                        </td>
                        <td style={{ ...payCell(T), ...num, textAlign:"right", color:T.textOf(T.cyan), fontWeight:600 }}>{fmtPKR(x.gross)}</td>
                        <td style={{ ...payCell(T), ...num, textAlign:"right" }}>{fmtPKR(x.tax)}</td>
                        <td style={{ ...payCell(T), ...num, textAlign:"right" }}>{fmtPKR(x.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr data-pay-subtotal>
                      <td colSpan={4} style={{ ...payFoot(T), ...TYPE.label, color:T.muted }}>Subtotal</td>
                      {AMOUNTS.map(([, k]) => {
                        const a = amountOf(g, k);
                        return (
                          <td key={k} title={a.title || undefined} style={{ ...payFoot(T), ...num, textAlign:"right",
                            verticalAlign:"top", color: k === "gross" ? T.textOf(T.cyan) : T.text }}>
                            {a.text}
                            {a.note && <div data-pay-partial style={{ ...TYPE.caption, fontWeight:400, color:T.dim }}>{a.note}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  return (
    <Modal T={T} title="Payments Made" sub="Investment projects only" icon={Receipt}
      onClose={onClose} width={1000} isMobile={isCompact}>
      <div ref={topRef} data-pay="window">{body}</div>
    </Modal>
  );
}

// Phone cards: one line per amount, label on the left and the figure on the
// right, never broken inside a number (9 digits with paisa fit at 360 px).
function Amounts({ T, v, strong }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:SP.sm }}>
      {AMOUNTS.map(([l, k]) => {
        const a = amountOf(v, k);
        return (
          <div key={k} data-amt={k} title={a.title || undefined} style={{ display:"flex", alignItems:"baseline",
            justifyContent:"space-between", flexWrap:"wrap", gap:`0 ${SP.md}px`, minWidth:0 }}>
            <span style={{ ...TYPE.label, color:T.dim }}>{l}</span>
            <span style={{ marginLeft:"auto", textAlign:"right" }}>
              <span style={{ ...TYPE.bodySm, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap",
                fontWeight: strong || k === "gross" ? 600 : 400,
                color: k === "gross" ? T.textOf(T.cyan) : T.text }}>{a.text}</span>
              {a.note && <span data-pay-partial style={{ ...TYPE.caption, color:T.dim, marginLeft:6, whiteSpace:"nowrap" }}>({a.note})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const payCell = (T) => ({
  ...TYPE.bodySm, color:T.text, padding:"9px 10px",
  borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap",
});
const payFoot = (T) => ({
  ...TYPE.bodySm, color:T.text, fontWeight:600, padding:"9px 10px",
  background:T.surfaceRaised, whiteSpace:"nowrap",
});
