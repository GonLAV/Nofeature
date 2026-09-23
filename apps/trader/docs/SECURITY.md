# Security model

## Principles

- **Fail closed.** No data, a stale price, no broker, no AI, a risk-engine
  error or unverifiable capital each lead to `NO_TRADE`.
- **The Risk Engine outranks the AI.** An AI can propose; only deterministic
  code can approve.
- **No LLM → broker path.** Only the Execution Engine holds a broker handle,
  and it accepts only HMAC-signed Risk Engine approvals.
- **Capital isolation.** The cycle ledger is the only source of spendable
  money. Account identity is checked on every tick and every order.

## Kill switch

The switch is persistent (stored in the DB, so it survives restarts) and only
a human can reset it (`python -m trader reset --operator NAME --note TEXT`).
While it is engaged, no new entries are allowed, but risk-reducing exits are
still permitted.

Triggers:

| Trigger | Source |
|---|---|
| Daily loss limit | Risk Engine / orchestrator |
| Broker unreachable or order state unconfirmable | orchestrator / execution |
| Broker returned an unexpected account | risk / execution / orchestrator |
| Ledger cash exceeds broker cash | risk / orchestrator |
| Position or open order not placed by this system | reconciliation |
| Duplicate submit attempt | execution (DB primary key) |
| Forged or tampered approval | execution |
| 3 consecutive invalid decisions | orchestrator (agent malfunction) |
| Decision cites an unknown source, or its price is >10% from market | hallucination guard |
| Position without an active stop | execution / orchestrator; the position is also closed |

## Secrets

- There are no secrets in code. Everything comes from environment variables
  (use the platform's secret manager in deployment).
- Audit payloads and error messages go through `security/redaction.py`, which
  masks the values of any `*KEY*`, `*SECRET*`, `*TOKEN*` or `*PASSWORD*`
  environment variable, `sk-ant-…` keys, `key=/token=/password=` pairs and
  bearer tokens.
- The dashboard is read-only and binds to 127.0.0.1. It refuses a non-local
  bind without `DASHBOARD_TOKEN`, compares tokens in constant time, and sends
  `no-store` and `nosniff` headers. Kill and reset are CLI-only.

## Data sources

- In zero-cost mode a paid provider cannot be registered.
- SEC EDGAR: a declared User-Agent with a contact email, throttled to 5 req/s
  (the SEC limit is 10).
- RSS: only feeds the operator configures. No scraping and no bypassing of
  CAPTCHAs, paywalls, auth or rate limits.
- Every news item carries its source, timestamp, URL and a confidence score.

## Database

- SQLite with WAL. All writes run in transactions, and the order write-ahead
  row is committed before the broker call.
- Every agent signal, decision (raw JSON plus the debate transcript), risk
  verdict with every check, order event, cycle transition and kill-switch
  change goes to `audit_logs` and its typed tables.

## Before LIVE (open items)

- A broker adapter must report `isolated_account=True` only for a
  dedicated/sub-account.
- Model cash settlement (T+1), the broker's own market calendar and
  holidays, and broker-side rate limits.
- Run the dashboard behind TLS if it is exposed.
- An external review of `risk/engine.py` and `execution/engine.py`.
