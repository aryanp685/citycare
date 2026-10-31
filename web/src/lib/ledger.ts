import { one, all, type Q } from "./db";

/**
 * TS face of the Postgres ledger (schema/sql/ledger.sql).
 *
 * We deliberately do NOT re-implement hashing here — the DB computes it, so
 * every writer (web app, seed script, psql admin) produces the same chain.
 * pgcrypto digest() is single-threaded per statement + pg_advisory_xact_lock
 * serialises appends, so no client-side race can fork the chain.
 */

export type LedgerRow = {
  seq: string; // bigint comes back as string from pg
  createdAt: Date;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entryHash: string;
  prevHash: string;
};

export async function appendAudit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  opts: { consentId?: string | null; meta?: Record<string, unknown> | null; q?: Q } = {},
): Promise<{ seq: string; hash: string }> {
  const row = await one<{ out_seq: string; out_hash: string }>(
    `SELECT * FROM ledger_append($1::uuid, $2, $3, $4, $5::uuid, $6::jsonb)`,
    [actorId, action, entityType, entityId, opts.consentId ?? null, opts.meta ? JSON.stringify(opts.meta) : null],
    opts.q,
  );
  if (!row) throw new Error("ledger_append returned no row"); // should be impossible
  return { seq: row.out_seq, hash: row.out_hash };
}

export type ChainBreak = { seq: string; reason: string; expected: string; found: string };

export async function verifyChain(): Promise<{ intact: boolean; breaks: ChainBreak[]; entries: number }> {
  const breaks = await all<ChainBreak>(
    `SELECT at_seq::text AS "seq", why AS "reason", expected_hash AS "expected", found_hash AS "found" FROM ledger_verify()`,
  );
  const n = await one<{ c: string }>(`SELECT count(*)::text AS c FROM "AuditLog"`);
  return { intact: breaks.length === 0, breaks, entries: Number(n?.c ?? 0) };
}

/** Everything a patient can see about their own record in the log.
 *  Survives purge: clinical rows may be gone, but log entries are keyed by
 *  Patient id / consentId, which we retain. */
/** D37: keyset pagination — `before` is the seq of the oldest row already shown (exclusive). */
export async function ledgerForPatient(patientId: string, limit = 100, before?: string | null): Promise<LedgerRow[]> {
  return all<LedgerRow>(
    `SELECT a."seq"::text, a."createdAt", a."actorId",
            COALESCE(p."fullName", d."fullName", 'deleted user') AS "actorName",
            u.role AS "actorRole",
            a.action, a."entityType", a."entityId", a."entryHash", a."prevHash"
       FROM "AuditLog" a
       LEFT JOIN "User" u ON u.id = a."actorId"
       LEFT JOIN "Patient" p ON p."userId" = u.id
       LEFT JOIN "Doctor"  d ON d."userId" = u.id
      WHERE ((a."entityType" = 'Patient' AND a."entityId" = $1)
         OR (a."consentId" IS NOT NULL
             AND a."consentId" IN (SELECT c.id FROM "Consent" c WHERE c."patientId" = $1))
         -- A57: account-level events about ME (policy acceptance, unlock) and grievances I filed were
         -- invisible on the transparency page because they are keyed by User/Grievance, not Patient.
         OR (a."entityType" = 'User' AND a."entityId" = (SELECT p2."userId" FROM "Patient" p2 WHERE p2.id = $1))
         OR (a."entityType" = 'Grievance' AND a."entityId" IN (SELECT g.id::text FROM "Grievance" g JOIN "Patient" p3 ON p3."userId" = g."userId" WHERE p3.id = $1)))
        AND ($3::bigint IS NULL OR a."seq" < $3::bigint)
      ORDER BY a."seq" DESC
      LIMIT $2`,
    [patientId, limit, before ?? null],
  );
}
