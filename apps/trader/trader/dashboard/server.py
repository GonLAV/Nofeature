"""Minimal read-only dashboard (stdlib only). Binds to localhost by default.

GET /            HTML page, refreshes every 10s
GET /api/status  JSON snapshot
If DASHBOARD_TOKEN is set, requests must send `Authorization: Bearer <token>`
(or ?token=... for the HTML page). There are no write endpoints: kill/reset
are CLI-only so a browser can never move money or disarm safety.
"""
from __future__ import annotations

import hmac
import html
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from trader.dashboard.status import build_status
from trader.database.db import Database

PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trader Status</title>
<style>body{{font:14px system-ui;margin:16px;background:#0f1115;color:#e6e6e6}}
.k{{color:#9aa4b2}}.bad{{color:#ff6b6b}}.ok{{color:#51cf66}}pre{{white-space:pre-wrap;background:#171a21;padding:12px;
border-radius:8px;overflow-x:auto}}</style></head><body>
<h2>Trading cycle {cycle} &middot; <span class="{kcls}">kill switch: {kill}</span></h2>
<p><span class="k">Equity</span> ${equity} &nbsp; <span class="k">Allocated</span> ${alloc}
&nbsp; <span class="k">P/L</span> ${pl} &nbsp; <span class="k">Win rate</span> {wr}</p>
<pre>{body}</pre></body></html>"""


def make_handler(db_path: str, token: str | None):
    class Handler(BaseHTTPRequestHandler):
        def _authorized(self) -> bool:
            if not token:
                return True
            header = self.headers.get("Authorization", "")
            supplied = header[7:] if header.startswith("Bearer ") else parse_qs(urlparse(self.path).query).get(
                "token", [""])[0]
            return hmac.compare_digest(supplied, token)

        def do_GET(self):
            if not self._authorized():
                self.send_error(401)
                return
            db = Database(db_path)
            try:
                status = build_status(db)
            finally:
                db.close()
            path = urlparse(self.path).path
            if path == "/api/status":
                body, ctype = json.dumps(status, default=str, indent=2).encode(), "application/json"
            elif path == "/":
                cyc = status.get("cycle") or {}
                kill = status["kill_switch"].get("engaged")
                body = PAGE.format(
                    cycle=html.escape(str(cyc.get("session_id", "none"))),
                    kill="ENGAGED" if kill else "clear", kcls="bad" if kill else "ok",
                    equity=html.escape(str(status.get("current_equity", "-"))),
                    alloc=html.escape(str(status.get("allocated_capital", "-"))),
                    pl=html.escape(str(status.get("profit_loss", "-"))),
                    wr=html.escape(str(status.get("win_rate", "-"))),
                    body=html.escape(json.dumps(status, default=str, indent=2)),
                ).encode()
                ctype = "text/html; charset=utf-8"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    return Handler


def serve(db_path: str, host: str = "127.0.0.1", port: int = 8050) -> None:
    token = os.environ.get("DASHBOARD_TOKEN") or None
    if host not in ("127.0.0.1", "localhost") and not token:
        raise SystemExit("Refusing to expose the dashboard beyond localhost without DASHBOARD_TOKEN")
    ThreadingHTTPServer((host, port), make_handler(db_path, token)).serve_forever()
