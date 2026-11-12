import { useState } from "react";
import { Trophy, Target } from "lucide-react";
import { TYPE, SP, R, MOTION, BRAND } from "./theme.js";
import { useViewport } from "./ui.jsx";
import { PmoAchievementsView } from "./PmoAchievements.jsx";
import { PmoTasksPage } from "./PmoTasks.jsx";

/* Achievements/Goals tab (PMO, 12 Nov 2026; was "Tasks/Goals"). PMO only.
   A switch at the top: PMO Achievements (pmo_achievements) | PMO Goals (pmo_tasks).
   Opens on Achievements; the last choice is remembered in this browser. */
const KEY = "pmo-achievements-goals-view";
const readView = () => { try { return localStorage.getItem(KEY) === "goals" ? "goals" : "achievements"; } catch { return "achievements"; } };

export function AchievementsGoalsPage(props) {
  const { T } = props;
  const vp = useViewport();
  const [view, setView] = useState(readView);
  const pick = (v) => { setView(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };
  const items = [["achievements", "PMO Achievements", Trophy, BRAND.gold], ["goals", "PMO Goals", Target, BRAND.blueBright]];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.page }}>
      <div style={{ flexShrink: 0, display: "flex", justifyContent: vp.isCompact ? "stretch" : "flex-start", padding: vp.isCompact ? `${SP.sm}px ${SP.md}px 0` : `${SP.md}px ${SP.xl}px 0` }}>
        <div role="tablist" aria-label="Achievements or goals" data-ag-switch=""
          style={{ display: "flex", width: vp.isCompact ? "100%" : "auto", padding: 4, gap: 4, borderRadius: R.pill, background: T.card, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
          {items.map(([v, label, Icon, c]) => {
            const on = view === v;
            return (
              <button key={v} role="tab" aria-selected={on} data-ag-view={v} onClick={() => pick(v)} className="pmo-focusable pmo-btn"
                style={{ flex: vp.isCompact ? 1 : "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", cursor: "pointer",
                  padding: vp.isCompact ? "9px 10px" : "9px 20px", borderRadius: R.pill, ...TYPE.bodySm, fontWeight: 700,
                  background: on ? `linear-gradient(135deg, ${c}, ${c}cc)` : "transparent", color: on ? "#fff" : T.muted,
                  boxShadow: on ? `0 6px 16px -6px ${c}` : "none", transition: `all ${MOTION.base}` }}>
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>
      </div>
      {view === "achievements" ? <PmoAchievementsView {...props} /> : <PmoTasksPage {...props} />}
    </div>
  );
}
