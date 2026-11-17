from datetime import datetime, timezone

import pytest

from app import create_app
from app.providers import geo, metno

from . import fake_met

# 09:00 IST on a Tuesday. The fake feed starts an hour earlier, as a cached
# MET Norway feed often does.
NOW = datetime(2026, 11, 17, 3, 30, tzinfo=timezone.utc)
FEED_START = datetime(2026, 11, 17, 2, 0, tzinfo=timezone.utc)


@pytest.fixture
def now():
    return NOW


@pytest.fixture
def met(monkeypatch):
    """Serve fake MET Norway data. Tests may replace `met.forecast`."""
    class Met:
        forecast = fake_met.forecast(FEED_START)
        calls = 0

    def get(url, params=None, **kwargs):
        Met.calls += 1
        if "sunrise" in url:
            return fake_met.sun(params["date"])
        return Met.forecast

    monkeypatch.setattr(metno._api, "get", get)
    return Met


@pytest.fixture
def client(met, monkeypatch):
    monkeypatch.setattr(geo, "reverse", lambda lat, lon: {"name": "Lonavala", "state": "Maharashtra"})
    monkeypatch.setattr(geo, "search", lambda q: [{"name": "Lonavala", "state": "Maharashtra", "lat": 18.75, "lon": 73.41}] if q else [])
    return create_app().test_client()
