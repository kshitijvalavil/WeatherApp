"""IMD (India Meteorological Department) client — stub.

IMD's APIs (api.imd.gov.in) are not open: they need IP-whitelisted access.
We'll fill this in once that access comes through. For now, every function
returns None so the rest of the app can run without IMD data.

The endpoints we'll wire up first (base https://api.imd.gov.in/api/v1/):
- cityforecast?id=<station id>     — 7-day forecast
- current_wx?id=<station id>       — live station reading
- districtnowcast?id=<district id> — short warnings for the next hours
- districtwarning?id=<district id> — 5-day warnings
"""
from __future__ import annotations


def city_forecast(station_id: str | None) -> dict | None:
    """7-day forecast for an IMD station. Returns None until access is set up."""
    return None


def current_weather(station_id: str | None) -> dict | None:
    """Live reading at an IMD station. Returns None until access is set up."""
    return None


def district_nowcast(district_id: str | None) -> dict | None:
    """Short-term warning for a district. Returns None until access is set up."""
    return None


def district_warnings(district_id: str | None) -> dict | None:
    """5-day warnings for a district. Returns None until access is set up."""
    return None
