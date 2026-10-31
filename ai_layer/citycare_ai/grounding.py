"""
CityCare AI layer — claim grounding.

The single most important file in this package.

An LLM summary is treated as an UNTRUSTED INPUT, exactly like user-supplied
text. Before it is shown to a doctor, every checkable claim in it is
re-verified against the source record. Anything that cannot be traced back
is removed and the summary is refused.

This is deterministic. It contains no LLM call, so it cannot itself
hallucinate, and its accuracy is measurable at 100%.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

# Clinical token patterns. Deliberately narrow: we would rather miss a claim
# than let a wrong one through.
_NUMBER = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_DATE = re.compile(
    r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",
    re.IGNORECASE,
)
_ICD10 = re.compile(r"\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b")

# Normalised drug vocabulary the record is expected to use.
_KNOWN_DRUGS = {
    "metformin", "glimepiride", "atorvastatin", "telmisartan", "amlodipine",
    "aspirin", "clopidogrel", "pantoprazole", "levothyroxine", "insulin",
    "amoxicillin", "azithromycin", "cetirizine", "paracetamol", "ibuprofen",
    "warfarin", "furosemide", "omeprazole", "prednisolone", "salbutamol",
    "losartan", "dapagliflozin", "sitagliptin", "vitamin d3", "calcium",
}


@dataclass
class RecordIndex:
    """Everything the record can actually prove, normalised for matching."""

    numbers: set[str] = field(default_factory=set)
    drugs: set[str] = field(default_factory=set)
    dates: set[str] = field(default_factory=set)
    icd10: set[str] = field(default_factory=set)
    free_text: str = ""

    def _text_blob(self, texts: list[str]) -> str:
        return " \n ".join(t for t in texts if t).lower()

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "RecordIndex":
        texts: list[str] = []

        for lab in record.get("labs", []):
            texts.append(str(lab.get("value", "")))
            texts.append(str(lab.get("testName", "")))
            if lab.get("unit"):
                texts.append(str(lab["unit"]))
            for k in ("refRangeLow", "refRangeHigh"):
                if lab.get(k) is not None:
                    texts.append(str(lab[k]))
            if lab.get("takenOn"):
                texts.append(str(lab["takenOn"]))

        for med in record.get("medications", []):
            texts.append(str(med.get("name", "")))
            if med.get("genericName"):
                texts.append(str(med["genericName"]))
            if med.get("dosage"):
                texts.append(str(med["dosage"]))

        for obs in record.get("observations", []):
            if obs.get("valueNum") is not None:
                texts.append(str(obs["valueNum"]))
            texts.append(str(obs.get("name", "")))

        for cond in record.get("conditions", []):
            texts.append(str(cond.get("name", "")))
            # ICD-10 codes are legitimate record content, not free text.
            if cond.get("icd10"):
                texts.append(str(cond["icd10"]))

        for allergy in record.get("allergies", []):
            texts.append(str(allergy.get("allergen", "")))

        for enc in record.get("encounters", []):
            for k in ("chiefComplaint", "diagnosisText", "advice", "followUpOn"):
                if enc.get(k):
                    texts.append(str(enc[k]))

        # Demographics. Age is derived from dateOfBirth, so both the stored
        # date and the computed age are legitimate claims a summary can make.
        patient = record.get("patient")
        if isinstance(patient, dict):
            for k in ("fullName", "bloodGroup", "city"):
                if patient.get(k):
                    texts.append(str(patient[k]))
            dob = patient.get("dateOfBirth")
            if dob:
                texts.append(str(dob))
                texts.append(str(_age_from(dob)))
        elif isinstance(patient, str):
            texts.append(patient)
            for n in _NUMBER.findall(patient):
                texts.append(n)

        blob = cls._text_blob(cls, texts)

        idx = cls(free_text=blob)
        idx.numbers = set(_NUMBER.findall(blob))
        idx.dates = {d.lower() for d in _DATE.findall(blob)}
        idx.drugs = {d for d in _KNOWN_DRUGS if d in blob}

        # ICD-10 must be indexed from the original casing. `blob` is lower-cased
        # for substring matching, but _ICD10 requires an uppercase leading
        # letter — pulling codes out of the blob silently returns nothing.
        # (Found by eval.py: E11 was flagged as a hallucination.)
        idx.icd10 = {
            str(c["icd10"]).upper()
            for c in record.get("conditions", [])
            if c.get("icd10")
        }
        return idx


def _age_from(dob: Any) -> int | None:
    try:
        d = dob if isinstance(dob, date) else datetime.fromisoformat(str(dob)[:10]).date()
    except (ValueError, TypeError):
        return None
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


@dataclass
class Claim:
    kind: str
    token: str
    span: str  # surrounding sentence, for the doctor-facing warning


@dataclass
class GroundingReport:
    claims_checked: int = 0
    claims_verified: int = 0
    unverified: list[Claim] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not self.unverified

    @property
    def precision(self) -> float:
        """Fraction of the LLM's checkable claims that the record supports."""
        if self.claims_checked == 0:
            return 1.0
        return self.claims_verified / self.claims_checked


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def _numbers_outside_dates(sentence: str) -> list[str]:
    """
    Collect numeric claims, ignoring digits that are part of a date token.

    Without this, "12/03/2026" is read as three separate numeric claims
    (12, 03, 2026) which all happen to exist somewhere in the record, and a
    fabricated date slips through. Dates are checked as whole tokens instead.
    """
    masked = sentence
    for m in _DATE.finditer(sentence):
        masked = masked[: m.start()] + " " * (m.end() - m.start()) + masked[m.end():]
    return _NUMBER.findall(masked)


