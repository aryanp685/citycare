"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dep = { id: string; name: string; dateOfBirth: string; age: number; gender: string; relation: string; since: string };

/** F13: guardian's list of dependents + add form + switch. Everything ledgered under the guardian. */
export function DependentsPanel({ guardianHasDob }: { guardianHasDob: boolean }) {
  const router = useRouter();
  const [deps, setDeps] = useState<Dep[] | null>(null);
  const [max, setMax] = useState(6);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", dateOfBirth: "", gender: "UNDISCLOSED", relation: "PARENT", guardianDateOfBirth: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/patient/dependents");
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setDeps(j.dependents ?? []); setMax(j.max ?? 6); }
  }
  useEffect(() => {
    void (async () => { await load(); })();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const body: Record<string, unknown> = { name: f.name, dateOfBirth: new Date(f.dateOfBirth + "T00:00:00+05:30").toISOString(), gender: f.gender, relation: f.relation };
    if (!guardianHasDob && f.guardianDateOfBirth) body.guardianDateOfBirth = new Date(f.guardianDateOfBirth + "T00:00:00+05:30").toISOString();
    const r = await fetch("/api/patient/dependents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Could not add"); return; }
    setShow(false); setF({ name: "", dateOfBirth: "", gender: "UNDISCLOSED", relation: "PARENT", guardianDateOfBirth: "" }); load();
  }
  const [hand, setHand] = useState<{ id: string; email: string; phone: string; password: string } | null>(null);
  async function handover(e: React.FormEvent) {
    e.preventDefault(); if (!hand) return; setBusy(true); setErr(null);
    const r = await fetch(`/api/patient/dependents/${hand.id}/handover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: hand.email, phone: hand.phone, password: hand.password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Handover failed"); return; }
    setHand(null); load();
  }
  async function switchTo(id: string) {
    setBusy(true);
    const r = await fetch(`/api/patient/dependents/${id}/switch`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (r.ok) { router.push("/patient"); router.refresh(); }
  }

  return (
    <div>
      {deps === null ? <p className="text-sm text-muted">Loading…</p> : deps.length === 0 ? (
        <p className="text-sm text-muted">No dependents yet. Add a child (under 18) whose records you manage as parent or legal guardian.</p>
      ) : (
        <ul className="grid gap-2">
          {deps.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{d.name}</span>
              <span className="text-muted">· {d.age} yrs · {d.relation === "PARENT" ? "child" : "ward"}</span>
              <span className="ml-auto flex gap-2">
                {d.age >= 18 && <button className="btn btn-primary" disabled={busy} onClick={() => setHand({ id: d.id, email: "", phone: "", password: "" })}>Hand over (18+)</button>}
                <button className="btn btn-ghost" disabled={busy} onClick={() => switchTo(d.id)}>Manage records →</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hand && (
        <form onSubmit={handover} className="grid gap-2 mt-3 p-3 border border-line rounded-xl">
          <div className="font-semibold text-sm">Hand the account over</div>
          <p className="text-xs text-muted">They keep their whole history but get their own login; your access ends now, and at their first sign-in they read and accept the privacy notice themselves.</p>
          <input type="email" required placeholder="Their email" value={hand.email} onChange={(e) => setHand({ ...hand, email: e.target.value })} />
          <input required placeholder="Their 10-digit mobile" value={hand.phone} onChange={(e) => setHand({ ...hand, phone: e.target.value })} />
          <input type="password" required minLength={10} placeholder="A password they choose (min 10)" value={hand.password} onChange={(e) => setHand({ ...hand, password: e.target.value })} />
          <div className="flex gap-2 items-center"><button className="btn btn-primary" disabled={busy}>Hand over</button><button type="button" className="btn btn-ghost" onClick={() => setHand(null)}>Cancel</button>{err && <span className="text-sm text-red-700">{err}</span>}</div>
        </form>
      )}
      {deps !== null && deps.length < max && !show && <button className="btn btn-ghost mt-3" onClick={() => setShow(true)}>+ Add dependent</button>}
      {show && (
        <form onSubmit={add} className="grid gap-2 mt-3">
          <label className="field"><span>Child&apos;s full name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></label>
          <label className="field"><span>Child&apos;s date of birth (must be under 18)</span><input type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} required /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span>Gender</span><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="UNDISCLOSED">Prefer not to say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label>
            <label className="field"><span>You are the</span><select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}><option value="PARENT">Parent</option><option value="LEGAL_GUARDIAN">Legal guardian</option></select></label>
          </div>
          {!guardianHasDob && <label className="field"><span>Your own date of birth (we check you are 18+, DPDP Rules r.10)</span><input type="date" value={f.guardianDateOfBirth} onChange={(e) => setF({ ...f, guardianDateOfBirth: e.target.value })} required /></label>}
          <p className="text-xs text-muted">By adding a dependent you confirm you are their parent or lawful guardian and you consent to CityCare processing their health data on their behalf (DPDP Act s.9). No tracking or advertising is ever applied to a child&apos;s profile. The child can claim the account with their own login at 18.</p>
          <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={busy}>Add dependent</button><button type="button" className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>{err && <span className="text-sm text-red-700">{err}</span>}</div>
        </form>
      )}
    </div>
  );
}

/** Shown in the patient header while acting for a dependent. */
export function SwitchBackButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      await fetch("/api/patient/dependents/switch-back", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      router.push("/patient"); router.refresh();
    }}>← Back to my account</button>
  );
}
