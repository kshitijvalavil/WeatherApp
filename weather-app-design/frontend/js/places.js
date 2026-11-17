// The sidebar: the city list, the search box and "Use my location".

import { pointId, searchPlaces } from "./api.js";
import { $, el, icon, reduceMotion } from "./dom.js";
import { degrees, iconName } from "./format.js";
import { state } from "./state.js";

let actions; // { select(id), showPlace(place), preload(id) } from main.js

export function init(callbacks) {
  actions = callbacks;
  $("cityList").replaceChildren(...state.cities.map(cityRow));
  wireSearch();
  wireLocate();
}

function cityRow(place) {
  const row = el("button", { type: "button", class: "city", data: { id: place.id } },
    el("span", { class: "city-name" },
      el("b", {}, place.here ? icon("locate", "city-here") : null, place.name),
      el("small", { text: place.here ? "Your location" : place.state })),
    el("span", { class: "city-icon" }),
    el("span", { class: "city-temp", text: "--" }));
  row.addEventListener("click", () => actions.select(place.id));
  return row;
}

/** Bring every row up to date with the latest temperatures and selection. */
export function refresh() {
  for (const row of document.querySelectorAll(".city")) {
    const id = row.dataset.id;
    const active = id === state.selected;
    row.classList.toggle("active", active);
    if (active) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");

    const now = state.summary.get(id);
    row.querySelector(".city-temp").textContent = degrees(now?.temp_c);
    row.querySelector(".city-icon").replaceChildren(...(now?.condition ? [icon(iconName(now.condition, now.night))] : []));
  }
}

/** On narrow screens the list is a horizontal strip; keep the chosen city in view. */
export function revealSelected() {
  const row = document.querySelector(".city.active");
  if (row && window.matchMedia("(max-width: 900px)").matches) {
    row.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  }
}

/** The extra place gets its own row at the top of the list. */
export function renderPlaceRow() {
  document.querySelector(".city.extra")?.remove();
  if (!state.place) return;
  const row = cityRow(state.place);
  row.classList.add("extra");
  $("cityList").prepend(row);
  refresh();
}

// ---------- Search ----------

function wireSearch() {
  const input = $("searchInput");
  let timer = 0;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    filterCities(q);
    clearTimeout(timer);
    if (q.length >= 2) timer = setTimeout(() => findTowns(q), 300);
    else showTowns(null);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearSearch();
    if (e.key !== "Enter") return;
    // Enter opens the best match: a name that starts with what was typed
    // ("ben" is Bengaluru, not Kolkata in West Bengal), else the first one showing.
    const q = input.value.trim().toLowerCase();
    const showing = [...document.querySelectorAll(".city:not(.extra), .hit")].filter((node) => !node.hidden);
    const best = showing.find((node) => node.querySelector("b").textContent.toLowerCase().startsWith(q)) || showing[0];
    if (best) { best.click(); input.blur(); }
  });
}

function filterCities(q) {
  for (const row of document.querySelectorAll(".city:not(.extra)")) {
    row.hidden = Boolean(q) && !row.querySelector(".city-name").textContent.toLowerCase().includes(q);
  }
}

function clearSearch() {
  $("searchInput").value = "";
  filterCities("");
  showTowns(null);
}

// Towns beyond the city list, looked up through our server.
let latestSearch = 0;
async function findTowns(q) {
  const mine = ++latestSearch;
  let towns = [];
  try { towns = await searchPlaces(q); } catch { /* treated as no results */ }
  if (mine !== latestSearch) return; // a newer keystroke has taken over
  const listed = new Set(state.cities.map((c) => c.name.toLowerCase()));
  showTowns(towns.filter((t) => !listed.has(t.name.toLowerCase())), q);
}

function showTowns(towns, q) {
  const host = $("placeResults");
  const anyCityMatches = [...document.querySelectorAll(".city:not(.extra)")].some((row) => !row.hidden);
  if (!towns || (!towns.length && anyCityMatches)) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  if (!towns.length) {
    host.replaceChildren(el("p", { text: `Nothing found for "${q}". Check the spelling, or try a larger town nearby.` }));
    return;
  }
  host.replaceChildren(
    el("p", { class: "hits-head", text: "Other places" }),
    ...towns.map((town) => {
      const hit = el("button", { type: "button", class: "hit" },
        el("b", { text: town.name }),
        el("small", { text: town.state }));
      hit.addEventListener("click", () => {
        const place = { ...town, id: pointId(town.lat, town.lon) };
        actions.showPlace(place);
        clearSearch();
        actions.select(place.id);
      });
      return hit;
    }));
}

// ---------- Your location ----------

function wireLocate() {
  const button = $("locateBtn");
  if (!("geolocation" in navigator)) { button.hidden = true; return; }
  button.addEventListener("click", () => locate({ select: true }));
}

/**
 * On first load, show the visitor's own weather if they have already
 * allowed location for this site. We never trigger the permission prompt
 * ourselves; that only happens when they press the button.
 */
export async function locateIfAllowed() {
  if (!("geolocation" in navigator) || !navigator.permissions) return;
  try {
    const { state: permission } = await navigator.permissions.query({ name: "geolocation" });
    // Only take over the page if they haven't picked a city in the meantime.
    const startedOn = state.selected;
    if (permission === "granted") locate({ select: () => state.selected === startedOn });
  } catch { /* the browser can't tell us; wait for the button */ }
}

function locate({ select }) {
  const button = $("locateBtn"), message = $("locateMsg");
  const manual = select === true;
  button.disabled = true;
  $("locateText").textContent = "Finding you";
  message.hidden = true;
  const done = () => {
    button.disabled = false;
    $("locateText").textContent = "Use my location";
  };

  navigator.geolocation.getCurrentPosition((position) => {
    done();
    const { latitude, longitude } = position.coords;
    // Two decimals is about 1 km: enough for a forecast, vague enough to share.
    const place = { id: pointId(latitude, longitude), lat: +latitude.toFixed(2), lon: +longitude.toFixed(2), name: "Your location", state: "", here: true };
    actions.showPlace(place);
    if (manual || select()) actions.select(place.id);
    else actions.preload(place.id);
  }, (error) => {
    done();
    if (!manual) return;
    message.hidden = false;
    message.textContent = error.code === error.PERMISSION_DENIED
      ? "Location is blocked for this site. Allow it in your browser's site settings, or search for your town."
      : "Your location couldn't be found. Try again, or search for your town.";
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
}
