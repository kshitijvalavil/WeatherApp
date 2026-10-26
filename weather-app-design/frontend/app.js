// Mausam frontend. Fetches cities and weather from the Flask backend
// at /api/*. Served by the same backend, so there is no CORS to worry
// about.

// ---------- Hardcoded screen positions for the ten starting cities ----------
// These are just where the dot sits on the simplified SVG map, not real
// coordinates. The real coordinates live in the backend.
const CITY_POS = {
  delhi:     { x: 230, y: 130 },
  mumbai:    { x: 150, y: 360 },
  kolkata:   { x: 360, y: 260 },
  chennai:   { x: 285, y: 470 },
  bengaluru: { x: 245, y: 445 },
  hyderabad: { x: 265, y: 385 },
  jaipur:    { x: 185, y: 170 },
  ahmedabad: { x: 145, y: 265 },
  pune:      { x: 180, y: 385 },
  lucknow:   { x: 265, y: 190 }
};

const REGION_NOTE = {
  delhi:     "Northern plains · dry winter",
  mumbai:    "Coastal · humid subtropical",
  kolkata:   "Gangetic delta · humid",
  chennai:   "East coast · tropical wet-dry",
  bengaluru: "Deccan plateau · mild",
  hyderabad: "Deccan plateau · semi-arid",
  jaipur:    "Thar edge · arid",
  ahmedabad: "Western plains · hot semi-arid",
  pune:      "Western Ghats rain shadow",
  lucknow:   "Awadh plains · subtropical"
};

