// Activity Log helpers (PMO, 5 Oct 2026): the expandable detail of one entry
// (which fields changed, old → new), bursts of identical actions folded into
// one row (an import of 56 past projects is one line, not 56), and the emails
// and pushes from notifications_log shown in the same feed.
import { TYPE, R } from "./theme.js";

const FIELD_LABELS = {
  name: "Name", code: "Code", campus: "Campus", campus_id: "Campus",
  workflow_stage: "Stage", portfolio: "Portfolio", bucket: "Bucket",
  bac: "Approved budget", amount_released: "Released", df_recommended_amount: "DF Recommended",
  su_requested_amount: "SU Requested", budget_release_date: "Budget release date",
  planned_start: "Planned start", planned_end: "Planned end", start_date: "Start", end_date: "Finish",
  actual_start_date: "Actual start", actual_end_date: "Actual end", revised_end_date: "Revised finish",
  pcd_received_date: "PCD received", pct_complete: "% complete", strategic_priority: "Strategic priority",
  priority: "Priority", project_type: "Type", cost_center_id: "Cost centre", cost_centre: "Cost centre",
  segment_id: "Organisation", sector_id: "Sector", region_id: "Region", fiscal_year: "Fiscal year",
  pm_user_id: "Project manager", user_id: "User", project_id: "Project", past_project_id: "Past project",
  approved_amount: "Approved", released_amount: "Released", status: "Status", reason_open: "Reason open",
  notes: "Notes", description: "Description", title: "Title", body: "Message", amount: "Amount",
  month: "Month", probability: "Probability", impact: "Impact", category: "Category", owner: "Owner",
  mitigation_plan: "Mitigation", raci_role: "RACI role", person_name: "Person", person_title: "Title",
  file_name: "File", file_size: "Size", kind: "Kind", role: "Role", username: "Username",
  full_name: "Full name", email: "Email", is_active: "Active", notify_email: "Email alerts",
  linked_project_id: "Linked CAPEX project", link_source: "Linked by", seen_at: "Opened",
  queue: "E-PDD queue", epdd_status: "E-PDD status", grand_total: "Grand total", device_label: "Device",
  value: "Value", sub: "Subtitle", insight: "Insight", label: "Label",
  su_requested: "SU Requested card", df_recommended: "DF Recommended card",
  carry_forward: "Carry Forward card", budget_reduction: "Budget Reduction card",
};
// Never worth showing in a detail panel.
const SKIP = new Set(["id", "created_at", "updated_at", "created_by", "uploaded_by", "captured_by",
  "label", "changed", "search_vector", "content_hash", "file_path", "sort_order", "source_row"]);

export const fieldLabel = (k) => FIELD_LABELS[k]
  || String(k).replace(/_id$/, "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /amount|bac|total|value_pkr|released|approved/;

export function fmtValue(k, v, names) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || (typeof v === "string" && MONEY.test(k) && /^-?\d+(\.\d+)?$/.test(v))) {
    const n = Number(v);
    return MONEY.test(k) ? `PKR ${Math.round(n).toLocaleString("en-US")}` : n.toLocaleString("en-US");
  }
  if (typeof v === "string") {
    if (UUID.test(v)) return names?.get(v) || "(another record)";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v))
      return new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (/^\d{4}-\d{2}-\d{2}T/.test(v))
      return new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return v.length > 400 ? v.slice(0, 400) + "…" : v;
  }
  if (Array.isArray(v)) return v.length > 6 ? `${v.length} items` : v.map(x => fmtValue(k, x, names)).join(", ");
  // A KPI card or other small object: show its own fields, one level deep.
  const parts = Object.entries(v).filter(([kk]) => kk !== "list")
    .map(([kk, vv]) => `${fieldLabel(kk)}: ${typeof vv === "object" && vv ? "…" : fmtValue(kk, vv, names)}`);
  if (Array.isArray(v.list)) parts.push(`List: ${v.list.length} rows`);
  return parts.join(" · ") || "—";
}

// The rows of the detail panel: changed fields for an update, the record's
// fields for an add or delete.
export function detailRows(e, names) {
  const d = e.details;
  if (!d || typeof d !== "object") return [];
  if (d.old && d.new && typeof d.old === "object") {
    const keys = Array.isArray(d.changed) ? d.changed
      : [...new Set([...Object.keys(d.old), ...Object.keys(d.new)])]
          .filter(k => JSON.stringify(d.old[k]) !== JSON.stringify(d.new[k]));
    return keys.filter(k => !SKIP.has(k)).map(k => ({
      k, label: fieldLabel(k), from: fmtValue(k, d.old[k], names), to: fmtValue(k, d.new[k], names),
    }));
  }
  return Object.entries(d)
    .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    .slice(0, 24)
    .map(([k, v]) => ({ k, label: fieldLabel(k), value: fmtValue(k, v, names) }));
}

