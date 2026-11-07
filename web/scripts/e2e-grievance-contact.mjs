// Public-notice HTTP regression. Run ONLY against a synthetic local server.
// CASE=configured|missing|invalid BASE=http://127.0.0.1:PORT node scripts/e2e-grievance-contact.mjs
import assert from "node:assert/strict";
const base = new URL(process.env.BASE ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Only a local synthetic server may be tested");
const scenario = process.env.CASE;
if (!["configured", "missing", "invalid"].includes(scenario)) throw new Error("Set CASE to configured, missing or invalid");
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
for (const path of ["/legal/privacy", "/legal/grievance"]) {
  const response = await fetch(new URL(path, base));
  const html = await response.text();
  check(response.status === 200, `${path} returns 200`);
  if (scenario === "configured") {
    check(html.includes("Synthetic Officer"), `${path} has configured identity`);
    check(html.includes("synthetic.officer@example.org"), `${path} has configured email`);
    check(html.includes("mailto:synthetic.officer@example.org"), `${path} has email link`);
  } else {
    check(html.includes("Grievance officer contact not yet published"), `${path} reports unpublished`);
    check(!html.includes("Synthetic Officer") && !html.includes("bad-email"), `${path} withholds partial or invalid values`);
    check(!html.includes("mailto:"), `${path} does not publish a mailbox`);
  }
  const mutation = await fetch(new URL(path, base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ officer: "Attacker", email: "attacker@example.org" }) });
  check(mutation.status < 500, `${path} handles unauthenticated modification attempt`);
  const after = await (await fetch(new URL(path, base))).text();
  check(!after.includes("attacker@example.org") && (scenario !== "configured" || after.includes("Synthetic Officer")), `${path} remains unchanged`);
}
console.log(`grievance contact ${scenario}: ${checks} checks passed; 0 skipped`);
