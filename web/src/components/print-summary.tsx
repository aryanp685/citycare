// F18 — the printed visit summary. Server-safe (no "use client"): it renders the lines
// built by lib/print-summary into a block that is display:none on screen and — under
// @media print with :has() in globals.css — becomes the ENTIRE page, everything else
// hidden. Styled with plain CSS (no Tailwind classes) so the printout is deterministic
// regardless of the app's theme.
import type { PrintSummary } from "@/lib/print-summary";

function Section({ title, lines, note }: { title: string; lines: string[]; note?: string | null }) {
  return (
    <div className="ps-section">
      <div className="ps-h">{title}</div>
      <ul className="ps-list">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {note && <div className="ps-note">{note}</div>}
    </div>
  );
}

export function PrintSummary({ s, headings, lang }: { s: PrintSummary; headings?: [string, string, string, string, string, string, string]; lang?: string }) {
  return (
    <div id="print-summary" className="print-summary" lang={lang}>
      <h1>{s.title}</h1>
      <div className="ps-meta">{s.metaLine}</div>
      <Section title={headings?.[0] ?? "Patient"} lines={s.identityLines} />
      <Section title={headings?.[1] ?? "Allergies"} lines={s.allergyLines} />
      <Section title={headings?.[2] ?? "Active conditions"} lines={s.conditionLines} />
      <Section title={headings?.[3] ?? "Current medicines (confirmed only)"} lines={s.medicationLines} note={s.medicationNote} />
      <Section title={headings?.[4] ?? "Self-reported readings — latest values"} lines={s.observationLines} />
      <Section title={headings?.[5] ?? "Latest lab values"} lines={s.labLines} />
      <Section title={headings?.[6] ?? "Last visit"} lines={s.encounterLines} />
      <div className="ps-footer">
        {s.footerLines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </div>
  );
}
