// Words, numbers and colours. Everything is shown in Indian Standard Time,
// whatever the visitor's own clock says.

const IST = "Asia/Kolkata";
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const weekdayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: IST });

export const time = (d) => timeFmt.format(new Date(d)).replace("am", "AM").replace("pm", "PM");
export const longDate = (d) => dateFmt.format(new Date(d));
export const dayKey = (d) => dayKeyFmt.format(new Date(d)); // "2026-11-17"
/** "Wed" for a "2026-11-18" date from the API. */
export const weekday = (isoDate) => weekdayFmt.format(new Date(`${isoDate}T12:00:00+05:30`));

/** A whole number, never "-0". */
export const whole = (x) => Math.round(x) || 0;
export const degrees = (x) => (x == null ? "--" : `${whole(x)}°`);

const LABELS = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};
export const conditionLabel = (condition) => LABELS[condition] || "Cloudy";

/** Which icon to draw. Only clear and partly-cloudy skies differ at night. */
export function iconName(condition, night = false) {
  const name = LABELS[condition] ? condition : "cloudy";
  return night && (name === "clear" || name === "partly") ? `${name}-night` : name;
}

export const isWet = (condition) => condition === "rain" || condition === "snow" || condition === "thunder";

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const compassName = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function windWord(kmh) {
  if (kmh < 6) return "Almost still";
  if (kmh < 20) return "Light breeze";
  if (kmh < 39) return "Breezy";
  if (kmh < 62) return "Strong wind";
  return "Gale";
}

// World Health Organization exposure categories.
export function uvWord(index) {
  if (index <= 2) return "Low";
  if (index <= 5) return "Moderate";
  if (index <= 7) return "High";
  if (index <= 10) return "Very high";
  return "Extreme";
}

export function mugginess(dewPoint) {
  if (dewPoint >= 24) return "oppressive";
  if (dewPoint >= 21) return "muggy";
  if (dewPoint >= 16) return "a little humid";
  if (dewPoint >= 10) return "comfortable";
  return "dry";
}

// One temperature scale for the map pins, the daily bars and the legend.
const TEMP_STOPS = [
  [0, [88, 86, 214]],
  [12, [36, 122, 226]],
  [20, [38, 166, 172]],
  [26, [86, 178, 82]],
  [31, [236, 190, 26]],
  [36, [240, 134, 22]],
  [42, [214, 62, 48]],
];
export const TEMP_RANGE = [TEMP_STOPS[0][0], TEMP_STOPS[TEMP_STOPS.length - 1][0]];

export function tempColor(t) {
  const last = TEMP_STOPS.length - 1;
  if (t <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1]})`;
  if (t >= TEMP_STOPS[last][0]) return `rgb(${TEMP_STOPS[last][1]})`;
  const i = TEMP_STOPS.findIndex(([stop]) => t <= stop);
  const [t0, c0] = TEMP_STOPS[i - 1], [t1, c1] = TEMP_STOPS[i];
  const k = (t - t0) / (t1 - t0);
  return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k))})`;
}

export const tempGradient = () =>
  `linear-gradient(90deg, ${TEMP_STOPS.map(([t, c]) => `rgb(${c}) ${((t - TEMP_RANGE[0]) / (TEMP_RANGE[1] - TEMP_RANGE[0])) * 100}%`).join(", ")})`;
