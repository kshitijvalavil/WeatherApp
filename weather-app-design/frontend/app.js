// Mausam — Apple HIG dashboard, live data from /api/weather.

const SENTENCES = {
  sunny: "Clear skies and plenty of sunshine. Light clothes and water will do the job.",
  partly: "A mix of sun and clouds. Comfortable through most of the day.",
  cloudy: "Overcast and still. The sun stays tucked behind the clouds.",
  rain: "Showers on the way. Keep an umbrella close through the day.",
  thunder: "Thunderstorms building. Give the outdoor plans a rain check.",
  haze: "Hazy air hangs around. Visibility drops a notch; take it easy outdoors.",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const state = {
  cities: [],
  selected: null,
  cache: new Map(),   // id -> weather response
  map: null,
  markers: new Map(), // id -> leaflet marker
};

// ---------- Boot ----------
init().catch(err => console.error(err));

async function init() {
  const list = await fetchJSON("/api/cities");
  state.cities = list.cities || [];
  renderCityList();
  initMap();
  // Default: first city.
  const first = state.cities[0];
  if (first) select(first.id);
  // Prefetch all cities so the sidebar + map show live numbers.
  state.cities.forEach(c => loadCity(c.id).catch(() => {}));

  // Search filter
  document.getElementById("searchInput").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".city-card").forEach(el => {
      const name = el.dataset.name;
      el.style.display = !q || name.includes(q) ? "" : "none";
    });
  });

  // Tick the hero time every minute.
  setInterval(updateHeroTime, 60_000);
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

// ---------- City list ----------
function renderCityList() {
  const list = document.getElementById("cityList");
  list.innerHTML = "";
  state.cities.forEach(c => {
    const el = document.createElement("div");
    el.className = "city-card loading";
    el.dataset.id = c.id;
    el.dataset.name = (c.name + " " + (c.state || "")).toLowerCase();
    el.innerHTML = `
      <div class="city-name">${c.name}</div>
      <div class="city-region">${c.state || ""}</div>
      <div class="city-temp"></div>
    `;
    el.addEventListener("click", () => select(c.id));
    list.appendChild(el);
  });
}

