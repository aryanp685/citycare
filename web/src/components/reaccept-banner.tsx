"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * L2: shown by every authenticated layout when the user's accepted notice version is older than
 * the live one. Reads keep working; writes answer 428 until this is clicked (see guardSameOrigin).
 */
export function ReacceptBanner({ current, accepted }: { current: string; accepted: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function accept() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/legal/acceptance", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (!r.ok) { setErr("Could not record your acceptance — try again."); return; }
    router.refresh();
  }
  return (
    <div role="alert" className="bg-brand-soft border-b border-line text-sm">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3">
        <span>
          <strong>Our privacy notice changed</strong> (version {current}{accepted ? `, you accepted ${accepted}` : ""}). Please{" "}
          <Link href="/legal/privacy" target="_blank" className="text-brand font-semibold underline underline-offset-2">read what changed</Link>{" "}
          and accept to continue making changes. Viewing, exporting and erasing your data keep working meanwhile.
        </span>
        <button className="btn btn-primary ml-auto" onClick={accept} disabled={busy}>{busy ? "Saving…" : "I have read it — accept"}</button>
        {err && <span className="text-red-700">{err}</span>}
      </div>
    </div>
  );
}
