// PMO Simulation (live data): the narration, generated at launch from the snapshot. PUBLIC, no data.
// Owner: B3a. Spec: contract §F.1.
//
// buildNarration(snapshot) fills the templates of lines.js with the plan's figures. Each slot has
// three forms: `cap` (caption), `say` (spoken, before sayText) and `screen` (exactly as the screen
// prints it, for the figure checks). The speech is the caption template with the say forms, then
// sayText() on the whole text; the word count is the director's (whitespace split). Every line gets
// its candidates in order: the data-selected main line, its fallbacks, then the figure-free bare line
// (none for the critical opening and dashboard lines). The rehearsal may move a line's `use` to a
// later candidate; caption, speech, words, figures and short always read the candidate in use.
// buildNarration(snapshot, { shared: true }) (a copy the PMO shared with guests) says the data's date
// where the live texts say "current" or "today" (lines.js SHARED_TEXTS); the plan is the same.
import { LINES, CHAPTERS, CLOSING_SCENE, chapterOfScene, SHARED_TEXTS } from "./lines.js";
import { fmtM, fmtFull, fmtP1, fmtMcc, pctRound, fmtDayGB } from "./format.js";
import { sayText, sayMillions, sayPercent, sayInt, sayDate, sayCampus, countWords } from "./say.js";
import { project, compact, fmtClock, COMPACT_AT } from "./timing.js";

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const millionsCap = (n) => fmtM(n).replace(/M$/, "") + " million";
/** "36.0%" → "36 percent", "36.4%" → "36.4 percent". */
const percentCap = (text) => String(text).replace(/%$/, "").replace(/\.0+$/, "") + " percent";
const countSay = (n, one, many = one + "s") => `${sayInt(n)} ${n === 1 ? one : many}`;

const HOLDERS = { in_df: "Director Finance", in_ed: "the Executive Director", in_mt: "the Managing Trustee" };

/** The slot catalogue: (plan, env) → { cap, say, screen } (screen: a string, an object of named
 *  forms with `default`, or null when nothing on screen can be checked). */
