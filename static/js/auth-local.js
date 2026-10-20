/** Локальная регистрация (демо до БД и Telegram), привязка к коду школы. */

const REGISTRY_KEY = "lavh_public_users_v1";

function readRegistry() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return data;
    return [];
  } catch {
    return [];
  }
}

function normalizeSchoolCode(schoolCode) {
  return String(schoolCode || "").trim().toLowerCase();
}

function writeRegistry(list) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
}

export function findRegisteredUser(schoolCode, login, password) {
  const school = normalizeSchoolCode(schoolCode);
  const l = String(login || "").trim().toLowerCase();
  const p = String(password || "");
  return (
    readRegistry().find(
      (u) =>
        normalizeSchoolCode(u.school_code) === school &&
        u.login.toLowerCase() === l &&
        u.password === p
    ) || null
  );
}

export function getRegisteredByLogin(schoolCode, login) {
  const school = normalizeSchoolCode(schoolCode);
  const l = String(login || "").trim().toLowerCase();
  return (
    readRegistry().find(
      (u) => normalizeSchoolCode(u.school_code) === school && u.login.toLowerCase() === l
    ) || null
  );
}

export function registerPublicUser({ schoolCode, login, password, fullName, telegram }) {
  const school = normalizeSchoolCode(schoolCode);
  if (!school) throw new Error("school_required");
  const loginNorm = String(login || "").trim().toLowerCase();
  if (!loginNorm || loginNorm.length < 3) throw new Error("login_short");
  if (String(password || "").length < 6) throw new Error("password_short");
  const list = readRegistry();
  if (
    list.some(
      (u) => normalizeSchoolCode(u.school_code) === school && u.login.toLowerCase() === loginNorm
    )
  ) {
    throw new Error("login_taken");
  }
  const user = {
    id: 900000 + list.length + 1,
    school_code: school,
    login: loginNorm,
    password: String(password),
    full_name: String(fullName || loginNorm).trim(),
    telegram: String(telegram || "").trim(),
    role: "student",
    kind: "public",
    created_at: new Date().toISOString(),
  };
  list.push(user);
  writeRegistry(list);
  return user;
}
