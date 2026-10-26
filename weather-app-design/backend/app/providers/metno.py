"""MET Norway client.

Covers two products:
- Locationforecast 2.0 complete: current and hourly forecast anywhere on Earth
  (complete, not compact, because only complete carries UV, fog and rain chance).
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
        # Visitors' own locations add new keys; keep memory bounded by
        # dropping the oldest entries once we hold a few hundred forecasts.
        if len(_cache) > 300:
            for k in sorted(_cache, key=lambda k: _cache[k]["expires"])[:100]:
                del _cache[k]
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
    """Return the complete forecast for a coordinate."""
    return _get(
        f"{BASE}/locationforecast/2.0/complete",
        {"lat": _round(lat), "lon": _round(lon)},
    )


def sunrise(lat: float, lon: float, date: str) -> dict:
    """Return sunrise/sunset for a date (YYYY-MM-DD)."""
    return _get(
        f"{BASE}/sunrise/3.0/sun",
        {"lat": _round(lat), "lon": _round(lon), "date": date, "offset": "+05:30"},
    )


# ---------- Helpers that pull the bits we care about ----------

def upcoming(forecast: dict) -> list[dict]:
    """The timeseries from the hour we're in now onwards.

    MET Norway's cached feed can start an hour or two in the past, so the
    first row isn't always "now". Each row covers the hour after its time.
    """
    series = forecast["properties"]["timeseries"]
    cutoff = datetime.now(timezone.utc).timestamp() - 3600
    rows = [r for r in series if _ts(r["time"]) > cutoff]
    return rows or series[-1:]


def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def current(forecast: dict) -> dict:
    """The forecast row for the hour we're in — treated as 'right now'."""
    series = upcoming(forecast)
    if not series:
        return {}
    first = series[0]
    inst = first["data"]["instant"]["details"]
    one_hour = first["data"].get("next_1_hours", {}).get("summary", {})
    temp = inst.get("air_temperature")
    hum = inst.get("relative_humidity")
    wind = _ms_to_kmh(inst.get("wind_speed"))
    return {
        "time": first["time"],
        "temp_c": temp,
        "feels_c": _feels_like(temp, hum, wind),
        "wind_kmh": wind,
        "wind_dir": inst.get("wind_from_direction"),
        "humidity": hum,
        "pressure": inst.get("air_pressure_at_sea_level"),
        "cloud_pct": inst.get("cloud_area_fraction"),
        "uv_index": inst.get("ultraviolet_index_clear_sky"),
        "fog_pct": inst.get("fog_area_fraction"),
        "symbol": one_hour.get("symbol_code"),
    }


def daily(forecast: dict, days: int = 10) -> list[dict]:
    """Aggregate the hourly timeseries into one row per calendar day (IST)."""
    from datetime import datetime, timezone, timedelta
    ist = timezone(timedelta(hours=5, minutes=30))

    buckets: dict[str, dict] = {}
    for row in forecast["properties"]["timeseries"]:
        t = datetime.fromisoformat(row["time"].replace("Z", "+00:00")).astimezone(ist)
        key = t.strftime("%Y-%m-%d")
        details = row["data"]["instant"]["details"]
        temp = details.get("air_temperature")
        six = row["data"].get("next_6_hours", {})
        one = row["data"].get("next_1_hours", {})
        rain = (six.get("details", {}) or {}).get("precipitation_amount") \
            or (one.get("details", {}) or {}).get("precipitation_amount") or 0.0
        sym = (six.get("summary", {}) or {}).get("symbol_code") \
            or (one.get("summary", {}) or {}).get("symbol_code")

        b = buckets.setdefault(key, {"date": key, "temps": [], "symbols": [], "rain": 0.0, "hour_sym": {}})
        if temp is not None:
            b["temps"].append((t.hour, temp))
        if sym:
            b["symbols"].append(sym)
            # Prefer afternoon symbol as the day's representative one.
            b["hour_sym"][t.hour] = sym
        b["rain"] += float(rain or 0.0)

    out = []
    for b in list(buckets.values())[:days]:
        if not b["temps"]:
            continue
        hi = max(v for _, v in b["temps"])
        lo = min(v for _, v in b["temps"])
        # Pick a representative symbol: whatever's at 14:00 if present, else most common.
        rep = b["hour_sym"].get(14) or b["hour_sym"].get(12) or (b["symbols"][0] if b["symbols"] else None)
        out.append({
            "date": b["date"],
            "hi_c": round(hi, 1),
            "lo_c": round(lo, 1),
            "rain_mm": round(b["rain"], 1),
            "symbol": rep,
        })
    return out


def _feels_like(t_c, humidity, wind_kmh):
    """Rough apparent temperature — Steadman-style for warm, wind-chill for cold."""
    if t_c is None:
        return None
    if humidity is None:
        humidity = 60
    if wind_kmh is None:
        wind_kmh = 0
    # Australian Apparent Temperature (simple and global)
    import math
    e = (humidity / 100.0) * 6.105 * math.exp(17.27 * t_c / (237.7 + t_c))
    at = t_c + 0.33 * e - 0.70 * (wind_kmh / 3.6) - 4.00
    return round(at, 1)


def visibility_km(current_dict: dict) -> float | None:
    """MET Norway has no visibility field. Estimate it from fog, humidity and cloud."""
    fog = current_dict.get("fog_pct")
    hum = current_dict.get("humidity")
    cloud = current_dict.get("cloud_pct")
    if fog is None and hum is None and cloud is None:
        return None
    fog = fog or 0
    hum = hum or 0
    cloud = cloud or 0
    # Start at 20 km clear, deduct for fog/humidity/cloud.
    v = 20.0
    v -= (fog / 100.0) * 18.0
    v -= max(0, (hum - 70)) * 0.15
    v -= (cloud / 100.0) * 2.0
    return max(0.3, round(v, 1))


def hourly(forecast: dict, hours: int = 12) -> list[dict]:
    """A short list of upcoming hours, starting with the current one."""
    series = upcoming(forecast)[:hours]
    out = []
    for row in series:
        details = row["data"]["instant"]["details"]
        one = row["data"].get("next_1_hours", {})
        out.append({
            "time": row["time"],
            "temp_c": details.get("air_temperature"),
            "symbol": one.get("summary", {}).get("symbol_code"),
            "rain_mm": one.get("details", {}).get("precipitation_amount"),
            "rain_prob": one.get("details", {}).get("probability_of_precipitation"),
            "uv": details.get("ultraviolet_index_clear_sky"),
        })
    return out


def uv_peak(forecast: dict) -> dict | None:
    """The highest UV of today's daylight, or tomorrow's if the sun is down.

    Walks forward from now and stops once a stretch of daylight (UV above
    zero) has ended, so at 3 PM it reports this afternoon, not tomorrow noon.
    """
    best = None
    for row in upcoming(forecast)[:30]:
        uv = row["data"]["instant"]["details"].get("ultraviolet_index_clear_sky")
        if uv is None:
            continue
        if uv <= 0.05 and best and best["value"] > 0.05:
            break
        if best is None or uv > best["value"]:
            best = {"value": uv, "time": row["time"]}
    return best


def _ms_to_kmh(ms):
    if ms is None:
        return None
    return round(ms * 3.6, 1)
