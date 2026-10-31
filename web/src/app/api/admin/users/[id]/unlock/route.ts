import { one } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { fail } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";
import { notify } from "@/lib/notify";

/** POST /api/admin/users/[id]/unlock — D9: an admin clears a lockout (the only path until email OTP exists). */
export const POST = handler(async (req, { params }) => {
  await guardSameOrigin(req);
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const u = await one<{ id: string; email: string }>(
    `UPDATE "User" SET "failedAttempts" = 0, "updatedAt" = now() WHERE id = $1 AND "failedAttempts" > 0 RETURNING id, email`,
    [id],
  );
  if (!u) fail(404, "not_locked", "no locked account with that id");
  await appendAudit(admin.uid, "ACCOUNT_UNLOCKED", "User", id).catch(() => null);
  await notify(id, { title: "Your account was unlocked by an administrator", body: "If you did not request this, change your password and raise a grievance.", href: "/legal/grievance", severity: "WARNING" }).catch(() => null);
  return ok({ id, unlocked: true });
});
