"""MET Norway client.

Covers two products:
- Locationforecast 2.0 compact: current and hourly forecast anywhere on Earth.
- Sunrise 3.0: sunrise and sunset times.

Rules we have to follow (from https://api.met.no/doc/TermsOfService):
- Send a User-Agent that identifies the app and a contact.
- Don't ask more often than the Expires header says.
- Round coordinates to 4 decimal places.
- Credit MET Norway on the page.
"""
from __future__ import annotations

import time
import threading
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

import requests

# The real address goes here when the app is deployed. GitHub repo URL is a
# fine way to identify the app, per MET Norway's examples.
USER_AGENT = "MausamWeatherApp/0.1 github.com/kshitijvalavil/weather-app"

BASE = "https://api.met.no/weatherapi"

# Simple in-memory cache: { url: {"expires": epoch, "last_modified": str, "data": dict} }
_cache: dict[str, dict] = {}
_lock = threading.Lock()


def _get(url: str, params: dict | None = None) -> dict:
    """Fetch a MET Norway URL, respecting Expires and If-Modified-Since."""
    key = url + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))

    with _lock:
        hit = _cache.get(key)

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    now = time.time()

    if hit:
        # If the cache is still fresh, hand back the stored copy.
        if hit["expires"] > now:
            return hit["data"]
        # Otherwise ask MET Norway, but say "only send me new data if it changed".
        if hit.get("last_modified"):
            headers["If-Modified-Since"] = hit["last_modified"]

    r = requests.get(url, params=params, headers=headers, timeout=10)

    if r.status_code == 304 and hit:
        # Unchanged. Reset the expiry and reuse what we had.
        expires = _parse_expires(r.headers.get("Expires")) or (now + 300)
        with _lock:
            hit["expires"] = expires
        return hit["data"]

    r.raise_for_status()
    data = r.json()
    expires = _parse_expires(r.headers.get("Expires")) or (now + 300)

    with _lock:
        _cache[key] = {
            "expires": expires,
            "last_modified": r.headers.get("Last-Modified"),
            "data": data,
        }
    return data


def _parse_expires(header: str | None) -> float | None:
    if not header:
        return None
    try:
        return parsedate_to_datetime(header).timestamp()
    except Exception:
        return None


def _round(x: float) -> float:
    # MET Norway asks for at most 4 decimal places.
    return round(x, 4)


def locationforecast(lat: float, lon: float) -> dict:
    """Return the compact forecast for a coordinate."""
    return _get(
        f"{BASE}/locationforecast/2.0/compact",
        {"lat": _round(lat), "lon": _round(lon)},
    )


def sunrise(lat: float, lon: float, date: str) -> dict:
    """Return sunrise/sunset for a date (YYYY-MM-DD)."""
    return _get(
        f"{BASE}/sunrise/3.0/sun",
        {"lat": _round(lat), "lon": _round(lon), "date": date, "offset": "+05:30"},
    )


# ---------- Helpers that pull the bits we care about ----------

def current(forecast: dict) -> dict:
    """The first hour of the forecast — treated as 'right now'."""
    series = forecast["properties"]["timeseries"]
    if not series:
        return {}
    first = series[0]
    inst = first["data"]["instant"]["details"]
    one_hour = first["data"].get("next_1_hours", {}).get("summary", {})
    return {
        "time": first["time"],
        "temp_c": inst.get("air_temperature"),
        "wind_kmh": _ms_to_kmh(inst.get("wind_speed")),
        "wind_dir": inst.get("wind_from_direction"),
        "humidity": inst.get("relative_humidity"),
        "pressure": inst.get("air_pressure_at_sea_level"),
        "cloud_pct": inst.get("cloud_area_fraction"),
        "symbol": one_hour.get("symbol_code"),
    }


def hourly(forecast: dict, hours: int = 12) -> list[dict]:
    """A short list of upcoming hours."""
    series = forecast["properties"]["timeseries"][:hours]
    out = []
    for row in series:
        details = row["data"]["instant"]["details"]
        one = row["data"].get("next_1_hours", {})
        out.append({
            "time": row["time"],
            "temp_c": details.get("air_temperature"),
            "symbol": one.get("summary", {}).get("symbol_code"),
            "rain_mm": one.get("details", {}).get("precipitation_amount"),
        })
    return out


def _ms_to_kmh(ms):
    if ms is None:
        return None
    return round(ms * 3.6, 1)
