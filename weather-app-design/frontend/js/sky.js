// The sky behind the current temperature: drifting clouds, falling rain or
// snow, and the odd flash of lightning. Colours and the sun, moon, stars
// and fog are CSS, driven by data-sky and data-night on the hero.

import { $, reduceMotion, svgEl } from "./dom.js";

const CLOUDS = {
  clear:   { count: 1, opacity: 0.5,  heavy: false },
  partly:  { count: 3, opacity: 0.85, heavy: false },
  cloudy:  { count: 5, opacity: 0.9,  heavy: true },
  fog:     { count: 2, opacity: 0.4,  heavy: false },
  rain:    { count: 5, opacity: 0.85, heavy: true },
  snow:    { count: 4, opacity: 0.8,  heavy: true },
  thunder: { count: 5, opacity: 0.9,  heavy: true },
};
const FALLING = { rain: 110, thunder: 140, snow: 70 }; // particles on screen

const hero = $("hero");
const cloudLayer = $("skyClouds");
const canvas = $("skyFall");
const ctx = canvas.getContext("2d");

let current = "";
let particles = [];
let snowing = false;
let frameId = 0;
let flashTimer = 0;

/** Show the sky for a condition. Does nothing if it's already showing. */
export function setSky(condition, night) {
  const sky = CLOUDS[condition] ? condition : "cloudy";
  const key = `${sky}|${night}`;
  if (key === current) return;
  current = key;

  hero.dataset.sky = sky;
  hero.dataset.night = String(night);
  drawClouds(CLOUDS[sky], night);

  stopFalling();
  if (FALLING[sky]) startFalling(FALLING[sky], sky === "snow");

  clearTimeout(flashTimer);
  if (sky === "thunder" && !reduceMotion) scheduleFlash();
}

function drawClouds({ count, opacity, heavy }, night) {
  const width = cloudLayer.clientWidth || 800;
  const clouds = Array.from({ length: count }, (_, i) => {
    const size = 160 + Math.random() * 180;
    const seconds = 70 + Math.random() * 70;
    const svg = svgEl("svg", { class: "cloud", viewBox: "0 0 240 110" });
    svg.append(svgEl("use", { href: "#cloud-shape" }));
    Object.assign(svg.style, {
      width: `${size}px`,
      top: `${-20 + Math.random() * 120 + i * 8}px`,
      opacity: opacity * (0.6 + Math.random() * 0.4) * (night ? 0.6 : 1),
      fill: heavy ? (night ? "#4a5468" : "#c3ccd7") : "#fff",
      animationDuration: `${seconds}s`,
      animationDelay: `${-Math.random() * seconds}s`, // start mid-drift, not off-screen
    });
    svg.style.setProperty("--from", `${-size - 40}px`);
    svg.style.setProperty("--to", `${width + 40}px`);
    return svg;
  });
  cloudLayer.replaceChildren(...clouds);
}

// ---------- Rain and snow ----------

function startFalling(count, snow) {
  snowing = snow;
  fitCanvas();
  const box = canvas.getBoundingClientRect();
  particles = Array.from({ length: count }, () => newParticle(box, true));
  drawFrame();
  if (!reduceMotion) frameId = requestAnimationFrame(animate);
}

function stopFalling() {
  cancelAnimationFrame(frameId);
  frameId = 0;
  particles = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function fitCanvas() {
  const box = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function newParticle(box, anywhere) {
  const depth = Math.random(); // nearer ones are bigger, faster and brighter
  return {
    x: Math.random() * (box.width + 80),
    y: anywhere ? Math.random() * box.height : -20 - Math.random() * 60,
    size: snowing ? 1.2 + depth * 2 : 10 + depth * 16,
    speed: snowing ? 0.6 + depth * 1.2 : 9 + depth * 9,
    alpha: snowing ? 0.5 + depth * 0.45 : 0.18 + depth * 0.4,
    width: 0.8 + depth * 0.9,
    sway: Math.random() * Math.PI * 2,
  };
}

function drawFrame() {
  const box = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.lineCap = "round";
  for (const p of particles) {
    if (snowing) {
      ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      p.sway += 0.02;
      p.x += Math.sin(p.sway) * 0.4;
      p.y += p.speed;
    } else {
      ctx.strokeStyle = `rgba(220,235,255,${p.alpha})`;
      ctx.lineWidth = p.width;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.size * 0.22, p.y + p.size);
      ctx.stroke();
      p.y += p.speed;
      p.x -= p.speed * 0.22;
    }
    if (p.y > box.height + 20) Object.assign(p, newParticle(box, false));
  }
}

function animate() {
  drawFrame();
  frameId = requestAnimationFrame(animate);
}

function scheduleFlash() {
  flashTimer = setTimeout(() => {
    const flash = $("skyFlash");
    flash.classList.remove("on");
    void flash.offsetWidth; // restart the CSS animation
    flash.classList.add("on");
    scheduleFlash();
  }, 3500 + Math.random() * 6000);
}

window.addEventListener("resize", () => {
  if (particles.length) { fitCanvas(); drawFrame(); }
});

// Don't burn battery animating a tab nobody is looking at.
document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(frameId);
  frameId = 0;
  if (!document.hidden && particles.length && !reduceMotion) frameId = requestAnimationFrame(animate);
});
