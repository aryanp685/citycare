"use client";
import { useState } from "react";
import Link from "next/link";

type Mode = "code" | "email";

/** D9 / F9: self-service recovery — a recovery code (works everywhere) or an emailed code (when the deployment can send email). */
export default function RecoverPage() {
  const [mode, setMode] = useState<Mode>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sent, setSent] = useState<"email" | "unavailable" | null>(null);

  async function requestEmail() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Could not request a code"); return; }
    setSent(j.delivery);
    setMsg(j.delivery === "email" ? `If that account exists, a 6-digit code is on its way (valid ${j.ttlMinutes} min).` : "This deployment cannot send email yet — use one of your recovery codes instead, or ask an administrator to unlock you.");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const path = mode === "code" ? "/api/auth/recover" : "/api/auth/reset";
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code, newPassword: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "Recovery failed"); return; }
    setDone(true);
  }

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <Link href="/" className="font-black tracking-tight no-underline text-ink">City<span className="text-brand">Care</span></Link>
      {done ? (
        <div className="card mt-6 grid gap-3">
          <h1 className="font-bold text-lg">Password reset</h1>
          <p className="text-sm">Your password was changed, any lockout was cleared and every device was signed out. <Link className="text-brand font-semibold" href="/login">Sign in</Link> with the new password.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 grid gap-4">
          <h1 className="font-bold text-lg">Recover your account</h1>
          <div className="flex gap-2 text-sm">
            <button type="button" className={`btn ${mode === "code" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("code")}>Recovery code</button>
            <button type="button" className={`btn ${mode === "email" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("email")}>Emailed code</button>
          </div>
          <label className="field"><span>Email</span><input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode === "email" && (
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost" disabled={busy || !email} onClick={requestEmail}>Send me a code</button>
              {sent === "unavailable" && <span className="text-xs text-amber-700">email delivery not configured here</span>}
            </div>
          )}
          <label className="field">
            <span>{mode === "code" ? "One of your recovery codes (e.g. 7Q3KM-9XT2B)" : "6-digit code from the email"}</span>
            <input required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode={mode === "email" ? "numeric" : "text"} />
          </label>
          <label className="field"><span>New password (min 10 characters)</span><input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button className="btn btn-primary justify-center" disabled={busy}>{busy ? "Working…" : "Reset password & unlock"}</button>
          {msg && <p className="text-sm text-muted">{msg}</p>}
          <p className="text-xs text-muted">Recovery codes are generated from <em>Access &amp; trust → Account security</em> while signed in. Each code works once; a successful reset also clears a lockout and signs out every device. No codes? An administrator can unlock a locked account (the unlock is logged and you are notified).</p>
          <p className="text-sm text-muted">Remembered it? <Link className="text-brand font-semibold" href="/login">Sign in</Link></p>
        </form>
      )}
    </main>
  );
}
