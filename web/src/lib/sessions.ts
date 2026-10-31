import crypto from "node:crypto";
import { one, run, all, type Q } from "./db";
import { signSession, type SessionPayload } from "./auth";

/**
 * D21/D8 — server-side sessions. The signed cookie names a row here; `getViewer()` refuses a
 * token whose row is revoked or expired, so logout, "sign out everywhere", erasure and admin
 * suspension all take effect on the very next request — not when a 7-day JWT happens to expire.
 */
export const SESSION_DAYS = 7;          // idle timeout (slides on activity)
export const SESSION_MAX_DAYS = 30;     // absolute cap from creation

export type NewSession = {
  uid: string;
  role: SessionPayload["role"];
  profileId: string;
  actingFor?: string | null;
  userAgent?: string | null;
};

export async function createSession(s: NewSession, q?: Q): Promise<{ token: string; sid: string }> {
  const uaHash = s.userAgent ? crypto.createHash("sha256").update(s.userAgent).digest("hex").slice(0, 16) : null;
  const row = await one<{ id: string }>(
    `INSERT INTO "Session" ("userId", role, "profileId", "actingForPatientId", "uaHash", "expiresAt")
     VALUES ($1, $2::"Role", $3, $4, $5, now() + make_interval(days => $6))
     RETURNING id`,
    [s.uid, s.role, s.profileId, s.actingFor ?? null, uaHash, SESSION_DAYS],
    q,
  );
  if (!row) throw new Error("session insert returned no row");
  const token = await signSession({ uid: s.uid, role: s.role, profileId: s.profileId, sid: row.id, actingFor: s.actingFor ?? null });
  return { token, sid: row.id };
}

export async function revokeSession(sid: string, q?: Q): Promise<void> {
  await run(`UPDATE "Session" SET "revokedAt" = now() WHERE id = $1::uuid AND "revokedAt" IS NULL`, [sid], q);
}

/** Everything for the user (logout-everywhere, erasure, suspension). Returns how many were live. */
export async function revokeAllSessions(uid: string, q?: Q): Promise<number> {
  return run(`UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`, [uid], q);
}

export type SessionRow = { id: string; createdAt: Date; expiresAt: Date; uaHash: string | null; actingForPatientId: string | null };
export async function liveSessions(uid: string): Promise<SessionRow[]> {
  return all<SessionRow>(
    `SELECT id, "createdAt", "expiresAt", "uaHash", "actingForPatientId" FROM "Session"
      WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()
      ORDER BY "createdAt" DESC LIMIT 50`,
    [uid],
  );
}

/** Housekeeping for the daily cron: rows that can never validate again and are past any forensic interest. */
export async function pruneSessions(q?: Q): Promise<number> {
  return run(`DELETE FROM "Session" WHERE ("revokedAt" IS NOT NULL OR "expiresAt" < now()) AND "createdAt" < now() - interval '30 days'`, [], q);
}
