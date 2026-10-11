import time
from collections import defaultdict, deque
from fastapi import Depends, HTTPException, Request
from .config import settings
from .models import User
from .security import client_ip, get_current_user

_hits: dict[str, deque] = defaultdict(deque)


def reset_limits() -> None:
    _hits.clear()


def _check(key: str, limit: int, window: int = 60) -> None:
    q = _hits[key]
    t = time.monotonic()
    while q and t - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests. Please slow down and try again shortly.")
    q.append(t)


def auth_limit(request: Request) -> None:
    _check(f"auth:{client_ip(request)}", settings.AUTH_RATE_LIMIT_PER_MIN)


def ai_limit(user: User = Depends(get_current_user)) -> None:
    _check(f"ai:{user.id}", settings.AI_RATE_LIMIT_PER_MIN)
