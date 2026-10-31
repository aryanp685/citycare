import { one } from "./db";

/**
 * Consent evaluation — the ONLY gate between a doctor and clinical data.
 * Ported from trust/citycare_trust/deletion.py (AccessControl.check) with two
 * fixes found during porting:
 *   1. expiry must be checked even for non-APPROVED statuses (a REQUESTED
 *      consent that lapsed should not read as "pending" forever), and
 *   2. the clock is the DATABASE clock (now()), never the browser's.
 */

export type ConsentRow = {
  id: string;
  patientId: string;
  doctorId: string;
  status: "REQUESTED" | "APPROVED" | "DENIED" | "REVOKED" | "EXPIRED";
  scope: "FULL_RECORD" | "SUMMARY_ONLY" | "LAST_N_ENCOUNTERS" | "SPECIFIC_CONDITION" | "SPECIFIC_DOCUMENTS";
  purpose: string;
  lastNEncounters: number | null;
  conditionName: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  revokedAt: Date | null;
  isEmergencyOverride?: boolean;
  emergencyReason?: string | null;
};

export type ConsentVerdict =
  | { allowed: true; consent: ConsentRow }
  | { allowed: false; reason: string };

export function evaluateConsent(consent: ConsentRow | null, now: Date): ConsentVerdict {
  if (!consent) return { allowed: false, reason: "no consent has ever been granted for this doctor" };
  if (consent.status === "REVOKED") {
    return { allowed: false, reason: `consent was revoked by the patient at ${consent.revokedAt?.toISOString() ?? "an unknown time"}` };
  }
  if (consent.status === "DENIED") return { allowed: false, reason: "the patient denied this access request" };
  if (consent.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: `consent expired at ${consent.expiresAt.toISOString()}` };
  }
  if (consent.status !== "APPROVED") {
    return { allowed: false, reason: `consent is ${consent.status.toLowerCase()}, not approved` };
  }
  return { allowed: true, consent };
}

/** DB-clock read of the live consent between one doctor and one patient. */
export async function liveConsent(patientId: string, doctorId: string): Promise<{ verdict: ConsentVerdict; now: Date }> {
  const row = await one<ConsentRow & { dbnow: Date }>(
    `SELECT c.*, now() AS "dbnow"
       FROM "Consent" c
      WHERE c."patientId" = $1 AND c."doctorId" = $2
      ORDER BY c."requestedAt" DESC
      LIMIT 1`,
    [patientId, doctorId],
  );
  const now = row?.dbnow ?? new Date();
  return { verdict: evaluateConsent(row ?? null, now), now };
}
