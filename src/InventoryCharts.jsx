import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { MapPin, PieChart as PieIcon, CalendarRange, Truck } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Section, SectionTitle } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY INSIGHTS (PMO, 29 Oct 2026; /preview/ first)

   Four charts over exactly the lines the list shows (every filter and the
   search apply), PKR lines only:
     1. Spend by campus / site, split delivered / partly / still to deliver
     2. Delivery health donut (value), centre = what is still to arrive
     3. Purchase orders by month with the running total, FY 2026-27 marked
     4. Top 10 suppliers by value, with the share delivered
   Clicking a bar, slice or month filters the list (onPick). Like the
   dashboard's charts they draw in again after a scroll (the PMO liked that).
   ═══════════════════════════════════════════════════════════════════════════ */

const C_DEL = DATA.positive, C_PART = DATA.warning, C_OPEN = BRAND.blueBright, C_GOLD = BRAND.gold;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtM = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)); };
const fmtPKR = (n) => `PKR ${fmtM(n)}`;
// Axis ticks: whole millions, so labels stay short enough for a phone ("100M", not "100.0M").
const fmtAxis = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${Math.round(v / 1e6)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)); };
const axis = (T) => ({ fontSize: 10.5, fontFamily: TYPE.body.fontFamily, fill: T.dim });
// Split a line's value into delivered / still to deliver (partly lines count their open value as still to deliver).
const parts = (r) => {
  const total = Number(r.total || 0), open = Math.min(total, Math.max(0, Number(r.open_value || 0)));
  return r.delivery_status === "delivered" ? { del: total, part: 0, open: 0 }
    : r.delivery_status === "partly" ? { del: total - open, part: open, open: 0 } : { del: 0, part: 0, open: total };
};
const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "—");

// The portal's chart tooltip look, with a plain footer line and real swatch colours (the bars use gradients).
const SWATCH = { del: C_DEL, part: C_PART, open: C_OPEN, value: BRAND.blueBright, cum: C_GOLD };
function InvTip({ T, active, payload, label, fmt, foot, colors }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pmo-rise" style={{
      background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${T.borderStrong}`,
      borderRadius: R.md, padding: `${SP.sm}px ${SP.md}px`, boxShadow: T.shadowLg, minWidth: 170, maxWidth: 280,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    }}>
      <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6, overflowWrap: "anywhere" }}>{label}</div>
      {payload.filter(p => Number(p.value) > 0).map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.lg, marginTop: i ? 4 : 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ({ ...SWATCH, ...colors })[p.dataKey] || p.color || p.stroke }} />
            <span style={{ ...TYPE.caption, color: T.textSoft }}>{p.name}</span>
          </span>
          <span style={{ ...TYPE.caption, color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.value)}</span>
        </div>
      ))}
      {foot && <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${T.border}`, ...TYPE.caption, color: T.muted }}>{foot}</div>}
    </div>
  );
}

function Grads({ id, color }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={color} stopOpacity={0.62} />
      <stop offset="100%" stopColor={color} stopOpacity={1} />
    </linearGradient>
  );
}

const DRAW_MS = 2650; // the last draw-in (sites, third bar) ends at 250 + 2 × 550 + 1300 ms

