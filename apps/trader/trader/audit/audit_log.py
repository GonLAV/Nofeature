"""Append-only audit trail: every agent signal, decision, risk verdict and order event."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from enum import Enum

from trader.database.db import Database, iso, utcnow
from trader.security.redaction import redact

log = logging.getLogger("trader.audit")


def _default(o):
    if isinstance(o, Decimal):
        return str(o)
    if isinstance(o, datetime):
        return iso(o)
    if isinstance(o, Enum):
        return o.value
    if isinstance(o, (set, tuple)):
        return list(o)
    return str(o)


def dumps(payload) -> str:
    return redact(json.dumps(payload, default=_default, ensure_ascii=False, sort_keys=True))


class AuditLog:
    def __init__(self, db: Database, clock=utcnow):
        self.db = db
        self.clock = clock

    def record(self, component: str, event: str, session_id: str | None = None, **payload) -> None:
        body = dumps(payload)
        ts = self.clock()
        self.db.execute(
            "INSERT INTO audit_logs(ts, session_id, component, event, payload) VALUES (?,?,?,?,?)",
            (iso(ts), session_id, component, event, body),
        )
        log.info("%s %s %s %s", iso(ts), component, event, body)

    def error(self, component: str, message: str) -> None:
        msg = redact(message)
        self.db.execute(
            "INSERT INTO errors(ts, component, message) VALUES (?,?,?)", (iso(self.clock()), component, msg)
        )
        log.error("%s: %s", component, msg)

    def tail(self, limit: int = 50) -> list:
        rows = self.db.query("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]
