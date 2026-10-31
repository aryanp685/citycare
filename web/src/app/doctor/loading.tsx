import { SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div className="grid gap-4" role="status" aria-live="polite" aria-label="Loading">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={5} />
    </div>
  );
}
