// PMO Simulation: slot tokens and media rows. Pure ESM (browser and Node), no imports.
//
// The public data never holds a real person's name. Names stand as slot tokens and are filled at
// run time from the cast the PMO's signed-in portal tab hands over (see ./index.js):
//   {{C:C01}}  campus name          {{C:C01:say}} its spoken form      {{E:C01}} its E-PDD spelling
//   {{P:P12}}  PM full name         {{P:P12:short}} short form         {{P:P12:say}} spoken short form
//   {{T:head_pmo}} PMO team member name (keys: head_pmo manager_pmo deputy_pmo exec_pmo po1 po2)

export const TOKEN_RE = /\{\{([CEPT]):([A-Za-z0-9_]+)(?::(short|say))?\}\}/g;
export const TEAM_KEYS = ["head_pmo", "manager_pmo", "deputy_pmo", "exec_pmo", "po1", "po2"];
const LEFTOVER_RE = /\{\{[A-Z]:[^}]*\}\}/;

// Short and spoken forms when the cast gives none. Honorifics are dropped; a rank stays with the
// next word ("Col X" -> "Col X", spoken "Colonel X"); otherwise the first name.
const HONORIFIC = /^(mr|mrs|ms|miss|dr|engr|prof|syed|sayed|sayyid|hafiz|m|muhammad|mohammad)\.?$/i;
const RANK = { col: "Colonel", "col.": "Colonel", maj: "Major", "maj.": "Major", brig: "Brigadier", "brig.": "Brigadier",
  capt: "Captain", "capt.": "Captain", lt: "Lieutenant", "lt.": "Lieutenant", gen: "General", "gen.": "General" };
export function deriveShort(fullName) {
  const w = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  if (RANK[w[0].toLowerCase()] && w[1]) return `${w[0]} ${w[1]}`;
  const rest = w.length > 1 ? w.filter((x, i) => !(i < w.length - 1 && HONORIFIC.test(x))) : w;
  return rest[0] || w[0];
}
export function deriveSay(short) {
  const w = String(short || "").trim().split(/\s+/);
  const r = RANK[(w[0] || "").toLowerCase()];
  return r ? [r, ...w.slice(1)].join(" ") : String(short || "");
}

const teamName = (t) => (t && typeof t === "object" ? t.name : t);

function resolveString(s, cast) {
  if (typeof s !== "string" || s.indexOf("{{") < 0) return s;
  const out = s.replace(TOKEN_RE, (m, kind, slot, form) => {
    if (kind === "C" || kind === "E") {
      const c = cast.campuses?.[slot];
      if (!c || !c.name) throw new Error(`Simulation cast has no campus ${slot}`);
      if (kind === "E") return c.epdd || c.name;
      return form === "say" ? (c.say || c.name) : c.name;
    }
    if (kind === "P") {
      const p = cast.pms?.[slot];
      if (!p || !p.name) throw new Error(`Simulation cast has no project manager ${slot}`);
      const short = p.short || deriveShort(p.name);
      return form === "short" ? short : form === "say" ? (p.say || deriveSay(short)) : p.name;
    }
    if (kind === "T") {
      const n = teamName(cast.team?.[slot]);
      if (!n) throw new Error(`Simulation cast has no team member ${slot}`);
      return n;
    }
    return m;
  });
  if (LEFTOVER_RE.test(out)) throw new Error(`Unresolved simulation token in "${out.slice(0, 60)}"`);
  return out;
}

// Deep copy of obj with every token replaced (object keys too). Throws on a missing slot or a
// token left over, so a half-resolved page can never render.
export function resolveTokens(obj, cast) {
  if (!cast || typeof cast !== "object") throw new Error("Simulation cast missing");
  const walk = (v) => {
    if (typeof v === "string") return resolveString(v, cast);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) o[resolveString(k, cast)] = walk(v[k]);
      return o;
    }
    return v;
  };
  return walk(obj);
}

// Every slot a structure refers to, e.g. { C:Set{"C01"}, P:Set{"P12"}, T:Set{"head_pmo"} }.
export function tokensUsed(obj) {
  const used = { C: new Set(), P: new Set(), T: new Set() };
  const scan = (s) => { for (const m of s.matchAll(TOKEN_RE)) used[m[1] === "E" ? "C" : m[1]].add(m[2]); };
  const walk = (v) => {
    if (typeof v === "string") scan(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const k of Object.keys(v)) { scan(k); walk(v[k]); }
  };
  walk(obj);
  return used;
}

const MEDIA_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" };
export const MEDIA_MIMES = Object.keys(MEDIA_EXT);
const isVideo = (m) => String(m).startsWith("video/");

// Site-visit rows (project_attachments, kind 'site_visit') for the handed-over media items.
// store: the resolved SEED (needs store.media_plan, store.tables.projects, store.meta.pmo).
// items: [{ key, host, mime, size, order }] (order 0 = newest; blob is not used here).
// Each host's items fill its fictional visit dates newest first, images before videos, so the
// Gallery never opens on a video. Only items given are returned; an item for an unknown host or
// with an unknown type is skipped. file_path is 'sim-media/<key>' (the backend maps it to a blob:).
export function buildMediaRows(store, items) {
  const plan = store?.media_plan;
  if (!plan || !Array.isArray(plan.hosts)) throw new Error("Simulation media plan missing");
  const projects = new Set((store.tables?.projects || []).map((p) => p.id));
  const pmoId = store.meta?.pmo?.id ?? null;
  const list = (Array.isArray(items) ? items : []).filter((it) => it && /^[A-Za-z0-9_-]{1,32}$/.test(String(it.key)) && MEDIA_EXT[it.mime]);
  const rows = [];
  for (const h of plan.hosts) {
    if (!projects.has(h.project_id)) continue;
    const mine = list.filter((it) => it.host === h.slot);
    const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.key).localeCompare(String(b.key));
    const ordered = [...mine.filter((i) => !isVideo(i.mime)).sort(byOrder), ...mine.filter((i) => isVideo(i.mime)).sort(byOrder)];
    const visits = h.visits.map(([at, n], vi) => ({ at, n: vi === h.visits.length - 1 ? Infinity : n, list: [] }));
    let v = 0;
    for (const it of ordered) { while (visits[v].list.length >= visits[v].n) v++; visits[v].list.push(it); }
    const placed = [];
    for (const vis of visits) vis.list.forEach((it, i) => placed.push({ it, at: new Date(new Date(vis.at).getTime() - i * 9000).toISOString().replace(".000Z", "Z") }));
    const n = placed.length;
    placed.forEach(({ it, at }, i) => rows.push({
      id: `sim-media-${it.key}`, project_id: h.project_id, kind: "site_visit",
      file_name: `Site visit ${String(n - i).padStart(2, "0")}.${MEDIA_EXT[it.mime]}`,
      file_path: `sim-media/${it.key}`, file_size: Number(it.size) || 0, mime_type: it.mime, sort_order: i + 1,
      uploaded_at: at, uploaded_by: pmoId, uploaded_by_name: plan.uploaded_by_name || "Project Management Office",
    }));
  }
  return rows;
}
