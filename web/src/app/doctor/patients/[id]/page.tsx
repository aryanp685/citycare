import { notFound } from "next/navigation";
import { viewerForPage } from "@/lib/session";
import { one } from "@/lib/db";
import { PatientWorkspace } from "@/components/patient-workspace";
import { ClinicalDisclaimer } from "@/components/clinical-disclaimer";

export default async function DoctorPatientPage({ params }: { params: Promise<{ id: string }> }) {
  await viewerForPage("DOCTOR");
  const { id } = await params;
  const p = await one<{ id: string; fullName: string; guardian: string | null; relation: string | null }>(
    `SELECT p.id, p."fullName", g."fullName" AS guardian, p."guardianRelation" AS relation
       FROM "Patient" p LEFT JOIN "Patient" g ON g.id = p."guardianPatientId" WHERE p.id=$1`,
    [id],
  );
  if (!p) notFound();

  return (
    <>
      <ClinicalDisclaimer audience="doctor" />
      {p.guardian && (
        <div className="callout mb-3 text-sm">
          <strong>Dependent profile.</strong> Records are managed by {p.relation === "PARENT" ? "parent" : "legal guardian"} <strong>{p.guardian}</strong>, who gives consent on the minor&apos;s behalf (DPDP Act s.9). Address the guardian for history and consent questions.
        </div>
      )}
      <PatientWorkspace patientId={p.id} patientName={p.fullName} />
    </>
  );
}
