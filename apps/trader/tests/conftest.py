import sys
from dataclasses import replace
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from trader.broker.market_hours import NY  # noqa: E402
from trader.broker.paper import DEFAULT_CAPS, PaperBroker  # noqa: E402
from trader.core.clock import SimClock  # noqa: E402
from trader.core.ledger import LedgerPosition, LedgerSnapshot  # noqa: E402
from trader.core.models import (  # noqa: E402
    Account, Action, CycleStatus, Decision, MarketStatus, Quote,
)
from trader.risk.engine import RiskContext  # noqa: E402
from trader.risk.profiles import RiskProfileName, get_profile  # noqa: E402

ACCOUNT = "PAPER-TEST-1"


def ny(y, m, d, h=10, mi=0):
    return datetime.combine(datetime(y, m, d).date(), time(h, mi), NY).astimezone(timezone.utc)


@pytest.fixture
def clock():
    return SimClock(ny(2025, 3, 4, 10, 0))  # a Tuesday, market open


@pytest.fixture
def broker(clock):
    b = PaperBroker(ACCOUNT, Decimal("100"), clock, slippage_bps=Decimal("0"), spread_bps=Decimal("0"))
    b.set_price("XYZ", "20.00", avg_daily_volume=2_000_000)
    return b


def make_decision(now, **kw):
    base = dict(action=Action.BUY, symbol="XYZ", direction="LONG", entry=Decimal("20.00"),
                stop_loss=Decimal("19.00"), take_profit=Decimal("23.00"), position_size=Decimal("100"),
                risk_amount=Decimal("1"), expected_reward=Decimal("3"), confidence=0.8, time_horizon="days",
                reason="test", data_sources=("memory",), timestamp=now)
    base.update(kw)
    return Decision(**base)


def make_ctx(now, **kw):
    ledger = kw.pop("ledger", LedgerSnapshot("SESSION_000001", Decimal("100"), Decimal("100"), Decimal("0"), {}))
    base = dict(
        now=now, session_id="SESSION_000001", cycle_session_id="SESSION_000001", cycle_status=CycleStatus.ACTIVE,
        cycle_allocated=Decimal("100"), cycle_max_lifetime=Decimal("100"), ledger=ledger, marks={},
        start_of_day_equity=Decimal("100"), entries_today=0, open_order_symbols=frozenset(),
        expected_account_id=ACCOUNT,
        account=Account(ACCOUNT, Decimal("100"), Decimal("100"), Decimal("100"), False),
        capabilities=DEFAULT_CAPS, market=MarketStatus(True, now),
        quote=Quote("XYZ", Decimal("19.99"), Decimal("20.00"), Decimal("20.00"), now, 2_000_000),
        profile=get_profile(RiskProfileName.AGGRESSIVE), kill_switch_engaged=False,
    )
    base.update(kw)
    return RiskContext(**base)


def held(symbol="XYZ", q="2", cost="20"):
    return LedgerPosition(symbol, Decimal(q), Decimal(cost))


__all__ = ["ny", "make_decision", "make_ctx", "held", "ACCOUNT", "replace", "timedelta"]
