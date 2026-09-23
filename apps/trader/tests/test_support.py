"""Config, redaction, providers, indicators, backtesting."""
import json
from datetime import date, datetime, timezone

import pytest

from trader.agents.analysis import StrategyParams, validate_bars
from trader.backtesting.engine import run_backtest
from trader.backtesting.walk_forward import param_grid, walk_forward
from trader.config.settings import ConfigError, LIVE_ACK_PHRASE, load_settings
from trader.core.models import Bar, Mode
from trader.data.historical import InMemoryBarsProvider, synthetic_daily_bars
from trader.data.providers import Cost, MarketDataProvider, NoData, ProviderRegistry
from trader.data.sec_edgar import SECEdgarProvider
from trader.risk.profiles import RiskProfileName, get_profile
from trader.security.redaction import MASK, redact
from trader.strategies import indicators as ind


# --- config ---------------------------------------------------------------------------------
def test_defaults_are_paper_aggressive_zero_cost():
    s = load_settings({})
    assert s.mode is Mode.PAPER and s.risk_profile is RiskProfileName.AGGRESSIVE and s.zero_cost_mode
    assert str(s.allocated_capital) == "100" and str(s.cycle_target) == "1000"


@pytest.mark.parametrize("env", [
    {"TRADER_MODE": "LIVE"},
    {"TRADER_MODE": "LIVE", "LIVE_TRADING_ENABLED": "true"},
    {"TRADER_MODE": "LIVE", "LIVE_TRADING_ENABLED": "true", "LIVE_TRADING_ACK": LIVE_ACK_PHRASE, "BROKER": "alpaca",
     "BROKER_ACCOUNT_ID": "X"},
    {"TRADER_MODE": "PAPER", "BROKER": "alpaca"},
    {"TRADER_MODE": "YOLO"},
])
def test_live_and_bad_configs_refused(env):
    with pytest.raises(ConfigError):
        load_settings(env)


# --- security -------------------------------------------------------------------------------
def test_redaction(monkeypatch):
    monkeypatch.setenv("BROKER_API_SECRET", "supersecretvalue123")
    text = 'key=abc123 sk-ant-api03-XXXXXXXXXXXX {"api_key": "zzz"} supersecretvalue123 Bearer tok.en'
    out = redact(text)
    for leaked in ("abc123", "sk-ant-api03", "zzz", "supersecretvalue123", "tok.en"):
        assert leaked not in out
    assert MASK in out


# --- providers ------------------------------------------------------------------------------
class PaidFeed(MarketDataProvider):
    name, cost = "paid", Cost.PAID

    def get_bars(self, symbol, as_of, lookback):
        return []


def test_zero_cost_mode_refuses_paid_provider():
    with pytest.raises(PermissionError):
        ProviderRegistry(zero_cost_mode=True).register("market", PaidFeed())
    ProviderRegistry(zero_cost_mode=False).register("market", PaidFeed())


def test_bars_provider_has_no_lookahead():
    bars = synthetic_daily_bars("A", datetime(2024, 1, 1, tzinfo=timezone.utc), 30)
    p = InMemoryBarsProvider({"A": bars})
    cut = bars[10].ts
    got = p.get_bars("A", cut, 100)
    assert got[-1].ts < cut and len(got) == 10
    with pytest.raises(NoData):
        p.get_bars("A", bars[0].ts, 5)


def test_bar_validation_catches_corruption():
    t = datetime(2024, 1, 2, tzinfo=timezone.utc)
    bad = [Bar("A", t, 10, 9, 11, 10, 100), Bar("A", t, 10, 11, 9, 10, 100)]
    issues = validate_bars(bad)
    assert any("inconsistent" in i for i in issues) and any("monotonic" in i for i in issues)


def test_sec_provider_requires_contact_and_parses_filings():
    with pytest.raises(ValueError):
        SECEdgarProvider("bot")
    tickers = {"0": {"ticker": "XYZ", "cik_str": 123}}
    subs = {"filings": {"recent": {"form": ["8-K", "S-8"], "accessionNumber": ["0001-24-1", "0001-24-2"],
                                   "primaryDocument": ["a.htm", "b.htm"],
                                   "acceptanceDateTime": ["2024-05-02T16:05:00.000Z", "2024-05-02T16:06:00.000Z"]}}}
    fetch = lambda url: json.dumps(tickers if "company_tickers" in url else subs).encode()  # noqa: E731
    p = SECEdgarProvider("research bot ops@example.com", fetch=fetch)
    items = p.get_filings("XYZ", datetime(2024, 5, 1, tzinfo=timezone.utc), datetime(2024, 5, 3, tzinfo=timezone.utc))
    assert len(items) == 1 and items[0].url.endswith("/123/0001241/a.htm") and items[0].kind == "filing"


# --- indicators -----------------------------------------------------------------------------
def test_indicators_basic_values():
    xs = [float(i) for i in range(1, 41)]
    assert ind.sma(xs, 5) == 38.0
    assert ind.rsi(xs, 14) == 100.0
    assert ind.sma(xs, 100) is None
    lo, mid, hi = ind.bollinger(xs, 20)
    assert lo < mid < hi
    assert ind.macd(xs)[0] > 0


# --- backtesting ----------------------------------------------------------------------------
def _bars():
    start = datetime(2022, 1, 3, tzinfo=timezone.utc)
    return {s: synthetic_daily_bars(s, start, 420, price=p, seed=5)
            for s, p in (("AAA", 20), ("BBB", 35), ("CCC", 9), ("SPY", 400))}


def test_backtest_runs_and_reports_metrics():
    rep = run_backtest(_bars(), ("AAA", "BBB", "CCC"), "SPY", get_profile(RiskProfileName.AGGRESSIVE),
                       start=date(2022, 6, 1), end=date(2023, 6, 1))
    m = rep.metrics
    for k in ("total_return", "cagr", "win_rate", "loss_rate", "profit_factor", "sharpe", "sortino", "max_drawdown",
              "avg_win", "avg_loss", "expectancy", "trades", "fees"):
        assert k in m
    assert m["starting_equity"] == 100.0
    assert rep.cycles[0]["allocated_capital"] == "100"


def test_walk_forward_test_windows_are_disjoint_and_after_training():
    bars = _bars()
    days = sorted({b.ts.date() for b in bars["SPY"] if b.ts.date() >= date(2022, 5, 1)})
    grid = param_grid(atr_stop_mult=[1.5, 2.5], reward_risk=[2.0])
    out = walk_forward(bars, ("AAA", "BBB", "CCC"), "SPY", get_profile(RiskProfileName.AGGRESSIVE), days, grid,
                       train_days=80, test_days=40)
    ws = out["windows"]
    assert ws
    for w in ws:
        assert w.train[1] <= w.test[0]  # never evaluated on data it was tuned on
    for a, b in zip(ws, ws[1:]):
        assert a.test[1] <= b.test[0]
    assert isinstance(ws[0].chosen, StrategyParams)
