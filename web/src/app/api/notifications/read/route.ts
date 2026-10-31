import { run } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole, guardSameOrigin } from "@/lib/session";
import { MarkReadSchema } from "@/lib/validate";

/** POST /api/notifications/read { all: true } | { ids: [...] } */
export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole(["PATIENT", "DOCTOR", "SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const body = parseBody(MarkReadSchema, await req.json().catch(() => ({})));
  const n = body.all
    ? await run(`UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND NOT "isRead"`, [v.uid])
    : await run(`UPDATE "Notification" SET "isRead"=true WHERE "userId"=$1 AND id = ANY($2::text[]) AND NOT "isRead"`, [v.uid, body.ids ?? []]);
  return ok({ marked: n });
});
