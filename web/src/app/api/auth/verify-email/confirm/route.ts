import { run } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { getViewer, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { EmailConfirmSchema } from "@/lib/validate";
import { consumeEmailCode } from "@/lib/recovery";
import { appendAudit } from "@/lib/ledger";

/** POST {code} — marks the account email verified. */
export const POST = handler(async (req) => {
  await guardSameOrigin(req, { allowStaleConsent: true });
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  const b = parseBody(EmailConfirmSchema, await req.json().catch(() => ({})));
  const verdict = await consumeEmailCode(v.uid, "VERIFY", b.code);
  if (verdict !== "ok") fail(400, "bad_code", verdict === "expired" ? "Code expired — request a new one" : verdict === "locked" ? "Too many attempts — request a new code" : "Wrong code");
  await run(`UPDATE "User" SET "emailVerifiedAt" = now(), "updatedAt" = now() WHERE id = $1`, [v.uid]);
  await appendAudit(v.uid, "EMAIL_VERIFIED", "User", v.uid).catch(() => null);
  return ok({ verified: true });
});
