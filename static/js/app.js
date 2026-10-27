import {
  assignRegisteredUserSchool,
  findRegisteredUser,
  findRegisteredUserGlobal,
  getRegisteredByLogin,
  listUnassignedUsers,
  listUsersForSchool,
  loadPublicUsers,
  persistPublicUsers,
  registerPublicUser,
  unassignRegisteredUser,
} from "./auth-local.js?v=8";
import {
  authenticateSuperAdmin,
  clearActiveSchoolCode,
  dataApi,
  demoAuthApi,
  getActiveSchoolCode,
  invalidatePortalBundleCache,
  loadPortalBundle,
  persistDemoSession,
  resolveDemoUserSchool,
  setActiveSchoolCode,
} from "./portal-data.js?v=60";
import {
  lavhInitPortalRuntime,
  lavhRenderPortalDashboard,
  lavhSyncPortalNavFromLavhView,
  renderAdminFlow,
  renderStudentFlow,
  portalState,
} from "./portal-app.js?v=85";

const $app = document.getElementById("app");
let portalRuntimeReady = false;
let portalDashboardBooted = false;

const PORTAL_MODALS_HTML = `
    <div class="exam-guard-modal hidden" id="student-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="student-confirm-title">
      <div class="exam-guard-backdrop" id="student-confirm-backdrop"></div>
      <div class="exam-guard-dialog panel">
        <h3 id="student-confirm-title">Подтверждение</h3>
        <p id="student-confirm-desc"></p>
        <div class="student-confirm-actions">
          <button type="button" class="btn-ghost" id="student-confirm-cancel">Отмена</button>
          <button type="button" class="btn-primary" id="student-confirm-ok">Начать</button>
        </div>
      </div>
    </div>
    <div class="exam-guard-modal hidden" id="exam-guard-modal" role="alertdialog" aria-modal="true" aria-labelledby="exam-guard-title">
      <div class="exam-guard-backdrop" id="exam-guard-backdrop"></div>
      <div class="exam-guard-dialog panel">
        <h3 id="exam-guard-title">Тест не завершён</h3>
        <p id="exam-guard-desc">До окончания теста недоступны другие действия.</p>
        <p class="exam-guard-reason muted" id="exam-guard-reason"></p>
        <p class="muted exam-guard-count" id="exam-guard-count" hidden></p>
        <button type="button" class="btn-primary" id="exam-guard-ok">Продолжить тест</button>
      </div>
    </div>
    <div class="exam-guard-modal hidden" id="teacher-student-submission-modal" role="dialog" aria-modal="true">
      <div class="exam-guard-backdrop" id="teacher-student-submission-backdrop"></div>
      <div class="exam-guard-dialog panel teacher-student-submission-dialog">
        <button type="button" class="btn-ghost teacher-student-submission-close" aria-label="Закрыть">×</button>
        <div class="teacher-student-submission-body" id="teacher-student-submission-body"></div>
      </div>
    </div>`;

const state = {
  session: null,
  view: "home",
  uiMode: "student",
  userKind: null,
  leaving: false,
  exam: null,
  bundle: null,
  schoolCode: "",
  adminNav: { className: null, subjectCode: null, examId: null },
};

const PAGE_STATE_KEY = "lavh_page_v1";

function viewsForMode(uiMode) {
  const extra = ["profile", "settings"];
  if (uiMode === "super") extra.push("super-schools", "admin-class", "admin-subject", "admin-exam");
  else if (uiMode === "admin") extra.push("admin-exam");
  const list =
    uiMode === "super" && state.schoolCode ? VIEWS.superSchool : VIEWS[uiMode] || VIEWS.student;
  return new Set([...list.map((item) => item.id), ...extra]);
}

function defaultViewForMode(uiMode) {
  if (uiMode === "student") return "home";
  if (uiMode === "super") return state.schoolCode ? "admin-home" : "super-schools";
  return "admin-home";
}

