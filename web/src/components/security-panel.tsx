"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Sess = { id: string; current: boolean; createdAt: string; expiresAt: string; device: string | null; actingFor: string | null };

/** Account security: recovery codes (D9), email verification (D3), live sessions + sign-out-everywhere (D14/D21). */
export function SecurityPanel() {
  const router = useRouter();
  const [sum, setSum] = useState<{ remaining: number; email: string | null; emailVerified: boolean; emailDelivery: boolean } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [vcode, setVcode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [a, b] = await Promise.all([fetch("/api/auth/recovery-codes"), fetch("/api/auth/sessions")]);
    if (a.ok) setSum(await a.json());
    if (b.ok) setSessions(((await b.json()).sessions ?? []) as Sess[]);
  }
  useEffect(() => { void (async () => { await load(); })(); }, []);

  async function post(path: string, body?: unknown) {
    setBusy(true); setMsg(null);
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Failed"); return null; }
    return j;
  }

  return (
    <div className="grid gap-4 text-sm">
      <div>
        <div className="font-bold">Recovery codes {sum && <span className="kbd ml-1">{sum.remaining} unused</span>}</div>
        <p className="text-muted">Eight single-use codes that reset your password and clear a lockout without email or SMS. Store them like cash.</p>
        {codes ? (
          <div className="mt-2 p-3 border border-line rounded-xl bg-wash">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 font-mono text-sm">{codes.map((c) => <span key={c}>{c}</span>)}</div>
            <div className="text-xs text-amber-700 mt-2">Shown once. Copy them now — we only keep hashes.</div>
            <button className="btn btn-ghost mt-2" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy</button>
          </div>
        ) : (
          <button className="btn btn-ghost mt-2" disabled={busy} onClick={async () => { if (sum && sum.remaining > 0 && !confirm("Generating a new set invalidates the old codes. Continue?")) return; const j = await post("/api/auth/recovery-codes"); if (j) { setCodes(j.codes); load(); } }}>
            {sum && sum.remaining > 0 ? "Generate a new set" : "Generate recovery codes"}
          </button>
        )}
      </div>

      <div>
        <div className="font-bold">Email {sum?.emailVerified ? <span className="kbd ml-1 text-green-700">verified</span> : <span className="kbd ml-1">unverified</span>}</div>
        <p className="text-muted">{sum?.email}. {sum && !sum.emailDelivery && "This deployment has no email provider configured, so verification and emailed reset codes are unavailable here — recovery codes work regardless."}</p>
        {sum && !sum.emailVerified && sum.emailDelivery && (
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <button className="btn btn-ghost" disabled={busy} onClick={async () => { const j = await post("/api/auth/verify-email/request"); if (j) setMsg(j.delivered ? "Code sent." : "Could not deliver the email."); }}>Send verification code</button>
            <input className="w-32" placeholder="6-digit code" inputMode="numeric" value={vcode} onChange={(e) => setVcode(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || vcode.length !== 6} onClick={async () => { const j = await post("/api/auth/verify-email/confirm", { code: vcode }); if (j) { setMsg("Email verified."); load(); } }}>Confirm</button>
          </div>
        )}
      </div>

      <div>
        <div className="font-bold">Signed-in devices <span className="kbd ml-1">{sessions.length}</span></div>
        <ul className="mt-1 divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="py-1 flex flex-wrap gap-2 items-center">
              <span>{s.device ?? "unknown device"}</span>
              {s.current && <span className="kbd">this device</span>}
              {s.actingFor && <span className="kbd">managing a dependent</span>}
              <span className="text-xs text-muted ml-auto">since {s.createdAt.slice(0, 16).replace("T", " ")} · expires {s.expiresAt.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost mt-2" disabled={busy} onClick={async () => { const j = await post("/api/auth/logout", { everywhere: true }); if (j) { router.push("/login"); router.refresh(); } }}>Sign out everywhere</button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
