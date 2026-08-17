// ─────────────────────────────────────────────────────────────────────────────
//  PMO PORTAL — CHART LAYER
// ─────────────────────────────────────────────────────────────────────────────
//  Recharts, wrapped so every chart in the product shares one grid weight, one
//  axis treatment, one tooltip and one animation curve (§29).
//  Charts read theme tokens; they never define their own palette.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { TYPE, SP, R, CATEGORICAL } from "./theme.js";

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
    <div style={{
      background: T.mode === "dark" ? "rgba(20,36,60,0.97)" : "rgba(255,255,255,0.98)",
      border:`1px solid ${T.borderStrong}`,
      borderRadius:R.md, padding:`${SP.sm}px ${SP.md}px`,
      boxShadow:T.shadowLg, minWidth:150,
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top:8, right:isMobile?4:12, left:isMobile?-14:-6, bottom:0 }}>
        <defs>
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
          axisLine={{ stroke:T.border }} interval={isMobile ? 1 : 0} dy={4} />
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
          wrapperStyle={{ ...TYPE.caption, color:T.muted, paddingBottom:6 }} />

        <Area type="monotone" dataKey="planned" name="Planned" stroke={T.info}
          strokeWidth={1.75} strokeDasharray="5 4" fill="url(#pmoPlannedFill)"
          dot={false} activeDot={{ r:4, strokeWidth:2, stroke:T.surface }}
          animationDuration={900} />
        <Area type="monotone" dataKey="actual" name="Actual" stroke={T.positive}
          strokeWidth={2.25} fill="url(#pmoActualFill)"
          dot={false} activeDot={{ r:5, strokeWidth:2, stroke:T.surface }}
          animationDuration={1100} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── DONUT ───────────────────────────────────────────────────────────────────
// Centre label carries the total so the chart answers a question on its own.
export function Donut({ T, data, height = 230, total, totalLabel, onSlice, activeKey, fmt }) {
  const shown = data.filter(d => d.value > 0);
  return (
    <div style={{ position:"relative", width:"100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
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
              const dim = activeKey && activeKey !== d.key;
              return (
                <Cell key={i} fill={`url(#pmoSlice${idx})`}
                  opacity={dim ? 0.28 : 1}
                  style={{ cursor:onSlice ? "pointer" : "default", transition:"opacity 200ms" }} />
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
  return (
    <ResponsiveContainer width="100%" height={height}>
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
  return (
    <ResponsiveContainer width="100%" height={height}>
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