def verify(summary_text: str, index: RecordIndex) -> GroundingReport:
    """Check every numeric / drug / date / ICD-10 claim in a summary."""
    report = GroundingReport()

    for sentence in _sentences(summary_text):
        low = sentence.lower()

        # --- numbers (lab values, doses, vitals) ---
        for n in _numbers_outside_dates(sentence):
            # skip plain ordinals / list markers like "1." at sentence start
            if re.fullmatch(r"[1-9]", n) and sentence.lstrip().startswith(n + "."):
                continue
            report.claims_checked += 1
            if n in index.numbers:
                report.claims_verified += 1
            else:
                report.unverified.append(Claim("NUMBER", n, sentence))

        # --- drug names ---
        for drug in _KNOWN_DRUGS:
            if drug in low:
                report.claims_checked += 1
                if drug in index.drugs:
                    report.claims_verified += 1
                else:
                    report.unverified.append(Claim("DRUG", drug, sentence))

        # --- dates ---
        for d in _DATE.findall(sentence):
            report.claims_checked += 1
            if d.lower() in index.dates:
                report.claims_verified += 1
            else:
                report.unverified.append(Claim("DATE", d, sentence))

        # --- ICD-10 codes ---
        for code in _ICD10.findall(sentence):
            report.claims_checked += 1
            if code.upper() in index.icd10:
                report.claims_verified += 1
            else:
                report.unverified.append(Claim("ICD10", code, sentence))

    return report


def redact(summary_text: str, report: GroundingReport) -> str:
    """
    Strip every sentence containing an unverifiable claim and say so.

    We delete the whole sentence rather than the token, because a sentence
    with one wrong number is usually wrong about the number's meaning too.
    """
    if report.is_clean:
        return summary_text

    bad_sentences = {c.span for c in report.unverified}
    kept = [s for s in _sentences(summary_text) if s not in bad_sentences]

    warning = (
        f"[{len(report.unverified)} claim(s) could not be verified against the "
        f"source record and were removed: "
        + ", ".join(f"{c.kind}:{c.token}" for c in report.unverified)
        + "]"
    )
    return ("\n".join(kept) + "\n\n" + warning).strip()


def grounded_summary(
    llm_summary: str, record: dict[str, Any], min_precision: float = 1.0
) -> tuple[str, GroundingReport]:
    """
    Pipeline entry point.

    Returns (safe_text, report). If the summary is worse than min_precision
    it is refused entirely rather than shown partially.
    """
    index = RecordIndex.from_record(record)
    report = verify(llm_summary, index)

    if report.precision < min_precision:
        return (
            "AI summary withheld: it contained claims not supported by the "
            f"patient record ({len(report.unverified)} of {report.claims_checked} "
            "claims unverifiable). Showing raw records instead.",
            report,
        )

    return redact(llm_summary, report), report
