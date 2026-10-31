"""
Regression tests for the CityCare trust layer.

Run:  python3 -m unittest discover -s trust -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from citycare_trust.deletion import (
    AccessControl, AccessDenied, purge_patient, transparency_report,
)
from citycare_trust.ledger import GENESIS, Ledger
from citycare_trust.onboard import (
    backfill_from_photos, minimum_viable_profile, parse_prescription_photo,
    profile_time_seconds,
)


class TestColdStart(unittest.TestCase):
    def test_profile_takes_under_two_minutes(self):
        """The whole point: onboarding must not feel like paperwork."""
        self.assertLessEqual(profile_time_seconds(), 120)

    def test_four_answers_produce_a_clinically_useful_record(self):
        record = minimum_viable_profile({
            "allergies": ["Penicillin"],
            "chronic_conditions": ["Type 2 Diabetes"],
            "current_medications": ["Metformin 500"],
            "blood_group": "B+",
        })
        self.assertEqual(record["allergies"][0]["allergen"], "Penicillin")
        self.assertEqual(record["completeness_pct"], 100)
        self.assertEqual(record["missing"], [])
        self.assertEqual(record["encounters"], [],
                         "a cold-start record must be honest about having no history")

    def test_incomplete_profile_reports_what_is_missing(self):
        record = minimum_viable_profile({"allergies": ["Penicillin"]})
        self.assertEqual(record["completeness_pct"], 25)
        self.assertIn("blood_group", record["missing"])

    def test_patient_reported_facts_are_attributed(self):
        """A patient's own claim must never look like a doctor's finding."""
        record = minimum_viable_profile({"allergies": ["Penicillin"]})
        self.assertEqual(record["allergies"][0]["reportedBy"], "PATIENT")


class TestBackfill(unittest.TestCase):
    OCR = """
    Rx
    Tab Metformin 500 mg   1-0-1   x 30 days
    Tab Telmisartan 40 mg  1-0-0
    """

    def test_drugs_are_extracted_as_drafts_never_active(self):
        parsed = parse_prescription_photo(self.OCR)
        names = {m["name"] for m in parsed.medications}
        self.assertIn("Tab Metformin", names)
        for m in parsed.medications:
            self.assertEqual(m["status"], "DRAFT",
                             "backfilled data must require patient confirmation")

    def test_dose_and_frequency_are_captured(self):
        parsed = parse_prescription_photo(self.OCR)
        met = next(m for m in parsed.medications if "Metformin" in m["name"])
        self.assertEqual(met["dosage"], "500 mg")
        self.assertEqual(met["frequency"], "1-0-1")

    def test_unreadable_lines_are_reported_not_guessed(self):
        parsed = parse_prescription_photo("Rx\nillegible scrawl\nTab Aspirin 75 mg 0-0-1\n")
        self.assertTrue(parsed.unparseable_lines)
        self.assertEqual(len(parsed.medications), 1)

    def test_batch_deduplicates_by_drug_name(self):
        result = backfill_from_photos([self.OCR, self.OCR, self.OCR])
        names = [m["name"] for m in result["draft_medications"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(result["unique_drugs"], 2)

    def test_backfill_never_auto_activates(self):
        result = backfill_from_photos([self.OCR])
        self.assertTrue(result["requires_confirmation"])


class TestLedger(unittest.TestCase):
    def setUp(self):
        self.ledger = Ledger()
        self.ledger.append("pat-1", "GRANT_CONSENT", "Consent", "doc-1:pat-1")
        self.ledger.append("doc-1", "VIEW_RECORD", "Patient", "pat-1")
        self.ledger.append("pat-1", "REVOKE_CONSENT", "Consent", "doc-1:pat-1")

    def test_clean_chain_verifies(self):
        self.assertEqual(self.ledger.verify(), [])

    def test_first_entry_chains_to_genesis(self):
        self.assertEqual(self.ledger.entries[0].prev_hash, GENESIS)

    def test_editing_a_row_breaks_the_chain(self):
        self.ledger.entries[1].action = "NOTHING_HAPPENED"
        breaks = self.ledger.verify()
        self.assertTrue(breaks)
        self.assertEqual(breaks[0].seq, 2)
        self.assertIn("edited in place", breaks[0].reason)

    def test_removing_a_row_breaks_the_chain(self):
        del self.ledger.entries[1]
        breaks = self.ledger.verify()
        self.assertTrue(breaks)
        self.assertIn("inserted, removed or reordered", breaks[0].reason)

    def test_reordering_breaks_the_chain(self):
        self.ledger.entries[1], self.ledger.entries[2] = \
            self.ledger.entries[2], self.ledger.entries[1]
        self.assertTrue(self.ledger.verify())

    def test_proof_is_self_describing(self):
        proof = self.ledger.proof_for(2)
        self.assertEqual(proof["actor"], "doc-1")
        self.assertIn("sha256(", proof["verify_command"])


class TestAccessControl(unittest.TestCase):
    def setUp(self):
        self.access = AccessControl()

    def test_no_consent_means_no_access(self):
        with self.assertRaises(AccessDenied):
            self.access.read_record("doc-1", "pat-1", {})

    def test_granted_access_works_and_is_logged(self):
        self.access.grant("doc-1", "pat-1")
        result = self.access.read_record("doc-1", "pat-1", {"a": 1})
        self.assertEqual(result["data"], {"a": 1})
        actions = [e.action for e in self.access.ledger.entries]
        self.assertIn("VIEW_RECORD", actions)

    def test_revocation_blocks_the_very_next_request(self):
        """The single most important trust behaviour in the product."""
        self.access.grant("doc-1", "pat-1")
        self.access.read_record("doc-1", "pat-1", {})
        self.assertTrue(self.access.revoke("doc-1", "pat-1"))
        with self.assertRaises(AccessDenied) as ctx:
            self.access.read_record("doc-1", "pat-1", {})
        self.assertIn("revoked", ctx.exception.reason)

    def test_expired_consent_is_refused(self):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        self.access.grant("doc-1", "pat-1", expires_at=past)
        with self.assertRaises(AccessDenied) as ctx:
            self.access.read_record("doc-1", "pat-1", {})
        self.assertIn("expired", ctx.exception.reason)

    def test_consent_is_per_doctor_not_global(self):
        """Regression: one doctor's consent must not open the record to another."""
        self.access.grant("doc-1", "pat-1")
        with self.assertRaises(AccessDenied):
            self.access.read_record("doc-2", "pat-1", {})

    def test_revoking_twice_is_not_an_error(self):
        self.access.grant("doc-1", "pat-1")
        self.assertTrue(self.access.revoke("doc-1", "pat-1"))
        self.assertFalse(self.access.revoke("doc-1", "pat-1"))


