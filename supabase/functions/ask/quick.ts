// v43 (5 Oct 2026): replies decided in code, before any model is called.
//  · acknowledgements ("okay", "thanks", "shukriya") get a short reply instead of
//    the model repeating its last answer;
//  · requests to send, message or change something get a pointer to the screen
//    that does it (the assistant is read-only), in the language they were asked in;
//  · attempts to change the rules ("ignore your rules", "in USD") get a fixed
//    reply; the model once printed its own instruction text for these.
// Pure, so it is unit-tested offline (quick_test.ts).

export type Quick = { kind: "ack" | "send" | "change" | "rules"; answer: string } | null;

// Roman Urdu: a few very common words, matched as whole words.
const URDU = /\b(kya|kia|kyun|kitne|kitni|kitna|hain|hai|hy|mein|mujhe|humein|ko|karo|kardo|kar do|krdo|bhejo|bhej|bhejain|bhejen|shukriya|meherbani|theek|thik|acha|accha|ji|jee|nahi|nahin|batao|bataen|bataein|wala|wali|walay|aur|unka|unki|uska)\b/gi;
export const isRomanUrdu = (q: string) => (q.match(URDU) ?? []).length >= 1 && !/\b(the|which|what|how|please|is|are)\b/i.test(q);

const ACK = /^\s*(ok(ay)?|okk?|k+|kk|thanks?( (you|u))?( (so|very) much)?|thank u|thx|ty|great|good|fine|nice|perfect|got it|noted|understood|alright|all right|cool|done|sure|right|shukriya|jazak ?allah( khair)?|theek( hai)?|thik( hai)?|acha|accha|ji|jee|hmm+)\s*[.!👍🙏😊]*\s*$/i;
const THANKS = /thank|thx|\bty\b|shukriya|jazak/i;

// A request to send or write something to someone.
const SEND = /^\s*(please |pls |kindly |can you |could you |would you |will you )?(send|e-?mail|mail|message|msg|whatsapp|text|sms|notify|remind|forward|ping|type|write)\b(?!-)|\b(e-?mail|message|msg|whatsapp|reminder) (bhejo|bhej do|bhejain|bhejen|kar do|kardo|karo)\b|\b(send|bhejo|bhej do|bhejain) (an? )?(e-?mail|message|msg|reminder|notification|whatsapp)\b|\b(type|write) an? (message|email|e-mail|note)\b|\b(message|email|e-mail) (to|ko)\b/i;
// A request to change data. "add up", "update me", "change in" are questions, not requests.
const CHANGE = /^\s*(please |pls |kindly |can you |could you |would you |will you )?(delete|remove|edit|change(?! in)|update(?! me\b)|create|add(?! up)|assign|unassign|approve|reject|release|move|rename|close(?! to\b)|mark|set|upload|cancel|reopen)\b/i;
// Same list the history filter uses, plus "rules"/"instructions" requests.
const RULES = /\b(usd|us dollars?|dollars?|from now on|ignore (all|any|the|your|previous|prior)|developer mode|admin mode|jailbreak|new instructions?|act as|pretend|your (rules|instructions|prompt|system prompt))\b|\bsystem\s*:|\$/i;

export function quickReply(question: string, role: string): Quick {
  const q = question.trim();
  const ur = isRomanUrdu(q);
  if (ACK.test(q)) {
    const thanks = THANKS.test(q);
    return { kind: "ack", answer: ur
      ? `${thanks ? "Aap ka shukriya. " : ""}Projects ke baare mein koi aur sawal ho to poochiye.`
      : `${thanks ? "You're welcome. " : ""}Is there anything else you'd like to know about the projects?` };
  }
  if (RULES.test(q)) {
    return { kind: "rules", answer: ur
      ? "Main apna tareeqa nahi badal sakta: tamam raqam PKR mein hoti hai aur seedha portal se aati hai. Projects, budget, stages ya PDDs ke baare mein poochiye."
      : "I can't change how I answer: all amounts are in PKR and come straight from the portal. Ask me about the projects, budgets, stages or PDDs." };
  }
  const pmo = role === "pmo";
  if (SEND.test(q)) {
    if (ur) return { kind: "send", answer: pmo
      ? "Main messages ya emails nahi bhej sakta, main sirf portal parhta hoon. Project manager tak baat pohanchane ke liye:\n- **Updates**: project ki thread mein likhein; PM ko portal mein nazar aayega.\n- **Past Projects → By PM**: us manager ke saath chat; har message PM ko email ho jata hai.\n- **Deadline alert pop-up** (sign-in ke baad): PM ke naam wala **Email** button email kholta hai jise aap bhejne se pehle dekh sakte hain."
      : "Main messages ya emails nahi bhej sakta. PMO tak baat pohanchane ke liye apne project ki thread mein **Updates** par likhein." };
    return { kind: "send", answer: pmo
      ? "I can't send messages or emails; I only read the portal. To reach a project manager:\n- **Updates**: post on the project's thread; the PM sees it in the portal.\n- **Past Projects → By PM**: the chat with that manager; each message is also emailed to them.\n- **Deadline alert pop-up** (after sign-in): the **Email** button next to each manager opens an email you check before sending."
      : "I can't send messages or emails; I only read the portal. To reach the PMO, post on your project's thread in **Updates**." };
  }
  if (CHANGE.test(q)) {
    if (ur) return { kind: "change", answer: pmo
      ? "Main portal mein kuch badal nahi sakta, sirf parh sakta hoon. Tabdeeli ke liye **Projects** mein project kholein aur **Edit project** karein (stage, raqam, dates; manager **Person Responsible** card se); project delete karna bhi **Projects** list se hota hai."
      : "Main portal mein kuch badal nahi sakta. Tabdeeli PMO karta hai; apni darkhwast **Updates** mein project ki thread par likhein." };
    return { kind: "change", answer: pmo
      ? "I can't change anything; I only read the portal. To change a project, open it from **Projects** and use **Edit project** (stage, amounts, dates) or its **Person Responsible** card (project manager); projects are deleted from the **Projects** list."
      : "I can't change anything; I only read the portal. Changes are made by the PMO: post your request on the project's thread in **Updates**." };
  }
  return null;
}
