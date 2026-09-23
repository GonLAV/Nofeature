"""Deterministic Risk Engine — the hard security boundary between AI and money.

No model, no randomness, no network. It receives a schema-validated Decision
plus facts gathered from the broker and the ledger, runs every check, and
either returns a signed approval for a concrete order or rejects. Any check
that cannot be evaluated counts as failed (fail closed).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import ROUND_DOWN, Decimal

from trader.core.ledger import LedgerSnapshot
from trader.core.models import (
    Account, Action, BrokerCapabilities, CycleStatus, Decision, MarketStatus, OrderRequest, Quote,
    Side, money, qty as to_qty,
)
from trader.risk.kill_switch import KillReason
from trader.risk.profiles import RiskProfile
from trader.security.approval import ApprovalSigner, RiskApproval

# Estimated execution costs used for sizing, deliberately pessimistic.
SLIPPAGE_BUFFER = Decimal("0.002")
CASH_BUFFER = Decimal("0.99")
MAX_DECISION_AGE = timedelta(minutes=5)
ENTRY_DEVIATION_REJECT = Decimal("0.03")
ENTRY_DEVIATION_HALLUCINATION = Decimal("0.10")


@dataclass(frozen=True)
class RiskContext:
    now: datetime
    session_id: str
    cycle_session_id: str
    cycle_status: CycleStatus
    cycle_allocated: Decimal
    cycle_max_lifetime: Decimal
    ledger: LedgerSnapshot
    marks: dict  # symbol -> Decimal for every ledger position
    start_of_day_equity: Decimal
    entries_today: int
    open_order_symbols: frozenset
    expected_account_id: str
    account: Account
    capabilities: BrokerCapabilities
    market: MarketStatus
    quote: Quote | None
    profile: RiskProfile
    kill_switch_engaged: bool


@dataclass
class RiskResult:
    approved: bool
    checks: list = field(default_factory=list)  # (name, passed, detail)
    approval: RiskApproval | None = None
    qty: Decimal | None = None
    trip: tuple | None = None  # (KillReason, detail) the caller must act on

    @property
    def failed(self) -> list:
        return [c for c in self.checks if not c[1]]


class RiskEngine:
    def __init__(self, signer: ApprovalSigner):
        self._signer = signer

    def evaluate(self, decision: Decision, ctx: RiskContext, client_order_id: str) -> RiskResult:
        res = RiskResult(approved=False)
        try:
            if decision.action is Action.BUY:
                self._check_entry(decision, ctx, client_order_id, res)
            elif decision.action in (Action.SELL, Action.CLOSE):
                self._check_exit(decision, ctx, client_order_id, res)
            else:
                res.checks.append(("action_requires_order", False, f"{decision.action.value} places no order"))
        except Exception as exc:  # any surprise inside the engine = reject
            res.checks.append(("risk_engine_error", False, repr(exc)))
            res.approval, res.approved = None, False
        return res

    # --- helpers --------------------------------------------------------------------------
    @staticmethod
    def _check(res: RiskResult, name: str, ok: bool, detail: str = "") -> bool:
        res.checks.append((name, bool(ok), detail))
        return bool(ok)

    def _common(self, ctx: RiskContext, res: RiskResult, *, reduce_only: bool) -> bool:
        ok = True
        ok &= self._check(res, "session_matches_cycle", ctx.session_id == ctx.cycle_session_id,
                          f"{ctx.session_id} vs {ctx.cycle_session_id}")
        ok &= self._check(res, "account_isolated", ctx.account.account_id == ctx.expected_account_id,
                          f"broker account {ctx.account.account_id}")
        if ctx.account.account_id != ctx.expected_account_id:
            res.trip = (KillReason.SECURITY_ANOMALY, "broker returned an unexpected account id")
        ok &= self._check(res, "broker_isolation_capability", ctx.capabilities.isolated_account,
                          f"isolated_account={ctx.capabilities.isolated_account}")
        ok &= self._check(res, "no_margin_live", not (ctx.capabilities.is_live and ctx.account.margin_enabled),
                          f"live={ctx.capabilities.is_live} margin_enabled={ctx.account.margin_enabled}")
        ok &= self._check(res, "market_open", ctx.market.is_open)
        # The cycle's capital is fixed forever: allocation == lifetime max == configured amount.
        ok &= self._check(res, "allocation_immutable", ctx.cycle_allocated == ctx.cycle_max_lifetime
                          == ctx.ledger.allocated, f"{ctx.cycle_allocated}/{ctx.cycle_max_lifetime}")
        # Ledger cash must actually exist at the broker; otherwise money went missing.
        cash_ok = ctx.ledger.cash <= ctx.account.cash
        ok &= self._check(res, "ledger_cash_backed_by_broker", cash_ok,
                          f"ledger {ctx.ledger.cash} vs broker {ctx.account.cash}")
        if not cash_ok:
            res.trip = (KillReason.UNEXPECTED_BALANCE, f"ledger {ctx.ledger.cash} > broker {ctx.account.cash}")
        if not reduce_only:
            ok &= self._check(res, "kill_switch_clear", not ctx.kill_switch_engaged)
        return ok

    # --- entries --------------------------------------------------------------------------
    def _check_entry(self, d: Decision, ctx: RiskContext, cid: str, res: RiskResult) -> None:
        p = ctx.profile
        ok = self._common(ctx, res, reduce_only=False)
        ok &= self._check(res, "cycle_accepts_entries", ctx.cycle_status is CycleStatus.ACTIVE,
                          ctx.cycle_status.value)
        ok &= self._check(res, "decision_fresh", ctx.now - d.timestamp <= MAX_DECISION_AGE,
                          f"age {ctx.now - d.timestamp}")
        q = ctx.quote
        if not self._check(res, "quote_available", q is not None and q.symbol == d.symbol):
            return
        ok &= self._check(res, "quote_fresh", ctx.now - q.ts <= timedelta(seconds=p.max_quote_age_seconds),
                          f"quote age {ctx.now - q.ts}")
        sane = q.bid > 0 and q.ask >= q.bid
        if not self._check(res, "quote_sane", sane, f"bid {q.bid} ask {q.ask}"):
            return
        ask = q.ask
        ok &= self._check(res, "spread", q.spread_bps <= p.max_spread_bps, f"{q.spread_bps:.1f}bps")
        ok &= self._check(res, "min_price", ask >= p.min_price, str(ask))
        ok &= self._check(res, "liquidity", q.avg_daily_volume >= p.min_avg_daily_volume,
                          f"ADV {q.avg_daily_volume:,.0f}")
        dev = abs(d.entry - ask) / ask
        ok &= self._check(res, "entry_matches_market", dev <= ENTRY_DEVIATION_REJECT, f"deviation {dev:.2%}")
        if dev > ENTRY_DEVIATION_HALLUCINATION:
            res.trip = (KillReason.MODEL_HALLUCINATION, f"decision entry {d.entry} vs market {ask}")
        ok &= self._check(res, "confidence", d.confidence >= p.min_confidence, f"{d.confidence:.2f}")

        stop, tp = d.stop_loss, d.take_profit
        fill_est = ask * (1 + SLIPPAGE_BUFFER)
        if not self._check(res, "stop_below_price", stop < fill_est):
            return
        stop_dist = (fill_est - stop) / fill_est
        ok &= self._check(res, "stop_distance", stop_dist <= p.max_stop_distance_pct, f"{stop_dist:.2%}")
        rr = (tp - fill_est) / (fill_est - stop)
        ok &= self._check(res, "reward_risk", rr >= p.min_reward_risk, f"{rr:.2f}")

        ok &= self._check(res, "no_existing_position", d.symbol not in ctx.ledger.positions)
        dup = d.symbol in ctx.open_order_symbols
        ok &= self._check(res, "no_duplicate_open_order", not dup)
        ok &= self._check(res, "max_open_positions", len(ctx.ledger.positions) < p.max_open_positions,
                          str(len(ctx.ledger.positions)))
        ok &= self._check(res, "trade_frequency", ctx.entries_today < p.max_trades_per_day, str(ctx.entries_today))

        equity = ctx.ledger.equity(ctx.marks)
        sod = ctx.start_of_day_equity
        day_loss = (sod - equity) / sod if sod > 0 else Decimal(1)
        loss_ok = day_loss < p.daily_loss_limit_pct
        ok &= self._check(res, "daily_loss_limit", loss_ok, f"{day_loss:.2%}")
        if not loss_ok:
            res.trip = (KillReason.DAILY_LOSS_LIMIT, f"daily loss {day_loss:.2%}")
        if not ok:
            return

        # --- sizing: the smallest of every limit ------------------------------------------
        spendable = min(ctx.ledger.cash, ctx.account.cash, ctx.account.buying_power) * CASH_BUFFER
        exposure = ctx.ledger.exposure(ctx.marks)
        limits = {
            "decision": d.position_size,
            "risk_budget": equity * p.risk_per_trade_pct / (fill_est - stop),
            "max_position": equity * p.max_position_pct / fill_est,
            "max_exposure": max(equity * p.max_exposure_pct - exposure, Decimal(0)) / fill_est,
            "cash": max(spendable, Decimal(0)) / fill_est,
        }
        size = to_qty(min(limits.values()))
        whole_only = not (ctx.capabilities.supports_fractional and ctx.capabilities.supports_fractional_bracket)
        if whole_only:
            size = size.to_integral_value(rounding=ROUND_DOWN)
        binding = min(limits, key=limits.get)
        self._check(res, "sizing", size > 0,
                    f"qty {size} bound by {binding}" + (" (whole shares: broker cannot protect fractional)"
                                                        if whole_only else ""))
        if size <= 0:
            return
        notional = size * fill_est
        if not self._check(res, "min_order_notional", notional >= ctx.capabilities.min_order_notional,
                           str(money(notional))):
            return
        # Hard capital boundary: the order can never cost more than the cycle owns.
        if not self._check(res, "capital_boundary", notional <= ctx.ledger.cash and notional <= ctx.account.cash,
                           f"cost {money(notional)} vs cycle cash {ctx.ledger.cash}"):
            return
        # Protection: a position we cannot protect with a broker-side stop is never opened.
        if not self._check(res, "stop_protection_available", ctx.capabilities.supports_bracket_orders):
            return

        req = OrderRequest(
            client_order_id=cid, session_id=ctx.session_id, symbol=d.symbol, side=Side.BUY, qty=size,
            stop_loss=money(stop), take_profit=money(tp),
        )
        res.qty = size
        res.approval = self._signer.sign(req, ctx.now)
        res.approved = True

    # --- exits ----------------------------------------------------------------------------
    def _check_exit(self, d: Decision, ctx: RiskContext, cid: str, res: RiskResult) -> None:
        ok = self._common(ctx, res, reduce_only=True)
        pos = ctx.ledger.positions.get(d.symbol)
        ok &= self._check(res, "position_exists_in_cycle", pos is not None and pos.qty > 0)
        if not ok:
            return
        req = OrderRequest(
            client_order_id=cid, session_id=ctx.session_id, symbol=d.symbol, side=Side.SELL,
            qty=pos.qty, reduce_only=True,
        )
        res.qty = pos.qty
        res.approval = self._signer.sign(req, ctx.now)
        res.approved = True
