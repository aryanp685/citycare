import { requireRole, guardSameOrigin } from "@/lib/session";
import { handler, ok, parseBody } from "@/lib/api";
import { BookingSchema, CancelSchema } from "@/lib/validate";
import { all, one, run, tx, fail, pgErrorCode } from "@/lib/db";
import { patientById, freeSlotsOneDay } from "@/lib/repo";
import { appendAudit } from "@/lib/ledger";
import { utcMsToIstWall } from "@/lib/slots";

/**
 * BOOKING — the flow where a naive app double-books.
 *
 * Defence in depth, in this order:
 *   1. the client can only pick an instant the SERVER offered (freeSlotGrid),
 *   2. inside a tx we re-verify the instant is still open,
 *   3. patient-level overlap check (can't be in two clinics at once),
 *   4. the INSERT itself — and the DB partial unique index
 *      `one_live_appt_per_doctor_per_instant` is the final authority.
 *      Two simultaneous requests both pass 1-3; the loser gets 23505 → 409.
 */
export const POST = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(BookingSchema, await req.json().catch(() => ({})));
  const p = await patientById(v.profileId);
  if (!p) fail(404, "no_profile", "patient profile missing");

  const when = new Date(body.scheduledAt);
  if (Number.isNaN(when.getTime())) fail(400, "bad_date", "scheduledAt must be an ISO datetime");

  const doctor = await one<{ id: string; fullName: string; consultationFee: string; isVerified: boolean }>(
    `SELECT id, "fullName", "consultationFee", "isVerified" FROM "Doctor" WHERE id = $1`,
    [body.doctorId],
  );
  if (!doctor) fail(404, "no_doctor", "doctor not found");
  if (!doctor.isVerified) fail(403, "doctor_unverified", "This doctor's registration has not been verified yet");

  const { dateISO } = utcMsToIstWall(when.getTime());
  const free = await freeSlotsOneDay(body.doctorId, dateISO);
  const offeredSlot = free.find((f) => f.utcMs === when.getTime());
  if (!offeredSlot) {
    // Was it a real schedule instant that is simply TAKEN (→ 409, page is stale)
    // or something never on offer at all (→ 400, forged/tampered request)?
    const taken = await one<{ c: string }>(
      `SELECT count(*)::text AS c FROM "Appointment"
        WHERE "doctorId"=$1 AND "scheduledAt"=$2
          AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
      [body.doctorId, when],
    );
    if (Number(taken?.c ?? 0) > 0) {
      fail(409, "slot_full", "That slot just filled up — refresh to see what's open.");
    }
    fail(400, "slot_not_offered", "That time is not on this doctor's schedule (past, too soon, or malformed).");
  }

  const result = await tx(async (c) => {
    // still open? (TOCTDK guard — someone booked it after we listed slots)
    const taken = await one<{ c: string }>(
      `SELECT count(*)::text AS c FROM "Appointment"
        WHERE "doctorId"=$1 AND "scheduledAt"=$2
          AND status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')`,
      [body.doctorId, when], c,
    );
    if (Number(taken?.c ?? 0) >= offeredSlot.capacity) fail(409, "slot_full", "That slot just filled up.");
    // D6: lowest free seat at this instant (the partial unique index makes a race a 23505, not a double-booking)
    const seat = await one<{ s: number }>(
      `SELECT s FROM generate_series(1, $3::int) AS s
        WHERE s NOT IN (SELECT "seatNo" FROM "Appointment" WHERE "doctorId"=$1 AND "scheduledAt"=$2
                          AND status IN ('PENDING','CONFIRMED','CHECKED_IN','COMPLETED','RESCHEDULED'))
        ORDER BY s LIMIT 1`,
      [body.doctorId, when, offeredSlot.capacity], c,
    );
    if (!seat) fail(409, "slot_full", "That slot just filled up.");

    // patient double-booking (true overlap, not equality — a 15-min appt
    // must not block an adjacent 30-min one, and vice versa)
    const conflicts = await all<{ id: string }>(
      `SELECT a.id FROM "Appointment" a
        WHERE a."patientId"=$1 AND a.status IN ('PENDING','CONFIRMED','CHECKED_IN','RESCHEDULED')
          AND a."scheduledAt" + (a."durationMin" * interval '1 minute') > $2
          AND $2 + ($3 * interval '1 minute') > a."scheduledAt"`,
      [p!.id, when, 15], c,
    );
    if (conflicts.length > 0) fail(409, "patient_overlap", "You already have an appointment at that time.");

    // Token = queue number for the day. Uses MAX+1 over rows that still HOLD a
    // token (cancelled rows get tokenNo NULL'd below, freeing their number).
    const dayToken = await one<{ n: string }>(
      `SELECT (COALESCE(MAX("tokenNo"), 0) + 1)::text AS n FROM "Appointment"
        WHERE "doctorId"=$1 AND "scheduledAt"::date = $2::date`,
      [body.doctorId, when], c,
    );

    let appt;
    try {
      appt = await one<{ id: string }>(
        `INSERT INTO "Appointment" (id, "patientId", "doctorId", "scheduledAt", "durationMin", status, reason, "notesForDoctor", "tokenNo", "seatNo", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 15, 'CONFIRMED', $4, $5, $6, $7, now(), now()) RETURNING id`,
        [p!.id, body.doctorId, when, body.reason ?? null, body.notesForDoctor ?? null, Number(dayToken?.n ?? 1), seat.s],
        c,
      );
    } catch (e) {
      if (pgErrorCode(e) === "23505") {
        const cons = (e as { constraint?: string }).constraint ?? "";
        if (cons === "one_token_per_doctor_per_day") {
          // two patients raced for the next queue number, not the slot — the
          // slot itself is fine; a plain retry would succeed
          fail(409, "token_race", "Queue number was taken by another booking mid-flight — please retry.");
        }
        fail(409, "slot_full", "Someone took the last seat in this slot a moment ago — pick another.");
      }
      throw e;
    }

    // auto consent REQUESTED for this visit (patient still taps approve)
    const activePair = await one<{ id: string; status: string }>(
      `SELECT id, status FROM "Consent"
        WHERE "patientId"=$1 AND "doctorId"=$2 AND status IN ('REQUESTED','APPROVED')
        AND "expiresAt" > now()`,
      [p!.id, body.doctorId], c,
    );
    let consentId: string | null = null;
    if (!activePair) {
      const cons = await one<{ id: string }>(
        `INSERT INTO "Consent" (id, "patientId", "doctorId", status, scope, purpose, "lastNEncounters", "requestedAt", "expiresAt")
         VALUES (gen_random_uuid(), $1, $2, 'REQUESTED', 'LAST_N_ENCOUNTERS', 'TREATMENT', 3, now(), now() + ($3 || ' days')::interval)
         RETURNING id`,
        [p!.id, body.doctorId, String(p!.shareDefaultExpiryDays)], c,
      );
      consentId = cons!.id;
    } else {
      consentId = activePair.status === "REQUESTED" ? activePair.id : null; // doctor already has live access — nothing to approve
    }
    if (consentId) {
      await run(`UPDATE "Appointment" SET "consentId" = $2 WHERE id = $1`, [appt!.id, consentId], c);
    }

    return { apptId: appt!.id, consentId };
  }).catch((e) => {
    if (pgErrorCode(e) === "23505") fail(409, "slot_full", "Someone took the last seat in this slot a moment ago — pick another.");
    throw e;
  });

  await appendAudit(v.uid, "BOOK_APPOINTMENT", "Patient", p!.id, {
    consentId: result.consentId,
    meta: { doctor: doctor!.fullName, at: when.toISOString() },
  });

  return ok({ appointmentId: result.apptId, consentRequested: result.consentId !== null }, 201);
});

