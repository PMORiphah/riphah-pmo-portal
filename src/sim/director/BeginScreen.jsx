// PMO Simulation director: the Begin screen, over the App while it gets ready behind it.
//
// Shows the assistant, the six chapters with their start times, the voice switch with Test voice
// (plays one line with the chosen on-device voice and reports its speed), the readiness checklist
// and Start. Start stays disabled until every check has passed; pressing it is also the browser's
// required gesture before speech.
import { useEffect, useRef } from "react";
import { Check, Loader2, AlertTriangle, Volume2, VolumeX, Play } from "lucide-react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { NAVY, GOLD, GOLD_SOFT, INK, INK_SOFT, INK_DIM, SERIF, SANS, Z, EASE } from "./look.js";
import { fmtClock } from "./clock.js";

function Row({ status, label, detail }) {
  const icon = status === "ok" ? <Check size={14} color="#3FD3B1" />
    : status === "fail" ? <AlertTriangle size={14} color="#F2A7B4" />
    : <Loader2 size={14} color={GOLD} style={{ animation: "simDirSpin .9s linear infinite" }} />;
  return (
    <div role="listitem" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "5px 0" }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: status === "fail" ? "#FFD9DF" : INK }}>
        {label}
        {detail && <span style={{ color: INK_DIM }}> · {detail}</span>}
      </span>
    </div>
  );
}

const label = { fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 10 };
const panel = { padding: "16px 18px", borderRadius: 14, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)" };

export function BeginScreen({ leaving, mode, castCode, chapters, checks, ready, voice, onStart }) {
  const startRef = useRef(null);
  useEffect(() => { if (ready) startRef.current?.focus({ preventScroll: true }); }, [ready]);
  const sample = mode === "sample";
  const v = voice;
  return (
    <div data-sim-ui="begin" style={{
      position: "fixed", inset: 0, zIndex: Z.veil, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 16px", fontFamily: SANS, color: INK,
      background: `radial-gradient(1100px 620px at 18% -8%, #18406A 0%, rgba(24,64,106,0) 60%),
        radial-gradient(900px 520px at 100% 110%, rgba(216,152,64,.16) 0%, rgba(216,152,64,0) 55%), ${NAVY}`,
      opacity: leaving ? 0 : 1, transition: "opacity .6s ease", pointerEvents: leaving ? "none" : "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 860, animation: `simDirIn .5s ${EASE} both` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
          <div style={{ width: 104, height: 104, flexShrink: 0 }}>
            <AssistantAvatar size={104} boxScale={1.0} track state={ready ? "success" : "thinking"} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 36, lineHeight: 1.1 }}>PMO Portal · Simulation</h1>
              {sample && (
                <span data-sim-ui="sample-names" style={{ padding: "3px 10px", borderRadius: 99, border: `1px solid ${GOLD}`,
                  color: GOLD_SOFT, fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em" }}>Sample names</span>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 15, color: INK_SOFT }}>
              {sample ? "Sample names · fictional projects and figures" : "Real campus, manager and team names · fictional projects and figures"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: INK_DIM }}>
              The assistant presents the portal in under two minutes. Nothing is sent.
              {castCode && <> · Cast code <b style={{ color: INK_SOFT, letterSpacing: ".08em" }}>{castCode}</b></>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 14 }}>
          <div style={panel}>
            <div style={label}>Chapters</div>
            <div role="list" style={{ display: "grid", gap: 4 }}>
              {chapters.map((c) => (
                <div role="listitem" key={c.n} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 2px",
                  borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  <span style={{ width: 16, color: GOLD, fontWeight: 700, fontSize: 12.5 }}>{c.n}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{c.title}</span>
                  <span style={{ fontSize: 12.5, color: INK_DIM, fontVariantNumeric: "tabular-nums" }}>{fmtClock(c.start)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: INK_DIM, lineHeight: 1.6 }}>
              Space pauses · ← → scenes · C chapters · Home restarts · Esc exits
            </div>
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <div style={panel}>
              <div style={label}>Voice</div>
              {v.available ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" role="switch" aria-checked={v.on} className="sim-dir-btn" onClick={() => v.setOn(!v.on)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 99,
                        border: `1px solid ${v.on ? GOLD : "rgba(255,255,255,.18)"}`, background: v.on ? "rgba(216,152,64,.16)" : "transparent",
                        color: INK, font: `600 12.5px ${SANS}`, cursor: "pointer" }}>
                      {v.on ? <Volume2 size={14} /> : <VolumeX size={14} />} {v.on ? "Voice on" : "Voice off · captions only"}
                    </button>
                    {v.on && v.list.length > 1 && (
                      <select aria-label="Voice" value={v.name} onChange={(e) => v.choose(e.target.value)}
                        style={{ height: 32, maxWidth: 230, padding: "0 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)",
                          background: "#0E2238", color: INK, font: `500 12.5px ${SANS}` }}>
                        {v.list.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.lang})</option>)}
                      </select>
                    )}
                    {v.on && (
                      <button type="button" className="sim-dir-btn" onClick={v.test} disabled={v.testing}
                        style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)",
                          background: "transparent", color: INK, font: `500 12.5px ${SANS}`, cursor: "pointer" }}>
                        {v.testing ? "Listening…" : "Test voice"}
                      </button>
                    )}
                  </div>
                  {v.on && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.55 }}>
                      {v.result ? (
                        <>
                          <b style={{ color: INK }}>{v.result.name}</b> · {v.result.wpm} words a minute
                          {v.result.wpm < 135 && (
                            <div role="alert" style={{ marginTop: 6, color: "#FFD9DF" }}>
                              Slower than 135 words a minute. The run speeds it up by up to 15 % and uses shorter lines if it
                              still runs late; a faster voice is better if one is listed.
                            </div>
                          )}
                        </>
                      ) : (
                        <>On this computer: <b style={{ color: INK }}>{v.name}</b>. Press Test voice to hear it and measure its speed.</>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div role="note" style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.55 }}>
                  {v.loading ? "Looking for an on-device voice…" : (
                    <>No on-device English voice was found on this computer, so the run shows <b style={{ color: INK }}>captions only</b>.
                      Network voices (Google, Microsoft Online) are never used: they would send the text away.</>
                  )}
                </div>
              )}
            </div>

            <div style={panel}>
              <div style={label}>Getting ready</div>
              <div role="list">
                {checks.map((c) => <Row key={c.key} status={c.status} label={c.label} detail={c.detail} />)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: 20 }}>
          <span style={{ fontSize: 12.5, color: INK_DIM }}>{ready ? "Ready. The 2-minute clock starts on Start." : "Start opens when every check has passed."}</span>
          <button ref={startRef} type="button" className="sim-dir-btn" data-sim-start="" disabled={!ready} onClick={onStart}
            style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 48, padding: "0 26px", borderRadius: 12,
              border: "none", background: ready ? `linear-gradient(135deg, ${GOLD_SOFT}, ${GOLD})` : "rgba(255,255,255,.08)",
              color: ready ? "#1A1206" : INK_DIM, font: `700 15px ${SANS}`, cursor: ready ? "pointer" : "not-allowed",
              boxShadow: ready ? "0 12px 34px rgba(216,152,64,.35)" : "none" }}>
            <Play size={17} /> Start
          </button>
        </div>
      </div>
    </div>
  );
}
