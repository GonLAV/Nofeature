"""Read-only status snapshot for the dashboard and the `status` CLI."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from trader.core.ledger import compute_ledger
from trader.database.db import Database


def build_status(db: Database, broker=None, registry=None) -> dict:
    cycle = db.one("SELECT * FROM trading_cycles ORDER BY id DESC LIMIT 1")
    out: dict = {"generated_at": datetime.now(timezone.utc).isoformat()}
    kill = db.get_state("kill_switch", {"engaged": False})
    out["kill_switch"] = kill
    if cycle is None:
        out["cycle"] = None
        return out
    session = cycle["session_id"]
    ledger = compute_ledger(db, session, Decimal(cycle["allocated_capital"]))
    metric = db.one("SELECT * FROM performance_metrics WHERE session_id = ? ORDER BY id DESC LIMIT 1", (session,))
    closed = db.query("SELECT realized_pnl FROM trades WHERE session_id = ? AND closed_at IS NOT NULL", (session,))
    pnls = [Decimal(r["realized_pnl"]) for r in closed]
    equity = Decimal(metric["equity"]) if metric else ledger.cash
    out.update({
        "cycle": {
            "session_id": session, "status": cycle["status"], "number": cycle["id"],
            "allocated_capital": cycle["allocated_capital"], "target": cycle["target_equity"],
            "started_at": cycle["started_at"],
        },
        "current_capital": str(ledger.cash),
        "allocated_capital": cycle["allocated_capital"],
        "current_equity": str(equity),
        "profit_loss": str(equity - Decimal(cycle["allocated_capital"])),
        "drawdown_pct": metric["drawdown"] if metric else "0",
        "exposure": metric["exposure"] if metric else "0",
        "open_positions": [dict(r) for r in db.query("SELECT * FROM positions WHERE session_id = ?", (session,))],
        "closed_trades": len(pnls),
        "win_rate": round(sum(1 for p in pnls if p > 0) / len(pnls), 3) if pnls else None,
        "realized_pnl": str(sum(pnls, Decimal(0))),
        "risk_profile": db.get_state("risk_profile"),
        "recent_agent_decisions": [
            {k: r[k] for k in ("ts", "symbol", "action", "schema_valid", "schema_error")}
            for r in db.query("SELECT * FROM agent_decisions WHERE session_id = ? ORDER BY id DESC LIMIT 10", (session,))
        ],
        "rejected_trades": [
            {"ts": r["ts"], "symbol": r["symbol"], "failed": [c[0] for c in json.loads(r["checks"]) if not c[1]]}
            for r in db.query("SELECT * FROM risk_decisions WHERE session_id = ? AND approved = 0 ORDER BY id DESC "
                              "LIMIT 10", (session,))
        ],
        "cycles": [dict(r) for r in db.query("SELECT session_id, status, final_equity, started_at, ended_at "
                                             "FROM trading_cycles ORDER BY id")],
        "recent_errors": [dict(r) for r in db.query("SELECT ts, component, message FROM errors ORDER BY id DESC "
                                                    "LIMIT 5")],
    })
    if broker is not None:
        try:
            broker.get_account()
            out["broker_status"] = "OK"
        except Exception as exc:  # status page must never crash
            out["broker_status"] = f"ERROR: {type(exc).__name__}"
    else:
        out["broker_status"] = "not connected (offline view)"
    out["data_provider_status"] = registry.status if registry else "offline view"
    return out
