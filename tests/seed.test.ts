import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sourceJsonSchema } from "../shared/source-json";

describe("source JSON fixture", () => {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "source-materials/foundation-school.json"), "utf8"),
  );
  const data = sourceJsonSchema.parse(raw);

  it("has 18 roster students including 402", () => {
    const roster = data.rosters["6Б"] ?? [];
    expect(roster).toHaveLength(18);
    expect(roster.some((s) => s.id === 402)).toBe(true);
  });

  it("has 19 demo users and exam question counts", () => {
    expect(data.demo_users).toHaveLength(19);
    expect(data.exams.find((e) => e.id === 101)?.questions).toHaveLength(16);
    expect(data.exams.find((e) => e.id === 103)?.questions).toHaveLength(15);
    expect(data.exams.find((e) => e.id === 102)?.questions).toHaveLength(10);
  });

  it("marks damaged english question text", () => {
    const english = data.exams.find((e) => e.id === 102)!;
    expect(english.questions[7]?.text).toContain("pstudent");
  });
});
