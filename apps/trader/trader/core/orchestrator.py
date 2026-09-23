"""The trading loop.

    DATA -> AGENTS -> SCANNER -> DEBATE -> DECISION (untrusted JSON) -> SCHEMA
         -> RISK ENGINE (signs) -> EXECUTION ENGINE -> BROKER -> POSITIONS -> CYCLE

Every step fails closed: if anything needed for a decision is missing, stale
or inconsistent, the outcome is NO_TRADE (and, for integrity problems, the
kill switch trips).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from trader.agents.analysis import (
    FundamentalAgent, MarketDataAgent, NewsAgent, RegimeAgent, StrategyParams, TechnicalAgent,
)
from trader.agents.decision import DecisionAgent, OpportunityScanner
from trader.audit.audit_log import AuditLog, dumps
from trader.broker.base import BrokerError, BrokerInterface
from trader.broker.market_hours import NY
from trader.core.cycle import CycleError, CycleManager
from trader.core.ledger import LedgerSnapshot, compute_ledger
from trader.core.models import Action, AgentReport, CycleStatus, Decision, OrderStatus, money
from trader.core.positions import PositionManager
from trader.data.providers import MarketDataProvider, ProviderRegistry
from trader.database.db import Database, iso
from trader.execution.engine import ExecutionEngine, ExecutionRefused
from trader.risk.engine import RiskContext, RiskEngine
from trader.risk.kill_switch import KillReason, KillSwitch
from trader.risk.profiles import RiskProfile
from trader.security.approval import ApprovalSigner
from trader.security.schema import SchemaError, parse_decision

MAX_CONSECUTIVE_INVALID = 3


class StateError(Exception):
    pass


@dataclass
class TickResult:
    outcome: str
    details: list = field(default_factory=list)


class TradingSystem:
    def __init__(self, *, db: Database, broker: BrokerInterface, market_data: MarketDataProvider,
                 clock, profile: RiskProfile, expected_account_id: str, universe: tuple, benchmark: str,
                 allocation: Decimal, target: Decimal, registry: ProviderRegistry | None = None,
                 params: StrategyParams = StrategyParams(), llm=None, top_k: int = 3):
        self.db, self.broker, self.clock, self.profile = db, broker, clock, profile
        self.expected_account_id = expected_account_id
        self.universe, self.benchmark, self.top_k = universe, benchmark, top_k
        self.audit = AuditLog(db, clock)
        self.kill = KillSwitch(db, self.audit)
        signer = ApprovalSigner()
        self.risk = RiskEngine(signer)
        self.execution = ExecutionEngine(db, broker, signer, self.kill, self.audit, expected_account_id)
        self.cycles = CycleManager(db, self.audit, allocation, target)
        self.positions = PositionManager(db, self.audit)
        reg = registry or ProviderRegistry()
        self.market_agent = MarketDataAgent(market_data, min_bars=params.min_bars)
        self.technical = TechnicalAgent(params)
        self.regime = RegimeAgent()
        self.news = NewsAgent(reg.get("news"), reg.get("sec"))
        self.fundamental = FundamentalAgent(reg.get("fundamental"))
        self.scanner = OpportunityScanner()
        self.decider = DecisionAgent(llm=llm)
        self._invalid_streak = 0

    # --- lifecycle -----------------------------------------------------------------------------
    def startup(self) -> str | None:
        """Restart recovery: never trust local state; rebuild it from the broker."""
        self.db.set_state("risk_profile", self.profile.name.value, self.clock())
        try:
            account = self.broker.get_account()
        except BrokerError as exc:
            self.kill.trip(KillReason.BROKER_CONNECTION, f"startup: {exc!r}")
            return None
        if account.account_id != self.expected_account_id:
            self.kill.trip(KillReason.SECURITY_ANOMALY, f"startup: account {account.account_id}")
            return None
        cur = self.cycles.current()
        if cur is None:
            try:
                return self.cycles.start_new(account.cash)
            except CycleError as exc:
                self.audit.record("orchestrator", "NO_CYCLE", reason=str(exc))
                return None
        session = cur["session_id"]
        try:
            self.execution.sync(session)
            ledger, marks = self._ledger_and_marks(session)
            self._verify_state(session, ledger, account)
        except (BrokerError, StateError) as exc:
            self.audit.error("recovery", repr(exc))
            return session
        self.positions.refresh(session, ledger)
        self.audit.record("recovery", "RECONCILED", session, cash=ledger.cash,
                          positions={s: p.qty for s, p in ledger.positions.items()})
        return session

    # --- one iteration ---------------------------------------------------------------------------
    def manage_only(self) -> TickResult:
        """Sync, reconcile, protect and run cycle transitions without looking for new entries."""
        return self.tick(allow_entries=False)

    def tick(self, allow_entries: bool = True) -> TickResult:
        now = self.clock()
        cur = self.cycles.current()
        if cur is None:
            session = self.startup()
            if session is None:
                return TickResult("NO_CYCLE")
            cur = self.cycles.current()
        session = cur["session_id"]

        try:
            account = self.broker.get_account()
            market = self.broker.get_market_status()
            self.execution.sync(session)
            ledger, marks = self._ledger_and_marks(session)
            self._verify_state(session, ledger, account)
        except BrokerError as exc:
            self.kill.trip(KillReason.BROKER_CONNECTION, repr(exc))
            return TickResult("NO_TRADE", ["broker unavailable"])
        except StateError as exc:
            return TickResult("NO_TRADE", [str(exc)])

        self.positions.refresh(session, ledger)
        equity = ledger.equity(marks)
        self._record_metrics(session, ledger, marks, equity)
        status = self.cycles.evaluate(session, equity)

        if status is CycleStatus.COMPLETING:
            return self._liquidate(session, ledger, account, market, marks)
        if status is CycleStatus.FAILED:
            return TickResult("CYCLE_FAILED")
        self._ensure_protection(session, ledger, account, market, marks)
        if self.kill.engaged:
            return TickResult("KILL_SWITCH", [self.kill.status().get("reason", "")])
        if not market.is_open:
            return TickResult("WAIT", ["market closed"])
        if not allow_entries:
            return TickResult("MANAGED")
        sod = self._start_of_day_equity(session, equity, now)
        if sod > 0 and (sod - equity) / sod >= self.profile.daily_loss_limit_pct:
            self.kill.trip(KillReason.DAILY_LOSS_LIMIT, f"equity {equity} vs start of day {sod}")
            return TickResult("KILL_SWITCH", ["daily loss limit"])
        if len(ledger.positions) >= self.profile.max_open_positions:
            return TickResult("HOLD", ["max open positions"])
        return self._seek_entries(session, ledger, marks, account, market, now, sod)

    # --- entries ---------------------------------------------------------------------------------
    def _seek_entries(self, session, ledger, marks, account, market, now, sod) -> TickResult:
        regime_data = self.market_agent.collect(self.benchmark, now)
        regime = self.regime.analyze(regime_data)
        self._signal(regime)
        reports = []
        for sym in self.universe:
            if sym in ledger.positions:
                continue
            rep = self.technical.analyze(self.market_agent.collect(sym, now))
            self._signal(rep)
            reports.append(rep)
        candidates = self.scanner.rank(reports, self.top_k)
        if not candidates:
            return TickResult("NO_TRADE", ["no opportunity met the bar"])

        results = []
        for cand in candidates:
            try:
                quote = self.broker.get_quote(cand.symbol)
            except BrokerError:
                quote = None
            news = self.news.analyze(cand.symbol, now)
            self._signal(news)
            equity = ledger.equity(marks)
            raw, transcript = self.decider.decide(cand, news, regime, quote, now, equity)
            allowed = set(cand.technical.data_sources) | set(news.data_sources) | set(regime.data_sources)
            decision_id, decision = self._validate(session, cand.symbol, raw, transcript, allowed)
            if decision is None:
                results.append(f"{cand.symbol}: invalid decision")
                continue
            if decision.action is not Action.BUY:
                results.append(f"{cand.symbol}: {decision.action.value} ({decision.reason[:80]})")
                continue
            if decision.symbol != cand.symbol or quote is None:
                self.kill.trip(KillReason.MODEL_HALLUCINATION, f"decision for {decision.symbol} vs {cand.symbol}")
                return TickResult("KILL_SWITCH", results)
            ctx = self._risk_context(session, ledger, marks, account, market, quote, now, sod)
            cid = f"{session}-D{decision_id:08d}"
            verdict = self.risk.evaluate(decision, ctx, cid)
            self._record_risk(session, decision_id, decision.symbol, verdict)
            if verdict.trip:
                self.kill.trip(*verdict.trip)
            if not verdict.approved:
                results.append(f"{cand.symbol}: REJECTED by risk ({', '.join(c[0] for c in verdict.failed)})")
                continue
            try:
                order = self.execution.execute(verdict.approval, decision_id)
            except ExecutionRefused as exc:
                results.append(f"{cand.symbol}: execution refused ({exc})")
                continue
            if order is not None and order.status is not OrderStatus.REJECTED:
                self.positions.open_trade(session, cid, decision.symbol, decision.stop_loss, decision.take_profit,
                                          decision.reason, ",".join(regime.details.get("labels", [])),
                                          ",".join(cand.setups))
                results.append(f"{cand.symbol}: BUY {order.filled_qty}/{order.qty} @ {order.filled_avg_price}")
                account = self.broker.get_account()
                ledger, marks = self._ledger_and_marks(session)
                if len(ledger.positions) >= self.profile.max_open_positions:
                    break
            else:
                results.append(f"{cand.symbol}: broker rejected ({order.reject_reason if order else 'unknown'})")
        return TickResult("EVALUATED", results)

    def _validate(self, session, symbol, raw, transcript, allowed_sources: set) -> tuple:
        raw_text = raw if isinstance(raw, str) else json.dumps(raw)
        try:
            decision = parse_decision(raw)
            invented = set(decision.data_sources) - allowed_sources
            if invented:
                # A decision citing sources no agent supplied is treated as hallucinated.
                self.kill.trip(KillReason.MODEL_HALLUCINATION, f"uncited sources {sorted(invented)}")
                raise SchemaError(f"cites unknown data sources {sorted(invented)}")
            err = None
            self._invalid_streak = 0
        except SchemaError as exc:
            decision, err = None, str(exc)
            self._invalid_streak += 1
            if self._invalid_streak >= MAX_CONSECUTIVE_INVALID:
                self.kill.trip(KillReason.AGENT_MALFUNCTION, f"{self._invalid_streak} invalid decisions in a row")
        decision_id = self.db.execute(
            "INSERT INTO agent_decisions(ts, session_id, symbol, action, raw_json, schema_valid, schema_error) "
            "VALUES (?,?,?,?,?,?,?)",
            (iso(self.clock()), session, symbol, decision.action.value if decision else "INVALID",
             dumps({"decision": raw_text, "debate": transcript}), int(decision is not None), err),
        )
        self.audit.record("decision", "DECISION", session, symbol=symbol,
                          action=decision.action.value if decision else "INVALID",
                          confidence=decision.confidence if decision else None, error=err)
        return decision_id, decision

    # --- exits -----------------------------------------------------------------------------------
    def _close(self, session, symbol, reason, ledger, account, market, marks) -> str:
        decision = Decision(Action.CLOSE, symbol, "FLAT", None, None, None, None, None, None, 1.0, "now",
                            reason, (), self.clock())
        decision_id = self.db.execute(
            "INSERT INTO agent_decisions(ts, session_id, symbol, action, raw_json, schema_valid) VALUES (?,?,?,?,?,1)",
            (iso(self.clock()), session, symbol, "CLOSE", dumps({"reason": reason})),
        )
        ctx = self._risk_context(session, ledger, marks, account, market, None, self.clock(), Decimal(0))
        verdict = self.risk.evaluate(decision, ctx, f"{session}-C{decision_id:08d}")
        self._record_risk(session, decision_id, symbol, verdict)
        if not verdict.approved:
            return f"{symbol}: close rejected ({', '.join(c[0] for c in verdict.failed)})"
        try:
            order = self.execution.execute(verdict.approval, decision_id)
        except ExecutionRefused as exc:
            return f"{symbol}: close refused ({exc})"
        return f"{symbol}: CLOSE {order.status.value if order else 'unknown'}"

    def _liquidate(self, session, ledger, account, market, marks) -> TickResult:
        open_entries = self.db.query(
            "SELECT client_order_id FROM orders WHERE session_id = ? AND side = 'BUY' AND status IN "
            "('PENDING_SUBMIT','ACCEPTED','PARTIALLY_FILLED')", (session,))
        for r in open_entries:  # stop adding exposure first
            self.broker.cancel_order(r["client_order_id"])
        if not ledger.positions:
            open_any = self.db.one("SELECT COUNT(*) n FROM orders WHERE session_id = ? AND parent_client_order_id "
                                   "IS NULL AND status IN ('PENDING_SUBMIT','ACCEPTED','PARTIALLY_FILLED')",
                                   (session,))["n"]
            if open_any:
                return TickResult("COMPLETING", ["waiting for open orders to settle"])
            final = ledger.cash
            self.cycles.complete(session, final)
            self.audit.record("cycle", "AUDIT_RECORD", session, final_equity=final, fees=ledger.fees,
                              trades=self.db.one("SELECT COUNT(*) n FROM trades WHERE session_id = ?", (session,))["n"])
            try:
                new = self.cycles.start_new(self.broker.get_account().cash)
            except CycleError as exc:
                return TickResult("CYCLE_COMPLETED", [f"next cycle not started: {exc}"])
            return TickResult("CYCLE_COMPLETED", [f"final equity {final}", f"new cycle {new} with $100"])
        if not market.is_open:
            return TickResult("COMPLETING", ["market closed; will liquidate at open"])
        notes = [self._close(session, s, "cycle target reached", ledger, account, market, marks)
                 for s in list(ledger.positions)]
        return TickResult("COMPLETING", notes)

    def _ensure_protection(self, session, ledger, account, market, marks) -> None:
        for sym in ledger.positions:
            stop = self.db.one(
                "SELECT 1 FROM orders WHERE session_id = ? AND symbol = ? AND order_type = 'STOP' AND side = 'SELL' "
                "AND status IN ('ACCEPTED','PARTIALLY_FILLED')", (session, sym))
            exiting = self.db.one(
                "SELECT 1 FROM orders WHERE session_id = ? AND symbol = ? AND side = 'SELL' AND "
                "parent_client_order_id IS NULL AND status IN ('PENDING_SUBMIT','ACCEPTED','PARTIALLY_FILLED')",
                (session, sym))
            if not stop and not exiting:
                self.kill.trip(KillReason.UNPROTECTED_POSITION, f"{sym} has no active stop")
                if market.is_open:
                    self._close(session, sym, "unprotected position", ledger, account, market, marks)

    # --- state -----------------------------------------------------------------------------------
    def _ledger_and_marks(self, session) -> tuple:
        cyc = self.db.one("SELECT allocated_capital FROM trading_cycles WHERE session_id = ?", (session,))
        ledger = compute_ledger(self.db, session, Decimal(cyc["allocated_capital"]))
        marks = {}
        for sym in ledger.positions:
            try:
                marks[sym] = self.broker.get_quote(sym).last
            except BrokerError as exc:
                raise StateError(f"cannot value {sym}: {exc}") from exc
        return ledger, marks

    def _verify_state(self, session, ledger: LedgerSnapshot, account) -> None:
        if account.account_id != self.expected_account_id:
            self.kill.trip(KillReason.SECURITY_ANOMALY, f"account {account.account_id}")
            raise StateError("account mismatch")
        broker_pos = {p.symbol: p.qty for p in self.broker.get_positions()}
        ledger_pos = {s: p.qty for s, p in ledger.positions.items()}
        if broker_pos != ledger_pos:
            self.kill.trip(KillReason.UNEXPECTED_POSITION, f"broker {broker_pos} vs ledger {ledger_pos}")
            raise StateError("positions do not reconcile")
        known = {r["client_order_id"] for r in self.db.query("SELECT client_order_id FROM orders")}
        foreign = [o.client_order_id for o in self.broker.get_orders(open_only=True) if o.client_order_id not in known]
        if foreign:
            self.kill.trip(KillReason.SECURITY_ANOMALY, f"orders not placed by this system: {foreign}")
            raise StateError("foreign open orders")
        if ledger.cash > account.cash:
            self.kill.trip(KillReason.UNEXPECTED_BALANCE, f"ledger {ledger.cash} > broker {account.cash}")
            raise StateError("cash does not reconcile")

    def _risk_context(self, session, ledger, marks, account, market, quote, now, sod) -> RiskContext:
        cyc = self.db.one("SELECT * FROM trading_cycles WHERE session_id = ?", (session,))
        open_syms = frozenset(r["symbol"] for r in self.db.query(
            "SELECT DISTINCT symbol FROM orders WHERE session_id = ? AND parent_client_order_id IS NULL AND "
            "status IN ('PENDING_SUBMIT','ACCEPTED','PARTIALLY_FILLED')", (session,)))
        return RiskContext(
            now=now, session_id=session, cycle_session_id=cyc["session_id"],
            cycle_status=CycleStatus(cyc["status"]), cycle_allocated=Decimal(cyc["allocated_capital"]),
            cycle_max_lifetime=Decimal(cyc["max_lifetime_capital"]), ledger=ledger, marks=marks,
            start_of_day_equity=sod, entries_today=self._entries_today(session, now), open_order_symbols=open_syms,
            expected_account_id=self.expected_account_id, account=account, capabilities=self.broker.capabilities,
            market=market, quote=quote, profile=self.profile, kill_switch_engaged=self.kill.engaged,
        )

    def _entries_today(self, session, now) -> int:
        day = now.astimezone(NY).date()
        rows = self.db.query("SELECT created_at FROM orders WHERE session_id = ? AND side = 'BUY' AND "
                             "parent_client_order_id IS NULL AND status NOT IN ('REJECTED','UNSENT')", (session,))
        return sum(1 for r in rows if datetime.fromisoformat(r["created_at"]).astimezone(NY).date() == day)

    def _start_of_day_equity(self, session, equity, now) -> Decimal:
        key = f"sod:{session}:{now.astimezone(NY).date().isoformat()}"
        val = self.db.get_state(key)
        if val is None:
            self.db.set_state(key, str(equity), now)
            return equity
        return Decimal(val)

    # --- records ---------------------------------------------------------------------------------
    def _signal(self, r: AgentReport) -> None:
        self.db.execute(
            "INSERT INTO signals(ts, agent, symbol, signal, confidence, reasoning, risk, data_sources) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (iso(self.clock()), r.agent, r.symbol, r.signal, r.confidence, r.reasoning, r.risk,
             json.dumps(list(r.data_sources))),
        )

    def _record_risk(self, session, decision_id, symbol, verdict) -> None:
        self.db.execute(
            "INSERT INTO risk_decisions(ts, session_id, decision_id, symbol, approved, checks, approved_qty) "
            "VALUES (?,?,?,?,?,?,?)",
            (iso(self.clock()), session, decision_id, symbol, int(verdict.approved), dumps(verdict.checks),
             None if verdict.qty is None else str(verdict.qty)),
        )
        self.audit.record("risk", "APPROVED" if verdict.approved else "REJECTED", session, symbol=symbol,
                          decision_id=decision_id, failed=[c[0] for c in verdict.failed], qty=verdict.qty)

    def _record_metrics(self, session, ledger, marks, equity) -> None:
        peak_row = self.db.one("SELECT MAX(CAST(equity AS REAL)) p FROM performance_metrics WHERE session_id = ?",
                               (session,))
        peak = max(Decimal(str(peak_row["p"])) if peak_row["p"] is not None else equity, equity)
        dd = (peak - equity) / peak if peak > 0 else Decimal(0)
        self.db.execute(
            "INSERT INTO performance_metrics(ts, session_id, equity, cash, exposure, drawdown) VALUES (?,?,?,?,?,?)",
            (iso(self.clock()), session, str(equity), str(ledger.cash), str(ledger.exposure(marks)),
             str(money(dd * 100))),
        )
