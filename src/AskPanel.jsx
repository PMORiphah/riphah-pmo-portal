import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Send, Loader2, AlertTriangle, RotateCcw, Database,
         Wallet, Layers, TrendingUp, CalendarRange } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND, DATA } from "./theme.js";
import { Button, CAN_HOVER, useCountUp, useCursorLight } from "./ui.jsx";
import { useNear } from "./presence.jsx";
import { AssistantAvatar, AssistantLauncher } from "./AssistantAvatar.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   ASK — the portal assistant

   A thin client over the `ask` edge function. Everything that matters happens
   server-side: the context is built under the caller's own JWT so RLS scopes
   it, every figure comes from SQL rather than the model, and the function is
   read-only — there is no write path to expose.

   The panel shows what each answer was based on ("30 of 105 projects"), so a
   figure can always be traced back to rows rather than taken on trust.
   ═══════════════════════════════════════════════════════════════════════════ */

const STARTERS = [
  "How much has been released across the portfolio?",
  "Which projects have no charter?",
  "What are the risks on Ferozpur?",
  "Which projects have no project manager?",
  "What is planned for November?",
];

let cssIn = false;
function useAskStyles() {
  useEffect(() => {
    if (cssIn) return;
    cssIn = true;
    const el = document.createElement("style");
    // `backwards`, never `both`: a retained final keyframe leaves a transform
    // or filter in place, which makes the element a containing block for
    // position:fixed children and silently drags this panel out of position.
    el.textContent = `
@keyframes askIn    { from { opacity:0; transform:translateY(8px);  } to { opacity:1; transform:none; } }
@keyframes askPulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }

/* The panel grows out of the launcher and collapses back into it, so opening
   reads as the character expanding rather than a modal appearing beside it.
   Origin is bottom-right because that is where the character sits. */
@keyframes askGrow  { from { opacity:0; transform:translateY(26px) scale(.82); }
                      60%  { opacity:1; }
                      to   { opacity:1; transform:none; } }
@keyframes askShrink{ from { opacity:1; transform:none; }
                      to   { opacity:0; transform:translateY(26px) scale(.82); } }
@keyframes askVeil  { from { opacity:0 } to { opacity:1 } }
@keyframes askVeilOut{ from { opacity:1 } to { opacity:0 } }
@keyframes askSheet { from { opacity:0; transform:translateY(100%); } to { opacity:1; transform:none; } }
@keyframes askSheetOut { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(100%); } }

.ask-in     { animation: askIn .28s cubic-bezier(.22,.8,.3,1) backwards; }
.ask-head   { animation: askIn .34s cubic-bezier(.22,.8,.3,1) backwards; }
.ask-dot    { animation: askPulse 1.3s ease-in-out infinite; }
.ask-grow   { animation: askGrow .42s cubic-bezier(.16,1,.3,1) backwards; transform-origin: 100% 100%; }
.ask-shrink { animation: askShrink .34s cubic-bezier(.5,0,.75,0) forwards; transform-origin: 100% 100%; }
.ask-sheet  { animation: askSheet .36s cubic-bezier(.16,1,.3,1) backwards; }
.ask-sheetout{ animation: askSheetOut .3s cubic-bezier(.5,0,.75,0) forwards; }
.ask-veil   { animation: askVeil .3s ease backwards; }
.ask-veilout{ animation: askVeilOut .3s ease forwards; }

@media (prefers-reduced-motion: reduce) {
  .ask-in, .ask-dot, .ask-grow, .ask-shrink, .ask-sheet, .ask-sheetout,
  .ask-veil, .ask-veilout { animation: none !important; }
}`;
    document.head.appendChild(el);
  }, []);
}

/* Minimal markdown — the model returns tables, bold and bullets. Rendered by
   hand rather than pulling a parser in for three constructs. */
