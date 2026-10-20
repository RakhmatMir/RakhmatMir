import { findRegisteredUser, getRegisteredByLogin, registerPublicUser } from "./auth-local.js";
import {
  dataApi,
  demoAuthApi,
  getActiveSchoolCode,
  loadPortalBundle,
  loadSchoolsIndex,
  persistDemoSession,
  schoolExists,
  setActiveSchoolCode,
} from "./portal-data.js";

const $app = document.getElementById("app");

const state = {
  session: null,
  view: "home",
  uiMode: "student",
  userKind: null,
  leaving: false,
  exam: null,
  bundle: null,
  schoolCode: "",
};

window.portalState = state;

const VIEWS = {
  student: [
    { id: "home", label: "Обзор", icon: "◆" },
    { id: "tests", label: "Мои тесты", icon: "◆" },
    { id: "results", label: "Результаты", icon: "◆" },
    { id: "progress", label: "Прогресс", icon: "◆" },
  ],
  teacher: [
    { id: "teacher-home", label: "Кабинет учителя", icon: "◆" },
    { id: "editor", label: "Редактор теста", icon: "◆" },
    { id: "class-stats", label: "Статистика класса", icon: "◆" },
    { id: "errors", label: "Агрегация ошибок", icon: "◆" },
  ],
  admin: [
    { id: "admin-home", label: "Администрирование", icon: "◆" },
    { id: "classes", label: "Классы", icon: "◆" },
    { id: "teacher-home", label: "Аналитика (учитель)", icon: "◆" },
    { id: "errors", label: "Ошибки по вопросам", icon: "◆" },
  ],
};

const LOGO_SRC = "assets/lavh-logo.png";

function logoImg(size = "md", alt = "LAVH Educational Technology") {
  return `<img class="lavh-logo lavh-logo--${size}" src="${LOGO_SRC}" alt="${escapeHtml(alt)}" decoding="async" />`;
}

const DEMO_ACCOUNTS = [
  {
    label: "Учитель",
    school: "foundation",
    login: "admin",
    password: "admin123",
    uiMode: "teacher",
  },
  {
    label: "Ученик",
    school: "foundation",
    login: "6b01",
    password: "6b01-401",
    uiMode: "student",
  },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function api(path, options = {}) {
  const authPaths = new Set(["/api/login", "/api/logout", "/api/me"]);
  if (authPaths.has(path)) return demoAuthApi(path, options);
  return dataApi(path, options);
}

function roleLabel() {
  if (state.uiMode === "admin") return "Администратор";
  if (state.uiMode === "teacher") return "Учитель";
  return "Ученик";
}

function displayName(user) {
  const name = String(user?.full_name || "").trim();
  if (name) return name;
  return String(user?.login || "Пользователь").trim();
}

function avatarStorageKey(userId) {
  return `lavh_avatar_${userId}`;
}

function getAvatarUrl(userId) {
  try {
    return localStorage.getItem(avatarStorageKey(userId)) || "";
  } catch {
    return "";
  }
}

function setAvatarUrl(userId, dataUrl) {
  if (!dataUrl) localStorage.removeItem(avatarStorageKey(userId));
  else localStorage.setItem(avatarStorageKey(userId), dataUrl);
}

function userInitials(user) {
  const n = displayName(user);
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

const SETTINGS_ICON = `<svg class="sidebar-dock-settings-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.63.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>`;

function userAvatarMarkup(user, sizeClass = "") {
  const avatarUrl = getAvatarUrl(user?.id);
  if (avatarUrl) {
    return `<img class="sidebar-user-avatar-img ${sizeClass}" src="${avatarUrl}" alt="" />`;
  }
  return `<span class="sidebar-user-initials ${sizeClass}" aria-hidden="true">${escapeHtml(userInitials(user))}</span>`;
}

function sidebarDockBlock(user) {
  const name = displayName(user);
  const profileActive = state.view === "profile" ? " is-active" : "";
  const settingsActive = state.view === "settings" ? " is-active" : "";
  return `
    <div class="sidebar-footer sidebar-dock">
      <button type="button" class="sidebar-dock-profile${profileActive}" id="sidebar-user-btn" aria-label="Профиль: ${escapeHtml(name)}">
        <span class="sidebar-user-avatar">${userAvatarMarkup(user)}</span>
        <span class="sidebar-dock-name">${escapeHtml(name)}</span>
      </button>
      <button type="button" class="sidebar-dock-settings${settingsActive}" id="sidebar-settings-btn" aria-label="Настройки">
        ${SETTINGS_ICON}
      </button>
    </div>`;
}

function navItems() {
  if (state.uiMode === "admin") return VIEWS.admin;
  if (state.uiMode === "teacher") return VIEWS.teacher;
  return VIEWS.student;
}

function setMobileNavOpen(open) {
  document.querySelector(".shell")?.classList.toggle("nav-open", open);
  document.body.classList.toggle("nav-drawer-open", open);
}

async function switchView(id) {
  if (state.view === id || state.leaving) return;
  setMobileNavOpen(false);
  state.leaving = true;
  const stage = document.querySelector(".main-panel");
  if (stage) stage.classList.add("is-leaving");
  await new Promise((r) => setTimeout(r, 280));
  state.view = id;
  state.leaving = false;
  renderShell();
}

async function login(schoolCode, loginVal, password, uiMode) {
  const code = String(schoolCode || "").trim().toLowerCase();
  if (!code) throw new Error("school_required");
  if (!(await schoolExists(code))) throw new Error("school_not_found");

  setActiveSchoolCode(code);
  state.schoolCode = code;

  const registered = findRegisteredUser(code, loginVal, password);
  if (registered) {
    const bundle = await loadPortalBundle({ fresh: true, schoolCode: code });
    state.session = {
      user: {
        id: registered.id,
        login: registered.login,
        full_name: registered.full_name,
        role: "student",
        class_name: registered.class_name ?? null,
      },
      school_name: bundle.school_name,
      school_code: code,
    };
    persistDemoSession(state.session);
    state.uiMode = "student";
    state.userKind = "public";
    state.view = "home";
    state.bundle = bundle;
    renderShell();
    return;
  }

  const session = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ login: loginVal, password: password }),
  });
  session.school_code = code;
  persistDemoSession(session);
  state.session = session;
  state.userKind = "school";
  state.uiMode = uiMode || (session.user.role === "admin" ? "admin" : "student");
  state.view = state.uiMode === "student" ? "home" : state.uiMode === "teacher" ? "teacher-home" : "admin-home";
  state.bundle = await loadPortalBundle({ fresh: true, schoolCode: code });
  renderShell();
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" });
  state.session = null;
  state.exam = null;
  renderAuth();
}

