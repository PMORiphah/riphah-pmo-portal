import { useState, useRef, useEffect, cloneElement } from "react";
import { Sparkles, Check, X, RotateCcw, Wand2, Send, AlertTriangle } from "lucide-react";
import { TYPE, R, MOTION, BRAND, DATA } from "./theme.js";
import { AssistantAvatar } from "./AssistantAvatar.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   ENHANCE (PMO, 13 Nov 2026). An "Enhance" button inside a title / note / details box in PMO Goals and
   PMO Achievements. The assistant (edge function enhance-text, PMO only) rewrites the text in clear office
   English; the PMO sees a live timer while it works, then compares and chooses: Use this · Keep mine ·
   Refine further (Shorter / More formal / More detail / Fix grammar only, or a typed instruction).
   Figures, dates, codes and e-mails are fact-checked on the server; nothing is saved until the PMO saves the form.
   Usage:  <EnhanceAI T supa token field="title" context="task" value={v} onApply={(t) => set("title", t)}>
             <input … />
           </EnhanceAI>
   ═══════════════════════════════════════════════════════════════════════════ */

const STYLES = [["shorter", "Shorter"], ["formal", "More formal"], ["detail", "More detail"], ["grammar", "Fix grammar only"]];
const MIN = 3;

// Word diff: the enhanced text with new or changed words marked. LCS on words; skipped for long texts.
function diffWords(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (A.length * B.length > 360000) return [{ t: b, add: false }];
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = norm(A[i]) === norm(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (j < m) {
    if (i < n && norm(A[i]) === norm(B[j])) { out.push({ t: B[j], add: false }); i++; j++; }
    else if (i < n && L[i + 1][j] >= L[i][j + 1]) i++;
    else { out.push({ t: B[j], add: /\S/.test(B[j]) && A[i] !== B[j] }); j++; }
  }
  return out;
}

export function EnhanceAI({ T, supa, token, field, context, value, onApply, children, compact }) {
  const [st, setSt] = useState(null);          // null | {phase:"work", t0, label} | {phase:"done", text, ms, model} | {phase:"error", msg}
  const [orig, setOrig] = useState("");        // the PMO's own text when this round started
  const [cur, setCur] = useState("");          // the text the latest round refined
  const [now, setNow] = useState(0);
  const [ask, setAsk] = useState("");
  const [undo, setUndo] = useState(null);      // text before "Use this", for Undo
  const ctl = useRef(null), undoT = useRef(null);
  const text = String(value || "");
  const can = text.trim().length >= MIN;

  useEffect(() => { if (st?.phase !== "work") return; const id = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(id); }, [st?.phase]);
  useEffect(() => () => { ctl.current?.abort(); clearTimeout(undoT.current); }, []);

  const run = async (source, opts = {}) => {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    const t0 = performance.now(); setNow(t0);
    setSt({ phase: "work", t0, label: opts.label || "Refining your text" });
    try {
      const r = await supa("/functions/v1/enhance-text", { method: "POST", signal: c.signal, body: JSON.stringify({
        text: source, original: opts.original || source, field, context, style: opts.style || undefined, instruction: opts.instruction || undefined }) }, token);
      if (c.signal.aborted) return;
      if (!r?.ok || !r.text) throw new Error(r?.error || "No answer");
      setCur(r.text);
      setSt({ phase: "done", text: r.text, ms: Math.round(performance.now() - t0), model: r.model });
    } catch (e) {
      if (c.signal.aborted) return;
      setSt({ phase: "error", msg: String(e.message || e).replace(/^HTTP \d+$/, "The assistant could not refine the text right now.") });
    }
  };
  const start = () => { setOrig(text); setCur(text); setAsk(""); setUndo(null); run(text); };
  const further = (style, label) => { const ins = style ? "" : ask.trim(); if (!style && !ins) return; run(cur, { original: orig, style, instruction: ins, label }); setAsk(""); };
  const cancel = () => { ctl.current?.abort(); setSt(null); };
  const use = () => {
    const before = text; onApply(st.text); setSt(null); setUndo(before);
    clearTimeout(undoT.current); undoT.current = setTimeout(() => setUndo(null), 10000);
  };

  const accent = BRAND.blueBright;
  const working = st?.phase === "work";
  const secs = working ? Math.max(0, (now - st.t0) / 1000) : 0;
  const child = cloneElement(children, { style: { ...(children.props.style || {}), paddingRight: can ? (compact ? 44 : 104) : children.props.style?.paddingRight } });

  return (
    <div data-enhance={field} style={{ position: "relative", minWidth: 0 }}>
      <style>{`
        @keyframes enRise { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
        @keyframes enShine { 0% { background-position: -160% 0 } 100% { background-position: 260% 0 } }
        @keyframes enDot { 0%, 80%, 100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-3px) } }
        .en-btn { transition: transform ${MOTION.fast}, box-shadow ${MOTION.fast}, opacity ${MOTION.fast} }
        .en-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px -6px ${accent} }
        .en-panel { animation: enRise 260ms cubic-bezier(.2,.7,.2,1) both }
        .en-shine { background: linear-gradient(100deg, transparent 20%, ${accent}33 50%, transparent 80%); background-size: 60% 100%; background-repeat: no-repeat; animation: enShine 1.6s ease-in-out infinite }
        .en-dot { display: inline-block; animation: enDot 1.2s infinite }
        .en-chip { transition: all ${MOTION.fast} }
        .en-chip:hover:not(:disabled) { transform: translateY(-1px); border-color: ${accent} !important }
        @media (prefers-reduced-motion: reduce) { .en-panel, .en-shine, .en-dot { animation: none !important } }
      `}</style>
      <div style={{ position: "relative" }}>
      {child}
      {can && (
        <button type="button" onClick={working ? cancel : start} data-enhance-btn="" className="pmo-focusable en-btn"
          aria-label={working ? "Stop enhancing" : "Enhance this text with the assistant"} title={working ? "Stop" : "Enhance with the assistant"}
          style={{ position: "absolute", right: 6, top: field === "title" ? "50%" : 6, transform: field === "title" ? "translateY(-50%)" : undefined,
            display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "5px 7px" : "4px 10px", borderRadius: R.pill, cursor: "pointer",
            border: `1px solid ${accent}66`, background: `linear-gradient(120deg, ${accent}26, ${DATA.violet}26)`, color: T.textOf(accent),
            ...TYPE.caption, fontSize: 11.5, fontWeight: 800, fontFamily: TYPE.body.fontFamily, zIndex: 2 }}>
          {working ? <X size={13} /> : <Sparkles size={13} />}{!compact && (working ? "Stop" : "Enhance")}
        </button>
      )}
      </div>

      {undo !== null && !st && (
        <div data-enhance-undo="" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, ...TYPE.caption, color: T.textOf(DATA.positive) }}>
          <Check size={13} /> Enhanced text in place.
          <button type="button" onClick={() => { onApply(undo); setUndo(null); }} className="pmo-focusable" data-enhance-undo-btn=""
            style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", padding: 0, cursor: "pointer", color: T.textOf(accent), fontWeight: 700, ...TYPE.caption, fontFamily: TYPE.body.fontFamily }}>
            <RotateCcw size={12} /> Undo</button>
        </div>
      )}

      {st && (
        <div className="en-panel" data-enhance-panel={st.phase} role="region" aria-label="Enhanced text" aria-live="polite"
          style={{ marginTop: 8, borderRadius: R.lg, overflow: "hidden", border: `1px solid ${accent}55`,
            background: T.mode === "dark" ? `linear-gradient(160deg, ${accent}1a, ${T.surface} 60%)` : `linear-gradient(160deg, ${accent}12, ${T.card} 60%)`,
            boxShadow: `0 14px 34px -20px ${accent}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 6px 6px" }}>
            <div style={{ width: 46, height: 46, flexShrink: 0, display: "grid", placeItems: "center", overflow: "visible" }}>
              <AssistantAvatar T={T} size={30} track={false} boxScale={1.5} state={working ? "thinking" : st.phase === "error" ? "error" : "success"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TYPE.caption, fontWeight: 800, color: T.text }}>
                {working ? <>{st.label}<span className="en-dot">.</span><span className="en-dot" style={{ animationDelay: ".15s" }}>.</span><span className="en-dot" style={{ animationDelay: ".3s" }}>.</span></>
                  : st.phase === "done" ? "Here is a refined version" : "Could not refine"}
              </div>
              <div data-enhance-time="" style={{ ...TYPE.caption, fontSize: 10.5, color: T.muted, fontVariantNumeric: "tabular-nums" }}>
                {working ? `PMO assistant · ${secs.toFixed(1)} s` : st.phase === "done" ? `Refined in ${(st.ms / 1000).toFixed(1)} s · figures, dates and codes checked` : "Nothing was changed"}
              </div>
            </div>
            {working && <button type="button" onClick={cancel} className="pmo-focusable" data-enhance-cancel=""
              style={{ border: `1px solid ${T.border}`, background: T.card, color: T.muted, borderRadius: R.sm, padding: "4px 10px", cursor: "pointer", ...TYPE.caption, fontWeight: 700, fontFamily: TYPE.body.fontFamily }}>Cancel</button>}
          </div>

          {working && (
            <div style={{ padding: "0 12px 12px" }}>
              {[92, 78, field === "title" ? 0 : 60].filter(Boolean).map((w, i) => (
                <div key={i} className="en-shine" style={{ height: 9, width: `${w}%`, borderRadius: 99, marginTop: i ? 7 : 2, backgroundColor: T.mode === "dark" ? "rgba(255,255,255,0.07)" : "rgba(10,30,60,0.07)", animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}

          {st.phase === "error" && (
            <div style={{ padding: "0 12px 12px" }}>
              <div style={{ display: "flex", gap: 8, ...TYPE.caption, color: T.textSoft }}><AlertTriangle size={13} color={DATA.warning} style={{ flexShrink: 0, marginTop: 2 }} />{st.msg}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
                <PanelBtn T={T} onClick={() => setSt(null)}>Close</PanelBtn>
                <PanelBtn T={T} primary onClick={() => run(cur, cur === orig ? {} : { original: orig })} attr={{ "data-enhance-retry": "" }}><RotateCcw size={12} /> Try again</PanelBtn>
              </div>
            </div>
          )}

          {st.phase === "done" && (
            <div style={{ padding: "0 12px 12px" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ ...TYPE.label, fontSize: 9, color: T.muted }}>Yours</div>
                <div data-enhance-mine="" style={{ ...TYPE.caption, color: T.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 90, overflow: "auto" }}>{orig}</div>
                <div style={{ ...TYPE.label, fontSize: 9, color: T.textOf(accent), marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}><Sparkles size={10} /> Enhanced</div>
                <div data-enhance-result="" style={{ ...TYPE.bodySm, color: T.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55, padding: "8px 10px", borderRadius: R.md,
                  background: T.mode === "dark" ? "rgba(255,255,255,0.04)" : "#fff", border: `1px solid ${T.border}`, maxHeight: 220, overflow: "auto" }}>
                  {diffWords(orig, st.text).map((p, i) => p.add
                    ? <mark key={i} style={{ background: `${DATA.positive}2e`, color: "inherit", borderRadius: 3, padding: "0 1px" }}>{p.t}</mark>
                    : <span key={i}>{p.t}</span>)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                <span style={{ ...TYPE.caption, fontSize: 10.5, color: T.muted, alignSelf: "center", marginRight: 2 }}><Wand2 size={11} style={{ verticalAlign: -1 }} /> Refine further:</span>
                {STYLES.map(([k, label]) => (
                  <button key={k} type="button" onClick={() => further(k, label === "Fix grammar only" ? "Fixing grammar" : `Making it ${label.toLowerCase().replace("more ", "more ")}`)} data-enhance-style={k} className="pmo-focusable en-chip"
                    style={{ padding: "3px 10px", borderRadius: R.pill, border: `1px solid ${T.border}`, background: T.card, color: T.textSoft, cursor: "pointer", ...TYPE.caption, fontSize: 11, fontWeight: 700, fontFamily: TYPE.body.fontFamily }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); further(null, "Refining as you asked"); } }}
                  placeholder="Or tell the assistant what to change…" data-enhance-ask="" aria-label="Tell the assistant what to change"
                  style={{ flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: R.md, border: `1px solid ${T.border}`, background: T.mode === "dark" ? "rgba(255,255,255,0.04)" : "#fff", color: T.text, ...TYPE.caption, fontFamily: TYPE.body.fontFamily, outline: "none" }} />
                <PanelBtn T={T} onClick={() => further(null, "Refining as you asked")} disabled={!ask.trim()} attr={{ "data-enhance-ask-go": "", "aria-label": "Refine with this instruction" }}><Send size={12} /></PanelBtn>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <PanelBtn T={T} onClick={() => setSt(null)} attr={{ "data-enhance-keep": "" }}><X size={12} /> Keep mine</PanelBtn>
                <PanelBtn T={T} primary onClick={use} attr={{ "data-enhance-use": "" }}><Check size={12} /> Use this</PanelBtn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelBtn({ T, primary, onClick, children, disabled, attr = {} }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pmo-focusable en-chip" {...attr}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: R.md, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        border: `1px solid ${primary ? BRAND.blueBright : T.border}`, background: primary ? BRAND.blueBright : T.card, color: primary ? "#fff" : T.textSoft,
        ...TYPE.caption, fontWeight: 800, fontFamily: TYPE.body.fontFamily }}>{children}</button>
  );
}
