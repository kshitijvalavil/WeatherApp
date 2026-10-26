"""IMD (India Meteorological Department) client.

Base URL: https://api.imd.gov.in/api/v1/

Endpoints the app can use today:
- cityforecast?id=<station id>       7-day forecast
- current_wx?id=<station id>         Live station reading
- districtnowcast?id=<district id>   Short-term warning
- districtwarning?id=<district id>   5-day warnings

Each function fails soft: on any upstream error the function returns None,
and the frontend simply doesn't show that IMD block. The backend never
crashes because IMD is slow or down.

Notes
- Our sandbox can't reach api.imd.gov.in, so these calls are exercised
  when the backend runs on your machine or server.
- The API page says to attribute data to IMD. The web page does that.
- Keep per-city polling well below once a minute; a short in-process
  cache limits upstream load.
"""
from __future__ import annotations

import time
import threading
from typing import Any

import requests

BASE = "https://api.imd.gov.in/api/v1"
TIMEOUT = 8  # seconds
CACHE_TTL = 300  # 5 minutes — IMD data updates slowly

_cache: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _get(path: str, params: dict | None = None) -> Any | None:
    """GET an IMD endpoint, cache for 5 minutes, return None on any failure."""
    key = path + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
    now = time.time()

    with _lock:
        hit = _cache.get(key)
        if hit and hit["expires"] > now:
            return hit["data"]

    try:
        r = requests.get(f"{BASE}/{path}", params=params, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception:
        # Network error, timeout, non-200, or non-JSON — fall back to None.
        return None

    with _lock:
        _cache[key] = {"expires": now + CACHE_TTL, "data": data}
    return data


def city_forecast(station_id: str | None) -> Any | None:
    """7-day forecast for an IMD station."""
    if not station_id:
        return None
    return _get("cityforecast", {"id": station_id})


def current_weather(station_id: str | None) -> Any | None:
    """Live reading at an IMD station."""
    if not station_id:
        return None
    return _get("current_wx", {"id": station_id})


def district_nowcast(district_id: str | None) -> Any | None:
    """Short-term warning for a district."""
    if not district_id:
        return None
    return _get("districtnowcast", {"id": district_id})


def district_warnings(district_id: str | None) -> Any | None:
    """5-day warnings for a district."""
    if not district_id:
        return None
    return _get("districtwarning", {"id": district_id})
