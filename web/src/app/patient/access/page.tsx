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
    `SELECT c.id, c.status, c.scope, c."expiresAt", c."revokedAt", c."revocationReason", c."doctorId",
            c."isEmergencyOverride", c."emergencyReason",
            d."fullName" AS "doctorName",
            (SELECT count(*)::int FROM "AuditLog" al WHERE al."consentId"=c.id) AS "accessCount"
       FROM "Consent" c JOIN "Doctor" d ON d.id = c."doctorId"
      WHERE c."patientId"=$1
      ORDER BY c."requestedAt" DESC LIMIT 30`,
    [pid],
  );

  return (
    <div className="grid gap-4">
      <Card>
        <SectionTitle right={<Badge tone="off">server re-checks every request</Badge>}>
          Who can see my record
        </SectionTitle>
        {consents.length === 0 ? (
          <EmptyNote>No one. Not the hospital, not a doctor, not an admin — this page is the whole truth.</EmptyNote>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Doctor</th><th>Status</th><th>Scope</th><th>Valid until</th><th>Accesses</th><th></th>
              </tr>
            </thead>
            <tbody>
              {consents.map((cc) => (
                <tr key={String(cc.id)}>
                  <td className="font-semibold">{String(cc.doctorName)}</td>
                  <td>
                    <Badge tone={cc.status === "APPROVED" ? "live" : cc.status === "REQUESTED" ? "warn" : "off"}>
                      {String(cc.status)}
                    </Badge>
                    {cc.isEmergencyOverride ? (
                      <div className="mt-1">
                        <Badge tone="crit">EMERGENCY · break-glass</Badge>
                        {cc.emergencyReason ? <div className="text-[11px] text-muted mt-1 max-w-[16rem]">reason: {String(cc.emergencyReason)}</div> : null}
                      </div>
                    ) : null}
                    {cc.status === "REVOKED" && cc.revokedAt ? (
                      <div className="text-[11px] text-muted mt-1">closed {fmtIstDateTime(String(cc.revokedAt))}</div>
                    ) : null}
                  </td>
                  <td className="text-xs">{String(cc.scope)}</td>
                  <td className="text-xs">{cc.expiresAt ? fmtIstDateTime(String(cc.expiresAt)) : "—"}</td>
                  <td>{Number(cc.accessCount)}</td>
                  <td>
                    {(cc.status === "REQUESTED" || cc.status === "APPROVED") && (
                      <ConsentActions
                        compact
                        consent={{
                          id: String(cc.id),
                          doctorId: String(cc.doctorId),
                          doctorName: String(cc.doctorName),
                          status: String(cc.status),
                          scope: String(cc.scope),
                          expiresAt: cc.expiresAt ? String(cc.expiresAt) : null,
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <SectionTitle right={<Badge tone="live">append-only in the database itself</Badge>}>
          Who touched my data — and can I prove it?
        </SectionTitle>
        <p className="text-sm text-muted mb-3">
          This is the same ledger your doctors&apos; accesses are written into. Every row&apos;s hash covers the
          row before it, so if anyone (including the person who runs this server) edits or removes
          one line, verification below fails and names the exact row.
        </p>
        <LedgerPanel />
      </Card>

      <Card>
        <SectionTitle>Your rights &amp; nominee</SectionTitle>
        <p className="text-sm text-muted mb-3">
          Access, correction, erasure and grievance are buttons on this account, not emails to send — see the{" "}
          <Link href="/legal/grievance" className="text-brand font-semibold">rights page</Link>. You accepted privacy notice{" "}
          <span className="kbd">v{accepted.accepted ?? "—"}</span>{accepted.current ? "" : ` (current is v${PRIVACY_NOTICE_VERSION} — see the banner)`} (<Link href="/legal/privacy" className="text-brand font-semibold">read it</Link>).
        </p>
        <NomineeForm />
      </Card>

      <Card>
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
