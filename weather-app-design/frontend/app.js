// Mausam: live India weather from /api/*.

const IST = "Asia/Kolkata";
const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" });
const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "long", day: "numeric", month: "long" });
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

const LABELS = { sunny: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", rain: "Rain", thunder: "Thunderstorms", haze: "Haze" };

const state = {
  cities: [],
  summary: new Map(),
  detail: new Map(),
  selected: null,
  place: null, // a spot that isn't one of our cities: your location, or a searched town
  map: null,
  markers: new Map(),
  layer: "temp",
};

const $ = (id) => document.getElementById(id);

init();

async function init() {
  try {
    const { cities } = await getJSON("/api/cities");
    state.cities = cities;
  } catch {
    $("statusText").textContent = "Can't reach the server";
    return;
  }
  renderCityList();
  initMap();
  buildCompassTicks();
  wireSearch();
  wireLocate();
  wireLayerToggle();

  const fromHash = decodeURIComponent(location.hash.slice(1));
  const linked = fromHash.startsWith("@") ? placeFromId(fromHash) : null;
  if (linked) setPlace(linked);
  const start = linked || state.cities.find((c) => c.id === fromHash) || state.cities.find((c) => c.id === "mumbai") || state.cities[0];
  select(start.id, { fly: false });
  if (!fromHash) autoLocate(start.id);

  loadSummary();
  setInterval(loadSummary, 10 * 60 * 1000);
  setInterval(tick, 30 * 1000);
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || id === state.selected) return;
    if (id.startsWith("@") && placeFromId(id)) { setPlace(placeFromId(id)); select(id); }
    else if (state.cities.some((c) => c.id === id)) select(id);
  });
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function loadSummary() {
  try {
    const { cities } = await getJSON("/api/summary");
    cities.forEach((s) => state.summary.set(s.id, s));
    updateCityList();
    updateMarkers();
    $("statusText").textContent = `Live · updated ${fmtTime.format(new Date())}`;
  } catch {
    $("statusText").textContent = "Live data delayed";
  }
}

// ---------- Sidebar ----------
function renderCityList() {
  const list = $("cityList");
  list.innerHTML = "";
  state.cities.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "city";
    b.dataset.id = c.id;
    b.dataset.q = `${c.name} ${c.state}`.toLowerCase();
    b.innerHTML = `<span class="meta"><span class="name"></span><span class="state"></span></span><svg class="ic" aria-hidden="true"></svg><span class="t">--</span>`;
    b.querySelector(".name").textContent = c.name;
    b.querySelector(".state").textContent = c.state;
    b.addEventListener("click", () => select(c.id));
    list.appendChild(b);
  });
}

function updateCityList() {
  document.querySelectorAll(".city").forEach((el) => {
    const s = state.summary.get(el.dataset.id);
    if (!s) return;
    el.querySelector(".t").textContent = s.temp_c == null ? "--" : `${Math.round(s.temp_c)}°`;
    el.querySelector(".ic").innerHTML = s.symbol ? `<use href="#i-${nightIcon(s.symbol, roughlyNight())}"/>` : "";
  });
}

function wireSearch() {
  const input = $("searchInput");
  let timer = 0;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll(".city:not(.place)").forEach((el) => { el.hidden = q && !el.dataset.q.includes(q); });
    clearTimeout(timer);
    if (q.length >= 2) timer = setTimeout(() => searchPlaces(q), 300);
    else showPlaces(null);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { clearSearch(); return; }
    if (e.key !== "Enter") return;
    const first = [...document.querySelectorAll(".city:not(.place), .hit")].find((el) => !el.hidden);
    if (first) { first.click(); input.blur(); }
  });
}

function clearSearch() {
  $("searchInput").value = "";
  document.querySelectorAll(".city").forEach((el) => { el.hidden = false; });
  showPlaces(null);
}

// Towns beyond our 33 cities, from Open-Meteo's place search (via our server).
let searchSeq = 0;
async function searchPlaces(q) {
  const seq = ++searchSeq;
  let places = [];
  try { ({ places } = await getJSON(`/api/places?q=${encodeURIComponent(q)}`)); } catch { /* shown as no results */ }
  if (seq !== searchSeq) return;
  const ours = new Set(state.cities.map((c) => c.name.toLowerCase()));
  showPlaces(places.filter((p) => !ours.has(p.name.toLowerCase())), q);
}