/** cancel → the partial unique index frees the slot for others automatically */
export const PATCH = handler(async (req) => {
  await guardSameOrigin(req);
  const v = await requireRole("PATIENT");
  const body = parseBody(CancelSchema, await req.json().catch(() => ({})));

  await tx(async (c) => {
    const appt = await one<{ id: string; "consentId": string | null; status: string }>(
      `SELECT id, "consentId", status FROM "Appointment" WHERE id=$1 AND "patientId"=$2 FOR UPDATE`,
      [body.appointmentId, v.profileId], c,
    );
    if (!appt) fail(404, "not_found", "appointment not found");
    if (!["PENDING", "CONFIRMED"].includes(appt.status!)) {
      fail(400, "bad_state", `Cannot cancel an appointment that is ${appt.status!.toLowerCase()}`);
    }
    await run(
      // tokenNo=NULL releases the queue slot: the unique index
      // one_token_per_doctor_per_day ignores NULL tokens, so the number
      // can be handed to whoever books next. Without this, cancelling
      // "poisons" its slot: the time frees but no new token fits.
      `UPDATE "Appointment" SET status='CANCELLED_BY_PATIENT', "tokenNo"=NULL, "updatedAt"=now() WHERE id=$1`,
      [appt!.id], c,
    );
    // if the visit auto-requested a consent that was never approved, expire it
    if (appt.consentId) {
      await run(
        `UPDATE "Consent" SET status='EXPIRED' WHERE id=$1 AND status='REQUESTED'`,
        [appt.consentId], c,
      );
    }
    await appendAudit(v.uid, "CANCEL_APPOINTMENT", "Patient", v.profileId, { q: c, meta: { appointmentId: appt!.id } });
  });

  return ok({ cancelled: true });
});
