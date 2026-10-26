"""The API the web page talks to.

Endpoints:
- GET /api/cities           — the list of supported cities
- GET /api/summary          — current temp + symbol for every city
- GET /api/weather?city=... — the weather for one of them
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from .cities import CITIES
from . import weather

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
    if not city_id:
        return jsonify({"error": "missing 'city' query parameter"}), 400

    try:
        data = weather.for_city(city_id)
    except Exception as e:
        # Surface a readable error for now; we'll log properly later.
        return jsonify({"error": "upstream failed", "detail": str(e)}), 502

    if data is None:
        return jsonify({"error": f"unknown city '{city_id}'"}), 404

    return jsonify(data)


@api.get("/summary")
def all_cities_summary():
    return jsonify({"cities": weather.summary()})


@api.get("/health")
def health():
    return jsonify({"ok": True})
