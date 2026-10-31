/**
 * Legal & compliance constants — ONE place, imported by the signup API, the legal pages,
 * the retention sweep and the tests, so the notice the user reads and the rule the server
 * enforces can never drift apart.
 *
 * Framework (India): Digital Personal Data Protection Act 2023 + DPDP Rules 2025
 * (notified 13/14 Nov 2025; notice/consent/security/breach rules commence 13 May 2027 —
 * we implement them now), IT Act 2000 s.43A + SPDI Rules 2011 (in force until then),
 * NMC/MCI Code of Medical Ethics 2002 (records), Consumer Protection Act 2019 (no misleading
 * claims). See web/LEGAL_COMPLIANCE.md for the control matrix.
 */

/** Bump when the wording of a notice changes materially; the acceptance row stores this. */
export const PRIVACY_NOTICE_VERSION = "2026-09-29"; // 2026-09-29: original files now stored (encrypted); e-mail verification; recovery codes; public ledger anchors
export const TERMS_VERSION = "2026-09-28";

export type PolicyKey = "privacy-notice" | "terms";
export const POLICY_KEYS: readonly PolicyKey[] = ["privacy-notice", "terms"] as const;

/** Seeded demo identities live on this domain; the retention sweep never touches them. */
export const DEMO_SEED_DOMAIN = "demo.in";
export function isSeedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_SEED_DOMAIN}`);
}

/**
 * Public demo hygiene (DPDP s.8(7): erase when the purpose is served). Accounts created on
 * the public demo are erased this many days after creation. Disclosed on the signup form,
 * in the Privacy Notice and in the demo banner. Override with DEMO_RETENTION_DAYS.
 */
export const DEMO_RETENTION_DAYS = clampInt(process.env.DEMO_RETENTION_DAYS, 7, 1, 365);

/** The demo banner is on unless explicitly disabled (a real deployment sets NEXT_PUBLIC_DEMO_MODE=0). */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";

/** DPDP s.9: a "child" is under 18; processing needs verifiable parental consent (Rules r.10). */
export const ADULT_AGE = 18;

/** Whole years completed between dob and `on` (calendar-correct, no 365.25 shortcuts). */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isMinor(dob: Date, on: Date = new Date()): boolean {
  return ageOn(dob, on) < ADULT_AGE;
}

/**
 * Grievance / Data Protection contact (DPDP s.13; Rules r.3 requires the notice to carry
 * the channel). Placeholders are deliberately obvious: the team must fill them before any
 * non-demo use — the app refuses to pretend a mailbox exists.
 */
export const GRIEVANCE = {
  officer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? "Grievance Officer (to be named by the CityCare team)",
  email: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? null, // null → page says "not yet published"
  responseDays: 30, // we commit to 30; the DPDP Rules cap the published period at 90 days
  boardUrl: "https://www.meity.gov.in/", // Data Protection Board of India — complaints route (MeitY until the Board's own portal is live)
};

/** Where personal data physically sits — disclosed verbatim in the notice. */
export const PROCESSORS = [
  { name: "Vercel Inc.", role: "application hosting (serverless functions, TLS termination)", region: "Singapore (sin1)", basis: "Data Processor under contract (Vercel DPA)" },
  { name: "Neon Inc.", role: "managed PostgreSQL (encrypted at rest and in transit)", region: "Singapore (ap-southeast-1)", basis: "Data Processor under contract (Neon DPA)" },
] as const;

/**
 * Itemised description of personal data (Rules r.3(1)(a)). Rendered as the table in the
 * Privacy Notice — keep it in sync with the schema.
 */
export const DATA_INVENTORY = [
  { item: "Name, email, mobile number, password (scrypt hash only)", purpose: "Create and secure your account; sign-in; lockout after repeated failures", whoSees: "You; CityCare admins (never the password)" },
  { item: "Date of birth, gender, blood group, city/state/pincode", purpose: "Age-appropriate safety rules, doctor context", whoSees: "You; doctors you consent to" },
  { item: "Allergies, chronic conditions, medications, lab observations, uploaded report text", purpose: "Your longitudinal health record; deterministic safety alerts (e.g. allergy vs. prescription)", whoSees: "You; doctors during a live consent or a logged emergency access" },
  { item: "Appointments, encounter notes, prescriptions written by doctors", purpose: "Care coordination; the doctor's own statutory record", whoSees: "You; the authoring doctor" },
  { item: "Consent decisions and the access ledger (who opened what, when)", purpose: "Enforce and prove consent; tamper-evident audit (DPDP s.8(5) safeguards)", whoSees: "You; CityCare admins for security review" },
  { item: "Original report files you upload (PDF/JPEG/PNG, ≤3 MB each, 30 MB per account)", purpose: "Keep the source document behind the extracted text so a doctor can check the original; each file is encrypted with a server-held key and every open is logged", whoSees: "You; doctors only under a FULL-record consent (never under summary or last-N scopes); each download appears in your ledger" },
  { item: "E-mail verification and recovery codes (hashes only)", purpose: "Prove the e-mail is yours; let you regain access without a helpdesk. Codes are shown once and stored hashed", whoSees: "Nobody — hashes cannot be turned back into codes" },
  { item: "Nominee name, relation and phone (optional)", purpose: "Let a person you choose exercise your rights if you cannot (DPDP s.14)", whoSees: "You; CityCare admins on a verified request" },
  { item: "Session cookie (signed, HttpOnly)", purpose: "Keep you signed in for the session — strictly necessary; no advertising or analytics cookies exist", whoSees: "Your browser and CityCare servers only" },
] as const;

/** Things CityCare deliberately does NOT do — also stated on the landing page. */
export const NEGATIVE_ASSURANCES = [
  "No third-party analytics, advertising SDKs, pixels or fingerprinting; fonts are self-hosted so no request leaves for Google.",
  "No sale, sharing or 'anonymised' resale of health data to anyone.",
  "No automated diagnosis or prescribing: CityCare shows deterministic safety alerts for a clinician to judge; it is not a medical device and not ABDM-certified.",
  "No processing of children's data without verifiable parental consent — under-18 self-registration is refused until the guardian flow ships.",
  "No behavioural profiling, no targeted advertising, no tracking of any user.",
] as const;

function clampInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
