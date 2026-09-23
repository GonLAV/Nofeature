# Architecture

## Layout

```
trader/
  core/         models, clock, ledger, cycle manager, position manager, orchestrator
  agents/       analysis agents (market data, technical, regime, news, fundamental)
                + scanner, debate, decision agent
  strategies/   indicators (SMA, EMA, RSI, MACD, ATR, Bollinger, VWAP, volume z, realized vol, S/R)
  data/         provider interfaces + zero-cost registry; CSV/in-memory, synthetic, SEC EDGAR, RSS
  risk/         profiles, deterministic Risk Engine, persistent kill switch
  execution/    Execution Engine (the only broker caller)
  broker/       BrokerInterface, paper broker, market hours
  backtesting/  event-driven backtester (runs the production system), metrics, walk-forward
  database/     SQLite schema + access (PostgreSQL-portable SQL)
  dashboard/    read-only status snapshot + HTTP page
  config/       env-driven settings; LIVE gate
  audit/        append-only audit log with secret redaction
  security/     decision schema, signed approvals, redaction
tests/          unit, integration, broker mock, risk, security, failure, chaos
```

## Trust boundaries

1. **Agents → Decision JSON.** The output is untrusted. It could come from rules
   today or from an LLM tomorrow.
2. **Schema.** An exact field set with strict types. A trade needs positive
   finite numbers, stop < entry < target, `LONG` only, at least one cited
   source, and a timezone-aware timestamp. Citing a source no agent supplied
   counts as hallucination and trips the kill switch.
3. **Risk Engine.** Deterministic code with no I/O. It is the only holder of
   the approval signing key. It checks, in order: session, account identity,
   broker isolation capability, market open, allocation immutability, ledger
   cash backed by the broker, kill switch, cycle state, decision freshness,
   quote freshness and sanity, spread, minimum price, liquidity, entry vs
   market (hallucination guard), confidence, stop placement and distance,
   reward/risk, existing position, duplicate open order, max positions, trade
   frequency, daily loss, then sizing (the minimum of the decision's size, the
   risk budget, the position cap, the exposure cap and the cash), whole-share
   flooring, minimum notional, the capital boundary, and stop-protection
   availability. Any exception inside the engine means reject.
4. **Execution Engine.** Verifies the HMAC signature and expiry (30 s), blocks
   new orders while the kill switch is engaged, and re-checks the account id.
   It writes the order row *before* calling the broker, and a primary key on
   the client order id makes a double submit impossible. On a timeout it looks
   up the order by client id and never resends. It checks that an active stop
   exists after every fill.
5. **Broker.** Reached only through `BrokerInterface`.

## Ledger vs broker

The ledger answers "how much can this cycle spend?" using only its $100 and
its own fills. The broker answers "what really exists?". Every tick the two are
reconciled:

- positions must match exactly
- ledger cash must not exceed broker cash
- no open order may exist at the broker that this system did not place

A mismatch trips the kill switch.

## Cycle state machine

```
ACTIVE ──equity ≥ $1,000──▶ COMPLETING ──flat & settled──▶ COMPLETED ──▶ new ACTIVE ($100)
   └──────equity ≤ 0─────▶ FAILED  (next cycle needs a human operator)
```

## Backtest fidelity

At 09:35 NY the system decides using bars that closed *before* today, and
market orders fill at today's open plus slippage. At 15:58 the day's bar is
replayed: stops and targets trigger on its high/low range, a gap through a
stop fills at the open, and when a bar touches both the stop and the target
the stop is assumed to fill first. Walk-forward picks parameters on each
training window and reports only the following test window as out-of-sample.

## Learning loop (design, gated)

Each trade stores its regime, setup, entry and exit reasons, fees and P&L, so
the system can compute performance per regime, sector, setup and timeframe. A
strategy change is never applied to production automatically. The path is
backtest → walk-forward OOS → paper period → human review → deploy.
