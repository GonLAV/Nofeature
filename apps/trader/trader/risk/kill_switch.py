"""Persistent kill switch. Once tripped it survives restarts and only a human can reset it.

While engaged: no new orders. Risk-reducing orders (closing a cycle position)
are still allowed so the system can get flat.
"""
from __future__ import annotations

from enum import Enum

from trader.audit.audit_log import AuditLog
from trader.database.db import Database, iso


class KillReason(str, Enum):
    DAILY_LOSS_LIMIT = "DAILY_LOSS_LIMIT"
    API_MALFUNCTION = "API_MALFUNCTION"
    DATA_CORRUPTION = "DATA_CORRUPTION"
    BROKER_CONNECTION = "BROKER_CONNECTION"
    UNEXPECTED_BALANCE = "UNEXPECTED_BALANCE"
    UNEXPECTED_POSITION = "UNEXPECTED_POSITION"
    DUPLICATE_ORDERS = "DUPLICATE_ORDERS"
    ABNORMAL_VOLATILITY = "ABNORMAL_VOLATILITY"
    SECURITY_ANOMALY = "SECURITY_ANOMALY"
    AGENT_MALFUNCTION = "AGENT_MALFUNCTION"
    MODEL_HALLUCINATION = "MODEL_HALLUCINATION"
    RISK_ENGINE_UNAVAILABLE = "RISK_ENGINE_UNAVAILABLE"
    UNPROTECTED_POSITION = "UNPROTECTED_POSITION"
    MANUAL = "MANUAL"


_KEY = "kill_switch"


class KillSwitch:
    def __init__(self, db: Database, audit: AuditLog):
        self.db = db
        self.audit = audit

    @property
    def engaged(self) -> bool:
        return bool(self.db.get_state(_KEY, {}).get("engaged", False))

    def status(self) -> dict:
        return self.db.get_state(_KEY, {"engaged": False})

    def trip(self, reason: KillReason, detail: str = "") -> None:
        if self.engaged:
            return
        now = self.audit.clock()
        self.db.set_state(_KEY, {"engaged": True, "reason": reason.value, "detail": detail, "at": iso(now)}, now)
        self.audit.record("kill_switch", "TRIPPED", reason=reason.value, detail=detail)

    def reset(self, operator: str, note: str) -> None:
        if not operator.strip() or not note.strip():
            raise ValueError("reset requires an operator name and a note")
        now = self.audit.clock()
        prev = self.status()
        self.db.set_state(_KEY, {"engaged": False, "reset_by": operator, "note": note, "at": iso(now)}, now)
        self.audit.record("kill_switch", "RESET", operator=operator, note=note, previous=prev)
