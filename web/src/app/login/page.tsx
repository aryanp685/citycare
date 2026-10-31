"use client";
import { useState } from "react";
import { homeFor } from "@/lib/roles";
import { useEmbedded } from "@/components/use-embedded";
import { Warmup } from "@/components/warmup";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("ramesh@demo.in");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { embedded, selfUrl } = useEmbedded();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // tell the server whether we are framed: only then does it issue a SameSite=None cookie
      body: JSON.stringify({ email, password, embedded }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setMsg(j.error ?? "Login failed");
      return;
    }
    // Bug A20: a 200 from /login only proves the password. It does NOT prove the
    // browser kept the cookie. Ask the server who it thinks we are before navigating,
    // otherwise the user just sees the page "do nothing" (redirect → /login again).
    const me = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ viewer: null }));
    setBusy(false);
    if (!me?.viewer) {
      setMsg(
        "Password accepted, but your browser did not keep the session cookie. " +
          (embedded
            ? "This page is running inside another site's frame — open it in its own tab (link below) and sign in there."
            : "Check that cookies are enabled for this site (privacy extensions / strict tracking protection can block them) and try again."),
      );
      return;
    }
    router.push(homeFor(j.role));
    router.refresh();
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16">
      <Warmup />
      <Link href="/" className="font-black text-xl no-underline text-ink">City<span className="text-brand">Care</span></Link>
      <form onSubmit={submit} className="card mt-6 grid gap-4">
        <h1 className="font-bold text-lg">Sign in</h1>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" />
        </label>
        {msg && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{msg}</p>}
        {embedded && (
          <p className="text-xs text-muted bg-amber-50 border border-amber-200 rounded-lg p-2">
            Running inside a preview frame. If sign-in loops back here, your browser is blocking
            third-party cookies —{" "}
            <a className="text-brand font-semibold" href={selfUrl} target="_blank" rel="noopener noreferrer">
              open CityCare in a new tab ↗
            </a>
          </p>
        )}
        <button className="btn btn-primary justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="text-sm text-muted">
          No account? <Link className="text-brand font-semibold" href="/signup">Create one</Link> · Locked out or forgot? <Link className="text-brand font-semibold" href="/recover">Recover</Link>
        </p>
        <p className="text-xs text-muted">
          Demo users (password <span className="kbd">city1234</span>): ramesh@demo.in, anita@demo.in (patients) ·
          dr.kulkarni@demo.in, dr.joshi@demo.in (doctors)
        </p>
      </form>
    </main>
  );
}
