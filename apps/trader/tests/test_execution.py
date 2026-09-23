from dataclasses import replace
from decimal import Decimal

import pytest

from conftest import ACCOUNT
from trader.audit.audit_log import AuditLog
from trader.broker.base import BrokerError, BrokerTimeout
from trader.core.cycle import CycleManager
from trader.core.models import OrderRequest, OrderStatus, Side
from trader.database.db import Database
from trader.execution.engine import ExecutionEngine, ExecutionRefused
from trader.risk.kill_switch import KillReason, KillSwitch
from trader.security.approval import ApprovalSigner


@pytest.fixture
def env(broker, clock):
    db = Database()
    audit = AuditLog(db, clock)
    kill = KillSwitch(db, audit)
    signer = ApprovalSigner()
    cycles = CycleManager(db, audit, Decimal("100"), Decimal("1000"))
    session = cycles.start_new(Decimal("100"))
    ex = ExecutionEngine(db, broker, signer, kill, audit, ACCOUNT)
    return db, kill, signer, ex, session


def req(session, cid="C1", q="2", **kw):
    return OrderRequest(cid, session, "XYZ", Side.BUY, Decimal(q), stop_loss=Decimal("19"),
                        take_profit=Decimal("23"), **kw)


def status(db, cid):
    return db.one("SELECT status FROM orders WHERE client_order_id = ?", (cid,))["status"]


def test_happy_path_records_order(env, clock):
    db, kill, signer, ex, s = env
    o = ex.execute(signer.sign(req(s), clock()))
    assert o.status is OrderStatus.FILLED and status(db, "C1") == "FILLED"
    ex.sync(s)
    assert status(db, "C1-sl") == "ACCEPTED"  # bracket child pulled into the session
    assert not kill.engaged


def test_unsigned_or_tampered_approval_trips(env, clock):
    db, kill, signer, ex, s = env
    appr = signer.sign(req(s), clock())
    forged = replace(appr, request=replace(appr.request, qty=Decimal("500")))
    with pytest.raises(ExecutionRefused):
        ex.execute(forged)
    assert kill.status()["reason"] == KillReason.SECURITY_ANOMALY.value
    assert db.one("SELECT COUNT(*) n FROM orders")["n"] == 0


def test_foreign_signer_rejected(env, clock):
    db, kill, signer, ex, s = env
    with pytest.raises(ExecutionRefused):
        ex.execute(ApprovalSigner().sign(req(s), clock()))
    assert kill.engaged


def test_expired_approval_refused_without_trip(env, clock):
    db, kill, signer, ex, s = env
    appr = signer.sign(req(s), clock())
    clock.advance(seconds=31)
    with pytest.raises(ExecutionRefused, match="expired"):
        ex.execute(appr)
    assert not kill.engaged


def test_duplicate_submission_blocked_and_trips(env, clock):
    db, kill, signer, ex, s = env
    ex.execute(signer.sign(req(s), clock()))
    with pytest.raises(ExecutionRefused, match="duplicate"):
        ex.execute(signer.sign(req(s), clock()))
    assert kill.status()["reason"] == KillReason.DUPLICATE_ORDERS.value
    assert len([o for o in env[3].broker.get_orders() if o.parent_client_order_id is None]) == 1


def test_kill_switch_blocks_entries_but_not_exits(env, clock, broker):
    db, kill, signer, ex, s = env
    ex.execute(signer.sign(req(s), clock()))
    ex.sync(s)
    kill.trip(KillReason.MANUAL, "test")
    with pytest.raises(ExecutionRefused):
        ex.execute(signer.sign(req(s, "C2"), clock()))
    exit_req = OrderRequest("X1", s, "XYZ", Side.SELL, Decimal("2"), reduce_only=True)
    o = ex.execute(signer.sign(exit_req, clock()))
    assert o.status is OrderStatus.FILLED and not broker.positions
    assert status(db, "C1-sl") == "CANCELED"


def test_lost_response_is_recovered_not_resent(env, clock, broker):
    db, kill, signer, ex, s = env
    broker.inject_failure("submit_order", BrokerTimeout("response lost"), after_effect=True)
    o = ex.execute(signer.sign(req(s), clock()))
    assert o.status is OrderStatus.FILLED and status(db, "C1") == "FILLED"
    assert len([x for x in broker.get_orders() if x.client_order_id == "C1"]) == 1


def test_request_that_never_arrived_marked_unsent(env, clock, broker):
    db, kill, signer, ex, s = env
    broker.inject_failure("submit_order", BrokerTimeout("connect timeout"))
    assert ex.execute(signer.sign(req(s), clock())) is None
    assert status(db, "C1") == "UNSENT" and not broker.positions


def test_unconfirmable_order_stays_pending_and_trips(env, clock, broker):
    db, kill, signer, ex, s = env
    broker.inject_failure("submit_order", BrokerTimeout("t"), after_effect=True)
    broker.inject_failure("get_order", BrokerError("down"))
    assert ex.execute(signer.sign(req(s), clock())) is None
    assert status(db, "C1") == "PENDING_SUBMIT"
    assert kill.status()["reason"] == KillReason.BROKER_CONNECTION.value
    ex.sync(s)  # later reconciliation resolves it from the broker
    assert status(db, "C1") == "FILLED"


def test_broker_rejection_recorded(env, clock):
    db, kill, signer, ex, s = env
    o = ex.execute(signer.sign(req(s, q="50"), clock()))
    assert o.status is OrderStatus.REJECTED and status(db, "C1") == "REJECTED"


def test_account_swap_trips(env, clock, broker):
    db, kill, signer, ex, s = env
    broker._account_id = "SOMEONE-ELSE"
    with pytest.raises(ExecutionRefused):
        ex.execute(signer.sign(req(s), clock()))
    assert kill.status()["reason"] == KillReason.SECURITY_ANOMALY.value
