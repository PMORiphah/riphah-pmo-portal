import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Camera, Play, Download, X, ChevronLeft, ChevronRight, ArrowUpRight, ImageOff, ArrowUpDown, Filter } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";
import { Select, useViewport } from "./ui.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PHOTO WALL

   Every site-visit photo and video across the whole CAPEX portfolio, in one
   place. Deliberately a flat chronological wall, not grouped by campus —
   verified directly before building: only 3 of 109 projects have any
   site-visit media today (8 files total). A grouped grid would show mostly
   empty campus sections right now; a flat wall stays visually full at any
   volume and simply grows richer as more site visits get documented.

   Visible to every role identically, including Project Managers — who are
   scoped to their own assigned projects everywhere else in the portal. That
   required two new, narrow RLS policies (kind='site_visit' only; document
   access for PMs is completely unchanged) rather than loosening anything
   that already existed.
   ═══════════════════════════════════════════════════════════════════════════ */

const isVideo = (m) => /^video\//.test(m?.mime_type || "") || /\.(mp4|mov|webm|m4v)$/i.test(m?.file_name || "");
const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";
// Storage paths are "<uuid>/<uuid>-filename.ext" — encoding the whole string
// with encodeURIComponent would also escape the "/" itself and break the
// path. Each segment has to be encoded independently, then rejoined.
const encodeStoragePath = (path) => path.split("/").map(encodeURIComponent).join("/");

function relTime(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day:"numeric", month:"short" });
}

