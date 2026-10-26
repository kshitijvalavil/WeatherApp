# Mausam backend

A small Flask backend for the weather app. It fetches weather from
[MET Norway](https://api.met.no) (worldwide) and will fetch from the
[India Meteorological Department](https://api.imd.gov.in) once access
is approved.

## Why a backend at all

MET Norway asks every app to send a `User-Agent` header that identifies
it, and browsers can't set that header. So we run a tiny server that
calls the weather APIs, caches the answers, and hands them to the web
page as plain JSON.

## Run it

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Then open http://localhost:5000/api/cities or
http://localhost:5000/api/weather?city=mumbai in your browser.
Any spot works too: /api/weather?lat=18.51&lon=73.81, and /api/places?q=lonavala
searches for towns.

## What's inside

```
backend/
  run.py                     # starts the Flask app
  requirements.txt
  app/
    __init__.py              # builds the Flask app
    routes.py                # /api/cities, /api/weather, /api/places, /api/summary
    cities.py                # the 33 Indian cities in the list
    weather.py               # merges MET Norway + IMD into one response
    providers/
      metno.py               # Locationforecast + Sunrise
      imd.py                 # stub until IMD approves access
      geo.py                 # place names (Nominatim) and town search (Open-Meteo)
```

## Production

In production use gunicorn, not `python run.py`:

```
gunicorn --workers 2 --bind 0.0.0.0:$PORT "app:create_app()"
```

See `../DEPLOY.md` for the Render blueprint we use.

## Credit

Data is from MET Norway (CC BY 4.0) and IMD. The web page shows the
credit; the backend only fetches.
