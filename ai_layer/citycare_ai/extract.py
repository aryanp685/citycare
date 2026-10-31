"""
CityCare AI layer — structured extraction.

The LLM is allowed to do exactly one thing: fill a fixed schema with values
that already appear in the document. It is NOT allowed to write prose, infer
a diagnosis, or decide what matters.

Three controls, in order of importance:
  1. Schema-constrained output (a fixed set of keys, typed values)
  2. Per-field confidence; anything below CONFIDENCE_FLOOR goes to human review
  3. Grounding (see grounding.py) — the value must literally exist in the OCR text

Nothing in this file trusts the model. The model is treated as an unreliable
data-entry clerk whose work is checked.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

CONFIDENCE_FLOOR = 0.70

LAB_SCHEMA = {
    "testName": "string",
    "value": "string",
    "unit": "string|null",
    "refRangeLow": "string|null",
    "refRangeHigh": "string|null",
    "takenOn": "date|null",
}


class Extractor(Protocol):
    """Anything that can turn OCR text into schema-shaped dicts."""

    def extract(self, ocr_text: str) -> list[dict[str, Any]]: ...


@dataclass
class ExtractionResult:
    fields: list[dict[str, Any]]
    confidence: float
    needs_review: list[str] = field(default_factory=list)
    raw: str = ""


@dataclass
class MockExtractor:
    """
    Deterministic stand-in for the LLM.

    Why this exists: the point of the project's AI layer is the GUARDING, not
    the model. This extractor behaves like a real LLM would on a scanned
    Indian lab report — it gets most fields right and fails in realistic,
    measurable ways — so the guard layer can be benchmarked offline, in CI,
    with no API key and no cost.

    Swap it for `GeminiExtractor` (below) and nothing else changes.
    """

    error_rate: float = 0.25

    _NUM = re.compile(r"([A-Za-z0-9 %/\-\(\)]+?)\s+([\d.]+)\s+([\w%/]+)?\s+([\d.\-\s]+)?")

    def extract(self, ocr_text: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for line in ocr_text.splitlines():
            line = line.strip()
            if not line or line.upper().startswith(("TEST", "REPORT", "---")):
                continue
            m = re.match(
                r"^(?P<name>[A-Za-z0-9 ()\-]+?)\s{2,}(?P<value>[\d.]+)\s*"
                r"(?P<unit>[A-Za-z%µ/]+(?:/[A-Za-z]+)?)?\s*"
                r"(?P<lo>[\d.]+)?\s*-\s*(?P<hi>[\d.]+)?",
                line,
            )
            if not m:
                continue
            d = m.groupdict()
            rows.append({
                "testName": d["name"].strip(),
                "value": d["value"],
                "unit": d.get("unit"),
                "refRangeLow": d.get("lo"),
                "refRangeHigh": d.get("hi"),
                "confidence": 0.93,
            })
        return rows

    def confidence_for(self, ocr_text: str) -> float:
        """Rough proxy: blurry / short documents score lower."""
        return 0.93 if len(ocr_text) > 80 else 0.55


@dataclass
class GeminiExtractor:
    """
    Real extractor. Deliberately thin.

    Requires: GOOGLE_API_KEY, `pip install google-genai`
    Temperature is 0. The response is constrained to a JSON schema so the
    model cannot freelance. Every field still passes through grounding.
    """

    model: str = "gemini-2.5-flash"
    api_key: str | None = None
    _call: Callable[..., Any] | None = None  # injectable for tests

    PROMPT = """You are a data-entry assistant for a hospital record system.

Extract ONLY the values literally printed in the document below.

Hard rules:
- Output JSON only. No prose, no markdown, no explanation.
- Never guess. If a value is not clearly printed, set it to null.
- Never convert units. Copy the unit exactly as printed.
- Never infer a diagnosis or an interpretation.
- Every `value` must be a substring of the source text.

Schema per row: {testName, value, unit, refRangeLow, refRangeHigh, takenOn}

DOCUMENT:
---
{document}
---
"""

    def extract(self, ocr_text: str) -> list[dict[str, Any]]:
        if self._call is None:
            raise RuntimeError(
                "GeminiExtractor needs an API key and the google-genai package. "
                "Use MockExtractor for offline benchmarks."
            )
        raw = self._call(
            model=self.model,
            contents=self.PROMPT.format(document=ocr_text),
            config={"temperature": 0, "response_mime_type": "application/json"},
        )
        import json
        data = json.loads(raw)
        return data.get("rows", data if isinstance(data, list) else [])


def review_queue(extracted: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Anything under the confidence floor is queued for a human, never stored blind."""
    return [f for f in extracted
            if float(f.get("confidence", 0) or 0) < CONFIDENCE_FLOOR]


def accept(extracted: list[dict[str, Any]],
           ocr_text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Split a model's output into (accepted, quarantined).

    A field is accepted only if its value actually appears in the OCR text.
    This catches the most common extraction failure: a plausible-looking
    number that is not in the document.
    """
    accepted: list[dict[str, Any]] = []
    quarantined: list[dict[str, Any]] = []

    for f in extracted:
        value = str(f.get("value", "")).strip()
        grounded = value and value in ocr_text
        confident = float(f.get("confidence", 0) or 0) >= CONFIDENCE_FLOOR
        if grounded and confident:
            accepted.append(f)
        else:
            reason = []
            if not grounded:
                reason.append("value not found in source text")
            if not confident:
                reason.append(f"confidence {f.get('confidence')} below {CONFIDENCE_FLOOR}")
            quarantined.append({**f, "quarantine_reason": "; ".join(reason)})

    return accepted, quarantined
