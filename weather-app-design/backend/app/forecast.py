"""Turn forecast rows into the response the web page draws.

The page never sees MET Norway's format. It gets a place, the current
conditions, the next 24 hours, a day-by-day outlook and the sun times.
"""
from __future__ import annotations

import math
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .cities import CITIES, find
from .providers import geo, metno
from .upstream import UpstreamError

IST = ZoneInfo("Asia/Kolkata")

# Wet conditions, most serious first. A day with any thunder is a thunder day.
WET = ("thunder", "snow", "rain")


def condition(symbol: str | None) -> str | None:
    """Reduce one of MET Norway's ~40 symbol codes to a sky the page can draw.

    Codes look like 'lightrainshowersandthunder_day'. Matching on the words
    inside them covers the whole family without listing every variant.
    """
    if not symbol:
        return None
    core = symbol.split("_")[0]
    if "thunder" in core:
        return "thunder"
    if "snow" in core:
        return "snow"
    if "rain" in core or "sleet" in core:
        return "rain"
    if core == "fog":
        return "fog"
    if core == "partlycloudy":
        return "partly"
    if core in ("clearsky", "fair"):
        return "clear"
    return "cloudy"


def is_night(symbol: str | None) -> bool:
    """Clear and partly-cloudy codes say whether the sun is up."""
    return bool(symbol) and symbol.endswith("_night")


def feels_like(temp_c, humidity, wind_ms):
    """Apparent temperature in the shade (Steadman, as used by Australia's BoM).

    Humidity pushes it up, wind pulls it down. One formula holds from a
    Leh winter to a Chennai summer, which a heat index or wind chill alone
    would not.
    """
    if temp_c is None:
        return None
    humidity = 60 if humidity is None else humidity
    vapour_hpa = (humidity / 100) * 6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))
    return round(temp_c + 0.33 * vapour_hpa - 0.70 * (wind_ms or 0) - 4.0, 1)


def dew_point(temp_c, humidity):
    """Magnus approximation, for rows where MET Norway doesn't supply one."""
    if temp_c is None or not humidity or humidity <= 0:
        return None
    g = math.log(humidity / 100) + 17.62 * temp_c / (243.12 + temp_c)
    return round(243.12 * g / (17.62 - g), 1)


# ---------- One place ----------

def for_city(city_id: str) -> dict | None:
    """The full forecast for one of our cities, or None if it isn't one."""
    city = find(city_id)
    return build(city) if city else None


def for_point(lat: float, lon: float) -> dict:
    """The full forecast for any coordinate, such as the visitor's location.

    Coordinates are rounded to about 1 km. That is plenty for a forecast,
    lets nearby visitors share a cached answer, and means we never handle
    anyone's exact position.
    """
    lat, lon = round(lat, 2), round(lon, 2)
    place = geo.reverse(lat, lon)
    if place is None:
        city, km = nearest_city(lat, lon)
        if km < 15:
            place = {"name": city["name"], "state": city["state"]}
        else:
            place = {"name": "Your location", "state": f"{km:.0f} km from {city['name']}"}
    return build({"id": f"@{lat},{lon}", "lat": lat, "lon": lon, **place})


def nearest_city(lat: float, lon: float) -> tuple[dict, float]:
    """The closest of our cities and its distance in km (haversine)."""
    def km(c):
        p1, p2 = math.radians(lat), math.radians(c["lat"])
        dp, dl = p2 - p1, math.radians(c["lon"] - lon)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 6371 * 2 * math.asin(math.sqrt(h))

    best = min(CITIES, key=km)
    return best, km(best)


