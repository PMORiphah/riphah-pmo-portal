import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay, Film, AlertTriangle, CheckCircle2, Users, Image as ImageIcon, ListChecks, MessageSquare, RefreshCw, FileText,
  Share2, UserPlus, Ban, PlayCircle } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND } from "./theme.js";
import { Modal, Button, Select } from "./ui.jsx";
import { readSnapshot, previewPlan } from "./sim/live/snapshot.js";
import { buildNarration } from "./sim/live/build.js";
import { launch, startPrefetch, galleryFirstIds, makeGet, portalBuild, setSessionFallback, isVideo, isSupportedMedia, ITEM_MAX } from "./simBridge.js";
import { createShare, replaceShare, addRecipients, removeRecipient, stopSharing, loadShareState, launchShared, preloadShared, buildState, isExpired,
  asOfText, dayText, SHARE_DAYS, servedBuild, tidyExpired, tidyEnded, siteOf } from "./simShare.js";
import { PeoplePicker } from "./PeoplePicker.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   SIMULATION LAUNCHER (PMO only, desktop). Owner: B1. Spec: contract §D.4.

   Opened from the sidebar's Simulation button. The simulation presents the
   portal on its live data, read-only. This window:
   1. reads the portal's data now (GET only, under the PMO's session) and shows
      what each scene will be about (story project, Updates thread, past
      project, monthly report, risk row, user row, Gallery subject), each with
      a Change list limited to what the rule allows;
   2. shows the exact texts that will reach the projector (thread messages,
      the lit risk and user rows, the Gallery tiles) for the PMO to approve;
   3. lists the accounts that look like test accounts (tick boxes) and lets the
      PMO leave single photos or videos out of this presentation;
   4. prepares the photos and videos in the background (re-encoded here).
   Every choice is held in this window's memory only: nothing is written to the
   database or to browser storage. Start Simulation reads the data again and
   hands it to the new tab (src/simBridge.js).
   5. "Shared with senior management" (src/simShare.js): shares this
      simulation, as it would start now, with chosen guests for 7 days. Only
      then is anything stored: the snapshot and the prepared photos and videos
      (private storage), the guests, and the choices (settings, PMO only), so
      it can be shared again after a portal update.
   ═══════════════════════════════════════════════════════════════════════════ */

// Keys an earlier build of the simulation kept in this browser; removed when the window opens.
const OLD_KEYS = ["pmo-sim-media-ticks", "pmo-sim-say"];

