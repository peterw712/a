let affirmations = [];
let deck = [];
let current = "";
let autoSpeak = false;

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
    const res = await fetch("./affirmations.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data || !Array.isArray(data.affirmations) || data.affirmations.length < 1) {
      throw new Error("Bad JSON format. Expected { affirmations: [ ... ] }");
    }

    affirmations = data.affirmations.filter((s) => typeof s === "string" && s.trim().length);
    refillDeck();
    nextAffirmation();
  } catch (err) {
    elText.textContent = "Couldn't load affirmations.json. Run this via a local server.";
    console.error(err);
  }
}

// Buttons
newBtn.addEventListener("click", nextAffirmation);
speakBtn.addEventListener("click", () => current && speak(current));
stopBtn.addEventListener("click", stopSpeaking);

autoBtn.addEventListener("click", () => {
  autoSpeak = !autoSpeak;
  autoBtn.textContent = `Auto: ${autoSpeak ? "On" : "Off"}`;
  autoBtn.setAttribute("aria-pressed", String(autoSpeak));
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

loadAffirmations();
