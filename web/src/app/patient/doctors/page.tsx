import { searchDoctors } from "@/lib/repo";
import { DoctorDiscovery } from "@/components/doctor-discovery";

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; city?: string | string[]; specialty?: string | string[] }> }) {
  const params = await searchParams;
  const clean = (value: string | string[] | undefined) => typeof value === "string" ? value.slice(0, 120) : "";
  const filters = { q: clean(params.q), city: clean(params.city), specialty: clean(params.specialty) };
  const doctors = await searchDoctors(filters);
  return <DoctorDiscovery filters={filters} doctors={doctors} />;
}
