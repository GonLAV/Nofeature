"""End-to-end behaviour of the TradingSystem: happy path, cycles, fail-closed, recovery."""
import json
from decimal import Decimal

import pytest

from conftest import ACCOUNT, ny
from helpers import default_system
from trader.broker.base import BrokerError
from trader.core.cycle import CycleError, CycleManager
from trader.core.ledger import compute_ledger
from trader.core.models import OrderRequest, Side
from trader.database.db import Database
from trader.risk.kill_switch import KillReason


def kill_reason(system):
    return system.kill.status().get("reason")


def test_happy_path_opens_protected_position(broker, clock):
    system = default_system(broker, clock)
    assert system.startup() == "SESSION_000001"
    res = system.tick()
    assert res.outcome == "EVALUATED" and any("BUY" in d for d in res.details), res.details
    assert "XYZ" in broker.positions
    stop = broker.get_order(f"SESSION_000001-D{1:08d}-sl")
    assert stop is not None and stop.status.is_open
    row = system.db.one("SELECT * FROM risk_decisions")
    assert row["approved"] == 1
    assert system.db.one("SELECT COUNT(*) n FROM audit_logs WHERE event = 'ORDER_SENT'")["n"] == 1
    assert not system.kill.engaged


def test_no_data_means_no_trade(broker, clock):
    from helpers import build_system
    system = build_system(Database(), broker, clock, {})
    system.startup()
    assert system.tick().outcome == "NO_TRADE"
    assert not broker.orders


