// Portfolio demo entry (stage 1): fictional data in the in-page backend, a demo PMO session, the real
// portal's App. Nothing leaves the page: the backend answers every request to the demo address and
// refuses everything else.
import React from "react";
import { createRoot } from "react-dom/client";
import seed from "../data/seed.json";
import { installBackend, prepareSession } from "../../src/sim/backend.js";

const store = {
  tables: seed.tables,
  meta: { pmo: { id: seed.pmo.id, username: seed.pmo.username, full_name: seed.pmo.full_name, email: null },
    takenAt: seed.NOW, plan: { storyId: seed.storyId } },
};

window.__DEMO__ = { unhandled: [] };
installBackend({
  store, mediaUrls: {}, responses: [], rpc: {}, mode: "live",
  onUnhandled: (info) => { window.__DEMO__.unhandled.push(info); },
});
prepareSession(store);

const { default: App } = await import("../../src/App.jsx");
createRoot(document.getElementById("root")).render(<App />);
