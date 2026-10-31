# CityCare — Reference Database Schema

Verified, runnable PostgreSQL schema for the CityCare BCA final-year project.

## Quick start

```bash
cd citycare/schema

# 1. point DATABASE_URL at your local Postgres
echo 'DATABASE_URL="postgresql://citycare:citycare@localhost:5432/citycare?schema=public"' > .env

# 2. install Prisma CLI
npm install

# 3. run the full verification (schema -> SQL -> clean DB -> tests)
./run_tests.sh
```

`run_tests.sh` does five things: validates the Prisma schema, regenerates the SQL DDL,
rebuilds a clean database, runs the product-story smoke test, then runs the guardrail
test where every statement is *supposed* to fail.

## What is in here

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Source of truth. 25 models covering identity, appointments, the longitudinal clinical record, consent, AI outputs, alerts, audit and a job queue. |
| `citycare_init.sql` | Generated DDL. 694 lines, 25 tables, 29 explicit `CREATE INDEX` statements, 38 foreign keys. The live database ends up with 71 indexes in total once primary keys, unique constraints and the four guardrails are counted. Regenerate with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`. |
| `sql/constraints.sql` | Guardrails Prisma cannot express: partial unique indexes and an append-only trigger on `AuditLog`. Apply after the migration. |
| `smoke_test.sql` | Seeds one full story (hospital, doctor, patient with 5-year history, appointment, scoped consent, uploaded lab report, alerts) and runs the five queries the app will actually use. |
| `gap_test.sql` | Negative tests. Double-booking, stacked consents, audit-log tampering, duplicate ABHA. |
| `run_tests.sh` | Runs all of the above against a clean database. |

## Design rules baked into the schema

1. **The patient owns the record.** `Patient` is the root of every clinical table. Doctors
   hold a `Consent`, never an ownership link.
2. **Nothing clinical is hard-deleted.** Records use `status` / `isDeleted` / `revokedAt`.
3. **Every clinical read writes an `AuditLog` row**, and a database trigger refuses any
   UPDATE or DELETE on that table — the log cannot be quietly rewritten.
4. **Files never live in the database.** `Document.storageKey` points at object storage;
   the per-file AES-256-GCM IV is stored alongside it.
5. **Access is scoped and expiring.** `Consent` carries scope, purpose, `expiresAt`, and an
   emergency override flag that is always audited.

## The bug this testing caught

The first version of the schema allowed two patients to book the same doctor at the same
instant — the database accepted both rows. `sql/constraints.sql` fixes it with a partial
unique index that excludes terminal appointment states, so a cancelled booking releases its
slot with no application logic. `gap_test.sql` proves both halves: the double-booking is
rejected, and the freed slot becomes bookable again.
