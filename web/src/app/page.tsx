import Link from "next/link";
import { homeFor } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { Badge } from "@/components/ui";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { LandingHero, CountUp } from "@/components/landing/hero";
import { FlowDiagram } from "@/components/landing/flow-diagram";
import { Steps } from "@/components/landing/steps";
import { Warmup } from "@/components/warmup";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 15h3" />
      </svg>
    ),
    title: "Works from minute one",
    body: "Booking needs zero history. A brand-new account can find a doctor and reserve a slot immediately — the record fills itself in as you go.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M15 8l3 3M18 5l2 2" />
      </svg>
    ),
    title: "Consent is a switch, not a suggestion",
    body: "Doctors see your record only while a live consent exists. Revoke it and their very next request fails with 403 — the server re-checks every call, nothing is cached.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 12h6M9 16h6M9 8h2" /><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" />
      </svg>
    ),
    title: "A log you can audit, not trust",
    body: "Every access is chained: each entry's hash covers the previous one. Edit or delete any row and verification names the exact break. Append-only at the database level.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Safety rules are deterministic",
    body: "Penicillin allergy + amoxicillin prescription = a hard stop with an audited override. Out-of-range labs are flagged from the report's own reference range. No LLM decides anything clinical.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2.5" />
      </svg>
    ),
    title: "Drafts until you say so",
    body: "Paste an old prescription and it becomes draft medicines. Nothing reaches the rule engine or a doctor's screen until you confirm each line yourself.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18l-2 13H5z" /><path d="M9 10v5M15 10v5M10 3h4" />
      </svg>
    ),
    title: "Erasure that actually erases",
    body: "One action deletes your clinical rows and redacts encounters; the ledger keeps only pseudonymous IDs — your receipt that the deletion happened.",
  },
];

