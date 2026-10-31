import Link from "next/link";
import { searchDoctors } from "@/lib/repo";
import { DoctorCardMini, EmptyNote, Card } from "@/components/ui";

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const doctors = await searchDoctors(q);

  return (
    <div className="grid gap-4">
      <Card>
        <form className="flex gap-2" action="/patient/doctors" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, specialty or hospital — e.g. diabetes, skin, cardi…"
            className="flex-1 border border-line rounded-xl px-3 py-2 text-sm"
          />
          <button className="btn btn-primary">Search</button>
        </form>
        <p className="text-xs text-muted mt-2">Fees and timings are real data from this deployment&apos;s database — no history of yours is needed to browse.</p>
      </Card>
      {doctors.length === 0 ? (
        <EmptyNote>No doctors match “{q}”. Try a shorter word.</EmptyNote>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {doctors.map((d) => <DoctorCardMini key={d.id} d={d} />)}
        </div>
      )}
      <p className="text-xs text-muted">
        Doctor not listed? <Link className="text-brand" href="/signup">Add one</Link> — in this project, a doctor is an account like any other; the registration check is modelled, not enforced (see DRAWBACKS).
      </p>
    </div>
  );
}
