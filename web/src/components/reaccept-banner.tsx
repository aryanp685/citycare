"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * L2: shown by every authenticated layout when the user's accepted notice version is older than
 * the live one. Reads keep working; writes answer 428 until this is clicked (see guardSameOrigin).
 */
export function ReacceptBanner({ current, accepted, labels }: { current: string; accepted: string | null; labels?: { changed: string; version: string; accepted: string; please: string; read: string; help: string; saving: string; accept: string; error: string; lang: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  async function accept() {
    setBusy(true); setErr(false);
    try {
      const r = await fetch("/api/legal/acceptance", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!r.ok) { setErr(true); return; }
      router.refresh();
    } catch { setErr(true); } finally { setBusy(false); }
  }
  return (
    <div lang={labels?.lang} role="alert" className="bg-brand-soft border-b border-line text-sm">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3">
        <span>
          <strong>{labels?.changed ?? "Our privacy notice changed"}</strong> ({labels ? labels.version.replace("{current}", current) : `version ${current}`}{accepted ? (labels ? labels.accepted.replace("{accepted}", accepted) : `, you accepted ${accepted}`) : ""}). {labels?.please ?? "Please"}{" "}
          <Link href="/legal/privacy" target="_blank" className="text-brand font-semibold underline underline-offset-2">{labels?.read ?? "read what changed"}</Link>{" "}
          {labels?.help ?? "and accept to continue making changes. Viewing, exporting and erasing your data keep working meanwhile."}
        </span>
        <button className="btn btn-primary ml-auto" onClick={accept} disabled={busy}>{busy ? labels?.saving ?? "Saving…" : labels?.accept ?? "I have read it — accept"}</button>
        {err && <span className="text-red-700">{labels?.error ?? "Could not record your acceptance — try again."}</span>}
      </div>
    </div>
  );
}
