"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";

export function ConfirmDraftButton({ id, source }: { id: string; source: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11px] text-muted truncate max-w-40" title={source}>from: “{source}”</span>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await callApi(`/api/patient/medications/${id}/confirm`, { method: "PATCH", body: {} });
          setBusy(false);
          router.refresh();
        }}
      >
        ✓ correct
      </button>
    </span>
  );
}
