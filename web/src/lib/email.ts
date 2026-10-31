import { one, run } from "./db";

/**
 * F9 / D3 — outbound email with an audit trail and no hard dependency on a provider.
 * Every message becomes an "Outbox" row first. If RESEND_API_KEY + EMAIL_FROM are set the row is
 * delivered through Resend's HTTPS API and marked SENT/FAILED; otherwise it stays UNSENT and the
 * calling UI tells the user that email delivery is not configured on this deployment (so nothing
 * silently pretends to have been sent). Plain text only — no tracking pixels, no links to third parties.
 */
export type Mail = { to: string; subject: string; text: string; kind: "RESET" | "VERIFY" | "BREACH" | "ANCHOR" | "OTHER" };

export function emailDeliveryConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(m: Mail): Promise<{ id: string; delivered: boolean; error?: string }> {
  const row = await one<{ id: string }>(
    `INSERT INTO "Outbox" ("toEmail", subject, body, kind) VALUES ($1, $2, $3, $4) RETURNING id`,
    [m.to.toLowerCase(), m.subject.slice(0, 200), m.text.slice(0, 20000), m.kind],
  );
  const id = row!.id;
  if (!emailDeliveryConfigured()) return { id, delivered: false, error: "email_not_configured" };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      await run(`UPDATE "Outbox" SET status='FAILED', provider='resend', error=$2 WHERE id=$1`, [id, (j.message ?? `http ${res.status}`).slice(0, 500)]);
      return { id, delivered: false, error: j.message ?? `http ${res.status}` };
    }
    await run(`UPDATE "Outbox" SET status='SENT', provider='resend', "providerId"=$2, "sentAt"=now() WHERE id=$1`, [id, j.id ?? null]);
    return { id, delivered: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await run(`UPDATE "Outbox" SET status='FAILED', provider='resend', error=$2 WHERE id=$1`, [id, msg.slice(0, 500)]).catch(() => null);
    return { id, delivered: false, error: msg };
  }
}