const mb = (n) => `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
const fmtClock = (s) => { const t = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const hhmmPKT = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
const whenPKT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};
const ROLE = { pmo: "PMO", project_manager: "Project manager", guest: "Guest" };
// What the voice may be given as a spoken name: no "<", control characters, zero-width or bidi
// marks, at most 80 characters. Tested by code point.
const badChar = (c) => c === 0x3c || c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f)
  || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
const cleanText = (s) => [...String(s || "")].filter((ch) => !badChar(ch.codePointAt(0))).join("").replace(/\s+/g, " ").trim().slice(0, 80);

// Plan rows the PMO can change: candidate list → override key, and the plan's current id.
const CHOICES = [
  { list: "story", key: "storyId", title: "Project followed", current: (p) => p?.story?.id },
  { list: "updates", key: "updatesProjectId", title: "Updates thread", current: (p) => p?.updates?.projectId },
  { list: "past", key: "pastId", title: "Past project", current: (p) => p?.past?.id },
  { list: "report", key: "reportId", title: "Monthly report", current: (p) => p?.report?.id },
  { list: "riskRow", key: "riskRowId", title: "Risk row lit", current: (p) => p?.risks?.rowId },
  { list: "usersRow", key: "usersUserId", title: "User row lit", current: (p) => p?.users?.row?.userId },
  { list: "gallery", key: "galleryProjectId", title: "Gallery subject", current: (p) => p?.gallery?.projectId },
];

function Block({ T, icon: Icon, title, right, children }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.surface, padding: SP.lg, marginBottom: SP.lg }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, marginBottom: SP.md, flexWrap: "wrap" }}>
        <Icon size={15} color={T.textOf(BRAND.blue)} />
        <div style={{ ...TYPE.h3, color: T.text, flex: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Note = ({ T, tone, children }) => (
  <div style={{ fontSize: 12.5, color: tone ? T.textOf(tone) : T.muted, lineHeight: 1.55, marginBottom: SP.sm }}>{children}</div>
);

function TextBox({ T, id, label, value, placeholder, onChange, hint, disabled }) {
  return (
    <div style={{ marginTop: SP.sm }}>
      <label htmlFor={id} style={{ ...TYPE.label, color: T.muted, display: "block", marginBottom: 4 }}>{label}</label>
      <input id={id} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value.slice(0, 80))}
        style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm,
          padding: "7px 10px", fontSize: 13, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none" }} />
      {hint && <div style={{ ...TYPE.caption, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

// One message as it will be shown (the thread texts the PMO approves).
function Message({ T, who, role, when, body, lit }) {
  return (
    <div style={{ padding: "7px 10px", borderRadius: R.sm, marginBottom: 6, background: lit ? `${BRAND.gold}14` : T.inputBg,
      border: `1px solid ${lit ? `${BRAND.gold}66` : T.border}` }}>
      <div style={{ ...TYPE.caption, color: T.muted, marginBottom: 3 }}>
        <b style={{ color: T.text }}>{who || "—"}</b>{role ? ` · ${ROLE[role] || role}` : ""}{when ? ` · ${when}` : ""}{lit ? " · lit in the presentation" : ""}
      </div>
      <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>{body || <span style={{ color: T.dim }}>(no text)</span>}</div>
    </div>
  );
}

function ChoiceRow({ T, title, options, value, onPick, onReset, overridden, disabled, children }) {
  const opts = options || [];
  const has = opts.some((o) => o.id === value);
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flexWrap: "wrap" }}>
        <div style={{ ...TYPE.label, color: T.muted, width: 132, flexShrink: 0 }}>{title}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          {opts.length > 1 || (opts.length === 1 && !has && value) ? (
            <Select T={T} size="sm" full value={value ?? ""} disabled={disabled} onChange={(e) => onPick(e.target.value)}>
              {!has && value ? <option value={value}>(current choice)</option> : null}
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          ) : (
            <span style={{ fontSize: 12.5, color: value ? T.text : T.dim }}>{opts[0]?.label || (value ? "(current choice)" : "Nothing to show: the scene uses its general line")}</span>
          )}
        </div>
        {overridden && <Button T={T} size="sm" variant="subtle" onClick={onReset} disabled={disabled}>Use the rule's choice</Button>}
      </div>
      {children && <div style={{ marginTop: SP.sm, marginLeft: 140 }}>{children}</div>}
    </div>
  );
}

function MediaTile({ T, row, url, out, failedWhy, onToggle, disabled }) {
  const video = isVideo(row);
  const [hot, setHot] = useState(false);
  const blocked = !isSupportedMedia(row) ? "Type not supported" : video && Number(row.file_size) > ITEM_MAX ? "Over 50 MB" : failedWhy ? "Could not be loaded" : null;
  return (
    <button type="button" className="pmo-focusable" disabled={disabled} onClick={onToggle}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} aria-pressed={out}
      title={out ? "Left out of this presentation. Click to show it again." : blocked ? `${blocked}${failedWhy ? ` (${failedWhy})` : ""}` : "Shown in the presentation. Click to leave it out."}
      style={{ position: "relative", width: "100%", aspectRatio: "1/1", padding: 0, borderRadius: R.md, overflow: "hidden",
        cursor: disabled ? "default" : "pointer", background: "#05080F",
        border: `2px solid ${out ? T.warning : hot && !disabled ? T.borderStrong : T.border}`,
        opacity: out ? 0.4 : 1, transition: `opacity ${MOTION.fast}, border-color ${MOTION.fast}` }}>
      {video ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#C9D4E3" }}>
          <Film size={22} />
          <span style={{ fontSize: 10.5 }}>{mb(Number(row.file_size) || 0)}</span>
        </div>
      ) : url ? (
        <img src={url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7F8DA3" }}><ImageIcon size={18} /></div>
      )}
      {(out || blocked) && (
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "2px 4px", background: "rgba(5,8,15,.82)", color: "#fff", fontSize: 9.5, textAlign: "center" }}>
          {out ? "Left out" : blocked}
        </span>
      )}
    </button>
  );
}

// ── Shared with senior management (src/simShare.js) ──────────────────────────
// What a ticked guest receives (plan §A, decision 1): agreed by the PMO each time they share.
const RECEIVE_TEXT = "Each ticked guest receives this presentation exactly as I see it, including parts only the PMO sees in the portal "
  + "(past projects with their notes, the monthly reports list with drafts and the opened report's figures, the PMO Review count, "
  + "the time of the last Activity Log entry, other people's read markers), and the data file behind it while it is shared. "
  + "Contact details stay hidden. Stopping a share does not recall a copy a guest has already loaded or saved, and a download link "
  + "a guest made while it was shared keeps working until its files are removed (Stop sharing, Replace and expiry remove them).";
// The preview site and the live portal use one database; each keeps its own share (sim_shares.site).
const ON_PREVIEW = /\/preview\/$/.test(siteOf());
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const recipientLine = (r) => r.opened_at
  ? `First opened ${asOfText(r.opened_at)} · ${plural(r.counter || 1, "start")}${r.last_used_at ? ` · last ${asOfText(r.last_used_at)}` : ""}`
  : r.seen_at ? `Closed the sign-in notice ${asOfText(r.seen_at)} · not played yet` : "Not opened yet";
const SHARE_PHASE = {
  "waiting-media": "Waiting for the photos and videos to be ready…",
  reading: "Reading the portal data again…",
  sharing: "Sharing…",
  tidying: "Saving your choices…",
};
const PLAY_PHASE = {
  opening: "Opening the simulation tab…",
  checking: "Checking the shared copy…",
  sending: "Handing it to the simulation tab…",
  confirming: "Waiting for the simulation tab to confirm…",
};

function ShareBlock({ T, pmo, getSession, overrides, tests, leftOut, prefetch, plan, media, canStart, candidates, onApplySaved, onBusy, onReviewChanged }) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [st, setSt] = useState({ phase: "loading" });            // loading | error | ready { share, recipients, saved }
  const [engineOk, setEngineOk] = useState(false);
  const [mode, setMode] = useState(null);                         // null (a new share) | "replace" | "add"
  const [sel, setSel] = useState(() => new Set());
  const [voice, setVoice] = useState("on");
  const [agree, setAgree] = useState(false);
  const [run, setRun] = useState(null);                           // share progress | { result } | { error }
  const [play, setPlay] = useState(null);                         // the shared copy, played here
  const [confirmStop, setConfirmStop] = useState(false);
  const [acting, setActing] = useState(false);                    // add, remove or stop in progress
  const [served, setServed] = useState(null);                     // the build the site serves now (null: unknown)

  const refresh = useCallback(async () => {
    servedBuild().then((b) => { if (alive.current) setServed(b); });
    try {
      const v = await loadShareState({ getSession });
      // An expired share keeps its guests for Replace, but its files go (links made while it played stop working).
      if (v.share && v.cleanupReady && isExpired(v.share) && !v.share.files_removed_at
        && await tidyExpired({ share: v.share, getSession }).catch(() => false)) {
        v.share = { ...v.share, files_removed_at: new Date().toISOString() };
      }
      if (alive.current) setSt({ phase: "ready", ...v });
      // Ended copies whose files are still there (a removal that failed earlier): removed now, quietly.
      if (v.cleanupReady) tidyEnded({ getSession }).catch(() => {});
    } catch (e) { if (alive.current) setSt({ phase: "error", message: e?.message || "Could not read what is shared." }); }
  }, [getSession]);
  useEffect(() => {
    preloadShared().then(() => { if (alive.current) setEngineOk(true); }).catch(() => {});
    refresh();
  }, [refresh]);

  const sharing = !!run && !run.result && !run.error;
  const playing = !!play && !play.result && !play.error;
  useEffect(() => { onBusy?.(sharing); }, [sharing]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onBusy?.(false), []);           // eslint-disable-line react-hooks/exhaustive-deps

  const current = st.phase === "ready" ? st.share : null;
  const recipients = st.phase === "ready" ? st.recipients : [];
  const currentIds = new Set(recipients.map((r) => r.user_id));
  const expired = !!current && isExpired(current);
  const cleanupReady = st.phase === "ready" && st.cleanupReady === true;
  // This tab runs an older build than the site serves now (kept open across a deploy): reload first.
  const tabBuild = engineOk ? portalBuild() : null;
  const tabStale = !!served && !!tabBuild && tabBuild !== "dev" && served !== tabBuild;
  const bstate = current && engineOk ? (tabStale ? "stale-tab" : buildState(current)) : null;
  const ready = Array.isArray(candidates);                       // the launcher has read the portal
  const formOpen = ready && st.phase === "ready" && (!current || mode !== null);
  const adding = mode === "add";

  // Active guests only (test accounts ticked above are listed apart, unticked); adding lists only new ones.
  const guests = (candidates || []).filter((u) => u.role === "guest" && !(adding && currentIds.has(u.id)));
  const person = (u) => ({ id: u.id, name: u.full_name || u.username || "—", sub: u.username || null });
  const groups = [
    { key: "guests", label: "Senior management (guests)", people: guests.filter((u) => !tests?.has(u.id)).map(person) },
    { key: "tests", label: "Test accounts", note: "ticked as test accounts above", people: guests.filter((u) => tests?.has(u.id)).map(person) },
  ];
  const ticked = [...sel].filter((id) => guests.some((u) => u.id === id));

  const canShare = canStart && media.done && engineOk && agree && ticked.length > 0 && !sharing && !acting && cleanupReady && !tabStale;
  const canAdd = engineOk && !!current && !expired && ticked.length > 0 && !acting && !sharing;

  const openReplace = () => {
    onApplySaved?.(st.saved);
    if (st.saved) setVoice(st.saved.voice);
    setSel(new Set(recipients.map((r) => r.user_id)));
    setAgree(false); setRun(null); setConfirmStop(false); setMode("replace");
  };
  const openAdd = () => { setSel(new Set()); setRun(null); setConfirmStop(false); setMode("add"); };
  const cancel = () => { setMode(null); setSel(new Set()); setAgree(false); };

  const share = async () => {
    if (!canShare) return;
    setRun({ phase: "waiting-media" });
    try {
      const opts = { pmo, getSession, overrides, testAccounts: [...(tests || [])], leftOut: [...(leftOut || [])],
        prefetch: prefetch.current, approved: plan, recipients: ticked, voice,
        onProgress: (p) => { if (alive.current) setRun((r) => (r && (r.result || r.error) ? r : { ...p })); } };
      // Replacing keeps the share's guests unless the PMO unticks them; the old copy's files go.
      const result = current ? await replaceShare({ ...opts, current, currentRecipients: recipients })
        : await createShare({ ...opts, previous: null });
      if (!alive.current) return;
      setRun({ result }); setMode(null); setSel(new Set()); setAgree(false);
      refresh();
    } catch (e) {
      if (!alive.current) return;
      setRun({ error: e?.message || "The share failed." });
      if (e?.code === "review-changed") onReviewChanged?.();
      refresh();                                                  // what is shared now (also after a lost answer)
    }
  };
  const add = async () => {
    if (!canAdd) return;
    setActing(true); setRun(null);
    try {
      const n = await addRecipients({ shareId: current.id, userIds: ticked, getSession });
      if (alive.current) { setRun({ result: { added: n } }); setMode(null); setSel(new Set()); }
      await refresh();
    } catch (e) { if (alive.current) setRun({ error: e?.message || "Could not add the guests." }); }
    if (alive.current) setActing(false);
  };
  const remove = async (userId) => {
    setActing(true); setRun(null);
    try { await removeRecipient({ shareId: current.id, userId, getSession }); await refresh(); }
    catch (e) { if (alive.current) setRun({ error: e?.message || "Could not remove the guest." }); }
    if (alive.current) setActing(false);
  };
  const stop = async () => {
    if (!confirmStop) { setConfirmStop(true); return; }
    setActing(true); setRun(null); setConfirmStop(false);
    try {
      const r = await stopSharing({ share: current, getSession });
      if (alive.current) setRun({ result: { stopped: true, filesRemoved: r.filesRemoved } });
      await refresh();
    } catch (e) { if (alive.current) setRun({ error: e?.message || "Could not stop sharing." }); await refresh(); }
    if (alive.current) setActing(false);
  };
  // Synchronous on purpose: the new tab must open inside the click.
  const playCopy = () => {
    if (!current || !engineOk || playing) return;
    setPlay({ phase: "opening" });
    launchShared({ share: current, getSession,
      recheck: async () => (await loadShareState({ getSession })).share,
      onProgress: (p) => { if (alive.current) setPlay((x) => (x && (x.result || x.error) ? x : { ...p })); } })
      .then((result) => { if (alive.current) setPlay({ result }); },
        (e) => { if (alive.current) setPlay({ error: e?.message || "The shared copy could not be played." }); });
  };

  const ok = (t) => <span style={{ color: T.textOf(T.positive) }}><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t}</span>;
  const warn = (t, tone = T.warning) => <span style={{ color: T.textOf(tone) }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t}</span>;
  const runLine = () => {
    if (!run) return null;
    if (run.error) return warn(run.error, T.danger);
    const r = run.result;
    if (r?.stopped) {
      return r.filesRemoved ? ok("Stopped sharing. Guests no longer see it. Its files were removed.")
        : warn("Stopped sharing. Guests no longer see it, but its files could not be removed yet; this window tries again each time it opens. "
          + "Until then, a download link a guest made while it was shared keeps working.");
    }
    if (r?.added != null) return ok(`Added ${plural(r.added, "guest")}. They see the Simulation button at their next sign-in on a computer.`);
    if (r) {
      return ok(`Shared with ${plural(r.recipients, "guest")} · code ${r.code} · plays until ${dayText(r.expiresAt)}. `
        + "They see a Simulation button at their next sign-in on a computer."
        + (r.previousRemoved === false ? " The previous copy's files could not be removed yet; this window tries again each time it opens." : ""));
    }
    if (run.phase === "uploading") {
      return <span style={{ color: T.textSoft }}>Uploading {run.done} of {run.total} files · {mb(run.bytes || 0)} of {mb(run.totalBytes || 0)}. Keep this window open.</span>;
    }
    return <span style={{ color: T.textSoft }}>{SHARE_PHASE[run.phase] || "Sharing…"}</span>;
  };
  const playLine = () => {
    if (!play) return null;
    if (play.error) return warn(play.error, T.danger);
    if (play.result) return play.result.confirmed ? ok("The shared copy is in its own tab, exactly as a guest gets it.") : warn(play.result.error || "The simulation tab did not confirm.");
    if (play.phase === "downloading") return <span style={{ color: T.textSoft }}>Downloading the shared copy: {play.media?.done || 0} of {play.media?.total || 0} photos and videos · {mb(play.media?.bytes || 0)}…</span>;
    return <span style={{ color: T.textSoft }}>{PLAY_PHASE[play.phase] || "Preparing…"}</span>;
  };

  const head = current ? (
    <>
      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
        Portal data as of <b>{asOfText(current.as_at)}</b> · shared {asOfText(current.activated_at || current.created_at)} ·{" "}
        {expired ? <b style={{ color: T.textOf(T.warning) }}>expired {dayText(current.expires_at)}</b> : <>plays until <b>{dayText(current.expires_at)}</b></>}
        {" "}· code <b style={{ letterSpacing: 1 }}>{current.code}</b> · {plural(current.media_count + 1, "file")}, {mb(current.media_bytes + current.json_bytes)}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 8px" }}>
        {expired ? warn(`Expired: guests no longer see it${current.files_removed_at ? ", and its files have been removed" : ""}. Replace it with today's data to share it again.`)
          : bstate === "stale-tab" ? warn("The portal was updated after this tab was opened: reload this tab to check, play or share this copy.")
          : bstate === "ok" ? ok("Plays on this version of the portal.")
            : bstate === "reload" ? warn("This copy was made on a newer version of the portal: reload this tab.")
              : bstate === "updating" ? warn("Re-share after the portal update: this copy was made on an earlier version of this site and no longer plays. Replace with today's data loads your saved choices.")
                : <span style={{ color: T.muted }}>Checking the version…</span>}
      </div>
      {!recipients.length ? <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8 }}>No guest receives it at the moment.</div> : (
        <div style={{ marginBottom: 8 }}>
          {recipients.map((r) => (
            <div key={r.user_id} style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: "5px 0", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: T.text, minWidth: 160 }}>{r.name}</span>
              <span style={{ ...TYPE.caption, color: T.dim, flex: 1 }}>
                {r.username || ""}{r.role !== "guest" || !r.is_active ? " · no longer an active guest: cannot open it" : ""} · {recipientLine(r)}
              </span>
              <Button T={T} size="sm" variant="subtle" disabled={acting || sharing} onClick={() => remove(r.user_id)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      {!formOpen && (
        <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", marginBottom: SP.sm }}>
          <Button T={T} size="sm" variant="ghost" icon={UserPlus} onClick={openAdd} disabled={!ready || acting || sharing || expired}>Add guests</Button>
          <Button T={T} size="sm" variant="ghost" icon={PlayCircle} onClick={playCopy} disabled={!engineOk || playing || expired || bstate !== "ok"}
            title="Plays the stored copy in a new tab, exactly as a guest gets it">Play the shared copy</Button>
          <Button T={T} size="sm" variant="ghost" icon={RefreshCw} onClick={openReplace} disabled={!ready || acting || sharing}>Replace with today's data</Button>
          <Button T={T} size="sm" variant={confirmStop ? "danger" : "ghost"} icon={Ban} onClick={stop} disabled={acting || sharing}>
            {confirmStop ? "Press again to stop sharing" : "Stop sharing"}</Button>
        </div>
      )}
      {playLine() && <div style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: SP.sm }}>{playLine()}</div>}
    </>
  ) : null;

  const form = formOpen ? (
    <div style={{ borderTop: current ? `1px solid ${T.border}` : "none", paddingTop: current ? SP.md : 0 }}>
      <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6 }}>
        {adding ? "Add guests to this share (the same data)" : mode === "replace" ? "Replace with today's data" : "Share this simulation"}
      </div>
      {!adding && (
        <Note T={T}>
          Ticked guests get a Simulation button when they sign in on a laptop or desktop computer (a screen of at least 1280 × 720 and a
          mouse), and a one-time pop-up; phones get a short notice instead. One click opens it in a new tab and it starts by itself.
          Nothing is emailed or pushed.
          {ON_PREVIEW ? " This is the preview site: its share is separate from the live portal's, and neither replaces the other." : ""}
          {mode === "replace" ? " Your saved choices are loaded above: check them, then share." : ""}
        </Note>
      )}
      <PeoplePicker T={T} groups={groups} selected={sel} onChange={setSel} disabled={sharing || acting} maxHeight={220}
        placeholder="Search guests…" empty={adding ? "Every active guest receives it already." : "No active guest account."} />
      {!adding && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: SP.lg, flexWrap: "wrap", margin: `${SP.sm}px 0` }}>
            <span style={{ ...TYPE.label, color: T.muted }}>Voice for guests</span>
            {[["on", "Voice on"], ["off", "Captions only"]].map(([v, label]) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.text, cursor: sharing ? "default" : "pointer" }}>
                <input type="radio" name="pmo-sim-share-voice" checked={voice === v} disabled={sharing} onChange={() => setVoice(v)} />{label}
              </label>
            ))}
          </div>
          <Note T={T}>
            Plays for {SHARE_DAYS} days, until about {dayText(Date.now() + SHARE_DAYS * 86400000)}, or until you replace it or stop sharing.
            It stops playing after a portal update; your choices are kept, so sharing it again is one click.
          </Note>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: T.text, lineHeight: 1.55, cursor: sharing ? "default" : "pointer", margin: `${SP.sm}px 0` }}>
            <input type="checkbox" checked={agree} disabled={sharing} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{RECEIVE_TEXT}</span>
          </label>
          {!cleanupReady && (
            <Note T={T} tone={T.warning}>
              Sharing is off: the database cannot remove shared files yet (the sim_shares migration's removal policy is missing).
              Without it, Stop sharing, Replace and expiry could not remove a copy's files, and a download link a guest made while
              it was shared would keep working.
            </Note>
          )}
          {tabStale && <Note T={T} tone={T.warning}>The portal was updated after this tab was opened. Reload this tab, then share.</Note>}
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flexWrap: "wrap", marginTop: SP.sm }}>
        {current && <Button T={T} size="sm" variant="ghost" onClick={cancel} disabled={sharing || acting}>Cancel</Button>}
        {adding ? (
          <Button T={T} size="sm" variant="primary" icon={UserPlus} onClick={add} disabled={!canAdd} loading={acting}>
            {`Add ${plural(ticked.length, "guest")}`}</Button>
        ) : (
          <Button T={T} size="sm" variant="primary" icon={Share2} onClick={share} disabled={!canShare} loading={sharing}
            title="Reads the data once more, stores this simulation and shares it">{`Share with ${plural(ticked.length, "guest")}`}</Button>
        )}
        {!adding && !sharing && !media.done && <span style={{ ...TYPE.caption, color: T.muted }}>Waiting for the photos and videos to be ready…</span>}
        {!adding && !sharing && media.done && !agree && ticked.length > 0 && cleanupReady && !tabStale && <span style={{ ...TYPE.caption, color: T.muted }}>Tick the box above to agree first.</span>}
      </div>
    </div>
  ) : null;

  return (
    <Block T={T} icon={Share2} title="Shared with senior management"
      right={<span style={{ ...TYPE.caption, color: T.muted }}>
        {st.phase === "ready" ? (current ? `${plural(recipients.length, "guest")}${expired ? " · expired" : ""}` : "Not shared") : ""}
      </span>}>
      {st.phase === "loading" && <Note T={T}>Checking what is shared…</Note>}
      {st.phase === "error" && (
        <div style={{ marginBottom: SP.sm }}>
          <Note T={T} tone={T.danger}>{st.message}</Note>
          <Button T={T} size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>Try again</Button>
        </div>
      )}
      {st.phase === "ready" && !current && (
        <Note T={T}>Nothing is shared at the moment.{ready ? ` You can share this simulation, as it would start now, with chosen guests for ${SHARE_DAYS} days.` : ""}</Note>
      )}
      {head}
      {form}
      {runLine() && <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: SP.sm }}>{runLine()}</div>}
    </Block>
  );
}

