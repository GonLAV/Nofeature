"""Runtime configuration, read from environment variables only (no secrets in code).

PAPER is the default. LIVE needs three explicit switches and a live broker
adapter; until one exists the settings loader refuses LIVE outright.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal

from trader.core.models import Mode
from trader.risk.profiles import RiskProfileName

# Fixed by the spec. Changing these is a human decision made in code review,
# never something the running system can do.
CYCLE_ALLOCATION = Decimal("100")
CYCLE_TARGET = Decimal("1000")

LIVE_ACK_PHRASE = "I-ACCEPT-REAL-MONEY-RISK"
LIVE_BROKERS_IMPLEMENTED: frozenset = frozenset()  # Phase 10 adds adapters here


class ConfigError(Exception):
    pass


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    mode: Mode
    risk_profile: RiskProfileName
    zero_cost_mode: bool
    broker: str
    broker_account_id: str
    db_path: str
    universe: tuple
    benchmark_symbol: str
    sec_user_agent: str
    allocated_capital: Decimal = CYCLE_ALLOCATION
    cycle_target: Decimal = CYCLE_TARGET


def load_settings(env: dict | None = None) -> Settings:
    env = dict(os.environ if env is None else env)

    def get(name: str, default: str = "") -> str:
        return env.get(name, default).strip()

    try:
        mode = Mode(get("TRADER_MODE", "PAPER").upper())
    except ValueError as exc:
        raise ConfigError(f"TRADER_MODE must be one of {[m.value for m in Mode]}") from exc

    try:
        profile = RiskProfileName(get("RISK_PROFILE", "AGGRESSIVE").upper())
    except ValueError as exc:
        raise ConfigError(f"RISK_PROFILE must be one of {[p.value for p in RiskProfileName]}") from exc

    zero_cost_raw = env.get("ZERO_COST_MODE")
    zero_cost = True if zero_cost_raw is None else zero_cost_raw.strip().lower() in ("1", "true", "yes", "on")
    broker = get("BROKER", "paper").lower()

    if mode is Mode.LIVE:
        if get("LIVE_TRADING_ENABLED").lower() != "true":
            raise ConfigError("LIVE mode requires LIVE_TRADING_ENABLED=true")
        if get("LIVE_TRADING_ACK") != LIVE_ACK_PHRASE:
            raise ConfigError(f"LIVE mode requires LIVE_TRADING_ACK={LIVE_ACK_PHRASE}")
        if broker not in LIVE_BROKERS_IMPLEMENTED:
            raise ConfigError(
                f"No live broker adapter for '{broker}' exists yet (Phase 10). Refusing LIVE mode."
            )
        if not get("BROKER_ACCOUNT_ID"):
            raise ConfigError("LIVE mode requires BROKER_ACCOUNT_ID (the one isolated account)")
    elif broker != "paper":
        raise ConfigError("Non-LIVE modes only run against the paper broker")

    universe = tuple(s.strip().upper() for s in get("UNIVERSE", "SPY,QQQ,IWM").split(",") if s.strip())
    if not universe:
        raise ConfigError("UNIVERSE is empty")

    return Settings(
        mode=mode,
        risk_profile=profile,
        zero_cost_mode=zero_cost,
        broker=broker,
        broker_account_id=get("BROKER_ACCOUNT_ID", "PAPER-000001"),
        db_path=get("TRADER_DB_PATH", "trader.db"),
        universe=universe,
        benchmark_symbol=get("BENCHMARK_SYMBOL", "SPY").upper(),
        sec_user_agent=get("SEC_USER_AGENT"),
    )
