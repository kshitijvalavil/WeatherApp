# Mausam frontend

A plain HTML, CSS and JavaScript page. No build step, no framework.

## What it does

- Draws a simplified SVG map of India with ten clickable city dots.
- When you click one, fetches `GET /api/weather?city=<id>` from the
  backend and shows a weather card with an animated icon, current temp,
  a short one-liner, "later today" strip, sunrise and sunset.

## Running

The Flask backend serves these files, so start the backend and open
http://localhost:5000 in a browser.

## Files

- `index.html` — the markup.
- `styles.css` — colors, type, layout, and the icon animations. Supports
  light and dark theme, with a per-viewer override saved in localStorage.
- `app.js` — fetches `/api/cities` and `/api/weather`, renders the page.