def build(place: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    rows = metno.rows(place["lat"], place["lon"])
    ahead = upcoming(rows, now)
    try:
        sun = metno.sun(place["lat"], place["lon"], now.astimezone(IST).date().isoformat())
    except UpstreamError:
        sun = {"sunrise": None, "sunset": None}  # the page copes without sun times

    return {
        "place": {k: place[k] for k in ("id", "name", "state", "lat", "lon")},
        "current": current(ahead[0]),
        "uv_peak": uv_peak(ahead),
        "hourly": [_hour(r) for r in ahead[:24] if r["span_h"] == 1],
        "daily": daily(rows),
        "sun": sun,
    }


def upcoming(rows: list[dict], now: datetime) -> list[dict]:
    """Rows from the hour we're in onwards.

    A cached feed can start an hour or two in the past, so the first row
    isn't always "now". Each row covers the hour after its time.
    """
    if not rows:
        raise UpstreamError("forecast has no rows")
    cutoff = now - timedelta(hours=1)
    return [r for r in rows if r["time"] > cutoff] or rows[-1:]


def current(row: dict) -> dict:
    """The row for the hour we're in, which is as close to 'now' as a forecast gets."""
    dew = row["dew_point_c"]
    return {
        "time": _iso(row["time"]),
        "temp_c": row["temp_c"],
        "feels_c": feels_like(row["temp_c"], row["humidity"], row["wind_ms"]),
        "condition": condition(row["symbol"]),
        "night": is_night(row["symbol"]),
        "wind_kmh": None if row["wind_ms"] is None else round(row["wind_ms"] * 3.6, 1),
        "wind_dir": row["wind_dir"],
        "humidity": row["humidity"],
        "dew_point_c": dew if dew is not None else dew_point(row["temp_c"], row["humidity"]),
        "uv": row["uv"],
    }


def _hour(row: dict) -> dict:
    return {
        "time": _iso(row["time"]),
        "temp_c": row["temp_c"],
        "condition": condition(row["symbol"]),
        "night": is_night(row["symbol"]),
        "rain_mm": row["rain_mm"],
        "rain_prob": row["rain_prob"],
    }


def uv_peak(ahead: list[dict]) -> dict | None:
    """The highest UV of today's daylight, or tomorrow's if the sun is down.

    Walks forward and stops once a stretch of daylight has ended, so at
    3 PM it reports this afternoon rather than tomorrow noon.
    """
    best = None
    for row in ahead[:30]:
        uv = row["uv"]
        if uv is None:
            continue
        if uv <= 0.05 and best and best["value"] > 0.05:
            break
        if best is None or uv > best["value"]:
            best = {"value": uv, "time": _iso(row["time"])}
    return best


def daily(rows: list[dict], days: int = 10) -> list[dict]:
    """One entry per calendar day in IST: high, low, rain and a sky.

    The first day starts at whatever hour the feed starts, so "today" only
    reflects the hours that are left. Later days are dropped if the feed
    covers less than half of them, because a high taken from a 5 AM reading
    alone would be nonsense.
    """
    by_date: dict[str, list[dict]] = {}
    for row in rows:
        by_date.setdefault(row["time"].astimezone(IST).date().isoformat(), []).append(row)

    out = []
    for i, (date, day) in enumerate(by_date.items()):
        if i > 0 and sum(r["span_h"] for r in day) < 12:
            continue
        # Six-hourly rows sample 05:30, 11:30, 17:30 and 23:30, which misses
        # the mid-afternoon peak; their period max/min fill that gap.
        temps = [r[k] for r in day for k in ("temp_c", "temp_max_c", "temp_min_c") if r[k] is not None]
        if not temps:
            continue
        rain = sum(r["rain_mm"] or 0 for r in day)
        out.append({
            "date": date,
            "hi_c": round(max(temps), 1),
            "lo_c": round(min(temps), 1),
            "rain_mm": round(rain, 1),
            "condition": _day_condition(day, rain),
        })
    return out[:days]


def _day_condition(day: list[dict], rain_mm: float) -> str | None:
    """The sky that best sums up a day.

    If it rains at least a millimetre, the day gets its most serious wet
    condition. Otherwise it gets whatever the daylight hours mostly look like.
    """
    seen = [(r, condition(r["symbol"])) for r in day if r["symbol"]]
    if not seen:
        return None
    if rain_mm >= 1:
        for wet in WET:
            if any(c == wet for _, c in seen):
                return wet

    def in_daylight(row):
        middle = row["time"].astimezone(IST) + timedelta(hours=row["span_h"] / 2)
        return 6 <= middle.hour < 18

    daylight = [c for r, c in seen if in_daylight(r)] or [c for _, c in seen]
    return Counter(daylight).most_common(1)[0][0]


# ---------- Every city at a glance ----------

def summary() -> list[dict]:
    """Current temperature and sky for every city, for the list and the map."""
    now = datetime.now(timezone.utc)

    def one(city):
        try:
            row = upcoming(metno.rows(city["lat"], city["lon"]), now)[0]
        except UpstreamError:
            return {"id": city["id"], "temp_c": None, "condition": None, "night": False}
        return {
            "id": city["id"],
            "temp_c": row["temp_c"],
            "condition": condition(row["symbol"]),
            "night": is_night(row["symbol"]),
        }

    # MET Norway allows 20 requests a second; eight at a time stays well under.
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(one, CITIES))


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
