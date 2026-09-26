"""Small in-memory rate limiter for the public auth endpoints.

Sewain runs as a single process on one server, so memory is enough (limits reset on
restart, which is fine for slowing down password guessing and demo-account spam).
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Caddy replaces any X-Forwarded-For the browser sent with the real address, so the
    # right-most entry is the one our own proxy added. Without a proxy, use the socket.
    fwd = request.headers.get('x-forwarded-for')
    if fwd:
        return fwd.split(',')[-1].strip()
    return request.client.host if request.client else 'unknown'


def hit(key: str, limit: int, window_seconds: int) -> None:
    """Count one attempt for key; 429 once more than `limit` happen within the window."""
    if os.environ.get('SEWAIN_DISABLE_RATE_LIMIT') == '1':  # local e2e runs only
        return
    now = time.monotonic()
    q = _hits[key]
    while q and q[0] <= now - window_seconds:
        q.popleft()
    if len(q) >= limit:
        wait = int(q[0] + window_seconds - now) + 1
        minutes = max(1, round(wait / 60))
        raise HTTPException(429, f'Terlalu banyak percobaan. Coba lagi dalam {minutes} menit.')
    q.append(now)
    if len(_hits) > 50_000:  # keep memory bounded if someone sprays random keys
        for k in [k for k, v in _hits.items() if not v or v[-1] <= now - 3600]:
            del _hits[k]


def reset() -> None:
    _hits.clear()