export const SLOTS = {
  // "19 Oct 2026" on screen, "nineteenth October" spoken (said only by a shared copy's opening).
  dateText: (p) => ({ cap: p.asOf.dateText, say: sayDate(p.asOf.pktDate, Number(String(p.asOf.pktDate).slice(0, 4))), screen: null }),
  hhmm: (p) => ({ cap: p.asOf.hhmm, say: p.asOf.hhmm, screen: null }),

  capexM: (p) => ({ cap: millionsCap(p.dashboard.capexTotal), say: sayMillions(p.dashboard.capexTotal), screen: fmtM(p.dashboard.capexTotal) }),
  capexN: (p) => ({ cap: String(p.dashboard.capexCount), say: sayInt(p.dashboard.capexCount), screen: `${p.dashboard.capexCount} projects` }),
  progN: (p) => ({ cap: String(p.dashboard.progN), say: sayInt(p.dashboard.progN), screen: `${p.dashboard.progN} of ${p.dashboard.capexCount} projects` }),

  invCount: (p) => ({ cap: plural(p.investments.invN, "project"), say: countSay(p.investments.invN, "project"), screen: String(p.investments.invN) }),

  pddNot: (p) => ({ cap: String(p.pdd.notSubmitted), say: sayInt(p.pdd.notSubmitted), screen: String(p.pdd.notSubmitted) }),
  revAre: (p) => ({ cap: `${p.pdd.reviewerN} ${p.pdd.reviewerN === 1 ? "is" : "are"}`, say: `${sayInt(p.pdd.reviewerN)} ${p.pdd.reviewerN === 1 ? "is" : "are"}`,
    screen: { default: String(p.pdd.reviewerN), list: plural(p.pdd.reviewerN, "project") } }),
  holder: (p) => ({ cap: HOLDERS[p.pdd.reviewer] || "reviewers", say: HOLDERS[p.pdd.reviewer] || "reviewers", screen: null }),

  releasedM: (p) => ({ cap: millionsCap(p.payments.released), say: sayMillions(p.payments.released), screen: fmtM(p.payments.released) }),
  relPct: (p) => ({ cap: percentCap(p.payments.relPctText), say: sayPercent(p.payments.relPctText), screen: p.payments.relPctText }),
  paidClause: (p) => {
    const n = p.payments.paidProjects, v = p.payments.variant;
    const screen = { default: fmtM(p.payments.paidTotal), flow: "Paid" };
    if (v === "none" || n === 0) return { cap: "no payments are entered yet", say: "no payments are entered yet", screen };
    if (n === 1) return { cap: "payments entered for one project only", say: "payments entered for one project only", screen };
    if (n <= 3) return { cap: `payments entered for ${n} projects only`, say: `payments entered for ${sayInt(n)} projects only`, screen };
    return { cap: `${millionsCap(p.payments.paidTotal)} paid so far`, say: `${sayMillions(p.payments.paidTotal)} paid so far`, screen };
  },

  peaks: (p) => ({ cap: p.cashflow.peaked ? "peaked" : "peaks", say: p.cashflow.peaked ? "peaked" : "peaks", screen: null }),
  peakMonth: (p) => ({ cap: p.cashflow.monthName, say: p.cashflow.monthName, screen: p.cashflow.peakLabel }),
  peakM: (p) => ({ cap: millionsCap(p.cashflow.peakTotal), say: sayMillions(p.cashflow.peakTotal), screen: fmtM(p.cashflow.peakTotal) }),

  alias: (p) => ({ cap: p.story.alias, say: p.story.alias, screen: p.story.aliasScreen }),
  docFiles: (p) => ({ cap: plural(p.story.docCount, "file"), say: countSay(p.story.docCount, "file"), screen: null }),
  stageWord: (p) => {
    const w = p.story.stage === "closed" ? "Closed" : "Approved";
    return { cap: w, say: w, screen: w };
  },
  releasedState: (p) => {
    const s = p.story.releasedState;
    const w = s === "full" ? "fully released" : s === "partly" ? "partly released" : "not yet released";
    const screen = { default: fmtFull(p.story.released) };
    if (s === "full") screen.approved = fmtFull(p.story.released);
    return { cap: w, say: w, screen };
  },
  pct: (p) => ({ cap: percentCap(fmtP1(p.story.pct)), say: sayPercent(fmtP1(p.story.pct)), screen: fmtP1(p.story.pct) }),
  nTasks: (p) => ({ cap: plural(p.story.tasks, "task"), say: countSay(p.story.tasks, "task"), screen: plural(p.story.tasks, "task") }),
  wbsZero: () => ({ cap: "", say: "", screen: "0 tasks" }),
  wbsEmpty: () => ({ cap: "", say: "", screen: "No tasks yet." }),
  tag: (p) => ({ cap: p.story.tag, say: p.story.tag, screen: { default: null, pct: p.story.pct > 0 ? fmtP1(p.story.pct) : "—" } }),
  due: (p) => ({ cap: p.story.endPassed ? "was due" : "due", say: p.story.endPassed ? "was due" : "due", screen: null }),
  endDay: (p) => {
    const iso = String(p.story.endDate), y = Number(iso.slice(0, 4)), asY = Number(p.asOf.pktDate.slice(0, 4));
    const [, m, d] = iso.split("-").map(Number);
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return { cap: `${d} ${MONTHS[m - 1]}${y !== asY ? " " + y : ""}`, say: sayDate(iso, asY), screen: fmtDayGB(iso) };
  },
  withPct: (p) => ({ cap: String(p.performance.withPct), say: sayInt(p.performance.withPct), screen: null }),
  rowsShown: (p) => ({ cap: String(p.performance.rowsShown), say: sayInt(p.performance.rowsShown), screen: null }),

  openN: (p) => ({ cap: String(p.risks.open), say: sayInt(p.risks.open), screen: `${p.risks.open} open` }),
  critN: (p) => ({ cap: String(p.risks.critical), say: sayInt(p.risks.critical), screen: `${p.risks.critical} critical` }),
  cellN: (p) => ({ cap: String(p.risks.cellN), say: sayInt(p.risks.cellN),
    // The matrix cell counts open risks only; check it only when it shows the number said.
    screen: { default: `${p.risks.cellN} of ${p.risks.total}`, cell: p.risks.cellShown === p.risks.cellN ? String(p.risks.cellN) : null } }),
  prob: (p) => ({ cap: p.risks.prob, say: p.risks.prob, screen: null }),
  impact: (p) => ({ cap: p.risks.impact, say: p.risks.impact, screen: null }),

  campusN: (p) => ({ cap: String(p.compare.campusCount), say: sayInt(p.compare.campusCount), screen: `${p.compare.campusCount} campuses` }),
  pickN: (p) => ({ cap: String(p.compare.columns.length), say: sayInt(p.compare.columns.length), screen: null }),
  A: (p, env) => leaderSlot(p, env, "A"),
  R: (p, env) => leaderSlot(p, env, "R"),
  S: (p, env) => leaderSlot(p, env, "S"),
  T: (p, env) => leaderSlot(p, env, "T"),

  assignCampus: (p, env) => ({ cap: p.assign.campus, say: sayCampus(p.assign.campus, env.campuses), screen: p.assign.campus }),
  toAssign: (p) => ({ cap: String(p.assign.toAssign), say: sayInt(p.assign.toAssign), screen: `${plural(p.assign.toAssign, "project")} will be assigned` }),
  leftAlone: (p) => ({ cap: String(p.assign.leftAlone), say: sayInt(p.assign.leftAlone), screen: `${p.assign.leftAlone} left alone` }),

  usersN: (p) => ({ cap: String(p.users.count), say: sayInt(p.users.count), screen: plural(p.users.count, "user") }),
  testClause: (p) => {
    const t = p.users.testClause === "some" ? ", some for testing" : p.users.testClause === "one" ? ", one for testing" : "";
    return { cap: t, say: t, screen: null };
  },
  pmName: (p, env) => {
    const r = p.users.row, said = env.say && typeof env.say[r.userId] === "string" && env.say[r.userId].trim();
    return { cap: r.fullName, say: said || r.fullName, screen: r.fullName };
  },
  pmN: (p) => ({ cap: plural(p.users.row.assigned, "project"), say: countSay(p.users.row.assigned, "project"), screen: plural(p.users.row.assigned, "project") }),

  pastOpen: (p) => ({ cap: String(p.past.open), say: sayInt(p.past.open), screen: String(p.past.open) }),
  noProg: (p) => ({ cap: String(p.past.noProgress), say: sayInt(p.past.noProgress), screen: String(p.past.noProgress) }),

  galleryItems: (p) => {
    const g = p.gallery, n = g.total;
    const what = n === 1 ? (g.videos === 1 ? "video" : "photo")
      : g.videos === 0 ? "photos" : g.photos === 0 ? "videos" : "photos and videos";
    return { cap: `${n} ${what}`, say: `${sayInt(n)} ${what}`, screen: String(n) };
  },
  galleryCampus: (p, env) => ({ cap: p.gallery.campus, say: sayCampus(p.gallery.campus, env.campuses), screen: p.gallery.campus }),
  galleryAlias: (p) => ({ cap: p.gallery.alias, say: p.gallery.alias, screen: p.gallery.aliasScreen }),

  Month: (p) => ({ cap: p.report.month, say: p.report.month, screen: p.report.kind === "published" ? "Published" : "Draft" }),
};

