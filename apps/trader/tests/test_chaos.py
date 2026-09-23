"""Chaos: random broker faults across a long paper run. Invariants must hold on every step."""
import random
from datetime import date, datetime, time, timezone
from decimal import Decimal

import pytest

from conftest import ACCOUNT
from helpers import build_system
from trader.broker.base import BrokerError, BrokerTimeout
from trader.broker.market_hours import NY
from trader.broker.paper import PaperBroker
from trader.core.clock import SimClock
from trader.core.ledger import compute_ledger
from trader.data.historical import synthetic_daily_bars
from trader.database.db import Database

METHODS = ["get_account", "get_positions", "get_orders", "get_order", "get_quote", "submit_order",
           "get_market_status", "cancel_order"]


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_invariants_under_random_faults(seed):
    rng = random.Random(seed)
    start = datetime(2023, 1, 2, tzinfo=timezone.utc)
    syms = ["AAA", "BBB", "CCC", "SPY"]
    bars = {s: synthetic_daily_bars(s, start, 320, price=p, seed=seed, vol=0.03)
            for s, p in zip(syms, [15, 30, 8, 400])}
    by_day = {s: {b.ts.astimezone(NY).date(): b for b in bs} for s, bs in bars.items()}
    days = sorted(d for d in by_day["SPY"] if d >= date(2023, 6, 1))
    clock = SimClock(datetime.combine(days[0], time(9, 0), NY).astimezone(timezone.utc))
    broker = PaperBroker(ACCOUNT, Decimal("100"), clock, reject_probability=0.05, seed=seed)
    db = Database()
    system = build_system(db, broker, clock, bars, universe=("AAA", "BBB", "CCC"))
    system.startup()

    for d in days:
        clock.set(datetime.combine(d, time(9, 35), NY).astimezone(timezone.utc))
        for s in syms:
            broker.set_price(s, by_day[s][d].open, 2_000_000)
        if rng.random() < 0.15:
            exc = rng.choice([BrokerError("5xx"), BrokerTimeout("timeout")])
            broker.inject_failure(rng.choice(METHODS), exc, after_effect=rng.random() < 0.5)
        try:
            system.tick()
        except BrokerError:
            pass  # a fault outside the guarded path is acceptable; state must still be sound
        clock.set(datetime.combine(d, time(15, 58), NY).astimezone(timezone.utc))
        for s in syms:
            broker.on_bar(by_day[s][d], 2_000_000)
        broker._failures.clear()
        system.manage_only()
        if system.kill.engaged:  # a human would investigate; the drill resets and keeps going
            system.kill.reset("chaos-test", "drill")

        # --- invariants ---
        entries = [o for o in broker.get_orders() if o.parent_client_order_id is None]
        assert len({o.client_order_id for o in entries}) == len(entries)
        cur = system.cycles.current() or system.cycles.last()
        ledger = compute_ledger(db, cur["session_id"], Decimal("100"))
        assert ledger.cash >= Decimal("-0.01")
        assert ledger.cash <= broker.cash
        assert broker.cash >= 0  # never margin
        assert all(p.qty > 0 for p in broker.positions.values())  # never short
        for sym in ledger.positions:
            assert sym in broker.positions