class TestErasure(unittest.TestCase):
    def test_purge_reports_what_was_removed_and_what_was_kept(self):
        access = AccessControl()
        record = {"encounters": [1, 2], "labs": [1], "documents": [1, 2, 3]}
        report = purge_patient("pat-1", record, ["a.pdf", "b.pdf"], access)
        self.assertEqual(report.files_shredded, 2)
        self.assertTrue(any("encounters" in s for s in report.soft_deleted))
        self.assertTrue(report.retained_for_audit,
                        "the audit ledger must survive erasure — it is the proof")

    def test_erasure_is_itself_recorded(self):
        access = AccessControl()
        purge_patient("pat-1", {"encounters": [1]}, [], access)
        actions = [e.action for e in access.ledger.entries]
        self.assertIn("PURGE_REQUESTED", actions)
        self.assertIn("DATA_ERASED", actions)

    def test_ledger_still_verifies_after_erasure(self):
        access = AccessControl()
        purge_patient("pat-1", {"encounters": [1]}, ["a.pdf"], access)
        self.assertEqual(access.ledger.verify(), [])

    def test_transparency_report_exposes_tampering(self):
        access = AccessControl()
        access.grant("doc-1", "pat-1")
        access.ledger.entries[0].actor_id = "attacker"
        report = transparency_report("pat-1", access)
        self.assertFalse(report["ledger_intact"])
        self.assertTrue(report["tampering_detected"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
