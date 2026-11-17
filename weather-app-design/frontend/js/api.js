// Talks to our own backend. The browser never calls MET Norway directly.

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export const fetchCities = () => getJSON("/api/cities").then((d) => d.cities);
export const fetchSummary = () => getJSON("/api/summary").then((d) => d.cities);
export const searchPlaces = (q) => getJSON(`/api/places?q=${encodeURIComponent(q)}`).then((d) => d.places);

/** `place` is one of our cities, or any spot with an id like "@18.52,73.86". */
export function fetchForecast(place) {
  const query = isPoint(place.id) ? `lat=${place.lat}&lon=${place.lon}` : `city=${encodeURIComponent(place.id)}`;
  return getJSON(`/api/weather?${query}`);
}

// ---------- Ids for places that aren't in the city list ----------

export const isPoint = (id) => id.startsWith("@");

export const pointId = (lat, lon) => `@${(+lat).toFixed(2)},${(+lon).toFixed(2)}`;

/** Parse "@18.52,73.86" from a shared link. Returns null if it isn't one. */
export function pointFromId(id) {
  const m = /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(id);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { id: pointId(lat, lon), lat, lon, name: "Loading", state: "" };
}
