// The map of India: a temperature pin for every city, and an optional
// rain radar layer. MapLibre draws it; OpenFreeMap supplies the tiles and
// RainViewer the radar, both free and without an API key.

import { isPoint } from "./api.js";
import { $, el, icon, reduceMotion } from "./dom.js";
import { TEMP_RANGE, degrees, tempColor, tempGradient, time } from "./format.js";
import { findPlace, state } from "./state.js";

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const NAMES_FROM_ZOOM = 4.75; // pins show the city name once there is room
const RADAR_FRAME_MS = 700;

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const markers = new Map(); // place id -> maplibregl.Marker
let map = null;
let onSelect = () => {};
let layer = "temp";

export function init(callbacks) {
  onSelect = callbacks.select;
  wireLayerButtons();
  showLegend();
  if (!window.maplibregl) { $("mapNote").hidden = false; return; }

  const bounds = new maplibregl.LngLatBounds();
  state.cities.forEach((c) => bounds.extend([c.lon, c.lat]));
  map = new maplibregl.Map({
    container: "map",
    style: prefersDark.matches ? STYLES.dark : STYLES.light,
    bounds,
    fitBoundsOptions: { padding: 48 },
    minZoom: 3,
    maxZoom: 10,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    scrollZoom: false, // or the page stops scrolling when the pointer crosses the map
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.getContainer().addEventListener("click", () => map.scrollZoom.enable(), { once: true });

  map.on("zoom", () => map.getContainer().classList.toggle("map-names", map.getZoom() >= NAMES_FROM_ZOOM));
  map.on("zoomend", declutter);
  map.on("moveend", declutter);
  map.on("style.load", () => { $("mapNote").hidden = true; addRadarLayers(); });
  map.on("error", () => { if (!map.isStyleLoaded()) $("mapNote").hidden = false; });
  prefersDark.addEventListener("change", () => map.setStyle(prefersDark.matches ? STYLES.dark : STYLES.light));
  new ResizeObserver(() => map.resize()).observe($("map"));

  state.cities.forEach(addMarker);
  refresh();
}

export function flyTo(place) {
  if (!map) return;
  map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 4.5), duration: reduceMotion ? 0 : 900, essential: true });
}

// ---------- Pins ----------

function addMarker(place) {
  const pin = el("button", { type: "button", class: "pin" });
  pin.addEventListener("click", (e) => { e.stopPropagation(); onSelect(place.id); });
  markers.set(place.id, new maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat([place.lon, place.lat]).addTo(map));
}

/** Redraw every pin from the latest temperatures and selection. */
export function refresh() {
  if (!map) return;
  syncExtraPlace();
  markers.forEach((marker, id) => {
    const place = findPlace(id);
    const temp = state.summary.get(id)?.temp_c;
    const pin = marker.getElement();
    pin.classList.toggle("active", id === state.selected);
    pin.classList.toggle("extra", isPoint(id));
    pin.setAttribute("aria-label", `${place.name}, ${temp == null ? "no reading" : degrees(temp)}`);
    pin.replaceChildren(
      el("i", { style: { background: temp == null ? "var(--faint)" : tempColor(temp) } }),
      degrees(temp),
      el("span", { text: place.name }));
  });
  declutter();
}

/** Keep exactly one pin for the place outside the city list, if there is one. */
function syncExtraPlace() {
  markers.forEach((marker, id) => {
    if (isPoint(id) && id !== state.place?.id) { marker.remove(); markers.delete(id); }
  });
  if (state.place && !markers.has(state.place.id)) addMarker(state.place);
}

