// Fact check for enhance-text (PMO, 13 Nov 2026): the enhanced text may not change or invent any figure, date,
// project code, PR/PO number or e-mail address. Pure, so it is unit-tested without Deno.

// Project codes (IT.271101-01, RU.272001-01), long reference numbers, amounts (1,180,000 · 1.5 · 25%), dates
// (12 Nov 2026, 12/11/2026, 2026-11-12), times (1:39), e-mail addresses.
const CODE = /\b[A-Z]{2}\.\d{6}-\d{2}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
const NUM = /\d[\d,]*(?:\.\d+)?/g;

const norm = (s: string) => s.replace(/,/g, "").replace(/^0+(\d)/, "$1").replace(/\.0+$/, "");

/** The facts a text states: codes, e-mails and numbers (commas and leading zeros ignored). */
export function facts(text: string): Set<string> {
  const out = new Set<string>();
  let t = String(text || "");
  for (const m of t.match(CODE) ?? []) out.add("code:" + m);
  for (const m of t.match(EMAIL) ?? []) out.add("mail:" + m.toLowerCase());
  t = t.replace(CODE, " ").replace(EMAIL, " ");
  for (const m of t.match(NUM) ?? []) out.add("n:" + norm(m));
  return out;
}

const show = (k: string) => k.replace(/^(code|mail|n):/, "");

/**
 * Compare the enhanced text with the original (plus any instruction the PMO typed, which may bring new facts).
 * added   = facts in the enhanced text found in neither the original nor the instruction (invented or changed).
 * dropped = facts of the original missing from the enhanced text (allowed only for "shorter"? no: never for codes and amounts).
 */
export function checkFacts(original: string, enhanced: string, instruction = "") {
  const src = facts(original), allowed = new Set([...src, ...facts(instruction)]), got = facts(enhanced);
  const added = [...got].filter((k) => !allowed.has(k)).map(show);
  const dropped = [...src].filter((k) => !got.has(k)).map(show);
  return { ok: added.length === 0 && dropped.length === 0, added, dropped };
}

/** Tidy what the model returns: no wrapping quotes, no markdown emphasis, single spaces; titles on one line. */
export function tidy(text: string, field: string): string {
  let t = String(text || "").trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  if (field === "title") t = t.replace(/\s*\n+\s*/g, " ").replace(/[.]+$/, "");
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
