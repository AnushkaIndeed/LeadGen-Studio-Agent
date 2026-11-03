"""Small in-memory rate limiter for the single-instance demo deployment."""

from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    def check(self, request: Request) -> None:
        client_id = request.client.host if request.client else "unknown"
        now = monotonic()
        timestamps = self._requests[client_id]
        while timestamps and now - timestamps[0] >= self.window_seconds:
            timestamps.popleft()
        if len(timestamps) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a minute and try again.",
            )
        timestamps.append(now)
