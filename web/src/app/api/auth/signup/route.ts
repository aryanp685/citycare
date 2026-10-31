import { cookies } from "next/headers";
import { one, tx, run, fail, translatePgError } from "@/lib/db";
import { hashPassword, sessionCookieOpts, SESSION_COOKIE, passwordLooksUsable } from "@/lib/auth";
import { createSession } from "@/lib/sessions";
import { rateLimit, BUCKETS, clientIp } from "@/lib/ratelimit";
import { handler, ok, parseBody } from "@/lib/api";
import { SignupSchema } from "@/lib/validate";
import { guardSameOrigin } from "@/lib/session";
import { appendAudit } from "@/lib/ledger";
import { isMinor, isSeedEmail, DEMO_SEED_DOMAIN, PRIVACY_NOTICE_VERSION, TERMS_VERSION } from "@/lib/legal";

export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  await rateLimit(BUCKETS.signup, clientIp(req)); // D37
  const body = parseBody(SignupSchema, await req.json().catch(() => ({})));

  if (!passwordLooksUsable(body.password)) {
    fail(400, "weak_password", "Password needs at least 10 characters with letters and numbers");
  }

  // L1: @demo.in is reserved for seeded synthetic identities — they are exempt from the demo
  // retention sweep, so nobody may self-register onto that exemption.
  if (isSeedEmail(body.email)) fail(400, "reserved_domain", `@${DEMO_SEED_DOMAIN} addresses are reserved for the seeded demo accounts`);

  // L1 / DPDP s.9: no self-registration under 18 (verifiable guardian consent is F13).
  if (body.role === "PATIENT" && body.dateOfBirth) {
    const dob = new Date(body.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) fail(400, "bad_dob", "Date of birth must be in the past");
    if (isMinor(dob)) {
      fail(400, "minor_needs_guardian", "Accounts for under-18s need verifiable parent/guardian consent (DPDP Act s.9). A guardian flow is on the roadmap; please ask a parent to register.");
    }
  }

  const dup = await one<{ email: string }>(`SELECT email FROM "User" WHERE email = $1 OR phone = $2`, [body.email, body.phone]);
  if (dup) fail(409, "account_exists", "An account with this email or phone already exists");

  const pwHash = await hashPassword(body.password);

  try {
    const { userId, profileId } = await tx(async (c) => {
      const u = await one<{ id: string }>(
        `INSERT INTO "User" (id, email, phone, "passwordHash", role, status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', now(), now()) RETURNING id`,
        [body.email, body.phone, pwHash, body.role],
        c,
      );
      if (!u) fail(500, "insert_failed", "could not create user");
      const uid = u.id;

      let pid: string;
      if (body.role === "PATIENT") {
        const p = await one<{ id: string }>(
          `INSERT INTO "Patient" (id, "userId", "fullName", "dateOfBirth", gender, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now()) RETURNING id`,
          [uid, body.name, body.dateOfBirth ?? null, body.gender],
          c,
        );
        pid = p!.id;
        // cold-start promise: a brand-new patient must be bookable immediately
      } else {
        const spec = await one<{ id: string }>(
          `INSERT INTO "Specialty" (id, name) VALUES (gen_random_uuid(), $1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [body.specialty],
          c,
        );
        const d = await one<{ id: string }>(
          `INSERT INTO "Doctor" (id, "userId", "fullName", qualification, "consultationFee", "registrationNo", "hprId", "isVerified", "createdAt", languages)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, now(), ARRAY['en','hi']) RETURNING id`,
          [uid, body.name, body.qualification, body.consultationFee, body.registrationNo, body.hprId ?? null],
          c,
        );
        pid = d!.id;
        await run(
          `INSERT INTO "DoctorSpecialty" ("doctorId","specialtyId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [pid, spec!.id],
          c,
        );
        // default working hours so a new doctor is instantly bookable:
        // Mon/Wed/Fri 10:00-13:00 and Tue/Thu/Sat 16:00-19:00, 15 min
        const hours = [
          { dow: 1, s: "10:00", e: "13:00" },
          { dow: 2, s: "16:00", e: "19:00" },
          { dow: 3, s: "10:00", e: "13:00" },
          { dow: 4, s: "16:00", e: "19:00" },
          { dow: 5, s: "10:00", e: "13:00" },
          { dow: 6, s: "16:00", e: "19:00" },
        ];
        for (const h of hours) {
          await one(
            `INSERT INTO "AvailabilitySlot" (id, "doctorId", "dayOfWeek", "startTime", "endTime", "slotMinutes", "maxPerSlot", "isActive")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 15, 1, true) RETURNING id`,
            [pid, h.dow, h.s, h.e],
            c,
          );
        }
      }
      // L1: the consent artefact — which notice version was accepted, when (no IP; minimisation)
      await run(
        `INSERT INTO "PolicyAcceptance" ("userId", "policyKey", version) VALUES ($1,'privacy-notice',$2), ($1,'terms',$3)`,
        [uid, PRIVACY_NOTICE_VERSION, TERMS_VERSION],
        c,
      );
      return { userId: uid, profileId: pid };
    });

    await appendAudit(userId, body.role === "PATIENT" ? "ACCOUNT_CREATED" : "DOCTOR_ONBOARDED", body.role === "PATIENT" ? "Patient" : "Doctor", profileId, {
      meta: { privacyNotice: PRIVACY_NOTICE_VERSION, terms: TERMS_VERSION },
    }).catch(() => null);

    const { token } = await createSession({ uid: userId, role: body.role, profileId, userAgent: req.headers.get("user-agent") });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, sessionCookieOpts(req, { embedded: body.embedded }));
    return ok({ role: body.role, name: body.name }, 201);
  } catch (e) {
    translatePgError(e);
  }
});
