/** Учётки пользователей. Источник — data/users.json, копия в браузере на время сессии. */

const REGISTRY_KEY = "lavh_public_users_v1";
const PUBLIC_ROLES = new Set(["student", "teacher", "admin"]);

let registry = null;
let registrySave = Promise.resolve();

function readLocal() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function readRegistry() {
  if (!registry) registry = readLocal();
  return registry;
}

function normalizeSchoolCode(schoolCode) {
  return String(schoolCode || "").trim().toLowerCase();
}

function writeRegistry(list) {
  registry = list;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  const snapshot = JSON.stringify(list);
  registrySave = registrySave.catch(() => {}).then(() =>
    fetch("/api/site/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    }).then((res) => {
      if (!res.ok) throw new Error("save_failed");
    })
  );
  return registrySave;
}

export async function loadPublicUsers() {
  let fromFile = null;
  try {
    const res = await fetch(`data/users.json?v=${Date.now()}`, { cache: "no-cache" });
    if (res.ok) fromFile = await res.json();
  } catch {
    fromFile = null;
  }
  if (Array.isArray(fromFile)) {
    const logins = new Set(fromFile.map((user) => String(user.login || "").toLowerCase()));
    let added = 0;
    for (const user of readLocal()) {
      const login = String(user.login || "").toLowerCase();
      if (!login || logins.has(login)) continue;
      fromFile.push(user);
      logins.add(login);
      added += 1;
    }
    registry = fromFile;
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    if (added) await writeRegistry(registry);
    return registry;
  }
  registry = readLocal();
  return registry;
}

export function persistPublicUsers() {
  return registrySave;
}

export function findRegisteredUserGlobal(login, password) {
  const l = String(login || "").trim().toLowerCase();
  const p = String(password || "");
  return readRegistry().find((u) => u.login.toLowerCase() === l && u.password === p) || null;
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

export function listUnassignedUsers() {
  return readRegistry().filter((u) => !normalizeSchoolCode(u.school_code));
}

export function listUsersForSchool(schoolCode) {
  const school = normalizeSchoolCode(schoolCode);
  if (!school) return [];
  return readRegistry().filter((u) => normalizeSchoolCode(u.school_code) === school);
}

export function assignRegisteredUserSchool(login, schoolCode, extra = {}) {
  const school = normalizeSchoolCode(schoolCode);
  const loginNorm = String(login || "").trim().toLowerCase();
  if (!school) throw new Error("school_required");
  if (!loginNorm) throw new Error("user_not_found");
  const list = readRegistry();
  const user = list.find(
    (u) => u.login.toLowerCase() === loginNorm && !normalizeSchoolCode(u.school_code)
  );
  if (!user) throw new Error("user_not_found");
  user.school_code = school;
  const role = String(extra.role || "").trim();
  if (PUBLIC_ROLES.has(role)) user.role = role;
  const fullName = String(extra.fullName || "").trim();
  if (fullName) user.full_name = fullName;
  const className = String(extra.className || "").trim();
  if (user.role === "student") {
    if (className) user.class_name = className;
  } else {
    user.class_name = null;
  }
  writeRegistry(list);
  return user;
}

export function unassignRegisteredUser(login) {
  const loginNorm = String(login || "").trim().toLowerCase();
  const list = readRegistry();
  const user = list.find((u) => u.login.toLowerCase() === loginNorm && normalizeSchoolCode(u.school_code));
  if (!user) throw new Error("user_not_found");
  user.school_code = null;
  user.class_name = null;
  writeRegistry(list);
  return user;
}

export function registerPublicUser({ login, password, fullName, telegram, role }) {
  const roleNorm = role == null || role === "" ? "student" : String(role);
  if (!PUBLIC_ROLES.has(roleNorm)) throw new Error("role_invalid");
  const loginNorm = String(login || "").trim().toLowerCase();
  if (!loginNorm || loginNorm.length < 3) throw new Error("login_short");
  if (String(password || "").length < 6) throw new Error("password_short");
  const list = readRegistry();
  if (list.some((u) => u.login.toLowerCase() === loginNorm)) throw new Error("login_taken");
  const nextId = list.reduce((max, user) => Math.max(max, Number(user.id) || 0), 900000) + 1;
  const user = {
    id: nextId,
    school_code: null,
    login: loginNorm,
    password: String(password),
    full_name: String(fullName || loginNorm).trim(),
    telegram: String(telegram || "").trim(),
    role: roleNorm,
    kind: "public",
    class_name: null,
    created_at: new Date().toISOString(),
  };
  list.push(user);
  writeRegistry(list);
  return user;
}
