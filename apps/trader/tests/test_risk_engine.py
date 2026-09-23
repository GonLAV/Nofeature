from dataclasses import replace
from datetime import timedelta
from decimal import Decimal

import pytest

from conftest import ACCOUNT, held, make_ctx, make_decision
from trader.broker.paper import DEFAULT_CAPS
from trader.core.ledger import LedgerSnapshot
from trader.core.models import Account, Action, CycleStatus, MarketStatus, Quote, Side
from trader.risk.engine import RiskEngine
from trader.risk.kill_switch import KillReason
from trader.security.approval import ApprovalSigner


@pytest.fixture
def engine():
    return RiskEngine(ApprovalSigner())


def failed(res):
    return {c[0] for c in res.failed}


def test_baseline_approved_and_sized_within_limits(engine, clock):
    now = clock()
    res = engine.evaluate(make_decision(now), make_ctx(now), "C1")
    assert res.approved, res.failed
    req = res.approval.request
    assert req.side is Side.BUY and req.stop_loss == Decimal("19.00")
    # AGGRESSIVE: 5% risk of $100 over a ~$1.04 stop -> 4 shares; 60% position cap -> 2.99 -> 2 whole shares
    assert req.qty == Decimal("2")
    assert req.qty * Decimal("20.04") <= Decimal("100")


@pytest.mark.parametrize("override,check", [
    ({"kill_switch_engaged": True}, "kill_switch_clear"),
    ({"cycle_status": CycleStatus.COMPLETING}, "cycle_accepts_entries"),
    ({"session_id": "SESSION_000009"}, "session_matches_cycle"),
    ({"market": "closed"}, "market_open"),
    ({"quote": "stale"}, "quote_fresh"),
    ({"quote": "wide"}, "spread"),
    ({"quote": "illiquid"}, "liquidity"),
    ({"open_order_symbols": frozenset({"XYZ"})}, "no_duplicate_open_order"),
    ({"entries_today": 8}, "trade_frequency"),
    ({"cycle_max_lifetime": Decimal("200")}, "allocation_immutable"),
    ({"capabilities": replace(DEFAULT_CAPS, isolated_account=False)}, "broker_isolation_capability"),
])
def test_each_guard_rejects(engine, clock, override, check):
    now = clock()
    if override.get("market") == "closed":
        override["market"] = MarketStatus(False, now)
    q = override.get("quote")
    if q == "stale":
        override["quote"] = Quote("XYZ", Decimal("19.99"), Decimal("20"), Decimal("20"), now - timedelta(minutes=10),
                                  2e6)
    elif q == "wide":
        override["quote"] = Quote("XYZ", Decimal("19.50"), Decimal("20"), Decimal("20"), now, 2e6)
    elif q == "illiquid":
        override["quote"] = Quote("XYZ", Decimal("19.99"), Decimal("20"), Decimal("20"), now, 1000)
    res = engine.evaluate(make_decision(now), make_ctx(now, **override), "C1")
    assert not res.approved and check in failed(res)


def test_existing_position_and_max_positions(engine, clock):
    now = clock()
    ledger = LedgerSnapshot("SESSION_000001", Decimal("100"), Decimal("60"), Decimal("0"),
                            {"XYZ": held(), "AAA": held("AAA"), "BBB": held("BBB")})
    marks = {"XYZ": Decimal("20"), "AAA": Decimal("20"), "BBB": Decimal("20")}
    res = engine.evaluate(make_decision(now), make_ctx(now, ledger=ledger, marks=marks), "C1")
    assert {"no_existing_position", "max_open_positions"} <= failed(res)


def test_capital_boundary_ignores_cash_outside_cycle(engine, clock):
    """Broker holds $10,000 (e.g. earlier cycles' winnings) but the cycle only owns $30."""
    now = clock()
    ledger = LedgerSnapshot("SESSION_000002", Decimal("100"), Decimal("30"), Decimal("0"), {})
    rich = Account(ACCOUNT, Decimal("10000"), Decimal("10000"), Decimal("10000"), False)
    q = Quote("XYZ", Decimal("4.999"), Decimal("5.00"), Decimal("5.00"), now, 2e6)
    ctx = make_ctx(now, ledger=ledger, account=rich, session_id="SESSION_000002", cycle_session_id="SESSION_000002",
                   start_of_day_equity=Decimal("30"), quote=q)
    d = make_decision(now, entry=Decimal("5"), stop_loss=Decimal("4.80"), take_profit=Decimal("5.60"),
                      position_size=Decimal("2000"))
    res = engine.evaluate(d, ctx, "C1")
    assert res.approved, res.failed
    assert 0 < res.approval.request.qty * Decimal("5.01") <= Decimal("30")