const AUTH_ERRORS = {
  login_short: "Логин не короче 3 символов",
  password_short: "Пароль не короче 6 символов",
  login_taken: "Такой логин уже занят",
  password_mismatch: "Пароли не совпадают",
  school_required: "Укажите код школы",
  school_not_found: "Школа не найдена. Проверьте код.",
};

function authErrorMessage(err) {
  if (err?.message === "school_required") return AUTH_ERRORS.school_required;
  if (err?.message === "school_not_found") return AUTH_ERRORS.school_not_found;
  return AUTH_ERRORS[err?.message] || "Неверный логин или пароль";
}

function schoolDatalistHtml(schools) {
  const options = (schools || [])
    .map(
      (s) =>
        `<option value="${escapeHtml(s.code)}">${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`
    )
    .join("");
  return `<datalist id="school-codes">${options}</datalist>`;
}

function schoolFieldHtml(value = "") {
  const v = escapeHtml(value || getActiveSchoolCode() || "foundation");
  return `
    <label class="field">
      <span>Код школы</span>
      <input name="school_code" required autocomplete="organization" list="school-codes" placeholder="foundation" value="${v}" />
    </label>`;
}

async function renderAuth(options = {}) {
  const error = typeof options === "string" ? options : options.error || "";
  const registerOk = options.registerOk || null;
  const showRegister = (options.authPanel || "login") === "register";
  const schoolsIndex = await loadSchoolsIndex();
  const schools = schoolsIndex.schools || [];
  const schoolPrefill = options.schoolCode || getActiveSchoolCode() || "foundation";

  const loginCard = `
    <form class="auth-card auth-panel" id="login-form" ${showRegister ? 'hidden' : ""}>
      <h2>Вход в школу</h2>
      <p class="sub">Укажите код школы, затем логин и пароль</p>
      ${registerOk ? `<p class="auth-success">Аккаунт создан. Логин: <strong>${escapeHtml(registerOk.login)}</strong>. Войдите ниже.</p>` : ""}
      ${error && !showRegister ? `<p class="auth-error">${escapeHtml(error)}</p>` : ""}
      ${schoolFieldHtml(schoolPrefill)}
      <label class="field"><span>Логин</span><input name="login" required autocomplete="username" /></label>
      <label class="field"><span>Пароль</span><input name="password" type="password" required autocomplete="current-password" /></label>
      <button type="submit" class="btn-primary">Войти</button>
      <p class="auth-switch">
        <button type="button" class="auth-link" id="show-register">Регистрация</button>
      </p>
    </form>`;

  const registerCard = `
    <form class="auth-card auth-panel auth-card-register" id="register-form" ${showRegister ? "" : "hidden"}>
      <h2>Регистрация</h2>
      <p class="sub">Аккаунт в выбранной школе · Telegram позже</p>
      ${error && showRegister ? `<p class="auth-error">${escapeHtml(error)}</p>` : ""}
      ${schoolFieldHtml(schoolPrefill)}
      <label class="field"><span>Имя</span><input name="full_name" required autocomplete="name" placeholder="Как к вам обращаться" /></label>
      <label class="field"><span>Telegram</span><input name="telegram" autocomplete="username" placeholder="@username" /></label>
      <label class="field"><span>Логин</span><input name="login" required autocomplete="username" minlength="3" placeholder="латиница, цифры" /></label>
      <label class="field"><span>Пароль</span><input name="password" type="password" required minlength="6" autocomplete="new-password" /></label>
      <label class="field"><span>Повторите пароль</span><input name="password2" type="password" required minlength="6" autocomplete="new-password" /></label>
      <button type="submit" class="btn-register">Создать аккаунт</button>
      <p class="auth-switch">
        <button type="button" class="auth-link" id="show-login">Уже есть аккаунт? Вход</button>
      </p>
    </form>`;

  $app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-left">
        <div class="auth-logo-wrap">${logoImg("hero")}</div>
        <h1>LAVH TEST</h1>
        <p>Платформа автоматизированного тестирования: несколько школ на одном сайте, каждая со своими учениками и тестами. Сначала ознакомьтесь с сервисом, затем войдите по коду школы.</p>
      </div>
      <div class="auth-column">
        ${schoolDatalistHtml(schools)}
        <div class="auth-stack">
          ${loginCard}
          ${registerCard}
        </div>
        <aside class="auth-demo-block" aria-label="Демо-вход (временно)">
          <p class="auth-demo-label">Демо-доступ</p>
          <div class="demo-pills">
            ${DEMO_ACCOUNTS.map(
              (d) => `<button type="button" class="demo-pill" data-demo="${d.label}">${d.label}</button>`
            ).join("")}
          </div>
        </aside>
      </div>
      <div class="brand-footer">${logoImg("footer")}<span class="brand-footer-text">Educational Technology</span></div>
    </div>`;

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await login(fd.get("school_code"), fd.get("login"), fd.get("password"), null);
    } catch (err) {
      renderAuth({
        error: authErrorMessage(err),
        authPanel: "login",
        schoolCode: document.querySelector("#login-form [name=school_code]")?.value,
      });
    }
  });

  document.getElementById("register-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("password") !== fd.get("password2")) {
      renderAuth({ error: AUTH_ERRORS.password_mismatch, authPanel: "register" });
      return;
    }
    try {
      const user = registerPublicUser({
        schoolCode: fd.get("school_code"),
        login: fd.get("login"),
        password: fd.get("password"),
        fullName: fd.get("full_name"),
        telegram: fd.get("telegram"),
      });
      renderAuth({
        registerOk: { login: user.login },
        authPanel: "login",
        schoolCode: user.school_code,
      });
    } catch (err) {
      renderAuth({ error: AUTH_ERRORS[err.message] || "Не удалось зарегистрироваться", authPanel: "register" });
    }
  });

  document.getElementById("show-register")?.addEventListener("click", () => {
    renderAuth({ authPanel: "register" });
  });
  document.getElementById("show-login")?.addEventListener("click", () => {
    renderAuth({ authPanel: "login" });
  });

  document.querySelectorAll("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acc = DEMO_ACCOUNTS.find((d) => d.label === btn.dataset.demo);
      if (!acc) return;
      login(acc.school, acc.login, acc.password, acc.uiMode).catch(() =>
        renderAuth({ error: "Ошибка входа", authPanel: "login", schoolCode: acc.school })
      );
    });
  });
}

async function renderMainContent() {
  const v = state.view;
  const user = state.session?.user;

  if (v === "home") return renderStudentHome();
  if (v === "tests") return renderStudentTests();
  if (v === "exam") return renderExam();
  if (v === "results") return renderStudentResults();
  if (v === "progress") return renderProgress();
  if (v === "teacher-home") return renderTeacherHome();
  if (v === "editor") return renderEditor();
  if (v === "class-stats") return renderClassStats();
  if (v === "errors") return renderErrorsAgg();
  if (v === "admin-home") return renderAdminHome();
  if (v === "classes") return renderAdminClasses();
  if (v === "profile") return renderProfile();
  if (v === "settings") return renderSettings();
  return `<p class="muted">Раздел в разработке</p>`;
}

function renderSettings() {
  return `
    <div class="lavh-card settings-card">
      <h3>Настройки</h3>
      <p class="muted">Дополнительные параметры аккаунта и интерфейса.</p>
      <ul class="settings-list">
        <li><button type="button" class="settings-row" id="settings-open-profile">Профиль и фото</button></li>
        <li><button type="button" class="settings-row" disabled>Язык интерфейса (скоро)</button></li>
        <li><button type="button" class="settings-row" disabled>Уведомления Telegram (скоро)</button></li>
        <li><button type="button" class="settings-row" disabled>Подписка и биллинг (скоро)</button></li>
      </ul>
      <p class="muted settings-note">Выход из аккаунта временно здесь — позже перенесём в другое место.</p>
      <button type="button" class="btn-secondary settings-logout" id="btn-logout">Выйти из аккаунта</button>
    </div>`;
}

function bindSettings() {
  document.getElementById("settings-open-profile")?.addEventListener("click", () => switchView("profile"));
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    setMobileNavOpen(false);
    logout();
  });
}

function renderProfile() {
  const user = state.session?.user;
  if (!user) return "";
  const reg = getRegisteredByLogin(state.schoolCode || state.session?.school_code, user.login);
  const avatarUrl = getAvatarUrl(user.id);
  const accountKind =
    state.userKind === "public" ? "Свободный доступ (регистрация)" : "Школа / демо-портал";
  const rows = [
    ["Имя", displayName(user)],
    ["Логин", user.login],
    ["Роль", roleLabel()],
    ["Класс", user.class_name || "—"],
    ["Школа", state.session?.school_name || "—"],
    ["Тип аккаунта", accountKind],
  ];
  if (reg?.telegram) rows.push(["Telegram", reg.telegram]);
  if (reg?.created_at) {
    rows.push(["Регистрация", new Date(reg.created_at).toLocaleDateString("ru-RU")]);
  }

  const avatarPreview = avatarUrl
    ? `<img class="profile-avatar-img" src="${avatarUrl}" alt="" />`
    : `<span class="profile-avatar-initials">${escapeHtml(userInitials(user))}</span>`;

  return `
    <div class="lavh-card profile-card">
      <div class="profile-head">
        <div class="profile-avatar-wrap">${avatarPreview}</div>
        <div>
          <h3>${escapeHtml(displayName(user))}</h3>
          <p class="muted">@${escapeHtml(user.login)} · ${escapeHtml(roleLabel())}</p>
        </div>
      </div>
      <dl class="profile-dl">
        ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}
      </dl>
      <label class="field profile-upload">
        <span>Фото профиля (локально, до сервера)</span>
        <input type="file" id="profile-avatar-input" accept="image/*" />
      </label>
    </div>`;
}

function bindProfile() {
  const input = document.getElementById("profile-avatar-input");
  if (!input) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    const user = state.session?.user;
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(user.id, String(reader.result));
      renderShell();
    };
    reader.readAsDataURL(file);
  });
}

function previewStripStudent() {
  return `
    <div class="preview-strip">
      <div class="preview-mini stat-card yellow"><strong>88%</strong><br/>результат (пример)</div>
      <div class="preview-mini stat-card pink"><strong>5:06</strong><br/>время теста</div>
      <div class="preview-mini stat-card blue"><strong>14/16</strong><br/>верных ответов</div>
    </div>`;
}

async function renderStudentHome() {
  let completed = { tests: [], overall_score_percent: null };
  try {
    completed = await api("/api/portal/my/completed-tests");
  } catch {
    /* ignore */
  }
  const school = escapeHtml(state.session?.school_name || "LAVH");
  return `
    <div class="grid-3">
      <div class="stat-card blue"><span class="muted" style="color:rgba(255,255,255,.85)">Средний балл</span><div class="big">${completed.overall_score_percent ?? "—"}%</div><small>по сданным тестам</small></div>
      <div class="stat-card yellow"><span class="muted" style="color:rgba(255,255,255,.85)">Сдано</span><div class="big">${completed.tests.length}</div><small>из 3 в бандле</small></div>
      <div class="stat-card purple"><span class="muted" style="color:rgba(255,255,255,.85)">Школа</span><div class="big" style="font-size:1rem">${school}</div><small>LAVH TEST</small></div>
    </div>
    <p style="margin-top:20px;color:var(--lavh-muted)">Фрагмент главного экрана ученика — полные карточки в разделах «Мои тесты» и «Результаты».</p>
    ${previewStripStudent()}`;
}

async function renderStudentTests() {
  const subjects = await api("/api/portal/my/subjects");
  const cls = subjects.class_name;
  const code = subjects.subjects[0]?.code || "math";
  const data = await api(`/api/portal/class/${encodeURIComponent(cls)}/subjects/${code}/tests`);
  const tests = data.tests || [];

  return `
    <div class="lavh-card">
      <h3>Тесты класса (${tests.length})</h3>
      <p class="muted">Ждём публикации · ≈15 мин на тест · ${escapeHtml(cls)}</p>
      <ul class="test-list">
        ${tests
          .map((t) => {
            const done = t.submitted || t.catalog_key === "done";
            const label = t.student_label || (done ? "Сдано" : "К сдаче");
            return `<li class="test-item ${done ? "done" : ""}" data-exam="${t.id}" data-done="${done ? "1" : "0"}">
              <span>${escapeHtml(t.title || t.subject_title)}</span>
              <span class="badge">${escapeHtml(label)}</span>
            </li>`;
          })
          .join("")}
      </ul>
    </div>
    ${previewStripStudent()}`;
}

function bindTestList() {
  document.querySelectorAll(".test-item[data-exam]").forEach((el) => {
    if (el.dataset.done === "1") return;
    el.addEventListener("click", async () => {
      const examId = Number(el.dataset.exam);
      await startExam(examId);
    });
  });
}

async function startExam(examId) {
  const preview = await api(`/api/portal/exams/${examId}/preview`);
  state.exam = {
    examId,
    title: preview.exam?.title || "Тест",
    questions: preview.questions || [],
    step: 0,
    answers: {},
    times: [],
    started: Date.now(),
    stepStarted: Date.now(),
  };
  state.view = "exam";
  renderShell();
}

function renderExam() {
  const ex = state.exam;
  if (!ex || !ex.questions.length) return `<p>Нет вопросов</p>`;
  const q = ex.questions[ex.step];
  const total = ex.questions.length;
  const selected = ex.answers[ex.step];

  return `
    <div class="lavh-card exam-panel">
      <p class="muted">Вопрос ${ex.step + 1} из ${total}</p>
      <h3>${escapeHtml(q.text)}</h3>
      <div class="exam-options">
        ${q.options
          .map(
            (opt, i) =>
              `<button type="button" class="exam-opt ${selected === i ? "selected" : ""}" data-opt="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</button>`
          )
          .join("")}
      </div>
      <p class="muted" style="font-size:0.8rem">Двойной клик по варианту — выбрать ответ</p>
      <div class="exam-actions">
        <button type="button" class="btn-secondary" id="exam-back" ${ex.step === 0 ? "disabled" : ""}>Назад</button>
        <button type="button" class="btn-primary" style="flex:1" id="exam-next">${ex.step === total - 1 ? "Завершить" : "Далее"}</button>
      </div>
    </div>`;
}

function bindExam() {
  const ex = state.exam;
  if (!ex) return;

  document.querySelectorAll(".exam-opt").forEach((btn) => {
    btn.addEventListener("dblclick", () => {
      ex.answers[ex.step] = Number(btn.dataset.opt);
      renderShell();
    });
    btn.addEventListener("click", () => {
      ex.answers[ex.step] = Number(btn.dataset.opt);
      document.querySelectorAll(".exam-opt").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  document.getElementById("exam-back")?.addEventListener("click", () => {
    recordQuestionTime();
    ex.step = Math.max(0, ex.step - 1);
    ex.stepStarted = Date.now();
    renderShell();
  });

  document.getElementById("exam-next")?.addEventListener("click", async () => {
    if (ex.answers[ex.step] == null) return;
    recordQuestionTime();
    if (ex.step < ex.questions.length - 1) {
      ex.step++;
      ex.stepStarted = Date.now();
      renderShell();
      return;
    }
    await submitExam();
  });
}

function recordQuestionTime() {
  const ex = state.exam;
  if (!ex) return;
  const sec = Math.max(1, Math.round((Date.now() - ex.stepStarted) / 1000));
  ex.times[ex.step] = sec;
}

async function submitExam() {
  const ex = state.exam;
  const answers = {};
  for (const [k, v] of Object.entries(ex.answers)) answers[String(k)] = v;
  try {
    await api(`/api/portal/exams/${ex.examId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        answers,
        question_times: ex.times,
        question_away_seconds: ex.times.map(() => 0),
        question_exit_counts: ex.times.map(() => 0),
        exit_intent_count: 0,
      }),
    });
    state.exam = null;
    state.view = "results";
    renderShell();
  } catch (err) {
    alert(err?.message || "Не удалось отправить");
  }
}

