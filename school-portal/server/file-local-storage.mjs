import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "runtime", "local_storage.json");

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/** Minimal localStorage for portal-data.js on the server. */
export function createFileLocalStorage() {
  let cache = readStore();
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    },
    setItem(key, value) {
      cache[key] = String(value);
      writeStore(cache);
    },
    removeItem(key) {
      delete cache[key];
      writeStore(cache);
    },
    clear() {
      cache = {};
      writeStore(cache);
    },
  };
}
