import type { Metadata } from "next";
import Link from "next/link";
import { recentAnchors, signingKeys } from "@/lib/anchors";
import { fmtIstDateTime } from "@/lib/repo";

export const metadata: Metadata = { title: "Ledger transparency — CityCare" };
export const dynamic = "force-dynamic";

/**
 * D13 — public, read-only proof page. Anyone can copy the public key and a signed head and
 * verify it offline; nothing here identifies a patient or a doctor (only sequence numbers and hashes).
 */
export default async function Transparency() {
  const [anchors, keys] = await Promise.all([recentAnchors(30), Promise.resolve(signingKeys())]);
  return (
    <article>
      <h1>Ledger transparency</h1>
      <p>
        Every access to a patient record is appended to a hash-chained ledger (SHA-256, each row commits to the previous one). A chain proves
        that nothing was <em>edited</em>, but a database owner could still rewrite the whole chain from some point and re-hash it. To make that
        detectable by someone who is <strong>not</strong> us, the head of the chain is anchored once a day:
      </p>
      <ol>
        <li>the digest <code>sha256(seq + &quot;:&quot; + headHash)</code> is signed with CityCare&apos;s Ed25519 key (public key below);</li>
        <li>the same digest is submitted, best-effort, to public <a href="https://opentimestamps.org" target="_blank" rel="noopener noreferrer">OpenTimestamps</a> calendars, which later commit it into the Bitcoin blockchain — an independent, third-party timestamp;</li>
        <li>the signed head is published here and at <code>GET /api/ledger/anchors</code>; a pending/complete <code>.ots</code> receipt is downloadable per anchor.</li>
      </ol>
      <p className="text-sm">
        <strong>What this does and does not prove.</strong> A signature proves the head existed with that value when CityCare signed it; an OTS receipt
        proves it existed <em>before</em> the Bitcoin block it is attested in (receipts upgrade from &quot;pending&quot; to &quot;complete&quot; after a few hours; run
        <code>ots upgrade</code> / <code>ots verify</code> with the open-source client). Neither reveals any personal data, and neither replaces the daily
        in-database integrity check (<code>/api/health</code> → <code>ledgerBreaks</code>). If a later anchor&apos;s chain does not contain an earlier anchored head, history was rewritten.
      </p>

      <h2>Public key</h2>
      {keys ? (
        <pre className="text-xs break-all whitespace-pre-wrap"><code>Ed25519 SPKI (base64):{"\n"}{keys.pubB64}</code></pre>
      ) : (
        <p className="callout">Signing key not configured on this deployment — heads are recorded and timestamped but not signed. Operators: set <code>ANCHOR_SIGNING_KEY</code>.</p>
      )}

      <h2>Recent anchors</h2>
      {anchors.length === 0 ? (
        <p className="text-sm text-muted">No anchors yet — the first one is written by the nightly job.</p>
      ) : (
        <table className="text-xs">
          <thead><tr><th>Anchored (IST)</th><th>Ledger seq</th><th>Head hash</th><th>Signature</th><th>OTS</th></tr></thead>
          <tbody>
            {anchors.map((a) => (
              <tr key={a.id}>
                <td>{fmtIstDateTime(a.anchoredAt)}</td>
                <td>{a.seq}</td>
                <td className="break-all"><code>{a.headHash}</code></td>
                <td className="break-all">{a.signature ? <code title={a.signature}>{a.signature.slice(0, 24)}…</code> : "—"}</td>
                <td>{a.hasOts ? <a href={`/api/ledger/anchors/${a.seq}/ots`}>receipt (.ots)</a> : "not submitted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Verify one yourself</h2>
      <pre className="text-xs whitespace-pre-wrap"><code>{`# 1. digest
printf '%s:%s' "<seq>" "<headHash>" | sha256sum        # → <digest>
# 2. signature (Node ≥ 20)
node -e 'const c=require("crypto");const pub=c.createPublicKey({key:Buffer.from(process.argv[1],"base64"),format:"der",type:"spki"});
console.log(c.verify(null,Buffer.from(process.argv[2],"hex"),pub,Buffer.from(process.argv[3],"base64")))' "<publicKey>" "<digest>" "<signature>"
# 3. third-party timestamp (pip install opentimestamps-client)
ots verify --digest <digest> anchor-<seq>.ots`}</code></pre>
      <p className="text-sm"><Link href="/legal/privacy#9">Back to the privacy notice §9</Link>.</p>
    </article>
  );
}
