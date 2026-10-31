import { run, one, all, type Q } from "./db";

export type Severity = "INFO" | "WARNING" | "CRITICAL";
type Note = { title: string; body: string; href?: string | null; severity?: Severity };

/**
 * In-app notification row. Delivery channels (email/SMS) can fan out from here later.
 * F13: a dependent's (login-less) user has no inbox of its own — anything addressed to it is
 * delivered to the guardian, prefixed with the child's name.
 */
export async function notify(userId: string, n: Note, q?: Q): Promise<void> {
  const g = await one<{ gid: string; child: string }>(
    `SELECT gp."userId" AS gid, d."fullName" AS child
       FROM "Patient" d JOIN "Patient" gp ON gp.id = d."guardianPatientId"
      WHERE d."userId" = $1`,
    [userId], q,
  );
  const target = g?.gid ?? userId;
  const title = g ? `${g.child}: ${n.title}` : n.title;
  await run(
    `INSERT INTO "Notification" (id, "userId", channel, title, body, href, severity, "isRead", "createdAt")
     VALUES (gen_random_uuid(), $1, 'IN_APP', $2, $3, $4, $5, false, now())`,
    [target, title.slice(0, 140), n.body.slice(0, 1000), n.href ?? null, n.severity ?? "INFO"],
    q,
  );
}

/** Every SUPER_ADMIN gets the note (grievances, incidents, unjustified overrides). */
export async function notifyAdmins(n: Note, q?: Q): Promise<number> {
  const admins = await all<{ id: string }>(`SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`, [], q);
  for (const a of admins) await notify(a.id, n, q);
  return admins.length;
}