// Hide pins that would overlap a more important one. The selected place
// wins, then the extra place, then cities in list order (big metros first).
function declutter() {
  if (!map) return;
  const named = map.getZoom() >= NAMES_FROM_ZOOM;
  const taken = [];
  const order = new Set([state.selected, state.place?.id, ...state.cities.map((c) => c.id)]);
  for (const id of order) {
    const marker = markers.get(id), place = id && findPlace(id);
    if (!marker || !place) continue;
    const { x, y } = map.project(marker.getLngLat());
    const showsName = named || id === state.selected || isPoint(id);
    const half = (56 + (showsName ? place.name.length * 7 + 6 : 0)) / 2 + 3;
    const box = { left: x - half, right: x + half, top: y - 15, bottom: y + 15 };
    const overlaps = taken.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top);
    marker.getElement().style.visibility = overlaps ? "hidden" : "";
    if (!overlaps) taken.push(box);
  }
}

// ---------- Layers ----------

function wireLayerButtons() {
  for (const button of document.querySelectorAll(".layers button")) {
    button.addEventListener("click", () => setLayer(button.dataset.layer));
  }
  $("radarPlay").addEventListener("click", () => {
    radar.playing = !radar.playing;
    $("radarPlay").replaceChildren(icon(radar.playing ? "pause" : "play"));
    $("radarPlay").setAttribute("aria-label", radar.playing ? "Pause radar" : "Play radar");
    playRadar();
  });
}

async function setLayer(next) {
  layer = next;
  for (const button of document.querySelectorAll(".layers button")) {
    button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
  }
  clearInterval(radar.timer);
  $("radarBar").hidden = true;
  showFrame(-1);
  showLegend();
  if (layer !== "radar") return;

  await loadRadar();
  if (layer !== "radar") return; // switched back while it was loading
  if (!radar.frames.length) { showLegend("Radar is unavailable right now."); return; }
  $("radarBar").hidden = false;
  showFrame(radar.frames.length - 1);
  playRadar();
}

function showLegend(message) {
  const legend = $("mapLegend");
  if (message) legend.replaceChildren(message);
  else if (layer === "radar") legend.replaceChildren("Light", el("i", { class: "legend-rain" }), "Heavy");
  else legend.replaceChildren(`${TEMP_RANGE[0]}°`, el("i", { style: { background: tempGradient() } }), `${TEMP_RANGE[1]}°`);
}

// ---------- Rain radar ----------

const radar = { frames: [], host: "", index: 0, timer: 0, playing: true, loaded: false };

async function loadRadar() {
  if (radar.loaded || !map) return;
  radar.loaded = true;
  try {
    const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const data = await response.json();
    radar.host = data.host;
    radar.frames = data.radar?.past || [];
    if (map.isStyleLoaded()) addRadarLayers();
  } catch {
    radar.frames = [];
  }
}

// One raster layer per frame, all invisible but one, so stepping through
// time is an opacity change rather than a reload. Changing the map style
// (light to dark) wipes them, so this runs again on every style load.
function addRadarLayers() {
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol");
  radar.frames.forEach((frame, i) => {
    const id = `radar-${i}`;
    if (map.getSource(id)) return;
    map.addSource(id, {
      type: "raster",
      tiles: [`${radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`],
      tileSize: 256,
      maxzoom: 7, // RainViewer serves nothing closer
      attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
    });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, firstLabel?.id);
  });
  if (layer === "radar") showFrame(radar.index);
}

function showFrame(index) {
  if (!map) return;
  radar.frames.forEach((_, i) => {
    if (map.getLayer(`radar-${i}`)) map.setPaintProperty(`radar-${i}`, "raster-opacity", i === index ? 0.75 : 0);
  });
  const frame = radar.frames[index];
  if (!frame) return;
  radar.index = index;
  $("radarTime").textContent = time(frame.time * 1000);
  $("radarFill").style.width = `${((index + 1) / radar.frames.length) * 100}%`;
}

function playRadar() {
  clearInterval(radar.timer);
  if (!radar.playing || reduceMotion || layer !== "radar") return;
  radar.timer = setInterval(() => showFrame((radar.index + 1) % radar.frames.length), RADAR_FRAME_MS);
}
