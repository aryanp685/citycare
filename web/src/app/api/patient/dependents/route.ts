import { all, one, run, tx, fail } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { DependentSchema } from "@/lib/validate";
import { appendAudit } from "@/lib/ledger";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { isMinor, ageOn, PRIVACY_NOTICE_VERSION, TERMS_VERSION } from "@/lib/legal";
import { MAX_DEPENDENTS, ownProfile } from "@/lib/dependents";


/**
 * F13 / L-G4 — dependents (minors) under an adult guardian (DPDP s.9, Rules r.10).
 * The guardian consents on the child's behalf; verification of the guardian being an adult uses
 * the age details they provided (r.10(b)) — their recorded date of birth — plus the sign-up
 * attestation. Honest limit: this is self-declared, not a DigiLocker token. A dependent has a
 * login-less user row (password '!'); the guardian "switches" into the profile; every action is
 * ledgered under the GUARDIAN's user id; notifications route to the guardian.
 */
export const GET = handler(async () => {
  const v = await requireRole("PATIENT");
  const me = await ownProfile(v.uid);
  const rows = await all<{ id: string; fullName: string; dateOfBirth: Date; gender: string; guardianRelation: string; createdAt: Date }>(
    `SELECT id, "fullName", "dateOfBirth", gender::text AS gender, "guardianRelation", "createdAt" FROM "Patient"
      WHERE "guardianPatientId" = $1 AND "fullName" <> '[REDACTED]' ORDER BY "createdAt"`,
    [me.id],
  );
  const now = new Date();
  return ok({
    actingFor: v.actingFor ?? null,
    dependents: rows.map((d) => ({ id: d.id, name: d.fullName, dateOfBirth: d.dateOfBirth.toISOString().slice(0, 10), age: ageOn(d.dateOfBirth, now), gender: d.gender, relation: d.guardianRelation, since: d.createdAt.toISOString() })),
    max: MAX_DEPENDENTS,
  });
});

export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  if (v.actingFor) fail(403, "no_nesting", "Switch back to your own account to manage dependents");
  await rateLimit(BUCKETS.dependents, v.uid);
  const b = parseBody(DependentSchema, await req.json().catch(() => ({})));
  const me = await ownProfile(v.uid);

  // guardian must be a verified-by-details adult (r.10): DOB on record, or supplied now and stored
  let gdob = me.dateOfBirth;
  if (!gdob) {
    if (!b.guardianDateOfBirth) fail(400, "guardian_dob_required", "Add your own date of birth first — it is how we check you are an adult (DPDP Rules r.10).");
    gdob = new Date(b.guardianDateOfBirth);
    if (Number.isNaN(gdob.getTime()) || gdob > new Date()) fail(400, "bad_dob", "Your date of birth must be in the past");
  }
  if (isMinor(gdob)) fail(403, "guardian_not_adult", "Only an adult (18+) can register a dependent");

  const dob = new Date(b.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) fail(400, "bad_dob", "Date of birth must be in the past");
  if (!isMinor(dob)) fail(400, "not_a_minor", "An adult must register their own account (and give their own consent)");

  const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "Patient" WHERE "guardianPatientId" = $1 AND "fullName" <> '[REDACTED]'`, [me.id]);
  if ((n?.n ?? 0) >= MAX_DEPENDENTS) fail(409, "too_many_dependents", `At most ${MAX_DEPENDENTS} dependents per guardian`);

  const dep = await tx(async (c) => {
    if (!me.dateOfBirth) await run(`UPDATE "Patient" SET "dateOfBirth" = $2, "updatedAt" = now() WHERE id = $1`, [me.id, gdob], c);
    const u = await one<{ id: string }>(
      `INSERT INTO "User" (id, email, phone, "passwordHash", role, status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'dep-' || substr(md5(random()::text), 1, 12) || '@dependents.invalid', '000' || substr(md5(random()::text), 1, 7), '!', 'PATIENT', 'ACTIVE', now(), now())
       RETURNING id`,
      [], c,
    );
    const p = await one<{ id: string }>(
      `INSERT INTO "Patient" (id, "userId", "fullName", "dateOfBirth", gender, "guardianPatientId", "guardianRelation", city, state, "createdAt", "updatedAt")
       SELECT gen_random_uuid(), $1, $2, $3, $4::"Gender", $5, $6, g.city, g.state, now(), now() FROM "Patient" g WHERE g.id = $5
       RETURNING id`,
      [u!.id, b.name, dob, b.gender, me.id, b.relation], c,
    );
    await run(
      `INSERT INTO "PolicyAcceptance" ("userId", "policyKey", version, "acceptedByUserId") VALUES ($1,'privacy-notice',$2,$3), ($1,'terms',$4,$3)`,
      [u!.id, PRIVACY_NOTICE_VERSION, v.uid, TERMS_VERSION], c,
    );
    return { id: p!.id, userId: u!.id };
  });
  await appendAudit(v.uid, "DEPENDENT_ADDED", "Patient", dep.id, { meta: { relation: b.relation, guardianPatientId: me.id } }).catch(() => null);
  return ok({ id: dep.id, name: b.name, age: ageOn(dob, new Date()), relation: b.relation }, 201);
});
