// Reads random affirmations from affirmations.json and speaks them continuously.

const DISPLAY = document.getElementById("affirmation");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

const FIRST_START_DELAY_MS = 600; // slight delay before first one
const BETWEEN_DELAY_MS = 700;     // slight delay between each

let affirmations = [];
let timerId = null;
let currentUtterance = null;

let running = false; // "loop is active"
let paused = false;  // user paused

function clearTimer() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function normalizeAffirmations(data) {
  // Supports either:
  // - ["a", "b", ...]
  // - { "affirmations": ["a", "b", ...] }
  if (Array.isArray(data)) return data.filter(Boolean);
  if (data && Array.isArray(data.affirmations)) return data.affirmations.filter(Boolean);
  return [];
}

function pickRandom() {
  const i = Math.floor(Math.random() * affirmations.length);
  return affirmations[i];
}

function speakOne(text) {
  // Cancel any queued speech (but don't nuke resume behavior while paused speaking)
  // We'll only cancel when starting a fresh utterance.
  window.speechSynthesis.cancel();

  currentUtterance = new SpeechSynthesisUtterance(text);

  currentUtterance.onend = () => {
    currentUtterance = null;
    if (!running || paused) return;

    clearTimer();
    timerId = setTimeout(() => {
      if (!running || paused) return;
      speakNext();
    }, BETWEEN_DELAY_MS);
  };

  currentUtterance.onerror = () => {
    currentUtterance = null;
    if (!running || paused) return;

    clearTimer();
    timerId = setTimeout(() => {
      if (!running || paused) return;
      speakNext();
    }, BETWEEN_DELAY_MS);
  };

  window.speechSynthesis.speak(currentUtterance);
}

function speakNext() {
  if (!affirmations.length) return;
  const text = pickRandom();
  DISPLAY.textContent = text;
  speakOne(text);
}

function startLoop() {
  if (!affirmations.length) return;

  running = true;
  paused = false;

  clearTimer();
  timerId = setTimeout(() => {
    if (!running || paused) return;
    speakNext();
  }, FIRST_START_DELAY_MS);
}

function pauseLoop() {
  paused = true;
  running = true; // still "active", just paused
  clearTimer();

  // Pause if currently speaking
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
  }
}

function playLoop() {
  // If speech is paused mid-utterance, resume it.
  if (window.speechSynthesis.paused) {
    paused = false;
    running = true;
    window.speechSynthesis.resume();
    return;
  }

  // If we're waiting between affirmations, restart the next one.
  paused = false;

  if (!running) {
    startLoop();
    return;
  }

  // If nothing is speaking (paused during delay or ended), continue.
  if (!window.speechSynthesis.speaking) {
    clearTimer();
    timerId = setTimeout(() => {
      if (!running || paused) return;
      speakNext();
    }, 200);
  }
}

async function init() {
  const res = await fetch("./affirmations.json", { cache: "no-store" });
  const data = await res.json();
  affirmations = normalizeAffirmations(data);

  if (!affirmations.length) {
    DISPLAY.textContent = "No affirmations found in affirmations.json";
    return;
  }

  // Autoplay (may be blocked in some browsers until the first user gesture)
  startLoop();
}

playBtn.addEventListener("click", playLoop);
pauseBtn.addEventListener("click", pauseLoop);

init().catch(() => {
  DISPLAY.textContent = "Failed to load affirmations.json";
});
