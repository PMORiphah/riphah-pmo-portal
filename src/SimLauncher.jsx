import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay, Film, AlertTriangle, CheckCircle2, Users, Image as ImageIcon } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND } from "./theme.js";
import { Modal, Button } from "./ui.jsx";
import { storageUrl } from "./storageUrl.js";
import { launch, isSupportedMedia, mediaMimeOf, ITEM_MAX, TOTAL_MAX, COUNT_MAX } from "./simBridge.js";

/* ═══════════════════════════════════════════════════════════════════════════
   SIMULATION LAUNCHER (PMO only, desktop)

   Opened from the sidebar's Simulation button. Before the presentation tab
   opens, the PMO checks two things here:
   1. Names. The simulation's fictional data has numbered slots for campuses,
      project managers and the PMO team. Each slot is pinned to a production
      id (src/sim/data/pins.json, ids only); this window reads the current name
      of each pinned row under the PMO's own session and shows it.
   2. Photos and videos. The site-visit media on the pinned host projects, as
      thumbnails. The PMO ticks what may appear; the ticks are kept in this
      browser only (localStorage), never in the database.
   Start Simulation hands both to the new tab (src/simBridge.js). Nothing here
   writes to the database.
   ═══════════════════════════════════════════════════════════════════════════ */

// The simulation's data modules may not be part of a build; the window then says so instead of
// failing. cast.js holds the pins (ids only) and builds the cast; tokens.js the name helpers.
const DATA_MODULES = import.meta.glob(["./sim/data/cast.js", "./sim/data/tokens.js"]);
const loadCastModule = DATA_MODULES["./sim/data/cast.js"] && DATA_MODULES["./sim/data/tokens.js"]
  ? () => Promise.all([DATA_MODULES["./sim/data/cast.js"](), DATA_MODULES["./sim/data/tokens.js"]()])
    .then(([cast, tokens]) => ({ PINS: cast.PINS, buildCast: cast.buildCast, castCode: cast.castCode,
      deriveShort: tokens.deriveShort, deriveSay: tokens.deriveSay, TEAM_KEYS: tokens.TEAM_KEYS }))
  : null;

const TICKS_KEY = "pmo-sim-media-ticks";
const SAY_KEY = "pmo-sim-say";
const MEMBER_TITLE = { head_pmo: "Head PMO", manager_pmo: "Manager PMO", deputy_pmo: "Deputy Manager PMO", exec_pmo: "Executive PMO", po1: "Projects Officer", po2: "Projects Officer" };

const readLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: the choice lasts for this window only */ } };
const encodeStoragePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");
const mb = (n) => `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
const inList = (ids) => ids.map((id) => encodeURIComponent(id)).join(",");
// What the simulation accepts as a name (src/sim/handoff.js): no "<", control characters,
// zero-width or bidi marks, at most 80 characters. Tested by code point, not a regex of escapes.
const badChar = (c) => c === 0x3c || c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f)
  || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
const cleanSay = (s) => [...String(s || "")].filter((ch) => !badChar(ch.codePointAt(0))).join("").replace(/\s+/g, " ").trim().slice(0, 80);

function readTicks() {
  const raw = readLS(TICKS_KEY);
  if (raw == null) return null;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? new Set(a.filter((x) => typeof x === "string")) : null; } catch { return null; }
}

function Block({ T, icon: Icon, title, right, children }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.surface, padding: SP.lg, marginBottom: SP.lg }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm, marginBottom: SP.md }}>
        <Icon size={15} color={T.textOf(BRAND.blue)} />
        <div style={{ ...TYPE.h3, color: T.text, flex: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Flag = ({ T, tone, children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: R.pill, marginLeft: 6,
    background: `${tone}22`, color: T.textOf(tone), whiteSpace: "nowrap" }}>{children}</span>
);

function Slot({ T, label, name, flag, flagTone, note }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}`, minWidth: 0 }}>
      {label && <span style={{ ...TYPE.caption, color: T.dim, width: 34, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{label}</span>}
      <span style={{ fontSize: 12.5, color: name ? T.text : T.dim, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name || "—"}{note && <span style={{ color: T.muted }}> · {note}</span>}
      </span>
      {flag && <Flag T={T} tone={flagTone}>{flag}</Flag>}
    </div>
  );
}

function MediaTile({ T, row, url, ticked, blockedWhy, onToggle }) {
  const video = mediaMimeOf(row).startsWith("video/");
  const [hot, setHot] = useState(false);
  return (
    <button type="button" className="pmo-focusable" disabled={!!blockedWhy} onClick={onToggle}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      aria-pressed={ticked} title={blockedWhy || (ticked ? "Ticked: will appear in the simulation" : "Not ticked: stays out")}
      style={{ position: "relative", width: "100%", aspectRatio: "1/1", padding: 0, borderRadius: R.md, overflow: "hidden",
        cursor: blockedWhy ? "not-allowed" : "pointer", background: "#05080F",
        border: `2px solid ${ticked ? BRAND.gold : hot && !blockedWhy ? T.borderStrong : T.border}`,
        opacity: blockedWhy ? 0.45 : ticked ? 1 : 0.62, transition: `opacity ${MOTION.fast}, border-color ${MOTION.fast}` }}>
      {video ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#C9D4E3" }}>
          <Film size={22} />
          <span style={{ fontSize: 10.5 }}>{mb(Number(row.file_size) || 0)}</span>
        </div>
      ) : url ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7F8DA3" }}><ImageIcon size={18} /></div>
      )}
      <span aria-hidden="true" style={{ position: "absolute", top: 5, left: 5, width: 18, height: 18, borderRadius: 5,
        background: ticked ? BRAND.gold : "rgba(5,8,15,.55)", border: `1.5px solid ${ticked ? BRAND.gold : "rgba(255,255,255,.75)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1206", fontSize: 12, fontWeight: 800 }}>{ticked ? "✓" : ""}</span>
      {blockedWhy && (
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "2px 4px", background: "rgba(5,8,15,.8)", color: "#fff", fontSize: 9.5, textAlign: "center" }}>{blockedWhy}</span>
      )}
    </button>
  );
}

export function SimLauncher({ T, session, supa, onClose }) {
  const [state, setState] = useState({ phase: "loading" });        // loading | missing | error | ready
  const [mod, setMod] = useState(null);                              // src/sim/data/cast.js
  const [rows, setRows] = useState(null);                            // { campuses, users, teamConfig }
  const [media, setMedia] = useState(null);                          // site-visit rows on the host projects
  const [ticks, setTicks] = useState(null);                          // Set of attachment ids
  const [sayInput, setSayInput] = useState(() => readLS(SAY_KEY) || "");
  const [thumbs, setThumbs] = useState({});
  const [run, setRun] = useState(null);                              // progress | { result } | { error }
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // ── Load the pins, then the names and media they point to (reads only) ──
  useEffect(() => {
    if (!loadCastModule) { setState({ phase: "missing" }); return; }
    (async () => {
      try {
        const m = await loadCastModule();
        const P = m.PINS;
        const campusIds = Object.values(P.campuses || {});
        const userIds = Object.values(P.pms || {});
        const hostIds = Object.keys(P.hosts || {});
        const tok = session.access_token;
        const [campuses, users, team, att] = await Promise.all([
          campusIds.length ? supa(`/rest/v1/campuses?select=id,name&id=in.(${inList(campusIds)})`, {}, tok) : [],
          userIds.length ? supa(`/rest/v1/user_profiles?select=id,full_name,username,role,is_active&id=in.(${inList(userIds)})`, {}, tok) : [],
          supa("/rest/v1/settings?key=eq.team_config&select=value", {}, tok),
          hostIds.length ? supa(`/rest/v1/project_attachments?kind=eq.site_visit&project_id=in.(${inList(hostIds)})&select=id,project_id,file_path,mime_type,file_size,uploaded_at&order=uploaded_at.desc`, {}, tok) : [],
        ]);
        if (!alive.current) return;
        setMod(m);
        setRows({ campuses: Array.isArray(campuses) ? campuses : [], users: Array.isArray(users) ? users : [],
          teamConfig: (Array.isArray(team) && team[0]?.value) || {} });
        const list = Array.isArray(att) ? att : [];
        setMedia(list);
        // Nothing is ticked until the PMO ticks it (PMO decision, 15 Oct 2026). The saved ticks
        // apply after that, so anything uploaded since starts unticked.
        const saved = readTicks();
        setTicks(saved ? new Set(list.filter((r) => saved.has(r.id)).map((r) => r.id)) : new Set());
        setState({ phase: "ready" });
      } catch (e) {
        if (alive.current) setState({ phase: "error", message: e?.message || "Could not read the names" });
      }
    })();
  }, [supa, session]);

  const PINS = mod?.PINS || null;
  const built = useMemo(() => (mod && rows ? mod.buildCast(rows) : null), [mod, rows]);
  const storySlot = PINS?.storyPm || null;
  const storyName = storySlot ? built?.cast?.pms?.[storySlot]?.name || "" : "";
  const sayDefault = storyName && mod ? mod.deriveSay(mod.deriveShort(storyName)) : "";
  const sayValue = cleanSay(sayInput) || sayDefault;

  // The cast exactly as it will be sent: names only, plus the story PM's spoken name and the code.
  const finalCast = useMemo(() => {
    if (!built || !mod) return null;
    const c = JSON.parse(JSON.stringify(built.cast));
    if (storySlot && c.pms[storySlot] && sayValue) c.pms[storySlot].say = sayValue;
    c.code = mod.castCode(c);
    return c;
  }, [built, mod, storySlot, sayValue]);

  // Per-slot view (built.missing says what failed; this says why, for the PMO).
  const slotView = useMemo(() => {
    if (!PINS || !rows || !built) return null;
    const cById = new Map(rows.campuses.map((c) => [c.id, c]));
    const uById = new Map(rows.users.map((u) => [u.id, u]));
    const campuses = Object.entries(PINS.campuses).map(([slot, id]) => {
      const c = cById.get(id);
      return { slot, name: built.cast.campuses[slot]?.name || "", flag: c ? null : "not found" };
    });
    const pms = Object.entries(PINS.pms).map(([slot, id]) => {
      const u = uById.get(id);
      const role = (PINS.pmRoles || {})[slot] === "guest" ? "guest" : "project manager";
      return { slot, name: u ? (u.full_name || u.username || "") : "", note: slot === storySlot ? `${role} · story` : role,
        flag: !u ? "not found" : u.is_active === false ? "inactive" : null };
    });
    const team = (mod.TEAM_KEYS || Object.keys(MEMBER_TITLE)).map((k) => ({ key: k, title: MEMBER_TITLE[k] || k,
      name: built.cast.team[k]?.name || "", flag: built.cast.team[k]?.name ? null : "no name on Team & About" }));
    return { campuses, pms, team };
  }, [PINS, rows, built, mod, storySlot]);

  const missing = built?.missing || [];
  const campusMissing = missing.some((m) => m.startsWith("campus"));

  // ── Thumbnails: signed in small batches, images only (videos show an icon) ──
  useEffect(() => {
    if (!media) return;
    let stop = false;
    const todo = media.filter((r) => isSupportedMedia(r) && mediaMimeOf(r).startsWith("image/"));
    (async () => {
      for (let i = 0; i < todo.length && !stop; i += 6) {
        const part = todo.slice(i, i + 6);
        const got = await Promise.all(part.map((r) =>
          supa(`/storage/v1/object/sign/project-attachments/${encodeStoragePath(r.file_path)}`,
            { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }, session.access_token)
            .then((res) => (res?.signedURL ? [r.id, storageUrl(res.signedURL)] : null), () => null)));
        if (stop || !alive.current) return;
        const next = {};
        got.filter(Boolean).forEach(([id, u]) => { next[id] = u; });
        setThumbs((t) => ({ ...t, ...next }));
      }
    })();
    return () => { stop = true; };
  }, [media, supa, session]);

  const blockedWhy = (r) => !isSupportedMedia(r) ? "Type not supported"
    : mediaMimeOf(r).startsWith("video/") && Number(r.file_size) > ITEM_MAX ? "Over 50 MB" : null;
  const tickable = useMemo(() => (media || []).filter((r) => !blockedWhy(r)), [media]);
  const setAndSave = (s) => { setTicks(s); writeLS(TICKS_KEY, JSON.stringify([...s])); };
  const toggle = (id) => { const s = new Set(ticks); if (s.has(id)) s.delete(id); else s.add(id); setAndSave(s); };
  // Tick all leaves out the groups pinned as left out by default (screen captures, investment
  // media); those are ticked one by one or with their group's own Tick group.
  const excluded = (r) => !!PINS?.hosts?.[r.project_id]?.excludeByDefault;
  const tickAll = () => setAndSave(new Set([...(ticks || []), ...tickable.filter((r) => !excluded(r)).map((r) => r.id)]));
  const clearAll = () => setAndSave(new Set());
  const tickGroup = (g, on) => {
    const s = new Set(ticks || []);
    g.items.filter((r) => !blockedWhy(r)).forEach((r) => (on ? s.add(r.id) : s.delete(r.id)));
    setAndSave(s);
  };

  const tickedRows = useMemo(() => (media || []).filter((r) => ticks?.has(r.id) && !blockedWhy(r)), [media, ticks]);
  const tickedBytes = tickedRows.reduce((a, r) => a + (Number(r.file_size) || 0), 0);

  // Groups in host order (H1, H2, …), each labelled with its real campus from the cast.
  const groups = useMemo(() => {
    if (!media || !PINS) return [];
    const by = new Map();
    for (const r of media) {
      const h = PINS.hosts[r.project_id];
      if (!h) continue;
      if (!by.has(h.host)) by.set(h.host, { host: h.host, campus: built?.cast?.campuses?.[h.campusSlot]?.name || h.campusSlot, why: h.why, exclude: !!h.excludeByDefault, items: [] });
      by.get(h.host).items.push(r);
    }
    return [...by.values()].sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }));
  }, [media, PINS, built]);

  const running = run && !run.result && !run.error;
  const canStart = state.phase === "ready" && finalCast && !missing.length && !running;

  // Synchronous on purpose: the new tab must open inside the click, before anything is awaited.
  const start = () => {
    if (!canStart) return;
    setRun({ phase: "opening" });
    let p;
    try {
      p = launch({ session, supa, cast: finalCast, ticked: tickedRows, hosts: PINS.hosts,
        onProgress: (x) => { if (alive.current) setRun(x); } });
    } catch (e) { setRun({ error: e?.message || "Could not open the simulation" }); return; }
    p.then((result) => { if (alive.current) setRun({ result }); },
      (e) => { if (alive.current) setRun({ error: e?.message || "The hand-over failed" }); });
  };

  const progressLine = () => {
    if (!run) return null;
    if (run.error) return <span style={{ color: T.textOf(T.danger) }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{run.error}</span>;
    if (run.result) {
      const r = run.result;
      return (
        <span style={{ color: r.confirmed ? T.textOf(T.positive) : T.textOf(T.warning) }}>
          {r.confirmed ? <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> : <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />}
          {r.confirmed
            ? `Ready. The simulation tab has the names and ${r.sent} photo${r.sent === 1 ? "" : "s"} and video${r.sent === 1 ? "" : "s"} (${mb(r.bytes)}). Switch to it to begin.`
            : `Sent the names and ${r.sent} item${r.sent === 1 ? "" : "s"}, but the simulation tab did not confirm. If it shows a problem, press Start again.`}
          {r.skipped?.length > 0 && <span style={{ color: T.muted }}> {r.skipped.length} left out ({[...new Set(r.skipped.map((s) => s.reason))].join("; ")}).</span>}
        </span>
      );
    }
    const t = run.total || 0;
    const msg = run.phase === "opening" ? "Opening the simulation tab…"
      : run.phase === "names" ? "Names sent. Preparing the photos and videos…"
      : run.phase === "media" ? `Photos and videos: ${run.done || 0} of ${t} prepared, ${run.sent || 0} sent (${mb(run.bytes || 0)})…`
      : "Waiting for the simulation tab to confirm…";
    return <span style={{ color: T.textSoft }}>{msg}</span>;
  };

  const body = state.phase === "loading" ? (
    <div style={{ color: T.muted, fontSize: 13, padding: SP.lg }}>Reading the names and photos…</div>
  ) : state.phase === "missing" ? (
    <div style={{ color: T.muted, fontSize: 13, padding: SP.lg }}>Simulation data not installed in this build.</div>
  ) : state.phase === "error" ? (
    <div style={{ color: T.textOf(T.danger), fontSize: 13, padding: SP.lg }}>{state.message}</div>
  ) : (
    <>
      <Block T={T} icon={Users} title="Names"
        right={finalCast && <span style={{ ...TYPE.caption, color: T.muted }}>Cast code <b style={{ color: T.text, letterSpacing: 1 }}>{finalCast.code}</b></span>}>
        <div style={{ ...TYPE.caption, color: T.muted, marginBottom: SP.sm, lineHeight: 1.55 }}>
          Real campus, project manager and PMO team names appear on fictional projects and figures. Each name is read now from the portal; the simulation's Begin screen shows the same cast code.
        </div>
        {missing.length > 0 && (
          <div style={{ fontSize: 12.5, color: T.textOf(T.danger), marginBottom: SP.sm, lineHeight: 1.55 }}>
            <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
            {campusMissing ? "A pinned campus no longer resolves" : "A pinned name is missing"} ({missing.join(", ")}). The simulation needs every slot, so Start stays off until this is fixed.
          </div>
        )}
        {slotView && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SP.lg }}>
            <div>
              <div style={{ ...TYPE.label, color: T.muted, marginBottom: 4 }}>Campuses / sites</div>
              {slotView.campuses.map((s) => <Slot key={s.slot} T={T} label={s.slot} name={s.name} flag={s.flag} flagTone={T.danger} />)}
            </div>
            <div>
              <div style={{ ...TYPE.label, color: T.muted, marginBottom: 4 }}>Project managers</div>
              {slotView.pms.map((s) => <Slot key={s.slot} T={T} label={s.slot} name={s.name} note={s.note} flag={s.flag} flagTone={T.danger} />)}
            </div>
            <div>
              <div style={{ ...TYPE.label, color: T.muted, marginBottom: 4 }}>PMO team (Team & About)</div>
              {slotView.team.map((s) => <Slot key={s.key} T={T} label="" name={s.name} note={s.title} flag={s.flag} flagTone={T.danger} />)}
              {storySlot && (
                <div style={{ marginTop: SP.md }}>
                  <label htmlFor="pmo-sim-say" style={{ ...TYPE.label, color: T.muted, display: "block", marginBottom: 4 }}>Spoken name for the story PM</label>
                  <input id="pmo-sim-say" value={sayInput} placeholder={sayDefault}
                    onChange={(e) => { const v = e.target.value.slice(0, 80); setSayInput(v); writeLS(SAY_KEY, v); }}
                    style={{ width: "100%", boxSizing: "border-box", background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm,
                      padding: "7px 10px", fontSize: 13, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none" }} />
                  <div style={{ ...TYPE.caption, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>
                    How the voice says {storyName ? storyName.split(" ")[0] : "the story PM"}. Spell it the way it sounds. Kept on this computer only.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Block>

      <Block T={T} icon={ImageIcon} title="Photos and videos"
        right={<>
          <span style={{ ...TYPE.caption, color: T.muted }}>{tickedRows.length} of {tickable.length} ticked · {mb(tickedBytes)}</span>
          <Button T={T} size="sm" variant="ghost" onClick={tickAll} disabled={running}
            title="Ticks everything except the groups left out by default">Tick all</Button>
          <Button T={T} size="sm" variant="ghost" onClick={clearAll} disabled={running}>Clear</Button>
        </>}>
        <div style={{ ...TYPE.caption, color: T.muted, marginBottom: SP.sm, lineHeight: 1.55 }}>
          Ticked items appear in the Gallery and Site Visit, on fictional projects at the same campus. Pictures are re-encoded first, which removes location and camera details. Nothing is ticked until you tick it, and new uploads start unticked. The ticks are kept on this computer; nothing is saved to the portal.
        </div>
        {tickedRows.length > COUNT_MAX && <div style={{ fontSize: 12, color: T.textOf(T.warning), marginBottom: SP.sm }}>Only the newest {COUNT_MAX} ticked items are sent.</div>}
        {tickedBytes > TOTAL_MAX && <div style={{ fontSize: 12, color: T.textOf(T.warning), marginBottom: SP.sm }}>More than {mb(TOTAL_MAX)} is ticked. Pictures shrink when re-encoded; anything still over the limit is left out.</div>}
        {!media?.length ? (
          <div style={{ fontSize: 12.5, color: T.dim }}>No site-visit photos or videos on the pinned projects. The simulation will run with its own illustrations.</div>
        ) : groups.map((g) => (
          <div key={g.host} style={{ marginBottom: SP.md }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{g.campus}</span>
              <span style={{ ...TYPE.caption, color: T.dim }}>host {g.host} · {g.items.filter((r) => ticks?.has(r.id) && !blockedWhy(r)).length} of {g.items.length} ticked</span>
              {g.exclude && <Flag T={T} tone={T.warning}>left out by default{g.why ? `: ${g.why}` : ""}</Flag>}
              <span style={{ flex: 1 }} />
              {(() => {
                const n = g.items.filter((r) => !blockedWhy(r)).length;
                const on = g.items.filter((r) => ticks?.has(r.id) && !blockedWhy(r)).length;
                if (!n) return null;
                const all = on === n;
                return (
                  <button type="button" className="pmo-focusable" disabled={running} onClick={() => tickGroup(g, !all)}
                    style={{ border: 0, background: "none", padding: 0, cursor: running ? "default" : "pointer",
                      color: T.textOf(BRAND.blue), fontSize: 11.5, fontFamily: TYPE.body.fontFamily }}>
                    {all ? "Clear group" : "Tick group"}
                  </button>
                );
              })()}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
              {g.items.map((r) => (
                <MediaTile key={r.id} T={T} row={r} url={thumbs[r.id]} ticked={!!ticks?.has(r.id) && !blockedWhy(r)}
                  blockedWhy={blockedWhy(r)} onToggle={() => !running && toggle(r.id)} />
              ))}
            </div>
          </div>
        ))}
      </Block>
    </>
  );

  const footer = (
    <div style={{ display: "flex", alignItems: "center", gap: SP.md, width: "100%", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260, fontSize: 12.5, lineHeight: 1.55 }}>
        {progressLine() || <span style={{ color: T.muted }}>The simulation opens in a new tab. Keep this tab open until it says Ready.</span>}
      </div>
      <Button T={T} variant="ghost" onClick={onClose} disabled={running}>Close</Button>
      <Button T={T} variant="primary" icon={MonitorPlay} onClick={start} disabled={!canStart} loading={running}
        title={missing.length ? "Every name slot must resolve first" : "Open the simulation in a new tab"}>Start Simulation</Button>
    </div>
  );

  return createPortal(
    <Modal T={T} title="Simulation" icon={MonitorPlay} width={820} onClose={running ? undefined : onClose}
      sub="Present the portal on fictional data. Campus, manager and team names and the ticked photos are handed over from this tab."
      footer={footer}>
      {body}
    </Modal>,
    document.body,
  );
}
