# Trader — multi-agent trading with a hard $100 boundary

An autonomous multi-agent stock-trading system. Its capital is fixed at an
isolated **$100 per cycle**, and each cycle aims for **$1,000**. When a cycle
reaches $1,000 the system closes every position, writes an audit record and
starts a new cycle with exactly $100 again. There is never an auto-recharge.

AI agents analyse the market and propose trades. A **deterministic Risk
Engine** is the only component that can approve an order, and the **Execution
Engine** is the only component that can talk to the broker. An LLM can never
place an order.

> **Status:** Phases 1–9 are built and tested against the paper broker.
> **LIVE trading is disabled.** No live broker adapter exists yet, and the
> config loader refuses `TRADER_MODE=LIVE`. See [Roadmap](#roadmap).

> **Reality check:** there is no guarantee of profit, and `NO_TRADE` is a
> normal, valid outcome. On synthetic data the default rules lose money in
> some runs, which is expected because they have not yet been shown to have an
> edge. With $100, the binding limits are whole-share sizing, the need for a
> broker-side stop on every position, fees and spread, more than the model's
> quality. See [Why $100 is hard](#why-100-is-hard).

## Quick start

```bash
cd apps/trader
python3 -m pip install pytest      # the runtime itself is stdlib-only
python3 -m pytest -q               # 101 tests: unit, integration, broker mock, risk, security, chaos

python3 -m trader backtest --synthetic           # full system on labelled synthetic data
python3 -m trader walk-forward --synthetic       # parameter choice on train, report on unseen test
python3 -m trader backtest --csv-dir ./data      # your own data: data/SYMBOL.csv (date,open,high,low,close,volume)
python3 -m trader paper-replay --synthetic       # persisted run the dashboard can show
python3 -m trader status                         # dashboard snapshot as JSON
python3 -m trader dashboard                      # http://127.0.0.1:8050 (read-only)
python3 -m trader kill --reason "investigating"  # engage the kill switch
python3 -m trader reset --operator you --note "reviewed"  # only a human resets it
```

Docker: `docker build -t trader . && docker run --rm -v trader-data:/data trader backtest --synthetic`
(the image runs the test suite during the build and runs as a non-root user).

Configuration is read from environment variables only. See `.env.example`.

## How a decision flows

```
Market Data Agent ─┐
Technical Agent  ──┤
News Agent (SEC/RSS)┤→ Opportunity Scanner → Debate (Bull / Bear / Risk / Data)
Fundamental Agent ─┤                          → Decision Agent → untrusted JSON
Regime Agent ──────┘
      → strict schema validation (+ citation check: only sources agents supplied)
      → Risk Engine (deterministic; ~30 checks; signs an HMAC approval)
      → Execution Engine (verifies signature; write-ahead DB row; idempotent client id)
      → Broker (bracket order: entry + stop-loss + take-profit)
      → Position Manager → Ledger → Cycle Manager → Audit log
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Security model: [docs/SECURITY.md](docs/SECURITY.md)

## The capital rules as implemented

| Rule | Where it is enforced |
|---|---|
| A cycle's capital is exactly $100, and allocation equals lifetime maximum | `CycleManager.start_new` stores it once; `RiskEngine` rejects any mismatch (`allocation_immutable`) |
| Spendable money comes only from the cycle's own fills | `core/ledger.py` derives cash as `$100 + own fills`, never from broker cash |
| Winnings outside the cycle are never used | After a $1,000 cycle the broker holds more than $100, but the new cycle's ledger starts at $100 |
| No margin, no shorting, no leverage | Paper broker cash account; the schema allows only `LONG`/`FLAT`; the risk engine sizes by cash |
| Every order is tied to a session | client order id `SESSION_000001-D00000042`; `session_matches_cycle` check |
| Money missing at the broker | `ledger_cash_backed_by_broker` fails → kill switch `UNEXPECTED_BALANCE` |
| A position someone else opened | reconciliation → kill switch `UNEXPECTED_POSITION` |
| Target reached | `COMPLETING`: cancel entries, close all, wait for fills, audit, `COMPLETED`, new $100 cycle |
| Equity ≤ 0 | `CYCLE_FAILED`. The next cycle requires `operator=...` (no auto-recharge) |
| Every position has a stop | bracket orders only; if the broker can't protect a fractional position, the size is floored to whole shares; if a stop is missing, the kill switch trips and the position is closed |

## Why $100 is hard

- **Whole shares.** Brokers such as Alpaca accept fractional quantities only on
  simple orders, which cannot carry a broker-side stop. Because every position
  must have a stop, the engine buys whole shares only. That makes stocks priced
  above about $60 (AGGRESSIVE: 60% position cap) impossible to buy with $100.
- **Fees and spread.** Zero-commission brokers still pass on SEC and FINRA
  fees on sells, rounded up to the cent. A 0.1% spread on a $50 position is a
  real share of a $2–5 risk budget.
- **Pattern Day Trader rule.** US margin accounts under $25k are limited to 3
  day trades per 5 days. This system trades from a cash account, where
  settlement (T+1) limits how quickly money can be reused. A live adapter must
  model settlement before LIVE.

## Roadmap

| Phase | State |
|---|---|
| 1 Architecture | ✅ modules under `trader/` |
| 2 Data providers | ✅ interfaces + zero-cost registry, CSV, SEC EDGAR, RSS, synthetic (labelled) · ⏳ free real-time quotes (comes with the broker adapter) |
| 3 Backtesting | ✅ runs the production system; metrics; walk-forward |
| 4 Strategy engine | ✅ rule-based agents + debate + decision · ⏳ optional LLM behind the same JSON contract (the hook exists) |
| 5 Risk engine | ✅ |
| 6 Broker mock | ✅ fees, slippage, partial fills, hours, rejections, gaps, fault injection |
| 7 Paper trading | ✅ paper broker + replay · ⏳ real-time loop against a broker's paper endpoint |
| 8 Dashboard | ✅ read-only status page + JSON |
| 9 Security | ✅ see SECURITY.md |
| 10 Live broker integration | ⛔ not started. Needs a broker with an isolated (sub-)account, stop orders on the traded size, settlement modelling, a holiday calendar |
| 11 $100 isolated live cycle | ⛔ only after 10 plus a paper-trading period that passes validation |

## Paper → Live checklist (not yet possible)

1. Implement a `BrokerInterface` adapter against the broker's **paper** endpoint and pass `tests/` against it.
2. Run real-time paper trading for a meaningful period, then compare it with the walk-forward out-of-sample results.
3. Open a **dedicated** account (or sub-account) funded with $100 only, with margin disabled.
4. Add the adapter to `LIVE_BROKERS_IMPLEMENTED`, then set `TRADER_MODE=LIVE`, `LIVE_TRADING_ENABLED=true`, `LIVE_TRADING_ACK=I-ACCEPT-REAL-MONEY-RISK` and `BROKER_ACCOUNT_ID`.
5. Withdrawing the money a completed cycle leaves over $100 is a manual step. The system never moves money in or out.