// A small, self-contained filter dropdown — same Select the rest of the
// portal already uses, so it looks like one control language rather than a
// second one invented just for this page. Options are hidden entirely once
// there's only one (or zero) real values, since a filter that can't narrow
// anything is just clutter.
function FilterSelect({ T, value, onChange, label, options }) {
  if (!options || options.length < 2) return null;
  return (
    <Select T={T} size="sm" value={value} active={!!value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </Select>
  );
}

export function PhotoWallPage({ T, session, supa, onSelectProject }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [urls, setUrls] = useState({});
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [sortBy, setSortBy] = useState("recent");
  const [fFiscalYear, setFFiscalYear] = useState("");
  const [fOrg, setFOrg]               = useState("");
  const [fSegment, setFSegment]       = useState("");
  const [fPriority, setFPriority]     = useState("");
  const [fCampus, setFCampus]         = useState("");
  const [fCostCentre, setFCostCentre] = useState("");
  const urlsRef = useRef({});

  const load = useCallback(async () => {
    try {
      // Note on two easily-swapped fields, confirmed earlier this session:
      // the portal's "Organization" column (Riphah / Trust) reads from
      // segment_id, and its "Segment" column (Healthcare / Academics /
      // Management) reads from sector_id — the DB names are the reverse of
      // the UI labels. sectors(name) below is genuinely "Segment", and
      // segments(name) is genuinely "Organization".
      const rows = await supa(
        "/rest/v1/project_attachments?kind=eq.site_visit&select=id,project_id,file_name,file_path,mime_type,uploaded_at,uploaded_by_name," +
        "projects(name,code,campus,fiscal_year,strategic_priority,sectors(name),segments(name),cost_centers(name))" +
        "&order=uploaded_at.desc&limit=200",
        {}, session.access_token);
      if (Array.isArray(rows)) {
        setItems(rows.filter(r => r.projects));
      }
    } catch (e) { setErr(e.message); }
  }, [supa, session]);

  useEffect(() => { load(); }, [load]);

  // Signed URLs, fetched for what's visible plus a little ahead — this list
  // is small today (single digits) but shouldn't become a stampede of
  // requests once site visits are documented more widely.
  const getUrl = useCallback(async (item) => {
    if (urlsRef.current[item.id]) return urlsRef.current[item.id];
    try {
      const res = await supa(
        `/storage/v1/object/sign/project-attachments/${encodeStoragePath(item.file_path)}`,
        { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }, session.access_token);
      if (!res?.signedURL) return null;
      // Supabase's signedURL is relative ("/object/sign/…") — omitting the
      // /storage/v1 prefix here previously caused live 404s across this
      // portal until it was traced and fixed; matching that exact fix here.
      const full = SUPA_URL + "/storage/v1" + res.signedURL;
      urlsRef.current[item.id] = full;
      setUrls(u => ({ ...u, [item.id]: full }));
      return full;
    } catch (_) { return null; }
  }, [supa, session]);

  // Every filter dropdown is populated from what's actually in the data, not
  // a hardcoded list — so a filter never offers a value that would return
  // zero results, and it needs nothing updated when new campuses or cost
  // centres get added elsewhere in the portal.
  const FILTER_FIELDS = {
    fFiscalYear: (p) => p.fiscal_year,
    fOrg:        (p) => p.segments?.name,
    fSegment:    (p) => p.sectors?.name,
    fPriority:   (p) => p.strategic_priority,
    fCampus:     (p) => p.campus,
    fCostCentre: (p) => p.cost_centers?.name,
  };
  const filterState = { fFiscalYear, fOrg, fSegment, fPriority, fCampus, fCostCentre };
  const setFilter = { fFiscalYear: setFFiscalYear, fOrg: setFOrg, fSegment: setFSegment,
    fPriority: setFPriority, fCampus: setFCampus, fCostCentre: setFCostCentre };

  const filterOptions = useMemo(() => {
    if (!items) return {};
    const out = {};
    for (const key of Object.keys(FILTER_FIELDS)) {
      const vals = new Set(items.map(i => FILTER_FIELDS[key](i.projects)).filter(Boolean));
      out[key] = [...vals].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }
    return out;
  }, [items]);

  const activeFilterCount = Object.values(filterState).filter(Boolean).length;
  const clearAllFilters = () => Object.values(setFilter).forEach(fn => fn(""));

  const filteredItems = useMemo(() => {
    if (!items) return items;
    return items.filter(item =>
      Object.entries(filterState).every(([key, val]) =>
        !val || FILTER_FIELDS[key](item.projects) === val));
  }, [items, fFiscalYear, fOrg, fSegment, fPriority, fCampus, fCostCentre]);

  // Every option beyond "recent" sorts by a field on the joined project, not
  // the attachment itself — nulls (a project with no strategic_priority or
  // cost centre set, say) sort to the end rather than scattering randomly
  // through the middle. Declared here, before first use below — an earlier
  // version of this file referenced sortedItems from an effect declared
  // above this point, the same temporal-dead-zone mistake documented
  // elsewhere in this codebase's App.jsx.
  const SORTERS = {
    recent:      null, // already the fetch order
    fiscal_year: (p) => p.fiscal_year,
    org:         (p) => p.segments?.name,          // "Organization" in the UI == segment_id
    segment:     (p) => p.sectors?.name,            // "Segment" in the UI == sector_id
    priority:    (p) => p.strategic_priority,
    campus:      (p) => p.campus,
    cost_centre: (p) => p.cost_centers?.name,
    project_name:(p) => p.name,
    project_id:  (p) => (p.code && p.code !== "-") ? p.code : null,
  };

  const sortedItems = useMemo(() => {
    if (!filteredItems) return filteredItems;
    const getter = SORTERS[sortBy];
    if (!getter) return filteredItems; // "recent" — keep fetch order
    return [...filteredItems].sort((a, b) => {
      const va = getter(a.projects), vb = getter(b.projects);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
  }, [filteredItems, sortBy]);

  useEffect(() => {
    if (!sortedItems) return;
    sortedItems.slice(0, 40).forEach(getUrl);
  }, [sortedItems, getUrl]);

  const download = async (item) => {
    const url = await getUrl(item);
    if (!url) return;
    const sep = url.includes("?") ? "&" : "?";
    window.open(`${url}${sep}download=${encodeURIComponent(item.file_name)}`, "_blank");
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto" }} className="pmo-scroll">
      <div style={{ padding: `${SP.lg}px ${SP.xl}px ${SP.md}px`, display: "flex",
        alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: SP.md }}>
        <div>
          <div style={{ ...TYPE.h2, color: T.text }}>Gallery</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>
            {items === null ? "Loading…" : activeFilterCount > 0
              ? `${sortedItems.length} of ${items.length} photos and videos`
              : `${items.length} photo${items.length === 1 ? "" : "s"} and video${items.length===1?"":"s"} across the portfolio`}
          </div>
        </div>
        {items !== null && items.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ArrowUpDown size={13} color={T.dim} />
            <Select T={T} size="sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="recent">Most recent</option>
              <option value="fiscal_year">Fiscal Year</option>
              <option value="org">Organization</option>
              <option value="segment">Segment</option>
              <option value="priority">Strategic Priority</option>
              <option value="campus">Campus</option>
              <option value="cost_centre">Cost Centre</option>
              <option value="project_name">Project Name</option>
              <option value="project_id">Project ID</option>
            </Select>
          </div>
        )}
      </div>

      {items !== null && items.length > 1 && (
        <div style={{ padding: `0 ${SP.xl}px ${SP.md}px`, display: "flex", flexWrap: "wrap",
          alignItems: "center", gap: SP.sm }}>
          <Filter size={13} color={T.dim} />
          <FilterSelect T={T} value={fFiscalYear} onChange={setFFiscalYear} label="All Fiscal Years" options={filterOptions.fFiscalYear} />
          <FilterSelect T={T} value={fOrg}        onChange={setFOrg}        label="All Organizations" options={filterOptions.fOrg} />
          <FilterSelect T={T} value={fSegment}    onChange={setFSegment}    label="All Segments" options={filterOptions.fSegment} />
          <FilterSelect T={T} value={fPriority}   onChange={setFPriority}   label="All Priorities" options={filterOptions.fPriority} />
          <FilterSelect T={T} value={fCampus}     onChange={setFCampus}     label="All Campuses" options={filterOptions.fCampus} />
          <FilterSelect T={T} value={fCostCentre} onChange={setFCostCentre} label="All Cost Centres" options={filterOptions.fCostCentre} />
          {activeFilterCount > 0 && (
            <button className="pmo-focusable pmo-btn" onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                background: "transparent", border: "none", color: T.textOf(T.blueBright),
                ...TYPE.caption, fontWeight: 600, cursor: "pointer" }}>
              <X size={11} /> Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}

      {err && <div style={{ padding: `0 ${SP.xl}px`, ...TYPE.bodySm, color: T.textOf(T.danger) }}>{err}</div>}

      {items !== null && items.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: SP.xxl, color: T.muted, gap: 10 }}>
          <Camera size={26} color={T.dim} />
          <div style={{ ...TYPE.bodySm }}>No site visits documented yet.</div>
          <div style={{ ...TYPE.caption, color: T.dim }}>Photos and video uploaded to any project's Site Visit tab will appear here.</div>
        </div>
      )}

      {items !== null && items.length > 0 && sortedItems.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: SP.xxl, color: T.muted, gap: 10 }}>
          <Filter size={22} color={T.dim} />
          <div style={{ ...TYPE.bodySm }}>Nothing matches these filters.</div>
          <button className="pmo-focusable pmo-btn" onClick={clearAllFilters}
            style={{ ...TYPE.caption, color: T.textOf(T.blueBright), background: "none", border: "none", cursor: "pointer" }}>
            Clear all filters
          </button>
        </div>
      )}

      <div style={{
        padding: `${SP.md}px ${SP.xl}px ${SP.xxl}px`,
        display: "grid", gap: SP.md,
        gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
      }}>
        {sortedItems === null ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: "1/1", borderRadius: R.md, background: T.surfaceRaised }} />
          ))
        ) : sortedItems.map((item, i) => (
          <button key={item.id} className="pmo-focusable pmo-lift" onClick={() => setLightboxIdx(i)}
            style={{ position: "relative", aspectRatio: "1/1", borderRadius: R.md, overflow: "hidden",
              border: `1px solid ${T.border}`, background: "#05080F", cursor: "pointer", padding: 0,
              textAlign: "left" }}>
            {urls[item.id] ? (
              isVideo(item) ? (
                <video src={urls[item.id]} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
              ) : (
                <img src={urls[item.id]} alt={item.file_name} loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                justifyContent: "center" }}><ImageOff size={16} color={T.dim} /></div>
            )}
            {isVideo(item) && (
              <span style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%",
                background: "rgba(3,7,15,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Play size={11} color="#fff" />
              </span>
            )}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "22px 10px 8px",
              background: "linear-gradient(0deg, rgba(3,7,15,.88), transparent)" }}>
              <div style={{ ...TYPE.caption, color: "#fff", fontWeight: 600, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.projects?.name}</div>
              <div style={{ ...TYPE.caption, color: "rgba(255,255,255,.65)", fontSize: 10.5, marginTop: 1 }}>
                {item.projects?.campus} · {relTime(item.uploaded_at)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {lightboxIdx !== null && sortedItems && sortedItems[lightboxIdx] && (
        <Lightbox T={T} items={sortedItems} idx={lightboxIdx} urls={urls} getUrl={getUrl}
          onClose={() => setLightboxIdx(null)}
          onNav={(d) => setLightboxIdx(i => (i + d + sortedItems.length) % sortedItems.length)}
          onDownload={download}
          onViewProject={(pid) => { setLightboxIdx(null); onSelectProject?.(pid); }} />
      )}
    </div>
  );
}