export function InventoryCharts({ T, rows, compact, onPick }) {
  // PMO, 29 Oct 2026: the charts draw in once, slowly, when the tab opens; scrolling, hover and
  // filter changes then update them without replaying the draw-in.
  const [anim, setAnim] = useState(() => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const t = setTimeout(() => setAnim(false), DRAW_MS + 400); return () => clearTimeout(t); }, []);
  const A = (begin, dur) => ({ isAnimationActive: anim, animationBegin: begin, animationDuration: dur, animationEasing: "ease-out" });
  const pkrRows = useMemo(() => rows.filter(r => r.currency === "PKR"), [rows]);

  // 1. Sites
  const sites = useMemo(() => {
    const m = new Map();
    pkrRows.forEach(r => {
      const s = m.get(r.site) || { name: r.site, del: 0, part: 0, open: 0, lines: 0 };
      const p = parts(r); s.del += p.del; s.part += p.part; s.open += p.open; s.lines++;
      m.set(r.site, s);
    });
    return [...m.values()].map(s => ({ ...s, total: s.del + s.part + s.open })).sort((a, b) => b.total - a.total);
  }, [pkrRows]);

  // 2. Delivery health (line value by status)
  const health = useMemo(() => {
    const t = { delivered: 0, partly: 0, not_delivered: 0 }, n = { delivered: 0, partly: 0, not_delivered: 0 };
    let still = 0, stillLines = 0;
    pkrRows.forEach(r => {
      t[r.delivery_status] = (t[r.delivery_status] || 0) + Number(r.total || 0); n[r.delivery_status] = (n[r.delivery_status] || 0) + 1;
      const o = Number(r.open_value || 0); if (o > 0) { still += o; stillLines++; }
    });
    return {
      slices: [
        { key: "delivered", name: "Delivered", value: t.delivered, lines: n.delivered, color: C_DEL },
        { key: "partly", name: "Partly delivered", value: t.partly, lines: n.partly, color: C_PART },
        { key: "not_delivered", name: "Not delivered", value: t.not_delivered, lines: n.not_delivered, color: C_OPEN },
      ].filter(s => s.value > 0),
      total: t.delivered + t.partly + t.not_delivered, still, stillLines,
    };
  }, [pkrRows]);

  // 3. Months (by PO date), with running total
  const months = useMemo(() => {
    const m = new Map();
    pkrRows.forEach(r => {
      if (!r.po_date) return;
      const ym = String(r.po_date).slice(0, 7);
      const x = m.get(ym) || { ym, value: 0, lines: 0 }; x.value += Number(r.total || 0); x.lines++; m.set(ym, x);
    });
    const list = [...m.values()].sort((a, b) => a.ym.localeCompare(b.ym));
    if (!list.length) return [];
    // fill gaps so the timeline reads evenly
    const out = []; let [y, mo] = list[0].ym.split("-").map(Number); const [ly, lm] = list[list.length - 1].ym.split("-").map(Number);
    let cum = 0;
    while (y < ly || (y === ly && mo <= lm)) {
      const ym = `${y}-${String(mo).padStart(2, "0")}`, x = m.get(ym) || { ym, value: 0, lines: 0 };
      cum += x.value; out.push({ ...x, cum, label: `${MON[mo - 1]} ${String(y).slice(2)}` });
      mo++; if (mo > 12) { mo = 1; y++; }
    }
    return out;
  }, [pkrRows]);
  const fyMark = months.find(x => x.ym === "2026-07")?.label;

  // 4. Suppliers
  const suppliers = useMemo(() => {
    const m = new Map();
    pkrRows.forEach(r => {
      const k = r.supplier_name || "—";
      const s = m.get(k) || { name: k, value: 0, del: 0, lines: 0 };
      s.value += Number(r.total || 0); s.del += parts(r).del; s.lines++; m.set(k, s);
    });
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 10)
      .map(s => ({ ...s, short: short(s.name, compact ? 15 : 26), pct: s.value ? Math.round(100 * s.del / s.value) : 0 }));
  }, [pkrRows, compact]);

  const [hoverSlice, setHoverSlice] = useState(null);
  if (!pkrRows.length) return null;

  const card = (tone, icon, title, sub, body, attr) => (
    <Section T={T} tone={tone} pad={compact ? SP.md : SP.lg} {...attr} style={{ minWidth: 0 }}>
      <SectionTitle T={T} icon={icon} title={title} sub={sub} />
      {body}
    </Section>
  );
  const siteH = Math.max(170, sites.length * 30 + 30);
  const supH = Math.max(180, suppliers.length * 29 + 30);
  const hs = hoverSlice != null ? health.slices[hoverSlice] : null;

  return (
    <div data-inv-charts style={{ display: "grid", gap: SP.md, gridTemplateColumns: compact ? "1fr" : "minmax(0,1.35fr) minmax(0,1fr)" }}>
      {card(BRAND.blueBright, MapPin, "Where the money went", "Value ordered by campus / site · click a bar to show that site",
        <div style={{ height: siteH }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sites} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
              <defs><Grads id="invDel" color={C_DEL} /><Grads id="invPart" color={C_PART} /><Grads id="invOpen" color={C_OPEN} /></defs>
              <CartesianGrid stroke={T.border} horizontal={false} />
              <XAxis type="number" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={fmtAxis} />
              <YAxis type="category" dataKey="name" tick={{ ...axis(T), fontSize: 11, fill: T.textSoft }} tickLine={false} axisLine={false} width={compact ? 86 : 112} />
              <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <InvTip {...p} T={T} fmt={fmtPKR}
                foot={p.payload?.[0] ? `${p.payload[0].payload.lines} lines · ${fmtPKR(p.payload[0].payload.total)}` : null} />} />
              {[["del", "Delivered", "url(#invDel)"], ["part", "Partly: still to come", "url(#invPart)"], ["open", "Not delivered", "url(#invOpen)"]].map(([k, n, fill], i) => (
                <Bar key={k} dataKey={k} name={n} stackId="s" fill={fill} radius={i === 2 ? [0, 5, 5, 0] : 0} {...A(250 + i * 550, 1300)}
                  onClick={(d) => onPick?.("site", d?.name)} style={{ cursor: "pointer" }} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>, { "data-chart": "sites" })}

      {card(DATA.positive, PieIcon, "Delivery health", "Share of the value ordered · click a slice to show those lines",
        <div style={{ position: "relative", height: compact ? 240 : Math.max(240, siteH - 10) }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>{health.slices.map((s, i) => (
                <linearGradient key={i} id={`invSl${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={1} /><stop offset="100%" stopColor={s.color} stopOpacity={0.6} />
                </linearGradient>))}
              </defs>
              <Pie data={health.slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="86%" paddingAngle={health.slices.length > 1 ? 2.5 : 0}
                cornerRadius={5} stroke="none" startAngle={90} endAngle={-270} {...A(250, 2000)}
                activeIndex={hoverSlice ?? undefined}
                activeShape={(p) => <g><Sector {...p} outerRadius={p.outerRadius + 7} /><Sector {...p} innerRadius={p.outerRadius + 11} outerRadius={p.outerRadius + 14} opacity={0.45} /></g>}
                onMouseEnter={(_, i) => setHoverSlice(i)} onMouseLeave={() => setHoverSlice(null)}
                onClick={(d) => onPick?.("status", d?.payload?.key || d?.key)}>
                {health.slices.map((s, i) => <Cell key={i} fill={`url(#invSl${i})`} style={{ cursor: "pointer", outline: "none",
                  opacity: hoverSlice != null && hoverSlice !== i ? 0.35 : 1, transition: "opacity 220ms" }} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: "0 22%" }}>
            {hs ? <>
              <div style={{ ...TYPE.metric, color: T.textOf ? T.textOf(hs.color) : hs.color, transition: `color ${MOTION.fast}` }}>{fmtPKR(hs.value)}</div>
              <div style={{ ...TYPE.label, color: T.muted, marginTop: 3 }}>{hs.name}</div>
              <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2 }}>{hs.lines} lines · {Math.round(100 * hs.value / (health.total || 1))}%</div>
            </> : <>
              <div style={{ ...TYPE.metric, color: T.text }}>{fmtPKR(health.still)}</div>
              <div style={{ ...TYPE.label, color: T.muted, marginTop: 3 }}>still to arrive</div>
              <div style={{ ...TYPE.caption, color: T.dim, marginTop: 2 }}>{health.stillLines} lines · of {fmtPKR(health.total)}</div>
            </>}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", gap: SP.md, flexWrap: "wrap" }}>
            {health.slices.map((s, i) => (
              <span key={s.key} onMouseEnter={() => setHoverSlice(i)} onMouseLeave={() => setHoverSlice(null)} onClick={() => onPick?.("status", s.key)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, ...TYPE.caption, color: T.textSoft, cursor: "pointer" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.name}
              </span>))}
          </div>
        </div>, { "data-chart": "health" })}

      {card(C_GOLD, CalendarRange, "Buying timeline", `Value ordered each month by PO date, with the running total${fyMark ? " · the gold line marks the start of FY 2026-27" : ""} · click a month to show it`,
        <div style={{ height: compact ? 230 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={months} margin={{ top: 8, right: 4, left: compact ? -10 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id="invMon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.blueBright} stopOpacity={1} /><stop offset="100%" stopColor={BRAND.blueBright} stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="label" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} interval={compact ? 2 : 0} />
              <YAxis tick={axis(T)} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={compact ? 38 : 46} />
              <YAxis yAxisId="c" orientation="right" tick={axis(T)} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={46} hide={compact} />
              <Tooltip cursor={{ fill: T.rowHover }} content={(p) => <InvTip {...p} T={T} fmt={fmtPKR}
                foot={p.payload?.[0] ? `${p.payload[0].payload.lines} lines ordered` : null} />} />
              {fyMark && <ReferenceLine x={fyMark} stroke={C_GOLD} strokeDasharray="4 3" label={{ value: "FY 26-27", position: "insideTopLeft", fill: T.textOf ? T.textOf(C_GOLD) : C_GOLD, fontSize: 10, fontWeight: 700, fontFamily: TYPE.body.fontFamily }} />}
              <Bar dataKey="value" name="Ordered" fill="url(#invMon)" radius={[5, 5, 0, 0]} {...A(250, 1500)}
                onClick={(d) => onPick?.("month", d?.ym)} style={{ cursor: "pointer" }} />
              <Line yAxisId="c" type="monotone" dataKey="cum" name="Running total" stroke={C_GOLD} strokeWidth={2.4} dot={false} {...A(1100, 1500)} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>, { "data-chart": "months" })}

      {card("#8B7CF6", Truck, "Top suppliers", "The 10 largest by value · the bar's darker part is what has been delivered · click to show a supplier",
        <div style={{ height: supH }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={suppliers} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barCategoryGap={6}>
              <defs><Grads id="invSup" color="#8B7CF6" /></defs>
              <CartesianGrid stroke={T.border} horizontal={false} />
              <XAxis type="number" tick={axis(T)} tickLine={false} axisLine={{ stroke: T.border }} tickFormatter={fmtAxis} />
              <YAxis type="category" dataKey="short" tick={{ ...axis(T), fontSize: 11, fill: T.textSoft }} tickLine={false} axisLine={false} width={compact ? 118 : 168} />
              <Tooltip cursor={{ fill: T.rowHover }} content={(p) => {
                const d = p.payload?.[0]?.payload;
                return <InvTip {...p} label={d?.name || p.label} T={T} fmt={fmtPKR} colors={{ del: "#8B7CF6" }} foot={d ? `${d.lines} lines · ${d.pct}% delivered` : null} />;
              }} />
              <Bar dataKey="del" name="Delivered" stackId="v" fill="url(#invSup)" {...A(250, 1400)}
                onClick={(d) => onPick?.("supplier", d?.name)} style={{ cursor: "pointer" }} />
              <Bar dataKey={(d) => d.value - d.del} name="Not yet delivered" stackId="v" fill="#8B7CF6" fillOpacity={0.28} radius={[0, 5, 5, 0]} {...A(1250, 1100)}
                onClick={(d) => onPick?.("supplier", d?.name)} style={{ cursor: "pointer" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>, { "data-chart": "suppliers" })}
    </div>
  );
}
