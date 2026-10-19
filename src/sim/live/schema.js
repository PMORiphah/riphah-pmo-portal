// PMO Simulation (live data): the snapshot allow-list. PUBLIC, no data.
// Owner: B1. Spec: contract §B.1
//
// Column spec "name:type[:policy]".
//   types  u uuid string · t text · e enum text · n number (numeric/int/bigint) · b boolean
//          d date "YYYY-MM-DD" · ts timestamp ISO string · j jsonb (object or array)
//   null is accepted for every column except the table's key columns (KEYS). A column that is not
//   listed is never sent: snapshot.js drops it (tables and recorded responses alike) and validate.js
//   refuses a hand-over that carries one (e.g. user_profiles.secondary_email, past_project_summary.pm_email).
//   policy (applied in the portal tab by snapshot.js, re-checked by validate.js in the sim tab)
//          mask    contact mask: when mask.contacts, a non-empty value becomes MASK[col]
//          null    always sent as null (not shown on toured screens)
//          path    project_attachments.file_path rewrite (site_visit → "sim-media/<key>", else "sim-unavailable/<id>")
//          body    kept only on rows of the plan's thread (comments: plan.updates.projectId;
//                  past_project_updates: plan.past.id), else null
//          figures kept only on plan.report.id, else null; the top risks' mitigation texts are
//                  emptied (mitigation_plan has the null policy)
//   free text (TEXT_COLUMNS): email addresses and phone numbers inside it become TEXT_MASK
export const MASK = Object.freeze({ email: "hidden for the presentation", phone: "hidden" });

// Contact details inside free text (message bodies, notes): replaced in the portal tab before the
// plan is worked out (snapshot.js), refused by validate.js if one is left. Email addresses, numbers
// dialled with + or 00, and national numbers of 10-11 digits (0300-1234567, 051-1234567).
export const TEXT_MASK = Object.freeze({ email: "(email hidden)", phone: "(phone hidden)" });
export const TEXT_COLUMNS = Object.freeze(["body", "notes", "note", "reason_open"]);
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0\d{2,3}[\s-]?\d{7,8}\b|\b03\d{2}[\s-]\d{3}[\s-]?\d{4}\b/g;
/** The text with every email address and phone number replaced by TEXT_MASK. */
export function scrubContacts(s) {
  if (typeof s !== "string" || !s) return s;
  return s.replace(EMAIL_IN_TEXT, TEXT_MASK.email).replace(PHONE_IN_TEXT, TEXT_MASK.phone);
}
/** True when the text still holds an email address or a phone number. */
export function hasContact(s) {
  if (typeof s !== "string" || !s) return false;
  EMAIL_IN_TEXT.lastIndex = 0; PHONE_IN_TEXT.lastIndex = 0;
  const hit = EMAIL_IN_TEXT.test(s) || PHONE_IN_TEXT.test(s);
  EMAIL_IN_TEXT.lastIndex = 0; PHONE_IN_TEXT.lastIndex = 0;
  return hit;
}
/** A free-text column whose contact details are scrubbed (type t, named in TEXT_COLUMNS). */
export const isTextColumn = (c) => !!c && c.type === "t" && TEXT_COLUMNS.includes(c.name);

export const SETTINGS_KEYS = Object.freeze(["dashboard_kpis", "dashboard_breakdowns", "dashboard_title", "fiscal_year",
  "about_us", "team_config", "contact_info"]);

const PD = "total_projects:n,pdd_not_submitted_count:n,identified_count:n,pdds_submitted:n,in_df:n,in_ed:n,in_mt:n,approved_count:n,"
  + "closed_count:n,on_time_count:n,delayed_count:n,over_budget_count:n,scope_change_count:n,carry_forward_count:n,carry_forward_amount:n,"
  + "payments_pending_count:n,payments_pending_amount:n,su_requested_total:n,df_recommended_total:n,approved_total:n,budget_reduction:n,"
  + "total_capex:n,budget_consumed:n,budget_remaining:n,payments_made_total:n,total_ev:n,total_pv:n,total_ac:n,portfolio_cpi:n,"
  + "portfolio_spi:n,portfolio_health:t,reporting_progress_count:n";
const PROJ = "id:u,code:t,name:t,sector_id:u,region_id:u,segment_id:u,cost_center_id:u,project_type:t,priority:e,workflow_stage:e,"
  + "su_requested_amount:n,df_recommended_amount:n,bac:n,amount_released:n,payments_made:n,is_carry_forward:b,payments_pending:b,"
  + "start_date:d,end_date:d,duration_months:n,pct_complete:n,manual_schedule_flag:e,manual_budget_flag:e,notes:t,created_at:ts,"
  + "updated_at:ts,fiscal_year:t,strategic_priority:t,actual_start_date:d,actual_end_date:d,budget_release_date:d,scope_change:b,"
  + "campus:t,campus_id:u,portfolio:t,actual_cost:n,pcd_received_date:d";
