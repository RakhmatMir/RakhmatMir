(function () {
  const scenes = [
    {
      cap: "Школьный портал — контрольные онлайн",
      render: login,
      cta: "",
    },
    {
      cap: "Меньше бумаги — больше времени учителю",
      render: problem,
      cta: "",
    },
    {
      cap: "Ученик видит баллы сразу · класс 6Б",
      render: student,
      cta: "",
    },
    {
      cap: "Учитель ведёт класс: 18 учеников, 3 теста",
      render: teacher,
      cta: "",
    },
    {
      cap: "18 из 18 сдали — сложные вопросы видны",
      render: analytics,
      cta: "",
    },
    {
      cap: "Готовы показать вашей школе",
      render: ctaScreen,
      cta: "Подключим вашу школу · демо",
    },
  ];

  function login() {
    return `<div class="panel" style="max-width:420px;margin:40px auto;text-align:center">
    <div class="bar" style="font-size:32px">Школа</div><p class="meta">Вход для администрации и учеников</p>
    <p class="meta" style="margin-top:20px;text-align:left">Логин</p><div class="panel" style="padding:10px">6b01</div>
    <p class="meta" style="text-align:left">Пароль</p><div class="panel" style="padding:10px">••••••••</div>
    <div class="btn">Войти</div></div>`;
  }

  function problem() {
    return `<div class="chips" style="display:flex;flex-direction:column;gap:16px;margin-top:60px">
    <div class="chip" style="background:#1e1e1e;color:#fff;font-size:32px">3+ часа на одну контрольную</div>
    <div class="chip" style="background:#1e1e1e;color:#fff;font-size:32px">Нет аналитики по вопросам</div></div>`;
  }

  function student() {
    return `<div class="bar">Портал · демо · класс 6Б</div>
    <div class="panel"><strong>Все тесты сданы</strong><div class="meta">Математика 75% · Английский 60% · Русский 40%</div></div>
    <div class="row"><span>Общий средний балл</span><strong>58%</strong></div>`;
  }

  function teacher() {
    return `<div class="bar">Класс 6Б</div><div class="meta">18 уч. · 3 тест. · опубликованы</div>
    <div class="panel" style="margin-top:12px">Общее время <strong>45 мин</strong> → 15 мин на тест</div>
    <div class="meta" style="margin-top:8px">Математика · Русский · Английский</div>`;
  }

  function analytics() {
    return `<div class="metrics"><div><span class="meta">Сдали</span><strong>18</strong></div><div><span class="meta">Из</span><strong>18</strong></div><div><span class="meta">Ср.время</span><strong>5:06</strong></div><div><span class="meta">Выход</span><strong>5</strong></div></div>
    <div class="panel"><strong>Сложные вопросы</strong><div class="row"><span>Периметр 5×9</span><span style="color:#dc2626">100%</span></div></div>`;
  }

  function ctaScreen() {
    return `<div style="text-align:center;margin-top:120px;font-size:36px;font-weight:800">Образовательный портал</div>
    <div class="btn" style="max-width:520px;margin:20px auto;font-size:24px">Подключим ваши классы</div>`;
  }

  const capEl = document.getElementById("cap");
  const scrEl = document.getElementById("scr");
  const ctaEl = document.getElementById("cta");
  const progressBar = document.getElementById("progress-bar");
  const timeLabel = document.getElementById("time-label");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnRestart = document.getElementById("btn-restart");

  let index = 0;

  function render() {
    const sc = scenes[index];
    capEl.textContent = sc.cap;
    scrEl.innerHTML = sc.render();
    if (sc.cta) {
      ctaEl.textContent = sc.cta;
      ctaEl.classList.remove("hidden");
    } else {
      ctaEl.textContent = "";
      ctaEl.classList.add("hidden");
    }
    timeLabel.textContent = "Слайд " + (index + 1) + " / " + scenes.length;
    progressBar.style.width = ((index + 1) / scenes.length) * 100 + "%";
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === scenes.length - 1;
  }

  function goTo(next) {
    if (next < 0 || next >= scenes.length || next === index) return;
    index = next;
    render();
  }

  btnPrev.addEventListener("click", () => goTo(index - 1));
  btnNext.addEventListener("click", () => goTo(index + 1));
  btnRestart.addEventListener("click", () => goTo(0));

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") goTo(index - 1);
    if (e.key === "ArrowRight") goTo(index + 1);
  });

  render();
})();
