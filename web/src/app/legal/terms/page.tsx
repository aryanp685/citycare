import Link from "next/link";
import type { Metadata } from "next";
import { DEMO_MODE, DEMO_RETENTION_DAYS, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <article>
      <h1>Terms of use</h1>
      <p className="meta">Version {TERMS_VERSION} · Governing law: India · Courts at Pune, Maharashtra.</p>

      <h2>1. What CityCare is — and is not</h2>
      <ul>
        <li>CityCare is a <strong>patient-owned health record</strong> with consent-gated doctor access, built as a final-year academic project. It is offered free and on a non-commercial basis.</li>
        <li>It is <strong>not</strong> a hospital, clinic, pharmacy or telemedicine service, <strong>not</strong> a medical device, and <strong>not</strong> certified under ABDM. Nothing on the site is medical advice, diagnosis or treatment. Safety alerts are deterministic rule matches shown to a clinician for their judgement.</li>
        <li><strong>In an emergency, call 108 or 112.</strong> Do not rely on CityCare to reach a doctor.</li>
        {DEMO_MODE && <li><strong>Public demo.</strong> This deployment may be reset at any time; accounts you create are erased after {DEMO_RETENTION_DAYS} days; seeded people are fictional. No service level is promised.</li>}
      </ul>

      <h2>2. Who may use it</h2>
      <ul>
        <li>You must be <strong>18 or older</strong>. Accounts for minors will exist only through a guardian flow with verifiable parental consent (DPDP Act s.9), which has not shipped yet.</li>
        <li><strong>Doctors</strong> must hold a valid registration with a State Medical Council or the National Medical Commission and must enter it truthfully at sign-up. An administrator checks it against the register before the account becomes visible to patients. Entering a registration number that is not yours is impersonation and will be reported to the council concerned.</li>
      </ul>

      <h2>3. Your responsibilities</h2>
      <ul>
        <li>Enter only data you are entitled to enter. On the public demo, do not enter real personal or health data about yourself or anyone else.</li>
        <li>Keep your password private. You are responsible for activity under your account until you tell us it has been compromised.</li>
        <li>Do not scrape, probe, load-test or attempt to bypass consent, verification or rate limits. Good-faith security research is welcome — report findings through the <Link href="/legal/grievance">grievance channel</Link> and give us reasonable time to fix them before disclosure.</li>
        <li>Doctors: <strong>emergency (break-glass) access</strong> is for a genuine threat to life or health when the patient cannot consent. Every use is logged, disclosed to the patient and reviewable; misuse ends the account and may be reported to the council.</li>
        <li>Doctors: CityCare is <strong>not</strong> your statutory medical record. You remain responsible for maintaining your own records under the NMC/MCI Code of Medical Ethics 2002 and for every clinical decision.</li>
      </ul>

      <h2>4. Your data</h2>
      <p>Your data is yours. How we process it, where it lives, and how you export or erase it is set out in the <Link href="/legal/privacy">privacy notice</Link>, which forms part of these terms. We claim no licence over your health data beyond what is needed to show it to you and to the doctors you authorise.</p>

      <h2>5. Intellectual property and licences</h2>
      <p>The CityCare name, design and original code belong to the CityCare team. The site is built from open-source components used under their own licences, all of which are listed with their texts on the <Link href="/legal/licenses">open-source licences</Link> page. The Inter typeface is used under the SIL Open Font License 1.1. GSAP is used under its Standard &ldquo;No Charge&rdquo; licence.</p>

      <h2>6. Availability, warranties and liability</h2>
      <p>CityCare is provided &ldquo;as is&rdquo;, without warranty of fitness for any purpose, including clinical use. To the fullest extent permitted by Indian law, the CityCare team is not liable for any loss arising from use of, or inability to use, the service, including reliance on any alert or record. Nothing in these terms limits liability that cannot be limited by law, including under the Consumer Protection Act 2019 where it applies.</p>

      <h2>7. Suspension and termination</h2>
      <p>We may suspend or close an account that breaches these terms, that presents a security risk, or whose doctor registration cannot be verified. You may close your own account at any time by erasing your data; the access ledger is retained as described in the privacy notice.</p>

      <h2>8. Changes</h2>
      <p>Material changes carry a new version date. Continuing to use the service after a change means you accept it; the version you accepted at sign-up is recorded on your account.</p>

      <h2>9. Contact</h2>
      <p>Use the <Link href="/legal/grievance">grievance &amp; rights</Link> page. We respond within 30 days.</p>
    </article>
  );
}
