// ─────────────────────────────────────────────────────────────────────────────
//  PMO PORTAL — CHART LAYER
// ─────────────────────────────────────────────────────────────────────────────
//  Recharts, wrapped so every chart in the product shares one grid weight, one
//  axis treatment, one tooltip and one animation curve (§29).
//  Charts read theme tokens; they never define their own palette.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, Sector, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { TYPE, SP, R, MOTION, CATEGORICAL } from "./theme.js";

// Recharts' tooltip is driven internally by onMouseLeave, which iOS Safari
// (and touch generally) doesn't reliably fire — a tap opens the tooltip but
// nothing ever closes it, so it can sit stuck over content that scrolls
// underneath. This is a long-standing, still-open upstream limitation
// (recharts/recharts#1109, #2100, #6946), not something fixable from the
// props Recharts exposes. Dispatching a synthetic mouseleave doesn't
// reliably clear it either — Recharts' internal active-tooltip state
// doesn't consistently respond to a synthetic event the way it does to a
// genuine one. Forcing a remount does: changing the chart's key on scroll
// tears down and recreates the component, which unconditionally clears
// whatever internal state Recharts was holding, regardless of which event
// it was or wasn't listening for.
function useDismissChartTooltipOnScroll() {
  const [remountKey, setRemountKey] = useState(0);
  useEffect(() => {
    const dismiss = () => setRemountKey(k => k + 1);
    window.addEventListener("scroll", dismiss, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", dismiss, { capture: true });
  }, []);
  return remountKey;
}

const axisStyle = (T) => ({
  fontSize: 10.5,
  fontFamily: TYPE.body.fontFamily,
  fill: T.dim,
});

// ─── SHARED TOOLTIP ──────────────────────────────────────────────────────────
// One tooltip for every chart: title, colour-keyed rows, optional derived
// footer (e.g. variance). Readability over decoration.
export function ChartTooltip({ T, active, payload, label, fmt, footer }) {
  if (!active || !payload?.length) return null;
  const f = fmt || ((v) => v);
  return (
    <div className="pmo-rise" style={{
      background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)",
      border:`1px solid ${T.borderStrong}`,
      borderRadius:R.md, padding:`${SP.sm}px ${SP.md}px`,
      boxShadow:T.shadowLg, minWidth:158,
      backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
    }}>
      <div style={{ ...TYPE.label, color:T.muted, marginBottom:6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:SP.lg, marginTop: i ? 4 : 0,
        }}>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:p.color || p.stroke || p.fill }} />
            <span style={{ ...TYPE.caption, color:T.textSoft }}>{p.name}</span>
          </span>
          <span style={{ ...TYPE.caption, color:T.text, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>
            {f(p.value)}
          </span>
        </div>
      ))}
      {footer?.(payload) && (
        <div style={{
          marginTop:7, paddingTop:6, borderTop:`1px solid ${T.border}`,
          display:"flex", justifyContent:"space-between", gap:SP.lg,
        }}>
          <span style={{ ...TYPE.caption, color:T.muted }}>Variance</span>
          <span style={{ ...TYPE.caption, fontWeight:700, fontVariantNumeric:"tabular-nums",
            color: footer(payload).negative ? T.danger : T.positive }}>
            {footer(payload).text}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── PLANNED VS ACTUAL ───────────────────────────────────────────────────────
// Dashed planned line over a filled actual area, hover crosshair, variance in
// the tooltip (§10).
export function PlannedActualChart({ T, data, height = 300, fmt, isMobile }) {
  const chartRemountKey = useDismissChartTooltipOnScroll();

  // §9 — the newest actual reading carries a slow pulse, so the series reads as
  // something still being written rather than a finished picture. Only the
  // latest point: a line of pulsing dots would be noise.
  const lastActualIdx = useMemo(() => {
    if (!Array.isArray(data)) return -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if ((data[i]?.actual ?? 0) > 0) return i;
    }
    return -1;
  }, [data]);

  const LiveDot = (props) => {
    const { cx, cy, index } = props;
    if (index !== lastActualIdx || cx == null) return null;
    return (
      <g style={{ pointerEvents: "none" }}>
        <circle cx={cx} cy={cy} r={9} fill={T.positive} opacity={0.16}
          className="pmo-live-dot" />
        <circle cx={cx} cy={cy} r={4.2} fill={T.positive}
          stroke={T.surface} strokeWidth={1.5} />
      </g>
    );
  };

  // Series emphasis (§11, §12): hovering the legend — or a point on one series —
  // brings that series forward and quiets the other. Dimming rather than hiding,
  // so the comparison is never lost.
  const [focus, setFocus] = useState(null);
  const dim = (key) => (focus && focus !== key ? 0.22 : 1);
  const emph = (key) => (focus === key ? 1 : focus ? 0.6 : 1);

  return (
    <ResponsiveContainer key={chartRemountKey} width="100%" height={height}>
      <AreaChart data={data} margin={{ top:8, right:isMobile?4:12, left:isMobile?-2:-6, bottom:0 }}
        onMouseLeave={() => setFocus(null)}>
        <defs>
          {/* Soft halo applied to the active data point (§12) */}
          <filter id="pmoDotGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="pmoActualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={T.positive} stopOpacity={0.32} />
            <stop offset="100%" stopColor={T.positive} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pmoPlannedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={T.info} stopOpacity={0.12} />
            <stop offset="100%" stopColor={T.info} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={T.border} strokeDasharray="0" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle(T)} tickLine={false}
          axisLine={{ stroke:T.border }} interval={isMobile ? "preserveStartEnd" : 0} dy={4} />
        <YAxis tick={axisStyle(T)} tickLine={false} axisLine={false}
          tickFormatter={fmt} width={isMobile ? 52 : 60} />

        <Tooltip
          cursor={{ stroke:T.borderStrong, strokeWidth:1, strokeDasharray:"3 3" }}
          content={(p) => (
            <ChartTooltip {...p} T={T} fmt={fmt} footer={(pl) => {
              const plan = pl.find(x => x.dataKey === "planned")?.value ?? 0;
              const act  = pl.find(x => x.dataKey === "actual")?.value ?? 0;
              const d = act - plan;
              return { text:(d >= 0 ? "+" : "−") + fmt(Math.abs(d)), negative: d < 0 };
            }} />
          )}
        />
        <Legend verticalAlign="top" align="right" height={26} iconType="plainline" iconSize={14}
          wrapperStyle={{ ...TYPE.caption, paddingBottom:6, cursor:"pointer" }}
          formatter={(value, entry) => (
            <span style={{ ...TYPE.caption,
              color: T.textOf ? T.textOf(entry?.color) : T.muted,
              fontWeight: focus === entry?.dataKey ? 700 : 500 }}>{value}</span>
          )}
          onMouseEnter={(e) => setFocus(e?.dataKey || null)}
          onMouseLeave={() => setFocus(null)} />

        <Area type="monotone" dataKey="planned" name="Planned" stroke={T.info}
          strokeWidth={focus === "planned" ? 2.5 : 1.75} strokeDasharray="5 4"
          fill="url(#pmoPlannedFill)" fillOpacity={dim("planned")}
          strokeOpacity={emph("planned")}
          dot={false}
          activeDot={{ r:6, strokeWidth:2, stroke:T.surface, fill:T.info,
            filter:"url(#pmoDotGlow)" }}
          onMouseEnter={() => setFocus("planned")}
          animationDuration={900}
          style={{ transition:"stroke-opacity .2s, stroke-width .2s" }} />
        <Area type="monotone" dataKey="actual" name="Actual" stroke={T.positive}
          strokeWidth={focus === "actual" ? 3 : 2.25}
          fill="url(#pmoActualFill)" fillOpacity={dim("actual")}
          strokeOpacity={emph("actual")}
          dot={<LiveDot />}
          activeDot={{ r:7, strokeWidth:2, stroke:T.surface, fill:T.positive,
            filter:"url(#pmoDotGlow)" }}
          onMouseEnter={() => setFocus("actual")}
          animationDuration={1100}
          style={{ transition:"stroke-opacity .2s, stroke-width .2s" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── DONUT ───────────────────────────────────────────────────────────────────
// Centre label carries the total so the chart answers a question on its own.
export function Donut({ T, data, height = 230, total, totalLabel, onSlice, activeKey, fmt }) {
  const shown = data.filter(d => d.value > 0);
  const [hoverKey, setHoverKey] = useState(null);
  const chartRemountKey = useDismissChartTooltipOnScroll();
  return (
    <div style={{ position:"relative", width:"100%", height }}>
      <ResponsiveContainer key={chartRemountKey} width="100%" height="100%">
        <PieChart>
          <defs>
            <filter id="pmoSliceGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {data.map((d, i) => (
              <linearGradient key={i} id={`pmoSlice${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor={d.color} stopOpacity={0.95} />
                <stop offset="100%" stopColor={d.color} stopOpacity={0.62} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={shown} dataKey="value" nameKey="name"
            innerRadius="63%" outerRadius="88%"
            paddingAngle={shown.length > 1 ? 2 : 0}
            stroke="none" animationDuration={900}
            onClick={(e) => onSlice?.(e?.payload?.key)}
          >
            {shown.map((d, i) => {
              const idx = data.findIndex(x => x.key === d.key);
              const other = (activeKey && activeKey !== d.key) || (hoverKey && hoverKey !== d.key);
              const lead  = hoverKey === d.key || activeKey === d.key;
              return (
                <Cell key={i} fill={`url(#pmoSlice${idx})`}
                  opacity={other ? 0.25 : 1}
                  stroke={lead ? d.color : "none"} strokeWidth={lead ? 2 : 0}
                  onMouseEnter={() => setHoverKey(d.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  style={{ cursor:onSlice ? "pointer" : "default",
                    transition:"opacity 200ms, stroke-width 200ms",
                    filter: lead ? "url(#pmoSliceGlow)" : "none" }} />
              );
            })}
          </Pie>
          <Tooltip content={(p) => <ChartTooltip {...p} T={T} fmt={fmt} />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", pointerEvents:"none",
      }}>
        <div style={{ ...TYPE.metric, color:T.text }}>{total}</div>
        <div style={{ ...TYPE.label, color:T.muted, marginTop:3 }}>{totalLabel}</div>
      </div>
    </div>
  );
}

// ─── HORIZONTAL PIPELINE BARS ────────────────────────────────────────────────
// Approval-stage volumes. Log-ish scaling is deliberately NOT used — the point
// is that one stage holds almost everything, and flattening that would hide the
// bottleneck the chart exists to reveal (§12).
export function StageBars({ T, data, onPick, activeKey, height = 240 }) {
  const chartRemountKey = useDismissChartTooltipOnScroll();
  return (
    <ResponsiveContainer key={chartRemountKey} width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top:0, right:34, left:0, bottom:0 }} barCategoryGap={7}>
        <CartesianGrid stroke={T.border} horizontal={false} />
        <XAxis type="number" tick={axisStyle(T)} tickLine={false} axisLine={{ stroke:T.border }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...axisStyle(T), fontSize:11 }}
          tickLine={false} axisLine={false} width={116} />
        <Tooltip cursor={{ fill:T.rowHover }} content={(p) => <ChartTooltip {...p} T={T} />} />
        <Bar dataKey="value" name="Projects" radius={[0,5,5,0]} animationDuration={850}
          onClick={(e) => onPick?.(e?.key)}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color}
              opacity={activeKey && activeKey !== d.key ? 0.32 : 1}
              style={{ cursor:onPick ? "pointer" : "default", transition:"opacity 200ms" }} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SPARKLINE ───────────────────────────────────────────────────────────────
export function Sparkline({ T, data, color, height = 30 }) {
  if (!data?.length) return null;
  const c = color || T.info;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top:2, right:0, left:0, bottom:0 }}>
        <Line type="monotone" dataKey="v" stroke={c} strokeWidth={1.75} dot={false} animationDuration={700} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── GROUPED / CATEGORICAL BAR ───────────────────────────────────────────────
