#!/usr/bin/env python3
"""
CityCare AI layer — accuracy benchmark.

Run:  python3 eval.py

Measures the four things the project actually claims, on synthetic data:
  1. Extraction precision  — of the rows the model gave us, how many are right?
  2. Quarantine rate       — how much bad output got stopped before storage?
  3. Hallucination catch   — of the wrong claims in a summary, how many caught?
  4. False-positive rate   — how often did a CORRECT summary get blocked?
  5. Rule-engine accuracy  — recall and false positives on deterministic checks

No API key, no network. Deterministic. Safe to put in CI.
"""

from __future__ import annotations

import random
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from citycare_ai.extract import MockExtractor, accept
from citycare_ai.grounding import RecordIndex, verify
from citycare_ai.rules import run_all

# --------------------------------------------------------------- test corpus

# Simulates raw OCR off a scanned Indian lab report: mostly clean, with the
# real failure modes (smudged line, broken header, missing reference range).
OCR_SAMPLES = [
    (
        """
        REPORT: BIOCHEMISTRY
        TEST                    VALUE    UNIT      REF RANGE
        Haemoglobin             11.2     g/dL      13.0 - 17.0
        HbA1c                   8.4      %         4.0 - 5.6
        Total Cholesterol       212      mg/dL     125 - 200
        LDL Cholesterol         138      mg/dL     0 - 100
        Serum Creatinine        1.02     mg/dL     0.7 - 1.3
        Fasting Blood Sugar     164      mg/dL     70 - 100
        """,
        {
            "Haemoglobin": ("11.2", "g/dL", 13.0, 17.0),
            "HbA1c": ("8.4", "%", 4.0, 5.6),
            "Total Cholesterol": ("212", "mg/dL", 125, 200),
            "LDL Cholesterol": ("138", "mg/dL", 0, 100),
            "Serum Creatinine": ("1.02", "mg/dL", 0.7, 1.3),
            "Fasting Blood Sugar": ("164", "mg/dL", 70, 100),
        },
    ),
    (
        """
        REPORT: HAEMATOLOGY
        TEST                    VALUE    UNIT      REF RANGE
        WBC Count               7400     /cumm     4000 - 11000
        Platelet Count          145000   /cumm     150000 - 400000
        ESR                     34       mm/hr     0 - 20
        """,
        {
            "WBC Count": ("7400", "/cumm", 4000, 11000),
            "Platelet Count": ("145000", "/cumm", 150000, 400000),
            "ESR": ("34", "mm/hr", 0, 20),
        },
    ),
    (
        """
        REPORT: THYROID PROFILE
        TEST                    VALUE    UNIT      REF RANGE
        TSH                     6.8      uIU/mL    0.27 - 4.2
        Free T4                 0.9      ng/dL     0.93 - 1.7
        """,
        {
            "TSH": ("6.8", "uIU/mL", 0.27, 4.2),
            "Free T4": ("0.9", "ng/dL", 0.93, 1.7),
        },
    ),
]

RECORD = {
    "patient": {"fullName": "Ramesh Patil", "dateOfBirth": "1968-04-12",
               "gender": "M", "bloodGroup": "B_POSITIVE", "city": "Pune"},
    "allergies": [
        {"allergen": "Penicillin", "severity": "CRITICAL", "isActive": True},
    ],
    "conditions": [{"name": "Type 2 Diabetes Mellitus", "icd10": "E11"}],
    "medications": [
        {"name": "Metformin 500", "genericName": "metformin", "dosage": "500 mg",
         "frequency": "1-0-1", "isActive": True},
        {"name": "Atorvastatin 10", "genericName": "atorvastatin", "dosage": "10 mg",
         "frequency": "0-0-1", "isActive": True},
    ],
    "labs": [
        {"testName": "HbA1c", "value": "8.4", "unit": "%",
         "refRangeLow": "4.0", "refRangeHigh": "5.6", "takenOn": "2024-02-10"},
        {"testName": "Fasting Blood Sugar", "value": "164", "unit": "mg/dL",
         "refRangeLow": "70", "refRangeHigh": "100", "takenOn": "2024-02-10"},
        {"testName": "LDL Cholesterol", "value": "138", "unit": "mg/dL",
         "refRangeLow": "0", "refRangeHigh": "100", "takenOn": "2024-02-10"},
        {"testName": "Serum Creatinine", "value": "1.02", "unit": "mg/dL",
         "refRangeLow": "0.7", "refRangeHigh": "1.3", "takenOn": "2024-02-10"},
        {"testName": "Haemoglobin", "value": "11.2", "unit": "g/dL",
         "refRangeLow": "13.0", "refRangeHigh": "17.0", "takenOn": "2024-02-10"},
    ],
    "observations": [
        {"name": "systolic_bp", "valueNum": 152, "unit": "mmHg"},
        {"name": "weight_kg", "valueNum": 78.5, "unit": "kg"},
    ],
    "encounters": [
        {"chiefComplaint": "Chest discomfort since 3 days",
         "diagnosisText": "Type 2 Diabetes Mellitus", "advice": "Continue metformin",
         "followUpOn": "2026-08-01"},
    ],
}


