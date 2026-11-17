# Mausam

Weather for cities and towns across India: what it's doing now, the next
24 hours, the days ahead, and a map of the whole country with live rain
radar.

Forecasts come from [MET Norway](https://api.met.no). No API keys are
needed anywhere.

## Run it

```bash
cd weather-app-design/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python run.py
```

Then open <http://localhost:5000>.

Run the tests with `python -m pytest` from the same folder. They use a
fake forecast feed, so they need no network.

## How it fits together

```
weather-app-design/
  backend/                 Flask. Serves the API and the frontend files.
    app/
      __init__.py          builds the app
      routes.py            the /api endpoints
      forecast.py          shapes forecast data into what the page draws
      cities.py            the 33 cities in the list
      upstream.py          cached, polite HTTP for all outside services
      providers/
        metno.py           MET Norway: forecast and sun times
        geo.py             place names (Nominatim) and town search (Open-Meteo)
    tests/
  frontend/                Plain HTML, CSS and ES modules. No build step.
    index.html
    styles.css
    js/
      main.js              startup; decides which place is on screen
      api.js               calls the backend
      places.js            city list, search, "Use my location"
      forecast-view.js     current weather, hourly strip, days ahead, facts
      sky.js               the animated sky behind the temperature
      map.js               map pins and the rain radar
      format.js            times, labels and the temperature colour scale
      state.js, dom.js     shared state and DOM helpers
    fonts/                 Anek Latin (SIL Open Font License)
    vendor/                MapLibre GL JS
render.yaml                one-click deploy to Render
```

There is a backend because MET Norway requires every app to identify
itself in a `User-Agent` header, which browsers don't let a page set. The
server makes those calls, caches the answers for as long as MET Norway
says they are valid, and hands the page a small JSON response.

### API

| Endpoint | Returns |
| --- | --- |
| `GET /api/cities` | The cities in the list |
| `GET /api/summary` | Current temperature and sky for every city |
| `GET /api/weather?city=mumbai` | Full forecast for a listed city |
| `GET /api/weather?lat=18.75&lon=73.41` | Full forecast for any point |
| `GET /api/places?q=lonavala` | Towns in India matching a name |
| `GET /api/health` | `{"ok": true}` |

## Things worth knowing

- **Times are in IST** everywhere, whatever the visitor's clock says.
- **"Today" in the days-ahead list covers only the hours left in the day**,
  because the forecast starts now. Its low can be higher than this
  morning's actual low.
- **The current reading is a forecast for this hour**, not a measurement
  from a weather station.
- **Location is rounded to about 1 km** before it leaves the browser, and
  the page only asks for it when "Use my location" is pressed.
- If MET Norway is unreachable, the server keeps serving the last forecast
  it has rather than failing.
- Set `MAUSAM_USER_AGENT` to change how the server identifies itself to
  MET Norway and Nominatim. Both ask for something that names the app and
  a way to reach its owner.

## Deploying

See [weather-app-design/DEPLOY.md](weather-app-design/DEPLOY.md).

## Credits

Forecast data from MET Norway (CC BY 4.0). Map tiles from OpenFreeMap,
map data from OpenStreetMap contributors. Radar from RainViewer. Place
search from Open-Meteo. Typeface: Anek Latin by Ek Type.
