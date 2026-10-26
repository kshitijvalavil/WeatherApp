// Mausam frontend.
// Fetches cities and weather from the Flask backend at /api/*. The
// backend serves this page too, so there is no cross-origin step.

// ---------- Where the ten starting city dots sit on the map ----------
// These are coordinates in the SVG viewBox (0..500 × 0..600), not real
// geographic coordinates. The real coordinates live in the backend.
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
  delhi:     "National Capital Territory · dry winter",
  mumbai:    "Coastal Maharashtra · humid subtropical",
  kolkata:   "Gangetic delta · humid",
  chennai:   "East coast · tropical wet-dry",
  bengaluru: "Deccan plateau · mild",
  hyderabad: "Deccan plateau · semi-arid",
  jaipur:    "Thar edge · arid",
  ahmedabad: "Western plains · hot semi-arid",
  pune:      "Western Ghats rain shadow",
  lucknow:   "Awadh plains · subtropical"
};

// ---------- Animated weather icons (big, inline SVGs) ----------
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
    <g fill="var(--cloud)" stroke="rgba(0,0,0,.14)" stroke-width="1" opacity=".96">
      <circle cx="${cx - 14 * s}" cy="${cy}" r="${r * 0.9}"/>
      <circle cx="${cx + 14 * s}" cy="${cy - 2 * s}" r="${r * 1}"/>
      <circle cx="${cx}" cy="${cy - 10 * s}" r="${r * 1.1}"/>
      <rect x="${cx - 24 * s}" y="${cy}" width="${48 * s}" height="${r}" rx="${r * 0.6}"/>
    </g>`;
}
const ICONS = {
  sunny: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Clear sky">
      <g class="anim-sun">${rays(60, 60, 22, 34)}</g>
      <circle class="anim-sun-core" cx="60" cy="60" r="22" fill="var(--sun)"/>
    </svg>`,
  night: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Clear night">
      <path d="M80 36a28 28 0 1 0 20 44 24 24 0 0 1-20-44z" fill="var(--sun)" stroke="rgba(0,0,0,.15)" stroke-width="1"/>
      <circle cx="40" cy="38" r="1.5" fill="var(--sky-ink-soft)"/>
      <circle cx="30" cy="60" r="1" fill="var(--sky-ink-soft)"/>
      <circle cx="58" cy="90" r="1.5" fill="var(--sky-ink-soft)"/>
    </svg>`,
  partly: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Partly cloudy">
      <g class="anim-sun" style="transform-origin:42px 50px;">${rays(42, 50, 16, 26)}</g>
      <circle class="anim-sun-core" cx="42" cy="50" r="16" fill="var(--sun)" style="transform-origin:42px 50px;"/>
      <g class="cloud-drift">${cloudPath(78, 70)}</g>
    </svg>`,
  cloudy: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Overcast">
      <g class="cloud-drift" style="opacity:.75;">${cloudPath(44, 52, 0.9)}</g>
      <g class="cloud-drift" style="animation-delay:-2s;">${cloudPath(68, 68)}</g>
    </svg>`,
  rain: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Rain">
      <g class="cloud-drift">${cloudPath(60, 50)}</g>
      <line class="drop"    x1="46" y1="76" x2="42" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
      <line class="drop d2" x1="62" y1="76" x2="58" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
      <line class="drop d3" x1="78" y1="76" x2="74" y2="92" stroke="var(--rain)" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  thunder: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Thunderstorm">
      <g class="cloud-drift">${cloudPath(60, 46)}</g>
      <polygon class="bolt-flash" points="58,70 70,70 60,86 72,86 52,106 60,88 50,88"
               fill="var(--bolt)" stroke="rgba(0,0,0,.15)" stroke-width="1" stroke-linejoin="round"/>
      <line class="drop d2" x1="42" y1="76" x2="38" y2="88" stroke="var(--rain)" stroke-width="2.5" stroke-linecap="round"/>
      <line class="drop d3" x1="86" y1="76" x2="82" y2="88" stroke="var(--rain)" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
  haze: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Hazy">
      <circle class="anim-sun-core" cx="60" cy="48" r="20" fill="var(--sun)" opacity=".9"/>
      <g class="haze-waves" stroke="var(--cloud)" stroke-width="4" stroke-linecap="round">
        <line x1="22" y1="80" x2="98" y2="80"/>
        <line x1="30" y1="92" x2="92" y2="92"/>
        <line x1="38" y1="104" x2="86" y2="104"/>
      </g>
    </svg>`
};

