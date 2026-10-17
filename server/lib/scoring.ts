export function computeScorePercent(correct: number, total: number) {
  if (total <= 0) return null;
  return (correct / total) * 100;
}

export function formatScorePercent(value: number | null) {
  if (value == null) return null;
  return Math.round(value * 10) / 10;
}
