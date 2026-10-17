import { describe, expect, it } from "vitest";
import { computeScorePercent, formatScorePercent } from "../server/lib/scoring";

describe("scoring", () => {
  it("computes percentage", () => {
    expect(computeScorePercent(8, 10)).toBe(80);
    expect(computeScorePercent(0, 10)).toBe(0);
    expect(computeScorePercent(10, 10)).toBe(100);
  });

  it("formats to one decimal", () => {
    expect(formatScorePercent(66.666)).toBe(66.7);
  });
});
