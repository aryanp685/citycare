"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEmbedded } from "@/components/use-embedded";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"PATIENT" | "DOCTOR">("PATIENT");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", qualification: "MBBS, MD", consultationFee: "500", specialty: "General Physician", registrationNo: "", hprId: "", dob: "" });
  const [legal, setLegal] = useState({ acceptPolicy: false, adult: false });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { embedded } = useEmbedded();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    // L1: the two attestations are validated server-side too (the checkbox is UX, the API is the control)
    const attest = { acceptPolicy: legal.acceptPolicy, adult: legal.adult };
    const body = role === "PATIENT"
      ? { role, name: form.name, email: form.email, phone: form.phone, password: form.password, gender: "UNDISCLOSED", dateOfBirth: form.dob ? new Date(form.dob + "T00:00:00Z").toISOString() : undefined, embedded, ...attest }
      : { role, name: form.name, email: form.email, phone: form.phone, password: form.password, qualification: form.qualification, consultationFee: Number(form.consultationFee), specialty: form.specialty, registrationNo: form.registrationNo, hprId: form.hprId || undefined, embedded, ...attest };
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(j.error ?? "Signup failed");
      return;
    }
    router.push(role === "DOCTOR" ? "/doctor" : "/patient/onboard");
    router.refresh();
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16">
      <Link href="/" className="font-black text-xl no-underline text-ink">City<span className="text-brand">Care</span></Link>
      <form onSubmit={submit} className="card mt-6 grid gap-4">
        <h1 className="font-bold text-lg">Create account</h1>
        <div className="flex gap-2">
          {(["PATIENT", "DOCTOR"] as const).map((r) => (
            <button type="button" key={r} onClick={() => setRole(r)}
              className={`btn ${role === r ? "btn-primary" : "btn-ghost"} flex-1 justify-center`}>
              {r === "PATIENT" ? "I am a patient" : "I am a doctor"}
            </button>
          ))}
        </div>
        <label className="field"><span>Full name</span><input value={form.name} onChange={set("name")} required minLength={2} placeholder={role === "DOCTOR" ? "Dr. Asha Kulkarni" : "Ramesh Shelar"} /></label>
        <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set("email")} required /></label>
        <label className="field"><span>Mobile (10 digits)</span><input value={form.phone} onChange={set("phone")} required inputMode="numeric" pattern="\d{10}" /></label>
        <label className="field"><span>Password (10+ chars, letters + numbers)</span><input type="password" value={form.password} onChange={set("password")} required minLength={10} /></label>
        {role === "PATIENT" && (
          <label className="field"><span>Date of birth (optional — enables age-based safety rules)</span><input type="date" value={form.dob} onChange={set("dob")} max={new Date().toISOString().slice(0, 10)} /></label>
        )}
        {role === "DOCTOR" && (
          <>
            <label className="field"><span>Qualification</span><input value={form.qualification} onChange={set("qualification")} required /></label>
            <label className="field"><span>Specialty</span><input value={form.specialty} onChange={set("specialty")} required /></label>
            <label className="field"><span>Consultation fee (₹)</span><input type="number" min={0} value={form.consultationFee} onChange={set("consultationFee")} required /></label>
            <label className="field"><span>Medical council registration no.</span><input value={form.registrationNo} onChange={set("registrationNo")} placeholder="e.g. MMC/2015/12345" required /></label>
            <label className="field"><span>HPR ID (optional, 14 digits)</span><input value={form.hprId} onChange={set("hprId")} inputMode="numeric" placeholder="ABDM Healthcare Professional ID" /></label>
            <p className="text-xs text-muted md:col-span-2">An admin verifies the registration against the medical register before patients can find or book you. You can sign in meanwhile.</p>
          </>
        )}
        <div className="grid gap-2 text-sm border-t border-line pt-3">
          <label className="flex gap-2 items-start">
            <input type="checkbox" className="mt-1" checked={legal.acceptPolicy} onChange={(e) => setLegal({ ...legal, acceptPolicy: e.target.checked })} required />
            <span>I have read the <Link href="/legal/privacy" target="_blank" className="text-brand font-semibold">privacy notice</Link> and the <Link href="/legal/terms" target="_blank" className="text-brand font-semibold">terms</Link>, and I consent to CityCare processing my {role === "DOCTOR" ? "professional and contact" : "health"} data for the purposes listed there. I can withdraw by revoking access or erasing my account at any time.</span>
          </label>
          <label className="flex gap-2 items-start">
            <input type="checkbox" className="mt-1" checked={legal.adult} onChange={(e) => setLegal({ ...legal, adult: e.target.checked })} required />
            <span>I am 18 or older. {role === "PATIENT" && "(Accounts for minors need a parent or guardian — coming later.)"}</span>
          </label>
          <p className="text-xs text-muted">Public demo: do not enter real personal or health data; accounts are erased automatically after a few days.</p>
        </div>
        {msg && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{msg}</p>}
        <button className="btn btn-primary justify-center" disabled={busy || !legal.acceptPolicy || !legal.adult}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-sm text-muted">Already registered? <Link className="text-brand font-semibold" href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
