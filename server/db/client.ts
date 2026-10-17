import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? "./data/app.db";

let sqlite: Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSqlite() {
  if (!sqlite) {
    sqlite = new Database(dbPath, { create: true });
    sqlite.exec("PRAGMA foreign_keys = ON;");
  }
  return sqlite;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlite(), { schema });
  }
  return dbInstance;
}

export function isDatabaseSeeded(): boolean {
  const row = getSqlite()
    .query("SELECT COUNT(*) as c FROM users")
    .get() as { c: number };
  return row.c > 0;
}
