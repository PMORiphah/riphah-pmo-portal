import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "./ui.jsx";

// "Status report" (PMO, 10 Nov 2026): the same workbook from Past Projects and from Projects.
// The builder and exceljs load only when pressed.
export function StatusReportButton({ T, session, supa, compact }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (session?.role !== "pmo") return null;
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const { downloadStatusReport } = await import("./statusReport.js");
      await downloadStatusReport(supa, session.access_token);
    } catch (e) { setErr(e?.message || "Could not build the report"); }
    finally { setBusy(false); }
  };
  return (
    <Button T={T} variant="ghost" icon={busy ? Loader2 : FileSpreadsheet} onClick={go} disabled={busy} data-status-report
      title={err || "Download the status and progress of every past and current project in one Excel file"}>
      {busy ? "Preparing…" : compact ? "Status" : "Status report"}
    </Button>
  );
}
