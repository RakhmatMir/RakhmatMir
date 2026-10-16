(function () {
  var schoolEl = document.getElementById("school-name");
  var statusEl = document.getElementById("data-status");
  var base = window.LAVH_PORTAL_API || "";
  var fallbackName = "Foundation School — демо";

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove("ok", "warn");
    if (kind) statusEl.classList.add(kind);
  }

  function applySchoolName(name) {
    if (schoolEl && name) schoolEl.textContent = name;
  }

  applySchoolName(fallbackName);
  setStatus("Данные: локальная заготовка", "warn");

  if (!base) {
    setStatus("Данные: задайте LAVH_PORTAL_API в config.js", "warn");
    return;
  }

  var url = base.replace(/\/$/, "") + "/api/public/landing";

  fetch(url, { credentials: "omit" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (data && data.school_name) {
        applySchoolName(data.school_name);
        setStatus("Данные: с портала (" + new URL(url).hostname + ")", "ok");
      } else {
        setStatus("Данные: API без school_name, заготовка", "warn");
      }
    })
    .catch(function () {
      applySchoolName(fallbackName);
      setStatus("Данные: портал недоступен (CORS или туннель), заготовка", "warn");
    });
})();
