"""The API the web page talks to.

Endpoints:
- GET /api/cities           — the list of supported cities
- GET /api/summary          — current temp + symbol for every city
- GET /api/weather?city=... — the weather for one of them
- GET /api/weather?lat=..&lon=.. — the weather anywhere (e.g. "my location")
- GET /api/places?q=...     — search for towns and places in India
"""
from __future__ import annotations

import math

from flask import Blueprint, jsonify, request

from .cities import CITIES
from . import weather
from .providers import geo

api = Blueprint("api", __name__, url_prefix="/api")


@api.get("/cities")
def list_cities():
    return jsonify({
        "cities": [
            {k: c[k] for k in ("id", "name", "state", "lat", "lon")}
            for c in CITIES
        ]
    })


@api.get("/weather")
def city_weather():
    city_id = request.args.get("city", "").strip()
    lat, lon = _coord(request.args.get("lat"), 90), _coord(request.args.get("lon"), 180)
    if not city_id and (lat is None or lon is None):
        return jsonify({"error": "pass ?city=<id> or ?lat=<num>&lon=<num>"}), 400

    try:
        data = weather.for_city(city_id) if city_id else weather.for_point(lat, lon)
    except Exception as e:
        # Surface a readable error for now; we'll log properly later.
        return jsonify({"error": "upstream failed", "detail": str(e)}), 502

    if data is None:
        return jsonify({"error": f"unknown city '{city_id}'"}), 404

    return jsonify(data)


@api.get("/places")
def places():
    return jsonify({"places": geo.search(request.args.get("q", "")[:60])})


def _coord(raw: str | None, limit: float) -> float | None:
    """A latitude/longitude from the query string, or None if it isn't one."""
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) and -limit <= v <= limit else None


@api.get("/summary")
def all_cities_summary():
    return jsonify({"cities": weather.summary()})


@api.get("/health")
def health():
    return jsonify({"ok": True})