function leaderSlot(p, env, key) {
  const campus = p.compare.leaders[key];
  const row = (p.compare.rows || []).find((r) => r.campus === campus) || {};
  const share = `${pctRound(row.releasedRate)} of DF Recommended`;
  const screen = key === "R" ? { default: `PKR ${fmtMcc(row.released)}` }
    : key === "S" || key === "T" ? { default: share }
      : { default: `PKR ${fmtMcc(row.bac)}`, released: `PKR ${fmtMcc(row.released)}`, share };
  return { cap: campus, say: sayCampus(campus, env.campuses), screen };
}

/** Values for the {var}s of selectors and kickers. */
function varsOf(p) {
  return {
    storyId: p.story?.id, reviewer: p.pdd.reviewer, cell: p.risks.cell, rowId: p.risks.rowId,
    A: p.compare.leaders.A, R: p.compare.leaders.R, S: p.compare.leaders.S, T: p.compare.leaders.T,
    assignCampus: p.assign.campus, username: p.users.row?.username, reportId: p.report.id,
    galleryCampus: p.gallery.campus, firstPhotoId: p.gallery.firstPhotoId,
    dateText: p.asOf.dateText, hhmm: p.asOf.hhmm, reportKicker: p.report.kicker,
  };
}
const cssStr = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
/** Fill {var}s; null when one is missing. */
function fillVars(text, vars, esc = (v) => v) {
  let missing = false;
  const out = String(text).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v == null || v === "") { missing = true; return ""; }
    return esc(String(v));
  });
  return missing ? null : out;
}