function showPlaces(places, q) {
  const host = $("placeResults");
  host.innerHTML = "";
  if (!places) { host.hidden = true; return; }
  const anyCity = [...document.querySelectorAll(".city:not(.place)")].some((el) => !el.hidden);
  if (!places.length && anyCity) { host.hidden = true; return; }
  host.hidden = false;
  if (!places.length) {
    host.innerHTML = `<p class="hits-empty"></p>`;
    host.firstChild.textContent = `No places called "${q}". Try a nearby town, or use your location.`;
    return;
  }
  const head = document.createElement("div");
  head.className = "hits-head";
  head.textContent = "More places";
  host.appendChild(head);
  places.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hit";
    b.innerHTML = `<svg aria-hidden="true"><use href="#i-pin"/></svg><span class="name"></span><span class="state"></span>`;
    b.querySelector(".name").textContent = p.name;
    b.querySelector(".state").textContent = p.state;
    b.addEventListener("click", () => {
      const place = { ...p, id: placeId(p.lat, p.lon) };
      setPlace(place);
      clearSearch();
      select(place.id);
    });
    host.appendChild(b);
  });
}

// ---------- Places that aren't in our city list ----------
function placeId(lat, lon) { return `@${(+lat).toFixed(2)},${(+lon).toFixed(2)}`; }

function placeFromId(id) {
  const m = /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(id);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { id: placeId(lat, lon), lat, lon, name: "Loading…", state: "" };
}

function findPlace(id) {
  return state.cities.find((c) => c.id === id) || (state.place && state.place.id === id ? state.place : null);
}

// Only one extra place at a time: it gets a row at the top of the list and a pin on the map.
function setPlace(place) {
  const old = state.place;
  if (old && old.id !== place.id && state.markers.has(old.id)) {
    state.markers.get(old.id).remove();
    state.markers.delete(old.id);
  }
  state.place = { ...(old && old.id === place.id ? old : {}), ...place };
  renderPlaceRow();
  if (state.map && !state.markers.has(place.id)) addMarker(state.place);
}

function renderPlaceRow() {
  const p = state.place;
  let row = $("placeRow");
  if (!p) { if (row) row.remove(); return; }
  if (!row) {
    row = document.createElement("button");
    row.type = "button";
    row.id = "placeRow";
    row.className = "city place";
    row.innerHTML = `<span class="meta"><span class="name"></span><span class="state"></span></span><svg class="ic" aria-hidden="true"></svg><span class="t">--</span>`;
    row.addEventListener("click", () => select(state.place.id));
    $("cityList").prepend(row);
  }
  row.dataset.id = p.id;
  row.querySelector(".name").innerHTML = p.here ? `<svg class="loc" aria-hidden="true"><use href="#i-locate"/></svg>` : "";
  row.querySelector(".name").append(p.name);
  row.querySelector(".state").textContent = p.here ? "Your location" : p.state;
  updateCityList();
}

// ---------- Your location ----------
function wireLocate() {
  const btn = $("locateBtn");
  if (!("geolocation" in navigator)) { btn.hidden = true; return; }
  btn.addEventListener("click", () => locate({ manual: true }));
}

// Find the visitor on first load, unless they've said no before.
async function autoLocate(startId) {
  if (!("geolocation" in navigator)) return;
  let permission = "prompt";
  try { permission = (await navigator.permissions.query({ name: "geolocation" })).state; } catch { /* older Safari */ }
  if (permission !== "denied") locate({ manual: false, startId });
}