def test_ledger_cash_not_backed_by_broker_trips(engine, clock):
    now = clock()
    poor = Account(ACCOUNT, Decimal("50"), Decimal("50"), Decimal("50"), False)
    res = engine.evaluate(make_decision(now), make_ctx(now, account=poor), "C1")
    assert not res.approved and res.trip[0] is KillReason.UNEXPECTED_BALANCE


def test_wrong_account_trips_security(engine, clock):
    now = clock()
    other = Account("SOMEONE-ELSE", Decimal("100"), Decimal("100"), Decimal("100"), False)
    res = engine.evaluate(make_decision(now), make_ctx(now, account=other), "C1")
    assert not res.approved and res.trip[0] is KillReason.SECURITY_ANOMALY


def test_hallucinated_entry_price_trips(engine, clock):
    now = clock()
    d = make_decision(now, entry=Decimal("35"), stop_loss=Decimal("30"), take_profit=Decimal("45"))
    res = engine.evaluate(d, make_ctx(now), "C1")
    assert not res.approved and res.trip[0] is KillReason.MODEL_HALLUCINATION


def test_daily_loss_limit_trips(engine, clock):
    now = clock()
    ledger = LedgerSnapshot("SESSION_000001", Decimal("100"), Decimal("85"), Decimal("0"), {})
    res = engine.evaluate(make_decision(now), make_ctx(now, ledger=ledger, account=Account(
        ACCOUNT, Decimal("85"), Decimal("85"), Decimal("85"), False)), "C1")
    assert not res.approved and res.trip[0] is KillReason.DAILY_LOSS_LIMIT


def test_poor_reward_risk_and_wide_stop_rejected(engine, clock):
    now = clock()
    res = engine.evaluate(make_decision(now, take_profit=Decimal("20.50")), make_ctx(now), "C1")
    assert "reward_risk" in failed(res)
    res = engine.evaluate(make_decision(now, stop_loss=Decimal("10"), take_profit=Decimal("40")), make_ctx(now), "C2")
    assert "stop_distance" in failed(res)


def test_unaffordable_whole_share_rejected(engine, clock):
    """$100 cannot buy one protected share of a $500 stock (fractional brackets unsupported)."""
    now = clock()
    q = Quote("XYZ", Decimal("499.9"), Decimal("500"), Decimal("500"), now, 2e6)
    d = make_decision(now, entry=Decimal("500"), stop_loss=Decimal("480"), take_profit=Decimal("560"))
    res = engine.evaluate(d, make_ctx(now, quote=q), "C1")
    assert not res.approved and "sizing" in failed(res)


def test_fractional_allowed_when_broker_protects_fractional(engine, clock):
    now = clock()
    caps = replace(DEFAULT_CAPS, supports_fractional_bracket=True)
    q = Quote("XYZ", Decimal("499.9"), Decimal("500"), Decimal("500"), now, 2e6)
    d = make_decision(now, entry=Decimal("500"), stop_loss=Decimal("480"), take_profit=Decimal("560"))
    res = engine.evaluate(d, make_ctx(now, quote=q, capabilities=caps), "C1")
    assert res.approved and res.approval.request.qty < 1


def test_no_protection_no_trade(engine, clock):
    now = clock()
    caps = replace(DEFAULT_CAPS, supports_bracket_orders=False)
    res = engine.evaluate(make_decision(now), make_ctx(now, capabilities=caps), "C1")
    assert not res.approved and "stop_protection_available" in failed(res)


def test_exit_allowed_while_kill_switch_engaged(engine, clock):
    now = clock()
    ledger = LedgerSnapshot("SESSION_000001", Decimal("100"), Decimal("60"), Decimal("0"), {"XYZ": held()})
    d = make_decision(now, action=Action.CLOSE, direction="FLAT")
    res = engine.evaluate(d, make_ctx(now, ledger=ledger, marks={"XYZ": Decimal("20")}, kill_switch_engaged=True), "X")
    assert res.approved and res.approval.request.reduce_only and res.approval.request.qty == Decimal("2")


def test_exit_without_position_rejected(engine, clock):
    now = clock()
    res = engine.evaluate(make_decision(now, action=Action.SELL, direction="FLAT"), make_ctx(now), "X")
    assert not res.approved and "position_exists_in_cycle" in failed(res)


def test_non_order_actions_never_approved(engine, clock):
    now = clock()
    for a in (Action.HOLD, Action.NO_TRADE, Action.WAIT):
        assert not engine.evaluate(make_decision(now, action=a), make_ctx(now), "X").approved


def test_internal_error_fails_closed(engine, clock):
    now = clock()
    ledger = LedgerSnapshot("SESSION_000001", Decimal("100"), Decimal("60"), Decimal("0"), {"AAA": held("AAA")})
    res = engine.evaluate(make_decision(now), make_ctx(now, ledger=ledger, marks={}), "C1")  # no mark -> KeyError
    assert not res.approved and "risk_engine_error" in failed(res)