async function renderStudentResults() {
  const data = await api("/api/portal/my/completed-tests");
  const tests = data.tests || [];
  if (!tests.length) {
    return `<div class="lavh-card"><h3>Результаты</h3><p class="muted">Пока нет сданных тестов. Перейдите в «Мои тесты».</p></div>${previewStripStudent()}`;
  }
  const t = tests[tests.length - 1];
  return `
    <div class="grid-2">
      <div class="lavh-card">
        <h3>${escapeHtml(t.subject_title)}</h3>
        <p class="muted">${escapeHtml(t.title)}</p>
        <div class="metric-row">
          <div class="metric-chip"><strong>${t.score_percent}%</strong>результат</div>
          <div class="metric-chip"><strong>${t.correct_count}/${t.question_total}</strong>верно</div>
          <div class="metric-chip"><strong>${escapeHtml(t.duration_label)}</strong>время</div>
        </div>
        <button type="button" class="btn-secondary" style="margin-top:16px;width:100%" id="btn-details">Подробные ответы (демо)</button>
      </div>
      <div class="stat-card purple" style="display:flex;align-items:center;justify-content:center;text-align:center;padding:32px">
        <p>Мгновенный результат без ручной проверки — <strong>LAVH TEST</strong></p>
      </div>
    </div>
    <ul class="test-list" style="margin-top:20px">
      ${tests.map((x) => `<li class="test-item done"><span>${escapeHtml(x.title)}</span><span class="badge">${x.score_percent}%</span></li>`).join("")}
    </ul>`;
}