const SLOT_RE = /\{(\w+)\}/g;
const slotsIn = (t) => [...String(t || "").matchAll(SLOT_RE)].map((m) => m[1]);

class Filler {
  constructor(plan, env) { this.plan = plan; this.env = env; this.cache = new Map(); }
  slot(name) {
    if (!this.cache.has(name)) {
      const f = SLOTS[name];
      if (!f) throw new Error(`narration: unknown slot {${name}}`);
      this.cache.set(name, f(this.plan, this.env));
    }
    return this.cache.get(name);
  }
  text(template, form) {
    return String(template).replace(SLOT_RE, (_, k) => { const v = this.slot(k)[form]; return v == null ? "" : String(v); });
  }
  figure(spec, vars) {
    const at = spec.indexOf("@");
    const key = spec.slice(0, at), sel = spec.slice(at + 1);
    const [name, form] = key.split(".");
    const s = this.slot(name).screen;
    const screen = s == null ? null : typeof s === "string" ? (form ? null : s) : s[form || "default"];
    if (screen == null || screen === "") return null;
    const where = fillVars(sel, vars, cssStr);
    return where ? { slot: key, where, screen: String(screen) } : null;
  }
}

function makeCandidate(F, vars, name, template, specs, shortTemplate, minHold) {
  const caption = F.text(template, "cap").replace(/\s+/g, " ").trim();
  const speech = sayText(F.text(template, "say")).replace(/\s+/g, " ").trim();
  const words = countWords(speech);
  const st = shortTemplate == null ? template : shortTemplate;
  const sCaption = F.text(st, "cap").replace(/\s+/g, " ").trim();
  const sSpeech = sayText(F.text(st, "say")).replace(/\s+/g, " ").trim();
  const seen = new Set(), figures = [];
  for (const spec of specs || []) {
    const f = F.figure(spec, vars);
    const k = f && `${f.slot}@${f.where}`;
    if (f && !seen.has(k)) { seen.add(k); figures.push(f); }
  }
  const c = { name, caption, speech, words, figures, short: { caption: sCaption, speech: sSpeech, words: countWords(sSpeech) } };
  if (minHold != null) c.minHold = minHold;
  return c;
}

const LINE_FIELDS = ["caption", "speech", "words", "figures", "short"];
/** Gives a line its candidate-reading fields (caption, speech, words, figures, short, variant). */
function attachUse(line) {
  for (const k of LINE_FIELDS) {
    Object.defineProperty(line, k, { enumerable: true, configurable: true, get() { return this.candidates[this.use][k]; } });
  }
  Object.defineProperty(line, "variant", { enumerable: true, configurable: true, get() { return this.candidates[this.use].name; } });
  return line;
}

/** Moves a line to another candidate (the rehearsal's fallback step). Returns the line. */
export function useCandidate(line, index) {
  const i = Math.max(0, Math.min(line.candidates.length - 1, Math.floor(Number(index) || 0)));
  line.use = i;
  return line;
}

function buildLine(L, plan, F, vars) {
  const chapter = chapterOfScene(L.scene);
  const skip = !!(L.skipWhen && L.skipWhen(plan));
  const out = { id: L.id, scene: L.scene, chapter, minHold: L.minHold, extra: L.extra || 0, critical: !!L.critical,
    kicker: L.kicker ? fillVars(L.kicker, vars) : null, candidates: [], use: 0, skip, compact: false };
  const cands = [];
  const entry = skip ? null : L.main.find((e) => !e.when || e.when(plan));
  if (!skip && !entry) throw new Error(`narration: no line for ${L.id}`);
  if (entry) {
    const shortT = entry.short ?? L.short;
    cands.push(makeCandidate(F, vars, entry.name, entry.caption, [...(entry.figures || []), ...(entry.checks || [])], shortT, entry.minHold));
    for (const fb of L.fallbacks || []) {
      if (fb === "short") {
        const said = new Set(slotsIn(shortT));
        const figs = (entry.figures || []).filter((s) => said.has(s.split("@")[0].split(".")[0]));
        cands.push(makeCandidate(F, vars, "short", shortT, [...figs, ...(entry.checks || [])], shortT, entry.minHold));
      } else if (!fb.when || fb.when(plan)) {
        cands.push(makeCandidate(F, vars, fb.name, fb.caption, [...(fb.figures || []), ...(fb.checks || [])], fb.short ?? L.short, fb.minHold ?? entry.minHold));
      }
    }
  }
  if (L.bare != null) {
    let t = L.bare === "short" ? (entry ? (entry.short ?? L.short) : L.short) : L.bare;
    if (slotsIn(t).length) t = L.bareIfSlots;
    if (!t || slotsIn(t).length) throw new Error(`narration: ${L.id} has no figure-free bare line`);
    cands.push(makeCandidate(F, vars, "bare", t, [], t, entry?.minHold));
  }
  // The same text twice is one candidate (the first, which has the checks).
  const seen = new Set();
  out.candidates = cands.filter((c) => (seen.has(c.caption) ? false : (seen.add(c.caption), true)));
  return attachUse(out);
}

