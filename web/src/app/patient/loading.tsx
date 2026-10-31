import { SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div className="grid md:grid-cols-3 gap-4" role="status" aria-live="polite" aria-label="Loading">
      <div className="md:col-span-2 grid gap-4 content-start">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>
      <div className="grid gap-4 content-start">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
