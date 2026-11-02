// R1 review F1 (2026-11-02) — input validation for the protected migration
// workflow (.github/workflows/migration.yml). Runs BEFORE any database
// connection and fails closed on every check. Only the destination HOST is
// ever logged — never the connection string, never credentials.
//
//   1. MIGRATION_WORKFLOW_COMMIT_SHA — the exact 40-hex commit whose
//      schema/migrations/ is being applied (explicit, recorded in the run log);
//   2. MIGRATION_TARGET — a valid migration filename that EXISTS in the
//      checked-out commit and is its NEWEST migration;
//   3. the migration destination (MIGRATION_DATABASE_URL, else DATABASE_URL) —
//      a valid postgres URL, validated independently of any runtime URL.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dbUrlIdentity } from "../src/lib/prebuild-gate-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const SCHEMA = path.resolve(WEB, "..", "schema");

const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const git = (args) => spawnSync("git", args, { encoding: "utf8" });

const sha = process.env.MIGRATION_WORKFLOW_COMMIT_SHA ?? "";
if (!/^[0-9a-f]{40}$/.test(sha)) {
  die(
    `MIGRATION_WORKFLOW_COMMIT_SHA must be a full 40-hex commit SHA (got: ${JSON.stringify(sha || null)}) — ` +
      "the explicit commit is part of the controlled-operation record",
  );
}
// FINAL REVIEW (2026-11-02): the supplied SHA must be (a) a real commit in THIS
// repository and (b) reachable from the protected production release branch
// (main) — not merely a commit on an arbitrary PR/feature branch. In the
// workflow the working tree is checked out at exactly this SHA, so the
// migration-target check below operates on that commit's schema/migrations.
if (git(["cat-file", "-e", `${sha}^{commit}`]).status !== 0) {
  die(`commit ${sha} is not a commit in this repository — refusing`);
}
const fetchMain = git(["fetch", "origin", "main", "--quiet"]);
if (fetchMain.status !== 0) {
  die(`cannot verify reachability from main (git fetch origin main failed: ${fetchMain.stderr.trim()}) — refusing`);
}
if (git(["merge-base", "--is-ancestor", sha, "FETCH_HEAD"]).status !== 0) {
  die(
    `commit ${sha} is NOT reachable from the protected production release branch (main) — ` +
      "a controlled migration may only apply commits that are already on main (merge it first) — refusing",
  );
}

const migDir = path.join(SCHEMA, "migrations");
const available = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort() : [];
const t = (process.env.MIGRATION_TARGET ?? "").trim();
if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(t)) {
  die(`MIGRATION_TARGET ${JSON.stringify(t)} is not a valid migration filename (expected NNNN_snake_name.sql) — refusing`);
}
if (!available.includes(t)) {
  die(`MIGRATION_TARGET ${t} is not present in schema/migrations of the checked-out commit (available: ${available.join(", ") || "none"}) — refusing`);
}
const newest = available[available.length - 1];
if (t !== newest) {
  die(`MIGRATION_TARGET ${t} is not the NEWEST migration in the checked-out commit (newest: ${newest}) — a controlled operation must name the release it applies — refusing`);
}

const destRaw = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "";
const dest = dbUrlIdentity(destRaw);
if (!dest.ok) {
  die(
    `migration destination ${process.env.MIGRATION_DATABASE_URL ? "MIGRATION_DATABASE_URL" : "DATABASE_URL"} failed validation (${dest.reason}) — ` +
      "refusing before any connection (create the MIGRATION_DATABASE_URL secret for the production environment first)",
  );
}

// FINAL REVIEW (2026-11-02): owner-side prerequisite, reported in EVERY run log.
// Code can enforce the manual-dispatch trigger, the commit/target/destination
// checks, and no-cancel concurrency — but it CANNOT verify that the `production`
// GitHub environment has required reviewers configured. Without that
// configuration the human-approval layer is not active and this run proceeded
// on manual dispatch alone.
console.log(
  "[migration] PREREQUISITE CHECK (owner-side): this run is protected by manual dispatch + no-cancel concurrency " +
    "+ the checks above. The human-approval layer (required reviewers on the GitHub 'production' environment) " +
    "cannot be verified from code — if it is not configured in repo settings, that approval is NOT active for this run.",
);
console.log(`[migration] validated: commit=${sha} (reachable from main) · target=${t} (newest in commit) · destination host: ${dest.host} (credentials never logged)`);
