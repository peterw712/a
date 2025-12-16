// app.js

(() => {
  // -------------------------
  // State
  // -------------------------
  let affirmations = [];
  let deck = [];
  let current = "";

  let autoSpeak = true;           // autoplay default ON
  let pendingAutoplay = false;    // if TTS is blocked until user gesture

  let speakToken = 0;             // invalidates stale callbacks
  let currentUtterance = null;    // keep a reference so it won't get GC'd
  let fallbackTimer = null;
  let nextTimer = null;

  const AUTO_GAP_MS = 700;        // pause between affirmations

  // -------------------------
  // DOM
  // -------------------------
  let elText, newBtn, speakBtn, stopBtn, autoBtn;

  function mustGet(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }

  // -------------------------
  // Helpers
  // -------------------------
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
      try {
        window.speechSynthesis.cancel();
      } catch {}
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

  // -------------------------
  // Speech
  // -------------------------
  function speakCurrentAndQueueNext({ detectBlocked = false } = {}) {
    if (!current || !("speechSynthesis" in window)) return;

    const token = ++speakToken;
    clearTimers();

    try {
      // reset possible weird states
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      window.speechSynthesis.getVoices(); // warm voices list
    } catch {}

    const u = new SpeechSynthesisUtterance(current);
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;

    currentUtterance = u;

    let started = false;

    const finish = () => {
      if (token !== speakToken) return;
      clearTimers();
      if (autoSpeak) scheduleNext(token);
    };

    u.onstart = () => {
      started = true;
      pendingAutoplay = false;

      // Only start fallback AFTER we know speech actually began
      fallbackTimer = setTimeout(() => {
        if (token !== speakToken) return;
        if (autoSpeak) scheduleNext(token);
      }, estimateMsForText(current, u.rate));
    };

    u.onend = () => {
      // If speech never started, it's likely autoplay blocked: don't advance
      if (!started) {
        if (detectBlocked && autoSpeak) pendingAutoplay = true;
        return;
      }
      finish();
    };

    u.onerror = () => {
      // If blocked on load, don't advance; wait for user gesture
      if (!started && detectBlocked) {
        pendingAutoplay = true;
        return;
      }
      // Otherwise treat like finished (but still only if it actually started)
      if (!started) return;
      finish();
    };

    try {
      window.speechSynthesis.speak(u);
    } catch {
      // If speak throws (rare), don’t spin through affirmations
      if (detectBlocked && autoSpeak) pendingAutoplay = true;
      return;
    }

    // Extra block detection: if nothing starts shortly, assume blocked
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

    // Try to speak; if blocked, we’ll keep the current text and wait for gesture
    speakCurrentAndQueueNext({ detectBlocked: true });
    ensureAutoplayUnlockHandlers();

    // Optional: hint user if blocked
    if (pendingAutoplay) {
      // If you don’t want this message, delete these 2 lines.
      // (Keeps the affirmation text on screen; you can also use a separate status element.)
      // elText.textContent = `${current}\n\n(Tap/click to start audio)`;
    }
  }

  // -------------------------
  // Deck / flow
  // -------------------------
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
      elText.textContent = "Loading…";

      // Correct URL resolving for /, /index.html, subfolders, etc.
      const url = new URL("./affirmations.json", document.baseURI);

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url.pathname}`);

      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.affirmations;

      if (!Array.isArray(list) || list.length < 1) {
        throw new Error('Invalid JSON. Use { "affirmations": [ ... ] } or just [ ... ]');
      }

      affirmations = list.filter((s) => typeof s === "string" && s.trim().length);
      if (!affirmations.length) throw new Error("No valid affirmations found in JSON");

      refillDeck();

      // show + try to start continuous autoplay
      nextAffirmation(true);
    } catch (err) {
      elText.textContent = `Couldn't load affirmations.json (${err.message})`;
      console.error(err);
    }
  }

  // -------------------------
  // Wiring
  // -------------------------
  function wireEvents() {
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
        attemptAutoplay();
      } else {
        pendingAutoplay = false;
        stopSpeaking();
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
  }

  function init() {
    // Grab elements (and fail loudly if missing)
    elText = mustGet("text");
    newBtn = mustGet("newBtn");
    speakBtn = mustGet("speakBtn");
    stopBtn = mustGet("stopBtn");
    autoBtn = mustGet("autoBtn");

    syncAutoButton();
    wireEvents();
    loadAffirmations();
  }

  // Run after DOM exists (works whether or not script has defer)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