function updateCityCard(id, data) {
  const el = document.querySelector(`.city-card[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove("loading");
  const t = data?.current?.temp_c;
  el.querySelector(".city-temp").textContent = t == null ? "—" : Math.round(t) + "°";
}

// ---------- Data ----------
async function loadCity(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const data = await fetchJSON(`/api/weather?city=${encodeURIComponent(id)}`);
  state.cache.set(id, data);
  updateCityCard(id, data);
  updateMarker(id, data);
  return data;
}

// ---------- Selection ----------
async function select(id) {
  state.selected = id;
  document.querySelectorAll(".city-card").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  let data;
  try {
    data = await loadCity(id);
  } catch (e) {
    document.getElementById("heroSentence").textContent = "Couldn't reach the weather service. Try again in a minute.";
    return;
  }
  renderHero(data);
  renderHourly(data);
  renderHighlights(data);
  renderWeek(data);

  const city = state.cities.find(c => c.id === id);
  if (city && state.map) state.map.flyTo([city.lat, city.lon], 6, { duration: 0.8 });
  refreshAllMarkers();

  // Note IMD state in the footer.
  const imdNote = document.getElementById("imdNote");
  imdNote.textContent = data.imd?.now ? "IMD · live" : "";
  const sourceText = document.getElementById("sourceText");
  sourceText.textContent = "Live · " + (data.sources || ["MET Norway"]).join(" + ");
}

// ---------- Hero ----------
function renderHero(data) {
  const c = data.city, w = data.current;
  const hero = document.getElementById("hero");
  hero.dataset.sym = w.symbol || "partly";
  hero.classList.remove("rain", "thunder", "cloudy", "sunny", "partly", "haze");
  hero.classList.add(w.symbol || "partly");
  document.getElementById("heroPlace").textContent = `${c.name}${c.state ? ", " + c.state : ""}`;
  document.getElementById("heroTemp").textContent = w.temp_c == null ? "—" : Math.round(w.temp_c);
  document.getElementById("heroLabel").textContent = labelFor(w.symbol);
  const today = (data.daily || [])[0];
  if (today) {
    document.getElementById("heroRange").textContent = `H: ${Math.round(today.hi_c)}°   L: ${Math.round(today.lo_c)}°`;
  } else {
    document.getElementById("heroRange").textContent = "";
  }
  document.getElementById("heroIcon").innerHTML = `<svg viewBox="0 0 64 64"><use href="#i-${w.symbol}"/></svg>`;
  document.getElementById("heroSentence").textContent = SENTENCES[w.symbol] || "";
  document.getElementById("heroSky").style.background = skyFor(w.symbol);
  renderRainStreaks(w.symbol);
  updateHeroTime();
}

function renderRainStreaks(sym) {
  const host = document.querySelector("#rainLayer svg");
  if (!host) return;
  const isWet = sym === "rain" || sym === "thunder";
  host.innerHTML = "";
  if (!isWet) return;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 400;
    const delay = Math.random() * 1.2;
    const dur = 0.7 + Math.random() * 0.5;
    const len = 8 + Math.random() * 14;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
    el.setAttribute("x1", x); el.setAttribute("y1", -20);
    el.setAttribute("x2", x - 4); el.setAttribute("y2", -20 + len);
    el.style.animationDuration = dur + "s";
    el.style.animationDelay = delay + "s";
    host.appendChild(el);
  }
}

function updateHeroTime() {
  const d = new Date();
  const opts = { weekday: "long", day: "numeric", month: "short" };
  const date = d.toLocaleDateString("en-IN", opts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const label = `${date} · ${((h % 12) || 12)}:${m} ${h < 12 ? "AM" : "PM"}`;
  const el = document.getElementById("heroTime");
  if (el) el.textContent = label;
}

function labelFor(sym) {
  return ({
    sunny: "Clear",
    partly: "Partly Cloudy",
    cloudy: "Cloudy",
    rain: "Rain",
    thunder: "Thunderstorms",
    haze: "Haze",
  })[sym] || "—";
}

function skyFor(sym) {
  const skies = {
    sunny:   "radial-gradient(900px 400px at 90% -10%, rgba(255,214,10,0.3), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(255,159,10,0.14), transparent 55%)",
    partly:  "radial-gradient(900px 400px at 90% -10%, rgba(255,214,10,0.22), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(10,132,255,0.16), transparent 55%)",
    cloudy:  "radial-gradient(900px 400px at 90% -10%, rgba(154,160,166,0.22), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(154,160,166,0.14), transparent 55%)",
    rain:    "radial-gradient(900px 400px at 90% -10%, rgba(10,132,255,0.22), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(10,132,255,0.14), transparent 55%)",
    thunder: "radial-gradient(900px 400px at 90% -10%, rgba(94,92,230,0.28), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(255,214,10,0.14), transparent 55%)",
    haze:    "radial-gradient(900px 400px at 90% -10%, rgba(255,214,10,0.18), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgba(154,160,166,0.18), transparent 55%)",
  };
  return skies[sym] || skies.partly;
}

// ---------- Hourly ----------
function renderHourly(data) {
  const host = document.getElementById("hourly");
  host.innerHTML = "";
  const now = new Date();
  (data.hourly || []).slice(0, 12).forEach((h, i) => {
    const d = new Date(h.time);
    const hour = d.getHours();
    const label = i === 0 ? "Now" : ((hour % 12) || 12) + (hour < 12 ? " AM" : " PM");
    const el = document.createElement("div");
    el.className = "hour" + (i === 0 ? " now" : "");
    const t = h.temp_c == null ? "—" : Math.round(h.temp_c) + "°";
    const p = h.rain_mm && h.rain_mm > 0.1 ? Math.round(h.rain_mm * 10) / 10 + "mm" : "·";
    el.innerHTML = `
      <div class="h">${label}</div>
      <svg><use href="#i-${h.symbol || "cloudy"}"/></svg>
      <div class="t">${t}</div>
      <div class="p">${p}</div>
    `;
    host.appendChild(el);
  });
}

// ---------- Highlights ----------
function renderHighlights(data) {
  const c = data.current || {};
  // UV
  const uv = c.uv_index == null ? null : Math.round(c.uv_index);
  document.getElementById("uvVal").textContent = uv == null ? "—" : uv;
  document.getElementById("uvLabel").textContent = uv == null ? "—" : uvLabel(uv);
  document.getElementById("uvCap").textContent = uv == null ? "" : uvCaption(uv);
  const path = document.getElementById("uvArc");
  if (path && uv != null) {
    const len = path.getTotalLength();
    const fill = Math.min(uv, 11) / 11 * len;
    path.setAttribute("stroke-dasharray", `${fill} ${len}`);
    // Position the UV dot at the end of the filled arc.
    const pt = path.getPointAtLength(fill);
    const dot = document.getElementById("uvDot");
    if (dot) {
      dot.style.left = `calc(${(pt.x / 200) * 100}% - 5px)`;
      dot.style.top = `calc(${(pt.y / 100) * 100}% - 5px)`;
    }
  }

  // Wind
  document.getElementById("windVal").textContent = c.wind_kmh == null ? "—" : Math.round(c.wind_kmh);
  document.getElementById("windSub").textContent = c.wind_dir == null ? "" : `from ${compass(c.wind_dir)}`;
  document.getElementById("windCap").textContent = windCaption(c.wind_kmh);

  // Sun
  const sr = fmtTime(data.sun?.sunrise);
  const ss = fmtTime(data.sun?.sunset);
  document.getElementById("sunriseVal").textContent = sr?.full || "—";
  document.getElementById("sunsetSub").textContent = ss ? `Sets ${ss.full}` : "Sets —";
  document.getElementById("sunriseLabel").textContent = sr ? `↑ ${sr.full}` : "↑ —";
  document.getElementById("sunsetLabel").textContent = ss ? `↓ ${ss.full}` : "↓ —";
  positionSunDot(data.sun?.sunrise, data.sun?.sunset);

  // Humidity
  const h = c.humidity;
  document.getElementById("humVal").textContent = h == null ? "—" : Math.round(h);
  renderHumBars(data.hourly || [], h);
  const dew = (h != null && c.temp_c != null) ? Math.round(c.temp_c - ((100 - h) / 5)) : null;
  document.getElementById("humSub").textContent = dew == null ? "" : `Dew point ${dew}°`;
  document.getElementById("humCap").textContent = humCaption(h);

  // Visibility
  const v = c.visibility_km;
  document.getElementById("visVal").textContent = v == null ? "—" : v;
  document.getElementById("visCap").textContent = visCaption(v);

  // Feels like
  const f = c.feels_c;
  document.getElementById("feelsVal").textContent = f == null ? "—" : Math.round(f);
  document.getElementById("feelsCap").textContent = feelsCaption(c.temp_c, f);
}

function uvLabel(n) { return n <= 2 ? "Low" : n <= 5 ? "Moderate" : n <= 7 ? "High" : n <= 10 ? "Very High" : "Extreme"; }
function uvCaption(n) {
  if (n <= 2) return "No protection needed.";
  if (n <= 5) return "Sunscreen on exposed skin, hat helpful.";
  if (n <= 7) return "Use sunscreen; midday sun bites.";
  return "Avoid midday sun; cover up outdoors.";
}
function compass(deg) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
function windCaption(k) {
  if (k == null) return "—";
  if (k < 5) return "Air is calm.";
  if (k < 15) return "A gentle breeze.";
  if (k < 29) return "Steady, noticeable breeze.";
  if (k < 50) return "Strong wind — hold onto hats.";
  return "Gale-force gusts; stay indoors.";
}
function humCaption(h) {
  if (h == null) return "";
  if (h < 30) return "Dry air — stay hydrated.";
  if (h < 60) return "Comfortable humidity.";
  if (h < 75) return "A touch humid.";
  return "Muggy — feels warmer than it is.";
}
function visCaption(v) {
  if (v == null) return "";
  if (v >= 10) return "Clear line of sight to the horizon.";
  if (v >= 5)  return "A soft haze on the horizon.";
  if (v >= 2)  return "Hazy; distant objects fade.";
  return "Thick fog or smog; drive carefully.";
}
function feelsCaption(t, f) {
  if (t == null || f == null) return "";
  const d = Math.round(f - t);
  if (d >= 2) return `Humidity makes it feel ${d}° warmer.`;
  if (d <= -2) return `Wind makes it feel ${Math.abs(d)}° cooler.`;
  return "About the same as the actual temperature.";
}

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "AM" : "PM";
  const hm = ((h % 12) || 12) + ":" + m;
  return { hm, full: `${hm} ${ampm}` };
}

function positionSunDot(sunrise, sunset) {
  const dot = document.getElementById("sunDot");
  if (!dot) return;
  const now = new Date();
  const sr = sunrise ? new Date(sunrise) : null;
  const ss = sunset ? new Date(sunset) : null;
  if (!sr || !ss) return;
  const frac = Math.max(0, Math.min(1, (now - sr) / (ss - sr)));
  // Follow the arc 10,80 -> 120,22 (peak) -> 230,80 approximately.
  const t = frac;
  const x = 10 + t * 220;
  const y = 80 - Math.sin(t * Math.PI) * 60;
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
}

function renderHumBars(hourly, nowH) {
  const host = document.getElementById("humBars");
  host.innerHTML = "";
  // We don't have humidity per hour from the compact API; show a soft curve
  // around the current reading so the tile isn't empty.
  const base = nowH == null ? 60 : nowH;
  const samples = hourly.length ? hourly.slice(0, 12) : Array(12).fill({});
  samples.forEach((_, i) => {
    const wobble = Math.sin(i / 2) * 6;
    const v = Math.max(10, Math.min(100, base + wobble - 2));
    const b = document.createElement("span");
    b.style.height = ((v - 10) * 0.55) + "px";
    b.style.opacity = 0.5 + v / 200;
    host.appendChild(b);
  });
}

// ---------- 10-day ----------
function renderWeek(data) {
  const host = document.getElementById("week");
  host.innerHTML = "";
  const days = data.daily || [];
  if (!days.length) return;
  const minLo = Math.min(...days.map(d => d.lo_c));
  const maxHi = Math.max(...days.map(d => d.hi_c));
  const spread = Math.max(1, maxHi - minLo);
  days.forEach((d, i) => {
    const dt = new Date(d.date + "T12:00:00+05:30");
    const name = i === 0 ? "Today" : DAY_SHORT[dt.getDay()];
    const mood = d.rain_mm > 2 ? `${d.rain_mm}mm rain` : moodFromSymbol(d.symbol);
    const seg = ((d.lo_c - minLo) / spread) * 100;
    const segw = ((d.hi_c - d.lo_c) / spread) * 100;
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="day">${name}<small>${mood}</small></div>
      <svg class="ic"><use href="#i-${d.symbol || "cloudy"}"/></svg>
      <div class="range-bar"><div class="seg" style="left:${seg}%; width:${Math.max(6, segw)}%"></div></div>
      <div class="lo">${Math.round(d.lo_c)}°</div>
      <div class="hi">${Math.round(d.hi_c)}°</div>
    `;
    host.appendChild(li);
  });
}

