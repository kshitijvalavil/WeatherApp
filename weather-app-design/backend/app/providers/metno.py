"""MET Norway: the forecast and the sun times.

Two products:
- Locationforecast 2.0 "complete": hourly for about two days, then every six
  hours out to nine or ten days. Complete rather than compact because only
  complete carries UV, dew point and the chance of rain.
- Sunrise 3.0.

Terms (https://api.met.no/doc/TermsOfService): identify the app in the
User-Agent, don't re-fetch before Expires, send at most four decimals of
latitude and longitude, and credit MET Norway on the page. `Upstream`
handles the first two; the page footer handles the last.

This module is the only place that knows MET Norway's JSON. Everything
else works with the flat rows returned by `rows()`.
"""
from __future__ import annotations

from datetime import datetime

from ..upstream import Upstream

BASE = "https://api.met.no/weatherapi"

_api = Upstream(max_entries=400)


def rows(lat: float, lon: float) -> list[dict]:
    """The forecast for a point, one flat dict per time step, oldest first.

    Each row describes the weather at `time` and, where the forecast has
    one, the period that follows it (`span_h` hours long: 1, 6, or 0 for
    the final row). Missing values are None.
    """
    data = _api.get(
        f"{BASE}/locationforecast/2.0/complete",
        {"lat": round(lat, 4), "lon": round(lon, 4)},
        ttl=300,
    )
    return [_row(entry) for entry in data["properties"]["timeseries"]]


def sun(lat: float, lon: float, date: str) -> dict:
    """Sunrise and sunset (ISO strings, IST) for a YYYY-MM-DD date."""
    data = _api.get(
        f"{BASE}/sunrise/3.0/sun",
        {"lat": round(lat, 4), "lon": round(lon, 4), "date": date, "offset": "+05:30"},
        ttl=6 * 3600,
    )
    props = data.get("properties") or {}
    return {
        "sunrise": (props.get("sunrise") or {}).get("time"),
        "sunset": (props.get("sunset") or {}).get("time"),
    }


def _row(entry: dict) -> dict:
    data = entry["data"]
    now = data["instant"]["details"]

    # Prefer the one-hour outlook; far-out rows only have a six-hour one.
    if "next_1_hours" in data:
        span, period = 1, data["next_1_hours"]
    elif "next_6_hours" in data:
        span, period = 6, data["next_6_hours"]
    else:
        span, period = 0, {}
    ahead = period.get("details") or {}
    wind = now.get("wind_speed")

    return {
        "time": datetime.fromisoformat(entry["time"].replace("Z", "+00:00")),
        "span_h": span,
        "temp_c": now.get("air_temperature"),
        "humidity": now.get("relative_humidity"),
        "dew_point_c": now.get("dew_point_temperature"),
        "wind_ms": wind,
        "wind_dir": now.get("wind_from_direction"),
        "uv": now.get("ultraviolet_index_clear_sky"),
        "symbol": (period.get("summary") or {}).get("symbol_code"),
        "rain_mm": ahead.get("precipitation_amount"),
        "rain_prob": ahead.get("probability_of_precipitation"),
        # Only six-hour periods carry these.
        "temp_max_c": ahead.get("air_temperature_max"),
        "temp_min_c": ahead.get("air_temperature_min"),
    }
