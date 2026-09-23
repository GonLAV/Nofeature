"""Walk-forward validation.

Parameters are chosen on each training window only, then evaluated on the
following unseen test window. Only test-window results are reported as
out-of-sample; in-sample scores are kept separately and labelled as such.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from itertools import product

from trader.agents.analysis import StrategyParams
from trader.backtesting.engine import BacktestReport, compute_metrics, run_backtest
from trader.config.settings import CYCLE_ALLOCATION
from trader.risk.profiles import RiskProfile


@dataclass
class WindowResult:
    train: tuple
    test: tuple
    chosen: StrategyParams
    in_sample: dict
    out_of_sample: dict


def param_grid(**axes) -> list:
    keys = sorted(axes)
    return [StrategyParams(**dict(zip(keys, combo))) for combo in product(*(axes[k] for k in keys))]


def _score(m: dict) -> float:
    # Needs enough trades to mean anything; otherwise prefer doing nothing.
    return m["expectancy"] * min(m["trades"], 10) if m["trades"] >= 3 else float("-inf")


def walk_forward(bars_by_symbol: dict, universe: tuple, benchmark: str, profile: RiskProfile, trading_days: list,
                 grid: list, train_days: int, test_days: int) -> dict:
    windows, oos_trades = [], []
    i = 0
    while i + train_days + test_days <= len(trading_days):
        tr = (trading_days[i], trading_days[i + train_days])
        te_end = trading_days[i + train_days + test_days] if i + train_days + test_days < len(trading_days) \
            else date.max
        te = (trading_days[i + train_days], te_end)
        scored = []
        for p in grid:
            rep = run_backtest(bars_by_symbol, universe, benchmark, profile, start=tr[0], end=tr[1], params=p)
            scored.append((_score(rep.metrics), rep))
        best_score, best = max(scored, key=lambda s: s[0])
        test: BacktestReport = run_backtest(bars_by_symbol, universe, benchmark, profile, start=te[0], end=te[1],
                                            params=best.params)
        windows.append(WindowResult(tr, te, best.params, best.metrics, test.metrics))
        oos_trades += test.trades
        i += test_days
    # Each test window is an independent $100 run, so equity curves are not chained;
    # pooled out-of-sample statistics are trade-level only.
    pooled = compute_metrics([], oos_trades, CYCLE_ALLOCATION)
    trade_keys = ("trades", "win_rate", "loss_rate", "profit_factor", "avg_win", "avg_loss", "expectancy", "fees")
    return {
        "windows": windows,
        "out_of_sample_trade_metrics": {k: pooled[k] for k in trade_keys},
        "out_of_sample_window_returns": [w.out_of_sample["total_return"] for w in windows],
    }