function renderProgress() {
  return `
    <div class="lavh-card">
      <h3>Отслеживание прогресса</h3>
      <p class="muted">Индивидуальная шкала по предмету (демо Q1–Q4)</p>
      <div class="chart-line">
        <svg viewBox="0 0 400 120" preserveAspectRatio="none">
          <polyline fill="none" stroke="#9333ea" stroke-width="3" points="20,100 100,85 180,70 260,45 340,25"/>
          ${[20, 100, 180, 260, 340].map((x, i) => `<circle cx="${x}" cy="${[100, 85, 70, 45, 25][i]}" r="5" fill="#9333ea"/>`).join("")}
        </svg>
      </div>
    </div>
    <div class="grid-3" style="margin-top:18px">
      <div class="stat-card blue"><small>Предметы</small><div class="big">10+</div></div>
      <div class="stat-card yellow"><small>Тайминг</small><div class="big">1–10</div><small>мин / вопрос</div></div>
      <div class="stat-card pink"><small>Результат</small><div class="big">1 сек</div><small>проверка</small></div>
    </div>`;
}

async function renderTeacherHome() {
  const examId = 101;
  let admin;
  try {
    admin = await api(`/api/portal/exams/${examId}/admin`);
  } catch {
    admin = null;
  }
  const ex = admin?.exam;
  return `
    <div class="grid-2">
      <div class="lavh-card">
        <h3>Личный кабинет учителя</h3>
        <p class="muted">Администрирование теста · ${escapeHtml(ex?.title || "Контрольная")}</p>
        <div class="metric-row">
          <div class="metric-chip"><strong>${admin?.submitted_count ?? 0}/${admin?.class_total ?? 18}</strong>сдали</div>
          <div class="metric-chip"><strong>${ex?.question_count ?? 16}</strong>вопросов</div>
          <div class="metric-chip"><strong>${ex?.duration_minutes ?? 15} мин</strong>лимит</div>
        </div>
      </div>
      <div class="stat-card yellow"><small>Контрольная №1</small><div class="big">демо</div><small>аналитика класса</small></div>
    </div>
    <p class="muted" style="margin-top:16px">Уменьшенный превью блоков — полная таблица в «Статистика класса».</p>
    <div class="preview-strip">
      <div class="preview-mini lavh-card"><strong>Сдали</strong><br/>${admin?.submitted_count ?? "—"}/18</div>
      <div class="preview-mini lavh-card"><strong>Средний %</strong><br/>78%*</div>
      <div class="preview-mini lavh-card"><strong>Время</strong><br/>5:06*</div>
    </div>
    <p style="font-size:0.75rem;color:var(--lavh-muted)">* пример из макета, если нет сдач в демо</p>`;
}

