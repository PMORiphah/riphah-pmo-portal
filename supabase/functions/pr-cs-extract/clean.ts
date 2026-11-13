// Pure helpers of pr-cs-extract: what is kept from a reading and the code checks (code, not the model, decides).
// Shared by the function and its local test; no Deno APIs here.
type Row = Record<string, unknown>;

const text = (v: unknown, max = 400) => {
  const s = String(v ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
// Full rupees. "17 million", "1.5 crore", "Rs. 370,000/-" that slip through as text are converted here.
export const money = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).toLowerCase().replace(/rs\.?|pkr|\/-|,/g, "").trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(million|mn|m|crore|cr|lakh|lac|thousand|k)?$/);
  if (!m) return null;
  const k = ({ million: 1e6, mn: 1e6, m: 1e6, crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, thousand: 1e3, k: 1e3 } as Record<string, number>)[m[2] ?? ""] ?? 1;
  const n = Number(m[1]) * k;
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const qtyOf = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return v == null || v === "" || !isFinite(n) ? null : n; };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.0005);   // ±PKR 1 (or 0.05% for rounding on large sums)
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

export type CsItem = { name: string; qty: number | null; unit: string | null; unit_price: number | null; amount: number | null; vendor: string | null };
export type CsVendor = { name: string; total: number | null; approved: boolean; note: string | null };

/** A Comparative Statement reading → what the tab shows, with code checks. */
export function cleanCs(data: Row) {
  const checks: string[] = [];
  const items: CsItem[] = (Array.isArray(data.items) ? data.items as Row[] : []).map((x) => ({
    name: text(x.name, 300) ?? "",
    qty: qtyOf(x.qty), unit: text(x.unit, 30),
    unit_price: money(x.unit_price), amount: money(x.amount), vendor: text(x.vendor, 160),
  })).filter((x) => x.name).slice(0, 200);
  const vendors: CsVendor[] = (Array.isArray(data.vendors) ? data.vendors as Row[] : []).map((v) => ({
    name: text(v.name, 160) ?? "", total: money(v.total), approved: v.approved === true, note: text(v.note, 200),
  })).filter((v) => v.name).slice(0, 20);
  let approved = text(data.approved_vendor, 160);
  const currency = (text(data.currency, 8) ?? "PKR").toUpperCase();
  let total = money(data.total_amount);

  // The approved vendor: as the reader named it, else the one vendor marked approved.
  const marked = vendors.filter((v) => v.approved);
  if (!approved && marked.length === 1) approved = marked[0].name;
  if (approved && vendors.length && !vendors.some((v) => same(v.name, approved!)))
    vendors.push({ name: approved, total, approved: true, note: null });
  vendors.forEach((v) => { v.approved = !!approved && same(v.name, approved); });

  // qty × unit price = amount (±PKR 1).
  items.forEach((x, i) => {
    if (x.qty != null && x.unit_price != null && x.amount != null && !close(x.qty * x.unit_price, x.amount))
      checks.push(`Line ${i + 1} (${x.name.slice(0, 60)}): ${fmt(x.qty)} × ${fmt(x.unit_price)} = ${fmt(x.qty * x.unit_price)}, the CS shows ${fmt(x.amount)}.`);
    if (x.amount == null && x.qty != null && x.unit_price != null) x.amount = Math.round(x.qty * x.unit_price * 100) / 100;
  });
  // Lines = total. Only the approved vendor's lines when the reader tagged lines with a vendor.
  const mine = approved && items.some((x) => x.vendor) ? items.filter((x) => x.vendor && same(x.vendor, approved!)) : items;
  const priced = mine.filter((x) => x.amount != null);
  const sum = Math.round(priced.reduce((s, x) => s + (x.amount as number), 0) * 100) / 100;
  if (total == null && priced.length && priced.length === mine.length) {
    total = sum; checks.push(`The CS shows no grand total; the total is the sum of its ${priced.length} lines.`);
  } else if (total != null && priced.length && priced.length === mine.length && !close(sum, total)) {
    checks.push(`The ${priced.length} lines add up to ${fmt(sum)}; the CS total is ${fmt(total)} (difference ${fmt(Math.round((total - sum) * 100) / 100)}).`);
  }
  const av = vendors.find((v) => v.approved);
  if (av && av.total != null && total != null && !close(av.total, total))
    checks.push(`The approved vendor's quoted total is ${fmt(av.total)}; the CS total is ${fmt(total)}.`);
  if (av && av.total == null && total != null) av.total = total;
  if (!approved) checks.push("The CS does not name an approved vendor; check the document.");
  const cheaper = av?.total != null ? vendors.filter((v) => !v.approved && v.total != null && (v.total as number) < (av.total as number) - 1) : [];
  if (cheaper.length) checks.push(`Lower quote not chosen: ${cheaper.map((v) => `${v.name} ${fmt(v.total as number)}`).join(", ")} (the CS may give the reason).`);
  (Array.isArray(data.form_notes) ? data.form_notes : []).slice(0, 6).forEach((n) => { const t = text(n, 300); if (t) checks.push(`On the CS: ${t}`); });
  const note = text(data.note, 300);
  if (note) checks.push(`Reader's note: ${note}`);
  return {
    reading: { cs_date: isoDate(data.cs_date), cs_number: text(data.cs_number, 80), subject: text(data.subject, 300),
               items, vendors, approved_vendor: approved, currency, total_amount: total, checks },
    item_count: items.length, approved_vendor: approved, total_amount: total, currency,
  };
}

const isoDate = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(+d) || d.toISOString().slice(0, 10) !== s) return null;
  const y = +s.slice(0, 4);
  return y >= 2015 && y <= 2035 ? s : null;
};

/** The "PR released" email screenshot → date, subject, sender. */
export function cleanEmail(data: Row) {
  const checks: string[] = [];
  const released_on = isoDate(data.sent_date);
  if (!released_on) checks.push("The email's date could not be read; enter it by hand.");
  const subject = text(data.subject, 300);
  const pr = text(data.pr_number, 80);
  const note = text(data.note, 300);
  if (note) checks.push(`Reader's note: ${note}`);
  return {
    reading: { sent_date: released_on, sent_time: text(data.sent_time, 20), from: text(data.from, 160), to: text(data.to, 300),
               subject, pr_number: pr, summary: text(data.summary, 600), amount: money(data.amount), checks },
    released_on, email_subject: subject,
  };
}
