"""Signed risk approvals.

Only the Risk Engine holds the signing key. The Execution Engine refuses any
order whose approval signature, content hash or expiry does not verify — so a
decision cannot reach the broker without passing through the Risk Engine.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from trader.core.models import OrderRequest


def _canonical(req: OrderRequest) -> bytes:
    body = {
        "client_order_id": req.client_order_id, "session_id": req.session_id, "symbol": req.symbol,
        "side": req.side.value, "qty": str(req.qty), "order_type": req.order_type.value,
        "limit_price": str(req.limit_price), "stop_price": str(req.stop_price),
        "stop_loss": str(req.stop_loss), "take_profit": str(req.take_profit),
        "reduce_only": req.reduce_only,
    }
    return json.dumps(body, sort_keys=True).encode()


@dataclass(frozen=True)
class RiskApproval:
    request: OrderRequest
    expires_at: datetime
    signature: str


class ApprovalSigner:
    def __init__(self, key: bytes | None = None, ttl_seconds: int = 30):
        self._key = key or secrets.token_bytes(32)
        self.ttl = timedelta(seconds=ttl_seconds)

    def _sig(self, req: OrderRequest, expires_at: datetime) -> str:
        msg = _canonical(req) + b"|" + expires_at.isoformat().encode()
        return hmac.new(self._key, msg, hashlib.sha256).hexdigest()

    def sign(self, req: OrderRequest, now: datetime) -> RiskApproval:
        exp = now + self.ttl
        return RiskApproval(req, exp, self._sig(req, exp))

    def verify(self, approval: RiskApproval, now: datetime) -> str | None:
        """Returns None when valid, otherwise the reason it is not."""
        if now > approval.expires_at:
            return "approval expired"
        if not hmac.compare_digest(self._sig(approval.request, approval.expires_at), approval.signature):
            return "approval signature invalid"
        return None
