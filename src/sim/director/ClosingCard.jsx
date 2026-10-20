// PMO Simulation director: the closing card. Owner: B3b (contract §H.6).
//
// The closing line, "Portal data as of HH:MM PKT" (a shared copy: its day and time), the six chapters
// as buttons with their start times, Restart (the same snapshot), Refresh data (asks the still-open
// portal tab; not shown without onRefresh, as for a shared copy), Exit, and the run report for the
// presenter (collapsed, "m:ss of 2:30").
import { useEffect, useRef } from "react";
import { RotateCcw, X, RefreshCw } from "lucide-react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { ChapterList } from "./Dock.jsx";
import { NAVY, GOLD, INK, INK_SOFT, INK_DIM, SERIF, SANS, Z, EASE } from "./look.js";
import { fmtClock } from "./clock.js";
import { LIMIT, CUT_AT } from "./engine.js";

const btn = { display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: INK, font: `600 13px ${SANS}`, cursor: "pointer" };

function Report({ report }) {
  if (!report) return null;
  const total = report.total ?? report.cut;
  const short = report.governor.filter((g) => g.short).map((g) => g.n);
  const failed = report.scenes.flatMap((s) => (s.figureChecks || []).filter((f) => !f.ok).map((f) => `${f.line} ${f.slot}`));
  return (
    <details data-sim-ui="run-report" style={{ marginTop: 22, fontSize: 12, color: INK_DIM, textAlign: "left" }}>
      <summary style={{ cursor: "pointer", color: INK_SOFT, textAlign: "center" }}>
        Run report (presenter) · {total != null ? `${fmtClock(total)} of ${fmtClock(LIMIT)}` : "—"}
        {report.cut != null ? ` · cut at ${fmtClock(CUT_AT)}` : ""}{report.ok === false ? " · over the limit or with errors" : ""}
      </summary>
      <div style={{ marginTop: 8, lineHeight: 1.6 }}>
        <div>
          Voice: {report.voice || "captions only"} · short lines: {short.length ? short.join(", ") : "none"} · pauses: {report.pauses}
          {report.jumps.length ? ` · jumps: ${report.jumps.map((j) => j.to).join(", ")}` : ""}
          {failed.length ? ` · figures not seen: ${failed.join(", ")}` : ""}
        </div>
        <table style={{ marginTop: 6, borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
          <thead><tr>{["Scene", "Start", "End", "Took", "Rate", "Waits / notes"].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "3px 6px", borderBottom: "1px solid rgba(255,255,255,.1)", fontWeight: 600 }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {report.scenes.map((s, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 6px" }}>{s.n}{s.short ? " (short)" : ""}{s.skipped ? " (left out)" : ""}</td>
                <td style={{ padding: "2px 6px" }}>{s.start != null ? s.start.toFixed(1) : ""}</td>
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

export function ClosingCard({ caption, hhmm, asOfText = null, chapters, report, notice, refreshing, onChapter, onRestart, onRefresh, onExit }) {
  // Focus is on the card itself, not on a button: Space or Enter alone never restarts (which would
  // show the Begin screen's presenter notes to the audience). Tab reaches the buttons.
  const card = useRef(null);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  return (
    <div ref={card} tabIndex={-1} data-sim-ui="closing" style={{ outline: "none",
      position: "fixed", inset: 0, zIndex: Z.veil, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 16px", fontFamily: SANS, color: INK, animation: "simDirFade .7s ease both", boxSizing: "border-box",
      background: `radial-gradient(1000px 600px at 50% -10%, #18406A 0%, rgba(24,64,106,0) 62%),
        radial-gradient(900px 520px at 50% 115%, rgba(216,152,64,.18) 0%, rgba(216,152,64,0) 55%), ${NAVY}`,
    }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center", animation: `simDirIn .6s ${EASE} .15s both` }}>
        <div style={{ width: 120, height: 120, margin: "0 auto 8px" }}>
          <AssistantAvatar size={120} boxScale={1.0} track={false} state="success" />
        </div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.15 }}>
          {caption || "Thank you."}
        </h1>
        <div data-sim-ui="as-of" style={{ marginTop: 10, fontSize: 14, color: INK_SOFT }}>Portal data as of {asOfText || hhmm} PKT</div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: INK_DIM }}>
          {onRefresh ? "Replay a chapter, restart, refresh the data, or exit." : "Replay a chapter, restart, or exit."}
        </div>
        <div style={{ maxWidth: 420, margin: "22px auto 0" }}>
          <ChapterList chapters={chapters} current={0} onPick={onChapter} />
        </div>
        {notice && (
          <div role="alert" data-sim-ui="closing-notice" style={{ marginTop: 14, fontSize: 12.5, color: "#FFD9DF" }}>{notice}</div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="sim-dir-btn" onClick={onRestart} style={btn}><RotateCcw size={15} /> Restart</button>
          {onRefresh && (
            <button type="button" className="sim-dir-btn" data-sim-refresh="" onClick={onRefresh} disabled={refreshing} style={btn}>
              <RefreshCw size={15} style={refreshing ? { animation: "simDirSpin .9s linear infinite" } : null} />
              {refreshing ? "Reading the portal again…" : "Refresh data"}
            </button>
          )}
          <button type="button" className="sim-dir-btn" onClick={onExit} style={{ ...btn, borderColor: `${GOLD}99` }}><X size={15} /> Exit</button>
        </div>
        <Report report={report} />
      </div>
    </div>
  );
}
