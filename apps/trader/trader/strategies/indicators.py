"""Technical indicators on plain float lists. Each returns None when there is not enough data."""
from __future__ import annotations

import math
from statistics import mean, pstdev


def sma(values: list, n: int):
    return mean(values[-n:]) if len(values) >= n else None


def ema_series(values: list, n: int) -> list:
    if len(values) < n:
        return []
    k = 2 / (n + 1)
    out = [mean(values[:n])]
    for v in values[n:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def ema(values: list, n: int):
    s = ema_series(values, n)
    return s[-1] if s else None


def rsi(closes: list, n: int = 14):
    if len(closes) < n + 1:
        return None
    gains, losses = [], []
    for a, b in zip(closes[:-1], closes[1:]):
        gains.append(max(b - a, 0.0))
        losses.append(max(a - b, 0.0))
    avg_g, avg_l = mean(gains[:n]), mean(losses[:n])
    for g, l in zip(gains[n:], losses[n:]):  # Wilder smoothing
        avg_g = (avg_g * (n - 1) + g) / n
        avg_l = (avg_l * (n - 1) + l) / n
    if avg_l == 0:
        return 100.0
    return 100 - 100 / (1 + avg_g / avg_l)


def macd(closes: list, fast: int = 12, slow: int = 26, signal: int = 9):
    if len(closes) < slow + signal:
        return None
    f, s = ema_series(closes, fast), ema_series(closes, slow)
    line = [a - b for a, b in zip(f[slow - fast:], s)]
    sig = ema_series(line, signal)
    return line[-1], sig[-1], line[-1] - sig[-1]


def true_ranges(bars: list) -> list:
    return [max(b.high - b.low, abs(b.high - p.close), abs(b.low - p.close)) for p, b in zip(bars[:-1], bars[1:])]


def atr(bars: list, n: int = 14):
    tr = true_ranges(bars)
    if len(tr) < n:
        return None
    val = mean(tr[:n])
    for t in tr[n:]:
        val = (val * (n - 1) + t) / n
    return val


def bollinger(closes: list, n: int = 20, k: float = 2.0):
    if len(closes) < n:
        return None
    m, sd = mean(closes[-n:]), pstdev(closes[-n:])
    return m - k * sd, m, m + k * sd


def vwap(bars: list, n: int = 20):
    window = bars[-n:]
    vol = sum(b.volume for b in window)
    if len(window) < n or vol <= 0:
        return None
    return sum((b.high + b.low + b.close) / 3 * b.volume for b in window) / vol


def volume_zscore(volumes: list, n: int = 20):
    if len(volumes) < n + 1:
        return None
    hist = volumes[-n - 1:-1]
    sd = pstdev(hist)
    return 0.0 if sd == 0 else (volumes[-1] - mean(hist)) / sd


def realized_vol(closes: list, n: int = 20):
    if len(closes) < n + 1:
        return None
    rets = [math.log(b / a) for a, b in zip(closes[-n - 1:-1], closes[-n:]) if a > 0 and b > 0]
    return pstdev(rets) * math.sqrt(252) if len(rets) == n else None


def support_resistance(bars: list, n: int = 20):
    if len(bars) < n:
        return None
    w = bars[-n:]
    return min(b.low for b in w), max(b.high for b in w)