function moodFromSymbol(sym) {
  return ({
    sunny: "sunny",
    partly: "mixed sun",
    cloudy: "overcast",
    rain: "showers",
    thunder: "storms",
    haze: "hazy",
  })[sym] || "";
}

// ---------- Map ----------
function initMap() {
  const map = L.map("map", {
    center: [22.5, 80],
    zoom: 4.6,
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  });
  state.map = map;
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  // CARTO Voyager has subtle city/road labels — more "in-depth" than the no-labels variant.
  const tiles = isDark
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  L.tileLayer(tiles, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 12,
  }).addTo(map);

  // India outline overlay (fail-soft).
  fetch("https://cdn.jsdelivr.net/gh/geohacker/india@master/india.geojson")
    .then(r => r.ok ? r.json() : null)
    .then(gj => {
      if (!gj) return;
      L.geoJSON(gj, {
        style: { color: "rgba(10,132,255,0.5)", weight: 1.2, fillColor: "rgba(10,132,255,0.06)", fillOpacity: 1 },
      }).addTo(map);
    })
    .catch(() => {});

  // Create markers now; fill temps as data arrives.
  state.cities.forEach(c => {
    const html = `<div class="city-pin"><div class="bubble"><span class="dot"></span>— ${c.name}</div><div class="stem"></div></div>`;
    const icon = L.divIcon({ html, className: "city-pin-wrap", iconSize: [0, 0] });
    const marker = L.marker([c.lat, c.lon], { icon }).addTo(map).on("click", () => select(c.id));
    state.markers.set(c.id, marker);
  });
}

function updateMarker(id, data) {
  const m = state.markers.get(id);
  if (!m) return;
  const t = data?.current?.temp_c;
  const sym = data?.current?.symbol || "partly";
  const city = state.cities.find(c => c.id === id);
  const name = city?.name || "";
  const temp = t == null ? "—" : Math.round(t) + "°";
  const active = state.selected === id ? " active" : "";
  const html = `<div class="city-pin ${sym}${active}"><div class="bubble"><span class="dot"></span>${temp} ${name}</div><div class="stem"></div></div>`;
  m.setIcon(L.divIcon({ html, className: "city-pin-wrap", iconSize: [0, 0] }));
}

function refreshAllMarkers() {
  state.cache.forEach((data, id) => updateMarker(id, data));
}
