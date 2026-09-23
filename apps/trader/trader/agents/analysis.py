"""Analysis agents. Each returns an AgentReport (signal, confidence, reasoning,
risk, sources) and never makes the final call — the Decision Agent does.

These are deterministic rule-based agents. An LLM can later replace or augment
any of them behind the same AgentReport contract; its facts must still come
from the data providers passed in, never from the model.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from trader.core.models import AgentReport, Bar
from trader.data.providers import (
    FactKind, FundamentalProvider, MarketDataProvider, NewsProvider, NoData, SECProvider,
)
from trader.strategies import indicators as ind


@dataclass(frozen=True)
class StrategyParams:
    breakout_lookback: int = 20
    atr_stop_mult: float = 2.0
    reward_risk: float = 2.0
    min_score: float = 2.0
    min_bars: int = 60


@dataclass
class DataBundle:
    symbol: str
    bars: list
    source: str
    ok: bool
    issues: list


# --- Market Data Agent ---------------------------------------------------------------------
class MarketDataAgent:
    name = "market_data"

    def __init__(self, provider: MarketDataProvider, min_bars: int = 60, max_age: timedelta = timedelta(days=5)):
        self.provider = provider
        self.min_bars = min_bars
        self.max_age = max_age

    def collect(self, symbol: str, as_of: datetime, lookback: int = 250) -> DataBundle:
        try:
            bars = self.provider.get_bars(symbol, as_of, lookback)
        except NoData as exc:
            return DataBundle(symbol, [], self.provider.name, False, [str(exc)])
        issues = validate_bars(bars)
        if len(bars) < self.min_bars:
            issues.append(f"only {len(bars)} bars (< {self.min_bars})")
        if bars and as_of - bars[-1].ts > self.max_age:
            issues.append(f"stale: last bar {bars[-1].ts.isoformat()}")
        return DataBundle(symbol, bars, self.provider.name, not issues, issues)


def validate_bars(bars: list) -> list:
    issues = []
    for prev, b in zip([None] + bars[:-1], bars):
        if min(b.open, b.high, b.low, b.close) <= 0 or b.volume < 0:
            issues.append(f"non-positive value at {b.ts.isoformat()}")
        if b.high < max(b.open, b.close) or b.low > min(b.open, b.close) or b.high < b.low:
            issues.append(f"inconsistent OHLC at {b.ts.isoformat()}")
        if prev and b.ts <= prev.ts:
            issues.append(f"non-monotonic timestamps at {b.ts.isoformat()}")
    return issues[:5]


# --- Technical Analysis Agent --------------------------------------------------------------
class TechnicalAgent:
    name = "technical"

    def __init__(self, params: StrategyParams = StrategyParams()):
        self.p = params

    def analyze(self, data: DataBundle) -> AgentReport:
        if not data.ok:
            return AgentReport(self.name, data.symbol, "NO_DATA", 0.0, "; ".join(data.issues), "unknown")
        bars: list[Bar] = data.bars
        closes = [b.close for b in bars]
        vols = [b.volume for b in bars]
        last = closes[-1]
        lb = self.p.breakout_lookback
        d = {
            "close": last, "sma20": ind.sma(closes, 20), "sma50": ind.sma(closes, 50),
            "ema12": ind.ema(closes, 12), "rsi14": ind.rsi(closes, 14), "macd": ind.macd(closes),
            "atr14": ind.atr(bars, 14), "bollinger": ind.bollinger(closes, 20), "vwap20": ind.vwap(bars, 20),
            "volume_z": ind.volume_zscore(vols, 20), "realized_vol": ind.realized_vol(closes, 20),
            "support_resistance": ind.support_resistance(bars[:-1], lb),
            "momentum_20d": last / closes[-21] - 1 if len(closes) > 21 else None,
            "avg_volume20": ind.sma(vols, 20),
        }
        if None in (d["sma20"], d["sma50"], d["rsi14"], d["macd"], d["atr14"], d["bollinger"], d["support_resistance"]):
            return AgentReport(self.name, data.symbol, "NO_DATA", 0.0, "not enough history for indicators",
                               "unknown", (data.source,), d)

        bull, bear, setups, why = 0.0, 0.0, [], []
        trend_up = last > d["sma50"] and d["sma20"] > d["sma50"]
        if trend_up:
            bull += 1; setups.append("trend"); why.append("price above rising SMA20>SMA50")
        elif last < d["sma50"] and d["sma20"] < d["sma50"]:
            bear += 1; why.append("downtrend (price and SMA20 below SMA50)")
        resistance = d["support_resistance"][1]
        if last > resistance and (d["volume_z"] or 0) > 1.0:
            bull += 1.5; setups.append("breakout"); why.append(f"{lb}d breakout on volume z={d['volume_z']:.1f}")
        hist = d["macd"][2]
        if d["momentum_20d"] and d["momentum_20d"] > 0 and hist > 0 and 50 < d["rsi14"] < 75:
            bull += 1; setups.append("momentum"); why.append(f"momentum, RSI {d['rsi14']:.0f}, MACD hist>0")
        lower = d["bollinger"][0]
        if d["rsi14"] < 30 and last < lower and last > d["sma50"] * 0.9:
            bull += 1; setups.append("mean_reversion"); why.append("oversold below lower band")
        if d["rsi14"] > 80:
            bear += 1.5; why.append(f"overextended RSI {d['rsi14']:.0f}")
        if hist < 0:
            bear += 0.5; why.append("MACD histogram negative")

        stop = last - self.p.atr_stop_mult * d["atr14"]
        target = last + self.p.reward_risk * (last - stop)
        d.update({"setups": setups, "bull_score": bull, "bear_score": bear, "suggested_stop": stop,
                  "suggested_target": target})
        net = bull - bear
        signal = "BULLISH" if net >= self.p.min_score else "BEARISH" if net <= -1 else "NEUTRAL"
        conf = max(0.0, min(0.95, 0.5 + 0.1 * net))
        risk = f"ATR {d['atr14']:.2f} ({d['atr14'] / last:.1%}); stop {stop:.2f}"
        return AgentReport(self.name, data.symbol, signal, round(conf, 3), "; ".join(why) or "no setup",
                           risk, (data.source,), d)


# --- Market Regime Agent -------------------------------------------------------------------
class RegimeAgent:
    name = "regime"

    def analyze(self, data: DataBundle, high_vol_threshold: float = 0.28) -> AgentReport:
        if not data.ok or len(data.bars) < 60:
            return AgentReport(self.name, data.symbol, "NO_DATA", 0.0, "benchmark data unavailable", "unknown",
                               details={"labels": ["UNKNOWN"]})
        closes = [b.close for b in data.bars]
        sma50 = ind.sma(closes, 50)
        sma50_prev = ind.sma(closes[:-10], 50)
        rv = ind.realized_vol(closes, 20) or 0.0
        labels = []
        if closes[-1] > sma50 and sma50 > sma50_prev:
            labels.append("BULL")
        elif closes[-1] < sma50 and sma50 < sma50_prev:
            labels.append("BEAR")
        else:
            labels.append("SIDEWAYS")
        labels.append("HIGH_VOLATILITY" if rv > high_vol_threshold else "LOW_VOLATILITY")
        risk_on = labels[0] == "BULL" and labels[1] == "LOW_VOLATILITY"
        labels.append("RISK_ON" if risk_on else "RISK_OFF")
        signal = "BULLISH" if risk_on else "BEARISH" if labels[0] == "BEAR" else "NEUTRAL"
        return AgentReport(self.name, data.symbol, signal, 0.7, ", ".join(labels),
                           f"realized vol {rv:.1%}", (data.source,), {"labels": labels, "realized_vol": rv})


# --- News Intelligence Agent ---------------------------------------------------------------
NEGATIVE = ("downgrade", "investigation", "lawsuit", "bankruptcy", "offering", "recall", "misses", "cuts guidance",
            "delist", "fraud", "subpoena", "going concern")
POSITIVE = ("upgrade", "beats", "raises guidance", "record revenue", "to be acquired", "approval", "buyback")
EVENT_FORMS = {"8-K": "material_event", "10-Q": "earnings", "10-K": "earnings", "4": "insider"}


class NewsAgent:
    name = "news"

    def __init__(self, news: NewsProvider | None, sec: SECProvider | None, window: timedelta = timedelta(days=3)):
        self.news, self.sec, self.window = news, sec, window

    def analyze(self, symbol: str, as_of: datetime) -> AgentReport:
        items, errors = [], []
        for prov, fn in ((self.news, "get_news"), (self.sec, "get_filings")):
            if prov is None:
                continue
            try:
                items += getattr(prov, fn)(symbol, as_of - self.window, as_of)
            except Exception as exc:  # a provider failing is NO_DATA for that source, not a crash
                errors.append(f"{prov.name}: {exc!r}")
        if not items:
            return AgentReport(self.name, symbol, "NO_DATA", 0.0,
                               "no news in window" + (f" ({'; '.join(errors)})" if errors else ""), "unknown")
        pos = neg = 0
        events = []
        for it in items:
            t = it.title.lower()
            pos += any(k in t for k in POSITIVE)
            neg += any(k in t for k in NEGATIVE)
            if it.kind == "filing":
                events.append(EVENT_FORMS.get(it.title.split()[0], "filing"))
        signal = "BEARISH" if neg > pos else "BULLISH" if pos > neg else "NEUTRAL"
        conf = min(0.9, 0.4 + 0.1 * abs(pos - neg))
        risk = "event risk: " + ", ".join(sorted(set(events))) if events else "no scheduled-event filings"
        cited = [{"source": i.source, "timestamp": i.timestamp.isoformat(), "url": i.url, "confidence": i.confidence,
                  "title": i.title} for i in items]
        return AgentReport(self.name, symbol, signal, conf, f"{len(items)} items, +{pos}/-{neg}", risk,
                           tuple(sorted({i.url for i in items})), {"items": cited, "events": events})


# --- Fundamental Agent ---------------------------------------------------------------------
class FundamentalAgent:
    name = "fundamental"

    def __init__(self, provider: FundamentalProvider | None):
        self.provider = provider

    def analyze(self, symbol: str, as_of: datetime) -> AgentReport:
        if self.provider is None:
            return AgentReport(self.name, symbol, "NO_DATA", 0.0, "no free fundamental provider configured", "unknown",
                               details={"facts": [], "kind": FactKind.UNKNOWN.value})
        try:
            facts = self.provider.get_fundamentals(symbol, as_of)
        except Exception as exc:
            return AgentReport(self.name, symbol, "NO_DATA", 0.0, repr(exc), "unknown")
        by = {f.name: f for f in facts}
        score, why = 0, []
        for name, good in (("revenue_growth", lambda v: v > 0.1), ("free_cash_flow", lambda v: v > 0)):
            f = by.get(name)
            if f and f.value is not None and f.kind in (FactKind.FACT, FactKind.CALCULATED):
                ok = good(f.value)
                score += 1 if ok else -1
                why.append(f"{name}={f.value} [{f.kind.value}]")
        signal = "BULLISH" if score > 0 else "BEARISH" if score < 0 else "NEUTRAL"
        return AgentReport(self.name, symbol, signal, 0.5, "; ".join(why) or "no usable facts", "fundamentals lag price",
                           tuple(sorted({f.url for f in facts})),
                           {"facts": [(f.name, f.value, f.kind.value, f.source) for f in facts]})
