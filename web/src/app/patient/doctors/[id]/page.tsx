import { notFound } from "next/navigation";
import { doctorById, freeSlotGrid } from "@/lib/repo";
import { DoctorProfile } from "@/components/doctor-profile";

export default async function DoctorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await doctorById(id);
  if (!d) notFound();
  const grid = d.isVerified ? await freeSlotGrid(id, 14) : [];
  return <DoctorProfile doctor={{ id, fullName: d.fullName, qualification: d.qualification, experienceYrs: d.experienceYrs, consultationFee: d.consultationFee, rating: d.rating, isVerified: d.isVerified, hospital: d.hospital, city: d.city, languages: Array.isArray(d.languages) ? d.languages : [], bio: d.bio }} grid={grid} />;
}