def test_market_closed_waits(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    clock.set(ny(2025, 3, 4, 18, 0))
    assert system.tick().outcome == "WAIT"


def test_broker_outage_trips_and_fails_closed(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    broker.inject_failure("get_account", BrokerError("503"))
    assert system.tick().outcome == "NO_TRADE"
    assert kill_reason(system) == KillReason.BROKER_CONNECTION.value
    assert system.tick().outcome == "KILL_SWITCH"
    assert not broker.orders


def test_llm_invalid_json_three_times_trips(broker, clock):
    system = default_system(broker, clock, llm=lambda prompt: "Sure! I think you should buy XYZ")
    system.startup()
    for _ in range(3):
        system.tick()
        clock.advance(minutes=1)
    assert kill_reason(system) == KillReason.AGENT_MALFUNCTION.value
    assert not broker.orders


def test_llm_inventing_a_source_is_hallucination(broker, clock):
    def llm(prompt):
        p = json.loads(prompt)
        ask = Decimal(p["quote"]["ask"])
        return json.dumps({
            "action": "BUY", "symbol": "XYZ", "direction": "LONG", "entry": str(ask), "stop_loss": str(ask - 1),
            "take_profit": str(ask + 3), "position_size": "2", "risk_amount": "2", "expected_reward": "6",
            "confidence": 0.9, "time_horizon": "days", "reason": "insider tip",
            "data_sources": ["https://made-up-news.example/xyz-merger"], "timestamp": p["now"]})
    system = default_system(broker, clock, llm=llm)
    system.startup()
    system.tick()
    assert kill_reason(system) == KillReason.MODEL_HALLUCINATION.value
    assert not broker.orders


def test_cycle_target_closes_everything_and_restarts_at_100(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    system.tick()
    assert "XYZ" in broker.positions
    broker.set_price("XYZ", "600")  # equity now far above $1,000
    clock.advance(minutes=5)
    r1 = system.tick()
    assert r1.outcome == "COMPLETING" and not broker.positions
    clock.advance(minutes=1)
    r2 = system.tick()
    assert r2.outcome == "CYCLE_COMPLETED", r2.details
    hist = system.cycles.history()
    assert hist[0]["status"] == "COMPLETED" and Decimal(hist[0]["final_equity"]) >= 1000
    assert hist[1]["status"] == "ACTIVE" and hist[1]["allocated_capital"] == "100"
    ledger = compute_ledger(system.db, hist[1]["session_id"], Decimal("100"))
    assert ledger.cash == Decimal("100")  # winnings stay outside the new cycle
    assert broker.cash > 1000
    assert system.db.one("SELECT COUNT(*) n FROM audit_logs WHERE event = 'AUDIT_RECORD'")["n"] == 1


def test_failed_cycle_needs_operator_and_no_recharge(clock):
    from trader.audit.audit_log import AuditLog
    db = Database()
    cm = CycleManager(db, AuditLog(db, clock), Decimal("100"), Decimal("1000"))
    s = cm.start_new(Decimal("100"))
    assert cm.evaluate(s, Decimal("0")).value == "FAILED"
    with pytest.raises(CycleError):
        cm.start_new(Decimal("100"))
    with pytest.raises(CycleError, match="no auto-recharge"):
        cm.start_new(Decimal("40"), operator="gon")
    assert cm.start_new(Decimal("100"), operator="gon") == "SESSION_000002"


def test_restart_recovery_reconciles(tmp_path, broker, clock):
    path = str(tmp_path / "t.db")
    s1 = default_system(broker, clock, db=Database(path))
    s1.startup()
    s1.tick()
    s1.db.close()
    s2 = default_system(broker, clock, db=Database(path))  # new process, same broker account
    assert s2.startup() == "SESSION_000001"
    assert not s2.kill.engaged
    assert s2.db.one("SELECT COUNT(*) n FROM audit_logs WHERE event = 'RECONCILED'")["n"] == 1


def test_restart_resolves_order_sent_before_crash(tmp_path, broker, clock):
    path = str(tmp_path / "t.db")
    s1 = default_system(broker, clock, db=Database(path))
    s1.startup()
    # Simulate a crash between the broker accepting an order and us recording the result.
    now = clock().isoformat()
    s1.db.execute("INSERT INTO orders(client_order_id, session_id, symbol, side, order_type, qty, status, "
                  "created_at, updated_at) VALUES ('SESSION_000001-D00000099','SESSION_000001','XYZ','BUY',"
                  "'MARKET','1','PENDING_SUBMIT',?,?)", (now, now))
    broker.submit_order(OrderRequest("SESSION_000001-D00000099", "SESSION_000001", "XYZ", Side.BUY, Decimal("1")))
    s2 = default_system(broker, clock, db=Database(path))
    s2.startup()
    row = s2.db.one("SELECT status FROM orders WHERE client_order_id = 'SESSION_000001-D00000099'")
    assert row["status"] == "FILLED" and not s2.kill.engaged


def test_foreign_position_trips_isolation(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    broker.submit_order(OrderRequest("MANUAL-1", "", "XYZ", Side.BUY, Decimal("1")))  # someone else trades
    assert system.tick().outcome == "NO_TRADE"
    assert kill_reason(system) == KillReason.UNEXPECTED_POSITION.value


def test_missing_stop_is_detected_and_position_closed(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    system.tick()
    sl = f"SESSION_000001-D{1:08d}-sl"
    broker.cancel_order(sl)  # stop vanished at the broker
    clock.advance(minutes=1)
    system.tick()
    assert kill_reason(system) == KillReason.UNPROTECTED_POSITION.value
    assert not broker.positions


def test_kill_switch_survives_restart_and_needs_human(tmp_path, broker, clock):
    path = str(tmp_path / "t.db")
    s1 = default_system(broker, clock, db=Database(path))
    s1.startup()
    s1.kill.trip(KillReason.MANUAL, "drill")
    s2 = default_system(broker, clock, db=Database(path))
    s2.startup()
    assert s2.tick().outcome == "KILL_SWITCH"
    with pytest.raises(ValueError):
        s2.kill.reset("", "")
    s2.kill.reset("gon", "drill over")
    assert not s2.kill.engaged


def test_ledger_only_counts_own_session(broker, clock):
    system = default_system(broker, clock)
    system.startup()
    assert compute_ledger(system.db, "SESSION_000001", Decimal("100")).cash == Decimal("100")
    assert ACCOUNT == broker.account_id
