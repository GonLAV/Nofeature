"""Paper broker: an in-process exchange simulator used for BACKTEST and PAPER.

Simulates what actually bites a $100 account: commissions and regulatory
fees, spread and slippage, partial fills, market hours, rejections, latency,
bracket (stop-loss / take-profit) children, gaps through stops, and injected
failures for chaos tests.
"""
from __future__ import annotations

import copy
import random
from dataclasses import dataclass, replace
from datetime import datetime
from decimal import ROUND_CEILING, Decimal

from trader.broker.base import BrokerError, BrokerInterface, BrokerRejected, BrokerTimeout
from trader.broker.market_hours import is_regular_session
from trader.core.models import (
    Account, Bar, BrokerCapabilities, MarketStatus, Order, OrderRequest, OrderStatus, OrderType,
    Position, Quote, Side, money, qty as to_qty,
)


@dataclass(frozen=True)
class FeeModel:
    """Defaults approximate a US zero-commission broker. Regulatory rates change;
    verify against the broker's current fee schedule before relying on them."""

    commission_per_order: Decimal = Decimal("0")
    sec_fee_rate: Decimal = Decimal("0.0000278")  # on sell notional
    taf_per_share: Decimal = Decimal("0.000166")  # on shares sold
    taf_max: Decimal = Decimal("8.30")

    def fees(self, side: Side, shares: Decimal, price: Decimal) -> Decimal:
        fee = self.commission_per_order
        if side is Side.SELL:
            fee += shares * price * self.sec_fee_rate
            fee += min(shares * self.taf_per_share, self.taf_max)
        return fee.quantize(Decimal("0.01"), rounding=ROUND_CEILING) if fee > 0 else Decimal("0")


DEFAULT_CAPS = BrokerCapabilities(
    name="paper", supports_fractional=True, supports_bracket_orders=True,
    supports_fractional_bracket=False, isolated_account=True,
    min_order_notional=Decimal("1"), is_live=False,
)


