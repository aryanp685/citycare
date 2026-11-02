// Local convenience for CLI scripts: pick named KEY=VALUE lines up from web/.env.local so
// `node scripts/backup.mjs` runs in the sandbox without exporting anything. Values already
// present in the process environment always win. (Same pattern scripts/e2e.mjs uses.)
import { readFileSync } from "node:fs";

export function loadLocalEnv(names, envFile = new URL("../.env.local", import.meta.url)) {
  let text = "";
  try {
    text = readFileSync(envFile, "utf8");
  } catch {
    return; // no .env.local — fine
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || !names.includes(m[1]) || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
