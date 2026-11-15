// Head PMO (15 Nov 2026): a Head PMO session has role "pmo" (to see every PMO page) and headView true.
// Edit and write controls use canEditPmo(session); what may be SEEN still uses role === "pmo".
export const canEditPmo = (s) => s?.role === "pmo" && !s?.headView;
export const isHeadView = (s) => !!s?.headView;
