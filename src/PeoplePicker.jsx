import { useState } from "react";
import { TYPE, SP, R, BRAND } from "./theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PEOPLE PICKER: a checkbox list of people in groups, with search and Select
   all / Clear all per group. Inline (never a second Modal: one Escape would
   close both windows). The same look as the board report's recipients list.

   groups:   [{ key, label, note?, people: [{ id, name, sub? }] }]  (empty groups are not shown)
   selected: Set of ids; onChange(Set) gets a new Set.
   ═══════════════════════════════════════════════════════════════════════════ */
export function PeoplePicker({ T, groups, selected, onChange, disabled = false, maxHeight = 260, placeholder = "Search people…", empty = "Nobody to choose." }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = (groups || []).map((g) => ({
    ...g, list: (g.people || []).filter((p) => !needle || `${p.name || ""} ${p.sub || ""}`.toLowerCase().includes(needle)),
  }));
  const any = (groups || []).some((g) => (g.people || []).length);
  const toggle = (id) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
  const toggleAll = (list) => {
    const n = new Set(selected);
    const all = list.every((p) => n.has(p.id));
    list.forEach((p) => (all ? n.delete(p.id) : n.add(p.id)));
    onChange(n);
  };
  if (!any) return <div style={{ fontSize: 12.5, color: T.dim }}>{empty}</div>;
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={disabled} aria-label={placeholder}
        style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: R.sm,
          padding: "7px 10px", fontSize: 13, color: T.text, fontFamily: TYPE.body.fontFamily, outline: "none", marginBottom: SP.sm }} />
      <div className="pmo-scroll" style={{ maxHeight, overflowY: "auto", paddingRight: 4 }}>
        {shown.map((g) => g.list.length ? (
          <div key={g.key} style={{ marginBottom: SP.md }}>
            <div style={{ display: "flex", alignItems: "center", gap: SP.sm, marginBottom: 4 }}>
              <span style={{ ...TYPE.label, color: T.muted }}>{g.label}</span>
              {g.note && <span style={{ ...TYPE.caption, color: T.dim }}>{g.note}</span>}
              <button type="button" className="pmo-focusable" disabled={disabled} onClick={() => toggleAll(g.list)}
                style={{ marginLeft: "auto", border: 0, background: "none", color: T.textOf(BRAND.blue), fontSize: 12, cursor: disabled ? "default" : "pointer" }}>
                {g.list.every((p) => selected.has(p.id)) ? "Clear all" : "Select all"}</button>
            </div>
            {g.list.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: R.sm,
                cursor: disabled ? "default" : "pointer", background: selected.has(p.id) ? `${BRAND.blue}14` : "transparent" }}>
                <input type="checkbox" checked={selected.has(p.id)} disabled={disabled} onChange={() => toggle(p.id)} />
                <span style={{ fontSize: 13, color: T.text }}>{p.name || "—"}</span>
                {p.sub && <span style={{ ...TYPE.caption, color: T.dim }}>{p.sub}</span>}
              </label>
            ))}
          </div>
        ) : null)}
        {needle && shown.every((g) => !g.list.length) && <div style={{ fontSize: 12.5, color: T.dim }}>No one matches.</div>}
      </div>
    </div>
  );
}
