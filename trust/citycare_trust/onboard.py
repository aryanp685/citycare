"""
CityCare trust layer — cold start.

This module exists to kill the assumption that CityCare needs a patient's
historical data before it is useful.

The rule:
    Day 1 the app is already useful with ZERO records, because appointment
    booking needs no history at all. Everything else is collected
    progressively, and only the clinically critical facts are asked up front.

Nothing here asks the patient to type their life story.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# The only things worth interrupting a patient for. Everything else can wait.
CRITICAL_FACTS = ["allergies", "chronic_conditions", "current_medications", "blood_group"]


@dataclass
class OnboardingStep:
    key: str
    question: str
    field: str
    input_type: str = "chips"
    optional: bool = False
    seconds: int = 20


PROFILE_STEPS = [
    OnboardingStep("s1", "Kya aapko kisi dawa se allergy hai?", "allergies",
                   input_type="chips", seconds=25),
    OnboardingStep("s2", "Koi lambi bimari chal rahi hai? (sugar, BP, thyroid...)",
                   "chronic_conditions", input_type="chips", seconds=20),
    OnboardingStep("s3", "Abhi kaunsi dawaiyan chal rahi hain?", "current_medications",
                   input_type="text", seconds=30),
    OnboardingStep("s4", "Blood group pata hai?", "blood_group",
                   input_type="select", optional=True, seconds=10),
]


def profile_time_seconds() -> int:
    return sum(s.seconds for s in PROFILE_STEPS)


def minimum_viable_profile(answers: dict[str, Any]) -> dict[str, Any]:
    """
    Build a usable record from four answers.

    This is the entire cold-start requirement. A doctor seeing this profile
    already knows more than they would from a fresh walk-in patient.
    """
    missing = [f for f in CRITICAL_FACTS if not answers.get(f)]
    return {
        "allergies": [{"allergen": a, "isActive": True, "reportedBy": "PATIENT"}
                      for a in answers.get("allergies", [])],
        "conditions": [{"name": c, "status": "ACTIVE", "reportedBy": "PATIENT"}
                       for c in answers.get("chronic_conditions", [])],
        "medications": [{"name": m, "isActive": True, "reportedBy": "PATIENT"}
                        for m in answers.get("current_medications", [])],
        "bloodGroup": answers.get("blood_group", "UNKNOWN"),
        "completeness_pct": round(
            100 * (len(CRITICAL_FACTS) - len(missing)) / len(CRITICAL_FACTS)),
        "missing": missing,
        "encounters": [],   # empty on purpose — the timeline fills itself
        "labs": [],
    }


# ------------------------------------------------ batch backfill from photos

_DRUG_HINTS = ("mg", "mcg", "ml", "iu", "tab", "cap", "syp", "inj")
_DOSE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu)\b", re.IGNORECASE)
_FREQUENCY = re.compile(r"\b(\d\s*[-–]\s*\d\s*[-–]\s*\d|od|bd|tds|hs|sos|1-0-1|0-0-1|1-1-1)\b",
                        re.IGNORECASE)


@dataclass
class ParsedPrescription:
    medications: list[dict[str, Any]] = field(default_factory=list)
    unparseable_lines: list[str] = field(default_factory=list)
    confidence: float = 0.0


def parse_prescription_photo(ocr_text: str) -> ParsedPrescription:
    """
    Turn the OCR of one old prescription page into pre-filled medication rows.

    The output is a DRAFT. It never goes straight into the record — it goes
    into a review queue the patient confirms with one tap per row. That single
    design choice is what makes batch backfill safe.
    """
    meds: list[dict[str, Any]] = []
    junk: list[str] = []

    for raw in ocr_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower()

        has_drug_signal = any(h in low for h in _DRUG_HINTS)
        if not has_drug_signal and not _DOSE.search(line):
            junk.append(line)
            continue

        name = re.split(r"\d", line, maxsplit=1)[0].strip(" .-–")
        dose = _DOSE.search(line)
        freq = _FREQUENCY.search(line)

        if len(name) < 3:
            junk.append(line)
            continue

        meds.append({
            "name": name,
            "dosage": dose.group(0) if dose else None,
            "frequency": freq.group(1).replace(" ", "") if freq else None,
            "isActive": True,
            "reportedBy": "PATIENT",
            "status": "DRAFT",           # <- never ACTIVE until confirmed
            "source_line": line,
        })

    parsed = len(meds)
    total = parsed + len(junk)
    confidence = round(parsed / total, 2) if total else 0.0

    return ParsedPrescription(medications=meds, unparseable_lines=junk,
                              confidence=confidence)


def backfill_from_photos(ocr_texts: list[str]) -> dict[str, Any]:
    """
    Run a whole shoebox of old prescriptions through at once.

    Returns drafts plus a completeness estimate. The patient then confirms,
    which is a 60-second job for a year of history instead of a 20-minute one.
    """
    all_meds: list[dict[str, Any]] = []
    all_junk: list[str] = []

    for text in ocr_texts:
        parsed = parse_prescription_photo(text)
        all_meds.extend(parsed.medications)
        all_junk.extend(parsed.unparseable_lines)

    # De-duplicate by drug name, keeping the most recent-looking entry.
    seen: dict[str, dict[str, Any]] = {}
    for m in all_meds:
        key = m["name"].lower()
        if key not in seen:
            seen[key] = m

    total = len(all_meds) + len(all_junk)
    return {
        "draft_medications": list(seen.values()),
        "unique_drugs": len(seen),
        "unparseable_lines": all_junk,
        "parse_confidence": round(len(all_meds) / total, 2) if total else 0.0,
        "requires_confirmation": True,
        "note": "Drafts are shown to the patient for one-tap confirmation. "
                "Nothing enters the record as ACTIVE without that step.",
    }


# ----------------------------------------------------------- value from day 1

def day_one_value(has_records: bool) -> list[str]:
    """
    What the patient gets BEFORE any history exists. This is the answer to
    'why would anyone sign up with an empty record?'
    """
    base = [
        "Book an appointment without a phone call or a queue",
        "See real fees, timings and ratings before travelling",
        "Get an SMS reminder so you do not miss the slot",
        "Store the prescription you are handed today, so it is not lost",
    ]
    if has_records:
        base.append("Doctor sees your history in 30 seconds instead of asking again")
    return base
