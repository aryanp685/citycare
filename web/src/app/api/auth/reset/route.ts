import { one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { ResetSchema } from "@/lib/validate";
import { rateLimit, BUCKETS, clientIp } from "@/lib/ratelimit";
import { consumeEmailCode, resetPasswordAndUnlock } from "@/lib/recovery";

/** POST /api/auth/reset {email, code, newPassword} — completes the emailed-code flow. */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  await rateLimit(BUCKETS.recover, clientIp(req));
  const b = parseBody(ResetSchema, await req.json().catch(() => ({})));
  const u = await one<{ id: string }>(`SELECT id FROM "User" WHERE lower(email) = $1 AND status = 'ACTIVE'`, [b.email]);
  const verdict = u ? await consumeEmailCode(u.id, "RESET", b.code) : "bad";
  if (verdict !== "ok") fail(401, "bad_code", verdict === "expired" ? "That code has expired — request a new one" : verdict === "locked" ? "Too many attempts — request a new code" : "That email and code do not match");
  await resetPasswordAndUnlock(u!.id, b.newPassword, "email_code");
  return ok({ reset: true });
});