// ---------- Weather icons (big, animated SVGs) ----------
function rays(cx, cy, inner, outer) {
  let out = "";
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const x1 = cx + Math.cos(a) * inner;
    const y1 = cy + Math.sin(a) * inner;
    const x2 = cx + Math.cos(a) * outer;
    const y2 = cy + Math.sin(a) * outer;
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sun)" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  return out;
}
function cloudPath(cx, cy, s = 1) {
  const r = 16 * s;
  return `
    <g fill="var(--cloud)" stroke="var(--map-land-edge)" stroke-width="1" opacity=".95">
      <circle cx="${cx - 14 * s}" cy="${cy}" r="${r * 0.9}"/>
      <circle cx="${cx + 14 * s}" cy="${cy - 2 * s}" r="${r * 1}"/>
      <circle cx="${cx}" cy="${cy - 10 * s}" r="${r * 1.1}"/>
      <rect x="${cx - 24 * s}" y="${cy}" width="${48 * s}" height="${r}" rx="${r * 0.6}"/>
    </g>`;
}
const ICONS = {
  sunny: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="anim-sun">${rays(60, 60, 22, 34)}</g>
      <circle class="anim-sun-core" cx="60" cy="60" r="22" fill="var(--sun)"/>
    </svg>`,
  partly: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="anim-sun" style="transform-origin:42px 50px;">${rays(42, 50, 16, 26)}</g>
      <circle class="anim-sun-core" cx="42" cy="50" r="16" fill="var(--sun)" style="transform-origin:42px 50px;"/>
      <g class="cloud-drift">${cloudPath(78, 70)}</g>
    </svg>`,
  cloudy: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="cloud-drift" style="opacity:.7;">${cloudPath(44, 52, 0.9)}</g>
      <g class="cloud-drift" style="animation-delay:-2s;">${cloudPath(68, 68)}</g>
    </svg>`,
  rain: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="cloud-drift">${cloudPath(60, 50)}</g>
      <line class="drop"    x1="46" y1="76" x2="42" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
      <line class="drop d2" x1="62" y1="76" x2="58" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
      <line class="drop d3" x1="78" y1="76" x2="74" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  thunder: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="cloud-drift">${cloudPath(60, 46)}</g>
      <polygon class="bolt-flash" points="58,70 70,70 60,86 72,86 52,106 60,88 50,88"
               fill="var(--bolt)" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
      <line class="drop d2" x1="42" y1="76" x2="38" y2="88" stroke="var(--rain)" stroke-width="2.5" stroke-linecap="round"/>
      <line class="drop d3" x1="86" y1="76" x2="82" y2="88" stroke="var(--rain)" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
  haze: () => `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="anim-sun-core" cx="60" cy="48" r="20" fill="var(--sun)" opacity=".85"/>
      <g class="haze-waves" stroke="var(--cloud)" stroke-width="4" stroke-linecap="round">
        <line x1="22" y1="80" x2="98" y2="80"/>
        <line x1="30" y1="92" x2="92" y2="92"/>
        <line x1="38" y1="104" x2="86" y2="104"/>
      </g>
    </svg>`
};

function miniIcon(kind) {
  const sun   = `<circle cx="14" cy="14" r="7" fill="var(--sun)"/>`;
  const cloud = `<g fill="var(--cloud)"><circle cx="10" cy="16" r="6"/><circle cx="18" cy="14" r="7"/><rect x="7" y="16" width="16" height="6" rx="3"/></g>`;
  const rain  = cloud + `<line x1="11" y1="24" x2="10" y2="27" stroke="var(--rain)" stroke-width="1.8" stroke-linecap="round"/><line x1="17" y1="24" x2="16" y2="27" stroke="var(--rain)" stroke-width="1.8" stroke-linecap="round"/>`;
  const bolt  = cloud + `<polygon points="14,22 17,22 13,27 16,27 10,33 14,27 11,27" fill="var(--bolt)"/>`;
  switch (kind) {
    case "sunny":   return sun;
    case "haze":    return sun + `<line x1="4" y1="22" x2="24" y2="22" stroke="var(--cloud)" stroke-width="2" stroke-linecap="round"/><line x1="7" y1="26" x2="21" y2="26" stroke="var(--cloud)" stroke-width="2" stroke-linecap="round"/>`;
    case "partly":  return sun + `<g transform="translate(6,4)">${cloud}</g>`;
    case "rain":    return rain;
    case "thunder": return bolt;
    default:        return cloud;
  }
}

// ---------- Time and text helpers ----------
const IST = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false };
const IST_HOUR_LABEL = { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true };

function istTime(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-GB", IST).format(new Date(iso)); }
  catch (e) { return "—"; }
}
function istHour(iso) {
  if (!iso) return "";
  try {
    const label = new Intl.DateTimeFormat("en-US", IST_HOUR_LABEL).format(new Date(iso));
    return label.replace(" ", "").toUpperCase(); // "3 PM" -> "3PM"
  } catch (e) { return ""; }
}
function fmtNum(n, decimals = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(decimals);
}

// Writes a plain-English line from the current reading. Rough rules; the
// idea is that the line always says something useful even when IMD data
// isn't there yet.
function oneLiner(current, hourly) {
  const t = current.temp_c;
  const sym = current.symbol || "cloudy";
  const rainSoon = (hourly.slice(0, 3).find(h => (h.rain_mm || 0) >= 0.4));
  const parts = [];

  if (sym === "thunder") parts.push("Thundershowers around");
  else if (sym === "rain") parts.push("Rainy spells today");
  else if (sym === "haze") parts.push("Hazy air");
  else if (sym === "cloudy") parts.push("Overcast skies");
  else if (sym === "partly") parts.push("Mixed sun and clouds");
  else parts.push("Clear and bright");

  if (t != null) {
    if (t <= 18) parts.push("keep a jacket handy");
    else if (t >= 34) parts.push("hydrate hard and stay in the shade mid-day");
    else parts.push("comfortable most of the day");
  }
  if (rainSoon) parts.push("carry an umbrella — rain within a couple of hours");
  return parts.join(", ") + ".";
}

// ---------- Rendering ----------
const $ = (id) => document.getElementById(id);
let selectedId = null;

function renderCities(cities) {
  const g = $("cities");
  g.innerHTML = "";
  cities.forEach(c => {
    const pos = CITY_POS[c.id] || { x: 250, y: 300 };
    const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
    el.setAttribute("class", "city");
    el.setAttribute("data-id", c.id);
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", c.name);
    el.innerHTML = `
      <circle class="halo" cx="${pos.x}" cy="${pos.y}" r="6"/>
      <circle class="dot"  cx="${pos.x}" cy="${pos.y}" r="6"/>
      <text x="${pos.x + 10}" y="${pos.y + 4}">${c.name}</text>
    `;
    el.addEventListener("click", () => selectCity(c.id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCity(c.id); }
    });
    g.appendChild(el);
  });
}

function markSelected(id) {
  document.querySelectorAll(".city").forEach(n => {
    n.classList.remove("selected", "pulse");
    if (n.dataset.id === id) n.classList.add("selected", "pulse");
  });
}

function renderWeather(data) {
  $("emptyCard").hidden = true;
  $("weatherCard").hidden = false;

  const { city, current, hourly, sun, imd } = data;
  $("cityName").textContent = `${city.name}, ${city.state}`;
  $("cityNote").textContent = REGION_NOTE[city.id] || "";
  $("asOf").textContent = `Today · ${istTime(current.time || new Date().toISOString())} IST`;

  $("iconBox").innerHTML = ICONS[current.symbol] ? ICONS[current.symbol]() : ICONS.cloudy();
  $("tempNum").textContent = current.temp_c != null ? Math.round(current.temp_c) : "—";
  $("condText").textContent = humanSymbol(current.symbol);
  $("oneliner").textContent = oneLiner(current, hourly || []);

  $("feels").textContent = current.temp_c != null ? `${Math.round(current.temp_c)}°` : "—";
  $("rain").textContent  = formatNextHourRain(hourly);
  $("wind").textContent  = current.wind_kmh != null ? `${fmtNum(current.wind_kmh, 0)} km/h` : "—";
  $("hum").textContent   = current.humidity != null ? `${fmtNum(current.humidity, 0)}%` : "—";

  $("sunrise").textContent = istTime(sun?.sunrise);
  $("sunset").textContent  = istTime(sun?.sunset);

  // Hourly strip: 6 slots, every 2 hours
  const hours = (hourly || []).filter((_, i) => i % 2 === 0).slice(0, 6);
  $("hours").innerHTML = hours.map(h =>
    `<div class="hour">
       <div class="t">${istHour(h.time)}</div>
       <svg class="mini" viewBox="0 0 28 32" aria-hidden="true">${miniIcon(h.symbol)}</svg>
       <div class="deg">${h.temp_c != null ? Math.round(h.temp_c) : "—"}°</div>
     </div>`
  ).join("");

  $("imdCredit").hidden = !(imd && (imd.now || imd.warnings));
}

function humanSymbol(k) {
  return {
    sunny: "Clear and bright",
    partly: "Partly cloudy",
    cloudy: "Overcast",
    rain: "Rain",
    thunder: "Thundershowers",
    haze: "Hazy"
  }[k] || "—";
}

function formatNextHourRain(hourly) {
  if (!hourly || !hourly.length) return "—";
  const mm = hourly[0].rain_mm;
  if (mm == null) return "—";
  if (mm < 0.1) return "None";
  return `${mm.toFixed(1)} mm`;
}

// ---------- Networking ----------
async function selectCity(id) {
  selectedId = id;
  markSelected(id);
  showError(null);
  try {
    const r = await fetch(`/api/weather?city=${encodeURIComponent(id)}`);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    renderWeather(data);
  } catch (e) {
    showError(`Couldn't load the weather for ${id}: ${e.message}`);
  }
}

async function loadCities() {
  try {
    const r = await fetch("/api/cities");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    renderCities(data.cities);
    $("loadingTag").textContent = "Tap a dot";
  } catch (e) {
    $("loadingTag").textContent = "Offline";
    showError(`Can't reach the server. Is the backend running on this host?`);
  }
}

function showError(msg) {
  const bar = $("errorBar");
  if (!msg) { bar.hidden = true; return; }
  bar.textContent = msg;
  bar.hidden = false;
}

// ---------- Theme toggle (per viewer) ----------
const btn = $("themeBtn");
try {
  const saved = localStorage.getItem("mausam-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
} catch (e) {}
btn.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
  if (next) document.documentElement.setAttribute("data-theme", next);
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("mausam-theme", next); } catch (e) {}
});

// ---------- Boot ----------
loadCities();
