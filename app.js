let affirmations = [];
let deck = [];
let current = "";

let autoSpeak = true;          // ✅ default ON
let pendingAutoplay = false;   // browser may require a user gesture before TTS starts

let nextTimer = null;
let speakToken = 0;            // increments to invalidate old speech callbacks

const AUTO_GAP_MS = 700;       // pause between affirmations

const elText = document.getElementById("text");
const newBtn = document.getElementById("newBtn");
const speakBtn = document.getElementById("speakBtn");
const stopBtn = document.getElementById("stopBtn");
const autoBtn = document.getElementById("autoBtn");

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function refillDeck() {
  deck = [...affirmations];
  shuffle(deck);
}

function setText(t) {
  current = t;
  elText.textContent = t;
}

function syncAutoButton() {
  autoBtn.textContent = `Auto: ${autoSpeak ? "On" : "Off"}`;
  autoBtn.setAttribute("aria-pressed", String(autoSpeak));
}

function clearNextTimer() {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
}

function stopSpeaking() {
  speakToken++;      // invalidate any pending onend/onstart from previous utterances
  clearNextTimer();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function scheduleNext(myToken) {
  clearNextTimer();
  nextTimer = setTimeout(() => {
    if (myToken !== speakToken) return; // stale
    if (!autoSpeak) return;
    nextAffirmation(); // will also speak (or defer until unlock)
  }, AUTO_GAP_MS);
}

function speak(text, { detectBlocked = false } = {}) {
  if (!("speechSynthesis" in window)) {
    elText.textContent = "Sorry—your browser doesn't support Text-to-Speech.";
    return;
  }

  // New speak attempt invalidates previous chains
  const myToken = ++speakToken;
  clearNextTimer();
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;

  let started = false;
  u.onstart = () => {
    started = true;
    pendingAutoplay = false;
  };

  u.onend = () => {
    if (myToken !== speakToken) return;
    if (autoSpeak) scheduleNext(myToken);
  };

  u.onerror = () => {
    if (myToken !== speakToken) return;
    if (autoSpeak) scheduleNext(myToken);
  };

  window.speechSynthesis.speak(u);

  // Try to detect if autoplay is blocked until user interaction
  if (detectBlocked) {
    setTimeout(() => {
      if (myToken !== speakToken) return;
      if (!started && autoSpeak) pendingAutoplay = true;
    }, 600);
  }
}

function ensureAutoplayUnlockHandlers() {
  const unlock = () => {
    if (autoSpeak && pendingAutoplay && current) {
      // Start the chain once the browser considers we had a "gesture"
      speak(current);
      pendingAutoplay = false;
    }
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
}

function attemptAutoplay() {
  if (!autoSpeak || !current) return;
  speak(current, { detectBlocked: true });
  ensureAutoplayUnlockHandlers();
}

function nextAffirmation() {
  if (!affirmations.length) return;
  if (!deck.length) refillDeck();

  // Avoid immediate repeat when we reshuffle/refill
  let next = deck.pop();
  if (next === current && affirmations.length > 1) {
    if (!deck.length) refillDeck();
    next = deck.pop();
  }

  setText(next);
  attemptAutoplay();
}

async function loadAffirmations() {
  try {
    const base = location.href.endsWith("/") ? location.href : location.href + "/";
    const url = new URL("affirmations.json", base);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url.pathname}`);

    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.affirmations;

    if (!Array.isArray(list) || list.length < 1) {
      throw new Error('Invalid JSON. Use { "affirmations": [ ... ] } or just [ ... ]');
    }

    affirmations = list.filter((s) => typeof s === "string" && s.trim().length);
    refillDeck();
    nextAffirmation(); // starts autoplay chain (or defers until first interaction)
  } catch (err) {
    elText.textContent = `Couldn't load affirmations.json (${err.message})`;
    console.error(err);
  }
}

// Buttons
newBtn.addEventListener("click", () => {
  stopSpeaking();
  nextAffirmation();
});

speakBtn.addEventListener("click", () => current && speak(current));

stopBtn.addEventListener("click", () => {
  pendingAutoplay = false;
  stopSpeaking();
});

autoBtn.addEventListener("click", () => {
  autoSpeak = !autoSpeak;
  syncAutoButton();

  if (autoSpeak) {
    attemptAutoplay(); // (re)start chain
  } else {
    pendingAutoplay = false;
    stopSpeaking();    // stop chain + speech
  }
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (current) speak(current);
  } else if (e.key === "n" || e.key === "N") {
    stopSpeaking();
    nextAffirmation();
  } else if (e.key === "Escape") {
    pendingAutoplay = false;
    stopSpeaking();
  }
});

syncAutoButton();
loadAffirmations();
