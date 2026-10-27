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

function mergeUserListsByLogin(base, extra) {
  const byLogin = new Map();
  for (const user of Array.isArray(base) ? base : []) {
    const login = String(user.login || "").toLowerCase();
    if (login) byLogin.set(login, user);
  }
  for (const user of Array.isArray(extra) ? extra : []) {
    const login = String(user.login || "").toLowerCase();
    if (login && !byLogin.has(login)) byLogin.set(login, user);
  }
  return [...byLogin.values()];
}

function writeRegistry(list) {
  registry = list;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  const snapshot = JSON.stringify(list);
  registrySave = registrySave.catch(() => {}).then(async () => {
    const { isGitHubPagesSite } = await import("./portal-github-store.js");
    if (isGitHubPagesSite()) {
      const { pushUsersToGitHub } = await import("./portal-users-sync.js");
      const { resolveSyncToken } = await import("./portal-submissions-sync.js");
      const token = await resolveSyncToken();
      if (!token) return;
      await pushUsersToGitHub(token, list, { commitMessage: "Portal user registry update" });
      return;
    }
    const res = await fetch("/api/site/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    });
    if (!res.ok) throw new Error("save_failed");
  });
  return registrySave;
}

export async function loadPublicUsers() {
  let fromFile = null;
  const { isGitHubPagesSite, isLocalPortalServer } = await import("./portal-github-store.js");
  if (isGitHubPagesSite()) {
    const { fetchRemoteUsersList } = await import("./portal-users-sync.js");
    fromFile = await fetchRemoteUsersList();
  } else if (isLocalPortalServer()) {
    try {
      const { fetchPlatformStoreCached } = await import("./portal-platform-store.js");
      const store = await fetchPlatformStoreCached();
      if (store?.users?.length) fromFile = store.users;
    } catch {
      fromFile = null;
    }
  }
  if (!Array.isArray(fromFile)) {
    try {
      const res = await fetch(`data/users.json?v=${Date.now()}`, { cache: "no-cache" });
      if (res.ok) fromFile = await res.json();
    } catch {
      fromFile = null;
    }
  }
  if (Array.isArray(fromFile)) {
    const merged = mergeUserListsByLogin(fromFile, readLocal());
    registry = merged;
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    const remoteLogins = new Set(fromFile.map((user) => String(user.login || "").toLowerCase()));
    const hasLocalOnly = merged.some((user) => !remoteLogins.has(String(user.login || "").toLowerCase()));
    if (hasLocalOnly) await writeRegistry(registry);
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
