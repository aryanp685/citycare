import { one } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { guardSameOrigin } from "@/lib/session";
import { ForgotSchema } from "@/lib/validate";
import { rateLimit, BUCKETS, clientIp } from "@/lib/ratelimit";
import { issueEmailCode, EMAIL_CODE_TTL_MIN } from "@/lib/recovery";
import { sendEmail, emailDeliveryConfigured } from "@/lib/email";

/**
 * POST /api/auth/forgot {email} — always 200 (no account enumeration). If the account exists a
 * 6-digit code is queued; `delivery` tells the UI whether this deployment can actually email it.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  await rateLimit(BUCKETS.recover, clientIp(req));
  const b = parseBody(ForgotSchema, await req.json().catch(() => ({})));
  const u = await one<{ id: string }>(`SELECT id FROM "User" WHERE lower(email) = $1 AND status = 'ACTIVE' AND "passwordHash" <> '!'`, [b.email]);
  if (u) {
    try {
      await rateLimit(BUCKETS.emailcode, u.id);
      const code = await issueEmailCode(u.id, "RESET");
      await sendEmail({ to: b.email, kind: "RESET", subject: "CityCare password reset code", text: `Your CityCare reset code is ${code}. It expires in ${EMAIL_CODE_TTL_MIN} minutes. If you did not ask for this, ignore this email — nothing changes without the code.` });
    } catch { /* limited: still 200 */ }
  }
  return ok({ accepted: true, delivery: emailDeliveryConfigured() ? "email" : "unavailable", ttlMinutes: EMAIL_CODE_TTL_MIN });
});
