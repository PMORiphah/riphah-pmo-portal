// PMO Simulation: build the cast from live rows (portal side, under the PMO's own session).
// Light on purpose (no seed): src/simBridge.js can import it without pulling the dataset.
// Slots resolve through the PINNED production ids in pins.json, never from live counts or order.
import PINS from "./pins.json";
import SPEECH from "./speech.json";
import { deriveShort, deriveSay, TEAM_KEYS } from "./tokens.js";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// campuses: [{ id, name }]   users: [{ id, full_name, username, role, is_active }]
// teamConfig: settings.team_config value ({ head_pmo: { name }, ... })
// epdd (optional): { "<campus name>": "<E-PDD spelling>" }
// Returns { cast, missing } — missing lists every pin that did not resolve; lock the run if it is not empty.
export function buildCast({ campuses = [], users = [], teamConfig = {}, epdd = {} }) {
  const missing = [];
  const cById = new Map(campuses.map((c) => [c.id, c]));
  const uById = new Map(users.map((u) => [u.id, u]));
  const cast = { v: 1, campuses: {}, pms: {}, team: {} };
  for (const [slot, id] of Object.entries(PINS.campuses)) {
    const c = cById.get(id); const name = clean(c?.name);
    if (!name) { missing.push(`campus ${slot}`); continue; }
    cast.campuses[slot] = { name, say: SPEECH.campuses[slot] || name, ...(epdd[name] ? { epdd: clean(epdd[name]) } : {}) };
  }
  for (const [slot, id] of Object.entries(PINS.pms)) {
    const u = uById.get(id); const name = clean(u?.full_name || u?.username);
    if (!name || u?.is_active === false) { missing.push(`project manager ${slot}`); continue; }
    const short = deriveShort(name);
    cast.pms[slot] = { name, short, say: deriveSay(short), role: (PINS.pmRoles || {})[slot] === "guest" ? "guest" : "pm" };
  }
  for (const k of TEAM_KEYS) {
    const name = clean(teamConfig?.[k]?.name);
    if (!name) { missing.push(`team ${k}`); continue; }
    cast.team[k] = { name };
  }
  return { cast, missing };
}

// A short code for the Begin screen: the same cast gives the same code at rehearsal and at the meeting.
export function castCode(cast) {
  const s = JSON.stringify([Object.keys(cast.campuses || {}).sort().map((k) => cast.campuses[k].name),
    Object.keys(cast.pms || {}).sort().map((k) => cast.pms[k].name), TEAM_KEYS.map((k) => cast.team?.[k]?.name)]);
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).toUpperCase().padStart(7, "0").slice(-6);
}

export { PINS, SPEECH };
