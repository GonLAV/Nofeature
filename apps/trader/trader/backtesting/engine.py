"""Event-driven backtester that runs the *production* TradingSystem.

Same agents, same Risk Engine, same Execution Engine — only the clock, the
broker (PaperBroker) and the data provider are simulated. Per trading day:

  09:35 NY  quotes = day's open; the system decides using bars strictly before
            today (no look-ahead) and market orders fill at the open + slippage.
  15:58 NY  the day's bar is replayed: stops/targets trigger on its range
            (stop assumed first if both hit), positions marked at close, then a
            management-only tick (cycle checks, liquidation, protection).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from decimal import Decimal
from statistics import mean, pstdev

from trader.agents.analysis import StrategyParams
from trader.broker.market_hours import NY
from trader.broker.paper import FeeModel, PaperBroker
from trader.config.settings import CYCLE_ALLOCATION, CYCLE_TARGET
from trader.core.clock import SimClock
from trader.core.orchestrator import TradingSystem
from trader.data.historical import InMemoryBarsProvider
from trader.database.db import Database
from trader.risk.profiles import RiskProfile

ACCOUNT = "BACKTEST-000001"


@dataclass
class BacktestReport:
    start: date
    end: date
    params: StrategyParams
    equity_curve: list  # (date, total account equity)
    trades: list  # dicts from the trades table
    cycles: list
    metrics: dict = field(default_factory=dict)


def _day_ts(d: date, t: time) -> datetime:
    return datetime.combine(d, t, NY).astimezone(timezone.utc)


def run_backtest(bars_by_symbol: dict, universe: tuple, benchmark: str, profile: RiskProfile, *,
                 start: date, end: date, params: StrategyParams = StrategyParams(),
                 fee_model: FeeModel = FeeModel(), slippage_bps: Decimal = Decimal("5"),
                 spread_bps: Decimal = Decimal("4"), db_path: str = ":memory:") -> BacktestReport:
    provider = InMemoryBarsProvider(bars_by_symbol, name="backtest")
    by_day = {s: {b.ts.astimezone(NY).date(): b for b in bars} for s, bars in bars_by_symbol.items()}
    days = sorted({d for m in by_day.values() for d in m if start <= d < end})
    if not days:
        raise ValueError("no bars in the requested window")
    clock = SimClock(_day_ts(days[0], time(9, 0)))
    db = Database(db_path)
    broker = PaperBroker(ACCOUNT, CYCLE_ALLOCATION, clock, fee_model=fee_model, slippage_bps=slippage_bps,
                         spread_bps=spread_bps)
    system = TradingSystem(db=db, broker=broker, market_data=provider, clock=clock, profile=profile,
                           expected_account_id=ACCOUNT, universe=universe, benchmark=benchmark,
                           allocation=CYCLE_ALLOCATION, target=CYCLE_TARGET, params=params)
    system.startup()
    curve = []
    for d in days:
        clock.set(_day_ts(d, time(9, 35)))
        for sym, m in by_day.items():
            if d in m:
                broker.set_price(sym, m[d].open, _adv(provider, sym, clock()))
        broker.process()
        system.tick()
        clock.set(_day_ts(d, time(15, 58)))
        for sym, m in by_day.items():
            if d in m:
                broker.on_bar(m[d], _adv(provider, sym, clock()))
        system.manage_only()
        curve.append((d, broker.get_account().equity))
        if system.kill.engaged:
            system.audit.record("backtest", "KILL_SWITCH_STOPPED_RUN", reason=system.kill.status())
            break
    trades = [dict(r) for r in db.query("SELECT * FROM trades ORDER BY id")]
    report = BacktestReport(days[0], days[-1], params, curve, trades, system.cycles.history())
    report.metrics = compute_metrics(curve, trades, CYCLE_ALLOCATION)
    report.metrics["kill_switch"] = system.kill.status()
    db.close()
    return report


def _adv(provider: InMemoryBarsProvider, sym: str, as_of: datetime) -> float:
    try:
        bars = provider.get_bars(sym, as_of, 20)
    except Exception:
        return 0.0
    return mean(b.volume for b in bars)


def compute_metrics(curve: list, trades: list, starting: Decimal) -> dict:
    eq = [float(e) for _, e in curve]
    closed = [t for t in trades if t["realized_pnl"] is not None]
    pnls = [float(t["realized_pnl"]) for t in closed]
    wins, losses = [p for p in pnls if p > 0], [p for p in pnls if p <= 0]
    rets = [b / a - 1 for a, b in zip([float(starting)] + eq[:-1], eq) if a > 0]
    years = max(len(eq) / 252, 1 / 252)
    final = eq[-1] if eq else float(starting)
    peak, mdd = float(starting), 0.0
    for e in eq:
        peak = max(peak, e)
        mdd = max(mdd, (peak - e) / peak if peak > 0 else 0)
    downside = [r for r in rets if r < 0]
    sd = pstdev(rets) if len(rets) > 1 else 0.0
    dsd = math.sqrt(mean([r * r for r in downside])) if downside else 0.0
    gross_win, gross_loss = sum(wins), -sum(losses)
    return {
        "starting_equity": float(starting), "final_equity": round(final, 2),
        "total_return": round(final / float(starting) - 1, 4),
        "cagr": round((final / float(starting)) ** (1 / years) - 1, 4) if final > 0 else -1.0,
        "trades": len(closed), "open_trades": len(trades) - len(closed),
        "win_rate": round(len(wins) / len(pnls), 4) if pnls else 0.0,
        "loss_rate": round(len(losses) / len(pnls), 4) if pnls else 0.0,
        "profit_factor": round(gross_win / gross_loss, 3) if gross_loss > 0 else (float("inf") if gross_win else 0.0),
        "avg_win": round(mean(wins), 2) if wins else 0.0,
        "avg_loss": round(mean(losses), 2) if losses else 0.0,
        "expectancy": round(mean(pnls), 3) if pnls else 0.0,
        "sharpe": round(mean(rets) / sd * math.sqrt(252), 3) if sd > 0 else 0.0,
        "sortino": round(mean(rets) / dsd * math.sqrt(252), 3) if dsd > 0 else 0.0,
        "max_drawdown": round(mdd, 4),
        "fees": round(sum(float(t["fees"]) for t in closed), 2),
    }
