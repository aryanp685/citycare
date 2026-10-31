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

export function PrintSummary({ s }: { s: PrintSummary }) {
  return (
    <div id="print-summary" className="print-summary">
      <h1>{s.title}</h1>
      <div className="ps-meta">{s.metaLine}</div>
      <Section title="Patient" lines={s.identityLines} />
      <Section title="Allergies" lines={s.allergyLines} />
      <Section title="Active conditions" lines={s.conditionLines} />
      <Section title="Current medicines (confirmed only)" lines={s.medicationLines} note={s.medicationNote} />
      <Section title="Self-reported readings — latest values" lines={s.observationLines} />
      <Section title="Latest lab values" lines={s.labLines} />
      <Section title="Last visit" lines={s.encounterLines} />
      <div className="ps-footer">
        {s.footerLines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </div>
  );
}
