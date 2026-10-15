// PMO Simulation director: the closing card. "That's the portal. Thank you." with the six chapters
// as buttons, Restart and Exit, and the run report for the presenter (collapsed).
import React, { useEffect, useRef } from "react";
import { RotateCcw, X } from "lucide-react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { ChapterList } from "./Dock.jsx";
import { NAVY, GOLD, INK, INK_SOFT, INK_DIM, SERIF, SANS, Z, EASE } from "./look.js";
import { fmtClock } from "./clock.js";

const btn = { display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: INK, font: `600 13px ${SANS}`, cursor: "pointer" };

function Report({ report }) {
  if (!report) return null;
  const total = report.total ?? report.cut;
  const short = report.governor.filter((g) => g.short).map((g) => g.n);
  return (
    <details data-sim-ui="run-report" style={{ marginTop: 22, fontSize: 12, color: INK_DIM, textAlign: "left" }}>
      <summary style={{ cursor: "pointer", color: INK_SOFT, textAlign: "center" }}>
        Run report (presenter) · {total != null ? `${total.toFixed(1)} s` : "—"}{report.cut != null ? " · cut at 1:59.5" : ""}
        {report.ok === false ? " · over 2:00" : ""}
      </summary>
      <div style={{ marginTop: 8, lineHeight: 1.6 }}>
        <div>
          Voice: {report.voice || "captions only"} · short lines: {short.length ? short.join(", ") : "none"} · pauses: {report.pauses}
          {report.jumps.length ? ` · jumps: ${report.jumps.map((j) => j.to).join(", ")}` : ""}
        </div>
        <table style={{ marginTop: 6, borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
          <thead><tr>{["Scene", "Start", "End", "Took", "Rate", "Waits / notes"].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "3px 6px", borderBottom: "1px solid rgba(255,255,255,.1)", fontWeight: 600 }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {report.scenes.map((s, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 6px" }}>{s.n}{s.short ? " (short)" : ""}</td>
                <td style={{ padding: "2px 6px" }}>{s.start.toFixed(1)}</td>
                <td style={{ padding: "2px 6px" }}>{s.end != null ? s.end.toFixed(1) : ""}</td>
                <td style={{ padding: "2px 6px" }}>{s.dur != null ? s.dur.toFixed(1) : ""}</td>
                <td style={{ padding: "2px 6px" }}>{s.rate ? `${s.rate}×` : ""}</td>
                <td style={{ padding: "2px 6px" }}>
                  {[...(s.waits || []).filter((w) => w[1] >= 300).map((w) => `${w[0]} ${w[1]} ms`), ...(s.notes || [])].join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ClosingCard({ caption, chapters, report, onChapter, onRestart, onExit }) {
  const first = useRef(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return (
    <div data-sim-ui="closing" style={{
      position: "fixed", inset: 0, zIndex: Z.veil, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 16px", fontFamily: SANS, color: INK, animation: "simDirFade .7s ease both",
      background: `radial-gradient(1000px 600px at 50% -10%, #18406A 0%, rgba(24,64,106,0) 62%),
        radial-gradient(900px 520px at 50% 115%, rgba(216,152,64,.18) 0%, rgba(216,152,64,0) 55%), ${NAVY}`,
    }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center", animation: `simDirIn .6s ${EASE} .15s both` }}>
        <div style={{ width: 120, height: 120, margin: "0 auto 8px" }}>
          <AssistantAvatar size={120} boxScale={1.0} track={false} state="success" />
        </div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.15 }}>
          {caption || "That's the portal. Thank you."}
        </h1>
        <div style={{ marginTop: 10, fontSize: 14, color: INK_SOFT }}>Replay a chapter, start again, or exit.</div>
        <div style={{ maxWidth: 420, margin: "22px auto 0" }}>
          <ChapterList chapters={chapters} current={0} onPick={onChapter} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18 }}>
          <button ref={first} type="button" className="sim-dir-btn" onClick={onRestart} style={btn}><RotateCcw size={15} /> Restart</button>
          <button type="button" className="sim-dir-btn" onClick={onExit} style={{ ...btn, borderColor: `${GOLD}99` }}><X size={15} /> Exit</button>
        </div>
        <Report report={report} />
        {report && report.total != null && (
          <div style={{ marginTop: 6, fontSize: 11, color: INK_DIM }}>{fmtClock(report.total)} of 2:00</div>
        )}
      </div>
    </div>
  );
}
