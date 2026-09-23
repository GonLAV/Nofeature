"""Keeps secrets out of logs and the audit trail."""
from __future__ import annotations

import os
import re

_SECRET_ENV_HINTS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "PASS")
_PATTERNS = [
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)\b(api[_-]?key|access[_-]?key|secret[_-]?key|key|secret|token|password|authorization)(\"?\s*[:=]\s*\"?)([^\s\",}]+)"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"),
]
MASK = "***REDACTED***"


def _secret_values() -> list:
    vals = []
    for k, v in os.environ.items():
        if v and len(v) >= 8 and any(h in k.upper() for h in _SECRET_ENV_HINTS):
            vals.append(v)
    return sorted(vals, key=len, reverse=True)


def redact(text: str) -> str:
    if not text:
        return text
    for v in _secret_values():
        text = text.replace(v, MASK)
    text = _PATTERNS[0].sub(MASK, text)
    text = _PATTERNS[1].sub(lambda m: f"{m.group(1)}{m.group(2)}{MASK}", text)
    text = _PATTERNS[2].sub(f"Bearer {MASK}", text)
    return text