export function CategoryBars({ T, data, height = 300, fmt, color, horizontal, onPick }) {
  const c = color || T.info;
  const [hoverIdx, setHoverIdx] = useState(null);
  const chartRemountKey = useDismissChartTooltipOnScroll();
  return (
    <ResponsiveContainer key={chartRemountKey} width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top:6, right:14, left:horizontal ? 0 : -8, bottom:0 }} barCategoryGap={horizontal ? 8 : "22%"}>
        <CartesianGrid stroke={T.border} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axisStyle(T)} tickLine={false} axisLine={{ stroke:T.border }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" tick={{ ...axisStyle(T), fontSize:11 }} tickLine={false} axisLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={axisStyle(T)} tickLine={false} axisLine={{ stroke:T.border }} />
            <YAxis tick={axisStyle(T)} tickLine={false} axisLine={false} tickFormatter={fmt} width={52} />
          </>
        )}
        <Tooltip cursor={{ fill:T.rowHover }} content={(p) => <ChartTooltip {...p} T={T} fmt={fmt} />} />
        <Bar dataKey="value" name="Value" radius={horizontal ? [0,5,5,0] : [5,5,0,0]}
          animationDuration={850} onClick={(e) => onPick?.(e?.key)}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || c} style={{ cursor:onPick ? "pointer" : "default" }} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export { CATEGORICAL, ReferenceLine };


