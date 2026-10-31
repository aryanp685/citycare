import { viewerForPage } from "@/lib/session";
import { one, all } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { profileTimeSeconds } from "@/lib/onboard";
import { Wizard } from "@/components/wizard";

export default async function OnboardPage() {
  const v = await viewerForPage("PATIENT");
  const p = await one<{ fullName: string; bloodGroup: string }>(`SELECT "fullName", "bloodGroup" FROM "Patient" WHERE id=$1`, [v.profileId]);
  const [allergies, conditions, meds] = await Promise.all([
    all<{ allergen: string }>(`SELECT allergen FROM "Allergy" WHERE "patientId"=$1 AND "isActive"`, [v.profileId]),
    all<{ name: string }>(`SELECT name FROM "Condition" WHERE "patientId"=$1 AND status='ACTIVE'`, [v.profileId]),
    all<{ name: string }>(`SELECT name FROM "Medication" WHERE "patientId"=$1 AND "isActive"`, [v.profileId]),
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="font-bold text-lg">Safety card for {p?.fullName}</h1>
        <Badge tone="live">{profileTimeSeconds()}s</Badge>
      </div>
      <p className="text-sm text-muted mb-4">
        Four questions. These are the only facts worth interrupting you for — everything else (visit
        history, reports) arrives on its own through prescriptions and appointments. Skip any you don&apos;t know.
      </p>
      <Card>
        <Wizard
          initial={{
            allergies: allergies.map((x) => x.allergen),
            chronicConditions: conditions.map((x) => x.name),
            currentMedications: meds.map((x) => x.name),
            bloodGroup: p?.bloodGroup === "UNKNOWN" ? "" : String(p?.bloodGroup ?? ""),
          }}
        />
      </Card>
    </div>
  );
}