const totalWords = (lines) => lines.filter((l) => !l.skip).reduce((s, l) => s + (l.compact ? l.short.words : l.words), 0);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** A line with a shared copy's texts in place of the live ones (same entries, conditions and figures). */
function sharedLine(L) {
  const t = SHARED_TEXTS[L.id];
  if (!t) return L;
  return { ...L, short: t.short ?? L.short,
    main: L.main.map((e) => (t.main && Object.prototype.hasOwnProperty.call(t.main, e.name) ? { ...e, caption: t.main[e.name] } : e)) };
}

/**
 * The narration for a validated snapshot (contract §F.1):
 *   { lines, scenes, chapters, totals: { words, at135, at150, atWpm }, compacted, notes }
 * shared: a copy the PMO shared with guests (its data may be days old; see SHARED_TEXTS).
 */
export function buildNarration(snapshot, { wpm = 135, shared = false } = {}) {
  const plan = snapshot?.plan;
  if (!plan || plan.v !== 1) throw new Error("narration: the snapshot has no plan");
  const tables = snapshot.tables || {};
  const env = { campuses: tables.campuses || [], say: snapshot.overrides?.say || {} };
  const F = new Filler(plan, env);
  const vars = varsOf(plan);
  const lines = LINES.map((L) => buildLine(shared ? sharedLine(L) : L, plan, F, vars));

  const sceneNs = [...new Set(lines.map((l) => l.scene))].sort((a, b) => a - b);
  const scenes = sceneNs.map((n) => {
    const ls = lines.filter((l) => l.scene === n);
    return { n, chapter: chapterOfScene(n), lines: ls.map((l) => l.id), minHold: ls.reduce((s, l) => s + l.minHold, 0),
      extra: ls.reduce((s, l) => s + l.extra, 0), start: 0, skip: ls.every((l) => l.skip),
      kicker: n === 0 || n === CLOSING_SCENE ? null : (ls.find((l) => l.kicker)?.kicker ?? null), closing: n === CLOSING_SCENE };
  });

  const notes = [];
  for (const l of lines) {
    const sn = l.skip && LINES.find((L) => L.id === l.id).skipNote;
    const note = typeof sn === "function" ? sn(plan) : sn;
    if (note && !notes.includes(note)) notes.push(note);
  }
  if (plan.assign.variant === "other") notes.push(`Scene 13 uses a campus outside the compared three (${plan.assign.campus}).`);
  if (plan.assign.variant === "none" && plan.assign.campus) notes.push("Scene 13: no campus has a project without a manager.");
  for (const name of plan.flags.overrideRejected || []) notes.push(`A launcher choice was not accepted: ${name}.`);

  const compacted = compact(lines, scenes, { wpm: 135 });
  for (const id of compacted) lines.find((l) => l.id === id).compact = true;
  const p135 = project(lines, scenes, 135), p150 = project(lines, scenes, 150), pW = project(lines, scenes, wpm);
  for (const s of scenes) s.start = r3(pW.scenes.find((x) => x.n === s.n).start);
  const chapters = CHAPTERS.map((c) => ({ n: c.n, title: c.title, scenes: [...c.scenes], start: r3(pW.chapters.find((x) => x.n === c.n).start) }));
  if (compacted.length) notes.push(`Short lines used to fit: ${compacted.join(", ")}.`);
  if (p135.total > COMPACT_AT) notes.push(`Projected ${fmtClock(p135.total)} at 135 wpm; shorter lines will be used if the voice is slow.`);

  return {
    lines, scenes, chapters,
    totals: { words: totalWords(lines), at135: r3(p135.total), at150: r3(p150.total), atWpm: r3(pW.total), wpm },
    compacted, notes,
  };
}
