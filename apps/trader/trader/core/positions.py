"""Position Manager: one trade record per entry, kept in step with order fills."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from trader.audit.audit_log import AuditLog
from trader.core.ledger import LedgerSnapshot
from trader.core.models import money
from trader.database.db import Database, iso


class PositionManager:
    def __init__(self, db: Database, audit: AuditLog):
        self.db = db
        self.audit = audit

    def open_trade(self, session_id: str, entry_cid: str, symbol: str, stop: Decimal, tp: Decimal | None,
                   reason: str, regime: str = "", setup: str = "") -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO trades(session_id, symbol, entry_client_order_id, qty, entry_price, stop_loss, "
            "take_profit, reason_for_entry, regime, setup, opened_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (session_id, symbol, entry_cid, "0", "0", str(stop), None if tp is None else str(tp), reason,
             regime, setup, iso(self.audit.clock())),
        )

    def refresh(self, session_id: str, ledger: LedgerSnapshot) -> None:
        now = self.audit.clock()
        for t in self.db.query("SELECT * FROM trades WHERE session_id = ? AND closed_at IS NULL", (session_id,)):
            entry = self.db.one("SELECT * FROM orders WHERE client_order_id = ?", (t["entry_client_order_id"],))
            if entry is None:
                continue
            filled = Decimal(entry["filled_qty"])
            if filled == 0:
                if entry["status"] in ("REJECTED", "CANCELED", "UNSENT"):
                    self.db.execute("DELETE FROM trades WHERE id = ?", (t["id"],))
                continue
            self.db.execute("UPDATE trades SET qty = ?, entry_price = ? WHERE id = ?",
                            (str(filled), entry["filled_avg_price"], t["id"]))
            if t["symbol"] in ledger.positions:
                continue
            sells = self.db.query(
                "SELECT client_order_id, filled_qty, filled_avg_price, fees FROM orders WHERE session_id = ? "
                "AND symbol = ? AND side = 'SELL' AND CAST(filled_qty AS REAL) > 0 AND created_at >= ?",
                (session_id, t["symbol"], entry["created_at"]),
            )
            if not sells:
                continue
            sold = sum((Decimal(s["filled_qty"]) for s in sells), Decimal(0))
            proceeds = sum((Decimal(s["filled_qty"]) * Decimal(s["filled_avg_price"]) for s in sells), Decimal(0))
            exit_fees = sum((Decimal(s["fees"]) for s in sells), Decimal(0))
            cost = filled * Decimal(entry["filled_avg_price"]) + Decimal(entry["fees"])
            pnl = money(proceeds - exit_fees - cost)
            last = sells[-1]["client_order_id"]
            why = "STOP_LOSS" if last.endswith("-sl") else "TAKE_PROFIT" if last.endswith("-tp") else "EXIT_ORDER"
            self.db.execute(
                "UPDATE trades SET exit_price = ?, fees = ?, realized_pnl = ?, reason_for_exit = ?, closed_at = ? "
                "WHERE id = ?",
                (str(money(proceeds / sold)), str(Decimal(entry["fees"]) + exit_fees), str(pnl), why, iso(now),
                 t["id"]),
            )
            self.audit.record("positions", "TRADE_CLOSED", session_id, symbol=t["symbol"], pnl=pnl, reason=why)
        with self.db.tx() as c:
            c.execute("DELETE FROM positions WHERE session_id = ?", (session_id,))
            for sym, p in ledger.positions.items():
                t = self.db.one("SELECT stop_loss, take_profit FROM trades WHERE session_id = ? AND symbol = ? "
                                "AND closed_at IS NULL", (session_id, sym))
                c.execute(
                    "INSERT INTO positions(session_id, symbol, qty, avg_entry_price, stop_loss, take_profit, "
                    "updated_at) VALUES (?,?,?,?,?,?,?)",
                    (session_id, sym, str(p.qty), str(p.avg_cost), t["stop_loss"] if t else None,
                     t["take_profit"] if t else None, iso(now)),
                )

    def view(self, session_id: str, marks: dict, now: datetime) -> list:
        out = []
        for t in self.db.query("SELECT * FROM trades WHERE session_id = ? ORDER BY id", (session_id,)):
            qty = Decimal(t["qty"])
            entry = Decimal(t["entry_price"])
            cur = Decimal(str(marks.get(t["symbol"], entry))) if t["closed_at"] is None else Decimal(t["exit_price"])
            opened = datetime.fromisoformat(t["opened_at"])
            closed = datetime.fromisoformat(t["closed_at"]) if t["closed_at"] else now
            out.append({
                "symbol": t["symbol"], "entry_price": entry, "quantity": qty, "current_price": cur,
                "stop_loss": Decimal(t["stop_loss"]),
                "take_profit": Decimal(t["take_profit"]) if t["take_profit"] else None,
                "max_loss": money(qty * (entry - Decimal(t["stop_loss"]))),
                "unrealized_pnl": money(qty * (cur - entry)) if t["closed_at"] is None else Decimal(0),
                "realized_pnl": Decimal(t["realized_pnl"]) if t["realized_pnl"] else Decimal(0),
                "holding_time": str(closed - opened),
                "reason_for_entry": t["reason_for_entry"], "reason_for_exit": t["reason_for_exit"],
                "open": t["closed_at"] is None,
            })
        return out
