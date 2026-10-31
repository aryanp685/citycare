import { one } from "@/lib/db";
import { viewerForPage } from "@/lib/session";
import { Card, SectionTitle, Badge, KV } from "@/components/ui";
import { UnlockButton } from "@/components/unlock-buttons";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminSystem() {
  await viewerForPage(["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const s = await one<{
    tz: string; st: string; pg: string; txnMs: number; breaks: number; ledger: number; users: number; patients: number; doctors: number; verified: number;
    consentsLive: number; emergencies24h: number; appts: number; unreadTotal: number;
  }>(
    `SELECT current_setting('TimeZone') AS tz, current_setting('statement_timeout') AS st, split_part(version(),' ',2) AS pg,
            round(extract(epoch from (clock_timestamp() - now())) * 1000)::int AS "txnMs",
            (SELECT count(*)::int FROM ledger_verify()) AS breaks,
            (SELECT count(*)::int FROM "AuditLog") AS ledger,
            (SELECT count(*)::int FROM "User") AS users,
            (SELECT count(*)::int FROM "Patient") AS patients,
            (SELECT count(*)::int FROM "Doctor") AS doctors,
            (SELECT count(*)::int FROM "Doctor" WHERE "isVerified") AS verified,
            (SELECT count(*)::int FROM "Consent" WHERE status='APPROVED' AND "expiresAt" > now()) AS "consentsLive",
            (SELECT count(*)::int FROM "Consent" WHERE "isEmergencyOverride" AND "requestedAt" > now() - interval '24 hours') AS "emergencies24h",
            (SELECT count(*)::int FROM "Appointment" WHERE status IN ('PENDING','CONFIRMED','CHECKED_IN')) AS appts,
            (SELECT count(*)::int FROM "Notification" WHERE NOT "isRead") AS "unreadTotal"`,
  );
  const healthy = s?.tz === "UTC" && s?.breaks === 0;
  // D9: lockouts are visible and clearable here (self-unlock needs an email/OTP channel we do not have)
  const locked = await all<{ id: string; email: string; role: string; minutesLeft: number }>(
    `SELECT id, email, role::text AS role, GREATEST(0, 15 - FLOOR(EXTRACT(EPOCH FROM (now() - "updatedAt")) / 60))::int AS "minutesLeft"
       FROM "User" WHERE "failedAttempts" >= 5 AND status = 'ACTIVE' ORDER BY "updatedAt" DESC LIMIT 50`,
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <SectionTitle right={<Badge tone={healthy ? "live" : "crit"}>{healthy ? "healthy" : "degraded"}</Badge>}>Database</SectionTitle>
        <KV k="PostgreSQL" v={s?.pg ?? "?"} />
        <KV k="Session timezone" v={s?.tz ?? "?"} />
        <KV k="statement_timeout" v={s?.st ?? "?"} />
        <KV k="Ledger rows / chain breaks" v={`${s?.ledger ?? 0} / ${s?.breaks ?? "?"}`} />
        <KV k="Health query (DB-side)" v={`${s?.txnMs ?? 0} ms`} />
        <KV k="Runtime" v={`Node ${process.version} · ${process.env.VERCEL_REGION ?? "local"}`} />
      </Card>
      <Card>
        <SectionTitle>Activity</SectionTitle>
        <KV k="Users" v={String(s?.users ?? 0)} />
        <KV k="Patients / doctors (verified)" v={`${s?.patients ?? 0} / ${s?.doctors ?? 0} (${s?.verified ?? 0})`} />
        <KV k="Live consents" v={String(s?.consentsLive ?? 0)} />
        <KV k="Emergency accesses (24 h)" v={String(s?.emergencies24h ?? 0)} />
        <KV k="Open appointments" v={String(s?.appts ?? 0)} />
        <KV k="Unread notifications (all users)" v={String(s?.unreadTotal ?? 0)} />
      </Card>
      <Card className="md:col-span-2">
        <SectionTitle right={<Badge tone={locked.length ? "warn" : "off"}>{locked.length} locked</Badge>}>Locked accounts</SectionTitle>
        {locked.length === 0 ? <p className="text-sm text-muted">No account is inside a lockout window.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th>Email</th><th>Role</th><th>Auto-unlock in</th><th></th></tr></thead>
            <tbody>{locked.map((u) => <tr key={u.id} className="border-t border-line"><td className="py-1">{u.email}</td><td>{u.role.toLowerCase()}</td><td>{u.minutesLeft} min</td><td className="text-right"><UnlockButton userId={u.id} /></td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