def hr(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


# ------------------------------------------------- 1 & 2: extraction quality

def benchmark_extraction() -> tuple[float, float, float]:
    hr("1. EXTRACTION — how much of the model's output is actually usable?")
    extractor = MockExtractor(error_rate=0.25)

    total_truth = total_extracted = total_accepted = accepted_correct = 0
    total_quarantined = 0

    for ocr_text, truth in OCR_SAMPLES:
        rows = extractor.extract(ocr_text)
        accepted_rows, quarantined = accept(rows, ocr_text)

        for row in accepted_rows:
            name = row["testName"]
            if name in truth and row["value"] == truth[name][0]:
                accepted_correct += 1

        total_truth += len(truth)
        total_extracted += len(rows)
        total_accepted += len(accepted_rows)
        total_quarantined += len(quarantined)

    precision = accepted_correct / total_accepted if total_accepted else 0.0
    recall = total_accepted / total_truth if total_truth else 0.0
    quarantine_rate = total_quarantined / total_extracted if total_extracted else 0.0

    print(f"  ground-truth rows in corpus ......... {total_truth}")
    print(f"  rows the model produced ............. {total_extracted}")
    print(f"  rows accepted after grounding ....... {total_accepted}")
    print(f"  rows quarantined (not stored) ....... {total_quarantined}")
    print(f"  accepted-and-correct ................ {accepted_correct}")
    print()
    print(f"  PRECISION of stored values .......... {precision:.1%}   <- what a doctor can trust")
    print(f"  RECALL (coverage) ................... {recall:.1%}   <- what still needs manual entry")
    print(f"  quarantine rate ..................... {quarantine_rate:.1%}")
    return precision, recall, quarantine_rate


# ------------------------------------------------- 3: hallucination catching

# Each entry: (summary text, list of tokens that are WRONG)
HALLUCINATION_CASES = [
    (
        "Patient has Type 2 Diabetes Mellitus (E11) on metformin 500 mg. "
        "Last HbA1c was 6.4% in Feb 2024, above target.",
        ["6.4"],  # real value is 8.4
    ),
    (
        "Currently on metformin 500 mg and atorvastatin 10 mg. "
        "Also started on warfarin 5 mg for atrial fibrillation.",
        ["warfarin"],  # invented drug
    ),
    (
        "HbA1c 8.4% and Fasting Blood Sugar 164 mg/dL, both above range. "
        "Serum creatinine 1.02 mg/dL is normal. Blood pressure 152 mmHg.",
        [],  # entirely correct — must NOT be flagged
    ),
    (
        "Documented penicillin allergy. Type 2 Diabetes Mellitus (E11). "
        "Last review on 12/03/2026 advised insulin initiation.",
        ["12/03/2026", "insulin"],  # invented date and drug
    ),
    (
        "LDL cholesterol 138 mg/dL above the 100 mg/dL limit. "
        "Haemoglobin 11.2 g/dL is low. Weight 78.5 kg.",
        [],  # entirely correct
    ),
    (
        "Diagnosed with hypertension (I10) and chronic kidney disease (N18.9).",
        ["I10", "N18.9"],  # invented diagnoses
    ),
]


def benchmark_grounding() -> tuple[float, float, float]:
    hr("2. GROUNDING — can the system catch a hallucinated claim?")
    index = RecordIndex.from_record(RECORD)

    wrong_total = wrong_caught = 0
    clean_total = clean_blocked = 0

    for text, wrong_tokens in HALLUCINATION_CASES:
        report = verify(text, index)
        caught_tokens = {c.token for c in report.unverified}

        if wrong_tokens:
            wrong_total += len(wrong_tokens)
            hit = sum(1 for t in wrong_tokens if t in caught_tokens)
            wrong_caught += hit
            flag = "CAUGHT " if hit == len(wrong_tokens) else "MISSED "
            print(f"  {flag} {len(report.unverified):>2} unverified claim(s): "
                  f"{sorted(caught_tokens) or '-'}")
        else:
            clean_total += 1
            if not report.is_clean:
                clean_blocked += 1
                print(f"  FALSE+  correct summary flagged: {sorted(caught_tokens)}")
            else:
                print(f"  OK      correct summary passed ({report.claims_checked} claims verified)")

    catch_rate = wrong_caught / wrong_total if wrong_total else 0.0
    fpr = clean_blocked / clean_total if clean_total else 0.0

    print()
    print(f"  hallucinated claims in test set ..... {wrong_total}")
    print(f"  caught .............................. {wrong_caught}")
    print(f"  HALLUCINATION CATCH RATE ............ {catch_rate:.1%}")
    print(f"  correct summaries blocked (false +).. {clean_blocked}/{clean_total} = {fpr:.1%}")
    return catch_rate, fpr, catch_rate


# ---------------------------------------------------- 4: rule-engine accuracy

def benchmark_rules() -> tuple[int, int]:
    hr("3. RULE ENGINE — deterministic, so this should be exact")
    today = date(2026, 9, 19)
    alerts = run_all(RECORD, today)

    print(f"  alerts raised on the test record .... {len(alerts)}")
    for a in alerts:
        print(f"    [{a.severity:<8}] {a.title}")

    # Expected, by hand, from the record above.
    expected = {
        "Fasting Blood Sugar 164.0mg/dL is above range",
        "HbA1c 8.4% is above range",
        "LDL Cholesterol 138.0mg/dL is above range",
        "Haemoglobin 11.2g/dL is below range",
        "Follow-up was due on 2026-08-01",
        "HbA1c not repeated for 952 days",
    }
    got = {a.title for a in alerts}
    missing = expected - got
    extra = got - expected

    print()
    print(f"  expected alerts ..................... {len(expected)}")
    print(f"  missed (false negatives) ............ {len(missing)}  {sorted(missing) if missing else ''}")
    print(f"  unexpected (false positives) ........ {len(extra)}  {sorted(extra) if extra else ''}")

    # Now prove the allergy rule fires when the conflict exists.
    conflicted = {**RECORD, "medications": RECORD["medications"] + [
        {"name": "Amoxicillin 500", "genericName": "amoxicillin", "isActive": True}]}
    conflict_alerts = [a for a in run_all(conflicted, today)
                       if a.type == "DRUG_ALLERGY_CONFLICT"]
    print()
    print(f"  after prescribing Amoxicillin ....... {len(conflict_alerts)} allergy alert(s)")
    for a in conflict_alerts:
        print(f"    [{a.severity}] {a.title}")

    return len(missing), len(extra)


# ------------------------------------------------------------- 5: end to end

def demo_end_to_end() -> None:
    hr("4. END TO END — a hallucinating model, before and after the guard layer")
    index = RecordIndex.from_record(RECORD)

    bad_summary = (
        "Ramesh Patil, 58, known Type 2 Diabetes Mellitus (E11) on metformin 500 mg. "
        "Glycaemic control is reasonable with last HbA1c 6.4%. "
        "He was started on warfarin 5 mg recently. "
        "Blood pressure 152 mmHg. Documented penicillin allergy. "
        "Serum creatinine 1.02 mg/dL, within range."
    )

    print("\n  --- RAW MODEL OUTPUT (what a naive app would show the doctor) ---")
    print("   ", bad_summary.replace("\n", "\n    "))

    report = verify(bad_summary, index)
    print(f"\n  claims checked: {report.claims_checked}")
    print(f"  claims verified: {report.claims_verified}")
    print(f"  precision: {report.precision:.1%}")
    for c in report.unverified:
        print(f"    UNVERIFIED {c.kind}: {c.token!r}  in: \"{c.span[:60]}...\"")

    from citycare_ai.grounding import grounded_summary
    safe, _ = grounded_summary(bad_summary, RECORD, min_precision=0.999)
    print("\n  --- WHAT THE DOCTOR ACTUALLY SEES ---")
    for line in safe.splitlines():
        print("   ", line)

    print("\n  --- PLUS THE RULE ENGINE (never hallucinates) ---")
    for a in run_all(RECORD, date(2026, 9, 19))[:4]:
        print(f"    [{a.severity}] {a.title}")


def main() -> int:
    print("\nCityCare AI layer accuracy benchmark")
    print("synthetic data | deterministic | no API key required")

    precision, recall, quarantine = benchmark_extraction()
    catch_rate, fpr, _ = benchmark_grounding()
    missed, extra = benchmark_rules()
    demo_end_to_end()

    hr("SUMMARY")
    rows = [
        ("Stored-value precision (extraction)", f"{precision:.1%}"),
        ("Extraction recall / coverage", f"{recall:.1%}"),
        ("Bad rows quarantined, not stored", f"{quarantine:.1%}"),
        ("Hallucination catch rate", f"{catch_rate:.1%}"),
        ("Correct summaries wrongly blocked", f"{fpr:.1%}"),
        ("Rule engine false negatives", f"{missed}"),
        ("Rule engine false positives", f"{extra}"),
    ]
    for label, val in rows:
        print(f"  {label:<42} {val:>8}")

    print("""
  How to read this:
    The extraction numbers are about the MODEL and will move when you plug in
    a real LLM. The grounding and rule-engine numbers are about YOUR CODE and
    stay where they are — that is the part you can defend in a viva.
""")

    # Fail the run if a guardrail regresses.
    failures = []
    if catch_rate < 1.0:
        failures.append(f"hallucination catch rate {catch_rate:.1%} < 100%")
    if fpr > 0.0:
        failures.append(f"false-positive rate {fpr:.1%} > 0%")
    if missed or extra:
        failures.append(f"rule engine: {missed} missed, {extra} spurious")
    if precision < 1.0:
        failures.append(f"stored-value precision {precision:.1%} < 100%")

    if failures:
        print("  FAIL: " + "; ".join(failures))
        return 1
    print("  PASS: every guardrail held.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