function locate({ manual, startId }) {
  const btn = $("locateBtn"), msg = $("locateMsg");
  btn.classList.add("busy");
  btn.setAttribute("aria-busy", "true");
  $("locateText").textContent = "Finding you…";
  msg.hidden = true;
  const done = () => {
    btn.classList.remove("busy");
    btn.removeAttribute("aria-busy");
    $("locateText").textContent = "Use my location";
  };
  navigator.geolocation.getCurrentPosition((pos) => {
    done();
    const { latitude: lat, longitude: lon } = pos.coords;
    const id = placeId(lat, lon);
    setPlace({ id, lat: +lat.toFixed(2), lon: +lon.toFixed(2), name: "Your location", state: "", here: true });
    // On first load, don't yank the page away if they've already picked a city.
    if (manual || state.selected === startId) select(id);
    else prefetch(id);
  }, (err) => {
    done();
    if (!manual) return;
    msg.hidden = false;
    msg.textContent = err.code === err.PERMISSION_DENIED
      ? "Location is blocked for this site. Allow it in your browser's site settings, or search for your town."
      : "Couldn't find your location just now. Try again, or search for your town.";
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
}

function weatherUrl(id) {
  const p = id.startsWith("@") ? findPlace(id) : null;
  return p ? `/api/weather?lat=${p.lat}&lon=${p.lon}` : `/api/weather?city=${encodeURIComponent(id)}`;
}

async function fetchDetail(id) {
  let data = state.detail.get(id);
  if (data) return data;
  data = await getJSON(weatherUrl(id));
  state.detail.set(id, data);
  setTimeout(() => state.detail.delete(id), 10 * 60 * 1000);
  if (state.place && state.place.id === id) {
    state.place.name = data.city.name;
    state.place.state = data.city.state;
    renderPlaceRow();
  }
  state.summary.set(id, { id, temp_c: data.current.temp_c, symbol: data.current.symbol });
  return data;
}

async function prefetch(id) {
  try { await fetchDetail(id); updateCityList(); updateMarkers(); } catch { /* the row stays at -- */ }
}

// ---------- Selection ----------
async function select(id, { fly = true } = {}) {
  state.selected = id;
  if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
  document.querySelectorAll(".city").forEach((el) => {
    const on = el.dataset.id === id;
    el.classList.toggle("active", on);
    el.setAttribute("aria-current", on ? "true" : "false");
    if (on && window.innerWidth <= 900) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  });
  updateMarkers();
  const city = findPlace(id);
  if (fly && state.map && city) state.map.flyTo({ center: [city.lon, city.lat], zoom: Math.max(state.map.getZoom(), 4.5), duration: reduceMotion ? 0 : 900, essential: true });

  const body = $("heroBody");
  body.classList.add("swap");
  let data;
  try {
    data = await fetchDetail(id);
  } catch {
    if (state.selected !== id) return;
    body.classList.remove("swap");
    $("heroSentence").textContent = "Couldn't load the weather for this place. Try again in a minute.";
    return;
  }
  if (state.selected !== id) return;
  updateCityList();
  updateMarkers();

  renderHero(data);
  body.classList.remove("swap");
  renderHourly(data);
  renderWeek(data);
  renderTiles(data);
  $("imdNote").textContent = data.imd && data.imd.now ? "Also using IMD station data" : "";
}

function tick() {
  const data = state.detail.get(state.selected);
  $("heroTime").textContent = fmtDate.format(new Date()) + " · " + fmtTime.format(new Date());
  if (data) renderSun(data);
}

// ---------- Hero ----------
function isNight(data) {
  const sr = data.sun && data.sun.sunrise ? new Date(data.sun.sunrise) : null;
  const ss = data.sun && data.sun.sunset ? new Date(data.sun.sunset) : null;
  if (!sr || !ss) return false;
  const now = new Date();
  return now < sr || now > ss;
}

function renderHero(data) {
  const c = data.city, w = data.current;
  const night = isNight(data);
  const sym = w.symbol || "partly";
  const hero = $("hero");
  hero.dataset.sky = sym;
  hero.dataset.night = String(night);

  $("heroPlace").textContent = c.name;
  $("heroTime").textContent = fmtDate.format(new Date()) + " · " + fmtTime.format(new Date());
  countTo($("heroTemp"), w.temp_c == null ? null : Math.round(w.temp_c));
  $("heroLabel").textContent = night && sym === "sunny" ? "Clear night" : LABELS[sym] || "";
  const today = (data.daily || [])[0];
  $("heroRange").textContent = today ? `H: ${Math.round(today.hi_c)}°   L: ${Math.round(today.lo_c)}°` : "";
  $("heroSentence").textContent = sentence(data);

  Sky.set(sym, night);
}

function countTo(el, target) {
  if (target == null) { el.textContent = "--"; return; }
  const from = parseInt(el.textContent, 10);
  if (reduceMotion || Number.isNaN(from) || from === target) { el.textContent = target; return; }
  const start = performance.now(), dur = 600;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (target - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function sentence(data) {
  const hours = data.hourly || [];
  const w = data.current;
  if (!hours.length) return "";
  const wet = (h) => (h.rain_mm || 0) >= 0.1 || h.symbol === "rain" || h.symbol === "thunder";
  const nowWet = wet(hours[0]);
  const at = (h) => fmtTime.format(new Date(h.time));

  if (nowWet) {
    const dry = hours.find((h, i) => i > 0 && !wet(h));
    const kind = w.symbol === "thunder" ? "Storms" : "Rain";
    return dry ? `${kind} should ease around ${at(dry)}. Keep an umbrella handy until then.` : `${kind} continuing for the next several hours. Plan indoors.`;
  }
  const rain = hours.find((h, i) => i > 0 && wet(h));
  if (rain) {
    const storm = rain.symbol === "thunder";
    return `${storm ? "Thunderstorms" : "Rain"} likely from around ${at(rain)}. ${storm ? "Head indoors before then." : "Carry an umbrella if you're heading out."}`;
  }
  const later = hours[Math.min(6, hours.length - 1)];
  const diff = Math.round(later.temp_c - w.temp_c);
  const label = (LABELS[w.symbol] || "Dry").toLowerCase();
  const trend = diff <= -2 ? `cooling to ${Math.round(later.temp_c)}° by ${at(later)}` : diff >= 2 ? `warming to ${Math.round(later.temp_c)}° by ${at(later)}` : `holding near ${Math.round(w.temp_c)}° through ${at(later)}`;
  return `${label[0].toUpperCase() + label.slice(1)} and dry, ${trend}.`;
}

// ---------- Live sky ----------
const Sky = (() => {
  const cloudsEl = $("skyClouds");
  const canvas = $("skyRain");
  const ctx = canvas.getContext("2d");
  let drops = [], raf = 0, flashTimer = 0, mode = "", intensity = 0;

  const CLOUDS = {
    sunny: { n: 1, op: 0.55, dark: false },
    partly: { n: 3, op: 0.85, dark: false },
    cloudy: { n: 5, op: 0.9, dark: true },
    rain: { n: 5, op: 0.85, dark: true },
    thunder: { n: 5, op: 0.9, dark: true },
    haze: { n: 2, op: 0.4, dark: false },
  };

  function makeClouds(sym, night) {
    const cfg = CLOUDS[sym] || CLOUDS.partly;
    cloudsEl.innerHTML = "";
    const w = cloudsEl.clientWidth || 800;
    for (let i = 0; i < cfg.n; i++) {
      const size = 160 + Math.random() * 180;
      const top = -20 + Math.random() * 120 + i * 8;
      const dur = 70 + Math.random() * 70;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "cloud");
      svg.setAttribute("viewBox", "0 0 240 110");
      svg.innerHTML = '<use href="#cloud-shape"/>';
      svg.style.width = `${size}px`;
      svg.style.top = `${top}px`;
      svg.style.opacity = String(cfg.op * (0.6 + Math.random() * 0.4) * (night ? 0.6 : 1));
      svg.style.fill = cfg.dark ? (night ? "#4a5468" : "#c3ccd7") : "#ffffff";
      svg.style.setProperty("--from", `${-size - 40}px`);
      svg.style.setProperty("--to", `${w + 40}px`);
      svg.style.animationDuration = `${dur}s`;
      svg.style.animationDelay = `${-Math.random() * dur}s`;
      cloudsEl.appendChild(svg);
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedRain(n) {
    const r = canvas.getBoundingClientRect();
    drops = Array.from({ length: n }, () => newDrop(r, true));
  }
  function newDrop(r, anywhere) {
    const z = Math.random();
    return { x: Math.random() * (r.width + 80), y: anywhere ? Math.random() * r.height : -20 - Math.random() * 60, len: 10 + z * 16, v: 9 + z * 9, a: 0.18 + z * 0.4, w: 0.8 + z * 0.9 };
  }

  function frame() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineCap = "round";
    for (const d of drops) {
      ctx.strokeStyle = `rgba(220,235,255,${d.a})`;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
      ctx.stroke();
      d.y += d.v; d.x -= d.v * 0.22;
      if (d.y > r.height + 20) Object.assign(d, newDrop(r, false));
    }
    raf = requestAnimationFrame(frame);
  }

  function startRain(n) {
    stopRain();
    resize();
    seedRain(n);
    if (reduceMotion) { frame(); cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame);
  }
  function stopRain() {
    cancelAnimationFrame(raf);
    raf = 0;
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
  }

  function scheduleFlash() {
    clearTimeout(flashTimer);
    if (reduceMotion) return;
    flashTimer = setTimeout(() => {
      const f = $("skyFlash");
      f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
      scheduleFlash();
    }, 3500 + Math.random() * 6000);
  }

  window.addEventListener("resize", () => { if (raf) resize(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (intensity && !reduceMotion) raf = requestAnimationFrame(frame);
  });

  return {
    set(sym, night) {
      const key = `${sym}|${night}`;
      if (key === mode) return;
      mode = key;
      makeClouds(sym, night);
      intensity = sym === "thunder" ? 140 : sym === "rain" ? 110 : 0;
      if (intensity) startRain(intensity); else stopRain();
      if (sym === "thunder") scheduleFlash(); else clearTimeout(flashTimer);
    },
  };
})();

// ---------- Hourly ----------
function renderHourly(data) {
  const host = $("hourly");
  // Each forecast hour covers the hour after its time; drop ones that have ended.
  const hours = (data.hourly || []).filter((h) => new Date(h.time).getTime() > Date.now() - 3600e3).slice(0, 24);
  host.innerHTML = "";
  host.style.gridTemplateColumns = `repeat(${hours.length}, 70px)`;
  hours.forEach((h, i) => {
    const el = document.createElement("div");
    el.className = "hour" + (i === 0 ? " now" : "");
    el.style.gridRow = "1";
    el.style.animationDelay = `${i * 25}ms`;
    const night = isNightAt(data, new Date(h.time));
    const icon = nightIcon(h.symbol || "cloudy", night);
    const rain = h.rain_prob != null ? (h.rain_prob >= 20 ? `${Math.round(h.rain_prob / 10) * 10}%` : "") : h.rain_mm && h.rain_mm >= 0.1 ? `${h.rain_mm.toFixed(1)} mm` : "";
    el.innerHTML = `<div class="h">${i === 0 ? "Now" : fmtTime.format(new Date(h.time))}</div><svg aria-hidden="true"><use href="#i-${icon}"/></svg><div class="t">${h.temp_c == null ? "--" : Math.round(h.temp_c) + "°"}</div><div class="p">${rain}</div>`;
    host.appendChild(el);
  });
  host.appendChild(curve(hours));
}

// Good enough for list icons across India: dark before 6 AM and after 6 PM IST.
function roughlyNight() {
  const h = +new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", hourCycle: "h23" }).format(new Date());
  return h < 6 || h >= 18;
}

function nightIcon(sym, night) {
  if (!night) return sym;
  return sym === "sunny" ? "night" : sym === "partly" ? "partly-night" : sym;
}

function isNightAt(data, t) {
  const sr = data.sun && data.sun.sunrise ? new Date(data.sun.sunrise) : null;
  const ss = data.sun && data.sun.sunset ? new Date(data.sun.sunset) : null;
  if (!sr || !ss) return false;
  const mins = (d) => (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
  const m = mins(t);
  return m < mins(sr) || m > mins(ss);
}

function curve(hours) {
  const temps = hours.map((h) => h.temp_c).filter((t) => t != null);
  const wrap = document.createElement("div");
  wrap.className = "hour-curve";
  if (temps.length < 2) return wrap;
  const W = hours.length * 62, H = 34, pad = 6;
  const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
  const pts = hours.map((h, i) => [i * 62 + 31, pad + (1 - ((h.temp_c ?? lo) - lo) / span) * (H - pad * 2)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const area = `${d} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const stops = hours.map((h, i) => `<stop offset="${(i / (hours.length - 1)).toFixed(3)}" stop-color="${tempColor(h.temp_c ?? lo)}"/>`).join("");
  wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="curveGrad" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs><path class="area" d="${area}" fill="url(#curveGrad)"/><path class="line draw" d="${d}"/></svg>`;
  const line = wrap.querySelector(".line");
  requestAnimationFrame(() => { try { line.style.setProperty("--len", String(Math.ceil(line.getTotalLength()))); } catch {} });
  return wrap;
}

// ---------- 10-day ----------
function renderWeek(data) {
  const host = $("week");
  const days = (data.daily || []).slice(0, 10);
  host.innerHTML = "";
  if (!days.length) return;
  const lo = Math.min(...days.map((d) => d.lo_c));
  const hi = Math.max(...days.map((d) => d.hi_c));
  const span = Math.max(1, hi - lo);
  days.forEach((d, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${i * 45}ms`;
    const left = ((d.lo_c - lo) / span) * 100;
    const width = Math.max(4, ((d.hi_c - d.lo_c) / span) * 100);
    li.innerHTML = `
      <span class="d">${i === 0 ? "Today" : fmtDay.format(new Date(`${d.date}T12:00:00+05:30`))}</span>
      <span class="icw"><svg aria-hidden="true"><use href="#i-${d.symbol || "cloudy"}"/></svg></span>
      <span class="lo">${Math.round(d.lo_c)}°</span>
      <span class="bar"><span class="r" style="left:${left}%;width:${width}%;background:linear-gradient(90deg,${tempColor(d.lo_c)},${tempColor(d.hi_c)});animation-delay:${i * 45 + 150}ms"></span></span>
      <span class="hi">${Math.round(d.hi_c)}°</span>`;
    host.appendChild(li);
  });
}

// ---------- Tiles ----------
function renderTiles(data) {
  const c = data.current;

  // MET Norway's UV is 0 whenever the sun is down. A 0 at 1 AM tells you
  // nothing, so at night we show the coming day's peak instead.
  const uvNow = c.uv_index == null ? null : Math.round(c.uv_index);
  const peak = c.uv_peak && c.uv_peak.value != null ? { v: Math.round(c.uv_peak.value), t: new Date(c.uv_peak.time) } : null;
  const showPeak = uvNow != null && uvNow < 1 && peak && peak.v >= 1;
  const uv = showPeak ? peak.v : uvNow;
  $("uvVal").textContent = uv ?? "--";
  $("uvUnit").textContent = showPeak ? "peak" : "";
  $("uvDot").hidden = uv == null;
  $("uvDot").style.left = `${Math.min(100, ((uv ?? 0) / 11) * 100)}%`;
  if (uv == null) {
    $("uvLabel").textContent = "Not available";
    $("uvCap").textContent = "No UV reading for this place right now.";
  } else if (showPeak) {
    const day = fmtKey.format(peak.t) === fmtKey.format(new Date()) ? "Today" : "Tomorrow";
    $("uvLabel").textContent = `${uvLabel(peak.v)} · ${day} ${fmtTime.format(peak.t)}`;
    $("uvCap").textContent = `It's 0 now while the sun is down.`;
  } else {
    $("uvLabel").textContent = uvLabel(uv);
    $("uvCap").textContent = peak && peak.v > uv
      ? `Rising to ${peak.v} (${uvLabel(peak.v).toLowerCase()}) around ${fmtTime.format(peak.t)}.`
      : uvCaption(uv);
  }

  $("windVal").textContent = c.wind_kmh == null ? "--" : Math.round(c.wind_kmh);
  $("windSub").textContent = c.wind_dir == null ? "" : `From the ${compassName(c.wind_dir)}`;
  $("windCap").textContent = windCaption(c.wind_kmh);
  if (c.wind_dir != null) $("compassArrow").style.transform = `rotate(${(c.wind_dir + 180) % 360}deg)`;

  renderSun(data);

  const h = c.humidity;
  $("humVal").textContent = h == null ? "--" : Math.round(h);
  const dew = dewPoint(c.temp_c, h);
  $("humSub").textContent = dew == null ? "" : `Dew point ${dew}°`;
  $("humFill").style.width = h == null ? "0%" : `${h}%`;
  $("humCap").textContent = humCaption(h, dew);

  const v = c.visibility_km;
  $("visVal").textContent = v == null ? "--" : v >= 10 ? Math.round(v) : v.toFixed(1);
  $("visFill").style.width = v == null ? "0%" : `${Math.min(100, (v / 20) * 100)}%`;
  $("visCap").textContent = visCaption(v);

  const f = c.feels_c, t = c.temp_c;
  $("feelsVal").textContent = f == null ? "--" : Math.round(f);
  const pos = (x) => `${Math.min(100, Math.max(0, ((x - 10) / 35) * 100))}%`;
  if (f != null) $("feelsDot").style.left = pos(f);
  if (t != null) $("actualTick").style.left = pos(t);
  const diff = f != null && t != null ? Math.round(f - t) : null;
  $("feelsSub").textContent = diff == null ? "" : diff === 0 ? "Same as actual" : `Actual ${Math.round(t)}°`;
  $("feelsCap").textContent = diff == null ? "" : diff >= 2 ? "Humidity makes it feel warmer." : diff <= -2 ? "The breeze makes it feel cooler." : "Close to the actual temperature.";
}

function renderSun(data) {
  const sr = data.sun && data.sun.sunrise ? new Date(data.sun.sunrise) : null;
  const ss = data.sun && data.sun.sunset ? new Date(data.sun.sunset) : null;
  const dot = $("sunDot");
  if (!sr || !ss) { $("sunVal").textContent = "--"; $("sunCap").textContent = ""; dot.style.opacity = "0"; return; }
  const now = new Date();
  const beforeSunset = now >= sr && now <= ss;
  $("sunTitle").textContent = beforeSunset ? "Sunset" : "Sunrise";
  $("sunVal").textContent = fmtTime.format(beforeSunset ? ss : sr);
  $("sunCap").textContent = beforeSunset ? `Sunrise was ${fmtTime.format(sr)}.` : `Sunset was ${fmtTime.format(ss)}.`;
  const k = Math.min(1, Math.max(0, (now - sr) / (ss - sr)));
  const x = 4 + 192 * k;
  const y = (1 - k) * (1 - k) * 60 + 2 * (1 - k) * k * -28 + k * k * 60;
  dot.style.left = `${(x / 200) * 100}%`;
  dot.style.top = `${(y / 64) * 64}px`;
  dot.style.opacity = beforeSunset ? "1" : "0.35";
}

function dewPoint(t, rh) {
  if (t == null || rh == null || rh <= 0) return null;
  const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
  return Math.round((243.12 * g) / (17.62 - g));
}
function uvLabel(n) { return n <= 2 ? "Low" : n <= 5 ? "Moderate" : n <= 7 ? "High" : n <= 10 ? "Very high" : "Extreme"; }
function uvCaption(n) {
  if (n <= 2) return "Low for the rest of the day.";
  if (n <= 5) return "Sunscreen helps around midday.";
  if (n <= 7) return "Use sun protection until late afternoon.";
  return "Avoid the midday sun; cover up outdoors.";
}
function compassName(deg) { return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round((deg % 360) / 45) % 8]; }
function windCaption(k) {
  if (k == null) return "";
  if (k < 6) return "Air is almost still.";
  if (k < 20) return "A light, steady breeze.";
  if (k < 39) return "Breezy. Loose things may blow around.";
  return "Strong winds. Take care outdoors.";
}
function humCaption(h, dew) {
  if (h == null) return "";
  if (dew != null && dew >= 24) return "Very muggy. Sweat won't dry easily.";
  if (dew != null && dew >= 20) return "Sticky and humid.";
  if (h < 30) return "Dry air. Drink plenty of water.";
  return "Comfortable.";
}
function visCaption(v) {
  if (v == null) return "";
  if (v >= 10) return "Clear view to the horizon.";
  if (v >= 5) return "Light haze in the distance.";
  if (v >= 2) return "Hazy. Distant buildings fade.";
  return "Low visibility. Drive carefully.";
}

const TEMP_STOPS = [[5, [94, 92, 230]], [14, [10, 132, 255]], [20, [48, 176, 199]], [25, [52, 199, 89]], [30, [255, 214, 10]], [35, [255, 159, 10]], [41, [255, 69, 58]]];
function tempColor(t) {
  if (t <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1]})`;
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(",")})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1]})`;
}

function buildCompassTicks() {
  const g = $("compassTicks");
  let s = "";
  for (let i = 0; i < 360; i += 15) {
    if (i % 90 === 0) continue;
    const major = i % 45 === 0;
    const a = (i * Math.PI) / 180, r1 = 44, r2 = major ? 37 : 40;
    s += `<line class="${major ? "major" : ""}" x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + r2 * Math.sin(a)}" y2="${50 - r2 * Math.cos(a)}"/>`;
  }
  g.innerHTML = s;
}

// ---------- Map (MapLibre + OpenFreeMap: free, no key, no limits) ----------
const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
const NAMES_ZOOM = 4.75;

function initMap() {
  const bounds = new maplibregl.LngLatBounds();
  state.cities.forEach((c) => bounds.extend([c.lon, c.lat]));
  const map = new maplibregl.Map({
    container: "map",
    style: prefersDark.matches ? STYLE.dark : STYLE.light,
    bounds,
    fitBoundsOptions: { padding: 36 },
    minZoom: 3,
    maxZoom: 10,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    scrollZoom: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  state.map = map;

  map.getContainer().addEventListener("click", () => map.scrollZoom.enable(), { once: true });
  map.on("zoom", () => map.getContainer().classList.toggle("map-names", map.getZoom() >= NAMES_ZOOM));
  map.on("zoomend", declutter);
  map.on("moveend", declutter);
  map.on("style.load", () => { $("mapNote").hidden = true; if (Radar.frames.length) addRadarLayers(); });
  map.on("error", (e) => {
    if (!map.isStyleLoaded() && e && e.error) $("mapNote").hidden = false;
  });
  prefersDark.addEventListener?.("change", () => map.setStyle(prefersDark.matches ? STYLE.dark : STYLE.light));

  state.cities.forEach(addMarker);
  if (state.place) addMarker(state.place);
  new ResizeObserver(() => map.resize()).observe($("map"));
  updateMarkers();
}

function addMarker(c) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pin-wrap";
  el.setAttribute("aria-label", c.name);
  el.addEventListener("click", (e) => { e.stopPropagation(); select(c.id); });
  const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.lon, c.lat]).addTo(state.map);
  state.markers.set(c.id, m);
}

function updateMarkers() {
  state.markers.forEach((m, id) => {
    const c = findPlace(id);
    if (!c) return;
    const s = state.summary.get(id);
    const active = id === state.selected;
    const t = s && s.temp_c != null ? Math.round(s.temp_c) : null;
    const el = m.getElement();
    el.classList.toggle("active", active);
    el.setAttribute("aria-label", c.name);
    const extra = c.id.startsWith("@");
    el.innerHTML = `<span class="pin${active ? " active" : ""}${extra ? " extra" : ""}"><span class="b"><span class="sw" style="background:${t == null ? "#c7ccd3" : tempColor(t)}"></span>${t == null ? "--" : t + "°"}<span class="n"></span></span></span>`;
    el.querySelector(".n").textContent = c.name;
  });
  declutter();
}

// Hide pins that would overlap a more important one; the city list is ordered big metros first.
function declutter() {
  const map = state.map;
  if (!map) return;
  const named = map.getZoom() >= NAMES_ZOOM;
  const placed = [];
  const first = [state.selected, state.place && state.place.id].filter(Boolean);
  const order = [...new Set([...first, ...state.cities.map((c) => c.id)])];
  order.forEach((id) => {
    const m = state.markers.get(id);
    if (!m) return;
    const c = findPlace(id);
    if (!c) return;
    const p = map.project(m.getLngLat());
    const w = 56 + (named || id === state.selected ? c.name.length * 7 + 6 : 0);
    const box = { x1: p.x - w / 2 - 3, x2: p.x + w / 2 + 3, y1: p.y - 15, y2: p.y + 15 };
    const hit = placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
    m.getElement().style.visibility = hit ? "hidden" : "";
    if (!hit) placed.push(box);
  });
}

// ---------- Rain radar (RainViewer, free, no key) ----------
const Radar = { frames: [], host: "", i: 0, timer: 0, playing: true, ready: false };

function wireLayerToggle() {
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer)));
  $("radarPlay").addEventListener("click", () => {
    Radar.playing = !Radar.playing;
    $("radarPlay").innerHTML = Radar.playing ? '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7Z" fill="#fff" stroke="none"/></svg>';
    $("radarPlay").setAttribute("aria-label", Radar.playing ? "Pause radar" : "Play radar");
    if (Radar.playing) playRadar(); else clearInterval(Radar.timer);
  });
}

async function setLayer(layer) {
  state.layer = layer;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.layer === layer));
  const legend = $("mapLegend");
  if (layer === "radar") {
    legend.innerHTML = '<span>Light</span><span class="legend-bar rain"></span><span>Heavy</span>';
    if (!Radar.ready) await loadRadar();
    if (!Radar.frames.length) { legend.innerHTML = "<span>Radar is unavailable right now</span>"; return; }
    $("radarBar").hidden = false;
    showFrame(Radar.frames.length - 1);
    if (Radar.playing) playRadar();
  } else {
    legend.innerHTML = '<span>10°</span><span class="legend-bar temp"></span><span>40°</span>';
    $("radarBar").hidden = true;
    clearInterval(Radar.timer);
    showFrame(-1);
  }
}

