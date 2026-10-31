import { handler, ok } from "@/lib/api";
import { getViewer } from "@/lib/session";
import { fail } from "@/lib/db";
import { liveSessions } from "@/lib/sessions";

/** GET /api/auth/sessions — the user's live sessions (D21 transparency: "where am I signed in?"). */
export const GET = handler(async () => {
  const v = await getViewer();
  if (!v) fail(401, "auth_required", "Sign in first");
  const rows = await liveSessions(v.uid);
  return ok({
    sessions: rows.map((r) => ({
      id: r.id,
      current: r.id === v.sid,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      device: r.uaHash ? `device ${r.uaHash.slice(0, 6)}` : "unknown device",
      actingFor: r.actingForPatientId,
    })),
  });
});
