import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { X, RotateCcw, Loader2 } from "lucide-react";
import { TYPE, SP, R, MOTION } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PORTFOLIO CONSTELLATION

   Every CAPEX project as a node in 3D space: size by DF-recommended value,
   colour by approval stage, gathered into three clusters by sector —
   Academics, Management, Healthcare, the same three the dashboard's own "By
   Segment" cards already use. A Guest sees all 109; a PM's own RLS-scoped
   read naturally narrows this to their assigned projects, with no special
   casing needed here.

   OrbitControls isn't available for the three@0.128 build in this
   environment, so rotate/zoom are hand-rolled: drag to orbit, wheel to
   dolly. Idle auto-rotation runs when nothing is being dragged, and stops
   entirely under prefers-reduced-motion — drag still works either way.

   Node positions are seeded from each project's id, not random per render,
   so the shape is stable — reopening the page shows the same constellation,
   not a reshuffled one.
   ═══════════════════════════════════════════════════════════════════════════ */

const SECTOR_ANCHORS = {
  Academics:  new THREE.Vector3(-2.1,  0.6,  0),
  Management: new THREE.Vector3( 2.0, -0.5,  1.1),
  Healthcare: new THREE.Vector3( 0.3,  1.3, -1.6),
};
const DEFAULT_ANCHOR = new THREE.Vector3(0, 0, 0);

const STAGE_COLOR = {
  pdd_not_submitted: 0x54708c,  // T.dim — nothing has happened yet
  identified:         0x4a9be0, // informational blue
  pdds_submitted:      0x4a9be0,
  df_review:          0xe8a63c, // amber — in motion
  ed_review:          0xe8a63c,
  mt_review:          0xe0a94a, // gold — closest to sanctioned
  approved:            0x22c4a8, // teal — the portal's "healthy/released" colour
  closed:              0x22c4a8,
};
const STAGE_LABEL = {
  pdd_not_submitted: "PDD Not Submitted", identified: "PDD Submitted",
  pdds_submitted: "PDD Submitted", df_review: "DF Review", ed_review: "ED Review",
  mt_review: "MT Review", approved: "Approved", closed: "Closed",
};

// A tiny deterministic PRNG seeded from the project id, so layout is stable
// across reloads without needing to persist positions anywhere.
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  return function () {
    h = (Math.imul(h, 1103515245) + 12345) | 0;
    return ((h >>> 1) % 100000) / 100000;
  };
}

const fmtM = (n) => (n / 1e6).toFixed(1) + "M";