function Lightbox({ T, items, idx, urls, getUrl, onClose, onNav, onDownload, onViewProject }) {
  const vp = useViewport();
  const item = items[idx];
  useEffect(() => { getUrl(item); }, [item, getUrl]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNav(1);
      else if (e.key === "ArrowLeft") onNav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNav]);

  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 1600, background: "rgba(3,7,15,.95)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 4vw",
    }}>
      <div style={vp.isCompact
        ? { position: "relative", width: "100%", height: "68vh" }
        : { position: "relative", width: "min(1100px, 100%)", maxHeight: "82vh", aspectRatio: "16/10" }}>
        {urls[item.id] ? (
          isVideo(item) ? (
            <video src={urls[item.id]} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", background: "#05080F", borderRadius: R.md }} />
          ) : (
            <img src={urls[item.id]} alt={item.file_name} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#05080F", borderRadius: R.md }} />
          )
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: T.muted, ...TYPE.bodySm }}>Loading…</span>
          </div>
        )}
        {items.length > 1 && (
          <>
            <button className="pmo-focusable" onClick={() => onNav(-1)} title="Previous"
              style={navBtnStyle("left")}><ChevronLeft size={20} color="#fff" /></button>
            <button className="pmo-focusable" onClick={() => onNav(1)} title="Next"
              style={navBtnStyle("right")}><ChevronRight size={20} color="#fff" /></button>
          </>
        )}
      </div>

      <div style={{ position: "fixed", top: 18, right: 20, display: "flex", gap: 8 }}>
        <button className="pmo-focusable" onClick={() => onDownload(item)} title="Download" style={chipStyle}>
          <Download size={14} color="#fff" />
        </button>
        <button className="pmo-focusable" onClick={onClose} title="Close (Esc)" style={chipStyle}>
          <X size={14} color="#fff" />
        </button>
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 18, textAlign: "center" }}>
        <div style={{ ...TYPE.bodySm, color: "#fff", marginBottom: 6 }}>
          {item.projects?.name} · {item.projects?.campus} · {relTime(item.uploaded_at)}
        </div>
        <button className="pmo-focusable pmo-btn" onClick={() => onViewProject(item.project_id)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px",
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
            borderRadius: R.pill, color: "#fff", ...TYPE.caption, cursor: "pointer" }}>
          View Project <ArrowUpRight size={11} />
        </button>
      </div>
    </div>
  );
}

const chipStyle = {
  width: 32, height: 32, borderRadius: R.sm, cursor: "pointer",
  background: "rgba(8,16,32,.72)", border: "1px solid rgba(255,255,255,.16)",
  display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
};
const navBtnStyle = (side) => ({
  position: "absolute", top: "50%", [side]: -52, transform: "translateY(-50%)",
  width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
  background: "rgba(8,16,32,.72)", border: "1px solid rgba(255,255,255,.16)",
  display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
});
