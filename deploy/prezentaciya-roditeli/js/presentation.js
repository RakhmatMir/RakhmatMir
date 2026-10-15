(function () {
  /** Временно: пауза/старт только кнопкой ▶ в нижней панели (вернуть false позже). */
  const TEMP_PLAY_ONLY_BOTTOM_BAR = true;

  const EXIT_MS = 480;
  /** Печать в синей плашке: в 2× медленнее, чем .caption-text (28ms → 56ms на букву). */
  const STAGE_CHAR_STEP_MS = 56;
  document.documentElement.style.setProperty("--stage-char-step", STAGE_CHAR_STEP_MS + "ms");

  const deck = document.getElementById("deck");
  const slides = Array.from(deck.querySelectorAll(".slide"));
  const overlay = document.getElementById("start-overlay");
  const btnStart = document.getElementById("btn-start");
  const player = document.getElementById("player");
  const progressBar = document.getElementById("progress-bar");
  const timeLabel = document.getElementById("time-label");
  const btnPlay = document.getElementById("btn-play");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnRestart = document.getElementById("btn-restart");

  const durations = slides.map((s) => Number(s.dataset.duration) || 5000);
  const totalMs = durations.reduce((a, b) => a + b, 0);

  let index = 0;
  let playing = false;
  let slideStartedAt = 0;
  let elapsedBeforeSlide = 0;
  let rafId = null;
  let slideTimeout = null;
  let transitioning = false;

  function formatTime(ms) {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function totalElapsed() {
    if (!playing && slideStartedAt === 0) return elapsedBeforeSlide;
    const slideElapsed = playing ? performance.now() - slideStartedAt : 0;
    return elapsedBeforeSlide + slideElapsed;
  }

  function updateChrome() {
    const elapsed = Math.min(totalElapsed(), totalMs);
    progressBar.style.width = (elapsed / totalMs) * 100 + "%";
    timeLabel.textContent = formatTime(elapsed) + " / " + formatTime(totalMs);
    btnPlay.textContent = playing ? "❚❚" : "▶";
    btnPlay.title = playing ? "Пауза" : "Продолжить";
  }

  function delayFromEl(el) {
    const d = el.getAttribute("data-delay");
    return d ? Number(d) : 0;
  }

  function splitCaption(el) {
    if (!el || el.closest(".start-content")) return;
    if (el.dataset.splitDone === "1") return;
    const text = el.textContent.trim();
    if (!text) return;
    el.dataset.splitDone = "1";
    el.textContent = "";
    el.setAttribute("aria-label", text);
    [...text].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "char";
      span.style.setProperty("--i", String(i));
      span.textContent = ch === " " ? "\u00a0" : ch;
      el.appendChild(span);
    });
    el.classList.add("fx-run");
  }

  function splitStageLine(el, startIndex) {
    if (el.dataset.splitDone === "1") return startIndex;
    const text = el.textContent.trim();
    if (!text) return startIndex;
    el.dataset.splitDone = "1";
    el.textContent = "";
    el.setAttribute("aria-label", text);
    el.classList.add("type-line");
    let i = startIndex;
    [...text].forEach((ch) => {
      const span = document.createElement("span");
      span.className = "char";
      span.style.setProperty("--i", String(i));
      span.textContent = ch === " " ? "\u00a0" : ch;
      el.appendChild(span);
      i += 1;
    });
    return i;
  }

  function prepareStagePanel(panel) {
    let charIndex = 0;
    panel.querySelectorAll(".stage-kicker, .stage-url, .stage-title").forEach((line) => {
      charIndex = splitStageLine(line, charIndex);
    });
    const fx = delayFromEl(panel);
    const afterTypeMs = charIndex * STAGE_CHAR_STEP_MS + 760 + 140;
    panel.style.setProperty("--panel-bg-delay", fx + afterTypeMs + "ms");
  }

  function prepareSlide(slide) {
    slide.querySelectorAll(".fx-block").forEach((el) => {
      const ms = delayFromEl(el);
      if (ms) el.style.setProperty("--fx-delay", ms + "ms");
    });
    slide.querySelectorAll(".caption-text").forEach(splitCaption);
    slide.querySelectorAll(".stage-panel").forEach(prepareStagePanel);
  }

  function prepareAllSlides() {
    slides.forEach(prepareSlide);
  }

  function replaySlideMotion(slide) {
    slide.querySelectorAll(".fx-block").forEach((node) => {
      node.classList.remove("fx-run");
      void node.offsetWidth;
      node.classList.add("fx-run");
    });

    slide.querySelectorAll(".caption-text").forEach((cap) => {
      if (!cap.querySelector(".char")) splitCaption(cap);
      cap.classList.remove("fx-run");
      cap.querySelectorAll(".char").forEach((c) => {
        c.style.animation = "none";
        void c.offsetWidth;
        c.style.animation = "";
      });
      void cap.offsetWidth;
      cap.classList.add("fx-run");
    });

    slide.querySelectorAll(".stage-panel").forEach((panel) => {
      prepareStagePanel(panel);
      panel.querySelectorAll(".type-line .char").forEach((c) => {
        c.style.animation = "none";
        void c.offsetWidth;
        c.style.animation = "";
      });
      panel.querySelectorAll(".type-line").forEach((line) => {
        line.style.animation = "none";
        void line.offsetWidth;
        line.style.animation = "";
      });
    });
  }

  function activateSlide(i) {
    slides.forEach((s, idx) => {
      s.classList.toggle("active", idx === i);
      s.classList.remove("slide-exit");
    });
    replaySlideMotion(slides[i]);
    index = i;
  }

  function transitionToSlide(nextIndex, onDone) {
    if (transitioning) return;
    if (nextIndex === index && slides[index].classList.contains("active")) {
      onDone && onDone();
      return;
    }

    transitioning = true;
    const current = slides[index];
    const hasActive = current && current.classList.contains("active");

    const finish = () => {
      activateSlide(nextIndex);
      transitioning = false;
      onDone && onDone();
    };

    if (!hasActive) {
      finish();
      return;
    }

    current.classList.add("slide-exit");
    window.setTimeout(() => {
      current.classList.remove("active", "slide-exit");
      finish();
    }, EXIT_MS);
  }

  function elapsedForIndex(i) {
    return durations.slice(0, i).reduce((a, b) => a + b, 0);
  }

  function clearTimers() {
    if (slideTimeout) {
      clearTimeout(slideTimeout);
      slideTimeout = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function scheduleNextSlide() {
    if (slideTimeout) clearTimeout(slideTimeout);
    const wait = Math.max(900, durations[index] - EXIT_MS);
    slideTimeout = window.setTimeout(() => {
      if (index < slides.length - 1) {
        goToSlide(index + 1, true);
      } else {
        playing = false;
        slideStartedAt = 0;
        elapsedBeforeSlide = totalMs;
        updateChrome();
      }
    }, wait);
  }

  function tick() {
    updateChrome();
    if (playing) rafId = requestAnimationFrame(tick);
  }

  function goToSlide(i) {
    clearTimers();
    if (i < 0) i = 0;
    if (i >= slides.length) i = slides.length - 1;

    if (playing) {
      elapsedBeforeSlide = elapsedForIndex(i);
      slideStartedAt = performance.now();
    } else {
      elapsedBeforeSlide = elapsedForIndex(i);
      slideStartedAt = 0;
    }

    transitionToSlide(i, () => {
      updateChrome();
      if (playing) {
        scheduleNextSlide();
        rafId = requestAnimationFrame(tick);
      }
    });
  }

  function play() {
    if (playing) return;
    playing = true;
    slideStartedAt = performance.now();
    scheduleNextSlide();
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!playing) return;
    elapsedBeforeSlide += performance.now() - slideStartedAt;
    playing = false;
    slideStartedAt = 0;
    clearTimers();
    updateChrome();
  }

  function togglePlay() {
    if (playing) pause();
    else play();
  }

  function openPresentation() {
    if (overlay.classList.contains("dismissed")) return false;
    overlay.classList.add("dismissed");
    player.classList.remove("hidden");
    index = 0;
    elapsedBeforeSlide = 0;
    slides.forEach((s) => s.classList.remove("active", "slide-exit"));
    activateSlide(0);
    updateChrome();
    return true;
  }

  function startPresentation() {
    openPresentation();
    if (!TEMP_PLAY_ONLY_BOTTOM_BAR) play();
  }

  function restart() {
    pause();
    elapsedBeforeSlide = 0;
    transitionToSlide(0, () => play());
  }

  prepareAllSlides();

  if (TEMP_PLAY_ONLY_BOTTOM_BAR) {
    document.body.classList.add("temp-play-bar-only");
    player.classList.remove("hidden");
    btnPlay.textContent = "▶";
    btnPlay.title = "Старт";
  }

  btnStart.addEventListener("click", (e) => {
    e.stopPropagation();
    startPresentation();
  });

  btnPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    if (TEMP_PLAY_ONLY_BOTTOM_BAR && !overlay.classList.contains("dismissed")) {
      openPresentation();
      play();
      return;
    }
    togglePlay();
  });

  function onScreenTap(e) {
    if (!TEMP_PLAY_ONLY_BOTTOM_BAR) {
      if (!overlay.classList.contains("dismissed")) {
        startPresentation();
      } else {
        togglePlay();
      }
      return;
    }
    if (e.target.closest("#player") || e.target.closest(".start-content")) return;
  }

  deck.addEventListener("click", onScreenTap);
  overlay.addEventListener("click", onScreenTap);
  btnPrev.addEventListener("click", () => {
    pause();
    goToSlide(index - 1);
  });
  btnNext.addEventListener("click", () => {
    pause();
    goToSlide(index + 1);
  });
  btnRestart.addEventListener("click", restart);

  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("dismissed")) {
      if (!TEMP_PLAY_ONLY_BOTTOM_BAR && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startPresentation();
      }
      return;
    }
    if (e.code === "Space") {
      if (TEMP_PLAY_ONLY_BOTTOM_BAR) return;
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowRight") {
      pause();
      goToSlide(index + 1);
    } else if (e.code === "ArrowLeft") {
      pause();
      goToSlide(index - 1);
    } else if (e.code === "KeyF") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }
  });

  updateChrome();
})();
