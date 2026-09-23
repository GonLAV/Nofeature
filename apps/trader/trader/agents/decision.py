"""Opportunity Scanner, adversarial debate, and the Decision Agent.

Output of this module is untrusted JSON (a dict). It must pass
``trader.security.schema.parse_decision`` and then the Risk Engine before
anything can happen. The internal opportunity ranking is an engine input, not
investment advice, and is never shown to users as a recommendation.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Callable

from trader.core.models import AgentReport, Quote


@dataclass
class Candidate:
    symbol: str
    technical: AgentReport
    score: float
    setups: list


class OpportunityScanner:
    name = "scanner"

    def rank(self, technical_reports: list, top_k: int = 5) -> list:
        cands = []
        for r in technical_reports:
            if r.signal != "BULLISH":
                continue
            d = r.details
            setups = d.get("setups", [])
            score = r.confidence * (1 + 0.25 * len(setups)) * (1 + max(0.0, min(d.get("volume_z") or 0, 3)) * 0.1)
            cands.append(Candidate(r.symbol, r, round(score, 4), setups))
        return sorted(cands, key=lambda c: (-c.score, c.symbol))[:top_k]


@dataclass
class Argument:
    role: str
    stance: str  # FOR | AGAINST | BLOCK
    weight: float
    points: list = field(default_factory=list)


def bull_case(tech: AgentReport, news: AgentReport, regime: AgentReport) -> Argument:
    a = Argument("bull", "FOR", 0.0)
    if tech.signal == "BULLISH":
        a.weight += tech.details.get("bull_score", 0) * 0.5
        a.points.append(f"technical: {tech.reasoning}")
    if news.signal == "BULLISH":
        a.weight += 0.5; a.points.append(f"news: {news.reasoning}")
    if "RISK_ON" in regime.details.get("labels", []):
        a.weight += 0.5; a.points.append("regime risk-on")
    return a


def bear_case(tech: AgentReport, news: AgentReport, regime: AgentReport) -> Argument:
    a = Argument("bear", "AGAINST", 0.0)
    a.weight += tech.details.get("bear_score", 0) * 0.5
    if tech.details.get("bear_score"):
        a.points.append("technical warnings present")
    if news.signal == "BEARISH":
        a.weight += 1.0; a.points.append(f"negative news: {news.reasoning}")
    labels = regime.details.get("labels", [])
    if "BEAR" in labels:
        a.weight += 1.0; a.points.append("bear market regime")
    if "HIGH_VOLATILITY" in labels:
        a.weight += 0.5; a.points.append("high volatility regime")
    return a


def risk_critic(tech: AgentReport, news: AgentReport, quote: Quote | None) -> Argument:
    a = Argument("risk", "AGAINST", 0.0)
    d = tech.details
    if d.get("atr14") and d.get("close") and d["atr14"] / d["close"] > 0.06:
        a.weight += 1.0; a.points.append("daily ATR > 6% of price: stop would be wide or hit by noise")
    if "earnings" in news.details.get("events", []):
        a.weight += 0.5; a.points.append("recent earnings filing: gap risk")
    if quote is None:
        a.stance = "BLOCK"; a.points.append("no live quote")
    elif quote.spread_bps > 30:
        a.weight += 0.5; a.points.append(f"wide spread {quote.spread_bps:.0f}bps")
    return a


def data_critic(tech: AgentReport, quote: Quote | None, now: datetime, max_quote_age_s: int = 120) -> Argument:
    a = Argument("data", "AGAINST", 0.0)
    if tech.signal == "NO_DATA":
        a.stance = "BLOCK"; a.points.append(f"technical data insufficient: {tech.reasoning}")
    if quote is None or (now - quote.ts).total_seconds() > max_quote_age_s:
        a.stance = "BLOCK"; a.points.append("quote missing or stale")
    if not tech.data_sources:
        a.stance = "BLOCK"; a.points.append("no cited data source")
    return a


def _no_trade(symbol: str, now: datetime, reason: str, sources=(), action: str = "NO_TRADE") -> dict:
    return {
        "action": action, "symbol": symbol, "direction": "FLAT", "entry": None, "stop_loss": None,
        "take_profit": None, "position_size": None, "risk_amount": None, "expected_reward": None,
        "confidence": 0.0, "time_horizon": "n/a", "reason": reason, "data_sources": list(sources),
        "timestamp": now.isoformat(),
    }


class DecisionAgent:
    """Aggregates the debate into one decision dict.

    ``llm`` is an optional callable(prompt_json) -> str. When set, its answer is
    used instead of the rule aggregation, but it is still just untrusted JSON:
    schema validation and the Risk Engine run afterwards regardless.
    """

    name = "decision"

    def __init__(self, llm: Callable[[str], str] | None = None, min_edge: float = 1.0):
        self.llm = llm
        self.min_edge = min_edge

    def decide(self, cand: Candidate, news: AgentReport, regime: AgentReport, quote: Quote | None,
               now: datetime, equity: Decimal):
        tech = cand.technical
        args = [bull_case(tech, news, regime), bear_case(tech, news, regime), risk_critic(tech, news, quote),
                data_critic(tech, quote, now)]
        transcript = [{"role": a.role, "stance": a.stance, "weight": a.weight, "points": a.points} for a in args]
        sources = sorted(set(tech.data_sources) | set(news.data_sources) | set(regime.data_sources))
        if self.llm is not None:
            prompt = json.dumps({"symbol": cand.symbol, "debate": transcript, "technical": tech.details,
                                 "quote": None if quote is None else {"bid": str(quote.bid), "ask": str(quote.ask)},
                                 "allowed_sources": sources, "now": now.isoformat()}, default=str)
            return self.llm(prompt), transcript
        if any(a.stance == "BLOCK" for a in args):
            blocked = "; ".join(p for a in args if a.stance == "BLOCK" for p in a.points)
            return _no_trade(cand.symbol, now, f"blocked: {blocked}", sources), transcript
        edge = args[0].weight - sum(a.weight for a in args[1:])
        if edge < self.min_edge:
            return _no_trade(cand.symbol, now, f"insufficient edge {edge:.2f} < {self.min_edge}", sources), transcript
        entry = quote.ask
        stop = Decimal(str(round(tech.details["suggested_stop"], 2)))
        target = Decimal(str(round(tech.details["suggested_target"], 2)))
        if not stop < entry < target:
            return _no_trade(cand.symbol, now, "price moved outside the setup's stop/target", sources), transcript
        size = (equity / entry).quantize(Decimal("0.000001"))  # upper bound; Risk Engine sizes down
        conf = min(0.95, tech.confidence + 0.05 * edge)
        decision = {
            "action": "BUY", "symbol": cand.symbol, "direction": "LONG", "entry": str(entry),
            "stop_loss": str(stop), "take_profit": str(target), "position_size": str(size),
            "risk_amount": str((entry - stop) * size), "expected_reward": str((target - entry) * size),
            "confidence": round(conf, 3), "time_horizon": "swing: days to weeks",
            "reason": f"setups={cand.setups}; edge={edge:.2f}; " + " | ".join(args[0].points),
            "data_sources": sources, "timestamp": now.isoformat(),
        }
        return decision, transcript
