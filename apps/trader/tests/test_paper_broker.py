from decimal import Decimal

import pytest

from conftest import ACCOUNT, ny
from trader.broker.base import BrokerRejected, BrokerTimeout
from trader.broker.paper import FeeModel, PaperBroker
from trader.core.models import Bar, OrderRequest, OrderStatus, Side


def buy(cid, q, **kw):
    return OrderRequest(cid, "S", "XYZ", Side.BUY, Decimal(q), **kw)


def test_buy_then_sell_with_fees_and_slippage(clock):
    b = PaperBroker(ACCOUNT, Decimal("100"), clock, slippage_bps=Decimal("10"), spread_bps=Decimal("0"))
    b.set_price("XYZ", "20", 2e6)
    o = b.submit_order(buy("B1", "2"))
    assert o.status is OrderStatus.FILLED and o.filled_avg_price == Decimal("20.02")
    assert b.cash == Decimal("59.96")
    s = b.submit_order(OrderRequest("S1", "S", "XYZ", Side.SELL, Decimal("2")))
    assert s.filled_avg_price == Decimal("19.98") and s.fees == Decimal("0.01")  # regulatory fees round up
    assert b.cash == Decimal("99.91") and not b.positions


def test_no_margin_no_short_no_duplicate(broker):
    assert broker.submit_order(buy("B1", "6")).reject_reason == "insufficient buying power"
    r = broker.submit_order(OrderRequest("S1", "S", "XYZ", Side.SELL, Decimal("1")))
    assert r.status is OrderStatus.REJECTED and "short" in r.reject_reason
    broker.submit_order(buy("B2", "1"))
    with pytest.raises(BrokerRejected):
        broker.submit_order(buy("B2", "1"))


def test_market_closed_rejects(broker, clock):
    clock.set(ny(2025, 3, 4, 17, 0))
    assert broker.submit_order(buy("B1", "1")).reject_reason == "market closed"


def test_fractional_bracket_rejected_whole_bracket_ok(broker):
    r = broker.submit_order(buy("B1", "1.5", stop_loss=Decimal("19"), take_profit=Decimal("23")))
    assert r.reject_reason == "fractional bracket orders not supported"
    ok = broker.submit_order(buy("B2", "2", stop_loss=Decimal("19"), take_profit=Decimal("23")))
    assert ok.status is OrderStatus.FILLED
    assert broker.get_order("B2-sl").status is OrderStatus.ACCEPTED
    assert broker.get_order("B2-tp").qty == Decimal("2")


def test_partial_fills_progress_and_children_track_filled_qty(clock):
    b = PaperBroker(ACCOUNT, Decimal("100"), clock, slippage_bps=Decimal("0"), spread_bps=Decimal("0"),
                    max_fill_qty_per_step=Decimal("1"))
    b.set_price("XYZ", "20", 2e6)
    o = b.submit_order(buy("B1", "3", stop_loss=Decimal("19"), take_profit=Decimal("23")))
    assert o.status is OrderStatus.PARTIALLY_FILLED and o.filled_qty == 1
    assert b.get_order("B1-sl").qty == 1
    b.process()
    b.process()
    assert b.get_order("B1").status is OrderStatus.FILLED and b.get_order("B1-sl").qty == 3


def test_gap_through_stop_fills_at_open_and_cancels_target(broker, clock):
    broker.submit_order(buy("B1", "2", stop_loss=Decimal("19"), take_profit=Decimal("23")))
    broker.on_bar(Bar("XYZ", clock(), 17.5, 18.0, 17.0, 17.8, 1e6))
    sl, tp = broker.get_order("B1-sl"), broker.get_order("B1-tp")
    assert sl.status is OrderStatus.FILLED and sl.filled_avg_price == Decimal("17.50")
    assert tp.status is OrderStatus.CANCELED and not broker.positions


def test_bar_spanning_stop_and_target_assumes_stop(broker, clock):
    broker.submit_order(buy("B1", "2", stop_loss=Decimal("19"), take_profit=Decimal("23")))
    broker.on_bar(Bar("XYZ", clock(), 20, 24, 18.5, 21, 1e6))
    assert broker.get_order("B1-sl").status is OrderStatus.FILLED
    assert broker.get_order("B1-tp").status is OrderStatus.CANCELED


def test_lost_response_injection(broker):
    broker.inject_failure("submit_order", BrokerTimeout("lost"), after_effect=True)
    with pytest.raises(BrokerTimeout):
        broker.submit_order(buy("B1", "1"))
    assert broker.get_order("B1").status is OrderStatus.FILLED  # it DID happen


def test_fee_model_taf_cap():
    f = FeeModel()
    assert f.fees(Side.BUY, Decimal("100"), Decimal("10")) == 0
    assert f.fees(Side.SELL, Decimal("1000000"), Decimal("1")) >= Decimal("8.30")
