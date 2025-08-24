"""Tools for scheduled memory maintenance."""

from __future__ import annotations


from datetime import datetime, timezone

from typing import Callable, List, Dict, Optional

from .memory_bank import MemoryBank


class MemoryScheduler:
    """Manage periodic review and cleanup of memory."""

    def __init__(
        self,
        memory_bank: MemoryBank,
        *,
        max_entries: int = 1000,
        review_days: int = 7,
        summarizer: Callable[[List[Dict]], str] | None = None,
        archive_callback: Callable[[str], None] | None = None,
    ) -> None:
        self.memory_bank = memory_bank
        self.max_entries = max_entries
        self.review_days = review_days
        self.summarizer = summarizer
        self.archive_callback = archive_callback

    def review(self, now: Optional[datetime] = None) -> List[Dict]:
        """Return memory entries that should be reviewed."""
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        entries = self.memory_bank.list_entries()
        to_review: List[Dict] = []
        for entry in entries:
            last = entry.get("last_accessed") or entry.get("timestamp")
            try:
                last_dt = datetime.fromisoformat(last)
            except Exception:
                continue
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            days_old = (now - last_dt).days
            if days_old >= self.review_days or entry.get("type") in {"goal", "task", "reflection"}:
                to_review.append(entry)
                self.memory_bank.touch_entry(entry["id"])
        return to_review

    def cleanup(self, now: Optional[datetime] = None) -> None:
        """Trim memory if it exceeds ``max_entries``."""
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        entries = self.memory_bank.list_entries()
        if len(entries) <= self.max_entries:
            return

        def last_time(e: Dict) -> datetime:
            ts = e.get("last_accessed") or e.get("timestamp")
            try:
                dt = datetime.fromisoformat(ts)
            except Exception:
                return datetime.min
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt

        entries.sort(key=last_time)
        excess = entries[:-self.max_entries]
        if excess and self.summarizer:
            summary = self.summarizer(excess)
            if self.archive_callback:
                self.archive_callback(summary)
        ids = [e["id"] for e in excess]
        if ids:
            self.memory_bank.delete_entries(ids)


if __name__ == "__main__":
    from forgekeeper.logger import get_logger
    from forgekeeper.config import DEBUG_MODE

    log = get_logger(__name__, debug=DEBUG_MODE)
    bank = MemoryBank("default")
    scheduler = MemoryScheduler(
        bank,
        max_entries=500,
        summarizer=lambda items: f"Summarized {len(items)} entries",
        archive_callback=log.info,
    )
    scheduler.review()
    scheduler.cleanup()
