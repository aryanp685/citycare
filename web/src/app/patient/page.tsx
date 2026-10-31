import Link from "next/link";
import { DependentsPanel } from "@/components/dependents-panel";
import { viewerForPage } from "@/lib/session";
import { all, one } from "@/lib/db";
import { Card, Badge, SectionTitle, EmptyNote, KV } from "@/components/ui";
import { recordSections, toRuleRecord, fmtIstDateTime } from "@/lib/repo";
import { runAllRules } from "@/lib/rules";
import { minimumViableProfile, dayOneValue } from "@/lib/onboard";
import { ConsentActions } from "@/components/consent-actions";
import { liveConsent } from "@/lib/consent";

export default async function PatientDashboard() {
  const v = await viewerForPage("PATIENT");
  const pid = v.profileId;

  const [p, allergies, conditions, meds, appts, consents, drafts, rec] = await Promise.all([
    one<Record<string, unknown>>(`SELECT "fullName", "bloodGroup", "dateOfBirth" FROM "Patient" WHERE id=$1`, [pid]),
    all<{ allergen: string }>(`SELECT allergen FROM "Allergy" WHERE "patientId"=$1 AND "isActive"`, [pid]),
    all<{ name: string }>(`SELECT name FROM "Condition" WHERE "patientId"=$1 AND status='ACTIVE'`, [pid]),
    all<{ name: string; notes: string | null }>(`SELECT name, notes FROM "Medication" WHERE "patientId"=$1 AND "isActive"`, [pid]),
    all<Record<string, unknown>>(
      `SELECT a.id, a."scheduledAt", a.status, a."tokenNo", a."consentId", d."fullName" AS "doctorName", d.id AS "doctorId", d."consultationFee"
         FROM "Appointment" a JOIN "Doctor" d ON d.id = a."doctorId"
        WHERE a."patientId"=$1 AND a."scheduledAt" > now() - interval '2 hours'
          AND a.status IN ('PENDING','CONFIRMED','CHECKED_IN')
        ORDER BY a."scheduledAt" LIMIT 5`,
      [pid],
    ),
    all<Record<string, unknown>>(
      `SELECT c.id, c.status, c.scope, c."expiresAt", c."requestedAt", d."fullName" AS "doctorName", c."doctorId",
              (SELECT count(*)::int FROM "AuditLog" al WHERE al."consentId"=c.id) AS "accessCount"
         FROM "Consent" c JOIN "Doctor" d ON d.id=c."doctorId"
        WHERE c."patientId"=$1 AND c.status IN ('REQUESTED','APPROVED')
        ORDER BY c."requestedAt" DESC LIMIT 10`,
      [pid],
    ),
    one<{ n: string }>(`SELECT count(*)::text AS n FROM "Medication" WHERE "patientId"=$1 AND "isActive" AND notes LIKE 'DRAFT:%'`, [pid]),
    recordSections(pid),
  ]);

  const answers = {
    allergies: allergies.map((x) => x.allergen),
    chronic_conditions: conditions.map((x) => x.name),
    current_medications: meds.filter((m) => !(m.notes ?? "").startsWith("DRAFT:")).map((x) => x.name),
    blood_group: p?.bloodGroup === "UNKNOWN" ? null : String(p?.bloodGroup ?? ""),
  };
  const mvp = minimumViableProfile(answers);
  const hasHistory = rec.encounters.length + rec.documents.length + rec.labs.length > 0;
  const alerts = runAllRules(toRuleRecord(rec), new Date().toISOString().slice(0, 10));

  // live verdicts for upcoming appointment consent states
  const apptVerdicts = await Promise.all(
    appts.map(async (a) => ({
      a,
      verdict: (await liveConsent(pid, String(a.doctorId))).verdict,
    })),
  );

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2 grid gap-4 content-start">
        {mvp.completenessPct < 100 && (
          <Card className="border-amber-200 bg-amber-50/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-bold">Your safety card is {mvp.completenessPct}% complete</div>
                <p className="text-sm text-muted mt-0.5">
                  85 seconds. Missing: {mvp.missing.join(", ").replace(/_/g, " ") || "nothing"}. Allergies and current medicines
                  are what protect you when a new doctor prescribes.
                </p>
              </div>
              <Link className="btn btn-primary shrink-0" href="/patient/onboard">Finish profile</Link>
            </div>
          </Card>
        )}

        <Card>
          <SectionTitle right={<Link className="text-sm text-brand font-semibold" href="/patient/doctors">Find a doctor →</Link>}>
            Upcoming appointments
          </SectionTitle>
          {apptVerdicts.length === 0 ? (
            <div>
              <EmptyNote>No upcoming appointments.</EmptyNote>
              <Card className="bg-wash border-0 shadow-none">
                <div className="text-sm font-bold mb-1">Why CityCare works from day one, with an empty record:</div>
                <ul className="text-sm text-muted list-disc pl-5 space-y-0.5">
                  {dayOneValue(hasHistory).map((x) => <li key={x}>{x}</li>)}
                </ul>
              </Card>
            </div>
          ) : (
            <div className="space-y-3">
              {apptVerdicts.map(({ a, verdict }) => (
                <div key={String(a.id)} className="p-3 border border-line rounded-xl">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-semibold">{String(a.doctorName)}</div>
                      <div className="text-sm text-muted">
                        {fmtIstDateTime(String(a.scheduledAt))} · ₹{Number(a.consultationFee).toFixed(0)}
                        {a.tokenNo !== null && <span className="ml-2 kbd">token #{String(a.tokenNo)}</span>}
                      </div>
                    </div>
                    <Badge tone={verdict.allowed ? "live" : "warn"}>
                      {verdict.allowed ? "record: shared" : "record: not shared"}
                    </Badge>
                  </div>
                  {!!a.consentId && (
                    <ConsentActions
                      compact
                      consent={{
                        id: String(a.consentId),
                        doctorId: String(a.doctorId),
                        doctorName: String(a.doctorName),
                        status: verdict.allowed ? "APPROVED" : "REQUESTED",
                        scope: "",
                        expiresAt: null,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Access requests & live sharing</SectionTitle>
          {consents.length === 0 ? (
            <EmptyNote>Nobody is waiting on you and nobody is watching your record. That is the default — good.</EmptyNote>
          ) : (
            <div className="space-y-3">
              {consents.map((cc) => (
                <div key={String(cc.id)} className="flex justify-between gap-3 items-start flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">{String(cc.doctorName)}</div>
                    <div className="text-xs text-muted">
                      {String(cc.status)} · scope {String(cc.scope)} · {Number(cc.accessCount)} logged access(es)
                    </div>
                  </div>
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
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 content-start">
        <Card>
          <SectionTitle right={<Link className="text-xs text-brand" href="/patient/records">records →</Link>}>Safety card</SectionTitle>
          <KV k="Allergies" v={answers.allergies.length ? answers.allergies.join(", ") : "—"} />
          <KV k="Conditions" v={answers.chronic_conditions.length ? answers.chronic_conditions.join(", ") : "—"} />
          <KV k="Medicines" v={answers.current_medications.length ? `${answers.current_medications.length} active` : "—"} />
          <KV k="Blood group" v={String(answers.blood_group ?? "—").replace("_", " ")} />
          {!!Number(drafts?.n ?? 0) && (
            <p className="text-xs mt-2"><Badge tone="warn">{Number(drafts!.n)} draft med(s) waiting for your confirmation</Badge></p>
          )}
        </Card>

        <Card>
          <SectionTitle right={<span className="kbd">0 LLMs</span>}>Safety warnings</SectionTitle>
          {alerts.length === 0 ? (
            <EmptyNote>The rule engine found nothing — it recomputes from your stored rows every time, so this “nothing” is evidence, not an absence.</EmptyNote>
          ) : (
            <ul className="grid gap-2">
              {alerts.slice(0, 4).map((a, i) => (
                <li key={i} className={`text-sm p-2.5 rounded-lg border ${a.severity === "CRITICAL" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <div className="font-bold text-xs uppercase">{a.severity === "CRITICAL" ? "critical" : "check"}</div>
                  {a.message}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!v.actingFor && (
          <Card>
            <SectionTitle right={<span className="kbd">DPDP s.9</span>}>Dependents</SectionTitle>
            <DependentsPanel guardianHasDob={!!p?.dateOfBirth} />
          </Card>
        )}
        <Card>
          <SectionTitle right={<Link className="text-xs text-brand" href="/patient/access">ledger →</Link>}>Trust</SectionTitle>
          <p className="text-sm text-muted">
            Everything you share is on one log the database itself protects: append-only, hash-chained,
            verifiable from your <Link className="text-brand font-semibold" href="/patient/access">Access & trust</Link> screen.
          </p>
        </Card>
      </div>
    </div>
  );
}