// ─── SHARE DONUT ─────────────────────────────────────────────────────────────
// Composition for a small number of categories. The earlier donut on this
// dashboard failed because it printed every label around the ring, so three
// slices produced overlapping text — the labels live in the legend here and the
// ring carries nothing but the data.
//
// The centre is the working part: at rest it holds the total, and on hover it
// becomes a readout for whichever slice you're pointing at. That means the
// chart answers "what's the split?" and "how much is that one?" without a
// tooltip covering the thing you're looking at.
export function ShareDonut({
  T, data, total, totalLabel = "Total", fmt = (v) => v,
  height = 300, onPick, activeKey,
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const rows = (data || []).filter(d => (d.value || 0) > 0);
  if (!rows.length) return null;

  const sum = rows.reduce((a, b) => a + (b.value || 0), 0);
  const active = hoverIdx != null ? rows[hoverIdx] : null;
  const activePct = active ? ((active.value / sum) * 100) : null;

  // Grows the hovered slice and gives it a soft outer arc — depth without
  // moving the other slices, so the shape stays readable while you explore it.
  const renderActive = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 7}
          startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 11} outerRadius={outerRadius + 14}
          startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.5} />
      </g>
    );
  };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:SP.xxl, flexWrap:"wrap" }}>
      <div style={{ position:"relative", width:height, height, flexShrink:0, maxWidth:"100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {rows.map((d, i) => (
                <linearGradient key={i} id={`pmoShare${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"   stopColor={d.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={d.color} stopOpacity={0.62} />
                </linearGradient>
              ))}
              <filter id="pmoShareGlow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <Pie
              data={rows} dataKey="value" nameKey="name"
              innerRadius="62%" outerRadius="86%"
              paddingAngle={rows.length > 1 ? 2.5 : 0}
              cornerRadius={4}
              stroke="none"
              startAngle={90} endAngle={-270}
              animationDuration={1000} animationEasing="ease-out"
              activeIndex={hoverIdx ?? undefined}
              activeShape={renderActive}
              onMouseEnter={(_, i) => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={(e) => onPick?.(e?.payload?.key)}
            >
              {rows.map((d, i) => (
                <Cell key={i} fill={`url(#pmoShare${i})`}
                  opacity={hoverIdx != null && hoverIdx !== i ? 0.3
                        : activeKey && activeKey !== d.key ? 0.3 : 1}
                  style={{ cursor:onPick ? "pointer" : "default",
                    transition:"opacity 220ms", outline:"none",
                    filter: hoverIdx === i ? "url(#pmoShareGlow)" : "none" }} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Centre readout — total at rest, slice detail on hover */}
        <div style={{
          position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", pointerEvents:"none",
          padding:"0 18%", textAlign:"center",
        }}>
          {active ? (
            <>
              <div style={{ ...TYPE.metric, color: T.textOf ? T.textOf(active.color) : active.color,
                transition:`color ${MOTION.fast}` }}>{fmt(active.value)}</div>
              <div style={{ ...TYPE.caption, color:T.textSoft, marginTop:4, lineHeight:1.35 }}>
                {active.name}
              </div>
              <div style={{ ...TYPE.label, color:T.muted, marginTop:5 }}>
                {activePct.toFixed(1)}% of total
              </div>
            </>
          ) : (
            <>
              <div style={{ ...TYPE.metric, color:T.text }}>{total ?? fmt(sum)}</div>
              <div style={{ ...TYPE.label, color:T.muted, marginTop:5 }}>{totalLabel}</div>
            </>
          )}
        </div>
      </div>

      {/* Legend carries every label, so the ring never has text on it */}
      <div style={{ flex:1, minWidth:230, display:"flex", flexDirection:"column", gap:2 }}>
        {rows.map((d, i) => {
          const pct = (d.value / sum) * 100;
          const on  = hoverIdx === i || activeKey === d.key;
          const dim = (hoverIdx != null && hoverIdx !== i) || (activeKey && activeKey !== d.key);
          return (
            <div key={d.key || i}
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onPick?.(d.key)}
              style={{
                display:"flex", alignItems:"center", gap:SP.md,
                padding:`${SP.sm}px ${SP.md}px`, borderRadius:R.sm,
                background: on ? T.rowHover : "transparent",
                opacity: dim ? 0.5 : 1,
                cursor: onPick ? "pointer" : "default",
                transition:`background ${MOTION.fast}, opacity ${MOTION.base}`,
              }}>
              <span style={{
                width:10, height:10, borderRadius:3, background:d.color, flexShrink:0,
                boxShadow: on ? `0 0 10px -1px ${d.color}` : "none",
                transition:`box-shadow ${MOTION.base}`,
              }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div title={d.name} style={{
                  ...TYPE.bodySm, color: on ? T.text : T.textSoft, fontWeight: on ? 600 : 500,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>{d.name}</div>
                {d.meta && (
                  <div style={{ ...TYPE.caption, color:T.dim, marginTop:1 }}>{d.meta}</div>
                )}
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ ...TYPE.bodySm, fontWeight:700,
                  color: T.textOf ? T.textOf(d.color) : d.color,
                  fontVariantNumeric:"tabular-nums" }}>{fmt(d.value)}</div>
                <div style={{ ...TYPE.caption, color:T.muted, fontVariantNumeric:"tabular-nums" }}>
                  {pct.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
