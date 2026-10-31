"""
Regression tests for the CityCare AI guard layer.

Run:  python3 -m unittest discover -s ai_layer -v

These lock in the behaviour measured by eval.py. If someone later "optimises"
grounding.py and it starts letting hallucinations through, this fails.
"""

from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from citycare_ai.extract import CONFIDENCE_FLOOR, accept
from citycare_ai.grounding import RecordIndex, grounded_summary, verify
from citycare_ai.rules import check_abnormal_labs, check_drug_allergy_conflicts, run_all

RECORD = {
    "patient": {"fullName": "Ramesh Patil", "dateOfBirth": "1968-04-12",
                "gender": "M", "city": "Pune"},
    "allergies": [{"allergen": "Penicillin", "severity": "CRITICAL", "isActive": True}],
    "conditions": [{"name": "Type 2 Diabetes Mellitus", "icd10": "E11"}],
    "medications": [
        {"name": "Metformin 500", "genericName": "metformin", "dosage": "500 mg",
         "isActive": True},
    ],
    "labs": [
        {"testName": "HbA1c", "value": "8.4", "unit": "%",
         "refRangeLow": "4.0", "refRangeHigh": "5.6", "takenOn": "2024-02-10"},
        {"testName": "Serum Creatinine", "value": "1.02", "unit": "mg/dL",
         "refRangeLow": "0.7", "refRangeHigh": "1.3", "takenOn": "2024-02-10"},
    ],
    "observations": [{"name": "systolic_bp", "valueNum": 152, "unit": "mmHg"}],
    "encounters": [{"chiefComplaint": "Chest discomfort",
                    "diagnosisText": "Type 2 Diabetes Mellitus",
                    "followUpOn": "2026-08-01"}],
}


class TestGrounding(unittest.TestCase):
    def setUp(self):
        self.index = RecordIndex.from_record(RECORD)

    def test_correct_summary_passes_clean(self):
        text = ("HbA1c 8.4% is above range. Serum creatinine 1.02 mg/dL is normal. "
                "On metformin 500 mg. Blood pressure 152 mmHg.")
        report = verify(text, self.index)
        self.assertTrue(report.is_clean, report.unverified)
        self.assertGreater(report.claims_checked, 0)

    def test_wrong_lab_value_is_caught(self):
        report = verify("Last HbA1c was 6.4%, showing good control.", self.index)
        self.assertFalse(report.is_clean)
        self.assertIn("6.4", [c.token for c in report.unverified])

    def test_invented_drug_is_caught(self):
        report = verify("Patient was started on warfarin 5 mg.", self.index)
        kinds = {c.kind for c in report.unverified}
        self.assertIn("DRUG", kinds)
        self.assertIn("warfarin", [c.token for c in report.unverified])

    def test_invented_icd10_is_caught(self):
        report = verify("Diagnosed with hypertension (I10).", self.index)
        self.assertIn("I10", [c.token for c in report.unverified])

    def test_real_icd10_is_not_flagged(self):
        """Regression: E11 is in the record and must never be called a hallucination."""
        report = verify("Known Type 2 Diabetes Mellitus (E11).", self.index)
        self.assertTrue(report.is_clean, report.unverified)

    def test_patient_age_derived_from_dob_is_not_flagged(self):
        """Regression: age is computed, so it is not literally in the record text."""
        report = verify("Ramesh Patil, 58, diabetic.", self.index)
        self.assertTrue(report.is_clean, report.unverified)

    def test_fabricated_date_is_caught(self):
        report = verify("Last review on 12/03/2026 advised insulin.", self.index)
        tokens = [c.token for c in report.unverified]
        self.assertIn("12/03/2026", tokens)

    def test_date_fragments_are_not_double_counted(self):
        """Regression: 12/03/2026 must be one DATE claim, not three NUMBER claims."""
        report = verify("Last review on 12/03/2026.", self.index)
        date_claims = [c for c in report.unverified if c.kind == "DATE"]
        number_claims = [c for c in report.unverified if c.kind == "NUMBER"]
        self.assertEqual(len(date_claims), 1)
        self.assertEqual(len(number_claims), 0)

    def test_low_precision_summary_is_withheld_entirely(self):
        text = ("HbA1c 6.4%. Started on warfarin 5 mg. New diagnosis of I10. "
                "Creatinine 1.02 mg/dL.")
        safe, report = grounded_summary(text, RECORD, min_precision=0.999)
        self.assertIn("withheld", safe.lower())
        self.assertLess(report.precision, 1.0)

    def test_redaction_removes_only_bad_sentences(self):
        text = ("HbA1c 8.4% is above range. "
                "Patient is also on warfarin. "
                "Blood pressure 152 mmHg.")
        safe, report = grounded_summary(text, RECORD, min_precision=0.0)
        self.assertIn("HbA1c 8.4%", safe)
        self.assertIn("152 mmHg", safe)
        self.assertNotIn("warfarin", safe.split("[")[0])


