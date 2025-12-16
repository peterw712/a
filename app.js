function speakCurrentAndQueueNext({ detectBlocked = false } = {}) {
  if (!current || !("speechSynthesis" in window)) return;

  const token = ++speakToken;
  clearTimers();

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.getVoices();
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

    // ✅ only start fallback AFTER we know speech actually began
    fallbackTimer = setTimeout(() => {
      if (token !== speakToken) return;
      if (autoSpeak) scheduleNext(token);
    }, estimateMsForText(current, u.rate));
  };

  u.onend = () => {
    // ✅ don't advance if it never actually started (blocked)
    if (!started) return;
    finish();
  };

  u.onerror = (e) => {
    // ✅ if blocked (common on load), don't advance; wait for user gesture
    if (!started && detectBlocked) {
      pendingAutoplay = true;
      return;
    }
    // otherwise treat as finished
    finish();
  };

  window.speechSynthesis.speak(u);

  // Detect autoplay blocking (speech doesn't start until user gesture)
  if (detectBlocked) {
    setTimeout(() => {
      if (token !== speakToken) return;
      if (!started && autoSpeak) pendingAutoplay = true;
    }, 700);
  }
}