function miniIcon(kind) {
  const sun   = `<circle cx="14" cy="12" r="6" fill="var(--sun)"/>`;
  const cloud = `<g fill="var(--cloud)"><circle cx="10" cy="16" r="5"/><circle cx="18" cy="14" r="6"/><rect x="7" y="16" width="16" height="6" rx="3"/></g>`;
  const rain  = cloud + `<line x1="11" y1="23" x2="10" y2="26" stroke="var(--rain)" stroke-width="1.8" stroke-linecap="round"/><line x1="17" y1="23" x2="16" y2="26" stroke="var(--rain)" stroke-width="1.8" stroke-linecap="round"/>`;
  const bolt  = cloud + `<polygon points="14,22 17,22 13,26 16,26 10,32 14,26 11,26" fill="var(--bolt)"/>`;
  switch (kind) {
    case "sunny":   return sun;
    case "night":   return `<path d="M18 7a7 7 0 1 0 5 11 6 6 0 0 1-5-11z" fill="var(--sun)"/>`;
    case "haze":    return sun + `<line x1="4" y1="20" x2="24" y2="20" stroke="var(--cloud)" stroke-width="2" stroke-linecap="round"/><line x1="7" y1="23" x2="21" y2="23" stroke="var(--cloud)" stroke-width="2" stroke-linecap="round"/>`;
    case "partly":  return sun + `<g transform="translate(6,4)">${cloud}</g>`;
    case "rain":    return rain;
    case "thunder": return bolt;
    default:        return cloud;
  }
}

// ---------- Time and formatting helpers ----------
const IST_HM = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false };
const IST_HOUR_LABEL = { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true };

function istHM(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-GB", IST_HM).format(new Date(iso)); }
  catch (e) { return "—"; }
}
function istHour(iso) {
  if (!iso) return "";
  try {
    const label = new Intl.DateTimeFormat("en-US", IST_HOUR_LABEL).format(new Date(iso));
    return label.replace(" ", "").toUpperCase(); // "3 PM" -> "3PM"
  } catch (e) { return ""; }
}
function minutesSinceMidnightIST(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const istStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(d);
  const [h, m] = istStr.split(":").map(Number);
  return h * 60 + m;
}
function fmtNum(n, decimals = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(decimals);
}

// A readable sentence worked out from the current reading plus the next
// few hours. Rough rules, but always says something useful.
function oneLiner(current, hourly) {
  const t = current.temp_c;
  const sym = current.symbol || "cloudy";
  const next = (hourly || []).slice(0, 4);
  const rainSoon = next.find(h => (h.rain_mm || 0) >= 0.4);
  const thunderSoon = next.find(h => h.symbol === "thunder");

  if (thunderSoon) return `Thunder in the next few hours. Finish outdoor errands early.`;
  if (sym === "rain" || rainSoon)
    return rainSoon
      ? `Rain within a couple of hours. Keep an umbrella close.`
      : `Rainy spells today. An umbrella will see you through.`;
  if (sym === "haze") return `Hazy air today. Mask up if you'll be outside long.`;
  if (sym === "cloudy") return `Overcast and still. A comfortable, muted sort of day.`;
  if (sym === "partly") return `Sun and clouds take turns. A good day to walk.`;
  if (t != null && t >= 34) return `A hot one. Hydrate and keep errands for after sundown.`;
  if (t != null && t <= 15) return `Cool and clear. Light sweater in the evening.`;
  return `Clear and bright all day. Make the most of it.`;
}

// ---------- Sky mood (gradient on the hero) ----------
// We pick from a small set depending on symbol and whether it's day,
// dawn, dusk or night at the given time (compared against sunrise and
// sunset for that place).
function skyMood(current, sun) {
  const sym = current.symbol || "cloudy";
  if (sym === "thunder") return "thunder";
  if (sym === "haze") return "haze";

  const nowMin = minutesSinceMidnightIST(current.time || new Date().toISOString());
  const srMin  = minutesSinceMidnightIST(sun?.sunrise);
  const ssMin  = minutesSinceMidnightIST(sun?.sunset);
  const DAWN = 40, DUSK = 40; // minutes either side of sunrise/sunset

  let day = true, dawn = false, dusk = false, night = false;
  if (srMin != null && ssMin != null && nowMin != null) {
    if (nowMin >= srMin - DAWN && nowMin <= srMin + DAWN) dawn = true;
    else if (nowMin >= ssMin - DUSK && nowMin <= ssMin + DUSK) dusk = true;
    else if (nowMin < srMin || nowMin > ssMin) night = true;
    day = !(dawn || dusk || night);
  }

  if (sym === "sunny") {
    if (dawn)  return "clear-dawn";
    if (dusk)  return "clear-dusk";
    if (night) return "clear-night";
    return "clear-day";
  }
  if (sym === "partly") {
    if (night) return "cloudy-night";
    if (dusk)  return "clear-dusk";
    return "cloudy-day";
  }
  if (sym === "cloudy") {
    return night ? "cloudy-night" : "cloudy-day";
  }
  if (sym === "rain") {
    return night ? "rain-night" : "rain-day";
  }
  return night ? "clear-night" : "clear-day";
}

