const DISPLAY = document.getElementById("affirmation");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

const FIRST_START_DELAY_MS = 600;
const BETWEEN_DELAY_MS = 700;

let affirmations = [];
let timerId = null;

let running = false;
let paused = false;

// Used to ignore stale onend/onerror from older utterances
let utteranceSeq = 0;

function clearTimer() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function normalizeAffirmations(data) {
  if (Array.isArray(data)) return data.map(String).map(s => s.trim()).filter(Boolean);
  if (data && Array.isArray(data.affirmations)) {
    return data.affirmations.map(String).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function pickRandom() {
  return affirmations[Math.floor(Math.random() * affirmations.length)];
}

function waitForVoices(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;

    const done = () => {
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      resolve();
    };

    const onVoicesChanged = () => done();

    // If voices are already available, proceed.
    if (synth.getVoices && synth.getVoices().length) return done();

    // Otherwise wait briefly for voices to load (some browsers load async).
    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    setTimeout(done, timeoutMs);
  });
}

async function speakText(text) {
  const synth = window.speechSynthesis;
  const mySeq = ++utteranceSeq;

  // If user paused/stopped while we were awaiting, bail out.
  if (!running || paused) return;

  await waitForVoices();

  if (!running || paused || mySeq !== utteranceSeq) return;

  // If something is unexpectedly queued/speaking, clear it once, then proceed.
  // (We do NOT cancel on every cycle — that’s what causes rapid “flipping” on some browsers.)
  if (synth.speaking || synth.pending) {
    synth.cancel();
    await new Promise((r) => setTimeout(r, 50));
    if (!running || paused || mySeq !== utteranceSeq) return;
  }

  const u = new SpeechSynthesisUtterance(text);

  let started = false;

  u.onstart = () => {
    if (mySeq !== utteranceSeq) return;
    started = true;
  };

  u.onend = () => {
    if (mySeq !== utteranceSeq) return;

    // Only advance if the utterance actually started (prevents instant end/cancel loops)
    if (!started) {
      running = false;
      paused = true;
      return;
    }

    if (!running || paused) return;

    clearTimer();
    timerId = setTimeout(() => {
      if (running && !paused) speakNext();
    }, BETWEEN_DELAY_MS);
  };

  u.onerror = () => {
    if (mySeq !== utteranceSeq) return;

    // If speech errors immediately (often autoplay blocked), stop looping until user hits Play.
    running = false;
    paused = true;
  };

  synth.speak(u);

  // If it never starts soon, treat it like “blocked” and stop the loop.
  setTimeout(() => {
    if (mySeq !== utteranceSeq) return;
    if (running && !paused && !started && !synth.speaking) {
      running = false;
      paused = true;
    }
  }, 1500);
}

function speakNext() {
  if (!affirmations.length) return;
  const text = pickRandom();
  DISPLAY.textContent = text;
  speakText(text);
}

function startLoop() {
  if (!affirmations.length) return;

  running = true;
  paused = false;

  clearTimer();
  timerId = setTimeout(() => {
    if (running && !paused) speakNext();
  }, FIRST_START_DELAY_MS);
}

function pauseLoop() {
  paused = true;
  clearTimer();

  const synth = window.speechSynthesis;
  if (synth.speaking && !synth.paused) synth.pause();
}

function playLoop() {
  const synth = window.speechSynthesis;

  // If currently paused mid-utterance, resume.
  if (synth.paused) {
    paused = false;
    running = true;
    synth.resume();
    return;
  }

  paused = false;

  // If loop was stopped (e.g., autoplay blocked), start again (user gesture helps).
  if (!running) {
    startLoop();
    return;
  }

  // If we were paused during the between-delay, continue.
  if (!synth.speaking && !synth.pending) {
    clearTimer();
    timerId = setTimeout(() => {
      if (running && !paused) speakNext();
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

  // Attempt autoplay. If the browser blocks it, it will stop and user can hit Play once.
  startLoop();
}

playBtn.addEventListener("click", playLoop);
pauseBtn.addEventListener("click", pauseLoop);

init().catch(() => {
  DISPLAY.textContent = "Failed to load affirmations.json";
});
