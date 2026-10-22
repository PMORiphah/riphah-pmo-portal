import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Receipt } from "lucide-react";
import { TYPE, SP, R } from "./theme.js";
import { EmptyState, Skeleton, Button, Modal, useViewport } from "./ui.jsx";
import { launcherClearance } from "./AssistantAvatar.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PAYMENTS MADE WINDOW

   One window for both Payments Made cards, so they look and behave the same:
     · Investments tab (21 Oct 2026): the investment projects' itemised
       payments; the card itself is the total of those payments.
     · Dashboard → Payments Status → Payments Made (PMO, 21 Oct 2026: "should
       also be clickable … project wise payment record similar to
       investments"): the CAPEX projects. That card keeps reading the projects'
       own payments_made (portfolio_dashboard), so the window also lists a CAPEX
       project that has a Payments Made figure but no itemised payments, and
       says so, so the card can always be reconciled with the list.

   Read-only: payments are recorded by the PMO in project_payments (RLS: read =
   can_view_project). The simulation shows both cards and windows too (22 Oct
   2026): its live snapshot carries project_payments and its backend answers
   these reads from it.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PAY_PATH = "/rest/v1/project_payments?select=id,project_id,paid_on,dept,payee,particulars,gross,tax,net,source&order=paid_on.asc";
const CAPEX_PROJECTS_PATH = "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,payments_made";
// Old browsers throw on an unknown pseudo-class; treat that as "not keyboard focus".
export const focusVisible = (el) => { try { return el.matches(":focus-visible"); } catch { return false; } };

// Amounts are summed in paisa so 43,003,738.50 + 395,000 never drifts.
export const paisa = (v) => { const n = Number(v); return v == null || v === "" || !isFinite(n) ? 0 : Math.round(n * 100); };
// Full rupees with separators; paisa only when the amount is not whole.
export const fmtPKR = (v) => {
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
export const totalsOf = (list) => {
  const t = { gross: 0, tax: 0, net: 0 }, miss = { gross: 0, tax: 0, net: 0 };
  for (const x of list) for (const k of ["gross", "tax", "net"]) {
    if (missing(x[k])) miss[k]++; else t[k] += paisa(x[k]);
  }
  return { gross: t.gross / 100, tax: t.tax / 100, net: t.net / 100, miss, count: list.length };
};
// Only payments on the given projects count; anything else the reader may see
// (a payment on the other portfolio, a project since moved) is left out.
export const paymentsOn = (projects, payments) => {
  const ids = new Set((projects || []).map((p) => p.id));
  const list = (payments || []).filter((x) => ids.has(x.project_id));
  return { list, n: list.length, projects: new Set(list.map((x) => x.project_id)).size, ...totalsOf(list) };
};
const AMOUNTS = [["Gross", "gross"], ["Tax", "tax"], ["Net", "net"]];
// A payment taken from the Finance record names its row there:
// "<name of the Finance payment record>, row 147".
const ROW_RE = /^(.*\S)\s*[,;]\s*row\s+(\d+)\s*$/i;
const splitSource = (s) => { const m = ROW_RE.exec(String(s || "").trim()); return m ? { doc: m[1], row: m[2] } : null; };
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

// What differs between the two cards' windows. Everything else is shared.
const SCOPES = {
  investment: {
    sub: "Investment projects only", noun: "investment project",
    empty: "Payments made on investment projects will be listed here, in full, once they are recorded.",
    failed: "The rest of the Investments tab is unaffected. Try again in a moment.",
    // Register order (as the tab lists them); only projects with payments.
    byGross: false, recorded: false,
  },
  capex: {
    sub: "CAPEX projects", noun: "project",
    empty: "Payments made on CAPEX projects will be listed here, in full, once they are recorded.",
    failed: "The rest of the dashboard is unaffected. Try again in a moment.",
    // Largest itemised gross first; the card reads payments_made, so a project
    // with only that figure is listed too.
    byGross: true, recorded: true,
  },
};

/* Every payment on the given projects, grouped by project. Desktop gets a table
   per project; a phone gets stacked cards, so nothing scrolls sideways. */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function PaymentsWindow({ T, scope = "investment", projects = [], payments = [], loading = false, failed = false,
  canManage, isCompact, onClose, onRetry, onSelectProject }) {
  const cfg = SCOPES[scope] || SCOPES.investment;
  const topRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
  const [avatarRoom, setAvatarRoom] = useState(0);

  const pay = useMemo(() => paymentsOn(projects, payments), [projects, payments]);

  const groups = useMemo(() => {
    const list = projects
      .map((p) => {
        const items = pay.list.filter((x) => x.project_id === p.id)
          .sort((a, b) => (a.paid_on || "9999").localeCompare(b.paid_on || "9999"));
        return { p, items, ...totalsOf(items) };
      })
      .filter((g) => g.items.length || (cfg.recorded && paisa(g.p.payments_made) > 0));
    if (cfg.byGross) list.sort((a, b) =>
      (paisa(b.gross) - paisa(a.gross)) || (paisa(b.p.payments_made) - paisa(a.p.payments_made))
      || String(a.p.name || "").localeCompare(String(b.p.name || "")));
    return list;
  }, [projects, pay, cfg]);
  const recordedOnly = groups.filter((g) => !g.items.length).length;

  // PMO only: where the payments come from. When every payment listed comes
  // from one record, it is named once above the list and each payment shows
  // only its row there (the full line repeated on every payment made each row
  // three lines taller: 21 Oct 2026 review). Otherwise each payment keeps its
  // own full source line, as before.
  const source = useMemo(() => {
    if (!canManage || !pay.n) return null;
    const parts = pay.list.map((x) => splitSource(x.source));
    const doc = parts[0]?.doc;
    return doc && parts.every((s) => s && s.doc === doc) ? doc : null;
  }, [canManage, pay]);

  // Wider on large screens only, where it still clears the assistant at the
  // right edge; at 1366 px the assistant starts just right of the 1000 px window.
  const vp = useViewport();
  const width = vp.width >= 1600 ? 1200 : 1000;
  // The assistant's launcher (fixed at the right edge, above every Modal) sits
  // over this window wherever the window reaches it: always on phones, where
  // it covered the right-aligned amounts for most of the scroll (21 Oct 2026
  // review), and on desktops narrower than about 1370 px. There the window
  // comes in front of it, as the Welcome email window does; where the window
  // clears it, the assistant stays reachable as before.
  const shownW = isCompact ? vp.width : Math.min(width, vp.width - 2 * SP.xl);
  const lift = !!isCompact || (vp.width + shownW) / 2 > vp.width - launcherClearance(false);

  // When the launcher still sits over the lower part of this window, leave
  // that much room under the last payment so it can scroll clear of it.
  // Measured again once the payments have loaded (the window grows).
  const shown = loading ? "loading" : failed ? "failed" : groups.length;
  useEffect(() => {
    const measure = () => {
      if (lift) { setAvatarRoom(0); return; }              // the window is in front of it
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
  }, [shown, lift]);

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

  const num = { fontVariantNumeric:"tabular-nums" };

  const body = loading ? (
    <div data-pay="loading" aria-busy="true"><Skeleton T={T} h={220} /></div>
  ) : failed ? (
    <EmptyState T={T} icon={Receipt} compact tone={T.warning}
      title="Payments could not be loaded"
      message={cfg.failed}
      action={<Button T={T} size="sm" variant="subtle" loading={retrying}
        onClick={async () => { setRetrying(true); await onRetry?.(); setRetrying(false); }}>Try again</Button>} />
  ) : groups.length === 0 ? (
    <EmptyState T={T} icon={Receipt} compact tone={T.cyan}
      title="No payments listed yet"
      message={cfg.empty} />
  ) : (
    <div style={{ paddingBottom: isCompact ? `calc(${avatarRoom}px + env(safe-area-inset-bottom, 0px))` : avatarRoom }}>
      {/* One line: how many, on how many projects, and the three totals. */}
      <div data-pay="summary" style={{
        display:"flex", flexWrap:"wrap", alignItems:"center", gap:`${SP.sm}px ${SP.lg}px`,
        padding:`${SP.md}px ${SP.lg}px`, borderRadius:R.md, marginBottom:SP.xl,
        background:`${T.cyan}${T.wash}`, borderLeft:`2px solid ${T.cyan}`,
      }}>
        <div style={{ ...TYPE.bodySm, color:T.text, flex:"1 1 220px", minWidth:0 }}>
          {pay.n
            ? <><strong>{plural(pay.n, "payment")}</strong> on <strong>{plural(pay.projects, cfg.noun)}</strong></>
            : <strong>No itemised payments</strong>}
          {recordedOnly > 0 && (
            <span data-pay-recorded-count style={{ color:T.muted }}>
              {pay.n ? " · plus " : " · "}{plural(recordedOnly, cfg.noun)} with a recorded figure only
            </span>
          )}
        </div>
        {pay.n > 0 && AMOUNTS.map(([l, k]) => {
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
        {source && (
          <div data-pay-source title="Shown to the PMO only."
            style={{ ...TYPE.caption, color:T.dim, flexBasis:"100%", minWidth:0, overflowWrap:"anywhere" }}>
            Source: {source} · row number shown with each payment
          </div>
        )}
      </div>

      {groups.map((g, gi) => {
        const name = (g.p.name || "").trim() || "Untitled project";
        const code = g.p.code && g.p.code !== "-" ? g.p.code : null;
        // PMO only: the project's own Payments Made figure, when it does not
        // match the itemised payments, so the two can be reconciled. Information,
        // not an error, so it is muted and says why it is there. A project with
        // no itemised payments says so to everyone instead (below).
        const differs = canManage && g.items.length > 0 && paisa(g.p.payments_made) !== Math.round(g.gross * 100);
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
              {g.items.length > 0 && <span style={{ ...TYPE.caption, color:T.dim }}>· {plural(g.items.length, "payment")}</span>}
            </div>
            {differs && (
              <div data-pay-note title="Shown to the PMO only, to reconcile the project's Payments Made figure with the payments listed here."
                style={{ ...TYPE.caption, color:T.muted, marginBottom:SP.sm, lineHeight:1.5 }}>
                Payments Made on the project record: PKR {fmtPKR(g.p.payments_made ?? 0)}
                {" · "}differs from the PKR {fmtPKR(g.gross)} listed here
              </div>
            )}

            {g.items.length === 0 ? (
              <div data-pay-recorded title="The project's own Payments Made figure. No payment has been itemised for it yet."
                style={{ ...TYPE.bodySm, color:T.textSoft, minWidth:0, overflowWrap:"anywhere",
                  padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.md, border:`1px dashed ${T.border}` }}>
                <span style={{ ...num, fontWeight:600, color:T.textOf(T.cyan) }}>PKR {fmtPKR(g.p.payments_made)}</span>
                {" recorded on the project · no itemised payments"}
              </div>
            ) : isCompact ? (
              <div style={{ display:"flex", flexDirection:"column", gap:SP.sm }}>
                {g.items.map((x) => (
                  <div key={x.id} data-pay-row style={{ minWidth:0, padding:SP.md, borderRadius:R.md,
                    border:`1px solid ${T.border}`, background:T.surfaceRaised }}>
                    <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:SP.sm }}>
                      <span style={{ ...TYPE.caption, color:T.muted, fontWeight:600 }}>
                        {fmtDay(x.paid_on)}
                        {source && x.source && (
                          <span data-pay-src title={x.source} style={{ fontWeight:400, color:T.dim }}> · Row {splitSource(x.source)?.row}</span>
                        )}
                      </span>
                      {x.dept && <span style={{ ...TYPE.mono, fontSize:11, color:T.muted, overflowWrap:"break-word" }}>{x.dept}</span>}
                    </div>
                    <div style={{ ...TYPE.bodySm, color:T.text, fontWeight:600, marginTop:6, overflowWrap:"anywhere" }}>
                      {x.payee || "—"}
                    </div>
                    <div style={{ ...TYPE.caption, color:T.textSoft, marginTop:3, lineHeight:1.55, overflowWrap:"anywhere" }}>
                      {x.particulars || "—"}
                    </div>
                    {canManage && !source && x.source && (
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
                    Gross and Net fit 9 digits with paisa in bold (128,456,789.75),
                    Tax 8 (12,345,678.90); Department fits a code of up to 13
                    characters ("Abcd-XYZ-1234") on one line. Particulars gets
                    the rest. */}
                <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed", minWidth:880 }}>
                  <colgroup>
                    {PAY_COLS.map((w, i) => <col key={i} style={w ? { width:w } : undefined} />)}
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
                        <td style={payCell(T)}>
                          {fmtDay(x.paid_on)}
                          {source && x.source && (
                            <div data-pay-src title={x.source} style={{ ...TYPE.caption, color:T.dim, marginTop:2 }}>Row {splitSource(x.source)?.row}</div>
                          )}
                        </td>
                        {/* Codes break at their hyphens and spaces, never inside a part. */}
                        <td style={{ ...payCell(T), ...TYPE.mono, fontSize:11.5, color:T.muted, whiteSpace:"normal", overflowWrap:"break-word" }}>{x.dept || "—"}</td>
                        <td style={{ ...payCell(T), whiteSpace:"normal", overflowWrap:"anywhere" }}>
                          {x.payee || "—"}
                        </td>
                        <td style={{ ...payCell(T), whiteSpace:"normal", overflowWrap:"anywhere", color:T.textSoft, lineHeight:1.55 }}>
                          {x.particulars || "—"}
                          {canManage && !source && x.source && (
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

  // Rendered at the end of <body>, so its layer can go in front of the
  // assistant's launcher (z 1200) without remounting when that changes.
  // Without the lift it stacks exactly as a Modal in place (z 1000).
  return createPortal(
    <div data-pay-layer={lift ? "front" : "base"} style={{ position:"relative", zIndex: lift ? 1300 : "auto" }}>
      <Modal T={T} title="Payments Made" sub={cfg.sub} icon={Receipt}
        onClose={onClose} width={width} isMobile={isCompact}>
        <div ref={topRef} data-pay="window" data-pay-scope={scope}>{body}</div>
      </Modal>
    </div>,
    document.body
  );
}

/* The dashboard's CAPEX card (Payments Status tab). Reads when it opens, never
   with the dashboard itself: every CAPEX project's Payments Made figure plus the
   itemised payments, under the reader's own token (RLS decides what they see). */
export function CapexPaymentsWindow({ T, session, supa, canManage, isCompact, onClose, onSelectProject }) {
  const [state, setState] = useState({ loading: true, failed: false, projects: [], payments: [] });
  const read = useCallback(async () => {
    try {
      const [projects, payments] = await Promise.all([
        supa(CAPEX_PROJECTS_PATH, {}, session.access_token),
        supa(PAY_PATH, {}, session.access_token),
      ]);
      return { failed: false, projects: Array.isArray(projects) ? projects : [], payments: Array.isArray(payments) ? payments : [] };
    } catch { return { failed: true, projects: [], payments: [] }; }
  }, [supa, session]);
  useEffect(() => {
    let alive = true;
    read().then((s) => { if (alive) setState({ loading: false, ...s }); });
    return () => { alive = false; };
  }, [read]);
  const retry = useCallback(async () => {
    const s = await read();
    setState({ loading: false, ...s });
  }, [read]);
  return (
    <PaymentsWindow T={T} scope="capex" projects={state.projects} payments={state.payments}
      loading={state.loading} failed={state.failed} canManage={canManage} isCompact={isCompact}
      onClose={onClose} onRetry={retry} onSelectProject={onSelectProject} />
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

// Date, Department, Payee, Particulars (the rest), Gross, Tax, Net.
const PAY_COLS = [96, 112, 146, null, 120, 110, 120];
const payCell = (T) => ({
  ...TYPE.bodySm, color:T.text, padding:"9px 10px",
  borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap",
});
const payFoot = (T) => ({
  ...TYPE.bodySm, color:T.text, fontWeight:600, padding:"9px 10px",
  background:T.surfaceRaised, whiteSpace:"nowrap",
});