export default async function Home() {
  const viewer = await getViewer();
  const home = homeFor(viewer?.role);

  return (
    <main>
      <Warmup />
      <SmoothScroll />

      {/* top bar */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-line/70">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-black text-lg tracking-tight no-underline text-ink">
            City<span className="text-brand">Care</span>
          </Link>
          <nav className="flex gap-2 items-center text-sm">
            <a className="hidden md:inline-block px-3 py-2 text-muted hover:text-ink no-underline" href="#how">How it works</a>
            <a className="hidden md:inline-block px-3 py-2 text-muted hover:text-ink no-underline" href="#trust">Trust</a>
            {viewer ? (
              <Link className="btn btn-primary" href={home}>Open dashboard →</Link>
            ) : (
              <>
                <Link className="btn btn-ghost" href="/login">Sign in</Link>
                <Link className="btn btn-primary" href="/signup">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <LandingHero signedIn={!!viewer} home={home}>
        <div className="card p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Live flow</span>
            <Badge tone="live">every hop is logged</Badge>
          </div>
          <FlowDiagram />
        </div>
      </LandingHero>

      {/* proof strip */}
      <section className="max-w-6xl mx-auto px-4 -mt-4 mb-16">
        <Reveal className="card grid grid-cols-2 md:grid-cols-4 gap-6 py-6">
          <CountUp value={0} suffix=" s" label="revoke → 403 latency" />
          <CountUp value={1} label="record per patient" />
          <CountUp value={100} suffix="%" label="accesses in the ledger" />
          <CountUp value={25} label="tables, tested at DB level" />
        </Reveal>
      </section>

      {/* features */}
      <section className="max-w-6xl mx-auto px-4 mb-20">
        <Reveal>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Built around one insight</h2>
          <p className="text-muted mt-2 max-w-2xl">
            Hospitals stay put, doctors change, the <em>patient</em> is the only entity that passes through all of them.
            So the record belongs to the patient — and everything else follows from that.
          </p>
        </Reveal>
        <Stagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {FEATURES.map((f) => (
            <StaggerItem key={f.title} className="card card-hover h-full">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-brand-soft text-brand-ink mb-3">{f.icon}</div>
              <div className="font-bold">{f.title}</div>
              <p className="text-sm text-muted mt-1 leading-relaxed">{f.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* how it works */}
      <section id="how" className="max-w-6xl mx-auto px-4 mb-20 grid lg:grid-cols-[.8fr_1.2fr] gap-10">
        <Reveal>
          <span className="eyebrow">How it works</span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-4">Doctor asks. You decide. It expires. It&apos;s logged.</h2>
          <p className="text-muted mt-3 leading-relaxed">
            That sentence is the whole consent model — and it is exactly what India&apos;s DPDP Act asks for:
            specific, informed, revocable consent with a record of processing.
          </p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Badge tone="off">scope: full · last N visits · specific docs</Badge>
            <Badge tone="off">expiry: default 7 days</Badge>
            <Badge tone="off">auto-revoke after visit</Badge>
          </div>
        </Reveal>
        <Steps
          steps={[
            { title: "Book — the request is created for you", body: "Booking an appointment auto-requests a scoped consent for that doctor, so there is nothing to remember.", proof: "POST /api/patient/appointments → { consentRequested: true }" },
            { title: "Allow or deny, in one tap", body: "The request shows who, what scope and for how long. Deny costs nothing; allow is time-boxed.", proof: "Consent.status: REQUESTED → APPROVED, expiresAt = +7d" },
            { title: "The doctor sees a timeline, not a pile", body: "Allergies first, then active conditions, medicines, out-of-range labs, past visits — every read appended to the ledger.", proof: "AuditLog ← VIEW_RECORD (consentId, seq, prevHash, entryHash)" },
            { title: "Visit done — access ends", body: "Marking the visit complete revokes the consent automatically when you asked for that. Refreshing the page on the doctor's side now gets 403.", proof: "liveConsent(patient, doctor).verdict === 'revoked' → 403" },
            { title: "You can see who looked", body: "The Access & trust screen lists every access with a time, and lets you verify the chain yourself.", proof: "SELECT * FROM ledger_verify() → 0 rows = intact" },
          ]}
        />
      </section>

      {/* trust */}
      <section id="trust" className="max-w-6xl mx-auto px-4 mb-20">
        <div className="grid lg:grid-cols-2 gap-4">
          <Reveal className="card card-hover">
            <Badge tone="live">Tamper-evident ledger</Badge>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              Each row stores <span className="kbd">sha256(prevHash ‖ time ‖ actor ‖ action ‖ entity)</span>. A database trigger
              rejects UPDATE and DELETE outright; a hand-edited row breaks every hash after it, and the verifier names the sequence number.
            </p>
            <pre className="mt-3 text-xs bg-[#0b1620] text-teal-100 rounded-xl p-3 overflow-x-auto leading-relaxed"><code>{`citycare=> UPDATE "AuditLog" SET action='x' WHERE seq=3;
ERROR:  AuditLog is append-only: UPDATE is not permitted
citycare=> SELECT * FROM ledger_verify();
 seq | reason
-----+--------
(0 rows)              ← chain intact`}</code></pre>
          </Reveal>
          <Reveal className="card card-hover" delay={0.1}>
            <Badge tone="warn">What the AI is — and is not</Badge>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              Nothing clinical is generated. Safety warnings come from a deterministic rule engine (drug-class ↔ allergy tables,
              reference ranges from the report itself). Pasted prescriptions become <strong>drafts</strong> the patient confirms line by line.
              Where a language model is used at all, its output is a suggestion with a confidence and a &ldquo;verify with records&rdquo; badge —
              never a decision.
            </p>
            <ul className="mt-3 text-sm space-y-1.5 list-disc pl-5">
              <li>Rule engine first, always. Same input, same answer.</li>
              <li>Drafts are excluded from rules and from doctors until confirmed.</li>
              <li>Prompt version and source rows are stored with every AI summary.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* audiences */}
      <section className="max-w-6xl mx-auto px-4 mb-20">
        <Stagger className="grid md:grid-cols-2 gap-4">
          <StaggerItem className="card card-hover">
            <Badge tone="live">For patients</Badge>
            <ul className="text-sm mt-3 space-y-1.5 list-disc pl-5">
              <li>85-second profile — allergies, conditions, medicines, blood group</li>
              <li>Find a doctor, book a slot, get a token — no phone call</li>
              <li>&ldquo;Who saw my data&rdquo; screen with the full ledger</li>
              <li>Right-to-erasure that actually erases</li>
            </ul>
          </StaggerItem>
          <StaggerItem className="card card-hover">
            <Badge tone="warn">For doctors</Badge>
            <ul className="text-sm mt-3 space-y-1.5 list-disc pl-5">
              <li>One screen: allergies, active problems, medicines, abnormal labs, last visits</li>
              <li>Structured encounter form — the prescription is checked against allergies as you type</li>
              <li>Today&apos;s list with tokens; status changes drive consent auto-revoke</li>
              <li>Every read you make is visible to the patient — trust cuts both ways</li>
            </ul>
          </StaggerItem>
        </Stagger>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 mb-16">
        <Reveal className="card text-center py-10 md:py-14 bg-gradient-to-b from-white to-[#eefaf8]">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Try it with the demo accounts</h2>
          <p className="text-muted mt-2">
            <span className="kbd">ramesh@demo.in</span> (patient) · <span className="kbd">dr.kulkarni@demo.in</span> (doctor) · password <span className="kbd">city1234</span>
          </p>
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <Link className="btn btn-primary btn-lg" href="/login">Sign in to the demo</Link>
            <Link className="btn btn-ghost btn-lg" href="/signup">Create a fresh account</Link>
          </div>
        </Reveal>
      </section>

      <footer className="footer-grad border-t border-line/70">
        <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-6 text-sm">
          <div>
            <div className="font-black text-lg tracking-tight">City<span className="text-brand">Care</span></div>
            <p className="text-muted mt-2 leading-relaxed">
              Intelligent, patient-owned health record. Final-year project — Project Progress Seminar-I, 2026.
            </p>
          </div>
          <div>
            <div className="font-bold mb-2">Built with</div>
            <p className="text-muted leading-relaxed">Next.js 16 · React 19 · PostgreSQL · Tailwind CSS 4 · GSAP · Motion · Lenis. Hosted on Vercel; data on a managed Postgres in the same region.</p>
          </div>
          <div>
            <div className="font-bold mb-2">Honest limits</div>
            <p className="text-muted leading-relaxed">
              Not a medical device. Not certified for ABDM. Not medical advice — in an emergency call 108 / 112. Synthetic demo data only — no real patient records were used, by design.
            </p>
          </div>
          <div>
            <div className="font-bold mb-2">Legal</div>
            <ul className="text-muted leading-relaxed grid gap-1">
              <li><Link href="/legal/privacy" className="hover:text-ink">Privacy notice (DPDP Act 2023)</Link></li>
              <li><Link href="/legal/terms" className="hover:text-ink">Terms of use</Link></li>
              <li><Link href="/legal/grievance" className="hover:text-ink">Grievance &amp; your rights</Link></li>
              <li><Link href="/legal/licenses" className="hover:text-ink">Open-source licences</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </main>
  );
}
