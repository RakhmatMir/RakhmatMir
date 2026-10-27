/** Данные портала с GitHub (data/portal.json) + сдачи в localStorage. */

import { listUsersForSchool } from "./auth-local.js?v=6";

const PROBLEM_THRESHOLD = 40;
const SUBMISSIONS_KEY = "portal_site_submissions_v1";
const SUBMISSIONS_RESET_ACK_KEY = "portal_submissions_reset_ack_v1";
const SUBMISSIONS_SYNC_FP_KEY = "portal_submissions_sync_fingerprint";
const TEACHER_REPORTS_KEY = "portal_site_teacher_reports_v1";
const EXAM_DRAFTS_KEY = "portal_exam_drafts_v2";
const EXAM_SCHEDULE_KEY = "portal_exam_schedule_v1";
const DEMO_SESSION_KEY = "portal_demo_session_v1";
const ACTIVE_SCHOOL_SESSION_KEY = "lavh_active_school_v1";
const CUSTOM_SCHOOLS_REGISTRY_KEY = "portal_custom_schools_registry_v1";
const CUSTOM_SCHOOL_BUNDLE_PREFIX = "portal_custom_school_bundle_v1::";

let superAdminConfigPromise = null;

const SUPER_ADMIN_DEFAULTS = {
  login: "superadmin",
  password: "lavh-super-2026",
  full_name: "Супер-администратор LAVH",
};
const BUNDLE_SUBJECT_ORDER = ["math", "russian", "english"];

const PRACTICE_TESTS = [
  {
    id: 801,
    subject_title: "Математика",
    title: "Практика — математика",
    duration_minutes: 10,
    questions: [
      { text: "7 × 8 =", options: ["54", "56", "64", "48"], correct_index: 1 },
      { text: "15 + 27 =", options: ["32", "42", "40", "52"], correct_index: 1 },
      { text: "Половина от 18:", options: ["6", "8", "9", "12"], correct_index: 2 },
    ],
  },
  {
    id: 802,
    subject_title: "Русский язык",
    title: "Практика — русский язык",
    duration_minutes: 10,
    questions: [
      { text: "В каком слове пишется «жи»?", options: ["жыраф", "жизнь", "жывот", "жырный"], correct_index: 1 },
      { text: "Укажите имя существительное.", options: ["бежать", "синий", "школа", "быстро"], correct_index: 2 },
      { text: "Сколько гласных в слове «урок»?", options: ["1", "2", "3", "4"], correct_index: 1 },
    ],
  },
  {
    id: 803,
    subject_title: "Английский язык",
    title: "Практика — английский",
    duration_minutes: 10,
    questions: [
      { text: "I ___ a student.", options: ["is", "am", "are", "be"], correct_index: 1 },
      { text: "She ___ to school every day.", options: ["go", "going", "goes", "gone"], correct_index: 2 },
      { text: "This is ___ book.", options: ["a", "an", "two", "much"], correct_index: 0 },
    ],
  },
  {
    id: 804,
    subject_title: "Математика",
    title: "Практика — дроби",
    duration_minutes: 10,
    questions: [
      { text: "1/2 + 1/2 =", options: ["1", "2", "1/4", "1/2"], correct_index: 0 },
      { text: "3 × 0 =", options: ["0", "3", "1", "30"], correct_index: 0 },
      { text: "100 − 1 =", options: ["90", "99", "101", "89"], correct_index: 1 },
    ],
  },
  {
    id: 805,
    subject_title: "Русский язык",
    title: "Практика — орфография",
    duration_minutes: 10,
    questions: [
      { text: "Выберите правильное написание.", options: ["обед", "обеддь", "обьед", "обедд"], correct_index: 0 },
      { text: "Приставка в слове «подъезд»:", options: ["под", "подъ", "езд", "поезд"], correct_index: 0 },
      { text: "Антоним к слову «горячий»:", options: ["тёплый", "холодный", "жаркий", "кипящий"], correct_index: 1 },
    ],
  },
];

function practiceTestById(examId) {
  return PRACTICE_TESTS.find((test) => test.id === Number(examId)) || null;
}

const bundlePromises = new Map();
let schoolsIndexPromise = null;

