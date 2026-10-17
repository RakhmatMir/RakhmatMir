import bcrypt from "bcryptjs";
import { and, desc, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { ApiError } from "../../shared/errors";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { addMinutes, serverNowIso } from "./time";

const SESSION_COOKIE = "fs_session";
const SESSION_HOURS = 12;

export function createCsrfToken() {
  return randomBytes(24).toString("hex");
}

export async function createSession(userId: number) {
  const db = getDb();
  const id = randomBytes(32).toString("hex");
  const csrf = createCsrfToken();
  const expiresAt = addMinutes(serverNowIso(), SESSION_HOURS * 60);
  await db.insert(s.authSessions).values({ id, userId, csrfToken: csrf, expiresAt });
  return { id, csrf, expiresAt };
}

export async function destroySession(sessionId: string | undefined) {
  if (!sessionId) return;
  const db = getDb();
  await db.delete(s.authSessions).where(eq(s.authSessions.id, sessionId));
}

export async function getSessionUser(sessionId: string | undefined) {
  if (!sessionId) return null;
  const db = getDb();
  const now = serverNowIso();
  const rows = await db
    .select({
      sessionId: s.authSessions.id,
      csrfToken: s.authSessions.csrfToken,
      user: s.users,
    })
    .from(s.authSessions)
    .innerJoin(s.users, eq(s.authSessions.userId, s.users.id))
    .where(and(eq(s.authSessions.id, sessionId), gt(s.authSessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export function setSessionCookie(c: Context, sessionId: string, expiresAt: string) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function readSessionCookie(c: Context) {
  return getCookie(c, SESSION_COOKIE);
}

export async function requireUser(c: Context) {
  const sessionId = readSessionCookie(c);
  const session = await getSessionUser(sessionId);
  if (!session) throw new ApiError("UNAUTHORIZED", "Требуется вход", 401);
  return session;
}

export async function requireAdmin(c: Context) {
  const session = await requireUser(c);
  if (session.user.role !== "admin") {
    throw new ApiError("FORBIDDEN", "Только для администратора", 403);
  }
  return session;
}

export async function requireStudent(c: Context) {
  const session = await requireUser(c);
  if (session.user.role !== "student") {
    throw new ApiError("FORBIDDEN", "Только для ученика", 403);
  }
  return session;
}

export function assertCsrf(c: Context, session: { csrfToken: string }) {
  const token = c.req.header("x-csrf-token");
  if (!token || token !== session.csrfToken) {
    throw new ApiError("FORBIDDEN", "Неверный CSRF-токен", 403);
  }
}

export async function checkLoginRateLimit(login: string) {
  const db = getDb();
  const since = addMinutes(serverNowIso(), -15);
  const recent = await db
    .select()
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.login, login), gt(s.loginAttempts.createdAt, since)))
    .orderBy(desc(s.loginAttempts.createdAt));
  const failures = recent.filter((r) => !r.success).length;
  if (failures >= 8) {
    throw new ApiError("RATE_LIMIT", "Слишком много попыток входа. Попробуйте позже.", 429);
  }
}

export async function verifyLogin(login: string, password: string, ip: string) {
  await checkLoginRateLimit(login);
  const db = getDb();
  const user = await db.select().from(s.users).where(eq(s.users.login, login)).limit(1);
  const found = user[0];
  const ok = found ? bcrypt.compareSync(password, found.passwordHash) : false;
  await db.insert(s.loginAttempts).values({ login, ip, success: ok });
  if (!ok) {
    throw new ApiError("UNAUTHORIZED", "Неверный логин или пароль", 401);
  }
  return found;
}