const PM = "id:u,code:t,name:t,sector_id:u,region_id:u,segment_id:u,cost_center_id:u,project_type:t,priority:e,workflow_stage:e,"
  + "su_requested_amount:n,df_recommended_amount:n,bac:n,amount_released:n,payments_made:n,is_carry_forward:b,payments_pending:b,"
  + "start_date:d,end_date:d,actual_start_date:d,actual_end_date:d,effective_start:d,duration_months:n,pct_complete:n,scope_change:b,"
  + "earned_value:n,time_elapsed_fraction:n,planned_value:n,cpi:n,spi:n,eac:n,cost_variance:n,schedule_variance:n,schedule_flag:e,"
  + "budget_flag:e,manual_schedule_flag:e,manual_budget_flag:e,notes:t,created_at:ts,updated_at:ts,fiscal_year:t,strategic_priority:t,"
  + "budget_release_date:d,portfolio:t,actual_cost:n";
const TASK = "id:u,{fk}:u,parent_id:u,name:t,owner:t,start_date:d,end_date:d,baseline_start:d,baseline_end:d,pct_complete:n,"
  + "is_milestone:b,status:t,notes:t,sort_order:n,predecessor_id:u,created_by:u,created_at:ts,updated_at:ts";
const ROLLUP = "{fk}:u,task_count:n,milestone_count:n,tasks_start:d,tasks_end:d,baseline_start:d,baseline_end:d,last_updated:ts,weighted_pct:n";

// rows: row cap; filter: fixed PostgREST filter; order: only where the stored order must be the
// screen's (else natural server order, no order parameter); plan: filter filled from the plan
// (the table is [] when the plan field is null); synthetic: not a real read (see snapshot.js).
export const TABLES = Object.freeze({
  portfolio_dashboard: { cols: PD, rows: 1 },
  investment_metrics: { cols: "total_projects:n,su_requested_total:n,df_recommended_total:n,approved_total:n,released_total:n,payments_made_total:n,approved_count:n", rows: 1 },
  settings: { cols: "key:t,value:j,updated_at:ts", filter: `key=in.(${SETTINGS_KEYS.join(",")})`, rows: 7 },
  projects: { cols: PROJ, rows: 1000 },
  project_metrics: { cols: PM, rows: 1000 },
  campuses: { cols: "id:u,name:t,sort_order:n", rows: 200 },
  sectors: { cols: "id:u,name:t,sort_order:n", rows: 200 },
  regions: { cols: "id:u,name:t,sort_order:n", rows: 200 },
  segments: { cols: "id:u,name:t,sort_order:n", rows: 200 },
  cost_centers: { cols: "id:u,code:t,name:t,sort_order:n", rows: 500 },
  project_assignments: { cols: "id:u,user_id:u,project_id:u,assigned_by:u,assigned_at:ts", rows: 2000 },
  user_profiles: { cols: "id:u,username:t,full_name:t,email:t:mask,role:e,is_active:b,created_at:ts,updated_at:ts,phone:t:mask,whatsapp_opt_in:b", order: "role.asc,username.asc", rows: 300 },
  carry_forward_projects: { cols: "id:u,code:t,region:t,name:t,amount:n,status:t,created_at:ts", rows: 1000 },
  project_cashflows: { cols: "id:u,project_id:u,project_name:t,campus:t,sector:t,organization:t,cost_centre:t,project_type:t,priority:t,month:d,amount:n,bucket:e,planned_start:d,planned_end:d,source_row:n,created_by:u,created_at:ts", rows: 5000 },
  project_risks_scored: { cols: "id:u,project_id:u,title:t,description:t:null,category:e,probability:e,impact:e,status:e,owner:t,mitigation_plan:t:null,date_identified:d,date_last_reviewed:d,created_by:u,created_by_name:t,created_at:ts,updated_at:ts,project_name:t,project_code:t,project_campus:t,severity:t", order: "date_identified.desc", rows: 2000 },
  project_risks: { cols: "id:u,project_id:u,status:e", rows: 2000 },
  project_deliverables: { cols: "id:u,project_id:u,status:t,confirmed:b,superseded:b", rows: 5000 },
  epdd_pdds: { cols: "id:n,pdd_number:t,epdd_status:t,linked_project_id:u,is_history:b,seen_at:ts,queue:t", rows: 2000 },
  project_raci: { cols: "id:u,project_id:u,raci_role:e,user_id:u,person_name:t,person_title:t,sort_order:n,created_by:u,created_at:ts,updated_at:ts", plan: "project_id=eq.{storyId}", rows: 200 },
  project_tasks: { cols: TASK.replace("{fk}", "project_id"), plan: "project_id=eq.{storyId}", rows: 2000 },
  project_task_rollup: { cols: ROLLUP.replace("{fk}", "project_id"), rows: 1000 },
  project_attachments: { cols: "id:u,project_id:u,file_name:t,file_path:t:path,file_size:n,mime_type:t,uploaded_by:u,uploaded_by_name:t,uploaded_at:ts,kind:t,sort_order:n", rows: 2000 },
  comments: { cols: "id:u,project_id:u,parent_id:u,author_id:u,author_name:t,author_role:e,body:t:body,is_read_by_pmo:b,created_at:ts,updated_at:ts", rows: 5000 },
  comment_reads: { cols: "user_id:u,comment_id:u,read_at:ts", rows: 20000 },
  past_project_summary: { cols: "id:u,code:t,name:t,campus:t,fiscal_year:t,approved_amount:n,released_amount:n,pm_user_id:u,status:e,reason_open:t,notes:t,last_followed_up:d,created_by:u,created_at:ts,updated_at:ts,pm_name:t,update_count:n,last_update_at:ts,last_update_role:e,days_since_followup:n,start_date:d,end_date:d,actual_start_date:d,actual_end_date:d,revised_end_date:d,budget_release_date:d", rows: 1000 },
  past_projects: { cols: "id:u,campus:t,status:e,pm_user_id:u", rows: 1000 },
  past_project_updates: { cols: "id:u,past_project_id:u,author_id:u,author_name:t,author_role:e,body:t:body,created_at:ts", rows: 5000 },
  past_pm_messages: { cols: "id:u,pm_user_id:u,past_project_id:u,author_id:u,author_name:t,author_role:e,body:t:null,created_at:ts", rows: 5000 },
  past_chat_reads: { cols: "user_id:u,thread:t,read_at:ts", rows: 5000 },
  past_project_task_rollup: { cols: ROLLUP.replace("{fk}", "past_project_id"), rows: 1000 },
  past_project_tasks: { cols: TASK.replace("{fk}", "past_project_id"), plan: "past_project_id=eq.{pastId}", rows: 2000 },
  board_reports: { cols: "id:u,period:d,title:t,kind:t,status:t,as_at:ts,figures:j:figures,calc_version:t,note:t,created_by:u,created_at:ts,published_by:u,published_at:ts,updated_at:ts", filter: "status=neq.discarded", rows: 500 },
  board_report_recipients: { cols: "report_id:u,user_id:u,added_by:u,added_at:ts,removed:b,seen_at:ts,pushed_at:ts,emailed_at:ts", rows: 5000 },
  // Only the newest timestamp (TopBar freshness). snapshot.js reads
  // "activity_log?select=created_at&order=created_at.desc&limit=1" and stores [{ id: 1, created_at }].
  activity_log: { cols: "id:n,created_at:ts", synthetic: true, rows: 1 },
});

