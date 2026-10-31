"use client";
// F18 — the "Print / save as PDF" action. window.print() with the @media print rules in
// globals.css turns the hidden #print-summary block into the whole page; the browser's
// native "Save as PDF" target gives the PDF — no PDF library, no server-side rendering of
// the file. With logExport=true the patient's own export is ledgered first (same pattern
// as the FHIR export: the export itself is an auditable act).
import { useState } from "react";
import { callApi } from "./api-client";

export function PrintButton({ logExport = false, label = "Print / save as PDF" }: { logExport?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        if (logExport) await callApi("/api/patient/print-summary", { method: "POST", body: {} });
        // let the disable state paint before the print dialog freezes the page
        setTimeout(() => {
          window.print();
          setBusy(false);
        }, 30);
      }}
    >
      {busy ? "…" : `🖨 ${label}`}
    </button>
  );
}
