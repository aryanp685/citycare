"""
CityCare AI layer — deterministic rule engine.

This is the part of the "AI" that never hallucinates, because it never
generates anything. Every output is a direct consequence of stored data.

Design rule for the project: if a check can be written as a rule, write it as
a rule. Use the LLM only for the genuinely unstructured parts (reading a
scanned report, summarising prose).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable

# A small, explicit drug-class table. In production this comes from RxNav
# (https://rxnav.nlm.nih.gov, free, NIH) — never hand-maintain a large one.
PENICILLIN_CLASS = {"amoxicillin", "ampicillin", "penicillin", "augmentin",
                    "co-amoxiclav", "piperacillin", "flucloxacillin"}
NSAID_CLASS = {"ibuprofen", "diclofenac", "naproxen", "mefenamic acid"}


@dataclass
class Alert:
    type: str
    severity: str  # INFO | WARNING | CRITICAL
    title: str
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)
    source: str = "RULE_ENGINE"


# ---------------------------------------------------------------- allergies

def check_drug_allergy_conflicts(record: dict[str, Any]) -> list[Alert]:
    """Every active allergy vs every medication name and drug class."""
    out: list[Alert] = []
    active_allergies = [a for a in record.get("allergies", []) if a.get("isActive", True)]
    meds = record.get("medications", [])

    for allergy in active_allergies:
        allergen = str(allergy.get("allergen", "")).lower().strip()
        if not allergen:
            continue
        for med in meds:
            name = str(med.get("name", "")).lower()
            generic = str(med.get("genericName") or "").lower()
            hit = allergen in name or allergen in generic
            if not hit and allergen == "penicillin":
                hit = bool(PENICILLIN_CLASS & {name.split()[0] if name else "", generic})
            if hit:
                out.append(Alert(
                    type="DRUG_ALLERGY_CONFLICT",
                    severity="CRITICAL",
                    title=f"{med.get('name')} conflicts with recorded {allergen} allergy",
                    message=(
                        f"Patient has a documented {allergen} allergy"
                        f" ({allergy.get('severity', 'WARNING')}) and is prescribed "
                        f"{med.get('name')}. Verify before dispensing."
                    ),
                    evidence={"allergen": allergen, "medication": med.get("name")},
                ))
    return out


# ------------------------------------------------------------------- labs

def check_abnormal_labs(record: dict[str, Any]) -> list[Alert]:
    """
    Recompute abnormality from the reference range ourselves.

    We never trust the `isAbnormal` flag that OCR or an LLM produced — we
    re-derive it from the numbers in the record.
    """
    out: list[Alert] = []
    for lab in record.get("labs", []):
        lo, hi, val = lab.get("refRangeLow"), lab.get("refRangeHigh"), lab.get("value")
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        low = float(lo) if lo not in (None, "") else None
        high = float(hi) if hi not in (None, "") else None

        abnormal = (low is not None and v < low) or (high is not None and v > high)
        if abnormal:
            direction = "above" if high is not None and v > high else "below"
            bound = high if direction == "above" else low
            out.append(Alert(
                type="ABNORMAL_LAB_VALUE",
                severity="WARNING",
                title=f"{lab.get('testName')} {v}{lab.get('unit') or ''} is {direction} range",
                message=(
                    f"{lab.get('testName')} = {v}{lab.get('unit') or ''}; reference "
                    f"range {low}-{high}. Recorded {lab.get('takenOn', 'date unknown')}."
                ),
                evidence={"test": lab.get("testName"), "value": v, "bound": bound},
            ))
    return out


# --------------------------------------------------------------- follow-ups

def check_followups_due(record: dict[str, Any], today: date) -> list[Alert]:
    out: list[Alert] = []
    for enc in record.get("encounters", []):
        fu = enc.get("followUpOn")
        if not fu:
            continue
        fu_date = fu if isinstance(fu, date) else datetime.fromisoformat(str(fu)).date()
        if fu_date <= today:
            out.append(Alert(
                type="CHRONIC_FOLLOWUP_DUE",
                severity="WARNING",
                title=f"Follow-up was due on {fu_date.isoformat()}",
                message=f"{(today - fu_date).days} day(s) overdue for {enc.get('diagnosisText', 'this condition')}.",
                evidence={"followUpOn": fu_date.isoformat()},
            ))
    return out


def check_stale_test(record: dict[str, Any], test_name: str,
                     max_age_days: int, today: date) -> list[Alert]:
    """Flag a chronic-disease marker that has not been repeated in time."""
    latest = None
    for lab in record.get("labs", []):
        if str(lab.get("testName", "")).lower() != test_name.lower():
            continue
        taken = lab.get("takenOn")
        if not taken:
            continue
        d = taken if isinstance(taken, date) else datetime.fromisoformat(str(taken)).date()
        if latest is None or d > latest:
            latest = d

    if latest is None:
        return []

    age_days = (today - latest).days
    if age_days > max_age_days:
        return [Alert(
            type="ABNORMAL_LAB_VALUE",
            severity="WARNING",
            title=f"{test_name} not repeated for {age_days} days",
            message=(
                f"Last {test_name} was on {latest.isoformat()}, {age_days} days ago "
                f"(policy: repeat within {max_age_days} days for this condition)."
            ),
            evidence={"test": test_name, "ageDays": age_days},
        )]
    return []


# ------------------------------------------------------------------ pipeline

_RULES: list[Callable[[dict[str, Any], date], list[Alert]]] = [
    lambda r, t: check_drug_allergy_conflicts(r),
    lambda r, t: check_abnormal_labs(r),
    lambda r, t: check_followups_due(r, t),
    lambda r, t: check_stale_test(r, "HbA1c", 180, t),
]


def run_all(record: dict[str, Any], today: date | None = None) -> list[Alert]:
    """Deterministic. Same record in, same alerts out, every time."""
    today = today or date.today()
    seen: set[tuple[str, str]] = set()
    out: list[Alert] = []
    for rule in _RULES:
        for alert in rule(record, today):
            key = (alert.type, alert.title)
            if key not in seen:
                seen.add(key)
                out.append(alert)
    severity_rank = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    out.sort(key=lambda a: severity_rank.get(a.severity, 9))
    return out