export function getActiveSchoolCode() {
  if (window.portalState?.schoolCode) {
    return String(window.portalState.schoolCode).trim().toLowerCase();
  }
  try {
    return String(sessionStorage.getItem(ACTIVE_SCHOOL_SESSION_KEY) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function setActiveSchoolCode(code) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) throw new Error("school_required");
  try {
    sessionStorage.setItem(ACTIVE_SCHOOL_SESSION_KEY, c);
  } catch {
    /* ignore */
  }
  if (window.portalState) window.portalState.schoolCode = c;
}

export function clearActiveSchoolCode() {
  try {
    sessionStorage.removeItem(ACTIVE_SCHOOL_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (window.portalState) window.portalState.schoolCode = "";
}

function loadCustomSchoolsRegistry() {
  try {
    const raw = localStorage.getItem(CUSTOM_SCHOOLS_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveCustomSchoolsRegistry(list) {
  localStorage.setItem(CUSTOM_SCHOOLS_REGISTRY_KEY, JSON.stringify(list));
}

function readCustomSchoolBundle(code) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;
  try {
    const raw = localStorage.getItem(`${CUSTOM_SCHOOL_BUNDLE_PREFIX}${c}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCustomSchoolBundle(code, bundle) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) throw new Error("school_required");
  localStorage.setItem(`${CUSTOM_SCHOOL_BUNDLE_PREFIX}${c}`, JSON.stringify(bundle));
}

function isCustomSchoolCode(code) {
  const c = String(code || "").trim().toLowerCase();
  return loadCustomSchoolsRegistry().some((row) => row.code === c);
}

async function loadSuperAdminConfig() {
  if (!superAdminConfigPromise) {
    superAdminConfigPromise = fetch(`${dataBasePath()}/super-admin.json?v=2`, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((cfg) => {
        if (cfg?.login && cfg?.password) return cfg;
        return { ...SUPER_ADMIN_DEFAULTS };
      });
  }
  return superAdminConfigPromise;
}

function normalizeSchoolCodeInput(code) {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function emptySchoolBundle({ schoolName, admin }) {
  return {
    school_name: schoolName,
    classes: [],
    class_schedules: {},
    rosters: {},
    submissions_reset_generation: 1,
    submissions_retention_hours: 24,
    submissions_upload: { enabled: false, github_token: "" },
    cleared_student_ids: [],
    subjects: [
      { code: "math", title: "Математика", test_count: 0 },
      { code: "russian", title: "Русский язык", test_count: 0 },
    ],
    exams: [],
    demo_users: [
      {
        id: 1,
        login: admin.login,
        password: admin.password,
        full_name: admin.full_name,
        role: "admin",
        class_name: null,
      },
    ],
  };
}

export async function authenticateSuperAdmin(login, password) {
  const cfg = await loadSuperAdminConfig();
  const loginNorm = String(login || "").trim().toLowerCase();
  const pwd = String(password || "").trim();
  const cfgLogin = String(cfg?.login || SUPER_ADMIN_DEFAULTS.login).trim().toLowerCase();
  const cfgPwd = String(cfg?.password || SUPER_ADMIN_DEFAULTS.password);
  if (loginNorm !== cfgLogin || pwd !== cfgPwd) return null;
  return {
    user: {
      id: 0,
      login: cfg.login,
      full_name: cfg.full_name || "Супер-администратор",
      role: "super_admin",
      class_name: null,
      subject_code: null,
      subject_title: null,
      staff_title: null,
    },
    school_name: null,
    school_code: null,
  };
}

function scopedStorageKey(base) {
  const sc = getActiveSchoolCode();
  return sc ? `${base}::${sc}` : base;
}

export async function loadSchoolsIndex() {
  if (!schoolsIndexPromise) {
    schoolsIndexPromise = fetch(`${dataBasePath()}/schools/index.json?v=1`, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : { schools: [] }))
      .catch(() => ({ schools: [] }))
      .then((idx) => {
        const merged = [...(idx.schools || [])];
        for (const row of loadCustomSchoolsRegistry()) {
          if (!merged.some((s) => s.code === row.code)) merged.push(row);
        }
        return { schools: merged };
      });
  }
  return schoolsIndexPromise;
}

/** Найти школу и учётку demo_users по логину и паролю (без поля «код школы» на форме). */
export async function resolveDemoUserSchool(login, password) {
  const loginNorm = String(login || "").trim().toLowerCase();
  const pwd = String(password || "");
  if (!loginNorm || !pwd) return null;
  const idx = await loadSchoolsIndex();
  for (const row of idx.schools || []) {
    const schoolCode = String(row.code || "").trim().toLowerCase();
    if (!schoolCode) continue;
    let bundle;
    try {
      bundle = await getMergedBundle({ schoolCode });
    } catch {
      continue;
    }
    const found = (bundle.demo_users || []).find(
      (u) => String(u.login || "").trim().toLowerCase() === loginNorm && u.password === pwd
    );
    if (found) {
      return { schoolCode, user: found, bundle };
    }
  }
  return null;
}

export async function schoolExists(code) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return false;
  if (isCustomSchoolCode(c) || readCustomSchoolBundle(c)) return true;
  const idx = await loadSchoolsIndex();
  if (idx.schools?.some((s) => s.code === c)) return true;
  try {
    const res = await fetch(
      `${dataBasePath()}/schools/${encodeURIComponent(c)}/portal.json?v=1`,
      { method: "GET", cache: "no-cache" }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function dataBasePath() {
  return String(window.PORTAL_DATA_BASE || "data").replace(/\/$/, "");
}

/** Актуальный файл в репо (API-пуш виден сразу; Pages CDN отстаёт). */
const SUBMISSIONS_GITHUB_RAW =
  "https://raw.githubusercontent.com/RakhmatMir/school-portal/main/data/submissions.json";

function parseSubmissionsFromJsonBody(body) {
  if (body?.submissions && typeof body.submissions === "object") {
    return body.submissions;
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  return {};
}

function liveSubmissionsFetchUrls(bust) {
  const t = bust ? Date.now() : 8;
  const urls = [];
  const school = getActiveSchoolCode();
  if (school) {
    urls.push(
      `${dataBasePath()}/schools/${encodeURIComponent(school)}/submissions.json?v=1${bust ? `&_=${t}` : ""}`
    );
  }
  // raw main — сразу после GitHub API PUT; Pages CDN часто отстаёт на часы
  urls.push(`${SUBMISSIONS_GITHUB_RAW}?t=${t}`);
  urls.push(`${dataBasePath()}/submissions.json?v=9${bust ? `&_=${t}` : ""}`);
  return urls;
}

function migrateLocalExamDraftsKey() {
  try {
    localStorage.removeItem("portal_exam_drafts_v1");
  } catch {
    /* ignore */
  }
}

export function invalidatePortalBundleCache(schoolCode) {
  if (schoolCode) bundlePromises.delete(String(schoolCode).trim().toLowerCase());
  else bundlePromises.clear();
}

export async function loadPortalBundle(options = {}) {
  migrateLocalExamDraftsKey();
  const schoolCode = String(options.schoolCode || getActiveSchoolCode() || "").trim().toLowerCase();
  if (!schoolCode) throw new Error("school_required");
  if (options.fresh) invalidatePortalBundleCache(schoolCode);
  if (!bundlePromises.has(schoolCode)) {
    const custom = readCustomSchoolBundle(schoolCode);
    const promise = custom
      ? Promise.resolve(custom)
      : fetch(`${dataBasePath()}/schools/${encodeURIComponent(schoolCode)}/portal.json?v=109`, {
          cache: "no-cache",
        }).then((res) => {
          if (!res.ok) throw new Error("portal_data_load_failed");
          return res.json();
        });
    const wrapped = promise.then((bundle) => {
      enforceSubmissionsReset(bundle);
      enforceClearedStudents(bundle);
      return bundle;
    });
    bundlePromises.set(schoolCode, wrapped);
  }
  return bundlePromises.get(schoolCode);
}

const SCHOOL_EDITS_KEY = "portal_school_edits_v1";

function editsStorageKey(schoolCode) {
  const sc = String(schoolCode || getActiveSchoolCode() || "").trim().toLowerCase();
  return sc ? `${SCHOOL_EDITS_KEY}::${sc}` : SCHOOL_EDITS_KEY;
}

function loadSchoolEdits(schoolCode) {
  try {
    const raw = localStorage.getItem(editsStorageKey(schoolCode));
    const data = raw ? JSON.parse(raw) : null;
    return {
      classes: Array.isArray(data?.classes) ? data.classes : [],
      rosterAdds: data?.rosterAdds && typeof data.rosterAdds === "object" ? data.rosterAdds : {},
      demoUsers: Array.isArray(data?.demoUsers) ? data.demoUsers : [],
      classRemoves: Array.isArray(data?.classRemoves) ? data.classRemoves.map((name) => String(name)) : [],
      rosterRemoves: Array.isArray(data?.rosterRemoves)
        ? data.rosterRemoves.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [],
      examAdds: Array.isArray(data?.examAdds) ? data.examAdds : [],
      teacherRemoves: Array.isArray(data?.teacherRemoves)
        ? data.teacherRemoves.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [],
      teacherPatches: data?.teacherPatches && typeof data.teacherPatches === "object" ? data.teacherPatches : {},
      classRenames: Array.isArray(data?.classRenames) ? data.classRenames : [],
    };
  } catch {
    return {
      classes: [],
      rosterAdds: {},
      demoUsers: [],
      classRemoves: [],
      rosterRemoves: [],
      examAdds: [],
      teacherRemoves: [],
      teacherPatches: {},
      classRenames: [],
    };
  }
}

function saveSchoolEdits(edits, schoolCode) {
  localStorage.setItem(editsStorageKey(schoolCode), JSON.stringify(edits));
}

function cloneBundle(bundle) {
  return JSON.parse(JSON.stringify(bundle));
}

function countExamsForClass(bundle, className) {
  return (bundle.exams || []).filter((ex) => ex.class_name === className).length;
}

function isKeptSchoolAccount(user) {
  return user?.role === "admin" || user?.role === "teacher";
}

function nextExamId(bundle, edits) {
  let max = 200;
  for (const exam of [...(bundle.exams || []), ...(edits.examAdds || [])]) {
    const id = Number(exam?.id);
    if (Number.isFinite(id)) max = Math.max(max, id);
  }
  return max + 1;
}

function nextStudentId(bundle, edits) {
  let max = 100;
  for (const u of bundle.demo_users || []) {
    if (Number.isFinite(Number(u.id))) max = Math.max(max, Number(u.id));
  }
  for (const u of edits.demoUsers || []) {
    if (Number.isFinite(Number(u.id))) max = Math.max(max, Number(u.id));
  }
  for (const list of Object.values(bundle.rosters || {})) {
    for (const row of list || []) {
      if (Number.isFinite(Number(row.id))) max = Math.max(max, Number(row.id));
    }
  }
  for (const list of Object.values(edits.rosterAdds || {})) {
    for (const row of list || []) {
      if (Number.isFinite(Number(row.id))) max = Math.max(max, Number(row.id));
    }
  }
  for (const id of edits.rosterRemoves || []) {
    if (Number.isFinite(Number(id))) max = Math.max(max, Number(id));
  }
  return max + 1;
}

function mergeSchoolEdits(bundle, schoolCode) {
  const base = cloneBundle(bundle);
  const edits = loadSchoolEdits(schoolCode);
  if (!base.rosters) base.rosters = {};
  if (!base.classes) base.classes = [];
  if (!base.demo_users) base.demo_users = [];
  if (!base.class_schedules) base.class_schedules = {};
  if (!base.exams) base.exams = [];

  for (const rename of edits.classRenames || []) {
    const from = String(rename?.from || "").trim();
    const to = String(rename?.to || "").trim();
    if (!from || !to || from === to) continue;
    for (const row of base.classes) if (row.class_name === from) row.class_name = to;
    if (base.rosters[from]) {
      base.rosters[to] = [...(base.rosters[to] || []), ...base.rosters[from]];
      delete base.rosters[from];
    }
    if (base.class_schedules[from]) {
      base.class_schedules[to] = base.class_schedules[from];
      delete base.class_schedules[from];
    }
    for (const exam of base.exams) if (exam.class_name === from) exam.class_name = to;
    for (const user of base.demo_users) if (user.class_name === from) user.class_name = to;
    for (const row of edits.classes || []) if (row.class_name === from) row.class_name = to;
    if (edits.rosterAdds?.[from]) {
      edits.rosterAdds[to] = [...(edits.rosterAdds[to] || []), ...edits.rosterAdds[from]];
      delete edits.rosterAdds[from];
    }
    for (const exam of edits.examAdds || []) if (exam.class_name === from) exam.class_name = to;
    for (const user of edits.demoUsers || []) if (user.class_name === from) user.class_name = to;
    edits.classRemoves = (edits.classRemoves || []).map((name) => (name === from ? to : name));
    for (const patch of Object.values(edits.teacherPatches || {})) {
      if (patch && patch.class_name === from) patch.class_name = to;
    }
  }

  const removedIds = new Set((edits.rosterRemoves || []).map((id) => Number(id)).filter(Number.isFinite));
  const removedClasses = new Set((edits.classRemoves || []).map((name) => String(name)));

  for (const row of edits.classes) {
    const className = String(row.class_name || "").trim();
    if (!className || removedClasses.has(className)) continue;
    if (!base.classes.some((c) => c.class_name === className)) {
      base.classes.push({
        class_name: className,
        student_count: 0,
        test_count: countExamsForClass(base, className),
      });
    }
    if (!base.rosters[className]) base.rosters[className] = [];
    if (!base.class_schedules) base.class_schedules = {};
    if (!base.class_schedules[className]) {
      base.class_schedules[className] = { total_minutes: 45, bundle_published: false };
    }
  }

  for (const [className, adds] of Object.entries(edits.rosterAdds)) {
    if (removedClasses.has(className)) continue;
    if (!base.rosters[className]) base.rosters[className] = [];
    const existingIds = new Set(base.rosters[className].map((r) => Number(r.id)));
    for (const student of adds || []) {
      const sid = Number(student.id);
      if (removedIds.has(sid) || existingIds.has(sid)) continue;
      base.rosters[className].push(student);
      existingIds.add(sid);
    }
  }

  for (const u of edits.demoUsers) {
    if (removedIds.has(Number(u.id)) || removedClasses.has(u.class_name)) continue;
    if (!base.demo_users.some((x) => String(x.login).toLowerCase() === String(u.login).toLowerCase())) {
      base.demo_users.push(u);
    }
  }

  for (const [id, patch] of Object.entries(edits.teacherPatches || {})) {
    const teacher = base.demo_users.find((user) => user.role === "teacher" && Number(user.id) === Number(id));
    if (!teacher || !patch) continue;
    if (patch.full_name) teacher.full_name = String(patch.full_name);
    if (patch.password) teacher.password = String(patch.password);
    if (patch.subject_code !== undefined) teacher.subject_code = patch.subject_code || null;
    if (patch.subject_title !== undefined) teacher.subject_title = patch.subject_title || null;
    if (patch.class_name !== undefined) teacher.class_name = patch.class_name || null;
  }
  const removedTeachers = new Set((edits.teacherRemoves || []).map((id) => Number(id)).filter(Number.isFinite));
  if (removedTeachers.size) {
    base.demo_users = base.demo_users.filter(
      (user) => user.role !== "teacher" || !removedTeachers.has(Number(user.id))
    );
  }

  if (removedIds.size) {
    for (const className of Object.keys(base.rosters)) {
      base.rosters[className] = (base.rosters[className] || []).filter((row) => !removedIds.has(Number(row.id)));
    }
    base.demo_users = base.demo_users.filter((u) => isKeptSchoolAccount(u) || !removedIds.has(Number(u.id)));
  }

  if (removedClasses.size) {
    base.classes = base.classes.filter((c) => !removedClasses.has(c.class_name));
    for (const name of removedClasses) delete base.rosters[name];
    base.demo_users = base.demo_users.filter((u) => isKeptSchoolAccount(u) || !removedClasses.has(u.class_name));
  }

  if (!base.exams) base.exams = [];
  if (!base.subjects) base.subjects = [];
  for (const exam of edits.examAdds || []) {
    if (!exam || exam.id == null) continue;
    const className = String(exam.class_name || "").trim();
    if (!className || removedClasses.has(className)) continue;
    if (base.exams.some((row) => Number(row.id) === Number(exam.id))) continue;
    base.exams.push(exam);
  }
  for (const subject of base.subjects) {
    subject.test_count = base.exams.filter((exam) => exam.subject_code === subject.code).length;
  }

  const publicPeople = listUsersForSchool(schoolCode);
  if (!base.rosters) base.rosters = {};
  if (!base.demo_users) base.demo_users = [];
  for (const person of publicPeople) {
    const login = String(person.login || "").toLowerCase();
    if (!base.demo_users.some((row) => String(row.login || "").toLowerCase() === login)) {
      base.demo_users.push({
        id: person.id,
        login: person.login,
        password: person.password,
        full_name: person.full_name,
        role: person.role === "teacher" || person.role === "admin" ? person.role : "student",
        class_name: person.class_name || null,
      });
    }
    if ((person.role || "student") !== "student" || !person.class_name) continue;
    if (!base.classes.some((row) => row.class_name === person.class_name)) continue;
    if (!base.rosters[person.class_name]) base.rosters[person.class_name] = [];
    const roster = base.rosters[person.class_name];
    if (roster.some((row) => Number(row.id) === Number(person.id))) continue;
    roster.push({
      id: person.id,
      full_name: person.full_name,
      status: "not_started",
      score_percent: null,
    });
  }

  for (const c of base.classes) {
    const roster = base.rosters[c.class_name] || [];
    c.student_count = roster.length;
    c.test_count = countExamsForClass(base, c.class_name);
  }

  return base;
}

export async function getMergedBundle(options = {}) {
  const schoolCode = String(options.schoolCode || getActiveSchoolCode() || "").trim().toLowerCase();
  const base = await loadPortalBundle(schoolCode ? { ...options, schoolCode } : options);
  return mergeSchoolEdits(base, schoolCode);
}

function loadSubmissions() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(SUBMISSIONS_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let forceRemoteSubmissionsFetch = false;

/** Сброс кэша submissions.json (админ: опрос «онлайн»). */
export function invalidateRemoteSubmissionsCache() {
  forceRemoteSubmissionsFetch = true;
}

async function fetchRemoteSubmissionsMap() {
  const bust = forceRemoteSubmissionsFetch;
  forceRemoteSubmissionsFetch = false;
  for (const url of liveSubmissionsFetchUrls(bust)) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.json();
      return parseSubmissionsFromJsonBody(body);
    } catch {
      /* try next url */
    }
  }
  return {};
}

/** Полный submissions.json (meta + submissions) с GitHub raw или Pages. */
export async function fetchLiveSubmissionsDocument() {
  for (const url of liveSubmissionsFetchUrls(true)) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Ученик: local + GitHub. Админ: только GitHub JSON (любой компьютер). */
async function loadSubmissionsForApi(user) {
  const remote = await fetchRemoteSubmissionsMap();
  const local = loadSubmissions();
  if (user?.role === "admin") {
    return { ...local, ...remote };
  }
  return { ...local, ...remote };
}

function saveSubmissions(map) {
  localStorage.setItem(scopedStorageKey(SUBMISSIONS_KEY), JSON.stringify(map));
}

/**
 * Одноразовый сброс всех сдач в браузере при увеличении portal.json → submissions_reset_generation.
 * Позволяет всему классу сдать тесты заново без ручной очистки localStorage.
 */
function enforceSubmissionsReset(bundle) {
  const generation = Number(bundle?.submissions_reset_generation) || 0;
  if (!generation) return;
  let ack = 0;
  try {
    ack = Number(localStorage.getItem(scopedStorageKey(SUBMISSIONS_RESET_ACK_KEY))) || 0;
  } catch {
    /* ignore */
  }
  if (ack >= generation) return;
  try {
    localStorage.removeItem(scopedStorageKey(SUBMISSIONS_KEY));
    localStorage.removeItem(scopedStorageKey(SUBMISSIONS_SYNC_FP_KEY));
    localStorage.setItem(scopedStorageKey(SUBMISSIONS_RESET_ACK_KEY), String(generation));
  } catch {
    /* ignore */
  }
}

/** Удаляет сдачи учеников из localStorage (список в portal.json → cleared_student_ids). */
function enforceClearedStudents(bundle) {
  const ids = new Set((bundle?.cleared_student_ids || []).map((id) => Number(id)).filter(Number.isFinite));
  for (const u of bundle?.demo_users || []) {
    if (u.cleared_submissions) ids.add(Number(u.id));
  }
  if (!ids.size) return;
  const map = loadSubmissions();
  let changed = false;
  for (const key of Object.keys(map)) {
    const colon = key.indexOf(":");
    if (colon < 0) continue;
    const uid = Number(key.slice(colon + 1));
    if (ids.has(uid)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) saveSubmissions(map);
}

function submissionKey(examId, userId) {
  return `${examId}:${userId}`;
}

function submissionKeysForUser(map, userId) {
  const uid = Number(userId);
  const suffixes = new Set([`:${uid}`, `:${userId}`]);
  return Object.keys(map).filter((key) => suffixes.has(key.slice(key.indexOf(":"))));
}

function clearSubmissionsForUser(userId) {
  const map = loadSubmissions();
  const keys = submissionKeysForUser(map, userId);
  const examIds = [];
  for (const key of keys) {
    const examId = Number(key.split(":")[0]);
    if (Number.isFinite(examId)) examIds.push(examId);
    delete map[key];
  }
  saveSubmissions(map);
  return { cleared: keys.length, exam_ids: examIds };
}

function getSubmission(map, examId, userId) {
  return map[submissionKey(examId, userId)] || null;
}

function loadTeacherReports() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(TEACHER_REPORTS_KEY));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveTeacherReports(set) {
  localStorage.setItem(scopedStorageKey(TEACHER_REPORTS_KEY), JSON.stringify([...set]));
}

function loadExamDrafts() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(EXAM_DRAFTS_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExamDrafts(map) {
  localStorage.setItem(scopedStorageKey(EXAM_DRAFTS_KEY), JSON.stringify(map));
}

function getExamDraft(examId) {
  return loadExamDrafts()[String(examId)] || null;
}

function loadExamSchedules() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(EXAM_SCHEDULE_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExamSchedules(map) {
  localStorage.setItem(scopedStorageKey(EXAM_SCHEDULE_KEY), JSON.stringify(map));
}

function defaultClassExamSchedule() {
  return {
    total_minutes: 45,
    bundle_published: false,
  };
}

function classExamBundleList(bundle, className) {
  const order = Object.fromEntries(BUNDLE_SUBJECT_ORDER.map((c, i) => [c, i]));
  return bundle.exams
    .filter((e) => e.class_name === className && !e.manual_publish)
    .sort((a, b) => (order[a.subject_code] ?? 99) - (order[b.subject_code] ?? 99));
}

/** Ученик сдал все тесты набора класса. */
export function studentBundleFullySubmitted(bundle, className, studentId, submissions) {
  const exams = classExamBundleList(bundle, className);
  if (!exams.length) return false;
  for (const ex of exams) {
    if (!getSubmission(submissions, ex.id, studentId)) return false;
  }
  return true;
}

/** Все ученики roster сдали все тесты набора класса (например 18 × 3). */
export function classBundleFullySubmitted(bundle, className, submissions) {
  const roster = bundle?.rosters?.[className] || [];
  if (!roster.length) return false;
  for (const row of roster) {
    if (!studentBundleFullySubmitted(bundle, className, row.id, submissions)) return false;
  }
  return true;
}

function countBundleCompleteStudents(bundle, className, submissions) {
  const roster = classRoster(bundle, className);
  let n = 0;
  for (const row of roster) {
    if (studentBundleFullySubmitted(bundle, className, row.id, submissions)) n++;
  }
  return n;
}

function mapAdminRosterStudents(bundle, className, examId, submissions, teacherAnalyticsReleased) {
  const base = rosterForClass(bundle, className, examId, submissions, {
    releaseResults: true,
  });
  return base.map((row) => ({
    ...row,
    bundle_complete: studentBundleFullySubmitted(bundle, className, row.id, submissions),
  }));
}

function buildStudentSubmissionPreview(bundle, examId, studentId, submissions) {
  const ex = examById(bundle, examId);
  if (!ex) throw new Error("exam_not_found");
  const row = classRoster(bundle, ex.class_name).find((r) => r.id === studentId);
  if (!row) throw new Error("student_not_found");
  const sub = getSubmission(submissions, examId, studentId);
  const student = { ...row, status: sub ? "submitted" : row.status };
  const studentPublic = {
    id: student.id,
    full_name: student.full_name || "",
    login: student.login,
  };
  const submitted = sub != null || student.status === "submitted";
  if (!submitted) {
    return {
      student: studentPublic,
      exam: stripQuestions(examRecord(bundle, examId, "admin") || ex),
      submitted: false,
    };
  }
  const questions = ex.questions || [];
  const picks = answersForStudent(bundle, examId, student, questions, submissions);
  const qt = questionTimesForStudent(bundle, examId, student, questions, submissions);
  const qx = questionExitsForStudent(bundle, examId, student, questions, submissions);
  const qa = questionAwayForStudent(bundle, examId, student, questions, submissions);
  const feedback = questions.map((q, i) => {
    const sel = picks && i < picks.length ? Number(picks[i]) : -1;
    const ok = sel === q.correct_index;
    const fb = {
      selected_index: sel,
      is_correct: ok,
      question: q.text,
    };
    if (qt && i < qt.length) {
      fb.time_seconds = qt[i];
      fb.time_label = formatSecondsLabel(qt[i]);
    }
    if (qx && i < qx.length && qx[i] > 0) fb.exit_count = qx[i];
    if (qa && i < qa.length && qa[i] > 0) {
      fb.away_seconds = qa[i];
      fb.away_label = formatSecondsLabel(qa[i]);
    }
    return fb;
  });
  const correct = feedback.filter((f) => f.is_correct).length;
  const total = questions.length || 1;
  let score;
  let correctCount;
  let questionTotal;
  let durationLabel;
  let exitIntentCount;
  if (sub) {
    score = sub.score_percent;
    correctCount = sub.correct_count ?? correct;
    questionTotal = sub.question_total ?? total;
    durationLabel = sub.duration_label;
    exitIntentCount = Number(sub.exit_intent_count) || 0;
  } else {
    score = student.score_percent;
    if (score == null) score = Math.round((100 * correct) / total);
    correctCount = correct;
    questionTotal = total;
    durationLabel = student.duration_label;
    exitIntentCount = Number(student.exit_intent_count) || 0;
  }
  let exitIntentLabel = null;
  if (exitIntentCount > 0) {
    exitIntentLabel = student.exit_intent_label || `${exitIntentCount} раз`;
  }
  const exView = examRecord(bundle, examId, "admin") || ex;
  return {
    student: studentPublic,
    exam: stripQuestions(exView),
    questions,
    submitted: true,
    score_percent: score,
    correct_count: correctCount,
    question_total: questionTotal,
    duration_label: durationLabel,
    exit_intent_count: exitIntentCount,
    exit_intent_label: exitIntentLabel,
    feedback,
  };
}

function getClassExamSchedule(className, bundle) {
  const defaults = bundle?.class_schedules?.[className] || {};
  const local = loadExamSchedules()[className] || {};
  const total_minutes =
    Number(local.total_minutes) || Number(defaults.total_minutes) || 45;
  const bundle_published =
    Boolean(defaults.bundle_published) || Boolean(local.bundle_published);
  return {
    total_minutes,
    bundle_published,
  };
}

function isClassBundlePublished(className, bundle) {
  return getClassExamSchedule(className, bundle).bundle_published;
}

function classBundleTiming(bundle, className) {
  const exams = classExamBundleList(bundle, className);
  const schedule = getClassExamSchedule(className, bundle);
  const test_count = exams.length || 1;
  const minutes_per_test = Math.max(5, Math.floor(schedule.total_minutes / test_count));
  return {
    ...schedule,
    test_count,
    minutes_per_test,
    exam_ids: exams.map((e) => e.id),
  };
}

function saveClassExamSchedule(className, schedule) {
  const all = loadExamSchedules();
  const prev = all[className] || {};
  all[className] = {
    total_minutes: Number(schedule.total_minutes) || Number(prev.total_minutes) || 45,
    bundle_published:
      schedule.bundle_published !== undefined
        ? Boolean(schedule.bundle_published)
        : Boolean(prev.bundle_published),
    updated_at: new Date().toISOString(),
  };
  saveExamSchedules(all);
  return all[className];
}

function publishClassExamBundle(bundle, className) {
  const timing = classBundleTiming(bundle, className);
  saveClassExamSchedule(className, {
    total_minutes: timing.total_minutes,
    bundle_published: true,
  });
  const drafts = loadExamDrafts();
  for (const ex of classExamBundleList(bundle, className)) {
    const prev = drafts[String(ex.id)] || {};
    const questions = prev.questions?.length ? prev.questions : ex.questions;
    drafts[String(ex.id)] = {
      questions: normalizeExamQuestions(questions),
      published: true,
      duration_minutes: timing.minutes_per_test,
      updated_at: new Date().toISOString(),
    };
  }
  saveExamDrafts(drafts);
  return classBundleTiming(bundle, className);
}

function resolveExamDurationMinutes(bundle, examRow) {
  if (!examRow) return 25;
  return classBundleTiming(bundle, examRow.class_name).minutes_per_test;
}

function nextBundleExamIdForStudent(bundle, className, userId, submissions) {
  if (!isClassBundlePublished(className, bundle)) return null;
  for (const ex of classExamBundleList(bundle, className)) {
    if (!getSubmission(submissions, ex.id, userId)) return ex.id;
  }
  return null;
}

function normalizeExamQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((q) => {
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const rawNotes = Array.isArray(q.option_notes) ? q.option_notes : [];
    const wanted = Number(q.correct_index);
    const options = [];
    const option_notes = [];
    let correct_index = 0;
    rawOptions.forEach((option, index) => {
      const text = String(option ?? "").trim();
      if (!text) return;
      if (index === wanted) correct_index = options.length;
      options.push(text);
      option_notes.push(index === wanted ? "" : String(rawNotes[index] ?? "").trim());
    });
    while (options.length < 2) {
      options.push("");
      option_notes.push("");
    }
    if (!Number.isFinite(wanted) || wanted < 0 || !rawOptions.some((option, index) => index === wanted && String(option ?? "").trim())) {
      correct_index = 0;
      option_notes[0] = "";
    }
    return {
      text: String(q.text || "").trim(),
      options,
      option_notes,
      correct_index,
    };
  });
}

function isAdminRole(role) {
  return role === "admin";
}

function isExamPublishedToStudents(bundle, examId) {
  const base = examById(bundle, examId);
  if (!base) return false;
  if (base.manual_publish) return base.published_to_students === true;
  if (base.published_to_students === true) return true;
  const inBundle = classExamBundleList(bundle, base.class_name).some(
    (e) => Number(e.id) === Number(examId)
  );
  if (inBundle) return isClassBundlePublished(base.class_name, bundle);
  const draft = getExamDraft(examId);
  if (!draft) return false;
  return Boolean(draft.published);
}

function effectiveExamQuestions(bundle, examId, role) {
  const base = examById(bundle, examId);
  if (!base) return [];
  const draft = getExamDraft(examId);
  const staff = isAdminRole(role);
  if (draft?.questions?.length && (staff || draft.published)) {
    return normalizeExamQuestions(draft.questions);
  }
  return normalizeExamQuestions(base.questions);
}

function examRecord(bundle, examId, role) {
  const base = examById(bundle, examId);
  if (!base) return null;
  const questions = effectiveExamQuestions(bundle, examId, role);
  const duration_minutes = resolveExamDurationMinutes(bundle, base);
  return { ...base, questions, question_count: questions.length, duration_minutes };
}

function examById(bundle, examId) {
  return bundle.exams.find((e) => Number(e.id) === Number(examId)) || null;
}

function stripQuestions(ex) {
  const { questions, ...rest } = ex;
  return rest;
}

function rosterSize(bundle, className) {
  return classRoster(bundle, className).length;
}

function examAuthorName(bundle, ex) {
  if (ex.created_by != null) {
    const author = (bundle.demo_users || []).find((user) => Number(user.id) === Number(ex.created_by));
    if (author?.full_name) return author.full_name;
  }
  const classTeacher = (bundle.demo_users || []).find(
    (user) => user.role === "teacher" && user.class_name === ex.class_name
  );
  return classTeacher?.full_name || "Школа";
}

function examFlowStage(ex, published, stats) {
  if (ex.manual_publish && !published) return "created";
  const total = Number(stats.class_total) || 0;
  const submitted = Number(stats.submitted_count) || 0;
  if (total > 0 && submitted >= total) return "done";
  if (submitted > 0) return "solving";
  if (published) return "sent";
  return "created";
}

function testsForClassSubject(bundle, className, subjectCode, submissions) {
  const classTotal = rosterSize(bundle, className);
  return bundle.exams
    .filter((ex) => ex.class_name === className && ex.subject_code === subjectCode)
    .map((ex) => {
      const stats = examStaffTestStats(bundle, ex.id, submissions);
      return {
        id: ex.id,
        title: ex.title,
        control_date: ex.control_date,
        kind_label: ex.kind_label,
        phase: ex.phase,
        catalog_key: ex.catalog_key,
        duration_minutes: ex.duration_minutes,
        question_count: ex.question_count,
        created_by: ex.created_by ?? null,
        manual_publish: Boolean(ex.manual_publish),
        published_to_students: isExamPublishedToStudents(bundle, ex.id),
        submitted_count: stats.submitted_count,
        class_total: stats.class_total || classTotal,
        all_submitted: stats.all_submitted,
        avg_score_percent: stats.avg_score_percent,
      };
    });
}

function staffTestsList(bundle, submissions) {
  return bundle.exams.map((ex) => {
    const published = isExamPublishedToStudents(bundle, ex.id);
    const duration_minutes = resolveExamDurationMinutes(bundle, ex);
    const stats = examStaffTestStats(bundle, ex.id, submissions);
    return {
      id: ex.id,
      class_name: ex.class_name,
      subject_code: ex.subject_code,
      subject_title: ex.subject_title,
      title: ex.title,
      control_date: ex.control_date,
      kind_label: ex.kind_label,
      catalog_key: ex.catalog_key,
      question_count: ex.question_count,
      created_by: ex.created_by ?? null,
      created_by_name: examAuthorName(bundle, ex),
      created_at: ex.created_at || null,
      sent_at: ex.sent_at || null,
      stage: examFlowStage(ex, published, stats),
      submitted_count: stats.submitted_count,
      class_total: stats.class_total || rosterSize(bundle, ex.class_name),
      all_submitted: stats.all_submitted,
      avg_score_percent: stats.avg_score_percent,
      manual_publish: Boolean(ex.manual_publish),
      published_to_students: published,
      duration_minutes,
      requires_teacher_publish: Boolean(ex.requires_teacher_publish),
    };
  });
}

function classRoster(bundle, className) {
  return bundle.rosters[className] || [];
}

function examClassProgress(bundle, examId, submissions) {
  const ex = examById(bundle, examId);
  if (!ex) return { classTotal: 0, submittedCount: 0, allSubmitted: true };
  const roster = classRoster(bundle, ex.class_name);
  const classTotal = roster.length;
  let submittedCount = 0;
  for (const row of roster) {
    if (getSubmission(submissions, examId, row.id)) submittedCount++;
  }
  const allSubmitted = classTotal === 0 || submittedCount >= classTotal;
  return { classTotal, submittedCount, allSubmitted };
}

function examStaffTestStats(bundle, examId, submissions) {
  const progress = examClassProgress(bundle, examId, submissions);
  const ex = examById(bundle, examId);
  let scoreSum = 0;
  let scoreCount = 0;
  if (ex) {
    for (const row of classRoster(bundle, ex.class_name)) {
      const sub = getSubmission(submissions, examId, row.id);
      const pct = Number(sub?.score_percent);
      if (Number.isFinite(pct)) {
        scoreSum += pct;
        scoreCount += 1;
      }
    }
  }
  return {
    submitted_count: progress.submittedCount,
    class_total: progress.classTotal,
    all_submitted: progress.allSubmitted,
    avg_score_percent: scoreCount ? Math.round(scoreSum / scoreCount) : null,
  };
}

function examResultsReleased(bundle, examId, submissions) {
  const ex = examById(bundle, examId);
  if (!ex) return true;
  if (ex.catalog_key === "done") return true;
  return examClassProgress(bundle, examId, submissions).allSubmitted;
}

function rosterForClass(bundle, className, examId, submissions, { releaseResults = true } = {}) {
  const base = classRoster(bundle, className);
  return base.map((row) => {
    const sub = getSubmission(submissions, examId, row.id);
    const out = { ...row };
    if (sub) {
      out.status = "submitted";
      out.results_pending = !releaseResults;
      if (releaseResults) {
        out.score_percent = sub.score_percent;
        out.duration_label = sub.duration_label || out.duration_label;
        out.exit_intent_count = sub.exit_intent_count || 0;
        if (out.exit_intent_count > 0) {
          out.exit_intent_label = `${out.exit_intent_count} раз`;
        }
      } else {
        out.score_percent = null;
        out.duration_label = null;
        out.exit_intent_count = 0;
        out.exit_intent_label = null;
      }
    }
    return out;
  });
}

function demoAnswers(bundle, examId, studentId) {
  const key = `${examId}:${studentId}`;
  return bundle.demo_exam_answers?.[key] || null;
}

function answersForStudent(bundle, examId, student, questions, submissions) {
  const demo = demoAnswers(bundle, examId, student.id);
  if (demo) return demo;
  const sub = getSubmission(submissions, examId, student.id);
  if (sub?.answers) {
    return questions.map((_, i) => Number(sub.answers[String(i)] ?? 0));
  }
  if (student.status !== "submitted") return null;
  const total = questions.length || 1;
  const pct = student.score_percent || 0;
  const wrong = Math.max(0, Math.round((total * (100 - pct)) / 100));
  const picks = questions.map((q) => q.correct_index);
  for (let w = 0; w < Math.min(wrong, total); w++) {
    const idx = total - 1 - w;
    picks[idx] = (picks[idx] + 1) % 4;
  }
  return picks;
}

function formatSecondsLabel(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${seconds} с`;
}

function parseDurationLabelToSeconds(label) {
  if (label == null || label === "") return null;
  const raw = String(label).trim();
  const clock = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return null;
}

function demoQuestionTimes(bundle, examId, studentId) {
  const key = `${examId}:${studentId}`;
  const arr = bundle.demo_question_times?.[key];
  return Array.isArray(arr) ? arr.map((n) => Number(n)) : null;
}

function demoQuestionAwaySeconds(bundle, examId, studentId) {
  const key = `${examId}:${studentId}`;
  const arr = bundle.demo_question_away_seconds?.[key];
  return Array.isArray(arr) ? arr.map((n) => Number(n)) : null;
}

function demoQuestionExitCounts(bundle, examId, studentId) {
  const key = `${examId}:${studentId}`;
  const arr = bundle.demo_question_exit_counts?.[key];
  return Array.isArray(arr) ? arr.map((n) => Number(n)) : null;
}

function questionAwayForStudent(bundle, examId, student, questions, submissions) {
  const sub = getSubmission(submissions, examId, student.id);
  if (sub?.question_away_seconds?.length) {
    return sub.question_away_seconds.map((n) => Number(n));
  }
  const demo = demoQuestionAwaySeconds(bundle, examId, student.id);
  if (demo?.length) return demo;
  return questions.map(() => 0);
}

function questionExitsForStudent(bundle, examId, student, questions, submissions) {
  const sub = getSubmission(submissions, examId, student.id);
  if (sub?.question_exit_counts?.length) {
    return sub.question_exit_counts.map((n) => Number(n));
  }
  const demo = demoQuestionExitCounts(bundle, examId, student.id);
  if (demo?.length) return demo;
  return questions.map(() => 0);
}

function questionTimesForStudent(bundle, examId, student, questions, submissions) {
  const sub = getSubmission(submissions, examId, student.id);
  if (sub?.question_times?.length) {
    return sub.question_times.map((n) => Number(n));
  }
  const demo = demoQuestionTimes(bundle, examId, student.id);
  if (demo?.length) return demo;
  const totalSec = parseDurationLabelToSeconds(student.duration_label);
  if (totalSec == null || !questions.length) return null;
  const per = Math.max(30, Math.round(totalSec / questions.length));
  return questions.map((_, qi) => per + (qi === questions.length - 1 ? Math.round(per * 0.25) : 0));
}

function buildAnalytics(bundle, examId, questions, students, submissions) {
  const submitted = students.filter((s) => s.status === "submitted");
  const submittedTotal = submitted.length;
  const stats = questions.map((q, qi) => {
    let failed = 0;
    const times = [];
    let questionExitTotal = 0;
    let questionAwayTotal = 0;
    if (submittedTotal) {
      for (const st of submitted) {
        const picks = answersForStudent(bundle, examId, st, questions, submissions);
        const wrong = !picks || qi >= picks.length || picks[qi] !== q.correct_index;
        if (wrong) failed++;
        const qt = questionTimesForStudent(bundle, examId, st, questions, submissions);
        if (qt && qt[qi] != null && qt[qi] >= 0) times.push(qt[qi]);
        const qx = questionExitsForStudent(bundle, examId, st, questions, submissions);
        const qa = questionAwayForStudent(bundle, examId, st, questions, submissions);
        if (qx && qx[qi] > 0) questionExitTotal += qx[qi];
        if (qa && qa[qi] > 0) questionAwayTotal += qa[qi];
      }
    }
    const failedPercent = submittedTotal ? Math.round((100 * failed) / submittedTotal) : 0;
    const avgTimeSec = times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null;
    let questionExitLabel = null;
    if (submittedTotal) {
      if (questionExitTotal === 0) {
        questionExitLabel = "окно: без выходов";
      } else {
        const awayPart =
          questionAwayTotal > 0 ? ` · ${formatSecondsLabel(questionAwayTotal)} вне вкладки` : "";
        questionExitLabel = `окно: ${questionExitTotal} раз${awayPart}`;
      }
    }
    return {
      submitted_total: submittedTotal,
      failed_count: failed,
      failed_percent: failedPercent,
      avg_time_seconds: avgTimeSec,
      avg_time_label: avgTimeSec != null ? formatSecondsLabel(avgTimeSec) : null,
      timed_count: times.length,
      question_exit_total: questionExitTotal,
      question_away_total_seconds: questionAwayTotal,
      question_exit_label: questionExitLabel,
    };
  });
  const problem = [];
  if (submittedTotal) {
    stats.forEach((st, index) => {
      if (st.failed_percent >= PROBLEM_THRESHOLD) {
        problem.push({
          index,
          failed_percent: st.failed_percent,
          avg_time_label: st.avg_time_label,
          question_exit_total: st.question_exit_total,
          question_away_total_seconds: st.question_away_total_seconds,
          question_exit_label: st.question_exit_label,
        });
      }
    });
    problem.sort((a, b) => b.failed_percent - a.failed_percent || a.index - b.index);
  }
  return { stats, problem };
}

function parseBody(options) {
  if (!options.body) return {};
  try {
    return JSON.parse(options.body);
  } catch {
    return {};
  }
}

function publicUser(row) {
  const role = row.role === "teacher" ? "admin" : row.role;
  return {
    id: row.id,
    login: row.login,
    full_name: row.full_name,
    role,
    class_name: row.class_name ?? null,
    subject_code: row.subject_code ?? null,
    subject_title: row.subject_title ?? null,
    staff_title: row.staff_title ?? null,
  };
}

/** Сохранить сессию (школьный или публичный вход) для восстановления после F5. */
export function persistDemoSession(session) {
  if (!session?.user) return;
  if (session.user.role === "super_admin" && !session.school_code) {
    clearActiveSchoolCode();
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    return;
  }
  const schoolCode = session.school_code || getActiveSchoolCode();
  if (schoolCode) session.school_code = schoolCode;
  localStorage.setItem(scopedStorageKey(DEMO_SESSION_KEY), JSON.stringify(session));
}

/** Демо-вход из portal.json. Пароли открыты — только для показа. */
export async function demoAuthApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  if (path === "/api/login" && method === "POST") {
    const body = parseBody(options);
    const login = String(body.login || "").trim();
    const password = String(body.password || "");
    const superSession = await authenticateSuperAdmin(login, password);
    if (superSession) {
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(superSession));
      return superSession;
    }
    const bundle = await getMergedBundle();
    const users = bundle.demo_users || [];
    const found = users.find(
      (u) => u.login.toLowerCase() === login.toLowerCase() && u.password === password
    );
    if (!found) throw new Error("invalid_credentials");
    const schoolCode = getActiveSchoolCode();
    const session = {
      user: publicUser(found),
      school_name: bundle.school_name,
      school_code: schoolCode,
    };
    localStorage.setItem(scopedStorageKey(DEMO_SESSION_KEY), JSON.stringify(session));
    return session;
  }

  if (path === "/api/me" && method === "GET") {
    let raw = localStorage.getItem(DEMO_SESSION_KEY);
    let session = raw ? JSON.parse(raw) : null;
    if (session?.user?.role !== "super_admin") {
      raw = localStorage.getItem(scopedStorageKey(DEMO_SESSION_KEY));
      if (!raw) raw = localStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) throw new Error("not_authenticated");
      session = JSON.parse(raw);
    }
    if (session.user?.role === "super_admin") {
      const active = getActiveSchoolCode();
      if (session.school_code && active && session.school_code !== active) {
        throw new Error("not_authenticated");
      }
      if (active && session.school_code !== active) {
        session.school_code = active;
        try {
          const bundle = await getMergedBundle({ schoolCode: active });
          session.school_name = bundle.school_name;
        } catch {
          /* ignore */
        }
      }
      localStorage.setItem(scopedStorageKey(DEMO_SESSION_KEY) || DEMO_SESSION_KEY, JSON.stringify(session));
      return session;
    }
    const bundle = await getMergedBundle();
    const active = getActiveSchoolCode();
    if (session.school_code && active && session.school_code !== active) {
      throw new Error("not_authenticated");
    }
    const fresh = (bundle.demo_users || []).find((user) => Number(user.id) === Number(session.user?.id));
    if (!fresh) throw new Error("not_authenticated");
    session.user = publicUser(fresh);
    localStorage.setItem(scopedStorageKey(DEMO_SESSION_KEY), JSON.stringify(session));
    return session;
  }

  if (path === "/api/logout" && method === "POST") {
    localStorage.removeItem(scopedStorageKey(DEMO_SESSION_KEY));
    localStorage.removeItem(DEMO_SESSION_KEY);
    return { status: "ok" };
  }

  throw new Error("not_found");
}

function currentUser() {
  const session = window.portalState?.session;
  return session?.user || null;
}

function isPortalStaff(user) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "teacher") return true;
  if (user.role === "super_admin" && getActiveSchoolCode()) return true;
  return false;
}

function canManageSchoolApi(user) {
  return user?.role === "admin" || user?.role === "super_admin";
}

function canManageClassRoster(user, className) {
  if (!user || !className) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  return user.role === "teacher" && user.class_name === className;
}

function canViewExamAsStaff(user, ex) {
  if (!user || !ex) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (user.role !== "teacher") return false;
  if (ex.created_by != null && Number(ex.created_by) === Number(user.id)) return true;
  return Boolean(user.class_name) && ex.class_name === user.class_name;
}

async function handleSuperAdminApi(path, method, options, user) {
  if (user?.role !== "super_admin") throw new Error("forbidden");

  if (path === "/api/super/schools" && method === "GET") {
    const idx = await loadSchoolsIndex();
    const customCodes = new Set(loadCustomSchoolsRegistry().map((r) => r.code));
    return {
      schools: (idx.schools || []).map((row) => ({
        ...row,
        source: customCodes.has(row.code) ? "browser" : "site",
      })),
    };
  }

  if (path === "/api/super/schools" && method === "POST") {
    const body = parseBody(options);
    const code = normalizeSchoolCodeInput(body.code);
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const adminName = String(body.admin_full_name || body.admin_name || "Администратор школы").trim();
    const adminLogin = String(body.admin_login || "admin").trim().toLowerCase();
    const adminPassword = String(body.admin_password || "admin123");
    if (!code || code.length < 2) throw new Error("school_code_invalid");
    if (!name) throw new Error("school_name_required");
    if (adminLogin.length < 3) throw new Error("admin_login_short");
    if (adminPassword.length < 4) throw new Error("admin_password_short");
    if (await schoolExists(code)) throw new Error("school_exists");
    const registry = loadCustomSchoolsRegistry();
    registry.push({
      code,
      name,
      description: description || `Школа ${name}`,
      created_at: new Date().toISOString(),
    });
    saveCustomSchoolsRegistry(registry);
    writeCustomSchoolBundle(
      code,
      emptySchoolBundle({
        schoolName: name,
        admin: { login: adminLogin, password: adminPassword, full_name: adminName },
      })
    );
    schoolsIndexPromise = null;
    invalidatePortalBundleCache(code);
    return { ok: true, code, name };
  }

  const patchMatch = path.match(/^\/api\/super\/schools\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    const code = decodeURIComponent(patchMatch[1]).toLowerCase();
    const body = parseBody(options);
    const registry = loadCustomSchoolsRegistry();
    const row = registry.find((s) => s.code === code);
    if (!row) throw new Error("school_not_custom");
    if (body.name != null) row.name = String(body.name).trim() || row.name;
    if (body.description != null) row.description = String(body.description).trim();
    saveCustomSchoolsRegistry(registry);
    const bundle = readCustomSchoolBundle(code);
    if (bundle && body.name) {
      bundle.school_name = row.name;
      writeCustomSchoolBundle(code, bundle);
    }
    schoolsIndexPromise = null;
    invalidatePortalBundleCache(code);
    return { ok: true, school: row };
  }

  throw new Error("not_found");
}

export async function dataApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const user = currentUser();

  if (path.startsWith("/api/super/")) {
    return handleSuperAdminApi(path, method, options, user);
  }

  const bundle = await getMergedBundle();
  enforceClearedStudents(bundle);
  const submissions = await loadSubmissionsForApi(user);
  const teacherReports = loadTeacherReports();

  if (path === "/api/public/landing" && method === "GET") {
    return { has_schools: true, school_name: bundle.school_name };
  }

  if (path === "/api/portal/classes" && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    return bundle.classes;
  }

  if (path === "/api/portal/classes" && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const body = parseBody(options);
    const class_name = String(body.class_name || "").trim();
    if (!class_name) throw new Error("class_name_required");
    if (bundle.classes.some((c) => c.class_name === class_name)) throw new Error("class_exists");
    const edits = loadSchoolEdits();
    edits.classRemoves = (edits.classRemoves || []).filter((name) => name !== class_name);
    if (!edits.classes.some((c) => c.class_name === class_name)) edits.classes.push({ class_name });
    if (!edits.rosterAdds[class_name]) edits.rosterAdds[class_name] = [];
    saveSchoolEdits(edits);
    return { ok: true, class_name, student_count: 0, test_count: 0 };
  }

  const classDeleteMatch = path.match(/^\/api\/portal\/class\/([^/]+)$/);
  if (classDeleteMatch && method === "DELETE") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const cls = decodeURIComponent(classDeleteMatch[1]);
    if (!bundle.classes.some((c) => c.class_name === cls)) throw new Error("class_not_found");
    const edits = loadSchoolEdits();
    const ids = (bundle.rosters?.[cls] || []).map((row) => Number(row.id)).filter(Number.isFinite);
    edits.classes = (edits.classes || []).filter((c) => c.class_name !== cls);
    delete edits.rosterAdds[cls];
    edits.demoUsers = (edits.demoUsers || []).filter((u) => u.class_name !== cls && !ids.includes(Number(u.id)));
    if (!edits.classRemoves.includes(cls)) edits.classRemoves.push(cls);
    for (const id of ids) {
      if (!edits.rosterRemoves.includes(id)) edits.rosterRemoves.push(id);
    }
    saveSchoolEdits(edits);
    return { ok: true, class_name: cls };
  }

  let m = path.match(/^\/api\/portal\/class\/([^/]+)\/roster$/);
  if (m && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    const cls = decodeURIComponent(m[1]);
    const roster = classRoster(bundle, cls);
    const canSeeCredentials = canManageClassRoster(user, cls);
    const credById = new Map();
    for (const account of bundle.demo_users || []) {
      if (account && account.id != null) {
        credById.set(Number(account.id), {
          login: String(account.login || ""),
          password: String(account.password || ""),
        });
      }
    }
    const students = roster.map((row) => {
      const cred = credById.get(Number(row.id));
      return {
        ...row,
        login: canSeeCredentials ? cred?.login || "" : "",
        password: canSeeCredentials ? cred?.password || "" : "",
      };
    });
    return {
      class_name: cls,
      students,
      taken_logins: [...credById.values()].map((cred) => cred.login.toLowerCase()).filter(Boolean),
    };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/students$/);
  if (m && method === "POST") {
    const cls = decodeURIComponent(m[1]);
    if (!canManageClassRoster(user, cls)) throw new Error("forbidden");
    if (!bundle.classes.some((c) => c.class_name === cls)) throw new Error("class_not_found");
    const body = parseBody(options);
    const full_name = String(body.full_name || "").trim();
    const login = String(body.login || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    if (!full_name || login.length < 3) throw new Error("student_invalid");
    const edits = loadSchoolEdits();
    const allLogins = new Set(
      [...(bundle.demo_users || []), ...(edits.demoUsers || [])].map((u) =>
        String(u.login).toLowerCase()
      )
    );
    if (allLogins.has(login)) throw new Error("login_taken");
    const id = nextStudentId(bundle, edits);
    const pwd = password || `${login}-${id}`;
    const rosterRow = {
      id,
      full_name,
      status: "not_started",
      score_percent: null,
    };
    const demoUser = {
      id,
      login,
      password: pwd,
      full_name,
      role: "student",
      class_name: cls,
    };
    if (!edits.rosterAdds[cls]) edits.rosterAdds[cls] = [];
    edits.rosterAdds[cls].push(rosterRow);
    edits.demoUsers.push(demoUser);
    edits.rosterRemoves = (edits.rosterRemoves || []).filter((id) => Number(id) !== Number(rosterRow.id));
    saveSchoolEdits(edits);
    return { ok: true, student: rosterRow, login, password: pwd };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/students\/(\d+)$/);
  if (m && method === "DELETE") {
    const cls = decodeURIComponent(m[1]);
    const id = Number(m[2]);
    if (!canManageClassRoster(user, cls)) throw new Error("forbidden");
    const roster = classRoster(bundle, cls);
    if (!roster.some((row) => Number(row.id) === id)) throw new Error("student_not_found");
    const edits = loadSchoolEdits();
    if (edits.rosterAdds[cls]) {
      edits.rosterAdds[cls] = edits.rosterAdds[cls].filter((row) => Number(row.id) !== id);
    }
    edits.demoUsers = (edits.demoUsers || []).filter((u) => Number(u.id) !== id);
    if (!edits.rosterRemoves.includes(id)) edits.rosterRemoves.push(id);
    saveSchoolEdits(edits);
    return { ok: true, id };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/info$/);
  if (m && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    const cls = decodeURIComponent(m[1]);
    if (!bundle.classes.some((item) => item.class_name === cls)) throw new Error("class_not_found");
    const teacher =
      (bundle.demo_users || []).find((item) => item.role === "teacher" && item.class_name === cls) || null;
    return {
      class_name: cls,
      teacher: teacher
        ? {
            id: teacher.id,
            full_name: teacher.full_name,
            login: teacher.login,
            subject_code: teacher.subject_code || null,
            subject_title: teacher.subject_title || null,
          }
        : null,
      students: classRoster(bundle, cls).map((row) => ({ id: row.id, full_name: row.full_name })),
      subjects: bundle.subjects || [],
    };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/rename$/);
  if (m && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const from = decodeURIComponent(m[1]);
    const body = parseBody(options);
    const to = String(body.class_name || "").trim();
    if (!to) throw new Error("class_name_required");
    if (!bundle.classes.some((item) => item.class_name === from)) throw new Error("class_not_found");
    if (from !== to && bundle.classes.some((item) => item.class_name === to)) throw new Error("class_exists");
    if (from === to) return { ok: true, class_name: to };
    const edits = loadSchoolEdits();
    if (!Array.isArray(edits.classRenames)) edits.classRenames = [];
    edits.classRenames.push({ from, to });
    saveSchoolEdits(edits);
    return { ok: true, class_name: to };
  }

  if (path === "/api/portal/teachers" && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const body = parseBody(options);
    const full_name = String(body.full_name || "").trim();
    const login = String(body.login || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const class_name = String(body.class_name || "").trim();
    const subject_code = String(body.subject_code || "").trim();
    const subject = (bundle.subjects || []).find((item) => item.code === subject_code);
    if (!full_name || login.length < 3 || password.length < 4) throw new Error("teacher_invalid");
    if (!bundle.classes.some((item) => item.class_name === class_name)) throw new Error("class_not_found");
    if (!subject) throw new Error("subject_not_found");
    const edits = loadSchoolEdits();
    if (!edits.teacherPatches || typeof edits.teacherPatches !== "object") edits.teacherPatches = {};
    const taken = (bundle.demo_users || []).find((item) => String(item.login).toLowerCase() === login);
    if (taken && taken.role !== "teacher") throw new Error("login_taken");
    for (const teacher of bundle.demo_users || []) {
      if (teacher.role !== "teacher" || teacher.class_name !== class_name) continue;
      if (taken && Number(teacher.id) === Number(taken.id)) continue;
      edits.teacherPatches[String(teacher.id)] = {
        ...(edits.teacherPatches[String(teacher.id)] || {}),
        class_name: null,
      };
    }
    if (taken) {
      edits.teacherPatches[String(taken.id)] = {
        ...(edits.teacherPatches[String(taken.id)] || {}),
        full_name,
        class_name,
        subject_code: subject.code,
        subject_title: subject.title,
        password,
      };
      saveSchoolEdits(edits);
      return { ok: true, id: taken.id, login, class_name };
    }
    const id = nextStudentId(bundle, edits);
    edits.demoUsers.push({
      id,
      login,
      password,
      full_name,
      role: "teacher",
      class_name,
      subject_code: subject.code,
      subject_title: subject.title,
    });
    saveSchoolEdits(edits);
    return { ok: true, id, login, class_name };
  }

  m = path.match(/^\/api\/portal\/teachers\/(\d+)$/);
  if (m && method === "DELETE") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const id = Number(m[1]);
    const teacher = (bundle.demo_users || []).find((item) => item.role === "teacher" && Number(item.id) === id);
    if (!teacher) throw new Error("teacher_not_found");
    const edits = loadSchoolEdits();
    edits.demoUsers = (edits.demoUsers || []).filter((item) => Number(item.id) !== id);
    if (!Array.isArray(edits.teacherRemoves)) edits.teacherRemoves = [];
    if (!edits.teacherRemoves.includes(id)) edits.teacherRemoves.push(id);
    if (edits.teacherPatches) delete edits.teacherPatches[String(id)];
    saveSchoolEdits(edits);
    return { ok: true, id };
  }

  if (path === "/api/portal/exams" && method === "POST") {
    if (!user || user.role !== "teacher") throw new Error("teachers_only");
    const body = parseBody(options);
    const class_name = String(body.class_name || "").trim();
    let subject_code = String(body.subject_code || "").trim();
    if (user.role === "teacher" && user.subject_code) subject_code = user.subject_code;
    const title = String(body.title || "").trim();
    const subject = (bundle.subjects || []).find((item) => item.code === subject_code);
    if (!bundle.classes.some((item) => item.class_name === class_name)) throw new Error("class_not_found");
    if (!subject) throw new Error("subject_not_found");
    if (title.length < 3) throw new Error("exam_invalid");
    const questions = normalizeExamQuestions(body.questions || []).filter(
      (question) => question.text && question.options.filter(Boolean).length >= 2
    );
    if (!questions.length) throw new Error("exam_invalid");
    const edits = loadSchoolEdits();
    if (!Array.isArray(edits.examAdds)) edits.examAdds = [];
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const exam = {
      id: nextExamId(bundle, edits),
      class_name,
      subject_code,
      subject_title: subject.title,
      title,
      control_date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
      duration_minutes: 15,
      kind_label: "Тест",
      phase: "active",
      catalog_key: "todo",
      requires_teacher_publish: true,
      published_to_students: false,
      manual_publish: true,
      question_count: questions.length,
      questions,
      created_by: user.id,
      created_at: now.toISOString(),
      sent_at: null,
    };
    edits.examAdds.push(exam);
    saveSchoolEdits(edits);
    return { ok: true, exam: stripQuestions(exam) };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/send-students$/);
  if (m && method === "POST") {
    const examId = Number(m[1]);
    const ex = examById(bundle, examId);
    if (!ex) throw new Error("exam_not_found");
    if (!ex.manual_publish) throw new Error("exam_invalid");
    const edits = loadSchoolEdits();
    const row = (edits.examAdds || []).find((item) => Number(item.id) === examId);
    if (!row) throw new Error("exam_not_found");
    if (!user || user.role !== "teacher" || Number(row.created_by) !== Number(user.id)) {
      throw new Error("teachers_only");
    }
    row.published_to_students = true;
    row.sent_at = new Date().toISOString();
    saveSchoolEdits(edits);
    return { ok: true, id: examId, published_to_students: true, sent_at: row.sent_at };
  }

  if (path === "/api/portal/staff/tests" && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    let tests = staffTestsList(bundle, submissions);
    if (user.role === "teacher") {
      tests = tests.filter(
        (test) => Number(test.created_by) === Number(user.id) || test.class_name === user.class_name
      );
    }
    return { tests };
  }

  if (path === "/api/portal/my/subjects" && method === "GET") {
    if (!user || user.role !== "student") throw new Error("forbidden");
    const cls = user.class_name || "6Б";
    return { class_name: cls, subjects: bundle.subjects };
  }

  if (path === "/api/portal/my/completed-tests" && method === "GET") {
    if (!user || user.role !== "student") throw new Error("forbidden");
    const tests = [];
    for (const [key, sub] of Object.entries(submissions)) {
      if (!key.endsWith(`:${user.id}`)) continue;
      const examId = Number(key.split(":")[0]);
      const ex = examById(bundle, examId);
      if (!ex) continue;
      tests.push({
        exam_id: examId,
        title: ex.title,
        subject_title: ex.subject_title,
        subject_code: ex.subject_code,
        control_date: ex.control_date,
        score_percent: sub.score_percent,
        correct_count: sub.correct_count,
        question_total: sub.question_total,
        duration_label: sub.duration_label || "10:42",
        score_line: `${sub.correct_count ?? "—"}/${sub.question_total ?? "—"} · ${sub.score_percent}%`,
      });
    }
    tests.sort((a, b) => a.exam_id - b.exam_id);
    const overall_score_percent = tests.length
      ? Math.round(tests.reduce((acc, t) => acc + (Number(t.score_percent) || 0), 0) / tests.length)
      : null;
    return { tests, overall_score_percent };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/subjects$/);
  if (m && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    return { subjects: bundle.subjects, class_name: decodeURIComponent(m[1]) };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/subjects\/([^/]+)\/tests$/);
  if (m && method === "GET") {
    if (!user) throw new Error("not_authenticated");
    const cls = decodeURIComponent(m[1]);
    const code = m[2];
    const subject = bundle.subjects.find((s) => s.code === code);
    if (!subject) throw new Error("subject_not_found");
    const tests = testsForClassSubject(bundle, cls, code, submissions);
    if (user.role === "student") {
      const visible = [];
      for (const t of tests) {
        const published = isExamPublishedToStudents(bundle, t.id);
        if (!published) continue;
        const sub = getSubmission(submissions, t.id, user.id);
        const released = examResultsReleased(bundle, t.id, submissions);
        t.published_to_students = true;
        t.locked = false;
        t.submitted = sub !== null || t.catalog_key === "done";
        t.results_released = released;
        t.avg_score_percent = sub?.score_percent ?? null;
        t.submitted_count = t.submitted ? 1 : 0;
        t.class_total = 1;
        t.all_submitted = Boolean(t.submitted);
        if (!t.submitted) t.student_label = "К сдаче";
        else if (released) t.student_label = "Сдано";
        else t.student_label = "Сдано · ждём класс";
        visible.push(t);
      }
      return { subject_title: subject.title, tests: visible };
    }
    return { subject_title: subject.title, tests };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/students\/(\d+)\/submission$/);
  if (m && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    const examId = Number(m[1]);
    const studentId = Number(m[2]);
    const ex = examById(bundle, examId);
    if (!ex || !canViewExamAsStaff(user, ex)) throw new Error("forbidden");
    return buildStudentSubmissionPreview(bundle, examId, studentId, submissions);
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/admin$/);
  if (m && method === "GET") {
    if (!isPortalStaff(user)) throw new Error("forbidden");
    const examId = Number(m[1]);
    const storedExam = examById(bundle, examId);
    if (!storedExam || !canViewExamAsStaff(user, storedExam)) throw new Error("forbidden");
    const ex = examRecord(bundle, examId, user.role);
    if (!ex) throw new Error("exam_not_found");
    const draft = getExamDraft(examId);
    const progress = examClassProgress(bundle, examId, submissions);
    const teacherAnalyticsReleased = classBundleFullySubmitted(bundle, ex.class_name, submissions);
    const students = mapAdminRosterStudents(
      bundle,
      ex.class_name,
      examId,
      submissions,
      teacherAnalyticsReleased
    );
    const submitted = students.filter((s) => s.status === "submitted");
    const emptyStats = ex.questions.map(() => ({
      submitted_total: 0,
      failed_count: 0,
      failed_percent: 0,
      avg_time_label: null,
      question_exit_label: null,
    }));
    const analytics = teacherAnalyticsReleased
      ? buildAnalytics(bundle, examId, ex.questions, students, submissions)
      : { stats: emptyStats, problem: [] };
    const bundleCompleteCount = countBundleCompleteStudents(bundle, ex.class_name, submissions);
    return {
      exam: stripQuestions(ex),
      questions: ex.questions,
      students,
      problem_questions: analytics.problem,
      question_stats: analytics.stats,
      submitted_count: progress.submittedCount,
      class_total: progress.classTotal || students.length || 24,
      all_submitted: progress.allSubmitted,
      teacher_analytics_released: teacherAnalyticsReleased,
      bundle_complete_count: bundleCompleteCount,
      results_released: teacherAnalyticsReleased,
      teacher_report_sent: teacherReports.has(examId),
      exam_editor: {
        published: isExamPublishedToStudents(bundle, examId),
        has_draft: Boolean(draft?.questions?.length),
        updated_at: draft?.updated_at || null,
        duration_minutes: resolveExamDurationMinutes(bundle, examById(bundle, examId)),
      },
      exam_timing: getClassExamSchedule(ex.class_name, bundle),
    };
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/exam-timing$/);
  if (m) {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const cls = decodeURIComponent(m[1]);
    if (method === "GET") {
      return { class_name: cls, schedule: classBundleTiming(bundle, cls) };
    }
    if (method === "POST") {
      const body = parseBody(options);
      const total_minutes = Math.round(Number(body.total_minutes) || 90);
      saveClassExamSchedule(cls, { total_minutes });
      const schedule = classBundleTiming(bundle, cls);
      return { ok: true, class_name: cls, schedule };
    }
  }

  m = path.match(/^\/api\/portal\/class\/([^/]+)\/exam-bundle$/);
  if (m) {
    const cls = decodeURIComponent(m[1]);
    if (method === "GET") {
      if (!user) throw new Error("not_authenticated");
      const timing = classBundleTiming(bundle, cls);
      const exams = classExamBundleList(bundle, cls).map((ex) => ({
        id: ex.id,
        title: ex.title,
        subject_title: ex.subject_title,
        subject_code: ex.subject_code,
        question_count: ex.question_count,
        published: isExamPublishedToStudents(bundle, ex.id),
      }));
      return {
        class_name: cls,
        schedule: timing,
        exams,
        bundle_published: timing.bundle_published,
      };
    }
    if (method === "POST") {
      if (!canManageSchoolApi(user)) throw new Error("forbidden");
      const body = parseBody(options);
      if (body.action === "publish") {
        const schedule = publishClassExamBundle(bundle, cls);
        return { ok: true, published: true, schedule };
      }
      throw new Error("bad_request");
    }
  }

  if (path === "/api/portal/my/exam-bundle" && method === "GET") {
    if (!user || user.role !== "student") throw new Error("forbidden");
    const cls = user.class_name || "6Б";
    const timing = classBundleTiming(bundle, cls);
    const ordered = classExamBundleList(bundle, cls);
    const tests = ordered.map((ex) => {
      const sub = getSubmission(submissions, ex.id, user.id);
      const mins = resolveExamDurationMinutes(bundle, ex);
      return {
        exam_id: ex.id,
        title: ex.title,
        subject_title: ex.subject_title,
        duration_minutes: mins,
        submitted: sub !== null,
      };
    });
    const next_exam_id = nextBundleExamIdForStudent(bundle, cls, user.id, submissions);
    const all_submitted = ordered.length > 0 && tests.every((t) => t.submitted);
    const extra_tests = (bundle.exams || [])
      .filter(
        (ex) =>
          ex.class_name === cls &&
          ex.manual_publish &&
          isExamPublishedToStudents(bundle, ex.id)
      )
      .map((ex) => ({
        exam_id: ex.id,
        title: ex.title,
        subject_title: ex.subject_title,
        duration_minutes: resolveExamDurationMinutes(bundle, ex),
        submitted: getSubmission(submissions, ex.id, user.id) !== null,
      }));
    return {
      class_name: cls,
      published: timing.bundle_published,
      total_minutes: timing.total_minutes,
      minutes_per_test: timing.minutes_per_test,
      test_count: timing.test_count,
      tests,
      next_exam_id,
      all_submitted,
      extra_tests,
      practice_tests: PRACTICE_TESTS.map((test) => ({
        exam_id: test.id,
        title: test.title,
        subject_title: test.subject_title,
        duration_minutes: test.duration_minutes,
      })),
    };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/draft$/);
  if (m && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const examId = Number(m[1]);
    const base = examById(bundle, examId);
    if (!base) throw new Error("exam_not_found");
    const body = parseBody(options);
    const questions = normalizeExamQuestions(body.questions || base.questions);
    const drafts = loadExamDrafts();
    const prev = drafts[String(examId)] || {};
    drafts[String(examId)] = {
      questions,
      published: Boolean(prev.published),
      duration_minutes: prev.duration_minutes,
      updated_at: new Date().toISOString(),
    };
    saveExamDrafts(drafts);
    return {
      ok: true,
      published: drafts[String(examId)].published,
      question_count: questions.length,
    };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/publish$/);
  if (m && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const examId = Number(m[1]);
    const base = examById(bundle, examId);
    if (!base) throw new Error("exam_not_found");
    const body = parseBody(options);
    const drafts = loadExamDrafts();
    const prev = drafts[String(examId)] || {};
    const questions = normalizeExamQuestions(
      body.questions || prev.questions || base.questions
    );
    const schedule = getClassExamSchedule(base.class_name, bundle);
    const duration_minutes = resolveExamDurationMinutes(bundle, base);
    drafts[String(examId)] = {
      questions,
      published: true,
      duration_minutes,
      updated_at: new Date().toISOString(),
    };
    saveExamDrafts(drafts);
    return {
      ok: true,
      published: true,
      question_count: questions.length,
      duration_minutes,
      schedule,
    };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/preview$/);
  if (m && method === "GET") {
    if (!user) throw new Error("not_authenticated");
    const examId = Number(m[1]);
    const practice = practiceTestById(examId);
    if (practice) {
      if (user.role !== "student") throw new Error("forbidden");
      return {
        exam: {
          id: practice.id,
          title: practice.title,
          subject_title: practice.subject_title,
          duration_minutes: practice.duration_minutes,
          question_count: practice.questions.length,
          catalog_key: "todo",
          practice: true,
        },
        questions: practice.questions,
        show_answers: false,
        submitted: false,
        results_released: false,
        awaiting_release: false,
      };
    }
    const ex = examRecord(bundle, examId, user.role);
    if (!ex) throw new Error("exam_not_found");
    if (user.role === "admin" || user.role === "teacher") {
      if (!canViewExamAsStaff(user, examById(bundle, examId))) throw new Error("forbidden");
      return {
        exam: stripQuestions(ex),
        questions: ex.questions,
        show_answers: true,
        submitted: false,
        score_percent: null,
      };
    }
    if (!isExamPublishedToStudents(bundle, examId)) {
      throw new Error("exam_not_published");
    }
    const sub = getSubmission(submissions, examId, user.id);
    const progress = examClassProgress(bundle, examId, submissions);
    const turnedIn = sub !== null || ex.catalog_key === "done";
    const showResults = turnedIn;
    const score = showResults
      ? sub
        ? sub.score_percent
        : ex.catalog_key === "done"
          ? 88
          : null
      : null;
    return {
      exam: stripQuestions(ex),
      questions: ex.questions,
      show_answers: false,
      submitted: turnedIn,
      results_released: showResults,
      awaiting_release: false,
      submitted_count: progress.submittedCount,
      class_total: progress.classTotal,
      score_percent: score,
      duration_label: showResults ? sub?.duration_label || null : null,
      exit_intent_count: showResults ? sub?.exit_intent_count || 0 : 0,
      exit_intent_label: showResults ? sub?.exit_intent_label || null : null,
      feedback: showResults ? sub?.feedback || null : null,
    };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/submit$/);
  if (m && method === "POST") {
    if (!user || user.role !== "student") throw new Error("forbidden");
    const examId = Number(m[1]);
    if (!isExamPublishedToStudents(bundle, examId)) throw new Error("exam_not_published");
    const ex = examRecord(bundle, examId, user.role);
    if (!ex) throw new Error("exam_not_found");
    const body = parseBody(options);
    const answers = body.answers || {};
    let correct = 0;
    const feedback = ex.questions.map((q, i) => {
      const selected = Number(answers[String(i)] ?? 0);
      const ok = selected === q.correct_index;
      if (ok) correct++;
      return { selected_index: selected, is_correct: ok };
    });
    const total = ex.questions.length || 1;
    const score = Math.round((100 * correct) / total);
    const questionTimes = Array.isArray(body.question_times)
      ? body.question_times.map((n) => Math.max(0, Math.round(Number(n) || 0)))
      : [];
    const questionAwaySeconds = Array.isArray(body.question_away_seconds)
      ? body.question_away_seconds.map((n) => Math.max(0, Math.round(Number(n) || 0)))
      : [];
    const questionExitCounts = Array.isArray(body.question_exit_counts)
      ? body.question_exit_counts.map((n) => Math.max(0, Math.round(Number(n) || 0)))
      : [];
    while (questionTimes.length < total) questionTimes.push(0);
    while (questionAwaySeconds.length < total) questionAwaySeconds.push(0);
    while (questionExitCounts.length < total) questionExitCounts.push(0);
    const durationSec = questionTimes.reduce((a, b) => a + b, 0);
    const durationLabel = durationSec > 0 ? formatSecondsLabel(durationSec) : "10:42";
    const map = loadSubmissions();
    if (getSubmission(map, examId, user.id)) throw new Error("already_submitted");
    map[submissionKey(examId, user.id)] = {
      score_percent: score,
      correct_count: correct,
      question_total: total,
      answers,
      question_times: questionTimes.slice(0, total),
      question_away_seconds: questionAwaySeconds.slice(0, total),
      question_exit_counts: questionExitCounts.slice(0, total),
      exit_intent_count: Number(body.exit_intent_count || 0),
      duration_label: durationLabel,
      feedback,
    };
    saveSubmissions(map);
    const progress = examClassProgress(bundle, examId, map);
    return {
      submitted: true,
      results_released: true,
      awaiting_release: false,
      submitted_count: progress.submittedCount,
      class_total: progress.classTotal,
      score_percent: score,
      correct_count: correct,
      question_total: total,
      duration_label: durationLabel,
    };
  }

  /** Сброс сдач — только для ручной проверки (консоль / тесты), не для UI. */
  if (path === "/api/portal/my/reset-exam-bundle" && method === "POST") {
    if (!user || user.role !== "student") throw new Error("forbidden");
    const cls = user.class_name || "6Б";
    const bundleExams = classExamBundleList(bundle, cls);
    const { cleared, exam_ids } = clearSubmissionsForUser(user.id);
    return {
      ok: true,
      cleared,
      exam_ids: exam_ids.length ? exam_ids : bundleExams.map((ex) => ex.id),
      test_count: bundleExams.length,
    };
  }

  if (path === "/api/portal/admin/reset-student-progress" && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const body = parseBody(options);
    const login = String(body.login || "").trim().toLowerCase();
    const users = bundle.demo_users || [];
    const target = users.find((u) => u.login.toLowerCase() === login);
    if (!target || target.role !== "student" || !target.class_name) throw new Error("bad_request");
    const exams = classExamBundleList(bundle, target.class_name);
    const { cleared, exam_ids } = clearSubmissionsForUser(target.id);
    return {
      ok: true,
      login: target.login,
      full_name: target.full_name,
      cleared,
      exam_count: exams.length,
      exam_ids: exam_ids.length ? exam_ids : exams.map((ex) => ex.id),
      same_browser_only: true,
    };
  }

  m = path.match(/^\/api\/portal\/exams\/(\d+)\/send-teacher-report$/);
  if (m && method === "POST") {
    if (!canManageSchoolApi(user)) throw new Error("forbidden");
    const examId = Number(m[1]);
    const admin = await dataApi(`/api/portal/exams/${examId}/admin`, { method: "GET" });
    if (!admin.teacher_analytics_released) throw new Error("not_all_submitted");
    const reports = loadTeacherReports();
    reports.add(examId);
    saveTeacherReports(reports);
    return { status: "sent" };
  }

  throw new Error("not_found");
}
