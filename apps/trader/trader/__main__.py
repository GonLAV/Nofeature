"""Command line entry point.

  python -m trader backtest --synthetic                 # or --csv-dir data/
  python -m trader walk-forward --synthetic
  python -m trader paper-replay --synthetic             # persisted run the dashboard can show
  python -m trader status
  python -m trader dashboard
  python -m trader kill --reason "investigating"
  python -m trader reset --operator gon --note "reviewed logs"
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import date, datetime, timezone

from trader.agents.analysis import StrategyParams
from trader.audit.audit_log import AuditLog
from trader.backtesting.engine import run_backtest
from trader.backtesting.walk_forward import param_grid, walk_forward
from trader.config.settings import ConfigError, load_settings
from trader.data.historical import load_csv, synthetic_daily_bars
from trader.database.db import Database
from trader.risk.kill_switch import KillReason, KillSwitch
from trader.risk.profiles import get_profile

SYNTHETIC_NOTE = "SYNTHETIC DATA: results say nothing about real markets."


def _bars(args, universe, benchmark):
    symbols = list(universe) + [benchmark]
    if args.csv_dir:
        return {s: load_csv(os.path.join(args.csv_dir, f"{s}.csv"), s) for s in symbols}
    start = datetime(2021, 1, 4, tzinfo=timezone.utc)
    prices = [18, 42, 9, 27, 65, 400]
    return {s: synthetic_daily_bars(s, start, 1000, price=prices[i % len(prices)], seed=args.seed)
            for i, s in enumerate(symbols)}


def main(argv=None) -> int:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "WARNING"), format="%(message)s")
    ap = argparse.ArgumentParser(prog="trader")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("backtest", "walk-forward", "paper-replay"):
        p = sub.add_parser(name)
        src = p.add_mutually_exclusive_group(required=True)
        src.add_argument("--csv-dir", help="directory with SYMBOL.csv (date,open,high,low,close,volume)")
        src.add_argument("--synthetic", action="store_true", help="labelled synthetic data (demo/testing only)")
        p.add_argument("--start", default="2021-09-01")
        p.add_argument("--end", default="2024-12-31")
        p.add_argument("--seed", type=int, default=7)
    sub.add_parser("status")
    d = sub.add_parser("dashboard")
    d.add_argument("--host", default="127.0.0.1")
    d.add_argument("--port", type=int, default=8050)
    k = sub.add_parser("kill")
    k.add_argument("--reason", required=True)
    r = sub.add_parser("reset")
    r.add_argument("--operator", required=True)
    r.add_argument("--note", required=True)
    args = ap.parse_args(argv)

    try:
        settings = load_settings()
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    profile = get_profile(settings.risk_profile)
    universe = tuple(s for s in settings.universe if s != settings.benchmark_symbol) or settings.universe

    if args.cmd in ("backtest", "paper-replay", "walk-forward"):
        if args.synthetic and not os.environ.get("UNIVERSE"):
            universe = ("AAA", "BBB", "CCC", "DDD", "EEE")
        bars = _bars(args, universe, settings.benchmark_symbol)
        start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
        if args.cmd == "walk-forward":
            days = sorted({b.ts.date() for b in bars[settings.benchmark_symbol] if start <= b.ts.date() < end})
            grid = param_grid(atr_stop_mult=[1.5, 2.0, 2.5], reward_risk=[2.0, 3.0])
            out = walk_forward(bars, universe, settings.benchmark_symbol, profile, days, grid, 120, 60)
            result = {
                "out_of_sample_trade_metrics": out["out_of_sample_trade_metrics"],
                "out_of_sample_window_returns": out["out_of_sample_window_returns"],
                "windows": [{"train": [str(x) for x in w.train], "test": [str(x) for x in w.test],
                             "chosen": w.chosen.__dict__, "in_sample_return (not OOS)": w.in_sample["total_return"],
                             "out_of_sample_return": w.out_of_sample["total_return"]} for w in out["windows"]],
            }
        else:
            db_path = settings.db_path if args.cmd == "paper-replay" else ":memory:"
            rep = run_backtest(bars, universe, settings.benchmark_symbol, profile, start=start, end=end,
                               params=StrategyParams(), db_path=db_path)
            result = {"metrics": rep.metrics, "cycles": rep.cycles, "trades": len(rep.trades)}
        if args.synthetic:
            result["note"] = SYNTHETIC_NOTE
        print(json.dumps(result, indent=2, default=str))
        return 0

    db = Database(settings.db_path)
    if args.cmd == "status":
        from trader.dashboard.status import build_status
        print(json.dumps(build_status(db), indent=2, default=str))
    elif args.cmd == "dashboard":
        from trader.dashboard.server import serve
        print(f"dashboard on http://{args.host}:{args.port}")
        serve(settings.db_path, args.host, args.port)
    elif args.cmd == "kill":
        KillSwitch(db, AuditLog(db)).trip(KillReason.MANUAL, args.reason)
        print("kill switch ENGAGED")
    elif args.cmd == "reset":
        KillSwitch(db, AuditLog(db)).reset(args.operator, args.note)
        print("kill switch reset")
    return 0


if __name__ == "__main__":
    sys.exit(main())
