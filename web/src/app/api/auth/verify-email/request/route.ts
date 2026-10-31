import { one } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getViewer, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { issueEmailCode, EMAIL_CODE_TTL_MIN } from "@/lib/recovery";
import { sendEmail, emailDeliveryConfigured } from "@/lib/email";

/** POST — queue a 6-digit verification code to the account email. */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  const u = await one<{ email: string; emailVerifiedAt: Date | null }>(`SELECT email, "emailVerifiedAt" FROM "User" WHERE id = $1`, [v.uid]);
  if (!u) fail(404, "no_user", "account missing");
  if (u.emailVerifiedAt) return ok({ alreadyVerified: true });
  await rateLimit(BUCKETS.emailcode, v.uid);
  const code = await issueEmailCode(v.uid, "VERIFY");
  const r = await sendEmail({ to: u.email, kind: "VERIFY", subject: "Verify your CityCare email", text: `Your CityCare verification code is ${code}. It expires in ${EMAIL_CODE_TTL_MIN} minutes.` });
  return ok({ queued: true, delivered: r.delivered, delivery: emailDeliveryConfigured() ? "email" : "unavailable", ttlMinutes: EMAIL_CODE_TTL_MIN });
});
