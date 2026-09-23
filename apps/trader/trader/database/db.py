"""SQLite persistence. One file, WAL mode, every write in a transaction.

SQLite keeps Phase 1-9 dependency free; the schema is plain SQL so it can be
moved to PostgreSQL (which the rest of this repo already runs) unchanged.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('operator','viewer')),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_cycles (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    allocated_capital TEXT NOT NULL,
    max_lifetime_capital TEXT NOT NULL,
    target_equity TEXT NOT NULL,
    final_equity TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT
);
-- At most one live cycle at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_cycle ON trading_cycles(status)
    WHERE status IN ('ACTIVE','COMPLETING');
CREATE TABLE IF NOT EXISTS orders (
    client_order_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES trading_cycles(session_id),
    decision_id INTEGER,
    parent_client_order_id TEXT,
    broker_order_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    order_type TEXT NOT NULL,
    qty TEXT NOT NULL,
    limit_price TEXT,
    stop_price TEXT,
    status TEXT NOT NULL,
    filled_qty TEXT NOT NULL DEFAULT '0',
    filled_avg_price TEXT,
    fees TEXT NOT NULL DEFAULT '0',
    reject_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    entry_client_order_id TEXT NOT NULL UNIQUE,
    qty TEXT NOT NULL,
    entry_price TEXT NOT NULL,
    exit_price TEXT,
    stop_loss TEXT NOT NULL,
    take_profit TEXT,
    fees TEXT NOT NULL DEFAULT '0',
    realized_pnl TEXT,
    reason_for_entry TEXT NOT NULL,
    reason_for_exit TEXT,
    regime TEXT,
    setup TEXT,
    opened_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE TABLE IF NOT EXISTS positions (
    session_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    qty TEXT NOT NULL,
    avg_entry_price TEXT NOT NULL,
    stop_loss TEXT,
    take_profit TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, symbol)
);
CREATE TABLE IF NOT EXISTS market_data (
    symbol TEXT NOT NULL,
    ts TEXT NOT NULL,
    open REAL, high REAL, low REAL, close REAL, volume REAL,
    source TEXT NOT NULL,
    PRIMARY KEY (symbol, ts, source)
);
CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    agent TEXT NOT NULL,
    symbol TEXT NOT NULL,
    signal TEXT NOT NULL,
    confidence REAL NOT NULL,
    reasoning TEXT NOT NULL,
    risk TEXT NOT NULL,
    data_sources TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    session_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    schema_valid INTEGER NOT NULL,
    schema_error TEXT
);
CREATE TABLE IF NOT EXISTS risk_decisions (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    session_id TEXT NOT NULL,
    decision_id INTEGER,
    symbol TEXT NOT NULL,
    approved INTEGER NOT NULL,
    checks TEXT NOT NULL,
    approved_qty TEXT
);
CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY,
    symbol TEXT,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    published_at TEXT NOT NULL,
    confidence REAL NOT NULL,
    UNIQUE (url)
);
CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    component TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    session_id TEXT,
    component TEXT NOT NULL,
    event TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    session_id TEXT NOT NULL,
    equity TEXT NOT NULL,
    cash TEXT NOT NULL,
    exposure TEXT NOT NULL,
    drawdown TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(ts: datetime) -> str:
    return ts.isoformat()


class Database:
    def __init__(self, path: str = ":memory:"):
        self.path = path
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        if path != ":memory:":
            self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.executescript(SCHEMA)

    @contextmanager
    def tx(self):
        with self._lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield self.conn
            except BaseException:
                self.conn.execute("ROLLBACK")
                raise
            else:
                self.conn.execute("COMMIT")

    def query(self, sql: str, params: tuple = ()) -> list:
        with self._lock:
            return list(self.conn.execute(sql, params).fetchall())

    def one(self, sql: str, params: tuple = ()):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql: str, params: tuple = ()) -> int:
        with self.tx() as c:
            return c.execute(sql, params).lastrowid

    # --- system_state (kill switch, etc.) -------------------------------------------------
    def get_state(self, key: str, default=None):
        row = self.one("SELECT value FROM system_state WHERE key = ?", (key,))
        return json.loads(row["value"]) if row else default

    def set_state(self, key: str, value, ts: datetime | None = None) -> None:
        self.execute(
            "INSERT INTO system_state(key, value, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, json.dumps(value), iso(ts or utcnow())),
        )

    def close(self) -> None:
        self.conn.close()