export function ConstellationPage({ T, session, supa, onSelectProject }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});   // three.js objects that must survive re-renders untouched
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [count, setCount] = useState(0);
  const [hoverInfo, setHoverInfo] = useState(null);   // {x, y, name, code, value, stage}
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const rows = await supa(
        "/rest/v1/projects?portfolio=eq.capex&select=id,code,name,workflow_stage,df_recommended_amount,sectors(name)",
        {}, session.access_token);
      return Array.isArray(rows) ? rows : [];
    } catch (e) { setErr(e.message); return []; }
  }, [supa, session]);

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    let raf = null;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0.6, 8.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.PointLight(0x8cc0ff, 1.1, 40);
    key.position.set(6, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0xe0a94a, 0.5, 40);
    rim.position.set(-6, -3, -6);
    scene.add(rim);

    // A faint starfield — depth cue, and it makes the whole thing feel like
    // it's floating in something rather than sitting on a flat background.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 40;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 10;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.35 })));

    const group = new THREE.Group();   // everything that rotates together
    scene.add(group);

    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();
    let nodeMeshes = [];
    let hovered = null;

    const nodeGeo = new THREE.SphereGeometry(1, 20, 20);   // scaled per-instance

    stateRef.current = { scene, camera, renderer, group };

    (async () => {
      const rows = await fetchProjects();
      if (disposed) return;
      setCount(rows.length);

      const values = rows.map(p => Math.max(0, parseFloat(p.df_recommended_amount) || 0));
      const maxV = Math.max(1, ...values);
      // sqrt scaling: linear-by-value would make a handful of large projects
      // swallow the whole scene, and everything else vanish to specks.
      const sizeOf = (v) => 0.05 + Math.sqrt(v / maxV) * 0.22;

      rows.forEach((p) => {
        const sectorName = p.sectors?.name;
        const anchor = SECTOR_ANCHORS[sectorName] || DEFAULT_ANCHOR;
        const rnd = seededRandom(p.id);
        const r = 1.0 + rnd() * 1.15;
        const theta = rnd() * Math.PI * 2;
        const phi = Math.acos(2 * rnd() - 1);
        const pos = new THREE.Vector3(
          anchor.x + r * Math.sin(phi) * Math.cos(theta),
          anchor.y + r * Math.sin(phi) * Math.sin(theta) * 0.7,
          anchor.z + r * Math.cos(phi)
        );

        const v = Math.max(0, parseFloat(p.df_recommended_amount) || 0);
        const color = STAGE_COLOR[p.workflow_stage] ?? 0x54708c;
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.38,
          roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.94,
        });
        const mesh = new THREE.Mesh(nodeGeo, mat);
        mesh.position.copy(pos);
        const s = sizeOf(v);
        mesh.scale.setScalar(s);
        mesh.userData = { project: p, baseScale: s };
        group.add(mesh);
        nodeMeshes.push(mesh);
      });

      setLoading(false);
    })();

    // ── Hand-rolled orbit: drag to rotate the group, wheel to dolly camera.
    // OrbitControls is not importable for three@0.128 in this build. ──────
    let dragging = false, lastX = 0, lastY = 0;
    let velX = 0.0016, velY = 0;   // idle auto-rotation speed
    const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      const rect = mount.getBoundingClientRect();
      mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        group.rotation.y += dx * 0.006;
        group.rotation.x = Math.max(-0.9, Math.min(0.9, group.rotation.x + dy * 0.004));
        lastX = e.clientX; lastY = e.clientY;
        velX = dx * 0.00025;   // carries a little momentum into idle spin
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(4, Math.min(16, camera.position.z + e.deltaY * 0.01));
    };
    mount.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    mount.addEventListener("pointermove", onMove);
    mount.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const tick = () => {
      if (disposed) return;
      if (!dragging) {
        group.rotation.y += reduced ? 0 : velX;
        velX *= 0.985;   // momentum decays back to a slow steady drift, never fully stops unless reduced-motion
        if (!reduced && Math.abs(velX) < 0.0009) velX = 0.0009;
      }

      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObjects(nodeMeshes);
      if (hits.length) {
        const m = hits[0].object;
        if (hovered !== m) {
          if (hovered) hovered.scale.setScalar(hovered.userData.baseScale);
          hovered = m;
          m.scale.setScalar(m.userData.baseScale * 1.35);
          const p = m.userData.project;
          const screenPos = m.position.clone().project(camera);
          const rect = mount.getBoundingClientRect();
          setHoverInfo({
            x: rect.left + (screenPos.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-screenPos.y * 0.5 + 0.5) * rect.height,
            name: p.name, code: p.code, id: p.id,
            value: parseFloat(p.df_recommended_amount) || 0,
            stage: p.workflow_stage,
          });
        } else {
          // keep the tooltip glued to the node as the scene rotates
          const screenPos = m.position.clone().project(camera);
          const rect = mount.getBoundingClientRect();
          setHoverInfo((h) => h && ({ ...h,
            x: rect.left + (screenPos.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-screenPos.y * 0.5 + 0.5) * rect.height }));
        }
      } else if (hovered) {
        hovered.scale.setScalar(hovered.userData.baseScale);
        hovered = null;
        setHoverInfo(null);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onClick = () => {
      if (hovered) onSelectProject?.(hovered.userData.project.id);
    };
    mount.addEventListener("click", onClick);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      mount.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      mount.removeEventListener("pointermove", onMove);
      mount.removeEventListener("wheel", onWheel);
      mount.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      nodeMeshes.forEach((m) => m.material.dispose());
      nodeGeo.dispose();
      starGeo.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [fetchProjects, onSelectProject, reduced]);

  const resetView = () => {
    const s = stateRef.current;
    if (!s.camera || !s.group) return;
    s.camera.position.set(0, 0.6, 8.5);
    s.group.rotation.set(0, 0, 0);
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${SP.md}px ${SP.xl}px`, display: "flex", alignItems: "baseline",
        justifyContent: "space-between", flexWrap: "wrap", gap: SP.sm }}>
        <div>
          <div style={{ ...TYPE.h2, color: T.text }}>Portfolio Constellation</div>
          <div style={{ ...TYPE.caption, color: T.muted, marginTop: 2 }}>
            {loading ? "Loading…" : `${count} projects · size by value, colour by stage, grouped by sector`}
          </div>
        </div>
        <button className="pmo-focusable pmo-btn" onClick={resetView}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px",
            background: "transparent", border: `1px solid ${T.border}`, borderRadius: R.sm,
            color: T.textSoft, ...TYPE.bodySm, cursor: "pointer" }}>
          <RotateCcw size={12} /> Reset view
        </button>
      </div>

      <div ref={mountRef} style={{ flex: 1, minHeight: 0, position: "relative", cursor: "grab" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, color: T.muted, ...TYPE.bodySm }}>
            <Loader2 size={16} className="pmo-awaiting" /> Building the constellation…
          </div>
        )}
        {err && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", color: T.textOf(T.danger), ...TYPE.bodySm }}>{err}</div>
        )}

        {/* Legend — glass panel, same treatment as every other floating panel
            in the portal. */}
        <div style={{ position: "absolute", left: SP.lg, bottom: SP.lg, zIndex: 2,
          background: T.surfaceOver, border: `1px solid ${T.borderStrong}`, borderRadius: R.md,
          padding: `${SP.sm}px ${SP.md}px`, backdropFilter: "blur(14px) saturate(150%)",
          WebkitBackdropFilter: "blur(14px) saturate(150%)", boxShadow: T.shadow, pointerEvents: "none" }}>
          <div style={{ ...TYPE.label, color: T.muted, marginBottom: 6 }}>Stage</div>
          {Object.entries(STAGE_LABEL).filter(([k]) => STAGE_COLOR[k] !== undefined)
            .filter((v, i, arr) => arr.findIndex(x => x[1] === v[1]) === i)
            .map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%",
                  background: `#${STAGE_COLOR[key].toString(16).padStart(6, "0")}` }} />
                <span style={{ ...TYPE.caption, color: T.textSoft }}>{label}</span>
              </div>
            ))}
          <div style={{ ...TYPE.caption, color: T.dim, marginTop: 6, paddingTop: 6,
            borderTop: `1px solid ${T.border}` }}>Drag to rotate · scroll to zoom · click a node to open it</div>
        </div>

        {/* Hover tooltip, screen-space positioned from the projected 3D point. */}
        {hoverInfo && (
          <div style={{ position: "fixed", left: hoverInfo.x + 14, top: hoverInfo.y - 10, zIndex: 3,
            background: T.surfaceOver, border: `1px solid ${T.borderStrong}`, borderRadius: R.sm,
            padding: "8px 12px", backdropFilter: "blur(14px) saturate(150%)",
            WebkitBackdropFilter: "blur(14px) saturate(150%)", boxShadow: T.shadow,
            pointerEvents: "none", maxWidth: 260 }}>
            {hoverInfo.code && hoverInfo.code !== "-" && (
              <div style={{ ...TYPE.mono, fontSize: 10, color: T.dim, marginBottom: 2 }}>{hoverInfo.code}</div>
            )}
            <div style={{ ...TYPE.bodySm, fontWeight: 700, color: T.text }}>{hoverInfo.name}</div>
            <div style={{ ...TYPE.caption, color: T.textSoft, marginTop: 3 }}>
              {STAGE_LABEL[hoverInfo.stage] || hoverInfo.stage} · PKR {fmtM(hoverInfo.value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