function iconForSymbol(sym, isNight) {
  if (sym === "sunny" && isNight) return "night";
  return sym;
}

// ---------- Charting the hourly temperature ----------
function drawTempChart(hourly) {
  const svg = document.getElementById("chart");
  if (!svg) return;
  const temps = hourly.map(h => h.temp_c).filter(v => v != null);
  if (!temps.length) { svg.innerHTML = ""; return; }

  const W = 600, H = 68, pad = 10;
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = Math.max(1, max - min);

  const n = hourly.length;
  const step = (W - pad * 2) / Math.max(1, n - 1);
  const points = hourly.map((h, i) => {
    const x = pad + step * i;
    const y = h.temp_c == null
      ? null
      : pad + (H - pad * 2) * (1 - (h.temp_c - min) / range);
    return { x, y, temp: h.temp_c };
  });

  // The area fill under the line.
  const area = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ") + ` L ${pad + step * (n - 1)} ${H} L ${pad} ${H} Z`;
  const line = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  const nowX = pad + step * 0; // "now" is the first point

  svg.innerHTML = `
    <defs>
      <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity=".30"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#tempFill)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.5"/>`).join("")}
    <line class="now-marker" x1="${nowX}" x2="${nowX}" y1="0" y2="${H}"/>
  `;
}

// ---------- Sun arc ----------
function drawSunArc(sun, nowIso) {
  const svg = document.getElementById("sunTrack");
  if (!svg) return;

  const sr = minutesSinceMidnightIST(sun?.sunrise);
  const ss = minutesSinceMidnightIST(sun?.sunset);
  const now = minutesSinceMidnightIST(nowIso || new Date().toISOString());
  const W = 400, H = 56, pad = 10;

  let t = 0.5;
  if (sr != null && ss != null && now != null && ss > sr) {
    t = Math.min(1, Math.max(0, (now - sr) / (ss - sr)));
  }

  // Half-ellipse arc
  const cx = W / 2;
  const cy = H;
  const rx = (W - pad * 2) / 2;
  const ry = H - pad;

  // Position on the arc
  const angle = Math.PI * (1 - t);
  const px = cx + rx * Math.cos(Math.PI - angle);
  const py = cy - ry * Math.sin(Math.PI - angle);

  svg.innerHTML = `
    <path d="M ${pad} ${H} A ${rx} ${ry} 0 0 1 ${W - pad} ${H}"
          fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 4"/>
    <circle cx="${pad}"      cy="${H}" r="3" fill="var(--muted)"/>
    <circle cx="${W - pad}"  cy="${H}" r="3" fill="var(--muted)"/>
    <circle cx="${px}" cy="${py}" r="6" fill="var(--sun)" stroke="var(--accent)" stroke-width="1.5"/>
  `;

  // Day length label
  const label = document.getElementById("dayLen");
  if (label) {
    if (sr != null && ss != null && ss > sr) {
      const mins = ss - sr;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      label.textContent = `${h}h ${m.toString().padStart(2, "0")}m of daylight`;
    } else {
      label.textContent = "";
    }
  }
}

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);

// ---------- Render ----------
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
    el.setAttribute("aria-label", `${c.name}, ${c.state}`);
    el.innerHTML = `
      <circle class="halo" cx="${pos.x}" cy="${pos.y}" r="6"/>
      <circle class="dot"  cx="${pos.x}" cy="${pos.y}" r="6"/>
      <text class="name" x="${pos.x + 10}" y="${pos.y + 4}">${c.name}</text>
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
    n.classList.toggle("selected", n.dataset.id === id);
    n.classList.toggle("pulse",    n.dataset.id === id);
  });
}

