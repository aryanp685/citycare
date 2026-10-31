#!/usr/bin/env python3
"""
CityCare — cold start and trust, demonstrated.

Run:  python3 cold_start_demo.py

This is the script to run in front of your examiner. It answers the two
questions every health-record project gets asked:

    "Where does the historical data come from?"
    "Why would anyone trust you with it?"

It shows a patient starting from literally nothing, becoming useful in 85
seconds, backfilling a year of prescriptions from photos, then exercising
every trust mechanism: consent, revocation, denial, tamper detection, erasure.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from citycare_trust.deletion import (
    AccessControl, AccessDenied, purge_patient, transparency_report,
)
from citycare_trust.ledger import GENESIS, Ledger
from citycare_trust.onboard import (
    PROFILE_STEPS, backfill_from_photos, day_one_value,
    minimum_viable_profile, profile_time_seconds,
)

PATIENT = "pat-ramesh"
DOCTOR = "doc-kulkarni"


def hr(title: str) -> None:
    print("\n" + "=" * 74)
    print(title)
    print("=" * 74)


def step_one_empty_record() -> dict:
    hr("STEP 1 — Ramesh signs up. He has ZERO records in the system.")
    print("  encounters: 0    labs: 0    documents: 0    prescriptions: 0")
    print("\n  What can he already do, right now, with an empty record?")
    for i, v in enumerate(day_one_value(has_records=False), 1):
        print(f"    {i}. {v}")
    print("\n  => Appointment booking needs NO history.")
    print("     The product is useful on day one. Records are upside, not a prerequisite.")


def step_two_profile() -> dict:
    hr("STEP 2 — Four questions. That is the entire cold-start requirement.")
    total = 0
    for s in PROFILE_STEPS:
        total += s.seconds
        print(f"  [{s.seconds:>2}s] {s.question}" + ("   (skippable)" if s.optional else ""))
    print(f"\n  Total: {total} seconds  (profile_time_seconds() = {profile_time_seconds()})")

    answers = {
        "allergies": ["Penicillin"],
        "chronic_conditions": ["Type 2 Diabetes", "Hypertension"],
        "current_medications": ["Metformin 500", "Telmisartan 40"],
        "blood_group": "B+",
    }
    record = minimum_viable_profile(answers)
    print("\n  What the doctor now sees, before a single old report is uploaded:")
    print(f"    allergies ........... {[a['allergen'] for a in record['allergies']]}")
    print(f"    conditions .......... {[c['name'] for c in record['conditions']]}")
    print(f"    medications ......... {[m['name'] for m in record['medications']]}")
    print(f"    blood group ......... {record['bloodGroup']}")
    print(f"    completeness ........ {record['completeness_pct']}%")
    print("\n  => A walk-in patient gives the doctor NONE of this reliably.")
    print("     An 85-second profile already beats a fresh consultation.")
    return record


# Simulated OCR off three old prescription slips from a shoebox.
OLD_PRESCRIPTIONS = [
    """
    Dr. S. Deshmukh, MBBS MD          Clinic: Kothrud, Pune
    Rx
    Tab Metformin 500 mg      1-0-1    x 30 days
    Tab Telmisartan 40 mg     1-0-0    x 30 days
    Cap Pantoprazole 40 mg    0-1-0    x 10 days
    Follow up after 1 month
    """,
    """
    Sahyadri Clinic
    Rx
    Tab Atorvastatin 10 mg    0-0-1    x 30 days
    Tab Aspirin 75 mg         0-0-1    x 30 days
    BP 152/94
    """,
    """
    Rx
    Tab Cetirizine 10 mg      sos
    handwritten note illegible here
    Tab Glimepiride 1 mg      1-0-0
    """,
]


def step_three_backfill() -> None:
    hr("STEP 3 — The shoebox. Backfill a year from phone photos.")
    result = backfill_from_photos(OLD_PRESCRIPTIONS)
    print(f"  photos processed ....... {len(OLD_PRESCRIPTIONS)}")
    print(f"  unique drugs found ..... {result['unique_drugs']}")
    print(f"  parse confidence ....... {result['parse_confidence']:.0%}")
    print(f"  lines it could not read  {len(result['unparseable_lines'])}")
    print("\n  Draft rows (status=DRAFT, patient confirms each with one tap):")
    for m in result["draft_medications"]:
        print(f"    - {m['name']:<22} {str(m['dosage'] or '?'):<8} "
              f"{str(m['frequency'] or '?'):<7} [{m['status']}]")
    print(f"\n  Could not parse (goes to manual entry, never guessed):")
    for line in result["unparseable_lines"]:
        print(f"    ! {line}")
    print(f"\n  {result['note']}")
    print("\n  => 20 minutes of typing becomes 60 seconds of tapping.")
    print("     And nothing enters the record unless the patient confirms it.")


def step_four_trust() -> Ledger:
    hr("STEP 4 — Trust is not a promise. It is four things you can test.")
    access = AccessControl()

    print("\n  (a) The patient grants scoped, expiring access")
    access.grant(DOCTOR, PATIENT, scope="LAST_N_ENCOUNTERS",
                 expires_at=datetime.now(timezone.utc) + timedelta(days=7))
    print(f"      {DOCTOR} -> scope=LAST_N_ENCOUNTERS, expires in 7 days")

    print("\n  (b) The doctor reads the record — and it is logged")
    access.read_record(DOCTOR, PATIENT, {"summary": "..."})
    print(f"      VIEW_RECORD written to the ledger")

    print("\n  (c) The patient revokes. The doctor's next request is refused.")
    access.revoke(DOCTOR, PATIENT)
    try:
        access.read_record(DOCTOR, PATIENT, {"summary": "..."})
        print("      !!! ACCESS STILL GRANTED — this would be a serious bug")
    except AccessDenied as e:
        print(f"      HTTP 403 — {e.reason}")

    print("\n  (d) The patient asks: who saw my data? The ledger answers.")
    report = transparency_report(PATIENT, access)
    for ev in report["events"]:
        print(f"      {ev['when']}  {ev['who']:<15} {ev['what']:<15} {ev['on']}")
    print(f"      ledger intact: {report['ledger_intact']} "
          f"({report['ledger_entries']} entries, hash-chained)")
    return access.ledger


def step_five_tamper(ledger: Ledger) -> None:
    hr("STEP 5 — 'But YOU control the database. What stops you editing the log?'")
    print("\n  Every entry is chained: entry_hash = sha256(prev_hash | time | actor | action | entity)")
    print(f"  entry 1 prev_hash = {ledger.entries[0].prev_hash[:16]}... (genesis)")
    print(f"  entry 1 entry_hash = {ledger.entries[0].entry_hash[:16]}...")
    print(f"\n  Chain verifies clean: {len(ledger.verify()) == 0}")

    print("\n  Now simulate an admin quietly editing one row in psql:")
    target = ledger.entries[1]
    print(f"    UPDATE AuditLog SET action='NOTHING_HAPPENED' WHERE seq={target.seq};")
    original = target.action
    target.action = "NOTHING_HAPPENED"

    breaks = ledger.verify()
    print(f"\n  Tampering detected: {len(breaks) > 0}")
    for b in breaks:
        print(f"    seq {b.seq}: {b.reason}")
        print(f"      expected {b.expected[:24]}...")
        print(f"      found    {b.found[:24]}...")

    print("\n  => You do not have to trust us. You can verify the log yourself.")
    print("     This is what people reach for blockchain to get — we do it with")
    print("     one extra column and no consensus protocol.")

    target.action = original
    assert not ledger.verify(), "restoring the row must repair the chain"
    print(f"\n  (row restored — chain verifies clean again: {len(ledger.verify()) == 0})")


def step_six_erasure(access_ledger: Ledger) -> None:
    hr("STEP 6 — 'What if I want out?' Right to erasure (DPDP).")
    access = AccessControl()
    access.ledger = access_ledger

    record = {"encounters": [1, 2, 3], "labs": [1, 2], "medications": [1, 2, 3, 4],
              "conditions": [1, 2], "allergies": [1], "observations": [1, 2, 3],
              "documents": [1, 2, 3, 4, 5]}
    files = [f"pat-ramesh/doc-{i}.pdf" for i in range(1, 6)]

    report = purge_patient(PATIENT, record, files, access)
    print("  soft-deleted:")
    for s in report.soft_deleted:
        print(f"    - {s}")
    print(f"  files shredded ......... {report.files_shredded}")
    print(f"  retained for audit ..... {report.retained_for_audit[0]}")
    print(f"  completed at ........... {report.completed_at}")
    print("\n  => Your data goes. The PROOF of what we held stays with you.")


def main() -> None:
    print("\nCityCare — cold start and trust, demonstrated")
    print("synthetic data | deterministic | no API key required")

    step_one_empty_record()
    record = step_two_profile()
    step_three_backfill()
    ledger = step_four_trust()
    step_five_tamper(ledger)
    step_six_erasure(ledger)

    hr("THE TWO ANSWERS, IN ONE LINE EACH")
    print("""
  Where does the data come from?
    It does not need to. Day one is useful with zero records, because booking
    an appointment needs no history. The record then builds itself: 85 seconds
    of profile, plus a shoebox of old prescriptions parsed into drafts the
    patient confirms. Nobody is ever asked to type their medical history.

  Why would anyone trust you?
    Because trust here is a behaviour the patient can test, not a claim:
    scoped consent, instant revocation, a hash-chained log they can verify
    without trusting you, and erasure that actually erases.
""")


if __name__ == "__main__":
    main()
