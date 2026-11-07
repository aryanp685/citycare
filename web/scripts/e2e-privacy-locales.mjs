// Synthetic local HTTP check for the existing privacy-summary translations.
// Run separately against a server with RETENTION_POLICY=demo or internal.
import assert from "node:assert/strict";
const base = new URL(process.env.BASE ?? "http://127.0.0.1:3111");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Local test servers only");
const scenario = process.env.CASE;
if (!["enabled", "disabled"].includes(scenario)) throw new Error("Set CASE=enabled or CASE=disabled");
const disabled = { en: "This deployment does not auto-erase accounts.", hi: "इस तैनाती में खाते अपने आप नहीं मिटाए जाते।", mr: "या प्रणालीमध्ये खाती आपोआप पुसली जात नाहीत." };
const enabled = { en: "Demo accounts are erased 19 days after creation.", hi: "डेमो खाते बनने के 19 दिन बाद मिटाए जाते हैं।", mr: "डेमो खाती तयार झाल्यानंतर 19 दिवसांनी पुसली जातात." };
let count = 0;
for (const lang of ["en", "hi", "mr"]) {
  const response = await fetch(new URL(`/legal/privacy?lang=${lang}`, base));
  const html = await response.text();
  assert.equal(response.status, 200); count++;
  assert.ok(html.includes(`lang="${lang}"`)); count++;
  assert.ok(html.includes((scenario === "enabled" ? enabled : disabled)[lang])); count++;
  if (lang !== "en") { assert.ok(/pending|लंबित|प्रलंबित/i.test(html)); count++; }
}
console.log(`privacy locales ${scenario}: ${count} passed, 0 failed, 0 skipped`);
