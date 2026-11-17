// Mausam: starts the page and decides which place is on screen.

import { fetchCities, fetchForecast, fetchSummary, isPoint, pointFromId } from "./api.js";
import { $ } from "./dom.js";
import { time } from "./format.js";
import * as view from "./forecast-view.js";
import * as map from "./map.js";
import * as places from "./places.js";
import { findPlace, state } from "./state.js";

const REFRESH_MS = 10 * 60 * 1000;
const DEFAULT_CITY = "mumbai";

const forecasts = new Map(); // place id -> { data, loadedAt }
let lastRefresh = Date.now();

start();

async function start() {
  try {
    state.cities = await fetchCities();
  } catch {
    $("status").textContent = "The server isn't answering. Reload the page to try again.";
    return;
  }
  places.init({ select, showPlace, preload });
  map.init({ select });

  const linked = placeFromHash();
  if (linked && isPoint(linked.id)) showPlace(linked);
  select((linked || findPlace(DEFAULT_CITY) || state.cities[0]).id, { fly: false });
  if (!linked) places.locateIfAllowed();

  refreshSummary();
  setInterval(refreshAll, REFRESH_MS);
  setInterval(view.tick, 30 * 1000);
  // A tab left in the background doesn't run timers reliably; catch up when it returns.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastRefresh > REFRESH_MS) refreshAll();
  });
  window.addEventListener("hashchange", () => {
    const place = placeFromHash();
    if (!place || place.id === state.selected) return;
    if (isPoint(place.id)) showPlace(place);
    select(place.id);
  });
}

/** The place named in the URL, so a forecast can be bookmarked or shared. */
function placeFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  return isPoint(id) ? pointFromId(id) : findPlace(id);
}

/** Put a place outside the city list (your location, a searched town) in the list and on the map. */
function showPlace(place) {
  const same = state.place && state.place.id === place.id;
  state.place = same ? { ...state.place, ...place } : place;
  places.renderPlaceRow();
  map.refresh();
}

async function select(id, { fly = true } = {}) {
  const place = findPlace(id);
  if (!place) return;
  state.selected = id;
  if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
  redrawLists();
  places.revealSelected();
  if (fly) map.flyTo(place);

  view.showLoading();
  try {
    const data = await loadForecast(id);
    if (state.selected === id) view.render(data);
  } catch {
    if (state.selected === id) view.showError(place);
  }
}

/** Fetch a forecast without showing it, so its row and pin get a temperature. */
async function preload(id) {
  try { await loadForecast(id); } catch { /* the row keeps its "--" */ }
}

async function loadForecast(id, { fresh = false } = {}) {
  const cached = forecasts.get(id);
  if (cached && !fresh && Date.now() - cached.loadedAt < REFRESH_MS) return cached.data;

  const data = await fetchForecast(findPlace(id));
  forecasts.set(id, { data, loadedAt: Date.now() });
  state.summary.set(id, data.current);
  // The server knows the real name of a coordinate ("Kothrud"); adopt it.
  if (state.place && state.place.id === id) {
    Object.assign(state.place, { name: data.place.name, state: data.place.state });
    places.renderPlaceRow();
  }
  redrawLists();
  return data;
}

function redrawLists() {
  places.refresh();
  map.refresh();
}

async function refreshSummary() {
  try {
    for (const city of await fetchSummary()) state.summary.set(city.id, city);
    redrawLists();
    $("status").textContent = `Updated ${time(Date.now())}`;
  } catch {
    $("status").textContent = "Showing older readings; the latest update didn't arrive.";
  }
}

async function refreshAll() {
  lastRefresh = Date.now();
  refreshSummary();
  const id = state.selected;
  try {
    const data = await loadForecast(id, { fresh: true });
    if (state.selected === id) view.render(data);
  } catch { /* keep showing what we have */ }
}