async function loadRadar() {
  Radar.ready = true;
  try {
    const d = await getJSON("https://api.rainviewer.com/public/weather-maps.json");
    Radar.host = d.host;
    Radar.frames = (d.radar && d.radar.past) || [];
    if (state.map.isStyleLoaded()) addRadarLayers();
  } catch {
    Radar.frames = [];
  }
}

function addRadarLayers() {
  const map = state.map;
  const firstLabel = (map.getStyle().layers || []).find((l) => l.type === "symbol");
  Radar.frames.forEach((f, i) => {
    const id = `radar-${i}`;
    if (map.getSource(id)) return;
    map.addSource(id, { type: "raster", tiles: [`${Radar.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7, attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>' });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 300 }, "raster-fade-duration": 0 } }, firstLabel && firstLabel.id);
  });
  if (state.layer === "radar") showFrame(Radar.i);
}

function showFrame(i) {
  const map = state.map;
  Radar.frames.forEach((_, j) => { if (map.getLayer(`radar-${j}`)) map.setPaintProperty(`radar-${j}`, "raster-opacity", j === i ? 0.75 : 0); });
  if (i < 0) return;
  Radar.i = i;
  const f = Radar.frames[i];
  $("radarTime").textContent = f ? fmtTime.format(new Date(f.time * 1000)) : "--";
  $("radarFill").style.width = `${((i + 1) / Radar.frames.length) * 100}%`;
}

function playRadar() {
  clearInterval(Radar.timer);
  if (reduceMotion) return;
  Radar.timer = setInterval(() => { if (state.layer === "radar") showFrame((Radar.i + 1) % Radar.frames.length); }, 700);
}
