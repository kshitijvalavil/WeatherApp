"""Entry point for Vercel, which looks for a Flask object called `app` in the project root.

Render and local development don't use this file; they start the app from
weather-app-design/backend (see render.yaml and README.md).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "weather-app-design" / "backend"))

from app import create_app  # noqa: E402

app = create_app()
