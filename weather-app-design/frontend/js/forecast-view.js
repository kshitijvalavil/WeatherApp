// Draws one place's forecast: the hero, the hourly strip, the days ahead
// and the "right now" facts.

import { $, el, icon, svgEl } from "./dom.js";
import {
  compassName, conditionLabel, dayKey, degrees, iconName, isWet, longDate, mugginess,
  tempColor, time, uvWord, weekday, whole, windWord,
} from "./format.js";
import { setSky } from "./sky.js";

let shown = null; // the forecast on screen

export function render(data) {
  shown = data;
  $("hero").classList.remove("loading");
  renderHero(data);
  renderHourly(data.hourly);
  renderDaily(data.daily);
  renderFacts(data);
}

/** Called every half minute: the clock moves on and day turns to night. */
export function tick() {
  if (shown) renderHero(shown);
}

export function showLoading() {
  $("hero").classList.add("loading");
}

export function showError(place) {
  shown = null;
  $("hero").classList.remove("loading");
  $("heroPlace").textContent = place.name;
  $("heroMeta").textContent = place.state || "";
  $("heroTemp").textContent = "--";
  $("heroCond").textContent = "Forecast unavailable";
  $("heroFeels").textContent = "";
  $("heroRange").textContent = "";
  $("heroOutlook").textContent = "The forecast for this place didn't load. Pick it again in a minute to retry.";
  $("hourly").replaceChildren();
  $("daily").replaceChildren();
  $("facts").replaceChildren();
}

// ---------- Hero ----------

function renderHero(data) {
  const { place, current, daily } = data;
  const now = new Date();
  const night = isNightNow(data, now);

  $("heroPlace").textContent = place.name;
  $("heroMeta").replaceChildren(
    place.state ? el("span", { text: place.state }) : null,
    el("span", { text: `${longDate(now)}, ${time(now)}` }),
  );
  $("heroTemp").textContent = degrees(current.temp_c);
  $("heroCond").textContent = night && current.condition === "clear" ? "Clear night" : conditionLabel(current.condition);
  $("heroFeels").textContent = current.feels_c == null ? "" : `Feels like ${degrees(current.feels_c)}`;
  const today = daily[0];
  $("heroRange").textContent = today ? `High ${degrees(today.hi_c)}, low ${degrees(today.lo_c)}` : "";
  $("heroOutlook").textContent = outlook(data);

  setSky(current.condition, night);
}

/** Sun times are the best guide; the forecast's own day/night flag is the fallback. */
function isNightNow({ sun, current }, now) {
  if (!sun.sunrise || !sun.sunset) return current.night;
  return now < new Date(sun.sunrise) || now > new Date(sun.sunset);
}

/** One sentence on what the next hours hold: when rain starts or stops, or how the temperature moves. */
function outlook({ current, hourly }) {
  if (!hourly.length) return "";
  const wet = (h) => (h.rain_mm || 0) >= 0.1 || isWet(h.condition);
  const name = (h) => (h.condition === "thunder" ? "Thunderstorms" : h.condition === "snow" ? "Snow" : "Rain");

  if (wet(hourly[0])) {
    const dry = hourly.find((h) => !wet(h));
    return dry
      ? `${name(hourly[0])} should ease around ${time(dry.time)}.`
      : `No break in the ${name(hourly[0]).toLowerCase()} for the next 24 hours.`;
  }
  const next = hourly.find(wet);
  if (next) return `${name(next)} likely from around ${time(next.time)}.`;

  const later = hourly[Math.min(6, hourly.length - 1)];
  if (current.temp_c == null || later.temp_c == null) return `${conditionLabel(current.condition)}.`;
  const change = whole(later.temp_c - current.temp_c);
  const trend =
    change <= -2 ? `cooling to ${degrees(later.temp_c)} by ${time(later.time)}`
    : change >= 2 ? `warming to ${degrees(later.temp_c)} by ${time(later.time)}`
    : `staying near ${degrees(current.temp_c)} until ${time(later.time)}`;
  return `${conditionLabel(current.condition)}, ${trend}.`;
}

// ---------- Next 24 hours ----------

const COLUMN = 64;        // px per hour
const PLOT_HEIGHT = 64;   // px; temperatures sit on a line drawn across this band
const PLOT_TOP = 26;      // room above the highest point for its label
const PLOT_BOTTOM = 58;

