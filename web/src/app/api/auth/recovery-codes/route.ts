import { one } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getViewer, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";
import { issueRecoveryCodes, remainingRecoveryCodes } from "@/lib/recovery";
import { emailDeliveryConfigured } from "@/lib/email";

/** GET → security summary; POST → a fresh set of 8 recovery codes (shown once; old set invalidated). */
export const GET = handler(async () => {
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  const [remaining, u] = await Promise.all([
    remainingRecoveryCodes(v.uid),
    one<{ email: string; emailVerifiedAt: Date | null }>(`SELECT email, "emailVerifiedAt" FROM "User" WHERE id = $1`, [v.uid]),
  ]);
  return ok({ remaining, email: u?.email ?? null, emailVerified: !!u?.emailVerifiedAt, emailDelivery: emailDeliveryConfigured() });
});

export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true }); // recovery must never be blocked
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  if (v.actingFor) fail(403, "no_dependent", "Switch back to your own account to manage recovery codes");
  const codes = await issueRecoveryCodes(v.uid);
  await appendAudit(v.uid, "RECOVERY_CODES_GENERATED", "User", v.uid, { meta: { count: codes.length } }).catch(() => null);
  return ok({ codes, remaining: codes.length }, 201);
});
