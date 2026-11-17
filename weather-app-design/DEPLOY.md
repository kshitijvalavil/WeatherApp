# Deploying Mausam

The app is a Flask backend that also serves the static frontend, so one
service runs the whole thing.

## Render (recommended, free tier)

1. Sign in at <https://render.com> with your GitHub account.
2. Open the one-click blueprint link:
   `https://render.com/deploy?repo=https://github.com/kshitijvalavil/WeatherApp`
3. Render reads `render.yaml` at the repo root and offers to create one
   web service called **mausam**. Approve it.
4. Wait ~2 minutes for the first build. Render shows the URL at the top
   of the service page, e.g. `https://mausam.onrender.com`.

The free tier spins the service down after 15 minutes of inactivity, so
the first request after a quiet period takes about 30 seconds. For a
production-feeling URL, upgrade the service to a paid tier.

### What `render.yaml` sets up

- **runtime**: python 3.12
- **rootDir**: `weather-app-design/backend`
- **build**: `pip install -r requirements.txt`
- **start**: `gunicorn --workers 1 --threads 8 --bind 0.0.0.0:$PORT "app:create_app()"`
  (one worker, so all requests share one forecast cache)
- **health check**: `GET /api/health`

### If you want a different host

- **Fly.io**: `fly launch` from `weather-app-design/backend/` and accept
  the detected Python app. The start command is the same gunicorn line.
- **Railway**: point the service at `weather-app-design/backend/`, same
  start command.