// The App passes getSession (its current session, null after sign-out) and session (the object at
// render time). getSession wins wherever both are given, so nothing here keeps a stale session.
const sessionOf = (props) => (typeof props.getSession === "function" ? props.getSession() : null) ?? props.session ?? null;

export function SimLauncher(props) {
  // PMO only: the button is PMO-only too, but the window checks again.
  if (sessionOf(props)?.role !== "pmo") return null;
  return <Launcher {...props} />;
}

function Launcher({ T, session: sessionProp, getSession, onClose }) {
  const session = sessionOf({ session: sessionProp, getSession });
  const uid = session?.user_id ?? null, uname = session?.username ?? null, fname = session?.full_name ?? null;
  // Keyed on the person, not the session object: a token renewal must not re-read the data.
  const pmo = useMemo(() => ({ id: uid, username: uname, full_name: fname }), [uid, uname, fname]);
  const get = useMemo(() => makeGet(), []);
  const [pv, setPv] = useState({ phase: "loading" });               // loading | error | ready
  const [view, setView] = useState(null);                            // { plan, candidates, tables, typedTexts }
  const [overrides, setOverrides] = useState({});
  const [leftOut, setLeftOut] = useState(() => new Set());
  const [tests, setTests] = useState(null);                          // Set of confirmed test-account ids
  const [media, setMedia] = useState({ ready: 0, failed: 0, total: 0, bytes: 0, done: false });
  const [run, setRun] = useState(null);                              // progress | { result } | { error }
  const [showLines, setShowLines] = useState(false);
  const [sharing, setSharing] = useState(false);                     // a share is being stored (ShareBlock)
  const prefetch = useRef(null);
  const urls = useRef(new Map());                                    // attachment id → object URL (thumbnails)
  const [, setThumbTick] = useState(0);
  const alive = useRef(true);

  // Mount and unmount only: a token renewal hands the App a new session object, and that must not
  // cancel the media prefetch or drop the thumbnails while the window is open.
  useEffect(() => {
    alive.current = true;
    for (const k of OLD_KEYS) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    return () => {
      alive.current = false;
      try { prefetch.current?.cancel(); } catch { /* ignore */ }
      prefetch.current = null;
      for (const u of urls.current.values()) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
      urls.current.clear();
    };
  }, []);
  // The function itself is the fallback, so it reads null once the App has signed out.
  useEffect(() => { setSessionFallback(typeof getSession === "function" ? getSession : sessionProp); }, [getSession, sessionProp]);

  // Remember me keeps the PMO's session in localStorage, which every tab of this site can read. The
  // simulation never uses it, but the safest presenting laptop does not have it there at all.
  const rememberOn = useMemo(() => { try { return !!localStorage.getItem("pmo_session"); } catch { return false; } }, []);

  // ── the preview read (GET only) and the media prefetch ──
  const load = useCallback(async () => {
    setPv((p) => (p.phase === "ready" ? { ...p, reloading: true } : { phase: "loading" }));
    try {
      const preview = await readSnapshot({ get, pmo, build: portalBuild(), preview: true });
      if (!alive.current) return;
      setTests((cur) => {
        const ids = new Set(preview.testAccountCandidates.map((c) => c.id));
        if (!cur) return new Set(preview.testAccountsDetected);
        return new Set([...cur].filter((id) => ids.has(id)));
      });
      setLeftOut((cur) => new Set([...cur].filter((id) => preview.siteVisitRows.some((r) => r.id === id))));
      const rows = preview.siteVisitRows;
      if (!prefetch.current) {
        prefetch.current = startPrefetch(rows, {
          first: galleryFirstIds(rows, preview.tables, preview.plan),
          onProgress: (s) => { if (alive.current) setMedia(s); },
        });
      } else prefetch.current.add(rows);
      setPv({ phase: "ready", preview });
    } catch (e) {
      if (alive.current) setPv({ phase: "error", message: e?.message || "Could not read the portal data" });
    }
  }, [get, pmo]);
  useEffect(() => { load(); }, [load]);

  // ── the plan, recomputed in memory whenever a choice changes ──
  const preview = pv.preview || null;
  const seq = useRef(0);
  const [planBusy, setPlanBusy] = useState(true);
  useEffect(() => {
    if (!preview || !tests) return;
    const n = ++seq.current;
    setPlanBusy(true);
    previewPlan(preview, { overrides, testAccounts: [...tests], leftOut: [...leftOut], get })
      .then((v) => { if (alive.current && n === seq.current) { setView(v); setPlanBusy(false); } })
      .catch((e) => { if (alive.current && n === seq.current) { setView({ error: e?.message || "The plan could not be worked out" }); setPlanBusy(false); } });
  }, [preview, overrides, leftOut, tests, get]);

  // Thumbnails from the prepared (re-encoded) pictures; nothing is signed for display.
  useEffect(() => {
    const p = prefetch.current;
    if (!p) return;
    let added = 0;
    for (const [id, item] of p.ready) {
      const b = item?.thumb || item?.blob;
      if (urls.current.has(id) || !b || !String(item.mime).startsWith("image/")) continue;
      urls.current.set(id, URL.createObjectURL(b));
      added += 1;
    }
    if (added) setThumbTick((x) => x + 1);
  }, [media]);

  const plan = view?.plan || null;
  const tables = view?.tables || null;
  const narration = useMemo(() => {
    if (!plan || !tables) return null;
    try { return buildNarration({ tables, plan, overrides }, { wpm: 135 }); } catch { return null; }
  }, [plan, tables, overrides]);

  const running = !!run && !run.result && !run.error;
  const busy = running || sharing;
  const setChoice = (key, id) => setOverrides((o) => ({ ...o, [key]: id }));
  const resetChoice = (key) => setOverrides((o) => { const n = { ...o }; delete n[key]; return n; });
  const setSay = (userId, text) => setOverrides((o) => {
    const say = { ...(o.say || {}) };
    const t = cleanText(text);
    if (t) say[userId] = t; else delete say[userId];
    const n = { ...o, say };
    if (!Object.keys(say).length) delete n.say;
    return n;
  });
  const [aliasInput, setAliasInput] = useState("");
  const [sayInput, setSayInput] = useState({});
  useEffect(() => {
    const t = cleanText(aliasInput);
    setOverrides((o) => {
      if ((o.storyAlias ?? "") === t) return o;
      const n = { ...o };
      if (t) n.storyAlias = t; else delete n.storyAlias;
      return n;
    });
  }, [aliasInput]);
  // A typed name belongs to the project it was typed for.
  const storyId = view?.plan?.story?.id ?? null;
  useEffect(() => { setAliasInput(""); }, [storyId]);
  // "Replace with today's data" loads the choices saved with the last share (settings.simulation_share).
  // The typed story name comes back once the plan for those choices is worked out (the line above
  // clears it when the story changes).
  const restoreAlias = useRef(null);
  useEffect(() => {
    if (!restoreAlias.current || !view?.plan) return;
    const a = restoreAlias.current;
    restoreAlias.current = null;
    setAliasInput(a);
  }, [view]);
  const applySaved = (saved) => {
    if (!saved) return;
    const o = saved.overrides && typeof saved.overrides === "object" ? { ...saved.overrides } : {};
    setOverrides(o);
    setTests(new Set(saved.testAccounts || []));
    setLeftOut(new Set(saved.leftOut || []));
    setSayInput(o.say && typeof o.say === "object" ? { ...o.say } : {});
    const alias = typeof o.storyAlias === "string" ? o.storyAlias : "";
    restoreAlias.current = alias;
    setAliasInput(alias);
  };
  const sessionFn = useCallback(() => sessionOf({ session: sessionProp, getSession }), [sessionProp, getSession]);
  const toggleOut = (id) => setLeftOut((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTest = (id) => setTests((s) => { const n = new Set(s || []); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Synchronous on purpose: the new tab must open inside the click, before anything is awaited.
  // Start waits for the plan of the latest choices: that plan is what the PMO approves.
  const canStart = pv.phase === "ready" && !pv.reloading && !planBusy && !!plan && !view?.error && !busy;
  const start = () => {
    if (!canStart) return;
    setRun({ phase: "opening" });
    let p;
    try {
      p = launch({ pmo, build: portalBuild(), overrides, testAccounts: [...(tests || [])], leftOut: [...leftOut],
        prefetch: prefetch.current, approved: plan,
        onProgress: (x) => { if (alive.current) setRun((r) => (r && (r.result || r.error) ? r : { ...x })); } });
    } catch (e) { setRun({ error: e?.message || "Could not open the simulation" }); return; }
    p.then((result) => { if (alive.current) setRun({ result }); },
      (e) => {
        if (!alive.current) return;
        setRun({ error: e?.message || "The hand-over failed", code: e?.code });
        if (e?.code === "review-changed") load();
      });
  };

  // ── what the PMO approves ──
  const byId = (rows, id) => (rows || []).find((r) => r.id === id) || null;
  const storyRow = plan?.story ? byId(tables?.projects, plan.story.id) : null;
  const thread = plan?.updates?.projectId
    ? (tables?.comments || []).filter((c) => c.project_id === plan.updates.projectId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    : [];
  const pastRow = plan?.past?.id ? byId(tables?.past_project_summary, plan.past.id) : null;
  const pastThread = plan?.past?.id
    ? (tables?.past_project_updates || []).filter((m) => m.past_project_id === plan.past.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    : [];
  const riskRow = plan?.risks?.rowId ? byId(tables?.project_risks_scored, plan.risks.rowId) : null;
  const userRow = plan?.users?.row || null;
  const updatesProject = plan?.updates?.projectId ? byId(tables?.projects, plan.updates.projectId) : null;
  const rows = preview?.siteVisitRows || [];
  const shownCount = rows.length - [...leftOut].filter((id) => rows.some((r) => r.id === id)).length;
  const typed = view?.typedTexts || plan?.flags?.typedTexts || [];
  const rejected = plan?.flags?.overrideRejected || [];
  const candidates = view?.candidates || {};

  const progressLine = () => {
    if (!run) return null;
    if (run.error) return <span style={{ color: T.textOf(T.danger) }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{run.error}</span>;
    if (run.result) {
      const r = run.result;
      return (
        <span style={{ color: r.confirmed ? T.textOf(T.positive) : T.textOf(T.warning) }}>
          {r.confirmed ? <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> : <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />}
          {r.confirmed
            ? <>Ready. Snapshot <b style={{ letterSpacing: 1 }}>{r.code}</b>. Switch to the simulation tab.</>
            : <>Sent snapshot <b style={{ letterSpacing: 1 }}>{r.code}</b>, but the simulation tab did not confirm it. If it shows a problem, close it and press Start again.</>}
          {r.failed > 0 && <span style={{ color: T.muted }}> {r.failed} photo{r.failed === 1 ? "" : "s"} or video{r.failed === 1 ? "" : "s"} could not be loaded and {r.failed === 1 ? "is" : "are"} not shown.</span>}
        </span>
      );
    }
    const m = run.media || media;
    const msg = run.phase === "opening" ? "Opening the simulation tab…"
      : run.phase === "media" || run.phase === "waiting-media" ? `Photos and videos: ${m.ready || 0} of ${m.total || 0} ready · ${mb(m.bytes || 0)}. The simulation tab waits for them…`
      : run.phase === "reading" ? "Reading the portal data again…"
      : run.phase === "checking" ? "Checking the snapshot…"
      : run.phase === "sending" ? "Sending to the simulation tab…"
      : "Waiting for the simulation tab to confirm…";
    return <span style={{ color: T.textSoft }}>{msg}</span>;
  };

  const choiceBody = (c) => {
    if (c.list === "story" && plan?.story) {
      return (
        <>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.55 }}>
            {storyRow ? `${storyRow.code || "—"} · ${storyRow.name}` : plan.story.code} · {plan.story.campus || "—"}
            {plan.story.kind === "closed" ? " · a finished project" : ""}
          </div>
          <TextBox T={T} id="pmo-sim-alias" label="Called in the narration" value={aliasInput} placeholder={plan.story.alias || ""} disabled={busy}
            onChange={setAliasInput} hint="A short name that shares a word with the project's name on screen. Kept in this window only." />
        </>
      );
    }
    if (c.list === "updates") {
      if (!thread.length) return null;
      return (
        <>
          <div style={{ ...TYPE.caption, color: T.muted, marginBottom: 6 }}>{updatesProject ? `${updatesProject.code || "—"} · ${updatesProject.name}` : ""} · {thread.length} message{thread.length === 1 ? "" : "s"}, as they will be shown:</div>
          {thread.map((m) => <Message key={m.id} T={T} who={m.author_name} role={m.author_role} when={whenPKT(m.created_at)} body={m.body} lit={m.id === plan?.updates?.lastCommentId} />)}
        </>
      );
    }
    if (c.list === "past" && pastRow) {
      return (
        <>
          <div style={{ ...TYPE.caption, color: T.muted, marginBottom: 6 }}>{pastRow.code || "—"} · {pastRow.name} · {pastThread.length} message{pastThread.length === 1 ? "" : "s"}, as they will be shown:</div>
          {pastThread.map((m) => <Message key={m.id} T={T} who={m.author_name} role={m.author_role} when={whenPKT(m.created_at)} body={m.body} lit={m.id === plan?.past?.lastMessageId} />)}
        </>
      );
    }
    if (c.list === "report" && plan?.report?.kicker) return <div style={{ fontSize: 12.5, color: T.textSoft }}>{plan.report.kicker}</div>;
    if (c.list === "riskRow" && riskRow) {
      return (
        <Message T={T} who={`${riskRow.project_code || "—"} · ${riskRow.project_name || ""}`} when={[riskRow.probability && `${riskRow.probability} probability`, riskRow.impact && `${riskRow.impact} impact`, riskRow.status].filter(Boolean).join(" · ")}
          body={`${riskRow.title || ""}${riskRow.owner ? `\nOwner: ${riskRow.owner}` : ""}`} lit />
      );
    }
    if (c.list === "usersRow" && userRow) {
      return (
        <>
          <div style={{ fontSize: 12.5, color: T.textSoft }}>{userRow.fullName || "—"} ({userRow.username}) · {userRow.assigned} project{userRow.assigned === 1 ? "" : "s"} assigned</div>
          <TextBox T={T} id="pmo-sim-say" label={`How the voice says ${userRow.fullName ? userRow.fullName.split(" ")[0] : "the name"}`}
            value={sayInput[userRow.userId] ?? ""} placeholder={userRow.fullName || ""} disabled={busy}
            onChange={(v) => { setSayInput((s) => ({ ...s, [userRow.userId]: v })); setSay(userRow.userId, v); }}
            hint="Spell it the way it sounds. The caption keeps the name as the portal shows it. Kept in this window only." />
        </>
      );
    }
    if (c.list === "gallery" && plan?.gallery) {
      const g = plan.gallery;
      return <div style={{ fontSize: 12.5, color: T.textSoft }}>{[g.alias, g.campus, g.filteredCount != null ? `${g.filteredCount} item${g.filteredCount === 1 ? "" : "s"} after the campus filter` : null].filter(Boolean).join(" · ")}</div>;
    }
    return null;
  };

  // The sharing block keeps its place in every phase (a failed read must not hide Stop sharing).
  const top = pv.phase === "loading" ? (
    <div style={{ color: T.muted, fontSize: 13, padding: SP.lg }}>Reading the portal data…</div>
  ) : pv.phase === "error" ? (
    <div style={{ padding: SP.lg }}>
      <div style={{ color: T.textOf(T.danger), fontSize: 13, marginBottom: SP.md }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{pv.message}</div>
      <Button T={T} size="sm" icon={RefreshCw} onClick={load}>Try again</Button>
    </div>
  ) : (
    <>
      <Block T={T} icon={ListChecks} title="What the simulation will show"
        right={<>
          <span style={{ ...TYPE.caption, color: T.muted }}>Live portal data · read {hhmmPKT(preview.takenAt)} PKT</span>
          <Button T={T} size="sm" variant="ghost" icon={RefreshCw} onClick={load} disabled={busy || pv.reloading} loading={pv.reloading}>Read again</Button>
        </>}>
        <Note T={T}>Each scene's subject is chosen by a rule from the data. Change it here if you prefer another one the rule allows; the choice lasts for this window only. Start Simulation reads the data once more, so the figures are as of that moment.</Note>
        {view?.error && <Note T={T} tone={T.danger}>{view.error}</Note>}
        {rejected.length > 0 && <Note T={T} tone={T.warning}>Not applied (the rule does not allow it): {rejected.join(", ")}.</Note>}
        {plan && CHOICES.map((c) => (
          <ChoiceRow key={c.key} T={T} title={c.title} options={candidates[c.list]} value={c.current(plan) ?? null} disabled={busy}
            overridden={overrides[c.key] !== undefined} onPick={(id) => setChoice(c.key, id)} onReset={() => resetChoice(c.key)}>
            {choiceBody(c)}
          </ChoiceRow>
        ))}
      </Block>

      <Block T={T} icon={Users} title="Test accounts"
        right={<span style={{ ...TYPE.caption, color: T.muted }}>{tests?.size || 0} ticked</span>}>
        <Note T={T}>User Management shows every account. Ticked accounts are described as being for testing ("some for testing"), and their rows are never lit. Every active account except the PMO's is listed; the ones that look like test accounts (no projects, and a test-looking address or name) are ticked already and listed first. A test login that holds projects can be ticked too.</Note>
        {!preview.testAccountCandidates.length ? (
          <div style={{ fontSize: 12.5, color: T.dim }}>No other active account.</div>
        ) : <div style={{ maxHeight: 188, overflowY: "auto", paddingRight: 4 }}>{[...preview.testAccountCandidates]
          .sort((x, y) => (y.detected ? 1 : 0) - (x.detected ? 1 : 0)).map((u) => (
          <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5, color: T.text, cursor: busy ? "default" : "pointer" }}>
            <input type="checkbox" checked={!!tests?.has(u.id)} disabled={busy} onChange={() => toggleTest(u.id)} />
            <span>{u.full_name || u.username || "—"}</span>
            <span style={{ ...TYPE.caption, color: T.dim }}>{u.username}{u.role ? ` · ${ROLE[u.role] || u.role}` : ""}{u.detected ? " · looks like a test account" : ""}</span>
          </label>
        ))}</div>}
      </Block>

      <Block T={T} icon={ImageIcon} title="Photos and videos"
        right={<span style={{ ...TYPE.caption, color: T.muted }}>
          {media.ready} of {media.total} ready · {mb(media.bytes)}{media.failed ? ` · ${media.failed} could not be loaded` : ""}{leftOut.size ? ` · ${leftOut.size} left out` : ""}
        </span>}>
        <Note T={T}>Every site-visit photo and video in the portal appears in the Gallery, on its own project ({shownCount} of {rows.length}). Click an item to leave it out of this presentation only; the Begin screen then says how many were left out. Pictures are re-encoded here first, which removes location and camera details; videos are sent as they are and play muted. Nothing is saved.</Note>
        {!rows.length ? (
          <div style={{ fontSize: 12.5, color: T.dim }}>No site-visit photos or videos in the portal.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
            {rows.map((r) => (
              <MediaTile key={r.id} T={T} row={r} url={urls.current.get(r.id)} out={leftOut.has(r.id)} disabled={busy}
                failedWhy={prefetch.current?.failed.get(r.id) || null} onToggle={() => !busy && toggleOut(r.id)} />
            ))}
          </div>
        )}
      </Block>
    </>
  );
  const shareBlock = (
    <ShareBlock T={T} pmo={pmo} getSession={sessionFn} overrides={overrides} tests={tests} leftOut={leftOut} prefetch={prefetch}
      plan={plan} media={media} canStart={canStart} candidates={pv.phase === "ready" ? preview.testAccountCandidates : null}
      onApplySaved={applySaved} onBusy={setSharing} onReviewChanged={load} />
  );
  const bottom = pv.phase !== "ready" ? null : (
    <>
      {(typed.length > 0) && (
        <Block T={T} icon={FileText} title="Dashboard texts typed by hand">
          <Note T={T}>These card texts are typed, not computed, and will be on screen as they are. Check they are still right.</Note>
          {typed.map((t, i) => (
            <div key={`${t.key}-${t.field}-${i}`} style={{ fontSize: 12.5, color: T.text, padding: "3px 0" }}>
              <span style={{ ...TYPE.caption, color: T.muted }}>{t.key} · {t.field}: </span>“{t.text}”
            </div>
          ))}
        </Block>
      )}

      <Block T={T} icon={MessageSquare} title="What the assistant will say"
        right={<Button T={T} size="sm" variant="ghost" onClick={() => setShowLines((x) => !x)}>{showLines ? "Hide" : "Show"}</Button>}>
        {!narration ? (
          <Note T={T}>The lines are generated in the simulation tab from the same data and shown on its Begin screen.</Note>
        ) : (
          <>
            <Note T={T}>
              {narration.totals?.words ?? "—"} words · about {fmtClock(narration.totals?.at135)} at 135 words a minute, {fmtClock(narration.totals?.at150)} at 150 · limit 2:30.
              {" "}The simulation tab rehearses every scene before Start and may switch a line to a shorter or general one.
            </Note>
            {(narration.notes || []).map((n, i) => <Note key={i} T={T} tone={T.warning}>{n}</Note>)}
            {showLines && (narration.lines || []).filter((l) => !l.skip).map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ ...TYPE.caption, color: T.dim, width: 34, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{l.scene}</span>
                <span style={{ color: T.text }}>{l.candidates?.[l.use ?? 0]?.caption ?? l.caption}</span>
              </div>
            ))}
          </>
        )}
      </Block>
    </>
  );
  const body = <>{top}{shareBlock}{bottom}</>;

  const footer = (
    <div style={{ display: "flex", alignItems: "center", gap: SP.md, width: "100%", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260, fontSize: 12.5, lineHeight: 1.55 }}>
        {progressLine() || (
          <span style={{ color: T.muted }}>
            The simulation opens in a new tab and reads only. Keep this tab open while presenting: it answers Refresh data. Before presenting, turn on Do Not Disturb (Focus assist on Windows) so portal notifications do not appear on screen.
            {rememberOn && <span style={{ color: T.textOf(T.warning) }}> Remember me is on in this browser: for the presentation, sign out and sign in again with Remember me off.</span>}
          </span>
        )}
      </div>
      <Button T={T} variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
      <Button T={T} variant="primary" icon={MonitorPlay} onClick={start} disabled={!canStart} loading={running}
        title="Open the simulation in a new tab">Start Simulation</Button>
    </div>
  );

  return createPortal(
    <Modal T={T} title="Simulation" icon={MonitorPlay} width={880} onClose={busy ? undefined : onClose}
      sub="Present the portal on its live data, read-only. Nothing is changed or sent."
      footer={footer}>
      {body}
    </Modal>,
    document.body,
  );
}
