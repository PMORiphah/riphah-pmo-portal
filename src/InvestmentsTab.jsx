import { useState, useEffect, useMemo, useCallback } from "react";
import { TrendingUp, Plus, ArrowRightLeft, Search, X, Check } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { EmptyState, Skeleton, Button, Input, Select, Badge, Modal, useViewport } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   INVESTMENTS

   A portfolio that sits alongside CAPEX rather than inside it. Projects here
   are excluded from every CAPEX total by a single WHERE clause in
   portfolio_metrics, so the headline figures cannot drift as this grows.

   Two ways in: create one directly, or move an existing project across. The
   transfer is a portfolio change on the same row — the project keeps its id,
   history, attachments and audit trail rather than being copied.
   ═══════════════════════════════════════════════════════════════════════════ */

export function InvestmentsTab({
  T, session, supa, canManage, onSelectProject, fmtFull, fmtM,
  STAGE_META, PRIORITY_META, sortByActivity, onPortfolioChange, MobileProjectCard,
}) {
  const vpI = useViewport();
  const [rows, setRows]       = useState([]);
  const [totals, setTotals]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, agg] = await Promise.all([
        supa("/rest/v1/project_metrics?portfolio=eq.investment&select=*&order=su_requested_amount.desc",
             {}, session.access_token),
        supa("/rest/v1/investment_metrics?select=*", {}, session.access_token),
      ]);
      setRows(Array.isArray(items) ? items : []);
      setTotals(Array.isArray(agg) ? agg[0] : agg);
      setErr(null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [supa, session]);

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
  ] : [];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:SP.lg }}>

      {/* A statement of what this tab is, because a figure sitting beside the
          CAPEX dashboard needs to say plainly that it is not part of it. */}
      <div style={{
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
        <div style={{ display:"grid", gap:SP.md,
          gridTemplateColumns:"repeat(auto-fit, minmax(min(190px,100%), 1fr))" }}>
          {kpis.map((k, i) => (
            <div key={k.label} className="pmo-in" style={{
              background:T.surface, border:`1px solid ${T.border}`, borderRadius:R.lg,
              padding:`${SP.md}px ${SP.lg}px`, boxShadow:T.shadow,
              animationDelay:`${i * 55}ms`,
            }}>
              <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>{k.label}</div>
              <div style={{ ...TYPE.metric, color:T.textOf(k.c) }}>{k.value}</div>
              <div style={{ ...TYPE.caption, color:T.dim, marginTop:4 }}>{k.sub}</div>
            </div>
          ))}
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
          <div style={{ ...TYPE.label, color:T.muted }}>
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
                  <button className="pmo-focusable pmo-btn"
                    title="Move back to the CAPEX portfolio"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(
                        `Move "${p.name}" back to the CAPEX portfolio?\n\n` +
                        `Its value will be included in the CAPEX totals again.`))
                        move(p.id, "capex");
                    }}
                    style={{ marginLeft:"auto", background:"transparent", border:`1px solid ${T.border}`,
                      borderRadius:R.sm, color:T.muted, cursor:"pointer",
                      padding:"5px 9px", ...TYPE.caption, whiteSpace:"nowrap" }}>
                    Move to CAPEX
                  </button>
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
                    <td style={{ ...cell(T), textAlign:"right" }}>
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

      {transferOpen && (
        <TransferModal T={T} session={session} supa={supa}
          STAGE_META={STAGE_META} fmtFull={fmtFull}
          onClose={() => setTransferOpen(false)}
          onMove={async (id) => { const ok = await move(id, "investment"); if (ok) setTransferOpen(false); }} />
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
