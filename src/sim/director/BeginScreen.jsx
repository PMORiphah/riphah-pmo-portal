// PMO Simulation director: the Begin screen, over the App while it gets ready behind it.
// Owner: B3b (contract §H.6).
//
// Shows the assistant, the read time of the live data and the snapshot code, the freshness notice,
// the silent rehearsal (progress, then "N of M scenes ready" or what it changed or left out), the
// projected run time against the 2:30 limit, the six chapters with their start times, notices for the
// presenter (media left out or not loaded, typed card texts, choices not accepted), the voice switch
// with Test voice (required before Start while the voice is on), what the assistant will say,
// Refresh data and Start. Start stays disabled until every rule holds; pressing it is also the
// browser's required gesture before speech.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertTriangle, Volume2, VolumeX, Play, RefreshCw, ChevronDown } from "lucide-react";
import { AssistantAvatar } from "../../AssistantAvatar.jsx";
import { NAVY, GOLD, GOLD_SOFT, INK, INK_SOFT, INK_DIM, SERIF, SANS, Z, EASE } from "./look.js";
import { fmtClock } from "./clock.js";
import { LIMIT } from "./engine.js";

function Row({ status, label, detail }) {
  const icon = status === "ok" ? <Check size={14} color="#3FD3B1" />
    : status === "fail" ? <AlertTriangle size={14} color="#F2A7B4" />
    : status === "warn" ? <AlertTriangle size={14} color={GOLD_SOFT} />
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

// The screen's background, also painted behind the sticky footer (sized and offset to the screen), so the
// footer has no visible edge against it.
const VEIL_BG = `radial-gradient(1100px 620px at 18% -8%, #18406A 0%, rgba(24,64,106,0) 60%),
  radial-gradient(900px 520px at 100% 110%, rgba(216,152,64,.16) 0%, rgba(216,152,64,0) 55%), ${NAVY}`;
const FOOT_MASK = "linear-gradient(180deg, transparent, #000 28%)";

const label = { fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 10 };
const panel = { padding: "16px 18px", borderRadius: 14, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)" };
const ghost = { display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", borderRadius: 9,
  border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: INK, font: `500 12.5px ${SANS}`, cursor: "pointer" };

function Notice({ tone = "info", children }) {
  const c = tone === "bad" ? "#F2A7B4" : tone === "warn" ? GOLD_SOFT : INK_SOFT;
  return (
    <div role={tone === "bad" ? "alert" : "note"} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5,
      color: tone === "bad" ? "#FFD9DF" : INK, padding: "4px 0" }}>
      <AlertTriangle size={13} color={c} style={{ marginTop: 3, flexShrink: 0, opacity: tone === "info" ? 0.6 : 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function BeginScreen({ leaving, data, voice, onStart, onRefresh }) {
  const startRef = useRef(null);
  const [showLines, setShowLines] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const d = data;
  const ready = !!d.startable;
  useEffect(() => { if (ready) startRef.current?.focus({ preventScroll: true }); }, [ready]);
  // The footer's background band is only needed when the page is taller than the screen and the footer
  // sticks to the bottom; on a screen where everything fits it would float mid-page and show an edge.
  const veilRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = veilRef.current;
    if (!el) return undefined;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    window.addEventListener("resize", check);
    return () => { ro?.disconnect(); window.removeEventListener("resize", check); };
  }, []);
  // The band paints the screen's background at the screen's size, shifted by its own offset, so it lines up
  // with the background behind it. (background-attachment: fixed would do this, but Chromium ignores it
  // under the column's entrance animation and squeezes the gradient into the band.)
  const bandRef = useRef(null);
  const placeBand = useCallback(() => {
    const veil = veilRef.current, band = bandRef.current;
    if (!veil || !band) return;
    const v = veil.getBoundingClientRect(), b = band.getBoundingClientRect();
    band.style.backgroundSize = `${veil.clientWidth}px ${veil.clientHeight}px`;
    band.style.backgroundPosition = `${Math.round(v.left - b.left)}px ${Math.round(v.top - b.top)}px`;
  }, []);
  useEffect(() => {
    const veil = veilRef.current;
    if (!overflowing || !veil) return undefined;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(placeBand); };
    placeBand();
    // The footer can change height (a longer message wraps), which moves the band's top.
    const ro = typeof ResizeObserver === "function" && bandRef.current ? new ResizeObserver(onScroll) : null;
    if (ro) ro.observe(bandRef.current);
    veil.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect();
      veil.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll);
    };
  }, [overflowing, placeBand]);
  const v = voice;
  const reh = d.rehearsal;
  // Once Start is ready and nothing failed, the rehearsal checks and the presenter's notes fold into one
  // line (the screen may already be on the projector); a failure keeps them open.
  const anyBad = d.checks.some((c) => c.status === "fail") || (reh?.notes || []).some((t) => t.tone === "bad")
    || d.notices.some((t) => t.tone === "bad");
  const folded = ready && !anyBad && !showDetails;
  const nNotes = d.notices.length + (reh?.notes || []).length;
  const nWarn = d.checks.filter((c) => c.status === "warn").length;
  const rehDetail = d.checks.find((c) => c.key === "rehearsal")?.detail || "";
  return (
    <div ref={veilRef} data-sim-ui="begin" onKeyDown={(e) => e.stopPropagation()} style={{
      position: "fixed", inset: 0, zIndex: Z.veil, overflow: "auto", overflowX: "hidden", display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "40px 16px", fontFamily: SANS, color: INK, boxSizing: "border-box",
      background: VEIL_BG,
      opacity: leaving ? 0 : 1, transition: "opacity .6s ease", pointerEvents: leaving ? "none" : "auto",
    }}>
      <div onAnimationEnd={placeBand} style={{ width: "100%", maxWidth: 900, margin: "auto 0", animation: `simDirIn .5s ${EASE} both` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ width: 104, height: 104, flexShrink: 0 }}>
            <AssistantAvatar size={104} boxScale={1.0} track state={ready ? "success" : "thinking"} />
          </div>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 36, lineHeight: 1.1 }}>PMO Portal · Simulation</h1>
            <div data-sim-ui="as-of" style={{ marginTop: 8, fontSize: 15, color: INK_SOFT }}>
              Live portal data as of <b style={{ color: INK }}>{d.hhmm} PKT</b>
              {d.ageMin != null && <> ({d.ageMin} min ago)</>}
              {d.code && <> · Snapshot <b style={{ color: INK, letterSpacing: ".08em" }}>{d.code}</b></>}
            </div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: INK_DIM }}>
              The assistant presents the portal on this data, read-only, in under {fmtClock(LIMIT)}. Nothing is changed or sent.
            </div>
            {d.fresh && d.fresh.state !== "ok" && (
              <div data-sim-ui="freshness" role={d.fresh.state === "refused" ? "alert" : "note"} style={{ marginTop: 8, display: "inline-flex", gap: 8, alignItems: "center",
                padding: "6px 11px", borderRadius: 9, fontSize: 12.5,
                border: `1px solid ${d.fresh.state === "refused" ? "#F2A7B4" : GOLD}`,
                background: d.fresh.state === "refused" ? "rgba(242,167,180,.10)" : "rgba(216,152,64,.10)",
                color: d.fresh.state === "refused" ? "#FFD9DF" : GOLD_SOFT }}>
                <AlertTriangle size={13} /> {d.fresh.text}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 14 }}>
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <div style={panel}>
              <div style={label}>Chapters</div>
              <div role="list" style={{ display: "grid", gap: 4 }}>
                {d.chapters.map((c) => (
                  <div role="listitem" key={c.n} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 2px",
                    borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <span style={{ width: 16, color: GOLD, fontWeight: 700, fontSize: 12.5 }}>{c.n}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{c.title}</span>
                    <span style={{ fontSize: 12.5, color: INK_DIM, fontVariantNumeric: "tabular-nums" }}>{fmtClock(c.start)}</span>
                  </div>
                ))}
              </div>
              <div data-sim-ui="projected" style={{ marginTop: 12, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.6 }}>
                {d.projected
                  ? <>Projected <b style={{ color: INK }}>{fmtClock(d.projected.at135)}</b> at 135 wpm · {fmtClock(d.projected.at150)} at 150 wpm · limit {fmtClock(LIMIT)}
                    {d.projected.voice && <> · <b style={{ color: INK }}>{fmtClock(d.projected.voice.total)}</b> with this voice ({d.projected.voice.wpm} wpm
                      {d.projected.voice.short ? `; ${d.projected.voice.short} scene${d.projected.voice.short === 1 ? "" : "s"} on short lines` : ""})</>}</>
                  : "Projected time: after the rehearsal."}
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: INK_DIM, lineHeight: 1.6 }}>
                Space pauses · ← → scenes · C chapters · Home restarts · Esc exits
              </div>
            </div>

            {folded ? (
              <div style={{ ...panel, padding: "12px 18px" }}>
                <button type="button" className="sim-dir-btn" data-sim-ui="details-toggle" aria-expanded={false} onClick={() => setShowDetails(true)}
                  style={{ ...ghost, border: "none", padding: 0, height: "auto", minHeight: 28, textAlign: "left", whiteSpace: "normal", lineHeight: 1.5 }}>
                  <Check size={14} color="#3FD3B1" style={{ flexShrink: 0 }} />
                  <span>
                    Ready · {rehDetail}
                    {nNotes > 0 && <span style={{ color: GOLD_SOFT }}> · {nNotes} note{nNotes === 1 ? "" : "s"} for the presenter</span>}
                    {nWarn > 0 && <span style={{ color: GOLD_SOFT }}> · {nWarn} check{nWarn === 1 ? "" : "s"} to look at</span>}
                  </span>
                  <ChevronDown size={14} style={{ flexShrink: 0, transform: "rotate(-90deg)" }} />
                </button>
              </div>
            ) : (
              <div style={panel}>
                <div style={{ ...label, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  Rehearsal
                  {showDetails && (
                    <button type="button" className="sim-dir-btn" data-sim-ui="details-toggle" aria-expanded onClick={() => setShowDetails(false)}
                      style={{ ...ghost, border: "none", padding: 0, height: 20, fontSize: 11.5, color: INK_SOFT, letterSpacing: 0, textTransform: "none" }}>
                      Fold <ChevronDown size={13} style={{ transform: "rotate(180deg)" }} />
                    </button>
                  )}
                </div>
                <div data-sim-ui="rehearsal" role="list">
                  {d.checks.map((c) => <Row key={c.key} status={c.status} label={c.label} detail={c.detail} />)}
                </div>
                {reh && reh.notes.length > 0 && (
                  <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
                    {reh.notes.map((t, i) => <Notice key={i} tone={t.tone}>{t.text}</Notice>)}
                  </div>
                )}
              </div>
            )}
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
                      <button type="button" className="sim-dir-btn" data-sim-test-voice="" onClick={v.test} disabled={v.testing}
                        style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)",
                          background: "transparent", color: INK, font: `500 12.5px ${SANS}`, cursor: "pointer" }}>
                        {v.testing ? "Speaking…" : "Test voice"}
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
                        <>On this computer: <b style={{ color: INK }}>{v.name}</b>. Press <b style={{ color: INK }}>Test voice</b> before Start: it measures the voice's speed.</>
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

            {!folded && d.notices.length > 0 && (
              <div style={panel} data-sim-ui="notices">
                <div style={label}>For the presenter</div>
                <div style={{ display: "grid", gap: 2 }}>
                  {d.notices.map((t, i) => <Notice key={i} tone={t.tone}>{t.text}</Notice>)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ ...panel, marginTop: 14, padding: "10px 18px" }}>
          <button type="button" className="sim-dir-btn" aria-expanded={showLines} onClick={() => setShowLines((x) => !x)}
            style={{ ...ghost, border: "none", padding: 0, height: 28, color: INK_SOFT }}>
            <ChevronDown size={14} style={{ transform: showLines ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            What the assistant will say
          </button>
          {showLines && (
            <ol data-sim-ui="lines" style={{ margin: "8px 0 4px", paddingLeft: 22, display: "grid", gap: 5, fontSize: 13, color: INK, lineHeight: 1.5 }}>
              {d.captions.map((c) => (
                <li key={c.id} style={{ color: c.left ? INK_DIM : INK }}>
                  {c.left ? <i>Left out: {c.caption}</i> : c.caption}
                  {c.note && <span style={{ color: INK_DIM }}> · {c.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Start stays in view on a short screen: the footer sticks to the bottom of the page. Its band
            runs the full width of the screen and is the screen's own background (lined up with it by
            placeBand), faded in at the top, so it shows no edge at the column or against the background glow. */}
        <div style={{ position: "sticky", bottom: -40, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
          marginTop: 10, flexWrap: "wrap", padding: "14px 0 54px",
          marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)",
          paddingLeft: "max(16px, calc(50vw - 450px))", paddingRight: "max(16px, calc(50vw - 450px))" }}>
          {overflowing && <div ref={bandRef} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none",
            background: VEIL_BG, backgroundRepeat: "no-repeat", WebkitMaskImage: FOOT_MASK, maskImage: FOOT_MASK }} />}
          <button type="button" className="sim-dir-btn" data-sim-refresh="" onClick={onRefresh} disabled={d.refreshing || !d.canRefresh} style={ghost}>
            <RefreshCw size={14} style={d.refreshing ? { animation: "simDirSpin .9s linear infinite" } : null} />
            {d.refreshing ? "Reading the portal again…" : "Refresh data"}
          </button>
          <span style={{ flex: "1 1 240px", fontSize: 12.5, color: d.startReasonTone === "bad" ? "#FFD9DF" : INK_DIM, textAlign: "right" }}>
            {d.refreshError || (ready ? `Ready. The ${fmtClock(LIMIT)} clock starts on Start.` : d.startReason)}
          </span>
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
