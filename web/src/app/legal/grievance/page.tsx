import Link from "next/link";
import type { Metadata } from "next";
import { GRIEVANCE } from "@/lib/legal";
import { GrievanceDesk } from "@/components/grievance-desk";

export const metadata: Metadata = { title: "Grievance & your rights" };

/**
 * DPDP s.13 (grievance redressal) + Rules r.3 (the notice must carry the channel) + s.13(3)
 * (Board complaint only after exhausting this). The officer/email are environment-driven so a
 * placeholder is never mistaken for a real mailbox.
 */
export default function Grievance() {
  return (
    <article>
      <h1>Grievance &amp; your rights</h1>
      <p className="meta">Response commitment: within {GRIEVANCE.responseDays} days of receipt (the DPDP Rules cap the published period at 90 days).</p>

      <h2>Do it yourself, instantly</h2>
      <p>Most rights need no request at all — they are buttons on your own account:</p>
      <table>
        <thead><tr><th>You want to…</th><th>Go to</th></tr></thead>
        <tbody>
          <tr><td>See who accessed your record and when</td><td><Link href="/patient/access">Access &amp; trust</Link> → ledger</td></tr>
          <tr><td>Stop a doctor&apos;s access now</td><td><Link href="/patient/access">Access &amp; trust</Link> → Revoke</td></tr>
          <tr><td>Download everything (FHIR R4)</td><td><Link href="/patient/records">Records</Link> → Export</td></tr>
          <tr><td>Correct your profile, allergies, conditions, medicines</td><td><Link href="/patient/onboard">Profile</Link></td></tr>
          <tr><td>Name a nominee who may act for you</td><td><Link href="/patient/access">Access &amp; trust</Link> → Nominee</td></tr>
          <tr><td>Erase your account and data</td><td><Link href="/patient/access">Access &amp; trust</Link> → Erase my data</td></tr>
          <tr><td>See which notice version you accepted</td><td><code>/api/legal/acceptance</code> while signed in</td></tr>
        </tbody>
      </table>

      <h2>Raise a grievance</h2>
      <p>File it here — it lands in the administrators&apos; queue with a {GRIEVANCE.responseDays}-day clock, every status change is written to the audit ledger, and the reply arrives in your CityCare inbox. No email account is needed.</p>
      <GrievanceDesk />
      <p className="mt-6"><strong>Grievance Officer:</strong> {GRIEVANCE.officer}.</p>
      {GRIEVANCE.email ? (
        <p><strong>Email:</strong> <a href={`mailto:${GRIEVANCE.email}`}>{GRIEVANCE.email}</a></p>
      ) : (
        <div className="callout">
          <strong>Email channel not yet published.</strong> The in-app desk above is the primary channel and works today. A named officer and a monitored mailbox will be added here before any non-demo use; until then, people who cannot sign in may contact the project team through the college (G H Raisoni College, Pune — Department of Science &amp; Technology).
        </div>
      )}
      <p>Please include: the email registered on your account, what happened (with dates), and what outcome you want. We will acknowledge receipt, investigate, and reply within {GRIEVANCE.responseDays} days. We never ask for your password.</p>

      <h2>Doctors: verification appeals</h2>
      <p>If your registration was rejected, the administrator&apos;s note is shown on your dashboard. Reply through the same channel with a copy of your council registration certificate; a second administrator reviews appeals.</p>

      <h2>If you are not satisfied</h2>
      <p>After using this channel, you may complain to the <strong>Data Protection Board of India</strong> under s.13(3) of the DPDP Act 2023 (until the Board publishes its own portal, see <a href={GRIEVANCE.boardUrl} rel="noopener noreferrer" target="_blank">MeitY</a>). Nothing here limits any other remedy available to you under Indian law.</p>
    </article>
  );
}
