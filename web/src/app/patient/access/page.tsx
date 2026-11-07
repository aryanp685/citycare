import { viewerForPage } from "@/lib/session";
import { all } from "@/lib/db";
import { Card, SectionTitle, EmptyNote, Badge } from "@/components/ui";
import { LedgerPanel } from "@/components/ledger-panel";
import { PurgePanel } from "@/components/purge-panel";
import { NomineeForm } from "@/components/nominee-form";
import { SecurityPanel } from "@/components/security-panel";
import { consentStatus } from "@/lib/session";
import Link from "next/link";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal";
import { ConsentActions } from "@/components/consent-actions";
import { fmtIstDateTime } from "@/lib/repo";

export default async function AccessPage() {
  const v = await viewerForPage("PATIENT");
  const accepted = await consentStatus(v.uid);
  const pid = v.profileId;

  const consents = await all<Record<string, unknown>>(
    `SELECT c.id, CASE WHEN c.status IN ('REQUESTED','APPROVED') AND c."expiresAt" <= now() THEN 'EXPIRED' ELSE c.status::text END AS status, c.scope, c.purpose, c."expiresAt", c."revokedAt", c."revocationReason", c."doctorId",
            c."isEmergencyOverride", c."emergencyReason",
            d."fullName" AS "doctorName",
            (SELECT count(*)::int FROM "AuditLog" al WHERE al."consentId"=c.id) AS "accessCount"
       FROM "Consent" c JOIN "Doctor" d ON d.id = c."doctorId"
      WHERE c."patientId"=$1
      ORDER BY c."requestedAt" DESC LIMIT 30`,
    [pid],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-w-0">
      <Card className="min-w-0">
        <SectionTitle right={<Badge tone="off">Server checked</Badge>}>
          Who can see my record
        </SectionTitle>
        {consents.length === 0 ? (
          <EmptyNote>No sharing requests or consents found.</EmptyNote>
        ) : (
          <div className="grid gap-3">
            {consents.map((cc) => <div key={String(cc.id)} className="rounded-xl border border-line p-4 min-w-0">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div><h3 className="font-semibold break-words">{String(cc.doctorName)}</h3><p className="text-xs text-muted mt-1">{String(cc.purpose).replaceAll("_", " ").toLowerCase()}</p></div>
                <Badge tone={cc.status === "APPROVED" ? "live" : cc.status === "REQUESTED" ? "warn" : "off"}>{String(cc.status)}</Badge>
              </div>
              {cc.isEmergencyOverride ? <div className="mt-2"><Badge tone="crit">EMERGENCY · break-glass</Badge>{cc.emergencyReason ? <p className="text-xs text-muted mt-1 break-words">Reason: {String(cc.emergencyReason)}</p> : null}</div> : null}
              <dl className="grid sm:grid-cols-3 gap-2 mt-3 text-sm"><div><dt className="text-xs text-muted">Scope</dt><dd>{String(cc.scope).replaceAll("_", " ").toLowerCase()}</dd></div><div><dt className="text-xs text-muted">Valid until</dt><dd>{cc.expiresAt ? fmtIstDateTime(String(cc.expiresAt)) : "—"}</dd></div><div><dt className="text-xs text-muted">Logged events</dt><dd>{Number(cc.accessCount)}</dd></div></dl>
              {(cc.status === "REQUESTED" || cc.status === "APPROVED") && <ConsentActions compact consent={{ id: String(cc.id), doctorId: String(cc.doctorId), doctorName: String(cc.doctorName), status: String(cc.status), scope: String(cc.scope), expiresAt: cc.expiresAt ? String(cc.expiresAt) : null }} />}
            </div>)}
          </div>
        )}
      </Card>

      <Card className="min-w-0">
        <SectionTitle right={<Badge tone="live">DB append-only</Badge>}>
          Who touched my data — and can I prove it?
        </SectionTitle>
        <p className="text-sm text-muted mb-3">
          This is the same ledger your doctors&apos; accesses are written into. Every row&apos;s hash covers the
          row before it, so if anyone (including the person who runs this server) edits or removes
          one line, verification below fails and names the exact row.
        </p>
        <LedgerPanel />
      </Card>

      <Card className="min-w-0">
        <SectionTitle>Your rights &amp; nominee</SectionTitle>
        <p className="text-sm text-muted mb-3">
          Access, correction, erasure and grievance are buttons on this account, not emails to send — see the{" "}
          <Link href="/legal/grievance" className="text-brand font-semibold">rights page</Link>. You accepted privacy notice{" "}
          <span className="kbd">v{accepted.accepted ?? "—"}</span>{accepted.current ? "" : ` (current is v${PRIVACY_NOTICE_VERSION} — see the banner)`} (<Link href="/legal/privacy" className="text-brand font-semibold">read it</Link>).
        </p>
        <NomineeForm />
      </Card>

      <Card className="min-w-0">
        <SectionTitle right={<Badge tone="off">recovery · email · devices</Badge>}>Account security</SectionTitle>
        <SecurityPanel />
      </Card>

      <Card className="border-red-200">
        <SectionTitle>Right to erasure</SectionTitle>
        <PurgePanel />
      </Card>
    </div>
  );
}
