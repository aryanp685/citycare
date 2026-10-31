import { cookies } from "next/headers";
import { one, run } from "@/lib/db";
import { verifyPassword, hashPassword, needsRehash, scryptCost, sessionCookieOpts, SESSION_COOKIE } from "@/lib/auth";
import { createSession } from "@/lib/sessions";
import { rateLimit, BUCKETS, clientIp } from "@/lib/ratelimit";
import { handler, ok, err, parseBody } from "@/lib/api";
import { LoginSchema } from "@/lib/validate";
import { guardSameOrigin } from "@/lib/session";

const MAX_FAILED = 5;
// A permanent lock is a denial-of-service primitive: anyone who knows a victim's email can
// lock them out forever with five wrong guesses, and there is no password-reset flow to
// recover. A sliding 15-minute window keeps the brute-force cost (≤ 5 guesses / 15 min) while
// making the lock self-healing. Bug A38.
const LOCK_MINUTES = 15;

export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true }); // logging in is how you get to the re-accept banner
  await rateLimit(BUCKETS.login, clientIp(req)); // D37: per-IP ceiling before any scrypt work
  const body = parseBody(LoginSchema, await req.json().catch(() => ({})));

  const u = await one<{
    id: string; role: string; status: string; passwordHash: string; failedAttempts: number;
    secondsSinceUpdate: number; patientId: string | null; doctorId: string | null;
  }>(
    `SELECT u.id, u.role, u.status, u."passwordHash", u."failedAttempts",
            GREATEST(0, EXTRACT(EPOCH FROM (now() - u."updatedAt")))::int AS "secondsSinceUpdate",
            p.id AS "patientId", d.id AS "doctorId"
       FROM "User" u
       LEFT JOIN "Patient" p ON p."userId" = u.id
       LEFT JOIN "Doctor"  d ON d."userId" = u.id
      WHERE u.email = $1`,
    [body.email],
  );

  // Same message for "no such user" and "wrong password" — no account enumeration.
  const genericErr = ok({ error: "Invalid email or password", code: "bad_credentials" }, 401);

  if (!u) {
    // burn ~scrypt-equivalent time so the missing-user path is not faster
    await verifyPassword(body.password, `scrypt$${scryptCost()}$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`);
    return genericErr;
  }

  if (u.failedAttempts >= MAX_FAILED) {
    // "updatedAt" is bumped on every failed attempt, so it marks the start of the window.
    // Age is computed in SQL (now() - updatedAt) — no JS/session time-zone arithmetic.
    const leftSec = LOCK_MINUTES * 60 - u.secondsSinceUpdate;
    if (leftSec > 0) {
      const leftMin = Math.max(1, Math.ceil(leftSec / 60));
      return err(429, "locked", `Too many failed attempts. Try again in ${leftMin} min.`, { retryAfterMin: leftMin });
    }
    // window elapsed → exactly one more attempt; a wrong one re-locks for LOCK_MINUTES
  }

  const good = await verifyPassword(body.password, u.passwordHash);
  if (!good) {
    await run(`UPDATE "User" SET "failedAttempts" = "failedAttempts" + 1, "updatedAt" = now() WHERE id = $1`, [u.id]);
    return genericErr;
  }
  // Transparent upgrade: hashes made at a lower cost than today's default are re-hashed
  // on the next successful login (the stored string carries its own N — see auth.ts). Bug A39.
  if (needsRehash(u.passwordHash)) {
    await run(`UPDATE "User" SET "passwordHash" = $2, "updatedAt" = now() WHERE id = $1`, [u.id, await hashPassword(body.password)]);
  }

  if (u.status === "DELETED") {
    return ok({ error: "This account was erased at the owner's request.", code: "deleted" }, 403);
  }
  if (u.status !== "ACTIVE") {
    return ok({ error: `Account is ${u.status.toLowerCase()}`, code: "inactive" }, 403);
  }

  await run(`UPDATE "User" SET "failedAttempts" = 0, "lastLoginAt" = now(), "updatedAt" = now() WHERE id = $1`, [u.id]);

  const profileId = u.role === "PATIENT" ? u.patientId : u.role === "DOCTOR" ? u.doctorId : u.id;
  if (!profileId) return ok({ error: "Account is missing its profile — contact support.", code: "no_profile" }, 500);

  const { token } = await createSession({ uid: u.id, role: u.role as "PATIENT", profileId, userAgent: req.headers.get("user-agent") });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOpts(req, { embedded: body.embedded }));
  return ok({ role: u.role });
});
