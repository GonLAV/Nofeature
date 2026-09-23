"""US equity regular trading hours. Exchange holidays are not modelled yet —
live adapters must use the broker's own clock endpoint instead."""
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
OPEN, CLOSE = time(9, 30), time(16, 0)


def is_regular_session(ts: datetime) -> bool:
    local = ts.astimezone(NY)
    return local.weekday() < 5 and OPEN <= local.time() < CLOSE
