/**
 * CityCare rule engine — TypeScript port of ai_layer/citycare_ai/rules.py.
 *
 * Deterministic by construction: same record in, same alerts out. No LLM is
 * involved on this path, so "what did the AI hallucinate here?" has the
 * answer "nothing — this table lookup fired because these rows exist".
 *
 * If you change a rule here, mirror it in rules.py and run BOTH test suites
 * (web: npx vitest run; python: python3 -m unittest discover -s ai_layer).
 */

export type AlertType =
  | "DRUG_ALLERGY_CONFLICT"
  | "DRUG_DRUG_INTERACTION"
  | "ABNORMAL_LAB_VALUE"
  | "CHRONIC_FOLLOWUP_DUE";

export type RuleSeverity = "INFO" | "WARNING" | "CRITICAL";

export type RuleAlert = {
  type: AlertType;
  severity: RuleSeverity;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
};

export type RuleRecord = {
  allergies: { allergen: string; isActive?: boolean; severity?: string }[];
  medications: { name: string; genericName?: string | null; isActive?: boolean }[];
  labs: { testName: string; value: string | null; unit?: string | null; refRangeLow?: string | null; refRangeHigh?: string | null; takenOn?: string | null }[];
  encounters: { followUpOn?: string | null; diagnosisText?: string | null }[];
};

// Mirrors rules.py exactly. In production these class tables come from RxNav.
export const PENICILLIN_CLASS = new Set([
  "amoxicillin", "ampicillin", "penicillin", "augmentin", "co-amoxiclav", "piperacillin", "flucloxacillin",
]);
export const NSAID_CLASS = new Set(["ibuprofen", "diclofenac", "naproxen", "mefenamic acid"]);

// a draft medication (OCR'd, unconfirmed) must never drive a clinical alert —
// and must not be silently counted as active either
export function isConfirmedActiveMed(m: { isActive?: boolean; notes?: string | null }): boolean {
  if (m.isActive === false) return false;
  return !m.notes?.startsWith("DRAFT:");
}

export function checkDrugAllergyConflicts(record: RuleRecord): RuleAlert[] {
  const out: RuleAlert[] = [];
  const activeAllergies = record.allergies.filter((a) => a.isActive !== false);
  const meds = record.medications;
  for (const allergy of activeAllergies) {
    const allergen = String(allergy.allergen ?? "").toLowerCase().trim();
    if (!allergen) continue;
    for (const med of meds) {
      const name = String(med.name ?? "").toLowerCase();
      const generic = String(med.genericName ?? "").toLowerCase();
      let hit = name.includes(allergen) || generic.includes(allergen);
      if (!hit && allergen === "penicillin") {
        const firstWord = name ? name.split(/\s+/)[0] : "";
        hit = PENICILLIN_CLASS.has(firstWord) || PENICILLIN_CLASS.has(generic);
      }
      if (hit) {
        out.push({
          type: "DRUG_ALLERGY_CONFLICT",
          severity: "CRITICAL",
          title: `${med.name} conflicts with recorded ${allergen} allergy`,
          message:
            `Patient has a documented ${allergen} allergy (${allergy.severity ?? "WARNING"}) and is ` +
            `prescribed ${med.name}. Verify before dispensing.`,
          evidence: { allergen, medication: med.name },
        });
      }
    }
  }
  return out;
}

// python float() is strict; JS Number('') === 0 is the classic trap —
// so we pre-filter empty/non-strings exactly like the try/except did.
function toFloatStrict(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function checkAbnormalLabs(record: RuleRecord): RuleAlert[] {
  const out: RuleAlert[] = [];
  for (const lab of record.labs) {
    const v = toFloatStrict(lab.value);
    if (v === null) continue;
    const low = toFloatStrict(lab.refRangeLow);
    const high = toFloatStrict(lab.refRangeHigh);
    const abnormal = (low !== null && v < low) || (high !== null && v > high);
    if (!abnormal) continue;
    const above = high !== null && v > high;
    const direction = above ? "above" : "below";
    const bound = above ? high : low;
    const unit = lab.unit ?? "";
    out.push({
      type: "ABNORMAL_LAB_VALUE",
      severity: "WARNING",
      title: `${lab.testName} ${v}${unit} is ${direction} range`,
      message:
        `${lab.testName} = ${v}${unit}; reference range ${low}-${high}. ` +
        `Recorded ${lab.takenOn ?? "date unknown"}.`,
      evidence: { test: lab.testName, value: v, bound },
    });
  }
  return out;
}

function asUtcDayString(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export function checkFollowupsDue(record: RuleRecord, todayISO: string): RuleAlert[] {
  const out: RuleAlert[] = [];
  for (const enc of record.encounters) {
    const fu = asUtcDayString(enc.followUpOn);
    if (!fu || fu > todayISO) continue; // ISO date strings compare lexicographically (safe)
    const daysOver = Math.floor((Date.parse(todayISO + "T00:00:00Z") - Date.parse(fu + "T00:00:00Z")) / 86_400_000);
    out.push({
      type: "CHRONIC_FOLLOWUP_DUE",
      severity: "WARNING",
      title: `Follow-up was due on ${fu}`,
      message: `${daysOver} day(s) overdue for ${enc.diagnosisText ?? "this condition"}.`,
      evidence: { followUpOn: fu },
    });
  }
  return out;
}

export function checkStaleTest(record: RuleRecord, testName: string, maxAgeDays: number, todayISO: string): RuleAlert[] {
  let latest: string | null = null;
  for (const lab of record.labs) {
    if ((lab.testName ?? "").toLowerCase() !== testName.toLowerCase()) continue;
    const d = asUtcDayString(lab.takenOn);
    if (!d) continue;
    if (latest === null || d > latest) latest = d;
  }
  if (latest === null) return [];
  const ageDays = Math.floor((Date.parse(todayISO + "T00:00:00Z") - Date.parse(latest + "T00:00:00Z")) / 86_400_000);
  if (ageDays > maxAgeDays) {
    return [{
      type: "ABNORMAL_LAB_VALUE",
      severity: "WARNING",
      title: `${testName} not repeated for ${ageDays} days`,
      message: `Last ${testName} was on ${latest}, ${ageDays} days ago (policy: repeat within ${maxAgeDays} days for this condition).`,
      evidence: { test: testName, ageDays },
    }];
  }
  return [];
}

/** Structured version of checkAbnormalLabs for digest display (no string titles). */
export function listAbnormalLabs(record: RuleRecord): { testName: string; value: string; unit: string | null; range: string }[] {
  const out: { testName: string; value: string; unit: string | null; range: string }[] = [];
  for (const lab of record.labs) {
    const v = toFloatStrict(lab.value);
    if (v === null) continue;
    const low = toFloatStrict(lab.refRangeLow);
    const high = toFloatStrict(lab.refRangeHigh);
    if ((low !== null && v < low) || (high !== null && v > high)) {
      out.push({ testName: lab.testName, value: String(v), unit: lab.unit ?? null, range: `${low ?? "-"}–${high ?? "-"}` });
    }
  }
  return out;
}

/** Dedupe by (type,title), CRITICAL first — same as run_all() in rules.py. */
export function runAllRules(record: RuleRecord, todayISO: string): RuleAlert[] {
  const alerts = [
    ...checkDrugAllergyConflicts(record),
    ...checkAbnormalLabs(record),
    ...checkFollowupsDue(record, todayISO),
    ...checkStaleTest(record, "HbA1c", 180, todayISO),
  ];
  const seen = new Set<string>();
  const out: RuleAlert[] = [];
  for (const a of alerts) {
    const key = `${a.type}|${a.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  const rank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  out.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  return out;
}
