"""Core domain models shared by every layer.

Money and quantities are ``Decimal`` so the capital boundary is exact;
indicator math works on floats and is converted at the edges.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Optional

CENT = Decimal("0.01")
QTY_STEP = Decimal("0.000001")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def qty(value) -> Decimal:
    return Decimal(str(value)).quantize(QTY_STEP, rounding=ROUND_DOWN)


class Mode(str, Enum):
    BACKTEST = "BACKTEST"
    PAPER = "PAPER"
    LIVE = "LIVE"


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    NO_TRADE = "NO_TRADE"
    CLOSE = "CLOSE"
    WAIT = "WAIT"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"


class OrderStatus(str, Enum):
    PENDING_SUBMIT = "PENDING_SUBMIT"  # written to DB, not yet acknowledged by broker
    ACCEPTED = "ACCEPTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"
    UNSENT = "UNSENT"  # recovery proved it never reached the broker

    @property
    def is_open(self) -> bool:
        return self in (OrderStatus.PENDING_SUBMIT, OrderStatus.ACCEPTED, OrderStatus.PARTIALLY_FILLED)


class CycleStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMPLETING = "COMPLETING"  # target hit: no new entries, liquidating
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class Bar:
    symbol: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Quote:
    symbol: str
    bid: Decimal
    ask: Decimal
    last: Decimal
    ts: datetime
    avg_daily_volume: float = 0.0

    @property
    def mid(self) -> Decimal:
        return (self.bid + self.ask) / 2

    @property
    def spread_bps(self) -> Decimal:
        if self.mid <= 0:
            return Decimal("Infinity")
        return (self.ask - self.bid) / self.mid * Decimal(10000)


@dataclass(frozen=True)
class Account:
    account_id: str
    cash: Decimal
    buying_power: Decimal
    equity: Decimal
    margin_enabled: bool
    currency: str = "USD"


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: Decimal
    avg_entry_price: Decimal
    current_price: Decimal

    @property
    def market_value(self) -> Decimal:
        return self.qty * self.current_price


@dataclass(frozen=True)
class MarketStatus:
    is_open: bool
    ts: datetime


@dataclass(frozen=True)
class BrokerCapabilities:
    name: str
    supports_fractional: bool
    supports_bracket_orders: bool
    # Many brokers (e.g. Alpaca) only allow fractional qty on simple market/limit day
    # orders. A fractional position can then not carry a broker-side stop.
    supports_fractional_bracket: bool
    isolated_account: bool  # account (or sub-account) holds only this system's capital
    min_order_notional: Decimal
    is_live: bool


@dataclass(frozen=True)
class OrderRequest:
    client_order_id: str
    session_id: str
    symbol: str
    side: Side
    qty: Decimal
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None  # bracket child
    take_profit: Optional[Decimal] = None  # bracket child
    reduce_only: bool = False


@dataclass
class Order:
    client_order_id: str
    symbol: str
    side: Side
    qty: Decimal
    order_type: OrderType
    status: OrderStatus
    broker_order_id: Optional[str] = None
    parent_client_order_id: Optional[str] = None
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    filled_qty: Decimal = Decimal(0)
    filled_avg_price: Optional[Decimal] = None
    fees: Decimal = Decimal(0)
    reject_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(frozen=True)
class Decision:
    """Validated output of the Decision Agent. Built only by ``trader.security.schema``."""

    action: Action
    symbol: str
    direction: str  # LONG | FLAT (cash account, no shorting)
    entry: Optional[Decimal]
    stop_loss: Optional[Decimal]
    take_profit: Optional[Decimal]
    position_size: Optional[Decimal]
    risk_amount: Optional[Decimal]
    expected_reward: Optional[Decimal]
    confidence: float
    time_horizon: str
    reason: str
    data_sources: tuple
    timestamp: datetime


@dataclass(frozen=True)
class AgentReport:
    agent: str
    symbol: str
    signal: str  # BULLISH | BEARISH | NEUTRAL | NO_DATA
    confidence: float
    reasoning: str
    risk: str
    data_sources: tuple = ()
    details: dict = field(default_factory=dict)
