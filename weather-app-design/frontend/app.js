// Mausam frontend.
// Fetches the backend at /api/* and renders a glanceable weather card.
// The design borrows Apple Weather's "sky is the chrome," Yr's labelled
// icons and meteogram, CARROT's italic commentary voice, and Dark Sky's
// concrete sentence that answers "when does it change?"

// ---------- Dot positions on the simplified India SVG ----------
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
  delhi:     "Dry northern winter",
  mumbai:    "Coastal, humid",
  kolkata:   "Gangetic delta",
  chennai:   "Tropical east coast",
  bengaluru: "Mild Deccan plateau",
  hyderabad: "Semi-arid Deccan",
  jaipur:    "Arid, Thar edge",
  ahmedabad: "Hot western plains",
  pune:      "Rain-shadow mild",
  lucknow:   "Subtropical Awadh"
};

// ---------- Hand-drawn ink style icons ----------
// Rays with slightly uneven stroke widths read as drawn, not CAD.
function rays(cx, cy, inner, outer) {
  let out = "";
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const x1 = cx + Math.cos(a) * inner;
    const y1 = cy + Math.sin(a) * inner;
    const x2 = cx + Math.cos(a) * outer;
    const y2 = cy + Math.sin(a) * outer;
    const w = 3.4 + (i % 2 ? .2 : -.2);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" opacity=".9" style="color:var(--sun)"/>`;
  }
  return out;
}
function cloudPath(cx, cy, s = 1) {
  const r = 16 * s;
  return `
    <g fill="var(--cloud)" stroke="rgba(0,0,0,.2)" stroke-width="1.2" stroke-linejoin="round" opacity=".98">
      <circle cx="${cx - 14 * s}" cy="${cy}" r="${r * 0.9}"/>
      <circle cx="${cx + 14 * s}" cy="${cy - 2 * s}" r="${r * 1}"/>
      <circle cx="${cx}" cy="${cy - 10 * s}" r="${r * 1.1}"/>
      <rect x="${cx - 24 * s}" y="${cy}" width="${48 * s}" height="${r}" rx="${r * 0.6}"/>
    </g>`;
}
const ICONS = {
  sunny: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Clear sky">
      <g class="anim-rays">${rays(60, 60, 24, 36)}</g>
      <circle class="anim-sun-core" cx="60" cy="60" r="22" fill="var(--sun)" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    </svg>`,
  night: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Clear night">
      <path d="M82 32a30 30 0 1 0 24 46 26 26 0 0 1-24-46z" fill="var(--sun)" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
      <circle cx="36" cy="34" r="1.6" fill="currentColor" opacity=".7"/>
      <circle cx="26" cy="58" r="1.1" fill="currentColor" opacity=".55"/>
      <circle cx="52" cy="92" r="1.6" fill="currentColor" opacity=".7"/>
      <circle cx="18" cy="90" r="1" fill="currentColor" opacity=".55"/>
    </svg>`,
  partly: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Partly cloudy">
      <g class="anim-rays" style="transform-origin:42px 50px;">${rays(42, 50, 16, 28)}</g>
      <circle class="anim-sun-core" cx="42" cy="50" r="16" fill="var(--sun)" stroke="rgba(0,0,0,.18)" stroke-width="1" style="transform-origin:42px 50px;"/>
      <g class="cloud-drift">${cloudPath(78, 70)}</g>
    </svg>`,
  cloudy: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Overcast">
      <g class="cloud-drift" style="opacity:.72;">${cloudPath(44, 52, 0.9)}</g>
      <g class="cloud-drift" style="animation-delay:-2s;">${cloudPath(68, 68)}</g>
    </svg>`,
  rain: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Rain">
      <g class="cloud-drift">${cloudPath(60, 48)}</g>
      <line class="drop"    x1="44" y1="76" x2="40" y2="92" stroke="var(--rain)" stroke-width="3.2" stroke-linecap="round"/>
      <line class="drop d2" x1="58" y1="76" x2="54" y2="92" stroke="var(--rain)" stroke-width="3.2" stroke-linecap="round"/>
      <line class="drop d3" x1="72" y1="76" x2="68" y2="92" stroke="var(--rain)" stroke-width="3.2" stroke-linecap="round"/>
      <line class="drop d4" x1="86" y1="76" x2="82" y2="92" stroke="var(--rain)" stroke-width="3.2" stroke-linecap="round"/>
    </svg>`,
  thunder: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Thunderstorm">
      <g class="cloud-drift">${cloudPath(60, 44)}</g>
      <polygon class="bolt-flash" points="58,66 70,66 60,84 72,84 50,110 58,86 48,86"
               fill="var(--bolt)" stroke="rgba(0,0,0,.2)" stroke-width="1.2" stroke-linejoin="round"/>
      <line class="drop d2" x1="42" y1="74" x2="38" y2="88" stroke="var(--rain)" stroke-width="2.6" stroke-linecap="round"/>
      <line class="drop d3" x1="86" y1="74" x2="82" y2="88" stroke="var(--rain)" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`,
  haze: () => `
    <svg viewBox="0 0 120 120" role="img" aria-label="Hazy">
      <circle class="anim-sun-core" cx="60" cy="46" r="20" fill="var(--sun)" opacity=".92" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
      <g class="haze-waves" stroke="var(--cloud)" stroke-width="4.2" stroke-linecap="round">
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

// Short text label under each hourly icon (Yr-style — never leaves an
// icon ambiguous).
function labelFor(kind) {
  return {
    sunny:   "Clear",
    night:   "Clear",
    partly:  "Mixed",
    cloudy:  "Cloud",
    rain:    "Rain",
    thunder: "Storm",
    haze:    "Haze"
  }[kind] || "";
}

// ---------- Time + math helpers ----------
const IST_HM = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false };
const IST_HOUR_LABEL = { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true };

function istHM(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-GB", IST_HM).format(new Date(iso)); } catch (e) { return "—"; }
}
function istHour(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", IST_HOUR_LABEL).format(new Date(iso))
      .replace(" ", "").toUpperCase();
  } catch (e) { return ""; }
}
function minsIST(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function roundTemp(c) { return c == null ? "—" : Math.round(c); }

// ---------- Dark-Sky-style concrete sentence ----------
// Scans the hourly forecast and names the next change by its time, not
// its mood. Always says one specific thing.
function concreteSentence(current, hourly, sun) {
  const h = hourly || [];
  const now = current.symbol;
  const isNight = (() => {
    const n = minsIST(current.time), sr = minsIST(sun?.sunrise), ss = minsIST(sun?.sunset);
    if (n == null || sr == null || ss == null) return false;
    return n < sr || n > ss;
  })();

  // Index of first rainy hour (>= 0.4 mm) in the next 12 hours.
  let firstRain = h.findIndex(x => (x.rain_mm || 0) >= 0.4);
  let firstThunder = h.findIndex(x => x.symbol === "thunder");
  // Length of the next rainy run.
  function run(from, pred) {
    let n = 0;
    for (let i = from; i < h.length; i++) { if (pred(h[i])) n++; else break; }
    return n;
  }

  // Already raining
  if ((h[0] && (h[0].rain_mm || 0) >= 0.4) || now === "rain") {
    const len = run(0, x => (x.rain_mm || 0) >= 0.2 || x.symbol === "rain");
    const nextClear = h.slice(len).findIndex(x => (x.rain_mm || 0) < 0.2 && x.symbol !== "rain" && x.symbol !== "thunder");
    if (nextClear >= 0) {
      const atHour = istHour(h[len + nextClear].time);
      return `Raining now, easing around ${atHour}.`;
    }
    return `Raining through the rest of the day.`;
  }

  // Thunder in the next few hours
  if (firstThunder >= 0 && firstThunder <= 3) {
    const atHour = istHour(h[firstThunder].time);
    return `Thunder expected around ${atHour}. Finish outdoor errands first.`;
  }

  // Rain starting later
  if (firstRain > 0) {
    const atHour = istHour(h[firstRain].time);
    const len = run(firstRain, x => (x.rain_mm || 0) >= 0.2 || x.symbol === "rain");
    const endsAt = firstRain + len < h.length ? istHour(h[firstRain + len].time) : null;
    if (endsAt) return `Rain starting around ${atHour}, lasting until about ${endsAt}.`;
    return `Rain starting around ${atHour}, continuing into the evening.`;
  }

  // Haze
  if (now === "haze") return `Hazy air today — easier on the eyes after sunset at ${istHM(sun?.sunset)}.`;

  // Overcast
  if (now === "cloudy") return `Overcast and still, no rain in the next ${Math.min(h.length, 12)} hours.`;

  // Partly cloudy
  if (now === "partly") return `Mixed sun and clouds, dry through sunset at ${istHM(sun?.sunset)}.`;

  // Clear — point to the next moment that matters
  if (isNight) return `Clear night, sunrise at ${istHM(sun?.sunrise)}.`;
  return `Clear through sunset at ${istHM(sun?.sunset)}.`;
}

// ---------- Sky mood ----------
// Twelve moods; the hero's gradient and ink are set via data-mood.
function skyMood(current, sun) {
  const sym = current.symbol;
  if (sym === "thunder") return "thunder";
  if (sym === "haze") return "haze";

  const n = minsIST(current.time || new Date().toISOString());
  const sr = minsIST(sun?.sunrise);
  const ss = minsIST(sun?.sunset);

  let band = "day"; // pre-dawn | dawn | morning | noon | golden | dusk | night
  if (sr != null && ss != null && n != null) {
    if (n < sr - 60) band = "pre-dawn";
    else if (n < sr + 20) band = "dawn";
    else if (n < sr + 180) band = "morning";
    else if (n < ss - 180) band = "noon";
    else if (n < ss - 20) band = "golden";
    else if (n < ss + 40) band = "dusk";
    else band = "night";
  }

  if (sym === "sunny") {
    if (band === "pre-dawn") return "night";
    if (band === "dawn") return "dawn";
    if (band === "morning") return "morning";
    if (band === "noon") return "noon";
    if (band === "golden") return "golden";
    if (band === "dusk") return "dusk";
    return "night";
  }
  if (sym === "partly") {
    if (band === "night" || band === "pre-dawn") return "overcast-night";
    if (band === "golden" || band === "dusk") return "golden";
    return "morning";
  }
  if (sym === "cloudy") {
    return (band === "night" || band === "pre-dawn") ? "overcast-night" : "overcast-day";
  }
  if (sym === "rain") {
    return (band === "night" || band === "pre-dawn") ? "rain-night" : "rain-day";
  }
  return "morning";
}

function iconForSymbol(sym, mood) {
  const isNight = mood === "night" || mood === "pre-dawn";
  if (sym === "sunny" && isNight) return "night";
  return sym;
}

function moodLabel(mood) {
  return {
    "pre-dawn":       "Before dawn",
    "dawn":           "Dawn",
    "morning":        "Morning sun",
    "noon":           "Midday",
    "golden":         "Golden hour",
    "dusk":           "Dusk",
    "night":          "Clear night",
    "overcast-day":   "Overcast",
    "overcast-night": "Cloudy night",
    "rain-day":       "Rain",
    "rain-night":     "Rain overnight",
    "thunder":        "Thunderstorm",
    "haze":           "Hazy"
  }[mood] || "";
}

// ---------- Meteogram ----------
// Yr-style combined chart: smooth temperature area/line + blue
// precipitation bars on the same x-axis.
function drawMeteogram(hourly) {
  const svg = document.getElementById("chart");
  if (!svg) return;
  const n = hourly.length;
  if (!n) { svg.innerHTML = ""; return; }

  const W = 600, H = 110, pad = 12, lineBand = 68;
  const step = (W - pad * 2) / (n - 1);

  const temps = hourly.map(h => h.temp_c);
  const min = Math.min(...temps.filter(v => v != null));
  const max = Math.max(...temps.filter(v => v != null));
  const range = Math.max(1, max - min);

  const points = hourly.map((row, i) => {
    const x = pad + step * i;
    const y = row.temp_c == null ? null : pad + (lineBand - pad * 2) * (1 - (row.temp_c - min) / range);
    return { x, y };
  });
  const area = points.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(" ")
    + ` L ${pad + step * (n - 1)} ${lineBand} L ${pad} ${lineBand} Z`;
  const line = points.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(" ");

  // Precip bars below the line band.
  const barTop = lineBand + 6, barBot = H - 6, barW = Math.max(6, step * 0.6);
  const maxRain = Math.max(1, ...hourly.map(h => h.rain_mm || 0));
  const bars = hourly.map((row, i) => {
    const mm = row.rain_mm || 0;
    if (mm < 0.1) return "";
    const h = ((barBot - barTop) * (mm / maxRain));
    return `<rect x="${pad + step * i - barW / 2}" y="${barBot - h}" width="${barW}" height="${h}" rx="2" fill="var(--rain)" opacity=".8"/>`;
  }).join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity=".30"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#tempFill)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map(p => p.y != null
      ? `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.5"/>`
      : "").join("")}
    ${bars}
    <line class="now-marker" x1="${points[0].x}" x2="${points[0].x}" y1="0" y2="${H}"/>
  `;
}

// ---------- Live sun arc ----------
// Moves in real time: a tick per minute keeps the sun honest without
// burning CPU. On reduced motion it just paints the current position.
let sunTimer = null;
function drawSunArc(sun) {
  const svg = document.getElementById("sunTrack");
  if (!svg) return;
  if (sunTimer) { clearInterval(sunTimer); sunTimer = null; }

  const sr = minsIST(sun?.sunrise), ss = minsIST(sun?.sunset);
  const W = 400, H = 60, pad = 10;
  const cx = W / 2, cy = H, rx = (W - pad * 2) / 2, ry = H - pad;

  function paint() {
    const now = minsIST(new Date().toISOString());
    let t = 0.5;
    if (sr != null && ss != null && now != null && ss > sr) {
      t = Math.min(1, Math.max(0, (now - sr) / (ss - sr)));
    }
    const angle = Math.PI * (1 - t);
    const px = cx + rx * Math.cos(Math.PI - angle);
    const py = cy - ry * Math.sin(Math.PI - angle);

    svg.innerHTML = `
      <path d="M ${pad} ${H} A ${rx} ${ry} 0 0 1 ${W - pad} ${H}"
            fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 4"/>
      <circle cx="${pad}" cy="${H}" r="3" fill="var(--muted)"/>
      <circle cx="${W - pad}" cy="${H}" r="3" fill="var(--muted)"/>
      <circle cx="${px}" cy="${py}" r="7" fill="var(--sun)" stroke="var(--accent)" stroke-width="1.5"/>
    `;
  }
  paint();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) sunTimer = setInterval(paint, 60 * 1000);

  const label = document.getElementById("dayLen");
  if (label && sr != null && ss != null && ss > sr) {
    const mins = ss - sr, h = Math.floor(mins / 60), m = mins % 60;
    label.textContent = `${h}h ${m.toString().padStart(2, "0")}m of daylight`;
  } else if (label) {
    label.textContent = "";
  }
}

// ---------- Thunder flash on the sky itself ----------
let flashTimer = null;
function startThunderFlash() {
  stopThunderFlash();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;
  const sky = document.getElementById("sky");
  if (!sky) return;
  function tick() {
    sky.classList.remove("flash");
    void sky.offsetWidth;
    sky.classList.add("flash");
  }
  tick();
  flashTimer = setInterval(tick, 7000);
}
function stopThunderFlash() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  const sky = document.getElementById("sky");
  if (sky) sky.classList.remove("flash");
}

// ---------- Render ----------
const $ = id => document.getElementById(id);
let currentCityId = null;

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

  // Mood sets the gradient and the ink colour; icon picks a moon on
  // clear nights.
  const mood = skyMood(current, sun);
  card.setAttribute("data-mood", mood);
  const iconKey = iconForSymbol(current.symbol || "cloudy", mood);
  $("iconBox").innerHTML = (ICONS[iconKey] || ICONS.cloudy)();

  if (mood === "thunder") startThunderFlash(); else stopThunderFlash();

  // Hero. The temperature briefly fades to signal the city change.
  const tempEl = $("tempNum");
  tempEl.classList.add("swap");
  setTimeout(() => {
    tempEl.textContent = roundTemp(current.temp_c);
    tempEl.classList.remove("swap");
  }, 180);

  $("cityName").textContent = city.name;
  $("citySub").textContent = `${city.state} · ${REGION_NOTE[city.id] || ""}`;
  $("asOf").textContent = `As of ${istHM(current.time || new Date().toISOString())} IST`;
  $("condText").textContent = moodLabel(mood);
  $("commentary").textContent = concreteSentence(current, hourly || [], sun);

  // Chips. "Feels like" uses temp_c as a fallback since the backend
  // doesn't send a true feels-like yet.
  $("feels").textContent = current.temp_c != null ? `${roundTemp(current.temp_c)}°` : "—";
  $("rain").textContent  = formatNextHourRain(hourly);
  $("wind").textContent  = current.wind_kmh != null ? `${Math.round(current.wind_kmh)} km/h` : "—";
  $("hum").textContent   = current.humidity != null ? `${Math.round(current.humidity)}%` : "—";

  // Meteogram and cells.
  const h = (hourly || []).slice(0, 12);
  $("hourlyRange").textContent = `${h.length} hours ahead`;
  $("hours").innerHTML = h.map((row, i) => {
    const key = iconForSymbol(row.symbol, isHourNight(row.time, sun) ? "night" : "morning");
    return `
      <div class="cell">
        <div class="t">${i === 0 ? "NOW" : istHour(row.time)}</div>
        <svg class="mini" viewBox="0 0 28 32" aria-hidden="true">${miniIcon(key)}</svg>
        <div class="label">${labelFor(key)}</div>
        <div class="deg">${roundTemp(row.temp_c)}°</div>
      </div>`;
  }).join("");
  drawMeteogram(h);

  // Sun arc.
  $("sunrise").textContent = istHM(sun?.sunrise);
  $("sunset").textContent  = istHM(sun?.sunset);
  drawSunArc(sun);

  // IMD credit shows only when IMD actually returned something.
  $("imdCredit").hidden = !(imd && (imd.now || imd.warnings));
}

function isHourNight(iso, sun) {
  const n = minsIST(iso), sr = minsIST(sun?.sunrise), ss = minsIST(sun?.sunset);
  if (n == null || sr == null || ss == null) return false;
  return n < sr || n > ss;
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
  currentCityId = id;
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
