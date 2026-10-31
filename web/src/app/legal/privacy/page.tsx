import Link from "next/link";
import type { Metadata } from "next";
import { DATA_INVENTORY, DEMO_MODE, DEMO_RETENTION_DAYS, GRIEVANCE, NEGATIVE_ASSURANCES, PRIVACY_NOTICE_VERSION, PROCESSORS } from "@/lib/legal";
import { LEGAL_LANGS, LEGAL_SUMMARY, pickLang } from "@/lib/legal-i18n";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * DPDP Act 2023 s.5 notice, structured per DPDP Rules 2025 r.3: stand-alone, plain language,
 * itemised data, specified purposes, and the links to withdraw consent / exercise rights / complain.
 * Everything stated here is enforced in code; the section headers cite the section it satisfies.
 */
export default async function PrivacyNotice({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = pickLang((await searchParams).lang);
  const t = LEGAL_SUMMARY[lang];
  return (
    <article>
      <h1>Privacy notice</h1>
      <p className="meta">Version {PRIVACY_NOTICE_VERSION} · Applies to citycare-xi.vercel.app and any deployment of this code by the CityCare team · Written for the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025 (India).</p>

      {/* L-G2 — DPDP s.5(3): key points in English, Hindi and Marathi; English full text is operative */}
      <div className="callout" lang={lang}>
        <div className="flex flex-wrap items-center gap-2 mb-2" lang="en">
          <span className="text-xs text-muted">Read the key points in:</span>
          {LEGAL_LANGS.map((l) => (
            <Link key={l} href={l === "en" ? "/legal/privacy" : `/legal/privacy?lang=${l}`} className={`kbd ${l === lang ? "font-bold" : ""}`} hrefLang={l}>{LEGAL_SUMMARY[l].langName}</Link>
          ))}
        </div>
        <strong>{t.title}</strong>
        <p className="text-sm">{t.operativeNote}{t.reviewNote ? ` ${t.reviewNote}` : ""}</p>
        <ul>
          {t.points.map((pt) => <li key={pt.heading}><strong>{pt.heading}:</strong> {pt.body}</li>)}
          <li>{t.rights}</li>
          <li>{t.grievance}</li>
          <li>{t.children}</li>
        </ul>
      </div>

      <div className="callout">
        <strong>In one paragraph.</strong> CityCare stores the health record <em>you</em> choose to keep and shows it to a doctor only while a consent you granted is live (or during a logged, time-boxed emergency access that you are told about and can revoke). We do not sell, share or analyse your data for anyone else&apos;s benefit, we run no trackers, and you can export or erase everything yourself, without asking us.
      </div>

      <h2>1. Who is responsible (the &ldquo;Data Fiduciary&rdquo;)</h2>
      <p>CityCare is a final-year academic project built by a student team at G H Raisoni College (Pune). It is operated on a non-commercial basis. For any request about your data, use the <Link href="/legal/grievance">grievance &amp; rights</Link> page. Named contact: {GRIEVANCE.officer}.</p>
      {DEMO_MODE && (
        <p><strong>Public demo notice.</strong> This deployment is a demonstration. All seeded patients and doctors are synthetic. Please do not enter real personal or health data about yourself or anyone else. Accounts created on the demo are erased automatically {DEMO_RETENTION_DAYS} days after creation (see §6).</p>
      )}

      <h2>2. What personal data we process (Rules r.3(1)(a) — itemised)</h2>
      <table>
        <thead><tr><th>Data</th><th>Why we process it</th><th>Who can see it</th></tr></thead>
        <tbody>
          {DATA_INVENTORY.map((r) => <tr key={r.item}><td>{r.item}</td><td>{r.purpose}</td><td>{r.whoSees}</td></tr>)}
        </tbody>
      </table>
      <p>We do not collect location, device identifiers, contacts, or anything from other apps. Uploaded report <em>text</em> is stored, and — since notice v2026-09-29 — so is the <em>original file</em> you upload (encrypted; see §9). Files are optional: you can keep only the extracted text if you prefer.</p>

      <h2>3. Purposes and legal basis (DPDP s.4, s.6, s.7)</h2>
      <ul>
        <li><strong>Your consent (s.6)</strong> — creating your account and keeping your record. You give it by ticking the box at sign-up after reading this notice; the version you accepted and the time are stored on your account.</li>
        <li><strong>Your consent, per doctor</strong> — every doctor sees your record only under a consent you approve, with a scope and an expiry. You can deny or revoke in one tap; revocation is at least as easy as granting (s.6(4)).</li>
        <li><strong>Medical emergency (s.7(f))</strong> — a verified doctor may open your record without prior consent to respond to a threat to life or health. This is limited to 60 minutes, requires a written reason, is capped at three uses per doctor per day, is written to the tamper-evident ledger, appears in your inbox as a critical alert, and can be revoked by you immediately.</li>
        <li><strong>Security and legal obligation</strong> — access logs are kept to detect misuse and to meet the log-retention duty in DPDP Rules r.6(1)(e).</li>
      </ul>

      <h2>4. Who receives your data</h2>
      <ul>
        <li><strong>Doctors you consent to</strong> (or, in an emergency, as in §3) — only while access is live; the ledger shows you every opening.</li>
        <li><strong>CityCare administrators</strong> — to verify doctors&apos; medical-council registration, to investigate security incidents, and to act on your rights requests. Administrators cannot read clinical records through the app without a consent or emergency entry that you would see.</li>
        <li><strong>Data processors</strong> that host the service under contract, listed below. No advertisers, no data brokers, no analytics vendors.</li>
      </ul>
      <table>
        <thead><tr><th>Processor</th><th>What it does</th><th>Where</th><th>Basis</th></tr></thead>
        <tbody>{PROCESSORS.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.role}</td><td>{p.region}</td><td>{p.basis}</td></tr>)}</tbody>
      </table>

      <h2>5. Where your data is stored (DPDP s.16)</h2>
      <p>Servers and the database are currently in Singapore, because that is the nearest region offered by our free-tier providers. Transfer outside India is permitted under s.16 unless the Central Government restricts a country by notification; none applies to Singapore as at the version date. A migration to a Mumbai region is on our roadmap. Data is encrypted in transit (TLS) and at rest by the providers.</p>

      <h2>6. How long we keep it (DPDP s.8(7); Rules r.6(1)(e))</h2>
      <ul>
        <li><strong>Your account and record</strong> — until you erase them (Access &amp; trust → Erase my data) or, on the public demo, {DEMO_RETENTION_DAYS} days after creation, whichever is earlier.</li>
        <li><strong>On erasure</strong> — everything you contributed is deleted; notes a doctor wrote about you on CityCare are reduced to an anonymous shell (the clinician&apos;s own record-keeping duty under the NMC/MCI Code of Medical Ethics 2002 Reg. 1.3.1 — 3 years — and the DGHS hospital manual — up to 10 years — belongs to them, not to us). Your nominee&apos;s details and your inbox are deleted too.</li>
        <li><strong>The access ledger</strong> — kept for at least one year after erasure, as Rules r.6(1)(e) requires, and because it is <em>your</em> evidence of who saw your record and when it was destroyed. It contains actor ids, actions and timestamps — not the clinical content.</li>
        <li><strong>Provider backups</strong> — the database provider keeps short-lived point-in-time backups that roll off automatically; we do not restore erased data from them.</li>
      </ul>

      <h2>7. Your rights and how to use them — without emailing anyone (DPDP s.11–s.14)</h2>
      <table>
        <thead><tr><th>Right</th><th>Where in CityCare</th></tr></thead>
        <tbody>
          <tr><td>Access / portability (s.11)</td><td>Records → <em>Export FHIR R4</em> downloads your complete record in the ABDM-standard format. Access &amp; trust shows every access in the ledger.</td></tr>
          <tr><td>Correction and completion (s.12)</td><td>Onboarding profile (allergies, conditions, medicines, blood group) is editable by you at any time; doctor-authored notes can be disputed through the grievance channel.</td></tr>
          <tr><td>Erasure (s.12)</td><td>Access &amp; trust → <em>Erase my data</em> (type the confirmation phrase). Effective immediately; you receive a receipt in the ledger.</td></tr>
          <tr><td>Withdraw consent (s.6(4)–(6))</td><td>Revoke any doctor&apos;s access from Access &amp; trust; withdrawing account-level consent = erasure above.</td></tr>
          <tr><td>Grievance redressal (s.13)</td><td><Link href="/legal/grievance">Grievance &amp; rights</Link>; we respond within {GRIEVANCE.responseDays} days. If unresolved, you may complain to the Data Protection Board of India.</td></tr>
          <tr><td>Nominate (s.14)</td><td>Access &amp; trust → <em>Nominee</em>: name a person who may exercise these rights if you die or become incapable.</td></tr>
        </tbody>
      </table>

      <h2>8. Children (DPDP s.9; Rules r.10)</h2>
      <p>CityCare does not knowingly process the personal data of anyone under 18. Sign-up requires an adult attestation, and a date of birth below 18 is refused. A guardian-managed flow with verifiable parental consent is on the roadmap; until it ships, minors&apos; records must not be entered.</p>

      <h2>9. How we protect it (DPDP s.8(5); Rules r.6)</h2>
      <ul>
        <li>Passwords are stored only as scrypt hashes (N = 2<sup>17</sup>, OWASP minimum); accounts lock after repeated failures.</li>
        <li>Sessions use signed, HttpOnly, SameSite cookies; every state-changing request is origin-checked.</li>
        <li>Role-based access is enforced in SQL, not only in the interface; database statements time out; security headers (CSP, frame-ancestors, HSTS via host) are set on every response.</li>
        <li>Every access to a record is appended to a SHA-256 hash-chained ledger that cannot be updated or deleted at the database level; its integrity is verified daily. Once a day the head of the chain is signed with CityCare&apos;s Ed25519 key and, where possible, timestamped by public OpenTimestamps calendars; the signed heads are published at <Link href="/legal/transparency">/legal/transparency</Link> so that a silent rewrite of history would be detectable by anyone, not only by us.</li>
        <li>Uploaded files are encrypted with AES-256-GCM under a key held outside the database (each file its own nonce, integrity-tagged); downloads use a 60-second single-purpose link and are written to your ledger.</li>
        <li>Encryption at rest and in transit by the providers; no third-party scripts run in your browser.</li>
      </ul>

      <h2>10. If something goes wrong (Rules r.7)</h2>
      <p>If we become aware of a personal-data breach affecting you, we will tell you without delay through your CityCare inbox and your registered email or mobile number — what happened, what data was involved, what we have done and what you should do — and report it to the Data Protection Board of India within 72 hours as the Rules require.</p>

      <h2>11. Cookies</h2>
      <p>One cookie: the signed session token that keeps you logged in. It is strictly necessary, so no cookie banner is shown. There are no advertising, analytics or third-party cookies.</p>

      <h2>12. What we deliberately do not do</h2>
      <ul>{NEGATIVE_ASSURANCES.map((s) => <li key={s}>{s}</li>)}</ul>

      <h2>13. Changes to this notice</h2>
      <p>Material changes get a new version date at the top. The version you accepted is recorded on your account and visible via the API (<code>/api/legal/acceptance</code>) and on Access &amp; trust. Until the DPDP Rules&apos; notice and consent provisions commence (13 May 2027), the IT Act 2000 s.43A and the SPDI Rules 2011 continue to apply, and this notice is written to satisfy both.</p>
    </article>
  );
}