export function ActivityDetails({ T, entry, names }) {
  const rows = detailRows(entry, names);
  if (!rows.length) {
    return <div style={{ ...TYPE.caption, color: T.dim }}>No further detail was recorded for this entry.</div>;
  }
  const change = rows[0].from !== undefined;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, max-content) 1fr", gap: "6px 14px",
      fontSize: 12, lineHeight: 1.5 }}>
      {rows.map(r => (
        <div key={r.k} style={{ display: "contents" }}>
          <div style={{ color: T.muted, fontWeight: 600 }}>{r.label}</div>
          {change ? (
            <div style={{ color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>
              <span style={{ color: T.dim, textDecoration: "line-through", textDecorationColor: `${T.dim}80` }}>{r.from}</span>
              <span style={{ color: T.muted, margin: "0 6px" }}>→</span>
              <span style={{ fontWeight: 600 }}>{r.to}</span>
            </div>
          ) : (
            <div style={{ color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>{r.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// Consecutive entries by the same person, same action, same kind of record,
// each within two minutes of the next, fold into one row when there are 3+.
export function groupBursts(list) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3) out.push({ ...run[0], id: `burst-${run[0].id}`, _burst: run });
    else out.push(...run);
    run = [];
  };
  for (const e of list) {
    const p = run[run.length - 1];
    const same = p && !e._tourUser && e.action !== "login" && e.action !== "import"
      && p.actor_name === e.actor_name && p.action === e.action && p.entity_type === e.entity_type
      && Math.abs(new Date(p.created_at) - new Date(e.created_at)) <= 120000;
    if (!same) flush();
    run.push(e);
  }
  flush();
  return out;
}

const PLURAL = {
  projects: "projects", past_projects: "past projects", project_cashflows: "cash-flow rows",
  project_risks: "risks", project_attachments: "files", project_raci: "RACI entries",
  carry_forward_projects: "carry-forward rows", project_assignments: "assignments",
  project_tasks: "tasks", past_project_tasks: "past-project tasks", comments: "updates",
  past_project_updates: "follow-ups", past_pm_messages: "chat messages", settings: "settings",
  epdd_pdds: "PDDs", notification: "notifications", user_profiles: "users",
  lessons_learned: "lessons", benefits_realized: "benefits",
};
const VERB = {
  created: "added", updated: "updated", deleted: "deleted", stage_changed: "moved stage",
  assigned: "assigned", unassigned: "unassigned", uploaded: "uploaded", commented: "posted",
  pdd_received: "arrived from E-PDD", pdd_status: "changed status on E-PDD", pdd_opened: "opened",
  pdd_linked: "linked", notify_sent: "sent", notify_failed: "failed", notify_skipped: "skipped",
};
export const burstSummary = (e) =>
  `${e._burst.length} ${PLURAL[e.entity_type] || e.entity_type} ${VERB[e.action] || e.action.replace(/_/g, " ")}`;

// notifications_log → feed entries.
const CHANNEL = {
  email: "Update email", push: "Push", "email-digest": "9 am digest email", email_invite: "Invitation email",
  password_reset: "Password reset email", "epdd-email": "New PDD email", "epdd-push": "New PDD push",
  "past-pm-email": "Past projects chat email", "past-project-email": "Past project follow-up email",
  "epdd-health-push": "E-PDD sync alert (push)", "epdd-health-email": "E-PDD sync alert (email)",
};
export function notificationEntries(rows, who) {
  return (rows || []).map(n => {
    const u = who.get(n.recipient_id);
    const to = u?.full_name || u?.username || n.recipient_address || "someone";
    const ch = CHANNEL[n.channel] || n.channel;
    const extra = n.status !== "sent" ? ` (${n.status}${n.detail && !/^msg /.test(n.detail) ? `: ${n.detail}` : ""})` : "";
    return {
      id: `notif-${n.id}`, actor_name: null, actor_role: null, action: `notify_${n.status || "sent"}`,
      entity_type: "notification", entity_id: n.id, created_at: n.created_at,
      summary: `${ch} to ${to}${n.project_code ? ` · ${n.project_code}` : ""}${extra}`,
      details: { channel: ch, status: n.status, recipient: to, address: n.recipient_address,
                 project: n.project_code, note: n.detail },
    };
  });
}

export function BurstList({ T, entry, fmtTime }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto",
      borderRadius: R.sm }} className="pmo-scroll">
      {entry._burst.map(b => (
        <div key={b.id} style={{ display: "flex", gap: 10, fontSize: 12, lineHeight: 1.45 }}>
          <span style={{ color: T.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtTime(b.created_at)}</span>
          <span style={{ color: T.text, minWidth: 0, overflowWrap: "anywhere" }}>{b.summary || "—"}</span>
        </div>
      ))}
    </div>
  );
}
