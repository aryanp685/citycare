// Pure IST date formatting — no DB, no env. Kept in its own module so CLIENT components can
// import it without pulling the `pg` pool (and process.env) from repo.ts into the browser bundle.
// repo.ts re-exports both for existing server-side imports.

const IST = "Asia/Kolkata";

export function fmtIstDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" }).format(dt);
}

export function fmtIstDateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return (
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(dt) + " IST"
  );
}
