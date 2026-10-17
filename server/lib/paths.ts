import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_JSON_LOCATIONS, sourceJsonSchema } from "../../shared/source-json";

export function resolveSourceJsonPath(): string | null {
  for (const rel of SOURCE_JSON_LOCATIONS) {
    const full = join(process.cwd(), rel);
    if (existsSync(full)) return full;
  }
  const dir = join(process.cwd(), "source-materials");
  if (existsSync(dir)) {
    const jsonFiles = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (jsonFiles.length === 1) {
      return join(dir, jsonFiles[0]!);
    }
  }
  return null;
}

export function loadSourceJson() {
  const path = resolveSourceJsonPath();
  if (!path) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return sourceJsonSchema.parse(raw);
}

export function copyOriginalJsonToPrivate() {
  const path = resolveSourceJsonPath();
  if (!path) return;
  const targetDir = join(process.cwd(), "data/private");
  const target = join(targetDir, "foundation-school.original.json");
  if (!existsSync(target)) {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(path, target);
  }
}
