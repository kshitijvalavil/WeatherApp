from datetime import datetime, timedelta, timezone

import pytest

from app import forecast
from app.providers import metno
from app.upstream import UpstreamError

from . import fake_met
from .conftest import FEED_START

PUNE = {"id": "pune", "name": "Pune", "state": "Maharashtra", "lat": 18.5204, "lon": 73.8567}


@pytest.mark.parametrize("symbol, expected", [
    ("clearsky_day", "clear"),
    ("fair_night", "clear"),
    ("partlycloudy_day", "partly"),
    ("cloudy", "cloudy"),
    ("fog", "fog"),
    ("lightrain", "rain"),
    ("heavyrainshowers_day", "rain"),
    ("sleet", "rain"),
    ("heavysnow", "snow"),
    ("lightsnowshowers_night", "snow"),
    ("lightrainandthunder", "thunder"),
    ("heavyrainshowersandthunder_day", "thunder"),
    ("lightssnowshowersandthunder_day", "thunder"),  # MET Norway's own typo
    ("somethingnew", "cloudy"),
    (None, None),
])
def test_condition_covers_the_symbol_families(symbol, expected):
    assert forecast.condition(symbol) == expected


def test_night_comes_from_the_symbol_suffix():
    assert forecast.is_night("clearsky_night")
    assert not forecast.is_night("clearsky_day")
    assert not forecast.is_night("cloudy")
    assert not forecast.is_night(None)


def test_feels_like_rises_with_humidity_and_falls_with_wind():
    assert forecast.feels_like(32, 80, 1) > forecast.feels_like(32, 30, 1)
    assert forecast.feels_like(10, 50, 10) < forecast.feels_like(10, 50, 0)
    assert forecast.feels_like(None, 50, 1) is None


def test_dew_point_matches_a_known_value():
    assert forecast.dew_point(30, 50) == pytest.approx(18.4, abs=0.2)
    assert forecast.dew_point(30, None) is None


def test_current_is_the_hour_we_are_in_not_the_start_of_the_feed(met, now):
    data = forecast.build(PUNE, now)
    assert data["current"]["time"] == "2026-11-17T03:00:00Z"
    assert data["current"]["temp_c"] == fake_met.temp_at(now.replace(minute=0), 26.0)
    assert data["current"]["condition"] == "clear"
    assert data["current"]["night"] is False
    assert data["current"]["wind_kmh"] == 12.6


def test_hourly_is_24_hours_from_now(met, now):
    hours = forecast.build(PUNE, now)["hourly"]
    assert len(hours) == 24
    assert hours[0]["time"] == "2026-11-17T03:00:00Z"
    assert hours[-1]["time"] == "2026-11-18T02:00:00Z"
    assert [h["night"] for h in hours[:3]] == [False, False, False]
    assert hours[12]["night"] is True  # 20:30 IST


def test_a_stale_feed_still_gives_an_answer(met):
    long_after = FEED_START + timedelta(days=30)
    assert forecast.build(PUNE, long_after)["current"]["temp_c"] is not None


def test_an_empty_feed_is_an_upstream_error(met, now):
    met.forecast = {"properties": {"timeseries": []}}
    with pytest.raises(UpstreamError):
        forecast.build(PUNE, now)


def test_missing_sun_times_do_not_fail_the_forecast(met, now, monkeypatch):
    def down(*args):
        raise UpstreamError("sunrise is down")
    monkeypatch.setattr(metno, "sun", down)
    data = forecast.build(PUNE, now)
    assert data["sun"] == {"sunrise": None, "sunset": None}
    assert data["current"]["temp_c"] is not None


def test_uv_peak_is_this_afternoon_while_the_sun_is_up(met, now):
    peak = forecast.build(PUNE, now)["uv_peak"]
    assert peak["time"].startswith("2026-11-17T06")  # around noon IST
    assert peak["value"] > 8


def test_uv_peak_is_tomorrow_once_the_sun_is_down(met):
    evening = datetime(2026, 11, 17, 15, 0, tzinfo=timezone.utc)  # 20:30 IST
    peak = forecast.build(PUNE, evening)["uv_peak"]
    assert peak["time"].startswith("2026-11-18T06")


def test_daily_rain_counts_each_hour_once(met):
    met.forecast = fake_met.forecast(FEED_START, wet_hours=range(4, 8))
    days = forecast.daily(metno.rows(0, 0))
    # Four wet hours at 2.5 mm. Adding the six-hour totals on top of the
    # hourly ones, as an earlier version did, would give several times this.
    assert days[0]["rain_mm"] == 10.0
    assert days[0]["condition"] == "rain"
    assert days[1]["rain_mm"] == 0.0


def test_daily_takes_the_most_serious_wet_condition(met):
    met.forecast = fake_met.forecast(FEED_START, wet="heavyrainandthunder", wet_hours=range(4, 5))
    assert forecast.daily(metno.rows(0, 0))[0]["condition"] == "thunder"


def test_a_dry_day_shows_its_daytime_sky_not_the_night(met):
    met.forecast = fake_met.forecast(FEED_START, sky="partlycloudy")
    assert all(d["condition"] == "partly" for d in forecast.daily(metno.rows(0, 0)))


def test_daily_highs_in_the_six_hourly_range_include_the_afternoon_peak(met):
    days = forecast.daily(metno.rows(0, 0))
    # 26 +/- 5 through the day. The six-hourly instants alone top out near
    # 29.5; the period maximum recovers the real 31.
    assert days[5]["hi_c"] == pytest.approx(31.0, abs=0.2)
    assert days[5]["lo_c"] == pytest.approx(21.0, abs=0.2)


def test_daily_drops_a_last_day_the_feed_barely_covers(met):
    days = forecast.daily(metno.rows(0, 0))
    dates = [d["date"] for d in days]
    assert dates[0] == "2026-11-17"
    assert dates == sorted(set(dates))
    assert dates[-1] == "2026-11-25"  # the feed ends 07:30 IST on the 26th


def test_nearest_city():
    city, km = forecast.nearest_city(18.75, 73.41)  # Lonavala
    assert city["id"] == "pune"
    assert 50 < km < 60


def test_summary_survives_one_city_failing(met, monkeypatch):
    real = metno.rows

    def flaky(lat, lon):
        if round(lat, 2) == 19.08:  # Mumbai
            raise UpstreamError("timeout")
        return real(lat, lon)

    monkeypatch.setattr(metno, "rows", flaky)
    by_id = {c["id"]: c for c in forecast.summary()}
    assert by_id["mumbai"] == {"id": "mumbai", "temp_c": None, "condition": None, "night": False}
    assert by_id["delhi"]["temp_c"] is not None
