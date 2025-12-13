let affirmations = [];
let deck = [];
let current = "";

let autoSpeak = true;           // ✅ autoplay default ON
let pendingAutoplay = false;    // if TTS is blocked until user gesture

let speakToken = 0;             // invalidates stale callbacks
let currentUtterance = null;    // keep a reference so it won't get GC'd
let fallbackTimer = null;
let nextTimer = null;

const AUTO_GAP_MS = 700;        // pause between affirmations

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

function clearTimers() {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  if (nextTimer) clearTimeout(nextTimer);
  fallbackTimer = null;
  nextTimer = null;
}

function stopSpeaking() {
  speakToken++; // invalidate any old utterance callbacks
  clearTimers();
  currentUtterance = null;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function estimateMsForText(text, rate = 1) {
  // Rough estimate: ~155 wpm = 2.58 words/sec
  const words = (text.trim().match(/\S+/g) || []).length;
  const wps = 2.58 * rate;
  const speakMs = (words / wps) * 1000;
  return Math.max(1500, speakMs + 600); // minimum + padding
}

function scheduleNext(token) {
  if (!autoSpeak) return;

  if (nextTimer) clearTimeout(nextTimer);
  nextTimer = setTimeout(() => {
    if (token !== speakToken) return;
    nextAffirmation(true); // true = auto-initiated
  }, AUTO_GAP_MS);
}

function speakCurrentAndQueueNext({ detectBlocked = false } = {}) {
  if (!current || !("speechSynthesis" in window)) return;

  const token = ++speakToken;
  clearTimers();

  // Some browsers get "stuck" paused
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    // warm up voices list
    window.speechSynthesis.getVoices();
  } catch {}

  const u = new SpeechSynthesisUtterance(current);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;

  currentUtterance = u;

  let started = false;
  u.onstart = () => {
    started = true;
    pendingAutoplay = false;
  };

  const finish = () => {
    if (token !== speakToken) return;
    clearTimers();
    if (autoSpeak) scheduleNext(token);
  };

  u.onend = finish;
  u.onerror = finish;

  // Fallback: if onend never fires, advance anyway
  fallbackTimer = setTimeout(() => {
    if (token !== speakToken) return;
    if (autoSpeak) scheduleNext(token);
  }, estimateMsForText(current, u.rate));

  window.speechSynthesis.speak(u);

  // Detect autoplay blocking (speech doesn't start until user gesture)
  if (detectBlocked) {
    setTimeout(() => {
      if (token !== speakToken) return;
      if (!started && autoSpeak) pendingAutoplay = true;
    }, 700);
  }
}

function ensureAutoplayUnlockHandlers() {
  const unlock = () => {
    if (autoSpeak && pendingAutoplay && current) {
      speakCurrentAndQueueNext({ detectBlocked: false });
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
  speakCurrentAndQueueNext({ detectBlocked: true });
  ensureAutoplayUnlockHandlers();
}

function nextAffirmation(autoInitiated = false) {
  if (!affirmations.length) return;
  if (!deck.length) refillDeck();

  let next = deck.pop();
  if (next === current && affirmations.length > 1) {
    if (!deck.length) refillDeck();
    next = deck.pop();
  }

  setText(next);

  if (autoSpeak) {
    attemptAutoplay();
  } else if (!autoInitiated) {
    // manual new while auto is off: don't speak
  }
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

    // show + try to start continuous autoplay
    nextAffirmation(true);
  } catch (err) {
    elText.textContent = `Couldn't load affirmations.json (${err.message})`;
    console.error(err);
  }
}

// Buttons
newBtn.addEventListener("click", () => {
  stopSpeaking();
  nextAffirmation(false);
});

speakBtn.addEventListener("click", () => {
  if (!current) return;
  pendingAutoplay = false;
  speakCurrentAndQueueNext({ detectBlocked: false });
});

stopBtn.addEventListener("click", () => {
  pendingAutoplay = false;
  stopSpeaking();
});

autoBtn.addEventListener("click", () => {
  autoSpeak = !autoSpeak;
  syncAutoButton();

  if (autoSpeak) {
    attemptAutoplay(); // start continuous loop
  } else {
    pendingAutoplay = false;
    stopSpeaking();    // stop loop + speech
  }
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (current) {
      pendingAutoplay = false;
      speakCurrentAndQueueNext({ detectBlocked: false });
    }
  } else if (e.key === "n" || e.key === "N") {
    stopSpeaking();
    nextAffirmation(false);
  } else if (e.key === "Escape") {
    pendingAutoplay = false;
    stopSpeaking();
  }
});

syncAutoButton();
loadAffirmations();
