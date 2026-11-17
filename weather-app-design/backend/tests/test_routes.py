from app.providers import metno
from app.upstream import UpstreamError


def test_cities(client):
    cities = client.get("/api/cities").get_json()["cities"]
    assert len(cities) == 33
    assert set(cities[0]) == {"id", "name", "state", "lat", "lon"}


def test_weather_for_a_city(client):
    r = client.get("/api/weather?city=Mumbai")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "public, max-age=300"
    data = r.get_json()
    assert data["place"]["id"] == "mumbai"
    assert set(data) == {"place", "current", "uv_peak", "hourly", "daily", "sun"}


def test_weather_for_a_point_is_rounded_and_named(client):
    data = client.get("/api/weather?lat=18.75432&lon=73.40911").get_json()
    assert data["place"] == {"id": "@18.75,73.41", "name": "Lonavala", "state": "Maharashtra", "lat": 18.75, "lon": 73.41}


def test_weather_rejects_bad_input(client):
    assert client.get("/api/weather").status_code == 400
    assert client.get("/api/weather?lat=91&lon=10").status_code == 400
    assert client.get("/api/weather?lat=nan&lon=10").status_code == 400
    assert client.get("/api/weather?city=atlantis").status_code == 404


def test_upstream_failure_is_a_502_without_internals(client, monkeypatch):
    def down(lat, lon):
        raise UpstreamError("https://api.met.no/...: connection refused")
    monkeypatch.setattr(metno, "rows", down)
    r = client.get("/api/weather?city=delhi")
    assert r.status_code == 502
    assert "met.no" not in r.get_data(as_text=True)


def test_summary(client):
    cities = client.get("/api/summary").get_json()["cities"]
    assert len(cities) == 33
    assert all(c["temp_c"] is not None for c in cities)


def test_places(client):
    assert client.get("/api/places?q=lona").get_json()["places"][0]["name"] == "Lonavala"
    assert client.get("/api/places").get_json() == {"places": []}


def test_frontend_is_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"Mausam" in r.data
    assert r.headers["Cache-Control"] == "no-cache"
    assert "max-age=2592000" in client.get("/vendor/maplibre-gl.css").headers["Cache-Control"]
    assert client.get("/nope.js").status_code == 404
