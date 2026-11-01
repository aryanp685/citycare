// npm "prebuild" hook — schema sync before every build.
//
// Why this exists (A76, 2026-11-01): Vercel git deploys run `npm run build` but NOTHING
// applied DB migrations — the schema only moved when a human ran db-bootstrap-node.mjs.
// F5's migration 0005 therefore never reached production, and the new recordSections
// query (`SELECT … "refLow", "refHigh" FROM "Observation"`) 500'd every record page
// (/patient, /patient/records, doctor record API) on the live site.
//
// From now on: build = code + schema move together.
//   * Vercel (DATABASE_URL set): runs the full idempotent bootstrap — base SQL only on a
//     fresh DB, migrations 0001… always, seed only when there are no users, then its
//     assertions. A schema the code cannot run against fails the build LOUDLY instead
//     of shipping a broken deploy.
//   * Local without DATABASE_URL exported: no-op (plain `npx next build` is untouched).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.log("[prebuild] DATABASE_URL not set — skipping schema sync (fine for local-only builds)");
  process.exit(0);
}

const r = spawnSync(process.execPath, [path.join(here, "db-bootstrap-node.mjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
