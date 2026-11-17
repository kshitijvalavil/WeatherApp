import time

import pytest
import requests

from app.upstream import Upstream, UpstreamError


class FakeResponse:
    def __init__(self, status=200, data=None, headers=None):
        self.status_code, self._data, self.headers = status, data, headers or {}

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


class FakeSession:
    """Replays a list of responses (or exceptions) and records what was asked."""
    def __init__(self, *replies):
        self.replies, self.requests = list(replies), []

    def get(self, url, params=None, headers=None, timeout=None):
        self.requests.append(headers or {})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def upstream(*replies, **kwargs):
    up = Upstream(**kwargs)
    up._session = FakeSession(*replies)
    return up


def expire(up):
    for entry in up._entries.values():
        entry.expires = 0


def test_a_fresh_answer_is_not_fetched_again():
    up = upstream(FakeResponse(data={"n": 1}))
    assert up.get("u", ttl=60) == {"n": 1}
    assert up.get("u", ttl=60) == {"n": 1}
    assert len(up._session.requests) == 1


def test_different_params_are_different_entries():
    up = upstream(FakeResponse(data=1), FakeResponse(data=2))
    assert up.get("u", {"lat": 1}, ttl=60) == 1
    assert up.get("u", {"lat": 2}, ttl=60) == 2


def test_expires_header_outlasts_a_shorter_ttl():
    up = upstream(FakeResponse(data=1, headers={"Expires": "Fri, 01 Jan 2100 00:00:00 GMT"}))
    up.get("u", ttl=1)
    assert next(iter(up._entries.values())).expires > time.time() + 1e6


def test_an_expired_answer_is_revalidated_and_reused_on_304():
    up = upstream(
        FakeResponse(data={"n": 1}, headers={"Last-Modified": "Tue, 17 Nov 2026 03:00:00 GMT"}),
        FakeResponse(status=304),
    )
    up.get("u", ttl=60)
    expire(up)
    assert up.get("u", ttl=60) == {"n": 1}
    assert up._session.requests[1] == {"If-Modified-Since": "Tue, 17 Nov 2026 03:00:00 GMT"}
    assert up.get("u", ttl=60) == {"n": 1}  # fresh again, no third request
    assert len(up._session.requests) == 2


def test_stale_data_is_served_when_the_upstream_fails():
    up = upstream(FakeResponse(data={"n": 1}), requests.ConnectionError("down"), FakeResponse(status=503))
    up.get("u", ttl=60)
    expire(up)
    assert up.get("u", ttl=60) == {"n": 1}
    assert up.get("u", ttl=60) == {"n": 1}  # and the failure isn't retried at once
    assert len(up._session.requests) == 2


def test_failure_with_nothing_cached_raises():
    with pytest.raises(UpstreamError):
        upstream(requests.Timeout("slow")).get("u", ttl=60)
    with pytest.raises(UpstreamError):
        upstream(FakeResponse(status=500)).get("u", ttl=60)


def test_failures_are_not_cached():
    up = upstream(FakeResponse(status=500), FakeResponse(data="ok"))
    with pytest.raises(UpstreamError):
        up.get("u", ttl=60)
    assert up.get("u", ttl=60) == "ok"


def test_the_cache_stays_bounded():
    up = upstream(*[FakeResponse(data=i) for i in range(20)], max_entries=8)
    for i in range(20):
        up.get("u", {"i": i}, ttl=60 + i)
    assert len(up._entries) <= 8
    assert up.get("u", {"i": 19}, ttl=60) == 19  # the newest survived


def test_min_interval_spaces_requests_out():
    up = upstream(FakeResponse(data=1), FakeResponse(data=2), min_interval=0.2)
    start = time.time()
    up.get("u", {"i": 1}, ttl=60)
    up.get("u", {"i": 2}, ttl=60)
    assert time.time() - start >= 0.2
