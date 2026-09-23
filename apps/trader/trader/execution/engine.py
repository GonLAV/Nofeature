"""Execution Engine: the only code that sends orders to a broker.

It accepts nothing but a signed RiskApproval, cannot change risk rules, and
treats every broker error as "state unknown" — it reconciles by client order id
instead of retrying, so an order is never sent twice.
"""
from __future__ import annotations

import sqlite3
from decimal import Decimal

from trader.audit.audit_log import AuditLog
from trader.broker.base import BrokerError, BrokerInterface, BrokerRejected, BrokerTimeout
from trader.core.models import Order, OrderStatus, Side
from trader.database.db import Database, iso
from trader.risk.kill_switch import KillReason, KillSwitch
from trader.security.approval import ApprovalSigner, RiskApproval


class ExecutionRefused(Exception):
    pass


class ExecutionEngine:
    def __init__(self, db: Database, broker: BrokerInterface, signer: ApprovalSigner, kill: KillSwitch,
                 audit: AuditLog, expected_account_id: str):
        self.db = db
        self.broker = broker
        self._signer = signer
        self.kill = kill
        self.audit = audit
        self.expected_account_id = expected_account_id

    # --- submit ------------------------------------------------------------------------------
    def execute(self, approval: RiskApproval, decision_id: int | None = None) -> Order | None:
        now = self.audit.clock()
        req = approval.request
        problem = self._signer.verify(approval, now)
        if problem:
            if "signature" in problem:
                self.kill.trip(KillReason.SECURITY_ANOMALY, f"forged/tampered approval for {req.client_order_id}")
            raise ExecutionRefused(problem)
        if self.kill.engaged and not req.reduce_only:
            raise ExecutionRefused("kill switch engaged: new orders blocked")
        if self.broker.account_id != self.expected_account_id:
            self.kill.trip(KillReason.SECURITY_ANOMALY, "broker bound to an unexpected account")
            raise ExecutionRefused("account mismatch")

        # Write-ahead: the row exists before the broker call, and its primary key
        # makes a second submission of the same client order id impossible.
        try:
            with self.db.tx() as c:
                c.execute(
                    "INSERT INTO orders(client_order_id, session_id, decision_id, symbol, side, order_type, qty, "
                    "stop_price, limit_price, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (req.client_order_id, req.session_id, decision_id, req.symbol, req.side.value,
                     req.order_type.value, str(req.qty), _s(req.stop_price), _s(req.limit_price),
                     OrderStatus.PENDING_SUBMIT.value, iso(now), iso(now)),
                )
        except sqlite3.IntegrityError:
            self.kill.trip(KillReason.DUPLICATE_ORDERS, f"duplicate submit of {req.client_order_id}")
            raise ExecutionRefused("duplicate order") from None

        if req.reduce_only:
            self._cancel_protective_children(req.session_id, req.symbol)

        self.audit.record("execution", "ORDER_SENDING", req.session_id, client_order_id=req.client_order_id,
                          symbol=req.symbol, side=req.side, qty=req.qty, stop_loss=req.stop_loss,
                          take_profit=req.take_profit)
        try:
            order = self.broker.submit_order(req)
        except BrokerRejected as exc:
            self._mark(req.client_order_id, OrderStatus.REJECTED, str(exc))
            self.audit.record("execution", "ORDER_REJECTED", req.session_id,
                              client_order_id=req.client_order_id, reason=str(exc))
            return None
        except (BrokerTimeout, BrokerError) as exc:
            self.audit.error("execution", f"submit {req.client_order_id} uncertain: {exc!r}")
            order = self._resolve_uncertain(req.client_order_id)
            if order is None:
                return None
        self._update_from_broker(order, req.session_id)
        event = "ORDER_REJECTED" if order.status is OrderStatus.REJECTED else "ORDER_SENT"
        self.audit.record("execution", event, req.session_id, client_order_id=order.client_order_id,
                          broker_order_id=order.broker_order_id, status=order.status,
                          filled_qty=order.filled_qty, avg_price=order.filled_avg_price,
                          reason=order.reject_reason)
        if order.status is not OrderStatus.REJECTED and req.side is Side.BUY and req.stop_loss is not None:
            self._verify_protection(order, req.session_id)
        return order

    def _resolve_uncertain(self, cid: str) -> Order | None:
        """Did the order reach the broker? Ask by client order id; never resend."""
        try:
            found = self.broker.get_order(cid)
        except BrokerError as exc:
            self.kill.trip(KillReason.BROKER_CONNECTION, f"cannot confirm order {cid}: {exc!r}")
            return None  # stays PENDING_SUBMIT; restart reconciliation resolves it
        if found is None:
            self._mark(cid, OrderStatus.UNSENT, "broker has no record after failed submit")
            return None
        self.audit.record("execution", "ORDER_RECOVERED", None, client_order_id=cid, status=found.status)
        return found

    def _verify_protection(self, entry: Order, session_id: str) -> None:
        if entry.filled_qty <= 0:
            return
        try:
            stop = self.broker.get_order(f"{entry.client_order_id}-sl")
        except BrokerError:
            stop = None
        if stop is None or not stop.status.is_open or stop.qty < entry.filled_qty:
            self.kill.trip(KillReason.UNPROTECTED_POSITION, f"{entry.symbol} filled without an active stop")

    def _cancel_protective_children(self, session_id: str, symbol: str) -> None:
        rows = self.db.query(
            "SELECT client_order_id FROM orders WHERE session_id = ? AND symbol = ? AND side = 'SELL' "
            "AND parent_client_order_id IS NOT NULL AND status IN ('ACCEPTED','PARTIALLY_FILLED')",
            (session_id, symbol),
        )
        for r in rows:
            self.broker.cancel_order(r["client_order_id"])
            self._mark(r["client_order_id"], OrderStatus.CANCELED, "replaced by exit order")

    # --- state sync ----------------------------------------------------------------------------
    def sync(self, session_id: str) -> None:
        """Pull the broker's view of every order of this session (and their bracket children)."""
        ours = {r["client_order_id"]: r for r in self.db.query(
            "SELECT client_order_id, status FROM orders WHERE session_id = ?", (session_id,))}
        for order in self.broker.get_orders():
            if order.client_order_id in ours:
                if OrderStatus(ours[order.client_order_id]["status"]) is not order.status or order.status.is_open:
                    self._update_from_broker(order, session_id)
            elif order.parent_client_order_id in ours:
                self._update_from_broker(order, session_id)
        for cid, row in ours.items():
            if OrderStatus(row["status"]) is OrderStatus.PENDING_SUBMIT:
                self._resolve_uncertain(cid)

    def _update_from_broker(self, o: Order, session_id: str) -> None:
        now = iso(self.audit.clock())
        with self.db.tx() as c:
            c.execute(
                "INSERT INTO orders(client_order_id, session_id, parent_client_order_id, broker_order_id, symbol, "
                "side, order_type, qty, limit_price, stop_price, status, filled_qty, filled_avg_price, fees, "
                "reject_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(client_order_id) DO UPDATE SET broker_order_id = excluded.broker_order_id, "
                "qty = excluded.qty, status = excluded.status, filled_qty = excluded.filled_qty, "
                "filled_avg_price = excluded.filled_avg_price, fees = excluded.fees, "
                "reject_reason = excluded.reject_reason, updated_at = excluded.updated_at",
                (o.client_order_id, session_id, o.parent_client_order_id, o.broker_order_id, o.symbol,
                 o.side.value, o.order_type.value, str(o.qty), _s(o.limit_price), _s(o.stop_price),
                 o.status.value, str(o.filled_qty), _s(o.filled_avg_price), str(o.fees), o.reject_reason,
                 iso(o.created_at) if o.created_at else now, now),
            )

    def _mark(self, cid: str, status: OrderStatus, reason: str) -> None:
        self.db.execute(
            "UPDATE orders SET status = ?, reject_reason = ?, updated_at = ? WHERE client_order_id = ?",
            (status.value, reason, iso(self.audit.clock()), cid),
        )


def _s(v: Decimal | None) -> str | None:
    return None if v is None else str(v)
