// ─────────────────────────────────────────────────────────────────────────────
//  TOUR TRACKING
//
//  Who was offered the tour, who took it, and where they stopped.
//
//  Before this, the tour wrote three columns on the user's own profile row:
//  offered, last step, completed. Two of them were never written, so a user who
//  quit at step 3 looked identical to one who never opened it. Worse, every
//  write showed up in the audit log as "User X updated", which reads like
//  somebody edited an account.
//
//  Events go to their own table instead, one row each. Nothing here is allowed
//  to interrupt the tour: every call is fire-and-forget, and a failed write is
//  swallowed. A missing row in a usage report is a far smaller problem than a
//  tour that breaks halfway because the network hiccuped.
// ─────────────────────────────────────────────────────────────────────────────

let ctx = null;

/** Called once after sign-in. */
export function initTourTracking({ supa, token, userId, device }) {
  ctx = { supa, token, userId, device };
}

export function endTourTracking() { ctx = null; }

/**
 * event: offered | declined | started | step | completed | abandoned
 * at:    { stepIndex, stepTotal, section, stepTitle, sessionId }
 */
export function tourEvent(event, at = {}) {
  if (!ctx?.token || !ctx.userId) return;
  const row = {
    user_id:    ctx.userId,
    session_id: at.sessionId ?? null,
    event,
    step_index: at.stepIndex ?? null,
    step_total: at.stepTotal ?? null,
    section:    at.section ?? null,
    step_title: at.stepTitle ?? null,
    device:     ctx.device ?? null,
  };
  try {
    ctx.supa("/rest/v1/tour_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    }, ctx.token).catch(() => {});
  } catch { /* never let tracking break the tour */ }
}
