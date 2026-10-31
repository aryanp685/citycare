import Link from "next/link";

export function Card({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</div>;
}

/** Placeholder block for loading.tsx — width/height via className, shimmer via .skeleton */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card grid gap-2">
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function Badge({ tone = "off", children }: { tone?: "live" | "warn" | "crit" | "off"; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-line/60 last:border-0 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted py-3">{children}</p>;
}

export function DoctorCardMini({ d }: { d: { id: string; fullName: string; qualification: string; consultationFee: string | number; rating: number | null; isVerified: boolean; specialties: string[]; hospital: string | null } }) {
  const fee = Number(d.consultationFee).toFixed(0);
  return (
    <Link href={`/patient/doctors/${d.id}`} className="card card-hover block no-underline text-inherit">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold">
            Dr. {d.fullName.replace(/^Dr\.?\s+/i, "")}
            {d.isVerified && <span className="ml-2 text-teal-700" title="Registration number on file">✓</span>}
          </div>
          <div className="text-sm text-muted">{d.qualification} · {Array.isArray(d.specialties) ? d.specialties.join(", ") : d.specialties}</div>
          {d.hospital && <div className="text-xs text-muted mt-0.5">{d.hospital}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold">₹{fee}</div>
          {d.rating ? <Badge tone="live">★ {d.rating.toFixed(1)}</Badge> : <Badge tone="off">new</Badge>}
        </div>
      </div>
    </Link>
  );
}
