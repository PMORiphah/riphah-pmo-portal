// PMO Simulation (live data): the speech normaliser (src/sim/live/say.js). PUBLIC, no data.
// Runs without the private fixture. Every text below is invented.
//
//   node scripts/sim/live/say.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SAY from "../../../src/sim/live/say.js";
import SAY_CAMPUS from "../../../src/sim/live/say-campus.json" with { type: "json" };

const eq = (a, b) => assert.equal(a, b);

// Numbers
eq(SAY.say999(0), "zero"); eq(SAY.say999(7), "seven"); eq(SAY.say999(19), "nineteen"); eq(SAY.say999(20), "twenty");
eq(SAY.say999(21), "twenty-one"); eq(SAY.say999(91), "ninety-one"); eq(SAY.say999(100), "one hundred");
eq(SAY.say999(109), "one hundred nine"); eq(SAY.say999(540), "five hundred forty"); eq(SAY.say999(999), "nine hundred ninety-nine");
eq(SAY.sayInt(1000), "one thousand"); eq(SAY.sayInt(1234), "one thousand two hundred thirty-four");
eq(SAY.sayInt(999999), "nine hundred ninety-nine thousand nine hundred ninety-nine");
eq(SAY.sayInt(2000005), "two million five"); eq(SAY.sayInt(-3), "minus three");
eq(SAY.sayNumber("12.0"), "twelve"); eq(SAY.sayNumber("12.50"), "twelve point five zero"); eq(SAY.sayNumber("4,321.7"), "four thousand three hundred twenty-one point seven");
eq(SAY.sayMillions(512345678), "five hundred twelve point three million");
eq(SAY.sayMillions(1234567890), "one thousand two hundred thirty-four point six million");
eq(SAY.sayMillions(15000000), "fifteen million");
eq(SAY.sayMillions(950000), "one million");
eq(SAY.sayMillions(40000), "zero million");
eq(SAY.sayPercent("41.0%"), "forty-one percent"); eq(SAY.sayPercent("41.7%"), "forty-one point seven percent");
eq(SAY.sayPercent("100.0%"), "one hundred percent"); eq(SAY.sayPercent("0.5%"), "zero point five percent");

// Ordinals and dates
const ORD = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 8: "eighth", 9: "ninth", 11: "eleventh", 12: "twelfth",
  13: "thirteenth", 20: "twentieth", 21: "twenty-first", 22: "twenty-second", 23: "twenty-third", 29: "twenty-ninth", 30: "thirtieth", 31: "thirty-first" };
for (const [d, w] of Object.entries(ORD)) eq(SAY.sayOrdinal(Number(d)), w);
eq(SAY.sayYear(2031), "twenty thirty-one"); eq(SAY.sayYear(2000), "two thousand"); eq(SAY.sayYear(2007), "two thousand seven");
eq(SAY.sayYear(2010), "twenty ten"); eq(SAY.sayYear(2105), "twenty-one oh five");
eq(SAY.sayDate("2031-03-02", 2031), "second March");
eq(SAY.sayDate("2032-11-21", 2031), "twenty-first November twenty thirty-two");
eq(SAY.sayDate("2031-06-30"), "thirtieth June");

// sayText
eq(SAY.sayText("The PMO portal."), "The P M O portal.");
eq(SAY.sayText("Documents holds its PDD."), "Documents holds its P D D.");
eq(SAY.sayText("the XQZ lab (ABCD), then QR."), "the X Q Z lab (A B C D), then Q R.");
eq(SAY.sayText("On Q-5, nine left."), "On Q five, nine left.");
eq(SAY.sayText("Team & About"), "Team and About");
eq(SAY.sayText("a · b — c"), "a, b, c");
eq(SAY.sayText("Total Capex and CAPEX"), "Total Capex and Capex");
eq(SAY.sayText("63 await; 7 are with"), "sixty-three await; seven are with");
eq(SAY.sayText("most 'Delayed' lack"), "most 'Delayed' lack");
eq(SAY.sayText("36.5% of 1,234"), "thirty-six point five percent of one thousand two hundred thirty-four");
eq(SAY.sayText("the 21st day"), "the twenty-first day");
eq(SAY.sayText("We'll see; let's go; October's draft."), "We'll see; let's go; October's draft.");
eq(SAY.sayText("code AB.123456-04 stays"), "code AB.123456-04 stays");
eq(SAY.sayText("ABCDEF is too long to spell"), "ABCDEF is too long to spell");
eq(SAY.sayText("  spaced   out  "), "spaced out");
for (const t of ["The PMO portal.", "On Q-5, 9 left.", "Team & About · 36.5%", "the XQZ lab (ABCD)"]) {
  eq(SAY.sayText(SAY.sayText(t)), SAY.sayText(t));   // idempotent: slot say forms pass through again
}

// Word counts (the director's rule)
eq(SAY.countWords("The P M O portal"), 5); eq(SAY.countWords("ninety-one"), 1); eq(SAY.countWords("  a  b "), 2); eq(SAY.countWords(""), 0);

// Campus respellings: keyed by campus id only; the spoken form goes through sayText.
assert.equal(SAY_CAMPUS.v, 1);
const entries = Object.entries(SAY_CAMPUS.campuses);
assert.ok(entries.length >= 1);
for (const [id, said] of entries) {
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "keyed by campus id");
  assert.ok(typeof said === "string" && said.trim().length > 0);
}
const [someId, someSaid] = entries[0];
const campuses = [{ id: someId, name: "Campus Alpha" }, { id: "00000000-0000-4000-8000-000000000099", name: "Campus Beta" }];
eq(SAY.sayCampus("Campus Alpha", campuses), SAY.sayText(someSaid));
eq(SAY.sayCampus("Campus Beta", campuses), "Campus Beta");
eq(SAY.sayCampus("QRS", []), "Q R S");
eq(SAY.sayCampus("Campus Alpha", campuses, {}), "Campus Alpha");
// say-campus.json is plain JSON (no comments) and the respellings have no all-caps runs left to spell.
JSON.parse(readFileSync(new URL("../../../src/sim/live/say-campus.json", import.meta.url), "utf8"));
for (const [, said] of entries) assert.equal(SAY.sayText(SAY.sayText(said)), SAY.sayText(said));

console.log("say.test: ok");