function renderHourly(hours) {
  const host = $("hourly");
  host.style.gridTemplateColumns = `repeat(${hours.length}, ${COLUMN}px)`;
  if (!hours.length) { host.replaceChildren(); return; }

  const temps = hours.map((h) => h.temp_c).filter((t) => t != null);
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const y = (t) => PLOT_BOTTOM - ((t - lo) / Math.max(1, hi - lo)) * (PLOT_BOTTOM - PLOT_TOP);

  const columns = hours.map((h, i) => {
    const chance = h.rain_prob == null ? null : Math.round(h.rain_prob / 5) * 5;
    const showRain = chance != null ? chance >= 20 : (h.rain_mm || 0) >= 0.1;
    return el("div", { class: "hour", style: { gridColumn: i + 1 } },
      el("span", { class: i === 0 ? "hour-time now" : "hour-time", text: i === 0 ? "Now" : time(h.time) }),
      icon(iconName(h.condition, h.night), "hour-icon"),
      el("div", { class: "hour-plot" },
        h.temp_c == null ? null : el("span", { class: "hour-temp", text: degrees(h.temp_c), style: { top: `${y(h.temp_c) - 25}px` } })),
      el("div", { class: "hour-rain" },
        showRain && chance != null ? el("i", { style: { height: `${Math.max(2, (chance / 100) * 14)}px` } }) : null,
        showRain ? el("span", { text: chance != null ? `${chance}%` : `${h.rain_mm.toFixed(1)} mm` }) : null),
    );
  });

  host.replaceChildren(...columns, temperatureLine(hours, y));
}

function temperatureLine(hours, y) {
  const svg = svgEl("svg", { class: "hour-line", width: hours.length * COLUMN, height: PLOT_HEIGHT, "aria-hidden": "true" });
  const points = hours
    .map((h, i) => (h.temp_c == null ? null : [i * COLUMN + COLUMN / 2, y(h.temp_c)]))
    .filter(Boolean);
  svg.append(svgEl("polyline", { points: points.map((p) => p.join(",")).join(" ") }));
  points.forEach(([cx, cy]) => svg.append(svgEl("circle", { cx, cy, r: 3 })));
  return svg;
}

// ---------- Days ahead ----------

function renderDaily(days) {
  $("dailyTitle").textContent = days.length > 1 ? `Next ${days.length} days` : "Days ahead";
  if (!days.length) { $("daily").replaceChildren(); return; }

  const lo = Math.min(...days.map((d) => d.lo_c));
  const hi = Math.max(...days.map((d) => d.hi_c));
  const span = Math.max(1, hi - lo);

  $("daily").replaceChildren(...days.map((d, i) =>
    el("li", {},
      el("span", { class: "day-name", text: i === 0 ? "Today" : weekday(d.date) }),
      icon(iconName(d.condition), "day-icon"),
      el("span", { class: "day-rain", text: d.rain_mm >= 1 ? `${whole(d.rain_mm)} mm` : "" }),
      el("span", { class: "day-lo", text: degrees(d.lo_c) }),
      // Every bar shares one scale, so a day's position shows how it compares with the rest.
      el("span", { class: "day-bar", "aria-hidden": "true" },
        el("i", { style: {
          left: `${((d.lo_c - lo) / span) * 100}%`,
          width: `${Math.max(4, ((d.hi_c - d.lo_c) / span) * 100)}%`,
          background: `linear-gradient(90deg, ${tempColor(d.lo_c)}, ${tempColor(d.hi_c)})`,
        } })),
      el("span", { class: "day-hi", text: degrees(d.hi_c) }),
    )));
}

// ---------- Right now ----------

function renderFacts(data) {
  const facts = [feelsFact(data.current), rainFact(data.hourly), windFact(data.current),
    humidityFact(data.current), uvFact(data), daylightFact(data.sun)];

  $("facts").replaceChildren(...facts.map((f) =>
    el("div", { class: "fact" },
      el("dt", { text: f.label }),
      el("dd", { class: "fact-value" }, f.value, f.unit ? el("small", { text: f.unit }) : null, f.extra),
      el("dd", { class: "fact-note", text: f.note }),
    )));
}

