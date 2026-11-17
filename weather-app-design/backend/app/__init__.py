"""The Flask app: the JSON API under /api, and the frontend at /.

The frontend is plain files in ../frontend, so one process serves
everything and there is nothing to build.
"""
from pathlib import Path

from flask import Flask, request

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"

# Files that never change under the same name can be cached for a long time.
# Everything else is revalidated on each load, so a deploy shows up at once.
LONG_LIVED = ("/vendor/", "/fonts/")


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")

    from .routes import api
    app.register_blueprint(api)

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.after_request
    def cache_static_files(response):
        if request.path.startswith("/api/"):
            return response
        if request.path.startswith(LONG_LIVED):
            response.headers["Cache-Control"] = "public, max-age=2592000"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response

    return app
