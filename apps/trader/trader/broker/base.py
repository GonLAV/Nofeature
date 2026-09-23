"""Broker abstraction. Agents never see this; only the Execution Engine and
reconciliation talk to a broker, and only through this interface."""
from __future__ import annotations

from abc import ABC, abstractmethod

from trader.core.models import (
    Account, BrokerCapabilities, MarketStatus, Order, OrderRequest, Position, Quote,
)


class BrokerError(Exception):
    pass


class BrokerTimeout(BrokerError):
    """The call may or may not have taken effect. Callers must reconcile, never blindly retry."""


class BrokerRejected(BrokerError):
    pass


class BrokerInterface(ABC):
    @property
    @abstractmethod
    def account_id(self) -> str: ...

    @property
    @abstractmethod
    def capabilities(self) -> BrokerCapabilities: ...

    @abstractmethod
    def get_account(self) -> Account: ...

    @abstractmethod
    def get_positions(self) -> list[Position]: ...

    @abstractmethod
    def get_orders(self, open_only: bool = False) -> list[Order]: ...

    @abstractmethod
    def get_order(self, client_order_id: str) -> Order | None: ...

    @abstractmethod
    def get_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    def submit_order(self, request: OrderRequest) -> Order: ...

    @abstractmethod
    def cancel_order(self, client_order_id: str) -> None: ...

    @abstractmethod
    def close_position(self, symbol: str, client_order_id: str) -> Order: ...

    @abstractmethod
    def get_buying_power(self): ...

    @abstractmethod
    def get_market_status(self) -> MarketStatus: ...
