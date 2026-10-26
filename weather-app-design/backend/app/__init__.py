"""Flask app factory.

Keep this file small. All the real work lives in routes.py and weather.py.
This also serves the frontend as static files from ../frontend/ so the
whole app runs under one command.
"""
from pathlib import Path

from flask import Flask, send_from_directory


FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


def create_app():
    app = Flask(__name__)

    # Register the API routes.
    from .routes import api
    app.register_blueprint(api)

    # Serve the frontend at /.
    @app.get("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/<path:filename>")
    def frontend(filename):
        return send_from_directory(FRONTEND_DIR, filename)

    return app
