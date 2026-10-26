"""Build the simple weather response the web page shows.

The job here is to call MET Norway (and later IMD) and squash the result
into a small, predictable shape, so the frontend doesn't have to know
anything about the upstream APIs.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from .cities import find
from .providers import metno, imd


# Map MET Norway's symbol names into a small set the UI can draw.
SYMBOL_GROUPS = {
    "clearsky": "sunny",
    "fair": "sunny",
    "partlycloudy": "partly",
    "cloudy": "cloudy",
    "fog": "haze",
    "rain": "rain",
    "lightrain": "rain",
    "heavyrain": "rain",
    "rainshowers": "rain",
    "lightrainshowers": "rain",
    "heavyrainshowers": "rain",
    "sleet": "rain",
    "snow": "cloudy",
    "thunder": "thunder",
    "rainandthunder": "thunder",
    "rainshowersandthunder": "thunder",
    "heavyrainandthunder": "thunder",
}


def _group(symbol_code: str | None) -> str:
    """Turn 'partlycloudy_day' into 'partly'."""
    if not symbol_code:
        return "cloudy"
    core = symbol_code.split("_")[0]
    # MET's names sometimes have a trailing qualifier like "_day".
    return SYMBOL_GROUPS.get(core, "cloudy")


def for_city(city_id: str) -> dict | None:
    """Return everything the web page needs for one city, or None if unknown."""
    c = find(city_id)
    if not c:
        return None

    forecast = metno.locationforecast(c["lat"], c["lon"])
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d")
    sun = metno.sunrise(c["lat"], c["lon"], today)

    current = metno.current(forecast)
    hours = metno.hourly(forecast, hours=12)

    # IMD data goes alongside MET Norway's when it's available.
    imd_now = imd.current_weather(c.get("imd_id"))
    imd_warnings = imd.district_warnings(c.get("imd_id"))

    return {
        "city": {k: c[k] for k in ("id", "name", "state", "lat", "lon")},
        "current": {
            "temp_c": current.get("temp_c"),
            "symbol": _group(current.get("symbol")),
            "raw_symbol": current.get("symbol"),
            "wind_kmh": current.get("wind_kmh"),
            "humidity": current.get("humidity"),
            "cloud_pct": current.get("cloud_pct"),
        },
        "hourly": [
            {
                "time": h["time"],
                "temp_c": h["temp_c"],
                "symbol": _group(h["symbol"]),
                "rain_mm": h["rain_mm"],
            }
            for h in hours
        ],
        "sun": _sun(sun),
        "imd": {
            "now": imd_now,
            "warnings": imd_warnings,
        },
        "sources": ["MET Norway"] + (["IMD"] if imd_now else []),
    }


def _sun(sun_json: dict) -> dict:
    """Pick sunrise and sunset times out of MET Norway's Sunrise response."""
    try:
        props = sun_json["properties"]
        return {
            "sunrise": props["sunrise"]["time"],
            "sunset": props["sunset"]["time"],
        }
    except (KeyError, TypeError):
        return {"sunrise": None, "sunset": None}
