import { one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { RecoverSchema } from "@/lib/validate";
import { rateLimit, BUCKETS, clientIp } from "@/lib/ratelimit";
import { consumeRecoveryCode, resetPasswordAndUnlock } from "@/lib/recovery";

/**
 * POST /api/auth/recover {email, code, newPassword} — public. One recovery code = one password
 * reset + lockout clear + sign-out-everywhere. Per-IP limited; the response never says whether
 * the email exists.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  await rateLimit(BUCKETS.recover, clientIp(req));
  const b = parseBody(RecoverSchema, await req.json().catch(() => ({})));
  const u = await one<{ id: string; status: string }>(`SELECT id, status FROM "User" WHERE lower(email) = $1`, [b.email]);
  const okCode = u && u.status === "ACTIVE" ? await consumeRecoveryCode(u.id, b.code) : false;
  if (!okCode) fail(401, "bad_code", "That email and recovery code do not match (each code works once)");
  await resetPasswordAndUnlock(u!.id, b.newPassword, "recovery_code");
  return ok({ reset: true });
});
