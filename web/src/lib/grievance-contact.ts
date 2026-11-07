/** Public contact details, configured only by the deployment operator. Never log values. */
export type GrievanceContact =
  | { status: "configured"; officer: string; email: string }
  | { status: "unavailable" };

export function grievanceContact(env: Record<string, string | undefined>): GrievanceContact {
  const officer = (env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? "").trim();
  const email = (env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? "").trim();
  // Limit length and reject controls, markup and placeholder syntax. Email is deliberately
  // conservative: one mailbox, no display name, URI parameters, spaces or Unicode domain.
  const validOfficer = officer.length >= 2 && officer.length <= 100 &&
    !/[<>\[\]{}\p{Cc}\p{Cf}]/u.test(officer) && /\p{L}/u.test(officer);
  const validEmail = email.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email) &&
    !email.split("@")[0].startsWith(".") && !email.split("@")[0].endsWith(".") && !email.includes("..") &&
    email.split("@")[1].split(".").every((label) => label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
  if (!validOfficer || !validEmail) return { status: "unavailable" };
  return { status: "configured", officer, email };
}
