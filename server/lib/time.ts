export function serverNowIso() {
  return new Date().toISOString();
}

export function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function minutesBetween(startIso: string, endIso: string) {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000;
}

export function remainingSeconds(deadlineIso: string, now = new Date()) {
  return Math.max(0, Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / 1000));
}
