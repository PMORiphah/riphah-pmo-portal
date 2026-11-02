// Portfolio demo: the page's calendar is fixed to the demo's day (the fictional data is "as of" that day),
// so ages, deadlines, "overdue" and the fiscal year read the same whenever the demo is opened.
// The time of day is the visitor's own and keeps running.
export function setDemoDay(isoDay) {
  const Real = Date;
  const now = new Real();
  const [y, m, d] = isoDay.split("-").map(Number);
  const offset = new Real(y, m - 1, d).getTime() - new Real(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (!offset) return;
  class DemoDate extends Real {
    constructor(...a) { if (a.length === 0) super(Real.now() + offset); else super(...a); }
    static now() { return Real.now() + offset; }
  }
  // Date("…") without new returns a string of "now" in the real Date; keep that behaviour.
  const Wrapped = new Proxy(DemoDate, { apply: () => new DemoDate().toString() });
  globalThis.Date = Wrapped;
}