class TestExtractionGate(unittest.TestCase):
    OCR = "Haemoglobin  11.2  g/dL  13.0 - 17.0"

    def test_grounded_value_is_accepted(self):
        accepted, quarantined = accept(
            [{"testName": "Haemoglobin", "value": "11.2", "confidence": 0.95}], self.OCR)
        self.assertEqual(len(accepted), 1)
        self.assertEqual(quarantined, [])

    def test_value_absent_from_source_is_quarantined(self):
        """The classic extraction failure: a plausible number that was never printed."""
        accepted, quarantined = accept(
            [{"testName": "Haemoglobin", "value": "12.1", "confidence": 0.95}], self.OCR)
        self.assertEqual(accepted, [])
        self.assertEqual(len(quarantined), 1)
        self.assertIn("not found in source", quarantined[0]["quarantine_reason"])

    def test_low_confidence_is_quarantined_even_when_grounded(self):
        accepted, quarantined = accept(
            [{"testName": "Haemoglobin", "value": "11.2", "confidence": 0.40}], self.OCR)
        self.assertEqual(accepted, [])
        self.assertIn("confidence", quarantined[0]["quarantine_reason"])
        self.assertLess(0.40, CONFIDENCE_FLOOR)


class TestRuleEngine(unittest.TestCase):
    def test_deterministic_same_input_same_output(self):
        first = [a.title for a in run_all(RECORD, date(2026, 9, 19))]
        second = [a.title for a in run_all(RECORD, date(2026, 9, 19))]
        self.assertEqual(first, second)

    def test_abnormal_lab_detected_by_recomputation(self):
        alerts = check_abnormal_labs(RECORD)
        self.assertTrue(any("HbA1c" in a.title for a in alerts))

    def test_normal_lab_raises_nothing(self):
        alerts = check_abnormal_labs({"labs": [
            {"testName": "Serum Creatinine", "value": "1.02",
             "refRangeLow": "0.7", "refRangeHigh": "1.3"}]})
        self.assertEqual(alerts, [])

    def test_untrustworthy_isabnormal_flag_is_ignored(self):
        """We recompute; a wrong flag in the data must not create a false alert."""
        alerts = check_abnormal_labs({"labs": [
            {"testName": "Serum Creatinine", "value": "1.02",
             "refRangeLow": "0.7", "refRangeHigh": "1.3", "isAbnormal": True}]})
        self.assertEqual(alerts, [])

    def test_allergy_conflict_fires_for_same_class_drug(self):
        record = {**RECORD, "medications": RECORD["medications"] + [
            {"name": "Amoxicillin 500", "genericName": "amoxicillin", "isActive": True}]}
        alerts = check_drug_allergy_conflicts(record)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].severity, "CRITICAL")

    def test_inactive_allergy_does_not_fire(self):
        record = {**RECORD,
                  "allergies": [{"allergen": "Penicillin", "isActive": False}],
                  "medications": [{"name": "Amoxicillin 500", "isActive": True}]}
        self.assertEqual(check_drug_allergy_conflicts(record), [])

    def test_alerts_sorted_critical_first(self):
        record = {**RECORD, "medications": RECORD["medications"] + [
            {"name": "Amoxicillin 500", "genericName": "amoxicillin", "isActive": True}]}
        alerts = run_all(record, date(2026, 9, 19))
        self.assertEqual(alerts[0].severity, "CRITICAL")


if __name__ == "__main__":
    unittest.main(verbosity=2)
