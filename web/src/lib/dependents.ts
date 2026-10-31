import { one, fail } from "./db";

/** F13: at most this many dependents per guardian account. */
export const MAX_DEPENDENTS = 6;

/** The guardian's own (non-dependent) patient profile. */
export async function ownProfile(uid: string) {
  const me = await one<{ id: string; dateOfBirth: Date | null }>(
    `SELECT id, "dateOfBirth" FROM "Patient" WHERE "userId" = $1 AND "guardianPatientId" IS NULL`, [uid],
  );
  if (!me) fail(404, "no_profile", "guardian profile missing");
  return me;
}
