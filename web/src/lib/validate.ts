import { z } from "zod";

/** Every API body is validated before it touches SQL. All inputs are untrusted. */

export const REG_NO_RE = /^[A-Za-z0-9][A-Za-z0-9/\-. ]{3,29}$/;

/**
 * L1 (DPDP s.6 + Rules r.3): consent is a clear affirmative act after a stand-alone notice, and
 * DPDP s.9 forbids processing a child's data without verifiable parental consent — so both
 * boxes are mandatory and validated server-side (the checkbox in the UI is not the control).
 */
const LegalAttestation = {
  acceptPolicy: z.literal(true, { message: "You must read and accept the Privacy Notice and Terms" }),
  adult: z.literal(true, { message: "CityCare accounts are for adults (18+); guardian accounts for minors are on the roadmap" }),
};

export const SignupSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("PATIENT"),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().regex(/^\d{10}$/, "10-digit mobile number"),
    password: z.string().min(10).max(128),
    embedded: z.boolean().optional(), // page is inside a cross-site iframe → cookie needs SameSite=None (A20)
    dateOfBirth: z.string().datetime({ offset: true }).optional().nullable(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).default("UNDISCLOSED"),
    ...LegalAttestation,
  }),
  z.object({
    role: z.literal("DOCTOR"),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().regex(/^\d{10}$/, "10-digit mobile number"),
    password: z.string().min(10).max(128),
    embedded: z.boolean().optional(),
    qualification: z.string().trim().min(2).max(80),
    consultationFee: z.number().int().min(0).max(10000),
    specialty: z.string().trim().min(2).max(60),
    // F1: State Medical Council / NMC registration number — checked by an admin before the
    // account can be booked. Format varies by council (e.g. "MMC/2015/12345", "2019/PUNE/1042").
    registrationNo: z.string().trim().regex(REG_NO_RE, "Registration number: 4–30 letters/digits, may contain / - ."),
    hprId: z.string().trim().regex(/^\d{14}$/, "HPR ID is 14 digits").optional().or(z.literal("").transform(() => undefined)),
    ...LegalAttestation,
  }),
]);

/** L1 (DPDP s.14): nominee who may exercise the patient's rights on death/incapacity. */
export const NomineeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relation: z.string().trim().min(2).max(40),
  phone: z.string().trim().regex(/^\d{10}$/, "10-digit mobile number"),
});


/** F1: admin decision on a doctor's registration. */
/** D12 / L-G7: approval requires the admin to state WHICH public register was checked and that the
 *  name + number matched — a recorded human attestation, since no official lookup API exists. */
export const DOCTOR_REGISTERS = ["NMC_IMR", "STATE_COUNCIL", "HPR"] as const;
export const VerifyDoctorSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().trim().max(300).optional(),
    register: z.enum(DOCTOR_REGISTERS).optional(),
    attested: z.boolean().optional(),
  })
  .refine((v) => v.decision === "REJECT" || (v.attested === true && !!v.register), {
    message: "Approval needs the register you checked and your attestation that name and number matched",
    path: ["attested"],
  });

/** F2: break-glass. The reason is mandatory and long enough to be meaningful — it goes to the ledger and to the patient. */
export const EmergencySchema = z.object({
  reason: z.string().trim().min(20, "Describe the emergency in at least 20 characters").max(500),
  confirm: z.literal(true, { message: "You must confirm the patient cannot consent right now" }),
});

/** F3 */
export const MarkReadSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string().min(8).max(64)).max(200).optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  embedded: z.boolean().optional(), // see SignupSchema
});

export const ProfileSchema = z.object({
  allergies: z.array(z.string().trim().min(1).max(60)).max(20),
  chronicConditions: z.array(z.string().trim().min(1).max(60)).max(20),
  currentMedications: z.array(z.string().trim().min(1).max(80)).max(30),
  bloodGroup: z
    .enum(["A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE", "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE", "UNKNOWN"])
    .default("UNKNOWN"),
});

export const PhotoSchema = z.object({
  ocrText: z.string().min(1).max(20_000),
});

/** F5: a self-reported reading (glucose / BP / peak flow / weight …). */
const ObservationDate = z
  .string()
  .refine((s) => {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return false;
    if (t < Date.parse("2000-01-01")) return false; // a 1994 blood sugar is a data-entry error
    if (t > Date.now() + 2 * 86_400_000) return false; // at most 2 days ahead (tz drift, not prophecy)
    return true;
  }, "takenOn must be a real date, no earlier than 2000 and no more than 2 days ahead");

export const ObservationSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    valueNum: z.number().finite().refine((n) => Math.abs(n) < 1_000_000, "value out of plausible range"),
    unit: z.string().trim().max(16).optional().nullable(),
    category: z.string().trim().min(1).max(40).default("self_reported"),
    takenOn: ObservationDate,
    refLow: z.number().finite().optional().nullable(),
    refHigh: z.number().finite().optional().nullable(),
  })
  .refine((o) => o.refLow == null || o.refHigh == null || o.refLow < o.refHigh, {
    message: "refLow must be below refHigh",
    path: ["refLow"],
  });

export const ObservationDeleteSchema = z.object({ id: z.string().uuid() });

