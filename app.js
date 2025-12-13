let affirmations = [];
let deck = [];
let current = "";
let autoSpeak = true;          // ✅ default ON
let pendingAutoplay = false;   // if browser blocks speech until user gesture

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

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speak(text, { detectBlocked = false } = {}) {
  if (!("speechSynthesis" in window)) {
    elText.textContent = "Sorry—your browser doesn't support Text-to-Speech.";
    return;
  }

  stopSpeaking();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;

  if (!detectBlocked) {
    window.speechSynthesis.speak(u);
    return;
  }

  // Try to detect autoplay-blocking: if "onstart" doesn't fire soon, assume blocked
  let started = false;
  u.onstart = () => {
    started = true;
    pendingAutoplay = false;
  };

  window.speechSynthesis.speak(u);

  setTimeout(() => {
    // If it didn't start, likely needs a user gesture
    if (!started && autoSpeak) {
      pendingAutoplay = true;
      // Optional: console hint
      console.warn("TTS blocked until user interaction. Will autoplay on first click/tap/key.");
    }
  }, 600);
}

function ensureAutoplayUnlockHandlers() {
  const unlock = () => {
    if (autoSpeak && pendingAutoplay && current) {
      // once user interacts, we can speak
      speak(current);
      pendingAutoplay = false;
    }
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };

  // install once (capture=true so we catch early)
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
    nextAffirmation(); // will try autoplay (or defer until first user gesture if blocked)
  } catch (err) {
    elText.textContent = `Couldn't load affirmations.json (${err.message})`;
    console.error(err);
  }
}

// Buttons
newBtn.addEventListener("click", nextAffirmation);
speakBtn.addEventListener("click", () => current && speak(current));
stopBtn.addEventListener("click", stopSpeaking);

autoBtn.addEventListener("click", () => {
  autoSpeak = !autoSpeak;
  syncAutoButton();

  if (autoSpeak) {
    attemptAutoplay(); // speak immediately if possible; otherwise on next user gesture
  } else {
    pendingAutoplay = false;
    stopSpeaking();
  }
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (current) speak(current);
  } else if (e.key === "n" || e.key === "N") {
    nextAffirmation();
  } else if (e.key === "Escape") {
    stopSpeaking();
  }
});

syncAutoButton();
loadAffirmations();
