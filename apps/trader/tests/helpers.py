from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from conftest import ACCOUNT
from trader.broker.market_hours import NY
from trader.core.models import Bar
from trader.core.orchestrator import TradingSystem
from trader.data.historical import InMemoryBarsProvider
from trader.database.db import Database
from trader.risk.profiles import RiskProfileName, get_profile


def trending_bars(symbol: str, end: datetime, n: int = 90, start_px: float = 10.0, breakout: bool = True) -> list:
    """Deterministic zig-zag uptrend (RSI ~60s) ending with a high-volume breakout the day before `end`."""
    days, d = [], end.astimezone(NY).date() - timedelta(days=1)
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    days.reverse()
    bars, px = [], start_px
    for i, day in enumerate(days):
        step = 0.25 if i % 2 == 0 else -0.12
        vol = 1_000_000 + (i % 5) * 50_000
        if breakout and i == n - 1:
            step, vol = 0.9, 4_000_000
        o = px
        c = px + step
        ts = datetime.combine(day, time(16, 0), NY).astimezone(timezone.utc)
        bars.append(Bar(symbol, ts, round(o, 2), round(max(o, c) + 0.05, 2), round(min(o, c) - 0.05, 2),
                        round(c, 2), vol))
        px = c
    return bars


def build_system(db, broker, clock, bars_by_symbol, universe=("XYZ",), benchmark="SPY", llm=None,
                 profile=RiskProfileName.AGGRESSIVE):
    return TradingSystem(db=db, broker=broker, market_data=InMemoryBarsProvider(bars_by_symbol), clock=clock,
                         profile=get_profile(profile), expected_account_id=ACCOUNT, universe=universe,
                         benchmark=benchmark, allocation=Decimal("100"), target=Decimal("1000"), llm=llm)


def default_system(broker, clock, db=None, llm=None, universe=("XYZ",)):
    bars = {"XYZ": trending_bars("XYZ", clock()), "SPY": trending_bars("SPY", clock(), start_px=400, breakout=False)}
    last = bars["XYZ"][-1].close
    broker.set_price("XYZ", str(round(last + 0.02, 2)), 2_000_000)
    return build_system(db or Database(), broker, clock, bars, universe=universe, llm=llm)