function savePageState() {
  const user = state.session?.user;
  if (!user) return;
  const portal = portalState || {};
  const payload = {
    school: state.schoolCode || state.session?.school_code || "",
    userId: user.id,
    uiMode: state.uiMode,
    view: state.view,
    adminNav: state.adminNav,
    portal: {
      shellView: portal.shellView || state.view,
      adminView: portal.adminView || "home",
      className: portal.className ?? state.adminNav?.className ?? null,
      subjectCode: portal.subjectCode ?? state.adminNav?.subjectCode ?? null,
      subjectTitle: portal.subjectTitle || null,
      examId: portal.examId ?? state.adminNav?.examId ?? null,
      examTitle: portal.examTitle || null,
      staffTestsShortcut: Boolean(portal.staffTestsShortcut),
      studentExamReturnHome: Boolean(portal.studentExamReturnHome),
      openExamAsReview: Boolean(portal.openExamAsReview),
    },
  };
  try {
    sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function readPageState(session) {
  try {
    const raw = sessionStorage.getItem(PAGE_STATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const school = session?.school_code || state.schoolCode || "";
    if (data.school && school && data.school !== school) return null;
    if (data.userId != null && session?.user?.id != null && Number(data.userId) !== Number(session.user.id)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function savedViewIsUsable(data, uiMode) {
  if (!data?.view || !viewsForMode(uiMode).has(data.view)) return false;
  const className = data.portal?.className || data.adminNav?.className;
  const subjectCode = data.portal?.subjectCode || data.adminNav?.subjectCode;
  const examId = data.portal?.examId ?? data.adminNav?.examId;
  if ((data.view === "admin-class" || data.view === "admin-subject" || data.view === "admin-exam") && !className) {
    return false;
  }
  if (data.view === "admin-subject" && !subjectCode) return false;
  if (data.view === "admin-exam" && examId == null) return false;
  if (data.portal?.adminView === "subject" && !subjectCode) return false;
  if (data.portal?.adminView === "exam" && examId == null) return false;
  return true;
}

window.__lavhSavePage = savePageState;

window.portalState = state;

const VIEWS = {
  student: [
    { id: "home", label: "Обзор", icon: "◆" },
    { id: "tests", label: "Мои тесты", icon: "◆" },
    { id: "results", label: "Результаты", icon: "◆" },
    { id: "progress", label: "Прогресс", icon: "◆" },
  ],
  admin: [
    { id: "admin-home", label: "Обзор", icon: "◆" },
    { id: "test-flow", label: "Ход тестов", icon: "◆" },
    { id: "staff-tests", label: "Контрольные", icon: "◆" },
    { id: "class-stats", label: "Статистика класса", icon: "◆" },
    { id: "errors", label: "Ошибки по вопросам", icon: "◆" },
  ],
  superSchool: [
    { id: "admin-home", label: "Обзор", icon: "◆" },
    { id: "school-people", label: "Люди", icon: "◆" },
    { id: "classes", label: "Классы", icon: "◆" },
    { id: "create-test", label: "Создать тест", icon: "◆" },
    { id: "test-flow", label: "Ход тестов", icon: "◆" },
    { id: "staff-tests", label: "Контрольные", icon: "◆" },
    { id: "class-stats", label: "Статистика класса", icon: "◆" },
    { id: "errors", label: "Ошибки по вопросам", icon: "◆" },
  ],
  super: [{ id: "super-schools", label: "Школы", icon: "◆" }],
};

const LOGO_SRC = "assets/lavh-logo.png";

function logoImg(size = "md", alt = "LAVH Educational Technology") {
  return `<img class="lavh-logo lavh-logo--${size}" src="${LOGO_SRC}" alt="${escapeHtml(alt)}" decoding="async" />`;
}

const DEMO_ACCOUNTS = [
  {
    label: "Супер-админ",
    school: null,
    login: "superadmin",
    password: "lavh-super-2026",
    uiMode: "super",
  },
  {
    label: "Админ",
    school: "foundation",
    login: "admin",
    password: "admin123",
    uiMode: "admin",
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
  const role = state.session?.user?.role;
  if (state.uiMode === "super" || role === "super_admin") return "Супер-администратор";
  if (role === "teacher") return "Учитель";
  if (role === "admin" || state.uiMode === "admin") return "Администратор";
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
        <span class="sidebar-dock-name">${escapeHtml(name)}</span>
      </button>
      <button type="button" class="sidebar-dock-settings${settingsActive}" id="sidebar-settings-btn" aria-label="Настройки">
        ${SETTINGS_ICON}
      </button>
    </div>`;
}

function schoolNavLabel() {
  return (
    String(state.session?.school_name || state.bundle?.school_name || "").trim() || "Школа"
  );
}

function navItems() {
  let items;
  if (state.uiMode === "super" && state.schoolCode) items = VIEWS.superSchool;
  else if (state.uiMode === "super") items = VIEWS.super;
  else if (state.uiMode === "admin") items = VIEWS.admin;
  else items = VIEWS.student;
  const school = schoolNavLabel();
  if (school && state.session && state.uiMode !== "super") {
    items = items.map((item) => {
      if (item.id === "admin-home" || item.id === "home") {
        return { ...item, label: school };
      }
      return item;
    });
  }
  return items;
}

function isNavItemActive(itemId) {
  const v = state.view;
  if (itemId === v) return true;
  if (itemId === "classes" && ["admin-class", "admin-subject", "admin-exam"].includes(v)) {
    return !portalState.staffTestsShortcut;
  }
  if (itemId === "staff-tests") {
    return v === "staff-tests" || (v === "admin-exam" && portalState.staffTestsShortcut);
  }
  if (itemId === "tests" && portalState.adminView === "exam" && state.uiMode === "student") {
    return true;
  }
  return false;
}

function relabelSchoolNavButtons() {
  const school = schoolNavLabel();
  if (!school || !state.session) return;
  document.querySelectorAll('.nav-btn[data-view="admin-home"], .nav-btn[data-view="home"]').forEach((btn) => {
    btn.innerHTML = `<span class="nav-dot"></span>${escapeHtml(school)}`;
  });
}

function updateShellChrome() {
  const [title, sub] = VIEW_TITLES[state.view] || VIEW_TITLES[portalState.shellView] || ["LAVH TEST", ""];
  const school = schoolNavLabel();
  const staffHome =
    (state.uiMode === "admin" || (state.uiMode === "super" && state.schoolCode)) &&
    (state.view === "admin-home" || portalState.shellView === "admin-home");
  const studentHome = state.uiMode === "student" && (state.view === "home" || portalState.shellView === "home");
  const displayTitle = (staffHome || studentHome) && school ? school : title;
  const h1 = document.querySelector(".main-header h1");
  const lead = document.querySelector(".main-header p");
  if (h1) h1.textContent = displayTitle;
  if (lead) {
    lead.textContent = sub;
    lead.hidden = !sub;
  }
  relabelSchoolNavButtons();
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", isNavItemActive(btn.dataset.view));
  });
  const user = state.session?.user;
  if (user) {
    document
      .getElementById("sidebar-user-btn")
      ?.classList.toggle("is-active", state.view === "profile");
    document
      .getElementById("sidebar-settings-btn")
      ?.classList.toggle("is-active", state.view === "settings");
  }
}

window.__lavhUpdateShellChrome = updateShellChrome;

window.__lavhShellNavigate = async (viewId, adminNav = {}) => {
  if (viewId === "admin-class") {
    state.adminNav = {
      className: adminNav.className,
      subjectCode: null,
      examId: null,
    };
  } else if (viewId === "admin-subject") {
    state.adminNav = {
      className: adminNav.className ?? state.adminNav.className,
      subjectCode: adminNav.subjectCode,
      examId: null,
    };
  } else if (viewId === "admin-exam") {
    state.adminNav = {
      className: adminNav.className ?? state.adminNav.className,
      subjectCode: adminNav.subjectCode ?? state.adminNav.subjectCode,
      examId: adminNav.examId ?? state.adminNav.examId,
    };
  } else {
    state.adminNav = { className: null, subjectCode: null, examId: null };
  }
  state.view = viewId;
  setMobileNavOpen(false);
  lavhSyncPortalNavFromLavhView(viewId, state.adminNav);
  if (document.querySelector(".shell")) {
    updateShellChrome();
    await refreshPortalMain();
  }
  savePageState();
};

function setMobileNavOpen(open) {
  document.querySelector(".shell")?.classList.toggle("nav-open", open);
  document.body.classList.toggle("nav-drawer-open", open);
}

async function switchView(id) {
  if (state.uiMode === "admin" && ["create-test", "classes", "admin-class", "admin-subject"].includes(id)) {
    id = "test-flow";
  }
  if (state.view === id || state.leaving) return;
  if (
    id === "admin-home" ||
    id === "classes" ||
    id === "staff-tests" ||
    id === "class-stats" ||
    id === "errors" ||
    id === "create-test" ||
    id === "super-schools" ||
    id === "school-people" ||
    id === "test-flow" ||
    id === "home" ||
    id === "tests" ||
    id === "results" ||
    id === "progress"
  ) {
    state.adminNav = { className: null, subjectCode: null, examId: null };
    portalState.staffTestsShortcut = false;
  }
  setMobileNavOpen(false);
  state.leaving = true;
  const stage = document.querySelector(".main-panel");
  if (stage) stage.classList.add("is-leaving");
  await new Promise((r) => setTimeout(r, 280));
  state.view = id;
  state.leaving = false;
  savePageState();
  renderShell();
}

async function login(loginVal, password, uiMode, schoolHint = null) {
  const superSession = await authenticateSuperAdmin(loginVal, password);
  if (superSession) {
    clearActiveSchoolCode();
    state.schoolCode = "";
    if (window.portalState) window.portalState.schoolCode = "";
    persistDemoSession(superSession);
    state.session = superSession;
    state.uiMode = "super";
    state.userKind = "platform";
    state.schoolCode = "";
    state.view = "super-schools";
    state.adminNav = { className: null, subjectCode: null, examId: null };
    portalDashboardBooted = false;
    savePageState();
    renderShell();
    return;
  }

  let code = String(schoolHint || "").trim().toLowerCase();
  if (!code) {
    const registeredGlobal = findRegisteredUserGlobal(loginVal, password);
    if (registeredGlobal) {
      code = registeredGlobal.school_code || "";
      if (!code) throw new Error("school_not_assigned");
    } else {
      const resolved = await resolveDemoUserSchool(loginVal, password);
      if (!resolved) throw new Error("invalid_credentials");
      code = resolved.schoolCode;
    }
  }

  setActiveSchoolCode(code);
  state.schoolCode = code;
  portalDashboardBooted = false;

  const registered = findRegisteredUser(code, loginVal, password);
  if (registered) {
    const bundle = await loadPortalBundle({ fresh: true, schoolCode: code });
    const role = registered.role === "teacher" || registered.role === "admin" ? registered.role : "student";
    state.session = {
      user: {
        id: registered.id,
        login: registered.login,
        full_name: registered.full_name,
        role,
        class_name: registered.class_name ?? null,
      },
      school_name: bundle.school_name,
      school_code: code,
    };
    persistDemoSession(state.session);
    state.uiMode = role === "student" ? "student" : "admin";
    state.userKind = "public";
    state.view = defaultViewForMode(state.uiMode);
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
  const role = session.user.role === "teacher" ? "admin" : session.user.role;
  if (role === "admin") session.user.role = "admin";
  state.uiMode = uiMode || (role === "admin" ? "admin" : "student");
  state.view = defaultViewForMode(state.uiMode);
  state.adminNav = { className: null, subjectCode: null, examId: null };
  state.bundle = await loadPortalBundle({ fresh: true, schoolCode: code });
  savePageState();
  renderShell();
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" });
  clearActiveSchoolCode();
  state.session = null;
  state.schoolCode = "";
  state.exam = null;
  portalDashboardBooted = false;
  renderAuth();
}

async function ensurePortalRuntime() {
  if (!portalRuntimeReady) {
    await lavhInitPortalRuntime();
    portalRuntimeReady = true;
  }
}

async function refreshPortalMain() {
  await ensurePortalRuntime();
  portalState.session = state.session;
  portalState.schoolCode = state.schoolCode || getActiveSchoolCode() || "";
  portalState.teacherUiMode = false;
  window.portalState = portalState;

  if (state.session?.user?.role === "super_admin" && !state.schoolCode) {
    updateShellChrome();
    savePageState();
    return;
  }

  if (!portalDashboardBooted) {
    portalDashboardBooted = true;
    await lavhRenderPortalDashboard(state.session, state.view);
    savePageState();
    return;
  }

  lavhSyncPortalNavFromLavhView(state.view, state.adminNav);
  if (state.session?.user?.role === "student" && portalState.adminView === "exam") {
    state.view = "tests";
    updateShellChrome();
  }
  const role = state.session?.user?.role;
  if (role === "super_admin" && state.schoolCode) {
    await renderAdminFlow();
  } else if (role === "admin" || state.session?.user?.role === "teacher") {
    await renderAdminFlow();
  } else if (role === "student") {
    await renderStudentFlow();
  }
  savePageState();
}

function isPortalShellView() {
  const v = state.view;
  if (state.uiMode === "super" && !state.schoolCode) return false;
  if (v === "super-schools" || v === "school-people") return false;
  return v !== "profile" && v !== "settings";
}

async function enterSuperSchool(code) {
  const schoolCode = String(code || "").trim().toLowerCase();
  if (!schoolCode) return;
  setActiveSchoolCode(schoolCode);
  state.schoolCode = schoolCode;
  portalDashboardBooted = false;
  const bundle = await loadPortalBundle({ fresh: true, schoolCode });
  state.session.school_code = schoolCode;
  state.session.school_name = bundle.school_name;
  persistDemoSession(state.session);
  state.view = "admin-home";
  state.adminNav = { className: null, subjectCode: null, examId: null };
  state.bundle = bundle;
  window.__lavhPendingPortalNav = null;
  savePageState();
  renderShell();
}

async function exitSuperSchool() {
  clearActiveSchoolCode();
  state.schoolCode = "";
  state.session.school_code = null;
  state.session.school_name = null;
  state.view = "super-schools";
  state.adminNav = { className: null, subjectCode: null, examId: null };
  portalDashboardBooted = false;
  invalidatePortalBundleCache();
  persistDemoSession(state.session);
  savePageState();
  renderShell();
}

const AUTH_ERRORS = {
  login_short: "Логин не короче 3 символов",
  password_short: "Пароль не короче 6 символов",
  login_taken: "Такой логин уже занят",
  password_mismatch: "Пароли не совпадают",
  school_required: "Укажите код школы",
  school_not_found: "Школа не найдена. Проверьте код.",
  school_not_assigned: "Школу ещё не назначил супер-админ. Войти можно после назначения.",
  user_not_found: "Регистрация не найдена.",
  role_invalid: "Выберите роль: ученик, учитель или админ.",
  class_required: "Для ученика выберите класс.",
  save_failed: "Не удалось записать пользователей в данные сайта.",
};

function authErrorMessage(err) {
  if (err?.message === "invalid_credentials") return "Неверный логин или пароль";
  if (err?.message === "school_required") return AUTH_ERRORS.school_required;
  if (err?.message === "school_not_found") return AUTH_ERRORS.school_not_found;
  return AUTH_ERRORS[err?.message] || "Неверный логин или пароль";
}

async function renderAuth(options = {}) {
  const error = typeof options === "string" ? options : options.error || "";
  const registerOk = options.registerOk || null;
  const showRegister = (options.authPanel || "login") === "register";

  const loginCard = `
    <form class="auth-card auth-panel" id="login-form" ${showRegister ? 'hidden' : ""}>
      <h2>Вход</h2>
      <p class="sub">Логин и пароль — школа определяется автоматически</p>
      ${registerOk ? `<p class="auth-success">Аккаунт создан. Логин: <strong>${escapeHtml(registerOk.login)}</strong>. ${registerOk.waitingSchool ? "Войти можно после того, как супер-админ назначит школу." : "Войдите ниже."}</p>` : ""}
      ${error && !showRegister ? `<p class="auth-error">${escapeHtml(error)}</p>` : ""}
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
      <p class="sub">Школу назначит супер-админ</p>
      ${error && showRegister ? `<p class="auth-error">${escapeHtml(error)}</p>` : ""}
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
        <div class="auth-brand">
          <div class="auth-logo-wrap">${logoImg("hero")}</div>
          <h1>LAVH TEST</h1>
        </div>
        <p class="auth-lead">Платформа, которая облегчает работу учителей и помогает точнее контролировать успеваемость учеников — тесты, результаты и аналитика в одном месте.</p>
        <ul class="auth-points">
          <li>
            <span class="auth-point-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 7h8M8 11h8M8 15h5"/><rect x="4" y="3.5" width="16" height="17" rx="2.5"/></svg></span>
            <span><strong>Тесты</strong><small>Создайте работу и отправьте её классу</small></span>
          </li>
          <li>
            <span class="auth-point-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9M12 19V5M19 19v-7"/></svg></span>
            <span><strong>Результаты</strong><small>Кто сдал и какой балл — сразу в таблице</small></span>
          </li>
          <li>
            <span class="auth-point-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg></span>
            <span><strong>Аналитика</strong><small>Ошибки по вопросам и статистика класса</small></span>
          </li>
        </ul>
      </div>
      <div class="auth-column">
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
    </div>`;

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await login(fd.get("login"), fd.get("password"), null);
    } catch (err) {
      renderAuth({
        error: authErrorMessage(err),
        authPanel: "login",
      });
    }
  });

  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("password") !== fd.get("password2")) {
      renderAuth({ error: AUTH_ERRORS.password_mismatch, authPanel: "register" });
      return;
    }
    try {
      const user = registerPublicUser({
        login: fd.get("login"),
        password: fd.get("password"),
        fullName: fd.get("full_name"),
        telegram: fd.get("telegram"),
      });
      await persistPublicUsers();
      renderAuth({
        registerOk: { login: user.login, waitingSchool: true },
        authPanel: "login",
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
      login(acc.login, acc.password, acc.uiMode, acc.school).catch(() =>
        renderAuth({ error: "Ошибка входа", authPanel: "login" })
      );
    });
  });
}

const SUPER_SCHOOL_ERRORS = {
  school_code_invalid: "Код школы: латиница, цифры, дефис (минимум 2 символа).",
  school_name_required: "Укажите название школы.",
  school_exists: "Школа с таким кодом уже есть.",
  admin_login_short: "Логин админа школы — не короче 3 символов.",
  admin_password_short: "Пароль админа школы — не короче 4 символов.",
  forbidden: "Нет доступа.",
};

async function renderSuperSchoolsPanel() {
  portalState.session = state.session;
  window.portalState = portalState;
  let data;
  try {
    data = await api("/api/super/schools");
  } catch {
    return `<div class="lavh-card"><p class="auth-error">Не удалось загрузить список школ.</p></div>`;
  }
  const schools = data.schools || [];
  const rows = schools.length
    ? schools
        .map(
          (s) => `<li class="row-link is-tappable super-school-row" role="button" tabindex="0" data-school-code="${escapeHtml(s.code)}">
        <span class="super-school-copy">
          <span class="row-link-main">${escapeHtml(s.name)} <span class="muted">(${escapeHtml(s.code)})</span></span>
          <span class="super-school-desc">${escapeHtml(s.description || "")}${s.source === "browser" ? " · только в браузере" : ""}</span>
        </span>
      </li>`
        )
        .join("")
    : `<li><span class="muted">Школ пока нет.</span></li>`;

  return `
    <div class="lavh-card super-schools-card">
      <h3>Школы платформы</h3>
      <p class="muted">Откройте школу: там люди без школы, классы и тесты. Новые школы сохраняются в этом браузере (демо).</p>
      <ul class="list-plain super-school-list">${rows}</ul>
    </div>
    <div class="lavh-card super-school-form-card">
      <h3>Добавить школу</h3>
      <form id="form-super-add-school" class="admin-school-form">
        <div class="field-row">
          <label><span>Код</span><input name="code" required placeholder="north-school" minlength="2" maxlength="32" pattern="[a-zA-Z0-9_-]+" /></label>
          <label><span>Название</span><input name="name" required placeholder="СШ № 12" maxlength="80" /></label>
        </div>
        <label class="field"><span>Описание</span><input name="description" placeholder="Кратко о школе" maxlength="160" /></label>
        <h4>Админ школы</h4>
        <div class="field-row">
          <label><span>ФИО</span><input name="admin_full_name" required value="Администратор" /></label>
          <label><span>Логин</span><input name="admin_login" required value="admin" minlength="3" /></label>
          <label><span>Пароль</span><input name="admin_password" required value="admin123" minlength="4" /></label>
        </div>
        <button type="submit" class="btn-primary" style="max-width:260px">Создать школу</button>
        <p class="form-msg" id="super-school-form-msg" hidden role="status"></p>
      </form>
    </div>`;
}

function bindSuperSchools() {
  document.querySelectorAll(".super-school-row").forEach((row) => {
    row.addEventListener("click", () => {
      const code = row.getAttribute("data-school-code");
      void enterSuperSchool(code);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const code = row.getAttribute("data-school-code");
        void enterSuperSchool(code);
      }
    });
  });
  document.getElementById("form-super-add-school")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById("super-school-form-msg");
    const body = Object.fromEntries(new FormData(form).entries());
    if (msg) {
      msg.hidden = true;
      msg.className = "form-msg";
    }
    try {
      await api("/api/super/schools", { method: "POST", body: JSON.stringify(body) });
      state.view = "super-schools";
      renderShell();
    } catch (err) {
      if (msg) {
        msg.hidden = false;
        msg.className = "form-msg err";
        msg.textContent = SUPER_SCHOOL_ERRORS[err.message] || "Не удалось создать школу.";
      }
    }
  });
}

const ROLE_LABELS = {
  student: "Ученик",
  teacher: "Учитель",
  admin: "Админ",
};

function personRole(user) {
  if (user?.role === "teacher" || user?.role === "admin") return user.role;
  return "student";
}

function classOptionsHtml(classes) {
  return (classes || [])
    .map((row) => `<option value="${escapeHtml(row.class_name)}">${escapeHtml(row.class_name)}</option>`)
    .join("");
}

async function renderSchoolPeoplePanel() {
  portalState.session = state.session;
  portalState.schoolCode = state.schoolCode || "";
  window.portalState = portalState;
  let classes = [];
  try {
    classes = await api("/api/portal/classes");
  } catch {
    classes = state.bundle?.classes || [];
  }
  const classOptions = classOptionsHtml(classes);
  const pending = listUnassignedUsers();
  const members = listUsersForSchool(state.schoolCode);
  if (!state.bundle?.demo_users && state.schoolCode) {
    try {
      state.bundle = await loadPortalBundle({ schoolCode: state.schoolCode });
    } catch {
      /* список школы останется из того, что уже есть */
    }
  }
  const removable = new Set(members.map((user) => String(user.login || "").toLowerCase()));
  const schoolPeople = [];
  const seen = new Set();
  for (const user of [...(state.bundle?.demo_users || []), ...members]) {
    const login = String(user?.login || "").toLowerCase();
    if (!login || seen.has(login)) continue;
    seen.add(login);
    schoolPeople.push(user);
  }
  const userOptions = pending.length
    ? pending
        .map((user) => {
          const role = personRole(user);
          return `<button type="button" data-login="${escapeHtml(user.login)}" data-role="${role}"><strong>${escapeHtml(user.full_name || user.login)}</strong> <span class="muted">${escapeHtml(user.login)}</span></button>`;
        })
        .join("")
    : "";
  const memberRows = schoolPeople.length
    ? schoolPeople
        .map((user) => {
          const remove = removable.has(String(user.login || "").toLowerCase())
            ? `<button type="button" class="btn-ghost btn-mini" data-unassign="${escapeHtml(user.login)}">Убрать</button>`
            : "";
          const admin = personRole(user) === "admin" ? " is-admin" : "";
          return `<li class="people-person${admin}">
            <p class="people-person-id"><strong>${escapeHtml(user.full_name || user.login)}</strong><span class="muted">${escapeHtml(user.login)} · ${escapeHtml(ROLE_LABELS[personRole(user)] || "")}${user.class_name ? ` · ${escapeHtml(user.class_name)}` : ""}</span></p>
            ${remove}
          </li>`;
        })
        .join("")
    : `<li class="people-person"><span class="muted">Никого нет.</span></li>`;

  return `
    <div class="lavh-card">
      <h3>Люди</h3>
      <p class="muted">Новый логин создаёт учётку. Кнопка «Имена» у логина подставляет человека, который ещё без школы.</p>
      <form id="form-create-person" class="admin-school-form people-form">
        <div class="field-row">
          <label><span>Роль</span>
            <select name="role" required>
              <option value="student">Ученик</option>
              <option value="teacher">Учитель</option>
              <option value="admin">Админ школы</option>
            </select>
          </label>
          <label><span>Имя</span><input name="full_name" required placeholder="Иванов Иван" /></label>
        </div>
        <div class="field-row">
          <label><span>Логин</span>
            <span class="admin-input-actions">
              <input name="login" required minlength="3" placeholder="латиница" autocomplete="off" />
              <details class="people-pick">
                <summary class="btn-ghost">Имена</summary>
                <div class="people-pick-menu">${userOptions}<p class="muted people-pick-empty" hidden>В этой роли никого нет.</p></div>
              </details>
            </span>
          </label>
          <label id="create-person-password"><span>Пароль</span><input name="password" required minlength="6" placeholder="не короче 6" /></label>
          <label id="create-person-class"><span>Класс</span><select name="class_name" ${classOptions ? "required" : "disabled"}>${classOptions || `<option value="">Нет классов</option>`}</select></label>
        </div>
        <button type="submit" class="btn-primary" style="max-width:260px">Добавить в школу</button>
        <p class="form-msg" hidden role="status"></p>
      </form>
      <details class="people-members-fold">
        <summary class="people-col-label">В этой школе · ${schoolPeople.length}</summary>
        <ul class="list-plain people-members">${memberRows}</ul>
      </details>
    </div>`;
}

function bindSchoolPeople() {
  const form = document.getElementById("form-create-person");
  const classLabel = document.getElementById("create-person-class");
  const passwordLabel = document.getElementById("create-person-password");
  const roleInput = form?.querySelector('[name="role"]');
  const loginInput = form?.querySelector('[name="login"]');
  const nameInput = form?.querySelector('[name="full_name"]');
  const passwordInput = form?.querySelector('[name="password"]');
  const knownLogins = new Set(
    [...(form?.querySelectorAll("[data-login]") || [])].map((btn) => String(btn.getAttribute("data-login") || "").toLowerCase())
  );
  const syncPersonForm = () => {
    const role = roleInput?.value || "student";
    const student = role === "student";
    let visibleNames = 0;
    form?.querySelectorAll(".people-pick-menu [data-login]").forEach((btn) => {
      const show = btn.getAttribute("data-role") === role;
      btn.hidden = !show;
      if (show) visibleNames += 1;
    });
    const emptyNames = form?.querySelector(".people-pick-empty");
    if (emptyNames) emptyNames.hidden = visibleNames > 0;
    const currentLogin = String(loginInput?.value || "").trim().toLowerCase();
    const picked = [...(form?.querySelectorAll(".people-pick-menu [data-login]") || [])].find(
      (btn) => String(btn.getAttribute("data-login") || "").toLowerCase() === currentLogin
    );
    if (picked?.hidden) {
      if (loginInput) loginInput.value = "";
      if (nameInput) nameInput.value = "";
    }
    if (classLabel) classLabel.hidden = !student;
    const classSelect = classLabel?.querySelector("select");
    if (classSelect) classSelect.required = student && !classSelect.disabled;
    const known = knownLogins.has(String(loginInput?.value || "").trim().toLowerCase());
    if (passwordLabel) passwordLabel.hidden = known;
    if (passwordInput) {
      passwordInput.required = !known;
      passwordInput.minLength = known ? 0 : 6;
    }
  };
  roleInput?.addEventListener("change", syncPersonForm);
  loginInput?.addEventListener("input", syncPersonForm);
  form?.querySelectorAll("[data-login]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (loginInput) loginInput.value = btn.getAttribute("data-login") || "";
      if (nameInput) nameInput.value = btn.querySelector("strong")?.textContent || "";
      if (roleInput) roleInput.value = btn.getAttribute("data-role") || "student";
      const pick = form.querySelector(".people-pick");
      if (pick) pick.open = false;
      syncPersonForm();
    });
  });
  syncPersonForm();

  document.querySelectorAll("[data-unassign]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        unassignRegisteredUser(btn.getAttribute("data-unassign"));
        await persistPublicUsers();
        state.view = "school-people";
        renderShell();
      } catch (err) {
        btn.insertAdjacentHTML(
          "afterend",
          `<p class="form-msg err">${escapeHtml(AUTH_ERRORS[err.message] || "Не удалось убрать из школы.")}</p>`
        );
      }
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const msg = form.querySelector(".form-msg");
    const body = Object.fromEntries(new FormData(form).entries());
    const role = String(body.role || "student");
    const login = String(body.login || "").trim();
    if (msg) {
      msg.hidden = true;
      msg.className = "form-msg";
    }
    try {
      if (!ROLE_LABELS[role]) throw new Error("role_invalid");
      if (role === "student" && !String(body.class_name || "").trim()) throw new Error("class_required");
      const known = knownLogins.has(login.toLowerCase());
      if (!known) {
        registerPublicUser({
          role,
          login,
          password: body.password,
          fullName: body.full_name,
        });
      }
      assignRegisteredUserSchool(login, state.schoolCode, {
        role,
        className: role === "student" ? body.class_name : "",
        fullName: body.full_name,
      });
      await persistPublicUsers();
      state.view = "school-people";
      renderShell();
    } catch (err) {
      if (msg) {
        msg.hidden = false;
        msg.className = "form-msg err";
        msg.textContent = AUTH_ERRORS[err.message] || "Не удалось добавить.";
      }
    }
  });
}

async function renderMainContent() {
  const v = state.view;
  if (v === "profile") return renderProfile();
  if (v === "settings") return renderSettings();
  if (v === "super-schools") return await renderSuperSchoolsPanel();
  if (v === "school-people") return await renderSchoolPeoplePanel();
  return "";
}

function renderSettings() {
  return `
    <div class="lavh-card settings-card">
      <h3>Настройки</h3>
      <p class="muted">Дополнительные параметры аккаунта и интерфейса.</p>
      <ul class="settings-list">
        <li><button type="button" class="settings-row" id="settings-open-profile">Профиль</button></li>
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

  return `
    <div class="lavh-card profile-card">
      <div class="profile-head profile-head--plain">
        <h3>${escapeHtml(displayName(user))}</h3>
        <p class="muted">@${escapeHtml(user.login)} · ${escapeHtml(roleLabel())}</p>
      </div>
      <dl class="profile-dl">
        ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}
      </dl>
    </div>`;
}

function bindProfile() {
  /* без загрузки фото */
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
  let tests = [];
  let cls = "";
  let published = false;
  let minutesPer = 15;
  try {
    const bundle = await api("/api/portal/my/exam-bundle");
    tests = (bundle.tests || []).map((t) => ({
      id: t.exam_id,
      title: t.title,
      subject_title: t.subject_title,
      submitted: t.submitted,
    }));
    cls = bundle.class_name;
    published = bundle.published;
    minutesPer = bundle.minutes_per_test ?? 15;
  } catch {
    const subjects = await api("/api/portal/my/subjects");
    cls = subjects.class_name;
    const code = subjects.subjects[0]?.code || "math";
    const data = await api(`/api/portal/class/${encodeURIComponent(cls)}/subjects/${code}/tests`);
    tests = (data.tests || []).map((t) => ({ ...t, id: t.id }));
    published = true;
  }

  return `
    <div class="lavh-card">
      <h3>Тесты класса (${tests.length})</h3>
      <p class="muted">${published ? `≈${minutesPer} мин на тест` : "Ждём публикации администратора"} · ${escapeHtml(cls)}</p>
      <ul class="test-list">
        ${tests
          .map((t) => {
            const done = t.submitted || t.catalog_key === "done";
            const label = t.student_label || (done ? "Сдано" : published ? "К сдаче" : "Скоро");
            return `<li class="test-item ${done ? "done" : ""}" data-exam="${t.id}" data-done="${done ? "1" : "0"}">
              <span>${escapeHtml(t.subject_title ? `${t.subject_title}: ` : "")}${escapeHtml(t.title || "")}</span>
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
      <div class="stat-card yellow stat-card--clickable" role="button" tabindex="0" data-view-jump="class-stats"><small>Контрольная №1</small><div class="big">демо</div><small>аналитика класса</small></div>
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

function openAdminClass(className) {
  state.adminNav = { className, subjectCode: null, examId: null };
  switchView("admin-class");
}

function openAdminSubject(subjectCode) {
  state.adminNav.subjectCode = subjectCode;
  state.adminNav.examId = null;
  switchView("admin-subject");
}

function openAdminExam(examId) {
  state.adminNav.examId = Number(examId);
  switchView("admin-exam");
}

function subjectCodeForExam(ex, subjects) {
  if (ex.subject_code) return ex.subject_code;
  const title = ex.subject_title || "";
  const sub = (subjects || []).find((s) => s.title === title);
  return sub?.code || "";
}

async function renderAdminHome() {
  const classes = await api("/api/portal/classes");
  return `
    <div class="grid-3">
      ${classes
        .map(
          (c, i) =>
            `<div class="stat-card stat-card--clickable ${["yellow", "blue", "pink"][i % 3]}" role="button" tabindex="0" data-admin-class="${escapeHtml(c.class_name)}">
              <small>${escapeHtml(c.class_name)}</small>
              <div class="big">${c.student_count}</div>
              <small>учеников · ${c.test_count} теста</small>
            </div>`
        )
        .join("")}
    </div>
    <p class="muted admin-hint">Нажмите на карточку класса, чтобы открыть предметы, время и публикацию тестов.</p>`;
}

async function renderAdminClassView() {
  const cls = state.adminNav.className;
  if (!cls) return `<p class="muted">Класс не выбран.</p>`;

  const subjectsData = await api(`/api/portal/class/${encodeURIComponent(cls)}/subjects`);
  const subjects = subjectsData.subjects || [];
  let timingData;
  let bundleData;
  try {
    timingData = await api(`/api/portal/class/${encodeURIComponent(cls)}/exam-timing`);
    bundleData = await api(`/api/portal/class/${encodeURIComponent(cls)}/exam-bundle`);
  } catch {
    timingData = { schedule: { total_minutes: 45, test_count: 3, minutes_per_test: 15 } };
    bundleData = { bundle_published: false, exams: [] };
  }
  const sch = timingData.schedule || {};
  const count = sch.test_count ?? bundleData.exams?.length ?? subjects.length;
  const perTest = sch.minutes_per_test ?? Math.max(5, Math.floor((sch.total_minutes || 45) / (count || 1)));
  const published = Boolean(bundleData.bundle_published);
  const exams = bundleData.exams || [];

  const rows = exams.length
    ? exams
        .map((ex, i) => {
          const code = subjectCodeForExam(ex, subjects);
          return `<li class="row-link" role="button" tabindex="0" data-admin-subject="${escapeHtml(code)}">
            <span class="row-link-main">${i + 1}. ${escapeHtml(ex.subject_title || "")}</span>
            <span class="muted">${escapeHtml(ex.title || "")}</span>
          </li>`;
        })
        .join("")
    : subjects
        .map(
          (s, i) =>
            `<li class="row-link" role="button" tabindex="0" data-admin-subject="${escapeHtml(s.code)}">
              <span class="row-link-main">${i + 1}. ${escapeHtml(s.title)}</span>
              <span class="muted">${s.test_count} тест.</span>
            </li>`
        )
        .join("");

  return `
    <button type="button" class="btn-ghost btn-back" data-admin-back="home">← К классам</button>
    <div class="lavh-card admin-class-hub" id="admin-class-panel" data-class-name="${escapeHtml(cls)}">
      <h3>Класс ${escapeHtml(cls)}</h3>
      <p class="muted">Ученик сам выбирает, какой тест сдать. Каждый тест можно сдать один раз.</p>
      <div class="admin-timing-block">
        <p class="muted">Общее время на все тесты (делится поровну): <strong>${count}</strong> тест(а) · ≈ <strong id="admin-timing-per-test">${perTest}</strong> мин на каждый.</p>
        <label class="admin-timing-row">
          <span>Общее время</span>
          <input type="number" id="admin-timing-total" class="admin-timing-input" min="15" max="300" value="${sch.total_minutes ?? 45}" />
          <span class="muted">мин</span>
          <button type="button" class="btn-secondary btn-timing-save" id="btn-save-exam-timing" disabled>✓</button>
        </label>
        <p class="muted" id="admin-timing-preview" data-test-count="${count}"></p>
        <p class="muted admin-msg" id="admin-timing-msg" hidden></p>
      </div>
      <p class="muted">Нажмите строку, чтобы открыть и проверить вопросы теста.</p>
      <ul class="list-plain">${rows}</ul>
      <p class="muted">Статус: <strong>${published ? "опубликованы для учеников" : "ещё не опубликованы"}</strong></p>
      <button type="button" class="btn-primary" id="btn-publish-exam-bundle"${published ? " hidden" : ""}>Опубликовать для учеников</button>
      <p class="muted admin-msg" id="admin-bundle-msg" hidden></p>
    </div>`;
}

async function renderAdminSubjectView() {
  const cls = state.adminNav.className;
  const code = state.adminNav.subjectCode;
  if (!cls || !code) return `<p class="muted">Предмет не выбран.</p>`;

  const data = await api(
    `/api/portal/class/${encodeURIComponent(cls)}/subjects/${encodeURIComponent(code)}/tests`
  );
  const tests = data.tests || [];

  return `
    <button type="button" class="btn-ghost btn-back" data-admin-back="class">← К классу</button>
    <div class="lavh-card">
      <h3>${escapeHtml(data.subject_title || code)}</h3>
      <p class="muted">Класс ${escapeHtml(cls)} · выберите контрольную</p>
      <ul class="list-plain">
        ${tests
          .map(
            (t) =>
              `<li class="row-link" role="button" tabindex="0" data-admin-exam="${t.id}">
                <span class="row-link-main">${escapeHtml(t.control_date || "")} · ${escapeHtml(t.title)}</span>
                <span class="muted">${t.question_count ?? "—"} вопр.</span>
              </li>`
          )
          .join("")}
      </ul>
    </div>`;
}

async function renderAdminExamView() {
  const examId = state.adminNav.examId;
  if (!examId) return `<p class="muted">Тест не выбран.</p>`;

  const data = await api(`/api/portal/exams/${examId}/admin`);
  const ex = data.exam;
  const students = data.students || [];

  return `
    <button type="button" class="btn-ghost btn-back" data-admin-back="subject">← К предметам</button>
    <div class="lavh-card">
      <h3>${escapeHtml(ex?.title || "Контрольная")}</h3>
      <p class="muted">${escapeHtml(ex?.subject_title || "")} · класс ${escapeHtml(ex?.class_name || "")}</p>
      <div class="metric-row">
        <div class="metric-chip"><strong>${data.submitted_count ?? 0}/${data.class_total ?? 0}</strong>сдали</div>
        <div class="metric-chip"><strong>${ex?.question_count ?? "—"}</strong>вопросов</div>
        <div class="metric-chip"><strong>${ex?.duration_minutes ?? "—"} мин</strong>лимит</div>
      </div>
    </div>
    <div class="lavh-card" style="margin-top:16px">
      <h3>Ученики</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ФИО</th><th>Статус</th><th>Балл</th></tr></thead>
          <tbody>
            ${students
              .map(
                (s) =>
                  `<tr><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.status_label || s.status || "—")}</td><td>${s.score_percent != null ? `${s.score_percent}%` : "—"}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="lavh-card" style="margin-top:16px">
      <h3>Вопросы теста</h3>
      <ol class="admin-question-list">
        ${(data.questions || [])
          .slice(0, 8)
          .map((q) => `<li>${escapeHtml(q.text)}</li>`)
          .join("")}
        ${(data.questions || []).length > 8 ? `<li class="muted">… и ещё ${data.questions.length - 8}</li>` : ""}
      </ol>
    </div>`;
}

async function renderAdminClasses() {
  const classes = await api("/api/portal/classes");
  return `
    <div class="lavh-card">
      <h3>Классы</h3>
      <ul class="list-plain">
        ${classes
          .map(
            (c) =>
              `<li class="row-link" role="button" tabindex="0" data-admin-class="${escapeHtml(c.class_name)}">
                <span class="row-link-main">${escapeHtml(c.class_name)}</span>
                <span class="muted">${c.student_count} уч. · ${c.test_count} тестов</span>
              </li>`
          )
          .join("")}
      </ul>
    </div>`;
}

function bindAdminNavigation() {
  document.querySelectorAll("[data-admin-class]").forEach((el) => {
    const go = () => openAdminClass(el.getAttribute("data-admin-class"));
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });

  document.querySelectorAll("[data-admin-subject]").forEach((el) => {
    const go = () => openAdminSubject(el.getAttribute("data-admin-subject"));
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });

  document.querySelectorAll("[data-admin-exam]").forEach((el) => {
    el.addEventListener("click", () => openAdminExam(el.getAttribute("data-admin-exam")));
  });

  document.querySelectorAll("[data-admin-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-admin-back");
      if (target === "home") switchView("admin-home");
      else if (target === "class") switchView("admin-class");
      else if (target === "subject") switchView("admin-subject");
    });
  });

  const panel = document.getElementById("admin-class-panel");
  if (!panel) return;
  const className = panel.getAttribute("data-class-name");
  const totalInput = panel.querySelector("#admin-timing-total");
  const saveBtn = panel.querySelector("#btn-save-exam-timing");
  const preview = panel.querySelector("#admin-timing-preview");
  const perTestEl = panel.querySelector("#admin-timing-per-test");
  const timingMsg = panel.querySelector("#admin-timing-msg");
  const testCount = Number(preview?.getAttribute("data-test-count")) || 3;
  let savedTotal = Number(totalInput?.value) || 45;

  const refreshTiming = () => {
    const total = Number(totalInput?.value) || 45;
    const per = Math.max(5, Math.floor(total / testCount));
    if (perTestEl) perTestEl.textContent = String(per);
    if (preview) preview.textContent = `${total} мин ÷ ${testCount} = ${per} мин на тест.`;
    if (saveBtn) saveBtn.disabled = total === savedTotal;
  };
  totalInput?.addEventListener("input", refreshTiming);
  refreshTiming();

  saveBtn?.addEventListener("click", async () => {
    const total = Number(totalInput?.value);
    saveBtn.disabled = true;
    try {
      await api(`/api/portal/class/${encodeURIComponent(className)}/exam-timing`, {
        method: "POST",
        body: JSON.stringify({ total_minutes: total }),
      });
      savedTotal = total;
      if (timingMsg) {
        timingMsg.hidden = false;
        timingMsg.textContent = "Время сохранено.";
      }
      refreshTiming();
    } catch {
      if (timingMsg) {
        timingMsg.hidden = false;
        timingMsg.textContent = "Не удалось сохранить.";
      }
    } finally {
      refreshTiming();
    }
  });

  panel.querySelector("#btn-publish-exam-bundle")?.addEventListener("click", async () => {
    const pubBtn = panel.querySelector("#btn-publish-exam-bundle");
    const pubMsg = panel.querySelector("#admin-bundle-msg");
    pubBtn.disabled = true;
    try {
      await api(`/api/portal/class/${encodeURIComponent(className)}/exam-bundle`, {
        method: "POST",
        body: JSON.stringify({ action: "publish" }),
      });
      if (pubMsg) {
        pubMsg.hidden = false;
        pubMsg.textContent = "Тесты опубликованы для учеников.";
      }
      pubBtn.hidden = true;
      switchView("admin-class");
    } catch {
      if (pubMsg) {
        pubMsg.hidden = false;
        pubMsg.textContent = "Не удалось опубликовать.";
      }
    } finally {
      pubBtn.disabled = false;
    }
  });
}

const VIEW_TITLES = {
  home: ["Личный кабинет ученика", ""],
  tests: ["Мои тесты", ""],
  exam: ["Прохождение теста", ""],
  results: ["Результаты", ""],
  progress: ["Прогресс", ""],
  editor: ["Редактор", ""],
  "class-stats": ["Статистика класса", ""],
  errors: ["Агрегация ошибок", ""],
  "admin-home": ["Обзор", ""],
  "admin-class": ["Класс", ""],
  "admin-subject": ["Предмет", ""],
  "admin-exam": ["Контрольная", ""],
  classes: ["Классы", ""],
  "staff-tests": ["Контрольные", ""],
  "create-test": ["Создать тест", ""],
  "test-flow": ["Ход тестов", ""],
  "super-schools": ["Школы платформы", ""],
  "school-people": ["Люди школы", ""],
  profile: ["Профиль", ""],
  settings: ["Настройки", ""],
};

async function renderShell() {
  const user = state.session?.user;
  const [title, sub] = VIEW_TITLES[state.view] || ["LAVH TEST", ""];
  const portalView = Boolean(user && isPortalShellView());
  const content = portalView ? "" : await renderMainContent();
  const superBar =
    state.uiMode === "super" && state.schoolCode
      ? `<div class="super-school-bar">
      <button type="button" class="btn-ghost" id="btn-super-exit-school">← Все школы</button>
      <span>Школа: <strong>${escapeHtml(state.session?.school_name || state.schoolCode)}</strong> <span class="muted">(${escapeHtml(state.schoolCode)})</span></span>
    </div>`
      : "";

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
              `<button type="button" class="nav-btn ${isNavItemActive(item.id) ? "active" : ""}" data-view="${item.id}"><span class="nav-dot"></span>${escapeHtml(item.label)}</button>`
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
            <p ${sub ? "" : "hidden"}>${escapeHtml(sub)}</p>
            <nav class="lavh-breadcrumbs breadcrumbs" id="lavh-breadcrumbs" aria-label="Где вы находитесь" hidden></nav>
          </header>
        </div>
        <div class="main-stage">
          ${superBar}
          <div class="main-panel ${portalView ? "portal-host" : ""}" id="${portalView ? "lavh-portal-main" : "lavh-static-main"}">${content}</div>
        </div>
      </main>
    </div>
    ${PORTAL_MODALS_HTML}`;

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
  document.getElementById("btn-super-exit-school")?.addEventListener("click", () => {
    void exitSuperSchool();
  });
  if (portalView) {
    await refreshPortalMain();
  } else {
    bindProfile();
    bindSettings();
    if (state.view === "super-schools") bindSuperSchools();
    if (state.view === "school-people") bindSchoolPeople();
  }
}

function applyRestoredShellState(session, saved) {
  const role = session.user?.role;
  if (role === "super_admin") {
    state.uiMode = "super";
    state.schoolCode = session.school_code || getActiveSchoolCode() || "";
    if (state.schoolCode) setActiveSchoolCode(state.schoolCode);
    else clearActiveSchoolCode();
  } else {
    state.uiMode = role === "admin" || role === "teacher" ? "admin" : "student";
  }
  if (saved?.view === "teacher-home") saved.view = "admin-home";
  if (saved?.uiMode === "teacher") saved.uiMode = "admin";
  if (saved && savedViewIsUsable(saved, state.uiMode)) {
    state.view = saved.view;
    state.adminNav = {
      className: saved.adminNav?.className || saved.portal?.className || null,
      subjectCode: saved.adminNav?.subjectCode || saved.portal?.subjectCode || null,
      examId: saved.adminNav?.examId ?? saved.portal?.examId ?? null,
    };
    window.__lavhPendingPortalNav =
      saved.view === "profile" || saved.view === "settings" ? null : saved.portal || null;
  } else {
    state.view = defaultViewForMode(state.uiMode);
    state.adminNav = { className: null, subjectCode: null, examId: null };
    window.__lavhPendingPortalNav = null;
  }
}

async function boot() {
  try {
    await loadPublicUsers();
    const session = await api("/api/me");
    state.session = session;
    const saved = readPageState(session);
    applyRestoredShellState(session, saved);

    if (session.user?.role === "super_admin") {
      if (state.schoolCode) {
        state.bundle = await loadPortalBundle({ schoolCode: state.schoolCode });
      }
      renderShell();
      return;
    }

    const schoolCode = session.school_code || getActiveSchoolCode();
    if (!schoolCode) {
      await renderAuth();
      return;
    }
    state.schoolCode = schoolCode;
    setActiveSchoolCode(schoolCode);
    state.bundle = await loadPortalBundle({ schoolCode: state.schoolCode });
    renderShell();
  } catch {
    await renderAuth();
  }
}

boot();
