"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api-client";
import { useLocale } from "@/components/use-locale";
import { Card, SectionTitle } from "@/components/ui";
import { parsePrescriptionPhoto } from "@/lib/onboard";

const SAMPLE = `Tab. Metformin 500 mg  1-0-1  30 days
Tab. Telmisartan 40 mg  0-0-1
Tab. Atorvan 10mg HS
Glycomet  —  (illegible scrawl %&%)
Dr. S. Kulkarni  Reg. 2019/PUNE/4471
Follow up after 6 weeks  FBS + LIPID`;

export function PhotoPaste() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ count: number } | { error: "network" | "generic" } | null>(null);

  // client-side preview uses the SAME parser module the server runs —
  // what you see is literally what gets stored (shared src/lib/onboard.ts).
  const preview = text.trim() ? parsePrescriptionPhoto(text) : null;

  async function submit() {
    setBusy(true);
    const r = await callApi<{ draftsInserted: number; parseConfidence?: number; note?: string }>(
      "/api/patient/photo",
      { method: "POST", body: { ocrText: text } },
    );
    setBusy(false);
    if (r.ok) {
      setResult({ count: r.data.draftsInserted });
      setText("");
      router.refresh();
    } else {
      setResult({ error: r.status === 0 ? "network" : "generic" });
    }
  }

  return (
    <Card className="border-teal-200">
      <section lang={locale} className="grid gap-3">
      <SectionTitle right={<span className="text-xs text-muted">{t("records", "backfillWarning")}</span>}>{t("records", "backfillTitle")}</SectionTitle>
      <div className="flex justify-between gap-2 flex-wrap text-xs text-muted">
        <span>{t("records", "backfillIntro")} <button className="text-brand font-semibold underline" onClick={() => setText(SAMPLE)}>{t("records", "backfillSample")}</button></span>
        <span>{t("records", "backfillConfidence")}</span>
      </div>
      <textarea
        aria-label={t("records", "backfillInput")}
        className="border border-line rounded-xl p-3 text-sm font-mono min-h-28"
        placeholder={"Tab. Amox 500mg 1-0-1\nSyp. Cough 10ml BD\n…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {preview && (
        <div className="text-xs grid sm:grid-cols-2 gap-2">
          <div className="p-2 border border-green-200 bg-green-50 rounded-lg">
            <div className="font-bold text-green-800 mb-1">{t("records", "backfillDrafts")} ({preview.medications.length}):</div>
            {preview.medications.map((m, i) => (
              <div key={i}>• {m.name}{m.dosage ? ` · ${m.dosage}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}</div>
            ))}
            {preview.medications.length === 0 && <div className="text-muted">— {t("records", "backfillNone")} —</div>}
          </div>
          <div className="p-2 border border-line rounded-lg text-muted">
            <div className="font-bold mb-1">{t("records", "backfillIgnored")} ({preview.unparseableLines.length}) · {t("records", "backfillConfidenceLabel")} {(preview.confidence * 100).toFixed(0)}%:</div>
            {preview.unparseableLines.map((l, i) => <div key={i} className="truncate">· {l}</div>)}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={submit}>
          {busy ? t("records", "backfillProcessing") : t("records", "backfillSave")}
        </button>
        {result && <span role="status" className="text-sm text-muted">{"count" in result ? t("records", "backfillStored").replace("{count}", String(result.count)) : t("records", result.error === "network" ? "backfillNetwork" : "backfillError")}</span>}
      </div>
      </section>
    </Card>
  );
}
