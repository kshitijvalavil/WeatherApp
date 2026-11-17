"""Place names for coordinates, and coordinates for place names.

- Reverse lookup ("where am I?"): OpenStreetMap Nominatim. Its usage policy
  allows one request a second and asks for caching, so lookups are spaced
  out and kept for a day.
  https://operations.osmfoundation.org/policies/nominatim/
- Search ("find Lonavala"): Open-Meteo geocoding.
  https://open-meteo.com/en/docs/geocoding-api

Both fail soft. A missing place name shouldn't cost anyone their forecast.
"""
from __future__ import annotations

from ..upstream import Upstream, UpstreamError

DAY = 24 * 3600

_nominatim = Upstream(max_entries=2000, min_interval=1.0)
_open_meteo = Upstream(max_entries=2000)

# Nominatim address fields, most specific first.
_NAME_FIELDS = ("city", "town", "village", "suburb", "municipality", "county", "state_district")


def reverse(lat: float, lon: float) -> dict | None:
    """{'name': 'Kothrud', 'state': 'Maharashtra'} for a coordinate, or None."""
    try:
        data = _nominatim.get(
            "https://nominatim.openstreetmap.org/reverse",
            {"lat": round(lat, 2), "lon": round(lon, 2), "format": "jsonv2",
             "zoom": 12, "accept-language": "en"},
            ttl=DAY,
            timeout=6,
        )
    except UpstreamError:
        return None
    address = data.get("address") or {}
    name = next((address[f] for f in _NAME_FIELDS if address.get(f)), None)
    if not name:
        return None
    return {"name": name, "state": address.get("state") or address.get("country") or ""}


def search(query: str, limit: int = 6) -> list[dict]:
    """Places in India matching a name, biggest first."""
    q = query.strip().lower()
    if len(q) < 2:
        return []
    try:
        data = _open_meteo.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            {"name": q, "count": limit, "language": "en", "format": "json", "countryCode": "IN"},
            ttl=DAY,
            timeout=6,
        )
    except UpstreamError:
        return []
    return [
        {
            "name": row["name"],
            "state": row.get("admin1") or row.get("admin2") or "",
            "lat": round(row["latitude"], 4),
            "lon": round(row["longitude"], 4),
        }
        for row in data.get("results") or []
        if "name" in row and "latitude" in row and "longitude" in row
    ]
