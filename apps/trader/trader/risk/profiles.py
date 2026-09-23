"""Risk profiles. Pure data: the Risk Engine reads them, nothing writes them at runtime."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class RiskProfileName(str, Enum):
    CONSERVATIVE = "CONSERVATIVE"
    NORMAL = "NORMAL"
    AGGRESSIVE = "AGGRESSIVE"
    EXTREME = "EXTREME"


@dataclass(frozen=True)
class RiskProfile:
    name: RiskProfileName
    risk_per_trade_pct: Decimal  # max loss to stop, as fraction of cycle equity
    max_position_pct: Decimal  # max notional of one position, fraction of cycle equity
    max_exposure_pct: Decimal  # max total notional invested, fraction of cycle equity
    daily_loss_limit_pct: Decimal  # trips the kill switch
    max_trades_per_day: int
    max_open_positions: int
    min_reward_risk: Decimal
    min_confidence: float
    max_spread_bps: Decimal = Decimal("40")
    max_quote_age_seconds: int = 120
    min_price: Decimal = Decimal("1")  # no sub-$1 stocks
    min_avg_daily_volume: float = 500_000
    max_stop_distance_pct: Decimal = Decimal("0.25")
    # Leverage/margin is not a profile knob: the engine rejects it unconditionally.


PROFILES = {
    RiskProfileName.CONSERVATIVE: RiskProfile(
        RiskProfileName.CONSERVATIVE, Decimal("0.01"), Decimal("0.20"), Decimal("0.50"),
        Decimal("0.03"), 3, 2, Decimal("2.0"), 0.70,
    ),
    RiskProfileName.NORMAL: RiskProfile(
        RiskProfileName.NORMAL, Decimal("0.02"), Decimal("0.35"), Decimal("0.80"),
        Decimal("0.05"), 5, 3, Decimal("1.8"), 0.65,
    ),
    RiskProfileName.AGGRESSIVE: RiskProfile(
        RiskProfileName.AGGRESSIVE, Decimal("0.05"), Decimal("0.60"), Decimal("1.00"),
        Decimal("0.10"), 8, 3, Decimal("1.5"), 0.60,
    ),
    RiskProfileName.EXTREME: RiskProfile(
        RiskProfileName.EXTREME, Decimal("0.10"), Decimal("1.00"), Decimal("1.00"),
        Decimal("0.20"), 12, 4, Decimal("1.2"), 0.55, max_spread_bps=Decimal("80"),
    ),
}


def get_profile(name: RiskProfileName) -> RiskProfile:
    return PROFILES[name]