function Rendered({ T, text }) {
  const blocks = [];
  const lines = String(text || "").split("\n");
  let table = null;

  const flushTable = () => {
    if (!table || table.length < 2) { if (table) table.forEach((r) => blocks.push({ p: r })); table = null; return; }
    const cells = (r) => r.split("|").map((c) => c.trim()).filter((c, i, a) => !(i === 0 && !c) && !(i === a.length - 1 && !c));
    const head = cells(table[0]);
    const body = table.slice(1).filter((r) => !/^[\s|:-]+$/.test(r)).map(cells);
    blocks.push({ table: { head, body } });
    table = null;
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) { (table ||= []).push(line.trim()); return; }
    flushTable();
    if (!line.trim()) return;
    if (/^\s*[-*•]\s+/.test(line)) blocks.push({ li: line.replace(/^\s*[-*•]\s+/, "") });
    else blocks.push({ p: line });
  });
  flushTable();

  const inline = (s) => {
    const out = [];
    String(s).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((piece, i) => {
      if (/^\*\*[^*]+\*\*$/.test(piece))
        out.push(<strong key={i} style={{ color: T.text, fontWeight: 700 }}>{piece.slice(2, -2)}</strong>);
      else if (/^`[^`]+`$/.test(piece))
        out.push(<code key={i} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.92em",
          background: T.card2, padding: "1px 5px", borderRadius: 4 }}>{piece.slice(1, -1)}</code>);
      else if (piece) out.push(<span key={i}>{piece}</span>);
    });
    return out;
  };

  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.65, color: T.textSoft }}>
      {blocks.map((b, i) =>
        b.table ? (
          // Tables scroll on their own axis so a wide one never makes the panel
          // scroll sideways. overflow-x:auto with the container clipped is the
          // only pairing that behaves.
          <div key={i} className="pmo-scroll" style={{ overflowX: "auto", margin: `${SP.sm}px 0` }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr>{b.table.head.map((h, j) => (
                  <th key={j} style={{ textAlign: "left", padding: "5px 9px", whiteSpace: "nowrap",
                    borderBottom: `1px solid ${T.borderStrong}`, color: T.muted,
                    ...TYPE.label }}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {b.table.body.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => (
                    <td key={k} style={{ padding: "5px 9px", borderBottom: `1px solid ${T.border}`,
                      color: k === 0 ? T.text : T.textSoft, whiteSpace: "nowrap" }}>{inline(c)}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : b.li ? (
          <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0 3px 2px" }}>
            <span style={{ color: T.dim, flexShrink: 0 }}>•</span><span>{inline(b.li)}</span>
          </div>
        ) : (
          <p key={i} style={{ margin: "0 0 7px" }}>{inline(b.p)}</p>
        ))}
    </div>
  );
}


/* §12/§14: when an answer has one dominant figure, lead with it. The value
   arrives as a field from the edge function and is checked there against the
   context that was actually sent — it is never parsed back out of the prose,
   because a number extracted by regex and rendered at 30px is exactly the kind
   of confident wrongness this assistant must not produce. */
const KIND = {
  money:    { Icon: Wallet,      tone: BRAND.gold },
  count:    { Icon: Layers,      tone: BRAND.blue },
  percent:  { Icon: TrendingUp,  tone: DATA.positive },
  risk:     { Icon: AlertTriangle, tone: DATA.warning },
  schedule: { Icon: CalendarRange, tone: DATA.info },
};

function HeadlineCard({ T, headline }) {
  const k = KIND[headline.kind] || KIND.count;
  const { Icon, tone } = k;
  const [hover, setHover] = useState(false);
  const cl = useCursorLight(true);
  const nearRef = useNear();

  // useCountUp anchors on a digit at the start of the string, so "PKR 226,099,073"
  // would not animate at all. Split the prefix off and count the number itself.
  // The animation always lands on the exact target, so the resting value is the
  // verbatim figure the edge function verified — never a rounded stand-in.
  const raw = String(headline.value ?? "");
  const prefix = (raw.match(/^[^\d-]*/) || [""])[0];
  const counted = useCountUp(raw.slice(prefix.length));

  return (
    <div
      ref={(n) => { cl.ref.current = n; nearRef.current = n; }}
      onMouseMove={cl.onMouseMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); cl.onMouseLeave(); }}
      className={`ask-head pmo-near ${hover ? "pmo-hot" : ""}`}
      style={{
        position: "relative", overflow: "hidden",
        "--near-light": `${tone}26`,
        borderRadius: R.lg, padding: `${SP.md}px ${SP.lg}px`,
        background: hover
          ? `linear-gradient(140deg, ${T.surfaceHi} 0%, ${tone}${T.washStrong} 100%)`
          : `linear-gradient(140deg, ${T.surfaceRaised} 0%, ${tone}${T.wash} 100%)`,
        border: `1px solid ${hover ? tone + "8A" : tone + "44"}`,
        boxShadow: hover ? T.glowSoft(tone) : "none",
        marginBottom: SP.sm,
        transition: `background ${MOTION.base}, border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
      }}>
      <span className="pmo-sheen" />
      <span className="pmo-cursor-light" style={{
        background: `radial-gradient(240px circle at var(--mx,50%) var(--my,50%), ${T.cursorLight}, transparent 70%)`,
      }} />
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${tone}, ${tone}33 70%, transparent)`,
        opacity: hover ? 1 : .7, transition: `opacity ${MOTION.base}` }} />

      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <Icon className={hover ? "pmo-ico-up" : ""} size={12} color={tone} strokeWidth={2.2} />
        <span style={{ ...TYPE.label, color: T.muted }}>{headline.label || "Result"}</span>
      </div>
      <div style={{ position: "relative", ...TYPE.metricSm, fontSize: 30, lineHeight: 1.05,
        color: T.text, letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>
        {prefix}{counted}
      </div>
      {headline.scope && (
        <div style={{ position: "relative", ...TYPE.caption,
          color: hover ? T.textSoft : T.dim, marginTop: 4,
          transition: `color ${MOTION.base}` }}>{headline.scope}</div>
      )}
    </div>
  );
}

function Bubble({ T, msg }) {
  const mine = msg.role === "user";
  return (
    <div className="ask-in" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: mine ? "82%" : "100%",
        background: mine ? `${BRAND.blue}1F` : T.surfaceRaised,
        border: `1px solid ${mine ? `${BRAND.blue}3D` : T.border}`,
        borderRadius: R.lg, padding: mine ? "9px 13px" : `${SP.md}px ${SP.md}px ${SP.sm}px`,
        color: T.text, width: mine ? undefined : "100%",
      }}>
        {mine ? (
          <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{msg.content}</span>
        ) : (
          <>
            {msg.headline && <HeadlineCard T={T} headline={msg.headline} />}
            <Rendered T={T} text={msg.content} />
          </>
        )}
        {!mine && msg.used && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: SP.sm,
            paddingTop: SP.sm, borderTop: `1px solid ${T.border}` }}>
            <Database size={10.5} color={T.dim} />
            <span style={{ ...TYPE.caption, color: T.dim }}>
              {[
                msg.used.trimmed_from
                  ? `${msg.used.projects} of ${msg.used.trimmed_from} projects`
                  : msg.used.projects ? `${msg.used.projects} project${msg.used.projects === 1 ? "" : "s"}` : null,
                msg.used.risks ? `${msg.used.risks} risks` : null,
                msg.used.cashflow_months ? `${msg.used.cashflow_months} months of cashflow` : null,
              ].filter(Boolean).join(" · ") || "portfolio totals"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AskPanel({ T, session, supa, isCompact }) {
  useAskStyles();
  const [open, setOpen]   = useState(false);
  const [closing, setClosing] = useState(false);
  const [msgs, setMsgs]   = useState([]);
  const [q, setQ]         = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const endRef  = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 240); }, [open]);
  // §30: contract, then unmount. 340ms matches the shrink animation.
  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); setOpen(false); }, 340);
  }, [closing]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && open && !busy) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, close]);

  const send = useCallback(async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ(""); setErr(null); setBusy(true);
    const next = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    try {
      const r = await supa("/functions/v1/ask", {
        method: "POST",
        body: JSON.stringify({
          question,
          // Only the text goes back, never the `used` metadata.
          history: msgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      }, session.access_token);
      if (r?.error) { setErr(r.error); setMsgs(next); }
      else setMsgs([...next, { role: "assistant", content: r.answer,
                               headline: r.headline, used: r.used }]);
    } catch (e) {
      setErr(e?.message || "The assistant could not be reached.");
    }
    setBusy(false);
  }, [q, busy, msgs, supa, session]);

  const panelW = isCompact ? "100%" : 460;

  return (
    <>
      {/* launcher */}
      {!open && (
        <AssistantLauncher T={T} isCompact={isCompact} onOpen={() => setOpen(true)} />
      )}

      {open && createPortal(
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}
          className={closing ? "ask-veilout" : "ask-veil"}
          style={{
            position: "fixed", inset: 0, zIndex: 1300,
            // §20: the dashboard stays visible behind, so the assistant reads as
            // part of the portal rather than another application on top of it.
            background: isCompact ? "rgba(3,8,16,.55)" : "rgba(3,8,16,.28)",
            backdropFilter: "blur(2px) saturate(.9)",
            display: "flex",
            alignItems: isCompact ? "stretch" : "flex-end",
            justifyContent: isCompact ? "stretch" : "flex-end",
            padding: isCompact ? 0 : "0 22px 20px 0",
          }}>
          <div className={isCompact
                ? (closing ? "ask-sheetout" : "ask-sheet")
                : (closing ? "ask-shrink" : "ask-grow")}
            role="dialog" aria-modal="true" aria-label="Portal assistant"
            style={{
              width: isCompact ? "100%" : 440,
              height: isCompact ? "100%" : "min(680px, calc(100vh - 40px))",
              display: "flex", flexDirection: "column",
              background: isCompact ? T.surface : `${T.surface}F2`,
              backdropFilter: isCompact ? undefined : "blur(22px) saturate(1.15)",
              border: isCompact ? "none" : `1px solid ${T.borderStrong}`,
              borderRadius: isCompact ? 0 : R.xl,
              boxShadow: isCompact ? "none"
                : `0 24px 70px -12px rgba(0,0,0,.66), 0 0 0 1px ${BRAND.gold}1F,
                   0 0 60px -20px ${BRAND.blue}80`,
              overflow: "hidden",
            }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: SP.sm,
              padding: `${SP.sm}px ${SP.lg}px ${SP.sm}px ${SP.md}px`,
              borderBottom: `1px solid ${T.border}`,
              background: `linear-gradient(140deg, ${T.surfaceRaised}, ${BRAND.blue}0F)` }}>
              <div style={{ marginLeft: -8, marginRight: -2, flexShrink: 0 }}>
                <AssistantAvatar size={102} boxScale={1.16} track={false}
                  state={busy ? "thinking" : err ? "error" : "idle"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPE.h3, fontSize: 15, color: T.text }}>Portal assistant</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%",
                    background: DATA.positive, boxShadow: `0 0 6px ${DATA.positive}` }} />
                  <span style={{ ...TYPE.caption, color: T.dim }}>
                    Live portfolio intelligence
                  </span>
                </div>
              </div>
              {msgs.length > 0 && (
                <button onClick={() => { setMsgs([]); setErr(null); }} disabled={busy}
                  className="pmo-focusable" title="Start over"
                  style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer",
                    padding: 5, color: T.muted, opacity: busy ? 0.4 : 1 }}>
                  <RotateCcw size={14} />
                </button>
              )}
              <button onClick={close} className="pmo-focusable" aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 5, color: T.muted }}>
                <X size={16} />
              </button>
            </div>

            {/* conversation */}
            <div className="pmo-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden",
              padding: SP.lg, display: "flex", flexDirection: "column", gap: SP.md }}>
              {msgs.length === 0 && (
                <div className="ask-in">
                  <div style={{ fontSize: 13.5, color: T.textSoft, lineHeight: 1.65, marginBottom: SP.md }}>
                    Ask about projects, budgets, risks, cashflow or data gaps. Every figure comes
                    from the database, and each answer shows what it was based on.
                  </div>
                  <div style={{ ...TYPE.label, color: T.muted, marginBottom: SP.sm }}>Try</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {STARTERS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="pmo-focusable pmo-btn"
                        style={{ textAlign: "left", padding: "8px 11px", borderRadius: R.md,
                          background: T.card2, border: `1px solid ${T.border}`,
                          color: T.textSoft, fontSize: 12.5, cursor: "pointer",
                          transition: `border-color ${MOTION.fast}, color ${MOTION.fast}` }}
                        onMouseEnter={(e) => { if (CAN_HOVER) {
                          e.currentTarget.style.borderColor = `${BRAND.blue}66`;
                          e.currentTarget.style.color = T.text; } }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = T.border;
                          e.currentTarget.style.color = T.textSoft; }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => <Bubble key={i} T={T} msg={m} />)}

              {busy && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, color: T.muted }}>
                  {/* 26px was too small to show the thinking state at all — the gold
                      sweep, scanline and data streams were sub-pixel. At 78 the
                      animation actually reads, which is the whole point of it. */}
                  <AssistantAvatar size={78} boxScale={1.2} track={false} state="thinking" />
                  <span className="ask-dot" style={{ ...TYPE.caption, marginLeft: -4 }}>
                    Reading the portfolio…
                  </span>
                </div>
              )}

              {err && (
                <div style={{ display: "flex", gap: 9, padding: `${SP.sm}px ${SP.md}px`,
                  borderRadius: R.md, background: `${DATA.warning}14`,
                  border: `1px solid ${DATA.warning}3D` }}>
                  <AlertTriangle size={14} color={T.textOf(DATA.warning)} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: T.textOf(DATA.warning), lineHeight: 1.55 }}>{err}</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* composer */}
            <div style={{ padding: SP.md, borderTop: `1px solid ${T.border}`, background: T.surfaceRaised }}>
              <div style={{ display: "flex", gap: SP.sm, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef} value={q} rows={1}
                  onChange={(e) => {
                    setQ(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Ask about the portfolio…"
                  disabled={busy}
                  className="pmo-focusable pmo-scroll"
                  style={{ flex: 1, resize: "none", maxHeight: 120,
                    background: T.inputBg, border: `1px solid ${T.inputBorder}`,
                    borderRadius: R.md, padding: "9px 11px", fontSize: 13.5,
                    fontFamily: TYPE.body.fontFamily, color: T.text, lineHeight: 1.5,
                    outline: "none", opacity: busy ? 0.6 : 1 }} />
                <Button T={T} variant="primary" icon={Send} onClick={() => send()}
                  disabled={busy || !q.trim()} aria-label="Send" />
              </div>
              <div style={{ ...TYPE.caption, color: T.dim, marginTop: 6 }}>
                Enter to send · Shift+Enter for a new line
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
