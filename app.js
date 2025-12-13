let affirmations = [];
let deck = [];
let current = "";
let autoSpeak = true; // ✅ autoplay default ON

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

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    elText.textContent = "Sorry—your browser doesn't support Text-to-Speech.";
    return;
  }
  stopSpeaking();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;

  window.speechSynthesis.speak(u);
}

function syncAutoButton() {
  autoBtn.textContent = `Auto: ${autoSpeak ? "On" : "Off"}`;
  autoBtn.setAttribute("aria-pressed", String(autoSpeak));
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
  if (autoSpeak) speak(next);
}

async function loadAffirmations() {
  try {
    // Ensure the base URL behaves like a directory (fixes missing trailing slash issues)
    const base = location.href.endsWith("/") ? location.href : location.href + "/";
    const url = new URL("affirmations.json", base);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url.pathname}`);

    const data = await res.json();

    // Accept either:
    // 1) { "affirmations": [...] }
    // 2) [ ... ]
    const list = Array.isArray(data) ? data : data?.affirmations;

    if (!Array.isArray(list) || list.length < 1) {
      throw new Error('Invalid JSON. Use { "affirmations": [ ... ] } or just [ ... ]');
    }

    affirmations = list.filter((s) => typeof s === "string" && s.trim().length);
    refillDeck();
    nextAffirmation(); // will auto-speak because autoSpeak=true
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

  // If turning Auto ON, speak whatever is currently displayed
  if (autoSpeak && current) speak(current);
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

// ✅ ensure button state matches default on first paint
syncAutoButton();
loadAffirmations();
