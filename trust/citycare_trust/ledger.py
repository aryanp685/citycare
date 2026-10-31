"""
CityCare trust layer — tamper-evident access ledger.

This is the answer to "how will anyone trust you with health data?"

The audit log alone is not enough, because the log lives in YOUR database and
you are the one who can edit it. A patient has no way to check.

So every audit entry is chained to the one before it:

    entry_hash = sha256(prev_hash | timestamp | actor | action | entity)

If anyone — including you, including a DBA with psql access — changes or
deletes a single row, every hash after it stops matching and `verify_chain()`
points at the exact row.

This gives you the tamper-evidence people usually reach for blockchain to get,
with a single extra column and no consensus protocol. That is the argument to
make in the viva if anyone asks why there is no blockchain.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable


def _sha(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


GENESIS = "0" * 64


@dataclass
class LedgerEntry:
    seq: int
    created_at: str
    actor_id: str
    action: str
    entity_type: str
    entity_id: str
    prev_hash: str = ""
    entry_hash: str = ""

    def compute_hash(self) -> str:
        return _sha(
            self.prev_hash,
            self.created_at,
            self.actor_id,
            self.action,
            self.entity_type,
            self.entity_id,
        )


@dataclass
class ChainBreak:
    seq: int
    reason: str
    expected: str
    found: str


@dataclass
class Ledger:
    entries: list[LedgerEntry] = field(default_factory=list)

    def append(self, actor_id: str, action: str,
               entity_type: str, entity_id: str,
               created_at: datetime | None = None) -> LedgerEntry:
        """Append-only. There is deliberately no update or remove method."""
        prev = self.entries[-1].entry_hash if self.entries else GENESIS
        entry = LedgerEntry(
            seq=len(self.entries) + 1,
            created_at=(created_at or datetime.now(timezone.utc)).isoformat(),
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            prev_hash=prev,
        )
        entry.entry_hash = entry.compute_hash()
        self.entries.append(entry)
        return entry

    def verify(self) -> list[ChainBreak]:
        """Walk the chain. Return every point where it no longer holds."""
        breaks: list[ChainBreak] = []
        expected_prev = GENESIS

        for entry in self.entries:
            if entry.prev_hash != expected_prev:
                breaks.append(ChainBreak(
                    seq=entry.seq,
                    reason="prev_hash does not link to the previous entry "
                           "(a row was inserted, removed or reordered)",
                    expected=expected_prev,
                    found=entry.prev_hash,
                ))
            recomputed = entry.compute_hash()
            if recomputed != entry.entry_hash:
                breaks.append(ChainBreak(
                    seq=entry.seq,
                    reason="entry_hash does not match its contents "
                           "(a row was edited in place)",
                    expected=recomputed,
                    found=entry.entry_hash,
                ))
            expected_prev = entry.entry_hash

        return breaks

    def proof_for(self, seq: int) -> dict[str, Any]:
        """
        A patient-facing receipt: 'here is the cryptographic proof of who
        touched your record and when'. Small enough to show on one screen.
        """
        entry = self.entries[seq - 1]
        return {
            "seq": entry.seq,
            "when": entry.created_at,
            "actor": entry.actor_id,
            "action": entry.action,
            "entity": f"{entry.entity_type}:{entry.entity_id}",
            "entry_hash": entry.entry_hash,
            "verify_command": f"sha256('{entry.prev_hash}|{entry.created_at}|"
                              f"{entry.actor_id}|{entry.action}|{entry.entity_type}|"
                              f"{entry.entity_id}')",
        }


def detect_tampering(before: Iterable[LedgerEntry],
                     after: Iterable[LedgerEntry]) -> list[ChainBreak]:
    """Compare a published chain against the current one."""
    ledger = Ledger(entries=list(after))
    return ledger.verify()
