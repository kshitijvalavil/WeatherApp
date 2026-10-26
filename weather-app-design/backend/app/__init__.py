"""Flask app factory.

Keep this file small. All the real work lives in routes.py and weather.py.
"""
from flask import Flask


def create_app():
    app = Flask(__name__)

    # Register the API routes.
    from .routes import api
    app.register_blueprint(api)

    return app
