import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Upload, Trash2, Download, ChevronLeft, ChevronRight, X,
         Play, Pause, Maximize2, Camera, GripVertical, Check } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { EmptyState, Skeleton } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   SITE VISIT GALLERY

   Photographs and video from site visits, as a slideshow that advances every
   five seconds, opens full screen on click, and offers a download per item.

   Storage reuses `project_attachments` with kind='site_visit' — same bucket,
   same RLS, and the same signed-URL construction as Documents, including the
   /storage/v1 prefix that a separate implementation would have got wrong all
   over again.
   ═══════════════════════════════════════════════════════════════════════════ */

const SLIDE_MS = 5000;
const IMAGE_RE = /^image\//;
const VIDEO_RE = /^video\//;

const isVideo = (m) => VIDEO_RE.test(m?.mime_type || "") ||
  /\.(mp4|mov|webm|m4v|avi)$/i.test(m?.file_name || "");
const isImage = (m) => IMAGE_RE.test(m?.mime_type || "") ||
  /\.(jpe?g|png|gif|webp|heic|avif)$/i.test(m?.file_name || "");

export function SiteVisitGallery({
  T, items, loading, canManage, err,
  onUpload, onDelete, getUrl, uploading, onReorder,
  storageBar,
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [lightbox, setLightbox] = useState(false);
  const [urls, setUrls] = useState({});       // id -> signed url
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState(null);   // local while arranging
  const [dragId, setDragId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [videoPct, setVideoPct] = useState(0);
  const fileRef = useRef(null);
  const timer = useRef(null);
  const videoRef = useRef(null);
  const startedFor  = useRef(null);  // "<index>:<id>" playback has begun for
  const advancedFor = useRef(null);  // slide index already advanced from

  const reduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const safeIdx = items.length ? Math.min(idx, items.length - 1) : 0;
  const current = items[safeIdx];

  // Signed URLs expire, so they are fetched per item and cached for this
  // mount rather than requested on every render.
  useEffect(() => {
    let alive = true;
    const need = items.slice(safeIdx, safeIdx + 2).filter(m => m && !urls[m.id]);
    if (!need.length) return;
    Promise.all(need.map(m => getUrl(m).then(u => [m.id, u]).catch(() => null)))
      .then(pairs => {
        if (!alive) return;
        const next = {};
        pairs.filter(Boolean).forEach(([id, u]) => { next[id] = u; });
        if (Object.keys(next).length) setUrls(p => ({ ...p, ...next }));
      });
    return () => { alive = false; };
  }, [items, safeIdx, getUrl, urls]);

  const go = useCallback((delta) => {
    if (!items.length) return;
    setIdx(i => (i + delta + items.length) % items.length);
  }, [items.length]);

  // Auto-advance.
  //
  // Images hold for five seconds. Video runs to its end instead: the previous
  // version set the same five-second timer for both, and since the clip was
  // never actually started it read as paused — so the slideshow moved on
  // before the video had played at all.
  //
  // No timer is set while a video is the current slide. Advancing is driven by
  // its `ended` event, with a guard below for the case where playback cannot
  // start at all.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing || reduced || items.length < 2) return;
    if (current && isVideo(current)) return;      // the clip decides when to move on
    // Do not start the five seconds until the image is actually on screen,
    // or a slow signed-URL fetch eats most of its time.
    if (current && !urls[current.id]) return;
    timer.current = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(timer.current);
  }, [playing, reduced, items.length, safeIdx, go, current, urls]);

  // Starting the clip is driven by the video element's own readiness, not by
  // the slide changing.
  //
  // Signed URLs are fetched asynchronously, so at the moment a video becomes
  // the current slide it frequently has no source yet — calling play() then
  // rejects, and the earlier version fell through to the five-second image
  // timer, which is exactly the behaviour this was meant to remove. Playback
  // now begins from onCanPlay, by which point the clip genuinely can start.
  const startPlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v || !playing || reduced || arranging) return;
    const token = `${safeIdx}:${current?.id}`;
    if (startedFor.current === token) return;    // this clip has already run
    startedFor.current = token;
    clearTimeout(timer.current);            // the clip decides when to advance
    // Already muted via the element, so this is permitted. Only if it still
    // refuses does the slideshow fall back to the image interval.
    const p = v.play();
    if (p && p.catch) p.catch(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => go(1), SLIDE_MS);
    });
  }, [playing, reduced, arranging, go, current, safeIdx]);

  // Watchdog. If a video slide has not begun playing within fifteen seconds —
  // a corrupt file, a network stall, blocked autoplay — move on rather than
  // leaving the slideshow parked on a frozen frame indefinitely.
  useEffect(() => {
    if (!current || !isVideo(current) || !playing || reduced || arranging) return;
    const t = setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.currentTime) go(1);
    }, 15000);
    return () => clearTimeout(t);
  }, [current, safeIdx, playing, reduced, arranging, go]);

  // Reset position when the slide changes, and pause if the show is paused.
  useEffect(() => {
    if (!current || !isVideo(current)) return;
    const v = videoRef.current;
    if (!v) return;
    setVideoPct(0);
    try { v.currentTime = 0; } catch (_) { /* not yet seekable */ }
    if (!playing || reduced) v.pause();
    else if (v.readyState >= 3) startPlayback();   // already buffered
  }, [current, safeIdx, playing, reduced, startPlayback]);

  // Keyboard: arrows move, space toggles, Escape leaves full screen.
  useEffect(() => {
    const onKey = (e) => {
      if (!items.length) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Escape" && lightbox) { e.preventDefault(); setLightbox(false); }
      else if (e.key === " " && lightbox) { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, go, lightbox]);

  const startArranging = () => { setOrder(items.map(m => m.id)); setArranging(true); setPlaying(false); };
  const cancelArranging = () => { setOrder(null); setArranging(false); };

  const saveOrder = async () => {
    if (!order) return;
    setSavingOrder(true);
    await onReorder?.(order);
    setSavingOrder(false);
    setOrder(null);
    setArranging(false);
    setIdx(0);
  };

  // Reordering by drag, with a keyboard equivalent — a slideshow sequence is
  // a real editorial decision and should not require a mouse.
  const moveItem = (id, delta) => {
    setOrder(prev => {
      if (!prev) return prev;
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      next.splice(j, 0, next.splice(i, 1)[0]);
      return next;
    });
  };

  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId) return;
    setOrder(prev => {
      if (!prev) return prev;
      const from = prev.indexOf(dragId), to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };

  // While arranging, the strip reflects the working copy rather than the
  // saved order.
  const arrangeList = (order || []).map(id => items.find(m => m.id === id)).filter(Boolean);

  const download = async (m) => {
    const u = await getUrl(m, true);
    if (u) window.open(u, "_blank");
  };

  const stage = (m, url, big) => {
    if (!m) return null;

    // Signed URLs arrive asynchronously. Rendering a <video> or <img> before
    // its src exists fires an immediate error — which was cutting clips off
    // after ~1.9s via the error fallback, so a four-second video never played.
    // Wait for the URL instead, and hold the slideshow while waiting.
    if (!url) {
      return (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
          height:"100%", background:"#05080F", gap:SP.sm }}>
          <span className="pmo-live-dot" style={{
            width:7, height:7, borderRadius:"50%", background:T.blueBright }} />
          <span style={{ ...TYPE.caption, color:T.muted }}>Loading {m.file_name}…</span>
        </div>
      );
    }
    if (isVideo(m)) {
      return (
        <video
          ref={big ? undefined : videoRef}
          key={m.id}
          src={url} controls playsInline preload="auto"
          muted={!big}
          onCanPlay={() => { if (!big) startPlayback(); }}
          onPlay={() => clearTimeout(timer.current)}
          onTimeUpdate={(e) => {
            if (big) return;
            const el = e.currentTarget;
            if (!el.duration || !isFinite(el.duration)) return;
            setVideoPct((el.currentTime / el.duration) * 100);
            if (playing && !reduced &&
                el.currentTime >= el.duration - 0.2 &&
                advancedFor.current !== safeIdx) {
              advancedFor.current = safeIdx;    // one advance per visit
              el.pause();
              go(1);
            }
          }}
          // The clip finishing is what moves the slideshow on. The flag stops
          // the reset effect from starting it again before the index changes.
          onEnded={() => {
            if (big || advancedFor.current === safeIdx) return;
            advancedFor.current = safeIdx;
            if (playing && !reduced) go(1);
          }}
          // A file that will not load must not strand the slideshow.
          onError={() => { if (playing && !reduced) {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go(1), 1200);
          } }}
          style={{ width:"100%", height:"100%", objectFit:"contain", display:"block",
                   background:"#05080F", borderRadius: big ? R.md : 0 }} />
      );
    }
    if (isImage(m)) {
      return (
        <img key={m.id} src={url} alt={m.file_name}
          style={{ width:"100%", height:"100%", objectFit:"contain", display:"block",
                   background:"#05080F", borderRadius: big ? R.md : 0 }} />
      );
    }
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
        height:"100%", color:T.muted, ...TYPE.bodySm }}>
        {m.file_name} — preview not available for this file type
      </div>
    );
  };

  return (
    <div>
      {/* Header + upload */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:SP.md, gap:SP.md, flexWrap:"wrap" }}>
        <div style={{ ...TYPE.label, color:T.muted }}>
          Site Visit Media{items.length ? ` (${items.length})` : ""}
        </div>
        {canManage && (
          <>
            {items.length > 1 && !arranging && (
              <button className="pmo-focusable pmo-btn" onClick={startArranging}
                title="Change the order images and video appear in the slideshow"
                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px",
                  background:"transparent", border:`1px solid ${T.border}`,
                  borderRadius:R.sm, color:T.textSoft, ...TYPE.bodySm, fontWeight:600,
                  cursor:"pointer", marginLeft:"auto" }}>
                <GripVertical size={12} /> Arrange
              </button>
            )}
            {arranging && (
              <div style={{ display:"flex", gap:SP.sm, marginLeft:"auto" }}>
                <button className="pmo-focusable pmo-btn" onClick={cancelArranging}
                  style={{ padding:"6px 13px", background:"transparent",
                    border:`1px solid ${T.border}`, borderRadius:R.sm,
                    color:T.muted, ...TYPE.bodySm, cursor:"pointer" }}>Cancel</button>
                <button className="pmo-focusable pmo-btn" onClick={saveOrder} disabled={savingOrder}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px",
                    background:T.positive, border:"none", borderRadius:R.sm,
                    color:"#06231D", ...TYPE.bodySm, fontWeight:700, cursor:"pointer" }}>
                  <Check size={12} /> {savingOrder ? "Saving…" : "Save order"}
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" multiple accept="image/*,video/*"
              style={{ display:"none" }}
              onChange={e => { onUpload(e.target.files); e.target.value = ""; }} />
            <button className="pmo-focusable pmo-btn" disabled={uploading}
              onClick={() => fileRef.current?.click()}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px",
                background: uploading ? T.muted : T.blue, border:"none",
                borderRadius:R.sm, color:"#fff", ...TYPE.bodySm, fontWeight:600,
                cursor: uploading ? "default" : "pointer" }}>
              <Upload size={12} /> {uploading ? "Uploading…" : "Upload photos or video"}
            </button>
          </>
        )}
      </div>

      {storageBar}

      {err && <div style={{ ...TYPE.caption, color:T.textOf(T.danger), marginBottom:SP.sm }}>{err}</div>}

      {loading ? (
        <Skeleton T={T} height={320} />
      ) : items.length === 0 ? (
        <EmptyState T={T} icon={Camera} compact tone={T.info}
          title="No site visit media yet"
          message={canManage
            ? "Photographs and video from site visits appear here as a slideshow. Use Upload to add the first ones."
            : "Photographs and video from site visits will appear here once the PMO uploads them."} />
      ) : arranging ? (
        <div>
          <div style={{ ...TYPE.caption, color:T.muted, marginBottom:SP.md, lineHeight:1.6 }}>
            Drag a tile, or use the arrows, to set the order the slideshow plays in.
            The first tile appears first.
          </div>
          <div style={{ display:"grid", gap:SP.md,
            gridTemplateColumns:"repeat(auto-fill, minmax(min(190px,100%), 1fr))" }}>
            {arrangeList.map((m, i) => (
              <div key={m.id}
                draggable
                onDragStart={() => setDragId(m.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { dropOn(m.id); setDragId(null); }}
                onDragEnd={() => setDragId(null)}
                style={{
                  border:`2px solid ${dragId === m.id ? T.blueBright : T.border}`,
                  borderRadius:R.md, overflow:"hidden", background:"#05080F",
                  opacity: dragId === m.id ? 0.55 : 1,
                  cursor:"grab", position:"relative",
                  transition:`border-color ${MOTION.fast}, opacity ${MOTION.fast}`,
                }}>
                <div style={{ position:"relative", aspectRatio:"16 / 10" }}>
                  {urls[m.id] && isImage(m) && (
                    <img src={urls[m.id]} alt=""
                      style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  )}
                  {isVideo(m) && (
                    <span style={{ position:"absolute", inset:0, display:"flex",
                      alignItems:"center", justifyContent:"center", color:"#fff" }}>
                      <Play size={22} />
                    </span>
                  )}
                  <span style={{
                    position:"absolute", top:6, left:6, minWidth:22, height:22,
                    borderRadius:R.sm, background:T.blueBright, color:"#06182B",
                    ...TYPE.caption, fontWeight:800,
                    display:"flex", alignItems:"center", justifyContent:"center", padding:"0 6px",
                  }}>{i + 1}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6,
                  padding:`${SP.xs}px ${SP.sm}px`, background:T.surfaceRaised }}>
                  <GripVertical size={12} color={T.dim} style={{ flexShrink:0 }} />
                  <span style={{ ...TYPE.caption, color:T.textSoft, flex:1, minWidth:0,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.file_name}</span>
                  <button className="pmo-focusable" title="Move earlier"
                    disabled={i === 0} onClick={() => moveItem(m.id, -1)}
                    style={arrowBtn(T, i === 0)}><ChevronLeft size={12} /></button>
                  <button className="pmo-focusable" title="Move later"
                    disabled={i === arrangeList.length - 1} onClick={() => moveItem(m.id, 1)}
                    style={arrowBtn(T, i === arrangeList.length - 1)}><ChevronRight size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Stage */}
          <div style={{
            position:"relative", width:"100%", aspectRatio:"16 / 9",
            background:"#05080F", border:`1px solid ${T.border}`,
            borderRadius:R.lg, overflow:"hidden", boxShadow:T.shadow,
          }}>
            {stage(current, urls[current?.id])}

            {/* Click the frame to open full screen. Kept off the video so its
                own controls stay usable. */}
            {!isVideo(current) && (
              <button className="pmo-focusable" onClick={() => setLightbox(true)}
                title="View full screen"
                style={{ position:"absolute", inset:0, background:"transparent",
                  border:"none", cursor:"zoom-in" }} />
            )}

            {items.length > 1 && (
              <>
                <NavBtn T={T} side="left"  onClick={() => go(-1)} Icon={ChevronLeft} />
                <NavBtn T={T} side="right" onClick={() => go(1)}  Icon={ChevronRight} />
              </>
            )}

            {/* Controls */}
            <div style={{
              position:"absolute", right:10, top:10, display:"flex", gap:6, zIndex:3,
            }}>
              {items.length > 1 && !reduced && (
                <IconChip T={T} title={playing ? "Pause slideshow" : "Play slideshow"}
                  onClick={() => {
                    const next = !playing;
                    setPlaying(next);
                    // Pausing the slideshow must pause the clip too, or the
                    // video keeps running while the advance is stopped.
                    const v = videoRef.current;
                    if (v && isVideo(current)) { next ? v.play().catch(() => {}) : v.pause(); }
                  }}
                  Icon={playing ? Pause : Play} />
              )}
              <IconChip T={T} title="View full screen" onClick={() => setLightbox(true)} Icon={Maximize2} />
              <IconChip T={T} title="Download this file" onClick={() => download(current)} Icon={Download} />
              {canManage && (
                <IconChip T={T} title="Delete this file" tone={T.danger}
                  onClick={() => onDelete(current)} Icon={Trash2} />
              )}
            </div>

            {/* Caption + progress */}
            <div style={{
              position:"absolute", left:0, right:0, bottom:0, padding:"26px 14px 10px",
              background:"linear-gradient(0deg, rgba(3,7,15,.92), transparent)",
              pointerEvents:"none",
            }}>
              <div style={{ ...TYPE.bodySm, color:"#fff", fontWeight:600,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {current?.file_name}
              </div>
              <div style={{ ...TYPE.caption, color:"rgba(255,255,255,.66)", marginTop:2 }}>
                {safeIdx + 1} of {items.length}
                {current?.uploaded_by_name ? ` · ${current.uploaded_by_name}` : ""}
                {current?.uploaded_at
                  ? ` · ${new Date(current.uploaded_at).toLocaleDateString("en-GB",
                      { day:"numeric", month:"short", year:"numeric" })}` : ""}
              </div>
            </div>

            {/* A hairline showing how long until the next slide. Keyed on the
                index so it restarts cleanly on every advance. */}
            {playing && !reduced && items.length > 1 && (
              isVideo(current) ? (
                // Driven by the clip's own position, so the bar reflects how
                // far through the video is rather than a fixed interval.
                <div style={{
                  position:"absolute", left:0, bottom:0, height:2, zIndex:4,
                  background:T.blueBright, width:`${videoPct}%`,
                  transition:"width .25s linear",
                }} />
              ) : (
                <div key={safeIdx} style={{
                  position:"absolute", left:0, bottom:0, height:2, background:T.blueBright,
                  animation:`pmoSlideBar ${SLIDE_MS}ms linear forwards`, zIndex:4,
                }} />
              )
            )}
          </div>

          {/* Thumbnails */}
          {items.length > 1 && (
            <div className="pmo-scroll" style={{
              display:"flex", gap:SP.sm, marginTop:SP.md, overflowX:"auto", paddingBottom:4 }}>
              {items.map((m, i) => (
                <button key={m.id} className="pmo-focusable"
                  onClick={() => setIdx(i)} title={m.file_name}
                  style={{
                    flexShrink:0, width:98, height:60, padding:0, cursor:"pointer",
                    borderRadius:R.sm, overflow:"hidden", position:"relative",
                    background:"#05080F",
                    border:`2px solid ${i === safeIdx ? T.blueBright : "transparent"}`,
                    opacity: i === safeIdx ? 1 : 0.62,
                    transition:`opacity ${MOTION.fast}, border-color ${MOTION.fast}`,
                  }}>
                  {urls[m.id] && isImage(m) && (
                    <img src={urls[m.id]} alt=""
                      style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  )}
                  {isVideo(m) && (
                    <span style={{ position:"absolute", inset:0, display:"flex",
                      alignItems:"center", justifyContent:"center", color:"#fff" }}>
                      <Play size={16} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Full screen */}
      {lightbox && current && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(false); }}
          style={{
            position:"fixed", inset:0, zIndex:1600,
            background:"rgba(3,7,15,.95)",
            backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:"4vh 4vw",
          }}>
          <div style={{ position:"relative", maxWidth:"100%", maxHeight:"100%",
            width:"min(1400px, 100%)", aspectRatio:"16 / 9" }}>
            {stage(current, urls[current.id], true)}
            {items.length > 1 && (
              <>
                <NavBtn T={T} side="left"  onClick={() => go(-1)} Icon={ChevronLeft} big />
                <NavBtn T={T} side="right" onClick={() => go(1)}  Icon={ChevronRight} big />
              </>
            )}
          </div>
          <div style={{ position:"fixed", top:18, right:20, display:"flex", gap:8 }}>
            <IconChip T={T} title="Download this file" onClick={() => download(current)} Icon={Download} />
            <IconChip T={T} title="Close (Esc)" onClick={() => setLightbox(false)} Icon={X} />
          </div>
          <div style={{ position:"fixed", left:0, right:0, bottom:16, textAlign:"center",
            ...TYPE.bodySm, color:"rgba(255,255,255,.8)", pointerEvents:"none" }}>
            {current.file_name} — {safeIdx + 1} of {items.length}
          </div>
        </div>
      )}
    </div>
  );
}

const arrowBtn = (T, disabled) => ({
  width:22, height:22, borderRadius:4, flexShrink:0,
  background:"transparent", border:`1px solid ${T.border}`,
  color: disabled ? T.dim : T.textSoft,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
  display:"flex", alignItems:"center", justifyContent:"center", padding:0,
});

const NavBtn = ({ T, side, onClick, Icon, big }) => (
  <button className="pmo-focusable" onClick={onClick}
    title={side === "left" ? "Previous" : "Next"}
    style={{
      position:"absolute", top:"50%", [side]: big ? -52 : 10,
      transform:"translateY(-50%)", zIndex:5,
      width: big ? 42 : 34, height: big ? 42 : 34, borderRadius:"50%",
      background:"rgba(8,16,32,.72)", border:"1px solid rgba(255,255,255,.16)",
      color:"#fff", cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
      transition:`background ${MOTION.fast}`,
    }}>
    <Icon size={big ? 20 : 16} />
  </button>
);

const IconChip = ({ T, title, onClick, Icon, tone }) => (
  <button className="pmo-focusable" onClick={onClick} title={title} aria-label={title}
    style={{
      width:32, height:32, borderRadius:R.sm, cursor:"pointer",
      background:"rgba(8,16,32,.72)", border:"1px solid rgba(255,255,255,.16)",
      color: tone || "#fff",
      display:"flex", alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
      transition:`background ${MOTION.fast}, color ${MOTION.fast}`,
    }}>
    <Icon size={14} />
  </button>
);
