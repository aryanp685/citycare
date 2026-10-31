/**
 * The "AI summary" the patient and doctor see — built with ZERO generation.
 * Every sentence is string interpolation over rows that exist in the DB.
 * This is the honest version of "AI-assisted summaries" for a college
 * project: a COMPUTED digest, clearly labelled, that can never hallucinate.
 * (A future LLM draft must go through ai_layer/grounding.ts before display.)
 */

export type DigestInput = {
  fullName: string;
  age: number | null;
  gender: string;
  bloodGroup: string;
  allergies: { allergen: string; severity: string }[];
  conditions: string[];
  medications: { name: string; dosage: string | null; frequency: string | null; isDraft: boolean }[];
  lastEncounter: { date: string; diagnosis: string | null; doctor: string | null } | null;
  abnormalLabs: { testName: string; value: string; unit: string | null; range: string }[];
  followUpDue: string | null;
};

export function buildDigest(d: DigestInput): { headline: string[]; sections: { title: string; lines: string[] }[] } {
  const headline = [
    `${d.fullName}${d.age !== null ? `, ${d.age}y` : ""}, ${d.gender.toLowerCase()}, ${d.bloodGroup.replace("_", " ")}`,
    d.allergies.length
      ? `ALLERGIES: ${d.allergies.map((a) => `${a.allergen} (${a.severity})`).join(", ")}`
      : "Allergies: none recorded",
    d.conditions.length ? `Active: ${d.conditions.join(", ")}` : "No chronic conditions on file",
  ];

  const sections: { title: string; lines: string[] }[] = [
    {
      title: "Current medications",
      lines: d.medications.length
        ? d.medications.map(
            (m) =>
              `${m.name}${m.dosage ? " " + m.dosage : ""}${m.frequency ? " · " + m.frequency : ""}` +
              (m.isDraft ? "  (draft — patient not confirmed yet)" : ""),
          )
        : ["None recorded"],
    },
    {
      title: "Recent labs outside range (recomputed from stored values, not OCR flags)",
      lines: d.abnormalLabs.length
        ? d.abnormalLabs.map((l) => `${l.testName} ${l.value}${l.unit ?? ""} — ref ${l.range}`)
        : ["All stored labs within their reference ranges"],
    },
    {
      title: "Last encounter",
      lines: d.lastEncounter
        ? [
            `${d.lastEncounter.date}${d.lastEncounter.diagnosis ? " — " + d.lastEncounter.diagnosis : ""}`,
            d.lastEncounter.doctor ? `with ${d.lastEncounter.doctor}` : "",
          ].filter(Boolean)
        : ["No encounters yet — this is a new patient"],
    },
  ];
  if (d.followUpDue) sections.push({ title: "Follow-up due", lines: [`Patient was told to return by ${d.followUpDue}`] });

  return { headline, sections };
}
