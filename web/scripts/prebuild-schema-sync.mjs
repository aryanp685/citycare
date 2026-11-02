// npm "prebuild" hook — R1 TARGET GATE (2026-11-02, P0 isolation remediation).
//
// History: A76 (2026-11-01) added this hook because Vercel deploys ran `npm run build`
// with nothing applying DB migrations (migration 0005 never reached production and the
// live record pages 500'd). The original version had a single "is DATABASE_URL set?"
// guard and NO target awareness — so Vercel's per-target credential injection meant
// every PREVIEW build connected to the PRODUCTION database and ran the full DDL pass.
//
// Now the decision is the pure, unit-tested gate in src/lib/prebuild-gate-core.mjs:
//   * preview     → hard skip, flag-proof (DATABASE_URL / SCHEMA_SYNC_MODE ignored)
//   * production  → verify (read-only) by default; apply only as an explicit controlled
//                   migration operation (SCHEMA_SYNC_MODE=apply + MIGRATION_TARGET=newest)
//   * development → the explicit local flow (bootstrap when a URL is given, skip when not)
//   * anything else (missing/unknown) → FAIL CLOSED (exit 1)
// There is no fallback connection string anywhere in this chain.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrebuildAction } from "../src/lib/prebuild-gate-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const SCHEMA = path.resolve(WEB, "..", "schema");
const migDir = path.join(SCHEMA, "migrations");
const availableMigrations = fs.existsSync(migDir)
  ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
  : [];

const decision = resolvePrebuildAction(process.env, { availableMigrations });
console.log(`[prebuild] ${decision.reason}`);

if (decision.action === "refuse") {
  console.error(`[prebuild] REFUSED — ${decision.reason}`);
  process.exit(decision.exitCode === 0 ? 1 : decision.exitCode);
}
if (decision.action === "skip") {
  console.log("[prebuild] summary: no database work executed (dml=0 ddl=0)");
  process.exit(0);
}

const worker = decision.action === "verify" ? "db-verify-node.mjs" : "db-bootstrap-node.mjs";
if (decision.action === "apply") {
  console.log(`[prebuild] summary: controlled migration operation — MIGRATION_TARGET=${decision.target} (DDL allowed)`);
} else {
  console.log(`[prebuild] summary: ${decision.action === "verify" ? "read-only verification" : "bootstrap"} via ${worker}`);
}
const r = spawnSync(process.execPath, [path.join(here, worker)], { stdio: "inherit", env: process.env });
process.exit(r.status === null ? 1 : r.status);