class PaperBroker(BrokerInterface):
    def __init__(
        self,
        account_id: str,
        starting_cash: Decimal,
        clock,
        *,
        fee_model: FeeModel = FeeModel(),
        slippage_bps: Decimal = Decimal("5"),
        spread_bps: Decimal = Decimal("4"),
        capabilities: BrokerCapabilities = DEFAULT_CAPS,
        max_fill_qty_per_step: Decimal | None = None,
        reject_probability: float = 0.0,
        latency_ms: int = 50,
        seed: int = 7,
        market_open_fn=is_regular_session,
    ):
        self._account_id = account_id
        self.cash = money(starting_cash)
        self.clock = clock
        self.fee_model = fee_model
        self.slippage = slippage_bps / Decimal(10000)
        self.spread = spread_bps / Decimal(10000)
        self._caps = capabilities
        self.max_fill_qty_per_step = max_fill_qty_per_step
        self.reject_probability = reject_probability
        self.latency_ms = latency_ms
        self.rng = random.Random(seed)
        self.market_open_fn = market_open_fn
        self.quotes: dict[str, Quote] = {}
        self.positions: dict[str, Position] = {}
        self.orders: dict[str, Order] = {}
        self._pending_sl_tp: dict[str, tuple] = {}  # parent id -> (stop, tp)
        self._failures: dict[str, list] = {}
        self._seq = 0

    # --- chaos hooks -----------------------------------------------------------------------
    def inject_failure(self, method: str, exc: Exception, *, after_effect: bool = False, times: int = 1) -> None:
        """after_effect=True makes the call take effect and *then* raise (lost response)."""
        self._failures.setdefault(method, []).extend([(exc, after_effect)] * times)

    def _maybe_fail(self, method: str, after: bool) -> None:
        queue = self._failures.get(method)
        if queue and queue[0][1] == after:
            exc, _ = queue.pop(0)
            raise exc

    # --- market data feed (driven by backtest / paper loop) --------------------------------
    def set_price(self, symbol: str, price, avg_daily_volume: float = 0.0) -> None:
        p = Decimal(str(price))
        half = p * self.spread / 2
        prev = self.quotes.get(symbol)
        adv = avg_daily_volume or (prev.avg_daily_volume if prev else 0.0)
        self.quotes[symbol] = Quote(symbol, money(p - half), money(p + half), money(p), self.clock(), adv)
        if symbol in self.positions:
            pos = self.positions[symbol]
            self.positions[symbol] = replace(pos, current_price=money(p))

    def on_bar(self, bar: Bar, avg_daily_volume: float = 0.0) -> None:
        """Replays a bar after entry: trigger stops/targets against its range, then mark at close."""
        self._trigger_children(bar)
        self.set_price(bar.symbol, bar.close, avg_daily_volume)
        self.process()

    # --- BrokerInterface --------------------------------------------------------------------
    @property
    def account_id(self) -> str:
        return self._account_id

    @property
    def capabilities(self) -> BrokerCapabilities:
        return self._caps

    def get_account(self) -> Account:
        self._maybe_fail("get_account", False)
        equity = self.cash + sum((p.market_value for p in self.positions.values()), Decimal(0))
        return Account(self._account_id, self.cash, self.cash, money(equity), margin_enabled=False)

    def get_positions(self) -> list[Position]:
        self._maybe_fail("get_positions", False)
        return [copy.copy(p) for p in self.positions.values()]

    def get_orders(self, open_only: bool = False) -> list[Order]:
        self._maybe_fail("get_orders", False)
        return [copy.copy(o) for o in self.orders.values() if not open_only or o.status.is_open]

    def get_order(self, client_order_id: str) -> Order | None:
        self._maybe_fail("get_order", False)
        o = self.orders.get(client_order_id)
        return copy.copy(o) if o else None

    def get_quote(self, symbol: str) -> Quote:
        self._maybe_fail("get_quote", False)
        if symbol not in self.quotes:
            raise BrokerError(f"no quote for {symbol}")
        return self.quotes[symbol]

    def get_buying_power(self) -> Decimal:
        return self.cash  # cash account: no margin, ever

    def get_market_status(self) -> MarketStatus:
        self._maybe_fail("get_market_status", False)
        now = self.clock()
        return MarketStatus(self.market_open_fn(now), now)

    def submit_order(self, request: OrderRequest) -> Order:
        self._maybe_fail("submit_order", False)
        order = self._accept(request)
        self._maybe_fail("submit_order", True)
        return copy.copy(order)

    def cancel_order(self, client_order_id: str) -> None:
        self._maybe_fail("cancel_order", False)
        o = self.orders.get(client_order_id)
        if o and o.status.is_open:
            o.status = OrderStatus.CANCELED
            o.updated_at = self.clock()

    def close_position(self, symbol: str, client_order_id: str) -> Order:
        pos = self.positions.get(symbol)
        if not pos or pos.qty <= 0:
            raise BrokerRejected(f"no position in {symbol}")
        for o in self.orders.values():
            if o.symbol == symbol and o.side is Side.SELL and o.status.is_open:
                o.status = OrderStatus.CANCELED
                o.updated_at = self.clock()
        req = OrderRequest(client_order_id, "", symbol, Side.SELL, pos.qty, reduce_only=True)
        return self.submit_order(req)

    # --- matching engine --------------------------------------------------------------------
    def _new_order(self, req: OrderRequest, status: OrderStatus, reason: str | None = None) -> Order:
        self._seq += 1
        now = self.clock()
        o = Order(
            client_order_id=req.client_order_id, symbol=req.symbol, side=req.side, qty=req.qty,
            order_type=req.order_type, status=status, broker_order_id=f"PB-{self._seq:08d}",
            limit_price=req.limit_price, stop_price=req.stop_price, reject_reason=reason,
            created_at=now, updated_at=now,
        )
        self.orders[req.client_order_id] = o
        return o

    def _accept(self, req: OrderRequest) -> Order:
        if req.client_order_id in self.orders:
            raise BrokerRejected(f"duplicate client_order_id {req.client_order_id}")
        reason = self._validate(req)
        if reason is None and self.reject_probability and self.rng.random() < self.reject_probability:
            reason = "simulated broker rejection"
        if reason:
            return self._new_order(req, OrderStatus.REJECTED, reason)
        o = self._new_order(req, OrderStatus.ACCEPTED)
        if req.stop_loss or req.take_profit:
            self._pending_sl_tp[req.client_order_id] = (req.stop_loss, req.take_profit)
        self._fill(o)
        return o

    def _validate(self, req: OrderRequest) -> str | None:
        if req.qty <= 0:
            return "qty must be positive"
        if not self.market_open_fn(self.clock()):
            return "market closed"
        if req.symbol not in self.quotes:
            return "no market for symbol"
        whole = req.qty == req.qty.to_integral_value()
        if not whole and not self._caps.supports_fractional:
            return "fractional qty not supported"
        bracket = req.stop_loss is not None or req.take_profit is not None
        if bracket and not self._caps.supports_bracket_orders:
            return "bracket orders not supported"
        if bracket and not whole and not self._caps.supports_fractional_bracket:
            return "fractional bracket orders not supported"
        q = self.quotes[req.symbol]
        if req.side is Side.BUY:
            if req.qty * q.ask < self._caps.min_order_notional:
                return "below minimum order notional"
            est = req.qty * q.ask * (1 + self.slippage)
            if est + self.fee_model.fees(Side.BUY, req.qty, q.ask) > self.cash:
                return "insufficient buying power"
        else:
            held = self.positions.get(req.symbol)
            open_sells = sum(
                (o.qty - o.filled_qty for o in self.orders.values()
                 if o.symbol == req.symbol and o.side is Side.SELL and o.status.is_open
                 and o.parent_client_order_id is None),
                Decimal(0),
            )
            if not held or held.qty - open_sells < req.qty:
                return "sell exceeds position (short selling not allowed)"
        return None

    def _fill(self, o: Order, price: Decimal | None = None) -> None:
        q = self.quotes[o.symbol]
        remaining = o.qty - o.filled_qty
        if self.max_fill_qty_per_step is not None:
            remaining = min(remaining, self.max_fill_qty_per_step)
        if remaining <= 0:
            return
        if price is None:
            base = q.ask if o.side is Side.BUY else q.bid
            price = base * (1 + self.slippage) if o.side is Side.BUY else base * (1 - self.slippage)
        price = money(price)
        fee = self.fee_model.fees(o.side, remaining, price)
        notional = money(remaining * price)
        if o.side is Side.BUY:
            if notional + fee > self.cash:
                o.status = OrderStatus.REJECTED if o.filled_qty == 0 else OrderStatus.CANCELED
                o.reject_reason = "insufficient buying power at fill"
                return
            self.cash -= notional + fee
            pos = self.positions.get(o.symbol)
            if pos:
                new_qty = pos.qty + remaining
                avg = (pos.avg_entry_price * pos.qty + price * remaining) / new_qty
                self.positions[o.symbol] = Position(o.symbol, new_qty, money(avg), price)
            else:
                self.positions[o.symbol] = Position(o.symbol, remaining, price, price)
        else:
            pos = self.positions[o.symbol]
            self.cash += notional - fee
            left = to_qty(pos.qty - remaining)
            if left <= 0:
                del self.positions[o.symbol]
            else:
                self.positions[o.symbol] = replace(pos, qty=left, current_price=price)
        prev_notional = (o.filled_avg_price or Decimal(0)) * o.filled_qty
        o.filled_qty += remaining
        o.filled_avg_price = money((prev_notional + price * remaining) / o.filled_qty)
        o.fees += fee
        o.status = OrderStatus.FILLED if o.filled_qty >= o.qty else OrderStatus.PARTIALLY_FILLED
        o.updated_at = self.clock()
        if o.side is Side.BUY and o.client_order_id in self._pending_sl_tp:
            self._sync_children(o)
        if o.side is Side.SELL and o.status is OrderStatus.FILLED and o.parent_client_order_id:
            self._cancel_siblings(o)

    def _sync_children(self, parent: Order) -> None:
        stop, tp = self._pending_sl_tp[parent.client_order_id]
        for suffix, kind, price in (("sl", OrderType.STOP, stop), ("tp", OrderType.LIMIT, tp)):
            if price is None:
                continue
            cid = f"{parent.client_order_id}-{suffix}"
            child = self.orders.get(cid)
            if child is None:
                self._seq += 1
                now = self.clock()
                child = Order(
                    client_order_id=cid, symbol=parent.symbol, side=Side.SELL, qty=parent.filled_qty,
                    order_type=kind, status=OrderStatus.ACCEPTED, broker_order_id=f"PB-{self._seq:08d}",
                    parent_client_order_id=parent.client_order_id,
                    stop_price=price if kind is OrderType.STOP else None,
                    limit_price=price if kind is OrderType.LIMIT else None,
                    created_at=now, updated_at=now,
                )
                self.orders[cid] = child
            else:
                child.qty = parent.filled_qty

    def _cancel_siblings(self, filled_child: Order) -> None:
        for o in self.orders.values():
            if (o.parent_client_order_id == filled_child.parent_client_order_id
                    and o is not filled_child and o.status.is_open):
                o.status = OrderStatus.CANCELED
                o.updated_at = self.clock()

    def _trigger_children(self, bar: Bar) -> None:
        open_px, high, low = (Decimal(str(v)) for v in (bar.open, bar.high, bar.low))
        children = [o for o in self.orders.values()
                    if o.symbol == bar.symbol and o.parent_client_order_id and o.status.is_open]
        # Conservative: if a bar spans both stop and target, assume the stop hit first.
        for o in sorted(children, key=lambda c: 0 if c.order_type is OrderType.STOP else 1):
            if not o.status.is_open:
                continue
            if o.order_type is OrderType.STOP and low <= o.stop_price:
                fill = min(o.stop_price, open_px) * (1 - self.slippage)  # gaps fill worse
                self._fill(o, fill)
            elif o.order_type is OrderType.LIMIT and high >= o.limit_price:
                self._fill(o, max(o.limit_price, open_px))

    def process(self) -> None:
        """Advance resting market orders (partial fills continue on later steps)."""
        if not self.market_open_fn(self.clock()):
            return
        for o in list(self.orders.values()):
            if (o.order_type is OrderType.MARKET and o.status is OrderStatus.PARTIALLY_FILLED
                    and o.symbol in self.quotes):
                self._fill(o)

    @property
    def now(self) -> datetime:
        return self.clock()


__all__ = ["PaperBroker", "FeeModel", "DEFAULT_CAPS", "BrokerTimeout"]
