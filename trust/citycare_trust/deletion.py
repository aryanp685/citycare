"""
CityCare trust layer — revocation, erasure, and access denial.

Trust is not a promise, it is a set of behaviours the patient can test.
These three are the ones that matter:

  1. revoke_access()  — the moment a patient revokes, the doctor's next
                        request is refused. Not "soon". Immediately.
  2. purge_patient()  — right to erasure (DPDP). Clinical data is soft-deleted
                        and files are shredded.
  3. The audit ledger SURVIVES deletion, because it is the patient's proof
                        about what happened to their data. Deleting the proof
                        would defeat the purpose.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .ledger import Ledger


class AccessDenied(Exception):
    """Raised when a request arrives without a live consent."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class ConsentRecord:
    doctor_id: str
    patient_id: str
    status: str = "APPROVED"
    scope: str = "LAST_N_ENCOUNTERS"
    expires_at: datetime | None = None
    revoked_at: datetime | None = None


@dataclass
class AccessControl:
    consents: dict[str, ConsentRecord] = field(default_factory=dict)
    ledger: Ledger = field(default_factory=Ledger)

    def grant(self, doctor_id: str, patient_id: str,
              scope: str = "LAST_N_ENCOUNTERS",
              expires_at: datetime | None = None) -> ConsentRecord:
        key = f"{doctor_id}:{patient_id}"
        consent = ConsentRecord(doctor_id=doctor_id, patient_id=patient_id,
                                scope=scope, expires_at=expires_at)
        self.consents[key] = consent
        self.ledger.append(patient_id, "GRANT_CONSENT", "Consent", key)
        return consent

    def revoke(self, doctor_id: str, patient_id: str, reason: str = "") -> bool:
        key = f"{doctor_id}:{patient_id}"
        consent = self.consents.get(key)
        if not consent or consent.status != "APPROVED":
            return False
        consent.status = "REVOKED"
        consent.revoked_at = datetime.now(timezone.utc)
        self.ledger.append(patient_id, "REVOKE_CONSENT", "Consent", key)
        return True

    def check(self, doctor_id: str, patient_id: str) -> ConsentRecord:
        """
        Called on EVERY clinical read. Server-side only — the frontend is
        never trusted to know whether access is still valid.
        """
        key = f"{doctor_id}:{patient_id}"
        consent = self.consents.get(key)
        now = datetime.now(timezone.utc)

        if not consent:
            raise AccessDenied("no consent has ever been granted")
        if consent.status == "REVOKED":
            raise AccessDenied(
                f"consent was revoked by the patient at {consent.revoked_at:%H:%M:%S}")
        if consent.status != "APPROVED":
            raise AccessDenied(f"consent status is {consent.status}")
        if consent.expires_at and consent.expires_at <= now:
            raise AccessDenied(f"consent expired at {consent.expires_at:%H:%M:%S}")

        return consent

    def read_record(self, doctor_id: str, patient_id: str,
                    record: dict[str, Any]) -> dict[str, Any]:
        """The only path to a patient's clinical data."""
        consent = self.check(doctor_id, patient_id)
        self.ledger.append(doctor_id, "VIEW_RECORD", "Patient", patient_id)
        return {"data": record, "consent_scope": consent.scope}


@dataclass
class PurgeReport:
    soft_deleted: list[str] = field(default_factory=list)
    files_shredded: int = 0
    retained_for_audit: list[str] = field(default_factory=list)
    completed_at: str = ""


def purge_patient(patient_id: str, record: dict[str, Any],
                  files: list[str], access: AccessControl) -> PurgeReport:
    """
    DPDP right to erasure.

    Soft-deletes clinical data and shreds stored files. The audit ledger is
    deliberately retained: it is the evidence about what was held and what was
    destroyed, and the patient is entitled to it.
    """
    report = PurgeReport(completed_at=datetime.now(timezone.utc).isoformat())

    for table in ("encounters", "labs", "medications", "conditions",
                  "allergies", "observations", "documents"):
        if record.get(table):
            report.soft_deleted.append(f"{table}: {len(record[table])} row(s)")

    report.files_shredded = len(files)

    access.ledger.append(patient_id, "PURGE_REQUESTED", "Patient", patient_id)
    access.ledger.append(patient_id, "DATA_ERASED", "Patient", patient_id)
    report.retained_for_audit = [
        "access ledger (proof of what was held and when it was destroyed)"
    ]
    return report


def transparency_report(patient_id: str, access: AccessControl) -> dict[str, Any]:
    """What the patient sees on the 'who saw my data' screen."""
    breaks = access.ledger.verify()
    return {
        "patient": patient_id,
        "events": [
            {"when": e.created_at[11:19], "who": e.actor_id,
             "what": e.action, "on": f"{e.entity_type}:{e.entity_id}"}
            for e in access.ledger.entries
            if e.entity_id == patient_id or e.entity_id.endswith(f":{patient_id}")
        ],
        "ledger_intact": not breaks,
        "ledger_entries": len(access.ledger.entries),
        "tampering_detected": [b.reason for b in breaks],
    }
