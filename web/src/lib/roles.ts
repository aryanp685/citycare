export type Role = "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "SUPER_ADMIN";

/** One place that knows where each role lives. Every redirect goes through here (A47: three copies disagreed). */
export function homeFor(role: string | null | undefined): string {
  switch (role) {
    case "DOCTOR": return "/doctor";
    case "SUPER_ADMIN": return "/admin";
    case "HOSPITAL_ADMIN": return "/admin";
    case "PATIENT": return "/patient";
    default: return "/login";
  }
}
