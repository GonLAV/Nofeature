"""Strict validation of Decision Agent output.

Whatever produced the decision (rule engine today, an LLM later), it arrives as
untrusted JSON. Anything that does not match this schema exactly is rejected
and becomes NO_TRADE — never "best effort" parsed.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from trader.core.models import Action, Decision

SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
TRADE_ACTIONS = {Action.BUY}
EXIT_ACTIONS = {Action.SELL, Action.CLOSE}
FIELDS = {
    "action", "symbol", "direction", "entry", "stop_loss", "take_profit", "position_size",
    "risk_amount", "expected_reward", "confidence", "time_horizon", "reason", "data_sources",
    "timestamp",
}
NUMERIC = ("entry", "stop_loss", "take_profit", "position_size", "risk_amount", "expected_reward")
MAX_JSON_BYTES = 16_384


class SchemaError(ValueError):
    pass


def _num(name: str, value, required: bool) -> Decimal | None:
    if value is None:
        if required:
            raise SchemaError(f"{name} is required")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise SchemaError(f"{name} must be a number")
    try:
        d = Decimal(str(value))
    except InvalidOperation as exc:
        raise SchemaError(f"{name} is not a number") from exc
    if not d.is_finite() or d <= 0:
        raise SchemaError(f"{name} must be a positive finite number")
    return d


def parse_decision(raw) -> Decision:
    """Accepts a JSON string or dict. Raises SchemaError on any deviation."""
    if isinstance(raw, (str, bytes)):
        if len(raw) > MAX_JSON_BYTES:
            raise SchemaError("decision JSON too large")
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise SchemaError(f"invalid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise SchemaError("decision must be a JSON object")

    keys = set(raw)
    if keys != FIELDS:
        missing, extra = FIELDS - keys, keys - FIELDS
        raise SchemaError(f"field mismatch missing={sorted(missing)} extra={sorted(extra)}")

    try:
        action = Action(raw["action"])
    except (ValueError, TypeError) as exc:
        raise SchemaError(f"action must be one of {[a.value for a in Action]}") from exc

    symbol = raw["symbol"]
    if not isinstance(symbol, str) or not SYMBOL_RE.match(symbol):
        raise SchemaError("symbol invalid")

    direction = raw["direction"]
    if direction not in ("LONG", "FLAT"):
        raise SchemaError("direction must be LONG or FLAT (no shorting in a cash account)")
    if action in TRADE_ACTIONS and direction != "LONG":
        raise SchemaError("BUY requires direction LONG")

    trade = action in TRADE_ACTIONS
    nums = {n: _num(n, raw[n], required=trade) for n in NUMERIC}
    if trade:
        if not nums["stop_loss"] < nums["entry"]:
            raise SchemaError("stop_loss must be below entry for a long")
        if not nums["take_profit"] > nums["entry"]:
            raise SchemaError("take_profit must be above entry for a long")

    conf = raw["confidence"]
    if isinstance(conf, bool) or not isinstance(conf, (int, float)) or not math.isfinite(conf) or not 0 <= conf <= 1:
        raise SchemaError("confidence must be a number in [0,1]")

    for name in ("time_horizon", "reason"):
        if not isinstance(raw[name], str) or not raw[name].strip() or len(raw[name]) > 2000:
            raise SchemaError(f"{name} must be a non-empty string")

    sources = raw["data_sources"]
    if not isinstance(sources, list) or not all(isinstance(s, str) and s for s in sources):
        raise SchemaError("data_sources must be a list of strings")
    if trade and not sources:
        raise SchemaError("a trade decision must cite at least one data source")

    try:
        ts = datetime.fromisoformat(raw["timestamp"])
    except (TypeError, ValueError) as exc:
        raise SchemaError("timestamp must be ISO-8601") from exc
    if ts.tzinfo is None:
        raise SchemaError("timestamp must be timezone-aware")

    return Decision(
        action=action, symbol=symbol, direction=direction, confidence=float(conf),
        time_horizon=raw["time_horizon"], reason=raw["reason"], data_sources=tuple(sources),
        timestamp=ts, **nums,
    )
