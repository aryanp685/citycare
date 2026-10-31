"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnlockButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      await fetch(`/api/admin/users/${userId}/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      setBusy(false); router.refresh();
    }}>{busy ? "…" : "Unlock"}</button>
  );
}
