(function () {
  const slides = [
    {
      caption: "Школьный портал — результаты ребёнка без ожидания и звонков",
      image: "images/slide-01.jpg",
      alt: "Вступление: школьный портал для семьи",
    },
    {
      caption: "После контрольной часто непонятно: сдал ли ребёнок и какой балл",
      image: "images/slide-02.jpg",
      alt: "Проблема: долго ждать обратной связи",
    },
    {
      caption: "Портал показывает сдачу и баллы сразу после теста",
      image: "images/slide-03.jpg",
      alt: "Онлайн-сдача и быстрый результат",
    },
    {
      caption: "Пример: класс 6Б — все три теста сданы, средний балл 58%",
      image: "images/slide-04.jpg",
      alt: "Экран ученика с баллами по предметам",
    },
    {
      caption: "Математика, английский, русский — видно, где подтянуть",
      image: "images/slide-05.jpg",
      alt: "Детализация по предметам",
    },
    {
      caption: "Уведомления родителям — Telegram и Email",
      image: "images/slide-06.jpg",
      alt: "Каналы уведомлений для родителей",
    },
    {
      caption: "Школа задаёт единые правила: время, предметы, честная сдача",
      image: "images/slide-07.jpg",
      alt: "Правила и контроль процесса",
    },
    {
      caption: "Спросите в школе подключение портала или демо для родителей",
      image: "images/slide-08.jpg",
      alt: "Призыв связаться со школой",
    },
  ];

  const captionEl = document.getElementById("slide-caption");
  const mediaEl = document.getElementById("slide-media");
  const timeLabel = document.getElementById("time-label");
  const progressBar = document.getElementById("progress-bar");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnRestart = document.getElementById("btn-restart");

  let index = 0;
  const images = [];

  slides.forEach((slide, i) => {
    const img = document.createElement("img");
    img.src = slide.image;
    img.alt = slide.alt;
    img.loading = i === 0 ? "eager" : "lazy";
    if (i === 0) img.classList.add("active");
    mediaEl.appendChild(img);
    images.push(img);
  });

  function render() {
    const slide = slides[index];
    captionEl.textContent = slide.caption;
    timeLabel.textContent = index + 1 + " / " + slides.length;
    progressBar.style.width = ((index + 1) / slides.length) * 100 + "%";
    images.forEach((img, i) => img.classList.toggle("active", i === index));
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === slides.length - 1;
  }

  function goTo(next) {
    if (next < 0 || next >= slides.length || next === index) return;
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
