"""Clocks. Everything time-dependent takes a clock so backtests and tests are deterministic."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


class SystemClock:
    def __call__(self) -> datetime:
        return datetime.now(timezone.utc)


class SimClock:
    def __init__(self, start: datetime):
        if start.tzinfo is None:
            raise ValueError("SimClock needs a timezone-aware start")
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def set(self, ts: datetime) -> None:
        if ts < self.now:
            raise ValueError("time cannot move backwards")
        self.now = ts

    def advance(self, **kw) -> None:
        self.now += timedelta(**kw)
