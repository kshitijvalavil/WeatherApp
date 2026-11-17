// What the page currently knows. Modules read this; main.js changes it.

export const state = {
  cities: [],            // the fixed list from /api/cities
  summary: new Map(),    // id -> { temp_c, condition, night } for list rows and map pins
  place: null,           // one extra spot outside the list: your location or a searched town
  selected: null,        // id of the place whose forecast is on screen
};

export function findPlace(id) {
  if (state.place && state.place.id === id) return state.place;
  return state.cities.find((c) => c.id === id) || null;
}
