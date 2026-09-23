import json

import pytest

from trader.core.models import Action
from trader.security.schema import SchemaError, parse_decision

NOW = "2025-03-04T15:00:00+00:00"


def buy(**kw):
    d = {"action": "BUY", "symbol": "XYZ", "direction": "LONG", "entry": "20", "stop_loss": "19",
         "take_profit": "23", "position_size": "4", "risk_amount": "4", "expected_reward": "12",
         "confidence": 0.7, "time_horizon": "days", "reason": "breakout", "data_sources": ["memory"],
         "timestamp": NOW}
    d.update(kw)
    return d


def test_valid_buy_parses():
    d = parse_decision(json.dumps(buy()))
    assert d.action is Action.BUY and str(d.entry) == "20"


def test_no_trade_with_nulls_is_valid():
    d = parse_decision(buy(action="NO_TRADE", direction="FLAT", entry=None, stop_loss=None, take_profit=None,
                           position_size=None, risk_amount=None, expected_reward=None, data_sources=[]))
    assert d.action is Action.NO_TRADE


@pytest.mark.parametrize("raw", [
    "not json", "[1,2]", "{\"action\": \"BUY\"}", json.dumps(buy(extra="x")), "{" * 20000,
])
def test_malformed_rejected(raw):
    with pytest.raises(SchemaError):
        parse_decision(raw)


@pytest.mark.parametrize("override", [
    {"action": "YOLO"}, {"symbol": "xyz; DROP TABLE"}, {"direction": "SHORT"}, {"stop_loss": "21"},
    {"take_profit": "19"}, {"entry": "NaN"}, {"entry": "-5"}, {"entry": True}, {"confidence": 1.5},
    {"confidence": float("nan")}, {"data_sources": []}, {"data_sources": "memory"},
    {"timestamp": "2025-03-04T15:00:00"}, {"reason": ""}, {"stop_loss": None},
])
def test_invalid_fields_rejected(override):
    with pytest.raises(SchemaError):
        parse_decision(buy(**override))
