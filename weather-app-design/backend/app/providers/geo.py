"""Place names for coordinates, and coordinates for place names.

- Reverse lookup (where am I?): OpenStreetMap Nominatim. Free, no key.
  Its policy asks for a real User-Agent, at most one request a second,
  and caching, so lookups are rounded to ~1 km and kept for a day.
  https://operations.osmfoundation.org/policies/nominatim/
- Search (find "Lonavala"): Open-Meteo geocoding. Free, no key.
  https://open-meteo.com/en/docs/geocoding-api

Both fail soft: callers get None or [] and carry on.
"""
from __future__ import annotations

import threading
import time

import requests

from .metno import USER_AGENT

_cache: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()
_last_nominatim = 0.0
DAY = 24 * 3600


def _cached(key: str, ttl: float, fetch):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = fetch()
    if value:  # don't remember failures; try again next time
        with _lock:
            if len(_cache) > 2000:
                _cache.clear()
            _cache[key] = (now + ttl, value)
    return value


def reverse(lat: float, lon: float) -> dict | None:
    """{'name': 'Kothrud', 'state': 'Maharashtra'} for a coordinate, or None."""
    lat, lon = round(lat, 2), round(lon, 2)

    def fetch():
        global _last_nominatim
        # Nominatim allows one request a second across the whole app.
        with _lock:
            wait = _last_nominatim + 1.0 - time.time()
            _last_nominatim = time.time() + max(0.0, wait)
        if wait > 0:
            time.sleep(wait)
        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 12, "accept-language": "en"},
                headers={"User-Agent": USER_AGENT},
                timeout=6,
            )
            r.raise_for_status()
            a = r.json().get("address", {})
        except Exception:
            return None
        name = (a.get("city") or a.get("town") or a.get("village") or a.get("suburb")
                or a.get("municipality") or a.get("county") or a.get("state_district"))
        if not name:
            return None
        return {"name": name, "state": a.get("state") or a.get("country") or ""}

    return _cached(f"rev:{lat},{lon}", DAY, fetch)


def search(query: str, limit: int = 6) -> list[dict]:
    """Places in India matching a name, biggest first."""
    q = query.strip()
    if len(q) < 2:
        return []

    def fetch():
        try:
            r = requests.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": q, "count": limit, "language": "en", "format": "json", "countryCode": "IN"},
                headers={"User-Agent": USER_AGENT},
                timeout=6,
            )
            r.raise_for_status()
            rows = r.json().get("results") or []
        except Exception:
            return []
        return [
            {
                "name": row["name"],
                "state": row.get("admin1") or row.get("admin2") or "",
                "lat": round(row["latitude"], 4),
                "lon": round(row["longitude"], 4),
            }
            for row in rows
            if "latitude" in row and "longitude" in row
        ]

    return _cached(f"q:{q.lower()}", DAY, fetch)