function renderEditor() {
  return `
    <div class="lavh-card">
      <h3>Редактор вопросов теста</h3>
      <p class="muted">Черновик · публикация для класса отдельно</p>
      <div class="test-list">
        <div class="test-item"><span>Сколько будет 2 + 2?</span></div>
        <div class="test-item"><span>Периметр прямоугольника 5×9</span></div>
      </div>
      <div class="exam-actions" style="margin-top:16px">
        <button type="button" class="btn-secondary">Сохранить черновик</button>
        <button type="button" class="btn-primary" style="flex:1">Опубликовать вопросы</button>
      </div>
    </div>`;
}

async function renderClassStats() {
  const examId = 101;
  const admin = await api(`/api/portal/exams/${examId}/admin`);
  const students = (admin.students || []).slice(0, 6);
  return `
    <div class="lavh-card">
      <h3>Ученики класса</h3>
      <p class="muted">${admin.submitted_count} из ${admin.class_total} сдали</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ФИО</th><th>Статус</th><th>Балл</th></tr></thead>
          <tbody>
            ${students
              .map(
                (s) =>
                  `<tr><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.status_label || s.status)}</td><td>${s.score_percent != null ? s.score_percent + "%" : "—"}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function renderErrorsAgg() {
  const examId = 101;
  let stats = [];
  try {
    const admin = await api(`/api/portal/exams/${examId}/admin`);
    stats = admin.question_stats || [];
  } catch {
    stats = [];
  }
  const rows = stats.length
    ? stats.slice(0, 4).map((st, i) => ({
        q: `Q${i + 1}`,
        err: `${st.failed_percent ?? 0}%`,
        time: st.avg_time_label || "—",
        exit: st.question_exit_label || "нет",
      }))
    : [
        { q: "Q1", err: "12%", time: "6 с", exit: "нет" },
        { q: "Q2", err: "44%", time: "1:20", exit: "1 раз" },
      ];

  return `
    <div class="lavh-card">
      <h3>Агрегация ошибок</h3>
      <p class="muted">Проблемные вопросы среди сдавших</p>
      <table class="data-table">
        <thead>
          <tr><th class="q">Вопрос</th><th class="e">Ошибки</th><th class="t">Время</th><th class="x">Выход</th></tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr><td><strong>${r.q}</strong></td><td>${r.err}</td><td>${r.time}</td><td>${r.exit}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminHome() {
  const classes = await api("/api/portal/classes");
  return `
    <div class="grid-3">
      ${classes
        .map(
          (c, i) =>
            `<div class="stat-card ${["yellow", "blue", "pink"][i % 3]}"><small>${escapeHtml(c.class_name)}</small><div class="big">${c.student_count}</div><small>учеников · ${c.test_count} теста</small></div>`
        )
        .join("")}
    </div>
    <p style="margin-top:20px;color:var(--lavh-muted)">Админ: классы, публикация бандла — раздел «Классы».</p>`;
}

async function renderAdminClasses() {
  const classes = await api("/api/portal/classes");
  const cls = classes[0]?.class_name || "6Б";
  const subj = await api(`/api/portal/class/${encodeURIComponent(cls)}/subjects`);
  return `
    <div class="grid-2">
      <div class="lavh-card" style="border-left:6px solid var(--lavh-pink)">
        <h3>Классы</h3>
        <ul class="test-list">
          ${classes.map((c) => `<li class="test-item"><span>${escapeHtml(c.class_name)}</span><span class="muted">${c.student_count} уч. · ${c.test_count} тестов</span></li>`).join("")}
        </ul>
      </div>
      <div class="lavh-card" style="border-left:6px solid var(--lavh-purple)">
        <h3>Класс ${escapeHtml(cls)}</h3>
        <ul class="test-list">
          ${(subj.subjects || []).map((s) => `<li class="test-item"><span>${escapeHtml(s.title)}</span><span class="badge">1 тест</span></li>`).join("")}
        </ul>
      </div>
    </div>`;
}

const VIEW_TITLES = {
  home: ["Личный кабинет ученика", "Обзор и быстрые показатели"],
  tests: ["Мои тесты", "Выберите тест для сдачи"],
  exam: ["Прохождение теста", "LAVH TEST"],
  results: ["Результаты", "Аналитика по решённому тесту"],
  progress: ["Прогресс", "Отслеживание по четвертям"],
  "teacher-home": ["Личный кабинет учителя", "Администрирование теста"],
  editor: ["Редактор", "Вопросы теста"],
  "class-stats": ["Статистика класса", "Ученики и баллы"],
  errors: ["Агрегация ошибок", "Диагностика усвоения"],
  "admin-home": ["Администратор", "Управление школой"],
  classes: ["Классы и предметы", "Редактирование структуры"],
  profile: ["Профиль", "Ваши данные в системе"],
  settings: ["Настройки", "Параметры аккаунта"],
};

async function renderShell() {
  const user = state.session?.user;
  const [title, sub] = VIEW_TITLES[state.view] || ["LAVH TEST", ""];
  const content = await renderMainContent();

  $app.innerHTML = `
    <div class="shell">
      <button type="button" class="nav-overlay" id="nav-overlay" aria-label="Закрыть меню" tabindex="-1"></button>
      <aside class="sidebar" id="app-sidebar">
        <div class="sidebar-head">
          <div class="sidebar-brand">
            ${logoImg("sidebar")}
            <div class="sidebar-brand-text">
              <span class="logo">LAVH TEST</span>
              <small>Educational technology</small>
            </div>
          </div>
          <button type="button" class="sidebar-close" id="nav-close" aria-label="Закрыть меню">
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>
          </button>
        </div>
        <nav class="sidebar-nav">
        ${navItems()
          .map(
            (item) =>
              `<button type="button" class="nav-btn ${state.view === item.id ? "active" : ""}" data-view="${item.id}"><span class="nav-dot"></span>${escapeHtml(item.label)}</button>`
          )
          .join("")}
        </nav>
        ${user ? sidebarDockBlock(user) : ""}
      </aside>
      <main class="main">
        <div class="main-topbar">
          <button type="button" class="nav-toggle" id="nav-toggle" aria-label="Открыть меню" aria-expanded="false">
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
          </button>
          <header class="main-header main-header--compact">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(sub)}</p>
          </header>
        </div>
        <div class="main-stage">
          <div class="main-panel">${content}</div>
        </div>
      </main>
    </div>`;

  const shell = document.querySelector(".shell");
  const toggle = document.getElementById("nav-toggle");
  const syncNavAria = (open) => {
    toggle?.setAttribute("aria-expanded", open ? "true" : "false");
  };
  toggle?.addEventListener("click", () => {
    const open = !shell?.classList.contains("nav-open");
    setMobileNavOpen(open);
    syncNavAria(open);
  });
  document.getElementById("nav-overlay")?.addEventListener("click", () => {
    setMobileNavOpen(false);
    syncNavAria(false);
  });
  document.getElementById("nav-close")?.addEventListener("click", () => {
    setMobileNavOpen(false);
    syncNavAria(false);
  });

  document.getElementById("sidebar-user-btn")?.addEventListener("click", () => {
    switchView("profile");
  });
  document.getElementById("sidebar-settings-btn")?.addEventListener("click", () => {
    switchView("settings");
  });

  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  bindTestList();
  bindExam();
  bindProfile();
  bindSettings();
  document.getElementById("btn-details")?.addEventListener("click", () => alert("В полной версии — окно с ответами по каждому вопросу."));
}

async function boot() {
  const savedSchool = getActiveSchoolCode();
  if (!savedSchool) {
    await renderAuth();
    return;
  }
  state.schoolCode = savedSchool;
  try {
    const session = await api("/api/me");
    state.session = session;
    state.schoolCode = session.school_code || savedSchool;
    setActiveSchoolCode(state.schoolCode);
    const role = session.user.role;
    if (state.uiMode === "teacher" && role === "admin") {
      /* сохранённый режим учителя из демо */
    } else {
      state.uiMode = role === "admin" ? "admin" : "student";
    }
    state.view = state.uiMode === "student" ? "home" : state.uiMode === "teacher" ? "teacher-home" : "admin-home";
    state.bundle = await loadPortalBundle({ schoolCode: state.schoolCode });
    renderShell();
  } catch {
    await renderAuth();
  }
}

boot();