function renderWeather(data) {
  $("emptyCard").hidden = true;
  const card = $("weatherCard");
  card.hidden = false;
  card.setAttribute("aria-busy", "false");

  const { city, current, hourly, sun, imd } = data;

  // Mood and icon reflect the time of day as well as the condition.
  const mood = skyMood(current, sun);
  card.setAttribute("data-mood", mood);
  const isNight = mood.endsWith("-night");
  const iconKey = iconForSymbol(current.symbol || "cloudy", isNight);
  $("iconBox").innerHTML = (ICONS[iconKey] || ICONS.cloudy)();

  // Hero
  $("cityName").textContent = city.name;
  $("citySub").textContent = `${city.state} · ${REGION_NOTE[city.id] ? REGION_NOTE[city.id].split(" · ")[1] || REGION_NOTE[city.id] : ""}`;
  $("asOf").textContent = `As of ${istHM(current.time || new Date().toISOString())} IST`;

  $("tempNum").textContent = current.temp_c != null ? Math.round(current.temp_c) : "—";
  $("condText").textContent = humanSymbol(current.symbol);
  $("oneliner").textContent = oneLiner(current, hourly || []);

  // Mood badge (short label at the top of the sky)
  const badge = $("moodBadge");
  const moodLabel = moodWord(mood);
  if (moodLabel) {
    badge.textContent = moodLabel;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  // Stats
  $("feels").textContent = current.temp_c != null ? `${Math.round(current.temp_c)}°` : "—";
  $("rain").textContent  = formatNextHourRain(hourly);
  $("wind").textContent  = current.wind_kmh != null ? `${fmtNum(current.wind_kmh, 0)} km/h` : "—";
  $("hum").textContent   = current.humidity != null ? `${fmtNum(current.humidity, 0)}%` : "—";

  // Hourly: 12 hours, every one hour. Backend gives us hourly already.
  const h = (hourly || []).slice(0, 12);
  $("hourlyRange").textContent = `${h.length} hours ahead`;
  const cells = $("hours");
  cells.innerHTML = h.map((row, i) =>
    `<div class="cell">
       <div class="t">${i === 0 ? "NOW" : istHour(row.time)}</div>
       <svg class="mini" viewBox="0 0 28 32" aria-hidden="true">${miniIcon(iconForSymbol(row.symbol, isHourNight(row.time, sun)))}</svg>
       <div class="deg">${row.temp_c != null ? Math.round(row.temp_c) : "—"}°</div>
     </div>`
  ).join("");
  drawTempChart(h);

  // Sun
  $("sunrise").textContent = istHM(sun?.sunrise);
  $("sunset").textContent  = istHM(sun?.sunset);
  drawSunArc(sun, current.time);

  // IMD credit shows only if IMD actually returned something.
  $("imdCredit").hidden = !(imd && (imd.now || imd.warnings));
}

function isHourNight(iso, sun) {
  const n = minutesSinceMidnightIST(iso);
  const sr = minutesSinceMidnightIST(sun?.sunrise);
  const ss = minutesSinceMidnightIST(sun?.sunset);
  if (n == null || sr == null || ss == null) return false;
  return n < sr || n > ss;
}

function moodWord(m) {
  switch (m) {
    case "clear-day":   return "Clear skies";
    case "clear-dawn":  return "Dawn light";
    case "clear-dusk":  return "Golden hour";
    case "clear-night": return "Clear night";
    case "cloudy-day":  return "Overcast";
    case "cloudy-night":return "Cloudy night";
    case "rain-day":    return "Rainy";
    case "rain-night":  return "Rainy night";
    case "thunder":     return "Thunderstorm";
    case "haze":        return "Hazy";
    default:            return "";
  }
}

function humanSymbol(k) {
  return {
    sunny:   "Clear and bright",
    partly:  "Partly cloudy",
    cloudy:  "Overcast",
    rain:    "Rain",
    thunder: "Thundershowers",
    haze:    "Hazy"
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
  markSelected(id);
  showError(null);
  const card = $("weatherCard");
  card.hidden = false;
  card.setAttribute("aria-busy", "true");
  $("emptyCard").hidden = true;

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
    card.setAttribute("aria-busy", "false");
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
    showError("Can't reach the server. Is the backend running on this host?");
  }
}

function showError(msg) {
  const bar = $("errorBar");
  if (!msg) { bar.hidden = true; return; }
  bar.textContent = msg;
  bar.hidden = false;
}

// ---------- Theme toggle (per viewer) ----------
try {
  const saved = localStorage.getItem("mausam-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
} catch (e) {}
$("themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
  if (next) document.documentElement.setAttribute("data-theme", next);
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("mausam-theme", next); } catch (e) {}
});

// ---------- Boot ----------
loadCities();
