"""The JSON API the web page talks to.

GET /api/cities                  the cities in the list
GET /api/summary                 current temperature and sky for each of them
GET /api/weather?city=<id>       the full forecast for one city
GET /api/weather?lat=..&lon=..   the full forecast anywhere
GET /api/places?q=<name>         search for towns in India
GET /api/health                  for the host's health check
"""
from __future__ import annotations

import logging
import math

from flask import Blueprint, jsonify, request

from . import forecast
from .cities import CITIES
from .providers import geo
from .upstream import UpstreamError

log = logging.getLogger(__name__)

api = Blueprint("api", __name__, url_prefix="/api")

# How long browsers may reuse each answer, in seconds.
FORECAST_MAX_AGE = 300
PLACES_MAX_AGE = 24 * 3600


@api.get("/cities")
def cities():
    return _cached(jsonify({"cities": CITIES}), 3600)


@api.get("/summary")
def summary():
    return _cached(jsonify({"cities": forecast.summary()}), FORECAST_MAX_AGE)


@api.get("/weather")
def weather():
    city_id = request.args.get("city", "").strip()
    lat = _coordinate(request.args.get("lat"), 90)
    lon = _coordinate(request.args.get("lon"), 180)

    if city_id:
        data = forecast.for_city(city_id)
        if data is None:
            return jsonify({"error": f"No city with the id '{city_id}'."}), 404
    elif lat is not None and lon is not None:
        data = forecast.for_point(lat, lon)
    else:
        return jsonify({"error": "Pass ?city=<id> or ?lat=<number>&lon=<number>."}), 400

    return _cached(jsonify(data), FORECAST_MAX_AGE)


@api.get("/places")
def places():
    found = geo.search(request.args.get("q", "")[:60])
    return _cached(jsonify({"places": found}), PLACES_MAX_AGE)


@api.get("/health")
def health():
    return jsonify({"ok": True})


@api.errorhandler(UpstreamError)
def upstream_failed(exc):
    log.error("upstream failed: %s", exc)
    return jsonify({"error": "The forecast service isn't answering. Try again in a minute."}), 502


def _coordinate(raw: str | None, limit: float) -> float | None:
    """A latitude or longitude from the query string, or None if it isn't one."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) and -limit <= value <= limit else None


def _cached(response, seconds: int):
    response.headers["Cache-Control"] = f"public, max-age={seconds}"
    return response
