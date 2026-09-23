"""Trading cycles: $100 in, $1,000 target, then close everything and start again at $100.

Transitions (all audited):
    ACTIVE --equity >= target--> COMPLETING --all flat--> COMPLETED --> new ACTIVE ($100)
    ACTIVE --equity <= 0-------> FAILED (system stops; no auto-recharge)
"""
from __future__ import annotations

from decimal import Decimal

from trader.audit.audit_log import AuditLog
from trader.core.models import CycleStatus
from trader.database.db import Database, iso


class CycleError(Exception):
    pass


class CycleManager:
    def __init__(self, db: Database, audit: AuditLog, allocation: Decimal, target: Decimal):
        if allocation <= 0 or target <= allocation:
            raise CycleError("target must exceed a positive allocation")
        self.db = db
        self.audit = audit
        self.allocation = Decimal(allocation)
        self.target = Decimal(target)

    def current(self):
        return self.db.one(
            "SELECT * FROM trading_cycles WHERE status IN ('ACTIVE','COMPLETING') ORDER BY id DESC LIMIT 1"
        )

    def last(self):
        return self.db.one("SELECT * FROM trading_cycles ORDER BY id DESC LIMIT 1")

    def history(self) -> list:
        return [dict(r) for r in self.db.query("SELECT * FROM trading_cycles ORDER BY id")]

    def start_new(self, broker_cash: Decimal, *, operator: str | None = None) -> str:
        """Opens a new cycle with exactly the fixed allocation.

        After a FAILED cycle a human operator must start the next one: the system
        never re-funds itself after losing its capital.
        """
        if self.current() is not None:
            raise CycleError("a cycle is already open")
        last = self.last()
        if last is not None and last["status"] == CycleStatus.FAILED.value and not operator:
            raise CycleError("previous cycle FAILED; an operator must start the next cycle")
        if Decimal(broker_cash) < self.allocation:
            raise CycleError(
                f"broker cash {broker_cash} < allocation {self.allocation}; will not start (no auto-recharge)"
            )
        next_id = (last["id"] if last else 0) + 1
        session_id = f"SESSION_{next_id:06d}"
        now = self.audit.clock()
        self.db.execute(
            "INSERT INTO trading_cycles(id, session_id, status, allocated_capital, max_lifetime_capital, "
            "target_equity, started_at) VALUES (?,?,?,?,?,?,?)",
            (next_id, session_id, CycleStatus.ACTIVE.value, str(self.allocation), str(self.allocation),
             str(self.target), iso(now)),
        )
        excess = Decimal(broker_cash) - self.allocation
        self.audit.record(
            "cycle", "CYCLE_STARTED", session_id, allocated=self.allocation, target=self.target,
            operator=operator, isolated_outside_cycle=excess,
        )
        return session_id

    def evaluate(self, session_id: str, equity: Decimal) -> CycleStatus:
        row = self.db.one("SELECT * FROM trading_cycles WHERE session_id = ?", (session_id,))
        if row is None:
            raise CycleError(f"unknown cycle {session_id}")
        status = CycleStatus(row["status"])
        if status is CycleStatus.ACTIVE:
            if equity >= self.target:
                self._set(session_id, CycleStatus.COMPLETING)
                self.audit.record("cycle", "TARGET_REACHED", session_id, equity=equity, target=self.target)
                return CycleStatus.COMPLETING
            if equity <= 0:
                self._end(session_id, CycleStatus.FAILED, equity, "equity <= 0")
                return CycleStatus.FAILED
        return status

    def complete(self, session_id: str, final_equity: Decimal) -> None:
        row = self.db.one("SELECT status FROM trading_cycles WHERE session_id = ?", (session_id,))
        if row is None or row["status"] != CycleStatus.COMPLETING.value:
            raise CycleError("only a COMPLETING cycle can be completed")
        self._end(session_id, CycleStatus.COMPLETED, final_equity, "target reached; all positions closed")

    def fail(self, session_id: str, final_equity: Decimal, reason: str) -> None:
        self._end(session_id, CycleStatus.FAILED, final_equity, reason)

    def _set(self, session_id: str, status: CycleStatus) -> None:
        self.db.execute("UPDATE trading_cycles SET status = ? WHERE session_id = ?", (status.value, session_id))

    def _end(self, session_id: str, status: CycleStatus, equity: Decimal, reason: str) -> None:
        now = self.audit.clock()
        self.db.execute(
            "UPDATE trading_cycles SET status = ?, final_equity = ?, ended_at = ?, end_reason = ? WHERE session_id = ?",
            (status.value, str(equity), iso(now), reason, session_id),
        )
        self.audit.record("cycle", f"CYCLE_{status.value}", session_id, final_equity=equity, reason=reason)
