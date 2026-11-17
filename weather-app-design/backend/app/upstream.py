"""Cached GET requests to the services the app depends on.

Every upstream we use is free and asks for the same manners: identify
yourself, cache what you fetch, and don't ask again before the answer has
expired. `Upstream` does that in one place, so the providers only have to
say which URL they want.

Behaviour:
- A fresh cached answer is returned without touching the network.
- An expired one is revalidated with If-Modified-Since; a 304 costs the
  upstream almost nothing.
- If the upstream is down and we still hold an old answer, the old answer
  is served. A forecast from an hour ago beats an error page.
- Concurrent requests for the same URL wait for one fetch instead of
  each making their own.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime

import requests

log = logging.getLogger(__name__)

# MET Norway and Nominatim both block requests that don't identify the app.
USER_AGENT = os.environ.get(
    "MAUSAM_USER_AGENT", "Mausam/1.0 github.com/kshitijvalavil/WeatherApp"
)

RETRY_AFTER_FAILURE = 60  # seconds a stale answer is reused before retrying


class UpstreamError(Exception):
    """An upstream failed and there was nothing cached to fall back on."""


@dataclass
class _Entry:
    data: object
    expires: float
    last_modified: str | None


class Upstream:
    def __init__(self, max_entries: int = 500, min_interval: float = 0.0):
        """`min_interval` spaces network requests out, for rate-limited APIs."""
        self._entries: dict[str, _Entry] = {}
        self._max_entries = max_entries
        self._min_interval = min_interval
        self._next_slot = 0.0
        self._lock = threading.Lock()
        # One lock per URL would grow without bound; a fixed set shared by
        # hash is enough to stop two threads fetching the same thing.
        self._fetching = [threading.Lock() for _ in range(64)]
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    def get(self, url: str, params: dict | None = None, *, ttl: float, timeout: float = 10):
        """Return the JSON at `url`, cached for at least `ttl` seconds.

        An Expires header later than `ttl` wins, so we never ask sooner than
        the upstream wants.
        """
        key = url + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))

        entry = self._entries.get(key)
        if entry and entry.expires > time.time():
            return entry.data

        with self._fetching[hash(key) % len(self._fetching)]:
            entry = self._entries.get(key)
            if entry and entry.expires > time.time():
                return entry.data  # another thread fetched it while we waited
            try:
                return self._fetch(key, url, params, entry, ttl, timeout)
            except requests.RequestException as exc:
                if entry is None:
                    raise UpstreamError(f"{url}: {exc}") from exc
                log.warning("serving stale data for %s: %s", url, exc)
                entry.expires = time.time() + RETRY_AFTER_FAILURE
                return entry.data

    def _fetch(self, key, url, params, entry, ttl, timeout):
        headers = {}
        if entry and entry.last_modified:
            headers["If-Modified-Since"] = entry.last_modified

        self._wait_for_slot()
        r = self._session.get(url, params=params, headers=headers, timeout=timeout)
        expires = max(time.time() + ttl, _expires(r.headers.get("Expires")))

        if r.status_code == 304 and entry:
            entry.expires = expires
            return entry.data

        r.raise_for_status()
        data = r.json()
        with self._lock:
            if len(self._entries) >= self._max_entries:
                self._evict()
            self._entries[key] = _Entry(data, expires, r.headers.get("Last-Modified"))
        return data

    def _wait_for_slot(self):
        if not self._min_interval:
            return
        with self._lock:
            now = time.time()
            wait = self._next_slot - now
            self._next_slot = max(now, self._next_slot) + self._min_interval
        if wait > 0:
            time.sleep(wait)

    def _evict(self):
        """Drop the quarter of the cache that expires soonest."""
        oldest = sorted(self._entries, key=lambda k: self._entries[k].expires)
        for key in oldest[: max(1, len(oldest) // 4)]:
            del self._entries[key]


def _expires(header: str | None) -> float:
    if not header:
        return 0.0
    try:
        return parsedate_to_datetime(header).timestamp()
    except (TypeError, ValueError):
        return 0.0
