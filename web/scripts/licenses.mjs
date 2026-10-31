#!/usr/bin/env node
/**
 * L1 licence gate. Walks the PRODUCTION dependency tree (npm ls --omit=dev --all), reads each
 * package's declared licence and writes src/data/licenses.json for /legal/licenses.
 * Exits 1 on copyleft (GPL/AGPL/LGPL/SSPL), "UNLICENSED" or unknown licences — that is the point:
 * the site cannot ship code it is not permitted to distribute.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOW = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "CC0-1.0", "Unlicense",
  "BlueOak-1.0.0", "MPL-2.0", "Python-2.0", "CC-BY-4.0", "CC-BY-3.0", "Zlib", "MIT-0", "WTFPL",
  // Weak copyleft, dynamically linked, server-side only (libvips inside sharp for Next image
  // optimisation). Not distributed to users, not modified → permitted; still listed for attribution.
  "LGPL-3.0-or-later", "LGPL-3.0", "LGPL-2.1-or-later",
]);
// GSAP 3.13+ ships under its "Standard 'No Charge' License" (free incl. commercial use; SPDX has no id).
const SPECIAL = { gsap: "GSAP Standard 'No Charge' License" };

const tree = JSON.parse(execSync("npm ls --omit=dev --all --json --long=false", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
const seen = new Map();
(function walk(node, path) {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    // optional/peer entries that are not installed (other OS binaries, unused peers) ship nothing → skip
    if (!dep.version || (dep.missing && !dep.path)) continue;
    const key = `${name}@${dep.version}`;
    if (!seen.has(key)) {
      const pkgPath = dep.path ? join(dep.path, "package.json") : findPkg(name, path);
      let license = "UNKNOWN"; let repository = null;
      if (pkgPath && existsSync(pkgPath)) {
        const pj = JSON.parse(readFileSync(pkgPath, "utf8"));
        license = typeof pj.license === "string" ? pj.license : pj.license?.type ?? (Array.isArray(pj.licenses) ? pj.licenses.map((l) => l.type ?? l).join(" OR ") : "UNKNOWN");
        const r = typeof pj.repository === "string" ? pj.repository : pj.repository?.url;
        repository = r ? r.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://") : null;
      }
      if (SPECIAL[name]) license = SPECIAL[name];
      seen.set(key, { name, version: dep.version ?? "?", license, repository });
    }
    walk(dep, dep.path ?? path);
  }
})(tree, process.cwd());

function findPkg(name, from) {
  let dir = from;
  for (let i = 0; i < 12; i++) {
    const p = join(dir, "node_modules", name, "package.json");
    if (existsSync(p)) return p;
    const up = join(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function allowed(lic) {
  if (Object.values(SPECIAL).includes(lic)) return true;
  // SPDX expressions: "(MIT OR Apache-2.0)", "MIT AND ISC", "BSD*"
  const parts = lic.replace(/[()]/g, "").split(/\s+(?:OR|AND)\s+/i).map((s) => s.trim());
  return lic.includes(" OR ") ? parts.some((p) => ALLOW.has(p)) : parts.every((p) => ALLOW.has(p) || p === "BSD*");
}

const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const bad = packages.filter((p) => !allowed(p.license));
mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/licenses.json", JSON.stringify({ generatedAt: new Date().toISOString(), count: packages.length, packages }, null, 1) + "\n");
const summary = packages.reduce((m, p) => (m[p.license] = (m[p.license] ?? 0) + 1, m), {});
console.log(`licenses: ${packages.length} production packages →`, summary);
if (bad.length) {
  console.error("DISALLOWED licences:", bad.map((b) => `${b.name}@${b.version} (${b.license})`).join(", "));
  process.exit(1);
}
