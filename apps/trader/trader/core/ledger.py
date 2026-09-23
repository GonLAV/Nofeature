"""Cycle ledger: the capital the current cycle is allowed to use.

It is derived ONLY from the cycle's fixed allocation plus the fills of orders
tagged with the cycle's session id. Broker cash is never an input, so money
outside the cycle (earlier cycles' winnings, other deposits) cannot leak in.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from trader.core.models import money
from trader.database.db import Database


@dataclass(frozen=True)
class LedgerPosition:
    symbol: str
    qty: Decimal
    avg_cost: Decimal  # includes buy fees


@dataclass(frozen=True)
class LedgerSnapshot:
    session_id: str
    allocated: Decimal
    cash: Decimal
    fees: Decimal
    positions: dict = field(default_factory=dict)  # symbol -> LedgerPosition

    def equity(self, marks: dict) -> Decimal:
        """marks: symbol -> price. A position without a mark makes equity unknowable."""
        total = self.cash
        for sym, pos in self.positions.items():
            if sym not in marks:
                raise KeyError(f"no mark for {sym}")
            total += pos.qty * Decimal(str(marks[sym]))
        return money(total)

    def exposure(self, marks: dict) -> Decimal:
        return money(sum((p.qty * Decimal(str(marks[s])) for s, p in self.positions.items()), Decimal(0)))


def compute_ledger(db: Database, session_id: str, allocated: Decimal) -> LedgerSnapshot:
    rows = db.query(
        "SELECT symbol, side, filled_qty, filled_avg_price, fees FROM orders "
        "WHERE session_id = ? AND CAST(filled_qty AS REAL) > 0 ORDER BY created_at, rowid",
        (session_id,),
    )
    cash = Decimal(allocated)
    fees_total = Decimal(0)
    pos: dict[str, list] = {}  # symbol -> [qty, cost_basis]
    for r in rows:
        q = Decimal(r["filled_qty"])
        px = Decimal(r["filled_avg_price"])
        fee = Decimal(r["fees"])
        notional = money(q * px)
        fees_total += fee
        slot = pos.setdefault(r["symbol"], [Decimal(0), Decimal(0)])
        if r["side"] == "BUY":
            cash -= notional + fee
            slot[0] += q
            slot[1] += notional + fee
        else:
            cash += notional - fee
            if slot[0] > 0:
                slot[1] -= slot[1] * (q / slot[0])
            slot[0] -= q
    positions = {
        s: LedgerPosition(s, v[0], money(v[1] / v[0]))
        for s, v in pos.items() if v[0] > 0
    }
    return LedgerSnapshot(session_id, Decimal(allocated), money(cash), money(fees_total), positions)