function feelsFact({ feels_c, temp_c }) {
  const fact = { label: "Feels like", value: degrees(feels_c), note: "" };
  if (feels_c == null || temp_c == null) return fact;
  const gap = whole(feels_c) - whole(temp_c);
  fact.note =
    gap >= 2 ? `Warmer than the actual ${degrees(temp_c)}, because of the humidity.`
    : gap <= -2 ? `Cooler than the actual ${degrees(temp_c)}, because of dry air or wind.`
    : "About the same as the actual temperature.";
  return fact;
}

function rainFact(hours) {
  const snow = hours.some((h) => h.condition === "snow");
  const fact = { label: `${snow ? "Snow" : "Rain"}, next 24 hours`, value: "None", note: "Nothing expected." };
  if (!hours.length) return { ...fact, value: "--", note: "" };

  const total = hours.reduce((sum, h) => sum + (h.rain_mm || 0), 0);
  const likeliest = hours.reduce((a, b) => ((b.rain_prob || 0) > (a.rain_prob || 0) ? b : a));
  const chance = likeliest.rain_prob == null ? null : Math.round(likeliest.rain_prob / 5) * 5;

  if (total >= 0.1) {
    fact.value = total < 10 ? total.toFixed(1) : String(whole(total));
    fact.unit = "mm";
    const heaviest = hours.reduce((a, b) => ((b.rain_mm || 0) > (a.rain_mm || 0) ? b : a));
    fact.note = heaviest === hours[0] ? "Heaviest over the next hour." : `Heaviest around ${time(heaviest.time)}.`;
  } else if (chance >= 20) {
    fact.note = `A ${chance}% chance around ${time(likeliest.time)}, but little would fall.`;
  }
  return fact;
}

function windFact({ wind_kmh, wind_dir }) {
  if (wind_kmh == null) return { label: "Wind", value: "--", note: "" };
  const fact = { label: "Wind", value: String(whole(wind_kmh)), unit: "km/h", note: `${windWord(wind_kmh)}.` };
  if (wind_dir != null && wind_kmh >= 2) {
    fact.note = `${windWord(wind_kmh)} from the ${compassName(wind_dir)}.`;
    // The arrow points the way the air is moving, so opposite to where it comes from.
    fact.extra = icon("arrow", "wind-arrow");
    fact.extra.style.transform = `rotate(${(wind_dir + 180) % 360}deg)`;
  }
  return fact;
}

function humidityFact({ humidity, dew_point_c }) {
  if (humidity == null) return { label: "Humidity", value: "--", note: "" };
  return {
    label: "Humidity",
    value: String(whole(humidity)),
    unit: "%",
    note: dew_point_c == null ? "" : `Dew point ${degrees(dew_point_c)}, which feels ${mugginess(dew_point_c)}.`,
  };
}

// The UV index is 0 whenever the sun is down, which says nothing useful at
// 1 AM. After dark the fact shows the coming day's peak instead.
function uvFact({ current, uv_peak }) {
  if (current.uv == null) return { label: "UV index", value: "--", note: "No UV reading for this place." };
  const now = whole(current.uv);
  const peak = uv_peak && { value: whole(uv_peak.value), at: uv_peak.time };

  if (now < 1 && peak && peak.value >= 1) {
    const day = dayKey(peak.at) === dayKey(Date.now()) ? "today" : "tomorrow";
    return {
      label: `UV index, ${day}'s peak`,
      value: String(peak.value),
      unit: uvWord(peak.value),
      note: `Around ${time(peak.at)}. It is 0 now, while the sun is down.`,
    };
  }
  const advice =
    now <= 2 ? "No protection needed."
    : now <= 5 ? "Sunscreen helps if you're out for long."
    : now <= 7 ? "Cover up and wear sunscreen."
    : "Stay out of the midday sun if you can.";
  return {
    label: "UV index",
    value: String(now),
    unit: uvWord(now),
    note: peak && peak.value > now ? `Rising to ${peak.value} around ${time(peak.at)}.` : advice,
  };
}

function daylightFact({ sunrise, sunset }) {
  if (!sunrise || !sunset) return { label: "Daylight", value: "--", note: "" };
  const minutes = Math.round((new Date(sunset) - new Date(sunrise)) / 60000);
  return {
    label: "Daylight",
    value: String(Math.floor(minutes / 60)),
    unit: `h ${minutes % 60} min`,
    note: `Sunrise ${time(sunrise)}, sunset ${time(sunset)}.`,
  };
}
