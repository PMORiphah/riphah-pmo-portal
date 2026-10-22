import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { TrendingUp, Plus, ArrowRightLeft, Search, X, Check, Pencil, ArrowUpRight } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { EmptyState, Skeleton, Button, Input, Select, Badge, Modal, useViewport, CAN_HOVER } from "./ui.jsx";
import { PaymentsWindow, PAY_PATH, focusVisible, paymentsOn } from "./PaymentsWindow.jsx";

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
   so a failure shows "—" on the card instead of breaking the tab. The window
   is shared with the dashboard's CAPEX Payments Made card (PaymentsWindow.jsx).

   The simulation shows the card and its window as well (PMO, 22 Oct 2026):
   project_payments is in its live snapshot (schema.js / requests.js).
   ═══════════════════════════════════════════════════════════════════════════ */

const MIN_CARD = 190;   // px; the strip's narrowest card, as before the sixth card

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
  const readPayments = useCallback(() =>
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
  const pay = useMemo(() => paymentsOn(rows, payments), [rows, payments]);

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
    { label: "Payments Made", value: payFailed ? "—" : fmtFull(pay.gross),
      sub: payFailed ? "Payments could not be loaded just now"
         : pay.n ? `${pay.n} payment${pay.n === 1 ? "" : "s"} · gross` : "No payments listed yet",
      c: T.cyan, opens: true },
  ] : [];
  const gap = SP.md;
  // Six cards: 6, 3, 2 or 1 per row.
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
        <PaymentsWindow T={T} scope="investment" projects={rows} payments={payments} failed={payFailed} canManage={canManage}
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
