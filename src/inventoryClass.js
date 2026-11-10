/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY CLASSES (PMO, 10 Nov 2026): senior management is interested in
   equipment and assets, so the Inventory page opens on those.

   Rules live in the PMO-only setting `inventory_asset_classes`:
     { labels: {equipment, building, consumable},
       groups: { "<SAP material group>": "equipment" | "building" | "consumable" },
       default: "building",                      // a group not listed
       names: [ { class, pattern } ],            // item-name exceptions for mixed groups, first match wins
       lines: { "<PO number>/<PO item>": class } // the PMO's own reclassifications (Reclassify on a line)
     }
   Service lines (SAP item category D) are always "service". A rule change needs no deploy.
   Pure: no React, no network.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CLASS_SETTING = "inventory_asset_classes";
export const CLASS_ORDER = ["equipment", "building", "consumable", "service"];
export const CLASS_LABEL = {
  equipment: "Equipment & assets",
  building: "Building works & materials",
  consumable: "Consumables",
  service: "Services",
};
export const lineKey = (r) => `${r.po_number}/${r.po_item}`;

// Returns (row) => { cls, why }  why: "service" | "pmo" | "name" | "group" | "default"
export function makeClassifier(rules) {
  const R = rules && typeof rules === "object" ? rules : {};
  const groups = R.groups || {};
  const def = CLASS_LABEL[R.default] ? R.default : "equipment";
  const lines = R.lines || {};
  const names = [];
  for (const n of R.names || []) {
    if (!CLASS_LABEL[n?.class]) continue;
    try { names.push([n.class, new RegExp(n.pattern, "i")]); } catch { /* a bad pattern is skipped, never breaks the page */ }
  }
  const known = Object.keys(groups).length > 0;
  return (r) => {
    if (r.is_service) return { cls: "service", why: "service" };
    const own = lines[lineKey(r)];
    if (CLASS_LABEL[own] && own !== "service") return { cls: own, why: "pmo" };
    // Without any rules yet, nothing is hidden: every goods line counts as equipment.
    if (!known) return { cls: "equipment", why: "default" };
    const base = groups[r.material_group] || def;
    for (const [cls, rx] of names) if (cls !== base && rx.test(r.description || "")) return { cls, why: "name" };
    return { cls: base, why: groups[r.material_group] ? "group" : "default" };
  };
}