export const BookingSchema = z.object({
  doctorId: z.string().uuid(),
  scheduledAt: z.string().datetime(), // full ISO with Z from the slots API
  reason: z.string().trim().max(280).optional(),
  notesForDoctor: z.string().trim().max(2000).optional(),
});

export const CancelSchema = z.object({ appointmentId: z.string().uuid() });

export const GrantSchema = z.object({
  doctorId: z.string().uuid(),
  scope: z.enum(["FULL_RECORD", "SUMMARY_ONLY", "LAST_N_ENCOUNTERS", "SPECIFIC_CONDITION"]).default("LAST_N_ENCOUNTERS"),
  lastNEncounters: z.number().int().min(1).max(50).optional(),
  conditionName: z.string().trim().min(2).max(80).optional(),
  expiryDays: z.number().int().min(1).max(90).default(7),
});

export const RevokeSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const EncounterSchema = z.object({
  chiefComplaint: z.string().trim().min(1).max(500),
  diagnosisText: z.string().trim().min(1).max(500),
  diagnosisCode: z.string().trim().regex(/^[A-Z]?\d{1,3}(\.\d{1,2})?$/).optional(), // ICD-10 shape
  advice: z.string().trim().max(2000).optional(),
  followUpDays: z.number().int().min(0).max(365).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        dosage: z.string().trim().max(40).optional(),
        frequency: z.string().trim().regex(/^(\d\s*[-–]\s*\d\s*[-–]\s*\d|od|bd|tds|hs|sos|qhs|as directed)$/i).optional(),
        durationDays: z.number().int().min(1).max(180).optional(),
        instructions: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(30),
  overrideReason: z.string().trim().min(10).max(500).optional(), // required when overriding CRITICAL alerts
});

export const PurgeSchema = z.object({
  confirmPhrase: z.string().trim(), // must equal "DELETE MY CITYCARE DATA"
});

export function parseBody<T extends z.ZodType>(schema: T, body: unknown) {
  const p = schema.safeParse(body);
  if (!p.success) {
    const msg = p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const err = new Error(msg) as Error & { status?: number; code?: string };
    err.status = 400;
    err.code = "validation";
    throw err;
  }
  return p.data as z.infer<T>;
}


/** L-G1 / D43: in-app grievance desk (DPDP s.13). */
export const GRIEVANCE_CATEGORIES = ["ACCESS", "CORRECTION", "ERASURE", "CONSENT", "SECURITY", "DOCTOR_APPEAL", "OTHER"] as const;
export const GrievanceSchema = z.object({
  category: z.enum(GRIEVANCE_CATEGORIES),
  subject: z.string().trim().min(4).max(140),
  body: z.string().trim().min(20, "Describe the issue in at least 20 characters").max(4000),
});
export const GrievanceUpdateSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"]),
    resolution: z.string().trim().max(4000).optional(),
  })
  .refine((v) => !(v.status === "RESOLVED" || v.status === "REJECTED") || (v.resolution ?? "").length >= 10, {
    message: "A resolution (≥10 chars) is required to resolve or reject",
    path: ["resolution"],
  });

/** L-G5: breach register (DPDP Rules r.7). */
export const IncidentSchema = z.object({
  title: z.string().trim().min(4).max(140),
  summary: z.string().trim().min(20).max(4000),
  dataInvolved: z.string().trim().min(3).max(1000),
  userAdvice: z.string().trim().min(10).max(2000),
  detectedAt: z.string().datetime({ offset: true }).optional(),
});
export const IncidentUpdateSchema = z.object({
  status: z.enum(["OPEN", "CONTAINED", "CLOSED"]).optional(),
  rootCause: z.string().trim().max(4000).optional(),
  remediation: z.string().trim().max(4000).optional(),
  containedAt: z.string().datetime({ offset: true }).optional(),
  boardNotifiedAt: z.string().datetime({ offset: true }).optional(),
});
export const IncidentNotifySchema = z.object({
  scope: z.enum(["ALL_PATIENTS", "ALL_USERS", "EMAILS"]),
  emails: z.array(z.string().trim().toLowerCase().email()).max(500).optional(),
});

/** D41: admin verdict on a break-glass override. */
export const EmergencyReviewSchema = z
  .object({ verdict: z.enum(["JUSTIFIED", "UNJUSTIFIED"]), note: z.string().trim().max(500).optional() })
  .refine((v) => v.verdict === "JUSTIFIED" || (v.note ?? "").length >= 10, { message: "Explain why it was unjustified (≥10 chars)", path: ["note"] });

/** F13: a dependent (minor) added by an adult guardian. */
export const DependentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().datetime({ offset: true }),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).default("UNDISCLOSED"),
  relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]),
  guardianDateOfBirth: z.string().datetime({ offset: true }).optional(), // only needed if the guardian's DOB is not on record
});


/** D9 / F9: account recovery. */
export const RecoverSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().min(8).max(16),
  newPassword: z.string().min(10).max(128),
});
export const ForgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const ResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, "6-digit code"),
  newPassword: z.string().min(10).max(128),
});
export const EmailConfirmSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "6-digit code") });

/** D49: guardian hands an 18-year-old dependent their own login. */
export const HandoverSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile"),
  password: z.string().min(10).max(128),
});
