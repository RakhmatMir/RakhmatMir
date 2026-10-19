/** Локальная регистрация (демо до БД и Telegram). */

const REGISTRY_KEY = "lavh_public_users_v1";

function readRegistry() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeRegistry(list) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
}

export function findRegisteredUser(login, password) {
  const l = String(login || "").trim().toLowerCase();
  const p = String(password || "");
  return readRegistry().find((u) => u.login.toLowerCase() === l && u.password === p) || null;
}

export function getRegisteredByLogin(login) {
  const l = String(login || "").trim().toLowerCase();
  return readRegistry().find((u) => u.login.toLowerCase() === l) || null;
}

export function registerPublicUser({ login, password, fullName, telegram }) {
  const loginNorm = String(login || "").trim().toLowerCase();
  if (!loginNorm || loginNorm.length < 3) throw new Error("login_short");
  if (String(password || "").length < 6) throw new Error("password_short");
  const list = readRegistry();
  if (list.some((u) => u.login.toLowerCase() === loginNorm)) throw new Error("login_taken");
  const user = {
    id: 900000 + list.length + 1,
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
