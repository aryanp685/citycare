import { notFound } from "next/navigation";
import { doctorById, freeSlotGrid } from "@/lib/repo";
import { Card, SectionTitle, KV, Badge } from "@/components/ui";
import { SlotPicker } from "@/components/slot-picker";

export default async function DoctorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await doctorById(id);
  if (!d) notFound();

  const grid = await freeSlotGrid(id, 14);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1 h-fit">
        <div className="font-bold text-lg">Dr. {d.fullName.replace(/^Dr\.?\s+/i, "")}</div>
        <div className="text-sm text-muted">{d.qualification}</div>
        {d.hospital && <div className="text-sm text-muted">{d.hospital}{d.city ? ` · ${d.city}` : ""}</div>}
        <div className="mt-3 flex gap-2 flex-wrap">
          {d.isVerified ? <Badge tone="live">registration on file</Badge> : <Badge tone="off">unverified (demo)</Badge>}
          {d.rating ? <Badge tone="live">★ {d.rating.toFixed(1)}</Badge> : <Badge tone="off">no reviews yet</Badge>}
        </div>
        <div className="mt-3">
          <KV k="Experience" v={`${d.experienceYrs} years`} />
          <KV k="Fee" v={`₹${Number(d.consultationFee).toFixed(0)}`} />
          <KV k="Speaks" v={d.languages.join(", ")} />
        </div>
        {d.bio && <p className="text-sm text-muted mt-3">{d.bio}</p>}
      </Card>
      <Card className="md:col-span-2">
        <SectionTitle>Next 14 days · free slots (IST)</SectionTitle>
        <p className="text-xs text-muted mb-3">
          Slots are generated from this doctor&apos;s schedule rows. A slot that already has an
          appointment never appears here — and even if two people click the same instant, the
          database itself refuses the second booking.
        </p>
        <SlotPicker doctorId={id} doctorName={d.fullName} fee={Number(d.consultationFee)} grid={grid} />
      </Card>
    </div>
  );
}