// Key columns (never null; used by the backend engine and the validator).
export const KEYS = Object.freeze({ settings: ["key"], comment_reads: ["user_id", "comment_id"], past_chat_reads: ["user_id", "thread"],
  board_report_recipients: ["report_id", "user_id"], portfolio_dashboard: [], investment_metrics: [],
  project_task_rollup: ["project_id"], past_project_task_rollup: ["past_project_id"] });
export const keysOf = (t) => KEYS[t] || ["id"];

/** [{ name, type, policy }] for a table (null for a table outside the allow-list). */
export function columnsOf(table) {
  const t = TABLES[table];
  if (!t) return null;
  return t.cols.split(",").map((s) => { const [name, type, policy] = s.split(":"); return { name, type, policy: policy || null }; });
}

/** The exact GET path snapshot.js uses for a table read (plan placeholders filled from `ids`). */
export function tablePath(table, ids = {}) {
  const t = TABLES[table];
  if (!t) throw new Error("not in the allow-list: " + table);
  if (t.synthetic) return "/rest/v1/activity_log?select=created_at&order=created_at.desc&limit=1";
  let q = "select=" + columnsOf(table).map((c) => c.name).join(",");
  if (t.filter) q += "&" + t.filter;
  if (t.plan) {
    const m = /\{(\w+)\}/.exec(t.plan);
    const v = m ? ids[m[1]] : null;
    if (v == null) return null;                      // no plan subject: the table is []
    q += "&" + t.plan.replace(/\{(\w+)\}/, encodeURIComponent(v));
  }
  if (t.order) q += "&order=" + t.order;
  return `/rest/v1/${table}?${q}`;
}

// Size caps (validate.js; snapshot.js refuses to send above them).
export const CAPS = Object.freeze({
  totalJson: 6 * 1024 * 1024, tableJson: 1.5 * 1024 * 1024, responseJson: 1.5 * 1024 * 1024, responses: 200,
  string: 20000, jsonDepth: 12, figuresJson: 400 * 1024, messageJson: 2 * 1024 * 1024,
  mediaItem: 50 * 1024 * 1024, mediaTotal: 150 * 1024 * 1024, mediaCount: 200,
});
