"""Build the simple weather response the web page shows.

The job here is to call MET Norway (and later IMD) and squash the result
into a small, predictable shape, so the frontend doesn't have to know
anything about the upstream APIs.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import math

from .cities import CITIES, find
from .providers import metno, imd, geo


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
    return _build(c)


def for_point(lat: float, lon: float) -> dict:
    """Weather for any coordinate, e.g. the visitor's own location.

    Coordinates are rounded to about 1 km: plenty for a forecast, kinder
    to the upstream caches, and we never need the visitor's exact spot.
    """
    lat, lon = round(lat, 2), round(lon, 2)
    near = nearest_city(lat, lon)
    place = geo.reverse(lat, lon)
    if place is None:
        # No place name; borrow the nearest city's if we're inside it.
        if near["km"] < 15:
            place = {"name": near["city"]["name"], "state": near["city"]["state"]}
        else:
            place = {"name": "Your location", "state": f"{near['km']:.0f} km from {near['city']['name']}"}
    c = {"id": f"@{lat},{lon}", "name": place["name"], "state": place["state"], "lat": lat, "lon": lon}
    return _build(c)


def nearest_city(lat: float, lon: float) -> dict:
    """The closest of our cities, and how far away it is."""
    def km(c):
        # Haversine distance.
        p1, p2 = math.radians(lat), math.radians(c["lat"])
        dp, dl = p2 - p1, math.radians(c["lon"] - lon)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 6371 * 2 * math.asin(math.sqrt(h))
    best = min(CITIES, key=km)
    return {"city": best, "km": km(best)}


def _build(c: dict) -> dict:
    forecast = metno.locationforecast(c["lat"], c["lon"])
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d")
    sun = metno.sunrise(c["lat"], c["lon"], today)

    current = metno.current(forecast)
    hours = metno.hourly(forecast, hours=24)
    days = metno.daily(forecast, days=10)
    vis = metno.visibility_km(current)

    # IMD data goes alongside MET Norway's when it's available.
    imd_now = imd.current_weather(c.get("imd_id"))
    imd_warnings = imd.district_warnings(c.get("imd_id"))

    return {
        "city": {k: c[k] for k in ("id", "name", "state", "lat", "lon")},
        "current": {
            "temp_c": current.get("temp_c"),
            "feels_c": current.get("feels_c"),
            "symbol": _group(current.get("symbol")),
            "raw_symbol": current.get("symbol"),
            "wind_kmh": current.get("wind_kmh"),
            "wind_dir": current.get("wind_dir"),
            "humidity": current.get("humidity"),
            "cloud_pct": current.get("cloud_pct"),
            "uv_index": current.get("uv_index"),
            "uv_peak": metno.uv_peak(forecast),
            "visibility_km": vis,
        },
        "hourly": [
            {
                "time": h["time"],
                "temp_c": h["temp_c"],
                "symbol": _group(h["symbol"]),
                "rain_mm": h["rain_mm"],
                "rain_prob": h.get("rain_prob"),
                "uv": h.get("uv"),
            }
            for h in hours
        ],
        "daily": [
            {
                "date": d["date"],
                "hi_c": d["hi_c"],
                "lo_c": d["lo_c"],
                "rain_mm": d["rain_mm"],
                "symbol": _group(d["symbol"]),
            }
            for d in days
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


def summary() -> list[dict]:
    """Current temperature and symbol for every city, fetched in parallel."""
    from concurrent.futures import ThreadPoolExecutor

    def one(c):
        try:
            cur = metno.current(metno.locationforecast(c["lat"], c["lon"]))
            return {"id": c["id"], "temp_c": cur.get("temp_c"), "symbol": _group(cur.get("symbol"))}
        except Exception:
            return {"id": c["id"], "temp_c": None, "symbol": None}

    # MET Norway allows 20 req/s; 6 workers stays well under that.
    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(one, CITIES))
