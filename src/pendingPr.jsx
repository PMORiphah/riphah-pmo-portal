// Open "Pending PR" tasks from Tasks/Goals (PMO, 12 Nov 2026) → red badge next to the project, PMO only
// (pmo_tasks RLS returns nothing to anyone else, and callers only ask for the PMO).
// Shape: { projects: { [project id]: n }, past: { [past project id]: n }, done: { projects, past } } (open counts at the top).
export async function loadPendingPrs(supa, token) {
  const r = await supa("/rest/v1/pmo_tasks?list=eq.pending_pr&removed=eq.false&select=project_id,past_project_id,done", {}, token).catch(() => []);
  const out = { projects: {}, past: {}, done: { projects: {}, past: {} } };
  (Array.isArray(r) ? r : []).forEach((t) => {
    const o = t.done ? out.done : out;   // ticked PRs (13 Nov 2026): the project's PRs tab shows once there is one
    if (t.project_id) o.projects[t.project_id] = (o.projects[t.project_id] || 0) + 1;
    if (t.past_project_id) o.past[t.past_project_id] = (o.past[t.past_project_id] || 0) + 1;
  });
  return out;
}
export const EMPTY_PRS = { projects: {}, past: {}, done: { projects: {}, past: {} } };

// The red badge itself. n > 1 shows "×n". Renders nothing when n is 0.
export function PendingPrBadge({ T, n, style }) {
  if (!n) return null;
  const c = "#E5484D";
  return (
    <span data-pending-pr="" title={n > 1 ? `${n} pending PRs (Tasks/Goals)` : "Pending PR (Tasks/Goals)"} style={{
      fontFamily: "inherit", fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", lineHeight: 1.5, whiteSpace: "nowrap", flexShrink: 0,
      padding: "0 6px", borderRadius: 4, background: c, color: "#fff", boxShadow: `0 0 0 1px ${c}, 0 2px 8px -2px ${c}aa`, cursor: "help", ...style }}>
      Pending PR{n > 1 ? ` ×${n}` : ""}
    </span>
  );
}
