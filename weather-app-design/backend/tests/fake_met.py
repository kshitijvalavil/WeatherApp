"""Builds forecasts in MET Norway's format, so tests never touch the network.

The shape follows Locationforecast 2.0 "complete": hourly rows for the
first couple of days, six-hourly rows after that, and a last row with no
outlook at all.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

SUFFIXED = {"clearsky", "fair", "partlycloudy", "rainshowers", "lightrainshowers"}


def forecast(start: datetime, *, sky: str = "clearsky", wet: str = "rain",
             wet_hours: range = range(0), base_temp: float = 26.0,
             hourly: int = 55, days: int = 9) -> dict:
    """A forecast starting at `start` (a whole UTC hour).

    `sky` is the dry-weather symbol. Hours whose index falls in `wet_hours`
    get the `wet` symbol and 2.5 mm of rain each.
    """
    entries = []
    t = start
    for i in range(hourly):
        entries.append(_entry(t, 1, i in wet_hours, sky, wet, base_temp))
        t += timedelta(hours=1)
    while t.hour % 6:  # the six-hourly part sits on 00, 06, 12 and 18 UTC
        entries.append(_entry(t, 1, False, sky, wet, base_temp))
        t += timedelta(hours=1)
    end = start + timedelta(days=days)
    while t < end:
        entries.append(_entry(t, 6, False, sky, wet, base_temp))
        t += timedelta(hours=6)
    entries.append(_entry(t, 0, False, sky, wet, base_temp))
    return {"type": "Feature", "properties": {"meta": {"updated_at": _z(start)}, "timeseries": entries}}


def sun(date: str) -> dict:
    return {"properties": {
        "sunrise": {"time": f"{date}T06:40+05:30"},
        "sunset": {"time": f"{date}T17:55+05:30"},
    }}


def temp_at(t: datetime, base: float) -> float:
    """Warmest at 14:30 IST, coolest at 02:30."""
    local = t.astimezone(IST)
    hour = local.hour + local.minute / 60
    return round(base + 5 * math.cos((hour - 14.5) / 24 * 2 * math.pi), 1)


def _entry(t: datetime, span: int, is_wet: bool, sky: str, wet: str, base: float) -> dict:
    local = t.astimezone(IST)
    hour = local.hour + local.minute / 60
    daylight = 6.5 <= hour < 18
    instant = {
        "air_pressure_at_sea_level": 1012.0,
        "air_temperature": temp_at(t, base),
        "cloud_area_fraction": 90.0 if is_wet else 20.0,
        "relative_humidity": 85.0 if is_wet else 55.0,
        "wind_from_direction": 250.0,
        "wind_speed": 3.5,
    }
    if span == 1:  # the long-range rows carry fewer fields
        instant["dew_point_temperature"] = round(instant["air_temperature"] - (3 if is_wet else 9), 1)
        instant["ultraviolet_index_clear_sky"] = round(max(0.0, 9 * math.sin(math.pi * (hour - 6) / 12)), 1) if daylight else 0.0
        instant["fog_area_fraction"] = 0.0

    data = {"instant": {"details": instant}}
    if span:
        symbol = wet if is_wet else sky
        if symbol in SUFFIXED:
            symbol += "_day" if daylight else "_night"
        details = {
            "precipitation_amount": 2.5 if is_wet else 0.0,
            "probability_of_precipitation": 80.0 if is_wet else 5.0,
        }
        if span == 6:
            temps = [temp_at(t + timedelta(hours=h), base) for h in range(7)]
            details["air_temperature_max"] = max(temps)
            details["air_temperature_min"] = min(temps)
        data[f"next_{span}_hours"] = {"summary": {"symbol_code": symbol}, "details": details}
    return {"time": _z(t), "data": data}


def _z(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")
