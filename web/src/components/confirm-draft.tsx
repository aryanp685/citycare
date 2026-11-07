"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "./use-locale";
import { callApi } from "./api-client";

export function ConfirmDraftButton({ id, source }: { id: string; source: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const [error, setError] = useState<"network" | "generic" | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted truncate max-w-40" title={source}>{t("records", "medSource")} <bdi lang="">“{source}”</bdi></span>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await callApi(`/api/patient/medications/${id}/confirm`, { method: "PATCH", body: {} });
          setBusy(false);
          if (result.ok) router.refresh();
          else setError(result.status === 0 ? "network" : "generic");
        }}
      >
        {busy ? t("records", "medConfirming") : t("records", "medCorrect")}
      </button>
      {error && <span role="alert" className="text-xs text-rose-600">{t("records", error === "network" ? "medNetwork" : "medConfirmError")}</span>}
    </span>
  );
}
