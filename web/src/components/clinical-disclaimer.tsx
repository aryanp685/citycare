/**
 * L1: CityCare is decision SUPPORT, not a decision maker (not a medical device; not ABDM-certified).
 * Shown wherever an alert or a record could be mistaken for advice. Server component.
 */
export function ClinicalDisclaimer({ audience }: { audience: "doctor" | "patient" }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted border border-dashed border-line rounded-lg px-3 py-2 mb-4">
      {audience === "doctor"
        ? "Safety alerts are deterministic rule matches on data the patient and prior clinicians entered. They are decision support only — verify against source documents and your own examination. CityCare does not diagnose, prescribe, or replace clinical judgement."
        : "What you see here is your record and rule-based safety information — not a diagnosis or medical advice. Discuss changes to medicines with your doctor. In an emergency call 108 / 112."}
    </p>
  );
}
