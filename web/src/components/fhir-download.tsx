"use client";
import { useState } from "react";
import { useLocale } from "./use-locale";
import { exportFilename, exportResponseProblem } from "@/lib/fhir-download";

type Status = "idle" | "working" | "ready" | "auth" | "failed" | "network" | "invalid";
export function FhirDownload() {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  async function download() {
    setStatus("working");
    try {
      const response = await fetch("/api/patient/fhir", { credentials: "same-origin", cache: "no-store" });
      const problem = exportResponseProblem(response.status, response.headers.get("content-type"));
      if (problem) { setStatus(problem); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = exportFilename(response.headers.get("content-disposition"));
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus("ready");
      } finally {
        // Allow the browser to start reading the object before revocation.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      setStatus("network");
    }
  }
  const failed = status === "auth" || status === "failed" || status === "network" || status === "invalid";
  const message = status === "working" ? t("records", "exportPreparing") : status === "ready" ? t("records", "exportReady") : status === "auth" ? t("records", "exportSignIn") : status === "failed" ? t("records", "exportFailed") : status === "network" ? t("records", "exportNetwork") : status === "invalid" ? t("records", "exportInvalid") : "";
  return <div className="grid gap-1">
    <button type="button" className="btn btn-ghost" disabled={status === "working"} onClick={download}>{failed ? t("records", "exportRetry") : t("records", "exportFhir")}</button>
    {message && <p role={failed ? "alert" : "status"} className="text-xs text-muted">{message}</p>}
  </div>;
}
