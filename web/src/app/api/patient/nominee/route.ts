import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { NomineeSchema } from "@/lib/validate";
import { one, run } from "@/lib/db";
import { appendAudit } from "@/lib/ledger";

/**
 * L1 — DPDP Act s.14: the patient may nominate a person to exercise their rights
 * (access, correction, erasure, grievance) if they die or become incapable.
 *   GET    → current nominee (or null)
 *   PUT    → set/replace
 *   DELETE → clear
 * Every change is a ledger entry; the nominee's details are erased with the record.
 */
type Row = { nomineeName: string | null; nomineeRelation: string | null; nomineePhone: string | null };
const SEL = `SELECT "nomineeName", "nomineeRelation", "nomineePhone" FROM "Patient" WHERE id=$1`;

function shape(r: Row | null) {
  return r?.nomineeName ? { name: r.nomineeName, relation: r.nomineeRelation, phone: r.nomineePhone } : null;
}

export const GET = handler(async () => {
  const v = await requireRole("PATIENT");
  return ok({ nominee: shape(await one<Row>(SEL, [v.profileId])) });
});

export const PUT = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(NomineeSchema, await req.json().catch(() => ({})));
  await run(
    `UPDATE "Patient" SET "nomineeName"=$2, "nomineeRelation"=$3, "nomineePhone"=$4, "updatedAt"=now() WHERE id=$1`,
    [v.profileId, body.name, body.relation, body.phone],
  );
  await appendAudit(v.uid, "NOMINEE_SET", "Patient", v.profileId, { meta: { relation: body.relation } }).catch(() => null);
  return ok({ nominee: shape(await one<Row>(SEL, [v.profileId])) });
});

export const DELETE = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  await run(`UPDATE "Patient" SET "nomineeName"=NULL, "nomineeRelation"=NULL, "nomineePhone"=NULL, "updatedAt"=now() WHERE id=$1`, [v.profileId]);
  await appendAudit(v.uid, "NOMINEE_CLEARED", "Patient", v.profileId).catch(() => null);
  return ok({ nominee: null });
});
